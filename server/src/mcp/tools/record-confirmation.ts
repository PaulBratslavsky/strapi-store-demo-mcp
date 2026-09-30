import { z } from '@strapi/utils';

import { ACTION } from '../../constants';
import { toolError, toolSuccess } from '../../domain/tool-result';
import { defineTool } from '../define';

export const recordConfirmationTool = defineTool({
  name: 'record_confirmation',
  title: 'Record a confirmation outcome',
  description:
    'Records whether a LINE confirmation reached the customer. Use "sent" only after LINE Bot MCP push_flex_message succeeded, and "failed" otherwise. Recording "sent" twice is safe: the first record is returned with alreadyRecorded true.',
  auth: { policies: [{ action: ACTION.confirmationsSend }] },
  resolveInputSchema: () =>
    z.object({
      reference: z.string().regex(/^APT-\d{4}$/, 'Use a reference like APT-4821.'),
      status: z.enum(['sent', 'failed']),
      detail: z.string().min(1).max(2000).describe("LINE's response for sent, or why it failed. Stored up to 500 characters."),
    }),
  resolveOutputSchema: () =>
    z.object({
      notification: z.object({ reference: z.string(), status: z.enum(['sent', 'failed']), sentAt: z.string(), detail: z.string() }),
      alreadyRecorded: z.boolean(),
    }),
  createHandler: (strapi) => async ({ args }) => {
    const result = await strapi.plugin('maison').service('confirmations').record(args);
    if (!result.ok) return toolError(result.code, result.message, result.hint);
    return toolSuccess(result.value);
  },
});
