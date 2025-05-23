"use client";

import { Id } from "@/convex/_generated/dataModel";
import { LucideIcon, ChevronDown, ChevronRight, Plus, MoreHorizontal, Trash, Undo } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { on } from "events";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useRouter, useParams } from "next/navigation";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useUser } from "@clerk/clerk-react";
import React from "react";
import { ConfirmModal } from "@/components/modals/confirm-modal";

interface ItemProps {
	id?: Id<"documents">
	documentIcon?: string;
	active?: boolean;
	expanded?: boolean;
	isSearch?: boolean;
	level?: number;
	onExpand?: () => void;
	label: string;
	onClick?: () => void;
	icon: LucideIcon;
	isArchived?: boolean;
};

export const Item = ({
	id,
	label,
	onClick,
	icon: Icon,
	active,
	documentIcon,
	isSearch,
	level = 0,
	onExpand,
	expanded,
	isArchived,
} : ItemProps ) => {
	const { user } = useUser();
	const create = useMutation(api.documents.create);
	const router = useRouter();
	const archive = useMutation(api.documents.archive);

	const params = useParams();
	const restore = useMutation(api.documents.restore);
	const remove = useMutation(api.documents.remove);

	const onArchive = (
		event: React.MouseEvent<HTMLDivElement, MouseEvent>
	) => {
		event.stopPropagation();
		if (!id) return;
		const promise = archive({ id });

		router.push("/documents");

		toast.promise(promise, {
			loading: "Archiving page...",
			success: "Page moved to trash.",
			error: "Failed to archive page",
		});
	};
		


	const handleExpand = (
		event: React.MouseEvent<HTMLDivElement, MouseEvent>
	) => {
		event.stopPropagation();
		onExpand?.();
	}

	const onCreate = (
		event: React.MouseEvent<HTMLDivElement, MouseEvent>
	) => {
		if (!id) return;
		event.stopPropagation();
		const promise = create({ title: "Untitled Page", parentDocument: id })
		.then((documentId) => {
			if(!expanded) {
				onExpand?.();
			}

			router.push(`/documents/${documentId}`);
			
		});
		
		toast.promise(promise, {
			loading: "Creating a new page...",
			success: "Page created",
			error: "Failed to create page",
		});
	}

	const onRestore = (
		event: React.MouseEvent<HTMLDivElement, MouseEvent>,
		documentId: Id<"documents">,
	) => {
		event.stopPropagation();
		const promise = restore({ id: documentId });

		toast.promise(promise, {
			loading: "Restoring page...",
			success: "Page restored.",
			error: "Failed to restore page.",
		});
	};

	const onRemove = (
		documentId: Id<"documents">,
	) => {
		const promise = remove({ id: documentId });

		toast.promise(promise, {
			loading: "Removing page...",
			success: "Page removed.",
			error: "Failed to remove page.",
		});

		if (params.documentId === documentId) {
			router.push("/documents");
		}
	};

	const ChevronIcon = expanded ? ChevronDown : ChevronRight;

	return (
		<div
			onClick={onClick}
			role = "button"
			style={{ 
				paddingLeft: level ? `${(level * 12) + 12}px` : "12px"
			 }}
			className = {cn("group min-h-[27px] text-sm py-1 pr-3 w-full hover:bg-primary/5 flex items-center text-muted-foreground font-medium",
				active && "bg-primary/5 text-primary",)}
		>
			{(!!id && !isArchived) && (
				<div 
					role = "button"
					className="h-full rounded-sm hover:bg-primary/10 mr-1"
					onClick={handleExpand}
				>
					<ChevronIcon className="h-4 w-4 shrink-0 text-muted-foreground/50"/>
				</div>
			)}
			{documentIcon ? (
				<div className="shrink-0 text-[18px] ml-1 mr-2">
					{documentIcon}
				</div>
			): (
				<Icon className="shrink-0 h-[18px] w-[18px] mr-2 text-muted-foreground" />
			)}
			
			<span className="truncate">{label}</span>

			{isSearch && (
				<kbd className="ml-auto pointer-events-none inline-flex h-5 select-none itemd-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
					<span className="text-sm">⌘</span>K
				</kbd>
			)}

			{!!id && (
				<div className="ml-auto flex items-center gap-x-2">
					
					{!isArchived ? (
						<>
							<DropdownMenu>
								<DropdownMenuTrigger onClick={(e) => e.stopPropagation()}>
									<div className="opacity-0 group-hover:opacity-100 h-full ml-auto rounded-sm hover:bg-primary/10">
										<MoreHorizontal className="h-4 w-4 text-muted-foreground" />
									</div>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									className="w-60"
									align="start"
									side="right"
									forceMount
								>
									<DropdownMenuItem
										className="hover:bg-primary/10"
										onClick={onArchive}>
										<Trash className="h-4 w-4 mr-2" />
										Delete
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<div className="text-xs text-muted-foreground p-2">
										Last edited by: {user?.fullName}
									</div>
								</DropdownMenuContent>
							</DropdownMenu>
							<div
								className="opacity-0 group-hover:opacity-100 h-full ml-auto rounded-sm hover:bg-primary/10"
								role="button"
								onClick={onCreate}
							>
								<Plus className="h-4 w-4 text-muted-foreground" />
							</div>
						</>
					):(
						<>
							<div
								onClick={(e) => onRestore(e, id)}
								className="opacity-0 group-hover:opacity-100 h-full ml-auto rounded-sm hover:bg-primary/10"
								role="button"
							>
								<Undo className="h-4 w-4 text-muted-foreground" />
							</div>

							<ConfirmModal
								onConfirm={() => onRemove(id)}
							>
								<div
									className="opacity-0 group-hover:opacity-100 h-full ml-auto rounded-sm hover:bg-primary/10"
									role="button"
								>
									<Trash className="h-4 w-4 text-muted-foreground" />
								</div>
							</ConfirmModal>
						</>
					)
					}
				
				
				</div>

			)}
		</div>
	);
}

Item.Skeleton = function ItemSkeleton({ level }: {level?: number}) {
	return (
		<div style={{
			paddingLeft: level ? `${(level * 12) + 12}px` : "12px"
			}}
			className="flex gap-x-2 py-[4px]"
		>
			<Skeleton className="h-5 w-4" />
			<Skeleton className="h-5 w-[30%]" />
		</div>
	);
}