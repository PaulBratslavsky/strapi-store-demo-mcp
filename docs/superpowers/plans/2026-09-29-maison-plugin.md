# Maison plugin implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this repo into the `maison` Strapi 5 plugin. It has:
- six content types for a fictional luxury house
- ten MCP tools and one MCP prompt on Strapi's built-in `/mcp`
- the same tools for the in-admin chat of `strapi-plugin-tanstack-ai`
- permission actions and seed data
- a Maison admin page with a live board of appointment requests and the demo data buttons

**Architecture:** The plugin separates pure domain logic (`server/src/domain/`, unit-tested with vitest) from Strapi-facing services (`server/src/services/`, which use the Document Service). MCP tools (`server/src/mcp/tools/`) are thin adapters:
- they validate input with zod from `@strapi/utils`
- they resolve the caller's identity by passing the raw `Authorization` header to oauth-mcp-manager's `resolveSubject`
- they call one service method
- they return either a structured result or an `isError` result with a code and hint

The same services serve four surfaces: the MCP tools, the in-admin chat (an `ai-tools` service that wraps the MCP tool definitions, Task 11c), the Maison admin page (admin routes, Task 12) and the Content Manager.

Service integration tests boot LaunchPad's Strapi programmatically against a separate SQLite file. MCP smoke tests call `/mcp` on the running LaunchPad dev server with the plugin linked through yalc. The full LINE-session end-to-end test lives in the LaunchPad plan.

**Tech stack:** Strapi 5.55.1, `@strapi/sdk-plugin` 6.1.1, TypeScript, zod 4 (4.4.3, from `@strapi/utils`), vitest, Node's built-in `node:test` for integration scripts, `sharp` for generated seed images.

**Spec:** `docs/superpowers/specs/2026-09-29-maison-plugin-design.md` (with the overview `2026-09-29-ax-luxury-demo-overview.md`)

## Global constraints

- Strapi `^5.55.1`, with `server.mcp.enabled: true` in the host app and the i18n plugin enabled.
- Plugin id `maison`. Content-type UIDs `plugin::maison.<name>`. Permission actions `plugin::maison.<uid>`.
- Import zod only from `@strapi/utils` (`import { z } from '@strapi/utils'`). Never add the `zod` package.
- No components in the plugin. Strapi 5 loads components only from the app's `src/components`.
- Tools never throw for expected failures. They return `{ isError: true, content: [{ type: 'text', text: '{"error":{"code","message","hint"}}' }] }`.
- Error codes are exactly: `not_signed_in`, `not_found`, `invalid_input`, `boutique_closed`, `in_the_past`, `too_many_open_requests`, `not_published`, `not_configured`.
- Customer identity comes only from `strapi.plugin('strapi-oauth-mcp-manager').service('oauth').resolveSubject(authorization)`, where `authorization` is the caller's raw header from `extra.requestInfo.headers.authorization`. The result must match `^line:U[0-9a-f]{32}$`. No tool takes a customer argument, and no identity header is read, because middleware header edits never reach tools.
- MCP tool definitions follow Strapi 5.55.1:
  - `createHandler(strapi, context)` returns `async ({ args, extra }) => result`
  - `resolveOutputSchema` is required, and every success returns matching `structuredContent`
  - `auth.policies` is required (policies are OR'd)
  - register in `register()`
- Document Service reads default to drafts, so always pass `status: 'published'` for catalog reads. Pagination keys (`limit`, `start`) go at the root of the params.
- Define tools with `defineTool` and prompts with `definePrompt` from `server/src/mcp/define.ts` (Task 7). Never import values from `@strapi/strapi`, only types: its ESM build can't be loaded by vitest.
- `status` is a reserved attribute name in Strapi 5, so the notification's delivery field is `outcome`. Tool inputs and outputs still say `status`.
- Reads return **published** content only. `locale` is `ja` or `en`, defaulting to `config.defaultLocale` (`ja`).
- The default timezone is `Asia/Tokyo`. Opening hours are `opens <= start < closes` in that timezone.
- `request_appointment` creates drafts only. Only staff publish, in three ways: `confirm_appointment` (a token or admin role holding `appointments.confirm`), the board's Confirm button, and Publish in the Content Manager. Customer and ops tokens can never publish.
- Staff views never show a customer's full LINE subject (`maskSubject`), and never read a label from a draft.
- No real brand names, product names or photos anywhere, including the seed data.
- Work on a feature branch. A hook blocks commits on `main`.

## Review focus

These are the inputs the spec implies most likely to bite a real user. Each has a test in the task that owns the code.

1. **A UTC `requestedFor` that falls on another day in Tokyo.** For example `2026-10-05T23:30:00Z` is Tuesday 08:30 in Tokyo, when Osaka is closed. It must be judged in Tokyo time (Task 3).
2. **Booking at exactly closing time.** 20:00 at a boutique that closes at 20:00 must be `boutique_closed`, and 19:59 accepted (Task 3).
3. **Identity that isn't clean.** A `resolveSubject` result with uppercase hex or no `line:` prefix, an `Authorization` header that arrives as an array, a plain admin token, or oauth-mcp-manager not being installed must all be treated as not signed in, never as a customer (Tasks 2 and 7).
4. **A product with no English localization.** An `en` read falls back to the `ja` version and reports `locale: "ja"`. It doesn't return `not_found` (Task 9).
5. **Draft-only products leaking.** `search_products` must never return a product that was never published, and `view_product` on it returns `not_found` (Task 9).
6. **Staff views leaking a customer or a draft.** `appointment_requests` and the board show the customer masked, never the full subject. They take boutique and product names from published versions only, even after a draft edit (Task 11b).

---

## File structure

```
package.json                                   modify: plugin id, scripts, devDeps, files
vitest.config.ts                               create
server/src/index.ts                            rewrite: plugin server entry (object form)
server/src/constants.ts                        rewrite: ids, UIDs, actions, enums, tool names
server/src/register.ts                         rewrite: document middleware + MCP registration
server/src/bootstrap.ts                        rewrite: permission actions
server/src/destroy.ts                          keep
server/src/config/index.ts                     rewrite: defaults + validator
server/src/domain/subject.ts                   create: identity header parsing, customer masking (Task 11b)
server/src/domain/tool-result.ts               create: success/error result builders
server/src/domain/hours.ts                     create: opening-hours validation and checks
server/src/domain/time.ts                      create: Japanese date formatting, zoned ISO times, calendar-day ranges
server/src/domain/text.ts                      create: blocks → plain text, teaser
server/src/domain/reference.ts                 create: APT-#### generator
server/src/domain/flex-message.ts              create: LINE flex bubble builder
server/src/domain/validation.ts                create: JSON enum-array validation
server/src/domain/url.ts                       create: absolute media URLs
server/src/domain/service-result.ts            create: ok/failure results for services
server/src/content-types/index.ts              create
server/src/content-types/<type>/schema.json    create (6 types)
server/src/content-types/<type>/index.ts       create (6 types)
server/src/document-middleware.ts              create: validation via strapi.documents.use
server/src/services/index.ts                   rewrite
server/src/services/identity.ts                create
server/src/services/errors.ts                  create
server/src/services/catalog.ts                 create
server/src/services/appointments.ts            create: customer requests; staff review and confirmation (Task 11b)
server/src/services/confirmations.ts           create
server/src/services/seed.ts                    create
server/src/services/ai-tools.ts                create: chat tools for strapi-plugin-tanstack-ai, from the MCP tools
server/src/mcp/index.ts                        rewrite: registers enabled tools + prompt
server/src/mcp/define.ts                       create: typed defineTool / definePrompt
server/src/mcp/common.ts                       create: shared not_signed_in error
server/src/mcp/schemas.ts                      rewrite: shared zod schemas
server/src/mcp/tools/<tool>.ts                 create (10 files)
server/src/mcp/prompts/send-pending-confirmations.ts   create
server/src/routes/index.ts                     rewrite: admin routes for the requests board, seed and reset
server/src/controllers/index.ts                rewrite
server/src/controllers/demo.ts                 create
server/src/controllers/appointments.ts         create: the requests board's list and confirm
server/seed/content.json                       create: bilingual demo content
server/seed/images/*.png                       create: generated placeholder images
server/seed/images/SOURCES.md                  create
scripts/generate-seed-images.mjs               create
admin/src/index.ts                             rewrite
admin/src/pluginId.ts                          create
admin/src/permissions.ts                       rewrite: page, board and demo permissions
admin/src/pages/MaisonPage.tsx                 create: requests board and demo data
admin/src/components/RequestsBoard.tsx         create
admin/src/components/DemoData.tsx              create
test/unit/*.test.ts                            create
test/integration/*.test.mjs                    create
test/fixtures/line-flex-message-schema.mjs     create: vendored LINE Bot MCP schema (tests only)
test/mcp/tools.test.mjs                        create: smoke tests over HTTP
scripts/mcp-dev-tokens.mjs                     create: seeds and mints smoke-test tokens
README.md                                      rewrite
```

Removed: `admin/src/pages/AnalyticsPage.tsx`, `admin/src/permissions.ts` (recreated in Task 12), `server/src/services/analytics.ts`, `server/src/controllers/analytics.ts`, `server/src/routes/analytics.ts`, `server/src/mcp/tools/get-*.ts`.

---

### Task 1: Plugin skeleton as `maison`

Replace the store-analytics code with an empty but valid `maison` plugin, and add vitest.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `admin/src/pluginId.ts`, `test/unit/constants.test.ts`
- Rewrite: `server/src/index.ts`, `server/src/constants.ts`, `server/src/register.ts`, `server/src/bootstrap.ts`, `server/src/destroy.ts`, `server/src/config/index.ts`, `server/src/content-types/index.ts`, `server/src/services/index.ts`, `server/src/controllers/index.ts`, `server/src/routes/index.ts`, `admin/src/index.ts`
- Delete: the files listed under "Removed" above, plus `server/src/mcp/schemas.ts` and `server/src/mcp/index.ts` (recreated in Tasks 7 and 9)

**Interfaces:**
- Produces: `PLUGIN_ID`, `UID`, `ACTION`, `TOOL_NAMES`, `ToolName`, `LOCALES`, `Locale`, `CATEGORIES`, `OCCASIONS`, `PERSONALIZATION_KINDS`, `OAUTH_PLUGIN_ID`, `SURFACE_HEADER` from `server/src/constants.ts`.

- [ ] **Step 1: Branch**

```bash
cd /Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp
git checkout main && git pull --ff-only
git checkout -b feat/maison-plugin
```

- [ ] **Step 2: Remove the store-analytics code**

```bash
git rm -q admin/src/pages/AnalyticsPage.tsx admin/src/permissions.ts \
  server/src/services/analytics.ts server/src/controllers/analytics.ts \
  server/src/routes/analytics.ts server/src/mcp/schemas.ts server/src/mcp/index.ts
git rm -q -r server/src/mcp/tools
```

- [ ] **Step 3: Add vitest and update `package.json`**

```bash
npm install --save-dev vitest@^3.2.4
```

Edit `package.json` so these keys read exactly as follows. Leave the other keys unchanged.

```json
{
  "description": "Maison: a Strapi 5 plugin exposing a luxury house's catalog and appointments to people and agents through Strapi's built-in MCP server.",
  "files": ["dist", "server/seed"],
  "scripts": {
    "build": "strapi-plugin build",
    "watch": "strapi-plugin watch",
    "watch:link": "strapi-plugin watch:link",
    "verify": "strapi-plugin verify",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "node --test --test-concurrency=1 \"test/integration/*.test.mjs\"",
    "test:mcp": "node --test --test-concurrency=1 \"test/mcp/*.test.mjs\"",
    "link": "npm run build && npx -y yalc@1.0.0-pre.53 push",
    "test:ts:front": "tsc -p admin/tsconfig.json --noEmit",
    "test:ts:back": "tsc -p server/tsconfig.json --noEmit"
  },
  "strapi": {
    "kind": "plugin",
    "name": "maison",
    "displayName": "Maison",
    "description": "A luxury house's catalog and appointments, as MCP tools for people's apps and agents."
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Write the failing test `test/unit/constants.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ACTION, PLUGIN_ID, TOOL_NAMES, UID } from '../../server/src/constants';

describe('constants', () => {
  it('uses the maison plugin id everywhere', () => {
    expect(PLUGIN_ID).toBe('maison');
    for (const uid of Object.values(UID)) expect(uid.startsWith('plugin::maison.')).toBe(true);
    for (const action of Object.values(ACTION)) expect(action.startsWith('plugin::maison.')).toBe(true);
  });

  it('declares the eight tools exactly once each', () => {
    expect(TOOL_NAMES).toHaveLength(8);
    expect(new Set(TOOL_NAMES).size).toBe(8);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run test/unit/constants.test.ts`
Expected: FAIL, because `server/src/constants.ts` still holds the old store-analytics exports (`PLUGIN_ID` is `store-analytics`, and `UID` / `ACTION` / `TOOL_NAMES` are undefined).

- [ ] **Step 7: Rewrite `server/src/constants.ts`**

```ts
export const PLUGIN_ID = 'maison';

export const UID = {
  collection: 'plugin::maison.collection',
  product: 'plugin::maison.product',
  boutique: 'plugin::maison.boutique',
  stockLevel: 'plugin::maison.stock-level',
  appointment: 'plugin::maison.appointment',
  notification: 'plugin::maison.notification',
} as const;

/** Full action UIDs, as stored on admin tokens and checked by tool auth policies. */
export const ACTION = {
  catalogRead: 'plugin::maison.catalog.read',
  appointmentsRequest: 'plugin::maison.appointments.request',
  confirmationsSend: 'plugin::maison.confirmations.send',
  demoManage: 'plugin::maison.demo.manage',
} as const;

export const TOOL_NAMES = [
  'browse_collections',
  'search_products',
  'view_product',
  'find_boutiques',
  'request_appointment',
  'my_appointments',
  'pending_confirmations',
  'record_confirmation',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const CATEGORIES = ['trunk', 'bag', 'small-leather', 'travel', 'objet'] as const;
export const OCCASIONS = ['travel', 'anniversary', 'birthday', 'wedding', 'new-job'] as const;
export const PERSONALIZATION_KINDS = ['initials-hot-stamp', 'hand-painted-stripes', 'monogram-color'] as const;

/** Provides resolveSubject(authorization) for customer identity (oauth-mcp-manager 1.1). */
export const OAUTH_PLUGIN_ID = 'strapi-oauth-mcp-manager';
/** Informational only: which surface made the call ("concierge" or absent). Never used for identity. */
export const SURFACE_HEADER = 'x-maison-surface';
```

- [ ] **Step 8: Rewrite the server entry and lifecycle files**

`server/src/index.ts`:

```ts
import bootstrap from './bootstrap';
import config from './config';
import contentTypes from './content-types';
import controllers from './controllers';
import destroy from './destroy';
import register from './register';
import routes from './routes';
import services from './services';

export default {
  register,
  bootstrap,
  destroy,
  config,
  contentTypes,
  controllers,
  routes,
  services,
};
```

`server/src/register.ts`:

```ts
import type { Core } from '@strapi/strapi';

const register = ({ strapi: _strapi }: { strapi: Core.Strapi }) => {};

export default register;
```

`server/src/bootstrap.ts`:

```ts
import type { Core } from '@strapi/strapi';

const bootstrap = async ({ strapi: _strapi }: { strapi: Core.Strapi }) => {};

export default bootstrap;
```

`server/src/destroy.ts`:

```ts
import type { Core } from '@strapi/strapi';

const destroy = async ({ strapi: _strapi }: { strapi: Core.Strapi }) => {};

export default destroy;
```

`server/src/content-types/index.ts`:

```ts
export default {};
```

`server/src/services/index.ts`, `server/src/controllers/index.ts`, `server/src/routes/index.ts`, each:

```ts
export default {};
```

`server/src/config/index.ts` (replaced in Task 5):

```ts
export default {
  default: {},
  validator() {},
};
```

- [ ] **Step 9: Rewrite the admin entry**

`admin/src/pluginId.ts`:

```ts
export const PLUGIN_ID = 'maison';
```

`admin/src/index.ts`:

```ts
import type { StrapiApp } from '@strapi/strapi/admin';

import { PLUGIN_ID } from './pluginId';

export default {
  register(app: StrapiApp) {
    app.registerPlugin({ id: PLUGIN_ID, name: 'Maison' });
  },
};
```

- [ ] **Step 10: Run the tests, type checks, build and verify**

```bash
npx vitest run
npm run test:ts:back && npm run test:ts:front
npm run build && npm run verify
```

Expected: 2 tests pass, both type checks exit 0, and the build prints `Build complete!`. `verify` passes.

- [ ] **Step 11: Point the LaunchPad dev host at the renamed plugin**

The plugin is yalc-linked into LaunchPad's Strapi on the local branch `feat/store-demo-mcp-plugin`. Its config still enables `store-analytics`, which no longer exists. Replace `/Users/paul/work/launchpad-fork-latest/strapi/config/plugins.ts` with:

```ts
export default ({ env }) => ({
  // Linked locally with yalc from ~/work/plugin-dev/plugins/strapi-store-demo-mcp
  maison: {
    enabled: true,
    config: {
      liffUrl: env('MAISON_LIFF_URL', null),
    },
  },
});
```

Then push the new build and restart the dev server (it runs on port 1338 because 1337 is reserved):

```bash
npm run link
# restart LaunchPad's Strapi if it's running:
kill $(lsof -tiTCP:1338 -sTCP:LISTEN) 2>/dev/null; cd /Users/paul/work/launchpad-fork-latest/strapi && PORT=1338 CLIENT_URL=http://localhost:3001 nohup yarn develop > .tmp/maison-dev.log 2>&1 &
```

Expected: `curl -s -o /dev/null -w '%{http_code}' http://localhost:1338/_health` prints `204` within a minute, and the log has no `Error`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: replace store-analytics with an empty maison plugin skeleton"
```

---

### Task 2: Identity and tool-result helpers

**Files:**
- Create: `server/src/domain/subject.ts`, `server/src/domain/tool-result.ts`
- Test: `test/unit/subject.test.ts`, `test/unit/tool-result.test.ts`

**Interfaces:**
- Produces:
  - `parseSubject(value: unknown): string | null`, which returns the subject only if it matches `^line:U[0-9a-f]{32}$`
  - `lineUserIdOf(subject: string): string`
  - `authorizationOf(headers: Record<string, string | string[] | undefined> | undefined): string | null`, which returns the `authorization` header only when it's a single non-empty string
  - `type ErrorCode`
  - `toolError(code: ErrorCode, message: string, hint: string): ToolErrorResult`
  - `toolSuccess<T extends Record<string, unknown>>(data: T): ToolSuccessResult<T>`

- [ ] **Step 1: Write the failing tests**

`test/unit/subject.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { authorizationOf, lineUserIdOf, parseSubject } from '../../server/src/domain/subject';

const VALID = 'line:U4af4980629c1a7b3f1e2d3c4b5a69788';

describe('parseSubject', () => {
  it('accepts a line subject with 32 lowercase hex characters', () => {
    expect(parseSubject(VALID)).toBe(VALID);
  });

  it.each([
    ['uppercase hex', 'line:U4AF4980629C1A7B3F1E2D3C4B5A69788'],
    ['surrounding spaces', ` ${VALID} `],
    ['missing prefix', 'U4af4980629c1a7b3f1e2d3c4b5a69788'],
    ['two values joined by a proxy', `${VALID}, ${VALID}`],
    ['too short', 'line:U4af498'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(parseSubject(value)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseSubject(undefined)).toBeNull();
    expect(parseSubject(42)).toBeNull();
  });
});

describe('authorizationOf', () => {
  it('returns a single authorization header value', () => {
    expect(authorizationOf({ authorization: 'Bearer abc' })).toBe('Bearer abc');
  });

  it('returns null for a missing, empty or repeated header', () => {
    expect(authorizationOf(undefined)).toBeNull();
    expect(authorizationOf({})).toBeNull();
    expect(authorizationOf({ authorization: '' })).toBeNull();
    expect(authorizationOf({ authorization: ['Bearer a', 'Bearer b'] })).toBeNull();
  });
});

describe('lineUserIdOf', () => {
  it('strips the line: prefix', () => {
    expect(lineUserIdOf(VALID)).toBe('U4af4980629c1a7b3f1e2d3c4b5a69788');
  });
});
```

`test/unit/tool-result.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toolError, toolSuccess } from '../../server/src/domain/tool-result';

describe('toolError', () => {
  it('returns an isError result whose text is the error JSON', () => {
    const result = toolError('not_found', 'No product "x".', 'Call search_products to find valid slugs.');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(JSON.parse(result.content[0].text)).toEqual({
      error: { code: 'not_found', message: 'No product "x".', hint: 'Call search_products to find valid slugs.' },
    });
    expect('structuredContent' in result).toBe(false);
  });
});

describe('toolSuccess', () => {
  it('returns the data as structuredContent and as JSON text', () => {
    const data = { locale: 'ja', total: 0, products: [] };
    const result = toolSuccess(data);
    expect(result.structuredContent).toEqual(data);
    expect(JSON.parse(result.content[0].text)).toEqual(data);
    expect('isError' in result).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/subject.test.ts test/unit/tool-result.test.ts`
Expected: FAIL with "Failed to resolve import ../../server/src/domain/subject" (and tool-result).

- [ ] **Step 3: Implement `server/src/domain/subject.ts`**

```ts
const SUBJECT_PATTERN = /^line:U[0-9a-f]{32}$/;

/** Returns the subject if it is exactly `line:U` + 32 lowercase hex characters, else null. */
export const parseSubject = (value: unknown): string | null =>
  typeof value === 'string' && SUBJECT_PATTERN.test(value) ? value : null;

export const lineUserIdOf = (subject: string): string => subject.slice('line:'.length);

/**
 * The caller's raw Authorization header from the MCP handler context (`extra.requestInfo.headers`).
 * Keys there are lowercase. Only a single non-empty string is usable.
 */
export const authorizationOf = (
  headers: Record<string, string | string[] | undefined> | undefined
): string | null => {
  const value = headers?.authorization;
  return typeof value === 'string' && value.length > 0 ? value : null;
};
```

- [ ] **Step 4: Implement `server/src/domain/tool-result.ts`**

```ts
export type ErrorCode =
  | 'not_signed_in'
  | 'not_found'
  | 'invalid_input'
  | 'boutique_closed'
  | 'in_the_past'
  | 'too_many_open_requests'
  | 'not_published'
  | 'not_configured';

export interface ToolErrorResult {
  isError: true;
  content: [{ type: 'text'; text: string }];
}

export interface ToolSuccessResult<T extends Record<string, unknown>> {
  content: [{ type: 'text'; text: string }];
  structuredContent: T;
}

/** An expected failure the agent can recover from. Never thrown: returned from the handler. */
export const toolError = (code: ErrorCode, message: string, hint: string): ToolErrorResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: { code, message, hint } }) }],
});

export const toolSuccess = <T extends Record<string, unknown>>(data: T): ToolSuccessResult<T> => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data,
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/unit/subject.test.ts test/unit/tool-result.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/domain/subject.ts server/src/domain/tool-result.ts test/unit/subject.test.ts test/unit/tool-result.test.ts
git commit -m "feat: add identity header parsing and tool result helpers"
```

---

### Task 3: Opening hours and Japanese date formatting

**Files:**
- Create: `server/src/domain/hours.ts`, `server/src/domain/time.ts`
- Test: `test/unit/hours.test.ts`, `test/unit/time.test.ts`

**Interfaces:**
- Produces:
  - `WEEKDAYS`, `type Weekday`, `interface OpeningHoursEntry { weekday; opens; closes }`
  - `ISO_DATE: RegExp`, `toMinutes(hhmm: string): number`
  - `validateOpeningHours(value: unknown): { ok: true; hours: OpeningHoursEntry[] } | { ok: false; reason: string }`
  - `zonedParts(date: Date, timeZone: string): { isoDate: string; weekday: Weekday; minutes: number }`
  - `hoursForDate(hours, isoDate: string): OpeningHoursEntry | null`
  - `checkOpenAt(hours, date: Date, timeZone: string): { open: boolean; isoDate: string; weekday: Weekday; entry: OpeningHoursEntry | null }`
  - `formatJaDateTime(date: Date, timeZone: string): string`, e.g. `10月10日(土) 14:00`

- [ ] **Step 1: Write the failing tests**

`test/unit/hours.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  checkOpenAt,
  hoursForDate,
  validateOpeningHours,
  zonedParts,
  type OpeningHoursEntry,
} from '../../server/src/domain/hours';

const TOKYO = 'Asia/Tokyo';
const everyDay = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((weekday) => ({
  weekday,
  opens: '11:00',
  closes: '20:00',
}));
const osaka: OpeningHoursEntry[] = everyDay.filter((entry) => entry.weekday !== 'tue');

describe('validateOpeningHours', () => {
  it('accepts a valid week', () => {
    const result = validateOpeningHours(everyDay);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['not an array', { mon: '11:00' }],
    ['unknown weekday', [{ weekday: 'monday', opens: '11:00', closes: '20:00' }]],
    ['bad time', [{ weekday: 'mon', opens: '11', closes: '20:00' }]],
    ['24:00', [{ weekday: 'mon', opens: '11:00', closes: '24:00' }]],
    ['opens after closes', [{ weekday: 'mon', opens: '20:00', closes: '11:00' }]],
    ['duplicate weekday', [
      { weekday: 'mon', opens: '11:00', closes: '20:00' },
      { weekday: 'mon', opens: '12:00', closes: '19:00' },
    ]],
  ])('rejects %s', (_label, value) => {
    const result = validateOpeningHours(value);
    expect(result.ok).toBe(false);
  });
});

describe('zonedParts', () => {
  it('reads Tokyo wall-clock time from a UTC instant', () => {
    expect(zonedParts(new Date('2026-10-10T05:00:00Z'), TOKYO)).toEqual({
      isoDate: '2026-10-10',
      weekday: 'sat',
      minutes: 14 * 60,
    });
  });

  it('crosses midnight into the next Tokyo day', () => {
    expect(zonedParts(new Date('2026-10-05T23:30:00Z'), TOKYO)).toEqual({
      isoDate: '2026-10-06',
      weekday: 'tue',
      minutes: 8 * 60 + 30,
    });
  });
});

describe('checkOpenAt', () => {
  it.each([
    ['opening minute', '2026-10-10T02:00:00Z', true],
    ['one minute before opening', '2026-10-10T01:59:00Z', false],
    ['last minute before closing', '2026-10-10T10:59:00Z', true],
    ['exactly closing time', '2026-10-10T11:00:00Z', false],
  ])('Ginza hours: %s', (_label, iso, expected) => {
    expect(checkOpenAt(everyDay, new Date(iso), TOKYO).open).toBe(expected);
  });

  it('treats a missing weekday as closed (Osaka on Tuesday)', () => {
    const result = checkOpenAt(osaka, new Date('2026-10-06T05:00:00Z'), TOKYO);
    expect(result).toEqual({ open: false, isoDate: '2026-10-06', weekday: 'tue', entry: null });
  });

  it('judges a UTC Monday-night request as Tuesday morning in Tokyo', () => {
    const result = checkOpenAt(osaka, new Date('2026-10-05T23:30:00Z'), TOKYO);
    expect(result.weekday).toBe('tue');
    expect(result.open).toBe(false);
  });
});

describe('hoursForDate', () => {
  it('returns the entry for a calendar date', () => {
    expect(hoursForDate(osaka, '2026-10-10')).toEqual({ weekday: 'sat', opens: '11:00', closes: '20:00' });
  });

  it('returns null for a closed day', () => {
    expect(hoursForDate(osaka, '2026-10-06')).toBeNull();
  });
});
```

`test/unit/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatJaDateTime } from '../../server/src/domain/time';

describe('formatJaDateTime', () => {
  it('formats a Tokyo date and time in Japanese', () => {
    expect(formatJaDateTime(new Date('2026-10-10T05:00:00Z'), 'Asia/Tokyo')).toBe('10月10日(土) 14:00');
  });

  it('pads minutes and uses 24-hour time', () => {
    expect(formatJaDateTime(new Date('2026-10-14T09:05:00Z'), 'Asia/Tokyo')).toBe('10月14日(水) 18:05');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/hours.test.ts test/unit/time.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Implement `server/src/domain/hours.ts`**

```ts
/** Index matches Date.prototype.getUTCDay(). */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface OpeningHoursEntry {
  weekday: Weekday;
  opens: string;
  closes: string;
}

export const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (hhmm: string): number => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
};

export type HoursValidation = { ok: true; hours: OpeningHoursEntry[] } | { ok: false; reason: string };

export function validateOpeningHours(value: unknown): HoursValidation {
  if (!Array.isArray(value)) {
    return { ok: false, reason: 'openingHours must be an array of { weekday, opens, closes }' };
  }
  const seen = new Set<string>();
  const hours: OpeningHoursEntry[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, reason: `openingHours[${index}] must be an object` };
    }
    const { weekday, opens, closes } = entry as Record<string, unknown>;
    if (typeof weekday !== 'string' || !(WEEKDAYS as readonly string[]).includes(weekday)) {
      return { ok: false, reason: `openingHours[${index}].weekday must be one of ${WEEKDAYS.join(', ')}` };
    }
    if (seen.has(weekday)) {
      return { ok: false, reason: `openingHours lists ${weekday} more than once` };
    }
    if (typeof opens !== 'string' || !TIME.test(opens) || typeof closes !== 'string' || !TIME.test(closes)) {
      return { ok: false, reason: `openingHours[${index}] opens and closes must be HH:MM (00:00-23:59)` };
    }
    if (toMinutes(opens) >= toMinutes(closes)) {
      return { ok: false, reason: `openingHours[${index}] must open before it closes` };
    }
    seen.add(weekday);
    hours.push({ weekday: weekday as Weekday, opens, closes });
  }
  return { ok: true, hours };
}

export interface ZonedParts {
  isoDate: string;
  weekday: Weekday;
  minutes: number;
}

/** Wall-clock date, weekday and minutes-since-midnight of an instant in a time zone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday').toLowerCase().slice(0, 3) as Weekday,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Weekday of a calendar date (YYYY-MM-DD); independent of time zone. */
export const weekdayOfDate = (isoDate: string): Weekday => WEEKDAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];

export const hoursForDate = (hours: OpeningHoursEntry[], isoDate: string): OpeningHoursEntry | null =>
  hours.find((entry) => entry.weekday === weekdayOfDate(isoDate)) ?? null;

export interface OpenCheck {
  open: boolean;
  isoDate: string;
  weekday: Weekday;
  entry: OpeningHoursEntry | null;
}

/** Open means opens <= local time < closes on that local weekday. A missing weekday means closed. */
export function checkOpenAt(hours: OpeningHoursEntry[], date: Date, timeZone: string): OpenCheck {
  const { isoDate, weekday, minutes } = zonedParts(date, timeZone);
  const entry = hours.find((candidate) => candidate.weekday === weekday) ?? null;
  const open = entry !== null && minutes >= toMinutes(entry.opens) && minutes < toMinutes(entry.closes);
  return { open, isoDate, weekday, entry };
}
```

- [ ] **Step 4: Implement `server/src/domain/time.ts`**

```ts
/** e.g. "10月10日(土) 14:00" */
export function formatJaDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('month')}月${get('day')}日(${get('weekday')}) ${get('hour')}:${get('minute')}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/unit/hours.test.ts test/unit/time.test.ts`
Expected: PASS (all cases). If `formatJaDateTime` yields a leading zero in the hour (e.g. `09`), that is expected and correct for 2-digit hours.

- [ ] **Step 6: Commit**

```bash
git add server/src/domain/hours.ts server/src/domain/time.ts test/unit/hours.test.ts test/unit/time.test.ts
git commit -m "feat: add opening-hours checks and Japanese date formatting"
```

---

### Task 4: Text, references, JSON-enum validation and the LINE flex message

**Files:**
- Create: `server/src/domain/text.ts`, `server/src/domain/reference.ts`, `server/src/domain/validation.ts`, `server/src/domain/flex-message.ts`
- Test: `test/unit/text.test.ts`, `test/unit/reference.test.ts`, `test/unit/validation.test.ts`, `test/unit/flex-message.test.ts`

**Interfaces:**
- Produces:
  - `blocksToPlainText(blocks: unknown): string`
  - `teaser(text: string, max?: number): string`, with `max` defaulting to 160
  - `generateReference(random?: () => number): string`, returning `APT-1000` to `APT-9999`
  - `validateEnumArray(value: unknown, allowed: readonly string[], field: string): string | null`, which returns an error message or `null`
  - `interface ConfirmationMessageInput { houseName; reference; boutiqueName; boutiqueAddress; requestedForText; productNames: string[]; appLink }`
  - `buildConfirmationMessage(input): { altText: string; contents: Record<string, unknown> }`

- [ ] **Step 1: Write the failing tests**

`test/unit/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { blocksToPlainText, teaser } from '../../server/src/domain/text';

const blocks = [
  { type: 'heading', level: 2, children: [{ type: 'text', text: '旅のために' }] },
  { type: 'paragraph', children: [{ type: 'text', text: 'Hand-stitched ' }, { type: 'text', text: 'in Paris.', bold: true }] },
  { type: 'list', format: 'unordered', children: [
    { type: 'list-item', children: [{ type: 'text', text: 'Canvas' }] },
    { type: 'list-item', children: [{ type: 'text', text: 'Brass' }] },
  ] },
];

describe('blocksToPlainText', () => {
  it('joins blocks with blank lines and list items with newlines', () => {
    expect(blocksToPlainText(blocks)).toBe('旅のために\n\nHand-stitched in Paris.\n\nCanvas\nBrass');
  });

  it('returns an empty string for anything that is not a blocks array', () => {
    expect(blocksToPlainText(null)).toBe('');
    expect(blocksToPlainText('text')).toBe('');
  });
});

describe('teaser', () => {
  it('returns short text unchanged, with whitespace collapsed', () => {
    expect(teaser('  A   short\nstory ')).toBe('A short story');
  });

  it('cuts long text to max characters including the ellipsis', () => {
    const result = teaser('あ'.repeat(200), 160);
    expect(Array.from(result)).toHaveLength(160);
    expect(result.endsWith('…')).toBe(true);
  });
});
```

`test/unit/reference.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateReference } from '../../server/src/domain/reference';

describe('generateReference', () => {
  it('produces APT- followed by four digits', () => {
    expect(generateReference()).toMatch(/^APT-\d{4}$/);
  });

  it('spans APT-1000 to APT-9999', () => {
    expect(generateReference(() => 0)).toBe('APT-1000');
    expect(generateReference(() => 0.99999)).toBe('APT-9999');
  });
});
```

`test/unit/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OCCASIONS } from '../../server/src/constants';
import { validateEnumArray } from '../../server/src/domain/validation';

describe('validateEnumArray', () => {
  it('accepts an array of allowed values, including an empty one', () => {
    expect(validateEnumArray(['travel', 'wedding'], OCCASIONS, 'giftOccasions')).toBeNull();
    expect(validateEnumArray([], OCCASIONS, 'giftOccasions')).toBeNull();
  });

  it('rejects unknown values and non-arrays with a message naming the field', () => {
    expect(validateEnumArray(['travel', 'graduation'], OCCASIONS, 'giftOccasions')).toMatch(/giftOccasions.*graduation/);
    expect(validateEnumArray('travel', OCCASIONS, 'giftOccasions')).toMatch(/giftOccasions/);
  });

  it('rejects duplicates', () => {
    expect(validateEnumArray(['travel', 'travel'], OCCASIONS, 'giftOccasions')).toMatch(/more than once/);
  });
});
```

`test/unit/flex-message.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildConfirmationMessage } from '../../server/src/domain/flex-message';

const input = {
  houseName: 'メゾン',
  reference: 'APT-4821',
  boutiqueName: '銀座本店',
  boutiqueAddress: '東京都中央区銀座1-2-3（デモ）',
  requestedForText: '10月10日(土) 14:00',
  productNames: ['ウィークエンダー50', 'パスポートカバー'],
  appLink: 'https://liff.line.me/1234567890-AbCdEfGh/visits/APT-4821',
};

const collectTexts = (node: unknown, texts: string[] = []): string[] => {
  if (Array.isArray(node)) node.forEach((child) => collectTexts(child, texts));
  else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (record.type === 'text') texts.push(String(record.text));
    Object.values(record).forEach((value) => collectTexts(value, texts));
  }
  return texts;
};

describe('buildConfirmationMessage', () => {
  it('builds a bubble whose footer button opens the app link', () => {
    const message = buildConfirmationMessage(input);
    expect(message.altText).toBe('ご来店予約が確定しました（APT-4821）');
    expect(message.contents.type).toBe('bubble');
    const footer = message.contents.footer as { contents: Array<{ action: { type: string; uri: string; label: string } }> };
    expect(footer.contents[0].action).toEqual({ type: 'uri', label: '予約を確認する', uri: input.appLink });
  });

  it('includes every detail and never an empty text node', () => {
    const texts = collectTexts(buildConfirmationMessage(input).contents);
    for (const expected of ['メゾン', 'APT-4821', '銀座本店', '10月10日(土) 14:00', 'ウィークエンダー50、パスポートカバー']) {
      expect(texts).toContain(expected);
    }
    expect(texts.every((text) => text.length > 0)).toBe(true);
  });

  it('replaces an empty address with a dash, because LINE rejects empty text', () => {
    const texts = collectTexts(buildConfirmationMessage({ ...input, boutiqueAddress: '' }).contents);
    expect(texts).toContain('—');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/text.test.ts test/unit/reference.test.ts test/unit/validation.test.ts test/unit/flex-message.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Implement `server/src/domain/text.ts`**

```ts
interface BlockNode {
  type?: string;
  text?: string;
  children?: BlockNode[];
}

const textOf = (node: BlockNode): string => {
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
};

/** Strapi blocks → plain text: blocks separated by blank lines, list items by newlines. */
export function blocksToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return (blocks as BlockNode[])
    .map((block) =>
      block.type === 'list' && Array.isArray(block.children) ? block.children.map(textOf).join('\n') : textOf(block)
    )
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/** Collapses whitespace and cuts to `max` characters (code points), ending with "…" when cut. */
export function teaser(text: string, max = 160): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}
```

- [ ] **Step 4: Implement `server/src/domain/reference.ts`**

```ts
/** Short, human-readable appointment reference. Uniqueness is checked by the caller. */
export const generateReference = (random: () => number = Math.random): string =>
  `APT-${1000 + Math.floor(random() * 9000)}`;
```

- [ ] **Step 5: Implement `server/src/domain/validation.ts`**

```ts
/** Validates a JSON field that must be an array of distinct allowed strings. Returns an error message or null. */
export function validateEnumArray(value: unknown, allowed: readonly string[], field: string): string | null {
  if (!Array.isArray(value)) return `${field} must be an array of: ${allowed.join(', ')}`;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.includes(item)) {
      return `${field} contains "${String(item)}"; allowed values are: ${allowed.join(', ')}`;
    }
    if (seen.has(item)) return `${field} lists "${item}" more than once`;
    seen.add(item);
  }
  return null;
}
```

- [ ] **Step 6: Implement `server/src/domain/flex-message.ts`**

```ts
export interface ConfirmationMessageInput {
  houseName: string;
  reference: string;
  boutiqueName: string;
  boutiqueAddress: string;
  requestedForText: string;
  productNames: string[];
  appLink: string;
}

export interface FlexMessage {
  altText: string;
  contents: Record<string, unknown>;
}

const INK = '#1c1c1c';
const GOLD = '#e9dcc0';
const MUTED = '#8a8a8a';

/** LINE rejects empty text nodes, so empty values become a dash. */
const nonEmpty = (value: string) => (value.trim().length > 0 ? value : '—');

const row = (label: string, value: string) => ({
  type: 'box',
  layout: 'baseline',
  spacing: 'sm',
  contents: [
    { type: 'text', text: label, size: 'sm', color: MUTED, flex: 2 },
    { type: 'text', text: nonEmpty(value), size: 'sm', color: INK, flex: 5, wrap: true },
  ],
});

/** Japanese confirmation bubble, ready for LINE Bot MCP's push_flex_message. */
export function buildConfirmationMessage(input: ConfirmationMessageInput): FlexMessage {
  return {
    altText: `ご来店予約が確定しました（${input.reference}）`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: INK,
        paddingAll: '16px',
        contents: [{ type: 'text', text: nonEmpty(input.houseName), color: GOLD, align: 'center', weight: 'bold' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: 'ご来店予約が確定しました', weight: 'bold', size: 'lg', wrap: true },
          row('予約番号', input.reference),
          row('ブティック', input.boutiqueName),
          row('住所', input.boutiqueAddress),
          row('日時', input.requestedForText),
          row('お品物', input.productNames.join('、')),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', style: 'primary', color: INK, action: { type: 'uri', label: '予約を確認する', uri: input.appLink } },
        ],
      },
    },
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run test/unit/text.test.ts test/unit/reference.test.ts test/unit/validation.test.ts test/unit/flex-message.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/domain test/unit
git commit -m "feat: add text, reference, enum validation and LINE flex message helpers"
```

---

### Task 5: Plugin configuration

**Files:**
- Rewrite: `server/src/config/index.ts`
- Test: `test/unit/config.test.ts`

**Interfaces:**
- Consumes: `TOOL_NAMES`, `LOCALES` (Task 1)
- Produces:
  - `interface MaisonConfig { liffUrl: string | null; timezone: string; defaultLocale: Locale; maxOpenRequestsPerCustomer: number; houseName: { ja: string; en: string }; disabledTools: ToolName[] }`
  - `defaultConfig: MaisonConfig`
  - `validateConfig(config: Partial<MaisonConfig>): void`, which throws `Error('[maison] …')`
  - `getConfig(strapi): MaisonConfig`, which reads `strapi.config.get('plugin::maison')`

- [ ] **Step 1: Write the failing test `test/unit/config.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { defaultConfig, validateConfig } from '../../server/src/config';

describe('validateConfig', () => {
  it('accepts the defaults and a full valid config', () => {
    expect(() => validateConfig(defaultConfig)).not.toThrow();
    expect(() =>
      validateConfig({ ...defaultConfig, liffUrl: 'https://liff.line.me/1234567890-AbCdEfGh', disabledTools: ['find_boutiques'] })
    ).not.toThrow();
  });

  it('accepts an http://localhost app URL for local development', () => {
    expect(() => validateConfig({ ...defaultConfig, liffUrl: 'http://localhost:3003' })).not.toThrow();
  });

  it.each([
    ['an http liffUrl', { liffUrl: 'http://liff.line.me/x' }, /liffUrl/],
    ['a liffUrl with a trailing slash', { liffUrl: 'https://liff.line.me/x/' }, /liffUrl/],
    ['an unknown time zone', { timezone: 'Mars/Olympus' }, /timezone/],
    ['an unsupported default locale', { defaultLocale: 'fr' }, /defaultLocale/],
    ['a zero request limit', { maxOpenRequestsPerCustomer: 0 }, /maxOpenRequestsPerCustomer/],
    ['an empty house name', { houseName: { ja: '', en: 'Maison' } }, /houseName/],
    ['an unknown tool', { disabledTools: ['delete_everything'] }, /disabledTools/],
  ])('rejects %s', (_label, override, message) => {
    expect(() => validateConfig({ ...defaultConfig, ...(override as object) })).toThrow(message);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/config.test.ts`
Expected: FAIL, because `defaultConfig` and `validateConfig` are not exported yet.

- [ ] **Step 3: Rewrite `server/src/config/index.ts`**

```ts
import type { Core } from '@strapi/strapi';

import { LOCALES, PLUGIN_ID, TOOL_NAMES, type Locale, type ToolName } from '../constants';

export interface MaisonConfig {
  /** Base of links into the customer app, e.g. https://liff.line.me/<LIFF ID>. Needed for confirmations. */
  liffUrl: string | null;
  timezone: string;
  defaultLocale: Locale;
  maxOpenRequestsPerCustomer: number;
  houseName: { ja: string; en: string };
  disabledTools: ToolName[];
}

export const defaultConfig: MaisonConfig = {
  liffUrl: null,
  timezone: 'Asia/Tokyo',
  defaultLocale: 'ja',
  maxOpenRequestsPerCustomer: 3,
  houseName: { ja: 'メゾン', en: 'Maison' },
  disabledTools: [],
};

const fail = (message: string): never => {
  throw new Error(`[${PLUGIN_ID}] ${message}`);
};

/** https anywhere, or plain http on this machine for local development. */
const APP_URL = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?)$/;

export function validateConfig(config: Partial<MaisonConfig>): void {
  const merged = { ...defaultConfig, ...config };

  if (merged.liffUrl !== null) {
    if (typeof merged.liffUrl !== 'string' || !APP_URL.test(merged.liffUrl) || merged.liffUrl.endsWith('/')) {
      fail(
        'config.liffUrl must be an https URL (or http://localhost for local development) without a trailing slash, e.g. https://liff.line.me/<LIFF ID>'
      );
    }
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: merged.timezone });
  } catch {
    fail(`config.timezone "${merged.timezone}" is not a valid IANA time zone`);
  }
  if (!(LOCALES as readonly string[]).includes(merged.defaultLocale)) {
    fail(`config.defaultLocale must be one of ${LOCALES.join(', ')}`);
  }
  if (!Number.isInteger(merged.maxOpenRequestsPerCustomer) || merged.maxOpenRequestsPerCustomer < 1) {
    fail('config.maxOpenRequestsPerCustomer must be an integer of at least 1');
  }
  if (
    typeof merged.houseName?.ja !== 'string' ||
    merged.houseName.ja.trim() === '' ||
    typeof merged.houseName?.en !== 'string' ||
    merged.houseName.en.trim() === ''
  ) {
    fail('config.houseName needs non-empty ja and en strings');
  }
  if (!Array.isArray(merged.disabledTools) || merged.disabledTools.some((name) => !(TOOL_NAMES as readonly string[]).includes(name))) {
    fail(`config.disabledTools may only contain: ${TOOL_NAMES.join(', ')}`);
  }
}

export const getConfig = (strapi: Core.Strapi): MaisonConfig => ({
  ...defaultConfig,
  ...(strapi.config.get(`plugin::${PLUGIN_ID}`) as Partial<MaisonConfig>),
});

export default {
  default: defaultConfig,
  validator: validateConfig,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/unit/config.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the whole unit suite and the server type check**

Run: `npx vitest run && npm run test:ts:back`
Expected: all unit tests pass, and tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/config/index.ts test/unit/config.test.ts
git commit -m "feat: add maison plugin configuration with validation"
```

---

### Task 6: Content types, validation middleware and the relation check

This task carries the spec's first-task requirement: check how relations behave across locales and draft/publish on Strapi 5.55.1 before building on them. The check found:
- **Relations from a type without draft/publish break when their target is republished.** Strapi's `publish()` deletes and recreates a document's published row, so a stock level or notification that points at a published row is left pointing at nothing, with no error. `docs/relation-check.md` records the evidence.
- **Relations between two draft/publish types survive.** Appointment → boutique and products, and product → collection, survive publishing and republishing.

So, per the spec's fallback:
- **Stock levels** store `productSlug` and `boutiqueSlug`.
- **Notifications** store `appointmentReference`.
- **Appointments and products** keep their relations.

Tool contracts don't change.

Relations are bidirectional (`inversedBy`/`mappedBy`), like LaunchPad's own schemas. `sku` and `reference` get no `unique` flag: Strapi doesn't create a database index for it, and its validator would compare across locales. The services and the middleware enforce uniqueness where it matters.

The notification's delivery field is named `outcome`, not `status` as in the spec's table: `status` is a reserved attribute name in Strapi 5 (`contentTypes.getReservedAttributeNames()` in `@strapi/utils` 5.55.1), because the Document Service uses `status` for draft/published. Tool inputs and outputs still say `status`; only the stored field differs.

**Files:**
- Create: `server/src/content-types/{collection,product,boutique,stock-level,appointment,notification}/schema.json`, and an `index.ts` for each
- Rewrite: `server/src/content-types/index.ts`, `server/src/register.ts`
- Create: `server/src/document-middleware.ts`, `docs/relation-check.md` (the evidence behind the design above)
- Test: `test/integration/harness.mjs`, `test/integration/relations.test.mjs`

**Interfaces:**
- Consumes: `UID`, `OCCASIONS`, `PERSONALIZATION_KINDS` (Task 1), `validateOpeningHours` (Task 3), `validateEnumArray` (Task 4)
- Produces:
  - content types `plugin::maison.{collection,product,boutique,stock-level,appointment,notification}`. Stock levels have `productSlug`, `boutiqueSlug` and `quantity`; notifications have `appointmentReference`, `channel`, `outcome`, `sentAt`, `detail` and `recordedBy`.
  - `registerDocumentMiddleware(strapi)`
  - `bootStrapi(name: string): Promise<Strapi>`, `SUBJECT_A`, `SUBJECT_B` from `test/integration/harness.mjs`

- [ ] **Step 1: Create the six schemas**

`server/src/content-types/collection/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_collections",
  "info": { "singularName": "collection", "pluralName": "collections", "displayName": "Maison collection", "description": "A group of products, for example travel pieces." },
  "options": { "draftAndPublish": true },
  "pluginOptions": { "i18n": { "localized": true }, "content-manager": { "visible": true }, "content-type-builder": { "visible": false } },
  "attributes": {
    "name": { "type": "string", "required": true, "pluginOptions": { "i18n": { "localized": true } } },
    "slug": { "type": "uid", "targetField": "name", "required": true },
    "story": { "type": "blocks", "pluginOptions": { "i18n": { "localized": true } } },
    "heroImage": { "type": "media", "multiple": false, "allowedTypes": ["images"], "pluginOptions": { "i18n": { "localized": false } } },
    "products": { "type": "relation", "relation": "oneToMany", "target": "plugin::maison.product", "mappedBy": "collection" }
  }
}
```

`server/src/content-types/product/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_products",
  "info": { "singularName": "product", "pluralName": "products", "displayName": "Maison product", "description": "A piece in the house's catalog." },
  "options": { "draftAndPublish": true },
  "pluginOptions": { "i18n": { "localized": true }, "content-manager": { "visible": true }, "content-type-builder": { "visible": false } },
  "attributes": {
    "name": { "type": "string", "required": true, "pluginOptions": { "i18n": { "localized": true } } },
    "slug": { "type": "uid", "targetField": "name", "required": true },
    "sku": { "type": "string", "required": true, "pluginOptions": { "i18n": { "localized": false } } },
    "category": { "type": "enumeration", "enum": ["trunk", "bag", "small-leather", "travel", "objet"], "required": true, "pluginOptions": { "i18n": { "localized": false } } },
    "description": { "type": "blocks", "pluginOptions": { "i18n": { "localized": true } } },
    "craftStory": { "type": "text", "pluginOptions": { "i18n": { "localized": true } } },
    "priceJpy": { "type": "integer", "required": true, "min": 0, "pluginOptions": { "i18n": { "localized": false } } },
    "images": { "type": "media", "multiple": true, "allowedTypes": ["images"], "pluginOptions": { "i18n": { "localized": false } } },
    "widthCm": { "type": "decimal", "pluginOptions": { "i18n": { "localized": false } } },
    "heightCm": { "type": "decimal", "pluginOptions": { "i18n": { "localized": false } } },
    "depthCm": { "type": "decimal", "pluginOptions": { "i18n": { "localized": false } } },
    "personalizable": { "type": "boolean", "default": false, "pluginOptions": { "i18n": { "localized": false } } },
    "personalizationKinds": { "type": "json", "pluginOptions": { "i18n": { "localized": false } } },
    "personalizationLeadDays": { "type": "integer", "min": 0, "pluginOptions": { "i18n": { "localized": false } } },
    "giftOccasions": { "type": "json", "pluginOptions": { "i18n": { "localized": false } } },
    "collection": { "type": "relation", "relation": "manyToOne", "target": "plugin::maison.collection", "inversedBy": "products" },
    "appointments": { "type": "relation", "relation": "manyToMany", "target": "plugin::maison.appointment", "mappedBy": "products" }
  }
}
```

`server/src/content-types/boutique/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_boutiques",
  "info": { "singularName": "boutique", "pluralName": "boutiques", "displayName": "Maison boutique", "description": "A store customers can visit." },
  "options": { "draftAndPublish": true },
  "pluginOptions": { "i18n": { "localized": true }, "content-manager": { "visible": true }, "content-type-builder": { "visible": false } },
  "attributes": {
    "name": { "type": "string", "required": true, "pluginOptions": { "i18n": { "localized": true } } },
    "slug": { "type": "uid", "targetField": "name", "required": true },
    "city": { "type": "string", "pluginOptions": { "i18n": { "localized": true } } },
    "address": { "type": "text", "pluginOptions": { "i18n": { "localized": true } } },
    "openingHours": { "type": "json", "required": true, "pluginOptions": { "i18n": { "localized": false } } },
    "image": { "type": "media", "multiple": false, "allowedTypes": ["images"], "pluginOptions": { "i18n": { "localized": false } } },
    "appointments": { "type": "relation", "relation": "oneToMany", "target": "plugin::maison.appointment", "mappedBy": "boutique" }
  }
}
```

`server/src/content-types/stock-level/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_stock_levels",
  "info": { "singularName": "stock-level", "pluralName": "stock-levels", "displayName": "Maison stock level", "description": "How many of a product a boutique holds, keyed by the two slugs." },
  "options": { "draftAndPublish": false },
  "pluginOptions": { "content-manager": { "visible": true }, "content-type-builder": { "visible": false } },
  "attributes": {
    "productSlug": { "type": "string", "required": true },
    "boutiqueSlug": { "type": "string", "required": true },
    "quantity": { "type": "integer", "required": true, "min": 0, "default": 0 }
  }
}
```

`server/src/content-types/appointment/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_appointments",
  "info": { "singularName": "appointment", "pluralName": "appointments", "displayName": "Maison appointment", "description": "A boutique visit request. Publishing it confirms it." },
  "options": { "draftAndPublish": true },
  "pluginOptions": { "content-manager": { "visible": true }, "content-type-builder": { "visible": false } },
  "attributes": {
    "reference": { "type": "string", "required": true },
    "customer": { "type": "string", "required": true, "private": true },
    "boutique": { "type": "relation", "relation": "manyToOne", "target": "plugin::maison.boutique", "inversedBy": "appointments" },
    "products": { "type": "relation", "relation": "manyToMany", "target": "plugin::maison.product", "inversedBy": "appointments" },
    "requestedFor": { "type": "datetime", "required": true },
    "customerNote": { "type": "text", "maxLength": 500 },
    "createdVia": { "type": "enumeration", "enum": ["concierge", "app"], "default": "app" }
  }
}
```

`server/src/content-types/notification/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "maison_notifications",
  "info": { "singularName": "notification", "pluralName": "notifications", "displayName": "Maison notification", "description": "Append-only log of confirmation delivery attempts." },
  "options": { "draftAndPublish": false },
  "pluginOptions": { "content-manager": { "visible": true }, "content-type-builder": { "visible": false } },
  "attributes": {
    "appointmentReference": { "type": "string", "required": true },
    "channel": { "type": "enumeration", "enum": ["line"], "default": "line", "required": true },
    "outcome": { "type": "enumeration", "enum": ["sent", "failed"], "required": true },
    "sentAt": { "type": "datetime", "required": true },
    "detail": { "type": "text", "maxLength": 500 },
    "recordedBy": { "type": "string" }
  }
}
```

- [ ] **Step 2: Create the content-type index files**

Each of the six folders gets an `index.ts`:

```ts
import schema from './schema.json';

