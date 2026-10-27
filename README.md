# Sesh

Sesh is a spontaneous surf buddy matching application. Surfers pick the surf spot and set an availability status (`ACTIVE`, `COMING_SOON`, `AT_SPOT`, shown to users as "At the Spot", or `OFF`) so they can find a partner for their next session. Sesh does not use GPS tracking: spots and statuses are always chosen manually.

## Technology stack

| Layer           | Technology                          |
| --------------- | ----------------------------------- |
| Frontend        | React, Vite, Tailwind CSS v4        |
| Backend         | Node.js, Express, Sequelize         |
| Database        | PostgreSQL (hosted on Supabase)     |
| Deployment      | Vercel (frontend), Render (backend) |
| Version control | Git and GitHub                      |

## Project structure

```
sesh/
├── frontend/              React + Vite client
│   ├── public/            Static files
│   ├── src/
│   │   ├── App.jsx        Welcome page with API health check
│   │   ├── index.css      Tailwind CSS entry point
│   │   └── main.jsx       React entry point
│   ├── .env.example
│   └── vite.config.js
├── backend/               Express API
│   ├── certs/
│   │   └── supabase-ca.crt  Supabase root CA (public) for verified SSL
│   ├── src/
│   │   ├── config/
│   │   │   ├── auth.js       JWT, cookie and allowed-origin settings (checked at startup)
│   │   │   └── database.cjs  Database settings (app + sequelize-cli)
│   │   ├── controllers/
│   │   │   └── auth.controller.js  Register, login, logout, current user
│   │   ├── db/
│   │   │   ├── migrations/   Sequelize migrations (.cjs)
│   │   │   ├── seeders/      Sequelize seeders (.cjs)
│   │   │   └── index.js      Shared Sequelize instance
│   │   ├── middleware/
│   │   │   ├── errorHandler.js        Safe JSON errors (no internal details)
│   │   │   ├── requireAuth.js         Protects routes (valid, non-revoked session)
│   │   │   └── requireTrustedOrigin.js  CSRF check for data-changing requests
│   │   ├── models/
│   │   │   ├── Session.js    Signed-in session (deleted on logout)
│   │   │   └── User.js       Account: email + password hash
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   └── health.routes.js
│   │   ├── utils/
│   │   │   ├── cookies.js    Reads the session cookie
│   │   │   ├── password.js   bcrypt hashing and checking
│   │   │   ├── token.js      Signs and verifies session JWTs
│   │   │   └── validation.js Registration and login validation
│   │   ├── app.js         Express app setup (middleware, routes)
│   │   └── server.js      Connects to the database, starts the HTTP server
│   ├── tests/             Automated tests (node:test)
│   ├── .sequelizerc       sequelize-cli paths
│   └── .env.example
└── README.md
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (required by Vite 8; includes npm)
- Git
- A [Supabase](https://supabase.com/) project (hosted PostgreSQL)

## Installation

```bash
git clone https://github.com/Maryna997/sesh.git
cd sesh

# Backend
cd backend
npm install
cp .env.example .env

# Frontend
cd ../frontend
npm install
cp .env.example .env
```

On Windows Command Prompt, use `copy .env.example .env` instead of `cp`.

### Environment variables

**backend/.env**

| Variable       | Description                         | Example                                                                     |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `PORT`         | Port the API listens on             | `5000`                                                                      |
| `CLIENT_URL`   | Frontend origin allowed by CORS     | `http://localhost:5173`                                                     |
| `DATABASE_URL` | Supabase session pooler connection  | `postgresql://postgres.PROJECT_REF:PASSWORD@HOST.pooler.supabase.com:5432/postgres` |
| `JWT_SECRET`   | **Required.** Secret that signs login tokens: at least 32 random characters, different per environment, never committed | generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_EXPIRES_IN_HOURS` | Optional login lifetime in hours, 1–720 (default `168` = 7 days) | `168` |
| `NODE_ENV`     | Set to `production` on the deployed server (makes the session cookie `Secure`) | `production` |
| `COOKIE_SAME_SITE` | Optional: `lax` (default), `strict` or `none` (`none` requires HTTPS) | `lax` |
| `COOKIE_SECURE` | Optional override; defaults to `true` only in production | `true` |
| `BCRYPT_ROUNDS` | Optional bcrypt cost factor, 4–15 (default `12`) | `12` |
| `TEST_DATABASE_URL` | Optional separate database for `npm test` (falls back to `DATABASE_URL`) | same format as `DATABASE_URL` |

`CLIENT_URL` may list several origins separated by commas (for example production and a preview URL). It cannot be `*`, because login uses cookies. The server refuses to start if `JWT_SECRET` or `CLIENT_URL` is missing or unsafe.

**frontend/.env**

| Variable       | Description             | Example                 |
| -------------- | ----------------------- | ----------------------- |
| `VITE_API_URL` | Base URL of the backend | `http://localhost:5000` |

