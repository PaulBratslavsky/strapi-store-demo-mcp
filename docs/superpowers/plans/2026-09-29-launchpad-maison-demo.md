# LaunchPad integration, Maison app and demo implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the whole "UX to AX" demo on one laptop:
- LaunchPad's Strapi with both plugins
- a LIFF-based Maison app, with catalog screens, an agent view and a Claude concierge, running in a browser at phone size with LINE sign-in simulated by LIFF Mock
- Claude Desktop as the ops agent
- a runbook with the handoff to QBurst

**Architecture:**
- **Strapi** loads the Maison plugin and oauth-mcp-manager 1.1 through yalc links, behind a `MAISON_DEMO` switch. A setup script creates the demo's tokens and the app's OAuth client.
- **The app is a new `liff/` Next.js 16 frontend.** In the browser, it initializes LIFF (the mock by default) and exchanges the ID token for a customer session. It then calls the Maison tools on Strapi `/mcp` with the MCP SDK client, recording each call for the agent view.
- **The concierge** is a Next.js route that forwards the customer's session to Strapi with `@ai-sdk/mcp`, and streams Claude Sonnet 5 through AI SDK 7.
- **A local stand-in for LINE's verify endpoint** runs with the app.

**Tech stack:**
- Strapi 5.55.1 with yalc
- Next.js ^16.3.1 and React ^19.2.8, TypeScript, Tailwind 3.4
- `@line/liff` 2.31 and `@line/liff-mock` 1.0.4
- `@modelcontextprotocol/sdk` 1.31, AI SDK 7 (`ai` 7.0, `@ai-sdk/react` 4, `@ai-sdk/mcp` 2, `@ai-sdk/anthropic` 4)
- vitest, and Playwright
- Claude Desktop with `mcp-remote`

**Spec:** `docs/superpowers/specs/2026-09-29-launchpad-liff-demo-design.md` in the strapi-store-demo-mcp repo, with the overview `2026-09-29-ax-luxury-demo-overview.md`.

**Depends on:** the Maison plugin plan and the oauth-mcp-manager 1.1 plan, both finished on their feature branches (`feat/maison-plugin`, `feat/line-token-exchange`).

## Global constraints

- **Repo:** `/Users/paul/work/launchpad-fork-latest`, branch `feat/maison-demo`, created from the local `feat/store-demo-mcp-plugin`. A hook blocks commits on `main`; create the branch in its own command before committing.
- **Yarn 4** (`yarn@4.5.0`, `nodeLinker: node-modules`). Each app folder is its own Yarn project; `liff/` needs its own empty `yarn.lock` before the first `yarn install`.
- **The pre-commit hook runs Prettier on staged files.** Stage explicit paths only.
- **Never commit yalc output.** Don't stage `strapi/.yalc/`, `strapi/yalc.lock`, or the `link:` entries yalc adds to `strapi/package.json` and `strapi/yarn.lock`. Task 1 gitignores the first two; the `link:` lines stay as local, uncommitted changes.
- **Both plugins are enabled only when `MAISON_DEMO=true`.** A disabled entry is dropped before Strapi resolves it, so LaunchPad still boots for anyone without the plugins.
- **Secrets:**
  - The local admin credentials (`LOCAL_TEST_ADMIN_EMAIL`, `LOCAL_TEST_ADMIN_PASSWORD` in `strapi/.env`), admin tokens and API keys are never printed, logged or committed.
  - The ops token lives only in `strapi/.tmp/maison-ops-token`, which is gitignored and mode 600.
- **The customer's session token is the only credential the app handles.**
  - It stays in memory: no `localStorage`, no cookies.
  - The concierge route forwards it and adds no credential of its own.
- **Only call LIFF in the browser,** inside effects or event handlers. `@line/liff` throws during server rendering.
- **Ports on this machine:**
  - Strapi runs on 1340, because 1337 is taken. It's started as `PORT=1340 CLIENT_URL=http://localhost:3010 yarn develop` in `strapi/`.
  - The app runs on 3003, and the mock verify endpoint on 4545.
  - Commands that need Strapi's URL take `STRAPI_URL=http://localhost:1340`.
- **Times:** Asia/Tokyo. The app sends `requestedFor` as `YYYY-MM-DDTHH:MM:00+09:00`.
- **Model:** `claude-sonnet-5`. With `ANTHROPIC_API_KEY` it goes directly to Anthropic; otherwise the AI Gateway string `'anthropic/claude-sonnet-5'` is used.
- **AI SDK 7 names:**
  - use `instructions` (not `system`), `isStepCount` (not `stepCountIs`), `onEnd` (not `onFinish`), and `result.stream`
  - the response is `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`
  - `useChat` takes a `DefaultChatTransport`, and never `api` or `headers` directly
  - MCP tools from `mcp.tools()` arrive as `dynamic-tool` UI parts

## Review focus

These are the inputs the spec implies most likely to bite a real user. Each has a test in the task that owns the code.

1. **An expired or revoked customer session.** The app must exchange a new token once and retry the call, not fail the screen, and not loop forever (Task 4).
2. **Two customers on one machine.** A second demo customer (`?demoUser=`) must not see the first customer's visits (Task 8).
3. **Requests to the concierge route without a customer session,** or with an admin token, must get a 401 before anything connects to Strapi or the model (Task 7).
4. **Booking on a closed day.** Osaka on a Tuesday must show "closed" and disable the request button, rather than letting the tool's `boutique_closed` error be the first feedback (built in Task 6, tested in Task 8).
5. **Running the setup script twice.** It must leave exactly one "Maison app" client and one of each token, and the app must keep working with the new client ID (Task 2).

---

## File structure

```
strapi/config/server.ts                 modify: url (absolute media URLs for the app's origin)
strapi/config/admin.ts                  modify: secrets.encryptionKey
strapi/config/plugins.ts                modify: maison + strapi-oauth-mcp-manager behind MAISON_DEMO
strapi/config/middlewares.ts            modify: CORS object for the app and MCP headers
strapi/.env.example                     modify: new keys
strapi/.gitignore                       modify: .yalc, yalc.lock
strapi/scripts/maison-setup.mjs         create: catalog, tokens, OAuth client, liff/.env
scripts/frontends.mts                   modify: liff frontend, preview flag
scripts/env.mts                         modify: preview-secret rules only for previewable frontends
scripts/dev.mts                         modify: leave the preview target alone for liff
scripts/setup.mts                       modify: mention yarn dev:liff
package.json                            modify: dev:liff, maison:setup
liff/                                   create: the Maison app
  package.json, yarn.lock, tsconfig.json, next.config.mjs, postcss.config.mjs,
  tailwind.config.ts, vitest.config.ts, playwright.config.ts, .env.example, .gitignore
  scripts/mock-line-verify.mjs          local stand-in for LINE's verify endpoint
  lib/config.ts                         public env
  lib/liff.ts                           LIFF / LIFF Mock sign-in
  lib/session.ts                        token exchange, in memory
  lib/mcp.ts                            MCP client, call recording, 401 retry
  lib/maison.ts                         one-time client bootstrap
  lib/types.ts, lib/copy.ts, lib/format.ts, lib/status.ts
  lib/use-tool.ts                       React hook: one tool call per screen
  lib/model.ts                          concierge model choice
  lib/concierge.ts                      concierge request handler
  lib/*.test.ts                         vitest
  components/*.tsx                      provider, frame, header, screen, drawer, cards, booking sheet
  app/layout.tsx, app/globals.css
  app/page.tsx, app/collections/[slug]/page.tsx, app/products/[slug]/page.tsx,
  app/visits/page.tsx, app/visits/[reference]/page.tsx, app/concierge/page.tsx
  app/api/concierge/route.ts
  e2e/global-setup.ts, e2e/maison.spec.ts
docs/maison-demo/README.md              create: runbook, Claude Desktop, options A/B, handoff slides
```

---

### Task 1: LaunchPad Strapi with both plugins

**Files:**
- Modify: `strapi/config/server.ts`, `strapi/config/admin.ts`, `strapi/config/plugins.ts`, `strapi/config/middlewares.ts`, `strapi/.env.example`, `strapi/.gitignore`
- Local only (not committed): `strapi/.env`, and the yalc links

**Interfaces:**
- Consumes: the built Maison plugin (`strapi-store-demo-mcp`, plugin id `maison`) and `strapi-oauth-mcp-manager` 1.1
- Produces:
  - Strapi on `http://localhost:1340` with the Maison tools, LINE token exchange verified against `http://localhost:4545/verify`, and CORS for `http://localhost:3003`
  - env keys `MAISON_DEMO`, `ENCRYPTION_KEY`, `LINE_LOGIN_CHANNEL_ID`, `LINE_VERIFY_URL`, `MAISON_LIFF_URL`, `MAISON_APP_ORIGIN`, `PUBLIC_URL`

- [ ] **Step 1: Branch**

```bash
cd /Users/paul/work/launchpad-fork-latest
git checkout -b feat/maison-demo
```

The uncommitted changes from `feat/store-demo-mcp-plugin` come along, including the yalc link to the old build. Step 5 replaces them.

- [ ] **Step 2: Configure Strapi**

`strapi/config/server.ts`:

```ts
export default ({ env }) => {
  const port = env.int('PORT', 1337);
  return {
    host: env('HOST', '0.0.0.0'),
    port,
    // Absolute public address. The Maison plugin builds absolute media URLs from it, which the
    // Maison app needs because it runs on another origin. oauth-mcp-manager uses it for its metadata.
    url: env('PUBLIC_URL', `http://localhost:${port}`),
    app: {
      keys: env.array('APP_KEYS') || ['tobemodified1', 'tobemodified2'],
    },
    // Strapi's built-in MCP server at /mcp (admin API tokens only).
    mcp: { enabled: env.bool('MCP_ENABLED', true) },
  };
};
```

In `strapi/config/admin.ts`, add to the returned object, after `auth`:

```ts
    // oauth-mcp-manager stores the admin token behind each MCP session and decrypts it per request.
    secrets: {
      encryptionKey: env('ENCRYPTION_KEY'),
    },
