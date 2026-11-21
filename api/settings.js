// Vercel Serverless Function: settings
// Public GET for site offer countdown and banner text
// Admin POST for updating settings

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, apikey, authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || "https://aixhmugoxwtwenishcfe.supabase.co";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpeGhtdWdveHd0d2VuaXNoY2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY1OTcsImV4cCI6MjEwNjAwMjU5N30.XheysYjfFxvZztK60Dcf8NkSP5TrAZYuC5G8-Ff96Pk";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

  const defaultSettings = {
    combo_active: "true",
    banner_text: "৪টা বই একসাথে মেগা কম্বো মাত্র ৳১৪৯! সীমিত সময়ের বিশেষ অফার",
    offer_ends_at: ""
  };

  if (req.method === "GET") {
    try {
      const sRes = await fetch(`${supabaseUrl}/rest/v1/settings?select=key,value`, {
        headers: {
          "apikey": supabaseAnonKey,
          "Authorization": `Bearer ${supabaseAnonKey}`
        }
      });
      if (sRes.ok) {
        const rows = await sRes.json();
        const settings = { ...defaultSettings };
        if (Array.isArray(rows)) {
          rows.forEach((r) => { settings[r.key] = r.value; });
        }
        return res.status(200).json({ success: true, settings });
      }
    } catch (_) {}

    return res.status(200).json({ success: true, settings: defaultSettings });
  }

  if (req.method === "POST") {
    try {
      const updates = req.body || {};
      for (const [key, value] of Object.entries(updates)) {
        await fetch(`${supabaseUrl}/rest/v1/settings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify({ key, value: String(value), updated_at: new Date().toISOString() })
        });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: "Method Not Allowed" });
}
