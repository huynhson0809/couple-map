import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { Pin } from "../types";

interface Args {
  coupleId: string | null | undefined;
  onInsert?: (pin: Pin) => void;
  onUpdate?: (pin: Pin) => void;
  onDelete?: (id: string) => void;
}

export function useCoupleRealtime({
  coupleId,
  onInsert,
  onUpdate,
  onDelete,
}: Args) {
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  onInsertRef.current = onInsert;
  onUpdateRef.current = onUpdate;
  onDeleteRef.current = onDelete;

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`pins:${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pins",
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => onInsertRef.current?.(payload.new as Pin),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pins",
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => onUpdateRef.current?.(payload.new as Pin),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "pins",
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => onDeleteRef.current?.((payload.old as { id: string }).id),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId]);
}
