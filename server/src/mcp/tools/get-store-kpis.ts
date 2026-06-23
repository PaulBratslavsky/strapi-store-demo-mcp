import type { Core } from '@strapi/strapi';
import { z } from '@strapi/utils';

import { MCP_AUTH_ACTION } from '../../constants';
import { currencySchema, isoDateSchema } from '../schemas';

const getStoreKpisInputSchema = z.object({
  from: isoDateSchema
    .optional()
    .describe('Start of date range (inclusive). Omit for no lower bound.'),
  to: isoDateSchema
    .optional()
    .describe('End of date range (inclusive). Omit for no upper bound.'),
});

const getStoreKpisOutputSchema = z.object({
  storeName: z.string(),
  currency: currencySchema,
  from: z.string().nullable(),
  to: z.string().nullable(),
  revenue: z.number(),
  orderCount: z.number(),
  averageOrderValue: z.number(),
  ordersByStatus: z.record(z.string(), z.number()),
});

export const registerGetStoreKpisTool = (strapi: Core.Strapi) => {
  strapi.ai.mcp.registerTool({
    name: 'get_store_kpis',
    title: 'Get Store KPIs',
    description:
      'Returns revenue, order count, average order value, and order counts by status for the Demo Store. Revenue includes orders with status paid, shipped, or delivered. Use from/to to filter by orderedAt date.',
    auth: {
      policies: [{ action: MCP_AUTH_ACTION }],
    },
    resolveInputSchema: () => getStoreKpisInputSchema,
    resolveOutputSchema: () => getStoreKpisOutputSchema,
    createHandler: (strapiInstance) => async ({ args }) => {
      const { from, to } = args;
      const result = await strapiInstance
        .plugin('store-analytics')
        .service('analytics')
        .getStoreKpis({ from, to });

      const text = JSON.stringify(result, null, 2);

      return {
        content: [{ type: 'text', text }],
        structuredContent: result,
      };
    },
  });
};
