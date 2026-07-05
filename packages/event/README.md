# @talosjs/pub-sub

Publish-subscribe messaging system for decoupled, event-driven communication between application components with typed event channels.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Redis Integration** - Built-in Redis pub/sub client for distributed messaging

✅ **Abstract Base Class** - Create custom pub/sub handlers with consistent interface

✅ **Channel Management** - Subscribe, unsubscribe, and publish to channels

✅ **Type-Safe** - Full TypeScript support with generic data types

✅ **Container Integration** - Works seamlessly with dependency injection

✅ **Auto Reconnection** - Redis client with automatic reconnection support

✅ **WebSocket Support** - Built-in ServerWebSocket integration for real-time communication

## Installation

```bash
bun add @talosjs/pub-sub
```

## Usage

### Basic Pub/Sub Handler

```typescript
import { PubSub, RedisPubSub } from '@talosjs/pub-sub';
import type { ScalarType } from '@talosjs/types';

interface NotificationData extends Record<string, ScalarType> {
  userId: string;
  title: string;
  body: string;
}

class NotificationPubSub extends PubSub<NotificationData> {
  public getChannel(): string {
    return 'notifications';
  }

  public async handler(context: { 
    data: NotificationData; 
    channel: string; 
    key?: string 
  }): Promise<void> {
    const { data, channel, key } = context;
    
    console.log(`Received on ${channel}:`, data);
    
    // Handle the notification
    await this.sendPushNotification(data.userId, data.title, data.body);
  }

  private async sendPushNotification(
    userId: string, 
    title: string, 
    body: string
  ): Promise<void> {
    // Push notification logic
  }
}

// Create Redis client
const redisClient = new RedisPubSub({
  connectionString: 'redis://localhost:6379'
});

// Create pub/sub handler
const notificationPubSub = new NotificationPubSub(redisClient);

// Subscribe to channel
await notificationPubSub.subscribe();

// Publish a message
await notificationPubSub.publish({
  userId: 'user-123',
  title: 'New Message',
  body: 'You have a new message!'
});
```

### Using Environment Variables

```typescript
import { RedisPubSub } from '@talosjs/pub-sub';

// Automatically uses CACHE_REDIS_URL environment variable
const client = new RedisPubSub();
```

**Environment Variables:**
- `CACHE_REDIS_URL` - Redis connection string

### Publishing with Keys

```typescript
import { PubSub, RedisPubSub } from '@talosjs/pub-sub';

interface OrderEvent extends Record<string, ScalarType> {
  orderId: string;
  status: string;
  amount: number;
}

class OrderPubSub extends PubSub<OrderEvent> {
  public getChannel(): string {
    return 'orders';
  }

  public async handler(context: { 
    data: OrderEvent; 
    channel: string; 
    key?: string 
  }): Promise<void> {
    const { data, key } = context;
    
    // Route based on key
    switch (key) {
      case 'created':
        await this.handleOrderCreated(data);
        break;
      case 'completed':
        await this.handleOrderCompleted(data);
        break;
      case 'cancelled':
        await this.handleOrderCancelled(data);
        break;
    }
  }
}

const orderPubSub = new OrderPubSub(new RedisPubSub());

// Subscribe
await orderPubSub.subscribe();

// Publish with keys
await orderPubSub.publish({
  orderId: 'order-456',
  status: 'created',
  amount: 99.99
}, 'created');

await orderPubSub.publish({
  orderId: 'order-456',
  status: 'completed',
  amount: 99.99
}, 'completed');
```

### Dynamic Channels

```typescript
import { PubSub, RedisPubSub } from '@talosjs/pub-sub';

interface ChatMessage extends Record<string, ScalarType> {
  userId: string;
  message: string;
  timestamp: number;
}

class ChatRoomPubSub extends PubSub<ChatMessage> {
  constructor(
    client: RedisPubSub,
    private readonly roomId: string
  ) {
    super(client);
  }

  public getChannel(): string {
    return `chat:room:${this.roomId}`;
  }

  public async handler(context: { 
    data: ChatMessage; 
    channel: string 
  }): Promise<void> {
    const { data, channel } = context;
    console.log(`[${channel}] ${data.userId}: ${data.message}`);
  }
}

// Create room-specific pub/sub
const room1 = new ChatRoomPubSub(new RedisPubSub(), 'room-1');
const room2 = new ChatRoomPubSub(new RedisPubSub(), 'room-2');

await room1.subscribe();
await room2.subscribe();

// Publish to specific room
await room1.publish({
  userId: 'user-123',
  message: 'Hello Room 1!',
  timestamp: Date.now()
});
```

### Async Channel Names

