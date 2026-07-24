export type PricingLanguage = "en" | "vi";
export type PricingPlan = "plus" | "pro";
export type PricingCycle = "monthly" | "annual";

type LocalizedPricing = {
  currency: "USD" | "VND";
  monthly: Record<PricingPlan, number>;
  annual: Record<PricingPlan, number>;
};

export const PLAN_PRICING: Record<PricingLanguage, LocalizedPricing> = {
  en: {
    currency: "USD",
    monthly: { plus: 2.99, pro: 4.99 },
    annual: { plus: 24.99, pro: 39.99 },
  },
  vi: {
    currency: "VND",
    monthly: { plus: 59_000, pro: 99_000 },
    annual: { plus: 566_000, pro: 950_000 },
  },
};

export function getPlanPrice(
  language: PricingLanguage,
  cycle: PricingCycle,
  plan: PricingPlan,
) {
  return PLAN_PRICING[language][cycle][plan];
}

export function formatPlanPrice(
  language: PricingLanguage,
  cycle: PricingCycle,
  plan: PricingPlan,
) {
  const pricing = PLAN_PRICING[language];
  const amount = pricing[cycle][plan];

  return new Intl.NumberFormat(language === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: pricing.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: pricing.currency === "USD" ? 2 : 0,
    maximumFractionDigits: pricing.currency === "USD" ? 2 : 0,
  }).format(amount);
}

export function formatPublicPlanPrice(
  language: PricingLanguage,
  cycle: PricingCycle,
  plan: PricingPlan,
) {
  const period =
    cycle === "monthly"
      ? language === "vi"
        ? "tháng"
        : "month"
      : language === "vi"
        ? "năm"
        : "year";

  return `${formatPlanPrice(language, cycle, plan)}/${period}`;
}

export function annualSavingsPercent(
  language: PricingLanguage,
  plan: PricingPlan,
) {
  const pricing = PLAN_PRICING[language];
  return Math.round(
    (1 - pricing.annual[plan] / (pricing.monthly[plan] * 12)) * 100,
  );
}

export function annualSavingsLabel(language: PricingLanguage) {
  const savings = (["plus", "pro"] as const).map((plan) =>
    annualSavingsPercent(language, plan),
  );
  const minimum = Math.min(...savings);
  const maximum = Math.max(...savings);
  const percentage =
    minimum === maximum ? `${minimum}%` : `${minimum}-${maximum}%`;

  return language === "vi"
    ? `Tiết kiệm ${percentage}`
    : `Save ${percentage}`;
}
