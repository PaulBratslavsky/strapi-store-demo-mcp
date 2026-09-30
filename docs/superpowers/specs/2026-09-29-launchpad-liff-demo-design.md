# LaunchPad integration, Maison app and demo: design

- **Date:** 2026-09-29, revised the same day; amended 2026-09-30
- **Status:** Draft for review
- **Overview:** [AX luxury demo overview](2026-09-29-ax-luxury-demo-overview.md)
- **Target repo:** [PaulBratslavsky/LaunchPad](https://github.com/PaulBratslavsky/LaunchPad) (the fork): Strapi configuration plus a new `liff/` frontend
- **Depends on:**
  - [Maison plugin](2026-09-29-maison-plugin-design.md) (PR #2) and [oauth-mcp-manager 1.1](2026-09-29-oauth-mcp-manager-line-design.md) (PR #4), both built and reviewed
  - strapi-plugin-tanstack-ai 1.6.0, the in-admin chat

> **Revision (29 September):** The presenter can't get a LINE MINI App channel in time, and QBurst presents the MINI App side of the event right after this talk. So the demo runs on the stage laptop, in a browser at phone size:
> - **LINE sign-in** is simulated with LINE's official LIFF mock and a local stand-in for LINE's ID-token verify endpoint.
> - **Every other step** is the production path.
> - **Switching to a real LIFF app or MINI App** is configuration only (Part C).
>
> Hosting is no longer needed. Part F covers the handoff slides.

> **Amendment (30 September):** the plugins are built, and they changed what this demo does:
> - **Staff work through agents too.** Maison added two staff tools, a requests board in the admin, and six tools for an in-admin chat. Staff confirm a request on the board or by asking the chat, where they used to publish it in the Content Manager (Part D).
> - **The in-admin chat** is strapi-plugin-tanstack-ai 1.6.0, installed in LaunchPad (Part A).
> - **A local model stands in when there's no API key.** Both the chat and the concierge use `qwen3-14b-32k` on Ollama (Parts A and B).
> - **The demo runs on its own database,** and the setup script registers its first admin (Part A).
> - **The app follows the plugins' errors:** `temporarily_unavailable` versus `invalid_grant` at sign-in, real calendar dates, and `not_found` hints (Part B).
> - **Customers' LINE user IDs stay out of admin API responses** (Part A).
> - **The runbook** moves to `liff/README.md`, because LaunchPad ignores `docs/`. It gains a backup video (Part E).

## Part A: LaunchPad Strapi

### Plugins

- **The two Maison plugins:** `strapi-store-demo-mcp` (Maison) and `strapi-oauth-mcp-manager` 1.1, linked with yalc from their feature branches, and installed from npm once published.
- **The chat:** `strapi-plugin-tanstack-ai` ^1.6.0, from npm.
- **All three load only when `MAISON_DEMO=true`.** Their dependency entries stay local and uncommitted: yalc links can't be committed, and LaunchPad's postinstall rewrites the project's uuid in the same file. They become committed dependencies once the Maison plugins are on npm.

### Configuration

| File | Change |
|---|---|
| `config/server.ts` | Keep `mcp: { enabled: env.bool('MCP_ENABLED', true) }`. Add `url`: `PUBLIC_URL`, or `http://localhost:<port>` without it, so Maison's media URLs are absolute for the app's origin. |
| `config/admin.ts` | `secrets: { encryptionKey: env('ENCRYPTION_KEY') }`. oauth-mcp-manager needs it to decrypt admin tokens. |
| `config/plugins.ts` | `maison`, `strapi-oauth-mcp-manager` and `tanstack-ai`, each enabled by `MAISON_DEMO`. The values are in the table below. |
| `config/middlewares.ts` | With `MAISON_DEMO`, the CORS object below. Without it, Strapi's default `'strapi::cors'`, as before. |
| `src/extensions/maison/strapi-server.ts` | Marks the appointment's `customer` hidden in the schema's config ("Customers' LINE user IDs" below). |
| `.env.example` | `MAISON_DEMO`, `ENCRYPTION_KEY`, `LINE_LOGIN_CHANNEL_ID`, `LINE_VERIFY_URL`, `MAISON_LIFF_URL`, `MAISON_APP_ORIGIN`, `PUBLIC_URL`, `ANTHROPIC_API_KEY`, `OLLAMA_MODEL`, `OLLAMA_HOST` |

`config/plugins.ts`, plugin by plugin (an empty value in `.env` counts as unset):

| Plugin | Configuration |
|---|---|
| `maison` | `liffUrl` from `MAISON_LIFF_URL`. |
| `strapi-oauth-mcp-manager` | `identityProviders.line = { channelId, verifyUrl }` when `LINE_LOGIN_CHANNEL_ID` is set, and `{}` otherwise. `channelId` is digits only; `verifyUrl` comes from `LINE_VERIFY_URL`, only when it's set. |
| `tanstack-ai` | The chat. With `ANTHROPIC_API_KEY`: `{ provider: 'anthropic', model: 'claude-sonnet-5', apiKey }`. Otherwise: `{ provider: 'ollama', model: OLLAMA_MODEL, baseURL: OLLAMA_HOST }`, which default to `qwen3-14b-32k` and `http://localhost:11434`. |

The CORS object, with `MAISON_DEMO` only:
- **`origin`:** LaunchPad's frontends, `http://localhost:3003` (the Maison app), `CLIENT_URL`, and `MAISON_APP_ORIGIN` when set
- **`methods`:** Strapi's defaults, which include what MCP needs (`GET, POST, DELETE, OPTIONS`)
- **`headers`:** `Content-Type`, `Authorization`, `Origin`, `Accept`, `mcp-session-id`, `mcp-protocol-version`, `Last-Event-ID`
- **`expose`:** `WWW-Authenticate`, `mcp-session-id`, `mcp-protocol-version`, and `Retry-After`, which the app reads when sign-in is temporarily unavailable

Stage values:

| Variable | Value |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | `1234567890`, the mock's channel |
| `LINE_VERIFY_URL` | `http://localhost:4545/verify` |
| `MAISON_LIFF_URL` | `http://localhost:3003` |
| `MAISON_DEMO` and `DATABASE_FILENAME` | `true` and `.tmp/maison-demo.db`, on the command line |

### The demo's database

The demo runs on its own SQLite file, `strapi/.tmp/maison-demo.db`, chosen with `DATABASE_FILENAME` when Strapi starts.
- **Why not the dev database:** it holds an older seed, with an "Écrins" collection. Maison's seed skips loading whenever its first collection exists, so it can't repair that.
- **What a separate file gives:** a known, clean start, reset by deleting one file. LaunchPad's own content stays on the dev database.

### Tokens and the app's client

A setup script, `strapi/scripts/maison-setup.mjs`, runs against the running Strapi as the local admin. It's safe to run again: it replaces what it created before.

1. **The first admin.** On a fresh database, it registers the local test admin, so the presenter signs in to the demo's admin with the credentials he already uses.
2. **Loads the demo catalog.**
3. **Admin token "Maison customer"**, with `plugin::maison.catalog.read` and `plugin::maison.appointments.request`, owned by that admin.
4. **Admin token "Maison ops"**, with only `plugin::maison.confirmations.send`. Its key goes into a gitignored file that the Claude Desktop setup reads (Part D).
5. **OAuth client "Maison app"**, with customer sign-in LINE, public, and mapped to "Maison customer".
   - oauth-mcp-manager allows one active LINE client, so the script deactivates any other active one (it doesn't delete it) and names it.
   - The client ID goes into the app's `.env` as `NEXT_PUBLIC_MAISON_CLIENT_ID`.
   - LINE clients never use the consent page: `/authorize` refuses them.

**No staff token.** Staff work in the Strapi admin (Part D), where the board and the chat check the signed-in admin's role. No MCP client works for staff on stage, so a staff token would be a standing credential with nothing to do.

**Production note** (README and slide):
- The customer token should belong to a dedicated service admin with a narrow role. A token's permissions are clamped to its owner's, so a narrow owner can't be widened by mistake.
- Staff get an admin role with the Maison actions they need, not Super Admin.

### Customers' LINE user IDs

Maison already hides an appointment's `customer`:
- Its staff tools and its board mask it.
- The Content Manager's views don't show the field.

The admin API still returned it, which the in-admin chat exposed (found on 30 September):
- **The cause:** Strapi's admin sanitizer returns every `visible: false` attribute to any admin who can read the type, whatever the role's field permissions say.
- **The effect:** strapi-plugin-tanstack-ai's `search_content` showed full LINE user IDs to the Super Admin.

The fix is a LaunchPad plugin extension that marks the attribute `hidden` in the schema's config, a flag the sanitizer honours:
- **What changes:** the Content Manager API and the chat's search no longer return the field, filters on it are dropped, and a Content Manager save can't overwrite it.
- **What doesn't:** Maison's services use the Document Service, and still read and write it.
- **Where it belongs:** in Maison's own schema, as a follow-up.

### The in-admin chat

strapi-plugin-tanstack-ai 1.6.0 adds a chat panel to the admin. Its tools:
- its own content tools (`list_content_types`, `search_content`, `aggregate_content`)
- six `maison__*` tools from Maison's `ai-tools` service: the four catalog tools, `appointment_requests` and `confirm_appointment`

Each tool needs its action on the admin's role, and the Super Admin has them all.

- **Model:** Claude Sonnet 5 with `ANTHROPIC_API_KEY` in `strapi/.env`, otherwise `qwen3-14b-32k` on Ollama. The chat can't turn Qwen3's thinking off, so on the local model an answer takes one to two minutes.
- **When the model can't be reached,** the chat's answer ends with "fetch failed".

### Hosting

None for the stage. Strapi, the app and the mock verify endpoint all run on the laptop. The models need the internet unless the local model is used, and Claude Desktop always does.

### Dev servers while it's built

Claude Code's preview runner owns the long-running servers:
- `maison-strapi`: Strapi on 1338, on the demo database
- `maison-app`: the app on 3003, and the verify mock on 4545

The implementers don't start or stop them.

## Part B: The Maison app (`liff/`)

A new frontend in the LaunchPad monorepo, next to `next/`, `astro/`, `nuxt/` and `tanstack/`:
- **Registered in `scripts/frontends.mts`** as `liff`: port 3003, Strapi URL key `NEXT_PUBLIC_STRAPI_URL`, and no admin preview target.
- **`yarn setup` installs it**, and a new root script, `yarn dev:liff`, starts it with Strapi. The app's own `dev` script also starts the mock verify endpoint. `yarn dev:liff` waits for Strapi on the port in `strapi/.env`, so on a laptop where that port is taken, Strapi and the app are started separately.
- **Not inside `next/`:** LaunchPad's Next app redirects every path to a locale and wraps pages in the marketing layout. The Maison app needs neither.

### Stack

- Next.js 16 (App Router), React 19, TypeScript and Tailwind, matching LaunchPad's `next/` versions (Next ^16.3.1, React ^19.2.8, TypeScript 5, Tailwind 3.4)
- `@line/liff` and `@line/liff-mock`, the MCP SDK client, and AI SDK 7 for the concierge, with `@ai-sdk/openai-compatible` for the local model
- APIs taken from the installed packages, as recorded in the plan

### LIFF modes

- **Mock, the default and the stage mode** (`NEXT_PUBLIC_LIFF_MOCK=true`). `@line/liff-mock` signs in a demo customer:
  - `isLoggedIn` is true.
  - `getIDToken` returns `valid.<demo LINE user ID>`.
  - `getAppLanguage` returns `NEXT_PUBLIC_DEMO_LOCALE`.
  - The demo user ID comes from `NEXT_PUBLIC_DEMO_LINE_USER_ID`, or from `?demoUser=U…` for the current tab. The override is only for tests and the second-customer check.
- **Real** (`NEXT_PUBLIC_LIFF_MOCK=false`, with `NEXT_PUBLIC_LIFF_ID` set). The app must be served over https at the LIFF app's endpoint URL (Part C).

### Session (`lib/session.ts`)

1. Initialize LIFF, in mock or real mode. In real mode outside LINE, when not logged in, call `liff.login()`.
2. `POST` `liff.getIDToken()` to the token endpoint with the token-exchange parameters (oauth-mcp-manager spec).
3. Keep the session token in memory. Never put it in `localStorage`, and never send LINE profile data to any server (LINE's guidance).
4. On a `401` from `/mcp`, exchange again, once.
5. Handle the token endpoint's two errors differently:
   - **`temporarily_unavailable` (503):** LINE couldn't be reached, answered 408 or 429, or the LINE client needs an admin. Wait for `Retry-After` (at most 10 seconds) and try once more. Then say "try again in a moment", with a retry button.
   - **`invalid_grant` (400):** LINE refused the ID token. Never retry it. Inside LINE, log out and start a new LINE login. With the mock, show the error: it means the app and Strapi disagree about the channel.

### MCP client (`lib/mcp.ts`)

- A single `Client` with `StreamableHTTPClientTransport` to `${STRAPI_URL}/mcp`, with the session token in `Authorization`.
- Screens call `client.callTool({ name, arguments })` and render `structuredContent`.
- Each call is recorded for the agent view: tool name, arguments, result, duration and screen.
- An `isError` result's JSON gives `{ code, message, hint }`. A plain-text result from the SDK's schema check (`Input validation error: …`, as for a date that isn't on the calendar) counts as `invalid_input`.

### Screens

The locale comes from `liff.getAppLanguage()`: `ja*` gives `ja`, anything else `en`.

| Route | Tools | Contents |
|---|---|---|
| `/` | `browse_collections` | House wordmark, collections (Voyage, Atelier, Gifts), "Ask the concierge" button |
| `/collections/[slug]` | `search_products({ collection })` | Product grid with price and badges |
| `/products/[slug]` | `view_product`, `find_boutiques({ productSlugs, date })` | Images, price, craft story, personalization and stock by boutique. A "Book a visit" sheet (boutique, date, time, note) calls `request_appointment`. |
| `/concierge` | through `/api/concierge` | Chat with tool chips and product cards |
| `/visits` and `/visits/[reference]` | `my_appointments` | Statuses: awaiting boutique, confirmed, confirmation sent. `/visits/[reference]` is where the LINE message's button leads. |

Every screen shows a small badge naming its tool. A **"Show agent view"** toggle in the header, remembered per device, opens a drawer with the recorded MCP calls for the current screen.

**Errors, in the customer's words.** The tools' hints are written for agents, so screens show plain copy for each code instead, and the agent view keeps the code:
- `not_found` shows "not found", with a link back to the start.
- `boutique_closed`, `in_the_past`, `too_many_open_requests` and `invalid_input` have their own copy.
- So do the two sign-in errors, which come with a retry.

**Dates.** The booking sheet only sends real calendar dates, from tomorrow on. A cleared date asks for one. A closed day disables sending before any request, so the tool's `boutique_closed` is only a backstop.

On a screen wider than 500 px, the app renders inside a phone-sized frame on a dark backdrop, for the stage.

### Concierge (`app/api/concierge/route.ts`)

- **Runtime:** Node.
- **Request:** `{ messages, locale }`, with `Authorization: Bearer <customer session token>`. The route never holds its own Strapi credentials.
- **MCP client:** created per request to Strapi `/mcp`, with the customer's token and `x-maison-surface: concierge`. Tools come from `tools/list`, so the model sees exactly what this customer's token allows.
- **Model:**
  - `ANTHROPIC_API_KEY`: Claude Sonnet 5, `anthropic('claude-sonnet-5')`
  - `AI_GATEWAY_API_KEY`: the AI Gateway string `'anthropic/claude-sonnet-5'`
  - neither: `qwen3-14b-32k` through Ollama's OpenAI-compatible API (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`), with thinking off (`reasoning_effort: "none"`). Ollama returns thinking separately, so none of it reaches the chat either way; off, it's faster.
  - Tool use is capped at 6 steps per turn, and the reply is streamed.
- **Streaming to the UI:**
  - text deltas
  - tool calls and results, rendered as chips like `search_products ✓ 5 results`
  - product and appointment cards, built from `structuredContent`, never parsed from the model's text
- **Instructions:**
  1. Use tools for every fact about products, prices, stock and hours. Never invent any of them, and name products exactly as the tools return them.
  2. Search broadly first: for a gift, by occasion, budget and boutique. Add a category or collection only when asked. If a search finds nothing, drop a filter and search again before saying nothing fits.
  3. Before calling `request_appointment`, restate the boutique, date, time and products, and wait for the customer's yes.
  4. Times are in Japan time (Asia/Tokyo). Write `requestedFor` with the `+09:00` offset, on real calendar dates, working weekdays out from today's date.
  5. Never say an appointment is confirmed. Say it's requested, and that the boutique will confirm it on LINE.
  6. If a tool returns an error, follow its hint:
     - `not_found` means look the slug up with the tool the hint names.
     - An input validation error means fix the arguments.
     - Otherwise ask the customer.
  7. Reply in polite Japanese (keigo) when the locale is `ja`, and in English otherwise, passing the same locale to the tools. Keep replies short.
- **Errors:** when the model can't be reached, the reply names the model and the fix ("Start Ollama, or set ANTHROPIC_API_KEY").
- **Limits:** 20 messages of history, 1,000 characters per message, and a 60-second timeout on Vercel.

Rules 2 and 7 came from running the local model. Without them, Qwen3 guessed categories for "a travel gift" and found nothing, and it answered English questions with product names the tools gave in Japanese.

### Look and feel

- **Style:** restrained luxury: off-white or charcoal, a serif wordmark, generous spacing, and full-bleed product imagery.
- **Layout:** mobile-first at 375 px, with the phone frame above 500 px.
- **Accessibility:** tap targets of 44 px or more, alt text from the product images' alternative text, and the phone's text-size setting respected.

### Testing

- **Unit tests (vitest):**
  - the token exchange, with its one retry after a 401 and the two sign-in errors
  - the MCP call recorder, and reading validation errors
  - the model choice, including that thinking is off in the request Ollama receives
  - formatting and real dates
- **Concierge contract test:** with a mock model, the route forwards the customer's token and the surface header to Strapi, never adds a credential of its own, and names an unreachable model.
- **Playwright, in mock mode against local Strapi:**
  - home, then a collection, a product, book a visit, and "My visits" shows the request as awaiting the boutique
  - Osaka is closed on a Tuesday, and the sheet says so before any request
  - the agent view lists the tools each screen called
  - an unknown product says so, and leads back to the start
  - a second demo customer (`?demoUser=`) doesn't see the first customer's visit
- **API tests (Playwright):**
  - over MCP, each customer's `my_appointments` lists only their own visits
  - the admin API never returns an appointment's `customer`
  - the Super Admin's chat offers the six `maison__*` tools
- **Live tests on the local model,** opt-in, skipped when Ollama isn't up:
  - The concierge answers the demo question through the catalog tools. Every product it names must have come back from a tool call, and one must fit the question.
  - The in-admin chat, asked for the requests, calls `maison__appointment_requests` and shows no full LINE user ID.
- **The Maison MCP smoke tests,** run again with oauth-mcp-manager linked, so the plain-admin-token check goes through its real `resolveSubject`.

## Part C: LINE (simulated on stage, real LINE optional)

- **Stage (default):** no LINE account needed. The app runs in mock mode, and Strapi verifies against the local mock.
- **Option A, real delivery (the phone buzzes):**
  1. In LINE Developers, create a provider and an Official Account with the Messaging API. Check first that your account can create one from your region.
  2. Add the Official Account as a friend on your phone.
  3. Copy "Your user ID" from the Messaging API channel's Basic settings, and set `NEXT_PUBLIC_DEMO_LINE_USER_ID` to it. The mock sign-in then acts as you, as that provider sees you.
  4. Issue a channel access token for LINE Bot MCP (Part D).

  The message's button opens `MAISON_LIFF_URL`, which only works from the phone if the app is public (option B). The message itself still arrives.

  **Rehearsal check:** block the Official Account and run the ops beat. LINE's push API answers 200 even then, but `get_profile` fails, so the agent records "failed" and pushes nothing. Unblock the account and run it again.
- **Option B, the real app in LINE:**
  1. Create a LINE Login channel under the same provider, with a LIFF app. Its endpoint is the app's public https URL, its scopes are `openid` and `profile`, and its size is `full`.
  2. Make Strapi public: Strapi Cloud or a tunnel, with `PUBLIC_URL` and `MAISON_APP_ORIGIN` set.
  3. Set `NEXT_PUBLIC_LIFF_MOCK=false`, `NEXT_PUBLIC_LIFF_ID`, `LINE_LOGIN_CHANNEL_ID` (the channel's ID, digits only), and `MAISON_LIFF_URL=https://liff.line.me/<LIFF ID>`. Remove `LINE_VERIFY_URL`.
- **MINI App (QBurst):**
  - A MINI App is a LIFF app on a MINI App channel: same code, with that channel's LIFF ID and channel ID.
  - The Official Account must be in the same provider. Otherwise user IDs differ, and confirmations can't be delivered.
  - A *verified* MINI App can send service messages instead of Official Account pushes.

## Part D: Staff and the ops agent

### Staff, in the Strapi admin

- **The Maison board** shows requests from the app and the concierge within 5 seconds, with the customer masked. On stage its filter is "All requests", so a confirmed row stays in view and changes status. **Confirm** appears on waiting requests whose visit is still ahead.
- **The in-admin chat** confirms too: "APT-… を確定してください" calls `maison__confirm_appointment`.
- **Confirming** publishes the appointment, whichever way it's done. It messages nobody.

### The ops agent (Claude Desktop, on the stage laptop)

- **Server 1: Maison ops.** Strapi's `/mcp` through `mcp-remote`, a local stdio bridge, with the "Maison ops" token as a bearer header.
  - It reaches `localhost` and needs no consent page.
  - Custom connectors added in Claude's settings are reached from Anthropic's cloud, so they need a public URL; use them only with option B.
  - Each run of the setup script mints a new ops token, so the Claude Desktop config is updated after it.
- **Server 2, LINE Bot MCP (option A only):** `npx @line/line-bot-mcp-server` with `CHANNEL_ACCESS_TOKEN`, and no `DESTINATION_USER_ID`, because every push names its recipient.
- **Default run:** choose the `send_pending_confirmations` prompt, and add that LINE Bot MCP isn't connected.
  - The agent calls `pending_confirmations`, shows the visit and its ready-made message, and records nothing.
  - The prompt assumes LINE Bot MCP. Without the added line, the agent could record a false "not reachable".
- **Option A run:** the prompt as it is. The agent checks the customer is reachable, pushes the message and records it.

### A customer's note is data, not an instruction

A customer's note (up to 500 characters) reaches staff's chat through `appointment_requests`, and could try to instruct the model.
- **What guards against it:** the tool descriptions tell the model to treat notes as information, and to confirm only a reference the staff member asked for. The chat has no approval step for tool calls, though.
- **What limits the damage:**
  - The chat can only confirm a future visit request. It can't message a customer, change content, or see a full LINE user ID.
  - Every confirmation shows on the board.
  - The message goes out only through the separate ops agent.
- **In production:** keep `appointments.confirm` off the chat's role, or add an approval step for tools that write.

This is a talk note: agents read what people wrote, so scope the tools, show every action, and keep a person in the loop for writes.

## Part E: The demo run

### Models

- **On stage:** Claude, with `ANTHROPIC_API_KEY` in `strapi/.env` and `liff/.env`, on a phone hotspot.
- **Rehearsal, or offline:** the local model, with no keys and Ollama running.
  - It's slower: 20–60 seconds a concierge turn, and one to two minutes a chat answer.
  - So staff confirm on the board.
- **Either way:** switching is only the keys and a restart of Strapi and the app. Claude Desktop needs the internet in both modes.

### Before going on stage

- **Start everything:** Strapi on the demo database, and the app, which starts the mock verifier.
- **Reset the data:** on the Maison admin page, reset demo appointments (it asks first), and set the board to "All requests". For a clean slate, delete the demo database and run the setup script again.
- **Warm up:** ask the concierge and the chat one question each (on the local model, this also loads it), and check that Claude Desktop lists the two ops tools and the prompt.
- **Network:** put the laptop on a phone hotspot. Turn Do Not Disturb on.

### The 3-minute run

| Time | Beat | Action |
|---|---|---|
| 0:00–0:30 | UX | The Maison app at phone size, signed in with LINE. Browse a collection and a product. Flip "Show agent view": every screen is an MCP tool call, the same tools an agent uses. |
| 0:30–1:10 | AX for the customer | Ask the concierge for a gift under ¥400,000 for someone who travels, and a Ginza visit on Saturday at 2 pm. Tool chips appear, then product cards. |
| 1:10–1:30 | Booking | Say yes. The request is sent and awaits the boutique. |
| 1:30–1:50 | The request arrives | It appears on the Maison board, created via the concierge, with the customer masked. |
| 1:50–2:20 | Staff confirm | Confirm on the board, or ask the in-admin chat to confirm it. |
| 2:20–2:45 | AX for staff | In Claude Desktop, run `send_pending_confirmations`. It shows the visit and its ready-made LINE message. With option A, the phone buzzes and the board shows LINE sent. |
| 2:45–3:00 | Handoff | The integration slide (Part F). "Everything is ready for a LINE MINI App: sign-in, tools, and the message." QBurst takes over. |

### Fallbacks

- **The concierge stalls, or the network drops:** use the product page's "Book a visit", which calls the same `request_appointment` tool.
- **The chat is slow or fails:** confirm on the board.
- **Claude Desktop fails:** show the confirmed row on the board, and the message on the slide.
- **Any beat stalls for more than 10 seconds:** switch to the backup video.

### Backup video

Recorded after the final rehearsal passes:
- **What it runs on:** the final build, a freshly seeded demo database, and the stage model (the local model if there's no key yet, with the waits trimmed in editing).
- **The screen:** 1920×1080, the app in a phone-sized window beside the board.
- **The cut:** one clip per beat, at most 3:00 in all, with no voiceover.
- **On stage:** it lives on the laptop and in the slide after "Meet Maison". The talk continues from S7 either way.

### Rehearsal checklist

- [ ] Run the scenario end to end three times with Claude, and once on the local model, resetting between runs.
- [ ] Check that the concierge's Japanese and English replies are natural and follow the instructions.
- [ ] Time each beat.
- [ ] In the admin:
  - the chat's Tools menu lists the six `maison__*` tools
  - asked to search appointments, the chat shows no LINE user ID
  - the board refreshes, confirms and filters
  - the reset asks first
  - the Content Manager shows no customer
- [ ] With option A, check the blocked-account case (Part C).
- [ ] Record the backup video.

## Part F: Integration slides and handoff to QBurst

1. **From UX to AX.** One content model, one MCP server, four consumers: screens, a customer's agent, a staff chat and an ops agent. Permissions, a human gate and verification keep the agents honest.
2. **Plugging in a LINE MINI App.**
   1. The MINI App calls `liff.getIDToken()`.
   2. oauth-mcp-manager exchanges it for a session (RFC 8693) after LINE verifies it.
   3. The app and its concierge call the Maison tools on Strapi `/mcp`.
   4. Staff confirm in Strapi. Confirmations go out through the Messaging API: LINE Bot MCP today, MINI App service messages once verified.
3. **What's ready for the MINI App team:**
   - the token endpoint and its parameters, and its two errors: `invalid_grant` (sign in again) and `temporarily_unavailable` (retry after `Retry-After`)
   - the tool list (customer and staff tools) and its error codes
   - the confirmation's flex message
   - the channel requirements: the MINI App and the Official Account in one provider, and one active LINE client per Strapi

   This is the list to send QBurst before the event.
