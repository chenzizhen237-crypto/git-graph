# Git Graph

A desktop commit graph for Git and GitHub: history, changes, stashes and pull requests in one window. It started as a Neovim pane and grew into an app.

![History](assets/screens/01-history-light-clean.png)

## Download

Get the latest installer for macOS, Windows or Linux from **[Releases](https://github.com/chenzizhen237-crypto/git-graph/releases/latest)**.

The builds are not signed with a paid certificate yet. On macOS, right-click the app and choose **Open** the first time (or run `xattr -cr "/Applications/Git Graph.app"`); on Windows choose **More info → Run anyway**.

Pull requests use the [GitHub CLI](https://cli.github.com): run `gh auth login` once.

## Features

- **History**: lane graph of all branches with labels, filters (branch, date, author, message), commit inspector and diffs; check out, branch, tag, cherry-pick, revert.
- **Changes**: stage / unstage / discard, resolve conflicts, commit, amend, commit & push.
- **Stashes**: apply, pop, drop.
- **Pull requests** (⌘4): list, conversation, review, merge, checks, files, new PR.
- **Diffs**: unified or side by side, wrap, pop out to full window.
- **Layout**: resizable panels, collapsible sidebar, overlay scrollbars.
- **Settings** (⌘,): auto-fetch, proxy for git and GitHub, theme, English / 简体中文.
- ⌘K palette and shortcuts throughout.

## Build from source

Needs Node 24, pnpm and Rust (plus the [Tauri prerequisites](https://tauri.app/start/prerequisites/) on Linux).

```bash
pnpm install
pnpm app                          # run in development
pnpm tauri dev -- -- ~/code/repo  # open a repository straight away
pnpm bundle                       # installers in src-tauri/target/release/bundle
pnpm check                        # typecheck, lint, format check, tests
```

## How it's built

- **Tauri 2** (Rust) runs `git` and `gh`, watches the repository, and talks to GitHub's API over one kept-alive connection. The GitHub token comes from `gh auth token` and never reaches the web view.
- **React 19 + TypeScript**, styled with **Tailwind CSS 4**. The Tailwind theme is generated from the design file's variables (`pnpm tokens`), so utilities like `bg-sidebar` or `text-ref-head` are the design tokens.
- The design lives in [`assets/design/Git Graph Desktop.nib`](assets/design); see [assets/README.md](assets/README.md).
- **Prettier** formats, **Biome** lints, **Vitest** tests; GitHub Actions builds every platform on each tag.

```
assets/            design file (Nib), app icon, screens
scripts/tokens.ts  design variables → CSS / Tailwind theme
src-tauri/         Rust: git, gh, GitHub client, watcher, proxy
src/lib/           git and GitHub data, graph layout, i18n, settings
src/components/    title bar, sidebar, diff, settings, palette…
src/views/         History, Changes, Stashes, Pull requests, Welcome
```

## Keys

⌘K palette · ⌘1–4 History / Changes / Stashes / Pull requests · ⌘, settings · ⌘\ sidebar · ⌘R refresh · ⌘O switch repository · ⌘⇧F fetch · ⌘⇧P push · ↑↓ / j k move · ⌘↩ commit

## License

[MIT](LICENSE)
