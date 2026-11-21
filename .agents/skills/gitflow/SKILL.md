---
name: gitflow
description: >-
  End-to-end GitHub delivery workflow: inventory changes, create a conventional
  feature branch, make atomic commits per file/area with descriptive messages,
  validate (tests/lint/typecheck/build), push, open a pull request with a full
  body, review, merge to main, delete the branch, sync local main, and manage
  GitHub Projects tasks (create, assign, mark complete). Use when the user asks
  to commit changes, create a PR, merge to main, run a release workflow, make
  the git history look professional, or set up/complete GitHub Projects tasks.
---

# Git Release Workflow

Ship a feature the professional way: a clean branch, atomic commits that tell a
story, a reviewable PR, a clean merge, and a GitHub Projects trail that shows
tasks were created, claimed, and completed.

## Principles

- **Works solo AND in teams.** In a personal repo the agent may run the full
  cycle; in a company repo it obeys branch protection — it never bypasses
  required reviews, required checks, or CODEOWNERS, and never merges a PR that
  the repo's rules don't allow. It CANNOT override GitHub's own protections.
- **One PR = one feature/fix.** Never bundle unrelated work into a single PR.
- **Atomic commits.** Each commit is one logical unit (backend, frontend,
  tests, docs, config) and must leave the tree buildable.
- **Commits tell the story.** The history should read like a changelog: a
  reader can see exactly what changed in each file and why.
- **Never merge broken code.** CI green, tests green, lint/typecheck clean, and
  build succeeds — or no merge.
- **Ask before destructive actions.** Anything with `force`, `reset --hard`,
  `branch -D` on a shared branch, or touching `main` directly requires explicit
  user confirmation.

## Workflow

### Phase 0 — Inventory & plan (always first)

1. Check what changed and where:
   ```bash
   git status --short
   git diff --stat | tail -20
   ```
2. Group the changes into **logical units** — derive the groups from the
   ACTUAL changed paths (`git status --short`), not a template. Typical groups
   in a full-stack repo: `backend/`, `frontend/`, `tests/`, `docs/`, `config/`,
   `scripts/`, `workflows/` — but a Python-only, docs-only, or any other repo
   gets whatever groups fit ITS files. Nothing is hard-coded to a stack.
3. Choose a branch name from the largest unit:
   `feat/<feature>` · `fix/<issue>` · `chore/<task>` · `refactor/<area>`
   (e.g. `feat/admin-console`, `fix/session-idle-timeout`).
4. Decide the commit split BEFORE staging: one commit per unit above.

### Phase 1 — Create the feature branch

```bash
git checkout main
git pull origin main          # start from latest
git checkout -b feat/<feature>
```

- If the user has an existing workflow (e.g. `feat/...` branches from earlier
  features), keep the same naming convention.

### Phase 2 — Atomic commits (one unit per commit)

For each logical unit: `git add <paths>` then commit. Do NOT `git add -A`
across mixed units.

**Commit message format — Conventional Commits:**

```
<type>(<scope>): <imperative summary, ≤72 chars>

- bullet point what changed, per area/file
- explain WHY where it isn't obvious
```

- `feat(backend)` `fix(frontend)` `test(...)` `docs(...)` `chore(...)`
  `refactor(...)` `perf(...)` `style(...)` — pick the type that fits the unit.
- The summary states the change; the body lists concrete details per file/area.
- Example:
  ```
  feat(backend): add per-user analysis/resume limit overrides

  - UserSettings.analysis_limit/resume_limit columns + idempotent migration
  - PATCH /api/admin/users/{id} sets overrides (0 resets to default)
  - create_application/create_resume enforce effective limits
  - tests: test_admin_console.py covers grant/revoke + limit enforcement
  ```

**Never commit:** `.env` files, secrets, keys, `node_modules/`, build output
(`dist/`, `build/`), local databases, or anything gitignored. If a secret was
staged, `git rm --cached` it immediately and rotate the secret.

Verify the story:
```bash
git log --oneline -5
```

### Phase 3 — Validate before PR (non-negotiable)

Run the project's checks and FIX failures before opening the PR:

