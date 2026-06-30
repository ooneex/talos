# @talosjs/cron

Cron job scheduler with timezone-aware scheduling, task lifecycle management, and structured logging for recurring background tasks. This package provides an abstract base class for creating scheduled jobs with a human-readable time syntax and seamless integration with the Talos framework.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Human-Readable Syntax** - Define schedules with intuitive syntax like "every 1 hours"

✅ **Timezone Support** - Run jobs in specific timezones using IANA timezone names

✅ **Task Lifecycle** - Programmatically start and stop scheduled jobs with active status tracking

✅ **Container Integration** - Register cron jobs with DI container via `@decorator.cron()`

✅ **Type-Safe** - Full TypeScript support with typed schedule expressions

✅ **Error Handling** - Structured error handling with `CronException`

✅ **Crontab Conversion** - Automatic conversion from human-readable syntax to crontab expressions

## Installation

```bash
bun add @talosjs/cron
```

## Usage

### Basic Cron Job

```typescript
import { Cron, type CronTimeType } from '@talosjs/cron';
import type { TimeZoneType } from '@talosjs/country';

class CleanupCron extends Cron {
  public getTime(): CronTimeType {
    return 'every 1 hours';
  }

  public getTimeZone(): TimeZoneType | null {
    return null; // Use server's local timezone
  }

  public async job(): Promise<void> {
    console.log('Running cleanup task...');
    // Cleanup logic here
  }
}

// Start the cron job
const cleanup = new CleanupCron();
await cleanup.start();
```

### With Timezone Support

```typescript
import { Cron, type CronTimeType } from '@talosjs/cron';
import type { TimeZoneType } from '@talosjs/country';

class DailyReportCron extends Cron {
  public getTime(): CronTimeType {
    return 'every 24 hours';
  }

  public getTimeZone(): TimeZoneType | null {
    return 'Europe/Paris'; // Run at Paris time
  }

  public async job(): Promise<void> {
    await this.generateDailyReport();
    await this.sendReportEmail();
  }

  private async generateDailyReport(): Promise<void> {
    // Report generation logic
  }

  private async sendReportEmail(): Promise<void> {
    // Email sending logic
  }
}
```

### Different Time Intervals

```typescript
import { Cron, type CronTimeType } from '@talosjs/cron';

// Every 30 seconds
class FrequentCheckCron extends Cron {
  public getTime(): CronTimeType {
    return 'every 30 seconds';
  }

  public getTimeZone(): null {
    return null;
  }

  public async job(): Promise<void> {
    console.log('Checking...');
  }
}

// Every 5 minutes
class CacheRefreshCron extends Cron {
  public getTime(): CronTimeType {
    return 'every 5 minutes';
  }

  public getTimeZone(): null {
    return null;
  }

  public async job(): Promise<void> {
    await this.refreshCache();
  }
}

// Every 7 days (weekly)
class WeeklyBackupCron extends Cron {
  public getTime(): CronTimeType {
    return 'every 7 days';
  }

  public getTimeZone(): TimeZoneType | null {
    return 'America/New_York';
  }

  public async job(): Promise<void> {
    await this.performBackup();
  }
}
```

### Controlling Cron Jobs

```typescript
import { Cron } from '@talosjs/cron';

const job = new MyCronJob();

// Start the job
await job.start();
console.log('Job is active:', job.isActive()); // true

// Stop the job
await job.stop();
console.log('Job is active:', job.isActive()); // false

// Restart the job
await job.start();
```

## API Reference

### Classes

#### `Cron` (Abstract)

Abstract base class for creating scheduled jobs.

**Abstract Methods to Implement:**

##### `getTime(): CronTimeType`

Returns the schedule timing for the job.

**Returns:** A string in the format `"every N units"` or `"in N units"`

**Example:**
```typescript
public getTime(): CronTimeType {
  return 'every 1 hours';
}
```

##### `getTimeZone(): TimeZoneType | null`

Returns the timezone for the job schedule.

**Returns:** IANA timezone string or `null` for server's local timezone

**Example:**
```typescript
public getTimeZone(): TimeZoneType | null {
  return 'Europe/London';
}
```

##### `job(): Promise<void>`

The task to execute on schedule.

**Example:**
```typescript
public async job(): Promise<void> {
  await this.performTask();
}
```

**Inherited Methods:**

##### `start(): Promise<void>`

Starts the cron job. If already active, does nothing.

**Throws:** `CronException` if the job fails to start

**Example:**
```typescript
const job = new MyCronJob();
await job.start();
```

##### `stop(): Promise<void>`

Stops the cron job.

**Example:**
```typescript
await job.stop();
```

##### `isActive(): boolean`

Checks if the cron job is currently running.

**Returns:** `true` if the job is active, `false` otherwise

**Example:**
```typescript
if (job.isActive()) {
  console.log('Job is running');
}
```

### Types

#### `CronTimeType`

String format for defining job schedules.

```typescript
type CronTimeType = `${PrefixType} ${number} ${SuffixType}`;
```

