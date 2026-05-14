"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/use-settings-store";
import { usePresetStore } from "@/stores/use-preset-store";
import { useAppStore } from "@/stores/use-app-store";

export function StoreLoader() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadPresets = usePresetStore((s) => s.load);
  const loadHistory = useAppStore((s) => s.loadHistory);

  useEffect(() => {
    loadSettings();
    loadPresets();
    loadHistory();
  }, [loadSettings, loadPresets, loadHistory]);

  return null;
}
