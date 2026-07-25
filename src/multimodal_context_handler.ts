/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 OpenSourceClaw Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * claw-ctx v4.18.0 — Multimodal Context Handler
 *
 * Detects and processes multimodal content (image/audio/video) in messages,
 * converting non-text modalities to text descriptions for LLM context injection.
 */

export type ModalType = "text" | "image" | "audio" | "video";

export interface MultimodalContent {
  type: ModalType;
  url?: string;
  data?: Buffer;
  description?: string;
  tokens?: number;
}

export interface MultimodalConfig {
  supportedModalities: ModalType[];
  maxDescriptionLength: number;
  imageCompressionRatio: number;
  audioTranscriptionEnabled: boolean;
}

interface Message {
  role: string;
  content: string;
}

export const DEFAULT_MULTIMODAL_CONFIG: MultimodalConfig = {
  supportedModalities: ["text", "image", "audio", "video"],
  maxDescriptionLength: 500,
  imageCompressionRatio: 0.5,
  audioTranscriptionEnabled: true,
};

// ── Security: Input length limits to prevent ReDoS attacks ───────────────
const MAX_INPUT_LENGTH = 10000; // 10KB limit for text input processing

function isInputTooLong(text: string): boolean {
  return text.length > MAX_INPUT_LENGTH;
}

// ── Detection patterns ───────────────────────────────────────────────

const IMAGE_URL_PATTERN = /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?[^\s]{0,200})?$/i;
const IMAGE_DATA_PATTERN = /data:image\/(png|jpeg|gif|webp);base64,/i;
const AUDIO_URL_PATTERN = /\.(mp3|wav|ogg|flac|aac|m4a)(\?[^\s]{0,200})?$/i;
const VIDEO_URL_PATTERN = /\.(mp4|webm|avi|mov|mkv)(\?[^\s]{0,200})?$/i;
const IMG_TAG_PATTERN = /!\[[^\]]{0,200}\]\(([^)]{0,500})\)/g;

// ── MultimodalContextHandler ──────────────────────────────────────────

export class MultimodalContextHandler {
  config: MultimodalConfig;

  constructor(config?: Partial<MultimodalConfig>) {
    this.config = { ...DEFAULT_MULTIMODAL_CONFIG, ...config };
  }

  /** Detect modal type from a URL or data URI. */
  detectType(input: string): ModalType | null {
    if (!input?.trim()) return null;

    if (IMAGE_DATA_PATTERN.test(input)) return "image";
    if (IMAGE_URL_PATTERN.test(input)) return "image";
    if (AUDIO_URL_PATTERN.test(input)) return "audio";
    if (VIDEO_URL_PATTERN.test(input)) return "video";

    return null;
  }

  /** Extract multimodal content references from a message. */
  extractMultimodalContent(message: Message): MultimodalContent[] {
    const results: MultimodalContent[] = [];
    if (!message?.content) return results;

    const text = message.content;

    // Security: Prevent ReDoS attacks by limiting input length
    if (isInputTooLong(text)) {
      // Truncate for safety
      const truncated = text.substring(0, MAX_INPUT_LENGTH);
      return this.extractMultimodalContent({ ...message, content: truncated });
    }

    // Check for data URI images
    const dataMatch = text.match(IMAGE_DATA_PATTERN);
    if (dataMatch) {
      results.push({
        type: "image",
        description: `[Image: ${dataMatch[1].toUpperCase()} format, base64 encoded]`,
        tokens: Math.ceil(text.length * this.config.imageCompressionRatio),
      });
    }

    // Check for image URLs
    const urlMatches = text.match(/\bhttps?:\/\/\S+/gi) || [];
    for (const url of urlMatches) {
      const cleanUrl = url.replace(/[.,;)\]}>"']+$/, "");
      if (IMAGE_URL_PATTERN.test(cleanUrl)) {
        const filename = cleanUrl.split("/").pop() || "image";
        results.push({
          type: "image",
          url: cleanUrl,
          description: `[Image URL: ${filename}]`,
        });
      } else if (AUDIO_URL_PATTERN.test(cleanUrl)) {
        results.push({
          type: "audio",
          url: cleanUrl,
          description: `[Audio: ${cleanUrl.split("/").pop()}]`,
        });
      } else if (VIDEO_URL_PATTERN.test(cleanUrl)) {
        results.push({
          type: "video",
          url: cleanUrl,
          description: `[Video: ${cleanUrl.split("/").pop()}]`,
        });
      }
    }

    // Check for markdown image syntax
    IMG_TAG_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMG_TAG_PATTERN.exec(text)) !== null) {
      results.push({
        type: "image",
        url: match[1],
        description: `[Image: ${match[1].split("/").pop() || "embedded"}]`,
      });
    }

    return results;
  }

  /** Generate a text description for an image (rule-based fallback). */
  describeImage(_image: Buffer | string): string {
    if (typeof _image === "string") {
      if (_image.startsWith("data:")) {
        const format = _image.match(/data:image\/(\w+);/) || [];
        return `[Image: ${format[1] || "unknown"} format, base64 encoded, length ${_image.length}]`;
      }
      if (_image.startsWith("http")) {
        const filename = _image.split("/").pop() || "image";
        return `[Image URL: ${filename} — visual content not directly accessible as text]`;
      }
    }
    return `[Image data: ${typeof _image === "object" ? "buffer" : "unknown"}]`;
  }

  /** Generate a text description for audio content. */
  transcribeAudio(_audio: Buffer): string {
    return `[Audio content: ${_audio.length} bytes — transcription not available without speech-to-text API]`;
  }

  /** Compress visual token representations. */
  compressVisualTokens(tokens: number[], ratio: number): number[] {
    if (!tokens?.length) return [];
    const r = ratio || this.config.imageCompressionRatio;
    if (r >= 1) return [...tokens];

    // Uniform sampling for token compression
    const step = Math.ceil(1 / r);
    const result: number[] = [];
    for (let i = 0; i < tokens.length; i += step) {
      result.push(tokens[i]);
    }
    return result;
  }

  /** Convert multimodal content to a text description for context injection. */
  modalityToText(content: MultimodalContent): string {
    if (!content) return "";

    if (content.description) return content.description;

    switch (content.type) {
      case "image":
        return content.url
          ? `[Image reference: ${content.url}]`
          : "[Image content embedded in message]";
      case "audio":
        return content.url
          ? `[Audio reference: ${content.url}]`
          : "[Audio content embedded in message]";
      case "video":
        return content.url
          ? `[Video reference: ${content.url}]`
          : "[Video content embedded in message]";
      default:
        return "[Multimodal content]";
    }
  }

  /** Prioritize multimodal content for context injection. */
  prioritize(messages: Message[]): MultimodalContent[] {
    const all: MultimodalContent[] = [];

    for (const msg of messages) {
      const extracted = this.extractMultimodalContent(msg);
      all.push(...extracted);
    }

    // Priority: images first (highest information density), then audio, then video
    const order: Record<ModalType, number> = { image: 0, audio: 1, video: 2, text: 3 };
    return all.sort((a, b) => order[a.type] - order[b.type]);
  }
}
