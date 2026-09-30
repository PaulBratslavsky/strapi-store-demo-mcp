# oauth-mcp-manager 1.1 (customer sign-in with LINE) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer app exchange a LINE ID token for a short-lived MCP session (RFC 8693 token exchange). Tool plugins can then ask `resolveSubject(authorization)` which LINE user holds the session.

**Architecture:** A new identity provider module verifies LINE ID tokens with LINE's verify endpoint. The token endpoint gains a third grant type that only `line` clients may use. It creates a grant backed by the client's mapped admin token, with the customer's `subject` and no refresh token. `resolveSubject` is a read-only lookup from the raw `Authorization` header a tool receives, to that grant's `subject`.

The rules are pure functions with unit tests:
- which grant types each client may use
- LINE clients are public and must keep a mapped token
- subject masking

The database-backed paths are covered by a new end-to-end suite that points the plugin at a local mock of LINE's verify endpoint.

**Tech stack:** Strapi 5 plugin (`@strapi/sdk-plugin`), TypeScript, `node:test` with `tsx`, `@strapi/design-system` 2 for the admin page, Node's global `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-29-oauth-mcp-manager-line-design.md` in the strapi-store-demo-mcp repo, with the overview `2026-09-29-ax-luxury-demo-overview.md`.

## Global constraints

- **Repo:** `/Users/paul/work/plugin-dev/plugins/strapi-oauth-mcp-manager`, 1.0.0 at `046b629`. Work on `feat/line-token-exchange`; a hook blocks commits on `main`. Create the branch in its own command before committing.
- **No breaking changes.** The staff consent flow, dynamic client registration, PKCE, refresh rotation, reuse detection, revocation, discovery and the existing admin features keep working. The four existing e2e suites must pass unchanged.
- **Off unless configured.** Customer sign-in exists only when `identityProviders.line` is configured.
- **Token exchange values:**
  - grant type `urn:ietf:params:oauth:grant-type:token-exchange`
  - subject token type `urn:ietf:params:oauth:token-type:id_token`
  - issued token type `urn:ietf:params:oauth:token-type:access_token`
- **OAuth error statuses:** `OAuthError` for all OAuth failures. `invalid_request`, `unauthorized_client` and `invalid_grant` use status 400, and `temporarily_unavailable` uses 503.
- **Subjects are `line:` + LINE's `sub`** (`U` + 32 lowercase hex). Never log or return a full subject to the admin page; mask it as `line:Uaaa…aa`.
- **`resolveSubject` is read-only:** no `lastUsedAt` write and no revocation.
- **Customer grants:**
  - no refresh token
  - `refreshExpiresAt = expiresAt`, so cleanup and the admin page's "Expires" column keep working
  - `ownsAdminToken: false`, because they always use the client's mapped token
- **The database enforces neither `required` nor `unique`, and schema defaults apply only on create.** Rows created before 1.1 read `endUserProvider` as `null`, which means `none`.
- **Type checks** run with `npx tsc -p server/tsconfig.json --noEmit` and `npx tsc -p admin/tsconfig.json --noEmit`. Task 1 fixes the package scripts, which call Yarn's `run -T` in an npm repo.
- **Tests** run with `npm test` (`node --import tsx --test test/unit/*.test.ts`). Unit tests import pure functions from `server/src`, as the existing ones do.

## Review focus

These are the inputs the spec implies most likely to bite a real user. Each has a test in the task that owns the code.

1. **Clients created before 1.1** have `endUserProvider = NULL`. They must behave exactly as before: staff flows work, and token exchange is refused (Tasks 3 and 4).
2. **A LINE grant has no refresh token.** A `refresh_token` request from a LINE client is `unauthorized_client`. The grant's `refreshExpiresAt` equals `expiresAt`, so cleanup removes it (Tasks 4 and 7).
3. **An ID token for another LINE channel, or an expired one, is `invalid_grant`.** LINE being down or slow is `temporarily_unavailable` (503), never a 500 (Task 2).
4. **`resolveSubject` never returns a subject for a staff session, a plain admin token, a `Basic` header or an array header**, and never writes (Task 5).
5. **A LINE client can't lose its mapped token or become confidential.** Deactivating it ends every customer session (Tasks 3 and 7).

---

## File structure

```
server/src/utils/oauth-error.ts                          create: OAuthError (moved; re-exported from services/oauth)
server/src/utils/bearer.ts                               create: extractBearerToken (moved from the middleware)
server/src/utils/end-user.ts                             create: grant-type constants, client rules, subject masking
server/src/config/index.ts                               modify: identityProviders, endUserAccessTokenTtl
server/src/identity/types.ts                             create: IdentityProvider interface
server/src/identity/line.ts                              create: LINE ID token verification
server/src/identity/index.ts                             create: provider from config
server/src/content-types/mcp-oauth-client/schema.json    modify: endUserProvider; redirectUris optional
server/src/content-types/mcp-oauth-token/schema.json     modify: subject; refreshTokenHash optional
server/src/services/oauth.ts                             modify: clients, issueTokens, exchangeIdToken, resolveSubject, listGrants
server/src/controllers/oauth.ts                          modify: token grant dispatch, discovery metadata
server/src/controllers/admin.ts                          modify: createClient, overview
server/src/middlewares/mcp-oauth.ts                      modify: shared bearer parser, no ctx.state.mcpOAuthGrantId
admin/src/pages/HomePage.tsx                             modify: customer sign-in in the form, customer column, exchange details
test/unit/config.test.ts                                 create
test/unit/line-provider.test.ts                          create
test/unit/end-user.test.ts                               create
test/unit/token-exchange.test.ts                         create
test/unit/resolve-subject.test.ts                        create
test/e2e/mock-line-verify.mjs                            create: local stand-in for LINE's verify endpoint
test/e2e/line-exchange.mjs                               create
package.json, CHANGELOG.md, README.md                    modify
```

---

### Task 1: Branch, scripts, OAuthError module and configuration

**Files:**
- Modify: `package.json`, `server/src/services/oauth.ts:43-55`, `server/src/config/index.ts`
- Create: `server/src/utils/oauth-error.ts`
- Test: `test/unit/config.test.ts`

**Interfaces:**
- Produces:
  - `OAuthError` from `server/src/utils/oauth-error.ts`, still re-exported from `server/src/services/oauth.ts`
  - `PluginConfig.identityProviders: { line?: { channelId: string; verifyUrl?: string } }` and `PluginConfig.endUserAccessTokenTtl: number`, defaulting to `{}` and `3600`

- [ ] **Step 1: Branch**

```bash
cd /Users/paul/work/plugin-dev/plugins/strapi-oauth-mcp-manager
git checkout main && git pull --ff-only
git checkout -b feat/line-token-exchange
```

- [ ] **Step 2: Fix the type-check scripts**

In `package.json`, set:

```json
    "test:ts:front": "tsc -p admin/tsconfig.json --noEmit",
    "test:ts:back": "tsc -p server/tsconfig.json --noEmit",
```

Run: `npm run test:ts:back && npm run test:ts:front`
Expected: both exit 0, and `git status` shows no new `.js` files under `server/src`.

- [ ] **Step 3: Move `OAuthError` into its own module**

This lets the identity module use it without importing the service, which would be a circular import.

Create `server/src/utils/oauth-error.ts`:

```ts
/** An OAuth error response (RFC 6749 §5.2). `status` is the HTTP status to send. */
export class OAuthError extends Error {
  constructor(
    public error: string,
    public description: string,
    public status = 400
  ) {
    super(description);
  }

  toJSON() {
    return { error: this.error, error_description: this.description };
  }
}
```

In `server/src/services/oauth.ts`, delete the `OAuthError` class (L43-55), and add these next to the other imports:

```ts
import { OAuthError } from '../utils/oauth-error';

export { OAuthError };
```

Run: `npm test && npm run test:ts:back`
Expected: the existing unit tests pass, including `client-credentials.test.ts`, which imports `OAuthError` from the service. tsc exits 0.

- [ ] **Step 4: Write the failing test `test/unit/config.test.ts`**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../../server/src/config';

const validate = (value: Record<string, unknown>) => () => config.validator(value as any);

test('customer sign-in is off by default', () => {
  assert.deepEqual(config.default.identityProviders, {});
  assert.equal(config.default.endUserAccessTokenTtl, 3600);
});

test('accepts a LINE provider with a channel ID and an optional verify URL', () => {
  assert.doesNotThrow(validate({ identityProviders: { line: { channelId: '1657000000' } } }));
  assert.doesNotThrow(
    validate({ identityProviders: { line: { channelId: '1657000000', verifyUrl: 'http://localhost:4545/verify' } }, endUserAccessTokenTtl: 900 })
  );
});

test('rejects bad customer sign-in settings', () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ identityProviders: { line: {} } }, /channelId/],
    [{ identityProviders: { line: { channelId: '   ' } } }, /channelId/],
    [{ identityProviders: { line: { channelId: '1657000000', verifyUrl: 'not a url' } } }, /verifyUrl/],
    [{ identityProviders: { google: { clientId: 'x' } } }, /only supports "line"/],
    [{ identityProviders: 'line' }, /identityProviders/],
    [{ endUserAccessTokenTtl: 0 }, /endUserAccessTokenTtl/],
    [{ endUserAccessTokenTtl: 1.5 }, /endUserAccessTokenTtl/],
  ];
  for (const [value, message] of cases) {
    assert.throws(validate(value), message, JSON.stringify(value));
  }
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `node --import tsx --test test/unit/config.test.ts`
Expected: FAIL, because `identityProviders` is undefined and the validator accepts everything.

- [ ] **Step 6: Extend `server/src/config/index.ts`**

Add these types above `PluginConfig`:

