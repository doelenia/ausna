import {defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	documents: defineTable({
		title: v.string(),
		userId: v.string(),
		type: v.string(),
		isArchived: v.boolean(),
		parentDocument: v.optional(v.id("documents")),
		sourceFile: v.optional(v.string()),
		content: v.optional(v.string()),
		coverImage: v.optional(v.string()),
		icon: v.optional(v.string()),
		isPublished: v.boolean(),
		typePropsID: v.optional(v.string()),
		inspectInProgress: v.boolean(),
		fileInspect: v.optional(v.object({
			fileMentionedConcepts: v.array(v.id("concepts")),
			blocks: v.array(v.object({
				blockId: v.string(),
				conceptSynced: v.boolean(),
				edited: v.boolean(),
				toRemove: v.boolean(),
				blockMentionedConcepts: v.array(v.id("concepts")),
				references: v.array(v.id("references"))
			}))
		}))
	})
	.index("by_user", ["userId"])
	.index("by_user_parent", ["userId","parentDocument"])
	.searchIndex("search_content", {
    searchField: "content",
    filterFields: ["userId", "isArchived"],
  })
	.searchIndex("search_title", {
    searchField: "title",
    filterFields: ["userId", "isArchived"],
  }),

	sideHelps: defineTable({
		documentId: v.id("documents"),
		lastContextText: v.optional(v.string()),
		context: v.optional(v.string()),
		currentTask: v.optional(v.string()),
		subTasks: v.array(v.object({
			taskName: v.string(),
			taskDescription: v.optional(v.string()),
			isActive: v.boolean(),
			isProcessed: v.boolean(),
			relevantKnowledge: v.optional(v.array(v.object({
				knowledgeId: v.id("knowledgeDatas"),
				confidence: v.number(),
			}))),
		})),
		relevantKnowledge: v.optional(v.array(v.object({
			id: v.id("knowledgeDatas"),
			confidence: v.number(),
			knowledge: v.optional(v.string()),
			sourceId: v.id("documents"),
			sourceTitle: v.string(),
			sourceIcon: v.optional(v.string()),
			sourceType: v.string(),
			sourceSection: v.optional(v.string()),
		}))),
	})
	.index("by_document", ["documentId"]),

	concepts: defineTable({
		userId: v.string(),
		aliasList: v.array(v.string()),
		aliasString: v.optional(v.string()),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
		IsSynced: v.boolean(),
		hidden: v.boolean(),
		rootDocument: v.optional(v.id("documents")),
	})
	.index("by_user", ["userId"])
	.index("by_alias", ["aliasList"])
	.index("by_user_isSynced", ["userId", "IsSynced"])
	.searchIndex("search_alias", {
		searchField: "aliasString",
		filterFields: ["userId"],
	}),

	objectTagProperties: defineTable({
		userId: v.string(),
		conceptId: v.id("concepts"),
		objectTagId: v.id("objectTags"),
		propertyName: v.optional(v.string()),
		objectPropertiesTemplateId: v.optional(v.id("objectPropertiesTemplates")),
		value: v.optional(v.any()),
		autoFilledValue: v.optional(v.any()),
		type: v.optional(v.string()),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		sourceKDsString: v.optional(v.string()),
		autosync: v.string(),
		prompt: v.optional(v.string()),
	})
	.index("by_user", ["userId"])
	.index("by_object_tag", ["userId", "objectTagId"])
	.searchIndex("search_source_kd", {
    searchField: "sourceKDsString",
    filterFields: ["userId"],
  })
	.index("by_concept", ["userId", "conceptId"])
	.index("by_object_properties_template", ["userId", "objectPropertiesTemplateId"]),

	objectTags: defineTable({
		userId: v.string(),
		objectName: v.string(),
		objectDescription: v.optional(v.string()),
		conceptId: v.id("concepts"),
		objectConceptId: v.id("concepts"),
		sourceKDsString: v.optional(v.string()),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		templateID: v.optional(v.id("objectTemplates")),
	})
	.index("by_user", ["userId"])
	.index("by_concept", ["userId", "conceptId"])
	.index("by_object_concept_id", ["userId", "objectConceptId"])
	.index("by_template_id", ["userId", "templateID"])
	.searchIndex("search_source_kd", {
    searchField: "sourceKDsString",
    filterFields: ["userId"],
  }),

	objectTemplates: defineTable({
		userId: v.string(),
		conceptId: v.id("concepts"),
		templateName: v.string(),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		description: v.optional(v.string()),
		propsList: v.optional(v.array(v.id("objectPropertiesTemplates"))),
		isInitialized: v.optional(v.boolean()),
		lastSyncedTime: v.optional(v.number()),
	})
	.index("by_user", ["userId"])
	.index("by_concept", ["userId", "conceptId"]),

	objectPropertiesTemplates: defineTable({
		userId: v.string(),
		objectTemplateId: v.id("objectTemplates"),
		propertyName: v.string(),
		type: v.string(),
		autosync: v.boolean(),
		prompt: v.optional(v.string()),
	})
	.index("by_user", ["userId"])
	.index("by_object_template", ["userId", "objectTemplateId"]),

	knowledgeDatas: defineTable({
		userId: v.string(),
		sourceType: v.string(),
		sourceId: v.string(),
		sourceSection: v.optional(v.string()),
		quotes: v.optional(v.array(v.string())),
		isProcessed: v.boolean(),
		isUpdated: v.boolean(),
		conceptId: v.id("concepts"),
		contributions: v.optional(v.array(v.string())),
		extractedKnowledge: v.optional(v.string()),
	})
	.index("by_user", ["userId"])
	.index("by_concept", ["userId", "conceptId"])
	.index("by_source_type_id", ["sourceType", "sourceId"])
	.index("by_isProcessed_concept", ["userId", "conceptId", "isProcessed"])
	.index("by_isUpdated_concept", ["userId", "conceptId", "isUpdated"])
	.index("by_source_section", ["userId", "sourceType", "sourceId", "sourceSection", "conceptId"])
	.searchIndex("search_extractedKnowledge", {
		searchField: "extractedKnowledge",
		filterFields: ["userId", "isProcessed", "isUpdated"],
	}),

	references: defineTable({
		userId: v.string(),
		sourceKDId: v.id("knowledgeDatas"),
		refKDId: v.id("knowledgeDatas"),
		refDescription: v.optional(v.string()),
		sourcAffirmationScore: v.optional(v.number()),
	})
	.index("by_source_kd", ["sourceKDId"])
	.index("by_ref_kd", ["refKDId"]),

	apiKeys: defineTable({
		server: v.string(),
		key: v.string(),
	})
	.index("by_server", ["server"]),

	vectorEmbeddings: defineTable({
		userId: v.string(),
		embedding: v.array(v.number()),
		sourceId: v.optional(v.string()),
		type: v.string(),
		contextId: v.optional(v.string()),
		fileId: v.optional(v.string()),
	})
	.index("by_user", ["userId"])
	.index("by_source_id", ["type", "sourceId"])
	.vectorIndex("vector_embeddings", {
		dimensions: 1536,
		vectorField: "embedding",
		filterFields: ["userId", "type", "contextId", "fileId", "sourceId"],
	}),
});