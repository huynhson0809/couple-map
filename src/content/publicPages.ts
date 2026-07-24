import { formatPublicPlanPrice } from "../lib/pricingCatalog.ts";

export type PublicLanguage = "vi" | "en";

export type PublicPageKey =
  | "home"
  | "about"
  | "features"
  | "pricing"
  | "faq"
  | "memoryMapGuide"
  | "travelJournalGuide";

type PublicSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type PublicQuestion = {
  question: string;
  answer: string;
};

type PublicPlan = {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  description: string;
  features: string[];
};

type LocalizedPublicPage = {
  eyebrow: string;
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  sections: PublicSection[];
  questions?: PublicQuestion[];
  steps?: string[];
  plans?: PublicPlan[];
  ctaTitle: string;
  ctaDescription: string;
};

export type PublicPageDefinition = {
  key: PublicPageKey;
  path: string;
  schemaType: "WebPage" | "AboutPage" | "FAQPage" | "HowTo";
  image: string;
  vi: LocalizedPublicPage;
  en: LocalizedPublicPage;
};

export const PUBLIC_CHROME = {
  vi: {
    navLabel: "Điều hướng trang giới thiệu Pinly",
    about: "Về Pinly",
    features: "Tính năng",
    pricing: "Bảng giá",
    faq: "Hỏi đáp",
    guides: "Hướng dẫn",
    login: "Đăng nhập",
    register: "Bắt đầu miễn phí",
    language: "Đổi ngôn ngữ",
    related: "Đọc tiếp",
    monthly: "Theo tháng",
    annual: "Theo năm",
    stepLabel: "Bước",
    footer:
      "Pinly là bản đồ kỷ niệm riêng tư dành cho cá nhân và những người bạn tin tưởng.",
  },
  en: {
    navLabel: "Pinly information navigation",
    about: "About",
    features: "Features",
    pricing: "Pricing",
    faq: "FAQ",
    guides: "Guides",
    login: "Log in",
    register: "Start for free",
    language: "Switch language",
    related: "Keep reading",
    monthly: "Monthly",
    annual: "Annual",
    stepLabel: "Step",
    footer:
      "Pinly is a private memory map for individuals and the people they trust.",
  },
} as const;

