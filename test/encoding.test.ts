import { describe, expect, it } from "vitest";
import { decodeBuffer, detectEncoding, encodeBuffer, transcodeToUtf8 } from "../src/encoding.js";

const cp1252 = (s: string) => Buffer.from(s, "latin1");
const utf8 = (s: string) => Buffer.from(s, "utf8");
const withBom = (s: string) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, "utf8")]);

describe("detectEncoding", () => {
	it("detects plain ASCII as utf8", () => {
		expect(detectEncoding(utf8("plain ascii\n"))).toBe("utf8");
	});

	it("detects a UTF-8 BOM", () => {
		expect(detectEncoding(withBom("Grüße"))).toBe("utf8bom");
	});

	it("detects multi-byte UTF-8", () => {
		expect(detectEncoding(utf8("Grüße aus München"))).toBe("utf8");
		expect(detectEncoding(utf8("日本語"))).toBe("utf8");
		expect(detectEncoding(utf8("emoji 😀"))).toBe("utf8");
	});

	it("falls back to latin1 for bytes that are not valid UTF-8", () => {
		expect(detectEncoding(cp1252("Grüße aus München"))).toBe("latin1");
	});

	it("handles an empty buffer", () => {
		expect(detectEncoding(Buffer.alloc(0))).toBe("utf8");
	});

	it("does not mistake a truncated multi-byte sequence for UTF-8", () => {
		// Leading byte of a 2-byte sequence with the continuation byte missing.
		expect(detectEncoding(Buffer.from([0x41, 0xc3]))).toBe("latin1");
	});
});

describe("decode/encode round trip", () => {
	it("round-trips Windows-1252 without loss", () => {
		const original = cp1252("Grüße aus München\r\nStraße\r\n");
		const { text, encoding } = decodeBuffer(original);
		expect(encoding).toBe("latin1");
		expect(text).toBe("Grüße aus München\r\nStraße\r\n");
		expect(encodeBuffer(text, encoding).equals(original)).toBe(true);
	});

	it("round-trips UTF-8 with BOM, preserving the BOM", () => {
		const original = withBom("Grüße");
		const { text, encoding } = decodeBuffer(original);
		expect(encoding).toBe("utf8bom");
		expect(text).toBe("Grüße"); // BOM stripped from the text
		expect(encodeBuffer(text, encoding).equals(original)).toBe(true);
	});

	it("round-trips plain UTF-8", () => {
		const original = utf8("Grüße aus München");
		const { text, encoding } = decodeBuffer(original);
		expect(encoding).toBe("utf8");
		expect(encodeBuffer(text, encoding).equals(original)).toBe(true);
	});
});

describe("transcodeToUtf8", () => {
	it("converts Windows-1252 so a UTF-8 reader sees the right text", () => {
		// This is the regression that motivated the whole extension: plain pi
		// decodes these bytes as UTF-8 and produces U+FFFD replacement chars.
		const raw = cp1252("Grüße aus München");
		expect(raw.toString("utf8")).toContain("�");
		expect(transcodeToUtf8(raw).toString("utf8")).toBe("Grüße aus München");
	});

	it("leaves UTF-8 untouched", () => {
		const raw = utf8("Grüße");
		expect(transcodeToUtf8(raw).equals(raw)).toBe(true);
	});

	it("strips the BOM so it cannot leak into matched text", () => {
		expect(transcodeToUtf8(withBom("Grüße")).toString("utf8")).toBe("Grüße");
	});

	it("is lossless end to end for a cp1252 edit round trip", () => {
		const original = cp1252("Grüße\r\nStraße\r\n");
		// read: tool sees clean UTF-8
		const seen = transcodeToUtf8(original).toString("utf8");
		// edit: tool rewrites some text and hands back UTF-8
		const edited = seen.replace("Straße", "Strasse");
		// write: encoded back into the file's original encoding
		const written = encodeBuffer(edited, detectEncoding(original));
		expect(written.toString("latin1")).toBe("Grüße\r\nStrasse\r\n");
		expect(written.toString("latin1")).not.toContain("�");
	});
});
