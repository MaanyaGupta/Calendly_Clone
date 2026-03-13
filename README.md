# Calendly Clone

Full-stack Calendly-style scheduling app with a Next.js frontend and a Node/Express + Prisma backend.

## Live Demo

Deployed on AWS EC2:  
http://13.126.13.252/

## Tech Stack

- Frontend: Next.js 16 (App Router), React 19, ESLint
- Backend: Node.js, Express, Prisma ORM
- Database: PostgreSQL
- Utilities: dotenv, cors, date-fns, date-fns-tz

## Setup

### 1) Backend

```bash
cd backend
npm install
```

Create a `.env` file in `backend`:

```bash
# backend/.env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB_NAME"
PORT=5000
```

Generate Prisma client and create tables:

```bash
npm run prisma:generate
npm run prisma:push
```

Optional seed:

```bash
npm run prisma:seed
```

Run the API:

```bash
npm run dev
```

The API will be available at `http://localhost:5000/api`.

### 2) Frontend

```bash
cd frontend
npm install
```

Optional: point the frontend at a different API base URL by creating `frontend/.env.local`:

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
```

Run the web app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Assumptions

- PostgreSQL is installed and running locally (or accessible remotely).
- `DATABASE_URL` is set for Prisma to connect.
- Default ports are `5000` for the API and `3000` for the web app.
- If `NEXT_PUBLIC_API_URL` is not set, the frontend falls back to `http://localhost:5000/api`.
- Default user timezone in the database schema is `Asia/Kolkata` unless overridden per user.

