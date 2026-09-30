import { describe, expect, it, vi } from 'vitest';
import { buildConfirmationMessage } from '../../server/src/domain/flex-message';
import { sendPendingConfirmationsPrompt } from '../../server/src/mcp/prompts/send-pending-confirmations';
import { pendingConfirmationsTool } from '../../server/src/mcp/tools/pending-confirmations';
import { recordConfirmationTool } from '../../server/src/mcp/tools/record-confirmation';
import { fakeStrapi } from './fake-strapi';

const context = { userAbility: {} as any, user: { id: 1 } };
const errorOf = (result: any) => JSON.parse(result.content[0].text).error;
const withConfirmations = (confirmations: Record<string, unknown>) => fakeStrapi({ services: { confirmations } });

const appLink = 'https://liff.line.me/1234567890-AbCdEfGh/visits/APT-4821';
const pending = {
  reference: 'APT-4821',
  lineUserId: `U${'a'.repeat(32)}`,
  boutique: { name: '銀座本店', address: '東京都中央区銀座 1-2-3（デモ）' },
  requestedFor: '2026-10-10T14:00:00+09:00',
  requestedForText: '10月10日(土) 14:00',
  products: [{ name: 'ウィークエンダー 50' }],
  previousAttempts: 0,
  appLink,
  message: buildConfirmationMessage({
    houseName: 'メゾン', reference: 'APT-4821', boutiqueName: '銀座本店', boutiqueAddress: '東京都中央区銀座 1-2-3（デモ）',
    requestedForText: '10月10日(土) 14:00', productNames: ['ウィークエンダー 50'], appLink,
  }),
};

describe('pending_confirmations', () => {
  it('defaults the limit to 10 and returns schema-valid output', async () => {
    const listPending = vi.fn(async () => ({ ok: true, value: [pending] }));
    const result = await pendingConfirmationsTool.createHandler(withConfirmations({ listPending }), context)({ args: {}, extra: {} });
    expect(listPending).toHaveBeenCalledWith(10);
    expect(pendingConfirmationsTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({ appointments: [pending] });
  });

  it('reports not_configured when the plugin has no liffUrl', async () => {
    const listPending = vi.fn(async () => ({ ok: false, code: 'not_configured', message: 'No liffUrl.', hint: 'Set liffUrl.' }));
    const result = await pendingConfirmationsTool.createHandler(withConfirmations({ listPending }), context)({ args: { limit: 3 }, extra: {} });
    expect(listPending).toHaveBeenCalledWith(3);
    expect(errorOf(result).code).toBe('not_configured');
  });
});

describe('record_confirmation', () => {
  const notification = { reference: 'APT-4821', status: 'sent', sentAt: '2026-10-07T09:10:00.000Z', detail: '{"sentMessages":[{"id":"1"}]}' };

  it('passes the outcome through and returns schema-valid output', async () => {
    const record = vi.fn(async () => ({ ok: true, value: { notification, alreadyRecorded: false } }));
    const args = { reference: 'APT-4821', status: 'sent', detail: notification.detail };
    const result = await recordConfirmationTool.createHandler(withConfirmations({ record }), context)({ args, extra: {} });
    expect(record).toHaveBeenCalledWith(args);
    expect(recordConfirmationTool.resolveOutputSchema(context).parse(result.structuredContent)).toEqual({ notification, alreadyRecorded: false });
  });

  it('turns not_published into a tool error', async () => {
    const record = vi.fn(async () => ({ ok: false, code: 'not_published', message: 'Not confirmed.', hint: 'Do not message the customer.' }));
    const result = await recordConfirmationTool.createHandler(withConfirmations({ record }), context)({
      args: { reference: 'APT-4821', status: 'sent', detail: 'x' }, extra: {},
    });
    expect(errorOf(result)).toEqual({ code: 'not_published', message: 'Not confirmed.', hint: 'Do not message the customer.' });
  });

  it('validates the reference and status', () => {
    const input = recordConfirmationTool.resolveInputSchema!(context);
    expect(input.safeParse({ reference: 'APT-4821', status: 'failed', detail: 'not reachable' }).success).toBe(true);
    expect(input.safeParse({ reference: '4821', status: 'sent', detail: 'x' }).success).toBe(false);
    expect(input.safeParse({ reference: 'APT-4821', status: 'delivered', detail: 'x' }).success).toBe(false);
    expect(input.safeParse({ reference: 'APT-4821', status: 'sent', detail: '' }).success).toBe(false);
  });
});

describe('send_pending_confirmations prompt', () => {
  it('is gated on confirmations.send and walks the agent through check, push and record in order', async () => {
    expect(sendPendingConfirmationsPrompt.auth.policies).toEqual([{ action: 'plugin::maison.confirmations.send' }]);
    const result = await (sendPendingConfirmationsPrompt.createHandler(fakeStrapi()) as any)({});
    const text: string = result.messages[0].content.text;
    const order = ['pending_confirmations', 'get_profile', 'push_flex_message', 'record_confirmation'].map((name) => text.indexOf(name));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toMatch(/200/);
    expect(text).toMatch(/not reachable: not a friend or blocked/);
  });
});
