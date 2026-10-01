/**
 * pi-improved — everything this fork changes about plain pi, as one extension.
 *
 * Design rule: never reimplement a pi behaviour we only want to adjust. Each
 * item below either reuses a pi factory with different operations, or uses a
 * documented extension hook. That keeps the diff against upstream near zero and
 * means a pi upgrade is a submodule bump rather than a merge.
 *
 * What it changes:
 *   - read/edit/write preserve a file's original encoding (UTF-8, UTF-8+BOM,
 *     Windows-1252) instead of rewriting everything as UTF-8 and destroying
 *     non-ASCII bytes.
 *   - read returns at most 200 lines per call and requires an explicit offset.
 *   - Scaleway Generative APIs is available as a provider.
 *   - --list-providers prints provider ids as JSON, for the IDE pickers.
 *   - a tool returning the same result 15x in one run stops the run, instead of
 *     spinning until a host kills the process.
 *   - the base system-prompt context (host awareness, no-project notice,
 *     README fallback) and the default tool set (adds grep/find/ls to pi's
 *     own read/bash/edit/write). Neither is company- or product-specific, so
 *     both live here rather than in pi-label_intern, which every product
 *     variant except one does not even load.
 *
 * What it deliberately does NOT contain: anything needing pi internals that
 * extensions cannot reach (settings persistence, config-dir layout, product
 * branding). Those live as patches in the consuming repo — see README.
 *
 * Flags:
 *   --host <name>   where the agent runs, e.g. "Visual Studio 2022". Empty
 *                   means an ordinary terminal session.
 *   --no-project    the host has no project open: no tools, German notice.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerSessionContext } from "./context.ts";
import { registerListProviders } from "./list-providers.ts";
import { registerLoopBreaker } from "./loop-breaker.ts";
import { registerScaleway } from "./providers/scaleway.ts";
import { createEncodingEditTool, createEncodingReadTool, createEncodingWriteTool } from "./tools/file-tools.ts";
import { createReadImageTool } from "./tools/image-tool.ts";
import { registerToolSelection } from "./tools.ts";

export default function piImproved(pi: ExtensionAPI, ctx?: ExtensionContext) {
	const cwd = ctx?.cwd ?? process.cwd();

	// Override the built-ins by registering tools with the same names.
	pi.registerTool(createEncodingReadTool(cwd));
	pi.registerTool(createEncodingEditTool(cwd));
	pi.registerTool(createEncodingWriteTool(cwd));
	pi.registerTool(createReadImageTool(cwd));

	registerScaleway(pi);
	registerListProviders(pi);
	registerLoopBreaker(pi);

	pi.registerFlag("host", {
		type: "string",
		default: "",
		description: 'Name of the host application the agent runs in (e.g. "Visual Studio 2022").',
	});
	pi.registerFlag("no-project", {
		type: "boolean",
		default: false,
		description:
			"The host has no project open: disable every tool and say so in the system prompt. " +
			"A terminal session always has a working directory and should not pass this.",
	});

	// Flag values are applied after extension factories run, so they must be
	// read from a hook — never from this function body.
	const host = () => String(pi.getFlag("host") ?? "");
	const noProject = () => pi.getFlag("no-project") === true;

	registerSessionContext(pi, { host, noProject });
	registerToolSelection(pi, { noProject });
}
