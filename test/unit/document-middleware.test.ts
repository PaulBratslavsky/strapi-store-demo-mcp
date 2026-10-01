import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UID } from '../../server/src/constants';
import { registerDocumentMiddleware } from '../../server/src/document-middleware';
import { lineAnswers, world } from './fake-line';

/** What publish() resolves with: the document and its new published entries, one here, as appointments aren't localized. */
const PUBLISH_RESULT = { documentId: 'doc-4821', entries: [{ id: 2, documentId: 'doc-4821', reference: 'APT-4821' }] };

/** The world, with the plugin's document middlewares registered, as Strapi's register() does. */
const registered = (...args: Parameters<typeof world>) => {
  const w = world(...args);
  registerDocumentMiddleware(w.strapi);
  return w;
};

/** publish({ documentId }) on APT-4821 through the middlewares. `work` is the publish itself. */
const publish = (w: ReturnType<typeof world>, work: () => Promise<unknown> = async () => PUBLISH_RESULT) =>
  w.call({ uid: UID.appointment, action: 'publish', params: { documentId: 'doc-4821' } }, work);

let fetchMock: ReturnType<typeof lineAnswers>;
beforeEach(() => {
  fetchMock = lineAnswers();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('publishing an appointment', () => {
  it('sends its LINE confirmation once, recorded as sent by strapi, and answers what the publish did', async () => {
    const w = registered();
    expect(await publish(w)).toBe(PUBLISH_RESULT);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).messages[0].type).toBe('flex');
    expect(w.record).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ reference: 'APT-4821', status: 'sent', recordedBy: 'strapi' })
    );
  });

  it('sends nothing when it is published again', async () => {
    const w = registered();
    await publish(w);
    expect(await publish(w)).toBe(PUBLISH_RESULT);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(w.record).toHaveBeenCalledOnce();
  });

  it('sends once the publish has gone through, and the publish waits for the send', async () => {
    const w = registered();
    const events: string[] = [];
    let finishSending!: () => void;
    w.services['line-confirmations'] = {
      sendConfirmation: vi.fn(async (reference: string) => {
        events.push(`sending ${reference}`);
        await new Promise<void>((resolve) => (finishSending = resolve));
        events.push('sent');
      }),
    };
    const publishing = publish(w, async () => {
      events.push('published');
      return PUBLISH_RESULT;
    }).then((result) => {
      events.push('publish answered');
      return result;
    });
    await vi.waitFor(() => expect(events).toEqual(['published', 'sending APT-4821']));
    finishSending();
    expect(await publishing).toBe(PUBLISH_RESULT);
    expect(events).toEqual(['published', 'sending APT-4821', 'sent', 'publish answered']);
  });

  it('never fails because sending failed: the publish goes through, and the error is logged', async () => {
    const w = registered();
    w.services['line-confirmations'] = { sendConfirmation: vi.fn(async () => Promise.reject(new Error('database is down'))) };
    expect(await publish(w)).toBe(PUBLISH_RESULT);
    expect(w.strapi.log.error).toHaveBeenCalledOnce();
    expect(w.strapi.log.error.mock.calls[0][0]).toMatch(/APT-4821.*database is down/);
  });

  it('sends nothing when the publish fails, and lets its error through', async () => {
    const w = registered();
    const sendConfirmation = vi.fn();
    w.services['line-confirmations'] = { sendConfirmation };
    await expect(publish(w, async () => Promise.reject(new Error('Document not found')))).rejects.toThrow('Document not found');
    expect(sendConfirmation).not.toHaveBeenCalled();
  });

  it('sends nothing when nothing was published', async () => {
    const w = registered();
    const sendConfirmation = vi.fn();
    w.services['line-confirmations'] = { sendConfirmation };
    await publish(w, async () => ({ documentId: 'doc-4821', entries: [] }));
    expect(sendConfirmation).not.toHaveBeenCalled();
  });
});

describe('other Document Service calls', () => {
  it.each([
    ['publishing a product', UID.product, 'publish'],
    ['publishing a boutique', UID.boutique, 'publish'],
    ['updating an appointment', UID.appointment, 'update'],
    ['unpublishing an appointment', UID.appointment, 'unpublish'],
    ['creating a notification', UID.notification, 'create'],
  ])('send nothing: %s', async (_label, uid, action) => {
    const w = registered();
    const sendConfirmation = vi.fn();
    w.services['line-confirmations'] = { sendConfirmation };
    expect(await w.call({ uid, action, params: { documentId: 'doc-4821', data: {} } }, async () => PUBLISH_RESULT)).toBe(PUBLISH_RESULT);
    expect(sendConfirmation).not.toHaveBeenCalled();
  });
});
