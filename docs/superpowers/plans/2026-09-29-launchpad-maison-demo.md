# Maison demo repo (maison-demo) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Rewritten 2026-09-30 for a new host.** The demo moves out of LaunchPad into `maison-demo`, a standalone repo that QBurst and anyone else can clone and run. It becomes public on GitHub when Paul says so.
> - **Tasks 1–4 port the reviewed LaunchPad commits** (`d3dfff8`, `825c2ca`, `6b68b8f`, and `7ff5816` with `865fa25`) rather than rebuilding them, with the fixes their reviews deferred.
> - **Tasks 5–8 keep their design.** Their paths, commands, ports and scripts are the new repo's.
> - **No in-admin chat.** Paul dropped strapi-plugin-tanstack-ai: the demo's story is customers' agents working with the store's data over Strapi MCP, with LINE as the identity and messaging channel. Staff confirm on the Maison board. The concierge keeps its model choice.
> - **The port was run on 30 September** in a scratch copy of the repo. See "Verified on 30 September" at the end.

> **Amended later on 30 September: a LINE MINI App-ready app, and the real app inside LINE.** Paul asked to finish the integration as a LINE MINI App ([Get started with LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/quickstart/)). Under LINE's MINI App Policy (effective 19 February 2026), only these may create one ([LINE MINI App Policy](https://terms2.line.me/LINE_MINI_App?lang=en)):
> - individuals in Japan, Taiwan or Thailand
> - organizations with a Japanese corporate number, or a Taiwanese or Thai tax ID
>
> So Paul can't create a MINI App channel. A MINI App is a LIFF app on a MINI App channel, and LINE recommends creating new LIFF apps as MINI Apps ([news, 12 February 2025](https://developers.line.biz/en/news/2025/02/12/line-mini-app/)). So:
> - **The app follows LINE's MINI App design guidelines,** in the tasks that own the code:
>   - Task 3: the landscape safe area, and the stage frame only on the laptop
>   - Tasks 5–7: LINE's loading icon, downloaded with Paul's OK
>   - Task 8: tests for both
>   - Task 9: the channel icon
> - **The real app inside LINE is a tested path (Task 9),** no longer only a README option:
>   - Paul's LINE Login channel and LIFF app, and one ngrok origin
>   - the app proxies Strapi's `/mcp`, token endpoint and `/uploads`, so Strapi's admin stays on the laptop
>   - one command switches between local and LINE mode, and the tunnel refuses to open while a mock could sign anyone in
> - **The README is now Task 10.** The app inside LINE is its tested option B. The mock stays the default and the stage's fallback, and the README adds "Run it as a LINE MINI App" for QBurst.
> - **The pre-flight scan's rulings are in too:**
>   - Task 1: zsh-safe file lists, and the commit Step 3 copied
>   - Task 3: an install that doesn't re-run Strapi's
>   - stop points around Controller and Paul steps
>   - Task 8: the cleared-date, list-search and token-cleanup checks
>   - Task 10: a count-only secret check
> - **Task 1's review rulings, mirrored:** the root `.gitignore` covers every `.env`, Strapi binds 127.0.0.1, and `predevelop` checks the shared `@strapi/utils`. The app binds 127.0.0.1 too (Tasks 3 and 9).
> - **Commits go on `feat/maison-demo`,** each with a `Co-Authored-By` trailer. `main` holds the root commit, and the PR into it waits for Paul.
> - **Paul's LINE values** (his LIFF ID, channel ID and ngrok domain) are never in this plan, the README or a commit. They live in `liff/.env` only.

**Goal:** Run the whole "UX to AX" demo on one laptop, from a repo anyone can run with `git clone`, `npm install`, `npm run dev` and `npm run setup`:
- a fresh Strapi 5.55.1 app with the Maison plugin as a local plugin, and oauth-mcp-manager 1.1 from npm
- a LIFF-based Maison app, with catalog screens, an agent view and a concierge, running in a browser at phone size with LINE sign-in simulated by LIFF Mock, and, as a tested option, inside LINE on Paul's phone through his own LIFF app and one ngrok tunnel
- staff in the Strapi admin: the Maison requests board, and the Content Manager
- Claude Desktop as the ops agent
- for the concierge, a local model through Ollama by default, or Claude Sonnet 5 when an API key is set
- a README that is both the quick start for others and the runbook: the run, the backup video, options A and B (B is the app inside LINE), and the handoff to QBurst, who run it as a LINE MINI App

**Architecture:**
- **One repo, two apps, npm.** `strapi/` and `liff/` each have their own `package.json` and lockfile. The root `package.json`'s `npm install` installs both and creates their `.env` files with fresh secrets. `npm run dev` starts Strapi, the app and the LINE verify mock, and `npm run setup` loads the demo into a running Strapi.
- **Strapi** is a fresh `create-strapi` 5.55.1 app, with the plugins always on and the app's own `.tmp/data.db` as the demo database.
  - Maison lives in `strapi/src/plugins/maison`, copied from the plugin's repo. It has its own dependencies, and the app's `postinstall` builds it.
  - oauth-mcp-manager ^1.1.0 comes from npm.
  - An extension keeps an appointment's LINE user ID out of admin API responses and the list search.
  - A setup script registers the demo admin, loads the catalog, and creates the demo's tokens and the app's OAuth client.
- **The app is `liff/`, a Next.js 16 frontend.** In the browser, it initializes LIFF (the mock by default) and exchanges the ID token for a customer session. It then calls the Maison tools on Strapi `/mcp` with the MCP SDK client, recording each call for the agent view.
- **The concierge** is a Next.js route that forwards the customer's session to Strapi with `@ai-sdk/mcp` and streams the model through AI SDK 7: Claude Sonnet 5 with `ANTHROPIC_API_KEY` (or through AI Gateway), otherwise `qwen3-14b-32k` on Ollama.
- **Staff** see requests on the Maison board in the Strapi admin, and confirm them there. The board's admin routes check the signed-in admin's role. Publishing an appointment in the Content Manager confirms it too.
- **The ops agent** is Claude Desktop with the "Maison ops" token. It runs Maison's `send_pending_confirmations` prompt.
- **A local stand-in for LINE's verify endpoint** runs with the app.
- **LINE mode** (Task 9) runs the app's production build behind one ngrok origin.
  - The app proxies Strapi's `/mcp`, token endpoint and `/uploads`, so the phone needs only the app's origin, and Strapi's admin stays on the laptop.
  - `npm run mode:line` and `npm run mode:local` switch the two `.env` files.
  - `npm run tunnel` refuses while the verify mock or the LIFF mock could sign anyone in.

**Tech stack** (versions checked on npm on 30 September):
- Strapi 5.55.1 from `create-strapi@5.55.1` (5.56.0 is the latest), with every `@strapi` package held at 5.55.1 by npm `overrides`
- strapi-oauth-mcp-manager 1.1.0
- npm 11, and Node 24.16 on this laptop. Anywhere else, Node 22.9 or later, for `--env-file-if-exists`.
- Next.js ^16.3.1 (16.3.8 today) and React ^19.2.8 (19.3.0), TypeScript, Tailwind 3.4, and Cormorant Garamond from `@fontsource/cormorant-garamond` 5.3
- `@line/liff` 2.31 and `@line/liff-mock` 1.0.4
- `@modelcontextprotocol/sdk` 1.31 and AI SDK 7: `ai` 7.0 (7.0.126 today), `@ai-sdk/react` 4, `@ai-sdk/mcp` 2, `@ai-sdk/anthropic` 4, and `@ai-sdk/openai-compatible` 3 for Ollama
- Ollama 0.34 with `qwen3-14b-32k` (Qwen3 14B with a 32k context; it calls tools)
- vitest, Playwright, and `concurrently` 9
- Claude Desktop with `mcp-remote`
- for LINE mode: the ngrok agent (3.34.1 on this laptop, at `/opt/homebrew/bin/ngrok`) on Paul's free account, with its dev domain

**Spec:** `docs/superpowers/specs/2026-09-29-launchpad-liff-demo-design.md` in the strapi-store-demo-mcp repo, now the maison-demo design (the file keeps its name), with the overview `2026-09-29-ax-luxury-demo-overview.md`.

**Depends on:**
- **The Maison plugin:** `feat/maison-plugin` in `/Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp` (PR #2, open). It stays the source of truth. The demo carries a copy of its files at one commit, and changes go to its repo first.
- **strapi-oauth-mcp-manager 1.1.0 on npm** (PR #4, then a publish). **This is a prerequisite.** Task 1 installs `^1.1.0`, which fails until 1.1.0 is published. `npm view strapi-oauth-mcp-manager@1.1.0 version` must print `1.1.0`.

This plan relies on how the plugins behave:
- **Maison has ten tools** and one prompt:
  - for customers: `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `request_appointment`, `my_appointments`
  - for staff: `appointment_requests` and `confirm_appointment`
  - for the ops agent: `pending_confirmations`, `record_confirmation`, and the `send_pending_confirmations` prompt
- **Its actions** are `plugin::maison.catalog.read`, `appointments.request`, `appointments.review`, `appointments.confirm`, `confirmations.send` and `demo.manage`.
- **Maison's `ai-tools` service,** for strapi-plugin-tanstack-ai's chat, stays in the copied code. The demo doesn't install that plugin, so it's inert.
- **The Maison admin page** has the requests board (waiting for staff, confirmed, or all requests; refreshed every 5 seconds; a Confirm button) and demo data (load, and a reset that asks first). Its routes are `GET /maison/appointments`, `POST /maison/appointments/:reference/confirm`, `POST /maison/demo/seed` and `POST /maison/demo/reset`.
- **Tool contracts:**
  - Dates must be real calendar dates. The MCP SDK rejects others, such as `2026-02-30`, with a plain-text `isError` result that starts `Input validation error:`.
  - Unknown slugs answer `not_found` with a hint naming the tool that lists valid ones.
  - `pending_confirmations` lists upcoming visits only.
  - The collections are Voyage, Atelier and Gifts.
  - The customer field is hidden in the Content Manager's views.
  - `@strapi/utils` is a peer dependency. The demo's app provides it, and Task 1 makes Maison use the app's copy.
- **oauth-mcp-manager 1.1:**
  - One LINE client can be active at a time, and `/authorize` refuses LINE clients.
  - `channelId` must be digits, and setting `verifyUrl` logs a warning at startup.
  - The token endpoint answers `invalid_grant` (400) when LINE rejects the ID token. It answers `temporarily_unavailable` (503, with `Retry-After`) when LINE answers 408 or 429, can't be reached, or the LINE client needs an admin's attention.
  - A new session is checked against its client again after LINE answers, so deleting or deactivating the client ends sign-ins in flight.
  - The OAuth client holds no LINE channel. `identityProviders.line.channelId` does, from `LINE_LOGIN_CHANNEL_ID`, and Strapi reads it at start. The token endpoint stores `resource` without checking it.
  - Its metadata and `WWW-Authenticate` use `server.url` when it's absolute (`PUBLIC_URL`), so in LINE mode they name the public origin.
- **Strapi 5.55.1's MCP server** answers each `POST /mcp` with a server-sent event stream (it's stateless), and `GET` and `DELETE` with 405.
  - With an absolute `server.url` on the admin's own origin, the admin panel still calls its backend on the page's origin (`@strapi/strapi/dist/src/node/create-build-context.js`).
  - So `http://localhost:1338/admin` keeps working when `PUBLIC_URL` is the tunnel's https origin.

## Global constraints

- **Repo:** `/Users/paul/work/maison-demo`, a new git repo on `main`, created in Task 1.
  - It has no remote until Paul says to publish it (Task 10). Then it becomes `PaulBratslavsky/maison-demo` on GitHub, public.
  - **Commits go on `feat/maison-demo`.** `main` holds only the root commit (Task 1): Paul's hook refuses commits on the default branch, and his rule is branch, commit, PR, merge. The PR from `feat/maison-demo` into `main` waits for Paul (Task 10), and merging is his call.
  - **Every commit message ends with a `Co-Authored-By:` trailer** for the model that wrote it. The commit steps write it as `-m "Co-Authored-By: <your model> <noreply@anthropic.com>"`: put your model's name, as Claude Code gives it, in place of `<your model>`.
  - Stage explicit paths. Each commit step also checks that no `.env`, `node_modules`, `dist`, `.tmp` or database file is staged.
- **npm everywhere.** The root, `strapi/`, `liff/` and `strapi/src/plugins/maison/` each have their own `package.json` and `package-lock.json`, and all four lockfiles are committed. There are no workspaces:
  - Maison installs its own dependencies in its own folder (Paul's decision).
  - Strapi's admin runs on React 18 and the app on React 19, so the two stay apart.
  - `npm install` at the root installs `strapi/` and `liff/`, and `strapi/`'s `postinstall` installs and builds Maison.
- **One Strapi version.** `strapi/package.json` holds eight `@strapi` packages at 5.55.1 with `overrides`. Without them, npm resolves Strapi's own `^5.0.0` peer ranges to 5.56.0, and the app gets two copies of `@strapi/utils` (Task 1, Step 4). Move the overrides with any Strapi upgrade.
- **Maison shares Strapi's `@strapi/utils`.** After Maison's build, `strapi/scripts/share-strapi-utils.mjs` removes the plugin's own copy, so Strapi's error middleware recognises its errors: 400, not 500.
  - `npm install` inside `strapi/src/plugins/maison` brings that copy back. Stop Strapi, and run `npm install` in `strapi/` after it. Until then, `strapi/`'s `predevelop` check stops Strapi at start (Task 1).
  - The root `npm test` checks it.
- **The demo's copy of Maison is the plugin repo's files at one commit, unchanged.**
  - The commit is in Task 1's commit message and in the README.
  - To change Maison, change its repo, then copy it again (README, "The Maison plugin in this repo").
  - What the demo changes about Maison lives outside the copy: the extension in `strapi/src/extensions/maison/`.
- **The plugins always load.** There's no switch and no separate database file: the app's `strapi/.tmp/data.db` is the demo database. To start over, stop Strapi, and delete it together with the uploaded images in `strapi/public/uploads/` (README, "Start over with a clean database").
- **Ports:** Strapi on 1338, the app on 3003, and the LINE verify mock on 127.0.0.1:4545. These are the demo's defaults, so it runs next to a stock Strapi on 1337.
  - On Paul's laptop, 1337, 1340 and 3000 belong to other apps. Leave them alone.
  - The LaunchPad servers belong to the controller: `maison-strapi` on 1338, `maison-app` on 3003 with its mock on 4545, and the LaunchPad site on 3001. The controller retires them before Task 1 starts the demo's Strapi.
  - LaunchPad's `feat/maison-demo` branch stays as it is, local, as the archive of the ported commits.
  - In LINE mode the app's production build, `demo-app-line`, takes 3003 instead of `demo-app`. Never both.
  - **Everything listens on 127.0.0.1 only:**
    - Strapi (`HOST`, Task 1)
    - the app (`next dev -H 127.0.0.1`, and `next start -H 127.0.0.1` in LINE mode)
    - the verify mock

    With 0.0.0.0, anyone on the venue Wi-Fi could register the first admin of a fresh database, or mint customer sessions through the local verify mock and then use the concierge on Paul's API key. Phones reach the app only through the ngrok tunnel, which connects on this machine.
- **The controller owns the long-running dev servers,** through Claude Code's preview runner (`.claude/launch.json` in the controller's workspace):
  - `demo-strapi`: the demo's Strapi on 1338 (Task 1)
  - `demo-app`: the Maison app on 3003, with the LINE verify mock on 127.0.0.1:4545 (Task 3)
  - `demo-app-line`: the app's LINE-mode build on 3003, without the verify mock (Task 9)
  - Implementers never start, stop or restart them. Steps that need one are marked **Controller:**.
  - Short-lived processes that a test or a check starts and stops itself are fine. These include Playwright's `webServer`, the verify mock inside a test or a check, and Maison's integration tests, which boot Strapi in-process on their own database files.
  - Commands that need Strapi use `http://localhost:1338`, the default in every script and test.
- **Never re-run strapi/'s install while `demo-strapi` runs.**
  - Why: `strapi develop` reloads when its lockfiles change, partway through Maison's reinstall and rebuild, and then crashes or answers 500s.
  - After Task 1, installs are `npm install --prefix liff`, plus `npm install --ignore-scripts` at the root when its `package.json` changes, then `node scripts/init-env.mjs`.
  - Task 10's fresh clone checks the whole chain.
- **Stop points.** An implementer stops before a **Controller:** or **Paul:** step, reports, and is resumed at the step after it.
  - Task 1 stops after Step 7, and resumes at Step 9 once `demo-strapi` runs.
  - Tasks 7, 9 and 10 say where they stop.
- **Secrets:**
  - `npm install` creates `strapi/.env` and `liff/.env` from their `.env.example` files (`scripts/init-env.mjs`). It generates Strapi's keys and the demo admin's password, and leaves both files mode 600. They're never printed, logged or committed. To see which keys an `.env` has, list names only: `sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' strapi/.env`.
  - **The demo admin** is `DEMO_ADMIN_EMAIL` (`admin@maison.example`) and `DEMO_ADMIN_PASSWORD` (generated), in `strapi/.env`. `npm run setup` registers it as the first admin of a fresh database. Scripts and tests sign in with it through `node --env-file`.
  - **Paul signs in himself.** He opens `strapi/.env` in his editor and reads the two values. Claude never types a credential into a browser, so every check inside the Strapi admin is Paul's step. The Maison app needs no credentials (LIFF mock), so the controller checks it in the preview browser.
  - The ops token lives only in `strapi/.tmp/maison-ops-token`, which is gitignored and mode 600.
  - Strapi allows five admin sign-ins per email every five minutes. The scripts and tests sign in once per run. A 429 means wait, or ask the controller to restart Strapi.
  - **Paul's LINE values** live only in `liff/.env`, as `LINE_MODE_LIFF_ID`, `LINE_MODE_CHANNEL_ID` and `LINE_MODE_DOMAIN`: his LIFF ID, his LINE Login channel's ID, and his ngrok domain.
    - They never go in this plan, the README, a commit or a log: the repo goes public.
    - Plans and docs write `<your LIFF ID>`, `<your channel ID>` and `<your ngrok domain>`.
    - Scripts check them without printing them, as `node --env-file=liff/.env` does.
  - **ngrok's config holds Paul's authtoken.** Nobody reads it.
- **The concierge's model, and the Anthropic key (a prerequisite only Paul can meet):**
  - **The local model is the default.** With no key, the concierge uses `qwen3-14b-32k` on Ollama at `http://localhost:11434/v1`. In `liff/.env`, `OLLAMA_MODEL` changes the model and `OLLAMA_BASE_URL` the server. Ollama 0.34.2 runs on this laptop with that model.
  - **For Claude on stage,** Paul puts `ANTHROPIC_API_KEY`, or `AI_GATEWAY_API_KEY`, in `liff/.env`. Claude never reads, prints or types it.
  - Strapi runs no model and needs no key.
  - When the model can't be reached, the concierge names the model and the fix.
  - Claude Desktop, the ops agent, runs on Paul's own Claude account and needs the internet in both modes.
- **The customer's session token is the only credential the app handles.**
  - It stays in memory: no `localStorage`, no cookies.
  - The concierge route forwards it and adds no credential of its own.
- **Only call LIFF in the browser,** inside effects or event handlers. `@line/liff` throws during server rendering.
- **LINE mode and the tunnel** (Task 9):
  - Only Paul signs in to LINE, ngrok or any console, and only Paul starts the tunnel (`npm run tunnel`).
  - **A tunnel never runs with the verify mock.** `npm run tunnel` refuses while any of these holds:
    - strapi/.env sets `LINE_VERIFY_URL`
    - the app on 3003 was built for the LIFF mock
    - anything answers on 127.0.0.1:4545
    - the running Strapi accepts a forged ID token
  - **The public origin exposes only the app:** its pages, `/api/concierge`, and three of Strapi's paths (`/mcp`, the token endpoint and `/uploads/*`). Strapi's admin, its other APIs, the OAuth authorize and register pages and `/.well-known` stay on the laptop.
  - Paul's LINE Login channel stays in **Developing**, so only its admins and testers can sign in through the tunnel.
  - ngrok runs with `--inspect=false`, because its local inspector would keep customers' tokens.
  - **Anything that signs in with the mock's tokens runs in local mode:** Task 3's exchange check, Task 7's live test and Task 8. `npm run mode` says which mode the demo is in.
- **Times:** Asia/Tokyo. The app sends `requestedFor` as `YYYY-MM-DDTHH:MM:00+09:00`, and only for real calendar dates.
- **AI SDK 7 names:**
  - use `instructions` (not `system`), `isStepCount` (not `stepCountIs`), `onEnd` (not `onFinish`), and `result.stream`
  - the response is `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`
  - `useChat` takes a `DefaultChatTransport`, and never `api` or `headers` directly
  - MCP tools from `mcp.tools()` arrive as `dynamic-tool` UI parts
- **No push, no GitHub repo and no pull request without Paul.** Only when he says so, Task 10 creates `PaulBratslavsky/maison-demo`, pushes `main` and `feat/maison-demo`, and opens the PR. Merging is his call.
- **LaunchPad and the plugin repos don't change.** The port reads LaunchPad with `git show` and the plugin with `git archive`.

## Review focus

These are the inputs the spec implies most likely to bite a real user. Each has a test or a check in the task that owns the code.

1. **An expired, revoked or refused customer session** (Task 4):
   - After a 401, the app exchanges a new token once and retries the call. It doesn't fail the screen, and doesn't loop.
   - Calls that get their 401 together share that one exchange and reconnect, and none is cut off by it (`865fa25`).
   - `temporarily_unavailable` waits for `Retry-After` and tries once more.
   - `invalid_grant` is never retried. Inside LINE it signs in again: log out and reload, at most once a minute (Task 9).
2. **Two customers on one machine.** A second demo customer (`?demoUser=`) must not see the first customer's visits in the browser. Over MCP, each customer's `my_appointments` must list only their own visits (Task 8).
3. **Requests to the concierge route without a customer session,** or with an admin token, must get a 401 before anything connects to Strapi or the model (Task 7).
4. **Booking on a closed day, or on a date that isn't on the calendar.** Osaka on a Tuesday must show "closed" and disable the request button. A cleared date must ask for one. Neither sends a request (built in Task 6, tested in Task 8).
5. **Running the setup script twice, or with another LINE client active.** It must leave exactly one active "Maison app" client and one of each token, and deactivate the other client. The app must work with the new client ID once the controller restarts it (Task 2).
6. **A customer's full LINE user ID on a staff surface.** The staff tools and the board mask it, and the Content Manager's views hide it. As defense in depth, the admin API must not return it to any admin client, and the Content Manager's list search must not match it (Task 1's extension, tested in Task 8). The appointment's main field, which relation pickers search, must stay `reference` (Task 8).
7. **No API key.** The concierge must work on the local model, or fail with a message that names the model and the fix (Task 7, and its live test).
8. **Maison's validation errors, through Strapi's error middleware.** A Content Manager save that Maison rejects must answer 400 with Maison's reason, not 500 (Task 1: the overrides and the share step, and Maison's own integration test).
9. **A fresh clone.** `git clone`, `npm install`, `npm run dev` and `npm run setup` must be enough, with no hand-edited `.env` and no secret printed (Tasks 1–3, and the clone check in Task 10).
10. **A tunnel with a mock behind it** (Task 9). `npm run tunnel` must refuse while any of these holds:
    - strapi/.env sets `LINE_VERIFY_URL`
    - the app on 3003 was built for the LIFF mock
    - anything answers on the verify mock's port
    - the running Strapi accepts a forged ID token, or can't check one

    It must send no forged token once the mock's port answers. Its tests run on free ports and start no ngrok.
11. **The public origin exposes only the proxied paths** (Task 9).
    - Only `/mcp`, the token endpoint and `/uploads/*` reach Strapi, with only the headers they need: no cookies, no Origin, no ngrok header.
    - `/admin`, the OAuth authorize and register pages, `/_health` and `/.well-known` answer 404 from the app.
    - The controller checks the same list through the tunnel.
12. **MCP answers stream through the proxy** (Task 9).
    - Each event must reach the phone when Strapi writes it, not when the answer ends.
    - Next's external rewrites hold it back under compression (checked on 16.3.8), so the proxy is three route handlers.
    - Its unit test fails a buffering proxy, and `check-strapi-proxy.mjs` times it through `next start`.
13. **A phone in landscape** (Tasks 3 and 8).
    - Full screen, inside LINE's safe area: 44 px at the sides and 21 px at the bottom in landscape, 34 px at the bottom in portrait.
    - Never the stage frame, which needs a wide screen with a fine pointer.
14. **An expired LINE session inside LINE** (Task 9).
    - `signInAgain` logs out and reloads, because `liff.login()` can't be used in the LIFF browser.
    - At most once a minute, so a channel mismatch shows an error instead of reloading for ever.
15. **Someone else on the venue Wi-Fi** (Tasks 1, 3 and 9).
    - Strapi, the app and the verify mock must listen on 127.0.0.1 only: `lsof` in Task 3, Step 5 and Task 9, Step 9.
    - So nobody on the network can register an admin, mint a customer session through the mock, or reach the concierge and the model behind it.

---

## File structure

```
package.json, package-lock.json         root: postinstall (installs strapi/ and liff/, creates the .env files), dev, setup, test
.gitignore
README.md                               the quick start and the runbook (a stub in Task 1; the full one in Task 10)
scripts/init-env.mjs                    strapi/.env and liff/.env from their .env.example files, with fresh secrets
scripts/line-mode.mjs                   npm run mode, mode:line, mode:local: local or LINE mode, in both .env files (Task 9)
scripts/line-tunnel.mjs                 npm run tunnel: the guarded ngrok tunnel for LINE mode (Task 9)
scripts/line-mode.test.mjs, scripts/line-tunnel.test.mjs   node:test
strapi/                                 create-strapi@5.55.1: TypeScript, npm, SQLite
  package.json, package-lock.json       + strapi-oauth-mcp-manager from npm, the @strapi overrides, the postinstall that builds Maison, and predevelop's share check
  .env.example                          every key the demo uses
  config/server.ts                      port 1338, url (absolute media URLs for the app's origin), MCP on
  config/plugins.ts                     maison (local) and strapi-oauth-mcp-manager
  config/middlewares.ts                 CORS for the app and the MCP headers
  src/extensions/maison/strapi-server.ts   an appointment's customer: out of admin API responses and the list search
  src/plugins/maison/                   the Maison plugin, copied from strapi-store-demo-mcp (its own package.json and lockfile)
  scripts/share-strapi-utils.mjs        after Maison's build: Maison and oauth-mcp-manager on Strapi core's @strapi/utils
  scripts/maison-setup.mjs              demo admin, catalog, tokens, OAuth client, liff/.env
  types/generated/                      written by Strapi on its first start
liff/                                   the Maison app
  package.json, package-lock.json, tsconfig.json, next.config.mjs, postcss.config.mjs, tailwind.config.ts,
  vitest.config.ts, vitest.live.config.ts, playwright.config.ts, .env.example, .gitignore
  scripts/mock-line-verify.mjs          local stand-in for LINE's verify endpoint
  lib/config.ts                         public env
  lib/liff.ts                           LIFF / LIFF Mock sign-in
  lib/session.ts                        token exchange, in memory, with its error codes
  lib/mcp.ts                            MCP client, call recording, one shared reconnect after a 401
  lib/maison.ts                         one-time client bootstrap
  lib/types.ts, lib/copy.ts, lib/format.ts, lib/status.ts
  lib/use-tool.ts                       React hook: one tool call per screen
  lib/model.ts                          concierge model: Claude, AI Gateway or Ollama
  lib/concierge.ts                      concierge request handler
  lib/strapi-proxy.ts                   LINE mode: Strapi's /mcp, token endpoint and /uploads on the app's own origin
  lib/tunnel.ts                         LINE mode: the header that skips ngrok's warning page
  lib/*.test.ts                         vitest
  components/*.tsx                      provider, frame, header, screen, drawer, cards, booking sheet, spinner (LINE's loading icon)
  app/layout.tsx, app/globals.css
  app/page.tsx, app/collections/[slug]/page.tsx, app/products/[slug]/page.tsx,
  app/visits/page.tsx, app/visits/[reference]/page.tsx, app/concierge/page.tsx
  app/api/concierge/route.ts
  app/mcp/route.ts, app/api/strapi-oauth-mcp-manager/oauth/token/route.ts, app/uploads/[...path]/route.ts   the proxy's routes
  public/line/LINE_spinner_light.svg    LINE's loading icon, LINE's own file (Task 5, with Paul's OK)
  line/channel-icon.png                 the channel icon, to LINE's MINI App icon spec (Task 9)
  scripts/check-strapi-proxy.mjs, scripts/render-channel-icon.mjs
  live/support.ts, live/concierge.live.test.ts   opt-in, on the local model
  e2e/global-setup.ts, e2e/maison.spec.ts, e2e/api.spec.ts
```

---

### Task 1: Create the repo: Strapi 5.55.1 with Maison and oauth-mcp-manager

**Files:**
- Create:
  - `.gitignore`, `README.md` (a stub), `package.json`, `package-lock.json`, `scripts/init-env.mjs`
  - `strapi/`, from `create-strapi@5.55.1`, and `strapi/package-lock.json`, from the first install
  - `strapi/src/plugins/maison/`, copied from the Maison repo
  - `strapi/scripts/share-strapi-utils.mjs` and `strapi/src/extensions/maison/strapi-server.ts`
  - `strapi/types/generated/`, which Strapi writes when the controller first starts it
- Modify, from the template: `strapi/package.json`, `strapi/config/server.ts`, `strapi/config/plugins.ts`, `strapi/config/middlewares.ts`, `strapi/.env.example`
- Never committed: `strapi/.env`, `strapi/.tmp/`, and every `node_modules/` and `dist/`

**Ported from LaunchPad `d3dfff8`:** the configuration and the extension, changed for a standalone app:
- the template's typed style
- no `MAISON_DEMO` switch and no separate database file
- no strapi-plugin-tanstack-ai (the in-admin chat), so Strapi runs no model and needs no key
- Maison as a local plugin (`resolve`)
- CORS for the app's origin only, which also drops the duplicate `http://localhost:3001` that Task 1's review found
- port 1338 by default
- the extension also takes `customer` out of the list search (`searchable: false`), a minor Task 1's review deferred
- `config/admin.ts` isn't touched: the 5.55.1 template already sets `secrets.encryptionKey`

**Interfaces:**
- Consumes:
  - the Maison plugin's files at `feat/maison-plugin` (plugin id `maison`)
  - `strapi-oauth-mcp-manager` ^1.1.0 from npm (plugin id `strapi-oauth-mcp-manager`)
- Produces:
  - Strapi on `http://localhost:1338`, on `.tmp/data.db`, with the Maison tools and board, LINE token exchange verified against `http://127.0.0.1:4545/verify`, and CORS for `http://localhost:3003`
  - `strapi/.env`, with the keys in `strapi/.env.example`
  - root scripts `postinstall`, `dev:strapi` and `test`
  - the `demo-strapi` launch configuration (the controller's)

- [ ] **Step 1: Create the repo**

```bash
mkdir /Users/paul/work/maison-demo
cd /Users/paul/work/maison-demo
git init -b main
printf 'node_modules\n.DS_Store\n*.log\n.env\n.env.*\n!.env.example\n' > .gitignore
```

The root `.gitignore` keeps every `.env` out of git, in any folder, but not the `.env.example` files. Paul's API key goes in `liff/.env`, and the repo goes public.

`README.md`, a stub until Task 10:

````markdown
# Maison demo: from UX to AX

A fictional luxury house, served to people and agents through Strapi's built-in MCP server. Work in progress: the full README, with the quick start, the runbook and the handoff to QBurst, comes with the finished demo.

`strapi/` is Strapi 5.55.1 with the Maison plugin (`strapi/src/plugins/maison`) and strapi-oauth-mcp-manager.

```bash
npm install          # installs strapi/, builds the Maison plugin, and creates strapi/.env with fresh secrets
npm run dev:strapi   # Strapi on http://localhost:1338
```
````

- [ ] **Step 2: Create the Strapi app**

```bash
cd /Users/paul/work/maison-demo
npx -y create-strapi@5.55.1 strapi --non-interactive --skip-cloud --typescript --use-npm --no-install --no-example --no-git-init --dbclient=sqlite --no-run
rm strapi/.env
```

What the flags do:
- **`create-strapi@5.55.1`:** the CLI writes its own version into the app's `@strapi` dependencies, and `latest` is 5.56.0.
- **`--non-interactive --skip-cloud`:** no prompts, and no Strapi Cloud login.
- **`--typescript --use-npm --dbclient=sqlite --no-example`:** TypeScript, npm, SQLite at `.tmp/data.db`, and no example content.
- **`--no-install`:** Step 6 installs once, with Step 4's overrides in place.
- **`--no-git-init`:** the repo root is the git repository.
- **`--no-run`:** the controller starts Strapi (Step 8).

`rm strapi/.env`: create-strapi's `.env` has port 1337 and only the template's keys. Step 6 creates a new one from the demo's `.env.example`, the way every clone gets one.

Expected: `Your application was created!`, then `strapi/` with `config/`, `src/`, `public/`, `database/`, an empty `node_modules/`, and a `package.json` whose `@strapi` dependencies are all `5.55.1`.

- [ ] **Step 3: Copy the Maison plugin**

```bash
cd /Users/paul/work/maison-demo
SRC=/Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp
SHA=$(git -C "$SRC" rev-parse feat/maison-plugin)
FILES=(admin server test scripts package.json package-lock.json README.md vitest.config.ts .gitignore .editorconfig .prettierrc .prettierignore)
git -C "$SRC" diff --stat 75c494f "$SHA" -- "${FILES[@]}"
mkdir -p strapi/src/plugins/maison
git -C "$SRC" archive "$SHA" -- "${FILES[@]}" | tar -x -C strapi/src/plugins/maison
find strapi/src/plugins/maison -type f | wc -l
echo "Maison: strapi-store-demo-mcp@$SHA"
```

Expected:
- **The `diff --stat` prints nothing:** the plugin's files are the ones verified on 30 September (`75c494f`, the same code as PR #2's head, `ed8dacb`). If it lists files, Maison has changed since. Run its tests in its own repo, then carry on, and say so in the commit message.
- **`133` files.**
- **The commit,** which goes in this task's commit message and, in Task 10, the README.

What comes over, and why:
- **`admin/`, `server/`, `package.json` and `package-lock.json`:** what the build needs, with the dependency versions the plugin was tested with. `server/seed/` holds the catalog and its images.
- **`test/`, `scripts/` and `vitest.config.ts`:** the plugin's unit, integration and MCP smoke tests run inside the demo (Step 7 and Task 8). `scripts/mcp-dev-tokens.mjs` mints the smoke tests' tokens.
- **`README.md`, `.gitignore`, `.editorconfig`, `.prettierrc` and `.prettierignore`:** its docs, and the ignore rules for its own `node_modules`, `dist` and smoke-test tokens.
- **Left out:** `docs/` (the plugin's plans and specs), and everything untracked: `node_modules/`, `dist/`, `.superpowers/` and `.git`. `git archive` exports tracked files only.

- [ ] **Step 4: The app's plugin, overrides and postinstall**

```bash
cd /Users/paul/work/maison-demo/strapi
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
p.dependencies = { ...p.dependencies, "strapi-oauth-mcp-manager": "^1.1.0" };
p.dependencies = Object.fromEntries(Object.entries(p.dependencies).sort(([a], [b]) => a.localeCompare(b)));
p.scripts.postinstall = "cd src/plugins/maison && npm install && npm run build && node ../../../scripts/share-strapi-utils.mjs";
p.scripts.predevelop = "node scripts/share-strapi-utils.mjs --check";
p.overrides = Object.fromEntries(["admin", "data-transfer", "database", "logger", "permissions", "types", "typescript-utils", "utils"].map((name) => ["@strapi/" + name, "5.55.1"]));
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
'
node -e 'const p = require("./package.json"); console.log(p.scripts.postinstall); console.log(p.scripts.predevelop); console.log(Object.keys(p.dependencies).filter((d) => d.startsWith("strapi-")).join(", ")); console.log(Object.keys(p.overrides).length, "overrides")'
```

Expected: the postinstall line, `node scripts/share-strapi-utils.mjs --check`, `strapi-oauth-mcp-manager`, and `8 overrides`.

`predevelop` runs the share step's check before every `npm run develop`. A stray `npm install` inside the Maison folder then stops Strapi at start, rather than turning Maison's 400s into 500s.

The postinstall is Paul's (`cd src/plugins/maison && npm install && npm run build`), plus one step, `share-strapi-utils.mjs`. oauth-mcp-manager comes from npm: it's a reusable package, not part of the demo.

**Why the overrides** (verified on 30 September):
- A plain `create-strapi@5.55.1` app installed today resolves eight `@strapi` packages at 5.56.0: `admin`, `data-transfer`, `database`, `logger`, `permissions`, `types`, `typescript-utils` and `utils`. Strapi's packages declare each other as `^5.0.0` peers, and npm resolves a peer to the newest version.
- Strapi core then keeps nested 5.55.1 copies of `@strapi/utils`, while oauth-mcp-manager loads the top-level 5.56.0 one. Strapi's error middleware answers 400, 403 or 404 only for errors made with core's copy (an `instanceof` check), so the plugin's errors would reach clients as 500s.
- With the overrides, all 24 `@strapi` 5.x packages are 5.55.1, once each, and core uses the top-level `@strapi/utils`.
- `legacy-peer-deps` isn't a fix: it also drops peers Strapi needs, such as `hono` for `@hono/node-server`.

`strapi/scripts/share-strapi-utils.mjs`:

```js
// Makes the plugins share Strapi core's copy of @strapi/utils. Runs after the Maison plugin's own
// `npm install` and build (the postinstall in strapi/package.json). `--check` only checks.
//
// Why: Strapi's error middleware answers 400, 403 or 404 only for errors made with core's own
// @strapi/utils (an `instanceof` check), and anything else is a 500. The Maison plugin has its own
// node_modules, so its build would load a second copy first, and a Content Manager save that Maison
// rejects would show staff "Internal Server Error" instead of the reason. Removing that copy makes
// the plugin resolve the app's, which package.json's overrides keep at core's version.
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const maison = join(app, 'src', 'plugins', 'maison');
const ownCopy = join(maison, 'node_modules', '@strapi', 'utils');

if (!process.argv.includes('--check') && existsSync(ownCopy)) {
  rmSync(ownCopy, { recursive: true, force: true });
  console.log("Removed the Maison plugin's own @strapi/utils, so it shares the app's.");
}

const fromApp = createRequire(join(app, 'package.json'));
const utilsFrom = (packageJson) => createRequire(packageJson).resolve('@strapi/utils');
const core = utilsFrom(fromApp.resolve('@strapi/core/package.json'));
const plugins = {
  maison: utilsFrom(join(maison, 'package.json')),
  'strapi-oauth-mcp-manager': utilsFrom(fromApp.resolve('strapi-oauth-mcp-manager/package.json')),
};
const apart = Object.entries(plugins).filter(([, file]) => file !== core);
if (apart.length > 0) {
  for (const [name, file] of apart) console.error(`${name} loads ${relative(app, file)}, not core's ${relative(app, core)}.`);
  console.error('Their errors would reach clients as 500s. Run `npm install` in strapi/, and check the overrides in strapi/package.json.');
  process.exit(1);
}
console.log("Maison and oauth-mcp-manager share Strapi core's @strapi/utils.");
```

**Why the share step** (verified on 30 September):
- Maison's `npm install` puts its own `@strapi/utils` in `src/plugins/maison/node_modules`, and its build loads that copy first.
- A Content Manager save that Maison's validation rejects then answers 500, and the plugin's own integration test ("rejecting with the app's own ValidationError") fails.
- After the script, the same save answers 400 with Maison's reason (`openingHours[0] must open before it closes`).
- The admin panel needs nothing like it. Strapi 5.55.1's admin build already dedupes React, styled-components, the design system and `@strapi/strapi` for local plugins that have their own `node_modules`.

- [ ] **Step 5: Configure Strapi**

`strapi/config/server.ts`:

```ts
import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => {
  // 1338, not Strapi's usual 1337, so the demo runs next to another Strapi app.
  const port = env.int('PORT', 1338);
  return {
    // This machine only: phones reach the demo through the app's tunnel (README, option B), never Strapi directly.
    host: env('HOST', '127.0.0.1'),
    port,
    // Absolute public address. The Maison plugin builds absolute media URLs from it, which the
    // Maison app needs because it runs on another origin. oauth-mcp-manager uses it for its metadata.
    url: env('PUBLIC_URL', '') || `http://localhost:${port}`,
    app: {
      keys: env.array('APP_KEYS')!,
    },
    webhooks: {
      populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
    },
    // Strapi's built-in MCP server at /mcp, where the Maison tools live.
    mcp: { enabled: env.bool('MCP_ENABLED', true) },
  };
};

