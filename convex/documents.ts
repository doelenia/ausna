/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {action, mutation, query, QueryCtx} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import { api } from "../convex/_generated/api";

interface BlockContent {
	type: string;
	text?: string;
	content?: {
		text: string;
	}
	alias?: string;
}

interface BlockInspect {
	blockId: string;
	conceptSynced: boolean;
	edited: boolean;
	toRemove: boolean;
	blockMentionedConcepts: Id<"concepts">[];
	references: Id<"references">[];
}

interface FileInspect {
	fileMentionedConcepts: Id<"concepts">[];
	blocks: BlockInspect[];
}

export const archive = mutation({
	args: { id: v.id("documents") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const existingDocument = await ctx.db.get(args.id);

		if (!existingDocument) {
			throw new Error("Document not found");
		}

		if (existingDocument.userId !== userId) {
			throw new Error("Unauthorized");
		}

		const recursiveArchive = async (documentId: Id<"documents">) => {
			const children = await ctx.db.query("documents")
				.withIndex("by_user_parent", (q) =>
					q
						.eq("userId", userId)
						.eq("parentDocument", documentId)
				)
				.collect();

			for (const child of children) {
				await ctx.db.patch(child._id, {
					isArchived: true,
				});

				await recursiveArchive(child._id);
			}

			await ctx.db.patch(documentId, {
				isArchived: true,
			});
		};

		const document = await ctx.db.patch(args.id, {
			isArchived: true,
		});

		await recursiveArchive(args.id);

		return document;
	}
});

export const getSidebar = query({
	args: {
		parentDocument: v.optional(v.id("documents")),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const documents = await ctx.db.query("documents")
			.withIndex("by_user_parent", (q) =>
				q
					.eq("userId", userId)
					.eq("parentDocument", args.parentDocument)
			)
			.filter((q) =>
				q.eq(q.field("isArchived"), false)
			)
			.filter((q) =>
				q.eq(q.field("type"), "page")
			)
			.order("desc")
			.collect();

		return documents;
	},

});

export const create = mutation({
	args: {
		title: v.string(),
		parentDocument: v.optional(v.id("documents")),
		type: v.optional(v.string()),
		isArchived: v.optional(v.boolean()),
		sourceFile: v.optional(v.string()),
		content: v.optional(v.string()),
		typePropsID: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const document = await ctx.db.insert("documents", {
			title: args.title,
			userId: userId,
			type: args.type ? args.type : "page",
			isArchived: false,
			parentDocument: args.parentDocument,
			isPublished: false,
			typePropsID: args.typePropsID,
			fileInspect: {
				fileMentionedConcepts: [],
				blocks: []
			},
			inspectInProgress: false
		});

		await ctx.runMutation(api.sideHelps.createSideHelp, {
			documentId: document,
		});

		return document;
	}
});

export const getTrash = query({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const documents = await ctx.db.query("documents")
			.withIndex("by_user", (q) =>
				q
					.eq("userId", userId)
			)
			.filter((q) =>
				q.eq(q.field("isArchived"), true)
			)
			.order("desc")
			.collect();

		return documents;
	}
});

export const restore = mutation({
	args: { id: v.id("documents") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const existingDocument = await ctx.db.get(args.id);

		if (!existingDocument) {
			throw new Error("Document not found");
		}

		if (existingDocument.userId !== userId) {
			throw new Error("Unauthorized");
		}

		const recursiveRestore = async (documentId: Id<"documents">) => {
			const children = await ctx.db.query("documents")
				.withIndex("by_user_parent", (q) =>
					q
						.eq("userId", userId)
						.eq("parentDocument", documentId)
				)
				.collect();

			for (const child of children) {
				await ctx.db.patch(child._id, {
					isArchived: false,
				});

				await recursiveRestore(child._id);
			}

			await ctx.db.patch(documentId, {
				isArchived: false,
			});
		};

		const options: Partial<Doc<"documents">> = {
			isArchived: false,
		};

		if (existingDocument.parentDocument) {
			const parent = await ctx.db.get(existingDocument.parentDocument);

			if (parent?.isArchived) {
				options.parentDocument = undefined;
			}
		}

		const documents = await ctx.db.patch(args.id, options);

		recursiveRestore(args.id);

		return documents;
	}
});

