// Vercel Serverless Function: book-sales
// Returns real verified sales counts per book from Supabase

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || "https://aixhmugoxwtwenishcfe.supabase.co";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpeGhtdWdveHd0d2VuaXNoY2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY1OTcsImV4cCI6MjEwNjAwMjU5N30.XheysYjfFxvZztK60Dcf8NkSP5TrAZYuC5G8-Ff96Pk";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

  const counts = {
    "ai-income": 0,
    "freelancer-payment": 0,
    "facebook-business": 0,
    "ai-video-editing": 0,
    "combo-all-4": 0
  };

  try {
    // 1. Try calling the book_sales_counts() RPC
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/book_sales_counts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseAnonKey,
        "Authorization": `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({})
    });

    if (rpcRes.ok) {
      const data = await rpcRes.json();
      if (Array.isArray(data)) {
        data.forEach((row) => {
          if (row.slug) counts[row.slug] = Number(row.sold || 0);
        });
        return res.status(200).json({ success: true, counts });
      }
    }

    // 2. Fallback: Query orders directly if RPC not created yet
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?status=eq.paid&select=id,book_id,books(slug)`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`
      }
    });

    if (orderRes.ok) {
      const orders = await orderRes.json();
      let comboSales = 0;
      orders.forEach((o) => {
        const slug = o.books?.slug;
        if (slug === "combo-all-4") comboSales++;
        else if (counts[slug] !== undefined) counts[slug]++;
      });

      // Add combo sales to each of the 4 individual books
      counts["ai-income"] += comboSales;
      counts["freelancer-payment"] += comboSales;
      counts["facebook-business"] += comboSales;
      counts["ai-video-editing"] += comboSales;
      counts["combo-all-4"] = comboSales;
    }

    return res.status(200).json({ success: true, counts });
  } catch (err) {
    console.warn("Book sales query warning:", err);
    return res.status(200).json({ success: true, counts });
  }
}
