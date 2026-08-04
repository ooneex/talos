import { parseArgs } from "node:util";
import { loadEnv } from "@talosjs/app-env";
import type { IException } from "@talosjs/exception";
import { Exception } from "@talosjs/exception";
import { TerminalLogger } from "@talosjs/logger";
import type { HttpMethodType } from "@talosjs/types";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { getCommand } from "./getCommand";

// Kebab-case each comma-separated entry, so `--package(s)`/`--module(s)` accept a single
// name (`Foo` → `foo`) or a list (`Foo,Bar` → `foo,bar`) without mangling the commas.
const toKebabCsv = (value: string): string =>
  value
    .split(",")
    .map((entry) => toKebabCase(entry))
    .filter(Boolean)
    .join(",");

const COMMAND_OPTIONS = {
  name: {
    type: "string",
  },
  "route-name": {
    type: "string",
  },
  "route-path": {
    type: "string",
  },
  "route-method": {
    type: "string",
  },
  "is-socket": {
    type: "boolean",
  },
  dir: {
    type: "string",
  },
  channel: {
    type: "string",
  },
  "table-name": {
    type: "string",
  },
  version: {
    type: "string",
  },
  module: {
    type: "string",
  },
  modules: {
    type: "string",
  },
  design: {
    type: "string",
  },
  destination: {
    type: "string",
  },
  drop: {
    type: "boolean",
  },
  target: {
    type: "string",
  },
  override: {
    type: "boolean",
  },
  id: {
    type: "string",
  },
  provider: {
    type: "string",
  },
  title: {
    type: "string",
  },
  state: {
    type: "string",
  },
  priority: {
    type: "string",
  },
  description: {
    type: "string",
  },
  labels: {
    type: "string",
    multiple: true,
  },
  interactive: {
    type: "boolean",
  },
  token: {
    type: "string",
  },
  registry: {
    type: "string",
  },
  username: {
    type: "string",
  },
  package: {
    type: "string",
  },
  packages: {
    type: "string",
  },
  access: {
    type: "string",
  },
  publish: {
    type: "boolean",
  },
  commands: {
    type: "string",
  },
  file: {
    type: "string",
  },
  logs: {
    type: "boolean",
  },
  "no-cache": {
    type: "boolean",
  },
  tag: {
    type: "string",
  },
  silent: {
    type: "boolean",
  },
  cwd: {
    type: "string",
  },
  agents: {
    type: "string",
    multiple: true,
  },
  api: {
    type: "string",
  },
  microservice: {
    type: "string",
  },
  spa: {
    type: "string",
  },
} as const;

type ParsedArgsType = ReturnType<typeof parseCliArgs>;

const parseCliArgs = () => {
  return parseArgs({
    args: Bun.argv,
    options: COMMAND_OPTIONS,
    strict: false,
    allowPositionals: true,
  });
};

const resolveCommandName = ({ values, positionals }: ParsedArgsType): string => {
  const hasVersionFlag = values.v === true || values.version === true;
  const hasHelpFlag = values.h === true || values.help === true;
  const flagCommand = hasVersionFlag ? "version" : hasHelpFlag ? "help" : undefined;
  return positionals[2] ?? flagCommand ?? "help";
};

const parseAgents = (agents: ParsedArgsType["values"]["agents"]): string[] | undefined => {
  if (!Array.isArray(agents)) {
    return undefined;
  }

  return agents.flatMap((agent) => (typeof agent === "string" ? agent.split(",") : [])).filter(Boolean);
};

const toOptionalKebabCsv = (value: unknown): string | undefined => {
  return typeof value === "string" ? toKebabCsv(value) : undefined;
};

const buildParsedValues = ({ values, positionals }: ParsedArgsType) => {
  return {
    name: values.name,
    dir: values.dir,
    channel: values.channel,
    isSocket: values["is-socket"],
    tableName: values["table-name"],
    version: values.version,
    module: toOptionalKebabCsv(values.module),
    modules: toOptionalKebabCsv(values.modules),
    design: values.design,
    destination: values.destination,
    drop: values.drop,
    override: values.override,
    target: values.target,
    id: values.id ?? positionals[3],
    provider: values.provider,
    title: values.title,
    state: values.state,
    priority: values.priority,
    description: values.description,
    labels: values.labels,
    interactive: values.interactive,
    token: values.token,
    registry: values.registry,
    username: values.username,
    package: toOptionalKebabCsv(values.package),
    packages: toOptionalKebabCsv(values.packages),
    access: values.access,
    publish: values.publish,
    commands: values.commands,
    file: values.file,
    logs: values.logs,
    noCache: values["no-cache"],
    tag: values.tag,
    silent: values.silent,
    cwd: values.cwd,
    // Selects which assistant config dirs to scaffold, bypassing the interactive
    // `agent:skills:create` prompt. Accepts repeated flags and/or comma-separated
    // lists (`--agents=.claude,.codex` == `--agents=.claude --agents=.codex`);
    // the dirs are kept literal (dot-prefixed), so no kebab-casing here.
    agents: parseAgents(values.agents),
    // `--api` / `--microservice` / `--spa` (bare → true, or `=name1,name2` → string)
    // restrict `app:start` to modules of that type.
    api: values.api,
    microservice: values.microservice,
    spa: values.spa,
    route: {
      name: values["route-name"],
      path: values["route-path"] as `/${string}` | undefined,
      method: values["route-method"] as HttpMethodType | undefined,
    },
  };
};

const logMissingCommand = (logger: TerminalLogger, commandName: string): never => {
  logger.error(`No commands found for "${commandName}"\n`, undefined, {
    showArrow: false,
    showTimestamp: false,
    showLevel: false,
  });
  process.exit(1);
};

const logCommandError = (logger: TerminalLogger, error: unknown): never => {
  const exception: IException =
    error instanceof Exception ? error : new Exception(error instanceof Error ? error : String(error));
  logger.error(exception, undefined, {
    showArrow: false,
    showTimestamp: false,
    showLevel: false,
  });
  process.exit(1);
};

export const run = async (): Promise<void> => {
  await loadEnv();

  const parsedArgs = parseCliArgs();
  const logger = new TerminalLogger();
  const commandName = resolveCommandName(parsedArgs);
  const command = getCommand(commandName);

  if (!command) {
    logMissingCommand(logger, commandName);
    return;
  }

  const parsedValues = buildParsedValues(parsedArgs);

  try {
    await command.run(parsedValues);
  } catch (error) {
    logCommandError(logger, error);
  }
};
