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
		INPUT:
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
		description: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");
		// OLD LLM APPROACH
		// // Get synonyms from LLM
		// const synonymsStr = await ctx.runAction(api.llm.askLLM, {
		// 	role: `-Goal-
		// 	Given an entity name and its description, identify all possible synonyms or alternative names that could refer to the same entity.
			
		// 	-Steps-
		// 	1. Identify all possible synonyms or alternative names based on the provided name and description. Be thoughtful and creative.
			
		// 	2. Return output in English as a single list of all the synonyms or alternative names. The format should be like this:
		// 	[
		// 	synonym_1, 
		// 	synonym_2, 
		// 	...
		// 	]
		// 	3. Be sure to include the original name in the list.

		// 	######################
		// 	-Examples-
		// 	######################
		// 	Example 1:
		// 	{Name}: Central Institution
		// 	{Description}: The Central Institution is the Federal Reserve of Verdantis, which is setting interest rates on Monday and Thursday
		// 	######################
		// 	Output:
		// 	[Central Institution, Federal Reserve, Institution, Central Bank of Verdantis]

		// 	######################
		// 	Example 2:
		// 	{Name}: TechGlobal
		// 	{Description}: TechGlobal is a semiconductor corporation that designs chips and powers 85% of premium smartphones
		// 	######################
		// 	Output:
		// 	[TechGlobal, TG, Semiconductor Corporation, Chip Designer]
		// 	`,
		// 	question: JSON.stringify({
		// 		name: args.name,
		// 		description: args.description
		// 	})
		// });

		// // Parse synonyms string into array
		// const synonyms = synonymsStr.slice(1, -1).split(",").map(s => s.trim());
		
		// // Search for matching concepts
		// const matchingConcepts = new Set<Id<"concepts">>();
		// for (const synonym of synonyms) {
		// 	const concepts = await ctx.runQuery(api.concepts.searchConceptAlias, {
		// 		userId: identity.subject,
		// 		query: synonym
		// 	});
		// 	concepts.forEach(c => matchingConcepts.add(c._id));
		// }

		// return Array.from(matchingConcepts);

		// NEW VECTOR EMBEDDING APPROACH
		const conceptIds: Id<"concepts">[] = await ctx.runAction(api.vectorEmbed.searchSimilarConcepts, {
			name: args.name,
			description: args.description || "",
			limit: 3
		});
		return conceptIds;
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
			args.conceptIds.map(async (id, index) => {
				const concept = await ctx.runQuery(api.concepts.getById, { conceptId: id });
				return {
					Name: concept.aliasList[0],
					Index: index,
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
			
			2. If there is a good match, return only the concept index of the best match.
			
			3. If there is no good match, return exactly "**no match found**"

			#####################
			-Examples-
			#####################
			Example 1:
			{Entity}: Central Institution
			{Entity Description}: The Central Institution is the Federal Reserve of Verdantis
			{Candidates}: [{Name: Central Institution, Index: 0, Description: The Central Institution is the Federal Reserve of Verdantis, which is setting interest rates}, {Name: Federal Reserve, Index: 1, Description: The Federal Reserve is the central bank of the United States}]
			#####################
			Output:
			0

			Example 2:
			{Entity}: TechGlobal
			{Entity Description}: A new AI chip manufacturer
			{Candidates}: [{Name: TechGlobal, Index: 0, Description: A software company}, {Name: GlobalTech, Index: 1, Description: A consulting firm}]
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

		// Return undefined if no match found, otherwise return the concept ID
		if (bestMatchStr.includes("no match found")) {
			return;
		} else {
			const matchIndex = parseInt(bestMatchStr);
			return args.conceptIds[matchIndex];
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

		// Get the document first to access title and all blocks
		const document: Doc<"documents"> = await ctx.runQuery(api.documents.getById, {documentId: args.documentId});
		if (!document) throw new Error("Document not found");

		// Get the current block
		const currentBlock = await ctx.runQuery(api.documents.getBlockById, {
			documentId: args.documentId,
			blockId: args.blockId
		});
		if (!currentBlock) throw new Error("Block not found");

		// Get all blocks from the document
		const allBlocks = document.content ? JSON.parse(document.content) : [];
		
		// Find the index of the current block
		const currentBlockIndex = allBlocks.findIndex((block: any) => block.id === args.blockId);
		if (currentBlockIndex === -1) throw new Error("Block not found in document content");

		// Get all blocks up to and including the current block
		const relevantBlocks = allBlocks.slice(0, currentBlockIndex + 1);

		// Build context by combining title and block texts
		let contextText = `Title: ${document.title}\n\n`;
		
		// Get text from each block
		for (const block of relevantBlocks) {
			const blockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {
				block: JSON.stringify(block)
			});
			contextText += blockText + "\n";
		}

		const currentBlockText = await ctx.runAction(api.documents.getBlockTextFromBlock, {
			block: JSON.stringify(currentBlock)
		});

		const fileInspect = document.fileInspect;
		if (!fileInspect) throw new Error("File inspect not found");

		const blockMentionedConcepts = fileInspect.blocks.find(b => b.blockId === args.blockId)?.blockMentionedConcepts;

		// Get entity types with full context
		const entityTypeListStr = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
				Given a context of the document and the current block, identify all possible entities types that a user may pay attention to looking for the crucial information.
				
				-Steps-
				1. Identify all entities types that might be relevant to the topic, context, purpose, or potential usage of the text. For example, if it is a note, then user might be curious about specific terms for the subject, and if it is a report, then all names of organizations, people, events, or other entities might be relevant. Please be thorough.
				
				2. Return output in English as a single list of all the entities types identified in steps 1. The format should be like this:
				[ENTITY TYPE 1, ENTITY TYPE 2, ...]

				-Context-
				The text provided includes the document title and all content up to the current block. Use this full context to identify relevant entity types that a user may pay attention to looking for the crucial information.
				 
				######################
				-Examples-
				######################
				Example 1:
				{Text}:
				Title: Central Bank Meeting Minutes

				The upcoming meetings of the Verdantis's Central Institution are highly anticipated by market analysts and policymakers alike. With economic uncertainty lingering, stakeholders are keen to understand the institution's latest stance on monetary policy and its potential impact on financial markets.

				The Verdantis's Central Institution is scheduled to meet on Monday and Thursday, with the institution planning to release its latest policy decision on Thursday at 1:30 p.m. PDT, followed by a press conference where Central Institution Chair Martin Smith will take questions. Investors expect the Market Strategy Committee to hold its benchmark interest rate steady in a range of 3.5%-3.75%.

				{Current Block}:
				The Verdantis's Central Institution is scheduled to meet on Monday and Thursday, with the institution planning to release its latest policy decision on Thursday at 1:30 p.m. PDT, followed by a press conference where Central Institution Chair Martin Smith will take questions. Investors expect the Market Strategy Committee to hold its benchmark interest rate steady in a range of 3.5%-3.75%.
				######################
				Output:
				[ORGANIZATION, PERSON, DATETIME, LOCATION, BUSINESS TERMS, EVENT, DEPARTMENT]

				######################
				Example 2:
				{Text}:
				Title: Tech Industry IPO Analysis
				
				TechGlobal's (TG) stock skyrocketed in its opening day on the Global Exchange Thursday. But IPO experts warn that the semiconductor corporation's debut on the public markets isn't indicative of how other newly listed companies may perform.

				TechGlobal, a formerly public company, was taken private by Vision Holdings in 2014. The well-established chip designer says it powers 85% of premium smartphones.

				{Current Block}:
				TechGlobal, a formerly public company, was taken private by Vision Holdings in 2014. The well-established chip designer says it powers 85% of premium smartphones.
				######################
				Output:
				[ORGANIZATION, PROPER NOUN, YEAR, ELECTRONIC DEVICE]
				`,
			question: `
				{Text}:
				${contextText}

				{Current Block}:
				${currentBlockText}
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

		// Get potential concepts from text, now using the current block text only for entity extraction

		const entitiesStr = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
				Given a text document that is potentially relevant to this activity, and a list of entity types, and a list of already identified entities, identify all additional entities from the text.
				
				-Steps-
				1. Identify all entities within the current block matching one of the entity types. For each identified entity, extract the following information:
				- entity_name: Name of the entity.
				- entity_type: the possible type of the entity
				- entity_description: Comprehensive description of the entity's attributes and activities
				Format each entity as <entity_name>{tuple_delimiter}<entity_type>{tuple_delimiter}<entity_description>
				
				2. Return output in English as a single list of all the entities identified in steps 1. Use **{record_delimiter}** as the list delimiter. 
				
				-Warning-
				Please identify if an entity is a general concept or a specific instance of a concept. For the specific instance, making sure your naming could be used to identify this specific instance.
				If there is no additional entities, please strictly return '**No additional entities identified**'

				######################
				-Examples-
				######################
				Example 1:
				{Entity Types}: [ORGANIZATION, PERSON, LOCATION, BUSINESS TERMS, EVENT, DEPARTMENT]
				{Entities Already Identified}: [Central Institution, Meeting, Interest Rate]
				{Text}:
				The upcoming meetings of the Verdantis's Central Institution are highly anticipated by market analysts and policymakers alike. With economic uncertainty lingering, stakeholders are keen to understand the institution's latest stance on monetary policy and its potential impact on financial markets.

				The Verdantis's Central Institution is scheduled to meet on Monday and Thursday, with the institution planning to release its latest policy decision on Thursday at 1:30 p.m. PDT, followed by a press conference where Central Institution Chair Martin Smith will take questions. Investors expect the Market Strategy Committee to hold its benchmark interest rate steady in a range of 3.5%-3.75%.

				######################
				Output:
				Martin Smith{tuple_delimiter}PERSON{tuple_delimiter}The Central Institution Chair**{record_delimiter}**2025-03-15{tuple_delimiter}DATETIME{tuple_delimiter}The date of the meeting**{record_delimiter}**Verdantis{tuple_delimiter}LOCATION{tuple_delimiter}The location of the meeting**{record_delimiter}**Meetings of the Verdantis's Central Institution{tuple_delimiter}EVENT{tuple_delimiter}The meeting of the Central Institution**{record_delimiter}**Market Strategy Committee at the Verdantis's Central Institution{tuple_delimiter}DEPARTMENT{tuple_delimiter}A department of the  Verdantis's Central Institution

				######################
				Example 2:
				{Entity Types}: [ORGANIZATION, BUSINESS TERMS, EVENT, DEPARTMENT, ELECTRONIC DEVICE, JOB POSITION]
				{Entities Already Identified}: [ Semiconductor, Vision Holdings]
				{Text}:
				TechGlobal, a formerly public company, was taken private by Vision Holdings in 2014. The well-established chip designer says it powers 85% of premium smartphones.
				######################
				Output:
				TechGlobal{tuple_delimiter}ORGANIZATION{tuple_delimiter}A chip designer company**{record_delimiter}**Premium Smartphone{tuple_delimiter}ELECTRONIC DEVICE{tuple_delimiter}a high-end carrying electronic device for communication**{record_delimiter}**Chip Designer{tuple_delimiter}JOB POSITION{tuple_delimiter}A person who designs chips
				`,
			question: `
				{Entity Types}: ${entityTypeListStr}
				{Entities Already Identified}: ${blockMentionedConceptsAliases.join(", ")}
				{Text}:
				${currentBlockText}
			`
		});

		// if there is no additional entities (contains "**No additional entities identified**"), return an empty array
		if (entitiesStr.includes("No additional entities identified")) {
			return [];
		}

		const conceptKeywords: Array<[string, Id<"concepts">]> = [];

		console.log("prompt: ", currentBlockText);
		console.log("entitiesStr: ", entitiesStr);

		// Split into individual entity records
		const tuples = entitiesStr.split("**{record_delimiter}**");

		for (const tuple of tuples) {
			console.log("CURRENT TUPLE: ", tuple);
			const [name, type, description] = tuple.split("{tuple_delimiter}");
			
			if (!name || !type || !description) {
				console.log("Invalid tuple format, skipping:", tuple);
				continue;
			}
			
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
			} else if (matchingConcepts.length === 1) {
				conceptId = matchingConcepts[0];
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

// Helper function to parse LLM response
const parseLLMResponseforObjectTags = (response: string): Record<string, [string, string, string, string]> | undefined => {
	try {
		if (response.includes("no additional object tag detected")) {
			return undefined;
		}

		const tagTuples = response.split(")**{record_delimiter}**(").map(t => t.replace(/[()]/g, ""));
		const tagDictionary: Record<string, [string, string, string, string]> = {};

		for (const tuple of tagTuples) {
			const [parentName, parentDesc, objectName, objectDesc] = tuple.split("**{tuple_delimiter}**");
			if (!parentName || !parentDesc || !objectName || !objectDesc) {
				throw new Error("Invalid tuple format");
			}
			tagDictionary[objectName] = [parentName, parentDesc, objectName, objectDesc];
		}

		return tagDictionary;
	} catch (error) {
		console.error("Failed to parse LLM response:", error);
		return undefined;
	}
};

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

		// First attempt
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
			1. A list of tuples: ("parent_concept_name"**{tuple_delimiter}**"parent_concept_description"**{tuple_delimiter}**"object_tag_name"**{tuple_delimiter}**"object_tag_description")**{record_delimiter}**
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
			("Smartphone"**{tuple_delimiter}**"A mobile phone with advanced computing capability"**{tuple_delimiter}**"Premium Smartphone"**{tuple_delimiter}**"High-end smartphones with advanced features")**{record_delimiter}**("Camera Device"**{tuple_delimiter}**"Devices capable of capturing photos/videos"**{tuple_delimiter}**"Mobile Camera"**{tuple_delimiter}**"Smartphones optimized for photography")

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

		// Try parsing the first response
		let result = parseLLMResponseforObjectTags(response);
		
		// If first attempt fails, try one more time
		if (!result) {
			console.log("First parsing attempt failed, retrying...");
			const retryResponse = await ctx.runAction(api.llm.askLLM, {
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
			1. A list of tuples: ("parent_concept_name"**{tuple_delimiter}**"parent_concept_description"**{tuple_delimiter}**"object_tag_name"**{tuple_delimiter}**"object_tag_description")**{record_delimiter}**
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
			("Smartphone"**{tuple_delimiter}**"A mobile phone with advanced computing capability"**{tuple_delimiter}**"Premium Smartphone"**{tuple_delimiter}**"High-end smartphones with advanced features")**{record_delimiter}**("Camera Device"**{tuple_delimiter}**"Devices capable of capturing photos/videos"**{tuple_delimiter}**"Mobile Camera"**{tuple_delimiter}**"Smartphones optimized for photography")

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
			
			result = parseLLMResponseforObjectTags(retryResponse);
		}

		return result; // Will be undefined if both attempts failed
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

export const isContainConcept = action({
	args: {
		blockText: v.string(),
		documentId: v.optional(v.id("documents")),
		conceptId: v.id("concepts"),
	},
	handler: async (ctx, args): Promise<string[]> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get concept details
		const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, { conceptId: args.conceptId });
		if (!concept) throw new Error("Concept not found");

		// Ask LLM to analyze if the text contains references to the concept
		const response: string = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a concept and its description, identify if and how the concept is mentioned or discussed in the provided text.

			-Context-
			A concept may be mentioned or discussed using its name, aliases, or through contextual descriptions that clearly refer to it.

			-Steps-
			1. Analyze if the text discusses or references the concept in any way
			2. If found, identify the exact words or phrases used to mention or discuss the concept
			3. Return all names of the concept that are mentioned or discussed

			-Response Format-
			Return either:
			1. A list of names of the concept that are mentioned or discussed separated by {tuple_delimiter} if concept is found
			2. Exactly "**does not contain**" if concept is not mentioned or discussed or you cannot decide.

			#####################
			-Examples-
			#####################
			Example 1:
			{Concept}: Federal Reserve
			{Concept Description}: The central bank of the United States
			{Aliases}: [Federal Reserve, US Central Bank]
			{Text}: The Fed announced its latest policy decision today. The Federal Reserve Chair emphasized the importance of maintaining price stability.
			#####################
			Output:
			Fed{tuple_delimiter}Federal Reserve

			Example 2:
			{Concept}: iPhone
			{Concept Description}: Apple's flagship smartphone product line
			{Aliases}: [iPhone, Apple Phone]
			{Text}: Samsung released its latest Galaxy smartphone with new camera features.
			#####################
			Output:
			**does not contain**
			`,
			question: JSON.stringify({
				concept: concept.aliasList[0],
				description: concept.description,
				aliases: concept.aliasList,
				text: args.blockText
			})
		});

		// Parse response and return results
		if (response.includes("does not contain")) {
			return [];
		}

		// Split response into array of references

		const references: string[] = response.split("{tuple_delimiter}").map((ref: string) => ref.trim());
		return references;
	}
});

