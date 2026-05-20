"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSettingsStore } from "@/stores/use-settings-store";
import { usePresetStore } from "@/stores/use-preset-store";
import { useAppStore } from "@/stores/use-app-store";

export function StoreLoader() {
  const pathname = usePathname();
  const loadSettings = useSettingsStore((s) => s.load);
  const loadPresets = usePresetStore((s) => s.load);
  const loadHistory = useAppStore((s) => s.loadHistory);

  useEffect(() => {
    if (pathname === "/login") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    Promise.all([loadSettings(), loadPresets()]).finally(() => {
      if (cancelled) return;

      timer = setTimeout(() => {
        if (!cancelled) loadHistory();
      }, 250);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, loadSettings, loadPresets, loadHistory]);

  return null;
}
