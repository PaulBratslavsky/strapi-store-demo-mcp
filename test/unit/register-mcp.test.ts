import { describe, expect, it } from 'vitest';
import { registerMcp } from '../../server/src/mcp';
import { fakeMcp, fakeStrapi } from './fake-strapi';

describe('registerMcp', () => {
  it('warns and registers nothing when Strapi MCP is disabled', () => {
    const mcp = fakeMcp(false);
    const strapi = fakeStrapi({ mcp });
    registerMcp(strapi);
    expect(strapi.log.warn).toHaveBeenCalledWith(expect.stringMatching(/server\.mcp\.enabled/));
    expect(mcp.registerTool).not.toHaveBeenCalled();
    expect(mcp.registerPrompt).not.toHaveBeenCalled();
  });

  it('warns when the host Strapi has no MCP service at all', () => {
    const strapi = fakeStrapi();
    expect(() => registerMcp(strapi)).not.toThrow();
    expect(strapi.log.warn).toHaveBeenCalled();
  });
});
