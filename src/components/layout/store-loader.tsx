"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/use-settings-store";
import { usePresetStore } from "@/stores/use-preset-store";

export function StoreLoader() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadPresets = usePresetStore((s) => s.load);

  useEffect(() => {
    loadSettings();
    loadPresets();
  }, [loadSettings, loadPresets]);

  return null;
}
