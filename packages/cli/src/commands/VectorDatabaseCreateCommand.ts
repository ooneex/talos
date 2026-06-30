import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/vector-database.test.txt";
import template from "../templates/vector-database.txt";

@decorator.command()
export class VectorDatabaseCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "vector-database:create";
  }

  public getDescription(): string {
    return "Generate a new vector database class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "Vector database",
        promptMessage: "Enter vector database name",
        suffix: "VectorDatabase",
        stripSuffixes: ["VectorDatabase", "Database"],
        template,
        testTemplate,
        dir: "databases",
        dependency: "@talosjs/rag",
      },
      options,
    );
  }
}
