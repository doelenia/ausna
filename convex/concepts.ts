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
		sourceId: v.optional(v.id("documents")),
		blockId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}



		const conceptId: Id<"concepts"> = await ctx.runMutation(api.concepts.createConcept, {
			alias: args.alias,
			objectTags: args.objectTags,
			description: args.description,
			isSynced: args.isSynced
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

		await ctx.runMutation(api.concepts.updateConcept, {conceptId: conceptId, rootDocument: args.rootDocument});

		await ctx.runAction(api.knowledgeDatas.addAllKD, {conceptId: conceptId});

		console.log("addConcept: ", args);

		if (args.sourceId) {
			await ctx.runAction(api.knowledgeDatas.addKD, {
				conceptId: conceptId,
				sourceId: args.sourceId,
				blockId: args.blockId,
			});
		}

		await ctx.runAction(api.concepts.syncConcept, {conceptId: conceptId});

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
			objectTags: args.objectTags,
			description: args.description,
			IsSynced: args.isSynced,
			rootDocument: args.rootDocument,
		});


		return concept;

	}
});

export const syncConcept = action({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});

		if (!concept) {
			throw new Error("Concept not found");
		}

		if (concept.userId !== identity.subject) {
			throw new Error("Unauthorized");
		}

		if (concept.IsSynced == true) {
			return;
		}

		// TODO: SYNC CONCEPT SUMMARY
		await ctx.runAction(api.objectTags.syncObjectTag, {conceptId: args.conceptId});
		// TODO: SYNC CONCEPT RELATIONSHIP

		// get all knowledge data of this concept
		const knowledgeDatas = await ctx.runQuery(api.knowledgeDatas.getKDsofConcept, {conceptId: args.conceptId});

		if (knowledgeDatas.length <= 0) {
			await ctx.runMutation(api.concepts.deleteConcept, {conceptId: args.conceptId});

			return;
		}

		await ctx.runMutation(api.concepts.updateConcept, {conceptId: args.conceptId, IsSynced: true});

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

export const updateConcept = mutation({
	args: {
		conceptId: v.id("concepts"),
		aliasList: v.optional(v.array(v.string())),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
		IsSynced: v.optional(v.boolean()),
		rootDocument: v.optional(v.id("documents")),
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