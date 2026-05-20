"use client";

import { create } from "zustand";
import type { Preset } from "@/types";
import { toast } from "sonner";
import { SYSTEM_PRESET_IDS, SYSTEM_PRESETS } from "@/lib/constants";

interface PresetState {
  presets: Preset[];
  _loaded: boolean;

  load: () => Promise<void>;
  addPreset: (preset: Preset) => void;
  updatePreset: (id: string, patch: Partial<Omit<Preset, "id" | "createdAt">>) => void;
  deletePreset: (id: string) => void;
  getPreset: (id: string) => Preset | undefined;
}

export function createPresetShell(name = ""): Preset {
  return {
    id: crypto.randomUUID(),
    name,
    shotMode: "product",
    framing: "",
    description: "",
    polishedPrompt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function withSystemPresets(presets: Preset[]): Preset[] {
  const customPresets = presets.filter((preset) => !SYSTEM_PRESET_IDS.has(preset.id));
  return [...SYSTEM_PRESETS, ...customPresets];
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: withSystemPresets([]),
  _loaded: false,

  load: async () => {
    try {
      const res = await fetch("/api/presets");
      if (!res.ok) throw new Error("Preset load failed");
      const presets = await res.json();
      if (!Array.isArray(presets)) throw new Error("Invalid preset response");
      set({ presets: withSystemPresets(presets), _loaded: true });
    } catch {
      set({ presets: withSystemPresets([]), _loaded: true });
    }
  },

  addPreset: async (preset) => {
    const previous = get().presets;
    set((s) => ({ presets: [...s.presets, preset] }));
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
      if (!res.ok) throw new Error("Preset save failed");
      const presets = await res.json();
      if (!Array.isArray(presets)) throw new Error("Invalid preset response");
      set({ presets: withSystemPresets(presets) });
    } catch {
      set({ presets: previous });
      toast.error("Preset could not be saved.");
    }
  },

  updatePreset: async (id, patch) => {
    if (SYSTEM_PRESET_IDS.has(id)) {
      toast.message("Built-in presets cannot be edited. Adjust upload options in the sidebar.");
      return;
    }

    const previous = get().presets;
    set((s) => ({
      presets: s.presets.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
      ),
    }));
    try {
      const res = await fetch("/api/presets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error("Preset update failed");
      const presets = await res.json();
      if (!Array.isArray(presets)) throw new Error("Invalid preset response");
      set({ presets: withSystemPresets(presets) });
    } catch {
      set({ presets: previous });
      toast.error("Preset could not be updated.");
    }
  },

  deletePreset: async (id) => {
    if (SYSTEM_PRESET_IDS.has(id)) {
      toast.message("Built-in presets stay available for every workspace.");
      return;
    }

    const previous = get().presets;
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
    try {
      const res = await fetch("/api/presets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Preset delete failed");
      const presets = await res.json();
      if (!Array.isArray(presets)) throw new Error("Invalid preset response");
      set({ presets: withSystemPresets(presets) });
    } catch {
      set({ presets: previous });
      toast.error("Preset could not be deleted.");
    }
  },

  getPreset: (id) => get().presets.find((p) => p.id === id),
}));
