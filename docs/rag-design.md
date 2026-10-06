# RAG Design

> Retrieval, prompting and citation sections are added in later steps. This part documents ingestion.

## Ingestion pipeline
`docs/policies/*.md` -> **Azure Blob Storage** (container `policies`, source of truth) -> `npm run ingest` -> chunking -> OpenAI embeddings -> **Azure AI Search** index `policy-chunks`.

Re-running ingestion is idempotent: chunk IDs are deterministic, documents are upserted, and chunks that no longer exist are deleted.

*Deviation from the original spec:* Azure AI Search integrated vectorization requires Azure OpenAI. This project uses the OpenAI API, so chunking and embedding run in a script (`bot-server/src/scripts/ingest.ts`), which also makes chunking fully deterministic and testable.

## Chunking (`bot-server/src/rag/chunker.ts`)
| Decision | Value |
|---|---|
| Strategy | Structure-aware Markdown: H1 = title, H2/H3 = sections. A chunk never crosses a section boundary. |
| Chunk size | 400 tokens (estimated at 4 chars/token), configurable via `CHUNK_SIZE_TOKENS` |
| Overlap | 60 tokens, configurable via `CHUNK_OVERLAP_TOKENS`; applied only when one section is split into several chunks |
| Heading preservation | Each chunk is prefixed with `<document title> — <section path>` so headings are part of the embedded text |
| Oversized sections | Split on line, then sentence boundaries; packed greedily up to the size limit |
| Chunk ID | `<documentId>-<NNN>`, stable across runs |

Policy sections are short (typically 50-150 tokens), so most sections become a single chunk and overlap rarely applies. That is intentional: a section is the natural unit of meaning in policy text.

## Embeddings
`text-embedding-3-small`, 1536 dimensions. Model and dimensions are configurable (`EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`). Changing the dimensions requires recreating the index.

## Index schema (`policy-chunks`)
`id` (key), `documentId`, `documentTitle`, `sourceFile`, `section`, `chunkIndex`, `content` (full-text, `en.microsoft` analyzer), `contentVector` (HNSW vector field), plus a semantic configuration prioritising title, content and section. Source metadata is retained on every chunk so answers can cite `documentTitle` and `section`.
