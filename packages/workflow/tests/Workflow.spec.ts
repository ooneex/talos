import { beforeEach, describe, expect, test } from "bun:test";
import { container } from "@talosjs/container";
import type { ITransition, WorkflowTransitionClassType } from "@/types";
import { Workflow } from "@/Workflow";
import { WorkflowException } from "@/WorkflowException";

type Data = Record<string, unknown>;

// Shared log capturing the order of side effects across transitions.
let log: string[] = [];

beforeEach(() => {
  log = [];
});

/**
 * Builds a workflow subclass whose getTransitions() returns the given classes.
 * The transition classes are registered in the container so run() can resolve
 * them via container.get().
 */
const makeWorkflow = (
  transitions: WorkflowTransitionClassType[],
  name = "test-workflow",
): Workflow<Data> => {
  for (const transition of transitions) {
    container.add(transition);
  }

  class TestWorkflow extends Workflow<Data> {
    public getName(): string {
      return name;
    }

    public getDescription(): string {
      return "A workflow used for testing";
    }

    public getTransitions(): WorkflowTransitionClassType[] {
      return transitions;
    }
  }

  return new TestWorkflow();
};

describe("Workflow.run", () => {
  test("executes active transitions in order and returns the last output", async () => {
    class First implements ITransition {
      public getName = () => "first";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("first");
        return "first-output";
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    class Second implements ITransition {
      public getName = () => "second";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("second");
        return "second-output";
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([First, Second]);
    const output = await workflow.run({});

    expect(log).toEqual(["first", "second"]);
    expect(output).toBe("second-output");
  });

  test("skips transitions whose isActive returns false", async () => {
    class Active implements ITransition {
      public getName = () => "active";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("active");
        return "active";
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    class Inactive implements ITransition {
      public getName = () => "inactive";
      public getDescription = () => "";
      public isActive = () => false;
      public handler = () => {
        log.push("inactive");
        return "inactive";
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([Inactive, Active]);
    const output = await workflow.run({});

    expect(log).toEqual(["active"]);
    expect(output).toBe("active");
  });

  test("returns undefined when no transition is active", async () => {
    class Inactive implements ITransition {
      public getName = () => "inactive";
      public getDescription = () => "";
      public isActive = () => false;
      public handler = () => {
        log.push("inactive");
        return "value";
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([Inactive]);
    const output = await workflow.run({});

    expect(log).toEqual([]);
    expect(output).toBeUndefined();
  });

  test("supports async isActive and handler", async () => {
    class AsyncTransition implements ITransition {
      public getName = () => "async";
      public getDescription = () => "";
      public isActive = async () => {
        await Promise.resolve();
        return true;
      };
      public handler = async () => {
        await Promise.resolve();
        log.push("async");
        return 42;
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([AsyncTransition]);
    const output = await workflow.run({});

    expect(log).toEqual(["async"]);
    expect(output).toBe(42);
  });

  test("passes data and context to isActive and handler", async () => {
    const received: { isActive?: unknown[]; handler?: unknown[] } = {};

    class CaptureTransition implements ITransition {
      public getName = () => "capture";
      public getDescription = () => "";
      public isActive = (data: Data, context?: unknown) => {
        received.isActive = [data, context];
        return true;
      };
      public handler = (data: Data, context?: unknown) => {
        received.handler = [data, context];
        return null;
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const data = { user: "alice" };
    const context = { requestId: "req-1" };
    const workflow = makeWorkflow([CaptureTransition]);
    await workflow.run(data, context);

    expect(received.isActive).toEqual([data, context]);
    expect(received.handler).toEqual([data, context]);
  });
});

describe("Workflow.run lifecycle events", () => {
  test("fires onStart before the handler and onFinish after, in order", async () => {
    class Lifecycle implements ITransition {
      public getName = () => "lifecycle";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle");
        return "output";
      };
      public rollback = () => {};
      public onStart = () => {
        log.push("onStart");
      };
      public onFinish = () => {
        log.push("onFinish");
      };
      public onFail = () => {
        log.push("onFail");
      };
    }

    const workflow = makeWorkflow([Lifecycle]);
    await workflow.run({});

    expect(log).toEqual(["onStart", "handle", "onFinish"]);
  });

  test("does not fire onFail when the handler succeeds", async () => {
    class Success implements ITransition {
      public getName = () => "success";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => "ok";
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {
        log.push("onFail");
      };
    }

    const workflow = makeWorkflow([Success]);
    await workflow.run({});

    expect(log).toEqual([]);
  });

  test("passes data, output and context to onFinish", async () => {
    let received: unknown[] = [];

    class Capture implements ITransition {
      public getName = () => "capture";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => "the-output";
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = (data: Data, output: unknown, context?: unknown) => {
        received = [data, output, context];
      };
      public onFail = () => {};
    }

    const data = { user: "bob" };
    const context = { requestId: "req-2" };
    const workflow = makeWorkflow([Capture]);
    await workflow.run(data, context);

    expect(received).toEqual([data, "the-output", context]);
  });

  test("fires onFail with the error and context when the handler throws", async () => {
    let received: unknown[] = [];

    class Failing implements ITransition {
      public getName = () => "failing";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        throw new Error("boom");
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {
        log.push("onFinish");
      };
      public onFail = (data: Data, error: unknown, context?: unknown) => {
        received = [data, error, context];
        log.push("onFail");
      };
    }

    const data = { user: "carol" };
    const context = { requestId: "req-3" };
    const workflow = makeWorkflow([Failing]);

    expect(workflow.run(data, context)).rejects.toBeInstanceOf(
      WorkflowException,
    );

    // onFinish never runs; onFail receives the raw error and the context.
    expect(log).toEqual(["onFail"]);
    expect(received[0]).toEqual(data);
    expect(received[1]).toBeInstanceOf(Error);
    expect((received[1] as Error).message).toBe("boom");
    expect(received[2]).toEqual(context);
  });

  test("a throw from onStart fires onFail, rolls back, and throws", async () => {
    class Executed implements ITransition {
      public getName = () => "executed";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle:executed");
      };
      public rollback = () => {
        log.push("rollback:executed");
      };
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    class FailingOnStart implements ITransition {
      public getName = () => "failing-on-start";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle:failing");
      };
      public rollback = () => {};
      public onStart = () => {
        throw new Error("start boom");
      };
      public onFinish = () => {};
      public onFail = () => {
        log.push("onFail:failing");
      };
    }

    const workflow = makeWorkflow([Executed, FailingOnStart]);

    expect(workflow.run({})).rejects.toBeInstanceOf(WorkflowException);

    // The handler of the failing transition never runs; onFail fires, then the
    // previously executed transition rolls back.
    expect(log).toEqual([
      "handle:executed",
      "onFail:failing",
      "rollback:executed",
    ]);
  });

  test("a throw from onFinish fires onFail and rolls back the transition", async () => {
    class FailingOnFinish implements ITransition {
      public getName = () => "failing-on-finish";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle");
        return "output";
      };
      public rollback = () => {
        log.push("rollback");
      };
      public onStart = () => {};
      public onFinish = () => {
        throw new Error("finish boom");
      };
      public onFail = () => {
        log.push("onFail");
      };
    }

    const workflow = makeWorkflow([FailingOnFinish]);

    expect(workflow.run({})).rejects.toBeInstanceOf(WorkflowException);

    // The handler completed and the transition was recorded as executed, so a
    // throw from onFinish rolls it back too.
    expect(log).toEqual(["handle", "onFail", "rollback"]);
  });

  test("awaits async lifecycle hooks", async () => {
    class AsyncHooks implements ITransition {
      public getName = () => "async-hooks";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle");
        return "output";
      };
      public rollback = () => {};
      public onStart = async () => {
        await Promise.resolve();
        log.push("onStart");
      };
      public onFinish = async () => {
        await Promise.resolve();
        log.push("onFinish");
      };
      public onFail = () => {};
    }

    const workflow = makeWorkflow([AsyncHooks]);
    await workflow.run({});

    expect(log).toEqual(["onStart", "handle", "onFinish"]);
  });
});

describe("Workflow.run rollback", () => {
  test("rolls back executed transitions in reverse order on failure", async () => {
    class StepOne implements ITransition {
      public getName = () => "step-one";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle:one");
      };
      public rollback = () => {
        log.push("rollback:one");
      };
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    class StepTwo implements ITransition {
      public getName = () => "step-two";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle:two");
      };
      public rollback = () => {
        log.push("rollback:two");
      };
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    class Failing implements ITransition {
      public getName = () => "failing";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle:failing");
        throw new Error("boom");
      };
      public rollback = () => {
        log.push("rollback:failing");
      };
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([StepOne, StepTwo, Failing]);

    expect(workflow.run({})).rejects.toBeInstanceOf(WorkflowException);

    // The failing transition's rollback is NOT called (it was never marked
    // executed); already-executed transitions roll back in reverse order.
    expect(log).toEqual([
      "handle:one",
      "handle:two",
      "handle:failing",
      "rollback:two",
      "rollback:one",
    ]);
  });

  test("does not roll back when the first transition fails", async () => {
    class Failing implements ITransition {
      public getName = () => "failing";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        throw new Error("boom");
      };
      public rollback = () => {
        log.push("rollback:failing");
      };
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([Failing]);

    expect(workflow.run({})).rejects.toBeInstanceOf(WorkflowException);
    expect(log).toEqual([]);
  });

  test("throws a WorkflowException carrying workflow, transition and error details", async () => {
    class Failing implements ITransition {
      public getName = () => "failing";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        throw new Error("explicit failure");
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([Failing], "broken-workflow");

    try {
      await workflow.run({});
      throw new WorkflowException(
        "run() should have thrown",
        "TEST_EXPECTED_THROW",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowException);
      const exception = error as WorkflowException;
      expect(exception.message).toBe(
        'Workflow "broken-workflow" failed at transition "failing".',
      );
      expect(exception.key).toBe("WORKFLOW_RUN_FAILED");
      expect(exception.data).toEqual({
        workflow: "broken-workflow",
        transition: "failing",
        error: "explicit failure",
      });
    }
  });

  test("stringifies non-Error throwables in the exception data", async () => {
    class Failing implements ITransition {
      public getName = () => "failing";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        throw "string failure";
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([Failing]);

    try {
      await workflow.run({});
      throw new WorkflowException(
        "run() should have thrown",
        "TEST_EXPECTED_THROW",
      );
    } catch (error) {
      const exception = error as WorkflowException;
      expect(exception).toBeInstanceOf(WorkflowException);
      expect(exception.data.error).toBe("string failure");
    }
  });

  test("awaits async rollbacks before rethrowing", async () => {
    class Executed implements ITransition {
      public getName = () => "executed";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        log.push("handle:executed");
      };
      public rollback = async () => {
        await Promise.resolve();
        log.push("rollback:executed");
      };
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    class Failing implements ITransition {
      public getName = () => "failing";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => {
        throw new Error("boom");
      };
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    const workflow = makeWorkflow([Executed, Failing]);

    expect(workflow.run({})).rejects.toBeInstanceOf(WorkflowException);
    expect(log).toEqual(["handle:executed", "rollback:executed"]);
  });
});
