import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import type { Locale } from '../constants';
import { productNotFound } from '../domain/failures';
import { browseCollectionsInput, findBoutiquesInput, priceRangeFailure, searchProductsInput, viewProductInput } from '../mcp/schemas';
import { fromQuery } from '../rest/query';
import { parseOrReply, replyFailure, replyValue } from '../rest/reply';

/**
 * The catalog over REST, at /api/maison. Each action is named after the MCP tool it mirrors: it takes that tool's input
 * as query parameters, checks them with the same schema, calls the same service, and answers with the tool's
 * structured content. Strapi's role and API-token permissions decide who may call them.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => {
  const catalog = () => strapi.plugin('maison').service('catalog');
  const localeOf = (input: { locale?: Locale }) => input.locale ?? getConfig(strapi).defaultLocale;

  return {
    /** GET /collections, as browse_collections. */
    async browseCollections(ctx) {
      const input = parseOrReply(ctx, browseCollectionsInput, fromQuery(ctx.query));
      if (!input) return;
      const locale = localeOf(input);
      replyValue(ctx, { locale, collections: await catalog().browseCollections(locale) });
    },

    /** GET /products, as search_products. */
    async searchProducts(ctx) {
      const query = fromQuery(ctx.query, { numbers: ['minPriceJpy', 'maxPriceJpy', 'limit'], booleans: ['personalizable'] });
      const input = parseOrReply(ctx, searchProductsInput, query);
      if (!input) return;
      const invalid = priceRangeFailure(input);
      if (invalid) return replyFailure(ctx, invalid);
      const locale = localeOf(input);
      const result = await catalog().searchProducts(locale, input);
      if (!result.ok) return replyFailure(ctx, result);
      replyValue(ctx, { locale, ...result.value });
    },

    /** GET /products/:slug, as view_product. The path names the product; a slug in the query string can't change it. */
    async viewProduct(ctx) {
      const input = parseOrReply(ctx, viewProductInput, { ...fromQuery(ctx.query), slug: ctx.params.slug });
      if (!input) return;
      const product = await catalog().getProduct(localeOf(input), input.slug);
      if (!product) return replyFailure(ctx, productNotFound(input.slug));
      replyValue(ctx, { product });
    },

    /** GET /boutiques, as find_boutiques. Several products repeat the parameter: ?productSlugs=a&productSlugs=b. */
    async findBoutiques(ctx) {
      const input = parseOrReply(ctx, findBoutiquesInput, fromQuery(ctx.query, { lists: ['productSlugs'] }));
      if (!input) return;
      const result = await catalog().getBoutiques(localeOf(input), { date: input.date, productSlugs: input.productSlugs });
      if (!result.ok) return replyFailure(ctx, result);
      replyValue(ctx, { date: input.date ?? null, boutiques: result.value });
    },
  };
};
