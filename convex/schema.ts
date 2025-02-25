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
		fileInspect: v.optional(v.string())
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

	concepts: defineTable({
		userId: v.string(),
		aliasList: v.array(v.string()),
		objectTags: v.optional(v.array(v.id("objectTags"))),
		description: v.optional(v.string()),
		IsSynced: v.boolean(),
		rootDocument: v.optional(v.id("documents")),
	})
	.index("by_user", ["userId"])
	.index("by_alias", ["aliasList"]),

	objectTags: defineTable({
		userId: v.string(),
		conceptId: v.id("concepts"),
		objectConceptId: v.id("concepts"),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		templateID: v.optional(v.id("objectTemplates")),
		propsList: v.optional(v.array(v.string())),
	})
	.index("by_user", ["userId"])
	.index("by_concept", ["conceptId"]),

	objectTemplates: defineTable({
		userId: v.string(),
		conceptId: v.id("concepts"),
		templateName: v.string(),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		propsList: v.optional(v.array(v.string())),
	})
	.index("by_user", ["userId"])
	.index("by_concept", ["conceptId"]),


	knowledgeDatas: defineTable({
		userId: v.string(),
		sourceFile: v.id("documents"),
		sourceSection: v.optional(v.string()),
		isProcessed: v.boolean(),
		conceptId: v.id("concepts"),
		contributions: v.optional(v.array(v.string())),
		knowledge: v.optional(v.string()),
	})
	.index("by_user", ["userId"])
	.index("by_concept", ["userId", "conceptId"])
	.index("by_source_file", ["sourceFile"]),

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
});