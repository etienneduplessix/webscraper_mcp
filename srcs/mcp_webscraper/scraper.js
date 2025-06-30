// scraper.js
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { Agent, Task, Crew, Tool } from 'crewai-js';

// === MCP JSON-RPC helper ===
async function scrapePageViaMCP({ url, selector = null }) {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'scrapePage',
    params: { url, selector }
  };
  const { data } = await axios.post('http://localhost:8080/mcp', payload);
  return data.result;
}

// === Ollama LLM wrapper ===
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

// === Setup MCP Tool ===
const mcpScrapeTool = new Tool({
  name: 'scrapePage',
  description: 'Fetch URL via MCP scraper; return HTML or element texts',
  func: scrapePageViaMCP
});

// === Express + API ===
const app = express();
app.use(bodyParser.json());

// POST /run-crew-task  
// Expects a JSON body matching your TaskInput schema
app.post('/run-crew-task', async (req, res) => {
  try {
    const input = req.body;

    // Initialize your LLM client
    const llm = new OllamaLLM({
      baseUrl: 'http://localhost:11434',
      model: 'gemma3:1b'
    });

    // Build your “writer” agent (no tools)
    const writer = new Agent({
      role:    input.writer_agent.role,
      goal:    input.writer_agent.goal,
      backstory: input.writer_agent.backstory,
      llm,
      maxIter: 10,
      verbose: true
    });

    // Build your “verifier” agent (with the MCP scraper tool)
    const verifier = new Agent({
      role:         input.verifier_agent.role,
      goal:         input.verifier_agent.goal,
      backstory:    input.verifier_agent.backstory,
      llm,
      maxIter:      19,
      verbose:      true,
      tools:        [mcpScrapeTool],
      toolSelection: 'auto'
    });

    // Define the two tasks
    const task1 = new Task({
      description:   input.writing_task_description,
      expectedOutput: input.writing_task_expected_output,
      agent:         writer
    });
    const task2 = new Task({
      description:   input.verification_task_description,
      expectedOutput: input.verification_task_expected_output,
      agent:         verifier
    });

    // Kick off the Crew
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

// Health check
app.get('/health', (_req, res) => res.send('OK'));

const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`CrewAI server listening on http://0.0.0.0:${PORT}`)
);
