# backend-CLAUDE.md — Library Management System (Backend)

> Spec for building the backend with Claude Code. Read this fully before generating code. Build in the milestone order at the bottom. Do **not** over-engineer — see Non-Goals.

## 1. What we are building

A REST API for a college library management system. Three user roles — **student**, **librarian**, **admin** — covering authentication, book catalog, physical copy/inventory management, borrowing (issue/return/renew/fines), reservations, notifications, AI-driven recommendations, and analytics dashboards.

This is an **MCA academic project**. Prioritize clarity, correctness, and a clean, documentable structure over performance or scale.

## 2. Tech stack

- **Runtime:** Node.js 20 LTS, ES Modules (`"type": "module"`)
- **Framework:** Fastify 4
- **Database:** MySQL 8 via `mysql2/promise` (connection pool). **No ORM** — write SQL directly against the schema in `db.sql`. Optionally use `knex` only as a query builder if it helps, but raw `mysql2` is preferred for transparency.
- **Auth:** `@fastify/jwt`, `@fastify/cookie`, `bcrypt` (or `argon2`)
- **Validation & docs:** Fastify native JSON-schema validation + `@fastify/swagger` + `@fastify/swagger-ui`
- **Security:** `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`
- **Uploads:** `@fastify/multipart` (profile pics, cover images — store to local `/uploads` folder)
- **Scheduling:** `node-cron`
- **IDs:** `uuid` (v4) generated in the app for all `CHAR(36)` primary keys
- **Config:** `dotenv`
- **Logging:** Fastify's built-in `pino` logger
- **Testing:** `tap` or `vitest` + Fastify's `.inject()` for route tests
- **Language:** JavaScript (no TypeScript) to keep the project approachable.

## 3. Non-Goals (do not do these)

- No microservices, no Docker orchestration, no Kubernetes, no message queues, no Redis.
- No horizontal scaling concerns. Single instance is fine.
- The AI recommender is an **offline Python batch script** (see §10), NOT a live service the backend calls at request time. The backend only **reads** the `recommendations` table.
- Don't add GraphQL, websockets, or server-side rendering.

## 4. Repository structure

```
backend/
├── src/
│   ├── server.js                 # entrypoint: builds app, listens
│   ├── app.js                    # buildApp(): create Fastify, register plugins + modules
│   ├── config/
│   │   └── env.js                # load + validate env vars
│   ├── plugins/
│   │   ├── db.js                 # mysql2 pool, decorate fastify.db
│   │   ├── auth.js               # jwt setup, fastify.authenticate, fastify.authorize(roles)
│   │   └── swagger.js            # swagger + swagger-ui registration
│   ├── modules/
│   │   ├── auth/                 # { routes, service, repository, schema }.js
│   │   ├── users/
│   │   ├── books/
│   │   ├── categories/
│   │   ├── copies/
│   │   ├── borrows/
│   │   ├── reservations/
│   │   ├── notifications/
│   │   ├── recommendations/
│   │   └── analytics/
│   ├── jobs/
│   │   └── index.js              # node-cron registrations
│   └── utils/
│       ├── errors.js             # AppError class + error response helper
│       ├── audit.js              # writeAuditLog(...)
│       └── ids.js                # newId() -> uuid v4
├── ai/                           # Python batch recommender (see ai-CLAUDE.md)
├── uploads/                      # local file storage (gitignored)
├── tests/
├── .env.example
├── db.sql
└── package.json
```

## 5. Conventions

- **Each module is a Fastify plugin** with four files:
  - `*.routes.js` — declares routes, attaches JSON schema + auth, calls the service.
  - `*.service.js` — business logic, orchestration, transactions.
  - `*.repository.js` — SQL only. Takes the pool/connection, returns plain objects.
  - `*.schema.js` — JSON schemas for body/params/querystring/response (these also power Swagger).
- **Route handlers stay thin** — validate (via schema) → call service → return.
- **All PKs are app-generated** via `newId()`. Never rely on MySQL to create them.
- **Transactions:** any multi-table write (issue, return, reserve-fulfill) uses a single `pool.getConnection()` + `beginTransaction/commit/rollback`.
- **Errors:** throw `AppError(statusCode, code, message)`. A single Fastify `setErrorHandler` converts these to a consistent JSON body (see §12).
- **Soft deletes:** `users` and `books` use `deleted_at`. All read queries must filter `deleted_at IS NULL` unless explicitly fetching deleted records (admin).
- **Audit logging:** call `writeAuditLog` for state-changing librarian/admin actions (issue, return, create/update/delete book, user management).
- **No secrets in code** — everything via `env.js`.

