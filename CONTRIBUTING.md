# Contributing to Skill Manager

Thanks for your interest in improving Skill Manager! This document will get you up and running in a few minutes.

## 🚀 Setup

**Prerequisites**

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)
- Windows 11 (current target; macOS/Linux contributions are welcome — see [Roadmap](README.md#-roadmap))

**Install & run**

```powershell
git clone https://github.com/yourname/skills_enhance.git
cd skills_enhance
pnpm install
pnpm dev:all
```

Open http://localhost:5173 to see the app.

## 🧭 Project conventions

Please read [AGENTS.md](AGENTS.md) before making changes — it contains the binding rules for this repository. The essentials:

- **Package manager**: Always `pnpm`. Never `npm` or `yarn`.
- **Styling**: Vanilla CSS + CSS variables from `src/index.css`. **No Tailwind, no CSS-in-JS.** Reuse existing `.glass-card` / `.btn` / `.nav-item` classes first.
- **Frontend state**: Function components + Hooks only. No state management libraries, no router libraries, no splitting `App.tsx` unless the user explicitly asks for a refactor.
- **Backend services**: Static class methods (`ConfigService.getConfig()` style), no instances.
- **TypeScript**: Strict mode. Avoid `any` except for transitional external-JSON fields.
- **Icons**: `lucide-react` only. Animations: `framer-motion` only.
- **Commits**: Imperative mood, first line ≤ 72 chars. Never `git push --force` to main.

## 🧪 Before submitting a PR

Run these locally — the CI runs the same checks:

```powershell
pnpm lint      # Must report 0 errors
pnpm build     # Must succeed
pnpm test:run  # Must pass
```

If you add a new feature, please add at least one Vitest test under `src/__tests__/`.

## 🧩 Good first issues

- **Add a platform adapter** — implement `PlatformAdapter` in `server/services/adapters.ts`, register it in `getAllAdapters()`, optionally extend `KNOWN_PACKAGES`.
- **Improve Lint rules** — add a new check in `server/services/lint.ts` (security, structure, or quality) and keep false-positives low.
- **Add a translation** — add a language to `src/translations.ts` and wire up the `navigator.language` detection.
- **Write tests** — every service in `server/services/` deserves coverage.
- **Improve docs** — better screenshots, clearer guides, more examples in `README.md`.

## 🐛 Reporting bugs

Open an issue with:

1. Skill Manager version (see `package.json`)
2. OS and Node.js version
3. Steps to reproduce
4. Expected vs actual behaviour
5. Backend logs (from the terminal running `pnpm server:dev`)
6. Browser console errors (if UI-related)

## 💡 Suggesting features

Open an issue with the `enhancement` label and describe:

1. The problem you're trying to solve
2. The user persona (individual dev / team / etc.)
3. Any alternatives you've considered

## 🌍 Code of conduct

Be kind. Be patient. Be specific when giving feedback. Assume good intent.

## 📦 Release process (for maintainers)

1. Update `version` in `package.json`
2. Update `## 📊 Project Status` in `README.md`
3. Commit: `chore: release vX.Y.Z`
4. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
5. Publish release notes on GitHub Releases

---

Thanks again — every issue, PR, and star helps. ❤️
