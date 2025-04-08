"use client";

import { useUser } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Database, Loader2, FileText } from "lucide-react";
import { CreateTemplateButton } from "./_components/create-template-button";

interface TemplateCardProps {
  template: {
    _id: string;
    templateName: string;
    description?: string;
    objectTagCount: number;
  };
}

const TemplateCard = ({ template }: TemplateCardProps) => {
  const router = useRouter();

  return (
    <div 
      onClick={() => router.push(`/databases/${template._id}`)}
      className="bg-secondary/50 rounded-xl p-4 cursor-pointer hover:bg-secondary/70 transition mb-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <Database className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">{template.templateName}</h3>
      </div>
      {template.description && (
        <p className="text-muted-foreground text-sm mb-3 line-clamp-3">
          {template.description}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span>{template.objectTagCount} entries</span>
      </div>
    </div>
  );
};

const DatabasesPage = () => {
  const { user } = useUser();
  const router = useRouter();
  const templates = useQuery(api.objectTemplates.getAllTemplatesWithCounts);

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
          <h2 className="text-2xl font-bold tracking-tight">Databases</h2>
          <p className="text-muted-foreground">
            Manage and explore your database connections
          </p>
        </div>
        <CreateTemplateButton />
      </div>
      <div className="flex-1 space-y-4 pt-4">
        {templates === undefined ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Database className="h-12 w-12 text-muted-foreground mb-2" />
            <h3 className="font-medium text-muted-foreground">You have no databases yet</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map((template) => (
              <TemplateCard key={template._id} template={template} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabasesPage; 