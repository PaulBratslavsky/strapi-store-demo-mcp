/** A row of the requests board, as far as these rules read it. */
export interface BoardRow {
  status: 'requested' | 'confirmed';
  /** The visit, in Tokyo time with its offset, e.g. "2026-10-10T14:00:00+09:00". */
  requestedFor: string;
  confirmationSent: boolean;
}

/** Confirm: a request staff haven't confirmed, until its visit starts. */
export const canStillConfirm = (row: BoardRow, now = Date.now()) => row.status === 'requested' && Date.parse(row.requestedFor) > now;

/**
 * Send again: a confirmed visit whose LINE column says "not sent", until the visit is over. Strapi sends no
 * confirmation for a visit that's over, as pending_confirmations lists none.
 */
export const canSendAgain = (row: BoardRow, now = Date.now()) =>
  row.status === 'confirmed' && !row.confirmationSent && Date.parse(row.requestedFor) >= now;
