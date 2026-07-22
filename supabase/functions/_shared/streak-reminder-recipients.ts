export type DuoReminderState = {
  today_user_a_posted: boolean;
  today_user_b_posted: boolean;
};

export type DuoReminderRecipient = {
  userId: string;
  slot: "user_a" | "user_b";
};

export function eligibleDuoRecipients(
  streak: DuoReminderState,
  userA: string,
  userB: string,
): DuoReminderRecipient[] {
  const recipients: DuoReminderRecipient[] = [];

  if (!streak.today_user_a_posted) {
    recipients.push({ userId: userA, slot: "user_a" });
  }
  if (!streak.today_user_b_posted) {
    recipients.push({ userId: userB, slot: "user_b" });
  }

  return recipients;
}
