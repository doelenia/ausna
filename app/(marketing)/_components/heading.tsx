"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConvexAuth } from "convex/react";
import { Spinner } from "@/components/ui/spinner";
import { SignInButton } from "@clerk/clerk-react";
import Link from "next/link";

export const Heading = () => {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-brand-bold p-0">
          Welcome to Ausna.
        </h1>
        <h3 className="text-base sm:text-xl md:text-2xl font-medium">
          Buildup and reconnect your knowledge universe.
        </h3>
      </div>
      {!isAuthenticated && !isLoading && (
        <SignInButton mode="modal">
          <Button>
            Get Ausna for Free <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </SignInButton>
      )}

      {isLoading && (
				<div className="w-full flex items-center justify-center">
					<Spinner size="lg" />
				</div>
			)}

      {isAuthenticated && !isLoading && (
        <Button asChild>
					<Link href="/documents">
						Enter Ausna <ArrowRight className="h-4 w-4 ml-2" />
					</Link>
        </Button>
      )}
    </div>
  );
};
