"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useEffect, useRef } from "react";

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

export default function Editor({
	documentId,
	onChange,
	initialContent,
	editable
}: EditorProps) {
	const { edgestore } = useEdgeStore();
	const { resolvedTheme } = useTheme();
	const concepts = useQuery(api.concepts.getAllConcepts);
	const addConcept = useAction(api.concepts.addConcept);
	// const createKnowledge = useMutation(api.knowledgeDatas.addKD);
	const addKD = useAction(api.knowledgeDatas.addKD);
	const addConceptKeyword = useMutation(api.documents.addConceptKeyword);

	const [block, setBlock] = useState<Block>();
	const [prevBlocks, setPrevBlocks] = useState<Block[]>([]);
	const markBlockEdited = useMutation(api.documents.markBlockAsEdited);

	// Reference to store timeout
	const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	
	// Get the sync action
	const syncAllConceptKeywords = useAction(api.documents.syncAllConceptKeywords);

	const syncFileInspect = useAction(api.documents.syncFileInspect);

	// Add debounce ref for file inspect sync
	const fileInspectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Cleanup timeouts on unmount
	useEffect(() => {
		return () => {
			if (syncTimeoutRef.current) {
				clearTimeout(syncTimeoutRef.current);
			}
			if (fileInspectTimeoutRef.current) {
				clearTimeout(fileInspectTimeoutRef.current);
			}
		};
	}, []);

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
					
					// Add new concept keyword to document tracking
					addConceptKeyword({
						documentId,
						blockId: block.id,
						conceptId
					});
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

				// Add concept keyword to document tracking
				addConceptKeyword({
					documentId,
					blockId: block.id,
					conceptId: concept._id
				});

				// Existing knowledge data connection
				const promise = addKD({
					conceptId: concept._id,
					sourceId: documentId,
					blockId: block.id,
				});
				toast.promise(promise, {
					loading: "Connecting a new knowledge to concept ...",
					success: "Knowledge Connected",
					error: "Failed to connect knowledge",
				});
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
		initialContent: initialContent
			? JSON.parse(initialContent) as PartialBlock[]
			: undefined,
		animations: false,
		uploadFile: handleUpload,
	});

	// Debounced handler for editor changes
	const handleEditorChange = async () => {
		if (syncTimeoutRef.current) {
			clearTimeout(syncTimeoutRef.current);
		}

		syncTimeoutRef.current = setTimeout(async () => {
			try {
				await syncAllConceptKeywords({ documentId });
			} catch (error) {
				console.error("Failed to sync concept keywords:", error);
			}
		}, 5000);
	};

	// Debounced handler for block changes
	const handleBlockChange = async (block: Block) => {
		const currentBlocks = editor.document;

		if (fileInspectTimeoutRef.current) {
			clearTimeout(fileInspectTimeoutRef.current);
		}

		fileInspectTimeoutRef.current = setTimeout(async () => {
			try {
				await syncFileInspect({
					documentId,
					blockId: block.id,
					prevBlocks,
					currentBlocks
				});
				setPrevBlocks(currentBlocks);
			} catch (error) {
				console.error("Failed to sync file inspect:", error);
			}
		}, 1000); // Shorter timeout for file inspect updates
	};

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
					const changedBlock = editor.getTextCursorPosition().block;
					handleBlockChange(changedBlock);
					handleEditorChange();
				}}
				onSelectionChange={() => {
					setBlock(editor.getTextCursorPosition().block);
				}}
			>
				<SuggestionMenuController
					triggerCharacter={"@"}
					getItems={async (query: string) =>
						filterSuggestionItems(
							getConceptKeywordMenuItems(documentId, editor, query, block),
							query
						)
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