/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import {api} from "../convex/_generated/api";

export const getObjectTagsbyConceptId = query({
	args: {
		conceptId: v.id("concepts")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTags = await ctx.db
			.query("objectTags")
			.withIndex("by_concept", (q) => 
				q.eq("userId", identity.subject)
				 .eq("conceptId", args.conceptId)
			)
			.collect();

		return objectTags;
	}
});

export const syncObjectTag = action({
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

		// Get all updated knowledge data for this concept
		const knowledgeDatas = await ctx.runQuery(api.knowledgeDatas.getUpdatedKDbyConceptId, {
			conceptId: args.conceptId
		});

		// Get existing object tags
		const existingTags = await ctx.runQuery(api.objectTags.getObjectTagsbyConceptId, {
			conceptId: args.conceptId
		});

		// Format existing tags for LLM
		const existingTagsForLLM = existingTags.map(tag => ({
			name: tag.objectName || "",
			description: tag.objectDescription || ""
		}));

		// Combine all knowledge data text
		const knowledgeString = knowledgeDatas.map(kd => kd.knowledge).join(" ");

		// 1. Get potential new object tags
		const newTags = await ctx.runAction(api.llm.fetchObjectTags, {
			conceptName: concept.aliasList[0],
			description: concept.description || "",
			existingTags: existingTagsForLLM,
			knowledgeString: knowledgeString
		});

		if (newTags) {
			// 2. Process each new tag
			for (const [objectName, [parentName, parentDesc, _, objectDesc]] of Object.entries(newTags)) {
				// 2.1 Search for related parent concepts
				const relatedConcepts = await ctx.runAction(api.llm.fetchRelatedConcepts, {
					name: parentName,
					description: parentDesc
				});
	
				let parentConceptId: Id<"concepts">;
	
				if (relatedConcepts.length === 0) {
					// 2.2 No matching concepts found - create new object tag without parent concept
					await ctx.runAction(api.objectTags.AddObjectTag, {
						conceptId: args.conceptId,
						objectName: objectName,
						sourceKDs: knowledgeDatas.map(kd => kd._id),
						parentName: parentName,
						objectDescription: objectDesc,
					});
				} else {
					// 2.3 Find best matching concept
					const bestMatchId = await ctx.runAction(api.llm.fetchBestMatchedConcept, {
						name: parentName,
						description: parentDesc,
						conceptIds: relatedConcepts
					});
	
					if (bestMatchId) {
						// 2.3.1 Use matched concept
						await ctx.runAction(api.objectTags.AddObjectTag, {
							conceptId: args.conceptId,
							objectName: objectName,
							objectConceptId: bestMatchId,
							sourceKDs: knowledgeDatas.map(kd => kd._id),
							objectDescription: objectDesc
						});
					} else {
						// 2.3.2 No good match - create without parent concept
						await ctx.runAction(api.objectTags.AddObjectTag, {
							conceptId: args.conceptId,
							objectName: objectName,
							sourceKDs: knowledgeDatas.map(kd => kd._id),
							parentName: parentName,
							parentDescription: parentDesc
						});
					}
				}
			}
		}

		// call syncObjectTagProperties for conceptId
		await ctx.runAction(api.objectTagProperties.syncObjectTagProperties, {
			conceptId: args.conceptId
		});

		return true;
	}
});


export const removeAllObjectTags = action({
	args: {
		knowledgeId: v.id("knowledgeDatas")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// 1. Find all objectTags containing this KD in sourceKDs

		const objectTags: Doc<"objectTags">[] = await ctx.runQuery(api.objectTags.getObjectTagsContainingKD, {
			knowledgeId: args.knowledgeId
		});

		// 4. Delete all found objectTags
		for (const tag of objectTags) {
			// delete if length of sourceKDs is 1
			if (tag.sourceKDs?.length === 1) {
				await ctx.runMutation(api.objectTags.deleteObjectTag, {
					objectTagId: tag._id
				});
			}
		}

		// 2. Find all objectTagProperties containing this KD in sourceKDs
		const objectTagProperties: Doc<"objectTagProperties">[] = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesContainingKD, {
			knowledgeId: args.knowledgeId
		});

		// 3. Delete all found objectTagProperties
		for (const property of objectTagProperties) {
			// delete if length of sourceKDs is 1
			if (property.sourceKDs?.length === 1) {
				await ctx.runMutation(api.objectTagProperties.deleteObjectTagProperty, {
					propertyId: property._id
				});
			}
		}

		return {
			deletedTags: objectTags.length,
			deletedProperties: objectTagProperties.length
		};
	}
});


