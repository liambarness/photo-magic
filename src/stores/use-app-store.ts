"use client";

import { create } from "zustand";
import type {
  SourcePhoto,
  ActivePresetConfig,
  PhotoSettings,
  TokenUsage,
  ModelPoseType,
  ModelProfileSelection,
  ModelWearerType,
  TouchUpBackground,
  TouchUpStrength,
} from "@/types";
import { DEFAULT_ACTIVE_PRESET } from "@/lib/constants";
import { buildFinalPrompt } from "@/lib/final-prompt";
import { normalizeModelProfileSelection } from "@/lib/model-shot";
import { usePresetStore } from "./use-preset-store";
import { useModelProfileStore } from "./use-model-profile-store";

type WorkspaceStatusFilter = "done" | "all" | Exclude<SourcePhoto["status"], "done">;
type WorkspaceVisibilityFilter = "active" | "archived" | "all";
type WorkspaceSortOrder = "newest" | "oldest";

interface AppState {
  activePreset: ActivePresetConfig;

  photos: SourcePhoto[];
  selectedIds: string[];
  _historyLoaded: boolean;
  workspaceResetVersion: number;
  workspaceStatusFilter: WorkspaceStatusFilter;
  workspaceVisibilityFilter: WorkspaceVisibilityFilter;
  workspaceSortOrder: WorkspaceSortOrder;
  workspaceVisibleCount: number;

  selectPreset: (presetId: string) => void;
  clearPreset: () => void;
  goHome: () => void;
  updateNotes: (notes: string) => void;
  saveNotes: () => void;
  updateModelOption: (key: "modelGender" | "modelBuild", value: string) => void;
  updateModelShotOption: (
    key: "modelWearerType" | "modelPoseType" | "modelProfileId",
    value: ModelWearerType | ModelPoseType | ModelProfileSelection
  ) => void;
  updateTouchUpOption: (
    key: "touchUpStrength" | "touchUpBackground",
    value: TouchUpStrength | TouchUpBackground
  ) => void;
  setWorkspaceStatusFilter: (value: WorkspaceStatusFilter) => void;
  setWorkspaceVisibilityFilter: (value: WorkspaceVisibilityFilter) => void;
  setWorkspaceSortOrder: (value: WorkspaceSortOrder) => void;
  setWorkspaceVisibleCount: (value: number | ((current: number) => number)) => void;

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
  setPhotoVisibility: (photoIds: string[], visibility: SourcePhoto["visibility"]) => void;
  removePhotos: (photoIds: string[]) => void;
  clearPhotos: () => void;

  toggleSelect: (id: string) => void;
  selectIds: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
}

const UI_STATE_KEY = "pm:ui-state";

interface PersistedUIState {
  presetId: string | null;
  statusFilter: string | null;
  visibilityFilter: string | null;
  sortOrder: string | null;
}

function saveUIState(patch: Partial<PersistedUIState>) {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    const current: PersistedUIState = raw ? JSON.parse(raw) : { presetId: null, statusFilter: null, visibilityFilter: null, sortOrder: null };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {}
}

export function loadUIState(): PersistedUIState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { presetId: null, statusFilter: null, visibilityFilter: null, sortOrder: null };
}

