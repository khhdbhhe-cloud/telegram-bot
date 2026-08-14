const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const fs = require('fs');
const path = require('path');

// =====================================================
// SETTINGS
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

// =====================================================
// STATE
// =====================================================

let botAwake = true;

// true = AI
// false = FREE
let aiEnabled = false;

// =====================================================
// FREE ANSWERS
// =====================================================

let answers = {};
let stickerAnswers = {};

const lastUsedAnswer = {};
const lastUsedSticker = {};

// =====================================================
// TEXT NORMALIZATION
// =====================================================

function normalizeText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ');
}

function cleanKey(text) {
  return normalizeText(text);
}

// =====================================================
// WORDS
// =====================================================

function words(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter(Boolean);
}

// =====================================================
// SIMILARITY
// =====================================================

function similarityScore(a, b) {
  const x = cleanKey(a);
  const y = cleanKey(b);

  if (!x || !y) {
    return 0;
  }

  if (x === y) {
    return 1;
  }

  if (x.includes(y) || y.includes(x)) {
    return 0.92;
  }

  const aWords = new Set(words(x));
  const bWords = new Set(words(y));

  let common = 0;

  for (const word of aWords) {
    if (bWords.has(word)) {
      common++;
    }
  }

  const total = new Set([
    ...aWords,
    ...bWords
  ]).size;

  if (total === 0) {
    return 0;
  }

  return common / total;
}

// =====================================================
// ANSWER NORMALIZATION
// =====================================================

function normalizeAnswers(value) {
  if (typeof value === 'string') {
    const answer = value.trim();

    return answer ? [answer] : [];
  }

  if (Array.isArray(value)) {
    return value
      .filter(
        item =>
          typeof item === 'string' &&
          item.trim()
      )
      .map(item => item.trim());
  }

  return [];
}

// =====================================================
// ADD ANSWERS
// =====================================================

function addAnswers(key, value, fileName) {
  const clean = cleanKey(key);

  if (!clean) {
    return 0;
  }

  const list = normalizeAnswers(value);

  if (!list.length) {
    console.warn(
      `Invalid answer "${key}" in ${fileName}`
    );

    return 0;
  }

  if (!answers[clean]) {
    answers[clean] = [];
  }

  let added = 0;

  for (const answer of list) {
    if (!answers[clean].includes(answer)) {
      answers[clean].push(answer);
      added++;
    }
  }

  return added;
}

// =====================================================
// STICKER LOADER
//
// Example:
//
// {
//   "سلام": [
//      "CAACAgIAAxkBAA..."
//   ]
// }
//
// =====================================================

function loadStickerFile(file) {
  try {
    const fullPath = path.join(
      __dirname,
      file
    );

    if (!fs.existsSync(fullPath)) {
      return;
    }

    const data = JSON.parse(
      fs.readFileSync(
        fullPath,
        'utf8'
      )
    );

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      console.warn(
        `${file} is not a valid object`
      );

      return;
    }

    for (const [key, value] of Object.entries(data)) {
      const clean = cleanKey(key);

      if (!clean) {
        continue;
      }

      if (!Array.isArray(value)) {
        continue;
      }

      const validStickers =
        value.filter(
          sticker =>
            typeof sticker === 'string' &&
            sticker.trim()
        );

      if (!validStickers.length) {
        continue;
      }

      if (!stickerAnswers[clean]) {
        stickerAnswers[clean] = [];
      }

      for (const sticker of validStickers) {
        if (
          !stickerAnswers[clean].includes(
            sticker
          )
        ) {
          stickerAnswers[clean].push(
            sticker
          );
        }
      }
    }

    console.log(
      `Loaded stickers from ${file}`
    );

  } catch (error) {
    console.error(
      `Sticker file error ${file}:`,
      error.message
    );
  }
}

// =====================================================
// LOAD ALL ANSWERS FILES
// =====================================================

function loadFreeAnswers() {
  answers = {};
  stickerAnswers = {};

  try {
    const files = fs
      .readdirSync(__dirname)
      .filter(
        file =>
          file.startsWith('answers') &&
          file.endsWith('.json')
      )
      .sort();

    console.log(
      `Found ${files.length} answer files.`
    );

    for (const file of files) {
      try {
        const fullPath =
          path.join(
            __dirname,
            file
          );

        const data = JSON.parse(
          fs.readFileSync(
            fullPath,
            'utf8'
          )
        );

        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data)
        ) {
          console.warn(
            `${file} skipped: invalid JSON object`
          );

          continue;
        }

        let count = 0;

        for (
          const [key, value]
          of Object.entries(data)
        ) {
          count += addAnswers(
            key,
            value,
            file
          );
        }

        console.log(
          `${file}: ${count} answers loaded`
        );

      } catch (error) {
        console.error(
          `${file} error:`,
          error.message
        );
      }
    }

    loadStickerFile(
      'sticker_responses.json'
    );

    const totalKeys =
      Object.keys(answers).length;

    const totalAnswers =
      Object.values(answers)
        .reduce(
          (sum, list) =>
            sum + list.length,
          0
        );

    const totalStickerKeys =
      Object.keys(
        stickerAnswers
      ).length;

    console.log(
      `FREE BANK: ${totalKeys} keys / ${totalAnswers} answers`
    );

    console.log(
      `STICKERS: ${totalStickerKeys} keys`
    );

  } catch (error) {
    console.error(
      'Loading answers failed:',
      error.message
    );
  }
}

loadFreeAnswers();

// =====================================================
// RANDOM ANSWER
// =====================================================

