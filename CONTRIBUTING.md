# Contributing to Vitralume

Thanks for your interest in contributing! Vitralume is a community project and
we welcome bug reports, feature ideas, documentation, and pull requests.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to contribute](#how-to-contribute)
- [Development setup](#development-setup)
- [Project conventions](#project-conventions)
- [Commit style](#commit-style)
- [Pull request checklist](#pull-request-checklist)

## Code of Conduct

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to contribute

1. **Ask first for big changes** — open an issue describing what you want to build
   before writing a large PR. Small bug fixes are welcome directly.
2. **Find an issue** — look for the `good first issue` label.
3. **Fork & branch** — create a feature branch off `main`:
   `git checkout -b feat/my-change`.
4. **Code, test, commit, push**, then open a Pull Request against `main`.

## Development setup

```bash
# Backend
cd backend
python -m venv venv && venv/Scripts/activate   # Windows (Linux/macOS: source venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env
pytest                                        # run tests

# Frontend
cd frontend
npm install
npm run lint                                  # oxlint
npm run build                                 # typecheck + production build
```

### Running locally without Supabase

The backend runs in **demo mode** when `SUPABASE_URL` / `SUPABASE_JWT_SECRET` are not
set: authentication is bypassed with a fixed development user so you can iterate on
features quickly. Never run demo mode in production — set `APP_ENV=production`.

## Project conventions

- **Python**: black-style formatting, type hints on all public functions, docstrings
  on modules and complex logic. Follow the existing service-module layout.
- **TypeScript/React**: follow the patterns in `src/` — typed props, hooks for shared
  state, no `any` where avoidable. Components must be testable and keyboard-accessible.
- **Security**: all API endpoints must require the authenticated user and scope every
  query by `user_id`. Never log, return, or render raw provider API keys — only masked
  previews. New dependencies must be justified in the PR.
- **Backward compatibility**: keep SQLite (dev) and PostgreSQL (prod) both working.
  Use SQLAlchemy — do not drop into raw SQL for new features unless required.

## Commit style

We use Conventional Commits:

```
feat: add X
fix: correct Y
docs: update README
refactor: simplify Z
test: add coverage for W
chore: housekeeping
security: harden auth flow
```

Keep commits small and focused. Squash related changes before opening the PR.

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] `pytest` passes (backend changes)
- [ ] `npm run build` passes (frontend changes)
- [ ] `npm run lint` passes
- [ ] Tests added for new behavior
- [ ] No secrets, `.env` files, or credentials committed
- [ ] User-facing strings updated if the UI changed
- [ ] PR description explains **what** and **why**

## Questions?

Open a discussion or comment on the relevant issue. We're friendly — ask!
