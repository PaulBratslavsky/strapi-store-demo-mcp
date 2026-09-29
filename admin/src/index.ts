import type { StrapiApp } from '@strapi/strapi/admin';

import { PLUGIN_ID } from './pluginId';

export default {
  register(app: StrapiApp) {
    app.registerPlugin({ id: PLUGIN_ID, name: 'Maison' });
  },
};
