import type {
  ModelPoseType,
  ModelProfileSelection,
  ModelViewType,
  ModelWearerType,
} from "@/types";

export const MODEL_PROFILE_AUTO_ID = "auto";

export interface ModelWearerOption {
  value: ModelWearerType;
  label: string;
  prompt: string;
  safetyPrompt?: string;
}

export interface ModelPoseOption {
  value: ModelPoseType;
  label: string;
  shortLabel: string;
  prompt: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  wearerType: ModelWearerType;
  prompt: string;
}

export const MODEL_WEARER_OPTIONS: ModelWearerOption[] = [
  {
    value: "mens",
    label: "Mens",
    prompt: "adult menswear model",
  },
  {
    value: "womens",
    label: "Womens",
    prompt: "adult womenswear model",
  },
  {
    value: "youth",
    label: "Youth",
    prompt: "youth model around 8 to 12 years old",
    safetyPrompt:
      "Use fully clothed, age-appropriate catalog styling with a neutral ecommerce pose and no mature styling.",
  },
  {
    value: "toddler",
    label: "Toddler",
    prompt: "toddler model around 3 to 5 years old",
    safetyPrompt:
      "Use fully clothed, age-appropriate catalog styling with a simple neutral pose and no mature styling.",
  },
];

export const MODEL_POSE_OPTIONS: ModelPoseOption[] = [
  {
    value: "full_body",
    label: "Full body",
    shortLabel: "Full",
    prompt:
      "Frame the complete model head to toe, with the whole product visible and the body posed naturally.",
  },
  {
    value: "upper_face_visible",
    label: "Upper body - face visible",
    shortLabel: "Upper + face",
    prompt:
      "Frame the model from head through torso with the face visible, keeping the product as the visual focus.",
  },
  {
    value: "upper_no_face",
    label: "Upper body - no face",
    shortLabel: "Upper no face",
    prompt:
      "Crop from the neck or lower face down so no full face is visible, showing torso, fit, logo placement, and product drape.",
  },
  {
    value: "lower_no_face",
    label: "Lower body - no face",
    shortLabel: "Lower no face",
    prompt:
      "Crop from the waist or bellybutton down with no face visible, showing lower-body fit and product shape clearly.",
  },
];

export const MODEL_PROFILES: ModelProfile[] = [
  {
    id: "mens_01",
    name: "Mens Model 01",
    wearerType: "mens",
    prompt: "adult male model with warm medium skin tone, short dark hair, average-athletic build, relaxed neutral expression",
  },
  {
    id: "mens_02",
    name: "Mens Model 02",
    wearerType: "mens",
    prompt: "adult male model with fair skin tone, short light brown hair, slim-average build, calm catalog expression",
  },
  {
    id: "mens_03",
    name: "Mens Model 03",
    wearerType: "mens",
    prompt: "adult male model with deep brown skin tone, closely cropped black hair, athletic build, natural upright posture",
  },
  {
    id: "mens_04",
    name: "Mens Model 04",
    wearerType: "mens",
    prompt: "adult male model with tan skin tone, wavy dark hair, average build, relaxed shoulders and clean studio posture",
  },
  {
    id: "mens_05",
    name: "Mens Model 05",
    wearerType: "mens",
    prompt: "adult male model with light olive skin tone, short black hair, muscular-average build, neutral ecommerce expression",
  },
  {
    id: "mens_06",
    name: "Mens Model 06",
    wearerType: "mens",
    prompt: "adult male model with medium brown skin tone, shaved head, average build, simple balanced stance",
  },
  {
    id: "mens_07",
    name: "Mens Model 07",
    wearerType: "mens",
    prompt: "adult male model with fair skin tone, dark blond hair, tall slim build, composed catalog pose",
  },
  {
    id: "mens_08",
    name: "Mens Model 08",
    wearerType: "mens",
    prompt: "adult male model with golden brown skin tone, curly dark hair, average build, easy natural posture",
  },
  {
    id: "womens_01",
    name: "Womens Model 01",
    wearerType: "womens",
    prompt: "adult female model with warm medium skin tone, shoulder-length dark hair, average build, natural catalog expression",
  },
  {
    id: "womens_02",
    name: "Womens Model 02",
    wearerType: "womens",
    prompt: "adult female model with fair skin tone, long blond hair, slim-average build, relaxed upright posture",
  },
  {
    id: "womens_03",
    name: "Womens Model 03",
    wearerType: "womens",
    prompt: "adult female model with deep brown skin tone, natural black hair, athletic-average build, calm studio expression",
  },
  {
    id: "womens_04",
    name: "Womens Model 04",
    wearerType: "womens",
    prompt: "adult female model with tan skin tone, wavy brown hair, average build, neutral ecommerce pose",
  },
  {
    id: "womens_05",
    name: "Womens Model 05",
    wearerType: "womens",
    prompt: "adult female model with light olive skin tone, straight black hair, slim build, composed catalog posture",
  },
  {
    id: "womens_06",
    name: "Womens Model 06",
    wearerType: "womens",
    prompt: "adult female model with medium brown skin tone, curly dark hair, average-athletic build, natural balanced stance",
  },
  {
    id: "womens_07",
    name: "Womens Model 07",
    wearerType: "womens",
    prompt: "adult female model with fair skin tone, auburn hair, average build, soft neutral expression",
  },
  {
    id: "womens_08",
    name: "Womens Model 08",
    wearerType: "womens",
    prompt: "adult female model with golden brown skin tone, short dark hair, average build, clean studio stance",
  },
  {
    id: "youth_01",
    name: "Youth Model 01",
    wearerType: "youth",
    prompt: "youth model around 10 years old with medium skin tone, short dark hair, average child build, neutral catalog expression",
  },
  {
    id: "youth_02",
    name: "Youth Model 02",
    wearerType: "youth",
    prompt: "youth model around 9 years old with fair skin tone, light brown hair, average child build, simple relaxed posture",
  },
  {
    id: "youth_03",
    name: "Youth Model 03",
    wearerType: "youth",
    prompt: "youth model around 11 years old with deep brown skin tone, curly black hair, average child build, calm studio pose",
  },
  {
    id: "youth_04",
    name: "Youth Model 04",
    wearerType: "youth",
    prompt: "youth model around 8 years old with tan skin tone, straight dark hair, average child build, neutral expression",
  },
  {
    id: "youth_05",
    name: "Youth Model 05",
    wearerType: "youth",
    prompt: "youth model around 12 years old with light olive skin tone, dark blond hair, average child build, composed catalog stance",
  },
  {
    id: "youth_06",
    name: "Youth Model 06",
    wearerType: "youth",
    prompt: "youth model around 10 years old with medium brown skin tone, short curly hair, average child build, clean studio posture",
  },
  {
    id: "toddler_01",
    name: "Toddler Model 01",
    wearerType: "toddler",
    prompt: "toddler model around 4 years old with medium skin tone, short dark hair, toddler build, simple neutral stance",
  },
  {
    id: "toddler_02",
    name: "Toddler Model 02",
    wearerType: "toddler",
    prompt: "toddler model around 3 years old with fair skin tone, light brown hair, toddler build, calm studio posture",
  },
  {
    id: "toddler_03",
    name: "Toddler Model 03",
    wearerType: "toddler",
    prompt: "toddler model around 5 years old with deep brown skin tone, curly black hair, toddler build, neutral catalog expression",
  },
  {
    id: "toddler_04",
    name: "Toddler Model 04",
    wearerType: "toddler",
    prompt: "toddler model around 4 years old with tan skin tone, straight dark hair, toddler build, simple balanced stance",
  },
  {
    id: "toddler_05",
    name: "Toddler Model 05",
    wearerType: "toddler",
    prompt: "toddler model around 3 years old with light olive skin tone, wavy brown hair, toddler build, relaxed upright posture",
  },
  {
    id: "toddler_06",
    name: "Toddler Model 06",
    wearerType: "toddler",
    prompt: "toddler model around 5 years old with medium brown skin tone, short black hair, toddler build, neutral ecommerce pose",
  },
];

