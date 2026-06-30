# @talosjs/permission

Fine-grained access control using CASL -- define, evaluate, and enforce ability-based permissions with role and resource scoping.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **CASL Integration** - Built on the battle-tested CASL library for ability management

✅ **60+ Permission Actions** - Comprehensive set of actions from CRUD to complex operations

✅ **Subject-Based Permissions** - Define permissions for specific entity types

✅ **Field-Level Control** - Restrict access to specific fields within subjects

✅ **User-Aware Permissions** - Set permissions dynamically based on user context

✅ **Type-Safe** - Full TypeScript support with proper type definitions

✅ **Container Integration** - Works seamlessly with dependency injection

✅ **Framework Integration** - Integrates with Talos routing for route-level permissions

## Installation

```bash
bun add @talosjs/permission
```

## Usage

### Creating a Permission Class

```typescript
import { Permission, EPermissionAction, EPermissionSubject } from '@talosjs/permission';
import type { IUser } from '@talosjs/user';

class UserPermission extends Permission {
  private user: IUser | null = null;

  public allow(): this {
    // Define what actions are allowed
    this.ability.can(EPermissionAction.READ, EPermissionSubject.USER);
    this.ability.can(EPermissionAction.VIEW, EPermissionSubject.USER);
    return this;
  }

  public forbid(): this {
    // Define what actions are forbidden
    this.ability.cannot(EPermissionAction.DELETE, EPermissionSubject.USER);
    return this;
  }

  public setUserPermissions(user: IUser | null): this {
    this.user = user;
    
    if (user) {
      // Authenticated users can update their own profile
      this.ability.can(EPermissionAction.UPDATE, EPermissionSubject.USER);
    }
    
    return this;
  }

  public async check(): Promise<boolean> {
    return this.user !== null;
  }
}
```

### Using Permissions

```typescript
import { UserPermission } from './permissions/UserPermission';
import { EPermissionAction, EPermissionSubject } from '@talosjs/permission';

const permission = new UserPermission();

// Set up permissions for a user
permission
  .setUserPermissions(currentUser)
  .allow()
  .forbid()
  .build();

// Check if action is allowed
if (permission.can(EPermissionAction.UPDATE, EPermissionSubject.USER)) {
  console.log('User can update');
}

// Check if action is forbidden
if (permission.cannot(EPermissionAction.DELETE, EPermissionSubject.USER)) {
  console.log('User cannot delete');
}
```

### Route-Level Permissions

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';
import { UserPermission } from './permissions/UserPermission';

@Route.http({
  name: 'api.users.update',
  path: '/api/users/:id',
  method: 'PUT',
  description: 'Update user profile',
  permission: UserPermission
})
class UserUpdateController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    // Permission is automatically checked before reaching this handler
    const { id } = context.params;
    const user = await this.userService.update(id, context.payload);
    
    return context.response.json({ user });
  }
}
```

### Field-Level Permissions

```typescript
import { Permission, EPermissionAction, EPermissionSubject } from '@talosjs/permission';
import type { IUser } from '@talosjs/user';

class UserFieldPermission extends Permission {
  public allow(): this {
    // Allow reading only specific fields
    this.ability.can(EPermissionAction.READ, EPermissionSubject.USER, 'name');
    this.ability.can(EPermissionAction.READ, EPermissionSubject.USER, 'email');
    return this;
  }

  public forbid(): this {
    // Forbid reading sensitive fields
    this.ability.cannot(EPermissionAction.READ, EPermissionSubject.USER, 'password');
    this.ability.cannot(EPermissionAction.READ, EPermissionSubject.USER, 'secretKey');
    return this;
  }

  public setUserPermissions(user: IUser | null): this {
    return this;
  }

  public async check(): Promise<boolean> {
    return true;
  }
}

// Usage
const permission = new UserFieldPermission();
permission.allow().forbid().build();

permission.can(EPermissionAction.READ, EPermissionSubject.USER, 'name');     // true
permission.can(EPermissionAction.READ, EPermissionSubject.USER, 'password'); // false
```

### Custom Subjects

```typescript
import { Permission, EPermissionAction } from '@talosjs/permission';
import type { IUser } from '@talosjs/user';

// Define custom subjects for your domain
type CustomSubjects = 'Article' | 'Comment' | 'Category';

class ArticlePermission extends Permission<CustomSubjects> {
  public allow(): this {
    this.ability.can(EPermissionAction.READ, 'Article');
    this.ability.can(EPermissionAction.CREATE, 'Article');
    return this;
  }

