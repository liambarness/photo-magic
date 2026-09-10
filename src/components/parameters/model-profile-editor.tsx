"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useModelProfileStore } from "@/stores/use-model-profile-store";
import {
  MODEL_WEARER_OPTIONS,
  type ModelFaceReference,
} from "@/lib/model-shot";
import { cleanExtension, cleanPathSegment, validateImageFile } from "@/lib/validation";
import type { ModelWearerType } from "@/types";

interface ModelProfileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: string | null;
}

type EditableFaceReference = ModelFaceReference & {
  file?: File;
  previewUrl: string;
};

function blobServingUrl(url: string): string {
  if (url.startsWith("/api/blob?")) return url;
  return `/api/blob?url=${encodeURIComponent(url)}`;
}

function imageContentType(file: File): string {
  if (file.type) return file.type;

  switch (cleanExtension(file.name)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function faceReferencePath(profileId: string, referenceId: string, file: File): string {
  const ext = cleanExtension(file.name);
  const safeProfileId = cleanPathSegment(profileId, "profile");
  const safeReferenceId = cleanPathSegment(referenceId, "reference");
  const baseName = file.name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "face-reference";

  return `model-face-references/${safeProfileId}/${safeReferenceId}/${baseName}.${ext}`;
}

function revokeLocalReferencePreviews(references: EditableFaceReference[]) {
  references.forEach((reference) => {
    if (reference.file && reference.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(reference.previewUrl);
    }
  });
}

export function ModelProfileEditor({
  open,
  onOpenChange,
  editId,
}: ModelProfileEditorProps) {
  const addProfile = useModelProfileStore((s) => s.addProfile);
  const updateProfile = useModelProfileStore((s) => s.updateProfile);
  const deleteProfile = useModelProfileStore((s) => s.deleteProfile);
  const getProfile = useModelProfileStore((s) => s.getProfile);

  const existing = editId ? getProfile(editId) : null;
  const isNew = !editId;
  const [name, setName] = useState(existing?.name ?? "");
  const [wearerType, setWearerType] = useState<ModelWearerType>(existing?.wearerType ?? "mens");
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [styling, setStyling] = useState(existing?.styling ?? "");
  const [faceReferences, setFaceReferences] = useState<EditableFaceReference[]>(() =>
    (existing?.faceReferences ?? []).map((reference) => ({
      ...reference,
      previewUrl: blobServingUrl(reference.url),
    }))
  );
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faceReferencesRef = useRef(faceReferences);

  useEffect(() => {
    faceReferencesRef.current = faceReferences;
  }, [faceReferences]);

  useEffect(() => {
    return () => {
      revokeLocalReferencePreviews(faceReferencesRef.current);
    };
  }, []);

  const handleAddFaceFiles = useCallback((files: File[]) => {
    const errors: string[] = [];
    const accepted: File[] = [];

    for (const file of files) {
      const error = validateImageFile(file);
      if (error) {
        errors.push(error);
        continue;
      }
      accepted.push(file);
    }

    if (errors.length > 0) {
      toast.error(errors[0]);
    }
    if (accepted.length === 0) return;

    setFaceReferences((current) => {
      const slots = Math.max(0, 4 - current.length);
      if (slots === 0) {
        toast.error("Use up to 4 face reference images.");
        return current;
      }

      const nextFiles = accepted.slice(0, slots);
      if (accepted.length > slots) {
        toast.error("Use up to 4 face reference images.");
      }

      const now = Date.now();
      return [
        ...current,
        ...nextFiles.map((file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          url: "",
          contentType: imageContentType(file),
          size: file.size,
          createdAt: now,
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
    });
  }, []);

  const handleRemoveFaceReference = useCallback((id: string) => {
    setFaceReferences((current) => {
      const target = current.find((reference) => reference.id === id);
      if (target) revokeLocalReferencePreviews([target]);
      return current.filter((reference) => reference.id !== id);
    });
  }, []);

  const uploadFaceReferences = useCallback(
    async (profileId: string): Promise<ModelFaceReference[]> => {
      const uploaded: ModelFaceReference[] = [];

      for (const reference of faceReferences) {
        if (!reference.file) {
          uploaded.push({
            id: reference.id,
            name: reference.name,
            url: reference.url,
            contentType: reference.contentType,
            size: reference.size,
            createdAt: reference.createdAt,
          });
          continue;
        }

        const contentType = imageContentType(reference.file);
        const blob = await upload(
          faceReferencePath(profileId, reference.id, reference.file),
          reference.file,
          {
            access: "private",
            handleUploadUrl: "/api/blob-upload",
            contentType,
            clientPayload: JSON.stringify({
              profileId,
              referenceId: reference.id,
              name: reference.name,
            }),
          }
        );

        uploaded.push({
          id: reference.id,
          name: reference.name,
          url: blob.url,
          contentType,
          size: reference.file.size,
          createdAt: reference.createdAt,
        });
      }

      return uploaded;
    },
    [faceReferences]
  );

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Give the model a name.");
      return;
    }
    const inferredKind = faceReferences.length > 0 ? "human" : "ai";
    if (inferredKind === "ai" && !prompt.trim()) {
      toast.error("Describe the model's appearance.");
      return;
    }

    const now = Date.now();
    const profileId = editId ?? crypto.randomUUID();
    setSaving(true);

    try {
      const uploadedFaceReferences = inferredKind === "human" ? await uploadFaceReferences(profileId) : undefined;

      if (isNew) {
        addProfile({
          id: profileId,
          kind: inferredKind,
          name: trimmedName,
          wearerType,
          prompt: prompt.trim(),
          styling: styling.trim(),
          faceReferences: uploadedFaceReferences,
          createdAt: now,
          updatedAt: now,
        });
        toast.success(`Created "${trimmedName}"`);
      } else if (editId) {
        updateProfile(editId, {
          kind: inferredKind,
          name: trimmedName,
          wearerType,
          prompt: prompt.trim(),
          styling: styling.trim(),
          faceReferences: uploadedFaceReferences,
        });
        toast.success(`Updated "${trimmedName}"`);
      }
      revokeLocalReferencePreviews(faceReferences);
      onOpenChange(false);
    } catch {
      toast.error("Face references could not be uploaded.");
    } finally {
      setSaving(false);
    }
  }, [name, prompt, faceReferences, editId, isNew, uploadFaceReferences, wearerType, styling, onOpenChange, addProfile, updateProfile]);

  const handleDelete = useCallback(() => {
    if (!editId) return;
    const confirmed = window.confirm(`Delete model profile "${name}"?`);
    if (!confirmed) return;
    deleteProfile(editId);
    toast.success(`Deleted "${name}"`);
    onOpenChange(false);
  }, [editId, name, deleteProfile, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(760px,92vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12">
          <DialogTitle>{isNew ? "New Model Profile" : "Edit Model Profile"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Define a model's appearance and default styling for consistent shots."
              : "Update this model's appearance or styling."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="mp-name">Name</Label>
            <Input
              id="mp-name"
              placeholder='e.g. "Surfer Guy", "Beach Model"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mp-wearer">Wearer Type</Label>
            <Select value={wearerType} onValueChange={(v) => setWearerType(v as ModelWearerType)}>
              <SelectTrigger id="mp-wearer" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_WEARER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mp-prompt">Appearance</Label>
            <Textarea
              id="mp-prompt"
              placeholder="e.g. 21 year old male, tan skin, blonde shaggy surfer hair, athletic lean build, relaxed smile"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-24 resize-y text-sm"
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground">
              Describe the model&apos;s physical appearance. If face images are added below, this text helps body, hair, and no-face crops stay consistent.
            </p>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <Label>Face References</Label>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="Face reference behavior"
                        />
                      }
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-64">
                      No images means this saves as an AI model. Add 1-4 face images to save it as a human model for face-visible shots.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Optional. Face-visible shots use these as identity references.
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                {faceReferences.length > 0 ? "Human" : "AI"} - {faceReferences.length}/4
              </Badge>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) handleAddFaceFiles(files);
                event.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleAddFaceFiles(Array.from(event.dataTransfer.files));
              }}
              className="flex min-h-20 w-full items-center justify-center rounded-md border border-dashed bg-background/70 px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Drop face images or browse
              </span>
            </button>

            {faceReferences.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {faceReferences.map((reference) => (
                  <div key={reference.id} className="group relative aspect-square overflow-hidden rounded-md border bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={reference.previewUrl}
                      alt={reference.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${reference.name}`}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full border border-destructive/20 bg-background/95 text-destructive opacity-0 shadow-sm transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => handleRemoveFaceReference(reference.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mp-styling">Default Styling</Label>
            <Textarea
              id="mp-styling"
              placeholder="e.g. dark navy chinos, white sneakers, no accessories, no watch"
              value={styling}
              onChange={(e) => setStyling(e.target.value)}
              className="min-h-20 resize-y text-sm"
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground">
              Outfit and accessories worn in every shot. Keeps pants, shoes, etc. consistent across all angles and crops.
            </p>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 rounded-none rounded-b-xl sm:justify-between">
          <div>
            {editId && !existing?.system && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isNew ? "Create Profile" : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
