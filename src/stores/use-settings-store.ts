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

type SettingsPatch = Partial<Omit<SettingsState, "updateSettings" | "resetSettings" | "load" | "_loaded">>;

const DEFAULTS = {
  brandRules: "",
  background: "",
  concurrency: 4,
  imageSize: "1024x1024",
  imageQuality: "auto",
  outputFormat: "png",
  timeoutSeconds: 300,
};

let pendingPatch: SettingsPatch = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function queueSettingsSave(patch: SettingsPatch) {
  pendingPatch = { ...pendingPatch, ...patch };
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    const patchToSave = pendingPatch;
    pendingPatch = {};
    saveTimer = null;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchToSave),
      });
      if (!res.ok) throw new Error("Settings save failed");
    } catch {}
  }, 400);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  _loaded: false,

  load: async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Settings load failed");
      const data = await res.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid settings response");
      }
      set({ ...data, _loaded: true });
    } catch {
      set({ _loaded: true });
    }
  },

  updateSettings: async (patch) => {
    set((s) => ({ ...s, ...patch }));
    queueSettingsSave(patch);
  },

  resetSettings: async () => {
    try {
      if (saveTimer) clearTimeout(saveTimer);
      pendingPatch = {};
      saveTimer = null;

      const res = await fetch("/api/settings", { method: "DELETE" });
      if (!res.ok) throw new Error("Settings reset failed");
      const data = await res.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid settings response");
      }
      set({ ...data });
    } catch {}
  },
}));
