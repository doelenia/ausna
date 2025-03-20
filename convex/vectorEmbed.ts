import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import OpenAI from "openai";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import {Doc, Id} from "./_generated/dataModel";
import { api } from "../convex/_generated/api";
import { FilterExpression } from "convex/server";

export const createVectorEmbedding = mutation({
	args: {
		embedding: v.array(v.number()),
		sourceId: v.string(),
		type: v.string(),
		contextId: v.optional(v.string()),
		fileId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const vectorEmbeddingId = await ctx.db.insert("vectorEmbeddings", {
			userId,
			embedding: args.embedding,
			sourceId: args.sourceId,
			type: args.type,
			contextId: args.contextId,
			fileId: args.fileId,
		});

		return vectorEmbeddingId;
	}
});

export const deleteVectorEmbedding = mutation({
	args: {
		sourceId: v.string(),
		type: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const vectorEmbeddings = await ctx.db.query("vectorEmbeddings")
		.withIndex("by_source_id", (q) =>
			q.eq("type", args.type)
			.eq("sourceId", args.sourceId)
		).collect();

		if (vectorEmbeddings.length === 0) throw new Error("Vector embedding not found");
		
		await Promise.all(vectorEmbeddings.map((vectorEmbedding) => ctx.db.delete(vectorEmbedding._id)));

		return true;
	}
});

export const getVectorEmbeddingBySourceId = query({
	args: {
		sourceId: v.string(),
		type: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const vectorEmbeddings = await ctx.db.query("vectorEmbeddings")
		.withIndex("by_source_id", (q) =>
			q.eq("type", args.type)
			.eq("sourceId", args.sourceId)
		).collect();

		if (vectorEmbeddings.length === 0) throw new Error("Vector embedding not found");
		
		return vectorEmbeddings;
	}
});

export const getVectorEmbeddingById = query({
	args: {
		vectorEmbeddingId: v.id("vectorEmbeddings"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const vectorEmbedding = await ctx.db.get(args.vectorEmbeddingId);

		if (!vectorEmbedding) throw new Error("Vector embedding not found");
		return vectorEmbedding;
	}
});

export const addVectorEmbedding = action({
	args: {
		text: v.string(),
		sourceId: v.string(),
		type: v.string(),
		contextId: v.optional(v.string()),
		fileId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Id<"vectorEmbeddings">[]> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;
		
		const embeddings = await embedTexts([args.text]);

		// create vector embeddings for each embedding, return ids as a list
		const vectorEmbeddingIds: Id<"vectorEmbeddings">[] = [];
		for (const embedding of embeddings) {
			const vectorEmbeddingId = await ctx.runMutation(api.vectorEmbed.createVectorEmbedding, {
				embedding,
				sourceId: args.sourceId,
				type: args.type,
				contextId: args.contextId,
				fileId: args.fileId,
			});
			vectorEmbeddingIds.push(vectorEmbeddingId);
		}
		return vectorEmbeddingIds;
	}
});

// CONCEPT FUNCTIONS

export const addVectorEmbeddingsforConcept = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: args.conceptId,
		});

		if (!concept) throw new Error("Concept not found");

		let vectorEmbeddingIds: Id<"vectorEmbeddings">[] = [];

		// add vector embedding for concept alias
		for (const alias of concept.aliasList) {
			const Ids = await ctx.runAction(api.vectorEmbed.addVectorEmbedding, {
				text: alias,
				sourceId: concept._id,
				type: "concept_alias",
			});
			vectorEmbeddingIds = vectorEmbeddingIds.concat(Ids);
		}

		// add vector embedding for concept description
		const Ids = await ctx.runAction(api.vectorEmbed.addVectorEmbedding, {
			text: concept.description || "",
			sourceId: concept._id,
			type: "concept_description",
		});
		vectorEmbeddingIds = vectorEmbeddingIds.concat(Ids);

		return vectorEmbeddingIds;
	}
});

export const deleteVectorEmbeddingsforConcept = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: args.conceptId,
		});

		if (!concept) throw new Error("Concept not found");

		// delete vector embeddings for concept alias
		await ctx.runMutation(api.vectorEmbed.deleteVectorEmbedding, {
			sourceId: concept._id,
			type: "concept_alias",
		});

		// delete vector embeddings for concept description
		await ctx.runMutation(api.vectorEmbed.deleteVectorEmbedding, {
			sourceId: concept._id,
			type: "concept_description",
		});

		return true;
	}	
});

export const updateVectorEmbeddingforConceptAlias = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: args.conceptId,
		});

		if (!concept) throw new Error("Concept not found");

		// delete existing vector embeddings for concept alias
		await ctx.runMutation(api.vectorEmbed.deleteVectorEmbedding, {
			sourceId: args.conceptId,
			type: "concept_alias",
		});

		// add new vector embedding for concept alias

		let vectorEmbeddingIds: Id<"vectorEmbeddings">[] = [];

		// add vector embedding for concept alias
		for (const alias of concept.aliasList) {
			const Ids = await ctx.runAction(api.vectorEmbed.addVectorEmbedding, {
				text: alias,
				sourceId: concept._id,
				type: "concept_alias",
			});
			vectorEmbeddingIds = vectorEmbeddingIds.concat(Ids);
		}

		return vectorEmbeddingIds;
	}
});

export const updateVectorEmbeddingforConceptDescription = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: args.conceptId,
		});

		if (!concept) throw new Error("Concept not found");

		// delete existing vector embeddings for concept description
		await ctx.runMutation(api.vectorEmbed.deleteVectorEmbedding, {
			sourceId: args.conceptId,
			type: "concept_description",
		});	

		// add new vector embedding for concept description
		const Ids: Id<"vectorEmbeddings">[] = await ctx.runAction(api.vectorEmbed.addVectorEmbedding, {
			text: concept.description || "",
			sourceId: concept._id,
			type: "concept_description",
		});

		return Ids;
	}
});

