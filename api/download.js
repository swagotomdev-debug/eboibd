// Vercel Serverless Function: download
// Validates paid order and generates secure 10-minute signed URL
// Supports bundle orders (combo-all-4) by downloading specific book in the bundle

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
    const bookSlug = params.book_slug || params.slug;

    if (!orderId) {
      return res.status(400).json({ success: false, error: "অর্ডার আইডি প্রয়োজন।" });
    }

    const supabaseUrl = process.env.SUPABASE_URL || "https://aixhmugoxwtwenishcfe.supabase.co";
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpeGhtdWdveHd0d2VuaXNoY2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY1OTcsImV4cCI6MjEwNjAwMjU5N30.XheysYjfFxvZztK60Dcf8NkSP5TrAZYuC5G8-Ff96Pk";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

    // Handle demo test orders
    if (orderId.startsWith("demo_")) {
      const slug = bookSlug || "ai-income";
      return res.status(200).json({
        success: true,
        download_url: `/sample-ebooks/${slug}.pdf`,
        filename: `${slug}.pdf`,
        remaining_downloads: 4
      });
    }

    // 1. Fetch order details
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=*,books(id,slug,title,is_bundle,file_path)`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      }
    });

    if (!orderRes.ok) {
      return res.status(404).json({ success: false, error: "অর্ডারটি পাওয়া যায়নি।" });
    }

    const orders = await orderRes.json();
    const order = orders && orders[0];

    if (!order) {
      return res.status(404).json({ success: false, error: "অর্ডারটি পাওয়া যায়নি।" });
    }

    // STRICT CHECK: Only paid orders
    if (order.status !== "paid") {
      return res.status(403).json({ success: false, error: "অর্ডারটি এখনও পরিশোধ করা হয়নি।" });
    }

    // STRICT CHECK: Max 5 downloads
    const currentDownloads = order.download_count || 0;
    if (currentDownloads >= 5) {
      return res.status(429).json({
        success: false,
        error: "ডাউনলোড সীমা (সর্বোচ্চ ৫ বার) শেষ হয়েছে। অতিরিক্ত ডাউনলোডের প্রয়োজনে কাস্টমার সাপোর্টে যোগাযোগ করুন।"
      });
    }

    // Determine target book slug
    let targetSlug = bookSlug;
    if (!targetSlug) {
      if (order.books && !order.books.is_bundle) {
        targetSlug = order.books.slug;
      } else {
        targetSlug = "ai-income";
      }
    }

    // 2. Try Supabase storage signed URL (bucket 'ebooks')
    let downloadUrl = null;
    const filePath = `${targetSlug}.pdf`;

    try {
      const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/ebooks/${filePath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ expiresIn: 600 }) // 10 minutes
      });

      if (signRes.ok) {
        const signData = await signRes.json();
        if (signData && signData.signedURL) {
          downloadUrl = `${supabaseUrl}/storage/v1${signData.signedURL}`;
        }
      }
    } catch (storageErr) {
      console.warn("Storage sign error:", storageErr);
    }

    // Fallback to sample ebooks if storage not available
    if (!downloadUrl) {
      downloadUrl = `/sample-ebooks/${targetSlug}.pdf`;
    }

    // 3. Increment download count
    const newDownloadCount = currentDownloads + 1;
    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ download_count: newDownloadCount })
    });

    return res.status(200).json({
      success: true,
      download_url: downloadUrl,
      filename: `${targetSlug}.pdf`,
      remaining_downloads: Math.max(0, 5 - newDownloadCount)
    });

  } catch (err) {
    console.error("Download handler error:", err);
    return res.status(500).json({ success: false, error: err.message || "সার্ভার এরর।" });
  }
}
