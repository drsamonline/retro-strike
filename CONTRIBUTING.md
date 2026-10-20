# 🤝 Contributing to RETRO STRIKE

Thanks for wanting to help! This is a small, dependency-free project, so contributions are easy to test.

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-fb923c.svg?style=flat-square)](pulls)

## 📋 Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything larger than a small fix, **open an issue first** so we can agree on the approach.
- Search existing [issues](issues) before filing a new one.

## 🧭 Where things live

| Path | What it is |
|---|---|
| `src/retro-strike.html` | The whole game — CSS + JS in one file. **Edit here.** |
| `dist/retro-strike.min.html` | Generated release. **Never edit by hand** — run `npm run build`. |
| `tools/build.mjs` | The minifier that produces `dist/` from `src/`. |
| `docs/` | Architecture, controls, performance notes and the code audit. |

## 🛠️ Development workflow

1. Fork the repo and create a branch:
   ```bash
   git checkout -b fix/short-description
   ```
2. Edit `src/retro-strike.html`.
3. Rebuild the release so `dist/` stays in sync:
   ```bash
   npm install
   npm run build
   ```
4. Test in a browser — desktop **and** a mobile viewport (DevTools device mode is fine).
5. Commit with a clear message and open a Pull Request.

## ✅ Guidelines

- **One logical change per PR.** Keep diffs focused.
- **Match the existing style** — the source is deliberately written in ES5-compatible `var`/`function` style for maximum browser reach. Please don't introduce build-time syntax the single file can't run directly.
- **No new runtime dependencies.** The game must keep working as a single offline file. Dev-only tooling (like `terser`) is fine.
- **Don't edit `dist/` by hand** — it's generated.
- **Test on touch and keyboard** if your change touches input or layout.
- **Keep it accessible** — respect the existing big-button / left-handed / large-HUD toggles.

## 🐛 Reporting bugs

Use the [bug report template](issues/new?template=bug_report.md) and include:

- What you did, what you expected, what happened.
- Browser + OS (and device, for touch issues).
- The **arena seed** shown on the title screen, if the bug is in a specific run.
- A screenshot or short clip if you can.

## 🎨 Suggesting features

Use the [feature request template](issues/new?template=feature_request.md). Explain the *problem* you want solved, not just the solution.

Thanks for making RETRO STRIKE better! 🎮
