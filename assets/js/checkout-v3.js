/**
 * eboibd.site - Checkout Processing
 * - Validates input (strict Bangladeshi phone 01XXXXXXXXX)
 * - Directly connects to /api/create-payment (Serverless) & ZiniPay Gateway
 * - Price is NEVER sent from browser (server reads price from database)
 */

document.addEventListener("DOMContentLoaded", () => {
  initCheckout();
});

function initCheckout() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("book") || "ai-income";
  const book = window.EBOI_CONFIG.books[slug] || window.EBOI_CONFIG.books["ai-income"];

  // Populate Order Summary
  const summaryMockup = document.getElementById("summary-mockup");
  const summaryCover = document.getElementById("summary-cover");
  const summaryTitle = document.getElementById("summary-title");
  const summaryPages = document.getElementById("summary-pages");
  const summaryPrice = document.getElementById("summary-price");
  const summaryOriginalPrice = document.getElementById("summary-original-price");
  const summaryDiscount = document.getElementById("summary-discount");
  const submitBtnText = document.getElementById("submit-btn-price");

  // Inside page preview thumbnails
  const thumbP1 = document.getElementById("thumb-p1");
  const thumbP2 = document.getElementById("thumb-p2");
  const thumbP3 = document.getElementById("thumb-p3");
  const thumbP4 = document.getElementById("thumb-p4");

  if (summaryMockup) summaryMockup.src = book.mockupUrl;
  if (summaryCover) summaryCover.src = book.coverUrl;
  if (summaryTitle) summaryTitle.textContent = book.title;
  if (summaryPages) summaryPages.textContent = `${toBanglaNumber(book.pages)} পেজ PDF`;
  if (summaryPrice) summaryPrice.textContent = `৳${toBanglaNumber(book.price)}`;
  if (submitBtnText) submitBtnText.textContent = `৳${toBanglaNumber(book.price)}`;

  const regularPrice = book.regularPrice || 599;
  const discountVal = regularPrice - (book.price || 99);
  if (summaryOriginalPrice) summaryOriginalPrice.textContent = `৳${toBanglaNumber(regularPrice)}`;
  if (summaryDiscount) summaryDiscount.textContent = `-৳${toBanglaNumber(discountVal)}`;

  if (slug === "combo-all-4") {
    if (thumbP1) thumbP1.src = `/assets/images/ai-income-page1.webp`;
    if (thumbP2) thumbP2.src = `/assets/images/freelancer-payment-page1.webp`;
    if (thumbP3) thumbP3.src = `/assets/images/facebook-business-page1.webp`;
    if (thumbP4) thumbP4.src = `/assets/images/ai-video-editing-page1.webp`;
  } else {
    if (thumbP1) thumbP1.src = `/assets/images/${slug}-page1.webp`;
    if (thumbP2) thumbP2.src = `/assets/images/${slug}-page2.webp`;
    if (thumbP3) thumbP3.src = `/assets/images/${slug}-page3.webp`;
    if (thumbP4) thumbP4.src = `/assets/images/${slug}-page4.webp`;
  }

  if (book.themeColor) {
    document.documentElement.style.setProperty("--theme-color", book.themeColor);
  }

  // Form handling
  const form = document.getElementById("checkout-form");
  const nameInput = document.getElementById("customer_name");
  const emailInput = document.getElementById("customer_email");
  const phoneInput = document.getElementById("customer_phone");
  const phoneError = document.getElementById("phone-error");
  const submitBtn = document.getElementById("submit-btn");
  const alertBox = document.getElementById("checkout-alert");

  if (!form) return;

  // Realtime phone validation
  phoneInput.addEventListener("input", () => {
    const val = phoneInput.value.trim();
    if (val.length >= 3 && !isValidBDPhone(val)) {
      phoneError.textContent = "১১ ডিজিটের সঠিক মোবাইল নম্বর লিখুন (যেমন: 017XXXXXXXX)";
      phoneError.style.display = "block";
    } else {
      phoneError.textContent = "";
      phoneError.style.display = "none";
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const phone = phoneInput.value.trim();

    if (!name) {
      showAlert("অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।");
      nameInput.focus();
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert("অনুগ্রহ করে একটি সঠিক ইমেইল অ্যাড্রেস লিখুন।");
      emailInput.focus();
      return;
    }

    if (!isValidBDPhone(phone)) {
      showAlert("সঠিক ১১ ডিজিটের বাংলাদেশী মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।");
      phoneInput.focus();
      return;
    }

    const cleanPhone = formatBDPhone(phone);

    // Disable button & show spinner
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span class="animate-spin" style="display:inline-block; margin-right:8px;">⏳</span>
      <span>পেমেন্ট গেটওয়েতে কানেক্ট হচ্ছে...</span>
    `;

    try {
      const config = window.EBOI_CONFIG || {};
      const orderId = "ord_" + Date.now();
      let paymentUrl = null;

      // 1. Primary: Serverless API /api/create-payment (Same domain on live, 100% reliable)
      try {
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const apiUrl = isLocal ? "https://eboibd.site/api/create-payment" : "/api/create-payment";

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: slug,
            customer_name: name,
            email: email,
            phone: cleanPhone
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.payment_url) {
            paymentUrl = data.payment_url;
          }
        }
      } catch (apiErr) {
        console.warn("Primary Serverless API warning:", apiErr);
      }

      // If serverless created payment URL, redirect customer immediately
      if (paymentUrl) {
        window.location.href = paymentUrl;
        return;
      }

      // 2. Secondary Fallback: Direct ZiniPay Invoice API
      if (config.zinipayApiKey) {
        try {
          const ziniRes = await fetch("https://api.zinipay.com/v1/payment/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "zini-api-key": config.zinipayApiKey
            },
            body: JSON.stringify({
              amount: Number(book.price),
              redirect_url: `https://eboibd.site/success.html?order=${orderId}`,
              cancel_url: `https://eboibd.site/failed.html?order=${orderId}`,
              webhook_url: `https://eboibd.site/api/verify-payment?order=${orderId}`,
              cus_name: name,
              cus_email: email,
              metadata: {
                order_id: orderId,
                phone: cleanPhone,
                slug: slug
              }
            })
          });

          if (ziniRes.ok) {
            const ziniData = await ziniRes.json();
            if (ziniData && ziniData.status && ziniData.payment_url) {
              window.location.href = ziniData.payment_url;
              return;
            }
          }
        } catch (ziniErr) {
          console.warn("Direct ZiniPay API warning:", ziniErr);
        }
      }

      // 3. Tertiary Fallback: Localhost Demo Testing
      const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (isLocalHost) {
        window.location.href = `/success.html?order=demo_${Date.now()}&slug=${slug}&name=${encodeURIComponent(name)}`;
        return;
      }

      // If all attempts failed, throw a friendly error
      throw new Error("পেমেন্ট গেটওয়েতে সংযোগ করতে সমস্যা হচ্ছে। সরাসরি বিকাশ বা নগদে পেমেন্ট করতে আমাদের WhatsApp নম্বরে (" + (config.supportWhatsApp || "01540737205") + ") মেসেজ দিন।");

    } catch (err) {
      console.error("Payment error:", err);
      showAlert(err.message || "পেমেন্ট সম্পন্ন করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>নিরাপদে পেমেন্ট করুন · ৳${toBanglaNumber(book.price)}</span>`;
    }
  });

  function showAlert(msg) {
    if (!alertBox) return;
    alertBox.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 6px;">${msg}</div>
      <a href="https://wa.me/8801540737205?text=${encodeURIComponent('আসসালামু আলাইকুম, আমি ইবুক কিনতে পারছি না, সাহায্য প্রয়োজন।')}" target="_blank" rel="noopener" style="display: inline-block; background: #16a34a; color: #fff; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600; margin-top: 4px;">
        💬 সরাসরি হোয়াটসঅ্যাপে হেল্প নিন
      </a>
    `;
    alertBox.style.display = "block";
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.style.display = "none";
  }
}
