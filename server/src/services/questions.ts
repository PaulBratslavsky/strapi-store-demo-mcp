import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { MAX_OPEN_QUESTIONS, UID, type Locale, type QuestionReason, type QuestionStatus } from '../constants';
import { getDisplayName } from '../domain/line-push';
import { generateReference } from '../domain/reference';
import { failure, type ServiceResult } from '../domain/service-result';
import { lineUserIdOf, maskSubject } from '../domain/subject';

type Doc = Record<string, any>;

export interface QuestionRequest {
  subject: string;
  question: string;
  reason: QuestionReason;
  productSlug?: string;
  /** The chat's language. Defaults to defaultLocale. */
  locale?: Locale;
}

/** What the concierge gets back. */
export interface QuestionView {
  reference: string;
  status: 'open';
  product: { slug: string; name: string } | null;
}

/** A question as staff see it: the customer masked, with their LINE name when LINE gave one. */
export interface StaffQuestionView {
  reference: string;
  customer: string;
  customerName: string | null;
  question: string;
  reason: QuestionReason;
  language: Locale;
  product: { slug: string; name: string } | null;
  status: QuestionStatus;
  staffName: string | null;
  takenAt: string | null;
  answeredAt: string | null;
  answer: string | null;
  addedToKnowledge: boolean;
  line: { outcome: 'sent' | 'failed'; detail: string } | null;
  createdAt: string;
}

export interface QuestionFilters {
  /** open: open or taken, the default. */
  status?: 'open' | 'answered' | 'all';
  limit?: number;
}

const STATUS_FILTERS: Record<NonNullable<QuestionFilters['status']>, Doc> = {
  open: { status: { $in: ['open', 'taken'] } },
  answered: { status: { $eq: 'answered' } },
  all: {},
};

/** A date as an ISO string, or null when there is none. */
const isoOrNull = (value: unknown): string | null => (value ? new Date(value as string | number | Date).toISOString() : null);

export default ({ strapi }: { strapi: Core.Strapi }) => {
  /** A published piece by slug, named in `language`, or in the default language when it has no version in that one. */
  const productNamed = async (slug: string, language: Locale): Promise<{ slug: string; name: string } | null> => {
    const { defaultLocale } = getConfig(strapi);
    for (const locale of new Set([language, defaultLocale])) {
      const product = (await strapi.documents(UID.product).findFirst({
        locale,
        status: 'published',
        filters: { slug: { $eq: slug } },
        fields: ['slug', 'name'],
      })) as Doc | null;
      if (product) return { slug: product.slug, name: product.name };
    }
    return null;
  };

  /** A reference no question has. `random` is only for tests. */
  const uniqueReference = async (random: () => number = Math.random): Promise<string> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reference = generateReference(random, 'Q');
      if ((await strapi.documents(UID.question).count({ filters: { reference: { $eq: reference } } })) === 0) return reference;
    }
    throw new Error('[maison] Could not find a free question reference after 20 attempts.');
  };

  const toStaffView = (row: Doc, product: StaffQuestionView['product']): StaffQuestionView => ({
    reference: row.reference,
    customer: maskSubject(row.customer),
    customerName: row.customerName ?? null,
    question: row.question,
    reason: row.reason,
    language: row.language,
    product,
    status: row.status,
    staffName: row.staffName ?? null,
    takenAt: isoOrNull(row.takenAt),
    answeredAt: isoOrNull(row.answeredAt),
    answer: row.answer ?? null,
    addedToKnowledge: Boolean(row.knowledgeDocumentId),
    line: row.lineOutcome ? { outcome: row.lineOutcome, detail: row.lineDetail ?? '' } : null,
    createdAt: new Date(row.createdAt).toISOString(),
  });

  return {
    /** Records a question for staff. Nothing here messages the customer. */
    async ask(input: QuestionRequest): Promise<ServiceResult<QuestionView>> {
      const { defaultLocale, lineChannelAccessToken: token, lineApiBaseUrl } = getConfig(strapi);
      const language = input.locale ?? defaultLocale;
      const waiting = await strapi.documents(UID.question).count({
        filters: { customer: { $eq: input.subject }, status: { $in: ['open', 'taken'] } },
      });
      if (waiting >= MAX_OPEN_QUESTIONS) {
        return failure(
          'too_many_open_questions',
          `This customer already has ${MAX_OPEN_QUESTIONS} questions with Maison's client advisors.`,
          "Don't hand this one off. Tell the customer their earlier questions are with the advisors, who will reply in the LINE chat with Maison."
        );
      }
      // An unknown piece never refuses the hand-off: the question still reaches staff, without it.
      const product = input.productSlug ? await productNamed(input.productSlug, language) : null;
      // Staff find the customer's chat in LINE by this name. Without a token, or an answer from LINE, there's none.
      const customerName = token ? await getDisplayName({ apiBaseUrl: lineApiBaseUrl, token }, lineUserIdOf(input.subject)) : null;
      const reference = await uniqueReference();
      await strapi.documents(UID.question).create({
        data: {
          reference,
          customer: input.subject,
          customerName,
          question: input.question.trim(),
          reason: input.reason,
          language,
          productSlug: product?.slug ?? null,
          status: 'open',
        },
      });
      return { ok: true, value: { reference, status: 'open', product } };
    },

    /** The Customer questions section's rows, newest first. Each piece is looked up once per language. */
    async list(filters: QuestionFilters = {}): Promise<ServiceResult<StaffQuestionView[]>> {
      const rows = (await strapi.documents(UID.question).findMany({
        filters: STATUS_FILTERS[filters.status ?? 'open'],
        sort: { createdAt: 'desc' },
        limit: filters.limit ?? 50,
      })) as Doc[];
      // One lookup per piece and language, shared by every question about it.
      const names = new Map<string, Promise<StaffQuestionView['product']>>();
      const nameOf = (row: Doc): Promise<StaffQuestionView['product']> => {
        if (!row.productSlug) return Promise.resolve(null);
        const key = `${row.productSlug} ${row.language}`;
        let name = names.get(key);
        if (!name) {
          name = productNamed(row.productSlug, row.language);
          names.set(key, name);
        }
        return name;
      };
      const views = await Promise.all(rows.map(async (row) => toStaffView(row, await nameOf(row))));
      return { ok: true, value: views };
    },
  };
};
