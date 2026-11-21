/**
 * eboibd.site - Real Verified Reviews Fetcher & Renderer
 * - Real approved reviews only from Supabase database
 * - Shows "✔ যাচাইকৃত ক্রেতা" for buyer reviews
 * - Shows "Facebook থেকে" / "WhatsApp থেকে" / etc. for admin-added verified reviews
 * - Zero sample / placeholder reviews
 * - Friendly empty state if no approved reviews
 */

document.addEventListener("DOMContentLoaded", () => {
  loadRealReviews();
});

async function loadRealReviews() {
  const container = document.getElementById("reviews-container");
  if (!container) return;

  const bookSlug = container.getAttribute("data-book-slug"); // empty = all books

  try {
    const config = window.EBOI_CONFIG;
    if (!config || !config.supabaseUrl || config.supabaseUrl.includes("your-project")) {
      renderEmptyState(container, bookSlug);
      return;
    }

    let url = `${config.supabaseUrl}/rest/v1/reviews?approved=eq.true&select=*,books(id,slug,title)&order=created_at.desc`;
    if (bookSlug && bookSlug !== "combo-all-4") {
      // Find book_id from config
      const bookObj = config.books && config.books[bookSlug];
      if (bookObj && bookObj.id) {
        url += `&book_id=eq.${bookObj.id}`;
      }
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

    let reviews = await res.json();

    if (bookSlug && bookSlug !== "combo-all-4" && Array.isArray(reviews)) {
      reviews = reviews.filter((r) => !r.books || r.books.slug === bookSlug);
    }

    if (!Array.isArray(reviews) || reviews.length === 0) {
      renderEmptyState(container, bookSlug);
    } else {
      renderReviewsList(container, reviews);
    }
  } catch (err) {
    console.warn("Reviews load notice:", err);
    renderEmptyState(container, bookSlug);
  }
}

function renderEmptyState(container, bookSlug) {
  container.innerHTML = `
    <div class="reviews-empty-state reveal is-revealed" style="text-align: center; padding: 48px 20px; background: #fff; border: 1px dashed var(--border-light); border-radius: 16px; margin: 20px 0;">
      <span class="empty-state-icon" style="font-size: 2.5rem; display: block; margin-bottom: 10px;">💬</span>
      <h3 style="font-size: 1.25rem; font-weight: 700; color: #1e293b; margin-bottom: 6px;">এখনও কোনো রিভিউ যোগ করা হয়নি</h3>
      <p style="color: var(--text-muted); font-size: 0.95rem; max-width: 480px; margin: 0 auto;">
        বইটি পড়ে আপনিই প্রথম মূল্যবান মতামত শেয়ার করতে পারেন। পেমেন্ট সম্পন্ন হলে সরাসরি রিভিউ দেওয়ার সুবিধা রয়েছে।
      </p>
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

  // Compute average & rating distribution
  const total = reviews.length;
  const avg = (reviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / total).toFixed(1);

  const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const rate = Math.max(1, Math.min(5, Number(r.rating) || 5));
    starCounts[rate]++;
  });

  const ratingSummaryHtml = `
    <div style="background: #ffffff; border: 1px solid var(--border-light); border-radius: 16px; padding: 24px; margin-bottom: 32px; display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 20px; box-shadow: var(--shadow-sm);">
      <div style="text-align: center;">
        <div style="font-size: 3rem; font-weight: 800; color: #1e293b; line-height: 1;">${toBanglaNumber(avg)}</div>
        <div style="color: #f59e0b; font-size: 1.3rem; margin: 4px 0;">★★★★★</div>
        <div style="font-size: 0.88rem; color: var(--text-muted);">${toBanglaNumber(total)}টি যাচাইকৃত রিভিউ</div>
      </div>

      <div style="flex: 1 1 260px; max-width: 320px;">
        ${[5, 4, 3, 2, 1].map((star) => {
          const count = starCounts[star] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return `
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.84rem; margin-bottom: 4px;">
              <span style="width: 36px; text-align: right; color: var(--text-muted);">${toBanglaNumber(star)} স্টার</span>
              <div style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${pct}%; height: 100%; background: #f59e0b; border-radius: 4px;"></div>
              </div>
              <span style="width: 28px; color: var(--text-muted);">${toBanglaNumber(count)}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  const cardsHtml = reviews.map((r) => {
    const safeName = escapeHtml(r.name || "সম্মানিত পাঠক");
    const safeComment = escapeHtml(r.comment || "");
    const bookTitle = r.books ? escapeHtml(r.books.title) : "";
    const source = (r.source || "buyer").toLowerCase();

    let badgeHtml = `<span class="verified-badge">✔ যাচাইকৃত ক্রেতা</span>`;
    if (source === "facebook") {
      badgeHtml = `<span class="verified-badge" style="background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;">Facebook থেকে</span>`;
    } else if (source === "whatsapp") {
      badgeHtml = `<span class="verified-badge" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">WhatsApp থেকে</span>`;
    } else if (source === "email") {
      badgeHtml = `<span class="verified-badge" style="background:#fef3c7; color:#b45309; border-color:#fde68a;">Email থেকে</span>`;
    } else if (source !== "buyer") {
      badgeHtml = `<span class="verified-badge" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">${escapeHtml(r.source)} থেকে</span>`;
    }

    const reviewDate = r.review_date || r.created_at;
    const dateStr = reviewDate ? new Date(reviewDate).toLocaleDateString("bn-BD") : "";

    return `
      <div class="review-card reveal is-revealed" style="background: #ffffff; border: 1px solid var(--border-light); border-radius: 14px; padding: 22px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div class="review-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="review-buyer-name" style="font-weight: 700; color: #0f172a;">${safeName}</span>
              ${badgeHtml}
            </div>
            ${dateStr ? `<span style="font-size: 0.8rem; color: #94a3b8;">${dateStr}</span>` : ""}
          </div>
          <div class="review-stars" style="color: #f59e0b; margin-bottom: 10px; font-size: 1.1rem;">
            ${starsHtml(r.rating || 5)}
          </div>
          <p class="review-comment" style="color: #334155; font-size: 0.95rem; line-height: 1.55; margin-bottom: 12px;">"${safeComment}"</p>
        </div>
        ${bookTitle ? `<div style="font-size: 0.82rem; color: #64748b; border-top: 1px dashed var(--border-light); padding-top: 8px; margin-top: 8px;">📖 ${bookTitle}</div>` : ""}
      </div>
    `;
  }).join("");

  container.innerHTML = `
    ${ratingSummaryHtml}
    <div class="reviews-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 20px;">
      ${cardsHtml}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