```typescript
import { PubSub, RedisPubSub } from '@talosjs/pub-sub';

interface UserEvent extends Record<string, ScalarType> {
  action: string;
  data: string;
}

class UserEventPubSub extends PubSub<UserEvent> {
  constructor(
    client: RedisPubSub,
    private readonly getUserId: () => Promise<string>
  ) {
    super(client);
  }

  public async getChannel(): Promise<string> {
    const userId = await this.getUserId();
    return `user:${userId}:events`;
  }

  public async handler(context: { 
    data: UserEvent; 
    channel: string 
  }): Promise<void> {
    console.log('User event:', context.data);
  }
}
```

## API Reference

### Classes

#### `PubSub<Data>` (Abstract)

Abstract base class for creating pub/sub handlers.

**Type Parameter:**
- `Data` - Data type extending `Record<string, ScalarType>`

**Constructor:**
```typescript
new PubSub(client: IPubSubClient<Data>)
```

**Abstract Methods:**

##### `getChannel(): string | Promise<string>`

Returns the channel name to subscribe/publish to.

**Returns:** Channel name (sync or async)

##### `handler(context: { data: Data; channel: string; key?: string }): Promise<void> | void`

Handle incoming messages on the channel.

**Parameters:**
- `context.data` - The message data
- `context.channel` - The channel name
- `context.key` - Optional message key

**Concrete Methods:**

##### `publish(data: Data, key?: string): Promise<void>`

Publish a message to the channel.

**Parameters:**
- `data` - The data to publish
- `key` - Optional key for message routing

##### `subscribe(): Promise<void>`

Subscribe to the channel and start receiving messages.

##### `unsubscribe(): Promise<void>`

Unsubscribe from the channel.

##### `unsubscribeAll(): Promise<void>`

Unsubscribe from all channels.

---

#### `RedisPubSub`

Redis-based pub/sub client implementation.

**Constructor:**
```typescript
new RedisPubSub(options?: RedisPubSubOptionsType)
```

**Parameters:**
- `options.connectionString` - Redis URL (default: `CACHE_REDIS_URL` env var)
- `options.connectionTimeout` - Connection timeout in ms (default: 10000)
- `options.idleTimeout` - Idle timeout in ms (default: 30000)
- `options.autoReconnect` - Enable auto reconnection (default: true)
- `options.maxRetries` - Maximum retry attempts (default: 3)
- `options.enableOfflineQueue` - Queue commands when offline (default: true)
- `options.enableAutoPipelining` - Enable auto pipelining (default: true)
- `options.tls` - TLS configuration (optional)

**Methods:**

##### `publish(config: { channel: string; data: Data; key?: string }): Promise<void>`

Publish a message to a channel.

##### `subscribe(channel: string, handler: PubSubMessageHandlerType<Data>): Promise<void>`

Subscribe to a channel with a message handler.

##### `unsubscribe(channel: string): Promise<void>`

Unsubscribe from a specific channel.

##### `unsubscribeAll(): Promise<void>`

Unsubscribe from all channels.

### Types

#### `PubSubMessageHandlerType<Data>`

Handler function type for incoming messages.

```typescript
type PubSubMessageHandlerType<Data> = (context: {
  data: Data;
  channel: string;
  key?: string;
}) => Promise<void> | void;
```

#### `RedisPubSubOptionsType`

Configuration options for Redis pub/sub client.

```typescript
type RedisPubSubOptionsType = {
  connectionString?: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  tls?: boolean | object;
};
```

#### `IPubSubClient<Data>`

Interface for pub/sub client implementations.

```typescript
interface IPubSubClient<Data> {
  publish: (config: { channel: string; data: Data; key?: string }) => Promise<void>;
  subscribe: (channel: string, handler: PubSubMessageHandlerType<Data>) => Promise<void>;
  unsubscribe: (channel: string) => Promise<void>;
  unsubscribeAll: () => Promise<void>;
}
```

#### `IPubSub<Data>`

Interface for pub/sub handler implementations.

```typescript
interface IPubSub<Data> {
  getChannel: () => Promise<string> | string;
  handler: (context: { data: Data; channel: string; key?: string }) => Promise<void> | void;
  publish: (data: Data, key?: string) => Promise<void> | void;
  subscribe: () => Promise<void> | void;
  unsubscribe: () => Promise<void> | void;
  unsubscribeAll: () => Promise<void> | void;
}
```

#### `PubSubClassType`

Type for pub/sub class constructors.

```typescript
type PubSubClassType = new (...args: any[]) => IPubSub;
```

### Exceptions

#### `PubSubException`

Thrown when pub/sub operations fail.

```typescript
import { PubSub, PubSubException, RedisPubSub } from '@talosjs/pub-sub';

try {
  const client = new RedisPubSub();
  await client.publish({ channel: 'test', data: { message: 'hello' } });
} catch (error) {
  if (error instanceof PubSubException) {
    console.error('PubSub error:', error.message);
  }
}
```

