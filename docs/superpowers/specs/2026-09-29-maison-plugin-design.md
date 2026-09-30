# Maison plugin: design

- **Date:** 2026-09-29
- **Status:** Draft for review. Amended 2026-09-30: staff review and confirmation, chat tools for the in-admin chat, and the requests board (see "Four surfaces").
- **Overview:** [AX luxury demo overview](2026-09-29-ax-luxury-demo-overview.md)
- **Repo:** this one (`strapi-store-demo-mcp`). The store-analytics code it started from is replaced.

## Purpose

A Strapi 5 plugin that carries a fictional luxury house's content model, the MCP tools that expose it to people's apps and to agents, and demo seed data. Installing it into any Strapi 5.55.1+ app with MCP enabled gives that app the full "Maison" domain with no app-level code.

## Identity and naming

- **Plugin id:** `maison` (placeholder until the house is named). All UIDs are `plugin::maison.*` and all permission actions are `plugin::maison.*`.
- **Package name:** stays `strapi-store-demo-mcp` until the house is named, then renamed in one commit (package name, README, repo).
- **Requirements:** Strapi `^5.55.1`, `server.mcp.enabled: true`, and the i18n plugin, which is enabled by default.

## Content types

Plugin components aren't possible: Strapi 5 loads components only from the app's `src/components` (`@strapi/core/dist/loaders/components.js`). The model therefore uses plain fields, JSON with validated shapes, and one extra collection type.

All six types set `pluginOptions['content-manager'].visible = true`, so staff can edit and publish them. They also set `pluginOptions['content-type-builder'].visible = false`, so the schema is changed through plugin extensions rather than the builder.

### `collection`: draft & publish, localized

| Field | Type | Localized | Notes |
|---|---|---|---|
| `name` | string, required | yes | |
| `slug` | uid (from `name`), required | no | Same slug in every locale |
| `story` | blocks | yes | |
| `heroImage` | media, single image | no | |
| `products` | relation, one-to-many → `product` | — | `mappedBy: collection` |

### `product`: draft & publish, localized

| Field | Type | Localized | Notes |
|---|---|---|---|
| `name` | string, required | yes | |
| `slug` | uid, required | no | |
| `sku` | string, required, unique | no | |
| `category` | enumeration: `trunk`, `bag`, `small-leather`, `travel`, `objet` | no | |
| `description` | blocks | yes | |
| `craftStory` | text | yes | One or two sentences about the making |
| `priceJpy` | integer, required, min 0 | no | Whole yen |
| `images` | media, multiple images | no | |
| `widthCm`, `heightCm`, `depthCm` | decimal | no | |
| `personalizable` | boolean, default `false` | no | |
| `personalizationKinds` | JSON | no | Array of `initials-hot-stamp`, `hand-painted-stripes`, `monogram-color` |
| `personalizationLeadDays` | integer, min 0 | no | |
| `giftOccasions` | JSON | no | Array of `travel`, `anniversary`, `birthday`, `wedding`, `new-job` |
| `collection` | relation, many-to-one → `collection` | — | `inversedBy: products` |

### `boutique`: draft & publish, localized

| Field | Type | Localized | Notes |
|---|---|---|---|
| `name` | string, required | yes | |
| `slug` | uid, required | no | |
| `city` | string | yes | |
| `address` | text | yes | |
| `openingHours` | JSON, required | no | `[{ "weekday": "mon", "opens": "11:00", "closes": "20:00" }, …]`. A weekday that's missing means closed. |
| `image` | media, single image | no | |

### `stock-level`: no drafts, not localized

| Field | Type | Notes |
|---|---|---|
| `productSlug` | string, required | The product's slug. A string, not a relation (see the relation check below). |
| `boutiqueSlug` | string, required | The boutique's slug |
| `quantity` | integer, required, min 0 | |

One row per product and boutique pair, enforced by the validation middleware below.

### `appointment`: draft & publish, not localized

Publishing an appointment **is** the staff confirmation.

| Field | Type | Notes |
|---|---|---|
| `reference` | string, required, unique | Short and human-readable, for example `APT-4821` |
| `customer` | string, required, **private** | `line:U` + 32 hex characters. Never in REST responses. |
| `boutique` | relation, many-to-one → `boutique` | |
| `products` | relation, many-to-many → `product` | 1–5 |
| `requestedFor` | datetime, required | |
| `customerNote` | text, max 500 | |
| `createdVia` | enumeration: `concierge`, `app` | Informational |

