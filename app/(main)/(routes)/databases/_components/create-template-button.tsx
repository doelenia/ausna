"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
	CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { SEARCH_RESULTS_MULTIPLE_RESULTS_FOUND } from "emoji-picker-react/dist/config/config";
import { ConceptSelector } from "@/components/concept-selector";

interface ConceptResult {
  conceptId: Id<"concepts">;
  documentTitle?: string;
}

interface ConceptDoc {
  _id: Id<"concepts">;
  aliases?: string[];
  description?: string;
}

export function CreateTemplateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    templateName: "",
    description: "",
    conceptId: undefined as string | undefined,
  });

  const addTemplate = useAction(api.objectTemplates.addObjectTemplate);

  const handleSubmit = async () => {
    if (!formData.templateName.trim()) return;

    try {
      setIsCreating(true);
      const templateId = await addTemplate({
        templateName: formData.templateName.trim(),
        description: formData.description.trim() || undefined,
        conceptId: formData.conceptId as any || undefined,
      });

      router.push(`/databases/${templateId}`);
      setOpen(false);
      setFormData({
        templateName: "",
        description: "",
        conceptId: undefined,
      });
    } catch (error) {
      console.error("Failed to create template:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        New Database
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Database</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Database Name</Label>
              <Input
                placeholder="Enter database name"
                value={formData.templateName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    templateName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                placeholder="Enter database description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Backed Concept (Optional)</Label>
              <ConceptSelector
                value={formData.conceptId}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    conceptId: value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.templateName.trim() || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
} 
