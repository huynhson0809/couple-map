import { useState } from "react";
import { Check, Crown, Sparkles, X, Zap } from "lucide-react";
import { useSubscription, PLAN_LIMITS } from "../hooks/useSubscription";
import { useI18n } from "../hooks/I18nContext";

const PLAN_FEATURES: Record<
  string,
  { key: string; value: string | boolean }[]
> = {
  free: [
    { key: "pins", value: "100" },
    { key: "photos", value: "3" },
    { key: "video", value: false },
    { key: "styles", value: "3" },
    { key: "categories", value: false },
    { key: "grace", value: "0" },
    { key: "watermark", value: true },
  ],
  plus: [
    { key: "pins", value: "300" },
    { key: "photos", value: "5" },
    { key: "video", value: false },
    { key: "styles", value: "10" },
    { key: "categories", value: "5" },
    { key: "grace", value: "1" },
    { key: "watermark", value: false },
  ],
  pro: [
    { key: "pins", value: "∞" },
    { key: "photos", value: "5" },
    { key: "video", value: true },
    { key: "styles", value: "15" },
    { key: "categories", value: "∞" },
    { key: "grace", value: "3" },
    { key: "watermark", value: false },
  ],
};

const FEATURE_LABELS: Record<string, { vi: string; en: string }> = {
  pins: { vi: "Kỷ niệm", en: "Memories" },
  photos: { vi: "Ảnh/kỷ niệm", en: "Photos/memory" },
  video: { vi: "Upload video", en: "Video upload" },
  styles: { vi: "Map styles", en: "Map styles" },
  categories: { vi: "Danh mục tùy chỉnh", en: "Custom categories" },
  grace: { vi: "Streak grace (ngày)", en: "Streak grace (days)" },
  watermark: { vi: "Share card watermark", en: "Share card watermark" },
};

