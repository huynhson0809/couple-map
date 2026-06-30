import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const migrationPath = resolve("supabase/migration_memory_spaces.sql");

assert.ok(
  existsSync(migrationPath),
  "supabase/migration_memory_spaces.sql must exist.",
);

const sql = readFileSync(migrationPath, "utf8");

function extractFunctionBody(sql, functionName) {
  const pattern = new RegExp(
    `create or replace function public\\.${functionName}\\b[\\s\\S]*?\\bas\\s+\\$\\$([\\s\\S]*?)^\\$\\$;`,
    "im",
  );
  const match = sql.match(pattern);
  assert.ok(match, `${functionName} function body must exist.`);
  return match[1];
}

for (const pattern of [
  /create table if not exists public\.spaces/i,
  /create table if not exists public\.space_members/i,
  /active_space_id/i,
  /max_members integer not null default 5/i,
  /create or replace function public\.is_space_member/i,
  /create or replace function public\.is_space_owner/i,
  /create or replace function public\.ensure_space_legacy_couple/i,
  /create or replace function public\.get_space_context_for_current_user/i,
  /create or replace function public\.create_personal_space_for_current_user/i,
  /create or replace function public\.create_shared_space_for_current_user/i,
  /create or replace function public\.promote_personal_space_to_shared/i,
  /create or replace function public\.join_space_by_invite/i,
  /create or replace function public\.set_active_space_for_current_user/i,
  /create or replace function public\.delete_space_for_current_user\(space_id uuid\)/i,
  /create or replace function public\.finalize_couple_breakup/i,
  /create or replace function public\.get_notification_feed/i,
  /create or replace function public\.get_space_stats_summary/i,
  /create or replace function public\.assign_notification_space_id/i,
  /create trigger assign_notification_space_id/i,
  /alter publication supabase_realtime add table public\.spaces/i,
  /alter publication supabase_realtime add table public\.space_members/i,
  /alter table public\.pins[\s\S]*space_id/i,
]) {
  assert.match(sql, pattern, `Missing SQL pattern: ${pattern}`);
}

assert.match(
  sql,
  /insert into public\.spaces[\s\S]*select[\s\S]*from public\.couples/i,
  "Migration must backfill existing couples into spaces.",
);

assert.doesNotMatch(
  sql,
  /invite_code text unique default/i,
  "Personal spaces must not receive invite codes before the owner chooses to share.",
);

assert.match(
  sql,
  /alter table public\.spaces[\s\S]*alter column invite_code drop default/i,
  "Migration must remove any earlier invite_code default.",
);

assert.match(
  sql,
  /update public\.spaces s[\s\S]*set invite_code = null[\s\S]*s\.type = 'personal'/i,
  "Migration must clear accidental invite codes from one-person personal spaces.",
);

const joinSpaceByInviteBody = extractFunctionBody(sql, "join_space_by_invite");
const createPersonalSpaceBody = extractFunctionBody(
  sql,
  "create_personal_space_for_current_user",
);
const createSharedSpaceBody = extractFunctionBody(
  sql,
  "create_shared_space_for_current_user",
);
const setActiveSpaceBody = extractFunctionBody(
  sql,
  "set_active_space_for_current_user",
);
const deleteSpaceBody = extractFunctionBody(
  sql,
  "delete_space_for_current_user",
);
const promotePersonalSpaceBody = extractFunctionBody(
  sql,
  "promote_personal_space_to_shared",
);
const getSpaceContextBody = extractFunctionBody(
  sql,
  "get_space_context_for_current_user",
);
const createOrGetSpaceInviteBody = extractFunctionBody(
  sql,
  "create_or_get_space_invite",
);
const ensureSpaceLegacyCoupleBody = extractFunctionBody(
  sql,
  "ensure_space_legacy_couple",
);
const finalizeCoupleBreakupBody = extractFunctionBody(
  sql,
  "finalize_couple_breakup",
);
const getNotificationFeedBody = extractFunctionBody(
  sql,
  "get_notification_feed",
);
const getSpaceStatsSummaryBody = extractFunctionBody(
  sql,
  "get_space_stats_summary",
);

assert.match(
  ensureSpaceLegacyCoupleBody,
  /insert into public\.couples[\s\S]*id[\s\S]*values[\s\S]*v_space\.id/i,
  "ensure_space_legacy_couple must create a legacy couple with the same id as the space.",
);

assert.match(
  ensureSpaceLegacyCoupleBody,
  /legacy_couple_id\s*=\s*v_space\.id/i,
  "ensure_space_legacy_couple must link spaces.legacy_couple_id to the compatibility couple.",
);

assert.match(
  finalizeCoupleBreakupBody,
  /select[\s\S]*into[\s\S]*v_space_id[\s\S]*from public\.spaces[\s\S]*legacy_couple_id\s*=\s*p_couple_id/i,
  "finalize_couple_breakup must find the memory space linked to the legacy couple.",
);

assert.match(
  finalizeCoupleBreakupBody,
  /p_initiator_user_id is distinct from v_owner_id/i,
  "finalize_couple_breakup must only allow the memory-space owner to delete the space.",
);

assert.match(
  finalizeCoupleBreakupBody,
  /active_space_id\s*=\s*case[\s\S]*then null[\s\S]*else active_space_id[\s\S]*end/i,
  "finalize_couple_breakup must clear users.active_space_id for deleted spaces.",
);

