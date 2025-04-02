/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {action, mutation, query} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import { api } from "./_generated/api";

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
			propsList: [],
			isInitialized: false
		});

		return templateId;
	}
});

export const addObjectTemplate = action({
	args: {
		conceptId: v.optional(v.id("concepts")),
		templateName: v.string(),
		description: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		if (!args.conceptId) {
			args.conceptId = await ctx.runAction(api.llm.fetchObjectTemplateConcept, {
				objectTemplateDescription: args.description || args.templateName
			});
		}

		const template: Id<"objectTemplates"> = await ctx.runMutation(api.objectTemplates.createObjectTemplate, {
			conceptId: args.conceptId,
			templateName: args.templateName,
			description: args.description
		});

		return template;
	}
});

// Helper function to get all templates with object tag counts
export const getAllTemplatesWithCounts = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const templates = await ctx.db
			.query("objectTemplates")
			.withIndex("by_user", (q) => q.eq("userId", identity.subject))
			.collect();

		// Get counts for each template
		const templateCounts = await Promise.all(
			templates.map(async (template) => {
				const count = await ctx.db
					.query("objectTags")
					.withIndex("by_template_id", (q) => 
						q.eq("userId", identity.subject)
						 .eq("templateID", template._id)
					)
					.collect();

				return {
					...template,
					objectTagCount: count.length
				};
			})
		);

		return templateCounts;
	}
});

// Helper function to update an object template
export const updateObjectTemplate = mutation({
	args: {
		templateId: v.id("objectTemplates"),
		templateName: v.string(),
		description: v.optional(v.string()),
		conceptId: v.optional(v.id("concepts")),
		isInitialized: v.optional(v.boolean()),
		lastSyncedTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const existingTemplate = await ctx.db.get(args.templateId);
		if (!existingTemplate) throw new Error("Template not found");

		// Verify user owns this template
		if (existingTemplate.userId !== identity.subject) {
			throw new Error("Not authorized");
		}

		await ctx.db.patch(args.templateId, {
			templateName: args.templateName,
			...(args.description && { description: args.description }),
			...(args.conceptId && { conceptId: args.conceptId }),
			...(args.isInitialized !== undefined && { isInitialized: args.isInitialized }),
			...(args.lastSyncedTime !== undefined && { lastSyncedTime: args.lastSyncedTime }),
		});
	}
});

// Helper function to create a new concept and object tag
export const createConceptAndObjectTag = action({
	args: {
		templateId: v.id("objectTemplates"),
		objectName: v.string()
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get the template
		const template = await ctx.runQuery(api.objectTemplates.getObjectTemplateById, {
			templateId: args.templateId
		});
		if (!template) throw new Error("Template not found");

		// Create a new concept with the object name as alias
		const conceptId: Id<"concepts"> = await ctx.runAction(api.concepts.addConcept, {
			alias: [args.objectName],
			isSynced: false,
		});

		// Create object tag
		await ctx.runAction(api.objectTags.AddObjectTag, {
			conceptId: conceptId,
			objectConceptId: template.conceptId,
			objectTemplateId: args.templateId,
			parentName: args.objectName
		})

		return true;
	}
});

// Helper function to update an object template's concept
export const updateObjectTemplateConcept = mutation({
	args: {
		templateId: v.id("objectTemplates"),
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const existingTemplate = await ctx.db.get(args.templateId);
		if (!existingTemplate) throw new Error("Template not found");

		// Verify user owns this template
		if (existingTemplate.userId !== identity.subject) {
			throw new Error("Not authorized");
		}

		await ctx.db.patch(args.templateId, {
			conceptId: args.conceptId
		});
	}
});

