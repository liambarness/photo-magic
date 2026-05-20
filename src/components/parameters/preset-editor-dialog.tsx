"use client";

import { useState } from "react";
import type { Preset } from "@/types";
import { usePresetStore, createPresetShell } from "@/stores/use-preset-store";
import { useAppStore } from "@/stores/use-app-store";
import { useSettingsStore } from "@/stores/use-settings-store";
import { buildFallbackPrompt } from "@/lib/prompt-builder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SHOT_MODE_OPTIONS, FRAMING_OPTIONS } from "@/lib/constants";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PresetEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: string | null;
}

interface PresetEditorFormProps {
  editId: string | null;
  existing: Preset | null;
  onOpenChange: (open: boolean) => void;
}

export function PresetEditorDialog({ open, onOpenChange, editId }: PresetEditorDialogProps) {
  const existing = usePresetStore((s) =>
    editId ? s.presets.find((p) => p.id === editId) ?? null : null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <PresetEditorForm
          key={editId ?? "new"}
          editId={editId}
          existing={existing}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function PresetEditorForm({ editId, existing, onOpenChange }: PresetEditorFormProps) {
  const addPreset = usePresetStore((s) => s.addPreset);
  const updatePreset = usePresetStore((s) => s.updatePreset);
  const deletePreset = usePresetStore((s) => s.deletePreset);
  const selectPreset = useAppStore((s) => s.selectPreset);
  const clearPreset = useAppStore((s) => s.clearPreset);
  const activePresetId = useAppStore((s) => s.activePreset.presetId);
  const brandRules = useSettingsStore((s) => s.brandRules);
  const background = useSettingsStore((s) => s.background);

  const [name, setName] = useState(existing?.name ?? "");
  const [shotMode, setShotMode] = useState<"product" | "model">(
    existing?.shotMode ?? "product"
  );
  const [framing, setFraming] = useState(existing?.framing ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [saving, setSaving] = useState(false);

  const polishPrompt = async (
    data: Pick<Preset, "name" | "shotMode" | "framing" | "description">
  ): Promise<string> => {
    try {
      const res = await fetch("/api/polish-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetName: data.name,
          shotMode: data.shotMode,
          framing: data.framing,
          description: data.description,
          brandRules,
          background,
        }),
      });
      if (!res.ok) throw new Error("Prompt polish failed");

      const json = await res.json();
      if (typeof json.prompt === "string" && json.prompt.trim()) {
        return json.prompt;
      }
    } catch {}

    const shell = { ...createPresetShell(data.name), ...data, polishedPrompt: null };
    return buildFallbackPrompt(shell, brandRules, background);
  };

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);

    const data = {
      name: name.trim(),
      shotMode,
      framing: shotMode === "model" ? framing : "",
      description: description.trim(),
    };

    const prompt = await polishPrompt(data);

    if (editId && existing) {
      updatePreset(editId, { ...data, polishedPrompt: prompt });
      if (activePresetId === editId) selectPreset(editId);
    } else {
      const preset: Preset = {
        ...createPresetShell(data.name),
        ...data,
        polishedPrompt: prompt,
      };
      addPreset(preset);
      selectPreset(preset.id);
    }

    setSaving(false);
    toast.success(editId ? "Preset updated" : "Preset created");
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!editId) return;
    const confirmed = window.confirm(
      `Delete preset "${existing?.name ?? "this preset"}"? Existing generated images will remain, but this preset cannot be restored.`
    );
    if (!confirmed) return;
    if (activePresetId === editId) clearPreset();
    deletePreset(editId);
    onOpenChange(false);
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
      <DialogHeader className="border-b px-7 pt-6 pb-4">
        <DialogTitle className="text-lg">{editId ? "Edit Preset" : "Create Preset"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-6 overflow-y-auto px-7 py-6">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="preset-name">
            Product Type
          </label>
          <Input
            id="preset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trucker Hat, Boardshorts, Candle, Surfboard..."
            className="h-10 text-base"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Shot Type</label>
          <div className="flex w-fit overflow-hidden rounded-lg border">
            {SHOT_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setShotMode(opt.value)}
                className={`px-5 py-2 text-sm transition-colors ${
                  shotMode === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            {shotMode === "model"
              ? "Product worn or held by a model. Gender and body type are set per batch."
              : "Product only - no person in the shot."}
          </p>
        </div>

        {shotMode === "model" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Framing</label>
            <div className="flex w-fit flex-wrap overflow-hidden rounded-lg border">
              {FRAMING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFraming(opt.value)}
                  className={`px-4 py-2 text-sm transition-colors ${
                    framing === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="preset-description">
            Description
          </label>
          <div className="space-y-1 rounded-md bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground/70">
            <p className="font-medium text-muted-foreground">Already handled by the system:</p>
            <ul className="list-disc space-y-0.5 pl-3.5">
              <li>Light grey studio background (#EBEBEB)</li>
              <li>Clean, catalog-style lighting and aesthetic</li>
              <li>Brand rules (preserve design, no invented graphics)</li>
              {shotMode === "model" && <li>Model appearance is varied automatically</li>}
            </ul>
            <p className="pt-1 font-medium text-muted-foreground">
              Describe what makes this product type unique:
            </p>
            <ul className="list-disc space-y-0.5 pl-3.5">
              <li>What details to emphasize (logo, print, texture)</li>
              <li>How the product should sit or drape</li>
            </ul>
          </div>
          <Textarea
            id="preset-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. casual standing pose, show print detail, hat slightly angled to show front logo..."
            className="min-h-36 resize-y text-base leading-relaxed"
          />
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 rounded-none px-7 py-4">
        {editId && (
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {editId ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
