// Vercel Serverless Function: create-payment
// Connects checkout form directly to ZiniPay Payment Gateway & Supabase

const BOOKS = {
  "ai-income": { price: 299, title: "AI দিয়ে ঘরে বসে আয়: ৩০ দিনে প্রথম ইনকাম" },
  "freelancer-payment": { price: 249, title: "ফ্রিল্যান্সারের টাকা দেশে আনার পুরো গাইড ২০২৬" },
  "facebook-business": { price: 349, title: "ফেসবুক পেজ থেকে ব্যবসা: শূন্য থেকে প্রথম ১০০ অর্ডার" },
  "ai-video-editing": { price: 299, title: "AI দিয়ে ভিডিও এডিটিং: প্রম্পট ও স্কিল" },
  "combo-all-4": { price: 149, title: "৪টা বইয়ের কম্বো বান্ডেল", is_bundle: true }
};

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, apikey, authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const { slug, customer_name, email, phone } = req.body || {};

    if (!slug || !customer_name || !email || !phone) {
      return res.status(400).json({ success: false, error: "সকল তথ্য সঠিকভাবে পূরণ করুন।" });
    }

    const fallbackBook = BOOKS[slug] || BOOKS["combo-all-4"];
    const supabaseUrl = process.env.SUPABASE_URL || "https://aixhmugoxwtwenishcfe.supabase.co";
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpeGhtdWdveHd0d2VuaXNoY2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY1OTcsImV4cCI6MjEwNjAwMjU5N30.XheysYjfFxvZztK60Dcf8NkSP5TrAZYuC5G8-Ff96Pk";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
    const zinipayApiKey = process.env.ZINIPAY_API_KEY || "fcdf700f3ac1fbd7ff6718b13cbe20d4373dea8c6a20f064";
    const siteUrl = process.env.SITE_URL || "https://eboibd.site";

    // 1. Read real price and book_id directly from Supabase database
    let bookId = null;
    let chargedPrice = fallbackBook.price;
    let bookTitle = fallbackBook.title;

    try {
      const bookRes = await fetch(`${supabaseUrl}/rest/v1/books?slug=eq.${slug}&select=id,title,price_bdt,sale_price_bdt,sale_ends_at,is_bundle`, {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        }
      });
      if (bookRes.ok) {
        const booksData = await bookRes.json();
        if (booksData && booksData[0]) {
          const dbBook = booksData[0];
          bookId = dbBook.id;
          bookTitle = dbBook.title || fallbackBook.title;
          
          // Check for active sale price
          if (dbBook.sale_price_bdt && (!dbBook.sale_ends_at || new Date(dbBook.sale_ends_at) > new Date())) {
            chargedPrice = Number(dbBook.sale_price_bdt);
          } else if (dbBook.price_bdt) {
            chargedPrice = Number(dbBook.price_bdt);
          }
        }
      }
    } catch (e) {
      console.warn("Could not query books table:", e);
    }

    // 2. Insert pending order in Supabase
    const orderPayload = {
      customer_name: customer_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      amount_bdt: chargedPrice,
      status: "pending",
      source: "online"
    };
    if (bookId) orderPayload.book_id = bookId;

    let orderId = "ord_" + Date.now();
    try {
      const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Prefer": "return=representation"
        },
        body: JSON.stringify(orderPayload)
      });
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        if (orderData && orderData[0]) {
          orderId = orderData[0].id;
        }
      }
    } catch (e) {
      console.warn("Order insert in Supabase warning:", e);
    }

    // 3. Call ZiniPay Payment Creation API
    if (zinipayApiKey) {
      const ziniPayload = {
        amount: Number(chargedPrice),
        redirect_url: `${siteUrl}/success.html?order=${orderId}`,
        cancel_url: `${siteUrl}/failed.html?order=${orderId}`,
        webhook_url: `${siteUrl}/api/verify-payment?order=${orderId}`,
        cus_name: customer_name.trim(),
        cus_email: email.trim().toLowerCase(),
        metadata: {
          order_id: orderId,
          phone: phone.trim(),
          slug: slug,
          book_title: bookTitle
        }
      };

      const ziniRes = await fetch("https://api.zinipay.com/v1/payment/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "zini-api-key": zinipayApiKey
        },
        body: JSON.stringify(ziniPayload)
      });

      const ziniData = await ziniRes.json();

      if (ziniRes.ok && ziniData.status && ziniData.payment_url) {
        // Save gateway_ref in Supabase
        const invoiceId = ziniData.invoice_id || (ziniData.payment_url.match(/\/([^\/?#]+)$/) || [])[1];
        if (invoiceId) {
          try {
            await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "apikey": supabaseServiceKey,
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ gateway_ref: invoiceId })
            });
          } catch (_) {}
        }

        return res.status(200).json({
          success: true,
          payment_url: ziniData.payment_url,
          order_id: orderId
        });
      } else {
        console.error("ZiniPay error response:", ziniData);
        return res.status(502).json({
          success: false,
          error: ziniData.message || "পেমেন্ট গেটওয়েতে সংযোগ করতে সমস্যা হয়েছে।"
        });
      }
    }

    // Fallback: If ZINIPAY_API_KEY is not yet entered
    return res.status(200).json({
      success: true,
      payment_url: `${siteUrl}/success.html?order=${orderId}`,
      order_id: orderId
    });

  } catch (error) {
    console.error("Payment error:", error);
    return res.status(500).json({
      success: false,
      error: "পেমেন্ট প্রসেস করতে সাময়িক সমস্যা হয়েছে। আবার চেষ্টা করুন।"
    });
  }
}
