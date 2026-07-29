export const participantTypes = [
  "responsible",
  "executor",
  "follower",
  "approver",
] as const;

export type ParticipantType = (typeof participantTypes)[number];
export type SelectorType = "role" | "job_title" | "project_membership" | "manual";

export type AssignmentCandidate = {
  userId: string;
  isActiveProjectMember: boolean;
  roleCodes: string[];
  jobTitleCode: string | null;
  projectMembershipRoles: string[];
  assignmentPriority?: number;
};

export type AssignmentRule = {
  participantType: ParticipantType;
  selectorType: SelectorType;
  roleCode?: string;
  jobTitleCode?: string;
  projectMembershipRole?: string;
  allowedRoleCodes?: string[];
  minimumParticipants: number;
  maximumParticipants: number;
  allowSelfAssignment: boolean;
};

export type AssignmentResolution = {
  participants: Record<ParticipantType, string[]>;
  unresolved: Array<{
    participantType: ParticipantType;
    missingCount: number;
    selectorType: SelectorType;
  }>;
  status: "ready" | "awaiting_assignment";
};

function matchesSelector(candidate: AssignmentCandidate, rule: AssignmentRule) {
  if (rule.selectorType === "role") {
    return Boolean(rule.roleCode && candidate.roleCodes.includes(rule.roleCode));
  }

  if (rule.selectorType === "job_title") {
    return candidate.jobTitleCode === rule.jobTitleCode;
  }

  if (rule.selectorType === "project_membership") {
    return Boolean(
      rule.projectMembershipRole &&
        candidate.projectMembershipRoles.includes(rule.projectMembershipRole),
    );
  }

  return true;
}

function isAllowed(candidate: AssignmentCandidate, rule: AssignmentRule) {
  if (!candidate.isActiveProjectMember) return false;
  if (!rule.allowedRoleCodes?.length) return true;
  return rule.allowedRoleCodes.some((role) => candidate.roleCodes.includes(role));
}

export function resolveActionAssignments({
  rules,
  candidates,
  assignedByUserId,
  manualSelections = {},
}: {
  rules: AssignmentRule[];
  candidates: AssignmentCandidate[];
  assignedByUserId: string;
  manualSelections?: Partial<Record<ParticipantType, string[]>>;
}): AssignmentResolution {
  const participants: Record<ParticipantType, string[]> = {
    responsible: [],
    executor: [],
    follower: [],
    approver: [],
  };
  const unresolved: AssignmentResolution["unresolved"] = [];

  for (const rule of rules) {
    const manuallySelected = new Set(manualSelections[rule.participantType] ?? []);
    const eligible = candidates
      .filter((candidate) => isAllowed(candidate, rule))
      .filter(
        (candidate) =>
          rule.allowSelfAssignment || candidate.userId !== assignedByUserId,
      )
      .filter((candidate) =>
        rule.selectorType === "manual"
          ? manuallySelected.has(candidate.userId)
          : matchesSelector(candidate, rule),
      )
      .sort(
        (left, right) =>
          (left.assignmentPriority ?? 100) - (right.assignmentPriority ?? 100) ||
          left.userId.localeCompare(right.userId),
      )
      .slice(0, rule.maximumParticipants);

    const selectedIds = [...new Set(eligible.map((candidate) => candidate.userId))];
    participants[rule.participantType] = selectedIds;

    if (selectedIds.length < rule.minimumParticipants) {
      unresolved.push({
        participantType: rule.participantType,
        missingCount: rule.minimumParticipants - selectedIds.length,
        selectorType: rule.selectorType,
      });
    }
  }

  return {
    participants,
    unresolved,
    status: unresolved.length ? "awaiting_assignment" : "ready",
  };
}
