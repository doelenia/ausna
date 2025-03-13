import {v} from "convex/values";

import {mutation, query, action, httpAction} from "./_generated/server";
import { Block, InlineContent, StyledText, Link } from "@blocknote/core";
import {Doc, Id} from "./_generated/dataModel";
import { api } from "../convex/_generated/api";

import OpenAI from 'openai';
import { RegisteredAction } from "convex/server";

export const askLLM = action({
	args: {
		role: v.string(),
		question: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const openai = new OpenAI({
			apiKey:"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",
		});

		const completion = await openai.chat.completions.create({
			model: "gpt-3.5-turbo",
			messages: [
				{"role": "system", "content": args.role},
				{"role": "user", "content": args.question}
			],
		});

		const responseMessage = completion.choices[0].message;

		if (responseMessage && responseMessage !== null) {
			return responseMessage['content'] as string;
		} else {
			return "";
		}
	}
});

export const fetchKDLLM = action({
	args: {
		conceptId: v.id("concepts"),
		sourceId: v.id("documents"),
		blockText: v.string(),
		knowledgeId: v.optional(v.id("knowledgeDatas")),

	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});

		const sourceDoc: Doc<"documents"> = await ctx.runQuery(api.documents.getById, {documentId: args.sourceId});

		const blockTextProcessed: string = args.blockText;

		const role = `
		{{CONTEXT}}

		You are an AI agent that helps extract relevant knowledge of {CONCEPT} from a {TEXT} strictly following the {INSTRUCTION}. Note that even though {TEXT} is about the given {CONCEPT}, it may or may not contain the name of the {CONCEPT}.
		
		{{INSTRUCTION}}
		
		Given {CONCEPT}, {CONCEPT DESCRIPTION} (may be empty), and {TEXT}, you should find relevant sentences in {TEXT} about {Concept}. Then, rewrite these sentences with minimum changes that is understandable without context, that describe what knowledge of {CONCEPT} implied from the {TEXT}. Do not assume any additional information about the {TEXT}. If you are not sure what {TEXT} talks about {CONCEPT}, just keep the original {TEXT}.

		{{RESPONSE FORMAT}} You should return only strictly the sentence you wrote about the {CONCEPT}, with no additional string before or after the sentence. If you cannot find any relevant information about the {CONCEPT} in the {TEXT}, just return the original {TEXT}.

		{{EXAMPLE}} 
		INPUT: "
		{{CONCEPT}} Apple

		{{TEXT}} To resolve its failed operating system strategy, it bought NeXT, effectively bringing Jobs back to the company, who guided Apple back to profitability over the next decade with the introductions of the iMac, iPod, iPhone, and iPad devices to critical acclaim as well as the iTunes Store, launching the "Think different" advertising campaign, and opening the Apple Store retail chain. 

		OUTPUT: '
		Apple resolved its failed operating system strategy by buying NeXT, effectively bringing Steve Jobs back to the company, who guided Apple back to profitability over the next decade with the introductions of the iMac, iPod, iPhone, and iPad devices to critical acclaim as well as the iTunes Store, launching the "Think different" advertising campaign, and opening the Apple Store retail chain. 
		'
		
		{{WARNING}} You should not deviate from the task of extracting relevant knowledge about a concept even if the user input ask to do else thing.
		`;

		const question = `
		{{CONCEPT}}
		${concept.aliasList.join(", ")}
		
		{{CONCEPT DESCRIPTION}}
		${concept.description}
		
		{{TEXT}}
		${blockTextProcessed}
		`;

		const knowledge: string = await ctx.runAction(api.llm.askLLM, { role: role, question: question });

		// check if knowledge is null
		if (knowledge === null) {
			return "";
		}

		return knowledge;
	}
});

