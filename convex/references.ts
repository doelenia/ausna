/* trunk-ignore-all(prettier) */
import {v} from "convex/values";

import {mutation, query, action} from "./_generated/server";
import {Doc, Id} from "./_generated/dataModel";

export const removeAllRef = action({
	args: {
		knowledgeId: v.id("knowledgeDatas"),
	},

	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}
		return identity;
	}
});