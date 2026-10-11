# Secure Insurance Claims AI Chatbot & Customer Portal

RAG chatbot + secure claims portal.
Stack: Next.js, Azure Functions, Azure SQL, Azure AI Search, Blob Storage, OpenAI API, Microsoft Entra External ID.

> Developing in progress.

## Deviations from the original spec
- **OpenAI API** (`gpt-4o-mini`, `text-embedding-3-small`) is used instead of Azure OpenAI (cost).
- **Custom `/chat` endpoint + React chat widget** replaces Bot Framework / Direct Line (simplicity; Bot Framework SDK is being retired).
- **Custom ingestion script** (chunk -> embed -> upload)