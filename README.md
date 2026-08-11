# Doctor SaaS Platform

Multi-tenant SaaS for doctors/clinics: patients, appointments, prescriptions, billing, video consults.

Stack: React (Vite) · Node.js (Express) · MySQL (Prisma) · GraphQL (Apollo Server)


## Development

### Prerequisites

- Node.js >= 20 (tested on 24)
- MySQL 8 / MariaDB 10.4+ (this repo targets a local XAMPP MariaDB on port `3307`)
- Optional: Docker for a containerized MySQL (see below)

### Setup

```bash
npm install
```

### Database

1. Create the database (local example):

```bash
mysql -u root -P 3307 -h 127.0.0.1 -e "CREATE DATABASE IF NOT EXISTS doctor_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

2. Point `server/.env` at it — copy `server/.env.example` to `server/.env` and adjust `DATABASE_URL`. Local default:

```
DATABASE_URL="mysql://root:@127.0.0.1:3307/doctor_saas"
```

3. Apply migrations:

```bash
npm run db:migrate
```

Optional: inspect data with `npm run db:studio`.

**PlanetScale / cloud MySQL:** set `DATABASE_URL` accordingly, e.g.
`mysql://USER:PASSWORD@aws.connect.psdb.cloud/doctor_saas?sslaccept=strict`

**Docker alternative** (if you don't have local MySQL):

```bash
docker compose up -d db
```

### Run

Two dev servers:

```bash
npm run dev
```

- API + GraphQL: http://localhost:4000 (`/graphql`, `/health`)
- Client: http://localhost:5173 (proxies `/graphql` to the API)

Or individually: `npm run dev:server`, `npm run dev:client`.
