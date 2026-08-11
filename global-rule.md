# Global Coding Rules — Reusability & DRY

Generic rules for any **React + Node.js** stack (plain JavaScript, ESM).
Applies to every project; adapt project-specific paths as needed.

## 1. Core Principle: No Duplication

- Every piece of logic, UI, or constant exists in **exactly one place**.
- **Rule of three**: on the 3rd similar usage, extract into a shared module.
- Reuse via composition and imports — never copy-paste and tweak.
- Extend a shared module rather than forking a copy.
- Business rules live in one layer; views/controllers call them, never re-implement them.

## 2. Shared Code (monorepo / shared package)

- Keep a **single source of truth** for constants/enums shared across apps
  (e.g. a `shared` workspace package). Never redefine them per app.
- Import shared values everywhere; no magic strings where a shared constant exists.
- Schema languages keep their native definitions (Prisma `schema.prisma`, `.graphql` enums);
  all **application logic** uses the shared values.

## 3. React

- **Shared UI kit** (`components/ui/`): buttons, inputs, modals, tables, badges, form fields.
  Reuse everywhere; write new bespoke markup only when no existing component fits.
- **Custom hooks** (`hooks/`): repeated logic (queries, forms, auth, pagination, toasts)
  is one hook per concern — never inlined per page.
- **Utilities** (`lib/`): date/format/validation/constants helpers — no inline copies.
- **GraphQL**: fragments defined once and reused; per-domain query/mutation hooks in
  `features/<domain>/api.js` — pages never hand-roll API calls.
- Named exports only. Pages compose shared components; no business logic in render.

## 4. Node.js

- **Service layer** (`services/`): business logic lives once per domain; resolvers/controllers
  stay thin and delegate. Never duplicate logic across endpoints.
- **Shared helpers**: error builders, per-domain validators reused by handlers,
  shared pagination/date helpers.
- **DataLoaders / caching** centralize data fetching — avoids N+1 and duplicate query code.
- One context factory; tenant/user-scoping helper used by all services.
  Identity always comes from context/request, never from client-supplied arguments.
- Named exports only; ESM imports always carry the `.js` extension.

## 5. Anti-patterns to Avoid

- Copy-pasted variants of components, handlers, or queries.
- Near-identical resolvers/controllers — extract a service.
- Inline re-formatting of the same data in multiple places — extract a util.
- Magic strings where a shared enum/constant exists.
- Per-page reimplementation of shared UI components.
- Duplicating enums/constants across apps — use the shared package.
