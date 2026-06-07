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
  title: "Chinh sach quyen rieng tu",
  summary:
    "Pinly giup cac cap doi luu giu ky niem tren ban do. Chinh sach nay giai thich du lieu nao duoc thu thap, cach chung minh su dung va gioi han rieng tu cua media luu tren Cloudinary.",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      title: "Du lieu chung minh thu thap",
      body: [
        "Thong tin tai khoan nhu email, ten hien thi va ngon ngu.",
        "Thong tin cap doi nhu ma moi, ngay ky niem va ket noi voi doi tac.",
        "Noi dung ky niem nhu tieu de, ghi chu, tag, toa do, dia chi, thanh pho, quoc gia va thoi gian tao.",
        "Anh, video, marker, hinh nen, Cloudinary public id, URL media va kich thuoc media.",
        "Tuy chon thong bao, push subscription va du lieu ky thuat can thiet de van hanh ung dung.",
      ],
    },
    {
      title: "Cach chung minh su dung du lieu",
      body: [
        "Tao va bao ve tai khoan, hien thi ky niem cho dung cap doi, dong bo ban do va dong thoi gian.",
        "Upload, hien thi, chuyen doi kich thuoc anh/video va gui thong bao hoac email reminder neu ban bat tinh nang nay.",
        "Giam loi, chan lam dung va cai thien do on dinh cua ung dung.",
      ],
    },
    {
      title: "Gioi han rieng tu cua anh va video",
      body: [
        "Pinly gioi han metadata trong ung dung bang dang nhap va quyen truy cap theo couple.",
        "Trong phien ban MVP nay, anh va video duoc phan phoi bang Cloudinary public-style URL de tiet kiem chi phi va giu ung dung chay nhanh tren goi mien phi.",
        "Neu ai do co direct media URL, ho co the xem file do. Khong tai len noi dung qua nhay cam hoac hinh anh cua nguoi khac neu ban chua co quyen.",
      ],
    },
    {
      title: "Dich vu xu ly du lieu",
      body: [
        "Supabase duoc dung cho dang nhap, database, edge functions va du lieu push notification.",
        "Cloudinary duoc dung de luu tru va bien doi anh/video.",
        "Nha cung cap email, map tiles va browser push service co the xu ly du lieu can thiet de tinh nang hoat dong.",
      ],
    },
    {
      title: "Quyen va lua chon cua ban",
      body: [
        "Ban co the xem, sua hoac xoa ky niem va media trong ung dung.",
        "Ban co the doi tuy chon thong bao, yeu cau sua/xoa du lieu hoac rut lai dong y qua kenh ho tro.",
        "Rut lai dong y co the lam tai khoan khong tiep tuc su dung duoc mot so tinh nang.",
      ],
    },
    {
      title: "Thoi gian luu tru va lien he",
      body: [
        "Du lieu tai khoan duoc luu khi tai khoan con ton tai. Ky niem va media duoc luu den khi ban xoa hoac khi tai khoan/couple duoc don dep.",
        "Mot so log ky thuat co the duoc luu trong thoi gian gioi han de bao mat va debug.",
        "Lien he ho tro qua kenh Zalo hoac email duoc hien thi trong ung dung.",
      ],
    },
  ],
};

const privacyEn: LegalContent = {
  title: "Privacy Policy",
  summary:
    "Pinly helps couples keep memories on a shared map. This policy explains what data is collected, how it is used, and the current privacy limitation of media stored on Cloudinary.",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      title: "Data we collect",
      body: [
        "Account data such as email, display name, and language.",
        "Couple data such as invite code, anniversary date, and partner connection.",
        "Memory data such as title, note, tags, coordinates, address, city, country, and timestamps.",
        "Photos, videos, marker images, backgrounds, Cloudinary public ids, direct media URLs, and media dimensions.",
        "Notification preferences, push subscriptions, and technical data needed to operate the app.",
      ],
    },
    {
      title: "How we use data",
      body: [
        "To create and secure accounts, show memories to the correct couple, and sync the map and timeline.",
        "To upload, display, transform media, and send push notifications or optional reminder emails.",
        "To debug issues, prevent abuse, and improve reliability.",
      ],
    },
    {
      title: "Media privacy limitation",
      body: [
        "Pinly limits media metadata inside the app using login and couple-based database permissions.",
        "In this MVP, photos and videos are delivered with Cloudinary public-style URLs to keep the app fast and affordable on free tiers.",
        "Anyone with a direct media URL may be able to view that file. Do not upload highly sensitive content or images of other people unless you have the right to do so.",
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
        "Account data is kept while the account exists. Memories and media are kept until deleted or until account/couple cleanup.",
        "Some technical logs may be retained for a limited time for security and debugging.",
        "Contact support through the Zalo or email channel shown in the app.",
      ],
    },
  ],
};

const termsVi: LegalContent = {
  title: "Dieu khoan su dung",
  summary:
    "Cac dieu khoan nay quy dinh cach ban su dung Pinly va trach nhiem cua ban khi tai len noi dung.",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      title: "Tai khoan va quyen su dung",
      body: [
        "Ban can cung cap thong tin dang ky chinh xac va bao mat tai khoan cua minh.",
        "Ban chi nen moi dung nguoi la doi tac cua minh vao couple.",
      ],
    },
    {
      title: "Noi dung nguoi dung",
      body: [
        "Ban chiu trach nhiem voi ky niem, ghi chu, anh, video va bat ky noi dung nao ban tai len.",
        "Khong tai noi dung bat hop phap, xam hai, quay roi, khieu dam khong dong thuan, xam pham doi tu hoac quyen rieng tu cua nguoi khac.",
        "Neu noi dung co hinh anh hoac video cua nguoi khac, ban phai co quyen hoac su dong y phu hop truoc khi tai len.",
      ],
    },
    {
      title: "Gioi han dich vu",
      body: [
        "Pinly dang trong giai doan MVP/free operation va duoc cung cap theo hien trang.",
        "Tinh nang, gioi han goi free/pro, cach luu tru va han muc co the thay doi khi san pham phat trien.",
      ],
    },
    {
      title: "Xoa noi dung va han che truy cap",
      body: [
        "Ban co the xoa ky niem/media trong ung dung.",
        "Ban hieu rang ban sao cache hoac direct URL da tung duoc chia se co the nam ngoai kha nang kiem soat truc tiep cua Pinly trong mot thoi gian.",
        "Pinly co the go noi dung hoac han che truy cap neu noi dung vi pham dieu khoan, phap luat hoac yeu cau an toan.",
      ],
    },
    {
      title: "Chinh sach quyen rieng tu",
      body: [
        "Chinh sach quyen rieng tu la mot phan cua dieu khoan nay va giai thich cach du lieu cua ban duoc xu ly.",
      ],
    },
  ],
};

const termsEn: LegalContent = {
  title: "Terms of Use",
  summary:
    "These terms describe how you may use Pinly and your responsibility for uploaded content.",
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
      title: "Service limits",
      body: [
        "Pinly is provided as-is during MVP/free operation.",
        "Features, free/pro limits, storage behavior, and quotas may change as the product evolves.",
      ],
    },
    {
      title: "Deletion and restrictions",
      body: [
        "You can delete memories and media in the app.",
        "You understand that cached copies or direct URLs that were previously shared may remain outside Pinly's direct control for some time.",
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
