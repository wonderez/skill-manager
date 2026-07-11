<div align="center">

# Skill Manager

**The web-first, team-ready hub for AI Agent Skills.**

Centralize · Discover · Lint · Synchronize · Federate

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Made with React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)]()
[![Powered by pnpm](https://img.shields.io/badge/pnpm-required-F69220?logo=pnpm&logoColor=white)]()
[![Windows](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)]()
[![Stars](https://img.shields.io/github/stars/yourname/skills_enhance?style=social)]()

</div>

---

## 📖 Why Skill Manager?

Every AI coding tool — Claude Code, Cursor, Codex, Windsurf, Copilot — stores its skills in a different folder. Skills drift out of sync, duplicates pile up, secrets leak into shared files, and onboarding a new teammate means hand-copying dozens of `SKILL.md` files.

**Skill Manager** solves this with a **web-first, hub-and-spoke** architecture:

- One **Storage Hub** is the source of truth for every skill.
- **Managed Paths** watch every AI tool's skills directory.
- **Lint** scores each skill 0–100 for security, structure, and quality.
- **Mesh Federation** lets multiple machines or teammates share skills peer-to-peer.
- **Browser access** — no install, no Tauri/Electron runtime. Just `pnpm dev:all` and open `http://localhost:5173`.

## ✨ Highlights

### Differentiated capabilities (not found in Tauri-only competitors)

| Capability | Skill Manager | Tauri skills-manage | jiweiyeah | VSCode Claude Manager Pro |
|---|:---:|:---:|:---:|:---:|
| **Web UI / remote access** | ✅ Browser | ❌ Desktop only | ❌ Desktop only | ❌ VSCode only |
| **Mesh federation (P2P share)** | ✅ Built-in | ❌ | ❌ | ❌ |
| **Lint health score (0–100)** | ✅ 3-tier | ❌ | ❌ | ⚠ Basic audit |
| **Version snapshot + rollback** | ✅ `.snapshots/` | ❌ | ❌ | ❌ |
| **Storage Hub full backup** | ✅ Independent | ❌ (mixed w/ lib) | ❌ | ⚠ Gist |
| **Managed Paths + duplicate detection** | ✅ Sources array | ❌ | ❌ | ❌ |
| **Multi-platform install (Junction)** | ✅ 17+ adapters | ✅ 27+ | ✅ 3 | ⚠ Claude only |
| **Marketplace (skills.sh)** | ✅ Proxy + GitHub import | ✅ | ❌ | ⚠ Catalog |
| **GitHub / .zip / .skill import** | ✅ Built-in | ❌ | ⚠ Manual | ❌ |
| **Collections (group + export)** | ✅ Manifest JSON | ❌ | ❌ | ❌ |
| **SKILL.md Markdown editor** | ✅ Edit + Live preview | ❌ | ❌ | ❌ |
| **Format transpile (.mdc/.windsurfrules/…)** | ✅ | ❌ | ❌ | ❌ |
| **Team-ready (multi-user)** | ✅ Web model | ❌ Single-user | ❌ Single-user | ❌ |

### Core features

- **🎯 Managed Paths** — auto-discovered + manually managed skill directories with platform name, universality flag, and existence status persisted to config.
- **🧹 Lint Engine** — 0–100 score with A–F grade, scans for API keys (OpenAI / AWS / GitHub / Google), passwords, internal URLs, missing frontmatter, oversize files, broken references.
- **🗂️ Storage Hub** — `~/.skills_hub/` keeps an authoritative copy of every skill. Updated skills are backed up here automatically; the hub itself never participates in direct use.
- **♻️ Version Snapshots** — `<skill>/.snapshots/<ISO>/` let you roll back any skill to a prior state.
- **🔀 Format Transpile** — SKILL.md → Cursor `.mdc`, Windsurf `.windsurfrules`, Copilot instructions, Cline `.clinerules`.
- **🌐 Agent Mesh** — decentralized node graph with shared memory, agent messaging, and federation registries for cross-machine skill sharing.
- **🪟 Browser UI** — React 19 + Vite + Vanilla CSS glassmorphism. No native runtime, accessible from any device on the LAN.
- **🧩 Platform Adapters** — 17+ adapters (Claude Code, Cursor, Codex, Windsurf, Copilot, Cline, TRAE, Antigravity, Goose, Gemini CLI, Amp, Roo Code, Kilo Code, Aider, OpenCode, Cline, Continue…).
- **🌍 i18n** — English / Chinese, auto-detected from `navigator.language`.
- **🔎 Duplicate-aware dashboard** — skills with the same name are grouped and each source shows symlink status, real-file flag, symlink target, platform, and per-source health.

## 🚀 Quick Start

```powershell
# Install dependencies
pnpm install

# Start frontend + backend together (recommended)
pnpm dev:all

# Or use the one-click launcher
.\start.bat
```

Open **http://localhost:5173** in any browser.

- Backend API: `http://localhost:3001`
- Frontend dev server: `http://localhost:5173`

## 🏗️ Architecture

```
skills_enhance/
├── server/                    # Backend Express service
│   ├── index.ts               # REST API surface
│   └── services/              # Static-method service layer
│       ├── adapters.ts        # 17+ PlatformAdapter impls
│       ├── config.ts          # UserConfig + ManagedPathInfo persistence
│       ├── path.ts            # Managed Paths discovery w/ metadata
│       ├── lint.ts            # 0–100 health scoring engine
│       ├── optimize.ts        # Rule-based SKILL.md optimization
│       ├── version.ts         # Snapshot & rollback
│       ├── import.ts          # GitHub repo import + sub-skill scan
│       ├── transpiler.ts      # Format translation engine
│       ├── sync.ts            # Two-way sync engine
│       ├── market.ts          # Marketplace service
│       └── mesh.ts            # Agent Mesh P2P service
├── src/                       # Frontend React 19 app
│   ├── App.tsx                # Dashboard / Market / Settings tabs
│   ├── types.ts               # Shared TypeScript types
│   ├── translations.ts        # en / zh i18n strings
│   ├── components/            # Toast, EmptyState, InlineModal
│   ├── hooks/                 # useAppState, useMesh, useMarket,
│   │                          # useSync, useTranspile, useApi
│   └── __tests__/             # Vitest unit tests
├── public/                    # Static assets
├── start.bat                  # Windows one-click launcher
├── vite.config.ts             # Vite + proxy + vitest
└── package.json
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 8, Framer Motion, Lucide React |
| Backend | Node.js ≥ 20, Express 5, fs-extra, gray-matter |
| Styling | Vanilla CSS + CSS variables (glassmorphism) |
| Testing | Vitest, @testing-library/react |
| Package Manager | pnpm ≥ 9 (required) |
| Language | TypeScript ~6.0.2 strict |

## 📋 Commands

```powershell
pnpm install      # Install dependencies
pnpm dev:all      # Start frontend + backend together
pnpm dev          # Frontend only
pnpm server:dev   # Backend with hot reload
pnpm server       # Backend, single run
pnpm build        # Type check + production build
pnpm lint         # ESLint check
pnpm test:run     # Run unit tests
```

## 🔧 Configuration

- **User config**: `~/.skills_enhance_config.json` (singleton, cached in `ConfigService`).
- **Storage Hub**: `~/.skills_hub/` (authoritative skill copies).
- **Managed Paths**: persisted inside `UserConfig.managedPaths` with `{ path, platformName, isUniversal, isCustom, exists }`.
- **Snapshots**: `<skill>/.snapshots/<ISO-timestamp>/`.
- **API proxy**: `vite.config.ts` proxies `/api/*` → `http://localhost:3001`.

## 🗺️ Roadmap

### ✅ Shipped
- v1.0 Format Translation Engine (Cursor / Windsurf / Copilot / Cline)
- v2.0 Two-Way Sync Engine
- v3.0 Smart Market + MCP Fusion
- v5.0 Agent Mesh (P2P skill sharing)
- v5.1 Managed Paths with duplicate detection
- v5.2 Storage Hub as independent backup layer
- v5.3 skills.sh marketplace proxy (leaderboard / search / curated / detail / audit)
- v5.3 GitHub repository + .zip / .skill archive import with sub-skill auto-scan
- v5.3 User Collections (named groupings with color/icon, export as JSON manifest)
- v5.3 SKILL.md Markdown editor with live preview and atomic save

### 🔜 Planned
- **Monaco editor** upgrade for SKILL.md (currently lightweight textarea + preview)
- **Team workspaces** with multi-user Mesh federation
- **Web remote access** hardening (auth, TLS, LAN discovery)
- **Cross-platform support** (macOS / Linux symlinks)
- **Skill dependency graph** visualization

See the [open issues](../../issues) for the full wishlist.

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Setting up the dev environment
- Code style and conventions
- Submitting pull requests
- Reporting bugs and suggesting features

### Good first issues

- Add a new platform adapter in `server/services/adapters.ts`
- Improve Lint rules in `server/services/lint.ts`
- Add a translation language in `src/translations.ts`
- Write more unit tests in `src/__tests__/`

## 📊 Project Status

| Metric | Value |
|--------|-------|
| Platforms supported | 17+ |
| Lint rules | 15+ (security / structure / quality) |
| Languages | English, Chinese |
| Tests | 8 passing |
| Build | ✅ Passing |
| License | MIT |

## 📝 Documentation

- [AGENTS.md](AGENTS.md) — AI agent working guidelines
- [MEMORY.md](MEMORY.md) — Project decisions and known pitfalls
- [DESIGN.md](DESIGN.md) — Design system specifications

## 📄 License

MIT — see [LICENSE](LICENSE).

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yourname/skills_enhance&type=Date)](https://star-history.com/#yourname/skills_enhance&Date)

---

<div align="center">

Made with ❤️ for the AI developer community.

If Skill Manager saves you time, please consider [starring ⭐](../../stargazers) the repo.

</div>
