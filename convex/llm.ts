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
				
				2. Return output in English as a single list of all the entities identified in steps 1. The format should be like this:
				[
				tuple_1, 
				tuple_2, 
				...
				]

				 
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
				[("entity"{tuple_delimiter}CENTRAL INSTITUTION{tuple_delimiter}ORGANIZATION{tuple_delimiter}The Central Institution is the Federal Reserve of Verdantis, which is setting interest rates on Monday and Thursday), 
				("entity"{tuple_delimiter}MARTIN SMITH{tuple_delimiter}PERSON{tuple_delimiter}Martin Smith is the chair of the Central Institution), 
				("entity"{tuple_delimiter}MARKET STRATEGY COMMITTEE{tuple_delimiter}ORGANIZATION{tuple_delimiter}The Central Institution committee makes key decisions about interest rates and the growth of Verdantis's money supply)]

				######################
				Example 2:
				{Entity Types}: ORGANIZATION
				{Already Identified Entities}: [Global Exchange, IPO, Semiconductor]
				{Text}:
				TechGlobal's (TG) stock skyrocketed in its opening day on the Global Exchange Thursday. But IPO experts warn that the semiconductor corporation's debut on the public markets isn't indicative of how other newly listed companies may perform.

				TechGlobal, a formerly public company, was taken private by Vision Holdings in 2014. The well-established chip designer says it powers 85% of premium smartphones.
				######################
				Output:
				[("entity"{tuple_delimiter}TECHGLOBAL{tuple_delimiter}ORGANIZATION{tuple_delimiter}TechGlobal is a stock now listed on the Global Exchange which powers 85% of premium smartphones), 
				("entity"{tuple_delimiter}VISION HOLDINGS{tuple_delimiter}ORGANIZATION{tuple_delimiter}Vision Holdings is a firm that previously owned TechGlobal)]
				`, // To be filled
			question: `
				{Entity Types}: ${entityTypeListStr}
				{Entities Already Identified}: ${blockMentionedConceptsAliases.join(", ")}
				{Text}:
				${blockText}
			`
		});

		const conceptKeywords: Array<[string, Id<"concepts">]> = [];
		const tuples = entitiesStr.split("), (").map(t => t.replace(/[()]/g, ""));

		for (const tuple of tuples) {
			const [entity, name, type, description] = tuple.split("{tuple_delimiter}");
			
			// Get synonyms for entity
			const synonymsStr = await ctx.runAction(api.llm.askLLM, {
				role: `-Goal-
				Given a text document that is potentially relevant to this activity and a entity, identify all possible synonyms or alternative names of the entity according to the text.
				
				-Steps-
				1. Identify all possible synonyms or alternative names of the entity according to the text context. Be thoughtful and creative.
				
				2. Return output in English as a single list of all the synonyms or alternative names identified in steps 1. The format should be like this:
				[
				synonym_1, 
				synonym_2, 
				...
				]
				3. Be sure to include the entity itself in the list.

				 
				######################
				-Examples-
				######################
				Example 1:
				{Entity}: Central Institution
				{Text}:
				The Verdantis's Central Institution is scheduled to meet on Monday and Thursday, with the institution planning to release its latest policy decision on Thursday at 1:30 p.m. PDT, followed by a press conference where Central Institution Chair Martin Smith will take questions. Investors expect the Market Strategy Committee to hold its benchmark interest rate steady in a range of 3.5%-3.75%.
				######################
				Output:
				[Central Institution, Federal Reserve, Institution]

				######################
				Example 2:
				{Entity}: TechGlobal
				{Text}:
				TechGlobal's (TG) stock skyrocketed in its opening day on the Global Exchange Thursday. But IPO experts warn that the semiconductor corporation's debut on the public markets isn't indicative of how other newly listed companies may perform.

				TechGlobal, a formerly public company, was taken private by Vision Holdings in 2014. The well-established chip designer says it powers 85% of premium smartphones.
				######################
				Output:
				[TechGlobal, TG, Semiconductor Corporation]
				`, // To be filled
				question: `${entity}, ${type}, ${description}`
			});
			
			// remove the first and last character of synonymsStr
			const synonyms = synonymsStr.slice(1, -1).split(",").map(s => s.trim());
			console.log(synonyms);

			// Search for matching concepts
			const matchingConcepts = new Set<Id<"concepts">>();
			for (const synonym of synonyms) {
				const concepts = await ctx.runQuery(api.concepts.searchConceptAlias, {
					userId: identity.subject,
					query: synonym
				});
				concepts.forEach(c => matchingConcepts.add(c._id));
			}

			let conceptId: Id<"concepts">;
			if (matchingConcepts.size === 0) {
				// Create new concept if no matches found
				conceptId = await ctx.runAction(api.concepts.addConcept, {
					alias: [name, ...synonyms],
					description: description,
					isSynced: false,
					sourceId: args.documentId
				});
			} else if (matchingConcepts.size === 1) {
				// Use the single matching concept
				conceptId = Array.from(matchingConcepts)[0];
			} else {
				// Ask LLM to choose best match
				const bestMatchStr = await ctx.runAction(api.llm.askLLM, {
					role: `-Goal-
					Given a text document that is potentially relevant to this activity and a entity, identify the best match concept from the list of candidates.
					
					-Steps-
					1. Identify the best match concept from the list of candidates.
					
					2. Return the concept id of the best match concept.

					######################
					-Examples-
					######################
					Example 1:
					{Entity List}: [{Name: Central Institution, ID: 1, Description: The Central Institution is the Federal Reserve of Verdantis, which is setting interest rates on Monday and Thursday}, {Name: Federal Reserve, ID: 2, Description: The Federal Reserve is the central bank of the United States}, {Name: Institution, ID: 3, Description: An institution is a group of people or organizations that share a common purpose}]
					{Text}: The Verdantis's Central Institution is scheduled to meet on Monday and Thursday, with the institution planning to release its latest policy decision on Thursday at 1:30 p.m. PDT, followed by a press conference where Central Institution Chair Martin Smith will take questions. Investors expect the Market Strategy Committee to hold its benchmark interest rate steady in a range of 3.5%-3.75%.
					######################
					Output:
					1
					`, // To be filled
					question: JSON.stringify({
						entity: entity,
						description: description,
						candidates: Array.from(matchingConcepts)
					})
				});
				conceptId = bestMatchStr as Id<"concepts">;
			}

			conceptKeywords.push([name, conceptId]);
		}

		return conceptKeywords;
	}
});