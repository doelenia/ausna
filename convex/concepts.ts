/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {action, mutation, query} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { api } from "../convex/_generated/api";

export const getById = query({
	args: { conceptId: v.id("concepts") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const concept = await ctx.db.get(args.conceptId);

		if (!concept) {
			throw new Error("Concept not found");
		}

		if (concept.userId !== identity.subject) {
			throw new Error("Unauthorized");
		}

		return concept;
	}
});

export const addConcept = action({
	args: {
		alias: v.array(v.string()),
		rootDocument: v.optional(v.id("documents")),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
		isSynced: v.boolean(),
		sourceId: v.optional(v.string()),
		blockId: v.optional(v.string()),
		sourceType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}
		
		// get better name
		const betterName = await ctx.runAction(api.llm.fetchBetterName, {
			aliasList: args.alias
		});

		if (betterName) {
			args.alias = [betterName, ...args.alias.map((alias) => alias.trim())];
		}

		const conceptId: Id<"concepts"> = await ctx.runMutation(api.concepts.createConcept, {
			alias: args.alias,
			objectTags: args.objectTags,
			description: args.description,
			isSynced: args.isSynced,
			hidden: false
		});

		if (!args.rootDocument) {
			// create root document
			const rootDocument: Id<"documents"> = await ctx.runMutation(api.documents.create, {
				title: args.alias[0],
				type: "concept",
				typePropsID: conceptId,
			});
			args.rootDocument = rootDocument;
		}

		await ctx.runAction(api.concepts.updateConcept, {conceptId: conceptId, rootDocument: args.rootDocument});

		await ctx.runAction(api.knowledgeDatas.addAllKD, {conceptId: conceptId});

		console.log("addConcept: ", args);

		if (args.sourceId) {
			await ctx.runAction(api.knowledgeDatas.addKD, {
				conceptId: conceptId,
				sourceId: args.sourceId,
				blockId: args.blockId,
				sourceType: "document"
			});
		}

		console.log("finisged addKD: ", args);

		// add vector embedding for concept description
		await ctx.runAction(api.vectorEmbed.addVectorEmbeddingsforConcept, {
			conceptId: conceptId,
		});

		console.log("finished addVectorEmbeddingsforConcept: ", args);

		return conceptId;
	}
});