```

`strapi/config/plugins.ts`:

```ts
export default ({ env }) => {
  // The Maison demo (docs/maison-demo). Off unless MAISON_DEMO=true, so LaunchPad runs without
  // these two plugins installed. They are yalc-linked from their repos for the demo.
  const demo = env.bool('MAISON_DEMO', false);
  const lineChannelId = env('LINE_LOGIN_CHANNEL_ID');

  return {
    maison: {
      enabled: demo,
      config: {
        liffUrl: env('MAISON_LIFF_URL', null),
      },
    },
    'strapi-oauth-mcp-manager': {
      enabled: demo,
      config: {
        // Customer sign-in with LINE. On stage, LINE_VERIFY_URL points at the app's mock of LINE's verify endpoint.
        identityProviders: lineChannelId
          ? { line: { channelId: lineChannelId, verifyUrl: env('LINE_VERIFY_URL', undefined) } }
          : {},
      },
    },
  };
};
```

`strapi/config/middlewares.ts`:

```ts
export default ({ env }) => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      // LaunchPad's frontends, plus the Maison app (it calls /mcp and the OAuth token endpoint from the browser).
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:4321',
        'http://localhost:3003',
        ...(env('CLIENT_URL') ? [env('CLIENT_URL')] : []),
        ...(env('MAISON_APP_ORIGIN') ? [env('MAISON_APP_ORIGIN')] : []),
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'mcp-session-id', 'mcp-protocol-version', 'Last-Event-ID'],
      expose: ['WWW-Authenticate', 'mcp-session-id', 'mcp-protocol-version'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
```

`methods` keeps Strapi's defaults, because the other frontends and the admin rely on them. The spec's list (`GET, POST, DELETE, OPTIONS`) is what MCP needs, and it's included.

Append to `strapi/.env.example`:

```
# Maison demo (docs/maison-demo)
MAISON_DEMO=false
ENCRYPTION_KEY=tobemodified
LINE_LOGIN_CHANNEL_ID=1234567890
LINE_VERIFY_URL=http://localhost:4545/verify
MAISON_LIFF_URL=http://localhost:3003
MAISON_APP_ORIGIN=
PUBLIC_URL=
```

`ensureEnvFile` swaps `tobemodified` for a generated secret on a fresh setup.

Append to `strapi/.gitignore`:

```
# yalc links for local plugin development
.yalc
yalc.lock
```

- [ ] **Step 3: Fill in this machine's `strapi/.env`**

These commands never print the file:

```bash
cd /Users/paul/work/launchpad-fork-latest/strapi
add() { grep -q "^$1=" .env || echo "$1=$2" >> .env; }
add MAISON_DEMO true
add ENCRYPTION_KEY "$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
add LINE_LOGIN_CHANNEL_ID 1234567890
add LINE_VERIFY_URL http://localhost:4545/verify
add MAISON_LIFF_URL http://localhost:3003
grep -c '^MAISON_DEMO=true$' .env
```

Expected: `1`.

- [ ] **Step 4: Build and publish both plugins to yalc**

Each plugin must be on its finished feature branch, with its tests passing:

```bash
cd /Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp && git checkout feat/maison-plugin && npm run link
cd /Users/paul/work/plugin-dev/plugins/strapi-oauth-mcp-manager && git checkout feat/line-token-exchange && npm run build && npx -y yalc@1.0.0-pre.53 push
```

Expected: both print `published`, or yalc's equivalent `+ …@… published in store`.

- [ ] **Step 5: Link them into LaunchPad's Strapi**

```bash
cd /Users/paul/work/launchpad-fork-latest/strapi
npx -y yalc@1.0.0-pre.53 add --link strapi-store-demo-mcp strapi-oauth-mcp-manager
yarn install
```

Expected: `strapi/package.json` has `link:.yalc/…` entries for both. These stay uncommitted.

- [ ] **Step 6: Restart Strapi and check it**

```bash
kill $(lsof -tiTCP:1340 -sTCP:LISTEN) 2>/dev/null
cd /Users/paul/work/launchpad-fork-latest/strapi && PORT=1340 CLIENT_URL=http://localhost:3010 nohup yarn develop > .tmp/maison-dev.log 2>&1 &
```

When `curl -s -o /dev/null -w '%{http_code}' http://localhost:1340/_health` prints `204`:

```bash
curl -s http://localhost:1340/.well-known/oauth-authorization-server | grep -o 'token-exchange'
grep -E "OAuth enabled for /mcp|\[maison\]" /Users/paul/work/launchpad-fork-latest/strapi/.tmp/maison-dev.log | head -5
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS http://localhost:1340/mcp -H 'Origin: http://localhost:3003' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type,mcp-protocol-version'
```

Expected:
- `token-exchange` is printed.
- The log has `[strapi-oauth-mcp-manager] OAuth enabled for /mcp`, and no Maison warning about MCP being disabled.
- The preflight answers `204`.

- [ ] **Step 7: Commit**

```bash
cd /Users/paul/work/launchpad-fork-latest
git add strapi/config/server.ts strapi/config/admin.ts strapi/config/plugins.ts strapi/config/middlewares.ts strapi/.env.example strapi/.gitignore
git commit -m "feat(strapi): load the Maison demo plugins behind MAISON_DEMO"
```

---

### Task 2: Setup script for tokens and the app's OAuth client

**Files:**
- Create: `strapi/scripts/maison-setup.mjs`
- Modify: `package.json` (root): the `maison:setup` script

**Interfaces:**
- Consumes:
  - admin REST: `POST /admin/login`, and `GET`/`POST`/`DELETE` `/admin/admin-tokens`
  - Maison: `POST /maison/demo/seed`
  - oauth-mcp-manager admin: `GET`/`POST`/`DELETE` `/strapi-oauth-mcp-manager/clients`
- Produces:
  - admin tokens "Maison customer" (`catalog.read` and `appointments.request`) and "Maison ops" (`confirmations.send`)
  - the OAuth client "Maison app" (`endUserProvider: 'line'`, mapped to "Maison customer")
  - `liff/.env` keys `NEXT_PUBLIC_STRAPI_URL` and `NEXT_PUBLIC_MAISON_CLIENT_ID`
  - `strapi/.tmp/maison-ops-token`

- [ ] **Step 1: Write `strapi/scripts/maison-setup.mjs`**

```js
// Sets up the Maison demo on a running LaunchPad Strapi. Safe to run again: it replaces what it made before.
//   1. loads the demo catalog
//   2. (re)creates the admin tokens "Maison customer" and "Maison ops"
//   3. (re)creates the OAuth client "Maison app" (customer sign-in with LINE, mapped to "Maison customer")
//   4. writes the app's Strapi URL and client ID to liff/.env, and the ops token to strapi/.tmp/maison-ops-token
// Usage from the repo root: yarn maison:setup   (prefix STRAPI_URL=http://localhost:1340 when Strapi isn't on PORT)
// Never prints a secret.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STRAPI_URL = (process.env.STRAPI_URL ?? `http://localhost:${process.env.PORT || 1337}`).replace(/\/+$/, '');
const email = process.env.LOCAL_TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
const password = process.env.LOCAL_TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error('Set LOCAL_TEST_ADMIN_EMAIL and LOCAL_TEST_ADMIN_PASSWORD in strapi/.env to an admin of this Strapi.');
}

