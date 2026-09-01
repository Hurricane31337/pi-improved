/**
 * Encoding-preserving read / edit / write, plus the read pagination limit.
 *
 * Every tool here is pi's own built-in, reused through its exported factory.
 * We only supply different `operations` (and, for read, a tighter schema), so
 * the tool logic, result shapes and renderers all stay pi's. That keeps the
 * delta against upstream tiny and means a pi upgrade cannot silently drop a
 * behaviour we reimplemented.
 */

import { constants } from "node:fs";
import {
	access as fsAccess,
	mkdir as fsMkdir,
	readFile as fsReadFile,
	writeFile as fsWriteFile,
} from "node:fs/promises";
import {
	createEditToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type EditOperations,
	type ReadOperations,
	type ReadToolDetails,
	type ToolDefinition,
	type WriteOperations,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { detectEncoding, encodeBuffer, transcodeToUtf8 } from "../encoding.ts";

/** Tool shapes, taken from pi so they track upstream instead of being restated. */
type BaseReadTool = ReturnType<typeof createReadToolDefinition>;
type BaseReadInput = Parameters<BaseReadTool["execute"]>[1];
type EditTool = ReturnType<typeof createEditToolDefinition>;
type WriteTool = ReturnType<typeof createWriteToolDefinition>;

/**
 * Our read keeps pi's result/details shape but narrows the parameters (offset
 * becomes required), so the schema — not pi's — parameterises the definition.
 */
type ReadTool = ToolDefinition<typeof readSchema, ReadToolDetails | undefined>;

/** Maximum number of lines the read tool returns per call. */
export const MAX_READ_LINES = 200;

/**
 * Detect the encoding a file is currently stored in, so a write can preserve it.
 * A file that does not exist yet is new and gets UTF-8.
 */
async function targetEncoding(path: string) {
	try {
		return detectEncoding(await fsReadFile(path));
	} catch {
		return "utf8" as const;
	}
}

const readOperations: ReadOperations = {
	readFile: async (path) => transcodeToUtf8(await fsReadFile(path)),
	access: (path) => fsAccess(path, constants.R_OK),
};

const editOperations: EditOperations = {
	readFile: async (path) => transcodeToUtf8(await fsReadFile(path)),
	// The tool hands back UTF-8 text; the file on disk is still untouched at this
	// point, so its current encoding is the one to preserve.
	writeFile: async (path, content) => {
		await fsWriteFile(path, encodeBuffer(content, await targetEncoding(path)));
	},
	access: (path) => fsAccess(path, constants.R_OK | constants.W_OK),
};

const writeOperations: WriteOperations = {
	writeFile: async (path, content) => {
		await fsWriteFile(path, encodeBuffer(content, await targetEncoding(path)));
	},
	mkdir: async (dir) => {
		await fsMkdir(dir, { recursive: true });
	},
};

/**
 * read with a hard per-call line budget and a mandatory offset.
 *
 * Plain pi allows up to 2000 lines and an optional offset, which lets a model
 * pull an entire file into context in one call and lose track of where it is.
 * Requiring the offset makes every read state its position, and clamping the
 * limit forces deliberate pagination.
 *
 * The cap is enforced by clamping `limit` before delegating, so pi's own
 * truncation, continuation notices and renderer keep working unchanged.
 */
const readSchema = Type.Object({
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Number({
		description: "The line number to start reading from (1-indexed). Use 1 to read from the beginning.",
	}),
	limit: Type.Optional(Type.Number({ description: `The number of lines to read (maximum ${MAX_READ_LINES}).` })),
});

type ReadInput = Static<typeof readSchema>;

export function createEncodingReadTool(cwd: string): ReadTool {
	const base = createReadToolDefinition(cwd, { operations: readOperations });
	const baseExecute = base.execute.bind(base);

	return {
		...base,
		description:
			`Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp). ` +
			`Images are sent as attachments. For text files, returns at most ${MAX_READ_LINES} lines per call. ` +
			`Always provide offset (1-indexed). Paginate large files: first call offset=1 (reads lines ` +
			`1-${MAX_READ_LINES}), then offset=${MAX_READ_LINES + 1}, and so on. Use grep to locate the ` +
			`relevant section before reading.`,
		parameters: readSchema,
		// pi normalises model-sent arguments here (e.g. file_path -> path). Keep that,
		// then guarantee the offset our schema requires: a model that omits it gets a
		// read from line 1 rather than a hard error, while the description still tells
		// it to paginate explicitly.
		prepareArguments: (args: unknown) => {
			const prepared = (base.prepareArguments?.(args) ?? args) as Partial<ReadInput>;
			return { ...prepared, path: String(prepared.path ?? ""), offset: prepared.offset ?? 1 };
		},
		execute: (toolCallId, input, signal, onUpdate, ctx) => {
			// The base schema types `offset` as optional and `limit` unbounded; ours
			// narrows both, so the input is re-stated for the delegate call.
			const { limit, ...rest } = input as unknown as ReadInput;
			return baseExecute(
				toolCallId,
				{ ...rest, limit: Math.min(limit ?? MAX_READ_LINES, MAX_READ_LINES) } as BaseReadInput,
				signal,
				onUpdate,
				ctx,
			);
		},
	};
}

export function createEncodingEditTool(cwd: string): EditTool {
	return createEditToolDefinition(cwd, { operations: editOperations });
}

export function createEncodingWriteTool(cwd: string): WriteTool {
	return createWriteToolDefinition(cwd, { operations: writeOperations });
}
