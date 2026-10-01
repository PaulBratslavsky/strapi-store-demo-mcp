import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { OCCASIONS, PERSONALIZATION_KINDS, PLUGIN_ID, UID } from './constants';
import { validateOpeningHours } from './domain/hours';
import { validateEnumArray } from './domain/validation';

type Data = Record<string, unknown>;

const fail = (message: string): never => {
  throw new errors.ValidationError(message);
};

const validateProduct = (data: Data) => {
  const fields = [
    ['personalizationKinds', PERSONALIZATION_KINDS],
    ['giftOccasions', OCCASIONS],
  ] as const;
  for (const [field, allowed] of fields) {
    if (data[field] === undefined || data[field] === null) continue;
    const problem = validateEnumArray(data[field], allowed, field);
    if (problem) fail(problem);
  }
};

const validateBoutique = (data: Data) => {
  if (data.openingHours === undefined) return;
  const result = validateOpeningHours(data.openingHours);
  if (result.ok === false) fail(result.reason);
};

const assertUniqueStockPair = async (strapi: Core.Strapi, data: Data) => {
  const { productSlug, boutiqueSlug } = data;
  if (typeof productSlug !== 'string' || typeof boutiqueSlug !== 'string') return;
  const existing = await strapi.documents(UID.stockLevel).count({
    filters: { productSlug: { $eq: productSlug }, boutiqueSlug: { $eq: boutiqueSlug } },
  });
  if (existing > 0) fail('A stock level for this product and boutique already exists; update it instead.');
};

/** The references of the appointments a publish published: one, as appointments aren't localized. */
const publishedReferences = (result: unknown): string[] => {
  const entries = ((result as { entries?: Data[] } | null)?.entries ?? []) as Data[];
  return [...new Set(entries.map((entry) => entry.reference).filter((reference): reference is string => typeof reference === 'string'))];
};

/** Sends each published appointment's LINE confirmation. Nothing here throws: a failure is logged, never passed on. */
const sendConfirmations = async (strapi: Core.Strapi, published: unknown) => {
  for (const reference of publishedReferences(published)) {
    try {
      await strapi.plugin(PLUGIN_ID).service('line-confirmations').sendConfirmation(reference);
    } catch (error) {
      strapi.log.error(`[maison] The LINE confirmation for ${reference} couldn't be sent: ${(error as Error)?.message ?? error}`);
    }
  }
};

/**
 * Same rules for the admin and the tools: every create/update goes through the Document Service.
 *
 * And the same confirmation: publishing an appointment confirms the visit, whichever way it happens. That's the board's
 * Confirm, the admin chat and MCP clients (all through appointments.confirm), and Publish in the Content Manager. Once
 * the publish has gone through, Strapi sends the customer the LINE confirmation and waits for it, so the board's next
 * refresh shows how it went. The push's 8-second timeout bounds that wait. Sending never fails the publish.
 */
export const registerDocumentMiddleware = (strapi: Core.Strapi) => {
  strapi.documents.use(async (ctx, next) => {
    if (ctx.action === 'create' || ctx.action === 'update') {
      const data = ((ctx.params as { data?: Data }).data ?? {}) as Data;
      if (ctx.uid === UID.product) validateProduct(data);
      if (ctx.uid === UID.boutique) validateBoutique(data);
      if (ctx.uid === UID.stockLevel && ctx.action === 'create') await assertUniqueStockPair(strapi, data);
    }
    return next();
  });

  strapi.documents.use(async (ctx, next) => {
    if (ctx.uid !== UID.appointment || ctx.action !== 'publish') return next();
    const published = await next();
    await sendConfirmations(strapi, published);
    return published;
  });
};
