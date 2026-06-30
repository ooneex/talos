# @talosjs/rate-limit

API rate limiting middleware with configurable throttling strategies, sliding window counters, and per-client request quota enforcement.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Redis-Backed** - Uses Bun.RedisClient for fast, distributed rate limiting across instances

✅ **Configurable Windows** - Set custom time windows and request limits per key

✅ **Counter-Based** - Atomic increment counters with automatic TTL expiry per window

✅ **Rate Limit Result** - Returns detailed results including remaining quota, total limit, and reset time

✅ **Key-Based Limiting** - Rate limit by any key (IP address, user ID, API key, etc.)

✅ **Reset Support** - Programmatically reset rate limit counters for specific keys

✅ **Count Inspection** - Query the current request count for any key

✅ **Auto-Reconnect** - Configurable Redis connection with auto-reconnect, retries, and pipelining

✅ **Dependency Injection** - Injectable via @talosjs/container for seamless DI integration

✅ **Environment Config** - Automatic Redis URL loading from RATE_LIMIT_REDIS_URL environment variable

## Installation

```bash
bun add @talosjs/rate-limit
```

## Usage

### Basic Rate Limiting

```typescript
import { RedisRateLimiter } from '@talosjs/rate-limit';

const limiter = new RedisRateLimiter({
  connectionString: 'redis://localhost:6379',
});

// Check if a client has exceeded their limit (100 requests per 60 seconds)
const result = await limiter.check('client-ip:192.168.1.1', 100, 60);

console.log(result.limited);    // false if under limit
console.log(result.remaining);  // remaining requests in window
console.log(result.total);      // total allowed requests
console.log(result.resetAt);    // Date when the window resets
```

### Reset and Inspect

```typescript
// Get current request count for a key
const count = await limiter.getCount('client-ip:192.168.1.1');

// Reset the rate limit for a key
const wasReset = await limiter.reset('client-ip:192.168.1.1');
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Made with love by the Talos team
