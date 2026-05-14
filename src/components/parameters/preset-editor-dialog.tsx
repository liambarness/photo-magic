"use client";

import { useState, useEffect } from "react";
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

export function PresetEditorDialog({ open, onOpenChange, editId }: PresetEditorDialogProps) {
  const addPreset = usePresetStore((s) => s.addPreset);
  const updatePreset = usePresetStore((s) => s.updatePreset);
  const deletePreset = usePresetStore((s) => s.deletePreset);
  const existing = usePresetStore((s) => (editId ? s.presets.find((p) => p.id === editId) : null));
  const selectPreset = useAppStore((s) => s.selectPreset);
  const clearPreset = useAppStore((s) => s.clearPreset);
  const activePresetId = useAppStore((s) => s.activePreset.presetId);
  const brandRules = useSettingsStore((s) => s.brandRules);
  const background = useSettingsStore((s) => s.background);

  const [name, setName] = useState("");
  const [shotMode, setShotMode] = useState<"product" | "model">("product");
  const [framing, setFraming] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name);
        setShotMode(existing.shotMode);
        setFraming(existing.framing ?? "");
        setDescription(existing.description);
      } else {
        setName("");
        setShotMode("product");
        setFraming("");
        setDescription("");
      }
    }
  }, [open, existing]);

  const polishPrompt = async (data: Pick<Preset, "name" | "shotMode" | "framing" | "description">): Promise<string> => {
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
      const json = await res.json();
      if (json.prompt) return json.prompt;
    } catch {}
    const shell = { ...createPresetShell(data.name), ...data, polishedPrompt: null };
    return buildFallbackPrompt(shell, brandRules, background);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
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
    if (activePresetId === editId) clearPreset();
    deletePreset(editId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit Preset" : "Create Preset"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Product Type</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trucker Hat, Boardshorts, Candle, Surfboard..."
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Shot Type</label>
            <div className="flex rounded-lg border overflow-hidden w-fit">
              {SHOT_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setShotMode(opt.value as "product" | "model")}
                  className={`px-4 py-1.5 text-sm transition-colors ${
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
                : "Product only — no person in the shot."}
            </p>
          </div>

          {shotMode === "model" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Framing</label>
              <div className="flex rounded-lg border overflow-hidden w-fit">
                {FRAMING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFraming(opt.value)}
                    className={`px-3 py-1.5 text-sm transition-colors ${
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <div className="text-[11px] text-muted-foreground/70 bg-muted/30 rounded-md p-2.5 space-y-1">
              <p className="font-medium text-muted-foreground">Already handled by the system:</p>
              <ul className="list-disc pl-3.5 space-y-0.5">
                <li>Light grey studio background (#EBEBEB)</li>
                <li>Clean, catalog-style lighting and aesthetic</li>
                <li>Brand rules (preserve design, no invented graphics)</li>
                {shotMode === "model" && <li>Model appearance is varied automatically</li>}
              </ul>
              <p className="font-medium text-muted-foreground pt-1">Describe what makes this product type unique:</p>
              <ul className="list-disc pl-3.5 space-y-0.5">
                <li>What details to emphasize (logo, print, texture)</li>
                <li>How the product should sit or drape</li>
              </ul>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. casual standing pose, show print detail, hat slightly angled to show front logo..."
              className="text-sm min-h-24 resize-y"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          {editId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive mr-auto"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editId ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
