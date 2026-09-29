import { ACTION } from '../constants';

const policies = [
  'admin::isAuthenticatedAdmin',
  { name: 'admin::hasPermissions', config: { actions: [ACTION.demoManage] } },
];

export default {
  admin: {
    type: 'admin',
    routes: [
      { method: 'POST', path: '/demo/seed', handler: 'demo.seed', config: { policies } },
      { method: 'POST', path: '/demo/reset', handler: 'demo.reset', config: { policies } },
    ],
  },
};
