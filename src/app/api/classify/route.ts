import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { validateImageFile } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const product = (formData.get("product") as string) || "";
    const shotType = (formData.get("shotType") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    const validationError = validateImageFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mime = file.type || "image/png";

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Name this product image for file storage. ${product ? `Product: ${product}.` : ""} ${shotType ? `Shot type: ${shotType}.` : ""}
Reply with ONLY a short filename-safe label (lowercase, hyphens, no extension). Include: product type, main color, and angle/view if obvious. Examples: "black-boardshorts-front", "red-trucker-hat-side", "blue-rashguard-back", "wood-surfboard-detail". Keep it under 6 words.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}`, detail: "low" },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const label = raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "product";

    return NextResponse.json({ label });
  } catch (err) {
    console.error("Classify error:", err);
    return NextResponse.json({ label: "product" });
  }
}