`VITE_` variables are bundled into the browser code, so never put secrets in them.

## Database setup

Sesh uses PostgreSQL hosted on Supabase, accessed through Sequelize.

1. In Supabase, open **Connect** and copy the **Session pooler** connection string (port `5432`). Do not use the transaction pooler (port `6543`).
2. Paste it into `backend/.env` as `DATABASE_URL` and replace the password placeholder. URL-encode special characters in the password.
3. The backend verifies the database's SSL certificate against `backend/certs/supabase-ca.crt` (Supabase Root 2021 CA, downloaded from **Project Settings > Database > SSL Configuration**). This certificate is public and is committed to the repository.

The backend checks the database connection on startup and exits with an error if it cannot connect.

### Migrations

Run these from the `backend` folder:

| Command                       | Description                        |
| ----------------------------- | ---------------------------------- |
| `npm run db:migrate`          | Run all pending migrations         |
| `npm run db:migrate:status`   | Show which migrations have run     |
| `npm run db:migrate:undo`     | Undo the most recent migration     |
| `npm run db:migrate:undo:all` | Undo all migrations                |
| `npm run db:seed`             | Run all seeders                    |
| `npm run db:seed:undo`        | Undo all seeders                   |

To create a migration, run `npx sequelize-cli migration:generate --name create-example` and rename the generated `.js` file to `.cjs`. The backend uses ES modules, but sequelize-cli loads migrations with `require()`, so migration and seeder files must be CommonJS (`.cjs`).

Current migrations:

| Migration      | Creates                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------- |
| `create-users` | `users` table: `id` (UUID), `email`, `password_hash`, `created_at`, `updated_at`, and a unique index on `lower(email)` so each email can only be registered once, whatever its capitalization |

