const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OWNER_ID = process.env.OWNER_ID;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not set');
}

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is not set');
}

if (!OWNER_ID) {
  throw new Error('OWNER_ID is not set');
}

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

let botUserId = null;
let botUsername = null;

// وضعیت ربات
// true = فعال
// false = خواب
let botAwake = true;

// =========================
// آماده‌سازی اطلاعات بات
// =========================

bot.getMe()
  .then((me) => {
    botUserId = me.id;
    botUsername = me.username;

    console.log(`Bot username: @${botUsername}`);
    console.log('Telegram bot is running...');
  })
  .catch((error) => {
    console.error('getMe error:', error);
  });

// =========================
// OpenRouter AI
// =========================

async function askAI(userMessage, userName, userRole) {
  const prompt = `
تو یک ربات تلگرامی فارسی‌زبان هستی.

نام کاربر: ${userName}
نقش کاربر: ${userRole}

به کاربر طبیعی، دوستانه، کوتاه و مفید پاسخ بده.
اگر سؤال نامفهوم بود، درخواست توضیح کن.

پیام کاربر:
${userMessage}
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
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter error: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();

  return (
    data.choices?.[0]?.message?.content ||
    'متأسفم، فعلاً نتونستم جواب مناسبی پیدا کنم.'
  );
}

// =========================
// تشخیص نقش کاربر
// =========================

async function getUserRole(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);

    if (member.status === 'creator') {
      return 'مالک گروه';
    }

    if (member.status === 'administrator') {
      return 'مدیر گروه';
    }

    return 'عضو عادی';
  } catch (error) {
    console.error('getUserRole error:', error.message);
    return 'عضو عادی';
  }
}

// =========================
// بررسی مالک
// =========================

async function isOwner(msg) {
  const userId = String(msg.from.id);

  // چت خصوصی: فقط OWNER_ID
  if (msg.chat.type === 'private') {
    return userId === String(OWNER_ID);
  }

  // گروه: فقط Creator / مالک گروه
  try {
    const member = await bot.getChatMember(
      msg.chat.id,
      msg.from.id
    );

    return member.status === 'creator';
  } catch (error) {
    console.error('Owner check error:', error.message);
    return false;
  }
}

// =========================
// تشخیص دستور خواب / بیداری
// =========================

function isSleepCommand(text) {
  const commands = [
    'خاموش شو',
    'بخواب',
    'ساکت شو',
    'خاموش',
    '/off'
  ];

  return commands.includes(text.trim().toLowerCase());
}

function isWakeCommand(text) {
  const commands = [
    'زنده شو',
    'بیدار شو',
    'فعال شو',
    'روشن شو',
    'بیدار',
    '/on'
  ];

  return commands.includes(text.trim().toLowerCase());
}

// =========================
// پیام‌ها
// =========================

bot.on('message', async (msg) => {
  try {
    if (!msg.text || !msg.from) {
      return;
    }

    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const userName =
      msg.from.first_name ||
      msg.from.username ||
      'کاربر';

    // =========================
    // دستورهای مالک
    // =========================

    if (isSleepCommand(text)) {
      const owner = await isOwner(msg);

      if (!owner) {
        return;
      }

      botAwake = false;

      await bot.sendMessage(
        chatId,
        '🛑 چشم، مالک محترم!\n\n' +
        'دستور شما دریافت شد و من وارد حالت سکوت شدم. 🤫\n\n' +
        'هر وقت گفتید «زنده شو»، دوباره برمی‌گردم. ⚡🤖'
      );

      console.log(
        `Bot put to sleep by owner: ${userId}`
      );

      return;
    }

    if (isWakeCommand(text)) {
      const owner = await isOwner(msg);

      if (!owner) {
        return;
      }

      botAwake = true;

      await bot.sendMessage(
        chatId,
        '🟢 به روی چشم، مالک محترم!\n\n' +
        'از حالت خواب خارج شدم و دوباره آماده‌ام. 🤖✨\n' +
        'بزن بریم!'
      );

      console.log(
        `Bot awakened by owner: ${userId}`
      );

      return;
    }

    // =========================
    // اگر ربات خواب است
    // =========================

    if (!botAwake) {
      return;
    }

    // =========================
    // نقش کاربر
    // =========================

    let userRole = 'کاربر خصوصی';

    if (msg.chat.type !== 'private') {
      userRole = await getUserRole(
        chatId,
        userId
      );
    }

    console.log(
      `Message from ${userName} - Role: ${userRole}`
    );

    // =========================
    // چت خصوصی
    // =========================

    if (msg.chat.type === 'private') {
      await bot.sendChatAction(
        chatId,
        'typing'
      );

      const answer = await askAI(
        text,
        userName,
        userRole
      );

      await bot.sendMessage(
        chatId,
        answer
      );

      return;
    }

    // =========================
    // گروه
    // =========================

    const mentioned =
      botUsername &&
      text
        .toLowerCase()
        .includes(`@${botUsername.toLowerCase()}`);

    const repliedToBot =
      msg.reply_to_message &&
      msg.reply_to_message.from &&
      botUserId &&
      msg.reply_to_message.from.id === botUserId;

    // اگر نه منشن شده و نه روی بات ریپلای شده
    if (!mentioned && !repliedToBot) {
      return;
    }

    // حذف منشن بات
    let userMessage = text;

    if (botUsername) {
      userMessage = userMessage
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

    await bot.sendChatAction(
      chatId,
      'typing'
    );

    const answer = await askAI(
      userMessage,
      userName,
      userRole
    );

    await bot.sendMessage(
      chatId,
      answer,
      {
        reply_to_message_id:
          msg.message_id
      }
    );

  } catch (error) {
    console.error(
      'Bot error:',
      error
    );
  }
});

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
