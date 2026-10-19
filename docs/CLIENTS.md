# MCP 客户端配置

[返回 README](../README.md)

服务通过 stdio 提供 MCP。客户端启动 Node 子进程，并向子进程传入 `DEEPSEEK_API_KEY`。服务不会修改客户端的模型供应商或其他 MCP。

## Claude Code

直接使用 README 的 GitHub 注册命令。Windows 通过 `cmd /c npx` 启动，macOS/Linux 直接使用 `npx`。缺少 Node 或 Git 时先安装它们；GUI 启动的客户端需要能在 PATH 中找到它们。

本地源码注册（先运行 `npm ci`，会自动构建）：

Windows PowerShell：

```powershell
$nodePath = (Get-Command node.exe).Source
$entryPath = (Resolve-Path .\dist\index.js).Path
claude mcp add --transport stdio --scope user deepseek-web -- $nodePath $entryPath
```

macOS/Linux：

```sh
claude mcp add --transport stdio --scope user deepseek-web -- "$(command -v node)" "$PWD/dist/index.js"
```

在克隆目录运行以上命令，路径自动生成；安装后保留目录。要卸载注册：

```sh
claude mcp remove --scope user deepseek-web
```

## 安全配置 Key

Windows：在克隆目录运行以下命令，交互隐藏输入并保存为用户环境变量，不需要重装 MCP：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ConfigureKeyOnly
```

Windows 用户环境变量通常是可读取的明文存储。保护本机账户；修改后重启启动 MCP 客户端的终端/IDE。设置独立代理可用：

```powershell
[Environment]::SetEnvironmentVariable('DEEPSEEK_MCP_PROXY_URL', 'http://127.0.0.1:7890', 'User')
```

macOS/Linux：在 Bash 中隐藏读取当前终端的 Key，再从该终端启动 Claude Code：

```bash
read -r -s -p 'DeepSeek API key: ' DEEPSEEK_API_KEY
printf '\n'
export DEEPSEEK_API_KEY
claude
```

该环境仅对当前终端和其子进程生效。GUI 客户端可使用客户端自带的私有环境变量设置或系统凭据管理机制。不要通过命令行 `--env` 直接粘贴真实 Key，以免进入历史或进程参数。

## 其他支持 stdio 的客户端

把下面的配置形状合并到客户端对应的 MCP 设置中；不同客户端的设置文件位置及 Key 存储方式不同，请使用它的官方指引。`YOUR_OFFICIAL_DEEPSEEK_API_KEY` 是占位符，只在本机私有配置中替换。

macOS/Linux：

```json
{
  "mcpServers": {
    "deepseek-web": {
      "command": "npx",
      "args": ["-y", "--package=git+https://github.com/klkl2164/deepseek-search-mcp.git#main", "deepseek-search-fetch-mcp"],
      "env": { "DEEPSEEK_API_KEY": "YOUR_OFFICIAL_DEEPSEEK_API_KEY" }
    }
  }
}
```

Windows 使用 `"command": "cmd"`，并在 `args` 数组开头添加 `"/c", "npx"`，其余参数相同。真实 Key 不应写入共享的项目配置或提交到 Git。

其他客户端未经本项目逐一集成验证；协议测试覆盖 stdio 握手、列工具及工具调用。

## 检查连接

无需 Key 即可用 Inspector 检查工具发现：

```sh
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

返回 `deepseek_search` 和 `deepseek_fetch` 即表示协议连接正常。真实搜索、抓取可能计费；工具发现不验证 Key 或账户余额。
