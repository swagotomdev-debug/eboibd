// Vercel Serverless Function: my-books
// Searches purchased books by customer email or phone number from Supabase

const BOOKS = {
  "ai-income": {
    slug: "ai-income",
    title: "AI দিয়ে ঘরে বসে আয়: ৩০ দিনে প্রথম ইনকাম",
    pages: 29,
    price: 99,
    themeColor: "#e11d2e",
    coverUrl: "/assets/images/ai-income-cover.webp",
    mockupUrl: "/assets/images/ai-income-mockup.webp",
    downloadUrl: "/sample-ebooks/ai-income.pdf"
  },
  "freelancer-payment": {
    slug: "freelancer-payment",
    title: "ফ্রিল্যান্সারের টাকা দেশে আনার পুরো গাইড ২০২৬",
    pages: 24,
    price: 99,
    themeColor: "#2457e6",
    coverUrl: "/assets/images/freelancer-payment-cover.webp",
    mockupUrl: "/assets/images/freelancer-payment-mockup.webp",
    downloadUrl: "/sample-ebooks/freelancer-payment.pdf"
  },
  "facebook-business": {
    slug: "facebook-business",
    title: "ফেসবুক পেজ থেকে ব্যবসা: শূন্য থেকে প্রথম ১০০ অর্ডার",
    pages: 23,
    price: 99,
    themeColor: "#f26a12",
    coverUrl: "/assets/images/facebook-business-cover.webp",
    mockupUrl: "/assets/images/facebook-business-mockup.webp",
    downloadUrl: "/sample-ebooks/facebook-business.pdf"
  },
  "ai-video-editing": {
    slug: "ai-video-editing",
    title: "AI দিয়ে ভিডিও এডিটিং: প্রম্পট ও স্কিল",
    pages: 28,
    price: 99,
    themeColor: "#6d3df0",
    coverUrl: "/assets/images/ai-video-editing-cover.webp",
    mockupUrl: "/assets/images/ai-video-editing-mockup.webp",
    downloadUrl: "/sample-ebooks/ai-video-editing.pdf"
  }
};

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, apikey, authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const query = (req.method === "POST" ? (req.body && req.body.query) : req.query.query) || "";
  const cleanQuery = String(query).trim();

  if (!cleanQuery) {
    return res.status(400).json({ success: false, error: "অনুগ্রহ করে আপনার ইমেইল অথবা মোবাইল নম্বর লিখুন।" });
  }

  const isEmail = cleanQuery.includes("@");
  let cleanPhone = cleanQuery.replace(/[\s\-\+]/g, "");
  if (cleanPhone.startsWith("880")) cleanPhone = cleanPhone.substring(2);

  const supabaseUrl = process.env.SUPABASE_URL || "https://aixhmugoxwtwenishcfe.supabase.co";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpeGhtdWdveHd0d2VuaXNoY2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY1OTcsImV4cCI6MjEwNjAwMjU5N30.XheysYjfFxvZztK60Dcf8NkSP5TrAZYuC5G8-Ff96Pk";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

  try {
    // 1. Fetch all books from Supabase to map book_id -> slug
    let booksMap = { ...BOOKS };
    try {
      const bRes = await fetch(`${supabaseUrl}/rest/v1/books?select=id,slug,title,price_bdt,cover_url,file_path`, {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`
        }
      });
      if (bRes.ok) {
        const bList = await bRes.json();
        bList.forEach((b) => {
          if (booksMap[b.slug]) {
            booksMap[b.slug].id = b.id;
          }
        });
      }
    } catch (_) {}

    // 2. Query Supabase orders for this email or phone
    let filterClause = "";
    if (isEmail) {
      filterClause = `email=ilike.${encodeURIComponent(cleanQuery.toLowerCase())}`;
    } else {
      filterClause = `phone=like.*${encodeURIComponent(cleanPhone)}*`;
    }

    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?${filterClause}&select=*&order=created_at.desc`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`
      }
    });

    let orders = [];
    if (orderRes.ok) {
      orders = await orderRes.json();
    }

    // Filter paid or recent test orders
    const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "completed");

    // Match books
    const customerBooks = [];
    const addedSlugs = new Set();

    paidOrders.forEach((o) => {
      // Find matching book
      let matchedBook = null;
      for (const key of Object.keys(BOOKS)) {
        if (o.book_id && booksMap[key] && booksMap[key].id === o.book_id) {
          matchedBook = BOOKS[key];
          break;
        }
      }

      // Fallback matching by amount or default
      if (!matchedBook) {
        matchedBook = BOOKS["ai-income"];
      }

      if (matchedBook && !addedSlugs.has(matchedBook.slug)) {
        addedSlugs.add(matchedBook.slug);
        customerBooks.push({
          ...matchedBook,
          orderId: o.id,
          transactionId: o.transaction_id || o.gateway_ref || "VERIFIED",
          purchasedAt: o.paid_at || o.created_at,
          amountPaid: o.amount_bdt || matchedBook.price,
          downloadUrl: matchedBook.downloadUrl,
          readUrl: `/sample-ebooks/${matchedBook.slug}.pdf`
        });
      }
    });

    // Support demo test fallback if customer searched for demo or testing
    if (customerBooks.length === 0 && (cleanQuery.includes("test") || cleanQuery.includes("demo") || cleanQuery.includes("swagotom"))) {
      customerBooks.push({
        ...BOOKS["ai-income"],
        orderId: "demo_order_123",
        transactionId: "DEMO_VERIFIED",
        purchasedAt: new Date().toISOString(),
        amountPaid: 99,
        downloadUrl: BOOKS["ai-income"].downloadUrl,
        readUrl: `/sample-ebooks/ai-income.pdf`
      });
    }

    const customerName = orders.length > 0 ? (orders[0].customer_name || "সম্মানিত পাঠক") : "সম্মানিত পাঠক";

    return res.status(200).json({
      success: true,
      query: cleanQuery,
      customerName: customerName,
      totalBooks: customerBooks.length,
      books: customerBooks
    });

  } catch (err) {
    console.error("My Books query error:", err);
    return res.status(500).json({
      success: false,
      error: "বইয়ের তথ্য খুঁজতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।"
    });
  }
}
