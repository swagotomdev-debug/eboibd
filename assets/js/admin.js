/**
 * eboibd.site - Admin Dashboard Controller
 * - Supabase Auth & Direct Admin Session
 * - Full Supabase sync for Orders, Books (flat ৳99), and Reviews
 * - 1-Click Order Status Update (Pending -> Paid)
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
    is_active: true
  }));
}

async function fetchOrders() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        allOrders = data.map((o) => {
          let matchedBook = allBooks.find((b) => b.id === o.book_id || b.slug === o.book_id);
          if (!matchedBook && window.EBOI_CONFIG && window.EBOI_CONFIG.books) {
            matchedBook = window.EBOI_CONFIG.books["ai-income"];
          }
          return {
            ...o,
            books: matchedBook ? { title: matchedBook.title, slug: matchedBook.slug } : null
          };
        });
        return;
      }
    } catch (e) {
      console.warn("fetchOrders warning:", e);
    }
  }

  // Demo fallback orders
  loadLocalDemoOrders();
}

async function fetchReviews() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        allReviews = data.map((r) => {
          const b = allBooks.find((book) => book.id === r.book_id);
          return {
            ...r,
            books: b ? { title: b.title } : null
          };
        });
        return;
      }
    } catch (e) {
      console.warn("fetchReviews warning:", e);
    }
  }

  allReviews = [
    {
      id: "rev-01",
      name: "তানভীর আহমেদ",
      rating: 5,
      comment: "মাত্র ৯৯ টাকায় এই বইটি পাওয়া অবিশ্বাস্য! বাস্তব স্কিল শেখার জন্য দারুণ।",
      approved: true,
      books: { title: "AI দিয়ে ঘরে বসে আয়" }
    }
  ];
}

function loadLocalDemoOrders() {
  allOrders = [
    {
      id: "ord-8712-4a1b",
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      customer_name: "তানভীর আহমেদ",
      email: "tanvir.ahmed@gmail.com",
      phone: "01712345678",
      amount_bdt: 99,
      status: "paid",
      transaction_id: "TRX9827361",
      download_count: 1,
      books: { title: "AI দিয়ে ঘরে বসে আয়", slug: "ai-income" }
    },
    {
      id: "ord-6541-9c2d",
      created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
      paid_at: new Date(Date.now() - 3600000 * 3).toISOString(),
      customer_name: "রাকিবুল হাসান",
      email: "rakibul.h@yahoo.com",
      phone: "01823456789",
      amount_bdt: 99,
      status: "paid",
      transaction_id: "TRX5182903",
      download_count: 2,
      books: { title: "ফ্রিল্যান্সারের টাকা দেশে আনার পুরো গাইড ২০২৬", slug: "freelancer-payment" }
    },
    {
      id: "ord-3319-5e7f",
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      paid_at: null,
      customer_name: "নুসরাত জাহান",
      email: "nusrat.jahan@gmail.com",
      phone: "01934567890",
      amount_bdt: 99,
      status: "pending",
      transaction_id: null,
      download_count: 0,
      books: { title: "ফেসবুক পেজ থেকে ব্যবসা", slug: "facebook-business" }
    }
  ];
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
    salesMap[slug].revenue += Number(o.amount_bdt) || 99;
  });

  tbody.innerHTML = allBooks.map((b) => {
    const data = salesMap[b.slug] || { count: 0, revenue: 0 };
    return `
      <tr>
        <td><strong>${escapeHtml(b.title)}</strong></td>
        <td><code>/books/${escapeHtml(b.slug)}</code></td>
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
        (o.transaction_id && o.transaction_id.toLowerCase().includes(query)) ||
        (o.gateway_ref && o.gateway_ref.toLowerCase().includes(query));
      return matchStatus && matchQuery;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 30px;">কোনো অর্ডার পাওয়া যায়নি।</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((o) => {
      const isPaid = o.status === "paid" || o.status === "completed";
      const statusClass = isPaid ? "status-paid" : o.status === "pending" ? "status-pending" : "status-failed";
      const statusText = isPaid ? "পরিশোধিত" : o.status === "pending" ? "অপেক্ষমান" : "ব্যর্থ";
      const bookTitle = o.books ? o.books.title : "ইবুক";
      const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString("bn-BD") : "-";
      const customerIdentifier = o.phone || o.email || "";

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
                📚 লিংক কপি
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
  if (!confirm(`আপনি কি এই অর্ডারের স্ট্যাটাস "${newStatus}" করতে চান?`)) return;

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

  // Local fallback
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
 * 8. Sync All Book Prices to ৳99 in Supabase
 */
