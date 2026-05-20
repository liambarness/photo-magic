"use client";

import { create } from "zustand";
import type { ModelProfile } from "@/lib/model-shot";
import { STARTER_MODEL_PROFILES } from "@/lib/model-shot";
import { toast } from "sonner";

interface ModelProfileState {
  profiles: ModelProfile[];
  _loaded: boolean;

  load: () => Promise<void>;
  allProfiles: () => ModelProfile[];
  addProfile: (profile: ModelProfile) => void;
  updateProfile: (id: string, patch: Partial<Omit<ModelProfile, "id" | "createdAt">>) => void;
  deleteProfile: (id: string) => void;
  getProfile: (id: string) => ModelProfile | undefined;
}

function withStarters(custom: ModelProfile[]): ModelProfile[] {
  const customIds = new Set(custom.map((p) => p.id));
  const starters = STARTER_MODEL_PROFILES.filter((s) => !customIds.has(s.id));
  return [...starters, ...custom];
}

export const useModelProfileStore = create<ModelProfileState>((set, get) => ({
  profiles: withStarters([]),
  _loaded: false,

  load: async () => {
    try {
      const res = await fetch("/api/model-profiles");
      if (!res.ok) throw new Error("Model profiles load failed");
      const profiles = await res.json();
      if (!Array.isArray(profiles)) throw new Error("Invalid model profiles response");
      set({ profiles: withStarters(profiles), _loaded: true });
    } catch {
      set({ profiles: withStarters([]), _loaded: true });
    }
  },

  allProfiles: () => get().profiles,

  addProfile: async (profile) => {
    const previous = get().profiles;
    set((s) => ({ profiles: withStarters([...s.profiles.filter((p) => p.id !== profile.id), profile]) }));
    try {
      const res = await fetch("/api/model-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("Profile save failed");
      const profiles = await res.json();
      if (!Array.isArray(profiles)) throw new Error("Invalid response");
      set({ profiles: withStarters(profiles) });
    } catch {
      set({ profiles: previous });
      toast.error("Model profile could not be saved.");
    }
  },

  updateProfile: async (id, patch) => {
    const previous = get().profiles;
    set((s) => ({
      profiles: withStarters(
        s.profiles.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
      ),
    }));
    try {
      const res = await fetch("/api/model-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error("Profile update failed");
      const profiles = await res.json();
      if (!Array.isArray(profiles)) throw new Error("Invalid response");
      set({ profiles: withStarters(profiles) });
    } catch {
      set({ profiles: previous });
      toast.error("Model profile could not be updated.");
    }
  },

  deleteProfile: async (id) => {
    const target = get().profiles.find((p) => p.id === id);
    if (target?.system) {
      toast.message("Starter profiles can be customized but not deleted.");
      return;
    }

    const previous = get().profiles;
    set((s) => ({ profiles: withStarters(s.profiles.filter((p) => p.id !== id)) }));
    try {
      const res = await fetch("/api/model-profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Profile delete failed");
      const profiles = await res.json();
      if (!Array.isArray(profiles)) throw new Error("Invalid response");
      set({ profiles: withStarters(profiles) });
    } catch {
      set({ profiles: previous });
      toast.error("Model profile could not be deleted.");
    }
  },

  getProfile: (id) => get().profiles.find((p) => p.id === id),
}));
