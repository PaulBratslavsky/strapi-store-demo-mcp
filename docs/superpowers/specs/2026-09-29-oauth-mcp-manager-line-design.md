# oauth-mcp-manager 1.1: LINE sign-in for customers

- **Date:** 2026-09-29
- **Status:** Draft for review
- **Overview:** [AX luxury demo overview](2026-09-29-ax-luxury-demo-overview.md)
- **Target repo:** [PaulBratslavsky/strapi-oauth-mcp-manager](https://github.com/PaulBratslavsky/strapi-oauth-mcp-manager), currently 1.0.0 (`046b629`), on a feature branch for 1.1.0

## Purpose

oauth-mcp-manager 1.0 lets **staff** connect MCP clients to Strapi's built-in `/mcp`. They sign in with a Strapi admin account, pick an admin token, and the plugin's middleware swaps its own OAuth access token for that admin token before core authenticates the request.

1.1 adds a second path for **end customers**:

- A customer app that already has a LINE ID token exchanges it for a session token.
- The middleware passes the customer's verified identity to tools in a trusted header.
- Strapi core still only ever sees an admin token.

The feature is general-purpose: any Strapi app exposing MCP tools to LINE users can use it.

## What stays the same

- The staff consent flow, dynamic client registration, PKCE, refresh rotation and reuse detection, revocation rules, discovery documents, and the admin page's existing features.
- Plain admin tokens sent to `/mcp` still pass through.
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
- The validator requires `channelId` to be a non-empty string when `line` is present.
- `endUserAccessTokenTtl` defaults to 3600 and must be a non-negative number.
- `identityProviders.line.verifyUrl` is optional and defaults to `https://api.line.me/oauth2/v2.1/verify`. It exists only so tests can point verification at a mock server. The README marks it as test-only.

## Identity provider interface

```ts
interface IdentityProvider {
  id: 'line';
  verify(idToken: string): Promise<{ subject: string; expiresAt: Date }>; // throws ProviderError
}
```

The LINE implementation:

- Calls `POST https://api.line.me/oauth2/v2.1/verify` as `application/x-www-form-urlencoded`, with `id_token` and `client_id=<channelId>`, and a 5-second timeout.
- Rejects the token unless the response has `aud === channelId`, `exp` in the future, and a `sub` matching `^U[0-9a-f]{32}$`.
- Returns `subject: "line:" + sub`.
- Maps LINE's 4xx responses to `invalid_grant` ("The LINE ID token is invalid or expired"), and network errors or 5xx to `temporarily_unavailable`.

Only LINE is built. The interface exists so another provider (for example Google) can be added without touching the token endpoint or the middleware.

## Data model changes

| Content type | New field | Notes |
|---|---|---|
| `mcp-oauth-client` | `endUserProvider`: enumeration `none` \| `line`, default `none` | |
| `mcp-oauth-token` (grants) | `subject`: string, private | `line:U…`. Empty for staff grants. |

These are additive, so existing clients and grants are unaffected. `line` clients must be public (`tokenEndpointAuthMethod: none`) and must have a mapped admin token (`adminTokenId`). The service rejects any other combination on create or update.

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
2. The provider is configured (`unauthorized_client`, with "LINE sign-in is not configured").
3. `subject_token_type` is the id_token type (`invalid_request`).
4. The provider verifies the token.
5. The client's mapped admin token loads for its owner (the same `loadOwnedToken(adminTokenId, ownerId)` path used for mapped staff clients), and the owner is active (`invalid_grant`).

It then creates a grant:

- `subject`, `adminUserId` (the token owner), `adminTokenId`, `ownsAdminToken: false`, `adminKeyHash`, `scope`, `resource`
- `expiresAt = now + endUserAccessTokenTtl`
- **no refresh token**: `issueTokens` gains an option to skip it, since the app simply exchanges a fresh ID token

Response:

```json
{
  "access_token": "<plugin access token>",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Other changes:

- **Discovery:** the authorization server metadata adds the token-exchange grant to `grant_types_supported` when a provider is configured.
- **Rejected combinations:** `authorization_code` and `refresh_token` requests from a `line` client get `unauthorized_client`. Token exchange from a staff client gets the same error.
- **Logging:** successful exchanges log the client and a masked subject, `line:U4af…9c`, never the full ID.

## Middleware changes

In `middlewares/mcp-oauth.ts`, for `POST /mcp`:

1. **Always delete `x-mcp-subject` from the incoming headers first,** before any other check and whatever token is presented. This is what makes the header trustworthy.
2. On a plugin access token, `resolveAccessToken` now also returns `subject`. After the existing admin-key swap, if the grant has a subject, set `ctx.request.headers['x-mcp-subject'] = subject`. That's the same header object core reads, so it reaches tool handlers through `requestInfo.headers`.
3. Everything else is unchanged: 401 with `WWW-Authenticate`, and pass-through for plain admin tokens.

The header name is exported as `MCP_SUBJECT_HEADER` and documented in the README as the contract for tool plugins.

## Admin page changes

- **Client form:** a "Customer sign-in" selector (`None` or `LINE`). Choosing LINE forces "public client" and requires a mapped token. A hint explains that every customer session runs with that token's permissions, so it should be narrow.
- **Sessions list:** a masked Subject column. Existing revoke actions apply to customer sessions too.
- **Connection details:** show the token endpoint and the exchange parameters when a LINE client exists.

## Security properties

- A customer session can do exactly what the mapped admin token can do, and only as that subject (enforced by the tools reading the header). Keep the mapped token narrow.
- A LINE ID token issued to another channel fails verification (`aud` and `client_id` checks), so a token from another app can't be exchanged.
- A captured ID token can be exchanged until it expires, as with any bearer token. Session tokens last at most `endUserAccessTokenTtl`.
- There are existing kill switches: deactivate the client, delete or regenerate the mapped token, revoke sessions.
- **No rate limit is added** in 1.1; this is listed under known limitations in the README.

## CORS

This is documented, not built. Browser apps call the token endpoint and `/mcp` cross-origin, so the host app configures `strapi::cors`:

- `origin`: the app's origin
- `headers`: `Authorization`, `Content-Type`, `Accept`, `Mcp-Protocol-Version`
- `expose`: `WWW-Authenticate`

## Testing

- **Unit tests** (`node --test` with tsx, in the existing style):
  - LINE provider: success, wrong `aud`, expired, malformed `sub`, 4xx, network error, all with `fetch` mocked
  - client validation: a `line` client must be public and mapped
  - the token-exchange branch of the token handler
- **E2e** (a new `test/e2e/line-exchange.mjs`, with the provider stubbed by a test-only config pointing `verifyUrl` at a local mock server):
  - exchange returns a token; `/mcp` `tools/list` with it shows only the mapped token's tools
  - a request carrying a spoofed `x-mcp-subject` reaches tools with the verified subject, or none for plain admin tokens
  - a staff client can't use the exchange; a `line` client can't use `authorization_code`
  - revoking the client kills the session
- **Existing e2e suites** still pass unchanged.

## Release

- `CHANGELOG.md` gets a 1.1.0 entry covering the additions, the new fields and config, and "no breaking changes".
- The README gets a "Customer sign-in with LINE" section: setup, LIFF snippet, CORS, and the header contract.
- Version 1.1.0, published after the demo integration passes.
