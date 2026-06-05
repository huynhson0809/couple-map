import { Sparkles } from "lucide-react";
import { useI18n } from "../../hooks/I18nContext";
import { Button } from "./Button";

interface Props {
  feature: string;
  onUpgrade: () => void;
  onDismiss: () => void;
}

export function UpgradePrompt({ feature, onUpgrade, onDismiss }: Props) {
  const { lang } = useI18n();

  return (
    <div className="upgrade-prompt-overlay lg-overlay-backdrop" onClick={onDismiss}>
      <div className="upgrade-prompt-card lg-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="upgrade-prompt-badge" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <h3>
          {lang === "vi" ? "Nâng cấp để tiếp tục" : "Upgrade to continue"}
        </h3>
        <p>
          {lang === "vi"
            ? `Tính năng "${feature}" cần gói Plus hoặc Pro.`
            : `"${feature}" requires Plus or Pro plan.`}
        </p>
        <div className="upgrade-prompt-actions">
          <Button type="button" variant="secondary" onClick={onDismiss}>
            {lang === "vi" ? "Để sau" : "Later"}
          </Button>
          <Button type="button" onClick={onUpgrade}>
            {lang === "vi" ? "Nâng cấp" : "Upgrade"}
          </Button>
        </div>
      </div>
    </div>
  );
}
