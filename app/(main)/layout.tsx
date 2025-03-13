"use client";

import { useConvexAuth } from "convex/react";
import { Spinner } from "@/components/ui/spinner";
import { redirect } from "next/navigation";
import { Navigation } from "./_components/navigation";
import { SearchCommand } from "@/components/search-command";

const MainLayout = ({ 
	children 
} : {
	children: React.ReactNode;
}) => {
	const { isAuthenticated, isLoading } = useConvexAuth();

	if (isLoading) {
		return (
			<div className="w-full flex items-center justify-center">
				<Spinner size="lg" />
			</div>
		);
	}

	if (isAuthenticated) {

		return (
			<div className='h-full flex'>
				<Navigation	/>
				<main className="flex-1 h-full overflow-y-auto">
					<SearchCommand/>
					{children}
				</main>
			</div>
		);
	} else {
		return redirect("/");
	}

}

export default MainLayout;