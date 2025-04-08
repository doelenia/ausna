"use client";

import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Database } from "lucide-react";
import { ComponentRef, useRef, useState } from "react";
import TextAreaAutoSize from "react-textarea-autosize";

interface ToolbarProps {
  initialData: Doc<"objectTemplates">;
  preview?: boolean;
}

export const Toolbar = ({
  initialData,
  preview = false,
}: ToolbarProps) => {
  const inputRef = useRef<ComponentRef<"textarea">>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialData.templateName);

  const update = useMutation(api.objectTemplates.updateObjectTemplate);

  const enableInput = () => {
    if (preview) return;

    setIsEditing(true);
    setTimeout(() => {
      setValue(initialData.templateName);
      inputRef.current?.focus();
    }, 0);
  };

  const disableInput = () => setIsEditing(false);

  const onInput = (value: string) => {
    setValue(value);
    update({ 
      templateId: initialData._id, 
      templateName: value || "Untitled Template" 
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      disableInput();
    }
  };

  return (
    <div className="pl-[54px] group relative">
      <div className="flex items-center gap-x-2 group/icon pt-6 h-32"/>
      <div className="text-sm text-muted-foreground mb-2">
        Database
      </div>
      {isEditing && !preview ? (
        <TextAreaAutoSize
          ref={inputRef}
          onBlur={disableInput}
          onKeyDown={onKeyDown}
          value={value}
          onChange={(event) => onInput(event.target.value)}
          className="text-4xl font-bold break-words bg-transparent outline-none resize-none focus:outline-none text-foreground"
        />
      ) : (
        <div
          onClick={enableInput}
          className="text-4xl pb-[11.5px] font-bold break-words outline-none text-foreground"
        >
          {initialData.templateName}
        </div>
      )}
    </div>
  );
}; 