export const remove = mutation({
	args: { id: v.id("documents") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const existingDocument = await ctx.db.get(args.id);

		if (!existingDocument) {
			throw new Error("Document not found");
		}

		if (existingDocument.userId !== userId) {
			throw new Error("Unauthorized");
		}

		const document = await ctx.db.delete(args.id);

		await ctx.runMutation(api.sideHelps.deleteSideHelp, {
			documentId: args.id,
		});

		return document;
	}
});

export const getSearch = query({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const documents = await ctx.db.query("documents")
			.withIndex("by_user", (q) =>
				q
					.eq("userId", userId)
			)
			.filter((q) =>
				q.eq(q.field("isArchived"), false)
			)
			.order("desc")
			.collect();

		return documents;
	}
});

export const getById = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		const document = await ctx.db.get(args.documentId);

		if (!document) {
			throw new Error("Document not found");
		}

		if (document.isPublished && !document.isArchived) {
			return document;
		}

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		if (document.userId !== userId) {
			throw new Error("Unauthorized");
		}

		return document;
	}

});

export const update = mutation({
	args: {
		id: v.id("documents"),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
		coverImage: v.optional(v.string()),
		icon: v.optional(v.string()),
		isPublished: v.optional(v.boolean()),
		fileInspect: v.optional(v.object({
			fileMentionedConcepts: v.array(v.id("concepts")),
			blocks: v.array(v.object({
				blockId: v.string(),
				conceptSynced: v.boolean(),
				edited: v.boolean(),
				toRemove: v.boolean(),
				blockMentionedConcepts: v.array(v.id("concepts")),
				references: v.array(v.id("references"))
			}))
		})),
		inspectInProgress: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;
		const { id, ...rest } = args;

		const existingDocument = await ctx.db.get(args.id);
		if (!existingDocument) throw new Error("Document not found");
		if (existingDocument.userId !== userId) throw new Error("Unauthorized");

		const document = await ctx.db.patch(args.id, {
			...rest,
		});

		return document;
	}
});

export const removeIcon = mutation({
	args: { id: v.id("documents") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const existingDocument = await ctx.db.get(args.id);

		if (!existingDocument) {
			throw new Error("Document not found");
		}

		if (existingDocument.userId !== userId) {
			throw new Error("Unauthorized");
		}

		const documents = await ctx.db.patch(args.id, {
			icon: undefined,
		});

		return documents;
	}
});

export const removeCoverImage = mutation({
	args: { id: v.id("documents") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const existingDocument = await ctx.db.get(args.id);

		if (!existingDocument) {
			throw new Error("Document not found");
		}

		if (existingDocument.userId !== userId) {
			throw new Error("Unauthorized");
		}

		const documents = await ctx.db.patch(args.id, {
			coverImage: undefined,
		});

		return documents;
	}
});

export const searchDocumentTitle = query({
	args: { title: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const documents = await ctx.db.query("documents")
			.withSearchIndex("search_title", (q) =>
				q.search("title", args.title).eq("userId", userId)
			)
			.collect();

		return documents;
	}
});

export const getDocumentContainsKeyword = query({
	args: { keyword: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const documents = await ctx.db.query("documents")
			.withSearchIndex("search_content", (q) =>
				q.search("content", args.keyword).eq("userId", userId)
			)
			.collect();

		return documents;
	}
});


