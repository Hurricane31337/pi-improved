/**
 * The tool set every session of this fork runs with.
 *
 * pi's own default is `["read", "bash", "edit", "write"]` (core/sdk.ts), which
 * leaves `grep`, `find` and `ls` switched off. A terminal session installing
 * pi-improved and an IDE session loading it should agree on what "normal"
 * looks like, so this selects the fuller set here rather than making every
 * host (or every developer's terminal invocation) retype a `--tools` list.
 *
 * Two rules keep that from being a hijack:
 *
 *   - an explicit tool flag on the command line always wins, and
 *   - only tools that actually exist in this session are selected.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** What a session should have active when nothing says otherwise. */
export const PRODUCT_TOOLS = ["read", "write", "edit", "grep", "find", "ls", "bash"] as const;

/** pi's built-in tools. Anything active that is not one of these was added by an extension. */
const BUILT_IN_TOOLS = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"]);

/**
 * pi's own tool-selection flags (cli/args.ts). When the user passes any of
 * these they have said what they want, and this extension must not overrule it.
 */
const TOOL_FLAGS = new Set([
	"--tools",
	"-t",
	"--no-tools",
	"-nt",
	"--no-builtin-tools",
	"-nbt",
	"--exclude-tools",
	"-xt",
]);

/** True when the command line already decides the tool set. */
export function toolsChosenOnCommandLine(argv: readonly string[]): boolean {
	return argv.some((arg) => TOOL_FLAGS.has(arg));
}

/**
 * The default tool set, restricted to tools this session actually has. A name
 * pi no longer ships (or an extension failed to register) is dropped rather
 * than activated into a hole.
 */
export function resolveProductTools(available: readonly string[]): string[] {
	const present = new Set(available);
	return PRODUCT_TOOLS.filter((name) => present.has(name));
}

interface ToolOptions {
	/** True when the host has no project open: the session gets no tools at all. */
	noProject: () => boolean;
	/** Command line to inspect. Injected for tests. */
	argv?: readonly string[];
}

export function registerToolSelection(pi: ExtensionAPI, options: ToolOptions): void {
	pi.on("session_start", async () => {
		if (options.noProject()) {
			pi.setActiveTools([]);
			return;
		}
		if (toolsChosenOnCommandLine(options.argv ?? process.argv)) return;

		const tools = resolveProductTools(pi.getAllTools().map((tool) => tool.name));
		if (tools.length === 0) return;

		// Keep what other extensions already switched on (a host's own tools, say).
		// Extension load order decides whether their session_start hook runs before
		// or after this one; replacing the list outright would drop their tools
		// whenever theirs ran first.
		const kept = pi.getActiveTools().filter((name) => !tools.includes(name) && !BUILT_IN_TOOLS.has(name));
		pi.setActiveTools([...tools, ...kept]);
	});
}
