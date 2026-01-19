# Elasticsearch Agentic RAG Demo

Minimal demo for the blog **"Building Production-Grade AI Agents with Elasticsearch: Serverless RAG + Agentic Semantic Search Architecture"**.

This repo shows how to:
- Create a vector-enabled index in Elasticsearch.
- Run BM25 keyword search, semantic (vector) search, and a simple hybrid search.
- Expose them as HTTP endpoints that an AI agent can use as tools.

## Tech stack

- Node.js + Express
- Elasticsearch 8.x (Elastic Cloud or local)
- TypeScript

## Repository structure

```text
src/
  app.ts          # Express HTTP API (keyword, semantic, hybrid)
  elastic.ts      # Elasticsearch client
  embedding.ts    # fake embedding function for demo
scripts/
  create-index.sh # create demo-rag-kb index with dense_vector mapping
  seed-data.sh    # index a few sample documents
```

## Prerequisites

- Node.js 18+
- Yarn or npm
- Elasticsearch endpoint (Elastic Cloud or local)

Set environment variables:

```bash
export ELASTIC_URL="http://localhost:9200"
export ELASTIC_USERNAME="elastic"
export ELASTIC_PASSWORD="changeme"
```

## 1. Create index and seed data

From the project root:

```bash
bash scripts/create-index.sh
bash scripts/seed-data.sh
```

These scripts:
- Create `demo-rag-kb` with a `dense_vector` field called `embedding`.
- Index a few example documents.

## 2. Install and run

```bash
npm install
npm run dev
```

By default the API listens on `http://localhost:3000`.

## 3. Endpoints

### POST /api/keyword-search

BM25 keyword search over `title` and `body`.

```json
{
  "query": "payment error 429",
  "tenantId": "demo"
}
```

### POST /api/semantic-search

Vector kNN search using embeddings.

```json
{
  "query": "why did my payment fail",
  "tenantId": "demo"
}
```

### POST /api/hybrid-search

Combines BM25 and vector scores.

```json
{
  "query": "payment error 429",
  "tenantId": "demo",
  "alpha": 0.5
}
```

## 4. How an AI agent would use this

An agent can treat these three endpoints as tools:
- `keyword_search(query, tenant_id)`
- `semantic_search(query, tenant_id)`
- `hybrid_search(query, tenant_id, alpha)`

A typical strategy:
- If the query contains IDs or error codes → prefer `keyword_search`.
- For vague, natural language questions → prefer `semantic_search` or `hybrid_search`.
- Fallback to the other mode when the first returns low-quality results.

## Getting started

1. Clone the repo: `git clone https://github.com/pavankumarh14/elasticsearch-agentic-rag-demo.git`
2. Install deps: `npm install`
3. Create index: `bash scripts/create-index.sh`
4. Seed data: `bash scripts/seed-data.sh`
5. Run: `npm run dev`
6. Test endpoints with curl or Postman.

## License

MIT
