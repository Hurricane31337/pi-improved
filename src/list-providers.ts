/**
 * `--list-providers`: print the known provider ids as JSON and exit.
 *
 * The IDE extensions shell out to the bundled CLI to populate their provider
 * picker, so they need a machine-readable list from the binary they actually
 * run rather than a copy maintained on the C# side.
 *
 * Why this is wired to session_start and not to the factory: pi applies CLI
 * flag values *after* every extension factory has run
 * (applyExtensionFlagValues in agent-session-services), so pi.getFlag() in a
 * factory body only ever returns the registered default. session_start is the
 * first hook where the real value is visible.
 */

import { writeSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const LIST_PROVIDERS_FLAG = "list-providers";

/**
 * Provider ids are derived from the live catalog, so anything registered by
 * this extension (Scaleway) or declared in the user's models.json is included
 * automatically and cannot drift from what pi actually supports.
 *
 * getAll() rather than getAvailable(): the picker should offer every provider
 * the build knows about, including ones the user has not configured a key for
 * yet — that is precisely the list they pick from in order to configure one.
 */
function providerIds(ctx: ExtensionContext): string[] {
	return [...new Set(ctx.modelRegistry.getAll().map((model) => model.provider))].sort();
}

export function registerListProviders(pi: ExtensionAPI): void {
	pi.registerFlag(LIST_PROVIDERS_FLAG, {
		description: "Print the known provider ids as JSON and exit",
		type: "boolean",
		default: false,
	});

	pi.on("session_start", async (_event, ctx) => {
		if (!pi.getFlag(LIST_PROVIDERS_FLAG)) return;
		// NOTE FOR CALLERS: this lands on **stderr**, not stdout.
		//
		// pi calls takeOverStdout() before session_start, which rebinds
		// process.stdout.write onto stderr so extension output cannot corrupt the
		// RPC/TUI channel on stdout. Measured behaviour: with stdout and stderr
		// redirected separately, the JSON arrives on stderr every time.
		//
		// So a caller must read stderr (or merge with 2>&1). Writing to fd 1
		// directly does not get around it, and pretending otherwise would give the
		// IDE an empty string.
		writeSync(2, `${JSON.stringify({ providers: providerIds(ctx) })}\n`);
		process.exit(0);
	});
}
