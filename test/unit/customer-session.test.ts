import { describe, expect, it, vi } from 'vitest';
import customerSession, { answerCustomerSessionErrors, CustomerSessionError } from '../../server/src/policies/customer-session';
import { notSignedIn } from '../../server/src/mcp/common';
import identityService from '../../server/src/services/identity';
import { fakeStrapi } from './fake-strapi';

const SUBJECT = `line:U${'4af4980629c1a7b3f1e2d3c4b5a69788'}`;
const TOKEN = 'mcp_at_customer-session-token';

/** Maison with its real identity service, and oauth-mcp-manager's oauth service when one is given. */
const strapiWith = (oauth?: Record<string, unknown>) => {
  const services: Record<string, unknown> = {};
  const strapi = fakeStrapi({ services, plugins: oauth ? { 'strapi-oauth-mcp-manager': { oauth } } : {} });
  services.identity = identityService({ strapi });
  return strapi;
};
const withResolver = (resolveSubject: (authorization: string) => Promise<unknown>) => strapiWith({ resolveSubject });

/** What Strapi hands a policy: ctx's own properties, so the same request and state objects as the route's ctx. */
const policyContextWith = (headers: Record<string, string> = {}) => ({ request: { headers }, state: {} as Record<string, unknown> });

/** Enough of a Koa context for the middleware that answers the policy's refusals. */
const koaContext = () => {
  const headers: Record<string, string> = {};
  return { status: 404, body: undefined as any, headers, set: (field: string, value: string) => void (headers[field] = value) };
};

/** Runs the policy the way Strapi does, inside the middleware Maison's bootstrap registers, and returns the response. */
const request = async (strapi: any, headers: Record<string, string> = {}) => {
  const policyContext = policyContextWith(headers);
  const ctx = koaContext();
  let allowed: unknown;
  await answerCustomerSessionErrors(ctx as any, async () => {
    allowed = await customerSession(policyContext as any, {}, { strapi });
    ctx.status = 200;
  });
  return { ...ctx, allowed, state: policyContext.state };
};

/** Everything Maison logged, as one string. */
const logged = (strapi: any) =>
  JSON.stringify(Object.values(strapi.log).flatMap((log: any) => log.mock.calls));

const NOT_SIGNED_IN = (() => {
  const { error } = JSON.parse(notSignedIn().content[0].text);
  return { error };
})();

describe('customer-session policy', () => {
  it('lets a LINE customer through and puts the customer in ctx.state.maisonCustomer', async () => {
    const resolveSubject = vi.fn(async () => SUBJECT);
    const strapi = withResolver(resolveSubject);
    const response = await request(strapi, { authorization: `Bearer ${TOKEN}` });
    expect(response.allowed).toBe(true);
    expect(response.state.maisonCustomer).toBe(SUBJECT);
    expect(resolveSubject).toHaveBeenCalledWith(`Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
  });

  it('refuses a request without an Authorization header with 401, without asking oauth-mcp-manager', async () => {
    const resolveSubject = vi.fn(async () => SUBJECT);
    const response = await request(withResolver(resolveSubject));
    expect(response.status).toBe(401);
    expect(response.headers['WWW-Authenticate']).toBe('Bearer');
    expect(response.body).toEqual(NOT_SIGNED_IN);
    expect(response.state.maisonCustomer).toBeUndefined();
    expect(resolveSubject).not.toHaveBeenCalled();
  });

  it.each([
    ['a malformed header', 'Basic dXNlcjpwYXNz'],
    ['an unknown or expired session', `Bearer ${TOKEN}`],
    ['a staff or admin token', `Bearer ${'f'.repeat(256)}`],
    ['a users-permissions JWT', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2lnbmF0dXJl'],
  ])('refuses %s, which oauth-mcp-manager resolves to no customer, with 401', async (_label, authorization) => {
    const response = await request(withResolver(async () => null), { authorization });
    expect(response.status).toBe(401);
    expect(response.headers['WWW-Authenticate']).toBe('Bearer');
    expect(response.body).toEqual(NOT_SIGNED_IN);
    expect(response.state.maisonCustomer).toBeUndefined();
  });

  it.each([
    ['uppercase hex', `line:U${'4AF4980629C1A7B3F1E2D3C4B5A69788'}`],
    ['no line: prefix', 'U4af4980629c1a7b3f1e2d3c4b5a69788'],
    ['an admin subject', 'admin:1'],
  ])('refuses a resolved subject with %s, as the MCP tools do', async (_label, subject) => {
    const response = await request(withResolver(async () => subject), { authorization: `Bearer ${TOKEN}` });
    expect(response.status).toBe(401);
    expect(response.state.maisonCustomer).toBeUndefined();
  });

  it('answers 401 when oauth-mcp-manager throws, and logs neither the token nor the error message', async () => {
    const strapi = withResolver(async (authorization) => {
      throw new Error(`database is locked while reading ${authorization}`);
    });
    const response = await request(strapi, { authorization: `Bearer ${TOKEN}` });
    expect(response.status).toBe(401);
    expect(response.body).toEqual(NOT_SIGNED_IN);
    expect(strapi.log.warn).toHaveBeenCalled();
    expect(logged(strapi)).not.toContain(TOKEN);
    expect(logged(strapi)).not.toContain('database is locked');
  });

  it.each([
    ['not installed', strapiWith()],
    ['older than 1.1, without resolveSubject', strapiWith({})],
  ])("answers 503 when oauth-mcp-manager is %s: customer sign-in isn't configured", async (_label, strapi) => {
    for (const headers of [{}, { authorization: `Bearer ${TOKEN}` }]) {
      const response = await request(strapi, headers);
      expect(response.status).toBe(503);
      expect(response.headers['WWW-Authenticate']).toBeUndefined();
      expect(response.body.error.code).toBe('not_configured');
      expect(response.body.error.message).toMatch(/customer sign-in isn't configured/i);
      expect(response.state.maisonCustomer).toBeUndefined();
    }
  });

  it('never logs the token or the LINE user ID of a customer it lets through', async () => {
    const strapi = withResolver(async () => SUBJECT);
    await request(strapi, { authorization: `Bearer ${TOKEN}` });
    expect(logged(strapi)).not.toContain(TOKEN);
    expect(logged(strapi)).not.toContain(SUBJECT.slice('line:'.length));
  });
});

describe('answerCustomerSessionErrors', () => {
  it('passes every other error on to Strapi untouched', async () => {
    const boom = new Error('boom');
    await expect(answerCustomerSessionErrors(koaContext() as any, async () => { throw boom; })).rejects.toBe(boom);
  });

  it('answers a refusal with the failure it carries', async () => {
    const ctx = koaContext();
    await answerCustomerSessionErrors(ctx as any, async () => {
      throw new CustomerSessionError({ code: 'not_configured', message: 'Not set up.', hint: 'Install it.' });
    });
    expect(ctx.status).toBe(503);
    expect(ctx.body).toEqual({ error: { code: 'not_configured', message: 'Not set up.', hint: 'Install it.' } });
  });
});
