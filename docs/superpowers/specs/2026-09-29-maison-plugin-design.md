# Maison plugin: design

- **Date:** 2026-09-29
- **Status:** Draft for review
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
| `stockLevels` | relation, one-to-many → `stock-level` | — | `mappedBy: product` |

### `boutique`: draft & publish, localized

| Field | Type | Localized | Notes |
|---|---|---|---|
| `name` | string, required | yes | |
| `slug` | uid, required | no | |
| `city` | string | yes | |
| `address` | text | yes | |
| `openingHours` | JSON, required | no | `[{ "weekday": "mon", "opens": "11:00", "closes": "20:00" }, …]`. A weekday that's missing means closed. |
| `image` | media, single image | no | |
| `stockLevels` | relation, one-to-many → `stock-level` | — | `mappedBy: boutique` |

### `stock-level`: no drafts, not localized

| Field | Type | Notes |
|---|---|---|
| `product` | relation, many-to-one → `product` | `inversedBy: stockLevels` |
| `boutique` | relation, many-to-one → `boutique` | `inversedBy: stockLevels` |
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
| `notifications` | relation, one-to-many → `notification` | `mappedBy: appointment` |

### `notification`: no drafts, not localized, append-only

| Field | Type | Notes |
|---|---|---|
| `appointment` | relation, many-to-one → `appointment` | `inversedBy: notifications` |
| `channel` | enumeration: `line` | |
| `status` | enumeration: `sent`, `failed` | |
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

## Permissions

Registered in `bootstrap` with `admin::permission` `actionProvider.registerMany`, using `section: 'plugins'` and `pluginName: 'maison'`:

| Action UID | Display name | Used by |
|---|---|---|
| `plugin::maison.catalog.read` | MCP: browse the catalog | Customer tools |
| `plugin::maison.appointments.request` | MCP: request and view own appointments | Customer tools |
| `plugin::maison.confirmations.send` | MCP: send appointment confirmations | Ops tools and prompt |
| `plugin::maison.demo.manage` | Load and reset demo data | Admin page |

## Identity contract

- Tools that act for a customer read `requestInfo.headers['x-mcp-subject']` from the MCP handler context (`@strapi/core` `createMcpCapabilityHandlerContext`).
- The value must match `^line:U[0-9a-f]{32}$`. Anything else, or no value, returns `not_signed_in`.
- oauth-mcp-manager 1.1 guarantees the header can't be supplied by the caller. This plugin never accepts identity as a tool argument.
- The helper is exposed as `strapi.plugin('maison').service('identity').getCustomerSubject(context)` so app-level tools can reuse it.

## Tool contract

Registered in `register()` with `strapi.ai.mcp.registerTool`, using zod from `@strapi/utils`:

- **Outputs** are top-level objects with a matching `resolveOutputSchema`.
- **Reads** take `locale` (`ja` | `en`, default from config) and return **published** content only.
- **Errors** don't throw. They return `{ isError: true, content: [{ type: 'text', text }] }`, where `text` is JSON: `{ "error": { "code", "message", "hint" } }`. Core passes `isError` through (`toSdkMcpCapabilityResult.js`); thrown errors would become a generic message.
- **Error codes:** `not_signed_in`, `not_found`, `invalid_input`, `boutique_closed`, `in_the_past`, `too_many_open_requests`, `not_published`, `not_configured`.
- **Descriptions** say when to use the tool and what it won't do. For example, `request_appointment`: "Creates a request that a boutique must confirm; never tell the customer it is confirmed."

### Catalog: `catalog.read`

