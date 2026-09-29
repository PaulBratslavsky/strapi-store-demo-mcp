import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from './constants';

const ACTIONS = [
  { uid: 'catalog.read', displayName: 'MCP: browse the catalog', subCategory: 'mcp' },
  { uid: 'appointments.request', displayName: 'MCP: request and view own appointments', subCategory: 'mcp' },
  { uid: 'confirmations.send', displayName: 'MCP: send appointment confirmations', subCategory: 'mcp' },
  { uid: 'demo.manage', displayName: 'Load and reset demo data', subCategory: 'demo' },
];

/** Actions must be registered in bootstrap (registerMany throws once Strapi is loaded). */
const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi
    .service('admin::permission')
    .actionProvider.registerMany(ACTIONS.map((action) => ({ section: 'plugins', pluginName: PLUGIN_ID, ...action })));
};

export default bootstrap;