  public forbid(): this {
    this.ability.cannot(EPermissionAction.DELETE, 'Article');
    return this;
  }

  public setUserPermissions(user: IUser | null): this {
    if (user) {
      this.ability.can(EPermissionAction.UPDATE, 'Article');
    }
    return this;
  }

  public async check(): Promise<boolean> {
    return true;
  }
}
```

## API Reference

### Classes

#### `Permission<S>`

Abstract base class for creating permission implementations.

**Type Parameter:**
- `S` - Additional subject types (optional)

**Constructor:**
```typescript
new Permission()
```

**Abstract Methods:**

##### `allow(): this`

Define allowed actions for subjects.

**Returns:** Self for chaining

##### `forbid(): this`

Define forbidden actions for subjects.

**Returns:** Self for chaining

##### `setUserPermissions(user: IUser | null): this`

Set permissions based on the current user context.

**Parameters:**
- `user` - The current user or null for guests

**Returns:** Self for chaining

##### `check(): Promise<boolean>`

Perform custom permission validation logic.

**Returns:** Promise resolving to true if permission check passes

**Concrete Methods:**

##### `build(): this`

Build the ability after defining permissions. Must be called before using `can` or `cannot`.

**Returns:** Self for chaining

**Throws:** None, but `can`/`cannot` will throw if not called

##### `can(action: PermissionActionType, subject: Subjects | S, field?: string): boolean`

Check if an action is allowed on a subject.

**Parameters:**
- `action` - The action to check
- `subject` - The subject to check against
- `field` - Optional field name for field-level permissions

**Returns:** `true` if action is allowed

**Throws:** `PermissionException` if `build()` was not called

##### `cannot(action: PermissionActionType, subject: Subjects | S, field?: string): boolean`

Check if an action is forbidden on a subject.

**Parameters:**
- `action` - The action to check
- `subject` - The subject to check against
- `field` - Optional field name for field-level permissions

**Returns:** `true` if action is forbidden

**Throws:** `PermissionException` if `build()` was not called

### Enums

#### `EPermissionAction`

Comprehensive enum of permission actions.

**CRUD Operations:**
| Action | Value | Description |
|--------|-------|-------------|
| `CREATE` | `create` | Create new resources |
| `READ` | `read` | Read/view resources |
| `UPDATE` | `update` | Update existing resources |
| `DELETE` | `delete` | Delete resources |
| `MANAGE` | `manage` | Full management (all actions) |

**Content Operations:**
| Action | Value | Description |
|--------|-------|-------------|
| `VIEW` | `view` | View content |
| `EDIT` | `edit` | Edit content |
| `PUBLISH` | `publish` | Publish content |
| `ARCHIVE` | `archive` | Archive content |
| `APPROVE` | `approve` | Approve content |
| `REJECT` | `reject` | Reject content |

**File Operations:**
| Action | Value | Description |
|--------|-------|-------------|
| `DOWNLOAD` | `download` | Download files |
| `UPLOAD` | `upload` | Upload files |
| `COPY` | `copy` | Copy resources |
| `MOVE` | `move` | Move resources |
| `EXPORT` | `export` | Export data |
| `IMPORT` | `import` | Import data |

**Social Operations:**
| Action | Value | Description |
|--------|-------|-------------|
| `SHARE` | `share` | Share resources |
| `COMMENT` | `comment` | Add comments |
| `RATE` | `rate` | Rate content |
| `LIKE` | `like` | Like content |
| `DISLIKE` | `dislike` | Dislike content |
| `FOLLOW` | `follow` | Follow users/content |
| `UNFOLLOW` | `unfollow` | Unfollow |
| `SUBSCRIBE` | `subscribe` | Subscribe |
| `UNSUBSCRIBE` | `unsubscribe` | Unsubscribe |
| `BOOKMARK` | `bookmark` | Bookmark content |

**User Management:**
| Action | Value | Description |
|--------|-------|-------------|
| `INVITE` | `invite` | Invite users |
| `ASSIGN` | `assign` | Assign resources |
| `UNASSIGN` | `unassign` | Unassign resources |
| `GRANT` | `grant` | Grant permissions |
| `DENY` | `deny` | Deny permissions |
| `REVOKE` | `revoke` | Revoke access |

**Moderation:**
| Action | Value | Description |
|--------|-------|-------------|
| `BLOCK` | `block` | Block users |
| `UNBLOCK` | `unblock` | Unblock users |
| `REPORT` | `report` | Report content |
| `MODERATE` | `moderate` | Moderate content |
| `BAN` | `ban` | Ban users |
| `UNBAN` | `unban` | Unban users |

**System Operations:**
| Action | Value | Description |
|--------|-------|-------------|
| `EXECUTE` | `execute` | Execute operations |
| `RESTORE` | `restore` | Restore deleted |
| `PURGE` | `purge` | Permanently delete |
| `BACKUP` | `backup` | Backup data |
| `SYNC` | `sync` | Synchronize data |
| `CONFIGURE` | `configure` | Configure settings |
| `MONITOR` | `monitor` | Monitor system |
| `AUDIT` | `audit` | Audit actions |

**Additional Operations:**
| Action | Value | Description |
|--------|-------|-------------|
| `SEARCH` | `search` | Search resources |
| `FILTER` | `filter` | Filter resources |
| `SORT` | `sort` | Sort resources |
| `TAG` | `tag` | Tag resources |
| `UNTAG` | `untag` | Remove tags |
| `LOCK` | `lock` | Lock resources |
| `UNLOCK` | `unlock` | Unlock resources |
| `CLONE` | `clone` | Clone resources |
| `FORK` | `fork` | Fork resources |
| `MERGE` | `merge` | Merge resources |
| `SPLIT` | `split` | Split resources |
| `VALIDATE` | `validate` | Validate data |
| `VERIFY` | `verify` | Verify data |
| `CANCEL` | `cancel` | Cancel operations |
| `PAUSE` | `pause` | Pause operations |
| `RESUME` | `resume` | Resume operations |
| `SCHEDULE` | `schedule` | Schedule operations |
| `UNSCHEDULE` | `unschedule` | Unschedule |
| `JOIN` | `join` | Join groups |
| `HIDE` | `hide` | Hide content |

#### `EPermissionSubject`

Enum of common permission subjects.

| Subject | Value | Description |
|---------|-------|-------------|
| `USER_ENTITY` | `UserEntity` | User database entity |
| `AUTH_USER_ENTITY` | `AuthUserEntity` | Auth user entity |
| `AUTH_USER` | `AuthUser` | Authenticated user |
| `SYSTEM_ENTITY` | `SystemEntity` | System entity |
| `SYSTEM` | `System` | System subject |
| `USER` | `User` | User subject |
| `ALL` | `all` | All subjects (wildcard) |

### Types

#### `PermissionActionType`

String literal type for permission actions.

```typescript
type PermissionActionType = `${EPermissionAction}`;
// "create" | "read" | "update" | "delete" | "manage" | ...
```

#### `Subjects`

String literal type for permission subjects.

```typescript
type Subjects = `${EPermissionSubject}`;
// "UserEntity" | "AuthUserEntity" | "User" | "System" | "all" | ...
```

#### `PermissionClassType`

Type for permission class constructors.

```typescript
type PermissionClassType = new (...args: any[]) => IPermission;
```

### Interfaces

#### `IPermission<S>`

Interface for permission implementations.

```typescript
interface IPermission<S extends string = string> {
  allow: () => IPermission<S>;
  forbid: () => IPermission<S>;
  setUserPermissions: (user: IUser | null) => IPermission<S>;
  check: () => Promise<boolean>;
  build: () => IPermission<S>;
  can: (action: PermissionActionType, subject: Subjects | S, field?: string) => boolean;
  cannot: (action: PermissionActionType, subject: Subjects | S, field?: string) => boolean;
}
```

### Exceptions

#### `PermissionException`

Thrown when permission operations fail.

```typescript
import { Permission, PermissionException } from '@talosjs/permission';

