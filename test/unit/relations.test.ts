import { describe, expect, it } from 'vitest';
import { relationDocumentId } from '../../server/src/domain/relations';

describe('relationDocumentId', () => {
  it.each([
    ['a bare documentId', 'abc123', 'abc123'],
    ['a long-hand object', { documentId: 'abc123', locale: 'ja' }, 'abc123'],
    ['connect with one entry', { connect: [{ documentId: 'abc123' }] }, 'abc123'],
    ['set with one shorthand', { set: ['abc123'] }, 'abc123'],
  ])('reads %s', (_label, value, expected) => {
    expect(relationDocumentId(value)).toBe(expected);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a numeric id', 42],
    ['connect with two entries', { connect: [{ documentId: 'a' }, { documentId: 'b' }] }],
  ])('returns null for %s', (_label, value) => {
    expect(relationDocumentId(value)).toBeNull();
  });
});
