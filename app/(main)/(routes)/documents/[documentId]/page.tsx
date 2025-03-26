"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Toolbar } from "@/components/toolbar";
import { use } from "react";
import { Cover } from "@/components/cover";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KnowledgeTab from "./_components/knowledge-tab";

interface DocumentIdPageProps {
  params: Promise<{
    documentId: Id<"documents">;
  }>;
}

const DocumentIdPage = ({
	params,
}: DocumentIdPageProps ) => {
	const rParams = use(params);
	const document = useQuery(api.documents.getById, {
		documentId: rParams.documentId,
	});

	const update = useMutation(api.documents.update);
	const [activeTab, setActiveTab] = useState<string>("content");

	const Editor = useMemo(
		() => dynamic(() => import("@/components/editor"), { ssr: false }),
		[]
	);

	const onChange = (content: string) => {
		update({
			id: rParams.documentId,
			content,
		});
	};

	if (document === undefined) {
		return (
			<div>
				<Cover.Skeleton />
				<div className="md:max-w-3xl lg:max-w-4xl mx-auto mt-10">
					<div className="space-y-4 pl-8 pt-4">
						<Skeleton className="h-14 w-[50%]" />
						<Skeleton className="h-4 w-[80%]" />
						<Skeleton className="h-4 w-[40%]" />
						<Skeleton className="h-4 w-[60%]" />
					</div>
				</div>
			</div>
		);
	}

	if (document === null) {
		return <p>Page not found</p>;
	}

	return (
		<div className="pb-40">
			<Cover url={document.coverImage} />
			<div className="md:max-w-3xl lg:max-w-4xl mx-auto">
				<Toolbar initialData={document} />
				<Tabs defaultValue={document.type === "concept" ? "knowledge" : "content"} className="mt-4">
					<TabsList className="ml-12">
						<TabsTrigger value="content" className="font-semibold">Content</TabsTrigger>
						<TabsTrigger value="knowledge" className="font-semibold">Knowledges</TabsTrigger>
					</TabsList>
					<TabsContent value="content">
						<Editor
							onChange={onChange}
							initialContent={document.content}
							documentId={rParams.documentId}
						/>
					</TabsContent>
					<TabsContent value="knowledge" className="ml-5">
						<KnowledgeTab documentId={rParams.documentId} />
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}

export default DocumentIdPage;