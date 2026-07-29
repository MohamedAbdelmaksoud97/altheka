import { describe, expect, it } from "vitest";
import {
  resolveActionAssignments,
  type AssignmentCandidate,
  type AssignmentRule,
} from "./assignment-resolver";

const candidates: AssignmentCandidate[] = [
  {
    userId: "manager",
    isActiveProjectMember: true,
    roleCodes: ["estates_manager"],
    jobTitleCode: "estates_manager",
    projectMembershipRoles: ["project_manager"],
  },
  {
    userId: "secretary",
    isActiveProjectMember: true,
    roleCodes: ["estates_secretary"],
    jobTitleCode: "estates_secretary",
    projectMembershipRoles: ["follower"],
  },
  {
    userId: "specialist-a",
    isActiveProjectMember: true,
    roleCodes: ["legal_specialist"],
    jobTitleCode: "legal_specialist",
    projectMembershipRoles: ["executor"],
    assignmentPriority: 10,
  },
  {
    userId: "specialist-b",
    isActiveProjectMember: true,
    roleCodes: ["legal_specialist"],
    jobTitleCode: "legal_specialist",
    projectMembershipRoles: ["executor"],
    assignmentPriority: 20,
  },
  {
    userId: "outsider",
    isActiveProjectMember: false,
    roleCodes: ["legal_specialist"],
    jobTitleCode: "legal_specialist",
    projectMembershipRoles: ["executor"],
  },
];

const rules: AssignmentRule[] = [
  {
    participantType: "responsible",
    selectorType: "role",
    roleCode: "estates_manager",
    minimumParticipants: 1,
    maximumParticipants: 1,
    allowSelfAssignment: true,
  },
  {
    participantType: "executor",
    selectorType: "project_membership",
    projectMembershipRole: "executor",
    allowedRoleCodes: ["legal_specialist"],
    minimumParticipants: 1,
    maximumParticipants: 5,
    allowSelfAssignment: true,
  },
  {
    participantType: "follower",
    selectorType: "job_title",
    jobTitleCode: "estates_secretary",
    minimumParticipants: 1,
    maximumParticipants: 1,
    allowSelfAssignment: true,
  },
  {
    participantType: "approver",
    selectorType: "manual",
    allowedRoleCodes: ["estates_manager"],
    minimumParticipants: 1,
    maximumParticipants: 1,
    allowSelfAssignment: true,
  },
];

describe("resolveActionAssignments", () => {
  it("resolves four independent parties and multiple executors", () => {
    const resolution = resolveActionAssignments({
      rules,
      candidates,
      assignedByUserId: "secretary",
      manualSelections: { approver: ["manager"] },
    });

    expect(resolution.status).toBe("ready");
    expect(resolution.participants.responsible).toEqual(["manager"]);
    expect(resolution.participants.executor).toEqual([
      "specialist-a",
      "specialist-b",
    ]);
    expect(resolution.participants.follower).toEqual(["secretary"]);
    expect(resolution.participants.approver).toEqual(["manager"]);
    expect(resolution.participants.executor).not.toContain("outsider");
  });

  it("keeps the action awaiting assignment when a required party is missing", () => {
    const resolution = resolveActionAssignments({
      rules,
      candidates: candidates.filter((candidate) => candidate.userId !== "manager"),
      assignedByUserId: "secretary",
      manualSelections: { approver: ["outsider"] },
    });

    expect(resolution.status).toBe("awaiting_assignment");
    expect(resolution.unresolved.map((item) => item.participantType)).toEqual([
      "responsible",
      "approver",
    ]);
  });
});
