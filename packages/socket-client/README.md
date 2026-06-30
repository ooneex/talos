# @talosjs/socket-client

WebSocket client for real-time bidirectional communication with automatic reconnection, event handling, and typed message serialization.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Socket Class** - WebSocket client with typed send and receive operations via the `Socket` class

✅ **Message Queuing** - Automatically queues messages sent before the connection is open and flushes them on connect

✅ **Typed Events** - Register handlers for `onMessage`, `onOpen`, `onClose`, and `onError` with typed responses

✅ **JSON Serialization** - Automatic JSON serialization for outgoing messages and deserialization for incoming responses

✅ **Protocol Auto-Detection** - Automatically converts HTTP/HTTPS URLs to WS/WSS WebSocket protocols

✅ **Generic Type Parameters** - Parameterize `Socket<SendData, Response>` for type-safe request and response data

✅ **ISocket Interface** - Standard interface defining the WebSocket client contract

✅ **Locale Support** - Request data type includes optional language/locale information

## Installation

```bash
bun add @talosjs/socket-client
```

## Usage

### Basic Connection

```typescript
import { Socket } from '@talosjs/socket-client';

const socket = new Socket('wss://api.example.com/ws/chat');

socket.onOpen(() => {
  console.log('Connected');
});

socket.onMessage((response) => {
  console.log('Received:', response);
});

socket.onClose((event) => {
  console.log('Disconnected:', event.code, event.reason);
});

socket.onError((event) => {
  console.error('Error:', event);
});
```

### Sending Messages

```typescript
import { Socket } from '@talosjs/socket-client';

const socket = new Socket('wss://api.example.com/ws/messages');

// Messages are queued if the connection is not yet open
socket.send({
  payload: { message: 'Hello, world!' },
  queries: { room: 'general' }
});
```

### Typed Socket

```typescript
import { Socket, type RequestDataType } from '@talosjs/socket-client';

interface ChatRequest extends RequestDataType {
  payload: { message: string; type: 'text' | 'image' };
}

interface ChatResponse {
  event: string;
  data: { messageId: string; timestamp: string };
}

const socket = new Socket<ChatRequest, ChatResponse>(
  'wss://api.example.com/ws/chat'
);

socket.onMessage((response) => {
  // response is typed as ResponseDataType<ChatResponse>
  console.log(response.data.event);
});

socket.send({
  payload: { message: 'Hello!', type: 'text' }
});
```

### Closing a Connection

```typescript
import { Socket } from '@talosjs/socket-client';

const socket = new Socket('wss://api.example.com/ws');

// Close with a status code and reason
socket.close(1000, 'User disconnected');
```

## API Reference

### Classes

#### `Socket<SendData, Response>`

WebSocket client class with typed messaging.

**Constructor:**
- `url: string` - WebSocket URL (supports `ws://`, `wss://`, `http://`, `https://`, or bare hostnames)

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `send(data)` | `void` | Send typed data as JSON (queued if not yet connected) |
| `close(code?, reason?)` | `void` | Close the WebSocket connection |
| `onMessage(handler)` | `void` | Register a handler for incoming messages |
| `onOpen(handler)` | `void` | Register a handler for connection open |
| `onClose(handler)` | `void` | Register a handler for connection close |
| `onError(handler)` | `void` | Register a handler for errors |

### Interfaces

#### `ISocket<SendData, Response>`

Interface defining the WebSocket client contract.

### Types

#### `RequestDataType`

```typescript
type RequestDataType = {
  payload?: Record<string, unknown>;
  queries?: Record<string, boolean | number | bigint | string>;
  lang?: LocaleInfoType;
};
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
