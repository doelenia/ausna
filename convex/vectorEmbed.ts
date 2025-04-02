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

		if (vectorEmbeddings.length === 0) {
			console.log("vectorEmbeddings not found");
			return true;
		}
		
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

		if (args.text.length === 0) {
			console.log("text is empty");
			return [];
		}
		
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

		console.log("finished adding vector embeddings for concept alias");

		// add vector embedding for concept description
		const Ids = await ctx.runAction(api.vectorEmbed.addVectorEmbedding, {
			text: concept.description || "",
			sourceId: concept._id,
			type: "concept_description",
		});
		vectorEmbeddingIds = vectorEmbeddingIds.concat(Ids);

		console.log("finished adding vector embeddings for concept description");

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
		scoreThreshold: v.optional(v.number()),
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
		let similar_concepts: {
			_id: Id<"vectorEmbeddings">;
			_score: number;
	}[] = Array.from(new Set([...concepts_with_similar_name, ...concepts_with_similar_description]));

		//rank by score
		similar_concepts.sort((a, b) => b._score - a._score);

		// filter by score threshold if provided
		if (args.scoreThreshold) {
			similar_concepts = similar_concepts.filter((concept) => concept._score >= args.scoreThreshold!);
		}

		// return the top limit concepts ids
		const top_vector_embeddings = similar_concepts.slice(0, args.limit).map((concept) => concept._id);

		// for each vector embedding id, get the vector embedding doc and get the conceptId from its sourceId
		const conceptIds: Id<"concepts">[] = await Promise.all(top_vector_embeddings.map(async (id) => {
			const vectorEmbedding: Doc<"vectorEmbeddings"> | undefined = await ctx.runQuery(api.vectorEmbed.getVectorEmbeddingById, {
				vectorEmbeddingId: id,
			});
			return vectorEmbedding!.sourceId as Id<"concepts">;
		}));

		// remove duplicates
		let uniqueConceptIds = Array.from(new Set(conceptIds));

		return uniqueConceptIds;
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
			text: knowledgeData.extractedKnowledge || "",
			sourceId: knowledgeData._id,
			type: "knowledge_data",
			contextId: knowledgeData.conceptId,
			fileId: knowledgeData.sourceId
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

export const searchSimilarKnowledgeData = action({
	args: {
		query: v.string(),
		conceptId: v.optional(v.id("concepts")),
		sourceIds: v.optional(v.array(v.string())),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const vectorEmbeddingIds = await ctx.runAction(api.vectorEmbed.vectorEmbedSearch, {
			text: args.query,
			type: "knowledge_data",
			contextId: args.conceptId,
			sourceIds: args.sourceIds,
			limit: args.limit,
		});

		// for each vector embedding id, get the vector embedding doc and get the knowledgeDataId from its sourceId
		const knowledgeDataIds: Id<"knowledgeDatas">[] = await Promise.all(vectorEmbeddingIds.map(async (result) => {
			const vectorEmbedding: Doc<"vectorEmbeddings"> | undefined = await ctx.runQuery(api.vectorEmbed.getVectorEmbeddingById, {
				vectorEmbeddingId: result._id,
			});
			return vectorEmbedding!.sourceId as Id<"knowledgeDatas">;
		}));

		return knowledgeDataIds;
	}
});

export const searchSimilarKnowledgeDatawithScore = action({
	args: {
		query: v.string(),
		conceptId: v.optional(v.id("concepts")),
		sourceIds: v.optional(v.array(v.string())),
		scoreThreshold: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		let vectorEmbeddingIds = await ctx.runAction(api.vectorEmbed.vectorEmbedSearch, {
			text: args.query,
			type: "knowledge_data",
			contextId: args.conceptId,
			sourceIds: args.sourceIds,
			limit: args.limit,
		});

		// filter by score threshold if provided
		if (args.scoreThreshold) {
			vectorEmbeddingIds = vectorEmbeddingIds.filter((result) => result._score >= args.scoreThreshold!);
		}

		// for each vector embedding id, get the vector embedding doc and get the knowledgeDataId from its sourceId
		const knowledgeDataIds: {
			_id: Id<"knowledgeDatas">;
			_score: number;
		}[] = await Promise.all(vectorEmbeddingIds.map(async (result) => {
			const vectorEmbedding: Doc<"vectorEmbeddings"> | undefined = await ctx.runQuery(api.vectorEmbed.getVectorEmbeddingById, {
				vectorEmbeddingId: result._id,
			});
			return {
				_id: vectorEmbedding!.sourceId as Id<"knowledgeDatas">,
				_score: result._score,
			};
		}));

		return knowledgeDataIds;
	}
});