### `notification`: no drafts, not localized, append-only

| Field | Type | Notes |
|---|---|---|
| `appointmentReference` | string, required | The appointment's `reference`. A string, not a relation (see the relation check below). |
| `channel` | enumeration: `line` | |
| `outcome` | enumeration: `sent`, `failed` | Named `outcome` because `status` is a reserved attribute name in Strapi 5. Tools still call it `status`. |
| `sentAt` | datetime | When the outcome was recorded |
| `detail` | text, max 500 | LINE's response, or why it failed |
| `recordedBy` | string | For example `ops-agent` |

### Validation

Shared helpers enforce these rules in a document-service middleware (`strapi.documents.use`, registered in `register()`), so the admin and the tools apply the same rules:

- `openingHours`: valid weekday keys, `HH:MM` times, `opens` before `closes`.
- `personalizationKinds` and `giftOccasions`: only the listed values.
- `stock-level`: product and boutique pairs are unique.

### First task in the plan: verify relation behaviour

Before building on these relations, verify on Strapi 5.55.1 how relations behave between non-localized types (`stock-level`, `appointment`, `notification`), draft & publish types, and localized types (`product`, `boutique`). Specifically:

- which locale and which version (draft or published) a relation points at when it's created through the document service
- whether it survives publishing

**Fallback if that's unworkable:** store `boutiqueSlug`, `productSlugs` and `productSlug` strings instead of relations, and resolve them in services. Tool contracts don't change either way.

**Result (29 September 2026), recorded in `docs/relation-check.md`:**
- **Republishing breaks relations from types without draft/publish.** `publish()` deletes and recreates a document's published row. A relation from a stock level or notification to that row is left pointing at nothing, silently.
- **Relations between two draft/publish types survive.** Appointment → boutique and products, and product → collection, survive publishing and republishing.

So stock levels store `productSlug` and `boutiqueSlug`, notifications store `appointmentReference`, and appointments and products keep their relations.

## Permissions

Registered in `bootstrap` with `admin::permission` `actionProvider.registerMany`, using `section: 'plugins'` and `pluginName: 'maison'`:

| Action UID | Display name | Used by |
|---|---|---|
| `plugin::maison.catalog.read` | MCP: browse the catalog | Catalog tools, on MCP and in the chat |
| `plugin::maison.appointments.request` | MCP: request and view own appointments | Customer tools |
| `plugin::maison.appointments.review` | MCP: review appointment requests | `appointment_requests`, on MCP and in the chat; the requests board |
| `plugin::maison.appointments.confirm` | MCP: confirm appointment requests | `confirm_appointment`, on MCP and in the chat; the board's Confirm button |
| `plugin::maison.confirmations.send` | MCP: send appointment confirmations | Ops tools and prompt; `pending_confirmations` in the chat |
| `plugin::maison.demo.manage` | Load and reset demo data | Admin page (demo data) |

The two staff actions use the same `subCategory: 'mcp'` as the other tool actions. They also gate the chat and the admin page, so one grant on a staff role covers every surface.

## Identity contract

- **Tools see the caller's original `Authorization` header.** Strapi's MCP transport builds `extra.requestInfo.headers` from the raw request (`rawHeaders`), so tools see the session token the client sent, not the admin key that oauth-mcp-manager swaps in for core's authentication. *A header set or deleted by a middleware never reaches tools, so no identity header is used.*
- **Tools that act for a customer ask oauth-mcp-manager who holds that token:** `strapi.plugin('strapi-oauth-mcp-manager').service('oauth').resolveSubject(authorization)`, which returns `line:U…` or `null` (oauth-mcp-manager 1.1 spec).
- **The result must match `^line:U[0-9a-f]{32}$`.** Anything else, `null`, a plain admin token, or oauth-mcp-manager not being installed all return `not_signed_in`.
- **A session token can't be forged,** so the identity can't be either. This plugin never accepts identity as a tool argument.
- **The helper is exposed as `strapi.plugin('maison').service('identity').getCustomerSubject(extra)`,** so app-level tools can reuse it.

## Four surfaces

One set of Maison services serves four surfaces. Each surface calls the same service method under the same permission, so staff get the same answer however they ask.

