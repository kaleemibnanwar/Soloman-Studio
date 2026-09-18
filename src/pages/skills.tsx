import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { ipc } from "@/ipc/types";
import type { Skill } from "@/ipc/types/skill";
import { queryKeys } from "@/lib/queryKeys";
import { showError, showSuccess } from "@/lib/toast";
import { BackButton } from "@/components/ui/back-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SkillFormState {
  name: string;
  description: string;
  instructions: string;
}

function emptyForm(): SkillFormState {
  return { name: "", description: "", instructions: "" };
}

export default function SkillsPage() {
  const { data: skills = [], isLoading } = useQuery({
    queryKey: queryKeys.skills.list,
    queryFn: async () => (await ipc.skill.listSkills()).skills,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [form, setForm] = useState<SkillFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);

  const patch = (partial: Partial<SkillFormState>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const openCreate = () => {
    setEditingSkill(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setForm({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.description.trim() || !form.instructions.trim()) {
      showError("Name, description, and instructions are all required.");
      return;
    }
    setSaving(true);
    try {
      if (editingSkill) {
        await ipc.skill.updateSkill({
          skillId: editingSkill.id,
          name: form.name.trim(),
          description: form.description.trim(),
          instructions: form.instructions.trim(),
        });
        showSuccess("Skill updated");
      } else {
        await ipc.skill.createSkill({
          name: form.name.trim(),
          description: form.description.trim(),
          instructions: form.instructions.trim(),
        });
        showSuccess("Skill created");
      }
      setDialogOpen(false);
      // The invalidation bus refreshes the list automatically.
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to save skill",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSkill) return;
    try {
      await ipc.skill.deleteSkill(deletingSkill.id);
      showSuccess("Skill deleted");
      setDeletingSkill(null);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to delete skill",
      );
    }
  };

  return (
    <div className="min-h-screen w-full px-8 py-4">
      <div className="max-w-3xl mx-auto pb-12">
        <BackButton />

        <SectionHeading
          className="mb-6"
          size="page"
          eyebrow="Library"
          title="Skills"
          action={<Button onClick={openCreate}>New skill</Button>}
        />

        <p className="mb-6 text-sm text-muted-foreground">
          Saved, reusable instructions the agent can look up by name — type{" "}
          <code className="rounded-sm border border-border bg-muted px-1 py-0.5 font-mono text-xs">
            /skill-name
          </code>{" "}
          in a chat, or let the agent decide when one applies.
        </p>

        {isLoading ? (
          <div className="py-8 text-sm text-muted-foreground">Loading…</div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Sparkles className="size-7" />
            <div>
              <p className="text-sm font-medium text-foreground">
                No skills yet
              </p>
              <p className="mt-1 text-xs">
                Create one, or ask the agent to save one for you.
              </p>
            </div>
            <Button onClick={openCreate} className="mt-2">
              New skill
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] font-medium text-foreground">
                    {skill.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {skill.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit"
                    onClick={() => openEdit(skill)}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    onClick={() => setDeletingSkill(skill)}
                  >
                    <Trash2 size={15} className="text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSkill ? "Edit skill" : "New skill"}
            </DialogTitle>
            <DialogDescription>
              A name, when to use it, and the full instructions to follow.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-name">Name</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. deploy-checklist"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase, hyphenated — this is what you type after{" "}
                <code className="font-mono">/</code> and what the agent calls
                it by.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-description">
                When should the agent use this?
              </Label>
              <Textarea
                id="skill-description"
                rows={2}
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="A short description of the situation this applies to."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-instructions">Instructions</Label>
              <Textarea
                id="skill-instructions"
                rows={10}
                value={form.instructions}
                onChange={(e) => patch({ instructions: e.target.value })}
                placeholder="The full steps the agent should follow."
                className="font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Saving..."
                : editingSkill
                  ? "Save changes"
                  : "Create skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingSkill != null}
        onOpenChange={(open) => {
          if (!open) setDeletingSkill(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete skill</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deletingSkill?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
