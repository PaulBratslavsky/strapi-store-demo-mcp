import type { Core } from '@strapi/strapi';

import { OAUTH_PLUGIN_ID } from '../constants';
import { authorizationOf, bearerTokenOf, parseSubject } from '../domain/subject';

export interface HandlerExtra {
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
}

/** Who is calling: a LINE customer, nobody, or unknown because customer sign-in isn't installed. */
export type CustomerSession = { status: 'signed_in'; subject: string } | { status: 'signed_out' } | { status: 'unavailable' };

export interface CustomerSessionOptions {
  /**
   * true only where oauth-mcp-manager's /mcp middleware has already run resolveAccessToken on this very request.
   * That's every MCP tool call: an invalid session never reaches a tool. Everywhere else, such as the REST routes
   * (auth: false, so nothing has checked the token yet), leave it out, and the session is checked here first.
   */
  sessionValidated?: boolean;
}

/** oauth-mcp-manager's resolveAccessToken: { valid: true, adminAccessKey, grantId } or { valid: false, reason }. */
type ResolveAccessToken = (accessToken: string) => Promise<{ valid?: unknown } | null | undefined>;

/** The parts of oauth-mcp-manager's oauth service (1.1) Maison uses. */
interface OAuthService {
  resolveAccessToken?: ResolveAccessToken;
  /** The customer a session belongs to: 'line:U…', or null. It doesn't check the session itself. */
  resolveSubject?: (authorization: string) => Promise<unknown>;
}

/**
 * Whether /mcp would accept the session behind `authorization`. resolveAccessToken is the check /mcp's middleware runs:
 * it refuses an unknown, expired, revoked or rotated token, a key it can't decrypt, and an inactive user. Only `valid`
 * is read. The decrypted admin key that comes with a valid session is neither kept nor logged.
 */
const sessionAccepted = async (resolveAccessToken: ResolveAccessToken, authorization: string): Promise<boolean> => {
  const token = bearerTokenOf(authorization);
  if (!token) return false;
  const { valid } = (await resolveAccessToken(token)) ?? {};
  return valid === true;
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const oauthService = (): OAuthService | undefined => {
    try {
      return strapi.plugin(OAUTH_PLUGIN_ID)?.service('oauth') as OAuthService | undefined;
    } catch {
      return undefined;
    }
  };

  /**
   * The LINE customer behind a raw Authorization header: one code path for the MCP tools and the REST routes.
   * It checks the session the way /mcp does, unless `sessionValidated` says /mcp already has, and then asks
   * oauth-mcp-manager whose session it is. Anything but a LINE subject is signed out: staff sessions, admin and API
   * tokens, users-permissions JWTs, and unknown, expired, revoked or rotated sessions. It never logs the header, the
   * subject, or a resolver's error message, which could quote either.
   */
  const customerSession = async (
    authorization: string | null,
    { sessionValidated = false }: CustomerSessionOptions = {}
  ): Promise<CustomerSession> => {
    const oauth = oauthService();
    // Bound, because the service's methods use `this` (resolveAccessToken revokes a rotated grant through it).
    const resolveSubject = typeof oauth?.resolveSubject === 'function' ? oauth.resolveSubject.bind(oauth) : null;
    const resolveAccessToken = typeof oauth?.resolveAccessToken === 'function' ? oauth.resolveAccessToken.bind(oauth) : null;
    if (!resolveSubject || (!resolveAccessToken && !sessionValidated)) return { status: 'unavailable' };
    if (!authorization) return { status: 'signed_out' };
    try {
      if (!sessionValidated) {
        const accepted = resolveAccessToken !== null && (await sessionAccepted(resolveAccessToken, authorization));
        if (!accepted) return { status: 'signed_out' };
      }
      const subject = parseSubject(await resolveSubject(authorization));
      return subject ? { status: 'signed_in', subject } : { status: 'signed_out' };
    } catch (error) {
      strapi.log.warn(`[maison] Checking a customer session failed (${(error as Error)?.name ?? 'unknown error'}), so the request has no customer.`);
      return { status: 'signed_out' };
    }
  };

  return {
    customerSession,

    /**
     * The verified LINE subject of the MCP caller, or null.
     * Tools see the caller's original Authorization header (Strapi builds tool-visible headers from the raw request).
     * oauth-mcp-manager's /mcp middleware has already run resolveAccessToken on it, so this only resolves the customer.
     */
    async getCustomerSubject(extra: HandlerExtra | undefined): Promise<string | null> {
      const session = await customerSession(authorizationOf(extra?.requestInfo?.headers), { sessionValidated: true });
      return session.status === 'signed_in' ? session.subject : null;
    },
  };
};
