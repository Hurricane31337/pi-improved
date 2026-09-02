import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it } from "vitest";
import { LOOP_THRESHOLD, registerLoopBreaker } from "../src/loop-breaker.js";

type BlockResult = { block?: boolean; terminate?: boolean; reason?: string } | undefined;
type Handler = (event: Record<string, unknown>) => Promise<BlockResult>;

/** Captures the handlers the loop breaker subscribes, so a run can be replayed. */
function harness() {
	const handlers = new Map<string, Handler>();
	const api = {
		on: (event: string, fn: Handler) => {
			handlers.set(event, fn);
		},
	} as unknown as ExtensionAPI;
	registerLoopBreaker(api);

	const fire = async (event: string, payload: Record<string, unknown> = {}) => handlers.get(event)?.(payload);

	return {
		startRun: () => fire("agent_start"),
		finish: (toolName: string, text: string) =>
			fire("tool_execution_end", { toolName, result: { content: [{ type: "text", text }] } }),
		call: (toolName: string) => fire("tool_call", { toolName }) as Promise<BlockResult>,
	};
}

let run: ReturnType<typeof harness>;

beforeEach(() => {
	run = harness();
});

describe("loop breaker", () => {
	it("allows repeated calls below the threshold", async () => {
		for (let i = 0; i < LOOP_THRESHOLD - 1; i++) await run.finish("read", "same output");
		expect(await run.call("read")).toBeUndefined();
	});

	it("blocks and terminates once a tool repeats one result too often", async () => {
		for (let i = 0; i < LOOP_THRESHOLD; i++) await run.finish("read", "same output");

		const result = await run.call("read");
		expect(result?.block).toBe(true);
		expect(result?.terminate).toBe(true);
		expect(result?.reason).toContain("Loop detected");
	});

	it("counts per tool and per result, not per call", async () => {
		for (let i = 0; i < LOOP_THRESHOLD; i++) await run.finish("read", `output ${i}`);
		expect(await run.call("read")).toBeUndefined();

		for (let i = 0; i < LOOP_THRESHOLD; i++) await run.finish("grep", "same output");
		expect(await run.call("read")).toBeUndefined();
		expect((await run.call("grep"))?.block).toBe(true);
	});

	it("ignores results without text content", async () => {
		for (let i = 0; i < LOOP_THRESHOLD; i++) await run.finish("read", "");
		expect(await run.call("read")).toBeUndefined();
	});

	it("starts counting again on the next agent run", async () => {
		for (let i = 0; i < LOOP_THRESHOLD; i++) await run.finish("read", "same output");
		expect((await run.call("read"))?.block).toBe(true);

		await run.startRun();
		expect(await run.call("read")).toBeUndefined();
	});
});
