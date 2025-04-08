"use client";

import { Id } from "@/convex/_generated/dataModel";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Lightbulb, Play } from "lucide-react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { Cell } from "./cell";
import { format } from "date-fns";
import { ConceptSelector } from "@/components/concept-selector";
import { Textarea } from "@/components/ui/textarea";

interface DBEditorProps {
  templateId: Id<"objectTemplates">;
}

type ObjectTagProperty = {
  _id: Id<"objectTagProperties">;
  _creationTime: number;
  userId: string;
  conceptId: Id<"concepts">;
  objectTagId: Id<"objectTags">;
  propertyName?: string;
  objectPropertiesTemplateId?: Id<"objectPropertiesTemplates">;
  value?: any;
  type?: string;
  sourceKDs?: Id<"knowledgeDatas">[];
  sourceKDsString?: string;
  autosync?: string;
  prompt?: string;
};

type ConceptDocument = {
  conceptId: Id<"concepts">;
  documentTitle?: string;
};

const MIN_COLUMN_WIDTH = 150;
const DEFAULT_COLUMN_WIDTH = 200;
const MAX_COLUMN_WIDTH = 400;
const CELL_PADDING = 32; // Reduced from 48 to 32 (16px padding on each side)
const DEFAULT_CELL_HEIGHT = 32; // Reduced from 41 to 32 to match button height

interface LoadingState {
  objectTagId: Id<"objectTags">;
  propertyId: Id<"objectPropertiesTemplates">;
  status: "queued" | "loading" | "done";
}

