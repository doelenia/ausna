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
		});

		return objectPropertiesTemplate;
		
	}
})

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
})