export const getBlocksContainsConcept = action({
	args: { conceptId: v.id("concepts")},

	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const concept = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});;

		if (!concept) {
			throw new Error("GBCC: concept not existed");
		}


		// result is a dictionary whiches value is Block, document Id, and a list of string
		const result: Record<string, [Block, Id<"documents">, Array<string>]> = {};

		for (const keyword of concept.aliasList) {

			const documents = await ctx.runQuery(api.documents.getDocumentContainsKeyword, {keyword: keyword});
			console.log("documents: ", documents);

			async function searchBlocks(blocks: Block[], documentId: Id<"documents">): Promise<void> {
				for (const block of blocks) {
					console.log("block: ", block);
					if (block.content) {
						const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {block: JSON.stringify(block)});

						const aliasList = await ctx.runAction(api.llm.isContainConcept, {blockText: blockText, documentId: documentId, conceptId: args.conceptId})

						if (aliasList.length > 0) {
							result[block.id] = [block, documentId, aliasList];
							continue;
						}
					}
					if (block.children && block.children.length > 0) {
						await searchBlocks(block.children, documentId);
					}
				}
			}

			for (const document of documents) {
				const docBlocks = JSON.parse(document.content as unknown as string) as Block[];
				console.log("docBlocks: ", docBlocks);
				await searchBlocks(docBlocks, document._id);
			}
		}
    return result;
	}
});

export const getBlockById = query({
	args: { documentId: v.id("documents"), blockId: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const document = await ctx.db.get(args.documentId);

		if (!document) {
			throw new Error("Document not found");
		}

		if (document.userId !== userId) {
			throw new Error("Unauthorized");
		}

		// Parse the content string into blocks
		let blocks: Block[];
		try {
				blocks = JSON.parse(document.content as unknown as string) as Block[];
		} catch (e) {
			console.error("Failed to parse blocks:", e);
			return null;
		}
		
		
		const result = findBlock(args.blockId, blocks);
		console.log("result: ", result);
		return result;
	}
});

// Moved outside query context since it doesn't need database access
function findBlock(blockId: string, blocks: Block[]): Block | null {
	for (const block of blocks) {
		// Check if current block matches
		console.log("findBlock current block: ", block);
		console.log("findBlock target block id: ", blockId);
		if (block.id === blockId) {
			return block;
		}
		// Recursively search children if they exist
		if (block.children && block.children.length > 0) {
			const found = findBlock(blockId, block.children);
			if (found) {
				return found;
			}
		}
	}
	return null;
}

export const getBlockTextFromBlock = action({
	args: { block: v.any() },

	handler: async (ctx, args) : Promise<string> => {

		const block = typeof args.block === 'string' 
			? JSON.parse(args.block) as Block 
			: args.block as Block;

		const blockContent = Array.isArray(block.content) 
			? block.content as BlockContent[]
			: JSON.parse(block.content as unknown as string) as BlockContent[];

		return blockContent.map(content => {
			switch (content.type) {
				case "text":
					return content.text;
				case "link":
					return `<LINK> ${content.content!.text} <LINK>`;
				case "conceptKeyword":
					return `<CONCEPT> ${content.alias} <CONCEPT>`;
				default:
					return "";
			}
		}).join(" ");
	}
});

export const InspectEditedBlock = action({
	args: {
		documentId: v.id("documents"),
		blockInspect: v.object({
			blockId: v.string(),
			conceptSynced: v.boolean(),
			edited: v.boolean(),
			toRemove: v.boolean(),
			blockMentionedConcepts: v.array(v.id("concepts")),
			references: v.array(v.id("references"))
		}),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");

		const block = await ctx.runQuery(api.documents.getBlockById, {
			documentId: args.documentId,
			blockId: args.blockInspect.blockId
		});
		if (!block) throw new Error("Block not found");

		const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {
			block: JSON.stringify(block)
		});

		// Handle new concepts that don't have knowledge data yet
		for (const conceptId of args.blockInspect.blockMentionedConcepts) {
			await ctx.runAction(api.llm.updateKDLLM, {
				conceptId: conceptId,
				sourceType: "document",
				sourceId: args.documentId,
				sourceSection: args.blockInspect.blockId,
				sourceText: blockText
			});
		}

		args.blockInspect.edited = false;
		return args.blockInspect;
	}
});