export default config;
```

`strapi/config/plugins.ts`. The template's `users-permissions` and `upload` entries stay:

```ts
import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedTypes = [
  'image/svg+xml',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  // env() returns '' for a key that is in .env but empty, so empty counts as unset below.
  const lineChannelId = env('LINE_LOGIN_CHANNEL_ID', '');
  const lineVerifyUrl = env('LINE_VERIFY_URL', '');

  return {
    'users-permissions': {
      config: {
        jwtManagement: 'refresh',
        sessions: {
          httpOnly: true,
        },
      },
    },
    upload: {
      config: {
        security: {
          allowedTypes: allowedMediaTypes,
          deniedTypes,
        },
      },
    },
    // Maison: the demo's catalog and appointments, as MCP tools. A local plugin with its own
    // package.json, built by `npm install` (strapi/package.json's postinstall).
    maison: {
      enabled: true,
      resolve: 'src/plugins/maison',
      config: {
        // The base of links in LINE confirmations. Unset: pending_confirmations answers not_configured.
        liffUrl: env('MAISON_LIFF_URL', '') || null,
      },
    },
    'strapi-oauth-mcp-manager': {
      enabled: true,
      config: {
        // Customer sign-in with LINE. channelId is the LINE Login channel's ID, digits only (not the LIFF ID).
        // LINE_VERIFY_URL points at the Maison app's mock of LINE's verify endpoint: local only, never production.
        identityProviders: lineChannelId
          ? {
              line: {
                channelId: lineChannelId,
                ...(lineVerifyUrl ? { verifyUrl: lineVerifyUrl } : {}),
              },
            }
          : {},
      },
    },
  };
};

export default config;
```

Strapi's `env(key, default)` returns `''` for a key that's in `.env` but empty, so every value above treats empty as unset. Maison's config key is its plugin id, `maison`, and `resolve` is relative to `strapi/`.

`strapi/config/middlewares.ts`:

```ts
import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    // The Maison app calls /mcp and the OAuth token endpoint from the browser, so it needs its origin and
    // the MCP headers. MAISON_APP_ORIGIN adds the app's public address (option B in the README).
    name: 'strapi::cors',
    config: {
      origin: [
        'http://localhost:3003',
        ...(env('MAISON_APP_ORIGIN', '') ? [env('MAISON_APP_ORIGIN')] : []),
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      headers: [
        'Content-Type',
        'Authorization',
        'Origin',
        'Accept',
        'mcp-session-id',
        'mcp-protocol-version',
        'Last-Event-ID',
      ],
      // Retry-After: how long the app waits when sign-in answers temporarily_unavailable.
      expose: ['WWW-Authenticate', 'mcp-session-id', 'mcp-protocol-version', 'Retry-After'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
```

- **`origin`:** the Maison app only. The Strapi admin runs on Strapi's own origin and needs no entry.
- **`methods`** are Strapi's defaults, which include what MCP needs (`GET, POST, DELETE, OPTIONS`).
- **`expose`** adds `Retry-After`, so the app can read how long to wait when sign-in answers `temporarily_unavailable` (Task 4).

`strapi/src/extensions/maison/strapi-server.ts`:

```ts
/**
 * Keeps an appointment's customer (a full LINE user ID) out of every admin API response, and out of the
 * Content Manager's list search.
 *
 * Maison marks the field visible: false, which hides it in the Content Manager's views, and its tools and board
 * mask it. Strapi's admin sanitizer still returns non-visible fields to any admin API consumer, whatever a role's
 * field permissions say; it drops only fields marked hidden in the schema's config, as it does for admin users'
 * reset tokens. The list search (`_q`) matches text fields by substring unless they're marked searchable: false.
 * Defense in depth: nothing in the demo shows the field, and this keeps it that way for any admin client.
 * Maison's services read and write the field through the Document Service, which this doesn't change.
 *
 * Both flags belong in Maison's own schema. Delete this file once the plugin's repo has them.
 */
type MaisonPlugin = {
  contentTypes: Record<string, { schema: Record<string, any> }>;
};

export default (plugin: MaisonPlugin) => {
  const schema = plugin.contentTypes.appointment.schema;
  schema.attributes.customer = { ...schema.attributes.customer, searchable: false };
  schema.config = {
    ...schema.config,
    attributes: {
      ...schema.config?.attributes,
      customer: { ...schema.config?.attributes?.customer, hidden: true },
    },
  };
  return plugin;
};
```

It's defense in depth. Nothing in the demo shows the field: the board and the staff tools mask it, and the Content Manager's views hide it. But Strapi's admin sanitizer returns every `visible: false` attribute to any admin API consumer that can read appointments, including the Super Admin, whatever the role's field permissions say. On 30 September that showed up through strapi-plugin-tanstack-ai's content search, which the demo no longer installs.

With the extension, four things change:
- The Content Manager API, and any other admin API client, no longer gets the field.
- A filter on it is dropped.
- A Content Manager save ignores a `customer` sent in the request.
- The list search (`_q`) no longer matches it. Strapi 5.55.1's database search skips attributes marked `searchable: false`.

Saving, publishing, and Maison's own tools and board still work, because they use the Document Service. The first three were checked in LaunchPad on 30 September, and all four in the demo (see the end). Both flags belong in Maison's own schema; the extension goes once the plugin's repo has them.

`strapi/.env.example`, replacing the template's:

```
# `npm install` at the repo root copies this to .env and generates every secret marked tobemodified,
# and the demo admin's password. Never commit .env.
HOST=127.0.0.1
PORT=1338
APP_KEYS=tobemodified
API_TOKEN_SALT=tobemodified
ADMIN_JWT_SECRET=tobemodified
TRANSFER_TOKEN_SALT=tobemodified
JWT_SECRET=tobemodified
ENCRYPTION_KEY=tobemodified

# The demo's admin. `npm run setup` registers it on a fresh database, and the scripts and tests sign in with it.
# To sign in to the admin yourself, open this file (strapi/.env) in your editor and read both values.
DEMO_ADMIN_EMAIL=admin@maison.example
DEMO_ADMIN_PASSWORD=

# LINE sign-in. The LINE Login channel's ID: digits only, not the LIFF ID. The demo's mock accepts 1234567890.
LINE_LOGIN_CHANNEL_ID=1234567890
# Local only: verify LINE ID tokens against the Maison app's mock. Never set it in production.
LINE_VERIFY_URL=http://127.0.0.1:4545/verify
MAISON_LIFF_URL=http://localhost:3003
# Option B only (README): the app's and Strapi's public https addresses.
MAISON_APP_ORIGIN=
PUBLIC_URL=
```

- **`HOST=127.0.0.1`:** Strapi listens on this machine only. With 0.0.0.0, anyone on the same network could register the first admin of a fresh database, or mint customer sessions while Strapi verifies against the local mock.
- **`LINE_VERIFY_URL`** names 127.0.0.1, where the mock listens.
- **`admin@maison.example`** uses a reserved example domain, and Strapi's registration accepts it.

- [ ] **Step 6: The root package, the env files, and one install**

`package.json` (root):

```json
{
  "name": "maison-demo",
  "version": "0.1.0",
  "private": true,
  "description": "From UX to AX: one set of Strapi MCP tools serving a LINE app, a customer's agent and an ops agent.",
  "engines": {
    "node": ">=22.9.0"
  },
  "scripts": {
    "postinstall": "npm install --prefix strapi && node scripts/init-env.mjs",
    "dev:strapi": "npm run develop --prefix strapi",
    "test": "npm test --prefix strapi/src/plugins/maison && node strapi/scripts/share-strapi-utils.mjs --check"
  }
}
```

`scripts/init-env.mjs`:

```js
// Creates strapi/.env and liff/.env from their .env.example files the first time, and fills in Strapi's
// secrets and the demo admin's password. `npm install` runs it. Safe to run again: it only fills in values
// that are still placeholders, never prints one, and leaves both files readable by you only.
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secret = () => randomBytes(16).toString('base64');

/** Strapi's keys and salts, made the way create-strapi makes them, and the demo admin's password. */
const GENERATED = {
  APP_KEYS: () => [secret(), secret(), secret(), secret()].join(','),
  API_TOKEN_SALT: secret,
  ADMIN_JWT_SECRET: secret,
  TRANSFER_TOKEN_SALT: secret,
  JWT_SECRET: secret,
  ENCRYPTION_KEY: secret,
  // Strapi wants a lower-case letter, a capital and a digit.
  DEMO_ADMIN_PASSWORD: () => `Maison1-${randomBytes(18).toString('base64url')}`,
};
const isPlaceholder = (value) => value === '' || /^"?tobemodified/i.test(value);

for (const app of ['strapi', 'liff']) {
  const example = join(root, app, '.env.example');
  const file = join(root, app, '.env');
  if (!existsSync(example)) continue;
  if (!existsSync(file)) {
    copyFileSync(example, file);
    console.log(`Created ${app}/.env from ${app}/.env.example.`);
  }
  chmodSync(file, 0o600);

  let text = readFileSync(file, 'utf8');
  const filled = [];
  for (const [key, make] of Object.entries(GENERATED)) {
    const line = new RegExp(`^${key}=(.*)$`, 'm');
    const current = text.match(line)?.[1].trim();
    if (current === undefined || !isPlaceholder(current)) continue;
    text = text.replace(line, () => `${key}=${make()}`);
    filled.push(key);
  }
  if (filled.length > 0) {
    writeFileSync(file, text);
    console.log(`Generated ${filled.join(', ')} in ${app}/.env.`);
  }
}
```

It never adds a key the `.env` doesn't have, so a key removed on purpose (such as `LINE_VERIFY_URL` for option B) stays removed.

```bash
cd /Users/paul/work/maison-demo
npm install
```

Expected, in about a minute:
- `> npm install --prefix strapi && node scripts/init-env.mjs`, then Strapi's install and its postinstall:
  - Maison's own install, then `[INFO] Build complete!`
  - "Removed the Maison plugin's own @strapi/utils, so it shares the app's."
  - "Maison and oauth-mcp-manager share Strapi core's @strapi/utils."
- "Created strapi/.env from strapi/.env.example." and "Generated APP_KEYS, API_TOKEN_SALT, ADMIN_JWT_SECRET, TRANSFER_TOKEN_SALT, JWT_SECRET, ENCRYPTION_KEY, DEMO_ADMIN_PASSWORD in strapi/.env." No value is printed.
- **If npm answers `404 Not Found`, or `No matching version found for strapi-oauth-mcp-manager@^1.1.0`:** 1.1.0 isn't on npm yet. Stop, and report the prerequisite (see "Depends on").

`npm install` inside `strapi/` runs the postinstall only when it runs with no package names. `npm install <package>` skips it.

- [ ] **Step 7: Check it, without a server**

```bash
cd /Users/paul/work/maison-demo
node strapi/scripts/share-strapi-utils.mjs --check
(cd strapi && npm ls --all --json) | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const seen = {};
  const walk = (n) => Object.entries(n.dependencies ?? {}).forEach(([name, d]) => {
    if (name.startsWith("@strapi/") && d.version?.startsWith("5.")) (seen[name] ??= new Set()).add(d.version);
    walk(d);
  });
  walk(JSON.parse(s));
  const off = Object.entries(seen).filter(([, v]) => v.size > 1 || !v.has("5.55.1")).map(([n]) => n);
  console.log("@strapi 5.x packages:", Object.keys(seen).length, "| not only 5.55.1:", off.join(", ") || "none");
});'
stat -f '%Lp' strapi/.env
sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' strapi/.env | tr '\n' ' '; echo
node --env-file=strapi/.env -e 'console.log("placeholders left:", Object.values(process.env).filter((v) => /tobemodified/i.test(v)).length, "| demo admin password set:", Boolean(process.env.DEMO_ADMIN_PASSWORD))'
(cd strapi && npx tsc --noEmit -p tsconfig.json) && echo "strapi tsc: ok"
SRC=/Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp
FILES=(admin server test scripts package.json package-lock.json README.md vitest.config.ts .gitignore .editorconfig .prettierrc .prettierignore)
TMP=$(mktemp -d) && git -C "$SRC" archive feat/maison-plugin -- "${FILES[@]}" | tar -x -C "$TMP" && diff -rq "$TMP" strapi/src/plugins/maison -x node_modules -x dist && echo "Maison copy: unchanged"; rm -rf "$TMP"
npm test
cd strapi/src/plugins/maison && STRAPI_APP_DIR="$(cd ../../.. && pwd)" npm run test:integration
```

Expected:
- "Maison and oauth-mcp-manager share Strapi core's @strapi/utils."
- `@strapi 5.x packages: 24 | not only 5.55.1: none`
- `600`, then the key names of `strapi/.env.example`, from `HOST` to `PUBLIC_URL`
- `placeholders left: 0 | demo admin password set: true`
- `strapi tsc: ok`
- `Maison copy: unchanged`: the install and the build didn't touch the copied files, its lockfile included.
- `npm test`: Maison's 171 unit tests pass, then the check.
- **The integration tests:** `tests 42`, `pass 42`, in about 40 seconds.
  - They boot the demo's Strapi in-process on `strapi/.tmp/maison-test-*.db`, never on `data.db`, and open no port.
  - One of them checks that Maison's validation errors are the app's (Step 4).
  - The harness asks for `STRAPI_APP_DIR` as an absolute path: `strapi/`, three levels up.

- [ ] **Step 8 (Controller): Retire LaunchPad's servers, and start the demo's Strapi**

The controller:
1. Stops `maison-strapi` (1338), `maison-app` (3003, with the verify mock on 4545) and the LaunchPad site (3001), and removes their configurations from `.claude/launch.json`.
2. Adds this configuration, and starts it:

```json
{
  "name": "demo-strapi",
  "runtimeExecutable": "/bin/bash",
  "runtimeArgs": [
    "-c",
    "export PATH=/Users/paul/.nvm/versions/node/v24.16.0/bin:$PATH && cd /Users/paul/work/maison-demo/strapi && exec npm run develop"
  ],
  "port": 1338
}
```

The port comes from `strapi/.env` (`PORT=1338`). The first start creates `.tmp/data.db`, writes `types/generated/` and builds the admin. Expected in the preview log:
- `[strapi-oauth-mcp-manager] identityProviders.line.verifyUrl is set: http://127.0.0.1:4545/verify replaces LINE's ID token verification. Use it only for local testing.` This one is expected: the demo verifies against the mock.
- `[strapi-oauth-mcp-manager] OAuth enabled for /mcp`
- `[MCP] Server available at http://localhost:1338/mcp`
- no `[maison] server.mcp.enabled is not true`, and no `[maison] config.liffUrl is not set`
- a note that the `sendmail` email provider is still supported: the template's, and harmless here

- [ ] **Step 9: Check it**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:1338/_health
curl -s http://localhost:1338/.well-known/oauth-authorization-server | grep -o 'token-exchange'
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS http://localhost:1338/mcp -H 'Origin: http://localhost:3003' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type,mcp-protocol-version'
curl -s -D - -o /dev/null -X POST http://localhost:1338/api/strapi-oauth-mcp-manager/oauth/token -H 'Origin: http://localhost:3003' | grep -i '^access-control-expose-headers'
curl -s -D - -o /dev/null -X OPTIONS http://localhost:1338/mcp -H 'Origin: http://localhost:3001' -H 'Access-Control-Request-Method: POST' | grep -ci '^access-control-allow-origin'
curl -s http://localhost:1338/admin/init | grep -o '"hasAdmin":[a-z]*'
```

Expected:
- `204`, then `token-exchange`, then `204` for the preflight
- `Access-Control-Expose-Headers: WWW-Authenticate,mcp-session-id,mcp-protocol-version,Retry-After`
- `0`: other origins get no CORS allowance
- `"hasAdmin":false`: a fresh database. Task 2 registers the demo admin, so nobody opens the admin panel before then.

- [ ] **Step 10: Commit**

```bash
cd /Users/paul/work/maison-demo
git add .gitignore README.md package.json package-lock.json scripts strapi
git diff --cached --name-only | grep -E '(^|/)\.env$|(^|/)node_modules/|(^|/)dist/|(^|/)\.tmp/|\.db$'; echo "(nothing above: no secrets, dependencies or build output)"
git diff --cached --name-only | grep -c '^strapi/src/plugins/maison/'
MAISON_SHA=<the commit Step 3 printed>   # controller: not the branch; the plugin repo gets docs-only commits meanwhile
git commit -m "feat: add the Strapi app with Maison and oauth-mcp-manager" -m "Maison is copied from PaulBratslavsky/strapi-store-demo-mcp at $MAISON_SHA (PR #2)."
git checkout -b feat/maison-demo
```

`git checkout -b` answers `Switched to a new branch 'feat/maison-demo'`. Every later commit goes on this branch, and `main` keeps only the root commit. The PR into `main` waits for Paul (Task 10).

Expected: nothing listed by the first `grep`, `133` Maison files, and a commit whose message names the commit Step 3 copied. `strapi/types/generated/` is in it: Strapi writes it on every start, and it only changes when a content type does.

---

### Task 2: The setup script: demo admin, tokens and the app's OAuth client

**Files:**
- Create: `strapi/scripts/maison-setup.mjs`
- Modify: `package.json` (root): the `setup` script

**Ported from LaunchPad `825c2ca`,** with the fixes its review deferred:
- **The target:** Strapi at `STRAPI_URL`, or on `PORT` from `strapi/.env` (1338), and never a silent 1337. The script prints the target first.
- **`liff/.env` is tightened to mode 600 every run,** not only when it's created. It may hold Paul's API key.
- **One line on failure,** with the fix, instead of a stack trace.
- **The first admin is the demo admin** from `strapi/.env`, not a local test admin.
- **The hints no longer mention `MAISON_DEMO`.**

**Interfaces:**
- Consumes:
  - admin REST: `GET /admin/init`, `POST /admin/register-admin`, `POST /admin/login`, and `GET`/`POST`/`DELETE` `/admin/admin-tokens`
  - Maison: `POST /maison/demo/seed`
  - oauth-mcp-manager admin: `GET /strapi-oauth-mcp-manager/overview`, and `GET`/`POST`/`PUT`/`DELETE` `/strapi-oauth-mcp-manager/clients`
- Produces:
  - on a fresh database, the demo admin as its first (Super) admin
  - admin tokens "Maison customer" (`catalog.read` and `appointments.request`) and "Maison ops" (`confirmations.send`)
  - the OAuth client "Maison app" (`endUserProvider: 'line'`, public, mapped to "Maison customer"), with any other active LINE client deactivated
  - `liff/.env` keys `NEXT_PUBLIC_STRAPI_URL` and `NEXT_PUBLIC_MAISON_CLIENT_ID`
  - `strapi/.tmp/maison-ops-token`
  - `npm run setup`

Three decisions shape the script:
- **No staff token.** On stage, staff work in the Strapi admin as the Super Admin. The Maison board checks the signed-in admin's role, which holds every Maison action. No MCP client works for staff, so a staff token would be a standing credential with nothing to do. The Maison smoke tests mint their own staff token (Task 8). In production, give staff an admin role with `catalog.read`, `appointments.review` and `appointments.confirm` instead of Super Admin.
- **One active LINE client.** oauth-mcp-manager refuses to create or reactivate a LINE client while another one is active. The script deletes the old "Maison app" first. It then deactivates, never deletes, any other active LINE client and names it, so it can be reactivated on the MCP OAuth page.
- **A fresh database needs a first admin.** When `GET /admin/init` reports none, the script registers the demo admin from `strapi/.env`. Run it before anyone opens the admin on a fresh database, or the admin panel offers to register someone else.

- [ ] **Step 1: Write `strapi/scripts/maison-setup.mjs`**

```js
// Sets up the Maison demo on a running Strapi. Safe to run again: it replaces what it made before.
//   1. on a fresh database, registers the demo admin (DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD) as its first admin
//   2. loads the demo catalog
//   3. (re)creates the admin tokens "Maison customer" and "Maison ops"
//   4. (re)creates the OAuth client "Maison app" (customer sign-in with LINE, mapped to "Maison customer").
//      oauth-mcp-manager allows one active LINE client, so any other active one is deactivated first.
//   5. writes the app's Strapi URL and client ID to liff/.env, and the ops token to strapi/.tmp/maison-ops-token
// Usage from the repo root: npm run setup (Strapi at STRAPI_URL, or on PORT from strapi/.env).
// Never prints a secret.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// `||`, not `??`: a key left empty in .env counts as unset.
const STRAPI_URL = (process.env.STRAPI_URL || `http://localhost:${process.env.PORT || 1338}`).replace(/\/+$/, '');
const email = process.env.DEMO_ADMIN_EMAIL;
const password = process.env.DEMO_ADMIN_PASSWORD;

const HINTS = {
  '/maison/demo/seed': 'The Maison plugin is not loaded. Check config/plugins.ts, then run npm install in strapi/.',
  '/strapi-oauth-mcp-manager/overview': 'oauth-mcp-manager is not loaded. Check config/plugins.ts and strapi/package.json.',
};

const call = async (method, path, body, jwt) => {
  let response;
  try {
    response = await fetch(`${STRAPI_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Strapi isn't answering at ${STRAPI_URL}. Start it first (npm run dev), or set STRAPI_URL.`);
  }
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(`${method} ${path} answered 429: Strapi allows 5 admin sign-ins per 5 minutes. Wait, or restart Strapi.`);
    }
    const hint = response.status === 404 && HINTS[path] ? ` ${HINTS[path]}` : '';
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(json.error ?? json)}${hint}`);
  }
  return json.data ?? json;
};

/** Sets KEY=value lines in an env file, creating it from .env.example when missing. Leaves it readable by you only. */
const writeEnv = (file, values) => {
  mkdirSync(dirname(file), { recursive: true });
  const example = file.replace(/\.env$/, '.env.example');
  const created = !existsSync(file);
  let text = !created ? readFileSync(file, 'utf8') : existsSync(example) ? readFileSync(example, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
  }
  // `mode` applies only when the file is created, so tighten an existing one too (it may hold an API key).
  if (!created) chmodSync(file, 0o600);
  writeFileSync(file, text, { mode: 0o600 });
};

const main = async () => {
  if (!email || !password) {
    throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD in strapi/.env. `npm install` at the repo root creates them.');
  }
  console.log(`Setting up the Maison demo on ${STRAPI_URL}.`);

  // 1. A fresh database has no admin yet: register the demo admin as its first one.
  const { hasAdmin } = await call('GET', '/admin/init');
  const { token: jwt } = hasAdmin
    ? await call('POST', '/admin/login', { email, password })
    : await call('POST', '/admin/register-admin', { email, password, firstname: 'Maison', lastname: 'Demo' });
  if (!hasAdmin) console.log('Registered the first admin of this database (DEMO_ADMIN_EMAIL in strapi/.env).');
  const api = (method, path, body) => call(method, path, body, jwt);

  // Fail early, with the fix, if this Strapi can't sign customers in.
  const overview = await api('GET', '/strapi-oauth-mcp-manager/overview');
  if (!overview.mcpEnabled) throw new Error('Strapi MCP is off. Set mcp.enabled in config/server.ts (MCP_ENABLED).');
  if (!overview.encryptionKeyConfigured) throw new Error('Set ENCRYPTION_KEY in strapi/.env, then restart Strapi.');
  if (!overview.lineSignIn?.configured) throw new Error('Set LINE_LOGIN_CHANNEL_ID in strapi/.env, then restart Strapi.');

  // 2. The catalog.
  const seeded = await api('POST', '/maison/demo/seed', {});
  console.log(seeded.created ? 'Loaded the demo catalog.' : 'Demo catalog already loaded.');

  // 3. The old client first, then the tokens: a client mapped to a deleted token would refuse to connect.
  const clients = await api('GET', '/strapi-oauth-mcp-manager/clients');
  for (const client of clients.filter((c) => c.name === 'Maison app')) {
    await api('DELETE', `/strapi-oauth-mcp-manager/clients/${client.id}`);
  }
  const TOKEN_NAMES = ['Maison customer', 'Maison ops'];
  for (const token of await api('GET', '/admin/admin-tokens')) {
    if (TOKEN_NAMES.includes(token.name)) await api('DELETE', `/admin/admin-tokens/${token.id}`);
  }
  const mint = (name, actions, description) =>
    api('POST', '/admin/admin-tokens', {
      name,
      description,
      lifespan: null,
      adminPermissions: actions.map((action) => ({ action, subject: null, properties: {}, conditions: [] })),
    });
  const customer = await mint(
    'Maison customer',
    ['plugin::maison.catalog.read', 'plugin::maison.appointments.request'],
    'Every customer session of the Maison app runs with this token.'
  );
  const ops = await mint('Maison ops', ['plugin::maison.confirmations.send'], 'The ops agent (Claude Desktop) in the Maison demo.');

  // 4. One active LINE client at a time: any other one is deactivated (not deleted; reactivate it on the MCP OAuth page).
  for (const client of clients.filter((c) => c.name !== 'Maison app' && c.endUserProvider === 'line' && c.active)) {
    await api('PUT', `/strapi-oauth-mcp-manager/clients/${client.id}`, { active: false });
    console.log(`Deactivated the LINE client "${client.name}": oauth-mcp-manager allows one active LINE client.`);
  }
  const app = await api('POST', '/strapi-oauth-mcp-manager/clients', {
    name: 'Maison app',
    endUserProvider: 'line',
    redirectUris: [],
    adminTokenId: customer.id,
  });

  // 5. Where the app and the ops agent find them.
  writeEnv(join(root, 'liff', '.env'), { NEXT_PUBLIC_STRAPI_URL: STRAPI_URL, NEXT_PUBLIC_MAISON_CLIENT_ID: app.clientId });
  mkdirSync(join(root, 'strapi', '.tmp'), { recursive: true });
  const opsTokenFile = join(root, 'strapi', '.tmp', 'maison-ops-token');
  // `mode` applies only when the file is created, so tighten one left by an earlier run before writing into it.
  if (existsSync(opsTokenFile)) chmodSync(opsTokenFile, 0o600);
  writeFileSync(opsTokenFile, `${ops.accessKey}\n`, { mode: 0o600 });

  console.log(`Created the "Maison app" client ${app.clientId} and wrote it to liff/.env (restart the app to pick it up).`);
  console.log('Wrote the "Maison ops" token to strapi/.tmp/maison-ops-token (README: "Claude Desktop, the ops agent").');
};

try {
  await main();
} catch (error) {
  // One line, with the fix, rather than a stack trace.
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
}
```

- [ ] **Step 2: Add the root script**

In the root `package.json` `scripts`, add after `"dev:strapi"`:

```json
    "setup": "node --env-file=strapi/.env strapi/scripts/maison-setup.mjs",
```

- [ ] **Step 3: Run it twice**

With `demo-strapi` running (Task 1):

```bash
cd /Users/paul/work/maison-demo
npm run setup
npm run setup
```

Expected:
- **The first run:** "Setting up the Maison demo on http://localhost:1338.", "Registered the first admin of this database (DEMO_ADMIN_EMAIL in strapi/.env).", "Loaded the demo catalog.", one client ID, and the ops token line.
- **The second run:** the same target, "Demo catalog already loaded.", and a new client ID.
- **Neither prints a secret.** The first creates `liff/.env` (and the `liff/` folder, which Task 3 fills), readable by you only.

Optional: run it once more with a second LINE client active, the case oauth-mcp-manager's guard is for. In LaunchPad the permission check refused this step, because it changes a running server's data. If it's refused again, skip it: the scratch run on 30 September covered it (see the end).

```bash
node --env-file=strapi/.env --input-type=module -e "
const base = 'http://localhost:1338';
const login = await (await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.DEMO_ADMIN_EMAIL, password: process.env.DEMO_ADMIN_PASSWORD }) })).json();
const api = (method, path, body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.data.token }, body: body && JSON.stringify(body) }).then((r) => r.json());
const clients = (await api('GET', '/strapi-oauth-mcp-manager/clients')).data;
const tokens = (await api('GET', '/admin/admin-tokens')).data;
await api('PUT', '/strapi-oauth-mcp-manager/clients/' + clients.find((c) => c.name === 'Maison app').id, { active: false });
const qa = await api('POST', '/strapi-oauth-mcp-manager/clients', { name: 'QA LINE app', endUserProvider: 'line', redirectUris: [], adminTokenId: tokens.find((t) => t.name === 'Maison customer').id });
console.log('QA LINE app created:', Boolean(qa.data?.clientId));
"
npm run setup
```

Expected: `QA LINE app created: true`, then "Demo catalog already loaded.", `Deactivated the LINE client "QA LINE app": oauth-mcp-manager allows one active LINE client.`, and a new client ID.

Check what it left, and remove the QA client if there is one:

```bash
node --env-file=strapi/.env --input-type=module -e "
const base = 'http://localhost:1338';
const login = await (await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.DEMO_ADMIN_EMAIL, password: process.env.DEMO_ADMIN_PASSWORD }) })).json();
const api = (method, path) => fetch(base + path, { method, headers: { Authorization: 'Bearer ' + login.data.token } }).then((r) => r.json());
const clients = (await api('GET', '/strapi-oauth-mcp-manager/clients')).data;
const tokens = (await api('GET', '/admin/admin-tokens')).data;
const apps = clients.filter((c) => c.name === 'Maison app');
const qa = clients.find((c) => c.name === 'QA LINE app');
console.log('Maison app clients:', apps.length, '| active LINE:', apps.every((c) => c.active && c.endUserProvider === 'line'));
console.log('Active LINE clients, any name:', clients.filter((c) => c.active && c.endUserProvider === 'line').map((c) => c.name).join(', '));
console.log('Maison tokens:', tokens.filter((t) => t.name.startsWith('Maison ')).map((t) => t.name).sort().join(', '));
if (qa) await api('DELETE', '/strapi-oauth-mcp-manager/clients/' + qa.id);
"
node --env-file=liff/.env -e "console.log('client id in liff/.env:', Boolean(process.env.NEXT_PUBLIC_MAISON_CLIENT_ID))"
stat -f '%Lp' liff/.env strapi/.tmp/maison-ops-token
```

Expected:
- `Maison app clients: 1 | active LINE: true`
- `Active LINE clients, any name: Maison app`
- `Maison tokens: Maison customer, Maison ops`
- `client id in liff/.env: true`
- `600` and `600`

The runs and the check sign in four times at most, inside Strapi's five per five minutes. Task 3 checks the token exchange itself, once the mock verify endpoint exists.

- [ ] **Step 4: Commit**

```bash
cd /Users/paul/work/maison-demo
git add strapi/scripts/maison-setup.mjs package.json
git commit -m "feat: add the setup script (demo admin, catalog, tokens, the app's OAuth client)"
```

---

### Task 3: The `liff/` app skeleton and the mock verify endpoint

**Files:**
- Create:
  - ported unchanged from LaunchPad `6b68b8f`: `liff/app/page.tsx` (temporary), `liff/postcss.config.mjs`, `liff/tsconfig.json`, `liff/vitest.config.ts`
  - ported with changes: `liff/package.json`, `liff/.env.example`, `liff/.gitignore`, `liff/next.config.mjs`, `liff/tailwind.config.ts`, `liff/app/globals.css`, `liff/app/layout.tsx`, `liff/components/phone-frame.tsx`, `liff/scripts/mock-line-verify.mjs`
  - `liff/package-lock.json`, from npm
- Modify: `package.json` (root): install `liff/` too, and `dev`, `dev:app`, `concurrently`

**What changes from `6b68b8f`:**
- **npm, not Yarn:** no `yarn.lock`, and `.gitignore` ignores `node_modules` in place of Yarn's install state.
- **No LaunchPad registration:** `scripts/frontends.mts`, `env.mts`, `dev.mts`, `setup.mts` and `yarn dev:liff` stay in LaunchPad. The root `npm run dev` starts Strapi and the app instead.
- **`turbopack.root` stays pinned** to `liff/`, because the root and `strapi/` have lockfiles too. Only its comment changes.
- **The serif font is self-hosted** from `@fontsource/cormorant-garamond`, so nothing is downloaded at build or run time. `next/font/google` downloaded it at the first compile, which a venue network could break.
- **The mock verify endpoint** rejects extra dot segments (`valid.U….extra`), treats an empty env value as unset (`||`), and says in its log line where it listens and what it accepts.
- **The app listens on 127.0.0.1 only** (`-H 127.0.0.1`), like Strapi and the mock. In LINE mode phones come in through the tunnel (Task 9), and nothing on the venue's network can reach the app's sign-in or the concierge directly. The browser still opens `http://localhost:3003`, the origin Strapi's CORS allows.
- **`.env.example`** points at Strapi on 1338 and `npm run setup`.
- **LINE's MINI App safe area.** LINE asks MINI Apps to keep the page inside the phone's safe area ([Safe area of LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/design/landscape/)):
  - 34 px at the bottom in portrait
  - 44 px on the left and right, and 21 px at the bottom, in landscape

  `globals.css` sets these as two CSS variables, `--line-safe-x` and `--line-safe-bottom`. The frame pads its content with them, and so do the fixed and sticky bars (Tasks 5–7).
- **The stage frame only on the stage laptop.** The phone frame used to start at 500 px wide, which a phone in landscape is too. It now needs a wide screen with a mouse or trackpad: a Tailwind screen named `stage`, `(min-width: 500px) and (hover: hover) and (pointer: fine)`.
- **Checked on 30 September,** in Chromium with Playwright's phone emulation:
  - the stage laptop got the 375×812 frame, with no padding
  - a phone in portrait, and a desktop window 390 px wide, got 34 px at the bottom
  - a phone in landscape got the full width, with 44/44/21 px

