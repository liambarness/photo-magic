"use client";

import { useMemo } from "react";
import { usePresetStore } from "@/stores/use-preset-store";
import { useAppStore } from "@/stores/use-app-store";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";
import type { Preset } from "@/types";

interface PresetSelectorProps {
  onNew: () => void;
  onEdit: (id: string) => void;
}

function sortByName(a: Preset, b: Preset) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function PresetOption({ preset }: { preset: Preset }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="truncate">{preset.name}</span>
      <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {preset.shotMode === "model" ? "Model" : "Product"}
      </span>
    </span>
  );
}

export function PresetSelector({ onNew, onEdit }: PresetSelectorProps) {
  const presets = usePresetStore((s) => s.presets);
  const loaded = usePresetStore((s) => s._loaded);
  const activePresetId = useAppStore((s) => s.activePreset.presetId);
  const selectPreset = useAppStore((s) => s.selectPreset);
  const clearPreset = useAppStore((s) => s.clearPreset);

  const groupedPresets = useMemo(
    () => ({
      product: presets.filter((p) => p.shotMode === "product").sort(sortByName),
      model: presets.filter((p) => p.shotMode === "model").sort(sortByName),
    }),
    [presets]
  );

  if (!loaded) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">Loading presets...</p>
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">No presets yet</p>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create Preset
        </Button>
      </div>
    );
  }

  const activePreset = activePresetId
    ? presets.find((p) => p.id === activePresetId)
    : null;
  const activeName = activePreset?.name ?? "All Products";

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">Preset</label>
      <div className="flex gap-1.5">
        <Select
          value={activePresetId ?? "__all_products__"}
          onValueChange={(v) => {
            if (!v || v === "__all_products__") clearPreset();
            else selectPreset(v);
          }}
        >
          <SelectTrigger className="h-8 flex-1 text-sm">
            <SelectValue placeholder="Select a preset...">{activeName}</SelectValue>
          </SelectTrigger>
          <SelectContent
            align="start"
            alignItemWithTrigger={false}
            className="min-w-64"
            side="bottom"
            sideOffset={6}
          >
            <SelectItem value="__all_products__" className="py-1.5">
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate">All Products</span>
                <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  All
                </span>
              </span>
            </SelectItem>
            <SelectSeparator />
            {groupedPresets.product.length > 0 && (
              <SelectGroup>
                <SelectLabel>Product Shots</SelectLabel>
                {groupedPresets.product.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="py-1.5">
                    <PresetOption preset={p} />
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {groupedPresets.product.length > 0 && groupedPresets.model.length > 0 && (
              <SelectSeparator />
            )}
            {groupedPresets.model.length > 0 && (
              <SelectGroup>
                <SelectLabel>Model Shots</SelectLabel>
                {groupedPresets.model.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="py-1.5">
                    <PresetOption preset={p} />
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {activePresetId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            aria-label="Edit preset"
            onClick={() => onEdit(activePresetId)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Create preset"
          onClick={onNew}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
