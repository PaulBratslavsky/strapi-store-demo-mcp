import { describe, expect, it, vi } from 'vitest';
import { browseCollectionsTool } from '../../server/src/mcp/tools/browse-collections';
import { getBoutiquesTool } from '../../server/src/mcp/tools/get-boutiques';
import { getProductTool } from '../../server/src/mcp/tools/get-product';
import { searchProductsTool } from '../../server/src/mcp/tools/search-products';
import { fakeStrapi } from './fake-strapi';

const context = { userAbility: {} as any, user: { id: 1 } };
const run = (tool: any, catalog: Record<string, unknown>, args: Record<string, unknown>, config = {}) =>
  tool.createHandler(fakeStrapi({ services: { catalog }, config }), context)({ args, extra: {} });
const matchesOutput = (tool: any, result: any) => tool.resolveOutputSchema(context).parse(result.structuredContent);

const card = { slug: 'weekender-50', name: 'Weekender 50', category: 'travel', priceJpy: 385000, imageUrl: null, occasions: ['travel'], personalizable: true, inStockAt: ['ginza'] };

describe('browse_collections', () => {
  it('uses the configured default locale and returns schema-valid output', async () => {
    const browseCollections = vi.fn(async () => [{ slug: 'voyage', name: 'ヴォヤージュ', teaser: '旅', heroImageUrl: null, productCount: 4 }]);
    const result = await run(browseCollectionsTool, { browseCollections }, {});
    expect(browseCollections).toHaveBeenCalledWith('ja');
    expect(result.structuredContent.locale).toBe('ja');
    expect(() => matchesOutput(browseCollectionsTool, result)).not.toThrow();
  });
});

describe('search_products', () => {
  it('passes filters through and returns schema-valid output', async () => {
    const searchProducts = vi.fn(async () => ({ total: 1, products: [card] }));
    const args = { occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', locale: 'en' };
    const result = await run(searchProductsTool, { searchProducts }, args);
    expect(searchProducts).toHaveBeenCalledWith('en', args);
    expect(() => matchesOutput(searchProductsTool, result)).not.toThrow();
  });

  it('rejects a min price above the max price with invalid_input', async () => {
    const result = await run(searchProductsTool, { searchProducts: vi.fn() }, { minPriceJpy: 500000, maxPriceJpy: 100000 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error.code).toBe('invalid_input');
  });
});

describe('get_product', () => {
  it('returns not_found with a recovery hint for an unknown slug', async () => {
    const result = await run(getProductTool, { getProduct: vi.fn(async () => null) }, { slug: 'nope' });
    const { error } = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(error.code).toBe('not_found');
    expect(error.hint).toMatch(/search_products/);
  });

  it('wraps a found product in schema-valid output', async () => {
    const product = {
      locale: 'ja', slug: 'weekender-50', sku: 'MSN-VY-050', name: 'ウィークエンダー 50', category: 'travel', priceJpy: 385000,
      description: '…', craftStory: '…', dimensionsCm: { width: 50, height: 29, depth: 22 },
      personalization: { offered: true, kinds: ['initials-hot-stamp'], leadDays: 3 },
      images: [{ url: 'https://cms.example.test/uploads/a.png', alt: 'Weekender 50' }], occasions: ['travel'],
      collection: { slug: 'voyage', name: 'ヴォヤージュ' }, stock: [{ boutique: 'ginza', name: '銀座本店', quantity: 2 }],
    };
    const result = await run(getProductTool, { getProduct: vi.fn(async () => product) }, { slug: 'weekender-50' });
    expect(result.structuredContent).toEqual({ product });
    expect(() => matchesOutput(getProductTool, result)).not.toThrow();
  });
});

describe('get_boutiques', () => {
  it('returns schema-valid output with openOnDate', async () => {
    const boutique = {
      slug: 'osaka', name: '大阪心斎橋店', city: '大阪', address: '…', hours: [{ weekday: 'mon', opens: '11:00', closes: '20:00' }],
      openOnDate: false, hoursOnDate: null, stock: [{ product: 'weekender-50', quantity: 0 }],
    };
    const getBoutiques = vi.fn(async () => [boutique]);
    const result = await run(getBoutiquesTool, { getBoutiques }, { date: '2026-10-06', productSlugs: ['weekender-50'] });
    expect(getBoutiques).toHaveBeenCalledWith('ja', { date: '2026-10-06', productSlugs: ['weekender-50'] });
    expect(result.structuredContent.date).toBe('2026-10-06');
    expect(() => matchesOutput(getBoutiquesTool, result)).not.toThrow();
  });
});
