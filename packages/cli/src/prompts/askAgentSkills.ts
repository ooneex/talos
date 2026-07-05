import { prompt } from "enquirer";

// Coding assistants Talos can scaffold shared skills/config for, mapped to the
// directory each one reads its configuration from. Claude and Codex are enabled
// by default to preserve the previous prompt's behaviour.
const AGENTS: { name: string; dir: string; enabled?: boolean }[] = [
  { name: "Claude", dir: ".claude", enabled: true },
  { name: "Codex", dir: ".codex", enabled: true },
  { name: "Cursor", dir: ".cursor" },
  { name: "Gemini", dir: ".gemini" },
  { name: "Windsurf", dir: ".windsurf" },
  { name: "Cline", dir: ".cline" },
  { name: "JetBrains Junie", dir: ".junie" },
  { name: "Roo Code", dir: ".roo" },
  { name: "Continue", dir: ".continue" },
  { name: "Zed", dir: ".zed" },
];

// Let the user pick which assistants to scaffold skills for. Returns the config
// directories of the selected assistants (e.g. ".claude", ".codex").
export const askAgentSkills = async (config: { name: string }): Promise<string[]> => {
  const response = await prompt<{ agents: string[] }>({
    type: "multiselect",
    name: "agents",
    message: config.name,
    choices: AGENTS.map(({ name, dir, enabled }) => ({ name: dir, message: name, enabled: enabled === true })),
  });

  return response.agents;
};
