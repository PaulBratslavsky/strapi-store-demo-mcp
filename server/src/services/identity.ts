import type { Core } from '@strapi/strapi';

import { OAUTH_PLUGIN_ID } from '../constants';
import { authorizationOf, parseSubject } from '../domain/subject';

export interface HandlerExtra {
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
}

/** Who is calling: a LINE customer, nobody, or unknown because customer sign-in isn't installed. */
export type CustomerSession = { status: 'signed_in'; subject: string } | { status: 'signed_out' } | { status: 'unavailable' };

type SubjectResolver = { resolveSubject?: (authorization: string) => Promise<unknown> };

export default ({ strapi }: { strapi: Core.Strapi }) => {
  /** oauth-mcp-manager's resolveSubject, or null when version 1.1 or later isn't installed. */
  const subjectResolver = () => {
    let oauth: SubjectResolver | undefined;
    try {
      oauth = strapi.plugin(OAUTH_PLUGIN_ID)?.service('oauth') as SubjectResolver | undefined;
    } catch {
      oauth = undefined;
    }
    return typeof oauth?.resolveSubject === 'function' ? oauth.resolveSubject.bind(oauth) : null;
  };

  /**
   * The LINE customer behind a raw Authorization header: one code path for the MCP tools and the REST routes.
   * oauth-mcp-manager maps its session token to the grant's subject, and anything but a LINE subject is signed out:
   * staff sessions, admin and API tokens, users-permissions JWTs, unknown or expired tokens. Never logs the header,
   * the subject, or the resolver's error message, which could quote either.
   */
  const customerSession = async (authorization: string | null): Promise<CustomerSession> => {
    const resolveSubject = subjectResolver();
    if (!resolveSubject) return { status: 'unavailable' };
    if (!authorization) return { status: 'signed_out' };
    try {
      const subject = parseSubject(await resolveSubject(authorization));
      return subject ? { status: 'signed_in', subject } : { status: 'signed_out' };
    } catch (error) {
      strapi.log.warn(`[maison] resolveSubject failed (${(error as Error)?.name ?? 'unknown error'}), so the request has no customer.`);
      return { status: 'signed_out' };
    }
  };

  return {
    customerSession,

    /**
     * The verified LINE subject of the MCP caller, or null.
     * Tools see the caller's original Authorization header (Strapi builds tool-visible headers from the raw request).
     */
    async getCustomerSubject(extra: HandlerExtra | undefined): Promise<string | null> {
      const session = await customerSession(authorizationOf(extra?.requestInfo?.headers));
      return session.status === 'signed_in' ? session.subject : null;
    },
  };
};
