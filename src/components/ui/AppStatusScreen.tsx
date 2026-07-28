import type { ReactNode } from "react";
import { Logo } from "./Logo";

interface AppStatusScreenProps {
  title: string;
  body?: string;
  children?: ReactNode;
  tone?: "idle" | "error";
}

export function AppStatusScreen({
  title,
  body,
  children,
  tone = "idle",
}: AppStatusScreenProps) {
  return (
    <div
      className={`full-center app-status-screen ${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-busy={tone === "idle"}
    >
      <div className="app-status-card">
        <div className="app-status-logo">
          <Logo size={44} />
        </div>
        <h2>{title}</h2>
        {body && <p className="muted">{body}</p>}
        {children}
      </div>
    </div>
  );
}