export const initializeObjectTemplate = mutation({
	args: {
		templateId: v.id("objectTemplates"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const existingTemplate = await ctx.db.get(args.templateId);
		if (!existingTemplate) throw new Error("Template not found");

		// Verify user owns this template
		if (existingTemplate.userId !== identity.subject) {
			throw new Error("Not authorized");
		}
		await ctx.db.patch(args.templateId, {
			isInitialized: true
		});
	}
});

export const getPotentialObjects = action({
	args: {
		templateId: v.id("objectTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get the template
		const template = await ctx.runQuery(api.objectTemplates.getObjectTemplateById, {
			templateId: args.templateId
		});
		if (!template) throw new Error("Template not found");

		// Get all object tags that have this conceptId
		const objectTags = await ctx.runQuery(api.objectTags.getObjectTagsbyConceptId, {
			conceptId: template.conceptId
		});


		// Extract unique conceptIds from object tags
		let uniqueConceptIds = [...new Set(objectTags.map(tag => tag.conceptId))];

		// get similar concepts searching using template conceptId

		const templateConcept = await ctx.runQuery(api.concepts.getById, {
			conceptId: template.conceptId
		});

		if (!templateConcept) throw new Error("Template concept not found");

		const similarConcepts = await ctx.runAction(api.vectorEmbed.searchSimilarConcepts, {
			description: templateConcept.description || "",
			name: templateConcept.aliasList[0],
			limit: 3
		});

		// get all similar KnowledgeDatas with template description
		const similarKnowledgeDatasIds = await ctx.runAction(api.vectorEmbed.searchSimilarKnowledgeData, {
			query: template.description || templateConcept.description || "",
			limit: 3
		});

		// get conceptIds from similarKnowledgeDatas from similarKnowledgeDatasIds
		const similarKnowledgeDatas = await ctx.runQuery(api.knowledgeDatas.getKDbyIds, {
			knowledgeDataIds: similarKnowledgeDatasIds
		});

		const similarKnowledgeDatasConceptIds = similarKnowledgeDatas.map(kd => kd.conceptId);

		// add similarKnowledgeDatasConceptIds and similarConcepts to uniqueConceptIds
		uniqueConceptIds.push(...similarKnowledgeDatasConceptIds, ...similarConcepts);

		// remove duplicate conceptIds
		uniqueConceptIds = [...new Set(uniqueConceptIds)];

		// Get all child concepts for each unique conceptId
		let allChildConcepts: Id<"concepts">[] = [];
		for (const conceptId of uniqueConceptIds) {
			// Use the previous result as the starting point for the next search
			allChildConcepts = await ctx.runQuery(api.objectTags.getChildConcepts, {
				conceptId,
				collectedConceptIds: allChildConcepts
			});
		}

		// remove duplicate conceptIds
		allChildConcepts = [...new Set(allChildConcepts)];
		
		// Return the unique list of concepts
		return allChildConcepts;
	}
});

export const initializeTemplate = action({
	args: {
		templateId: v.id("objectTemplates")
	},
	handler: async (ctx, args): Promise<number | undefined> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// first, sync all concepts before proceeding
		await ctx.runAction(api.concepts.syncAllConcepts, {
			userId: identity.subject
		});

		// Get the template and check initialization status
		const template = await ctx.runQuery(api.objectTemplates.getObjectTemplateById, {
			templateId: args.templateId
		});
		if (!template) throw new Error("Template not found");

		// Get potential objects
		const potentialConceptIds = await ctx.runAction(api.objectTemplates.getPotentialObjects, {
			templateId: args.templateId
		});

		// Get existing object tags for this template
		const existingTags = await ctx.runQuery(api.objectTags.getObjectTagsByTemplateId, {
			templateId: args.templateId
		});

		// Get existing concept IDs
		const existingConceptIds = new Set(existingTags.map((tag: Doc<"objectTags">) => tag.conceptId));

		// Filter out concepts that already have object tags
		const filteredConceptIds = potentialConceptIds.filter((id: Id<"concepts">) => !existingConceptIds.has(id));

		// If no new concepts to process, just update sync time and return
		if (filteredConceptIds.length === 0) {
			await ctx.runMutation(api.objectTemplates.updateObjectTemplate, {
				templateId: args.templateId,
				templateName: template.templateName,
				isInitialized: true,
				lastSyncedTime: Date.now(),
			});
			return 0;
		}

		// Process concepts in groups of 10
		const BATCH_SIZE = 10;
		let allSelectedConcepts: { conceptId: Id<"concepts">; knowledgeDataId: Id<"knowledgeDatas"> | undefined }[] = [];

		// Split filteredConceptIds into groups of BATCH_SIZE
		for (let i = 0; i < filteredConceptIds.length; i += BATCH_SIZE) {
			const conceptBatch = filteredConceptIds.slice(i, i + BATCH_SIZE);
			
			// Process each batch
			const batchResults = await ctx.runAction(api.llm.selectInheritedConcepts, {
				objectTemplateId: args.templateId,
				conceptIds: conceptBatch
			});

			allSelectedConcepts = [...allSelectedConcepts, ...batchResults];
		}

		// Get concepts details for creating object tags
		const conceptsDetails = await ctx.runQuery(api.concepts.getConceptsByIds, {
			conceptIds: allSelectedConcepts.map((sc: { conceptId: Id<"concepts"> }) => sc.conceptId)
		});

		// Create object tags for each selected concept
		for (const conceptDetail of conceptsDetails) {
			const selectedConcept = allSelectedConcepts.find((sc: { conceptId: Id<"concepts">; knowledgeDataId: Id<"knowledgeDatas"> | undefined }) => sc.conceptId === conceptDetail._id);
			if (!selectedConcept) continue;

			const templateConcept = await ctx.runQuery(api.concepts.getById, {
				conceptId: template.conceptId
			});

			await ctx.runAction(api.objectTags.AddObjectTag, {
				conceptId: conceptDetail._id,
				parentName: templateConcept.aliasList[0],
				objectConceptId: template.conceptId,
				objectTemplateId: args.templateId,
				sourceKDs: selectedConcept.knowledgeDataId ? [selectedConcept.knowledgeDataId] : [],
				parentDescription: templateConcept.description
			});
		}

		// Mark template as initialized and update sync time
		await ctx.runMutation(api.objectTemplates.updateObjectTemplate, {
			templateId: args.templateId,
			templateName: template.templateName,
			isInitialized: true,
			lastSyncedTime: Date.now(),
		});

		return allSelectedConcepts.length;
	}
});