export const getObjectTagsContainingKD = query({
	args: {
		knowledgeId: v.id("knowledgeDatas")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");


		const objectTags = await ctx.db
			.query("objectTags")
			.withSearchIndex("search_source_kd", (q) => 
				q
					.search("sourceKDsString", args.knowledgeId.toString())
					.eq("userId", identity.subject)
			)
			.collect();

		return objectTags;
	}
});

export const addSourceKDToObjectTag = mutation({
	args: {
		objectTagId: v.id("objectTags"),
		knowledgeId: v.id("knowledgeDatas")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTag = await ctx.db.get(args.objectTagId);
		if (!objectTag) throw new Error("Object tag not found");

		await ctx.db.patch(args.objectTagId, {
			sourceKDsString: objectTag.sourceKDsString ? `${objectTag.sourceKDsString},${args.knowledgeId}` : args.knowledgeId.toString()
		});

		// add to sourceKDs of objectTag
		await ctx.db.patch(args.objectTagId, {
			sourceKDs: [...(objectTag.sourceKDs || []), args.knowledgeId]
		});

		return true;
	}
});


export const createObjectTag = mutation({
	args: {
		conceptId: v.id("concepts"),
		objectName: v.string(),
		objectConceptId: v.id("concepts"),
		objectTemplateId: v.id("objectTemplates"),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		objectDescription: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();	
		if (!identity) throw new Error("Not authenticated");

		const objectTagId = await ctx.db.insert("objectTags", {
			userId: identity.subject,
			conceptId: args.conceptId,
			objectName: args.objectName,
			objectConceptId: args.objectConceptId,
			templateID: args.objectTemplateId,
			sourceKDsString: args.sourceKDs?.map(kd => kd.toString()).join(","),
			objectDescription: args.objectDescription
		});

		return objectTagId;
	}
});

export const deleteObjectTag = mutation({
	args: {
		objectTagId: v.id("objectTags")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTag = await ctx.db.get(args.objectTagId);
		if (!objectTag) throw new Error("Object tag not found");

		if (objectTag.userId !== identity.subject) throw new Error("Unauthorized");

		await ctx.db.delete(args.objectTagId);
		
		return true;
	}
});

