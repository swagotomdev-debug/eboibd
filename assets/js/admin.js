/**
 * eboibd.site - Admin Dashboard Controller
 * - Supabase Email+Password Auth (verified against `admins` table)
 * - KPI Cards: Total Copies, Revenue, Today's Sales, Month's Sales
 * - Sales Per Book breakdown
 * - Orders Table: Filter (all/paid/pending/failed), Search, CSV Export
 * - Books Manager: Add/Edit books, upload cover & PDF, toggle status
 * - Reviews Moderation: Approve or Hide reviews
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
});

function initSupabaseClient() {
  const config = window.EBOI_CONFIG;
  if (window.supabase && config.supabaseUrl && !config.supabaseUrl.includes("your-project")) {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
}

/**
 * 1. Admin Authentication & Access Verification
 */
function initAdminAuth() {
  const loginForm = document.getElementById("admin-login-form");
  const loginSection = document.getElementById("admin-login-section");
  const dashboardSection = document.getElementById("admin-dashboard-section");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const loginError = document.getElementById("login-error");

  if (!loginForm) return;

  // Check existing session
  if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        verifyAdminAccess(session.user);
      }
    });
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.style.display = "none";

    const email = document.getElementById("admin_email").value.trim().toLowerCase();
    const password = document.getElementById("admin_password").value;
    const submitBtn = document.getElementById("admin-login-submit");

    // Local Demo / Offline Fallback if Supabase is not yet configured
    if (!supabaseClient) {
      if ((email === "admin@eboibd.site" || email === "team@eboibd.site") && (password === "admin" || password === "admin123")) {
        currentAdminUser = { email: email };
        document.getElementById("admin-user-email").textContent = email + " (লোকাল ডেমো মোড)";
        loginSection.style.display = "none";
        dashboardSection.style.display = "block";
        loadLocalDemoData();
        return;
      } else {
        loginError.innerHTML = `
          Supabase এখনো কনফিগার করা হয়নি।<br>
          <strong>লোকাল ডেমো অ্যাডমিন লগইন:</strong><br>
          ইমেইল: <code>admin@eboibd.site</code><br>
          পাসওয়ার্ড: <code>admin123</code>
        `;
        loginError.style.display = "block";
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "লগইন হচ্ছে...";

    try {
      let authUser = null;
      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
          });
          if (!error && data && data.user) {
            authUser = data.user;
          }
        } catch (_) {}
      }

      if (authUser) {
        await verifyAdminAccess(authUser);
        return;
      }

      // Direct Owner Fallback: if user is team@eboibd.site with their password
      if (email === "team@eboibd.site" && password === "Swagotom1062006") {
        currentAdminUser = { email: email };
        const adminEmailDisplay = document.getElementById("admin-user-email");
        if (adminEmailDisplay) adminEmailDisplay.textContent = email;
        if (loginSection) loginSection.style.display = "none";
        if (dashboardSection) dashboardSection.style.display = "block";
        if (supabaseClient) {
          loadAdminDashboard();
        } else {
          loadLocalDemoData();
        }
        return;
      }

      throw new Error("Invalid login credentials. ইমেইল বা পাসওয়ার্ড সঠিক নয়।");
    } catch (err) {
      console.error("Login error:", err);
      loginError.textContent = err.message || "লগইন ব্যর্থ হয়েছে। ইমেইল ও পাসওয়ার্ড চেক করুন।";
      loginError.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "লগইন করুন";
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
      location.reload();
    });
  }
}

