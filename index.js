const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const fs = require('fs');
const path = require('path');

// =====================================================
// CONFIG
// =====================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OWNER_ID = process.env.OWNER_ID;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not set');
}

if (!OWNER_ID) {
  throw new Error('OWNER_ID is not set');
}

// =====================================================
// BOT
// =====================================================

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

let botUserId = null;
let botUsername = null;

let botAwake = true;

// true = AI
// false = FREE
let aiEnabled = false;

// =====================================================
// FREE DATABASE
// =====================================================

let answers = {};
let stickerAnswers = {};

const lastUsedAnswer = {};

// =====================================================
// TEXT NORMALIZATION
// =====================================================

function normalizeText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/إأآ/g, 'ا')
    .replace(/[‌]/g, '')
    .replace(/[!?؟،,.؛:()[\]{}"'`~@#$%^&*_+=|\\/<>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =====================================================
// ANSWER NORMALIZER
// =====================================================

function normalizeAnswers(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }

  if (Array.isArray(value)) {
    return value
      .filter(v => typeof v === 'string' && v.trim())
      .map(v => v.trim());
  }

  return [];
}

// =====================================================
// ADD ANSWER
// =====================================================

function addAnswer(key, value) {
  const cleanKey = normalizeText(key);

  if (!cleanKey) {
    return;
  }

  const list = normalizeAnswers(value);

  if (!list.length) {
    return;
  }

  if (!answers[cleanKey]) {
    answers[cleanKey] = [];
  }

  for (const answer of list) {
    if (!answers[cleanKey].includes(answer)) {
      answers[cleanKey].push(answer);
    }
  }
}

// =====================================================
// ADD STICKER
// =====================================================

function addSticker(key, value) {
  const cleanKey = normalizeText(key);

  if (!cleanKey) {
    return;
  }

  const list = Array.isArray(value)
    ? value.filter(v => typeof v === 'string' && v.trim())
    : typeof value === 'string'
      ? [value]
      : [];

  if (!list.length) {
    return;
  }

  if (!stickerAnswers[cleanKey]) {
    stickerAnswers[cleanKey] = [];
  }

  for (const sticker of list) {
    if (!stickerAnswers[cleanKey].includes(sticker)) {
      stickerAnswers[cleanKey].push(sticker);
    }
  }
}

// =====================================================
// LOAD JSON FILES
// =====================================================

function loadDatabase() {
  answers = {};
  stickerAnswers = {};

  const files = fs
    .readdirSync('.')
    .filter(file =>
      file.startsWith('answers') &&
      file.endsWith('.json')
    )
    .sort();

  console.log(`Found ${files.length} answer files.`);

  for (const file of files) {
    try {
      const fullPath = path.join('.', file);

      const data = JSON.parse(
        fs.readFileSync(fullPath, 'utf8')
      );

      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data)
      ) {
        console.warn(`${file}: invalid JSON structure`);
        continue;
      }

      // Special sticker file
      if (
        file.includes('sticker')
      ) {
        for (const [key, value] of Object.entries(data)) {
          addSticker(key, value);
        }

        console.log(`${file}: sticker database loaded`);
        continue;
      }

      // Normal answer files
      for (const [key, value] of Object.entries(data)) {
        addAnswer(key, value);
      }

      console.log(`${file}: loaded`);

    } catch (error) {
      console.error(
        `${file}: ${error.message}`
      );
    }
  }

  const totalKeys = Object.keys(answers).length;

  const totalAnswers = Object.values(answers)
    .reduce((sum, list) => sum + list.length, 0);

  const totalStickerKeys =
    Object.keys(stickerAnswers).length;

  console.log(
    `FREE database: ${totalKeys} keys, ${totalAnswers} answers`
  );

  console.log(
    `Sticker database: ${totalStickerKeys} keys`
  );
}

loadDatabase();

// =====================================================
// RANDOM ANSWER
// =====================================================

function randomItem(list) {
  if (!Array.isArray(list) || !list.length) {
    return null;
  }

  return list[
    Math.floor(Math.random() * list.length)
  ];
}

// =====================================================
// SMART ANSWER SEARCH
// =====================================================

