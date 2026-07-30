import { UsersRound } from "lucide-react";
import {
  ProjectTeamForm,
  ProjectTeamMemberForm,
  ProjectTeamMemberRemoveForm,
  ProjectTeamUpdateForm,
} from "@/components/projects/forms";

type MemberOption = { id: string; name: string };
type StageOption = { id: string; name: string };
type TeamMember = {
  id: string;
  name: string;
  role: "leader" | "member" | "observer";
};
type Team = {
  id: string;
  code: string;
  name: string;
  leaderId: string | null;
  stageInstanceId: string | null;
  status: "planned" | "active" | "completed" | "cancelled";
  startsAt: string | null;
  endsAt: string | null;
  members: TeamMember[];
};

const statusLabels: Record<Team["status"], string> = {
  planned: "مخطط",
  active: "نشط",
  completed: "مكتمل",
  cancelled: "ملغى",
};

const roleLabels: Record<TeamMember["role"], string> = {
  leader: "قائد",
  member: "عضو منفذ",
  observer: "متابع",
};

export function ProjectTeamsPanel({
  projectId,
  teams,
  projectMembers,
  stages,
  canManage,
  canAssign,
}: {
  projectId: string;
  teams: Team[];
  projectMembers: MemberOption[];
  stages: StageOption[];
  canManage: boolean;
  canAssign: boolean;
}) {
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));

  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <UsersRound className="size-5 text-brand" aria-hidden="true" />
          <h2 className="font-bold">فرق العمل</h2>
        </div>
        <span className="text-xs text-muted">{teams.length} فريق</span>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-2">
        {teams.map((team) => {
          const leader = team.members.find(
            (member) => member.id === team.leaderId,
          );
          return (
            <article key={team.id} className="bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{team.name}</p>
                  <p className="mt-1 text-xs text-muted">{team.code}</p>
                </div>
                <span className="border border-line px-2 py-1 text-xs font-bold">
                  {statusLabels[team.status]}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">القائد</dt>
                  <dd className="font-bold">{leader?.name ?? "دون قائد"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">المرحلة</dt>
                  <dd>
                    {team.stageInstanceId
                      ? stageNames.get(team.stageInstanceId) ?? "مرحلة غير متاحة"
                      : "كل المراحل المطابقة"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">الأعضاء</dt>
                  <dd>{team.members.length}</dd>
                </div>
              </dl>
              {team.startsAt || team.endsAt ? (
                <p className="mt-3 text-xs text-muted">
                  {team.startsAt
                    ? `من ${new Intl.DateTimeFormat("ar-SA", {
                        dateStyle: "medium",
                      }).format(new Date(team.startsAt))}`
                    : "بداية مفتوحة"}
                  {" · "}
                  {team.endsAt
                    ? `حتى ${new Intl.DateTimeFormat("ar-SA", {
                        dateStyle: "medium",
                      }).format(new Date(team.endsAt))}`
                    : "دون نهاية"}
                </p>
              ) : null}
              <div className="mt-4 divide-y divide-line border-y border-line">
                {team.members.length ? (
                  team.members.map((member) => (
                    <div key={member.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold">{member.name}</p>
                        <span className="text-xs text-muted">
                          {roleLabels[member.role]}
                        </span>
                      </div>
                      {canAssign && member.id !== team.leaderId ? (
                        <ProjectTeamMemberRemoveForm
                          projectId={projectId}
                          teamId={team.id}
                          userId={member.id}
                        />
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted">
                    لم يضف أعضاء إلى الفريق بعد.
                  </p>
                )}
              </div>
              {canAssign && ["planned", "active"].includes(team.status) ? (
                <ProjectTeamMemberForm
                  projectId={projectId}
                  teamId={team.id}
                  members={projectMembers}
                />
              ) : null}
              {canManage ? (
                <details className="mt-4 border-t border-line pt-4">
                  <summary className="cursor-pointer text-sm font-bold text-brand">
                    إعدادات الفريق
                  </summary>
                  <ProjectTeamUpdateForm
                    projectId={projectId}
                    team={team}
                    members={projectMembers}
                    stages={stages}
                  />
                </details>
              ) : null}
            </article>
          );
        })}
        {!teams.length ? (
          <p className="bg-surface p-5 text-sm text-muted sm:col-span-2">
            لا توجد فرق مسجلة في هذا المشروع.
          </p>
        ) : null}
      </div>
      {canManage ? (
        <div className="border-t border-line p-5">
          <h3 className="mb-4 text-sm font-bold">إنشاء فريق جديد</h3>
          <ProjectTeamForm
            projectId={projectId}
            members={projectMembers}
            stages={stages}
          />
        </div>
      ) : null}
    </section>
  );
}
