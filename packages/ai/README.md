# @talosjs/ai

Multi-provider AI toolkit for TypeScript — seamlessly integrate OpenAI, Anthropic Claude, Google Gemini, Groq, and Ollama with a unified API for text generation, streaming, and content transformation.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Multiple Providers** - Support for OpenAI, Anthropic Claude, Google Gemini, Groq, and Ollama

✅ **Unified Interface** - Consistent API across all AI providers

✅ **Text Transformations** - Built-in methods for summarizing, rephrasing, translating, and more

✅ **Streaming Support** - Real-time response streaming with async generators

✅ **Output Validation** - Validate AI responses against schemas using ArkType

✅ **Configurable Tone** - 15 different tone options for content generation

✅ **Text-to-Speech** - Groq-powered text-to-speech with configurable voices and formats

✅ **Multi-language** - Translate and generate content in multiple languages

✅ **Type-Safe** - Full TypeScript support with proper type definitions

## Installation

```bash
bun add @talosjs/ai
```

## Usage

### Basic Usage with OpenAI

```typescript
import { OpenAi } from '@talosjs/ai';

const ai = new OpenAi();

// Run a simple prompt
const result = await ai.run<string>('What is the capital of France?');
console.log(result); // "Paris"
```

### Text Transformations

```typescript
import { AnthropicAi } from '@talosjs/ai';

const ai = new AnthropicAi();

// Summarize content
const summary = await ai.summarize('Your long text here...');

// Make text shorter
const shorter = await ai.makeShorter('Your verbose text here...');

// Simplify complex text
const simplified = await ai.simplify('Complex technical jargon...');

// Change tone
const formal = await ai.changeTone('Hey, what\'s up?', 'formal');

// Translate content
const translated = await ai.translate('Hello, world!', { language: 'fr' });
```

### Streaming Responses

```typescript
import { OpenAi } from '@talosjs/ai';

const ai = new OpenAi();

// Stream the response chunk by chunk
for await (const chunk of ai.runStream('Explain quantum computing')) {
  process.stdout.write(chunk);
}
```

### With Configuration

```typescript
import { GeminiAi, type GeminiConfigType } from '@talosjs/ai';

const ai = new GeminiAi();

const config: GeminiConfigType = {
  model: 'gemini-1.5-pro',
  wordCount: 200,
  tone: 'professional',
  language: 'en',
  context: 'You are a technical writer.'
};

const result = await ai.run<string>('Explain microservices', config);
```

### Output Validation

```typescript
import { OpenAi } from '@talosjs/ai';
import { Assert } from '@talosjs/validation';

const ai = new OpenAi();

// Define expected output schema
const ProductSchema = Assert({
  name: 'string',
  price: 'number',
  description: 'string'
});

const product = await ai.run<typeof ProductSchema.infer>(
  'Generate a product for an e-commerce store',
  { output: ProductSchema }
);

console.log(product.name, product.price);
```

### Using Ollama (Local Models)

```typescript
import { OllamaAi } from '@talosjs/ai';

const ai = new OllamaAi();

const result = await ai.run<string>('Write a haiku about coding', {
  host: 'http://localhost:11434',
  model: 'llama2'
});
```

## API Reference

### Classes

#### `OpenAi`

OpenAI provider implementation with GPT models.

**Constructor:**
```typescript
new OpenAi()
```

**Environment Variables:**
- `OPENAI_API_KEY` - Your OpenAI API key

#### `AnthropicAi`

Anthropic provider implementation with Claude models.

**Constructor:**
```typescript
new AnthropicAi()
```

**Environment Variables:**
- `ANTHROPIC_API_KEY` - Your Anthropic API key

#### `GeminiAi`

Google Gemini provider implementation.

**Constructor:**
```typescript
new GeminiAi()
```

**Environment Variables:**
- `GEMINI_API_KEY` - Your Google Gemini API key

#### `OllamaAi`