async function verifyAdminAccess(user) {
  const loginSection = document.getElementById("admin-login-section");
  const dashboardSection = document.getElementById("admin-dashboard-section");
  const adminEmailDisplay = document.getElementById("admin-user-email");
  const loginError = document.getElementById("login-error");

  try {
    // Check if user's email exists in `admins` table
    const { data, error } = await supabaseClient
      .from("admins")
      .select("email")
      .eq("email", user.email)
      .single();

    if (error || !data) {
      await supabaseClient.auth.signOut();
      throw new Error("অ্যাক্সেস ডিনাইড! আপনার ইমেইলটি অ্যাডমিন তালিকায় অনুমোদিত নয়।");
    }

    currentAdminUser = user;
    if (adminEmailDisplay) adminEmailDisplay.textContent = user.email;
    if (loginSection) loginSection.style.display = "none";
    if (dashboardSection) dashboardSection.style.display = "block";

    // Load Dashboard Data
    loadAdminDashboard();
  } catch (err) {
    console.error("Access verification error:", err);
    if (loginError) {
      loginError.textContent = err.message || "অনুমতি যাচাই করতে সমস্যা হয়েছে।";
      loginError.style.display = "block";
    }
  }
}

/**
 * 2. Load Dashboard Statistics & Data
 */
async function loadAdminDashboard() {
  await Promise.all([
    fetchOrders(),
    fetchBooks(),
    fetchReviews()
  ]);

  renderKpiCards();
  renderSalesPerBook();
  renderOrdersTable();
  renderBooksTable();
  renderReviewsTable();
}

/**
 * Local Demo Data Loader (for testing before connecting Supabase)
 */
function loadLocalDemoData() {
  const booksConfig = window.EBOI_CONFIG.books;
  allBooks = Object.values(booksConfig).map((b, idx) => ({
    id: `b00${idx + 1}-demo`,
    slug: b.slug,
    title: b.title,
    page_count: b.pages,
    price_bdt: b.price,
    cover_url: b.coverUrl,
    is_active: true
  }));

  allOrders = [
    {
      id: "ord-8712-4a1b",
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      customer_name: "তানভীর আহমেদ",
      email: "tanvir.ahmed@gmail.com",
      phone: "01712345678",
      amount_bdt: 299,
      status: "paid",
      transaction_id: "TRX9827361",
      download_count: 1,
      book_id: allBooks[0].id,
      books: { title: allBooks[0].title, slug: allBooks[0].slug }
    },
    {
      id: "ord-6541-9c2d",
      created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
      paid_at: new Date(Date.now() - 3600000 * 3).toISOString(),
      customer_name: "রাকিবুল হাসান",
      email: "rakibul.h@yahoo.com",
      phone: "01823456789",
      amount_bdt: 249,
      status: "paid",
      transaction_id: "TRX5182903",
      download_count: 2,
      book_id: allBooks[1].id,
      books: { title: allBooks[1].title, slug: allBooks[1].slug }
    },
    {
      id: "ord-3319-5e7f",
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      paid_at: null,
      customer_name: "নুসরাত জাহান",
      email: "nusrat.jahan@gmail.com",
      phone: "01934567890",
      amount_bdt: 349,
      status: "pending",
      transaction_id: null,
      download_count: 0,
      book_id: allBooks[2].id,
      books: { title: allBooks[2].title, slug: allBooks[2].slug }
    },
    {
      id: "ord-1190-2b8e",
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      paid_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      customer_name: "মেহরাব হোসেন",
      email: "mehrab.dev@gmail.com",
      phone: "01645678901",
      amount_bdt: 299,
      status: "paid",
      transaction_id: "TRX2389014",
      download_count: 1,
      book_id: allBooks[3].id,
      books: { title: allBooks[3].title, slug: allBooks[3].slug }
    }
  ];

  allReviews = [
    {
      id: "rev-01",
      name: "তানভীর আহমেদ",
      rating: 5,
      comment: "বইটির ৩০ দিনের প্ল্যান এবং রেডি প্রম্পটগুলো অসাধারণ! একদম বাস্তব কাজ শেখার জন্য পারফেক্ট।",
      approved: true,
      books: { title: allBooks[0].title }
    },
    {
      id: "rev-02",
      name: "রাকিবুল হাসান",
      rating: 5,
      comment: "ব্যাংক থেকে ২.৫% প্রণোদনা নেওয়ার সঠিক নিয়মটি এত সুন্দরভাবে অন্য কোথাও পাইনি।",
      approved: false, // Pending moderation test
      books: { title: allBooks[1].title }
    }
  ];

  renderKpiCards();
  renderSalesPerBook();
  renderOrdersTable();
  renderBooksTable();
  renderReviewsTable();
}

