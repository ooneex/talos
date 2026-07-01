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