const call = async (method, path, body, jwt) => {
  const response = await fetch(`${STRAPI_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.data ?? json;
};

/** Sets KEY=value lines in an env file, creating it from .env.example when missing. */
const writeEnv = (file, values) => {
  const example = file.replace(/\.env$/, '.env.example');
  let text = existsSync(file) ? readFileSync(file, 'utf8') : existsSync(example) ? readFileSync(example, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
  }
  writeFileSync(file, text);
};

const { token: jwt } = await call('POST', '/admin/login', { email, password });
const api = (method, path, body) => call(method, path, body, jwt);

const seeded = await api('POST', '/maison/demo/seed', {});
console.log(seeded.created ? 'Loaded the demo catalog.' : 'Demo catalog already loaded.');

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

for (const client of await api('GET', '/strapi-oauth-mcp-manager/clients')) {
  if (client.name === 'Maison app') await api('DELETE', `/strapi-oauth-mcp-manager/clients/${client.id}`);
}
const app = await api('POST', '/strapi-oauth-mcp-manager/clients', {
  name: 'Maison app',
  endUserProvider: 'line',
  redirectUris: [],
  adminTokenId: customer.id,
});

writeEnv(join(root, 'liff', '.env'), { NEXT_PUBLIC_STRAPI_URL: STRAPI_URL, NEXT_PUBLIC_MAISON_CLIENT_ID: app.clientId });
mkdirSync(join(root, 'strapi', '.tmp'), { recursive: true });
writeFileSync(join(root, 'strapi', '.tmp', 'maison-ops-token'), `${ops.accessKey}\n`, { mode: 0o600 });

console.log(`Created the "Maison app" client ${app.clientId} and wrote it to liff/.env (restart the app to pick it up).`);
console.log('Wrote the "Maison ops" token to strapi/.tmp/maison-ops-token (see docs/maison-demo/README.md, Claude Desktop).');
```

- [ ] **Step 2: Add the root script**

In the root `package.json` `scripts`, add:

```json
    "maison:setup": "node --env-file=strapi/.env strapi/scripts/maison-setup.mjs",
```

- [ ] **Step 3: Run it twice and check the result**

`liff/` doesn't exist until Task 3, so create the folder first. The script then writes `liff/.env` from scratch.

```bash
cd /Users/paul/work/launchpad-fork-latest
mkdir -p liff
STRAPI_URL=http://localhost:1340 yarn maison:setup
STRAPI_URL=http://localhost:1340 yarn maison:setup
```

Expected: the first run says it loaded the catalog, or that it was already loaded. Both runs print one client ID and no token. Then check that the second run left exactly one of each:

```bash
node --env-file=strapi/.env --input-type=module -e "
const base = 'http://localhost:1340';
const login = await (await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.LOCAL_TEST_ADMIN_EMAIL, password: process.env.LOCAL_TEST_ADMIN_PASSWORD }) })).json();
const auth = { Authorization: 'Bearer ' + login.data.token };
const clients = (await (await fetch(base + '/strapi-oauth-mcp-manager/clients', { headers: auth })).json()).data;
const tokens = (await (await fetch(base + '/admin/admin-tokens', { headers: auth })).json()).data;
console.log('Maison app clients:', clients.filter((c) => c.name === 'Maison app').length);
console.log('Maison tokens:', tokens.filter((t) => t.name.startsWith('Maison ')).map((t) => t.name).sort().join(', '));
"
node --env-file=liff/.env -e "console.log('client id in liff/.env:', Boolean(process.env.NEXT_PUBLIC_MAISON_CLIENT_ID))"
```

Expected:
- `Maison app clients: 1`
- `Maison tokens: Maison customer, Maison ops`
- `client id in liff/.env: true`

Task 3 checks the token exchange itself, once the mock verify endpoint exists.

- [ ] **Step 4: Commit**

```bash
git add strapi/scripts/maison-setup.mjs package.json
git commit -m "feat: add the Maison demo setup script (tokens, OAuth client, app env)"
```

---

### Task 3: The `liff/` app skeleton, the mock verify endpoint and registration

**Files:**
- Create: `liff/package.json`, `liff/yarn.lock` (empty), `liff/tsconfig.json`, `liff/next.config.mjs`, `liff/postcss.config.mjs`, `liff/tailwind.config.ts`, `liff/vitest.config.ts`, `liff/.env.example`, `liff/.gitignore`, `liff/scripts/mock-line-verify.mjs`, `liff/app/globals.css`, `liff/app/layout.tsx`, `liff/app/page.tsx` (temporary), `liff/components/phone-frame.tsx`
- Modify: `scripts/frontends.mts`, `scripts/env.mts`, `scripts/dev.mts`, `scripts/setup.mts`, `package.json` (root)

**Interfaces:**
- Produces:
  - the `liff` frontend on port 3003
  - `yarn dev:liff`
  - the mock verify endpoint at `http://localhost:4545/verify`, which accepts `valid.<U + 32 hex>` for channel `1234567890`
  - `PhoneFrame`

- [ ] **Step 1: Create the project files**

`liff/package.json`:

```json
{
  "name": "maison-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n app,line-mock -c green,cyan \"next dev -p 3003\" \"node --env-file-if-exists=.env scripts/mock-line-verify.mjs\"",
    "build": "next build",
    "start": "concurrently -k -n app,line-mock -c green,cyan \"next start -p 3003\" \"node --env-file-if-exists=.env scripts/mock-line-verify.mjs\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "node --env-file=../strapi/.env --env-file=.env node_modules/@playwright/test/cli.js test"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^4.0.68",
    "@ai-sdk/mcp": "^2.0.62",
    "@ai-sdk/react": "^4.0.125",
    "@line/liff": "^2.31.0",
    "@line/liff-mock": "^1.0.4",
    "@modelcontextprotocol/sdk": "^1.31.0",
    "ai": "^7.0.122",
    "next": "^16.3.1",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
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

`liff/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "**/*.test.ts", "e2e", "playwright.config.ts", "vitest.config.ts"]
}
```

`liff/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode runs effects twice in development, which would record every tool call twice in the agent view.
  reactStrictMode: false,
};

export default nextConfig;
```

`liff/postcss.config.mjs`:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

`liff/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#1c1c1c', ivory: '#f7f4ee', gold: '#b89b5e', mist: '#8a8a8a' },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['"Hiragino Sans"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`liff/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
});
```

`liff/.env.example`:

```
# Strapi (LaunchPad) and the app's OAuth client. `yarn maison:setup` fills both in.
NEXT_PUBLIC_STRAPI_URL=http://localhost:1337
NEXT_PUBLIC_MAISON_CLIENT_ID=

# LINE. Mock mode signs in a demo customer with LINE's LIFF mock. Set it to false, with a LIFF ID, to run inside LINE.
NEXT_PUBLIC_LIFF_MOCK=true
NEXT_PUBLIC_LIFF_ID=
NEXT_PUBLIC_DEMO_LINE_USER_ID=U4af4980629c1a7b3f1e2d3c4b5a69788
NEXT_PUBLIC_DEMO_LOCALE=ja

# The local stand-in for LINE's ID token verify endpoint. The channel ID must match strapi/.env.
LINE_LOGIN_CHANNEL_ID=1234567890
MOCK_LINE_VERIFY_PORT=4545

# The concierge's model, Claude Sonnet 5: directly with ANTHROPIC_API_KEY, or through Vercel AI Gateway with AI_GATEWAY_API_KEY.
ANTHROPIC_API_KEY=
AI_GATEWAY_API_KEY=
```

`liff/.gitignore`:

```
.next
next-env.d.ts
*.tsbuildinfo
.env
.env.local
playwright-report
test-results
```

Create the empty lockfile so Yarn treats `liff/` as its own project:

```bash
cd /Users/paul/work/launchpad-fork-latest && touch liff/yarn.lock
```

- [ ] **Step 2: Write the mock verify endpoint `liff/scripts/mock-line-verify.mjs`**

```js
// A local stand-in for LINE's ID token verify endpoint (POST /verify), used on stage and in development.
// It accepts "valid.<LINE user ID>" for the configured channel, which is what the app's LIFF mock returns.
// Never point production at it. Env: MOCK_LINE_VERIFY_PORT (4545), LINE_LOGIN_CHANNEL_ID (1234567890).
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_LINE_VERIFY_PORT ?? 4545);
const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? '1234567890';
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
    const [kind, sub] = (form.get('id_token') ?? '').split('.');
    if (kind !== 'valid' || !LINE_USER_ID.test(sub ?? '')) {
      return send(400, { error: 'invalid_request', error_description: 'Invalid IdToken.' });
    }
    const now = Math.floor(Date.now() / 1000);
    return send(200, { iss: 'https://access.line.me', sub, aud: channelId, exp: now + 3600, iat: now, amr: ['linesso'], name: 'Demo customer' });
  });
});

server.listen(port, () => console.log(`Mock LINE verify endpoint on http://localhost:${port}/verify (channel ${channelId})`));
```

- [ ] **Step 3: Write the minimal app shell**

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
```

`liff/components/phone-frame.tsx`:

```tsx
import type { ReactNode } from 'react';

/** On a phone the app fills the screen. On anything wider (the stage laptop) it sits in a phone-sized frame. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh min-[500px]:flex min-[500px]:items-center min-[500px]:justify-center min-[500px]:py-8">
      <div className="relative min-h-dvh bg-ivory min-[500px]:h-[812px] min-[500px]:min-h-0 min-[500px]:w-[375px] min-[500px]:overflow-hidden min-[500px]:rounded-[2.5rem] min-[500px]:shadow-2xl min-[500px]:ring-8 min-[500px]:ring-black">
        <div className="h-full min-[500px]:overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
```

`liff/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond } from 'next/font/google';
import type { ReactNode } from 'react';

import { PhoneFrame } from '@/components/phone-frame';
import './globals.css';

const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Maison',
  description: 'A fictional luxury house, served to people and agents through Strapi MCP.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={serif.variable}>
      <body>
        <PhoneFrame>{children}</PhoneFrame>
      </body>
    </html>
  );
}
```

`liff/app/page.tsx` (replaced in Task 6):

```tsx
export default function Home() {
  return <p className="p-8 font-serif text-3xl tracking-[0.3em]">MAISON</p>;
}
```

- [ ] **Step 4: Register the frontend**

In `scripts/frontends.mts`:

1. Add to `interface Frontend`:

```ts
  /** Whether the Strapi admin's Preview button can target this frontend. */
  preview: boolean;
```

2. Replace `define` and `FRONTENDS`:

```ts
const define = (
  name: string,
  label: string,
  port: number,
  strapiUrlKey: string,
  preview = true
): Frontend => ({
  name,
  label,
  dir: path.join(rootDir, name),
  port,
  strapiUrlKey,
  preview,
});

export const FRONTENDS: Frontend[] = [
  define('next', 'Next.js', 3000, 'NEXT_PUBLIC_API_URL'),
  define('astro', 'Astro', 4321, 'STRAPI_URL'),
  define('nuxt', 'Nuxt 4', 3001, 'STRAPI_URL'),
  define('tanstack', 'TanStack Start', 3002, 'VITE_STRAPI_URL'),
  // The Maison demo app (docs/maison-demo). It has no CMS pages to preview.
  define('liff', 'Maison app (LIFF)', 3003, 'NEXT_PUBLIC_STRAPI_URL', false),
];
```

In `scripts/env.mts`:

1. In `propagatePreviewSecret`, change `for (const f of presentFrontends()) {` to `for (const f of presentFrontends().filter((frontend) => frontend.preview)) {`.
2. In `setPreviewTarget`, after `const frontend: Frontend = getFrontend(name);`, add:

```ts
  if (!frontend.preview) {
    throw new Error(`${frontend.label} has no pages to preview, so it can't be the Preview button's target.`);
  }
```

3. In `checkEnv`, wrap the `PREVIEW_SECRET` block (from `const preview = readEnvValue(envPath, 'PREVIEW_SECRET');` through the end of its `else if` branch) in `if (f.preview) { … }`.

In `scripts/dev.mts`, replace `const url = setPreviewTarget(frontend.name);` and the `Preview target:` log with:

```ts
const url = frontend.preview ? setPreviewTarget(frontend.name) : null;
```

```ts
console.log(url ? `Preview target: ${url}\n` : 'Preview target unchanged: this app has no pages to preview.\n');
```

In `scripts/setup.mts`, add this line to the final help text, after `yarn dev:tanstack`:

```
  yarn dev:liff          Strapi + the Maison demo app (docs/maison-demo)
```

In the root `package.json` `scripts`, add `"dev:liff": "node --import tsx ./scripts/dev.mts liff",`.

- [ ] **Step 5: Install and build**

```bash
cd /Users/paul/work/launchpad-fork-latest/liff && yarn install && yarn build
```

Expected: the install creates `node_modules` and fills `yarn.lock`, and `next build` finishes with the `/` route listed.

- [ ] **Step 6: Check the mock endpoint and a real exchange**

