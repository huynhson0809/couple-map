import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const resendCallers = [
  "supabase/functions/send-streak-reminders/index.ts",
  "supabase/functions/submit-support-message/index.ts",
];

for (const path of resendCallers) {
  const source = readProjectFile(path);

  assert.match(
    source,
    /https:\/\/api\.resend\.com\/emails/,
    `${path} must call the Resend email API.`,
  );
  assert.match(
    source,
    /"User-Agent":\s*"Pinly\/1\.0"/,
    `${path} must identify Pinly because Resend rejects missing User-Agent headers.`,
  );
}

const reminderFunction = readProjectFile(resendCallers[0]);
assert.match(
  reminderFunction,
  /action === "test_email"[\s\S]*target_email[\s\S]*sendEmailToUser/,
  "Streak reminders must expose a secret-protected, email-only delivery test.",
);
assert.doesNotMatch(
  reminderFunction.match(/if \(action === "test_email"\)[\s\S]*?if \(!force/)?.[0] ?? "",
  /sendToUser|claimReminderWindow/,
  "The email test must not send push notifications or claim a reminder window.",
);
assert.match(
  reminderFunction,
  /resendFailureReason[\s\S]*resend_invalid_api_key[\s\S]*resend_testing_domain_restricted[\s\S]*resend_domain_not_verified/,
  "Resend 403 responses must expose a safe actionable reason during testing.",
);
assert.match(
  reminderFunction,
  /EMAIL_REMINDER_HOUR = 20[\s\S]*sendScheduledEmailToUser[\s\S]*outside_daily_email_window/,
  "Recurring streak email must be limited to one evening delivery window.",
);
assert.match(
  reminderFunction,
  /settingsUrl[\s\S]*tắt email nhắc chuỗi/,
  "Reminder emails must provide a visible path to disable future email reminders.",
);

console.log("resend email contract: ok");
