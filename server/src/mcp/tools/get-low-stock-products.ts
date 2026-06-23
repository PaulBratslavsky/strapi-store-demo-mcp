import { ai } from '@strapi/strapi';
import { z } from '@strapi/utils';

import { MCP_AUTH_ACTION } from '../../constants';
import { currencySchema } from '../schemas';

const getLowStockProductsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10).optional(),
});

const getLowStockProductsOutputSchema = z.object({
  threshold: z.number(),
  currency: currencySchema,
  products: z.array(
    z.object({
      documentId: z.string(),
      name: z.string(),
      slug: z.string(),
      sku: z.string().nullable(),
      stock: z.number(),
      category: z
        .object({
          name: z.string(),
          slug: z.string(),
        })
        .nullable(),
    })
  ),
});

export const getLowStockProductsTool = ai.mcp.defineTool({
  name: 'get_low_stock_products',
  title: 'Get Low Stock Products',
  description:
    'Returns products at or below the low stock threshold defined in Store Settings.',
  auth: {
    policies: [{ action: MCP_AUTH_ACTION }],
  },
  resolveInputSchema: () => getLowStockProductsInputSchema,
  resolveOutputSchema: () => getLowStockProductsOutputSchema,
  createHandler: (strapiInstance) => async ({ args }) => {
    const { limit } = args;
    const result = await strapiInstance
      .plugin('store-analytics')
      .service('analytics')
      .getLowStockProducts({ limit });

    const text = JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text }],
      structuredContent: result,
    };
  },
});
