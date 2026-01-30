# CI/CD

## Workflows

- **`workflows/ci.yml`** – Runs on push and pull requests to `main`:
  - **Backend**: install, lint, build (NestJS).
  - **Frontend**: install, TypeScript check (`tsc --noEmit`).

No tests are required in CI yet; you can uncomment the backend test step in `ci.yml` when you add specs.

## Extending

- Add a **deploy** workflow when you have a target (e.g. Vercel, Railway) and secrets.
- Add **frontend lint** (e.g. ESLint) to the frontend job when you add a lint script.
- Enable the **backend test** step once you have `.spec.ts` files.
