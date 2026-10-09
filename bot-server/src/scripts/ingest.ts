/**
 * Policy ingestion: Blob Storage -> chunk -> embed (OpenAI) -> Azure AI Search index.
 *   npm run ingest -- --dry-run   # chunk only, no network calls
 *   npm run ingest                # full run (idempotent: safe to re-run)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import OpenAI from "openai";
import { BlobServiceClient } from "@azure/storage-blob";
import { AzureKeyCredential, SearchClient, SearchIndexClient, type SearchIndex } from "@azure/search-documents";
import { chunkMarkdown, estimateTokens, type Chunk } from "../rag/chunker";
import { describeError } from "../rag/describeError";

const DRY_RUN = process.argv.includes("--dry-run");
const RECREATE = process.argv.includes("--recreate"); // drop and rebuild the index (needed when field attributes change)
const POLICIES_DIR = path.resolve(__dirname, "../../../docs/policies");

const env = z
  .object({
    CHUNK_SIZE_TOKENS: z.coerce.number().default(400),
    CHUNK_OVERLAP_TOKENS: z.coerce.number().default(60),
    EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),
    SEARCH_INDEX_NAME: z.string().default("policy-chunks"),
    BLOB_CONNECTION_STRING: z.string().default(""),
    BLOB_CONTAINER: z.string().default("policies"),
    OPENAI_API_KEY: z.string().default(""),
    SEARCH_ENDPOINT: z.string().default(""),
    SEARCH_API_KEY: z.string().default(""),
  })
  .parse(process.env);

type SourceDoc = { file: string; text: string };

/** Blob Storage is the source of truth when configured: upload local files, then read back from the container. */
async function loadDocuments(): Promise<SourceDoc[]> {
  const localFiles = fs.readdirSync(POLICIES_DIR).filter((f) => f.endsWith(".md")).sort();
  if (DRY_RUN || !env.BLOB_CONNECTION_STRING) {
    if (!DRY_RUN) console.log("BLOB_CONNECTION_STRING not set: reading local files only.");
    return localFiles.map((file) => ({ file, text: fs.readFileSync(path.join(POLICIES_DIR, file), "utf8") }));
  }
  const container = BlobServiceClient.fromConnectionString(env.BLOB_CONNECTION_STRING).getContainerClient(env.BLOB_CONTAINER);
  await container.createIfNotExists(); // private by default
  for (const file of localFiles) {
    const data = fs.readFileSync(path.join(POLICIES_DIR, file));
    await container.getBlockBlobClient(file).uploadData(data, { blobHTTPHeaders: { blobContentType: "text/markdown" } });
  }
  const docs: SourceDoc[] = [];
  for await (const blob of container.listBlobsFlat()) {
    if (!blob.name.endsWith(".md")) continue;
    const buf = await container.getBlobClient(blob.name).downloadToBuffer();
    docs.push({ file: blob.name, text: buf.toString("utf8") });
  }
  console.log(`Blob Storage: ${localFiles.length} uploaded, ${docs.length} read from container "${env.BLOB_CONTAINER}".`);
  return docs.sort((a, b) => a.file.localeCompare(b.file));
}

function buildIndex(): SearchIndex {
  return {
    name: env.SEARCH_INDEX_NAME,
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true },
      { name: "documentId", type: "Edm.String", filterable: true, facetable: true },
      { name: "documentTitle", type: "Edm.String", searchable: true, filterable: true },
      { name: "sourceFile", type: "Edm.String", filterable: true },
      { name: "section", type: "Edm.String", searchable: true },
      { name: "chunkIndex", type: "Edm.Int32", filterable: true, sortable: true },
      { name: "content", type: "Edm.String", searchable: true, analyzerName: "en.microsoft" },
      {
        name: "contentVector",
        type: "Collection(Edm.Single)",
        searchable: true,
        hidden: false, // retrievable: the RAG service reads vectors back to compute cosine similarity for its relevance gate
        vectorSearchDimensions: env.EMBEDDING_DIMENSIONS,
        vectorSearchProfileName: "vector-profile",
      },
    ],
    vectorSearch: {
      algorithms: [{ name: "hnsw-config", kind: "hnsw" }],
      profiles: [{ name: "vector-profile", algorithmConfigurationName: "hnsw-config" }],
    },
    semanticSearch: {
      defaultConfigurationName: "policy-semantic",
      configurations: [
        {
          name: "policy-semantic",
          prioritizedFields: {
            titleField: { name: "documentTitle" },
            contentFields: [{ name: "content" }],
            keywordsFields: [{ name: "section" }],
          },
        },
      ],
    },
  };
}