export const InspectDocument = action({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		console.log("Inspecting the entire document:", args.documentId);
		

		// First sync all concept keywords
		// await ctx.runAction(api.documents.syncAllConceptKeywords, {
		// 	documentId: args.documentId
		// });

		// wait till the inspectInProgress is false
		// while (await ctx.runQuery(api.documents.getInspectInProgress, {
		// 	documentId: args.documentId
		// })) {
		// 	await new Promise(resolve => setTimeout(resolve, 1000));
		// }

		let needUpdate = false;

		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");
		if (!document.fileInspect) return;


		// 1. Process blocks marked for removal
		for (const blockInspect of document.fileInspect.blocks) {
			if (blockInspect.toRemove) {
				await ctx.runAction(api.documents.removeBlock, {
					documentId: args.documentId,
					blockInspect: blockInspect
				});
				//remove the blockInspect from the document.fileInspect.blocks
				document.fileInspect.blocks = document.fileInspect.blocks.filter(b => b.blockId !== blockInspect.blockId);
				needUpdate = true;
				continue;
			}

			// Process edited blocks as before
			if (blockInspect.edited) {
				const updatedBlockInspect = await ctx.runAction(api.documents.InspectEditedBlock, {
					documentId: args.documentId,
					blockInspect: blockInspect
				});

				// update the fileInspect with the updatedBlockInspect
				document.fileInspect.blocks = document.fileInspect.blocks.map(b => 
					b.blockId === blockInspect.blockId ? updatedBlockInspect : b
				);
				needUpdate = true;
			}
		}

		// await ctx.runAction(api.concepts.syncAllConcepts, {
		// 	userId: identity.subject
		// });

		// Update document with new fileInspect
		if (needUpdate) {
			await ctx.runMutation(api.documents.update, {
				id: args.documentId,
				fileInspect: document.fileInspect
			});
		}

		return true;
	}
});

export const getBlockInspect = query({
	args: {
		documentId: v.id("documents"),
		blockId: v.string()
	},
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document?.fileInspect) return null;

		return document.fileInspect.blocks.find(block => block.blockId === args.blockId);
	}
});

// export const markBlockAsEdited = mutation({
// 	args: {
// 		documentId: v.id("documents"),
// 		blockId: v.string(),
// 		isDeleted: v.optional(v.boolean())
// 	},
// 	handler: async (ctx, args) => {
// 		const document = await ctx.db.get(args.documentId);
// 		if (!document?.fileInspect) return;

// 		console.log("Marking block as edited:", args.blockId);

// 		let updatedBlocks = document.fileInspect.blocks;
// 		const existingBlock = updatedBlocks.find(block => block.blockId === args.blockId);

// 		if (!existingBlock) {
// 			// Initialize new block inspect
// 			const newBlockInspect: BlockInspect = {
// 				blockId: args.blockId,
// 				conceptSynced: false,
// 				edited: true,
// 				toRemove: args.isDeleted ?? false,
// 				blockMentionedConcepts: [],
// 				references: []
// 			};
// 			updatedBlocks = [...updatedBlocks, newBlockInspect];
// 		} else {
// 			// Update existing block
// 			updatedBlocks = updatedBlocks.map(block => 
// 				block.blockId === args.blockId 
// 					? { 
// 						...block, 
// 						edited: true,
// 						toRemove: args.isDeleted ?? block.toRemove
// 					}
// 					: block
// 			);
// 		}

// 		await ctx.db.patch(args.documentId, {
// 			fileInspect: {
// 				...document.fileInspect,
// 				blocks: updatedBlocks
// 			}
// 		});

// 		console.log("Updated block inspect:", updatedBlocks.find(block => block.blockId === args.blockId));
// 		return updatedBlocks.find(block => block.blockId === args.blockId);
// 	}
// });

