export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GenerationDebug {
  modelProfileId?: string;
  modelProfileName?: string;
  modelProfileKind?: "ai" | "human" | "missing" | "none";
  modelPoseType?: ModelPoseType;
  faceReferenceCount: number;
  inputImageCount: number;
}

export type ShotMode = "product" | "model" | "touchup";
export type ModelWearerType = "mens" | "womens" | "youth" | "toddler";
export type ModelPoseType =
  | "full_body"
  | "upper_face_visible"
  | "upper_no_face"
  | "lower_no_face";
export type ModelViewType = "front" | "back" | "side" | "detail" | "unknown";
export type ModelProfileSelection = string;
export type TouchUpStrength = "light" | "standard" | "deep";
export type TouchUpBackground = "standard_gray" | "preserve";
export type BackgroundMode = "global" | "flat_white";

export interface Preset {
  id: string;
  name: string;
  shotMode: ShotMode;
  framing: string;
  description: string;
  polishedPrompt: string | null;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  system?: boolean;
}

export interface ActivePresetConfig {
  presetId: string | null;
  notes: string;
  modelGender: string;
  modelBuild: string;
  modelWearerType: ModelWearerType;
  modelPoseType: ModelPoseType;
  modelProfileId: ModelProfileSelection;
  touchUpStrength: TouchUpStrength;
  touchUpBackground: TouchUpBackground;
  backgroundMode: BackgroundMode;
}

export interface PhotoSettings {
  presetId: string | null;
  presetName: string;
  shotMode: ShotMode;
  modelGender?: string;
  modelBuild?: string;
  modelWearerType?: ModelWearerType;
  modelPoseType?: ModelPoseType;
  modelProfileId?: string;
  modelProfileName?: string;
  productGroupId?: string;
  productGroupLabel?: string;
  viewType?: ModelViewType;
  touchUpStrength?: TouchUpStrength;
  touchUpBackground?: TouchUpBackground;
  backgroundMode?: BackgroundMode;
  notes?: string;
  finalPrompt?: string | null;
}

export interface SourcePhoto {
  id: string;
  name: string;
  label: string;
  batchFolder: string;
  previewUrl: string;
  serverPath: string | null;
  status: "pending" | "processing" | "done" | "error";
  resultUrl: string | null;
  error: string | null;
  usedSettings: PhotoSettings;
  visibility: "active" | "archived";
  cost: number;
  usage: TokenUsage | null;
  generationDebug?: GenerationDebug | null;
  createdAt?: number;
  updatedAt?: number;
}
