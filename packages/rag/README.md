# @talosjs/rag

Retrieval-Augmented Generation toolkit with vector database integration, document embedding, and semantic search for AI-powered knowledge retrieval.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Vector Database** - Abstract base class for building custom vector databases with LanceDB

✅ **PDF Conversion** - Convert PDF documents into structured chunks with heading and page metadata

✅ **Hybrid Search** - Full-text and vector-based hybrid search with RRF reranking

✅ **OpenAI Embeddings** - Built-in support for OpenAI embedding models (ada-002, 3-small, 3-large)

✅ **Schema Definition** - Typed schema definitions using Apache Arrow data types

✅ **Index Management** - Create scalar (btree, bitmap, labelList) and IVF-PQ vector indexes

✅ **Query Filtering** - Composable filter conditions with AND, OR, NOT logical operators

✅ **Query Analysis** - Explain and analyze query plans for performance tuning

✅ **Container Integration** - Decorator-based registration with the DI container

## Installation

```bash
bun add @talosjs/rag
```

## Usage

### Defining a Vector Database

```typescript
import { AbstractVectorDatabase } from '@talosjs/rag';
import { Utf8 } from 'apache-arrow';
import type { EmbeddingProviderType, EmbeddingModelType, FieldValueType } from '@talosjs/rag';

type ArticleData = {
  title: string;
  category: string;
};

class ArticleVectorDatabase extends AbstractVectorDatabase<ArticleData> {
  public getDatabaseUri(): string {
    return './data/articles.lance';
  }

  public getEmbeddingModel(): { provider: EmbeddingProviderType; model: EmbeddingModelType['model'] } {
    return { provider: 'openai', model: 'text-embedding-3-small' };
  }

  public getSchema(): { [K in keyof ArticleData]: FieldValueType } {
    return {
      title: new Utf8(),
      category: new Utf8(),
    };
  }
}
```

### Connecting and Adding Data

```typescript
const db = new ArticleVectorDatabase();
await db.connect();

const table = await db.open('articles');

await table.add([
  { id: '1', text: 'Introduction to RAG systems', title: 'RAG Intro', category: 'AI' },
  { id: '2', text: 'Vector databases explained', title: 'Vector DBs', category: 'Database' },
]);
```

### Searching

```typescript
const results = await table.search('retrieval augmented generation', {
  limit: 5,
  select: ['title', 'category'],
  filter: { field: 'category', op: '=', value: 'AI' },
});

console.log(results);
```

### Converting PDFs to Chunks

```typescript
import { Convertor } from '@talosjs/rag';

const convertor = new Convertor('/path/to/document.pdf');

for await (const chunk of convertor.convert({ outputDir: './output' })) {
  console.log(chunk.text);
  console.log(chunk.metadata.heading);
  console.log(chunk.metadata.pages);
}
```

### Composable Filters

```typescript
const results = await table.search('machine learning', {
  limit: 10,
  filter: {
    AND: [
      { field: 'category', op: '=', value: 'AI' },
      { NOT: { field: 'title', op: 'LIKE', value: '%draft%' } },
    ],
  },
});
```

### Query Plan Analysis

```typescript
// Explain the query plan
const plan = await table.explainPlan('search query', {
  limit: 10,
  verbose: true,
});
console.log(plan);

// Analyze with runtime metrics
const analysis = await table.analyzePlan('search query', {
  limit: 10,
});
console.log(analysis);
```

## API Reference

### Classes

#### `AbstractVectorDatabase<DataType>` (Abstract)

Abstract base class for creating vector database implementations.

**Type Parameter:**
- `DataType` - Record type for additional schema fields

**Abstract Methods:**

##### `getDatabaseUri(): string`

Returns the URI for the LanceDB database storage.

##### `getEmbeddingModel(): { provider: EmbeddingProviderType; model: EmbeddingModelType['model'] }`

Returns the embedding provider and model configuration.

##### `getSchema(): { [K in keyof DataType]: FieldValueType }`

Returns the schema definition using Apache Arrow types.