export const removeBlock = action({
	args: {
		documentId: v.id("documents"),
		blockInspect: v.object({
			blockId: v.string(),
			edited: v.boolean(),
			conceptSynced: v.boolean(),
			toRemove: v.boolean(),
			blockMentionedConcepts: v.array(v.id("concepts")),
			references: v.array(v.id("references"))
		})
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// 1. Remove all knowledge data
		// fetch all knowledgeDatas with sourceId = args.documentId and blockId = args.blockInspect.blockId
		const knowledgeDatas = await ctx.runQuery(api.knowledgeDatas.getConceptKDbySource, {
			sourceType: "document",
			sourceId: args.documentId,
			blockId: args.blockInspect.blockId
		});

		// remove all knowledgeDatas
		for (const kd of knowledgeDatas) {
			await ctx.runAction(api.knowledgeDatas.removeKD, {
				knowledgeId: kd._id
			});
		}

		// 2. Remove all references
		for (const refId of args.blockInspect.references) {
			await ctx.runMutation(api.references.removeRef, {
				referenceId: refId
			});
		}

		// 3. Get document to update fileInspect
		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document?.fileInspect) return;

		// 4. Remove block from fileInspect.blocks
		const updatedBlocks = document.fileInspect.blocks.filter(
			block => block.blockId !== args.blockInspect.blockId
		);

		// 5. Update document's fileInspect
		console.log("Updated blocks:", updatedBlocks);

		await ctx.runMutation(api.documents.update, {
			id: args.documentId,
			fileInspect: {
				...document.fileInspect,
				blocks: updatedBlocks
			}
		});

		// fetch the document again and log the fileInspect
		const updatedDocument = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		console.log("Updated document:", updatedDocument?.fileInspect);

		return true;
	}
});

export const SyncConceptKeyword = action({
	args: {
		documentId: v.id("documents"),
		blockId: v.string()
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		console.log("Syncing concept keyword for block:", args.blockId);

		// 1. Get block text
		const block = await ctx.runQuery(api.documents.getBlockById, {
			documentId: args.documentId,
			blockId: args.blockId
		});
		if (!block) throw new Error("Block not found");

		// get block text
		const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {
			block: JSON.stringify(block)
		});

		if (blockText.trim() === "") {
			return;
		}

		// 2. Get concept keywords
		const conceptKeywords = await ctx.runAction(api.llm.fetchConceptKeywords, {
			blockId: args.blockId,
			documentId: args.documentId
		});

		console.log(`Concept keywords: ${conceptKeywords} for block: ${args.blockId}`);

		// 5. Mark block as edited in fileInspect and update concepts
		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document?.fileInspect) return;

		// Get new concept IDs from conceptKeywords
		const newConceptIds = conceptKeywords.map(([_, id]) => id);

		// Update blocks with merged concept IDs and mark as synced
		const updatedBlocks = document.fileInspect.blocks.map(b =>
			b.blockId === args.blockId
				? {
						...b,
						edited: true,
						conceptSynced: true, // Mark as synced
						blockMentionedConcepts: Array.from(new Set([
							...b.blockMentionedConcepts,
							...newConceptIds
						]))
					}
				: b
		);

		// Update fileMentionedConcepts with all concepts
		const updatedFileConcepts = Array.from(new Set([
			...document.fileInspect.fileMentionedConcepts,
			...newConceptIds
		]));

		console.log(`Updated fileMentionedConcepts: ${updatedFileConcepts} for block: ${args.blockId}`);

		await ctx.runMutation(api.documents.update, {
			id: args.documentId,
			fileInspect: {
				...document.fileInspect,
				fileMentionedConcepts: updatedFileConcepts,
				blocks: updatedBlocks
			}
		});

		return true;
	}
});

