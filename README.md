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


## Features

- **Multi-tenant clinics** — subdomain-based onboarding, roles (admin / staff / doctor / patient), invites.
- **Patients** — CRUD with soft delete, search, pagination; tenant-isolated.
- **Appointments & scheduling** — doctor availability, slot generation in clinic timezone, booking, cancel, no-show, complete; dashboard counts.
- **E-prescriptions (M8)** — drug autocomplete (Fuse.js over bundled drug dictionary), draft → issue → void lifecycle, clinic-local script numbers, branded PDF download.
- **Invoicing & billing (M9)** — server-computed totals, per-clinic invoice numbers, partial/full payments, void with audit trail, branded printable invoices.
- **Subscriptions & Stripe (M10)** — per-plan usage limits enforced server-side, Stripe Checkout for upgrades, idempotent webhook sync, structured logging + optional Sentry.
- Video consults (planned).


## Plans & limits

| Plan | Patients | Appointments/day | Prescriptions | Invoices |
|------|----------|------------------|---------------|----------|
| Free | 50       | 20               | —             | —        |
| Pro   | 500      | 100              | ✓             | ✓        |
| Enterprise | unlimited | unlimited    | ✓             | ✓        |

Limits are enforced in the service layer (`assertPlanLimit`); exceeding one returns `PLAN_LIMIT_EXCEEDED` (HTTP 402). Feature gates apply to creation mutations only — reads stay open on every plan.


## Stripe billing (M10)

The plan is upgraded by **Stripe webhooks**, not by the client:

1. Client calls `createCheckoutSession(plan: PRO|ENTERPRISE)`.
2. Stripe Checkout completes → `checkout.session.completed` webhook → clinic plan synced from `metadata.plan`.
3. `customer.subscription.updated` syncs status (`active`/`past_due`/`canceled`); `customer.subscription.deleted` downgrades the clinic to Free.

Webhook handling is idempotent via a `WebhookEvent` table (unique event id).

Configure in `server/.env`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
WEBAPP_URL=http://localhost:5173
```

Set the webhook endpoint in the Stripe dashboard to `http://localhost:4000/webhooks/stripe` (raw body, `application/json`). Without keys, `createCheckoutSession` returns `devMode: true` (no payment page) so local development still works.

Observability: `SENTRY_DSN` optionally enables error capture; all requests/errors are JSON-logged.