try {
  const permission = new MyPermission();
  // Forgot to call build()
  permission.can('read', 'User');
} catch (error) {
  if (error instanceof PermissionException) {
    console.error('Permission error:', error.message);
  }
}
```

### Decorators

#### `@decorator.permission()`

Decorator to register permission classes with the DI container.

```typescript
import { Permission, decorator } from '@talosjs/permission';

@decorator.permission()
class ArticlePermission extends Permission {
  // Implementation
}
```

## Advanced Usage

### Role-Based Permission

```typescript
import { Permission, EPermissionAction } from '@talosjs/permission';
import { ERole } from '@talosjs/role';
import type { IUser } from '@talosjs/user';

class AdminPermission extends Permission {
  private user: IUser | null = null;

  public allow(): this {
    return this;
  }

  public forbid(): this {
    return this;
  }

  public setUserPermissions(user: IUser | null): this {
    this.user = user;
    
    if (!user) return this;

    // Set permissions based on role
    switch (user.role) {
      case 'ROLE_SUPER_ADMIN':
        this.ability.can(EPermissionAction.MANAGE, 'all');
        break;
      
      case 'ROLE_ADMIN':
        this.ability.can(EPermissionAction.CREATE, 'User');
        this.ability.can(EPermissionAction.READ, 'User');
        this.ability.can(EPermissionAction.UPDATE, 'User');
        this.ability.cannot(EPermissionAction.DELETE, 'User');
        break;
      
      case 'ROLE_MODERATOR':
        this.ability.can(EPermissionAction.READ, 'User');
        this.ability.can(EPermissionAction.MODERATE, 'User');
        this.ability.can(EPermissionAction.BAN, 'User');
        break;
      
      default:
        this.ability.can(EPermissionAction.READ, 'User');
    }
    
    return this;
  }

