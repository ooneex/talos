# @talosjs/socket

WebSocket server implementation with room management, event broadcasting, client tracking, and middleware integration for real-time applications.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **IController Interface** - Standard interface for WebSocket controller implementations with typed context

✅ **Channel Management** - Subscribe, unsubscribe, publish, and send messages through typed channel API

✅ **Pub/Sub Support** - Built-in publish/subscribe pattern with `channel.publish()` and `channel.subscribe()`

✅ **Type-Safe Context** - Generic `ContextType` extending the HTTP controller context with WebSocket channel operations

✅ **Connection Lifecycle** - Close connections with status codes and reasons via `channel.close()`

✅ **Framework Integration** - Extends `@talosjs/controller` context and works with `@talosjs/routing` socket decorators

## Installation

```bash
bun add @talosjs/socket
```

## Usage

### Basic WebSocket Controller

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';
import type { IResponse } from '@talosjs/http-response';

@Route.socket({
  name: 'api.chat.connect',
  path: '/ws/chat',
  description: 'Connect to chat WebSocket'
})
class ChatController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    // Subscribe to the channel
    await context.channel.subscribe();
    
    return context.response.json({
      connected: true,
      message: 'Welcome to the chat!'
    });
  }
}
```

### WebSocket with Room Support

```typescript
import { Route } from '@talosjs/routing';
import { type } from '@talosjs/validation';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.rooms.join',
  path: '/ws/rooms/:roomId',
  description: 'Join a specific room',
  params: {
    roomId: type('string')
  }
})
class RoomController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { roomId } = context.params;
    
    // Subscribe to the room channel
    await context.channel.subscribe();
    
    // Notify other users in the room
    await context.channel.publish(
      context.response.json({
        event: 'user_joined',
        roomId,
        userId: context.user?.id
      })
    );
    
    return context.response.json({
      joined: true,
      roomId
    });
  }
}
```

### Sending Messages

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.messages.send',
  path: '/ws/messages',
  description: 'Send a message'
})
class MessageController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { message, recipientId } = context.payload;
    
    // Send response back to the sender
    await context.channel.send(
      context.response.json({
        event: 'message_sent',
        message,
        timestamp: new Date().toISOString()
      })
    );
    
    return context.response.json({ success: true });
  }
}
```

### Broadcasting to Channel

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.notifications.broadcast',
  path: '/ws/notifications',
  description: 'Broadcast notifications'
})
class NotificationController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { title, body } = context.payload;
    
    // Subscribe first
    await context.channel.subscribe();
    
    // Publish to all subscribers
    await context.channel.publish(
      context.response.json({
        event: 'notification',
        title,
        body,
        timestamp: new Date().toISOString()
      })
    );
    
    return context.response.json({ broadcasted: true });
  }
}
```

### Managing Subscriptions

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.presence.toggle',
  path: '/ws/presence',
  description: 'Toggle presence subscription'
})
class PresenceController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { channel } = context;
    
    // Check subscription status
    if (channel.isSubscribed()) {
      // Unsubscribe from channel
      await channel.unsubscribe();
      
      return context.response.json({
        subscribed: false,
        message: 'Unsubscribed from presence updates'
      });
    }
    
    // Subscribe to channel
    await channel.subscribe();
    
    return context.response.json({
      subscribed: true,
      message: 'Subscribed to presence updates'
    });
  }
}
```

### Closing Connections

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.connection.close',
  path: '/ws/disconnect',
  description: 'Close WebSocket connection'
})
class DisconnectController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { channel } = context;
    
    // Clean up subscription
    if (channel.isSubscribed()) {
      await channel.unsubscribe();
    }
    
    // Close the connection with a code and reason
    channel.close(1000, 'User disconnected');
    
    return context.response.json({ disconnected: true });
  }
}
```

## API Reference

### Interfaces

#### `IController<T>`

Interface for WebSocket controllers.

```typescript
interface IController<T extends ContextConfigType = ContextConfigType> {
  index: (context: ContextType<T>) => Promise<IResponse<T["response"]>> | IResponse<T["response"]>;
}
```

### Types

#### `ContextType<T>`

Extended context type for WebSocket controllers with channel management.

```typescript
type ContextType<T extends ContextConfigType = ContextConfigType> = ControllerContextType<T> & {
  channel: {
    send: (response: IResponse<T["response"]>) => Promise<void>;
    close(code?: number, reason?: string): void;
    subscribe: () => Promise<void>;
    isSubscribed(): boolean;
    unsubscribe: () => Promise<void>;
    publish: (response: IResponse<T["response"]>) => Promise<void>;
  };
};
```

**Channel Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `send(response)` | `Promise<void>` | Send a message to the connected client |
| `close(code?, reason?)` | `void` | Close the WebSocket connection |
| `subscribe()` | `Promise<void>` | Subscribe to the channel |
| `isSubscribed()` | `boolean` | Check if currently subscribed |
| `unsubscribe()` | `Promise<void>` | Unsubscribe from the channel |
| `publish(response)` | `Promise<void>` | Publish message to all channel subscribers |

#### `ContextConfigType`

Configuration type for socket context.

```typescript
type ContextConfigType = {
  response: Record<string, unknown>;
} & RequestConfigType;
```

#### `ControllerClassType`

Type for socket controller class constructors.

```typescript
type ControllerClassType = new (...args: any[]) => IController;
```

## Client Usage

Import the client for frontend applications:

```typescript
import { /* client exports */ } from '@talosjs/socket/client';
```

### Basic Client Connection

```typescript
// Connect to WebSocket endpoint
const ws = new WebSocket('wss://api.example.com/ws/chat');

