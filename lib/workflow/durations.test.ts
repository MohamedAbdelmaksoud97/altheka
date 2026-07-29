import { describe, expect, it } from "vitest";
import { buildParallelSchedule, evaluateStageTiming } from "./durations";

describe("workflow duration scheduling", () => {
  it("uses the critical path instead of summing parallel estate inquiries", () => {
    const schedule = buildParallelSchedule([
      { id: "real-estate", plannedDurationDays: 15 },
      { id: "bank-accounts", plannedDurationDays: 15 },
      { id: "liability-notice", plannedDurationDays: 30 },
    ]);

    expect(schedule.plannedSpanDays).toBe(30);
  });

  it("runs dependent actions sequentially", () => {
    const schedule = buildParallelSchedule([
      { id: "valuation", plannedDurationDays: 10 },
      { id: "approval", plannedDurationDays: 2, dependsOn: ["valuation"] },
      { id: "marketing", plannedDurationDays: 90, dependsOn: ["approval"] },
    ]);

    expect(schedule.actions.find((action) => action.id === "marketing")).toMatchObject({
      earliestStartDay: 12,
      earliestFinishDay: 102,
    });
  });

  it("escalates deadline overruns without auto-closing the stage", () => {
    expect(
      evaluateStageTiming({
        elapsedDays: 61,
        targetDurationDays: 60,
        maximumDurationDays: 60,
      }),
    ).toEqual({
      targetExceeded: true,
      maximumExceeded: true,
      shouldEscalate: true,
      shouldAutoClose: false,
    });
  });

  it("rejects dependency cycles", () => {
    expect(() =>
      buildParallelSchedule([
        { id: "a", plannedDurationDays: 1, dependsOn: ["b"] },
        { id: "b", plannedDurationDays: 1, dependsOn: ["a"] },
      ]),
    ).toThrow("cycle");
  });
});