```ts
export interface LineProviderConfig {
  /** Channel ID of the LINE Login or LINE MINI App channel whose ID tokens are accepted. */
  channelId: string;
  /** For tests and local development only: where to verify ID tokens. Defaults to LINE's endpoint. */
  verifyUrl?: string;
}

export interface IdentityProvidersConfig {
  line?: LineProviderConfig;
}
```

Add these fields to `PluginConfig`:

```ts
  /** Identity providers whose ID tokens customers can exchange for an MCP session. Empty means off. */
  identityProviders: IdentityProvidersConfig;
  /** Lifetime of a customer session from token exchange, in seconds. There is no refresh token. */
  endUserAccessTokenTtl: number;
```

Add to `default`:

```ts
    identityProviders: {},
    endUserAccessTokenTtl: 60 * 60,
```

Append to the end of `validator`:

```ts
    if (
      config.endUserAccessTokenTtl !== undefined &&
      (!Number.isInteger(config.endUserAccessTokenTtl) || config.endUserAccessTokenTtl <= 0)
    ) {
      throw new Error('[strapi-oauth-mcp-manager] config.endUserAccessTokenTtl must be a positive whole number of seconds');
    }
    const providers = config.identityProviders as unknown;
    if (providers !== undefined) {
      if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
        throw new Error('[strapi-oauth-mcp-manager] config.identityProviders must be an object, e.g. { line: { channelId } }');
      }
      const unknownProviders = Object.keys(providers).filter((key) => key !== 'line');
      if (unknownProviders.length > 0) {
        throw new Error(`[strapi-oauth-mcp-manager] config.identityProviders only supports "line" (got ${unknownProviders.join(', ')})`);
      }
      const line = (providers as IdentityProvidersConfig).line as Partial<LineProviderConfig> | undefined;
      if (line !== undefined) {
        if (typeof line?.channelId !== 'string' || line.channelId.trim() === '') {
          throw new Error('[strapi-oauth-mcp-manager] config.identityProviders.line.channelId must be your LINE channel ID');
        }
        if (line.verifyUrl !== undefined && (typeof line.verifyUrl !== 'string' || !/^https?:\/\/\S+$/.test(line.verifyUrl))) {
          throw new Error('[strapi-oauth-mcp-manager] config.identityProviders.line.verifyUrl must be an http(s) URL');
        }
      }
    }
```

- [ ] **Step 7: Run the tests and type check**

Run: `npm test && npm run test:ts:back`
Expected: all unit tests pass (3 new), and tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add package.json server/src/utils/oauth-error.ts server/src/services/oauth.ts server/src/config/index.ts test/unit/config.test.ts
git commit -m "feat: add identityProviders and endUserAccessTokenTtl config"
```

---

### Task 2: LINE identity provider

**Files:**
- Create: `server/src/identity/types.ts`, `server/src/identity/line.ts`, `server/src/identity/index.ts`
- Test: `test/unit/line-provider.test.ts`

**Interfaces:**
- Consumes: `OAuthError` (Task 1), `PluginConfig` (Task 1)
- Produces:
  - `interface IdentityProvider { id: 'line'; verify(idToken: string): Promise<{ subject: string; expiresAt: Date }> }`
  - `createLineProvider(settings: { channelId; verifyUrl? }, fetchImpl?: typeof fetch): IdentityProvider`
  - `LINE_VERIFY_URL`
  - `getLineProvider(config: PluginConfig): IdentityProvider | null`

LINE's endpoint is documented at https://developers.line.biz/en/reference/line-login/#verify-id-token. It takes `POST` with a form body of `id_token` and `client_id`. On success it answers 200 with the claims `iss`, `sub`, `aud` (the channel ID), `exp` (seconds) and `iat`. It answers 400 for an invalid or expired token, or a token for another channel.

- [ ] **Step 1: Write the failing test `test/unit/line-provider.test.ts`**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LINE_VERIFY_URL, createLineProvider } from '../../server/src/identity/line';
import { OAuthError } from '../../server/src/utils/oauth-error';

const CHANNEL = '1657000000';
const SUB = 'U4af4980629c1a7b3f1e2d3c4b5a69788';
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

const respond = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const provider = (fetchImpl: any, verifyUrl: string | undefined = 'http://line.test/verify') =>
  createLineProvider({ channelId: CHANNEL, verifyUrl }, fetchImpl);
const failsWith = (code: string, status = 400) => (error: unknown) =>
  error instanceof OAuthError && error.error === code && error.status === status;

test('returns line:<sub> for a valid token, posting the token and channel ID as a form', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fetchImpl = async (url: string, init: RequestInit) => {
    seen = { url, init };
    return respond(200, { iss: 'https://access.line.me', aud: CHANNEL, sub: SUB, exp: inAnHour() })();
  };
  const result = await provider(fetchImpl).verify('id-token-123');
  assert.equal(result.subject, `line:${SUB}`);
  assert.ok(result.expiresAt.getTime() > Date.now());
  assert.equal(seen?.url, 'http://line.test/verify');
  assert.equal(seen?.init.method, 'POST');
  const form = new URLSearchParams(String(seen?.init.body));
  assert.equal(form.get('id_token'), 'id-token-123');
  assert.equal(form.get('client_id'), CHANNEL);
});

test("uses LINE's endpoint when no verifyUrl is configured", async () => {
  let url = '';
  await provider(async (target: string) => {
    url = target;
    return respond(200, { aud: CHANNEL, sub: SUB, exp: inAnHour() })();
  }, undefined).verify('t');
  assert.equal(url, LINE_VERIFY_URL);
});

test('rejects another channel, an expired token and malformed subjects', async () => {
  const cases = [
    { aud: '9999999999', sub: SUB, exp: inAnHour() },
    { aud: CHANNEL, sub: SUB, exp: Math.floor(Date.now() / 1000) - 1 },
    { aud: CHANNEL, sub: 'U123', exp: inAnHour() },
    { aud: CHANNEL, sub: SUB.toUpperCase(), exp: inAnHour() },
    { aud: CHANNEL, exp: inAnHour() },
    { aud: CHANNEL, sub: SUB },
  ];
  for (const claims of cases) {
    await assert.rejects(provider(respond(200, claims)).verify('t'), failsWith('invalid_grant'), JSON.stringify(claims));
  }
});

test('maps a LINE 400 to invalid_grant', async () => {
  const lineSays = respond(400, { error: 'invalid_request', error_description: 'IdToken expired.' });
  await assert.rejects(provider(lineSays).verify('t'), failsWith('invalid_grant'));
});

test('maps network errors, timeouts, 5xx and unreadable answers to temporarily_unavailable (503)', async () => {
  const failures = [
    async () => {
      throw new TypeError('fetch failed');
    },
    async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    },
    respond(502, { message: 'bad gateway' }),
    async () => new Response('<html>oops</html>', { status: 200 }),
  ];
  for (const fetchImpl of failures) {
    await assert.rejects(provider(fetchImpl).verify('t'), failsWith('temporarily_unavailable', 503));
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test test/unit/line-provider.test.ts`
Expected: FAIL with "Cannot find module '../../server/src/identity/line'".

- [ ] **Step 3: Implement the provider**

`server/src/identity/types.ts`:

```ts
export interface VerifiedIdentity {
  /** Provider-scoped subject, e.g. "line:U4af4980629c1a7b3f1e2d3c4b5a69788". */
  subject: string;
  /** When the presented ID token expires. */
  expiresAt: Date;
}

export interface IdentityProvider {
  id: 'line';
  /** Throws OAuthError: invalid_grant for a bad token, temporarily_unavailable (503) when the provider can't answer. */
  verify(idToken: string): Promise<VerifiedIdentity>;
}
```

`server/src/identity/line.ts`:

```ts
import { OAuthError } from '../utils/oauth-error';
import type { IdentityProvider } from './types';

export const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

const LINE_USER_ID = /^U[0-9a-f]{32}$/;
const TIMEOUT_MS = 5000;

const invalid = () => new OAuthError('invalid_grant', 'The LINE ID token is invalid or expired');
const unavailable = () =>
  new OAuthError('temporarily_unavailable', 'LINE sign-in could not be checked right now. Try again shortly.', 503);

/** Verifies LINE ID tokens with LINE's verify endpoint. */
export const createLineProvider = (
  settings: { channelId: string; verifyUrl?: string },
  fetchImpl: typeof fetch = fetch
): IdentityProvider => ({
  id: 'line',
  async verify(idToken: string) {
    let response: Response;
    try {
      response = await fetchImpl(settings.verifyUrl ?? LINE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: settings.channelId }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw unavailable();
    }
    if (response.status >= 500) {
      throw unavailable();
    }
    if (!response.ok) {
      throw invalid();
    }

    let claims: { sub?: unknown; aud?: unknown; exp?: unknown };
    try {
      claims = await response.json();
    } catch {
      throw unavailable();
    }
    const expiresAt = typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : null;
    const valid =
      claims.aud === settings.channelId &&
      expiresAt !== null &&
      expiresAt.getTime() > Date.now() &&
      typeof claims.sub === 'string' &&
      LINE_USER_ID.test(claims.sub);
    if (!valid) {
      throw invalid();
    }
    return { subject: `line:${claims.sub}`, expiresAt };
  },
});
```

`server/src/identity/index.ts`:

```ts
import type { PluginConfig } from '../config';
import { createLineProvider } from './line';
import type { IdentityProvider } from './types';

/** The LINE provider, or null when customer sign-in with LINE is not configured. */
export const getLineProvider = (config: PluginConfig): IdentityProvider | null => {
  const line = config.identityProviders?.line;
  return line ? createLineProvider(line) : null;
};

export type { IdentityProvider, VerifiedIdentity } from './types';
```

- [ ] **Step 4: Run the tests and type check**

Run: `npm test && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/identity test/unit/line-provider.test.ts
git commit -m "feat: verify LINE ID tokens with LINE's verify endpoint"
```

---

### Task 3: Client and grant fields, and the LINE client rules