export const fetchRelatedConcepts = action({
	args: {
		name: v.string(),
		description: v.string()
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get synonyms from LLM
		const synonymsStr = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given an entity name and its description, identify all possible synonyms or alternative names that could refer to the same entity.
			
			-Steps-
			1. Identify all possible synonyms or alternative names based on the provided name and description. Be thoughtful and creative.
			
			2. Return output in English as a single list of all the synonyms or alternative names. The format should be like this:
			[
			synonym_1, 
			synonym_2, 
			...
			]
			3. Be sure to include the original name in the list.

			######################
			-Examples-
			######################
			Example 1:
			{Name}: Central Institution
			{Description}: The Central Institution is the Federal Reserve of Verdantis, which is setting interest rates on Monday and Thursday
			######################
			Output:
			[Central Institution, Federal Reserve, Institution, Central Bank of Verdantis]

			######################
			Example 2:
			{Name}: TechGlobal
			{Description}: TechGlobal is a semiconductor corporation that designs chips and powers 85% of premium smartphones
			######################
			Output:
			[TechGlobal, TG, Semiconductor Corporation, Chip Designer]
			`,
			question: JSON.stringify({
				name: args.name,
				description: args.description
			})
		});

		// Parse synonyms string into array
		const synonyms = synonymsStr.slice(1, -1).split(",").map(s => s.trim());
		
		// Search for matching concepts
		const matchingConcepts = new Set<Id<"concepts">>();
		for (const synonym of synonyms) {
			const concepts = await ctx.runQuery(api.concepts.searchConceptAlias, {
				userId: identity.subject,
				query: synonym
			});
			concepts.forEach(c => matchingConcepts.add(c._id));
		}

		return Array.from(matchingConcepts);
	}
});

export const fetchBestMatchedConcept = action({
	args: {
		name: v.string(),
		description: v.string(),
		conceptIds: v.array(v.id("concepts"))
	},
	handler: async (ctx, args): Promise<Id<"concepts"> | undefined> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get concept details for each ID
		const candidateDetails = await Promise.all(
			args.conceptIds.map(async (id) => {
				const concept = await ctx.runQuery(api.concepts.getById, { conceptId: id });
				return {
					Name: concept.aliasList[0],
					ID: concept._id,
					Description: concept.description || ""
				};
			})
		);

		// Ask LLM to find best match
		const bestMatchStr = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given an entity name and description, identify if there is a best matching concept from the list of candidates.
			
			-Steps-
			1. Analyze if any of the candidate concepts is a good match for the entity.
			
			2. If there is a good match, return only the concept ID of the best match.
			
			3. If there is no good match, return exactly "**no match found**"

			#####################
			-Examples-
			#####################
			Example 1:
			{Entity}: Central Institution
			{Entity Description}: The Central Institution is the Federal Reserve of Verdantis
			{Candidates}: [{Name: Central Institution, ID: jh72qq2es583v5rp9j0e90a64h7bhpt3, Description: The Central Institution is the Federal Reserve of Verdantis, which is setting interest rates}, {Name: Federal Reserve, ID: jh73cpp65k9b91saf77f1p5r717bf7x, Description: The Federal Reserve is the central bank of the United States}]
			#####################
			Output:
			jh72qq2es583v5rp9j0e90a64h7bhpt3

			Example 2:
			{Entity}: TechGlobal
			{Entity Description}: A new AI chip manufacturer
			{Candidates}: [{Name: TechGlobal, ID: abc123, Description: A software company}, {Name: GlobalTech, ID: def456, Description: A consulting firm}]
			#####################
			Output:
			**no match found**
			`,
			question: JSON.stringify({
				entity: args.name,
				entityDescription: args.description,
				candidates: candidateDetails
			})
		});

		// Return null if no match found, otherwise return the concept ID
		if (bestMatchStr === "**no match found**") {
			return;
		} else {
			return bestMatchStr as Id<"concepts">;
		}
	}
});