const DBEditor = ({
  templateId
}: DBEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isNewRowOpen, setIsNewRowOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isCreatingRow, setIsCreatingRow] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [newRowName, setNewRowName] = useState("");
  const [newRowDescription, setNewRowDescription] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<string>();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [cellHeights, setCellHeights] = useState<Record<string, number>>({});
  const [loadingStates, setLoadingStates] = useState<LoadingState[]>([]);
  
  const tableRef = useRef<HTMLDivElement>(null);

  const createConceptAndTag = useAction(api.objectTemplates.createConceptAndObjectTag);
  const initializeTemplate = useAction(api.objectTemplates.initializeTemplate);
  const syncObjectTagProperty = useAction(api.objectTagProperties.syncObjectTagProperty);

  // Fetch data queries
  const template = useQuery(api.objectTemplates.getObjectTemplateById, {
    templateId
  });

  const propertyTemplates = useQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateByObjectTemplateId, {
    objectTemplateId: templateId
  });

  const objectTags = useQuery(api.objectTags.getObjectTagsByTemplateId, {
    templateId
  });

  const allProperties = useQuery(api.objectTagProperties.getObjectTagPropertiesByTemplateId, {
    templateId
  });

  const conceptsAndDocs = useQuery(api.concepts.getConceptsAndDocumentsForTags, {
    conceptIds: objectTags?.map((tag) => tag.conceptId) || []
  });

  // Organize properties by object tag ID for easier lookup
  const propertiesByTagId = useMemo(() => {
    if (!allProperties) return null;
    return allProperties.reduce((acc: Record<Id<"objectTags">, ObjectTagProperty[]>, prop) => {
      if (!acc[prop.objectTagId]) {
        acc[prop.objectTagId] = [];
      }
      acc[prop.objectTagId].push(prop);
      return acc;
    }, {});
  }, [allProperties]);

  // Calculate content width for a string
  const calculateContentWidth = useCallback((content: string | null): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return MIN_COLUMN_WIDTH;

    // Match the cell's font style
    context.font = '0.875rem/1.25rem sans-serif'; // text-sm
    const metrics = context.measureText(content || '-');
    const width = Math.ceil(metrics.width) + CELL_PADDING;
    return Math.min(Math.max(width, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
  }, []);

  // Calculate content height for a string
  const calculateContentHeight = useCallback((content: string | null): number => {
    const lines = (content || '-').split('\n');
    return Math.max(DEFAULT_CELL_HEIGHT, lines.length * DEFAULT_CELL_HEIGHT);
  }, []);

  // Calculate column widths based on content
  const calculateColumnWidths = useCallback(() => {
    if (!propertyTemplates || !objectTags || !propertiesByTagId || !conceptsAndDocs) return;

    const newWidths: Record<string, number> = {};
    const newHeights: Record<string, number> = {};

    // Calculate width and height for the name column
    let maxNameWidth = calculateContentWidth('Name');
    objectTags.forEach(tag => {
      const conceptDoc = conceptsAndDocs.find(cd => cd.conceptId === tag.conceptId);
      const displayName = conceptDoc?.documentTitle || tag.objectName;
      const nameWidth = calculateContentWidth(displayName);
      maxNameWidth = Math.max(maxNameWidth, nameWidth);
      
      // Calculate and store height for name cells
      const cellKey = `name-${tag._id}`;
      newHeights[cellKey] = calculateContentHeight(displayName);
    });
    // Add extra space for name column to accommodate buttons
    newWidths['name'] = Math.min(maxNameWidth + 40, MAX_COLUMN_WIDTH);

    // Calculate width and height for each property column
    propertyTemplates.forEach(prop => {
      let maxWidth = calculateContentWidth(prop.propertyName);
      objectTags.forEach(tag => {
        const tagProperty = propertiesByTagId[tag._id]?.find(
          p => p.propertyName === prop.propertyName
        );
        const value = tagProperty?.value?.toString();
        const contentWidth = calculateContentWidth(value);
        maxWidth = Math.max(maxWidth, contentWidth);
        
        // Calculate and store height for property cells
        const cellKey = `${prop._id}-${tag._id}`;
        newHeights[cellKey] = calculateContentHeight(value);
      });
      newWidths[prop._id] = Math.min(maxWidth, MAX_COLUMN_WIDTH);
    });

    setColumnWidths(newWidths);
    setCellHeights(newHeights);
  }, [propertyTemplates, objectTags, propertiesByTagId, conceptsAndDocs, calculateContentWidth]);

  // Initialize column widths
  useEffect(() => {
    calculateColumnWidths();
  }, [calculateColumnWidths]);

  // Action to add new property template
  const addPropertyTemplate = useAction(api.objectPropertiesTemplate.addObjectPropertiesTemplate);

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    
    try {
      await addPropertyTemplate({
        objectTemplateId: templateId,
        propertyName: newColumnName.trim(),
        type: "text"
      });
      setNewColumnName("");
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to add column:", error);
    }
  };

  const handleNewRow = async () => {
    if (!(newRowName.trim() || selectedConceptId) || isCreatingRow) return;
    
    try {
      setIsCreatingRow(true);
      await createConceptAndTag({
        templateId,
        objectName: newRowName.trim(),
        conceptDescription: newRowDescription.trim(),
        conceptId: selectedConceptId as Id<"concepts"> | undefined
      });
      setNewRowName("");
      setNewRowDescription("");
      setSelectedConceptId(undefined);
      setIsNewRowOpen(false);
    } catch (error) {
      console.error("Failed to create new row:", error);
    } finally {
      setIsCreatingRow(false);
    }
  };

  const handleSmartFetch = async () => {
    try {
      setIsFetching(true);
      setFetchMessage(null);
      const count = await initializeTemplate({ templateId });
      if (count !== undefined) {
        setFetchMessage(`Added ${count} new objects to your database.`);
      }
    } catch (error) {
      console.error("Failed to fetch objects:", error);
      setFetchMessage("Failed to fetch objects. Please try again.");
    } finally {
      setIsFetching(false);
      // Clear success message after 3 seconds
      setTimeout(() => setFetchMessage(null), 3000);
    }
  };

  const handleRunCells = async () => {
    if (!objectTags || !propertyTemplates || !propertiesByTagId) return;
    
    // Create initial loading states
    // only run cell is property's autosync is "true or when property's autosync is "default" and propertyTemplate autosync is true
    const initialStates: LoadingState[] = [];
    objectTags.forEach(tag => {
      propertyTemplates.forEach(prop => {
        if (propertiesByTagId[tag._id]?.find(p => p.propertyName === prop.propertyName)?.autosync === "true" || (propertiesByTagId[tag._id]?.find(p => p.propertyName === prop.propertyName)?.autosync === "default" && prop.autosync === true)) {
          initialStates.push({
            objectTagId: tag._id,
            propertyId: prop._id,
            status: "queued"
          });
        }
      });
    });
    setLoadingStates(initialStates);

    // Process each cell
    for (const tag of objectTags) {
      for (const prop of propertyTemplates) {

        if (propertiesByTagId[tag._id]?.find(p => p.propertyName === prop.propertyName)?.autosync === "false" || (propertiesByTagId[tag._id]?.find(p => p.propertyName === prop.propertyName)?.autosync === "default" && prop.autosync === false)) {
          continue;
        }
        
        // Find the property for this tag and template
        const tagProperty = propertiesByTagId[tag._id]?.find(
          p => p.propertyName === prop.propertyName
        );
        
        if (tagProperty) {
          // Update status to loading
          setLoadingStates(prev => prev.map(state => 
            state.objectTagId === tag._id && state.propertyId === prop._id
              ? { ...state, status: "loading" }
              : state
          ));

          try {
            await syncObjectTagProperty({ propertyId: tagProperty._id });
          } catch (error) {
            console.error("Failed to sync property:", error);
          }

          // Update status to done
          setLoadingStates(prev => prev.map(state => 
            state.objectTagId === tag._id && state.propertyId === prop._id
              ? { ...state, status: "done" }
              : state
          ));
        }
      }
    }

    // Clear loading states after completion
    setLoadingStates([]);
  };

  const handleResize = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>, columnId: string) => {
    // No-op since resizing is disabled
  }, []);

  if (!template || !propertyTemplates || !objectTags || !propertiesByTagId || !conceptsAndDocs) {
    return (
      <div className="p-4">
        <Skeleton className="w-full h-[200px]" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <Button
            onClick={handleSmartFetch}
            disabled={isFetching}
            className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950 dark:hover:bg-blue-900 dark:text-blue-400"
            size="sm"
          >
            {isFetching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <Lightbulb className="h-4 w-4 mr-2" />
                Smart Fetch
              </>
            )}
          </Button>
          <Button
            onClick={handleRunCells}
            disabled={loadingStates.length > 0}
            className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-400"
            size="sm"
          >
            {loadingStates.length > 0 ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Cells
              </>
            )}
          </Button>
          {fetchMessage && (
            <span className={cn(
              "text-sm",
              fetchMessage.includes("Failed") ? "text-red-500" : "text-green-500"
            )}>
              {fetchMessage}
            </span>
          )}
        </div>
        {template.lastSyncedTime && (
          <div className="text-sm text-muted-foreground">
            Last synced: {format(template.lastSyncedTime, "MMM d, yyyy HH:mm")}
          </div>
        )}
      </div>
      <div className="border rounded-lg border-gray-200 dark:border-gray-700 z-100">
        <div className="overflow-x-auto" ref={tableRef}>
          <div className="inline-block min-w-full align-middle">
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="sticky top-0 z-10 bg-background after:absolute after:left-0 after:bottom-0 after:right-0 after:h-[1px] after:bg-gray-200 dark:after:bg-gray-700">
                  <tr className="divide-x divide-gray-200 dark:divide-gray-700">
                    <Header
                      id="name"
                      label="Name"
                      width={columnWidths['name']}
                      isFirst
                    />
                    {propertyTemplates.map((prop) => (
                      <Header
                        key={prop._id}
                        id={prop._id}
                        label={prop.propertyName}
                        width={columnWidths[prop._id]}
                        propertyId={prop._id}
                        type={prop.type}
                        autosync={prop.autosync}
                        prompt={prop.prompt}
                      />
                    ))}
                    <Header
                      id="actions"
                      label=""
                      width={0}
                      isAction
                      onAddColumn={() => setIsOpen(true)}
                    />
                  </tr>
                </thead>
                <tbody className="bg-transparent dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-700">
                  {objectTags.map((tag) => {
                    const conceptDoc = conceptsAndDocs?.find(cd => cd.conceptId === tag.conceptId);
                    const displayName = conceptDoc?.documentTitle || tag.objectName;
                    
                    return (
                      <tr key={tag._id} className="divide-x divide-gray-200 dark:divide-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <Cell
                          value={displayName}
                          width={columnWidths['name']}
                          height={cellHeights[`name-${tag._id}`] || DEFAULT_CELL_HEIGHT}
                          isName
                          conceptId={tag.conceptId}
                          objectTagId={tag._id}
                        />
                        {propertyTemplates.map((prop) => {
                          const tagProperty = propertiesByTagId[tag._id]?.find(
                            p => p.propertyName === prop.propertyName
                          );
                          
                          const loadingState = loadingStates.find(
                            state => state.objectTagId === tag._id && state.propertyId === prop._id
                          );
                          
                          return (
                            <Cell
                              key={prop._id}
                              value={tagProperty?.value?.toString()}
                              width={columnWidths[prop._id]}
                              height={cellHeights[`${prop._id}-${tag._id}`] || DEFAULT_CELL_HEIGHT}
                              isLoading={loadingState?.status === "loading"}
                              isQueued={loadingState?.status === "queued"}
                              propertyId={tagProperty?._id}
                            />
                          );
                        })}
                        <td className="px-6 py-4 w-20" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Button
          onClick={() => setIsNewRowOpen(true)}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Row
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Column</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Column name"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddColumn}
              disabled={!newColumnName.trim()}
            >
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewRowOpen} onOpenChange={setIsNewRowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Row</DialogTitle>
            <DialogDescription>
              Select an existing concept or create a new one by entering a name and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Concept</label>
              <ConceptSelector
                value={selectedConceptId}
                onChange={setSelectedConceptId}
                buttonLabel="Select existing concept..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Enter object name..."
                value={newRowName}
                onChange={(e) => setNewRowName(e.target.value)}
                disabled={!!selectedConceptId || isCreatingRow}
                className={cn(
                  (selectedConceptId || isCreatingRow) && "bg-muted text-muted-foreground"
                )}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Enter description..."
                value={newRowDescription}
                onChange={(e) => setNewRowDescription(e.target.value)}
                disabled={!!selectedConceptId || isCreatingRow}
                className={cn(
                  (selectedConceptId || isCreatingRow) && "bg-muted text-muted-foreground",
                  "resize-none"
                )}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsNewRowOpen(false);
                setNewRowName("");
                setNewRowDescription("");
                setSelectedConceptId(undefined);
              }}
              disabled={isCreatingRow}
            >
              Cancel
            </Button>
            <Button
              disabled={(!selectedConceptId && !newRowName.trim()) || isCreatingRow}
              onClick={handleNewRow}
            >
              {isCreatingRow ? (
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
    </div>
  );
};

export default DBEditor; 