**Files:**
- Create: `server/src/utils/end-user.ts`
- Modify:
  - `server/src/content-types/mcp-oauth-client/schema.json`, `server/src/content-types/mcp-oauth-token/schema.json`
  - `server/src/services/oauth.ts`: `OAuthClient`, `normalizeClient`, `createClient`, `setClientToken`, `listClients`
  - `server/src/controllers/admin.ts`: `createClient`
- Test: `test/unit/end-user.test.ts`

**Interfaces:**
- Consumes: `OAuthError` (Task 1)
- Produces:
  - `GRANT_TYPE_TOKEN_EXCHANGE`, `TOKEN_TYPE_ID_TOKEN`, `TOKEN_TYPE_ACCESS_TOKEN`
  - `type EndUserProvider = 'none' | 'line'`, and `endUserProviderOf(value: unknown): EndUserProvider`
  - `maskSubject(subject: string | null | undefined): string | null`
  - `applyClientRules(input: ClientInput): ClientInput`, where `ClientInput = { endUserProvider; confidential; redirectUris; adminTokenId }`
  - `assertCanSetClientToken(provider: EndUserProvider, adminTokenId: number | null): void`
  - `assertGrantTypeAllowed(provider: EndUserProvider, grantType: string): void`
  - `OAuthClient.endUserProvider`
  - service `createClient` accepts `endUserProvider`
  - admin `POST /clients` accepts `endUserProvider` and no redirect URIs for LINE

- [ ] **Step 1: Write the failing test `test/unit/end-user.test.ts`**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GRANT_TYPE_TOKEN_EXCHANGE,
  applyClientRules,
  assertCanSetClientToken,
  assertGrantTypeAllowed,
  endUserProviderOf,
  maskSubject,
} from '../../server/src/utils/end-user';
import { OAuthError } from '../../server/src/utils/oauth-error';

const failsWith = (code: string) => (error: unknown) => error instanceof OAuthError && error.error === code;

test('rows created before 1.1 (null) and unknown values are staff clients', () => {
  assert.equal(endUserProviderOf(null), 'none');
  assert.equal(endUserProviderOf(undefined), 'none');
  assert.equal(endUserProviderOf('something'), 'none');
  assert.equal(endUserProviderOf('line'), 'line');
});

test('LINE clients are always public, need a mapped token, and may have no redirect URI', () => {
  const rules = applyClientRules({ endUserProvider: 'line', confidential: true, redirectUris: [], adminTokenId: 7 });
  assert.equal(rules.confidential, false);
  assert.deepEqual(rules.redirectUris, []);
  assert.throws(
    () => applyClientRules({ endUserProvider: 'line', confidential: false, redirectUris: [], adminTokenId: null }),
    failsWith('invalid_request')
  );
});

test('staff clients still need a redirect URI and keep their client type', () => {
  assert.throws(
    () => applyClientRules({ endUserProvider: 'none', confidential: true, redirectUris: [], adminTokenId: null }),
    /redirect URI/
  );
  const staff = applyClientRules({ endUserProvider: 'none', confidential: true, redirectUris: ['https://a.example/cb'], adminTokenId: null });
  assert.equal(staff.confidential, true);
});

test("a LINE client's token can be changed but not removed", () => {
  assert.doesNotThrow(() => assertCanSetClientToken('line', 9));
  assert.throws(() => assertCanSetClientToken('line', null), failsWith('invalid_request'));
  assert.doesNotThrow(() => assertCanSetClientToken('none', null));
});

test('LINE clients only use token exchange, and only LINE clients use it', () => {
  assert.doesNotThrow(() => assertGrantTypeAllowed('line', GRANT_TYPE_TOKEN_EXCHANGE));
  assert.throws(() => assertGrantTypeAllowed('line', 'authorization_code'), failsWith('unauthorized_client'));
  assert.throws(() => assertGrantTypeAllowed('line', 'refresh_token'), failsWith('unauthorized_client'));
  assert.throws(() => assertGrantTypeAllowed('none', GRANT_TYPE_TOKEN_EXCHANGE), failsWith('unauthorized_client'));
  assert.doesNotThrow(() => assertGrantTypeAllowed('none', 'authorization_code'));
});

