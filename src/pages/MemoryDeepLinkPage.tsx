import { useEffect, useRef } from "react";
import { useLocation, useParams } from "react-router-dom";
import { TimelinePageContent } from "./TimelinePage";

export function MemoryDeepLinkPage() {
  const { pinId } = useParams<{ pinId: string }>();
  const location = useLocation();
  const seededBackstopRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pinId || seededBackstopRef.current === location.key) return;

    seededBackstopRef.current = location.key;
    const currentRoute = `${location.pathname}${location.search}${location.hash}`;
    const currentState = window.history.state ?? {};

    window.history.replaceState(
      {
        ...currentState,
        pinlyMemoryBackstopFor: pinId,
      },
      "",
      "/timeline",
    );
    window.history.pushState(
      {
        ...currentState,
        pinlyMemoryDeepLinkFor: pinId,
      },
      "",
      currentRoute,
    );
  }, [location.hash, location.key, location.pathname, location.search, pinId]);

  return <TimelinePageContent deepLinkPinId={pinId} />;
}
