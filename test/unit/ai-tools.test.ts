import { describe, expect, it, vi } from 'vitest';
import aiToolsService, { CHAT_TOOLS } from '../../server/src/services/ai-tools';
import { fakeStrapi } from './fake-strapi';

const chatTools = (services: Record<string, unknown> = {}, config: Record<string, unknown> = {}) =>
  aiToolsService({ strapi: fakeStrapi({ services, config }) }).getTools();
const toolNamed = (tools: any[], name: string) => tools.find((tool) => tool.name === name);

describe('ai-tools for the in-admin chat', () => {
  it('offers the catalog, staff and pending-confirmation tools, each gated by its MCP permission', () => {
    expect(chatTools().map((tool) => [tool.name, tool.action])).toEqual([
      ['browse_collections', 'plugin::maison.catalog.read'],
      ['search_products', 'plugin::maison.catalog.read'],
      ['view_product', 'plugin::maison.catalog.read'],
      ['find_boutiques', 'plugin::maison.catalog.read'],
      ['appointment_requests', 'plugin::maison.appointments.review'],
      ['confirm_appointment', 'plugin::maison.appointments.confirm'],
      ['pending_confirmations', 'plugin::maison.confirmations.send'],
    ]);
  });

  it('never offers the customer tools or record_confirmation', () => {
    const names = chatTools().map((tool) => tool.name);
    for (const name of ['request_appointment', 'my_appointments', 'record_confirmation']) expect(names).not.toContain(name);
  });

  it('uses the MCP descriptions, with schemas @tanstack/ai can turn into JSON Schema', () => {
    for (const tool of chatTools()) {
      expect(tool.description).toBe(CHAT_TOOLS.find((mcpTool) => mcpTool.name === tool.name)?.description);
      // @tanstack/ai reads zod 4's Standard JSON Schema; a zod 3 schema has none and would reach the model broken.
      const jsonSchema = (tool.schema as any)['~standard'].jsonSchema.input({ target: 'draft-07' });
      expect(jsonSchema.type, tool.name).toBe('object');
    }
  });

  it('leaves out tools listed in disabledTools, as MCP registration does', () => {
    const names = chatTools({}, { disabledTools: ['confirm_appointment'] }).map((tool) => tool.name);
    expect(names).not.toContain('confirm_appointment');
    expect(names).toContain('appointment_requests');
  });

  it('runs the MCP handler and returns its structured result', async () => {
    const searchProducts = vi.fn(async () => ({ total: 0, products: [] }));
    const tool = toolNamed(chatTools({ catalog: { searchProducts } }), 'search_products');
    await expect(tool.execute({ occasion: 'travel', locale: 'en' })).resolves.toEqual({ locale: 'en', total: 0, products: [] });
    expect(searchProducts).toHaveBeenCalledWith('en', { occasion: 'travel', locale: 'en' });
  });

  it('unwraps a tool error into { error } with its code, message and hint', async () => {
    const confirm = vi.fn(async () => ({ ok: false, code: 'in_the_past', message: 'The visit has passed.', hint: 'Ask for a new time.' }));
    const tool = toolNamed(chatTools({ appointments: { confirm } }), 'confirm_appointment');
    await expect(tool.execute({ reference: 'APT-4821' })).resolves.toEqual({
      error: { code: 'in_the_past', message: 'The visit has passed.', hint: 'Ask for a new time.' },
    });
  });

  it('answers invalid arguments with invalid_input and never calls the service', async () => {
    const confirm = vi.fn();
    const tool = toolNamed(chatTools({ appointments: { confirm } }), 'confirm_appointment');
    const result = await tool.execute({ reference: '4821' });
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.message).toBe('reference: Use a reference like APT-4821.');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('wraps only handlers that ignore the MCP handler context, which the chat does not have', () => {
    for (const tool of CHAT_TOOLS) expect(tool.createHandler.length, tool.name).toBe(1);
  });

  it("names Maison in the chat's Tools menu", () => {
    expect(aiToolsService({ strapi: fakeStrapi() }).getMeta()).toEqual({ label: 'Maison', description: expect.any(String) });
  });
});