## 6. Database access

- `plugins/db.js` creates a `mysql2/promise` pool from env and decorates it as `fastify.db`.
- Repositories receive `fastify.db` (or a transaction connection) and run parameterized queries (`?` placeholders) — never string-concatenate user input.
- `authors` (books) is a JSON column — parse on read, `JSON.stringify` on write.
- Keep `books.total_copies` / `available_copies` in sync inside borrow/return/copy transactions.

## 7. Auth & security

Flow:
1. **Login** (`email` + `password`): verify against `password_hash` (bcrypt). On success issue a short-lived **access token** (JWT, ~15 min) returned in the JSON body, and a long-lived **refresh token** stored as a **hash** in `refresh_tokens` and sent as an **httpOnly, secure, sameSite cookie**.
2. **Refresh** (`POST /auth/refresh`): read refresh cookie → hash → look up in `refresh_tokens` (not revoked, not expired) → **rotate** (revoke old, issue new) → return new access token.
3. **Logout**: revoke the current refresh token, clear cookie.
4. **Password reset**: `POST /auth/forgot-password` creates a `password_reset_tokens` row (store hash, set expiry) and "sends" a link (log it to console / notifications for the project). `POST /auth/reset-password` verifies token, updates `password_hash`, marks token used.
- `fastify.authenticate` — preHandler that verifies the access token.
- `fastify.authorize(['admin','librarian'])` — preHandler factory that checks `request.user.role`.
- Apply `@fastify/rate-limit` specifically to `/auth/login` and `/auth/forgot-password`.
- Update `users.last_login_at` on successful login.

## 8. Module specs (endpoints)

Notation: `[role]` = required role; `[auth]` = any logged-in user; `[public]` = no auth. Students can only act on their own resources.

### auth
- `POST /auth/login` [public]
- `POST /auth/refresh` [public, cookie]
- `POST /auth/logout` [auth]
- `GET  /auth/me` [auth] — current user profile
- `POST /auth/forgot-password` [public]
- `POST /auth/reset-password` [public]

### users  [admin] (except self-profile)
- `GET    /users` [admin] — list, filter by role/active, paginate
- `POST   /users` [admin] — create staff/student
- `GET    /users/:id` [admin]
- `PATCH  /users/:id` [admin] — update role, active, borrow limit, etc.
- `DELETE /users/:id` [admin] — soft delete
- `PATCH  /users/me` [auth] — update own profile (name, phone, department, profile_pic)

### categories
- `GET    /categories` [public] — tree or flat list
- `POST   /categories` [admin|librarian]
- `PATCH  /categories/:id` [admin|librarian]
- `DELETE /categories/:id` [admin]

### books
- `GET    /books` [public] — search (FULLTEXT on title+description via `MATCH ... AGAINST`), filter by category/author/availability, sort by popularity/title/year, paginate
- `GET    /books/:id` [public] — full detail incl. categories, avg rating, available copies; logs a `book_views` row when `request.user` present
- `POST   /books` [admin|librarian]
- `PATCH  /books/:id` [admin|librarian]
- `DELETE /books/:id` [admin] — soft delete
- `POST   /books/:id/cover` [admin|librarian] — multipart cover upload

### copies  (physical inventory)
- `GET    /books/:bookId/copies` [admin|librarian]
- `POST   /books/:bookId/copies` [admin|librarian] — adds copy, increments totals
- `PATCH  /copies/:id` [admin|librarian] — condition/status; recompute availability
- `DELETE /copies/:id` [admin] — only if not currently borrowed

### borrows  (circulation core — use transactions)
- `POST  /borrows/issue` [admin|librarian] — body: `{ userId, bookCopyId }`. Checks: copy available, user active, under `max_borrow_limit`, no blocking unpaid fines. Sets `due_date`, marks copy `borrowed`, decrements `available_copies`, writes audit log.
- `POST  /borrows/:id/return` [admin|librarian] — sets `returned_at`, `returned_by`, computes overdue fine, marks copy `available`, increments `available_copies`, fulfills next reservation if any.
- `POST  /borrows/:id/renew` [admin|librarian|owner] — extends `due_date` if `renewal_count < max` and no pending reservation on that book.
- `POST  /borrows/:id/pay-fine` [admin|librarian] — marks `fine_paid`.
- `GET   /borrows` [admin|librarian] — all, filter by status/user/overdue
- `GET   /borrows/me` [auth] — current user's borrow history