**Interfaces:**
- Produces:
  - the app on port 3003, and the mock verify endpoint at `http://127.0.0.1:4545/verify`, which accepts `valid.<U + 32 hex>` for channel `1234567890`
  - `PhoneFrame`, with `data-testid="app-area"` on its content
  - LINE's safe area as `var(--line-safe-x)` and `var(--line-safe-bottom)`, and the Tailwind variant `stage:`
  - root scripts `dev` (Strapi, the app and the mock) and `dev:app`
  - the `demo-app` launch configuration (the controller's)

- [ ] **Step 1: Port the unchanged files**

```bash
cd /Users/paul/work/maison-demo
LP=/Users/paul/work/launchpad-fork-latest
for f in app/page.tsx postcss.config.mjs tsconfig.json vitest.config.ts; do
  mkdir -p "liff/$(dirname "$f")"
  git -C "$LP" show "6b68b8f:liff/$f" > "liff/$f"
done
ls -A liff liff/app
```

Expected: `liff/` has `.env` (from Task 2), `app/`, `postcss.config.mjs`, `tsconfig.json` and `vitest.config.ts`, and `app/` has `page.tsx`. Step 2 writes `globals.css` and `components/phone-frame.tsx`.

- [ ] **Step 2: Write the changed files**

`liff/package.json`:

```json
{
  "name": "maison-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n app,line-mock -c green,cyan \"next dev -H 127.0.0.1 -p 3003\" \"node --env-file-if-exists=.env scripts/mock-line-verify.mjs\"",
    "build": "next build",
    "start": "concurrently -k -n app,line-mock -c green,cyan \"next start -H 127.0.0.1 -p 3003\" \"node --env-file-if-exists=.env scripts/mock-line-verify.mjs\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:live": "node --env-file=../strapi/.env --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.live.config.ts",
    "test:e2e": "node --env-file=../strapi/.env --env-file=.env node_modules/@playwright/test/cli.js test"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^4.0.70",
    "@ai-sdk/mcp": "^2.0.64",
    "@ai-sdk/openai-compatible": "^3.0.61",
    "@ai-sdk/react": "^4.0.127",
    "@fontsource/cormorant-garamond": "^5.3.0",
    "@line/liff": "^2.31.1",
    "@line/liff-mock": "^1.0.4",
    "@modelcontextprotocol/sdk": "^1.31.0",
    "ai": "^7.0.124",
    "next": "^16.3.1",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "zod": "^4.1.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "autoprefixer": "^10.4.20",
    "concurrently": "^9.2.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

`liff/.env.example`:

```
# Strapi and the app's OAuth client. `npm run setup` fills both in.
NEXT_PUBLIC_STRAPI_URL=http://localhost:1338
NEXT_PUBLIC_MAISON_CLIENT_ID=

# LINE. Mock mode signs in a demo customer with LINE's LIFF mock. Set it to false, with a LIFF ID, to run inside LINE.
NEXT_PUBLIC_LIFF_MOCK=true
NEXT_PUBLIC_LIFF_ID=
NEXT_PUBLIC_DEMO_LINE_USER_ID=U4af4980629c1a7b3f1e2d3c4b5a69788
NEXT_PUBLIC_DEMO_LOCALE=ja

# The local stand-in for LINE's ID token verify endpoint. The channel ID must match strapi/.env.
LINE_LOGIN_CHANNEL_ID=1234567890
MOCK_LINE_VERIFY_PORT=4545

# The concierge's model: Claude Sonnet 5 with ANTHROPIC_API_KEY, or through Vercel AI Gateway with AI_GATEWAY_API_KEY.
# With neither, a local model through Ollama's OpenAI-compatible API.
ANTHROPIC_API_KEY=
AI_GATEWAY_API_KEY=
OLLAMA_MODEL=qwen3-14b-32k
OLLAMA_BASE_URL=http://localhost:11434/v1
```

`liff/.gitignore`:

```
node_modules
.next
next-env.d.ts
*.tsbuildinfo
.env
.env.local
playwright-report
test-results
```

`liff/next.config.mjs`:

```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode runs effects twice in development, which would record every tool call twice in the agent view.
  reactStrictMode: false,
  // liff/ has its own package-lock.json, and so do the repo root and strapi/. Pin Turbopack's workspace root to liff/.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
```

`liff/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1c1c1c',
        ivory: '#f7f4ee',
        gold: '#b89b5e',
        mist: '#8a8a8a',
      },
      fontFamily: {
        // Self-hosted from @fontsource (app/layout.tsx), so nothing is downloaded at build or run time.
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Hiragino Sans"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      screens: {
        // The stage laptop: a wide screen with a mouse or trackpad, where the app sits in a phone-sized frame
        // (components/phone-frame.tsx). A phone in landscape is wide too, but has no fine pointer, so it stays full screen.
        stage: { raw: '(min-width: 500px) and (hover: hover) and (pointer: fine)' },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`liff/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  -webkit-text-size-adjust: 100%;
}

body {
  @apply bg-neutral-900 font-sans text-ink antialiased;
}

/*
 * LINE MINI App safe area (https://developers.line.biz/en/docs/line-mini-app/design/landscape/): 34px at the bottom in
 * normal mode, and 44px on the left and right and 21px at the bottom in landscape mode. The app's frame and its fixed
 * and sticky bars pad themselves with these. On the stage laptop the app sits in a phone-sized frame, with no notch.
 */
:root {
  --line-safe-x: 0px;
  --line-safe-bottom: 34px;
}

@media (orientation: landscape) {
  :root {
    --line-safe-x: 44px;
    --line-safe-bottom: 21px;
  }
}

@media screen(stage) {
  :root {
    --line-safe-x: 0px;
    --line-safe-bottom: 0px;
  }
}
```

`screen(stage)` is Tailwind's name for the `stage` media query, and that rule comes last, so on the stage laptop the frame needs no safe area.

`liff/components/phone-frame.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * On a phone the app fills the screen, inside LINE's safe area (app/globals.css). On the stage laptop (`stage:`, a
 * wide screen with a mouse or trackpad) it sits in a phone-sized frame. A phone turned to landscape stays full screen.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh stage:flex stage:items-center stage:justify-center stage:py-8">
      <div className="relative min-h-dvh bg-ivory stage:h-[812px] stage:min-h-0 stage:w-[375px] stage:overflow-hidden stage:rounded-[2.5rem] stage:shadow-2xl stage:ring-8 stage:ring-black">
        <div data-testid="app-area" className="h-full px-[var(--line-safe-x)] pb-[var(--line-safe-bottom)] stage:overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
```

`liff/app/layout.tsx`:

```tsx
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { PhoneFrame } from '@/components/phone-frame';

import './globals.css';

export const metadata: Metadata = {
  title: 'Maison',
  description:
    'A fictional luxury house, served to people and agents through Strapi MCP.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <PhoneFrame>{children}</PhoneFrame>
      </body>
    </html>
  );
}
```

`liff/scripts/mock-line-verify.mjs`:

```js
// A local stand-in for LINE's ID token verify endpoint (POST /verify), used on stage and in development.
// It accepts "valid.<LINE user ID>" for the configured channel, which is what the app's LIFF mock returns.
// Never point production at it. Env: MOCK_LINE_VERIFY_PORT (4545), LINE_LOGIN_CHANNEL_ID (1234567890).
import { createServer } from 'node:http';

// `||`, not `??`: a key left empty in .env counts as unset.
const port = Number(process.env.MOCK_LINE_VERIFY_PORT || 4545);
const channelId = process.env.LINE_LOGIN_CHANNEL_ID || '1234567890';
const LINE_USER_ID = /^U[0-9a-f]{32}$/;

const server = createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST' || req.url !== '/verify') return send(404, { error: 'not_found' });
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const form = new URLSearchParams(raw);
    if (form.get('client_id') !== channelId) {
      return send(400, { error: 'invalid_request', error_description: 'Invalid IdToken Audience.' });
    }
    // Exactly two parts: "valid.U…" passes, "valid.U….extra" doesn't.
    const parts = (form.get('id_token') ?? '').split('.');
    const [kind, sub] = parts;
    if (parts.length !== 2 || kind !== 'valid' || !LINE_USER_ID.test(sub)) {
      return send(400, { error: 'invalid_request', error_description: 'Invalid IdToken.' });
    }
    const now = Math.floor(Date.now() / 1000);
    return send(200, { iss: 'https://access.line.me', sub, aud: channelId, exp: now + 3600, iat: now, amr: ['linesso'], name: 'Demo customer' });
  });
});

server.listen(port, '127.0.0.1', () =>
  console.log(`Mock LINE verify endpoint on http://127.0.0.1:${port}/verify: accepts valid.<LINE user ID> for channel ${channelId}`)
);
```

- [ ] **Step 3: Install it from the root**

Replace the root `package.json` with:

```json
{
  "name": "maison-demo",
  "version": "0.1.0",
  "private": true,
  "description": "From UX to AX: one set of Strapi MCP tools serving a LINE app, a customer's agent and an ops agent.",
  "engines": {
    "node": ">=22.9.0"
  },
  "scripts": {
    "postinstall": "npm install --prefix strapi && npm install --prefix liff && node scripts/init-env.mjs",
    "dev": "concurrently -k -n strapi,app -c magenta,green \"npm run develop --prefix strapi\" \"npm run dev --prefix liff\"",
    "dev:strapi": "npm run develop --prefix strapi",
    "dev:app": "npm run dev --prefix liff",
    "setup": "node --env-file=strapi/.env strapi/scripts/maison-setup.mjs",
    "test": "npm test --prefix strapi/src/plugins/maison && node strapi/scripts/share-strapi-utils.mjs --check"
  },
  "devDependencies": {
    "concurrently": "^9.2.1"
  }
}
```

The install doesn't re-run `strapi/`'s, which would reinstall and rebuild Maison under the running `demo-strapi` (Global constraints). Install `liff/`, then the root's `concurrently` without its postinstall, and create any missing `.env`:

```bash
cd /Users/paul/work/maison-demo
npm install --prefix liff
npm install --ignore-scripts
node scripts/init-env.mjs
node strapi/scripts/share-strapi-utils.mjs --check
cd liff && npm run build
grep -rl 'fonts.googleapis\|fonts.gstatic' .next | head -1; echo "(nothing above: the font is self-hosted)"
```

Expected:
- **The installs:** `liff/node_modules` and `liff/package-lock.json` are created, with no peer-dependency error. The root's `package-lock.json` gains `concurrently`. `strapi/` isn't touched.
- **`init-env.mjs`** prints nothing: both `.env` files exist, and nothing in them is a placeholder.
- **`liff/.env` is left alone.** Task 2's run created it with its two keys. The other keys fall back to the code's defaults, which are the values in `liff/.env.example`. On a fresh clone, `npm install` creates it from `.env.example`. Task 10's clone check runs that whole install.
- "Maison and oauth-mcp-manager share Strapi core's @strapi/utils."
- **`next build`** lists the `/` route, prints no warning about the workspace root, and leaves `tsconfig.json` as written.
- **Nothing is listed by `grep`:** the font comes from the build's own `/_next/static/media/`.

- [ ] **Step 4: Check the mock endpoint and a real exchange**

Port 4545 is free here: Task 1 retired LaunchPad's mock, and the controller starts the app, with its own mock, in the next step.

```bash
cd /Users/paul/work/maison-demo/liff
node --env-file-if-exists=.env scripts/mock-line-verify.mjs & MOCK=$!
U=U$(node -e "process.stdout.write('a'.repeat(32))")
curl -s --retry 20 --retry-connrefused --retry-delay 1 -X POST http://127.0.0.1:4545/verify -d "id_token=valid.$U&client_id=1234567890"; echo
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:4545/verify -d "id_token=valid.$U.extra&client_id=1234567890"
node --env-file=.env --input-type=module -e "
const exchange = (subjectToken) => fetch(process.env.NEXT_PUBLIC_STRAPI_URL + '/api/strapi-oauth-mcp-manager/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: process.env.NEXT_PUBLIC_MAISON_CLIENT_ID,
    subject_token: subjectToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  }),
});
const good = await exchange('valid.U' + 'a'.repeat(32));
const body = await good.json();
console.log(good.status, typeof body.access_token === 'string' && body.access_token.startsWith('mcp_at_') ? 'session issued' : body);
const bad = await exchange('forged.token');
console.log(bad.status, (await bad.json()).error);
"
kill $MOCK
```

Expected:
- The mock answers JSON with `"sub":"Uaaaa…"`, then `400` for the extra dot segment.
- The exchange prints `200 session issued`, then `400 invalid_grant` for the forged token.
- This proves the chain from ID token to token exchange to session, with no LINE account. The `200` leaves a session, and a customer, for the fake user `Uaaaa…` in the demo database; later checks that count customers should expect it.

- [ ] **Step 5 (Controller): Start the app**

The controller adds this configuration to `.claude/launch.json` and starts it:

```json
{
  "name": "demo-app",
  "runtimeExecutable": "/bin/bash",
  "runtimeArgs": [
    "-c",
    "export PATH=/Users/paul/.nvm/versions/node/v24.16.0/bin:$PATH && cd /Users/paul/work/maison-demo/liff && exec npm run dev"
  ],
  "port": 3003
}
```

- `npm run dev` also starts the LINE verify mock. Its log line is `Mock LINE verify endpoint on http://127.0.0.1:4545/verify: accepts valid.<LINE user ID> for channel 1234567890`.
- Next.js reads `NEXT_PUBLIC_*` when it starts, so the controller restarts `demo-app` whenever `npm run setup` writes a new client ID, or `liff/.env` changes.
- `http://localhost:3003` shows "MAISON", in Cormorant Garamond, in a phone frame: the preview browser is a wide screen with a mouse.
- `lsof -nP -iTCP:3003 -sTCP:LISTEN` and `lsof -nP -iTCP:4545 -sTCP:LISTEN` each show one `node` listener, on `127.0.0.1:3003` and `127.0.0.1:4545`: nothing on `*` or `0.0.0.0`.
- The implementer doesn't wait for this step: Step 6's commit doesn't need the running app.

- [ ] **Step 6: Commit**

```bash
cd /Users/paul/work/maison-demo
git add package.json package-lock.json liff
git diff --cached --name-only | grep -E '(^|/)\.env$|(^|/)node_modules/|(^|/)\.next/'; echo "(nothing above: no secrets, dependencies or build output)"
git check-ignore -q liff/.env && echo "liff/.env: ignored"
git check-ignore -q liff/.env.example || echo "liff/.env.example: tracked"
git commit -m "feat(liff): add the Maison app skeleton and the local LINE verify mock" -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

Expected: nothing listed by the first `grep`, `liff/.env: ignored` and `liff/.env.example: tracked`, then the commit. Both `liff/.gitignore` and the root's ignore `.env`.

---

### Task 4: Sign-in, session and the MCP client

**Files:**
- Create, ported from LaunchPad `7ff5816` and `865fa25`: `liff/lib/config.ts`, `liff/lib/types.ts`, `liff/lib/liff.ts`, `liff/lib/session.ts`, `liff/lib/mcp.ts`, `liff/lib/maison.ts`
- Test, from the same commits: `liff/lib/session.test.ts`, `liff/lib/mcp.test.ts`
- Modify: `package.json` (root): the app's tests in `npm test`

**What changes from `865fa25`:** two lines.
- `config.ts` defaults to Strapi on 1338.
- `maison.ts`'s error names `npm run setup`.

`865fa25` is the follow-up to LaunchPad's Task 4, and this port is where that task's review happens (Review focus 1). It fixed a real race: two calls in flight when the session expired used to fail each other. Now calls that get their 401 together share one exchange and one reconnect, and a replaced connection is closed only once no call is using it. The MCP SDK rejects calls still in flight on a closed client with "Connection closed", not a 401, so they would never be retried.

**Interfaces:**
- Consumes: the token endpoint `POST {strapi}/api/strapi-oauth-mcp-manager/oauth/token` (oauth-mcp-manager 1.1), and `{strapi}/mcp`
- Produces:
  - `config` (the public env) and `type Locale = 'ja' | 'en'`
  - `initLiff(): Promise<{ getIdToken: () => string; locale: Locale; mock: boolean; signInAgain: () => void }>`; a failed start can be tried again
  - `createSession({ strapiUrl, clientId, getIdToken, fetchImpl?, now?, sleep? })`, returning `{ getToken(), refresh() }`, plus `SessionError { code, retryAfterSeconds, signInAgain, retryLater }`
  - `createMcp({ strapiUrl, session, onRecord, connect? })`, returning `{ callTool(screen, name, args) }`
  - `ToolCallRecord`, `ToolError`, `toolErrorOf(result)`
  - `getMaison(): Promise<Maison>`, where `Maison = { locale; mock; session; callTool }`, and `onToolCall(listener)`. Inside LINE, `invalid_grant` starts a new LINE login. After a failure, the next call starts over.

- [ ] **Step 1: Port the files**

```bash
cd /Users/paul/work/maison-demo
LP=/Users/paul/work/launchpad-fork-latest
mkdir -p liff/lib
for f in config.ts types.ts liff.ts session.ts mcp.ts maison.ts session.test.ts mcp.test.ts; do
  git -C "$LP" show "865fa25:liff/lib/$f" > "liff/lib/$f"
done
sed -i '' "s|'http://localhost:1337'|'http://localhost:1338'|" liff/lib/config.ts
sed -i '' 's|Run `yarn maison:setup` and restart the app.|Run `npm run setup` and restart the app.|' liff/lib/maison.ts
grep -n "localhost:13\|npm run setup\|yarn" liff/lib/*.ts
```

Expected: `config.ts` shows `'http://localhost:1338'`, `maison.ts` shows `npm run setup`, and nothing mentions Yarn. The `sed -i ''` form is macOS's.

The code is LaunchPad's Task 4 (`7ff5816`), with the connection handling from `865fa25` in `createMcp`:

```ts
/** A connection and the number of calls in flight on it. Once replaced, it is closed as soon as none are left. */
interface Lease {
  client: Connection;
  active: number;
  retired: boolean;
}

/**
 * The screens' MCP connection to Strapi. Every call is recorded for the agent view.
 * A 401 (the session expired or was revoked) triggers one new token exchange and one retry.
 * Calls that get their 401 together share that one exchange and reconnect.
 */
export const createMcp = ({
  strapiUrl,
  session,
  onRecord,
  connect = connectTo(strapiUrl),
}: {
  strapiUrl: string;
  session: Session;
  onRecord: (record: ToolCallRecord) => void;
  connect?: Connect;
}) => {
  let connection: Promise<Lease> | null = null;
  let nextId = 1;

  const close = async (lease: Lease) => {
    try {
      await lease.client.close();
    } catch {
      // already closed
    }
  };

  const retire = (lease: Lease) => {
    if (lease.retired) return;
    lease.retired = true;
    if (lease.active === 0) void close(lease);
  };

  const open = (renew: boolean): Promise<Lease> => {
    const opened: Promise<Lease> = (
      renew ? session.refresh() : session.getToken()
    )
      .then(async (token) => ({
        client: await connect(token),
        active: 0,
        retired: false,
      }))
      .catch((error) => {
        // Forget this connection, unless a newer one has already replaced it.
        if (connection === opened) connection = null;
        throw error;
      });
    return opened;
  };

  const getConnection = (): Promise<Lease> => (connection ??= open(false));

  /**
   * The connection to retry on after a 401 on `stale`. The first call to notice exchanges a new token and
   * reconnects; calls that got their 401 on the same connection join that reconnect instead of making their own.
   * The stale connection is closed once no call is still in flight on it: closing it sooner makes the MCP SDK
   * reject those calls with "Connection closed" instead of their own 401, so they would never be retried.
   */
  const renewConnection = (stale: Promise<Lease>): Promise<Lease> => {
    if (connection && connection !== stale) return connection;
    const renewed = open(true);
    connection = renewed;
    stale.then(retire, () => {}); // a connection that never opened has nothing to close
    return renewed;
  };

  const invoke = async (
    lease: Lease,
    name: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult> => {
    lease.active++;
    try {
      return (await lease.client.callTool({
        name,
        arguments: args,
      })) as CallToolResult;
    } finally {
      lease.active--;
      if (lease.retired && lease.active === 0) void close(lease);
    }
  };

  const callTool = async (
    screen: string,
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<CallToolResult> => {
    const started = performance.now();
    const record = (result: CallToolResult | null, error: string | null) =>
      onRecord({
        id: nextId++,
        screen,
        name,
        args,
        result,
        error,
        ms: Math.round(performance.now() - started),
        at: new Date().toISOString(),
      });
    try {
      let result: CallToolResult;
      const used = getConnection();
      try {
        result = await invoke(await used, name, args);
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
        result = await invoke(await renewConnection(used), name, args);
      }
      record(result, null);
      return result;
    } catch (error) {
      record(null, (error as Error).message);
      throw error;
    }
  };

  return { callTool };
};
```

The added test, "calls that get a 401 together share one reconnect, and neither is cut off by it", uses fake connections that behave like the SDK's client: closing one rejects the calls still in flight on it. It passes only with both halves of the fix: renewing only when the connection a call used is still the current one, and closing a replaced connection only when it's idle.

- [ ] **Step 2: Add the app's tests to the root `npm test`**

In the root `package.json`, change `"test"`, still the last script, to:

```json
    "test": "npm test --prefix liff && npm test --prefix strapi/src/plugins/maison && node strapi/scripts/share-strapi-utils.mjs --check"
```

- [ ] **Step 3: Run the tests and the type check**

```bash
cd /Users/paul/work/maison-demo/liff && npm test && npm run typecheck
cd /Users/paul/work/maison-demo && npm test
```

Expected:
- **The app:** 14 tests pass (session 6, MCP client 8), and `tsc` exits 0.
- **The root:** the app's 14, Maison's 171, and the `@strapi/utils` check.

If `npm run typecheck` reports that `ExtendedInit` or `LiffMockApi` isn't exported, read `node_modules/@line/liff-mock/dist/index.d.ts` and import the names it exports. On 30 September, 1.0.4 exported both.

- [ ] **Step 4: Commit**

```bash
cd /Users/paul/work/maison-demo
git add liff/lib package.json
git commit -m "feat(liff): add LINE sign-in, the customer session and the MCP client" -m "Ported from LaunchPad 7ff5816 and 865fa25: calls that get a 401 together share one reconnect." -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 5: Shared UI and the catalog and visits screens

**Files:**
- Create:
  - `liff/lib/copy.ts`, `liff/lib/format.ts`, `liff/lib/status.ts`, `liff/lib/use-tool.ts`
  - `liff/components/maison-provider.tsx`, `header.tsx`, `screen.tsx`, `agent-drawer.tsx`, `product-grid.tsx`, `status-note.tsx`, `spinner.tsx`
  - `liff/public/line/LINE_spinner_light.svg`: LINE's own loading icon, downloaded with Paul's OK (Step 4)
  - `liff/app/collections/[slug]/page.tsx`, `liff/app/visits/page.tsx`, `liff/app/visits/[reference]/page.tsx`
- Modify: `liff/app/layout.tsx`, `liff/app/page.tsx`
- Test: `liff/lib/format.test.ts`

**Interfaces:**
- Consumes: `getMaison`, `onToolCall`, `toolErrorOf`, `ToolCallRecord` and the types (Task 4)
- Produces:
  - `useMaison()`, returning `{ status, error, errorCode, maison, locale, calls, agentView, setAgentView, retrySignIn }`
  - `useTool<T>(screen, name, args)`, returning `{ loading, data, error, retry }`
  - `<Screen name tools>`, `<ProductGrid>`, `<StatusNote>`, and `<Spinner label className?>`: LINE's loading icon
  - `COPY[locale]`
  - `yen`, `visitTime`, `mediaUrl`, `nextSaturday`, `tomorrow`, `timeSlots`, `isRealDate`
  - `statusLabel` and `errorText` (the customer's words for a tool's error code)

- [ ] **Step 1: Write the failing test `liff/lib/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isRealDate, mediaUrl, nextSaturday, timeSlots, visitTime, yen } from './format';

describe('format', () => {
  it('formats yen and Tokyo visit times', () => {
    expect(yen(385000)).toBe('￥385,000');
    expect(visitTime('2026-10-10T14:00:00+09:00', 'ja')).toContain('14:00');
    expect(visitTime('2026-10-10T05:00:00.000Z', 'en')).toContain('14:00');
  });

  it('picks the next Saturday at least two days away', () => {
    expect(nextSaturday(new Date(2026, 9, 7))).toBe('2026-10-10'); // Wednesday → Saturday
    expect(nextSaturday(new Date(2026, 9, 9))).toBe('2026-10-17'); // Friday → the Saturday after
    expect(nextSaturday(new Date(2026, 9, 10))).toBe('2026-10-17'); // Saturday → next week
  });

  it('offers half-hour slots that end 30 minutes before closing', () => {
    const slots = timeSlots('11:00', '20:00');
    expect(slots[0]).toBe('11:00');
    expect(slots.at(-1)).toBe('19:30');
    expect(slots).toHaveLength(18);
  });

  it('makes relative media URLs absolute', () => {
    expect(mediaUrl('/uploads/a.png')).toMatch(/^https?:\/\/.+\/uploads\/a\.png$/);
    expect(mediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(mediaUrl(null)).toBeNull();
  });

  it('accepts only real calendar dates, like the Maison tools', () => {
    expect(isRealDate('2026-10-10')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-09-31')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});
```

`Intl` writes the yen sign as a full-width `￥` in `ja-JP`. If your Node prints `¥` instead, keep what `yen` produces: the test pins the format this Node version uses.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL with "Failed to resolve import ./format".

- [ ] **Step 3: Implement `liff/lib/format.ts` and `liff/lib/copy.ts`**

`liff/lib/format.ts`:

```ts
import { config } from './config';
import type { Locale } from './types';

const yenFormat = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });
export const yen = (value: number) => yenFormat.format(value);

/** A visit's start in Tokyo time, e.g. "10月10日(土) 14:00" or "Sat 10 Oct, 14:00". */
export const visitTime = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-GB', {
    timeZone: 'Asia/Tokyo',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

/** Strapi media URLs are absolute when server.url is set; relative ones get the Strapi origin. */
export const mediaUrl = (url: string | null | undefined): string | null =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${config.strapiUrl}${url}`;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The next Saturday at least two days away (YYYY-MM-DD): the booking sheet's default. */
export const nextSaturday = (from = new Date()): string => {
  const date = new Date(from);
  const ahead = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (ahead < 2 ? ahead + 7 : ahead));
  return isoDay(date);
};

export const tomorrow = (from = new Date()): string => {
  const date = new Date(from);
  date.setDate(date.getDate() + 1);
  return isoDay(date);
};

/** Half-hour start times from opening until 30 minutes before closing. */
export const timeSlots = (opens: string, closes: string): string[] => {
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const slots: string[] = [];
  for (let m = minutes(opens); m <= minutes(closes) - 30; m += 30) slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return slots;
};

/** Whether a YYYY-MM-DD is on the calendar, the same rule as the Maison tools. A cleared date input gives ''. */
export const isRealDate = (value: string): boolean => {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
};
```

`liff/lib/copy.ts`:

```ts
export const COPY = {
  ja: {
    tagline: '旅と贈り物のメゾン',
    collections: 'コレクション',
    pieces: (n: number) => `${n}点`,
    askConcierge: 'コンシェルジュに相談する',
    myVisits: 'ご来店予約',
    agentView: 'エージェントビュー',
    agentViewEmpty: 'この画面のツール呼び出しはまだありません。',
    signingIn: 'LINEでサインインしています…',
    signInFailed: 'サインインできませんでした',
    backHome: 'トップへ戻る',
    chooseDate: '日付をお選びください。',
    loading: '読み込み中…',
    retry: 'もう一度',
    personalizable: 'パーソナライズ可',
    stockByBoutique: 'ブティックの在庫',
    inStock: (n: number) => `在庫 ${n}`,
    outOfStock: '在庫なし',
    personalization: 'パーソナライズ',
    leadDays: (n: number) => `お届けまで約${n}日`,
    bookVisit: '来店を予約',
    boutique: 'ブティック',
    date: '日付',
    time: '時間',
    note: 'メッセージ（任意）',
    request: 'リクエストを送る',
    closedOnDate: 'この日は休業日です。別の日をお選びください。',
    requested: 'ブティックの確認待ち',
    confirmed: '確定',
    confirmationSent: '確定 · LINEで送信済み',
    visitRequested: 'リクエストを送りました。ブティックからLINEで確定のご連絡があります。',
    noVisits: 'ご来店予約はまだありません。',
    visitNotFound: 'この予約は見つかりませんでした。',
    concierge: 'コンシェルジュ',
    conciergeIntro: 'ギフト選びやご来店のご予約をお手伝いします。',
    placeholder: 'メッセージを入力',
    send: '送信',
    suggestions: ['旅好きの友人へのギフトを40万円以内で探しています。土曜日の14時に銀座で見られますか？', 'はい、お願いします。'],
    results: (n: number) => `${n}件`,
    // What people see for a tool's error code. The tools' hints are written for agents, so screens don't show them.
    errors: {
      not_found: 'お探しのものは見つかりませんでした。',
      invalid_input: '入力内容をご確認ください。',
      boutique_closed: 'この時間はブティックの営業時間外です。',
      in_the_past: 'もう少し先の日時をお選びください。',
      too_many_open_requests: '確認待ちのご予約が上限に達しています。ブティックの確認後に、新しくご予約いただけます。',
      not_signed_in: 'LINEでサインインしてください。',
      invalid_grant: 'LINEでもう一度サインインしてください。',
      temporarily_unavailable: 'LINEのサインインを確認できませんでした。しばらくしてからもう一度お試しください。',
    },
  },
  en: {
    tagline: 'A house of travel and gifts',
    collections: 'Collections',
    pieces: (n: number) => `${n} pieces`,
    askConcierge: 'Ask the concierge',
    myVisits: 'My visits',
    agentView: 'Agent view',
    agentViewEmpty: 'No tool calls on this screen yet.',
    signingIn: 'Signing in with LINE…',
    signInFailed: 'Sign-in failed',
    backHome: 'Back to the start',
    chooseDate: 'Please choose a date.',
    loading: 'Loading…',
    retry: 'Try again',
    personalizable: 'Personalizable',
    stockByBoutique: 'Stock by boutique',
    inStock: (n: number) => `${n} in stock`,
    outOfStock: 'Out of stock',
    personalization: 'Personalization',
    leadDays: (n: number) => `About ${n} days`,
    bookVisit: 'Book a visit',
    boutique: 'Boutique',
    date: 'Date',
    time: 'Time',
    note: 'Note (optional)',
    request: 'Send request',
    closedOnDate: 'Closed on this day. Please pick another.',
    requested: 'Awaiting the boutique',
    confirmed: 'Confirmed',
    confirmationSent: 'Confirmed · LINE sent',
    visitRequested: 'Request sent. The boutique will confirm on LINE.',
    noVisits: 'No visits yet.',
    visitNotFound: "We couldn't find this visit.",
    concierge: 'Concierge',
    conciergeIntro: 'I can help you choose a gift and book a boutique visit.',
    placeholder: 'Write a message',
    send: 'Send',
    suggestions: ["I'm looking for a gift under ¥400,000 for a friend who travels. Could I see it in Ginza on Saturday at 2 pm?", 'Yes, please.'],
    results: (n: number) => `${n} results`,
    errors: {
      not_found: "We couldn't find that.",
      invalid_input: 'Please check what you entered.',
      boutique_closed: 'The boutique is closed at that time.',
      in_the_past: 'Please choose a later time.',
      too_many_open_requests: 'You have as many visits waiting for a boutique as you can. You can request another once one is confirmed.',
      not_signed_in: 'Please sign in with LINE.',
      invalid_grant: 'Please sign in with LINE again.',
      temporarily_unavailable: "LINE sign-in couldn't be checked. Please try again in a moment.",
    },
  },
} as const;
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: LINE's loading icon (Paul's OK first)**

LINE asks LINE MINI Apps to "Download the spinner (svg file) and use it as a loading icon": 30×30 px, centered ([Loading icon](https://developers.line.biz/en/docs/line-mini-app/design/loading-icon/)). The app has no dark theme, so it uses the light-mode file:

| File | URL | HEAD on 30 September |
|---|---|---|
| `LINE_spinner_light.svg` | `https://developers.line.biz/media/line-mini-app/LINE_spinner_light.svg` | 712 bytes, `image/svg+xml` |
| `LINE_spinner_dark.svg` (not used) | `https://developers.line.biz/media/line-mini-app/LINE_spinner_dark.svg` | 712 bytes, `image/svg+xml` |

**Controller:** before dispatching this task, ask Paul: "May the implementer download LINE's loading icon, LINE_spinner_light.svg (712 bytes, from developers.line.biz), into liff/public/line/, and commit it to the repo, which will be public?" Put his answer in the brief.

With his OK:

```bash
cd /Users/paul/work/maison-demo
mkdir -p liff/public/line
curl -sSf -o liff/public/line/LINE_spinner_light.svg https://developers.line.biz/media/line-mini-app/LINE_spinner_light.svg
stat -f '%z' liff/public/line/LINE_spinner_light.svg
grep -c '<svg' liff/public/line/LINE_spinner_light.svg
```

Expected: `712`, then `1`. Another size means LINE has changed the file since 30 September: use it, and say so in the report.

If Paul says no, skip the download, and leave the `<img>` out of `Spinner` in Step 5, so it shows its label alone. Task 10's README then lists the loading icon among what QBurst adds.

- [ ] **Step 5: Write the provider, the tool hook and the shared components**

`liff/components/maison-provider.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { config } from '@/lib/config';
import { toLocale } from '@/lib/liff';
import { getMaison, onToolCall, type Maison } from '@/lib/maison';
import type { ToolCallRecord } from '@/lib/mcp';
import { SessionError } from '@/lib/session';
import type { Locale } from '@/lib/types';

interface MaisonContext {
  status: 'starting' | 'ready' | 'error';
  error: string | null;
  /** The OAuth error code of a failed sign-in (temporarily_unavailable, invalid_grant), or null. */
  errorCode: string | null;
  maison: Maison | null;
  locale: Locale;
  calls: ToolCallRecord[];
  agentView: boolean;
  setAgentView: (on: boolean) => void;
  retrySignIn: () => void;
}

type SignIn = Pick<MaisonContext, 'status' | 'error' | 'errorCode' | 'maison'>;

const Context = createContext<MaisonContext | null>(null);
const AGENT_VIEW_KEY = 'maison.agentView';

export function MaisonProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SignIn>({ status: 'starting', error: null, errorCode: null, maison: null });
  const [attempt, setAttempt] = useState(0);
  const [calls, setCalls] = useState<ToolCallRecord[]>([]);
  const [agentView, setAgentViewState] = useState(false);

  useEffect(() => {
    try {
      setAgentViewState(window.localStorage.getItem(AGENT_VIEW_KEY) === 'on');
    } catch {
      // storage unavailable: start with the agent view off
    }
    return onToolCall((record) => setCalls((previous) => [...previous.slice(-49), record]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'starting', error: null, errorCode: null, maison: null });
    getMaison().then(
      (maison) => {
        if (!cancelled) setState({ status: 'ready', error: null, errorCode: null, maison });
      },
      (error: Error) => {
        if (!cancelled) setState({ status: 'error', error: error.message, errorCode: error instanceof SessionError ? error.code : null, maison: null });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const setAgentView = useCallback((on: boolean) => {
    setAgentViewState(on);
    try {
      window.localStorage.setItem(AGENT_VIEW_KEY, on ? 'on' : 'off');
    } catch {
      // not remembered this time
    }
  }, []);
  const retrySignIn = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<MaisonContext>(
    () => ({ ...state, locale: state.maison?.locale ?? toLocale(config.demoLocale), calls, agentView, setAgentView, retrySignIn }),
    [state, calls, agentView, setAgentView, retrySignIn]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useMaison = (): MaisonContext => {
  const context = useContext(Context);
  if (!context) throw new Error('useMaison must be used inside <MaisonProvider>');
  return context;
};
```

`liff/lib/use-tool.ts`:

```ts
import { useEffect, useState } from 'react';

import { useMaison } from '@/components/maison-provider';
import { toolErrorOf, type ToolError } from './mcp';
import { SessionError } from './session';

/**
 * Calls one Maison tool once the customer is signed in, and again whenever `args` change.
 * Pass `null` as args to wait. Returns the structured result, or the tool's error.
 */
export function useTool<T>(screen: string, name: string, args: Record<string, unknown> | null) {
  const { status, maison } = useMaison();
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: ToolError | null }>({ loading: true, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(args);

  useEffect(() => {
    if (status !== 'ready' || !maison || args === null) return;
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));
    maison.callTool(screen, name, args).then(
      (result) => {
        if (!cancelled) setState({ loading: false, data: (result.structuredContent as T | undefined) ?? null, error: toolErrorOf(result) });
      },
      (error: Error) => {
        // A sign-in problem keeps its OAuth code (temporarily_unavailable, invalid_grant), so the screen can say what to do.
        const code = error instanceof SessionError ? error.code : 'network';
        if (!cancelled) setState({ loading: false, data: null, error: { code, message: error.message, hint: '' } });
      }
    );
    return () => {
      cancelled = true;
    };
    // `key` stands in for `args`, whose identity changes on every render.
  }, [status, maison, screen, name, key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
```

`liff/components/spinner.tsx`:

```tsx
/**
 * LINE's loading icon, as LINE asks LINE MINI Apps to show one: its own 30×30 spinner, centered
 * (https://developers.line.biz/en/docs/line-mini-app/design/loading-icon/). The label says what's loading, under the
 * spinner and to screen readers.
 */
export function Spinner({ label, className = 'py-10' }: { label: string; className?: string }) {
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-2 px-5 ${className}`}>
      <img src="/line/LINE_spinner_light.svg" width={30} height={30} alt="" />
      <p className="text-xs text-mist">{label}</p>
    </div>
  );
}
```

`liff/components/status-note.tsx`:

```tsx
'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import type { ToolError } from '@/lib/mcp';
import { errorText } from '@/lib/status';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/**
 * Loading and error states for one tool call. People see plain copy for the error's code; the tool's own message
 * and hint are written for agents, and the agent view shows them. not_found offers a way back, not a retry.
 */
export function StatusNote({ loading, error, retry }: { loading: boolean; error: ToolError | null; retry: () => void }) {
  const { locale } = useMaison();
  const t = COPY[locale];
  if (error) {
    return (
      <div role="alert" className="mx-5 my-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p>{errorText(error, locale)}</p>
        {error.code === 'not_found' ? (
          <Link href="/" className="mt-3 inline-flex min-h-[44px] items-center text-xs underline">
            {t.backHome}
          </Link>
        ) : (
          <button type="button" onClick={retry} className="mt-3 min-h-[44px] text-xs underline">
            {t.retry}
          </button>
        )}
      </div>
    );
  }
  return loading ? <Spinner label={t.loading} /> : null;
}
```

`liff/components/header.tsx`:

```tsx
'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import { useMaison } from './maison-provider';

