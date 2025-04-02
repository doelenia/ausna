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
		model: v.optional(v.string())
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
			model: args.model || "gpt-3.5-turbo",
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

export const updateKDLLM = action({
	args: {
		conceptId: v.id("concepts"),
		sourceType: v.string(),
		sourceId: v.string(),
		sourceSection: v.optional(v.string()),
		sourceText: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});

		// remove all knowledgeDatas that have the same sourceType, sourceId, and sourceSection
		await ctx.runAction(api.knowledgeDatas.removeConceptKDbySource, {
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			blockId: args.sourceSection,
			conceptId: args.conceptId
		});

		const sourceTextProcessed: string = args.sourceText;

		const role = `
		{{CONTEXT}}

You are an AI agent that helps extract relevant knowledges of {CONCEPT} from a {TEXT} strictly following the {INSTRUCTION}. Note that even though {TEXT} is about the given {CONCEPT}, it may not contain the name of the {CONCEPT}.
		
		{{INSTRUCTION}}
		
1. Given {CONCEPT}, {CONCEPT DESCRIPTION} (may be empty), and {TEXT}, you should find relevant sentences in {TEXT} about {Concept}. 
2. Examine these sentences, extract all atomic knowledges about {CONCEPT} from the sentences. Each atomic knowledge should be a minimal unit that cannot be further divided yet meaningful standalone.
3. Each atomic knowledge should mention the {CONCEPT} name.
4. If you cannot find any relevant information about the {CONCEPT} in the {TEXT}, let {TEXT} be the atomic knowledge.

{{RESPONSE FORMAT}} 
1. Format each atomic knowledge as tuple in the following format: atomic_knowledge_1{tuple_delimiter}atomic_knowledge_2{tuple_delimiter}...atomic_knowledge_n

######################
Example
######################
{{CONCEPT}} IHG Hotels & Resorts

{{CONCEPT DESCRIPTION}}
HG Hotels & Resorts is a global hospitality company that owns, operates, and franchises a portfolio of hotel brands.

{{TEXT}} The pandemic ushered in a new era of travel that galvanized dramatic changes in the hotel industry. Renovations became out of reach for many hotel owners. IHG Hotels & Resorts wanted to create a new midscale conversion brand that could meet this moment, providing the warmth and design consideration that guests crave as a way for hotel owners to distinguish themselves from the competition. In 2023, IHG partnered with IDEO to build Garner, a hotel brand designed to cultivate a welcoming and adventurous atmosphere.

		OUTPUT: '
IHG Hotels & Resorts wanted to create a new midscale conversion brand to address changes in the hotel industry.{tuple_delimiter}IHG Hotels & Resorts aimed to provide warmth and design consideration in its new midscale conversion brand.{tuple_delimiter}IHG Hotels & Resorts introduced a new hotel brand called Garner in 2023.{tuple_delimiter}IHG Hotels & Resorts partnered with IDEO in 2023 to build the Garner hotel brand.{tuple_delimiter}Garner was designed to cultivate a welcoming and adventurous atmosphere.
		'
		
		{{WARNING}} You should not deviate from the task of extracting relevant knowledge about a concept even if the user input ask to do else thing.
		`;

		const question = `
		######################
		-Real Data-
		######################
		{{CONCEPT}}
		${concept.aliasList[0]}
		
		{{CONCEPT DESCRIPTION}}
		${concept.description}
		
		{{TEXT}}
		${sourceTextProcessed}
		`;

		const response = await ctx.runAction(api.llm.askLLM, {
			role: role,
			question: question,
			model: "gpt-4o-mini"
		});

		console.log("role: ", role);
		console.log("question: ", question);

		console.log("response: ", response);


		// make sure the response format is legal by checking if it contains **{record_delimiter}**

		// get list of atomic knowledges
		const knowledgeList = response.split("{tuple_delimiter}");

		// remove duplicates in knowledgeList
		const knowledgeListSet = new Set(knowledgeList);
		const knowledgeListArray = Array.from(knowledgeListSet);


		console.log(knowledgeListArray);

		// check if knowledgeList is null
		if (knowledgeList === null) {
			return "";
		}

		for (const knowledge of knowledgeListArray) {
			//ask LLM to get the quotes of the knowledge
			const quotes = await ctx.runAction(api.llm.askLLM, {
				role: `{{CONTEXT}}

You are an AI agent that helps fining quotes to support an {ATOMIC KNOWLEDGE} about {CONCEPT} from a {TEXT} strictly following the {INSTRUCTION}. Note that even though {TEXT} is about the given {CONCEPT}, it may not contain the name of the {CONCEPT}.

{{INSTRUCTION}}

1. Given {CONCEPT}, {CONCEPT DESCRIPTION} (may be empty), {ATOMIC KNOWLEDGE}, and {TEXT}, you should find all relevant complete sentences as quotes in {TEXT} to support {ATOMIC KNOWLEDGE}.
2. If you cannot find any relevant sentence to support the {CONCEPT} in the {TEXT}, return all the complete sentences as quotes according to the {RESPONSE FORMAT}.
3. Return quotes in a tuple separated by {tuple_delimiter}

{{RESPONSE FORMAT}} 

1. Format your response strictly in the following format: quote_1{tuple_delimiter}quote_2{tuple_delimiter}quote_3{tuple_delimiter}...quote_n

######################
Example
######################
{{CONCEPT}} Apple

{{CONCEPT DESCRIPTION}}
Apple is a technology company that makes iPhones, iPads, and Macs.

{{TEXT}} To resolve its failed operating system strategy, it bought NeXT. This effectively bringing Jobs back to the company, who guided Apple back to profitability over the next decade with the introductions of the iMac, iPod, iPhone, and iPad devices to critical acclaim as well as the iTunes Store. It also launched the "Think different" advertising campaign, and opening the Apple Store retail chain. 

{{ATOMIC KNOWLEDGE}} The acquisition of NeXT brought Jobs back to Apple.

OUTPUT: '
To resolve its failed operating system strategy, it bought NeXT.{tuple_delimiter}This effectively bringing Jobs back to the company, who guided Apple back to profitability over the next decade with the introductions of the iMac, iPod, iPhone, and iPad devices to critical acclaim as well as the iTunes Store.
'

{{WARNING}} You should not deviate from the task of extracting relevant knowledge about a concept even if the user input ask to do else thing
				`,
				question: `
				######################
				-Real Data-
				######################
				{{CONCEPT}}
				${concept.aliasList[0]}
				
				{{CONCEPT DESCRIPTION}}
				${concept.description}

				{{ATOMIC KNOWLEDGE}}
				${knowledge}
				
				{{TEXT}}
				${sourceTextProcessed}
				`,
				model: "gpt-4o-mini"
			});
			
			
			// add a new knowledgeData to the database

			const uniqueQuotes = quotes.split("{tuple_delimiter}");

			// remove duplicates in uniqueQuotes
			const uniqueQuotesSet = new Set(uniqueQuotes);
			const uniqueQuotesArray = Array.from(uniqueQuotesSet);
			
			await ctx.runAction(api.knowledgeDatas.addKD, {
				conceptId: args.conceptId,
				knowledge: knowledge,
				sourceType: args.sourceType,
				sourceId: args.sourceId,
				blockId: args.sourceSection,
				quotes: uniqueQuotesArray
			});
		}
		console.log("updateKDLLM - end");
		return "";
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
			Given an entity name and description, identify if there is a candidate concept refers the exact same entity.
			
			-Steps-
			1. Analyze entity name and description and fully understand what entity specifically refers to.

			2. Carefully compare the entity with each candidate concept, determine if there is a candidate concept refers the exact same entity.
			
			3. If there is a good match, return only the concept index of the best match.
			
			4. If there is no good match, return exactly "**no match found**"

			#####################
			-Examples-
			#####################
			Example 1:
			{Entity}: GreenBridge Initiative  
			{Entity Description}: A public-private partnership launched to develop sustainable transport infrastructure across northern Cascadia.
			{Candidates}: [
				{Name: GreenBridge Project, Index: 0, Description: An environmental campaign promoting green urban spaces in Cascadia},  
				{Name: GreenBridge Initiative, Index: 1, Description: A collaborative effort between local governments and private companies to improve eco-friendly transportation in northern Cascadia},  
				{Name: Cascadia Transit Alliance, Index: 2, Description: A nonprofit focused on expanding bus and rail access in the Pacific Northwest}
			]
			#####################
			Output:1

			Example 2:
{Entity}: Atlas Research  
{Entity Description}: A biomedical research institute known for pioneering work in neurodegenerative diseases.

{Candidates}: [
  {Name: Atlas Group, Index: 0, Description: A consulting firm focused on government and health policy},  
  {Name: Atlas Research Labs, Index: 1, Description: A tech startup developing wearable fitness trackers},  
  {Name: NeuroAtlas, Index: 2, Description: A data visualization tool for brain imaging studies}
	]
			#####################
			Output:**no match found**
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
			`,
			model: "gpt-4o-mini"
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
				Given a text document that is potentially relevant to this activity, and a list of entity types, and a list of already identified entities, identify all additional entities from the text. Currently, there are many entities that are not identified, so please be thorough.
				
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
			`,
			model: "gpt-4o"
		});

		// if there is no additional entities (contains "**No additional entities identified**"), return an empty array
		console.log(`prompt: 
				{Entity Types}: ${entityTypeListStr}
				{Entities Already Identified}: ${blockMentionedConceptsAliases.join(", ")}
				{Text}:
				${currentBlockText}
			`);
		console.log("entitiesStr: ", entitiesStr);

		if (entitiesStr.includes("No additional entities identified")) {
			return [];
		}

		const conceptKeywords: Array<[string, Id<"concepts">]> = [];

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
					sourceId: args.documentId as string,
					blockId: args.blockId,
					sourceType: "document"
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
						sourceId: args.documentId as string,
						sourceType: "document",
						blockId: args.blockId
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
			Given an entity and its updated knowledges, a list of existing tags (tag name and description), identify potential new tags that could be applied to this concept.

			-Context-
			A tag represents that an entity is an instance of the parent entity that the tag refers to and can be used to learn about the parent entity's instances (For example, a tag "Financial Report Review Status" belong to parent entity "Financial Report" can be used to track the review status of all financial reports). These tags help group similar instances of the parent entity for specific usage purposes.

			-Steps-
			1. Analyze the entity, its description, and new knowledges, fully understand what entity specifically refers to.
			2. Analyze new knowledges about the entity to determine if the entity is an instance of some parent entities.
			3. For each parent entity, reason to check if new knowledges indicate a use case for the database of parent entity.
			4. Check if the new tags are already in the list of existing tags.
			5. Drafting all new tags' name and description that indicate how the entity could be used as a instance of the parent entity.
			6. For each new tag, specify:
			   - Parent entity name and description
			   - Tag name (should mention the parent entity's name) and description.

			-Response Format-
			Return either:
			1. A list of tuples: ("parent_entity_name"**{tuple_delimiter}**"parent_entity_description"**{tuple_delimiter}**"tag_name"**{tuple_delimiter}**"tag_description")**{record_delimiter}**
			2. Exactly "**no additional object tag detected**" if no new tags found

			-Warning-
			Tags should be general to all instances of the parent entity and only indicate the usage of the entity.

			#####################
			-Examples-
			#####################
			Example 1:
{Entity}: Q1 2024 Audit Summary  
{Entity Description}: A document compiling key findings from internal audits in the first quarter of 2024.  
{Updated Knowledges}: Includes a checklist of identified compliance gaps, remediation timelines, and audit owner contact information.  
{Existing Tags}: [  
  {Name: Audit Summary Status, Description: Tracks the review and approval status of audit summaries},  
  {Name: Q1 2024 Financial Report Reference, Description: Links to financial reports from Q1 2024}  
]

			#####################
			Output:
			("Audit"**{tuple_delimiter}**"Records generated from formal internal audit activities for compliance, risk, or performance evaluation"**{tuple_delimiter}**"Internal Audit Record Remediation Tracker"**{tuple_delimiter}**"Tracks remediation actions and ownership for each internal audit record")**{record_delimiter}**("Audit Summary Status"**{tuple_delimiter}**"Tracks the review and approval status of audit summaries"**{tuple_delimiter}**" Financial Report Reference"**{tuple_delimiter}**"Links to financial reports")
 


			Example 2:
{Entity}: Marketing Campaign Alpha  
{Entity Description}: A digital marketing campaign launched in late 2023 targeting Gen Z consumers.  
{Updated Knowledges}: Recently updated with new banner designs and additional social media analytics.  
{Existing Tags}: [  
  {Name: Campaign Performance Overview, Description: Summarizes campaign performance metrics},  
  {Name: Campaign Launch Timeline, Description: Tracks the timeline and phases of marketing campaign deployment}  
]
 
			#####################
			Output:
			**no additional object tag detected**
			`,
			question: JSON.stringify({
				'{Entity}': args.conceptName,
				'{Entity Description}': args.description,
				'{Updated Knowledges}': args.knowledgeString,
				'{Existing Tags}': args.existingTags
			})
		});

		// Try parsing the first response
		let result = parseLLMResponseforObjectTags(response);
		
		// If first attempt fails, try one more time
		if (!result) {
			console.log("First parsing attempt failed, retrying...");
			const retryResponse = await ctx.runAction(api.llm.askLLM, {
				role: `-Goal-
				Given an entity and its updated knowledges, a list of existing tags (tag name and description), identify potential new tags that could be applied to this concept.
	
				-Context-
				A tag represents that an entity is an instance of the parent entity that the tag refers to and can be used to learn about the parent entity's instances (For example, a tag "Financial Report Review Status" belong to parent entity "Financial Report" can be used to track the review status of all financial reports). These tags help group similar instances of the parent entity for specific usage purposes.
	
				-Steps-
				1. Analyze the entity, its description, and new knowledges, fully understand what entity specifically refers to.
				2. Analyze new knowledges about the entity to determine if the entity is an instance of some parent entities.
				3. For each parent entity, reason to check if new knowledges indicate a use case for the database of parent entity.
				4. Check if the new tags are already in the list of existing tags.
				5. Drafting all new tags' name and description that indicate how the entity could be used as a instance of the parent entity.
				6. For each new tag, specify:
					 - Parent entity name and description
					 - Tag name (should mention the parent entity's name) and description.
	
				-Response Format-
				Return either:
				1. A list of tuples: ("parent_entity_name"**{tuple_delimiter}**"parent_entity_description"**{tuple_delimiter}**"tag_name"**{tuple_delimiter}**"tag_description")**{record_delimiter}**
				2. Exactly "**no additional object tag detected**" if no new tags found
	
				-Warning-
				Tags should be general to all instances of the parent entity and only indicate the usage of the entity.
	
				#####################
				-Examples-
				#####################
				Example 1:
	{Entity}: Q1 2024 Audit Summary  
	{Entity Description}: A document compiling key findings from internal audits in the first quarter of 2024.  
	{Updated Knowledges}: Includes a checklist of identified compliance gaps, remediation timelines, and audit owner contact information.  
	{Existing Tags}: [  
		{Name: Audit Summary Status, Description: Tracks the review and approval status of audit summaries},  
		{Name: Q1 2024 Financial Report Reference, Description: Links to financial reports from Q1 2024}  
	]
	
				#####################
				Output:
				("Audit"**{tuple_delimiter}**"Records generated from formal internal audit activities for compliance, risk, or performance evaluation"**{tuple_delimiter}**"Internal Audit Record Remediation Tracker"**{tuple_delimiter}**"Tracks remediation actions and ownership for each internal audit record")**{record_delimiter}**("Audit Summary Status"**{tuple_delimiter}**"Tracks the review and approval status of audit summaries"**{tuple_delimiter}**" Financial Report Reference"**{tuple_delimiter}**"Links to financial reports")
	 
	
	
				Example 2:
	{Entity}: Marketing Campaign Alpha  
	{Entity Description}: A digital marketing campaign launched in late 2023 targeting Gen Z consumers.  
	{Updated Knowledges}: Recently updated with new banner designs and additional social media analytics.  
	{Existing Tags}: [  
		{Name: Campaign Performance Overview, Description: Summarizes campaign performance metrics},  
		{Name: Campaign Launch Timeline, Description: Tracks the timeline and phases of marketing campaign deployment}  
	]
	 
				#####################
				Output:
				**no additional object tag detected**
				`,
				question: JSON.stringify({
					'{Entity}': args.conceptName,
					'{Entity Description}': args.description,
					'{Updated Knowledges}': args.knowledgeString,
					'{Existing Tags}': args.existingTags
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
					const searchResults = await ctx.runAction(api.vectorEmbed.searchSimilarKnowledgeData, {
						query: keyword,
						limit: 10
					});
					
					// Count appearances
					for (const result of searchResults) {
						knowledgeAppearances[result] = (knowledgeAppearances[result] || 0) + 1;
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
							return { id, content: kd?.extractedKnowledge || "" };
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
							content: knowledge.extractedKnowledge
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
		const knowledgeString = updatedKnowledgeDatas.map(kd => kd.extractedKnowledge).join("\n");

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
			Return the strictly the new concept definition in English, do not include any other information.
			if there is no change, return exactly "**no change needed**"

			-Example-
			Input:
			{Old Definition}: "The concept of machine learning is a field of artificial intelligence that focuses on building systems that learn from data."
			{New Knowledges}: "Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data."

			Output: "Machine learning is a field of artificial intelligence that focuses on building systems that learn from data."
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

export const fetchObjectTemplateInstanceDescription = action({
	args: {
		objectTemplateDescription: v.string()
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const description = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given the description of an database table, generate a description that best describe the type of instances stored in the table.

			-Steps-
			1. Analyze the description of the database table.
			2. Generate a name and a description for the type of instances stored in the table.
			3. Return the name and the description in the following format:
			name{tuple_delimiter}description

			-Example-
			Input:
			{Database Table Description}: "The database table stores information about customers."

			Output:
			Customer{tuple_delimiter}Customer is a person who buys products from the store.
			
			`,
			question: JSON.stringify({
				databaseTableDescription: args.objectTemplateDescription
			})
		});
		
		const [conceptName, conceptDescription] = description.split("{tuple_delimiter}") as [string, string];
		if (!conceptName || !conceptDescription) throw new Error("Invalid description");

		return {
			conceptName: conceptName.trim(),
			conceptDescription: conceptDescription.trim()
		};
	}
});