export default { schema };
```

`server/src/content-types/index.ts` (keys must equal each `singularName`):

```ts
import appointment from './appointment';
import boutique from './boutique';
import collection from './collection';
import notification from './notification';
import product from './product';
import stockLevel from './stock-level';

export default {
  collection,
  product,
  boutique,
  'stock-level': stockLevel,
  appointment,
  notification,
};
```

- [ ] **Step 3: Implement `server/src/document-middleware.ts`**

```ts
import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { OCCASIONS, PERSONALIZATION_KINDS, UID } from './constants';
import { validateOpeningHours } from './domain/hours';
import { validateEnumArray } from './domain/validation';

type Data = Record<string, unknown>;

const fail = (message: string): never => {
  throw new errors.ValidationError(message);
};

const validateProduct = (data: Data) => {
  const fields = [
    ['personalizationKinds', PERSONALIZATION_KINDS],
    ['giftOccasions', OCCASIONS],
  ] as const;
  for (const [field, allowed] of fields) {
    if (data[field] === undefined || data[field] === null) continue;
    const problem = validateEnumArray(data[field], allowed, field);
    if (problem) fail(problem);
  }
};

const validateBoutique = (data: Data) => {
  if (data.openingHours === undefined) return;
  const result = validateOpeningHours(data.openingHours);
  if (result.ok === false) fail(result.reason);
};

const assertUniqueStockPair = async (strapi: Core.Strapi, data: Data) => {
  const { productSlug, boutiqueSlug } = data;
  if (typeof productSlug !== 'string' || typeof boutiqueSlug !== 'string') return;
  const existing = await strapi.documents(UID.stockLevel).count({
    filters: { productSlug: { $eq: productSlug }, boutiqueSlug: { $eq: boutiqueSlug } },
  });
  if (existing > 0) fail('A stock level for this product and boutique already exists; update it instead.');
};

/** Same rules for the admin and the tools: every create/update goes through the Document Service. */
export const registerDocumentMiddleware = (strapi: Core.Strapi) => {
  strapi.documents.use(async (ctx, next) => {
    if (ctx.action === 'create' || ctx.action === 'update') {
      const data = ((ctx.params as { data?: Data }).data ?? {}) as Data;
      if (ctx.uid === UID.product) validateProduct(data);
      if (ctx.uid === UID.boutique) validateBoutique(data);
      if (ctx.uid === UID.stockLevel && ctx.action === 'create') await assertUniqueStockPair(strapi, data);
    }
    return next();
  });
};
```

- [ ] **Step 4: Wire it in `server/src/register.ts`**

```ts
import type { Core } from '@strapi/strapi';

import { registerDocumentMiddleware } from './document-middleware';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  registerDocumentMiddleware(strapi);
};

export default register;
```

- [ ] **Step 5: Run the unit tests and type checks**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 6: Create the integration harness `test/integration/harness.mjs`**

It boots the app at `STRAPI_APP_DIR` with its own throwaway SQLite file per test file, so tests never touch the dev database.

```js
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const SUBJECT_A = `line:U${'a'.repeat(32)}`;
export const SUBJECT_B = `line:U${'b'.repeat(32)}`;

/** Boots the Strapi app (with this plugin yalc-linked) against .tmp/maison-test-<name>.db. */
export async function bootStrapi(name) {
  const appDir = process.env.STRAPI_APP_DIR;
  if (!appDir) {
    throw new Error('Set STRAPI_APP_DIR to the Strapi app that links this plugin, e.g. ~/work/launchpad-fork-latest/strapi');
  }
  const dbFile = `.tmp/maison-test-${name}.db`;
  rmSync(path.join(appDir, dbFile), { force: true });
  process.env.DATABASE_FILENAME = dbFile;
  process.chdir(appDir);
  const requireFromApp = createRequire(path.join(appDir, 'package.json'));
  const { createStrapi, compileStrapi } = requireFromApp('@strapi/strapi');
  const appContext = await compileStrapi({ appDir });
  const strapi = createStrapi(appContext);
  await strapi.load();
  return strapi;
}

export async function ensureLocales(strapi) {
  const locales = strapi.plugin('i18n').service('locales');
  for (const [code, name] of [['ja', 'Japanese (ja)'], ['en', 'English (en)']]) {
    if (!(await locales.findByCode(code))) await locales.create({ code, name });
  }
}
```

- [ ] **Step 7: Write the relation check `test/integration/relations.test.mjs`**

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi, ensureLocales } from './harness.mjs';

const UID = {
  collection: 'plugin::maison.collection',
  product: 'plugin::maison.product',
  boutique: 'plugin::maison.boutique',
  stock: 'plugin::maison.stock-level',
  appointment: 'plugin::maison.appointment',
  notification: 'plugin::maison.notification',
};
const saturday = [{ weekday: 'sat', opens: '11:00', closes: '20:00' }];

describe('relations across locales and draft/publish (Strapi 5.55)', () => {
  let strapi;
  let boutique;
  let product;

  before(async () => {
    strapi = await bootStrapi('relations');
    await ensureLocales(strapi);
    boutique = (await strapi.documents(UID.boutique).create({
      locale: 'ja', status: 'published', data: { name: '銀座', slug: 'ginza', openingHours: saturday },
    })).documentId;
    product = (await strapi.documents(UID.product).create({
      locale: 'ja', status: 'published', data: { name: '検証', slug: 'probe', sku: 'PROBE-1', category: 'bag', priceJpy: 1000 },
    })).documentId;
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('keys stock levels by slug, so republishing a product or adding a locale never orphans them', async () => {
    await strapi.documents(UID.stock).create({ data: { productSlug: 'probe', boutiqueSlug: 'ginza', quantity: 2 } });
    const read = () => strapi.documents(UID.stock).findMany({ filters: { productSlug: { $eq: 'probe' } } });
    assert.equal((await read()).length, 1);

    await strapi.documents(UID.product).update({ documentId: product, locale: 'ja', data: { priceJpy: 2000 } });
    await strapi.documents(UID.product).publish({ documentId: product, locale: 'ja' });
    await strapi.documents(UID.product).update({ documentId: product, locale: 'en', data: { name: 'Probe', slug: 'probe' } });
    await strapi.documents(UID.product).publish({ documentId: product, locale: 'en' });

    const rows = await read();
    assert.equal(rows.length, 1, 'the stock level is still found by product slug');
    assert.equal(rows[0].boutiqueSlug, 'ginza');
    assert.equal(rows[0].quantity, 2);
  });

  it('keeps an appointment linked when it is published and when its boutique is republished', async () => {
    const created = await strapi.documents(UID.appointment).create({
      data: {
        reference: 'APT-0001',
        customer: SUBJECT_A,
        requestedFor: '2026-10-10T05:00:00.000Z',
        boutique: { documentId: boutique, locale: 'ja' },
        products: [{ documentId: product, locale: 'ja' }],
        createdVia: 'app',
      },
    });
    const populate = { boutique: { fields: ['documentId'] }, products: { fields: ['documentId'] } };
    const draft = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'draft', populate });
    assert.equal(draft.boutique?.documentId, boutique);
    assert.equal(draft.products?.length, 1);

    await strapi.documents(UID.appointment).publish({ documentId: created.documentId });
    const published = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'published', populate });
    assert.equal(published.boutique?.documentId, boutique, 'published appointment keeps its boutique');
    assert.equal(published.products?.[0]?.documentId, product, 'published appointment keeps its product');

    await strapi.documents(UID.boutique).update({ documentId: boutique, locale: 'ja', data: { name: '銀座本店' } });
    await strapi.documents(UID.boutique).publish({ documentId: boutique, locale: 'ja' });
    const again = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'published', populate });
    assert.equal(again.boutique?.documentId, boutique, 'relation survives a boutique republish');

    await strapi.documents(UID.product).update({ documentId: product, locale: 'ja', data: { priceJpy: 3000 } });
    await strapi.documents(UID.product).publish({ documentId: product, locale: 'ja' });
    const afterProduct = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'published', populate });
    assert.equal(afterProduct.products?.[0]?.documentId, product, 'relation survives a product republish');

    await strapi.documents(UID.notification).create({
      data: { appointmentReference: 'APT-0001', channel: 'line', outcome: 'sent', sentAt: new Date().toISOString(), detail: 'probe', recordedBy: 'test' },
    });
    const logged = () => strapi.documents(UID.notification).findMany({ filters: { appointmentReference: { $eq: 'APT-0001' } } });
    assert.equal((await logged()).length, 1, 'notification is found by appointment reference');

    await strapi.documents(UID.appointment).update({ documentId: created.documentId, data: { customerNote: 'edited after confirmation' } });
    await strapi.documents(UID.appointment).publish({ documentId: created.documentId });
    assert.equal((await logged()).length, 1, 'notification survives a republish of its appointment');
    const republished = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'published', populate });
    assert.equal(republished.boutique?.documentId, boutique, 'the republished appointment keeps its boutique');
    assert.equal(republished.products?.[0]?.documentId, product, 'and its product');
  });

  it('keeps a product in its collection when the collection is republished', async () => {
    const collection = (await strapi.documents(UID.collection).create({
      locale: 'ja', status: 'published', data: { name: '旅', slug: 'voyage-probe' },
    })).documentId;
    await strapi.documents(UID.product).update({ documentId: product, locale: 'ja', data: { collection } });
    await strapi.documents(UID.product).publish({ documentId: product, locale: 'ja' });
    const inCollection = () => strapi.documents(UID.product).findMany({
      locale: 'ja', status: 'published', filters: { collection: { slug: { $eq: 'voyage-probe' } } }, fields: ['slug'],
    });
    assert.deepEqual((await inCollection()).map((p) => p.slug), ['probe']);

    await strapi.documents(UID.collection).update({ documentId: collection, locale: 'ja', data: { name: '旅の品' } });
    await strapi.documents(UID.collection).publish({ documentId: collection, locale: 'ja' });
    assert.deepEqual((await inCollection()).map((p) => p.slug), ['probe'], 'the product stays in its collection');
  });

  it('applies the validation middleware', async () => {
    await assert.rejects(
      strapi.documents(UID.stock).create({ data: { productSlug: 'probe', boutiqueSlug: 'ginza', quantity: 1 } }),
      /already exists/
    );
    await assert.rejects(
      strapi.documents(UID.product).create({
        locale: 'ja',
        data: { name: 'x', slug: 'bad-occasion', sku: 'X-1', category: 'bag', priceJpy: 1, giftOccasions: ['graduation'] },
      }),
      /graduation/
    );
    await assert.rejects(
      strapi.documents(UID.boutique).create({
        locale: 'ja',
        data: { name: 'x', slug: 'bad-hours', openingHours: [{ weekday: 'mon', opens: '20:00', closes: '11:00' }] },
      }),
      /open before/
    );
  });
});
```

- [ ] **Step 8: Build, push to LaunchPad, and run the relation check**

```bash
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi node --test test/integration/relations.test.mjs
```

Expected: 4 passing tests. The first run takes about 30 seconds while Strapi compiles and creates the test database.

**If an assertion about appointment or collection relations fails,** append the output to `docs/relation-check.md` and report BLOCKED. It would mean the slug fallback must extend to relations between draft/publish types too.

- [ ] **Step 9: Commit**

```bash
git add server/src/content-types server/src/document-middleware.ts server/src/register.ts test/integration docs/relation-check.md
git commit -m "feat: add maison content types, validation middleware and relation checks"
```

---

### Task 7: Permissions, identity service and MCP registration

**Files:**
- Rewrite: `server/src/bootstrap.ts`, `server/src/services/index.ts`, `server/src/register.ts`
- Create: `server/src/services/identity.ts`, `server/src/services/errors.ts`, `server/src/mcp/define.ts`, `server/src/mcp/index.ts`
- Test: `test/unit/fake-strapi.ts`, `test/unit/identity.test.ts`, `test/unit/register-mcp.test.ts`, `test/integration/permissions.test.mjs`

**Interfaces:**
- Consumes: `authorizationOf`, `parseSubject` (Task 2), `toolError` (Task 2), `getConfig` (Task 5), `OAUTH_PLUGIN_ID`, `PLUGIN_ID` (Task 1)
- Produces:
  - service `identity.getCustomerSubject(extra): Promise<string | null>`
  - service `errors.toolError`
  - `defineTool` and `definePrompt` from `server/src/mcp/define.ts`: identity functions typed as Strapi's `Modules.MCP.McpToolBuilder` and `McpPromptBuilder`, so tool handlers get typed `args` and checked results
  - `registerMcp(strapi)`, called from `register()`. It warns and returns when MCP is off. Tasks 9–11 add one registration line per tool.
  - the test helper `fakeStrapi({ services, config, plugins, mcp })` and `extraWith(headers)`

Why a local `defineTool`: `ai.mcp.defineTool` from `@strapi/strapi` is an identity function too, but importing `@strapi/strapi` loads Strapi core, and its ESM build can't be imported by Node or vitest (`ERR_UNSUPPORTED_DIR_IMPORT` on `lodash/fp`). A type-only import keeps unit tests fast and working.

- [ ] **Step 1: Write the test helper `test/unit/fake-strapi.ts`**

```ts
import { vi } from 'vitest';

interface FakeOptions {
  services?: Record<string, unknown>;
  config?: Record<string, unknown>;
  /** Other plugins by id, e.g. { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject } } } */
  plugins?: Record<string, Record<string, unknown>>;
  /** Stand-in for strapi.ai.mcp */
  mcp?: { isEnabled: () => boolean; registerTool: (...args: any[]) => void; registerPrompt: (...args: any[]) => void };
}

/** Just enough of Core.Strapi for services and tool handlers under test. */
export const fakeStrapi = ({ services = {}, config = {}, plugins = {}, mcp }: FakeOptions = {}) =>
  ({
    plugin: (id: string) => {
      if (id === 'maison') return { service: (name: string) => services[name] };
      const other = plugins[id];
      return other ? { service: (name: string) => other[name] } : undefined;
    },
    config: {
      get: (key: string) => (key === 'plugin::maison' ? config : key === 'server.url' ? 'https://cms.example.test' : undefined),
    },
    ai: mcp ? { mcp } : undefined,
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }) as any;

export const extraWith = (headers: Record<string, string | string[]>) => ({ requestInfo: { headers } });

export const fakeMcp = (enabled = true) => ({ isEnabled: () => enabled, registerTool: vi.fn(), registerPrompt: vi.fn() });
```

- [ ] **Step 2: Write the failing tests**

