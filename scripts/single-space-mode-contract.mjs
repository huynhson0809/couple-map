import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  scopePayloadToSingleSpace,
  selectPreferredSingleSpace,
} from "../src/lib/spaceSelection.ts";

function space(id, type = "personal") {
  return { id, type };
}

function member(spaceId, userId) {
  return {
    space_id: spaceId,
    user_id: userId,
    status: "active",
  };
}

function payload({ spaces, activeSpace, members }) {
  return {
    profile: {
      id: "current-user",
      active_space_id: activeSpace?.id ?? null,
    },
    spaces,
    activeSpace,
    members,
  };
}

const solo = space("solo");
const firstDuo = space("duo-first", "shared");
const activeDuo = space("duo-active", "shared");
const multiSpacePayload = payload({
  spaces: [solo, firstDuo, activeDuo],
  activeSpace: activeDuo,
  members: [
    member("solo", "current-user"),
    member("duo-first", "current-user"),
    member("duo-first", "friend-a"),
    member("duo-active", "current-user"),
    member("duo-active", "friend-b"),
  ],
});

assert.equal(
  selectPreferredSingleSpace(multiSpacePayload)?.id,
  "duo-active",
  "Single-space mode should keep the active two-member space when possible.",
);

const soloActivePayload = {
  ...multiSpacePayload,
  profile: { ...multiSpacePayload.profile, active_space_id: "solo" },
  activeSpace: solo,
};
assert.equal(
  selectPreferredSingleSpace(soloActivePayload)?.id,
  "duo-first",
  "A two-member space should take priority over an active solo space.",
);

const soloOnlyPayload = payload({
  spaces: [solo],
  activeSpace: solo,
  members: [member("solo", "current-user")],
});
assert.equal(
  selectPreferredSingleSpace(soloOnlyPayload)?.id,
  "solo",
  "A solo account should keep its current personal space.",
);

const scoped = scopePayloadToSingleSpace(soloActivePayload);
assert.deepEqual(
  scoped.spaces.map((item) => item.id),
  ["duo-first"],
  "Only the preferred space should be exposed to the app.",
);
assert.equal(scoped.activeSpace?.id, "duo-first");
assert.equal(scoped.profile?.active_space_id, "duo-first");
assert.ok(
  scoped.members.every((item) => item.space_id === "duo-first"),
  "Members from hidden spaces must not leak into active-space capabilities.",
);

const featureFlags = readFileSync(
  resolve("src/lib/featureFlags.ts"),
  "utf8",
);
const useSpaces = readFileSync(resolve("src/hooks/useSpaces.ts"), "utf8");
const settings = readFileSync(resolve("src/pages/SettingsPage.tsx"), "utf8");
const switcher = readFileSync(
  resolve("src/components/settings/SpaceSwitcher.tsx"),
  "utf8",
);

assert.match(featureFlags, /VITE_MULTI_SPACE_ENABLED/);
assert.match(featureFlags, /false/);
assert.match(useSpaces, /selectPreferredSingleSpace/);
assert.match(useSpaces, /set_active_space_for_current_user/);
assert.match(useSpaces, /scopePayloadToSingleSpace/);
assert.match(settings, /MULTI_SPACE_ENABLED && !subscriptionLoading/);
assert.match(switcher, /MULTI_SPACE_ENABLED \? \(/);
assert.match(switcher, /SingleSpaceJoinPanel/);
