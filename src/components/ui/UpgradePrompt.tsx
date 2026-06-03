import { useI18n } from "../../hooks/I18nContext";

interface Props {
  feature: string;
  onUpgrade: () => void;
  onDismiss: () => void;
}

export function UpgradePrompt({ feature, onUpgrade, onDismiss }: Props) {
  const { lang } = useI18n();

  return (
    <div className="upgrade-prompt-overlay" onClick={onDismiss}>
      <div className="upgrade-prompt-card" onClick={(e) => e.stopPropagation()}>
        <h3>
          {lang === "vi" ? "Nâng cấp để tiếp tục" : "Upgrade to continue"}
        </h3>
        <p>
          {lang === "vi"
            ? `Tính năng "${feature}" cần gói Plus hoặc Pro.`
            : `"${feature}" requires Plus or Pro plan.`}
        </p>
        <div className="upgrade-prompt-actions">
          <button type="button" className="dismiss-btn" onClick={onDismiss}>
            {lang === "vi" ? "Để sau" : "Later"}
          </button>
          <button type="button" className="upgrade-btn" onClick={onUpgrade}>
            {lang === "vi" ? "Nâng cấp" : "Upgrade"}
          </button>
        </div>
      </div>
    </div>
  );
}
