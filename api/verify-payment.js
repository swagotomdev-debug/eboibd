// Vercel Serverless Function: verify-payment
// Verifies transaction with ZiniPay and marks order paid in Supabase

const BUNDLE_BOOKS = [
  { slug: "ai-income", title: "AI দিয়ে ঘরে বসে আয়", mockupUrl: "/assets/images/ai-income-mockup.webp", downloadUrl: "/sample-ebooks/ai-income.pdf" },
  { slug: "freelancer-payment", title: "ফ্রিল্যান্সারের টাকা দেশে আনার পুরো গাইড ২০২৬", mockupUrl: "/assets/images/freelancer-payment-mockup.webp", downloadUrl: "/sample-ebooks/freelancer-payment.pdf" },
  { slug: "facebook-business", title: "ফেসবুক পেজ থেকে ব্যবসা", mockupUrl: "/assets/images/facebook-business-mockup.webp", downloadUrl: "/sample-ebooks/facebook-business.pdf" },
  { slug: "ai-video-editing", title: "AI দিয়ে ভিডিও এডিটিং", mockupUrl: "/assets/images/ai-video-editing-mockup.webp", downloadUrl: "/sample-ebooks/ai-video-editing.pdf" }
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, apikey, authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const params = req.method === "POST" ? req.body : req.query;
    const orderId = params.order_id || req.query.order;
    const invoiceId = params.invoice_id || req.query.invoice;

    const supabaseUrl = process.env.SUPABASE_URL || "https://aixhmugoxwtwenishcfe.supabase.co";
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpeGhtdWdveHd0d2VuaXNoY2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY1OTcsImV4cCI6MjEwNjAwMjU5N30.XheysYjfFxvZztK60Dcf8NkSP5TrAZYuC5G8-Ff96Pk";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
    const zinipayApiKey = process.env.ZINIPAY_API_KEY || "fcdf700f3ac1fbd7ff6718b13cbe20d4373dea8c6a20f064";

    if (!orderId && !invoiceId) {
      return res.status(400).json({ success: false, error: "Missing order_id or invoice_id" });
    }

    // Find order
    let order = null;
    let queryField = orderId ? `id=eq.${orderId}` : `gateway_ref=eq.${invoiceId}`;
    try {
      const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?${queryField}&select=*,books(id,slug,title,is_bundle)`, {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        }
      });
      if (orderRes.ok) {
        const list = await orderRes.json();
        if (list && list[0]) order = list[0];
      }
    } catch (_) {}

    // Fallback simple query if join failed
    if (!order) {
      try {
        const simpleRes = await fetch(`${supabaseUrl}/rest/v1/orders?${queryField}&select=*`, {
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
          }
        });
        if (simpleRes.ok) {
          const list = await simpleRes.json();
          if (list && list[0]) order = list[0];
        }
      } catch (_) {}
    }

    // Verify with ZiniPay server-to-server
    if (zinipayApiKey && (invoiceId || (order && order.gateway_ref))) {
      const targetInvoice = invoiceId || order.gateway_ref;
      const verifyRes = await fetch("https://api.zinipay.com/v1/payment/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "zini-api-key": zinipayApiKey
        },
        body: JSON.stringify({ invoice_id: targetInvoice })
      });

      const ziniData = await verifyRes.json();
      if (verifyRes.ok && ziniData.status === "COMPLETED") {
        // Mark paid in Supabase
        if (order) {
          await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              status: "paid",
              transaction_id: ziniData.transaction_id || targetInvoice,
              paid_at: new Date().toISOString()
            })
          });
          order.status = "paid";
          order.transaction_id = ziniData.transaction_id || targetInvoice;
        }
      }
    } else if (order) {
      // Dev mode: auto mark paid
      await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          status: "paid",
          paid_at: new Date().toISOString()
        })
      });
      order.status = "paid";
    }

    const isBundle = (order && order.books && order.books.is_bundle) ||
      (order && (order.book_slug === "combo-all-4" || (order.amount_bdt && Number(order.amount_bdt) === 149)));

    const responseOrder = {
      ...(order || { id: orderId, status: "paid", amount_bdt: 149 }),
      is_bundle: isBundle,
      bundle_books: isBundle ? BUNDLE_BOOKS : null,
      book_title: (order && order.books && order.books.title) || (isBundle ? "৪টা বইয়ের কম্বো বান্ডেল" : "ডিজিটাল ইবুক"),
      book_slug: (order && order.books && order.books.slug) || (isBundle ? "combo-all-4" : "ai-income")
    };

    return res.status(200).json({
      success: true,
      order: responseOrder
    });

  } catch (error) {
    console.error("Verify error:", error);
    return res.status(500).json({ success: false, error: "ভেরিফিকেশন ব্যর্থ হয়েছে।" });
  }
}
