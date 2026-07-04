import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { Pin } from "../types";

interface Args {
  spaceId: string | null | undefined;
  onInsert?: (pin: Pin) => void;
  onUpdate?: (pin: Pin) => void;
  onDelete?: (id: string) => void;
}

export function useCoupleRealtime({
  spaceId,
  onInsert,
  onUpdate,
  onDelete,
}: Args) {
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
  }, [onDelete, onInsert, onUpdate]);

  useEffect(() => {
    if (!spaceId) return;
    const channel = supabase
      .channel(`pins:${spaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pins",
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => onInsertRef.current?.(payload.new as Pin),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pins",
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => onUpdateRef.current?.(payload.new as Pin),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "pins",
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => onDeleteRef.current?.((payload.old as { id: string }).id),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [spaceId]);
}
