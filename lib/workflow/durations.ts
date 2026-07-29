export type DurationAction = {
  id: string;
  plannedDurationDays: number;
  dependsOn?: string[];
};

export type ScheduledAction = DurationAction & {
  earliestStartDay: number;
  earliestFinishDay: number;
};

export function buildParallelSchedule(actions: DurationAction[]) {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const visiting = new Set<string>();
  const scheduled = new Map<string, ScheduledAction>();

  function schedule(actionId: string): ScheduledAction {
    const existing = scheduled.get(actionId);
    if (existing) return existing;
    if (visiting.has(actionId)) {
      throw new Error(`Workflow dependency cycle detected at ${actionId}`);
    }

    const action = byId.get(actionId);
    if (!action) throw new Error(`Unknown workflow dependency: ${actionId}`);
    if (action.plannedDurationDays < 0) {
      throw new Error("Planned duration cannot be negative");
    }

    visiting.add(actionId);
    const prerequisites = (action.dependsOn ?? []).map(schedule);
    const earliestStartDay = prerequisites.length
      ? Math.max(...prerequisites.map((item) => item.earliestFinishDay))
      : 0;
    const result = {
      ...action,
      earliestStartDay,
      earliestFinishDay: earliestStartDay + action.plannedDurationDays,
    };
    visiting.delete(actionId);
    scheduled.set(actionId, result);
    return result;
  }

  const scheduledActions = actions.map((action) => schedule(action.id));
  return {
    actions: scheduledActions,
    plannedSpanDays: scheduledActions.length
      ? Math.max(...scheduledActions.map((action) => action.earliestFinishDay))
      : 0,
  };
}

export function evaluateStageTiming({
  elapsedDays,
  targetDurationDays,
  maximumDurationDays,
}: {
  elapsedDays: number;
  targetDurationDays?: number | null;
  maximumDurationDays?: number | null;
}) {
  const targetExceeded =
    targetDurationDays != null && elapsedDays > targetDurationDays;
  const maximumExceeded =
    maximumDurationDays != null && elapsedDays > maximumDurationDays;

  return {
    targetExceeded,
    maximumExceeded,
    shouldEscalate: targetExceeded || maximumExceeded,
    shouldAutoClose: false,
  };
}
