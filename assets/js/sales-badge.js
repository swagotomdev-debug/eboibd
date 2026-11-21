/**
 * eboibd.site - Real Sales Counter & Badge Renderer
 * Requirement:
 * - Sales badge shows the REAL number of paid orders from the database,
 *   e.g. "🔥 ৪৫ জন কিনেছেন", ONLY when it is 10 or more.
 * - Below 10, show "✨ নতুন প্রকাশিত".
 * - Never add any starting or fake number.
 */

document.addEventListener("DOMContentLoaded", () => {
  loadRealSalesCounts();
});

async function loadRealSalesCounts() {
  const badgeElements = document.querySelectorAll("[data-sales-slug]");
  if (!badgeElements.length) return;

  try {
    const config = window.EBOI_CONFIG;
    if (!config || !config.supabaseUrl || config.supabaseUrl.includes("your-project")) {
      // Supabase not yet configured by user, render honest default "✨ নতুন প্রকাশিত"
      badgeElements.forEach((el) => renderSalesBadge(el, 0));
      return;
    }

    const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/get_book_sales_counts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.supabaseAnonKey,
        "Authorization": `Bearer ${config.supabaseAnonKey}`
      }
    });

    if (!res.ok) {
      throw new Error(`RPC error: ${res.status}`);
    }

    const counts = await res.json();
    // counts is array of { slug: string, paid_count: number }
    const countMap = {};
    if (Array.isArray(counts)) {
      counts.forEach((item) => {
        countMap[item.slug] = item.paid_count || 0;
      });
    }

    badgeElements.forEach((el) => {
      const slug = el.getAttribute("data-sales-slug");
      const realCount = countMap[slug] || 0;
      renderSalesBadge(el, realCount);
    });
  } catch (err) {
    console.warn("Real sales counts could not be loaded from database:", err);
    // On failure or empty DB, strictly show real honest status: "✨ নতুন প্রকাশিত"
    badgeElements.forEach((el) => renderSalesBadge(el, 0));
  }
}

function renderSalesBadge(container, count) {
  if (count >= 10) {
    container.innerHTML = `
      <span class="sales-badge">
        <span class="pulse-dot">🔥</span>
        <span>${toBanglaNumber(count)} জন কিনেছেন</span>
      </span>
    `;
  } else {
    container.innerHTML = `
      <span class="sales-badge new">
        <span>✨</span>
        <span>নতুন প্রকাশিত</span>
      </span>
    `;
  }
}
