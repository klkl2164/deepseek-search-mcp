# Contributing

欢迎修复问题、改进文档或提交功能建议。中英文 Issue / PR 均可。

## Development

1. Fork and clone the repository. Use Node.js 22.12+ (22 or 24 LTS recommended).
2. Run `npm ci` to install the locked dependencies and build the server.
3. Make a focused change, then run:

```sh
npm run check
npm run test:package
```

`npm run dev` starts the TypeScript stdio entry. `npm run build` writes `dist/`. stdout must contain only MCP JSON-RPC; use the redacting stderr logger for diagnostics.

## Tests

All default tests must run without a real key or paid requests. Inject the HTTP transport or DNS resolver when testing upstream behavior. Keep mock entry points in `tests/fixtures`, outside the production build. Windows installer tests mock registration and never change the actual user's credentials or MCP settings.

Add tests for behavior changes such as error classification, cancellation, URL validation, pagination or packaging. Documentation-only changes should pass the public-file scan. See [testing](docs/TESTING.md).

## Pull requests

- Describe the problem, resulting behavior and checks you ran.
- Keep changes focused. Discuss new providers, tools or persistent storage in an Issue first.
- Never include credentials, local user paths, logs containing request headers or private client configuration.
- Keep the lockfile; use public npm registry URLs rather than a machine-specific registry mirror.
- Do not commit `dist`, `node_modules`, tarballs, `.env` or generated machine-specific validation reports.
- Keep Chinese and English setup instructions consistent when changing installation behavior.

## Distribution

The package currently installs from GitHub. `prepare` builds Git installations; `npm pack` includes the compiled runtime, public docs and license. GitHub Actions tests Node 22 and 24 on Windows, macOS and Linux. CI uploads the tested tarball as an artifact; publishing to npm or creating a public release remains a maintainer action.

To pin a GitHub installation, replace `#main` with an existing commit SHA or tag. Do not advertise a tag, npm package or release URL before it exists.

Contributions are provided under the project's [MIT License](LICENSE). Please be respectful, share reproducible reports and avoid posting personal information.
