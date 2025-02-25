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
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;

		const concept: Doc<"concepts"> = await ctx.runQuery(api.concepts.getById, {conceptId: args.conceptId});

		const sourceDoc: Doc<"documents"> = await ctx.runQuery(api.documents.getById, {documentId: args.sourceId});

		const blockTextProcessed: string = await ctx.runAction(api.documents.getBlockTextFromBlock, { block: args.blockText });

		const role = `
		{{CONTEXT}}

		You are an AI agent that helps extract relevant knowledge of {CONCEPT} from a {TEXT}. Note that even though {TEXT} is about the given {CONCEPT}, it may or may not contain the name of the {CONCEPT}.
		
		{{INSTRUCTION}}
		
		Given {CONCEPT}, {CONCEPT DESCRIPTION} (may be empty), and {TEXT}, you should write a concise sentence using wording and writing styles of {TEXT} if possible, that describe what knowledge of {CONCEPT} is implied from the {TEXT}. 
		
		{{RESPONSE FORMAT}} You should return only strictly the sentence you wrote about the {CONCEPT}, with no additional string before or after the sentence.
		
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