/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {mutation, query, action, QueryCtx} from "./_generated/server";
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
		conceptId: v.id("concepts"),
		userId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		if (!args.userId) {
			const userId = await ctx.auth.getUserIdentity();
			if (!userId) throw new Error("Not authenticated");
			args.userId = userId.subject;
		}

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
		const knowledgeString = knowledgeDatas.map(kd => kd.extractedKnowledge).join(" ");

		// 1. Get potential new object tags
		const newTags = await ctx.runAction(api.llm.fetchObjectTags, {
			conceptName: concept.aliasList[0],
			description: concept.description || "",
			existingTags: existingTagsForLLM,
			knowledgeString: knowledgeString
		});

		if (newTags) {
			// 2. Process each new tag
			for (const [objectName, [parentName, parentDesc, templateName, templateDesc]] of Object.entries(newTags)) {

				// if parrent name or template name is empty or too long, skip
				if (!parentName || parentName.length > 50 || !templateName || templateName.length > 50) {
					continue;
				}

				// 2.1 Search for related parent concepts
				const relatedConcepts = await ctx.runAction(api.llm.fetchRelatedConcepts, {
					name: parentName,
					description: parentDesc
				});

				console.log(`Syncing object name: ${objectName} with parent: ${parentName} with description: ${parentDesc} and template: ${templateName} with description: ${templateDesc}`);

				console.log(`Related concepts: ${relatedConcepts}`);
	
				let parentConceptId: Id<"concepts">;
	
				if (relatedConcepts.length === 0) {
					// 2.2 No matching concepts found - create new object tag without parent concept
					await ctx.runAction(api.objectTags.AddObjectTag, {
						conceptId: args.conceptId,
						sourceKDs: knowledgeDatas.map(kd => kd._id),
						parentName: parentName,
						parentDescription: parentDesc,
						templateName: templateName,
						templateDescription: templateDesc,
					});
				} else {
					// OLD CODE
					// // 2.3 Find best matching concept
					// const bestMatchId = await ctx.runAction(api.llm.fetchBestMatchedConcept, {
					// 	name: parentName,
					// 	description: parentDesc,
					// 	conceptIds: relatedConcepts
					// });
	
					// if (bestMatchId) {
					// 	// 2.3.1 Use matched concept
					// 	if (bestMatchId === args.conceptId) return false;

					// 	await ctx.runAction(api.objectTags.AddObjectTag, {
					// 		conceptId: args.conceptId,
					// 		parentName: parentName,
					// 		parentDescription: parentDesc,
					// 		objectConceptId: bestMatchId,
					// 		sourceKDs: knowledgeDatas.map(kd => kd._id),
					// 	});
					// } else {
					// 	// 2.3.2 No good match - create without parent concept
					// 	await ctx.runAction(api.objectTags.AddObjectTag, {
					// 		conceptId: args.conceptId,
					// 		sourceKDs: knowledgeDatas.map(kd => kd._id),
					// 		parentName: parentName,
					// 		parentDescription: parentDesc
					// 	});
					// }
					// NEW CODE
					const bestMatchId = relatedConcepts[0];
					if (bestMatchId) {
						// 2.3.1 Use matched concept
						if (bestMatchId === args.conceptId) return false;

						await ctx.runAction(api.objectTags.AddObjectTag, {
							conceptId: args.conceptId,
							parentName: parentName,
							parentDescription: parentDesc,
							objectConceptId: bestMatchId,
							sourceKDs: knowledgeDatas.map(kd => kd._id),
						});
					}
				}
			}
		}

		// call syncObjectTagProperties for conceptId
		await ctx.runAction(api.objectTagProperties.syncObjectTagProperties, {
			conceptId: args.conceptId
		});

		// mark concept as synced
		await ctx.runAction(api.concepts.updateConcept, {
			conceptId: args.conceptId,
			IsSynced: true
		});

		for (const kd of knowledgeDatas) {
			if (kd.isUpdated) {
				await ctx.runAction(api.knowledgeDatas.updateKD, {
					knowledgeId: kd._id,
					isUpdated: false
				});
			}
		}

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