function chooseRandom(
  key,
  list,
  memory
) {
  if (
    !Array.isArray(list) ||
    !list.length
  ) {
    return null;
  }

  if (list.length === 1) {
    memory[key] = list[0];
    return list[0];
  }

  const previous = memory[key];

  let available =
    list.filter(
      item =>
        item !== previous
    );

  if (!available.length) {
    available = list;
  }

  const selected =
    available[
      Math.floor(
        Math.random() *
        available.length
      )
    ];

  memory[key] = selected;

  return selected;
}

// =====================================================
// FIND FREE ANSWER
// =====================================================

function getFreeAnswer(text) {
  const clean = cleanKey(text);

  // Exact match first
  if (answers[clean]) {
    return chooseRandom(
      clean,
      answers[clean],
      lastUsedAnswer
    );
  }

  // Similar match
  let bestKey = null;
  let bestScore = 0;

  for (const key of Object.keys(answers)) {
    const score =
      similarityScore(
        clean,
        key
      );

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  // Don't make dangerous guesses
  // unless similarity is reasonably high.
  if (
    bestKey &&
    bestScore >= 0.55
  ) {
    console.log(
      `Similar match: "${clean}" -> "${bestKey}" (${bestScore.toFixed(2)})`
    );

    return chooseRandom(
      bestKey,
      answers[bestKey],
      lastUsedAnswer
    );
  }

  return null;
}

// =====================================================
// FIND STICKER
// =====================================================

function getSticker(text) {
  const clean = cleanKey(text);

  if (stickerAnswers[clean]) {
    return chooseRandom(
      clean,
      stickerAnswers[clean],
      lastUsedSticker
    );
  }

  let bestKey = null;
  let bestScore = 0;

  for (
    const key
    of Object.keys(stickerAnswers)
  ) {
    const score =
      similarityScore(
        clean,
        key
      );

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  if (
    bestKey &&
    bestScore >= 0.70
  ) {
    return chooseRandom(
      bestKey,
      stickerAnswers[bestKey],
      lastUsedSticker
    );
  }

  return null;
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
      `Mode: ${
        aiEnabled
          ? 'AI'
          : 'FREE'
      }`
    );

    console.log(
      'Telegram bot is running.'
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

    if (
      error.message &&
      error.message.includes(
        '409 Conflict'
      )
    ) {
      console.error(
        '409 Conflict: another bot instance is running with the same BOT_TOKEN.'
      );
    }
  }
);

// =====================================================
// AI
// =====================================================

async function askAI(
  userMessage,
  userName
) {
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

قوانین:
- فارسی و طبیعی جواب بده.
- جواب کوتاه و مفید باشد.
- اگر کاربر خودمانی حرف زد، تو هم خودمانی جواب بده.
- از ایموجی در صورت مناسب بودن استفاده کن.
- خودت را با ایموجی 🤖 معرفی نکن مگر لازم باشد.
- اگر کاربر شوخی کرد، می‌توانی شوخی دوستانه داشته باشی.
- به درخواست‌های خطرناک یا غیرقانونی کمک نکن.

پیام کاربر:
${userMessage}
`;

    const response =
      await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            'Authorization':
              `Bearer ${OPENROUTER_API_KEY}`,

            'HTTP-Referer':
              'https://telegram-bot-1-0mtg.onrender.com',

            'X-Title':
              'Telegram Bot'
          },

          body: JSON.stringify({
            model:
              'openai/gpt-4o-mini',

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
      const errorText =
        await response.text();

      console.error(
        'OpenRouter error:',
        response.status,
        errorText
      );

      return null;
    }

    const data =
      await response.json();

    const answer =
      data
        ?.choices?.[0]
        ?.message
        ?.content;

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
// OWNER
// =====================================================

function isOwner(msg) {
  return (
    String(msg.from.id) ===
    String(OWNER_ID)
  );
}

// =====================================================
// COMMANDS
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

function matchesCommand(
  text,
  commands
) {
  return commands.includes(
    cleanKey(text)
  );
}

// =====================================================
// SEND OPTIONS
// =====================================================

function replyOptions(msg) {
  if (
    msg.chat.type !== 'private'
  ) {
    return {
      reply_to_message_id:
        msg.message_id
    };
  }

  return {};
}

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
          '🛑 باشه، فعلاً ساکت می‌شم. 🤫'
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
          '🟢 دوباره فعال شدم! ✨'
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
          '🧠⚡ هوش مصنوعی روشن شد.'
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
      // GROUP CHECK
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
      // REMOVE MENTION
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
      // FREE MODE
      // =================================================

      if (!aiEnabled) {

        // First try sticker
        const sticker =
          getSticker(
            userMessage
          );

        if (sticker) {

          await bot.sendSticker(
            chatId,
            sticker,
            replyOptions(msg)
          );

          return;
        }

        // Then text answer
        const freeAnswer =
          getFreeAnswer(
            userMessage
          );

        if (freeAnswer) {

          await bot.sendMessage(
            chatId,
            freeAnswer,
            replyOptions(msg)
          );

          return;
        }

        await bot.sendMessage(
          chatId,
          '📚 برای این پیام هنوز پاسخ آماده ندارم.\n\n' +
          'اگر می‌خواهی هوش مصنوعی جواب بدهد، بگو:\n' +
          '«هوش مصنوعی روشن»'
        );

        return;
      }

      // =================================================
      // AI MODE
      // =================================================

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
          replyOptions(msg)
        );

        return;
      }

      await bot.sendMessage(
        chatId,
        '⚠️ هوش مصنوعی فعلاً پاسخ نداد.\n\n' +
        'اگر خواستی از بانک رایگان استفاده کنی، بگو:\n' +
        '«هوش مصنوعی خاموش»'
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
                ? 'Telegram bot is running - AI'
                : 'Telegram bot is running - FREE'
            )
          : 'Telegram bot is sleeping'
      );
    }
  );

server.listen(
  port,
  () 