export const createConcept = mutation({
	args: {
		alias: v.array(v.string()),
		rootDocument: v.optional(v.id("documents")),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
		isSynced: v.boolean(),
		hidden: v.boolean(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const concept = await ctx.db.insert("concepts", {
			userId: userId,
			aliasList: args.alias,
			aliasString: args.alias.join(" "),
			objectTags: args.objectTags,
			description: args.description,
			IsSynced: args.isSynced,
			rootDocument: args.rootDocument,
			hidden: args.hidden,
		});


		return concept;

	}
});

// Process all knowledges first, and update everything about the concept based on the updated knowledge data
export const syncConcept = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concept = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});
		if (!concept) throw new Error("Concept not found");
		if (concept.userId !== identity.subject) throw new Error("Unauthorized");
		if (concept.IsSynced) return;

		// Get all knowledge data of this concept
		const knowledgeDatas = await ctx.runQuery(api.knowledgeDatas.getKDsofConcept, {
			conceptId: args.conceptId
		});

		// 1. if no knowledge data
		if (knowledgeDatas.length === 0) {
			// if there is objectTags, mark it hidden
			if (concept.objectTags && concept.objectTags.length > 0) {
				await ctx.runAction(api.concepts.updateConcept, {
					conceptId: args.conceptId,
					hidden: true
				});
			} else {
				// await ctx.runAction(api.concepts.removeConcept, {conceptId: args.conceptId});
			}
			return;
		}

		// 2. Process unprocessed knowledge data

		// filter knowledgeDatas by isProcessed = false
		const unprocessedKnowledgeDatas = knowledgeDatas.filter((kd) => !kd.isProcessed);

		// Group unprocessed knowledge data by sourceType, sourceId and sourceSection
		const groupedUnprocessedKnowledgeDatas = unprocessedKnowledgeDatas.reduce((acc, kd) => {
			const key = `${kd.sourceType}<delimiter>${kd.sourceId}<delimiter>${kd.sourceSection}`;
			if (!acc[key]) {
				acc[key] = [];
			}
			acc[key].push(kd);
			return acc;
		}, {} as Record<string, typeof unprocessedKnowledgeDatas>);
		
		console.log("groupedUnprocessedKnowledgeDatas: ", groupedUnprocessedKnowledgeDatas);

		// now process each group of unprocessed knowledge data
		for (const key in groupedUnprocessedKnowledgeDatas) {

			// get block from key split by "-"
			// continue if any of the sourceType, sourceId, sourceSection is undefined
			const [sourceType, sourceId, sourceSection] = key.split("<delimiter>");
			if (!sourceType || !sourceId || !sourceSection) {
				continue;
			}
			if (sourceType === undefined || sourceId === undefined || sourceSection === undefined) {
				continue;
			}

			console.log("sourceId: ", sourceId);
			console.log("sourceSection: ", sourceSection);
			console.log("sourceType: ", sourceType);

			const block = await ctx.runQuery(api.documents.getBlockById, {documentId: sourceId as Id<"documents">, blockId: sourceSection});

			console.log("block: ", block);

			const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {
				block: JSON.stringify(block)
			});
		}
		
		// 3. TODO: Sync concept summary
		
		// 4. Sync object tags
		await ctx.runAction(api.objectTags.syncObjectTag, {conceptId: args.conceptId});
		
		// 5. TODO: Sync concept relationships

		// Mark concept as synced
		await ctx.runAction(api.concepts.updateConcept, {
			conceptId: args.conceptId, 
			IsSynced: true
		});

		// get all updated knowledge data
		const updatedKnowledgeDatas = await ctx.runQuery(api.knowledgeDatas.getUpdatedKDbyConceptId, {
			conceptId: args.conceptId
		});

		// update concept description
		await ctx.runAction(api.llm.fetchConceptDescription, {
			conceptId: args.conceptId
		});

		for (const kd of updatedKnowledgeDatas) {
			if (kd.isUpdated) {
				await ctx.runAction(api.knowledgeDatas.updateKD, {
					knowledgeId: kd._id,
					isUpdated: false
				});
			}
		}
	}
});

export const getAllConcepts = query({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		if (!userId) {
			throw new Error("Unauthorized");
		}

		const concepts = await ctx.db.query("concepts")
		.withIndex("by_user", (q) =>
			q
				.eq("userId", userId)
		)
		.order("desc")
		.collect();

		return concepts;
	}
});

export const updateConcept = action({
	args: {
		conceptId: v.id("concepts"),
		aliasList: v.optional(v.array(v.string())),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
		IsSynced: v.optional(v.boolean()),
		rootDocument: v.optional(v.id("documents")),
		hidden: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		console.log("updateConcept: ", args);

		const concept: Doc<"concepts"> | undefined = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});

		console.log("concept: ", concept);

		if (!concept) throw new Error("Concept not found");
		if (concept.userId !== identity.subject) throw new Error("Unauthorized");

		await ctx.runMutation(api.concepts.updateConceptMutation, {
			conceptId: args.conceptId,
			aliasList: args.aliasList,
			objectTags: args.objectTags,
			description: args.description,
			IsSynced: args.IsSynced,
			rootDocument: args.rootDocument,
			hidden: args.hidden,
		});

		if (args.description) {
			await ctx.runAction(api.vectorEmbed.updateVectorEmbeddingforConceptDescription, {
				conceptId: args.conceptId,
			});
		}

		if (args.aliasList) {
			await ctx.runAction(api.vectorEmbed.updateVectorEmbeddingforConceptAlias, {
				conceptId: args.conceptId,
			});
		}

		return true;
	}
});

