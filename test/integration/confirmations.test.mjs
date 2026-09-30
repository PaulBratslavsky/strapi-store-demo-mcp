import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi } from './harness.mjs';

const LIFF_URL = 'https://liff.line.me/1234567890-AbCdEfGh';
const NOW = new Date('2026-10-01T00:00:00Z');
const APPOINTMENT = 'plugin::maison.appointment';

describe('confirmations service', () => {
  let strapi;
  let confirmations;
  let confirmed;
  let waiting;

  before(async () => {
    process.env.MAISON_LIFF_URL = LIFF_URL;
    strapi = await bootStrapi('confirmations');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    const appointments = strapi.plugin('maison').service('appointments');
    const make = async (requestedFor) =>
      (await appointments.request({
        subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50', 'passport-cover'], requestedFor, createdVia: 'concierge', now: NOW,
      })).value.reference;
    confirmed = await make('2026-10-10T14:00:00+09:00');
    waiting = await make('2026-10-11T14:00:00+09:00');
    const doc = await strapi.documents(APPOINTMENT).findFirst({ status: 'draft', filters: { reference: confirmed } });
    await strapi.documents(APPOINTMENT).publish({ documentId: doc.documentId });
    confirmations = strapi.plugin('maison').service('confirmations');
  });

  after(async () => {
    await strapi?.destroy();
    delete process.env.MAISON_LIFF_URL;
  });

  it('lists only published appointments, with a ready LINE message', async () => {
    const result = await confirmations.listPending(10);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.map((a) => a.reference), [confirmed]);
    const [item] = result.value;
    assert.equal(item.lineUserId, `U${'a'.repeat(32)}`);
    assert.equal(item.requestedFor, '2026-10-10T14:00:00+09:00');
    assert.equal(item.requestedForText, '10月10日(土) 14:00');
    assert.equal(item.boutique.name, '銀座本店');
    assert.deepEqual(item.products.map((p) => p.name), ['ウィークエンダー 50', 'パスポートカバー']);
    assert.equal(item.appLink, `${LIFF_URL}/visits/${confirmed}`);
    assert.equal(item.message.altText, `ご来店予約が確定しました（${confirmed}）`);
    assert.equal(item.previousAttempts, 0);
  });

  it('refuses unknown and unconfirmed appointments', async () => {
    assert.equal((await confirmations.record({ reference: 'APT-0000', status: 'sent', detail: 'x' })).code, 'not_found');
    assert.equal((await confirmations.record({ reference: waiting, status: 'sent', detail: 'x' })).code, 'not_published');
  });

  it('counts failed attempts, records a send once, then stops listing it', async () => {
    const failed = await confirmations.record({ reference: confirmed, status: 'failed', detail: 'not reachable: not a friend or blocked' });
    assert.equal(failed.ok, true);
    assert.equal(failed.value.alreadyRecorded, false);
    assert.equal((await confirmations.listPending(10)).value[0].previousAttempts, 1);

    const sent = await confirmations.record({ reference: confirmed, status: 'sent', detail: `{"sentMessages":[{"id":"1"}]}${'!'.repeat(900)}` });
    assert.equal(sent.value.alreadyRecorded, false);
    assert.equal(sent.value.notification.status, 'sent');
    assert.equal(Array.from(sent.value.notification.detail).length, 500, 'detail is stored up to 500 characters');

    const again = await confirmations.record({ reference: confirmed, status: 'sent', detail: 'second push' });
    assert.equal(again.value.alreadyRecorded, true);
    assert.equal(again.value.notification.sentAt, sent.value.notification.sentAt);

    assert.deepEqual((await confirmations.listPending(10)).value, []);
    const [mine] = (await strapi.plugin('maison').service('appointments').listForCustomer(SUBJECT_A, 'ja')).filter((a) => a.reference === confirmed);
    assert.equal(mine.status, 'confirmed');
    assert.equal(mine.confirmationSent, true);
  });

  it('returns not_configured without a liffUrl', async () => {
    strapi.config.set('plugin::maison.liffUrl', null);
    try {
      assert.equal((await confirmations.listPending(10)).code, 'not_configured');
    } finally {
      strapi.config.set('plugin::maison.liffUrl', LIFF_URL);
    }
  });

  it('clips detail that is long in UTF-16 units, such as emoji, so recording never fails', async () => {
    // Strapi's maxLength counts UTF-16 units, and an emoji is two, so 500 emoji would overflow a 500-code-point clip.
    const result = await confirmations.record({ reference: confirmed, status: 'failed', detail: '😀'.repeat(600) });
    assert.equal(result.ok, true);
    const { detail } = result.value.notification;
    assert.ok(detail.length <= 500, `stored ${detail.length} UTF-16 units`);
    assert.ok(detail.endsWith('…'), 'a clipped detail ends with an ellipsis');
    assert.ok(detail.isWellFormed(), 'no surrogate pair is cut in half');
  });
});