  public async check(): Promise<boolean> {
    return this.user !== null;
  }
}
```

### Ownership-Based Permissions

```typescript
import { Permission, EPermissionAction } from '@talosjs/permission';
import type { IUser } from '@talosjs/user';

class ArticleOwnerPermission extends Permission<'Article'> {
  private user: IUser | null = null;
  private articleOwnerId: string | null = null;

  public setArticleOwner(ownerId: string): this {
    this.articleOwnerId = ownerId;
    return this;
  }

  public allow(): this {
    this.ability.can(EPermissionAction.READ, 'Article');
    return this;
  }

  public forbid(): this {
    return this;
  }

  public setUserPermissions(user: IUser | null): this {
    this.user = user;
    
    if (user && this.articleOwnerId === user.id) {
      // Owner can do everything with their article
      this.ability.can(EPermissionAction.UPDATE, 'Article');
      this.ability.can(EPermissionAction.DELETE, 'Article');
      this.ability.can(EPermissionAction.PUBLISH, 'Article');
    }
    
    return this;
  }

  public async check(): Promise<boolean> {
    return this.user !== null && this.articleOwnerId !== null;
  }
}

// Usage
const permission = new ArticleOwnerPermission();
permission
  .setArticleOwner(article.userId)
  .setUserPermissions(currentUser)
  .allow()
  .build();

if (permission.can(EPermissionAction.DELETE, 'Article')) {
  await articleService.delete(articleId);
}
```

### Permission Factory

```typescript
import { Permission, EPermissionAction, type PermissionClassType } from '@talosjs/permission';
import { container } from '@talosjs/container';

function createPermissionFor(resource: string): PermissionClassType {
  return class extends Permission {
    public allow(): this {
      this.ability.can(EPermissionAction.READ, resource);
      return this;
    }

    public forbid(): this {
      return this;
    }

    public setUserPermissions(user: IUser | null): this {
      if (user) {
        this.ability.can(EPermissionAction.CREATE, resource);
        this.ability.can(EPermissionAction.UPDATE, resource);
      }
      return this;
    }

    public async check(): Promise<boolean> {
      return true;
    }
  };
}

// Create permissions dynamically
const ArticlePermission = createPermissionFor('Article');
const CommentPermission = createPermissionFor('Comment');
const CategoryPermission = createPermissionFor('Category');
```

### Controller with Permission Check

```typescript
import { Route } from '@talosjs/routing';
import { EPermissionAction } from '@talosjs/permission';
import type { IController, ContextType } from '@talosjs/controller';
import { ArticlePermission } from './permissions/ArticlePermission';

@Route.http({
  name: 'api.articles.delete',
  path: '/api/articles/:id',
  method: 'DELETE',
  description: 'Delete an article',
  permission: ArticlePermission
})
class ArticleDeleteController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    const { id } = context.params;
    const article = await this.articleService.findById(id);

    // Additional ownership check
    const permission = new ArticlePermission();
    permission
      .setArticleOwner(article.userId)
      .setUserPermissions(context.user)
      .allow()
      .forbid()
      .build();

    if (permission.cannot(EPermissionAction.DELETE, 'Article')) {
      return context.response.exception('Not authorized to delete this article', {
        status: 403
      });
    }

    await this.articleService.delete(id);
    
    return context.response.json({ deleted: true });
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
