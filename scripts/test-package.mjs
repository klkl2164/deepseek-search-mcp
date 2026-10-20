import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanFiles, walk } from './public-files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'deepseek-mcp-package-'));
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this script through npm run test:package.');
const env = { ...process.env, DEEPSEEK_API_KEY: '', DEEPSEEK_MCP_PROXY_URL: '', DEEPSEEK_MCP_LOG_LEVEL: 'error' };
function npm(args, cwd) {
  return execFileSync(process.execPath, [npmCli, ...args], { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
}

async function discover(entry, cwd) {
  const child = spawn(process.execPath, [entry], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const errors = [];
  const exited = new Promise(resolveExit => child.once('exit', code => resolveExit(code)));
  try {
    await new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged MCP discovery timed out.')), 20000);
      const finish = error => { clearTimeout(timer); error ? reject(error) : resolveRequest(); };
      child.once('error', finish);
      child.once('exit', () => finish(new Error('Server exited before discovery.')));
      createInterface({ input: child.stdout }).on('line', line => {
        try {
          const message = JSON.parse(line);
          assert.equal(message.jsonrpc, '2.0');
          assert.equal(message.error, undefined);
          if (message.id === 1) {
            assert(message.result.instructions.includes('native/built-in'), 'Packaged server is missing its native-first policy.');
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
          }
          if (message.id === 2) {
            assert.deepEqual(message.result.tools.map(tool => tool.name), ['deepseek_search', 'deepseek_fetch']);
            finish();
          }
        } catch (error) { errors.push(error); finish(error); }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'package-smoke', version: '1.0' } } }) + '\n');
    });
    child.stdin.end();
    const exitTimer = setTimeout(() => child.kill(), 5000);
    const code = await exited;
    clearTimeout(exitTimer);
    assert.equal(code, 0, 'Packaged MCP did not exit cleanly.');
    assert.equal(stderr, '');
    assert.equal(errors.length, 0);
  } finally { if (child.exitCode === null) child.kill(); }
}

try {
  const archives = join(temporary, 'archives');
  mkdirSync(archives);
  const output = npm(['pack', '--json', '--pack-destination', archives], root);
  const [packed] = JSON.parse(output.slice(output.indexOf('[')));
  assert(packed.files.some(file => file.path === 'dist/index.js'));
  assert(packed.files.some(file => file.path === 'LICENSE'));
  assert(packed.files.every(file => /^(?:dist\/|docs\/|README(?:\.en)?\.md$|LICENSE$|package\.json$|\.env\.example$)/.test(file.path)));
  const archive = join(archives, packed.filename);
  const consumer = join(temporary, 'tarball consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true}');
  npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', archive], consumer);
  const installed = join(consumer, 'node_modules', 'deepseek-search-fetch-mcp');
  assert(!existsSync(join(consumer, 'node_modules', 'typescript')), 'Tarball installed dev dependencies.');
  assert.deepEqual(scanFiles(installed, walk(installed, new Set(['node_modules']))), []);
  await discover(join(installed, 'dist', 'index.js'), consumer);
  const rulesConfig = join(temporary, 'packaged client rules');
  const policyEnv = { ...env, CLAUDE_CONFIG_DIR: rulesConfig };
  execFileSync(process.execPath, [join(installed, 'dist', 'index.js'), '--install-claude-rules'], { env: policyEnv, windowsHide: true });
  assert(readFileSync(join(rulesConfig, 'rules', 'deepseek-web-fallback.md'), 'utf8').includes('native/built-in'));
  execFileSync(process.execPath, [join(installed, 'dist', 'index.js'), '--remove-claude-rules'], { env: policyEnv, windowsHide: true });
  assert(!existsSync(join(rulesConfig, 'rules', 'deepseek-web-fallback.md')));
  console.log('Production tarball install, public contents and MCP discovery passed.');

  const gitSource = join(temporary, 'git source');
  mkdirSync(gitSource);
  for (const path of ['src', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json', 'README.md', 'README.en.md', 'LICENSE', 'docs', '.env.example', '.gitattributes']) cpSync(join(root, path), join(gitSource, path), { recursive: true });
  const git = args => execFileSync('git', args, { cwd: gitSource, env, encoding: 'utf8', windowsHide: true });
  git(['init', '--quiet']);
  git(['add', '.']);
  git(['-c', 'user.name=Package Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Package fixture']);
  const gitConsumer = join(temporary, 'git consumer');
  mkdirSync(gitConsumer);
  writeFileSync(join(gitConsumer, 'package.json'), '{"private":true}');
  npm(['install', '--no-audit', '--no-fund', '--package-lock=false', `git+${pathToFileURL(gitSource).href}`], gitConsumer);
  await discover(join(gitConsumer, 'node_modules', 'deepseek-search-fetch-mcp', 'dist', 'index.js'), gitConsumer);
  console.log('Git source prepare lifecycle and MCP discovery passed.');
  const artifacts = join(root, 'artifacts');
  mkdirSync(artifacts, { recursive: true });
  cpSync(archive, join(artifacts, packed.filename));
} finally {
  // Only recursively remove the verified temporary directory created by this script.
  const target = resolve(temporary);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert(target.startsWith(resolve(tmpdir()) + sep + 'deepseek-mcp-package-'));
  rmSync(target, { recursive: true, force: true });
}