// Helper function to check if objectTag exists
export const checkObjectTagExists = query({
	args: {
		conceptId: v.id("concepts"),
		templateId: v.id("objectTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const existingTag = await ctx.db
			.query("objectTags")
			.withIndex("by_concept", (q) => 
				q
					.eq("userId", identity.subject)
					.eq("conceptId", args.conceptId)
			)
			.filter((q) => q.eq(q.field("templateID"), args.templateId))
			.first();
		
		return existingTag !== null;
	}
});

// Main function to add object tag
export const AddObjectTag = action({
	args: {
		conceptId: v.id("concepts"),
		objectName: v.string(),
		objectConceptId: v.optional(v.id("concepts")),
		objectTemplateId: v.optional(v.id("objectTemplates")),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		objectDescription: v.optional(v.string()),
		parentDescription: v.optional(v.string()),
		parentName: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concept = await ctx.runQuery(api.concepts.getById, {
			conceptId: args.conceptId
		});
		if (!concept) throw new Error("Concept not found");

		//make sure conceptId does not equal to objectConceptId
		if (args.conceptId === args.objectConceptId) {
			return;
		}

		// 1. Handle object concept creation if needed
		let parentConceptId = args.objectConceptId;
		if (!parentConceptId) {
			parentConceptId = await ctx.runAction(api.concepts.addConcept, {
				alias: [args.parentName || ""],
				description: args.parentDescription || `${args.objectName} is an object concept for ${concept.aliasList[0]}`,
				isSynced: false
			});
		}

		// Get object concept
		const objectConcept = await ctx.runQuery(api.concepts.getById, {
			conceptId: parentConceptId
		});
		if (!objectConcept) throw new Error("Object concept not found");

		// Get existing templates
		const existingTemplates: Doc<"objectTemplates">[] = await ctx.runQuery(api.objectTemplates.getObjectTemplates, {
			conceptId: parentConceptId
		});

		let targetTemplateId = args.objectTemplateId;

		// 2. Handle template creation/selection
		if (existingTemplates.length === 0) {
			// 2.1 Create new blank template if none exists
			targetTemplateId = await ctx.runMutation(api.objectTemplates.createObjectTemplate, {
				conceptId: parentConceptId,
				templateName: args.objectName,
				description: `Template for ${args.objectName} objects`
			});
		} else if (!targetTemplateId && existingTemplates.length > 1) {
			// 2.2 Ask LLM to choose template or suggest creating new one
			const sourceConcept = await ctx.runQuery(api.concepts.getById, {
				conceptId: args.conceptId
			});
			
			// TODO: Add source KDs to the question

			const templateChoice = await ctx.runAction(api.llm.askLLM, {
				role: `-Goal-
				Given a concept and a list of object templates, decide whether to use an existing template or create a new one.
				
				-Steps-
				1. Analyze the concept description and template options
				2. Return either:
				   - Existing template ID if it's suitable
				   - "new" if a new template should be created
				
				-Output Format-
				Return only the template ID or "new"
				
				######################
				Example:
				{Concept Description}: A financial report showing quarterly earnings
				{Templates}: [
				  {ID: abc123, Name: "Earnings Report", Description: "Template for company earnings reports"},
				  {ID: def456, Name: "News Article", Description: "Template for news articles"}
				]
				######################
				Output:
				abc123`,
				question: JSON.stringify({
					conceptDescription: sourceConcept?.description || args.objectName,
					templates: existingTemplates.map(t => ({
						ID: t._id,
						Name: t.templateName,
						Description: t.description
					}))
				})
			});

			if (templateChoice.includes("new")) {
				targetTemplateId = await ctx.runMutation(api.objectTemplates.createObjectTemplate, {
					conceptId: parentConceptId,
					templateName: args.objectName,
					description: `Template for ${args.objectName} objects`
				});
			} else {
				targetTemplateId = templateChoice as Id<"objectTemplates">;
			}
		} else if (!targetTemplateId) {
			// Use the only existing template if only one exists
			targetTemplateId = existingTemplates[0]._id;
		}

		// 3. Check if object tag already exists
		const tagExists = await ctx.runQuery(api.objectTags.checkObjectTagExists, {
			conceptId: args.conceptId,
			templateId: targetTemplateId
		});
		if (tagExists) return;

		// 4. Create new object tag
		const template: Doc<"objectTemplates"> | null = await ctx.runQuery(api.objectTemplates.getObjectTemplateById, {
			templateId: targetTemplateId
		});

		if (!template) throw new Error("Template not found");

		
		// Create object tag
		const objectTagId: Id<"objectTags"> = await ctx.runMutation(api.objectTags.createObjectTag, {
			conceptId: args.conceptId,
			objectConceptId: parentConceptId,
			objectTemplateId: targetTemplateId,
			objectName: args.objectName,
			objectDescription: args.objectDescription,
			sourceKDs: args.sourceKDs
		});

		// create objectTagProperties for objectTagId and conceptId based on properties template
		const propertiesTemplate: Doc<"objectPropertiesTemplates">[] = await ctx.runQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateByObjectTemplateId, {
			objectTemplateId: targetTemplateId
		});

		// loop through all properties
		for (const property of propertiesTemplate) {
			await ctx.runMutation(api.objectTagProperties.createObjectTagProperty, {
				objectTagId: objectTagId,
				conceptId: args.conceptId,
				propertyName: property.propertyName,
				type: property.type,
				sourceKDs: args.sourceKDs
			});
		}
		return objectTagId;
	}
});

export const getById = query({
	args: {
		objectTagId: v.id("objectTags")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTag = await ctx.db.get(args.objectTagId);
		if (!objectTag) throw new Error("Object tag not found");

		return objectTag;
	}
});
