import type { ActivePresetConfig, Preset } from "@/types";

export function buildFinalPrompt(
  preset: Preset | null | undefined,
  activePreset: ActivePresetConfig
): string | null {
  if (!preset?.polishedPrompt) return null;

  const parts = [preset.polishedPrompt.trim()].filter(Boolean);

  if (preset.shotMode === "model") {
    const gender = activePreset.modelGender || "varied";
    const build = activePreset.modelBuild || "varied";

    if (gender !== "varied") {
      parts.push(`Use a ${gender} model.`);
    }
    if (build !== "varied") {
      parts.push(`Model should have a ${build} build.`);
    }
  }

  const notes = activePreset.notes.trim();
  if (notes) {
    parts.push(`IMPORTANT additional parameters: ${notes}.`);
  }

  return parts.join(" ");
}