export const updateConceptMutation = mutation({
	args: {
		conceptId: v.id("concepts"),
		aliasList: v.optional(v.array(v.string())),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
		IsSynced: v.optional(v.boolean()),
		rootDocument: v.optional(v.id("documents")),
		hidden: v.optional(v.boolean()),
	},

	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const removeUndefined = (obj: Record<string, any>) =>
		Object.fromEntries(Object.entries(obj).filter(([_, value]) => value !== undefined));

		const cleanedargs = removeUndefined(args);

		const { conceptId, ...rest } = cleanedargs;

		// if aliasList is provided, add aliasString to rest
		if (args.aliasList) {
			rest.aliasString = args.aliasList.join(" ");
		}


		const existingConcept = await ctx.db.get(args.conceptId);

		if (!existingConcept) {
			throw new Error("Concept not found");
		}

		if (existingConcept.userId !== userId) {
			throw new Error("Unauthorized");
		}

		const concept = await ctx.db.patch(args.conceptId, {
			...rest,
		});


		return concept;
	}
});

export const removeConcept = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concept = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});
		if (!concept) throw new Error("Concept not found");
		if (concept.userId !== identity.subject) throw new Error("Unauthorized");

		await ctx.runAction(api.vectorEmbed.deleteVectorEmbeddingsforConcept, {conceptId: args.conceptId});

		await ctx.runMutation(api.concepts.deleteConcept, {conceptId: args.conceptId});
		return true;
	}
});

export const deleteConcept = mutation({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const concept = await ctx.db.get(args.conceptId);

		if (!concept) {
			throw new Error("Concept not found");
		}

		if (concept.userId !== userId) {
			throw new Error("Unauthorized");
		}

		await ctx.db.delete(args.conceptId);

		return true;
	}
});

export const getUnsyncedConcepts = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concepts = await ctx.db.query("concepts")
		.withIndex("by_user_isSynced", (q) =>
			q
				.eq("userId", args.userId)
				.eq("IsSynced", false)
		)
		.collect();

		return concepts;
	}
});

export const syncAllConcepts = action({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concepts = await ctx.runQuery(api.concepts.getUnsyncedConcepts, {userId: args.userId});
		for (const concept of concepts) {
			await ctx.runAction(api.concepts.syncConcept, {conceptId: concept._id});
		}
	}
});

export const searchConceptAlias = query({
	args: {
		userId: v.string(),
		query: v.string(),
	},
	handler: async (ctx, args) => {
		const concepts = await ctx.db.query("concepts")
		.withSearchIndex("search_alias", (q) =>
			q
				.search("aliasString", args.query)
				.eq("userId", args.userId)
		)
		.collect();

		return concepts;
	}
});

export const getVisibleConcepts = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		// Get all visible concepts
		const concepts = await ctx.db.query("concepts")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.filter((q) => q.eq(q.field("hidden"), false))
			.collect();

		// Get knowledge data counts for each concept
		const conceptsWithCounts = await Promise.all(
			concepts.map(async (concept) => {
				const kds = await ctx.db.query("knowledgeDatas")
					.withIndex("by_concept", (q) => 
						q.eq("userId", userId)
						 .eq("conceptId", concept._id)
					)
					.collect();

				return {
					...concept,
					kdCount: kds.length
				};
			})
		);

		return conceptsWithCounts;
	}
});

// get all concepts that has a objectTag which objectConceptId is input conceptId
export const getConceptsByObjectConceptId = query({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const objectTags = await ctx.db.query("objectTags")
		.withIndex("by_object_concept_id", (q) =>
			q
				.eq("userId", userId)
				.eq("objectConceptId", args.conceptId)
		)
		.collect();

		const concepts = [];
		for (const objectTag of objectTags) {
			const concept = await ctx.db.get(objectTag.conceptId);
			if (concept) {
				concepts.push(concept);
			}
		}

		return concepts;
	}
});

export const getObjectConceptsByConceptId = query({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		// first get all objectTags of the concept
		const objectTags = await ctx.db.query("objectTags")
		.withIndex("by_concept", (q) =>
			q
				.eq("userId", userId)
				.eq("conceptId", args.conceptId)
		)
		.collect();

		const concepts = [];
		for (const objectTag of objectTags) {
			const concept = await ctx.db.get(objectTag.objectConceptId);
			if (concept) {
				concepts.push(concept);
			}
		}

		return concepts;
	}
});