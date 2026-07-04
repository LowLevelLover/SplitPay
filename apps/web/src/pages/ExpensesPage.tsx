import type { ReactNode } from "react";
import { ArrowLeftRight, Link2, Receipt, ScrollText, TriangleAlert } from "lucide-react";
import type { ExpenseDTO } from "@split-pay/shared";
import { Card, Chip, EmptyState, Screen, Skeleton } from "../ui/index.js";
import { useExpenses } from "../hooks/useGroup.js";
import { displayName, formatCents } from "../lib/format.js";
import { useI18n } from "../i18n/index.js";
import s from "./ExpensesPage.module.css";

const KIND: Record<ExpenseDTO["kind"], { icon: ReactNode; cls: string | undefined }> = {
  expense: { icon: <Receipt size={20} />, cls: s.iconExpense },
  debt: { icon: <ArrowLeftRight size={20} />, cls: s.iconDebt },
  settlement: { icon: <Link2 size={20} />, cls: s.iconSettlement },
};

export function ExpensesPage({ groupId }: { groupId: string }) {
  const { t, locale } = useI18n();
  const { data, isLoading, error } = useExpenses(groupId);

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (same(d, today)) return t("history.today");
    if (same(d, yesterday)) return t("history.yesterday");
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  };
  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

  if (isLoading) return <HistorySkeleton />;
  if (error)
    return (
      <Screen eyebrow={t("app.name")} title={t("history.title")}>
        <EmptyState icon={<TriangleAlert size={30} />} title={t("history.errorTitle")} error>
          {t("history.errorBody")}
        </EmptyState>
      </Screen>
    );
  if (!data || data.length === 0)
    return (
      <Screen eyebrow={t("app.name")} title={t("history.title")}>
        <EmptyState icon={<ScrollText size={30} />} title={t("history.emptyTitle")}>
          {t("history.emptyBody")}
        </EmptyState>
      </Screen>
    );

  // Group entries under day headers (data is newest-first).
  const groups: { day: string; items: ExpenseDTO[] }[] = [];
  for (const e of data) {
    const day = dayLabel(e.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <Screen eyebrow={t("app.name")} title={t("history.title")}>
      {groups.map((g) => (
        <div key={g.day}>
          <div className={s.day}>{g.day}</div>
          {g.items.map((e) => {
            const kind = KIND[e.kind];
            const title =
              e.description ??
              (e.kind === "settlement" ? t("history.onchainSettlement") : t("history.expense"));
            return (
              <Card key={e.id} pad="sm" interactive style={{ marginTop: 8 }}>
                <div className={s.card}>
                  <div className={s.top}>
                    <div className={`${s.icon} ${kind.cls}`}>{kind.icon}</div>
                    <div className={s.info}>
                      <div className={s.title}>{title}</div>
                      <div className={s.meta}>
                        {t("history.meta", { name: displayName(e.payer), time: timeLabel(e.createdAt) })}
                      </div>
                    </div>
                    <div
                      className={`${s.amount} ${e.kind === "settlement" ? s.amountSettlement : ""}`}
                    >
                      {formatCents(e.amountCents, e.currency, locale)}
                      <span className={s.cur}>{e.currency}</span>
                    </div>
                  </div>
                  {e.shares.length > 0 && (
                    <div className={s.shares}>
                      {e.shares.map((sh, i) => (
                        <Chip key={i}>
                          {displayName(sh.user)} {formatCents(sh.amountCents, e.currency, locale)}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </Screen>
  );
}

function HistorySkeleton() {
  const { t } = useI18n();
  return (
    <Screen eyebrow={t("app.name")} title={t("history.title")}>
      {[0, 1, 2].map((i) => (
        <Card key={i} pad="sm" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Skeleton w={42} h={42} radius={10} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton w="50%" h={15} />
              <Skeleton w="70%" h={12} />
            </div>
            <Skeleton w={70} h={16} />
          </div>
        </Card>
      ))}
    </Screen>
  );
}
