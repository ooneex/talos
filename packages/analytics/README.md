# @talosjs/analytics

PostHog-powered analytics integration for tracking user behavior, product events, and feature usage with decorator-based service registration.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **PostHog Integration** - Native support for PostHog analytics platform

✅ **Event Tracking** - Capture user events with custom properties

✅ **User Identification** - Track events with distinct user IDs

✅ **Group Analytics** - Support for group-based event tracking

✅ **Type-Safe** - Full TypeScript support with proper type definitions

✅ **Container Integration** - Works seamlessly with dependency injection

## Installation

```bash
bun add @talosjs/analytics
```

## Usage

### Basic Event Tracking

```typescript
import { PostHogAnalytics } from '@talosjs/analytics';

const analytics = new PostHogAnalytics({
  apiKey: 'your-posthog-api-key'
});

// Track a simple event
analytics.capture({
  id: 'user-123',
  event: 'button_clicked'
});
```

### With Event Properties

```typescript
import { PostHogAnalytics } from '@talosjs/analytics';

const analytics = new PostHogAnalytics();

analytics.capture({
  id: 'user-123',
  event: 'purchase_completed',
  properties: {
    product_id: 'prod-456',
    price: 99.99,
    currency: 'USD',
    quantity: 1
  }
});
```

### Group Analytics

```typescript
import { PostHogAnalytics } from '@talosjs/analytics';

const analytics = new PostHogAnalytics();

analytics.capture({
  id: 'user-123',
  event: 'project_created',
  properties: {
    project_name: 'My Project'
  },
  groups: {
    company: 'company-789',
    team: 'engineering'
  }
});
```

### Using Environment Variables

```typescript
import { PostHogAnalytics } from '@talosjs/analytics';

// API key and host are read from environment variables
const analytics = new PostHogAnalytics();

analytics.capture({
  id: 'user-123',
  event: 'page_viewed',
  properties: {
    page: '/dashboard'
  }
});
```

**Environment Variables:**
- `ANALYTICS_POSTHOG_PROJECT_TOKEN` - Your PostHog API key
- `ANALYTICS_POSTHOG_HOST` - PostHog host URL (default: `https://eu.i.posthog.com`)

## API Reference

### Classes

#### `PostHogAnalytics`

Main analytics class for PostHog integration.

**Constructor:**
```typescript
new PostHogAnalytics(config?: PostHogConfigType)
```

**Parameters:**
- `config.apiKey` - PostHog API key (optional if set via environment variable)
- `config.host` - PostHog host URL (optional, defaults to EU region)

**Methods:**

##### `capture(options: PostHogCaptureOptionsType): void`

Captures an analytics event.

**Parameters:**
- `options.id` - Unique identifier for the user (distinctId)
- `options.event` - Name of the event to track
- `options.properties` - Optional custom properties for the event
- `options.groups` - Optional group identifiers for group analytics

**Example:**
```typescript
analytics.capture({
  id: 'user-123',
  event: 'signup_completed',
  properties: {
    plan: 'premium',
    source: 'landing_page'
  }
});
```

### Interfaces

#### `IAnalytics`

```typescript
interface IAnalytics<T = any> {
  capture: (options: T) => void;
}
```

### Types

#### `PostHogConfigType`

```typescript
type PostHogConfigType = {
  apiKey?: string;
  host?: string;
};
```

#### `PostHogCaptureOptionsType`

```typescript
type PostHogCaptureOptionsType = {
  id: string;
  event: string;
  properties?: Record<string, unknown>;
  groups?: Record<string, string | number>;
};
```

#### `AnalyticsClassType`

```typescript
type AnalyticsClassType = new (...args: any[]) => IAnalytics;
```

## Advanced Usage

### Integration with Talos App

```typescript
import { App } from '@talosjs/app';
import { PostHogAnalytics } from '@talosjs/analytics';

const app = new App({
  analytics: PostHogAnalytics,
  // ... other config
});
```

### Custom Analytics Implementation

```typescript
import { type IAnalytics, type PostHogCaptureOptionsType } from '@talosjs/analytics';

class CustomAnalytics implements IAnalytics<PostHogCaptureOptionsType> {
  public capture(options: PostHogCaptureOptionsType): void {
    // Custom implementation
    console.log(`Event: ${options.event}`, options.properties);
  }
}
```

### Integration with Dependency Injection

```typescript
import { container, EContainerScope } from '@talosjs/container';
import { PostHogAnalytics, decorator } from '@talosjs/analytics';

// Register analytics service
container.add(PostHogAnalytics, EContainerScope.Singleton);
container.addConstant('analytics', container.get(PostHogAnalytics));

// Resolve from container
const analytics = container.getConstant<PostHogAnalytics>('analytics');

analytics.capture({
  id: 'user-123',
  event: 'app_started'
});
```

### Error Handling

```typescript
import { PostHogAnalytics, AnalyticsException } from '@talosjs/analytics';

try {
  const analytics = new PostHogAnalytics();
  analytics.capture({
    id: 'user-123',
    event: 'test_event'
  });
} catch (error) {
  if (error instanceof AnalyticsException) {
    console.error('Analytics Error:', error.message);
  }
}
```

### Tracking Page Views

```typescript
import { PostHogAnalytics } from '@talosjs/analytics';

const analytics = new PostHogAnalytics();

function trackPageView(userId: string, path: string): void {
  analytics.capture({
    id: userId,
    event: '$pageview',
    properties: {
      $current_url: path,
      $host: 'example.com',
      $pathname: path
    }
  });
}

trackPageView('user-123', '/dashboard');
```

### Tracking User Properties

```typescript
import { PostHogAnalytics } from '@talosjs/analytics';

const analytics = new PostHogAnalytics();

// Set user properties using $set
analytics.capture({
  id: 'user-123',
  event: 'user_updated',
  properties: {
    email: 'user@example.com',
    plan: 'enterprise',
    signup_date: '2024-01-01'
  }
});
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