export const InspectAllBlock = action({
	args: {
		documentId: v.id("documents"),
		content: v.string() // JSON string of BlockNote content
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get document
		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");
		if (!document.fileInspect) return;

		// Parse content into blocks
		const blocks = JSON.parse(args.content) as Block[];
		let updatedFileInspect = document.fileInspect;

		// Process each block
		for (const block of blocks) {
			let blockInspect = updatedFileInspect.blocks.find(b => b.blockId === block.id);

			// 1. Initialize blockInspect if not exists
			if (!blockInspect) {
				blockInspect = {
					blockId: block.id,
					conceptSynced: false,
					edited: true, // Mark as edited since we need to inspect it
					toRemove: false,
					blockMentionedConcepts: [],
					references: []
				};
				updatedFileInspect.blocks.push(blockInspect);
			} else {
				// Mark existing block as edited to force inspection
				blockInspect.edited = true;
			}

			// 2. Sync concept keywords in the block
			await ctx.runAction(api.documents.SyncConceptKeyword, {
				documentId: args.documentId,
				blockId: block.id
			});

			// 3. Inspect the block content
			const updatedBlockInspect = await ctx.runAction(api.documents.InspectEditedBlock, {
				documentId: args.documentId,
				blockInspect: blockInspect
			});

			// 4. Update block inspect in file inspect
			updatedFileInspect.blocks = updatedFileInspect.blocks.map(b => 
				b.blockId === block.id ? updatedBlockInspect : b
			);
		}

		// Update document with new fileInspect
		await ctx.runMutation(api.documents.update, {
			id: args.documentId,
			fileInspect: updatedFileInspect
		});

		// Sync all concepts
		await ctx.runAction(api.concepts.syncAllConcepts, {
			userId: identity.subject
		});

		return true;
	}
});

export const addConceptKeyword = mutation({
	args: {
		documentId: v.id("documents"),
		blockId: v.string(),
		conceptId: v.id("concepts")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const document = await ctx.db.get(args.documentId);
		if (!document?.fileInspect) return;

		// Add concept to fileMentionedConcepts if not exists
		const updatedFileConcepts = document.fileInspect.fileMentionedConcepts.includes(args.conceptId)
			? document.fileInspect.fileMentionedConcepts
			: [...document.fileInspect.fileMentionedConcepts, args.conceptId];

		// Find or create block inspect
		let updatedBlocks = document.fileInspect.blocks;
		const blockInspect = updatedBlocks.find(b => b.blockId === args.blockId);

		if (!blockInspect) {
			// Create new block inspect with empty conceptKnowledge
			console.log("Creating new block inspect due to invalid blockInspect");
			updatedBlocks = [...updatedBlocks, {
				blockId: args.blockId,
				edited: true,
				conceptSynced: false,
				toRemove: false,
				blockMentionedConcepts: [args.conceptId],
				references: []
			}];
		} else {
			// Update existing block inspect
			updatedBlocks = updatedBlocks.map(b => 
				b.blockId === args.blockId
					? {
						...b,
						blockMentionedConcepts: b.blockMentionedConcepts.includes(args.conceptId)
							? b.blockMentionedConcepts
							: [...b.blockMentionedConcepts, args.conceptId]
					}
					: b
			);
		}

		// Update document
		await ctx.db.patch(args.documentId, {
			fileInspect: {
				...document.fileInspect,
				fileMentionedConcepts: updatedFileConcepts,
				blocks: updatedBlocks
			}
		});

		return true;
	}
});

export const syncAllConceptKeywords = action({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document?.fileInspect) return;
		if (document.inspectInProgress) return;

		await ctx.runMutation(api.documents.setInspectInProgress, {
			documentId: args.documentId,
			inspectInProgress: true
		});

		console.log("Syncing all concept keywords for document:", args.documentId);

		// Find all blocks that need concept syncing also not deleted
		const unsyncedBlocks = document.fileInspect.blocks.filter(
			block => block.conceptSynced === false && !block.toRemove
		);

		// Sync each unsynced block
		for (const block of unsyncedBlocks) {
			await ctx.runAction(api.documents.SyncConceptKeyword, {
				documentId: args.documentId,
				blockId: block.blockId
			});
		}

		await ctx.runMutation(api.documents.setInspectInProgress, {
			documentId: args.documentId,
			inspectInProgress: false
		});

		return true;
	}
});

