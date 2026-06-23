import { ai } from '@strapi/strapi';
import { z } from '@strapi/utils';

import { MCP_AUTH_ACTION } from '../../constants';
import { currencySchema, isoDateSchema } from '../schemas';

const getTopProductsInputSchema = z.object({
  from: isoDateSchema
    .optional()
    .describe('Start of date range (inclusive). Omit for no lower bound.'),
  to: isoDateSchema
    .optional()
    .describe('End of date range (inclusive). Omit for no upper bound.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Number of products to return.'),
});

const getTopProductsOutputSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  currency: currencySchema,
  products: z.array(
    z.object({
      documentId: z.string(),
      name: z.string(),
      slug: z.string(),
      unitsSold: z.number(),
      revenue: z.number(),
    })
  ),
});

export const getTopProductsTool = ai.mcp.defineTool({
  name: 'get_top_products',
  title: 'Get Top Products',
  description:
    'Returns best-selling products ranked by revenue from order line items (quantity × unitPrice). Use from/to to filter by orderedAt date.',
  auth: {
    policies: [{ action: MCP_AUTH_ACTION }],
  },
  resolveInputSchema: () => getTopProductsInputSchema,
  resolveOutputSchema: () => getTopProductsOutputSchema,
  createHandler: (strapiInstance) => async ({ args }) => {
    const { from, to, limit } = args;
    const result = await strapiInstance
      .plugin('store-analytics')
      .service('analytics')
      .getTopProducts({ from, to, limit });

    const text = JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text }],
      structuredContent: result,
    };
  },
});
