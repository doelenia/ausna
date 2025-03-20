import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";
import {api} from "../convex/_generated/api";

type SubTask = {
	taskName: string;
	taskDescription: string;
	isActive: boolean;
	isProcessed: boolean;
	relevantKnowledge: [Id<"knowledgeDatas">, number][];
}

export const createSideHelp = mutation({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const document = await ctx.db.get(args.documentId);
		if (!document) throw new Error("Document not found");

		const sideHelp = await ctx.db.insert("sideHelps", {
			documentId: args.documentId,
			context: document.content,
			currentTask: "",
			subTasks: [],
		});
	}	
});

export const deleteSideHelp = mutation({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const sideHelp = await ctx.db.query("sideHelps").filter(q => q.eq(q.field("documentId"), args.documentId)).first();
		if (!sideHelp) throw new Error("Side help not found");

		await ctx.db.delete(sideHelp._id);
	}
});

export const updateSideHelp = mutation({
	args: {
		sideHelpId: v.id("sideHelps"),
		currentTask: v.string(),
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
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");
		
		await ctx.db.patch(args.sideHelpId, {
			currentTask: args.currentTask,
			subTasks: args.subTasks,
		});
	}
});

export const updateSideHelpContext = mutation({
	args: {
		sideHelpId: v.id("sideHelps"),
		lastContextText: v.string(),
		context: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");
		
		await ctx.db.patch(args.sideHelpId, {
			lastContextText: args.lastContextText,
			context: args.context,
		});
	}
});

export const getSideHelpByDocumentId = query({
	args: {
		documentId: v.id("documents")
	},
	handler: async (ctx, args) : Promise<Doc<"sideHelps">> => {
		const sideHelps = await ctx.db.query("sideHelps").filter(q => q.eq(q.field("documentId"), args.documentId)).collect();
		return sideHelps[0];
	}
});

export const getSideHelpById = query({
	args: {
		sideHelpId: v.id("sideHelps")
	},
	handler: async (ctx, args) => {
		const sideHelp = await ctx.db.get(args.sideHelpId);
		if (!sideHelp) throw new Error("Side help not found");
		return sideHelp;
	}
});

export const processSHRelevantKnowledge = action({
	args: {
		sideHelpId: v.id("sideHelps")
	},
	handler: async (ctx, args) => {
		const sideHelp = await ctx.runQuery(api.sideHelps.getSideHelpById, {
			sideHelpId: args.sideHelpId
		});
		if (!sideHelp) throw new Error("Side help not found");
		

		const relevantKnowledgeSet = new Set<[Id<"knowledgeDatas">, number]>();
		for (const subTask of sideHelp.subTasks) {
			if (subTask.relevantKnowledge) {
				for (const relevantKnowledge of subTask.relevantKnowledge) {
					relevantKnowledgeSet.add([relevantKnowledge.knowledgeId, relevantKnowledge.confidence]);
				}
			}
		}

		// rank the relevant knowledges by confidence from highest to lowest
		const rankedRelevantKnowledge = Array.from(relevantKnowledgeSet).sort((a, b) => b[1] - a[1]);

		// for each knowledge, sourceId, sourceSection from knowledgeDatas, get the sourceTitle, and icon from sources
		const rankedRelevantKnowledgeWithSource = await Promise.all(rankedRelevantKnowledge.map(async (knowledge) => {
			const knowledgeData: Doc<"knowledgeDatas"> = await ctx.runQuery(api.knowledgeDatas.getKDById, {
				knowledgeId: knowledge[0]
			});
			if (!knowledgeData) throw new Error("Knowledge data not found");
			const source: Doc<"documents"> = await ctx.runQuery(api.documents.getById, {
				documentId: knowledgeData.sourceFile
			});
			if (!source) throw new Error("Source not found");
			return { id: knowledge[0], confidence: knowledge[1], knowledge: knowledgeData.knowledge, sourceId: source._id, sourceTitle: source.title, sourceIcon: source.icon, sourceType: source.type, sourceSection: knowledgeData.sourceSection };
		}));
		
		await ctx.runMutation(api.sideHelps.updateSHRelevantKnowledge, {
			sideHelpId: args.sideHelpId,
			relevantKnowledge: rankedRelevantKnowledgeWithSource
		});
	}
});

export const getSHInactiveSubTasks = action({
	args: {
		sideHelpId: v.id("sideHelps")
	},
	handler: async (ctx, args) => {
		const sideHelp = await ctx.runQuery(api.sideHelps.getSideHelpById, {
			sideHelpId: args.sideHelpId
		});
		if (!sideHelp) throw new Error("Side help not found");

		let inactiveSubTasks: SubTask[] = [];
		for (const subTask of sideHelp.subTasks) {
			if (!subTask.isActive) {
				inactiveSubTasks.push(subTask as unknown as SubTask);
			}
		}
		return inactiveSubTasks;
	}
});

export const updateSHRelevantKnowledge = mutation({
	args: {
		sideHelpId: v.id("sideHelps"),
		relevantKnowledge: v.array(v.object({
			id: v.id("knowledgeDatas"),
			confidence: v.number(),
			knowledge: v.optional(v.string()),
			sourceId: v.id("documents"),
			sourceTitle: v.string(),
			sourceIcon: v.optional(v.string()),
			sourceType: v.string(),
			sourceSection: v.optional(v.string()),
		})),
	},
	handler: async (ctx, args) => {
		const sideHelp = await ctx.runQuery(api.sideHelps.getSideHelpById, {
			sideHelpId: args.sideHelpId
		});
		if (!sideHelp) throw new Error("Side help not found");

		await ctx.db.patch(args.sideHelpId, {
			relevantKnowledge: args.relevantKnowledge
		});
	}
});

export const getSHRelevantKnowledge = query({
	args: {
		documentId: v.optional(v.id("documents"))
	},
	handler: async (ctx, args) => {
		if (args.documentId) {
			const sideHelp: Doc<"sideHelps"> = await ctx.runQuery(api.sideHelps.getSideHelpByDocumentId, {
				documentId: args.documentId
			});
			if (!sideHelp) throw new Error("Side help not found");
			return sideHelp.relevantKnowledge;
		} else {
			return;
		}
	}
});