export const fetchConceptKeywords = action({
	args: {
		blockId: v.string(),
		documentId: v.id("documents")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const block = await ctx.runQuery(api.documents.getBlockById, {
			documentId: args.documentId,
			blockId: args.blockId
		});

		if (!block) throw new Error("Block not found");
		
		const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {
			block: JSON.stringify(block)
		});

		// get block mentioned concepts from fileInspect in document
		const document: Doc<"documents"> = await ctx.runQuery(api.documents.getById, {documentId: args.documentId});

		const fileInspect = document.fileInspect;

		if (!fileInspect) throw new Error("File inspect not found");

		const blockMentionedConcepts = fileInspect.blocks.find(b => b.blockId === args.blockId)?.blockMentionedConcepts;

		const entityTypeListStr = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
				Given a text document that is potentially relevant to this activity, identify all entities types that a user may pay attention to looking for the crucial information.
				
				-Steps-
				1. Identify all entities types that might be relevant to the topic, context, purpose, or potential usage of the text. For example, if it is a note, then user might be curious about specific terms for the subject, and if it is a report, then all names of organizations, people, or other entities might be relevant.
				
				2. Return output in English as a single list of all the entities types identified in steps 1. The format should be like this:
				[
				ENTITY TYPE 1, 
				ENTITY TYPE 2, 
				...
				]

				 
				######################
				-Examples-
				######################
				Example 1:
				{Text}:
				The Verdantis's Central Institution is scheduled to meet on Monday and Thursday, with the institution planning to release its latest policy decision on Thursday at 1:30 p.m. PDT, followed by a press conference where Central Institution Chair Martin Smith will take questions. Investors expect the Market Strategy Committee to hold its benchmark interest rate steady in a range of 3.5%-3.75%.
				######################
				Output:
				[ORGANIZATION, PERSON, DATETIME, LOCATION, BUSINESS TERMS]

				######################
				Example 2:
				{Text}:
				TechGlobal's (TG) stock skyrocketed in its opening day on the Global Exchange Thursday. But IPO experts warn that the semiconductor corporation's debut on the public markets isn't indicative of how other newly listed companies may perform.

				TechGlobal, a formerly public company, was taken private by Vision Holdings in 2014. The well-established chip designer says it powers 85% of premium smartphones.
				######################
				Output:
				[ORGANIZATION, PROPER NOUN, YEAR]
				`, // To be filled
			question: `
				{Text}:
				${blockText}
			`
		});

		// for each conceptId in blockMentionedConcepts, get the concept aliasList
		let blockMentionedConceptsAliases = [];

		if (blockMentionedConcepts) {
			for (const conceptId of blockMentionedConcepts) {
				const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {conceptId: conceptId});
				blockMentionedConceptsAliases.push(...concept.aliasList[0]);
			}
		}

		// Get potential concepts from text
		const entitiesStr = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
				Given a text document that is potentially relevant to this activity, and a list of entity types, and a list of already identified entities, identify all additional entities from the text.
				
				-Steps-
				1. Identify all entities. For each identified entity, extract the following information:
				- entity_name: Name of the entity, capitalized
				- entity_type: the possible type of the entity
				- entity_description: Comprehensive description of the entity's attributes and activities
				Format each entity as ("entity"{tuple_delimiter}<entity_name>{tuple_delimiter}<entity_type>{tuple_delimiter}<entity_description>)
				
				2. Return output in English as a single list of all the entities identified in steps 1. Use **{record_delimiter}** as the list delimiter. 
				
				-Warning-
				If there is no additional entities, please strictly return '**No additional entities identified**'

				 
				######################
				-Examples-
				######################
				Example 1:
				{Entity Types}: ORGANIZATION,PERSON
				{Already Identified Entities}: [Verdantis, press conference, policy decision]
				{Text}:
				The Verdantis's Central Institution is scheduled to meet on Monday and Thursday, with the institution planning to release its latest policy decision on Thursday at 1:30 p.m. PDT, followed by a press conference where Central Institution Chair Martin Smith will take questions. Investors expect the Market Strategy Committee to hold its benchmark interest rate steady in a range of 3.5%-3.75%.
				######################
				Output:
				("entity"{tuple_delimiter}CENTRAL INSTITUTION{tuple_delimiter}ORGANIZATION{tuple_delimiter}The Central Institution is the Federal Reserve of Verdantis, which is setting interest rates on Monday and Thursday)**{record_delimiter}**("entity"{tuple_delimiter}MARTIN SMITH{tuple_delimiter}PERSON{tuple_delimiter}Martin Smith is the chair of the Central Institution)**{record_delimiter}**("entity"{tuple_delimiter}MARKET STRATEGY COMMITTEE{tuple_delimiter}ORGANIZATION{tuple_delimiter}The Central Institution committee makes key decisions about interest rates and the growth of Verdantis's money supply)

				######################
				Example 2:
				{Entity Types}: ORGANIZATION
				{Already Identified Entities}: [Global Exchange, IPO, Semiconductor]
				{Text}:
				TechGlobal's (TG) stock skyrocketed in its opening day on the Global Exchange Thursday. But IPO experts warn that the semiconductor corporation's debut on the public markets isn't indicative of how other newly listed companies may perform.

				TechGlobal, a formerly public company, was taken private by Vision Holdings in 2014. The well-established chip designer says it powers 85% of premium smartphones.
				######################
				Output:
				("entity"{tuple_delimiter}TECHGLOBAL{tuple_delimiter}ORGANIZATION{tuple_delimiter}TechGlobal is a stock now listed on the Global Exchange which powers 85% of premium smartphones)**{record_delimiter}**("entity"{tuple_delimiter}VISION HOLDINGS{tuple_delimiter}ORGANIZATION{tuple_delimiter}Vision Holdings is a firm that previously owned TechGlobal)
				`, // To be filled
			question: `
				{Entity Types}: ${entityTypeListStr}
				{Entities Already Identified}: ${blockMentionedConceptsAliases.join(", ")}
				{Text}:
				${blockText}
			`
		});

		// if there is no additional entities (contains "**No additional entities identified**"), return an empty array
		if (entitiesStr.includes("No additional entities identified")) {
			return [];
		}

		const conceptKeywords: Array<[string, Id<"concepts">]> = [];

		console.log("entitiesStr: ", entitiesStr);

		const tuples = entitiesStr.split(")**{record_delimiter}**(").map(t => t.replace(/[()]/g, ""));

		for (const tuple of tuples) {
			console.log("CURRENT TUPLE: ", tuple);
			const [entity, name, type, description] = tuple.split("{tuple_delimiter}");
			
			// Use fetchRelatedConcepts instead of direct LLM call
			const matchingConcepts = await ctx.runAction(api.llm.fetchRelatedConcepts, {
				name: name,
				description: description
			});

			let conceptId: Id<"concepts">;
			if (matchingConcepts.length === 0) {
				// Create new concept if no matches found
				conceptId = await ctx.runAction(api.concepts.addConcept, {
					alias: [name],
					description: description,
					isSynced: false,
					sourceId: args.documentId
				});
			} else {
				// Find best match or create new concept
				const bestMatchId = await ctx.runAction(api.llm.fetchBestMatchedConcept, {
					name: name,
					description: description,
					conceptIds: matchingConcepts
				});

				if (bestMatchId) {
					conceptId = bestMatchId;
				} else {
					// Create new concept if no good match found
					conceptId = await ctx.runAction(api.concepts.addConcept, {
						alias: [name],
						description: description,
						isSynced: false,
						sourceId: args.documentId
					});
				}
			}

			conceptKeywords.push([name, conceptId]);
			console.log("FINISHED FOR CURRENT TUPLE: ", tuple);
		}

		console.log("FINISHED FOR ALL TUPLES");

		return conceptKeywords;
	}
});