```bash
cd /Users/paul/work/launchpad-fork-latest/liff
node --env-file-if-exists=.env scripts/mock-line-verify.mjs &
npx -y wait-on tcp:4545
curl -s -X POST http://localhost:4545/verify -d "id_token=valid.U$(node -e "process.stdout.write('a'.repeat(32))")&client_id=1234567890"
echo
node --env-file=.env --input-type=module -e "
const res = await fetch(process.env.NEXT_PUBLIC_STRAPI_URL + '/api/strapi-oauth-mcp-manager/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: process.env.NEXT_PUBLIC_MAISON_CLIENT_ID,
    subject_token: 'valid.U' + 'a'.repeat(32),
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  }),
});
const body = await res.json();
console.log(res.status, typeof body.access_token === 'string' && body.access_token.startsWith('mcp_at_') ? 'session issued' : body);
"
kill $(lsof -tiTCP:4545 -sTCP:LISTEN)
```

Expected: the mock answers JSON with `"sub":"Uaaaa…"`, and the exchange prints `200 session issued`. This proves the chain from ID token to token exchange to session, with no LINE account.

- [ ] **Step 7: Check the frontend wiring**

Run: `cd /Users/paul/work/launchpad-fork-latest && yarn check:env`
Expected: no problems are reported for `liff`: it has `NEXT_PUBLIC_STRAPI_URL`, and needs no `PREVIEW_SECRET`.

- [ ] **Step 8: Commit**

```bash
git add liff/package.json liff/yarn.lock liff/tsconfig.json liff/next.config.mjs liff/postcss.config.mjs liff/tailwind.config.ts liff/vitest.config.ts liff/.env.example liff/.gitignore liff/scripts liff/app liff/components scripts/frontends.mts scripts/env.mts scripts/dev.mts scripts/setup.mts package.json
git commit -m "feat(liff): add the Maison app skeleton and the local LINE verify mock"
```

---

### Task 4: Sign-in, session and the MCP client

**Files:**
- Create: `liff/lib/config.ts`, `liff/lib/types.ts`, `liff/lib/liff.ts`, `liff/lib/session.ts`, `liff/lib/mcp.ts`, `liff/lib/maison.ts`
- Test: `liff/lib/session.test.ts`, `liff/lib/mcp.test.ts`

**Interfaces:**
- Consumes: the token endpoint `POST {strapi}/api/strapi-oauth-mcp-manager/oauth/token` (oauth-mcp-manager 1.1), and `{strapi}/mcp`
- Produces:
  - `config` (the public env) and `type Locale = 'ja' | 'en'`
  - `initLiff(): Promise<{ getIdToken: () => string; locale: Locale; mock: boolean }>`
  - `createSession({ strapiUrl, clientId, getIdToken, fetchImpl?, now? })`, returning `{ getToken(), refresh() }`, plus `SessionError { code }`
  - `createMcp({ strapiUrl, session, onRecord, connect? })`, returning `{ callTool(screen, name, args) }`
  - `ToolCallRecord`, `ToolError`, `toolErrorOf(result)`
  - `getMaison(): Promise<Maison>`, where `Maison = { locale; mock; session; callTool }`, and `onToolCall(listener)`

- [ ] **Step 1: Write the failing tests**

`liff/lib/session.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ID_TOKEN_TYPE, TOKEN_EXCHANGE, createSession } from './session';

const granted = (token: string, expiresIn = 3600) =>
  new Response(JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: expiresIn, scope: 'mcp' }), { status: 200 });
const base = { strapiUrl: 'http://strapi.test', clientId: 'mcp_client_app', getIdToken: () => 'valid.Uabc' };

describe('createSession', () => {
  it('exchanges the LINE ID token at the token endpoint', async () => {
    const fetchImpl = vi.fn(async () => granted('mcp_at_1'));
    const session = createSession({ ...base, fetchImpl });
    expect(await session.getToken()).toBe('mcp_at_1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://strapi.test/api/strapi-oauth-mcp-manager/oauth/token');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: TOKEN_EXCHANGE,
      client_id: 'mcp_client_app',
      subject_token: 'valid.Uabc',
      subject_token_type: ID_TOKEN_TYPE,
      resource: 'http://strapi.test/mcp',
    });
  });

  it('reuses the session until a minute before it expires', async () => {
    let now = 0;
    const fetchImpl = vi.fn().mockResolvedValueOnce(granted('mcp_at_1', 120)).mockResolvedValueOnce(granted('mcp_at_2', 120));
    const session = createSession({ ...base, fetchImpl, now: () => now });
    expect(await session.getToken()).toBe('mcp_at_1');
    now = 59_000;
    expect(await session.getToken()).toBe('mcp_at_1');
    now = 61_000;
    expect(await session.getToken()).toBe('mcp_at_2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shares one exchange between concurrent callers', async () => {
    const fetchImpl = vi.fn(async () => granted('mcp_at_1'));
    const session = createSession({ ...base, fetchImpl });
    expect(await Promise.all([session.getToken(), session.getToken(), session.refresh()])).toEqual(['mcp_at_1', 'mcp_at_1', 'mcp_at_1']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports the OAuth error code, then lets the next call try again', async () => {
    const rejected = new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'The LINE ID token is invalid or expired' }), { status: 400 });
    const fetchImpl = vi.fn().mockResolvedValueOnce(rejected).mockResolvedValueOnce(granted('mcp_at_2'));
    const session = createSession({ ...base, fetchImpl });
    await expect(session.getToken()).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(await session.getToken()).toBe('mcp_at_2');
  });
});
```

`liff/lib/mcp.test.ts`:

```ts
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, vi } from 'vitest';
import { createMcp, toolErrorOf, type ToolCallRecord } from './mcp';

const ok = (data: Record<string, unknown>) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
const unauthorized = () => new StreamableHTTPError(401, 'Error POSTing to endpoint: Unauthorized');
const fakeSession = () => {
  let issued = 1;
  return { getToken: vi.fn(async () => 'mcp_at_1'), refresh: vi.fn(async () => `mcp_at_${++issued}`) };
};
const client = (callTool: () => Promise<unknown>) => ({ callTool: vi.fn(callTool), close: vi.fn(async () => {}) });

describe('createMcp', () => {
  it('connects once with the session token and records every call for the agent view', async () => {
    const records: ToolCallRecord[] = [];
    const connected = client(async () => ok({ total: 1 }));
    const connect = vi.fn(async () => connected);
    const mcp = createMcp({ strapiUrl: 'http://strapi.test', session: fakeSession() as any, onRecord: (record) => records.push(record), connect: connect as any });
    await mcp.callTool('home', 'browse_collections', { locale: 'ja' });
    await mcp.callTool('collection', 'search_products', { collection: 'voyage' });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith('mcp_at_1');
    expect(records.map((r) => [r.id, r.screen, r.name])).toEqual([[1, 'home', 'browse_collections'], [2, 'collection', 'search_products']]);
    expect(records[1].args).toEqual({ collection: 'voyage' });
    expect(records[0].result?.structuredContent).toEqual({ total: 1 });
    expect(records[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('after a 401, exchanges a new token once, reconnects and retries', async () => {
    const expired = client(async () => { throw unauthorized(); });
    const fresh = client(async () => ok({ appointments: [] }));
    const connect = vi.fn().mockResolvedValueOnce(expired).mockResolvedValueOnce(fresh);
    const session = fakeSession();
    const mcp = createMcp({ strapiUrl: 'x', session: session as any, onRecord: () => {}, connect });
    expect((await mcp.callTool('visits', 'my_appointments', {})).structuredContent).toEqual({ appointments: [] });
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenLastCalledWith('mcp_at_2');
    expect(expired.close).toHaveBeenCalled();
  });

  it('gives up after one retry and records the failure', async () => {
    const connect = vi.fn(async () => client(async () => { throw unauthorized(); }));
    const session = fakeSession();
    const records: ToolCallRecord[] = [];
    const mcp = createMcp({ strapiUrl: 'x', session: session as any, onRecord: (record) => records.push(record), connect: connect as any });
    await expect(mcp.callTool('visits', 'my_appointments', {})).rejects.toThrow(/Unauthorized/);
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(records[0].error).toMatch(/Unauthorized/);
  });

  it('does not retry other failures', async () => {
    const connect = vi.fn(async () => client(async () => { throw new StreamableHTTPError(500, 'boom'); }));
    const session = fakeSession();
    const mcp = createMcp({ strapiUrl: 'x', session: session as any, onRecord: () => {}, connect: connect as any });
    await expect(mcp.callTool('home', 'browse_collections', {})).rejects.toThrow(/boom/);
    expect(session.refresh).not.toHaveBeenCalled();
  });
});

describe('toolErrorOf', () => {
  it("reads the Maison tools' error JSON", () => {
    const error = { code: 'boutique_closed', message: 'Closed.', hint: 'Try Saturday.' };
    expect(toolErrorOf({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error }) }] } as any)).toEqual(error);
  });

  it('wraps plain error text, and returns null for successes', () => {
    expect(toolErrorOf({ isError: true, content: [{ type: 'text', text: 'MCP error -32602: Tool x not found' }] } as any)).toEqual({
      code: 'error', message: 'MCP error -32602: Tool x not found', hint: '',
    });
    expect(toolErrorOf(ok({}) as any)).toBeNull();
    expect(toolErrorOf(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/paul/work/launchpad-fork-latest/liff && yarn test`
Expected: FAIL with "Failed to resolve import ./session" and "./mcp".

- [ ] **Step 3: Write the config and types**

`liff/lib/config.ts`:

```ts
/** Public settings. Next.js inlines NEXT_PUBLIC_* at build time, so each is read by its full name. */
export const config = {
  strapiUrl: (process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337').replace(/\/+$/, ''),
  clientId: process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '',
  liffMock: process.env.NEXT_PUBLIC_LIFF_MOCK !== 'false',
  liffId: process.env.NEXT_PUBLIC_LIFF_ID ?? '',
  demoLineUserId: process.env.NEXT_PUBLIC_DEMO_LINE_USER_ID || 'U4af4980629c1a7b3f1e2d3c4b5a69788',
  demoLocale: process.env.NEXT_PUBLIC_DEMO_LOCALE || 'ja',
};
```

`liff/lib/types.ts`:

