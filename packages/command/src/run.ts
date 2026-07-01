import { parseArgs } from "node:util";
import { loadEnv } from "@talosjs/app-env";
import type { IException } from "@talosjs/exception";
import { Exception } from "@talosjs/exception";
import { TerminalLogger } from "@talosjs/logger";
import type { HttpMethodType } from "@talosjs/types";
import { toKebabCase } from "@talosjs/utils/toKebabCase";
import { getCommand } from "./getCommand";

export const run = async (): Promise<void> => {
  await loadEnv();

  const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
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
      access: {
        type: "string",
      },
    },
    strict: false,
    allowPositionals: true,
  });

  const logger = new TerminalLogger();

  const commandName = positionals[2] ?? "help";

  const command = getCommand(commandName);

  if (!command) {
    logger.info("No commands found\n");
    process.exit(1);
  }

  const parsedValues = {
    name: values.name,
    dir: values.dir,
    channel: values.channel,
    isSocket: values["is-socket"],
    tableName: values["table-name"],
    version: values.version,
    module: typeof values.module === "string" ? toKebabCase(values.module) : undefined,
    design: values.design,
    destination: values.destination,
    drop: values.drop,
    override: values.override,
    target: values.target,
    id: values.id ?? positionals[3],
    title: values.title,
    state: values.state,
    priority: values.priority,
    description: values.description,
    labels: values.labels,
    interactive: values.interactive,
    token: values.token,
    registry: values.registry,
    username: values.username,
    package: typeof values.package === "string" ? toKebabCase(values.package) : undefined,
    access: values.access,
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

  try {
    await command.run(parsedValues);
  } catch (error) {
    const exception: IException =
      error instanceof Exception ? error : new Exception(error instanceof Error ? error : String(error));
    logger.error(exception, undefined, {
      showArrow: false,
      showTimestamp: false,
      showLevel: false,
    });
    process.exit(1);
  }
};
