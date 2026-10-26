# Git Graph — design assets

The desktop app design, grown out of the Neovim pane in `claude-mods`.

```
assets/
  design/Git Graph Desktop.nib   snapshot of the Nib workspace file "git-graph/Git Graph Desktop.nib"
                                 (Nib does not follow symlinks, so the live copy lives in the workspace;
                                 run ./assets/sync-design.sh after editing)
  sync-design.sh                 copies the workspace file into design/ (no exports)
  icon/app-icon.{png,svg}        tree-shaped commit-graph app icon
  screens/*.png                  2x exports of every Desktop frame
```

## Pages

| Page | Contents |
| --- | --- |
| Cover | Icon, pitch, live History instance |
| Foundations | Semantic colour boards (Light + Dark) and the Stage matrix |
| Components | Every reusable piece, from atoms up to whole windows |
| Desktop | 01–07 screens: theme- and stage-pinned instances of the window components |
| Neovim pane (source) | The original 470px pane frames, now bound to the new tokens |

## Variables

Three layers:

- **Primitives**: `neutral/*`, `blue|green|purple|amber|red/*`, `macos/*`. No theme axis.
- **Semantic (Mode: Light / Dark)**: `bg/*`, `border/*`, `text/*`, `accent`, `ref/*`, `lane/0–3`, `status/*`, `diff/*`, `shadow`. Every component paints with these only.
- **Stage (Clean / Working / Conflict / Rebasing)**: `stage/label`, `stage/color`, `stage/show-banner`, `stage/banner-*`, `stage/show-wip`, `stage/wip-text`, `stage/primary`, `stage/secondary`, `stage/changes`.

A screen is a frame that pins `{ Mode, Stage }` around a window instance. Pinning a different stage changes the banner, the WIP row, the status bar and the primary action without any overrides.

Metrics are variables too: `text/*`, `radius/*`, `space/*`, `size/titlebar|row|sidebar|inspector|statusbar`.

The old flat names (`bg`, `ink`, `muted`, `head`…) are kept as aliases so the Neovim frames still resolve.

## Components

- **Atoms**: Button/Toolbar · Primary · Secondary · Icon, Kbd, Avatar, Stage dot, Chip/Head · Local · Remote · Tag, Search field, Scope button, Segmented, Tab/Active · Inactive
- **Graph/Cell**: one 4-lane cell. Each instance switches on the pieces it needs (`g_l*` full lane, `g_t*`/`g_b*` half lanes, `g_n*` nodes, `g_d**` curved edges, `g_ring` HEAD)
- **Rows**: Row/Commit (with toggleable chip slots), Row/WIP, Row/Column header, Row/File, Menu/Item, Menu/Context, Menu/Repositories (see `docs/repo-dropdown.md`), Sidebar/Section, Sidebar/Item
- **Diff**: Diff/File header, Diff/Hunk, Diff/Context, Diff/Added, Diff/Removed
- **Chrome**: Window/Title bar, Banner/Operation, Window/Status bar, Window/Sidebar, App icon (+ Small)
- **Windows**: Window/History, Window/Changes, Window/Welcome, Command palette

The merge-conflict screen (04) is the same `Window/Changes` component as screen 03; only the `Conflict` stage and the content overrides differ.
