import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UID } from '../../server/src/constants';
import confirmations from '../../server/src/services/confirmations';
import lineConfirmations from '../../server/src/services/line-confirmations';
import { fakeStrapi } from './fake-strapi';

type Doc = Record<string, any>;

const TOKEN = 'test-channel-token';
const LINE_API = 'http://127.0.0.1:4010';
const LIFF_URL = 'https://liff.line.me/1234567890-AbCdEfGh';
const LINE_USER_ID = `U${'a'.repeat(32)}`;
const CONFIG = { liffUrl: LIFF_URL, lineChannelAccessToken: TOKEN, lineApiBaseUrl: LINE_API };
const NOW = new Date('2026-10-01T00:00:00Z');

/** APT-4821's published version, as the Document Service returns it with the boutique and products populated. */
const PUBLISHED: Doc = {
  documentId: 'doc-4821',
  reference: 'APT-4821',
  customer: `line:${LINE_USER_ID}`,
  requestedFor: '2026-10-10T05:00:00.000Z', // 14:00 in Tokyo
  boutique: { name: '銀座本店', address: '東京都中央区銀座 1-2-3（デモ）' },
  products: [{ name: 'ウィークエンダー 50' }, { name: 'パスポートカバー' }],
};

/**
 * APT-4821 as the Document Service holds it: a draft (unless `exists` is false), its published version (or none), and
 * the notifications recorded so far. `record` stands in for confirmations.record and appends to them, so a second send
 * sees the first one.
 */
const world = ({ exists = true, published = PUBLISHED as Doc | null, sent = false, config = CONFIG as Record<string, unknown> } = {}) => {
  const notifications: Doc[] = sent ? [{ appointmentReference: 'APT-4821', outcome: 'sent' }] : [];
  const appointmentFindOne = vi.fn(async ({ documentId, status }: Doc) =>
    status === 'published' && documentId === 'doc-4821' ? published : null
  );
  const appointmentFindMany = vi.fn(async ({ status }: Doc) => (status === 'published' && published ? [published] : []));
  const documents = (uid: string) => {
    if (uid === UID.notification) {
      return {
        findFirst: vi.fn(async ({ filters }: Doc) =>
          notifications.find(
            (row) => row.outcome === filters.outcome?.$eq && row.appointmentReference === filters.appointmentReference?.$eq
          ) ?? null
        ),
        findMany: vi.fn(async () => notifications),
      };
    }
    return {
      findFirst: vi.fn(async ({ status, filters }: Doc) =>
        exists && status === 'draft' && filters.reference?.$eq === 'APT-4821' ? { documentId: 'doc-4821' } : null
      ),
      findOne: appointmentFindOne,
      findMany: appointmentFindMany,
    };
  };
  const record = vi.fn(async (input: Doc) => {
    notifications.push({ appointmentReference: input.reference, outcome: input.status });
    return { ok: true, value: { notification: { reference: input.reference, status: input.status }, alreadyRecorded: false } };
  });
  const strapi = fakeStrapi({ documents, config, services: { confirmations: { record } } });
  return { strapi, record, appointmentFindOne, appointmentFindMany, sender: lineConfirmations({ strapi }) };
};

/** LINE's push endpoint, answering `status` with `body`. */
const lineAnswers = (status = 200, body: unknown = { sentMessages: [{ id: '1', quoteToken: 'q' }] }) =>
  vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof lineAnswers>;
const useFetch = (mock: ReturnType<typeof lineAnswers>) => {
  fetchMock = mock;
  vi.stubGlobal('fetch', mock);
};
const pushed = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, init: init as RequestInit, body: JSON.parse(String((init as RequestInit).body)) };
};

