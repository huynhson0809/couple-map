export type SpaceType = "personal" | "shared" | "group";
export type SpaceRole = "owner" | "member";
export type SpaceMemberStatus = "active" | "removed";
export type SpacePlan = "free" | "plus" | "pro";

export interface SpaceProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  couple_id: string | null;
  first_couple_id: string | null;
  active_space_id: string | null;
  couple_locked_at: string | null;
  created_at: string;
}

export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  invite_code: string | null;
  owner_id: string;
  max_members: number;
  background_image_url: string | null;
  started_on: string | null;
  plan: SpacePlan;
  legacy_couple_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpaceMember {
  space_id: string;
  user_id: string;
  role: SpaceRole;
  status: SpaceMemberStatus;
  joined_at: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  user?: SpaceProfile | null;
}

export interface SpaceContextPayload {
  profile: SpaceProfile | null;
  spaces: Space[];
  activeSpace: Space | null;
  members: SpaceMember[];
}
