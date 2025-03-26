"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Brain, FileText, Loader, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface KnowledgeTabProps {
  documentId: Id<"documents">;
}

interface Concept {
  _id: Id<"concepts">;
  aliasList: string[];
  description?: string;
  rootDocument?: Id<"documents">;
  kdCount?: number;
}

interface KnowledgeData {
  _id: Id<"knowledgeDatas">;
  knowledge?: string;
  sourceFile: string;
  sourceSection?: string;
}

const ConceptCard = ({ concept }: { concept: Concept }) => {
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

const KnowledgeBlock = ({
  knowledge,
  sourceId,
  sourceSection
}: {
  knowledge: string;
  sourceId: string;
  sourceSection: string | undefined;
}) => {
  const router = useRouter();
  const sourceDocument = useQuery(api.documents.getById, { documentId: sourceId as Id<"documents"> });

  if (!sourceDocument) return null;

  const isFromDocument = sourceDocument.type === "document";
  const Icon = isFromDocument ? FileText : Brain;

  return (
    <div 
      onClick={() => router.push(`/documents/${sourceId}`)}
      className="p-3 border rounded-lg cursor-pointer hover:bg-secondary/10 transition"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{sourceDocument.title}</span>
      </div>
      <p className="text-sm">{knowledge}</p>
    </div>
  );
};

const ConceptSection = ({ title, icon, concepts }: { title: string, icon: React.ReactNode, concepts: Concept[] }) => {
  if (!concepts?.length) return null;
  
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {concepts.map((concept) => (
          <ConceptCard key={concept._id} concept={concept} />
        ))}
      </div>
    </div>
  );
};

const KnowledgeTab = ({ documentId }: KnowledgeTabProps) => {
  const document = useQuery(api.documents.getById, { documentId });
  const concepts = useQuery(api.concepts.getVisibleConcepts);

  // For concept type
  const childConcepts = useQuery(api.concepts.getConceptsByObjectConceptId, 
    document?.type === "concept" ? { conceptId: document.typePropsID as Id<"concepts"> } : "skip"
  );
  const parentConcepts = useQuery(api.concepts.getObjectConceptsByConceptId,
    document?.type === "concept" ? { conceptId: document.typePropsID as Id<"concepts"> } : "skip"
  );
  const knowledges = useQuery(api.knowledgeDatas.getKDsofConcept,
    document?.type === "concept" ? { conceptId: document.typePropsID as Id<"concepts"> } : "skip"
  );
  const conceptDetails = useQuery(api.concepts.getById,
    document?.type === "concept" ? { conceptId: document.typePropsID as Id<"concepts"> } : "skip"
  );

  if (!document || !concepts || (document.type === "concept" && (!childConcepts || !parentConcepts || !knowledges || !conceptDetails))) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // Handle concept type document
  if (document.type === "concept") {
    const hasContent = (childConcepts?.length || 0) > 0 || 
                      (parentConcepts?.length || 0) > 0 || 
                      (knowledges?.length || 0) > 0;

    if (!hasContent) {
      return (
        <div className="h-full flex flex-col items-center justify-center">
          <Brain className="h-12 w-12 text-muted-foreground mb-2" />
          <h3 className="font-medium text-muted-foreground">No related content found</h3>
        </div>
      );
    }

    return (
      <div className="md:max-w-3xl lg:max-w-4xl mx-auto p-6 space-y-8">
        {conceptDetails?.description && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-semibold">Description</h2>
            </div>
            <p className="text-muted-foreground">{conceptDetails.description}</p>
          </div>
        )}
        
        <ConceptSection 
          title="Parent Concepts" 
          icon={<ArrowUpCircle className="h-6 w-6 text-primary" />}
          concepts={parentConcepts || []}
        />
        
        <ConceptSection 
          title="Child Concepts" 
          icon={<ArrowDownCircle className="h-6 w-6 text-primary" />}
          concepts={childConcepts || []}
        />

        {knowledges && knowledges.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-semibold">Knowledge Entries</h2>
            </div>
            <div className="space-y-4">
              {knowledges.map((kd) => (
                <KnowledgeBlock
                  key={kd._id}
                  knowledge={kd.extractedKnowledge || ""}
                  sourceId={kd.sourceId}
                  sourceSection={kd.sourceSection}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Handle regular document type
  const mentionedConceptIds = document.fileInspect?.fileMentionedConcepts || [];
  const relevantConcepts = concepts.filter(concept => 
    mentionedConceptIds.includes(concept._id)
  );

  if (relevantConcepts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <Brain className="h-12 w-12 text-muted-foreground mb-2" />
        <h3 className="font-medium text-muted-foreground">No concepts found in this document</h3>
      </div>
    );
  }

  return (
    <div className="md:max-w-3xl lg:max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Brain className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold">Mentioned Concepts</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {relevantConcepts.map((concept) => (
          <ConceptCard key={concept._id} concept={concept} />
        ))}
      </div>
    </div>
  );
};

export default KnowledgeTab; 