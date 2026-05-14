import type { ActivePresetConfig } from "@/types";

export const SHOT_MODE_OPTIONS = [
  { label: "Product", value: "product" },
  { label: "Model", value: "model" },
] as const;

export const MODEL_GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Varied", value: "varied" },
] as const;

export const FRAMING_OPTIONS = [
  { label: "Full body", value: "full body, head to toe" },
  { label: "Upper body — face visible", value: "face visible, cropped below the waist, showing face and torso" },
  { label: "Lower body — no face", value: "cropped from the bellybutton down, no face visible, showing full legs and feet" },
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
};
