import type { ConfiguredModelSettings } from "./types.js";

export const DEFAULT_CONTEXT_WINDOW = 200_000;
export const GROK_45_CONTEXT_WINDOW = 500_000;

export function defaultContextWindowForModel(modelId: string): number {
  return /grok[-_.]?4\.5(?:$|[-_.])/i.test(modelId)
    ? GROK_45_CONTEXT_WINDOW
    : DEFAULT_CONTEXT_WINDOW;
}

export function defaultConfiguredModelSettings(
  modelId: string,
): ConfiguredModelSettings {
  return {
    contextWindow: defaultContextWindowForModel(modelId),
    supportsReasoningEffort: false,
  };
}
