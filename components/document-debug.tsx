"use client";

import { Doc } from "@/convex/_generated/dataModel";

interface DocumentDebugProps {
	initialData: Doc<"documents">;
};

export const DocumentDebug = ({
	initialData
}: DocumentDebugProps ) => {

	const toDisplay = {
		Id: initialData._id,
		Type: initialData.type,
		Props: initialData.typePropsID
	};

	return (
		<div className="pl-[54px] group relative">
			<div className="rounded-md bg-primary/5 px-4
			py-4">
				<h1 className="text-lg font-bold text-primary/9">
					Document Debug
				</h1>
				{Object.entries(toDisplay).map(([key, value]) => (
					<div key={key} className="flex justify-between">
						<div className="text-sm text-primary/9">
							{key}
						</div>
						<div className="text-sm text-primary/7">
							{JSON.stringify(value)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export default DocumentDebug;