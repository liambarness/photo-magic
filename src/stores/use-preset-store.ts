"use client";

import { create } from "zustand";
import type { Preset } from "@/types";

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
    set((s) => ({ presets: [...s.presets, preset] }));
    try {
      await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
    } catch {}
  },

  updatePreset: async (id, patch) => {
    set((s) => ({
      presets: s.presets.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
      ),
    }));
    try {
      await fetch("/api/presets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
    } catch {}
  },

  deletePreset: async (id) => {
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
    try {
      await fetch("/api/presets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}
  },

  getPreset: (id) => get().presets.find((p) => p.id === id),
}));