test('subjects are masked for logs and the admin page', () => {
  assert.equal(maskSubject('line:U4af4980629c1a7b3f1e2d3c4b5a69788'), 'line:U4af…88');
  assert.equal(maskSubject(null), null);
  assert.equal(maskSubject(''), null);
  assert.equal(maskSubject('line:U12'), 'line:…');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test test/unit/end-user.test.ts`
Expected: FAIL with "Cannot find module '../../server/src/utils/end-user'".

- [ ] **Step 3: Implement `server/src/utils/end-user.ts`**

```ts
import { OAuthError } from './oauth-error';

export const GRANT_TYPE_TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const TOKEN_TYPE_ID_TOKEN = 'urn:ietf:params:oauth:token-type:id_token';
export const TOKEN_TYPE_ACCESS_TOKEN = 'urn:ietf:params:oauth:token-type:access_token';

/** Who signs in through a client: staff with a Strapi admin account ("none"), or customers with LINE. */
export type EndUserProvider = 'none' | 'line';

/** Client rows created before 1.1 read back as null: they are staff clients. */
export const endUserProviderOf = (value: unknown): EndUserProvider => (value === 'line' ? 'line' : 'none');

/** "line:U4af4980629c1a7b3f1e2d3c4b5a69788" → "line:U4af…88", for logs and the admin page. */
export const maskSubject = (subject: string | null | undefined): string | null => {
  if (!subject) return null;
  const separator = subject.indexOf(':');
  const provider = subject.slice(0, separator + 1);
  const id = subject.slice(separator + 1);
  return id.length <= 6 ? `${provider}…` : `${provider}${id.slice(0, 4)}…${id.slice(-2)}`;
};

export interface ClientInput {
  endUserProvider: EndUserProvider;
  confidential: boolean;
  redirectUris: string[];
  adminTokenId: number | null;
}

/**
 * Staff clients need a redirect URI for the consent flow. LINE clients run in the customer's
 * app, which can't keep a secret, so they are public. They need a mapped admin token because
 * every customer session runs with it, and they may have no redirect URI: token exchange has none.
 */
export const applyClientRules = (input: ClientInput): ClientInput => {
  if (input.endUserProvider === 'line') {
    if (!input.adminTokenId) {
      throw new OAuthError(
        'invalid_request',
        'A LINE client needs a mapped admin token: every customer session runs with its permissions.'
      );
    }
    return { ...input, confidential: false };
  }
  if (input.redirectUris.length === 0) {
    throw new OAuthError('invalid_request', 'At least one redirect URI is required');
  }
  return input;
};

/** A LINE client's token can be swapped but never removed. */
export const assertCanSetClientToken = (endUserProvider: EndUserProvider, adminTokenId: number | null) => {
  if (endUserProvider === 'line' && adminTokenId === null) {
    throw new OAuthError(
      'invalid_request',
      'A LINE client must keep a mapped admin token. Map another token, or deactivate the client.'
    );
  }
};

/** LINE clients only use token exchange, and only LINE clients may use it. */
export const assertGrantTypeAllowed = (endUserProvider: EndUserProvider, grantType: string) => {
  const exchange = grantType === GRANT_TYPE_TOKEN_EXCHANGE;
  if (endUserProvider === 'line' && !exchange) {
    throw new OAuthError('unauthorized_client', 'This client signs customers in with LINE and can only use token exchange');
  }
  if (endUserProvider !== 'line' && exchange) {
    throw new OAuthError('unauthorized_client', 'This client is not set up for LINE sign-in');
  }
};
```

- [ ] **Step 4: Update the two schemas**

In `server/src/content-types/mcp-oauth-client/schema.json`:
- Change `redirectUris` to `{ "type": "json" }`, with no `required`: LINE clients have none, and the rule lives in `applyClientRules`.
- Add after `adminTokenId`:

```json
    "endUserProvider": {
      "type": "enumeration",
      "enum": ["none", "line"],
      "default": "none"
    },
```

In `server/src/content-types/mcp-oauth-token/schema.json`:
- Change `refreshTokenHash` to `{ "type": "string", "unique": true, "private": true }`, with no `required`: customer grants have no refresh token.
- Add after `resource`:

```json
    "subject": {
      "type": "string",
      "private": true
    },
```

- [ ] **Step 5: Apply the rules in the service**

In `server/src/services/oauth.ts`:

1. Add to the imports:

```ts
import { applyClientRules, assertCanSetClientToken, endUserProviderOf, type EndUserProvider } from '../utils/end-user';
```

2. Add to `interface OAuthClient`:

```ts
  /** "line" clients sign customers in with LINE through token exchange; "none" clients are for staff. */
  endUserProvider: EndUserProvider;
```

3. Replace `normalizeClient`:

```ts
  const normalizeClient = (row: any): OAuthClient => ({
    ...row,
    redirectUris: normalizeRedirectUris(row.redirectUris),
    // A client without a secret can only ever authenticate as a public client.
    tokenEndpointAuthMethod: row.clientSecret ? row.tokenEndpointAuthMethod ?? 'client_secret_post' : 'none',
    endUserProvider: endUserProviderOf(row.endUserProvider),
  });
```

4. Replace `createClient`:

```ts
    /** Create a client from the admin panel. The secret is returned once and never shown again. */
    async createClient(input: {
      name: string;
      redirectUris: string[];
      confidential: boolean;
      adminTokenId?: number | null;
      endUserProvider?: EndUserProvider;
      actingUserId: number;
    }) {
      const rules = applyClientRules({
        endUserProvider: input.endUserProvider ?? 'none',
        confidential: input.confidential,
        redirectUris: input.redirectUris,
        adminTokenId: input.adminTokenId ?? null,
      });
      if (rules.adminTokenId) {
        const selectable = await this.listSelectableTokens(input.actingUserId);
        if (!selectable.some((t) => t.id === rules.adminTokenId)) {
          throw new OAuthError('invalid_request', 'You can only map an admin token you own');
        }
      }
      const clientId = generateToken(TOKEN_PREFIX.clientId, 16);
      const clientSecret = rules.confidential ? generateToken(TOKEN_PREFIX.clientSecret) : null;
      const row = await strapi.db.query(UID.client).create({
        data: {
          name: input.name.slice(0, 100),
          clientId,
          clientSecret,
          redirectUris: rules.redirectUris,
          tokenEndpointAuthMethod: rules.confidential ? 'client_secret_post' : 'none',
          registrationType: 'manual',
          adminTokenId: rules.adminTokenId,
          endUserProvider: rules.endUserProvider,
          active: true,
        },
      });
      return { id: row.id, clientId, clientSecret };
    },
```

5. In `setClientToken`, right after the `if (!client) { return null; }` block, add:

```ts
      assertCanSetClientToken(endUserProviderOf(client.endUserProvider), adminTokenId);
```

6. In `listClients`, add `'endUserProvider'` to the `select` array. In the returned object, after `redirectUris: normalizeRedirectUris(c.redirectUris),`, add:

```ts
          endUserProvider: endUserProviderOf(c.endUserProvider),
```

- [ ] **Step 6: Let the admin API create LINE clients**

In `server/src/controllers/admin.ts` `createClient`:
- **Delete** the `if (redirectUris.length === 0) { return ctx.badRequest('At least one redirect URI is required'); }` block. `applyClientRules` now returns that same message for staff clients, through the existing `OAuthError` catch.
- Replace the `service().createClient({...})` argument with:

```ts
          data: await service().createClient({
            name,
            redirectUris,
            confidential: body.confidential !== false,
            adminTokenId,
            endUserProvider: body.endUserProvider === 'line' ? 'line' : 'none',
            actingUserId: ctx.state.user.id,
          }),
```

- [ ] **Step 7: Run the tests and type check**

Run: `npm test && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add server/src test/unit/end-user.test.ts
git commit -m "feat: add LINE clients (public, mapped token, no redirect) and grant subjects"
```

---

### Task 4: The token exchange grant

**Files:**
- Modify: `server/src/services/oauth.ts` (`issueTokens`, `exchangeAuthorizationCode`, `refreshGrant`, new `exchangeIdToken`), `server/src/controllers/oauth.ts` (`token`, `authorizationServer`)
- Test: `test/unit/token-exchange.test.ts`

**Interfaces:**
- Consumes: `getLineProvider` (Task 2); `assertGrantTypeAllowed`, `maskSubject` and the constants (Task 3); `getMappedToken`, `loadOwnedToken`, `isActiveUser` (existing)
- Produces:
  - service `exchangeIdToken(client, { subjectToken?, subjectTokenType?, resource? })`, returning `{ access_token, issued_token_type, token_type: 'Bearer', expires_in, scope: 'mcp' }`
  - `issueTokens({ refresh?: boolean; ttl?: number })`

Checks run in the spec's order:
1. The client is public, active and `line`: `authenticateClient` plus `assertGrantTypeAllowed`.
2. LINE is configured.
3. `subject_token` and its type are present.
4. LINE verifies the token.
5. The mapped token loads, and its owner is active.

- [ ] **Step 1: Write the failing test `test/unit/token-exchange.test.ts`**

```ts
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import pluginConfig from '../../server/src/config';
import oauthController from '../../server/src/controllers/oauth';
import oauthService from '../../server/src/services/oauth';
import { GRANT_TYPE_TOKEN_EXCHANGE, TOKEN_TYPE_ID_TOKEN } from '../../server/src/utils/end-user';

const lineClient = { id: 1, name: 'Maison app', clientId: 'mcp_client_line', redirectUris: [], tokenEndpointAuthMethod: 'none', registrationType: 'manual', adminTokenId: 7, active: true, endUserProvider: 'line' };
const staffClient = { ...lineClient, clientId: 'mcp_client_staff', adminTokenId: null, endUserProvider: 'none' };
const LINE_CONFIG = { identityProviders: { line: { channelId: '1657000000', verifyUrl: 'http://line.test/verify' } } };

/** A Strapi stand-in: plugin config, silent logs, and a database that fails the test if touched. */
const fakeStrapi = (overrides: Record<string, unknown> = {}, service?: Record<string, unknown>) =>
  ({
    config: {
      get: (key: string) => (key === 'plugin::strapi-oauth-mcp-manager' ? { ...pluginConfig.default, ...overrides } : undefined),
    },
    log: { info() {}, warn() {}, error() {}, debug() {} },
    db: {
      query: (uid: string) => {
        throw new Error(`unexpected database access to ${uid}`);
      },
    },
    plugin: () => ({ service: () => service }),
  }) as any;

const ctxFor = (body: Record<string, string>) => {
  const headers: Record<string, string> = {};
  return { request: { body, headers: {}, origin: 'http://localhost:1337' }, set: (key: string, value: string) => (headers[key] = value), status: 200, body: undefined as any };
};

const tokenRequest = async (client: object, body: Record<string, string>) => {
  const calls: string[] = [];
  const service = {
    authenticateClient: async () => client,
    exchangeAuthorizationCode: async () => (calls.push('authorization_code'), { access_token: 'staff' }),
    refreshGrant: async () => (calls.push('refresh_token'), { access_token: 'refreshed' }),
    exchangeIdToken: async (_client: object, params: object) => (calls.push('exchange'), { access_token: 'customer', params }),
  };
  const ctx = ctxFor(body);
  await oauthController({ strapi: fakeStrapi(LINE_CONFIG, service) }).token(ctx);
  return { ctx, calls };
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('a LINE client exchanges its ID token', async () => {
  const { ctx, calls } = await tokenRequest(lineClient, {
    grant_type: GRANT_TYPE_TOKEN_EXCHANGE, client_id: lineClient.clientId, subject_token: 'id-token', subject_token_type: TOKEN_TYPE_ID_TOKEN, resource: 'http://localhost:1337/mcp',
  });
  assert.deepEqual(calls, ['exchange']);
  assert.deepEqual(ctx.body.params, { subjectToken: 'id-token', subjectTokenType: TOKEN_TYPE_ID_TOKEN, resource: 'http://localhost:1337/mcp' });
});

test('a LINE client cannot use the code or refresh grants', async () => {
  for (const grant_type of ['authorization_code', 'refresh_token']) {
    const { ctx, calls } = await tokenRequest(lineClient, { grant_type, code: 'x', refresh_token: 'x' });
    assert.equal(ctx.status, 400, grant_type);
    assert.equal(ctx.body.error, 'unauthorized_client', grant_type);
    assert.deepEqual(calls, []);
  }
});

test('a staff client, including one created before 1.1, cannot use token exchange', async () => {
  for (const client of [staffClient, { ...staffClient, endUserProvider: null }]) {
    const { ctx, calls } = await tokenRequest(client, { grant_type: GRANT_TYPE_TOKEN_EXCHANGE, subject_token: 'x', subject_token_type: TOKEN_TYPE_ID_TOKEN });
    assert.equal(ctx.body.error, 'unauthorized_client');
    assert.deepEqual(calls, []);
  }
  const { calls } = await tokenRequest({ ...staffClient, endUserProvider: null }, { grant_type: 'authorization_code', code: 'x' });
  assert.deepEqual(calls, ['authorization_code']);
});

test('unknown grant types are unsupported_grant_type', async () => {
  const { ctx } = await tokenRequest(staffClient, { grant_type: 'password' });
  assert.equal(ctx.body.error, 'unsupported_grant_type');
});

test('exchangeIdToken refuses when LINE sign-in is not configured', async () => {
  const service = oauthService({ strapi: fakeStrapi() });
  await assert.rejects(
    service.exchangeIdToken(lineClient as any, { subjectToken: 'x', subjectTokenType: TOKEN_TYPE_ID_TOKEN }),
    (error: any) => error.error === 'unauthorized_client' && /not configured/.test(error.description)
  );
});

test('exchangeIdToken needs subject_token and the id_token type', async () => {
  const service = oauthService({ strapi: fakeStrapi(LINE_CONFIG) });
  for (const params of [{ subjectTokenType: TOKEN_TYPE_ID_TOKEN }, { subjectToken: 'x' }, { subjectToken: 'x', subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt' }]) {
    await assert.rejects(service.exchangeIdToken(lineClient as any, params), (error: any) => error.error === 'invalid_request', JSON.stringify(params));
  }
});

test('exchangeIdToken stops at invalid_grant when LINE rejects the token, before touching the database', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'invalid_request', error_description: 'IdToken expired.' }), { status: 400 })) as any;
  const service = oauthService({ strapi: fakeStrapi(LINE_CONFIG) });
  await assert.rejects(
    service.exchangeIdToken(lineClient as any, { subjectToken: 'expired', subjectTokenType: TOKEN_TYPE_ID_TOKEN }),
    (error: any) => error.error === 'invalid_grant'
  );
});

