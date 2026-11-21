/**
 * eboibd.site - Admin Dashboard Controller
 * - Supabase Auth & Direct Admin Session
 * - Full Supabase sync for Orders (Online & Manual Offline Sales)
 * - Review Moderation & Creation with Private Proof Uploads
 * - Offers Management (Mega Combo price, countdown, banner text & single book discounts)
 * - Customer Library Link Generator
 * - Realtime KPI metrics from database
 */

let supabaseClient = null;
let currentAdminUser = null;
let allOrders = [];
let allBooks = [];
let allReviews = [];

document.addEventListener("DOMContentLoaded", () => {
  initSupabaseClient();
  initAdminAuth();
  initAdminTabs();
  initFormListeners();
});

function initSupabaseClient() {
  const config = window.EBOI_CONFIG;
  if (window.supabase && config && config.supabaseUrl && !config.supabaseUrl.includes("your-project")) {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
}

/**
 * 1. Admin Authentication & Session Management
 */
function initAdminAuth() {
  const loginForm = document.getElementById("admin-login-form");
  const loginSection = document.getElementById("admin-login-section");
  const dashboardSection = document.getElementById("admin-dashboard-section");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const loginError = document.getElementById("login-error");

  // Check persistent session in localStorage
  const savedUser = localStorage.getItem("eboibd_admin_user");
  if (savedUser) {
    try {
      currentAdminUser = JSON.parse(savedUser);
      showDashboard(currentAdminUser.email);
    } catch (_) {}
  }

  // Check Supabase active session
  if (supabaseClient && !currentAdminUser) {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        verifyAdminAccess(session.user);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError.style.display = "none";

      const email = document.getElementById("admin_email").value.trim().toLowerCase();
      const password = document.getElementById("admin_password").value;
      const submitBtn = document.getElementById("admin-login-submit");

      submitBtn.disabled = true;
      submitBtn.textContent = "লগইন হচ্ছে...";

      try {
        let authUser = null;

        // 1. Try Supabase Auth API
        if (supabaseClient) {
          try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
              email: email,
              password: password
            });
            if (!error && data && data.user) {
              authUser = data.user;
            }
          } catch (e) {
            console.warn("Supabase auth error:", e);
          }
        }

        // 2. Direct Admin Credentials Check
        if (
          authUser ||
          (email === "team@eboibd.site" && password === "Swagotom1062006") ||
          (email === "admin@eboibd.site" && (password === "admin123" || password === "Swagotom1062006"))
        ) {
          const userObj = { email: email };
          currentAdminUser = userObj;
          localStorage.setItem("eboibd_admin_user", JSON.stringify(userObj));
          showDashboard(email);
          return;
        }

        throw new Error("Invalid login credentials. ইমেইল বা পাসওয়ার্ড সঠিক নয়।");
      } catch (err) {
        console.error("Login error:", err);
        loginError.textContent = err.message || "লগইন ব্যর্থ হয়েছে। সঠিক ইমেইল ও পাসওয়ার্ড দিন।";
        loginError.style.display = "block";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "লগইন করুন";
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      localStorage.removeItem("eboibd_admin_user");
      if (supabaseClient) {
        try { await supabaseClient.auth.signOut(); } catch (_) {}
      }
      location.reload();
    });
  }
}

async function verifyAdminAccess(user) {
  try {
    currentAdminUser = { email: user.email };
    localStorage.setItem("eboibd_admin_user", JSON.stringify(currentAdminUser));
    showDashboard(user.email);
  } catch (err) {
    console.error("Access verification error:", err);
  }
}

function showDashboard(email) {
  const loginSection = document.getElementById("admin-login-section");
  const dashboardSection = document.getElementById("admin-dashboard-section");
  const adminEmailDisplay = document.getElementById("admin-user-email");

  if (adminEmailDisplay) adminEmailDisplay.textContent = email;
  if (loginSection) loginSection.style.display = "none";
  if (dashboardSection) dashboardSection.style.display = "block";

  loadAdminDashboard();
}

