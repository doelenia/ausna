import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import {api} from "../convex/_generated/api";

export const createObjectTagProperty = mutation({
	
	args: {
		objectTagId: v.id("objectTags"),
		conceptId: v.id("concepts"),
		propertyName: v.string(),
		value: v.optional(v.any()),
		type: v.string(),
		objectPropertiesTemplateId: v.optional(v.id("objectPropertiesTemplates")),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas")))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTag = await ctx.db.get(args.objectTagId);
		if (!objectTag) throw new Error("Object tag not found");

		if (objectTag.userId !== identity.subject) throw new Error("Unauthorized");

		const propertyId = await ctx.db.insert("objectTagProperties", {
			userId: identity.subject,
			conceptId: args.conceptId,
			objectTagId: args.objectTagId,
			propertyName: args.propertyName,
			value: args.value,
			type: args.type,
			sourceKDs: args.sourceKDs,
			objectPropertiesTemplateId: args.objectPropertiesTemplateId,
			autosync: "default"
		});

		return propertyId;
	}
});

export const getById = query({
	args: {
		propertyId: v.id("objectTagProperties")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const property = await ctx.db.get(args.propertyId);
		if (!property) throw new Error("Property not found");
		
		return property;
	}
});

export const deleteObjectTagProperty = mutation({
	args: {
		propertyId: v.id("objectTagProperties")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const property = await ctx.db.get(args.propertyId);
		if (!property) throw new Error("Property not found");

		if (property.userId !== identity.subject) throw new Error("Unauthorized");

		await ctx.db.delete(args.propertyId);

		return true;
	}
});

export const getObjectTagPropertiesContainingKD = query({
	args: {
		knowledgeId: v.id("knowledgeDatas")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const properties = await ctx.db
			.query("objectTagProperties")
			.withSearchIndex("search_source_kd", (q) => 
				q.search("sourceKDsString", args.knowledgeId.toString())
					.eq("userId", identity.subject)
			)
			.collect();

		return properties;
	}
});

export const getObjectTagPropertiesByObjectTagId = query({
	args: {
		objectTagId: v.id("objectTags"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const properties = await ctx.db.query("objectTagProperties")
		.withIndex("by_object_tag", (q) =>
			q.eq("userId", identity.subject)
			.eq("objectTagId", args.objectTagId)
		)
		.collect();

		return properties;
	}
});

export const syncObjectTagProperties = action({
	args: {
		conceptId: v.id("concepts")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get concept details
		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: args.conceptId
		});
		if (!concept) throw new Error("Concept not found");

		// 1. Get all updated knowledge data
		const updatedKDs = await ctx.runQuery(api.knowledgeDatas.getUpdatedKDbyConceptId, {
			conceptId: args.conceptId
		});

		// 2. Get all properties by concept ID
		const properties = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesByConceptId, {
			conceptId: args.conceptId
		});

		// Process each property
		for (const property of properties) {
			// Get object tag details for this property
			const objectTag = await ctx.runQuery(api.objectTags.getById, {
				objectTagId: property.objectTagId
			});
			if (!objectTag) continue; // Skip if object tag not found

			// call fetchObjectTagPropertiesAdvanced
			await ctx.runAction(api.llm.fetchObjectTagPropertiesAdvanced, {
				propertyId: property._id,
				knowledgeDataIds: updatedKDs.map(kd => kd._id)
			});
		
			
		}

		return true;
	}
});

// Helper mutation to update property
export const updateObjectTagProperty = mutation({
	args: {
		propertyId: v.id("objectTagProperties"),
		value: v.optional(v.any()),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		propertyName: v.optional(v.string()),
		type: v.optional(v.string()),
		autosync: v.optional(v.string()),
		autoFilledValue: v.optional(v.any()),
		prompt: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const property = await ctx.db.get(args.propertyId);
		if (!property) throw new Error("Property not found");
		if (property.userId !== identity.subject) throw new Error("Unauthorized");

		// if there is sourceKDs, then also update sourceKDsString
		if (args.sourceKDs) {
			await ctx.db.patch(args.propertyId, { sourceKDsString: args.sourceKDs.map(kd => kd.toString()).join(", ") });
		}

		const { propertyId, ...updates } = args;

		return await ctx.db.patch(propertyId, updates);
	}
});

export const getObjectTagPropertiesByConceptId = query({
	args: {
		conceptId: v.id("concepts")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const properties = await ctx.db.query("objectTagProperties")
		.withIndex("by_concept", (q) =>
			q.eq("userId", identity.subject)
			.eq("conceptId", args.conceptId)
		)
		.collect();

		return properties;
	}
});

export const getObjectTagPropertiesByTemplateId = query({
	args: {
		templateId: v.id("objectTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// First get all object tags for this template
		const objectTags = await ctx.db
			.query("objectTags")
			.withIndex("by_template_id", (q) =>
				q.eq("userId", identity.subject)
				 .eq("templateID", args.templateId)
			)
			.collect();

		// Then get all properties for these object tags
		const properties = await Promise.all(
			objectTags.map(async (tag) => {
				return ctx.db
					.query("objectTagProperties")
					.withIndex("by_object_tag", (q) =>
						q.eq("userId", identity.subject)
						 .eq("objectTagId", tag._id)
					)
					.collect();
			})
		);

		// Flatten the array of arrays
		return properties.flat();
	}
});

export const getObjectTagPropertiesByPropertyTemplateId = query({
	args: {
		propertyTemplateId: v.id("objectPropertiesTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const properties = await ctx.db.query("objectTagProperties")
		.withIndex("by_object_properties_template", (q) =>
			q.eq("userId", identity.subject)
			.eq("objectPropertiesTemplateId", args.propertyTemplateId)
		)
		.collect();

		return properties;
	}
});

export const syncObjectTagProperty = action({
	args: {
		propertyId: v.id("objectTagProperties")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const property = await ctx.runQuery(api.objectTagProperties.getById, {
			propertyId: args.propertyId
		});
		if (!property) throw new Error("Property not found");

		if (property.userId !== identity.subject) throw new Error("Unauthorized");
		
		// 1. call planObjectTagProperties
		const plan = await ctx.runAction(api.llm.planObjectTagProperties, {
			propertyId: args.propertyId
		});

		// 2. get context by calling vectorSearchRelevantSources
		const context = await ctx.runAction(api.vectorEmbed.vectorSearchRelevantSources, {
			query: plan.context,
		});

		// get concept details
		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: property.conceptId
		});
		if (!concept) throw new Error("Concept not found");

		// 3. call vectorSearchRelevantKnowledgeData
		const relevantKnowledges = await ctx.runAction(api.vectorEmbed.vectorSearchRelevantKnowledgeData, {
			query: plan.context,
			conceptId: property.conceptId,
			conceptName: concept.aliasList[0],
			conceptDescription: concept.description || "",
			contextQuery: plan.context,
			contextSourceIds: context
		});

		// 4. call fetchObjectTagPropertiesAdvanced
		const newValue = await ctx.runAction(api.llm.fetchObjectTagPropertiesAdvanced, {
			propertyId: args.propertyId,
			knowledgeDataIds: relevantKnowledges
		});

		return true;
	}
});