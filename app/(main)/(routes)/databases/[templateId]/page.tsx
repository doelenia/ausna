"use client";

import { useUser } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ChevronLeft } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { use } from "react";
import { Menu } from "./_components/menu";
import { Title } from "./_components/title";
import { Toolbar } from "./_components/toolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { useMemo } from "react";

interface TemplateIdPageProps {
  params: Promise<{
    templateId: Id<"objectTemplates">;
  }>;
}

const TemplateIdPage = ({
  params,
}: TemplateIdPageProps) => {
  const router = useRouter();
  const { user } = useUser();
  const rParams = use(params);

  const template = useQuery(api.objectTemplates.getObjectTemplateById, {
    templateId: rParams.templateId
  });

  const DBEditor = useMemo(
    () => dynamic(() => import("./_components/db-editor"), { ssr: false }),
    []
  );

  const DBInfo = useMemo(
    () => dynamic(() => import("./_components/db-info"), { ssr: false }),
    []
  );

  if (!user) {
    return null;
  }

  if (template === undefined) {
    return (
      <div>
        <nav className="bg-background px-3 py-2 w-full flex items-center gap-x-4 ">
          <Button
            variant="ghost"
            size="sm"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center justify-between w-full">
            <Title.Skeleton />
            <Menu.Skeleton />
          </div>
        </nav>
        <div className="md:max-w-3xl lg:max-w-4xl mx-auto mt-10">
          <div className="space-y-4 pl-8 pt-4">
            <Skeleton className="h-14 w-[50%]" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[40%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        </div>
      </div>
    );
  }

  if (template === null) {
    return <div>Template not found</div>;
  }

  return (
		<div className="h-full flex-1 flex-col space-y-4 md:flex">
			<nav className="bg-background px-3 py-2 w-full flex items-center gap-x-4 sticky top-0 z-20">
				<Button
					onClick={() => router.push("/databases")}
					variant="ghost"
					size="sm"
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>
				<div className="flex items-center justify-between w-full">
					<Title initialData={template} />
					<Menu templateId={template._id} />
				</div>
			</nav>
			<div className="pb-40">
				<div className="md:max-w-3xl lg:max-w-4xl mx-auto">
					<Toolbar initialData={template} />
					<Tabs defaultValue="content" className="mt-4">
						<TabsList className="ml-12">
							<TabsTrigger value="content" className="font-semibold">Content</TabsTrigger>
							<TabsTrigger value="info" className="font-semibold">Info</TabsTrigger>
						</TabsList>
						<TabsContent value="content" className="ml-8">
							<DBEditor templateId={template._id} />
						</TabsContent>
						<TabsContent value="info" className="ml-5">
							<DBInfo templateId={template._id} />
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
  );
};

export default TemplateIdPage; 