export const fetchBetterName = action({
	args: {
		aliasList: v.array(v.string())
	},
	handler: async (ctx, args): Promise<string | undefined> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const response = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a list of names or terms that refer to the same concept, output the most normal and standardized form while respecting the original spelling.

			-Context-
			A good name should be:
			1. In singular form (unless it's inherently plural)
			2. Free of unnecessary punctuation
			3. In proper case (ALL CAPS only if it's an abbreviation/acronym)
			4. A proper noun or noun phrase
			5. Without unnecessary articles or modifiers

			-Steps-
			1. Analyze all provided names to understand the concept they refer to
			2. Identify if any name is already in the ideal form
			3. If needed, create a better form based on the provided names
			4. Return "**no better name**" if the names are already in their best form

			-Response Format-
			Return either:
			1. A single normalized name that best represents the concept
			2. Exactly "**no better name**" if no improvement is needed

			#####################
			-Examples-
			#####################
			Example 1:
			{Input}: ["The Federal Reserves", "Fed", "Federal Reserve Bank"]
			Output:
			Federal Reserve

			Example 2:
			{Input}: ["**AI**", "**Artificial Intelligence**"]
			Output:
			Artificial Intelligence

			Example 3:
			{Input}: ["nasa space center", "NSC", "National Space Center"]
			Output:
			NASA Space Center

			Example 4:
			{Input}: ["iPhones", "(Apple Phones", "iPhone"]
			Output:
			iPhone

			Example 5:
			{Input}: ["U.S.A.", "United States", "USA"]
			Output:
			USA

			Example 6:
			{Input}: ["machine-learning algorithms", "ML Algorithms"]
			Output:
			Machine Learning Algorithm
			`,
			question: JSON.stringify({
				input: args.aliasList
			})
		});

		const trimmedResponse = response.trim();
		return trimmedResponse === "**no better name**" ? undefined : trimmedResponse;
	}
});

export const fetchSHLocalRelevantKD = action({
	args: {
		sideHelpId: v.id("sideHelps"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");
		
		const sideHelp: Doc<"sideHelps"> = await ctx.runQuery(api.sideHelps.getSideHelpById, {
			sideHelpId: args.sideHelpId
		});
		if (!sideHelp) throw new Error("Side help not found");

		return true;
	}
});

export const fetchSHRelevantKD = action({
	args: {
		sideHelpId: v.id("sideHelps"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");
		
		// 1. Get sideHelp
		const sideHelp: Doc<"sideHelps"> = await ctx.runQuery(api.sideHelps.getSideHelpById, {
			sideHelpId: args.sideHelpId
		});
		if (!sideHelp) throw new Error("Side help not found");

		// 2. Loop through subTasks
		for (const subTask of sideHelp.subTasks || []) {
			// Check if subTask is active and not processed
			if (subTask.isActive && !subTask.isProcessed) {
				// 1. Get relevant keywords for search
				const keywordsResponse = await ctx.runAction(api.llm.askLLM, {
					role: `-Goal-
					Given a task's context and description, identify relevant keywords and their variations for searching knowledge.
					
					-Steps-
					1. Analyze the context and task descriptions
					2. Reason and imagine what specific keywords can help to search for relevant knowledge
					3. Generate variations including synonyms and alternative names
					4. Return as a list of search terms
					
					-Response Format-
					Return a list of search terms separated by {tuple_delimiter}, if no relevant keywords are found, return "**no relevant keywords found**"
					
					-Example-
					Input: 
					{Context}: "Implementing a neural network for image classification"
					{Current Task}: "Setup model architecture"
					{Sub Task}: "Define network layers and connections"
					
					Output:
					neural network layers{tuple_delimiter}network architecture{tuple_delimiter}deep learning layers{tuple_delimiter}neural network structure{tuple_delimiter}layer configuration{tuple_delimiter}model layers
					`,
					question: JSON.stringify({
						context: sideHelp.context || "",
						currentTask: sideHelp.currentTask || "",
						subTask: subTask.taskDescription
					})
				});

				// 2. Search knowledge for each keyword
				if (keywordsResponse.includes("no relevant keywords found")) {
					continue;
				}
				const knowledgeAppearances: Record<string, number> = {};
				const keywords = keywordsResponse.split("{tuple_delimiter}").map(k => k.trim());
				
				for (const keyword of keywords) {
					const searchResults = await ctx.runQuery(api.knowledgeDatas.searchKnowledge, {
						query: keyword
					});
					
					// Count appearances
					for (const result of searchResults) {
						knowledgeAppearances[result._id] = (knowledgeAppearances[result._id] || 0) + 1;
					}
				}

				const confidenceScores: Record<string, number> = {};

				// 3. Get top 20 knowledge IDs by appearance count
				if (Object.keys(knowledgeAppearances).length != 0) {
					const topKnowledgeIds = Object.entries(knowledgeAppearances)
						.sort(([, a], [, b]) => b - a)
						.slice(0, 20)
						.map(([id]) => id);

					// Get knowledge content for evaluation
					const knowledgeContents = await Promise.all(
						topKnowledgeIds.map(async (id) => {
							const kd = await ctx.runQuery(api.knowledgeDatas.getKDById, { knowledgeId: id as Id<"knowledgeDatas"> });
							return { id, content: kd?.knowledge || "" };
						})
					);

					// Evaluate confidence using LLM
					const confidenceResponse = await ctx.runAction(api.llm.askLLM, {
						role: `-Goal-
						Evaluate how relevant each piece of knowledge is for completing a specific task.
						
						-Steps-
						1. Analyze each knowledge item against the task requirements
						2. Consider how directly it helps solve the task
						3. Assign a confidence score (0-100) for each item
						
						-Response Format-
						Return scores as: index1:score1{tuple_delimiter}index2:score2{tuple_delimiter}...
						where index starts from 0
						if no relevant knowledge is found, return "**no relevant knowledge found**"

						-Example-
						Input: 
						{Context}: "Implementing a neural network for image classification"
						{Current Task}: "Setup model architecture"
						{Sub Task}: "Define network layers and connections"
						{KnowledgeList}:
						[
							{
								"content" : "The neural network architecture includes convolutional layers, pooling layers, and fully connected layers.",
								"index" : 0
							},
							{
								"content" : "The convolutional layer is a type of layer in a neural network that is used for image classification.",
								"index" : 1
							}
						]
						
						Output: 0:95{tuple_delimiter}1:55
						`,
						question: JSON.stringify({
							context: sideHelp.context || "",
							currentTask: sideHelp.currentTask || "",
							subTask: subTask.taskDescription || "",
							knowledgeList: knowledgeContents.map((k, index) => ({
								content: k.content,
								index
							}))
						})
					});

					console.log(JSON.stringify({
						context: sideHelp.context || "",
						currentTask: sideHelp.currentTask || "",
						subTask: subTask.taskDescription || "",
						knowledgeList: knowledgeContents.map((k, index) => ({
							content: k.content,
							index
						}))
					}));

					console.log(confidenceResponse);

					if (!confidenceResponse.includes("no relevant knowledge found")) {
						// Parse confidence scores
						confidenceResponse.split("{tuple_delimiter}").forEach(pair => {
							const [index, score] = pair.split(":");
							const idx = parseInt(index);
							if (!isNaN(idx) && idx >= 0 && idx < topKnowledgeIds.length && score) {
								confidenceScores[topKnowledgeIds[idx]] = parseFloat(score);
							}
						});
					}
				}

				// 5. Get all concepts and evaluate in groups of 20
				const allConcepts = await ctx.runQuery(api.concepts.getAllConcepts);
				const conceptGroups = [];
				for (let i = 0; i < allConcepts.length; i += 20) {
					conceptGroups.push(allConcepts.slice(i, i + 20));
				}

				const relevantConceptIds = new Set<Id<"concepts">>();

				// Evaluate each group of concepts
				for (const conceptGroup of conceptGroups) {
					const conceptList = conceptGroup.map(concept => ({
						name: concept.aliasList[0],
						description: concept.description
					}));

					const conceptResponse = await ctx.runAction(api.llm.askLLM, {
						role: `-Goal-
						Identify which concepts are relevant for completing a specific task.
						
						-Steps-
						1. Analyze each concept under the context and task description
						2. Determine if the concept could help getting the relevant knowledge for completing the task under the context.
						3. Return only the indices of relevant concepts
						
						-Response Format-
						Please strictly return the relevant concept indices (starting from 0) separated by {tuple_delimiter}
						For example: 0{tuple_delimiter}2{tuple_delimiter}3

						if no relevant concepts are found, return "**no relevant concepts found**"
						
						-Example-
						Input: 
						{Context}: "Implementing a neural network for image classification"
						{Current Task}: "Setup model architecture"
						{Sub Task}: "Define network layers and connections"
						{ConceptList}:
						[
							{
								"index": 0,
								"name": "Image Classification",
								"description": "Image classification is a type of machine learning task that is used for classifying images into different categories."
							},
							{
								"index": 1,
								"name": "Convolutional Neural Network",
								"description": "A convolutional neural network is a type of neural network that is used for image classification."
							}
						]
						
						Output: 0{tuple_delimiter}1
						`,
						question: JSON.stringify({
							context: sideHelp.context || "",
							currentTask: sideHelp.currentTask || "",
							subTask: subTask.taskDescription,
							conceptList: conceptList.map((c, index) => ({
								...c,
								index
							}))
						})
					});

					console.log(JSON.stringify({
						context: sideHelp.context || "",
						currentTask: sideHelp.currentTask || "",
						subTask: subTask.taskDescription,
						conceptList: conceptList.map((c, index) => ({
							...c,
							index
						}))
					}));

					console.log(conceptResponse);

					if (conceptResponse.includes("no relevant concepts found")) {
						continue;
					}

					// Add relevant concept IDs to set using indices
					conceptResponse.split("{tuple_delimiter}").forEach(indexStr => {
						const index = parseInt(indexStr.trim());
						if (!isNaN(index) && index >= 0 && index < conceptGroup.length) {
							relevantConceptIds.add(conceptGroup[index]._id);
						}
					});
				}

				// 6. Fetch knowledge for relevant concepts
				for (const conceptId of relevantConceptIds) {
					const conceptKnowledge = await ctx.runQuery(api.knowledgeDatas.getKDsofConcept, {
						conceptId
					});

					// Evaluate knowledge in groups of 20
					const knowledgeGroups = [];
					for (let i = 0; i < conceptKnowledge.length; i += 20) {
						knowledgeGroups.push(conceptKnowledge.slice(i, i + 20));
					}

					for (const knowledgeGroup of knowledgeGroups) {
						const knowledgeList = knowledgeGroup.map(knowledge => ({
							content: knowledge.knowledge
						}));

						const knowledgeResponse = await ctx.runAction(api.llm.askLLM, {
							role: `-Goal-
							Evaluate how relevant each piece of knowledge is for completing a specific task.
							
							-Steps-
							1. Analyze each knowledge item against the task requirements
							2. Consider how directly it helps solve the task
							3. Assign a confidence score (0-100) for each item
							
							-Response Format-
							Return scores as: index1:score1{tuple_delimiter}index2:score2{tuple_delimiter}...
							where index starts from 0
							if no relevant knowledge is found, return "**no relevant knowledge found**"
							
							-Example-
							Input: 
							{Context}: "Implementing a neural network for image classification"
							{Current Task}: "Setup model architecture"
							{Sub Task}: "Define network layers and connections"
							{KnowledgeList}:
							[	
								{
									"content": "The neural network architecture includes convolutional layers, pooling layers, and fully connected layers.",
									"index": 0
								},
								{
									"content": "The neural network architecture includes convolutional layers, pooling layers, and fully connected layers.",
									"index": 1
								}
							]
							
							Output: 0:95{tuple_delimiter}1:75
							`,
							question: JSON.stringify({
								context: sideHelp.context || "",
								currentTask: sideHelp.currentTask || "",
								subTask: subTask.taskDescription,
								knowledgeList: knowledgeList.map((k, index) => ({
									...k,
									index
								}))
							})
						});

						console.log(JSON.stringify({
							context: sideHelp.context || "",
							currentTask: sideHelp.currentTask || "",
							subTask: subTask.taskDescription,
							knowledgeList: knowledgeList.map((k, index) => ({
								...k,
								index	
							}))
						}));

						console.log(knowledgeResponse);

						if (knowledgeResponse.includes("no relevant knowledge found")) {
							continue;
						}
						
						// Parse confidence scores using indices
						knowledgeResponse.split("{tuple_delimiter}").forEach(pair => {
							const [index, score] = pair.split(":");
							const idx = parseInt(index);
							if (!isNaN(idx) && idx >= 0 && idx < knowledgeGroup.length && score) {
								confidenceScores[knowledgeGroup[idx]._id] = parseFloat(score);
							}
						});
					}
				}

				// 7. Get top 5 knowledge IDs by confidence score and create relevantKnowledge array
				const topRelevantKnowledge = Object.entries(confidenceScores)
					.sort(([, a], [, b]) => b - a)
					.slice(0, 5)
					.map(([id, confidence]) => ({
						knowledgeId: id as Id<"knowledgeDatas">,
						confidence
					}));

				// 8. Update subTask with relevant knowledge and mark as processed
				const updatedSubTasks = sideHelp.subTasks?.map(st => 
					st === subTask 
						? { ...st, relevantKnowledge: topRelevantKnowledge, isProcessed: true }
						: st
				) || [];

				// Update sideHelp
				await ctx.runMutation(api.sideHelps.updateSideHelp, {
					sideHelpId: args.sideHelpId,
					currentTask: sideHelp.currentTask || "",
					subTasks: updatedSubTasks
				});
			}
		}

		return true;
	}	
});

export const updateContext = action({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args): Promise<string> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get sideHelp for the document
		const sideHelp: Doc<"sideHelps"> = await ctx.runQuery(api.sideHelps.getSideHelpByDocumentId, {
			documentId: args.documentId
		});
		if (!sideHelp) throw new Error("Side help not found");

		// Get current document text
		const currentDocumentText = await ctx.runAction(api.documents.getDocumentText, {
			documentId: args.documentId
		});

		let needsUpdate = false;
		let newContext: string = sideHelp.context || "";

		// If no lastContextText exists or text has changed significantly
		if (!sideHelp.lastContextText || calculateTextDifference(currentDocumentText, sideHelp.lastContextText) > 0.3) {
			// Generate new summary using LLM
			const summary = await ctx.runAction(api.llm.askLLM, {
				role: `-Goal-
				Given a text content, generate a concise description on what the content is about.

				-Context-
				The description should:
				1. Focus on the content's main objectives
				2. Highlight key themes or topics
				3. Be concise but comprehensive

				-Response Format-
				Return a clear, well-structured description that outlines the content's main objectives and key points. Do not include any other information. If you are not sure about the content, return the content itself.

				-Example-
				Input: Correlation between chocolate consumption and Nobel laureates.

				Output: The author want to write a report on correlation between chocolate consumption and Nobel laureates.`,
				question: currentDocumentText
			});

			newContext = summary;
			needsUpdate = true;
		}

		// Update sideHelp if needed
		if (needsUpdate) {
			await ctx.runMutation(api.sideHelps.updateSideHelpContext, {
				sideHelpId: sideHelp._id,
				lastContextText: currentDocumentText,
				context: newContext
			});
		}

		return newContext;
	}
});

// Helper function to calculate text difference percentage
function calculateTextDifference(text1: string, text2: string): number {
	const words1 = new Set(text1.toLowerCase().split(/\s+/));
	const words2 = new Set(text2.toLowerCase().split(/\s+/));
	
	const intersection = new Set([...words1].filter(x => words2.has(x)));
	const union = new Set([...words1, ...words2]);
	
	return 1 - (intersection.size / union.size);
}

export const updateCurrentTask = action({
	args: {
		sideHelpId: v.id("sideHelps")
	},
	handler: async (ctx, args): Promise<boolean> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get sideHelp
		const sideHelp: Doc<"sideHelps"> = await ctx.runQuery(api.sideHelps.getSideHelpById, {
			sideHelpId: args.sideHelpId
		});
		if (!sideHelp) throw new Error("Side help not found");

		// Get last 200 words of lastContextText if it exists, if content shorter than 200 words, get the whole content
		const lastWords = sideHelp.lastContextText 
			? sideHelp.lastContextText.split(/\s+/).slice(-200).join(" ")
			: sideHelp.lastContextText || "";

		// Ask LLM to analyze the task
		const taskAnalysis = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given the recent content, current context, and current task of a document, determine if there is a significant change in what information the user likely wants to know next.

			-Context-
			You should analyze:
			1. The last portion of the document's content
			2. The document's current summary/context
			3. The current query working on
			4. Try to reason what information the user likely wants to know next based on the last content and current query

			-Response Format-
			Return strictly a clear description of the new query, do not include any other information.
			If you believe that original query is still the most relevant, return exactly "**no change needed**"

			-Example-
			Input:
			{Last Content}: "The data preprocessing steps include normalization and feature scaling..."
			{Context}: "This document outlines a machine learning project implementation"
			{Current Query}: "What is the normalization method used in this document?"

			Output:
			"What are related knowledge about normalization and feature scaling?"

			Input:
			{Last Content}: "Now, let's implement the neural network architecture..."
			{Context}: "This document outlines a machine learning project implementation"
			{Current Query}: "What is the neural network architecture?"

			Output:
			"**no change needed**"
			`,
			question: JSON.stringify({
				Content: lastWords,
				context: sideHelp.context || "",
				currentQuery: sideHelp.currentTask || "No query are found previously"
			})
		});

		console.log(JSON.stringify({
			Content: lastWords,
			context: sideHelp.context || "",
			currentQuery: sideHelp.currentTask || "No query are found previously"
		}));

		console.log(taskAnalysis);

		// If there's a change needed, update the sideHelp
		if (!taskAnalysis.includes("no change needed")) {
			const newSubTasks = [{
				taskName: taskAnalysis,
				taskDescription: taskAnalysis,
				isActive: true,
				isProcessed: false
			}];

			await ctx.runMutation(api.sideHelps.updateSideHelp, {
				sideHelpId: args.sideHelpId,
				currentTask: taskAnalysis,
				subTasks: newSubTasks
			});
			return true;
		}

		return false;
	}
});

