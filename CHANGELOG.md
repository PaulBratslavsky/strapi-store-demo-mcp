# Changelog

## Unreleased

### Added

- **A "Maison requests" widget on the admin Homepage** (`plugin::maison.requests`), for admins with "MCP: review appointment requests". It counts the requests waiting for staff, the confirmed visits still ahead and the LINE confirmations sent, lists the five newest requests, and refreshes every 5 seconds.
  - `GET /maison/appointments/summary`, an admin route gated on the same permission as the board's list. It answers `{ counts, recent }` from the new `appointments.summarizeRequests()`, which counts with the board's own definitions and returns the board's "All requests" rows, masked the same way.
- **REST routes at `/api/maison`**, on the same services, input schemas and LINE customer identity as the MCP tools:
  - `GET /collections`, `GET /products`, `GET /products/:slug` and `GET /boutiques`, as `browse_collections`, `search_products`, `view_product` and `find_boutiques`. A role or API token must hold `plugin::maison.catalog.browseCollections`, `searchProducts`, `viewProduct` or `findBoutiques`.
  - `POST /appointments` and `GET /my-appointments`, as `request_appointment` and `my_appointments`, for the signed-in LINE customer only. A new `customer-session` policy checks the session the way `/mcp` does (oauth-mcp-manager's `resolveAccessToken`), then resolves the customer the way the tools do (`resolveSubject`). Without a session `/mcp` would accept, it answers 401 with `WWW-Authenticate: Bearer`, and without oauth-mcp-manager 1.1 it answers 503.
  - Errors as `{ "error": { "code", "message", "hint" } }`, with the tools' codes, messages and hints, and statuses 400, 401, 404, 409, 422 and 503.
- `createdVia: "web"` for visits requested through the REST routes. The requests board, `appointment_requests` and `confirm_appointment` show it.
- `identity.customerSession(authorization)`: the customer behind an `Authorization` header, for the MCP tools and the REST routes alike. It checks the session first, except for MCP tool calls (`sessionValidated: true`), whose session `/mcp` has already checked.

### Changed

- The customer tools' input schemas live in `server/src/mcp/schemas.ts`, shared with the REST routes. The tools' inputs, outputs and errors are unchanged.
- A failed customer lookup is logged without oauth-mcp-manager's error message, which could quote the token.
