import { LEGAL_EFFECTIVE_DATE } from "./privacyConsent";
import type { Lang } from "../hooks/I18nContext";

export type PolicyKind = "privacy" | "terms";

export interface LegalSection {
  title: string;
  body: string[];
}

export interface LegalContent {
  title: string;
  summary: string;
  effectiveDate: string;
  sections: LegalSection[];
}

const privacyVi: LegalContent = {
  title: "Chính sách quyền riêng tư",
  summary:
    "Pinly giúp các cặp đôi lưu giữ kỷ niệm trên bản đồ chung. Chính sách này giải thích dữ liệu nào được thu thập, cách Pinly sử dụng dữ liệu và cách ảnh, video được xử lý trong dịch vụ.",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      title: "Dữ liệu Pinly thu thập",
      body: [
        "Thông tin tài khoản như email, tên hiển thị và ngôn ngữ.",
        "Thông tin couple như mã mời, ngày kỷ niệm và kết nối với đối tác.",
        "Nội dung kỷ niệm như tiêu đề, ghi chú, tag, tọa độ, địa chỉ, thành phố, quốc gia và thời gian tạo.",
        "Ảnh, video, marker, hình nền, mã định danh tệp media, liên kết media và kích thước media.",
        "Tùy chọn thông báo, push subscription và dữ liệu kỹ thuật cần thiết để vận hành ứng dụng.",
      ],
    },
    {
      title: "Cách Pinly sử dụng dữ liệu",
      body: [
        "Tạo và bảo vệ tài khoản, hiển thị kỷ niệm cho đúng couple, đồng bộ bản đồ và dòng thời gian.",
        "Tải lên, hiển thị, tối ưu kích thước ảnh/video và gửi thông báo hoặc email nhắc nhở nếu bạn bật tính năng này.",
        "Giảm lỗi, ngăn lạm dụng và cải thiện độ ổn định của ứng dụng.",
      ],
    },
    {
      title: "Ảnh và video",
      body: [
        "Pinly bảo vệ dữ liệu trong ứng dụng bằng đăng nhập và quyền truy cập theo couple.",
        "Ảnh và video được xử lý qua Cloudinary để lưu trữ, tối ưu kích thước và hiển thị ổn định trên nhiều thiết bị.",
        "Bạn nên chỉ chia sẻ liên kết media trong những ngữ cảnh đáng tin cậy và không tải lên nội dung quá nhạy cảm hoặc hình ảnh của người khác khi chưa có quyền phù hợp.",
      ],
    },
    {
      title: "Dịch vụ xử lý dữ liệu",
      body: [
        "Supabase được dùng cho đăng nhập, database, edge functions và dữ liệu push notification.",
        "Cloudinary được dùng để lưu trữ và biến đổi ảnh/video.",
        "Nhà cung cấp email, map tiles và browser push service có thể xử lý dữ liệu cần thiết để tính năng tương ứng hoạt động.",
      ],
    },
    {
      title: "Quyền và lựa chọn của bạn",
      body: [
        "Bạn có thể xem, sửa hoặc xóa kỷ niệm và media trong ứng dụng.",
        "Bạn có thể đổi tùy chọn thông báo, yêu cầu sửa/xóa dữ liệu hoặc rút lại đồng ý qua kênh hỗ trợ.",
        "Việc rút lại đồng ý có thể làm một số tính năng tài khoản không tiếp tục hoạt động như trước.",
      ],
    },
    {
      title: "Thời gian lưu trữ và liên hệ",
      body: [
        "Dữ liệu tài khoản được lưu khi tài khoản còn tồn tại. Kỷ niệm và media được lưu đến khi bạn xóa hoặc khi tài khoản/couple được dọn dẹp theo quy trình của Pinly.",
        "Một số log kỹ thuật có thể được lưu trong thời gian giới hạn để bảo mật, vận hành và debug.",
        "Bạn có thể liên hệ hỗ trợ qua kênh Zalo hoặc email được hiển thị trong ứng dụng.",
      ],
    },
  ],
};

