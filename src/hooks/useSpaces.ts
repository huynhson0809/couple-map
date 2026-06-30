import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSpaceCapabilities } from "../lib/spaceCapabilities";
import type { Space, SpaceContextPayload, SpaceMember, SpaceProfile } from "../types";

const EMPTY_SPACES: Space[] = [];
const EMPTY_MEMBERS: SpaceMember[] = [];

function emptyPayload(): SpaceContextPayload {
  return { profile: null, spaces: [], activeSpace: null, members: [] };
}

function assertSpacePayload(data: unknown, fallbackMessage: string): Space {
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as { id?: unknown }).id !== "string"
  ) {
    throw new Error(fallbackMessage);
  }
  return data as Space;
}

function assertInviteCode(data: unknown): string {
  if (typeof data !== "string" || data.trim() === "") {
    throw new Error("Could not create invite code");
  }
  return data;
}

function normalizeSpaceError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (code === "PBL01" || message.includes("Owned space limit reached")) {
    return new Error("space_quota_reached");
  }

  if (message.includes("space_delete_last_space")) {
    return new Error("space_delete_last_space");
  }

  if (message.includes("space_delete_owner_required")) {
    return new Error("space_delete_owner_required");
  }

  if (
    message.includes("space_not_found") ||
    message.includes("space_delete_failed")
  ) {
    return new Error("space_delete_failed");
  }

  return error instanceof Error ? error : new Error(message || "space_error");
}

export function useSpaces(userId: string | undefined) {
  const [profile, setProfile] = useState<SpaceProfile | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpace, setActiveSpaceState] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payloadUserId, setPayloadUserId] = useState<string | undefined>(
    undefined,
  );
  const requestIdRef = useRef(0);
  const latestUserIdRef = useRef(userId);

  useEffect(() => {
    latestUserIdRef.current = userId;
  }, [userId]);

  const applyPayload = useCallback(
    (payload: SpaceContextPayload, ownerUserId: string | undefined) => {
      setProfile(payload.profile ?? null);
      setSpaces(payload.spaces ?? []);
      setActiveSpaceState(payload.activeSpace ?? null);
      setMembers(payload.members ?? []);
      setPayloadUserId(ownerUserId);
    },
    [],
  );

  const refresh = useCallback(
    async (opts?: { silent?: boolean; activeSpaceId?: string | null }) => {
      const expectedUserId = userId;
      if (latestUserIdRef.current !== expectedUserId) return;

      const requestId = ++requestIdRef.current;
      const isCurrentRequest = () =>
        requestIdRef.current === requestId &&
        latestUserIdRef.current === expectedUserId;

      if (!userId) {
        if (isCurrentRequest()) {
          applyPayload(emptyPayload(), undefined);
          setError(null);
          setLoading(false);
        }
        return;
      }

      if (!opts?.silent) setLoading(true);
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc(
          "get_space_context_for_current_user",
          { active_space_id: opts?.activeSpaceId ?? null },
        );

        if (rpcError) throw rpcError;
        if (!isCurrentRequest()) return;

        applyPayload(
          (data as SpaceContextPayload | null) ?? emptyPayload(),
          expectedUserId,
        );
      } catch (err) {
        if (!isCurrentRequest()) return;
        setError(err instanceof Error ? err.message : "Could not load spaces");
        applyPayload(emptyPayload(), expectedUserId);
      } finally {
        if (isCurrentRequest()) setLoading(false);
      }
    },
    [applyPayload, userId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const createPersonalSpace = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "create_personal_space_for_current_user",
    );
    if (error) throw normalizeSpaceError(error);
    const space = assertSpacePayload(data, "Could not create personal space");
    await refresh({ silent: true, activeSpaceId: space.id });
    return space;
  }, [refresh]);

  const createSharedSpace = useCallback(
    async (name?: string | null) => {
      const { data, error } = await supabase.rpc(
        "create_shared_space_for_current_user",
        { name: name ?? null },
      );
      if (error) throw normalizeSpaceError(error);
      const space = assertSpacePayload(data, "Could not create shared space");
      await refresh({ silent: true, activeSpaceId: space.id });
      return space;
    },
    [refresh],
  );

  const createOrGetInvite = useCallback(
    async (spaceId: string) => {
      const { data, error } = await supabase.rpc("create_or_get_space_invite", {
        space_id: spaceId,
      });
      if (error) throw error;
      const inviteCode = assertInviteCode(data);
      await refresh({ silent: true });
      return inviteCode;
    },
    [refresh],
  );

  const joinSpaceByInvite = useCallback(
    async (inviteCode: string) => {
      const { data, error } = await supabase.rpc("join_space_by_invite", {
        code: inviteCode.trim().toUpperCase(),
      });
      if (error) throw error;
      const space = assertSpacePayload(data, "Could not join space");
      await refresh({ silent: true, activeSpaceId: space.id });
      return space;
    },
    [refresh],
  );

  const setActiveSpace = useCallback(
    async (spaceId: string) => {
      const { data, error } = await supabase.rpc(
        "set_active_space_for_current_user",
        { space_id: spaceId },
      );
      if (error) throw error;
      const space = assertSpacePayload(data, "Could not switch active space");
      await refresh({ silent: true, activeSpaceId: space.id });
      return space;
    },
    [refresh],
  );

  const deleteSpace = useCallback(
    async (spaceId: string) => {
      const { error } = await supabase.rpc("delete_space_for_current_user", {
        space_id: spaceId,
      });
      if (error) throw normalizeSpaceError(error);
      await refresh({ silent: true });
    },
    [refresh],
  );

  const payloadMatchesUser = payloadUserId === userId;
  const safeProfile = payloadMatchesUser ? profile : null;
  const safeSpaces = payloadMatchesUser ? spaces : EMPTY_SPACES;
  const safeActiveSpace = payloadMatchesUser ? activeSpace : null;
  const safeMembers = payloadMatchesUser ? members : EMPTY_MEMBERS;
  const safeLoading = userId ? loading || !payloadMatchesUser : false;
  const safeError = payloadMatchesUser ? error : null;

  const capabilities = useMemo(
    () => getSpaceCapabilities(safeActiveSpace, safeMembers, userId),
    [safeActiveSpace, safeMembers, userId],
  );

  return {
    profile: safeProfile,
    spaces: safeSpaces,
    activeSpace: safeActiveSpace,
    members: safeMembers,
    capabilities,
    loading: safeLoading,
    error: safeError,
    refresh,
    createPersonalSpace,
    createSharedSpace,
    createOrGetInvite,
    joinSpaceByInvite,
    setActiveSpace,
    deleteSpace,
  };
}
