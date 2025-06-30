// index.js
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { load } from 'cheerio';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handleSessionRequest } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import crewaijs from 'crewai-js';                       // ← default import
const { Agent, Task, Crew, Tool } = crewaijs;   
import { Telegraf } from 'telegraf';

const PORT      = process.env.PORT || 8080;
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ Missing TELEGRAM_TOKEN');
  process.exit(1);
}

const app = express();
app.use(bodyParser.json());

// ─── 1) MCP scraper setup ──────────────────────────────────────────────────
const mcp = new McpServer({ name: 'mcp-webscraper', version: '1.0.0' });

mcp.registerTool('scrapePage', {
  title: 'scrapePage',
  description: 'Fetch URL and return full HTML or texts by CSS selector',
  input: {
    type: 'object',
    properties: {
      url:      { type: 'string' },
      selector: { type: 'string' }
    },
    required: ['url']
  },
  output: {
    type: 'object',
    properties: {
      html:  { type: 'string' },
      texts: { type: 'array', items: { type: 'string' } }
    }
  },
  handler: async ({ input }) => {
    const { url, selector = null } = input;
    const resp = await axios.get(url);
    const $    = load(resp.data);
    return selector
      ? { texts: $(selector).map((i, el) => $(el).text()).get() }
      : { html: resp.data };
  }
});

// mount the full JSON-RPC + SSE transport
app.all('/mcp', handleSessionRequest(mcp));
app.get('/health', (_req, res) => res.send('OK'));

// in-process helper for CrewAI
async function scrapePageViaMCP({ url, selector = null }) {
  const { content } = await mcp.callTool({
    name: 'scrapePage',
    arguments: { url, selector }
  });
  return content[0];
}

// ─── 2) CrewAI “run-crew-task” endpoint ───────────────────────────────────
app.post('/run-crew-task', async (req, res) => {
  try {
    const input = req.body;

    // Ollama wrapper
    class OllamaLLM {
      constructor({ baseUrl, model, temperature = 0.7 }) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.temperature = temperature;
      }
      async generate(prompt) {
        const resp = await axios.post(
          `${this.baseUrl}/completions`,
          { model: this.model, prompt, temperature: this.temperature }
        );
        return resp.data.choices[0].text;
      }
    }

    const llm = new OllamaLLM({
      baseUrl: 'http://localhost:11434',
      model:   'gemma3:1b'
    });

    const mcpScrapeTool = new Tool({
      name: 'scrapePage',
      description: 'Fetch URL via MCP scraper; return HTML or texts',
      func: scrapePageViaMCP
    });

    const writer = new Agent({
      role:      input.writer_agent.role,
      goal:      input.writer_agent.goal,
      backstory: input.writer_agent.backstory,
      llm,
      maxIter:   10,
      verbose:   true
    });

    const verifier = new Agent({
      role:           input.verifier_agent.role,
      goal:           input.verifier_agent.goal,
      backstory:      input.verifier_agent.backstory,
      llm,
      maxIter:        19,
      verbose:        true,
      tools:          [mcpScrapeTool],
      toolSelection: 'auto'
    });

    const task1 = new Task({
      description:    input.writing_task_description,
      expectedOutput: input.writing_task_expected_output,
      agent:          writer
    });
    const task2 = new Task({
      description:    input.verification_task_description,
      expectedOutput: input.verification_task_expected_output,
      agent:          verifier
    });

    const crew = new Crew({
      agents:  [writer, verifier],
      tasks:   [task1, task2],
      process: 'sequential',
      verbose: 3
    });

    const result = await crew.kickoff();
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 3) Start server & Telegram bot ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✔️ Listening on http://0.0.0.0:${PORT}`);

  const API_URL = `http://localhost:${PORT}/mcp`;
  const bot     = new Telegraf(BOT_TOKEN);

  bot.start(ctx =>
    ctx.reply(
      `Hi!\nSend /run to launch the example workflow,\nor paste your TaskInput JSON to run custom.`
    )
  );

  bot.command('run', async ctx => {
    const example = {
      /* e.g.
      tool: "scrapePage",
      input: { url: "https://example.com", selector: "p" }
      */
    };
    try {
      const resp = await axios.post(API_URL, example, {
        headers: { 'Content-Type': 'application/json' }
      });
      ctx.reply(`✅ Result:\n${JSON.stringify(resp.data.result, null, 2)}`);
    } catch (e) {
      console.error(e);
      ctx.reply('❌ Failed to run example task.');
    }
  });

  bot.on('text', async ctx => {
    const text = ctx.message.text.trim();
    try {
      const payload = JSON.parse(text);
      const resp    = await axios.post(API_URL, payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      ctx.reply(`✅ Result:\n${JSON.stringify(resp.data.result, null, 2)}`);
    } catch {
      ctx.reply('❌ Invalid JSON or request failed.');
    }
  });

  bot.launch()
     .then(() => console.log('🤖 Bot up and running'))
     .catch(e => console.error('Bot launch error', e));
});
