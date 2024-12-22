import Image from 'next/image';

export const Heroes = () => {
	return (
		<div className="flex flex-col items-center justify-center max-w-5xl">
			<div className='flex items-center'>
				<div className="relative w-[300px] h-[300px] sm:w-[350px] sm:h-[350px] md:h-[400px] md:w-[400px]">
					<Image 
					src="/app_src/ausna_logo_light.svg"
					fill className="object-contain dark:hidden"
					alt="Hero 1" />
					<Image 
					src="/app_src/ausna_logo_dark.svg"
					fill className="object-contain hidden dark:block"
					alt="Hero 2" />
				</div>

			</div>
		</div>
	)

}