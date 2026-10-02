import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import {
  UID,
  type AnalysisStatus,
  type CloseReason,
  type InquiryKind,
  type InquiryQueue,
  type InquiryStatus,
  type Locale,
  type QuestionStatus,
  type SentimentLabel,
} from '../constants';
import { queueFor } from '../domain/inquiry-queue';
import { failure, type ServiceResult } from '../domain/service-result';
import { maskSubject } from '../domain/subject';
import { fitUnits } from '../domain/text';

type Doc = Record<string, any>;

/** One concierge turn, as the app's server logs it. */
export interface InquiryLogInput {
  subject: string;
  message: string;
  reply?: string;
  knowledgeFound: boolean;
  handedOff: boolean;
  /** The question the turn's hand-off recorded. It is stored only when it is this customer's. */
  questionReference?: string;
  productSlug?: string;
  /** The chat's language. Defaults to defaultLocale. */
  locale?: Locale;
}

/** An inquiry as staff see it: the customer masked, with the model's labels, and what staff did about it. */
export interface StaffInquiryView {
  documentId: string;
  createdAt: string;
  customer: string;
  message: string;
  reply: string | null;
  language: Locale;
  product: { slug: string; name: string } | null;
  knowledgeFound: boolean;
  handedOff: boolean;
  /** The question a hand-off recorded. Its status is null when that question no longer exists. */
  question: { reference: string; status: QuestionStatus | null } | null;
  kind: InquiryKind | null;
  sentimentScore: number | null;
  sentimentLabel: SentimentLabel | null;
  answered: boolean | null;
  reason: string | null;
  topic: string | null;
  analysisStatus: AnalysisStatus;
  analysisAttempts: number;
  humanCorrected: boolean;
  queue: InquiryQueue;
  status: InquiryStatus;
  closeReason: CloseReason | null;
  replyText: string | null;
  repliedAt: string | null;
  repliedBy: string | null;
  line: { outcome: 'sent' | 'failed'; detail: string | null } | null;
}

export interface InquiryFilters {
  /** needs-answer, the default: the Inquiries tab opens on it. */
  filter?: 'needs-answer' | 'complaint' | 'praise' | 'not-labelled' | 'all';
  limit?: number;
}

/** The open inquiries in each queue, and the open ones nobody has labelled. */
export interface InquirySummary {
  needsAnswer: number;
  complaint: number;
  praise: number;
  notLabelled: number;
}

/** What the inquiry's `message` and `reply` hold, in UTF-16 units: their `maxLength`. */
const MESSAGE_LENGTH = 1000;
const REPLY_LENGTH = 2000;
const LIST_LIMIT = 50;

/**
 * What each filter shows. Every one but All is open inquiries only: a replied or a closed one has left the queues.
 * Not labelled is an inquiry no model or person has labelled yet, or one the model failed on.
 */
const OPEN = { status: { $eq: 'open' } };
const FILTERS: Record<NonNullable<InquiryFilters['filter']>, Doc> = {
  'needs-answer': { ...OPEN, queue: { $eq: 'needs-answer' } },
  complaint: { ...OPEN, queue: { $eq: 'complaint' } },
  praise: { ...OPEN, queue: { $eq: 'praise' } },
  'not-labelled': { ...OPEN, analysisStatus: { $in: ['pending', 'failed'] } },
  all: {},
};

/** A date as an ISO string, or null when there is none. */
const isoOrNull = (value: unknown): string | null => (value ? new Date(value as string | number | Date).toISOString() : null);

