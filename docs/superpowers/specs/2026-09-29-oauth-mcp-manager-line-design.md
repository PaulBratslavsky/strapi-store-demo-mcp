# oauth-mcp-manager 1.1: LINE sign-in for customers

- **Date:** 2026-09-29, revised the same day
- **Status:** Draft for review
- **Overview:** [AX luxury demo overview](2026-09-29-ax-luxury-demo-overview.md)
- **Target repo:** [PaulBratslavsky/strapi-oauth-mcp-manager](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager), currently 1.0.0 (`046b629`), on a feature branch for 1.1.0

> **Revision:** the first draft passed the customer's identity to tools in an `x-mcp-subject` header set by the middleware. That can't work. Strapi's MCP transport (`@modelcontextprotocol/node` 2.0.0 on `@hono/node-server` 1.19.17) builds the headers tools see from Node's `rawHeaders`, so a middleware's header edits never reach tools, and a caller's own header would. Identity now comes from a service lookup instead (see [Subject lookup](#subject-lookup)).

## Purpose

oauth-mcp-manager 1.0 lets **staff** connect MCP clients to Strapi's built-in `/mcp`. They sign in with a Strapi admin account, pick an admin token, and the plugin's middleware swaps its own OAuth access token for that admin token before core authenticates the request.

1.1 adds a second path for **end customers**:

- A customer app that already has a LINE ID token exchanges it for a session token.
- The grant records who the customer is (`subject`).
- Tool plugins ask the plugin, through a public service method, which customer holds the session token they were called with.
- Strapi core still only ever sees an admin token.

The feature is general-purpose: any Strapi app exposing MCP tools to LINE users can use it.

## What stays the same

- The staff consent flow, dynamic client registration, PKCE, refresh rotation and reuse detection, revocation rules, discovery documents, and the admin page's existing features.
- Plain admin tokens sent to `/mcp` still pass through the middleware untouched.
- The plugin still requires `admin.secrets.encryptionKey`, because grants decrypt their admin token on every request.

## Configuration

```ts
// config/plugins.ts
'strapi-oauth-mcp-manager': {
  config: {
    identityProviders: {
      line: { channelId: env('LINE_LOGIN_CHANNEL_ID') },
    },
    endUserAccessTokenTtl: 3600, // seconds, default 3600
  },
},
```

- `identityProviders` is empty by default, so the feature is off unless configured.
- The validator requires `channelId` to be a string of digits when `line` is present. That's the LINE Login channel ID, not the LIFF ID.
- `endUserAccessTokenTtl` defaults to 3600 and must be a positive integer.
- `identityProviders.line.verifyUrl` is optional and defaults to `https://api.line.me/oauth2/v2.1/verify`. It exists only so tests and local development can point verification at a mock server. The README marks it as test-only, and the plugin logs a warning at boot when it's set.

## Identity provider interface

```ts
interface IdentityProvider {
  id: 'line';
  verify(idToken: string): Promise<{ subject: string; expiresAt: Date }>; // throws OAuthError
}
```

The LINE implementation:

- Calls `POST {verifyUrl}` as `application/x-www-form-urlencoded`, with `id_token` and `client_id=<channelId>`, and a 5-second timeout.
- Rejects the token unless the response has `aud === channelId`, `exp` in the future, and a `sub` matching `^U[0-9a-f]{32}$`.
- Returns `subject: "line:" + sub`.
- Maps LINE's 4xx responses (except 408 and 429), and any failed check, to `invalid_grant` ("The LINE ID token is invalid or expired").
- Maps network errors, timeouts, 408, 429 and 5xx to `temporarily_unavailable` (HTTP 503, with `Retry-After`), and logs the reason as a warning.

Only LINE is built. The interface exists so another provider can be added without touching the token endpoint.

## Data model changes

| Content type | New field | Notes |
|---|---|---|
| `mcp-oauth-client` | `endUserProvider`: enumeration `none` \| `line`, default `none` | Existing rows read back as `null` (defaults apply only on create). `normalizeClient` treats `null` as `none`. |
| `mcp-oauth-token` (grants) | `subject`: string, private | `line:U…`. Empty for staff grants. |

These are additive, so existing clients and grants are unaffected.

Rules for `line` clients, enforced by the service on create and update:

- They're always public (`tokenEndpointAuthMethod: none`). The admin create endpoint defaults to confidential today, so `line` overrides it.
- They must have a mapped admin token (`adminTokenId`). Updating a `line` client to unmap its token (`adminTokenId: null`) is rejected.
- Redirect URIs are optional, because token exchange has no redirect. The admin controller's and form's "at least one redirect URI" rule applies only to `none` clients.
- Only one `line` client can be active at a time. Every `line` client accepts ID tokens from the one configured channel, so a second active one could only widen what a customer can reach. Creating or re-activating one while another is active is refused (`invalid_request`).
- `/authorize` refuses `line` clients (`unauthorized_client`), so the consent flow never runs for them.

Existing queries that list fields explicitly gain the new ones:

- `listGrants` returns `subject`, masked by the service (`line:U4af…9c`), since the admin controller returns raw rows.
- `listClients` returns `endUserProvider`.

## Token exchange grant

`POST {prefix}/strapi-oauth-mcp-manager/oauth/token`, which is `/api/strapi-oauth-mcp-manager/oauth/token` by default. RFC 8693:

| Parameter | Value |
|---|---|
| `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` |
| `client_id` | a `line` client |
| `subject_token` | the LINE ID token from `liff.getIDToken()` |
| `subject_token_type` | `urn:ietf:params:oauth:token-type:id_token` |
| `resource` (optional) | the `/mcp` URL |

Checks, in order:

1. The client authenticates as a public client, is active, and has `endUserProvider === 'line'` (`unauthorized_client`).
2. The LINE provider is configured (`unauthorized_client`, with "LINE sign-in is not configured").
3. `subject_token` is present and `subject_token_type` is the id_token type (`invalid_request`).
4. The provider verifies the token.
5. The client's mapped admin token loads for its owner, using `getMappedToken(client)` for the owner and then the same owned-token loading used by mapped staff clients. The owner must be active. A failure here is a server configuration problem, not a bad ID token. It answers `temporarily_unavailable` (503) with a generic message, and logs what an admin must fix.

It then creates a grant:

- `subject`, `adminUserId` (the token owner), `adminTokenId`, `ownsAdminToken: false`, `adminKeyHash`, `scope: 'mcp'`, `resource`
- `expiresAt = now + endUserAccessTokenTtl`
- **no refresh token**: `refreshTokenHash` stays empty, and **`refreshExpiresAt = expiresAt`**. Cleanup deletes grants by `refreshExpiresAt`, and the admin page shows it as "Expires".

The client can change while LINE is answering, so the service reads the client again after creating the grant. If the client was deactivated, deleted or re-mapped in the meantime, the grant is deleted and the request refused.

Response:

```json
{
  "access_token": "<plugin access token>",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "mcp"
}
```

Other changes:

- **Discovery:** the authorization server metadata adds the token-exchange grant to `grant_types_supported` when the LINE provider is configured.
- **Rejected combinations:** `authorization_code` and `refresh_token` requests from a `line` client get `unauthorized_client`. Token exchange from a `none` client gets the same error.
- **Logging:** successful exchanges log the client and a masked subject, never the full ID.

## Subject lookup

This is a new public method on the `oauth` service. It's the contract for tool plugins such as Maison:

```ts
// strapi.plugin('strapi-oauth-mcp-manager').service('oauth')
resolveSubject(authorization: string | string[] | undefined): Promise<string | null>
```

- Takes the raw `Authorization` header value a tool sees in `extra.requestInfo.headers.authorization`. That's the caller's original header, because tools see raw headers.
- Returns the grant's `subject` when the header is `Bearer <plugin access token>`, the grant exists, it hasn't expired, and it has a subject.
- Returns `null` for anything else: no header, an array value, a plain admin token, an unknown or expired token, or a staff grant.
- **Read-only:** no `lastUsedAt` write and no revocation side effects. The middleware already did those for the same request.
- **It identifies the customer but doesn't authenticate the request.** Call it only from MCP tool handlers, where the middleware has already validated the session. `null` means "no verified customer".

The middleware itself is unchanged apart from dropping the unused `ctx.state.mcpOAuthGrantId`. It never sets or strips identity headers.

## Admin page changes

- **Client form:**
  - a "Customer sign-in" selector (`None` or `LINE`)
  - choosing LINE hides the confidential option (the client is public), hides the redirect URIs field, and requires a mapped token
  - a hint explains that every customer session runs with that token's permissions, so it should be narrow
- **Sessions list:** a masked Subject column. Existing revoke actions apply to customer sessions too, except "revoke every session approved by this user". On a customer row, "approved by" is the mapped token's owner, so that button is hidden there.
- **Connection details:** show the token endpoint and the exchange parameters when a LINE client exists.

## Security properties

- A customer session can do exactly what the mapped admin token allows. Tool plugins scope it to the customer by calling `resolveSubject`, which can't be spoofed because it depends only on the session token itself. Keep the mapped token narrow.
- A LINE ID token issued to another channel fails verification (`aud` and `client_id` checks), so a token from another app can't be exchanged.
- A captured ID token can be exchanged until it expires, as with any bearer token. Session tokens last at most `endUserAccessTokenTtl`.
- There are existing kill switches: deactivate the client, delete or regenerate the mapped token, revoke sessions.
- Each admin action updates the client before revoking its sessions, and the exchange re-checks the client after creating a session. So a sign-in that's waiting on LINE can't outlive a kill switch.
- **No rate limit is added** in 1.1; this is listed under known limitations in the README.

## CORS

This is documented, not built. Browser apps call the token endpoint and `/mcp` cross-origin, so the host app configures `strapi::cors`:

- `origin`: the app's origin
- `methods`: `GET, POST, DELETE, OPTIONS`
- `headers`: `Content-Type`, `Authorization`, `Accept`, `mcp-session-id`, `mcp-protocol-version`, `Last-Event-ID`
- `expose`: `WWW-Authenticate`, `mcp-session-id`, `mcp-protocol-version`

## Testing

- **Unit tests** (`node --test` with tsx, in the existing style):
  - LINE provider: success, wrong `aud`, expired, malformed `sub`, 4xx, network error, all with `fetch` mocked
  - client rules: a `line` client is forced public, must be mapped, can't be unmapped, and doesn't need redirect URIs
  - token exchange: success creates a grant with the subject and `refreshExpiresAt = expiresAt`; each check's error code
  - `resolveSubject`: valid customer grant, staff grant, expired grant, unknown token, plain admin token, missing header, array header
- **E2e** (a new `test/e2e/line-exchange.mjs`, with verification pointed at a local mock LINE server through `verifyUrl`):
  - exchange returns a token, and `/mcp` `tools/list` with it shows only the mapped token's tools
  - a `none` client can't use the exchange, and a `line` client can't use `authorization_code`
  - revoking the client kills the session
- **Existing e2e suites** still pass unchanged.

## Release

- `CHANGELOG.md` gets a 1.1.0 entry covering the additions, the new fields and config, the `resolveSubject` contract, and "no breaking changes".
- The README gets a "Customer sign-in with LINE" section: setup, LIFF snippet, CORS, and "Using the customer identity in your tools" (`resolveSubject`).
- Version 1.1.0, published after the demo integration passes.