function findFreeAnswer(text) {
  const cleanText = normalizeText(text);

  if (!cleanText) {
    return null;
  }

  // 1. Exact match
  if (answers[cleanText]) {
    return randomItem(answers[cleanText]);
  }

  // 2. Search if database key exists inside message
  const keys = Object.keys(answers);

  const matchingKeys = keys.filter(key => {
    return (
      cleanText.includes(key) ||
      key.includes(cleanText)
    );
  });

  if (matchingKeys.length) {
    matchingKeys.sort(
      (a, b) => b.length - a.length
    );

    const bestKey = matchingKeys[0];

    return randomItem(
      answers[bestKey]
    );
  }

  // 3. Word overlap
  const userWords = cleanText.split(' ');

  let bestKey = null;
  let bestScore = 0;

  for (const key of keys) {
    const keyWords = key.split(' ');

    let score = 0;

    for (const word of userWords) {
      if (
        word.length >= 2 &&
        keyWords.includes(word)
      ) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  if (bestKey && bestScore > 0) {
    return randomItem(
      answers[bestKey]
    );
  }

  return null;
}

// =====================================================
// STICKER SEARCH
// =====================================================

function findSticker(text) {
  const cleanText = normalizeText(text);

  if (!cleanText) {
    return null;
  }

  if (stickerAnswers[cleanText]) {
    return randomItem(
      stickerAnswers[cleanText]
    );
  }

  const keys = Object.keys(stickerAnswers);

  const match = keys
    .filter(key =>
      cleanText.includes(key) ||
      key.includes(cleanText)
    )
    .sort(
      (a, b) => b.length - a.length
    )[0];

  if (!match) {
    return null;
  }

  return randomItem(
    stickerAnswers[match]
  );
}

// =====================================================
// COMMAND MATCH
// =====================================================

function matchesCommand(text, commands) {
  const clean = normalizeText(text);

  return commands.some(
    command =>
      normalizeText(command) === clean
  );
}

// =====================================================
// OWNER
// =====================================================

function isOwner(msg) {
  return String(msg.from.id) === String(OWNER_ID);
}

// =====================================================
// SLEEP / WAKE
// =====================================================

const sleepCommands = [
  'خاموش شو',
  'بخواب',
  'خاموش',
  '/off'
];

const wakeCommands = [
  'زنده شو',
  'بیدار شو',
  'فعال شو',
  'روشن شو',
  'بیدار',
  '/on'
];

// =====================================================
// AI COMMANDS
// =====================================================

const aiOnCommands = [
  'هوش مصنوعی روشن',
  'هوش مصنوعی فعال',
  'ai روشن',
  '/ai_on'
];

const aiOffCommands = [
  'هوش مصنوعی خاموش',
  'هوش مصنوعی غیرفعال',
  'ai خاموش',
  '/ai_off'
];

// =====================================================
// AI
// =====================================================

async function askAI(userMessage, userName) {
  if (!OPENROUTER_API_KEY) {
    console.error(
      'OPENROUTER_API_KEY is not set'
    );

    return null;
  }

  try {
    const prompt = `
تو یک ربات فارسی‌زبان دوستانه هستی.

نام کاربر:
${userName}

پیام کاربر:
${userMessage}

کوتاه، طبیعی، دوستانه و مفید جواب بده.
`;

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://telegram-bot-1-0mtg.onrender.com',
          'X-Title': 'Telegram Bot'
        },

        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',

          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],

          temperature: 0.8,
          max_tokens: 500
        })
      }
    );

    if (!response.ok) {
      console.error(
        'OpenRouter:',
        response.status,
        await response.text()
      );

      return null;
    }

    const data =
      await response.json();

    const answer =
      data.choices?.[0]?.message?.content;

    if (
      !answer ||
      typeof answer !== 'string'
    ) {
      return null;
    }

    return answer.trim();

  } catch (error) {
    console.error(
      'AI error:',
      error.message
    );

    return null;
  }
}

// =====================================================
// BOT INFO
// =====================================================

bot.getMe()
  .then(me => {
    botUserId = me.id;
    botUsername = me.username;

    console.log(
      `Bot: @${botUsername}`
    );

    console.log(
      `Mode: ${aiEnabled ? 'AI' : 'FREE'}`
    );

    console.log(
      `Awake: ${botAwake}`
    );
  })
  .catch(error => {
    console.error(
      'getMe error:',
      error.message
    );
  });

// =====================================================
// POLLING ERROR
// =====================================================

bot.on(
  'polling_error',
  error => {
    console.error(
      'Polling error:',
      error.code || '',
      error.message || error
    );
  }
);

// =====================================================
// MESSAGE HANDLER
// =====================================================

