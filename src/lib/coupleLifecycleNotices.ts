import { supabase } from "./supabase";

export interface CoupleLifecycleNotice {
  id: string;
  user_id: string;
  type: "couple_ended";
  initiator_user_id: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
}

export async function fetchUnreadCoupleLifecycleNotice(userId: string) {
  const { data, error } = await supabase
    .from("couple_lifecycle_notices")
    .select("*")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as CoupleLifecycleNotice | null) ?? null;
}

export async function markCoupleLifecycleNoticeRead(id: string) {
  const { error } = await supabase
    .from("couple_lifecycle_notices")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);

  if (error) throw error;
}
