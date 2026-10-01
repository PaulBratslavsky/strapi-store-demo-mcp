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
});

describe('identity.customerSession, the one code path for the MCP tools and the REST routes', () => {
  it('resolves a raw Authorization header to the signed-in LINE customer', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    expect(await withResolver(resolveSubject).customerSession('Bearer mcp_at_x')).toEqual({ status: 'signed_in', subject: VALID });
    expect(resolveSubject).toHaveBeenCalledWith('Bearer mcp_at_x');
  });

  it('is signed out without a header, or when the resolver finds no LINE customer or fails', async () => {
    const resolveSubject = vi.fn(async () => VALID);
    expect(await withResolver(resolveSubject).customerSession(null)).toEqual({ status: 'signed_out' });
    expect(resolveSubject).not.toHaveBeenCalled();
    expect(await withResolver(async () => null).customerSession('Bearer t')).toEqual({ status: 'signed_out' });
    expect(await withResolver(async () => 'admin:1').customerSession('Bearer t')).toEqual({ status: 'signed_out' });
    const failing = withResolver(async () => { throw new Error('db down'); });
    expect(await failing.customerSession('Bearer t')).toEqual({ status: 'signed_out' });
  });

  it('is unavailable, whatever the header, when oauth-mcp-manager 1.1 is not installed', async () => {
    const without = identityService({ strapi: fakeStrapi() });
    expect(await without.customerSession('Bearer t')).toEqual({ status: 'unavailable' });
    expect(await without.customerSession(null)).toEqual({ status: 'unavailable' });
    const old = identityService({ strapi: fakeStrapi({ plugins: { 'strapi-oauth-mcp-manager': { oauth: {} } } }) });
    expect(await old.customerSession('Bearer t')).toEqual({ status: 'unavailable' });
  });

  it("logs a failed lookup without the token or the resolver's message", async () => {
    const token = 'mcp_at_secret-session-token';
    const strapi = fakeStrapi({
      plugins: { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject: async (header: string) => { throw new Error(`no row for ${header}`); } } } },
    });
    await identityService({ strapi }).customerSession(`Bearer ${token}`);
    const logged = JSON.stringify(strapi.log.warn.mock.calls);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('no row for');
  });
});