bot.on(
  'message',
  async msg => {

    try {

      if (
        !msg.text ||
        !msg.from
      ) {
        return;
      }

      const text =
        msg.text.trim();

      const chatId =
        msg.chat.id;

      const userName =
        msg.from.first_name ||
        msg.from.username ||
        'کاربر';

      // =================================================
      // SLEEP
      // =================================================

      if (
        matchesCommand(
          text,
          sleepCommands
        )
      ) {

        if (!isOwner(msg)) {
          return;
        }

        botAwake = false;

        await bot.sendMessage(
          chatId,
          '🛑 ربات وارد حالت سکوت شد.'
        );

        return;
      }

      // =================================================
      // WAKE
      // =================================================

      if (
        matchesCommand(
          text,
          wakeCommands
        )
      ) {

        if (!isOwner(msg)) {
          return;
        }

        botAwake = true;

        await bot.sendMessage(
          chatId,
          '🟢 ربات دوباره فعال شد! ✨'
        );

        return;
      }

      // =================================================
      // AI ON
      // =================================================

      if (
        matchesCommand(
          text,
          aiOnCommands
        )
      ) {

        if (!isOwner(msg)) {
          return;
        }

        aiEnabled = true;

        await bot.sendMessage(
          chatId,
          '🧠 هوش مصنوعی روشن شد.'
        );

        return;
      }

      // =================================================
      // AI OFF
      // =================================================

      if (
        matchesCommand(
          text,
          aiOffCommands
        )
      ) {

        if (!isOwner(msg)) {
          return;
        }

        aiEnabled = false;

        await bot.sendMessage(
          chatId,
          '📚 حالت رایگان فعال شد.'
        );

        return;
      }

      // =================================================
      // SLEEPING
      // =================================================

      if (!botAwake) {
        return;
      }

      // =================================================
      // GROUP
      // =================================================

      if (
        msg.chat.type !== 'private'
      ) {

        const mentioned =
          botUsername &&
          text
            .toLowerCase()
            .includes(
              `@${botUsername.toLowerCase()}`
            );

        const repliedToBot =
          msg.reply_to_message &&
          msg.reply_to_message.from &&
          botUserId &&
          msg.reply_to_message.from.id ===
            botUserId;

        if (
          !mentioned &&
          !repliedToBot
        ) {
          return;
        }
      }

      // =================================================
      // REMOVE BOT MENTION
      // =================================================

      let userMessage = text;

      if (botUsername) {
        userMessage =
          userMessage
            .replace(
              new RegExp(
                `@${botUsername}`,
                'ig'
              ),
              ''
            )
            .trim();
      }

      if (!userMessage) {
        userMessage = 'سلام';
      }

      console.log(
        `${aiEnabled ? 'AI' : 'FREE'} | ${userName} | ${userMessage}`
      );

      // =================================================
      // AI MODE
      // =================================================

      if (aiEnabled) {

        await bot.sendChatAction(
          chatId,
          'typing'
        );

        const aiAnswer =
          await askAI(
            userMessage,
            userName
          );

        if (aiAnswer) {

          await bot.sendMessage(
            chatId,
            aiAnswer,
            msg.chat.type !== 'private'
              ? {
                  reply_to_message_id:
                    msg.message_id
                }
              : {}
          );

          return;
        }

        await bot.sendMessage(
          chatId,
          '⚠️ هوش مصنوعی فعلاً در دسترس نیست.'
        );

        return;
      }

      // =================================================
      // FREE MODE
      // =================================================

      const freeAnswer =
        findFreeAnswer(
          userMessage
        );

      if (freeAnswer) {

        await bot.sendMessage(
          chatId,
          freeAnswer,
          msg.chat.type !== 'private'
            ? {
                reply_to_message_id:
                  msg.message_id
              }
            : {}
        );

        return;
      }

      // =================================================
      // STICKER
      // =================================================

      const sticker =
        findSticker(
          userMessage
        );

      if (sticker) {

        await bot.sendSticker(
          chatId,
          sticker
        );

        return;
      }

      // =================================================
      // NOT FOUND
      // =================================================

      await bot.sendMessage(
        chatId,
        '📚 برای این پیام هنوز پاسخ آماده‌ای ندارم.\n\n' +
        'اگر می‌خواهی AI جواب بدهد، بگو:\n' +
        '«هوش مصنوعی روشن»'
      );

    } catch (error) {

      console.error(
        'Message error:',
        error
      );

      try {
        await bot.sendMessage(
          msg.chat.id,
          '⚠️ یه خطای موقت پیش اومد. دوباره امتحان کن.'
        );
      } catch {}
    }
  }
);

// =====================================================
// RENDER SERVER
// =====================================================

const port =
  process.env.PORT || 3000;

const server =
  http.createServer(
    (req, res) => {

      res.writeHead(
        200,
        {
          'Content-Type':
            'text/plain; charset=utf-8'
        }
      );

      res.end(
        botAwake
          ? (
              aiEnabled
                ? 'Telegram bot is running - AI mode'
                : 'Telegram bot is running - FREE mode'
            )
          : 'Telegram bot is sleeping'
      );
    }
  );

server.listen(
  port,
  () => {
    console.log(
      `Server listening on port ${port}`
    );
  }
);

// =====================================================
// SHUTDOWN
// =====================================================

function shutdown() {

  console.log(
    'Stopping bot...'
  );

  bot.stopPolling()
    .catch(() => {})
    .finally(() => {

      server.close(() => {
        process.exit(0);
      });

    });
}

process.on(
  'SIGTERM',
  shutdown
);

process.on(
  'SIGINT',
  shutdown
);
