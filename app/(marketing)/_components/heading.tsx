"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Heading = () => {
	return (
		<div className="max-w-3xl space-y-8">
			<div className="space-y-2">
				<h1 className='text-4xl sm:text-5xl md:text-6xl font-brand-bold p-0'>
					Welcome to Ausna.
				</h1>
				<h3 className="text-base sm:text-xl md:text-2xl font-medium">
				Buildup and reconnect your knowledge universe. 
				</h3>
			</div>
			<Button>
				Enter Ausna <ArrowRight className="h-4 w-4 ml-2" />
			</Button>
			
		</div>
	)
}