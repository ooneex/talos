# @talosjs/rag

Retrieval-Augmented Generation toolkit with vector database integration, document embedding, and semantic search for AI-powered knowledge retrieval

## Installation

```bash
bun add @talosjs/rag
```

## Documentation

Read the full documentation at [docs.talosjs.com/ai/rag/overview](https://docs.talosjs.com/ai/rag/overview).

## Cloudflare Vectorize

`CloudflareVectorDatabase` uses the Cloudflare Vectorize V2 REST API and OpenRouter embeddings. The default
embedding model is `text-embedding-3-small`, whose 1,536 dimensions match Vectorize's current maximum.

```typescript
import { CloudflareVectorDatabase } from "@talosjs/rag";

type DocumentDataType = {
  metadata: {
    category: string;
  };
};

const database = new CloudflareVectorDatabase<DocumentDataType>({
  accountId: "cloudflare-account-id",
  apiToken: "cloudflare-api-token",
  embeddingApiKey: "openrouter-api-key",
});

await database.connect();
const documents = await database.open("documents", { metric: "cosine" });

const metadataMutation = await documents.createMetadataIndex("category", "string");
// Wait for metadataMutation.mutationId to be processed before inserting vectors that must be filterable.
await documents.upsert([
  { id: "doc-1", text: "Cloudflare Vectorize is a vector database.", metadata: { category: "docs" } },
]);

const matches = await documents.search("What is Vectorize?", {
  topK: 5,
  filter: { category: "docs" },
});
```

Vector and metadata mutations are asynchronous; `add`, `upsert`, `deleteByIds`, and `createMetadataIndex` return
Cloudflare's mutation ID. Source text is stored in vector metadata so search results can be used directly; keep each
record's text and metadata within Cloudflare's 10 KiB metadata limit.

## License

MIT
