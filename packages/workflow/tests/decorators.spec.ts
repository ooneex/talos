import { describe, expect, test } from "bun:test";
import { container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { ITransition, WorkflowTransitionClassType } from "@/types";
import { Workflow } from "@/Workflow";

describe("decorator.workflow", () => {
  test("registers the workflow class in the container", () => {
    @decorator.workflow()
    class RegisteredWorkflow extends Workflow {
      public getName = () => "registered";
      public getDescription = () => "";
      public getTransitions = (): WorkflowTransitionClassType[] => [];
    }

    expect(container.has(RegisteredWorkflow)).toBe(true);
    expect(container.get(RegisteredWorkflow)).toBeInstanceOf(RegisteredWorkflow);
  });

  test("uses singleton scope by default", () => {
    @decorator.workflow()
    class SingletonWorkflow extends Workflow {
      public getName = () => "singleton";
      public getDescription = () => "";
      public getTransitions = (): WorkflowTransitionClassType[] => [];
    }

    expect(container.get(SingletonWorkflow)).toBe(
      container.get(SingletonWorkflow),
    );
  });

  test("creates a new instance per resolution in transient scope", () => {
    @decorator.workflow(EContainerScope.Transient)
    class TransientWorkflow extends Workflow {
      public getName = () => "transient";
      public getDescription = () => "";
      public getTransitions = (): WorkflowTransitionClassType[] => [];
    }

    expect(container.get(TransientWorkflow)).not.toBe(
      container.get(TransientWorkflow),
    );
  });
});

describe("decorator.transition", () => {
  test("registers the transition class in the container", () => {
    @decorator.transition()
    class RegisteredTransition implements ITransition {
      public getName = () => "registered";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => null;
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    expect(container.has(RegisteredTransition)).toBe(true);
    expect(container.get(RegisteredTransition)).toBeInstanceOf(
      RegisteredTransition,
    );
  });

  test("uses singleton scope by default", () => {
    @decorator.transition()
    class SingletonTransition implements ITransition {
      public getName = () => "singleton";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => null;
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    expect(container.get(SingletonTransition)).toBe(
      container.get(SingletonTransition),
    );
  });

  test("creates a new instance per resolution in transient scope", () => {
    @decorator.transition(EContainerScope.Transient)
    class TransientTransition implements ITransition {
      public getName = () => "transient";
      public getDescription = () => "";
      public isActive = () => true;
      public handler = () => null;
      public rollback = () => {};
      public onStart = () => {};
      public onFinish = () => {};
      public onFail = () => {};
    }

    expect(container.get(TransientTransition)).not.toBe(
      container.get(TransientTransition),
    );
  });
});