**Concrete Methods:**

##### `connect(): Promise<void>`

Connect to the LanceDB database.

##### `getDatabase(): Connection`

Get the underlying LanceDB connection. Throws `VectorDatabaseException` if not connected.

##### `open(name: string, options?): Promise<VectorTable<DataType>>`

Open or create a vector table. Automatically creates btree, full-text search, and IVF-PQ indexes on new tables.

**Parameters:**
- `name` - Table name
- `options.mode` - `"create"` or `"overwrite"` (default: `"overwrite"`)

---

#### `VectorTable<DataType>`

Provides search, indexing, and data operations on a vector table.

**Methods:**

##### `add(data): Promise<this>`

Add records to the table.

##### `search(query, options?): Promise<DataType[]>`

Perform hybrid (vector + full-text) search with RRF reranking.

**Parameters:**
- `query` - Search query string
- `options.limit` - Maximum results (default: 10)
- `options.select` - Fields to return
- `options.filter` - Filter conditions
- `options.nprobes` - IVF partitions to search
- `options.refineFactor` - Refine step multiplier
- `options.fastSearch` - Skip un-indexed data (default: true)

##### `createIndex(column, options?): Promise<this>`

Create a scalar index (btree, bitmap, or labelList).

##### `createVectorIndex(column?, options?): Promise<this>`

Create an IVF-PQ vector index.

##### `explainPlan(query, options?): Promise<string>`

Print the resolved query plan.

##### `analyzePlan(query, options?): Promise<string>`

Execute and return a physical plan with runtime metrics.

---

#### `Convertor`

Converts PDF documents into structured text chunks.

**Constructor:**
```typescript
new Convertor(source: string)
```

**Methods:**

##### `convert(options?): AsyncGenerator<ChunkType, { json: ConvertorFileType; markdown: ConvertorFileType }>`

Convert a PDF to chunks, yielding each chunk as it is processed.

**Parameters:**
- `options.outputDir` - Output directory
- `options.password` - PDF password
- `options.imageFormat` - `"png"` or `"jpeg"`
- `options.pages` - Page range
- `options.quiet` - Suppress output

### Types

#### `ChunkType`

```typescript
type ChunkType = {
  text: string;
  metadata: {
    heading: string | null;
    page: number | null;
    pages: number[];
    source: string | null;
  };
};
```

#### `Filter<T>`

Composable filter type supporting field conditions and logical operators.

```typescript
type Filter<T> =
  | FilterCondition<T>
  | { AND: Filter<T>[] }
  | { OR: Filter<T>[] }
  | { NOT: Filter<T> };
```

#### `FilterCondition<T>`

Individual filter conditions with typed operators.

```typescript
type FilterCondition<T> =
  | { field: FilterField<T>; op: '>' | '>=' | '<' | '<=' | '='; value: string | number }
  | { field: FilterField<T>; op: 'IN'; value: (string | number)[] }
  | { field: FilterField<T>; op: 'LIKE' | 'NOT LIKE'; value: string }
  | { field: FilterField<T>; op: 'IS NULL' | 'IS NOT NULL' }
  | { field: FilterField<T>; op: 'IS TRUE' | 'IS NOT TRUE' | 'IS FALSE' | 'IS NOT FALSE' };
```

#### `EmbeddingProviderType`

```typescript
type EmbeddingProviderType = 'openai';
```

#### `FieldValueType`

Apache Arrow types supported for schema fields: `Null`, `Bool`, `Int8`-`Int64`, `Uint8`-`Uint64`, `Float16`-`Float64`, `Utf8`, `LargeUtf8`, `Binary`, `LargeBinary`, `Decimal`, `DateDay`, `DateMillisecond`, and `EmbeddingFunction`.

### Exceptions

#### `VectorDatabaseException`

Thrown when vector database operations fail (e.g., not connected).

#### `ConvertorException`

Thrown when PDF conversion fails.

### Decorators

#### `@decorator.rag()`

Decorator to register RAG classes with the DI container.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun run test`
4. Build the project: `bun run build`

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team