```ts
export type Locale = 'ja' | 'en';

export interface CollectionSummary {
  slug: string;
  name: string;
  teaser: string;
  heroImageUrl: string | null;
  productCount: number;
}

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

export interface Product {
  locale: Locale;
  slug: string;
  sku: string;
  name: string;
  category: string;
  priceJpy: number;
  description: string;
  craftStory: string;
  dimensionsCm: { width: number; height: number; depth: number } | null;
  personalization: { offered: boolean; kinds: string[]; leadDays: number | null };
  images: Array<{ url: string; alt: string }>;
  occasions: string[];
  collection: { slug: string; name: string } | null;
  stock: Array<{ boutique: string; name: string; quantity: number }>;
}

export interface BoutiqueInfo {
  slug: string;
  name: string;
  city: string;
  address: string;
  hours: Array<{ weekday: string; opens: string; closes: string }>;
  openOnDate: boolean | null;
  hoursOnDate: { opens: string; closes: string } | null;
  stock: Array<{ product: string; quantity: number }>;
}

export interface Appointment {
  reference: string;
  status: 'requested' | 'confirmed';
  boutique: { slug: string; name: string };
  requestedFor: string;
  products: Array<{ slug: string; name: string }>;
  note: string;
  confirmationSent: boolean;
}
```

- [ ] **Step 4: Implement `liff/lib/session.ts`**

```ts
export const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';

export class SessionError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export interface SessionOptions {
  strapiUrl: string;
  clientId: string;
  getIdToken: () => string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * A customer's MCP session: the LINE ID token exchanged at oauth-mcp-manager's token endpoint.
 * Kept in memory only. There is no refresh token, so it exchanges the ID token again when needed.
 */
export const createSession = ({ strapiUrl, clientId, getIdToken, fetchImpl = fetch, now = Date.now }: SessionOptions) => {
  let current: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  const exchange = async (): Promise<string> => {
    const response = await fetchImpl(`${strapiUrl}/api/strapi-oauth-mcp-manager/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: TOKEN_EXCHANGE,
        client_id: clientId,
        subject_token: getIdToken(),
        subject_token_type: ID_TOKEN_TYPE,
        resource: `${strapiUrl}/mcp`,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== 'string') {
      throw new SessionError(body.error ?? 'server_error', body.error_description ?? `Sign-in failed (${response.status})`);
    }
    current = { token: body.access_token, expiresAt: now() + (Number(body.expires_in) || 3600) * 1000 };
    return current.token;
  };

  /** A new exchange. Concurrent callers share it. */
  const refresh = (): Promise<string> =>
    (pending ??= exchange().finally(() => {
      pending = null;
    }));

  return {
    /** The current session token, or a new one when there is none or it expires within a minute. */
    async getToken(): Promise<string> {
      if (current && current.expiresAt - now() > 60_000) return current.token;
      return refresh();
    },
    refresh,
  };
};

export type Session = ReturnType<typeof createSession>;
```

- [ ] **Step 5: Implement `liff/lib/mcp.ts`**

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { Session } from './session';

export interface ToolCallRecord {
  id: number;
  screen: string;
  name: string;
  args: Record<string, unknown>;
  result: CallToolResult | null;
  error: string | null;
  ms: number;
  at: string;
}

export interface ToolError {
  code: string;
  message: string;
  hint: string;
}

/** The `{ error: { code, message, hint } }` a Maison tool returns with isError, or null for a success. */
export const toolErrorOf = (result: CallToolResult | null): ToolError | null => {
  if (!result?.isError) return null;
  const item = result.content?.find((content) => content.type === 'text');
  const text = item && item.type === 'text' ? item.text : '';
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error?.code) return parsed.error as ToolError;
  } catch {
    // not JSON: fall through
  }
  return { code: 'error', message: text || 'The tool failed.', hint: '' };
};

type Connection = Pick<Client, 'callTool' | 'close'>;
type Connect = (token: string) => Promise<Connection>;

const connectTo =
  (strapiUrl: string): Connect =>
  async (token) => {
    const client = new Client({ name: 'maison-app', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${strapiUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      })
    );
    return client;
  };

const isUnauthorized = (error: unknown) => error instanceof StreamableHTTPError && error.code === 401;

/**
 * The screens' MCP connection to Strapi. Every call is recorded for the agent view.
 * A 401 (the session expired or was revoked) triggers one new token exchange and one retry.
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
  let connection: Promise<Connection> | null = null;
  let nextId = 1;

  const getConnection = (fresh = false): Promise<Connection> => {
    if (!connection || fresh) {
      const previous = connection;
      connection = (fresh ? session.refresh() : session.getToken())
        .then((token) => connect(token))
        .catch((error) => {
          connection = null;
          throw error;
        });
      previous?.then((old) => old.close()).catch(() => {});
    }
    return connection;
  };

  const callTool = async (screen: string, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> => {
    const started = performance.now();
    const record = (result: CallToolResult | null, error: string | null) =>
      onRecord({ id: nextId++, screen, name, args, result, error, ms: Math.round(performance.now() - started), at: new Date().toISOString() });
    try {
      let result: CallToolResult;
      try {
        result = (await (await getConnection()).callTool({ name, arguments: args })) as CallToolResult;
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
        result = (await (await getConnection(true)).callTool({ name, arguments: args })) as CallToolResult;
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

- [ ] **Step 6: Implement LIFF sign-in and the bootstrap**

`liff/lib/liff.ts`:

```ts
import type { ExtendedInit, LiffMockApi } from '@line/liff-mock';

import { config } from './config';
import type { Locale } from './types';

export interface LiffState {
  getIdToken: () => string;
  locale: Locale;
  mock: boolean;
}

const LINE_USER_ID = /^U[0-9a-f]{32}$/;
const DEMO_USER_KEY = 'maison.demoUser';
let ready: Promise<LiffState> | null = null;

export const toLocale = (language: string | undefined): Locale => (language?.toLowerCase().startsWith('ja') ? 'ja' : 'en');

/** Mock mode only: ?demoUser=U… signs in another demo customer in this tab (tests, second-customer check). */
const demoUserId = (): string => {
  const fromQuery = new URLSearchParams(window.location.search).get('demoUser');
  try {
    if (fromQuery && LINE_USER_ID.test(fromQuery)) window.sessionStorage.setItem(DEMO_USER_KEY, fromQuery);
    const stored = window.sessionStorage.getItem(DEMO_USER_KEY);
    if (stored && LINE_USER_ID.test(stored)) return stored;
  } catch {
    // storage unavailable: use the default demo customer
  }
  return config.demoLineUserId;
};

const init = async (): Promise<LiffState> => {
  const liff = (await import('@line/liff')).default;

  if (config.liffMock) {
    const { LiffMockPlugin } = await import('@line/liff-mock');
    liff.use(new LiffMockPlugin());
    await (liff.init as unknown as ExtendedInit)({ liffId: config.liffId || 'maison-demo', mock: true });
    const userId = demoUserId();
    // Always the function form: set() with a plain object replaces the whole mock store.
    (liff as unknown as { $mock: LiffMockApi }).$mock.set((previous) => ({
      ...previous,
      isLoggedIn: true,
      getIDToken: `valid.${userId}`,
      getAppLanguage: config.demoLocale,
      getLanguage: config.demoLocale,
    }));
  } else {
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return new Promise<LiffState>(() => {}); // the page is leaving for LINE Login
    }
  }

  if (!liff.getIDToken()) {
    throw new Error('LINE gave no ID token. The LIFF app needs the openid scope.');
  }
  return { getIdToken: () => liff.getIDToken() ?? '', locale: toLocale(liff.getAppLanguage()), mock: config.liffMock };
};

/** Initializes LIFF once per page load. Browser only. */
export const initLiff = (): Promise<LiffState> => (ready ??= init());
```

`liff/lib/maison.ts`:

```ts
import { config } from './config';
import { initLiff } from './liff';
import { createMcp, type ToolCallRecord } from './mcp';
import { createSession, type Session } from './session';
import type { Locale } from './types';

export interface Maison {
  locale: Locale;
  mock: boolean;
  session: Session;
  callTool: ReturnType<typeof createMcp>['callTool'];
}

type Listener = (record: ToolCallRecord) => void;
const listeners = new Set<Listener>();

/** Subscribe to every tool call the screens make. Returns the unsubscribe function. */
export const onToolCall = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

let maison: Promise<Maison> | null = null;

/** LINE sign-in, the customer session and the MCP connection, set up once per page load. Browser only. */
export const getMaison = (): Promise<Maison> =>
  (maison ??= (async () => {
    if (!config.clientId) throw new Error('NEXT_PUBLIC_MAISON_CLIENT_ID is not set. Run `yarn maison:setup` and restart the app.');
    const liff = await initLiff();
    const session = createSession({ strapiUrl: config.strapiUrl, clientId: config.clientId, getIdToken: liff.getIdToken });
    await session.getToken(); // sign in now, so the first screen doesn't wait for it
    const mcp = createMcp({
      strapiUrl: config.strapiUrl,
      session,
      onRecord: (record) => listeners.forEach((listener) => listener(record)),
    });
    return { locale: liff.locale, mock: liff.mock, session, callTool: mcp.callTool };
  })());
