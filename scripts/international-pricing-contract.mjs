import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  annualSavingsPercent,
  formatPlanPrice,
  getPlanPrice,
} from "../src/lib/pricingCatalog.ts";
import {
  currencyForCheckoutLocale,
  resolveCheckoutLocale,
  resolveCustomerIp,
} from "../supabase/functions/_shared/checkout-context.ts";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

assert.equal(getPlanPrice("en", "monthly", "plus"), 2.99);
assert.equal(getPlanPrice("vi", "monthly", "plus"), 59_000);
assert.match(formatPlanPrice("en", "monthly", "pro"), /\$4\.99/);
assert.match(formatPlanPrice("vi", "annual", "pro"), /950[.\s]?000/);
assert.equal(annualSavingsPercent("vi", "plus"), 20);
assert.equal(annualSavingsPercent("en", "plus"), 30);

assert.equal(resolveCheckoutLocale("vi", "en-US"), "vi");
assert.equal(resolveCheckoutLocale(undefined, "vi-VN,vi;q=0.9"), "vi");
assert.equal(resolveCheckoutLocale(undefined, "fr-FR,fr;q=0.9"), "en");
assert.equal(currencyForCheckoutLocale("vi"), "vnd");
assert.equal(currencyForCheckoutLocale("en"), "usd");
assert.equal(
  resolveCustomerIp(new Headers({ "cf-connecting-ip": "2001:db8::1" })),
  "2001:db8::1",
);
assert.equal(
  resolveCustomerIp(new Headers({ "x-forwarded-for": "203.0.113.4, 10.0.0.1" })),
  "203.0.113.4",
);

const pricingPage = readProjectFile("src/pages/PricingPage.tsx");
const publicPages = readProjectFile("src/content/publicPages.ts");
const subscriptionHook = readProjectFile("src/hooks/useSubscription.tsx");
const i18n = readProjectFile("src/hooks/I18nContext.tsx");
const checkoutFunction = readProjectFile(
  "supabase/functions/create-polar-checkout/index.ts",
);

assert.doesNotMatch(pricingPage, /25000|PLAN_PRICES/);
assert.match(pricingPage, /formatPlanPrice\(lang, cycle/);
assert.match(publicPages, /formatPublicPlanPrice/);
assert.match(subscriptionHook, /locale,/);
assert.match(subscriptionHook, /edgeResponseError/);
assert.match(subscriptionHook, /activationErrorKey/);
assert.match(subscriptionHook, /formatLocalizedDate\(data\.expires_at, locale/);
assert.doesNotMatch(subscriptionHook, /"Lỗi kích hoạt"/);
assert.match(i18n, /"activation\.success"/);
assert.match(checkoutFunction, /customer_ip_address: customerIp/);
assert.match(checkoutFunction, /currency: currencyForCheckoutLocale\(locale\)/);
assert.match(checkoutFunction, /locale,/);

console.log("international pricing contract: ok");
