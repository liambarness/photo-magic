"use client";

import { useMemo, useRef } from "react";
import type { PhotoSettings, Preset } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Check, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PendingUploadItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface UploadReviewDialogProps {
  open: boolean;
  items: PendingUploadItem[];
  settings: PhotoSettings | null;
  prompt: string;
  processingSettings: {
    imageSize: string;
    imageQuality: string;
    outputFormat: string;
    concurrency: number;
  };
  presets: Preset[];
  selectedPresetId: string | null;
  additionalParameters: string;
  onPresetChange: (presetId: string) => void;
  onAdditionalParametersChange: (value: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveItem: (itemId: string) => void;
  onApprove: () => void;
  onCancel: () => void;
}

function settingLabel(value: string | undefined) {
  if (!value) return "Varied";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function sortByName(a: Preset, b: Preset) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function previewGridClass(count: number): string {
  if (count <= 1) return "mx-auto grid w-full max-w-[min(520px,calc(92vh-230px))] grid-cols-1";
  if (count === 2) return "mx-auto grid w-full max-w-[760px] grid-cols-2 gap-4";
  if (count === 3) return "mx-auto grid w-full max-w-[900px] grid-cols-3 gap-4";
  if (count <= 5) return "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3";
  if (count <= 10) return "grid grid-cols-[repeat(auto-fill,minmax(138px,1fr))] gap-3";
  if (count <= 15) return "grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5";
  if (count <= 20) return "grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5";
  return "grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2";
}

function previewTileClass(count: number): string {
  if (count <= 1) return "aspect-square w-full";
  return "aspect-square w-full";
}

function previewNameClass(count: number): string {
  if (count > 10) return "hidden";
  if (count <= 1) return "text-sm";
  return "text-xs";
}

function removeButtonClass(count: number): string {
  return count > 10 ? "right-1.5 top-1.5 size-6" : "right-2 top-2 size-7";
}

export function UploadReviewDialog({
  open,
  items,
  settings,
  prompt,
  processingSettings,
  presets,
  selectedPresetId,
  additionalParameters,
  onPresetChange,
  onAdditionalParametersChange,
  onAddFiles,
  onRemoveItem,
  onApprove,
  onCancel,
}: UploadReviewDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupedPresets = useMemo(
    () => ({
      product: presets.filter((p) => p.shotMode === "product").sort(sortByName),
      model: presets.filter((p) => p.shotMode === "model").sort(sortByName),
    }),
    [presets]
  );
  const count = items.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="flex h-[min(860px,92vh)] max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-[min(1180px,calc(100vw-2rem))] xl:max-w-[1240px]">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-lg">Review Upload</DialogTitle>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{count} image{count !== 1 ? "s" : ""} ready</span>
            {settings?.presetName && <span>{settings.presetName}</span>}
            <span>{processingSettings.imageSize}</span>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            <div className={previewGridClass(count)}>
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "relative overflow-hidden rounded-md border bg-background",
                    previewTileClass(count)
                  )}
                  title={item.file.name}
                >
                  <button
                    type="button"
                    aria-label={`Remove ${item.file.name} from upload`}
                    className={cn(
                      "absolute z-10 flex items-center justify-center rounded-full border border-destructive/20 bg-background/95 text-destructive shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
                      removeButtonClass(count)
                    )}
                    onClick={() => onRemoveItem(item.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="absolute inset-0 flex items-center justify-center bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div
                    className={cn(
                      "absolute inset-x-0 bottom-0 truncate bg-background/90 px-2 py-1.5 text-muted-foreground backdrop-blur",
                      previewNameClass(count)
                    )}
                  >
                    {item.file.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 px-5 py-5 lg:border-l lg:border-t-0">
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Settings
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  These values will be applied to this upload only.
                </p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Preset</span>
                  <Select
                    value={selectedPresetId ?? ""}
                    onValueChange={(value) => value && onPresetChange(value)}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder="Choose preset...">
                        {settings?.presetName ?? "Choose preset..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      className="min-w-56"
                      side="bottom"
                      sideOffset={6}
                    >
                      {groupedPresets.product.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Product Shots</SelectLabel>
                          {groupedPresets.product.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.name}
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
                          {groupedPresets.model.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {!selectedPresetId && (
                    <p className="text-xs text-destructive">
                      Choose a preset before approving this upload.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Shot</span>
                  <Badge variant="outline">{settings?.shotMode === "model" ? "Model" : "Product"}</Badge>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Additional Parameters</span>
                  <Textarea
                    value={additionalParameters}
                    onChange={(e) => onAdditionalParametersChange(e.target.value)}
                    placeholder="Optional one-off instructions for this upload..."
                    className="min-h-20 resize-y text-sm"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                    Applied only to this reviewed upload and reflected in the final prompt below.
                  </p>
                </div>
                {settings?.shotMode === "model" && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Gender</span>
                      <span>{settingLabel(settings.modelGender)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Body</span>
                      <span>{settingLabel(settings.modelBuild)}</span>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2 rounded-md border bg-background/70 p-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground">Size</span>
                    <p>{processingSettings.imageSize}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground">Quality</span>
                    <p>{settingLabel(processingSettings.imageQuality)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground">Format</span>
                    <p className="uppercase">{processingSettings.outputFormat}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground">Parallel</span>
                    <p>{processingSettings.concurrency}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-5 space-y-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Final Prompt
              </h3>
              <p className="max-h-44 overflow-y-auto rounded-md border bg-background/70 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                {prompt || "Choose a preset to preview the final prompt."}
              </p>
            </section>
          </aside>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t bg-background px-6 py-4 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onAddFiles(files);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Add Images
          </Button>
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {selectedPresetId
              ? `Ready to process ${count} image${count !== 1 ? "s" : ""}.`
              : "Choose a preset before approving."}
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={onCancel}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={onApprove}
              disabled={items.length === 0 || !prompt || !selectedPresetId}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
