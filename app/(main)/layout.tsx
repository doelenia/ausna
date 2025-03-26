"use client";

import { useConvexAuth } from "convex/react";
import { Spinner } from "@/components/ui/spinner";
import { redirect } from "next/navigation";
import { Navigation } from "./_components/navigation";
import { SearchCommand } from "@/components/search-command";
import { useRightSidebar } from "@/hooks/use-right-sidebar";
import { useMediaQuery } from "usehooks-ts";
import { cn } from "@/lib/utils";
import { SidebarHelp } from "./_components/sidebar-help";

const MainLayout = ({ 
	children 
} : {
	children: React.ReactNode;
}) => {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const rightSidebar = useRightSidebar();
	const isMobile = useMediaQuery("(max-width: 768px)");

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
				<Navigation />
				<main className={cn(
					"flex-1 h-full overflow-y-auto transition-all duration-300 ease-in-out",
					rightSidebar.isOpen && !isMobile && "mr-80"
				)}>
					<SearchCommand/>
					{children}
				</main>
				<aside className={cn(
					"fixed right-0 top-[50px] h-[calc(100vh-50px)]  border-l border-muted overflow-y-auto transition-all ease-in-out duration-300",
					rightSidebar.isOpen ? (isMobile ? "w-full" : "w-80") : "w-0"
				)}>
					<SidebarHelp />
				</aside>
			</div>
		);
	} else {
		return redirect("/");
	}
}

export default MainLayout;