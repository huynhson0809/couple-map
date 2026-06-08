import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { useI18n } from "../../hooks/I18nContext";
import { Logo } from "./Logo";

const TABLET_MAX_WIDTH = 1024;

export function DesktopGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [isDesktop, setIsDesktop] = useState(
    () => window.innerWidth > TABLET_MAX_WIDTH,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${TABLET_MAX_WIDTH}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(!e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isDesktop) return <>{children}</>;

  return (
    <div className="desktop-gate">
      <div className="desktop-gate-card">
        <Logo size={48} />
        <Smartphone size={40} className="desktop-gate-icon" />
        <h1>{t("desktop.title")}</h1>
        <p>{t("desktop.desc")}</p>
        <small>{t("desktop.hint")}</small>
      </div>
    </div>
  );
}
