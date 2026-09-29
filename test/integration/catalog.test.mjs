import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { bootStrapi } from './harness.mjs';

describe('catalog service on seeded data', () => {
  let strapi;
  let catalog;
  before(async () => {
    strapi = await bootStrapi('catalog');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    catalog = strapi.plugin('maison').service('catalog');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('lists the three collections with their product counts', async () => {
    const collections = await catalog.browseCollections('ja');
    assert.deepEqual(collections.map((c) => c.slug).sort(), ['atelier', 'ecrins', 'voyage']);
    assert.equal(collections.reduce((sum, c) => sum + c.productCount, 0), 12);
  });

  it('answers the demo question: travel gifts under ¥400,000 in stock at Ginza', async () => {
    const result = await catalog.searchProducts('en', { occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', limit: 10 });
    assert.deepEqual(result.products.map((p) => p.slug), ['weekender-50', 'garment-carrier', 'watch-roll-trois', 'passport-cover', 'luggage-tag-duo']);
    assert.equal(result.products[0].name, 'Weekender 50');
  });

  it('returns product details with stock per boutique', async () => {
    const product = await catalog.getProduct('en', 'weekender-50');
    assert.equal(product.locale, 'en');
    assert.deepEqual(product.stock.find((s) => s.boutique === 'ginza'), { boutique: 'ginza', name: 'Ginza Flagship', quantity: 2 });
  });

  it('falls back to ja for a product without an en version', async () => {
    await strapi.documents('plugin::maison.product').create({
      locale: 'ja', status: 'published', data: { name: '限定品', slug: 'ja-only', sku: 'MSN-JA-1', category: 'objet', priceJpy: 10000 },
    });
    const product = await catalog.getProduct('en', 'ja-only');
    assert.equal(product.locale, 'ja');
    assert.equal(product.name, '限定品');
  });

  it('never returns a product that was never published', async () => {
    await strapi.documents('plugin::maison.product').create({
      locale: 'ja', data: { name: '下書き', slug: 'draft-only', sku: 'MSN-DR-1', category: 'objet', priceJpy: 1 },
    });
    const { products } = await catalog.searchProducts('ja', { limit: 20 });
    assert.ok(!products.some((p) => p.slug === 'draft-only'));
    assert.equal(await catalog.getProduct('ja', 'draft-only'), null);
  });

  it('reports Osaka closed on Tuesday 6 October and stock per boutique', async () => {
    const boutiques = await catalog.getBoutiques('ja', { date: '2026-10-06', productSlugs: ['weekender-50'] });
    const osaka = boutiques.find((b) => b.slug === 'osaka');
    const ginza = boutiques.find((b) => b.slug === 'ginza');
    assert.equal(osaka.openOnDate, false);
    assert.equal(ginza.openOnDate, true);
    assert.deepEqual(ginza.stock, [{ product: 'weekender-50', quantity: 2 }]);
  });
});