async function embedAll(openai: OpenAI, chunks: Chunk[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += 32) {
    const batch = chunks.slice(i, i + 32).map((c) => c.content);
    const res = await openai.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: batch,
      dimensions: env.EMBEDDING_DIMENSIONS,
    });
    vectors.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return vectors;
}

async function main() {
  const opts = { chunkSizeTokens: env.CHUNK_SIZE_TOKENS, overlapTokens: env.CHUNK_OVERLAP_TOKENS };
  const docs = await loadDocuments();
  const chunks = docs.flatMap((d) => chunkMarkdown(d.file, d.text, opts));

  console.log(`\n${docs.length} documents -> ${chunks.length} chunks (size ${opts.chunkSizeTokens} tok, overlap ${opts.overlapTokens} tok)`);
  for (const d of docs) {
    const own = chunks.filter((c) => c.sourceFile === d.file);
    const tokens = own.map((c) => estimateTokens(c.content));
    console.log(`  ${d.file.padEnd(34)} ${String(own.length).padStart(2)} chunks, max ~${Math.max(...tokens)} tok`);
  }
  if (DRY_RUN) {
    console.log("\nSample chunk:\n" + JSON.stringify({ ...chunks[0], content: chunks[0].content.slice(0, 220) + "…" }, null, 2));
    console.log("\nDry run complete: no API calls were made.");
    return;
  }

  for (const k of ["OPENAI_API_KEY", "SEARCH_ENDPOINT", "SEARCH_API_KEY"] as const) {
    if (!env[k]) throw new Error(`${k} is required for a full ingestion run.`);
  }
  const credential = new AzureKeyCredential(env.SEARCH_API_KEY);
  const indexClient = new SearchIndexClient(env.SEARCH_ENDPOINT, credential);
  if (RECREATE) {
    await indexClient.deleteIndex(env.SEARCH_INDEX_NAME).catch((e) => { if (e?.statusCode !== 404) throw e; });
    console.log(`\nIndex "${env.SEARCH_INDEX_NAME}" deleted (--recreate).`);
  }
  await indexClient.createOrUpdateIndex(buildIndex());
  console.log(`\nIndex "${env.SEARCH_INDEX_NAME}" created/updated.`);

  const vectors = await embedAll(new OpenAI({ apiKey: env.OPENAI_API_KEY }), chunks);
  const client = new SearchClient<Record<string, unknown>>(env.SEARCH_ENDPOINT, env.SEARCH_INDEX_NAME, credential);

  const documents = chunks.map((c, i) => ({ ...c, contentVector: vectors[i] }));
  for (let i = 0; i < documents.length; i += 100) await client.mergeOrUploadDocuments(documents.slice(i, i + 100));
  console.log(`Uploaded ${documents.length} chunks.`);

  // Remove chunks that no longer exist (renamed/edited/removed documents) so the index mirrors the source.
  const keep = new Set(chunks.map((c) => c.id));
  const stale: string[] = [];
  for await (const r of (await client.search("*", { select: ["id"], top: 1000 })).results) {
    const id = String(r.document.id);
    if (!keep.has(id)) stale.push(id);
  }
  if (stale.length) await client.deleteDocuments("id", stale);
  console.log(`Removed ${stale.length} stale chunks. Done.`);
}

main().catch((err) => {
  console.error("Ingestion failed:", describeError(err));
  process.exit(1);
});
