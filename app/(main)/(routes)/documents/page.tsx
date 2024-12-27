"use client";

import { Button } from '@/components/ui/button';
import { useUser } from '@clerk/clerk-react';
import { PlusCircle, PenLine } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from "@/convex/_generated/api"
import { toast } from 'sonner';

const DocumentsPage = () => {
	const { user } = useUser();
	const create = useMutation(api.documents.create);

	const onCreate = () => {
		const promise = create({ title: "Untitled Page" });

		toast.promise(promise, {
			loading: "Creating a new page...",
			success: "Page created!",
			error: "Failed to create page."
		});
	};
	
	return (
		<div className="h-full flex flex-col items-center justify-center space-y-4">
			{/* <h1 className="text-lg font-medium"> {user?.firstName}&apos;s Ausna</h1> */}

			<Button onClick={onCreate}>
				<PenLine className="h-4 w-4 mr-2" />
				Start Writing
			</Button>
		</div>
	);
};

export default DocumentsPage;