async function fetchOrders() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*, books(title, slug)")
    .order("created_at", { ascending: false });

  if (!error && data) {
    allOrders = data;
  }
}

async function fetchBooks() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (!error && data) {
    allBooks = data;
  }
}

async function fetchReviews() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("reviews")
    .select("*, books(title, slug)")
    .order("created_at", { ascending: false });

  if (!error && data) {
    allReviews = data;
  }
}

/**
 * 3. Render KPI Cards
 */
function renderKpiCards() {
  const paidOrders = allOrders.filter((o) => o.status === "paid");
  
  // Total copies sold
  const totalCopies = paidOrders.length;
  // Total revenue
  const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.amount_bdt) || 0), 0);

  // Sales Today
  const todayStr = new Date().toISOString().slice(0, 10);
  const salesToday = paidOrders.filter((o) => (o.paid_at || o.created_at || "").slice(0, 10) === todayStr).length;

  // Sales this month
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
 * 4. Render Sales Per Book Table
 */
function renderSalesPerBook() {
  const tableBody = document.getElementById("sales-book-tbody");
  if (!tableBody) return;

  const paidOrders = allOrders.filter((o) => o.status === "paid");
  const bookStats = {};

  allBooks.forEach((b) => {
    bookStats[b.id] = { title: b.title, slug: b.slug, price: b.price_bdt, count: 0, revenue: 0 };
  });

  paidOrders.forEach((o) => {
    if (bookStats[o.book_id]) {
      bookStats[o.book_id].count++;
      bookStats[o.book_id].revenue += Number(o.amount_bdt) || 0;
    }
  });

  const rows = Object.values(bookStats).map((bs) => `
    <tr>
      <td><strong>${escapeHtml(bs.title)}</strong></td>
      <td><code>/books/${escapeHtml(bs.slug)}</code></td>
      <td>৳${toBanglaNumber(bs.price)}</td>
      <td><strong>${toBanglaNumber(bs.count)} কপি</strong></td>
      <td><strong>৳${toBanglaNumber(bs.revenue)}</strong></td>
    </tr>
  `).join("");

  tableBody.innerHTML = rows || `<tr><td colspan="5" class="text-center">কোনো বই বা বিক্রির তথ্য পাওয়া যায়নি।</td></tr>`;
}

/**
 * 5. Orders Table, Search, Status Filter & CSV Export
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
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">কোনো অর্ডার পাওয়া যায়নি।</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((o) => {
      const statusClass = o.status === "paid" ? "status-paid" : o.status === "pending" ? "status-pending" : "status-failed";
      const statusText = o.status === "paid" ? "পরিশোধিত" : o.status === "pending" ? "অপেক্ষমান" : "ব্যর্থ";
      const bookTitle = o.books ? o.books.title : "N/A";
      const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString("bn-BD") : "";

      return `
        <tr>
          <td><code title="${o.id}">${o.id ? o.id.slice(0, 8) : ""}...</code></td>
          <td>${dateStr}</td>
          <td><strong>${escapeHtml(o.customer_name || "")}</strong><br><small class="text-muted">${escapeHtml(o.phone || "")}</small></td>
          <td><small>${escapeHtml(o.email || "")}</small></td>
          <td>${escapeHtml(bookTitle)}</td>
          <td>৳${toBanglaNumber(o.amount_bdt)}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${toBanglaNumber(o.download_count || 0)} / ৫</td>
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

function exportOrdersToCSV(orders) {
  if (!orders.length) {
    alert("এক্সপোর্ট করার মতো কোনো অর্ডার পাওয়া যায়নি।");
    return;
  }

  const headers = ["Order ID", "Date", "Customer Name", "Email", "Phone", "Book", "Amount (BDT)", "Status", "Transaction ID", "Downloads"];
  const rows = orders.map((o) => [
    `"${o.id || ""}"`,
    `"${o.created_at || ""}"`,
    `"${(o.customer_name || "").replace(/"/g, '""')}"`,
    `"${o.email || ""}"`,
    `"${o.phone || ""}"`,
    `"${(o.books?.title || "").replace(/"/g, '""')}"`,
    o.amount_bdt || 0,
    o.status || "",
    `"${o.transaction_id || o.gateway_ref || ""}"`,
    o.download_count || 0
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
 * 6. Books Management
 */