| Tool | Input | Output |
|---|---|---|
| `browse_collections` | `locale?` | `{ locale, collections: [{ slug, name, teaser, heroImageUrl, productCount }] }`. `teaser` is the first 160 characters of `story` as plain text. |
| `search_products` | `query?` (≤100 chars; name and description match), `collection?`, `category?`, `occasion?`, `minPriceJpy?`, `maxPriceJpy?`, `personalizable?`, `inStockAt?` (boutique slug), `locale?`, `limit?` (1–20, default 8) | `{ locale, total, products: [{ slug, name, category, priceJpy, imageUrl, occasions, personalizable, inStockAt: [boutiqueSlug] }] }`, sorted by price, highest first |
| `get_product` | `slug`, `locale?` | `{ product: { slug, sku, name, category, priceJpy, description (plain text), craftStory, dimensionsCm \| null, personalization: { offered, kinds, leadDays }, images: [{ url, alt }], occasions, collection: { slug, name }, stock: [{ boutique, name, quantity }] } }`. `not_found` if missing. |
| `get_boutiques` | `productSlugs?` (≤5), `date?` (`YYYY-MM-DD`), `locale?` | `{ date, boutiques: [{ slug, name, city, address, hours, openOnDate, hoursOnDate, stock: [{ product, quantity }] }] }`. `openOnDate` and `hoursOnDate` are `null` without `date`. |

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

### Confirmations: `confirmations.send`

`list_pending_confirmations`

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

Registered with `strapi.ai.mcp.registerPrompt`, gated on `confirmations.send` if prompts support auth policies. It holds no data either way.

The text tells the agent to:

1. Call `list_pending_confirmations`.
2. For each appointment, call LINE Bot MCP's `get_profile` with `lineUserId`.
3. If that fails, call `record_confirmation` with `failed` and `detail: "not reachable: not a friend or blocked"`, and don't push.
4. Otherwise call `push_flex_message` with `message.altText` and `message.contents`, then `record_confirmation` with `sent` and LINE's response as `detail`.
5. Report sent and failed counts.

It also explains why: LINE's push API returns 200 even when it can't deliver.

## Admin page

A "Maison" menu entry gated by `demo.manage`, with two actions:

- **Load demo catalog:** runs the seed. It's idempotent, and reports what it created.
- **Reset demo appointments:** deletes all appointments and notifications. The catalog is untouched.

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
| `liffUrl` | required for confirmations | Base of `appLink`, for example `https://liff.line.me/<LIFF ID>` |
| `timezone` | `Asia/Tokyo` | Opening-hours checks and message formatting |
| `defaultLocale` | `ja` | Default for `locale` inputs |
| `maxOpenRequestsPerCustomer` | `3` | Abuse limit |
| `houseName` | `{ ja: "メゾン", en: "Maison" }` | Flex message header |
| `disabledTools` | `[]` | Tool names not to register |

## Extension points

- **Schemas:** add fields to any Maison content type with Strapi's plugin extension mechanism (`src/extensions/maison/strapi-server.ts`).
- **Services** for app-level tools registered in the app's own `register()`:
  - `identity.getCustomerSubject(context)`
  - `errors.toolError(code, message, hint)`
  - `catalog` and `appointments` services, holding the same logic the tools use
- **Config:** `disabledTools` turns tools off without forking.

## Plugin structure

```
server/src/
  register.ts            registers tools and the prompt (MCP locks its set at start)
  bootstrap.ts           registers permission actions
  content-types/         six schemas
  services/              identity, errors, catalog, appointments, confirmations, seed, flex-message
  mcp/tools/             one file per tool: schema, description, handler
  mcp/prompts/           send-pending-confirmations.ts
  routes/ controllers/   admin routes for seed and reset
server/seed/             content JSON and images
admin/src/               Maison page (seed and reset buttons)
```

## Testing

- **Unit tests (vitest):** opening-hours and timezone checks, the subject validation regex, error formatting, flex message builder, input schemas, and the reference generator.
- **Integration tests** against a running Strapi (LaunchPad on its local branch), calling `/mcp` with curl-style requests:
  - a customer token lists only the six customer tools, and an ops token only the two ops tools (plus core's built-in `log` tool, which appears in development mode only)
  - `request_appointment` without a subject returns `not_signed_in`, and with one creates a draft owned by that subject
  - `my_appointments` never returns another subject's data
  - `list_pending_confirmations` ignores drafts
  - `record_confirmation` refuses drafts, and a second `sent` returns `alreadyRecorded`
  - each error code returns its hint
- **Seed:** running it twice creates nothing the second time; reset leaves the catalog intact.
