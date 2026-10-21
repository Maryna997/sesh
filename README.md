# Sesh

Sesh is a spontaneous surf buddy matching application. Surfers pick the surf spot and set an availability status (`ACTIVE`, `COMING_SOON`, `AT_SPOT`, shown to users as "At the Spot", or `OFF`) so they can find a partner for their next session. Sesh does not use GPS tracking: spots and statuses are always chosen manually.

## Technology stack

| Layer           | Technology                          |
| --------------- | ----------------------------------- |
| Frontend        | React, Vite, Tailwind CSS v4        |
| Backend         | Node.js, Express                    |
| Database        | PostgreSQL with Sequelize (planned) |
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
│   ├── src/
│   │   ├── routes/
│   │   │   └── health.routes.js
│   │   ├── app.js         Express app setup (middleware, routes)
│   │   └── server.js      Starts the HTTP server
│   └── .env.example
└── README.md
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (required by Vite 8; includes npm)
- Git

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

| Variable     | Description                     | Example                 |
| ------------ | ------------------------------- | ----------------------- |
| `PORT`       | Port the API listens on         | `5000`                  |
| `CLIENT_URL` | Frontend origin allowed by CORS | `http://localhost:5173` |

**frontend/.env**

| Variable       | Description             | Example                 |
| -------------- | ----------------------- | ----------------------- |
| `VITE_API_URL` | Base URL of the backend | `http://localhost:5000` |

`VITE_` variables are bundled into the browser code, so never put secrets in them.

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
