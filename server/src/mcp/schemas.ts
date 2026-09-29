import { z } from '@strapi/utils';

import { CATEGORIES, LOCALES, OCCASIONS } from '../constants';
import { ISO_DATE } from '../domain/hours';

const ISO_DATETIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export const localeInput = z.enum(LOCALES).optional().describe('Content language: "ja" (default) or "en".');
export const slugInput = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Use a slug like "weekender-50".');
export const isoDateInput = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD.');
export const isoDateTimeInput = z
  .string()
  .regex(ISO_DATETIME_WITH_OFFSET, 'Use ISO 8601 with a time zone, e.g. 2026-10-10T14:00:00+09:00.')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date and time.');
export const categoryInput = z.enum(CATEGORIES);
export const occasionInput = z.enum(OCCASIONS);

export const productCardOutput = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  priceJpy: z.number(),
  imageUrl: z.string().nullable(),
  occasions: z.array(z.string()),
  personalizable: z.boolean(),
  inStockAt: z.array(z.string()),
});