/**
 * 2. Load Dashboard Data from Supabase
 */
async function loadAdminDashboard() {
  await fetchBooks();
  await fetchOrders();
  await fetchReviews();

  renderKpiCards();
  renderSalesPerBook();
  renderOrdersTable();
  renderBooksTable();
  renderReviewsTable();
  populateModalDropdowns();
  loadOffersSettings();
}

async function fetchBooks() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        allBooks = data;
        return;
      }
    } catch (e) {
      console.warn("fetchBooks warning:", e);
    }
  }

  // Fallback to local config books
  const booksConfig = (window.EBOI_CONFIG && window.EBOI_CONFIG.books) || {};
  allBooks = Object.values(booksConfig).map((b, idx) => ({
    id: `b00${idx + 1}`,
    slug: b.slug,
    title: b.title,
    page_count: b.pages,
    price_bdt: b.price || 99,
    cover_url: b.coverUrl,
    is_active: true,
    is_bundle: b.slug === "combo-all-4"
  }));
}

async function fetchOrders() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("orders")
        .select("*, books(id, title, slug, is_bundle)")
        .order("created_at", { ascending: false });

      if (!error && data) {
        allOrders = data.map((o) => {
          let matchedBook = o.books;
          if (!matchedBook && o.book_id) {
            matchedBook = allBooks.find((b) => b.id === o.book_id || b.slug === o.book_id);
          }
          return {
            ...o,
            books: matchedBook || { title: "ইবুক", slug: "ai-income" }
          };
        });
        return;
      }
    } catch (e) {
      console.warn("fetchOrders warning:", e);
    }
  }

  allOrders = [];
}

async function fetchReviews() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("reviews")
        .select("*, books(id, title, slug)")
        .order("created_at", { ascending: false });

      if (!error && data) {
        allReviews = data.map((r) => {
          let matchedBook = r.books;
          if (!matchedBook && r.book_id) {
            matchedBook = allBooks.find((b) => b.id === r.book_id || b.slug === r.book_id);
          }
          return {
            ...r,
            books: matchedBook || null
          };
        });
        return;
      }
    } catch (e) {
      console.warn("fetchReviews warning:", e);
    }
  }

  // Strict policy: Do not create fake or sample placeholder reviews
  allReviews = [];
}

/**
 * 3. Render KPI Statistics Cards
 */
function renderKpiCards() {
  const paidOrders = allOrders.filter((o) => o.status === "paid" || o.status === "completed");
  
  const totalCopies = paidOrders.length;
  const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.amount_bdt) || 0), 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const salesToday = paidOrders.filter((o) => (o.paid_at || o.created_at || "").slice(0, 10) === todayStr).length;

  const monthStr = new Date().toISOString().slice(0, 7);
  const salesMonth = paidOrders.filter((o) => (o.paid_at || o.created_at || "").slice(0, 7) === monthStr).length;

  const kpiCopies = document.getElementById("kpi-copies");
  const kpiRevenue = document.getElementById("kpi-revenue");
  const kpiToday = document.getElementById("kpi-today");
  const kpiMonth = document.getElementById("kpi-month");

  if (kpiCopies) kpiCopies.textContent = toBanglaNumber(totalCopies);
  if (kpiRevenue) kpiRevenue.textContent = `৳${toBanglaNumber(totalRevenue)}`;
  if (kpiToday) kpiToday.textContent = toBanglaNumber(salesToday);
  if (kpiMonth) kpiMonth.textContent = toBanglaNumber(salesMonth);
}

/**
 * 4. Render Sales Breakdown Per Book
 */
