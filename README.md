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
│   │   │   └── database.cjs  Database settings (app + sequelize-cli)
│   │   ├── db/
│   │   │   ├── migrations/   Sequelize migrations (.cjs)
│   │   │   ├── seeders/      Sequelize seeders (.cjs)
│   │   │   └── index.js      Shared Sequelize instance
│   │   ├── models/           Sequelize models
│   │   ├── routes/
│   │   │   └── health.routes.js
│   │   ├── app.js         Express app setup (middleware, routes)
│   │   └── server.js      Connects to the database, starts the HTTP server
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
