# Maison plugin implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this repo into the `maison` Strapi 5 plugin: six content types for a fictional luxury house, eight MCP tools and one MCP prompt on Strapi's built-in `/mcp`, permission actions, seed data, and an admin page to load or reset the demo.

**Architecture:** The plugin separates pure domain logic (`server/src/domain/`, unit-tested with vitest) from Strapi-facing services (`server/src/services/`, which use the Document Service). MCP tools (`server/src/mcp/tools/`) are thin adapters:
- they validate input with zod from `@strapi/utils`
- they resolve the caller's identity by passing the raw `Authorization` header to oauth-mcp-manager's `resolveSubject`
- they call one service method
- they return either a structured result or an `isError` result with a code and hint

Service integration tests boot LaunchPad's Strapi programmatically against a separate SQLite file. MCP smoke tests call `/mcp` on the running LaunchPad dev server with the plugin linked through yalc. The full LINE-session end-to-end test lives in the LaunchPad plan.

**Tech stack:** Strapi 5.55.1, `@strapi/sdk-plugin` 6.1.1, TypeScript, zod 3 (from `@strapi/utils`), vitest, Node's built-in `node:test` for integration scripts, `sharp` for generated seed images.

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
- `request_appointment` creates drafts only. Nothing a token-holder calls can publish.
- No real brand names, product names or photos anywhere, including the seed data.
- Work on a feature branch. A hook blocks commits on `main`.

## Review focus

These are the inputs the spec implies most likely to bite a real user. Each has a test in the task that owns the code.