| `create-sessions` | `sessions` table: `id` (UUID, used as the token's `jti`), `user_id` (→ `users.id`, deleted with the user), `expires_at`, `created_at`, `updated_at`, and an index on `user_id` |

Run `npm run db:migrate` once after pulling to create the tables. Undoing `create-sessions` drops the `sessions` table (signing everyone out); undoing `create-users` drops the `users` table and all accounts in it.

## Running locally

Start the backend and frontend in two separate terminals.

```bash
# Terminal 1: backend (restarts automatically on changes)
cd backend
npm run dev
```

```bash
# Terminal 2: frontend
cd frontend
npm run dev
```

Then open http://localhost:5173. The welcome page shows whether it can reach the API.

Other scripts:

| Location | Command           | Description                          |
| -------- | ----------------- | ------------------------------------ |
| backend  | `npm start`       | Start the API without auto-restart   |
| backend  | `npm test`        | Run the backend tests (see below)    |
| frontend | `npm run build`   | Create a production build in `dist/` |
| frontend | `npm run preview` | Preview the production build         |
| frontend | `npm run lint`    | Lint the frontend code               |

## Verifying the health endpoint

With the backend running:

```bash
curl http://localhost:5000/api/v1/health
```

Expected response (HTTP 200):

```json
{ "status": "ok", "message": "Sesh API is running" }
```

You can also open http://localhost:5000/api/v1/health in a browser.

## Authentication API

Sesh uses its own authentication through Express (not Supabase Auth). Accounts are stored in the `users` table; surfer profile details will live in a separate table.

### How sessions work

- **Login** checks the password and creates a row in the `sessions` table. The server then sets a **session cookie**, `sesh_session`, containing a signed JWT.
- The cookie is **HttpOnly** (page JavaScript cannot read it), **SameSite=Lax**, limited to the `/api` path, and **Secure** (HTTPS only) when `NODE_ENV=production`. The token is never included in JSON responses and should never be stored in `localStorage`.
- The JWT contains only the user id (`sub`), the session id (`jti`), issuer `sesh-api`, audience `sesh-web`, and issue/expiry times. It is signed with `JWT_SECRET` using HS256. No email, password or profile data is included.
- Each protected request verifies the signature, algorithm (HS256 only), issuer, audience and expiry, **and** checks that the session row still exists and has not expired.
- **Logout** deletes the session row, so the old cookie stops working immediately, even before its expiry time. Other devices stay signed in. Deleting a user also deletes their sessions.
- Sessions last `JWT_EXPIRES_IN_HOURS` (default 7 days). After that the user logs in again. Expired session rows are cleaned up when that user next logs in.
- **CSRF protection:** `POST` (and other data-changing) requests whose `Origin` header is not one of the `CLIENT_URL` origins are rejected with `403`. The SameSite cookie setting is a second layer. Tools such as curl or PowerShell, which send no `Origin`, are not affected.
- **CORS** allows credentials only for the `CLIENT_URL` origins. Frontend requests must use `credentials: 'include'`.

**Deployment note (Vercel + Render).** `*.vercel.app` and `*.onrender.com` are different sites, so a cookie set by the Render API would be a third-party cookie on the Vercel frontend. Safari, and every browser on iOS, blocks those. The recommended setup is a Vercel rewrite that forwards `/api/*` to the Render backend, so the browser only talks to the frontend's own domain and the cookie stays first-party (`SameSite=Lax` keeps working). A custom domain for both apps (e.g. `sesh.app` and `api.sesh.app`) works too.

### Protecting a route

Add the `requireAuth` middleware. It responds with `401` when the user is not signed in, and otherwise sets `req.auth = { userId, sessionId }`:

```js
import { requireAuth } from '../middleware/requireAuth.js';

router.get('/me', requireAuth, me);
```

### Register: `POST /api/v1/auth/register`

Creates an account. It does not log the user in; call login afterwards.

Request (`Content-Type: application/json`):

```json
{ "email": "surfer@example.com", "password": "SecurePassword123" }
```

Success: `201 Created`

```json
{
  "user": {
    "id": "4d2ff45b-92c9-4f03-b018-42bfea383d5c",
    "email": "surfer@example.com",
    "createdAt": "2026-10-26T18:00:00.000Z"
  }
}
```

The password and its hash are never returned.

**Validation rules**

- `email`: required string, at most 254 characters, basic `name@domain.tld` format. It is trimmed and lowercased before it is checked and saved, so `" Surfer@Example.com "` is stored as `surfer@example.com`.
- `password`: required string, at least 8 characters. No uppercase, number or symbol rules. It is not trimmed (spaces are allowed). It may be at most **72 bytes**, because bcrypt ignores anything longer; that is about 72 standard characters, fewer with emoji or accented letters.
- Other fields in the body are ignored.

**Errors** (JSON: `{ "status": "error", "message": "…" }`)

| Status | When | Body |
| ------ | ---- | ---- |
| `400` | Missing, wrongly typed or invalid fields | Includes `errors`, e.g. `{ "email": "Email is required.", "password": "Password must be at least 8 characters." }` |
| `400` | Body is not valid JSON | `"message": "Request body must be valid JSON."` |
| `409` | Email already registered (any capitalization) | `"message": "An account with this email already exists."` |
| `500` | Unexpected server or database error | `"message": "Something went wrong. Please try again later."` (no internal details) |

**Password storage:** passwords are hashed with bcrypt (the `bcryptjs` package, cost factor 12 by default, set with `BCRYPT_ROUNDS`). Plaintext passwords are never stored or logged.

### Login: `POST /api/v1/auth/login`

Request (`Content-Type: application/json`):

```json
{ "email": "surfer@example.com", "password": "SecurePassword123" }
```

Success: `200 OK` with the session cookie (`Set-Cookie: sesh_session=…; Max-Age=604800; Path=/api; HttpOnly; SameSite=Lax`) and:

```json
{
  "user": {
    "id": "4d2ff45b-92c9-4f03-b018-42bfea383d5c",
    "email": "surfer@example.com",
    "createdAt": "2026-10-26T18:00:00.000Z"
  }
}
```

- The email is trimmed and lowercased, as in registration. The password is Unicode-normalized (NFC) the same way it was when the account was created.
- A wrong password and an unknown email both return `401` with `"message": "Incorrect email or password."`, and take about the same time, so the response doesn't reveal which emails have accounts.
- Passwords longer than 72 bytes never match. bcrypt would otherwise compare only their first 72 bytes.

### Current user: `GET /api/v1/auth/me` (requires login)

Returns `200` with `{ "user": { "id", "email", "createdAt" } }` for the signed-in user, or `401` with `"message": "Authentication required."` when the cookie is missing, invalid, expired or logged out, or the account no longer exists. The frontend can call it on page load to restore the signed-in state.

### Logout: `POST /api/v1/auth/logout`

Returns `200` with `{ "status": "ok", "message": "Logged out." }`, deletes the session and clears the cookie. Calling it again, or without being signed in, also returns `200`.

### Authentication errors

| Status | When | Message |
| ------ | ---- | ------- |
| `400` | Missing or wrongly typed fields, invalid email format, invalid JSON | `"Please check the login details."` with `errors`, or `"Request body must be valid JSON."` |
| `401` | Wrong email or password | `"Incorrect email or password."` |
| `401` | Missing, malformed, tampered, expired or logged-out session on a protected route | `"Authentication required."` |
| `403` | Data-changing request from a website that isn't `CLIENT_URL` | `"Request origin not allowed."` |
| `500` | Unexpected server or database error | `"Something went wrong. Please try again later."` |

### Trying it locally

Add a `JWT_SECRET` to `backend/.env` (see the environment table above) and start the backend (`npm run dev` in `backend`). Then, in **PowerShell**, `-SessionVariable` / `-WebSession` keep the session cookie between requests like a browser would:

```powershell
$api = 'http://localhost:5000/api/v1'
$body = @{ email = 'surfer@example.com'; password = 'SecurePassword123' } | ConvertTo-Json

# Register (once), then log in and keep the cookie in $sesh
Invoke-RestMethod "$api/auth/register" -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' -Body $body -SessionVariable sesh

# Current user (200), then log out
Invoke-RestMethod "$api/auth/me" -WebSession $sesh
Invoke-RestMethod "$api/auth/logout" -Method Post -WebSession $sesh

# After logout: 401 Authentication required
Invoke-WebRequest "$api/auth/me" -WebSession $sesh -SkipHttpErrorCheck | Select-Object StatusCode, Content
```

With **curl** (macOS, Linux, Git Bash), `-c` saves and `-b` sends the cookie:

```bash
curl -i -c cookies.txt -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"surfer@example.com","password":"SecurePassword123"}'
curl -i -b cookies.txt http://localhost:5000/api/v1/auth/me
curl -i -b cookies.txt -X POST http://localhost:5000/api/v1/auth/logout
curl -i -b cookies.txt http://localhost:5000/api/v1/auth/me   # 401
```

Accounts created this way are real rows in the database. Delete them afterwards (their sessions are deleted with them).

## Backend tests

```bash
cd backend
npm test
```

The tests use Node's built-in test runner. The API tests (registration, login, logout, `/me`, CSRF and CORS) run against a real database, so its tables must exist:

- **Default:** they use `DATABASE_URL`. Run `npm run db:migrate` first. They only create accounts ending in `@sesh-test.invalid` and delete them (and their sessions) before and after each run.
- **Separate test database (recommended once real users exist):** set `TEST_DATABASE_URL` in `backend/.env`, then run `npm run db:migrate:test` once to create its tables. `npm test` then never touches `DATABASE_URL`.

Tests sign tokens with their own throwaway secret, never the real `JWT_SECRET`.