export const updateActiveSubTasks = action({
	args: {
		sideHelpId: v.id("sideHelps")
	},
	handler: async (ctx, args): Promise<boolean> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		// Get sideHelp
		const sideHelp: Doc<"sideHelps"> = await ctx.runQuery(api.sideHelps.getSideHelpById, {
			sideHelpId: args.sideHelpId
		});
		if (!sideHelp) throw new Error("Side help not found");

		// Get last 200 words of lastContextText
		const lastWords = sideHelp.lastContextText 
			? sideHelp.lastContextText.split(/\s+/).slice(-200).join(" ")
			: sideHelp.lastContextText || "";

		// Ask LLM to break down the task
		const subTasksAnalysis = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Break down a current query into smaller, focused queries based on the document context and recent content.

			-Context-
			You should analyze:
			1. The last portion of the document's content
			2. The document's current summary/context
			3. The current task being worked on

			-Rules-
			1. Generate no more than 5 queries
			2. Each query should focus on one specific concept or aspect
			3. Queries should be specific about what information the user likely wants to know next
			4. Do not break down the query unless it is necessary, just return the original query if it is already specific enough

			-Response Format-
			Return a list of queries where each query is formatted as:
			queryName{tuple_delimiter}queryDescription

			Separate each query with **{record_delimiter}**

			-Example-
			Input:
			{Last Content}: "The neural network implementation requires setting up layers, defining the loss function, and implementing the training loop. We'll need to carefully consider the activation functions and optimization method."
			{Context}: "Implementing a deep learning model for image classification"
			{Current Query}: "What is the neural network architecture?"

			Output:
			Define Network Layers{tuple_delimiter}Specify the neural network layer structure including input, hidden, and output layers with appropriate dimensions**{record_delimiter}**Understanding Activation Functions{tuple_delimiter}What Activation Functions exists**{record_delimiter}**Definition Loss Function{tuple_delimiter}Find the definition of the loss function suitable for image classification task**{record_delimiter}**Parameters{tuple_delimiter}Search for the parameters of the neural network`,
			question: JSON.stringify({
				Content: lastWords,
				context: sideHelp.context || "",
				currentQuery: sideHelp.currentTask || ""
			})
		});

		try {
			// Split response into individual subtask strings
			const subtaskStrings = subTasksAnalysis.split("**{record_delimiter}**");

			// Convert to subtask objects
			const newSubTasks = subtaskStrings.map(subtaskStr => {
				const [taskName, taskDescription] = subtaskStr.split("{tuple_delimiter}");
				if (!taskName || !taskDescription) {
					throw new Error("Invalid subtask format");
				}
				return {
					taskName: taskName.trim(),
					taskDescription: taskDescription.trim(),
					isActive: true,
					isProcessed: false
				};
			});

			// Validate number of subtasks
			if (!Array.isArray(newSubTasks) || newSubTasks.length > 5) {
				throw new Error("Invalid subtasks format or too many subtasks");
			}

			// Update the sideHelp with new subtasks
			await ctx.runMutation(api.sideHelps.updateSideHelp, {
				sideHelpId: args.sideHelpId,
				currentTask: sideHelp.currentTask || "",
				subTasks: newSubTasks
			});

			return true;
		} catch (error) {
			console.error("Failed to parse or validate subtasks:", error);
			return false;
		}
	}
});

export const syncSideHelp = action({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args): Promise<boolean> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		try {
			// Step 1: Update context
			const newContext = await ctx.runAction(api.llm.updateContext, {
				documentId: args.documentId
			});

			// Get sideHelp after context update
			const sideHelp: Doc<"sideHelps"> = await ctx.runQuery(api.sideHelps.getSideHelpByDocumentId, {
				documentId: args.documentId
			});
			if (!sideHelp) throw new Error("Side help not found");

			// Step 2: Update current task
			const taskUpdated = await ctx.runAction(api.llm.updateCurrentTask, {
				sideHelpId: sideHelp._id
			});

			if (taskUpdated) {
				// Step 3: Update active subtasks if task was updated
				const subTasksUpdated = true;
				// create a new subtask with only one query using the new task
				
				
				// const subTasksUpdated = await ctx.runAction(api.llm.updateActiveSubTasks, {
				// 	sideHelpId: sideHelp._id
				// });

				if (subTasksUpdated) {

					// Step 4: Process each subtask with local and global knowledge fetching

					await ctx.runAction(api.llm.fetchSHLocalRelevantKD, {
						sideHelpId: sideHelp._id,
					});

					await ctx.runAction(api.llm.fetchSHRelevantKD, {
						sideHelpId: sideHelp._id
					});
					
				}

				await ctx.runAction(api.sideHelps.processSHRelevantKnowledge, {
					sideHelpId: sideHelp._id
				});
			}

			return true;
		} catch (error) {
			console.error("Error in syncSideHelp:", error);
			return false;
		}
	}
});

export const fetchConceptDescription = action({
	args: {
		conceptId: v.id("concepts")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const concept = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});
		if (!concept) throw new Error("Concept not found");

		// get all updated knowledge data
		const updatedKnowledgeDatas = await ctx.runQuery(api.knowledgeDatas.getUpdatedKDbyConceptId, {
			conceptId: args.conceptId
		});

		// put all knowledges into a string
		const knowledgeString = updatedKnowledgeDatas.map(kd => kd.knowledge).join("\n");

		const description = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given the old concept definition (maybe empty or outdated) and a list of newly introduced knowledges about the concept, decide if the concept definition is outdated and needs to be updated, if so, generate a new definition for the concept.

			-Steps-
			You should analyze:
			1. The old concept definition
			2. The list of newly introduced knowledges about the concept
			3. Decide if the knowledges have significant impact on the concept definition.
			4. If so, update the concept definition considering the new knowledges.

			-Response Format-
			Return the new concept definition, do not include any other information.
			if there is no change, return exactly "**no change needed**"
			`,
			question: JSON.stringify({
				oldDefinition: concept.description,
				newKnowledges: knowledgeString
			})
		});

		if (description.includes("**no change needed**")) {
			return true;
		}

		await ctx.runAction(api.concepts.updateConcept, {
			conceptId: args.conceptId,
			description: description
		});

		return true;
	}
});