### reservations
- `POST   /reservations` [auth] — reserve a `book_id` (when no copy available). Status `pending`, set `expires_at`.
- `GET    /reservations/me` [auth]
- `GET    /reservations` [admin|librarian] — queue, filter by book/status
- `DELETE /reservations/:id` [auth owner | admin|librarian] — cancel

### notifications
- `GET   /notifications/me` [auth] — paginated, unread first
- `PATCH /notifications/:id/read` [auth owner]
- `PATCH /notifications/read-all` [auth]
- (Creation is internal — emitted by jobs and circulation events.)

### recommendations
- `GET /recommendations/me` [auth] — reads precomputed rows from `recommendations` for `request.user.id`, ordered by `score`, joined to `books`. If none exist (cold start), fall back to top books by `popularity_score`.

### analytics  [admin|librarian]
- `GET /analytics/overview` — totals: books, copies, active borrows, overdue, users
- `GET /analytics/popular-books` — top N by borrow count / popularity_score (date range param)
- `GET /analytics/borrow-trends` — borrows grouped by day/week/month
- `GET /analytics/category-distribution` — borrows per category
- `GET /audit-logs` [admin] — paginated activity feed

## 9. Background jobs (node-cron, registered in `jobs/index.js`)

- **Due-date reminders** (daily): find borrows due in 1–2 days → insert `notifications`.
- **Overdue sweep** (daily): borrows past `due_date` still `active` → set `overdue`, accrue/refresh `fine_amount`, notify user.
- **Reservation expiry** (daily): `pending` reservations past `expires_at` → `expired`.
- **Popularity recompute** (daily/weekly): update `books.popularity_score` from recent borrow + rating + view counts.
- The recommendation refresh is run by the **Python job** (§10), not node-cron — though you may shell out to it on a schedule if desired.

## 10. AI / recommendations integration (backend side)

The backend is **decoupled** from the model. Contract:
- The Python batch job (`ai/`, see `ai-CLAUDE.md`) reads `borrows`, `book_ratings`, `favorites`, `book_views` and **writes** ranked rows into the `recommendations` table.
- The backend **only reads** that table in the `recommendations` module.
- This means the backend has no Python dependency and the live system stays pure Node/Fastify. Recommendations are always served instantly from a table.

## 11. API documentation

- Register `@fastify/swagger` + `@fastify/swagger-ui` at `/docs`.
- Every route must declare a `schema` with `tags`, `summary`, body/params/response — Swagger is generated from these. This satisfies the project's "document system design" requirement directly.

## 12. Validation & error format

- Validate all input with route-level JSON schema (Fastify rejects bad input automatically with 400).
- Consistent error body:
```json
{ "error": { "code": "BORROW_LIMIT_REACHED", "message": "User has reached their borrow limit." } }
```
- `setErrorHandler` maps `AppError` → its status/code, validation errors → 400, unexpected → 500 (log full error, return generic message).

## 13. Environment variables (`.env.example`)

```
NODE_ENV=development
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=library_db
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
COOKIE_SECRET=change-me
CORS_ORIGIN=http://localhost:5173
DEFAULT_LOAN_DAYS=14
FINE_PER_DAY=2.00
MAX_RENEWALS=2
RESERVATION_HOLD_DAYS=3
```

## 14. Backend milestones

- **M0 — Foundation:** project init, `env.js`, `db.js` pool, swagger, `setErrorHandler`, `utils` (ids, errors, audit), `GET /health`, seed script (creates 1 admin, 1 librarian, sample students, categories, books, copies).
- **M1 — Auth:** login, refresh rotation, logout, `/auth/me`, forgot/reset password, `authenticate` + `authorize` plugins, rate-limit on login.
- **M2 — Catalog:** categories CRUD; books CRUD + FULLTEXT search + filters + pagination; copies management; cover upload; `book_views` logging.
- **M3 — Circulation:** issue / return / renew / pay-fine (all transactional), `/borrows` + `/borrows/me`, availability sync, audit logging. *(Borrowing data now accumulates — needed for AI.)*
- **M4 — Reservations & notifications:** reservations CRUD + fulfillment on return; notifications endpoints; all node-cron jobs.
- **M5 — Recommendations & analytics:** `/recommendations/me` (reads table + popularity fallback); all analytics endpoints; audit-logs feed.
- **M6 — Hardening & docs:** helmet, CORS, rate-limit tuning; route tests via `.inject()`; complete Swagger annotations; README + run instructions.

## 15. How to run

```
npm install
cp .env.example .env          # fill in DB + secrets
mysql -u root -p < db.sql     # create schema
npm run seed                  # seed sample data
npm run dev                   # fastify with watch
# docs at http://localhost:4000/docs
```