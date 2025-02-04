/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {mutation, query} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";

export const create = mutation({
	args: {
		alias: v.array(v.string()),
		rootDocument: v.optional(v.id("documents")),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const document = await ctx.db.insert("concepts", {
			userId: userId,
			aliasList: args.alias,
			objectTags: args.objectTags,
			description: args.description,
			IsSynced: true,
			rootDocument: args.rootDocument,
		});

		syncConcept(args: {conceptId: document._id});


		return document;

	}
});

export const syncConcept = mutation({
	args: {
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		
	}
});