**Examples:**
- `'every 1 seconds'`
- `'every 30 seconds'`
- `'every 5 minutes'`
- `'every 1 hours'`
- `'every 24 hours'`
- `'every 7 days'`
- `'every 1 months'`
- `'every 1 years'`
- `'in 10 seconds'`
- `'in 5 minutes'`

#### `PrefixType`

```typescript
type PrefixType = 'in' | 'every';
```

#### `SuffixType`

```typescript
type SuffixType = 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years';
```

#### `CronClassType`

```typescript
type CronClassType = new (...args: any[]) => ICron;
```

### Enums

#### `ECronPrefix`

| Value | Description |
|-------|-------------|
| `IN` | Run once after specified time |
| `EVERY` | Run repeatedly at specified interval |

#### `ECronSuffix`

| Value | Description |
|-------|-------------|
| `SECONDS` | Time in seconds |
| `MINUTES` | Time in minutes |
| `HOURS` | Time in hours |
| `DAYS` | Time in days |
| `MONTHS` | Time in months |
| `YEARS` | Time in years |

### Interfaces

#### `ICron`

```typescript
interface ICron {
  getTime: () => Promise<CronTimeType> | CronTimeType;
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  job: () => Promise<void> | void;
  getTimeZone: () => TimeZoneType | null;
  isActive: () => Promise<boolean> | boolean;
}
```

## Advanced Usage

### Integration with Talos App

```typescript
import { App } from '@talosjs/app';
import { CleanupCron, BackupCron, ReportCron } from './cron';

const app = new App({
  cronJobs: [CleanupCron, BackupCron, ReportCron],
  // ... other config
});

await app.run();
// All cron jobs are automatically started
```

### Using Container Decorators

```typescript
import { Cron, decorator, type CronTimeType } from '@talosjs/cron';
import { container } from '@talosjs/container';

@decorator.cron()
class EmailQueueCron extends Cron {
  public getTime(): CronTimeType {
    return 'every 1 minutes';
  }

  public getTimeZone(): null {
    return null;
  }

  public async job(): Promise<void> {
    await this.processEmailQueue();
  }
}

// Job is automatically registered with container
const job = container.get(EmailQueueCron);
await job.start();
```

### Error Handling

```typescript
import { Cron, CronException, type CronTimeType } from '@talosjs/cron';

class RiskyJob extends Cron {
  public getTime(): CronTimeType {
    return 'every 5 minutes';
  }

  public getTimeZone(): null {
    return null;
  }

  public async job(): Promise<void> {
    try {
      await this.riskyOperation();
    } catch (error) {
      console.error('Job failed:', error);
      // Handle error without crashing the scheduler
    }
  }
}

// Handle startup errors
try {
  const job = new RiskyJob();
  await job.start();
} catch (error) {
  if (error instanceof CronException) {
    console.error('Failed to start cron job:', error.message);
  }
}
```

### Conditional Job Execution

```typescript
import { Cron, type CronTimeType } from '@talosjs/cron';

class ConditionalCron extends Cron {
  private enabled = true;

  public getTime(): CronTimeType {
    return 'every 1 hours';
  }

  public getTimeZone(): null {
    return null;
  }

  public async job(): Promise<void> {
    if (!this.enabled) {
      console.log('Job skipped - disabled');
      return;
    }

    await this.performTask();
  }

  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
  }
}
```

### Job with Logging

```typescript
import { Cron, type CronTimeType } from '@talosjs/cron';
import { container } from '@talosjs/container';
import type { ILogger } from '@talosjs/logger';

class LoggingCron extends Cron {
  private readonly logger = container.get<ILogger>('logger');

  public getTime(): CronTimeType {
    return 'every 30 minutes';
  }

  public getTimeZone(): TimeZoneType | null {
    return 'UTC';
  }

  public async job(): Promise<void> {
    this.logger.info('Cron job started', { job: 'LoggingCron' });

    try {
      await this.performTask();
      this.logger.success('Cron job completed', { job: 'LoggingCron' });
    } catch (error) {
      this.logger.error('Cron job failed', {
        job: 'LoggingCron',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
```

### Multiple Jobs with Shared Resources

```typescript
import { Cron, type CronTimeType } from '@talosjs/cron';
import { container } from '@talosjs/container';
import type { ICache } from '@talosjs/cache';
import type { IDatabase } from '@talosjs/database';

abstract class BaseCron extends Cron {
  protected readonly cache = container.get<ICache>('cache');
  protected readonly database = container.get<IDatabase>('database');
}

class CacheWarmupCron extends BaseCron {
  public getTime(): CronTimeType {
    return 'every 15 minutes';
  }

  public getTimeZone(): null {
    return null;
  }

  public async job(): Promise<void> {
    const data = await this.database.query('SELECT * FROM hot_data');
    await this.cache.set('hot_data', data, 900); // 15 min TTL
  }
}

class DataCleanupCron extends BaseCron {
  public getTime(): CronTimeType {
    return 'every 1 days';
  }

  public getTimeZone(): TimeZoneType | null {
    return 'UTC';
  }

  public async job(): Promise<void> {
    await this.database.query('DELETE FROM logs WHERE created_at < NOW() - INTERVAL 30 DAY');
    await this.cache.delete('old_cache_key');
  }
}
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