export async function embedTexts(texts: string[]) {
	if (texts.length === 0) return [];
	const openai = new OpenAI({
		apiKey:"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",
	});
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

		// check if the text is empty
		if (args.text.length === 0) {
			console.log("text is empty");
			return [];
		}

		// trim the text for newlines and spaces and non-alphabetic or numeric characters
		const trimmedText = args.text.trim().replace(/[^a-zA-Z0-9\s]/g, '');

		const [textEmbedding] = await embedTexts([trimmedText]);

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

export const vectorSearchRelevantKnowledgeData = action({
	args: {
		query: v.string(),
		conceptId: v.optional(v.id("concepts")),
		conceptName: v.string(),
		conceptDescription: v.string(),
		contextQuery: v.optional(v.string()),
		contextSourceIds: v.optional(v.array(v.object({
			sourceId: v.string(),
			score: v.number(),
		})))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		// 1. get similar concepts by conceptId

		const similarConcepts = await ctx.runAction(api.vectorEmbed.searchSimilarConcepts, {
			name: args.conceptName,
			description: args.conceptDescription,
			scoreThreshold: 0.5,
			limit: 5,
		});

		const similarConceptsWithContext = await ctx.runAction(api.vectorEmbed.searchSimilarConcepts, {
			name: args.conceptName,
			description: args.conceptDescription + " " + args.contextQuery,
			scoreThreshold: 0.5,
			limit: 5,
		});


		// combine similar concepts and similar concepts with context
		let combinedConcepts = Array.from(new Set([...similarConcepts, ...similarConceptsWithContext]));

		// add conceptId to combined concepts if it exists
		if (args.conceptId) {
			combinedConcepts = Array.from(new Set([...combinedConcepts, args.conceptId]));
		}

		// 2. for each concept, get relevant knowledge data

		let weightedrelevantKnowledgeDatawithScore: {
			_id: Id<"knowledgeDatas">;
			_score: number;
		}[] = [];

		await Promise.all(combinedConcepts.map(async (conceptId) => {
			const knowledgeDataIds = await ctx.runAction(api.vectorEmbed.searchSimilarKnowledgeDatawithScore, {
				query: args.query,
				conceptId: conceptId,
				limit: 10,
			});
			// for each knowledgeDataId, get the knowledge data and check if its sourceId is in the contextSourceIds, if it is, add them to weightedrelevantKnowledgeDatawithScore with original score + 0.5 * score from contextSourceIds, if not, add them with original score.
			for (const knowledgeDataId of knowledgeDataIds) {
				const knowledgeData = await ctx.runQuery(api.knowledgeDatas.getKDById, {
					knowledgeId: knowledgeDataId._id,
				});
				if (args.contextSourceIds && args.contextSourceIds.length > 0 && args.contextSourceIds !== undefined) {
					const contextSourceId = args.contextSourceIds.find((sourceId) => sourceId.sourceId === knowledgeData.sourceId);
					if (contextSourceId) {
						weightedrelevantKnowledgeDatawithScore.push({
							_id: knowledgeDataId._id,
							_score: knowledgeDataId._score + 0.5 * contextSourceId.score,
						});
					} else {
						weightedrelevantKnowledgeDatawithScore.push({
							_id: knowledgeDataId._id,
							_score: knowledgeDataId._score,
						});
					}
				}
			}
		}));

		// sort weightedrelevantKnowledgeDatawithScore by score descending
		weightedrelevantKnowledgeDatawithScore.sort((a, b) => b._score - a._score);

		// remove duplicates
		const uniqueKnowledgeDataIds = Array.from(new Set(weightedrelevantKnowledgeDatawithScore.map((knowledgeData) => knowledgeData._id)));

		// return the top 5 knowledge data ids
		return uniqueKnowledgeDataIds.slice(0, 10);
	}
});

export const vectorSearchRelevantSources = action({
	args: {
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		// 1. get relevant knowledge data
		const relevantKnowledgeData = await ctx.runAction(api.vectorEmbed.searchSimilarKnowledgeDatawithScore, {
			query: args.query,
			limit: args.limit || 50,
		});

		// 2. get the sourceIds from the relevant knowledge data, record the sourceId and the score of the knowledge data
		const sourceIdsWithScore: {
			sourceId: string;
			score: number;
		}[] = [];
		for (const knowledgeDataId of relevantKnowledgeData) {
			const knowledgeData = await ctx.runQuery(api.knowledgeDatas.getKDById, {
				knowledgeId: knowledgeDataId._id,
			});
			sourceIdsWithScore.push({
				sourceId: knowledgeData.sourceId,
				score: knowledgeDataId._score,
			});
		}

		// 3. group by sourceId and take max score
		const groupedSourceIdsWithScore = sourceIdsWithScore.reduce((acc, curr) => {
			acc[curr.sourceId] = Math.max(acc[curr.sourceId] || 0, curr.score);
			return acc;
		}, {} as Record<string, number>);

		// 4. sort by score descending
		const sortedSourceIdsWithScore = Object.entries(groupedSourceIdsWithScore).sort((a, b) => b[1] - a[1]);

		// 5. return the top 10 sourceIds with score or the limit if provided in the format of {sourceId: string, score: number}
		return sortedSourceIdsWithScore.slice(0, args.limit || 10).map(([sourceId, score]) => ({
			sourceId: sourceId,
			score: score,
		}));
	}
});