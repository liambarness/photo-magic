"use client";

import { useEffect } from "react";
import { usePresetStore } from "@/stores/use-preset-store";
import { useAppStore } from "@/stores/use-app-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";

interface PresetSelectorProps {
  onNew: () => void;
  onEdit: (id: string) => void;
}

export function PresetSelector({ onNew, onEdit }: PresetSelectorProps) {
  const presets = usePresetStore((s) => s.presets);
  const activePresetId = useAppStore((s) => s.activePreset.presetId);
  const selectPreset = useAppStore((s) => s.selectPreset);
  const clearPreset = useAppStore((s) => s.clearPreset);

  useEffect(() => {
    if (presets.length > 0 && !activePresetId) {
      selectPreset(presets[0].id);
    }
  }, [presets, activePresetId, selectPreset]);

  if (presets.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-4 text-center space-y-2">
        <p className="text-sm text-muted-foreground">No presets yet</p>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Preset
        </Button>
      </div>
    );
  }

  const activeName = activePresetId
    ? presets.find((p) => p.id === activePresetId)?.name ?? "Select..."
    : "None";

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">Preset</label>
      <div className="flex gap-1.5">
        <Select
          value={activePresetId ?? "__none__"}
          onValueChange={(v) => {
            if (!v || v === "__none__") clearPreset();
            else selectPreset(v);
          }}
        >
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue placeholder="Select a preset...">{activeName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activePresetId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => onEdit(activePresetId)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          onClick={onNew}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
