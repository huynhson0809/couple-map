import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";

const task3Files = [
  "src/types/space.ts",
  "src/lib/spaceCapabilities.ts",
];

for (const file of task3Files) {
  assert.ok(existsSync(resolve(file)), `${file} must exist.`);
}

const futureFiles = [
  "src/hooks/useSpaces.ts",
  "src/hooks/SpaceContext.tsx",
  "src/components/auth/SpaceSetup.tsx",
];

const types = readFileSync(resolve("src/types/space.ts"), "utf8");
assert.doesNotMatch(types, /from "\.\/index"/);
assert.match(types, /export type SpacePlan = "free" \| "plus" \| "pro"/);
assert.match(types, /export interface SpaceProfile\b/);
assert.match(types, /export interface Space\b/);
assert.match(types, /legacy_couple_id: string \| null/);
assert.match(types, /export interface SpaceMember\b/);
assert.doesNotMatch(types, /\bemail\?: string/);
assert.doesNotMatch(types, /\bdisplay_name\?: string \| null/);
assert.doesNotMatch(types, /\bavatar_url\?: string \| null/);
assert.match(types, /user\?: SpaceProfile \| null/);
assert.match(types, /export interface SpaceContextPayload\b/);
assert.match(types, /profile: SpaceProfile \| null/);

const capabilities = readFileSync(
  resolve("src/lib/spaceCapabilities.ts"),
  "utf8",
);
assert.match(capabilities, /const hasSpace = space !== null/);
assert.match(
  capabilities,
  /member\.space_id === space\?\.id[\s\S]*member\.status === "active"/,
  "Space capabilities must count members only inside the active space.",
);
assert.match(capabilities, /const isActiveMember = currentMember !== undefined/);
assert.match(capabilities, /canUseDuoFeatures:\s*memberCount === 2/);
assert.match(
  capabilities,
  /canInviteInCurrentUi:\s*canManageCurrentSpace && isOwner && memberCount < 2/,
);
assert.match(
  capabilities,
  /backendCanAcceptMember:\s*canManageCurrentSpace && memberCount < maxMembers/,
);
assert.match(capabilities, /canDeleteSpace:\s*canManageCurrentSpace && isOwner/);
assert.match(
  capabilities,
  /canLeaveSpace:\s*canManageCurrentSpace && \(memberCount > 1 \|\| !isOwner\)/,
);

for (const file of futureFiles) {
  assert.ok(existsSync(resolve(file)), `${file} must exist.`);
}

const context = readFileSync(resolve("src/hooks/SpaceContext.tsx"), "utf8");
assert.match(context, /createContext/);
assert.match(context, /useSpaces/);
assert.match(context, /useSpaceCtx/);

const setup = readFileSync(
  resolve("src/components/auth/SpaceSetup.tsx"),
  "utf8",
);
assert.match(setup, /Bản đồ của tôi|spaceSetup\.personal/);
assert.match(setup, /Dùng cùng người khác|spaceSetup\.shared/);
assert.match(setup, /createPersonalSpace/);
assert.match(setup, /joinSpaceByInvite/);

const useSpaces = readFileSync(resolve("src/hooks/useSpaces.ts"), "utf8");
assert.doesNotMatch(
  useSpaces,
  /activeSpaceId:\s*spaceId/,
  "createOrGetInvite must not force the active space after a late invite response.",
);
assert.match(
  useSpaces,
  /deleteSpace\s*=\s*useCallback/i,
  "useSpaces must expose a deleteSpace action.",
);
assert.match(
  useSpaces,
  /delete_space_for_current_user/i,
  "useSpaces.deleteSpace must call the delete-space RPC.",
);

