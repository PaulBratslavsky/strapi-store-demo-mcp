import { ACTION } from '../constants';

/** Signed-in admins whose role holds `action`. Admin routes are served at /maison/<path>. */
const allow = (action: string) => [
  'admin::isAuthenticatedAdmin',
  { name: 'admin::hasPermissions', config: { actions: [action] } },
];

/**
 * Only a LINE customer session gets through, resolved the way the MCP tools resolve theirs. auth: false keeps
 * users-permissions from refusing that token first, so roles don't apply to these routes. A new object per route,
 * because Strapi writes into route configs as it registers them.
 */
const customerOnly = () => ({ auth: false as const, policies: ['plugin::maison.customer-session'] });

export default {
  admin: {
    type: 'admin',
    routes: [
      { method: 'GET', path: '/appointments', handler: 'appointments.list', config: { policies: allow(ACTION.appointmentsReview) } },
      // Ahead of every route that takes a :reference, so none of them can take "summary" for one.
      {
        method: 'GET',
        path: '/appointments/summary',
        handler: 'appointments.summary',
        config: { policies: allow(ACTION.appointmentsReview) },
      },
      {
        method: 'POST',
        path: '/appointments/:reference/confirm',
        handler: 'appointments.confirm',
        config: { policies: allow(ACTION.appointmentsConfirm) },
      },
      { method: 'POST', path: '/demo/seed', handler: 'demo.seed', config: { policies: allow(ACTION.demoManage) } },
      { method: 'POST', path: '/demo/reset', handler: 'demo.reset', config: { policies: allow(ACTION.demoManage) } },
    ],
  },
  /**
   * The REST door, served at /api/maison/<path>. The catalog routes use Strapi's own content-API auth: a role or an
   * API token must hold plugin::maison.catalog.<action>, e.g. the Public role under Settings → Roles.
   */
  'content-api': {
    type: 'content-api',
    routes: [
      { method: 'GET', path: '/collections', handler: 'catalog.browseCollections' },
      { method: 'GET', path: '/products', handler: 'catalog.searchProducts' },
      { method: 'GET', path: '/products/:slug', handler: 'catalog.viewProduct' },
      { method: 'GET', path: '/boutiques', handler: 'catalog.findBoutiques' },
      { method: 'POST', path: '/appointments', handler: 'customer.requestAppointment', config: customerOnly() },
      { method: 'GET', path: '/my-appointments', handler: 'customer.myAppointments', config: customerOnly() },
    ],
  },
};
