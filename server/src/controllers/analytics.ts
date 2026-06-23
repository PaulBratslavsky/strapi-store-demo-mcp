import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

export const analytics = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getKpis(ctx: Context) {
    const from = ctx.query.from as string | undefined;
    const to = ctx.query.to as string | undefined;

    const result = await strapi
      .plugin('store-analytics')
      .service('analytics')
      .getStoreKpis({ from, to });

    ctx.body = result;
  },

  async getTopProducts(ctx: Context) {
    const from = ctx.query.from as string | undefined;
    const to = ctx.query.to as string | undefined;
    const limit =
      ctx.query.limit !== undefined ? Number(ctx.query.limit) : undefined;

    const result = await strapi
      .plugin('store-analytics')
      .service('analytics')
      .getTopProducts({ from, to, limit });

    ctx.body = result;
  },

  async getLowStock(ctx: Context) {
    const limit =
      ctx.query.limit !== undefined ? Number(ctx.query.limit) : undefined;

    const result = await strapi
      .plugin('store-analytics')
      .service('analytics')
      .getLowStockProducts({ limit });

    ctx.body = result;
  },
});
