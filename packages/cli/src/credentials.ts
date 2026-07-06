import { homedir } from "node:os";
import { join } from "node:path";
import { TerminalLogger } from "@talosjs/logger";
import { LOG_OPTIONS, toYaml } from "./utils";

/**
 * Persist a credentials profile as block-style YAML under
 * `~/.talos/credentials/<fileName>`, logging the destination unless silent.
 */
export const saveCredentials = async (
  fileName: string,
  label: string,
  profile: Record<string, string>,
  silent?: boolean,
): Promise<string> => {
  const credentials = { profiles: { default: profile } };
  const credentialsPath = join(homedir(), ".talos", "credentials", fileName);
  await Bun.write(credentialsPath, `${toYaml(credentials)}\n`);

  if (!silent) {
    new TerminalLogger().success(`${label} credentials saved to ${credentialsPath}`, undefined, LOG_OPTIONS);
  }

  return credentialsPath;
};

/**
 * Read the `default` profile stored in `~/.talos/credentials/<fileName>`,
 * returning null when the file does not exist.
 */
export const readCredentials = async (fileName: string): Promise<Record<string, string> | null> => {
  const credentialsPath = join(homedir(), ".talos", "credentials", fileName);
  const file = Bun.file(credentialsPath);

  if (!(await file.exists())) {
    return null;
  }

  const parsed = Bun.YAML.parse(await file.text()) as {
    profiles?: { default?: Record<string, string> };
  };
  return parsed?.profiles?.default ?? null;
};
