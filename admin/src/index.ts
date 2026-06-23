import { ChartPie } from '@strapi/icons';
import type { StrapiApp } from '@strapi/strapi/admin';

import { PERMISSIONS } from './permissions';

const PLUGIN_ID = 'store-analytics';

export default {
  register(app: StrapiApp) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: ChartPie,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: 'Store Analytics',
      },
      Component: () => import('./pages/AnalyticsPage'),
      permissions: PERMISSIONS.read,
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      name: 'Store Analytics',
    });
  },
};
