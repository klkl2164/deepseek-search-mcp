import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFiles, walk } from './public-files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const excluded = new Set(['.git', 'node_modules', 'dist', 'artifacts', 'coverage', '.vscode', '.idea']);
const files = walk(root, excluded).filter(path => (!/\.(tgz|log)$/.test(path) && !/[/\\]\.env(?:\..+)?$/.test(path)) || path.endsWith('.env.example'));
const issues = scanFiles(root, files);
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
for (const name of tracked) {
  if (/(?:^|\/)\.env(?:\..+)?$|\.log$|(?:^|\/)\.mcp\.json$|\.local\.json$|(?:^|\/)\.npmrc$/.test(name) && !name.endsWith('.env.example')) issues.push(`Private configuration file is tracked: ${name}`);
  if (name.endsWith('.tgz')) issues.push(`Generated archive is tracked: ${name}`);
}
for (const file of files.filter(path => path.endsWith('.md'))) {
  for (const [, target] of readFileSync(file, 'utf8').matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(target.split('#')[0])))) issues.push(`Broken local Markdown link in ${file.slice(root.length)}: ${target}`);
  }
}
for (const path of ['src/index.ts', 'tests/mcp-stdio.test.ts', 'README.md', 'README.en.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md']) {
  if (!existsSync(resolve(root, path))) issues.push(`Required public file missing: ${path}`);
}
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
for (const [name, entry] of Object.entries(lock.packages)) {
  if (entry.resolved && !entry.resolved.startsWith('https://registry.npmjs.org/')) issues.push(`Lockfile registry is not public npm: ${name}`);
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else console.log(`Public-file checks passed (${files.length} files).`);