const spaceSwitcher = readFileSync(
  resolve("src/components/settings/SpaceSwitcher.tsx"),
  "utf8",
);
assert.match(
  spaceSwitcher,
  /Trash2/,
  "SpaceSwitcher must show a delete affordance for owned spaces.",
);
assert.match(
  spaceSwitcher,
  /deleteTarget/,
  "SpaceSwitcher must use a confirmation dialog before deleting a space.",
);
assert.match(
  spaceSwitcher,
  /spaces\.length <= 1/,
  "SpaceSwitcher must disable deletion when the user only has one space.",
);
assert.match(
  spaceSwitcher,
  /refetch:\s*refetchSubscription/,
  "SpaceSwitcher must read subscription refetch so map quota text updates after deleting a space.",
);
assert.match(
  spaceSwitcher,
  /await deleteSpace\(deleteTarget\.id\);[\s\S]*await refetchSubscription\(\);/,
  "SpaceSwitcher must refetch subscription quota after deleting a space.",
);
assert.match(
  spaceSwitcher,
  /createPortal\(/,
  "Space delete dialog must render through a portal so later settings sections cannot cover it.",
);
assert.match(
  spaceSwitcher,
  /space-delete-icon/,
  "Space delete dialog must follow the destructive modal visual pattern with a warning icon tile.",
);
assert.match(
  spaceSwitcher,
  /deleteConfirmText/,
  "Space delete dialog must require typed confirmation before the destructive action.",
);

const appTypes = readFileSync(resolve("src/types/index.ts"), "utf8");
assert.match(
  appTypes,
  /space_id: string \| null/,
  "AppNotification must expose space_id so the UI can filter notifications by active space.",
);

const settingsPage = readFileSync(resolve("src/pages/SettingsPage.tsx"), "utf8");
assert.match(
  settingsPage,
  /useSpaceCtx/,
  "SettingsPage must read space capabilities before showing duo/owner-only controls.",
);
assert.doesNotMatch(
  settingsPage,
  /couple\.invite_code/,
  "SettingsPage must not expose the raw legacy invite code; SpaceInvitePanel owns share confirmation.",
);
assert.doesNotMatch(
  settingsPage,
  /function\s+copyCode/,
  "SettingsPage must not keep the legacy invite-code copy action.",
);
assert.match(
  settingsPage,
  /capabilities\.canUseDuoFeatures[\s\S]*notif\.streakReminders/,
  "SettingsPage must only show streak reminder preferences while duo features are enabled.",
);
assert.match(
  settingsPage,
  /canManageSpaceDetails[\s\S]*settings\.anniversary/,
  "SettingsPage must gate space date editing to space owners.",
);
assert.match(
  settingsPage,
  /canManageSpaceDetails[\s\S]*settings\.background/,
  "SettingsPage must gate background editing to space owners.",
);
assert.match(
  settingsPage,
  /canManageSpaceDetails[\s\S]*settings\.breakupTitle/,
  "SettingsPage must gate destructive space deletion to space owners.",
);

const anniversaryPrompt = readFileSync(
  resolve("src/components/onboard/AnniversaryPrompt.tsx"),
  "utf8",
);
assert.match(
  anniversaryPrompt,
  /capabilities\.canDeleteSpace[\s\S]*capabilities\.canUseDuoFeatures/,
  "AnniversaryPrompt must only ask owners for the shared start date.",
);

const sendPush = readFileSync(
  resolve("supabase/functions/send-push/index.ts"),
  "utf8",
);
assert.match(
  sendPush,
  /resolveDuoRecipientForPin/,
  "send-push must resolve memory_added recipients through active two-member spaces.",
);
assert.match(
  sendPush,
  /space_members[\s\S]*space_id[\s\S]*status/,
  "send-push must inspect space membership before sending partner-memory push notifications.",
);

const sendStreakReminders = readFileSync(
  resolve("supabase/functions/send-streak-reminders/index.ts"),
  "utf8",
);
assert.match(
  sendStreakReminders,
  /loadDuoSpaceMembersForCouple/,
  "send-streak-reminders must skip legacy streaks that do not map to exactly two active space members.",
);
assert.match(
  sendStreakReminders,
  /space_members[\s\S]*space_id[\s\S]*status/,
  "send-streak-reminders must inspect space membership before refreshing or sending streak reminders.",
);

const useStreak = readFileSync(resolve("src/hooks/useStreak.ts"), "utf8");
assert.match(
  useStreak,
  /enabled && snapshot\?\.coupleId === coupleId/,
  "useStreak must key visible streak state by the active space/couple id to avoid stale data across space switches.",
);
assert.match(
  useStreak,
  /queueMicrotask\([\s\S]*setSnapshot\(null\)[\s\S]*setLoadingCoupleId\(null\)/,
  "useStreak must clear previous visible streak snapshots when duo features are disabled.",
);

const notificationToast = readFileSync(
  resolve("src/components/ui/NotificationToast.tsx"),
  "utf8",
);
assert.match(
  notificationToast,
  /if \(!duoEnabled && latestPartnerPin\)[\s\S]*clearLatestPartnerPin\(\)/,
  "NotificationToast must clear queued partner pins while duo features are disabled to avoid replay after switching spaces.",
);

const wishlistPage = readFileSync(resolve("src/pages/WishlistPage.tsx"), "utf8");
assert.match(
  wishlistPage,
  /const\s+\{\s*activeSpace,\s*capabilities\s*\}\s*=\s*useSpaceCtx\(\)/,
  "WishlistPage must read the active space before loading space-scoped stats.",
);
assert.match(
  wishlistPage,
  /useStatsApi\(activeSpace\?\.id,\s*couple\)/,
  "WishlistPage stats must be keyed by the active space id, not the legacy couple id.",
);

const statsApi = readFileSync(resolve("src/hooks/useStatsApi.ts"), "utf8");
assert.match(
  statsApi,
  /useEffect\(\(\) => \{[\s\S]*requestIdRef\.current \+= 1[\s\S]*setStats\(EMPTY_STATS\)[\s\S]*\}, \[spaceId\]\)/,
  "useStatsApi must clear visible stats immediately when the active space changes.",
);
assert.match(
  statsApi,
  /"X-Pinly-Space-Id": spaceId/,
  "useStatsApi must send the active space id to the stats Edge Function.",
);
assert.match(
  statsApi,
  /space-stats:v2:\$\{session\.user\.id\}:\$\{spaceId\}/,
  "useStatsApi must use a space-scoped cache key that ignores older contaminated stats caches.",
);

const coupleStatsFunction = readFileSync(
  resolve("supabase/functions/couple-stats/index.ts"),
  "utf8",
);
assert.match(
  coupleStatsFunction,
  /req\.headers\.get\("X-Pinly-Space-Id"\)/,
  "couple-stats must read the requested active space id from the request.",
);
assert.match(
  coupleStatsFunction,
  /"Access-Control-Allow-Headers":\s*[\s\S]{0,120}x-pinly-space-id/i,
  "couple-stats CORS preflight must allow the active-space request header.",
);
assert.match(
  coupleStatsFunction,
  /"Cache-Control": "no-store"/,
  "couple-stats must not let HTTP caches reuse stats across active spaces.",
);
assert.doesNotMatch(
  coupleStatsFunction,
  /max-age=\d+/,
  "couple-stats must rely on the client space-scoped cache instead of HTTP max-age.",
);
assert.match(
  coupleStatsFunction,
  /Vary: "Authorization, X-Pinly-Space-Id"/,
  "couple-stats must vary any intermediary cache by active space.",
);
assert.match(
  coupleStatsFunction,
  /space_members[\s\S]*space_id[\s\S]*user_id[\s\S]*status/,
  "couple-stats must verify the authenticated user belongs to the requested space.",
);
assert.match(
  coupleStatsFunction,
  /\.eq\("space_id", spaceId\)/,
  "couple-stats must compute memory stats from the requested space_id.",
);
assert.doesNotMatch(
  coupleStatsFunction,
  /select\("couple_id"\)[\s\S]*profile\?\.couple_id/,
  "couple-stats must not fall back to users.couple_id for active-space stats.",
);

const settingsInvitePanelPath = resolve(
  "src/components/settings/SpaceInvitePanel.tsx",
);
if (existsSync(settingsInvitePanelPath)) {
  const settingsInvitePanel = readFileSync(settingsInvitePanelPath, "utf8");
  assert.match(
    settingsInvitePanel,
    /useState<string \| null>\(activeSpace\.invite_code \?\? null\)/,
    "SpaceInvitePanel must hydrate the invite code from activeSpace so it remains visible after switching spaces.",
  );
  assert.match(
    settingsInvitePanel,
    /key=\{activeSpace\.id\}/,
    "SpaceInvitePanel must key state by active space to avoid stale invite display.",
  );
  assert.doesNotMatch(
    settingsInvitePanel,
    /setInviteCode\(null\)/,
    "SpaceInvitePanel must not reset invite state with a synchronous effect.",
  );
  assert.match(
    settingsInvitePanel,
    /copyTimerRef/,
    "SpaceInvitePanel must clear copy feedback timers.",
  );
}

const settingsSpaceSwitcher = readFileSync(
  resolve("src/components/settings/SpaceSwitcher.tsx"),
  "utf8",
);
assert.doesNotMatch(
  settingsSpaceSwitcher,
  /SegmentedControl/,
  "SpaceSwitcher must not use the segmented control for variable-length space names.",
);
assert.match(
  settingsSpaceSwitcher,
  /space-switcher-list/,
  "SpaceSwitcher must render a scrollable space list.",
);
assert.match(
  settingsSpaceSwitcher,
  /space-switcher-option/,
  "SpaceSwitcher must render individual space options with stable sizing.",
);

const notificationFeedContext = readFileSync(
  resolve("src/hooks/NotificationFeedContext.tsx"),
  "utf8",
);
assert.match(
  notificationFeedContext,
  /useSpaceCtx/,
  "NotificationFeedProvider must read active space context.",
);
assert.match(
  notificationFeedContext,
  /useNotificationFeed\(\s*profile\?\.id,\s*activeSpace\?\.id/s,
  "NotificationFeedProvider must scope notifications to the active space.",
);

const notificationFeed = readFileSync(
  resolve("src/hooks/useNotificationFeed.ts"),
  "utf8",
);
assert.match(
  notificationFeed,
  /activeSpaceId: string \| null \| undefined/,
  "useNotificationFeed must accept the active space id.",
);
assert.match(
  notificationFeed,
  /p_space_id: activeSpaceId/,
  "useNotificationFeed must pass active space id to get_notification_feed.",
);
assert.match(
  notificationFeed,
  /function notificationBelongsToActiveSpace[\s\S]*notification\.space_id === activeSpaceId[\s\S]*notification\.space_id === null[\s\S]*notification\.couple_id === activeSpaceId/,
  "Notification realtime inserts must include legacy notifications for the active space only.",
);

const disallowedCopyTerms = [
  { label: "couple/couples", pattern: /\bcouples?\b/i },
  { label: "partner/partners", pattern: /\bpartners?\b/i },
  { label: "người ấy", pattern: /người ấy/i },
  { label: "đối tác", pattern: /đối tác/i },
  { label: "cặp đôi", pattern: /cặp đôi/i },
  { label: "hai bạn", pattern: /hai bạn/i },
  { label: "tình yêu", pattern: /tình yêu/i },
  { label: "ghép đôi", pattern: /ghép đôi/i },
  { label: "ngày bên nhau", pattern: /ngày bên nhau/i },
  { label: "anniversary", pattern: /\banniversary\b/i },
  { label: "dating", pattern: /\bdating\b/i },
  { label: "love map", pattern: /\blove map\b/i },
  { label: "your love", pattern: /\byour love\b/i },
];

const copySources = [
  {
    file: "src/hooks/I18nContext.tsx",
    roots: ["dict"],
  },
  {
    file: "src/lib/legalContent.ts",
    roots: ["privacyVi", "privacyEn", "termsVi", "termsEn"],
  },
];

function collectStringValues(file, rootNames) {
  const sourceText = readFileSync(resolve(file), "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const values = [];

  function addValue(node) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    values.push({
      value: node.text,
      location: `${file}:${line + 1}:${character + 1}`,
    });
  }

  function visitCopyValue(node) {
    if (ts.isStringLiteralLike(node)) {
      addValue(node);
      return;
    }

    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
      visitCopyValue(node.expression);
      return;
    }

    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        visitCopyValue(element);
      }
      return;
    }

    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          visitCopyValue(property.initializer);
        }
      }
    }
  }

  function findRoots(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (rootNames.includes(node.name.text) && node.initializer) {
        visitCopyValue(node.initializer);
      }
    }

    ts.forEachChild(node, findRoots);
  }

  findRoots(sourceFile);
  return values;
}

