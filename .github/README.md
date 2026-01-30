# CI/CD

## Workflows

Workflows are split by app:

- **`workflows/backend/ci.yml`** – Backend CI on push/PR to `main`: install, lint, build (NestJS).
- **`workflows/frontend/ci.yml`** – Frontend CI on push/PR to `main`: install, TypeScript check (`tsc --noEmit`).

No tests are required in backend CI yet; uncomment the test step in `workflows/backend/ci.yml` when you add specs.

## Extending

- Add a **deploy** workflow when you have a target (e.g. Vercel, Railway) and secrets.
- Add **frontend lint** (e.g. ESLint) to `workflows/frontend/ci.yml` when you add a lint script.
- Enable the **backend test** step in `workflows/backend/ci.yml` once you have `.spec.ts` files.
