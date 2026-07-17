import type { Space, SpaceContextPayload, SpaceMember } from "../types/space";

function countActiveMembers(spaceId: string, members: SpaceMember[]) {
  return members.filter(
    (member) => member.space_id === spaceId && member.status === "active",
  ).length;
}

export function selectPreferredSingleSpace(
  payload: SpaceContextPayload,
): Space | null {
  const spaces = payload.spaces ?? [];
  if (spaces.length === 0) return null;

  const activeSpaceId =
    payload.activeSpace?.id ?? payload.profile?.active_space_id ?? null;
  const currentSpace =
    spaces.find((space) => space.id === activeSpaceId) ?? null;
  const twoMemberSpaces = spaces.filter(
    (space) => countActiveMembers(space.id, payload.members ?? []) === 2,
  );

  return (
    twoMemberSpaces.find((space) => space.id === currentSpace?.id) ??
    twoMemberSpaces[0] ??
    currentSpace ??
    spaces.find((space) => space.type === "personal") ??
    spaces[0]
  );
}

export function scopePayloadToSingleSpace(
  payload: SpaceContextPayload,
): SpaceContextPayload {
  const preferredSpace = selectPreferredSingleSpace(payload);
  if (!preferredSpace) {
    return {
      profile: payload.profile
        ? { ...payload.profile, active_space_id: null }
        : null,
      spaces: [],
      activeSpace: null,
      members: [],
    };
  }

  return {
    profile: payload.profile
      ? { ...payload.profile, active_space_id: preferredSpace.id }
      : null,
    spaces: [preferredSpace],
    activeSpace: preferredSpace,
    members: (payload.members ?? []).filter(
      (member) => member.space_id === preferredSpace.id,
    ),
  };
}
