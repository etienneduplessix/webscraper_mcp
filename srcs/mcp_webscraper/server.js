// ./srcs/mcp_webscraper/server.js
import { Telegraf } from 'telegraf';
import axios from 'axios';
import express from 'express';
import { chromium } from 'playwright';
import 'dotenv/config';

// Environment variables
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';
const PORT = process.env.PORT || 8080;

if (!BOT_TOKEN) {
  console.error('❌ Missing TELEGRAM_TOKEN');
  process.exit(1);
}

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Telegram bot
const bot = new Telegraf(BOT_TOKEN);

// Simple MCP server implementation
class McpServer {
  constructor({ name, version }) {
    this.name = name;
    this.version = version;
    this.tools = new Map();
  }

  registerTool(name, config) {
    this.tools.set(name, config);
  }

  async callTool({ name, arguments: args }) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return await tool.handler(args);
  }
}

// Initialize MCP server
const mcp = new McpServer({ name: 'mcp-webscraper', version: '1.0.0' });

// Register Playwright scraping tool
mcp.registerTool('scrapePage', {
  title: 'scrapePage',
  description: 'Fetch URL and return text content of <p> elements or specified CSS selector',
  input: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      selector: { type: 'string' }
    },
    required: ['url']
  },
  output: {
    type: 'object',
    properties: {
      texts: { type: 'array', items: { type: 'string' } }
    }
  },
  handler: async ({ url, selector = 'p' }) => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const texts = await page.$$eval(selector, elements =>
        elements
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 0) // Remove empty or whitespace-only texts
      );
      await browser.close();
      if (texts.length === 0) {
        throw new Error(`No ${selector} elements found on the page`);
      }
      return { texts };
    } catch (error) {
      await browser.close();
      throw new Error(`Scraping failed: ${error.message}`);
    }
  }
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
  try {
    const { method, params } = req.body;
    if (method === 'callTool') {
      const result = await mcp.callTool(params);
      res.json({ result });
    } else {
      res.status(400).json({ error: 'Method not supported' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (_req, res) => res.send('OK'));

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

// In-process helper for scraping via MCP
async function scrapePageViaMCP({ url, selector = 'p' }) {
  const response = await axios.post('http://localhost:8080/mcp', {
    method: 'callTool',
    params: { name: 'scrapePage', arguments: { url, selector } }
  });
  return response.data.result;
}

// Bot commands
bot.start((ctx) => {
  ctx.reply('Hi! I’m a chatbot powered by Ollama with MCP web scraping. Use /scrape <url> [selector] to scrape a website (defaults to <p> elements), or send a message for an AI response!');
});

bot.help((ctx) => {
  ctx.reply('Send a message for an AI response, or use /scrape <url> [selector] to scrape a website (e.g., /scrape https://example.com p). Defaults to scraping <p> elements.');
});

// Handle /scrape command
bot.command('scrape', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const url = args[0];
  const selector = args[1] || 'p'; // Default to <p> elements
  if (!url) {
    return ctx.reply('Please provide a URL (e.g., /scrape https://example.com).');
  }
  ctx.replyWithChatAction('typing');
  try {
    const result = await scrapePageViaMCP({ url, selector });
    // Format texts as a clean, numbered list
    const formattedOutput = result.texts
      .map((text, index) => `${index + 1}. ${text}`)
      .join('\n')
      .slice(0, 4000); // Truncate to fit Telegram's message limit
    ctx.reply(`Scraped ${selector} elements from ${url}:\n${formattedOutput || 'No content found.'}`);
  } catch (error) {
    ctx.reply(`Scraping failed: ${error.message}`);
  }
});

// Handle text messages
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  if (!userMessage.startsWith('/')) {
    ctx.replyWithChatAction('typing');
    const response = await getOllamaResponse(userMessage);
    ctx.reply(response);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('Something went wrong. Please try again.');
});

// Start Express server and Telegram bot
app.listen(PORT, () => {
  console.log(`✔️ Listening on http://0.0.0.0:${PORT}`);
  bot.launch()
    .then(() => console.log('🤖 Bot up and running'))
    .catch((err) => {
      console.error('Bot launch error:', err);
      process.exit(1);
    });
});

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  process.exit(0);
});