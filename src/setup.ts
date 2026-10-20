import { spawnSync } from 'node:child_process';
import { installClaudeRules, removeClaudeRules } from './claude-rules.js';
import { AppError } from './lib/errors.js';

export const GITHUB_PACKAGE = 'git+https://github.com/klkl2164/deepseek-search-mcp.git#main';
type Command = { command: string; args: string[] };

export function claudeRegistration(platform = process.platform): Command {
  const args = ['mcp', 'add', '--transport', 'stdio', '--scope', 'user', 'deepseek-web', '--'];
  const server = ['npx', '-y', `--package=${GITHUB_PACKAGE}`, 'deepseek-search-fetch-mcp'];
  if (platform === 'win32') {
    // All shell text is fixed project-owned text; no user input or credentials enter it.
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', ['claude', ...args, 'cmd', '/c', ...server].join(' ')] };
  }
  return { command: 'claude', args: [...args, ...server] };
}

export async function runSetup(args: string[], options: {
  configDir?: string;
  run?: (command: Command) => boolean;
  write?: (message: string) => void;
} = {}): Promise<void> {
  const write = options.write ?? (message => console.log(message));
  if (args.length !== 1) throw new AppError('CONFIG_ERROR', 'Use --setup-claude, --install-claude-rules, --remove-claude-rules, or --help.');
  switch (args[0]) {
    case '--help':
      write('No arguments: serve MCP over stdio.\n--setup-claude: register with Claude Code and install native-first fallback rules.\n--install-claude-rules: install/update only the user routing rule (for existing registrations).\n--remove-claude-rules: remove only this project\'s managed routing rule block.');
      return;
    case '--setup-claude': {
      const run = options.run ?? (({ command, args }) => {
        const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
        return !result.error && result.status === 0;
      });
      if (!run(claudeRegistration())) throw new AppError('CONFIG_ERROR', 'Claude registration failed. Ensure Claude Code is installed; if deepseek-web is already registered, use --install-claude-rules to update only its policy.');
      const status = await installClaudeRules(options.configDir);
      write(`Claude Code registered; native-first fallback rule ${status}. Configure DEEPSEEK_API_KEY locally if missing, then restart Claude Code.`);
      return;
    }
    case '--install-claude-rules': {
      const status = await installClaudeRules(options.configDir);
      write(`Native-first DeepSeek fallback rule ${status}. Restart Claude Code to load it.`);
      return;
    }
    case '--remove-claude-rules': {
      const status = await removeClaudeRules(options.configDir);
      write(`Managed routing rule ${status}. Other instructions and MCP registrations were preserved.`);
      return;
    }
    default: throw new AppError('CONFIG_ERROR', 'Unknown option. Run with --help for setup commands.');
  }
}
