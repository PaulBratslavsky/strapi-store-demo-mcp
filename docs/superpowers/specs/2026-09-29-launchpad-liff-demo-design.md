# LaunchPad integration, LIFF app and demo: design

- **Date:** 2026-09-29
- **Status:** Draft for review
- **Overview:** [AX luxury demo overview](2026-09-29-ax-luxury-demo-overview.md)
- **Target repo:** [PaulBratslavsky/LaunchPad](https://github.com/PaulBratslavsky/LaunchPad) (the fork): Strapi configuration plus a new `liff/` frontend
- **Depends on:** [Maison plugin](2026-09-29-maison-plugin-design.md) and [oauth-mcp-manager 1.1](2026-09-29-oauth-mcp-manager-line-design.md)

## Part A: LaunchPad Strapi

### Plugins

- `strapi-store-demo-mcp` (Maison) and `strapi-oauth-mcp-manager`. Both are linked with yalc during development and installed from npm once published.
- The local branch `feat/store-demo-mcp-plugin` already links the old store-analytics build. This work replaces that link.

### Configuration

| File | Change |
|---|---|
| `config/server.ts` | `mcp: { enabled: env.bool('MCP_ENABLED', true) }` (already on the local branch). `url: env('PUBLIC_URL')` so OAuth metadata and links use the public https address. |
| `config/admin.ts` | `secrets: { encryptionKey: env('ENCRYPTION_KEY') }`, which oauth-mcp-manager needs to decrypt admin tokens |
| `config/plugins.ts` | `maison: { config: { liffUrl, houseName } }` and `'strapi-oauth-mcp-manager': { config: { identityProviders: { line: { channelId } } } }` |
| `config/middlewares.ts` | Replace `'strapi::cors'` with the object form: `origin` = LaunchPad's existing frontends plus the LIFF app origin; `methods` `GET, POST, DELETE, OPTIONS`; `headers` `Content-Type`, `Authorization`, `Accept`, `mcp-session-id`, `mcp-protocol-version`, `Last-Event-ID`; `expose` `WWW-Authenticate`, `mcp-session-id`, `mcp-protocol-version` |
| `.env.example` | `ENCRYPTION_KEY`, `PUBLIC_URL`, `LINE_LOGIN_CHANNEL_ID`, `MAISON_LIFF_URL` |

### Users, roles and tokens

These are one-time setup steps, documented in the runbook.

1. **Admin role "Maison app (MCP)":** only `plugin::maison.catalog.read` and `plugin::maison.appointments.request`. A service admin user, "Maison App", has only this role.
2. **Admin token "Maison customer"**, owned by Maison App, with those two permissions and no expiry.
3. **OAuth client "Maison LIFF"** in oauth-mcp-manager: customer sign-in LINE, public, mapped to "Maison customer".
4. **Admin token "Maison ops"**, owned by the presenter's staff account, with only `plugin::maison.confirmations.send`. Picked on the consent page when Claude Desktop connects.
5. **Staff:** the presenter's admin account publishes appointments and loads or resets demo data (`plugin::maison.demo.manage`).

### Hosting

- A Strapi Cloud project for the LaunchPad fork's `strapi/` directory, with the variables above.
- Strapi needs a public https URL because the phone calls it directly and Claude Desktop's custom connector connects to it. LINE is only ever called *by* Strapi, never the other way round.
- Local development uses `localhost`; LIFF itself is tested through LIFF Mock (Part B).

## Part B: The LIFF app (`liff/`)

A new frontend in the LaunchPad monorepo, next to `next/`, `astro/`, `nuxt/` and `tanstack/`:

- **Registered in `scripts/frontends.mts`** as `liff` (port 3003, Strapi URL key `NEXT_PUBLIC_STRAPI_URL`), so `yarn setup` installs it. A new root script, `"dev:liff": "node --import tsx ./scripts/dev.mts liff"`, starts it with Strapi like the other frontends.
- **Deployed as its own Vercel project** (root directory `liff`).
- **Not inside `next/`:** LaunchPad's Next app redirects every path to a locale and wraps pages in the marketing layout, and the LIFF app needs neither.

### Stack

- Next.js 16 (App Router), React 19, TypeScript, and Tailwind, matching LaunchPad's `next/` versions.
- `@line/liff`, `@modelcontextprotocol/sdk` (client), and the Vercel AI SDK for the concierge.
- The exact AI SDK and MCP-client APIs are taken from the installed package docs during planning, not from memory.

### Session (`lib/session.ts`)

1. `liff.init({ liffId })`. Outside LINE, if not logged in, call `liff.login()`.
2. `idToken = liff.getIDToken()`, then `POST` to the token endpoint with the token-exchange parameters (oauth-mcp-manager spec).
3. Keep the access token in memory. Never put it in `localStorage`, and never send LINE profile data to any server (LINE's guidance).
4. On a `401` from `/mcp`, exchange again once. If LINE rejects the ID token, run `liff.login()` again.

### MCP client (`lib/mcp.ts`)

- A single `Client` with `StreamableHTTPClientTransport` to `${STRAPI_URL}/mcp`, with the session token in `Authorization`.
- Screens call `client.callTool({ name, arguments })` and render `structuredContent`.
- Each call is recorded for the agent view: tool name, arguments, result, and duration.
- `isError` results render the error's `message`, plus a retry control where the hint suggests one.

### Screens

The locale comes from `liff.getLanguage()`: `ja*` gives `ja`, anything else `en`.

| Route | Tools | Contents |
|---|---|---|
| `/` | `browse_collections` | House wordmark, collections, "Ask the concierge" button |
| `/collections/[slug]` | `search_products({ collection })` | Product grid with price and badges |
| `/products/[slug]` | `get_product`, `get_boutiques({ productSlugs })` | Images, price, craft story, personalization, stock by boutique, and a "Book a visit" sheet (boutique, date, time, note) calling `request_appointment` |
| `/concierge` | via `/api/concierge` | Chat with tool chips and product cards |
| `/visits` and `/visits/[reference]` | `my_appointments` | Statuses: awaiting boutique, confirmed, LINE sent. The target of the LINE message's button. |

Every screen shows a small badge naming its tool. A **"Show agent view"** toggle, in the header and remembered per device, opens a drawer with the recorded MCP calls for the current screen.

### Concierge (`app/api/concierge/route.ts`)

- **Runtime:** Node, the Vercel default.
- **Request:** `{ messages, locale }` with `Authorization: Bearer <customer session token>`. The route never holds its own Strapi credentials.
- **MCP client:** created per request to Strapi `/mcp`, with the customer's token and `x-maison-surface: concierge`. Tools come from `tools/list`, so the model sees exactly what this customer's token allows.
- **Model:** Claude Sonnet 5, through the AI SDK. The provider wiring (Vercel AI Gateway or the Anthropic provider) is chosen in the plan. Tool calls are capped at 6 steps per turn, and the reply is streamed.
- **Streaming to the UI:**
  - text deltas
  - tool call and tool result events, rendered as chips like `search_products ✓ 3 results`
  - product and appointment cards, built from `structuredContent`, never parsed from the model's text
- **System prompt rules:**
  1. Use tools for every fact about products, prices, stock and hours. Never invent any of them.
  2. Before calling `request_appointment`, restate the boutique, date, time and products, and wait for the customer's yes.
  3. Never say an appointment is confirmed. Say it's requested and the boutique will confirm on LINE.
  4. If a tool returns an error, follow its hint or ask the customer.
  5. Reply in polite Japanese (keigo) when the locale is `ja`, English otherwise. Keep replies short.
- **Limits:** 20 messages of history, 1,000 characters per message, and a 30-second timeout.

### Look and feel

- **Style:** restrained luxury: off-white or charcoal, a serif wordmark, generous spacing, and full-bleed product imagery.
- **Layout:** mobile-first at 375 px. LIFF size `full`.
- **Accessibility:** tap targets of 44 px or more, alt text from the product images' alternative text, and the phone's text-size setting respected.

### Testing

- **Local development outside LINE:** LIFF Mock (`@line/liff-mock`) with a mocked ID token. Strapi runs locally, with the oauth-mcp-manager provider pointed at a mock verify server (the plugin's test-only `verifyUrl`).
- **Playwright smoke test:** home, then a collection, a product, book a visit, and check "My visits" shows the request as awaiting the boutique. It also checks that the agent view lists the tools each screen called.
- **Concierge contract test:** with a stubbed model, the route forwards the customer's token and never adds one of its own.

## Part C: LINE setup (runbook)

There are two tracks with the same code, differing only in channel IDs:

- **Stage:** a provider from LY/QBurst containing an unverified **LINE MINI App channel** and a **Messaging API channel**, with the presenter as admin. Request it on day 1. In that provider:
  - create the LIFF app inside the MINI App channel, with the same settings as step 3 below
  - issue the Official Account's channel access token for LINE Bot MCP
  - set `LINE_LOGIN_CHANNEL_ID` to the MINI App channel's ID and `MAISON_LIFF_URL` to its LIFF URL
- **Development and fallback:** the presenter's own provider, following steps 1–5 below. If the stage channels haven't arrived by 5 October, present on this track.

1. **LINE Developers:** sign in and create a provider, for example "Maison Demo". **Check first** that this account can create a LINE Official Account in a supported region. If not, development waits for the LY/QBurst provider.
2. **Official Account:** create it in LINE Official Account Manager, enable the Messaging API, and assign it to the **same provider**. Issue a long-lived channel access token for LINE Bot MCP.
3. **LINE Login channel** under the same provider:
   - Create a LIFF app: endpoint = the Vercel URL of `liff/`, scopes `openid` and `profile`, size `full`.
   - Set "Add friend option" to prompt adding the Official Account.
   - Note the channel ID (`LINE_LOGIN_CHANNEL_ID`) and the LIFF ID (`MAISON_LIFF_URL = https://liff.line.me/<LIFF ID>`).
4. **Test accounts:**
   - the presenter's phone, which has added the Official Account
   - a second LINE account that has **not** added it, for the optional failure beat
5. **Switching to the stage track:** change `LINE_LOGIN_CHANNEL_ID`, `MAISON_LIFF_URL`, the OAuth client's channel settings, and LINE Bot MCP's channel access token. Then reset demo appointments, because user IDs differ between providers. No code changes.
6. **Production note for the talk:** a *verified* MINI App would send this confirmation as a MINI App service message, with no friend needed. That requires verification and reviewed templates, so the demo uses the Official Account.

## Part D: Ops agent (stage laptop)

- **Claude Desktop, connector 1:** add a custom connector for `<PUBLIC_URL>/mcp`. oauth-mcp-manager's consent page opens; sign in with the presenter's staff account and pick "Maison ops".
- **Claude Desktop, connector 2:** LINE Bot MCP as a local server:

  ```json
  {
    "mcpServers": {
      "line-bot": {
        "command": "npx",
        "args": ["@line/line-bot-mcp-server"],
        "env": { "CHANNEL_ACCESS_TOKEN": "<Official Account channel access token>" }
      }
    }
  }
  ```

  No `DESTINATION_USER_ID`: every push names its recipient.
- **Run:** pick the `send_pending_confirmations` prompt from the prompt menu.

## Part E: The demo run

### Before going on stage

- Load the demo catalog, then reset demo appointments.
- Warm Strapi and the LIFF app by opening both once.
- Connect the phone and laptop to a hotspot. Mirror the phone.
- For the failure beat: sign in to the LIFF app with the second (non-friend) LINE account, request a visit, and publish it in the admin. It then waits in the pending list with an unreachable customer.

### The 3-minute run

| Time | Action |
|---|---|
| 0:00–0:40 | Open the app in LINE. Browse a collection and a product. Flip "show agent view": this screen is `search_products`. |
| 0:40–1:30 | Ask the concierge for a gift under ¥400,000 for someone who travels, and a Ginza visit on Saturday. Tool chips appear, then a draft request. |
| 1:30–2:00 | In the Strapi admin, open the draft appointment (`createdVia: concierge`) and publish it. |
| 2:00–2:40 | In Claude Desktop, run `send_pending_confirmations`. It checks reachability, pushes, and records the result: 1 sent (1 failed if the failure beat is on). |
| 2:40–3:00 | The phone buzzes. Tap the message, and "My visits" shows Confirmed · LINE sent. |

### Fallbacks

- **Concierge stalls:** use the product page's Book button, which calls the same `request_appointment` tool.
- **Claude Desktop connector fails:** show the pending list in the Strapi admin and explain the loop.
- **Last resort:** a recorded clean run.

### Rehearsal checklist

- [ ] Run the scenario end to end three times, resetting between runs.
- [ ] Confirm the concierge's Japanese replies are natural and stay within the rules.
- [ ] Confirm the failure beat records `failed · not reachable` and the agent's summary says so.
- [ ] Record the backup video.
