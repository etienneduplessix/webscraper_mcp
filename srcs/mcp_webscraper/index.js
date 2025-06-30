import express from 'express';
import bodyParser from 'body-parser';

// use the published ESM entrypoints
import { McpServer }      from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import axios              from 'axios';
import { load } from 'cheerio';


const app = express();
app.use(bodyParser.json());

const mcp = new McpServer({ name: 'mcp-webscraper', version: '1.0.0' });

// register your tool directly—no need for a separate Tool class
mcp.registerTool(
  'scrapePage',
  {
    title:       'scrapePage',
    description: 'Fetch URL and return full HTML or texts by CSS selector',
    inputSchema: {
      url:      (s) => typeof s === 'string',
      selector: (s) => typeof s === 'string',
    }
  },
  async ({ url, selector }) => {
    const resp = await axios.get(url);
    const $    = cheerio.load(resp.data);
    return selector
      ? $(selector).map((i, el) => $(el).text()).get()
      : { html: resp.data };
  }
);

app.post('/mcp', (req, res) => mcp.handleRequest(req, res));
app.get('/health', (_req, res) => res.send('OK'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`MCP web-scraper listening on http://0.0.0.0:${PORT}/mcp`);
});
