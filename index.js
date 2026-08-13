const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error('BOT_TOKEN is not set');
}

// Telegram bot
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'سلام! ربات با موفقیت روشن شد 🤖'
  );
});

console.log('Telegram bot is running...');

// Render Web Service port
const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running');
}).listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
