# Changelog

All notable changes to VibeLens will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-04-28

### Fixed
- **Edit-mode and annotation-mode outlines now render their intended colors.** Three style strings used template-literal placeholders inside single-quoted strings, so `${T.cyan}` and `${T.violet}` were being assigned to CSS as the literal text "${T.cyan}" rather than the interpolated color. Browsers discarded the invalid CSS, leaving outlines without color since the feature shipped. Now rendering cyan in edit-mode and violet in annotation-mode as designed.

## [0.1.0] — 2026-04-28

First public release. Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/vibelens/ioohnmnbefdobfonfhlbglgonkdifhll) and on [GitHub](https://github.com/shandar/VibeLens) under MIT.

### Added
- **Visual CSS inspector** — click any element for a full breakdown (box model, typography, background, borders, effects); edit values inline with color pickers, number inputs, and dropdowns
- **Live text editing** — double-click text to edit content directly on the page
- **State forcing** — pin `:hover`, `:active`, or `:focus` to inspect and edit interactive styles without losing focus
- **WCAG contrast checking** — inline AA/AAA badges with one-click auto-fix to the nearest accessible color
- **CSS variable inspection** — resolve `var(--token)` values, edit the token, preview the cascade across all consumers
- **Layout overlays** — visualize grid lines, flex direction, and gap from a single layout badge
- **Visual diff** — toggle with `Cmd+Shift+D` to see what changed between page loads (added / modified / removed)
- **Annotations** — pin notes anchored to DOM selectors that survive reloads and resizes; export as AI-ready prompts
- **Source write-back (optional)** — connect a project folder to write changes directly to CSS, JSX, or Vue files via the local bridge
- **Bridge core** — Node.js + WebSocket on `ws://localhost:9119` with AST-aware writers for CSS, JSX, and Tailwind
- **Distribution** — Chrome Web Store listing, MIT license, monorepo open-sourced on GitHub

### Fixed
- WebSocket race condition causing unreliable status delivery on reconnect
- EMFILE error in the file watcher under heavy filesystem load
- Sidepanel asset paths now resolve correctly when the extension is installed via the Chrome Web Store

## Planned Releases

- **v0.2.0** — Source sync improvements, undo / redo, broader framework coverage
- **v0.3.0** — Timeline: screenshot history, before / after comparison
- **v0.4.0** — Framework adapters: Vue, Svelte, Tailwind variants, Firefox port
- **v0.5.0** — AI integration: tool-specific export, webhook API

[Unreleased]: https://github.com/shandar/VibeLens/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/shandar/VibeLens/releases/tag/v0.1.1
[0.1.0]: https://github.com/shandar/VibeLens/releases/tag/v0.1.0
