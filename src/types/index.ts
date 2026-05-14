export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface Preset {
  id: string;
  name: string;
  shotMode: "product" | "model";
  framing: string;
  description: string;
  polishedPrompt: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ActivePresetConfig {
  presetId: string | null;
  notes: string;
  modelGender: string;
  modelBuild: string;
}

export interface PhotoSettings {
  presetId: string | null;
  presetName: string;
  shotMode: "product" | "model";
}

export interface SourcePhoto {
  id: string;
  name: string;
  label: string;
  previewUrl: string;
  serverPath: string | null;
  status: "pending" | "processing" | "done" | "error";
  resultUrl: string | null;
  error: string | null;
  usedSettings: PhotoSettings;
  cost: number;
  usage: TokenUsage | null;
}
