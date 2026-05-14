"use client";

import { create } from "zustand";

export interface SettingsState {
  brandRules: string;
  background: string;
  concurrency: number;
  imageSize: string;
  imageQuality: string;
  outputFormat: string;
  timeoutSeconds: number;
  _loaded: boolean;

  load: () => Promise<void>;
  updateSettings: (patch: Partial<Omit<SettingsState, "updateSettings" | "resetSettings" | "load" | "_loaded">>) => void;
  resetSettings: () => void;
}

const DEFAULTS = {
  brandRules: "",
  background: "",
  concurrency: 4,
  imageSize: "1024x1024",
  imageQuality: "auto",
  outputFormat: "png",
  timeoutSeconds: 300,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  _loaded: false,

  load: async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      set({ ...data, _loaded: true });
    } catch {
      set({ _loaded: true });
    }
  },

  updateSettings: async (patch) => {
    set((s) => ({ ...s, ...patch }));
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {}
  },

  resetSettings: async () => {
    try {
      const res = await fetch("/api/settings", { method: "DELETE" });
      const data = await res.json();
      set({ ...data });
    } catch {}
  },
}));
