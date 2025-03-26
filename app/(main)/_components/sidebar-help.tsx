"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Brain, FileText, Loader2, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";

export const SidebarHelp = () => {
  const params = useParams();
  const [showAll, setShowAll] = useState(false);
  
  const relevantKnowledge = useQuery(api.sideHelps.getSHRelevantKnowledge, {
    documentId: params.documentId as Id<"documents">
  });

  // Loading state
  if (relevantKnowledge === undefined) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No knowledge state
  if (!relevantKnowledge || relevantKnowledge.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Leaf className="h-8 w-8 mb-2" />
        <p>No relevant knowledge</p>
      </div>
    );
  }

  // Determine how many items to show
  const displayCount = showAll ? relevantKnowledge.length : Math.min(5, relevantKnowledge.length);
  const displayedKnowledge = relevantKnowledge.slice(0, displayCount);

  return (
    <div className="p-4 space-y-4">
      {displayedKnowledge.map(({ id, confidence, knowledge, sourceId, sourceTitle, sourceIcon, sourceType, sourceSection }) => (
        <KnowledgeBlock 
          key={id} 
          knowledgeId={id} 
          confidence={confidence} 
          knowledge={knowledge || ""}
          sourceId={sourceId}
          sourceTitle={sourceTitle}
          sourceIcon={sourceIcon}
          sourceType={sourceType}
          sourceSection={sourceSection}
        />
      ))}
      
      {relevantKnowledge.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition"
        >
          {showAll ? "Show less" : "Load more"}
        </button>
      )}
    </div>
  );
};

const KnowledgeBlock = ({
  knowledgeId,
  confidence,
  knowledge,
  sourceId,
  sourceTitle,
  sourceIcon,
  sourceType,
  sourceSection
}: {
  knowledgeId: Id<"knowledgeDatas">;
  confidence: number;
	knowledge: string | undefined;
	sourceId: Id<"documents">;
	sourceTitle: string;
	sourceIcon: string | undefined;
	sourceType: string;
	sourceSection: string | undefined;
}) => {

  const isFromDocument = sourceType === "document";
  const Icon = isFromDocument ? FileText : Brain;

  return (
    <div className="p-3 border rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{sourceTitle}</span>
      </div>
      <p className="text-sm">{knowledge}</p>
    </div>
  );
}; 