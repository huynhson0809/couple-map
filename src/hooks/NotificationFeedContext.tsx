import { createContext, useContext } from "react";
import { useNotificationFeed } from "./useNotificationFeed";
import { useCoupleCtx } from "./CoupleContext";

type NotifFeed = ReturnType<typeof useNotificationFeed>;

const Ctx = createContext<NotifFeed | null>(null);

export function NotificationFeedProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = useCoupleCtx();
  const feed = useNotificationFeed(profile?.id);
  return <Ctx.Provider value={feed}>{children}</Ctx.Provider>;
}

export function useNotifFeed(): NotifFeed {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useNotifFeed must be inside NotificationFeedProvider");
  return ctx;
}