export const PUBLIC_PAGES: Record<PublicPageKey, PublicPageDefinition> = {
  home: {
    key: "home",
    path: "/",
    schemaType: "WebPage",
    image: "/landing/da-nang-journey-map.jpg",
    vi: {
      eyebrow: "Bản đồ kỷ niệm Pinly",
      title: "Lưu kỷ niệm theo từng nơi chốn",
      description:
        "Pinly là ứng dụng bản đồ kỷ niệm giúp bạn lưu địa điểm, ảnh, video và câu chuyện trên một timeline riêng tư. Bạn có thể dùng một mình hoặc chia sẻ với người được mời.",
      metaTitle: "Pinly - Bản đồ kỷ niệm theo từng nơi chốn",
      metaDescription:
        "Lưu địa điểm, ảnh, video và câu chuyện trên bản đồ kỷ niệm riêng tư. Dùng Pinly một mình hoặc chia sẻ với người bạn tin tưởng.",
      sections: [],
      ctaTitle: "Tạo bản đồ kỷ niệm đầu tiên",
      ctaDescription: "Bắt đầu miễn phí với 50 kỷ niệm.",
    },
    en: {
      eyebrow: "Pinly memory map",
      title: "Keep every memory connected to its place",
      description:
        "Pinly is a private memory map for saving places, photos, videos, and stories on a personal timeline. Use it on your own or share it with someone you invite.",
      metaTitle: "Pinly - A Private Map for Your Memories",
      metaDescription:
        "Save places, photos, videos, and stories on a private memory map. Use Pinly on your own or share it with someone you trust.",
      sections: [],
      ctaTitle: "Create your first memory map",
      ctaDescription: "Start free with 50 memories.",
    },
  },
  about: {
    key: "about",
    path: "/about",
    schemaType: "AboutPage",
    image: "/landing/my-khe-morning.jpg",
    vi: {
      eyebrow: "Về Pinly",
      title: "Một nơi riêng để nhớ những nơi đã đi qua",
      description:
        "Pinly là ứng dụng bản đồ kỷ niệm dành cho người muốn lưu lại cuộc sống theo địa điểm, thay vì để ảnh và câu chuyện trôi lẫn trong nhiều ứng dụng khác nhau.",
      metaTitle: "Pinly là gì? Ứng dụng bản đồ kỷ niệm riêng tư",
      metaDescription:
        "Tìm hiểu Pinly là gì, cách ứng dụng lưu ảnh, video và câu chuyện theo địa điểm, cũng như cách dùng riêng hoặc chia sẻ với người được mời.",
      sections: [
        {
          title: "Pinly giải quyết điều gì?",
          paragraphs: [
            "Ảnh thường nằm trong thư viện, địa điểm nằm trong ứng dụng bản đồ, còn câu chuyện chỉ còn trong trí nhớ. Pinly đặt những phần đó cạnh nhau: mỗi kỷ niệm gắn với một nơi, một thời điểm và nội dung bạn muốn giữ lại.",
            "Khi mở lại bản đồ hoặc timeline, bạn không chỉ thấy một tọa độ. Bạn thấy câu chuyện đã xảy ra ở đó.",
          ],
        },
        {
          title: "Pinly dành cho ai?",
          paragraphs: [
            "Pinly phù hợp với người thích ghi lại những ngày bình thường, người đang xây nhật ký hành trình, hoặc hai người muốn cùng lưu những nơi có ý nghĩa.",
          ],
          bullets: [
            "Dùng riêng như một nhật ký địa điểm cá nhân",
            "Lưu hành trình và các điểm dừng trong một chuyến đi",
            "Mời một người bạn tin tưởng cùng đóng góp kỷ niệm",
            "Xem lại câu chuyện theo bản đồ hoặc timeline",
          ],
        },
        {
          title: "Riêng tư trước, chia sẻ khi bạn chọn",
          paragraphs: [
            "Bản đồ bắt đầu là không gian của bạn. Nội dung chỉ được chia sẻ khi bạn chủ động mời người khác. Pinly không biến kỷ niệm riêng thành một bảng tin công khai.",
          ],
        },
      ],
      ctaTitle: "Bắt đầu với bản đồ của riêng bạn",
      ctaDescription:
        "Tạo tài khoản miễn phí, ghim kỷ niệm đầu tiên và mời thêm người khi bạn sẵn sàng.",
    },
    en: {
      eyebrow: "About Pinly",
      title: "A private place for the places you remember",
      description:
        "Pinly is a memory map for people who want to preserve life by location instead of letting photos and stories disappear across separate apps.",
      metaTitle: "What is Pinly? A private memory map app",
      metaDescription:
        "Learn how Pinly connects places, photos, videos, and stories, and how to keep a map private or share it with someone you invite.",
      sections: [
        {
          title: "What problem does Pinly solve?",
          paragraphs: [
            "Photos live in a library, locations live in a maps app, and the story is often left to memory. Pinly brings them together: every memory has a place, a time, and the context you want to keep.",
            "When you return to your map or timeline, you see more than coordinates. You see what happened there.",
          ],
        },
        {
          title: "Who is Pinly for?",
          paragraphs: [
            "Pinly works for everyday journaling, travel memories, and two trusted people who want to build a shared record of meaningful places.",
          ],
          bullets: [
            "A private location journal for one person",
            "A visual record of stops along a trip",
            "A shared memory map with someone you trust",
            "A map and timeline for revisiting stories",
          ],
        },
        {
          title: "Private first, shared by choice",
          paragraphs: [
            "Your map starts as your own space. Content is shared only when you actively invite someone. Pinly does not turn private memories into a public feed.",
          ],
        },
      ],
      ctaTitle: "Start with a map of your own",
      ctaDescription:
        "Create a free account, pin your first memory, and invite someone when you are ready.",
    },
  },
  features: {
    key: "features",
    path: "/features",
    schemaType: "WebPage",
    image: "/landing/rooftop-da-nang-feature.jpg",
    vi: {
      eyebrow: "Tính năng",
      title: "Bản đồ, timeline và câu chuyện nằm cùng một chỗ",
      description:
        "Pinly sắp xếp kỷ niệm theo nơi chốn và thời gian, để bạn tìm lại một khoảnh khắc bằng câu chuyện chứ không phải tên file ảnh.",
      metaTitle: "Tính năng Pinly - Bản đồ, timeline và kỷ niệm riêng tư",
      metaDescription:
        "Khám phá bản đồ kỷ niệm, timeline, ảnh, video, chuỗi mỗi ngày, wishlist địa điểm và chế độ chia sẻ riêng tư của Pinly.",
      sections: [
        {
          title: "Ghim một kỷ niệm vào đúng nơi",
          paragraphs: [
            "Chọn địa điểm, thêm tiêu đề, ngày tháng, ghi chú và ảnh. Mỗi dấu ghim trở thành một trang kỷ niệm có bối cảnh rõ ràng.",
          ],
          bullets: [
            "Tìm địa điểm hoặc chọn trực tiếp trên bản đồ",
            "Lưu ảnh và video tùy theo gói",
            "Tìm lại bằng tiêu đề, địa chỉ, người tạo hoặc khoảng thời gian",
          ],
        },
        {
          title: "Xem lại theo bản đồ hoặc timeline",
          paragraphs: [
            "Bản đồ cho biết câu chuyện đã diễn ra ở đâu. Timeline cho biết chúng đã nối tiếp nhau như thế nào. Hai góc nhìn dùng chung một nguồn kỷ niệm.",
          ],
        },
        {
          title: "Giữ nhịp với chuỗi kỷ niệm",
          paragraphs: [
            "Chuỗi giúp bạn duy trì thói quen ghi lại một điều nhỏ mỗi ngày. Pinly có thể gửi lời nhắc riêng cho người dùng cá nhân hoặc lời nhắc phù hợp khi bản đồ được chia sẻ.",
          ],
        },
        {
          title: "Riêng tư và có quyền kiểm soát",
          paragraphs: [
            "Bản đồ cá nhân chỉ thuộc về bạn. Khi bật chia sẻ, chỉ người được mời mới có thể xem và đóng góp vào không gian chung.",
          ],
        },
      ],
      ctaTitle: "Ghim câu chuyện đầu tiên",
      ctaDescription:
        "Pinly hoạt động trên trình duyệt và có thể thêm vào Màn hình chính như một ứng dụng.",
    },
    en: {
      eyebrow: "Features",
      title: "Your map, timeline, and stories in one place",
      description:
        "Pinly organizes memories by place and time, so you can find a moment through its story instead of an image filename.",
      metaTitle: "Pinly features - Private memory map and timeline",
      metaDescription:
        "Explore Pinly's memory map, timeline, photos, video, daily streak, place wishlist, search, and private sharing controls.",
      sections: [
        {
          title: "Pin a memory to the place it belongs",
          paragraphs: [
            "Choose a location, then add a title, date, note, and photos. Each pin becomes a memory page with useful context.",
          ],
          bullets: [
            "Search for a place or choose it directly on the map",
            "Save photos and, on supported plans, video",
            "Find memories by title, address, creator, or date range",
          ],
        },
        {
          title: "Return through the map or timeline",
          paragraphs: [
            "The map shows where a story happened. The timeline shows how moments followed one another. Both views use the same memories.",
          ],
        },
        {
          title: "Build a daily memory streak",
          paragraphs: [
            "Streaks make it easier to preserve one small moment each day. Pinly can send reminders for solo users and appropriate reminders when a map is shared.",
          ],
        },
        {
          title: "Private and under your control",
          paragraphs: [
            "A personal map belongs to you. When sharing is enabled, only invited people can view and contribute to the shared space.",
          ],
        },
      ],
      ctaTitle: "Pin your first story",
      ctaDescription:
        "Pinly works in the browser and can be added to your Home Screen like an app.",
    },
  },
  pricing: {
    key: "pricing",
    path: "/pricing",
    schemaType: "WebPage",
    image: "/landing/da-nang-journey-map.jpg",
    vi: {
      eyebrow: "Bảng giá",
      title: "Bắt đầu miễn phí, nâng cấp khi bản đồ đầy hơn",
      description:
        "Mỗi gói Pinly giới hạn số kỷ niệm và công cụ sáng tạo khác nhau. Kỷ niệm đã lưu không tự bị xóa khi bạn đổi gói.",
      metaTitle: "Bảng giá Pinly - Free, Plus và Pro",
      metaDescription:
        "So sánh Pinly Free 50 kỷ niệm, Plus 300 kỷ niệm và Pro 500 kỷ niệm. Xem giá tháng, giá năm, ảnh, video và kiểu bản đồ.",
      sections: [
        {
          title: "Bạn có thể bắt đầu mà không cần thẻ thanh toán",
          paragraphs: [
            "Gói Free đủ để tạo bản đồ đầu tiên và thử đầy đủ luồng lưu kỷ niệm. Plus phù hợp khi bạn cần nhiều không gian lưu hơn và bản đồ 3D. Pro dành cho người muốn lưu video và dùng đầy đủ kiểu bản đồ.",
          ],
        },
        {
          title: "Điều gì xảy ra khi gói hết hạn?",
          paragraphs: [
            "Pinly giữ lại dữ liệu đã có. Nếu số kỷ niệm đang vượt giới hạn của gói hiện tại, bạn vẫn có thể xem chúng nhưng cần nâng cấp hoặc giảm dữ liệu trước khi thêm mới.",
          ],
        },
      ],
      plans: [
        {
          name: "Free",
          monthlyPrice: "0đ",
          annualPrice: "0đ",
          description: "Bắt đầu bản đồ kỷ niệm đầu tiên.",
          features: [
            "50 kỷ niệm",
            "3 ảnh cho mỗi kỷ niệm",
            "3 kiểu bản đồ",
            "Theo dõi chuỗi kỷ niệm",
          ],
        },
        {
          name: "Plus",
          monthlyPrice: formatPublicPlanPrice("vi", "monthly", "plus"),
          annualPrice: formatPublicPlanPrice("vi", "annual", "plus"),
          description: "Thêm không gian lưu và bản đồ 3D.",
          features: [
            "300 kỷ niệm",
            "5 ảnh cho mỗi kỷ niệm",
            "10 kiểu bản đồ và bản đồ 3D",
            "5 danh mục tùy chỉnh",
          ],
        },
        {
          name: "Pro",
          monthlyPrice: formatPublicPlanPrice("vi", "monthly", "pro"),
          annualPrice: formatPublicPlanPrice("vi", "annual", "pro"),
          description: "Trọn bộ tính năng dành cho người lưu nhiều.",
          features: [
            "500 kỷ niệm",
            "5 ảnh và video cho mỗi kỷ niệm",
            "Nhắc chuỗi qua email",
            "15 kiểu bản đồ và bản đồ 3D",
            "Danh mục tùy chỉnh không giới hạn",
          ],
        },
      ],
      ctaTitle: "Bắt đầu với gói Free",
      ctaDescription:
        "Bạn có thể nâng cấp Plus hoặc Pro bất cứ lúc nào trong phần Cài đặt.",
    },
    en: {
      eyebrow: "Pricing",
      title: "Start free, then grow when your map does",
      description:
        "Each Pinly plan offers a different memory limit and creative toolkit. Existing memories are not automatically deleted when your plan changes.",
      metaTitle: "Pinly pricing - Free, Plus, and Pro plans",
      metaDescription:
        "Compare Pinly Free with 50 memories, Plus with 300, and Pro with 500. See monthly and annual pricing, photo, video, and map limits.",
      sections: [
        {
          title: "Start without a payment card",
          paragraphs: [
            "Free is enough to create a first map and try the complete memory flow. Plus adds more capacity and 3D maps. Pro is for people who want video and the full map-style library.",
          ],
        },
        {
          title: "What happens when a plan expires?",
          paragraphs: [
            "Pinly keeps existing data. If the number of memories is above the current plan limit, you can still view them but must upgrade or reduce usage before adding more.",
          ],
        },
      ],
      plans: [
        {
          name: "Free",
          monthlyPrice: "$0",
          annualPrice: "$0",
          description: "Create your first memory map.",
          features: [
            "50 memories",
            "3 photos per memory",
            "3 map styles",
            "Memory streak tracking",
          ],
        },
        {
          name: "Plus",
          monthlyPrice: formatPublicPlanPrice("en", "monthly", "plus"),
          annualPrice: formatPublicPlanPrice("en", "annual", "plus"),
          description: "More room and 3D maps.",
          features: [
            "300 memories",
            "5 photos per memory",
            "10 map styles and 3D maps",
            "5 custom categories",
          ],
        },
        {
          name: "Pro",
          monthlyPrice: formatPublicPlanPrice("en", "monthly", "pro"),
          annualPrice: formatPublicPlanPrice("en", "annual", "pro"),
          description: "The complete toolkit for a growing archive.",
          features: [
            "500 memories",
            "5 photos and video per memory",
            "Email streak reminders",
            "15 map styles and 3D maps",
            "Unlimited custom categories",
          ],
        },
      ],
      ctaTitle: "Start on the Free plan",
      ctaDescription:
        "You can upgrade to Plus or Pro at any time from Settings.",
    },
  },
  faq: {
    key: "faq",
    path: "/faq",
    schemaType: "FAQPage",
    image: "/landing/hoi-an-family.jpg",
    vi: {
      eyebrow: "Hỏi đáp",
      title: "Những điều cần biết trước khi bắt đầu với Pinly",
      description:
        "Câu trả lời ngắn gọn về bản đồ kỷ niệm, quyền riêng tư, chia sẻ, giới hạn gói và cách cài Pinly trên điện thoại.",
      metaTitle: "Câu hỏi thường gặp về Pinly",
      metaDescription:
        "Pinly là gì, có miễn phí không, ai xem được kỷ niệm, cách mời người khác và cách cài Pinly lên điện thoại.",
      sections: [],
      questions: [
        {
          question: "Pinly là gì?",
          answer:
            "Pinly là ứng dụng bản đồ kỷ niệm. Mỗi kỷ niệm có thể gồm địa điểm, tiêu đề, ngày tháng, ghi chú, ảnh hoặc video tùy theo gói. Bạn có thể xem lại chúng trên bản đồ và timeline.",
        },
        {
          question: "Pinly có miễn phí không?",
          answer:
            "Có. Gói Free cho phép lưu tối đa 50 kỷ niệm, 3 ảnh cho mỗi kỷ niệm và sử dụng 3 kiểu bản đồ. Plus và Pro tăng giới hạn và mở thêm tính năng.",
        },
        {
          question: "Ai có thể xem kỷ niệm của tôi?",
          answer:
            "Bản đồ cá nhân chỉ hiển thị với bạn. Khi bạn chủ động bật chia sẻ và gửi lời mời, người được mời mới có thể truy cập nội dung trong không gian chung.",
        },
        {
          question: "Tôi có thể dùng Pinly một mình không?",
          answer:
            "Có. Pinly hỗ trợ đầy đủ bản đồ, timeline, wishlist, chuỗi kỷ niệm và lời nhắc cho người dùng cá nhân. Bạn không cần mời người khác để sử dụng ứng dụng.",
        },
        {
          question: "Tôi có thể chia sẻ bản đồ với người khác không?",
          answer:
            "Có. Khi tính năng chia sẻ được bật, bạn có thể gửi mã mời cho một người bạn tin tưởng. Chỉ thành viên đã tham gia mới xem và đóng góp vào bản đồ chung.",
        },
        {
          question: "Pinly có cần tải từ App Store hoặc Google Play không?",
          answer:
            "Không. Pinly là Progressive Web App chạy trên trình duyệt. Bạn có thể thêm Pinly vào Màn hình chính từ Safari hoặc Chrome để mở nhanh như một ứng dụng.",
        },
        {
          question: "Điều gì xảy ra khi tôi vượt giới hạn gói?",
          answer:
            "Pinly không tự xóa kỷ niệm đã lưu. Bạn vẫn xem được dữ liệu hiện có, nhưng sẽ không thể thêm kỷ niệm mới cho đến khi giảm số lượng hoặc nâng cấp gói.",
        },
      ],
      ctaTitle: "Vẫn còn điều bạn muốn hỏi?",
      ctaDescription:
        "Người dùng đã đăng nhập có thể gửi câu hỏi hoặc báo lỗi từ Trung tâm hỗ trợ trong phần Cài đặt.",
    },
    en: {
      eyebrow: "FAQ",
      title: "What to know before you start with Pinly",
      description:
        "Short answers about memory maps, privacy, sharing, plan limits, and installing Pinly on a phone.",
      metaTitle: "Frequently asked questions about Pinly",
      metaDescription:
        "Learn what Pinly is, whether it is free, who can see memories, how invitations work, and how to install Pinly on a phone.",
      sections: [],
      questions: [
        {
          question: "What is Pinly?",
          answer:
            "Pinly is a memory map app. A memory can include a location, title, date, note, photos, or video depending on the plan. Memories can be revisited on the map and timeline.",
        },
        {
          question: "Is Pinly free?",
          answer:
            "Yes. Free includes up to 50 memories, 3 photos per memory, and 3 map styles. Plus and Pro increase limits and unlock additional features.",
        },
        {
          question: "Who can see my memories?",
          answer:
            "A personal map is visible only to you. When you intentionally enable sharing and send an invitation, the invited person can access content in the shared space.",
        },
        {
          question: "Can I use Pinly on my own?",
          answer:
            "Yes. Pinly includes a map, timeline, wishlist, memory streak, and reminders for solo users. You do not need to invite anyone to use the app.",
        },
        {
          question: "Can I share a map with someone else?",
          answer:
            "Yes. When sharing is enabled, you can send an invitation code to someone you trust. Only joined members can view and contribute to the shared map.",
        },
        {
          question: "Do I need the App Store or Google Play?",
          answer:
            "No. Pinly is a Progressive Web App that runs in the browser. Add it to your Home Screen from Safari or Chrome to open it like an app.",
        },
        {
          question: "What happens when I exceed a plan limit?",
          answer:
            "Pinly does not automatically delete existing memories. You can continue viewing them, but cannot add more until usage is reduced or the plan is upgraded.",
        },
      ],
      ctaTitle: "Still have a question?",
      ctaDescription:
        "Signed-in users can send a question or bug report from the Support Center in Settings.",
    },
  },
  memoryMapGuide: {
    key: "memoryMapGuide",
    path: "/guides/memory-map",
    schemaType: "HowTo",
    image: "/landing/my-khe-morning.jpg",
    vi: {
      eyebrow: "Hướng dẫn",
      title: "Cách tạo bản đồ kỷ niệm cá nhân",
      description:
        "Bản đồ kỷ niệm là một cách lưu câu chuyện theo địa điểm. Với Pinly, bạn có thể bắt đầu từ một dấu ghim rồi dần biến bản đồ thành nhật ký của riêng mình.",
      metaTitle: "Cách tạo bản đồ kỷ niệm cá nhân với Pinly",
      metaDescription:
        "Hướng dẫn từng bước tạo bản đồ kỷ niệm, thêm địa điểm, ảnh, ghi chú và xem lại câu chuyện trên timeline Pinly.",
      sections: [
        {
          title: "Bản đồ kỷ niệm khác bản đồ địa điểm như thế nào?",
          paragraphs: [
            "Một danh sách địa điểm chỉ cho biết bạn đã lưu nơi nào. Bản đồ kỷ niệm còn lưu điều gì đã xảy ra, khi nào, cùng ảnh và vài dòng giúp bạn nhớ lại bối cảnh.",
          ],
        },
        {
          title: "Nên bắt đầu với kỷ niệm nào?",
          paragraphs: [
            "Hãy chọn một nơi bạn nhớ rõ: quán quen, chuyến đi gần nhất, căn nhà cũ hoặc một buổi chiều bình thường. Bắt đầu nhỏ giúp bản đồ trở thành thói quen thay vì một dự án phải hoàn thành.",
          ],
        },
      ],
      steps: [
        "Tạo tài khoản Pinly và mở bản đồ cá nhân.",
        "Chọn nút thêm kỷ niệm, sau đó tìm địa điểm hoặc chọn trực tiếp trên bản đồ.",
        "Đặt tiêu đề rõ ràng, chọn ngày và viết một ghi chú ngắn về điều đã xảy ra.",
        "Thêm ảnh hoặc video nếu gói hiện tại hỗ trợ, rồi lưu kỷ niệm.",
        "Mở Timeline để xem lại câu chuyện theo thời gian hoặc dùng tìm kiếm để tìm bằng tiêu đề và địa chỉ.",
      ],
      ctaTitle: "Tạo dấu ghim đầu tiên",
      ctaDescription: "Gói Free cho phép bạn bắt đầu với tối đa 50 kỷ niệm.",
    },
    en: {
      eyebrow: "Guide",
      title: "How to create a personal memory map",
      description:
        "A memory map preserves stories by location. With Pinly, one pin can gradually become a personal journal of meaningful places.",
      metaTitle: "How to create a personal memory map with Pinly",
      metaDescription:
        "A step-by-step guide to creating a memory map, adding places, photos, and notes, and revisiting stories on the Pinly timeline.",
      sections: [
        {
          title: "How is a memory map different from saved places?",
          paragraphs: [
            "A saved-place list tells you where something is. A memory map also preserves what happened, when it happened, and the photos and notes that bring the context back.",
          ],
        },
        {
          title: "Which memory should come first?",
          paragraphs: [
            "Choose a place you remember clearly: a favorite cafe, a recent trip, an old home, or an ordinary afternoon. Starting small turns the map into a habit instead of a project to finish.",
          ],
        },
      ],
      steps: [
        "Create a Pinly account and open your personal map.",
        "Choose Add memory, then search for a place or select it directly on the map.",
        "Write a clear title, choose the date, and add a short note about what happened.",
        "Add photos or video when supported by the current plan, then save the memory.",
        "Open Timeline to revisit the story in order, or search by title and address.",
      ],
      ctaTitle: "Create your first pin",
      ctaDescription: "Free lets you begin with up to 50 memories.",
    },
  },
  travelJournalGuide: {
    key: "travelJournalGuide",
    path: "/guides/travel-memory-journal",
    schemaType: "HowTo",
    image: "/landing/hoi-an-family.jpg",
    vi: {
      eyebrow: "Hướng dẫn",
      title: "Cách làm nhật ký chuyến đi trên bản đồ",
      description:
        "Một nhật ký hành trình trên bản đồ giúp bạn nhớ tuyến đường, từng điểm dừng và câu chuyện ở mỗi nơi mà không cần sắp xếp lại mọi thứ sau chuyến đi.",
      metaTitle: "Cách tạo nhật ký chuyến đi trên bản đồ với Pinly",
      metaDescription:
        "Lưu từng điểm dừng, ảnh, ghi chú và ngày tháng để tạo nhật ký hành trình trực quan trên bản đồ và timeline Pinly.",
      sections: [
        {
          title: "Ghi lại trong lúc đi, không chờ đến khi về",
          paragraphs: [
            "Chỉ cần một tiêu đề, địa điểm và một bức ảnh là đủ cho lần lưu đầu tiên. Bạn có thể bổ sung ghi chú sau. Điều quan trọng là giữ được vị trí và thời điểm khi ký ức còn mới.",
          ],
        },
        {
          title: "Kết hợp bản đồ và timeline",
          paragraphs: [
            "Bản đồ cho bạn thấy tuyến hành trình bằng các dấu ghim. Timeline giữ đúng thứ tự của những buổi sáng, bữa ăn, đoạn đường và điểm dừng trong chuyến đi.",
          ],
        },
      ],
      steps: [
        "Trước chuyến đi, lưu những nơi muốn đến trong Wishlist.",
        "Khi đến một điểm, tạo kỷ niệm và dùng vị trí hiện tại hoặc tìm tên địa điểm.",
        "Thêm tiêu đề dễ nhớ, ngày giờ, ảnh và một chi tiết nhỏ của khoảnh khắc đó.",
        "Lặp lại ở mỗi điểm dừng quan trọng, không cần ghi quá dài.",
        "Sau chuyến đi, mở Timeline để chỉnh lại câu chuyện và chia sẻ bản đồ với người được mời khi cần.",
      ],
      ctaTitle: "Bắt đầu nhật ký hành trình",
      ctaDescription: "Lưu điểm đến đầu tiên ngay khi ký ức vẫn còn mới.",
    },
    en: {
      eyebrow: "Guide",
      title: "How to make a travel journal on a map",
      description:
        "A map-based travel journal preserves the route, each stop, and the story of every place without requiring a large organizing project after the trip.",
      metaTitle: "How to create a map-based travel journal with Pinly",
      metaDescription:
        "Save stops, photos, notes, and dates to build a visual travel journal on the Pinly map and timeline.",
      sections: [
        {
          title: "Capture the trip while it is happening",
          paragraphs: [
            "A title, location, and one photo are enough for the first save. Notes can be expanded later. The important part is preserving the place and time while the memory is fresh.",
          ],
        },
        {
          title: "Combine the map and timeline",
          paragraphs: [
            "The map reveals the journey through its pins. The timeline keeps the mornings, meals, roads, and stops in the order they happened.",
          ],
        },
      ],
      steps: [
        "Before the trip, save places you want to visit in Wishlist.",
        "At each stop, create a memory using the current location or place search.",
        "Add a memorable title, date and time, photos, and one small detail from the moment.",
        "Repeat at meaningful stops without worrying about writing a long entry.",
        "After the trip, open Timeline to refine the story and share the map with an invited person when needed.",
      ],
      ctaTitle: "Start your travel journal",
      ctaDescription: "Save the first stop while the memory is still fresh.",
    },
  },
};

