# @talosjs/exception

Structured exception handling with HTTP status code mapping, typed error data, and JSON-formatted stack traces for consistent error reporting. This package provides a base `Exception` class and specialized exception types for common HTTP error scenarios with rich metadata including timestamps, status codes, and structured stack traces.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **HTTP Status Mapping** - Built-in support for all HTTP status codes via `@talosjs/http-status`

✅ **JSON Stack Traces** - Parse stack traces into structured JSON arrays for logging and debugging

✅ **Typed Error Data** - Include timestamps, custom data, and original errors with read-only access

✅ **Specialized Exceptions** - Pre-built `BadRequestException`, `NotFoundException`, `UnauthorizedException`, and `MethodNotAllowedException`

✅ **Type-Safe** - Full TypeScript support with `IException` interface and `ExceptionStackFrameType`

✅ **Immutable Data** - Exception data is frozen after creation

✅ **Native Error Wrapping** - Wrap native JavaScript errors while preserving context and stack traces

## Installation

```bash
bun add @talosjs/exception
```

## Usage

### Basic Exception

```typescript
import { Exception } from '@talosjs/exception';

throw new Exception('Something went wrong');
```

### With HTTP Status Code

```typescript
import { Exception } from '@talosjs/exception';
import { HttpStatus } from '@talosjs/http-status';

throw new Exception('Resource not found', {
  status: HttpStatus.Code.NotFound
});
```

### With Custom Data

```typescript
import { Exception } from '@talosjs/exception';

throw new Exception('Validation failed', {
  status: 400,
  data: {
    field: 'email',
    value: 'invalid-email',
    constraint: 'Must be a valid email address'
  }
});
```

### Specialized Exceptions

```typescript
import {
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  MethodNotAllowedException
} from '@talosjs/exception';

// 404 Not Found
throw new NotFoundException('User not found', {
  data: { userId: '123' }
});

// 400 Bad Request
throw new BadRequestException('Invalid input', {
  data: { errors: ['email is required', 'name is too short'] }
});

// 401 Unauthorized
throw new UnauthorizedException('Invalid credentials');

// 405 Method Not Allowed
throw new MethodNotAllowedException('POST method not allowed on this endpoint');
```

### Wrapping Native Errors

```typescript
import { Exception } from '@talosjs/exception';

try {
  JSON.parse('invalid json');
} catch (error) {
  throw new Exception(error as Error, {
    status: 500,
    data: { context: 'Parsing configuration file' }
  });
}
```

### Accessing Stack Trace as JSON

```typescript
import { Exception } from '@talosjs/exception';

try {
  throw new Exception('Test error');
} catch (error) {
  if (error instanceof Exception) {
    const stackFrames = error.stackToJson();
    
    stackFrames?.forEach((frame, index) => {
      console.log(`${index + 1}. ${frame.functionName || '<anonymous>'}`);
      console.log(`   at ${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}`);
    });
  }
}
```

## API Reference

### Classes

#### `Exception`

Base exception class that extends the native `Error` with additional metadata.

**Constructor:**
```typescript
new Exception(
  message: string | Error,
  options?: {
    status?: StatusCodeType;
    data?: Record<string, unknown>;
  }
)
```

**Parameters:**
- `message` - Error message string or native Error object to wrap
- `options.status` - HTTP status code (default: 500)
- `options.data` - Additional contextual data

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `date` | `Date` | Timestamp when the exception was created |
| `status` | `StatusCodeType` | HTTP status code |
| `data` | `Readonly<Record<string, unknown>>` | Immutable custom data |
| `native` | `Error \| undefined` | Original Error if wrapping a native error |
| `message` | `string` | Error message |
| `name` | `string` | Exception class name |
| `stack` | `string \| undefined` | Stack trace string |

**Methods:**

##### `stackToJson(): ExceptionStackFrameType[] | null`

Converts the stack trace into a structured JSON array.

**Returns:** Array of stack frames or null if no stack trace is available

**Example:**
```typescript
const exception = new Exception('Test error');
const frames = exception.stackToJson();

console.log(frames);
// [
//   {
//     functionName: 'myFunction',
//     fileName: '/path/to/file.ts',
//     lineNumber: 42,
//     columnNumber: 15,
//     source: '    at myFunction (/path/to/file.ts:42:15)'
//   },
//   ...
// ]
```

#### `BadRequestException`

Exception for 400 Bad Request errors.

```typescript
new BadRequestException(message: string, options?: { data?: Record<string, unknown> })
```

#### `NotFoundException`

Exception for 404 Not Found errors.

```typescript
new NotFoundException(message: string, options?: { data?: Record<string, unknown> })
```

#### `UnauthorizedException`

Exception for 401 Unauthorized errors.

```typescript
new UnauthorizedException(message: string, options?: { data?: Record<string, unknown> })
```

#### `MethodNotAllowedException`

Exception for 405 Method Not Allowed errors.

```typescript
new MethodNotAllowedException(message: string, options?: { data?: Record<string, unknown> })
```

### Types

#### `IException`

```typescript
interface IException {
  readonly date: Date;
  readonly status: StatusCodeType;
  readonly data: Readonly<Record<string, unknown>>;
  readonly native?: Error;
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
  stackToJson: () => ExceptionStackFrameType[] | null;
}
```

#### `ExceptionStackFrameType`

```typescript
type ExceptionStackFrameType = {
  functionName?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  source: string;
};
```

## Advanced Usage

### Creating Custom Exceptions

```typescript
import { Exception } from '@talosjs/exception';
import { HttpStatus } from '@talosjs/http-status';

class ValidationException extends Exception {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message, {
      status: HttpStatus.Code.BadRequest,
      data: { errors }
    });
    this.name = 'ValidationException';
  }
}

throw new ValidationException('Validation failed', [
  'Email is required',
  'Password must be at least 8 characters'
]);
```

### Error Handling in Controllers

```typescript
import { Exception, NotFoundException, BadRequestException } from '@talosjs/exception';
import type { IController, ContextType } from '@talosjs/controller';

class UserController implements IController {
  public async index(context: ContextType) {
    try {
      const user = await this.findUser(context.params.id);
      return context.response.json({ user });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return context.response.notFound(error.message, {
          data: error.data
        });
      }
      
      if (error instanceof Exception) {
        return context.response.exception(error.message, {
          status: error.status,
          data: error.data
        });
      }
      
      throw error;
    }
  }
}
```

### Logging Exceptions

```typescript
import { Exception } from '@talosjs/exception';
import { TerminalLogger } from '@talosjs/logger';

const logger = new TerminalLogger();

try {
  // Some operation that might fail
  throw new Exception('Database connection failed', {
    status: 500,
    data: { host: 'localhost', port: 5432 }
  });
} catch (error) {
  if (error instanceof Exception) {
    logger.error(error);
  }
}
```

### Serializing Exceptions for API Responses

```typescript
import { Exception } from '@talosjs/exception';

function serializeException(exception: Exception) {
  return {
    error: {
      message: exception.message,
      status: exception.status,
      timestamp: exception.date.toISOString(),
      data: exception.data,
      stack: process.env.NODE_ENV !== 'production' 
        ? exception.stackToJson() 
        : undefined
    }
  };
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
