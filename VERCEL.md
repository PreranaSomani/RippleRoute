# Vercel Hobby preparation (not deployed)

Keep the **Vite** preset, root directory at the repository root, build command `npm run build`, output directory `dist`, and Node.js **24.x**. The existing `>=22.18.0` package engine range currently resolves to Vercel's Node 24 runtime. No framework migration, frontend changes or new production dependencies are needed.

`api/index.mjs` exports the compiled Express application without calling `listen()` or importing the local `.env` loader. `vercel.json` forwards `/api/*` to this function, preserving original API paths, methods, JSON bodies and binary MP3 responses. Vite's static build continues serving `/`; no blanket SPA rewrite intercepts APIs. Existing local commands (`npm run server` plus `npm run dev`) are unchanged.

## Production backend build

`npm run build` now builds both Vite and the backend. `npm run build:server` uses esbuild to compile `server/vercel-entry.mjs` and its complete local import graph into `server/generated/vercel.mjs` (plain JavaScript ESM). Shared fleet, network and briefing TypeScript is compiled from its existing source, without copying or changing calculations. npm dependencies remain external for Vercel's dependency tracing.

`api/index.mjs` imports only that generated JavaScript bundle. `vercel.json` explicitly includes it in the function. The generated directory is ignored by Git and must be rebuilt; keep the Vercel build command set to `npm run build`. Do not change it to `vite build`, which builds only the frontend. `npm test` rebuilds the backend automatically via `pretest`.

The regression test copies only the API adapter and generated bundle into a temporary directory with npm dependencies, leaves all `src/` and original backend modules absent, and runs Node with TypeScript support disabled. It tests health, binary voice output and Gemini responses using provider fixtures. This catches the previously missed production `ERR_MODULE_NOT_FOUND` failure without a deployment or paid API calls.

## Server-only environment variables

Configure these in Vercel Project Settings → Environment Variables for the intended Preview/Production environment before your eventual deployment:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; otherwise retains the existing server default)
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`

Never prefix them with `VITE_`, paste them into frontend code, or upload `server/.env`. `.vercelignore` excludes environment files and certificate/private-key files from upload; function configuration also excludes them from its bundle. The function reads only `process.env`.

Tiger Data is **off by default**, even if a `DATABASE_URL` environment variable exists. Leave `ENABLE_SAVED_HISTORY` unset/false while its TLS trust remains blocked. Saved History returns its existing explicit disconnected response; Gemini, ElevenLabs and local history continue to work. No migrations run at build or function startup. Re-enabling persistence requires `ENABLE_SAVED_HISTORY=true`, `DATABASE_URL`, and a separately resolved, authenticated TLS configuration; a laptop `DATABASE_CA_FILE` path is not available in Vercel and certificate files are excluded by this deployment configuration.

## Limits checked against current Vercel documentation

- Function limit configured here: **60 seconds**. Gemini and ElevenLabs each use a **40-second server deadline**; browser requests retain their existing 45-second deadline. Cold starts and network delays can still produce a timeout.
- Hobby Fluid Compute supports up to **300 seconds**. The 60-second setting also fits the documented legacy Hobby maximum if Fluid Compute is disabled.
- Requests and responses are limited to **4.5 MB**. Express already rejects JSON request bodies over **24 KB**. Gemini responses are constrained to 2,000 output tokens and bounded prose fields. ElevenLabs MP3 remains binary, with a Vercel-only **4,000,000-byte** guard that returns an explicit error rather than attempting an oversized response. At 128 kbps this is roughly 250 seconds of audio; the normal briefings are much shorter, but provider-generated audio length is not guaranteed.
- The existing server's busy flags apply per warm function instance, not globally across Vercel instances. They are not a distributed quota or billing control.
- Hobby is restricted to personal, non-commercial use. A commercial RippleRoute deployment is incompatible with Hobby's terms. Hobby usage limits may pause service; this change does not enable an upgrade or paid plan.
- Vercel Hobby being free does **not** make Gemini or ElevenLabs usage free. Their API quotas/billing remain independent. The API routes have no application authentication; visitors who can reach the deployment can invoke them and consume provider quota. Review Vercel deployment protection and provider limits before making it public.

References: [Vite functions](https://vercel.com/docs/frameworks/frontend/vite), [function limits](https://vercel.com/docs/functions/limitations), [duration](https://vercel.com/docs/functions/configuring-functions/duration), [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Hobby terms and limits](https://vercel.com/docs/plans/hobby).

## Review and verify

```sh
npm run build
npm test
```

Tests exercise the exported adapter through a local HTTP server, including API paths, server-env configuration, optional database behavior, missing credentials and binary voice responses with provider fixtures. They make no live Gemini, ElevenLabs or database requests. These checks do not replace an actual Vercel build/deployment test, which has not been run.

After you choose to deploy, verify `/` serves the UI, `/api/health` returns JSON, and an unknown `/api/*` path returns the Express JSON 404. In Disruption Lab, run allocation, request Gemini analysis and request one voice briefing. Confirm `audio/mpeg`, playback and the transcript. Decision Replay's Saved History should explicitly report disconnected while local history remains available. A Vercel deployment is required to verify production routing and function bundling; no deployment or push was performed here.
