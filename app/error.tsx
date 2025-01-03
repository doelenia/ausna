"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const Error = () => {
	return (
		<div className="h-full flex flex-col items-center justify-center space-y-4">
			
			<X className="text-muted-foreground h-60 w-60 text-red-500" />
			<h2 className="text-2xl font-medium">Something went wrong!</h2>
			<Button asChild>
				<Link href="/documents">
					Go back
				</Link>
			</Button>
		</div>
	);
}

export default Error;