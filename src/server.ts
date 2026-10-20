import { McpServer } from '@modelcontextprotocol/server';
import { ZodError } from 'zod/v4';
import { loadConfig, type Config } from './config.js';
import { DeepSeekClient } from './api/client.js';
import { SearchService } from './api/search.js';
import { FetchService } from './api/fetch.js';
import { fetchInputSchema, searchInputSchema } from './api/schemas.js';
import { AppError } from './lib/errors.js';
import { createLogger, safeError, sanitize } from './lib/sanitize.js';
import { WEB_TOOL_POLICY, SEARCH_DESCRIPTION, FETCH_DESCRIPTION } from './policy.js';

export function createServer(config: Config = loadConfig(), client = new DeepSeekClient(config)) {
  const server = new McpServer({ name: 'deepseek-search-fetch-mcp', version: '1.1.0' }, { instructions: WEB_TOOL_POLICY });
  const search = new SearchService(client);
  const fetch = new FetchService(client, config);
  const secrets = [config.apiKey ?? '', config.proxyUrl ?? ''];
  const log = createLogger(config.logLevel, secrets);
  async function handle(operation: () => Promise<object>) {
    try {
      const result = await operation();
      const text = sanitize(JSON.stringify(result), secrets);
      return { content: [{ type: 'text' as const, text }], structuredContent: JSON.parse(text) as Record<string, unknown> };
    } catch (error) {
      const failure = error instanceof ZodError ? new AppError('INVALID_ARGUMENT', '工具输入参数无效。') : safeError(error);
      log('error', `${failure.code}: ${failure.message}`);
      return { isError: true, content: [{ type: 'text' as const, text: sanitize(JSON.stringify({ error: { code: failure.code, message: failure.message } }), secrets) }] };
    }
  }
  server.registerTool('deepseek_search', {
    title: 'DeepSeek Web Search',
    description: SEARCH_DESCRIPTION,
    inputSchema: searchInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, (input, context) => handle(() => search.search(input, context.mcpReq.signal)));
  server.registerTool('deepseek_fetch', {
    title: 'DeepSeek Web Fetch',
    description: FETCH_DESCRIPTION,
    inputSchema: fetchInputSchema(config.maxOutputChars),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, (input, context) => handle(() => fetch.fetch(input, context.mcpReq.signal)));
  server.server.onclose = () => { void client.close().catch(() => log('warn', '网络连接池关闭失败。')); };
  return server;
}
