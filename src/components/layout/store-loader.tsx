"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSettingsStore } from "@/stores/use-settings-store";
import { usePresetStore } from "@/stores/use-preset-store";
import { useAppStore, loadUIState } from "@/stores/use-app-store";

const VALID_STATUS = new Set(["done", "all", "pending", "processing", "error"]);
const VALID_VISIBILITY = new Set(["active", "archived", "all"]);
const VALID_SORT = new Set(["newest", "oldest"]);

export function StoreLoader() {
  const pathname = usePathname();
  const loadSettings = useSettingsStore((s) => s.load);
  const loadPresets = usePresetStore((s) => s.load);
  const loadHistory = useAppStore((s) => s.loadHistory);
  const selectPreset = useAppStore((s) => s.selectPreset);

  useEffect(() => {
    if (pathname === "/login") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    Promise.all([loadSettings(), loadPresets()]).finally(() => {
      if (cancelled) return;

      const saved = loadUIState();
      if (saved.presetId) {
        const exists = usePresetStore.getState().getPreset(saved.presetId);
        if (exists) selectPreset(saved.presetId);
      }

      const hydrated: Record<string, unknown> = {};
      if (saved.statusFilter && VALID_STATUS.has(saved.statusFilter)) {
        hydrated.workspaceStatusFilter = saved.statusFilter;
      }
      if (saved.visibilityFilter && VALID_VISIBILITY.has(saved.visibilityFilter)) {
        hydrated.workspaceVisibilityFilter = saved.visibilityFilter;
      }
      if (saved.sortOrder && VALID_SORT.has(saved.sortOrder)) {
        hydrated.workspaceSortOrder = saved.sortOrder;
      }
      if (Object.keys(hydrated).length > 0) {
        useAppStore.setState(hydrated);
      }

      timer = setTimeout(() => {
        if (!cancelled) loadHistory();
      }, 250);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, loadSettings, loadPresets, loadHistory, selectPreset]);

  return null;
}
