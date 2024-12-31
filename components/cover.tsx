"use client";

import { cn } from "@/lib/utils";

import Image from "next/image";

interface CoverImageProps {
	url?: string;
	preview?: boolean;
}

export const Cover = ({
	url,
	preview,
}: CoverImageProps) => {
	return (
		<div className={cn(
			"relative w-full h-[35vh] group",
			!url && "h-[12vh]",
			url && "bg-muted",
		)}>
			{!!url && (
				<Image
					src={url}
					fill
					className="object-cover"
					objectFit="cover"
					alt="Cover Image"
				/>
			)}
			{!url && !preview && (
				<div className="absolute inset-0 flex items-center justify-center">
					<p className="text-muted-foreground text-xs">
						No Cover Image
					</p>
				</div>
			)}
		</div>
	);
}