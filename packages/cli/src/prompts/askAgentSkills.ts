import { prompt } from "enquirer";

// Coding assistants Talos can scaffold shared skills/config for, mapped to the
// directory each one reads its configuration from. Claude and Codex are enabled
// by default to preserve the previous prompt's behaviour.
const AGENTS: { message: string; dir: string; enabled?: boolean }[] = [
  { message: "Claude", dir: ".claude", enabled: true },
  { message: "Codex", dir: ".codex", enabled: true },
  { message: "Cursor", dir: ".cursor" },
  { message: "Gemini", dir: ".gemini" },
  { message: "Windsurf", dir: ".windsurf" },
  { message: "Cline", dir: ".cline" },
  { message: "JetBrains Junie", dir: ".junie" },
  { message: "Roo Code", dir: ".roo" },
  { message: "Continue", dir: ".continue" },
  { message: "Zed", dir: ".zed" },
];

// Let the user pick which assistants to scaffold skills for. Returns the config
// directories of the selected assistants (e.g. ".claude", ".codex").
export const askAgentSkills = async (config: { message: string }): Promise<string[]> => {
  const response = await prompt<{ agents: string[] }>({
    type: "multiselect",
    name: "agents",
    message: config.message,
    choices: AGENTS.map(({ message, dir, enabled }) => ({ name: dir, message, enabled: enabled === true })),
  });

  return response.agents;
};
