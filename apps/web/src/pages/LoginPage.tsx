import { useState } from "react";
import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, TriangleAlert, User, Users, UsersRound } from "lucide-react";
import { Button, Card, EmptyState, ListRow, Screen, Section, Spinner } from "../ui/index.js";
import { useAdminGroups } from "../hooks/useGroup.js";
import type { AdminGroupDTO } from "../lib/api.js";
import { saveSession } from "../lib/session.js";
import type { Session } from "../lib/session.js";
import { displayName } from "../lib/format.js";
import { useI18n } from "../i18n/index.js";

// Whole-row invisible button around a ListRow.
const rowBtn: CSSProperties = {
  all: "unset",
  boxSizing: "border-box",
  cursor: "pointer",
  display: "block",
  width: "100%",
  textAlign: "start",
};

export function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const { t, dir } = useI18n();
  const { data: groups, isLoading, error } = useAdminGroups();
  const [group, setGroup] = useState<AdminGroupDTO | null>(null);

  const Forward = dir === "rtl" ? ChevronLeft : ChevronRight;
  const forward = <Forward size={18} style={{ color: "var(--text-muted)" }} />;

  const pickMember = (member: AdminGroupDTO["members"][number]) => {
    if (!group) return;
    const session: Session = {
      groupId: group.id,
      telegramId: member.telegramId,
      displayName: displayName(member),
    };
    saveSession(session);
    onLogin(session);
  };

  const body = () => {
    if (isLoading) return <Spinner />;
    if (error)
      return (
        <EmptyState icon={<TriangleAlert size={30} />} title={t("login.errorTitle")} error>
          {t("login.errorBody")}
        </EmptyState>
      );
    if (!groups || groups.length === 0)
      return (
        <EmptyState icon={<UsersRound size={30} />} title={t("login.emptyTitle")}>
          {t("login.emptyBody")}
        </EmptyState>
      );

    if (!group)
      return (
        <Section label={t("login.pickGroup")} footer={t("login.pickGroupFooter")}>
          <Card pad="sm">
            {groups.map((g) => (
              <button key={g.id} type="button" style={rowBtn} onClick={() => setGroup(g)}>
                <ListRow
                  before={<Users size={20} />}
                  title={g.title ?? t("login.untitledGroup")}
                  subtitle={t("login.members", { n: g.members.length })}
                  after={forward}
                />
              </button>
            ))}
          </Card>
        </Section>
      );

    return (
      <Section label={t("login.pickMember")} footer={t("login.pickMemberFooter")}>
        <Card pad="sm">
          {group.members.map((m) => (
            <button key={m.telegramId} type="button" style={rowBtn} onClick={() => pickMember(m)}>
              <ListRow
                before={<User size={20} />}
                title={m.firstName}
                subtitle={m.username ? `@${m.username}` : undefined}
                after={forward}
              />
            </button>
          ))}
        </Card>
        <Button variant="ghost" onClick={() => setGroup(null)}>
          {t("common.back")}
        </Button>
      </Section>
    );
  };

  return (
    <Screen eyebrow={t("app.name")} title={t("login.title")}>
      {body()}
    </Screen>
  );
}
