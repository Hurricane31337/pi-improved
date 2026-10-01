import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEncodingReadTool } from "../src/tools/file-tools.js";
import { createReadImageTool } from "../src/tools/image-tool.js";

/** A real 1x1 PNG. */
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

let dir: string;
let ctx: ExtensionContext;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "read-image-"));
	writeFileSync(join(dir, "Screenshot 2026-09-30 100840.png"), PNG);
	writeFileSync(join(dir, "notes.txt"), "just text\n", "utf8");
	ctx = { cwd: dir } as ExtensionContext;
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("read_image", () => {
	it("returns an image part for a png with spaces in its name", async () => {
		const tool = createReadImageTool(dir);
		const result = await tool.execute("id", { path: "Screenshot 2026-09-30 100840.png" }, undefined, undefined, ctx);
		const image = result.content.find((part) => part.type === "image");
		expect(image).toBeDefined();
		expect((image as { mimeType: string }).mimeType).toMatch(/^image\//);
	});

	it("refuses a text file and points at read", async () => {
		const tool = createReadImageTool(dir);
		await expect(tool.execute("id", { path: "notes.txt" }, undefined, undefined, ctx)).rejects.toThrow(
			/not an image/,
		);
	});

	it("fails clearly for a missing file", async () => {
		const tool = createReadImageTool(dir);
		await expect(tool.execute("id", { path: "nope.png" }, undefined, undefined, ctx)).rejects.toThrow();
	});
});

describe("read on an image", () => {
	it("says to use read_image instead of returning the bytes as text", async () => {
		const tool = createEncodingReadTool(dir);
		const result = await tool.execute(
			"id",
			{ path: "Screenshot 2026-09-30 100840.png", offset: 1 },
			undefined,
			undefined,
			ctx,
		);
		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("read_image");
		expect(result.content.some((part) => part.type === "image")).toBe(false);
	});

	it("still reads text files", async () => {
		const tool = createEncodingReadTool(dir);
		const result = await tool.execute("id", { path: "notes.txt", offset: 1 }, undefined, undefined, ctx);
		expect((result.content[0] as { text: string }).text).toContain("just text");
	});
});