function saveNotesToPreset(getState: () => AppState) {
  const { activePreset } = getState();
  if (!activePreset.presetId) return;
  const notes = activePreset.notes.trim();
  usePresetStore.getState().updatePreset(activePreset.presetId, {
    notes: notes || undefined,
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  activePreset: { ...DEFAULT_ACTIVE_PRESET },

  photos: [],
  selectedIds: [],
  _historyLoaded: false,
  workspaceResetVersion: 0,
  workspaceStatusFilter: "done",
  workspaceVisibilityFilter: "active",
  workspaceSortOrder: "newest",
  workspaceVisibleCount: 24,

  selectPreset: (presetId) => {
    const preset = usePresetStore.getState().getPreset(presetId);
    set({
      activePreset: {
        ...DEFAULT_ACTIVE_PRESET,
        presetId,
        notes: preset?.notes ?? "",
      },
    });
    saveUIState({ presetId });
  },

  clearPreset: () => {
    set({ activePreset: { ...DEFAULT_ACTIVE_PRESET } });
    saveUIState({ presetId: null });
  },

  goHome: () => {
    set((s) => ({
      activePreset: { ...DEFAULT_ACTIVE_PRESET },
      selectedIds: [],
      workspaceStatusFilter: "done",
      workspaceVisibilityFilter: "active",
      workspaceSortOrder: "newest",
      workspaceVisibleCount: 24,
      workspaceResetVersion: s.workspaceResetVersion + 1,
    }));
    saveUIState({ presetId: null, statusFilter: "done", visibilityFilter: "active", sortOrder: "newest" });
  },

  setWorkspaceStatusFilter: (value) => {
    set({ workspaceStatusFilter: value, workspaceVisibleCount: 24 });
    saveUIState({ statusFilter: value });
  },

  setWorkspaceVisibilityFilter: (value) => {
    set({ workspaceVisibilityFilter: value, workspaceVisibleCount: 24 });
    saveUIState({ visibilityFilter: value });
  },

  setWorkspaceSortOrder: (value) => {
    set({ workspaceSortOrder: value, workspaceVisibleCount: 24 });
    saveUIState({ sortOrder: value });
  },

  setWorkspaceVisibleCount: (value) => {
    set((s) => ({
      workspaceVisibleCount:
        typeof value === "function" ? value(s.workspaceVisibleCount) : value,
    }));
  },

  updateNotes: (notes) => {
    set((s) => ({
      activePreset: { ...s.activePreset, notes },
    }));
  },

  saveNotes: () => {
    saveNotesToPreset(get);
  },

  updateModelOption: (key: "modelGender" | "modelBuild", value: string) => {
    set((s) => ({
      activePreset: { ...s.activePreset, [key]: value },
    }));
  },

  updateModelShotOption: (key, value) => {
    set((s) => {
      if (key === "modelWearerType") {
        const wearerType = value as ModelWearerType;
        return {
          activePreset: {
            ...s.activePreset,
            modelWearerType: wearerType,
            modelProfileId: normalizeModelProfileSelection(s.activePreset.modelProfileId, wearerType),
          },
        };
      }

      return {
        activePreset: { ...s.activePreset, [key]: value },
      };
    });
  },

  updateTouchUpOption: (key, value) => {
    set((s) => ({
      activePreset: { ...s.activePreset, [key]: value },
    }));
  },

  getActivePrompt: () => {
    const { activePreset } = get();
    if (!activePreset.presetId) return null;
    const preset = usePresetStore.getState().getPreset(activePreset.presetId);
    return buildFinalPrompt(preset, activePreset, {
      allProfiles: useModelProfileStore.getState().profiles,
    });
  },

  snapshotSettings: () => {
    const { activePreset } = get();
    const preset = activePreset.presetId
      ? usePresetStore.getState().getPreset(activePreset.presetId)
      : null;
    const notes = activePreset.notes.trim();
    return {
      presetId: activePreset.presetId,
      presetName: preset?.name ?? "None",
      shotMode: preset?.shotMode ?? "product",
      modelGender: preset?.shotMode === "model" ? activePreset.modelGender || "varied" : undefined,
      modelBuild: preset?.shotMode === "model" ? activePreset.modelBuild || "varied" : undefined,
      modelWearerType: preset?.shotMode === "model" ? activePreset.modelWearerType : undefined,
      modelPoseType: preset?.shotMode === "model" ? activePreset.modelPoseType : undefined,
      modelProfileId: preset?.shotMode === "model" ? activePreset.modelProfileId : undefined,
      touchUpStrength: preset?.shotMode === "touchup" ? activePreset.touchUpStrength : undefined,
      touchUpBackground: preset?.shotMode === "touchup" ? activePreset.touchUpBackground : undefined,
      notes: notes || undefined,
      finalPrompt: buildFinalPrompt(preset, activePreset, {
        allProfiles: useModelProfileStore.getState().profiles,
      }),
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
      const loadedPhotos = data.photos.map((photo) => ({
        ...photo,
        visibility: photo.visibility ?? "active",
        usedSettings: {
          ...photo.usedSettings,
          modelWearerType:
            photo.usedSettings.modelWearerType ??
            (photo.usedSettings.modelGender === "female" ? "womens" : "mens"),
          modelPoseType: photo.usedSettings.modelPoseType ?? "upper_face_visible",
          touchUpStrength: photo.usedSettings.touchUpStrength ?? "standard",
          touchUpBackground: photo.usedSettings.touchUpBackground ?? "standard_gray",
        },
      }));
      set((s) => {
        const existingIds = new Set(s.photos.map((p) => p.id));
        const history = loadedPhotos.filter((p) => !existingIds.has(p.id));
        const allPhotos = [...history, ...s.photos];
        const hasInFlight = allPhotos.some(
          (p) => p.status === "pending" || p.status === "processing"
        );
        if (hasInFlight) saveUIState({ statusFilter: "all" });
        return {
          photos: allPhotos,
          _historyLoaded: true,
          workspaceStatusFilter: hasInFlight ? "all" : s.workspaceStatusFilter,
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
              updatedAt: Date.now(),
            }
          : p
      ),
    }));
  },

  resetSinglePhoto: (photoId) => {
    set((s) => ({
      photos: s.photos.map((p) =>
        p.id === photoId
          ? { ...p, status: "pending" as const, resultUrl: null, error: null, updatedAt: Date.now() }
          : p
      ),
    }));
  },

  setPhotoVisibility: (photoIds, visibility) => {
    const ids = new Set(photoIds);
    set((s) => ({
      photos: s.photos.map((p) => (ids.has(p.id) ? { ...p, visibility, updatedAt: Date.now() } : p)),
      selectedIds: s.selectedIds.filter((id) => !ids.has(id)),
    }));
  },

  removePhotos: (photoIds) => {
    const ids = new Set(photoIds);
    set((s) => ({
      photos: s.photos.filter((p) => !ids.has(p.id)),
      selectedIds: s.selectedIds.filter((id) => !ids.has(id)),
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

  selectIds: (ids) => {
    set({ selectedIds: ids });
  },

  selectAll: () => {
    set((s) => ({
      selectedIds: s.photos.filter((p) => p.status === "done" && p.visibility !== "archived").map((p) => p.id),
    }));
  },

  clearSelection: () => set({ selectedIds: [] }),
}));
