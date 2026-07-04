// Local session: which group is open and which member the caller acts as.

export interface Session {
  groupId: string;
  telegramId: string;
  displayName: string;
}

const KEY = "splitpay.session";

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (!s.groupId || !s.telegramId) return null;
    return { groupId: s.groupId, telegramId: s.telegramId, displayName: s.displayName ?? s.telegramId };
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

/** ?groupId=&devUser= override the stored session, then get cleaned from the URL. */
export function loadSession(): Session | null {
  const params = new URLSearchParams(window.location.search);
  const groupId = params.get("groupId");
  const devUser = params.get("devUser");

  if (groupId || devUser) {
    const prev = getSession();
    const next: Session | null =
      (groupId ?? prev?.groupId) && (devUser ?? prev?.telegramId)
        ? {
            groupId: (groupId ?? prev?.groupId)!,
            telegramId: (devUser ?? prev?.telegramId)!,
            displayName: devUser && devUser !== prev?.telegramId ? devUser : (prev?.displayName ?? devUser ?? ""),
          }
        : null;
    if (next) saveSession(next);
    params.delete("groupId");
    params.delete("devUser");
    const qs = params.toString();
    history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    return next ?? getSession();
  }

  return getSession();
}
