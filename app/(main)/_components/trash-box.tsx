"use client";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { FileIcon, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Item } from "./item";


export const TrashBox = () => {
	const router = useRouter();
	const params = useParams();
	const documents = useQuery(api.documents.getTrash);
	const restore = useMutation(api.documents.restore);
	const remove = useMutation(api.documents.remove);

	const [search, setSearch] = useState("");

	const filteredDocuments = documents?.filter((document) => {
		return document.title.toLowerCase().includes(search.toLowerCase());
	});

	const onClick = (documentId: string) => {
		router.push(`/documents/${documentId}`);
	};

	const onRestore = (
		event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
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

	if (documents === undefined) {
		return (
			<div className="h-full flex items-center justify-center p-4">
				<Spinner size='lg' />
			</div>
		);
	}


	return (
		<div className="text-sm">
			<div className="flex items-center gap-x-1 p-2">
				<Search className="h-4 w-4"/>
				<Input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="h-7 px-2 focus-visible:ring-transparent bg-secondary"
					placeholder="Filter by page title..."
				/>
			</div>
			<div className="mt-2 px-1 pb-3">
				<p className="hidden last:block text-xs text-center text-muted-foreground pb-2">
					No documents found;
				</p>
				{filteredDocuments?.map((document) => (
					<div key={document._id}>
						<Item
							id={document._id}
							label={document.title}
							onClick={() => onClick(document._id)}
							icon={FileIcon}
							active={params.documentId === document._id}
							isArchived={true}
						/>
					</div>
				))}
			</div>
		</div>
	);
};