function renderBooksTable() {
  const tbody = document.getElementById("books-tbody");
  if (!tbody) return;

  if (allBooks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">কোনো বই পাওয়া যায়নি।</td></tr>`;
    return;
  }

  tbody.innerHTML = allBooks.map((b) => `
    <tr>
      <td><img src="${b.cover_url || '/assets/images/' + b.slug + '-cover.webp'}" style="width:40px; border-radius:4px;" alt="Cover"></td>
      <td><strong>${escapeHtml(b.title)}</strong><br><small class="text-muted">Slug: ${escapeHtml(b.slug)}</small></td>
      <td>${toBanglaNumber(b.page_count)} পেজ</td>
      <td><strong>৳${toBanglaNumber(b.price_bdt)}</strong></td>
      <td>
        <span class="status-badge ${b.is_active ? 'status-paid' : 'status-failed'}">
          ${b.is_active ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয়'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.85rem;" onclick="toggleBookStatus('${b.id}', ${!b.is_active})">
          ${b.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
        </button>
      </td>
    </tr>
  `).join("");
}

window.toggleBookStatus = async function(bookId, newStatus) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from("books")
      .update({ is_active: newStatus })
      .eq("id", bookId);

    if (error) throw error;
    await fetchBooks();
    renderBooksTable();
  } catch (err) {
    alert("বইয়ের স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে: " + err.message);
  }
};

/**
 * 7. Reviews Moderation (Approve / Hide)
 */
function renderReviewsTable() {
  const tbody = document.getElementById("reviews-tbody");
  if (!tbody) return;

  if (allReviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">কোনো রিভিউ পাওয়া যায়নি।</td></tr>`;
    return;
  }

  tbody.innerHTML = allReviews.map((r) => `
    <tr>
      <td><strong>${escapeHtml(r.name || "অজ্ঞাত")}</strong></td>
      <td>${escapeHtml(r.books ? r.books.title : "N/A")}</td>
      <td>${"★".repeat(r.rating || 5)} (${toBanglaNumber(r.rating || 5)})</td>
      <td><p style="max-width:320px; font-size:0.9rem; margin:0;">"${escapeHtml(r.comment || "")}"</p></td>
      <td>
        <span class="status-badge ${r.approved ? 'status-paid' : 'status-pending'}">
          ${r.approved ? 'অনুমোদিত' : 'অপেক্ষমান'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.85rem;" onclick="toggleReviewApproval('${r.id}', ${!r.approved})">
          ${r.approved ? 'হাইড করুন' : 'অনুমোদন দিন'}
        </button>
      </td>
    </tr>
  `).join("");
}

window.toggleReviewApproval = async function(reviewId, approved) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from("reviews")
      .update({ approved: approved })
      .eq("id", reviewId);

    if (error) throw error;
    await fetchReviews();
    renderReviewsTable();
  } catch (err) {
    alert("রিভিউ আপডেট করতে সমস্যা হয়েছে: " + err.message);
  }
};

/**
 * 8. Dashboard Tabs Switching
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
