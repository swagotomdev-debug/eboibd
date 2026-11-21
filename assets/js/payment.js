/**
 * eboibd.site - Payment Success & Failure Logic
 * Handles:
 * - Server verification via verify-payment Edge Function
 * - Secure PDF download via download Edge Function (10m signed URL, max 5 downloads)
 * - Review submission via submit-review Edge Function (only for paid orders)
 */

document.addEventListener("DOMContentLoaded", () => {
  const isSuccessPage = document.getElementById("payment-success-app");
  const isFailedPage = document.getElementById("payment-failed-app");

  if (isSuccessPage) initSuccessPage();
  if (isFailedPage) initFailedPage();
});

/**
 * Payment Success Page Handler
 */
async function initSuccessPage() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id") || params.get("order");
  const invoiceId = params.get("invoice_id") || params.get("invoice");

  const loadingEl = document.getElementById("verify-loading");
  const contentEl = document.getElementById("verify-content");
  const errorEl = document.getElementById("verify-error");

  const orderIdEl = document.getElementById("receipt-order-id");
  const bookTitleEl = document.getElementById("receipt-book-title");
  const amountEl = document.getElementById("receipt-amount");
  const trxEl = document.getElementById("receipt-trx");
  const downloadBtn = document.getElementById("btn-download-pdf");
  const downloadNotice = document.getElementById("download-notice");

  if (!orderId && !invoiceId) {
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.querySelector("p").textContent = "কোনো অর্ডারের তথ্য পাওয়া যায়নি।";
    }
    return;
  }

  // Handle local demo test orders
  if (orderId && orderId.startsWith("demo_")) {
    const slug = params.get("slug") || "ai-income";
    const book = (window.EBOI_CONFIG && window.EBOI_CONFIG.books[slug]) || {};
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "block";
    if (orderIdEl) orderIdEl.textContent = orderId.slice(0, 12);
    if (bookTitleEl) bookTitleEl.textContent = book.title || "ডিজিটাল ইবুক";
    if (amountEl) amountEl.textContent = `৳${toBanglaNumber(book.price || 299)}`;
    if (trxEl) trxEl.textContent = "DEMO_TEST_PAID";

    const bookMockupEl = document.getElementById("receipt-book-mockup");
    if (bookMockupEl) bookMockupEl.src = book.mockupUrl || `/assets/images/${slug}-mockup.webp`;

    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        downloadBtn.textContent = "ডাউনলোড শুরু হয়েছে...";
        // Download sample ebook
        const a = document.createElement("a");
        a.href = `/sample-ebooks/${slug}.pdf`;
        a.download = `${slug}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
    initReviewForm(orderId, params.get("name") || "সম্মানিত পাঠক");
    return;
  }

  try {
    const config = window.EBOI_CONFIG;
    let result = null;

    // 1. Try Vercel /api/verify-payment first
    try {
      const res = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, invoice_id: invoiceId })
      });
      if (res.ok) result = await res.json();
    } catch (_) {}

    // 2. Fallback to Supabase Edge Function
    if (!result || !result.success) {
      try {
        const res = await fetch(`${config.functionsUrl}/verify-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": config.supabaseAnonKey,
            "Authorization": `Bearer ${config.supabaseAnonKey}`
          },
          body: JSON.stringify({ order_id: orderId, invoice_id: invoiceId })
        });
        if (res.ok) result = await res.json();
      } catch (_) {}
    }

    if (!result || !result.success) {
      throw new Error((result && result.error) || "পেমেন্ট ভেরিফিকেশন ব্যর্থ হয়েছে।");
    }

    const order = result.order;

    const bookMockupEl = document.getElementById("receipt-book-mockup");
    if (order.book_slug && bookMockupEl) {
      bookMockupEl.src = `/assets/images/${order.book_slug}-mockup.webp`;
    }

    // Fill Receipt
    if (orderIdEl) orderIdEl.textContent = order.id ? order.id.slice(0, 8) + "..." : "N/A";
    if (bookTitleEl) bookTitleEl.textContent = order.book_title || "নির্বাচিত ইবুক";
    if (amountEl) amountEl.textContent = `৳${toBanglaNumber(order.amount_bdt)}`;
    if (trxEl) trxEl.textContent = order.transaction_id || order.gateway_ref || "VERIFIED";

    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "block";

    // Setup Download Button
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => handleDownload(order.id, downloadBtn, downloadNotice));
    }

    // Setup Review Form
    initReviewForm(order.id, order.customer_name);
  } catch (err) {
    console.error("Verification error:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl) {
      errorEl.style.display = "block";
      const p = errorEl.querySelector(".error-text");
      if (p) p.textContent = err.message || "পেমেন্ট ভেরিফাই করতে সমস্যা হয়েছে। আমাদের সাথে যোগাযোগ করুন।";
    }
  }
}

