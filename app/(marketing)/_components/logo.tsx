import Image from 'next/image';
import { Newsreader } from 'next/font/google';

import { cn } from "@/lib/utils";

const font = Newsreader ({
	subsets: ['latin'],
	weight: ["500", "800"]
});

export const Logo = () => {
	return (
		<div className="hidden md:flex items-center gap-x-1">
			<Image
				src="/app_src/ausna_logo_light.svg"
				height="40"
				width="40"
				alt="Ausna Logo"
				className='dark:hidden'
			/>
			<Image
				src="/app_src/ausna_logo_dark.svg"
				height="40"
				width="40"
				alt="Ausna Logo"
				className='hidden dark:block'
			/>
		{/* <p className= "text-xl font-brand-bold">
			Ausna
		</p> */}
		</div>
	);
}