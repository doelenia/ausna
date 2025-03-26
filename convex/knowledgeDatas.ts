import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import {Doc, Id} from "./_generated/dataModel";
import { api } from "../convex/_generated/api";

export const addKD = action({
	args: {
		conceptId: v.id("concepts"),
		sourceId: v.string(),
		blockId: v.optional(v.string()),
		knowledge: v.optional(v.string()),
		sourceType: v.string(),
		quotes: v.optional(v.array(v.string()))
	},
	handler: async (ctx, args) : Promise<Id<"knowledgeDatas">> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");


		// Create knowledge data entry without processing
		const knowledge: Id<"knowledgeDatas"> = await ctx.runMutation(api.knowledgeDatas.create, {
			conceptId: args.conceptId,
			sourceId: args.sourceId,
			blockId: args.blockId,
			knowledge: args.knowledge,
			sourceType: args.sourceType,
			quotes: args.quotes
		});

		if (args.knowledge) {
			// create a vector embedding for the knowledge
			await ctx.runAction(api.vectorEmbed.addVectorEmbeddingforKnowledgeData, {
				knowledgeDataId: knowledge
			});
		}

		return knowledge;
	}
});

export const create = mutation({
	args: {
		conceptId: v.id("concepts"),
		sourceId: v.string(),
		blockId: v.optional(v.string()),
		knowledge: v.optional(v.string()),
		sourceType: v.string(),
		quotes: v.optional(v.array(v.string()))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		

		const knowledge = await ctx.db.insert("knowledgeDatas", {
			userId: userId,
			sourceId: args.sourceId,
			sourceType: args.sourceType,
			sourceSection: args.blockId,
			isProcessed: args.knowledge ? true : false,
			conceptId: args.conceptId,
			extractedKnowledge: args.knowledge,
			isUpdated: args.knowledge ? true : false,
			quotes: args.quotes
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

		const blocksDictionary: Record<string, [Block, Id<"documents">, Array<string>]> = await ctx.runAction(api.documents.getBlocksContainsConcept, {conceptId: args.conceptId});

		console.log("addAllKD - collectBlocks: ", blocksDictionary);

		let finalAliasList: Set<string> = new Set([...concept.aliasList]);

		for (const [blockId, [block, documentId, aliasList]] of Object.entries(blocksDictionary)) {

			await ctx.runAction(api.knowledgeDatas.addKD, {conceptId: args.conceptId, sourceId: documentId, blockId: blockId, sourceType: "document"});
			
			// update concept with aliasList appending to existing aliasList
			for (const alias of aliasList) {	
				finalAliasList.add(alias);
			}
		}

		await ctx.runMutation(api.concepts.updateConceptMutation, {
			conceptId: args.conceptId,
			aliasList: Array.from(finalAliasList)
		});

		return;
	}
});

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

		// remove vector embedding for the knowledge data
		await ctx.runAction(api.vectorEmbed.deleteVectorEmbeddingforKnowledgeData, {
			knowledgeDataId: args.knowledgeId
		});

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

export const updateKD = action({
	args: {
		knowledgeId: v.id("knowledgeDatas"),
		knowledge: v.optional(v.string()),
		isProcessed: v.optional(v.boolean()),
		isUpdated: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		await ctx.runMutation(api.knowledgeDatas.updateKDMutation, {
			knowledgeId: args.knowledgeId,
			knowledge: args.knowledge,
			isProcessed: args.isProcessed,
			isUpdated: args.isUpdated
		});

		if (args.knowledge) {
			await ctx.runAction(api.vectorEmbed.updateVectorEmbeddingforKnowledgeData, {
				knowledgeDataId: args.knowledgeId
			});
		}
	}
});
//fetchKD is at llm
export const updateKDMutation = mutation({
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


export const getConceptKDbySource = query({
	args: {
		sourceType: v.string(),
		sourceId: v.string(),
		blockId: v.optional(v.string()),
		conceptId: v.optional(v.id("concepts"))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		if (args.conceptId) {
			const KDs = await ctx.db.query("knowledgeDatas")
		.withIndex("by_source_section", (q) =>
			q
				.eq("userId", userId)
				.eq("sourceType", args.sourceType)
				.eq("sourceId", args.sourceId)
				.eq("sourceSection", args.blockId)
				.eq("conceptId", args.conceptId!)
			)
			.collect();

			return KDs;
		} else {
			const KDs = await ctx.db.query("knowledgeDatas")
			.withIndex("by_source_section", (q) =>
				q
					.eq("userId", userId)
					.eq("sourceType", args.sourceType)
					.eq("sourceId", args.sourceId)
					.eq("sourceSection", args.blockId)
			)
			.collect();

			return KDs;
		}
	}
});

export const removeConceptKDbySource = action({
	args: {
		sourceType: v.string(),
		sourceId: v.string(),
		blockId: v.optional(v.string()),
		conceptId: v.optional(v.id("concepts"))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const KDs = await ctx.runQuery(api.knowledgeDatas.getConceptKDbySource, {
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			blockId: args.blockId,
			conceptId: args.conceptId
		});
		

		for (const kd of KDs) {
			await ctx.runAction(api.knowledgeDatas.removeKD, {knowledgeId: kd._id});
		}
	}
});