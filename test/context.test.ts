import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_README_CHARS, NO_PROJECT_NOTICE, readmeFallback, registerSessionContext } from "../src/context.js";

type Handler = (
	event: { systemPrompt: string; systemPromptOptions?: { contextFiles?: { path: string }[] } },
	ctx: { cwd: string },
) => Promise<{ systemPrompt?: string } | undefined>;

function harness(cwd: string, options: { host?: string; noProject?: boolean } = {}) {
	let handler: Handler | undefined;
	const api = {
		on: (_event: string, fn: Handler) => {
			handler = fn;
		},
	} as unknown as ExtensionAPI;

	registerSessionContext(api, {
		host: () => options.host ?? "",
		noProject: () => options.noProject ?? false,
	});
	if (!handler) throw new Error("no before_agent_start handler registered");
	const call = handler;

	return (contextFiles?: { path: string }[]) =>
		call({ systemPrompt: "PI BASE PROMPT", systemPromptOptions: { contextFiles } }, { cwd });
}

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "pi-improved-context-"));
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("system prompt", () => {
	it("appends to pi's prompt rather than replacing it", async () => {
		const result = await harness(cwd)();
		expect(result?.systemPrompt?.startsWith("PI BASE PROMPT")).toBe(true);
		expect(result?.systemPrompt).toContain("respond in the same language");
	});

	it("names the host when the flag is set", async () => {
		expect((await harness(cwd, { host: "Visual Studio 2022" })())?.systemPrompt).toContain(
			"embedded in Visual Studio 2022",
		);
	});

	it("says where the repository is, and nothing about an IDE or a company, without a host", async () => {
		const prompt = (await harness(cwd)())?.systemPrompt ?? "";
		expect(prompt).toContain(cwd);
		expect(prompt).not.toContain("Visual Studio");
		expect(prompt).not.toContain("embedded in");
	});

	it("puts the no-project notice ahead of everything else it adds", async () => {
		const prompt = (await harness(cwd, { noProject: true })())?.systemPrompt ?? "";
		expect(prompt).toContain(NO_PROJECT_NOTICE);
		expect(prompt.indexOf(NO_PROJECT_NOTICE)).toBeLessThan(prompt.indexOf("AI coding assistant"));
	});
});

describe("README fallback", () => {
	it("inlines README.md only when pi loaded no context file", async () => {
		writeFileSync(join(cwd, "README.md"), "# Internal repo\nBuild with msbuild.\n", "utf8");

		expect((await harness(cwd)())?.systemPrompt).toContain("Build with msbuild.");
		expect((await harness(cwd)([{ path: "AGENTS.md" }]))?.systemPrompt).not.toContain("Build with msbuild.");
	});

	it("is skipped with no project open", async () => {
		writeFileSync(join(cwd, "README.md"), "# Internal repo\n", "utf8");
		expect((await harness(cwd, { noProject: true })())?.systemPrompt).not.toContain("Internal repo");
	});

	it("ignores a missing or empty README", () => {
		expect(readmeFallback(cwd, [])).toBeNull();
		writeFileSync(join(cwd, "README.md"), "   \n", "utf8");
		expect(readmeFallback(cwd, [])).toBeNull();
	});

	it("caps a huge README instead of inlining all of it", () => {
		writeFileSync(join(cwd, "README.md"), "x".repeat(MAX_README_CHARS + 500), "utf8");
		const content = readmeFallback(cwd, []) ?? "";
		expect(content.length).toBeLessThan(MAX_README_CHARS + 100);
		expect(content).toContain("[README truncated]");
	});
});
