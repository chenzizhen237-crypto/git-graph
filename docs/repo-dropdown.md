# Repository dropdown

The repo picker at the left of the title bar (app icon, repository name, path, `⇅`) used to be a plain button: clicking it closed the repository and went back to the Welcome screen. It now opens a dropdown, so you can switch repositories without leaving the window.

Design: `Menu/Repositories` on the Components page and **24 · Repository dropdown** on the Desktop page of `assets/design/Git Graph Desktop.nib`.

## Layout

The menu hangs 4px under the picker, left-aligned with it, 340px wide, and uses the same surface as `Menu/Context` (elevated background, strong border, large radius, shadow). From top to bottom:

1. **Filter field**: focused when the menu opens. Typing narrows the recent list by repository name or path.
2. **RECENT** caption.
3. **Repository rows** (40px): folder icon, name, path (`~` for the home folder, truncated), the branch chip, and a check on the current repository. The current repository comes first with the selected background and its live branch; the others show the branch they were on when last open. Up to 8 rows.
4. Separator.
5. **Open repository…** `⌘O`: the folder dialog; the chosen folder opens in this window.
6. **Clone from GitHub…**: the clone dialog from Welcome; the cloned repository opens in this window.
7. **All repositories** `⇧⌘O`: the Welcome screen, which is what the button used to do.

While the menu is open the picker keeps its hover background.

## Behaviour

- Click the picker to open the menu; click it again, click outside, press `Esc` or switch away from the window to close it.
- `↑`/`↓` move the highlight through the repository rows and actions, `Enter` runs the highlighted one, and the mouse moves the same highlight.
- Picking a repository resolves its root (`findRoot`). If the folder is gone or no longer a Git repository, an error toast says so and it is dropped from the recent list. Picking the current repository just closes the menu.
- Switching repositories resets per-repository state (view, selection, log query), the same as opening it from Welcome.
- The command palette's **Open another repository…** runs **Open repository…** too.

## Not in scope

Removing entries from the recent list stays on the Welcome screen (hover a row, click ×).