const privacyEn: LegalContent = {
  title: "Privacy Policy",
  summary:
    "Pinly helps couples keep memories on a shared map. This policy explains what data is collected, how Pinly uses it, and how photos and videos are handled in the service.",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      title: "Data we collect",
      body: [
        "Account data such as email, display name, and language.",
        "Couple data such as invite code, anniversary date, and partner connection.",
        "Memory data such as title, note, tags, coordinates, address, city, country, and timestamps.",
        "Photos, videos, marker images, backgrounds, media identifiers, media links, and media dimensions.",
        "Notification preferences, push subscriptions, and technical data needed to operate the app.",
      ],
    },
    {
      title: "How we use data",
      body: [
        "To create and secure accounts, show memories to the correct couple, and sync the map and timeline.",
        "To upload, display, optimize media, and send push notifications or optional reminder emails.",
        "To debug issues, prevent abuse, and improve reliability.",
      ],
    },
    {
      title: "Photos and videos",
      body: [
        "Pinly protects app data using login and couple-based access controls.",
        "Photos and videos are processed through Cloudinary for storage, optimization, and reliable delivery across devices.",
        "Share media links only in trusted contexts, and do not upload highly sensitive content or images of other people unless you have the right to do so.",
      ],
    },
    {
      title: "Service providers",
      body: [
        "Supabase is used for authentication, database, edge functions, and push notification data.",
        "Cloudinary is used for image and video storage and transformations.",
        "Email providers, map tile providers, and browser push services may process the data needed for their features.",
      ],
    },
    {
      title: "Your choices",
      body: [
        "You can view, edit, or delete memories and media in the app.",
        "You can change notification preferences and request correction, deletion, or consent withdrawal through support.",
        "Withdrawing consent may limit or disable parts of your account experience.",
      ],
    },
    {
      title: "Retention and contact",
      body: [
        "Account data is kept while the account exists. Memories and media are kept until deleted or until account/couple cleanup under Pinly's operating process.",
        "Some technical logs may be retained for a limited time for security, operations, and debugging.",
        "Contact support through the Zalo or email channel shown in the app.",
      ],
    },
  ],
};

const termsVi: LegalContent = {
  title: "Điều khoản sử dụng",
  summary:
    "Các điều khoản này quy định cách bạn sử dụng Pinly và trách nhiệm của bạn khi tạo, chia sẻ hoặc tải lên nội dung.",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      title: "Tài khoản và quyền sử dụng",
      body: [
        "Bạn cần cung cấp thông tin đăng ký chính xác và bảo mật tài khoản của mình.",
        "Bạn chỉ nên mời đúng người là đối tác của mình vào couple.",
      ],
    },
    {
      title: "Nội dung người dùng",
      body: [
        "Bạn chịu trách nhiệm với kỷ niệm, ghi chú, ảnh, video và bất kỳ nội dung nào bạn tải lên.",
        "Không tải nội dung bất hợp pháp, xâm hại, quấy rối, thân mật không đồng thuận, xâm phạm đời tư hoặc quyền riêng tư của người khác.",
        "Nếu nội dung có hình ảnh hoặc video của người khác, bạn phải có quyền hoặc sự đồng ý phù hợp trước khi tải lên.",
      ],
    },
    {
      title: "Thay đổi dịch vụ",
      body: [
        "Pinly có thể cập nhật tính năng, dung lượng lưu trữ, giới hạn gói và cách vận hành khi dịch vụ phát triển.",
        "Một số tính năng có thể phụ thuộc vào thiết bị, trình duyệt, quyền thông báo, nhà cung cấp bản đồ hoặc nhà cung cấp lưu trữ media.",
      ],
    },
    {
      title: "Xóa nội dung và hạn chế truy cập",
      body: [
        "Bạn có thể xóa kỷ niệm/media trong ứng dụng.",
        "Nội dung hoặc liên kết media đã được chia sẻ ra ngoài ứng dụng có thể cần thêm thời gian để được cập nhật, gỡ bỏ hoặc hết hiệu lực ở các hệ thống liên quan.",
        "Pinly có thể gỡ nội dung hoặc hạn chế truy cập nếu nội dung vi phạm điều khoản, pháp luật hoặc yêu cầu an toàn.",
      ],
    },
    {
      title: "Chính sách quyền riêng tư",
      body: [
        "Chính sách quyền riêng tư là một phần của các điều khoản này và giải thích cách dữ liệu của bạn được xử lý.",
      ],
    },
  ],
};

const termsEn: LegalContent = {
  title: "Terms of Use",
  summary:
    "These terms describe how you may use Pinly and your responsibility when creating, sharing, or uploading content.",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      title: "Account and access",
      body: [
        "You must provide accurate registration information and keep your account secure.",
        "You should only invite your actual partner into your couple space.",
      ],
    },
    {
      title: "User content",
      body: [
        "You are responsible for memories, notes, photos, videos, and other content you upload.",
        "Do not upload illegal, abusive, harassing, non-consensual intimate, privacy-invasive, or harmful content.",
        "If content includes another person's image or video, you must have the right or appropriate consent before uploading it.",
      ],
    },
    {
      title: "Service changes",
      body: [
        "Pinly may update features, storage behavior, plan limits, and operating requirements as the service evolves.",
        "Some features may depend on your device, browser, notification permissions, map provider, or media storage provider.",
      ],
    },
    {
      title: "Deletion and restrictions",
      body: [
        "You can delete memories and media in the app.",
        "Content or media links shared outside the app may take additional time to update, remove, or expire across related systems.",
        "Pinly may remove content or restrict access if content violates these terms, the law, or safety requirements.",
      ],
    },
    {
      title: "Privacy Policy",
      body: [
        "The Privacy Policy is part of these Terms and explains how your data is processed.",
      ],
    },
  ],
};

export function getLegalContent(kind: PolicyKind, lang: Lang): LegalContent {
  if (kind === "privacy") return lang === "vi" ? privacyVi : privacyEn;
  return lang === "vi" ? termsVi : termsEn;
}

export const privacySections = privacyEn.sections;
export const termsSections = termsEn.sections;
