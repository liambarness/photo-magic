import type { Preset } from "@/types";

export function buildFallbackPrompt(
  preset: Preset,
  brandRules: string,
  background: string
): string {
  const parts: string[] = [];

  if (preset.shotMode === "product") {
    parts.push(`High-end ecommerce product photo of a ${preset.name}.`);
  } else {
    parts.push(`Studio catalog photo of a model wearing or holding a ${preset.name}.`);
    if (preset.framing) parts.push(`Framing: ${preset.framing}.`);
    parts.push("Vary model skin tone and appearance across images.");
  }

  if (preset.description) parts.push(preset.description + ".");
  if (background) parts.push(background + ".");
  if (brandRules) parts.push(brandRules);

  return parts.join(" ");
}
