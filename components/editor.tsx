"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import {
	Block,
	BlockNoteEditor,
	BlockNoteSchema,
	defaultInlineContentSpecs,
	filterSuggestionItems,
	PartialBlock,
} from "@blocknote/core";

import {
	DefaultReactSuggestionItem,
	SuggestionMenuController,
	useCreateBlockNote
} from "@blocknote/react";

import { BlockNoteView } from "@blocknote/mantine";

import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";
import { useTheme } from "next-themes";

import { useEdgeStore } from "@/lib/edgestore";

import { ConceptKeyword } from "./ausna-features/inline/concept-keyword";
import { query } from "@/convex/_generated/server";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

interface EditorProps {
	documentId: Id<"documents">;
	onChange: (value: string) => void;
	initialContent?: string;
	editable?: boolean;
}


const Editor = ({
	documentId,
	onChange,
	initialContent,
	editable
}: EditorProps) => {
	const { edgestore } = useEdgeStore();
	const { resolvedTheme } = useTheme();
	const concepts = useQuery(api.concepts.getAllConcepts);
	const addConcept = useAction(api.concepts.addConcept);
	// const createKnowledge = useMutation(api.knowledgeDatas.addKD);
	const addKD = useAction(api.knowledgeDatas.addKD);

	const [block, setBlock] = useState<Block>();

	const handleUpload = async (file: File) => {
		const res = await edgestore.publicFiles.upload({
			file,
		});

		return res.url;
	}

	const schema = BlockNoteSchema.create({
		inlineContentSpecs: {
			// Adds all default inline content.
			...defaultInlineContentSpecs,
			// Adds the mention tag.
			conceptKeyword: ConceptKeyword,
		},
	});

	//Inline Concept Keywords
	const getConceptKeywordMenuItems = (
		documentId: Id<"documents">,
		editor: typeof schema.BlockNoteEditor,
		query: string,
		block: Block,
	): DefaultReactSuggestionItem[] => {
		console.log("finish 1");
		const addNewConcept = (editor: typeof schema.BlockNoteEditor): DefaultReactSuggestionItem => ({
			title: `Add "${query}" as a new concept`,

			onItemClick: () => {
				const promise = addConcept({
					alias: [query],
					isSynced: false,
					sourceId: documentId,
					blockId: block.id,
				});
				promise.then((conceptId) => {
					editor.insertInlineContent([
						{
							type: "conceptKeyword",
							props: {
								alias: query,
								id: conceptId,
							},
						},
						" ", // add a space after the concept keyword
					]);
				});
			},
		});

		const menuItems = concepts?.map((concept) => ({
			title: concept.aliasList[0],
			onItemClick: () => {
				editor.insertInlineContent([
					{
						type: "conceptKeyword",
						props: {
							alias: concept.aliasList[0],
							id: concept._id,
						},
					},
					" ", // add a space after the concept keyword
				]);
				const promise = addKD({
					conceptId: concept._id,
					sourceId: documentId,
					blockId: block.id,
				});
				toast.promise(promise, {
					loading: "Connecting a new knowledge to concept ...",
					success: "Knowledge Connected",
					error: "Failed to connect knowledge",
				})
			},
		}));

		if (menuItems === undefined) {
			return [addNewConcept(editor)];
		}
		menuItems.push(addNewConcept(editor));
		return menuItems;
	}


	const editor: BlockNoteEditor = useCreateBlockNote({
		schema,
		initialContent:
			initialContent
			? JSON.parse(initialContent) as PartialBlock[]
			: undefined,
		animations: false,
		uploadFile: handleUpload,
	});

	const [page, setPage] = useState<Block[]>(editor.document);


	return (
		<div>
			<BlockNoteView
				editor={editor}
				editable={editable}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
				onChange={() => {
          setPage(editor.document);
					onChange(JSON.stringify(editor.document, null, 2));
				}}
				onSelectionChange={() => {
					setBlock(editor.getTextCursorPosition().block);
				}}
			>
				<SuggestionMenuController
					triggerCharacter={"@"}
					getItems={async (query: string) =>
						// Gets the mentions menu items
						filterSuggestionItems(getConceptKeywordMenuItems(documentId, editor, query, block), query)
					}
				/>
			</BlockNoteView>

			<div className="text-sm">
        <pre>
          <code>{JSON.stringify(page, null, 2)}</code>
        </pre>
      </div>
		</div>
	)
}

export default Editor;