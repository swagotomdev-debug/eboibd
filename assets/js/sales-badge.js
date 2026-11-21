/**
 * eboibd.site - Real Sold Counter & Badge Renderer
 * - Reads real verified sales from database (paid orders + paid combo orders)
 * - If count > 0: "🔥 ৫৭ কপি বিক্রি হয়েছে"
 * - If count == 0: "✨ নতুন প্রকাশিত"
 * - Zero fake numbers, zero starting numbers
 */

document.addEventListener("DOMContentLoaded", () => {
  loadRealSalesCounts();
});

async function loadRealSalesCounts() {
  const badgeElements = document.querySelectorAll("[data-sales-slug]");
  if (!badgeElements.length) return;

  try {
    const config = window.EBOI_CONFIG;
    let countsMap = {};

    // 1. Try calling Serverless /api/book-sales
    try {
      const res = await fetch("/api/book-sales");
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.counts) {
          countsMap = data.counts;
        }
      }
    } catch (_) {}

    // 2. Fallback: Call Supabase RPC book_sales_counts directly
    if (Object.keys(countsMap).length === 0 && config && config.supabaseUrl) {
      try {
        const rpcRes = await fetch(`${config.supabaseUrl}/rest/v1/rpc/book_sales_counts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": config.supabaseAnonKey,
            "Authorization": `Bearer ${config.supabaseAnonKey}`
          },
          body: JSON.stringify({})
        });
        if (rpcRes.ok) {
          const list = await rpcRes.json();
          if (Array.isArray(list)) {
            list.forEach((item) => {
              if (item.slug) countsMap[item.slug] = Number(item.sold || 0);
            });
          }
        }
      } catch (_) {}
    }

    badgeElements.forEach((el) => {
      const slug = el.getAttribute("data-sales-slug");
      const realCount = countsMap[slug] !== undefined ? countsMap[slug] : 0;
      renderSalesBadge(el, realCount);
    });

  } catch (err) {
    console.warn("Real sales counts warning:", err);
    badgeElements.forEach((el) => renderSalesBadge(el, 0));
  }
}

function renderSalesBadge(container, count) {
  if (count > 0) {
    container.innerHTML = `
      <span class="sales-badge" style="background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 0.82rem;">
        <span>🔥</span>
        <span>${toBanglaNumber(count)} কপি বিক্রি হয়েছে</span>
      </span>
    `;
  } else {
    container.innerHTML = `
      <span class="sales-badge new" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 0.82rem;">
        <span>✨</span>
        <span>নতুন প্রকাশিত</span>
      </span>
    `;
  }
}