export function Header() {
  const { locale, agentView, setAgentView } = useMaison();
  const t = COPY[locale];
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-ivory/95 px-5 py-2 backdrop-blur">
      <Link href="/" className="font-serif text-2xl tracking-[0.3em]">
        MAISON
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/visits" className="flex min-h-[44px] items-center px-1 text-xs">
          {t.myVisits}
        </Link>
        <button
          type="button"
          role="switch"
          aria-checked={agentView}
          aria-label={t.agentView}
          onClick={() => setAgentView(!agentView)}
          className={`min-h-[44px] rounded-full px-3 text-[11px] ${agentView ? 'bg-ink text-ivory' : 'border border-ink/30'}`}
        >
          {t.agentView}
        </button>
      </div>
    </header>
  );
}
```

`liff/components/agent-drawer.tsx`:

```tsx
'use client';

import { COPY } from '@/lib/copy';
import { toolErrorOf, type ToolCallRecord } from '@/lib/mcp';
import { useMaison } from './maison-provider';

const summarize = (call: ToolCallRecord): string => {
  if (call.error) return `error: ${call.error}`;
  const error = toolErrorOf(call.result);
  if (error) return `isError: ${error.code}`;
  const data = call.result?.structuredContent as Record<string, unknown> | undefined;
  if (!data) return 'ok';
  return Object.entries(data)
    .map(([key, value]) => (Array.isArray(value) ? `${key}: ${value.length}` : value && typeof value === 'object' ? `${key}: {…}` : `${key}: ${String(value)}`))
    .join(', ');
};

/** The MCP calls behind the current screen: the same tools an agent would use. */
export function AgentDrawer({ screen }: { screen: string }) {
  const { agentView, calls, locale } = useMaison();
  if (!agentView) return null;
  const mine = calls.filter((call) => call.screen === screen).slice(-6).reverse();
  return (
    <aside
      aria-label={COPY[locale].agentView}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[45%] overflow-y-auto rounded-t-2xl bg-ink px-[calc(1rem+var(--line-safe-x))] pb-[calc(1rem+var(--line-safe-bottom))] pt-4 font-mono text-[11px] text-ivory shadow-2xl stage:absolute"
    >
      <p className="mb-2 text-gold">MCP · Strapi /mcp</p>
      {mine.length === 0 && <p className="text-ivory/60">{COPY[locale].agentViewEmpty}</p>}
      <ol className="space-y-3">
        {mine.map((call) => (
          <li key={call.id} data-testid="agent-call" className="border-t border-ivory/10 pt-2">
            <p>
              <span className="text-gold">{call.name}</span> <span className="text-ivory/50">{call.ms} ms</span>
            </p>
            <p className="break-all text-ivory/70">{JSON.stringify(call.args)}</p>
            <p className="text-ivory/90">→ {summarize(call)}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
```

`liff/components/screen.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';

import { COPY } from '@/lib/copy';
import { errorText } from '@/lib/status';
import { AgentDrawer } from './agent-drawer';
import { Header } from './header';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/** Every screen: header, the MCP tools it uses, sign-in state, and the agent view. */
export function Screen({ name, tools, children }: { name: string; tools: string[]; children: ReactNode }) {
  const { status, error, errorCode, locale, retrySignIn } = useMaison();
  const t = COPY[locale];
  return (
    <div className="pb-32">
      <Header />
      <ul className="flex flex-wrap gap-1 px-5 pt-3" aria-label="MCP tools">
        {tools.map((tool) => (
          <li key={tool} data-testid="tool-badge" className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[10px] text-mist">
            MCP · {tool}
          </li>
        ))}
      </ul>
      {status === 'starting' && <Spinner label={t.signingIn} className="min-h-[50vh]" />}
      {status === 'error' && (
        <div role="alert" className="px-5 py-10 text-sm text-red-800">
          <p>
            {t.signInFailed}: {errorCode ? errorText({ code: errorCode, message: error ?? '' }, locale) : error}
          </p>
          <button type="button" onClick={retrySignIn} className="mt-3 min-h-[44px] text-xs underline">
            {t.retry}
          </button>
        </div>
      )}
      {status === 'ready' && children}
      <AgentDrawer screen={name} />
    </div>
  );
}
```

`liff/components/product-grid.tsx`:

```tsx
'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import { mediaUrl, yen } from '@/lib/format';
import type { Locale, ProductCard } from '@/lib/types';

export function ProductImage({ url, alt, className = '' }: { url: string | null; alt: string; className?: string }) {
  const src = mediaUrl(url);
  return src ? (
    <img src={src} alt={alt} className={`bg-neutral-200 object-cover ${className}`} />
  ) : (
    <div aria-hidden className={`bg-neutral-200 ${className}`} />
  );
}

export function ProductGrid({ products, locale }: { products: ProductCard[]; locale: Locale }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 px-5">
      {products.map((product) => (
        <li key={product.slug}>
          <Link href={`/products/${product.slug}`} data-testid="product-card" className="block">
            <ProductImage url={product.imageUrl} alt={product.name} className="aspect-square w-full" />
            <p className="mt-2 font-serif text-lg leading-tight">{product.name}</p>
            <p className="text-xs text-mist">{yen(product.priceJpy)}</p>
            {product.personalizable && <p className="mt-1 text-[10px] uppercase tracking-wider text-gold">{COPY[locale].personalizable}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Wrap the app in the provider**

In `liff/app/layout.tsx`, add `import { MaisonProvider } from '@/components/maison-provider';`, and change the body to:

```tsx
      <body>
        <PhoneFrame>
          <MaisonProvider>{children}</MaisonProvider>
        </PhoneFrame>
      </body>
```

- [ ] **Step 7: Write the home, collection and visits screens**

`liff/app/page.tsx`:

```tsx
'use client';

import Link from 'next/link';

import { useMaison } from '@/components/maison-provider';
import { ProductImage } from '@/components/product-grid';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import type { CollectionSummary } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

export default function Home() {
  const { locale } = useMaison();
  const t = COPY[locale];
  const collections = useTool<{ collections: CollectionSummary[] }>('home', 'browse_collections', { locale });
  return (
    <Screen name="home" tools={['browse_collections']}>
      <section className="px-5 pb-6 pt-8 text-center">
        <p className="font-serif text-4xl tracking-[0.35em]">MAISON</p>
        <p className="mt-2 text-xs tracking-widest text-mist">{t.tagline}</p>
        <Link href="/concierge" className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-ink px-6 text-sm text-ivory">
          {t.askConcierge}
        </Link>
      </section>
      <h2 className="px-5 pb-3 font-serif text-2xl">{t.collections}</h2>
      <StatusNote loading={collections.loading} error={collections.error} retry={collections.retry} />
      <ul className="space-y-6 px-5">
        {collections.data?.collections.map((collection) => (
          <li key={collection.slug}>
            <Link href={`/collections/${collection.slug}`} data-testid="collection-card" className="block">
              <ProductImage url={collection.heroImageUrl} alt={collection.name} className="aspect-[4/3] w-full" />
              <div className="mt-2 flex items-baseline justify-between">
                <p className="font-serif text-2xl">{collection.name}</p>
                <p className="text-xs text-mist">{t.pieces(collection.productCount)}</p>
              </div>
              <p className="text-sm text-ink/70">{collection.teaser}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
```

`liff/app/collections/[slug]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';

import { useMaison } from '@/components/maison-provider';
import { ProductGrid } from '@/components/product-grid';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import type { CollectionSummary, ProductCard } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useMaison();
  const collections = useTool<{ collections: CollectionSummary[] }>('collection', 'browse_collections', { locale });
  const products = useTool<{ total: number; products: ProductCard[] }>('collection', 'search_products', { collection: slug, locale, limit: 20 });
  const collection = collections.data?.collections.find((c) => c.slug === slug);
  return (
    <Screen name="collection" tools={['browse_collections', 'search_products']}>
      <header className="px-5 pb-5 pt-6">
        <h1 className="font-serif text-4xl">{collection?.name ?? ''}</h1>
        {collection && <p className="mt-1 text-sm text-ink/70">{collection.teaser}</p>}
      </header>
      <StatusNote loading={products.loading} error={products.error} retry={products.retry} />
      {products.data && <ProductGrid products={products.data.products} locale={locale} />}
    </Screen>
  );
}
```

`liff/app/visits/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import { visitTime } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Appointment } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

function Visits() {
  const { locale } = useMaison();
  const t = COPY[locale];
  const highlight = useSearchParams().get('ref');
  const visits = useTool<{ appointments: Appointment[] }>('visits', 'my_appointments', { locale });
  return (
    <Screen name="visits" tools={['my_appointments']}>
      <h1 className="px-5 pb-4 pt-6 font-serif text-4xl">{t.myVisits}</h1>
      {highlight && <p className="mx-5 mb-4 rounded bg-gold/15 p-3 text-sm">{t.visitRequested}</p>}
      <StatusNote loading={visits.loading} error={visits.error} retry={visits.retry} />
      {visits.data?.appointments.length === 0 && <p className="px-5 text-sm text-mist">{t.noVisits}</p>}
      <ul className="space-y-3 px-5">
        {visits.data?.appointments.map((visit) => (
          <li key={visit.reference}>
            <Link
              href={`/visits/${visit.reference}`}
              data-testid="visit"
              className={`block rounded border p-4 ${visit.reference === highlight ? 'border-gold' : 'border-ink/10'}`}
            >
              <p className="flex justify-between text-xs text-mist">
                <span>{visit.reference}</span>
                <span className={visit.status === 'confirmed' ? 'text-emerald-700' : ''}>{statusLabel(visit, locale)}</span>
              </p>
              <p className="mt-1 font-serif text-xl">{visit.boutique.name}</p>
              <p className="text-sm">{visitTime(visit.requestedFor, locale)}</p>
              <p className="text-xs text-ink/70">{visit.products.map((product) => product.name).join('、')}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

export default function VisitsPage() {
  return (
    <Suspense>
      <Visits />
    </Suspense>
  );
}
```

`liff/app/visits/[reference]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';

import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import { visitTime } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Appointment } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

/** Where the LINE confirmation's button leads. */
export default function VisitPage() {
  const { reference } = useParams<{ reference: string }>();
  const { locale } = useMaison();
  const t = COPY[locale];
  const visits = useTool<{ appointments: Appointment[] }>('visits', 'my_appointments', { locale });
  const visit = visits.data?.appointments.find((candidate) => candidate.reference === reference);
  return (
    <Screen name="visits" tools={['my_appointments']}>
      <StatusNote loading={visits.loading} error={visits.error} retry={visits.retry} />
      {visits.data && !visit && <p className="px-5 py-8 text-sm text-mist">{t.visitNotFound}</p>}
      {visit && (
        <article className="px-5 pt-6">
          <p className="text-xs text-mist">{visit.reference}</p>
          <h1 className="font-serif text-4xl">{visit.boutique.name}</h1>
          <p className="mt-2 text-lg">{visitTime(visit.requestedFor, locale)}</p>
          <p className="mt-1 text-sm">{statusLabel(visit, locale)}</p>
          <ul className="mt-4 list-disc pl-5 text-sm">
            {visit.products.map((product) => (
              <li key={product.slug}>{product.name}</li>
            ))}
          </ul>
          {visit.note && <p className="mt-4 text-sm text-ink/70">{visit.note}</p>}
        </article>
      )}
    </Screen>
  );
}
```

`liff/lib/status.ts`, shared by the visits screens, the status note and the booking sheet. It lives in `lib/`, because Next.js only allows a page file to export its page component and route config:

```ts
import { COPY } from './copy';
import type { ToolError } from './mcp';
import type { Appointment, Locale } from './types';

export const statusLabel = (visit: Appointment, locale: Locale) => {
  const t = COPY[locale];
  if (visit.status === 'requested') return t.requested;
  return visit.confirmationSent ? t.confirmationSent : t.confirmed;
};

/** A tool error (or a sign-in error) in the customer's words. Unknown codes show the tool's own message. */
export const errorText = (error: Pick<ToolError, 'code' | 'message'>, locale: Locale): string =>
  (COPY[locale].errors as Record<string, string>)[error.code] ?? error.message;
```

- [ ] **Step 8: Build and look at it**

```bash
cd /Users/paul/work/maison-demo/liff
npm test && npm run typecheck && npm run build
```

**Controller:** `demo-app` hot-reloads the new screens. Open `http://localhost:3003` in the preview browser.

Expected:
1. The app sits in a phone frame. It shows LINE's loading icon, centered, over "LINEでサインインしています…", then the three collections: ヴォヤージュ, アトリエ and ギフト.
2. Clicking Voyage lists 4 products, most expensive first.
3. "エージェントビュー" opens a dark drawer. On the home screen it lists `browse_collections` with `{"locale":"ja"}` and `collections: 3`.
4. "ご来店予約" shows "ご来店予約はまだありません。"
5. `/collections/no-such-collection` shows "お探しのものは見つかりませんでした。" and a "トップへ戻る" link. The agent view there shows `isError: not_found`.

- [ ] **Step 9: Commit**

```bash
cd /Users/paul/work/maison-demo
git add liff/lib liff/components liff/app liff/public
git commit -m "feat(liff): add the catalog and visits screens with the agent view" -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 6: Product page and the booking sheet

**Files:**
- Create: `liff/components/booking-sheet.tsx`, `liff/app/products/[slug]/page.tsx`

**Interfaces:**
- Consumes: `useTool`, `useMaison`, `Screen`, `StatusNote`, `Spinner`, `ProductImage`, `COPY`, `yen`, `nextSaturday`, `tomorrow`, `timeSlots`, `isRealDate`, `errorText`, `toolErrorOf` (Tasks 4 and 5), and LINE's safe area and `stage:` (Task 3). Tools: `view_product`, `find_boutiques({ productSlugs, date })`, `request_appointment`.
- Produces: `/products/[slug]`, and `<BookingSheet product onClose>`, which on success navigates to `/visits?ref=<reference>`.

The sheet checks opening hours with `find_boutiques` for the chosen date before it lets the customer send, with LINE's loading icon while it checks. A closed day shows a message and disables the button, so `boutique_closed` from the tool is only a backstop. A cleared or impossible date is never sent, because the tools only take real calendar dates. Errors show in the customer's words (`errorText`), not as the tool's agent-facing hint.

- [ ] **Step 1: Write `liff/components/booking-sheet.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { COPY } from '@/lib/copy';
import { isRealDate, nextSaturday, timeSlots, tomorrow } from '@/lib/format';
import { toolErrorOf, type ToolError } from '@/lib/mcp';
import { errorText } from '@/lib/status';
import type { Appointment, BoutiqueInfo, Product } from '@/lib/types';
import { useTool } from '@/lib/use-tool';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

const field = 'mt-1 block min-h-[44px] w-full rounded border border-ink/20 bg-white px-3 text-sm';

/** "Book a visit": the same request_appointment tool the concierge uses. */
export function BookingSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { maison, locale } = useMaison();
  const t = COPY[locale];
  const router = useRouter();
  const [date, setDate] = useState(() => nextSaturday());
  const [boutique, setBoutique] = useState('ginza');
  const [time, setTime] = useState('14:00');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<ToolError | null>(null);

  // A cleared or impossible date is never sent: the tools only take real calendar dates.
  const validDate = isRealDate(date) && date >= tomorrow();
  const availability = useTool<{ boutiques: BoutiqueInfo[] }>(
    'product',
    'find_boutiques',
    validDate ? { productSlugs: [product.slug], date, locale } : null
  );
  const boutiques = availability.data?.boutiques ?? [];
  const chosen = boutiques.find((candidate) => candidate.slug === boutique);
  const open = validDate && chosen?.openOnDate === true;
  const slots = open && chosen?.hoursOnDate ? timeSlots(chosen.hoursOnDate.opens, chosen.hoursOnDate.closes) : [];
  const startTime = slots.includes(time) ? time : slots[0];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!maison || !open || !startTime) return;
    setSending(true);
    setProblem(null);
    try {
      const result = await maison.callTool('product', 'request_appointment', {
        boutique,
        productSlugs: [product.slug],
        requestedFor: `${date}T${startTime}:00+09:00`,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const error = toolErrorOf(result);
      if (error) {
        setProblem(error);
        return;
      }
      const { appointment } = result.structuredContent as { appointment: Appointment };
      router.push(`/visits?ref=${appointment.reference}`);
    } catch (error) {
      setProblem({ code: 'network', message: (error as Error).message, hint: '' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t.bookVisit} className="fixed inset-0 z-30 flex items-end bg-black/40 stage:absolute">
      <form onSubmit={submit} className="max-h-[90%] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-ivory px-[calc(1.25rem+var(--line-safe-x))] pb-[calc(1.25rem+var(--line-safe-bottom))] pt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">{t.bookVisit}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] text-lg">
            ✕
          </button>
        </div>
        <p className="text-sm">{product.name}</p>

        <label htmlFor="boutique" className="block text-xs">
          {t.boutique}
          <select id="boutique" value={boutique} onChange={(event) => setBoutique(event.target.value)} className={field}>
            {boutiques.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="date" className="block text-xs">
          {t.date}
          <input id="date" type="date" min={tomorrow()} value={date} onChange={(event) => setDate(event.target.value)} className={field} />
        </label>

        {!validDate && (
          <p role="status" className="text-xs text-red-900">
            {t.chooseDate}
          </p>
        )}
        {validDate && availability.loading && <Spinner label={t.loading} className="py-2" />}
        {validDate && !availability.loading && chosen && !open && (
          <p role="status" className="rounded bg-red-50 p-3 text-sm text-red-900">
            {t.closedOnDate}
          </p>
        )}
        {open && (
          <label htmlFor="time" className="block text-xs">
            {t.time}
            <select id="time" value={startTime} onChange={(event) => setTime(event.target.value)} className={field}>
              {slots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
        )}

        <label htmlFor="note" className="block text-xs">
          {t.note}
          <textarea id="note" maxLength={500} rows={2} value={note} onChange={(event) => setNote(event.target.value)} className={`${field} py-2`} />
        </label>

        {problem && (
          <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">
            {errorText(problem, locale)}
          </p>
        )}
        <button type="submit" disabled={sending || !open} className="min-h-[48px] w-full rounded-full bg-ink text-sm text-ivory disabled:opacity-40">
          {t.request}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write `liff/app/products/[slug]/page.tsx`**

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';

import { BookingSheet } from '@/components/booking-sheet';
import { useMaison } from '@/components/maison-provider';
import { ProductImage } from '@/components/product-grid';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import { yen } from '@/lib/format';
import type { Product } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useMaison();
  const t = COPY[locale];
  const product = useTool<{ product: Product }>('product', 'view_product', { slug, locale });
  const [booking, setBooking] = useState(false);
  const item = product.data?.product;

  return (
    <Screen name="product" tools={['view_product', 'find_boutiques', 'request_appointment']}>
      <StatusNote loading={product.loading} error={product.error} retry={product.retry} />
      {item && (
        <article>
          <ProductImage url={item.images[0]?.url ?? null} alt={item.images[0]?.alt ?? item.name} className="mt-3 aspect-square w-full" />
          <div className="space-y-5 px-5 pt-5">
            <div>
              {item.collection && <p className="text-xs uppercase tracking-widest text-mist">{item.collection.name}</p>}
              <h1 className="font-serif text-4xl leading-tight">{item.name}</h1>
              <p className="mt-1 text-lg">{yen(item.priceJpy)}</p>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{item.description}</p>
            {item.craftStory && <p className="border-l-2 border-gold pl-3 font-serif text-lg italic">{item.craftStory}</p>}
            {item.personalization.offered && (
              <section>
                <h2 className="text-xs uppercase tracking-widest text-mist">{t.personalization}</h2>
                <p className="text-sm">
                  {item.personalization.kinds.map((kind) => kind.replace(/-/g, ' ')).join(' · ')}
                  {item.personalization.leadDays ? ` · ${t.leadDays(item.personalization.leadDays)}` : ''}
                </p>
              </section>
            )}
            <section>
              <h2 className="text-xs uppercase tracking-widest text-mist">{t.stockByBoutique}</h2>
              <ul className="mt-1 divide-y divide-ink/10 text-sm">
                {item.stock.map((entry) => (
                  <li key={entry.boutique} className="flex justify-between py-2">
                    <span>{entry.name}</span>
                    <span className={entry.quantity > 0 ? '' : 'text-mist'}>{entry.quantity > 0 ? t.inStock(entry.quantity) : t.outOfStock}</span>
                  </li>
                ))}
              </ul>
            </section>
            <button type="button" onClick={() => setBooking(true)} className="min-h-[48px] w-full rounded-full bg-ink text-sm text-ivory">
              {t.bookVisit}
            </button>
          </div>
        </article>
      )}
      {booking && item && <BookingSheet product={item} onClose={() => setBooking(false)} />}
    </Screen>
  );
}
```

- [ ] **Step 3: Build and try it**

```bash
cd /Users/paul/work/maison-demo/liff
npm run typecheck && npm run build
```

**Controller:** open `http://localhost:3003/products/weekender-50` in the preview browser.

Expected:
1. The product shows its price (￥385,000), craft story, personalization, and stock with Ginza at 2.
2. "来店を予約" opens the sheet, set to next Saturday at Ginza, 14:00. Sending it lands on "ご来店予約", with the new visit marked "ブティックの確認待ち".
3. Choosing 大阪心斎橋店 on a Tuesday shows the closed message, and the send button is disabled.
4. Clearing the date shows "日付をお選びください。", and the send button is disabled.
5. The agent view on the product screen lists `view_product`, `find_boutiques` and `request_appointment`.

- [ ] **Step 4: Commit**

```bash
cd /Users/paul/work/maison-demo
git add liff/components/booking-sheet.tsx "liff/app/products"
git commit -m "feat(liff): add the product page and the booking sheet" -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 7: The concierge

**Files:**
- Create: `liff/lib/model.ts`, `liff/lib/concierge.ts`, `liff/app/api/concierge/route.ts`, `liff/components/chat-parts.tsx`, `liff/app/concierge/page.tsx`
- Test: `liff/lib/model.test.ts`, `liff/lib/concierge.test.ts`, and the live test: `liff/vitest.live.config.ts`, `liff/live/support.ts`, `liff/live/concierge.live.test.ts`

**Interfaces:**
- Consumes: `getMaison().session.getToken()` (Task 4); `Spinner` (Task 5) and LINE's safe area (Task 3); Strapi `/mcp` with the customer's token and `x-maison-surface: concierge` (Maison plugin)
- Produces:
  - `conciergeModel(env?): { model: LanguageModel; label: string }`: Claude, AI Gateway or Ollama
  - `handleConcierge(request, { model, modelLabel?, createMcpClient, strapiUrl, now? }): Promise<Response>`, plus `SURFACE_HEADER` and `describeModelError`
  - `POST /api/concierge`, taking `{ messages: UIMessage[], locale }` with `Authorization: Bearer mcp_at_…`
  - `/concierge`
  - `npm run test:live`: the concierge's live test on the local model

Everything here uses the AI SDK 7 APIs listed under Global constraints. The local model is reached through Ollama's OpenAI-compatible API, with the official `@ai-sdk/openai-compatible`.

- [ ] **Step 1: Write the failing tests**

`liff/lib/model.test.ts`:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { conciergeModel } from './model';

const idOf = (model: unknown) => (model as { modelId: string }).modelId;

describe('conciergeModel', () => {
  it('uses Anthropic directly when ANTHROPIC_API_KEY is set', () => {
    const { model, label } = conciergeModel({ ANTHROPIC_API_KEY: 'sk-ant-test', AI_GATEWAY_API_KEY: 'gw' });
    expect(idOf(model)).toBe('claude-sonnet-5');
    expect(label).toBe('Claude Sonnet 5 (Anthropic)');
  });

  it('goes through Vercel AI Gateway with AI_GATEWAY_API_KEY', () => {
    expect(conciergeModel({ AI_GATEWAY_API_KEY: 'gw' }).model).toBe('anthropic/claude-sonnet-5');
  });

  it('otherwise uses the local model on Ollama, qwen3-14b-32k by default', () => {
    const { model, label } = conciergeModel({});
    expect(idOf(model)).toBe('qwen3-14b-32k');
    expect((model as { provider: string }).provider).toMatch(/^ollama/);
    expect(label).toBe('qwen3-14b-32k (Ollama at http://localhost:11434/v1)');
  });

  it('takes the local model and server from OLLAMA_MODEL and OLLAMA_BASE_URL', () => {
    const { model, label } = conciergeModel({ OLLAMA_MODEL: 'gemma4-26b-32k', OLLAMA_BASE_URL: 'http://127.0.0.1:11500/v1' });
    expect(idOf(model)).toBe('gemma4-26b-32k');
    expect(label).toContain('http://127.0.0.1:11500/v1');
  });

  it('asks Ollama to skip thinking (reasoning_effort "none")', async () => {
    let request: Record<string, unknown> = {};
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        request = JSON.parse(raw);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'qwen3-14b-32k',
            choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await generateText({ model: conciergeModel({ OLLAMA_BASE_URL: `http://127.0.0.1:${port}/v1` }).model, prompt: 'Hello' });
    } finally {
      server.close();
    }
    expect(request).toMatchObject({ model: 'qwen3-14b-32k', reasoning_effort: 'none' });
  });
});
```

`liff/lib/concierge.test.ts`:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { SURFACE_HEADER, handleConcierge } from './concierge';
import { conciergeModel } from './model';

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
};
const replyModel = () =>
  new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'かしこまりました。' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
          ],
        }),
      },
    ],
  });
const fakeMcp = () => {
  const close = vi.fn(async () => {});
  return { close, createMcpClient: vi.fn(async () => ({ tools: async () => ({}), close })) };
};
const ask = (authorization: string | null, body: unknown) =>
  new Request('http://localhost:3003/api/concierge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
const hello = { messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'こんにちは' }] }], locale: 'ja' };
const deps = (overrides: Record<string, unknown>) =>
  ({ model: replyModel(), strapiUrl: 'http://strapi.test', now: () => new Date('2026-10-07T01:00:00Z'), ...overrides }) as any;

describe('handleConcierge', () => {
  it("forwards only the customer's session token and the surface header to Strapi", async () => {
    const { createMcpClient, close } = fakeMcp();
    const response = await handleConcierge(ask('Bearer mcp_at_customer', hello), deps({ createMcpClient }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('かしこまりました');
    expect(createMcpClient).toHaveBeenCalledWith({
      transport: {
        type: 'http',
        url: 'http://strapi.test/mcp',
        headers: { Authorization: 'Bearer mcp_at_customer', [SURFACE_HEADER]: 'concierge' },
      },
    });
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('refuses callers without a customer session before connecting to anything', async () => {
    const { createMcpClient } = fakeMcp();
    const model = replyModel();
    for (const authorization of [null, 'Bearer an-admin-token', 'Basic dXNlcjpwYXNz']) {
      expect((await handleConcierge(ask(authorization, hello), deps({ createMcpClient, model }))).status).toBe(401);
    }
    expect(createMcpClient).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('refuses empty and oversized conversations', async () => {
    const { createMcpClient } = fakeMcp();
    const tooLong = { messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'あ'.repeat(1001) }] }] };
    expect((await handleConcierge(ask('Bearer mcp_at_x', { messages: [] }), deps({ createMcpClient }))).status).toBe(400);
    expect((await handleConcierge(ask('Bearer mcp_at_x', tooLong), deps({ createMcpClient }))).status).toBe(400);
    expect(createMcpClient).not.toHaveBeenCalled();
  });

  it("tells the model today's date in Tokyo and the reply language", async () => {
    const { createMcpClient } = fakeMcp();
    const model = replyModel();
    await (await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model }))).text();
    const instructions = JSON.stringify(model.doStreamCalls[0].prompt[0]);
    expect(instructions).toContain('2026-10-07');
    expect(instructions).toContain('Reply in English');
  });

  it("names the model, and the fix, when the model can't be reached", async () => {
    // A port that just closed: connecting is refused, as when Ollama isn't running.
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));
    const { createMcpClient } = fakeMcp();
    const { model, label } = conciergeModel({ OLLAMA_BASE_URL: `http://127.0.0.1:${port}/v1` });
    const response = await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model, modelLabel: label }));
    const text = await response.text();
    expect(text).toContain(`The concierge's model (qwen3-14b-32k (Ollama at http://127.0.0.1:${port}/v1)) isn't reachable`);
    expect(text).toContain('ANTHROPIC_API_KEY');
  }, 20_000); // the AI SDK retries twice, with backoff, before it gives up

  it('answers 502 when Strapi refuses the connection', async () => {
    const createMcpClient = vi.fn(async () => {
      throw new Error('Streamable HTTP error: 401');
    });
    const response = await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient }));
    expect(response.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/paul/work/maison-demo/liff && npm test`
Expected: FAIL with "Failed to resolve import ./model" and "./concierge".

- [ ] **Step 3: Implement the model choice and the handler**

`liff/lib/model.ts`:

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from 'ai';

export type ConciergeModel = {
  model: LanguageModel;
  /** Which model answers, for logs and error messages. Never contains a key. */
  label: string;
};

/**
 * Claude Sonnet 5 with ANTHROPIC_API_KEY, or through Vercel AI Gateway with AI_GATEWAY_API_KEY. With neither, a local
 * model through Ollama's OpenAI-compatible API: OLLAMA_MODEL (qwen3-14b-32k) at OLLAMA_BASE_URL (http://localhost:11434/v1).
 */
export const conciergeModel = (env: Record<string, string | undefined> = process.env): ConciergeModel => {
  if (env.ANTHROPIC_API_KEY) return { model: anthropic('claude-sonnet-5'), label: 'Claude Sonnet 5 (Anthropic)' };
  if (env.AI_GATEWAY_API_KEY) return { model: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5 (AI Gateway)' };
  const baseURL = env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  const modelId = env.OLLAMA_MODEL || 'qwen3-14b-32k';
  const ollama = createOpenAICompatible({ name: 'ollama', baseURL });
  return {
    // Qwen3 thinks before every reply unless told not to, which is slow on a laptop: reasoning_effort "none" turns
    // it off. Ollama returns thinking in a field of its own, so none of it would reach the chat either way.
    model: wrapLanguageModel({
      model: ollama.chatModel(modelId),
      middleware: defaultSettingsMiddleware({ settings: { providerOptions: { ollama: { reasoningEffort: 'none' } } } }),
    }),
    label: `${modelId} (Ollama at ${baseURL})`,
  };
};
```

About the local model:
- **Qwen3 thinks before every reply unless told not to.** Ollama 0.34 returns the thinking in a field of its own (`reasoning`), so no `<think>` text reaches the chat either way.
- **Thinking costs time,** though: on 30 September, one tool call took 16 s with it and 1.8 s without.
- **`reasoningEffort: 'none'`** becomes Ollama's `reasoning_effort: "none"`. The last model test checks that it's really in the request.

`liff/lib/concierge.ts`:

```ts
import type { createMCPClient } from '@ai-sdk/mcp';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from 'ai';

/** Tells the Maison plugin a call came from the concierge. Informational; never used for identity. */
export const SURFACE_HEADER = 'x-maison-surface';
const MAX_MESSAGES = 20;
const MAX_CHARS = 1000;
const MAX_STEPS = 6;

const tokyoDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export const conciergeInstructions = (locale: 'ja' | 'en', now: Date) => `You are the concierge of Maison, a fictional luxury house of trunks, bags and small gifts. You help one signed-in customer choose a gift and request a boutique visit.
Today in Tokyo: ${tokyoDay(now)}. Boutique times are Japan time (Asia/Tokyo, +09:00).

Rules:
1. Use the tools for every fact about products, prices, stock and opening hours. Never invent products, prices, availability or hours. Name products exactly as the tools return them.
2. Search broadly first. For a gift, use search_products with the occasion (occasion "travel" for someone who travels), the budget (maxPriceJpy) and the boutique (inStockAt). Add a category or collection only when the customer asks for one. If a search finds nothing, drop a filter and search again before saying nothing fits.
3. Before calling request_appointment, restate the boutique, date, time and products in one short sentence, and wait for the customer's yes.
4. Write requestedFor as ISO 8601 with the +09:00 offset, for example 2026-10-10T14:00:00+09:00. Use real calendar dates, and work out weekdays from today's date above.
5. Never say a visit is confirmed. Say it is requested, and that the boutique will confirm it on LINE.
6. If a tool returns an error, follow its hint. not_found means a slug was wrong: look it up with the tool the hint names, never guess. An input validation error means fix the arguments and call again. Otherwise ask the customer.
7. ${locale === 'ja' ? 'Reply in polite Japanese (keigo).' : 'Reply in English.'} Pass locale "${locale}" to every tool that takes one, so names match your reply and the app's cards. Keep replies to two or three short sentences. The app shows product cards, so don't repeat their details.
8. Suggest at most three products at a time.`;

export interface ConciergeDeps {
  model: LanguageModel;
  /** Which model answers (conciergeModel().label), named in the error when it can't be reached. */
  modelLabel?: string;
  createMcpClient: typeof createMCPClient;
  strapiUrl: string;
  now?: () => Date;
}

/** What the customer sees when the model fails. An unreachable model is named, with the fix. */
export const describeModelError = (error: unknown, modelLabel?: string): string => {
  const message = error instanceof Error ? error.message : 'The concierge had a problem.';
  if (/Cannot connect to API|fetch failed|ECONNREFUSED/i.test(message)) {
    return `The concierge's model${modelLabel ? ` (${modelLabel})` : ''} isn't reachable. Start Ollama, or set ANTHROPIC_API_KEY in liff/.env, then restart the app.`;
  }
  return message;
};

/**
 * The model (Claude, or the local model) with the Maison tools, acting as the signed-in customer. The customer's
 * own session token goes to Strapi unchanged; the route adds no credential of its own.
 */
export async function handleConcierge(request: Request, deps: ConciergeDeps): Promise<Response> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer mcp_at_\S+$/.test(authorization)) {
    return Response.json({ error: 'Sign in with LINE first.' }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { messages?: UIMessage[]; locale?: string } | null;
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const oversized = messages.some((message) => message.parts?.some((part) => part.type === 'text' && part.text.length > MAX_CHARS));
  if (messages.length === 0 || oversized) {
    return Response.json({ error: `Send 1 to ${MAX_MESSAGES} messages of up to ${MAX_CHARS} characters.` }, { status: 400 });
  }
  const locale = body?.locale === 'en' ? 'en' : 'ja';

  let mcp: Awaited<ReturnType<typeof createMCPClient>>;
  try {
    mcp = await deps.createMcpClient({
      transport: { type: 'http', url: `${deps.strapiUrl}/mcp`, headers: { Authorization: authorization, [SURFACE_HEADER]: 'concierge' } },
    });
  } catch (error) {
    return Response.json({ error: `Could not reach the Maison tools: ${(error as Error).message}` }, { status: 502 });
  }
  const close = async () => {
    await mcp.close();
  };

  try {
    const result = streamText({
      model: deps.model,
      instructions: conciergeInstructions(locale, deps.now?.() ?? new Date()),
      messages: await convertToModelMessages(messages),
      tools: await mcp.tools(),
      stopWhen: isStepCount(MAX_STEPS),
      abortSignal: request.signal,
      // onEnd is skipped on abort, and when no step completes, so close in all three.
      onEnd: close,
      onAbort: close,
      onError: async ({ error }) => {
        console.error('[concierge]', error);
        await close();
      },
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onError: (error) => describeModelError(error, deps.modelLabel),
      }),
    });
  } catch (error) {
    await close();
    throw error;
  }
}
```

Two of the rules came from the local model's first live runs on 30 September:
- **Rule 2 (search broadly).** Without it, Qwen3 guessed categories (bag, trunk) for "a travel gift", found nothing, and said so. The Weekender 50's category is "travel"; the tool was right.
- **Passing the locale (in rule 7).** Without it, the tools answered in Japanese, the default, and the model translated names in an English reply, so the product cards didn't match it.

Both rules help Claude too.

`liff/app/api/concierge/route.ts`:

```ts
import { createMCPClient } from '@ai-sdk/mcp';

import { handleConcierge } from '@/lib/concierge';
import { conciergeModel } from '@/lib/model';

export const maxDuration = 60;

export async function POST(request: Request) {
  const { model, label } = conciergeModel();
  return handleConcierge(request, {
    model,
    modelLabel: label,
    createMcpClient: createMCPClient,
    strapiUrl: (process.env.STRAPI_URL ?? process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, ''),
  });
}
```

Run: `npm test`
Expected: all 30 unit tests pass. The unreachable-model test takes about 6 seconds, because the AI SDK retries twice before it gives up. If `MockLanguageModelV4` or the chunk shapes don't match the installed `ai`, check `node_modules/ai/docs` ("Testing") and `ai/test`'s types, and fix the test fixture rather than the handler.

- [ ] **Step 4: Write the chat components and the page**

`liff/components/chat-parts.tsx`:

```tsx
'use client';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import Link from 'next/link';

import { COPY } from '@/lib/copy';
import { visitTime, yen } from '@/lib/format';
import { toolErrorOf } from '@/lib/mcp';
import type { Appointment, Locale, ProductCard } from '@/lib/types';
import { ProductImage } from './product-grid';

/** What the chat needs from AI SDK 7's dynamic-tool UI part (MCP tools arrive as dynamic tools). */
export interface ToolPart {
  toolName: string;
  state: string;
  output?: unknown;
  errorText?: string;
}

/** A chip per tool call, plus cards built from structuredContent, never from the model's text. */
export function ToolResult({ part, locale }: { part: ToolPart; locale: Locale }) {
  const t = COPY[locale];
  const output = part.state === 'output-available' ? (part.output as CallToolResult) : null;
  const error = output ? toolErrorOf(output) : null;
  const failed = part.state === 'output-error' || error !== null;
  const data = output && !error ? (output.structuredContent as Record<string, unknown> | undefined) : undefined;
  const list = Object.values(data ?? {}).find(Array.isArray) as unknown[] | undefined;
  const products = Array.isArray(data?.products) ? (data?.products as ProductCard[]) : null;
  const appointment = (data?.appointment as Appointment | undefined) ?? null;
  const label = part.state.startsWith('input') ? '…' : failed ? `✕ ${error?.code ?? 'error'}` : `✓${list ? ` ${t.results(list.length)}` : ''}`;

  return (
    <div className="my-2 space-y-2">
      <span
        data-testid="tool-chip"
        className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] ${failed ? 'bg-red-100 text-red-900' : 'bg-ink/5 text-ink/70'}`}
      >
        MCP · {part.toolName} {label}
      </span>
      {part.toolName === 'search_products' && products && (
        <ul className="flex gap-2 overflow-x-auto">
          {products.slice(0, 3).map((product) => (
            <li key={product.slug} className="w-32 shrink-0">
              <Link href={`/products/${product.slug}`} className="block">
                <ProductImage url={product.imageUrl} alt={product.name} className="aspect-square w-full" />
                <p className="mt-1 text-xs leading-tight">{product.name}</p>
                <p className="text-[11px] text-mist">{yen(product.priceJpy)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {part.toolName === 'request_appointment' && appointment && (
        <Link href={`/visits/${appointment.reference}`} className="block rounded border border-gold bg-white p-3 text-sm">
          <p className="flex justify-between text-xs text-mist">
            <span>{appointment.reference}</span>
            <span>{t.requested}</span>
          </p>
          <p className="font-serif text-lg">{appointment.boutique.name}</p>
          <p>{visitTime(appointment.requestedFor, locale)}</p>
        </Link>
      )}
    </div>
  );
}
```

`liff/app/concierge/page.tsx`:

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useMemo, useRef, useState, type FormEvent } from 'react';

import { ToolResult, type ToolPart } from '@/components/chat-parts';
import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { Spinner } from '@/components/spinner';
import { COPY } from '@/lib/copy';
import { getMaison } from '@/lib/maison';

const CONCIERGE_TOOLS = ['browse_collections', 'search_products', 'view_product', 'find_boutiques', 'request_appointment', 'my_appointments'];

export default function ConciergePage() {
  const { locale } = useMaison();
  const t = COPY[locale];
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/api/concierge',
        // The customer's own session token, fetched per request. The route passes it on to Strapi.
        headers: async () => ({ Authorization: `Bearer ${await (await getMaison()).session.getToken()}` }),
        body: () => ({ locale: localeRef.current }),
      }),
    []
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [draft, setDraft] = useState('');
  const busy = status === 'submitted' || status === 'streaming';

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setDraft('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  return (
    <Screen name="concierge" tools={CONCIERGE_TOOLS}>
      <div className="space-y-3 px-5 pb-4 pt-5">
        <h1 className="font-serif text-4xl">{t.concierge}</h1>
        <p className="text-sm text-ink/70">{t.conciergeIntro}</p>
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={`message-${message.role}`}
            className={message.role === 'user' ? 'ml-10 rounded-2xl bg-ink px-4 py-2 text-sm text-ivory' : 'mr-4 text-sm'}
          >
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <p key={index} className="whitespace-pre-wrap leading-relaxed">
                    {part.text}
                  </p>
                );
              }
              if (part.type === 'dynamic-tool') return <ToolResult key={index} part={part as unknown as ToolPart} locale={locale} />;
              return null;
            })}
          </div>
        ))}
        {busy && <Spinner label={t.loading} className="py-2" />}
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error.message}
          </p>
        )}
      </div>
      <div className="sticky bottom-0 space-y-2 border-t border-ink/10 bg-ivory px-5 pb-[calc(0.75rem+var(--line-safe-bottom))] pt-3">
        <div className="flex gap-2 overflow-x-auto">
          {t.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => send(suggestion)}
              className="min-h-[44px] shrink-0 rounded-full border border-ink/20 px-3 text-left text-xs disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            className="min-h-[44px] flex-1 rounded-full border border-ink/20 bg-white px-4 text-sm"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="min-h-[44px] rounded-full bg-ink px-4 text-sm text-ivory disabled:opacity-40">
            {t.send}
          </button>
        </form>
      </div>
    </Screen>
  );
}
```

On the concierge screen the tool calls happen on the server. They show as chips in the conversation, so the agent drawer there stays empty by design. While the model works, LINE's loading icon shows under the conversation, and the input bar keeps clear of LINE's safe area at the bottom.

**Stop point.**
- The implementer writes Step 6's three files, runs `npm test`, commits with Step 7's command, and stops there.
- The controller then runs Step 5's check and Step 6's live run.
- If the concierge breaks a rule, or the live test fails, the controller resumes the implementer with the transcript or the test's output. The implementer fixes the instructions in `lib/concierge.ts`, reruns `npm test`, and commits the fix on its own (`fix(liff): …`). The controller then runs the check again.

- [ ] **Step 5: Try it with a model**

**Controller:** open `http://localhost:3003/concierge` in the preview browser, and tap the first suggestion. With no key in `liff/.env`, the local model answers; with Paul's key, Claude does. Restart `demo-app` after changing `liff/.env`.

Expected:
1. Chips appear: `search_products ✓ 5件`, maybe `find_boutiques ✓`. Up to three product cards follow, starting with the Weekender 50.
2. The reply is short, in keigo, and restates the Ginza Saturday 14:00 visit, asking for a yes.
3. Tap "はい、お願いします。". A `request_appointment ✓` chip and an appointment card say "ブティックの確認待ち". The reply says the boutique will confirm on LINE, and never says confirmed.
4. **Paul:** on the Maison board in the Strapi admin (`http://localhost:1338/admin` → Maison), the new request shows `concierge` under "Created via".

On the local model a turn takes about 20–60 seconds, and the wording varies more; the rules still hold. If the concierge breaks a rule, the controller hands it back (the stop point above).

- [ ] **Step 6: Add the concierge's live test on the local model**

`liff/vitest.live.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Opt-in tests against the running Strapi and the local model: `npm run test:live`. */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['live/**/*.live.test.ts'], environment: 'node', testTimeout: 300_000, hookTimeout: 60_000, fileParallelism: false },
});
```

`liff/live/support.ts`:

```ts
import { spawn } from 'node:child_process';

export const STRAPI_URL = (process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, '');

/** Whether anything answers a GET to `url` within two seconds (any status counts). */
export const reachable = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
};

/** Ollama answers /api/version at its root, whatever path its OpenAI-compatible base URL has. */
export const ollamaUp = (baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1') =>
  reachable(new URL('/api/version', baseURL).toString());

export const strapiUp = () => reachable(`${STRAPI_URL}/_health`);

/** The `data:` events of a server-sent event stream, parsed. */
export const sseEvents = (text: string): Array<Record<string, any>> =>
  text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((data) => data && data !== '[DONE]')
    .flatMap((data) => {
      try {
        return [JSON.parse(data)];
      } catch {
        return [];
      }
    });

/**
 * Strapi verifies ID tokens against the app's LINE verify mock. `npm run dev` runs it; if nothing answers on its port,
 * start one for this test run. Returns the function that stops it.
 */
export const ensureVerifyMock = async (): Promise<() => void> => {
  const url = `http://127.0.0.1:${process.env.MOCK_LINE_VERIFY_PORT ?? 4545}/verify`;
  if (await reachable(url)) return () => {};
  const child = spawn(process.execPath, ['scripts/mock-line-verify.mjs'], { stdio: 'ignore', env: process.env });
  for (let attempt = 0; attempt < 50 && !(await reachable(url)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return () => child.kill();
};
```

`liff/live/concierge.live.test.ts`:

```ts
/**
 * The concierge end to end on the local model: the real route, a signed-in demo customer, real MCP tool calls to the
 * running Strapi. Opt-in (`npm run test:live`), and skipped when Ollama or Strapi isn't up. It always uses the local
 * model, even when an API key is set, so it costs nothing and runs offline.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/concierge/route';
import { createSession } from '@/lib/session';
import { STRAPI_URL, ensureVerifyMock, ollamaUp, sseEvents, strapiUp } from './support';

delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;

const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const ready = Boolean(clientId) && (await strapiUp()) && (await ollamaUp());
/** A demo customer of its own, so the browser tests' customers never see these visits. */
const CUSTOMER = `U${'c'.repeat(32)}`;
const QUESTION = "I'm looking for a travel gift under ¥400,000 that I can see at the Ginza boutique. What would you suggest?";

type Product = { slug: string; name: string };

describe.skipIf(!ready)('the concierge on the local model', () => {
  let stopMock = () => {};
  let token = '';

  beforeAll(async () => {
    stopMock = await ensureVerifyMock();
    token = await createSession({ strapiUrl: STRAPI_URL, clientId, getIdToken: () => `valid.${CUSTOMER}` }).getToken();
  });
  afterAll(() => stopMock());

  it('answers the demo question from the catalog tools, and names only products they returned', async () => {
    const response = await POST(
      new Request('http://localhost:3003/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locale: 'en', messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: QUESTION }] }] }),
      })
    );
    expect(response.status).toBe(200);
    const events = sseEvents(await response.text());
    expect(events.filter((event) => event.type === 'error')).toEqual([]);

    const inputs = events.filter((event) => event.type === 'tool-input-available');
    const calls = inputs.map((event) => `${event.toolName}(${JSON.stringify(event.input)})`).join(', ');
    expect(inputs.some((event) => ['search_products', 'find_boutiques'].includes(event.toolName)), `tools called: ${calls}`).toBe(true);

    // Every product a tool returned in this conversation, by slug.
    const returned = new Set(
      events
        .filter((event) => event.type === 'tool-output-available')
        .flatMap((event) => {
          const data = event.output?.structuredContent ?? {};
          return [...((data.products as Product[]) ?? []), ...(data.product ? [data.product as Product] : [])];
        })
        .map((product) => product.slug)
    );
    const answer = events.filter((event) => event.type === 'text-delta').map((event) => event.delta as string).join('');

    // The whole catalog in both languages, and the demo question's own answer, straight from search_products.
    const mcp = new Client({ name: 'maison-live-test', version: '1.0.0' });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${STRAPI_URL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const search = async (args: Record<string, unknown>) =>
      ((await mcp.callTool({ name: 'search_products', arguments: { limit: 20, ...args } })).structuredContent as { products: Product[] }).products;
    const catalog = [...(await search({ locale: 'en' })), ...(await search({ locale: 'ja' }))];
    const fits = new Set((await search({ locale: 'en', occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza' })).map((product) => product.slug));
    await mcp.close();

    const named = [...new Set(catalog.filter((product) => answer.includes(product.name)).map((product) => product.slug))];
    const context = `Answer: ${answer} Tools: ${calls}`;
    expect(named.length, `the answer names a product. ${context}`).toBeGreaterThan(0);
    for (const slug of named) expect(returned.has(slug), `${slug} came from a tool call, not from the model. ${context}`).toBe(true);
    expect(named.some((slug) => fits.has(slug)), `a named product fits the question. ${context}`).toBe(true);
  });
});
```

It runs the real route against the running Strapi's MCP, signed in as a demo customer of its own (`Ucccc…`), and asks the demo question. It then checks four things:
- **A catalog tool was called:** `search_products` or `find_boutiques`.
- **The answer names a real product.**
- **Nothing was invented:** every product the answer names came back from a tool call in that conversation. The test compares by slug, against `search_products`' own results in both languages.
- **It fits the question:** at least one named product is a travel gift under ￥400,000 in stock at Ginza.

It always uses the local model, even when a key is set. It starts the verify mock itself if nothing answers on 4545.

**Controller:** with `demo-strapi` and `demo-app` running and Ollama up:

```bash
cd /Users/paul/work/maison-demo/liff && npm run test:live live/concierge.live.test.ts
```

Expected: `1 passed`, in about 20–30 seconds. It's skipped when Ollama or Strapi isn't up, or `liff/.env` has no client ID.

- [ ] **Step 7: Commit**

```bash
cd /Users/paul/work/maison-demo
git add liff/lib/model.ts liff/lib/model.test.ts liff/lib/concierge.ts liff/lib/concierge.test.ts liff/app/api liff/app/concierge liff/components/chat-parts.tsx liff/vitest.live.config.ts liff/live/support.ts liff/live/concierge.live.test.ts
git commit -m "feat(liff): add the concierge over the customer's MCP session, on Claude or a local model" -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 8: End-to-end tests: browser, API, and the MCP smoke tests

**Files:**
- Create: `liff/playwright.config.ts`, `liff/e2e/global-setup.ts`, `liff/e2e/maison.spec.ts`, `liff/e2e/api.spec.ts`
- Modify: `package.json` (root): the `test:e2e` and `test:live` scripts

**Interfaces:**
- Consumes:
  - the running Strapi (`demo-strapi`, 1338), and the app on 3003: Playwright reuses `demo-app` when it's running, and otherwise starts `npm run dev` for the run and stops it after
  - admin `POST /admin/login` and `POST /maison/demo/reset`
  - the Content Manager API, and its list search (`_q`)
  - the Maison plugin's MCP smoke tests, in the demo's copy (`strapi/src/plugins/maison`)
  - `data-testid="app-area"` and LINE's safe area (Task 3)
- Produces: `npm run test:e2e` (browser and API tests), and root scripts for it and for Task 7's `npm run test:live`

What's covered here:
- **Browser tests, in mock mode:**
  - the sign-in chain, the screens, and booking
  - the closed-day guard, and a cleared date, neither of which sends a request
  - the agent view, an unknown product, and isolation between customers
  - LINE's safe area on a phone, in portrait and in landscape, where the app fills the screen without the stage frame
- **API tests:** each customer's `my_appointments` over MCP; the admin API keeping `customer` out; and its list search, which never matches a customer's LINE user ID.
- **The Maison smoke tests,** again, with oauth-mcp-manager 1.1 installed. Their tokens are deleted afterwards.

The concierge's contract is Task 7's unit test, and its live run is Task 7's `npm run test:live`, because a model's answer isn't deterministic.

- [ ] **Step 1: Write the configuration and the global setup**

`liff/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

/**
 * Needs the demo's Strapi (the controller runs it). Uses the Maison app on 3003 when it's
 * running, and otherwise starts `npm run dev` (the app and the LINE verify mock) for the run and stops it after.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3003',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:3003', reuseExistingServer: true, timeout: 180_000 },
});
```

`liff/e2e/global-setup.ts`:

```ts
/**
 * Signs in as the demo admin, deletes demo appointments so each run starts clean (a customer may only have three
 * open requests), and hands the admin session to the API tests. Workers start after this and inherit process.env.
 */
export default async function globalSetup() {
  const strapiUrl = (process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, '');
  const email = process.env.DEMO_ADMIN_EMAIL;
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Run the tests with `npm run test:e2e`, which loads DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD from strapi/.env.');
  }
  const login = await fetch(`${strapiUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(`Admin sign-in failed with ${login.status}${login.status === 429 ? ': Strapi allows five sign-ins per five minutes' : ''}.`);
  }
  const { data } = (await login.json()) as { data: { token: string } };
  const reset = await fetch(`${strapiUrl}/maison/demo/reset`, { method: 'POST', headers: { Authorization: `Bearer ${data.token}` } });
  if (!reset.ok) throw new Error(`Resetting demo appointments failed with ${reset.status}`);
  process.env.MAISON_E2E_ADMIN_JWT = data.token;
}
```

- [ ] **Step 2: Write `liff/e2e/maison.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** The next given weekday (0 = Sunday … 6 = Saturday) at least two days away. */
const next = (weekday: number) => {
  const date = new Date();
  const ahead = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (ahead < 2 ? ahead + 7 : ahead));
  return isoDay(date);
};
const SECOND_CUSTOMER = `U${'b'.repeat(32)}`;

const openWeekender = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('collection-card').filter({ hasText: /Voyage|ヴォヤージュ/ }).click();
  await page.getByTestId('product-card').filter({ hasText: /Weekender|ウィークエンダー/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Weekender|ウィークエンダー/);
};

/** Every request_appointment the page sends to Strapi's /mcp, from now on. */
const appointmentRequests = (page: Page) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/mcp' && request.postData()?.includes('"request_appointment"')) sent.push(request.url());
  });
  return sent;
};

test('a customer browses, books a visit and finds it in My visits', async ({ page }) => {
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Boutique|ブティック/).selectOption('ginza');
  await page.getByLabel(/Date|日付/).fill(next(6));
  await page.getByLabel(/Time|時間/).selectOption('14:00');
  await page.getByRole('button', { name: /Send request|リクエストを送る/ }).click();
  await expect(page).toHaveURL(/\/visits\?ref=APT-\d{4}/);
  await expect(page.getByTestId('visit').first()).toContainText(/Awaiting the boutique|ブティックの確認待ち/);
});

test('Osaka is closed on Tuesdays, and the sheet says so before any request', async ({ page }) => {
  const sent = appointmentRequests(page);
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Boutique|ブティック/).selectOption('osaka');
  await page.getByLabel(/Date|日付/).fill(next(2));
  await expect(page.getByText(/Closed on this day|この日は休業日です/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Send request|リクエストを送る/ })).toBeDisabled();
  expect(sent).toEqual([]);
});

test('a cleared date asks for one, and sends no request', async ({ page }) => {
  const sent = appointmentRequests(page);
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Date|日付/).fill('');
  await expect(page.getByText(/Please choose a date|日付をお選びください/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Send request|リクエストを送る/ })).toBeDisabled();
  expect(sent).toEqual([]);
});

test('the agent view shows the MCP tools behind each screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('switch', { name: /Agent view|エージェントビュー/ }).click();
  await expect(page.getByTestId('agent-call').first()).toContainText('browse_collections');
  await page.getByTestId('collection-card').first().click();
  await expect(page.getByTestId('agent-call').filter({ hasText: 'search_products' })).toBeVisible();
});

