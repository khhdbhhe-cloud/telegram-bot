const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OWNER_ID = process.env.OWNER_ID;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is not set');
if (!OWNER_ID) throw new Error('OWNER_ID is not set');

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

let botUserId = null;
let botUsername = null;

let botAwake = true;
let aiEnabled = true;

// =========================
// بانک پاسخ‌های رایگان
// =========================

let answers = {};

function loadFreeAnswers() {
  answers = {};

  try {
    const files = fs
      .readdirSync('.')
      .filter(
        file =>
          file.startsWith('answers') &&
          file.endsWith('.json')
      )
      .sort();

    if (files.length === 0) {
      console.warn('No answers*.json files found.');
      return;
    }

    for (const file of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(`./${file}`, 'utf8')
        );

        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data)
        ) {
          console.warn(
            `${file} is not a JSON object. Skipped.`
          );
          continue;
        }

        let loadedFromFile = 0;
        let duplicatesFromFile = 0;

        for (const [key, value] of Object.entries(data)) {
          const cleanKey = key
            .trim()
            .toLowerCase();

          if (!cleanKey) {
            continue;
          }

          if (
            typeof value !== 'string' ||
            !value.trim()
          ) {
            console.warn(
              `Invalid answer for "${key}" in ${file}. Skipped.`
            );
            continue;
          }

          if (
            Object.prototype.hasOwnProperty.call(
              answers,
              cleanKey
            )
          ) {
            console.warn(
              `Duplicate free answer skipped: "${key}" from ${file}`
            );

            duplicatesFromFile++;
            continue;
          }

          answers[cleanKey] = value;
          loadedFromFile++;
        }

        console.log(
          `${file}: ${loadedFromFile} loaded, ${duplicatesFromFile} duplicates skipped`
        );

      } catch (error) {
        console.error(
          `${file} error:`,
          error.message
        );
      }
    }

    console.log(
      `Total free answers loaded: ${Object.keys(answers).length}`
    );

  } catch (error) {
    console.error(
      'Free answers loading error:',
      error.message
    );
  }
}

loadFreeAnswers();

// =========================
// اطلاعات بات
// =========================

bot.getMe()
  .then((me) => {
    botUserId = me.id;
    botUsername = me.username;

    console.log(`Bot: @${botUsername}`);
    console.log('Telegram bot is running...');
  })
  .catch((error) => {
    console.error(
      'getMe error:',
      error.message
    );
  });

// =========================
// پاسخ رایگان
// =========================

function getFreeAnswer(text) {
  const cleanText = text
    .trim()
    .toLowerCase();

  return answers[cleanText] || null;
}

// =========================
// هوش مصنوعی
// =========================

async function askAI(
  userMessage,
  userName
) {
  if (!OPENROUTER_API_KEY) {
    return null;
  }

  try {
    const prompt = `
تو یک ربات فارسی‌زبان دوستانه هستی.

نام کاربر: ${userName}

کوتاه، طبیعی و مفید جواب بده.

پیام کاربر:
${userMessage}
`;

    const response = await fetch(
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
          model: 'openai/gpt-4o-mini',

          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      }
    );

    if (!response.ok) {
      console.error(
        'OpenRouter error:',
        response.status
      );

      return null;
    }

    const data =
      await response.json();

    return (
      data.choices?.[0]?.message?.content ||
      null
    );

  } catch (error) {
    console.error(
      'AI error:',
      error.message
    );

    return null;
  }
}

// =========================
// بررسی مالک
// =========================

function isPrivateOwner(msg) {
  return (
    msg.chat.type === 'private' &&
    String(msg.from.id) ===
      String(OWNER_ID)
  );
}

function isOwner(msg) {
  return (
    String(msg.from.id) ===
    String(OWNER_ID)
  );
}

// =========================
// دستورات
// =========================

const sleepCommands = [
  'خاموش شو',
  'بخواب',
  'ساکت شو',
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
  '/ai_on'
];

const aiOffCommands = [
  'هوش مصنوعی خاموش',
  'هوش مصنوعی غیرفعال',
  '/ai_off'
];

function matchesCommand(
  text,
  commands
) {
  return commands.includes(
    text.trim().toLowerCase()
  );
}

// =========================
// پیام‌ها
// =========================

bot.on(
  'message',
  async (msg) => {

    try {

      if (!msg.text || !msg.from) {
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

      // =========================
      // خاموش
      // =========================

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
          '🛑 چشم، مالک محترم!\n\n' +
          'دستور شما دریافت شد و ربات وارد حالت سکوت شد. 🤫\n\n' +
          'هر وقت گفتید «زنده شو»، دوباره برمی‌گردم. ⚡🤖'
        );

        return;
      }

      // =========================
      // روشن
      // =========================

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
          '🟢 به روی چشم، مالک محترم!\n\n' +
          'از حالت خواب خارج شدم و دوباره آماده‌ام. 🤖✨'
        );

        return;
      }

      // =========================
      // AI خاموش
      // =========================

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
          '🤖💤 هوش مصنوعی خاموش شد.\n\n' +
          'از این لحظه فقط از پاسخ‌های رایگان استفاده می‌کنم. 📚'
        );

        return;
      }

      // =========================
      // AI روشن
      // =========================

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
          '🧠⚡ هوش مصنوعی دوباره فعال شد!\n\n' +
          'اگر پاسخ آماده پیدا نشود، از AI کمک می‌گیرم. 🤖'
        );

        return;
      }

      // =========================
      // حالت خواب
      // =========================

      if (!botAwake) {
        return;
      }

      // =========================
      // گروه
      // =========================

      if (msg.chat.type !== 'private') {

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

      // =========================
      // حذف منشن
      // =========================

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

      // =========================
      // اول پاسخ رایگان
      // =========================

      const freeAnswer =
        getFreeAnswer(userMessage);

      if (freeAnswer) {

        const options =
          msg.chat.type !== 'private'
            ? {
                reply_to_message_id:
                  msg.message_id
              }
            : {};

        await bot.sendMessage(
          chatId,
          freeAnswer,
          options
        );

        return;
      }

      // =========================
      // AI خاموش
      // =========================

      if (!aiEnabled) {

        await bot.sendMessage(
          chatId,
          '📚 برای این سؤال هنوز جواب آماده‌ای ندارم.\n' +
          'هوش مصنوعی هم فعلاً خاموشه. 🤖💤'
        );

        return;
      }

      // =========================
      // AI
      // =========================

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

        const options =
          msg.chat.type !== 'private'
            ? {
                reply_to_message_id:
                  msg.message_id
              }
            : {};

        await bot.sendMessage(
          chatId,
          aiAnswer,
          options
        );

        return;
      }

      // =========================
      // AI در دسترس نیست
      // =========================

      await bot.sendMessage(
        chatId,
        '⚠️ هوش مصنوعی فعلاً در دسترس نیست.\n' +
        'اگر سؤال جواب آماده داشته باشد، می‌توانم بدون AI جواب بدهم. 🤖'
      );

    } catch (error) {

      console.error(
        'Bot error:',
        error
      );

    }
  }
);

// =========================
// Render Web Service
// =========================

const port =
  process.env.PORT || 3000;

http.createServer(
  (req, res) => {

    res.writeHead(200, {
      'Content-Type':
        'text/plain'
    });

    res.end(
      botAwake
        ? 'Telegram bot is running'
        : 'Telegram bot is sleeping'
    );

  }
).listen(
  port,
  () => {
    console.log(
      `Server listening on port ${port}`
    );
  }
);
