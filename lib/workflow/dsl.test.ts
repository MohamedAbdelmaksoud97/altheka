import { describe, expect, it } from "vitest";
import { parseWorkflowTransitionDsl } from "./dsl";

describe("workflow transition DSL", () => {
  it("accepts declarative transitions", () => {
    expect(
      parseWorkflowTransitionDsl({
        version: 1,
        transitions: [
          {
            from: "draft",
            to: "ready",
            conditions: [
              { operator: "equals", field: "document.status", value: "published" },
            ],
          },
        ],
      }),
    ).toBeTruthy();
  });

  it("rejects code-like field expressions", () => {
    expect(() =>
      parseWorkflowTransitionDsl({
        version: 1,
        transitions: [
          {
            from: "draft",
            to: "ready",
            conditions: [
              { operator: "exists", field: "process.exit()" },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
