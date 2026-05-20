import type { TouchUpBackground, TouchUpStrength } from "@/types";

export interface TouchUpStrengthOption {
  value: TouchUpStrength;
  label: string;
  shortLabel: string;
  prompt: string;
}

export interface TouchUpBackgroundOption {
  value: TouchUpBackground;
  label: string;
  prompt: string;
}

export const TOUCH_UP_STRENGTH_OPTIONS: TouchUpStrengthOption[] = [
  {
    value: "light",
    label: "Light cleanup",
    shortLabel: "Light",
    prompt:
      "Use light cleanup: improve exposure, color balance, sharpness, and minor distractions while keeping the source image composition mostly intact.",
  },
  {
    value: "standard",
    label: "Standard cleanup",
    shortLabel: "Standard",
    prompt:
      "Use standard cleanup: improve lighting, exposure, sharpness, color balance, shadows, background cleanliness, and snapshot artifacts while preserving the source pose and product fit.",
  },
  {
    value: "deep",
    label: "Deep cleanup",
    shortLabel: "Deep",
    prompt:
      "Use deep cleanup: aggressively standardize lighting, background, shadows, camera noise, wrinkles, and casual snapshot artifacts while preserving the exact person, pose, product, artwork, and fit.",
  },
];

export const TOUCH_UP_BACKGROUND_OPTIONS: TouchUpBackgroundOption[] = [
  {
    value: "standard_gray",
    label: "Standard grey",
    prompt:
      "Standardize the image to a light grey seamless studio background (#EBEBEB) with soft even diffused lighting and a minimal natural shadow.",
  },
  {
    value: "preserve",
    label: "Preserve original",
    prompt:
      "Preserve the original setting and background structure where possible, but clean distractions, uneven lighting, color cast, noise, and clutter.",
  },
];

export function getTouchUpStrengthOption(value: string | undefined): TouchUpStrengthOption {
  return (
    TOUCH_UP_STRENGTH_OPTIONS.find((option) => option.value === value) ??
    TOUCH_UP_STRENGTH_OPTIONS[1]
  );
}

export function getTouchUpBackgroundOption(value: string | undefined): TouchUpBackgroundOption {
  return (
    TOUCH_UP_BACKGROUND_OPTIONS.find((option) => option.value === value) ??
    TOUCH_UP_BACKGROUND_OPTIONS[0]
  );
}
