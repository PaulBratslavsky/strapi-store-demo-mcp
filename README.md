# strapi-store-demo-mcp

A Strapi 5 plugin (`store-analytics`) that adds a **Store Analytics** page to the admin and three custom tools to Strapi's built-in MCP server:

| MCP tool | Returns |
|---|---|
| `get_store_kpis` | Revenue, order count, average order value and orders by status, optionally for a `from`/`to` date range |
| `get_top_products` | Best sellers ranked by revenue from order lines |
| `get_low_stock_products` | Products at or below the store's low-stock threshold |

It was extracted from [nclsndr/strapi-demo-store-mcp](https://github.com/nclsndr/strapi-demo-store-mcp) (`src/plugins/store-analytics`) as a starting point for building custom MCP tools as a plugin. The tools and admin page are unchanged from the demo; this repo adds the plugin SDK build so it can be linked or installed into any Strapi app.

## Requirements

- Strapi **5.55.1+** with the MCP server enabled (see below).
- The demo store's content model. Every tool and admin request reads these, and fails with `Cannot read properties of undefined (reading 'attributes')` if one is missing:

| UID | Fields the plugin reads |
|---|---|
| `api::store-setting.store-setting` (single type) | `storeName`, `currency` (`USD`/`EUR`/`GBP`), `lowStockThreshold` |
| `api::order.order` | `status` (`pending`/`paid`/`shipped`/`delivered`/`cancelled`), `orderedAt`, `total`, `lines` (repeatable component with `product` relation, `quantity`, `unitPrice`) |
| `api::product.product` | `name`, `slug`, `sku`, `stock`, `category` (relation with `name`, `slug`) |

The schemas are in the demo repo under `src/api` and `src/components`. To use your own content model, change the UIDs in `server/src/constants.ts` and the queries in `server/src/services/analytics.ts`.

## Develop against a local Strapi app

```bash
npm install
npm run build
```

Link the build into a Strapi app with [yalc](https://github.com/wclr/yalc), which is what the plugin SDK's `watch:link` uses. `watch:link` expects yalc installed globally:

```bash
npm install -g yalc
npm run watch:link          # rebuilds and pushes to linked apps on every change
```

In the Strapi app:

```bash
npx yalc add --link strapi-store-demo-mcp
yarn install                # or npm install
```

Enable the plugin and the MCP server, then restart Strapi:

```ts
// config/plugins.ts
export default () => ({
  'store-analytics': { enabled: true },
});

// config/server.ts, inside the returned object
mcp: { enabled: env.bool('MCP_ENABLED', true) },
```

The plugin runs from `dist/`, so source changes only take effect after a rebuild (`watch:link` does this for you) and a Strapi restart.

## Call the tools

The MCP server lives at `http://localhost:1337/mcp` and only accepts **admin** API tokens. A content API token from Settings → API Tokens is rejected with 401. A token sees these tools only if it holds the `plugin::store-analytics.read` permission, which the plugin registers on bootstrap.

Mint one with `strapi console` while the dev server is stopped (SQLite allows one writer). Set `PORT` if 1337 is taken, because the console starts a server:

```bash
printf '%s\n' \
  "const u=(await strapi.db.query('admin::user').findMany())[0]; const t=await strapi.service('admin::api-token-admin').create({name:'store-analytics-mcp', lifespan:null, adminUserOwner:u.id, adminPermissions:[{action:'plugin::store-analytics.read'}]}, u); console.log('TOKEN='+t.accessKey);" \
  ".exit" | npx strapi console
```

List the tools:

```bash
curl -sS -X POST http://localhost:1337/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Or connect Claude Code:

```bash
claude mcp add store-analytics --transport http http://localhost:1337/mcp -H "Authorization: Bearer $TOKEN"
```

## Scripts

| Script | What it does |
|---|---|
| `build` | Builds `dist/` with `@strapi/sdk-plugin` |
| `watch` / `watch:link` | Rebuilds on change; `watch:link` also pushes to yalc-linked apps |
| `verify` | Checks `package.json` exports point at built files |
| `test:ts:front` / `test:ts:back` | Type-checks the admin and server code |
