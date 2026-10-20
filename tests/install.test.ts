import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.platform !== 'win32')('one-command PowerShell installer', () => {
  function run(mode: string) {
    const temporary = mkdtempSync(join(tmpdir(), 'deepseek-mcp-install-test-'));
    const output = join(temporary, 'result.json');
    const installer = fileURLToPath(new URL('../install.ps1', import.meta.url));
    try {
      const stdout = execFileSync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        fileURLToPath(new URL('./fixtures/installer-harness.ps1', import.meta.url)),
        '-InstallerPath', installer, '-ResultPath', output, '-Mode', mode,
      ], { cwd: temporary, encoding: 'utf8', windowsHide: true, timeout: 15000 });
      expect(stdout).not.toContain('installer-test-placeholder');
      return JSON.parse(readFileSync(output, 'utf8').replace(/^\uFEFF/, '')) as { success: boolean; failure: string | null; calls: string[][]; ruleInstalled: boolean };
    } finally {
      expect(dirname(resolve(temporary))).toBe(resolve(tmpdir()));
      expect(temporary).toContain('deepseek-mcp-install-test-');
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  it('builds and registers absolute paths from an unrelated working directory', () => {
    const result = run('success');
    expect(result.success).toBe(true);
    expect(result.ruleInstalled).toBe(true);
    expect(result.calls.slice(0, 2)).toEqual([['npm', 'ci', '--no-fund'], ['npm', 'run', 'build']]);
    const registration = result.calls[2];
    // PowerShell consumes the `--` marker for mock functions; native executables receive it.
    expect(registration.slice(0, 8)).toEqual(['claude', 'mcp', 'add', '--transport', 'stdio', '--scope', 'user', 'deepseek-web']);
    expect(registration[8]).toMatch(/node\.exe$/i);
    expect(registration[9]).toBe(fileURLToPath(new URL('../dist/index.js', import.meta.url)));
  }, 20000);
  it('does not register after a failed build', () => {
    const result = run('build-failure');
    expect(result.success).toBe(false);
    expect(result.failure).toContain('Build failed');
    expect(result.calls.every(call => call[0] === 'npm')).toBe(true);
    expect(result.ruleInstalled).toBe(false);
  }, 20000);
  it('configures an existing key without building or registering again', () => {
    const result = run('key-only');
    expect(result.success).toBe(true);
    expect(result.calls).toEqual([]);
    expect(result.ruleInstalled).toBe(false);
  }, 20000);
  it('reports a registration failure without deleting an existing server', () => {
    const result = run('registration-failure');
    expect(result.success).toBe(false);
    expect(result.failure).toContain('Registration failed');
    expect(result.calls.some(call => call.includes('remove'))).toBe(false);
    expect(result.ruleInstalled).toBe(false);
  }, 20000);
  it('supports registration without writing client rules', () => {
    const result = run('skip-rules');
    expect(result.success).toBe(true);
    expect(result.ruleInstalled).toBe(false);
  }, 20000);
});
