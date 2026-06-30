import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useSpaces } from "./useSpaces";

type SpaceHook = ReturnType<typeof useSpaces>;

const SpaceCtx = createContext<SpaceHook | null>(null);

export function SpaceProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}) {
  const value = useSpaces(userId);
  const { refresh } = value;
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const spaceIdsKey = value.spaces
    .map((space) => space.id)
    .sort()
    .join(":");

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`space-profile:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${userId}`,
        },
        () => refreshRef.current({ silent: true }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const spaceIds = spaceIdsKey.split(":").filter(Boolean);
    if (spaceIds.length === 0) return;

    const channel = supabase.channel(`spaces:${spaceIdsKey}`);

    for (const spaceId of spaceIds) {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "space_members",
            filter: `space_id=eq.${spaceId}`,
          },
          () => refreshRef.current({ silent: true }),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "spaces",
            filter: `id=eq.${spaceId}`,
          },
          () => refreshRef.current({ silent: true }),
        );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [spaceIdsKey]);

  return <SpaceCtx.Provider value={value}>{children}</SpaceCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSpaceCtx() {
  const value = useContext(SpaceCtx);
  if (!value) throw new Error("useSpaceCtx must be used within SpaceProvider");
  return value;
}