| Surface | Used by | Reaches the services through | Gate |
|---|---|---|---|
| MCP tools on `/mcp` | The customer app, its concierge, an ops agent in Claude Desktop | `strapi.ai.mcp.registerTool` in `register()` | The token's Maison permissions (`auth.policies`) |
| In-admin chat | Staff, through `strapi-plugin-tanstack-ai` 1.6.0 | The `ai-tools` service, built from the MCP tool definitions | The signed-in admin's role, one action per tool |
| Maison admin page | Staff | Admin routes under `/maison` | `admin::hasPermissions` |
| Content Manager | Staff | Strapi's own editing and Publish | Content Manager permissions |

In the talk, staff ask the chat about new requests and confirm one. The ops agent in Claude Desktop then sends the LINE confirmation with the existing tools, and the requests board shows each step land.

- **Staff actions.** `appointments.review` and `appointments.confirm` join the four existing actions (see "Permissions").
- **Staff service methods.** `appointments.listRequests(filters)` and `appointments.confirm(reference, now?)` live in the appointments service, not a new one. They reuse its private helpers (published labels, confirmation state, delivery state) and its rule that publishing an appointment confirms it.
- **Staff MCP tools.** `appointment_requests` and `confirm_appointment` (see "Staff" in the tool contract).
- **Chat tools.** A service named `ai-tools` implements the `strapi-plugin-tanstack-ai` 1.6.0 contract:
  - **Contract.** `getTools()` returns `[{ name, description, schema, action, execute }]` and `getMeta()` returns `{ label, description }`. The chat looks for the service on every installed plugin, offers the tools as `maison__<name>`, and shows each one only to admins whose role holds its `action`.
  - **One adapter.** Every chat tool is an MCP tool definition passed through one adapter, so the two surfaces can't drift. It keeps the same name, description, input schema and permission. `execute(args)` validates `args` with the schema, runs `createHandler(strapi, context)({ args, extra: {} })`, and returns `structuredContent`. An `isError` result becomes `{ error: { code, message, hint } }`.
  - **No handler context.** The chat gives `execute` no admin user or ability. No Maison handler reads the MCP handler context, so the adapter passes a placeholder.
  - **Offered:** `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `appointment_requests`, `confirm_appointment`, and `pending_confirmations`, which is read-only.
  - **Not offered:** `request_appointment` and `my_appointments` need a signed-in LINE customer, and a chat has an admin instead. `record_confirmation` only follows a LINE push, which the ops agent makes.
  - **Disabled tools.** Tools listed in `disabledTools` are left out of the chat as well as MCP.
  - **Zod.** The chat's `@tanstack/ai` 0.52 converts a schema through its Standard JSON Schema (`~standard.jsonSchema`), which zod 4 provides. Maison's schemas come from `@strapi/utils`, which is zod 4.4.3 in Strapi 5.55.1. The chat plugin builds its own tools with the same `z`.
- **Admin routes and page.** See "Admin page".
- **Content Manager.** Publishing an appointment there is the same confirmation as `confirm_appointment` and the board's Confirm button.

**LaunchPad, not this plugin, installs the chat.** The LaunchPad plan (plan 3) installs `strapi-plugin-tanstack-ai` and configures it with `chat: { provider: 'anthropic', model: 'claude-sonnet-5', apiKey: env('ANTHROPIC_API_KEY') }`. Maison only provides the `ai-tools` service. Without the chat plugin, nothing calls it.

## Tool contract

Registered in `register()` with `strapi.ai.mcp.registerTool`, using zod from `@strapi/utils`:

- **Outputs** are top-level objects with a matching `resolveOutputSchema`.
- **Reads** take `locale` (`ja` | `en`, default from config) and return **published** content only.
- **Errors** don't throw. They return `{ isError: true, content: [{ type: 'text', text }] }`, where `text` is JSON: `{ "error": { "code", "message", "hint" } }`. Core passes `isError` through (`toSdkMcpCapabilityResult.js`); thrown errors would become a generic message.
- **Error codes:** `not_signed_in`, `not_found`, `invalid_input`, `boutique_closed`, `in_the_past`, `too_many_open_requests`, `not_published`, `not_configured`.
- **Names** never start with `list_`, `get_`, `create_`, `update_`, `delete_`, `publish_`, `unpublish_`, `write_` or `discard_`. Strapi's Content Manager generates tools with those prefixes for every content type in the host app (for example `get_product` for LaunchPad's `api::product.product`), and a duplicate name stops Strapi from booting.
- **Descriptions** say when to use the tool and what it won't do. For example, `request_appointment`: "Creates a request that a boutique must confirm; never tell the customer it is confirmed."

### Catalog: `catalog.read`

| Tool | Input | Output |
|---|---|---|
| `browse_collections` | `locale?` | `{ locale, collections: [{ slug, name, teaser, heroImageUrl, productCount }] }`. `teaser` is the first 160 characters of `story` as plain text. |
| `search_products` | `query?` (≤100 chars; name and description match), `collection?`, `category?`, `occasion?`, `minPriceJpy?`, `maxPriceJpy?`, `personalizable?`, `inStockAt?` (boutique slug), `locale?`, `limit?` (1–20, default 8) | `{ locale, total, products: [{ slug, name, category, priceJpy, imageUrl, occasions, personalizable, inStockAt: [boutiqueSlug] }] }`, sorted by price, highest first |
| `view_product` | `slug`, `locale?` | `{ product: { slug, sku, name, category, priceJpy, description (plain text), craftStory, dimensionsCm \| null, personalization: { offered, kinds, leadDays }, images: [{ url, alt }], occasions, collection: { slug, name }, stock: [{ boutique, name, quantity }] } }`. `not_found` if missing. |
| `find_boutiques` | `productSlugs?` (≤5), `date?` (`YYYY-MM-DD`), `locale?` | `{ date, boutiques: [{ slug, name, city, address, hours, openOnDate, hoursOnDate, stock: [{ product, quantity }] }] }`. `openOnDate` and `hoursOnDate` are `null` without `date`. |

### Appointments: `appointments.request`, signed-in customer required

`request_appointment`

- **Input:** `boutique` (slug), `productSlugs` (1–5), `requestedFor` (ISO 8601 with offset), `note?` (≤500 chars).
- **Checks, in order:**
  1. The subject is present and valid (`not_signed_in`).
  2. The boutique and products exist and are published (`not_found`).
  3. `requestedFor` is at least 30 minutes from now (`in_the_past`).
  4. It's within the boutique's opening hours in the configured timezone (`boutique_closed`, whose hint lists that day's hours).
  5. The customer has fewer than `maxOpenRequestsPerCustomer` unpublished future requests (`too_many_open_requests`).
- **Action:** creates a **draft** appointment. `createdVia` is `concierge` when the request carries `x-maison-surface: concierge` (informational, not trusted), otherwise `app`. The record is read back.
- **Output:** `{ appointment: { reference, status: "requested", boutique: { slug, name }, requestedFor, products: [{ slug, name }], note } }`

`my_appointments`

- **Input:** `locale?`
- **Output:** `{ appointments: [{ reference, status: "requested" | "confirmed", boutique, requestedFor, products, confirmationSent }] }`, newest first. Only the caller's appointments.
- **Status:** `confirmed` means a published version exists. `confirmationSent` means a `sent` notification exists.

### Staff: `appointments.review` and `appointments.confirm`

Staff tools act as whoever holds the token or admin session. They never take or show a customer's identity.

`appointment_requests` (`appointments.review`)

- **Input:**
  - `status?`: `requested` (the default), `confirmed` or `all`
  - `boutique?`: a slug
  - `date?`: `YYYY-MM-DD`, a calendar day in the configured timezone
  - `limit?`: 1–50, default 20
  - `locale?`, like every read
- **Status:**
  - `requested` lists what staff can still confirm: no published version yet, and the visit hasn't started.
  - `confirmed` lists appointments with a published version.
  - `all` lists everything, including unconfirmed requests whose time has passed.
- **Order:** `requested` by visit time, soonest first. `confirmed` and `all` newest request first (`createdAt`).
- **Output:** `{ appointments: [{ reference, status, customer, boutique: { slug, name } | null, requestedFor, products: [{ slug, name }], note, createdVia, confirmationSent, createdAt }] }`
  - `customer` is masked: `line:U`, three characters, `…`, the last two, as in `line:U4af…88`. Anything that isn't a valid subject shows as `unknown`. The full subject is never returned.
  - `requestedFor` and `createdAt` are ISO 8601 in the configured timezone, via `toZonedIso`.
- **Labels** come from published versions, in `locale` with a fallback to `defaultLocale`, and never from drafts. A boutique that's no longer published is `null`, and an unpublished product is left out.
- **Errors:** `not_found` for an unknown boutique.

`confirm_appointment` (`appointments.confirm`)

- **Input:** `reference`, matching `^APT-\d{4}$` like `record_confirmation`.
- **Checks, in order:**
  1. The appointment exists (`not_found`).
  2. If it's already published, it returns the appointment with `alreadyConfirmed: true` and changes nothing.
  3. The visit hasn't started, meaning `requestedFor` isn't before now (`in_the_past`).
- **Action:** publishes the draft with the Document Service, `publish({ documentId })`, which is exactly what Publish in the Content Manager does. It never messages anyone.
- **Output:** `{ appointment, alreadyConfirmed }`, where `appointment` has the `appointment_requests` shape.
- **Description:** says the tool confirms the customer's request, that the LINE ops agent messages the customer separately, and that the tool itself sends nothing.

### Confirmations: `confirmations.send`

`pending_confirmations`

- **Input:** `limit?` (1–20, default 10)
- **Returns:** published appointments with no `sent` notification.
- **Output:** `{ appointments: [{ reference, lineUserId, boutique: { name, address }, requestedFor, requestedForText, products: [{ name }], previousAttempts, appLink, message: { altText, contents } }] }`
- `lineUserId` is the subject without `line:`. `requestedForText` is formatted in Japanese, e.g. `10月11日(土) 14:00`. `appLink` is `{liffUrl}/visits/{reference}`. `previousAttempts` is the number of `failed` notifications already recorded for the appointment.
- If `liffUrl` isn't configured, the tool returns `not_configured` rather than a message with a broken link. Startup also logs a warning.
- `message.contents` is a LINE flex **bubble** in Japanese: house name header; title 「ご来店予約が確定しました」; reference, boutique, date and time, and products; and a URI button 「予約を確認する」 to `appLink`. Ready to pass as `push_flex_message`'s contents.

`record_confirmation`

- **Input:** `reference`, `status` (`sent` | `failed`), `detail` (≤500 chars).
- **Checks:**
  - The appointment exists (`not_found`).
  - The appointment is published (`not_published`).
  - For `status: sent`, an existing `sent` notification is returned with `alreadyRecorded: true` instead of adding a duplicate.
- **Action:** creates the notification (`channel: line`, `sentAt: now`, `recordedBy: ops-agent`) and reads it back.
- **Output:** `{ notification: { reference, status, sentAt, detail }, alreadyRecorded }`

### Prompt: `send_pending_confirmations`

Registered with `strapi.ai.mcp.registerPrompt` and gated on `confirmations.send`, since Strapi 5.55 prompts accept auth policies. It holds no data.

The text tells the agent to:

1. Call `pending_confirmations`.
2. For each appointment, call LINE Bot MCP's `get_profile` with `lineUserId`.
3. If that fails, call `record_confirmation` with `failed` and `detail: "not reachable: not a friend or blocked"`, and don't push.
4. Otherwise call `push_flex_message` with `message.altText` and `message.contents`, then `record_confirmation` with `sent` and LINE's response as `detail`.
5. Report sent and failed counts.

It also explains why: LINE's push API returns 200 even when it can't deliver.

## Admin page

A "Maison" menu entry, shown to admins who hold `appointments.review` or `demo.manage`. The page has two sections, and each appears only with its permission.

**Requests board** (`appointments.review`)

- A table of appointments with a status filter: waiting for staff (`requested`), confirmed, or all. It refreshes every 5 seconds, so a request from the app or the concierge appears without a reload.
- **Columns:** reference, masked customer, boutique, visit time (the boutique's wall-clock time), products, a status badge, a "LINE sent" badge, and created via.
- **Confirm button:** on requests staff can still confirm, shown only with `appointments.confirm`. A failure shows the server's message.

**Demo data** (`demo.manage`)

- **Load demo catalog:** runs the seed. It's idempotent, and reports what it created.
- **Reset demo appointments:** deletes all appointments and notifications. The catalog is untouched. The board refreshes right away.

The page uses `@strapi/design-system`, `useFetchClient`, `useNotification`, `useRBAC` and the `Page`/`Layouts` helpers. It calls these admin routes, which are served at `/maison/...` and gated by `admin::isAuthenticatedAdmin` plus `admin::hasPermissions`:

| Route | Permission | Response |
|---|---|---|
| `GET /maison/appointments`, query: the `appointment_requests` filters | `appointments.review` | `{ appointments }`. 400 for bad filters, 404 for an unknown boutique. |
| `POST /maison/appointments/:reference/confirm` | `appointments.confirm` | `{ appointment, alreadyConfirmed }`. 404 for `not_found`, 400 for `in_the_past` or a malformed reference. |
| `POST /maison/demo/seed` | `demo.manage` | The seed counts |
| `POST /maison/demo/reset` | `demo.manage` | The reset counts |

Errors use Strapi's error body, with the tools' `code` and `hint` in `details`. The routes validate with the tools' zod inputs and call the same service methods, so the board and the tools can't disagree.

## Seed data

Shipped in the package: JSON content plus images under `server/seed/`.

- **Locales:** creates the `ja` locale if it's missing (via the i18n locales service). `en` is assumed; it's created too if missing.
- **Content:**
  - 3 collections: travel (trunks and bags), leather goods, small gifts
  - about 12 products spread across categories and price points (¥38,000 to ¥2,800,000), several personalizable and several tagged `travel`
  - 3 boutiques: Ginza and Omotesando open every day 11:00–20:00; Osaka closed on Tuesdays
  - stock levels that leave some products out of stock at some boutiques
- All text is written in both Japanese and English. Everything is created in `ja`, then localized to `en`, then published.
- **Images:** generated or licensed stock, never real brand photos. Their source and license are recorded in `server/seed/images/SOURCES.md`.

## Configuration

`config/plugins.ts`, key `maison`. A validator rejects bad values at startup.

| Key | Default | Purpose |
|---|---|---|
| `liffUrl` | required for confirmations | Base of `appLink`, for example `https://liff.line.me/<LIFF ID>`, or `http://localhost:<port>` during local development |
| `timezone` | `Asia/Tokyo` | Opening-hours checks and message formatting |
| `defaultLocale` | `ja` | Default for `locale` inputs |
| `maxOpenRequestsPerCustomer` | `3` | Abuse limit |
| `houseName` | `{ ja: "メゾン", en: "Maison" }` | Flex message header |
| `disabledTools` | `[]` | Tool names not to register on MCP or offer in the chat. Disabling `pending_confirmations` or `record_confirmation` also drops the `send_pending_confirmations` prompt. |

