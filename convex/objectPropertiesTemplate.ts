import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import {Doc, Id} from "./_generated/dataModel";
import { api } from "../convex/_generated/api";

export const create = mutation({
	args: {
		objectTemplateId: v.id("objectTemplates"),
		propertyName: v.string(),
		type: v.string(),
		autosync: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const objectPropertiesTemplate = await ctx.db.insert("objectPropertiesTemplates", {
			userId: userId,
			objectTemplateId: args.objectTemplateId,
			propertyName: args.propertyName,
			type: args.type,
			autosync: args.autosync || true,
		});

		return objectPropertiesTemplate;
		
	}
});

export const removeObjectPropertiesTemplate = action({
	args: {
		objectPropertiesTemplateId: v.id("objectPropertiesTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const properties = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesByPropertyTemplateId, {
			propertyTemplateId: args.objectPropertiesTemplateId
		});

		// for each property, delete the property
		for (const property of properties) {
			await ctx.runMutation(api.objectTagProperties.deleteObjectTagProperty, {
				propertyId: property._id
			});
		}

		await ctx.runMutation(api.objectPropertiesTemplate.deleteObjectPropertiesTemplate, {
			objectPropertiesTemplateId: args.objectPropertiesTemplateId
		});

		return true;
	}
});

export const deleteObjectPropertiesTemplate = mutation({
	args: {
		objectPropertiesTemplateId: v.id("objectPropertiesTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectPropertiesTemplate = await ctx.db.get(args.objectPropertiesTemplateId);
		if (!objectPropertiesTemplate) throw new Error("Object properties template not existed");

		await ctx.db.delete(args.objectPropertiesTemplateId);
	}
});

export const addObjectPropertiesTemplate = action({
	args: {
		objectTemplateId: v.id("objectTemplates"),
		propertyName: v.string(),
		type: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const objectPropertiesTemplate: Id<"objectPropertiesTemplates"> = await ctx.runMutation(api.objectPropertiesTemplate.create, {
			objectTemplateId: args.objectTemplateId,
			propertyName: args.propertyName,
			type: args.type,
		});

		// for each object tag, add the property to the object tag
		const objectTags = await ctx.runQuery(api.objectTags.getObjectTagsByTemplateId, {
			templateId: args.objectTemplateId,
		});

		for (const objectTag of objectTags) {
			await ctx.runMutation(api.objectTagProperties.createObjectTagProperty, {
				objectTagId: objectTag._id,
				conceptId: objectTag.conceptId,
				propertyName: args.propertyName,
				objectPropertiesTemplateId: objectPropertiesTemplate,
				type: args.type,
			});
		}
		return objectPropertiesTemplate;
	}
});

export const getObjectPropertiesTemplateById = query({
	args: {
		objectPropertiesTemplateId: v.id("objectPropertiesTemplates"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const objectPropertiesTemplate = await ctx.db.get(args.objectPropertiesTemplateId);

		if (!objectPropertiesTemplate) throw new Error("Object properties template not existed");

		if (objectPropertiesTemplate.userId !== userId) throw new Error("Permission denied");

		return objectPropertiesTemplate;
	}
});

export const getObjectPropertiesTemplateByObjectTemplateId = query({
	args: {
		objectTemplateId: v.id("objectTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const objectPropertiesTemplate = await ctx.db.query("objectPropertiesTemplates")
		.withIndex("by_object_template", (q) =>
			q.eq("userId", userId)
			.eq("objectTemplateId", args.objectTemplateId)
		)
		.collect();

		return objectPropertiesTemplate;
	}
});

export const updateObjectPropertiesTemplate = action({
	args: {
		objectPropertiesTemplateId: v.id("objectPropertiesTemplates"),
		propertyName: v.string(),
		type: v.string(),
		autosync: v.optional(v.boolean()),
		prompt: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const userId = identity.subject;

		const objectPropertiesTemplate = await ctx.runQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateById, {
			objectPropertiesTemplateId: args.objectPropertiesTemplateId,
		});

		if (!objectPropertiesTemplate) throw new Error("Object properties template not existed");

		if (objectPropertiesTemplate.userId !== userId) throw new Error("Permission denied");

		await ctx.runMutation(api.objectPropertiesTemplate.updateObjectPropertiesTemplateMutation, {
			objectPropertiesTemplateId: args.objectPropertiesTemplateId,
			propertyName: args.propertyName,
			type: args.type,
			autosync: args.autosync,
			prompt: args.prompt || "",
		});

		console.log("Successfully updated object properties template", args);

		// update the object tag properties
		// get all object tag properties by object tag id
		// update only if the property name is changed
		if (args.propertyName !== objectPropertiesTemplate.propertyName) {
			const objectTagProperties = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesByPropertyTemplateId, {
				propertyTemplateId: objectPropertiesTemplate._id,
			});

		for (const objectTagProperty of objectTagProperties) {
			await ctx.runMutation(api.objectTagProperties.updateObjectTagProperty, {
				propertyId: objectTagProperty._id,
				propertyName: args.propertyName,
				type: args.type,
				});
			}
		}
	}
});

export const updateObjectPropertiesTemplateMutation = mutation({
	args: {
		objectPropertiesTemplateId: v.id("objectPropertiesTemplates"),
		propertyName: v.string(),
		type: v.string(),
		autosync: v.optional(v.boolean()),
		prompt: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectPropertiesTemplate = await ctx.db.get(args.objectPropertiesTemplateId);
		if (!objectPropertiesTemplate) throw new Error("Object properties template not existed");

		if (objectPropertiesTemplate.userId !== identity.subject) throw new Error("Permission denied");
		
		await ctx.db.patch(args.objectPropertiesTemplateId, {
			propertyName: args.propertyName,
			type: args.type,
			autosync: args.autosync,
			prompt: args.prompt || "",
		});
	}
});
