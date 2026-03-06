# Ephemeral Instant Apps for Vercel Preview Deployments

## What it does
Each Vercel preview deployment gets its own ephemeral Instant app instead of sharing the production database. The ephemeral app auto-deletes after 24 hours.

## How it works
1. `scripts/setup-preview-db.sh` runs before `pnpm build` via `vercel.json`'s `buildCommand`
2. On preview deployments (`VERCEL_ENV=preview`), the script:
   - Creates a temp Instant app via `instant-cli init-without-files --temp`
   - Parses the JSON output to get `appId` and `adminToken`
   - Writes `.env.local` so Next.js picks up the values at build time
   - Pushes schema and permissions to the new app
3. On production deployments, the script exits immediately — production env vars are used as-is

## Important
- Production `NEXT_PUBLIC_INSTANT_APP_ID` and `INSTANT_APP_ADMIN_TOKEN` env vars in Vercel must be scoped to **Production only** so they don't override `.env.local` during preview builds
- `--temp` flag means no auth token is needed for `init-without-files`
- Ephemeral apps auto-delete after 24h

## Files
- `scripts/setup-preview-db.sh` — shell script that creates ephemeral app
- `vercel.json` — hooks the script into the build command
