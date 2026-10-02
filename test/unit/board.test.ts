import { describe, expect, it } from 'vitest';
import { canSendAgain, canStillConfirm } from '../../admin/src/board';

const NOW = Date.parse('2026-10-05T00:00:00Z');
const AHEAD = '2026-10-10T14:00:00+09:00';
const OVER = '2026-10-01T14:00:00+09:00';
const row = (overrides: Partial<Parameters<typeof canSendAgain>[0]> = {}) => ({
  status: 'confirmed' as const,
  requestedFor: AHEAD,
  confirmationSent: false,
  ...overrides,
});

describe('Send again on the board', () => {
  it('shows on a confirmed visit still ahead whose LINE column says "not sent"', () => {
    expect(canSendAgain(row(), NOW)).toBe(true);
  });

  it.each([
    ['a request staff have not confirmed', { status: 'requested' as const }],
    ['a visit whose confirmation went out', { confirmationSent: true }],
    ['a visit that is over, as Strapi sends no confirmation for it', { requestedFor: OVER }],
  ])('hides on %s', (_label, overrides) => {
    expect(canSendAgain(row(overrides), NOW)).toBe(false);
  });
});

describe('Confirm on the board', () => {
  it('shows on a request whose visit is still ahead, and on nothing else', () => {
    expect(canStillConfirm(row({ status: 'requested' }), NOW)).toBe(true);
    expect(canStillConfirm(row({ status: 'requested', requestedFor: OVER }), NOW)).toBe(false);
    expect(canStillConfirm(row(), NOW)).toBe(false);
  });
});
