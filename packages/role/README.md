# @talosjs/role

Config-agnostic role-based authorization utilities for defining user roles, hierarchies, and access levels in multi-tenant applications.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Config-Agnostic** - Define your own role names and hierarchy via YAML or code

✅ **Role Hierarchy** - Hierarchical role system with graph-based inheritance

✅ **Inheritance-Based Access** - Check permissions through the inheritance graph

✅ **Type-Safe** - Full TypeScript support using `Uppercase<string>` role types

✅ **Zero Dependencies** - Lightweight with no external runtime dependencies

✅ **Framework Integration** - Works seamlessly with Talos routing and controllers

## Installation

```bash
bun add @talosjs/role
```

## Usage

### Define Your Roles Config

First define a `RolesConfigType` describing your role names and hierarchy:

```typescript
import type { RolesConfigType } from '@talosjs/role';

const rolesConfig: RolesConfigType = {
  roles: {
    ROLE_GUEST: 'ROLE_GUEST',
    ROLE_USER: 'ROLE_USER',
    ROLE_ADMIN: 'ROLE_ADMIN',
    ROLE_SUPER_ADMIN: 'ROLE_SUPER_ADMIN',
    ROLE_SYSTEM: 'ROLE_SYSTEM',
  },
  hierarchy: {
    ROLE_GUEST: { description: 'Unauthenticated visitor' },
    ROLE_USER: { inherits: ['ROLE_GUEST'], description: 'Basic authenticated user' },
    ROLE_ADMIN: { inherits: ['ROLE_USER'], description: 'Administrator' },
    ROLE_SUPER_ADMIN: { inherits: ['ROLE_ADMIN'], description: 'Super administrator' },
    ROLE_SYSTEM: { inherits: ['ROLE_SUPER_ADMIN'], description: 'System-level access' },
  },
};
```

### Basic Role Checking

```typescript
import { Role } from '@talosjs/role';

const role = new Role();

const userRole = 'ROLE_ADMIN' as Uppercase<string>;
const requiredRole = 'ROLE_USER' as Uppercase<string>;

if (role.hasRole(userRole, requiredRole, rolesConfig)) {
  console.log('Access granted');
} else {
  console.log('Access denied');
}
```

### Getting Inherited Roles

```typescript
import { Role } from '@talosjs/role';

const role = new Role();

const inherited = role.getInheritedRoles('ROLE_SUPER_ADMIN', rolesConfig);
console.log(inherited);
// ['ROLE_GUEST', 'ROLE_USER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN'] — ancestors first, role last
```

### Route Protection

```typescript
import { Route } from '@talosjs/routing';
import type { IController, ContextType } from '@talosjs/controller';

@Route.http({
  name: 'admin.users.list',
  path: '/admin/users',
  method: 'GET',
  description: 'List all users (admin only)',
  roles: ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN']
})
class AdminUserListController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response.json({
      users: await this.userService.findAll()
    });
  }
}
```

## API Reference

### Classes

#### `Role`

Main class for role-based access control operations.

**Constructor:**
```typescript
new Role()
```

**Methods:**

##### `hasRole(userRole: Uppercase<string>, requiredRole: Uppercase<string>, config: RolesConfigType): boolean`

Checks if a user's role grants the required role through the inheritance graph. A role grants the required role only when it is the required role itself or inherits it (directly or transitively). Sibling roles on different branches do not satisfy each other.

**Parameters:**
- `userRole` - The user's current role
- `requiredRole` - The required role
- `config` - The roles configuration

**Returns:** `true` if the user's role is or inherits the required role; `false` for unknown roles

**Example:**
```typescript
const role = new Role();

role.hasRole('ROLE_ADMIN', 'ROLE_USER', rolesConfig);       // true - admin inherits user
role.hasRole('ROLE_USER', 'ROLE_ADMIN', rolesConfig);       // false - user does not inherit admin
role.hasRole('ROLE_MODERATOR', 'ROLE_REVIEWER', rolesConfig); // false - siblings, no inheritance
```

##### `getInheritedRoles(role: Uppercase<string>, config: RolesConfigType): Uppercase<string>[]`

Gets all roles that a user inherits through the hierarchy.

**Parameters:**
- `role` - The user's role
- `config` - The roles configuration

**Returns:** Array of inherited roles ordered ancestors-first, ending with the role itself

**Example:**
```typescript
const role = new Role();
const inherited = role.getInheritedRoles('ROLE_ADMIN', rolesConfig);
// Returns ['ROLE_GUEST', 'ROLE_USER', 'ROLE_ADMIN']
```

### Types

#### `RolesConfigType`

Configuration object defining all roles and their hierarchy.

```typescript
interface RolesConfigType {
  roles: Record<Uppercase<string>, Uppercase<string>>;
  hierarchy: RoleHierarchyType;
}
```

#### `RoleHierarchyType`

Map of role names to their hierarchy entries.

```typescript
type RoleHierarchyType = Record<Uppercase<string>, RoleHierarchyEntryType>;
```

#### `RoleHierarchyEntryType`

Describes a single role's position in the hierarchy.

```typescript
type RoleHierarchyEntryType = {
  inherits?: Uppercase<string>[];
  description: string;
};
```

#### `IRole`

Interface for role service implementations.

```typescript
interface IRole {
  hasRole: (userRole: Uppercase<string>, requiredRole: Uppercase<string>, config: RolesConfigType) => boolean;
  getInheritedRoles: (role: Uppercase<string>, config: RolesConfigType) => Uppercase<string>[];
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
