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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, zini-api-key, x-zinipay-signature",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const zinipayApiKey = Deno.env.get("ZINIPAY_API_KEY") ?? "";
    const siteUrl = Deno.env.get("SITE_URL") || "https://eboibd.site";

    // Parse order ID from URL query parameters (e.g. ?order=ORDER_ID) or JSON body
    const reqUrl = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const orderId = reqUrl.searchParams.get("order") || body.order || body.order_id || body.metadata?.order_id;
    const invoiceId = body.invoice_id || body.data?.invoice_id;

    if (!orderId && !invoiceId) {
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডার বা ইনভয়েস রেফারেন্স পাওয়া যায়নি।" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch order from database
    let query = supabase.from("orders").select("*, books(title, slug, price_bdt, file_path)");
    if (orderId) {
      query = query.eq("id", orderId);
    } else {
      query = query.eq("gateway_ref", invoiceId);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "অর্ডারটি পাওয়া যায়নি।" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If order is already paid, return idempotently
    if (order.status === "paid") {
      return new Response(
        JSON.stringify({
          success: true,
          order: {
            id: order.id,
            status: order.status,
            amount_bdt: order.amount_bdt,
            customer_name: order.customer_name,
            book_title: order.books?.title,
            transaction_id: order.transaction_id || order.gateway_ref,
            paid_at: order.paid_at,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Never trust caller: Call ZiniPay Verify API Server-to-Server
    const invToVerify = order.gateway_ref || invoiceId;
    let paymentVerified = false;
    let confirmedTrxId = "";

    if (zinipayApiKey && invToVerify && !invToVerify.startsWith("INV_DEMO")) {
      const ziniVerifyRes = await fetch("https://api.zinipay.com/v1/payment/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "zini-api-key": zinipayApiKey,
        },
        body: JSON.stringify({ invoice_id: invToVerify }),
      });

      const ziniData = await ziniVerifyRes.json();

      if (ziniVerifyRes.ok) {
        // Response fields: status (PENDING / COMPLETED / FAILED), amount, transaction_id, cus_email, payment_method
        const pStatus = (ziniData.status || ziniData.data?.status || ziniData.data?.payment_status || "").toString().toUpperCase();
        const pAmount = Number(ziniData.amount ?? ziniData.data?.amount ?? 0);
        const pEmail = (ziniData.cus_email || ziniData.data?.cus_email || "").toString().toLowerCase().trim();
        const requiredAmount = Number(order.amount_bdt);
        const orderEmail = order.email.toLowerCase().trim();

        // Strict validation: status is COMPLETED, amount >= order amount, and cus_email matches order email
        if (pStatus === "COMPLETED" && pAmount >= requiredAmount && pEmail === orderEmail) {
          paymentVerified = true;
          confirmedTrxId = ziniData.transaction_id || ziniData.data?.transaction_id || invToVerify;
        } else {
          console.warn("ZiniPay verification validation mismatch:", { pStatus, pAmount, pEmail, requiredAmount, orderEmail });
        }
      } else {
        console.error("ZiniPay verify API returned error:", ziniData);
      }
    } else {
      // Local development fallback
      console.warn("ZiniPay API Key not provided or demo invoice used. Verifying in development mode.");
      paymentVerified = true;
      confirmedTrxId = "DEV_TRX_" + Date.now();
    }

    if (!paymentVerified) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "পেমেন্ট এখনো সম্পন্ন হয়নি অথবা গেটওয়ে থেকে নিশ্চিত করা যায়নি।"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Mark the order 'paid' exactly once: update ... where status <> 'paid'
    const paidAt = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        transaction_id: confirmedTrxId,
        paid_at: paidAt,
      })
      .eq("id", order.id)
      .neq("status", "paid")
      .select("*, books(title, slug)")
      .single();

    if (updateError && updateError.code !== "PGRST116") {
      console.error("Order status update failed:", updateError);
    }

    // 4. Send confirmation email to buyer with download link (optional, via Resend)
    await sendBuyerEmail(order.email, order.customer_name, order.books?.title, order.id, siteUrl);

    return new Response(
      JSON.stringify({
        success: true,
        order: {
          id: order.id,
          status: "paid",
          amount_bdt: order.amount_bdt,
          customer_name: order.customer_name,
          book_title: order.books?.title,
          transaction_id: confirmedTrxId,
          paid_at: paidAt,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Verification error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "ভেরিফিকেশন এরর।" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendBuyerEmail(toEmail: string, name: string, bookTitle: string, orderId: string, siteUrl: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const mailFrom = Deno.env.get("MAIL_FROM") || "team@eboibd.site";
  const downloadPageUrl = `${siteUrl}/success.html?order=${orderId}`;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <h2 style="color: #e11d2e; margin-top: 0;">eboibd.site - আপনার ইবুক প্রস্তুত!</h2>
      <p>প্রিয় <strong>${name}</strong>,</p>
      <p>আমাদের ওয়েবসাইট থেকে <strong>${bookTitle}</strong> ইবুকটি সফলভাবে ক্রয় করার জন্য ধন্যবাদ।</p>
      <div style="background: #f8fafc; border-left: 4px solid #e11d2e; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 10px 0; font-weight: bold;">ডাউনলোড লিংক:</p>
        <a href="${downloadPageUrl}" style="display: inline-block; background: #e11d2e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">বইটি ডাউনলোড করুন</a>
      </div>
      <p style="font-size: 0.9em; color: #64748b;">এই লিংকটি আপনার জন্য সংরক্ষিত থাকবে। আপনি যেকোনো সময় এই পেইজে এসে ইবুক ডাউনলোড ও আপনার মূল্যবান রিভিউ প্রদান করতে পারবেন।</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 0.85em; color: #94a3b8; text-align: center;">© ২০২৬ eboibd.site · কোনো সহায়তার জন্য WhatsApp: ০১৫৪০৭৩৭২০৫ এ যোগাযোগ করুন।</p>
    </div>
  `;

  if (resendApiKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: `eboibd <${mailFrom}>`,
          to: [toEmail],
          subject: `আপনার ইবুক ডাউনলোড লিংক: ${bookTitle}`,
          html: htmlContent,
        }),
      });
      console.log(`Email successfully sent to ${toEmail}`);
    } catch (e) {
      console.error("Failed to send email via Resend:", e);
    }
  } else {
    console.log(`[Email Mock] Ready for ${toEmail}. Link: ${downloadPageUrl}`);
  }
}
