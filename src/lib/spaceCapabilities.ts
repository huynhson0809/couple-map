import type { Space, SpaceMember } from "../types/space";

export interface SpaceCapabilities {
  memberCount: number;
  maxMembers: number;
  canUseDuoFeatures: boolean;
  canInviteInCurrentUi: boolean;
  backendCanAcceptMember: boolean;
  isOwner: boolean;
  canDeleteSpace: boolean;
  canLeaveSpace: boolean;
}

export function getSpaceCapabilities(
  space: Space | null,
  members: SpaceMember[],
  currentUserId: string | null | undefined,
): SpaceCapabilities {
  const activeMembers = members.filter(
    (member) => member.space_id === space?.id && member.status === "active",
  );
  const memberCount = activeMembers.length;
  const maxMembers = space?.max_members ?? 5;
  const hasSpace = space !== null;
  const currentMember = activeMembers.find(
    (member) => member.user_id === currentUserId,
  );
  const isActiveMember = currentMember !== undefined;
  const isOwner = currentMember?.role === "owner";
  const canManageCurrentSpace = hasSpace && isActiveMember;

  return {
    memberCount,
    maxMembers,
    canUseDuoFeatures: memberCount === 2,
    canInviteInCurrentUi: canManageCurrentSpace && isOwner && memberCount < 2,
    backendCanAcceptMember: canManageCurrentSpace && memberCount < maxMembers,
    isOwner,
    canDeleteSpace: canManageCurrentSpace && isOwner,
    canLeaveSpace: canManageCurrentSpace && (memberCount > 1 || !isOwner),
  };
}