- Backend: `pytest` (or the project's test runner)
- Frontend: linter, typecheck, production build
  (e.g. `npx oxlint && npx tsc -b && npm run build`)
- Browser-verify UI changes when applicable (navigation, key flows, console
  errors)

If validation finds issues, fix them as **new commits** (or `--amend` only on
unpushed local commits). The final tree must be green.

### Phase 4 — Push & open the PR

```bash
git push -u origin feat/<feature>
```

Write the PR body to a file first (avoids shell-escaping pain with multiline
markdown), then:

```bash
gh pr create --repo <owner>/<repo> --base main --head <branch> \
  --title 'feat: <summary>' --body-file /tmp/pr_body.md
```

**PR body template** (see `references/pr-template.md`):
- **What this adds** — one paragraph
- **Changes** — bullets grouped by backend / frontend / tests
- **Security/behavior notes** — anything important (loopholes closed, migration
  impact, config changes)
- **Validation** — exact commands run and results
- Reference issue/PR numbers (`Fixes #12`) to auto-link and close GitHub
  Projects items.

If `gh pr create` output doesn't echo the PR number, find it:
```bash
gh pr list --repo <owner>/<repo> --head <branch> --json number -q '.[0].number'
```

### Phase 5 — Review & CI

- `gh pr checks <n> --repo <owner>/<repo>` — wait for CI green.
- Address review comments with follow-up commits on the same branch; push
  again. Respond to each thread. Do not resolve threads manually unless the
  skill/repo convention requires it (some repos resolve programmatically via
  the GraphQL API).

### Team mode — protected branches (company repos)

Before merging, ALWAYS determine who is allowed to merge:

1. **Detect branch protection** on the target branch:
   ```bash
   gh api repos/<owner>/<repo>/branches/main/protection --jq . 2>/dev/null || echo "no protection"
   ```
   Look for `required_pull_request_reviews`, `required_status_checks`,
   `required_approving_review_count`, `restrictions` (CODEOWNERS).
2. **Protected repo → STOP at merge.** Once checks are green:
   - If required approvals/reviews are still pending, do NOT merge. Report the
     PR as **ready for review** and stop. Never request admin bypass, never
     ask someone to approve without reviewing, never force-push to make
     checks pass, never merge with failing checks.
   - When approvals are in and all checks pass, merging is allowed — the repo
     itself permits it.
3. **Unprotected/solo repo → confirm first.** Only merge after (a) checks are
   green AND (b) the user asked for a merge or this is a known personal repo
   where the user's standing instruction is to complete the cycle.
4. If it's unclear whether the user owns the repo or has merge permission,
   ASK instead of merging.

### Phase 6 — Merge & cleanup

```bash
gh pr merge <n> --repo <owner>/<repo> --merge --delete-branch
gh pr view <n> --repo <owner>/<repo> --json state,mergedAt -q '{state,mergedAt}'
git checkout main
git pull origin main
git fetch origin --prune          # drop remote-tracking refs of deleted branches
git branch -d feat/<feature>      # delete the local branch (only after merge)
git status --short                # confirm clean
```

- Use `git branch -d` — it refuses to delete branches with unmerged work. If the
  merge is confirmed but `-d` still refuses (commits not reachable locally),
  escalate to `-D` only after verifying the branch exists on the remote PR.
- Merge step applies the Team-mode rules above: protection detected → only
  merge when the repo's rules are satisfied; no protection → only with the
  user's go-ahead (or a standing instruction on a personal repo).
- For repos with a merge queue or auto-merge: `gh pr merge <n> --auto` still
  respects required checks and reviews — it only merges when the repo allows.

- Default to `--merge` unless the repo uses squash or rebase merges — match the
  repo's existing history style.
- Verify the merge actually happened (`state: MERGED`) before cleanup.

### Phase 7 — GitHub Projects task management

Make the board tell the story:

1. **Create tasks** — one per correction/feature/commit group, with a clear
   title describing the deliverable.
2. **Claim/assign** — assign the tasks (the user's account) and move them to an
   "In progress" column.
3. **Mark complete after merge** — once the PR is merged, mark all related
   tasks done. Link PRs/issues to tasks so the board shows the trail.
4. Use the `gh` CLI (or GitHub web) consistently; if the project uses
   automation (issue→project sync), create the issues first and let the
   automation add them to the board.

## Safety rules

- **Never push directly to `main` or a protected branch.** Always feature
  branches + PR.
- **Never force-push** a branch others work on. The only sanctioned exception:
  `git push --force-with-lease` on your OWN unreviewed branch, and only with
  user approval — never plain `--force`.
- **Never merge with failing CI or red checks.**
- **Confirm before:** force push, `git reset --hard`, deleting branches that
  may hold unmerged work, `git push --delete` on shared remotes, or any
  command affecting production environments.
- **Always specify `--repo <owner>/<repo>`** for `gh` commands when the local
  remote is ambiguous, and verify the remote (`git remote -v`) before pushing.
- If a commit accidentally includes a secret, do NOT rely on history rewrite
  alone — remove the value from the remote AND rotate/revoke the credential.

## Checklist before finishing

- [ ] Branch created from latest `main`
- [ ] Commits atomic, conventional, one unit each; history reads like a changelog
- [ ] No secrets / env files / build artifacts committed
- [ ] Tests, lint, typecheck, build all green
- [ ] PR opened with full body; CI green; review comments addressed
- [ ] PR merged; branch deleted locally + remotely; local `main` synced
- [ ] GitHub Projects tasks created, assigned, and marked complete

## References

- [commit-messages.md](./references/commit-messages.md) — Conventional Commits cheat sheet
- [pr-template.md](./references/pr-template.md) — PR body template
- [gh-cli-cheatsheet.md](./references/gh-cli-cheatsheet.md) — exact `gh` commands used in this workflow