export const syncFileInspect = action({
	args: {
		documentId: v.id("documents"),
		blockId: v.string(),
		prevBlocks: v.array(v.any()),
		currentBlocks: v.array(v.any())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document?.fileInspect) return;

		const currentBlockIds = new Set(args.currentBlocks.map(block => block.id));
		const prevBlockIds = new Set(args.prevBlocks.map(block => block.id));

		// Create a new blocks array with all updates
		let updatedBlocks = [...document.fileInspect.blocks];

		// for updated blocks, create a new blockInspect and add or replace it in updatedBlocks
		for (const currentBlock of args.currentBlocks) {
			const prevBlock = args.prevBlocks.find(b => b.id === currentBlock.id);
			const existingBlockIndex = updatedBlocks.findIndex(b => b.blockId === currentBlock.id);
			
			// Check if block is new or content changed
			const isModified = !prevBlockIds.has(currentBlock.id) || 
				JSON.stringify(prevBlock?.content) !== JSON.stringify(currentBlock.content);

			if (isModified) {
				const blockUpdate = {
					blockId: currentBlock.id,
					edited: true,
					conceptSynced: false,
					toRemove: false,
					blockMentionedConcepts: [],
					references: []
				};

				// push blockUpdate to updatedBlocks if it doesn't exist, otherwise replace it
				if (existingBlockIndex === -1) {
					updatedBlocks.push(blockUpdate);
				} else {
					updatedBlocks[existingBlockIndex] = blockUpdate;
				}
			}
		}

		// Mark deleted blocks
		updatedBlocks = updatedBlocks.map(blockInspect => 
			!currentBlockIds.has(blockInspect.blockId)
				? { ...blockInspect, edited: true, toRemove: true }
				: blockInspect
		);

		// Update document with all changes in one mutation
		await ctx.runMutation(api.documents.update, {
			id: args.documentId,
			fileInspect: {
				...document.fileInspect,
				blocks: updatedBlocks
			}
		});

		return true;
	}
});

export const getDocumentText = action({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args) : Promise<string> => {
		const document: Doc<"documents"> = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");

		const blocks: Block[] = JSON.parse(document.content as unknown as string);

		// concatinate title and content of all blocks using getBlockTextFromBlock
		const allBlocksText: string = (await Promise.all(blocks.map(async block => await ctx.runAction(api.documents.getBlockTextFromBlock, {block: JSON.stringify(block)})))).join(" ");

		const title = document.title;

		return `${title}\n${allBlocksText}`;
	}
});

export const markBlockAsConceptSynced = action({
	args: {
		documentId: v.id("documents"),
		blockId: v.string()
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");

		const block = await ctx.runQuery(api.documents.getBlockById, {
			documentId: args.documentId,
			blockId: args.blockId
		});
		if (!block) throw new Error("Block not found");

		if (!document.fileInspect) return;

		await ctx.runMutation(api.documents.update, {
			id: args.documentId,
			fileInspect: {
				...document.fileInspect,
				blocks: document.fileInspect?.blocks.map(b => b.blockId === args.blockId ? { ...b, conceptSynced: true } : b) || []
			}
		});
		return true;
	}
});

export const setInspectInProgress = mutation({
	args: {
		documentId: v.id("documents"),
		inspectInProgress: v.boolean()
	},
	handler: async (ctx, args) => {

		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");

		await ctx.runMutation(api.documents.update, {
			id: args.documentId,
			inspectInProgress: args.inspectInProgress
		});
		
		return true;
	}
	
});

export const getInspectInProgress = query({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args) => {
		const document: Doc<"documents"> = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");

		return document.inspectInProgress;
	}
});