### Decorators

#### `@decorator.pubsub()`

Decorator to register pub/sub classes with the DI container.

```typescript
import { PubSub, decorator, RedisPubSub } from '@talosjs/pub-sub';

@decorator.pubsub()
class MyEventPubSub extends PubSub {
  // Implementation
}
```

## Advanced Usage

### Multiple Subscribers

```typescript
import { PubSub, RedisPubSub } from '@talosjs/pub-sub';

interface EventData extends Record<string, ScalarType> {
  type: string;
  payload: string;
}

// Subscriber 1: Log events
class EventLoggerPubSub extends PubSub<EventData> {
  public getChannel(): string {
    return 'events';
  }

  public async handler(context: { data: EventData }): Promise<void> {
    console.log('Event logged:', context.data);
  }
}

// Subscriber 2: Process events
class EventProcessorPubSub extends PubSub<EventData> {
  public getChannel(): string {
    return 'events';
  }

  public async handler(context: { data: EventData }): Promise<void> {
    await this.processEvent(context.data);
  }
}

// Both subscribe to the same channel
const client = new RedisPubSub();
const logger = new EventLoggerPubSub(client);
const processor = new EventProcessorPubSub(client);

await logger.subscribe();
await processor.subscribe();

// Both receive this message
await logger.publish({ type: 'user.created', payload: '{"id":"123"}' });
```

### Error Handling

```typescript
import { PubSub, RedisPubSub, PubSubException } from '@talosjs/pub-sub';

class ResilientPubSub extends PubSub<Record<string, ScalarType>> {
  public getChannel(): string {
    return 'resilient';
  }

  public async handler(context: { data: Record<string, ScalarType> }): Promise<void> {
    try {
      await this.processMessage(context.data);
    } catch (error) {
      console.error('Failed to process message:', error);
      // Optionally republish to dead letter channel
      await this.publishToDeadLetter(context.data, error);
    }
  }

  private async publishToDeadLetter(
    data: Record<string, ScalarType>, 
    error: unknown
  ): Promise<void> {
    // Dead letter queue logic
  }
}
```

### Integration with WebSocket

```typescript
import { Route } from '@talosjs/routing';
import { PubSub, RedisPubSub } from '@talosjs/pub-sub';
import type { IController, ContextType } from '@talosjs/socket';

interface ChatData extends Record<string, ScalarType> {
  roomId: string;
  userId: string;
  message: string;
}

// Pub/Sub for distributing messages across server instances
class ChatPubSub extends PubSub<ChatData> {
  public getChannel(): string {
    return 'chat:messages';
  }

  public async handler(context: { data: ChatData }): Promise<void> {
    // Broadcast to all connected WebSocket clients
    await this.broadcastToRoom(context.data.roomId, context.data);
  }
}

// WebSocket controller uses pub/sub for distributed messaging
@Route.socket({
  name: 'api.chat.send',
  path: '/ws/chat/:roomId',
  description: 'Send chat message'
})
class ChatController implements IController {
  private readonly chatPubSub = new ChatPubSub(new RedisPubSub());

  public async index(context: ContextType): Promise<IResponse> {
    const { roomId } = context.params;
    const { message } = context.payload;

    // Publish through Redis for distribution to all server instances
    await this.chatPubSub.publish({
      roomId,
      userId: context.user?.id ?? 'anonymous',
      message
    });

    return context.response.json({ sent: true });
  }
}
```

### Pattern-Based Subscriptions

```typescript
import { PubSub, RedisPubSub } from '@talosjs/pub-sub';

interface SystemEvent extends Record<string, ScalarType> {
  service: string;
  event: string;
  severity: string;
}

class SystemMonitorPubSub extends PubSub<SystemEvent> {
  constructor(
    client: RedisPubSub,
    private readonly servicePattern: string
  ) {
    super(client);
  }

  public getChannel(): string {
    return `system:${this.servicePattern}:events`;
  }

  public async handler(context: { 
    data: SystemEvent; 
    channel: string 
  }): Promise<void> {
    const { data, channel } = context;
    
    if (data.severity === 'critical') {
      await this.alertOncall(channel, data);
    }
    
    await this.logToMonitoring(data);
  }
}

// Monitor specific services
const apiMonitor = new SystemMonitorPubSub(new RedisPubSub(), 'api');
const dbMonitor = new SystemMonitorPubSub(new RedisPubSub(), 'database');
const cacheMonitor = new SystemMonitorPubSub(new RedisPubSub(), 'cache');

await apiMonitor.subscribe();
await dbMonitor.subscribe();
await cacheMonitor.subscribe();
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test tests`
4. Build the project: `bun run build` (from the package dir)

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team
