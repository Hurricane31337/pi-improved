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
 *
 * What it deliberately does NOT contain: anything needing pi internals that
 * extensions cannot reach (settings persistence, config-dir layout, product
 * branding). Those live as patches in the consuming repo — see README.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerListProviders } from "./list-providers.ts";
import { registerLoopBreaker } from "./loop-breaker.ts";
import { registerScaleway } from "./providers/scaleway.ts";
import { createEncodingEditTool, createEncodingReadTool, createEncodingWriteTool } from "./tools/file-tools.ts";

export default function piImproved(pi: ExtensionAPI, ctx?: ExtensionContext) {
	const cwd = ctx?.cwd ?? process.cwd();

	// Override the built-ins by registering tools with the same names.
	pi.registerTool(createEncodingReadTool(cwd));
	pi.registerTool(createEncodingEditTool(cwd));
	pi.registerTool(createEncodingWriteTool(cwd));

	registerScaleway(pi);
	registerListProviders(pi);
	registerLoopBreaker(pi);
}