`test/unit/identity.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import identityService from '../../server/src/services/identity';
import { extraWith, fakeStrapi } from './fake-strapi';

const VALID = `line:U${'4af4980629c1a7b3f1e2d3c4b5a69788'}`;
const withResolver = (resolveSubject: (auth: string) => Promise<unknown>) =>
  identityService({ strapi: fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject } } } }) });

describe('identity.getCustomerSubject', () => {
  it('returns the subject oauth-mcp-manager resolves from the raw Authorization header', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    const subject = await withResolver(resolveSubject).getCustomerSubject(extraWith({ authorization: 'Bearer mcp_at_x' }));
    expect(subject).toBe(VALID);
    expect(resolveSubject).toHaveBeenCalledWith('Bearer mcp_at_x');
  });

  it.each([
    ['uppercase hex', `line:U${'4AF4980629C1A7B3F1E2D3C4B5A69788'}`],
    ['no line: prefix', 'U4af4980629c1a7b3f1e2d3c4b5a69788'],
    ['null for a staff or admin token', null],
  ])('treats a resolver result with %s as not signed in', async (_label, value) => {
    expect(await withResolver(async () => value).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
  });

  it('returns null without calling the resolver when the header is missing or repeated', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    const service = withResolver(resolveSubject);
    expect(await service.getCustomerSubject(undefined)).toBeNull();
    expect(await service.getCustomerSubject(extraWith({}))).toBeNull();
    expect(await service.getCustomerSubject(extraWith({ authorization: ['Bearer a', 'Bearer b'] }))).toBeNull();
    expect(resolveSubject).not.toHaveBeenCalled();
  });

  it('returns null when oauth-mcp-manager is not installed or has no resolveSubject', async () => {
    expect(await identityService({ strapi: fakeStrapi() }).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
    const old = identityService({ strapi: fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: {} } } }) });
    expect(await old.getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
  });

  it('returns null and logs when the resolver throws', async () => {
    const strapi = fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject: async () => { throw new Error('db down'); } } } } });
    expect(await identityService({ strapi }).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
    expect(strapi.log.warn).toHaveBeenCalled();
  });
});
```

`test/unit/register-mcp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { registerMcp } from '../../server/src/mcp';
import { fakeMcp, fakeStrapi } from './fake-strapi';

describe('registerMcp', () => {
  it('warns and registers nothing when Strapi MCP is disabled', () => {
    const mcp = fakeMcp(false);
    const strapi = fakeStrapi({ mcp });
    registerMcp(strapi);
    expect(strapi.log.warn).toHaveBeenCalledWith(expect.stringMatching(/server\.mcp\.enabled/));
    expect(mcp.registerTool).not.toHaveBeenCalled();
    expect(mcp.registerPrompt).not.toHaveBeenCalled();
  });

  it('warns when the host Strapi has no MCP service at all', () => {
    const strapi = fakeStrapi();
    expect(() => registerMcp(strapi)).not.toThrow();
    expect(strapi.log.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run test/unit/identity.test.ts test/unit/register-mcp.test.ts`
Expected: FAIL with "Failed to resolve import ../../server/src/services/identity" and "../../server/src/mcp".

- [ ] **Step 4: Implement `server/src/services/identity.ts`**

```ts
import type { Core } from '@strapi/strapi';

import { OAUTH_PLUGIN_ID } from '../constants';
import { authorizationOf, parseSubject } from '../domain/subject';

export interface HandlerExtra {
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
}

type SubjectResolver = { resolveSubject?: (authorization: string) => Promise<unknown> };

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * The verified LINE subject of the MCP caller, or null.
   * Tools see the caller's original Authorization header (Strapi builds tool-visible headers from the
   * raw request), and oauth-mcp-manager maps its session token to the grant's subject.
   */
  async getCustomerSubject(extra: HandlerExtra | undefined): Promise<string | null> {
    const authorization = authorizationOf(extra?.requestInfo?.headers);
    if (!authorization) return null;
    let oauth: SubjectResolver | undefined;
    try {
      oauth = strapi.plugin(OAUTH_PLUGIN_ID)?.service('oauth') as SubjectResolver | undefined;
    } catch {
      oauth = undefined;
    }
    if (typeof oauth?.resolveSubject !== 'function') return null;
    try {
      return parseSubject(await oauth.resolveSubject(authorization));
    } catch (error) {
      strapi.log.warn(`[maison] resolveSubject failed: ${(error as Error).message}`);
      return null;
    }
  },
});
```

- [ ] **Step 5: Implement the errors service, the service index and the MCP registry**

`server/src/services/errors.ts`:

```ts
import { toolError } from '../domain/tool-result';

/** Exposed so app-level tools return errors in the same shape as Maison's. */
export default () => ({ toolError });
```

`server/src/services/index.ts`:

```ts
import errors from './errors';
import identity from './identity';

export default {
  errors,
  identity,
};
```

`server/src/mcp/define.ts`:

```ts
import type { Modules } from '@strapi/strapi';

/**
 * Same as `ai.mcp.defineTool` / `ai.mcp.definePrompt` from '@strapi/strapi' (identity functions that
 * infer handler types), without loading Strapi core at runtime.
 */
export const defineTool: Modules.MCP.McpToolBuilder = (tool: any) => tool;
export const definePrompt: Modules.MCP.McpPromptBuilder = (prompt: any) => prompt;
```

`server/src/mcp/index.ts`:

```ts
import type { Core } from '@strapi/strapi';

/** Must run in register(): Strapi locks the MCP capability set when the server starts. */
export const registerMcp = (strapi: Core.Strapi) => {
  if (!strapi.ai?.mcp?.isEnabled()) {
    strapi.log.warn('[maison] server.mcp.enabled is not true, so the Maison MCP tools are not registered.');
    return;
  }
};
```

Each tool is registered on its own line (Tasks 9–11), not in a loop over an array: `registerTool` is generic per tool, and TypeScript can only check each definition when it's passed directly.

`server/src/register.ts`:

```ts
import type { Core } from '@strapi/strapi';

import { registerDocumentMiddleware } from './document-middleware';
import { registerMcp } from './mcp';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  registerDocumentMiddleware(strapi);
  registerMcp(strapi);
};

export default register;
```

- [ ] **Step 6: Register the permission actions in `server/src/bootstrap.ts`**

```ts
import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from './constants';

const ACTIONS = [
  { uid: 'catalog.read', displayName: 'MCP: browse the catalog', subCategory: 'mcp' },
  { uid: 'appointments.request', displayName: 'MCP: request and view own appointments', subCategory: 'mcp' },
  { uid: 'confirmations.send', displayName: 'MCP: send appointment confirmations', subCategory: 'mcp' },
  { uid: 'demo.manage', displayName: 'Load and reset demo data', subCategory: 'demo' },
];

/** Actions must be registered in bootstrap (registerMany throws once Strapi is loaded). */
const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi
    .service('admin::permission')
    .actionProvider.registerMany(ACTIONS.map((action) => ({ section: 'plugins', pluginName: PLUGIN_ID, ...action })));
};

export default bootstrap;
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 8: Write `test/integration/permissions.test.mjs`**

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { bootStrapi } from './harness.mjs';

describe('maison permission actions', () => {
  let strapi;
  before(async () => {
    strapi = await bootStrapi('permissions');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('registers the four plugin actions', () => {
    const ids = strapi.service('admin::permission').actionProvider.values().map((action) => action.actionId);
    for (const id of [
      'plugin::maison.catalog.read',
      'plugin::maison.appointments.request',
      'plugin::maison.confirmations.send',
      'plugin::maison.demo.manage',
    ]) {
      assert.ok(ids.includes(id), `${id} is registered`);
    }
  });
});
```

- [ ] **Step 9: Build, push and run it**

```bash
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi node --test test/integration/permissions.test.mjs
```

Expected: 1 passing test.

- [ ] **Step 10: Commit**

```bash
git add server/src test/unit test/integration/permissions.test.mjs
git commit -m "feat: register maison permissions, identity lookup and MCP registry"
```

---

### Task 8: Seed data and the demo admin routes

**Files:**
- Create: `server/seed/content.json`, `scripts/generate-seed-images.mjs`, `server/seed/images/*.png` (generated), `server/seed/images/SOURCES.md`
- Create: `server/src/services/seed.ts`, `server/src/controllers/demo.ts`
- Rewrite: `server/src/controllers/index.ts`, `server/src/routes/index.ts`
- Modify: `server/src/services/index.ts`, `package.json` (devDependency `sharp`)
- Test: `test/integration/seed.test.mjs`

**Interfaces:**
- Consumes: `UID`, `ACTION` (Task 1), content types (Task 6)
- Produces:
  - service `seed.loadDemoCatalog(): Promise<{ created: boolean; collections: number; products: number; boutiques: number; stockLevels: number }>`
  - service `seed.resetDemoAppointments(): Promise<{ appointments: number; notifications: number }>`
  - admin routes `POST /maison/demo/seed` and `POST /maison/demo/reset`, gated by `plugin::maison.demo.manage`

- [ ] **Step 1: Create `server/seed/content.json`**

```json
{
  "locales": [
    { "code": "ja", "name": "Japanese (ja)" },
    { "code": "en", "name": "English (en)" }
  ],
  "boutiques": [
    {
      "slug": "ginza",
      "name": { "ja": "銀座本店", "en": "Ginza Flagship" },
      "city": { "ja": "東京", "en": "Tokyo" },
      "address": { "ja": "東京都中央区銀座 1-2-3（デモ）", "en": "1-2-3 Ginza, Chuo-ku, Tokyo (demo)" },
      "openingHours": [
        { "weekday": "mon", "opens": "11:00", "closes": "20:00" },
        { "weekday": "tue", "opens": "11:00", "closes": "20:00" },
        { "weekday": "wed", "opens": "11:00", "closes": "20:00" },
        { "weekday": "thu", "opens": "11:00", "closes": "20:00" },
        { "weekday": "fri", "opens": "11:00", "closes": "20:00" },
        { "weekday": "sat", "opens": "11:00", "closes": "20:00" },
        { "weekday": "sun", "opens": "11:00", "closes": "20:00" }
      ],
      "image": "boutique-ginza.png"
    },
    {
      "slug": "omotesando",
      "name": { "ja": "表参道店", "en": "Omotesando" },
      "city": { "ja": "東京", "en": "Tokyo" },
      "address": { "ja": "東京都渋谷区神宮前 4-5-6（デモ）", "en": "4-5-6 Jingumae, Shibuya-ku, Tokyo (demo)" },
      "openingHours": [
        { "weekday": "mon", "opens": "11:00", "closes": "20:00" },
        { "weekday": "tue", "opens": "11:00", "closes": "20:00" },
        { "weekday": "wed", "opens": "11:00", "closes": "20:00" },
        { "weekday": "thu", "opens": "11:00", "closes": "20:00" },
        { "weekday": "fri", "opens": "11:00", "closes": "20:00" },
        { "weekday": "sat", "opens": "11:00", "closes": "20:00" },
        { "weekday": "sun", "opens": "11:00", "closes": "20:00" }
      ],
      "image": "boutique-omotesando.png"
    },
    {
      "slug": "osaka",
      "name": { "ja": "大阪心斎橋店", "en": "Osaka Shinsaibashi" },
      "city": { "ja": "大阪", "en": "Osaka" },
      "address": { "ja": "大阪府大阪市中央区心斎橋筋 7-8-9（デモ）", "en": "7-8-9 Shinsaibashisuji, Chuo-ku, Osaka (demo)" },
      "openingHours": [
        { "weekday": "mon", "opens": "11:00", "closes": "20:00" },
        { "weekday": "wed", "opens": "11:00", "closes": "20:00" },
        { "weekday": "thu", "opens": "11:00", "closes": "20:00" },
        { "weekday": "fri", "opens": "11:00", "closes": "20:00" },
        { "weekday": "sat", "opens": "11:00", "closes": "20:00" },
        { "weekday": "sun", "opens": "11:00", "closes": "20:00" }
      ],
      "image": "boutique-osaka.png"
    }
  ],
  "collections": [
    {
      "slug": "voyage",
      "name": { "ja": "ヴォヤージュ", "en": "Voyage" },
      "story": { "ja": "旅の記憶を運ぶために。職人が一つひとつ手作業で仕上げるトランクとバッグ。", "en": "Made to carry the memory of a journey: trunks and bags finished by hand, one at a time." },
      "image": "collection-voyage.png"
    },
    {
      "slug": "atelier",
      "name": { "ja": "アトリエ", "en": "Atelier" },
      "story": { "ja": "毎日に寄り添うレザーグッズ。使うほどに手になじむ素材を選びました。", "en": "Leather goods for every day, in materials chosen to soften with use." },
      "image": "collection-atelier.png"
    },
    {
      "slug": "gifts",
      "name": { "ja": "ギフト", "en": "Gifts" },
      "story": { "ja": "大切な人へ贈る、小さな宝箱。イニシャルを入れて特別な一品に。", "en": "Small treasure boxes to give. Add initials to make each one personal." },
      "image": "collection-gifts.png"
    }
  ],
  "products": [
    { "slug": "voyage-trunk-110", "sku": "MSN-VY-110", "collection": "voyage", "category": "trunk", "priceJpy": 2800000, "dimensionsCm": [110, 58, 55], "personalizable": true, "personalizationKinds": ["hand-painted-stripes", "initials-hot-stamp"], "personalizationLeadDays": 90, "giftOccasions": ["travel", "wedding"], "name": { "ja": "ヴォヤージュ・トランク 110", "en": "Voyage Trunk 110" }, "description": { "ja": "木枠にキャンバスを張り、真鍮の金具で仕上げた大型トランク。長い旅の相棒として、世代を超えて受け継がれます。", "en": "A large trunk of canvas over a wooden frame, finished with brass fittings. A companion for long journeys, made to be handed down." }, "craftStory": { "ja": "一台の完成までに、職人が約 300 時間をかけます。", "en": "Each trunk takes an artisan around 300 hours to complete." }, "image": "product-voyage-trunk-110.png" },
    { "slug": "weekender-50", "sku": "MSN-VY-050", "collection": "voyage", "category": "travel", "priceJpy": 385000, "dimensionsCm": [50, 29, 22], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel", "birthday", "anniversary"], "name": { "ja": "ウィークエンダー 50", "en": "Weekender 50" }, "description": { "ja": "週末の旅にちょうどいいサイズのボストンバッグ。取り外し可能なショルダーストラップ付き。", "en": "A holdall sized for a weekend away, with a detachable shoulder strap." }, "craftStory": { "ja": "持ち手は一本の革から切り出し、手縫いで仕上げています。", "en": "The handles are cut from a single hide and stitched by hand." }, "image": "product-weekender-50.png" },
    { "slug": "cabin-case-55", "sku": "MSN-VY-055", "collection": "voyage", "category": "trunk", "priceJpy": 690000, "dimensionsCm": [55, 40, 23], "personalizable": true, "personalizationKinds": ["monogram-color", "initials-hot-stamp"], "personalizationLeadDays": 14, "giftOccasions": ["travel", "new-job"], "name": { "ja": "キャビン・ケース 55", "en": "Cabin Case 55" }, "description": { "ja": "機内持ち込みサイズのハードケース。静音キャスターと伸縮ハンドルを備えています。", "en": "A carry-on hard case with silent wheels and a telescopic handle." }, "craftStory": { "ja": "角を守る真鍮のコーナーは、一つずつ手で打ち込みます。", "en": "The brass corner guards are set by hand, one by one." }, "image": "product-cabin-case-55.png" },
    { "slug": "garment-carrier", "sku": "MSN-VY-GC1", "collection": "voyage", "category": "travel", "priceJpy": 248000, "dimensionsCm": [60, 105, 6], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel", "new-job"], "name": { "ja": "ガーメント・キャリア", "en": "Garment Carrier" }, "description": { "ja": "スーツやドレスをしわにせず運べる、二つ折りのガーメントケース。", "en": "A folding garment case that carries a suit or dress without creases." }, "craftStory": { "ja": "内側のライニングには、しわになりにくい綿サテンを使っています。", "en": "The lining is a cotton satin chosen to resist creasing." }, "image": "product-garment-carrier.png" },
    { "slug": "tote-soleil", "sku": "MSN-AT-TS1", "collection": "atelier", "category": "bag", "priceJpy": 312000, "dimensionsCm": [38, 30, 16], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["birthday", "anniversary"], "name": { "ja": "トート・ソレイユ", "en": "Tote Soleil" }, "description": { "ja": "A4 サイズが入る、しなやかなレザートート。内側にジップポケット付き。", "en": "A supple leather tote that fits A4 documents, with an inner zip pocket." }, "craftStory": { "ja": "革の縁は七回塗り重ねて、なめらかに仕上げています。", "en": "The leather edges are painted seven times for a smooth finish." }, "image": "product-tote-soleil.png" },
    { "slug": "coffret-mini", "sku": "MSN-AT-CM1", "collection": "atelier", "category": "bag", "priceJpy": 268000, "dimensionsCm": [20, 14, 8], "personalizable": true, "personalizationKinds": ["monogram-color"], "personalizationLeadDays": 14, "giftOccasions": ["anniversary", "birthday"], "name": { "ja": "コフレ・ミニ", "en": "Coffret Mini" }, "description": { "ja": "小さなトランクをかたどったハンドバッグ。チェーンストラップで肩掛けもできます。", "en": "A handbag shaped like a small trunk, with a chain strap to wear on the shoulder." }, "craftStory": { "ja": "留め金は、トランクと同じ工房で作られています。", "en": "Its clasp is made in the same workshop as the trunks." }, "image": "product-coffret-mini.png" },
    { "slug": "carnet-wallet", "sku": "MSN-AT-CW1", "collection": "atelier", "category": "small-leather", "priceJpy": 98000, "dimensionsCm": [19, 10, 2], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["new-job", "birthday"], "name": { "ja": "カルネ・ウォレット", "en": "Carnet Wallet" }, "description": { "ja": "カード 12 枚と紙幣が収まる長財布。", "en": "A long wallet with room for twelve cards and notes." }, "craftStory": { "ja": "ステッチは 1 センチに 7 目、ほつれにくい手縫いです。", "en": "Hand-stitched at seven stitches per centimetre, so it won't unravel." }, "image": "product-carnet-wallet.png" },
    { "slug": "card-case-quatre", "sku": "MSN-AT-CC4", "collection": "atelier", "category": "small-leather", "priceJpy": 52000, "dimensionsCm": [11, 8, 1], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["new-job"], "name": { "ja": "カードケース・カトル", "en": "Card Case Quatre" }, "description": { "ja": "4 つのポケットを備えた薄型カードケース。", "en": "A slim card case with four pockets." }, "craftStory": { "ja": "一枚革を折り曲げ、縫い目を最小限に抑えています。", "en": "Folded from a single piece of leather to keep seams to a minimum." }, "image": "product-card-case-quatre.png" },
    { "slug": "watch-roll-trois", "sku": "MSN-EC-WR3", "collection": "gifts", "category": "objet", "priceJpy": 98000, "dimensionsCm": [26, 9, 9], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel", "anniversary"], "name": { "ja": "ウォッチロール・トロワ", "en": "Watch Roll Trois" }, "description": { "ja": "腕時計 3 本を守る、旅行用のウォッチロール。", "en": "A travel watch roll that protects three watches." }, "craftStory": { "ja": "内側には傷を防ぐスエードを張っています。", "en": "Lined with suede to keep watches from scratching." }, "image": "product-watch-roll-trois.png" },
    { "slug": "jewelry-coffret", "sku": "MSN-EC-JC1", "collection": "gifts", "category": "objet", "priceJpy": 142000, "dimensionsCm": [22, 16, 9], "personalizable": true, "personalizationKinds": ["monogram-color"], "personalizationLeadDays": 14, "giftOccasions": ["wedding", "anniversary"], "name": { "ja": "ジュエリー・コフレ", "en": "Jewelry Coffret" }, "description": { "ja": "リングやイヤリングを整理できる、二段式のジュエリーボックス。", "en": "A two-tier jewelry box with space for rings and earrings." }, "craftStory": { "ja": "トレイは取り外して、旅先にも持ち出せます。", "en": "The tray lifts out so you can take it travelling." }, "image": "product-jewelry-coffret.png" },
    { "slug": "passport-cover", "sku": "MSN-EC-PC1", "collection": "gifts", "category": "small-leather", "priceJpy": 64000, "dimensionsCm": [14, 10, 1], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel"], "name": { "ja": "パスポートカバー", "en": "Passport Cover" }, "description": { "ja": "パスポートと搭乗券を一緒に収められるカバー。", "en": "A cover that holds your passport and boarding pass together." }, "craftStory": { "ja": "表面は使い込むほどに艶が増すカーフレザーです。", "en": "Made of calfskin that gains a sheen with use." }, "image": "product-passport-cover.png" },
    { "slug": "luggage-tag-duo", "sku": "MSN-EC-LT2", "collection": "gifts", "category": "objet", "priceJpy": 38000, "dimensionsCm": [11, 6, 1], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel", "new-job"], "name": { "ja": "ラゲッジタグ・デュオ", "en": "Luggage Tag Duo" }, "description": { "ja": "名前を隠せるフラップ付きのラゲッジタグ 2 個セット。", "en": "A set of two luggage tags with a flap that keeps your name private." }, "craftStory": { "ja": "ベルトの穴は一つずつ手で打ち抜いています。", "en": "Each strap hole is punched by hand." }, "image": "product-luggage-tag-duo.png" }
  ],
  "stock": {
    "voyage-trunk-110": { "ginza": 1, "omotesando": 0, "osaka": 0 },
    "weekender-50": { "ginza": 2, "omotesando": 1, "osaka": 0 },
    "cabin-case-55": { "ginza": 1, "omotesando": 2, "osaka": 1 },
    "garment-carrier": { "ginza": 3, "omotesando": 0, "osaka": 2 },
    "tote-soleil": { "ginza": 4, "omotesando": 3, "osaka": 2 },
    "coffret-mini": { "ginza": 2, "omotesando": 1, "osaka": 0 },
    "carnet-wallet": { "ginza": 6, "omotesando": 5, "osaka": 4 },
    "card-case-quatre": { "ginza": 8, "omotesando": 6, "osaka": 5 },
    "watch-roll-trois": { "ginza": 3, "omotesando": 0, "osaka": 1 },
    "jewelry-coffret": { "ginza": 1, "omotesando": 2, "osaka": 0 },
    "passport-cover": { "ginza": 5, "omotesando": 4, "osaka": 3 },
    "luggage-tag-duo": { "ginza": 10, "omotesando": 8, "osaka": 6 }
  }
}
```

The demo question ("a gift under ¥400,000 for someone who travels, in stock at Ginza") matches exactly five products, most expensive first: `weekender-50`, `garment-carrier`, `watch-roll-trois`, `passport-cover`, `luggage-tag-duo`.

- [ ] **Step 2: Generate the placeholder images**

```bash
npm install --save-dev sharp@^0.34.3
```

`scripts/generate-seed-images.mjs`:

```js
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const seedDir = fileURLToPath(new URL('../server/seed/', import.meta.url));
const content = JSON.parse(readFileSync(`${seedDir}content.json`, 'utf8'));
mkdirSync(`${seedDir}images`, { recursive: true });

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const palette = { product: ['#2b2320', '#4a3a2e'], collection: ['#18202e', '#2c3a52'], boutique: ['#1d2a22', '#34493b'] };

// Latin text only: SVG rendering has no CJK fonts guaranteed.
const svg = (title, subtitle, [from, to]) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1200" height="1200" fill="url(#g)"/>
  <rect x="60" y="60" width="1080" height="1080" fill="none" stroke="#e9dcc0" stroke-opacity="0.45" stroke-width="2"/>
  <text x="600" y="520" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#e9dcc0" fill-opacity="0.7" letter-spacing="14">MAISON</text>
  <text x="600" y="620" text-anchor="middle" font-family="Georgia, serif" font-size="68" fill="#e9dcc0" letter-spacing="4">${escape(title)}</text>
  <text x="600" y="690" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#e9dcc0" fill-opacity="0.6" letter-spacing="8">${escape(subtitle)}</text>
</svg>`;

const jobs = [
  ...content.products.map((p) => [p.image, p.name.en, p.category.toUpperCase(), palette.product]),
  ...content.collections.map((c) => [c.image, c.name.en, 'COLLECTION', palette.collection]),
  ...content.boutiques.map((b) => [b.image, b.name.en, b.city.en.toUpperCase(), palette.boutique]),
];

for (const [file, title, subtitle, colors] of jobs) {
  await sharp(Buffer.from(svg(title, subtitle, colors))).png({ compressionLevel: 9 }).toFile(`${seedDir}images/${file}`);
}
console.log(`Generated ${jobs.length} images in server/seed/images`);
```

`server/seed/images/SOURCES.md`:

```markdown
# Seed image sources

Every image here is generated by `scripts/generate-seed-images.mjs` (text on a gradient). There's no third-party imagery and no real brand photography.

To use photography instead, replace a file with a licensed image of the same name, and record its source and license here.
```

Run: `node scripts/generate-seed-images.mjs`
Expected: `Generated 18 images in server/seed/images`, and 18 `.png` files exist.

- [ ] **Step 3: Implement `server/src/services/seed.ts`**

```ts
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

import content from '../../seed/content.json';
import { UID } from '../constants';

type Localized = { ja: string; en: string };
const paragraph = (text: string) => [{ type: 'paragraph', children: [{ type: 'text', text }] }];

/** At runtime this file is bundled into dist/server/index.js, so the package root is two levels up. */
const seedDir = () => path.resolve(__dirname, '..', '..', 'server', 'seed');

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const uploadImage = async (fileName: string, alternativeText: string): Promise<number> => {
    const filepath = path.join(seedDir(), 'images', fileName);
    const { size } = await stat(filepath);
    const [file] = await strapi.plugin('upload').service('upload').upload({
      data: { fileInfo: { name: fileName, alternativeText } },
      files: { filepath, originalFilename: fileName, mimetype: 'image/png', size },
    });
    return file.id;
  };

  const ensureLocales = async () => {
    const locales = strapi.plugin('i18n').service('locales');
    for (const locale of content.locales) {
      if (!(await locales.findByCode(locale.code))) await locales.create({ code: locale.code, name: locale.name });
    }
  };

  /** Creates the ja version, adds the en localization, then publishes both. */
  const createLocalized = async (uid: string, ja: Record<string, unknown>, en: Record<string, unknown>) => {
    const { documentId } = await strapi.documents(uid as any).create({ locale: 'ja', data: ja });
    await strapi.documents(uid as any).update({ documentId, locale: 'en', data: en });
    await strapi.documents(uid as any).publish({ documentId, locale: '*' });
    return documentId as string;
  };

  const pick = (value: Localized, locale: 'ja' | 'en') => value[locale];

  return {
    async loadDemoCatalog() {
      await ensureLocales();
      const existing = await strapi.documents(UID.collection).findFirst({
        locale: 'ja',
        filters: { slug: { $eq: content.collections[0].slug } },
      });
      if (existing) return { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0 };

      for (const b of content.boutiques) {
        const image = await uploadImage(b.image, b.name.en);
        const version = (locale: 'ja' | 'en') => ({
          name: pick(b.name, locale), slug: b.slug, city: pick(b.city, locale), address: pick(b.address, locale),
          openingHours: b.openingHours, image,
        });
        await createLocalized(UID.boutique, version('ja'), version('en'));
      }

      const collectionIds: Record<string, string> = {};
      for (const c of content.collections) {
        const heroImage = await uploadImage(c.image, c.name.en);
        const version = (locale: 'ja' | 'en') => ({ name: pick(c.name, locale), slug: c.slug, story: paragraph(pick(c.story, locale)), heroImage });
        collectionIds[c.slug] = await createLocalized(UID.collection, version('ja'), version('en'));
      }

      for (const p of content.products) {
        const images = [await uploadImage(p.image, p.name.en)];
        const [widthCm, heightCm, depthCm] = p.dimensionsCm;
        const version = (locale: 'ja' | 'en') => ({
          name: pick(p.name, locale), slug: p.slug, sku: p.sku, category: p.category, priceJpy: p.priceJpy, images,
          widthCm, heightCm, depthCm, personalizable: p.personalizable, personalizationKinds: p.personalizationKinds,
          personalizationLeadDays: p.personalizationLeadDays, giftOccasions: p.giftOccasions,
          description: paragraph(pick(p.description, locale)), craftStory: pick(p.craftStory, locale),
          collection: collectionIds[p.collection],
        });
        await createLocalized(UID.product, version('ja'), version('en'));
      }

      let stockLevels = 0;
      for (const [productSlug, perBoutique] of Object.entries(content.stock)) {
        for (const [boutiqueSlug, quantity] of Object.entries(perBoutique)) {
          await strapi.documents(UID.stockLevel).create({ data: { productSlug, boutiqueSlug, quantity } });
          stockLevels += 1;
        }
      }

      return {
        created: true,
        collections: content.collections.length,
        products: content.products.length,
        boutiques: content.boutiques.length,
        stockLevels,
      };
    },

    /** Deletes every appointment and notification. The catalog is untouched. */
    async resetDemoAppointments() {
      const notifications = await strapi.documents(UID.notification).findMany({ fields: ['documentId'], limit: 5000 });
      for (const n of notifications) await strapi.documents(UID.notification).delete({ documentId: n.documentId });
      const appointments = await strapi.documents(UID.appointment).findMany({ fields: ['documentId'], limit: 5000 });
      for (const a of appointments) await strapi.documents(UID.appointment).delete({ documentId: a.documentId });
      return { appointments: appointments.length, notifications: notifications.length };
    },
  };
};
```

Add `seed` to `server/src/services/index.ts`:

```ts
import errors from './errors';
import identity from './identity';
import seed from './seed';

export default {
  errors,
  identity,
  seed,
};
```

- [ ] **Step 4: Add the admin routes and controller**

`server/src/controllers/demo.ts`:

```ts
import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async seed(ctx) {
    ctx.body = await strapi.plugin('maison').service('seed').loadDemoCatalog();
  },
  async reset(ctx) {
    ctx.body = await strapi.plugin('maison').service('seed').resetDemoAppointments();
  },
});
```

`server/src/controllers/index.ts`:

```ts
import demo from './demo';

export default { demo };
```

`server/src/routes/index.ts` (admin routes mount at `/maison/...`):

```ts
import { ACTION } from '../constants';

const policies = [
  'admin::isAuthenticatedAdmin',
  { name: 'admin::hasPermissions', config: { actions: [ACTION.demoManage] } },
];

export default {
  admin: {
    type: 'admin',
    routes: [
      { method: 'POST', path: '/demo/seed', handler: 'demo.seed', config: { policies } },
      { method: 'POST', path: '/demo/reset', handler: 'demo.reset', config: { policies } },
    ],
  },
};
```

- [ ] **Step 5: Write `test/integration/seed.test.mjs`**

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi } from './harness.mjs';

describe('seed service', () => {
  let strapi;
  let seed;
  before(async () => {
    strapi = await bootStrapi('seed');
    seed = strapi.plugin('maison').service('seed');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('loads the catalog in ja and en, published', async () => {
    assert.deepEqual(await seed.loadDemoCatalog(), { created: true, collections: 3, products: 12, boutiques: 3, stockLevels: 36 });
    for (const locale of ['ja', 'en']) {
      assert.equal(await strapi.documents('plugin::maison.product').count({ locale, status: 'published' }), 12, `12 ${locale} products`);
      assert.equal(await strapi.documents('plugin::maison.boutique').count({ locale, status: 'published' }), 3, `3 ${locale} boutiques`);
    }
    const weekender = await strapi.documents('plugin::maison.product').findFirst({
      locale: 'en', status: 'published', filters: { slug: 'weekender-50' }, populate: { images: true, collection: true },
    });
    assert.equal(weekender.name, 'Weekender 50');
    assert.equal(weekender.collection?.slug, 'voyage');
    assert.equal(weekender.images?.length, 1);
  });

  it('does nothing the second time', async () => {
    assert.deepEqual(await seed.loadDemoCatalog(), { created: false, collections: 0, products: 0, boutiques: 0, stockLevels: 0 });
  });

  it('reset removes appointments and notifications and keeps the catalog', async () => {
    const boutique = await strapi.documents('plugin::maison.boutique').findFirst({ locale: 'ja', status: 'published', filters: { slug: 'ginza' } });
    await strapi.documents('plugin::maison.appointment').create({
      data: { reference: 'APT-9001', customer: SUBJECT_A, requestedFor: '2026-10-10T05:00:00.000Z', boutique: { documentId: boutique.documentId, locale: 'ja' } },
    });
    assert.deepEqual(await seed.resetDemoAppointments(), { appointments: 1, notifications: 0 });
    assert.equal(await strapi.documents('plugin::maison.product').count({ locale: 'ja', status: 'published' }), 12);
  });
});
```

- [ ] **Step 6: Build, push and run it**

```bash
npm run test:ts:back && npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi node --test test/integration/seed.test.mjs
```

Expected: 3 passing tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts server/seed server/src/services server/src/controllers server/src/routes test/integration/seed.test.mjs
git commit -m "feat: add bilingual demo seed data, images and admin seed/reset routes"
```

---

### Task 9: Catalog service and the four catalog tools

**Files:**
- Create: `server/src/domain/url.ts`, `server/src/services/catalog.ts`, `server/src/mcp/schemas.ts`
- Create: `server/src/mcp/tools/browse-collections.ts`, `search-products.ts`, `view-product.ts`, `find-boutiques.ts`
- Modify: `server/src/services/index.ts`, `server/src/mcp/index.ts`
- Test: `test/unit/url.test.ts`, `test/unit/catalog-tools.test.ts`, `test/unit/register-mcp.test.ts` (modify), `test/integration/catalog.test.mjs`

**Interfaces:**
- Consumes: `getConfig` (Task 5); `hoursForDate`, `validateOpeningHours`, `ISO_DATE` (Task 3); `blocksToPlainText`, `teaser` (Task 4); `toolError`, `toolSuccess` (Task 2); `defineTool`, `registerMcp`, `fakeStrapi`, `fakeMcp` (Task 7)
- Produces:
  - `absoluteUrl(url: string | null | undefined, baseUrl: string | undefined): string | null`
  - `catalog.browseCollections(locale)`
  - `catalog.searchProducts(locale, filters): Promise<{ total; products: ProductCard[] }>`
  - `catalog.getProduct(locale, slug)`, which returns a product object or `null`
  - `catalog.getBoutiques(locale, { productSlugs?, date? })`
  - the shared zod inputs `localeInput`, `slugInput`, `isoDateInput`, `isoDateTimeInput`, `categoryInput`, `occasionInput`

- [ ] **Step 1: Write the failing test `test/unit/url.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { absoluteUrl } from '../../server/src/domain/url';