```

- [ ] **Step 7: Run the tests and type check**

Run: `cd /Users/paul/work/launchpad-fork-latest/liff && yarn test && yarn typecheck`
Expected: 10 tests pass, and tsc exits 0.

If `yarn typecheck` reports that `ExtendedInit` or `LiffMockApi` isn't exported, read `node_modules/@line/liff-mock/dist/type.d.ts` and import the names it exports. The research against 1.0.4 found both there.

- [ ] **Step 8: Commit**

```bash
cd /Users/paul/work/launchpad-fork-latest
git add liff/lib
git commit -m "feat(liff): add LINE sign-in, the customer session and the MCP client"
```

---

### Task 5: Shared UI and the catalog and visits screens

**Files:**
- Create:
  - `liff/lib/copy.ts`, `liff/lib/format.ts`, `liff/lib/status.ts`, `liff/lib/use-tool.ts`
  - `liff/components/maison-provider.tsx`, `header.tsx`, `screen.tsx`, `agent-drawer.tsx`, `product-grid.tsx`, `status-note.tsx`
  - `liff/app/collections/[slug]/page.tsx`, `liff/app/visits/page.tsx`, `liff/app/visits/[reference]/page.tsx`
- Modify: `liff/app/layout.tsx`, `liff/app/page.tsx`
- Test: `liff/lib/format.test.ts`

**Interfaces:**
- Consumes: `getMaison`, `onToolCall`, `toolErrorOf`, `ToolCallRecord` and the types (Task 4)
- Produces:
  - `useMaison()`, returning `{ status, error, maison, locale, calls, agentView, setAgentView }`
  - `useTool<T>(screen, name, args)`, returning `{ loading, data, error, retry }`
  - `<Screen name tools>`, `<ProductGrid>`, `<StatusNote>`
  - `COPY[locale]`
  - `yen`, `visitTime`, `mediaUrl`, `nextSaturday`, `tomorrow`, `timeSlots`

- [ ] **Step 1: Write the failing test `liff/lib/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mediaUrl, nextSaturday, timeSlots, visitTime, yen } from './format';

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
});
```

`Intl` writes the yen sign as a full-width `￥` in `ja-JP`. If your Node prints `¥` instead, keep what `yen` produces: the test pins the format this Node version uses.

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test`
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
  },
} as const;
```

Run: `yarn test`
Expected: PASS.

- [ ] **Step 4: Write the provider, the tool hook and the shared components**

`liff/components/maison-provider.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { config } from '@/lib/config';
import { toLocale } from '@/lib/liff';
import { getMaison, onToolCall, type Maison } from '@/lib/maison';
import type { ToolCallRecord } from '@/lib/mcp';
import type { Locale } from '@/lib/types';

interface MaisonContext {
  status: 'starting' | 'ready' | 'error';
  error: string | null;
  maison: Maison | null;
  locale: Locale;
  calls: ToolCallRecord[];
  agentView: boolean;
  setAgentView: (on: boolean) => void;
}

const Context = createContext<MaisonContext | null>(null);
const AGENT_VIEW_KEY = 'maison.agentView';

