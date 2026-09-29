import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi, ensureLocales } from './harness.mjs';

const UID = {
  product: 'plugin::maison.product',
  boutique: 'plugin::maison.boutique',
  stock: 'plugin::maison.stock-level',
  appointment: 'plugin::maison.appointment',
  notification: 'plugin::maison.notification',
};
const saturday = [{ weekday: 'sat', opens: '11:00', closes: '20:00' }];

describe('relations across locales and draft/publish (Strapi 5.55)', () => {
  let strapi;
  let boutique;
  let product;

  before(async () => {
    strapi = await bootStrapi('relations');
    await ensureLocales(strapi);
    boutique = (await strapi.documents(UID.boutique).create({
      locale: 'ja', status: 'published', data: { name: '銀座', slug: 'ginza', openingHours: saturday },
    })).documentId;
    product = (await strapi.documents(UID.product).create({
      locale: 'ja', status: 'published', data: { name: '検証', slug: 'probe', sku: 'PROBE-1', category: 'bag', priceJpy: 1000 },
    })).documentId;
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('keeps a stock level linked through a product republish and a new locale', async () => {
    await strapi.documents(UID.stock).create({
      data: {
        product: { documentId: product, locale: 'ja', status: 'published' },
        boutique: { documentId: boutique, locale: 'ja', status: 'published' },
        quantity: 2,
      },
    });
    const read = () => strapi.documents(UID.stock).findMany({
      filters: { product: { documentId: product } },
      populate: { product: { fields: ['documentId'] }, boutique: { fields: ['documentId'] } },
    });
    assert.equal((await read()).length, 1);

    await strapi.documents(UID.product).update({ documentId: product, locale: 'ja', data: { priceJpy: 2000 } });
    await strapi.documents(UID.product).publish({ documentId: product, locale: 'ja' });
    await strapi.documents(UID.product).update({ documentId: product, locale: 'en', data: { name: 'Probe', slug: 'probe' } });
    await strapi.documents(UID.product).publish({ documentId: product, locale: 'en' });

    const rows = await read();
    assert.equal(rows.length, 1, 'stock level is still found by product documentId');
    assert.equal(rows[0].product?.documentId, product, 'relation still points at the product');
    assert.equal(rows[0].boutique?.documentId, boutique);
  });

  it('keeps an appointment linked when it is published and when its boutique is republished', async () => {
    const created = await strapi.documents(UID.appointment).create({
      data: {
        reference: 'APT-0001',
        customer: SUBJECT_A,
        requestedFor: '2026-10-10T05:00:00.000Z',
        boutique: { documentId: boutique, locale: 'ja' },
        products: [{ documentId: product, locale: 'ja' }],
        createdVia: 'app',
      },
    });
    const populate = { boutique: { fields: ['documentId'] }, products: { fields: ['documentId'] } };
    const draft = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'draft', populate });
    assert.equal(draft.boutique?.documentId, boutique);
    assert.equal(draft.products?.length, 1);

    await strapi.documents(UID.appointment).publish({ documentId: created.documentId });
    const published = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'published', populate });
    assert.equal(published.boutique?.documentId, boutique, 'published appointment keeps its boutique');
    assert.equal(published.products?.[0]?.documentId, product, 'published appointment keeps its product');

    await strapi.documents(UID.boutique).update({ documentId: boutique, locale: 'ja', data: { name: '銀座本店' } });
    await strapi.documents(UID.boutique).publish({ documentId: boutique, locale: 'ja' });
    const again = await strapi.documents(UID.appointment).findOne({ documentId: created.documentId, status: 'published', populate });
    assert.equal(again.boutique?.documentId, boutique, 'relation survives a boutique republish');

    await strapi.documents(UID.notification).create({
      data: {
        appointment: { documentId: created.documentId, status: 'published' },
        channel: 'line', outcome: 'sent', sentAt: new Date().toISOString(), detail: 'probe', recordedBy: 'test',
      },
    });
    const logged = () => strapi.documents(UID.notification).findMany({
      filters: { appointment: { documentId: created.documentId } },
    });
    assert.equal((await logged()).length, 1, 'notification is found by appointment documentId');

    await strapi.documents(UID.appointment).update({ documentId: created.documentId, data: { customerNote: 'edited after confirmation' } });
    await strapi.documents(UID.appointment).publish({ documentId: created.documentId });
    assert.equal((await logged()).length, 1, 'notification survives a republish of its appointment');
  });

  it('applies the validation middleware', async () => {
    await assert.rejects(
      strapi.documents(UID.stock).create({
        data: {
          product: { documentId: product, locale: 'ja', status: 'published' },
          boutique: { documentId: boutique, locale: 'ja', status: 'published' },
          quantity: 1,
        },
      }),
      /already exists/
    );
    await assert.rejects(
      strapi.documents(UID.product).create({
        locale: 'ja',
        data: { name: 'x', slug: 'bad-occasion', sku: 'X-1', category: 'bag', priceJpy: 1, giftOccasions: ['graduation'] },
      }),
      /graduation/
    );
    await assert.rejects(
      strapi.documents(UID.boutique).create({
        locale: 'ja',
        data: { name: 'x', slug: 'bad-hours', openingHours: [{ weekday: 'mon', opens: '20:00', closes: '11:00' }] },
      }),
      /open before/
    );
  });
});
