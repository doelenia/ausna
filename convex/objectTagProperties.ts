import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import {api} from "../convex/_generated/api";

export const createObjectTagProperty = mutation({
	args: {
		objectTagId: v.id("objectTags"),
		conceptId: v.id("concepts"),
		propertyName: v.string(),
		value: v.any(),
		type: v.string(),
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
			sourceKDs: args.sourceKDs
		});

		return propertyId;
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
		objectTag: v.object({
			_id: v.id("objectTags"),
			conceptId: v.id("concepts"),
			objectName: v.string(),
			objectDescription: v.optional(v.string())
		})
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get concept details
		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: args.objectTag.conceptId
		});
		if (!concept) throw new Error("Concept not found");

		// 1. Get all updated knowledge data
		const updatedKDs = await ctx.runQuery(api.knowledgeDatas.getUpdatedKDbyConceptId, {
			conceptId: args.objectTag.conceptId
		});

		// 2. Get all object tag properties
		const properties = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesByObjectTagId, {
			objectTagId: args.objectTag._id
		});

		// Process each property
		for (const property of properties) {
			// For each updated KD
			for (const updatedKD of updatedKDs) {
				// 1. Get knowledge string from all source KDs + current KD
				let knowledgeString = updatedKD.knowledge || "";
				
				if (property.sourceKDs && property.sourceKDs.length > 0) {
					const sourceKDs = await Promise.all(
						property.sourceKDs.map(kdId => 
							ctx.runQuery(api.knowledgeDatas.getKDById, { knowledgeId: kdId })
						)
					);
					
					const sourceKnowledge = sourceKDs
						.filter(kd => kd !== null)
						.map(kd => kd!.knowledge)
						.join(" ");
					
					knowledgeString = `${sourceKnowledge} ${knowledgeString}`;
				}

				// if property.objectPropertiesTemplateId is not null, then use the template name instead of the property name, and use the template type instead of the property type
				let propertyName = property.propertyName || "";
				let type = property.type || "";
				if (property.objectPropertiesTemplateId) {
					const template = await ctx.runQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateById, {
						objectPropertiesTemplateId: property.objectPropertiesTemplateId
					});
					if (!template) throw new Error("Template not found");
					propertyName = template.propertyName;
					type = template.type;
				}
				// 2. Call fetchObjectTagProperties
				const newValue = await ctx.runAction(api.llm.fetchObjectTagProperties, {
					conceptName: concept.aliasList[0],
					conceptDescription: concept.description || "",
					objectTagName: args.objectTag.objectName,
					objectTagDescription: args.objectTag.objectDescription || "",
					propertyName: propertyName,
					type: type,
					knowledgeString: knowledgeString,
					previousValue: property.value?.toString()
				});

				// 3. Handle response
				if (newValue.includes("**suggested same value**")) {
					// Update sourceKDs only
					await ctx.runMutation(api.objectTagProperties.updateObjectTagProperty, {
						propertyId: property._id,
						sourceKDs: [...(property.sourceKDs || []), updatedKD._id]
					});
				} else if (!newValue.includes("**no relevant knowledge found**")) {
					// Update both value and sourceKDs
					await ctx.runMutation(api.objectTagProperties.updateObjectTagProperty, {
						propertyId: property._id,
						value: newValue,
						sourceKDs: [...(property.sourceKDs || []), updatedKD._id]
					});
				}
				// Continue if no relevant knowledge found
			}
		}

		return true;
	}
});

// Helper mutation to update property
export const updateObjectTagProperty = mutation({
	args: {
		propertyId: v.id("objectTagProperties"),
		value: v.optional(v.any()),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas")))
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