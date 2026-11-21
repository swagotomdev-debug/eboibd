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
    const { order_id, name, rating, comment } = await req.json();

    if (!order_id || !comment) {
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডার আইডি ও মন্তব্য আবশ্যক।" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return new Response(
        JSON.stringify({ success: false, error: "রেটিং ১ থেকে ৫ এর মধ্যে হতে হবে।" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch and verify order: must exist and be 'paid'
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, book_id, customer_name")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডারটি পাওয়া যায়নি।" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STRICT CHECK: Only paid orders can submit reviews
    if (order.status !== "paid") {
      return new Response(
        JSON.stringify({ success: false, error: "শুধুমাত্র সফলভাবে ক্রয়কৃত অর্ডারের রিভিউ দেওয়া সম্ভব।" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. STRICT CHECK: One review per order (unique order_id constraint)
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();

    if (existingReview) {
      return new Response(
        JSON.stringify({ success: false, error: "এই অর্ডারের জন্য ইতিমধ্যে একটি রিভিউ জমা দেওয়া হয়েছে।" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Save review as NOT APPROVED (approved = false, waiting for admin approval)
    const reviewerName = (name || order.customer_name || "সম্মানিত পাঠক").trim();
    const { error: insertError } = await supabase
      .from("reviews")
      .insert({
        order_id: order.id,
        book_id: order.book_id,
        name: reviewerName,
        rating: numRating,
        comment: comment.trim(),
        approved: false, // Hidden until admin explicitly approves
      });

    if (insertError) {
      console.error("Review insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "রিভিউ সেভ করতে সমস্যা হয়েছে।" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "আপনার রিভিউ সফলভাবে জমা দেওয়া হয়েছে। অ্যাডমিন পর্যালোচনার পর এটি ওয়েবসাইটে প্রদর্শিত হবে।"
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Submit review error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "সার্ভার এরর।" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
