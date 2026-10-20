import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm, lstat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installClaudeRules, removeClaudeRules, RULE_BLOCK, RULE_END, RULE_FILE_NAME, RULE_START, claudeConfigDir } from '../src/claude-rules.js';
import { claudeRegistration, runSetup } from '../src/setup.js';
import { WEB_TOOL_POLICY } from '../src/policy.js';

describe('native-first routing rule setup', () => {
  let temporary: string;
  let configDir: string;
  let rule: string;
  beforeEach(async () => {
    temporary = await mkdtemp(join(tmpdir(), 'deepseek-policy-test-'));
    configDir = join(temporary, 'client config');
    rule = join(configDir, 'rules', RULE_FILE_NAME);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    expect(dirname(resolve(temporary))).toBe(resolve(tmpdir()));
    expect(temporary).toContain('deepseek-policy-test-');
    await rm(temporary, { recursive: true, force: true });
  });
  it('installs an unconditional rule and is idempotent without touching other settings', async () => {
    await mkdir(configDir);
    const settings = join(configDir, 'settings.json');
    const memory = join(configDir, 'CLAUDE.md');
    await writeFile(settings, '{"existing":"settings"}');
    await writeFile(memory, 'Existing personal instructions.');
    expect(await installClaudeRules(configDir)).toBe('installed');
    expect(await readFile(rule, 'utf8')).toBe(`${RULE_BLOCK}\n`);
    const modified = (await lstat(rule)).mtimeMs;
    expect(await installClaudeRules(configDir)).toBe('unchanged');
    expect((await lstat(rule)).mtimeMs).toBe(modified);
    expect(await readFile(settings, 'utf8')).toBe('{"existing":"settings"}');
    expect(await readFile(memory, 'utf8')).toBe('Existing personal instructions.');
    expect(await readdir(join(configDir, 'rules'))).toEqual([RULE_FILE_NAME]);
  });
  it('updates and removes only its own block, preserving surrounding user text', async () => {
    await mkdir(join(configDir, 'rules'), { recursive: true });
    await writeFile(rule, `Before\n${RULE_START}\nOld policy\n${RULE_END}\nAfter\n`);
    expect(await installClaudeRules(configDir)).toBe('updated');
    expect(await readFile(rule, 'utf8')).toBe(`Before\n${RULE_BLOCK}\nAfter\n`);
    expect(await removeClaudeRules(configDir)).toBe('removed');
    expect(await readFile(rule, 'utf8')).toBe('Before\n\nAfter\n');
  });
  it('removes a managed-only rule and preserves unrelated rules', async () => {
    await installClaudeRules(configDir);
    await writeFile(join(configDir, 'rules', 'other.md'), 'Other rule');
    expect(await removeClaudeRules(configDir)).toBe('removed');
    expect(await removeClaudeRules(configDir)).toBe('unchanged');
    expect(await readdir(join(configDir, 'rules'))).toEqual(['other.md']);
  });
  it.each(['Personal custom rule', `${RULE_START}\nMissing end`, `${RULE_START}\n${RULE_END}\n${RULE_START}\n${RULE_END}`])('preserves conflicting or malformed files', async current => {
    await mkdir(join(configDir, 'rules'), { recursive: true });
    await writeFile(rule, current);
    await expect(installClaudeRules(configDir)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
    await expect(removeClaudeRules(configDir)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
    expect(await readFile(rule, 'utf8')).toBe(current);
  });
  it('honors the custom Claude config directory', () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir);
    expect(claudeConfigDir()).toBe(configDir);
  });
  it.skipIf(process.platform === 'win32')('refuses a symlink rather than changing another rule file', async () => {
    await mkdir(join(configDir, 'rules'), { recursive: true });
    const other = join(temporary, 'other.md');
    await writeFile(other, RULE_BLOCK);
    await symlink(other, rule);
    await expect(installClaudeRules(configDir)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
    await expect(removeClaudeRules(configDir)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
    expect(await readFile(other, 'utf8')).toBe(RULE_BLOCK);
  });
  it('CLI registration installs rules only after registration succeeds', async () => {
    const write = vi.fn();
    await expect(runSetup(['--setup-claude'], { configDir, run: () => false, write })).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
    await expect(lstat(rule)).rejects.toMatchObject({ code: 'ENOENT' });
    const run = vi.fn(() => true);
    await runSetup(['--setup-claude'], { configDir, run, write });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await readFile(rule, 'utf8')).toContain(WEB_TOOL_POLICY);
  });
  it('uses native launchers for Windows and POSIX without putting setup flags into MCP runtime', () => {
    expect(claudeRegistration('win32')).toMatchObject({ command: 'cmd.exe' });
    expect(claudeRegistration('win32').args.at(-1)).toContain('-- cmd /c npx');
    const posix = claudeRegistration('linux');
    expect(posix.command).toBe('claude');
    expect(posix.args).toContain('npx');
    expect(posix.args.join(' ')).not.toContain('--setup-claude');
  });
  it('runs the built CLI without credentials or API requests in an isolated config directory', async () => {
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    const cli = (flag: string) => execFileSync(process.execPath, [entry, flag], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, DEEPSEEK_API_KEY: '', DEEPSEEK_MCP_PROXY_URL: '' },
      encoding: 'utf8', windowsHide: true, timeout: 10000,
    });
    expect(cli('--install-claude-rules')).toContain('installed');
    expect(await readFile(rule, 'utf8')).toContain('native/built-in');
    expect(cli('--remove-claude-rules')).toContain('removed');
    await expect(lstat(rule)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('documents automatic fallback boundaries rather than a hidden tool interceptor', () => {
    expect(WEB_TOOL_POLICY).toContain('automatically use deepseek_search or deepseek_fetch');
    expect(WEB_TOOL_POLICY).toContain('An empty native search result is a valid result');
    expect(WEB_TOOL_POLICY).toContain('Never use fallback to bypass');
    expect(WEB_TOOL_POLICY).toContain('Decide search and fetch independently');
  });
});