export const PUBLIC_PAGE_KEYS = Object.keys(PUBLIC_PAGES) as PublicPageKey[];

export const PUBLIC_INFO_PAGE_KEYS = PUBLIC_PAGE_KEYS.filter(
  (key) => key !== "home",
);

export const PUBLIC_POLICY_PATHS = ["/privacy", "/terms"] as const;

function normalizePublicPath(pathname: string) {
  if (!pathname) return "/";
  const withLeadingSlash = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`;
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/, "")
    : withLeadingSlash;
}

export function getLocalizedPublicPath(
  pathname: string,
  language: PublicLanguage,
) {
  const normalizedPath = normalizePublicPath(pathname);
  const basePath =
    normalizedPath === "/vi"
      ? "/"
      : normalizedPath.startsWith("/vi/")
        ? normalizedPath.slice(3)
        : normalizedPath;

  if (language === "en") return basePath;
  return basePath === "/" ? "/vi" : `/vi${basePath}`;
}

export function getPublicPageRouteByPath(pathname: string) {
  const normalizedPath = normalizePublicPath(pathname);
  const language: PublicLanguage =
    normalizedPath === "/vi" || normalizedPath.startsWith("/vi/")
      ? "vi"
      : "en";
  const basePath = getLocalizedPublicPath(normalizedPath, "en");
  const page = PUBLIC_PAGE_KEYS.map((key) => PUBLIC_PAGES[key]).find(
    (candidate) => candidate.path === basePath,
  );

  return page ? { page, language } : undefined;
}

export function getPublicPageByPath(pathname: string) {
  return getPublicPageRouteByPath(pathname)?.page;
}

export function getPublicPageSchema(
  page: PublicPageDefinition,
  language: PublicLanguage,
) {
  const content = page[language];
  const localizedPath = getLocalizedPublicPath(page.path, language);
  const url = `https://pinly.tech${localizedPath}`;
  const base = {
    "@context": "https://schema.org",
    "@type": page.schemaType,
    name: content.title,
    headline: content.title,
    description: content.metaDescription,
    url,
    image: `https://pinly.tech${page.image}`,
    inLanguage: language,
    isPartOf: {
      "@type": "WebSite",
      "@id": "https://pinly.tech/#website",
      name: "Pinly",
      url: "https://pinly.tech/",
    },
    about: {
      "@type": "SoftwareApplication",
      name: "Pinly",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      url: "https://pinly.tech/",
    },
    dateModified: "2026-07-22",
  };

  if (page.schemaType === "FAQPage") {
    return {
      ...base,
      mainEntity: (content.questions ?? []).map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    };
  }

  if (page.schemaType === "HowTo") {
    return {
      ...base,
      totalTime: "PT10M",
      step: (content.steps ?? []).map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: `${PUBLIC_CHROME[language].stepLabel} ${index + 1}`,
        text: step,
      })),
    };
  }

  return base;
}
