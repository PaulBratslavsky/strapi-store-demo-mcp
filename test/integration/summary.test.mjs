import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, SUBJECT_B, bootStrapi } from './harness.mjs';

// The service is counted at a fixed moment: 09:00 on Thursday 1 October 2026 in Tokyo. The admin route counts at the
// real clock. Every visit is in 2020 or in 2030, so both clocks tell the same ones from the ones still ahead.
const NOW = new Date('2026-10-01T00:00:00Z');
const LONG_AGO = new Date('2020-01-01T00:00:00Z');
const APPOINTMENT = 'plugin::maison.appointment';
const NOTIFICATION = 'plugin::maison.notification';
const REVIEW = 'plugin::maison.appointments.review';
const CONFIRM = 'plugin::maison.appointments.confirm';
const ROW_FIELDS = ['boutique', 'confirmationSent', 'customer', 'reference', 'requestedFor', 'status'];

describe('the requests summary behind the admin homepage widget', () => {
  let strapi;
  let appointments;
  let confirmations;
  const refs = {};

  /** Creates a request as a customer would. The pause keeps createdAt distinct, so "newest first" is stable. */
  const request = async (key, { now = NOW, ...overrides }) => {
    const result = await appointments.request({
      subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50'], createdVia: 'app', now, ...overrides,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    refs[key] = result.value.reference;
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const confirm = async (key, now = NOW) => assert.equal((await appointments.confirm(refs[key], now)).ok, true);
  const sendConfirmation = async (key) =>
    assert.equal((await confirmations.record({ reference: refs[key], status: 'sent', detail: 'ok' })).ok, true);
  const summarize = (now = NOW) => appointments.summarizeRequests(now);

  before(async () => {
    strapi = await bootStrapi('summary');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();
    appointments = strapi.plugin('maison').service('appointments');
    confirmations = strapi.plugin('maison').service('confirmations');
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('is all zeros, with no rows, before anything has been requested', async () => {
    assert.deepEqual(await summarize(), {
      counts: { waitingForStaff: 0, confirmedUpcoming: 0, confirmationsSent: 0 },
      recent: [],
    });
  });

  describe('with requests', () => {
    before(async () => {
      // Created in this order, so newest first is: late, soon, booked, other, done, gone.
      // The first two have visits that are over by NOW. They are requested as if it were 2020. `done` is then
      // confirmed, with its LINE confirmation sent, before its visit.
      await request('gone', { requestedFor: '2020-01-04T14:00:00+09:00', now: LONG_AGO }); // never confirmed
      await request('done', {
        subject: SUBJECT_B, boutique: 'omotesando', productSlugs: ['passport-cover'], requestedFor: '2020-01-05T15:00:00+09:00', now: LONG_AGO,
      });
      await confirm('done', new Date('2020-01-02T00:00:00Z'));
      await sendConfirmation('done');
      // Still ahead of NOW and of the real clock:
      await request('other', {
        subject: SUBJECT_B, boutique: 'omotesando', productSlugs: ['passport-cover'], requestedFor: '2030-01-13T15:00:00+09:00',
        createdVia: 'concierge', note: 'For my sister',
      });
      await confirm('other');
      await sendConfirmation('other');
      await request('booked', { requestedFor: '2030-01-12T14:00:00+09:00' });
      await confirm('booked');
      await request('soon', { requestedFor: '2030-01-12T16:00:00+09:00' });
      await request('late', { requestedFor: '2030-01-19T14:00:00+09:00', productSlugs: ['weekender-50', 'passport-cover'] });
    });

    it('counts what waits for staff, what is confirmed and ahead, and what LINE has confirmed', async () => {
      assert.deepEqual((await summarize()).counts, { waitingForStaff: 2, confirmedUpcoming: 2, confirmationsSent: 2 });
    });

    it('leaves a visit that is over out of "waiting" and out of "confirmed, upcoming"', async () => {
      const now = (await summarize()).counts;
      assert.equal(now.waitingForStaff, 2, 'gone, requested for a visit in 2020, is not waiting for staff');
      assert.equal(now.confirmedUpcoming, 2, 'done, confirmed for a visit in 2020, is not upcoming');
      // The same requests, counted before their visits, bring both back.
      const earlier = (await summarize(new Date('2019-12-31T00:00:00Z'))).counts;
      assert.equal(earlier.waitingForStaff, 3);
      assert.equal(earlier.confirmedUpcoming, 3);
    });

    it('lists the five newest requests, newest first, whatever their status or visit time', async () => {
      const { recent } = await summarize();
      assert.deepEqual(recent.map((row) => row.reference), [refs.late, refs.soon, refs.booked, refs.other, refs.done], 'gone, the oldest, is left out');
      assert.deepEqual(recent.map((row) => row.status), ['requested', 'requested', 'confirmed', 'confirmed', 'confirmed']);
      assert.deepEqual(recent.map((row) => row.confirmationSent), [false, false, false, true, true]);
      assert.deepEqual(recent[0], {
        reference: refs.late,
        status: 'requested',
        customer: 'line:Uaaa…aa',
        boutique: { slug: 'ginza', name: '銀座本店' },
        requestedFor: '2030-01-19T14:00:00+09:00',
        confirmationSent: false,
      });
      for (const row of recent) assert.deepEqual(Object.keys(row).sort(), ROW_FIELDS);
    });

    it("shows each row exactly as the board's All requests view does, with the customer masked and the note left out", async () => {
      const { recent } = await summarize();
      const board = (await appointments.listRequests({ status: 'all', limit: 5, now: NOW })).value;
      assert.deepEqual(
        recent,
        board.map(({ reference, status, customer, boutique, requestedFor, confirmationSent }) => ({
          reference, status, customer, boutique, requestedFor, confirmationSent,
        }))
      );
      assert.deepEqual(recent.map((row) => row.customer), ['line:Uaaa…aa', 'line:Uaaa…aa', 'line:Uaaa…aa', 'line:Ubbb…bb', 'line:Ubbb…bb']);
      const text = JSON.stringify(recent);
      assert.ok(!text.includes('a'.repeat(32)) && !text.includes('b'.repeat(32)), 'never a LINE user ID');
      assert.ok(!text.includes('For my sister'), "none of the customer's note");
    });

    it("agrees with the board's own views at any moment, boundaries included", async () => {
      // 05:00Z on 12 January 2030 is 14:00 in Tokyo, when `booked` starts. 07:00Z is when `soon` does.
      for (const at of [
        '2019-12-31T00:00:00Z', '2026-10-01T00:00:00Z', '2030-01-12T05:00:00Z', '2030-01-12T05:00:01Z',
        '2030-01-12T07:00:00Z', '2030-01-12T07:00:01Z', '2031-01-01T00:00:00Z',
      ]) {
        const now = new Date(at);
        const view = async (status) => (await appointments.listRequests({ status, limit: 50, now })).value;
        const ahead = (row) => Date.parse(row.requestedFor) >= now.getTime();
        assert.deepEqual((await summarize(now)).counts, {
          waitingForStaff: (await view('requested')).length,
          confirmedUpcoming: (await view('confirmed')).filter(ahead).length,
          confirmationsSent: (await view('all')).filter((row) => row.confirmationSent).length,
        }, at);
      }
    });

    it('follows the board when a confirmed visit is moved in the Content Manager and not published again', async () => {
      // Saving in the Content Manager changes the draft; the published version keeps its old time until Publish.
      const draft = await strapi.documents(APPOINTMENT).findFirst({ status: 'draft', filters: { reference: refs.booked } });
      await strapi.documents(APPOINTMENT).update({ documentId: draft.documentId, data: { requestedFor: '2020-01-06T14:00:00+09:00' } });
      try {
        const board = (await appointments.listRequests({ status: 'confirmed', limit: 50, now: NOW })).value.find((row) => row.reference === refs.booked);
        assert.equal(board.requestedFor, '2020-01-06T14:00:00+09:00', 'the board shows the draft time');
        assert.equal((await summarize()).counts.confirmedUpcoming, 1, 'so booked no longer counts as upcoming');
      } finally {
        await strapi.documents(APPOINTMENT).update({ documentId: draft.documentId, data: { requestedFor: '2030-01-12T14:00:00+09:00' } });
      }
      assert.equal((await summarize()).counts.confirmedUpcoming, 2);
    });

    it('counts an appointment once however many `sent` records it has, and ignores failed attempts and records of deleted appointments', async () => {
      const records = [
        { appointmentReference: refs.other, outcome: 'sent' }, // a second `sent` for an appointment that has one
        { appointmentReference: refs.booked, outcome: 'failed' }, // an attempt that did not reach the customer
        { appointmentReference: 'APT-0000', outcome: 'sent' }, // an appointment that no longer exists
      ];
      const created = [];
      for (const record of records) {
        created.push(await strapi.documents(NOTIFICATION).create({ data: { channel: 'line', sentAt: NOW.toISOString(), detail: 'test', ...record } }));
      }
      try {
        assert.equal((await summarize()).counts.confirmationsSent, 2);
      } finally {
        for (const { documentId } of created) await strapi.documents(NOTIFICATION).delete({ documentId });
      }
    });
  });

  describe('GET /maison/appointments/summary', () => {
    let baseUrl;
    let reviewer;
    let confirmer;

    /** One request to the admin route. Tokens are sent, never logged. */
    const get = async (path, token) => {
      const response = await fetch(new URL(path, baseUrl), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return { status: response.status, body: await response.json().catch(() => null) };
    };

    /**
     * An admin whose role holds `actions`, signed in the way the admin panel's login does it: a session, then an
     * access token. The account has no password, and exists only in this test's throwaway database.
     */
    const adminWith = async (name, actions) => {
      const roles = strapi.service('admin::role');
      const role = await roles.create({ name: `Maison test: ${name}`, description: 'Created by the Maison integration tests' });
      await roles.assignPermissions(role.id, actions.map((action) => ({ action, subject: null, properties: {}, conditions: [] })));
      const user = await strapi.service('admin::user').create({
        email: `${name}@maison.test`, firstname: name, lastname: 'Test', isActive: true, roles: [role.id],
      });
      const sessions = strapi.sessionManager('admin');
      const { token: refreshToken } = await sessions.generateRefreshToken(String(user.id), `maison-test-${name}`, { type: 'session' });
      const { token } = await sessions.generateAccessToken(refreshToken);
      return token;
    };

    before(async () => {
      reviewer = await adminWith('reviewer', [REVIEW]);
      confirmer = await adminWith('confirmer', [CONFIRM]); // holds a Maison permission, but not the one for reviewing
      await new Promise((resolve, reject) => {
        strapi.server.listen(0, '127.0.0.1', resolve).once('error', reject);
      });
      baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
    });

    it('refuses a caller who is not signed in to the admin', async () => {
      assert.equal((await get('/maison/appointments/summary')).status, 401);
      assert.equal((await get('/maison/appointments/summary', 'not-a-session')).status, 401);
    });

    it('answers 403 to an admin whose role lacks appointments.review, whatever else it holds', async () => {
      const { status, body } = await get('/maison/appointments/summary', confirmer);
      assert.equal(status, 403);
      assert.equal(body.data, null);
      assert.ok(!('counts' in body) && !('recent' in body), 'nothing of the summary');
    });

    it('answers an admin with appointments.review the counts and the five newest requests', async () => {
      const { status, body } = await get('/maison/appointments/summary', reviewer);
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual(body.counts, { waitingForStaff: 2, confirmedUpcoming: 2, confirmationsSent: 2 });
      assert.deepEqual(body.recent.map((row) => row.reference), [refs.late, refs.soon, refs.booked, refs.other, refs.done]);
      assert.deepEqual(body.recent[0].boutique, { slug: 'ginza', name: '銀座本店' });
      assert.equal(body.recent[0].customer, 'line:Uaaa…aa');
      for (const row of body.recent) assert.deepEqual(Object.keys(row).sort(), ROW_FIELDS);
      assert.ok(!JSON.stringify(body).includes('a'.repeat(32)), 'never a LINE user ID');
    });

    it('is not taken for an appointment reference, and leaves the board route alone', async () => {
      const board = await get('/maison/appointments?status=all', reviewer);
      assert.equal(board.status, 200);
      assert.ok(Array.isArray(board.body.appointments));
      const summary = await get('/maison/appointments/summary', reviewer);
      assert.equal(summary.status, 200);
      assert.ok(!('appointments' in summary.body), "the summary, not the board's list");
    });
  });
});
