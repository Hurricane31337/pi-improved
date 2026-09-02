/**
 * Output-based infinite-loop detection.
 *
 * A model that has lost the plot repeats the *same tool call with the same
 * result* — re-reading one file, re-running one grep — until something external
 * stops it. Argument-level detection misses it (the arguments often differ in
 * whitespace or an irrelevant flag), so this counts identical *results* per
 * tool within one agent run.
 *
 * It lived in the Visual Studio host before, which meant the TUI had no
 * equivalent and the model was killed mid-turn by a raw abort with nothing in
 * the transcript explaining why. Here it is one hook: the offending call is
 * blocked with a reason the model can read, and `terminate` ends the run
 * cleanly instead of severing it.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Identical results tolerated per tool in one agent run before the loop is broken. */
export const LOOP_THRESHOLD = 15;

/** djb2-xor over the result text: cheap, and collisions only cost a false count. */
function hash(text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) {
		h = (((h << 5) + h) ^ text.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(16);
}

/** The text a tool returned, flattened the way the transcript sees it. */
function resultText(result: unknown): string {
	const content = (result as { content?: unknown[] } | undefined)?.content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => part as { type?: string; text?: string })
		.filter((part) => part?.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

export function registerLoopBreaker(pi: ExtensionAPI): void {
	/** `${toolName}|${resultHash}` -> how often it has come back in this run. */
	const seen = new Map<string, number>();
	/** Tools already stopped in this run, so the reason is given once. */
	const broken = new Set<string>();

	// A run is the unit of repetition: a new user turn is a fresh start.
	pi.on("agent_start", async () => {
		seen.clear();
		broken.clear();
	});

	pi.on("tool_execution_end", async (event) => {
		const text = resultText(event.result);
		if (!text) return;
		const key = `${event.toolName}|${hash(text)}`;
		const count = (seen.get(key) ?? 0) + 1;
		seen.set(key, count);
		if (count >= LOOP_THRESHOLD) broken.add(event.toolName);
	});

	pi.on("tool_call", async (event) => {
		if (!broken.has(event.toolName)) return undefined;
		return {
			block: true,
			terminate: true,
			reason:
				`Loop detected: "${event.toolName}" has returned the same result ${LOOP_THRESHOLD} times ` +
				"in this turn. Stopping. Report what you have found and what is blocking you instead of " +
				"retrying — a different tool or different arguments are needed.",
		};
	});
}
