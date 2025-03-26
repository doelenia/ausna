"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";

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

	const addKD = useAction(api.knowledgeDatas.addKD);
	const addConceptKeyword = useMutation(api.documents.addConceptKeyword);

	const [block, setBlock] = useState<Block>();
	const [prevBlocks, setPrevBlocks] = useState<Block[]>([]);

	// Reference to store timeout and current sync promise
	const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const currentSyncPromiseRef = useRef<Promise<void> | null>(null);
	const inspectionInProgressRef = useRef<Promise<void> | null>(null);
	const hasChangedSinceLastInspectionRef = useRef<boolean>(false);
	
	// Get the sync action
	const syncAllConceptKeywords = useAction(api.documents.syncAllConceptKeywords);

	const syncFileInspect = useAction(api.documents.syncFileInspect);

	const syncSideHelp = useAction(api.llm.syncSideHelp);

	// Add debounce ref for file inspect sync
	const fileInspectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const inspectDocument = useAction(api.documents.InspectDocument);

	// Wrapper for inspectDocument that manages the inspection promise
	const runInspectDocument = async () => {
		// Only run if there are changes since last inspection
		if (!hasChangedSinceLastInspectionRef.current) {
			return;
		}

		// Wait for any pending sync to complete
		if (currentSyncPromiseRef.current) {
			await currentSyncPromiseRef.current;
		}

		// Create a new inspection promise
		inspectionInProgressRef.current = (async () => {
			try {
				await inspectDocument({ documentId });
				// Reset the change flag after successful inspection
				hasChangedSinceLastInspectionRef.current = false;
			} finally {
				inspectionInProgressRef.current = null;
			}
		})();

		return inspectionInProgressRef.current;
	};

	const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lastActivityRef = useRef<number>(Date.now());

	// Cleanup function for all timeouts
	useEffect(() => {
		return () => {
			if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
			if (fileInspectTimeoutRef.current) clearTimeout(fileInspectTimeoutRef.current);
			if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
		};
	}, []);

	// Handle route changes (document switching)
	useEffect(() => {
		const handleRouteChange = async () => {
			try {
				console.log("inspecting document before leaving", documentId);
				await runInspectDocument();
			} catch (error) {
				console.error("Failed to inspect document on route change:", error);
			}
		};

		// Only run inspection when the document becomes hidden (tab switch/close) or before unload
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				handleRouteChange();
			}
		};

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			handleRouteChange();
		};

		// Add event listeners
		window.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('beforeunload', handleBeforeUnload);

		// Cleanup function
		return () => {
			window.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			
			// Run inspection when unmounting the editor component
			// This ensures we save changes when navigating away from a document
			handleRouteChange();
		};
	}, [documentId, inspectDocument]);

	// Handle inactivity
	const resetInactivityTimer = useCallback(() => {
		if (inactivityTimeoutRef.current) {
			clearTimeout(inactivityTimeoutRef.current);
		}

		lastActivityRef.current = Date.now();

		inactivityTimeoutRef.current = setTimeout(async () => {
			const timeSinceLastActivity = Date.now() - lastActivityRef.current;
			if (timeSinceLastActivity >= 60000) { // 1 minute
				try {
					console.log("inspecting document after inactivity of 1 minute");
					await runInspectDocument();
				} catch (error) {
					console.error("Failed to inspect document after inactivity:", error);
				}
			}
		}, 60000); // Check every minute
	}, [documentId, inspectDocument]);

	// Update editor onChange to include activity tracking
	const handleEditorChange = async () => {
		// Mark that changes have occurred
		hasChangedSinceLastInspectionRef.current = true;

		// Wait for any inspection in progress
		if (inspectionInProgressRef.current) {
			await inspectionInProgressRef.current;
		}

		resetInactivityTimer();
		if (syncTimeoutRef.current) {
			clearTimeout(syncTimeoutRef.current);
		}

		// Create a new promise for the sync operation
		currentSyncPromiseRef.current = new Promise<void>((resolve) => {
			syncTimeoutRef.current = setTimeout(async () => {
				try {
					await syncAllConceptKeywords({ documentId });
					await syncSideHelp({ documentId });
					resolve();
				} catch (error) {
					console.error("Failed to sync concept keywords:", error);
					resolve(); // Resolve even on error to prevent hanging
				}
			}, 5000);
		});

		return currentSyncPromiseRef.current;
	};

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
					sourceType: "document"
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
					resetInactivityTimer();
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

			{/* <div className="text-sm">
				<pre>
					<code>{JSON.stringify(page, null, 2)}</code>
				</pre>
			</div> */}
		</div>
	)
}