export function PricingPage({ onClose }: { onClose: () => void }) {
  const {
    plan: currentPlan,
    activateCode,
    loading: subLoading,
  } = useSubscription();
  const { lang } = useI18n();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [code, setCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const prices = {
    plus: cycle === "annual" ? 278400 : 29000,
    pro: cycle === "annual" ? 374400 : 39000,
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
  };

  const periodLabel =
    cycle === "annual"
      ? lang === "vi"
        ? "năm"
        : "year"
      : lang === "vi"
        ? "tháng"
        : "month";

  const formatFeatureValue = (value: string | boolean) => {
    if (value === true) return lang === "vi" ? "Có" : "Yes";
    if (value === false) return lang === "vi" ? "Không" : "No";
    return value;
  };

  const renderFeatures = (plan: "plus" | "pro") => (
    <ul className="pricing-features">
      {PLAN_FEATURES[plan].map((feature) => {
        const included = feature.value !== false;
        return (
          <li
            key={feature.key}
            className={
              included ? "pricing-feature-included" : "pricing-feature-excluded"
            }
          >
            {included ? <Check size={14} /> : <X size={14} />}
            <span>
              {FEATURE_LABELS[feature.key]?.[lang] ?? feature.key}:{" "}
              <strong>{formatFeatureValue(feature.value)}</strong>
            </span>
          </li>
        );
      })}
    </ul>
  );

  const handleActivate = async () => {
    if (!code.trim()) return;
    setActivating(true);
    setActivateResult(null);
    try {
      const result = await activateCode(code.trim());
      setActivateResult(result);
      if (result.success) setCode("");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="pricing-page">
      <header className="pricing-header">
        <button type="button" className="pricing-close" onClick={onClose}>
          ×
        </button>
        <div className="pricing-premium-badge">
          <Sparkles size={14} aria-hidden="true" />
          <span>{lang === "vi" ? "Dành cho hai người" : "Built for two"}</span>
        </div>
        <h1>{lang === "vi" ? "Nâng cấp Pinly" : "Upgrade Pinly"}</h1>
        <p className="muted">
          {lang === "vi"
            ? "Mở khóa tất cả tính năng cho kỷ niệm của hai bạn"
            : "Unlock all features for your memories together"}
        </p>
        <p className="muted pricing-gift-note">
          {lang === "vi"
            ? "🎁 Chỉ cần 1 người mua, cả 2 cùng dùng được!"
            : "🎁 One purchase covers both of you!"}
        </p>
      </header>

      {/* Cycle toggle */}
      <div className="pricing-cycle-toggle">
        <button
          type="button"
          className={cycle === "monthly" ? "active" : ""}
          onClick={() => setCycle("monthly")}
        >
          {lang === "vi" ? "Tháng" : "Monthly"}
        </button>
        <button
          type="button"
          className={cycle === "annual" ? "active" : ""}
          onClick={() => setCycle("annual")}
        >
          {lang === "vi" ? "Năm" : "Annual"}
          <span className="pricing-save-badge">-20%</span>
        </button>
      </div>

      {/* Plan cards */}
      <div className="pricing-cards">
        {/* Plus */}
        <div
          className={`pricing-card ${currentPlan === "plus" ? "current" : ""}`}
        >
          <div className="pricing-card-header">
            <Sparkles size={20} />
            <h2>Plus</h2>
          </div>
          <div className="pricing-card-price">
            <span className="pricing-amount">{formatPrice(prices.plus)}</span>
            <span className="pricing-period">/{periodLabel}</span>
          </div>
          {currentPlan === "plus" ? (
            <div className="pricing-current-badge">
              {lang === "vi" ? "Gói hiện tại" : "Current plan"}
            </div>
          ) : currentPlan === "pro" ? (
            <div className="pricing-current-badge">
              {lang === "vi" ? "Đang dùng Pro" : "On Pro"}
            </div>
          ) : null}
          {renderFeatures("plus")}
        </div>

        {/* Pro */}
        <div
          className={`pricing-card pricing-card-pro ${currentPlan === "pro" ? "current" : ""}`}
        >
          <div className="pricing-popular-badge">
            {lang === "vi" ? "Phổ biến nhất" : "Most popular"}
          </div>
          <div className="pricing-card-header">
            <Crown size={20} />
            <h2>Pro</h2>
          </div>
          <div className="pricing-card-price">
            <span className="pricing-amount">{formatPrice(prices.pro)}</span>
            <span className="pricing-period">/{periodLabel}</span>
          </div>
          {currentPlan === "pro" ? (
            <div className="pricing-current-badge">
              {lang === "vi" ? "Gói hiện tại" : "Current plan"}
            </div>
          ) : null}
          {renderFeatures("pro")}
        </div>
      </div>

      {/* Free comparison */}
      <div className="pricing-free-note">
        <Zap size={14} />
        <span>
          {lang === "vi"
            ? `Free: ${PLAN_LIMITS.free.pins} pins, ${PLAN_LIMITS.free.photosPerPin} ảnh/pin, 3 map styles`
            : `Free: ${PLAN_LIMITS.free.pins} pins, ${PLAN_LIMITS.free.photosPerPin} photos/pin, 3 map styles`}
        </span>
      </div>

      {/* Activation code section */}
      {currentPlan === "free" && (
        <div className="pricing-activate-section">
          <h3>{lang === "vi" ? "Kích hoạt gói" : "Activate plan"}</h3>
          <p className="muted">
            {lang === "vi"
              ? "Liên hệ để nhận mã kích hoạt, sau đó nhập mã bên dưới."
              : "Contact us to get an activation code, then enter it below."}
          </p>
          <div className="pricing-activate-input">
            <input
              type="text"
              placeholder={lang === "vi" ? "Nhập mã kích hoạt" : "Enter code"}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              disabled={activating}
            />
            <button
              type="button"
              className="pricing-activate-btn"
              onClick={handleActivate}
              disabled={activating || !code.trim() || subLoading}
            >
              {activating ? "..." : lang === "vi" ? "Kích hoạt" : "Activate"}
            </button>
          </div>
          {activateResult && (
            <div
              className={`pricing-activate-result ${activateResult.success ? "success" : "error"}`}
            >
              {activateResult.message}
            </div>
          )}
          <div className="pricing-contact-buttons">
            <a
              href="https://zalo.me/0969696969"
              target="_blank"
              rel="noopener noreferrer"
              className="pricing-contact-btn pricing-contact-zalo"
            >
              💬 Zalo
            </a>
            <a
              href="mailto:support@pinly.app"
              className="pricing-contact-btn pricing-contact-email"
            >
              ✉️ Email
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