export function getModelWearerOption(value: string | undefined): ModelWearerOption {
  return MODEL_WEARER_OPTIONS.find((option) => option.value === value) ?? MODEL_WEARER_OPTIONS[0];
}

export function getModelPoseOption(value: string | undefined): ModelPoseOption {
  return MODEL_POSE_OPTIONS.find((option) => option.value === value) ?? MODEL_POSE_OPTIONS[1];
}

export function getModelProfile(id: string | undefined | null): ModelProfile | null {
  if (!id || id === MODEL_PROFILE_AUTO_ID) return null;
  return MODEL_PROFILES.find((profile) => profile.id === id) ?? null;
}

export function modelProfilesForWearer(wearerType: ModelWearerType): ModelProfile[] {
  const profiles = MODEL_PROFILES.filter((profile) => profile.wearerType === wearerType);
  return profiles.length > 0 ? profiles : MODEL_PROFILES.filter((profile) => profile.wearerType === "mens");
}

export function normalizeModelProfileSelection(
  value: string | undefined | null,
  wearerType: ModelWearerType
): ModelProfileSelection {
  if (!value || value === MODEL_PROFILE_AUTO_ID) return MODEL_PROFILE_AUTO_ID;
  const profile = getModelProfile(value);
  return profile?.wearerType === wearerType ? profile.id : MODEL_PROFILE_AUTO_ID;
}

export function assignModelProfilesToGroups(
  groupIds: string[],
  wearerType: ModelWearerType,
  selectedProfileId: ModelProfileSelection
): Record<string, ModelProfile> {
  const selectedProfile =
    selectedProfileId === MODEL_PROFILE_AUTO_ID ? null : getModelProfile(selectedProfileId);
  const profiles = modelProfilesForWearer(wearerType);

  return groupIds.reduce<Record<string, ModelProfile>>((assigned, groupId, index) => {
    assigned[groupId] =
      selectedProfile?.wearerType === wearerType
        ? selectedProfile
        : profiles[index % profiles.length];
    return assigned;
  }, {});
}

export function inferViewType(filename: string): ModelViewType {
  const lower = filename.toLowerCase();
  if (/\b(back|rear)\b/.test(lower) || lower.includes("-back") || lower.includes("_back")) return "back";
  if (/\b(side|profile)\b/.test(lower) || lower.includes("-side") || lower.includes("_side")) return "side";
  if (/\b(detail|close|logo)\b/.test(lower) || lower.includes("-detail") || lower.includes("_detail")) return "detail";
  if (/\b(front)\b/.test(lower) || lower.includes("-front") || lower.includes("_front")) return "front";
  return "unknown";
}

export function viewTypeLabel(viewType: ModelViewType | undefined): string {
  switch (viewType) {
    case "front":
      return "Front";
    case "back":
      return "Back";
    case "side":
      return "Side";
    case "detail":
      return "Detail";
    default:
      return "Unknown";
  }
}

export function productGroupLabel(groupId: string): string {
  const numeric = Number.parseInt(groupId, 10);
  return Number.isFinite(numeric) ? `Product ${numeric}` : groupId;
}
