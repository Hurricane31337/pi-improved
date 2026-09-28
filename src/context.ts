/**
 * Session context: what the agent is told about where it runs, plus the
 * README fallback.
 *
 * This used to live in pi-label_intern, but none of it is Label Software
 * company context — it is generic "which host is this, is there a project
 * open" awareness that every product variant wants, including a plain
 * terminal session. pi-label_intern now carries only the Label-specific
 * addition (the Kürzel comment-convention text) and is loaded only for that
 * one product variant; this is loaded everywhere, same as the encoding-aware
 * file tools above it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Upper bound on the README we inline, so one huge file cannot crowd out the session. */
export const MAX_README_CHARS = 32_000;

interface ContextOptions {
	/** Where the agent runs, e.g. "Visual Studio 2022". Empty when unknown. */
	host: () => string;
	/** True when the host has no project/solution open. */
	noProject: () => boolean;
}

/**
 * Session context. `host` names the application the agent is embedded in and is
 * set only by a host that passes `--host` — the Visual Studio package does.
 *
 * Without it this is an ordinary terminal session and must not claim otherwise:
 * a prompt that says "embedded in Visual Studio" makes the model offer to open
 * designers and jump to definitions it has no way to reach. It says where the
 * work is instead. Deliberately generic - no company name here, since this
 * extension is loaded by every product variant, including an external one.
 */
export function baseContext(host: string, cwd: string): string {
	return [
		host
			? `You are an AI coding assistant embedded in ${host}.`
			: `You are an AI coding assistant working in the repository at ${cwd}.`,
		"You help developers understand, navigate, and modify their code.",
		"Always respond in the same language the user writes in. If the user writes in German, respond in German.",
		"If the user writes in English, respond in English.",
	].join("\n");
}

/**
 * Shown when the host has no project open. The agent has no tools and no
 * working directory in that state, and without an explicit notice it will
 * happily invent file listings.
 */
export const NO_PROJECT_NOTICE = [
	"WICHTIG: Kein Projekt ist aktuell geöffnet.",
	"Du hast KEINE Werkzeuge, KEINEN Dateizugriff und KEIN Arbeitsverzeichnis.",
	"Du kannst NICHTS lesen, schreiben, auflisten oder ausführen.",
	"Behaupte NICHT, Werkzeuge zu haben. Simuliere oder erfinde KEINE Dateiinhalte oder Verzeichnisauflistungen.",
	"Wenn der Nutzer fragt, welche Werkzeuge du hast, antworte: 'Keine Werkzeuge verfügbar – kein Projekt geladen.'",
	"Wenn der Nutzer nach Dateien oder Verzeichnissen fragt, erkläre klar, dass du keinen Zugriff hast.",
	"Antworte immer auf Deutsch, unabhängig von der Sprache des Nutzers.",
].join(" ");

/**
 * pi loads AGENTS.md and CLAUDE.md by itself. A README is only worth inlining
 * when the repository offers no real agent instructions at all.
 */
export function readmeFallback(cwd: string, contextFiles: readonly { path: string }[] | undefined): string | null {
	if (contextFiles && contextFiles.length > 0) return null;
	let content: string;
	try {
		content = readFileSync(join(cwd, "README.md"), "utf8");
	} catch {
		return null;
	}
	if (!content.trim()) return null;
	return content.length > MAX_README_CHARS ? `${content.slice(0, MAX_README_CHARS)}\n[README truncated]` : content;
}

export function registerSessionContext(pi: ExtensionAPI, options: ContextOptions): void {
	pi.on("before_agent_start", async (event, ctx) => {
		const parts: string[] = [];

		// The no-project notice goes first: it overrides everything after it.
		if (options.noProject()) parts.push(NO_PROJECT_NOTICE);
		parts.push(baseContext(options.host(), ctx.cwd));

		if (!options.noProject()) {
			const readme = readmeFallback(ctx.cwd, event.systemPromptOptions?.contextFiles);
			if (readme) parts.push(`# README.md\n\n${readme}`);
		}

		return { systemPrompt: `${event.systemPrompt}\n\n${parts.join("\n\n")}` };
	});
}
