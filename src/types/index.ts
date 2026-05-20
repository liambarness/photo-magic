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
  modelGender?: string;
  modelBuild?: string;
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
  createdAt?: number;
  updatedAt?: number;
}
