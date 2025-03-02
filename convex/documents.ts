/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {action, mutation, query, QueryCtx} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import {createConcept} from "./concepts";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import { api } from "../convex/_generated/api";
import { is } from "@blocknote/core/types/src/i18n/locales";

interface BlockContent {
	type: string;
	text?: string;
	href?: string;
	alias?: string;
}

interface BlockInspect {
	blockId: string;
	conceptSynced: boolean;
	edited: boolean;
	toRemove: boolean;
	conceptKnowledge: Record<Id<"concepts">, Id<"knowledgeDatas">>;
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
			}
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
				conceptKnowledge: v.record(v.id("concepts"), v.id("knowledgeDatas")),
				references: v.array(v.id("references"))
			}))
		}))
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

		const result: Record<string, [Block, Id<"documents">]> = {};

		for (const keyword of concept.aliasList) {

			const documents = await ctx.runQuery(api.documents.getDocumentContainsKeyword, {keyword: keyword});
			console.log("documents: ", documents);

			async function searchBlocks(blocks: Block[], documentId: Id<"documents">): Promise<void> {
				for (const block of blocks) {
					console.log("block: ", block);
					if (block.content) {
						const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {block: JSON.stringify(block)});
						if (blockText.includes(keyword)) {

							console.log("includes keyword: ", blockText);
							const isContained = await ctx.runAction(api.knowledgeDatas.isContainConcept, {blockText: blockText, documentId: documentId, conceptId: args.conceptId})

							if (isContained) {
							result[block.id] = [block, documentId];
								continue;
							}
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

	handler: async (ctx, args) => {

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
					return `<LINK> ${content.href} <LINK>`;
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
			conceptKnowledge: v.record(v.id("concepts"), v.id("knowledgeDatas")),
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

		const toDelete = [];
		// Handle existing knowledge data
		for (const [conceptId, kdId] of Object.entries(args.blockInspect.conceptKnowledge)) {
			await ctx.runMutation(api.concepts.updateConcept, {
				conceptId: conceptId as Id<"concepts">,
				IsSynced: false
			});

			if (!args.blockInspect.blockMentionedConcepts.includes(conceptId as Id<"concepts">)) {
				await ctx.runAction(api.knowledgeDatas.removeKD, {
					knowledgeId: kdId
				});
				toDelete.push(conceptId);
				continue;
			}

			const newKnowledge = await ctx.runAction(api.llm.fetchKDLLM, {
				conceptId: conceptId as Id<"concepts">,
				sourceId: args.documentId,
				blockText: blockText,
				knowledgeId: kdId
			});

			await ctx.runMutation(api.knowledgeDatas.updateKD, {
				knowledgeId: kdId,
				knowledge: newKnowledge,
				isProcessed: false
			});
		}

		// Handle new concepts that don't have knowledge data yet
		for (const conceptId of args.blockInspect.blockMentionedConcepts) {
			if (!args.blockInspect.conceptKnowledge[conceptId]) {
				// Create new knowledge data for this concept
				const newKnowledge = await ctx.runAction(api.llm.fetchKDLLM, {
					conceptId: conceptId,
					sourceId: args.documentId,
					blockText: blockText
				});

				const newKnowledgeData = await ctx.runMutation(api.knowledgeDatas.create, {
					conceptId: conceptId,
					sourceId: args.documentId,
					blockId: args.blockInspect.blockId,
					knowledge: newKnowledge,
				});

				args.blockInspect.conceptKnowledge[conceptId] = newKnowledgeData;

				// Mark concept for syncing
				await ctx.runMutation(api.concepts.updateConcept, {
					conceptId: conceptId,
					IsSynced: false
				});
			}
		}

		// Remove deleted concepts
		for (const conceptId of toDelete) {
			delete args.blockInspect.conceptKnowledge[conceptId as Id<"concepts">];
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

		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document) throw new Error("Document not found");
		if (!document.fileInspect) return;

		const conceptsToSync = new Set<Id<"concepts">>();

		// 1. Process blocks marked for removal
		for (const blockInspect of document.fileInspect.blocks) {
			if (blockInspect.toRemove) {
				await ctx.runAction(api.documents.removeBlock, {
					documentId: args.documentId,
					blockInspect: blockInspect
				});
				continue;
			}

			// Process edited blocks as before
			if (blockInspect.edited) {
				const updatedBlockInspect = await ctx.runAction(api.documents.InspectEditedBlock, {
					documentId: args.documentId,
					blockInspect: blockInspect
				});

				updatedBlockInspect.blockMentionedConcepts.forEach(conceptId => {
					conceptsToSync.add(conceptId);
				});

				// update the fileInspect with the updatedBlockInspect
				document.fileInspect.blocks = document.fileInspect.blocks.map(b => 
					b.blockId === blockInspect.blockId ? updatedBlockInspect : b
				);
			}
		}

		// 2. Sync all affected concepts
		for (const conceptId of conceptsToSync) {
			const concept = await ctx.runQuery(api.concepts.getById, {
				conceptId: conceptId
			});
			
			if (concept && !concept.IsSynced) {
				await ctx.runAction(api.concepts.syncConcept, {
					conceptId: conceptId
				});
			}
		}

		// Update document with new fileInspect
		await ctx.runMutation(api.documents.update, {
			id: args.documentId,
			fileInspect: document.fileInspect
		});

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

export const markBlockAsEdited = mutation({
	args: {
		documentId: v.id("documents"),
		blockId: v.string(),
		isDeleted: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document?.fileInspect) return;

		console.log("Marking block as edited:", args.blockId);

		let updatedBlocks = document.fileInspect.blocks;
		const existingBlock = updatedBlocks.find(block => block.blockId === args.blockId);

		if (!existingBlock) {
			// Initialize new block inspect
			const newBlockInspect: BlockInspect = {
				blockId: args.blockId,
				conceptSynced: false,
				edited: true,
				toRemove: args.isDeleted ?? false,
				conceptKnowledge: {},
				blockMentionedConcepts: [],
				references: []
			};
			updatedBlocks = [...updatedBlocks, newBlockInspect];
		} else {
			// Update existing block
			updatedBlocks = updatedBlocks.map(block => 
				block.blockId === args.blockId 
					? { 
						...block, 
						edited: true,
						toRemove: args.isDeleted ?? block.toRemove
					}
					: block
			);
		}

		await ctx.db.patch(args.documentId, {
			fileInspect: {
				...document.fileInspect,
				blocks: updatedBlocks
			}
		});

		console.log("Updated block inspect:", updatedBlocks.find(block => block.blockId === args.blockId));
		return updatedBlocks.find(block => block.blockId === args.blockId);
	}
});

export const removeBlock = action({
	args: {
		documentId: v.id("documents"),
		blockInspect: v.object({
			blockId: v.string(),
			edited: v.boolean(),
			conceptSynced: v.boolean(),
			toRemove: v.boolean(),
			conceptKnowledge: v.record(v.id("concepts"), v.id("knowledgeDatas")),
			blockMentionedConcepts: v.array(v.id("concepts")),
			references: v.array(v.id("references"))
		})
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// 1. Remove all knowledge data
		for (const kdId of Object.values(args.blockInspect.conceptKnowledge)) {
			await ctx.runAction(api.knowledgeDatas.removeKD, {
				knowledgeId: kdId
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

export const SyncConceptKeyword = action({
	args: {
		documentId: v.id("documents"),
		blockId: v.string()
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// 1. Get block text
		const block = await ctx.runQuery(api.documents.getBlockById, {
			documentId: args.documentId,
			blockId: args.blockId
		});
		if (!block) throw new Error("Block not found");

		const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {
			block: JSON.stringify(block)
		});

		// 2. Get concept keywords
		const conceptKeywords = await ctx.runAction(api.llm.fetchConceptKeywords, {
			blockId: args.blockId,
			documentId: args.documentId
		});

		// 5. Mark block as edited in fileInspect and update concepts
		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId
		});
		if (!document?.fileInspect) return;

		// Get new concept IDs from conceptKeywords
		const newConceptIds = conceptKeywords.map(([_, id]) => id);

		// Update blocks with merged concept IDs
		const updatedBlocks = document.fileInspect.blocks.map(b =>
			b.blockId === args.blockId
				? {
						...b,
						edited: true,
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
					conceptKnowledge: {},
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
			updatedBlocks = [...updatedBlocks, {
				blockId: args.blockId,
				edited: true,
				conceptSynced: false,
				toRemove: false,
				conceptKnowledge: {}, // Initialize as empty object
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
