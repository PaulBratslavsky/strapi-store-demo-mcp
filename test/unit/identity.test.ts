import { describe, expect, it, vi } from 'vitest';
import identityService from '../../server/src/services/identity';
import { extraWith, fakeStrapi } from './fake-strapi';

const VALID = `line:U${'4af4980629c1a7b3f1e2d3c4b5a69788'}`;
const withResolver = (resolveSubject: (auth: string) => Promise<unknown>) =>
  identityService({ strapi: fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject } } } }) });

describe('identity.getCustomerSubject', () => {
  it('returns the subject oauth-mcp-manager resolves from the raw Authorization header', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    const subject = await withResolver(resolveSubject).getCustomerSubject(extraWith({ authorization: 'Bearer mcp_at_x' }));
    expect(subject).toBe(VALID);
    expect(resolveSubject).toHaveBeenCalledWith('Bearer mcp_at_x');
  });

  it.each([
    ['uppercase hex', `line:U${'4AF4980629C1A7B3F1E2D3C4B5A69788'}`],
    ['no line: prefix', 'U4af4980629c1a7b3f1e2d3c4b5a69788'],
    ['null for a staff or admin token', null],
  ])('treats a resolver result with %s as not signed in', async (_label, value) => {
    expect(await withResolver(async () => value).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
  });

  it('returns null without calling the resolver when the header is missing or repeated', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    const service = withResolver(resolveSubject);
    expect(await service.getCustomerSubject(undefined)).toBeNull();
    expect(await service.getCustomerSubject(extraWith({}))).toBeNull();
    expect(await service.getCustomerSubject(extraWith({ authorization: ['Bearer a', 'Bearer b'] }))).toBeNull();
    expect(resolveSubject).not.toHaveBeenCalled();
  });

  it('returns null when oauth-mcp-manager is not installed or has no resolveSubject', async () => {
    expect(await identityService({ strapi: fakeStrapi() }).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
    const old = identityService({ strapi: fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: {} } } }) });
    expect(await old.getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
  });

  it('returns null and logs when the resolver throws', async () => {
    const strapi = fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject: async () => { throw new Error('db down'); } } } } });
    expect(await identityService({ strapi }).getCustomerSubject(extraWith({ authorization: 'Bearer t' }))).toBeNull();
    expect(strapi.log.warn).toHaveBeenCalled();
  });

  it("never checks the session again: oauth-mcp-manager's /mcp middleware has already run resolveAccessToken", async () => {
    const resolveAccessToken = vi.fn(async () => ({ valid: false, reason: 'unknown_token' }));
    const strapi = fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject: async () => VALID, resolveAccessToken } } } });
    expect(await identityService({ strapi }).getCustomerSubject(extraWith({ authorization: 'Bearer mcp_at_x' }))).toBe(VALID);
    expect(resolveAccessToken).not.toHaveBeenCalled();
  });
});

const TOKEN = 'mcp_at_customer-session-token';
const ADMIN_KEY = 'admin-key-behind-the-session';
const VALID_SESSION = { valid: true, adminAccessKey: ADMIN_KEY, grantId: 7 };
const REASONS = ['unknown_token', 'token_expired', 'grant_revoked', 'decrypt_failed', 'user_inactive'];

/** Maison's identity service, with oauth-mcp-manager's oauth service as given. */
const withOAuth = (oauth: Record<string, unknown>) => {
  const strapi = fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth } } });
  return { strapi, identity: identityService({ strapi }) };
};
/** Everything Maison logged, as one string. */
const logged = (strapi: any) => JSON.stringify(Object.values(strapi.log).flatMap((log: any) => log.mock.calls));

