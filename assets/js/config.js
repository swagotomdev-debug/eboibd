/**
 * eboibd.site - Global Configuration & Utilities
 */

window.EBOI_CONFIG = {
  // Supabase Credentials (auto-filled with your project ref: aixhmugoxwtwenishcfe)
  supabaseUrl: window.__SUPABASE_URL__ || "https://aixhmugoxwtwenishcfe.supabase.co",
  supabaseAnonKey: window.__SUPABASE_ANON_KEY__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",

  // Edge Functions Base URL (defaults to ${supabaseUrl}/functions/v1)
  get functionsUrl() {
    return `${this.supabaseUrl}/functions/v1`;
  },

  // WhatsApp Support
  supportWhatsApp: "01540737205",
  supportEmail: "team@eboibd.site",

  // 4 Core Books Catalog
  books: {
    "ai-income": {
      slug: "ai-income",
      title: "AI দিয়ে ঘরে বসে আয়: ৩০ দিনে প্রথম ইনকাম",
      subtitle: "ChatGPT, Midjourney ও আধুনিক AI টুল ব্যবহার করে ফ্রিল্যান্সিং গাইড",
      pages: 29,
      price: 299,
      themeColor: "#e11d2e",
      coverUrl: "/assets/images/ai-income-cover.webp",
      mockupUrl: "/assets/images/ai-income-mockup.webp",
      ogUrl: "/assets/images/ai-income-og.jpg"
    },
    "freelancer-payment": {
      slug: "freelancer-payment",
      title: "ফ্রিল্যান্সারের টাকা দেশে আনার পুরো গাইড ২০২৬",
      subtitle: "Payoneer, Wise, Bank Transfer ও বৈধ উপায়ে সর্বোচ্চ ডলারে ক্যাশআউট",
      pages: 24,
      price: 249,
      themeColor: "#2457e6",
      coverUrl: "/assets/images/freelancer-payment-cover.webp",
      mockupUrl: "/assets/images/freelancer-payment-mockup.webp",
      ogUrl: "/assets/images/freelancer-payment-og.jpg"
    },
    "facebook-business": {
      slug: "facebook-business",
      title: "ফেসবুক পেজ থেকে ব্যবসা: শূন্য থেকে প্রথম ১০০ অর্ডার",
      subtitle: "বিনা খরচে অর্গানিক রিচ, কনটেন্ট প্ল্যান ও সেলস বৃদ্ধির দেশীয় রোডম্যাপ",
      pages: 23,
      price: 349,
      themeColor: "#f26a12",
      coverUrl: "/assets/images/facebook-business-cover.webp",
      mockupUrl: "/assets/images/facebook-business-mockup.webp",
      ogUrl: "/assets/images/facebook-business-og.jpg"
    },
    "ai-video-editing": {
      slug: "ai-video-editing",
      title: "AI দিয়ে ভিডিও এডিটিং: প্রম্পট ও স্কিল",
      subtitle: "CapCut, Runway ও ElevenLabs দিয়ে ভাইরাল শর্টস ও প্রফেশনাল ভিডিও মেকিং",
      pages: 28,
      price: 299,
      themeColor: "#6d3df0",
      coverUrl: "/assets/images/ai-video-editing-cover.webp",
      mockupUrl: "/assets/images/ai-video-editing-mockup.webp",
      ogUrl: "/assets/images/ai-video-editing-og.jpg"
    }
  }
};

/**
 * Converts English digits to Bangla digits
 */
function toBanglaNumber(n) {
  if (n === null || n === undefined) return "";
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => bnDigits[d]);
}

/**
 * Validates Bangladeshi Phone number (01XXXXXXXXX)
 */
function isValidBDPhone(phone) {
  const cleanPhone = phone.replace(/[\s\-\+]/g, "");
  // Allow 013-019 (11 digits) or 88013-88019 (13 digits)
  return /^01[3-9]\d{8}$/.test(cleanPhone) || /^8801[3-9]\d{8}$/.test(cleanPhone);
}

/**
 * Formats a clean 11-digit BD Phone
 */
function formatBDPhone(phone) {
  let clean = phone.replace(/[\s\-\+]/g, "");
  if (clean.startsWith("880")) clean = clean.substring(2);
  return clean;
}
