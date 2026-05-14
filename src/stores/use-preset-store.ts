"use client";

import { create } from "zustand";
import type { Preset } from "@/types";
import { toast } from "sonner";

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

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [],
  _loaded: false,

  load: async () => {
    try {
      const res = await fetch("/api/presets");
      const presets = await res.json();
      set({ presets, _loaded: true });
    } catch {
      set({ _loaded: true });
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
      set({ presets });
    } catch {
      set({ presets: previous });
      toast.error("Preset could not be saved.");
    }
  },

  updatePreset: async (id, patch) => {
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
      set({ presets });
    } catch {
      set({ presets: previous });
      toast.error("Preset could not be updated.");
    }
  },

  deletePreset: async (id) => {
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
      set({ presets });
    } catch {
      set({ presets: previous });
      toast.error("Preset could not be deleted.");
    }
  },

  getPreset: (id) => get().presets.find((p) => p.id === id),
}));
