/**
 * eboibd.site - Real Verified Reviews Fetcher & Renderer
 * Requirement:
 * - Only real approved reviews from database.
 * - Each review shows "✔ যাচাইকৃত ক্রেতা".
 * - If no approved reviews yet, show friendly empty state.
 * - Never add sample or placeholder reviews.
 */

document.addEventListener("DOMContentLoaded", () => {
  loadRealReviews();
});

async function loadRealReviews() {
  const container = document.getElementById("reviews-container");
  if (!container) return;

  const bookSlug = container.getAttribute("data-book-slug"); // empty on home page = all books

  try {
    const config = window.EBOI_CONFIG;
    if (!config || !config.supabaseUrl || config.supabaseUrl.includes("your-project")) {
      renderEmptyState(container, bookSlug);
      return;
    }

    let url = `${config.supabaseUrl}/rest/v1/approved_reviews?select=*&order=created_at.desc`;
    if (bookSlug) {
      url += `&book_slug=eq.${encodeURIComponent(bookSlug)}`;
    }

    const res = await fetch(url, {
      headers: {
        "apikey": config.supabaseAnonKey,
        "Authorization": `Bearer ${config.supabaseAnonKey}`
      }
    });

    if (!res.ok) {
      throw new Error(`Reviews fetch error: ${res.status}`);
    }

    const reviews = await res.json();

    if (!Array.isArray(reviews) || reviews.length === 0) {
      renderEmptyState(container, bookSlug);
    } else {
      renderReviewsList(container, reviews);
    }
  } catch (err) {
    console.warn("Reviews could not be loaded from database:", err);
    renderEmptyState(container, bookSlug);
  }
}

function renderEmptyState(container, bookSlug) {
  container.innerHTML = `
    <div class="reviews-empty-state reveal is-revealed">
      <span class="empty-state-icon">💬</span>
      <h3>এখনও কোনো রিভিউ জমা পড়েনি</h3>
      <p>বইটি কিনে আপনিই প্রথম বাস্তব অভিজ্ঞতা ও মতামত শেয়ার করতে পারেন। পেমেন্ট সফল হলে রিভিউ দেওয়ার লিঙ্ক পাওয়া যাবে।</p>
    </div>
  `;
}

function renderReviewsList(container, reviews) {
  const starsHtml = (rating) => {
    let out = "";
    for (let i = 1; i <= 5; i++) {
      out += i <= rating ? "★" : "☆";
    }
    return out;
  };

  const cardsHtml = reviews.map((r) => {
    const safeName = escapeHtml(r.name || "সম্মানিত পাঠক");
    const safeComment = escapeHtml(r.comment || "");
    const bookTitle = r.book_title ? escapeHtml(r.book_title) : "";

    return `
      <div class="review-card reveal is-revealed">
        <div class="review-header">
          <span class="review-buyer-name">${safeName}</span>
          <span class="verified-badge">✔ যাচাইকৃত ক্রেতা</span>
        </div>
        <div class="review-stars" aria-label="${toBanglaNumber(r.rating || 5)} স্টার">
          ${starsHtml(r.rating || 5)}
        </div>
        <p class="review-comment">"${safeComment}"</p>
        ${bookTitle ? `<div class="review-book-tag">বই: ${bookTitle}</div>` : ""}
      </div>
    `;
  }).join("");

  container.innerHTML = `<div class="reviews-grid">${cardsHtml}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
