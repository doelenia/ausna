import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FileText, Brain } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";

interface CellDialogProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  propertyId: Id<"objectTagProperties">;
}

interface KnowledgeBlockProps {
  extractedKnowledge: string;
  sourceId: Id<"documents">;
  sourceTitle: string;
  sourceType: string;
}

interface KnowledgeData {
  _id: Id<"knowledgeDatas">;
  sourceId: Id<"documents">;
  extractedKnowledge: string;
}

interface SourceDocument {
  _id: Id<"documents">;
  title: string;
  type: string;
}

const KnowledgeBlock = ({
  extractedKnowledge,
  sourceId,
  sourceTitle,
  sourceType
}: KnowledgeBlockProps) => {
  const router = useRouter();
  const isFromDocument = sourceType === "document";
  const Icon = isFromDocument ? FileText : Brain;

  const handleClick = () => {
    router.push(`/documents/${sourceId}`);
  };

  return (
    <div 
      className="p-3 border rounded-lg cursor-pointer hover:bg-secondary/20 transition-colors"
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{sourceTitle}</span>
      </div>
      <p className="text-sm">{extractedKnowledge}</p>
    </div>
  );
};

export const CellDialog = ({
  isOpen,
  onClose,
  value,
  propertyId
}: CellDialogProps) => {
  const [editValue, setEditValue] = useState(value);
  const [autosync, setAutosync] = useState<"default" | "true" | "false">("default");
  const [prompt, setPrompt] = useState("");
  const [activeTab, setActiveTab] = useState("settings");

  const property = useQuery(api.objectTagProperties.getById, {
    propertyId
  });

  // Pre-fetch all knowledge data and source documents
  const knowledgeData = useQuery(api.knowledgeDatas.getKDbyIds, {
    knowledgeDataIds: property?.sourceKDs || []
  }) as KnowledgeData[] | undefined;

  // Always call useQuery, but with "skip" if no sourceId
  const sourceDocuments = useQuery(api.documents.getById, 
    knowledgeData?.[0]?.sourceId 
      ? { documentId: knowledgeData[0].sourceId }
      : "skip"
  ) as SourceDocument | undefined;

  // Initialize states from property data when available
  useEffect(() => {
    if (property) {
      setEditValue(property.value || "");
      setAutosync(property.autosync === undefined ? "default" : property.autosync === "default" ? "default" : property.autosync === "true" ? "true" : "false");
      setPrompt(property.prompt || "");
    }
  }, [property]);

  const updateProperty = useMutation(api.objectTagProperties.updateObjectTagProperty);

  const handleSave = async () => {
    try {
      await updateProperty({
        propertyId,
        value: editValue,
        autosync: autosync,
        prompt: prompt || undefined
      });
      onClose();
    } catch (error) {
      console.error("Error updating property:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Property</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings">Cell Settings</TabsTrigger>
            <TabsTrigger value="autofill">Auto Fill</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Value</Label>
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="min-h-[100px] font-medium"
              />
            </div>
            <div className="flex items-center justify-between space-y-0">
              <Label>Auto Sync</Label>
              <Select 
                value={autosync}
                onValueChange={(value: "default" | "true" | "false") => setAutosync(value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue>
                    {autosync === "default" ? "Default" :
                     autosync === "true" ? "True" :
                     autosync === "false" ? "False" : "Default"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper" align="start" side="bottom">
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your customized instruction for filling the property"
                className="min-h-[80px] font-medium"
              />
            </div>
          </TabsContent>
          <TabsContent value="autofill" className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Auto Filled Value</Label>
              <div className="p-4 border rounded-lg bg-secondary/20"
                style={{
                  backgroundColor: property?.value ? "rgba(0, 0, 0, 0.05)" : "transparent"
                }}
              >
                <p className="text-sm"
									style={{
										color: property?.autoFilledValue ? "inherit" : "rgba(34, 34, 34, 0.5)"
									}}
								>
                  {property?.autoFilledValue || "No auto-filled value"}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Source Knowledge</Label>
              <div className="border rounded-lg p-4 space-y-4 max-h-[300px] overflow-y-auto">
                {knowledgeData && sourceDocuments && knowledgeData.length > 0 ? (
                  knowledgeData.map((kd: KnowledgeData) => {
                    if (!sourceDocuments || !kd.sourceId) return null;
                    
                    return (
                      <KnowledgeBlock
                        key={kd._id}
                        extractedKnowledge={kd.extractedKnowledge}
                        sourceId={sourceDocuments._id}
                        sourceTitle={sourceDocuments.title}
                        sourceType={sourceDocuments.type}
                      />
                    );
                  })
                ) : (
                  <div className="p-3 border rounded-lg bg-secondary/10">
                    <p className="text-sm text-muted-foreground">No source knowledge available</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 