import type {
  ModelPoseType,
  ModelProfileSelection,
  ModelViewType,
  ModelWearerType,
} from "@/types";

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

export type ModelProfileKind = "ai" | "human";

export interface ModelFaceReference {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: number;
}

export interface ModelProfile {
  id: string;
  kind: ModelProfileKind;
  name: string;
  wearerType: ModelWearerType;
  prompt: string;
  styling: string;
  faceReferences?: ModelFaceReference[];
  system?: boolean;
  createdAt?: number;
  updatedAt?: number;
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

export const STARTER_MODEL_PROFILES: ModelProfile[] = [
  {
    id: "starter_mens_01",
    kind: "ai",
    name: "Mens Starter",
    wearerType: "mens",
    prompt: "adult male model with warm medium skin tone, short dark hair, athletic build, relaxed neutral expression",
    styling: "",
    system: true,
  },
  {
    id: "starter_womens_01",
    kind: "ai",
    name: "Womens Starter",
    wearerType: "womens",
    prompt: "adult female model with warm medium skin tone, shoulder-length dark hair, average build, natural catalog expression",
    styling: "",
    system: true,
  },
  {
    id: "starter_youth_01",
    kind: "ai",
    name: "Youth Starter",
    wearerType: "youth",
    prompt: "youth model around 10 years old with medium skin tone, short dark hair, average child build, neutral catalog expression",
    styling: "",
    system: true,
  },
  {
    id: "starter_toddler_01",
    kind: "ai",
    name: "Toddler Starter",
    wearerType: "toddler",
    prompt: "toddler model around 4 years old with medium skin tone, short dark hair, toddler build, simple neutral stance",
    styling: "",
    system: true,
  },
];

export function getModelWearerOption(value: string | undefined): ModelWearerOption {
  return MODEL_WEARER_OPTIONS.find((option) => option.value === value) ?? MODEL_WEARER_OPTIONS[0];
}

export function getModelPoseOption(value: string | undefined): ModelPoseOption {
  return MODEL_POSE_OPTIONS.find((option) => option.value === value) ?? MODEL_POSE_OPTIONS[1];
}

export function getModelProfile(
  id: string | undefined | null,
  allProfiles?: ModelProfile[]
): ModelProfile | null {
  if (!id) return null;
  const profiles = allProfiles ?? STARTER_MODEL_PROFILES;
  return profiles.find((profile) => profile.id === id) ?? null;
}

export function normalizeModelProfile(profile: ModelProfile): ModelProfile {
  const kind: ModelProfileKind = profile.kind === "human" ? "human" : "ai";
  const faceReferences = Array.isArray(profile.faceReferences)
    ? profile.faceReferences.filter((reference) => reference.url && reference.url.startsWith("http"))
    : [];

  return {
    ...profile,
    kind,
    faceReferences: kind === "human" ? faceReferences.slice(0, 4) : undefined,
  };
}

export function modelProfileKindLabel(profile: ModelProfile | null | undefined): string {
  return profile?.kind === "human" ? "Human" : "AI";
}

export function poseUsesVisibleFace(value: ModelPoseType | undefined): boolean {
  return value === "full_body" || value === "upper_face_visible";
}

export function humanProfileHasFaceReferences(profile: ModelProfile | null | undefined): boolean {
  return Boolean(profile?.kind === "human" && profile.faceReferences && profile.faceReferences.length > 0);
}

export function modelProfilesForWearer(
  wearerType: ModelWearerType,
  allProfiles?: ModelProfile[]
): ModelProfile[] {
  const profiles = allProfiles ?? STARTER_MODEL_PROFILES;
  const matching = profiles.filter((profile) => profile.wearerType === wearerType);
  return matching.length > 0 ? matching : profiles.filter((profile) => profile.wearerType === "mens");
}

export function normalizeModelProfileSelection(
  value: string | undefined | null,
  wearerType: ModelWearerType,
  allProfiles?: ModelProfile[]
): ModelProfileSelection {
  if (!value) return "";
  const profile = getModelProfile(value, allProfiles);
  return profile?.wearerType === wearerType ? profile.id : "";
}

export function assignModelProfilesToGroups(
  groupIds: string[],
  selectedProfileId: string,
  allProfiles: ModelProfile[]
): Record<string, ModelProfile> {
  const selectedProfile = getModelProfile(selectedProfileId, allProfiles);
  if (!selectedProfile) return {};

  return groupIds.reduce<Record<string, ModelProfile>>((assigned, groupId) => {
    assigned[groupId] = selectedProfile;
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
