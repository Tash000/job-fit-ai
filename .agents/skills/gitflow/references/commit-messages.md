# Conventional Commits — Cheat Sheet

```
<type>(<scope>): <subject>
<BLANK LINE>
<body — bullets of what changed per file/area, and why>
```

## Types

| Type       | Use when                                                |
|------------|---------------------------------------------------------|
| `feat`     | A new feature or user-facing capability                  |
| `fix`      | A bug fix                                                |
| `refactor` | Code change with no behavior change                      |
| `perf`     | Performance improvement                                  |
| `test`     | Adding or fixing tests                                   |
| `docs`     | Documentation only                                       |
| `style`    | Formatting, whitespace, lint-only changes                |
| `chore`    | Tooling, config, deps, build scripts                     |
| `build`    | Changes to the build system or dependencies              |
| `ci`       | CI/CD config and workflows                               |

## Scope

A short noun for the area: `backend`, `frontend`, `api`, `db`, `auth`,
`ats`, `exporter`, `types`, `tests`, `admin`, `pwa`, `config`.

## Subject rules

- Imperative mood ("add", "fix", "refactor" — not "added", "fixes")
- ≤ 72 characters
- Lowercase after the colon, no trailing period

## Body rules

- One bullet per file/area with the concrete change
- Explain **why** only where it isn't obvious from the code
- Reference issues/PRs in the body or subject: `Refs #14`, `Closes #9`

## Examples

```
feat(backend): add admin console API

- GET /api/admin/overview — users/applications/storage totals + activity
- PATCH /api/admin/users/{id} — per-user analysis/resume limit overrides
- all admin endpoints guarded by an admin check (403 for non-admins)
```

```
fix(frontend): parse backend UTC timestamps as UTC

- new lib/dates.ts parses naive-UTC ISO strings as UTC so displayed
  times are correct in any timezone (was off by the local UTC offset)
```

```
test(backend): cover duplicate-job detection

- same company + JD returns 409 with reference to the existing app id
- near-duplicate titles still allowed (only literal duplicates blocked)
```

## Anti-patterns

- "WIP", "fix stuff", "changes", "update" — no information
- Mixing backend + frontend in one commit — split by unit
- `git add -A` across unrelated files
- Committing generated/build artifacts
- Committing `.env` or secrets (see main SKILL safety rules)