test('an unknown product says so, and leads back to the start', async ({ page }) => {
  await page.goto('/products/no-such-piece');
  await expect(page.getByText(/We couldn't find that|お探しのものは見つかりませんでした/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Back to the start|トップへ戻る/ })).toBeVisible();
});

test("a second customer doesn't see the first customer's visits", async ({ page }) => {
  await page.goto(`/visits?demoUser=${SECOND_CUSTOMER}`);
  await expect(page.getByText(/No visits yet|ご来店予約はまだありません/)).toBeVisible();
  await expect(page.getByTestId('visit')).toHaveCount(0);
});

// LINE's MINI App safe area (Task 3). Phone emulation makes the pointer coarse, so there's no stage frame.
test.describe('a phone in portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps LINE's safe area: 34 px at the bottom", async ({ page }) => {
    await page.goto('/');
    const area = page.getByTestId('app-area');
    await expect(area).toHaveCSS('padding-bottom', '34px');
    await expect(area).toHaveCSS('padding-left', '0px');
  });
});

test.describe('a phone in landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test("fills the screen inside LINE's safe area: 44 px at the sides, 21 px at the bottom", async ({ page }) => {
    await page.goto('/');
    const area = page.getByTestId('app-area');
    await expect(area).toHaveCSS('padding-left', '44px');
    await expect(area).toHaveCSS('padding-right', '44px');
    await expect(area).toHaveCSS('padding-bottom', '21px');
    expect((await area.boundingBox())?.width).toBe(844);
  });
});
```

The tests run in file order with one worker. The first test leaves the default customer with a visit, so the second-customer test after it checks that that customer can't see it. The closed-day and cleared-date tests watch the page's requests to Strapi's `/mcp`: no `request_appointment` leaves the browser. The safe-area values were checked under this emulation on 30 September (Task 3).

- [ ] **Step 3: Write `liff/e2e/api.spec.ts`**

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, test } from '@playwright/test';

import { createSession } from '../lib/session';

const strapiUrl = (process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, '');
const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const asAdmin = () => ({ Authorization: `Bearer ${process.env.MAISON_E2E_ADMIN_JWT}` });

const pad = (n: number) => String(n).padStart(2, '0');
/** The next given weekday (0 = Sunday … 6 = Saturday) at least two days away, at `time` in Tokyo. */
const visitOn = (weekday: number, time: string) => {
  const date = new Date();
  const ahead = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (ahead < 2 ? ahead + 7 : ahead));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}:00+09:00`;
};

/** A demo customer's own MCP connection, signed in the way the app signs in: a LIFF mock ID token, exchanged. */
const signIn = async (lineUserId: string) => {
  const token = await createSession({ strapiUrl, clientId, getIdToken: () => `valid.${lineUserId}` }).getToken();
  const client = new Client({ name: 'maison-e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${strapiUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
};
const call = async (client: Client, name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })).structuredContent as Record<string, any>;
const references = async (client: Client) =>
  ((await call(client, 'my_appointments', {})).appointments as Array<{ reference: string }>).map((visit) => visit.reference);

test('my_appointments shows each customer only their own visits', async () => {
  // Customers of their own, apart from the browser tests' customers.
  const alice = await signIn(`U${'d'.repeat(32)}`);
  const bob = await signIn(`U${'e'.repeat(32)}`);
  const hers = await call(alice, 'request_appointment', { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: visitOn(6, '14:00') });
  const his = await call(bob, 'request_appointment', { boutique: 'omotesando', productSlugs: ['tote-soleil'], requestedFor: visitOn(0, '15:00') });
  expect(await references(alice)).toEqual([hers.appointment.reference]);
  expect(await references(bob)).toEqual([his.appointment.reference]);
  await alice.close();
  await bob.close();
});

test("the admin API never returns an appointment's customer, and its list search never matches one", async ({ request }) => {
  const carol = await signIn(`U${'f'.repeat(32)}`);
  const booked = await call(carol, 'request_appointment', { boutique: 'ginza', productSlugs: ['passport-cover'], requestedFor: visitOn(6, '16:00') });
  await carol.close();
  // The Content Manager's API. Every admin API reader goes through the same sanitizer.
  const list = async (query = '') => {
    const response = await request.get(`${strapiUrl}/content-manager/collection-types/plugin::maison.appointment?page=1&pageSize=20${query}`, { headers: asAdmin() });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { results: Array<Record<string, unknown>> }).results;
  };
  const results = await list();
  expect(results.length).toBeGreaterThan(0);
  for (const row of results) expect(row).not.toHaveProperty('customer');
  // The list search (_q) finds an appointment by its reference, and never by part of its customer's LINE user ID.
  expect((await list(`&_q=${booked.appointment.reference}`)).map((row) => row.reference)).toContain(booked.appointment.reference);
  expect(await list('&_q=ffffffff')).toHaveLength(0);
  // The relation picker searches an appointment's main field, so it must be the reference, never the customer.
  const configuration = await request.get(`${strapiUrl}/content-manager/content-types/plugin::maison.appointment/configuration`, { headers: asAdmin() });
  expect(configuration.ok()).toBe(true);
  expect(((await configuration.json()) as { data: { contentType: { settings: { mainField: string } } } }).data.contentType.settings.mainField).toBe('reference');
});
```

- **The first test** signs two demo customers in the way the app does (LIFF mock ID token, token exchange) and books a visit for each. Each customer's `my_appointments` must list only that customer's own visit.
- **The second** reads appointments through the Content Manager's API. Every admin API reader goes through the same sanitizer, so no `customer` there means none for any admin client (Task 1's extension). The list search finds Carol's visit by its reference, and nothing for `ffffffff`, a run of her LINE user ID (Task 1's `searchable: false`). The Content Manager's stored configuration names `reference` as the appointment's main field: relation pickers search the main field, so `customer` must never become it. Maison's schema lists `reference` first, which makes it the default.

- [ ] **Step 4: Install the browser and run the tests**

With `demo-strapi` running:

```bash
cd /Users/paul/work/maison-demo/liff
npx playwright install chromium
npm run test:e2e
```

Expected: `10 passed` (8 browser tests, 2 API tests). It signs in once, in the global setup.

- [ ] **Step 5: Run the Maison MCP smoke tests against the demo**

Plan 1 ran these without oauth-mcp-manager, so "never lets a plain admin token act as a customer" passed only because no identity service existed. With oauth-mcp-manager 1.1 loaded, the same test goes through its real `resolveSubject`, which answers `null` for a plain admin token.

They run from the demo's copy of the plugin, against `demo-strapi`. Maison's token script signs in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, so the command hands it the demo admin's, without printing them:

```bash
curl -s http://localhost:1338/.well-known/oauth-authorization-server | grep -o 'token-exchange'
cd /Users/paul/work/maison-demo/strapi/src/plugins/maison
node --env-file=../../../.env --input-type=module -e "process.env.ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL; process.env.ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD; await import('./scripts/mcp-dev-tokens.mjs');"
npm run test:mcp
```

Expected:
- `token-exchange`: oauth-mcp-manager is loaded.
- The token script prints "Demo catalog already loaded." and "Saved a customer, a staff and an ops token to test/mcp/.tokens.json." That file is mode 600, and the plugin's own `.gitignore` ignores it.
- `tests 8`, `pass 8`. These include each token's tool list, `not_found` hints, `not_signed_in` for a plain admin token, masked customers for staff, and the ops tools.
- The token script adds three tokens named `maison-customer-<time>`, `maison-staff-<time>` and `maison-ops-<time>` to the demo database. They don't clash with the setup script's names.
- The smoke tests need `liffUrl`, which `MAISON_LIFF_URL` in `strapi/.env` provides.

Then delete the three tokens the token script minted, and its token file. They never expire, and one is a staff token that can confirm visits: the demo keeps no standing staff credential.

```bash
cd /Users/paul/work/maison-demo
node --env-file=strapi/.env --input-type=module -e "
const base = 'http://localhost:1338';
const login = await (await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.DEMO_ADMIN_EMAIL, password: process.env.DEMO_ADMIN_PASSWORD }) })).json();
const api = (method, path) => fetch(base + path, { method, headers: { Authorization: 'Bearer ' + login.data.token } });
const smokeTokens = async () => (await (await api('GET', '/admin/admin-tokens')).json()).data.filter((token) => /^maison-(customer|staff|ops)-\d+$/.test(token.name));
const minted = await smokeTokens();
for (const token of minted) await api('DELETE', '/admin/admin-tokens/' + token.id);
console.log('smoke-test tokens deleted:', minted.length, '| left:', (await smokeTokens()).length);
"
rm -f strapi/src/plugins/maison/test/mcp/.tokens.json
ls -A strapi/src/plugins/maison/test/mcp | grep -c '^\.tokens\.json$'
```

Expected: `smoke-test tokens deleted: 3 | left: 0` (more than 3 if an earlier run left some), then `0`. It's this run's third admin sign-in, after the global setup's and the token script's, inside Strapi's five per five minutes. The README's stage checklist still starts from a clean database.

In the root `package.json` `scripts`, put a comma after the `"test"` line, and add after it:

```json
    "test:e2e": "npm run test:e2e --prefix liff",
    "test:live": "npm run test:live --prefix liff"
```

- [ ] **Step 6: Commit**

```bash
cd /Users/paul/work/maison-demo
git add liff/playwright.config.ts liff/e2e package.json
git commit -m "test(liff): add the browser and API tests" -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 9: The app inside LINE: one tunnel, a guarded mode switch, and Paul's phone

The stage keeps the LIFF mock. This task makes the real thing a tested path: the same app inside LINE on Paul's phone, signed in by his own LINE Login channel and LIFF app, on one public https origin from ngrok. A LINE MINI App is a LIFF app on a MINI App channel (LINE's [Introducing LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/discover/introduction/)), so this is also the path QBurst takes with their MINI App channel (Task 10's handoff).

**Files:**
- Create:
  - `scripts/line-mode.mjs`, `scripts/line-mode.test.mjs`: the switch between local and LINE mode
  - `scripts/line-tunnel.mjs`, `scripts/line-tunnel.test.mjs`: the guarded tunnel
  - `liff/lib/strapi-proxy.ts`, `liff/lib/strapi-proxy.test.ts`, and the routes `liff/app/mcp/route.ts`, `liff/app/api/strapi-oauth-mcp-manager/oauth/token/route.ts` and `liff/app/uploads/[...path]/route.ts`
  - `liff/lib/tunnel.ts`, `liff/lib/tunnel.test.ts`: the header that skips ngrok's warning page
  - `liff/lib/liff.test.ts`
  - `liff/scripts/check-strapi-proxy.mjs`: the proxy, end to end, through `next start`
  - `liff/scripts/render-channel-icon.mjs` and `liff/line/channel-icon.png`: the channel icon, to LINE's MINI App icon spec
- Modify:
  - `liff/lib/liff.ts` (Task 4): sign in again the way LIFF documents it
  - `liff/lib/session.ts`, `liff/lib/mcp.ts` (Task 4) and `liff/app/concierge/page.tsx` (Task 7): the header, on same-origin calls only
  - `liff/next.config.mjs`, `liff/package.json` and `liff/.env.example` (Task 3): the `X-Maison-Liff` header, `start:line`, and LINE mode's keys
  - `strapi/scripts/maison-setup.mjs` (Task 2): the app's Strapi URL in LINE mode, and a check of the running channel
  - `package.json` (root): `mode`, `mode:line`, `mode:local`, `start:line`, `tunnel`, and the scripts' tests in `npm test`
- **Never committed, printed or written into the plan or the README:** Paul's LIFF ID, channel ID and ngrok domain. They live in `liff/.env` only, as `LINE_MODE_LIFF_ID`, `LINE_MODE_CHANNEL_ID` and `LINE_MODE_DOMAIN`. The repo goes public.

**How LINE mode works, and why:**
- **One public origin, and Strapi stays local.** The phone talks only to the app's origin, ngrok's https domain. The app proxies three of Strapi's paths to `http://localhost:1338`: `/mcp`, the token endpoint (`/api/strapi-oauth-mcp-manager/oauth/token`) and `/uploads/*`. Strapi's admin and its other APIs never reach the internet, and the browser needs no CORS.
- **Route handlers, not rewrites.** Next 16.3.8 gzips every response in its router (`compress` is on by default). An external rewrite pipes Strapi's server-sent events through that gzip without flushing. A route handler's stream is flushed chunk by chunk (`next/dist/server/pipe-readable.js`). Checked on 30 September with `next start`: a two-event MCP answer arrived in one chunk at 1509 ms through a rewrite, and event by event (19 ms, then 1517 ms) through a route handler. Route handlers also forward only the headers the calls use (no cookies, no Origin), and only these three paths.
- **A production build, not `next dev` with `allowedDevOrigins`.** Next 16 blocks cross-origin requests to dev-only assets unless the tunnel's hostname is listed (`liff/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md`). A dev server would also compile each page on its first request over the tunnel, and keep an HMR socket open to the phone. A production build is what QBurst deploys. The cost: `NEXT_PUBLIC_*` values are inlined at build time, so `npm run start:line` builds again every time.
- **Strapi's public URL is the app's.** `PUBLIC_URL=https://<your domain>` makes Maison's media URLs and oauth-mcp-manager's metadata use the public origin, which proxies them. The admin keeps working at `http://localhost:1338/admin`: when the admin and the server share an origin, Strapi 5.55.1 builds the admin with a relative backend URL (`@strapi/strapi/dist/src/node/create-build-context.js`).
- **The switch is two `.env` files.** oauth-mcp-manager's OAuth client holds no LINE channel. The channel is `identityProviders.line.channelId`, from `LINE_LOGIN_CHANNEL_ID`, which Strapi reads at start. So `npm run mode:line` and `npm run mode:local` rewrite eight keys, then Strapi restarts:

  | Key | Local mode | LINE mode |
  |---|---|---|
  | `LINE_LOGIN_CHANNEL_ID` (strapi/.env) | `1234567890`, the mock's | `LINE_MODE_CHANNEL_ID` |
  | `LINE_VERIFY_URL` (strapi/.env) | `http://127.0.0.1:4545/verify` | empty: LINE's own endpoint |
  | `MAISON_LIFF_URL` (strapi/.env) | `http://localhost:3003` | `https://liff.line.me/<LINE_MODE_LIFF_ID>` |
  | `PUBLIC_URL` (strapi/.env) | empty: `http://localhost:1338` | `https://<LINE_MODE_DOMAIN>` |
  | `NEXT_PUBLIC_LIFF_MOCK` (liff/.env) | `true` | `false` |
  | `NEXT_PUBLIC_LIFF_ID` (liff/.env) | empty | `LINE_MODE_LIFF_ID` |
  | `NEXT_PUBLIC_STRAPI_URL` (liff/.env) | `http://localhost:1338` | `https://<LINE_MODE_DOMAIN>` |
  | `STRAPI_URL` (liff/.env) | `http://localhost:1338` | `http://localhost:1338`: the proxy's and the concierge's |

  Running either switch twice changes nothing, and neither prints a value. The setup script (`npm run setup`) now checks that the running Strapi has the channel strapi/.env names, and it writes `PUBLIC_URL` as the app's Strapi URL in LINE mode, so a setup run there doesn't send the phone to `localhost`. The mock's own `LINE_LOGIN_CHANNEL_ID` in liff/.env stays `1234567890`, so the mock never accepts tokens for Paul's channel.
- **The guard.** With the local verify mock behind a tunnel, anyone could mint a session for any LINE user ID. `npm run tunnel` refuses unless:
  - strapi/.env has no `LINE_VERIFY_URL`, and both files are in LINE mode
  - nothing answers on the verify mock's port (127.0.0.1:4545)
  - the app on 127.0.0.1:3003 was built for LINE (`X-Maison-Liff: line`, a header `next.config.mjs` sets from `NEXT_PUBLIC_LIFF_MOCK`)
  - the running Strapi, reached through the app, refuses a forged ID token with 400 `invalid_grant`: LINE checked it, not a mock. This last probe runs only once everything else passes.
  
  It then runs `ngrok http 127.0.0.1:3003 --url=https://<domain> --inspect=false`. The app listens on 127.0.0.1 only, like Strapi, so the tunnel is the only way in from outside this machine. `--inspect=false` turns off ngrok's local inspector (:4040), which would otherwise keep every request, customers' session tokens and LINE ID tokens included ([ngrok's web inspection interface](https://ngrok.com/docs/agent/web-inspection-interface/)).
- **ngrok's free-plan warning page.** Paul's domain is an ngrok dev domain (`*.ngrok-free.dev`), which free accounts use. ngrok shows a warning page in front of "all HTML browser traffic on the free tier", picked out by a browser User-Agent, until the visitor clicks **Visit Site**; a cookie then suppresses it for 7 days. A request header, `ngrok-skip-browser-warning`, skips it ([ngrok's free plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits/), [ERR_NGROK_6024](https://ngrok.com/docs/errors/err_ngrok_6024/)).
  - The page's own calls carry a browser User-Agent too, so the app sends that header on them: the token exchange, the MCP client and the concierge.
  - It sends it only when Strapi's URL is the page's own origin, which is LINE mode. Cross-origin, in local mode, Strapi's CORS settings wouldn't allow the header.
  - The first page load inside LINE can't carry a header, so **Paul** taps Visit Site once (Step 12).
- **LIFF inside LINE.** `liff.login()` can't be used in the LIFF browser, because `liff.init()` signs in by itself there, and an ID token is valid for one hour ([LIFF API reference](https://developers.line.biz/en/reference/liff/): `liff.login()`, `liff.getIDToken()`). Task 4's `signInAgain` called `liff.login()`. It now logs out and reloads, LINE's own pattern ([Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/), "Performing a login process"), at most once a minute. A second `invalid_grant` right after a new sign-in means the app and Strapi disagree about the channel, and the screen shows the error instead of reloading for ever.
- **The LIFF app's settings** follow [Adding a LIFF app to your channel](https://developers.line.biz/en/docs/liff/registering-liff-apps/). The endpoint URL is `https://<your domain>/`, the root, so `liff.init()` runs at or below it on every page ([liff.init()](https://developers.line.biz/en/reference/liff/#initialize-liff-app)). The scopes are `openid` and `profile`, and the size is `Full`, the only size a MINI App has. The channel stays in **Developing**, where only its admins and testers can sign in ([LINE Login: getting started](https://developers.line.biz/en/docs/line-login/getting-started/)). So nobody else can get a customer session through the tunnel, or use the concierge's model.

**Interfaces:**
- Consumes:
  - Strapi on `http://localhost:1338` (Tasks 1–2): `/mcp`, `POST /api/strapi-oauth-mcp-manager/oauth/token`, `/uploads/*`, and the admin overview's `lineSignIn.channelId` (the setup script)
  - Task 4's `config.strapiUrl`, `initLiff`, `createSession` and `createMcp`, and Task 7's concierge transport
  - Playwright's Chromium (Task 8, Step 4), for the icon
  - Paul's values in `liff/.env`: `LINE_MODE_LIFF_ID`, `LINE_MODE_CHANNEL_ID` and `LINE_MODE_DOMAIN`
- Produces:
  - `proxyToStrapi(request, path, { strapiUrl?, fetchImpl? })`, `strapiOrigin(env?)`, and the routes `/mcp` (GET, POST, DELETE), `/api/strapi-oauth-mcp-manager/oauth/token` (POST) and `/uploads/[...path]` (GET, HEAD)
  - `tunnelHeaders(strapiUrl)`
  - `X-Maison-Liff: mock | line` on every answer from the app
  - root scripts `mode`, `mode:line`, `mode:local`, `start:line` and `tunnel` (`npm run tunnel -- --dry-run` checks only)
  - `scripts/line-mode.mjs` exports `readEnv`, `writeEnv`, `lineInputs`, `modeDifferences`, `currentMode` and `main`; `scripts/line-tunnel.mjs` exports `checkTunnel` and `main`
  - `liff/line/channel-icon.png`
  - the `demo-app-line` launch configuration (the controller's)

**Stop points:**
- The implementer does Steps 1–7 and stops after Step 7's commit.
- Steps 8–13 are Paul's and the controller's, in order. Step 5 asks the controller to restart `demo-app`; the implementer doesn't wait for it.
- If a check in Steps 9–13 fails, the controller resumes the implementer with the check's output. The fix gets its own commit (`fix(liff): …`).

- [ ] **Step 1: Write the failing tests for the app's side**

`liff/lib/strapi-proxy.test.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import { proxyToStrapi } from './strapi-proxy';

type Seen = { method: string; url: string; headers: IncomingMessage['headers']; body: string };

/** A stand-in for Strapi on a free port. It records every request it gets. */
const upstreams: Array<{ close: () => void }> = [];
const fakeStrapi = async (handle: (req: IncomingMessage, res: ServerResponse, body: string) => void) => {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      handle(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  upstreams.push({ close: () => server.close() });
  return { strapiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
};
afterEach(() => upstreams.splice(0).forEach((upstream) => upstream.close()));

const PUBLIC = 'https://maison.example';

describe('proxyToStrapi', () => {
  it('forwards an MCP call with only the headers it needs, and passes the answer back', async () => {
    const { strapiUrl, seen } = await fakeStrapi((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer resource_metadata="x"', 'Set-Cookie': 'koa.sess=1' });
      res.end('{"error":"invalid_token"}');
    });
    const response = await proxyToStrapi(
      new Request(`${PUBLIC}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mcp_at_customer',
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
          Cookie: 'ngrok_visit=1',
          Origin: PUBLIC,
          'ngrok-skip-browser-warning': '1',
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
      }),
      '/mcp',
      { strapiUrl }
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer resource_metadata="x"');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toBe('{"error":"invalid_token"}');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/mcp', body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
    expect(seen[0].headers).toMatchObject({
      authorization: 'Bearer mcp_at_customer',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    });
    for (const name of ['cookie', 'origin', 'ngrok-skip-browser-warning']) expect(seen[0].headers).not.toHaveProperty(name);
  });

  it('streams server-sent events as Strapi writes them', async () => {
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    const { strapiUrl } = await fakeStrapi(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('event: message\ndata: {"id":1}\n\n');
      await released; // the second event waits until the test has read the first one
      res.end('event: message\ndata: {"id":2}\n\n');
    });
    const firstEvent = (async () => {
      const response = await proxyToStrapi(new Request(`${PUBLIC}/mcp`, { method: 'POST', body: '{}' }), '/mcp', { strapiUrl });
      const reader = response.body!.getReader();
      return { reader, first: await reader.read() };
    })();
    const { reader, first } = await Promise.race([
      firstEvent,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the first event was held back')), 2000)),
    ]);
    expect(new TextDecoder().decode(first.value)).toContain('"id":1');
    release();
    let rest = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value);
    expect(rest).toContain('"id":2');
  });

  it('serves catalog images from /uploads', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { strapiUrl, seen } = await fakeStrapi((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
      res.end(png);
    });
    const response = await proxyToStrapi(new Request(`${PUBLIC}/uploads/weekender_50.png`), '/uploads/weekender_50.png', { strapiUrl });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/uploads/weekender_50.png' });
  });

  it('reaches nothing on Strapi but /mcp, the token endpoint and /uploads', async () => {
    const { strapiUrl, seen } = await fakeStrapi((_req, res) => res.end('reached'));
    for (const path of ['/admin/init', '/api/strapi-oauth-mcp-manager/oauth/authorize', '/api/strapi-oauth-mcp-manager/oauth/register', '/_health', '/uploads/../admin/init', '/uploads/']) {
      const response = await proxyToStrapi(new Request(`${PUBLIC}${path}`), path, { strapiUrl });
      expect(response.status, path).toBe(404);
    }
    expect(seen).toEqual([]);
  });

  it("answers 502 temporarily_unavailable when Strapi isn't running", async () => {
    const { strapiUrl } = await fakeStrapi(() => {});
    upstreams.splice(0).forEach((upstream) => upstream.close());
    const response = await proxyToStrapi(new Request(`${PUBLIC}/mcp`, { method: 'POST', body: '{}' }), '/mcp', { strapiUrl });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'temporarily_unavailable' });
  });
});
```

`liff/lib/tunnel.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tunnelHeaders } from './tunnel';

