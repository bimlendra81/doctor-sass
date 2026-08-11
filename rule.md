# Coding Rules — Reusability & DRY

Doctor SaaS · React (client) + Node.js (server) · GraphQL + Prisma · **plain JavaScript (ESM)**

## 1. Core Principle: No Duplication

- Every piece of logic, UI, or constant exists in **exactly one place**.
- **Rule of three**: on the 3rd similar usage, extract into a shared module.
- Reuse via composition and imports — never copy-paste and tweak.
- Extend a shared module rather than forking a copy.
- Business rules live in one layer; views/resolvers call them, never re-implement them.

## 2. Shared Workspace (`shared/`)

- Single source of truth for constants/enums used by both server and client:
  `Role`, `Plan`, `AppointmentStatus`, `AppointmentType` — defined once in `@doctor-sass/shared`.
- Server and client import these from the shared package. Never redefine enums in JS code.
- Schema languages keep their native definitions (Prisma `schema.prisma`, `.graphql` enums);
  all **JS logic** must use the shared values — no magic strings.

## 3. React (`client/`)

- **Shared UI kit** in `src/components/ui/`: buttons, inputs, modals, tables, badges, form fields.
  Reuse everywhere; write new bespoke markup only when no existing component fits.
- **Custom hooks** in `src/hooks/`: repeated logic (queries, forms, auth, pagination, toasts)
  is one hook per concern — never inlined per page.
- **Utilities** in `src/lib/`: date/format/validation/constants helpers — no inline copies.
- **GraphQL**: fragments defined once and reused; per-domain query/mutation hooks in
  `src/features/<domain>/api.js` — pages never hand-roll Apollo calls.
- Named exports only. Pages compose shared components; no business logic in render.

## 4. Node.js (`server/`)

- **Service layer** in `src/services/`: business logic lives once per domain; resolvers stay
  thin and delegate. Never duplicate logic across resolvers.
- **Shared helpers**: `utils/errors.js` (AppError builders), per-domain Zod validators reused
  by resolvers, shared pagination/date helpers.
- **DataLoaders** centralize relation fetching — avoids N+1 and duplicate query code.
- One GraphQL context factory; tenant-scoping helper used by all services.
  `clinicId` always comes from context, never from client arguments.
- Named exports only; ESM imports always carry the `.js` extension.

## 5. Anti-patterns to Avoid

- Copy-pasted variants of components, handlers, or queries.
- Near-identical resolvers — extract a service.
- Inline re-formatting of the same data in multiple places — extract a util.
- Magic strings where a shared enum/constant exists.
- Per-page reimplementation of shared UI components.
- Duplicating enums/constants between client and server — use `@doctor-sass/shared`.
