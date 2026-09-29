import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { bootStrapi } from './harness.mjs';

describe('maison permission actions', () => {
  let strapi;
  before(async () => {
    strapi = await bootStrapi('permissions');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('registers the four plugin actions', () => {
    const ids = strapi.service('admin::permission').actionProvider.values().map((action) => action.actionId);
    for (const id of [
      'plugin::maison.catalog.read',
      'plugin::maison.appointments.request',
      'plugin::maison.confirmations.send',
      'plugin::maison.demo.manage',
    ]) {
      assert.ok(ids.includes(id), `${id} is registered`);
    }
  });
});
