/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {mutation, query} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";

// Helper function to get object templates for a concept
export const getObjectTemplates = query({
	args: { conceptId: v.id("concepts") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const templates = await ctx.db
			.query("objectTemplates")
			.withIndex("by_concept", (q) => q.eq("userId", identity.subject).eq("conceptId", args.conceptId))
			.collect();
		return templates;
	}
});

export const getObjectTemplateById = query({
	args: { templateId: v.id("objectTemplates") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");
		
		const template = await ctx.db.get(args.templateId);
		
		if (!template) throw new Error("Template not found");
		return template;
	}
});

// Helper function to create a new object template
export const createObjectTemplate = mutation({
	args: {
		conceptId: v.id("concepts"),
		templateName: v.string(),
		description: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const templateId = await ctx.db.insert("objectTemplates", {
			userId: identity.subject,
			conceptId: args.conceptId,
			templateName: args.templateName,
			description: args.description,
			propsList: []
		});

		return templateId;
	}
});