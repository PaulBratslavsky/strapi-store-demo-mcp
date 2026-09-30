# LaunchPad integration, Maison app and demo: design

- **Date:** 2026-09-29, revised the same day
- **Status:** Draft for review
- **Overview:** [AX luxury demo overview](2026-09-29-ax-luxury-demo-overview.md)
- **Target repo:** [PaulBratslavsky/LaunchPad](https://github.com/PaulBratslavsky/LaunchPad) (the fork): Strapi configuration plus a new `liff/` frontend
- **Depends on:** [Maison plugin](2026-09-29-maison-plugin-design.md) and [oauth-mcp-manager 1.1](2026-09-29-oauth-mcp-manager-line-design.md)

> **Revision:** The presenter can't get a LINE MINI App channel in time, and QBurst presents the MINI App side of the event right after this talk. So the demo runs on the stage laptop, in a browser at phone size:
> - **LINE sign-in** is simulated with LINE's official LIFF mock and a local stand-in for LINE's ID-token verify endpoint.
> - **Every other step** is the production path.
> - **Switching to a real LIFF app or MINI App** is configuration only (Part C).
>
> Hosting is no longer needed. Part F covers the handoff slides.

## Part A: LaunchPad Strapi

### Plugins

- `strapi-store-demo-mcp` (Maison) and `strapi-oauth-mcp-manager` 1.1. Both are linked with yalc from their feature branches, and installed from npm once published.
- The local branch `feat/store-demo-mcp-plugin` already links the old store-analytics build. This work replaces that link.

### Configuration

| File | Change |
|---|---|
| `config/server.ts` | Keep `mcp: { enabled: env.bool('MCP_ENABLED', true) }`, which is already on the local branch. Add `url: env('PUBLIC_URL', undefined)`, needed only when Strapi is public (Part C, option B). |
| `config/admin.ts` | `secrets: { encryptionKey: env('ENCRYPTION_KEY') }`. oauth-mcp-manager needs it to decrypt admin tokens. |
| `config/plugins.ts` | `maison: { config: { liffUrl: env('MAISON_LIFF_URL', null) } }`. `'strapi-oauth-mcp-manager'` gets `identityProviders.line = { channelId: LINE_LOGIN_CHANNEL_ID, verifyUrl: LINE_VERIFY_URL }` when `LINE_LOGIN_CHANNEL_ID` is set, and `{}` otherwise. |
| `config/middlewares.ts` | Replace `'strapi::cors'` with the object form (see below). |
| `.env.example` | `ENCRYPTION_KEY`, `LINE_LOGIN_CHANNEL_ID`, `LINE_VERIFY_URL`, `MAISON_LIFF_URL`, `MAISON_APP_ORIGIN`, `PUBLIC_URL` |

The CORS object:
- **`origin`:** LaunchPad's frontends, `http://localhost:3003` (the Maison app), and `MAISON_APP_ORIGIN` when set
- **`methods`:** `GET, POST, DELETE, OPTIONS`
- **`headers`:** `Content-Type`, `Authorization`, `Accept`, `mcp-session-id`, `mcp-protocol-version`, `Last-Event-ID`
- **`expose`:** `WWW-Authenticate`, `mcp-session-id`, `mcp-protocol-version`

Stage values:

| Variable | Value |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | `1234567890`, the mock's channel |
| `LINE_VERIFY_URL` | `http://localhost:4545/verify` |
| `MAISON_LIFF_URL` | `http://localhost:3003` |

### Tokens and the app's client

A setup script, `strapi/scripts/maison-setup.mjs`, runs against the running Strapi as the local admin. It's safe to run again: it replaces what it created before.

1. **Loads the demo catalog.**
2. **Admin token "Maison customer"**, with `plugin::maison.catalog.read` and `plugin::maison.appointments.request`, owned by the presenter's admin account.
3. **OAuth client "Maison app"** with customer sign-in LINE, mapped to "Maison customer". Its client ID goes into the app's `.env` as `NEXT_PUBLIC_MAISON_CLIENT_ID`.
4. **Admin token "Maison ops"**, with only `plugin::maison.confirmations.send`. Its key goes into a gitignored file that the Claude Desktop setup reads (Part D).

**Production note** (README and slide): the customer token should belong to a dedicated service admin with a narrow role. The token's permissions are clamped to its owner's, so a narrow owner can't be widened by mistake.

### Hosting

None for the stage. Strapi, the app and the mock verify endpoint all run on the laptop. Only the concierge route needs the internet, to reach Claude.

## Part B: The Maison app (`liff/`)

A new frontend in the LaunchPad monorepo, next to `next/`, `astro/`, `nuxt/` and `tanstack/`:
- **Registered in `scripts/frontends.mts`** as `liff`: port 3003, Strapi URL key `NEXT_PUBLIC_STRAPI_URL`, and no admin preview target.
- **`yarn setup` installs it**, and a new root script, `yarn dev:liff`, starts it with Strapi. The app's own `dev` script also starts the mock verify endpoint.
- **Not inside `next/`:** LaunchPad's Next app redirects every path to a locale and wraps pages in the marketing layout. The Maison app needs neither.

### Stack

- Next.js 16 (App Router), React 19, TypeScript and Tailwind, matching LaunchPad's `next/` versions (Next ^16.3.1, React ^19.2.8, TypeScript 5.6, Tailwind 3.4)
- `@line/liff` and `@line/liff-mock`, the MCP SDK client, and AI SDK 7 for the concierge
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

### MCP client (`lib/mcp.ts`)

- A single `Client` with `StreamableHTTPClientTransport` to `${STRAPI_URL}/mcp`, with the session token in `Authorization`.
- Screens call `client.callTool({ name, arguments })` and render `structuredContent`.
- Each call is recorded for the agent view: tool name, arguments, result, duration and screen.
- An `isError` result renders the error's `message`, plus a retry button where the hint suggests one.

### Screens

The locale comes from `liff.getAppLanguage()`: `ja*` gives `ja`, anything else `en`.

| Route | Tools | Contents |
|---|---|---|
| `/` | `browse_collections` | House wordmark, collections, "Ask the concierge" button |
| `/collections/[slug]` | `search_products({ collection })` | Product grid with price and badges |
| `/products/[slug]` | `view_product`, `find_boutiques({ productSlugs })` | Images, price, craft story, personalization and stock by boutique. A "Book a visit" sheet (boutique, date, time, note) calls `request_appointment`. |
| `/concierge` | through `/api/concierge` | Chat with tool chips and product cards |
| `/visits` and `/visits/[reference]` | `my_appointments` | Statuses: awaiting boutique, confirmed, confirmation sent. `/visits/[reference]` is where the LINE message's button leads. |

Every screen shows a small badge naming its tool. A **"Show agent view"** toggle in the header, remembered per device, opens a drawer with the recorded MCP calls for the current screen.

On a screen wider than 500 px, the app renders inside a phone-sized frame on a dark backdrop, for the stage.

### Concierge (`app/api/concierge/route.ts`)

- **Runtime:** Node.
- **Request:** `{ messages, locale }`, with `Authorization: Bearer <customer session token>`. The route never holds its own Strapi credentials.
- **MCP client:** created per request to Strapi `/mcp`, with the customer's token and `x-maison-surface: concierge`. Tools come from `tools/list`, so the model sees exactly what this customer's token allows.
- **Model:** Claude Sonnet 5 through AI SDK 7. With `ANTHROPIC_API_KEY`, it uses `anthropic('claude-sonnet-5')`; otherwise it uses the AI Gateway string `'anthropic/claude-sonnet-5'`. Tool use is capped at 6 steps per turn, and the reply is streamed.
- **Streaming to the UI:**
  - text deltas
  - tool calls and results, rendered as chips like `search_products ✓ 5 results`
  - product and appointment cards, built from `structuredContent`, never parsed from the model's text
- **Instructions:**
  1. Use tools for every fact about products, prices, stock and hours. Never invent any of them.
  2. Before calling `request_appointment`, restate the boutique, date, time and products, and wait for the customer's yes.
  3. Never say an appointment is confirmed. Say it's requested, and that the boutique will confirm it on LINE.
  4. If a tool returns an error, follow its hint or ask the customer.
  5. Reply in polite Japanese (keigo) when the locale is `ja`, and in English otherwise. Keep replies short.
  6. Times are in Japan time (Asia/Tokyo). Write `requestedFor` with the `+09:00` offset.
- **Limits:** 20 messages of history, 1,000 characters per message, and a 60-second timeout.

### Look and feel

- **Style:** restrained luxury: off-white or charcoal, a serif wordmark, generous spacing, and full-bleed product imagery.
- **Layout:** mobile-first at 375 px, with the phone frame above 500 px.
- **Accessibility:** tap targets of 44 px or more, alt text from the product images' alternative text, and the phone's text-size setting respected.

### Testing

- **Unit tests (vitest):** the token exchange with its one retry, the MCP call recorder, and the model choice.
- **Concierge contract test:** with a mock model, the route forwards the customer's token and the surface header to Strapi, and never adds a credential of its own.
- **Playwright smoke test, in mock mode against local Strapi:**
  - home, then a collection, a product, book a visit, and "My visits" shows the request as awaiting the boutique
  - the agent view lists the tools each screen called
  - a second demo customer (`?demoUser=`) does not see the first customer's visit

## Part C: LINE (simulated on stage, real LINE optional)

- **Stage (default):** no LINE account needed. The app runs in mock mode, and Strapi verifies against the local mock.
- **Option A, real delivery (the phone buzzes):**
  1. In LINE Developers, create a provider and an Official Account with the Messaging API. Check first that your account can create one from your region.
  2. Add the Official Account as a friend on your phone.
  3. Copy "Your user ID" from the Messaging API channel's Basic settings, and set `NEXT_PUBLIC_DEMO_LINE_USER_ID` to it. The mock sign-in then acts as you, as that provider sees you.
  4. Issue a channel access token for LINE Bot MCP (Part D).

  The message's button opens `MAISON_LIFF_URL`, which only works from the phone if the app is public (option B). The message itself still arrives.
- **Option B, the real app in LINE:**
  1. Create a LINE Login channel under the same provider, with a LIFF app. Its endpoint is the app's public https URL, its scopes are `openid` and `profile`, and its size is `full`.
  2. Make Strapi public: Strapi Cloud or a tunnel, with `PUBLIC_URL` and `MAISON_APP_ORIGIN` set.
  3. Set `NEXT_PUBLIC_LIFF_MOCK=false`, `NEXT_PUBLIC_LIFF_ID`, `LINE_LOGIN_CHANNEL_ID` (the channel's ID), and `MAISON_LIFF_URL=https://liff.line.me/<LIFF ID>`. Remove `LINE_VERIFY_URL`.
- **MINI App (QBurst):**
  - A MINI App is a LIFF app on a MINI App channel: same code, with that channel's LIFF ID and channel ID.
  - The Official Account must be in the same provider. Otherwise user IDs differ, and confirmations can't be delivered.
  - A *verified* MINI App can send service messages instead of Official Account pushes.

## Part D: Ops agent (stage laptop)

- **Claude Desktop, server 1: Maison.** Strapi's `/mcp` through `mcp-remote`, a local stdio bridge, with the "Maison ops" token as a bearer header. It reaches `localhost` and needs no consent page. Custom connectors added in Claude's settings are reached from Anthropic's cloud, so they need a public URL; use them only with option B.
- **Server 2, LINE Bot MCP (option A only):** `npx @line/line-bot-mcp-server` with `CHANNEL_ACCESS_TOKEN`, and no `DESTINATION_USER_ID`, because every push names its recipient.
- **Default run:** ask "Which confirmed visits still need a LINE confirmation?" The agent calls `pending_confirmations` and shows the visit and its ready-made message.
- **Option A run:** pick the `send_pending_confirmations` prompt.

## Part E: The demo run

### Before going on stage

- **Start everything:** `yarn dev:liff` starts Strapi, the app and the mock verifier.
- **Reset the data:** on the Maison admin page, load the demo catalog, then reset demo appointments.
- **Warm up:** open the app once, and check Claude Desktop lists the two ops tools.
- **Network:** put the laptop on a phone hotspot.

### The 3-minute run

| Time | Beat | Action |
|---|---|---|
| 0:00–0:40 | UX | The Maison app at phone size. Browse a collection and a product. Flip "Show agent view": every screen is an MCP tool call, the same tools an agent uses. |
| 0:40–1:30 | AX for the customer | Ask the concierge for a gift under ¥400,000 for someone who travels, and a Ginza visit on Saturday at 2 pm. Tool chips appear, then a request that says it's awaiting the boutique. |
| 1:30–2:00 | The human gate | In the Strapi admin, open the draft appointment (`createdVia: concierge`) and publish it. |
| 2:00–2:40 | AX for staff | In Claude Desktop, ask which confirmed visits still need a LINE confirmation. The agent lists the visit and its ready-made LINE message, and it can't approve or edit anything. With option A, run `send_pending_confirmations` and the phone buzzes. |
| 2:40–3:00 | Handoff | The integration slide (Part F). "Everything is ready for a LINE MINI App: sign-in, tools, and the message." QBurst takes over. |

### Fallbacks

- **The concierge stalls, or the network drops:** use the product page's "Book a visit", which calls the same `request_appointment` tool.
- **Claude Desktop fails:** open the pending visit in the Strapi admin and walk through the list on the slide.
- **Last resort:** a recorded clean run.

### Rehearsal checklist

- [ ] Run the scenario end to end three times, resetting between runs.
- [ ] Check the concierge's Japanese and English replies are natural and follow the instructions.
- [ ] Time each beat.
- [ ] Record the backup video.

## Part F: Integration slides and handoff to QBurst

1. **From UX to AX.** One content model, one MCP server, three consumers: screens, a customer's agent and a staff agent. Permissions, a human gate and verification keep the agents honest.
2. **Plugging in a LINE MINI App.**
   1. The MINI App calls `liff.getIDToken()`.
   2. oauth-mcp-manager exchanges it for a session (RFC 8693) after LINE verifies it.
   3. The app and its concierge call the Maison tools on Strapi `/mcp`.
   4. Confirmations go out through the Messaging API: LINE Bot MCP today, MINI App service messages once verified.
3. **What's ready for the MINI App team:**
   - the token endpoint and its parameters
   - the tool list and its error codes
   - the confirmation's flex message
   - the channel requirement: the MINI App and the Official Account in one provider

   This is the list to send QBurst before the event.
