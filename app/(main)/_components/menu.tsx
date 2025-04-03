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
	const syncAllConceptKeywords = useAction(api.documents.syncAllConceptKeywords);
	const syncAllConcepts = useAction(api.concepts.syncAllConcepts);

	const syncAllObjectTags = useAction(api.concepts.syncAllObjectTags);

	const onArchive = () => {
		const promise = archive({ id: documentId });

		toast.promise(promise, {
			loading: "Archiving page...",
			success: "Page archived.",
			error: "Failed to archive page.",
		});

		router.push("/documents");
	};

	const onSync = async () => {
		try {
			// First action: Connect to concepts
			const conceptsPromise = syncAllConceptKeywords({ documentId });
			toast.promise(conceptsPromise, {
				loading: "0/4 Connecting to concepts...",
				success: "1/4 Concepts connected successfully.",
				error: "Failed to connect concepts.",
			});
			await conceptsPromise;

			// Second action: Update knowledges
			const inspectPromise = inspectDocument({ documentId });
			toast.promise(inspectPromise, {
				loading: "1/4 Updating knowledges...",
				success: "2/4 Knowledges updated successfully.",
				error: "Failed to update knowledges.",
			});
			await inspectPromise;

			// Third action: Connect knowledges
			const syncPromise = syncAllConcepts({});
			toast.promise(syncPromise, {
				loading: "2/4 Connecting knowledges...",
				success: "3/4Knowledges connected successfully.",
				error: "Failed to connect knowledges.",
			});
			await syncPromise;

			// Fourth action: Sync object tags
			const syncObjectTagsPromise = syncAllObjectTags({});
			toast.promise(syncObjectTagsPromise, {
				loading: "3/4 Syncing concept relationships...",
				success: "4/4 Concept relationships synced successfully.",
				error: "Failed to sync concept relationships.",
			});
			await syncObjectTagsPromise;

		} catch (error) {
			console.error("Sync failed:", error);
		}
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