Ollama provider for local AI models.

**Constructor:**
```typescript
new OllamaAi()
```

**Configuration:**
- `host` - Ollama server URL (default: `http://localhost:11434`)

### Common Methods

All AI classes implement the `IAiChat` interface with these methods:

##### `run<T>(prompt: string, config?: ConfigType): Promise<T>`

Execute a prompt and return the response.

##### `runStream(prompt: string, config?: ConfigType): AsyncGenerator<string>`

Stream the response chunk by chunk.

##### `summarize(content: string, config?: ConfigType): Promise<string>`

Summarize the provided content.

##### `makeShorter(content: string, config?: ConfigType): Promise<string>`

Condense text while preserving meaning.

##### `makeLonger(content: string, config?: ConfigType): Promise<string>`

Expand text with additional details.

##### `simplify(content: string, config?: ConfigType): Promise<string>`

Simplify complex text for general audiences.

##### `rephrase(content: string, config?: ConfigType): Promise<string>`

Rephrase using different words and structures.

##### `changeTone(content: string, tone: AiToneType, config?: ConfigType): Promise<string>`

Rewrite content with a different tone.

##### `translate(content: string, config?: ConfigType): Promise<string>`

Translate content to the specified language.

##### `proofread(content: string, config?: ConfigType): Promise<string>`

Correct grammar, spelling, and punctuation.

##### `extractKeywords(content: string, config?: ConfigType): Promise<string[]>`

Extract important keywords from content.

##### `extractCategories(content: string, config?: ConfigType): Promise<string[]>`

Identify relevant categories for content.

##### `generateTitle(content: string, config?: ConfigType): Promise<string>`

Generate a compelling title for content.

### Types

#### `AiConfigType`

```typescript
type AiConfigType = {
  apiKey?: string;
  model?: string;
  wordCount?: number;
  stream?: boolean;
  language?: LocaleType;
  tone?: AiToneType;
  messages?: AiMessageType[];
  context?: string;
  prompt?: string;
  output?: AssertType;
};
```

#### `AiToneType`

```typescript
type AiToneType =
  | "professional"
  | "casual"
  | "formal"
  | "friendly"
  | "confident"
  | "empathetic"
  | "persuasive"
  | "informative"
  | "enthusiastic"
  | "neutral"
  | "humorous"
  | "serious"
  | "inspirational"
  | "conversational"
  | "authoritative";
```

#### `AiMessageType`

```typescript
type AiMessageType = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};
```

## Advanced Usage

### Conversation History

```typescript
import { OpenAi, type AiMessageType } from '@talosjs/ai';

const ai = new OpenAi();

const messages: AiMessageType[] = [
  { role: 'user', content: 'My name is Alice.' },
  { role: 'assistant', content: 'Hello Alice! How can I help you today?' }
];

const response = await ai.run<string>('What is my name?', { messages });
// "Your name is Alice."
```

### Custom Context

```typescript
import { AnthropicAi } from '@talosjs/ai';

const ai = new AnthropicAi();

const response = await ai.run<string>('Summarize the project status', {
  context: `
    Project: E-commerce Platform
    Status: In development
    Progress: 75% complete
    Team: 5 developers
    Deadline: December 2024
  `
});
```

### Error Handling

```typescript
import { OpenAi, AiException } from '@talosjs/ai';

const ai = new OpenAi();

try {
  const result = await ai.run<string>('Generate content');
} catch (error) {
  if (error instanceof AiException) {
    console.error('AI Error:', error.message);
    console.error('Status:', error.status);
  }
}
```

### Integration with Dependency Injection

```typescript
import { container } from '@talosjs/container';
import { OpenAi, decorator } from '@talosjs/ai';

// The decorator registers the class with the container
@decorator.ai()
class MyAiService extends OpenAi {
  // Custom implementation
}

// Resolve from container
const aiService = container.get(MyAiService);
```

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
