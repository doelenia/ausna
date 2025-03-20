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
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash, RefreshCw, ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRightSidebar } from "@/hooks/use-right-sidebar";
import { cn } from "@/lib/utils";

interface MenuProps {
	documentId: Id<"documents">;
}

export const Menu = ({ documentId }: MenuProps) => {
	const router = useRouter();
	const { user } = useUser();
	const rightSidebar = useRightSidebar();
	
	const archive = useMutation(api.documents.archive);
	const inspectDocument = useAction(api.documents.InspectDocument);

	const onArchive = () => {
		const promise = archive({ id: documentId });

		toast.promise(promise, {
			loading: "Archiving page...",
			success: "Page archived.",
			error: "Failed to archive page.",
		});

		router.push("/documents");
	};

	const onSync = () => {
		const promise = inspectDocument({ documentId });

		toast.promise(promise, {
			loading: "Syncing document...",
			success: "Document synced successfully.",
			error: "Failed to sync document.",
		});
	};
	
	return (
		<div className="flex items-center gap-2">
			<Button
				onClick={onSync}
				size="sm"
				variant="ghost"
			>
				<RefreshCw className="h-4 w-4"/>
			</Button>
			<Button
				onClick={rightSidebar.toggle}
				size="sm"
				variant="ghost"
			>
				<ChevronLeft className={cn(
					"h-4 w-4 transition-transform",
					rightSidebar.isOpen && "rotate-180"
				)}/>
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
					<DropdownMenuItem onClick={onArchive}>
						<Trash className="h-4 w-4 mr-2"/>
						Delete
					</DropdownMenuItem>
					<DropdownMenuSeparator />
				
					<div className="text-xs text-muted-foreground p-2" >
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