describe('absoluteUrl', () => {
  it('prefixes relative upload paths with the public server URL', () => {
    expect(absoluteUrl('/uploads/a.png', 'https://cms.example.com/')).toBe('https://cms.example.com/uploads/a.png');
  });

  it('keeps absolute URLs', () => {
    expect(absoluteUrl('https://cdn.example.com/a.png', 'https://cms.example.com')).toBe('https://cdn.example.com/a.png');
  });

  it('leaves the path relative when no absolute server URL is configured', () => {
    expect(absoluteUrl('/uploads/a.png', undefined)).toBe('/uploads/a.png');
    expect(absoluteUrl('/uploads/a.png', '/')).toBe('/uploads/a.png');
  });

  it('returns null for missing values', () => {
    expect(absoluteUrl(undefined, 'https://cms.example.com')).toBeNull();
    expect(absoluteUrl('', 'https://cms.example.com')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement `server/src/domain/url.ts`**

Run: `npx vitest run test/unit/url.test.ts`
Expected: FAIL with "Failed to resolve import".

```ts
/** Media URLs from the local upload provider are relative; the LIFF app lives on another origin. */
export const absoluteUrl = (url: string | null | undefined, baseUrl: string | undefined): string | null => {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  if (baseUrl && /^https?:\/\//.test(baseUrl)) return `${baseUrl.replace(/\/+$/, '')}${url}`;
  return url;
};
```

Run: `npx vitest run test/unit/url.test.ts`
Expected: PASS.

- [ ] **Step 3: Implement `server/src/services/catalog.ts`**

```ts
import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { UID, type Locale } from '../constants';
import { hoursForDate, validateOpeningHours, type OpeningHoursEntry } from '../domain/hours';
import { blocksToPlainText, teaser } from '../domain/text';
import { absoluteUrl } from '../domain/url';

type Doc = Record<string, any>;
type StockEntry = { boutique: string; quantity: number };
const LIMIT = 200;

export interface ProductCard {
  slug: string;
  name: string;
  category: string;
  priceJpy: number;
  imageUrl: string | null;
  occasions: string[];
  personalizable: boolean;
  inStockAt: string[];
}

export interface SearchFilters {
  query?: string;
  collection?: string;
  category?: string;
  occasion?: string;
  minPriceJpy?: number;
  maxPriceJpy?: number;
  personalizable?: boolean;
  inStockAt?: string;
  limit?: number;
}

const arrayOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const fallbackLocale = () => getConfig(strapi).defaultLocale;
  const url = (value?: string | null) => absoluteUrl(value, strapi.config.get('server.url') as string | undefined);

  /** Published documents in `locale`, plus documents that exist only in the fallback locale. */
  const findPublished = async (uid: string, locale: Locale, params: Doc = {}): Promise<Doc[]> => {
    const primary = await strapi.documents(uid as any).findMany({ ...params, locale, status: 'published', limit: LIMIT });
    const fallback = fallbackLocale();
    if (locale === fallback) return primary;
    const seen = new Set(primary.map((doc) => doc.documentId));
    const extra = await strapi.documents(uid as any).findMany({ ...params, locale: fallback, status: 'published', limit: LIMIT });
    return [...primary, ...extra.filter((doc) => !seen.has(doc.documentId))];
  };

  /** product slug → stock per boutique slug. Stock levels have no drafts and no locales. */
  const stockByProduct = async (): Promise<Map<string, StockEntry[]>> => {
    const rows = await strapi.documents(UID.stockLevel).findMany({ limit: 5000, fields: ['productSlug', 'boutiqueSlug', 'quantity'] });
    const map = new Map<string, StockEntry[]>();
    for (const row of rows as Doc[]) {
      map.set(row.productSlug, [...(map.get(row.productSlug) ?? []), { boutique: row.boutiqueSlug, quantity: row.quantity ?? 0 }]);
    }
    return map;
  };

  /** Published boutiques by slug. Stock for a boutique that isn't published is never shown. */
  const boutiquesBySlug = async (locale: Locale) =>
    new Map((await findPublished(UID.boutique, locale)).map((b) => [b.slug as string, b]));

  const toCard = (product: Doc, stock: StockEntry[] | undefined, boutiques: Map<string, Doc>): ProductCard => ({
    slug: product.slug,
    name: product.name,
    category: product.category,
    priceJpy: product.priceJpy,
    imageUrl: url(product.images?.[0]?.url),
    occasions: arrayOf(product.giftOccasions),
    personalizable: product.personalizable === true,
    inStockAt: (stock ?? []).filter((entry) => entry.quantity > 0 && boutiques.has(entry.boutique)).map((entry) => entry.boutique),
  });

  return {
    async browseCollections(locale: Locale) {
      const collections = await findPublished(UID.collection, locale, {
        sort: 'name:asc',
        populate: { heroImage: true, products: { fields: ['documentId'] } },
      });
      return collections.map((c) => ({
        slug: c.slug as string,
        name: c.name as string,
        teaser: teaser(blocksToPlainText(c.story)),
        heroImageUrl: url(c.heroImage?.url),
        productCount: Array.isArray(c.products) ? c.products.length : 0,
      }));
    },

    async searchProducts(locale: Locale, filters: SearchFilters): Promise<{ total: number; products: ProductCard[] }> {
      const where: Doc = {};
      if (filters.category) where.category = { $eq: filters.category };
      if (filters.collection) where.collection = { slug: { $eq: filters.collection } };
      if (filters.personalizable !== undefined) where.personalizable = { $eq: filters.personalizable };
      if (filters.minPriceJpy !== undefined || filters.maxPriceJpy !== undefined) {
        where.priceJpy = {
          ...(filters.minPriceJpy !== undefined ? { $gte: filters.minPriceJpy } : {}),
          ...(filters.maxPriceJpy !== undefined ? { $lte: filters.maxPriceJpy } : {}),
        };
      }
      const [products, stock, boutiques] = await Promise.all([
        findPublished(UID.product, locale, { filters: where, populate: { images: true } }),
        stockByProduct(),
        boutiquesBySlug(locale),
      ]);
      const query = filters.query?.trim().toLowerCase();
      // JSON arrays and free text are filtered in memory: the catalog is small and this stays database-agnostic.
      let cards = products
        .filter((p) => !filters.occasion || arrayOf(p.giftOccasions).includes(filters.occasion))
        .filter((p) => !query || `${p.name} ${blocksToPlainText(p.description)} ${p.craftStory ?? ''}`.toLowerCase().includes(query))
        .map((p) => toCard(p, stock.get(p.slug), boutiques));
      if (filters.inStockAt) cards = cards.filter((card) => card.inStockAt.includes(filters.inStockAt as string));
      cards.sort((a, b) => b.priceJpy - a.priceJpy);
      return { total: cards.length, products: cards.slice(0, filters.limit ?? 8) };
    },

    async getProduct(locale: Locale, slug: string) {
      const find = (loc: Locale) =>
        strapi.documents(UID.product).findFirst({
          locale: loc,
          status: 'published',
          filters: { slug: { $eq: slug } },
          populate: { images: true, collection: { fields: ['slug', 'name'] } },
        }) as Promise<Doc | null>;
      let usedLocale = locale;
      let product = await find(locale);
      if (!product && locale !== fallbackLocale()) {
        usedLocale = fallbackLocale();
        product = await find(usedLocale);
      }
      if (!product) return null;

      const [stock, boutiques] = await Promise.all([stockByProduct(), boutiquesBySlug(usedLocale)]);
      const dims = [product.widthCm, product.heightCm, product.depthCm];
      return {
        locale: usedLocale,
        slug: product.slug as string,
        sku: product.sku as string,
        name: product.name as string,
        category: product.category as string,
        priceJpy: product.priceJpy as number,
        description: blocksToPlainText(product.description),
        craftStory: (product.craftStory as string | null) ?? '',
        dimensionsCm: dims.every((v) => v !== null && v !== undefined)
          ? { width: Number(dims[0]), height: Number(dims[1]), depth: Number(dims[2]) }
          : null,
        personalization: {
          offered: product.personalizable === true,
          kinds: arrayOf(product.personalizationKinds),
          leadDays: (product.personalizationLeadDays as number | null) ?? null,
        },
        images: ((product.images as Doc[] | null) ?? []).map((image) => ({
          url: url(image.url) ?? '',
          alt: (image.alternativeText as string | null) ?? (product.name as string),
        })),
        occasions: arrayOf(product.giftOccasions),
        collection: product.collection ? { slug: product.collection.slug as string, name: product.collection.name as string } : null,
        stock: (stock.get(product.slug) ?? [])
          .filter((entry) => boutiques.has(entry.boutique))
          .map((entry) => ({ boutique: entry.boutique, name: boutiques.get(entry.boutique)?.name as string, quantity: entry.quantity })),
      };
    },

    async getBoutiques(locale: Locale, options: { productSlugs?: string[]; date?: string }) {
      const productSlugs = options.productSlugs ?? [];
      const boutiques = await findPublished(UID.boutique, locale, { sort: 'slug:asc' });
      const stock = productSlugs.length > 0 ? await stockByProduct() : new Map<string, StockEntry[]>();
      return boutiques.map((b) => {
        const parsed = validateOpeningHours(b.openingHours);
        const hours: OpeningHoursEntry[] = parsed.ok ? parsed.hours : [];
        const hoursOnDate = options.date ? hoursForDate(hours, options.date) : null;
        return {
          slug: b.slug as string,
          name: b.name as string,
          city: (b.city as string | null) ?? '',
          address: (b.address as string | null) ?? '',
          hours,
          openOnDate: options.date ? hoursOnDate !== null : null,
          hoursOnDate: hoursOnDate ? { opens: hoursOnDate.opens, closes: hoursOnDate.closes } : null,
          stock: productSlugs.map((slug) => ({
            product: slug,
            quantity: (stock.get(slug) ?? []).find((entry) => entry.boutique === b.slug)?.quantity ?? 0,
          })),
        };
      });
    },
  };
};
```

Add `catalog` to `server/src/services/index.ts`:

```ts
import catalog from './catalog';
import errors from './errors';
import identity from './identity';
import seed from './seed';

export default {
  catalog,
  errors,
  identity,
  seed,
};
```

- [ ] **Step 4: Create the shared zod inputs `server/src/mcp/schemas.ts`**

```ts
import { z } from '@strapi/utils';

import { CATEGORIES, LOCALES, OCCASIONS } from '../constants';
import { ISO_DATE } from '../domain/hours';

const ISO_DATETIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export const localeInput = z.enum(LOCALES).optional().describe('Content language: "ja" (default) or "en".');
export const slugInput = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Use a slug like "weekender-50".');
export const isoDateInput = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD.');
export const isoDateTimeInput = z
  .string()
  .regex(ISO_DATETIME_WITH_OFFSET, 'Use ISO 8601 with a time zone, e.g. 2026-10-10T14:00:00+09:00.')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date and time.');
export const categoryInput = z.enum(CATEGORIES);
export const occasionInput = z.enum(OCCASIONS);

export const productCardOutput = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  priceJpy: z.number(),
  imageUrl: z.string().nullable(),
  occasions: z.array(z.string()),
  personalizable: z.boolean(),
  inStockAt: z.array(z.string()),
});
```

- [ ] **Step 5: Write the failing tool tests `test/unit/catalog-tools.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { browseCollectionsTool } from '../../server/src/mcp/tools/browse-collections';
import { findBoutiquesTool } from '../../server/src/mcp/tools/find-boutiques';
import { viewProductTool } from '../../server/src/mcp/tools/view-product';
import { searchProductsTool } from '../../server/src/mcp/tools/search-products';
import { fakeStrapi } from './fake-strapi';

const context = { userAbility: {} as any, user: { id: 1 } };
const run = (tool: any, catalog: Record<string, unknown>, args: Record<string, unknown>, config = {}) =>
  tool.createHandler(fakeStrapi({ services: { catalog }, config }), context)({ args, extra: {} });
const matchesOutput = (tool: any, result: any) => tool.resolveOutputSchema(context).parse(result.structuredContent);

const card = { slug: 'weekender-50', name: 'Weekender 50', category: 'travel', priceJpy: 385000, imageUrl: null, occasions: ['travel'], personalizable: true, inStockAt: ['ginza'] };

describe('browse_collections', () => {
  it('uses the configured default locale and returns schema-valid output', async () => {
    const browseCollections = vi.fn(async () => [{ slug: 'voyage', name: 'ヴォヤージュ', teaser: '旅', heroImageUrl: null, productCount: 4 }]);
    const result = await run(browseCollectionsTool, { browseCollections }, {});
    expect(browseCollections).toHaveBeenCalledWith('ja');
    expect(result.structuredContent.locale).toBe('ja');
    expect(() => matchesOutput(browseCollectionsTool, result)).not.toThrow();
  });
});

describe('search_products', () => {
  it('passes filters through and returns schema-valid output', async () => {
    const searchProducts = vi.fn(async () => ({ total: 1, products: [card] }));
    const args = { occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', locale: 'en' };
    const result = await run(searchProductsTool, { searchProducts }, args);
    expect(searchProducts).toHaveBeenCalledWith('en', args);
    expect(() => matchesOutput(searchProductsTool, result)).not.toThrow();
  });

  it('rejects a min price above the max price with invalid_input', async () => {
    const result = await run(searchProductsTool, { searchProducts: vi.fn() }, { minPriceJpy: 500000, maxPriceJpy: 100000 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error.code).toBe('invalid_input');
  });
});

describe('view_product', () => {
  it('returns not_found with a recovery hint for an unknown slug', async () => {
    const result = await run(viewProductTool, { getProduct: vi.fn(async () => null) }, { slug: 'nope' });
    const { error } = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(error.code).toBe('not_found');
    expect(error.hint).toMatch(/search_products/);
  });

  it('wraps a found product in schema-valid output', async () => {
    const product = {
      locale: 'ja', slug: 'weekender-50', sku: 'MSN-VY-050', name: 'ウィークエンダー 50', category: 'travel', priceJpy: 385000,
      description: '…', craftStory: '…', dimensionsCm: { width: 50, height: 29, depth: 22 },
      personalization: { offered: true, kinds: ['initials-hot-stamp'], leadDays: 3 },
      images: [{ url: 'https://cms.example.test/uploads/a.png', alt: 'Weekender 50' }], occasions: ['travel'],
      collection: { slug: 'voyage', name: 'ヴォヤージュ' }, stock: [{ boutique: 'ginza', name: '銀座本店', quantity: 2 }],
    };
    const result = await run(viewProductTool, { getProduct: vi.fn(async () => product) }, { slug: 'weekender-50' });
    expect(result.structuredContent).toEqual({ product });
    expect(() => matchesOutput(viewProductTool, result)).not.toThrow();
  });
});

describe('find_boutiques', () => {
  it('returns schema-valid output with openOnDate', async () => {
    const boutique = {
      slug: 'osaka', name: '大阪心斎橋店', city: '大阪', address: '…', hours: [{ weekday: 'mon', opens: '11:00', closes: '20:00' }],
      openOnDate: false, hoursOnDate: null, stock: [{ product: 'weekender-50', quantity: 0 }],
    };
    const getBoutiques = vi.fn(async () => [boutique]);
    const result = await run(findBoutiquesTool, { getBoutiques }, { date: '2026-10-06', productSlugs: ['weekender-50'] });
    expect(getBoutiques).toHaveBeenCalledWith('ja', { date: '2026-10-06', productSlugs: ['weekender-50'] });
    expect(result.structuredContent.date).toBe('2026-10-06');
    expect(() => matchesOutput(findBoutiquesTool, result)).not.toThrow();
  });
});
```

Add this case inside the `describe('registerMcp')` block of `test/unit/register-mcp.test.ts`:

```ts
  it('registers every enabled tool and skips the ones in disabledTools', () => {
    const mcp = fakeMcp(true);
    registerMcp(fakeStrapi({ mcp, config: { disabledTools: ['find_boutiques'] } }));
    const names = mcp.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(names).toEqual(['browse_collections', 'search_products', 'view_product']);
  });

  it('never claims a name Strapi generates for content types', () => {
    // Content Manager registers list_/get_/create_/update_/delete_/publish_/unpublish_/write_/discard_
    // tools for every content type in the host app (get_product for api::product.product), and a
    // duplicate name stops Strapi from booting.
    const generated = /^(list|get|create|update|delete|publish|unpublish|write|discard)_/;
    expect(TOOL_NAMES.filter((name) => generated.test(name))).toEqual([]);
  });
```

Add `import { TOOL_NAMES } from '../../server/src/constants';` to that file's imports.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run test/unit/catalog-tools.test.ts test/unit/register-mcp.test.ts`
Expected: FAIL with "Failed to resolve import ../../server/src/mcp/tools/browse-collections", and the new registerMcp case fails because no tools are registered yet.

- [ ] **Step 7: Implement the four tools**

`server/src/mcp/tools/browse-collections.ts`:

```ts
import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { localeInput } from '../schemas';

export const browseCollectionsTool = defineTool({
  name: 'browse_collections',
  title: 'Browse collections',
  description:
    "Lists the house's published collections with a short story and product count. Start here when a customer wants to browse; then call search_products with a collection slug.",
  auth: { policies: [{ action: ACTION.catalogRead }] },
  resolveInputSchema: () => z.object({ locale: localeInput }),
  resolveOutputSchema: () =>
    z.object({
      locale: z.enum(['ja', 'en']),
      collections: z.array(
        z.object({ slug: z.string(), name: z.string(), teaser: z.string(), heroImageUrl: z.string().nullable(), productCount: z.number() })
      ),
    }),
  createHandler: (strapi) => async ({ args }) => {
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const collections = await strapi.plugin('maison').service('catalog').browseCollections(locale);
    return toolSuccess({ locale, collections });
  },
});
```

`server/src/mcp/tools/search-products.ts`:

```ts
import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { categoryInput, localeInput, occasionInput, productCardOutput, slugInput } from '../schemas';

const input = z.object({
  query: z.string().max(100).optional().describe('Free text matched against product names and descriptions.'),
  collection: slugInput.optional().describe('Collection slug from browse_collections.'),
  category: categoryInput.optional(),
  occasion: occasionInput.optional().describe('Gift occasion, e.g. "travel" for someone who travels.'),
  minPriceJpy: z.number().int().min(0).optional(),
  maxPriceJpy: z.number().int().min(0).optional().describe('Budget ceiling in whole yen.'),
  personalizable: z.boolean().optional().describe('Only pieces that can be personalized (initials, stripes, colors).'),
  inStockAt: slugInput.optional().describe('Boutique slug from find_boutiques: only pieces in stock there now.'),
  locale: localeInput,
  limit: z.number().int().min(1).max(20).optional().describe('Maximum results, default 8.'),
});

export const searchProductsTool = defineTool({
  name: 'search_products',
  title: 'Search products',
  description:
    'Finds published products by collection, category, gift occasion, price range, personalization and boutique stock. Use it for every product question; never invent products, prices or availability. Results are sorted by price, highest first.',
  auth: { policies: [{ action: ACTION.catalogRead }] },
  resolveInputSchema: () => input,
  resolveOutputSchema: () => z.object({ locale: z.enum(['ja', 'en']), total: z.number(), products: z.array(productCardOutput) }),
  createHandler: (strapi) => async ({ args }) => {
    if (args.minPriceJpy !== undefined && args.maxPriceJpy !== undefined && args.minPriceJpy > args.maxPriceJpy) {
      return toolError('invalid_input', 'minPriceJpy is above maxPriceJpy.', 'Swap them, or drop one of the two limits.');
    }
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const result = await strapi.plugin('maison').service('catalog').searchProducts(locale, args);
    return toolSuccess({ locale, ...result });
  },
});
```

`server/src/mcp/tools/view-product.ts`:

```ts
import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { localeInput, slugInput } from '../schemas';

const product = z.object({
  locale: z.enum(['ja', 'en']).describe('The language actually returned; falls back to ja when no translation exists.'),
  slug: z.string(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  priceJpy: z.number(),
  description: z.string(),
  craftStory: z.string(),
  dimensionsCm: z.object({ width: z.number(), height: z.number(), depth: z.number() }).nullable(),
  personalization: z.object({ offered: z.boolean(), kinds: z.array(z.string()), leadDays: z.number().nullable() }),
  images: z.array(z.object({ url: z.string(), alt: z.string() })),
  occasions: z.array(z.string()),
  collection: z.object({ slug: z.string(), name: z.string() }).nullable(),
  stock: z.array(z.object({ boutique: z.string(), name: z.string(), quantity: z.number() })),
});

export const viewProductTool = defineTool({
  name: 'view_product',
  title: 'Get product details',
  description:
    'Full details for one published product: description, craft story, dimensions, personalization options and stock per boutique. Use the slug from search_products.',
  auth: { policies: [{ action: ACTION.catalogRead }] },
  resolveInputSchema: () => z.object({ slug: slugInput, locale: localeInput }),
  resolveOutputSchema: () => z.object({ product }),
  createHandler: (strapi) => async ({ args }) => {
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const found = await strapi.plugin('maison').service('catalog').getProduct(locale, args.slug);
    if (!found) {
      return toolError('not_found', `No published product "${args.slug}".`, 'Call search_products to find valid product slugs.');
    }
    return toolSuccess({ product: found });
  },
});
```

`server/src/mcp/tools/find-boutiques.ts`:

```ts
import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { isoDateInput, localeInput, slugInput } from '../schemas';

const input = z.object({
  productSlugs: z.array(slugInput).max(5).optional().describe('Products to report stock for.'),
  date: isoDateInput.optional().describe('A calendar day (YYYY-MM-DD) to check opening hours for.'),
  locale: localeInput,
});

export const findBoutiquesTool = defineTool({
  name: 'find_boutiques',
  title: 'Get boutiques',
  description:
    'Lists boutiques with opening hours, whether each is open on a given date, and stock for up to five products. Use it before requesting an appointment.',
  auth: { policies: [{ action: ACTION.catalogRead }] },
  resolveInputSchema: () => input,
  resolveOutputSchema: () =>
    z.object({
      date: z.string().nullable(),
      boutiques: z.array(
        z.object({
          slug: z.string(),
          name: z.string(),
          city: z.string(),
          address: z.string(),
          hours: z.array(z.object({ weekday: z.string(), opens: z.string(), closes: z.string() })),
          openOnDate: z.boolean().nullable(),
          hoursOnDate: z.object({ opens: z.string(), closes: z.string() }).nullable(),
          stock: z.array(z.object({ product: z.string(), quantity: z.number() })),
        })
      ),
    }),
  createHandler: (strapi) => async ({ args }) => {
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const boutiques = await strapi
      .plugin('maison')
      .service('catalog')
      .getBoutiques(locale, { date: args.date, productSlugs: args.productSlugs });
    return toolSuccess({ date: args.date ?? null, boutiques });
  },
});
```

Register them. `server/src/mcp/index.ts` becomes:

```ts
import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import type { ToolName } from '../constants';
import { browseCollectionsTool } from './tools/browse-collections';
import { findBoutiquesTool } from './tools/find-boutiques';
import { viewProductTool } from './tools/view-product';
import { searchProductsTool } from './tools/search-products';

/** Must run in register(): Strapi locks the MCP capability set when the server starts. */
export const registerMcp = (strapi: Core.Strapi) => {
  if (!strapi.ai?.mcp?.isEnabled()) {
    strapi.log.warn('[maison] server.mcp.enabled is not true, so the Maison MCP tools are not registered.');
    return;
  }
  const { mcp } = strapi.ai;
  const disabled = new Set<string>(getConfig(strapi).disabledTools);
  const enabled = (name: ToolName) => !disabled.has(name);

  if (enabled('browse_collections')) mcp.registerTool(browseCollectionsTool);
  if (enabled('search_products')) mcp.registerTool(searchProductsTool);
  if (enabled('view_product')) mcp.registerTool(viewProductTool);
  if (enabled('find_boutiques')) mcp.registerTool(findBoutiquesTool);
};
```

- [ ] **Step 8: Run the unit tests to verify they pass**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 9: Write `test/integration/catalog.test.mjs`**

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { bootStrapi } from './harness.mjs';

describe('catalog service on seeded data', () => {
  let strapi;
  let catalog;
  before(async () => {
    strapi = await bootStrapi('catalog');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    catalog = strapi.plugin('maison').service('catalog');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('lists the three collections with their product counts', async () => {
    const collections = await catalog.browseCollections('ja');
    assert.deepEqual(collections.map((c) => c.slug).sort(), ['atelier', 'gifts', 'voyage']);
    assert.equal(collections.reduce((sum, c) => sum + c.productCount, 0), 12);
  });

  it('answers the demo question: travel gifts under ¥400,000 in stock at Ginza', async () => {
    const result = await catalog.searchProducts('en', { occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', limit: 10 });
    assert.deepEqual(result.products.map((p) => p.slug), ['weekender-50', 'garment-carrier', 'watch-roll-trois', 'passport-cover', 'luggage-tag-duo']);
    assert.equal(result.products[0].name, 'Weekender 50');
  });

  it('returns product details with stock per boutique', async () => {
    const product = await catalog.getProduct('en', 'weekender-50');
    assert.equal(product.locale, 'en');
    assert.deepEqual(product.stock.find((s) => s.boutique === 'ginza'), { boutique: 'ginza', name: 'Ginza Flagship', quantity: 2 });
  });

  it('falls back to ja for a product without an en version', async () => {
    await strapi.documents('plugin::maison.product').create({
      locale: 'ja', status: 'published', data: { name: '限定品', slug: 'ja-only', sku: 'MSN-JA-1', category: 'objet', priceJpy: 10000 },
    });
    const product = await catalog.getProduct('en', 'ja-only');
    assert.equal(product.locale, 'ja');
    assert.equal(product.name, '限定品');
  });

  it('never returns a product that was never published', async () => {
    await strapi.documents('plugin::maison.product').create({
      locale: 'ja', data: { name: '下書き', slug: 'draft-only', sku: 'MSN-DR-1', category: 'objet', priceJpy: 1 },
    });
    const { products } = await catalog.searchProducts('ja', { limit: 20 });
    assert.ok(!products.some((p) => p.slug === 'draft-only'));
    assert.equal(await catalog.getProduct('ja', 'draft-only'), null);
  });

  it('reports Osaka closed on Tuesday 6 October and stock per boutique', async () => {
    const boutiques = await catalog.getBoutiques('ja', { date: '2026-10-06', productSlugs: ['weekender-50'] });
    const osaka = boutiques.find((b) => b.slug === 'osaka');
    const ginza = boutiques.find((b) => b.slug === 'ginza');
    assert.equal(osaka.openOnDate, false);
    assert.equal(ginza.openOnDate, true);
    assert.deepEqual(ginza.stock, [{ product: 'weekender-50', quantity: 2 }]);
  });
});
```

- [ ] **Step 10: Build, push and run it**

```bash
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi node --test test/integration/catalog.test.mjs
```

Expected: 6 passing tests.

- [ ] **Step 11: Commit**

```bash
git add server/src test/unit test/integration/catalog.test.mjs
git commit -m "feat: add catalog service and the four catalog MCP tools"
```

---

### Task 10: Appointments service and the two customer tools

**Files:**
- Modify: `server/src/domain/time.ts`, `test/unit/time.test.ts`, `server/src/mcp/schemas.ts`, `server/src/services/index.ts`, `server/src/mcp/index.ts`, `test/unit/register-mcp.test.ts`
- Create: `server/src/domain/service-result.ts`, `server/src/services/appointments.ts`, `server/src/mcp/common.ts`, `server/src/mcp/tools/request-appointment.ts`, `server/src/mcp/tools/my-appointments.ts`
- Test: `test/unit/appointment-tools.test.ts`, `test/integration/appointments.test.mjs`

**Interfaces:**
- Consumes:
  - `checkOpenAt`, `validateOpeningHours` (Task 3)
  - `generateReference` (Task 4)
  - `getConfig` (Task 5)
  - `SURFACE_HEADER`, `UID`, `ACTION` (Task 1)
  - service `identity.getCustomerSubject(extra)`, `defineTool`, `registerMcp`, `fakeStrapi`, `extraWith`, `fakeMcp` (Task 7)
  - `slugInput`, `isoDateTimeInput`, `localeInput` (Task 9)
- Produces:
  - `toZonedIso(date: Date, timeZone: string): string`, e.g. `2026-10-10T14:00:00+09:00`
  - `ServiceResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string; hint: string }`, plus `failure(code, message, hint)`
  - `interface AppointmentView { reference; status: 'requested' | 'confirmed'; boutique: { slug; name }; requestedFor; products: { slug; name }[]; note; confirmationSent }`
  - service `appointments.request(input: AppointmentRequest): Promise<ServiceResult<AppointmentView>>`, where `AppointmentRequest = { subject; boutique; productSlugs; requestedFor; note?; createdVia: 'concierge' | 'app'; now?: Date }`
  - service `appointments.listForCustomer(subject: string, locale: Locale): Promise<AppointmentView[]>`
  - `appointmentOutput` zod schema, `notSignedIn()` tool error

Times leave the plugin as ISO 8601 in the boutique's time zone (`2026-10-10T14:00:00+09:00`), never as UTC. That way neither the concierge model nor the app has to convert them.

Both tools return the same `appointmentOutput`, which carries `note` and `confirmationSent`. That's a superset of the fields each tool's row in the spec lists, so the app renders one appointment shape.

- [ ] **Step 1: Write the failing time test**

Append to `test/unit/time.test.ts`:

```ts
import { toZonedIso } from '../../server/src/domain/time';

describe('toZonedIso', () => {
  it('writes Tokyo wall-clock time with its offset', () => {
    expect(toZonedIso(new Date('2026-10-10T05:00:00Z'), 'Asia/Tokyo')).toBe('2026-10-10T14:00:00+09:00');
  });

  it('crosses midnight into the next Tokyo day', () => {
    expect(toZonedIso(new Date('2026-10-05T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-10-06T08:30:00+09:00');
  });

  it('handles negative offsets and daylight saving time', () => {
    expect(toZonedIso(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toBe('2026-07-01T08:00:00-04:00');
  });

  it('drops milliseconds and writes +00:00 for UTC', () => {
    expect(toZonedIso(new Date('2026-10-10T05:00:00.789Z'), 'UTC')).toBe('2026-10-10T05:00:00+00:00');
  });
});
```

Move the new `import` line up next to the existing `formatJaDateTime` import.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/time.test.ts`
Expected: FAIL with "toZonedIso is not a function" (or a missing export).

- [ ] **Step 3: Implement `toZonedIso` in `server/src/domain/time.ts`**

Append:

```ts
const pad = (value: number) => String(value).padStart(2, '0');

/** e.g. "2026-10-10T14:00:00+09:00": wall-clock time in `timeZone`, with that zone's UTC offset at that instant. */
export function toZonedIso(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const [year, month, day, hour, minute, second] = [get('year'), get('month'), get('day'), get('hour'), get('minute'), get('second')];
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
```

Run: `npx vitest run test/unit/time.test.ts`
Expected: PASS.

- [ ] **Step 4: Add the shared service result `server/src/domain/service-result.ts`**

```ts
import type { ErrorCode } from './tool-result';

export type ServiceFailure = { ok: false; code: ErrorCode; message: string; hint: string };
export type ServiceResult<T> = { ok: true; value: T } | ServiceFailure;

/** Services return expected failures as values; tools turn them into toolError results. */
export const failure = (code: ErrorCode, message: string, hint: string): ServiceFailure => ({ ok: false, code, message, hint });
```

- [ ] **Step 5: Implement `server/src/services/appointments.ts`**

```ts
import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { UID, type Locale } from '../constants';
import { checkOpenAt, validateOpeningHours, type Weekday } from '../domain/hours';
import { generateReference } from '../domain/reference';
import { failure, type ServiceResult } from '../domain/service-result';
import { toZonedIso } from '../domain/time';

type Doc = Record<string, any>;

export interface AppointmentView {
  reference: string;
  status: 'requested' | 'confirmed';
  boutique: { slug: string; name: string };
  requestedFor: string;
  products: Array<{ slug: string; name: string }>;
  note: string;
  confirmationSent: boolean;
}

export interface AppointmentRequest {
  subject: string;
  boutique: string;
  productSlugs: string[];
  requestedFor: string;
  note?: string;
  createdVia: 'concierge' | 'app';
  /** Only for tests. Defaults to the current time. */
  now?: Date;
}

const MIN_LEAD_MINUTES = 30;
const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const POPULATE = { boutique: { fields: ['slug', 'name'] }, products: { fields: ['slug', 'name'] } };

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const publishedBySlug = (uid: string, slug: string, locale: Locale) =>
    strapi.documents(uid as any).findFirst({ locale, status: 'published', filters: { slug: { $eq: slug } } }) as Promise<Doc | null>;

  /** The appointment documents among `documentIds` that have a published version, i.e. that staff confirmed. */
  const confirmedIds = async (documentIds: string[]): Promise<Set<string>> => {
    if (documentIds.length === 0) return new Set();
    const rows = await strapi.documents(UID.appointment).findMany({
      status: 'published',
      filters: { documentId: { $in: documentIds } },
      fields: ['documentId'],
      limit: documentIds.length,
    });
    return new Set(rows.map((row) => row.documentId as string));
  };

  /** The appointment references among `references` that have a `sent` notification. */
  const sentReferences = async (references: string[]): Promise<Set<string>> => {
    if (references.length === 0) return new Set();
    const rows = await strapi.documents(UID.notification).findMany({
      filters: { outcome: { $eq: 'sent' }, appointmentReference: { $in: references } },
      fields: ['appointmentReference'],
      limit: 1000,
    });
    return new Set((rows as Doc[]).map((row) => row.appointmentReference as string));
  };

  /** slug and name per documentId in `locale`, falling back to the default locale. Published versions only. */
  const labels = async (uid: string, documentIds: string[], locale: Locale) => {
    const map = new Map<string, { slug: string; name: string }>();
    const ids = [...new Set(documentIds)];
    if (ids.length === 0) return map;
    const fallback = getConfig(strapi).defaultLocale;
    for (const loc of locale === fallback ? [locale] : [locale, fallback]) {
      const rows = await strapi.documents(uid as any).findMany({
        locale: loc,
        status: 'published',
        filters: { documentId: { $in: ids } },
        fields: ['slug', 'name'],
        limit: ids.length,
      });
      for (const row of rows as Doc[]) {
        if (!map.has(row.documentId)) map.set(row.documentId, { slug: row.slug, name: row.name });
      }
    }
    return map;
  };

  /** Draft appointment documents (populated with POPULATE) → what customers see. */
  const toViews = async (docs: Doc[], locale: Locale): Promise<AppointmentView[]> => {
    const ids = docs.map((doc) => doc.documentId as string);
    const [confirmed, sent, boutiques, products] = await Promise.all([
      confirmedIds(ids),
      sentReferences(docs.map((doc) => doc.reference as string)),
      labels(UID.boutique, docs.map((doc) => doc.boutique?.documentId).filter(Boolean), locale),
      labels(UID.product, docs.flatMap((doc) => (doc.products ?? []).map((product: Doc) => product.documentId)), locale),
    ]);
    const { timezone } = getConfig(strapi);
    return docs.map((doc) => ({
      reference: doc.reference,
      status: confirmed.has(doc.documentId) ? 'confirmed' : 'requested',
      boutique: boutiques.get(doc.boutique?.documentId) ?? { slug: doc.boutique?.slug ?? '', name: doc.boutique?.name ?? '' },
      requestedFor: toZonedIso(new Date(doc.requestedFor), timezone),
      products: (doc.products ?? []).map((product: Doc) => products.get(product.documentId) ?? { slug: product.slug, name: product.name }),
      note: doc.customerNote ?? '',
      confirmationSent: sent.has(doc.reference),
    }));
  };

  /** Future requests of this customer that staff haven't confirmed yet. */
  const openRequestCount = async (subject: string, now: Date) => {
    const drafts = await strapi.documents(UID.appointment).findMany({
      status: 'draft',
      filters: { customer: { $eq: subject }, requestedFor: { $gt: now.toISOString() } },
      fields: ['documentId'],
      limit: 100,
    });
    const confirmed = await confirmedIds(drafts.map((doc) => doc.documentId as string));
    return drafts.filter((doc) => !confirmed.has(doc.documentId as string)).length;
  };

  const uniqueReference = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reference = generateReference();
      const taken = await strapi.documents(UID.appointment).count({ filters: { reference: { $eq: reference } } });
      if (taken === 0) return reference;
    }
    throw new Error('[maison] Could not find a free appointment reference after 20 attempts.');
  };

  return {
    /** Checks, in the spec's order, then creates a draft. Nothing here can publish. */
    async request(input: AppointmentRequest): Promise<ServiceResult<AppointmentView>> {
      const { defaultLocale, timezone, maxOpenRequestsPerCustomer } = getConfig(strapi);
      const now = input.now ?? new Date();

      const boutique = await publishedBySlug(UID.boutique, input.boutique, defaultLocale);
      if (!boutique) {
        return failure('not_found', `No boutique "${input.boutique}".`, 'Call find_boutiques to find valid boutique slugs.');
      }
      const products: Doc[] = [];
      for (const slug of [...new Set(input.productSlugs)]) {
        const product = await publishedBySlug(UID.product, slug, defaultLocale);
        if (!product) {
          return failure('not_found', `No published product "${slug}".`, 'Call search_products to find valid product slugs.');
        }
        products.push(product);
      }

      const when = new Date(input.requestedFor);
      if (when.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60_000) {
        return failure(
          'in_the_past',
          `The visit must start at least ${MIN_LEAD_MINUTES} minutes from now.`,
          `Ask the customer for a later time. It is now ${toZonedIso(now, timezone)}.`
        );
      }

      const hours = validateOpeningHours(boutique.openingHours);
      const check = checkOpenAt(hours.ok ? hours.hours : [], when, timezone);
      if (!check.open) {
        const day = `${DAY_NAMES[check.weekday]} ${check.isoDate}`;
        const hint = check.entry
          ? `${boutique.name} is open ${check.entry.opens}–${check.entry.closes} (${timezone}) on ${day}. Suggest a time in that window, or another day; find_boutiques shows hours for a date.`
          : `${boutique.name} is closed all day on ${day}. Suggest another day; find_boutiques shows hours for a date.`;
        return failure('boutique_closed', `${boutique.name} is not open at ${toZonedIso(when, timezone)}.`, hint);
      }

      if ((await openRequestCount(input.subject, now)) >= maxOpenRequestsPerCustomer) {
        return failure(
          'too_many_open_requests',
          `This customer already has ${maxOpenRequestsPerCustomer} requests waiting for a boutique to confirm.`,
          'Call my_appointments to show them. A new request is possible once one is confirmed or its time has passed.'
        );
      }

      const created = await strapi.documents(UID.appointment).create({
        data: {
          reference: await uniqueReference(),
          customer: input.subject,
          boutique: { documentId: boutique.documentId, locale: defaultLocale },
          products: products.map((product) => ({ documentId: product.documentId, locale: defaultLocale })),
          requestedFor: when.toISOString(),
          customerNote: input.note ?? '',
          createdVia: input.createdVia,
        },
      });
      const saved = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'draft', populate: POPULATE });
      const [view] = await toViews([saved as Doc], defaultLocale);
      return { ok: true, value: view };
    },

    /** The customer's own appointments, newest first. */
    async listForCustomer(subject: string, locale: Locale): Promise<AppointmentView[]> {
      const docs = await strapi.documents(UID.appointment).findMany({
        status: 'draft',
        filters: { customer: { $eq: subject } },
        sort: 'createdAt:desc',
        populate: POPULATE,
        limit: 50,
      });
      return toViews(docs as Doc[], locale);
    },
  };
};
```

Every appointment has a draft version, including published ones, so reading drafts lists everything the customer asked for. A published version marks it confirmed.

Add `appointments` to `server/src/services/index.ts`:

```ts
import appointments from './appointments';
import catalog from './catalog';
import errors from './errors';
import identity from './identity';
import seed from './seed';

export default {
  appointments,
  catalog,
  errors,
  identity,
  seed,
};
```

- [ ] **Step 6: Add the shared output schema and the not-signed-in error**

Append to `server/src/mcp/schemas.ts`:

```ts
export const appointmentOutput = z.object({
  reference: z.string(),
  status: z.enum(['requested', 'confirmed']).describe('"requested" until the boutique confirms. Never call a requested visit confirmed.'),
  boutique: z.object({ slug: z.string(), name: z.string() }),
  requestedFor: z.string().describe('Visit start in the boutique\'s time zone, ISO 8601 with offset.'),
  products: z.array(z.object({ slug: z.string(), name: z.string() })),
  note: z.string(),
  confirmationSent: z.boolean().describe('Whether the LINE confirmation has been delivered.'),
});
```

`server/src/mcp/common.ts`:

```ts
import { toolError } from '../domain/tool-result';

export const notSignedIn = () =>
  toolError(
    'not_signed_in',
    'No signed-in LINE customer is attached to this session.',
    'Customer tools need a session from LINE sign-in. Ask the customer to open the app in LINE, or sign in again. Staff and admin tokens cannot act for a customer.'
  );
```

- [ ] **Step 7: Write the failing tool tests `test/unit/appointment-tools.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { myAppointmentsTool } from '../../server/src/mcp/tools/my-appointments';
import { requestAppointmentTool } from '../../server/src/mcp/tools/request-appointment';
import { extraWith, fakeStrapi } from './fake-strapi';

const SUBJECT = `line:U${'a'.repeat(32)}`;
const context = { userAbility: {} as any, user: { id: 1 } };
const view = {
  reference: 'APT-4821', status: 'requested', boutique: { slug: 'ginza', name: '銀座本店' },
  requestedFor: '2026-10-10T14:00:00+09:00', products: [{ slug: 'weekender-50', name: 'ウィークエンダー 50' }],
  note: '', confirmationSent: false,
};
const args = { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: '2026-10-10T14:00:00+09:00' };
const errorOf = (result: any) => JSON.parse(result.content[0].text).error;

const setup = (subject: string | null, appointments: Record<string, unknown>) => {
  const identity = { getCustomerSubject: vi.fn(async () => subject) };
  return { strapi: fakeStrapi({ services: { identity, appointments } }), identity };
};

describe('request_appointment', () => {
  it('returns not_signed_in and never calls the service when there is no customer', async () => {
    const request = vi.fn();
    const { strapi } = setup(null, { request });
    const result = await requestAppointmentTool.createHandler(strapi, context)({ args, extra: extraWith({ authorization: 'Bearer admin-token' }) });
    expect(result.isError).toBe(true);
    expect(errorOf(result).code).toBe('not_signed_in');
    expect(request).not.toHaveBeenCalled();
  });

  it('passes the verified subject, and marks calls from the concierge', async () => {
    const request = vi.fn(async () => ({ ok: true, value: view }));
    const { strapi, identity } = setup(SUBJECT, { request });
    const extra = extraWith({ authorization: 'Bearer mcp_at_x', 'x-maison-surface': 'concierge' });
    const result = await requestAppointmentTool.createHandler(strapi, context)({ args, extra });
    expect(identity.getCustomerSubject).toHaveBeenCalledWith(extra);
    expect(request).toHaveBeenCalledWith({ subject: SUBJECT, ...args, note: undefined, createdVia: 'concierge' });
    expect(requestAppointmentTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({ appointment: view });
  });

  it('marks every other call as app', async () => {
    const request = vi.fn(async () => ({ ok: true, value: view }));
    const { strapi } = setup(SUBJECT, { request });
    await requestAppointmentTool.createHandler(strapi, context)({ args, extra: extraWith({ authorization: 'Bearer t', 'x-maison-surface': 'something' }) });
    expect(request.mock.calls[0][0].createdVia).toBe('app');
  });

  it('turns a service failure into a tool error with the same code and hint', async () => {
    const request = vi.fn(async () => ({ ok: false, code: 'boutique_closed', message: 'Closed.', hint: 'Closed all day on Tuesday.' }));
    const { strapi } = setup(SUBJECT, { request });
    const result = await requestAppointmentTool.createHandler(strapi, context)({ args, extra: extraWith({ authorization: 'Bearer t' }) });
    expect(result.isError).toBe(true);
    expect(errorOf(result)).toEqual({ code: 'boutique_closed', message: 'Closed.', hint: 'Closed all day on Tuesday.' });
  });

  it('rejects times without an offset, empty product lists and long notes', () => {
    const input = requestAppointmentTool.resolveInputSchema!(context);
    expect(input.safeParse(args).success).toBe(true);
    expect(input.safeParse({ ...args, requestedFor: '2026-10-10T14:00:00' }).success).toBe(false);
    expect(input.safeParse({ ...args, productSlugs: [] }).success).toBe(false);
    expect(input.safeParse({ ...args, productSlugs: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
    expect(input.safeParse({ ...args, note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('my_appointments', () => {
  it('returns not_signed_in without a customer', async () => {
    const { strapi } = setup(null, { listForCustomer: vi.fn() });
    const result = await myAppointmentsTool.createHandler(strapi, context)({ args: {}, extra: extraWith({}) });
    expect(errorOf(result).code).toBe('not_signed_in');
  });

  it("lists the caller's appointments in the requested locale", async () => {
    const listForCustomer = vi.fn(async () => [view]);
    const { strapi } = setup(SUBJECT, { listForCustomer });
    const result = await myAppointmentsTool.createHandler(strapi, context)({ args: { locale: 'en' }, extra: extraWith({ authorization: 'Bearer t' }) });
    expect(listForCustomer).toHaveBeenCalledWith(SUBJECT, 'en');
    expect(myAppointmentsTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({ appointments: [view] });
  });
});
```

Also update the registration case in `test/unit/register-mcp.test.ts` so it expects the two new tools:

```ts
    expect(names).toEqual(['browse_collections', 'search_products', 'view_product', 'request_appointment', 'my_appointments']);
```

- [ ] **Step 8: Run them to verify they fail**

Run: `npx vitest run test/unit/appointment-tools.test.ts test/unit/register-mcp.test.ts`
Expected: FAIL with "Failed to resolve import ../../server/src/mcp/tools/my-appointments", and the registration case fails.

- [ ] **Step 9: Implement the two tools**

`server/src/mcp/tools/request-appointment.ts`:

```ts
import { z } from '@strapi/utils';

import { ACTION, SURFACE_HEADER } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { notSignedIn } from '../common';
import { defineTool } from '../define';
import { appointmentOutput, isoDateTimeInput, slugInput } from '../schemas';

const input = z.object({
  boutique: slugInput.describe('Boutique slug from find_boutiques, e.g. "ginza".'),
  productSlugs: z.array(slugInput).min(1).max(5).describe('One to five product slugs the customer wants to see.'),
  requestedFor: isoDateTimeInput.describe('Visit start, ISO 8601 with a time zone offset, e.g. 2026-10-10T14:00:00+09:00.'),
  note: z.string().max(500).optional().describe("The customer's own words for the boutique, e.g. who the gift is for."),
});

export const requestAppointmentTool = defineTool({
  name: 'request_appointment',
  title: 'Request a boutique appointment',
  description:
    'Requests a boutique visit for the signed-in customer. It creates a request that a boutique must confirm; never tell the customer it is confirmed. Check opening hours with find_boutiques first. The customer comes from their LINE sign-in, never from an argument.',
  auth: { policies: [{ action: ACTION.appointmentsRequest }] },
  resolveInputSchema: () => input,
  resolveOutputSchema: () => z.object({ appointment: appointmentOutput }),
  createHandler: (strapi) => async ({ args, extra }) => {
    const subject = await strapi.plugin('maison').service('identity').getCustomerSubject(extra);
    if (!subject) return notSignedIn();
    const surface = extra.requestInfo?.headers?.[SURFACE_HEADER];
    const result = await strapi.plugin('maison').service('appointments').request({
      subject,
      boutique: args.boutique,
      productSlugs: args.productSlugs,
      requestedFor: args.requestedFor,
      note: args.note,
      createdVia: surface === 'concierge' ? 'concierge' : 'app',
    });
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess({ appointment: result.value });
  },
});
```

`server/src/mcp/tools/my-appointments.ts`:

```ts
import { z } from '@strapi/utils';

import { getConfig } from '../../config';
import { ACTION } from '../../constants';
import { toolSuccess } from '../../domain/tool-result';
import { notSignedIn } from '../common';
import { defineTool } from '../define';
import { appointmentOutput, localeInput } from '../schemas';

export const myAppointmentsTool = defineTool({
  name: 'my_appointments',
  title: 'My appointments',
  description:
    "Lists the signed-in customer's own boutique appointments, newest first: requested (waiting for the boutique) or confirmed, and whether the LINE confirmation was sent. It never shows other customers.",
  auth: { policies: [{ action: ACTION.appointmentsRequest }] },
  resolveInputSchema: () => z.object({ locale: localeInput }),
  resolveOutputSchema: () => z.object({ appointments: z.array(appointmentOutput) }),
  createHandler: (strapi) => async ({ args, extra }) => {
    const subject = await strapi.plugin('maison').service('identity').getCustomerSubject(extra);
    if (!subject) return notSignedIn();
    const locale = args.locale ?? getConfig(strapi).defaultLocale;
    const appointments = await strapi.plugin('maison').service('appointments').listForCustomer(subject, locale);
    return toolSuccess({ appointments });
  },
});
```

In `server/src/mcp/index.ts`, add the imports and two registration lines after `view_product`:

```ts
import { myAppointmentsTool } from './tools/my-appointments';
import { requestAppointmentTool } from './tools/request-appointment';
```

```ts
  if (enabled('request_appointment')) mcp.registerTool(requestAppointmentTool);
  if (enabled('my_appointments')) mcp.registerTool(myAppointmentsTool);
```

The registration order becomes `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `request_appointment`, `my_appointments`.

- [ ] **Step 10: Run the unit tests and type checks**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 11: Write `test/integration/appointments.test.mjs`**

`NOW` is fixed so the test keeps passing after the demo dates go by.

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, SUBJECT_B, bootStrapi } from './harness.mjs';

const NOW = new Date('2026-10-01T00:00:00Z'); // 09:00 on Thursday 1 October in Tokyo
const SATURDAY_2PM = '2026-10-10T14:00:00+09:00';
const UID = 'plugin::maison.appointment';

describe('appointments service', () => {
  let strapi;
  let appointments;
  const request = (overrides = {}) =>
    appointments.request({
      subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: SATURDAY_2PM,
      createdVia: 'app', now: NOW, ...overrides,
    });

  before(async () => {
    strapi = await bootStrapi('appointments');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    appointments = strapi.plugin('maison').service('appointments');
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('creates a draft owned by the subject and reads it back', async () => {
    const result = await request({ note: 'A gift for a friend who travels', createdVia: 'concierge' });
    assert.equal(result.ok, true);
    const view = result.value;
    assert.match(view.reference, /^APT-\d{4}$/);
    assert.equal(view.status, 'requested');
    assert.equal(view.requestedFor, SATURDAY_2PM);
    assert.deepEqual(view.boutique, { slug: 'ginza', name: '銀座本店' });
    assert.deepEqual(view.products.map((p) => p.slug), ['weekender-50']);
    assert.equal(view.note, 'A gift for a friend who travels');

    const stored = await strapi.documents(UID).findFirst({ status: 'draft', filters: { reference: view.reference } });
    assert.equal(stored.customer, SUBJECT_A);
    assert.equal(stored.createdVia, 'concierge');
    assert.equal(await strapi.documents(UID).count({ status: 'published', filters: { reference: view.reference } }), 0, 'never published');
  });

  it('rejects unknown slugs and times that are too soon or outside opening hours', async () => {
    assert.equal((await request({ boutique: 'kyoto' })).code, 'not_found');
    assert.equal((await request({ productSlugs: ['weekender-50', 'no-such-piece'] })).code, 'not_found');
    assert.equal((await request({ requestedFor: '2026-10-01T09:10:00+09:00' })).code, 'in_the_past');

    const tuesday = await request({ boutique: 'osaka', requestedFor: '2026-10-06T14:00:00+09:00' });
    assert.equal(tuesday.code, 'boutique_closed');
    assert.match(tuesday.hint, /closed all day on Tuesday 2026-10-06/);

    const utcMondayNight = await request({ boutique: 'osaka', requestedFor: '2026-10-05T23:30:00Z' });
    assert.equal(utcMondayNight.code, 'boutique_closed', 'judged as Tuesday 08:30 in Tokyo');

    const atClosing = await request({ requestedFor: '2026-10-10T20:00:00+09:00' });
    assert.equal(atClosing.code, 'boutique_closed');
    assert.match(atClosing.hint, /11:00–20:00/);
    assert.equal((await request({ requestedFor: '2026-10-10T19:59:00+09:00' })).ok, true);
  });

  it('limits open requests per customer, counting only unconfirmed future ones', async () => {
    const references = [];
    for (const day of [12, 13, 14]) {
      const result = await request({ subject: SUBJECT_B, requestedFor: `2026-10-${day}T15:00:00+09:00` });
      assert.equal(result.ok, true);
      references.push(result.value.reference);
    }
    const blocked = await request({ subject: SUBJECT_B, requestedFor: '2026-10-15T15:00:00+09:00' });
    assert.equal(blocked.code, 'too_many_open_requests');

    const first = await strapi.documents(UID).findFirst({ status: 'draft', filters: { reference: references[0] } });
    await strapi.documents(UID).publish({ documentId: first.documentId });
    assert.equal((await request({ subject: SUBJECT_B, requestedFor: '2026-10-15T15:00:00+09:00' })).ok, true);
  });

  it("lists only the caller's appointments, newest first, with confirmation state", async () => {
    const mine = await appointments.listForCustomer(SUBJECT_B, 'en');
    assert.equal(mine.length, 4);
    assert.ok(mine.every((a) => a.boutique.name === 'Ginza Flagship'), 'names follow the requested locale');
    assert.equal(mine[0].requestedFor, '2026-10-15T15:00:00+09:00', 'newest first');
    const confirmed = mine.filter((a) => a.status === 'confirmed');
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].confirmationSent, false);

    const theirs = await appointments.listForCustomer(SUBJECT_A, 'ja');
    assert.ok(theirs.length > 0);
    assert.ok(theirs.every((a) => !mine.some((m) => m.reference === a.reference)), 'no overlap between customers');
  });
});
```

- [ ] **Step 12: Build, push and run it**

```bash
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi node --test test/integration/appointments.test.mjs
```

Expected: 4 passing tests.

- [ ] **Step 13: Commit**

```bash
git add server/src test/unit test/integration/appointments.test.mjs
git commit -m "feat: add appointment requests and my_appointments for signed-in customers"
```

---

### Task 11: Confirmations service, the two ops tools and the prompt

**Files:**
- Create: `server/src/services/confirmations.ts`, `server/src/mcp/tools/pending-confirmations.ts`, `server/src/mcp/tools/record-confirmation.ts`, `server/src/mcp/prompts/send-pending-confirmations.ts`, `test/fixtures/line-flex-message-schema.mjs` (vendored)
- Modify: `server/src/services/index.ts`, `server/src/mcp/index.ts`, `server/src/bootstrap.ts`, `test/unit/register-mcp.test.ts`
- Test: `test/unit/confirmation-tools.test.ts`, `test/unit/line-contract.test.ts`, `test/integration/confirmations.test.mjs`

**Interfaces:**
- Consumes:
  - `buildConfirmationMessage`, `FlexMessage` (Task 4)
  - `parseSubject`, `lineUserIdOf` (Task 2)
  - `formatJaDateTime` (Task 3), `toZonedIso` (Task 10)
  - `failure`, `ServiceResult` (Task 10)
  - `getConfig` (Task 5), `definePrompt`, `defineTool`, `registerMcp` (Task 7)
- Produces:
  - service `confirmations.listPending(limit: number): Promise<ServiceResult<PendingConfirmation[]>>`
  - service `confirmations.record({ reference, status: 'sent' | 'failed', detail }): Promise<ServiceResult<{ notification: { reference; status; sentAt; detail }; alreadyRecorded: boolean }>>`
  - tools `pending_confirmations`, `record_confirmation`, and the prompt `send_pending_confirmations`, all gated on `plugin::maison.confirmations.send`

Strapi 5.55.1 prompts accept `auth.policies` (`McpAuthAccess` in `@strapi/types`), so the prompt is visible only to tokens that hold `confirmations.send`. That settles the spec's open question.

LINE Bot MCP 0.5.0 (`@line/line-bot-mcp-server`) matters for these tools in three ways:
- **`push_flex_message` takes `{ userId, message: { altText, contents } }`** and validates `message` against a strict zod schema. Text must be 1–2000 characters, colors `#RRGGBB`, and button labels at most 20 characters.
- **`get_profile` takes `{ userId }`** and returns `isError` when LINE refuses, for example for someone who isn't a friend of the account.
- **Both default `userId` to the server's `DESTINATION_USER_ID`**, so the prompt must always pass `lineUserId` explicitly.

A unit test checks our message against a vendored copy of that schema.

`record_confirmation` accepts `detail` up to 2000 characters and stores the first 500. That way a long LINE response can't make the recording call fail during the demo.

- [ ] **Step 1: Vendor LINE Bot MCP's flex message schema for a contract test**

It pulls in puppeteer, so it's not added as a dependency. Only its schema file is copied:

```bash
mkdir -p test/fixtures
TMP=$(mktemp -d)
(cd "$TMP" && npm pack @line/line-bot-mcp-server@0.5.0 --silent && tar xzf line-line-bot-mcp-server-0.5.0.tgz)
{
  echo '// Copied from @line/line-bot-mcp-server 0.5.0, dist/common/schema/flexMessage.js.'
  echo '// Apache-2.0, Copyright 2025 LY Corporation. Used only by test/unit/line-contract.test.ts.'
  echo '// Changed: zod is imported from @strapi/utils (zod 3) instead of "zod".'
  sed -e 's#^import { z } from "zod";#import { z } from "@strapi/utils";#' -e '/sourceMappingURL/d' "$TMP/package/dist/common/schema/flexMessage.js"
} > test/fixtures/line-flex-message-schema.mjs
grep -c 'export const flexMessageSchema' test/fixtures/line-flex-message-schema.mjs
```

Expected: the last command prints `1`.

- [ ] **Step 2: Write the failing tests**

`test/unit/line-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildConfirmationMessage } from '../../server/src/domain/flex-message';
import { flexMessageSchema } from '../fixtures/line-flex-message-schema.mjs';

describe('LINE Bot MCP contract', () => {
  it('builds a message that push_flex_message accepts', () => {
    const message = buildConfirmationMessage({
      houseName: 'メゾン',
      reference: 'APT-4821',
      boutiqueName: '銀座本店',
      boutiqueAddress: '',
      requestedForText: '10月10日(土) 14:00',
      productNames: ['ウィークエンダー 50', 'パスポートカバー', 'ラゲッジタグ・デュオ', 'カルネ・ウォレット', 'ウォッチロール・トロワ'],
      appLink: 'https://liff.line.me/1234567890-AbCdEfGh/visits/APT-4821',
    });
    const result = flexMessageSchema.safeParse(message);
    expect(result.success, JSON.stringify(result.success ? null : result.error.issues)).toBe(true);
  });
});
```

`test/unit/confirmation-tools.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildConfirmationMessage } from '../../server/src/domain/flex-message';
import { sendPendingConfirmationsPrompt } from '../../server/src/mcp/prompts/send-pending-confirmations';
import { pendingConfirmationsTool } from '../../server/src/mcp/tools/pending-confirmations';
import { recordConfirmationTool } from '../../server/src/mcp/tools/record-confirmation';
import { fakeStrapi } from './fake-strapi';

const context = { userAbility: {} as any, user: { id: 1 } };
const errorOf = (result: any) => JSON.parse(result.content[0].text).error;
const withConfirmations = (confirmations: Record<string, unknown>) => fakeStrapi({ services: { confirmations } });

const appLink = 'https://liff.line.me/1234567890-AbCdEfGh/visits/APT-4821';
const pending = {
  reference: 'APT-4821',
  lineUserId: `U${'a'.repeat(32)}`,
  boutique: { name: '銀座本店', address: '東京都中央区銀座 1-2-3（デモ）' },
  requestedFor: '2026-10-10T14:00:00+09:00',
  requestedForText: '10月10日(土) 14:00',
  products: [{ name: 'ウィークエンダー 50' }],
  previousAttempts: 0,
  appLink,
  message: buildConfirmationMessage({
    houseName: 'メゾン', reference: 'APT-4821', boutiqueName: '銀座本店', boutiqueAddress: '東京都中央区銀座 1-2-3（デモ）',
    requestedForText: '10月10日(土) 14:00', productNames: ['ウィークエンダー 50'], appLink,
  }),
};

describe('pending_confirmations', () => {
  it('defaults the limit to 10 and returns schema-valid output', async () => {
    const listPending = vi.fn(async () => ({ ok: true, value: [pending] }));
    const result = await pendingConfirmationsTool.createHandler(withConfirmations({ listPending }), context)({ args: {}, extra: {} });
    expect(listPending).toHaveBeenCalledWith(10);
    expect(pendingConfirmationsTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({ appointments: [pending] });
  });

  it('reports not_configured when the plugin has no liffUrl', async () => {
    const listPending = vi.fn(async () => ({ ok: false, code: 'not_configured', message: 'No liffUrl.', hint: 'Set liffUrl.' }));
    const result = await pendingConfirmationsTool.createHandler(withConfirmations({ listPending }), context)({ args: { limit: 3 }, extra: {} });
    expect(listPending).toHaveBeenCalledWith(3);
    expect(errorOf(result).code).toBe('not_configured');
  });
});

describe('record_confirmation', () => {
  const notification = { reference: 'APT-4821', status: 'sent', sentAt: '2026-10-07T09:10:00.000Z', detail: '{"sentMessages":[{"id":"1"}]}' };

  it('passes the outcome through and returns schema-valid output', async () => {
    const record = vi.fn(async () => ({ ok: true, value: { notification, alreadyRecorded: false } }));
    const args = { reference: 'APT-4821', status: 'sent', detail: notification.detail };
    const result = await recordConfirmationTool.createHandler(withConfirmations({ record }), context)({ args, extra: {} });
    expect(record).toHaveBeenCalledWith(args);
    expect(recordConfirmationTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({ notification, alreadyRecorded: false });
  });

  it('turns not_published into a tool error', async () => {
    const record = vi.fn(async () => ({ ok: false, code: 'not_published', message: 'Not confirmed.', hint: 'Do not message the customer.' }));
    const result = await recordConfirmationTool.createHandler(withConfirmations({ record }), context)({
      args: { reference: 'APT-4821', status: 'sent', detail: 'x' }, extra: {},
    });
    expect(errorOf(result)).toEqual({ code: 'not_published', message: 'Not confirmed.', hint: 'Do not message the customer.' });
  });

  it('validates the reference and status', () => {
    const input = recordConfirmationTool.resolveInputSchema!(context);
    expect(input.safeParse({ reference: 'APT-4821', status: 'failed', detail: 'not reachable' }).success).toBe(true);
    expect(input.safeParse({ reference: '4821', status: 'sent', detail: 'x' }).success).toBe(false);
    expect(input.safeParse({ reference: 'APT-4821', status: 'delivered', detail: 'x' }).success).toBe(false);
    expect(input.safeParse({ reference: 'APT-4821', status: 'sent', detail: '' }).success).toBe(false);
  });
});

describe('send_pending_confirmations prompt', () => {
  it('is gated on confirmations.send and walks the agent through check, push and record in order', async () => {
    expect(sendPendingConfirmationsPrompt.auth.policies).toEqual([{ action: 'plugin::maison.confirmations.send' }]);
    const result = await (sendPendingConfirmationsPrompt.createHandler(fakeStrapi()) as any)({});
    const text: string = result.messages[0].content.text;
    const order = ['pending_confirmations', 'get_profile', 'push_flex_message', 'record_confirmation'].map((name) => text.indexOf(name));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toMatch(/200/);
    expect(text).toMatch(/not reachable: not a friend or blocked/);
  });
});
```

Update the registration case in `test/unit/register-mcp.test.ts` to expect all tools but the disabled one, plus the prompt:

```ts
  it('registers every enabled tool and skips the ones in disabledTools', () => {
    const mcp = fakeMcp(true);
    registerMcp(fakeStrapi({ mcp, config: { disabledTools: ['find_boutiques'] } }));
    const names = mcp.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(names).toEqual([
      'browse_collections', 'search_products', 'view_product',
      'request_appointment', 'my_appointments', 'pending_confirmations', 'record_confirmation',
    ]);
    expect(mcp.registerPrompt.mock.calls.map(([prompt]) => prompt.name)).toEqual(['send_pending_confirmations']);
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run test/unit/confirmation-tools.test.ts test/unit/line-contract.test.ts test/unit/register-mcp.test.ts`
Expected: `confirmation-tools` fails with "Failed to resolve import", and the registration case fails. `line-contract` already passes, which confirms the Task 4 message matches LINE's schema. If it fails, fix `server/src/domain/flex-message.ts` until it passes, keeping Task 4's tests green.

- [ ] **Step 4: Implement `server/src/services/confirmations.ts`**

```ts
import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { UID } from '../constants';
import { buildConfirmationMessage, type FlexMessage } from '../domain/flex-message';
import { failure, type ServiceResult } from '../domain/service-result';
import { lineUserIdOf, parseSubject } from '../domain/subject';
import { formatJaDateTime, toZonedIso } from '../domain/time';

type Doc = Record<string, any>;
export type Outcome = 'sent' | 'failed';

export interface PendingConfirmation {
  reference: string;
  lineUserId: string;
  boutique: { name: string; address: string };
  requestedFor: string;
  requestedForText: string;
  products: Array<{ name: string }>;
  previousAttempts: number;
  appLink: string;
  message: FlexMessage;
}

export interface RecordedConfirmation {
  notification: { reference: string; status: Outcome; sentAt: string; detail: string };
  alreadyRecorded: boolean;
}

const DETAIL_MAX = 500;
const clip = (text: string) => {
  const chars = Array.from(text);
  return chars.length <= DETAIL_MAX ? text : `${chars.slice(0, DETAIL_MAX - 1).join('')}…`;
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  /** Per appointment reference: whether a `sent` notification exists, and how many `failed` ones. */
  const outcomes = async (references: string[]) => {
    const map = new Map<string, { sent: boolean; failed: number }>();
    if (references.length === 0) return map;
    const rows = await strapi.documents(UID.notification).findMany({
      filters: { appointmentReference: { $in: references } },
      fields: ['appointmentReference', 'outcome'],
      limit: 5000,
    });
    for (const row of rows as Doc[]) {
      const reference = row.appointmentReference as string;
      const entry = map.get(reference) ?? { sent: false, failed: 0 };
      if (row.outcome === 'sent') entry.sent = true;
      else entry.failed += 1;
      map.set(reference, entry);
    }
    return map;
  };

  const toRecorded = (reference: string, row: Doc, alreadyRecorded: boolean): RecordedConfirmation => ({
    notification: { reference, status: row.outcome, sentAt: new Date(row.sentAt).toISOString(), detail: row.detail ?? '' },
    alreadyRecorded,
  });

  return {
    /** Published (staff-confirmed) appointments without a `sent` notification, soonest visit first. */
    async listPending(limit: number): Promise<ServiceResult<PendingConfirmation[]>> {
      const { liffUrl, timezone, houseName } = getConfig(strapi);
      if (!liffUrl) {
        return failure(
          'not_configured',
          'The maison plugin has no liffUrl, so the confirmation link would be broken.',
          'Set liffUrl in the maison plugin config (MAISON_LIFF_URL in LaunchPad) and restart Strapi. Send nothing until then.'
        );
      }
      const published = (await strapi.documents(UID.appointment).findMany({
        status: 'published',
        sort: 'requestedFor:asc',
        populate: { boutique: { fields: ['name', 'address'] }, products: { fields: ['name'] } },
        limit: 200,
      })) as Doc[];
      const state = await outcomes(published.map((doc) => doc.reference as string));

      const pending: PendingConfirmation[] = [];
      for (const doc of published) {
        if (pending.length >= limit) break;
        if (state.get(doc.reference)?.sent) continue;
        const subject = parseSubject(doc.customer);
        if (!subject) {
          strapi.log.warn(`[maison] Appointment ${doc.reference} has no valid LINE customer, so it can't be confirmed over LINE.`);
          continue;
        }
        const when = new Date(doc.requestedFor);
        const appLink = `${liffUrl}/visits/${doc.reference}`;
        const boutique = { name: doc.boutique?.name ?? '', address: doc.boutique?.address ?? '' };
        const products = ((doc.products ?? []) as Doc[]).map((product) => ({ name: product.name as string }));
        const requestedForText = formatJaDateTime(when, timezone);
        pending.push({
          reference: doc.reference,
          lineUserId: lineUserIdOf(subject),
          boutique,
          requestedFor: toZonedIso(when, timezone),
          requestedForText,
          products,
          previousAttempts: state.get(doc.reference)?.failed ?? 0,
          appLink,
          message: buildConfirmationMessage({
            houseName: houseName.ja,
            reference: doc.reference,
            boutiqueName: boutique.name,
            boutiqueAddress: boutique.address,
            requestedForText,
            productNames: products.map((product) => product.name),
            appLink,
          }),
        });
      }
      return { ok: true, value: pending };
    },

    /** Appends a delivery outcome. A second `sent` for the same appointment returns the first one instead. */
    async record(input: { reference: string; status: Outcome; detail: string }): Promise<ServiceResult<RecordedConfirmation>> {
      const appointment = (await strapi.documents(UID.appointment).findFirst({
        status: 'draft',
        filters: { reference: { $eq: input.reference } },
        fields: ['documentId', 'reference'],
      })) as Doc | null;
      if (!appointment) {
        return failure('not_found', `No appointment ${input.reference}.`, 'Use a reference from pending_confirmations.');
      }
      const published = await strapi.documents(UID.appointment).count({
        status: 'published',
        filters: { documentId: { $eq: appointment.documentId } },
      });
      if (published === 0) {
        return failure(
          'not_published',
          `Appointment ${input.reference} has not been confirmed by the boutique.`,
          'Only published appointments get confirmations. Do not message the customer; call pending_confirmations for the ones to send.'
        );
      }
      if (input.status === 'sent') {
        const existing = (await strapi.documents(UID.notification).findFirst({
          filters: { outcome: { $eq: 'sent' }, appointmentReference: { $eq: input.reference } },
          sort: 'sentAt:asc',
        })) as Doc | null;
        if (existing) return { ok: true, value: toRecorded(input.reference, existing, true) };
      }
      const created = await strapi.documents(UID.notification).create({
        data: {
          appointmentReference: input.reference,
          channel: 'line',
          outcome: input.status,
          sentAt: new Date().toISOString(),
          detail: clip(input.detail),
          recordedBy: 'ops-agent',
        },
      });
      const saved = (await strapi.documents(UID.notification).findOne({ documentId: created.documentId })) as Doc;
      return { ok: true, value: toRecorded(input.reference, saved, false) };
    },
  };
};
```

Add `confirmations` to `server/src/services/index.ts`:

```ts
import appointments from './appointments';
import catalog from './catalog';
import confirmations from './confirmations';
import errors from './errors';
import identity from './identity';
import seed from './seed';

export default {
  appointments,
  catalog,
  confirmations,
  errors,
  identity,
  seed,
};
```

- [ ] **Step 5: Implement the two tools**

`server/src/mcp/tools/pending-confirmations.ts`:

```ts
import { z } from '@strapi/utils';

import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';

const pendingOutput = z.object({
  reference: z.string(),
  lineUserId: z.string().describe('Pass as userId to LINE Bot MCP get_profile and push_flex_message.'),
  boutique: z.object({ name: z.string(), address: z.string() }),
  requestedFor: z.string(),
  requestedForText: z.string(),
  products: z.array(z.object({ name: z.string() })),
  previousAttempts: z.number().describe('Failed delivery attempts already recorded.'),
  appLink: z.string(),
  message: z
    .object({ altText: z.string(), contents: z.record(z.any()) })
    .describe("Pass unchanged as push_flex_message's message."),
});

export const pendingConfirmationsTool = defineTool({
  name: 'pending_confirmations',
  title: 'List pending confirmations',
  description:
    'Lists appointments that staff have confirmed (published) but whose LINE confirmation has not been sent, each with the LINE user ID and a ready-made LINE flex message. Requests still waiting for staff are never listed. Deliver with LINE Bot MCP, then call record_confirmation.',
  auth: { policies: [{ action: ACTION.confirmationsSend }] },
  resolveInputSchema: () =>
    z.object({ limit: z.number().int().min(1).max(20).optional().describe('Maximum appointments, default 10.') }),
  resolveOutputSchema: () => z.object({ appointments: z.array(pendingOutput) }),
  createHandler: (strapi) => async ({ args }) => {
    const result = await strapi.plugin('maison').service('confirmations').listPending(args.limit ?? 10);
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess({ appointments: result.value });
  },
});
```

`server/src/mcp/tools/record-confirmation.ts`:

```ts
import { z } from '@strapi/utils';

import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';

export const recordConfirmationTool = defineTool({
  name: 'record_confirmation',
  title: 'Record a confirmation outcome',
  description:
    'Records whether a LINE confirmation reached the customer. Use "sent" only after LINE Bot MCP push_flex_message succeeded, and "failed" otherwise. Recording "sent" twice is safe: the first record is returned with alreadyRecorded true.',
  auth: { policies: [{ action: ACTION.confirmationsSend }] },
  resolveInputSchema: () =>
    z.object({
      reference: z.string().regex(/^APT-\d{4}$/, 'Use a reference like APT-4821.'),
      status: z.enum(['sent', 'failed']),
      detail: z.string().min(1).max(2000).describe("LINE's response for sent, or why it failed. Stored up to 500 characters."),
    }),
  resolveOutputSchema: () =>
    z.object({
      notification: z.object({ reference: z.string(), status: z.enum(['sent', 'failed']), sentAt: z.string(), detail: z.string() }),
      alreadyRecorded: z.boolean(),
    }),
  createHandler: (strapi) => async ({ args }) => {
    const result = await strapi.plugin('maison').service('confirmations').record(args);
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess(result.value);
  },
});
```

- [ ] **Step 6: Implement the prompt `server/src/mcp/prompts/send-pending-confirmations.ts`**

```ts
import { ACTION } from '../../constants';
import { definePrompt } from '../define';

export const SEND_PENDING_CONFIRMATIONS_TEXT = `Send LINE confirmations for boutique appointments that staff have confirmed.

You have two MCP servers: this Strapi server (pending_confirmations, record_confirmation) and the LINE Bot MCP server (get_profile, push_flex_message).

1. Call pending_confirmations.
2. For each appointment, in order:
   a. Call get_profile with userId set to its lineUserId.
   b. If get_profile fails, do not push. Call record_confirmation with status "failed" and detail "not reachable: not a friend or blocked".
   c. Otherwise call push_flex_message with userId set to lineUserId and message set to the appointment's message, exactly as returned.
   d. If the push succeeded, call record_confirmation with status "sent" and LINE's response as detail. If it failed, call record_confirmation with status "failed" and the error as detail.
3. Report how many confirmations were sent and how many failed, with their references.

Why check first: LINE's push API returns 200 even when a message can't be delivered (the customer isn't a friend of the account, or blocked it). get_profile fails for those customers, so it is the reachability check. Never report a confirmation as sent unless get_profile and push_flex_message both succeeded.
Always pass userId explicitly; LINE Bot MCP otherwise sends to its default user.
If pending_confirmations returns not_configured, stop and report its hint.`;

export const sendPendingConfirmationsPrompt = definePrompt({
  name: 'send_pending_confirmations',
  title: 'Send pending appointment confirmations',
  description: 'Step-by-step instructions to deliver LINE confirmations for staff-confirmed appointments, using this server and LINE Bot MCP.',
  auth: { policies: [{ action: ACTION.confirmationsSend }] },
  createHandler: () => async () => ({
    messages: [{ role: 'user', content: { type: 'text', text: SEND_PENDING_CONFIRMATIONS_TEXT } }],
  }),
});
```

- [ ] **Step 7: Register them, and warn at startup when `liffUrl` is missing**

In `server/src/mcp/index.ts`, add the imports and the lines after `my_appointments`:

```ts
import { sendPendingConfirmationsPrompt } from './prompts/send-pending-confirmations';
import { pendingConfirmationsTool } from './tools/pending-confirmations';
import { recordConfirmationTool } from './tools/record-confirmation';
```

```ts
  if (enabled('pending_confirmations')) mcp.registerTool(pendingConfirmationsTool);
  if (enabled('record_confirmation')) mcp.registerTool(recordConfirmationTool);
  mcp.registerPrompt(sendPendingConfirmationsPrompt);
```

In `server/src/bootstrap.ts`, add `import { getConfig } from './config';` and append to the end of `bootstrap`:

```ts
  if (!getConfig(strapi).liffUrl) {
    strapi.log.warn('[maison] config.liffUrl is not set, so pending_confirmations will return not_configured.');
  }
```

- [ ] **Step 8: Run the unit tests and type checks**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 9: Write `test/integration/confirmations.test.mjs`**

LaunchPad's `config/plugins.ts` reads `MAISON_LIFF_URL` (Task 1), so the test sets it before booting.

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi } from './harness.mjs';

const LIFF_URL = 'https://liff.line.me/1234567890-AbCdEfGh';
const NOW = new Date('2026-10-01T00:00:00Z');
const APPOINTMENT = 'plugin::maison.appointment';

describe('confirmations service', () => {
  let strapi;
  let confirmations;
  let confirmed;
  let waiting;

  before(async () => {
    process.env.MAISON_LIFF_URL = LIFF_URL;
    strapi = await bootStrapi('confirmations');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    const appointments = strapi.plugin('maison').service('appointments');
    const make = async (requestedFor) =>
      (await appointments.request({
        subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50', 'passport-cover'], requestedFor, createdVia: 'concierge', now: NOW,
      })).value.reference;
    confirmed = await make('2026-10-10T14:00:00+09:00');
    waiting = await make('2026-10-11T14:00:00+09:00');
    const doc = await strapi.documents(APPOINTMENT).findFirst({ status: 'draft', filters: { reference: confirmed } });
    await strapi.documents(APPOINTMENT).publish({ documentId: doc.documentId });
    confirmations = strapi.plugin('maison').service('confirmations');
  });

  after(async () => {
    await strapi?.destroy();
    delete process.env.MAISON_LIFF_URL;
  });

  it('lists only published appointments, with a ready LINE message', async () => {
    const result = await confirmations.listPending(10);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.map((a) => a.reference), [confirmed]);
    const [item] = result.value;
    assert.equal(item.lineUserId, `U${'a'.repeat(32)}`);
    assert.equal(item.requestedFor, '2026-10-10T14:00:00+09:00');
    assert.equal(item.requestedForText, '10月10日(土) 14:00');
    assert.equal(item.boutique.name, '銀座本店');
    assert.deepEqual(item.products.map((p) => p.name), ['ウィークエンダー 50', 'パスポートカバー']);
    assert.equal(item.appLink, `${LIFF_URL}/visits/${confirmed}`);
    assert.equal(item.message.altText, `ご来店予約が確定しました（${confirmed}）`);
    assert.equal(item.previousAttempts, 0);
  });

  it('refuses unknown and unconfirmed appointments', async () => {
    assert.equal((await confirmations.record({ reference: 'APT-0000', status: 'sent', detail: 'x' })).code, 'not_found');
    assert.equal((await confirmations.record({ reference: waiting, status: 'sent', detail: 'x' })).code, 'not_published');
  });

  it('counts failed attempts, records a send once, then stops listing it', async () => {
    const failed = await confirmations.record({ reference: confirmed, status: 'failed', detail: 'not reachable: not a friend or blocked' });
    assert.equal(failed.ok, true);
    assert.equal(failed.value.alreadyRecorded, false);
    assert.equal((await confirmations.listPending(10)).value[0].previousAttempts, 1);

    const sent = await confirmations.record({ reference: confirmed, status: 'sent', detail: `{"sentMessages":[{"id":"1"}]}${'!'.repeat(900)}` });
    assert.equal(sent.value.alreadyRecorded, false);
    assert.equal(sent.value.notification.status, 'sent');
    assert.equal(Array.from(sent.value.notification.detail).length, 500, 'detail is stored up to 500 characters');

    const again = await confirmations.record({ reference: confirmed, status: 'sent', detail: 'second push' });
    assert.equal(again.value.alreadyRecorded, true);
    assert.equal(again.value.notification.sentAt, sent.value.notification.sentAt);

    assert.deepEqual((await confirmations.listPending(10)).value, []);
    const [mine] = (await strapi.plugin('maison').service('appointments').listForCustomer(SUBJECT_A, 'ja')).filter((a) => a.reference === confirmed);
    assert.equal(mine.status, 'confirmed');
    assert.equal(mine.confirmationSent, true);
  });

  it('returns not_configured without a liffUrl', async () => {
    strapi.config.set('plugin::maison.liffUrl', null);
    try {
      assert.equal((await confirmations.listPending(10)).code, 'not_configured');
    } finally {
      strapi.config.set('plugin::maison.liffUrl', LIFF_URL);
    }
  });
});
```

- [ ] **Step 10: Build, push and run all integration tests**

```bash
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi npm run test:integration
```

Expected: every integration file passes (relations, permissions, seed, catalog, appointments, confirmations).

- [ ] **Step 11: Commit**

```bash
git add server/src test/unit test/fixtures test/integration/confirmations.test.mjs
git commit -m "feat: add LINE confirmation tools and the send_pending_confirmations prompt"
```

---

### Task 11b: Staff review and confirmation, and the two staff tools

Staff need to see the requests customers made and confirm them from anywhere, not only in the Content Manager. This task adds the service methods behind every staff surface and exposes them as two MCP tools. The chat (Task 11c) and the admin page (Task 12) reuse them.

**Files:**
- Modify: `server/src/constants.ts`, `server/src/bootstrap.ts`, `server/src/domain/subject.ts`, `server/src/domain/time.ts`, `server/src/mcp/schemas.ts`, `server/src/mcp/tools/record-confirmation.ts`, `server/src/mcp/index.ts`, `server/src/services/appointments.ts`
- Create: `server/src/mcp/tools/appointment-requests.ts`, `server/src/mcp/tools/confirm-appointment.ts`
- Test: `test/unit/subject.test.ts`, `test/unit/time.test.ts`, `test/unit/staff-tools.test.ts` (new), `test/unit/constants.test.ts`, `test/unit/register-mcp.test.ts`, `test/integration/staff-appointments.test.mjs` (new), `test/integration/permissions.test.mjs`

**Interfaces:**
- Consumes:
  - `parseSubject` (Task 2), `toolError`, `toolSuccess` (Task 2)
  - `defineTool`, `registerMcp`, `fakeStrapi` (Task 7)
  - `slugInput`, `isoDateInput`, `localeInput` (Task 9)
  - `toZonedIso`, `failure`, `ServiceResult`, and the appointments service's private helpers `publishedBySlug`, `confirmedIds`, `sentReferences` and `labels` (Task 10)
- Produces:
  - `ACTION.appointmentsReview` (`plugin::maison.appointments.review`) and `ACTION.appointmentsConfirm` (`plugin::maison.appointments.confirm`), registered in bootstrap; `TOOL_NAMES` gains `appointment_requests` and `confirm_appointment`
  - `maskSubject(value: unknown): string`, e.g. `line:U4af…88`, or `unknown`
  - `zonedDayRange(isoDate: string, timeZone: string): { start: Date; end: Date }`
  - `referenceInput`, `appointmentRequestsInput` and `staffAppointmentOutput` in `server/src/mcp/schemas.ts`
  - `interface StaffAppointmentView { reference; status: 'requested' | 'confirmed'; customer; boutique: { slug; name } | null; requestedFor; products: { slug; name }[]; note; createdVia: 'concierge' | 'app'; confirmationSent; createdAt }`
  - service `appointments.listRequests(filters: RequestFilters = {}): Promise<ServiceResult<StaffAppointmentView[]>>`, where `RequestFilters = { status?: 'requested' | 'confirmed' | 'all'; boutique?: string; date?: string; limit?: number; locale?: Locale; now?: Date }`
  - service `appointments.confirm(reference: string, now = new Date()): Promise<ServiceResult<{ appointment: StaffAppointmentView; alreadyConfirmed: boolean }>>`
  - tools `appointment_requests` (gated on `appointments.review`) and `confirm_appointment` (gated on `appointments.confirm`)

**Why the appointments service, not a new `staff` service.** Both methods need the service's private helpers: `publishedBySlug`, `confirmedIds`, `sentReferences` and the published-only `labels`. They also rest on its rule that publishing an appointment confirms it. A separate service would have to export those helpers or copy them.

**The rules:**
- **Status.** `requested` (the default) lists what staff can still confirm: no published version yet, and the visit hasn't started. A request whose visit has started drops out of it, because `confirm` would refuse it with `in_the_past`. `confirmed` lists appointments that have a published version. `all` lists everything, including unconfirmed requests whose time has passed.
- **Sort.** `requested` comes soonest visit first (`requestedFor:asc`), so the next visit to confirm is on top. `confirmed` and `all` come newest request first (`createdAt:desc`), as `my_appointments` does, so a new request lands on top of the board.
- **`date`** is a calendar day in the configured timezone. It becomes the UTC range `[start, end)` from `zonedDayRange`, so 10 October in Tokyo runs from 15:00 UTC on 9 October.
- **Labels are published only.** `toViews` (Task 10) falls back to the draft's populated `slug` and `name` when a label is missing, and the Task 10 review flagged that. The staff view doesn't copy it. Its populate (`STAFF_POPULATE`) fetches only `documentId`, and names come from `labels`, which reads published versions. A boutique with no published version shows as `null`, and a product with none is left out.
- **The customer is masked** by `maskSubject`: `line:U`, then three characters, `…` and the last two, so `line:U4af…88`. The full subject never leaves the service. Anything that isn't a valid subject shows as `unknown`.
- **Times** (`requestedFor`, `createdAt`) are ISO 8601 in the configured timezone, via `toZonedIso`.
- **`now`** is injectable only for tests, as `request()` does. `listRequests` takes it in `filters`, and `confirm` takes it as its second argument.
- **`confirm` sends nothing.** It publishes the draft with the Document Service, the same thing Publish in the Content Manager does, and a second call returns `alreadyConfirmed: true`. The ops agent sends the LINE confirmation later.

**Two schema changes.** `referenceInput` moves the `APT-` pattern from `record_confirmation` into `schemas.ts`, so both tools use one pattern. The message is unchanged, so `confirmation-tools.test.ts` doesn't change. `appointmentRequestsInput` is shared by the tool, the chat and the board's admin route (Task 12). It adds `locale` to the filters, because the tool contract says every read takes `locale`.

- [ ] **Step 1: Write the failing domain tests**

In `test/unit/subject.test.ts`, add `maskSubject` to the import from `../../server/src/domain/subject`, then append:

```ts
describe('maskSubject', () => {
  it('keeps the prefix, three characters and the last two', () => {
    expect(maskSubject(VALID)).toBe('line:U4af…88');
  });

  it('never contains the LINE user ID', () => {
    expect(maskSubject(VALID)).not.toContain(lineUserIdOf(VALID));
  });

  it.each([
    ['uppercase hex', 'line:U4AF4980629C1A7B3F1E2D3C4B5A69788'],
    ['surrounding spaces', ` ${VALID} `],
    ['empty', ''],
    ['null', null],
  ])('returns "unknown" for %s', (_label, value) => {
    expect(maskSubject(value)).toBe('unknown');
  });
});
```

In `test/unit/time.test.ts`, add `zonedDayRange` to the import from `../../server/src/domain/time`, then append:

```ts
describe('zonedDayRange', () => {
  const range = (isoDate: string, timeZone: string) => {
    const { start, end } = zonedDayRange(isoDate, timeZone);
    return [start.toISOString(), end.toISOString()];
  };

  it('starts a Tokyo day at 15:00 UTC the day before', () => {
    expect(range('2026-10-10', 'Asia/Tokyo')).toEqual(['2026-10-09T15:00:00.000Z', '2026-10-10T15:00:00.000Z']);
  });

  it('crosses month ends', () => {
    expect(range('2026-10-31', 'Asia/Tokyo')).toEqual(['2026-10-30T15:00:00.000Z', '2026-10-31T15:00:00.000Z']);
  });

  it('gives a 23-hour day when daylight saving time starts', () => {
    expect(range('2026-03-08', 'America/New_York')).toEqual(['2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/subject.test.ts test/unit/time.test.ts`
Expected: FAIL with "maskSubject is not a function" and "zonedDayRange is not a function" (or a missing export).

- [ ] **Step 3: Implement `maskSubject` and `zonedDayRange`**

Append to `server/src/domain/subject.ts`:

```ts
/** A customer as staff see them, e.g. `line:U4af…88`. Never the full subject; anything that isn't one is "unknown". */
export const maskSubject = (value: unknown): string => {
  const subject = parseSubject(value);
  return subject ? `${subject.slice(0, 'line:U'.length + 3)}…${subject.slice(-2)}` : 'unknown';
};
```

Append to `server/src/domain/time.ts`:

```ts
/** UTC offset in minutes of `timeZone` at `date`, e.g. 540 for Tokyo. */
const offsetMinutes = (date: Date, timeZone: string): number => {
  const [, sign, hours, minutes] = /([+-])(\d{2}):(\d{2})$/.exec(toZonedIso(date, timeZone)) as RegExpExecArray;
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
};

/** The instant a calendar day (YYYY-MM-DD) starts in `timeZone`. The second pass corrects for a DST change that night. */
const startOfDay = (isoDate: string, timeZone: string): Date => {
  const utcMidnight = Date.parse(`${isoDate}T00:00:00Z`);
  const guess = utcMidnight - offsetMinutes(new Date(utcMidnight), timeZone) * 60_000;
  return new Date(utcMidnight - offsetMinutes(new Date(guess), timeZone) * 60_000);
};

/** [start, end) of a calendar day in `timeZone`, for "visits on this day" filters. */
export function zonedDayRange(isoDate: string, timeZone: string): { start: Date; end: Date } {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: startOfDay(isoDate, timeZone), end: startOfDay(next.toISOString().slice(0, 10), timeZone) };
}
```

Run: `npx vitest run test/unit/subject.test.ts test/unit/time.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing tool and registry tests**

`test/unit/staff-tools.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { appointmentRequestsTool } from '../../server/src/mcp/tools/appointment-requests';
import { confirmAppointmentTool } from '../../server/src/mcp/tools/confirm-appointment';
import { fakeStrapi } from './fake-strapi';

const context = { userAbility: {} as any, user: { id: 1 } };
const errorOf = (result: any) => JSON.parse(result.content[0].text).error;
const withAppointments = (appointments: Record<string, unknown>) => fakeStrapi({ services: { appointments } });

const staffView = {
  reference: 'APT-4821',
  status: 'requested',
  customer: 'line:U4af…88',
  boutique: { slug: 'ginza', name: '銀座本店' },
  requestedFor: '2026-10-10T14:00:00+09:00',
  products: [{ slug: 'weekender-50', name: 'ウィークエンダー 50' }],
  note: 'A gift for a friend who travels',
  createdVia: 'concierge',
  confirmationSent: false,
  createdAt: '2026-10-01T09:00:00+09:00',
};

describe('appointment_requests', () => {
  it('is gated on appointments.review and passes the filters through', async () => {
    expect(appointmentRequestsTool.auth.policies).toEqual([{ action: 'plugin::maison.appointments.review' }]);
    const listRequests = vi.fn(async () => ({ ok: true, value: [staffView, { ...staffView, reference: 'APT-4822', boutique: null }] }));
    const args = { status: 'all', boutique: 'ginza', date: '2026-10-10', limit: 5, locale: 'en' };
    const result = await appointmentRequestsTool.createHandler(withAppointments({ listRequests }), context)({ args, extra: {} });
    expect(listRequests).toHaveBeenCalledWith(args);
    expect(appointmentRequestsTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({
      appointments: [staffView, { ...staffView, reference: 'APT-4822', boutique: null }],
    });
  });

  it('turns an unknown boutique into not_found', async () => {
    const failure = { ok: false, code: 'not_found', message: 'No boutique "kyoto".', hint: 'Call find_boutiques to find valid boutique slugs.' };
    const listRequests = vi.fn(async () => failure);
    const result = await appointmentRequestsTool.createHandler(withAppointments({ listRequests }), context)({ args: { boutique: 'kyoto' }, extra: {} });
    expect(result.isError).toBe(true);
    expect(errorOf(result)).toEqual({ code: 'not_found', message: failure.message, hint: failure.hint });
  });

  it('validates status, date and limit', () => {
    const input = appointmentRequestsTool.resolveInputSchema!(context);
    expect(input.safeParse({}).success).toBe(true);
    expect(input.safeParse({ status: 'confirmed', limit: 50 }).success).toBe(true);
    expect(input.safeParse({ status: 'pending' }).success).toBe(false);
    expect(input.safeParse({ date: '2026-10-1' }).success).toBe(false);
    expect(input.safeParse({ limit: 0 }).success).toBe(false);
    expect(input.safeParse({ limit: 51 }).success).toBe(false);
  });
});

describe('confirm_appointment', () => {
  it('is gated on appointments.confirm and says it sends nothing', () => {
    expect(confirmAppointmentTool.auth.policies).toEqual([{ action: 'plugin::maison.appointments.confirm' }]);
    expect(confirmAppointmentTool.description).toMatch(/This tool sends nothing/);
    expect(confirmAppointmentTool.description).toMatch(/LINE ops agent/);
  });

  it('confirms by reference and returns schema-valid output', async () => {
    const value = { appointment: { ...staffView, status: 'confirmed' }, alreadyConfirmed: false };
    const confirm = vi.fn(async () => ({ ok: true, value }));
    const result = await confirmAppointmentTool.createHandler(withAppointments({ confirm }), context)({ args: { reference: 'APT-4821' }, extra: {} });
    expect(confirm).toHaveBeenCalledWith('APT-4821');
    expect(confirmAppointmentTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual(value);
  });

  it.each([
    ['not_found', 'No appointment APT-0000.', 'Use a reference from appointment_requests.'],
    ['in_the_past', 'The visit on 2026-10-02T14:00:00+09:00 has already started.', 'Ask the customer to request a new time.'],
  ])('turns %s into a tool error with the same message and hint', async (code, message, hint) => {
    const confirm = vi.fn(async () => ({ ok: false, code, message, hint }));
    const result = await confirmAppointmentTool.createHandler(withAppointments({ confirm }), context)({ args: { reference: 'APT-0000' }, extra: {} });
    expect(result.isError).toBe(true);
    expect(errorOf(result)).toEqual({ code, message, hint });
  });

  it('validates the reference', () => {
    const input = confirmAppointmentTool.resolveInputSchema!(context);
    expect(input.safeParse({ reference: 'APT-4821' }).success).toBe(true);
    expect(input.safeParse({ reference: 'apt-4821' }).success).toBe(false);
    expect(input.safeParse({}).success).toBe(false);
  });
});
```

In `test/unit/constants.test.ts`, replace the "eight tools" case with these two:

```ts
  it('declares the ten tools exactly once each', () => {
    expect(TOOL_NAMES).toHaveLength(10);
    expect(new Set(TOOL_NAMES).size).toBe(10);
  });

  it('declares the staff actions', () => {
    expect(ACTION.appointmentsReview).toBe('plugin::maison.appointments.review');
    expect(ACTION.appointmentsConfirm).toBe('plugin::maison.appointments.confirm');
  });
```

In `test/unit/register-mcp.test.ts`, the registration case now expects the staff tools after `my_appointments`:

```ts
    expect(names).toEqual([
      'browse_collections', 'search_products', 'view_product',
      'request_appointment', 'my_appointments', 'appointment_requests', 'confirm_appointment',
      'pending_confirmations', 'record_confirmation',
    ]);
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run test/unit/staff-tools.test.ts test/unit/constants.test.ts test/unit/register-mcp.test.ts`
Expected: FAIL. `staff-tools` fails with "Failed to resolve import ../../server/src/mcp/tools/appointment-requests". The constants test still counts 8 tools and finds no staff actions, and the registration list lacks the staff tools.

- [ ] **Step 6: Add the actions and tool names**

In `server/src/constants.ts`, `ACTION` and `TOOL_NAMES` become:

```ts
/** Full action UIDs, as stored on admin tokens and checked by tool auth policies. */
export const ACTION = {
  catalogRead: 'plugin::maison.catalog.read',
  appointmentsRequest: 'plugin::maison.appointments.request',
  appointmentsReview: 'plugin::maison.appointments.review',
  appointmentsConfirm: 'plugin::maison.appointments.confirm',
  confirmationsSend: 'plugin::maison.confirmations.send',
  demoManage: 'plugin::maison.demo.manage',
} as const;

export const TOOL_NAMES = [
  'browse_collections',
  'search_products',
  'view_product',
  'find_boutiques',
  'request_appointment',
  'my_appointments',
  'appointment_requests',
  'confirm_appointment',
  'pending_confirmations',
  'record_confirmation',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
```

In `server/src/bootstrap.ts`, `ACTIONS` becomes:

```ts
const ACTIONS = [
  { uid: 'catalog.read', displayName: 'MCP: browse the catalog', subCategory: 'mcp' },
  { uid: 'appointments.request', displayName: 'MCP: request and view own appointments', subCategory: 'mcp' },
  { uid: 'appointments.review', displayName: 'MCP: review appointment requests', subCategory: 'mcp' },
  { uid: 'appointments.confirm', displayName: 'MCP: confirm appointment requests', subCategory: 'mcp' },
  { uid: 'confirmations.send', displayName: 'MCP: send appointment confirmations', subCategory: 'mcp' },
  { uid: 'demo.manage', displayName: 'Load and reset demo data', subCategory: 'demo' },
];
```

- [ ] **Step 7: Add the shared staff schemas**

Append to `server/src/mcp/schemas.ts`:

```ts
/** An appointment reference such as APT-4821 (see domain/reference.ts). */
export const referenceInput = z.string().regex(/^APT-\d{4}$/, 'Use a reference like APT-4821.');

/** Staff filters for appointments. The appointment_requests tool, the chat and the admin board all use these. */
export const appointmentRequestsInput = z.object({
  status: z
    .enum(['requested', 'confirmed', 'all'])
    .optional()
    .describe('"requested" (default): waiting for staff, with the visit still ahead. "confirmed": confirmed by staff. "all": every request.'),
  boutique: slugInput.optional().describe('Only this boutique, by slug from find_boutiques.'),
  date: isoDateInput.optional().describe("Only visits on this calendar day (YYYY-MM-DD) in the boutique's time zone."),
  limit: z.number().int().min(1).max(50).optional().describe('Maximum appointments, default 20.'),
  locale: localeInput,
});

/** An appointment as staff see it. The customer is masked, and labels come from published versions only. */
export const staffAppointmentOutput = z.object({
  reference: z.string(),
  status: z.enum(['requested', 'confirmed']).describe('"confirmed" once staff have confirmed it.'),
  customer: z.string().describe('The LINE customer, masked like line:U4af…88. The full ID is never shown.'),
  boutique: z.object({ slug: z.string(), name: z.string() }).nullable().describe('null if the boutique is no longer published.'),
  requestedFor: z.string().describe("Visit start in the boutique's time zone, ISO 8601 with offset."),
  products: z.array(z.object({ slug: z.string(), name: z.string() })).describe('The published products the customer wants to see.'),
  note: z.string().describe("The customer's own words for the boutique."),
  createdVia: z.enum(['concierge', 'app']).describe('"concierge" when the AI concierge made the request, "app" for the app screens.'),
  confirmationSent: z.boolean().describe('Whether the LINE confirmation has been delivered.'),
  createdAt: z.string().describe('When the request was made, ISO 8601 with offset.'),
});
```

In `server/src/mcp/tools/record-confirmation.ts`, add `import { referenceInput } from '../schemas';` after the `defineTool` import. Then replace its inline reference schema with:

```ts
      reference: referenceInput,
```

- [ ] **Step 8: Implement the two tools and register them**

`server/src/mcp/tools/appointment-requests.ts`:

```ts
import { z } from '@strapi/utils';

import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { appointmentRequestsInput, staffAppointmentOutput } from '../schemas';

export const appointmentRequestsTool = defineTool({
  name: 'appointment_requests',
  title: 'Review appointment requests',
  description:
    "Lists customers' boutique appointment requests for staff. By default it shows the requests waiting for staff, soonest visit first; confirmed or all requests come newest first. Filter by boutique slug or visit date. Customers are masked. It changes nothing: confirm a request with confirm_appointment.",
  auth: { policies: [{ action: ACTION.appointmentsReview }] },
  resolveInputSchema: () => appointmentRequestsInput,
  resolveOutputSchema: () => z.object({ appointments: z.array(staffAppointmentOutput) }),
  createHandler: (strapi) => async ({ args }) => {
    const result = await strapi.plugin('maison').service('appointments').listRequests(args);
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess({ appointments: result.value });
  },
});
```

`server/src/mcp/tools/confirm-appointment.ts`:

```ts
import { z } from '@strapi/utils';

import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';
import { referenceInput, staffAppointmentOutput } from '../schemas';

export const confirmAppointmentTool = defineTool({
  name: 'confirm_appointment',
  title: 'Confirm an appointment request',
  description:
    "Confirms a customer's appointment request for the boutique, the same as publishing it in the admin. This tool sends nothing: the customer is messaged separately, when the LINE ops agent delivers the confirmation. Confirming twice is safe and returns alreadyConfirmed true. A visit whose time has passed can't be confirmed.",
  auth: { policies: [{ action: ACTION.appointmentsConfirm }] },
  resolveInputSchema: () => z.object({ reference: referenceInput.describe('Reference from appointment_requests, e.g. APT-4821.') }),
  resolveOutputSchema: () =>
    z.object({
      appointment: staffAppointmentOutput,
      alreadyConfirmed: z.boolean().describe('true if staff had already confirmed it; nothing changed.'),
    }),
  createHandler: (strapi) => async ({ args }) => {
    const result = await strapi.plugin('maison').service('appointments').confirm(args.reference);
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess(result.value);
  },
});
```

In `server/src/mcp/index.ts`, add the imports, then the two registration lines after `my_appointments`:

```ts
import { appointmentRequestsTool } from './tools/appointment-requests';
import { confirmAppointmentTool } from './tools/confirm-appointment';
```

```ts
  if (enabled('appointment_requests')) mcp.registerTool(appointmentRequestsTool);
  if (enabled('confirm_appointment')) mcp.registerTool(confirmAppointmentTool);
```

The registration order becomes `browse_collections`, `search_products`, `view_product`, `find_boutiques`, `request_appointment`, `my_appointments`, `appointment_requests`, `confirm_appointment`, `pending_confirmations`, `record_confirmation`. The prompt condition doesn't change, because it depends only on the two ops tools.

- [ ] **Step 9: Run the unit tests and type checks**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0. The name rule in `register-mcp.test.ts` passes too, because neither new name starts with a prefix Strapi generates.

- [ ] **Step 10: Write the failing integration tests**

`NOW` is fixed, and `listRequests` and `confirm` receive it, so the tests keep passing after the demo dates go by.

`test/integration/staff-appointments.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, SUBJECT_B, bootStrapi } from './harness.mjs';

const NOW = new Date('2026-10-01T00:00:00Z'); // 09:00 on Thursday 1 October in Tokyo
const APPOINTMENT = 'plugin::maison.appointment';

describe('staff review and confirmation', () => {
  let strapi;
  let appointments;
  const refs = {};
  /** Creates a request as a customer would. The pause keeps createdAt distinct, so "newest first" is stable. */
  const request = async (key, overrides) => {
    const result = await appointments.request({
      subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50'], createdVia: 'app', now: NOW, ...overrides,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    refs[key] = result.value.reference;
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const list = (filters = {}) => appointments.listRequests({ now: NOW, ...filters });
  const references = async (filters) => (await list(filters)).value.map((a) => a.reference);

  before(async () => {
    strapi = await bootStrapi('staff');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    appointments = strapi.plugin('maison').service('appointments');
    // Created in this order, so newest first is: late, soon, other.
    await request('other', {
      subject: SUBJECT_B, boutique: 'omotesando', productSlugs: ['passport-cover'], requestedFor: '2026-10-11T15:00:00+09:00',
      createdVia: 'concierge', note: 'For my sister',
    });
    await request('soon', { requestedFor: '2026-10-02T14:00:00+09:00' });
    await request('late', { requestedFor: '2026-10-10T14:00:00+09:00', productSlugs: ['weekender-50', 'passport-cover'] });
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('lists requests waiting for staff, soonest visit first, with the customer masked', async () => {
    const result = await list();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.map((a) => a.reference), [refs.soon, refs.late, refs.other]);
    const [soon] = result.value;
    assert.equal(soon.status, 'requested');
    assert.equal(soon.customer, 'line:Uaaa…aa');
    assert.deepEqual(soon.boutique, { slug: 'ginza', name: '銀座本店' });
    assert.equal(soon.requestedFor, '2026-10-02T14:00:00+09:00');
    assert.deepEqual(soon.products, [{ slug: 'weekender-50', name: 'ウィークエンダー 50' }]);
    assert.equal(soon.createdVia, 'app');
    assert.equal(soon.confirmationSent, false);
    assert.match(soon.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
    assert.ok(!JSON.stringify(result.value).includes(SUBJECT_A.slice('line:'.length)), 'never the LINE user ID');
  });

  it('filters by boutique, visit day and limit, and names follow the locale', async () => {
    assert.deepEqual(await references({ boutique: 'omotesando' }), [refs.other]);
    assert.deepEqual(await references({ date: '2026-10-10' }), [refs.late]);
    assert.deepEqual(await references({ limit: 1 }), [refs.soon]);
    assert.equal((await list({ boutique: 'kyoto' })).code, 'not_found');

    const [other] = (await list({ boutique: 'omotesando', locale: 'en' })).value;
    assert.equal(other.customer, 'line:Ubbb…bb');
    assert.deepEqual(other.boutique, { slug: 'omotesando', name: 'Omotesando' });
    assert.deepEqual(other.products, [{ slug: 'passport-cover', name: 'Passport Cover' }]);
    assert.equal(other.createdVia, 'concierge');
    assert.equal(other.note, 'For my sister');
  });

  it('confirms by publishing, and confirming again changes nothing', async () => {
    const first = await appointments.confirm(refs.late, NOW);
    assert.equal(first.ok, true);
    assert.equal(first.value.alreadyConfirmed, false);
    assert.equal(first.value.appointment.reference, refs.late);
    assert.equal(first.value.appointment.status, 'confirmed');
    assert.equal(await strapi.documents(APPOINTMENT).count({ status: 'published', filters: { reference: refs.late } }), 1);

    const again = await appointments.confirm(refs.late, NOW);
    assert.equal(again.value.alreadyConfirmed, true);
    assert.equal(again.value.appointment.status, 'confirmed');

    assert.deepEqual(await references(), [refs.soon, refs.other]);
    assert.deepEqual(await references({ status: 'confirmed' }), [refs.late]);
  });

  it('refuses unknown references and visits that have started, and publishes nothing', async () => {
    assert.equal((await appointments.confirm('APT-0000', NOW)).code, 'not_found');

    const later = new Date('2026-10-02T06:00:00Z'); // 15:00 on 2 October in Tokyo, an hour after the visit
    const past = await appointments.confirm(refs.soon, later);
    assert.equal(past.code, 'in_the_past');
    assert.match(past.message, /2026-10-02T14:00:00\+09:00/);
    assert.equal(await strapi.documents(APPOINTMENT).count({ status: 'published', filters: { reference: refs.soon } }), 0);

    assert.deepEqual(await references({ now: later }), [refs.other], 'a request whose time has passed no longer waits for staff');
    assert.ok((await references({ status: 'all', now: later })).includes(refs.soon), 'it is still listed under all');
  });

  it('lists all requests newest first, with the LINE confirmation state', async () => {
    const sent = await strapi.plugin('maison').service('confirmations').record({ reference: refs.late, status: 'sent', detail: 'ok' });
    assert.equal(sent.ok, true);

    const all = (await list({ status: 'all' })).value;
    assert.deepEqual(all.map((a) => a.reference), [refs.late, refs.soon, refs.other]);
    assert.deepEqual(all.map((a) => a.status), ['confirmed', 'requested', 'requested']);
    assert.deepEqual(all.map((a) => a.confirmationSent), [true, false, false]);
  });

  // Last: it changes the catalog.
  it('labels come from published versions, never from draft edits', async () => {
    const ginza = await strapi.documents('plugin::maison.boutique').findFirst({ locale: 'ja', status: 'draft', filters: { slug: 'ginza' } });
    await strapi.documents('plugin::maison.boutique').update({ documentId: ginza.documentId, locale: 'ja', data: { name: '銀座本店（改装中の下書き）' } });
    const cover = await strapi.documents('plugin::maison.product').findFirst({ locale: 'ja', status: 'published', filters: { slug: 'passport-cover' } });
    await strapi.documents('plugin::maison.product').unpublish({ documentId: cover.documentId, locale: '*' });

    const late = (await list({ status: 'all' })).value.find((a) => a.reference === refs.late);
    assert.deepEqual(late.boutique, { slug: 'ginza', name: '銀座本店' }, 'the published name, not the draft edit');
    assert.deepEqual(late.products.map((p) => p.slug), ['weekender-50'], 'an unpublished product is left out');
  });
});
```

The last case changes the catalog, so it runs last, in its own database.

In `test/integration/permissions.test.mjs`, the case becomes:

```js
  it('registers the six plugin actions', () => {
    const ids = strapi.service('admin::permission').actionProvider.values().map((action) => action.actionId);
    for (const id of [
      'plugin::maison.catalog.read',
      'plugin::maison.appointments.request',
      'plugin::maison.appointments.review',
      'plugin::maison.appointments.confirm',
      'plugin::maison.confirmations.send',
      'plugin::maison.demo.manage',
    ]) {
      assert.ok(ids.includes(id), `${id} is registered`);
    }
  });
```

- [ ] **Step 11: Run them to verify they fail**

```bash
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi npm run test:integration
```

Expected: the permissions case passes, because Step 6 registered the actions. Every `staff review and confirmation` case fails with a TypeError such as "appointments.listRequests is not a function". The other files pass.

- [ ] **Step 12: Implement `listRequests` and `confirm` in `server/src/services/appointments.ts`**

Replace the `toZonedIso` import with:

```ts
import { maskSubject } from '../domain/subject';
import { toZonedIso, zonedDayRange } from '../domain/time';
```

Add these types after `AppointmentRequest`:

```ts
/** An appointment as staff see it: the customer masked, labels from published versions only. */
export interface StaffAppointmentView {
  reference: string;
  status: 'requested' | 'confirmed';
  customer: string;
  boutique: { slug: string; name: string } | null;
  requestedFor: string;
  products: Array<{ slug: string; name: string }>;
  note: string;
  createdVia: 'concierge' | 'app';
  confirmationSent: boolean;
  createdAt: string;
}

export interface RequestFilters {
  status?: 'requested' | 'confirmed' | 'all';
  boutique?: string;
  date?: string;
  limit?: number;
  locale?: Locale;
  /** Only for tests. Defaults to the current time. */
  now?: Date;
}

export interface ConfirmedAppointment {
  appointment: StaffAppointmentView;
  alreadyConfirmed: boolean;
}
```

Add this line after `POPULATE`:

```ts
/** Staff views read only documentIds from the draft's relations; every label comes from a published version. */
const STAFF_POPULATE = { boutique: { fields: ['documentId'] }, products: { fields: ['documentId'] } };
```

Add this helper after `confirmedIds`:

```ts
  /** documentIds of every appointment that has a published version, i.e. that staff confirmed. */
  const allConfirmedIds = async (): Promise<string[]> => {
    const rows = await strapi.documents(UID.appointment).findMany({ status: 'published', fields: ['documentId'], limit: 5000 });
    return rows.map((row) => row.documentId as string);
  };
```

Add this after `toViews`. It deliberately doesn't reuse `toViews`, whose draft fallback is the one the Task 10 review flagged:

```ts
  /** Drafts (populated with STAFF_POPULATE) → what staff see. A label with no published version is left out, never read from a draft. */
  const toStaffViews = async (docs: Doc[], locale: Locale): Promise<StaffAppointmentView[]> => {
    const [confirmed, sent, boutiques, products] = await Promise.all([
      confirmedIds(docs.map((doc) => doc.documentId as string)),
      sentReferences(docs.map((doc) => doc.reference as string)),
      labels(UID.boutique, docs.map((doc) => doc.boutique?.documentId).filter(Boolean), locale),
      labels(UID.product, docs.flatMap((doc) => (doc.products ?? []).map((product: Doc) => product.documentId)), locale),
    ]);
    const { timezone } = getConfig(strapi);
    return docs.map((doc) => ({
      reference: doc.reference,
      status: confirmed.has(doc.documentId) ? 'confirmed' : 'requested',
      customer: maskSubject(doc.customer),
      boutique: boutiques.get(doc.boutique?.documentId) ?? null,
      requestedFor: toZonedIso(new Date(doc.requestedFor), timezone),
      products: ((doc.products ?? []) as Doc[]).flatMap((product) => products.get(product.documentId) ?? []),
      note: doc.customerNote ?? '',
      createdVia: doc.createdVia === 'concierge' ? 'concierge' : 'app',
      confirmationSent: sent.has(doc.reference),
      createdAt: toZonedIso(new Date(doc.createdAt), timezone),
    }));
  };
```

Add the two methods after `listForCustomer`, inside the returned object:

```ts
    /**
     * Appointments for staff. "requested" (the default) lists what staff can still confirm: not confirmed yet, with
     * the visit ahead, soonest visit first. "confirmed" and "all" list the newest requests first.
     */
    async listRequests(filters: RequestFilters = {}): Promise<ServiceResult<StaffAppointmentView[]>> {
      const { defaultLocale, timezone } = getConfig(strapi);
      const status = filters.status ?? 'requested';
      const conditions: Doc[] = [];

      if (filters.boutique) {
        const boutique = await publishedBySlug(UID.boutique, filters.boutique, defaultLocale);
        if (!boutique) {
          return failure('not_found', `No boutique "${filters.boutique}".`, 'Call find_boutiques to find valid boutique slugs.');
        }
        conditions.push({ boutique: { documentId: { $eq: boutique.documentId } } });
      }
      if (filters.date) {
        const { start, end } = zonedDayRange(filters.date, timezone);
        conditions.push({ requestedFor: { $gte: start.toISOString(), $lt: end.toISOString() } });
      }
      if (status !== 'all') {
        const confirmed = await allConfirmedIds();
        if (status === 'confirmed') {
          if (confirmed.length === 0) return { ok: true, value: [] };
          conditions.push({ documentId: { $in: confirmed } });
        } else {
          if (confirmed.length > 0) conditions.push({ documentId: { $notIn: confirmed } });
          conditions.push({ requestedFor: { $gte: (filters.now ?? new Date()).toISOString() } });
        }
      }

      const docs = await strapi.documents(UID.appointment).findMany({
        status: 'draft',
        filters: conditions.length > 0 ? { $and: conditions } : {},
        sort: status === 'requested' ? 'requestedFor:asc' : 'createdAt:desc',
        populate: STAFF_POPULATE,
        limit: filters.limit ?? 20,
      });
      return { ok: true, value: await toStaffViews(docs as Doc[], filters.locale ?? defaultLocale) };
    },

    /**
     * Staff confirmation: publishes the draft, the same as Publish in the Content Manager. Confirming twice is safe.
     * It never messages anyone; the LINE ops agent sends the confirmation afterwards.
     */
    async confirm(reference: string, now: Date = new Date()): Promise<ServiceResult<ConfirmedAppointment>> {
      const { defaultLocale, timezone } = getConfig(strapi);
      const draft = (await strapi.documents(UID.appointment).findFirst({
        status: 'draft',
        filters: { reference: { $eq: reference } },
        fields: ['documentId', 'requestedFor'],
      })) as Doc | null;
      if (!draft) {
        return failure('not_found', `No appointment ${reference}.`, 'Use a reference from appointment_requests.');
      }

      const alreadyConfirmed = (await confirmedIds([draft.documentId])).size > 0;
      if (!alreadyConfirmed) {
        const when = new Date(draft.requestedFor);
        if (when.getTime() < now.getTime()) {
          return failure(
            'in_the_past',
            `The visit for ${reference} was at ${toZonedIso(when, timezone)}, which has passed.`,
            "A past visit can't be confirmed. Ask the customer to request a new time."
          );
        }
        await strapi.documents(UID.appointment).publish({ documentId: draft.documentId });
      }

      const saved = await strapi.documents(UID.appointment).findOne({ documentId: draft.documentId, status: 'draft', populate: STAFF_POPULATE });
      const [appointment] = await toStaffViews([saved as Doc], defaultLocale);
      return { ok: true, value: { appointment, alreadyConfirmed } };
    },
```

- [ ] **Step 13: Run all the tests**

```bash
npx vitest run && npm run test:ts:back
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi npm run test:integration
```

Expected: every unit test passes and tsc exits 0. Every integration file passes, including the 6 staff cases and the six-action permissions case.

- [ ] **Step 14: Commit**

```bash
git add server/src test/unit test/integration/staff-appointments.test.mjs test/integration/permissions.test.mjs
git commit -m "feat: add staff review and confirmation of appointment requests"
```

---

### Task 11c: Chat tools for the in-admin chat

`strapi-plugin-tanstack-ai` 1.6.0 adds an AI chat to the admin panel. It picks up tools from any plugin that exposes a service named `ai-tools`. This task gives Maison that service, built from the same MCP tool definitions so the chat and MCP can't drift. LaunchPad installs and configures the chat plugin in plan 3; Maison needs no dependency on it.

**Files:**
- Create: `server/src/services/ai-tools.ts`
- Modify: `server/src/mcp/schemas.ts`, `server/src/services/index.ts`
- Test: `test/unit/ai-tools.test.ts`, `test/integration/ai-tools.test.mjs`

**Interfaces:**
- Consumes:
  - the tool definitions `browseCollectionsTool`, `searchProductsTool`, `viewProductTool`, `findBoutiquesTool` (Task 9), `pendingConfirmationsTool` (Task 11), `appointmentRequestsTool`, `confirmAppointmentTool` (Task 11b)
  - `getConfig` (Task 5), `ErrorCode` (Task 2), `fakeStrapi` (Task 7)
- Produces:
  - service `ai-tools` with `getTools(): ChatTool[]` and `getMeta(): { label: 'Maison'; description: string }`
  - `interface ChatTool { name; description; schema: z.ZodObject; action: string; execute(args: unknown): Promise<unknown> }`. `execute` resolves to the tool's `structuredContent`, or to `{ error: { code, message, hint } }`.
  - `CHAT_TOOLS`, the six MCP definitions the chat offers
  - `describeIssues(error: z.ZodError): string` in `server/src/mcp/schemas.ts`

**The contract, as 1.6.0 implements it.** This comes from its `docs/extending.md` and was confirmed in `dist/server`:
- **Discovery.** On each chat request it looks at every installed plugin and calls `strapi.plugin(name).service('ai-tools').getTools()`. It skips any tool without `name`, `schema` or an `execute` function.
- **Actions.** A tool's `action` must be an admin action that `admin::permission`'s `actionProvider` knows. Otherwise the tool is skipped, with only a warning in the log. The integration test checks every chat tool's action against the real registry.
- **Names and gating.** Tools appear to the model as `maison__<name>`, with the description prefixed by `[Maison]` from `getMeta().label`. Each tool is offered only if the signed-in admin's ability `can(action)`.
- **Calls.** `@tanstack/ai` validates the model's arguments with the tool's `schema` and then calls `execute(args, strapi, {})`. It passes no admin user and no ability.

**Zod.** `@tanstack/ai` 0.52 turns a tool's `schema` into JSON Schema through the Standard JSON Schema interface, calling `schema['~standard'].jsonSchema.input({ target: 'draft-07' })`, and validates arguments with `~standard.validate`. zod 4.2 and later provide both. Maison's schemas come from `@strapi/utils`, which is zod 4.4.3 in Strapi 5.55.1, and the chat plugin builds its own tools with the same `z` (`@strapi/utils` is its peer dependency). A zod 3 schema has no `jsonSchema` and would reach the model broken. A unit test checks the conversion for every chat tool.

**The handler context.** Strapi calls `createHandler(strapi, context)` with the token's ability and user. No Maison handler reads it: every `createHandler` takes only `strapi`, and no schema resolver uses its argument. The chat has no context to give, so the adapter passes a placeholder, and a unit test fails if a chat tool's handler starts declaring the parameter.

**What the chat gets:**
- **Offered:** `browse_collections`, `search_products`, `view_product` and `find_boutiques` (`catalog.read`); `appointment_requests` (`appointments.review`); and `confirm_appointment` (`appointments.confirm`).
- **Not offered:** `request_appointment` and `my_appointments` act for a signed-in LINE customer, and an admin chat has an admin instead, so they would only answer `not_signed_in`. `record_confirmation` records the outcome of a LINE push, which only the ops agent makes. `pending_confirmations` stays on MCP for the ops agent only: its result carries each customer's full LINE user id, which the chat has no use for. Staff see "LINE sent" per appointment, masked, through `appointment_requests`.
- **Errors.** An expected failure comes back as a value, `{ error: { code, message, hint } }`, so the model reads the hint and recovers. That matches what MCP clients see. Arguments that fail the schema return `invalid_input`, and the handler never runs.
- **Disabled tools.** `disabledTools` applies here too, so a tool disabled for MCP is also missing from the chat.

- [ ] **Step 1: Write the failing unit test `test/unit/ai-tools.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import aiToolsService, { CHAT_TOOLS } from '../../server/src/services/ai-tools';
import { fakeStrapi } from './fake-strapi';

const chatTools = (services: Record<string, unknown> = {}, config: Record<string, unknown> = {}) =>
  aiToolsService({ strapi: fakeStrapi({ services, config }) }).getTools();
const toolNamed = (tools: any[], name: string) => tools.find((tool) => tool.name === name);

describe('ai-tools for the in-admin chat', () => {
  it('offers the catalog, staff and pending-confirmation tools, each gated by its MCP permission', () => {
    expect(chatTools().map((tool) => [tool.name, tool.action])).toEqual([
      ['browse_collections', 'plugin::maison.catalog.read'],
      ['search_products', 'plugin::maison.catalog.read'],
      ['view_product', 'plugin::maison.catalog.read'],
      ['find_boutiques', 'plugin::maison.catalog.read'],
      ['appointment_requests', 'plugin::maison.appointments.review'],
      ['confirm_appointment', 'plugin::maison.appointments.confirm'],
    ]);
  });

  it('never offers the customer tools or record_confirmation', () => {
    const names = chatTools().map((tool) => tool.name);
    for (const name of ['request_appointment', 'my_appointments', 'record_confirmation']) expect(names).not.toContain(name);
  });

  it('uses the MCP descriptions, with schemas @tanstack/ai can turn into JSON Schema', () => {
    for (const tool of chatTools()) {
      expect(tool.description).toBe(CHAT_TOOLS.find((mcpTool) => mcpTool.name === tool.name)?.description);
      // @tanstack/ai reads zod 4's Standard JSON Schema; a zod 3 schema has none and would reach the model broken.
      const jsonSchema = (tool.schema as any)['~standard'].jsonSchema.input({ target: 'draft-07' });
      expect(jsonSchema.type, tool.name).toBe('object');
    }
  });

  it('leaves out tools listed in disabledTools, as MCP registration does', () => {
    const names = chatTools({}, { disabledTools: ['confirm_appointment'] }).map((tool) => tool.name);
    expect(names).not.toContain('confirm_appointment');
    expect(names).toContain('appointment_requests');
  });

  it('runs the MCP handler and returns its structured result', async () => {
    const searchProducts = vi.fn(async () => ({ total: 0, products: [] }));
    const tool = toolNamed(chatTools({ catalog: { searchProducts } }), 'search_products');
    await expect(tool.execute({ occasion: 'travel', locale: 'en' })).resolves.toEqual({ locale: 'en', total: 0, products: [] });
    expect(searchProducts).toHaveBeenCalledWith('en', { occasion: 'travel', locale: 'en' });
  });

  it('unwraps a tool error into { error } with its code, message and hint', async () => {
    const confirm = vi.fn(async () => ({ ok: false, code: 'in_the_past', message: 'The visit has passed.', hint: 'Ask for a new time.' }));
    const tool = toolNamed(chatTools({ appointments: { confirm } }), 'confirm_appointment');
    await expect(tool.execute({ reference: 'APT-4821' })).resolves.toEqual({
      error: { code: 'in_the_past', message: 'The visit has passed.', hint: 'Ask for a new time.' },
    });
  });

  it('answers invalid arguments with invalid_input and never calls the service', async () => {
    const confirm = vi.fn();
    const tool = toolNamed(chatTools({ appointments: { confirm } }), 'confirm_appointment');
    const result = await tool.execute({ reference: '4821' });
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.message).toBe('reference: Use a reference like APT-4821.');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('wraps only handlers that ignore the MCP handler context, which the chat does not have', () => {
    for (const tool of CHAT_TOOLS) expect(tool.createHandler.length, tool.name).toBe(1);
  });

  it("names Maison in the chat's Tools menu", () => {
    expect(aiToolsService({ strapi: fakeStrapi() }).getMeta()).toEqual({ label: 'Maison', description: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/ai-tools.test.ts`
Expected: FAIL with "Failed to resolve import ../../server/src/services/ai-tools".

- [ ] **Step 3: Add `describeIssues` to `server/src/mcp/schemas.ts`**

Append:

```ts
/** Zod issues on one line, e.g. `reference: Use a reference like APT-4821.` */
export const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.map(String).join('.') || 'input'}: ${issue.message}`).join('; ');
```

- [ ] **Step 4: Implement `server/src/services/ai-tools.ts`**

```ts
import type { Core, Modules } from '@strapi/strapi';
import { z } from '@strapi/utils';

import { getConfig } from '../config';
import type { ErrorCode } from '../domain/tool-result';
import { describeIssues } from '../mcp/schemas';
import { appointmentRequestsTool } from '../mcp/tools/appointment-requests';
import { browseCollectionsTool } from '../mcp/tools/browse-collections';
import { confirmAppointmentTool } from '../mcp/tools/confirm-appointment';
import { findBoutiquesTool } from '../mcp/tools/find-boutiques';
import { searchProductsTool } from '../mcp/tools/search-products';
import { viewProductTool } from '../mcp/tools/view-product';

type HandlerContext = Modules.MCP.McpHandlerContext;

/** The parts of a Maison MCP tool definition that the chat uses. */
interface McpTool {
  name: string;
  description: string;
  auth: { policies: ReadonlyArray<{ action: string }> };
  resolveInputSchema?: (context: HandlerContext) => z.ZodObject<z.ZodRawShape>;
  createHandler: (
    strapi: Core.Strapi,
    context: HandlerContext
  ) => (params: { args: any; extra: Modules.MCP.McpCapabilityHandlerContext }) => Promise<unknown>;
}

/** A tool as strapi-plugin-tanstack-ai 1.6 reads it from a plugin's `ai-tools` service. */
export interface ChatTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** The admin permission the chat checks before it offers the tool to the signed-in admin. */
  action: string;
  execute: (args: unknown) => Promise<unknown>;
}

export interface ChatToolError {
  error: { code: ErrorCode; message: string; hint: string };
}

type HandlerResult = { isError?: boolean; content: Array<{ type: string; text?: string }>; structuredContent?: unknown };

/**
 * What the in-admin chat offers: the catalog reads, the two staff tools and the read-only pending confirmations.
 * request_appointment and my_appointments act for a signed-in LINE customer, and a chat has an admin instead.
 * record_confirmation records a LINE push, which only the ops agent makes.
 */
export const CHAT_TOOLS: McpTool[] = [
  browseCollectionsTool,
  searchProductsTool,
  viewProductTool,
  findBoutiquesTool,
  appointmentRequestsTool,
  confirmAppointmentTool,
];

/**
 * The chat calls execute(args, strapi) with no admin user or ability, and no Maison handler reads the MCP handler
 * context: every createHandler takes only strapi, and the schema resolvers ignore it. A unit test keeps it that way.
 */
const NO_CONTEXT = { userAbility: undefined, user: { id: 0 } } as unknown as HandlerContext;

const invalidInput = (tool: McpTool, error: z.ZodError): ChatToolError => ({
  error: { code: 'invalid_input', message: describeIssues(error), hint: `Call ${tool.name} again with arguments that match its schema.` },
});

/** One MCP tool as a chat tool: the same schema, permission and handler, with the MCP result unwrapped. */
const toChatTool = (strapi: Core.Strapi, tool: McpTool): ChatTool => {
  const schema = tool.resolveInputSchema?.(NO_CONTEXT) ?? z.object({});
  return {
    name: tool.name,
    description: tool.description,
    schema,
    action: tool.auth.policies[0].action,
    async execute(args) {
      const parsed = schema.safeParse(args ?? {});
      if (!parsed.success) return invalidInput(tool, parsed.error);
      const result = (await tool.createHandler(strapi, NO_CONTEXT)({ args: parsed.data, extra: {} })) as HandlerResult;
      if (result.isError) return JSON.parse(result.content[0].text) as ChatToolError;
      return result.structuredContent;
    },
  };
};

/** Tools for strapi-plugin-tanstack-ai's in-admin chat, built from the MCP tool definitions so the two can't drift. */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  getTools(): ChatTool[] {
    const disabled = new Set<string>(getConfig(strapi).disabledTools);
    return CHAT_TOOLS.filter((tool) => !disabled.has(tool.name)).map((tool) => toChatTool(strapi, tool));
  },

  getMeta() {
    return { label: 'Maison', description: 'Catalog, boutiques and appointment requests of the Maison house' };
  },
});
```

Register it in `server/src/services/index.ts` under the name the chat looks for:

```ts
import aiTools from './ai-tools';
import appointments from './appointments';
import catalog from './catalog';
import confirmations from './confirmations';
import errors from './errors';
import identity from './identity';
import seed from './seed';

export default {
  'ai-tools': aiTools,
  appointments,
  catalog,
  confirmations,
  errors,
  identity,
  seed,
};
```

- [ ] **Step 5: Run the unit tests and type checks**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 6: Write `test/integration/ai-tools.test.mjs`**

`confirm_appointment` uses the real clock through `execute`, so the appointment is years ahead.

```js
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi } from './harness.mjs';

describe('ai-tools for the in-admin chat', () => {
  let strapi;
  let tools;
  let reference;
  const tool = (name) => tools.find((candidate) => candidate.name === name);

  before(async () => {
    strapi = await bootStrapi('ai-tools');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    // confirm_appointment uses the real clock, so the visit is years ahead.
    const requested = await strapi.plugin('maison').service('appointments').request({
      subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: '2030-01-12T14:00:00+09:00', createdVia: 'concierge',
    });
    reference = requested.value.reference;
    // The same lookup strapi-plugin-tanstack-ai makes for every installed plugin.
    tools = strapi.plugin('maison').service('ai-tools').getTools();
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('declares only permission actions that Strapi has registered', () => {
    // The chat skips a tool whose action isn't registered, without an error.
    const { actionProvider } = strapi.service('admin::permission');
    for (const { name, action } of tools) assert.ok(actionProvider.get(action), `${name} needs ${action}`);
  });

  it('answers the demo question through search_products', async () => {
    const result = await tool('search_products').execute({ occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', locale: 'en' }, strapi);
    assert.deepEqual(result.products.map((p) => p.slug), ['weekender-50', 'garment-carrier', 'watch-roll-trois', 'passport-cover', 'luggage-tag-duo']);
    assert.equal(result.products[0].name, 'Weekender 50');
  });

  it('confirms a request through confirm_appointment, once', async () => {
    const first = await tool('confirm_appointment').execute({ reference }, strapi);
    assert.equal(first.alreadyConfirmed, false);
    assert.equal(first.appointment.reference, reference);
    assert.equal(first.appointment.status, 'confirmed');
    assert.equal(first.appointment.customer, 'line:Uaaa…aa');
    assert.equal(await strapi.documents('plugin::maison.appointment').count({ status: 'published', filters: { reference } }), 1);

    const again = await tool('confirm_appointment').execute({ reference }, strapi);
    assert.equal(again.alreadyConfirmed, true);
  });

  it('returns expected failures as { error } for the model to read', async () => {
    const result = await tool('confirm_appointment').execute({ reference: 'APT-0000' }, strapi);
    assert.equal(result.error.code, 'not_found');
    assert.match(result.error.hint, /appointment_requests/);
  });
});
```

- [ ] **Step 7: Build, push and run all integration tests**

```bash
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi npm run test:integration
```

Expected: every integration file passes, including the 4 `ai-tools` cases.

- [ ] **Step 8: Commit**

```bash
git add server/src test/unit/ai-tools.test.ts test/integration/ai-tools.test.mjs
git commit -m "feat: offer Maison's tools to the in-admin chat through an ai-tools service"
```

---

### Task 12: Maison admin page: the requests board, its admin routes and the demo data

This replaces the earlier admin page that only loaded and reset the demo. The page now leads with a live board of appointment requests.

**Files:**
- Create: `server/src/controllers/appointments.ts`, `admin/src/permissions.ts`, `admin/src/components/RequestsBoard.tsx`, `admin/src/components/DemoData.tsx`, `admin/src/pages/MaisonPage.tsx`
- Modify: `server/src/routes/index.ts`, `server/src/controllers/index.ts`, `admin/src/index.ts`
- Test: `test/unit/admin-routes.test.ts`

**Interfaces:**
- Consumes:
  - service `appointments.listRequests(filters)` and `appointments.confirm(reference)`, plus `appointmentRequestsInput` and `referenceInput` (Task 11b)
  - `describeIssues` (Task 11c), `ServiceFailure` (Task 10)
  - the `demo` controller and its seed and reset results (Task 8): `{ created, collections, products, boutiques, stockLevels }` and `{ appointments, notifications }`
- Produces:
  - `GET /maison/appointments` (`appointments.review`). The query takes the `appointment_requests` filters, and the response is `{ appointments: StaffAppointmentView[] }`.
  - `POST /maison/appointments/:reference/confirm` (`appointments.confirm`), which returns `{ appointment, alreadyConfirmed }`. `not_found` is a 404; `in_the_past` and bad input are a 400.
  - `POST /maison/demo/seed` and `POST /maison/demo/reset`, unchanged (`demo.manage`)
  - a "Maison" menu entry for admins who hold `appointments.review` or `demo.manage`

**Routes and responses:**
- Plugin admin routes are served at `/<plugin id>/<path>`, not under `/admin`. `useFetchClient` adds the backend URL and the admin session.
- **Errors.** The controller answers a failure with `ctx.notFound` or `ctx.badRequest`. That produces Strapi's error body, `{ data: null, error: { status, name, message, details } }`, with the tools' `code` and `hint` in `details`. `useFetchClient` turns it into a `FetchError` whose message is the server's message, so a notification can show it as is.
- **Query parameters.** The routes validate with the tools' own zod inputs. Query strings arrive as text, so the controller turns `limit` into a number first.

**Permissions in the admin:**
- The menu link and `Page.Protect` both pass when the admin holds any one of their permissions, so `page` lists review and demo management.
- `useRBAC` names each allowed action after the last segment of its UID: `canReview`, `canConfirm` and `canManage`. The page uses those to show or hide the board, the Confirm buttons and the demo data.

**The board:**
- **Refresh.** It loads again every 5 seconds and whenever the demo data changes. A counter ignores answers to older loads, so after a filter switch a slow answer for the old filter can't replace the new one.
- **Errors.** A failed refresh shows inline, not as a notification, so a restarting server doesn't flood the screen.
- **Visit time** is cut from the ISO string, so it's the boutique's own time whatever the browser's time zone.
- **Confirm** appears only on requested rows whose visit is still ahead: the same rule the server applies.

- [ ] **Step 1: Write the failing test `test/unit/admin-routes.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import appointmentsController from '../../server/src/controllers/appointments';
import routes from '../../server/src/routes';
import { fakeStrapi } from './fake-strapi';

/** Enough of a Koa context: Strapi's ctx.badRequest and ctx.notFound set the status and an error body. */
const fakeCtx = (overrides: Record<string, unknown> = {}) => {
  const ctx: any = { query: {}, params: {}, status: 200, body: undefined, ...overrides };
  ctx.badRequest = vi.fn((message: string, details: unknown) => {
    ctx.status = 400;
    ctx.body = { error: { message, details } };
  });
  ctx.notFound = vi.fn((message: string, details: unknown) => {
    ctx.status = 404;
    ctx.body = { error: { message, details } };
  });
  return ctx;
};
const controllerWith = (appointments: Record<string, unknown>) =>
  appointmentsController({ strapi: fakeStrapi({ services: { appointments } }) });

describe('admin routes', () => {
  const gate = (action: string) => ['admin::isAuthenticatedAdmin', { name: 'admin::hasPermissions', config: { actions: [action] } }];
  const policiesOf = (method: string, path: string) =>
    routes.admin.routes.find((route) => route.method === method && route.path === path)?.config.policies;

  it('each require a signed-in admin with the matching Maison permission', () => {
    expect(routes.admin.type).toBe('admin');
    expect(routes.admin.routes).toHaveLength(4);
    expect(policiesOf('GET', '/appointments')).toEqual(gate('plugin::maison.appointments.review'));
    expect(policiesOf('POST', '/appointments/:reference/confirm')).toEqual(gate('plugin::maison.appointments.confirm'));
    expect(policiesOf('POST', '/demo/seed')).toEqual(gate('plugin::maison.demo.manage'));
    expect(policiesOf('POST', '/demo/reset')).toEqual(gate('plugin::maison.demo.manage'));
  });
});

describe('appointments controller', () => {
  it('lists with the filters from the query string', async () => {
    const listRequests = vi.fn(async () => ({ ok: true, value: [] }));
    const ctx = fakeCtx({ query: { status: 'all', limit: '5' } });
    await controllerWith({ listRequests }).list(ctx);
    expect(listRequests).toHaveBeenCalledWith({ status: 'all', limit: 5 });
    expect(ctx.body).toEqual({ appointments: [] });
  });

  it('answers bad filters with 400 invalid_input and never calls the service', async () => {
    const listRequests = vi.fn();
    for (const query of [{ status: 'pending' }, { limit: '0' }, { limit: 'ten' }, { date: '10/10/2026' }]) {
      const ctx = fakeCtx({ query });
      await controllerWith({ listRequests }).list(ctx);
      expect(ctx.status, JSON.stringify(query)).toBe(400);
      expect(ctx.body.error.details.code).toBe('invalid_input');
    }
    expect(listRequests).not.toHaveBeenCalled();
  });

  it('returns the confirmed appointment', async () => {
    const value = { appointment: { reference: 'APT-4821', status: 'confirmed' }, alreadyConfirmed: false };
    const confirm = vi.fn(async () => ({ ok: true, value }));
    const ctx = fakeCtx({ params: { reference: 'APT-4821' } });
    await controllerWith({ confirm }).confirm(ctx);
    expect(confirm).toHaveBeenCalledWith('APT-4821');
    expect(ctx.body).toEqual(value);
  });

  it.each([
    ['not_found', 404],
    ['in_the_past', 400],
  ])('answers %s with %i, the message and the hint', async (code, status) => {
    const confirm = vi.fn(async () => ({ ok: false, code, message: 'Not possible.', hint: 'Try another.' }));
    const ctx = fakeCtx({ params: { reference: 'APT-4821' } });
    await controllerWith({ confirm }).confirm(ctx);
    expect(ctx.status).toBe(status);
    expect(ctx.body.error).toEqual({ message: 'Not possible.', details: { code, hint: 'Try another.' } });
  });

  it('rejects a malformed reference without calling the service', async () => {
    const confirm = vi.fn();
    const ctx = fakeCtx({ params: { reference: 'APT-48' } });
    await controllerWith({ confirm }).confirm(ctx);
    expect(ctx.status).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/admin-routes.test.ts`
Expected: FAIL with "Failed to resolve import ../../server/src/controllers/appointments".

- [ ] **Step 3: Add the admin routes and the controller**

`server/src/routes/index.ts`:

```ts
import { ACTION } from '../constants';

/** Signed-in admins whose role holds `action`. Admin routes are served at /maison/<path>. */
const allow = (action: string) => [
  'admin::isAuthenticatedAdmin',
  { name: 'admin::hasPermissions', config: { actions: [action] } },
];

export default {
  admin: {
    type: 'admin',
    routes: [
      { method: 'GET', path: '/appointments', handler: 'appointments.list', config: { policies: allow(ACTION.appointmentsReview) } },
      {
        method: 'POST',
        path: '/appointments/:reference/confirm',
        handler: 'appointments.confirm',
        config: { policies: allow(ACTION.appointmentsConfirm) },
      },
      { method: 'POST', path: '/demo/seed', handler: 'demo.seed', config: { policies: allow(ACTION.demoManage) } },
      { method: 'POST', path: '/demo/reset', handler: 'demo.reset', config: { policies: allow(ACTION.demoManage) } },
    ],
  },
};
```

`server/src/controllers/appointments.ts`:

```ts
import type { Core } from '@strapi/strapi';

import type { ServiceFailure } from '../domain/service-result';
import { appointmentRequestsInput, describeIssues, referenceInput } from '../mcp/schemas';

/** Query strings are text, so a limit arrives as "20". */
const filtersFrom = (query: Record<string, unknown> = {}) =>
  query.limit === undefined ? query : { ...query, limit: Number(query.limit) };

/** The tools' codes and hints in Strapi's error body: 404 for not_found, 400 for the rest. */
const fail = (ctx, { code, message, hint }: ServiceFailure) =>
  code === 'not_found' ? ctx.notFound(message, { code, hint }) : ctx.badRequest(message, { code, hint });

/** The requests board in the admin. Same service, same filters and same answers as the staff MCP tools. */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async list(ctx) {
    const filters = appointmentRequestsInput.safeParse(filtersFrom(ctx.query));
    if (!filters.success) {
      return ctx.badRequest(describeIssues(filters.error), { code: 'invalid_input', hint: 'Fix the filters and try again.' });
    }
    const result = await strapi.plugin('maison').service('appointments').listRequests(filters.data);
    if (!result.ok) return fail(ctx, result);
    ctx.body = { appointments: result.value };
  },

  async confirm(ctx) {
    const reference = referenceInput.safeParse(ctx.params.reference);
    if (!reference.success) {
      return ctx.badRequest(describeIssues(reference.error), { code: 'invalid_input', hint: 'Use a reference like APT-4821.' });
    }
    const result = await strapi.plugin('maison').service('appointments').confirm(reference.data);
    if (!result.ok) return fail(ctx, result);
    ctx.body = result.value;
  },
});
```

`server/src/controllers/index.ts`:

```ts
import appointments from './appointments';
import demo from './demo';

export default { appointments, demo };
```

- [ ] **Step 4: Run the unit tests and type checks**

Run: `npx vitest run && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 5: Create `admin/src/permissions.ts`**

```ts
const REVIEW = { action: 'plugin::maison.appointments.review', subject: null };
const CONFIRM = { action: 'plugin::maison.appointments.confirm', subject: null };
const MANAGE = { action: 'plugin::maison.demo.manage', subject: null };

export const PERMISSIONS = {
  /** The menu entry and the page: staff who review requests, or who manage the demo data. Either one is enough. */
  page: [REVIEW, MANAGE],
  /** Checked with useRBAC, which answers canReview, canConfirm and canManage. */
  sections: [REVIEW, CONFIRM, MANAGE],
};
```

- [ ] **Step 6: Create the requests board `admin/src/components/RequestsBoard.tsx`**

```tsx
import * as React from 'react';

import {
  Badge,
  Box,
  Button,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

type Status = 'requested' | 'confirmed' | 'all';

/** One row of GET /maison/appointments (StaffAppointmentView on the server). */
interface StaffAppointment {
  reference: string;
  status: 'requested' | 'confirmed';
  customer: string;
  boutique: { slug: string; name: string } | null;
  requestedFor: string;
  products: Array<{ slug: string; name: string }>;
  note: string;
  createdVia: 'concierge' | 'app';
  confirmationSent: boolean;
  createdAt: string;
}

const REFRESH_MS = 5000;
const STATUS_LABELS: Record<Status, string> = { requested: 'Waiting for staff', confirmed: 'Confirmed', all: 'All requests' };
const EMPTY: Record<Status, string> = {
  requested: 'No requests are waiting for staff.',
  confirmed: 'No confirmed requests yet.',
  all: 'No requests yet.',
};

/** "2026-10-10T14:00:00+09:00" → "2026-10-10 14:00": the boutique's own time, whatever the browser's time zone. */
const visitTime = (iso: string) => iso.slice(0, 16).replace('T', ' ');
const canStillConfirm = (appointment: StaffAppointment) =>
  appointment.status === 'requested' && Date.parse(appointment.requestedFor) > Date.now();

export const RequestsBoard = ({ canConfirm, refreshKey }: { canConfirm: boolean; refreshKey: number }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [status, setStatus] = React.useState<Status>('requested');
  const [appointments, setAppointments] = React.useState<StaffAppointment[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const latestLoad = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++latestLoad.current;
    try {
      const { data } = await get<{ appointments: StaffAppointment[] }>('/maison/appointments', { params: { status } });
      if (id !== latestLoad.current) return; // a newer load, e.g. for another filter, has started
      setAppointments(data.appointments);
      setLoadError(null);
    } catch (error) {
      if (id === latestLoad.current) setLoadError((error as Error).message);
    }
  }, [get, status]);

  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, refreshKey]);

  const confirm = async (reference: string) => {
    setConfirming(reference);
    try {
      await post(`/maison/appointments/${reference}/confirm`);
      toggleNotification({ type: 'success', message: `Confirmed ${reference}. The LINE ops agent sends the customer's confirmation.` });
      await load();
    } catch (error) {
      toggleNotification({ type: 'danger', message: (error as Error).message });
    } finally {
      setConfirming(null);
    }
  };

  const columns = ['Reference', 'Customer', 'Boutique', 'Visit', 'Products', 'Status', 'LINE', 'Created via', ...(canConfirm ? [''] : [])];

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Flex justifyContent="space-between" alignItems="flex-end" gap={4}>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Typography variant="delta" tag="h2">
            Appointment requests
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            Refreshes every {REFRESH_MS / 1000} seconds. {loadError ? `Last refresh failed: ${loadError}` : ''}
          </Typography>
        </Flex>
        <Box width="20rem">
          <SingleSelect aria-label="Status" size="S" value={status} onChange={(value) => setStatus(value as Status)}>
            {(Object.keys(STATUS_LABELS) as Status[]).map((key) => (
              <SingleSelectOption key={key} value={key}>
                {STATUS_LABELS[key]}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
      </Flex>

      {appointments === null ? (
        <Typography textColor="neutral600">Loading requests…</Typography>
      ) : appointments.length === 0 ? (
        <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
          <Typography textColor="neutral600">{EMPTY[status]}</Typography>
        </Box>
      ) : (
        <Table colCount={columns.length} rowCount={appointments.length + 1}>
          <Thead>
            <Tr>
              {columns.map((column) => (
                <Th key={column}>
                  <Typography variant="sigma">{column}</Typography>
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {appointments.map((appointment) => (
              <Tr key={appointment.reference}>
                <Td>
                  <Typography fontWeight="bold">{appointment.reference}</Typography>
                </Td>
                <Td>
                  <Typography>{appointment.customer}</Typography>
                </Td>
                <Td>
                  <Typography>{appointment.boutique?.name ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography>{visitTime(appointment.requestedFor)}</Typography>
                </Td>
                <Td>
                  <Typography>{appointment.products.map((product) => product.name).join(', ') || '—'}</Typography>
                </Td>
                <Td>
                  <Badge variant={appointment.status === 'confirmed' ? 'success' : 'warning'}>{appointment.status}</Badge>
                </Td>
                <Td>
                  <Badge variant={appointment.confirmationSent ? 'success' : 'neutral'}>
                    {appointment.confirmationSent ? 'LINE sent' : 'not sent'}
                  </Badge>
                </Td>
                <Td>
                  <Typography>{appointment.createdVia}</Typography>
                </Td>
                {canConfirm && (
                  <Td>
                    {canStillConfirm(appointment) && (
                      <Button
                        size="S"
                        loading={confirming === appointment.reference}
                        disabled={confirming !== null}
                        onClick={() => confirm(appointment.reference)}
                      >
                        Confirm
                      </Button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Flex>
  );
};
```

- [ ] **Step 7: Create the demo data section `admin/src/components/DemoData.tsx`**

```tsx
import { useState } from 'react';

import { Box, Button, Flex, Typography } from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

type SeedResult = { created: boolean; collections: number; products: number; boutiques: number; stockLevels: number };
type ResetResult = { appointments: number; notifications: number };
type Action = 'seed' | 'reset';

const describeSeed = (result: SeedResult) =>
  result.created
    ? `Loaded ${result.products} products, ${result.collections} collections, ${result.boutiques} boutiques and ${result.stockLevels} stock levels.`
    : 'The demo catalog is already loaded.';

const describeReset = (result: ResetResult) => `Deleted ${result.appointments} appointments and ${result.notifications} notifications.`;

/** Load the catalog, or clear appointments between rehearsals. `onChange` lets the board refresh at once. */
export const DemoData = ({ onChange }: { onChange: () => void }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [running, setRunning] = useState<Action | null>(null);

  const run = async <T,>(action: Action, describe: (result: T) => string) => {
    setRunning(action);
    try {
      const { data } = await post<T>(`/maison/demo/${action}`);
      toggleNotification({ type: 'success', message: describe(data) });
      onChange();
    } catch (error) {
      toggleNotification({ type: 'danger', message: `That didn't work: ${(error as Error).message}` });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
      <Flex direction="column" alignItems="flex-start" gap={3}>
        <Typography variant="delta" tag="h2">
          Demo data
        </Typography>
        <Typography variant="omega" textColor="neutral600">
          Load demo catalog creates 3 collections, 12 products and 3 boutiques in Japanese and English, publishes them and sets
          stock; if they are there already, nothing changes. Reset deletes every appointment and delivery record and keeps the
          catalog.
        </Typography>
        <Flex gap={2}>
          <Button loading={running === 'seed'} disabled={running !== null} onClick={() => run<SeedResult>('seed', describeSeed)}>
            Load demo catalog
          </Button>
          <Button
            variant="danger-light"
            loading={running === 'reset'}
            disabled={running !== null}
            onClick={() => run<ResetResult>('reset', describeReset)}
          >
            Reset demo appointments
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};
```

- [ ] **Step 8: Create the page `admin/src/pages/MaisonPage.tsx`**

```tsx
import { useState } from 'react';

import { Flex } from '@strapi/design-system';
import { Layouts, Page, useRBAC } from '@strapi/strapi/admin';

import { DemoData } from '../components/DemoData';
import { RequestsBoard } from '../components/RequestsBoard';
import { PERMISSIONS } from '../permissions';

const MaisonPage = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.sections);
  const [refreshKey, setRefreshKey] = useState(0);

  if (isLoading) return <Page.Loading />;

  return (
    <Page.Main>
      <Page.Title>Maison</Page.Title>
      <Layouts.Header title="Maison" subtitle="Boutique appointment requests from the app and the concierge, as they arrive." />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={8}>
          {allowedActions.canReview && <RequestsBoard canConfirm={allowedActions.canConfirm} refreshKey={refreshKey} />}
          {allowedActions.canManage && <DemoData onChange={() => setRefreshKey((key) => key + 1)} />}
        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
};

const ProtectedMaisonPage = () => (
  <Page.Protect permissions={PERMISSIONS.page}>
    <MaisonPage />
  </Page.Protect>
);

export default ProtectedMaisonPage;
```

- [ ] **Step 9: Add the menu link in `admin/src/index.ts`**

```ts
import { Crown } from '@strapi/icons';
import type { StrapiApp } from '@strapi/strapi/admin';

import { PERMISSIONS } from './permissions';
import { PLUGIN_ID } from './pluginId';

export default {
  register(app: StrapiApp) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: Crown,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'Maison' },
      Component: () => import('./pages/MaisonPage'),
      permissions: PERMISSIONS.page,
    });

    app.registerPlugin({ id: PLUGIN_ID, name: 'Maison' });
  },
};
```

- [ ] **Step 10: Type-check, build and verify**

```bash
npm run test:ts:front && npm run build && npm run verify
```

Expected: tsc exits 0, the build prints `Build complete!`, and `verify` passes.

- [ ] **Step 11: Commit**

```bash
git add server/src/routes server/src/controllers admin/src test/unit/admin-routes.test.ts
git commit -m "feat: add the Maison requests board and its admin routes"
```

- [ ] **Step 12: Check it in LaunchPad's admin (controller only)**

The controller runs this step after the implementer's commit. The implementer never restarts the dev server.

```bash
cd /Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp
npm run link
kill $(lsof -tiTCP:1338 -sTCP:LISTEN) 2>/dev/null; cd /Users/paul/work/launchpad-fork-latest/strapi && PORT=1338 CLIENT_URL=http://localhost:3001 nohup yarn develop > .tmp/maison-dev.log 2>&1 &
```

When `curl -s -o /dev/null -w '%{http_code}' http://localhost:1338/_health` prints `204`, check that `curl -s -o /dev/null -w '%{http_code}' http://localhost:1338/maison/appointments` prints `401`. Then open `http://localhost:1338/admin` and sign in as the local test admin. The credentials are `LOCAL_TEST_ADMIN_EMAIL` and `LOCAL_TEST_ADMIN_PASSWORD` in `strapi/.env`; never print or commit them.

Expected:
1. **"Maison" appears in the main menu** with a crown icon. The page shows "Appointment requests" above "Demo data".
2. **"Load demo catalog"** shows a success notice, "Loaded 12 products, 3 collections, 3 boutiques and 36 stock levels.", the first time. It shows "already loaded" the second time.
3. **A new request appears without a reload.** In the Content Manager, create a "Maison appointment" and save it without publishing:
   - a reference not in use, e.g. `APT-7001`
   - customer `line:U` followed by 32 lowercase hex characters
   - boutique Ginza, one product, and a visit tomorrow at 14:00

   Within 5 seconds the board lists it under "Waiting for staff". The customer is masked (`line:U`, three characters, `…`, two), with a "requested" badge, "not sent" and `app`.
4. **Confirm** shows "Confirmed APT-7001. The LINE ops agent sends the customer's confirmation." The row leaves "Waiting for staff". Under "Confirmed" it has a "confirmed" badge, and the Content Manager shows it as Published.
5. **"Reset demo appointments"** shows "Deleted 1 appointments and 0 notifications.", and the board is empty at once.

---

### Task 13: MCP smoke tests, README and pull request

These tests call `/mcp` on the running LaunchPad dev server over HTTP, the way Claude Desktop or the app will, with three tokens:
- **Customer token:** a plain admin token with no LINE session, so customer tools must answer `not_signed_in`. The signed-in path is tested end to end in the LaunchPad plan, once oauth-mcp-manager 1.1 is installed.
- **Staff token:** holds `catalog.read`, `appointments.review` and `appointments.confirm`.
- **Ops token:** holds `confirmations.send`.

The dev server is `http://localhost:1338`.

**Files:**
- Create: `scripts/mcp-dev-tokens.mjs`, `test/mcp/tools.test.mjs`
- Modify: `package.json` (devDependency `@modelcontextprotocol/sdk`), `.gitignore`, `README.md` (rewrite)

**Interfaces:**
- Consumes: everything above, running in LaunchPad's Strapi on port 1338
- Produces: `test/mcp/.tokens.json` (gitignored), with a `customer`, a `staff` and an `ops` admin token

- [ ] **Step 1: Add the MCP client and ignore the token file**

```bash
npm install --save-dev @modelcontextprotocol/sdk@^1.31.0
printf '\n# MCP smoke-test tokens (scripts/mcp-dev-tokens.mjs)\ntest/mcp/.tokens.json\n' >> .gitignore
```

- [ ] **Step 2: Write `scripts/mcp-dev-tokens.mjs`**

```js
// Loads the demo catalog on a running Strapi and creates three admin API tokens for the MCP smoke tests.
// Tokens are written to test/mcp/.tokens.json (gitignored) and never printed.
// Usage: node --env-file=<strapi app>/.env scripts/mcp-dev-tokens.mjs
import { writeFileSync } from 'node:fs';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1338';
const email = process.env.ADMIN_EMAIL ?? process.env.LOCAL_TEST_ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD ?? process.env.LOCAL_TEST_ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (or LOCAL_TEST_ADMIN_EMAIL and LOCAL_TEST_ADMIN_PASSWORD) for an admin of that Strapi.');
}

const post = async (path, body, jwt) => {
  const response = await fetch(new URL(path, STRAPI_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`POST ${path} failed with ${response.status}: ${JSON.stringify(json.error ?? json)}`);
  return json.data ?? json;
};

const { token: jwt } = await post('/admin/login', { email, password });
const seeded = await post('/maison/demo/seed', {}, jwt);
console.log(seeded.created ? 'Loaded the demo catalog.' : 'Demo catalog already loaded.');

const stamp = Date.now();
const mint = async (name, actions) => {
  const token = await post(
    '/admin/admin-tokens',
    {
      name: `${name}-${stamp}`,
      description: 'Maison MCP smoke tests',
      lifespan: null,
      adminPermissions: actions.map((action) => ({ action, subject: null, properties: {}, conditions: [] })),
    },
    jwt
  );
  return token.accessKey;
};

const tokens = {
  customer: await mint('maison-customer', ['plugin::maison.catalog.read', 'plugin::maison.appointments.request']),
  staff: await mint('maison-staff', [
    'plugin::maison.catalog.read',
    'plugin::maison.appointments.review',
    'plugin::maison.appointments.confirm',
  ]),
  ops: await mint('maison-ops', ['plugin::maison.confirmations.send']),
};
writeFileSync(new URL('../test/mcp/.tokens.json', import.meta.url), `${JSON.stringify(tokens, null, 2)}\n`);
console.log('Saved a customer, a staff and an ops token to test/mcp/.tokens.json.');
```

- [ ] **Step 3: Write `test/mcp/tools.test.mjs`**

`toolNames` sorts, so each expected list is in alphabetical order.

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1338';
const tokens = JSON.parse(readFileSync(new URL('./.tokens.json', import.meta.url), 'utf8'));

const connect = async (token) => {
  const client = new Client({ name: 'maison-smoke-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', STRAPI_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
};
const toolNames = async (client) =>
  (await client.listTools()).tools.map((tool) => tool.name).filter((name) => name !== 'log').sort(); // log exists in development only
const promptNames = async (client) => ((await client.listPrompts().catch(() => ({ prompts: [] }))).prompts).map((prompt) => prompt.name);
const errorOf = (result) => JSON.parse(result.content[0].text).error;
const STAFF_TOOLS = ['appointment_requests', 'confirm_appointment'];

describe('Maison over /mcp', () => {
  let customer;
  let staff;
  let ops;

  before(async () => {
    customer = await connect(tokens.customer);
    staff = await connect(tokens.staff);
    ops = await connect(tokens.ops);
  });

  after(async () => {
    await customer?.close();
    await staff?.close();
    await ops?.close();
  });

  it('shows each token only the tools its permissions allow', async () => {
    assert.deepEqual(await toolNames(customer), [
      'browse_collections', 'find_boutiques', 'my_appointments', 'request_appointment', 'search_products', 'view_product',
    ]);
    assert.deepEqual(await toolNames(staff), [
      'appointment_requests', 'browse_collections', 'confirm_appointment', 'find_boutiques', 'search_products', 'view_product',
    ]);
    assert.deepEqual(await toolNames(ops), ['pending_confirmations', 'record_confirmation']);
  });

  it('keeps the staff tools away from the customer token', async () => {
    const names = await toolNames(customer);
    for (const name of STAFF_TOOLS) assert.ok(!names.includes(name), `${name} is hidden`);
    // Depending on the SDK version, a hidden tool is a protocol error or an isError result. Either way it doesn't run.
    const refused = await customer.callTool({ name: 'appointment_requests', arguments: {} }).then((result) => result.isError === true, () => true);
    assert.ok(refused, 'the customer token cannot call appointment_requests');
  });

  it('shows the ops prompt only to the ops token', async () => {
    assert.ok((await promptNames(ops)).includes('send_pending_confirmations'));
    assert.ok(!(await promptNames(customer)).includes('send_pending_confirmations'));
    assert.ok(!(await promptNames(staff)).includes('send_pending_confirmations'));
  });

  it('answers the demo question through the catalog tools', async () => {
    const result = await customer.callTool({
      name: 'search_products',
      arguments: { occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', locale: 'en' },
    });
    assert.ok(!result.isError);
    assert.deepEqual(result.structuredContent.products.map((p) => p.slug), [
      'weekender-50', 'garment-carrier', 'watch-roll-trois', 'passport-cover', 'luggage-tag-duo',
    ]);
  });

  it('returns not_found with a hint for an unknown product', async () => {
    const result = await customer.callTool({ name: 'view_product', arguments: { slug: 'no-such-piece' } });
    assert.equal(result.isError, true);
    assert.equal(errorOf(result).code, 'not_found');
    assert.match(errorOf(result).hint, /search_products/);
  });

  it('never lets a plain admin token act as a customer', async () => {
    const booking = await customer.callTool({
      name: 'request_appointment',
      arguments: { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: '2030-01-12T14:00:00+09:00' },
    });
    assert.equal(errorOf(booking).code, 'not_signed_in');
    const mine = await customer.callTool({ name: 'my_appointments', arguments: {} });
    assert.equal(errorOf(mine).code, 'not_signed_in');
  });

  it('lets the staff token review requests with customers masked, and refuses unknown references', async () => {
    const requests = await staff.callTool({ name: 'appointment_requests', arguments: { status: 'all' } });
    assert.ok(!requests.isError, JSON.stringify(requests.content));
    assert.ok(Array.isArray(requests.structuredContent.appointments));
    for (const appointment of requests.structuredContent.appointments) {
      assert.match(appointment.customer, /^(line:U[0-9a-f]{3}…[0-9a-f]{2}|unknown)$/);
    }
    const unknown = await staff.callTool({ name: 'confirm_appointment', arguments: { reference: 'APT-0000' } });
    assert.equal(errorOf(unknown).code, 'not_found');
  });

  it('lets the ops token list and record, and refuses unknown references', async () => {
    const pending = await ops.callTool({ name: 'pending_confirmations', arguments: {} });
    assert.ok(!pending.isError, JSON.stringify(pending.content));
    assert.ok(Array.isArray(pending.structuredContent.appointments));
    const unknown = await ops.callTool({ name: 'record_confirmation', arguments: { reference: 'APT-0000', status: 'sent', detail: 'smoke test' } });
    assert.equal(errorOf(unknown).code, 'not_found');
  });
});
```

- [ ] **Step 4: Rewrite `README.md`**

````markdown
# Maison: a luxury house's catalog over Strapi MCP

A Strapi 5 plugin that shows one content model serving people and AI agents. It adds a fictional luxury house, "Maison": collections, products, boutiques and stock. Signed-in customers can request boutique visits, and staff review and confirm them.

- **Ten MCP tools and one MCP prompt** on Strapi's `/mcp`, each gated by a permission you grant per token
- **The same tools in the admin's AI chat**, through [strapi-plugin-tanstack-ai](https://github.com/PaulBratslavsky/strapi-plugin-tanstack-ai) 1.6
- **A human gate:** agents can request appointments, but only staff confirm them
- **Customer identity comes from sign-in, never from the model**, through [strapi-oauth-mcp-manager](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager) 1.1 and LINE
- **A live requests board and demo data** in the admin panel, with content in Japanese and English

Maison is fictional. The plugin uses no real brand's names, products or images.

## Four surfaces, one set of services

| Surface | Who uses it | What decides access |
|---|---|---|
| MCP tools on `/mcp` | The customer app, its AI concierge, an ops agent in Claude Desktop | The admin token's Maison permissions |
| The admin's AI chat | Staff, through strapi-plugin-tanstack-ai | The admin's role, tool by tool |
| The Maison admin page | Staff | The admin's role |
| The Content Manager | Staff | Content Manager permissions |

Every surface calls the same services, so it gets the same answers. Confirming a request is one act wherever it happens: the `confirm_appointment` tool, the board's **Confirm** button and **Publish** in the Content Manager all publish the appointment. None of them messages the customer. An ops agent sends the LINE confirmation afterwards.

## Requirements

- Strapi `^5.55.1`, with the MCP server enabled: `mcp: { enabled: true }` in `config/server.ts`
- The i18n plugin, which is on by default
- For the customer tools, strapi-oauth-mcp-manager 1.1 with LINE sign-in configured. Without it, those tools answer `not_signed_in`.
- For the admin chat, strapi-plugin-tanstack-ai 1.6 with its chat configured. Maison needs no setup for it: the chat finds Maison's tools by itself.

## Install for local development

```bash
git clone https://github.com/PaulBratslavsky/strapi-store-demo-mcp.git
cd strapi-store-demo-mcp
npm install
npm run link          # builds, then publishes to a local yalc store
```

In your Strapi app:

```bash
npx yalc@1.0.0-pre.53 add --link strapi-store-demo-mcp
yarn install          # or npm install
```

```ts
// config/plugins.ts
export default ({ env }) => ({
  maison: {
    enabled: true,
    config: {
      liffUrl: env('MAISON_LIFF_URL', null),
    },
  },
});
```

Restart Strapi. Open **Maison** in the admin menu and choose **Load demo catalog** under **Demo data**.

## Configuration

| Key | Default | Purpose |
|---|---|---|
| `liffUrl` | `null` | Base of the links in LINE confirmations, e.g. `https://liff.line.me/<LIFF ID>`. Use `http://localhost:<port>` for local development. Until it's set, `pending_confirmations` answers `not_configured`. |
| `timezone` | `Asia/Tokyo` | Opening-hours checks, the times in messages, and the day of the `date` filter |
| `defaultLocale` | `ja` | Content language when a tool call doesn't pass `locale` (`ja` or `en`) |
| `maxOpenRequestsPerCustomer` | `3` | Unconfirmed future requests a customer may have |
| `houseName` | `{ ja: 'メゾン', en: 'Maison' }` | Header of the LINE confirmation |
| `disabledTools` | `[]` | Tool names to leave out of MCP and the admin chat |

## Tools

| Tool | Permission | What it does |
|---|---|---|
| `browse_collections` | MCP: browse the catalog | Published collections, with a teaser and product count |
| `search_products` | MCP: browse the catalog | Products by collection, category, gift occasion, price, personalization and boutique stock |
| `view_product` | MCP: browse the catalog | One product: story, dimensions, personalization, stock per boutique |
| `find_boutiques` | MCP: browse the catalog | Boutiques, opening hours, open on a date, stock for chosen products |
| `request_appointment` | MCP: request and view own appointments | Creates a **draft** visit request for the signed-in customer |
| `my_appointments` | MCP: request and view own appointments | The signed-in customer's own requests and confirmations |
| `appointment_requests` | MCP: review appointment requests | Requests for staff, by default the ones still waiting. Customers are masked. |
| `confirm_appointment` | MCP: confirm appointment requests | Confirms a request by publishing it. It sends nothing. |
| `pending_confirmations` | MCP: send appointment confirmations | Confirmed visits not yet sent, each with a ready LINE flex message |
| `record_confirmation` | MCP: send appointment confirmations | Records whether a LINE confirmation was delivered |

The **`send_pending_confirmations` prompt** tells an ops agent how to deliver confirmations with [LINE Bot MCP](https://github.com/line/line-bot-mcp-server). It checks that each customer is reachable (`get_profile`) before pushing, because LINE's push API answers 200 even when it can't deliver. The prompt drives both `pending_confirmations` and `record_confirmation`, so disabling either one in `disabledTools` also drops the prompt.

**Errors don't throw.** They come back as `isError` results whose text is `{"error":{"code","message","hint"}}`. The codes are `not_signed_in`, `not_found`, `invalid_input`, `boutique_closed`, `in_the_past`, `too_many_open_requests`, `not_published` and `not_configured`. The hint says what to do next.

## The admin chat

strapi-plugin-tanstack-ai 1.6 finds Maison's `ai-tools` service and offers six of its tools as `maison__<name>`:
- the four catalog tools
- `appointment_requests` and `confirm_appointment`

Each tool is offered only to admins whose role holds its permission. The customer tools are left out, because a chat has an admin rather than a LINE customer. `record_confirmation` is left out because it only follows a LINE push, and `pending_confirmations` because its result carries customers' full LINE user ids.

## The admin page

**Maison** in the admin menu is shown to admins with "MCP: review appointment requests" or "Load and reset demo data":
- **Appointment requests:** a board that refreshes every 5 seconds. You can filter it to requests waiting for staff, confirmed ones, or all. Admins with "MCP: confirm appointment requests" get a **Confirm** button on requests whose visit is still ahead.
- **Demo data:** **Load demo catalog** and **Reset demo appointments**.

## Tokens

Strapi's `/mcp` only accepts **admin** API tokens. Create them under **Settings → Administration Panel → Admin Tokens** and grant only the Maison permissions a caller needs:
- **Customer token:** "MCP: browse the catalog" and "MCP: request and view own appointments". Map it to the LINE client in oauth-mcp-manager. Every customer session runs with this token's permissions, so keep it narrow.
- **Staff token:** "MCP: browse the catalog", "MCP: review appointment requests" and "MCP: confirm appointment requests", for an agent that works for staff.
- **Ops token:** only "MCP: send appointment confirmations".

The same permissions on an **admin role** decide what staff see in the chat and on the Maison page. "Load and reset demo data" is an ordinary admin role permission.

## Customer identity

A tool never takes the customer as an argument. Customer tools pass the caller's own `Authorization` header to oauth-mcp-manager:

```ts
strapi.plugin('strapi-oauth-mcp-manager').service('oauth').resolveSubject(authorization); // 'line:U…' or null
```

Anything but `line:U` followed by 32 lowercase hex characters counts as not signed in. That includes plain admin tokens, staff sessions, and a missing oauth-mcp-manager. Staff tools and the board show customers masked, as in `line:U4af…88`, and never the full LINE user ID.

## Run the ops agent

Point Claude Desktop at Strapi with the ops token and at LINE Bot MCP with a Messaging API channel access token. Then run the `send_pending_confirmations` prompt. The URL below is LaunchPad's dev server; Strapi's default port is 1337.

```json
{
  "mcpServers": {
    "maison": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:1338/mcp", "--header", "Authorization: Bearer ${MAISON_OPS_TOKEN}"],
      "env": { "MAISON_OPS_TOKEN": "<ops token>" }
    },
    "line-bot": {
      "command": "npx",
      "args": ["-y", "@line/line-bot-mcp-server"],
      "env": { "CHANNEL_ACCESS_TOKEN": "<channel access token>" }
    }
  }
}
```

## Extend it

- **Fields:** extend any Maison content type from your app with `src/extensions/maison/strapi-server.ts`.
- **Your own tools:** register them in your app's `register()`, reusing the plugin's services:
  - `strapi.plugin('maison').service('identity').getCustomerSubject(extra)` for the signed-in customer
  - `service('errors').toolError(code, message, hint)` for errors in the same shape
  - `service('catalog')` and `service('appointments')` for the same logic the tools use, including `listRequests` and `confirm`
- **Fewer tools:** list them in `disabledTools`.

## Development

```bash
npm test                    # unit tests (vitest)
npm run test:ts:back        # type-check the server
npm run test:ts:front       # type-check the admin
STRAPI_APP_DIR=/path/to/strapi-app npm run test:integration   # boots that app against throwaway SQLite files
node --env-file=/path/to/strapi-app/.env scripts/mcp-dev-tokens.mjs && npm run test:mcp   # against a running app
```

The plugin runs from `dist/`, so rebuild (`npm run link`) and restart Strapi after changing it.
````

The repo has no license yet, so the README doesn't name one. Choosing one is the owner's call.

- [ ] **Step 5: Run everything that doesn't need the dev server**

```bash
npx vitest run
npm run test:ts:back && npm run test:ts:front
npm run build && npm run verify
npm run link
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi npm run test:integration
```

Expected: every command passes. Integration tests use their own SQLite files, so they can run while the dev server is up.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore scripts/mcp-dev-tokens.mjs test/mcp/tools.test.mjs README.md
git commit -m "test: add MCP smoke tests and rewrite the README for Maison"
```

- [ ] **Step 7: Run the smoke tests against LaunchPad (controller only)**

The implementer stops after Step 6. The controller restarts the dev server, because the implementer never does.

LaunchPad's dev server needs `MAISON_LIFF_URL` set, or `pending_confirmations` answers `not_configured`. Local development uses the app's local URL. Add it if it's missing, then restart Strapi with the build that Step 5 pushed:

```bash
cd /Users/paul/work/launchpad-fork-latest/strapi
grep -q '^MAISON_LIFF_URL=' .env || echo 'MAISON_LIFF_URL=http://localhost:3003' >> .env
kill $(lsof -tiTCP:1338 -sTCP:LISTEN) 2>/dev/null; PORT=1338 CLIENT_URL=http://localhost:3001 nohup yarn develop > .tmp/maison-dev.log 2>&1 &
```

When `curl -s -o /dev/null -w '%{http_code}' http://localhost:1338/_health` prints `204`:

```bash
cd /Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp
node --env-file=/Users/paul/work/launchpad-fork-latest/strapi/.env scripts/mcp-dev-tokens.mjs
npm run test:mcp
```

Expected: the script prints two lines without any token, and 8 smoke tests pass.

- [ ] **Step 8: Push and open the pull request (controller only)**

```bash
git push -u origin feat/maison-plugin
gh pr create --base main --title "feat: Maison plugin (catalog, appointments and LINE confirmations over Strapi MCP)" --body-file - <<'BODY'
Replaces the store-analytics starting point with the Maison plugin described in `docs/superpowers/specs/2026-09-29-maison-plugin-design.md`.

- Six content types (collection, product, boutique, stock level, appointment, notification) with shared validation for the admin and the tools
- Ten MCP tools and the `send_pending_confirmations` prompt, each gated by a plugin permission
- Staff review and confirmation on four surfaces: the MCP tools, the in-admin chat of strapi-plugin-tanstack-ai (through an `ai-tools` service built from the same tool definitions), a live requests board in the admin, and Publish in the Content Manager
- Customer identity through oauth-mcp-manager's `resolveSubject`; a plain admin token is never treated as a customer, and staff see customers masked
- Bilingual seed data with generated images, and admin buttons to load or reset the demo

Worth knowing:
- The notification's delivery field is `outcome`, because `status` is reserved in Strapi 5. Tool inputs and outputs still say `status`.
- Tools use a local `defineTool` typed with Strapi's builder types, because `@strapi/strapi` can't be imported by vitest.
- `liffUrl` also accepts `http://localhost` for local development.
- `confirm_appointment` only publishes. The LINE confirmation still goes out through the ops agent.

Tests: vitest unit tests; integration tests that boot LaunchPad's Strapi against throwaway SQLite files; MCP smoke tests over HTTP against the running dev server with customer, staff and ops tokens; a contract test of the LINE flex message against LINE Bot MCP 0.5.0's schema.
BODY
```

Expected: `gh` prints the pull request URL.
