"use client";

import { Loader2, ExternalLink } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CellDialog } from "./cell-dialog";
import { useRouter } from "next/navigation";

interface CellProps {
  value?: string;
  width: number;
  height: number;
  isName?: boolean;
  isLoading?: boolean;
  isQueued?: boolean;
  propertyId?: Id<"objectTagProperties">;
  conceptId?: Id<"concepts">;
}

const StatusIndicator = ({
  property,
  template
}: {
  property: any;
  template: any;
}) => {
  // Case 1: Autosync is disabled
  if (property?.autosync === "false" || (property?.autosync === "default" && template?.autosync === false)) {
    return (
      <div className="w-2 h-2 rounded-full bg-gray-400 mr-2 flex-shrink-0" />
    );
  }

  // Case 2: Values match (including both undefined/empty)
  const value = property?.value?.toString() || "";
  const autoFilledValue = property?.autoFilledValue?.toString() || "";
  const isValueMatching = value === autoFilledValue;

  // Case 3: Values don't match
  return (
    <div 
      className={cn(
        "w-2 h-2 rounded-full mr-2 flex-shrink-0",
        isValueMatching ? "bg-green-500" : "bg-yellow-500"
      )}
    />
  );
};

export const Cell = ({
  value,
  width,
  height,
  isName,
  isLoading,
  isQueued,
  propertyId,
  conceptId
}: CellProps) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const floatingBoxRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  
  const property = useQuery(api.objectTagProperties.getById, 
    propertyId ? { propertyId } : "skip"
  );
  
  const template = useQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateById,
    property?.objectPropertiesTemplateId ? 
    { objectPropertiesTemplateId: property.objectPropertiesTemplateId } : 
    "skip"
  );

  const concept = useQuery(api.concepts.getById,
    conceptId ? { conceptId } : "skip"
  );

  const updateProperty = useMutation(api.objectTagProperties.updateObjectTagProperty);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        floatingBoxRef.current && 
        !floatingBoxRef.current.contains(event.target as Node) &&
        cellRef.current &&
        !cellRef.current.contains(event.target as Node)
      ) {
        handleSubmit();
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
      adjustTextareaHeight();
      setTimeout(() => textareaRef.current?.focus(), 0);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isEditing]);

  useEffect(() => {
    if (property?.value !== undefined) {
      setEditValue(property.value.toString());
    }
  }, [property?.value]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
    }
  };

  const handleSubmit = async () => {
    if (!propertyId || editValue === value) {
      setIsEditing(false);
      return;
    }

    try {
      await updateProperty({
        propertyId,
        value: editValue
      });
    } catch (error) {
      console.error("Failed to update property:", error);
      setEditValue(value || "");
    }

    setIsEditing(false);
  };

  const handleClick = () => {
    if (!isName && !isLoading && !isQueued && propertyId) {
      setIsEditing(true);
      setEditValue(value || "");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(value || "");
    }
  };

  return (
    <td
      ref={cellRef}
      className={cn(
        "px-2 py-2 text-sm relative group",
        isName && "font-medium py-3",
        !isLoading && !isQueued && (propertyId || (isName && concept?.rootDocument)) && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
      )}
      style={{ width: `${width}px`, maxWidth: `${width}px` }}
      onClick={handleClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1 min-w-0">
          {!isName && !isLoading && !isQueued && propertyId && property && template && (
            <StatusIndicator property={property} template={template} />
          )}
          {isLoading ? (
            <div className="flex items-center text-red-500">
              <Loader2 className="h-3 w-3 animate-spin mr-2 text-red-500" />
              <span className="text-sm">Running...</span>
            </div>
          ) : isQueued ? (
            <div className="flex items-center text-red-500">
              <div className="w-2 h-2 rounded-full bg-red-500 mr-2" />
              <span className="text-sm">Queued</span>
            </div>
          ) : (
            <div className="truncate">
              {value ? value : (
                <span className="text-gray-400 italic">Empty Value</span>
              )}
            </div>
          )}
        </div>
        {(!isLoading && !isQueued && (propertyId || (isName && concept?.rootDocument))) && (
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition h-6 w-6 p-0 ml-2"
            onClick={(e) => {
              e.stopPropagation();
              if (isName && concept?.rootDocument) {
                router.push(`/documents/${concept.rootDocument}`);
              } else if (propertyId) {
                setIsDialogOpen(true);
              }
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isEditing && (
        <div
          ref={floatingBoxRef}
          className="fixed bg-white dark:bg-gray-800 border rounded-sm shadow-lg overflow-visible focus:outline-none z-50"
          style={{
            width: `${width}px`,
            maxHeight: "500px",
            left: cellRef.current ? cellRef.current.getBoundingClientRect().left : 0,
            top: cellRef.current ? cellRef.current.getBoundingClientRect().top : 0
          }}
        >
          <Textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              adjustTextareaHeight();
            }}
            className="w-full h-full px-6 py-2 resize-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 border-0 bg-transparent"
            onKeyDown={handleKeyDown}
          />
        </div>
      )}
      {propertyId && (
        <CellDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          value={value || ""}
          propertyId={propertyId}
        />
      )}
    </td>
  );
}; 