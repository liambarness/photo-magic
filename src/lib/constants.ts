import type { ActivePresetConfig, Preset } from "@/types";

export const SHOT_MODE_OPTIONS = [
  { label: "Product", value: "product" },
  { label: "Model", value: "model" },
  { label: "Touch Up", value: "touchup" },
] as const;

export const MODEL_GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Varied", value: "varied" },
] as const;

export const MODEL_BUILD_OPTIONS = [
  { label: "Athletic", value: "athletic" },
  { label: "Average", value: "average" },
  { label: "Slim", value: "slim" },
  { label: "Muscular", value: "muscular" },
  { label: "Varied", value: "varied" },
] as const;

export const DEFAULT_ACTIVE_PRESET: ActivePresetConfig = {
  presetId: null,
  notes: "",
  modelGender: "varied",
  modelBuild: "varied",
  modelWearerType: "mens",
  modelPoseType: "upper_face_visible",
  modelProfileId: "",
  touchUpStrength: "standard",
  touchUpBackground: "standard_gray",
  backgroundMode: "global",
};

export const GLOBAL_TOUCH_UP_PRESET_ID = "system-touch-up-general";

export const GLOBAL_TOUCH_UP_PRESET: Preset = {
  id: GLOBAL_TOUCH_UP_PRESET_ID,
  name: "General Touch Up",
  shotMode: "touchup",
  framing: "",
  description:
    "General ecommerce cleanup for rough source photos where the person and product already exist.",
  polishedPrompt:
    "Clean ecommerce touch-up of the existing source photo. Treat the uploaded image as the source of truth for the existing person, product, pose, product fit, garment shape, artwork, logo placement, colors, camera angle, and composition.",
  createdAt: 0,
  updatedAt: 0,
  system: true,
};

export const SYSTEM_PRESET_IDS = new Set([GLOBAL_TOUCH_UP_PRESET_ID]);
export const SYSTEM_PRESETS: Preset[] = [GLOBAL_TOUCH_UP_PRESET];
