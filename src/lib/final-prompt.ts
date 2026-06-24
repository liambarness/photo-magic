import type { ActivePresetConfig, ModelViewType, Preset } from "@/types";
import {
  type ModelProfile,
  getModelPoseOption,
  getModelProfile,
  getModelWearerOption,
  humanProfileHasFaceReferences,
  modelProfileKindLabel,
  poseUsesVisibleFace,
  productGroupLabel,
  viewTypeLabel,
} from "@/lib/model-shot";
import {
  getTouchUpBackgroundOption,
  getTouchUpStrengthOption,
} from "@/lib/touch-up";
import { backgroundPromptForMode } from "@/lib/background-mode";

interface FinalPromptOptions {
  modelProfileId?: string | null;
  productGroupId?: string;
  productGroupLabel?: string;
  viewType?: string;
  allProfiles?: ModelProfile[];
  background?: string;
  brandRules?: string;
}

const MODEL_RUNTIME_REWRITES = [
  {
    pattern: /\bCreate\s+an?\s+(?:full[-\s]?body|upper[-\s]?body|lower[-\s]?body)\s+studio\s+shot\b/gi,
    replacement: "Create a studio catalog shot",
  },
  {
    pattern: /\bCreate\s+an?\s+(?:full[-\s]?body|upper[-\s]?body|lower[-\s]?body)\s+catalog\s+shot\b/gi,
    replacement: "Create a catalog shot",
  },
];

const MODEL_RUNTIME_PHRASES = [
  /\s*,?\s*\bcropped\s+from\s+[^,.]*(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^,.]*(?=,|\.)/gi,
  /\s*,?\s*\bframed\s+from\s+[^,.]*(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^,.]*(?=,|\.)/gi,
  /\s*,?\s*\bframe\s+the\s+[^.]*?(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^.]*\./gi,
  /\s*,?\s*\bcrop\s+[^.]*?(?:head|face|neck|shoulder|torso|waist|bellybutton|hips|legs?|feet)[^.]*\./gi,
  /\s*,?\s*\b(?:full[-\s]?body|upper[-\s]?body|lower[-\s]?body|face visible|face not visible|no face|head to toe|head-to-toe)\b[^,.]*(?=,|\.)/gi,
  /\s*\bVary[^.]*model[^.]*appearance[^.]*\./gi,
];

export function sanitizeModelRuntimePromptText(prompt: string): string {
  let cleaned = prompt.trim();

  for (const { pattern, replacement } of MODEL_RUNTIME_REWRITES) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  for (const pattern of MODEL_RUNTIME_PHRASES) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned;
}

function modelSafePresetPrompt(prompt: string, presetName: string): string {
  const cleaned = sanitizeModelRuntimePromptText(prompt);

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
  const preservesTouchUpBackground =
    preset.shotMode === "touchup" &&
    activePreset.backgroundMode === "global" &&
    activePreset.touchUpBackground === "preserve";

  if (!preservesTouchUpBackground) {
    parts.push(backgroundPromptForMode(activePreset.backgroundMode, options.background ?? ""));
  }

  const brandRules = options.brandRules?.trim();
  if (brandRules) {
    parts.push(`Brand rules: ${brandRules}`);
  }

  if (preset.shotMode === "product") {
    parts.push(
      "Product-only constraint: do not include a human model, mannequin, hands, arms, body parts, face, or worn-on-body presentation."
    );
  }

  if (preset.shotMode === "model") {
    const wearer = getModelWearerOption(activePreset.modelWearerType);
    const pose = getModelPoseOption(activePreset.modelPoseType);
    const modelProfile = getModelProfile(
      options.modelProfileId ?? activePreset.modelProfileId,
      options.allProfiles
    );
    const usesVisibleFace = poseUsesVisibleFace(activePreset.modelPoseType);
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
      if (modelProfile.kind === "human") {
        parts.push(
          `Use selected ${modelProfileKindLabel(modelProfile).toLowerCase()} model profile "${modelProfile.name}". Keep this same model identity context consistent for every image in ${groupLabel || "the same product group"}.`
        );
        if (modelProfile.prompt) {
          parts.push(
            `Body and appearance context for this human model: ${modelProfile.prompt}.`
          );
        }
        if (usesVisibleFace) {
          if (humanProfileHasFaceReferences(modelProfile)) {
            parts.push(
              "Use the attached face reference images as the authoritative source for the model's facial identity, facial features, skin tone, and natural expression. If the uploaded product/source image already contains a person or model wearing the product, treat this as an identity-replacement edit: replace that person's facial identity with the selected human model's face from the references while preserving the garment/product, pose, body framing, visible body extent, subject scale, canvas composition, product fit, logo placement, artwork, colors, camera angle, and background from the uploaded product/source image. In that source-person case, the selected model pose controls face visibility only; it must not override the source crop, zoom level, pose, or visible body extent. Do not zoom out, reframe, convert an upper-body source crop into a full-body shot, or add legs, feet, shoes, hands, or body areas that are not visible in the source image. If the uploaded product/source image is product-only or does not show a person wearing the product, generate the selected model shot normally and use the face references only for identity. Do not preserve the source person's original face. Do not copy clothing, background, pose, lighting, or camera angle from the face reference images."
            );
          } else {
            parts.push(
              "This human model profile needs 1-4 face reference images before generating a face-visible model shot."
            );
          }
        } else {
          parts.push(
            "This framing must not show a full face. Do not use face-reference imagery to pull the crop upward; preserve the no-face framing as the authority."
          );
        }
      } else {
        parts.push(
          `Use selected model profile "${modelProfile.name}": ${modelProfile.prompt}. Keep this same model identity consistent for every image in ${groupLabel || "the same product group"}.`
        );
      }
      if (modelProfile.styling) {
        parts.push(
          `Styling constraint (apply to ALL framing variants for this model): ${modelProfile.styling}. Keep this styling identical across every pose/angle/crop of this product group.`
        );
      }
    } else {
      parts.push(
        "A model profile must be selected before generating model shots."
      );
    }
    if (groupLabel || view) {
      parts.push(
        `Batch context: ${groupLabel || "this product group"}${view ? `, ${view.toLowerCase()} view` : ""}.`
      );
    }
    parts.push(
      "The wearer type, framing, and styling above are the authoritative shot settings for this generation; ignore any older preset wording that conflicts with them."
    );
  }

  if (preset.shotMode === "touchup") {
    const strength = getTouchUpStrengthOption(activePreset.touchUpStrength);
    parts.push(
      "Touch-up workflow: the uploaded source image already contains the model/person and product. Preserve the exact person, face if visible, skin tone, pose, body proportions, product placement, product fit, logo placement, artwork, color, graphic scale, garment shape, and source composition."
    );
    parts.push(strength.prompt);
    if (preservesTouchUpBackground) {
      const background = getTouchUpBackgroundOption(activePreset.touchUpBackground);
      parts.push(background.prompt);
    }
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
