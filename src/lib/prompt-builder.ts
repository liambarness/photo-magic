import type { Preset } from "@/types";

export function buildFallbackPrompt(
  preset: Preset
): string {
  const parts: string[] = [];

  if (preset.shotMode === "product") {
    parts.push(`High-end ecommerce product photo of a ${preset.name}.`);
  } else if (preset.shotMode === "model") {
    parts.push(`Studio catalog photo of a model wearing or holding a ${preset.name}.`);
    parts.push("Preserve the selected model identity. Framing, product view, and facial expression are supplied at generation time.");
  } else {
    parts.push(`Clean ecommerce touch-up of the existing source photo for a ${preset.name}.`);
    parts.push("Preserve the existing model/person, product, pose, fit, logo, artwork, and source composition.");
  }

  if (preset.description) parts.push(preset.description + ".");

  return parts.join(" ");
}
