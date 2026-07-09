# CapixIDE

The open-source AI IDE for the Capix protocol — a rebranded fork of the [Void editor](https://github.com/voideditor/void) (itself a fork of VS Code), with one-click import of VS Code / JetBrains settings and a built-in AI chat panel wired to your Capix LLM endpoint.

![CapixIDE](docs/capixide-hero.png)

## Download

Pre-built binaries for Mac, Windows, and Linux are on the [Releases page](https://github.com/Ritzky/CapixIDE/releases):

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | `CapixIDE-x.x.x-arm64.dmg` |
| macOS (Intel) | `CapixIDE-x.x.x-x64.dmg` |
| Windows | `CapixIDE-Setup-x.x.x.exe` |
| Linux | `CapixIDE-x.x.x.AppImage` / `.deb` / `.rpm` |

Or install via Homebrew (Mac):

```bash
brew install --cask capixide
```

## What is this?

CapixIDE is a full VS Code-compatible editor with:

- **AI chat panel** — a built-in sidebar (inherited from Void's React UI) that talks to any OpenAI-compatible endpoint. Point it at your self-hosted Capix LLM deploy, or at any provider (Anthropic, OpenAI, DeepSeek, Ollama, vLLM, etc.).
- **Capix LLM one-click deploys** — deploy a model to a GPU from inside the IDE and get an OpenAI endpoint back. See `/docs/llm-deploy.md`.
- **VS Code / Cursor / Windsurf settings import** — inherited from Void; copies your `settings.json`, `keybindings.json`, and extensions on first launch.
- **JetBrains settings import** — our addition; translates IntelliJ / PyCharm / WebStorm keymaps and color schemes into VS Code format.
- **Extension marketplace** — uses [Open VSX](https://open-vsx.org) (license-clean for forks), so thousands of VS Code extensions install normally.
- **Cross-platform** — signed `.dmg`, `.exe`, `.deb`, `.rpm`, and AppImage builds via GitHub Actions.

## Quick start (users)

1. Download the installer for your platform from [Releases](https://github.com/Ritzky/CapixIDE/releases).
2. On first launch, CapixIDE asks: "Import from VS Code / JetBrains?" — pick one to pull in your themes, keybindings, and extensions.
3. Open **Settings → AI** and choose your provider. To use a Capix-deployed LLM, set:
   - **Provider:** Capix (self-hosted)
   - **Base URL:** `http://<your-endpoint>/v1` (from capix.network → LLM Deploy)
   - **API key:** `cpxllm_...` (shown once at deploy time)
   - **Model:** (the model label you deployed, e.g. "Qwen2.5-Coder 7B")
4. Start chatting in the sidebar, or use **Cmd/Ctrl+I** for inline edits.

See [`docs/getting-started.md`](docs/getting-started.md) for the full walkthrough.

## For developers — building from source

```bash
git clone https://github.com/Ritzky/CapixIDE.git
cd CapixIDE
./scripts/bootstrap.sh   # clones Void (VS Code fork) + applies the rebrand
./scripts/dev.sh         # launches the dev Electron build
```

This repo is the **rebrand kit + builder pipeline**, not the full VS Code source (that's ~1GB and lives in `vscode/` after `bootstrap.sh` clones it). See ["How CapixIDE is built"](#how-capixide-is-built) below.

To package distributable installers:

```bash
./scripts/build.sh       # builds the app for your current platform
npx electron-builder --mac --arm64 --config electron-builder.yml   # produces .dmg
```

For CI/cross-platform release builds, the [Release workflow](.github/workflows/release.yml) tags a `v*` version and builds all 6 platform/arch combos in parallel.

### How CapixIDE is built

CapixIDE is a **derivative work** of Void (Apache-2.0) and VS Code (MIT):

- The **Void editor** is a VS Code fork that adds an AI chat panel, settings importer, and OpenAI-compatible LLM dispatch. Void was archived in mid-2026, making it a stable fork base.
- This repo (`CapixIDE/`) contains the **rebrand kit**: `product.json` (branding), `scripts/rebrand.sh` (search-replace Void → CapixIDE across the whole tree), `resources/icons/` (app icons), `electron-builder.yml` (packaging), `scripts/jetbrains-importer.mjs` (our JetBrains settings translator), GitHub Actions, and docs.
- `scripts/bootstrap.sh` clones Void into `vscode/` and runs the rebrand on top, producing a full, buildable CapixIDE source tree.

Void marks every change it made inside VS Code with the caps-sensitive word "Void" (images excepted) — per their own guidance, forking is a search-and-replace of `"Void"` → your brand and `"voideditor"` → your org. That's exactly what `rebrand.sh` does, plus our JetBrains importer and Open VSX marketplace swap.

## License

- **CapixIDE-authored code** in this repo (`scripts/`, `electron-builder.yml`, docs, the JetBrains importer): Apache-2.0.
- **Void-contributed code** (the chat panel, settings service, LLM dispatch under `src/vs/workbench/contrib/capix/` after rebrand): Apache-2.0, Copyright 2025 Glass Devtools, Inc.
- **VS Code core**: MIT, Copyright Microsoft Corporation.

See `LICENSE`, `NOTICE`, and `ThirdPartyNotices.txt`. The "Void" and "Visual Studio Code" names and logos are NOT used by CapixIDE — rebranding is the license-compliant path (same approach as VSCodium).

## Contributing

PRs welcome. For build issues, first run `./scripts/bootstrap.sh` clean and confirm you're on Node 20.18.2. See [`docs/contributing.md`](docs/contributing.md).

## Links

- **Capix Protocol** — [capix.network](https://capix.network) · [github.com/Ritzky/Capix-Protocol](https://github.com/Ritzky/Capix-Protocol)
- **Void editor** (upstream) — [github.com/voideditor/void](https://github.com/voideditor/void)
- **VS Code** (base) — [github.com/microsoft/vscode](https://github.com/microsoft/vscode)