describe('identity.customerSession, the one code path for the MCP tools and the REST routes', () => {
  it('checks the session the way /mcp does, and only then resolves the customer', async () => {
    const resolveAccessToken = vi.fn(async () => VALID_SESSION);
    const resolveSubject = vi.fn(async () => VALID);
    const { strapi, identity } = withOAuth({ resolveAccessToken, resolveSubject });
    const session = await identity.customerSession(`Bearer ${TOKEN}`);
    expect(session).toEqual({ status: 'signed_in', subject: VALID });
    expect(resolveAccessToken).toHaveBeenCalledWith(TOKEN);
    expect(resolveSubject).toHaveBeenCalledWith(`Bearer ${TOKEN}`);
    expect(resolveAccessToken.mock.invocationCallOrder[0]).toBeLessThan(resolveSubject.mock.invocationCallOrder[0]);
    expect(JSON.stringify(session)).not.toContain(ADMIN_KEY);
    expect(logged(strapi)).not.toContain(ADMIN_KEY);
  });

  it.each(REASONS)('is signed out when /mcp would refuse the session (%s), without resolving a customer', async (reason) => {
    const resolveSubject = vi.fn(async () => VALID);
    const { identity } = withOAuth({ resolveAccessToken: async () => ({ valid: false, reason }), resolveSubject });
    expect(await identity.customerSession(`Bearer ${TOKEN}`)).toEqual({ status: 'signed_out' });
    expect(resolveSubject).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}, { valid: 'true' }, { valid: 1 }])(
    'is signed out unless resolveAccessToken answers exactly valid: true, not %j',
    async (answer) => {
      const resolveSubject = vi.fn(async () => VALID);
      const { identity } = withOAuth({ resolveAccessToken: async () => answer, resolveSubject });
      expect(await identity.customerSession(`Bearer ${TOKEN}`)).toEqual({ status: 'signed_out' });
      expect(resolveSubject).not.toHaveBeenCalled();
    }
  );

  it('is signed out without a Bearer token, asking neither resolver', async () => {
    const resolveAccessToken = vi.fn(async () => VALID_SESSION);
    const resolveSubject = vi.fn(async () => VALID);
    const { identity } = withOAuth({ resolveAccessToken, resolveSubject });
    for (const authorization of [null, 'Basic dXNlcjpwYXNz', 'Bearer ']) {
      expect(await identity.customerSession(authorization)).toEqual({ status: 'signed_out' });
    }
    expect(resolveAccessToken).not.toHaveBeenCalled();
    expect(resolveSubject).not.toHaveBeenCalled();
  });

  it('is signed out for a valid session that holds no LINE customer, such as a staff session', async () => {
    for (const subject of [null, 'admin:1']) {
      const { identity } = withOAuth({ resolveAccessToken: async () => VALID_SESSION, resolveSubject: async () => subject });
      expect(await identity.customerSession(`Bearer ${TOKEN}`)).toEqual({ status: 'signed_out' });
    }
  });

  it('is signed out when either lookup throws, and logs neither the token, the error message, nor the admin key', async () => {
    const failing = async (value: string) => {
      throw new Error(`database is locked while reading ${value}`);
    };
    for (const oauth of [
      { resolveAccessToken: failing, resolveSubject: async () => VALID },
      { resolveAccessToken: async () => VALID_SESSION, resolveSubject: failing },
    ]) {
      const { strapi, identity } = withOAuth(oauth);
      expect(await identity.customerSession(`Bearer ${TOKEN}`)).toEqual({ status: 'signed_out' });
      expect(strapi.log.warn).toHaveBeenCalled();
      expect(logged(strapi)).not.toContain(TOKEN);
      expect(logged(strapi)).not.toContain('database is locked');
      expect(logged(strapi)).not.toContain(ADMIN_KEY);
    }
  });

  it('is unavailable, whatever the header, without oauth-mcp-manager 1.1, or with either resolver missing', async () => {
    const unavailable = [
      identityService({ strapi: fakeStrapi() }),
      withOAuth({}).identity,
      withOAuth({ resolveSubject: async () => VALID }).identity,
      withOAuth({ resolveAccessToken: async () => VALID_SESSION }).identity,
    ];
    for (const identity of unavailable) {
      expect(await identity.customerSession(`Bearer ${TOKEN}`)).toEqual({ status: 'unavailable' });
      expect(await identity.customerSession(null)).toEqual({ status: 'unavailable' });
    }
  });

  it('skips the session check only when told /mcp has already run it, as for an MCP tool call', async () => {
    const resolveAccessToken = vi.fn(async () => ({ valid: false, reason: 'unknown_token' }));
    const { identity } = withOAuth({ resolveAccessToken, resolveSubject: async () => VALID });
    expect(await identity.customerSession(`Bearer ${TOKEN}`, { sessionValidated: true })).toEqual({ status: 'signed_in', subject: VALID });
    expect(resolveAccessToken).not.toHaveBeenCalled();
    const withoutCheck = withOAuth({ resolveSubject: async () => VALID }).identity;
    expect(await withoutCheck.customerSession(`Bearer ${TOKEN}`, { sessionValidated: true })).toEqual({ status: 'signed_in', subject: VALID });
  });
});
