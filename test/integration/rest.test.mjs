import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, SUBJECT_B, bootStrapi } from './harness.mjs';

// The REST routes book against the real clock, so the visits are years ahead.
const SATURDAY_2PM = '2030-01-12T14:00:00+09:00'; // Ginza is open
const TUESDAY_2PM = '2030-01-15T14:00:00+09:00'; // Osaka is closed all day on Tuesdays
const CATALOG_ACTIONS = ['browseCollections', 'searchProducts', 'viewProduct', 'findBoutiques'];
const booking = { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: SATURDAY_2PM };
/** Stands in for the decrypted admin key resolveAccessToken returns with a valid session. It must never come back. */
const STUB_ADMIN_KEY = 'stub-admin-key-behind-the-session';

describe('the REST door: /api/maison over HTTP', () => {
  let strapi;
  let baseUrl;
  let fullAccessToken;
  let websiteJwt;
  let reference;

  /** One request to /api/maison<path>. Tokens are sent, never logged. */
  const call = async (method, path, { token, body } = {}) => {
    const response = await fetch(new URL(`/api/maison${path}`, baseUrl), {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  };

  /** What an admin does under Settings → Roles → Public, through users-permissions' role service. */
  const grantPublic = async (controller, actions) => {
    const roles = strapi.plugin('users-permissions').service('role');
    const { id } = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
    const { permissions } = await roles.findOne(id);
    for (const action of actions) permissions['plugin::maison'].controllers[controller][action].enabled = true;
    await roles.updateRole(id, { permissions });
  };

  before(async () => {
    strapi = await bootStrapi('rest');
    await strapi.plugin('maison').service('seed').loadDemoCatalog();

    // LINE customer sessions, as oauth-mcp-manager sees them. test-a and test-b are sessions /mcp accepts, for customers
    // A and B. test-a-rotated still names customer A, but /mcp refuses it: its admin token was rotated. Every other
    // token goes to oauth-mcp-manager's own resolvers, which have no session in this database.
    const oauth = strapi.plugin('strapi-oauth-mcp-manager').service('oauth');
    const resolveAccessToken = oauth.resolveAccessToken.bind(oauth);
    const resolveSubject = oauth.resolveSubject.bind(oauth);
    const accessTokens = {
      'test-a': { valid: true, adminAccessKey: STUB_ADMIN_KEY, grantId: 1 },
      'test-b': { valid: true, adminAccessKey: STUB_ADMIN_KEY, grantId: 2 },
      'test-a-rotated': { valid: false, reason: 'grant_revoked' },
    };
    const subjects = { 'Bearer test-a': SUBJECT_A, 'Bearer test-b': SUBJECT_B, 'Bearer test-a-rotated': SUBJECT_A };
    oauth.resolveAccessToken = async (token) => accessTokens[token] ?? resolveAccessToken(token);
    oauth.resolveSubject = async (authorization) => subjects[authorization] ?? resolveSubject(authorization);

    // A staff-issued API token with full access to the content API.
    ({ accessKey: fullAccessToken } = await strapi.service('admin::api-token').create({
      name: 'maison-rest-test', description: 'Maison REST integration test', type: 'full-access', kind: 'content-api', lifespan: null,
    }));

    // A website user signed in with users-permissions: a real JWT, but not a LINE customer.
    const authenticated = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
    const user = await strapi.db.query('plugin::users-permissions.user').create({
      data: { username: 'website-user', email: 'website-user@maison.test', provider: 'local', confirmed: true, blocked: false, role: authenticated.id },
    });
    const jwt = strapi.plugin('users-permissions').service('jwt');
    websiteJwt = await jwt.issue({ id: user.id });
    assert.equal((await jwt.verify(websiteJwt)).id, user.id, 'users-permissions accepts the JWT');

    await new Promise((resolve, reject) => {
      strapi.server.listen(0, '127.0.0.1', resolve).once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
  });

  after(async () => {
    await strapi?.destroy();
  });

  it('serves the catalog only to a role or an API token that holds the action', async () => {
    const denied = await call('GET', '/collections?locale=en');
    assert.equal(denied.status, 403, 'the Public role has no Maison action yet');
    assert.equal((await call('GET', '/collections?locale=en', { token: fullAccessToken })).status, 200, 'a full-access API token holds every action');

    await grantPublic('catalog', CATALOG_ACTIONS);
    const { status, body } = await call('GET', '/collections?locale=en');
    assert.equal(status, 200);
    assert.equal(body.locale, 'en');
    assert.deepEqual(body.collections.map((c) => c.name).sort(), ['Atelier', 'Gifts', 'Voyage']);
  });

  it('answers the demo question from the query string', async () => {
    const { status, body } = await call('GET', '/products?occasion=travel&maxPriceJpy=400000&inStockAt=ginza&locale=en');
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(body.products.map((p) => p.slug), ['weekender-50', 'garment-carrier', 'watch-roll-trois', 'passport-cover', 'luggage-tag-duo']);
    assert.equal(body.locale, 'en');
  });

  it('answers an unknown product with 404 and the hint view_product gives', async () => {
    const { status, body } = await call('GET', '/products/no-such-piece');
    assert.equal(status, 404);
    assert.deepEqual(body, {
      error: { code: 'not_found', message: 'No published product "no-such-piece".', hint: 'Call search_products to find valid product slugs.' },
    });
  });

  it('takes a list of products as a repeated parameter', async () => {
    const { status, body } = await call('GET', '/boutiques?productSlugs=weekender-50&productSlugs=passport-cover&date=2030-01-15');
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.date, '2030-01-15');
    const osaka = body.boutiques.find((b) => b.slug === 'osaka');
    assert.equal(osaka.openOnDate, false, 'Osaka is closed on Tuesdays');
    assert.deepEqual(osaka.stock.map((s) => s.product), ['weekender-50', 'passport-cover']);
  });

  it('refuses a booking without a LINE customer session, with 401 and WWW-Authenticate: Bearer', async () => {
    const callers = [
      ['no Authorization header', undefined],
      ['a full-access API token', fullAccessToken],
      ["a website user's users-permissions JWT", websiteJwt],
      ['an unknown session token', 'mcp_at_unknown'],
    ];
    for (const [label, token] of callers) {
      const { status, headers, body } = await call('POST', '/appointments', { token, body: booking });
      assert.equal(status, 401, label);
      assert.equal(headers.get('www-authenticate'), 'Bearer', label);
      assert.equal(body.error.code, 'not_signed_in', label);
    }
    const booked = await strapi.documents('plugin::maison.appointment').count({});
    assert.equal(booked, 0, 'nothing was booked');
  });

  it('opens nothing when a role is granted the customer actions, which roles never apply to', async () => {
    // Strapi lists every content-API action under Settings → Roles, these two included.
    await grantPublic('customer', ['requestAppointment', 'myAppointments']);
    assert.equal((await call('POST', '/appointments', { body: booking })).status, 401);
    assert.equal((await call('GET', '/my-appointments')).status, 401);
  });

  it('books for customer A with 201, marked as made on the web', async () => {
    const { status, body } = await call('POST', '/appointments', { token: 'test-a', body: { ...booking, note: 'From the website' } });
    assert.equal(status, 201, JSON.stringify(body));
    assert.match(body.appointment.reference, /^APT-\d{4}$/);
    assert.equal(body.appointment.status, 'requested');
    assert.equal(body.appointment.requestedFor, SATURDAY_2PM);
    assert.ok(!JSON.stringify(body).includes(STUB_ADMIN_KEY), 'the admin key behind the session never comes back');
    reference = body.appointment.reference;

    const stored = await strapi.documents('plugin::maison.appointment').findFirst({ status: 'draft', filters: { reference } });
    assert.equal(stored.customer, SUBJECT_A, 'the customer comes from the session');
    const staffView = (await strapi.plugin('maison').service('appointments').listRequests({ status: 'all' })).value.find(
      (appointment) => appointment.reference === reference
    );
    assert.equal(staffView.createdVia, 'web', 'the requests board shows where it came from');
  });

  it('refuses a session /mcp would refuse, such as one whose admin token was rotated, though it names a customer', async () => {
    const appointments = () => strapi.documents('plugin::maison.appointment').count({});
    const before = await appointments();
    const booked = await call('POST', '/appointments', { token: 'test-a-rotated', body: { ...booking, requestedFor: '2030-01-19T16:00:00+09:00' } });
    assert.equal(booked.status, 401, JSON.stringify(booked.body));
    assert.equal(booked.headers.get('www-authenticate'), 'Bearer');
    assert.equal(booked.body.error.code, 'not_signed_in');
    assert.equal(await appointments(), before, 'nothing was booked');
    assert.equal((await call('GET', '/my-appointments', { token: 'test-a-rotated' })).status, 401);
  });

  it('never takes the customer from the body', async () => {
    const { status, body } = await call('POST', '/appointments', {
      token: 'test-b',
      body: { ...booking, requestedFor: '2030-01-19T15:00:00+09:00', customer: SUBJECT_A },
    });
    assert.equal(status, 201, JSON.stringify(body));
    const stored = await strapi.documents('plugin::maison.appointment').findFirst({ status: 'draft', filters: { reference: body.appointment.reference } });
    assert.equal(stored.customer, SUBJECT_B);
    await strapi.documents('plugin::maison.appointment').delete({ documentId: stored.documentId });
  });

  it('rejects 30 February with 400 and the message the shared schema gives request_appointment', async () => {
    const { status, body } = await call('POST', '/appointments', { token: 'test-a', body: { ...booking, requestedFor: '2026-02-30T14:00:00+09:00' } });
    assert.equal(status, 400);
    assert.deepEqual(body, { error: { code: 'invalid_input', message: 'requestedFor: Not a real calendar date.' } });
  });

  it("answers a closed day with 409 boutique_closed and the service's message and hint", async () => {
    const { status, body } = await call('POST', '/appointments', { token: 'test-a', body: { ...booking, boutique: 'osaka', requestedFor: TUESDAY_2PM } });
    assert.equal(status, 409, JSON.stringify(body));
    assert.equal(body.error.code, 'boutique_closed');
    assert.match(body.error.message, /^大阪心斎橋店 is not open at 2030-01-15T14:00:00\+09:00\.$/);
    assert.match(body.error.hint, /closed all day on Tuesday 2030-01-15/);
  });

  it("lists A's visit for A and not for B, and nothing without a session", async () => {
    const mine = await call('GET', '/my-appointments?locale=en', { token: 'test-a' });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.appointments.map((a) => a.reference), [reference]);
    assert.equal(mine.body.appointments[0].boutique.name, 'Ginza Flagship');

    const theirs = await call('GET', '/my-appointments', { token: 'test-b' });
    assert.equal(theirs.status, 200);
    assert.ok(!theirs.body.appointments.some((a) => a.reference === reference), "B never sees A's visit");

    for (const token of [undefined, fullAccessToken, websiteJwt]) {
      const refused = await call('GET', '/my-appointments', { token });
      assert.equal(refused.status, 401);
      assert.equal(refused.headers.get('www-authenticate'), 'Bearer');
    }
  });

  it("refuses the customer's session on the catalog routes, which take a role or an API token", async () => {
    // Strapi's content-API auth reads any bearer token as a users-permissions JWT or an API token.
    assert.equal((await call('GET', '/collections', { token: 'test-a' })).status, 401);
  });
});
