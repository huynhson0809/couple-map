import type { ReactNode } from "react";
import { GlassSurface } from "../ui/GlassSurface";
import { LangSwitch } from "../ui/LangSwitch";
import { Logo } from "../ui/Logo";
import { cx } from "../ui/uiClasses";

interface AuthShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  success?: boolean;
  className?: string;
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  success = false,
  className = "",
}: AuthShellProps) {
  return (
    <main className={cx("auth-page", "auth-shell", success && "auth-shell-success", className)}>
      <div className="auth-material" aria-hidden="true" />
      <div className="auth-topbar">
        <LangSwitch />
      </div>

      <section className="auth-brand" aria-label="Pinly">
        <Logo size={76} />
        <div className="auth-brand-copy">
          <p className="auth-kicker">Pinly</p>
          <h1>{title}</h1>
        </div>
      </section>

      <GlassSurface level="section" className="auth-card">
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </GlassSurface>

      {footer && <div className="auth-footer">{footer}</div>}
    </main>
  );
}