/**
 * Handle Download: calls Edge Function to get signed URL
 */
async function handleDownload(orderId, btn, noticeEl) {
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = `<span class="animate-spin">⏳</span> ডাউনলোড লিংক প্রস্তুত হচ্ছে...`;

  try {
    const config = window.EBOI_CONFIG;
    const res = await fetch(`${config.functionsUrl}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.supabaseAnonKey,
        "Authorization": `Bearer ${config.supabaseAnonKey}`
      },
      body: JSON.stringify({ order_id: orderId })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "ডাউনলোড লিংক তৈরি করা যায়নি।");
    }

    // Trigger download
    const link = document.createElement("a");
    link.href = data.download_url;
    link.download = data.filename || "ebook.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    btn.disabled = false;
    btn.innerHTML = `📥 পুনরায় ডাউনলোড করুন`;

    if (noticeEl) {
      noticeEl.innerHTML = `
        <span style="color:#059669; font-weight:600;">✓ ডাউনলোড শুরু হয়েছে!</span> 
        (লিংকটি ১০ মিনিট কার্যকর থাকবে। অবশিষ্ট ডাউনলোড: ${toBanglaNumber(data.remaining_downloads)} বার)
      `;
    }
  } catch (err) {
    console.error("Download error:", err);
    alert(err.message || "ডাউনলোড করার সময় সমস্যা হয়েছে। অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।");
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

/**
 * Setup Buyer Review Form
 */
function initReviewForm(orderId, defaultName) {
  const form = document.getElementById("review-form");
  const nameInput = document.getElementById("review_name");
  const ratingInput = document.getElementById("review_rating");
  const commentInput = document.getElementById("review_comment");
  const starBtns = document.querySelectorAll(".star-btn");
  const submitBtn = document.getElementById("submit-review-btn");
  const successNotice = document.getElementById("review-success-msg");

  if (!form) return;

  if (nameInput && defaultName) {
    nameInput.value = defaultName;
  }

  // Star Rating Selection
  starBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.getAttribute("data-val"), 10);
      ratingInput.value = val;
      updateStarDisplay(val);
    });
  });

  function updateStarDisplay(val) {
    starBtns.forEach((btn) => {
      const bVal = parseInt(btn.getAttribute("data-val"), 10);
      btn.style.color = bVal <= val ? "#f59e0b" : "#cbd5e1";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const comment = commentInput.value.trim();
    const name = nameInput.value.trim();
    const rating = parseInt(ratingInput.value, 10) || 5;

    if (!comment) {
      alert("অনুগ্রহ করে আপনার মূল্যবান মন্তব্য লিখুন।");
      commentInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="animate-spin">⏳</span> জমা দেওয়া হচ্ছে...`;

    try {
      const config = window.EBOI_CONFIG;
      const res = await fetch(`${config.functionsUrl}/submit-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabaseAnonKey,
          "Authorization": `Bearer ${config.supabaseAnonKey}`
        },
        body: JSON.stringify({
          order_id: orderId,
          name: name,
          rating: rating,
          comment: comment
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "রিভিউ জমা দিতে সমস্যা হয়েছে।");
      }

      form.style.display = "none";
      if (successNotice) {
        successNotice.style.display = "block";
      }
    } catch (err) {
      console.error("Review submission error:", err);
      alert(err.message || "রিভিউ জমা দিতে সমস্যা হয়েছে।");
      submitBtn.disabled = false;
      submitBtn.innerHTML = `রিভিউ জমা দিন`;
    }
  });
}

/**
 * Payment Failed Page Handler
 */
function initFailedPage() {
  const params = new URLSearchParams(window.location.search);
  const bookSlug = params.get("book") || "ai-income";
  const retryBtn = document.getElementById("retry-checkout-btn");

  if (retryBtn) {
    retryBtn.href = `/checkout?book=${encodeURIComponent(bookSlug)}`;
  }
}