beforeEach(() => useFetch(lineAnswers()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendConfirmation', () => {
  it("pushes the visit's flex message to LINE once and records it as sent, by strapi", async () => {
    const { sender, record } = world();
    const outcome = await sender.sendConfirmation('APT-4821');

    expect(outcome).toMatchObject({ reference: 'APT-4821', status: 'sent' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const { url, init, body } = pushed();
    expect(url).toBe(`${LINE_API}/v2/bot/message/push`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ type: 'flex', altText: 'ご来店予約が確定しました（APT-4821）', contents: { type: 'bubble' } });
    expect(JSON.stringify(body.messages[0].contents)).toContain(`${LIFF_URL}/visits/APT-4821`);
    expect(record).toHaveBeenCalledExactlyOnceWith({
      reference: 'APT-4821',
      status: 'sent',
      detail: '{"sentMessages":[{"id":"1","quoteToken":"q"}]}',
      recordedBy: 'strapi',
    });
  });

  it('sends to the LINE user ID: the customer without its line: prefix', async () => {
    await world().sender.sendConfirmation('APT-4821');
    expect(pushed().body.to).toBe(LINE_USER_ID);
  });

  it('sends nothing, and records nothing, once a confirmation has been sent', async () => {
    const { sender, record } = world({ sent: true });
    expect(await sender.sendConfirmation('APT-4821')).toMatchObject({ status: 'already_sent' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('sends once when it is asked twice', async () => {
    const { sender } = world();
    await sender.sendConfirmation('APT-4821');
    expect(await sender.sendConfirmation('APT-4821')).toMatchObject({ status: 'already_sent' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("records failed, with LINE's HTTP status and message, when LINE refuses the push", async () => {
    useFetch(lineAnswers(400, { message: "The property, 'to', in the request body is invalid (line 1, column 6)" }));
    const { sender, record } = world();
    const outcome = await sender.sendConfirmation('APT-4821');
    expect(outcome.status).toBe('failed');
    expect(outcome.message).toContain("LINE answered 400: The property, 'to', in the request body is invalid (line 1, column 6)");
    expect(record).toHaveBeenCalledExactlyOnceWith({
      reference: 'APT-4821',
      status: 'failed',
      detail: "LINE answered 400: The property, 'to', in the request body is invalid (line 1, column 6)",
      recordedBy: 'strapi',
    });
  });

  it("records failed when LINE can't be reached", async () => {
    useFetch(vi.fn(async () => Promise.reject(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:4010') }))));
    const { sender, record } = world();
    expect((await sender.sendConfirmation('APT-4821')).status).toBe('failed');
    expect(record).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 'failed', detail: "LINE couldn't be reached: connect ECONNREFUSED 127.0.0.1:4010", recordedBy: 'strapi' })
    );
  });

  it("gives LINE 8 seconds, and records failed when it doesn't answer in time", async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    useFetch(vi.fn(async () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))));
    const { sender, record } = world();
    expect((await sender.sendConfirmation('APT-4821')).status).toBe('failed');
    expect(timeout).toHaveBeenCalledWith(8000);
    expect(pushed().init.signal).toBe(timeout.mock.results[0].value);
    expect(record).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 'failed', detail: "LINE didn't answer within 8 seconds." })
    );
  });

  it('without a token, sends and records nothing, and says so once per process', async () => {
    const { sender, record, strapi } = world({ config: { ...CONFIG, lineChannelAccessToken: null } });
    expect(await sender.sendConfirmation('APT-4821')).toMatchObject({ status: 'not_configured' });
    expect(await sender.sendConfirmation('APT-4821')).toMatchObject({ status: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(strapi.log.warn).toHaveBeenCalledOnce();
    expect(strapi.log.warn.mock.calls[0][0]).toMatch(/LINE_CHANNEL_ACCESS_TOKEN isn't set: confirmations aren't sent from Strapi/);
  });

  it('without a liffUrl, sends and records nothing, as pending_confirmations refuses to list one', async () => {
    const { sender, record } = world({ config: { ...CONFIG, liffUrl: null } });
    expect(await sender.sendConfirmation('APT-4821')).toMatchObject({ status: 'not_configured', message: expect.stringMatching(/liffUrl/) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('sends nothing for a visit that has no published version: not_confirmed', async () => {
    const { sender, record } = world({ published: null });
    expect(await sender.sendConfirmation('APT-4821')).toMatchObject({ status: 'not_confirmed' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('answers not_found for a reference no appointment has', async () => {
    const { sender, record } = world({ exists: false });
    expect(await sender.sendConfirmation('APT-4821')).toMatchObject({ status: 'not_found' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('records failed, without a push, for a visit with no LINE customer', async () => {
    const { sender, record } = world({ published: { ...PUBLISHED, customer: 'someone@example.test' } });
    expect((await sender.sendConfirmation('APT-4821')).status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 'failed', recordedBy: 'strapi' }));
  });

  it('never records or logs the token, even when an error quotes it', async () => {
    // undici quotes a header value it refuses, Authorization included.
    useFetch(vi.fn(async () => Promise.reject(new TypeError(`Headers.append: "Bearer ${TOKEN}" is an invalid header value.`))));
    const { sender, record, strapi } = world();
    const outcome = await sender.sendConfirmation('APT-4821');
    const written = JSON.stringify([outcome, record.mock.calls, strapi.log.warn.mock.calls, strapi.log.info.mock.calls, strapi.log.error.mock.calls]);
    expect(outcome.status).toBe('failed');
    expect(written).not.toContain(TOKEN);
  });
});

describe('the confirmation message', () => {
  it("is the one pending_confirmations lists for the same appointment, for the same customer", async () => {
    const { strapi, sender, appointmentFindOne, appointmentFindMany } = world();
    const listed = await confirmations({ strapi }).listPending(10, NOW);
    expect(listed.ok).toBe(true);
    const [pending] = (listed as { value: Doc[] }).value;

    await sender.sendConfirmation('APT-4821');
    const { body } = pushed();
    expect(body.to).toBe(pending.lineUserId);
    expect(body.messages).toEqual([{ type: 'flex', ...pending.message }]);
    // Both read the same fields of the published visit.
    expect(appointmentFindOne.mock.calls[0][0].populate).toEqual(appointmentFindMany.mock.calls[0][0].populate);
  });
});
