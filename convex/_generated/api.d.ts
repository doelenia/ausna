/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as concepts from "../concepts.js";
import type * as documents from "../documents.js";
import type * as knowledgeDatas from "../knowledgeDatas.js";
import type * as llm from "../llm.js";
import type * as objectTags from "../objectTags.js";
import type * as objectTemplates from "../objectTemplates.js";
import type * as references from "../references.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  concepts: typeof concepts;
  documents: typeof documents;
  knowledgeDatas: typeof knowledgeDatas;
  llm: typeof llm;
  objectTags: typeof objectTags;
  objectTemplates: typeof objectTemplates;
  references: typeof references;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
