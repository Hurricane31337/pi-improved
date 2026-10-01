import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it } from "vitest";
import { PRODUCT_TOOLS, registerToolSelection, resolveProductTools, toolsChosenOnCommandLine } from "../src/tools.js";

const ALL_TOOLS = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"];

/** Captures what the extension would set as the active tool list. */
function harness(options: { noProject?: boolean; argv?: string[]; available?: string[]; active?: string[] } = {}) {
	let handler: (() => Promise<void>) | undefined;
	let active: string[] | undefined;

	const api = {
		on: (_event: string, fn: () => Promise<void>) => {
			handler = fn;
		},
		getAllTools: () => (options.available ?? ALL_TOOLS).map((name) => ({ name })),
		getActiveTools: () => options.active ?? ["read", "bash", "edit", "write"],
		setActiveTools: (names: string[]) => {
			active = names;
		},
	} as unknown as ExtensionAPI;

	registerToolSelection(api, {
		noProject: () => options.noProject ?? false,
		argv: options.argv ?? ["node", "pi"],
	});
	if (!handler) throw new Error("no session_start handler registered");
	const start = handler;

	return {
		run: async () => {
			await start();
			return active;
		},
	};
}

let session: ReturnType<typeof harness>;

beforeEach(() => {
	session = harness();
});

describe("tool selection", () => {
	it("activates the default tool set for a plain `pi`", async () => {
		expect(await session.run()).toEqual([...PRODUCT_TOOLS]);
	});

	it("keeps tools other extensions already activated", async () => {
		const active = await harness({ active: ["read", "bash", "edit", "write", "vs_build"] }).run();
		expect(active).toEqual([...PRODUCT_TOOLS, "vs_build"]);
	});

	it("includes the tools pi leaves off by default", async () => {
		const active = (await session.run()) ?? [];
		for (const tool of ["grep", "find", "ls"]) expect(active).toContain(tool);
	});

	it("does not activate tools this session does not have", async () => {
		const active = await harness({ available: ["read", "write", "edit", "bash"] }).run();
		expect(active).toEqual(["read", "write", "edit", "bash"]);
	});

	it("never activates a tool that is not in the default set", async () => {
		expect(await session.run()).not.toContain("powershell");
	});

	it("leaves the session alone when the command line chose the tools", async () => {
		for (const flag of [
			["--tools", "read"],
			["-t", "read"],
			["--no-tools"],
			["-nt"],
			["--no-builtin-tools"],
			["-nbt"],
			["--exclude-tools", "bash"],
			["-xt", "bash"],
		]) {
			expect(await harness({ argv: ["node", "pi", ...flag] }).run()).toBeUndefined();
		}
	});

	it("disables every tool with --no-project, even if the command line chose tools", async () => {
		expect(await harness({ noProject: true }).run()).toEqual([]);
		expect(await harness({ noProject: true, argv: ["node", "pi", "--tools", "read"] }).run()).toEqual([]);
	});
});

describe("helpers", () => {
	it("detects tool flags anywhere in argv", () => {
		expect(toolsChosenOnCommandLine(["node", "pi", "--host", "VS", "--tools", "read"])).toBe(true);
		expect(toolsChosenOnCommandLine(["node", "pi", "--host", "VS"])).toBe(false);
		// Not a tool flag, and must not be mistaken for one.
		expect(toolsChosenOnCommandLine(["node", "pi", "--no-project"])).toBe(false);
	});

	it("keeps the product order when filtering", () => {
		expect(resolveProductTools(["ls", "read", "bash"])).toEqual(["read", "ls", "bash"]);
	});
});
