/**
 * read_image: show the model an image file (Screenshot 2026-09-30 100840.png).
 *
 * Reuses pi's own read tool for everything that matters — decoding, downscaling
 * to what the model accepts, the "current model has no vision" note — by handing
 * its factory an `operations` object that knows how to detect an image. This
 * tool only narrows it to images (a text file is refused with a pointer to
 * `read`) and gives it its own name, so a model looking for "look at this
 * screenshot" finds a tool for exactly that instead of a text reader with a
 * paragraph about images in its description.
 *
 * The plain `read` tool here deliberately stays text-only (see file-tools.ts):
 * its operations never detected images, so an image used to come back as the
 * bytes of a PNG read as text.
 */

import { constants } from "node:fs";
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
	createReadToolDefinition,
	detectSupportedImageMimeTypeFromFile,
	type ReadOperations,
	type ReadToolDetails,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

const imageOperations: ReadOperations = {
	readFile: (path) => fsReadFile(path),
	access: (path) => fsAccess(path, constants.R_OK),
	detectImageMimeType: detectSupportedImageMimeTypeFromFile,
};

const readImageSchema = Type.Object({
	path: Type.String({
		description:
			"Path of the image file (relative to the working directory, or absolute). png, jpg, gif, webp or bmp.",
	}),
});

type ReadImageTool = ToolDefinition<typeof readImageSchema, ReadToolDetails | undefined>;

export function createReadImageTool(cwd: string): ReadImageTool {
	const base = createReadToolDefinition(cwd, { operations: imageOperations });
	const baseExecute = base.execute.bind(base);

	return {
		name: "read_image",
		label: "read_image",
		description:
			"Look at an image file: screenshots, photos, diagrams, exported forms (png, jpg, gif, webp, bmp). " +
			"The image is sent to you as an attachment, scaled down if it is large. " +
			"Only for image files on disk: an image the user attached to their message is already visible to you " +
			"and has no file path, so do not look for it. " +
			"Use read for text files — this tool refuses anything that is not an image.",
		promptSnippet: "read_image: look at an image file (png, jpg, gif, webp, bmp)",
		promptGuidelines: [
			"To look at a screenshot or any other image file on disk, use read_image. read is for text files only.",
			"An image attached to the user's message is part of that message: you can already see it, it has no file path, " +
				"and you must not search the project for it or call read_image for it.",
		],
		parameters: readImageSchema,
		executionMode: "parallel",
		execute: async (toolCallId, input, signal, onUpdate, ctx) => {
			const { path } = input as Static<typeof readImageSchema>;
			const absolute = isAbsolute(path) ? path : resolve(ctx?.cwd ?? cwd, path);

			// Check before delegating: pi's read would otherwise fall through to
			// reading the file as text and return its bytes.
			await imageOperations.access(absolute);
			if (!(await detectSupportedImageMimeTypeFromFile(absolute))) {
				throw new Error(
					`"${path}" is not an image pi can show (png, jpg, gif, webp, bmp). Use read for text files.`,
				);
			}
			return baseExecute(toolCallId, { path }, signal, onUpdate, ctx);
		},
	};
}
