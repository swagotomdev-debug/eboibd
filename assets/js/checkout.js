/**
 * eboibd.site - Checkout Processing
 * - Validates input (strict Bangladeshi phone 01XXXXXXXXX)
 * - Submits order to create-payment Edge Function
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
  const summaryCover = document.getElementById("summary-cover");
  const summaryTitle = document.getElementById("summary-title");
  const summaryPages = document.getElementById("summary-pages");
  const summaryPrice = document.getElementById("summary-price");
  const submitBtnText = document.getElementById("submit-btn-price");

  if (summaryCover) summaryCover.src = book.coverUrl;
  if (summaryTitle) summaryTitle.textContent = book.title;
  if (summaryPages) summaryPages.textContent = `${toBanglaNumber(book.pages)} পেজ PDF`;
  if (summaryPrice) summaryPrice.textContent = `৳${toBanglaNumber(book.price)}`;
  if (submitBtnText) submitBtnText.textContent = `৳${toBanglaNumber(book.price)}`;

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
      const config = window.EBOI_CONFIG;
      const response = await fetch(`${config.functionsUrl}/create-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabaseAnonKey,
          "Authorization": `Bearer ${config.supabaseAnonKey}`
        },
        body: JSON.stringify({
          slug: slug,
          customer_name: name,
          email: email,
          phone: cleanPhone
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "পেমেন্ট তৈরি করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
      }

      // Redirect to payment gateway URL
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error("পেমেন্ট গেটওয়ের লিংক পাওয়া যায়নি।");
      }
    } catch (err) {
      console.error("Payment creation error:", err);
      showAlert(err.message || "একটি অনাকাঙ্ক্ষিত ত্রুটি ঘটেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>নিরাপদে পেমেন্ট করুন · ৳${toBanglaNumber(book.price)}</span>`;
    }
  });

  function showAlert(msg) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.style.display = "block";
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.style.display = "none";
  }
}
