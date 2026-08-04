# Security Policy

Vitralume takes security seriously — especially because the app stores users'
resume data and third-party provider **API keys** (Google Gemini, NVIDIA NIM).

## Reporting a Vulnerability

**Please do not open a public issue.** Report privately so we can fix it before
it is disclosed.

- Preferred: GitHub **Security Advisories** → *Report a vulnerability*
- Alternative: email the maintainers (address listed on the repository profile)

Include, if possible:

- Affected endpoint/file and version
- Steps to reproduce (with a minimal proof of concept)
- Impact and any suggested fix

We aim to acknowledge reports within **48 hours** and will keep you updated on
the fix and release timeline.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| `main`  | ✅ active development |

## What We Do

- Keep provider API keys encrypted at rest (AES-256, Fernet) and **never** log,
  return, or render them in plaintext
- Scope every database query by the authenticated user's id
- Validate Supabase JWTs on every request; refuse unauthenticated access
- Lock CORS origins, set security headers (CSP, HSTS, etc.), and rate-limit
  auth + generation endpoints
- Review all dependency changes and keep dependencies updated

## Data & Key Handling Rules for Contributors

1. Never commit `.env`, real API keys, or credentials — use `backend/.env.example`.
2. Never return raw provider keys from an API endpoint; return masked previews only.
3. Never log request bodies, tokens, or decrypted keys.
4. All new endpoints must depend on `require_user` and filter by `user_id`.
5. When storing secrets, encrypt with `security.KeyCipher` before persisting.

## Disclosures

We will credit reporters in the release notes (unless they prefer anonymity).
