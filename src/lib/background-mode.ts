import type { BackgroundMode } from "@/types";

export interface BackgroundModeOption {
  value: BackgroundMode;
  label: string;
  shortLabel: string;
  prompt: string;
}

export const DEFAULT_GLOBAL_BACKGROUND_PROMPT =
  "Studio background.";

export const BACKGROUND_MODE_OPTIONS: BackgroundModeOption[] = [
  {
    value: "global",
    label: "Global Prompt Context",
    shortLabel: "Global",
    prompt: "",
  },
  {
    value: "flat_white",
    label: "Flat white background",
    shortLabel: "Flat White",
    prompt:
      "Background: pure solid flat white (#FFFFFF), textureless and unlit, with no gradient, vignette, lighting falloff, shadows, reflections, horizon line, props, environment, or backdrop detail.",
  },
];

export function getBackgroundModeOption(value: string | undefined): BackgroundModeOption {
  return (
    BACKGROUND_MODE_OPTIONS.find((option) => option.value === value) ??
    BACKGROUND_MODE_OPTIONS[0]
  );
}

export function backgroundPromptForMode(
  value: string | undefined,
  globalBackground: string
): string {
  const option = getBackgroundModeOption(value);
  if (option.value === "flat_white") return option.prompt;

  const cleanedGlobal = globalBackground.trim();
  return `Background: ${cleanedGlobal || DEFAULT_GLOBAL_BACKGROUND_PROMPT}`;
}
