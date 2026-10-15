# Astro on Netlify Platform Starter

## Allyanna accounting API

The Sint Maarten accounting foundation lives in [`backend/`](backend/README.md). **Canonical tip:** [`backend/CANONICAL.md`](backend/CANONICAL.md) (`cursor/allyanna-tot-summary-statement-cfe6`). Multi-tenant Postgres with RLS, OCR → TOT period readiness, dues actions, and payroll kept out of turnover-tax math.

Thin compliance desk (review → post → period-ready → dues): [`frontend/`](frontend/README.md). The Astro site below is the existing Netlify starter and is separate from Allyanna.

[Live Demo](https://astro-platform-starter.netlify.app/)

A modern starter based on Astro.js, Tailwind, and [Netlify Core Primitives](https://docs.netlify.com/core/overview/#develop) (Edge Functions, Image CDN, Blobs).

## OmniClean AI Scanner (monorepo apps)

Commercial cleaning MVP lives alongside this marketing site:

- `apps/api` — Express API, Decimal bidding math, GPT-4o spatial extract, PGlite/Postgres
- `apps/mobile` — Expo client (scan → ledger → checklist → proposal)

See `apps/api/README.md` and `apps/mobile/README.md` to run locally.

## Astro Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Deploying to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/astro-platform-starter)

## Developing Locally

| Prerequisites                                                                |
| :--------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18.20.8+.                                    |
| (optional) [nvm](https://github.com/nvm-sh/nvm) for Node version management. |

1. Clone this repository, then run `npm install` in its root directory.

2. Recommended: link your local repository to a Netlify project. This will ensure you're using the same runtime version for both local development and your deployed project.

```
netlify link
```

3. Run the Astro.js development server:

```
npm run dev
```