assert.match(
  finalizeCoupleBreakupBody,
  /delete from public\.spaces[\s\S]*where id = v_space_id/i,
  "finalize_couple_breakup must delete the memory space so space_members and space-scoped rows cascade.",
);

assert.match(
  deleteSpaceBody,
  /sm\.role = 'owner'/i,
  "delete_space_for_current_user must allow only space owners to delete.",
);

assert.match(
  deleteSpaceBody,
  /space_delete_last_space/i,
  "delete_space_for_current_user must reject deleting the user's last active space.",
);

assert.match(
  deleteSpaceBody,
  /active_space_id\s*=\s*case[\s\S]*v_fallback_space\.id/i,
  "delete_space_for_current_user must move the owner to a fallback active space when needed.",
);

assert.match(
  deleteSpaceBody,
  /delete from public\.spaces[\s\S]*where id = v_space\.id/i,
  "delete_space_for_current_user must delete the space row so space-scoped rows cascade.",
);

assert.match(
  deleteSpaceBody,
  /delete from public\.couples[\s\S]*where id = v_space\.legacy_couple_id/i,
  "delete_space_for_current_user must remove the compatibility couple for the deleted space.",
);

assert.match(
  sql,
  /grant execute on function public\.delete_space_for_current_user\(uuid\)[\s\S]*to authenticated/i,
  "delete_space_for_current_user must be callable by authenticated users only.",
);

assert.match(
  sql,
  /grant execute on function public\.finalize_couple_breakup\(uuid, uuid\)[\s\S]*to service_role/i,
  "finalize_couple_breakup must remain callable by the breakup edge function service role.",
);

assert.match(
  sql,
  /p_space_id uuid default null/i,
  "get_notification_feed must accept an active space filter.",
);

assert.match(
  getNotificationFeedBody,
  /n\.space_id = (?:p_space_id|ts\.id)/i,
  "get_notification_feed must filter notification rows by active space.",
);

assert.match(
  getNotificationFeedBody,
  /n\.space_id is null[\s\S]*n\.couple_id in \([\s\S]*p_space_id[\s\S]*legacy_couple_id/i,
  "get_notification_feed must include legacy notifications that belong to the active space.",
);

assert.match(
  getNotificationFeedBody,
  /n\.read = false[\s\S]*n\.space_id = (?:p_space_id|ts\.id)/i,
  "get_notification_feed unread count must be scoped by active space.",
);

assert.match(
  sql,
  /get_space_stats_summary\(target_space_id uuid\)/i,
  "get_space_stats_summary must accept a target space id.",
);

assert.match(
  getSpaceStatsSummaryBody,
  /p\.space_id = target_space_id/i,
  "get_space_stats_summary must aggregate pins by space_id.",
);

assert.doesNotMatch(
  getSpaceStatsSummaryBody,
  /p\.couple_id = target_space_id/i,
  "get_space_stats_summary must not aggregate pins by legacy couple_id.",
);

assert.match(
  createPersonalSpaceBody,
  /perform public\.ensure_space_legacy_couple\(v_space\.id\)/i,
  "create_personal_space_for_current_user must create a legacy compatibility couple.",
);

assert.match(
  createSharedSpaceBody,
  /perform public\.ensure_space_legacy_couple\(v_space\.id\)/i,
  "create_shared_space_for_current_user must create a legacy compatibility couple.",
);

assert.match(
  createOrGetSpaceInviteBody,
  /type\s*=\s*case[\s\S]*type\s*=\s*'personal'[\s\S]*'shared'/i,
  "create_or_get_space_invite must promote a personal space before sharing.",
);

assert.match(
  createOrGetSpaceInviteBody,
  /max_members\s*=\s*greatest\(max_members,\s*5\)/i,
  "create_or_get_space_invite must raise personal-space capacity for sharing.",
);

assert.match(
  createOrGetSpaceInviteBody,
  /v_candidate_code text;[\s\S]*v_candidate_code := upper[\s\S]*set invite_code = v_candidate_code[\s\S]*returning invite_code into v_code/i,
  "create_or_get_space_invite must only return an invite code that was saved.",
);

assert.match(
  getSpaceContextBody,
  /from public\.space_members sm[\s\S]*where sm\.status = 'active'[\s\S]*exists \([\s\S]*owner_sm\.space_id = sm\.space_id[\s\S]*owner_sm\.user_id = uid[\s\S]*owner_sm\.status = 'active'/i,
  "get_space_context_for_current_user must return member rows for every space the user can switch to.",
);

assert.match(
  joinSpaceByInviteBody,
  /count\(\*\)[\s\S]*from public\.space_members[\s\S]*< v_space\.max_members/i,
  "join_space_by_invite must enforce backend max_members.",
);

assert.match(
  setActiveSpaceBody,
  /v_legacy_couple_id uuid;/i,
  "set_active_space_for_current_user must declare its compatibility couple id variable.",
);

for (const [name, body] of [
  ["join_space_by_invite", joinSpaceByInviteBody],
  ["set_active_space_for_current_user", setActiveSpaceBody],
  ["promote_personal_space_to_shared", promotePersonalSpaceBody],
]) {
  assert.match(
    body,
    /perform set_config\('pinly\.allow_membership_mutation', 'on', true\)/i,
    `${name} must enable protected compatibility membership updates.`,
  );
  assert.match(
    body,
    /couple_id\s*=\s*coalesce\((?:v_space\.legacy_couple_id|v_legacy_couple_id), couple_id\)/i,
    `${name} must keep users.couple_id aligned with active space compatibility.`,
  );
}
