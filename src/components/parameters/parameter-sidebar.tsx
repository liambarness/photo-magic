"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/use-app-store";
import { usePresetStore } from "@/stores/use-preset-store";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import { MODEL_GENDER_OPTIONS, MODEL_BUILD_OPTIONS } from "@/lib/constants";
import { PresetSelector } from "./preset-selector";
import { PresetEditorDialog } from "./preset-editor-dialog";

export function ParameterSidebar() {
  const activePreset = useAppStore((s) => s.activePreset);
  const updateNotes = useAppStore((s) => s.updateNotes);
  const updateModelOption = useAppStore((s) => s.updateModelOption);
  const updatePreset = usePresetStore((s) => s.updatePreset);

  const preset = usePresetStore((s) =>
    activePreset.presetId ? s.presets.find((p) => p.id === activePreset.presetId) : null
  );

  const [showPrompt, setShowPrompt] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleNew = () => {
    setEditId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditId(id);
    setEditorOpen(true);
  };

  const genderLabel = MODEL_GENDER_OPTIONS.find((o) => o.value === activePreset.modelGender)?.label ?? "Varied";
  const buildLabel = MODEL_BUILD_OPTIONS.find((o) => o.value === activePreset.modelBuild)?.label ?? "Varied";

  return (
    <div className="max-h-[45vh] w-full shrink-0 overflow-y-auto border-b md:max-h-none md:w-[260px] md:border-b-0 md:border-r">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Shot Settings</h2>
      </div>

      <div className="px-4 py-3 space-y-3">
        <PresetSelector onNew={handleNew} onEdit={handleEdit} />

        {preset && (
          <>
            <div className="text-[11px] text-muted-foreground/60">
              {preset.shotMode === "product"
                ? "Product shot — no model"
                : "Model shot — worn or held"}
            </div>

            {preset.shotMode === "model" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Gender</label>
                  <Select
                    value={activePreset.modelGender || "varied"}
                    onValueChange={(v) => v && updateModelOption("modelGender", v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue>{genderLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_GENDER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Body Type</label>
                  <Select
                    value={activePreset.modelBuild || "varied"}
                    onValueChange={(v) => v && updateModelOption("modelBuild", v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue>{buildLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_BUILD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Batch Notes</label>
              <Textarea
                placeholder="Optional per-batch overrides: show back logo, cropped fit..."
                value={activePreset.notes}
                onChange={(e) => updateNotes(e.target.value)}
                className="text-sm min-h-16 resize-y"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Appended to the preset prompt for this batch only.
              </p>
            </div>

            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showPrompt ? "" : "-rotate-90"}`} />
              Prompt
            </button>
            {showPrompt && (
              <div className="space-y-1">
                <Textarea
                  value={preset.polishedPrompt ?? ""}
                  onChange={(e) => updatePreset(preset.id, { polishedPrompt: e.target.value })}
                  placeholder="No prompt generated — try re-saving the preset."
                  className="text-[11px] font-mono leading-relaxed min-h-32 resize-y"
                />
                <p className="text-[11px] text-muted-foreground/60">
                  Auto-generated on preset save. Edit directly if needed.
                </p>
              </div>
            )}
          </>
        )}

        {!preset && activePreset.presetId === null && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Select or create a preset to get started.
          </p>
        )}
      </div>

      <PresetEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editId={editId}
      />
    </div>
  );
}
