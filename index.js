const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not set');
}

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is not set');
}

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

console.log('Telegram bot is running...');

// =========================
// OpenRouter AI
// =========================

async function askAI(userMessage, userName, userRole) {
  const prompt = `
تو یک ربات تلگرامی فارسی‌زبان هستی.

نام کاربر: ${userName}
نقش کاربر در گروه: ${userRole}

به پیام کاربر طبیعی، کوتاه و مفید پاسخ بده.
اگر کاربر مدیر یا مالک گروه است، با احترام بیشتری با او برخورد کن.
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
    throw new Error(`OpenRouter error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return data.choices?.[0]?.message?.content ||
    'متأسفم، فعلاً نتونستم جواب مناسبی پیدا کنم.';
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
    return 'عضو عادی';
  }
}

// =========================
// دریافت پیام‌ها
// =========================

bot.on('message', async (msg) => {
  try {
    // پیام‌های بدون متن را نادیده بگیر
    if (!msg.text) {
      return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName =
      msg.from.first_name ||
      msg.from.username ||
      'کاربر';

    // نقش کاربر
    let userRole = 'عضو عادی';

    if (msg.chat.type !== 'private') {
      userRole = await getUserRole(chatId, userId);
    } else {
      userRole = 'کاربر خصوصی';
    }

    console.log(
      `Message from ${userName} - Role: ${userRole}`
    );

    // =========================
    // چت خصوصی
    // =========================

    if (msg.chat.type === 'private') {
      await bot.sendChatAction(chatId, 'typing');

      const answer = await askAI(
        msg.text,
        userName,
        userRole
      );

      await bot.sendMessage(chatId, answer);
      return;
    }

    // =========================
    // گروه
    // =========================

    // فقط وقتی بات منشن شده یا روی پیام بات ریپلای شده
    const botUsername = bot.options.username
      ? `@${bot.options.username}`
      : null;

    const mentioned =
      botUsername &&
      msg.text.toLowerCase().includes(botUsername.toLowerCase());

    const repliedToBot =
      msg.reply_to_message &&
      msg.reply_to_message.from &&
      msg.reply_to_message.from.id === bot.botInfo.id;

    if (!mentioned && !repliedToBot) {
      return;
    }

    // حذف منشن بات از متن
    let userMessage = msg.text;

    if (botUsername) {
      userMessage = userMessage.replace(
        new RegExp(botUsername, 'ig'),
        ''
      ).trim();
    }

    if (!userMessage) {
      userMessage = 'سلام';
    }

    await bot.sendChatAction(chatId, 'typing');

    const answer = await askAI(
      userMessage,
      userName,
      userRole
    );

    await bot.sendMessage(chatId, answer, {
      reply_to_message_id: msg.message_id
    });

  } catch (error) {
    console.error('Bot error:', error);
  }
});

// =========================
// Render Web Service
// =========================

const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });

  res.end('Telegram bot is running');
}).listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
