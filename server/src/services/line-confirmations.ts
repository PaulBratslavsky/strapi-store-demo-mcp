import type { Core } from '@strapi/strapi';

import { getConfig } from '../config';
import { PLUGIN_ID, UID } from '../constants';
import type { FlexMessage } from '../domain/flex-message';
import { toZonedIso } from '../domain/time';
import { CONFIRMATION_POPULATE, confirmationFor, type Outcome } from './confirmations';

type Doc = Record<string, any>;

/**
 * What became of a confirmation:
 * - `sent`: LINE took the message, and a `sent` notification records it.
 * - `failed`: LINE refused it or couldn't be reached, and a `failed` notification says why.
 * - `already_sent`: a `sent` notification already exists, so nothing was sent.
 * - `not_confirmed`: the visit has no published version, so nothing was sent.
 * - `past`: the visit is over, so nothing was sent, as pending_confirmations lists none.
 * - `not_found`: no appointment has this reference.
 * - `not_configured`: there's no channel access token, or no liffUrl for the message's link. Nothing was sent or recorded.
 */
export type SendStatus = 'sent' | 'failed' | 'already_sent' | 'not_confirmed' | 'past' | 'not_found' | 'not_configured';

export interface SendOutcome {
  reference: string;
  status: SendStatus;
  /** What happened, in words staff can read. Never the token. */
  message: string;
}

/** LINE gets this long to answer a push, so a publish waits for its confirmation this long at most. */
export const PUSH_TIMEOUT_MS = 8000;

const NO_TOKEN = "LINE_CHANNEL_ACCESS_TOKEN isn't set: confirmations aren't sent from Strapi.";
const NO_LIFF_URL = "The maison plugin has no liffUrl, so the confirmation link would be broken: confirmations aren't sent from Strapi.";

/** The `message` of LINE's error body, `{ "message": "…", "details": […] }`, or '' when there's none. */
const lineMessageOf = (body: string): string => {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.message === 'string' ? parsed.message : '';
  } catch {
    return '';
  }
};

/** Why a push got no answer. */
const unreachable = (error: unknown): string => {
  if ((error as Error | undefined)?.name === 'TimeoutError') return `LINE didn't answer within ${PUSH_TIMEOUT_MS / 1000} seconds.`;
  // fetch says only "fetch failed"; its cause says what failed, such as "connect ECONNREFUSED 127.0.0.1:4010".
  const cause = (error as { cause?: { message?: unknown } } | undefined)?.cause?.message;
  return `LINE couldn't be reached: ${typeof cause === 'string' ? cause : String((error as Error | undefined)?.message ?? error)}`;
};

