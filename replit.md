# Harbor Social Network

Harbor is a social network with secure accounts, profiles, follows, posts, image uploads, likes, comments, replies, bookmarks, reposts, feeds, discovery, search, and hashtags.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the FastAPI server (port 8080)
- `pnpm --filter @workspace/secure-auth-app run dev` — run the React frontend
- `uv run alembic -c backend/alembic.ini upgrade head` — apply database migrations
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DATABASE_URL` and `SESSION_SECRET`
- Optional env: `FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`
- Object Storage is provisioned for profile and post images; the API uses the Replit sidecar to issue signed upload and download URLs.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9, Python 3.13
- Frontend: React + TypeScript + Vite
- API: FastAPI + Uvicorn
- DB: PostgreSQL + SQLAlchemy + Alembic
- Auth: Argon2 password hashing + JWT bearer tokens
- Social data: SQLAlchemy models with Alembic migrations for profiles, follows, posts, interactions, and threaded comments
- Media: Replit App Storage signed URLs; image bytes are not stored in PostgreSQL
- API codegen: Orval (from OpenAPI spec)
- API docs: FastAPI OpenAPI at `/api/docs`

## Where things live

- `artifacts/secure-auth-app` — React application
- `backend` — FastAPI application, security helpers, and Alembic migrations
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `backend/alembic/versions` — database migration history

## Architecture decisions

- JWT access tokens are short-lived and include a unique ID so logout can revoke the current session.
- Passwords use Argon2 through `pwdlib`; one-time email and password reset tokens are stored only as SHA-256 hashes.
- Email delivery is provider-neutral: SMTP is optional for local work and can be configured without changing auth flows.
- The API runs as FastAPI even though the workspace was initially scaffolded with a TypeScript API package.

## Product

- Account registration and login
- Email verification and resend flow
- Password reset request and confirmation
- Social home feed, Explore, Search, profiles, and saved posts
- Post composer with image uploads, hashtags, likes, comments, replies, bookmarks, and reposts
- Profile editing with username, bio, and profile picture
- Administrator-only user list
- JWT logout and basic security headers

## User preferences

- Phase 1 explicitly requires React + TypeScript, FastAPI, PostgreSQL, migrations, JWT authentication, and email account flows.

## Gotchas

- The managed API workflow runs Alembic before starting Uvicorn.
- Use `uv run` for Python commands so the project environment and lockfile are respected.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
