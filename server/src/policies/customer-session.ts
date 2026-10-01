import type { Core } from '@strapi/strapi';

import { notSignedIn } from '../domain/failures';
import { failure, type ServiceFailure } from '../domain/service-result';
import { authorizationOf } from '../domain/subject';
import { replyFailure, type ReplyContext } from '../rest/reply';

const signInNotConfigured = () =>
  failure('not_configured', "Customer sign-in isn't configured on this server.", 'Install strapi-oauth-mcp-manager 1.1 or later and set up LINE sign-in.');

/** A refusal from the customer-session policy. answerCustomerSessionErrors turns it into the response. */
export class CustomerSessionError extends Error {
  readonly failure: ServiceFailure;

  constructor(refusal: ServiceFailure) {
    super(refusal.message);
    this.name = 'CustomerSessionError';
    this.failure = refusal;
  }
}

/** What Strapi hands a policy: a copy of ctx's own properties, so the route's own request and state objects. */
interface PolicyContext {
  request: { headers: Record<string, string | string[] | undefined> };
  state: Record<string, unknown>;
}

/**
 * The customer routes' gate. They set auth: false, so users-permissions doesn't refuse a LINE session before this runs.
 * It resolves the Authorization header through the identity service, exactly as the MCP tools do, and puts the
 * customer in ctx.state.maisonCustomer. Anything else is refused: 401 not_signed_in, or 503 not_configured when
 * oauth-mcp-manager isn't installed.
 */
const customerSession = async (policyContext: PolicyContext, _config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  const identity = strapi.plugin('maison').service('identity');
  const session = await identity.customerSession(authorizationOf(policyContext.request.headers));
  if (session.status === 'signed_in') {
    policyContext.state.maisonCustomer = session.subject;
    return true;
  }
  throw new CustomerSessionError(session.status === 'unavailable' ? signInNotConfigured() : notSignedIn());
};

export default customerSession;

/**
 * Answers the policy's refusals. A Strapi policy can only refuse by throwing, and Strapi's error middleware would
 * answer in its own body, without WWW-Authenticate, and has no 503. Bootstrap adds this inside that middleware.
 */
export const answerCustomerSessionErrors = async (ctx: ReplyContext, next: () => Promise<unknown>) => {
  try {
    await next();
  } catch (error) {
    if (!(error instanceof CustomerSessionError)) throw error;
    replyFailure(ctx, error.failure);
  }
};
