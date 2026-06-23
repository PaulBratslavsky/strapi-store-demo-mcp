import type { Core } from '@strapi/strapi';

import { getLowStockProductsTool } from './tools/get-low-stock-products';
import { registerGetStoreKpisTool } from './tools/get-store-kpis';
import { getTopProductsTool } from './tools/get-top-products';

export const registerAllMcpTools = (strapi: Core.Strapi) => {
  // Approach 1: register inline via strapi.ai.mcp.registerTool({ ... })
  registerGetStoreKpisTool(strapi);

  // Approach 2: define with ai.mcp.defineTool, then pass to registerTool
  strapi.ai.mcp.registerTool(getTopProductsTool);
  strapi.ai.mcp.registerTool(getLowStockProductsTool);
};