const notFound = (documentId: string) => failure('not_found', `No inquiry "${documentId}".`, 'Reload the Inquiries tab: it may have been deleted.');

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

  /** The reference when a question with it belongs to this customer, else null: a turn never links to anyone else's question. */
  const theirQuestion = async (subject: string, reference: string): Promise<string | null> =>
    (await strapi.documents(UID.question).count({ filters: { reference: { $eq: reference }, customer: { $eq: subject } } })) > 0 ? reference : null;

  /** What became of each hand-off's question, by reference, from one query. A question deleted since has no entry. */
  const questionStatuses = async (rows: Doc[]): Promise<Map<string, QuestionStatus>> => {
    const references = [...new Set(rows.flatMap((row) => (row.questionReference ? [row.questionReference as string] : [])))];
    if (references.length === 0) return new Map();
    const questions = (await strapi.documents(UID.question).findMany({
      filters: { reference: { $in: references } },
      fields: ['reference', 'status'],
    })) as Doc[];
    return new Map(questions.map((question) => [question.reference, question.status]));
  };

  const toStaffView = (row: Doc, product: StaffInquiryView['product'], question: StaffInquiryView['question']): StaffInquiryView => ({
    documentId: row.documentId,
    createdAt: new Date(row.createdAt).toISOString(),
    customer: maskSubject(row.customer),
    message: row.message,
    reply: row.reply ?? null,
    language: row.language,
    product,
    knowledgeFound: Boolean(row.knowledgeFound),
    handedOff: Boolean(row.handedOff),
    question,
    kind: row.kind ?? null,
    sentimentScore: row.sentimentScore ?? null,
    sentimentLabel: row.sentimentLabel ?? null,
    answered: row.answered ?? null,
    reason: row.reason ?? null,
    topic: row.topic ?? null,
    analysisStatus: row.analysisStatus,
    analysisAttempts: row.analysisAttempts ?? 0,
    humanCorrected: Boolean(row.humanCorrected),
    queue: row.queue,
    status: row.status,
    closeReason: row.closeReason ?? null,
    replyText: row.replyText ?? null,
    repliedAt: isoOrNull(row.repliedAt),
    repliedBy: row.repliedBy ?? null,
    line: row.lineOutcome ? { outcome: row.lineOutcome, detail: row.lineDetail || null } : null,
  });

  /** Rows as staff see them. Each piece is looked up once per language, and the questions of all the hand-offs in one query. */
  const viewsOf = async (rows: Doc[]): Promise<StaffInquiryView[]> => {
    const statuses = await questionStatuses(rows);
    const names = new Map<string, Promise<StaffInquiryView['product']>>();
    const nameOf = (row: Doc): Promise<StaffInquiryView['product']> => {
      if (!row.productSlug) return Promise.resolve(null);
      const key = `${row.productSlug} ${row.language}`;
      let name = names.get(key);
      if (!name) {
        name = productNamed(row.productSlug, row.language);
        names.set(key, name);
      }
      return name;
    };
    const questionOf = (row: Doc): StaffInquiryView['question'] =>
      row.questionReference ? { reference: row.questionReference, status: statuses.get(row.questionReference) ?? null } : null;
    return Promise.all(rows.map(async (row) => toStaffView(row, await nameOf(row), questionOf(row))));
  };

  const findRow = async (documentId: string): Promise<Doc | null> => (await strapi.documents(UID.inquiry).findOne({ documentId })) as Doc | null;

  /** Writes `data` to the inquiry. Strapi's types know only `id` and `documentId` for this content type, and `update` checks its data against them. */
  const updateInquiry = (documentId: string, data: Doc) => strapi.documents(UID.inquiry).update({ documentId, data });

  /** Writes `data` to the row, and answers the row as staff see it now: what was read, with what was written. */
  const changed = async (row: Doc, data: Doc): Promise<ServiceResult<StaffInquiryView>> => {
    await updateInquiry(row.documentId, data);
    const [view] = await viewsOf([{ ...row, ...data }]);
    return { ok: true, value: view };
  };

  return {
    /**
     * Records one concierge turn for staff, with nothing labelled: the model labels it later, and a person can before it.
     * A hand-off is in Needs an answer at once. The piece and the question are stored only when they are real: a
     * published piece, and a question that is this customer's. Anything else is dropped and the turn is still logged.
     */
    async log(input: InquiryLogInput): Promise<ServiceResult<{ logged: true }>> {
      const { defaultLocale } = getConfig(strapi);
      const language = input.locale ?? defaultLocale;
      const [product, questionReference] = await Promise.all([
        input.productSlug ? productNamed(input.productSlug, language) : null,
        input.questionReference ? theirQuestion(input.subject, input.questionReference) : null,
      ]);
      await strapi.documents(UID.inquiry).create({
        data: {
          customer: input.subject,
          message: fitUnits(input.message, MESSAGE_LENGTH),
          reply: fitUnits(input.reply ?? '', REPLY_LENGTH) || null,
          language,
          knowledgeFound: input.knowledgeFound,
          handedOff: input.handedOff,
          questionReference,
          productSlug: product?.slug ?? null,
          analysisStatus: 'pending',
          queue: queueFor({ handedOff: input.handedOff, kind: null, answered: null }),
          status: 'open',
        },
      });
      return { ok: true, value: { logged: true } };
    },

    /** The Inquiries tab's rows, newest first. */
    async list(filters: InquiryFilters = {}): Promise<ServiceResult<StaffInquiryView[]>> {
      const rows = (await strapi.documents(UID.inquiry).findMany({
        filters: FILTERS[filters.filter ?? 'needs-answer'],
        sort: 'createdAt:desc',
        limit: filters.limit ?? LIST_LIMIT,
      })) as Doc[];
      return { ok: true, value: await viewsOf(rows) };
    },

    /** The cards above the rows: the open inquiries each filter shows. */
    async summary(): Promise<InquirySummary> {
      const countOf = (filter: NonNullable<InquiryFilters['filter']>) => strapi.documents(UID.inquiry).count({ filters: FILTERS[filter] });
      const [needsAnswer, complaint, praise, notLabelled] = await Promise.all([
        countOf('needs-answer'),
        countOf('complaint'),
        countOf('praise'),
        countOf('not-labelled'),
      ]);
      return { needsAnswer, complaint, praise, notLabelled };
    },

    /** Close: the inquiry needs nothing more, for the reason given. A closed one is `already_closed`. */
    async close(documentId: string, reason: CloseReason): Promise<ServiceResult<StaffInquiryView>> {
      const row = await findRow(documentId);
      if (!row) return notFound(documentId);
      if (row.status === 'closed') {
        return failure('already_closed', 'This inquiry is closed already.', 'Reload the Inquiries tab to see where it stands.');
      }
      return changed(row, { status: 'closed', closeReason: reason });
    },

    /**
     * Change label: a person sets the kind, the sentiment, or both. The row is marked as corrected, so labelling never
     * overwrites it, and its queue follows the new kind by the same rule the model's labels go through. A row nobody
     * had labelled yet (pending, or failed) leaves Not labelled by becoming `skipped`, so the sweep never picks it.
     */
    async changeLabel(
      documentId: string,
      labels: { kind?: InquiryKind; sentimentLabel?: SentimentLabel }
    ): Promise<ServiceResult<StaffInquiryView>> {
      if (labels.kind === undefined && labels.sentimentLabel === undefined) {
        return failure('invalid_input', 'Give a kind, a sentiment, or both.', 'Pick a kind or a sentiment to change.');
      }
      const row = await findRow(documentId);
      if (!row) return notFound(documentId);
      const unlabelled = row.analysisStatus === 'pending' || row.analysisStatus === 'failed';
      return changed(row, {
        ...(labels.kind !== undefined ? { kind: labels.kind } : {}),
        ...(labels.sentimentLabel !== undefined ? { sentimentLabel: labels.sentimentLabel } : {}),
        humanCorrected: true,
        queue: queueFor({ handedOff: Boolean(row.handedOff), kind: labels.kind ?? row.kind ?? null, answered: row.answered ?? null }),
        ...(unlabelled ? { analysisStatus: 'skipped' } : {}),
      });
    },

    /** Label again: puts an inquiry the model failed on back to pending with no attempts, for the next sweep. Any other is `not_failed`. */
    async labelAgain(documentId: string): Promise<ServiceResult<StaffInquiryView>> {
      const row = await findRow(documentId);
      if (!row) return notFound(documentId);
      if (row.analysisStatus !== 'failed') {
        return failure('not_failed', 'Only an inquiry the model failed to label can be labelled again.', 'Use Change label to set its labels yourself.');
      }
      return changed(row, { analysisStatus: 'pending', analysisAttempts: 0 });
    },

    /**
     * The question was answered on LINE: every open inquiry that came from its hand-off is replied, with the answer.
     * Called by `questions.answer`, which never lets a failure here change its outcome.
     */
    async markQuestionReplied(reference: string, reply: { replyText: string; repliedBy: string; at: Date }): Promise<void> {
      const rows = (await strapi.documents(UID.inquiry).findMany({
        filters: { questionReference: { $eq: reference }, status: { $eq: 'open' } },
      })) as Doc[];
      await Promise.all(
        rows.map((row) =>
          updateInquiry(row.documentId, {
            status: 'replied',
            replyText: reply.replyText,
            repliedAt: reply.at,
            repliedBy: reply.repliedBy,
            lineOutcome: 'sent',
          })
        )
      );
    },
  };
};
