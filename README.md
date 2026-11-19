# Sesh

Sesh is a web application that helps surfers find people to share a surf session with. Users can choose their surf spot, share their availability and discover other surfers with similar plans. They can then connect through direct messages and arrange a session together.

Built around spontaneity and flexibility, Sesh allows surfers to decide when and where they want to surf without relying on fixed plans. All availability information is shared manually, with no live GPS tracking.

**Live application:** https://sesh-gamma-fawn.vercel.app

## Key features

- Responsive interface for mobile, tablet and desktop, based on a custom Figma design
- User registration, login and logout with secure password hashing, JWT authentication and server-side session management
- Surfer profiles with skill level, board type, favorite surf spots, profile pictures and personal information
- Manual availability statuses: Active, Coming Soon, At the Spot and Off
- Surfer discovery with filters for surf spots, skill levels and arrival times
- Direct messaging between surfers to arrange sessions
- Account settings for updating personal information, email and password
- Account deletion with conversation history retained for the remaining participant
- Privacy-focused design without live GPS tracking

## Technology stack

| Area | Technologies |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS, React Router |
| Backend | Node.js, Express, Sequelize, JWT (HttpOnly cookies) |
| Database | PostgreSQL, hosted on Supabase |
| Deployment | Vercel (frontend) and Render (backend) |
| Testing | Vitest, React Testing Library, Playwright, GitHub Actions |

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+
- A [Supabase](https://supabase.com/) project (PostgreSQL)

### Install

```bash
git clone https://github.com/Maryna997/sesh.git
cd sesh

cd backend && npm install && cp .env.example .env
cd ../frontend && npm install
```

On Windows Command Prompt, use `copy .env.example .env`.

### Configure

Fill in `backend/.env`. All configuration options are described in `backend/.env.example`.

| Variable | Value |
| --- | --- |
| `PORT` | `5000` |
| `CLIENT_URL` | Frontend URL, e.g. `http://localhost:5173` |
| `DATABASE_URL` | Supabase session pooler connection string (port 5432) |
| `JWT_SECRET` | A long, randomly generated secret |
| CLOUDINARY_CLOUD_NAME | Cloudinary cloud name |
| CLOUDINARY_API_KEY | Cloudinary API key |
| CLOUDINARY_API_SECRET | Cloudinary API secret |

Generate a JWT secret using:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The frontend does not require its own `.env` file for the default local setup. It sends API requests to relative `/api/...` paths, which the Vite development server forwards to `http://localhost:5000`.

To use a different backend address, see `frontend/.env.example`.

Never commit `.env` files or real credentials.

### Set up the database

From the `backend` directory, run:

```bash
npm run db:migrate
```

**Important:** Migrations modify the database specified by `DATABASE_URL`. Use a separate development database rather than the production Supabase database.

### Run locally

Start the backend and frontend in separate terminals.

**Backend:**

```bash
cd backend
npm run dev
```

The API runs at `http://localhost:5000`.

**Frontend:**

```bash
cd frontend
npm run dev
```

The application runs at `http://localhost:5173`.

To check the backend health endpoint, open:

`http://localhost:5000/api/v1/health`

## Deployment

Sesh is deployed using:

- **Vercel:** React frontend
- **Render:** Express backend
- **Supabase:** PostgreSQL database
- **Cloudinary:** Profile picture storage

The frontend communicates with the backend through relative `/api/...` requests. In production, `frontend/vercel.json` forwards these requests to the Render backend while preserving client-side routing.

**Production application:** https://sesh-gamma-fawn.vercel.app

The database uses PostgreSQL Row Level Security and restricted public-role privileges. Authentication and authorization are handled by the Express backend.

## Testing

Sesh includes automated frontend, backend and end-to-end tests.

### Backend tests

```bash
cd backend
npm test
```

### Frontend tests

```bash
cd frontend
npm test
```

### Frontend linting

```bash
cd frontend
npm run lint
```

### Production build

```bash
cd frontend
npm run build
```

### End-to-end testing

Playwright tests cover five core user journeys:

1. Registration, login and profile management
2. Availability and surfer discovery
3. Direct messaging
4. Account settings
5. Account deletion and conversation retention

Automated checks also run through GitHub Actions.

**Testing note:** Backend and end-to-end tests must use an isolated test database. Do not run tests against production Supabase data.

## Copyright

© 2026 Maryna Zuikova. All rights reserved.

Sesh is an independently developed Software Engineering capstone project with the potential for further development into a production application.

The source code is publicly available for viewing and educational reference. No license is granted to copy, modify, redistribute, or commercially use the code without prior written permission from the copyright holder.
Third-party libraries, fonts and other assets used by Sesh remain subject to their own licenses and terms.
