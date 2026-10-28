# GitKraken vs Git Graph — feature gap (2026-10-27)

Sources: GitKraken Desktop 12.6.1 explored on this Mac (trial), and the plan matrix on
[gitkraken.com/pricing](https://www.gitkraken.com/pricing) and [gitkraken.com/ai](https://www.gitkraken.com/ai).

## How GitKraken uses AI (seen in the app)

| Where                       | Control                                    | What it does                                                                                                    |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Commit panel, summary field | ✨ button at the right of "Commit summary" | Writes the summary + description from the staged diff                                                           |
| Commit panel footer         | **Compose commits with AI**                | Splits the working-tree changes into several logical commits, each with a message, for review before committing |
| Commit details header       | **Recompose commit with AI** ▾             | Rewrites an existing commit (or a range) into a cleaner set of commits — history rewrite                        |
| Same dropdown               | **Explain commit**                         | Opens "Explaining 1 commit" in the right panel: summary of what changed and why                                 |
| Merge conflict view         | AI Resolve / Auto-resolve with AI          | Suggests a resolution per conflict with a confidence score and rationale; manual take-side fallback             |
| PR creation, stash          | —                                          | AI PR title/description, AI stash message                                                                       |
| Branch                      | —                                          | Explain branch changes                                                                                          |

Every first use shows a consent bar ("GitKraken AI can send code snippets, diffs, and other
context to an AI provider") with Accept / Cancel. I cancelled it, so nothing was sent. AI usage
is metered in weekly credits (1M–4M per seat by tier) and you can bring your own key on higher tiers.

**Suggested shape for Git Graph:** a ✨ "Write message" button in the Changes commit box (staged
diff → `claude` / API → summary + body), then "Explain commit" in the commit inspector. Both are
read-only and need no history rewrite. Compose/Recompose come after that. Show a one-time consent
notice, as GitKraken does.

## What GitKraken has that Git Graph does not

Legend: **P1** worth doing soon · P2 nice to have · P3 team/enterprise, probably skip.

### Core Git workflow

- **P1 Undo / redo of the last Git action** (toolbar Undo/Redo: checkout, commit, reset, branch delete…).
- **P1 Visual interactive rebase** (drag to reorder, squash, fixup, reword, drop).
- **P1 3-pane merge conflict editor** (ours / theirs / output, per-hunk take). We only hand off to an external merge tool.
- **P1 Line/hunk-level staging and discard** in the diff view.
- **P1 File history and blame** views.
- P2 Drag-and-drop on the graph (drag branch onto branch = merge/rebase menu).
- P2 Reset (soft / mixed / hard) to a commit, and create a branch at a commit from the graph.
- P2 Commit hiding / soloing of branches in the graph (we only scope to one branch).
- P2 Multiple repo **tabs** in one window (we switch repositories in place).
- P2 Multi-repo fetch/pull ("Workspaces").
- P2 Submodules, Git LFS, Git hooks UI, Gitflow.
- P2 GPG/SSH commit signing toggle; one-click SSH key generation.
- P2 Worktree create/remove (we list worktrees read-only).
- P3 Multiple profiles (identities / settings sets).

### Integrations

- P2 GitLab, Bitbucket, Azure DevOps (we are GitHub-only), and their self-hosted versions.
- P2 Issue trackers: Jira, GitHub Issues, GitLab, Trello (sidebar "ISSUES" + create branch from issue).
- P2 Launchpad: one inbox of PRs/issues across repos with pin and snooze. Our CI/CD overview covers part of this for checks.

### Terminal

- ✅ In-app terminal is now in Git Graph (this change). GitKraken goes further: the terminal is
  "Git-enhanced", with auto-suggest and the graph refreshing live from commands typed there.
  Our file watcher already refreshes the graph.

### AI agents (new in GitKraken 12.x)

- P2 **Agents** tab: launch Claude Code / Codex / Copilot CLI / Gemini CLI sessions per worktree and see each
  session's worktree status. This fits our worktree list well.

### Team / cloud (P3)

- Cloud Patches (share uncommitted changes), Code Suggest, Cloud Workspaces, team-filtered graph,
  predictive conflict alerts (teammate editing the same lines), Insights, SSO/audit logs.

## What Git Graph already has that GitKraken charges for or lacks

- GitHub Actions view with live runs and logs, plus a cross-repo **CI/CD overview**
  (release, deployments, failing checks). GitKraken has no Actions view.
- PR review inside the app, free (GitKraken needs Pro for private repos).
- Native, small (Tauri) and free; Chinese UI.
