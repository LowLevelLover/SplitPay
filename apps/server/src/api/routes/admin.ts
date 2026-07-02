import type { FastifyInstance } from "fastify";
import { devAuth } from "../../config/env.js";
import { listGroups } from "../../services/groups.js";

// Dev-only admin panel: browse groups and open the Mini App locally as any
// member (no Telegram needed). Auth is bypassed via the X-Dev-User header,
// which the panel injects into the ?devUser= link. Disabled in production.
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  if (!devAuth) return;

  app.get("/api/admin/groups", async () => listGroups());

  app.get("/admin", async (_req, reply) => {
    reply.type("text/html").send(ADMIN_HTML);
  });

  app.log.info("🛠️  Dev admin panel → /admin");
}

const ADMIN_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SplitPay · Dev Admin</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; max-width: 720px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: #888; margin: 0 0 24px; }
  .group { border: 1px solid #8883; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  .group h2 { font-size: 16px; margin: 0 0 2px; }
  .gid { color: #888; font-size: 12px; font-family: ui-monospace, monospace; margin-bottom: 12px; }
  a.member { display: flex; justify-content: space-between; align-items: center;
    text-decoration: none; color: inherit; padding: 10px 12px; border-radius: 8px;
    background: #8881; margin-bottom: 6px; }
  a.member:hover { background: #8883; }
  a.member .who { font-weight: 600; }
  a.member .open { font-size: 13px; color: #3390ec; }
  .empty { color: #888; }
</style>
</head>
<body>
<h1>SplitPay · Dev Admin</h1>
<p class="sub">Open the Mini App as any member. No Telegram required — auth is bypassed in dev.</p>
<div id="groups" class="empty">Loading…</div>
<script>
  fetch("/api/admin/groups")
    .then((r) => r.json())
    .then((groups) => {
      const root = document.getElementById("groups");
      if (!groups.length) { root.textContent = "No groups yet — send a message to the bot first."; return; }
      root.className = "";
      root.innerHTML = groups.map((g) => \`
        <div class="group">
          <h2>\${g.title || "Untitled group"}</h2>
          <div class="gid">\${g.id}</div>
          \${g.members.map((m) => {
            const label = m.username ? "@" + m.username : m.firstName;
            const href = "/?groupId=" + encodeURIComponent(g.id) + "&devUser=" + encodeURIComponent(m.telegramId);
            return \`<a class="member" href="\${href}"><span class="who">\${label}</span><span class="open">open ›</span></a>\`;
          }).join("") || '<div class="empty">No members</div>'}
        </div>\`).join("");
    })
    .catch((e) => { document.getElementById("groups").textContent = "Failed to load: " + e; });
</script>
</body>
</html>`;
