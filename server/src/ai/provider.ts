import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/**
 * The one place a model provider is chosen, as in Pulse's provider.ts: switching providers is a config change and not
 * a code change.
 *
 * `openai-compatible` is what makes "bring your own model" real: Ollama, vLLM, LM Studio, Together, DeepSeek and most
 * self-hosted servers all speak the OpenAI wire format, so they need a base URL rather than a new adapter.
 *
 * The settings are the plugin's config, `aiProvider`, `aiModel`, `aiApiKey` and `aiBaseUrl`: Pulse's AI_PROVIDER,
 * AI_MODEL, AI_API_KEY and AI_BASE_URL, which the app maps onto them.
 */
export const AI_PROVIDERS = ['anthropic', 'openai', 'openai-compatible'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiSettings {
  aiProvider: AiProvider;
  aiModel: string | null;
  aiApiKey: string | null;
  aiBaseUrl: string | null;
}

/** Pulse's defaults: a valid model id per provider, so the first call after setting a key doesn't 404. */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-5-mini',
  'openai-compatible': 'llama3.1',
};

/** AI is optional: without a key (or a local server for openai-compatible), labelling is off, not degraded. */
export const aiEnabled = (settings: AiSettings): boolean =>
  Boolean(settings.aiApiKey) || (settings.aiProvider === 'openai-compatible' && Boolean(settings.aiBaseUrl));

export const modelIdOf = (settings: AiSettings): string => settings.aiModel || DEFAULT_MODEL[settings.aiProvider];

/** Stamped on each labelled inquiry, so a re-label can tell which model produced a label. */
export const modelVersionOf = (settings: AiSettings): string => `${settings.aiProvider}/${modelIdOf(settings)}`;

/**
 * The model, resolved per call so a key or model change takes effect on the next sweep without a restart. The return
 * type is named because the build's declaration files can't name the one TypeScript infers: it lives in a package
 * nested inside `ai`.
 */
export const languageModelOf = (settings: AiSettings): LanguageModel => {
  const id = modelIdOf(settings);
  switch (settings.aiProvider) {
    // Factories, not the exported singletons: those read ANTHROPIC_API_KEY / OPENAI_API_KEY, and Maison deliberately
    // has ONE vendor-neutral aiApiKey (Pulse's AI_API_KEY), so switching providers is a single config change. Using the
    // singletons silently ignores aiApiKey and fails with "API key is missing" even though a key is set.
    case 'anthropic':
      return createAnthropic({ apiKey: settings.aiApiKey ?? undefined })(id);
    case 'openai':
      return createOpenAI({ apiKey: settings.aiApiKey ?? undefined })(id);
    case 'openai-compatible':
      if (!settings.aiBaseUrl) throw new Error("aiProvider 'openai-compatible' needs aiBaseUrl (e.g. http://127.0.0.1:11434/v1)");
      // The key is optional: a local Ollama or vLLM server usually wants none, but the SDK still expects the field,
      // so pass a placeholder.
      return createOpenAICompatible({ name: 'custom', baseURL: settings.aiBaseUrl, apiKey: settings.aiApiKey || 'not-needed' })(id);
  }
};