function renderSalesPerBook() {
  const tbody = document.getElementById("sales-book-tbody");
  if (!tbody) return;

  const paidOrders = allOrders.filter((o) => o.status === "paid" || o.status === "completed");

  const salesMap = {};
  allBooks.forEach((b) => {
    salesMap[b.slug] = { count: 0, revenue: 0 };
  });

  paidOrders.forEach((o) => {
    const slug = (o.books && o.books.slug) || "ai-income";
    if (!salesMap[slug]) salesMap[slug] = { count: 0, revenue: 0 };
    salesMap[slug].count += 1;
    salesMap[slug].revenue += Number(o.amount_bdt) || 0;
  });

  tbody.innerHTML = allBooks.map((b) => {
    const data = salesMap[b.slug] || { count: 0, revenue: 0 };
    return `
      <tr>
        <td><strong>${escapeHtml(b.title)}</strong> ${b.is_bundle ? '<span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:700;">বান্ডেল</span>' : ''}</td>
        <td><code>${b.is_bundle ? '/combo' : '/books/' + escapeHtml(b.slug)}</code></td>
        <td><strong>৳${toBanglaNumber(b.price_bdt || 99)}</strong></td>
        <td>${toBanglaNumber(data.count)} কপি</td>
        <td><strong style="color: #059669;">৳${toBanglaNumber(data.revenue)}</strong></td>
      </tr>
    `;
  }).join("");
}

/**
 * 5. Orders Table, Search, Status Filter & Action Controls
 */
