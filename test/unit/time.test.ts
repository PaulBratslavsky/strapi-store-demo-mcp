import { describe, expect, it } from 'vitest';
import { formatJaDateTime, toZonedIso } from '../../server/src/domain/time';

describe('formatJaDateTime', () => {
  it('formats a Tokyo date and time in Japanese', () => {
    expect(formatJaDateTime(new Date('2026-10-10T05:00:00Z'), 'Asia/Tokyo')).toBe('10月10日(土) 14:00');
  });

  it('pads minutes and uses 24-hour time', () => {
    expect(formatJaDateTime(new Date('2026-10-14T09:05:00Z'), 'Asia/Tokyo')).toBe('10月14日(水) 18:05');
  });
});

describe('toZonedIso', () => {
  it('writes Tokyo wall-clock time with its offset', () => {
    expect(toZonedIso(new Date('2026-10-10T05:00:00Z'), 'Asia/Tokyo')).toBe('2026-10-10T14:00:00+09:00');
  });

  it('crosses midnight into the next Tokyo day', () => {
    expect(toZonedIso(new Date('2026-10-05T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-10-06T08:30:00+09:00');
  });

  it('handles negative offsets and daylight saving time', () => {
    expect(toZonedIso(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toBe('2026-07-01T08:00:00-04:00');
  });

  it('drops milliseconds and writes +00:00 for UTC', () => {
    expect(toZonedIso(new Date('2026-10-10T05:00:00.789Z'), 'UTC')).toBe('2026-10-10T05:00:00+00:00');
  });
});