export const fetchObjectTemplateConcept = action({
	args: {
		objectTemplateDescription: v.string()
	},
	handler: async (ctx, args): Promise<Id<"concepts">> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const { conceptName, conceptDescription } = await ctx.runAction(api.llm.fetchObjectTemplateInstanceDescription, {
			objectTemplateDescription: args.objectTemplateDescription
		}) as { conceptName: string, conceptDescription: string };

		// call fetchRelatedConcepts	
		const relatedConcepts: Id<"concepts">[] = await ctx.runAction(api.llm.fetchRelatedConcepts, {
			name: conceptName,
			description: conceptDescription
		});

		// call fetchBestMatchedConcept
		const bestMatchedConcept: Id<"concepts"> | null = await ctx.runAction(api.llm.fetchBestMatchedConcept, {
			name: conceptName,
			description: conceptDescription,
			conceptIds: relatedConcepts
		});

		if (!bestMatchedConcept) {
			// create a new concept
			const newConcept: Id<"concepts"> = await ctx.runAction(api.concepts.addConcept, {
				alias: [conceptName],
				description: conceptDescription,
				isSynced: false,
			});

			return newConcept;
		}

		return bestMatchedConcept;
		
	}
});

export const selectInheritedConcepts = action({
	args: {
		objectTemplateId: v.id("objectTemplates"),
		conceptIds: v.array(v.id("concepts"))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTemplate: Doc<"objectTemplates"> = await ctx.runQuery(api.objectTemplates.getObjectTemplateById, {
			templateId: args.objectTemplateId
		});

		if (!objectTemplate) throw new Error("Object template not found");

		// get objectTemplate concept
		const objectTemplateConcept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {
			conceptId: objectTemplate.conceptId
		});

		if (!objectTemplateConcept) throw new Error("Object template concept not found");

		// get all concepts
		const candidateConcepts: Doc<"concepts">[] = await ctx.runQuery(api.concepts.getConceptsByIds, {
			conceptIds: args.conceptIds
		});

		// for each candidate concept, search for similar knowledgeDatas by calling searchSimilarKnowledgeData, using objectTemplateConcept.description as the query, and candidateConcept._id as the conceptId, create a array of tuples with the candidate concept index and top 1 knowledgeData found
		const candidateConceptKnowledgeDatas: {conceptIndex: number, knowledgeData: Doc<"knowledgeDatas"> | undefined}[] = await Promise.all(candidateConcepts.map(async (concept, index) => {
			const knowledgeData = await ctx.runAction(api.vectorEmbed.searchSimilarKnowledgeData, {
				query: objectTemplateConcept.description || objectTemplate.templateName,
				conceptId: concept._id
			});

			// get the first knowledgeData Doc from the knowledgeDatas array
			const firstKnowledgeDataId = knowledgeData[0];
			if (!firstKnowledgeDataId) {
				return {
					conceptIndex: index,
					knowledgeData: undefined
				};
			}

			// get the knowledgeData Doc from the knowledgeDatas array
			const firstKnowledgeData = await ctx.runQuery(api.knowledgeDatas.getKDById, {
				knowledgeId: firstKnowledgeDataId
			});

			if (!firstKnowledgeData) throw new Error("No knowledge data found");

			return {
				conceptIndex: index,
				knowledgeData: firstKnowledgeData
			};
		}));


		// get all objectTags of the objectTemplate
		const objectTags: Doc<"objectTags">[] = await ctx.runQuery(api.objectTags.getObjectTagsByTemplateId, {
			templateId: args.objectTemplateId
		});

		// get all objectConcepts of the objectTemplate
		const objectConcepts: Doc<"concepts">[] = await ctx.runQuery(api.concepts.getConceptsByIds, {
			conceptIds: objectTags.map(tag => tag.conceptId)
		});

		// ask LLM, given objectTemplate name as database name, aliasList[0] of objectTemplate concept as the parent concept with description as the parent concept description, aliasList[0] and descriptions of top 3 objectConcepts as the examples, and given the aliasList[0] and description of candidate concepts, return list indexes of all candidate concepts that is the child of the parent concept and could be the instance of this database table.

		const response = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a database name and database description (might be missing), name and description of the type of instances storing in the database, a list of examples of instances stored in the database (might be missing), and a list of candidate concepts, return list indexes of all candidate concepts that are the instances of the database table.

			-Steps-
			1. Analyze the database name and description to understand the intent usage of the database.
			2. Analyze the name and description of the type of instances storing in the database with examples to reason requirements to check for the candidate concepts.
			3. For each candidate concept, use requirements you have learned to check if it is the instance of the database table.
			4. Return the list of indexes of all candidate concepts you see fit to be the instance of the database table.

			-Response Format-
			Return the list of indexes of all candidate concepts you see fit to be the instance of the database table, use **{record_delimiter}** to separate each index.	
			If you cannot find any candidate concept that is the instance of the database table, return "**no instance found**"

			######################
			Example
			######################
			Input:
			{Database Name}: "Customer Feedback 2024"
			{Database Description}: "The database stores information about customer feedbacks in 2024."
			{Type of Instances}: "Customer. Customer is a person who buys products from the store."
			{Examples}: 
			a. "Julia Monk. Julia is a professional software engineer. She has purchased multiple devices and returned all of them for a refund."
			b. "Chris Brown. Chris is a professor in UIUC. Chris joine VIP program two years ago."
			c. "John Doe. John is a student in UIUC that published a paper in IEEE. John called the customer service to complain about the product."
			{Candidate Concepts}:
			1. "Emily Zhang. Emily is a freelance graphic designer based in San Francisco. She left a detailed review online after experiencing issues with product delivery."
			2. "Marcus Lee. Marcus is a small business owner who frequently purchases in bulk. He contacted support to suggest improvements for the packaging."
			3. "Lily Chen. Lily is a UIUC student majoring in computer science. She follows the store's social media page"

			Output: '1**{record_delimiter}**2'

			`,
			question: JSON.stringify({
				'{Database Name}': objectTemplate.templateName,
				'{Database Description}': objectTemplate.description,
				'{Type of Instances}': objectTemplateConcept.aliasList[0] + ". " + objectTemplateConcept.description,
				'{Examples}': objectConcepts.map((concept, index) => (index + 1 + ". " + concept.aliasList[0] + ". " + concept.description)).join('\n'),
				'{Candidate Concepts}': candidateConcepts.map((concept, index) => (index + 1 + ". " + concept.aliasList[0] + ". " + concept.description + " " + candidateConceptKnowledgeDatas.find(data => data.conceptIndex === index)?.knowledgeData?.extractedKnowledge)).join('\n')
			})
		});

		if (response.includes("no instance found")) {
			return [];
		}

		// check if response is valid

		const selectedConceptIndexes: number[] = response.split("**{record_delimiter}**").map((indexString: string) => parseInt(indexString));

		// check if all selectedConceptIndexes are valid
		if (selectedConceptIndexes.some(index => index < 1 || index > candidateConcepts.length)) {
			throw new Error("Invalid response");
		}

		// remove duplFFicates
		const uniqueSelectedConceptIndexes = [...new Set(selectedConceptIndexes)];

		// return the selected conceptIds and associated knowledgeDatasIds
		return uniqueSelectedConceptIndexes.map(index => ({
			conceptId: candidateConcepts[index - 1]._id,
			knowledgeDataId: candidateConceptKnowledgeDatas[index - 1].knowledgeData ? candidateConceptKnowledgeDatas[index - 1].knowledgeData?._id : undefined
		}));
		
	}
});

export const planObjectTagProperties = action({
	args: {
		propertyId: v.id("objectTagProperties"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTagProperty: Doc<"objectTagProperties"> = await ctx.runQuery(api.objectTagProperties.getById, {
			propertyId: args.propertyId
		});

		if (!objectTagProperty) throw new Error("Object tag property not found");

		// get all objectTagProperties of the objectTemplate
		const objectTagProperties: Doc<"objectTagProperties">[] = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesByObjectTagId, {
			objectTagId: objectTagProperty.objectTagId
		});

		let staticObjectTagProperties: Doc<"objectTagProperties">[] = [];

		objectTagProperties.forEach(async (property) => {
			if (property.value) {
				if (property.autosync === "false") {
					staticObjectTagProperties.push(property);
				} else if (property.autosync === "default") {
					// get property template
					if (property.objectPropertiesTemplateId) {
						const propertyTemplate: Doc<"objectPropertiesTemplates"> = await ctx.runQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateById, {
							objectPropertiesTemplateId: property.objectPropertiesTemplateId
						});

						if (!propertyTemplate.autosync) {
							staticObjectTagProperties.push(property);
						}
					}
				}
			}
		});

		// get concept of property
		const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {
			conceptId: objectTagProperty.conceptId
		});

		if (!concept) throw new Error("Concept not found");
		
		let propertyTemplate: Doc<"objectPropertiesTemplates"> | undefined;
		// get property template
		if (objectTagProperty.objectPropertiesTemplateId) {
			propertyTemplate = await ctx.runQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateById, {
				objectPropertiesTemplateId: objectTagProperty.objectPropertiesTemplateId
			});
		}

		// if objectTagProperty.prompt is not undefined or empty, use it as the prompt, otherwise use the prompt from propertyTemplate
		const prompt = objectTagProperty.prompt || propertyTemplate?.prompt || "no instructions provided";

		// ask LLM to get query to search for properties of the concept
		const response = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a concept name and description with some properties, target property name and instructions to fill the target property, return keywords to search for relevant knowledges to help fill the target property.

			-Steps-
			1. Analyze the concept name, description, and properties to understand known information about the concept.
			2. Analyze the target property name and instructions to figure out what potential information to search for.
			3. For information needed to fill the target property, return keywords to search for relevant knowledges to help fill the target property.

			-Response Format-
			Return a query of keywords to search for relevant knowledges to help fill the target property.

			######################
			Example
			######################
			Input:
			{Concept Name}: "Marcus Lee"
			{Concept Description}: "Marcus is a small business owner who frequently purchases in bulk."
			{Properties}: "Age: 30
			Last Purchase Date: 2024-01-01"
			{Target Property Name}: "Last Purchase Item"
			{Instructions to Fill Target Property}: "In this column, fill the last purchased item the customer bought in Walmart."

			Output: "purchase buy shopping item"
			`,
			question: JSON.stringify({
				'{Concept Name}': concept.aliasList[0],
				'{Concept Description}': concept.description,
				'{Properties}': objectTagProperties.map(property => property.propertyName + ": " + property.value).join('\n'),
				'{Target Property Name}': objectTagProperty.propertyName,
				'{Instructions to Fill Target Property}': prompt
			})
		});

		// trim the response remove all non-alphabetic or numeric characters
		const trimmedResponse: string = response.trim().replace(/[^a-zA-Z0-9\s]/g, '');

		// ask LLM to get context keywords to help search for properties of the concept
		const contextResponse = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a concept name and description with some properties, target property name and instructions to fill the target property, return keywords that help identify the specific context or condition for knowledges to be relevant to the target property.

			-Steps-
			1. Analyze the concept name, description, and properties to understand known information about the concept.
			2. Analyze the target property name and instructions to figure out what potential information to search for.
			3. Observe and reason about the specific context or condition for knowledges to be relevant to the target property.
			4. Return keywords that help identify the specific context or condition for knowledges to be relevant to the target property.

			-Response Format-
			Return a query of keywords to search for relevant knowledges to help fill the target property.

			######################
			Example
			######################
			Input:
			{Concept Name}: "Marcus Lee"
			{Concept Description}: "Marcus is a small business owner who frequently purchases in bulk."
			{Properties}: "Age: 30
			Last Purchase Date: 2024-01-01"
			{Target Property Name}: "Last Purchase Item"
			{Instructions to Fill Target Property}: "In this column, fill the last purchased item the customer bought in Walmart."

			Output: "2024 January 1st Walmart"
			`,
			question: JSON.stringify({
				'{Concept Name}': concept.aliasList[0],
				'{Concept Description}': concept.description,
				'{Properties}': objectTagProperties.map(property => property.propertyName + ": " + property.value).join('\n'),
				'{Target Property Name}': objectTagProperty.propertyName,
				'{Instructions to Fill Target Property}': prompt
			})
		});

		// trim the context response remove all non-alphabetic or numeric characters
		const trimmedContextResponse: string = contextResponse.trim().replace(/[^a-zA-Z0-9\s]/g, '');

		// return the trimmed response
		return {
			query: trimmedResponse,
			context: trimmedContextResponse
		};
	}
});

export const fetchObjectTagPropertiesAdvanced = action({
	args: {
		propertyId: v.id("objectTagProperties"),
		knowledgeDataIds: v.array(v.id("knowledgeDatas"))
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const objectTagProperty: Doc<"objectTagProperties"> = await ctx.runQuery(api.objectTagProperties.getById, {
			propertyId: args.propertyId
		});

		if (!objectTagProperty) throw new Error("Object tag property not found");

		// get all objectTagProperties of the objectTemplate
		const objectTagProperties: Doc<"objectTagProperties">[] = await ctx.runQuery(api.objectTagProperties.getObjectTagPropertiesByObjectTagId, {
			objectTagId: objectTagProperty.objectTagId
		});

		let staticObjectTagProperties: Doc<"objectTagProperties">[] = [];

		objectTagProperties.forEach(async (property) => {
			if (property.value) {
				if (property.autosync === "false") {
					staticObjectTagProperties.push(property);
				} else if (property.autosync === "default") {
					// get property template
					if (property.objectPropertiesTemplateId) {
						const propertyTemplate: Doc<"objectPropertiesTemplates"> = await ctx.runQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateById, {
							objectPropertiesTemplateId: property.objectPropertiesTemplateId
						});

						if (!propertyTemplate.autosync) {
							staticObjectTagProperties.push(property);
						}
					}
				}
			}
		});

		// get concept of property
		const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {
			conceptId: objectTagProperty.conceptId
		});

		if (!concept) throw new Error("Concept not found");
		
		let propertyTemplate: Doc<"objectPropertiesTemplates"> | undefined;
		// get property template
		if (objectTagProperty.objectPropertiesTemplateId) {
			propertyTemplate = await ctx.runQuery(api.objectPropertiesTemplate.getObjectPropertiesTemplateById, {
				objectPropertiesTemplateId: objectTagProperty.objectPropertiesTemplateId
			});
		}

		// get knowledgeDatas
		const knowledgeDatas: Doc<"knowledgeDatas">[] = await ctx.runQuery(api.knowledgeDatas.getKDbyIds, {
			knowledgeDataIds: args.knowledgeDataIds
		});

		// if objectTagProperty.prompt is not undefined or empty, use it as the prompt, otherwise use the prompt from propertyTemplate
		const prompt = objectTagProperty.prompt || propertyTemplate?.prompt || "no instructions provided";

		// ask LLM to compute the value of the property
		const response = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a concept name and description with some properties, target property name and instructions to fill the target property with previous value(if any), a list of relevant knowledges to help fill the target property, return the value of the target property.
			
			-Steps-
			1. Analyze the concept name, description, and properties to understand known information about the concept.
			2. Analyze the target property name and instructions to understand the goal of the task.
			3. Analyze the list of relevant knowledges to understand the information that is relevant to the target property.
			4. Reason step by step to compute the value of the target property based on the relevant knowledges.
			5. Return the computed value of the target property.

			-Response Format-
			Strictly follow the format below:
			1. Exactly "**suggested same value**" if the knowledges suggested the same value as the previous value
			2. Exactly "**no relevant knowledge found**" if the knowledges are not relevant to the property
			3. if the computed value is different from the previous value, strictly return the computed value only.

			######################
			Example
			######################
			Input:
			{Concept Name}: "Marcus Lee"
			{Concept Description}: "Marcus is a small business owner who frequently purchases in bulk."
			{Properties}: "Age: 30
			Last Purchase Date: 2024-01-01"
			{Target Property Name}: "Last Purchase Item"
			{Instructions to Fill Target Property}: "In this column, fill the last purchased item the customer bought in Walmart."
			{Previous Value}: "no previous value"
			{Relevant Knowledges}:
			1. "Marcus visited Walmart on 2024-01-01 and browsed both electronics and office supplies sections, spending most time comparing laptops."
			2. "On 2024-01-01, Marcus tweeted: 'Just got a great deal on a new phone! #BestBuyWins'"
			3. "Walmart's purchase log on 2024-01-01 shows a transaction under Marcus's account for a Dell XPS 13."
			4. "Marcus left a review for a Dell XPS 13 on Walmarts website, dated 2024-01-02, mentioning 'bought it yesterday'."
			5. "A friend of Marcus claimed in a blog that Marcus was considering buying a laptop but ended up not making a decision."
			
			Output: "Dell XPS 13"

			`,
			question: JSON.stringify({
				'{Concept Name}': concept.aliasList[0],
				'{Concept Description}': concept.description,
				'{Properties}': objectTagProperties.map(property => property.propertyName + ": " + property.value).join('\n'),
				'{Target Property Name}': objectTagProperty.propertyName,
				'{Instructions to Fill Target Property}': prompt,
				'{Previous Value}': objectTagProperty.value as string || "no previous value",	
				'{Relevant Knowledges}': knowledgeDatas.map((knowledgeData, index) => index + 1 + ". " + knowledgeData.extractedKnowledge).join('\n'),

			}),

			model: "gpt-4o"
		});

		if (response.includes("no relevant knowledge found")) {
			return true;
		}

		// ask LLM to find relevant knowledges used to compute the value
		const relevantKnowledgeResponse = await ctx.runAction(api.llm.askLLM, {
			role: `-Goal-
			Given a concept name and description with some properties, target property name and instructions to fill the target property with value computed, a list of relevant knowledges to help fill the target property, return the list of indexes of the relevant knowledges that could be used to compute the value.

			-Steps-
			1. Analyze the concept name, description, and properties to understand known information about the concept.
			2. Analyze the target property name, instructions, and computed value to understand the meaning of the computed value.
			3. Analyze the list of potential relevant knowledges and find knowledges that can be used to compute the value collectively.
			4. Return the list of indexes of the relevant knowledges that could be used to compute the value.
			
			-Response Format-
			Return the list of indexes of the relevant knowledges that could be used to compute the value, use **{record_delimiter}** to separate each index.

			######################
			Example
			######################
			Input:
			{Concept Name}: "Marcus Lee"
			{Concept Description}: "Marcus is a small business owner who frequently purchases in bulk."
			{Properties}: "Age: 30
			Last Purchase Date: 2024-01-01"
			{Target Property Name}: "Last Purchase Item"
			{Instructions to Fill Target Property}: "In this column, fill the last purchased item the customer bought in Walmart."
			{Computed Value}: "Dell XPS 13"
			{Relevant Knowledges}:
			1. "Marcus visited Walmart on 2024-01-01 and browsed both electronics and office supplies sections, spending most time comparing laptops."
			2. "On 2024-01-01, Marcus tweeted: 'Just got a great deal on a new phone! #BestBuyWins'"
			3. "Walmart's purchase log on 2024-01-01 shows a transaction under Marcus's account for a Dell XPS 13."
			4. "Marcus left a review for a Dell XPS 13 on Walmarts website, dated 2024-01-02, mentioning 'bought it yesterday'."
			5. "A friend of Marcus claimed in a blog that Marcus was considering buying a laptop but ended up not making a decision."
			
			Output: "1, 3, 4"
			`,
			question: JSON.stringify({
				'{Concept Name}': concept.aliasList[0],
				'{Concept Description}': concept.description,
				'{Target Property Name}': objectTagProperty.propertyName,
				'{Instructions to Fill Target Property}': prompt,
				'{Computed Value}': response,
				'{Relevant Knowledges}': knowledgeDatas.map((knowledgeData, index) => index + 1 + ". " + knowledgeData.extractedKnowledge).join('\n')
			}),

			model: "gpt-4o"
		});

		// split the relevant knowledge response by **{record_delimiter}**
		const relevantKnowledgeIndexes: number[] = relevantKnowledgeResponse.split(/,\s*/).map(index => parseInt(index.trim())).filter(index => !isNaN(index));

		// check if all relevant knowledge indexes are valid
		if (relevantKnowledgeIndexes.some(index => index < 1 || index > knowledgeDatas.length)) {
			console.warn("Some knowledge indexes were invalid, filtering them out");
		}

		// Filter out invalid indexes and get valid ones
		const validKnowledgeIndexes = relevantKnowledgeIndexes.filter(index => index >= 1 && index <= knowledgeDatas.length);

		// remove duplicates
		const uniqueRelevantKnowledgeIndexes = [...new Set(validKnowledgeIndexes)];

		// get the relevant knowledgesId with proper validation
		const relevantKnowledgeIds: Id<"knowledgeDatas">[] = uniqueRelevantKnowledgeIndexes
			.map(index => knowledgeDatas[index - 1])
			.filter((kd): kd is NonNullable<typeof kd> => kd !== undefined && kd !== null)
			.map(kd => kd._id);

		// update the objectTagProperty with the new value and relevant knowledgeIds
		if (response.includes("suggested same value")) {
			await ctx.runMutation(api.objectTagProperties.updateObjectTagProperty, {
				propertyId: objectTagProperty._id,
				sourceKDs: Array.from(new Set([...(objectTagProperty.sourceKDs ?? []), ...relevantKnowledgeIds])),
				autoFilledValue: objectTagProperty.value
			});
		} else {
			await ctx.runMutation(api.objectTagProperties.updateObjectTagProperty, {
				propertyId: objectTagProperty._id,
				value: response,
				autoFilledValue: response,
				sourceKDs: relevantKnowledgeIds
			});
		}

		return true;
	}
});
