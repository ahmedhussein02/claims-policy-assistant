import OpenAI from "openai";
import { AzureKeyCredential, SearchClient } from "@azure/search-documents";
import { config } from "../config";

let openai: OpenAI | undefined;
/** Shared OpenAI client: bounded wait + limited retries so a slow upstream can't hang a chat request. */
export function getOpenAI(): OpenAI {
  openai ??= new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 20_000, maxRetries: 2 });
  return openai;
}

export interface PolicyChunkDoc {
  id: string;
  documentId: string;
  documentTitle: string;
  sourceFile: string;
  section: string;
  chunkIndex: number;
  content: string;
  contentVector?: number[];
}

let search: SearchClient<PolicyChunkDoc> | undefined;
export function getSearchClient(): SearchClient<PolicyChunkDoc> {
  search ??= new SearchClient<PolicyChunkDoc>(config.SEARCH_ENDPOINT, config.SEARCH_INDEX_NAME, new AzureKeyCredential(config.SEARCH_API_KEY));
  return search;
}
