"use client";

import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Plus, Type, Text, HelpCircle, TypeIcon } from "lucide-react";
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface HeaderProps {
  id: string;
  label: string;
  width: number;
  isAction?: boolean;
  onAddColumn?: () => void;
  propertyId?: Id<"objectPropertiesTemplates">;
  type?: string;
  autosync?: boolean;
  prompt?: string;
  isFirst?: boolean;
}

export const Header = ({
  id,
  label,
  width,
  isAction,
  onAddColumn,
  propertyId,
  type: initialType = "text",
  autosync: initialAutosync = true,
  prompt: initialPrompt = "",
  isFirst
}: HeaderProps) => {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [propertyName, setPropertyName] = useState(label);
  const [type, setType] = useState(initialType);
  const [autosync, setAutosync] = useState(initialAutosync);
  const [prompt, setPrompt] = useState(initialPrompt);

  const updateTemplate = useAction(api.objectPropertiesTemplate.updateObjectPropertiesTemplate);

  const handleSubmit = async () => {
    if (!propertyId || !propertyName.trim()) return;

    try {
      await updateTemplate({
        objectPropertiesTemplateId: propertyId,
        propertyName: propertyName.trim(),
        type,
        autosync,
        prompt
      });
      setIsEditOpen(false);
    } catch (error) {
      console.error("Failed to update template:", error);
    }
  };

  if (isAction) {
    return (
      <th scope="col" className="px-2 py-2 text-left w-full bg-transparent dark:bg-transparent rounded-tr-lg">
        <Button
          onClick={onAddColumn}
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
        >
          <Plus className="h-4 w-4 text-gray-500" />
        </Button>
      </th>
    );
  }

  const getIcon = () => {
    if (id === 'name') {
      return <TypeIcon className="h-4 w-4 mr-2 text-gray-500" />;
    }
    if (initialType === 'text') {
      return <Text className="h-4 w-4 mr-2 text-gray-500" />;
    }
    return <HelpCircle className="h-4 w-4 mr-2 text-gray-500" />;
  };

  return (
    <>
      <th 
        scope="col" 
        className={cn(
          "px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider group bg-background hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer overflow-hidden whitespace-nowrap",
          isFirst && "rounded-tl-lg"
        )}
        style={{ width: width ? `${width}px` : 'auto', minWidth: width ? `${width}px` : 'auto' }}
        onClick={() => propertyId && setIsEditOpen(true)}
      >
        <div className="flex items-center">
          {getIcon()}
          <span className="truncate">
            {label}
          </span>
        </div>
        
      </th>

      {propertyId && (
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Column Properties</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Property Name</Label>
                <Input
                  value={propertyName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPropertyName(e.target.value)}
                  placeholder="Enter property name"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" side="bottom">
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Auto Sync</Label>
                <Switch
                  checked={autosync}
                  onCheckedChange={setAutosync}
                />
              </div>
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                  placeholder="Describe this property or provide instructions for filling this property"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setIsEditOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!propertyName.trim() || (
                  propertyName === label &&
                  type === initialType &&
                  autosync === initialAutosync &&
                  prompt === initialPrompt
                )}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}; 