describe('tunnelHeaders', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("skips ngrok's warning page when the browser calls Strapi's paths on the app's own origin (LINE mode)", () => {
    vi.stubGlobal('window', { location: { origin: 'https://maison.example' } });
    expect(tunnelHeaders('https://maison.example')).toEqual({ 'ngrok-skip-browser-warning': '1' });
  });

  it('sends nothing cross-origin, where Strapi would refuse an unknown header (local mode), or on the server', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3003' } });
    expect(tunnelHeaders('http://localhost:1338')).toEqual({});
    vi.unstubAllGlobals();
    expect(tunnelHeaders('https://maison.example')).toEqual({});
  });
});
```

`liff/lib/liff.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real LIFF SDK, as the app uses it inside LINE (NEXT_PUBLIC_LIFF_MOCK=false).
const liff = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  isLoggedIn: vi.fn(() => true),
  getIDToken: vi.fn(() => 'eyJ.line.idtoken'),
  getAppLanguage: vi.fn(() => 'ja'),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: liff }));

const browser = () => {
  const store = new Map<string, string>();
  const location = { href: 'https://maison.example/visits', search: '', reload: vi.fn() };
  vi.stubGlobal('window', {
    location,
    sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) },
  });
  return location;
};

describe('initLiff inside LINE', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_LIFF_MOCK', 'false');
    vi.stubEnv('NEXT_PUBLIC_LIFF_ID', '1234567890-AbcdEfgh');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("starts LIFF with the app's LIFF ID and passes on LINE's ID token and language", async () => {
    browser();
    const { initLiff } = await import('./liff');
    const state = await initLiff();
    expect(liff.init).toHaveBeenCalledWith({ liffId: '1234567890-AbcdEfgh' });
    expect(state).toMatchObject({ locale: 'ja', mock: false });
    expect(state.getIdToken()).toBe('eyJ.line.idtoken');
  });

  it('signs in again the way LINE documents it: log out and reload, never liff.login(), and only once a minute', async () => {
    const location = browser();
    const { initLiff } = await import('./liff');
    const state = await initLiff();
    state.signInAgain();
    expect(liff.logout).toHaveBeenCalledTimes(1);
    expect(location.reload).toHaveBeenCalledTimes(1);
    // Refused again right after: the app and Strapi disagree about the channel. Show the error rather than loop.
    state.signInAgain();
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(liff.login).not.toHaveBeenCalled();
  });
});
```

Run: `cd /Users/paul/work/maison-demo/liff && npm test`

Expected: FAIL.
- `strapi-proxy.test.ts` and `tunnel.test.ts` fail to load: `Cannot find module './strapi-proxy'` and `Cannot find module './tunnel'`.
- In `liff.test.ts`, "signs in again the way LINE documents it" fails with `expected "spy" to be called 1 times, but got 0 times`: Task 4's `signInAgain` calls `liff.login()` and never reloads. The other LIFF test passes, which pins how `initLiff` starts LIFF inside LINE.
- `Tests  1 failed | 31 passed (32)`: Tasks 4–7's 30 still pass.

- [ ] **Step 2: Make them pass**

`liff/lib/strapi-proxy.ts`:

```ts
/**
 * The app's proxy for the three Strapi paths a phone needs in LINE mode. The phone only ever talks to the app's own
 * origin (the ngrok tunnel), and Strapi, with its admin, stays on this machine:
 *   /mcp                                          Strapi's MCP server (streamable HTTP)
 *   /api/strapi-oauth-mcp-manager/oauth/token     the LINE ID token exchange
 *   /uploads/*                                    catalog images
 * Responses stream through as Strapi writes them: an MCP answer is a server-sent event stream. Only the request
 * headers those calls use reach Strapi: no cookies, no Origin.
 */
const PROXIED = /^(\/mcp|\/api\/strapi-oauth-mcp-manager\/oauth\/token|\/uploads\/[^?#]+)$/;
const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'last-event-id',
  'mcp-protocol-version',
  'mcp-session-id',
  'range',
];
// Hop-by-hop headers, cookies, and what fetch has already undone: it decompresses, so the encoding and length go too.
const DROPPED_RESPONSE_HEADERS = [
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/**
 * Where the app's server reaches Strapi: STRAPI_URL, else Strapi's default port. Never NEXT_PUBLIC_STRAPI_URL, which
 * in LINE mode is the app's own public address, so the proxy would call itself.
 */
export const strapiOrigin = (env: Record<string, string | undefined> = process.env) =>
  (env.STRAPI_URL || 'http://localhost:1338').replace(/\/+$/, '');

export async function proxyToStrapi(
  request: Request,
  path: string,
  { strapiUrl = strapiOrigin(), fetchImpl = fetch }: { strapiUrl?: string; fetchImpl?: typeof fetch } = {}
): Promise<Response> {
  if (!PROXIED.test(path) || path.split('/').includes('..')) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${strapiUrl}${path}${new URL(request.url).search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: request.signal,
    });
  } catch {
    return Response.json(
      { error: 'temporarily_unavailable', error_description: "The app couldn't reach Strapi." },
      { status: 502 }
    );
  }
  const responseHeaders = new Headers(upstream.headers);
  for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}
```

`liff/app/mcp/route.ts`:

```ts
import { proxyToStrapi } from '@/lib/strapi-proxy';

// Strapi's MCP server on the app's own origin (LINE mode). Strapi itself answers GET and DELETE with 405.
const proxy = (request: Request) => proxyToStrapi(request, '/mcp');
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
```

`liff/app/api/strapi-oauth-mcp-manager/oauth/token/route.ts`:

```ts
import { proxyToStrapi } from '@/lib/strapi-proxy';

// oauth-mcp-manager's token endpoint on the app's own origin (LINE mode): the LINE ID token exchange.
export const POST = (request: Request) => proxyToStrapi(request, '/api/strapi-oauth-mcp-manager/oauth/token');
```

`liff/app/uploads/[...path]/route.ts`:

```ts
import { proxyToStrapi } from '@/lib/strapi-proxy';

// Catalog images on the app's own origin (LINE mode). Strapi builds their absolute URLs from PUBLIC_URL.
const proxy = (request: Request) => proxyToStrapi(request, new URL(request.url).pathname);
export const GET = proxy;
export const HEAD = proxy;
```

The three routes are dynamic (`ƒ` in `next build`) without any route config: each reads its request.

`liff/lib/tunnel.ts`:

```ts
/**
 * Headers for the browser's own calls in LINE mode. There the app is served through an ngrok tunnel, and the browser
 * reaches Strapi's paths on the app's own origin (the app proxies them). On ngrok's free plan a browser request gets a
 * warning page (ERR_NGROK_6024) instead of the answer until the visitor has clicked through it, and this header skips
 * it: https://ngrok.com/docs/pricing-limits/free-plan-limits/#removing-the-interstitial-page
 * Sent only when `strapiUrl` is the page's own origin. Cross-origin (local mode) Strapi's CORS settings don't allow
 * it, and on the server there's no tunnel in the way.
 */
export const tunnelHeaders = (strapiUrl: string): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    return new URL(strapiUrl).origin === window.location.origin ? { 'ngrok-skip-browser-warning': '1' } : {};
  } catch {
    return {};
  }
};
```

In `liff/lib/liff.ts`, make three replacements. Replace:

```ts
  /** Inside LINE: a new LINE login, for when the token endpoint answers invalid_grant. It leaves the page. */
```

with:

```ts
  /** Inside LINE: a new LINE login, for when the token endpoint answers invalid_grant. It reloads the page. */
```

Replace:

```ts
const DEMO_USER_KEY = 'maison.demoUser';
```

with:

```ts
const DEMO_USER_KEY = 'maison.demoUser';
const SIGNED_IN_AGAIN_AT = 'maison.signedInAgainAt';
```

Replace:

```ts
    signInAgain: () => {
      liff.logout(); // drops the stale ID token
      liff.login({ redirectUri: window.location.href });
    },
```

with:

```ts
    signInAgain: () => {
      // LINE's way: log out, then reload. Inside LINE, liff.init() signs in again by itself, and liff.login() can't be
      // used there; in an external browser, init() above calls liff.login(). At most once a minute: refused again right
      // after a new sign-in, the app and Strapi disagree about the LINE channel, and the screen shows the error instead.
      try {
        if (Date.now() - Number(window.sessionStorage.getItem(SIGNED_IN_AGAIN_AT)) < 60_000) return;
        window.sessionStorage.setItem(SIGNED_IN_AGAIN_AT, String(Date.now()));
      } catch {
        return; // without storage a loop can't be told apart: show the error
      }
      liff.logout(); // drops the expired ID token
      window.location.reload();
    },
```

In `liff/lib/session.ts`, add at the top, before `export const TOKEN_EXCHANGE`:

```ts
import { tunnelHeaders } from './tunnel';

```

and replace:

```ts
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
```

with:

```ts
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...tunnelHeaders(strapiUrl),
        },
```

In `liff/lib/mcp.ts`, replace:

```ts
import type { Session } from './session';
```

with:

```ts
import type { Session } from './session';
import { tunnelHeaders } from './tunnel';
```

and replace:

```ts
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
```

with:

```ts
        requestInit: {
          headers: { Authorization: `Bearer ${token}`, ...tunnelHeaders(strapiUrl) },
        },
```

`tunnel.ts` imports nothing, so `session.ts` still runs in Node for Task 7's live test and Task 8's API tests. There, `tunnelHeaders` adds nothing.

In `liff/app/concierge/page.tsx`, replace:

```tsx
import { COPY } from '@/lib/copy';
import { getMaison } from '@/lib/maison';
```

with:

```tsx
import { config } from '@/lib/config';
import { COPY } from '@/lib/copy';
import { getMaison } from '@/lib/maison';
import { tunnelHeaders } from '@/lib/tunnel';
```

and replace:

```tsx
        headers: async () => ({ Authorization: `Bearer ${await (await getMaison()).session.getToken()}` }),
```

with:

```tsx
        headers: async () => ({
          Authorization: `Bearer ${await (await getMaison()).session.getToken()}`,
          ...tunnelHeaders(config.strapiUrl),
        }),
```

The concierge's own requests go to `/api/concierge` on the app's origin, which is the tunnel's in LINE mode.

```bash
cd /Users/paul/work/maison-demo/liff
npm test && npm run typecheck
grep -c 'liff.login({ redirectUri' lib/liff.ts
grep -c 'tunnelHeaders(' lib/session.ts lib/mcp.ts app/concierge/page.tsx
```

Expected:
- `Tests  39 passed (39)`: Tasks 4–7's 30, the proxy's 5, the header's 2 and LIFF's 2. Then `tsc` exits 0.
- `0`: no `liff.login()` is left in `signInAgain`.
- `lib/session.ts:1`, `lib/mcp.ts:1` and `app/concierge/page.tsx:1`.

- [ ] **Step 3: The header the guard reads, `start:line`, LINE mode's keys, and the proxy end to end**

`liff/next.config.mjs`, replacing Task 3's:

```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode runs effects twice in development, which would record every tool call twice in the agent view.
  reactStrictMode: false,
  // liff/ has its own package-lock.json, and so do the repo root and strapi/. Pin Turbopack's workspace root to liff/.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  // Which LIFF this build signs in with: `npm run tunnel` refuses to expose a build on the LIFF mock.
  // Next loads liff/.env before this file, so the value is the one the build inlines.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Maison-Liff', value: process.env.NEXT_PUBLIC_LIFF_MOCK === 'false' ? 'line' : 'mock' }],
      },
    ];
  },
};

export default nextConfig;
```

`demo-app` restarts by itself when `next.config.mjs` changes.

In `liff/package.json` `scripts`, add after `"start"`:

```json
    "start:line": "node ../scripts/line-mode.mjs require-line && next build && next start -H 127.0.0.1 -p 3003",
```

It refuses outside LINE mode, builds with LINE mode's `NEXT_PUBLIC_*` values, and serves the build on 127.0.0.1 without the verify mock.

In `liff/.env.example`, add after `NEXT_PUBLIC_DEMO_LOCALE=ja`:

```
# LINE mode (`npm run mode:line`; README, option B): your LIFF app's LIFF ID, your LINE Login channel's ID, and your
# ngrok domain without https://. They stay in this file: never in the README, a commit or a log.
LINE_MODE_LIFF_ID=
LINE_MODE_CHANNEL_ID=
LINE_MODE_DOMAIN=
# Where the app's server reaches Strapi: the proxy in LINE mode, and the concierge. `npm run mode:*` sets it.
STRAPI_URL=http://localhost:1338
```

`liff/scripts/check-strapi-proxy.mjs`:

```js
// Checks the app's Strapi proxy end to end, the way LINE mode serves it: the production build (`next start`, with
// Next's compression on) in front of a stand-in for Strapi, both on free ports. Run `npm run build` first.
//   - an MCP answer streams: its first event arrives before Strapi writes the second, 1.5 s later
//   - the token endpoint's answer, status and Retry-After come back as Strapi sent them
//   - a catalog image comes back byte for byte
//   - nothing else reaches Strapi: /admin, the OAuth authorize and register pages, /_health
//   - every answer says which LIFF the build signs in with (X-Maison-Liff), which `npm run tunnel` checks
// From liff/: node scripts/check-strapi-proxy.mjs. Exits 1 on the first failed check.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const freePort = () =>
  new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

// The stand-in for Strapi records every path it's asked for.
const reached = [];
const strapi = createServer((req, res) => {
  reached.push(`${req.method} ${req.url}`);
  if (req.url === '/mcp') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');
    setTimeout(() => res.end('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n'), 1500);
  } else if (req.url === '/api/strapi-oauth-mcp-manager/oauth/token') {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
    res.end('{"error":"temporarily_unavailable"}');
  } else if (req.url === '/uploads/weekender_50.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(PNG);
  } else {
    res.writeHead(200);
    res.end('Strapi was reached');
  }
});
await new Promise((resolve) => strapi.listen(0, '127.0.0.1', resolve));
const appPort = await freePort();
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(appPort)], {
  env: { ...process.env, STRAPI_URL: `http://127.0.0.1:${strapi.address().port}` },
  stdio: ['ignore', 'ignore', 'inherit'],
});
process.on('exit', () => app.kill('SIGTERM')); // also when a check throws
const base = `http://127.0.0.1:${appPort}`;

let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok' : 'FAILED'}: ${label}`);
  if (!ok) failed = true;
};
try {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      await fetch(`${base}/`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const home = await fetch(`${base}/`);
  const liff = home.headers.get('x-maison-liff');
  check(home.status === 200 && (liff === 'mock' || liff === 'line'), `the app answers with X-Maison-Liff: ${liff}`);

  const started = performance.now();
  const mcp = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Accept-Encoding': 'gzip' },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
  });
  const reader = mcp.body.getReader();
  const first = await reader.read();
  const firstAt = performance.now() - started;
  let rest = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value);
  check(
    mcp.status === 200 && new TextDecoder().decode(first.value).includes('"id":1') && firstAt < 1000 && rest.includes('"id":2'),
    `/mcp streams: the first event after ${Math.round(firstAt)} ms, before Strapi wrote the second (1500 ms)`
  );

  const token = await fetch(`${base}/api/strapi-oauth-mcp-manager/oauth/token`, { method: 'POST', body: 'grant_type=x' });
  check(
    token.status === 503 && token.headers.get('retry-after') === '5' && (await token.json()).error === 'temporarily_unavailable',
    'the token endpoint passes back 503, Retry-After: 5 and temporarily_unavailable'
  );

  const image = await fetch(`${base}/uploads/weekender_50.png`);
  check(image.headers.get('content-type') === 'image/png' && Buffer.from(await image.arrayBuffer()).equals(PNG), '/uploads serves the image');

  const before = reached.length;
  for (const [method, path] of [
    ['GET', '/admin'],
    ['GET', '/admin/init'],
    ['GET', '/api/strapi-oauth-mcp-manager/oauth/authorize'],
    ['POST', '/api/strapi-oauth-mcp-manager/oauth/register'],
    ['GET', '/_health'],
  ]) {
    const response = await fetch(`${base}${path}`, { method });
    check(response.status === 404, `${method} ${path} answers 404 from the app`);
  }
  check(reached.length === before, `Strapi was reached only for the three proxied paths (${reached.join(', ')})`);
} finally {
  app.kill('SIGTERM');
  strapi.close();
}
process.exitCode = failed ? 1 : 0;
```

```bash
cd /Users/paul/work/maison-demo/liff
npm run build
node scripts/check-strapi-proxy.mjs
```

Expected:
- **The build** lists `ƒ /api/strapi-oauth-mcp-manager/oauth/token`, `ƒ /mcp` and `ƒ /uploads/[...path]`. Building while `demo-app` runs is fine: Next 16 keeps the dev server's files in `.next/dev`.
- **The check** starts the build and a stand-in for Strapi on free ports, prints these lines (the times vary), exits 0, and stops both:

  ```
  ok: the app answers with X-Maison-Liff: mock
  ok: /mcp streams: the first event after 18 ms, before Strapi wrote the second (1500 ms)
  ok: the token endpoint passes back 503, Retry-After: 5 and temporarily_unavailable
  ok: /uploads serves the image
  ok: GET /admin answers 404 from the app
  ok: GET /admin/init answers 404 from the app
  ok: GET /api/strapi-oauth-mcp-manager/oauth/authorize answers 404 from the app
  ok: POST /api/strapi-oauth-mcp-manager/oauth/register answers 404 from the app
  ok: GET /_health answers 404 from the app
  ok: Strapi was reached only for the three proxied paths (POST /mcp, POST /api/strapi-oauth-mcp-manager/oauth/token, GET /uploads/weekender_50.png)
  ```

  `mock`, because `liff/.env` is in local mode. A first event at or after 1000 ms means the proxy buffers: fix it before going on.

- [ ] **Step 4: The mode switch and the tunnel guard, test first**

`scripts/line-mode.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { main, readEnv } from './line-mode.mjs';

const SECRET = 'jwt-secret-that-must-never-print';
const INPUTS = { LINE_MODE_LIFF_ID: '1234567891-AbcdEfgh', LINE_MODE_CHANNEL_ID: '1234567891', LINE_MODE_DOMAIN: 'maison-test.ngrok-free.dev' };

/** A demo checkout in local mode, as `npm install` and `npm run setup` leave it, plus `liffExtra` in liff/.env. */
const demo = (liffExtra = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'maison-mode-'));
  mkdirSync(join(root, 'strapi'));
  mkdirSync(join(root, 'liff'));
  const lines = (values) => Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  writeFileSync(
    join(root, 'strapi', '.env'),
    lines({ PORT: '1338', JWT_SECRET: SECRET, LINE_LOGIN_CHANNEL_ID: '1234567890', LINE_VERIFY_URL: 'http://127.0.0.1:4545/verify', MAISON_LIFF_URL: 'http://localhost:3003', MAISON_APP_ORIGIN: '', PUBLIC_URL: '' }),
    { mode: 0o600 }
  );
  writeFileSync(join(root, 'liff', '.env'), lines({ NEXT_PUBLIC_STRAPI_URL: 'http://localhost:1338', NEXT_PUBLIC_MAISON_CLIENT_ID: 'mcp_client_test', ...liffExtra }), { mode: 0o600 });
  return root;
};
const run = (args, root) => {
  const lines = [];
  const code = main(args, { root, log: (line) => lines.push(line) });
  return { code, out: lines.join('\n') };
};
const env = (root, app) => readEnv(join(root, app, '.env'));
const pick = (values, keys) => Object.fromEntries(keys.map((key) => [key, values[key]]));
const STRAPI_KEYS = ['LINE_LOGIN_CHANNEL_ID', 'LINE_VERIFY_URL', 'MAISON_LIFF_URL', 'PUBLIC_URL'];
const LIFF_KEYS = ['NEXT_PUBLIC_LIFF_MOCK', 'NEXT_PUBLIC_LIFF_ID', 'NEXT_PUBLIC_STRAPI_URL', 'STRAPI_URL'];

test('switches to LINE mode and back, and a second run of either changes nothing', () => {
  const root = demo(INPUTS);
  assert.match(run(['status'], root).out, /^Mode: local /);

  assert.equal(run(['line'], root).code, 0);
  assert.deepEqual(pick(env(root, 'strapi'), STRAPI_KEYS), {
    LINE_LOGIN_CHANNEL_ID: '1234567891',
    LINE_VERIFY_URL: '',
    MAISON_LIFF_URL: 'https://liff.line.me/1234567891-AbcdEfgh',
    PUBLIC_URL: 'https://maison-test.ngrok-free.dev',
  });
  assert.deepEqual(pick(env(root, 'liff'), LIFF_KEYS), {
    NEXT_PUBLIC_LIFF_MOCK: 'false',
    NEXT_PUBLIC_LIFF_ID: '1234567891-AbcdEfgh',
    NEXT_PUBLIC_STRAPI_URL: 'https://maison-test.ngrok-free.dev',
    STRAPI_URL: 'http://localhost:1338',
  });
  const files = () => ['strapi', 'liff'].map((app) => readFileSync(join(root, app, '.env'), 'utf8')).join('\n');
  const once = files();
  run(['line'], root);
  assert.equal(files(), once);
  assert.match(run(['status'], root).out, /^Mode: LINE /);
  assert.equal(run(['require-line'], root).code, 0);

  assert.equal(run(['local'], root).code, 0);
  assert.deepEqual(pick(env(root, 'strapi'), STRAPI_KEYS), {
    LINE_LOGIN_CHANNEL_ID: '1234567890',
    LINE_VERIFY_URL: 'http://127.0.0.1:4545/verify',
    MAISON_LIFF_URL: 'http://localhost:3003',
    PUBLIC_URL: '',
  });
  assert.deepEqual(pick(env(root, 'liff'), LIFF_KEYS), {
    NEXT_PUBLIC_LIFF_MOCK: 'true',
    NEXT_PUBLIC_LIFF_ID: '',
    NEXT_PUBLIC_STRAPI_URL: 'http://localhost:1338',
    STRAPI_URL: 'http://localhost:1338',
  });
  assert.equal(env(root, 'strapi').JWT_SECRET, SECRET);
  assert.equal(env(root, 'liff').NEXT_PUBLIC_MAISON_CLIENT_ID, 'mcp_client_test');
  for (const app of ['strapi', 'liff']) assert.equal(statSync(join(root, app, '.env')).mode & 0o777, 0o600);
  assert.match(run(['status'], root).out, /^Mode: local /);
  assert.equal(run(['require-line'], root).code, 1);
});

test("refuses LINE mode without your LINE values, or with the mock's channel, and changes nothing", () => {
  for (const liffExtra of [{}, { ...INPUTS, LINE_MODE_CHANNEL_ID: '1234567890' }, { ...INPUTS, LINE_MODE_DOMAIN: 'https://maison-test.ngrok-free.dev' }]) {
    const root = demo(liffExtra);
    const before = readFileSync(join(root, 'strapi', '.env'), 'utf8');
    const { code, out } = run(['line'], root);
    assert.equal(code, 1);
    assert.match(out, /LINE_MODE_/);
    assert.equal(readFileSync(join(root, 'strapi', '.env'), 'utf8'), before);
  }
});

test('never prints a value from either file', () => {
  const root = demo(INPUTS);
  const out = ['status', 'line', 'status', 'require-line', 'local', 'require-line'].map((command) => run([command], root).out).join('\n');
  for (const value of [SECRET, ...Object.values(INPUTS), 'mcp_client_test']) assert.ok(!out.includes(value), `printed ${value}`);
});
```

`scripts/line-tunnel.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { main as switchMode, writeEnv } from './line-mode.mjs';
import { checkTunnel, main } from './line-tunnel.mjs';

const SECRET = 'jwt-secret-that-must-never-print';
const INPUTS = 'LINE_MODE_LIFF_ID=1234567891-AbcdEfgh\nLINE_MODE_CHANNEL_ID=1234567891\nLINE_MODE_DOMAIN=maison-test.ngrok-free.dev\n';

/** A demo checkout switched to `mode` with the real mode script. */
const demo = (mode) => {
  const root = mkdtempSync(join(tmpdir(), 'maison-tunnel-'));
  mkdirSync(join(root, 'strapi'));
  mkdirSync(join(root, 'liff'));
  writeFileSync(join(root, 'strapi', '.env'), `PORT=1338\nJWT_SECRET=${SECRET}\nLINE_LOGIN_CHANNEL_ID=1234567890\nLINE_VERIFY_URL=http://127.0.0.1:4545/verify\n`, { mode: 0o600 });
  writeFileSync(join(root, 'liff', '.env'), `NEXT_PUBLIC_STRAPI_URL=http://localhost:1338\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_client_test\n${INPUTS}`, { mode: 0o600 });
  assert.equal(switchMode([mode], { root, log: () => {} }), 0);
  return root;
};

const servers = [];
after(() => servers.forEach((server) => server.close()));
const listen = async (handler) => {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return server.address().port;
};
/** A port nothing listens on. */
const freePort = async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};
/** The app on :3003, as the guard sees it: its X-Maison-Liff header, and the token endpoint it proxies to Strapi. */
const fakeApp = async ({ liff = 'line', token = [400, { error: 'invalid_grant' }] } = {}) => {
  const seen = [];
  const port = await listen((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (req.url === '/api/strapi-oauth-mcp-manager/oauth/token') {
      res.writeHead(token[0], { 'Content-Type': 'application/json', 'X-Maison-Liff': liff });
      return res.end(JSON.stringify(token[1]));
    }
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Maison-Liff': liff });
    res.end('<p>MAISON</p>');
  });
  return { appUrl: `http://127.0.0.1:${port}`, seen };
};

test('passes when LINE verifies ID tokens, the app is built for LINE, and the verify mock is off', async () => {
  const { appUrl, seen } = await fakeApp();
  assert.deepEqual(await checkTunnel({ root: demo('line'), appUrl, mockVerifyPort: await freePort() }), []);
  assert.ok(seen.includes('POST /api/strapi-oauth-mcp-manager/oauth/token'), 'probed the running Strapi through the app');
});

test('refuses while strapi/.env sets LINE_VERIFY_URL', async () => {
  const root = demo('line');
  writeEnv(join(root, 'strapi', '.env'), { LINE_VERIFY_URL: 'http://127.0.0.1:4545/verify' });
  const { appUrl } = await fakeApp();
  const problems = await checkTunnel({ root, appUrl, mockVerifyPort: await freePort() });
  assert.ok(problems.some((problem) => problem.startsWith('strapi/.env sets LINE_VERIFY_URL')), problems.join('\n'));
});

test('refuses in local mode, and while the app on :3003 is built for the LIFF mock', async () => {
  const { appUrl } = await fakeApp({ liff: 'mock' });
  const mockVerifyPort = await freePort();
  const local = await checkTunnel({ root: demo('local'), appUrl, mockVerifyPort });
  assert.ok(local.some((problem) => problem.includes('NEXT_PUBLIC_LIFF_MOCK (liff/.env)')), local.join('\n'));
  const built = await checkTunnel({ root: demo('line'), appUrl, mockVerifyPort });
  assert.ok(built.some((problem) => problem.includes('built for the LIFF mock')), built.join('\n'));
});

test("refuses while something answers on the verify mock's port, and doesn't probe Strapi then", async () => {
  const { appUrl, seen } = await fakeApp();
  const mockVerifyPort = await listen((_req, res) => res.end('{}'));
  const problems = await checkTunnel({ root: demo('line'), appUrl, mockVerifyPort });
  assert.ok(problems.some((problem) => problem.includes(`127.0.0.1:${mockVerifyPort}`)), problems.join('\n'));
  assert.ok(!seen.some((request) => request.includes('/oauth/token')), 'no forged token was sent');
});

test('refuses when the running Strapi accepts a forged ID token, or cannot check one', async () => {
  for (const [token, words] of [
    [[200, { access_token: 'mcp_at_forged', token_type: 'Bearer' }], 'accepted a forged'],
    [[503, { error: 'temporarily_unavailable' }], "couldn't check"],
    [[401, { error: 'invalid_client' }], 'npm run setup'],
  ]) {
    const { appUrl } = await fakeApp({ token });
    const problems = await checkTunnel({ root: demo('line'), appUrl, mockVerifyPort: await freePort() });
    assert.ok(problems.some((problem) => problem.includes(words)), `${words}: ${problems.join('\n')}`);
  }
});

test('a dry run starts no tunnel and never prints a value from either file', async () => {
  const lines = [];
  const started = [];
  const { appUrl } = await fakeApp();
  const code = await main(['--dry-run'], {
    root: demo('line'),
    appUrl,
    mockVerifyPort: await freePort(),
    log: (line) => lines.push(line),
    startNgrok: (args) => started.push(args),
  });
  assert.equal(code, 0);
  assert.deepEqual(started, []);
  const out = lines.join('\n');
  for (const value of [SECRET, '1234567891-AbcdEfgh', '1234567891', 'maison-test.ngrok-free.dev', 'mcp_client_test']) {
    assert.ok(!out.includes(value), `printed ${value}`);
  }
});

test('starts ngrok on your domain, with its traffic inspector off, once every check passes', async () => {
  const started = [];
  const { appUrl } = await fakeApp();
  const code = await main([], {
    root: demo('line'),
    appUrl,
    mockVerifyPort: await freePort(),
    log: () => {},
    startNgrok: async (args) => {
      started.push(args);
      return 0;
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(started, [['http', '127.0.0.1:3003', '--url=https://maison-test.ngrok-free.dev', '--inspect=false']]);
});
```

Run: `cd /Users/paul/work/maison-demo && node --test scripts/line-mode.test.mjs scripts/line-tunnel.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`: `Cannot find module '…/scripts/line-mode.mjs'`.

`scripts/line-mode.mjs`:

```js
// Switches how the demo signs customers in, by rewriting a few keys in strapi/.env and liff/.env:
//   local  the LIFF mock in the app, and the app's local stand-in for LINE's verify endpoint (the default, and the stage)
//   line   your own LIFF app inside LINE, with LINE verifying ID tokens, on one public https origin (your ngrok domain)
// LINE mode takes your values from liff/.env: LINE_MODE_LIFF_ID, LINE_MODE_CHANNEL_ID and LINE_MODE_DOMAIN.
// From the repo root: npm run mode (shows the mode), npm run mode:line, npm run mode:local.
// Restart Strapi and the app after a switch. Never prints a value from either file.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MOCK_CHANNEL_ID = '1234567890';

/** An env file's KEY=value lines ({} when it's missing). Quotes around a value are dropped. */
export const readEnv = (file) => {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
};

/** Sets KEY=value lines, adding the ones that are missing, and leaves the file readable by you only. */
export const writeEnv = (file, values) => {
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text)
      ? text.replace(pattern, () => `${key}=${value}`)
      : `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
  }
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600); // `mode` applies only when the file is created
};

/** LINE mode's values from liff/.env, and what's wrong with them (key names only). */
export const lineInputs = (liffEnv) => {
  const liffId = liffEnv.LINE_MODE_LIFF_ID ?? '';
  const channelId = liffEnv.LINE_MODE_CHANNEL_ID ?? '';
  const domain = liffEnv.LINE_MODE_DOMAIN ?? '';
  const problems = [];
  if (!/^\d+-[A-Za-z0-9]+$/.test(liffId)) {
    problems.push("LINE_MODE_LIFF_ID: your LIFF app's LIFF ID, like 1234567890-AbcdEfgh (the LIFF tab of your LINE Login channel)");
  }
  if (!/^\d+$/.test(channelId) || channelId === MOCK_CHANNEL_ID) {
    problems.push("LINE_MODE_CHANNEL_ID: your LINE Login channel's ID, digits only (its Basic settings tab)");
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    problems.push('LINE_MODE_DOMAIN: your ngrok domain, without https:// or a slash, like your-name.ngrok-free.dev');
  }
  const warnings =
    problems.length === 0 && !liffId.startsWith(`${channelId}-`)
      ? ["LINE_MODE_LIFF_ID doesn't start with LINE_MODE_CHANNEL_ID and a dash. A LIFF ID starts with its channel's ID: check that both come from the same channel."]
      : [];
  return { liffId, channelId, domain, problems, warnings };
};

/** What each mode sets in strapi/.env and liff/.env. */
const modeValues = (mode, strapiEnv, liffEnv) => {
  const strapiUrl = `http://localhost:${strapiEnv.PORT || 1338}`;
  if (mode === 'local') {
    return {
      strapi: {
        LINE_LOGIN_CHANNEL_ID: MOCK_CHANNEL_ID,
        LINE_VERIFY_URL: `http://127.0.0.1:${liffEnv.MOCK_LINE_VERIFY_PORT || 4545}/verify`,
        MAISON_LIFF_URL: 'http://localhost:3003',
        PUBLIC_URL: '',
      },
      liff: { NEXT_PUBLIC_LIFF_MOCK: 'true', NEXT_PUBLIC_LIFF_ID: '', NEXT_PUBLIC_STRAPI_URL: strapiUrl, STRAPI_URL: strapiUrl },
    };
  }
  const { liffId, channelId, domain } = lineInputs(liffEnv);
  return {
    // Strapi verifies ID tokens with LINE for your channel, and builds its public URLs (media, OAuth metadata) on the
    // app's origin, which proxies /mcp, the token endpoint and /uploads to it.
    strapi: { LINE_LOGIN_CHANNEL_ID: channelId, LINE_VERIFY_URL: '', MAISON_LIFF_URL: `https://liff.line.me/${liffId}`, PUBLIC_URL: `https://${domain}` },
    // The browser calls Strapi's paths on the app's own origin; the app's server reaches Strapi directly.
    liff: { NEXT_PUBLIC_LIFF_MOCK: 'false', NEXT_PUBLIC_LIFF_ID: liffId, NEXT_PUBLIC_STRAPI_URL: `https://${domain}`, STRAPI_URL: strapiUrl },
  };
};

/** The keys, as "KEY (file)", that aren't what `mode` sets. */
export const modeDifferences = (root, mode) => {
  const strapiEnv = readEnv(join(root, 'strapi', '.env'));
  const liffEnv = readEnv(join(root, 'liff', '.env'));
  const values = modeValues(mode, strapiEnv, liffEnv);
  return [
    ...Object.entries(values.strapi).filter(([key, value]) => (strapiEnv[key] ?? '') !== value).map(([key]) => `${key} (strapi/.env)`),
    ...Object.entries(values.liff).filter(([key, value]) => (liffEnv[key] ?? '') !== value).map(([key]) => `${key} (liff/.env)`),
  ];
};

/** 'line' when every key is LINE mode's; 'local' while Strapi trusts the verify mock and the app uses the LIFF mock. */
export const currentMode = (root) => {
  const strapiEnv = readEnv(join(root, 'strapi', '.env'));
  const liffEnv = readEnv(join(root, 'liff', '.env'));
  if (lineInputs(liffEnv).problems.length === 0 && modeDifferences(root, 'line').length === 0) return 'line';
  if (strapiEnv.LINE_VERIFY_URL && liffEnv.NEXT_PUBLIC_LIFF_MOCK !== 'false') return 'local';
  return 'mixed';
};

export const main = (args, { root = ROOT, log = console.log } = {}) => {
  const [command = 'status'] = args;
  const liffEnv = readEnv(join(root, 'liff', '.env'));
  const strapiEnv = readEnv(join(root, 'strapi', '.env'));
  const mode = currentMode(root);

  if (command === 'status' || command === 'require-line') {
    const label = { line: 'LINE (your LIFF app; LINE verifies ID tokens)', local: 'local (the LIFF mock and the verify mock)', mixed: 'mixed' }[mode];
    log(`Mode: ${label}.`);
    if (mode === 'mixed') log(`Not in LINE mode: ${modeDifferences(root, 'line').join(', ')}. Run npm run mode:line or npm run mode:local.`);
    if (command === 'require-line' && mode !== 'line') {
      log('This needs LINE mode: run npm run mode:line first.');
      return 1;
    }
    return 0;
  }
  if (command === 'line') {
    const { problems, warnings } = lineInputs(liffEnv);
    if (problems.length > 0) {
      log('Not switched. Set these in liff/.env first:');
      for (const problem of problems) log(`- ${problem}`);
      return 1;
    }
    for (const warning of warnings) log(`Warning: ${warning}`);
  }
  if (command !== 'line' && command !== 'local') {
    log('Usage: node scripts/line-mode.mjs status | line | local');
    return 1;
  }
  const values = modeValues(command, strapiEnv, liffEnv);
  writeEnv(join(root, 'strapi', '.env'), values.strapi);
  writeEnv(join(root, 'liff', '.env'), values.liff);
  if (command === 'line') {
    log('LINE mode: strapi/.env and liff/.env now use LINE_MODE_LIFF_ID, LINE_MODE_CHANNEL_ID and LINE_MODE_DOMAIN (liff/.env).');
    log('Next: restart Strapi, start the app with `npm run start:line` (not `npm run dev`), then `npm run tunnel`.');
  } else {
    log('Local mode: strapi/.env and liff/.env use the LIFF mock and the local LINE verify mock again.');
    log('Next: stop the tunnel and the LINE-mode app, then restart Strapi and start the app with `npm run dev`.');
  }
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
```

`scripts/line-tunnel.mjs`:

```js
// Opens LINE mode's one public https origin: ngrok from your domain (LINE_MODE_DOMAIN in liff/.env) to the app on
// 127.0.0.1:3003. It refuses unless the demo is safely in LINE mode, because with the local verify mock behind the tunnel
// anyone on the internet could sign in as any customer. It checks that:
//   - strapi/.env has no LINE_VERIFY_URL, and both .env files are in LINE mode (npm run mode:line)
//   - nothing answers on the verify mock's port, 127.0.0.1:4545 (`npm run dev` starts the mock; LINE mode uses
//     `npm run start:line`, which doesn't)
//   - the app on :3003 was built for LINE, not the LIFF mock (its X-Maison-Liff header)
//   - the running Strapi, reached through the app, refuses a forged ID token: LINE checks it (400 invalid_grant)
// Only the app is exposed: it proxies Strapi's /mcp, token endpoint and /uploads, and Strapi's admin stays here.
// ngrok runs with --inspect=false, so its local inspector (:4040) keeps no copy of customers' tokens.
// From the repo root: npm run tunnel, or `npm run tunnel -- --dry-run` for the checks alone. Prints no .env value.
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { lineInputs, modeDifferences, readEnv } from './line-mode.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The app listens on this machine only; ngrok connects to it here, so phones reach it only through the tunnel.
const APP = '127.0.0.1:3003';

/** Whether anything accepts a TCP connection on 127.0.0.1:port within a second. */
const answers = (port) =>
  new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1000, () => done(false));
  });

