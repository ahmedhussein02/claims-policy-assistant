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

## Retrieval (`bot-server/src/services/ragService.ts`)
| Decision | Value |
|---|---|
| Method | Azure AI Search **hybrid** query: BM25 full-text on the question + vector kNN on its embedding, fused by the service (RRF) |
| Semantic ranking | Optional (`SEARCH_USE_SEMANTIC=true`); off by default so the project runs on free/serverless tiers |
| `top_k` | 5 (`RAG_TOP_K`) |
| Filters | None needed for this MVP (single corpus); `documentId` is filterable if scoping is added later |
| Relevance gate | Cosine similarity between the query embedding and each returned chunk's vector must be >= `RAG_MIN_SCORE` (default 0.35) |

**Why cosine for the gate:** hybrid scores are rank-fusion values, not comparable across queries, so they can't express "how relevant is this, absolutely?". Cosine similarity can, and it is computed locally from the vector the index returns. Calibrate with `npm run rag:eval`.

## Low-confidence behaviour
The LLM is never called when no chunk passes the gate. If the model itself judges the context insufficient (it must answer `INSUFFICIENT_CONTEXT`), that is also converted to the configured fallback message. Fallback reasons: `no_results`, `low_relevance`, `insufficient_context`.

## Generation and citations
- Model `gpt-4o-mini`, temperature 0.1 (configurable). Temperature is not a security control.
- The prompt restricts answers to numbered context passages, forbids outside knowledge, and treats context and question as data (prompt-injection hygiene).
- The model cites passages as `[n]`. Those markers are mapped back to **retrieval metadata** (document, section, chunk id) by our code; the "Sources" list is never model-written text. Only cited passages are listed, de-duplicated by section.
- Output format: `Sources:\n- <Document title> — Section: <section>`.