/** One push to the customer through LINE's Messaging API. It never throws: what went wrong becomes the detail. */
const push = async (
  { apiBaseUrl, token }: { apiBaseUrl: string; token: string },
  to: string,
  message: FlexMessage
): Promise<{ status: Outcome; detail: string }> => {
  try {
    const response = await fetch(`${apiBaseUrl}/v2/bot/message/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages: [{ type: 'flex', altText: message.altText, contents: message.contents }] }),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    const body = await response.text().catch(() => '');
    if (response.ok) return { status: 'sent', detail: body || `LINE answered ${response.status}.` };
    const lineMessage = lineMessageOf(body);
    return { status: 'failed', detail: lineMessage ? `LINE answered ${response.status}: ${lineMessage}` : `LINE answered ${response.status}.` };
  } catch (error) {
    return { status: 'failed', detail: unreachable(error) };
  }
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  /** Each missing setting is logged once per process: every publish would repeat it. */
  const warned = new Set<string>();
  const notConfigured = (reference: string, message: string): SendOutcome => {
    if (!warned.has(message)) {
      warned.add(message);
      strapi.log.warn(`[maison] ${message}`);
    }
    return { reference, status: 'not_configured', message };
  };

  /** Records a delivery outcome as Strapi's, with the token taken out of whatever the detail quotes, and logs it. */
  const finish = async (reference: string, status: Outcome, detail: string, token: string): Promise<SendOutcome> => {
    const safeDetail = detail.split(token).join('[token]');
    const recorded = await strapi
      .plugin(PLUGIN_ID)
      .service('confirmations')
      .record({ reference, status, detail: safeDetail, recordedBy: 'strapi' });
    if (!recorded.ok) strapi.log.warn(`[maison] The LINE confirmation for ${reference} was ${status}, but recording that failed: ${recorded.message}`);
    if (status === 'sent') {
      strapi.log.info(`[maison] Sent the LINE confirmation for ${reference}.`);
      return { reference, status, message: `Sent the LINE confirmation for ${reference}.` };
    }
    const message = `The LINE confirmation for ${reference} wasn't sent. ${safeDetail}`;
    strapi.log.warn(`[maison] ${message}`);
    return { reference, status, message };
  };

  /** One confirmation, sent and recorded. sendConfirmation makes sure only one runs per reference. */
  const send = async (reference: string, now: Date): Promise<SendOutcome> => {
    const sent = await strapi.documents(UID.notification).findFirst({
      filters: { outcome: { $eq: 'sent' }, appointmentReference: { $eq: reference } },
      fields: ['appointmentReference'],
    });
    if (sent) return { reference, status: 'already_sent', message: `The LINE confirmation for ${reference} was already sent.` };

    const draft = (await strapi.documents(UID.appointment).findFirst({
      status: 'draft',
      filters: { reference: { $eq: reference } },
      fields: ['documentId'],
    })) as Doc | null;
    if (!draft) return { reference, status: 'not_found', message: `No appointment ${reference}.` };
    const published = (await strapi.documents(UID.appointment).findOne({
      documentId: draft.documentId,
      status: 'published',
      populate: CONFIRMATION_POPULATE,
    })) as Doc | null;
    if (!published) {
      return { reference, status: 'not_confirmed', message: `Appointment ${reference} hasn't been confirmed, so it gets no confirmation.` };
    }

    const { lineChannelAccessToken: token, lineApiBaseUrl, liffUrl, timezone, houseName } = getConfig(strapi);
    // pending_confirmations lists a visit until it starts, so a confirmation goes out until then too.
    const when = new Date(published.requestedFor);
    if (when.getTime() < now.getTime()) {
      return {
        reference,
        status: 'past',
        message: `The visit for ${reference} was at ${toZonedIso(when, timezone)}, which has passed, so it gets no confirmation.`,
      };
    }
    if (!token) return notConfigured(reference, NO_TOKEN);
    if (!liffUrl) return notConfigured(reference, NO_LIFF_URL);

    const confirmation = confirmationFor(published, { liffUrl, timezone, houseName });
    if (!confirmation) return finish(reference, 'failed', "The appointment has no valid LINE customer, so it can't be confirmed over LINE.", token);
    const { status, detail } = await push({ apiBaseUrl: lineApiBaseUrl, token }, confirmation.lineUserId, confirmation.message);
    return finish(reference, status, detail, token);
  };

  /** The send under way for each reference. A second call for one joins it instead of pushing again. */
  const inFlight = new Map<string, Promise<SendOutcome>>();

  return {
    /**
     * Sends the LINE confirmation of a confirmed visit, the one pending_confirmations lists for it, and records the
     * outcome. A visit with a `sent` notification gets nothing more: that is the only send-once rule. Calls for a
     * visit that is being sent share that send, so this process never pushes one visit twice at once. Publishing an
     * appointment calls this, whichever way it was published, and so does the board's Send again.
     * `now` is only for tests. It defaults to the current time.
     */
    sendConfirmation(reference: string, now: Date = new Date()): Promise<SendOutcome> {
      const running = inFlight.get(reference);
      if (running) return running;
      const sending = send(reference, now).finally(() => inFlight.delete(reference));
      inFlight.set(reference, sending);
      return sending;
    },
  };
};
