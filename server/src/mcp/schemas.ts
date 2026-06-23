import { z } from '@strapi/utils';

export const isoDateSchema = z
  .string()
  .describe('ISO 8601 date or datetime string, e.g. "2024-01-01" or "2024-01-01T00:00:00.000Z"');

export const currencySchema = z.enum(['USD', 'EUR', 'GBP']);
