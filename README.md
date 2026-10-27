# Sesh

Sesh helps surfers find someone to surf with — spontaneously. Instead of planning sessions days in advance, surfers pick the spot they're heading to and share whether they're available now, coming soon or already on the beach. Others at the same spot can then find them and get in touch.

Good waves are better together, and Sesh is built to make it easier to arrange a shared session. Surfers stay in control: spots and availability are always chosen manually, and Sesh never tracks live GPS location.

## Key features

**Available now**
- Responsive landing page and navigation for mobile, tablet and desktop, based on a custom Figma design
- Reusable frontend UI components
- Backend user registration API with secure password hashing
- JWT authentication (log in, log out, current user)
- Server-side session management, so logging out ends the session immediately

**In development**
- Registration and login interface in the app
- Surfer profiles
- Surf spot selection and availability statuses (Active, Coming Soon, At the Spot, Invisible / Off)
- Surfer discovery and filtering
- Direct messaging

## Technology stack

| Area       | Technologies                                             |
| ---------- | -------------------------------------------------------- |
| Frontend   | React, Vite, Tailwind CSS, React Router                  |
| Backend    | Node.js, Express, Sequelize, JWT (HttpOnly cookies)      |
| Database   | PostgreSQL, hosted on Supabase                           |
| Deployment | Vercel (frontend) and Render (backend) — planned         |

## Getting started

### Prerequisites
- [Node.js](https://nodejs.org/) 20.19+ or 22.12+
- A [Supabase](https://supabase.com/) project (PostgreSQL)

### Install
```bash
git clone https://github.com/Maryna997/sesh.git
cd sesh

cd backend && npm install && cp .env.example .env
cd ../frontend && npm install && cp .env.example .env
```
On Windows Command Prompt, use `copy .env.example .env`.

### Configure
Fill in `backend/.env` (all options are described in `backend/.env.example`):

| Variable       | Value |
| -------------- | ----- |
| `PORT`         | `5000` |
| `CLIENT_URL`   | Frontend URL, e.g. `http://localhost:5173` |
| `DATABASE_URL` | Supabase **session pooler** connection string (port 5432): `postgresql://postgres.<project-ref>:<password>@<host>.pooler.supabase.com:5432/postgres` |
| `JWT_SECRET`   | A long random value, e.g. from `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

`frontend/.env` needs `VITE_API_URL=http://localhost:5000`.

Never commit `.env` files or real credentials.

### Set up the database
```bash
cd backend
npm run db:migrate
```

### Run
In two terminals:
```bash
cd backend && npm run dev     # API on http://localhost:5000
```
```bash
cd frontend && npm run dev    # app on http://localhost:5173
```
Check the API at http://localhost:5000/api/v1/health.

## Testing

```bash
cd backend && npm test        # backend unit and API tests
cd frontend && npm run lint   # frontend linting
cd frontend && npm run build  # frontend production build
```
The backend API tests need a migrated database. They only create and remove their own test accounts. A separate test database can be set with `TEST_DATABASE_URL`.

## Project status

Sesh is being developed as an individual Software Engineering capstone project. It is an MVP under active development: the foundations, landing page and backend authentication are in place, and the core surfer features are being built.

## Copyright

© 2026 Maryna Zuikova. All rights reserved.

Sesh is an independently developed Software Engineering capstone project with the potential for further development into a production application.

The source code is publicly available for viewing and educational reference. No license is granted to copy, modify, redistribute, or commercially use the code without prior written permission from the copyright holder.

Third-party libraries, fonts and other assets used by Sesh remain subject to their own licenses and terms.
