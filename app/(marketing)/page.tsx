import { Button } from "@/components/ui/button";
import { Heading } from "./_components/heading";
import { Heroes } from "./_components/heroes";
import { Footer } from "./_components/footer";

const MarketingPage = () => {
  return (
    <div className='min-h-full flex flex-col'>
      <div className='flex flex-col items-center justify-center md:justify-center text-center gap-y-2 flex-1 px-6 pb-10'>
        <Heroes />   
        <Heading />
      </div>
      <Footer />
    </div>
  );
}

export default MarketingPage;