export function MaisonProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<MaisonContext, 'status' | 'error' | 'maison'>>({ status: 'starting', error: null, maison: null });
  const [calls, setCalls] = useState<ToolCallRecord[]>([]);
  const [agentView, setAgentViewState] = useState(false);

  useEffect(() => {
    try {
      setAgentViewState(window.localStorage.getItem(AGENT_VIEW_KEY) === 'on');
    } catch {
      // storage unavailable: start with the agent view off
    }
    const stop = onToolCall((record) => setCalls((previous) => [...previous.slice(-49), record]));
    getMaison().then(
      (maison) => setState({ status: 'ready', error: null, maison }),
      (error: Error) => setState({ status: 'error', error: error.message, maison: null })
    );
    return stop;
  }, []);

  const setAgentView = useCallback((on: boolean) => {
    setAgentViewState(on);
    try {
      window.localStorage.setItem(AGENT_VIEW_KEY, on ? 'on' : 'off');
    } catch {
      // not remembered this time
    }
  }, []);

  const value = useMemo<MaisonContext>(
    () => ({ ...state, locale: state.maison?.locale ?? toLocale(config.demoLocale), calls, agentView, setAgentView }),
    [state, calls, agentView, setAgentView]
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
        if (!cancelled) setState({ loading: false, data: null, error: { code: 'network', message: error.message, hint: '' } });
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

`liff/components/status-note.tsx`:

```tsx
'use client';

import type { ToolError } from '@/lib/mcp';
import { COPY } from '@/lib/copy';
import { useMaison } from './maison-provider';

/** Loading and error states for one tool call. */
export function StatusNote({ loading, error, retry }: { loading: boolean; error: ToolError | null; retry: () => void }) {
  const { locale } = useMaison();
  const t = COPY[locale];
  if (error) {
    return (
      <div role="alert" className="mx-5 my-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p>{error.message}</p>
        {error.hint && <p className="mt-1 text-xs text-red-800/80">{error.hint}</p>}
        <button type="button" onClick={retry} className="mt-3 min-h-[44px] text-xs underline">
          {t.retry}
        </button>
      </div>
    );
  }
  return loading ? <p className="px-5 py-8 text-sm text-mist">{t.loading}</p> : null;
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
      className="fixed inset-x-0 bottom-0 z-20 max-h-[45%] overflow-y-auto rounded-t-2xl bg-ink p-4 font-mono text-[11px] text-ivory shadow-2xl min-[500px]:absolute"
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
import { AgentDrawer } from './agent-drawer';
import { Header } from './header';
import { useMaison } from './maison-provider';

/** Every screen: header, the MCP tools it uses, sign-in state, and the agent view. */
export function Screen({ name, tools, children }: { name: string; tools: string[]; children: ReactNode }) {
  const { status, error, locale } = useMaison();
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
      {status === 'starting' && <p className="px-5 py-10 text-sm text-mist">{t.signingIn}</p>}
      {status === 'error' && (
        <p role="alert" className="px-5 py-10 text-sm text-red-800">
          {t.signInFailed}: {error}
        </p>
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

- [ ] **Step 5: Wrap the app in the provider**

In `liff/app/layout.tsx`, add `import { MaisonProvider } from '@/components/maison-provider';`, and change the body to:

```tsx
      <body>
        <PhoneFrame>
          <MaisonProvider>{children}</MaisonProvider>
        </PhoneFrame>
      </body>
```

- [ ] **Step 6: Write the home, collection and visits screens**

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

`liff/lib/status.ts`, shared by both visits screens. It lives in `lib/`, because Next.js only allows a page file to export its page component and route config:

```ts
import { COPY } from './copy';
import type { Appointment, Locale } from './types';

export const statusLabel = (visit: Appointment, locale: Locale) => {
  const t = COPY[locale];
  if (visit.status === 'requested') return t.requested;
  return visit.confirmationSent ? t.confirmationSent : t.confirmed;
};
```

- [ ] **Step 7: Build and look at it**

```bash
cd /Users/paul/work/launchpad-fork-latest/liff
yarn test && yarn typecheck && yarn build
yarn dev
```

With Strapi running on 1340, open `http://localhost:3003` in a desktop browser.

Expected:
1. The app sits in a phone frame, and shows "LINEでサインインしています…", then the three collections.
2. Clicking Voyage lists 4 products, most expensive first.
3. "エージェントビュー" opens a dark drawer. On the home screen it lists `browse_collections` with `{"locale":"ja"}` and `collections: 3`.
4. "ご来店予約" shows "ご来店予約はまだありません。"

Stop the dev server with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
cd /Users/paul/work/launchpad-fork-latest
git add liff/lib liff/components liff/app
git commit -m "feat(liff): add the catalog and visits screens with the agent view"
```

---

### Task 6: Product page and the booking sheet

**Files:**
- Create: `liff/components/booking-sheet.tsx`, `liff/app/products/[slug]/page.tsx`

**Interfaces:**
- Consumes: `useTool`, `useMaison`, `Screen`, `StatusNote`, `ProductImage`, `COPY`, `yen`, `nextSaturday`, `tomorrow`, `timeSlots`, `toolErrorOf` (Tasks 4 and 5). Tools: `get_product`, `get_boutiques({ productSlugs, date })`, `request_appointment`.
- Produces: `/products/[slug]`, and `<BookingSheet product onClose>`, which on success navigates to `/visits?ref=<reference>`.

The sheet checks opening hours with `get_boutiques` for the chosen date before it lets the customer send. A closed day shows a message and disables the button, so `boutique_closed` from the tool is only a backstop.

- [ ] **Step 1: Write `liff/components/booking-sheet.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { COPY } from '@/lib/copy';
import { nextSaturday, timeSlots, tomorrow } from '@/lib/format';
import { toolErrorOf, type ToolError } from '@/lib/mcp';
import type { Appointment, BoutiqueInfo, Product } from '@/lib/types';
import { useTool } from '@/lib/use-tool';
import { useMaison } from './maison-provider';

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

  const availability = useTool<{ boutiques: BoutiqueInfo[] }>('product', 'get_boutiques', { productSlugs: [product.slug], date, locale });
  const boutiques = availability.data?.boutiques ?? [];
  const chosen = boutiques.find((candidate) => candidate.slug === boutique);
  const open = chosen?.openOnDate === true;
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
    <div role="dialog" aria-modal="true" aria-label={t.bookVisit} className="fixed inset-0 z-30 flex items-end bg-black/40 min-[500px]:absolute">
      <form onSubmit={submit} className="max-h-[90%] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-ivory p-5">
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

        {availability.loading && <p className="text-xs text-mist">{t.loading}</p>}
        {!availability.loading && chosen && !open && (
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
            {problem.message} {problem.hint}
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
  const product = useTool<{ product: Product }>('product', 'get_product', { slug, locale });
  const [booking, setBooking] = useState(false);
  const item = product.data?.product;

  return (
    <Screen name="product" tools={['get_product', 'get_boutiques', 'request_appointment']}>
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
cd /Users/paul/work/launchpad-fork-latest/liff
yarn typecheck && yarn build && yarn dev
```

Open `http://localhost:3003/products/weekender-50`.

Expected:
1. The product shows its price (￥385,000), craft story, personalization, and stock with Ginza at 2.
2. "来店を予約" opens the sheet, set to next Saturday at Ginza, 14:00. Sending it lands on "ご来店予約", with the new visit marked "ブティックの確認待ち".
3. Choosing 大阪心斎橋店 on a Tuesday shows the closed message, and the send button is disabled.
4. The agent view on the product screen lists `get_product`, `get_boutiques` and `request_appointment`.

- [ ] **Step 4: Commit**

```bash
cd /Users/paul/work/launchpad-fork-latest
git add liff/components/booking-sheet.tsx "liff/app/products"
git commit -m "feat(liff): add the product page and the booking sheet"
```

---

### Task 7: The concierge

**Files:**
- Create: `liff/lib/model.ts`, `liff/lib/concierge.ts`, `liff/app/api/concierge/route.ts`, `liff/components/chat-parts.tsx`, `liff/app/concierge/page.tsx`
- Test: `liff/lib/model.test.ts`, `liff/lib/concierge.test.ts`

**Interfaces:**
- Consumes: `getMaison().session.getToken()` (Task 4); Strapi `/mcp` with the customer's token and `x-maison-surface: concierge` (Maison plugin)
- Produces:
  - `conciergeModel(env?): LanguageModel`
  - `handleConcierge(request, { model, createMcpClient, strapiUrl, now? }): Promise<Response>`, plus `SURFACE_HEADER`
  - `POST /api/concierge`, taking `{ messages: UIMessage[], locale }` with `Authorization: Bearer mcp_at_…`
  - `/concierge`

Everything here uses the AI SDK 7 APIs listed under Global constraints.

- [ ] **Step 1: Write the failing tests**

`liff/lib/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { conciergeModel } from './model';

describe('conciergeModel', () => {
  it('uses Anthropic directly when ANTHROPIC_API_KEY is set', () => {
    const model = conciergeModel({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(typeof model).toBe('object');
    expect((model as { modelId: string }).modelId).toBe('claude-sonnet-5');
  });

  it('otherwise goes through Vercel AI Gateway', () => {
    expect(conciergeModel({})).toBe('anthropic/claude-sonnet-5');
  });
});
```

`liff/lib/concierge.test.ts`:

```ts
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { SURFACE_HEADER, handleConcierge } from './concierge';

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

Run: `cd /Users/paul/work/launchpad-fork-latest/liff && yarn test`
Expected: FAIL with "Failed to resolve import ./model" and "./concierge".

- [ ] **Step 3: Implement the model choice and the handler**

`liff/lib/model.ts`:

```ts
import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

/** Claude Sonnet 5: directly with ANTHROPIC_API_KEY, otherwise through Vercel AI Gateway (AI_GATEWAY_API_KEY, or OIDC on Vercel). */
export const conciergeModel = (env: Record<string, string | undefined> = process.env): LanguageModel =>
  env.ANTHROPIC_API_KEY ? anthropic('claude-sonnet-5') : 'anthropic/claude-sonnet-5';
```

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
1. Use the tools for every fact about products, prices, stock and opening hours. Never invent products, prices, availability or hours.
2. Before calling request_appointment, restate the boutique, date, time and products in one short sentence, and wait for the customer's yes.
3. Write requestedFor as ISO 8601 with the +09:00 offset, for example 2026-10-10T14:00:00+09:00.
4. Never say a visit is confirmed. Say it is requested, and that the boutique will confirm it on LINE.
5. If a tool returns an error, follow its hint or ask the customer.
6. ${locale === 'ja' ? 'Reply in polite Japanese (keigo).' : 'Reply in English.'} Keep replies to two or three short sentences. The app shows product cards, so don't repeat their details.
7. Suggest at most three products at a time.`;

export interface ConciergeDeps {
  model: LanguageModel;
  createMcpClient: typeof createMCPClient;
  strapiUrl: string;
  now?: () => Date;
}

/**
 * Claude with the Maison tools, acting as the signed-in customer. The customer's own session
 * token goes to Strapi unchanged; the route adds no credential of its own.
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
        onError: (error) => (error instanceof Error ? error.message : 'The concierge had a problem.'),
      }),
    });
  } catch (error) {
    await close();
    throw error;
  }
}
```

`liff/app/api/concierge/route.ts`:

```ts
import { createMCPClient } from '@ai-sdk/mcp';

import { handleConcierge } from '@/lib/concierge';
import { conciergeModel } from '@/lib/model';

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleConcierge(request, {
    model: conciergeModel(),
    createMcpClient: createMCPClient,
    strapiUrl: (process.env.STRAPI_URL ?? process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337').replace(/\/+$/, ''),
  });
}
```

Run: `yarn test`
Expected: all unit tests pass. If `MockLanguageModelV4` or the chunk shapes don't match the installed `ai`, check `node_modules/ai/docs` ("Testing") and `ai/test`'s types, and fix the test fixture rather than the handler.

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
import { COPY } from '@/lib/copy';
import { getMaison } from '@/lib/maison';

const CONCIERGE_TOOLS = ['browse_collections', 'search_products', 'get_product', 'get_boutiques', 'request_appointment', 'my_appointments'];

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
        {busy && <p className="text-xs text-mist">…</p>}
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error.message}
          </p>
        )}
      </div>
      <div className="sticky bottom-0 space-y-2 border-t border-ink/10 bg-ivory px-5 py-3">
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

On the concierge screen the tool calls happen on the server. They show as chips in the conversation, so the agent drawer there stays empty by design.

- [ ] **Step 5: Try it with a real model**

Put a key in `liff/.env`: either `ANTHROPIC_API_KEY`, or `AI_GATEWAY_API_KEY`. Never commit the file. Then:

```bash
cd /Users/paul/work/launchpad-fork-latest/liff && yarn typecheck && yarn dev
```

Open `http://localhost:3003/concierge`, and tap the first suggestion.

Expected:
1. Chips appear: `search_products ✓ 5件`, maybe `get_boutiques ✓`. Up to three product cards follow, starting with the Weekender 50.
2. The reply is short, in keigo, and restates the Ginza Saturday 14:00 visit, asking for a yes.
3. Tap "はい、お願いします。". A `request_appointment ✓` chip and an appointment card say "ブティックの確認待ち". The reply says the boutique will confirm on LINE, and never says confirmed.
4. In the Strapi admin (`http://localhost:1340/admin`), under Content Manager → Maison appointment, the new draft shows `createdVia: concierge`.

If the concierge breaks a rule, fix the instructions in `lib/concierge.ts` and rerun `yarn test`.

- [ ] **Step 6: Commit**

```bash
cd /Users/paul/work/launchpad-fork-latest
git add liff/lib/model.ts liff/lib/model.test.ts liff/lib/concierge.ts liff/lib/concierge.test.ts liff/app/api liff/app/concierge liff/components/chat-parts.tsx
git commit -m "feat(liff): add the Claude concierge over the customer's MCP session"
```

---

### Task 8: End-to-end tests in the browser

**Files:**
- Create: `liff/playwright.config.ts`, `liff/e2e/global-setup.ts`, `liff/e2e/maison.spec.ts`

**Interfaces:**
- Consumes: the running Strapi (1340) and app (3003); admin `POST /admin/login` and `POST /maison/demo/reset`
- Produces: `yarn test:e2e`

These run against servers you've already started, in mock mode. They cover the sign-in chain, the screens, booking, the closed-day guard, the agent view, and isolation between customers. The concierge is covered by Task 7's contract test, because a live model run isn't deterministic.

- [ ] **Step 1: Write the configuration and the global setup**

`liff/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

/** Runs against servers you already started: Strapi, and `yarn dev` in liff/. */
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
});
```

`liff/e2e/global-setup.ts`:

```ts
/** Deletes demo appointments first, so each run starts clean (a customer may only have 3 open requests). */
export default async function globalSetup() {
  const strapiUrl = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337';
  const email = process.env.LOCAL_TEST_ADMIN_EMAIL;
  const password = process.env.LOCAL_TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Run the tests with `yarn test:e2e`, which loads LOCAL_TEST_ADMIN_EMAIL and LOCAL_TEST_ADMIN_PASSWORD from strapi/.env.');
  }
  const login = await fetch(`${strapiUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { data } = (await login.json()) as { data?: { token?: string } };
  const reset = await fetch(`${strapiUrl}/maison/demo/reset`, { method: 'POST', headers: { Authorization: `Bearer ${data?.token}` } });
  if (!reset.ok) throw new Error(`Resetting demo appointments failed with ${reset.status}`);
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
  await openWeekender(page);
  await page.getByRole('button', { name: /Book a visit|来店を予約/ }).click();
  await page.getByLabel(/Boutique|ブティック/).selectOption('osaka');
  await page.getByLabel(/Date|日付/).fill(next(2));
  await expect(page.getByText(/Closed on this day|この日は休業日です/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Send request|リクエストを送る/ })).toBeDisabled();
});

test('the agent view shows the MCP tools behind each screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('switch', { name: /Agent view|エージェントビュー/ }).click();
  await expect(page.getByTestId('agent-call').first()).toContainText('browse_collections');
  await page.getByTestId('collection-card').first().click();
  await expect(page.getByTestId('agent-call').filter({ hasText: 'search_products' })).toBeVisible();
});

test("a second customer doesn't see the first customer's visits", async ({ page }) => {
  await page.goto(`/visits?demoUser=${SECOND_CUSTOMER}`);
  await expect(page.getByText(/No visits yet|ご来店予約はまだありません/)).toBeVisible();
  await expect(page.getByTestId('visit')).toHaveCount(0);
});
```

The tests run in file order with one worker. The first test leaves the default customer with a visit, so the last test checks that the second customer can't see it.

- [ ] **Step 3: Install the browser and run the tests**

With Strapi on 1340, and `yarn dev` running in `liff/`:

```bash
cd /Users/paul/work/launchpad-fork-latest/liff
npx playwright install chromium
yarn test:e2e
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
cd /Users/paul/work/launchpad-fork-latest
git add liff/playwright.config.ts liff/e2e
git commit -m "test(liff): add browser tests for booking, the agent view and customer isolation"
```

---

### Task 9: Ops agent, runbook, rehearsal and pull request

**Files:**
- Create: `docs/maison-demo/README.md`

**Interfaces:**
- Consumes: `strapi/.tmp/maison-ops-token` (Task 2); the tools `list_pending_confirmations`, `record_confirmation` and the `send_pending_confirmations` prompt (Maison plugin)
- Produces:
  - the runbook: setup, the 3-minute run, fallbacks, options A and B, and the QBurst handoff
  - a rehearsed demo
  - the pull request

- [ ] **Step 1: Write `docs/maison-demo/README.md`**

````markdown
# Maison demo: from UX to AX

A fictional luxury house served to people and agents through Strapi's built-in MCP server:
- **UX:** catalog screens in an app built for LINE
- **AX for the customer:** a Claude concierge acting as the signed-in customer
- **The human gate:** staff publish requests in the Strapi admin
- **AX for staff:** an ops agent in Claude Desktop

LINE sign-in is simulated with LINE's official LIFF mock. Everything else is the production path. The LINE MINI App side is presented by QBurst (see "Handoff").

Everything runs on one laptop: Strapi, the Maison app on port 3003, and a local stand-in for LINE's ID-token verify endpoint on port 4545.

## One-time setup

1. **Plugins.** Build and yalc-link the two plugins into `strapi/`:

   ```bash
   cd ../plugin-dev/plugins/strapi-store-demo-mcp && npm run link
   cd ../strapi-oauth-mcp-manager && npm run build && npx -y yalc@1.0.0-pre.53 push
   cd <LaunchPad>/strapi && npx -y yalc@1.0.0-pre.53 add --link strapi-store-demo-mcp strapi-oauth-mcp-manager && yarn install
   ```

2. **`strapi/.env`.** Set `MAISON_DEMO=true` and a real `ENCRYPTION_KEY`, and keep the LINE values from `.env.example`: `LINE_LOGIN_CHANNEL_ID=1234567890` and `LINE_VERIFY_URL=http://localhost:4545/verify`.
3. **Start everything:** `yarn dev:liff`. That starts Strapi and the app, and the app's `dev` script also starts the mock verify endpoint. If port 1337 is taken, set `PORT` in `strapi/.env`.
4. **Load the demo:** `yarn maison:setup` (prefix `STRAPI_URL=http://localhost:<port>` if needed). It loads the catalog, creates the "Maison customer" and "Maison ops" tokens and the "Maison app" OAuth client, and writes the app's client ID to `liff/.env`. Restart the app afterwards.
5. **Concierge model:** put `ANTHROPIC_API_KEY` (or `AI_GATEWAY_API_KEY`) in `liff/.env`.
6. **Claude Desktop (the ops agent):** edit `~/Library/Application Support/Claude/claude_desktop_config.json`, then quit and reopen Claude Desktop with ⌘Q:

   ```json
   {
     "mcpServers": {
       "maison-ops": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "http://localhost:1337/mcp", "--header", "Authorization:${MAISON_OPS_AUTH}"],
         "env": { "MAISON_OPS_AUTH": "Bearer <contents of strapi/.tmp/maison-ops-token>" }
       }
     }
   }
   ```

   Use Strapi's real port in the URL. Check that the connector lists `list_pending_confirmations` and `record_confirmation`.

## Before going on stage

- [ ] Put the laptop on a phone hotspot. Only the concierge needs the internet.
- [ ] Run `yarn dev:liff`. Wait for Strapi's health check and the app.
- [ ] In the Strapi admin: **Maison** → Load demo catalog, then Reset demo appointments.
- [ ] Open `http://localhost:3003` once. Sign-in is automatic, and the collections appear.
- [ ] In Claude Desktop, check the maison-ops tools are there.
- [ ] Browser windows: the app (phone frame) and the Strapi admin (Content Manager → Maison appointment).

## The 3-minute run

| Time | Beat | Do |
|---|---|---|
| 0:00–0:40 | UX | Browse Voyage, then the Weekender 50. Flip **Agent view**: every screen is an MCP tool call, the same tools an agent uses. |
| 0:40–1:30 | AX for the customer | Concierge: tap the first suggestion, then "はい、お願いします。". Chips show each tool. The request says it's awaiting the boutique. |
| 1:30–2:00 | The human gate | In the Strapi admin, open the new draft (`createdVia: concierge`) and **Publish**. |
| 2:00–2:40 | AX for staff | Claude Desktop: "Which confirmed visits still need a LINE confirmation?" It lists the visit and its ready-made LINE message, and can't approve or edit anything. |
| 2:40–3:00 | Handoff | The integration slide. "Everything is ready for a LINE MINI App: sign-in, tools, and the message." QBurst takes over. |

**Fallbacks:**
- **The concierge stalls:** use "来店を予約" on the product page. It calls the same `request_appointment` tool.
- **Claude Desktop fails:** show the published visit in the admin, and walk through the slide.
- **Last resort:** the recorded run.

## Option A: a real LINE message on your phone

1. In LINE Developers, create a provider and an Official Account with the Messaging API. Check first that your account can create one from your region.
2. Add the Official Account as a friend on your phone.
3. Copy **Your user ID** from the Messaging API channel's Basic settings into `liff/.env` as `NEXT_PUBLIC_DEMO_LINE_USER_ID`. The mock sign-in then acts as you, as that provider sees you. Restart the app.
4. Issue a channel access token, and add LINE Bot MCP to Claude Desktop:

   ```json
   "line-bot": {
     "command": "npx",
     "args": ["-y", "@line/line-bot-mcp-server"],
     "env": { "CHANNEL_ACCESS_TOKEN": "<channel access token>" }
   }
   ```

5. In the 2:00 beat, run the **send_pending_confirmations** prompt instead of asking. The agent checks you're reachable (`get_profile`), pushes the message, and records it as sent. "My visits" then shows "確定 · LINEで送信済み".

The message's button opens `MAISON_LIFF_URL`, which only works from the phone if the app is public (option B).

## Option B: the real app inside LINE

1. Create a LINE Login channel under the same provider, with a LIFF app. Its endpoint is the app's public https URL, its scopes are `openid` and `profile`, and its size is `full`.
2. Make Strapi reachable from the phone: Strapi Cloud or a tunnel. Set `PUBLIC_URL` and `MAISON_APP_ORIGIN` in `strapi/.env`.
3. In `liff/.env`, set `NEXT_PUBLIC_LIFF_MOCK=false` and `NEXT_PUBLIC_LIFF_ID`.
4. In `strapi/.env`, set `LINE_LOGIN_CHANNEL_ID` to the channel's ID, `MAISON_LIFF_URL=https://liff.line.me/<LIFF ID>`, and remove `LINE_VERIFY_URL`.

A **LINE MINI App** is the same app on a MINI App channel, which needs a Japan-registered organization or resident. The Official Account must be in the same provider; otherwise user IDs differ, and confirmations can't be delivered. A verified MINI App can send service messages instead of Official Account pushes.

## Handoff: the integration slide, and what's ready for QBurst

**Slide: plugging in a LINE MINI App**
1. The MINI App calls `liff.getIDToken()`.
2. oauth-mcp-manager exchanges it for a short-lived session, after LINE verifies it (RFC 8693).
3. The MINI App, and any agent working for that customer, calls the Maison tools on Strapi `/mcp`.
4. Staff approve in Strapi. The ops agent delivers the ready-made LINE message: through the Messaging API today, and as a MINI App service message once verified.

**What's ready** (send this to QBurst before the event):

- **Token endpoint:** `POST {STRAPI}/api/strapi-oauth-mcp-manager/oauth/token`, as a form:

  | Parameter | Value |
  |---|---|
  | `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` |
  | `client_id` | the LINE client's ID |
  | `subject_token` | the LINE ID token |
  | `subject_token_type` | `urn:ietf:params:oauth:token-type:id_token` |

  It returns `{ access_token, expires_in }`, with no refresh token.
- **MCP:** `POST {STRAPI}/mcp` with `Authorization: Bearer <access_token>`.
  - Customer tools: `browse_collections`, `search_products`, `get_product`, `get_boutiques`, `request_appointment`, `my_appointments`
  - Errors come back as `{ error: { code, message, hint } }`.
- **Confirmation:** `list_pending_confirmations` returns each LINE user ID with a flex message, ready for the Messaging API.
- **Channels:** the MINI App channel and the Messaging API channel must be in one provider.
````

- [ ] **Step 2: Connect Claude Desktop and check the ops agent**

Paste the ops token from `strapi/.tmp/maison-ops-token` into the Claude Desktop config (Step 1's snippet, with port 1340). Quit and reopen Claude Desktop with ⌘Q. Then:

1. Book a visit in the app, and publish it in the Strapi admin.
2. In Claude Desktop, ask: "Which confirmed visits still need a LINE confirmation?"

Expected: Claude calls `list_pending_confirmations`, and shows the visit's reference, `10月…(土) 14:00`, 銀座本店 and the flex message. Its tool list has only `list_pending_confirmations` and `record_confirmation`, plus `log` in development. It can't find a tool to publish or edit content.

- [ ] **Step 3: Rehearse the run**

Follow "Before going on stage" and "The 3-minute run" in the runbook, three times, resetting demo appointments between runs.

Expected:
- **Each beat works,** and the whole run fits in 3 minutes.
- **The concierge** never says a visit is confirmed.
- **The Book button fallback** works with the network off. Only the concierge needs the internet, because Strapi, the app and the mock all run locally.

Record the backup video once a run is clean.

- [ ] **Step 4: Commit, push and open the pull request**

```bash
cd /Users/paul/work/launchpad-fork-latest
git add docs/maison-demo/README.md
git commit -m "docs: add the Maison demo runbook and the QBurst handoff"
git push -u origin feat/maison-demo
gh pr create --repo PaulBratslavsky/LaunchPad --base main --title "feat: Maison demo (UX to AX with Strapi MCP)" --body-file - <<'BODY'
Adds the "UX to AX" demo for the QBurst × LY Corporation event (7 October 2026). The runbook is `docs/maison-demo/README.md`.

- **Strapi:** loads the Maison plugin and strapi-oauth-mcp-manager 1.1 when `MAISON_DEMO=true`, and is unchanged otherwise. Also adds `server.url`, `admin.secrets.encryptionKey`, and CORS for the app and MCP headers. `yarn maison:setup` creates the demo's tokens and OAuth client.
- **`liff/`:** the Maison app, a LIFF app (LIFF mock on stage):
  - catalog, product, booking and visits screens, all through MCP tool calls, with an "agent view"
  - a Claude Sonnet 5 concierge acting as the signed-in customer
  - a local stand-in for LINE's ID token verify endpoint
- **Scripts:** the `liff` frontend (`yarn dev:liff`), with no preview target

The two plugins are yalc-linked from their repos until they're published. The `link:` entries stay out of the commit.

Tests: vitest (session, MCP client, concierge contract, formatting) and Playwright (booking, closed-day guard, agent view, customer isolation).
BODY
```

Expected: `gh` prints the pull request URL.
