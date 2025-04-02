"use client";

import { Id } from "@/convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MenuProps {
  templateId: Id<"objectTemplates">;
}

export const Menu = ({ templateId }: MenuProps) => {
  const router = useRouter();
  const { user } = useUser();

  const onDelete = () => {
    // TODO: Implement delete functionality
    router.push("/databases");
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
      >
        <RefreshCw className="h-4 w-4"/>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <MoreHorizontal className="h-4 w-4"/>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          className="w-60"
          align="end"
          alignOffset={8}
          forceMount
        >
          <DropdownMenuItem onClick={onDelete}>
            <Trash className="h-4 w-4 mr-2"/>
            Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        
          <div className="text-xs text-muted-foreground p-2">
            Last edited by {user?.fullName}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

Menu.Skeleton = function MenuSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-10 w-10"/>
      <Skeleton className="h-10 w-10"/>
    </div>
  );
} 