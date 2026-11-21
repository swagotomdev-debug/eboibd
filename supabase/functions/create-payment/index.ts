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

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { slug, customer_name, email, phone } = await req.json();

    if (!slug || !customer_name || !email || !phone) {
      return new Response(
        JSON.stringify({ success: false, error: "সকল তথ্য সঠিকভাবে পূরণ করুন।" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Admin Client (Service Role key stays strictly on backend)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch book details and price FROM DATABASE (NEVER trust browser price!)
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id, title, price_bdt, is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (bookError || !book) {
      return new Response(
        JSON.stringify({ success: false, error: "বইটি খুঁজে পাওয়া যায়নি বা সক্রিয় নেই।" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create pending order in database
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        book_id: book.id,
        customer_name: customer_name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        amount_bdt: book.price_bdt,
        status: "pending",
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Order creation failed:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডার তৈরি করা সম্ভব হয়নি।" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Call ZiniPay Create Payment API
    const zinipayApiKey = Deno.env.get("ZINIPAY_API_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "https://eboibd.site";
    const webhookUrl = `${supabaseUrl}/functions/v1/verify-payment?order=${order.id}`;

    if (!zinipayApiKey) {
      console.warn("Missing ZINIPAY_API_KEY secret. Returning fallback for development.");
      const demoInvoiceId = "INV_DEMO_" + Date.now();
      await supabase.from("orders").update({ gateway_ref: demoInvoiceId }).eq("id", order.id);
      return new Response(
        JSON.stringify({
          success: true,
          payment_url: `${siteUrl}/success.html?order=${order.id}`,
          order_id: order.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Exact payload as required by ZiniPay Invoice API
    const payload = {
      amount: Number(book.price_bdt),
      redirect_url: `${siteUrl}/success.html?order=${order.id}`,
      cancel_url: `${siteUrl}/failed.html?order=${order.id}`,
      webhook_url: webhookUrl,
      cus_name: customer_name.trim(),
      cus_email: email.trim().toLowerCase(),
      metadata: {
        order_id: order.id,
        phone: phone.trim(),
      },
    };

    const ziniRes = await fetch("https://api.zinipay.com/v1/payment/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "zini-api-key": zinipayApiKey,
      },
      body: JSON.stringify(payload),
    });

    const ziniData = await ziniRes.json();

    if (!ziniRes.ok || !ziniData.status || !ziniData.payment_url) {
      console.error("ZiniPay API Error:", ziniData);
      return new Response(
        JSON.stringify({
          success: false,
          error: ziniData.message || "পেমেন্ট গেটওয়েতে সংযোগ করতে সমস্যা হয়েছে।"
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract invoice id: invoice_id field if present, otherwise last part of payment_url
    let invoiceId = ziniData.invoice_id;
    if (!invoiceId && ziniData.payment_url) {
      const match = ziniData.payment_url.match(/\/([^\/?#]+)$/);
      invoiceId = match ? match[1] : null;
    }

    // Save invoice id in orders.gateway_ref
    await supabase
      .from("orders")
      .update({ gateway_ref: invoiceId || "ZINI_" + order.id })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: ziniData.payment_url,
        order_id: order.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Unexpected error in create-payment:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "সার্ভার এরর।" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
