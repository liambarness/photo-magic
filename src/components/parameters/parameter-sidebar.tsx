"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/use-app-store";
import { usePresetStore } from "@/stores/use-preset-store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Maximize2, Save } from "lucide-react";
import { PresetSelector } from "./preset-selector";
import { PresetEditorDialog } from "./preset-editor-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MODEL_POSE_OPTIONS,
  MODEL_PROFILE_AUTO_ID,
  MODEL_WEARER_OPTIONS,
  getModelPoseOption,
  getModelWearerOption,
  modelProfilesForWearer,
} from "@/lib/model-shot";
import {
  TOUCH_UP_STRENGTH_OPTIONS,
  getTouchUpStrengthOption,
} from "@/lib/touch-up";
import type {
  ModelPoseType,
  ModelProfileSelection,
  ModelWearerType,
  TouchUpStrength,
} from "@/types";

function SettingChoice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-8 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-foreground/40 bg-muted text-foreground shadow-sm"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function ParameterSidebar() {
  const activePreset = useAppStore((s) => s.activePreset);
  const updateNotes = useAppStore((s) => s.updateNotes);
  const saveNotes = useAppStore((s) => s.saveNotes);
  const updateModelShotOption = useAppStore((s) => s.updateModelShotOption);
  const updateTouchUpOption = useAppStore((s) => s.updateTouchUpOption);
  const getActivePrompt = useAppStore((s) => s.getActivePrompt);

  const preset = usePresetStore((s) =>
    activePreset.presetId ? s.presets.find((p) => p.id === activePreset.presetId) : null
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);

  const handleNew = () => {
    setEditId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditId(id);
    setEditorOpen(true);
  };

  const wearer = getModelWearerOption(activePreset.modelWearerType);
  const pose = getModelPoseOption(activePreset.modelPoseType);
  const modelProfiles = modelProfilesForWearer(wearer.value);
  const selectedModelProfile =
    activePreset.modelProfileId === MODEL_PROFILE_AUTO_ID
      ? null
      : modelProfiles.find((profile) => profile.id === activePreset.modelProfileId) ?? null;
  const touchUpStrength = getTouchUpStrengthOption(activePreset.touchUpStrength);
  const finalPrompt = getActivePrompt() ?? "";
  const promptWordCount = finalPrompt ? finalPrompt.trim().split(/\s+/).length : 0;

  const handleCopyPrompt = async () => {
    if (!finalPrompt) return;
    await navigator.clipboard.writeText(finalPrompt);
    toast.success("Final prompt copied");
  };

  return (
    <div className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-hidden border-b bg-background md:max-h-none md:w-[300px] md:border-b-0 md:border-r xl:w-[320px]">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Shot Settings</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <PresetSelector onNew={handleNew} onEdit={handleEdit} />

        {preset && (
          <>
            <div className="flex items-start justify-between gap-3 border-y py-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Current Shot
                </p>
                <p className="text-sm leading-snug text-foreground">
                  {preset.shotMode === "product"
                    ? "Product shot, no model"
                    : preset.shotMode === "model"
                      ? "Model shot, AI model generated"
                      : "Touch up existing model/product"}
                </p>
              </div>
              <Badge variant="outline" className="mt-0.5">
                {preset.shotMode === "model"
                  ? "Model"
                  : preset.shotMode === "touchup"
                    ? "Touch Up"
                    : "Product"}
              </Badge>
            </div>

            {preset.shotMode === "model" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Wearer
                    </label>
                    <span className="text-[11px] text-muted-foreground/60">{wearer.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MODEL_WEARER_OPTIONS.map((option) => (
                      <SettingChoice
                        key={option.value}
                        label={option.label}
                        active={activePreset.modelWearerType === option.value}
                        onClick={() => updateModelShotOption("modelWearerType", option.value as ModelWearerType)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Framing
                    </label>
                    <span className="text-[11px] text-muted-foreground/60">{pose.shortLabel}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MODEL_POSE_OPTIONS.map((option) => (
                      <SettingChoice
                        key={option.value}
                        label={option.shortLabel}
                        active={activePreset.modelPoseType === option.value}
                        onClick={() => updateModelShotOption("modelPoseType", option.value as ModelPoseType)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Model
                    </label>
                    <span className="text-[11px] text-muted-foreground/60">
                      {selectedModelProfile?.name ?? "Auto rotate"}
                    </span>
                  </div>
                  <Select
                    value={activePreset.modelProfileId || MODEL_PROFILE_AUTO_ID}
                    onValueChange={(value) =>
                      updateModelShotOption("modelProfileId", value as ModelProfileSelection)
                    }
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue>
                        {selectedModelProfile?.name ?? "Auto rotate by product group"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false} className="min-w-64">
                      <SelectItem value={MODEL_PROFILE_AUTO_ID}>Auto rotate by product group</SelectItem>
                      {modelProfiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                    Auto assigns one stable model per product group during upload review.
                  </p>
                </div>
              </div>
            )}

            {preset.shotMode === "touchup" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Cleanup
                    </label>
                    <span className="text-[11px] text-muted-foreground/60">
                      {touchUpStrength.shortLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TOUCH_UP_STRENGTH_OPTIONS.map((option) => (
                      <SettingChoice
                        key={option.value}
                        label={option.shortLabel}
                        active={activePreset.touchUpStrength === option.value}
                        onClick={() => updateTouchUpOption("touchUpStrength", option.value as TouchUpStrength)}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                  Preserves the existing model/person, pose, product fit, logo, artwork, and composition.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Additional Parameters
                </label>
                <span className="text-[11px] text-muted-foreground/60">
                  {activePreset.notes.trim().length} chars
                </span>
              </div>
              <Textarea
                rows={5}
                placeholder={`Extra instructions saved with this preset.\nExample: show the back logo, crop tighter, preserve tag placement.`}
                value={activePreset.notes}
                onChange={(e) => updateNotes(e.target.value)}
                onBlur={saveNotes}
                className="min-h-28 resize-y text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground/60">
                  Saved with this preset and appended to every upload.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={saveNotes}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>

          </>
        )}

        {!preset && activePreset.presetId === null && (
          <div className="border-y py-3">
            <p className="text-xs font-medium text-muted-foreground">Browsing All Products</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
              Pick a preset to tune shot settings, or choose one during upload review.
            </p>
          </div>
        )}
      </div>

      {preset && (
        <div className="shrink-0 border-t bg-background px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">Final Prompt</p>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  Read Only
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                {promptWordCount > 0 ? `${promptWordCount} words` : "Unavailable"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!finalPrompt}
                onClick={() => setPromptDialogOpen(true)}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                View
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!finalPrompt}
                aria-label="Copy final prompt"
                onClick={handleCopyPrompt}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <PresetEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editId={editId}
      />

      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-h-[85vh] gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="space-y-1">
                <DialogTitle>Final Prompt</DialogTitle>
                <DialogDescription>
                  Exact prompt used for new uploads with this preset.
                </DialogDescription>
              </div>
              {promptWordCount > 0 && (
                <Badge variant="outline" className="mt-0.5">
                  {promptWordCount} words
                </Badge>
              )}
            </div>
          </DialogHeader>
          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            <div
              role="textbox"
              aria-readonly="true"
              tabIndex={0}
              className="min-h-72 rounded-lg border bg-muted/25 p-4 text-sm leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {finalPrompt ? (
                <p className="whitespace-pre-wrap">{finalPrompt}</p>
              ) : (
                <p className="text-muted-foreground">
                  No final prompt available - try re-saving the preset.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2 rounded-b-xl border-t bg-muted/50 px-5 py-3">
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            <Button type="button" disabled={!finalPrompt} onClick={handleCopyPrompt}>
              <Copy className="h-3.5 w-3.5" />
              Copy Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
