import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const migrationPath = resolve("supabase/migration_polar_billing.sql");
const webhookPath = resolve("supabase/functions/polar-webhook/index.ts");
const checkoutPath = resolve("supabase/functions/create-polar-checkout/index.ts");
const portalPath = resolve("supabase/functions/create-customer-portal/index.ts");
const appUrlPath = resolve("supabase/functions/_shared/app-url.ts");

assert.ok(
  existsSync(migrationPath),
  "supabase/migration_polar_billing.sql must exist.",
);
assert.ok(
  existsSync(webhookPath),
  "supabase/functions/polar-webhook/index.ts must exist.",
);
assert.ok(
  existsSync(checkoutPath),
  "supabase/functions/create-polar-checkout/index.ts must exist.",
);
assert.ok(
  existsSync(portalPath),
  "supabase/functions/create-customer-portal/index.ts must exist.",
);
assert.ok(
  existsSync(appUrlPath),
  "supabase/functions/_shared/app-url.ts must exist.",
);

const sql = readFileSync(migrationPath, "utf8");
const webhook = readFileSync(webhookPath, "utf8");
const checkoutFunction = readFileSync(checkoutPath, "utf8");
const portalFunction = readFileSync(portalPath, "utf8");
const appUrlShared = readFileSync(appUrlPath, "utf8");

function bodyOf(functionName) {
  const pattern = new RegExp(
    `create or replace function public\\.${functionName}\\b[\\s\\S]*?\\bas\\s+\\$\\$([\\s\\S]*?)^\\$\\$;`,
    "im",
  );
  const match = sql.match(pattern);
  assert.ok(match, `${functionName} function must exist.`);
  return match[1];
}

for (const pattern of [
  /create table if not exists public\.billing_profiles/i,
  /create table if not exists public\.account_subscriptions/i,
  /create table if not exists public\.billing_events/i,
  /polar_customer_id text unique/i,
  /polar_event_id text primary key/i,
  /source text not null check \(source in \('polar', 'activation_code', 'manual'\)\)/i,
  /status text not null check \(status in \('active', 'trialing', 'canceled', 'expired', 'revoked', 'incomplete'\)\)/i,
  /create or replace function public\.get_account_plan/i,
  /create or replace function public\.get_owned_space_limit/i,
  /create or replace function public\.get_owned_space_count/i,
  /create or replace function public\.can_create_owned_space/i,
  /create or replace function public\.get_space_effective_plan/i,
  /create or replace function public\.get_subscription_context_for_space/i,
  /create or replace function public\.get_subscription_context_for_couple/i,
  /create or replace function public\.enforce_owned_space_limit/i,
  /create or replace function public\.activate_account_code/i,
  /create trigger enforce_owned_space_limit/i,
  /revoke all on function public\.activate_account_code\(uuid, text, text\) from public, anon, authenticated/i,
  /grant execute on function public\.activate_account_code\(uuid, text, text\) to service_role/i,
]) {
  assert.match(sql, pattern, `Missing SQL pattern: ${pattern}`);
}

const limitBody = bodyOf("get_owned_space_limit");
assert.match(limitBody, /when 'pro' then 3/i, "Pro must own 3 spaces.");
assert.match(limitBody, /when 'plus' then 2/i, "Plus must own 2 spaces.");
assert.match(limitBody, /else 1/i, "Free must own 1 space.");

const spacePlanBody = bodyOf("get_space_effective_plan");
assert.match(
  spacePlanBody,
  /public\.get_account_plan\(s\.owner_id\)/i,
  "Space plan must resolve from spaces.owner_id account plan.",
);

const contextBody = bodyOf("get_subscription_context_for_space");
assert.match(
  contextBody,
  /public\.is_space_member\(p_space_id\)/i,
  "Subscription context must require current user to be a space member.",
);
assert.match(contextBody, /'account_plan'/i, "Context must include account_plan.");
assert.match(contextBody, /'space_plan'/i, "Context must include space_plan.");
assert.match(contextBody, /'owned_space_limit'/i, "Context must include owned_space_limit.");
assert.match(contextBody, /'can_create_space'/i, "Context must include can_create_space.");

const quotaBody = bodyOf("enforce_owned_space_limit");
assert.match(
  quotaBody,
  /public\.can_create_owned_space\(new\.owner_id\)/i,
  "Space insert trigger must enforce owner quota.",
);
assert.match(
  quotaBody,
  /using errcode = 'PBL01'/i,
  "Quota failure must use stable SQL error PBL01.",
);

const activateBody = bodyOf("activate_account_code");
assert.match(
  activateBody,
  /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 0\)\)/i,
  "Activation RPC must serialize redemption per user.",
);
assert.match(
  activateBody,
  /for update/i,
  "Activation code lookup must lock the code row for atomic redemption.",
);
assert.match(
  activateBody,
  /update public\.account_subscriptions[\s\S]*source = 'activation_code'[\s\S]*status in \('active', 'trialing'\)/i,
  "Activation RPC must expire existing active/trialing activation-code grants.",
);
assert.match(
  activateBody,
  /insert into public\.account_subscriptions/i,
  "Activation RPC must insert an account-level subscription grant.",
);
assert.match(
  activateBody,
  /insert into public\.billing_profiles/i,
  "Activation RPC must upsert billing profile details.",
);
assert.match(
  activateBody,
  /update public\.activation_codes[\s\S]*used_by_couple_id[\s\S]*used_at/i,
  "Activation RPC must consume the code after grant writes.",
);

assert.match(
  webhook,
  /external_customer_id|externalCustomerId|external_id|externalId/i,
  "Polar webhook must resolve first subscription events from external customer id.",
);
assert.match(
  appUrlShared,
  /APP_ALLOWED_ORIGINS/i,
  "Polar return URL helper must support allowed app origins.",
);
assert.match(
  appUrlShared,
  /POLAR_SERVER[\s\S]*production/i,
  "Polar return URL helper must only trust local dev origins outside production.",
);
assert.match(
  checkoutFunction,
  /resolveTrustedAppUrl\(body\.app_url\)/i,
  "Polar checkout must prefer the current client app_url when it is trusted.",
);
assert.match(
  portalFunction,
  /resolveTrustedAppUrl\(body\.app_url\)/i,
  "Customer portal must prefer the current client app_url when it is trusted.",
);
