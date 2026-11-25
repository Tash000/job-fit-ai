# `gh` CLI Cheat Sheet (workflow edition)

All commands assume `gh auth login` is done. Add `--repo <owner>/<repo>`
whenever the local remote is ambiguous.

## Branch & push

```bash
git checkout main && git pull origin main
git checkout -b feat/<feature>
git add <unit paths> && git commit -m "type(scope): summary" -m "- detail"
git push -u origin feat/<feature>
```

## PR lifecycle

```bash
# create (body from a file — avoids quoting pain)
gh pr create --repo owner/repo --base main --head feat/<feature> \
  --title 'feat: summary' --body-file /tmp/pr_body.md

# find the PR number if not echoed
gh pr list --repo owner/repo --head feat/<feature> --json number -q '.[0].number'

# CI status
gh pr checks <n> --repo owner/repo

# merge (match the repo's history style: --merge | --squash | --rebase)
gh pr merge <n> --repo owner/repo --merge --delete-branch

# verify
gh pr view <n> --repo owner/repo --json state,mergedAt -q '{state,mergedAt}'
```

## Post-merge sync & cleanup

```bash
git checkout main
git pull origin main
git fetch origin --prune
git branch -d feat/<feature>     # local branch — only after confirmed merge (-D only if needed)
git status --short               # expect a clean tree
```

## GitHub Projects tasks

```bash
# list projects in a repo
gh project list --owner owner

# view items (id, title, status) in a project
gh project view <project-number> --owner owner --format json

# create an item (issue) — automation can add it to the project board
gh issue create --repo owner/repo --title "task: <deliverable>" --body "..."

# list/close issues by label or search
gh issue list --repo owner/repo --state open --limit 50
gh issue close <n> --repo owner/repo

# add an existing issue to a project (Projects v2 item)
gh project item-add <project-number> --owner owner --url https://github.com/owner/repo/issues/<n>
```

## Guardrails

- Always confirm the repo: `git remote -v` and `gh repo view` first.
- Never merge a PR with failing checks.
- `--delete-branch` deletes the REMOTE branch on merge; delete the local one
  yourself with `git branch -D` after verifying the merge.
- For project-board edits the `gh` CLI can be limited; the web UI or the
  GraphQL API (`gh api graphql -f query='...'`) are fallbacks.
