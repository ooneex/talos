import { beforeEach, describe, expect, mock, test } from "bun:test";

type PromptConfig = {
  type?: string;
  choices?: { name: string; message: string; enabled: boolean }[];
};

// Mock enquirer so the multiselect prompt resolves deterministically.
const promptMock = mock((_config: PromptConfig) => Promise.resolve({ agents: [".claude", ".codex"] }));
mock.module("enquirer", () => ({ prompt: promptMock }));

const { askAgentSkills } = await import("@/prompts/askAgentSkills");

describe("askAgentSkills", () => {
  beforeEach(() => {
    promptMock.mockClear();
  });

  test("should return the selected assistant config directories", async () => {
    const result = await askAgentSkills({ message: "Add skills?" });

    expect(result).toEqual([".claude", ".codex"]);
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  test("should present a multiselect whose choices are config directories", async () => {
    await askAgentSkills({ message: "Add skills?" });

    const config = promptMock.mock.calls[0]?.[0];
    expect(config?.type).toBe("multiselect");

    const names = config?.choices?.map((choice) => choice.name);
    expect(names).toContain(".claude");
    expect(names).toContain(".codex");
    expect(names).toContain(".cursor");
    expect(names).toContain(".gemini");
    expect(names).toContain(".windsurf");
    expect(names).toContain(".cline");
    expect(names).toContain(".junie");
    expect(names).toContain(".roo");
    expect(names).toContain(".continue");
    expect(names).toContain(".zed");
  });

  test("should enable only Claude and Codex by default", async () => {
    await askAgentSkills({ message: "Add skills?" });

    const config = promptMock.mock.calls[0]?.[0];
    const enabled = config?.choices?.filter((choice) => choice.enabled).map((choice) => choice.name);
    expect(enabled).toEqual([".claude", ".codex"]);
  });
});
