/**
 * Scaleway Generative APIs as a pi provider.
 *
 * Plain pi has no Scaleway provider. In the monorepo this was a change across
 * packages/ai (types, provider list, generated catalog, model generator, tests);
 * here it is a single registerProvider call, which is why it no longer conflicts
 * on every upstream merge.
 *
 * The catalog is a static snapshot in scaleway.models.json. Scaleway's OpenAI
 * endpoint does expose /v1/models, but the snapshot carries pricing, context
 * windows and per-model thinking maps that the endpoint does not return.
 *
 * GLM on Scaleway reasons by default and is steered purely through
 * reasoning_effort: "none" disables thinking, low/medium/high set the depth.
 * That is what each model's thinkingLevelMap encodes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import models from "./scaleway.models.json" with { type: "json" };

export const SCALEWAY_PROVIDER_ID = "scaleway";

export function registerScaleway(pi: ExtensionAPI): void {
	pi.registerProvider(SCALEWAY_PROVIDER_ID, {
		name: "Scaleway",
		baseUrl: "https://api.scaleway.ai/v1",
		apiKey: "$SCALEWAY_API_KEY",
		api: "openai-completions",
		models,
	} as Parameters<ExtensionAPI["registerProvider"]>[1]);
}
