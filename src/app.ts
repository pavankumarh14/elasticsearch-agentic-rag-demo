import express from "express";
import { Client } from "@elastic/elasticsearch";

const esClient = new Client({ node: process.env.ELASTIC_URL || "http://localhost:9200" });
const app = express();

app.use(express.json());

// Fake embedding function for demo
function fakeEmbed(query: string): number[] {
  const q = query.toLowerCase();
  if (q.includes("password")) return [0.1, 0.2, 0.9, 0.3];
  if (q.includes("payment") || q.includes("429")) return [0.7, 0.1, 0.2, 0.4];
  if (q.includes("upgrade") || q.includes("plan")) return [0.6, 0.3, 0.1, 0.2];
  return [0.25, 0.25, 0.25, 0.25];
}

// Normalize scores for hybrid search
function normScores(hits: any[]) {
  const scores = hits.map(h => h._score ?? 0);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 1);
  return hits.reduce((acc: any, h: any) => {
    const s = h._score ?? 0;
    const norm = max === min ? 0 : (s - min) / (max - min);
    acc[h._id] = norm;
    return acc;
  }, {});
}

// POST /api/keyword-search - BM25 search
app.post("/api/keyword-search", async (req, res) => {
  const { query, tenantId = "demo" } = req.body;

  try {
    const esResponse = await esClient.search({
      index: "demo-rag-kb",
      size: 5,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ["title^2", "body"]
              }
            }
          ],
          filter: [{ term: { tenant_id: tenantId } }]
        }
      }
    });

    const hits = (esResponse.hits.hits ?? []) as any[];

    res.json({
      mode: "keyword",
      query,
      results: hits.map((h: any) => ({
        id: h._id,
        score: h._score,
        title: h._source.title,
        url: h._source.url
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/semantic-search - Vector kNN search
app.post("/api/semantic-search", async (req, res) => {
  const { query, tenantId = "demo" } = req.body;

  try {
    const queryEmbedding = fakeEmbed(query);

    const esResponse = await esClient.search({
      index: "demo-rag-kb",
      size: 5,
      knn: {
        field: "embedding",
        query_vector: queryEmbedding,
        k: 5,
        num_candidates: 10
      },
      filter: { term: { tenant_id: tenantId } }
    });

    const hits = (esResponse.hits.hits ?? []) as any[];

    res.json({
      mode: "semantic",
      query,
      results: hits.map((h: any) => ({
        id: h._id,
        score: h._score,
        title: h._source.title,
        url: h._source.url
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hybrid-search - Combined BM25 + Vector
app.post("/api/hybrid-search", async (req, res) => {
  const { query, tenantId = "demo", alpha = 0.5 } = req.body;

  try {
    const queryEmbedding = fakeEmbed(query);

    const bm25Resp = await esClient.search({
      index: "demo-rag-kb",
      size: 10,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ["title^2", "body"]
              }
            }
          ],
          filter: [{ term: { tenant_id: tenantId } }]
        }
      }
    });

    const vectorResp = await esClient.search({
      index: "demo-rag-kb",
      size: 10,
      knn: {
        field: "embedding",
        query_vector: queryEmbedding,
        k: 10,
        num_candidates: 20
      },
      filter: { term: { tenant_id: tenantId } }
    });

    const bm25Hits = (bm25Resp.hits.hits ?? []) as any[];
    const vecHits = (vectorResp.hits.hits ?? []) as any[];

    const bm25Norm = normScores(bm25Hits);
    const vecNorm = normScores(vecHits);

    const ids = new Set<string>([
      ...bm25Hits.map(h => String(h._id)),
      ...vecHits.map(h => String(h._id))
    ]);

    const byId: Record<string, any> = {};
    bm25Hits.forEach(h => { byId[h._id] = h; });
    vecHits.forEach(h => { byId[h._id] = byId[h._id] || h; });

    const combined = Array.from(ids).map(id => {
      const doc = byId[id];
      const bm = bm25Norm[id] ?? 0;
      const ve = vecNorm[id] ?? 0;
      const hybrid = alpha * bm + (1 - alpha) * ve;
      return { id, hybrid, bm25: bm, vector: ve, source: doc._source };
    });

    combined.sort((a, b) => b.hybrid - a.hybrid);

    res.json({
      mode: "hybrid",
      alpha,
      query,
      results: combined.slice(0, 5).map(r => ({
        id: r.id,
        hybrid_score: r.hybrid,
        bm25_score: r.bm25,
        vector_score: r.vector,
        title: r.source.title,
        url: r.source.url
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Elasticsearch Agentic RAG API listening on http://localhost:${PORT}`);
});

export default app;
