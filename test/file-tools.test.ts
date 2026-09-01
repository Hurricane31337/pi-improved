/**
 * Integration tests: these drive pi's real read/edit/write tools (resolved to a
 * pi checkout by vitest.config.ts) with this extension's operations, so they
 * prove the encoding behaviour end to end rather than testing our helpers in
 * isolation. They are skipped when no pi checkout is present.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** The tools take an ExtensionContext; these tests exercise paths that never touch it. */
const NO_CTX = undefined as never;

import {
	createEncodingEditTool,
	createEncodingReadTool,
	createEncodingWriteTool,
	MAX_READ_LINES,
	readSchema,
} from "../src/tools/file-tools.ts";

const hasPi = Boolean(process.env.PI_ROOT);
const suite = hasPi ? describe : describe.skip;

const cp1252 = (s: string) => Buffer.from(s, "latin1");

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}

suite("encoding-aware file tools (against real pi tools)", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-improved-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("reads Windows-1252 without replacement characters", async () => {
		const file = join(dir, "latin1.txt");
		writeFileSync(file, cp1252("Grüße aus München\nStraße\n"));

		const tool = createEncodingReadTool(dir);
		const result = await tool.execute("t1", { path: file, offset: 1 }, undefined, undefined, NO_CTX);
		const out = textOf(result as never);

		expect(out).toContain("Grüße aus München");
		expect(out).toContain("Straße");
		expect(out).not.toContain("�");
	});

	it("edits a Windows-1252 file without corrupting untouched bytes", async () => {
		const file = join(dir, "latin1.txt");
		writeFileSync(file, cp1252("Grüße aus München\r\nStraße\r\n"));

		const tool = createEncodingEditTool(dir);
		await tool.execute(
			"t2",
			{ path: file, edits: [{ oldText: "Straße", newText: "Strasse" }] },
			undefined,
			undefined,
			NO_CTX,
		);

		const after = readFileSync(file);
		// Still Windows-1252, and the umlauts that were never edited survived.
		expect(after.toString("latin1")).toBe("Grüße aus München\r\nStrasse\r\n");
		expect(after.toString("latin1")).not.toContain("�");
	});

	it("preserves a UTF-8 BOM across an edit", async () => {
		const file = join(dir, "bom.txt");
		writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("alpha\nbeta\n", "utf8")]));

		const tool = createEncodingEditTool(dir);
		await tool.execute(
			"t3",
			{ path: file, edits: [{ oldText: "beta", newText: "BETA" }] },
			undefined,
			undefined,
			NO_CTX,
		);

		const after = readFileSync(file);
		expect([...after.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		expect(after.subarray(3).toString("utf8")).toBe("alpha\nBETA\n");
	});

	it("writes new files as UTF-8 but keeps an existing file's encoding", async () => {
		const fresh = join(dir, "fresh.txt");
		const existing = join(dir, "existing.txt");
		writeFileSync(existing, cp1252("Grüße\n"));

		const tool = createEncodingWriteTool(dir);
		await tool.execute("t4", { path: fresh, content: "Grüße\n" }, undefined, undefined, NO_CTX);
		await tool.execute("t5", { path: existing, content: "Grüße München\n" }, undefined, undefined, NO_CTX);

		expect(readFileSync(fresh).toString("utf8")).toBe("Grüße\n");
		expect(readFileSync(existing).toString("latin1")).toBe("Grüße München\n");
	});

	it("caps a read at the line limit even when the model asks for more", async () => {
		const file = join(dir, "big.txt");
		writeFileSync(file, Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n"), "utf8");

		const tool = createEncodingReadTool(dir);
		const result = await tool.execute("t6", { path: file, offset: 1, limit: 999 }, undefined, undefined, NO_CTX);
		const out = textOf(result as never);

		expect(out).toContain("line 1");
		expect(out).toContain(`line ${MAX_READ_LINES}`);
		expect(out).not.toContain(`line ${MAX_READ_LINES + 1}`);
	});

	it("honours offset so pagination reaches later lines", async () => {
		const file = join(dir, "big.txt");
		writeFileSync(file, Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n"), "utf8");

		const tool = createEncodingReadTool(dir);
		const result = await tool.execute("t7", { path: file, offset: MAX_READ_LINES + 1 }, undefined, undefined, NO_CTX);
		const out = textOf(result as never);

		expect(out).toContain(`line ${MAX_READ_LINES + 1}`);
		expect(out).not.toContain("line 1\n");
	});
});

describe("read schema", () => {
	it("marks offset as required so a missing offset is rejected before executing", () => {
		// The point of requiring it: a model that omits the offset would otherwise
		// read lines 1-200 instead of the grep hit at line 10000, burning context.
		// Failing validation costs only the rejected tool call.
		expect(readSchema.required).toContain("offset");
		expect(readSchema.required).toContain("path");
		expect(readSchema.required ?? []).not.toContain("limit");
	});

	it("does not define prepareArguments, which would run before validation", () => {
		const tool = createEncodingReadTool(process.cwd());
		expect(tool.prepareArguments).toBeUndefined();
	});
});