export const removeObjectTag = action({
	args: {
		objectTagId: v.id("objectTags")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTag = await ctx.runQuery(api.objectTags.getById, {
			objectTagId: args.objectTagId
		});
		if (!objectTag) throw new Error("Object tag not found");

		// delete all objectTagProperties that have this objectTag
		
		// first, get all objectTagProperties that have this objectTag
		const objectTagProperties = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesByObjectTagId, {
			objectTagId: args.objectTagId
		});

		// delete all objectTagProperties that have this objectTag
		for (const property of objectTagProperties) {
			await ctx.runMutation(api.objectTagProperties.deleteObjectTagProperty, {
				propertyId: property._id
			});
		}

		// delete the objectTag
		await ctx.runMutation(api.objectTags.deleteObjectTag, {
			objectTagId: args.objectTagId
		});

		return true;
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
		objectConceptId: v.optional(v.id("concepts")),
		objectTemplateId: v.optional(v.id("objectTemplates")),
		sourceKDs: v.optional(v.array(v.id("knowledgeDatas"))),
		templateName: v.optional(v.string()),
		templateDescription: v.optional(v.string()),
		parentDescription: v.optional(v.string()),
		parentName: v.string()
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
				description: args.parentDescription || `${args.parentName} is an object concept for ${concept.aliasList[0]}`,
				isSynced: false,
				isSoft: true
			});
		}

		// Get object concept
		const objectConcept = await ctx.runQuery(api.concepts.getById, {
			conceptId: parentConceptId
		});
		if (!objectConcept) throw new Error("Object concept not found");

		// Get existing templates
		const similarTemplates: Id<"objectTemplates">[] = await ctx.runAction(api.vectorEmbed.searchSimilarObjectTemplates, {
			name: args.templateName || args.parentName,
			description: args.templateDescription || args.parentDescription || `Database for ${args.parentName} objects`,
			conceptId: parentConceptId,
			scoreThreshold: 0.7
		});

		let targetTemplateId = args.objectTemplateId;

		// 2. Handle template creation/selection
		if (similarTemplates.length === 0) {
			// 2.1 Create new blank template if none exists
			targetTemplateId = await ctx.runAction(api.objectTemplates.addObjectTemplate, {
				conceptId: parentConceptId,
				templateName: args.templateName || args.parentName,
				description: args.templateDescription || args.parentDescription || `Database for ${args.parentName} objects`
			});
		} 
// 		else if (!targetTemplateId && existingTemplates.length > 1) {
			
// 			// TODO: Add source KDs to the question

// 			const templateChoice = await ctx.runAction(api.llm.askLLM, {
// 				role: `-Goal-
// 				Given a entity name and description, a suggested database name and description to contain this entity, a list of existing databases, decide whether there is a suitable exisitng database for this entity.
				
// 				-Steps-
// 				1. Analyze the entity name and description, the suggested database name and description, and fully understand what database is intended to contain and be used for.
// 				2. Carefully analyze each existing database, determine if there is a database suitable for this entity.
// 				3. If there is a good match, return the database index.
// 				4. If there is no good match, return "**new**"
				
// 				-Output Format-
// 				Return only the template ID or "**new**"
				
// 				######################
// 				-Examples-
// 				######################
// 				Example 1:
// 				{Entity Name}: 2023 Environmental Impact Report – West Coast Operations  
// {Entity Description}: A comprehensive annual report detailing carbon emissions, water usage, and sustainability initiatives across West Coast facilities.  
// {Suggested Database Name}: Sustainability Reports  
// {Suggested Database Description}: A database containing sustainability, environmental, and ESG reports from all regional operations.  
// {Existing Databases}: [  
//   {Index: 0, Name: ESG Performance Records, Description: Stores records of environmental, social, and governance-related performance metrics and documents},  
//   {Index: 1, Name: Internal Operations Reports, Description: Includes weekly and monthly reports on operations from all business units},  
//   {Index: 2, Name: Annual Financial Reports, Description: Contains official yearly financial statements and disclosures}  
// ]
// 				######################
// 				Output:0
				
