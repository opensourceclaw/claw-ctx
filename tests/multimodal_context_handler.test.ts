import { describe, it, expect } from "vitest";
import {
  MultimodalContextHandler,
  type MultimodalContent,
} from "../src/multimodal_context_handler";

describe("MultimodalContextHandler", () => {
  // ── detectType ───────────────────────────────────────────────────

  describe("detectType", () => {
    it("detects image by extension", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.detectType("https://example.com/photo.png")).toBe("image");
    });

    it("detects data URI image", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.detectType("data:image/png;base64,iVBORw0KGgo")).toBe("image");
    });

    it("detects audio by extension", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.detectType("audio.mp3")).toBe("audio");
    });

    it("detects video by extension", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.detectType("video.mp4")).toBe("video");
    });

    it("returns null for plain text", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.detectType("hello.txt")).toBeNull();
    });
  });

  // ── extractMultimodalContent ─────────────────────────────────────

  describe("extractMultimodalContent", () => {
    it("extracts image URL from message", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.extractMultimodalContent({
        role: "user",
        content: "Look at this: https://example.com/photo.png",
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe("image");
    });

    it("extracts base64 image", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.extractMultimodalContent({
        role: "user",
        content: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe("image");
    });

    it("extracts markdown image syntax", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.extractMultimodalContent({
        role: "user",
        content: "![diagram](https://example.com/arch.png)",
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe("image");
    });

    it("extracts multiple content types", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.extractMultimodalContent({
        role: "user",
        content: "Image: https://a.com/img.png Audio: https://b.com/sound.mp3",
      });
      expect(result.length).toBe(2);
    });

    it("returns empty for plain text", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.extractMultimodalContent({
        role: "user",
        content: "hello world",
      });
      expect(result).toHaveLength(0);
    });
  });

  // ── describeImage ────────────────────────────────────────────────

  describe("describeImage", () => {
    it("describes data URI image", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.describeImage("data:image/png;base64,AAAA");
      expect(result).toContain("[Image:");
    });

    it("describes URL image", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.describeImage("https://example.com/photo.jpg");
      expect(result).toContain("[Image URL:");
    });
  });

  // ── compressVisualTokens ─────────────────────────────────────────

  describe("compressVisualTokens", () => {
    it("reduces token count by ratio", () => {
      const handler = new MultimodalContextHandler();
      const tokens = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const compressed = handler.compressVisualTokens(tokens, 0.5);
      expect(compressed.length).toBeLessThan(tokens.length);
    });

    it("returns all tokens when ratio is 1", () => {
      const handler = new MultimodalContextHandler();
      const tokens = [1, 2, 3, 4, 5];
      expect(handler.compressVisualTokens(tokens, 1)).toEqual(tokens);
    });

    it("returns empty for empty input", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.compressVisualTokens([], 0.5)).toHaveLength(0);
    });
  });

  // ── modalityToText ───────────────────────────────────────────────

  describe("modalityToText", () => {
    it("converts image content to text", () => {
      const handler = new MultimodalContextHandler();
      const result = handler.modalityToText({
        type: "image",
        url: "https://example.com/photo.jpg",
        description: "[Image: photo.jpg]",
      });
      expect(result).toContain("[Image:");
    });

    it("returns empty for null content", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.modalityToText(null as unknown as MultimodalContent)).toBe("");
    });
  });

  // ── prioritize ───────────────────────────────────────────────────

  describe("prioritize", () => {
    it("sorts images before audio/video", () => {
      const handler = new MultimodalContextHandler();
      const msgs = [
        { role: "user", content: "https://example.com/audio.mp3 and https://example.com/photo.png" },
      ];
      const result = handler.prioritize(msgs);
      expect(result.length).toBe(2);
      expect(result[0].type).toBe("image"); // images first
    });
  });

  // ── config ───────────────────────────────────────────────────────

  describe("config", () => {
    it("uses defaults", () => {
      const handler = new MultimodalContextHandler();
      expect(handler.config.maxDescriptionLength).toBe(500);
      expect(handler.config.imageCompressionRatio).toBe(0.5);
    });
  });
});