function collectVisibleJsxValues(file) {
  const sourceText = readFileSync(resolve(file), "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const values = [];

  function addValue(value, node) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    values.push({
      value: normalized,
      location: `${file}:${line + 1}:${character + 1}`,
    });
  }

  function visitVisibleExpression(node) {
    if (ts.isStringLiteralLike(node)) {
      addValue(node.text, node);
      return;
    }

    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      addValue(node.text, node);
      return;
    }

    if (ts.isTemplateExpression(node)) {
      addValue(node.head.text, node.head);
      for (const span of node.templateSpans) {
        visitVisibleExpression(span.expression);
        addValue(span.literal.text, span.literal);
      }
      return;
    }

    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      visit(node);
      return;
    }

    if (ts.isConditionalExpression(node)) {
      visitVisibleExpression(node.whenTrue);
      visitVisibleExpression(node.whenFalse);
      return;
    }

    if (ts.isParenthesizedExpression(node)) {
      visitVisibleExpression(node.expression);
      return;
    }

    if (ts.isBinaryExpression(node)) {
      visitVisibleExpression(node.left);
      visitVisibleExpression(node.right);
      return;
    }

    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "t") {
        return;
      }
      for (const argument of node.arguments) {
        visitVisibleExpression(argument);
      }
      return;
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      visitVisibleExpression(node.body);
      return;
    }

    if (ts.isBlock(node)) {
      for (const statement of node.statements) {
        visitVisibleExpression(statement);
      }
      return;
    }

    if (ts.isExpressionStatement(node)) {
      visitVisibleExpression(node.expression);
      return;
    }

    if (ts.isReturnStatement(node) && node.expression) {
      visitVisibleExpression(node.expression);
      return;
    }

    if (ts.isIfStatement(node)) {
      visitVisibleExpression(node.thenStatement);
      if (node.elseStatement) visitVisibleExpression(node.elseStatement);
      return;
    }

    ts.forEachChild(node, visitVisibleExpression);
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      addValue(node.getText(sourceFile), node);
      return;
    }

    if (ts.isJsxExpression(node) && node.expression) {
      visitVisibleExpression(node.expression);
      return;
    }

    if (ts.isJsxAttribute(node) && node.initializer) {
      const prop = node.name.text;
      if (
        prop === "title" ||
        prop === "aria-label" ||
        prop === "placeholder" ||
        prop === "alt" ||
        prop.startsWith("on")
      ) {
        if (ts.isStringLiteral(node.initializer)) {
          addValue(node.initializer.text, node.initializer);
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          visitVisibleExpression(node.initializer.expression);
        }
      }
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

const disallowedCopyMatches = [];
const visibleJsxSources = [
  "src/pages/SettingsPage.tsx",
  "src/pages/PricingPage.tsx",
];
const visibleJsxValues = visibleJsxSources.flatMap((file) =>
  collectVisibleJsxValues(file),
);
const settingsVisibleValues = visibleJsxValues.filter(({ location }) =>
  location.startsWith("src/pages/SettingsPage.tsx:"),
);
const pricingVisibleValues = visibleJsxValues.filter(({ location }) =>
  location.startsWith("src/pages/PricingPage.tsx:"),
);

for (const requiredSettingCopy of [
  "Hết hạn",
  "Expires",
  "Active",
  "Bản đồ 3D",
  "3D map mode",
  "Map styles premium",
  "Premium map styles",
]) {
  assert.ok(
    settingsVisibleValues.some(({ value }) => value.includes(requiredSettingCopy)),
    `SettingsPage copy scanner must cover "${requiredSettingCopy}".`,
  );
}

for (const requiredPricingCopy of [
  "Cho bản đồ kỷ niệm",
  "Built for memory maps",
  "không gian kỷ niệm",
  "memory space",
  "toàn bộ bản đồ",
  "whole map",
]) {
  assert.ok(
    pricingVisibleValues.some(({ value }) => value.includes(requiredPricingCopy)),
    `PricingPage copy scanner must cover "${requiredPricingCopy}".`,
  );
}

for (const { file, roots } of copySources) {
  for (const { value, location } of collectStringValues(file, roots)) {
    for (const term of disallowedCopyTerms) {
      if (term.pattern.test(value)) {
        disallowedCopyMatches.push(`${location} contains "${term.label}"`);
      }
    }
  }
}

for (const { value, location } of visibleJsxValues) {
  for (const term of disallowedCopyTerms) {
    if (term.pattern.test(value)) {
      disallowedCopyMatches.push(`${location} contains "${term.label}"`);
    }
  }
}

const readmeCopy = readFileSync(resolve("README.md"), "utf8");
for (const term of disallowedCopyTerms) {
  if (term.pattern.test(readmeCopy)) {
    disallowedCopyMatches.push(`README.md contains "${term.label}"`);
  }
}

const indexHtmlCopy = readFileSync(resolve("index.html"), "utf8");
for (const term of disallowedCopyTerms) {
  if (term.pattern.test(indexHtmlCopy)) {
    disallowedCopyMatches.push(`index.html contains "${term.label}"`);
  }
}

assert.deepEqual(
  disallowedCopyMatches,
  [],
  `User-facing copy must use neutral memory-space language.\n${disallowedCopyMatches.join("\n")}`,
);