/** Everything that stands in the way of a safe tunnel, in words, without values. An empty list means go. */
export const checkTunnel = async ({ root = ROOT, appUrl = `http://${APP}`, mockVerifyPort } = {}) => {
  const strapiEnv = readEnv(join(root, 'strapi', '.env'));
  const liffEnv = readEnv(join(root, 'liff', '.env'));
  const problems = [];
  if (strapiEnv.LINE_VERIFY_URL) {
    problems.push("strapi/.env sets LINE_VERIFY_URL, so Strapi would trust the local mock's ID tokens. Run npm run mode:line, then restart Strapi.");
  }
  const inputs = lineInputs(liffEnv);
  if (inputs.problems.length > 0) problems.push(`Set your LINE values in liff/.env: ${inputs.problems.join('; ')}.`);
  const differences = modeDifferences(root, 'line').filter((key) => !key.startsWith('LINE_VERIFY_URL'));
  if (inputs.problems.length === 0 && differences.length > 0) {
    problems.push(`Not in LINE mode: ${differences.join(', ')}. Run npm run mode:line, then restart Strapi and the app.`);
  }

  const port = Number(mockVerifyPort ?? (liffEnv.MOCK_LINE_VERIFY_PORT || 4545));
  const mockRunning = await answers(port);
  if (mockRunning) {
    problems.push(`Something answers on 127.0.0.1:${port}, the LINE verify mock's port. Stop the app's dev server (npm run dev starts the mock); LINE mode runs npm run start:line.`);
  }

  let liff = null;
  try {
    liff = (await fetch(`${appUrl}/`, { signal: AbortSignal.timeout(10_000) })).headers.get('x-maison-liff') ?? 'unknown';
  } catch {
    problems.push(`The app isn't answering on ${appUrl}. Start it with npm run start:line.`);
  }
  if (liff !== null && liff !== 'line') {
    problems.push(`The app on ${appUrl} was built for the LIFF mock (X-Maison-Liff: ${liff}). Stop it, and start it with npm run start:line.`);
  }

  // Last, and only once nothing else is wrong: a forged ID token, through the app, to the running Strapi.
  if (problems.length === 0) {
    let status = 0;
    let error = '';
    try {
      const response = await fetch(`${appUrl}/api/strapi-oauth-mcp-manager/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          client_id: liffEnv.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '',
          subject_token: `valid.U${'0'.repeat(32)}`, // what the verify mock accepts, and LINE refuses
          subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        }),
        signal: AbortSignal.timeout(20_000),
      });
      status = response.status;
      error = (await response.json().catch(() => ({}))).error ?? '';
    } catch {
      error = 'unreachable';
    }
    if (status >= 200 && status < 300) {
      problems.push('Strapi accepted a forged ID token: it still verifies against a mock. Restart Strapi after npm run mode:line, and stop anything on the mock\'s port.');
    } else if (status === 400 && error === 'invalid_grant') {
      // LINE refused it: the answer we want.
    } else if (error === 'temporarily_unavailable') {
      problems.push("Strapi couldn't check an ID token with its verify endpoint. Restart Strapi after npm run mode:line (it may still point at the stopped mock), and check that this laptop is online.");
    } else if (error === 'invalid_client' || error === 'unauthorized_client') {
      problems.push("Strapi doesn't accept the app's OAuth client for LINE sign-in. Run npm run setup, then restart the app (npm run start:line).");
    } else {
      problems.push(`The token endpoint answered ${status || 'nothing'}${error ? ` (${error})` : ''} through the app. Check that Strapi is running on STRAPI_URL (liff/.env).`);
    }
  }
  return problems;
};

const runNgrok = (args) =>
  new Promise((resolve) => {
    const child = spawn('ngrok', args, { stdio: 'inherit' });
    child.once('error', () => {
      console.error('ngrok isn\'t installed, or not on your PATH: https://ngrok.com/download, then `ngrok config add-authtoken`.');
      resolve(1);
    });
    child.once('exit', (code) => resolve(code ?? 0));
  });

export const main = async (args, { root = ROOT, appUrl, mockVerifyPort, log = console.log, startNgrok = runNgrok } = {}) => {
  const problems = await checkTunnel({ root, appUrl, mockVerifyPort });
  if (problems.length > 0) {
    log('No tunnel. Fix these first:');
    for (const problem of problems) log(`- ${problem}`);
    return 1;
  }
  log('Safe to open: LINE verifies ID tokens, the app is built for LINE, and the verify mock is off.');
  if (args.includes('--dry-run')) {
    log('Dry run: ngrok not started.');
    return 0;
  }
  const { domain } = lineInputs(readEnv(join(root, 'liff', '.env')));
  log(`Starting ngrok on LINE_MODE_DOMAIN (liff/.env) for the app on ${APP}. Ctrl-C stops it.`);
  return startNgrok(['http', APP, `--url=https://${domain}`, '--inspect=false']);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
```

The root `package.json`, replacing Task 8's:

```json
{
  "name": "maison-demo",
  "version": "0.1.0",
  "private": true,
  "description": "From UX to AX: one set of Strapi MCP tools serving a LINE app, a customer's agent and an ops agent.",
  "engines": {
    "node": ">=22.9.0"
  },
  "scripts": {
    "postinstall": "npm install --prefix strapi && npm install --prefix liff && node scripts/init-env.mjs",
    "dev": "concurrently -k -n strapi,app -c magenta,green \"npm run develop --prefix strapi\" \"npm run dev --prefix liff\"",
    "dev:strapi": "npm run develop --prefix strapi",
    "dev:app": "npm run dev --prefix liff",
    "setup": "node --env-file=strapi/.env strapi/scripts/maison-setup.mjs",
    "mode": "node scripts/line-mode.mjs status",
    "mode:line": "node scripts/line-mode.mjs line",
    "mode:local": "node scripts/line-mode.mjs local",
    "start:line": "npm run start:line --prefix liff",
    "tunnel": "node scripts/line-tunnel.mjs",
    "test": "npm test --prefix liff && npm test --prefix strapi/src/plugins/maison && node strapi/scripts/share-strapi-utils.mjs --check && node --test scripts/line-mode.test.mjs scripts/line-tunnel.test.mjs",
    "test:e2e": "npm run test:e2e --prefix liff",
    "test:live": "npm run test:live --prefix liff"
  },
  "devDependencies": {
    "concurrently": "^9.2.1"
  }
}
```

Only scripts change, so there's nothing to install: the lockfile stays as it is.

```bash
cd /Users/paul/work/maison-demo
node --test scripts/line-mode.test.mjs scripts/line-tunnel.test.mjs
npm run mode
npm run tunnel -- --dry-run; echo "exit $?"
npm test
```

Expected:
- **The tests:** `tests 10` and `pass 10` (after `ℹ` on Node 24, after `#` on Node 22). They use temporary folders and free ports, start no ngrok, and never touch the demo's own `.env` files.
- **`npm run mode`:** `Mode: local (the LIFF mock and the verify mock).`
- **`npm run tunnel -- --dry-run`** refuses, with `exit 1`. It reads the running `demo-app` (an answer from 127.0.0.1:3003, and a connection to 127.0.0.1:4545) and changes nothing:

  ```
  No tunnel. Fix these first:
  - strapi/.env sets LINE_VERIFY_URL, so Strapi would trust the local mock's ID tokens. Run npm run mode:line, then restart Strapi.
  - Set your LINE values in liff/.env: LINE_MODE_LIFF_ID: …; LINE_MODE_CHANNEL_ID: …; LINE_MODE_DOMAIN: ….
  - Something answers on 127.0.0.1:4545, the LINE verify mock's port. Stop the app's dev server (npm run dev starts the mock); LINE mode runs npm run start:line.
  - The app on http://127.0.0.1:3003 was built for the LIFF mock (X-Maison-Liff: mock). Stop it, and start it with npm run start:line.
  ```

  If Paul has already added his values (Step 8), the second line reads `Not in LINE mode: LINE_LOGIN_CHANNEL_ID (strapi/.env), MAISON_LIFF_URL (strapi/.env), PUBLIC_URL (strapi/.env), NEXT_PUBLIC_LIFF_MOCK (liff/.env), NEXT_PUBLIC_LIFF_ID (liff/.env), NEXT_PUBLIC_STRAPI_URL (liff/.env). Run npm run mode:line, then restart Strapi and the app.` instead.
- **`npm test`:** the app's 39, Maison's 171, the `@strapi/utils` check, and the scripts' 10.

- [ ] **Step 5: The setup script in LINE mode**

This modifies Task 2's `strapi/scripts/maison-setup.mjs`. Replace:

```js
  if (!overview.lineSignIn?.configured) throw new Error('Set LINE_LOGIN_CHANNEL_ID in strapi/.env, then restart Strapi.');
```

with:

```js
  if (!overview.lineSignIn?.configured) throw new Error('Set LINE_LOGIN_CHANNEL_ID in strapi/.env, then restart Strapi.');
  // npm run mode:line and npm run mode:local switch the channel in strapi/.env, and Strapi reads it when it starts.
  if (overview.lineSignIn.channelId !== process.env.LINE_LOGIN_CHANNEL_ID) {
    throw new Error('Strapi signs customers in with another LINE channel than strapi/.env names. Restart Strapi.');
  }
  const lineMode = process.env.LINE_LOGIN_CHANNEL_ID !== '1234567890';
  console.log(lineMode ? 'LINE sign-in: your LINE Login channel (LINE mode).' : 'LINE sign-in: the LIFF mock (local mode).');
```

and replace:

```js
  writeEnv(join(root, 'liff', '.env'), { NEXT_PUBLIC_STRAPI_URL: STRAPI_URL, NEXT_PUBLIC_MAISON_CLIENT_ID: app.clientId });
```

with:

```js
  // In LINE mode the browser reaches Strapi through the app's own public origin, PUBLIC_URL, which proxies it.
  writeEnv(join(root, 'liff', '.env'), {
    NEXT_PUBLIC_STRAPI_URL: process.env.PUBLIC_URL || STRAPI_URL,
    NEXT_PUBLIC_MAISON_CLIENT_ID: app.clientId,
  });
```

```bash
cd /Users/paul/work/maison-demo
npm run setup
```

Expected, with `demo-strapi` running in local mode:

```
Setting up the Maison demo on http://localhost:1338.
LINE sign-in: the LIFF mock (local mode).
Demo catalog already loaded.
Created the "Maison app" client … and wrote it to liff/.env (restart the app to pick it up).
Wrote the "Maison ops" token to strapi/.tmp/maison-ops-token (README: "Claude Desktop, the ops agent").
```

Then ask the controller to restart `demo-app`, which reads the new client ID at start. Go on without waiting. The run also mints a new ops token, so Claude Desktop's config (Task 10, Step 2) is set after this task. Checked on 30 September against a stand-in for Strapi: with the channel switched in strapi/.env and Strapi not restarted, the script stops at `Setup failed: Strapi signs customers in with another LINE channel than strapi/.env names. Restart Strapi.` and changes nothing.

- [ ] **Step 6: The channel icon, to LINE's MINI App icon spec**

LINE's spec ([LINE MINI App icon specifications and guidelines](https://developers.line.biz/en/docs/line-mini-app/design/line-mini-app-icon/)):
- a 130×130 px background
- a logo of 54–90 px, 54–76 px recommended, designed as a stand-alone icon or wordmark
- PNG or JPEG, without the LINE MINI App logo

The channel icon also appears on the consent screen of Paul's LINE Login channel.

`liff/scripts/render-channel-icon.mjs`:

```js
// Draws the Maison channel icon to LINE's MINI App icon spec
// (https://developers.line.biz/en/docs/line-mini-app/design/line-mini-app-icon/): a 130×130 px PNG background with a
// stand-alone logo, a gold "M" in the app's Cormorant Garamond, sized within LINE's recommended 54–76 px. Upload
// line/channel-icon.png as the Channel icon of a LINE Login or LINE MINI App channel (Basic settings).
// Run from liff/ after `npx playwright install chromium`: node scripts/render-channel-icon.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SIZE = 130; // LINE's background size (BG SIZE)
const LOGO = 70; // the logo's longer side, in px
const font = readFileSync(
  new URL('../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2', import.meta.url)
).toString('base64');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const { png, logo } = await page.evaluate(
    async ({ font, SIZE, LOGO }) => {
      const face = new FontFace('Cormorant Garamond', `url(data:font/woff2;base64,${font})`, { weight: '600' });
      document.fonts.add(await face.load());
      const canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1c1c1c'; // ink
      ctx.fillRect(0, 0, SIZE, SIZE);
      // Size the font so the M's ink is LOGO px on its longer side, then center the ink rather than the em box.
      ctx.font = '600 100px "Cormorant Garamond"';
      const probe = ctx.measureText('M');
      const probeSide = Math.max(
        probe.actualBoundingBoxLeft + probe.actualBoundingBoxRight,
        probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent
      );
      ctx.font = `600 ${(100 * LOGO) / probeSide}px "Cormorant Garamond"`;
      const m = ctx.measureText('M');
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      ctx.fillStyle = '#b89b5e'; // gold
      ctx.fillText('M', (SIZE - inkWidth) / 2 + m.actualBoundingBoxLeft, (SIZE - inkHeight) / 2 + m.actualBoundingBoxAscent);
      // Measure what was drawn: the box around every pixel that isn't the background.
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
      let [left, top, right, bottom] = [SIZE, SIZE, -1, -1];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          if (Math.abs(data[i] - 0x1c) + Math.abs(data[i + 1] - 0x1c) + Math.abs(data[i + 2] - 0x1c) > 24) {
            [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
          }
        }
      }
      return {
        png: canvas.toDataURL('image/png').split(',')[1],
        logo: { width: right - left + 1, height: bottom - top + 1, left, top, right: SIZE - 1 - right, bottom: SIZE - 1 - bottom },
      };
    },
    { font, SIZE, LOGO }
  );
  const outside = [logo.width, logo.height].some((side) => side < 54 || side > 76);
  if (outside) throw new Error(`The logo is ${logo.width}×${logo.height} px; LINE recommends 54–76 px. Change LOGO.`);
  mkdirSync('line', { recursive: true });
  writeFileSync('line/channel-icon.png', Buffer.from(png, 'base64'));
  console.log(
    `Wrote line/channel-icon.png: ${SIZE}×${SIZE} px, logo ${logo.width}×${logo.height} px, margins ${logo.left}/${logo.top}/${logo.right}/${logo.bottom} px (LINE: 54–90 px, 54–76 recommended).`
  );
} finally {
  await browser.close();
}
```

```bash
cd /Users/paul/work/maison-demo/liff
node scripts/render-channel-icon.mjs
file line/channel-icon.png
```

Expected:
- `Wrote line/channel-icon.png: 130×130 px, logo 72×56 px, margins 29/36/29/38 px (LINE: 54–90 px, 54–76 recommended).` Another Chromium build may differ by a pixel. The script refuses a logo outside 54–76 px.
- `line/channel-icon.png: PNG image data, 130 x 130, 8-bit/color RGBA, non-interlaced`
- The icon is a gold serif M on ink. Open the PNG to look at it.

- [ ] **Step 7: Commit**

```bash
cd /Users/paul/work/maison-demo
git add scripts/line-mode.mjs scripts/line-mode.test.mjs scripts/line-tunnel.mjs scripts/line-tunnel.test.mjs package.json \
  liff/lib/strapi-proxy.ts liff/lib/strapi-proxy.test.ts liff/lib/tunnel.ts liff/lib/tunnel.test.ts liff/lib/liff.test.ts \
  liff/lib/liff.ts liff/lib/session.ts liff/lib/mcp.ts liff/app/mcp liff/app/api/strapi-oauth-mcp-manager liff/app/uploads \
  liff/app/concierge/page.tsx liff/next.config.mjs liff/package.json liff/.env.example \
  liff/scripts/check-strapi-proxy.mjs liff/scripts/render-channel-icon.mjs liff/line/channel-icon.png \
  strapi/scripts/maison-setup.mjs
git diff --cached --name-only | grep -E '(^|/)\.env$|(^|/)node_modules/|(^|/)\.next/|(^|/)dist/|(^|/)\.tmp/|\.db$'; echo "(nothing above: no secrets, dependencies or build output)"
node --env-file-if-exists=liff/.env --input-type=module -e "
import { execSync } from 'node:child_process';
const staged = execSync('git diff --cached', { encoding: 'utf8', maxBuffer: 1 << 28 });
const values = ['LINE_MODE_LIFF_ID', 'LINE_MODE_CHANNEL_ID', 'LINE_MODE_DOMAIN'].map((key) => process.env[key]).filter(Boolean);
console.log('LINE values in the staged diff:', values.filter((value) => staged.includes(value)).length);
"
git commit -m "feat: run the app inside LINE, through one tunnel" -m "The app proxies Strapi's /mcp, token endpoint and /uploads, so a phone needs only the app's origin and Strapi's admin stays local. npm run mode:line and mode:local switch the two .env files; npm run tunnel refuses while the verify mock or the LIFF mock could sign anyone in. LIFF signs in again the way LINE documents, and the channel icon follows LINE's MINI App spec." -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

Expected: nothing listed by the `grep`, `LINE values in the staged diff: 0` (it counts, and prints no value), and the commit.

- [ ] **Step 8 (Paul): Your LINE Login channel and LIFF app**

Nobody else signs in to the LINE Developers Console. Some of this may be done already: tick what is.
1. Link your LINE Developers account (Business ID) to your LINE account, or LINE won't let you sign in to a channel in Developing.
2. In the [LINE Developers Console](https://developers.line.biz/console/): a provider, and a LINE Login channel named, for example, Maison, with app type Web app. Leave it in **Developing**.
3. **Basic settings → Channel icon:** upload `liff/line/channel-icon.png` (Step 6).
4. **LIFF → Add:**
   - LIFF app name: Maison, with no "LINE" in it
   - Size: Full
   - Endpoint URL: `https://<your ngrok domain>/`
   - Scopes: `openid` and `profile`
   - Add friend option: Off
5. In `liff/.env`, in your editor, add three lines with your values:

   ```
   LINE_MODE_LIFF_ID=<the LIFF ID from the LIFF tab>
   LINE_MODE_CHANNEL_ID=<the channel ID from Basic settings, digits only>
   LINE_MODE_DOMAIN=<your ngrok domain, without https:// or a slash>
   ```

**Controller:** check them without printing them:

```bash
cd /Users/paul/work/maison-demo
node --env-file=liff/.env -e "console.log(['LINE_MODE_LIFF_ID', 'LINE_MODE_CHANNEL_ID', 'LINE_MODE_DOMAIN'].map((key) => key + ': ' + (process.env[key] ? 'set' : 'missing')).join(', '))"
```

Expected: `LINE_MODE_LIFF_ID: set, LINE_MODE_CHANNEL_ID: set, LINE_MODE_DOMAIN: set`.

- [ ] **Step 9 (Controller): Switch to LINE mode, and start the LINE build**

```bash
cd /Users/paul/work/maison-demo
npm run mode:line
```

Expected:

```
LINE mode: strapi/.env and liff/.env now use LINE_MODE_LIFF_ID, LINE_MODE_CHANNEL_ID and LINE_MODE_DOMAIN (liff/.env).
Next: restart Strapi, start the app with `npm run start:line` (not `npm run dev`), then `npm run tunnel`.
```

If it says `Not switched` instead, it names the key in `liff/.env` to fix (Step 8). A `Warning: LINE_MODE_LIFF_ID doesn't start with LINE_MODE_CHANNEL_ID …` means the two values come from different channels: ask Paul.

Then:
1. Restart `demo-strapi`. Strapi reads the channel when it starts, and doesn't restart on `.env` changes. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:1338/_health` answers `204`.
2. Run `npm run setup`. Expected: its usual lines, with `LINE sign-in: your LINE Login channel (LINE mode).` second.
3. Stop `demo-app`. It holds 3003 and runs the verify mock.
4. Add this configuration to `.claude/launch.json`, and start it. It builds for about a minute, then serves on 3003:

   ```json
   {
     "name": "demo-app-line",
     "runtimeExecutable": "/bin/bash",
     "runtimeArgs": [
       "-c",
       "export PATH=/Users/paul/.nvm/versions/node/v24.16.0/bin:$PATH && cd /Users/paul/work/maison-demo/liff && exec npm run start:line"
     ],
     "port": 3003
   }
   ```

5. Run `npm run mode`, and `lsof -nP -iTCP:3003 -sTCP:LISTEN`. Expected: `Mode: LINE (your LIFF app; LINE verifies ID tokens).`, and a `node` listener on `127.0.0.1:3003` only.
6. Run `npm run tunnel -- --dry-run`. It needs the internet: it sends LINE a forged token. Expected:

   ```
   Safe to open: LINE verifies ID tokens, the app is built for LINE, and the verify mock is off.
   Dry run: ngrok not started.
   ```

   Otherwise, fix what it names. It prints no value.

The app's in-browser checks stop here: outside LINE, the LINE-mode build sends the browser to LINE Login, and only Paul signs in to LINE.

- [ ] **Step 10 (Paul): Open the tunnel**

Only Paul runs ngrok. It uses his account, and its config holds his authtoken, which nobody reads.

```bash
cd /Users/paul/work/maison-demo
npm run tunnel
```

Expected:
- `Safe to open: …`, then `Starting ngrok on LINE_MODE_DOMAIN (liff/.env) for the app on 127.0.0.1:3003. Ctrl-C stops it.`
- ngrok's own screen: `Session Status  online`, and `Forwarding` from your domain to `http://127.0.0.1:3003`. That screen is the only place your domain is shown.

Leave it running, and tell the controller.

- [ ] **Step 11 (Controller): Check the public origin**

Run this only after Paul has started the tunnel. It runs from the laptop, with a non-browser User-Agent, so ngrok's warning page doesn't apply. It prints no value:

```bash
cd /Users/paul/work/maison-demo
UPLOAD=$(ls strapi/public/uploads | grep -vE '^\.' | head -1)
node --env-file=liff/.env --input-type=module -e "
const base = 'https://' + process.env.LINE_MODE_DOMAIN;
const send = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init, headers: { 'User-Agent': 'maison-check/1.0', ...init.headers } });
const home = await send('/');
console.log('app', home.status, home.headers.get('x-maison-liff'));
const forged = await send('/api/strapi-oauth-mcp-manager/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', client_id: process.env.NEXT_PUBLIC_MAISON_CLIENT_ID, subject_token: 'valid.U' + '0'.repeat(32), subject_token_type: 'urn:ietf:params:oauth:token-type:id_token' }),
});
console.log('forged ID token', forged.status, (await forged.json()).error);
const mcp = await send('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
console.log('mcp without a session', mcp.status, '| resource metadata on the public origin:', (mcp.headers.get('www-authenticate') ?? '').includes('resource_metadata=\"' + base + '/.well-known/'));
const image = await send('/uploads/' + process.argv[1]);
console.log('image', image.status, (image.headers.get('content-type') ?? '').split('/')[0]);
for (const [method, path] of [['GET', '/admin'], ['GET', '/admin/init'], ['GET', '/_health'], ['GET', '/api/strapi-oauth-mcp-manager/oauth/authorize'], ['POST', '/api/strapi-oauth-mcp-manager/oauth/register'], ['GET', '/.well-known/oauth-authorization-server'], ['GET', '/content-manager/collection-types/plugin::maison.appointment']]) {
  console.log(method, path, (await send(path, { method })).status);
}
" "$UPLOAD"
```

Expected:

```
app 200 line
forged ID token 400 invalid_grant
mcp without a session 401 | resource metadata on the public origin: true
image 200 image
GET /admin 404
GET /admin/init 404
GET /_health 404
GET /api/strapi-oauth-mcp-manager/oauth/authorize 404
POST /api/strapi-oauth-mcp-manager/oauth/register 404
GET /.well-known/oauth-authorization-server 404
GET /content-manager/collection-types/plugin::maison.appointment 404
```

The `true` shows that Strapi builds its public URLs on the app's origin. Maison's media URLs come from the same `server.url`.

- [ ] **Step 12 (Paul): On your phone, inside LINE**

1. In LINE, send yourself `https://liff.line.me/<your LIFF ID>`, in a chat or in Keep memo, and tap it.
2. The first time only:
   - ngrok's free plan may show "You are about to visit …": tap **Visit Site**. ngrok remembers it for 7 days. If the app then shows an error, close it and tap the link again.
   - LINE asks you to allow Maison, with the channel's icon and name: allow it.
3. Expected:
   - LINE's loading icon, then the three collections, with images. LINE's header shows "Maison" and your domain.
   - **Voyage → Weekender 50 → 来店を予約:** Ginza, next Saturday, 14:00. Send. "ご来店予約" lists the visit as "ブティックの確認待ち".
   - **On the laptop,** in the Strapi admin (`http://localhost:1338/admin` → Maison, "All requests"): the request appears within 5 seconds, created via `app`, with your LINE user ID masked.
   - **Landscape:** the app fills the screen, clear of the notch, with nothing cut off. Turn the phone back.
   - **エージェントビュー** lists the tool calls.
   - **A deep link:** close the app, and tap `https://liff.line.me/<your LIFF ID>/visits`. It opens on "ご来店予約": LIFF passes the path on, as the LINE confirmation's button will.
4. **Optional, an hour later:** open the app again and browse. Expected: at most one reload, then the screens load. An ID token lasts an hour, and the app signs in again.
5. Stop the tunnel with Ctrl-C, and tell the controller.

- [ ] **Step 13 (Controller): Back to the stage setup**

After Paul has stopped the tunnel:

```bash
cd /Users/paul/work/maison-demo
npm run mode:local
```

Expected: `Local mode: strapi/.env and liff/.env use the LIFF mock and the local LINE verify mock again.` and the next-steps line. Then:
1. Stop `demo-app-line`, restart `demo-strapi` (`_health` answers 204), and start `demo-app`.
2. Run `npm run mode`. Expected: `Mode: local (the LIFF mock and the verify mock).`
3. Run `npm run tunnel -- --dry-run; echo "exit $?"`. Expected: `exit 1`, after the four reasons in Step 4: the `LINE_VERIFY_URL` line, `Not in LINE mode: …`, the mock on 127.0.0.1:4545, and the app built for the LIFF mock. The guard refuses the stage setup.
4. Run `npm test`. Expected: the app's 39, Maison's 171, the `@strapi/utils` check, and the scripts' 10.
5. In the preview browser, `http://localhost:3003` signs in with the mock and shows the collections.

Paul's LINE values stay in `liff/.env` for next time. `npm run mode:line` brings LINE mode back.

---

### Task 10: README, ops agent, rehearsal, backup video, and publishing the repo

**Files:**
- Modify: `README.md` (replaces Task 1's stub): the quick start for others, and the runbook

**Interfaces:**
- Consumes:
  - `strapi/.tmp/maison-ops-token` (Task 2)
  - the tools `pending_confirmations` and `record_confirmation`, and the `send_pending_confirmations` prompt (Maison)
  - the Maison board
  - LINE mode (Task 9): `npm run mode`, `mode:line`, `mode:local`, `start:line` and `tunnel`, and `liff/line/channel-icon.png`
- Produces:
  - the README: the quick start, the repo's layout, models, the runbook (setup, the 3-minute run, fallbacks, the backup video), options A and B (B is the app inside LINE), the QBurst handoff with "Run it as a LINE MINI App", tests, the Maison plugin's copy, and production notes
  - a rehearsed demo and a recorded backup
  - `PaulBratslavsky/maison-demo` on GitHub, public, when Paul says so

The flow on stage shows agents working with the same data through MCP, with a person in the loop:
1. **The customer** asks the concierge and books in the Maison app.
2. **Staff** see the request on the Maison board (filter "All requests"), and confirm it there.
3. **The ops agent** in Claude Desktop runs `send_pending_confirmations`.
   - **Default:** it stops at the ready-made LINE message.
   - **Option A:** a real LINE message reaches Paul's phone.

**Stop points:** the implementer's part is Steps 1, 6 and Step 7's commit. Steps 2–5 are Paul's (Claude Desktop, the checks in the admin, the rehearsal and the video), and publishing waits for him.

- [ ] **Step 1: Write `README.md`**

Replace `MAISON_COMMIT` with the commit named in Task 1's commit message (`git log --format=%B -1 $(git rev-list --max-parents=0 HEAD)`).

````markdown
# Maison: from UX to AX with Strapi MCP

A fictional luxury house whose catalog and appointments are served to people and agents through Strapi's built-in MCP server, with LINE as the customer's identity and messaging channel:
- **UX:** catalog screens in an app built for LINE (a LIFF app)
- **AX for the customer:** a concierge that acts for the signed-in customer, through the same tools
- **The human gate:** staff confirm requests on the Maison board in the Strapi admin
- **AX for operations:** an ops agent in Claude Desktop that prepares, and can send, the customer's LINE confirmation

LINE sign-in is simulated with LINE's official LIFF mock and a local stand-in for LINE's ID token verify endpoint. Everything else is the production path. The same app also runs inside LINE on your own LIFF app, through one tunnel (option B, tested). It follows LINE's MINI App design guidelines, so QBurst can run it as a LINE MINI App. The demo was built for "Building the AI-Powered Connected Experience" (QBurst and LY Corporation, Tokyo, 7 October 2026), where QBurst presents the LINE MINI App side (see "Handoff").

## Quick start

You need Node.js 22.9 or later, and npm. For the concierge, either Ollama with `qwen3-14b-32k`, or an Anthropic API key (see "Models").

```bash
git clone https://github.com/PaulBratslavsky/maison-demo.git
cd maison-demo
npm install   # installs strapi/ and liff/, builds the Maison plugin, creates both .env files with fresh secrets
npm run dev   # Strapi on :1338, the app on :3003 and the LINE verify mock on :4545, all on 127.0.0.1
```

The first start builds Strapi's admin, which takes a minute. Then, in a second terminal:

```bash
npm run setup   # the demo admin, the catalog, the tokens and the app's OAuth client
```

Stop `npm run dev` (Ctrl-C) and start it again, so the app picks up its OAuth client. Then open:
- **The app:** http://localhost:3003. It signs in a demo customer with the LIFF mock.
- **The Strapi admin:** http://localhost:1338/admin, then **Maison** for the requests board. Sign in with `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD`: open `strapi/.env` in your editor to read them. `npm install` generated the password for your copy, and nothing prints it.

The ports are the demo's own, so it runs next to a Strapi on 1337. `npm run dev:strapi` and `npm run dev:app` start the two halves separately. Everything listens on this machine only: to use the app from a phone, see option B.

## What's in the repo

| Path | What it is |
|---|---|
| `strapi/` | A Strapi 5.55.1 app (TypeScript, SQLite), made with `create-strapi` |
| `strapi/src/plugins/maison/` | The Maison plugin: content types, ten MCP tools and a prompt, the requests board, and the demo catalog. A local plugin, copied from [strapi-store-demo-mcp](https://github.com/PaulBratslavsky/strapi-store-demo-mcp) |
| `strapi-oauth-mcp-manager` | From npm: OAuth for Strapi's MCP server, with customer sign-in by LINE ID token exchange |
| `strapi/src/extensions/maison/` | Keeps customers' LINE user IDs out of admin API responses and the list search |
| `strapi/scripts/maison-setup.mjs` | `npm run setup` |
| `liff/` | The Maison app: Next.js 16, LIFF and the LIFF mock, the MCP SDK, and the concierge on AI SDK 7 |
| `liff/scripts/mock-line-verify.mjs` | The local stand-in for LINE's verify endpoint |
| `scripts/init-env.mjs` | Creates the two `.env` files on `npm install` |
| `scripts/line-mode.mjs`, `scripts/line-tunnel.mjs` | Option B: `npm run mode:line` and `mode:local` switch both `.env` files, and `npm run tunnel` refuses an unsafe tunnel |
| `liff/lib/strapi-proxy.ts` and its routes (`liff/app/mcp`, `liff/app/uploads`, `liff/app/api/strapi-oauth-mcp-manager`) | Option B: Strapi's `/mcp`, token endpoint and `/uploads` on the app's own origin |
| `liff/line/channel-icon.png` | The channel icon, to LINE's MINI App icon spec |
| `liff/public/line/LINE_spinner_light.svg` | LINE's loading icon: LINE's own file, from its MINI App design guidelines |

Two things are set up on purpose:
- **One Strapi version.** `strapi/package.json` holds eight `@strapi` packages at 5.55.1 with `overrides`. Without them, npm resolves Strapi's own `^5.0.0` peer ranges to a newer release, and a second copy of `@strapi/utils` turns Maison's 400s into 500s. (oauth-mcp-manager 1.1.0 never loads `@strapi/utils`.)
- **Maison shares Strapi's `@strapi/utils`.** Maison is a local plugin with its own dependencies, so its build would load its own copy. `strapi/scripts/share-strapi-utils.mjs` removes that copy after the build, on every `npm install` in `strapi/`, and `npm test` checks it.

## Models

The concierge uses a local model unless it has a key. Keys go in `liff/.env`; restart the app after changing it.

| Key in `liff/.env` | Model |
|---|---|
| none (the default) | `qwen3-14b-32k` on Ollama at `http://localhost:11434/v1` (`OLLAMA_MODEL`, `OLLAMA_BASE_URL`) |
| `ANTHROPIC_API_KEY` | Claude Sonnet 5 |
| `AI_GATEWAY_API_KEY` | Claude Sonnet 5, through Vercel AI Gateway |

- **The local model** is Qwen3 14B with a 32k context: `ollama pull qwen3:14b`, then `ollama create qwen3-14b-32k -f Modelfile` with a `Modelfile` of `FROM qwen3:14b` and `PARAMETER num_ctx 32768`. Any Ollama model that calls tools works through `OLLAMA_MODEL`.
- **Qwen3 is slower:** about 20–60 seconds a turn, where Claude takes seconds.
- **When the model can't be reached,** the concierge says which one, and how to fix it.
- **Strapi runs no model.** The ops agent is Claude Desktop, on your own Claude account, and needs the internet.

## Running the talk demo

### One-time setup

1. **The quick start** above: `npm install`, `npm run dev`, `npm run setup`, and restart.
2. **The concierge's model:** `ANTHROPIC_API_KEY` in `liff/.env` for Claude, then restart the app. Without it, start Ollama.
3. **Claude Desktop (the ops agent).** Add the `maison-ops` server to `~/Library/Application Support/Claude/claude_desktop_config.json`, then quit and reopen Claude Desktop with ⌘Q. This command does it without printing the token:

   ```bash
   node -e '
   const fs = require("fs"), os = require("os"), path = require("path");
   const file = path.join(os.homedir(), "Library/Application Support/Claude/claude_desktop_config.json");
   const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
   const token = fs.readFileSync("strapi/.tmp/maison-ops-token", "utf8").trim();
   config.mcpServers = { ...config.mcpServers, "maison-ops": { command: "npx", args: ["-y", "mcp-remote", "http://localhost:1338/mcp", "--header", "Authorization:${MAISON_OPS_AUTH}"], env: { MAISON_OPS_AUTH: `Bearer ${token}` } } };
   fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
   console.log("Added maison-ops to", file);
   '
   ```

   - Run it from the repo root.
   - Run it again after each `npm run setup`, which mints a new ops token.
   - Check that the connector lists `pending_confirmations` and `record_confirmation`, and offers the `send_pending_confirmations` prompt.

### Start over with a clean database

1. Stop Strapi. Delete the database and the uploaded images together, keeping `.gitkeep`:

   ```bash
   rm -f strapi/.tmp/data.db
   find strapi/public/uploads -type f ! -name .gitkeep -delete
   ```

   The catalog's images live in `strapi/public/uploads/`, and Maison's integration tests leave about 57 MB there per run. Delete uploads only together with the database: never by hand while the demo's data is loaded.
2. Start Strapi, run `npm run setup`, restart the app, and update Claude Desktop (step 3).

### Before going on stage

- [ ] The day before: start over with a clean database (above). Then no test customer, smoke-test token or rehearsal visit is left.
- [ ] `npm run mode` says local. After option B, run `npm run mode:local` and restart.
- [ ] Put the laptop on a phone hotspot. Only the concierge's model (with a key) and Claude Desktop need the internet.
- [ ] `npm run dev`. `http://localhost:1338/_health` answers 204.
- [ ] In the Strapi admin: **Maison** → **Reset demo appointments** (it asks first). Set the board's filter to **All requests**.
- [ ] Warm up: ask the concierge one question. On the local model, the first answer also loads the model.
- [ ] Open `http://localhost:3003` once. Sign-in is automatic, and the collections appear.
- [ ] In Claude Desktop, check that the maison-ops tools and prompt are there.
- [ ] Windows: the app (phone frame) beside the Strapi admin on the Maison board, and Claude Desktop behind them.
- [ ] Turn Do Not Disturb on.

### The 3-minute run

| Time | Beat | Do |
|---|---|---|
| 0:00–0:30 | UX | The app opens signed in with LINE. Browse Voyage, then the Weekender 50. Flip **Agent view**: every screen is an MCP tool call, the same tools an agent uses. |
| 0:30–1:10 | AX for the customer | Concierge: tap the first suggestion. Chips show each tool call, and cards show the pieces it found. |
| 1:10–1:30 | Booking | Tap "はい、お願いします。". The request is sent and awaits the boutique. |
| 1:30–1:50 | The request arrives | On the board, the request appears, created via the concierge, with the customer masked. |
| 1:50–2:20 | Staff confirm | Press **Confirm**. The row turns confirmed. |
| 2:20–2:45 | AX for operations | In Claude Desktop, run **send_pending_confirmations** (default: add the line below). It shows the visit and its ready-made LINE message. With option A, the phone buzzes and the board shows LINE sent. |
| 2:45–3:00 | Handoff | The integration slide. "Everything is ready for a LINE MINI App: sign-in, tools, and the message." QBurst takes over. |

**The default ops run.** LINE Bot MCP isn't connected on the laptop, so choose the prompt and add this before sending: "LINE Bot MCP isn't connected on this laptop. Stop after pending_confirmations: show each message, and record nothing." The prompt is written for a connected LINE Bot MCP. Without that line, the agent could record a false "not reachable" for the customer.

**Fallbacks:**
- **The concierge stalls, or the network drops:** use "来店を予約" on the product page. It calls the same `request_appointment` tool.
- **Claude Desktop fails:** show the confirmed row on the board, and the message on the slide.
- **Any beat stalls for more than 10 seconds:** switch to the backup video.

### Record the backup video

**When:**
- after the final rehearsal passes
- on the final build and a freshly seeded database (see "Start over with a clean database")
- with the model you'll use on stage: Claude with a key, if you have one by then. Otherwise the local model, which is slower, so trim the waits in editing.

**Setup:**
- macOS screen recording (⌘⇧5, or QuickTime), at 1920×1080
- the app in a phone-sized browser window beside the Strapi admin, on the Maison board with the filter on "All requests"
- Do Not Disturb on, and a clean browser profile with no bookmarks bar or extensions
- the cursor visible, and the system text size large enough for a projector

**Beats to capture,** in the same order as the live run:
1. LINE sign-in
2. The concierge's gift answer
3. Booking
4. The request appearing on the board
5. Staff confirming it on the board
6. The ops agent preparing (or, with option A, sending) the LINE confirmation

**Recording tips:**
- Record each beat as its own clip, so a bad take can be redone.
- Keep the final cut at or under 3:00, with no voiceover: you narrate live.

**On stage:**
- **Where it lives:** on the laptop, and embedded or linked in the slide right after "Meet Maison".
- **When to switch:** if any beat stalls for more than 10 seconds.
- **Either way,** the talk continues from S7.

## Option A: a real LINE message on your phone

1. In LINE Developers, create a provider and an Official Account with the Messaging API. Check first that your account can create one from your region. With option B, use your LINE Login channel's provider: LINE gives each user a different ID in each provider.
2. Add the Official Account as a friend on your phone.
3. Copy **Your user ID** from the Messaging API channel's Basic settings into `liff/.env` as `NEXT_PUBLIC_DEMO_LINE_USER_ID`. The mock sign-in then acts as you, as that provider sees you. Restart the app. With option B, skip this step: you sign in as yourself.
4. Issue a channel access token, and add LINE Bot MCP to Claude Desktop:

   ```json
   "line-bot": {
     "command": "npx",
     "args": ["-y", "@line/line-bot-mcp-server"],
     "env": { "CHANNEL_ACCESS_TOKEN": "<channel access token>" }
   }
   ```

5. In the ops beat, run **send_pending_confirmations** without the extra line. The agent does three things:
   - checks you're reachable (`get_profile`)
   - pushes the message (`push_flex_message`)
   - records it as sent (`record_confirmation`)

   "My visits" then shows "確定 · LINEで送信済み", and the board shows LINE sent.

The message's button opens `MAISON_LIFF_URL`. In local mode that's `http://localhost:3003`, which your phone can't open. With option B it's your LIFF URL, which opens the app inside LINE.

**Check once, in rehearsal, what LINE does for a customer it can't reach.** LINE's push API answers 200 even when it can't deliver, which is why the prompt calls `get_profile` first.
1. Block the Official Account on your phone.
2. Book and confirm a visit, then run the prompt.
3. Expected:
   - `get_profile` fails
   - the agent records "failed" with "not reachable: not a friend or blocked", and pushes nothing
   - the board still shows "not sent"
4. Unblock the account, reset demo appointments, and run the beat again. Expected: the push arrives, and the board shows LINE sent.

## Option B: the real app inside LINE

The stage runs on the LIFF mock. Option B runs the same app inside LINE on your phone, signed in by LINE: your own LINE Login channel and LIFF app, on one public https origin from ngrok. It was tested this way before the talk. The mock stays the default, and the stage's fallback.

How it fits together:
- **One origin.** ngrok forwards your domain to the app on :3003, a production build. The app passes three of Strapi's paths on to it: `/mcp`, the token endpoint (`/api/strapi-oauth-mcp-manager/oauth/token`) and `/uploads`. Strapi, with its admin, stays on your laptop. `MAISON_APP_ORIGIN` isn't needed, because the browser never calls Strapi on another origin.
- **LINE verifies the ID tokens.** Strapi checks each one with LINE, for your channel, not with the local mock.
- **Your values stay in `liff/.env`:** `LINE_MODE_LIFF_ID`, `LINE_MODE_CHANNEL_ID` and `LINE_MODE_DOMAIN`. The scripts never print them. Keep them out of commits.

### Once: your LINE Login channel and LIFF app

1. Link your LINE Developers account (Business ID) to your LINE account. Only a linked account can sign in to a channel in Developing.
2. In the [LINE Developers Console](https://developers.line.biz/console/), create a provider and a LINE Login channel, with app type Web app. Name it Maison, for example: a channel's name can't contain "LINE". Leave it in **Developing**, so only its admins and testers can sign in.
3. **Basic settings → Channel icon:** upload `liff/line/channel-icon.png`.
4. **LIFF → Add:**
   - Size: Full
   - Endpoint URL: `https://<your ngrok domain>/`
   - Scopes: `openid` and `profile`
   - Add friend option: Off
5. Get a free [ngrok](https://ngrok.com/download) account, install the agent, and add your authtoken (`ngrok config add-authtoken`). Your dev domain (`<name>.ngrok-free.dev`) is on ngrok's dashboard.
6. Add three lines to `liff/.env`:

   ```
   LINE_MODE_LIFF_ID=<your LIFF ID, from the LIFF tab>
   LINE_MODE_CHANNEL_ID=<your channel ID, digits only, from Basic settings>
   LINE_MODE_DOMAIN=<your ngrok domain, without https://>
   ```

### Each time

Stop `npm run dev` first. Then run these in order, the long-running ones each in its own terminal:

```bash
npm run mode:line     # rewrites strapi/.env and liff/.env for LINE mode, and prints no value
npm run dev:strapi    # Strapi reads the LINE channel when it starts
npm run setup         # checks Strapi's channel, and points the app at your domain
npm run start:line    # builds the app for LINE and serves it on :3003, without the verify mock
npm run tunnel        # checks it's safe, then runs ngrok on your domain
```

`npm run setup` mints a new ops token, so run the Claude Desktop step ("One-time setup", step 3) again afterwards.

On your phone, in LINE, open `https://liff.line.me/<your LIFF ID>`: send it to yourself in a chat, or to Keep memo, and tap it.
- **The first time,** ngrok's free plan may show its warning page: tap **Visit Site**. ngrok remembers it for 7 days. If the app then shows an error, close it and tap the link again.
- **LINE asks you to allow the app,** with your channel's icon and name.
- **The Strapi admin** stays at http://localhost:1338/admin on the laptop. Strapi prints your public URL as its own, but the admin isn't served there.

`npm run tunnel` refuses unless all of these hold:
- strapi/.env has no `LINE_VERIFY_URL`, and both `.env` files are in LINE mode
- nothing answers on the verify mock's port, 127.0.0.1:4545. `npm run dev` starts the mock, which is why LINE mode uses `npm run start:line`.
- the app on :3003 was built for LINE, not the LIFF mock
- the running Strapi refuses a forged ID token through the app

It refuses because, with the local verify mock behind a tunnel, anyone could sign in as any customer.

`npm run tunnel -- --dry-run` runs the checks alone. ngrok runs with `--inspect=false`, so its local inspector keeps no copy of customers' tokens. In ngrok's dashboard, leave Traffic Inspector's full capture off.

### Back to the stage setup

Stop the tunnel and the app (Ctrl-C), then:

```bash
npm run mode:local
npm run dev          # Strapi, the app and the verify mock, as on stage
```

`npm run mode` says which mode you're in. The tests (`npm run test:e2e`, `npm run test:live`) need local mode.

## Handoff: the integration slide, and what's ready for QBurst

**Slide: plugging in a LINE MINI App**
1. The MINI App calls `liff.getIDToken()`.
2. oauth-mcp-manager exchanges it for a short-lived session, after LINE verifies it (RFC 8693).
3. The MINI App, and any agent working for that customer, calls the Maison tools on Strapi `/mcp`.
4. Staff confirm in Strapi, on the Maison board. The ops agent delivers the ready-made LINE message: through the Messaging API today, and as a MINI App service message once verified.

**What's ready** (send this to QBurst before the event):

- **This repo.** Clone it and run it (see "Quick start"). Option B runs it inside LINE, and "Run it as a LINE MINI App" below runs it on your MINI App channel.
- **Token endpoint:** `POST {STRAPI}/api/strapi-oauth-mcp-manager/oauth/token`, as a form:

  | Parameter | Value |
  |---|---|
  | `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` |
  | `client_id` | the LINE client's ID |
  | `subject_token` | the LINE ID token |
  | `subject_token_type` | `urn:ietf:params:oauth:token-type:id_token` |

  - It returns `{ access_token, expires_in }`, with no refresh token: exchange a new ID token when the session ends.
  - `invalid_grant` (400): LINE rejected the ID token, so sign the customer in again.
  - `temporarily_unavailable` (503): try again after `Retry-After` seconds.
  - One LINE client can be active per Strapi.
- **MCP:** `POST {STRAPI}/mcp` with `Authorization: Bearer <access_token>`.
  - Customer tools: `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `request_appointment`, `my_appointments`
  - Staff tools, for staff agents: `appointment_requests` and `confirm_appointment`
  - Errors come back as `{ error: { code, message, hint } }`. Arguments the SDK rejects, such as a date that isn't on the calendar, come back as plain text.
- **Confirmation:** `pending_confirmations` returns each upcoming, staff-confirmed visit with its LINE user ID and a flex message, ready for the Messaging API.
- **Channels:** the MINI App channel and the Messaging API channel must be in one provider.

### Run it as a LINE MINI App

A LINE MINI App is a LIFF app on a LINE MINI App channel, so this app runs as one with its LIFF ID and channel ID changed. Under LINE's MINI App Policy, organizations with a Japanese corporate number can create one. The presenter, outside Japan, couldn't, so the demo was tested on a LINE Login channel (option B).

In your provider, create both channels in the same provider. Otherwise user IDs won't match, and confirmations can't be delivered.
1. **A LINE MINI App channel,** with Japan as its region:
   - **Channel icon:** `liff/line/channel-icon.png`, drawn to LINE's icon spec: 130×130 px, with a logo between 54 and 76 px. `liff/scripts/render-channel-icon.mjs` redraws it.
   - **Channel name:** Maison, with no "LINE" in it, and a Japanese name under Localization.
   - **A description,** in English and Japanese, and your **privacy policy URL**.
   - **Web app settings:** endpoint URL `https://<your host>/`, scopes `openid` and `profile`. A MINI App's size is always Full.
2. **A Messaging API channel** (an Official Account), for LINE Bot MCP (option A). A verified MINI App can send service messages instead.

Then, in this repo:
- **Two values change.** Put the MINI App's LIFF ID and channel ID in `liff/.env` as `LINE_MODE_LIFF_ID` and `LINE_MODE_CHANNEL_ID`, put your host in `LINE_MODE_DOMAIN`, and follow option B. Nothing else changes. To serve it from your own https host instead of ngrok, run `npm run start:line` behind that host, and leave `npm run tunnel` out.
- **Use one pair, from one internal channel.** A MINI App channel has three internal channels, Developing, Review and Published, and each has its own LIFF ID and channel ID. Use Developing's while you test. oauth-mcp-manager accepts one channel at a time, so switch to Published's at launch.
- **Its URL.** An unverified MINI App opens at `https://miniapp.line.me/<LIFF ID>`. `https://liff.line.me/<LIFF ID>` opens it too, so the confirmations' links (`MAISON_LIFF_URL`) keep working. Its header shows the page's title, Maison, and your domain.

Already done for LINE's MINI App guidelines:
- **The icon:** as above.
- **The safe area:** 34 px clear at the bottom in portrait, and 44 px at the sides and 21 px at the bottom in landscape, where the app fills the screen (`liff/app/globals.css`).
- **The loading icon:** LINE's own spinner, 30×30 px and centered, wherever the app waits (`liff/components/spinner.tsx`).
- **LIFF inside LINE:**
  - `liff.init()` runs at or below the endpoint URL.
  - `liff.login()` is called only outside LINE.
  - When an ID token expires (they last an hour), the app logs out and reloads, LINE's own pattern.

Still to do before LINE's review:
- **People without LINE.** LINE asks that a MINI App work in an external browser without LINE Login. Every screen here needs a LINE session, so a public catalog session would come next.
- **Performance.** LINE asks for a Lighthouse Performance score of 50 or more, measured on your deployment without LINE Login.
- **The policy and the review request:**
  - the LINE MINI App Policy
  - the channel description, and the privacy policy
  - for a reservation service, test scenarios in the review request

LINE's pages behind this:
- [Get started with LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/quickstart/)
- design: the [icon](https://developers.line.biz/en/docs/line-mini-app/design/line-mini-app-icon/), the [safe area](https://developers.line.biz/en/docs/line-mini-app/design/landscape/) and the [loading icon](https://developers.line.biz/en/docs/line-mini-app/design/loading-icon/)
- [settings shown to users](https://developers.line.biz/en/docs/line-mini-app/develop/configure-console/), and the [console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)
- [permanent links](https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/), and [external browsers](https://developers.line.biz/en/docs/line-mini-app/develop/external-browser/)
- the [LINE MINI App Policy](https://terms2.line.me/LINE_MINI_App?lang=en)

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | The app's unit tests, Maison's unit tests, the `@strapi/utils` check, and the tests of option B's mode switch and tunnel guard | nothing running |
| `npm run test:e2e` | Browser tests: booking, the closed-day guard, a cleared date, the agent view, an unknown product, two customers, and LINE's safe area in portrait and landscape. API tests: each customer's visits, and the admin API and its list search keeping customers out. It resets demo appointments first. | Strapi, in local mode (Playwright starts the app if it isn't running) |
| `npm run test:live` | The concierge on the local model, against the running Strapi | Strapi and Ollama, in local mode; it's skipped otherwise |

Maison's own suites run inside the demo too, from `strapi/src/plugins/maison`:
- **Integration tests** boot the demo's Strapi in-process, on their own `strapi/.tmp/maison-test-*.db` files: `STRAPI_APP_DIR="$(cd ../../.. && pwd)" npm run test:integration`.
- **MCP smoke tests** run against the running Strapi, with tokens the plugin's script mints as the demo admin:

  ```bash
  node --env-file=../../../.env --input-type=module -e "process.env.ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL; process.env.ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD; await import('./scripts/mcp-dev-tokens.mjs');"
  npm run test:mcp
  ```

  The script mints three tokens that never expire, one of them a staff token. Delete them afterwards, from the repo root:

  ```bash
  node --env-file=strapi/.env --input-type=module -e "
  const base = 'http://localhost:1338';
  const login = await (await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.DEMO_ADMIN_EMAIL, password: process.env.DEMO_ADMIN_PASSWORD }) })).json();
  const api = (method, path) => fetch(base + path, { method, headers: { Authorization: 'Bearer ' + login.data.token } });
  const smokeTokens = async () => (await (await api('GET', '/admin/admin-tokens')).json()).data.filter((token) => /^maison-(customer|staff|ops)-\d+$/.test(token.name));
  const minted = await smokeTokens();
  for (const token of minted) await api('DELETE', '/admin/admin-tokens/' + token.id);
  console.log('smoke-test tokens deleted:', minted.length, '| left:', (await smokeTokens()).length);
  "
  rm -f strapi/src/plugins/maison/test/mcp/.tokens.json
  ```

## The Maison plugin in this repo

`strapi/src/plugins/maison` is [strapi-store-demo-mcp](https://github.com/PaulBratslavsky/strapi-store-demo-mcp) at `MAISON_COMMIT`, unchanged. That repo is the source of truth, so change Maison there first. What the demo changes about Maison lives outside the copy, in `strapi/src/extensions/maison/`.

To bring in a newer version from a local clone of the plugin's repo, stop Strapi first (the install rebuilds Maison under it), then:

```bash
SRC=../plugin-dev/plugins/strapi-store-demo-mcp   # your clone
SHA=$(git -C "$SRC" rev-parse feat/maison-plugin)
FILES=(admin server test scripts package.json package-lock.json README.md vitest.config.ts .gitignore .editorconfig .prettierrc .prettierignore)
rm -rf strapi/src/plugins/maison && mkdir strapi/src/plugins/maison
git -C "$SRC" archive "$SHA" -- "${FILES[@]}" | tar -x -C strapi/src/plugins/maison
npm install --prefix strapi   # installs and builds it, and shares @strapi/utils
git add strapi/src/plugins/maison
diff <(git -C "$SRC" ls-tree -r "$SHA" -- "${FILES[@]}" | awk '{print $3, $4}' | sort -k2) \
     <(git ls-files -s strapi/src/plugins/maison | awk '{sub("strapi/src/plugins/maison/", "", $4); print $2, $4}' | sort -k2) \
  && echo "The staged copy matches $SHA"
```

- **The check compares what git tracks,** blob by blob, with the plugin's commit, not the folder. `strapi/.gitignore`'s patterns apply inside the copy too, so a file on disk may not be tracked.
- Commit with the SHA in the message, update `MAISON_COMMIT` above, and start Strapi.
- To work on the plugin in place, run `npm run watch` in its folder, and restart Strapi to load each rebuild.
- If you run `npm install` in the plugin's folder, stop Strapi and run `npm install --prefix strapi` afterwards. Until then, `npm run dev:strapi` refuses to start: the `predevelop` check finds Maison's own `@strapi/utils`.

## Production notes

- **Staff** get an admin role with the Maison actions they need (`catalog.read`, `appointments.review`, `appointments.confirm`) instead of Super Admin.
- **The customer token** belongs to a dedicated service admin with a narrow role. A token's permissions are clamped to its owner's, so a narrow owner can't be widened by mistake.
- **Never set `LINE_VERIFY_URL`** in production. Serve everything over https, with `PUBLIC_URL` set to the public origin: the app's, when it passes Strapi's paths on as in option B. `MAISON_APP_ORIGIN` is only for an app that calls Strapi on another origin.
- **Bind to 127.0.0.1** unless a proxy in front needs otherwise. The demo does it for Strapi, the app and the verify mock.
- **Staff agents read what customers wrote.** `appointment_requests` gives a staff agent customers' notes, up to 500 characters each, which could try to instruct the model. The tool descriptions tell it to treat notes as information, and to confirm only a reference the staff member asked for. Keep `appointments.confirm` off an agent's token, or add an approval step for tools that write.
- **`strapi/src/extensions/maison/strapi-server.ts`** keeps customers' LINE user IDs out of admin API responses and the list search. Keep it until Maison's own schema does the same.
````

- [ ] **Step 2 (Paul): Connect Claude Desktop, and check the ops agent**

Paul runs the README's setup step 3 (the command writes the token into Claude Desktop's config without printing it), and quits and reopens Claude Desktop with ⌘Q. Then:
1. Book a visit in the app, and confirm it on the board.
2. In Claude Desktop, choose the `send_pending_confirmations` prompt, add the default line from the runbook, and send.

Expected:
- **The listing:** Claude calls `pending_confirmations` and shows the visit's reference, `10月…(土) 14:00`, 銀座本店 and the flex message.
- **Where it stops:** it calls nothing else, and the board still shows "not sent".
- **Its tools:** only `pending_confirmations` and `record_confirmation`, plus `log` in development. It can't find a tool to confirm, publish or edit content.

- [ ] **Step 3: Checks carried over from the plugin reviews**

- **(a) An appointment's `plugin::maison.appointment.customer`, on admin surfaces.** Task 8's API test checks that the Content Manager API never returns it. **Paul:** in the Content Manager, the Maison appointment list and edit view have no customer column or field, and searching the list for part of the demo customer's ID (`4af49806`) finds nothing. A save and a Publish there still work.
- **(b) Paul: LINE and customers it can't reach.** Run the check in the README's option A during the option A rehearsal. Push answers 200; `get_profile` fails for a blocked account or a non-friend.
- **(c) Paul's visual checks in the admin:**
  - **The board.** A request made in the app appears within 5 seconds. "All requests" keeps confirmed rows. **Confirm** appears only on waiting requests whose visit is ahead. The LINE badge changes after option A.
  - **The reset dialog.** "Reset demo appointments" asks first, and Cancel changes nothing.

- [ ] **Step 4 (Paul): Rehearse the run**

Follow "Before going on stage" and "The 3-minute run" in the README three times in the stage mode, resetting demo appointments between runs. Do one more run on the local model.

Expected:
- **Each beat works,** and the whole run fits in 3 minutes. On the local model, only the waits are longer.
- **The concierge** never says a visit is confirmed.
- **The Book button fallback** works with the network off. Strapi, the app and the mock all run locally, and so does the local model. Only Claude Desktop stops.

- [ ] **Step 5 (Paul): Record the backup video**

Follow "Record the backup video" in the README once a rehearsal is clean.

- [ ] **Step 6: Check a fresh clone**

This checks the quick start's install on a clean copy of `feat/maison-demo` (after the merge, `main` does as well): on this laptop's Node 24, then on Node 22.12, the oldest Node 22 here (`engines` asks for 22.9 or later). It starts no long-running server: `demo-strapi` and `demo-app` hold the demo's ports.

```bash
CLONE="$(mktemp -d)/maison-demo"
git clone -q -b feat/maison-demo /Users/paul/work/maison-demo "$CLONE"
cd "$CLONE" && npm install > "$CLONE.install.log" 2>&1; echo "install exit $?"
grep -E 'Created|Generated|share Strapi' "$CLONE.install.log"
stat -f '%Lp %N' strapi/.env liff/.env
npm test > "$CLONE.test.log" 2>&1; echo "test exit $?"
git status --short; echo "(nothing above: the install left the clone clean)"
cd /Users/paul/work/maison-demo && rm -rf "$(dirname "$CLONE")"

NODE22=/Users/paul/.nvm/versions/node/v22.12.0/bin
CLONE="$(mktemp -d)/maison-demo"
git clone -q -b feat/maison-demo /Users/paul/work/maison-demo "$CLONE"
cd "$CLONE" && PATH="$NODE22:$PATH" && node --version && npm --version
npm install > "$CLONE.install.log" 2>&1; echo "install exit $?"
npm test > "$CLONE.test.log" 2>&1; echo "test exit $?"
cd /Users/paul/work/maison-demo && rm -rf "$(dirname "$CLONE")"
```

Expected:
- **Node 24:**
  - `install exit 0`, then "Maison and oauth-mcp-manager share Strapi core's @strapi/utils.", "Created strapi/.env …", the generated keys, and "Created liff/.env …". No value is printed.
  - `600` for both `.env` files, and `test exit 0`.
  - Nothing from `git status`: everything the install made is ignored.
- **Node 22:** `v22.12.0` and `10.9.0`, then `install exit 0` and `test exit 0`. npm 10 may rewrite lockfiles in that clone, which is thrown away. The new root tests passed on Node 22.12 on 30 September.

- [ ] **Step 7: Commit; publishing waits for Paul**

```bash
cd /Users/paul/work/maison-demo
git add README.md
git commit -m "docs: add the README: quick start, runbook and the QBurst handoff" -m "Co-Authored-By: <your model> <noreply@anthropic.com>"
```

Only when Paul says so, and after he has chosen a license (the repo has none yet). From `feat/maison-demo`:

```bash
cd /Users/paul/work/maison-demo
git ls-files | grep -E '(^|/)\.env$|maison-ops-token|\.tokens\.json|\.db$'; echo "(nothing above: no secret file is tracked)"
git log -p | grep -cE 'sk-ant-[A-Za-z0-9_-]{20,}|mcp_at_[A-Za-z0-9_-]{20,}'
node --env-file-if-exists=liff/.env --input-type=module -e "
import { execSync } from 'node:child_process';
const history = execSync('git log -p', { encoding: 'utf8', maxBuffer: 1 << 30 });
const values = ['LINE_MODE_LIFF_ID', 'LINE_MODE_CHANNEL_ID', 'LINE_MODE_DOMAIN'].map((key) => process.env[key]).filter(Boolean);
console.log('LINE values in the history:', values.filter((value) => history.includes(value)).length);
"
gh repo create PaulBratslavsky/maison-demo --public --source . --remote origin --description "From UX to AX: one set of Strapi MCP tools serving a LINE app, a customer's agent and an ops agent"
git push -u origin main
git push -u origin feat/maison-demo
gh pr create --base main --head feat/maison-demo --title "The Maison demo: from UX to AX" --body "$(cat <<'EOF'
The whole demo on one laptop: Strapi 5.55.1 with the Maison plugin and oauth-mcp-manager, the Maison app (LINE's LIFF mock on stage, and a tested LINE mode through one tunnel), the concierge, the ops agent's setup, and the runbook. README.md has the quick start, the runbook and the handoff to QBurst.

- Tests: `npm test`, `npm run test:e2e`, the concierge's live test, and Maison's own suites (README, "Tests").
- Checked before publishing: no secret file is tracked, and the history holds no key, no session token and none of the LINE values.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

`main` goes first, so GitHub makes it the default branch.

Expected:
- nothing from the first `grep`
- `0` from the second. It counts and never prints a match, and Task 7's fixture `sk-ant-test` is too short to count.
- `LINE values in the history: 0`: Paul's LIFF ID, channel ID and ngrok domain were never committed
- `gh repo create` prints the new repository's URL, the pushes create `main` and `feat/maison-demo`, and `gh pr create` prints the PR's URL
- `git status -sb` shows `feat/maison-demo...origin/feat/maison-demo`. The PR waits for Paul: merging is his call.

---

## Verified on 30 September

### The maison-demo port

It ran in a scratch copy of the repo. Nothing touched LaunchPad's tree, the running dev servers (1338, 3001, 3003 and 4545), or the plugin repos.

**The inputs:**
- `create-strapi@5.55.1`, with Step 2's flags
- Maison copied with `git archive` from `feat/maison-plugin` at `75c494f`
- strapi-oauth-mcp-manager 1.1.0 as an `npm pack` tarball, built from PR #4's head (`a3b79c6`) in a scratch copy of its repo. It stood in for the npm release, which isn't out yet.
- the app's files from LaunchPad's commits, through `git show`

**Strapi:**
- **The 5.56.0 leak.** A plain `create-strapi@5.55.1` install resolved eight `@strapi` packages at 5.56.0, and Strapi core used a nested copy of `@strapi/utils`. With the overrides, all 24 `@strapi` 5.x packages were 5.55.1, and core used the top-level copy. `legacy-peer-deps` instead left `hono` missing.
- **Maison's copy of `@strapi/utils`.** Maison's own install put a second copy in its `node_modules`, and its `ValidationError` wasn't core's. After the share step it was, and a rejected Content Manager save answered 400 with Maison's reason. Restoring the copy (an `npm install` in the plugin's folder) made `--check` exit 1 and the in-process check fail, until the share step ran again.
- **One root `npm install`** from a clean tree took about a minute: Strapi, Maison's install and build, the share step, `liff/`, and both `.env` files (mode 600, with no placeholder left). Running `init-env` again changed nothing.
- **The build:** `tsc` on the Strapi app passed, and the admin panel built in about 10 seconds with the local plugin.
- **Maison's own tests, inside the demo:** 171 unit tests, both type checks, and 42 of 42 integration tests with `STRAPI_APP_DIR` pointing at the demo's Strapi. The install and the build left the copied files, its lockfile included, unchanged.
- **An in-process boot** (`createStrapi` and `load()`, with no port) passed 16 checks:
  - Maison and oauth-mcp-manager load, and tanstack-ai doesn't.
  - `server.url`, MCP, the LINE provider and CORS are as configured.
  - `customer` is hidden, not searchable, and still private.
  - `_q` finds an appointment by its reference, and not by its LINE user ID.
  - Maison's `ValidationError` is core's.
- **With no socket at all,** 29 checks passed. Requests were injected into Strapi's Koa handler, and the LINE mock ran on a spare loopback port. The checks:
  - `_health`, the OAuth metadata (`token-exchange`), and `hasAdmin: false` on a fresh database
  - the setup script twice, the second time with an active "QA LINE app". The QA client was deactivated, not deleted. One "Maison app" client and one of each token were left, and `liff/.env` went back to mode 600.
  - the token exchange: 200, then 400 `invalid_grant` for a forged token and for an extra dot segment
  - CORS for :3003 only, with `Retry-After` exposed
  - a customer's six tools, a booking, `my_appointments`, and an impossible date as an input validation error
  - the admin API without `customer`, and `_q`
  - a rejected Content Manager save answering 400 with Maison's reason
  - no tanstack-ai routes
- **The setup script's failure paths** print one line and exit 1: no demo admin in `.env`, and no Strapi at the target.

**The app:**
- `npm install` with no peer-dependency conflict, `tsc`, and the 14 unit tests (session 6, MCP client 8)
- `next build`, with no workspace-root warning, and the serif font bundled from `@fontsource`, with no Google Fonts URL in the build
- the mock verify endpoint: 200 for `valid.U…`; 400 for an extra dot segment, another channel, or a forged token; and an empty channel falling back to `1234567890`
- the credential mapping for Maison's token script, which reached its network step with the demo admin

**Not run here:** `strapi develop` and `next dev` on their ports, the browser, Playwright, the concierge's live test, and the Maison MCP smoke tests. They need the controller's servers (Tasks 1, 3 and 5–8). strapi-oauth-mcp-manager 1.1.0 from npm couldn't be installed, because it isn't published yet.

### The LINE amendment (Tasks 3 and 5–10)

It ran in a scratch Next 16.3.8 app (React 19.3, Tailwind 3.4.19, vitest 3.2.7, Playwright 1.63 with a cached Chromium) and a scratch repo root, on free ports.
- **What it left alone:** the controller's servers, LaunchPad, the plugin repos and `maison-demo`. No tunnel was started, nothing was installed globally, and no `.env` or ngrok config was read.
- **LINE's pages:** read on 30 September (each cited where it's used). LINE's two spinner files were checked by HEAD request only: 712 bytes each.

**The app's side:**
- **Task 9's new tests:** the proxy's 5, the header's 2 and LIFF's 2 passed with Task 4's 14 (23 in all), and `tsc` passed.
- **Red first:**
  - the new suites failed to load before their modules existed
  - "signs in again" failed against Task 4's `signInAgain`
  - a proxy that buffers failed the streaming test in 2 s, with "the first event was held back"
- **`check-strapi-proxy.mjs` passed against `next start -H 127.0.0.1`:** the first event at 17–18 ms, then the token endpoint's 503 and `Retry-After`, the image, and 404 for everything else, with the stand-in for Strapi never reached.
- **Rewrites against route handlers,** with `next start` and gzip accepted:
  - through an external rewrite: one chunk, at 1509 ms
  - through a route handler: 19 ms, then 1517 ms
- **`next.config.mjs` sees `liff/.env` at build time:** the build answered `X-Maison-Liff: line` with `NEXT_PUBLIC_LIFF_MOCK=false`. The three routes build as dynamic, with no route config.
- **The safe area,** in Chromium with Playwright's emulation:
  - the stage laptop (1280×900): the 375×812 frame, with no padding
  - a desktop context of 390×844, and a phone in portrait (`isMobile`, `hasTouch`): 34 px at the bottom
  - a phone in landscape (844×390): the full width, with 44/44/21 px, and the fixed drawer padded the same way
- **The channel icon:** 130×130 px, with a 72×56 px logo.

**The root's side:**
- **The mode switch and the guard:** 10 of 10 `node:test` tests on Node 24.16 and on Node 22.12, and the exact messages quoted in Task 9.
- **The setup script's change,** against a stand-in for Strapi: local mode, LINE mode, and a refusal when Strapi still runs the other channel.
- **The README's re-copy check** matched a faithful copy of Maison (133 tracked files, `dist/` ignored), and flagged a changed file.

**Not run here:**
- Paul's channel and LIFF app, the tunnel, and the phone
- `npm run setup` against the real Strapi, and `npm run tunnel` against the running demo
- Task 8's new browser and API tests, which need the demo's Strapi
- whether LINE's in-app browser keeps ngrok's cookie, and the sign-in again after an hour on a device (Task 9, Step 12)

### Earlier, in LaunchPad

This is the evidence behind Tasks 5–8's code, which the port doesn't change:
- `tsc` and `next build` (Next 16.3.8) passed, with the 29 unit tests of the time (30 with Task 4's concurrency test).
- The 5 browser tests passed in Chrome, and the API tests under Playwright, against a booted clone of LaunchPad's Strapi.
- **The contracts the app relies on:**
  - a bad ID token answers 400 `invalid_grant`
  - LINE answering 429 gives 503 `temporarily_unavailable` with `Retry-After: 5`
  - a customer session sees exactly the six customer tools
  - two customers each see only their own visits
  - `2030-02-30` comes back as `Input validation error: … Not a real calendar date.`
  - unknown slugs answer `not_found` with hints
  - a plain admin token gets `not_signed_in`
- **The local model** (Ollama 0.34.2, `qwen3-14b-32k`):
  - One tool call took 16 s with thinking and 1.8 s without. Thinking always arrives in a separate field, so no `<think>` text reaches a reply.
  - The concierge's live test passed in 19–25 s once the instructions said to search broadly and pass the locale. Before that, Qwen3 guessed categories and answered "nothing fits".
