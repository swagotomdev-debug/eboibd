import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const siteUrl = Deno.env.get("SITE_URL") || "https://eboibd.site";
  const allowed = (origin === siteUrl || origin.includes("localhost") || origin.includes("127.0.0.1"))
    ? origin
    : siteUrl;

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id, book_slug } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডার আইডি প্রয়োজন।" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch order and verify it is paid
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, download_count, book_id, books(title, slug, file_path, is_bundle)")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডারটি পাওয়া যায়নি।" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STRICT CHECK: Only for paid orders!
    if (order.status !== "paid") {
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডারটি এখনও পরিশোধ করা হয়নি।" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STRICT CHECK: Max 5 downloads per order
    const currentDownloads = order.download_count || 0;
    if (currentDownloads >= 5) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "ডাউনলোড সীমা (সর্বোচ্চ ৫ বার) শেষ হয়েছে। অতিরিক্ত ডাউনলোডের প্রয়োজনে অনুগ্রহ করে কাস্টমার সাপোর্টে যোগাযোগ করুন।"
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine target book slug and file path
    const targetSlug = book_slug || order.books?.slug || "ai-income";
    const filePath = (book_slug ? `${book_slug}.pdf` : (order.books?.file_path || `ebooks/${targetSlug}.pdf`));
    const cleanPath = filePath.replace(/^ebooks\//, ""); // remove leading bucket prefix if present

    // 2. Generate Supabase signed URL valid for 10 minutes (600 seconds)
    const { data: signedData, error: signError } = await supabase.storage
      .from("ebooks")
      .createSignedUrl(cleanPath, 600, {
        download: `${targetSlug}.pdf`
      });

    if (signError || !signedData?.signedUrl) {
      console.error("Storage signed URL error:", signError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "ফাইল ডাউনলোড লিংক তৈরি করা যায়নি। অ্যাডমিন প্যানেলে ফাইলটি আপলোড আছে কিনা চেক করুন।"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Increment download_count
    const newDownloadCount = currentDownloads + 1;
    await supabase
      .from("orders")
      .update({ download_count: newDownloadCount })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        success: true,
        download_url: signedData.signedUrl,
        filename: `${order.books?.slug || "ebook"}.pdf`,
        remaining_downloads: Math.max(0, 5 - newDownloadCount),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Download function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "সার্ভার এরর।" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
