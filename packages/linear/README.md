# @talosjs/linear

Linear project management integration for querying and mutating Linear issues, teams, projects, labels, workflow states, priorities, and comments.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Installation

```bash
bun add @talosjs/linear
```

## Configuration

`LinearService` requires a Linear API key. Provide it through the constructor config or expose it through `AppEnv` as `LINEAR_API_KEY`.

```typescript
import { AppEnv } from "@talosjs/app-env";
import { LinearService } from "@talosjs/linear";

const linear = new LinearService(new AppEnv(), {
  apiKey: "lin_api_...",
  teamId: "team-id",
});
```

When the service is resolved through the Talos container, inject `LinearService` and configure `LINEAR_API_KEY` and optionally `LINEAR_TEAM_ID` in the application environment.

## Usage

```typescript
const issue = await linear.getIssue("OO-123");

const created = await linear.createIssue({
  title: "Document Linear package",
  description: "Add public package usage documentation.",
  team: {
    id: "team-id",
    name: "Engineering",
    key: "ENG",
  },
});

await linear.createComment(created.id, "Documentation added.");
```

## API

### Issues

- `getIssue(id)` fetches one issue.
- `getIssues(teamId?, filters?)` fetches issues, optionally scoped to a team and Linear filters.
- `createIssue(input)` creates an issue. `title` and `team.id` are required.
- `updateIssue(id, input)` updates issue fields.
- `deleteIssue(id)` deletes an issue and returns Linear's success flag.

### Teams, Projects, Labels, States, and Priorities

- `getTeams()` returns available teams.
- `getProjects(teamId?)` returns projects, optionally filtered by team.
- `getLabel(id)`, `getLabels(teamId?)`, `createLabel(input)`, `updateLabel(id, input)`, and `deleteLabel(id)` manage issue labels.
- `getState(id)`, `getStates(teamId?)`, `createState(input)`, `updateState(id, input)`, and `deleteState(id)` manage workflow states.
- `getPriorities()`, `getPriority(issueId)`, `setPriority(issueId, priority)`, and `clearPriority(issueId)` manage priorities.

### Checks and Comments

- `checkLabelById(id)` and `checkLabelByName(name, teamId?)` test whether labels exist.
- `checkPriorityById(value)` and `checkPriorityByName(name)` test whether a priority is supported.
- `checkStateById(id)` and `checkStateByName(name, teamId?)` test whether states exist.
- `createComment(issueId, body)` creates a comment on an issue.

## Types

The package exports `Issue`, `LinearService`, `LinearException`, `ILinearService`, `LinearConfigType`, and supporting payload types from `@talosjs/linear`.
