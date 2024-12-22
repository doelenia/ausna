"use client";

import { ModeToggle } from "@/components/mode-toggle";
import { useScrollTop } from "@/hooks/use-scroll-top";
import { cn } from "@/lib/utils";
import { useConvexAuth } from "convex/react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { SignInButton, UserButton } from "@clerk/clerk-react";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { useEffect } from "react";

export const Navbar = () => {
	const scrolled = useScrollTop();
	const {isAuthenticated, isLoading} = useConvexAuth();

	// add a listener to isAuthenticated to log the value
	useEffect(() => {
		console.log("isAuthenticated", isAuthenticated);
	}, [isAuthenticated]);

	return (
		<div className={cn("z-50 bg-background fixed top-0 flex items-center w-full p-6", scrolled && "border-b shadow-sm")}>
			<Logo />
			<div className="md:ml-auto md:justify-end justify-between w-full flex gap-x-2 items-center">
				{isLoading && <Spinner/> }
				{!isAuthenticated && !isLoading && (
					<>
						<SignInButton mode="modal">
							<Button variant="ghost" size="sm">
								Login
							</Button>
						</SignInButton>

						<SignInButton mode="modal">
							<Button size="sm">
								Join Ausna
							</Button>
						</SignInButton>
					</>
				)}

				{isAuthenticated && !isLoading && (
					<>
						<Button variant="ghost" size="sm" asChild>
							<Link href="/documents">
								Enter Ausna
							</Link>
						</Button>
						<UserButton afterSignOutUrl="/" />
					</>
				)}
				<ModeToggle />
			</div>
		</div>
	)
}