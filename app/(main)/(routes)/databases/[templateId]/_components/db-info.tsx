"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Brain, FileText, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConceptSelector } from "@/components/concept-selector";
import { cn } from "@/lib/utils";

interface DBInfoProps {
  templateId: Id<"objectTemplates">;
}

const ConceptCard = ({ concept }: { concept: any }) => {
  const router = useRouter();
  const knowledges = useQuery(api.knowledgeDatas.getKDsofConcept, { 
    conceptId: concept._id 
  });

  return (
    <div 
      onClick={() => concept.rootDocument && router.push(`/documents/${concept.rootDocument}`)}
      className="bg-secondary/50 rounded-xl p-4 hover:bg-secondary/70 transition mb-4 cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-2">
        <Brain className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">{concept.aliasList[0]}</h3>
      </div>
      {concept.description && (
        <p className="text-muted-foreground text-sm mb-3 line-clamp-3">
          {concept.description}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span>{knowledges?.length ?? 0} knowledge entries</span>
      </div>
    </div>
  );
};

const DBInfo = ({
  templateId
}: DBInfoProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState("");

  const template = useQuery(api.objectTemplates.getObjectTemplateById, {
    templateId
  });

  const updateTemplate = useMutation(api.objectTemplates.updateObjectTemplate);
  const updateTemplateConcept = useMutation(api.objectTemplates.updateObjectTemplateConcept);

  // Get the associated concept
  const concept = useQuery(api.concepts.getById, 
    template?.conceptId ? { conceptId: template.conceptId } : "skip"
  );

  // Initialize description when template loads
  useEffect(() => {
    if (template?.description) {
      setDescription(template.description);
    }
  }, [template?.description]);

  const handleDescriptionSave = async () => {
    if (!template) return;
    
    await updateTemplate({
      templateId,
      templateName: template.templateName,
      description: description.trim()
    });
    setIsEditing(false);
  };

  const handleConceptChange = async (conceptId: string | undefined) => {
    if (!template || !conceptId) return;
    
    await updateTemplateConcept({
      templateId,
      conceptId: conceptId as Id<"concepts">
    });
  };

  if (!template) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="md:max-w-3xl lg:max-w-4xl mx-auto p-6 space-y-8">
      {/* Description Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-semibold">Description</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for your database..."
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setDescription(template.description || "");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleDescriptionSave}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            {template.description || "No description provided."}
          </p>
        )}
      </div>

      {/* Associated Concept Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">Associated Concept</h2>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Concept</label>
            <ConceptSelector
              value={template.conceptId}
              onChange={handleConceptChange}
              buttonLabel="Select a concept for this database..."
            />
          </div>
          
          {concept && (
            <ConceptCard concept={concept} />
          )}
        </div>
      </div>
    </div>
  );
};

export default DBInfo; 