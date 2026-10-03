# Secure Insurance Claims AI Chatbot & Customer Portal

Portfolio project: RAG chatbot + secure claims portal.
Stack: Next.js, Azure Functions, Azure SQL, Azure AI Search, Blob Storage, OpenAI API, Microsoft Entra External ID.

> Work in progress. Sections will be filled in as each build step completes.

## Deviations from the original spec
- **OpenAI API** (`gpt-4o-mini`, `text-embedding-3-small`) is used instead of Azure OpenAI (cost).
- **Custom `/chat` endpoint + React chat widget** replaces Bot Framework / Direct Line (simplicity; Bot Framework SDK is being retired).
- **Custom ingestion script** (chunk -> embed -> upload) replaces Azure AI Search integrated vectorization, which requires Azure OpenAI.

## Sections to complete
Architecture · Local setup · Env vars · DB setup · Entra External ID setup · AI Search setup · Ingestion · Deployment · Example questions · Security model · RAG design · Observability · Known limitations
