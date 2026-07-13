import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

const app = read("src/App.tsx");
const page = read("src/pages/AdminSupportPage.tsx");
const pageStyles = read("src/pages/AdminSupportPage.css");
const globalStyles = read("src/index.css");
const accessHook = read("src/hooks/useAdminAccess.ts");
const migration = read("supabase/migration_support_admin.sql");
const grantScript = read(
  "supabase/script_grant_support_admin_taikhoanluutrucuason.sql",
);
const notificationPage = read("src/pages/NotificationsPage.tsx");
const notificationTypes = read("src/types/index.ts");
const notificationFeed = read("src/hooks/useNotificationFeed.ts");
const settingsPage = read("src/pages/SettingsPage.tsx");

assert.match(
  app,
  /path="\/admin\/support"[\s\S]*AdminSupportPage/,
  "The app should expose the authenticated admin support route.",
);
assert.match(
  app,
  /path="\/admin\/support"[\s\S]*path="\*"[\s\S]*DesktopGate/,
  "The admin route should be declared before the mobile app DesktopGate wildcard.",
);
assert.match(
  accessHook,
  /rpc\("is_pinly_admin"\)/,
  "Admin access must be verified by the database.",
);
assert.doesNotMatch(
  accessHook,
  /@.*\.(com|tech)|email\s*===/i,
  "Admin access must not rely on a frontend email allowlist.",
);
assert.match(
  settingsPage,
  /isAdmin[\s\S]*navigate\("\/admin\/support"\)/,
  "Settings should show an admin-only shortcut to the support dashboard.",
);

assert.match(page, /rpc\("admin_list_support_tickets"/, "Admin page should load tickets through the protected RPC.");
assert.match(page, /rpc\("admin_support_ticket_counts"/, "Admin page should load queue counts.");
assert.match(page, /rpc\(\s*"admin_update_support_ticket"/, "Admin page should reply through the protected RPC.");
assert.match(page, /postgres_changes[\s\S]*support_tickets/, "Admin page should refresh from realtime ticket changes.");
assert.match(page, /admin-support-layout/, "Admin support should use its desktop dashboard layout.");
assert.match(page, /aria-pressed=\{statusFilter === status\}/, "Queue filters should expose their selected state.");
assert.match(page, /className=\{statusFilter === "all" \? "active" : ""\}/, "Summary filters should visibly track the selected state.");
assert.match(page, /scrollIntoView/, "Selecting a ticket on a small screen should reveal its detail panel.");
assert.doesNotMatch(pageStyles, /min-width:\s*1080px/, "The admin dashboard must not force a desktop-only width.");
assert.match(globalStyles, /#root:has\(\.admin-support-page\)[\s\S]*max-width:\s*none/, "The global mobile shell must release its width limit for the admin dashboard.");
assert.match(pageStyles, /@media \(max-width: 1024px\)[\s\S]*"queue detail"/, "The dashboard should provide a tablet layout.");
assert.match(pageStyles, /@media \(max-width: 720px\)[\s\S]*"detail"/, "The dashboard should provide a mobile layout.");
assert.match(pageStyles, /\[data-theme="dark"\] \.admin-support-status-nav button\.active[\s\S]*color:\s*#ff9aa6/, "Dark mode should keep the active queue filter legible.");

assert.match(migration, /create table if not exists public\.admin_users/, "Admin RBAC table should exist.");
assert.match(migration, /create or replace function public\.is_pinly_admin/, "Admin identity helper should exist.");
assert.match(migration, /security definer/g, "Admin RPCs should execute with protected database privileges.");
assert.match(migration, /create or replace function public\.admin_list_support_tickets/, "Ticket list RPC should exist.");
assert.match(migration, /create or replace function public\.admin_update_support_ticket/, "Ticket update RPC should exist.");
assert.match(migration, /create or replace function public\.admin_support_ticket_counts/, "Ticket count RPC should exist.");
assert.match(migration, /type[\s\S]*'support_reply'/, "Admin replies should create a user notification.");
assert.match(migration, /create or replace function public\.get_notification_feed[\s\S]*n\.type = 'support_reply'/, "Support replies should be account-wide in the notification feed.");
assert.match(migration, /alter publication supabase_realtime add table public\.support_tickets/, "Support tickets should be enabled for realtime.");
assert.match(migration, /revoke all on function public\.admin_list_support_tickets/, "Admin list RPC should not remain public.");
assert.match(migration, /grant execute on function public\.admin_list_support_tickets/, "Authenticated admins should be able to call the list RPC.");

assert.match(grantScript, /taikhoanluutrucuason@gmail\.com/i, "The bootstrap script should target the requested admin account.");
assert.match(notificationTypes, /"support_reply"/, "Client notification types should include support replies.");
assert.match(notificationPage, /case "support_reply"/, "Notification UI should handle support replies.");
assert.doesNotMatch(notificationFeed, /notificationBelongsToActiveSpace/, "Realtime support replies should remain visible in the account-wide inbox.");
assert.doesNotMatch(notificationFeed, /type\.eq\.support_reply/, "Mark-all-read should cover the whole account inbox without a space filter.");

console.log("admin support contract: ok");
