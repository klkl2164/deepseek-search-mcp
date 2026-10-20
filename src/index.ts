#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
import { loadConfig } from './config.js';
import { safeError, sanitize } from './lib/sanitize.js';
import { runSetup } from './setup.js';

try {
  if (process.argv.length > 2) await runSetup(process.argv.slice(2));
  else {
    const config = loadConfig();
    const handle = serveStdio(() => createServer(config));
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void handle.close(); });
  }
} catch (error) {
  const failure = safeError(error);
  console.error(sanitize(`${failure.code}: ${failure.message}`, [process.env.DEEPSEEK_API_KEY ?? '', process.env.DEEPSEEK_MCP_PROXY_URL ?? '']));
  process.exitCode = 1;
}
