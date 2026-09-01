/**
 * Encoding detection and transcoding.
 *
 * Plain pi reads and writes every file as UTF-8. On a Windows codebase that
 * still contains Windows-1252 (Latin-1) sources, a single edit rewrites every
 * non-ASCII byte as U+FFFD, which is lossy and irreversible:
 *
 *   "Grüße"  ->  read as UTF-8  ->  "Gr��e"  ->  written back as UTF-8
 *
 * Rather than reimplement the file tools, the extension feeds pi's own tool
 * factories a set of operations that transcode at the filesystem boundary:
 * reads hand the tool clean UTF-8, writes convert back to the file's original
 * encoding. The tools keep their UTF-8 assumption and stay untouched.
 */

export type FileEncoding = "utf8bom" | "utf8" | "latin1";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Classify a buffer as UTF-8 (with or without BOM) or Windows-1252.
 *
 * Anything that is not well-formed UTF-8 is treated as Latin-1, which cannot
 * fail: every byte sequence is valid Windows-1252. That makes Latin-1 the
 * deliberate fallback rather than a guess.
 */
export function detectEncoding(buf: Buffer): FileEncoding {
	if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
		return "utf8bom";
	}

	let i = 0;
	while (i < buf.length) {
		const b = buf[i];
		if (b <= 0x7f) {
			i++;
			continue;
		}
		if (b >= 0xc2 && b <= 0xdf) {
			if (i + 1 >= buf.length || (buf[i + 1] & 0xc0) !== 0x80) return "latin1";
			i += 2;
			continue;
		}
		if (b >= 0xe0 && b <= 0xef) {
			if (i + 2 >= buf.length || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80) {
				return "latin1";
			}
			i += 3;
			continue;
		}
		if (b >= 0xf0 && b <= 0xf4) {
			if (
				i + 3 >= buf.length ||
				(buf[i + 1] & 0xc0) !== 0x80 ||
				(buf[i + 2] & 0xc0) !== 0x80 ||
				(buf[i + 3] & 0xc0) !== 0x80
			) {
				return "latin1";
			}
			i += 4;
			continue;
		}
		return "latin1";
	}
	return "utf8";
}

/** Decode a buffer to text, stripping a UTF-8 BOM when present. */
export function decodeBuffer(buf: Buffer): { text: string; encoding: FileEncoding } {
	const encoding = detectEncoding(buf);
	if (encoding === "utf8bom") return { text: buf.subarray(3).toString("utf8"), encoding };
	if (encoding === "utf8") return { text: buf.toString("utf8"), encoding };
	return { text: buf.toString("latin1"), encoding };
}

/** Encode text back to bytes in the given encoding, re-adding a BOM if needed. */
export function encodeBuffer(text: string, encoding: FileEncoding): Buffer {
	if (encoding === "utf8bom") return Buffer.concat([UTF8_BOM, Buffer.from(text, "utf8")]);
	if (encoding === "utf8") return Buffer.from(text, "utf8");
	return Buffer.from(text, "latin1");
}

/**
 * Normalise any supported encoding to a plain UTF-8 buffer.
 *
 * This is what lets pi's unmodified tools work: they call `buffer.toString("utf-8")`
 * internally, which is correct once the bytes have been transcoded here.
 */
export function transcodeToUtf8(buf: Buffer): Buffer {
	const { text, encoding } = decodeBuffer(buf);
	return encoding === "utf8" ? buf : Buffer.from(text, "utf8");
}
