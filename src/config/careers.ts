import type { PublicLanguage } from "../content/publicPages";

export const DEFAULT_CAREERS_EMAIL = "pinly.sp@gmail.com";

export function createCareersMailto(
  email: string,
  language: PublicLanguage,
) {
  const subject =
    language === "vi"
      ? "[Pinly Growth] Trao đổi vai trò Founding Growth Partner"
      : "[Pinly Growth] Founding Growth Partner conversation";
  const body =
    language === "vi"
      ? [
          "Chào Pinly,",
          "",
          "Mình là:",
          "Điều khiến mình muốn đồng hành cùng Pinly:",
          "Một vài dự án hoặc nội dung mình tự hào:",
          "Thời gian mình có thể cam kết mỗi tuần:",
          "LinkedIn / portfolio:",
          "",
          "Cảm ơn Pinly.",
        ].join("\n")
      : [
          "Hi Pinly,",
          "",
          "My name is:",
          "What interests me about building Pinly:",
          "A few projects or pieces of work I am proud of:",
          "The time I can commit each week:",
          "LinkedIn / portfolio:",
          "",
          "Thank you.",
        ].join("\n");

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
