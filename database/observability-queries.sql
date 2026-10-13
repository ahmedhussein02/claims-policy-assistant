/* Handy analytics over dbo.AiInteractions (run in the Azure portal Query editor). */

-- 1. Latest interactions (claim answers are intentionally not stored)
SELECT TOP 20 created_at, intent, status, error_type, latency_ms, query, response
FROM dbo.AiInteractions ORDER BY created_at DESC;

-- 2. Traffic and outcomes by intent
SELECT intent, status, COUNT(*) AS interactions, AVG(latency_ms) AS avg_latency_ms
FROM dbo.AiInteractions GROUP BY intent, status ORDER BY intent, status;

-- 3. Fallback / refusal reasons (RAG gate vs. security refusals vs. errors)
SELECT error_type, COUNT(*) AS n
FROM dbo.AiInteractions WHERE error_type IS NOT NULL GROUP BY error_type ORDER BY n DESC;

-- 4. RAG latency and token usage per day
SELECT CAST(created_at AS DATE) AS day, COUNT(*) AS rag_calls,
       AVG(retrieval_latency_ms) AS avg_retrieval_ms, AVG(generation_latency_ms) AS avg_generation_ms,
       SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens
FROM dbo.AiInteractions WHERE intent = 'POLICY_QUERY' GROUP BY CAST(created_at AS DATE) ORDER BY day DESC;

-- 5. Slowest requests
SELECT TOP 10 created_at, intent, latency_ms, retrieval_latency_ms, generation_latency_ms, query
FROM dbo.AiInteractions ORDER BY latency_ms DESC;

-- 6. Which policy chunks are retrieved most (parses the stored retrieval JSON)
SELECT j.chunk_id, COUNT(*) AS times_retrieved, AVG(j.score) AS avg_similarity
FROM dbo.AiInteractions a
CROSS APPLY OPENJSON(a.retrieval_results) WITH (chunk_id NVARCHAR(100) '$.chunk_id', score FLOAT '$.score') j
WHERE a.retrieval_results IS NOT NULL
GROUP BY j.chunk_id ORDER BY times_retrieved DESC;
