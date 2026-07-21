import { Analytics } from "@vercel/analytics/react";
import { filterWebAnalyticsEvent } from "../../lib/webAnalytics";

export function WebAnalytics() {
  return <Analytics beforeSend={filterWebAnalyticsEvent} />;
}
