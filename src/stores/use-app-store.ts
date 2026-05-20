"use client";

import { create } from "zustand";
import type { SourcePhoto, ActivePresetConfig, PhotoSettings, TokenUsage } from "@/types";
import { DEFAULT_ACTIVE_PRESET } from "@/lib/constants";
import { usePresetStore } from "./use-preset-store";

interface AppState {
  activePreset: ActivePresetConfig;

  photos: SourcePhoto[];
  selectedIds: string[];
  _historyLoaded: boolean;

  selectPreset: (presetId: string) => void;
  clearPreset: () => void;
  updateNotes: (notes: string) => void;
  updateModelOption: (key: "modelGender" | "modelBuild", value: string) => void;

  snapshotSettings: () => PhotoSettings;
  getActivePrompt: () => string | null;

  addPhotos: (photos: SourcePhoto[]) => void;
  loadHistory: () => Promise<void>;
  updatePhotoUpload: (photoId: string, patch: Pick<SourcePhoto, "label" | "previewUrl" | "serverPath">) => void;
  setPhotoStatus: (
    photoId: string,
    status: SourcePhoto["status"],
    resultUrl?: string | null,
    error?: string | null,
    cost?: number,
    usage?: TokenUsage | null
  ) => void;
  resetSinglePhoto: (photoId: string) => void;
  clearPhotos: () => void;

  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activePreset: { ...DEFAULT_ACTIVE_PRESET },

  photos: [],
  selectedIds: [],
  _historyLoaded: false,

  selectPreset: (presetId) => {
    set({ activePreset: { presetId, notes: "", modelGender: "varied", modelBuild: "varied" } });
  },

  clearPreset: () => {
    set({ activePreset: { ...DEFAULT_ACTIVE_PRESET } });
  },

  updateNotes: (notes) => {
    set((s) => ({
      activePreset: { ...s.activePreset, notes },
    }));
  },

  updateModelOption: (key: "modelGender" | "modelBuild", value: string) => {
    set((s) => ({
      activePreset: { ...s.activePreset, [key]: value },
    }));
  },

  getActivePrompt: () => {
    const { activePreset } = get();
    if (!activePreset.presetId) return null;
    const preset = usePresetStore.getState().getPreset(activePreset.presetId);
    if (!preset?.polishedPrompt) return null;

    let prompt = preset.polishedPrompt;

    if (preset.shotMode === "model") {
      const gender = activePreset.modelGender || "varied";
      const build = activePreset.modelBuild || "varied";
      if (gender !== "varied") {
        prompt += ` Use a ${gender} model.`;
      }
      if (build !== "varied") {
        prompt += ` Model should have a ${build} build.`;
      }
    }

    const notes = activePreset.notes.trim();
    if (notes) {
      prompt += ` IMPORTANT additional notes: ${notes}.`;
    }
    return prompt;
  },

  snapshotSettings: () => {
    const { activePreset } = get();
    const preset = activePreset.presetId
      ? usePresetStore.getState().getPreset(activePreset.presetId)
      : null;
    return {
      presetId: activePreset.presetId,
      presetName: preset?.name ?? "None",
      shotMode: preset?.shotMode ?? "product",
    };
  },

  addPhotos: (photos) => {
    set((s) => ({ photos: [...photos, ...s.photos] }));
  },

  loadHistory: async () => {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error("History load failed");
      const data = (await res.json()) as { photos?: SourcePhoto[] };
      if (!Array.isArray(data.photos)) throw new Error("Invalid history response");
      const loadedPhotos = data.photos;
      set((s) => {
        const existingIds = new Set(s.photos.map((p) => p.id));
        const history = loadedPhotos.filter((p) => !existingIds.has(p.id));
        return {
          photos: [...history, ...s.photos],
          _historyLoaded: true,
        };
      });
    } catch {
      set({ _historyLoaded: true });
    }
  },

  updatePhotoUpload: (photoId, patch) => {
    set((s) => ({
      photos: s.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)),
    }));
  },

  setPhotoStatus: (photoId, status, resultUrl, error, cost, usage) => {
    set((s) => ({
      photos: s.photos.map((p) =>
        p.id === photoId
          ? {
              ...p,
              status,
              resultUrl: resultUrl ?? p.resultUrl,
              error: error ?? null,
              cost: p.cost + (cost ?? 0),
              usage: usage ?? p.usage,
            }
          : p
      ),
    }));
  },

  resetSinglePhoto: (photoId) => {
    set((s) => ({
      photos: s.photos.map((p) =>
        p.id === photoId
          ? { ...p, status: "pending" as const, resultUrl: null, error: null }
          : p
      ),
    }));
  },

  clearPhotos: () => set({ photos: [], selectedIds: [] }),

  toggleSelect: (id) => {
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    }));
  },

  selectAll: () => {
    set((s) => ({
      selectedIds: s.photos.filter((p) => p.status === "done").map((p) => p.id),
    }));
  },

  clearSelection: () => set({ selectedIds: [] }),
}));