test('discovery lists token exchange only when LINE sign-in is configured', async () => {
  const grantTypes = async (overrides: Record<string, unknown>) => {
    const ctx = ctxFor({});
    await oauthController({ strapi: fakeStrapi(overrides) }).authorizationServer(ctx);
    return ctx.body.grant_types_supported as string[];
  };
  assert.ok((await grantTypes(LINE_CONFIG)).includes(GRANT_TYPE_TOKEN_EXCHANGE));
  assert.ok(!(await grantTypes({})).includes(GRANT_TYPE_TOKEN_EXCHANGE));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test test/unit/token-exchange.test.ts`
Expected: FAIL. The token-exchange request answers `unsupported_grant_type`, `exchangeIdToken` is not a function, and discovery lacks the grant.

- [ ] **Step 3: Let `issueTokens` skip the refresh token**

In `server/src/services/oauth.ts`, replace `issueTokens`:

```ts
  const issueTokens = ({ refresh = true, ttl }: { refresh?: boolean; ttl?: number } = {}) => {
    const { accessTokenTtl, refreshTokenTtl } = config();
    const lifetime = ttl ?? accessTokenTtl;
    const accessToken = generateToken(TOKEN_PREFIX.accessToken);
    const refreshToken = refresh ? generateToken(TOKEN_PREFIX.refreshToken) : null;
    const expiresAt = toIso(lifetime);
    return {
      accessToken,
      refreshToken,
      row: {
        accessTokenHash: hashToken(accessToken),
        refreshTokenHash: refreshToken ? hashToken(refreshToken) : null,
        expiresAt,
        // Without a refresh token the grant ends with its access token. Cleanup and the admin page read this date.
        refreshExpiresAt: refreshToken ? toIso(refreshTokenTtl) : expiresAt,
      },
      response: (scope?: string | null) => ({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: lifetime,
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
        ...(scope ? { scope } : {}),
      }),
    };
  };
```

The two existing callers, `issueTokens()`, behave exactly as before.

- [ ] **Step 4: Add `exchangeIdToken` to the service**

Add to the imports:

```ts
import { getLineProvider } from '../identity';
import { TOKEN_TYPE_ACCESS_TOKEN, TOKEN_TYPE_ID_TOKEN, maskSubject } from '../utils/end-user';
```

Merge these names into the `../utils/end-user` import from Task 3, keeping a single import line.

Add this method right after `refreshGrant`:

```ts
    /**
     * RFC 8693 token exchange: a customer's LINE ID token for a short-lived MCP session. The
     * session runs with the client's mapped admin token and remembers the customer (`subject`),
     * which tool plugins read with resolveSubject. No refresh token: the app exchanges again.
     */
    async exchangeIdToken(
      client: OAuthClient,
      params: { subjectToken?: string; subjectTokenType?: string; resource?: string }
    ) {
      if (client.endUserProvider !== 'line') {
        throw new OAuthError('unauthorized_client', 'This client is not set up for LINE sign-in');
      }
      const provider = getLineProvider(config());
      if (!provider) {
        throw new OAuthError('unauthorized_client', 'LINE sign-in is not configured');
      }
      if (!params.subjectToken || params.subjectTokenType !== TOKEN_TYPE_ID_TOKEN) {
        throw new OAuthError(
          'invalid_request',
          `subject_token (a LINE ID token) and subject_token_type=${TOKEN_TYPE_ID_TOKEN} are required`
        );
      }
      const { subject } = await provider.verify(params.subjectToken);

      const mapped = await this.getMappedToken(client);
      if (!mapped || mapped.missing || mapped.ownerId === null) {
        throw new OAuthError('invalid_grant', 'This client has no usable admin token. Map one on the MCP OAuth page.');
      }
      if (!(await isActiveUser(mapped.ownerId))) {
        throw new OAuthError('invalid_grant', "The owner of this client's admin token is no longer active");
      }
      const adminToken = await loadOwnedToken(mapped.id, mapped.ownerId);
      const tokens = issueTokens({ refresh: false, ttl: config().endUserAccessTokenTtl });

      await strapi.db.query(UID.grant).create({
        data: {
          ...tokens.row,
          clientId: client.clientId,
          adminUserId: mapped.ownerId,
          adminTokenId: adminToken.id,
          ownsAdminToken: false,
          adminKeyHash: hashToken(adminToken.accessKey),
          scope: 'mcp',
          resource: params.resource ?? null,
          subject,
        },
      });

      strapi.log.info(`[${PLUGIN_ID}] Issued a customer session for client "${client.name}" (${maskSubject(subject)})`);
      return { ...tokens.response('mcp'), issued_token_type: TOKEN_TYPE_ACCESS_TOKEN };
    },
```

- [ ] **Step 5: Dispatch the grant in the controller and advertise it**

In `server/src/controllers/oauth.ts`, add to the imports:

```ts
import { getLineProvider } from '../identity';
import { GRANT_TYPE_TOKEN_EXCHANGE, assertGrantTypeAllowed } from '../utils/end-user';
```

Add next to `AUTH_METHODS`:

```ts
const GRANT_TYPES = ['authorization_code', 'refresh_token', GRANT_TYPE_TOKEN_EXCHANGE];
```

Replace the `token` handler:

```ts
    async token(ctx: any) {
      ctx.set('Cache-Control', 'no-store');
      ctx.set('Pragma', 'no-cache');
      const body = ctx.request.body ?? {};
      try {
        const { clientId, clientSecret } = readClientCredentials(ctx);
        const client = await service().authenticateClient(clientId, clientSecret);
        const grantType = str(body.grant_type) ?? '';
        if (!GRANT_TYPES.includes(grantType)) {
          throw new OAuthError('unsupported_grant_type', `grant_type must be one of ${GRANT_TYPES.join(', ')}`);
        }
        assertGrantTypeAllowed(client.endUserProvider, grantType);

        if (grantType === 'authorization_code') {
          ctx.body = await service().exchangeAuthorizationCode(client, {
            code: str(body.code),
            redirectUri: str(body.redirect_uri),
            codeVerifier: str(body.code_verifier),
          });
        } else if (grantType === 'refresh_token') {
          ctx.body = await service().refreshGrant(client, str(body.refresh_token));
        } else {
          ctx.body = await service().exchangeIdToken(client, {
            subjectToken: str(body.subject_token),
            subjectTokenType: str(body.subject_token_type),
            resource: str(body.resource),
          });
        }
      } catch (error) {
        sendOAuthError(ctx, error, strapi);
      }
    },
```

`assertGrantTypeAllowed` receives the normalized client, so a pre-1.1 row counts as a staff client. The unit test passes `endUserProvider: null` straight through the fake service, and `assertGrantTypeAllowed` handles that, because only `'line'` counts as LINE.

In `authorizationServer`, replace the `grant_types_supported` line with:

```ts
        grant_types_supported: [
          'authorization_code',
          'refresh_token',
          ...(getLineProvider(config()) ? [GRANT_TYPE_TOKEN_EXCHANGE] : []),
        ],
```

- [ ] **Step 6: Run the tests and type check**

Run: `npm test && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add server/src test/unit/token-exchange.test.ts
git commit -m "feat: exchange LINE ID tokens for customer MCP sessions (RFC 8693)"
```

---

### Task 5: `resolveSubject`, masked subjects in the sessions list, and middleware cleanup

**Files:**
- Create: `server/src/utils/bearer.ts`
- Modify: `server/src/services/oauth.ts` (new `resolveSubject`, `listGrants`), `server/src/middlewares/mcp-oauth.ts`
- Test: `test/unit/resolve-subject.test.ts`

**Interfaces:**
- Consumes: `maskSubject` (Task 3), `TOKEN_PREFIX`, `hashToken` (existing)
- Produces:
  - `extractBearerToken(header: string | undefined): string | null`
  - service `resolveSubject(authorization: string | string[] | undefined): Promise<string | null>`, which is the contract the Maison plugin calls
  - `listGrants()` rows carry a masked `subject`

- [ ] **Step 1: Write the failing test `test/unit/resolve-subject.test.ts`**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pluginConfig from '../../server/src/config';
import oauthService from '../../server/src/services/oauth';
import { hashToken } from '../../server/src/utils/crypto';

const SUBJECT = 'line:U4af4980629c1a7b3f1e2d3c4b5a69788';
const inAnHour = new Date(Date.now() + 3600_000).toISOString();
const anHourAgo = new Date(Date.now() - 3600_000).toISOString();

/** Grants by access token; the fake database only allows reads. */
const serviceWith = (grants: Record<string, { subject: string | null; expiresAt: string }>) => {
  const lookups: string[] = [];
  const rows = Object.entries(grants).map(([token, grant], index) => ({ id: index + 1, accessTokenHash: hashToken(token), ...grant }));
  const strapi = {
    config: { get: () => pluginConfig.default },
    log: { info() {}, warn() {}, error() {}, debug() {} },
    db: {
      query: () => ({
        findOne: async ({ where }: any) => {
          lookups.push(where.accessTokenHash);
          return rows.find((row) => row.accessTokenHash === where.accessTokenHash) ?? null;
        },
      }),
    },
  } as any;
  return { service: oauthService({ strapi }), lookups };
};

test("returns the customer's subject for a live customer session", async () => {
  const { service } = serviceWith({ mcp_at_customer: { subject: SUBJECT, expiresAt: inAnHour } });
  assert.equal(await service.resolveSubject('Bearer mcp_at_customer'), SUBJECT);
  assert.equal(await service.resolveSubject('bearer mcp_at_customer'), SUBJECT, 'the scheme is case-insensitive, as in the middleware');
});

test('returns null for staff sessions, expired sessions and unknown tokens', async () => {
  const { service } = serviceWith({
    mcp_at_staff: { subject: null, expiresAt: inAnHour },
    mcp_at_expired: { subject: SUBJECT, expiresAt: anHourAgo },
  });
  assert.equal(await service.resolveSubject('Bearer mcp_at_staff'), null);
  assert.equal(await service.resolveSubject('Bearer mcp_at_expired'), null);
  assert.equal(await service.resolveSubject('Bearer mcp_at_unknown'), null);
});

test('returns null without a lookup for anything that is not one bearer session token', async () => {
  const { service, lookups } = serviceWith({ mcp_at_customer: { subject: SUBJECT, expiresAt: inAnHour } });
  for (const header of [undefined, '', 'Bearer', 'Basic bWNwOnNlY3JldA==', 'Bearer strapi-admin-token-value', ['Bearer mcp_at_customer', 'Bearer mcp_at_customer']] as const) {
    assert.equal(await service.resolveSubject(header as any), null, JSON.stringify(header));
  }
  assert.deepEqual(lookups, [], 'no database lookups');
});
```

The fake database has no `update` method. A write, such as a `lastUsedAt` update, would throw and fail the test.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test test/unit/resolve-subject.test.ts`
Expected: FAIL with "service.resolveSubject is not a function".

- [ ] **Step 3: Move the bearer parser**

Create `server/src/utils/bearer.ts`:

```ts
/** The token in an "Authorization: Bearer <token>" header value, or null. */
export const extractBearerToken = (header: string | undefined) => {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
};
```

In `server/src/middlewares/mcp-oauth.ts`:
- Delete the local `extractBearerToken` and add `import { extractBearerToken } from '../utils/bearer';`.
- Delete the unused line `ctx.state.mcpOAuthGrantId = result.grantId;`.
- Leave everything else unchanged. The middleware still swaps the token only in `ctx.request.headers`, which core authenticates with. Tools keep seeing the caller's original header, and `resolveSubject` relies on that.

- [ ] **Step 4: Add `resolveSubject`, and masked subjects in `listGrants`**

In `server/src/services/oauth.ts`, add `import { extractBearerToken } from '../utils/bearer';`. Add this method after `resolveAccessToken`:

```ts
    /**
     * Which customer holds this MCP session: the grant's subject (e.g. "line:U…"), or null for
     * staff sessions, plain admin tokens and anything invalid. Tool plugins pass the raw
     * Authorization header from their handler's extra.requestInfo.headers; tools see the caller's
     * original header. Read-only: the middleware already validated and recorded this request.
     */
    async resolveSubject(authorization: string | string[] | undefined): Promise<string | null> {
      if (typeof authorization !== 'string') {
        return null;
      }
      const token = extractBearerToken(authorization);
      if (!token || !token.startsWith(TOKEN_PREFIX.accessToken)) {
        return null;
      }
      const grant = await strapi.db.query(UID.grant).findOne({
        where: { accessTokenHash: hashToken(token) },
        select: ['id', 'subject', 'expiresAt'],
      });
      if (!grant || !grant.subject || isExpired(grant.expiresAt)) {
        return null;
      }
      return grant.subject as string;
    },
```

In `listGrants`:
- Add `'subject'` to the grants `select` array.
- In the returned object, after `...g,`, add `subject: maskSubject(g.subject),`. Place it after the spread, so the full value is never returned.

- [ ] **Step 5: Run the tests and type check**

Run: `npm test && npm run test:ts:back`
Expected: all pass, and tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src test/unit/resolve-subject.test.ts
git commit -m "feat: add resolveSubject for tool plugins and mask subjects in the sessions list"
```

---

### Task 6: Admin page

**Files:**
- Modify: `server/src/controllers/admin.ts` (`overview`), `admin/src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: `GRANT_TYPE_TOKEN_EXCHANGE`, `TOKEN_TYPE_ID_TOKEN` (Task 3); `endUserProvider` on clients (Task 3); masked `subject` on grants (Task 5)
- Produces:
  - `GET /overview` gains `lineSignIn: { configured: boolean; channelId: string | null }` and `tokenExchange: { grantType; subjectTokenType }`
  - the client form, the tables and the connection details show LINE sign-in

- [ ] **Step 1: Add LINE status to the overview**

In `server/src/controllers/admin.ts`, add `import { GRANT_TYPE_TOKEN_EXCHANGE, TOKEN_TYPE_ID_TOKEN } from '../utils/end-user';`. In `overview`, add to `data`:

```ts
          lineSignIn: {
            configured: Boolean(config.identityProviders?.line),
            channelId: config.identityProviders?.line?.channelId ?? null,
          },
          tokenExchange: { grantType: GRANT_TYPE_TOKEN_EXCHANGE, subjectTokenType: TOKEN_TYPE_ID_TOKEN },
```

- [ ] **Step 2: Update the page's types**

In `admin/src/pages/HomePage.tsx`:
- Add to `interface Overview`:

```ts
  lineSignIn: { configured: boolean; channelId: string | null };
  tokenExchange: { grantType: string; subjectTokenType: string };
```

- Add `subject: string | null;` to `interface Grant`.
- Add `endUserProvider: 'none' | 'line';` to `interface Client`.
- Add `type SignIn = 'none' | 'line';` below `PICK_ON_CONNECT`.

- [ ] **Step 3: Let `TokenSelect` require a token**

Replace `TokenSelect`:

```tsx
const TokenSelect = ({
  tokens,
  value,
  current,
  onChange,
  disabled,
  allowPickOnConnect = true,
}: {
  tokens: TokenOption[];
  value: string;
  current?: MappedToken | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** LINE clients must always use a mapped token. */
  allowPickOnConnect?: boolean;
}) => {
  const ownsCurrent = current && tokens.some((t) => t.id === current.id);
  return (
    <SingleSelect
      aria-label="Admin token"
      placeholder="Choose one of your admin tokens"
      value={!allowPickOnConnect && value === PICK_ON_CONNECT ? null : value}
      disabled={disabled}
      onChange={(next: string | number) => onChange(String(next))}
    >
      {allowPickOnConnect && <SingleSelectOption value={PICK_ON_CONNECT}>Picked when connecting</SingleSelectOption>}
      {current && !ownsCurrent && (
        <SingleSelectOption value={String(current.id)} disabled>
          {current.missing ? 'Deleted token' : `${current.name} (owned by ${current.ownerEmail ?? 'another admin'})`}
        </SingleSelectOption>
      )}
      {tokens.map((token) => (
        <SingleSelectOption key={token.id} value={String(token.id)}>
          {token.name}
        </SingleSelectOption>
      ))}
    </SingleSelect>
  );
};
```

- [ ] **Step 4: Add customer sign-in to the client form**

In `CreateClientModal`:

1. Add state after `adminTokenId`:

```tsx
  const [signIn, setSignIn] = useState<SignIn>('none');
```

2. In `reset`, add `setSignIn('none');`.

3. Replace the body passed to `post` in `submit`:

```tsx
      const line = signIn === 'line';
      const { data } = await post<{ data: CreatedClient }>(`/${PLUGIN_ID}/clients`, {
        name,
        endUserProvider: signIn,
        redirectUris: line ? [] : redirectUris.split('\n').map((uri) => uri.trim()).filter(Boolean),
        confidential: line ? false : confidential === 'confidential',
        adminTokenId: adminTokenId === PICK_ON_CONNECT ? null : Number(adminTokenId),
      });
```

4. Replace the form's `<Flex direction="column" alignItems="stretch" gap={4}>` block, the one after the explanatory `Typography`, with:

```tsx
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Typography textColor="neutral600">
                Only needed for clients that ask for a client ID and secret, like ChatGPT connectors, or for a customer
                app that signs people in with LINE. Claude and most MCP clients register themselves automatically.
              </Typography>
              <Field.Root name="name" required>
                <Field.Label>Name</Field.Label>
                <TextInput value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder={signIn === 'line' ? 'Customer app' : 'ChatGPT'} />
              </Field.Root>
              <Field.Root name="signIn" hint="LINE: customers sign in to your LINE app, which exchanges their LINE ID token for a session. No consent page is shown.">
                <Field.Label>Customer sign-in</Field.Label>
                <Radio.Group value={signIn} onValueChange={(value: string) => setSignIn(value as SignIn)} aria-label="Customer sign-in">
                  <Radio.Item value="none">None: people connect with their Strapi admin account</Radio.Item>
                  <Radio.Item value="line">LINE: customers sign in with LINE</Radio.Item>
                </Radio.Group>
                <Field.Hint />
              </Field.Root>
              {signIn === 'none' && (
                <Field.Root name="redirectUris" required hint="One per line. * matches any run of characters except /.">
                  <Field.Label>Redirect URIs</Field.Label>
                  <Textarea
                    value={redirectUris}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRedirectUris(e.target.value)}
                    placeholder="https://chatgpt.com/connector_platform_oauth_redirect"
                  />
                  <Field.Hint />
                </Field.Root>
              )}
              <Field.Root
                name="adminToken"
                required={signIn === 'line'}
                hint={
                  signIn === 'line'
                    ? "Required. Every customer session runs with this token's permissions, so grant it only what customers need."
                    : 'Map one of your admin tokens so every connection uses it. Only you can then approve this client. Leave it to let each person pick one of their own tokens.'
                }
              >
                <Field.Label>Admin token</Field.Label>
                <TokenSelect tokens={tokens} value={adminTokenId} onChange={setAdminTokenId} allowPickOnConnect={signIn === 'none'} />
                <Field.Hint />
              </Field.Root>
              {signIn === 'none' && (
                <Field.Root name="type">
                  <Field.Label>Client type</Field.Label>
                  <Radio.Group value={confidential} onValueChange={setConfidential} aria-label="Client type">
                    <Radio.Item value="confidential">Confidential (client ID + secret)</Radio.Item>
                    <Radio.Item value="public">Public (client ID only, PKCE required)</Radio.Item>
                  </Radio.Group>
                </Field.Root>
              )}
            </Flex>
```

This replaces both the original `Typography` and the `Flex`, so delete the original explanatory `Typography` above the block too.

5. Replace the Create button's `disabled` prop with:

```tsx
disabled={!name.trim() || (signIn === 'line' ? adminTokenId === PICK_ON_CONNECT : !redirectUris.trim())}
```

- [ ] **Step 5: Show customers in the sessions table**

In the sessions `Table`:
- Change `colCount={6}` to `colCount={7}`.
- Add this header after "Client": `<Th><Typography variant="sigma">Customer</Typography></Th>`.
- Add this cell after the client-name cell: `<Td><Typography>{grant.subject ?? '—'}</Typography></Td>`.

- [ ] **Step 6: Mark LINE clients in the clients table**

In the clients table's Type cell, add inside the `Flex`, after the Public/Confidential badge:

```tsx
                          {client.endUserProvider === 'line' && <Badge variant="success">LINE sign-in</Badge>}
```

In the Redirect URIs cell, render `client.redirectUris.length ? client.redirectUris.join(', ') : '—'`.

Pass `allowPickOnConnect={client.endUserProvider !== 'line'}` to that row's `TokenSelect`.

- [ ] **Step 7: Show the exchange details**

In the "Connection details" `Section`, after the `Token endpoint` `CopyValue`, add:

```tsx
              {overview.lineSignIn.configured ? (
                <>
                  <CopyValue label="Token exchange grant type" value={overview.tokenExchange.grantType} />
                  <CopyValue label="Subject token type (LINE ID token)" value={overview.tokenExchange.subjectTokenType} />
                  <Typography variant="pi" textColor="neutral600">
                    LINE sign-in is on for channel {overview.lineSignIn.channelId}. Customer apps post liff.getIDToken() to the
                    token endpoint with a LINE client's ID.
                  </Typography>
                </>
              ) : (
                clients.some((client) => client.endUserProvider === 'line') && (
                  <Alert variant="warning" title="LINE sign-in is off" closeLabel="Close">
                    A LINE client exists, but identityProviders.line.channelId isn't set in this plugin's config.
                  </Alert>
                )
              )}
```

- [ ] **Step 8: Type-check and build**

Run: `npm run test:ts:front && npm run test:ts:back && npm run build && npm run verify`
Expected: all exit 0, and the build prints `Build complete!`.

- [ ] **Step 9: Commit**

```bash
git add server/src/controllers/admin.ts admin/src/pages/HomePage.tsx
git commit -m "feat: manage LINE clients and see customer sessions on the MCP OAuth page"
```

---

### Task 7: End-to-end test against a mock of LINE's verify endpoint

**Files:**
- Create: `test/e2e/mock-line-verify.mjs`, `test/e2e/line-exchange.mjs`
- Modify: `package.json` (`test:e2e`), and `/Users/paul/work/plugin-dev/strapi-local/config/plugins.ts`. That last one is a local test app, not part of this repo; don't commit it there.

**Interfaces:**
- Consumes: everything above, running in strapi-local, plus `test/e2e/helpers.mjs` (existing)
- Produces: `startMockLineVerify({ port, channelId })`. The LaunchPad plan reuses it for browser development with the LIFF mock.

The mock follows LINE's behavior:
- A `client_id` other than the configured channel gets 400 `Invalid IdToken Audience.`.
- `valid.<sub>` gets 200 with claims for `<sub>`.
- `wrong-aud.<sub>` gets 200 but with another channel's `aud`, which tests our own `aud` check.
- `expired.<sub>` gets 400 `IdToken expired.`.
- Anything else gets 400 `Invalid IdToken.`.

- [ ] **Step 1: Write `test/e2e/mock-line-verify.mjs`**

```js
// A local stand-in for LINE's ID token verify endpoint (POST /verify), for tests and development.
// Run it on its own with: node test/e2e/mock-line-verify.mjs [port] [channelId]
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const startMockLineVerify = ({ port = 4545, channelId = '1234567890' } = {}) =>
  new Promise((resolve) => {
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
        const token = form.get('id_token') ?? '';
        const now = Math.floor(Date.now() / 1000);
        if (form.get('client_id') !== channelId) return send(400, { error: 'invalid_request', error_description: 'Invalid IdToken Audience.' });
        const [kind, sub] = token.split('.');
        if (kind === 'expired') return send(400, { error: 'invalid_request', error_description: 'IdToken expired.' });
        if ((kind === 'valid' || kind === 'wrong-aud') && sub) {
          return send(200, {
            iss: 'https://access.line.me',
            sub,
            aud: kind === 'valid' ? channelId : '9999999999',
            exp: now + 3600,
            iat: now,
            amr: ['linesso'],
            name: 'Test Customer',
          });
        }
        return send(400, { error: 'invalid_request', error_description: 'Invalid IdToken.' });
      });
    });
    server.listen(port, () => resolve({ url: `http://localhost:${port}/verify`, close: () => new Promise((done) => server.close(done)) }));
  });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [port = '4545', channelId = '1234567890'] = process.argv.slice(2);
  const mock = await startMockLineVerify({ port: Number(port), channelId });
  console.log(`Mock LINE verify endpoint on ${mock.url} for channel ${channelId}`);
}
```

- [ ] **Step 2: Write `test/e2e/line-exchange.mjs`**

```js
// Customer sign-in with LINE. Needs strapi-local started with
// LINE_LOGIN_CHANNEL_ID=1234567890 LINE_VERIFY_URL=http://localhost:4545/verify (this script starts the mock).
import { BASE, OAUTH, PLUGIN, adminSession, check, contentPermission, finish, initializeParams, mcp, registerClient, toolNames } from './helpers.mjs';
import { startMockLineVerify } from './mock-line-verify.mjs';

