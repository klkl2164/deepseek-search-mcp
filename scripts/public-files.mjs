import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function textIssues(text) {
  const issues = [];
  if (/[A-Z]:[\\/]+Users[\\/]+[^\s\\/"'<>]+/i.test(text) || /\/(?:Users|home)\/[^\s/"'<>]+/.test(text)) issues.push('machine-specific home path');
  if (/https?:\/\/registry\.npmmirror\.com/.test(text)) issues.push('local registry mirror');
  if (/\bsk-[a-f0-9]{32,}\b/i.test(text) || /\bgh[opusr]_[a-zA-Z0-9]{36,}\b/.test(text)) issues.push('possible real credential');
  return issues;
}

export function walk(directory, excluded = new Set()) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (excluded.has(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path, excluded) : entry.isFile() ? [path] : [];
  });
}

export function scanFiles(root, files) {
  const issues = [];
  for (const file of files) {
    const name = relative(root, file).replaceAll('\\', '/');
    if (/\.(tgz|png|jpg|ico)$/i.test(name)) continue;
    for (const issue of textIssues(readFileSync(file, 'utf8'))) issues.push(`${name}: ${issue}`);
  }
  return issues;
}
