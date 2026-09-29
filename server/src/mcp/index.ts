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
