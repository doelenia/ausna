"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Toolbar } from "@/components/toolbar";
import { use } from "react";
import { Cover } from "@/components/cover";

interface DocumentIdPageProps {
  params: Promise<{
    documentId: Id<"documents">;
  }>;
};

const DocumentIdPage = ({
	params,
}: DocumentIdPageProps ) => {
	const rParams = use(params);
	const document = useQuery(api.documents.getById, {
		documentId: rParams.documentId,
	});

	if (document === undefined) {
		return <p>Loading...</p>;
	}

	if (document === null) {
		return <p>Page not found</p>;
	}

	return (
		<div className="pb-40">
			<Cover url={document.coverImage} />
			<div className="md:max-w-3xl lg:max-w-4xl mx-auto">
				<Toolbar initialData={document} />
			</div>
		</div>
	);
}

export default DocumentIdPage;