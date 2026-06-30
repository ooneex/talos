import { join } from "node:path";
import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { TerminalLogger } from "@talosjs/logger";
import { YAML } from "bun";
import { askDockerService, type DockerServiceType } from "../prompts/askDockerService";
import { templates } from "../templates/docker";
import { LOG_OPTIONS } from "../utils";

type CommandOptionsType = {
  name?: DockerServiceType;
};

type DockerComposeConfigType = {
  services?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
};

/**
 * Extracts the service block (including comments) from a template string.
 * Returns the content between "services:" and "volumes:" (or end of services section).
 */
const extractServiceBlock = (template: string): string => {
  const lines = template.split("\n");
  const result: string[] = [];
  let inServices = false;

  for (const line of lines) {
    if (line.startsWith("services:")) {
      inServices = true;
      continue;
    }
    if (inServices) {
      // Stop when we hit volumes: or networks: at root level
      if (line.startsWith("volumes:") || line.startsWith("networks:")) {
        break;
      }
      result.push(line);
    }
  }

  return result.join("\n");
};

/**
 * Extracts volume names from a template string.
 */
const extractVolumeNames = (template: string): string[] => {
  const config = YAML.parse(template) as DockerComposeConfigType;
  return config.volumes ? Object.keys(config.volumes) : [];
};

@decorator.command()
export class DockerCreateCommand<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "docker:create";
  }

  public getDescription(): string {
    return "Add a docker service to docker-compose.yml";
  }

  public async run(options: T): Promise<void> {
    let { name } = options;

    if (!name) {
      name = await askDockerService({ message: "Select docker service" });
    }

    const templateContent = templates[name];
    const base = join("modules", "app");
    const composePath = join(process.cwd(), base, "docker-compose.yml");
    const logger = new TerminalLogger();
    const composeFile = Bun.file(composePath);

    if (await composeFile.exists()) {
      const existingContent = await composeFile.text();
      const existingConfig = YAML.parse(existingContent) as DockerComposeConfigType;

      // Check if service already exists
      if (existingConfig.services && name in existingConfig.services) {
        logger.warn(`Service "${name}" already exists in docker-compose.yml`, undefined, LOG_OPTIONS);
        return;
      }

      // Extract service block with comments from template
      const serviceBlock = extractServiceBlock(templateContent);
      const newVolumeNames = extractVolumeNames(templateContent);

      let updatedContent = existingContent;

      // Find where to insert the service (before volumes: section or at end of services)
      const volumesIndex = updatedContent.indexOf("\nvolumes:");
      const networksIndex = updatedContent.indexOf("\nnetworks:");

      // Find the earliest section after services
      let insertIndex = -1;
      if (volumesIndex !== -1 && networksIndex !== -1) {
        insertIndex = Math.min(volumesIndex, networksIndex);
      } else if (volumesIndex !== -1) {
        insertIndex = volumesIndex;
      } else if (networksIndex !== -1) {
        insertIndex = networksIndex;
      }

      if (insertIndex !== -1) {
        // Insert service before volumes/networks section
        updatedContent = `${updatedContent.slice(0, insertIndex)}\n${serviceBlock}${updatedContent.slice(insertIndex)}`;
      } else {
        // Append service at the end
        updatedContent = `${updatedContent.trimEnd()}\n${serviceBlock}`;
      }

      // Add new volumes if they don't exist
      for (const volumeName of newVolumeNames) {
        if (!updatedContent.includes(`  ${volumeName}:`)) {
          if (updatedContent.includes("\nvolumes:")) {
            // Find the volumes section and add the new volume
            const volumesSectionIndex = updatedContent.indexOf("\nvolumes:");
            const afterVolumes = updatedContent.slice(volumesSectionIndex + "\nvolumes:".length);
            updatedContent = `${updatedContent.slice(0, volumesSectionIndex + "\nvolumes:".length)}\n  ${volumeName}:${afterVolumes}`;
          } else {
            // Create volumes section
            updatedContent = `${updatedContent.trimEnd()}\n\nvolumes:\n  ${volumeName}:\n`;
          }
        }
      }

      await Bun.write(composePath, updatedContent);
    } else {
      // Create new docker-compose.yml with template as-is (preserves comments)
      await Bun.write(composePath, templateContent);
    }

    // Update package.json with dev script
    const packageJsonPath = join(process.cwd(), base, "package.json");
    const packageJsonFile = Bun.file(packageJsonPath);
    if (await packageJsonFile.exists()) {
      const packageJson = await packageJsonFile.json();
      packageJson.scripts = packageJson.scripts || {};
      packageJson.scripts.dev ??= "docker compose up -d && bun --hot run ./src/index.ts";
      await Bun.write(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    logger.success(`Service "${name}" added to docker-compose.yml`, undefined, LOG_OPTIONS);

    logger.info("Run 'bun run dev' to start docker containers and the app", undefined, {
      showTimestamp: false,
      showArrow: true,
      showLevel: false,
    });
  }
}
