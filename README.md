# Git Graph

A desktop commit graph, grown out of the `claude-mods` Neovim pane. Tauri 2 + React 19 + Tailwind CSS 4.

## Run

```bash
pnpm install
pnpm app                         # tauri dev, opens the Welcome window
pnpm tauri dev -- -- ~/code/repo # open a repository straight away
pnpm bundle                      # release build: .app and .dmg in src-tauri/target/release/bundle
```

## Layout

```
assets/            design file (Nib), app icon, exported screens — see assets/README.md
scripts/tokens.ts  Nib variables → src/styles/tokens.css (+ Tailwind @theme) and src/lib/tokens.ts
src-tauri/         Rust: one `git` command, a repo watcher, Terminal/Finder helpers
src/lib/           git calls and parsers, the lane layout engine (ported from claude-mods, with its tests)
src/components/    the Nib components: ui (buttons, chips…), GraphCell, Diff, Chrome, Overlays
src/views/         History, Changes, Stashes, Welcome
```

## Styling

Tailwind is the only stylesheet. Its theme comes from the design file, so utilities are the Nib tokens:
`bg-sidebar`, `text-muted`, `border-subtle`, `text-ref-head`, `bg-diff-add-bg`, `rounded-md`, `text-sm`, `h-titlebar`, `w-inspector`.
The default palette is turned off, so nothing off-system can slip in.

Light/Dark follows the system or the status-bar toggle (`data-theme`); the repository state sets `data-stage`
(Clean / Working / Conflict / Rebasing), which drives the banner, stage dot and primary action, as in the design.

After editing the design in Nib:

```bash
./assets/sync-design.sh && pnpm tokens
```

## Keys

⌘K palette · ⌘1 History · ⌘2 Changes · ⌘3 Stashes · ⌘R refresh · ⌘O switch repository · ⌘⇧F fetch · ⌘⇧P push · ↑↓ / j k move through commits · ⌘↩ commit