export const searchSimilarConcepts = action({
	args: {
		name: v.string(),
		description: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const concepts_with_similar_name = await ctx.runAction(api.vectorEmbed.vectorEmbedSearch, {
			text: args.name,
			type: "concept_alias",
			limit: args.limit,
		});

		const concepts_with_similar_description = await ctx.runAction(api.vectorEmbed.vectorEmbedSearch, {
			text: args.description,
			type: "concept_description",
			limit: args.limit,
		});

		// remove duplicates
		const similar_concepts: {
			_id: Id<"vectorEmbeddings">;
			_score: number;
	}[] = Array.from(new Set([...concepts_with_similar_name, ...concepts_with_similar_description]));

		//rank by score
		similar_concepts.sort((a, b) => b._score - a._score);

		// return the top limit concepts ids
		const top_vector_embeddings = similar_concepts.slice(0, args.limit).map((concept) => concept._id);

		// for each vector embedding id, get the vector embedding doc and get the conceptId from its sourceId
		const conceptIds: Id<"concepts">[] = await Promise.all(top_vector_embeddings.map(async (id) => {
			const vectorEmbedding: Doc<"vectorEmbeddings"> | undefined = await ctx.runQuery(api.vectorEmbed.getVectorEmbeddingById, {
				vectorEmbeddingId: id,
			});
			return vectorEmbedding!.sourceId as Id<"concepts">;
		}));

		return conceptIds;
	}
});

// KNOWLEDGEDATAS FUNCTIONS

export const addVectorEmbeddingforKnowledgeData = action({
	args: {
		knowledgeDataId: v.id("knowledgeDatas"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const knowledgeData = await ctx.runQuery(api.knowledgeDatas.getKDById, {
			knowledgeId: args.knowledgeDataId,
		});

		if (!knowledgeData) throw new Error("Knowledge data not found");

		// add vector embedding for knowledge data description
		const Ids: Id<"vectorEmbeddings">[] = await ctx.runAction(api.vectorEmbed.addVectorEmbedding, {
			text: knowledgeData.knowledge || "",
			sourceId: knowledgeData._id,
			type: "knowledge_data",
			contextId: knowledgeData.conceptId,
			fileId: knowledgeData.sourceFile,
		});

		return Ids;
	}
});

export const deleteVectorEmbeddingforKnowledgeData = action({
	args: {
		knowledgeDataId: v.id("knowledgeDatas"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const knowledgeData = await ctx.runQuery(api.knowledgeDatas.getKDById, {
			knowledgeId: args.knowledgeDataId,	
		});

		if (!knowledgeData) throw new Error("Knowledge data not found");

		// delete vector embeddings for knowledge data description
		await ctx.runMutation(api.vectorEmbed.deleteVectorEmbedding, {
			sourceId: knowledgeData._id,
			type: "knowledge_data",
		});

		return true;
	}
});

export const updateVectorEmbeddingforKnowledgeData = action({
	args: {
		knowledgeDataId: v.id("knowledgeDatas"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		// delete existing vector embeddings for knowledge data description
		await ctx.runAction(api.vectorEmbed.deleteVectorEmbeddingforKnowledgeData, {
			knowledgeDataId: args.knowledgeDataId,
		});
		
		// add new vector embedding for knowledge data description
		const Ids: Id<"vectorEmbeddings">[] = await ctx.runAction(api.vectorEmbed.addVectorEmbeddingforKnowledgeData, {
			knowledgeDataId: args.knowledgeDataId,
		});

		return Ids;
	}
});


export async function embedTexts(texts: string[]) {
	if (texts.length === 0) return [];
	const openai = new OpenAI();
	const { data } = await openai.embeddings.create({
		input: texts,
		model: "text-embedding-ada-002",
	});
	return data.map(({ embedding }) => embedding);
}

export const vectorEmbedSearch = action({
	args: {
		text: v.string(),
		type: v.string(),
		contextId: v.optional(v.string()),
		fileId: v.optional(v.string()),
		sourceIds: v.optional(v.array(v.string())),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const [textEmbedding] = await embedTexts([args.text]);

		let vectorEmbeddings: { _id: Id<"vectorEmbeddings">; _score: number; }[] = [];

		if (args.contextId) {
			vectorEmbeddings = await ctx.vectorSearch("vectorEmbeddings", "vector_embeddings", {
				vector: textEmbedding,
				limit: args.limit || 10,
				filter: (q) => q.or(q.eq("contextId", args.contextId))
			});
		} else if (args.fileId) {
			vectorEmbeddings = await ctx.vectorSearch("vectorEmbeddings", "vector_embeddings", {
				vector: textEmbedding,
				limit: args.limit || 10,
				filter: (q) => q.eq("fileId", args.fileId)
			});
		} else if (args.sourceIds && args.sourceIds.length > 0 && args.sourceIds !== undefined) {
			vectorEmbeddings = await ctx.vectorSearch("vectorEmbeddings", "vector_embeddings", {
				vector: textEmbedding,
				limit: args.sourceIds.length,
				filter: (q) => q.or(args.sourceIds!.map((sourceId) => q.eq("sourceId", sourceId)) as unknown as FilterExpression<boolean>)
			});
		} else {
			vectorEmbeddings = await ctx.vectorSearch("vectorEmbeddings", "vector_embeddings", {
				vector: textEmbedding,
				limit: args.limit || 10,
				filter: (q) => q.eq("type", args.type)
			});
		}

		const vectorEmbeddingIds = vectorEmbeddings.map((vectorEmbedding) => vectorEmbedding._id);

		return vectorEmbeddings;
	}
});

