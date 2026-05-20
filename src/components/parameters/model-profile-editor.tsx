"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useModelProfileStore } from "@/stores/use-model-profile-store";
import { MODEL_WEARER_OPTIONS } from "@/lib/model-shot";
import type { ModelWearerType } from "@/types";

interface ModelProfileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: string | null;
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

  const [name, setName] = useState("");
  const [wearerType, setWearerType] = useState<ModelWearerType>("mens");
  const [prompt, setPrompt] = useState("");
  const [styling, setStyling] = useState("");

  const existing = editId ? getProfile(editId) : null;
  const isNew = !editId;

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setWearerType(existing.wearerType);
      setPrompt(existing.prompt);
      setStyling(existing.styling);
    } else {
      setName("");
      setWearerType("mens");
      setPrompt("");
      setStyling("");
    }
  }, [open, existing]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Give the model a name.");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Describe the model's appearance.");
      return;
    }

    const now = Date.now();
    if (isNew) {
      addProfile({
        id: crypto.randomUUID(),
        name: trimmedName,
        wearerType,
        prompt: prompt.trim(),
        styling: styling.trim(),
        createdAt: now,
        updatedAt: now,
      });
      toast.success(`Created "${trimmedName}"`);
    } else if (editId) {
      updateProfile(editId, {
        name: trimmedName,
        wearerType,
        prompt: prompt.trim(),
        styling: styling.trim(),
      });
      toast.success(`Updated "${trimmedName}"`);
    }
    onOpenChange(false);
  }, [name, wearerType, prompt, styling, isNew, editId, addProfile, updateProfile, onOpenChange]);

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Model Profile" : "Edit Model Profile"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Define a model's appearance and default styling for consistent shots."
              : "Update this model's appearance or styling."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              Describe the model's physical appearance. This keeps the same person across all shots.
            </p>
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

        <DialogFooter className="gap-2 sm:justify-between">
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
            <Button onClick={handleSave}>
              {isNew ? "Create Profile" : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