function renderOrdersTable() {
  const tbody = document.getElementById("orders-tbody");
  const filterSelect = document.getElementById("order-status-filter");
  const searchInput = document.getElementById("order-search-input");
  const exportBtn = document.getElementById("btn-export-csv");

  if (!tbody) return;

  const updateTable = () => {
    const filter = filterSelect ? filterSelect.value : "all";
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filtered = allOrders.filter((o) => {
      const matchStatus = filter === "all" || o.status === filter;
      const matchQuery = !query || 
        (o.customer_name && o.customer_name.toLowerCase().includes(query)) ||
        (o.email && o.email.toLowerCase().includes(query)) ||
        (o.phone && o.phone.includes(query)) ||
        (o.transaction_id && o.transaction_id.toLowerCase().includes(query));
      return matchStatus && matchQuery;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 30px;">কোনো অর্ডার পাওয়া যায়নি।</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((o) => {
      const isPaid = o.status === "paid" || o.status === "completed";
      const statusClass = isPaid ? "status-paid" : o.status === "pending" ? "status-pending" : "status-failed";
      const statusText = isPaid ? "পরিশোধিত" : o.status === "pending" ? "অপেক্ষমান" : "ব্যর্থ";
      const bookTitle = o.books ? o.books.title : "ইবুক";
      const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString("bn-BD") : "-";
      const customerIdentifier = o.phone || o.email || "";
      const isManual = o.source === "manual";

      return `
        <tr>
          <td><code title="${o.id}">${o.id ? o.id.slice(0, 10) : ""}...</code></td>
          <td>${dateStr}</td>
          <td>
            <strong>${escapeHtml(o.customer_name || "সম্মানিত ক্রেতা")}</strong><br>
            <small class="text-muted" style="font-family: monospace;">${escapeHtml(o.phone || "-")}</small>
          </td>
          <td><small>${escapeHtml(o.email || "-")}</small></td>
          <td><small><strong>${escapeHtml(bookTitle)}</strong></small></td>
          <td><strong style="color:#059669;">৳${toBanglaNumber(o.amount_bdt || 99)}</strong></td>
          <td>
            <span style="display:inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; background: ${isManual ? '#fef3c7; color: #92400e;' : '#eff6ff; color: #1d4ed8;'}">
              ${isManual ? 'ম্যানুয়াল' : 'অনলাইন'}
            </span>
          </td>
          <td>
            <span class="status-badge ${statusClass}">${statusText}</span>
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${!isPaid ? `
                <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.78rem; background: #059669; border-color: #059669;" onclick="updateOrderStatus('${o.id}', 'paid')">
                  ✓ পেইড মার্ক
                </button>
              ` : `
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.78rem;" onclick="updateOrderStatus('${o.id}', 'pending')">
                  অপেক্ষমান
                </button>
              `}
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.78rem;" title="কাস্টমারকে লাইব্রেরি লিংক পাঠান" onclick="copyLibraryLink('${escapeHtml(customerIdentifier)}')">
                📚 লিংক
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  };

  if (filterSelect) filterSelect.addEventListener("change", updateTable);
  if (searchInput) searchInput.addEventListener("input", updateTable);
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportOrdersToCSV(allOrders));
  }

  updateTable();
}

/**
 * 6. Quick Order Status Changer
 */
window.updateOrderStatus = async function(orderId, newStatus) {
  if (supabaseClient) {
    try {
      const updates = { status: newStatus };
      if (newStatus === "paid") {
        updates.paid_at = new Date().toISOString();
        const existing = allOrders.find((o) => o.id === orderId);
        if (!existing || !existing.transaction_id) {
          updates.transaction_id = "ADMIN_MANUAL_" + Date.now().toString().slice(-6);
        }
      }

      const { error } = await supabaseClient
        .from("orders")
        .update(updates)
        .eq("id", orderId);

      if (error) throw error;

      alert("🎉 অর্ডার স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে!");
      await fetchOrders();
      renderKpiCards();
      renderSalesPerBook();
      renderOrdersTable();
      return;
    } catch (err) {
      alert("স্ট্যাটাস পরিবর্তন ব্যর্থ: " + err.message);
    }
  }

  const order = allOrders.find((o) => o.id === orderId);
  if (order) order.status = newStatus;
  renderKpiCards();
  renderSalesPerBook();
  renderOrdersTable();
};

/**
 * 7. Copy Customer Library Link
 */
window.copyLibraryLink = function(identifier) {
  if (!identifier) {
    alert("গ্রাহকের কোনো ইমেইল বা ফোন নম্বর পাওয়া যায়নি।");
    return;
  }
  const link = `${window.location.origin}/my-books?search=${encodeURIComponent(identifier)}`;
  navigator.clipboard.writeText(link).then(() => {
    alert(`কাস্টমার লাইব্রেরি লিংক কপি হয়েছে:\n${link}\n\nএটি হোয়াটসঅ্যাপে কাস্টমারকে পাঠিয়ে দিন!`);
  }).catch(() => {
    prompt("কাস্টমার লাইব্রেরি লিংক কপি করুন:", link);
  });
};

/**
 * 8. Books Table & Actions
 */
function renderBooksTable() {
  const tbody = document.getElementById("books-tbody");
  if (!tbody) return;

  tbody.innerHTML = allBooks.map((b) => `
    <tr>
      <td><img src="${b.cover_url || '/assets/images/' + b.slug + '-cover.webp'}" style="width:40px; border-radius:4px;" alt="Cover"></td>
      <td><strong>${escapeHtml(b.title)}</strong><br><small class="text-muted">Slug: ${escapeHtml(b.slug)}</small></td>
      <td>${toBanglaNumber(b.page_count || 25)} পেজ</td>
      <td>
        <strong style="color: #059669; font-size:1.05rem;">৳${toBanglaNumber(b.price_bdt || 99)}</strong>
        ${b.sale_price_bdt ? `<br><small style="color:#dc2626;">অফার: ৳${toBanglaNumber(b.sale_price_bdt)}</small>` : ''}
      </td>
      <td>
        <span class="status-badge ${b.is_active !== false ? 'status-paid' : 'status-failed'}">
          ${b.is_active !== false ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয়'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.85rem;" onclick="toggleBookStatus('${b.id}', ${b.is_active === false})">
          ${b.is_active !== false ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
        </button>
      </td>
    </tr>
  `).join("");
}

window.toggleBookStatus = async function(bookId, newStatus) {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from("books")
        .update({ is_active: newStatus })
        .eq("id", bookId);

      if (error) throw error;
      await fetchBooks();
      renderBooksTable();
      return;
    } catch (err) {
      alert("বইয়ের স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে: " + err.message);
    }
  }

  const b = allBooks.find((book) => book.id === bookId);
  if (b) b.is_active = newStatus;
  renderBooksTable();
};

/**
 * 9. Reviews Table & Moderation
 */
function renderReviewsTable() {
  const tbody = document.getElementById("reviews-tbody");
  if (!tbody) return;

  if (allReviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:30px; color:#64748b;">কোনো রিভিউ নেই। ওপরের বাটনে ক্লিক করে নতুন রিভিউ যোগ করতে পারেন।</td></tr>`;
    return;
  }

  tbody.innerHTML = allReviews.map((r) => {
    let sourceBadge = `<span style="background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem;">${escapeHtml(r.source || 'অন্যান্য')}</span>`;
    if (r.order_id || r.source === "buyer") {
      sourceBadge = `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem;">✔ যাচাইকৃত ক্রেতা</span>`;
    } else if (r.source === "Facebook") {
      sourceBadge = `<span style="background:#dbeafe; color:#1d4ed8; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem;">Facebook থেকে</span>`;
    } else if (r.source === "WhatsApp") {
      sourceBadge = `<span style="background:#d1fae5; color:#047857; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem;">WhatsApp থেকে</span>`;
    }

    const proofBtn = r.proof_path ? `
      <button class="btn btn-secondary" style="padding:3px 8px; font-size:0.75rem;" onclick="openProofModal('${r.proof_path}')">
        📷 দেখুন
      </button>
    ` : `<span style="color:#94a3b8;">-</span>`;

    const bookName = r.books ? r.books.title : "সাধারণ / কম্বো";
    const dateStr = r.review_date || (r.created_at ? r.created_at.slice(0, 10) : "-");

    return `
      <tr>
        <td><strong>${escapeHtml(r.name || "সম্মানিত পাঠক")}</strong></td>
        <td><small>${escapeHtml(bookName)}</small></td>
        <td>${sourceBadge}</td>
        <td><span style="color:#f59e0b;">${"★".repeat(r.rating || 5)}</span></td>
        <td><p style="max-width:280px; font-size:0.88rem; margin:0; line-height:1.4;">"${escapeHtml(r.comment || "")}"</p></td>
        <td><small>${dateStr}</small></td>
        <td>${proofBtn}</td>
        <td>
          <span class="status-badge ${r.approved ? 'status-paid' : 'status-pending'}">
            ${r.approved ? 'অনুমোদিত' : 'লুকানো'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.78rem;" onclick="toggleReviewApproval('${r.id}', ${!r.approved})">
              ${r.approved ? 'হাইড' : 'অনুমোদন'}
            </button>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.78rem; color:#dc2626;" onclick="deleteReview('${r.id}')" title="ডিলিট করুন">
              ✕
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

window.toggleReviewApproval = async function(reviewId, approved) {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from("reviews")
        .update({ approved: approved })
        .eq("id", reviewId);

      if (error) throw error;
      await fetchReviews();
      renderReviewsTable();
      return;
    } catch (err) {
      alert("রিভিউ আপডেট করতে সমস্যা হয়েছে: " + err.message);
    }
  }

  const rev = allReviews.find((r) => r.id === reviewId);
  if (rev) rev.approved = approved;
  renderReviewsTable();
};

window.deleteReview = async function(reviewId) {
  if (!confirm("আপনি কি নিশ্চিত যে এই রিভিউটি স্থায়ীভাবে মুছে ফেলতে চান?")) return;

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from("reviews")
        .delete()
        .eq("id", reviewId);

      if (error) throw error;
      await fetchReviews();
      renderReviewsTable();
      return;
    } catch (err) {
      alert("রিভিউ ডিলিট করতে সমস্যা হয়েছে: " + err.message);
    }
  }

  allReviews = allReviews.filter((r) => r.id !== reviewId);
  renderReviewsTable();
};

/**
 * 10. Manual Offline Sale Modal & Submission
 */
window.openManualSaleModal = function() {
  const modal = document.getElementById("manual-sale-modal");
  if (modal) {
    modal.classList.add("active");
    const dateInput = document.getElementById("manual_date");
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  }
};

window.closeManualSaleModal = function() {
  const modal = document.getElementById("manual-sale-modal");
  if (modal) modal.classList.remove("active");
};

window.handleManualBookChange = function(selectEl) {
  const amountInput = document.getElementById("manual_amount");
  if (!amountInput) return;
  const bookId = selectEl.value;
  const matched = allBooks.find((b) => b.id === bookId || b.slug === bookId);
  if (matched) {
    amountInput.value = matched.price_bdt || 99;
  }
};

/**
 * 11. Add Review Modal & Submission
 */
window.openAddReviewModal = function() {
  const modal = document.getElementById("add-review-modal");
  if (modal) {
    modal.classList.add("active");
    const dateInput = document.getElementById("rev_date");
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  }
};

window.closeAddReviewModal = function() {
  const modal = document.getElementById("add-review-modal");
  if (modal) modal.classList.remove("active");
};

window.openProofModal = async function(path) {
  const modal = document.getElementById("proof-view-modal");
  const img = document.getElementById("proof-modal-img");
  if (!modal || !img) return;

  let url = path;
  if (path && !path.startsWith("http") && supabaseClient) {
    try {
      const { data } = await supabaseClient.storage.from("review-proofs").createSignedUrl(path, 300);
      if (data && data.signedUrl) url = data.signedUrl;
    } catch (_) {}
  }

  img.src = url;
  modal.classList.add("active");
};

window.closeProofModal = function() {
  const modal = document.getElementById("proof-view-modal");
  if (modal) modal.classList.remove("active");
};

function populateModalDropdowns() {
  const manualSelect = document.getElementById("manual_book_id");
  const revSelect = document.getElementById("rev_book_id");

  if (manualSelect) {
    manualSelect.innerHTML = allBooks.map((b) => `
      <option value="${b.id}" ${b.slug === 'combo-all-4' ? 'selected' : ''}>
        ${escapeHtml(b.title)} (${b.is_bundle ? 'মেগা কম্বো' : 'ইবুক'} - ৳${b.price_bdt || 99})
      </option>
    `).join("");
  }

  if (revSelect) {
    revSelect.innerHTML = allBooks.map((b) => `
      <option value="${b.id}">
        ${escapeHtml(b.title)}
      </option>
    `).join("");
  }
}

/**
 * 12. Offers Tab: Load Settings and Form Handlers
 */
async function loadOffersSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const data = await res.json();
    const settings = data.settings || {};

    const activeSelect = document.getElementById("setting_combo_active");
    const endsInput = document.getElementById("setting_offer_ends_at");
    const bannerInput = document.getElementById("setting_banner_text");
    const priceInput = document.getElementById("setting_combo_price");

    if (activeSelect && settings.combo_active !== undefined) {
      activeSelect.value = String(settings.combo_active);
    }
    if (bannerInput && settings.banner_text) {
      bannerInput.value = settings.banner_text;
    }
    if (endsInput && settings.offer_ends_at) {
      try {
        const d = new Date(settings.offer_ends_at);
        endsInput.value = d.toISOString().slice(0, 16);
      } catch (_) {}
    }

    // Find combo book price
    const comboBook = allBooks.find((b) => b.slug === "combo-all-4");
    if (comboBook && priceInput) {
      priceInput.value = comboBook.price_bdt || 149;
    }
  } catch (err) {
    console.warn("loadOffersSettings warning:", err);
  }
}

/**
 * 13. Form Event Listeners Setup
 */
function initFormListeners() {
  // Manual Sale Form
  const manualForm = document.getElementById("manual-sale-form");
  if (manualForm) {
    manualForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("btn-submit-manual-sale");
      submitBtn.disabled = true;
      submitBtn.textContent = "সংরক্ষণ হচ্ছে...";

      try {
        const name = document.getElementById("manual_name").value.trim();
        const phone = document.getElementById("manual_phone").value.trim();
        const email = document.getElementById("manual_email").value.trim().toLowerCase();
        const bookId = document.getElementById("manual_book_id").value;
        const amount = parseFloat(document.getElementById("manual_amount").value);
        const trx = document.getElementById("manual_trx").value.trim();
        const date = document.getElementById("manual_date").value;

        const payload = {
          customer_name: name,
          phone: phone,
          email: email || `${phone}@manual.eboibd.site`,
          book_id: bookId,
          amount_bdt: amount,
          status: "paid",
          source: "manual",
          transaction_id: trx || `MANUAL_${Date.now().toString().slice(-6)}`,
          paid_at: date ? new Date(date).toISOString() : new Date().toISOString()
        };

        if (supabaseClient) {
          const { error } = await supabaseClient.from("orders").insert(payload);
          if (error) throw error;
        }

        alert("🎉 ম্যানুয়াল সেলস সফলভাবে রেকর্ড করা হয়েছে! এটি স্বয়ংক্রিয়ভাবে মোট বিক্রিতে যুক্ত হয়েছে।");
        closeManualSaleModal();
        await fetchOrders();
        renderKpiCards();
        renderSalesPerBook();
        renderOrdersTable();
      } catch (err) {
        console.error("Manual order error:", err);
        alert("অর্ডার রেকর্ড করতে সমস্যা হয়েছে: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "অর্ডার রেকর্ড করুন (Paid)";
      }
    });
  }

  // Add Review Form
  const reviewForm = document.getElementById("add-review-form");
  if (reviewForm) {
    reviewForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("btn-submit-review");
      submitBtn.disabled = true;
      submitBtn.textContent = "পাবলিশ হচ্ছে...";

      try {
        const name = document.getElementById("rev_name").value.trim();
        const source = document.getElementById("rev_source").value;
        const bookId = document.getElementById("rev_book_id").value;
        const rating = parseInt(document.getElementById("rev_rating").value, 10);
        const date = document.getElementById("rev_date").value;
        const comment = document.getElementById("rev_comment").value.trim();
        const proofFile = document.getElementById("rev_proof_file").files[0];

        let proofPath = null;
        if (proofFile && supabaseClient) {
          const ext = proofFile.name.split('.').pop();
          const pName = `proof_${Date.now()}.${ext}`;
          const { error: upErr } = await supabaseClient.storage.from("review-proofs").upload(pName, proofFile);
          if (!upErr) proofPath = pName;
        }

        const payload = {
          name: name,
          book_id: bookId,
          rating: rating,
          comment: comment,
          source: source,
          review_date: date || new Date().toISOString().slice(0, 10),
          proof_path: proofPath,
          approved: true // admin added reviews are approved by default
        };

        if (supabaseClient) {
          const { error } = await supabaseClient.from("reviews").insert(payload);
          if (error) throw error;
        }

        alert("🎉 নতুন রিভিউ সফলভাবে প্রকাশিত হয়েছে!");
        closeAddReviewModal();
        await fetchReviews();
        renderReviewsTable();
      } catch (err) {
        console.error("Add review error:", err);
        alert("রিভিউ যোগ করতে সমস্যা হয়েছে: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "রিভিউ সংরক্ষণ করুন";
      }
    });
  }

  // Combo Settings Form
  const comboForm = document.getElementById("combo-offer-form");
  if (comboForm) {
    comboForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById("btn-save-combo-settings");
      saveBtn.disabled = true;
      saveBtn.textContent = "সংরক্ষণ হচ্ছে...";

      try {
        const active = document.getElementById("setting_combo_active").value;
        const price = parseFloat(document.getElementById("setting_combo_price").value);
        const endsAt = document.getElementById("setting_offer_ends_at").value;
        const bannerText = document.getElementById("setting_banner_text").value.trim();

        // 1. Save settings to /api/settings
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            combo_active: active,
            banner_text: bannerText,
            offer_ends_at: endsAt ? new Date(endsAt).toISOString() : ""
          })
        });

        // 2. Update price in books table for combo-all-4
        if (supabaseClient) {
          await supabaseClient
            .from("books")
            .update({ price_bdt: price })
            .eq("slug", "combo-all-4");
        }

        alert("🎉 কম্বো অফার সেটিংস সফলভাবে সংরক্ষিত হয়েছে!");
        await fetchBooks();
        renderBooksTable();
      } catch (err) {
        console.error("Combo settings error:", err);
        alert("সেটিংস সংরক্ষণে সমস্যা হয়েছে: " + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "💾 কম্বো অফার সেটিংস সংরক্ষণ করুন";
      }
    });
  }

  // Single Book Discount Form
  const singleForm = document.getElementById("single-book-discount-form");
  if (singleForm) {
    singleForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById("btn-save-discount");
      saveBtn.disabled = true;
      saveBtn.textContent = "সংরক্ষণ হচ্ছে...";

      try {
        const slug = document.getElementById("discount_book_slug").value;
        const price = parseFloat(document.getElementById("discount_sale_price").value);
        const endsAt = document.getElementById("discount_sale_ends_at").value;

        if (supabaseClient) {
          const { error } = await supabaseClient
            .from("books")
            .update({
              sale_price_bdt: price,
              sale_ends_at: endsAt ? new Date(endsAt).toISOString() : null
            })
            .eq("slug", slug);

          if (error) throw error;
        }

        alert(`🎉 ${slug} বইটির অফার মূল্য (৳${price}) সফলভাবে সক্রিয় করা হয়েছে!`);
        await fetchBooks();
        renderBooksTable();
      } catch (err) {
        console.error("Discount error:", err);
        alert("ডিসকাউন্ট সংরক্ষণে সমস্যা হয়েছে: " + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "🏷️ ডিসকাউন্ট অফার সেভ করুন";
      }
    });
  }
}

window.clearBookDiscount = async function() {
  const slug = document.getElementById("discount_book_slug").value;
  if (!confirm(`আপনি কি ${slug} বইটির স্পেশাল ডিসকাউন্ট অফার বন্ধ করতে চান?`)) return;

  if (supabaseClient) {
    try {
      await supabaseClient
        .from("books")
        .update({ sale_price_bdt: null, sale_ends_at: null })
        .eq("slug", slug);

      alert(`✓ ${slug} বইটির ডিসকাউন্ট অফার বন্ধ করা হয়েছে।`);
      await fetchBooks();
      renderBooksTable();
    } catch (err) {
      alert("সমস্যা হয়েছে: " + err.message);
    }
  }
};

/**
 * 14. Export Orders to CSV
 */
function exportOrdersToCSV(orders) {
  if (!orders || !orders.length) {
    alert("এক্সপোর্ট করার মতো কোনো অর্ডার পাওয়া যায়নি।");
    return;
  }

  const headers = ["Order ID", "Date", "Customer Name", "Email", "Phone", "Book", "Amount (BDT)", "Source", "Status", "Transaction ID"];
  const rows = orders.map((o) => [
    `"${o.id || ""}"`,
    `"${o.created_at || ""}"`,
    `"${(o.customer_name || "").replace(/"/g, '""')}"`,
    `"${o.email || ""}"`,
    `"${o.phone || ""}"`,
    `"${(o.books?.title || "").replace(/"/g, '""')}"`,
    o.amount_bdt || 99,
    `"${o.source || "online"}"`,
    o.status || "",
    `"${o.transaction_id || o.gateway_ref || ""}"`
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `eboibd-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 15. Dashboard Tabs Switcher
 */
function initAdminTabs() {
  const tabs = document.querySelectorAll(".admin-tab-btn");
  const contents = document.querySelectorAll(".admin-tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      const targetContent = document.getElementById(`tab-${target}`);
      if (targetContent) targetContent.classList.add("active");
    });
  });
}

function toBanglaNumber(num) {
  if (num === null || num === undefined) return "০";
  const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  return String(num).replace(/[0-9]/g, d => bn[d]);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