const CHANNEL = process.env.LINE_LOGIN_CHANNEL_ID ?? '1234567890';
const EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ID_TOKEN = 'urn:ietf:params:oauth:token-type:id_token';
const SUB = `U${'a'.repeat(32)}`;

const mock = await startMockLineVerify({ port: 4545, channelId: CHANNEL });
const form = (params) =>
  fetch(`${OAUTH}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
    .then(async (res) => ({ status: res.status, body: await res.json() }));
const exchange = (clientId, subjectToken, extra = {}) =>
  form({ grant_type: EXCHANGE, client_id: clientId, subject_token: subjectToken, subject_token_type: ID_TOKEN, resource: `${BASE}/mcp`, ...extra });

// 0. The app must have LINE sign-in on
const metadata = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
if (!metadata.grant_types_supported?.includes(EXCHANGE)) {
  console.error(`LINE sign-in is off in the app at ${BASE}. Start it with LINE_LOGIN_CHANNEL_ID=${CHANNEL} LINE_VERIFY_URL=${mock.url}`);
  await mock.close();
  process.exit(1);
}
check('discovery lists token exchange', true);

const admin = await adminSession();
const plugin = (method, path, body) => admin.call(method, `/${PLUGIN}${path}`, body);
const readOnly = await admin.createAdminToken('E2E LINE read-only', [contentPermission('read')]);

// 1. Client rules
let res = await plugin('POST', '/clients', { name: 'E2E LINE app', endUserProvider: 'line', redirectUris: [] });
check('a LINE client needs a mapped token', res.status === 400, JSON.stringify(res.body));
res = await plugin('POST', '/clients', { name: 'E2E LINE app', endUserProvider: 'line', redirectUris: [], confidential: true, adminTokenId: readOnly.id });
check('a LINE client is created without redirect URIs', res.status === 201, JSON.stringify(res.body));
check('a LINE client is public (no secret)', res.body.data?.clientSecret === null);
const line = res.body.data;
const listed = (await plugin('GET', '/clients')).body.data.find((c) => c.clientId === line.clientId);
check('the client is listed as LINE', listed?.endUserProvider === 'line');
res = await plugin('PUT', `/clients/${line.id}`, { adminTokenId: null });
check("a LINE client's token can't be removed", res.status === 400, JSON.stringify(res.body));

// 2. Exchange
res = await exchange(line.clientId, `valid.${SUB}`);
check('exchange returns an MCP session token', res.status === 200 && res.body.access_token?.startsWith('mcp_at_'), JSON.stringify(res.body));
check('the response is an RFC 8693 answer with no refresh token',
  res.body.issued_token_type === 'urn:ietf:params:oauth:token-type:access_token' && res.body.token_type === 'Bearer' && res.body.scope === 'mcp' && !('refresh_token' in res.body));
const session = res.body.access_token;

const init = await mcp(session, 'initialize', initializeParams);
check('/mcp accepts the customer session', init.status === 200 && !!init.rpc?.result?.serverInfo);
const tools = await toolNames(session);
check("the session has exactly the mapped token's tools", tools.includes('list_article') && !tools.includes('create_article'), tools.join(', '));

const grants = (await plugin('GET', '/grants')).body.data;
const grant = grants.find((g) => g.clientId === line.clientId);
check('the sessions list shows a masked customer', grant?.subject === `line:${SUB.slice(0, 4)}…${SUB.slice(-2)}`, grant?.subject);
check('the session ends with its access token (refreshExpiresAt = expiresAt)', grant && Math.abs(new Date(grant.refreshExpiresAt) - new Date(grant.expiresAt)) < 1000);

// 3. Rejections
res = await exchange(line.clientId, `wrong-aud.${SUB}`);
check('an ID token for another channel is invalid_grant', res.status === 400 && res.body.error === 'invalid_grant', JSON.stringify(res.body));
res = await exchange(line.clientId, `expired.${SUB}`);
check('an expired ID token is invalid_grant', res.status === 400 && res.body.error === 'invalid_grant');
res = await exchange(line.clientId, `valid.${SUB}`, { subject_token_type: 'urn:ietf:params:oauth:token-type:jwt' });
check('another subject token type is invalid_request', res.status === 400 && res.body.error === 'invalid_request');
res = await form({ grant_type: 'authorization_code', client_id: line.clientId, code: 'mcp_code_x', redirect_uri: 'http://localhost/cb', code_verifier: 'x' });
check('a LINE client cannot use authorization_code', res.body.error === 'unauthorized_client', JSON.stringify(res.body));
res = await form({ grant_type: 'refresh_token', client_id: line.clientId, refresh_token: 'mcp_rt_x' });
check('a LINE client cannot refresh', res.body.error === 'unauthorized_client');
const staff = await registerClient({ client_name: 'E2E staff client', redirect_uris: ['http://localhost:33418/callback'], token_endpoint_auth_method: 'none' });
res = await exchange(staff.body.client_id, `valid.${SUB}`);
check('a staff client cannot use token exchange', res.body.error === 'unauthorized_client', JSON.stringify(res.body));

// 4. Kill switch
await plugin('PUT', `/clients/${line.id}`, { active: false });
res = await mcp(session, 'initialize', initializeParams);
check('deactivating the LINE client ends its customer sessions', res.status === 401, String(res.status));

// Cleanup
await plugin('DELETE', `/clients/${line.id}`);
const staffListed = (await plugin('GET', '/clients')).body.data.find((c) => c.clientId === staff.body.client_id);
if (staffListed) await plugin('DELETE', `/clients/${staffListed.id}`);
await admin.call('DELETE', `/admin/admin-tokens/${readOnly.id}`);
await mock.close();
finish();
```

- [ ] **Step 3: Add it to the e2e script**

In `package.json`, append ` && node test/e2e/line-exchange.mjs` to `test:e2e`.

- [ ] **Step 4: Turn on LINE sign-in in strapi-local, behind env variables**

In `/Users/paul/work/plugin-dev/strapi-local/config/plugins.ts`, replace the `"strapi-oauth-mcp-manager"` entry with:

```ts
  "strapi-oauth-mcp-manager": {
    enabled: true,
    resolve: "../plugins/strapi-oauth-mcp-manager",
    config: {
      // Customer sign-in with LINE, only when LINE_LOGIN_CHANNEL_ID is set (e2e: see line-exchange.mjs).
      identityProviders: env("LINE_LOGIN_CHANNEL_ID")
        ? { line: { channelId: env("LINE_LOGIN_CHANNEL_ID"), verifyUrl: env("LINE_VERIFY_URL", undefined) } }
        : {},
    },
  },
```

Without those variables the app behaves as before. Leave the change uncommitted in strapi-local, and mention it in the pull request.

- [ ] **Step 5: Run all e2e suites**

```bash
npm run build
# In another terminal. Use strapi-local's usual start command and port, and stop any running instance first.
cd /Users/paul/work/plugin-dev/strapi-local && LINE_LOGIN_CHANNEL_ID=1234567890 LINE_VERIFY_URL=http://localhost:4545/verify npm run develop
```

When the app is up:

```bash
cd /Users/paul/work/plugin-dev/plugins/strapi-oauth-mcp-manager
BASE=http://localhost:1337 npm run test:e2e
```

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` if strapi-local's admin isn't the helpers' default. The login rate limit must be off, as the README's Contributing section says.

Expected: every check prints `PASS` in all five suites, and the last line of each is `All checks passed`.

- [ ] **Step 6: Commit**

```bash
git add test/e2e/mock-line-verify.mjs test/e2e/line-exchange.mjs package.json
git commit -m "test: add the LINE token exchange e2e suite with a mock verify endpoint"
```

---

### Task 8: Changelog, README, version and pull request

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Bump the version**

In `package.json`, set `"version": "1.1.0"`.

- [ ] **Step 2: Add the changelog entry**

Insert above `## 1.0.0` in `CHANGELOG.md`:

```markdown
## 1.1.0

Customer sign-in with LINE, for apps that expose MCP tools to their own users.

### Added

- Token exchange (RFC 8693) at the token endpoint: a LINE client posts a customer's LINE ID token (`liff.getIDToken()`) and gets a short-lived MCP session. The session runs with the client's mapped admin token.
- `resolveSubject(authorization)` on the `oauth` service. Tool plugins pass the `Authorization` header their handler received and get the customer's `line:U…` subject, or `null` for staff sessions, plain admin tokens and anything invalid.
- Configuration: `identityProviders.line.channelId`, the test-only `identityProviders.line.verifyUrl`, and `endUserAccessTokenTtl` (default 3600 seconds).
- "Customer sign-in" when adding a client on the **MCP OAuth** page, a Customer column in the sessions list (masked), and token exchange details under Connection details.
- Discovery lists the token exchange grant when LINE sign-in is configured.

### Changed

- New fields: `endUserProvider` on clients (existing clients are staff clients), and `subject` on grants.
- LINE clients are always public, must keep a mapped admin token, and may have no redirect URI.
- Customer sessions have no refresh token. They expire after `endUserAccessTokenTtl`, and the app exchanges a fresh ID token.

### Breaking changes

None. Staff sign-in, dynamic client registration, refresh rotation and revocation work as before.
```

- [ ] **Step 3: Add the README section**

In `README.md`, insert this section before "## How it works", and add a row for it wherever the README lists sections:

````markdown
## Customer sign-in with LINE

Staff connect with their Strapi admin account. Your **customers** can use MCP tools too, from an app inside LINE (a LIFF app or LINE MINI App). The app exchanges the customer's LINE ID token for a short-lived session, and your tools find out who the customer is.

### Set it up

1. **Configure the LINE channel** whose ID tokens you accept. That's the LINE Login or LINE MINI App channel that hosts your app.

   ```ts
   // config/plugins.ts
   'strapi-oauth-mcp-manager': {
     config: {
       identityProviders: env('LINE_LOGIN_CHANNEL_ID')
         ? { line: { channelId: env('LINE_LOGIN_CHANNEL_ID') } }
         : {},
       endUserAccessTokenTtl: 3600,
     },
   },
   ```

2. **Create an admin token for customers** under Settings → Admin Tokens. Every customer session runs with its permissions, so grant only what customers may do.
3. **Add a client** on the **MCP OAuth** page. Choose **Customer sign-in: LINE** and map that token. LINE clients are public, and don't need a redirect URI.
4. **Allow your app's origin** in `config/middlewares.ts`, because the app calls Strapi from the browser:

   ```ts
   {
     name: 'strapi::cors',
     config: {
       origin: ['https://your-app.example.com'],
       methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
       headers: ['Content-Type', 'Authorization', 'Accept', 'mcp-session-id', 'mcp-protocol-version', 'Last-Event-ID'],
       expose: ['WWW-Authenticate', 'mcp-session-id', 'mcp-protocol-version'],
     },
   },
   ```

### Exchange the ID token in your app

The LIFF app needs the `openid` scope for `liff.getIDToken()`.

```js
await liff.init({ liffId });
if (!liff.isLoggedIn()) liff.login();

const response = await fetch(`${STRAPI_URL}/api/strapi-oauth-mcp-manager/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: LINE_CLIENT_ID,
    subject_token: liff.getIDToken(),
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    resource: `${STRAPI_URL}/mcp`,
  }),
});
const { access_token, expires_in } = await response.json();
// Call ${STRAPI_URL}/mcp with "Authorization: Bearer <access_token>". There is no refresh token:
// exchange a fresh ID token when the session expires.
```

### Use the customer's identity in your tools

Tool handlers see the caller's original `Authorization` header, so ask this plugin who holds the session:

```ts
createHandler: (strapi) => async ({ args, extra }) => {
  const subject = await strapi
    .plugin('strapi-oauth-mcp-manager')
    .service('oauth')
    .resolveSubject(extra.requestInfo?.headers?.authorization); // "line:U…" or null
  if (!subject) {
    // Not a signed-in customer: a staff session, a plain admin token, or no session at all.
  }
  // ...scope the tool to this customer
};
```

Never take the customer from a tool argument or a custom header. A header set by a middleware doesn't reach tools, and one sent by the caller could be forged. The session token can't be.

### Limits

- **No rate limit on the token endpoint.** Put one in front of it (proxy or WAF) for public apps.
- **A captured ID token can be exchanged until it expires,** like any bearer token. Sessions last at most `endUserAccessTokenTtl`.
- **To end customer sessions,** deactivate or delete the LINE client, delete or regenerate its admin token, or revoke sessions on the **MCP OAuth** page.
- **`identityProviders.line.verifyUrl`** is only for tests and local development, for example `node test/e2e/mock-line-verify.mjs`. Never set it in production.
````

- [ ] **Step 4: Run everything once more**

```bash
npm test && npm run test:ts:back && npm run test:ts:front && npm run build && npm run verify
```

Expected: all pass. The e2e suites passed in Task 7; rerun them if anything changed since.

- [ ] **Step 5: Commit, push and open the pull request**

```bash
git add package.json CHANGELOG.md README.md
git commit -m "docs: document customer sign-in with LINE for 1.1.0"
git push -u origin feat/line-token-exchange
gh pr create --base main --title "feat: customer sign-in with LINE (token exchange) for 1.1.0" --body-file - <<'BODY'
Implements `docs/superpowers/specs/2026-09-29-oauth-mcp-manager-line-design.md` (in strapi-store-demo-mcp).

