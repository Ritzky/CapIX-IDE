# Capix IDE

The AI IDE for the Capix protocol — a fork of the [Void editor](https://github.com/voideditor/void) (itself a fork of VS Code), with built-in LLM deploys, cloud panels, a native SSH terminal, Covenant memory, and seamless profile sync between the web console and the IDE.

## Download

Pre-built binaries for Mac, Windows, and Linux are on the [Releases page](https://github.com/Ritzky/CapixIDE/releases):

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | `CapixIDE-x.x.x-arm64.dmg` |
| macOS (Intel) | `CapixIDE-x.x.x-x64.dmg` |
| Windows | `CapixIDE-Setup-x.x.x.exe` |
| Linux | `CapixIDE-x.x.x.AppImage` / `.deb` / `.rpm` |

(NPM install coming soon: `npm i -g capix-ide`)

## What's in the box?

Capix IDE is a full VS Code-compatible editor with a Capix-branded sidebar extension that includes:

### LLM Deploy + Management
- **Model Catalog** — browse featured partner + community models; click to deploy on a GPU
- **Deploy custom models** — paste a Hugging Face link; we auto-detect the GPU specs (VRAM, params, context)
- **My Deploys** — live status of your running/stopped/provisioning deploys
- **Destroy / Stop / Start** — full GPU instance lifecycle with confirmation dialogs
- **View logs** — fetch vLLM boot + server logs to see why a deploy hasn't gone live
- **Run command on GPU** — execute `nvidia-smi`, `docker ps`, `docker logs` on the instance for debugging (command allowlist enforced)
- **Copy endpoint / API key** — one click to copy the OpenAI base URL + Bearer key
- **Region selection** — deploy to Europe, North America, Asia-Pacific, or Global

### Cloud Panels (all synced with the web console)
- **Instances** — list VPS / GPU / LLM deploys with start/stop/destroy/SSH controls
- **Agents** — list GitHub repo deploys with view logs / open terminal
- **Serverless Jobs** — list + trigger capix-job.yml jobs
- **API Keys** — create / revoke `cpk_` keys for the OpenAI-compatible chat gateway

### Profile (synced across web + IDE)
- **Wallet balance** — USD + SOL + USDC equivalents, with active billing per-deploy ($/hr + $/min)
- **Top up** — SOL, USDC (Solana), or USDC on Base (EVM tx-hash verify)
- **Total spent** — lifetime billing history

### Native SSH Terminal
- Click "Open Terminal" on any instance/agent/job → opens a real VS Code integrated terminal pre-configured with SSH
- Reuses existing terminals for the same host
- Run commands directly on your deployed GPU instances

### Auto-Connect LLM
- When an LLM deploy becomes ready (in the IDE or on capix.network), the chat provider is auto-configured with the base URL + API key
- Checks for existing ready deploys on startup — if any exist, auto-configures from the most recent one
- API key stored in VS Code SecretStorage (OS keychain), never in plaintext

### Profile Sync
- Same session token = shared balance, deploys, instances across the web console and the IDE
- Deploy on the web → shows up in the IDE instantly. Deploy in the IDE → visible on the web.
- Connect once with your `cpx_session.…` token — everything syncs.

### Covenant (memory + governance + spirit)
- **Spirit** — a system prompt with behavioral guidelines + hard governance rules (no destructive actions without approval, always explain changes, match existing style)
- **Memory** — persistent store of decisions/patterns/feedback/context, injected into the system prompt before every chat call
- **Governance** — enforced client-side: never delete files without asking, never commit without approval, warn before breaking changes
- Editable `.capix/covenant.md` file for custom personality/rules
- Commands: Edit Covenant, Remember, Clear Memory

### Capix Code (CLI assistant) Integration
- "Capix: Launch Capix Code" command opens a terminal with `capix-code` pre-configured (env vars from SecretStorage)
- Falls back to the Capix gateway if no deployed LLM is configured
- `capix-code` is the Capix-branded fork of [opencode](https://github.com/anomalyco/opencode) — [github.com/Ritzky/capix-code](https://github.com/Ritzky/capix-code)

### Settings Import
- **VS Code / Cursor / Windsurf** — inherited from Void; copies `settings.json`, `keybindings.json`, and extensions on first launch
- **JetBrains** — our addition; translates IntelliJ / PyCharm / WebStorm keymaps and color schemes into VS Code format

### Other
- **Capix logo + branding** — the activity bar icon is the real Capix brand mark, the status bar shows connection state, the sidebar is titled "Capix"
- **Extension marketplace** — uses [Open VSX](https://open-vsx.org) (license-clean for forks)
- **Cross-platform** — `.dmg`, `.exe`, `.deb`, `.rpm`, AppImage via GitHub Actions
- **Security** — session tokens + API keys in VS Code SecretStorage (OS keychain), webview CSP with per-render nonce, SSH command allowlist, host-key pinning

## Quick start (users)

1. Download the installer for your platform from [Releases](https://github.com/Ritzky/CapixIDE/releases).
2. On first launch, Capix IDE asks: "Import from VS Code / JetBrains?" — pick one to pull in your themes, keybindings, and extensions.
3. Run **Capix: Connect Wallet** (Command Palette) and paste your `cpx_session.…` token from capix.network.
4. Your profile, deploys, and instances sync automatically.
5. Deploy an LLM from the Model Catalog → when ready, the chat panel auto-configures.
6. Or launch `capix-code` in the terminal via **Capix: Launch Capix Code**.

See [`docs/getting-started.md`](docs/getting-started.md) for the full walkthrough.

## For developers — building from source

```bash
git clone https://github.com/Ritzky/CapixIDE.git
cd CapixIDE
./scripts/bootstrap.sh   # clones Void (VS Code fork) + applies the rebrand + installs the extension
./scripts/dev.sh         # launches the dev Electron build
```

This repo is the **rebrand kit + extension + builder pipeline**. The full VS Code source (~1GB) lives in `vscode/` after `bootstrap.sh` clones it.

To package distributable installers:

```bash
./scripts/build.sh       # builds the app for your current platform
npx electron-builder --mac --arm64 --config electron-builder.yml
```

For CI/cross-platform release builds, tag a version and the [Release workflow](.github/workflows/release.yml) builds all 6 platform/arch combos in parallel.

### What the repo contains

```
CapixIDE/
├── product.json                          # branding (nameShort, bundle id, icons, marketplace)
├── electron-builder.yml                   # .dmg/.exe/.deb/.rpm/AppImage packaging
├── extensions/capix-llm/                  # the built-in sidebar extension (all panels + commands)
│   ├── src/extension.ts                  # entry point — registers all commands
│   ├── src/apiClient.ts                  # HTTP client (SecretStorage-backed auth)
│   ├── src/treeViews.ts                  # Deploys / Catalog / Hosted tree views
│   ├── src/cloudPanels.ts                # Instances / Agents / Jobs / API Keys tree views
│   ├── src/profileView.ts               # Profile webview (balance, billing, top-up)
│   ├── src/terminalManager.ts           # SSH terminals + capix-code launcher
│   ├── src/autoConnect.ts               # Auto-configure chat when LLM deploy goes live
│   ├── src/covenant.ts                  # Memory + governance + spirit prompt
│   ├── src/customLlmDiscovery.ts         # HF model card auto-detection (not yet — in protocol repo)
│   └── package.json                      # extension manifest (8 views, 30+ commands)
├── scripts/
│   ├── bootstrap.sh                      # clone Void + rebrand + install extension
│   ├── rebrand.sh                        # search-replace Void → Capix IDE
│   ├── jetbrains-importer.mjs           # IntelliJ/PyCharm → VS Code settings translator
│   ├── dev.sh                            # launch dev build
│   └── build.sh                          # produce packaged app
├── .github/workflows/release.yml         # 6-platform CI build
├── resources/                            # icons, entitlements
└── docs/                                 # getting-started, llm-deploy, contributing, guide
```

### How Capix IDE is built

Capix IDE is a **derivative work** of Void (Apache-2.0) and VS Code (MIT):

- **Void** is a VS Code fork that adds an AI chat panel, settings importer, and OpenAI-compatible LLM dispatch.
- This repo contains the **rebrand kit** (`product.json`, `rebrand.sh`), the **built-in extension** (`extensions/capix-llm/`), the **JetBrains importer**, the **electron-builder config**, and the **release workflow**.
- `scripts/bootstrap.sh` clones Void into `vscode/`, runs the rebrand (Void → Capix IDE), copies the extension into `vscode/extensions/capix-llm/`, and drops the Capix logo + branding.

## License

- **Capix IDE extension + rebrand kit** (`extensions/`, `scripts/`, `electron-builder.yml`, docs): Apache-2.0, Copyright 2026 Capix.
- **Void editor** (the chat panel, settings service, LLM dispatch): Apache-2.0, Copyright 2025 Glass Devtools, Inc.
- **VS Code core**: MIT, Copyright Microsoft Corporation.

See `LICENSE`, `NOTICE`. "Void" and "Visual Studio Code" are NOT used by Capix IDE — rebranding is the license-compliant path.

## Links

- **Capix Protocol** — [capix.network](https://capix.network) · [github.com/Ritzky/Capix-Protocol](https://github.com/Ritzky/Capix-Protocol)
- **Capix Code** (CLI assistant) — [github.com/Ritzky/capix-code](https://github.com/Ritzky/capix-code)
- **Void editor** (upstream) — [github.com/voideditor/void](https://github.com/voideditor/void)
- **VS Code** (base) — [github.com/microsoft/vscode](https://github.com/microsoft/vscode)