1. **A UTC `requestedFor` that falls on another day in Tokyo.** For example `2026-10-05T23:30:00Z` is Tuesday 08:30 in Tokyo, when Osaka is closed. It must be judged in Tokyo time (Task 3).
2. **Booking at exactly closing time.** 20:00 at a boutique that closes at 20:00 must be `boutique_closed`, and 19:59 accepted (Task 3).
3. **Identity that isn't clean.** A `resolveSubject` result with uppercase hex or no `line:` prefix, an `Authorization` header that arrives as an array, a plain admin token, or oauth-mcp-manager not being installed must all be treated as not signed in, never as a customer (Tasks 2 and 7).
4. **A product with no English localization.** An `en` read falls back to the `ja` version and reports `locale: "ja"`. It doesn't return `not_found` (Task 9).
5. **Draft-only products leaking.** `search_products` must never return a product that was never published, and `get_product` on it returns `not_found` (Task 9).

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
server/src/domain/subject.ts                   create: identity header parsing
server/src/domain/tool-result.ts               create: success/error result builders
server/src/domain/hours.ts                     create: opening-hours validation and checks
server/src/domain/time.ts                      create: Japanese date formatting
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
server/src/services/appointments.ts            create
server/src/services/confirmations.ts           create
server/src/services/seed.ts                    create
server/src/mcp/index.ts                        rewrite: registers enabled tools + prompt
server/src/mcp/define.ts                       create: typed defineTool / definePrompt
server/src/mcp/common.ts                       create: shared not_signed_in error
server/src/mcp/schemas.ts                      rewrite: shared zod schemas
server/src/mcp/tools/<tool>.ts                 create (8 files)
server/src/mcp/prompts/send-pending-confirmations.ts   create
server/src/routes/index.ts                     rewrite: admin routes for seed/reset
server/src/controllers/index.ts                rewrite
server/src/controllers/demo.ts                 create
server/seed/content.json                       create: bilingual demo content
server/seed/images/*.png                       create: generated placeholder images
server/seed/images/SOURCES.md                  create
scripts/generate-seed-images.mjs               create
admin/src/index.ts                             rewrite
admin/src/pluginId.ts                          create
admin/src/permissions.ts                       rewrite: demo.manage
admin/src/pages/DemoPage.tsx                   create
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
    "test:integration": "node --test --test-concurrency=1 test/integration/",
    "test:mcp": "node --test --test-concurrency=1 test/mcp/",
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
  'get_product',
  'get_boutiques',
  'request_appointment',
  'my_appointments',
  'list_pending_confirmations',
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

Then push the new build and restart the dev server (it runs on port 1340 because 1337 is taken):

```bash
npm run link
# restart LaunchPad's Strapi if it's running:
kill $(lsof -tiTCP:1340 -sTCP:LISTEN) 2>/dev/null; cd /Users/paul/work/launchpad-fork-latest/strapi && PORT=1340 CLIENT_URL=http://localhost:3010 nohup yarn develop > .tmp/maison-dev.log 2>&1 &
```

Expected: `curl -s -o /dev/null -w '%{http_code}' http://localhost:1340/_health` prints `204` within a minute, and the log has no `Error`.

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
      validateConfig({ ...defaultConfig, liffUrl: 'https://liff.line.me/1234567890-AbCdEfGh', disabledTools: ['get_boutiques'] })
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
      "slug": "ecrins",
      "name": { "ja": "エクラン", "en": "Écrins" },
      "story": { "ja": "大切な人へ贈る、小さな宝箱。イニシャルを入れて特別な一品に。", "en": "Small treasure boxes to give. Add initials to make each one personal." },
      "image": "collection-ecrins.png"
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
    { "slug": "watch-roll-trois", "sku": "MSN-EC-WR3", "collection": "ecrins", "category": "objet", "priceJpy": 98000, "dimensionsCm": [26, 9, 9], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel", "anniversary"], "name": { "ja": "ウォッチロール・トロワ", "en": "Watch Roll Trois" }, "description": { "ja": "腕時計 3 本を守る、旅行用のウォッチロール。", "en": "A travel watch roll that protects three watches." }, "craftStory": { "ja": "内側には傷を防ぐスエードを張っています。", "en": "Lined with suede to keep watches from scratching." }, "image": "product-watch-roll-trois.png" },
    { "slug": "jewelry-coffret", "sku": "MSN-EC-JC1", "collection": "ecrins", "category": "objet", "priceJpy": 142000, "dimensionsCm": [22, 16, 9], "personalizable": true, "personalizationKinds": ["monogram-color"], "personalizationLeadDays": 14, "giftOccasions": ["wedding", "anniversary"], "name": { "ja": "ジュエリー・コフレ", "en": "Jewelry Coffret" }, "description": { "ja": "リングやイヤリングを整理できる、二段式のジュエリーボックス。", "en": "A two-tier jewelry box with space for rings and earrings." }, "craftStory": { "ja": "トレイは取り外して、旅先にも持ち出せます。", "en": "The tray lifts out so you can take it travelling." }, "image": "product-jewelry-coffret.png" },
    { "slug": "passport-cover", "sku": "MSN-EC-PC1", "collection": "ecrins", "category": "small-leather", "priceJpy": 64000, "dimensionsCm": [14, 10, 1], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel"], "name": { "ja": "パスポートカバー", "en": "Passport Cover" }, "description": { "ja": "パスポートと搭乗券を一緒に収められるカバー。", "en": "A cover that holds your passport and boarding pass together." }, "craftStory": { "ja": "表面は使い込むほどに艶が増すカーフレザーです。", "en": "Made of calfskin that gains a sheen with use." }, "image": "product-passport-cover.png" },
    { "slug": "luggage-tag-duo", "sku": "MSN-EC-LT2", "collection": "ecrins", "category": "objet", "priceJpy": 38000, "dimensionsCm": [11, 6, 1], "personalizable": true, "personalizationKinds": ["initials-hot-stamp"], "personalizationLeadDays": 3, "giftOccasions": ["travel", "new-job"], "name": { "ja": "ラゲッジタグ・デュオ", "en": "Luggage Tag Duo" }, "description": { "ja": "名前を隠せるフラップ付きのラゲッジタグ 2 個セット。", "en": "A set of two luggage tags with a flap that keeps your name private." }, "craftStory": { "ja": "ベルトの穴は一つずつ手で打ち抜いています。", "en": "Each strap hole is punched by hand." }, "image": "product-luggage-tag-duo.png" }
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
- Create: `server/src/mcp/tools/browse-collections.ts`, `search-products.ts`, `get-product.ts`, `get-boutiques.ts`
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
import { getBoutiquesTool } from '../../server/src/mcp/tools/get-boutiques';
import { getProductTool } from '../../server/src/mcp/tools/get-product';
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

describe('get_product', () => {
  it('returns not_found with a recovery hint for an unknown slug', async () => {
    const result = await run(getProductTool, { getProduct: vi.fn(async () => null) }, { slug: 'nope' });
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
    const result = await run(getProductTool, { getProduct: vi.fn(async () => product) }, { slug: 'weekender-50' });
    expect(result.structuredContent).toEqual({ product });
    expect(() => matchesOutput(getProductTool, result)).not.toThrow();
  });
});

describe('get_boutiques', () => {
  it('returns schema-valid output with openOnDate', async () => {
    const boutique = {
      slug: 'osaka', name: '大阪心斎橋店', city: '大阪', address: '…', hours: [{ weekday: 'mon', opens: '11:00', closes: '20:00' }],
      openOnDate: false, hoursOnDate: null, stock: [{ product: 'weekender-50', quantity: 0 }],
    };
    const getBoutiques = vi.fn(async () => [boutique]);
    const result = await run(getBoutiquesTool, { getBoutiques }, { date: '2026-10-06', productSlugs: ['weekender-50'] });
    expect(getBoutiques).toHaveBeenCalledWith('ja', { date: '2026-10-06', productSlugs: ['weekender-50'] });
    expect(result.structuredContent.date).toBe('2026-10-06');
    expect(() => matchesOutput(getBoutiquesTool, result)).not.toThrow();
  });
});
```

Add this case inside the `describe('registerMcp')` block of `test/unit/register-mcp.test.ts`:

```ts
  it('registers every enabled tool and skips the ones in disabledTools', () => {
    const mcp = fakeMcp(true);
    registerMcp(fakeStrapi({ mcp, config: { disabledTools: ['get_boutiques'] } }));
    const names = mcp.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(names).toEqual(['browse_collections', 'search_products', 'get_product']);
  });
```

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
  inStockAt: slugInput.optional().describe('Boutique slug from get_boutiques: only pieces in stock there now.'),
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

`server/src/mcp/tools/get-product.ts`:

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

export const getProductTool = defineTool({
  name: 'get_product',
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

`server/src/mcp/tools/get-boutiques.ts`:

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

export const getBoutiquesTool = defineTool({
  name: 'get_boutiques',
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
import { getBoutiquesTool } from './tools/get-boutiques';
import { getProductTool } from './tools/get-product';
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
  if (enabled('get_product')) mcp.registerTool(getProductTool);
  if (enabled('get_boutiques')) mcp.registerTool(getBoutiquesTool);
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
    assert.deepEqual(collections.map((c) => c.slug).sort(), ['atelier', 'ecrins', 'voyage']);
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
        return failure('not_found', `No boutique "${input.boutique}".`, 'Call get_boutiques to find valid boutique slugs.');
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
          ? `${boutique.name} is open ${check.entry.opens}–${check.entry.closes} (${timezone}) on ${day}. Suggest a time in that window, or another day; get_boutiques shows hours for a date.`
          : `${boutique.name} is closed all day on ${day}. Suggest another day; get_boutiques shows hours for a date.`;
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
    expect(names).toEqual(['browse_collections', 'search_products', 'get_product', 'request_appointment', 'my_appointments']);
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
  boutique: slugInput.describe('Boutique slug from get_boutiques, e.g. "ginza".'),
  productSlugs: z.array(slugInput).min(1).max(5).describe('One to five product slugs the customer wants to see.'),
  requestedFor: isoDateTimeInput.describe('Visit start, ISO 8601 with a time zone offset, e.g. 2026-10-10T14:00:00+09:00.'),
  note: z.string().max(500).optional().describe("The customer's own words for the boutique, e.g. who the gift is for."),
});

export const requestAppointmentTool = defineTool({
  name: 'request_appointment',
  title: 'Request a boutique appointment',
  description:
    'Requests a boutique visit for the signed-in customer. It creates a request that a boutique must confirm; never tell the customer it is confirmed. Check opening hours with get_boutiques first. The customer comes from their LINE sign-in, never from an argument.',
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

In `server/src/mcp/index.ts`, add the imports and two registration lines after `get_product`:

```ts
import { myAppointmentsTool } from './tools/my-appointments';
import { requestAppointmentTool } from './tools/request-appointment';
```

```ts
  if (enabled('request_appointment')) mcp.registerTool(requestAppointmentTool);
  if (enabled('my_appointments')) mcp.registerTool(myAppointmentsTool);
```

The registration order becomes `browse_collections`, `search_products`, `get_product`, `get_boutiques`, `request_appointment`, `my_appointments`.

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
- Create: `server/src/services/confirmations.ts`, `server/src/mcp/tools/list-pending-confirmations.ts`, `server/src/mcp/tools/record-confirmation.ts`, `server/src/mcp/prompts/send-pending-confirmations.ts`, `test/fixtures/line-flex-message-schema.mjs` (vendored)
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
  - tools `list_pending_confirmations`, `record_confirmation`, and the prompt `send_pending_confirmations`, all gated on `plugin::maison.confirmations.send`

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
import { listPendingConfirmationsTool } from '../../server/src/mcp/tools/list-pending-confirmations';
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

describe('list_pending_confirmations', () => {
  it('defaults the limit to 10 and returns schema-valid output', async () => {
    const listPending = vi.fn(async () => ({ ok: true, value: [pending] }));
    const result = await listPendingConfirmationsTool.createHandler(withConfirmations({ listPending }), context)({ args: {}, extra: {} });
    expect(listPending).toHaveBeenCalledWith(10);
    expect(listPendingConfirmationsTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({ appointments: [pending] });
  });

  it('reports not_configured when the plugin has no liffUrl', async () => {
    const listPending = vi.fn(async () => ({ ok: false, code: 'not_configured', message: 'No liffUrl.', hint: 'Set liffUrl.' }));
    const result = await listPendingConfirmationsTool.createHandler(withConfirmations({ listPending }), context)({ args: { limit: 3 }, extra: {} });
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
    const order = ['list_pending_confirmations', 'get_profile', 'push_flex_message', 'record_confirmation'].map((name) => text.indexOf(name));
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
    registerMcp(fakeStrapi({ mcp, config: { disabledTools: ['get_boutiques'] } }));
    const names = mcp.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(names).toEqual([
      'browse_collections', 'search_products', 'get_product',
      'request_appointment', 'my_appointments', 'list_pending_confirmations', 'record_confirmation',
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
        return failure('not_found', `No appointment ${input.reference}.`, 'Use a reference from list_pending_confirmations.');
      }
      const published = await strapi.documents(UID.appointment).count({
        status: 'published',
        filters: { documentId: { $eq: appointment.documentId } },
      });
      if (published === 0) {
        return failure(
          'not_published',
          `Appointment ${input.reference} has not been confirmed by the boutique.`,
          'Only published appointments get confirmations. Do not message the customer; call list_pending_confirmations for the ones to send.'
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

`server/src/mcp/tools/list-pending-confirmations.ts`:

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

export const listPendingConfirmationsTool = defineTool({
  name: 'list_pending_confirmations',
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

You have two MCP servers: this Strapi server (list_pending_confirmations, record_confirmation) and the LINE Bot MCP server (get_profile, push_flex_message).

1. Call list_pending_confirmations.
2. For each appointment, in order:
   a. Call get_profile with userId set to its lineUserId.
   b. If get_profile fails, do not push. Call record_confirmation with status "failed" and detail "not reachable: not a friend or blocked".
   c. Otherwise call push_flex_message with userId set to lineUserId and message set to the appointment's message, exactly as returned.
   d. If the push succeeded, call record_confirmation with status "sent" and LINE's response as detail. If it failed, call record_confirmation with status "failed" and the error as detail.
3. Report how many confirmations were sent and how many failed, with their references.

Why check first: LINE's push API returns 200 even when a message can't be delivered (the customer isn't a friend of the account, or blocked it). get_profile fails for those customers, so it is the reachability check. Never report a confirmation as sent unless get_profile and push_flex_message both succeeded.
Always pass userId explicitly; LINE Bot MCP otherwise sends to its default user.
If list_pending_confirmations returns not_configured, stop and report its hint.`;

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
import { listPendingConfirmationsTool } from './tools/list-pending-confirmations';
import { recordConfirmationTool } from './tools/record-confirmation';
```

```ts
  if (enabled('list_pending_confirmations')) mcp.registerTool(listPendingConfirmationsTool);
  if (enabled('record_confirmation')) mcp.registerTool(recordConfirmationTool);
  mcp.registerPrompt(sendPendingConfirmationsPrompt);
```

In `server/src/bootstrap.ts`, add `import { getConfig } from './config';` and append to the end of `bootstrap`:

```ts
  if (!getConfig(strapi).liffUrl) {
    strapi.log.warn('[maison] config.liffUrl is not set, so list_pending_confirmations will return not_configured.');
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

### Task 12: Admin page to load and reset the demo

**Files:**
- Create: `admin/src/permissions.ts`, `admin/src/pages/DemoPage.tsx`
- Modify: `admin/src/index.ts`

**Interfaces:**
- Consumes: admin routes `POST /maison/demo/seed` and `POST /maison/demo/reset` (Task 8), which return `{ created, collections, products, boutiques, stockLevels }` and `{ appointments, notifications }`
- Produces: a "Maison" menu entry visible to admins who hold `plugin::maison.demo.manage`

Plugin admin routes are served at `/<plugin id>/<path>`, not under `/admin`. `useFetchClient` adds the backend URL and the admin session.

- [ ] **Step 1: Create `admin/src/permissions.ts`**

```ts
export const PERMISSIONS = {
  manage: [{ action: 'plugin::maison.demo.manage', subject: null }],
};
```

- [ ] **Step 2: Create `admin/src/pages/DemoPage.tsx`**

```tsx
import { useState } from 'react';

import { Box, Button, Flex, Typography } from '@strapi/design-system';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';

import { PERMISSIONS } from '../permissions';

type SeedResult = { created: boolean; collections: number; products: number; boutiques: number; stockLevels: number };
type ResetResult = { appointments: number; notifications: number };
type Action = 'seed' | 'reset';

const describeSeed = (result: SeedResult) =>
  result.created
    ? `Loaded ${result.products} products, ${result.collections} collections, ${result.boutiques} boutiques and ${result.stockLevels} stock levels.`
    : 'The demo catalog is already loaded.';

const describeReset = (result: ResetResult) =>
  `Deleted ${result.appointments} appointments and ${result.notifications} notifications.`;

const DemoCard = ({ title, body, children }: { title: string; body: string; children: React.ReactNode }) => (
  <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
    <Flex direction="column" alignItems="flex-start" gap={3}>
      <Typography variant="delta" textColor="neutral800" fontWeight="bold">
        {title}
      </Typography>
      <Typography variant="omega" textColor="neutral600">
        {body}
      </Typography>
      {children}
    </Flex>
  </Box>
);

const DemoPage = () => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [running, setRunning] = useState<Action | null>(null);

  const run = async <T,>(action: Action, describe: (result: T) => string) => {
    setRunning(action);
    try {
      const { data } = await post<T>(`/maison/demo/${action}`);
      toggleNotification({ type: 'success', message: describe(data) });
    } catch (error) {
      toggleNotification({ type: 'danger', message: `That didn't work: ${(error as Error).message}` });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Page.Main>
      <Page.Title>Maison demo</Page.Title>
      <Layouts.Header title="Maison demo" subtitle="Load the demo catalog, or clear appointments between rehearsals." />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={4}>
          <DemoCard
            title="Load demo catalog"
            body="Creates 3 collections, 12 products and 3 boutiques in Japanese and English, publishes them and sets stock. If the catalog is already there, nothing changes."
          >
            <Button loading={running === 'seed'} disabled={running !== null} onClick={() => run<SeedResult>('seed', describeSeed)}>
              Load demo catalog
            </Button>
          </DemoCard>
          <DemoCard
            title="Reset demo appointments"
            body="Deletes every appointment and delivery record. The catalog stays as it is."
          >
            <Button
              variant="danger-light"
              loading={running === 'reset'}
              disabled={running !== null}
              onClick={() => run<ResetResult>('reset', describeReset)}
            >
              Reset demo appointments
            </Button>
          </DemoCard>
        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
};

const ProtectedDemoPage = () => (
  <Page.Protect permissions={PERMISSIONS.manage}>
    <DemoPage />
  </Page.Protect>
);

export default ProtectedDemoPage;
```

- [ ] **Step 3: Add the menu link in `admin/src/index.ts`**

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
      Component: () => import('./pages/DemoPage'),
      permissions: PERMISSIONS.manage,
    });

    app.registerPlugin({ id: PLUGIN_ID, name: 'Maison' });
  },
};
```

- [ ] **Step 4: Type-check, build and verify**

```bash
npm run test:ts:front && npm run build && npm run verify
```

Expected: tsc exits 0, the build prints `Build complete!`, and `verify` passes.

- [ ] **Step 5: Check it in LaunchPad's admin**

```bash
npm run link
kill $(lsof -tiTCP:1340 -sTCP:LISTEN) 2>/dev/null; cd /Users/paul/work/launchpad-fork-latest/strapi && PORT=1340 CLIENT_URL=http://localhost:3010 nohup yarn develop > .tmp/maison-dev.log 2>&1 &
```

When `curl -s -o /dev/null -w '%{http_code}' http://localhost:1340/_health` prints `204`, open `http://localhost:1340/admin` and sign in as the local test admin. The credentials are `LOCAL_TEST_ADMIN_EMAIL` and `LOCAL_TEST_ADMIN_PASSWORD` in `strapi/.env`; never print or commit them.

Expected:
1. **"Maison" appears in the main menu** with a crown icon.
2. **"Load demo catalog"** shows a success notice, "Loaded 12 products, 3 collections, 3 boutiques and 36 stock levels.", the first time. It shows "already loaded" the second time.
3. **Content Manager** lists 12 "Maison product" entries, published in both ja and en.
4. **"Reset demo appointments"** shows "Deleted 0 appointments and 0 notifications."

- [ ] **Step 6: Commit**

```bash
git add admin/src
git commit -m "feat: add the Maison admin page to load and reset demo data"
```

---

### Task 13: MCP smoke tests, README and pull request

These tests call `/mcp` on the running LaunchPad dev server over HTTP, the way Claude Desktop or the app will. Here the customer token is a plain admin token with no LINE session, so customer tools must answer `not_signed_in`. The signed-in path is tested end to end in the LaunchPad plan, once oauth-mcp-manager 1.1 is installed.

**Files:**
- Create: `scripts/mcp-dev-tokens.mjs`, `test/mcp/tools.test.mjs`
- Modify: `package.json` (devDependency `@modelcontextprotocol/sdk`), `.gitignore`, `README.md` (rewrite)

**Interfaces:**
- Consumes: everything above, running in LaunchPad's Strapi on port 1340
- Produces: `test/mcp/.tokens.json` (gitignored), with a `customer` and an `ops` admin token

- [ ] **Step 1: Add the MCP client and ignore the token file**

```bash
npm install --save-dev @modelcontextprotocol/sdk@^1.31.0
printf '\n# MCP smoke-test tokens (scripts/mcp-dev-tokens.mjs)\ntest/mcp/.tokens.json\n' >> .gitignore
```

- [ ] **Step 2: Write `scripts/mcp-dev-tokens.mjs`**

```js
// Loads the demo catalog on a running Strapi and creates two admin API tokens for the MCP smoke tests.
// Tokens are written to test/mcp/.tokens.json (gitignored) and never printed.
// Usage: node --env-file=<strapi app>/.env scripts/mcp-dev-tokens.mjs
import { writeFileSync } from 'node:fs';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1340';
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
  ops: await mint('maison-ops', ['plugin::maison.confirmations.send']),
};
writeFileSync(new URL('../test/mcp/.tokens.json', import.meta.url), `${JSON.stringify(tokens, null, 2)}\n`);
console.log('Saved a customer token and an ops token to test/mcp/.tokens.json.');
```

- [ ] **Step 3: Write `test/mcp/tools.test.mjs`**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1340';
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
const errorOf = (result) => JSON.parse(result.content[0].text).error;

describe('Maison over /mcp', () => {
  let customer;
  let ops;

  before(async () => {
    customer = await connect(tokens.customer);
    ops = await connect(tokens.ops);
  });

  after(async () => {
    await customer?.close();
    await ops?.close();
  });

  it('shows each token only the tools its permissions allow', async () => {
    assert.deepEqual(await toolNames(customer), [
      'browse_collections', 'get_boutiques', 'get_product', 'my_appointments', 'request_appointment', 'search_products',
    ]);
    assert.deepEqual(await toolNames(ops), ['list_pending_confirmations', 'record_confirmation']);
  });

  it('shows the ops prompt only to the ops token', async () => {
    const opsPrompts = (await ops.listPrompts()).prompts.map((prompt) => prompt.name);
    assert.ok(opsPrompts.includes('send_pending_confirmations'));
    const customerPrompts = await customer.listPrompts().catch(() => ({ prompts: [] }));
    assert.ok(!customerPrompts.prompts.some((prompt) => prompt.name === 'send_pending_confirmations'));
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
    const result = await customer.callTool({ name: 'get_product', arguments: { slug: 'no-such-piece' } });
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

  it('lets the ops token list and record, and refuses unknown references', async () => {
    const pending = await ops.callTool({ name: 'list_pending_confirmations', arguments: {} });
    assert.ok(!pending.isError, JSON.stringify(pending.content));
    assert.ok(Array.isArray(pending.structuredContent.appointments));
    const unknown = await ops.callTool({ name: 'record_confirmation', arguments: { reference: 'APT-0000', status: 'sent', detail: 'smoke test' } });
    assert.equal(errorOf(unknown).code, 'not_found');
  });
});
```

- [ ] **Step 4: Run the smoke tests against LaunchPad**

LaunchPad's dev server needs `MAISON_LIFF_URL` set, or `list_pending_confirmations` answers `not_configured`. Local development uses the app's local URL. Add it if it's missing, then restart Strapi:

```bash
cd /Users/paul/work/launchpad-fork-latest/strapi
grep -q '^MAISON_LIFF_URL=' .env || echo 'MAISON_LIFF_URL=http://localhost:3003' >> .env
kill $(lsof -tiTCP:1340 -sTCP:LISTEN) 2>/dev/null; PORT=1340 CLIENT_URL=http://localhost:3010 nohup yarn develop > .tmp/maison-dev.log 2>&1 &
```

When `/_health` answers `204`:

```bash
cd /Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp
node --env-file=/Users/paul/work/launchpad-fork-latest/strapi/.env scripts/mcp-dev-tokens.mjs
npm run test:mcp
```

Expected: the script prints two lines without any token, and 6 smoke tests pass.

- [ ] **Step 5: Rewrite `README.md`**

````markdown
# Maison: a luxury house's catalog over Strapi MCP

A Strapi 5 plugin that shows one content model serving people and AI agents through Strapi's built-in MCP server. It adds a fictional luxury house, "Maison": collections, products, boutiques and stock. Signed-in customers can request boutique visits, and staff confirm them.

- **Eight MCP tools and one MCP prompt** on Strapi's `/mcp`, each gated by a permission you grant per token
- **A human gate:** agents can request appointments, but only staff can confirm them, by publishing
- **Customer identity comes from sign-in, never from the model**, through [strapi-oauth-mcp-manager](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager) 1.1 and LINE
- **Demo data** in Japanese and English, loaded from the admin panel

Maison is fictional. The plugin uses no real brand's names, products or images.

## Requirements

- Strapi `^5.55.1`, with the MCP server enabled: `mcp: { enabled: true }` in `config/server.ts`
- The i18n plugin, which is on by default
- For the customer tools, strapi-oauth-mcp-manager 1.1 with LINE sign-in configured. Without it, those tools answer `not_signed_in`.

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

Restart Strapi. Open **Maison** in the admin menu and choose **Load demo catalog**.

## Configuration

| Key | Default | Purpose |
|---|---|---|
| `liffUrl` | `null` | Base of the links in LINE confirmations, e.g. `https://liff.line.me/<LIFF ID>`. Use `http://localhost:<port>` for local development. Until it's set, `list_pending_confirmations` answers `not_configured`. |
| `timezone` | `Asia/Tokyo` | Opening-hours checks and the times in messages |
| `defaultLocale` | `ja` | Content language when a tool call doesn't pass `locale` (`ja` or `en`) |
| `maxOpenRequestsPerCustomer` | `3` | Unconfirmed future requests a customer may have |
| `houseName` | `{ ja: 'メゾン', en: 'Maison' }` | Header of the LINE confirmation |
| `disabledTools` | `[]` | Tool names not to register |

## Tools

| Tool | Permission | What it does |
|---|---|---|
| `browse_collections` | MCP: browse the catalog | Published collections, with a teaser and product count |
| `search_products` | MCP: browse the catalog | Products by collection, category, gift occasion, price, personalization and boutique stock |
| `get_product` | MCP: browse the catalog | One product: story, dimensions, personalization, stock per boutique |
| `get_boutiques` | MCP: browse the catalog | Boutiques, opening hours, open on a date, stock for chosen products |
| `request_appointment` | MCP: request and view own appointments | Creates a **draft** visit request for the signed-in customer |
| `my_appointments` | MCP: request and view own appointments | The signed-in customer's own requests and confirmations |
| `list_pending_confirmations` | MCP: send appointment confirmations | Confirmed visits not yet sent, each with a ready LINE flex message |
| `record_confirmation` | MCP: send appointment confirmations | Records whether a LINE confirmation was delivered |

The **`send_pending_confirmations` prompt** tells an ops agent how to deliver confirmations with [LINE Bot MCP](https://github.com/line/line-bot-mcp-server). It checks that each customer is reachable (`get_profile`) before pushing, because LINE's push API answers 200 even when it can't deliver.

**Errors don't throw.** They come back as `isError` results whose text is `{"error":{"code","message","hint"}}`. The codes are `not_signed_in`, `not_found`, `invalid_input`, `boutique_closed`, `in_the_past`, `too_many_open_requests`, `not_published` and `not_configured`. The hint says what to do next.

## Tokens

Strapi's `/mcp` only accepts **admin** API tokens. Create them under **Settings → API Tokens** and grant only the Maison permissions a caller needs:
- **Customer token:** "MCP: browse the catalog" and "MCP: request and view own appointments". Map it to the LINE client in oauth-mcp-manager. Every customer session runs with this token's permissions, so keep it narrow.
- **Ops token:** only "MCP: send appointment confirmations".
- **Demo managers:** "Load and reset demo data" is an ordinary admin role permission.

## Customer identity

A tool never takes the customer as an argument. Customer tools pass the caller's own `Authorization` header to oauth-mcp-manager:

```ts
strapi.plugin('strapi-oauth-mcp-manager').service('oauth').resolveSubject(authorization); // 'line:U…' or null
```

Anything but `line:U` followed by 32 lowercase hex characters counts as not signed in. That includes plain admin tokens, staff sessions, and a missing oauth-mcp-manager.

## Run the ops agent

Point Claude Desktop at Strapi with the ops token and at LINE Bot MCP with a Messaging API channel access token. Then run the `send_pending_confirmations` prompt.

```json
{
  "mcpServers": {
    "maison": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:1337/mcp", "--header", "Authorization: Bearer ${MAISON_OPS_TOKEN}"],
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
  - `service('catalog')` and `service('appointments')` for the same logic the tools use
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

- [ ] **Step 6: Run everything once more**

```bash
npx vitest run
npm run test:ts:back && npm run test:ts:front
npm run build && npm run verify
STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi npm run test:integration
npm run test:mcp
```

Expected: every command passes. Integration tests use their own SQLite files, so they can run while the dev server is up.

- [ ] **Step 7: Commit, push and open the pull request**

```bash
git add package.json package-lock.json .gitignore scripts/mcp-dev-tokens.mjs test/mcp/tools.test.mjs README.md
git commit -m "test: add MCP smoke tests and rewrite the README for Maison"
git push -u origin feat/maison-plugin
gh pr create --base main --title "feat: Maison plugin (catalog, appointments and LINE confirmations over Strapi MCP)" --body-file - <<'BODY'
Replaces the store-analytics starting point with the Maison plugin described in `docs/superpowers/specs/2026-09-29-maison-plugin-design.md`.

- Six content types (collection, product, boutique, stock level, appointment, notification) with shared validation for the admin and the tools
- Eight MCP tools and the `send_pending_confirmations` prompt, each gated by a plugin permission
- Customer identity through oauth-mcp-manager's `resolveSubject`; a plain admin token is never treated as a customer
- Bilingual seed data with generated images, and an admin page to load or reset the demo

Worth knowing:
- The notification's delivery field is `outcome`, because `status` is reserved in Strapi 5. Tool inputs and outputs still say `status`.
- Tools use a local `defineTool` typed with Strapi's builder types, because `@strapi/strapi` can't be imported by vitest.
- `liffUrl` also accepts `http://localhost` for local development.

Tests: vitest unit tests; integration tests that boot LaunchPad's Strapi against throwaway SQLite files; MCP smoke tests over HTTP against the running dev server; a contract test of the LINE flex message against LINE Bot MCP 0.5.0's schema.
BODY
```

Expected: `gh` prints the pull request URL.
