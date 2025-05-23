"use client";

import EmojiPicker, { Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";

import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import { resolve } from "path";

interface IconPickerProps {
	onChange: (icon: string) => void;
	children: React.ReactNode;
	asChild?: boolean;
}

export const IconPicker = ({
	onChange,
	children,
	asChild = false,
}: IconPickerProps) => {
	const { resolvedTheme } = useTheme();
	const currentTheme = (resolvedTheme || "light") as keyof typeof themeMap;

	const themeMap = {
		"dark": Theme.DARK,
		"light": Theme.LIGHT
	};

	const theme = themeMap[currentTheme];

	return (
		<Popover>
			<PopoverTrigger asChild={asChild}>
					{children}
			</PopoverTrigger>
			<PopoverContent className="p-0 w-full border-none shadow=none">
				<EmojiPicker
					height={350}
					onEmojiClick={(data) => onChange(data.emoji)}
					theme={theme}
				/>
			</PopoverContent>
		</Popover>
	);
};