ws.onopen = () => {
  console.log('Connected to WebSocket');
  
  // Send a message
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'general'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onclose = (event) => {
  console.log('Disconnected:', event.code, event.reason);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

## Advanced Usage

### Typed Socket Controller

```typescript
import { Route } from '@talosjs/routing';
import { type } from '@talosjs/validation';
import type { IController, ContextType, ContextConfigType } from '@talosjs/socket';

interface ChatConfig extends ContextConfigType {
  params: { roomId: string };
  payload: { message: string; type: 'text' | 'image' };
  queries: Record<string, never>;
  response: {
    event: string;
    data: unknown;
    timestamp: string;
  };
}

@Route.socket({
  name: 'api.chat.message',
  path: '/ws/chat/:roomId',
  description: 'Send chat message',
  params: { roomId: type('string') },
  payload: type({
    message: 'string',
    type: "'text' | 'image'"
  })
})
class ChatMessageController implements IController<ChatConfig> {
  public async index(context: ContextType<ChatConfig>): Promise<IResponse<ChatConfig['response']>> {
    const { roomId } = context.params;
    const { message, type } = context.payload;
    
    // TypeScript knows the exact types
    await context.channel.publish(
      context.response.json({
        event: 'new_message',
        data: { roomId, message, type, userId: context.user?.id },
        timestamp: new Date().toISOString()
      })
    );
    
    return context.response.json({
      event: 'message_sent',
      data: { messageId: crypto.randomUUID() },
      timestamp: new Date().toISOString()
    });
  }
}
```

### Real-Time Notifications

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.notifications.stream',
  path: '/ws/notifications/:userId',
  description: 'Stream user notifications'
})
class NotificationStreamController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { userId } = context.params;
    
    // Only allow users to subscribe to their own notifications
    if (context.user?.id !== userId) {
      return context.response.exception('Unauthorized', { status: 403 });
    }
    
    await context.channel.subscribe();
    
    // Send initial notification count
    const unreadCount = await this.notificationService.getUnreadCount(userId);
    
    return context.response.json({
      subscribed: true,
      unreadCount
    });
  }
}
```

### Live Collaboration

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.docs.collaborate',
  path: '/ws/docs/:documentId',
  description: 'Real-time document collaboration'
})
class DocumentCollaborationController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { documentId } = context.params;
    const { action, content, cursor } = context.payload;
    
    await context.channel.subscribe();
    
    switch (action) {
      case 'edit':
        await context.channel.publish(
          context.response.json({
            event: 'content_update',
            documentId,
            userId: context.user?.id,
            content
          })
        );
        break;
        
      case 'cursor':
        await context.channel.publish(
          context.response.json({
            event: 'cursor_move',
            documentId,
            userId: context.user?.id,
            cursor
          })
        );
        break;
    }
    
    return context.response.json({ success: true });
  }
}
```

### WebSocket with Authentication

```typescript
import { Route } from '@talosjs/routing';
import { ERole } from '@talosjs/role';
import type { IController, ContextType } from '@talosjs/socket';

@Route.socket({
  name: 'api.admin.dashboard',
  path: '/ws/admin/dashboard',
  description: 'Admin real-time dashboard',
  roles: ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN']
})
class AdminDashboardController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    // User is guaranteed to have ADMIN or SUPER_ADMIN role
    await context.channel.subscribe();
    
    // Stream real-time metrics
    return context.response.json({
      connected: true,
      role: context.user?.role,
      subscribedAt: new Date().toISOString()
    });
  }
}
```

## WebSocket Close Codes

Common WebSocket close codes you can use:

| Code | Name | Description |
|------|------|-------------|
| `1000` | Normal Closure | Normal connection closure |
| `1001` | Going Away | Endpoint is going away |
| `1002` | Protocol Error | Protocol error |
| `1003` | Unsupported Data | Received unsupported data type |
| `1008` | Policy Violation | Message violates policy |
| `1011` | Internal Error | Server encountered an error |

```typescript
// Close with specific code and reason
context.channel.close(1000, 'Session ended');
context.channel.close(1008, 'Message too large');
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
