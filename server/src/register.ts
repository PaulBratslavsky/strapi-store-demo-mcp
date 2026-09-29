import type { Core } from '@strapi/strapi';

import { registerDocumentMiddleware } from './document-middleware';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  registerDocumentMiddleware(strapi);
};

export default register;
