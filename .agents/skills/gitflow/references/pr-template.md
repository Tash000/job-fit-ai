# Pull Request Body Template

Write the body to a file (`/tmp/pr_body.md`) and pass it with `--body-file`
to avoid shell-escaping problems with multiline markdown.

```markdown
## What this adds
<One paragraph: the feature/fix and why it matters.>

## Changes
### Backend
- <endpoint or service change — what and where>
- <database/migration impact, if any>
### Frontend
- <page/component change — what the user now sees>
### Tests / config
- <new tests, CI/config changes>

## Behavior & security notes
- <anything important: e.g. a permission loophole closed, a new config
  variable (ADMIN_EMAILS), migration notes, breaking changes>
- <deployment notes if any>

## Validation
- Backend: `pytest` — N tests pass
- Frontend: `oxlint` clean, `tsc -b` clean, production build OK
- Browser-verified: <what you clicked/confirmed>

Closes #<issue or project item number if applicable>
```

## Tips

- Reference the issue/project item so the board auto-links: `Closes #12`
  (merge then marks the item complete if automation is set up).
- Keep it skimmable: headers, short bullets, no walls of text.
- If the PR touches data or permissions, ALWAYS call that out explicitly —
  reviewers (and your future self) need to know.
