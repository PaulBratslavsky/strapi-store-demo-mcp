import type { Core } from '@strapi/strapi';

import { PLUGIN_ID, READ_PERMISSION_UID } from './constants';

export const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.service('admin::permission').actionProvider.registerMany([
    {
      section: 'plugins',
      displayName: 'Access store analytics',
      uid: READ_PERMISSION_UID,
      pluginName: PLUGIN_ID,
    },
  ]);
};