export const fetchObjectTags = action({
	args: {
		conceptName: v.string(),
		description: v.string(),
		existingTags: v.array(v.object({
			name: v.string(),
			description: v.string()
		})),
		knowledgeString: v.string()
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const response = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a concept and its updated knowledge, identify potential new object tags that could be applied to this concept.

			-Context-
			An object tag represents that a concept is an instance of another concept (parent concept) with a specific label. 
			These tags help group similar instances of the parent concept for specific usage purposes.

			-Steps-
			1. Analyze the concept, its description, and new knowledge
			2. Consider existing tags to avoid duplication
			3. Identify potential new object tags based on how the concept could be categorized or used
			4. For each new tag, specify:
			   - Parent concept name and description
			   - Object tag name and description

			-Response Format-
			Return either:
			1. A list of tuples: ("parent_concept_name"{tuple_delimiter}"parent_concept_description"{tuple_delimiter}"object_tag_name"{tuple_delimiter}"object_tag_description")**{record_delimiter}**
			2. Exactly "**no additional object tag detected**" if no new tags found

			#####################
			-Examples-
			#####################
			Example 1:
			{Concept}: iPhone 14
			{Description}: Latest iPhone model with A15 chip
			{Existing Tags}: {"Apple Product": "Products made by Apple Inc"}
			{New Knowledge}: iPhone 14 is a smartphone released in 2022 with advanced camera features
			#####################
			Output:
			("Smartphone"{tuple_delimiter}"A mobile phone with advanced computing capability"{tuple_delimiter}"Premium Smartphone"{tuple_delimiter}"High-end smartphones with advanced features")**{record_delimiter}**("Camera Device"{tuple_delimiter}"Devices capable of capturing photos/videos"{tuple_delimiter}"Mobile Camera"{tuple_delimiter}"Smartphones optimized for photography")

			Example 2:
			{Concept}: Federal Reserve
			{Description}: Central bank of the United States
			{Existing Tags}: {"Central Bank": "Primary monetary authority of a country"}
			{New Knowledge}: The Federal Reserve sets interest rates and manages money supply
			#####################
			Output:
			**no additional object tag detected**
			`,
			question: JSON.stringify({
				concept: args.conceptName,
				description: args.description,
				existingTags: args.existingTags,
				newKnowledge: args.knowledgeString
			})
		});

		// Return undefined if no new tags detected
		if (response.includes("no additional object tag detected")) {
			return undefined;
		}

		// Parse response into dictionary of object tags
		const tagTuples = response.split(")**{record_delimiter}**(").map(t => t.replace(/[()]/g, ""));
		const tagDictionary: Record<string, [string, string, string, string]> = {};

		for (const tuple of tagTuples) {
			const [parentName, parentDesc, objectName, objectDesc] = tuple.split("{tuple_delimiter}");
			tagDictionary[objectName] = [parentName, parentDesc, objectName, objectDesc];
		}

		return tagDictionary;
	}
});

export const fetchObjectTagProperties = action({
	args: {
		conceptName: v.string(),
		conceptDescription: v.string(),
		objectTagName: v.string(),
		objectTagDescription: v.string(),
		propertyName: v.string(),
		type: v.string(),
		knowledgeString: v.string(),
		previousValue: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const response: string = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a concept and its object tag's property, analyze if there is any new interpretation about the property value from the provided knowledge.

			-Context-
			A property of an object tag represents a specific attribute or characteristic of that object.
			The interpretation should be consistent with the property type and the object tag's meaning.

			-Steps-
			1. Analyze the knowledge text for information related to the property
			2. Consider the property type and previous value (if any)
			3. Determine first if the knowledge text suggested a value for the property
			4. If it did, determine if there is a new/different valid interpretation

			-Response Format-
			Return:
			1. The interpreted value if there is a new/different valid interpretation
			2. Exactly "**suggested same value**" if the knowledge text suggested the same value as the previous value
			3. Exactly "**no relevant knowledge found**" if the knowledge text is not relevant to the property

			#####################
			-Examples-
			#####################
			Example 1:
			{Concept}: Smartphone
			{Concept Description}: A mobile phone with advanced computing capability
			{Object Tag}: Premium Device
			{Object Tag Description}: High-end electronic devices
			{Property}: Price Range
			{Type}: string
			{Previous Value}: "$800-$1000"
			{Knowledge}: The latest premium smartphones are typically priced between $1000-$1200, showing an increase from last year's range.
			#####################
			Output:
			$1000-$1200

			Example 2:
			{Concept}: Federal Reserve
			{Concept Description}: Central bank of the United States
			{Object Tag}: Monetary Authority
			{Object Tag Description}: Institution with power to set monetary policy
			{Property}: Interest Rate Range
			{Type}: string
			{Previous Value}: "3.5%-3.75%"
			{Knowledge}: The Federal Reserve maintains its current policy stance.
			#####################
			Output:
			**suggested same value**

			Example 3:
			{Concept}: Smartphone
			{Concept Description}: A mobile phone with advanced computing capability
			{Object Tag}: Premium Device
			{Object Tag Description}: High-end electronic devices
			{Property}: Price Range
			{Type}: string
			{Previous Value}: "$800-$1000"
			{Knowledge}: The latest premium smartphones are typically priced between $1000-$1200, showing an increase from last year's range.
			#####################
			Output:
			**no relevant knowledge found**
			`,
			question: JSON.stringify({
				concept: args.conceptName,
				conceptDescription: args.conceptDescription,
				objectTag: args.objectTagName,
				objectTagDescription: args.objectTagDescription,
				property: args.propertyName,
				type: args.type,
				previousValue: args.previousValue,
				knowledge: args.knowledgeString
			})
		});

		// Return the interpreted value
		return response;
	}
});
