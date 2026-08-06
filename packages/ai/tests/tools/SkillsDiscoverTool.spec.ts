import { describe, expect, test } from "bun:test";
import { container } from "@talosjs/container";
import { SkillsDiscoverTool } from "@/tools/SkillsDiscoverTool";
import type { AiToolClassType, ISkill, ITool } from "@/types";

class FindOrderTool implements ITool {
  public getName = (): string => "find_order";
  public getDescription = (): string => "finds an order";
  public handler = (): unknown => null;
}
container.add(FindOrderTool);

class RefundSkill implements ISkill {
  public getName = (): string => "order-refund";
  public getDescription = (): string => "Issue and explain order refunds.";
  public getWhenToUse = (): string => "The user asks to cancel an order or wants money back.";
  public getTools = (): AiToolClassType[] => [FindOrderTool];
  public getPrompt = (): string => "Look up the order, check it is refundable, then refund it.";
}

class OnboardSkill implements ISkill {
  public getName = (): string => "tenant-onboard";
  public getDescription = (): string => "Set a new tenant up end to end.";
  public getWhenToUse = (): string => "A new customer signs up and needs a workspace.";
  public getTools = (): AiToolClassType[] => [];
  public getPrompt = (): string => "Create the workspace, then invite the owner.";
}

const makeTool = (skills: ISkill[] = [new RefundSkill(), new OnboardSkill()]) => new SkillsDiscoverTool(skills);

describe("SkillsDiscoverTool metadata", () => {
  test("should expose a stable name and a description naming its arguments", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("skills_discover");
    expect(tool.getDescription()).toContain("names");
    expect(tool.getDescription()).toContain("query");
  });

  test("should accept names, query, and limit, and reject their empty forms", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ names: ["order-refund"] })).toEqual({ names: ["order-refund"] });
    expect(schema({ query: "refund an order", limit: 2 })).toEqual({ query: "refund an order", limit: 2 });
    expect(schema({})).toEqual({});
    expect((schema({ names: "order-refund" }) as { summary?: string }).summary).toBeString();
    expect((schema({ query: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({ limit: 0 }) as { summary?: string }).summary).toBeString();
  });
});

describe("SkillsDiscoverTool lookup by name", () => {
  test("should return the full procedure of a named skill", () => {
    const result = makeTool().handler({ names: ["order-refund"] });

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toEqual({
      name: "order-refund",
      description: "Issue and explain order refunds.",
      whenToUse: "The user asks to cancel an order or wants money back.",
      tools: ["find_order"],
      prompt: "Look up the order, check it is refundable, then refund it.",
    });
    expect(result.unmatched).toEqual([]);
  });

  test("should match a name regardless of case and surrounding whitespace", () => {
    const result = makeTool().handler({ names: ["  Order-Refund "] });

    expect(result.skills.map((skill) => skill.name)).toEqual(["order-refund"]);
  });

  test("should report an unknown name and list what is available", () => {
    const result = makeTool().handler({ names: ["order-refunds", "tenant-onboard"] });

    expect(result.unmatched).toEqual(["order-refunds"]);
    expect(result.skills.map((skill) => skill.name)).toEqual(["tenant-onboard"]);
    expect(result.available).toEqual(["order-refund", "tenant-onboard"]);
  });

  test("should return no skills when asked for nothing", () => {
    const result = makeTool().handler({});

    expect(result.skills).toEqual([]);
    expect(result.unmatched).toEqual([]);
    expect(result.available).toEqual(["order-refund", "tenant-onboard"]);
  });

  test("should tolerate a missing argument object", () => {
    expect(makeTool().handler(undefined).skills).toEqual([]);
  });
});

describe("SkillsDiscoverTool lookup by query", () => {
  test("should rank the skill whose catalogue entry answers the query first", () => {
    // "customer" also appears in the onboarding entry, so both come back —
    // ranked, with the one matching the skill's own name ahead of it.
    const result = makeTool().handler({ query: "the customer wants a refund on their order" });

    expect(result.skills.map((skill) => skill.name)).toEqual(["order-refund", "tenant-onboard"]);
  });

  test("should only return the skills sharing a word with the query", () => {
    const result = makeTool().handler({ query: "refundable" });

    expect(result.skills.map((skill) => skill.name)).toEqual([]);
  });

  test("should return nothing when no skill shares a word with the query", () => {
    const result = makeTool().handler({ query: "photosynthesis" });

    expect(result.skills).toEqual([]);
  });

  test("should ignore a query of nothing but short words", () => {
    const result = makeTool().handler({ query: "a of to" });

    expect(result.skills).toEqual([]);
  });

  test("should cap the matches at the limit, best first", () => {
    const result = makeTool().handler({ query: "a new customer order workspace refund", limit: 1 });

    expect(result.skills).toHaveLength(1);
  });

  test("should cap the limit at the maximum", () => {
    const many = Array.from({ length: 12 }, (_, index) => {
      class GeneratedSkill implements ISkill {
        public getName = (): string => `generated-${index}`;
        public getDescription = (): string => "Handle a refund.";
        public getWhenToUse = (): string => "A refund is requested.";
        public getTools = (): AiToolClassType[] => [];
        public getPrompt = (): string => "Refund it.";
      }

      return new GeneratedSkill();
    });

    const result = makeTool(many).handler({ query: "refund", limit: 50 });

    expect(result.skills).toHaveLength(10);
  });

  test("should not repeat a skill already loaded by name", () => {
    const result = makeTool().handler({ names: ["order-refund"], query: "refund the order" });

    expect(result.skills.map((skill) => skill.name)).toEqual(["order-refund"]);
  });
});
