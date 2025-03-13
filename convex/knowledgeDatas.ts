import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import {Doc, Id} from "./_generated/dataModel";
import { api } from "../convex/_generated/api";

export const addKD = action({
	args: {
		conceptId: v.id("concepts"),
		sourceId: v.id("documents"),
		blockId: v.optional(v.string()),
		knowledge: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Create knowledge data entry without processing
		const knowledge: Id<"knowledgeDatas"> = await ctx.runMutation(api.knowledgeDatas.create, {
			conceptId: args.conceptId,
			sourceId: args.sourceId,
			blockId: args.blockId,
			knowledge: args.knowledge
		});

		// Mark concept as needing sync
		await ctx.runMutation(api.concepts.updateConcept, {
			conceptId: args.conceptId,
			IsSynced: false
		});

		return knowledge;
	}
});

export const create = mutation({
	args: {
		conceptId: v.id("concepts"),
		sourceId: v.id("documents"),
		blockId: v.optional(v.string()),
		knowledge: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;


		const knowledge = await ctx.db.insert("knowledgeDatas", {
			userId: userId,
			sourceFile: args.sourceId,
			sourceSection: args.blockId,
			isProcessed: false,
			conceptId: args.conceptId,
			knowledge: args.knowledge,
			isUpdated: false
		});

		return knowledge;
	}
});

export const addAllKD = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		console.log("addAllKD - start: ", args);
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("addAllKD: Not authenticated");
		}

		const userId = identity.subject;

		const concept = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});;

		if (!concept) {
			throw new Error("addAllKD: concept not existed");
		}

		console.log("addAllKD - concept: ", concept, "");

		const blocksDictionary: Record<string, [Block, Id<"documents">]> = await ctx.runAction(api.documents.getBlocksContainsConcept, {conceptId: args.conceptId});

		console.log("addAllKD - collectBlocks: ", blocksDictionary);

		for (const [blockId, [block, documentId]] of Object.entries(blocksDictionary)) {
			const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {block: JSON.stringify(block)});

			await ctx.runAction(api.knowledgeDatas.addKD, {conceptId: args.conceptId, sourceId: documentId, blockId: blockId});
		}
	}
});

export const isContainConcept = action({
	args: {
		blockText: v.string(),
		documentId: v.optional(v.id("documents")),
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		// TODO: implement this function
		return true;
	}
})

export const deleteKD = mutation({
	args: {
		knowledgeId: v.id("knowledgeDatas"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const knowledge = await ctx.db.get(args.knowledgeId);

		if (!knowledge) {
			throw new Error("Knowledge not existed");
		}

		if (knowledge.userId !== userId) {
			throw new Error("Permission denied");
		}

		await ctx.db.delete(args.knowledgeId);
	}
});

export const removeKD = action({
	args: {
		knowledgeId: v.id("knowledgeDatas"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		await ctx.runAction(api.objectTags.removeAllObjectTags, {knowledgeId: args.knowledgeId});

		await ctx.runAction(api.references.removeAllRef, {knowledgeId: args.knowledgeId});

		await ctx.runMutation(api.knowledgeDatas.deleteKD, {knowledgeId: args.knowledgeId});
	}
});

export const getKDsofConcept = query({
	args: {
		conceptId: v.id("concepts"),
	},

	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const KDs = await ctx.db.query("knowledgeDatas")
		.withIndex("by_concept", (q) =>
			q
				.eq("userId", userId)
				.eq("conceptId", args.conceptId)
		)
		.order("desc")
		.collect();

		return KDs;
	}
});

export const updateKD = mutation({
	args: {
		knowledgeId: v.id("knowledgeDatas"),
		knowledge: v.optional(v.string()),
		isProcessed: v.optional(v.boolean()),
		isUpdated: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const { knowledgeId, ...updates } = args;
		return await ctx.db.patch(knowledgeId, updates);
	}
});
//fetchKD is at llm

export const getUpdatedKDbyConceptId = query({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const KDs = await ctx.db.query("knowledgeDatas")
		.withIndex("by_isUpdated_concept", (q) =>
			q
				.eq("userId", userId)
				.eq("conceptId", args.conceptId)
				.eq("isUpdated", true)
		)
		.collect();

		return KDs;
	}	
});

export const getKDById = query({
	args: {
		knowledgeId: v.id("knowledgeDatas"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const knowledge = await ctx.db.get(args.knowledgeId);

		if (!knowledge) throw new Error("Knowledge not existed");

		if (knowledge.userId !== userId) throw new Error("Permission denied");

		return knowledge;
	}
});