window.syncBookPricesToSupabase = async function() {
  if (!confirm("আপনি কি নিশ্চিত যে Supabase ডাটাবেজে সব বইয়ের মূল্য ৳৯৯ (99 BDT) এ সিঙ্ক করতে চান?")) return;

  const btn = document.getElementById("btn-sync-supabase");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "সিঙ্ক হচ্ছে...";
  }

  try {
    if (supabaseClient) {
      const slugs = ["ai-income", "freelancer-payment", "facebook-business", "ai-video-editing"];
      for (const slug of slugs) {
        await supabaseClient
          .from("books")
          .update({ price_bdt: 99.00 })
          .eq("slug", slug);
      }
    }

    alert("🎉 অভিনন্দন! Supabase ডাটাবেজে সব বইয়ের অফার মূল্য সফলভাবে ৳৯৯ এ সিঙ্ক সম্পন্ন হয়েছে।");
    await fetchBooks();
    renderBooksTable();
    renderSalesPerBook();
  } catch (err) {
    console.error("Sync error:", err);
    alert("Supabase সিঙ্ক করতে সমস্যা হয়েছে: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔄 Supabase-এ ৳৯৯ সিঙ্ক";
    }
  }
};

/**
 * 9. Books Table & Actions
 */
function renderBooksTable() {
  const tbody = document.getElementById("books-tbody");
  if (!tbody) return;

  tbody.innerHTML = allBooks.map((b) => `
    <tr>
      <td><img src="${b.cover_url || '/assets/images/' + b.slug + '-cover.webp'}" style="width:40px; border-radius:4px;" alt="Cover"></td>
      <td><strong>${escapeHtml(b.title)}</strong><br><small class="text-muted">Slug: ${escapeHtml(b.slug)}</small></td>
      <td>${toBanglaNumber(b.page_count || 25)} পেজ</td>
      <td><strong style="color: #059669; font-size:1.05rem;">৳${toBanglaNumber(b.price_bdt || 99)}</strong></td>
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
 * 10. Reviews Table & Moderation
 */
function renderReviewsTable() {
  const tbody = document.getElementById("reviews-tbody");
  if (!tbody) return;

  if (allReviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:30px;">কোনো রিভিউ পাওয়া যায়নি।</td></tr>`;
    return;
  }

  tbody.innerHTML = allReviews.map((r) => `
    <tr>
      <td><strong>${escapeHtml(r.name || "সম্মানিত পাঠক")}</strong></td>
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

/**
 * 11. Export Orders to CSV
 */
function exportOrdersToCSV(orders) {
  if (!orders || !orders.length) {
    alert("এক্সপোর্ট করার মতো কোনো অর্ডার পাওয়া যায়নি।");
    return;
  }

  const headers = ["Order ID", "Date", "Customer Name", "Email", "Phone", "Book", "Amount (BDT)", "Status", "Transaction ID"];
  const rows = orders.map((o) => [
    `"${o.id || ""}"`,
    `"${o.created_at || ""}"`,
    `"${(o.customer_name || "").replace(/"/g, '""')}"`,
    `"${o.email || ""}"`,
    `"${o.phone || ""}"`,
    `"${(o.books?.title || "").replace(/"/g, '""')}"`,
    o.amount_bdt || 99,
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
 * 12. Dashboard Tabs Switcher
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

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
