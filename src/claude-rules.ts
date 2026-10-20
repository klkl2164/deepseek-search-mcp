import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from './lib/errors.js';
import { WEB_TOOL_POLICY } from './policy.js';

export const RULE_FILE_NAME = 'deepseek-web-fallback.md';
export const RULE_START = '<!-- deepseek-search-fetch-mcp:web-fallback:start -->';
export const RULE_END = '<!-- deepseek-search-fetch-mcp:web-fallback:end -->';
export const RULE_BLOCK = `${RULE_START}\n# Web tools: native first, DeepSeek fallback\n\n${WEB_TOOL_POLICY}\n${RULE_END}`;

export function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

async function existingRule(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new AppError('CONFIG_ERROR', 'Routing rule target must be a regular file, not a symlink.');
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function managedRegion(text: string): [number, number] {
  const start = text.indexOf(RULE_START);
  const end = text.indexOf(RULE_END);
  if (start < 0 || end < start || text.indexOf(RULE_START, start + 1) >= 0 || text.indexOf(RULE_END, end + 1) >= 0) {
    throw new AppError('CONFIG_ERROR', 'An unmanaged or malformed deepseek-web-fallback.md already exists; preserve it and resolve the conflict before installing rules.');
  }
  return [start, end + RULE_END.length];
}

async function replaceFile(path: string, text: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }); }
}

export async function installClaudeRules(configDir = claudeConfigDir()): Promise<'installed' | 'updated' | 'unchanged'> {
  const path = join(configDir, 'rules', RULE_FILE_NAME);
  const current = await existingRule(path);
  let next = `${RULE_BLOCK}\n`;
  if (current !== undefined) {
    const [start, end] = managedRegion(current);
    next = current.slice(0, start) + RULE_BLOCK + current.slice(end);
    if (next === current) return 'unchanged';
  }
  await mkdir(join(configDir, 'rules'), { recursive: true });
  await replaceFile(path, next);
  return current === undefined ? 'installed' : 'updated';
}

export async function removeClaudeRules(configDir = claudeConfigDir()): Promise<'removed' | 'unchanged'> {
  const path = join(configDir, 'rules', RULE_FILE_NAME);
  const current = await existingRule(path);
  if (current === undefined) return 'unchanged';
  const [start, end] = managedRegion(current);
  const remaining = current.slice(0, start) + current.slice(end);
  if (remaining.trim()) await replaceFile(path, remaining);
  else await unlink(path);
  return 'removed';
}
