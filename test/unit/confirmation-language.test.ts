import { describe, expect, it } from 'vitest';
import { buildConfirmationMessage } from '../../server/src/domain/flex-message';
import { confirmationFor } from '../../server/src/services/confirmations';
import { LIFF_URL, LINE_USER_ID, PUBLISHED } from './fake-line';

type Doc = Record<string, any>;

const OPTIONS = { liffUrl: LIFF_URL, timezone: 'Asia/Tokyo', houseName: { ja: 'メゾン', en: 'Maison' } };
const APP_LINK = `${LIFF_URL}/visits/APT-4821`;

/** APT-4821 booked in English, with its boutique and products already named in English. */
const ENGLISH_VISIT: Doc = {
  ...PUBLISHED,
  language: 'en',
  boutique: { name: 'Ginza Flagship', address: '1-2-3 Ginza, Chuo-ku, Tokyo (demo)' },
  products: [{ name: 'Weekender 50' }, { name: 'Passport Cover' }],
};

/** APT-4821's confirmation as confirmationFor gave it before visits had a language, key for key and in that order. */
const JAPANESE_CONFIRMATION = {
  lineUserId: LINE_USER_ID,
  boutique: { name: '銀座本店', address: '東京都中央区銀座 1-2-3（デモ）' },
  requestedFor: '2030-01-12T14:00:00+09:00',
  requestedForText: '1月12日(土) 14:00',
  products: [{ name: 'ウィークエンダー 50' }, { name: 'パスポートカバー' }],
  appLink: APP_LINK,
  message: buildConfirmationMessage({
    houseName: 'メゾン',
    reference: 'APT-4821',
    boutiqueName: '銀座本店',
    boutiqueAddress: '東京都中央区銀座 1-2-3（デモ）',
    requestedForText: '1月12日(土) 14:00',
    productNames: ['ウィークエンダー 50', 'パスポートカバー'],
    appLink: APP_LINK,
  }),
};

describe('confirmationFor', () => {
  it('writes the confirmation of a visit booked in English in English: its words, the house name and the date', () => {
    const confirmation = confirmationFor(ENGLISH_VISIT, OPTIONS);
    expect(confirmation).toEqual({
      lineUserId: LINE_USER_ID,
      boutique: { name: 'Ginza Flagship', address: '1-2-3 Ginza, Chuo-ku, Tokyo (demo)' },
      requestedFor: '2030-01-12T14:00:00+09:00',
      requestedForText: 'Sat 12 Jan, 14:00',
      products: [{ name: 'Weekender 50' }, { name: 'Passport Cover' }],
      appLink: APP_LINK,
      message: buildConfirmationMessage({
        language: 'en',
        houseName: 'Maison',
        reference: 'APT-4821',
        boutiqueName: 'Ginza Flagship',
        boutiqueAddress: '1-2-3 Ginza, Chuo-ku, Tokyo (demo)',
        requestedForText: 'Sat 12 Jan, 14:00',
        productNames: ['Weekender 50', 'Passport Cover'],
        appLink: APP_LINK,
      }),
    });
    expect(confirmation?.message.altText).toBe('Your visit is confirmed (APT-4821)');
  });

  it('writes the confirmation of a visit booked in Japanese exactly as it always has', () => {
    expect(JSON.stringify(confirmationFor({ ...PUBLISHED, language: 'ja' }, OPTIONS))).toBe(JSON.stringify(JAPANESE_CONFIRMATION));
  });

  it.each([
    ['no language, as visits booked before it was kept have', {}],
    ['a null language', { language: null }],
    ['a language it has no words for', { language: 'fr' }],
  ])('writes a visit with %s in Japanese', (_label, language) => {
    expect(JSON.stringify(confirmationFor({ ...PUBLISHED, ...language }, OPTIONS))).toBe(JSON.stringify(JAPANESE_CONFIRMATION));
  });
});