- RFC 8693 token exchange: a LINE client exchanges a customer's LINE ID token for a short-lived MCP session backed by its mapped admin token
- `resolveSubject(authorization)` on the `oauth` service, so tool plugins can scope tools to the signed-in customer. Read-only.
- LINE clients are public, need a mapped token, and may have no redirect URI. The staff flow is unchanged.
- Admin page: customer sign-in in the client form, a masked Customer column, token exchange details
- Config: `identityProviders.line.{channelId, verifyUrl}` and `endUserAccessTokenTtl`

Also: `OAuthError` and the bearer parser moved to `utils/` (re-exported, so nothing breaks), the unused `ctx.state.mcpOAuthGrantId` is gone, and the type-check scripts no longer call Yarn's `run -T`.

Tests: unit tests for the provider, the client and grant-type rules, the token handler dispatch, discovery and `resolveSubject`. A new e2e suite, `line-exchange.mjs`, runs against a mock LINE verify endpoint, and the four existing e2e suites still pass. strapi-local needs the env-gated `identityProviders` block shown in the plan (`LINE_LOGIN_CHANNEL_ID`, `LINE_VERIFY_URL`) to run the new suite.

Publish 1.1.0 after the Maison demo integration passes.
BODY
```

Expected: `gh` prints the pull request URL. Don't publish to npm yet: the spec releases 1.1.0 after the demo integration passes.
