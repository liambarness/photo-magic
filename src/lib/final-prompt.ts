import type { ActivePresetConfig, ModelViewType, Preset } from "@/types";
import {
  getModelPoseOption,
  getModelProfile,
  getModelWearerOption,
  productGroupLabel,
  viewTypeLabel,
} from "@/lib/model-shot";
import {
  getTouchUpBackgroundOption,
  getTouchUpStrengthOption,
} from "@/lib/touch-up";

interface FinalPromptOptions {
  modelProfileId?: string | null;
  productGroupId?: string;
  productGroupLabel?: string;
  viewType?: string;
}

const MODEL_RUNTIME_PHRASES = [
  /\s*,?\s*\bcropped\s+from\s+[^,.]*(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^,.]*(?=,|\.)/gi,
  /\s*,?\s*\bframed\s+from\s+[^,.]*(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^,.]*(?=,|\.)/gi,
  /\s*,?\s*\bframe\s+the\s+[^.]*?(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^.]*\./gi,
  /\s*,?\s*\bcrop\s+[^.]*?(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^.]*\./gi,
  /\s*,?\s*\b(?:full body|upper body|lower body|face visible|face not visible|no face|head to toe|head-to-toe)\b[^,.]*(?=,|\.)/gi,
  /\s*\bVary[^.]*model[^.]*appearance[^.]*\./gi,
];

function modelSafePresetPrompt(prompt: string, presetName: string): string {
  let cleaned = prompt.trim();

  for (const pattern of MODEL_RUNTIME_PHRASES) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || `Studio catalog photo for ${presetName}.`;
}

function indefiniteArticle(text: string): "a" | "an" {
  return /^[aeiou]/i.test(text.trim()) ? "an" : "a";
}

export function buildFinalPrompt(
  preset: Preset | null | undefined,
  activePreset: ActivePresetConfig,
  options: FinalPromptOptions = {}
): string | null {
  if (!preset?.polishedPrompt) return null;

  const basePrompt =
    preset.shotMode === "model"
      ? modelSafePresetPrompt(preset.polishedPrompt, preset.name)
      : preset.polishedPrompt.trim();
  const parts = [basePrompt].filter(Boolean);

  if (preset.shotMode === "product") {
    parts.push(
      "Product-only constraint: do not include a human model, mannequin, hands, arms, body parts, face, or worn-on-body presentation."
    );
  }

  if (preset.shotMode === "model") {
    const wearer = getModelWearerOption(activePreset.modelWearerType);
    const pose = getModelPoseOption(activePreset.modelPoseType);
    const modelProfile = getModelProfile(options.modelProfileId ?? activePreset.modelProfileId);
    const groupLabel =
      options.productGroupLabel ??
      (options.productGroupId ? productGroupLabel(options.productGroupId) : "");
    const view =
      options.viewType && options.viewType !== "unknown"
        ? viewTypeLabel(options.viewType as ModelViewType)
        : "";

    parts.push(
      `Model shot parameters: use ${indefiniteArticle(wearer.prompt)} ${wearer.prompt}. ${pose.prompt}`
    );
    if (wearer.safetyPrompt) {
      parts.push(wearer.safetyPrompt);
    }
    if (modelProfile) {
      parts.push(
        `Use selected model profile "${modelProfile.name}": ${modelProfile.prompt}. Keep this same model identity consistent for every image in ${groupLabel || "the same product group"}.`
      );
    } else {
      parts.push(
        "Use a natural catalog model appearance selected from the approved model roster for this wearer type."
      );
    }
    if (groupLabel || view) {
      parts.push(
        `Batch context: ${groupLabel || "this product group"}${view ? `, ${view.toLowerCase()} view` : ""}.`
      );
    }
    parts.push(
      "The wearer type and framing above are the authoritative shot settings for this generation; ignore any older preset wording that conflicts with them."
    );

    const gender = activePreset.modelGender || "varied";
    const build = activePreset.modelBuild || "varied";
    if (gender !== "varied" || build !== "varied") {
      parts.push(
        `Legacy model preference: ${gender !== "varied" ? `gender ${gender}` : ""}${gender !== "varied" && build !== "varied" ? ", " : ""}${build !== "varied" ? `build ${build}` : ""}.`
      );
    }
  }

  if (preset.shotMode === "touchup") {
    const strength = getTouchUpStrengthOption(activePreset.touchUpStrength);
    const background = getTouchUpBackgroundOption(activePreset.touchUpBackground);
    parts.push(
      "Touch-up workflow: the uploaded source image already contains the model/person and product. Preserve the exact person, face if visible, skin tone, pose, body proportions, product placement, product fit, logo placement, artwork, color, graphic scale, garment shape, and source composition."
    );
    parts.push(strength.prompt);
    parts.push(background.prompt);
    parts.push(
      "Remove casual phone or DSLR snapshot artifacts, harsh shadows, uneven lighting, clutter, noise, blur, color cast, and distracting background elements. Do not replace the person with a new AI model. Do not change identity, body shape, pose, product design, logo, artwork, colors, or fit. Do not invent new graphics or product details."
    );
  }

  const notes = activePreset.notes.trim();
  if (notes) {
    parts.push(`IMPORTANT additional parameters: ${notes}.`);
  }

  return parts.join(" ");
}