## Extension points

- **Schemas:** add fields to any Maison content type with Strapi's plugin extension mechanism (`src/extensions/maison/strapi-server.ts`).
- **Services** for app-level tools registered in the app's own `register()`:
  - `identity.getCustomerSubject(context)`
  - `errors.toolError(code, message, hint)`
  - `catalog` and `appointments` services, holding the same logic the tools use, including `appointments.listRequests` and `appointments.confirm`
- **Chat:** the `ai-tools` service answers any chat that speaks the `strapi-plugin-tanstack-ai` contract.
- **Config:** `disabledTools` turns tools off without forking.

## Plugin structure

```
server/src/
  register.ts            registers tools and the prompt (MCP locks its set at start)
  bootstrap.ts           registers permission actions
  content-types/         six schemas
  services/              identity, errors, catalog, appointments, confirmations, seed, ai-tools (chat)
  domain/                pure helpers: hours, time, subject (with masking), flex message, text, validation
  mcp/tools/             one file per tool: schema, description, handler
  mcp/prompts/           send-pending-confirmations.ts
  routes/ controllers/   admin routes for the requests board, seed and reset
server/seed/             content JSON and images
admin/src/               Maison page: requests board and demo data
```

## Testing

- **Unit tests (vitest):** opening-hours and timezone checks, the subject validation regex, customer masking, calendar-day ranges, error formatting, flex message builder, input schemas, and the reference generator. Also:
  - the chat adapter: its tool list and actions, the unwrapping of results and errors, and its schemas as JSON Schema
  - the admin routes' gates and the controller's status codes
- **Service integration tests** boot LaunchPad's Strapi against a throwaway database:
  - staff review and confirmation, including masking, the sort rules, and labels that ignore draft edits
  - the chat tools, run through `execute`
- **MCP smoke tests** against a running Strapi (LaunchPad on its local branch), calling `/mcp` with curl-style requests:
  - a customer token lists only the six customer tools, a staff token only the four catalog tools and the two staff tools, and an ops token only the two ops tools (plus core's built-in `log` tool, which appears in development mode only)
  - the customer token can't see or call the staff tools, and the staff token calls `appointment_requests`
  - `request_appointment` without a subject returns `not_signed_in`, and with one creates a draft owned by that subject
  - `my_appointments` never returns another subject's data
  - `pending_confirmations` ignores drafts
  - `record_confirmation` refuses drafts, and a second `sent` returns `alreadyRecorded`
  - each error code returns its hint
- **Seed:** running it twice creates nothing the second time; reset leaves the catalog intact.
