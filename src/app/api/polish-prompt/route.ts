import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { cleanText, isRecord } from "@/lib/validation";

const SYSTEM_PROMPT = `You are a prompt writer for an AI product photography tool that uses gpt-image-2.
Given a product preset, write ONE cohesive image-generation prompt.

Rules:
- Write a single paragraph, direct and descriptive
- For "product" shot mode: describe a product-only studio shot, no model or person
- For "model" shot mode: describe a model wearing or holding the product in a studio setting
- For "touchup" shot mode: describe cleaning up an existing rough model/product source photo while preserving the same person, pose, product fit, artwork, logo placement, colors, and composition
- For model shots, DO NOT specify crop, framing, face visibility, body area, gender, body type, age group, or model identity; those are runtime settings
- For touch-up shots, NEVER ask to create or replace the model/person; the uploaded source already contains the model/person
- Do NOT specify model gender or body type - those are set at runtime per batch
- Do NOT specify background, studio setup, lighting, or brand rules; those are runtime/global settings
- Include the user's description naturally
- Do NOT add details the user did not specify or imply
- Do NOT use markdown, bullet points, or labels - just a flowing paragraph
- Keep it under 150 words
- The prompt should produce consistent, catalog-quality results across many different products of this type`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const presetName = cleanText(body.presetName, 120);
    const shotMode =
      body.shotMode === "model" || body.shotMode === "product" || body.shotMode === "touchup"
        ? body.shotMode
        : "";
    const framing = cleanText(body.framing, 300);
    const description = cleanText(body.description, 5000);

    if (!presetName || !shotMode) {
      return NextResponse.json({ error: "Missing preset info" }, { status: 400 });
    }

    const lines = [
      `Product type: "${presetName}"`,
      `Shot mode: ${shotMode}`,
    ];
    if (framing) lines.push(`Framing: ${framing}`);
    if (description) lines.push(`Description: ${description}`);
    lines.push("Background: omitted; handled at runtime");
    lines.push("Brand rules: omitted; handled at runtime");

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 250,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: lines.join("\n") },
      ],
    });

    const prompt = response.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ prompt });
  } catch (err) {
    console.error("Polish prompt error:", err);
    const msg = err instanceof Error ? err.message : "Failed to polish prompt";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
