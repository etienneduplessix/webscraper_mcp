// server.js
import { Telegraf } from 'telegraf';
import axios from 'axios';
import 'dotenv/config';

// Environment variables
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434'; // Use service name 'ollama'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';

if (!BOT_TOKEN) {
  console.error('❌ Missing TELEGRAM_TOKEN');
  process.exit(1);
}

// Initialize Telegram bot
const bot = new Telegraf(BOT_TOKEN);

// Ollama client
async function getOllamaResponse(prompt) {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      temperature: 0.7
    });
    return response.data.response || 'Sorry, I couldn’t generate a response.';
  } catch (error) {
    console.error('Ollama error:', error.message);
    return 'Error connecting to the AI server. Please try again later.';
  }
}

// Bot commands
bot.start((ctx) => {
  ctx.reply('Hi! I’m a chatbot powered by Ollama. Send me a message, and I’ll respond with AI-generated text!');
});

bot.help((ctx) => {
  ctx.reply('Just send any message, and I’ll reply using the Ollama AI model. Use /start to greet me!');
});

// Handle incoming text messages
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  ctx.replyWithChatAction('typing'); // Show "typing" indicator
  const response = await getOllamaResponse(userMessage);
  ctx.reply(response);
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('Something went wrong. Please try again.');
});

// Start the bot
bot.launch()
  .then(() => console.log('🤖 Bot up and running'))
  .catch((err) => {
    console.error('Bot launch error:', err);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));