// 				Example 2:
// {Entity Name}: Supplier Risk Evaluation - AlphaTech  
// {Entity Description}: An evaluation report assessing AlphaTech’s financial stability, delivery reliability, and compliance status for Q2 2024.  
// {Suggested Database Name}: Supplier Risk Assessments  
// {Suggested Database Description}: A dedicated database for tracking periodic risk evaluations of third-party vendors and suppliers.  
// {Existing Databases}: [  
//   {Index: 0, Name: Vendor Contact Directory, Description: A directory of supplier and vendor contact details and onboarding status},  
//   {Index: 1, Name: Procurement Requests, Description: Contains logs of procurement orders, approval workflows, and payment status},  
//   {Index: 2, Name: Partner Agreements Archive, Description: Stores signed contracts and terms of engagement with partners and collaborators}  
// ]
// 				######################
// 				Output:**new**
// 				`,
// 				question: JSON.stringify({
// 					'{Entity Name}': args.parentName,
// 					'{Entity Description}': args.parentDescription || `${args.parentName} is an object concept for ${concept.aliasList[0]}`,
// 					'{Suggested Database Name}': args.templateName || args.parentName,
// 					'{Suggested Database Description}': args.templateDescription || args.parentDescription || `Database for ${args.parentName} objects`,
// 					'{Existing Databases}': existingTemplates.map((t, index) => ({
// 						index: index,
// 						name: t.templateName,
// 						description: t.description
// 					}))
// 				})
// 			});

// 			if (templateChoice.includes("new")) {
// 				targetTemplateId = await ctx.runMutation(api.objectTemplates.createObjectTemplate, {
// 					conceptId: parentConceptId,
// 					templateName: args.templateName || args.parentName,
// 					description: args.templateDescription || args.parentDescription || `Database for ${args.parentName} objects`
// 				});
// 			} else if (parseInt(templateChoice) >= 0 && parseInt(templateChoice) < existingTemplates.length) { // check if index are valid
// 				targetTemplateId = existingTemplates[parseInt(templateChoice)]._id;
// 			} else {
// 				throw new Error("Invalid template choice");
// 			}
// 		} 
		else if (!targetTemplateId) {
			// Use the only existing template if only one exists
			targetTemplateId = similarTemplates[0];
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
			objectName: args.parentName,
			objectDescription: args.parentDescription,
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
				objectPropertiesTemplateId: property._id,
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

export const getObjectTagsByTemplateId = query({
	args: {
		templateId: v.id("objectTemplates")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTags = await ctx.db
			.query("objectTags")
			.withIndex("by_template_id", (q) => 
				q.eq("userId", identity.subject)
				 .eq("templateID", args.templateId)
			)
			.collect();

		return objectTags;
	}
});

export const getChildConcepts = query({
	args: {
		conceptId: v.id("concepts"),
		collectedConceptIds: v.array(v.id("concepts"))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Recursively collect child concepts
		let finalCollection = await getChildConceptsHelper(ctx, args.conceptId, args.collectedConceptIds, identity.subject, 0);

		return finalCollection;
	}
});

async function getChildConceptsHelper(ctx: QueryCtx, conceptId: Id<"concepts">, collectedConceptIds: Id<"concepts">[], userId: string, counter: number) {

	counter++;

	console.log(`counter: ${counter}`);

	// if counter is greater than 10, return collectedConceptIds
	if (counter > 100) {
		return collectedConceptIds;
	}

	// Base case 1: If concept is already collected, return current collection
	if (collectedConceptIds.includes(conceptId)) {
		return collectedConceptIds;
	}

	// Add current concept to collection
	const updatedCollection = [...collectedConceptIds, conceptId];

	// Find all object tags where this concept is the object concept
	const childObjectTags = await ctx.db
		.query("objectTags")
		.withIndex("by_object_concept_id", (q) => 
			q.eq("userId", userId)
			 .eq("objectConceptId", conceptId)
		)
		.collect();

	// Base case 2: If no child object tags found, return current collection
	if (childObjectTags.length === 0) {
		return updatedCollection;
	}

	// Recursively collect child concepts
	let finalCollection = updatedCollection;
	for (const tag of childObjectTags) {
		finalCollection = await getChildConceptsHelper(ctx, tag.conceptId, finalCollection, userId, counter);
	}

	return finalCollection;
}