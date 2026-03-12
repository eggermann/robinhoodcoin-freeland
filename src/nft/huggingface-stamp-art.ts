import fs from "node:fs";
import path from "node:path";
import { HUGGINGFACE } from "../shared/config.js";

export interface HuggingFaceStampArtInput {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  outputPath?: string;
  slug?: string;
  width?: number;
  height?: number;
}

export interface HuggingFaceStampArtResult {
  model: string;
  prompt: string;
  negativePrompt?: string;
  outputPath: string;
  manifestPath: string;
  contentType: string;
  byteLength: number;
  generatedAt: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function resolveOutputPath(input: HuggingFaceStampArtInput): string {
  if (input.outputPath?.trim()) {
    return path.resolve(input.outputPath);
  }

  const slug = slugify(input.slug ?? "freeland-stamp") || `freeland-stamp-${Date.now()}`;
  return path.resolve(HUGGINGFACE.outputDir, `${slug}.png`);
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("jpeg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  return ".png";
}

async function requestImageBuffer(input: HuggingFaceStampArtInput): Promise<{
  buffer: Buffer;
  contentType: string;
  model: string;
}> {
  if (!HUGGINGFACE.apiKey.trim()) {
    throw new Error("Missing HUGGINGFACE_API_KEY or HF_TOKEN.");
  }

  const model = input.model?.trim() || HUGGINGFACE.textToImageModel;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HUGGINGFACE.timeoutMs);

  try {
    const response = await fetch(
      `${HUGGINGFACE.baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUGGINGFACE.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: input.prompt,
          parameters: {
            negative_prompt: input.negativePrompt,
            width: input.width ?? HUGGINGFACE.width,
            height: input.height ?? HUGGINGFACE.height,
          },
          options: {
            wait_for_model: true,
            use_cache: false,
          },
        }),
        signal: controller.signal,
      },
    );

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!response.ok) {
      const errorBody = contentType.includes("application/json")
        ? JSON.stringify(await response.json())
        : await response.text();
      throw new Error(`Hugging Face image generation failed (${response.status}): ${errorBody}`);
    }

    const payload = Buffer.from(await response.arrayBuffer());
    return {
      buffer: payload,
      contentType,
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateHuggingFaceStampArt(
  input: HuggingFaceStampArtInput,
): Promise<HuggingFaceStampArtResult> {
  const { buffer, contentType, model } = await requestImageBuffer(input);
  const generatedAt = new Date().toISOString();
  const requestedOutputPath = resolveOutputPath(input);
  const outputPath = requestedOutputPath.replace(/\.[a-z0-9]+$/i, extensionFromContentType(contentType));
  const manifestPath = outputPath.replace(/\.[a-z0-9]+$/i, ".json");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt,
        model,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        outputPath,
        contentType,
        byteLength: buffer.byteLength,
      },
      null,
      2,
    ),
    "utf-8",
  );

  return {
    model,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    outputPath,
    manifestPath,
    contentType,
    byteLength: buffer.byteLength,
    generatedAt,
  };
}
