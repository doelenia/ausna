/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {action, mutation, query, QueryCtx} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import {createConcept} from "./concepts";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import { api } from "../convex/_generated/api";
import { is } from "@blocknote/core/types/src/i18n/locales";

interface blockContent {
	type: string;
	text: string;
	href: string;
	alias: string;
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

export const create = mutation ({
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

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const document = await ctx.db.insert("documents", {
			title: args.title,
			userId: userId,
			type: args.type? args.type : "page",
			isArchived: false,
			parentDocument: args.parentDocument,
			isPublished: false,
			typePropsID: args.typePropsID,
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
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const { id, ...rest } = args;

		const existingDocument = await ctx.db.get(args.id);

		if (!existingDocument) {
			throw new Error("Document not found");
		}

		if (existingDocument.userId !== userId) {
			throw new Error("Unauthorized");
		}

		const documents = await ctx.db.patch(args.id, {
			...rest,
		});

		return documents;
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


			async function searchBlocks(blocks: Block[], documentId: Id<"documents">): Promise<void> {
				for (const block of blocks) {
					if (block.content) {
						const content = block.content as unknown as string;
						if (content.includes(keyword)) {

							const isContained = await ctx.runAction(api.knowledgeDatas.isContainConcept, {blockText: content, documentId: documentId, conceptId: args.conceptId})

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
				const docBlocks = document.content as unknown as Block[];
				searchBlocks(docBlocks, document._id);
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

		const block = document.content as unknown as Block[];

		const result = await findBlock(ctx, args.blockId, block);

		return result as Block | null;
	}
});

async function findBlock(ctx: QueryCtx, blockId: string, blocks: Block[]): Promise<Block | null> {
  for (const block of blocks) {
		if (block.id === blockId) {
			return block;
		}
		if (block.children && block.children.length > 0) {
			const found = findBlock(ctx, blockId, block.children);
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
		const block = args.block as unknown as Block;
		const blockContent = block.content as unknown as blockContent[];

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