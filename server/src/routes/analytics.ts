import { MCP_AUTH_ACTION } from '../constants';

const analyticsPolicies = [
  'admin::isAuthenticatedAdmin',
  {
    name: 'admin::hasPermissions',
    config: {
      actions: [MCP_AUTH_ACTION],
    },
  },
];

export const analytics = {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/kpis',
      handler: 'analytics.getKpis',
      config: {
        policies: analyticsPolicies,
      },
    },
    {
      method: 'GET',
      path: '/top-products',
      handler: 'analytics.getTopProducts',
      config: {
        policies: analyticsPolicies,
      },
    },
    {
      method: 'GET',
      path: '/low-stock',
      handler: 'analytics.getLowStock',
      config: {
        policies: analyticsPolicies,
      },
    },
  ],
};
