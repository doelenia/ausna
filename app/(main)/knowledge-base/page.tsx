
"use client";

import { useUser } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Brain, FileText, Loader } from "lucide-react";

const ConceptCard = ({ concept }: { concept: any }) => {
  const router = useRouter();

  return (
    <div 
      onClick={() => concept.rootDocument && router.push(`/documents/${concept.rootDocument}`)}
      className="bg-secondary/50 rounded-xl p-4 cursor-pointer hover:bg-secondary/70 transition mb-4"
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
        <span>{concept.kdCount} knowledge entries</span>
      </div>
    </div>
  );
};

const KnowledgeBasePage = () => {
  const { user } = useUser();
  const router = useRouter();
  const concepts = useQuery(api.concepts.getVisibleConcepts);

  // Protect the route
  useEffect(() => {
    if (!user) {
      router.push("/");
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="h-full flex-1 flex-col space-y-4 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Knowledge Base</h2>
          <p className="text-muted-foreground">
            Explore your concepts and their associated knowledge
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-4 pt-4">
        {concepts === undefined ? (
          <div className="h-full flex items-center justify-center">
            <Loader className="h-6 w-6 text-muted-foreground animate-spin" />
          </div>
        ) : concepts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Brain className="h-12 w-12 text-muted-foreground mb-2" />
            <h3 className="font-medium text-muted-foreground">No concepts found</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {concepts.map((concept) => (
              <ConceptCard key={concept._id} concept={concept} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBasePage; 