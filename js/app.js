import { auth } from "./firebase-init.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import * as data from "./data.js";
import * as currency from "./currency.js";
import { CATEGORY_ICONS, formatCurrency, showToast, openModal, renderNetWorthChart, renderAllocationChart, ALLOCATION_COLORS } from "./ui.js";
import { initTheme, toggleTheme, initSidebar, toggleSidebar } from "./theme.js";

/* ------------------------------- state ---------------------------------- */
const state = {
  uid: null,
  email: null,
  categories: [],
  range: "1m", // '1m' | '3m' | '6m' | '1y' | 'all'
  currency: currency.getCurrency(),
  rates: { SGD: 1 },
};

// Converts a base-currency amount to the currently selected display
// currency and formats it. Every rendered money figure should go through
// this rather than calling formatCurrency directly.
function fmt(baseValue) {
  return formatCurrency(currency.convertFromBase(baseValue, state.currency, state.rates), state.currency);
}

/* ------------------------------ elements --------------------------------- */
const viewLogin = document.getElementById("view-login");
const viewApp = document.getElementById("view-app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const sidebar = document.getElementById("sidebar");
const navList = document.getElementById("nav-list");
const greeting = document.getElementById("greeting");
const mainContent = document.getElementById("main-content");
const settingsPanel = document.getElementById("settings-panel");
const currencySelect = document.getElementById("currency-select");

/* -------------------------------- boot ------------------------------------ */
initTheme();
initSidebar(sidebar);

currencySelect.innerHTML = currency.SUPPORTED_CURRENCIES.map((c) => `<option value="${c}">${c}</option>`).join("");
currencySelect.value = state.currency;
currencySelect.addEventListener("change", () => {
  state.currency = currencySelect.value;
  currency.setCurrency(state.currency);
  router();
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.uid = user.uid;
    state.email = user.email;
    viewLogin.classList.add("hidden");
    viewApp.classList.remove("hidden");
    greeting.textContent = `Hi, ${user.displayName || nameFromEmail(user.email)}!`;
    await data.touchUserDoc(user.uid, user.email).catch(() => {});
    await data.ensureSeedData(user.uid);
    await refreshCategories();

    const { rates, ok } = await currency.loadRates();
    state.rates = rates;
    if (!ok && state.currency !== "SGD") {
      showToast("Couldn't fetch live exchange rates — figures may not be converted.");
    }

    if (!location.hash || location.hash === "#/login") location.hash = "#/dashboard";
    router();
  } else {
    state.uid = null;
    viewApp.classList.add("hidden");
    viewLogin.classList.remove("hidden");
  }
});

function nameFromEmail(email) {
  const local = (email || "").split("@")[0] || "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/* -------------------------------- login ------------------------------------ */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (err) {
    loginError.textContent = "Invalid email or password.";
  } finally {
    submitBtn.disabled = false;
  }
});

/* --------------------------------- topbar ---------------------------------- */
document.getElementById("theme-switch").addEventListener("click", () => {
  toggleTheme();
  // Re-render current view so the chart re-colors to the new theme.
  router();
});

document.getElementById("btn-collapse").addEventListener("click", () => toggleSidebar(sidebar));

const btnSettings = document.getElementById("btn-settings");
btnSettings.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!settingsPanel.contains(e.target) && e.target !== btnSettings) {
    settingsPanel.classList.add("hidden");
  }
  const catPanel = document.getElementById("category-filter-panel");
  const catBtn = document.getElementById("btn-category-filter");
  if (catPanel && !catPanel.contains(e.target) && e.target !== catBtn) {
    catPanel.classList.add("hidden");
  }
});

document.getElementById("btn-sign-out").addEventListener("click", async () => {
  settingsPanel.classList.add("hidden");
  await signOut(auth);
  location.hash = "";
});

// Android/Chrome/Edge fire this instead of showing their own install UI
// automatically; capturing it lets us offer an explicit "Install app"
// button rather than relying on the person to find it in a browser menu.
// iOS Safari never fires this event, so the button simply stays hidden there.
let deferredInstallPrompt = null;
const installBtn = document.getElementById("btn-install-app");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.classList.remove("hidden");
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  settingsPanel.classList.add("hidden");
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.classList.add("hidden");
  if (outcome === "accepted") showToast("Installed — find it on your home screen.");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installBtn.classList.add("hidden");
});

document.getElementById("btn-change-username").addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
  openChangeUsernameModal();
});

function openChangeUsernameModal() {
  const current = auth.currentUser.displayName || "";
  const { root, close } = openModal({
    title: "Change username",
    bodyHtml: `
      <form id="username-form">
        <div class="field">
          <label for="username-input">Display name</label>
          <input id="username-input" type="text" maxlength="40" required value="${escapeHtml(current)}" placeholder="e.g. Alex" />
        </div>
        <p class="modal-error" id="username-error"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary" style="width:auto">Save</button>
        </div>
      </form>
    `,
  });

  root.querySelector("#username-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = root.querySelector("#username-input").value.trim();
    const errorEl = root.querySelector("#username-error");
    if (!name) return;
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      greeting.textContent = `Hi, ${name}!`;
      close();
      showToast("Username updated.");
    } catch (err) {
      errorEl.textContent = "Couldn't update username — try again.";
    }
  });
}

document.getElementById("btn-change-password").addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
  openChangePasswordModal();
});

function openChangePasswordModal() {
  const { root, close } = openModal({
    title: "Change password",
    bodyHtml: `
      <form id="pw-form">
        <div class="field">
          <label for="pw-current">Current password</label>
          <input id="pw-current" type="password" autocomplete="current-password" required />
        </div>
        <div class="field">
          <label for="pw-new">New password</label>
          <input id="pw-new" type="password" autocomplete="new-password" minlength="6" required />
        </div>
        <div class="field">
          <label for="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" type="password" autocomplete="new-password" minlength="6" required />
        </div>
        <p class="modal-error" id="pw-error"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary" style="width:auto">Update password</button>
        </div>
      </form>
    `,
  });

  root.querySelector("#pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = root.querySelector("#pw-error");
    const current = root.querySelector("#pw-current").value;
    const next = root.querySelector("#pw-new").value;
    const confirm = root.querySelector("#pw-confirm").value;
    if (next !== confirm) {
      errorEl.textContent = "New passwords don't match.";
      return;
    }
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, current);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, next);
      close();
      showToast("Password updated.");
    } catch (err) {
      errorEl.textContent = "Couldn't update password — check your current password and try again.";
    }
  });
}

/* -------------------------------- routing ----------------------------------- */
window.addEventListener("hashchange", router);

function router() {
  if (!state.uid) return;
  const hash = location.hash || "#/dashboard";
  renderSidebar(hash);
  const catMatch = hash.match(/^#\/category\/(.+)$/);
  if (catMatch) {
    renderCategoryView(decodeURIComponent(catMatch[1]));
  } else {
    renderDashboardView();
  }
}

/* -------------------------------- sidebar ------------------------------------ */
async function refreshCategories() {
  state.categories = await data.getCategories(state.uid);
}

function renderSidebar(hash) {
  const activeCatId = (hash.match(/^#\/category\/(.+)$/) || [])[1];
  const isDashboard = !activeCatId;

  const rows = [
    `<div class="nav-item ${isDashboard ? "active" : ""}" data-route="#/dashboard">
       <span class="nav-icon">🏠</span><span class="nav-label">Dashboard</span>
     </div>`,
    ...state.categories.map(
      (c) => `
      <div class="nav-item ${c.id === decodeURIComponent(activeCatId || "") ? "active" : ""}" data-route="#/category/${encodeURIComponent(c.id)}">
        <span class="nav-icon">${c.icon}</span><span class="nav-label">${escapeHtml(c.name)}</span>
        <button class="nav-delete" data-delete-category="${c.id}" title="Delete category" aria-label="Delete ${escapeHtml(c.name)}">×</button>
      </div>`
    ),
  ];
  navList.innerHTML = rows.join("");

  navList.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete-category]")) return;
      location.hash = el.dataset.route;
    });
  });
  navList.querySelectorAll("[data-delete-category]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.deleteCategory;
      const cat = state.categories.find((c) => c.id === catId);
      if (!confirm(`Delete "${cat?.name}" and everything in it? This can't be undone.`)) return;
      await data.deleteCategoryDeep(state.uid, catId);
      await refreshCategories();
      if (decodeURIComponent(activeCatId || "") === catId) location.hash = "#/dashboard";
      else router();
      showToast(`Deleted "${cat?.name}".`);
    });
  });
}

document.getElementById("btn-add-category").addEventListener("click", openAddCategoryModal);

function openAddCategoryModal() {
  let selectedIcon = CATEGORY_ICONS[0];
  const { root, close } = openModal({
    title: "Add category",
    bodyHtml: `
      <form id="cat-form">
        <div class="field">
          <label for="cat-name">Name</label>
          <input id="cat-name" type="text" maxlength="30" required placeholder="e.g. Property" />
        </div>
        <div class="field">
          <label>Icon</label>
          <div class="icon-grid" id="icon-grid">
            ${CATEGORY_ICONS.map((ic, i) => `<button type="button" data-icon="${ic}" class="${i === 0 ? "selected" : ""}">${ic}</button>`).join("")}
          </div>
        </div>
        <p class="modal-error" id="cat-error"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary" style="width:auto">Add category</button>
        </div>
      </form>
    `,
  });

  root.querySelectorAll("#icon-grid button").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedIcon = btn.dataset.icon;
      root.querySelectorAll("#icon-grid button").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  root.querySelector("#cat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = root.querySelector("#cat-name").value.trim();
    if (!name) return;
    const ref = await data.addCategory(state.uid, { name, icon: selectedIcon });
    await refreshCategories();
    close();
    location.hash = `#/category/${encodeURIComponent(ref.id)}`;
    showToast(`Added "${name}".`);
  });
}

/* ------------------------------- dashboard ------------------------------------ */
const RANGE_DAYS = { "1m": 30, "3m": 90, "6m": 182, "1y": 365, all: null };
const RANGE_LABELS = { "1m": "1m", "3m": "3m", "6m": "6m", "1y": "1y", all: "All" };
const EXCLUDED_CATS_KEY = "assetTracker.excludedCategories";
let dashboardDonutScope = "__all__"; // '__all__' | a category id

function getExcludedCategoryIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXCLUDED_CATS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveExcludedCategoryIds(set) {
  localStorage.setItem(EXCLUDED_CATS_KEY, JSON.stringify([...set]));
}

async function renderDashboardView() {
  const excluded = getExcludedCategoryIds();
  dashboardDonutScope = "__all__";

  mainContent.innerHTML = `
    <div class="stat-row">
      <div class="stat-column">
        <div class="ledger-plate stat-card">
          <span class="eyebrow">Your net worth</span>
          <span class="figure" id="stat-networth">…</span>
          <div class="cat-filter-wrap">
            <button class="btn btn-ghost cat-filter-btn" id="btn-category-filter" type="button">
              <span id="cat-filter-label">All categories</span> ▾
            </button>
            <div class="ledger-plate cat-filter-panel hidden" id="category-filter-panel">
              ${state.categories
                .map(
                  (c) => `
                <label class="cat-filter-row">
                  <input type="checkbox" data-cat-id="${c.id}" ${excluded.has(c.id) ? "" : "checked"} />
                  <span>${c.icon} ${escapeHtml(c.name)}</span>
                </label>`
                )
                .join("")}
              <div class="cat-filter-actions">
                <button type="button" id="cf-select-all">All</button>
                <button type="button" id="cf-select-none">None</button>
              </div>
            </div>
          </div>
        </div>
        <div class="ledger-plate stat-card">
          <span class="eyebrow">Performance</span>
          <span class="figure small" id="stat-performance">…</span>
          <div class="range-toggle" id="range-toggle">
            ${Object.keys(RANGE_DAYS)
              .map((r) => `<button data-range="${r}" class="${state.range === r ? "active" : ""}">${RANGE_LABELS[r]}</button>`)
              .join("")}
          </div>
        </div>
      </div>

      <div class="ledger-plate donut-card">
        <div class="donut-card-head">
          <span class="eyebrow">Allocation</span>
          <select class="donut-scope-select" id="donut-scope-select" aria-label="Allocation breakdown">
            <option value="__all__">All categories</option>
            ${state.categories.map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="donut-wrap"><canvas id="allocation-chart"></canvas></div>
        <div class="donut-legend" id="donut-legend"></div>
      </div>
    </div>

    <div class="ledger-plate chart-card">
      <div class="chart-wrap"><canvas id="networth-chart"></canvas></div>
      <p class="empty-note" id="chart-note"></p>
    </div>

    <div class="ledger-plate table-card">
      <div class="table-card-head">
        <span class="eyebrow">Net worth history</span>
        <button class="btn btn-ghost" id="btn-delete-old" type="button">Delete data older than 1 year</button>
      </div>
      <div id="history-table-wrap"></div>
    </div>
  `;

  document.getElementById("range-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    state.range = btn.dataset.range;
    btn.parentElement.querySelectorAll("button[data-range]").forEach((b) => b.classList.toggle("active", b === btn));
    refreshDashboardNumbers();
  });

  document.getElementById("donut-scope-select").addEventListener("change", (e) => {
    dashboardDonutScope = e.target.value;
    refreshAllocationChart();
  });

  const filterBtn = document.getElementById("btn-category-filter");
  const filterPanel = document.getElementById("category-filter-panel");
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    filterPanel.classList.toggle("hidden");
  });
  filterPanel.querySelectorAll("input[data-cat-id]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const ex = getExcludedCategoryIds();
      if (cb.checked) ex.delete(cb.dataset.catId);
      else ex.add(cb.dataset.catId);
      saveExcludedCategoryIds(ex);
      refreshDashboardNumbers();
    });
  });
  document.getElementById("cf-select-all").addEventListener("click", () => {
    saveExcludedCategoryIds(new Set());
    filterPanel.querySelectorAll("input[data-cat-id]").forEach((cb) => (cb.checked = true));
    refreshDashboardNumbers();
  });
  document.getElementById("cf-select-none").addEventListener("click", () => {
    saveExcludedCategoryIds(new Set(state.categories.map((c) => c.id)));
    filterPanel.querySelectorAll("input[data-cat-id]").forEach((cb) => (cb.checked = false));
    refreshDashboardNumbers();
  });

  document.getElementById("btn-delete-old").addEventListener("click", async () => {
    if (!confirm("Delete all net worth history older than 1 year? This can't be undone.")) return;
    const cutoff = isoDaysAgo(365);
    const count = await data.deleteOldSnapshots(state.uid, cutoff);
    showToast(count ? `Deleted ${count} entr${count === 1 ? "y" : "ies"} older than 1 year.` : "No history older than 1 year.");
    await refreshDashboardNumbers();
  });

  await refreshDashboardNumbers();
}

function updateCategoryFilterLabel() {
  const excluded = getExcludedCategoryIds();
  const labelEl = document.getElementById("cat-filter-label");
  if (!labelEl) return;
  const includedCount = state.categories.length - excluded.size;
  labelEl.textContent =
    excluded.size === 0
      ? "All categories"
      : includedCount === 0
      ? "No categories"
      : `${includedCount} of ${state.categories.length} categories`;
}

// Recomputes the net-worth figure, performance figure, and chart for the
// currently selected range + category filter, without rebuilding the
// surrounding controls (so the dropdown/range-toggle state is preserved).
async function refreshDashboardNumbers() {
  updateCategoryFilterLabel();
  const excluded = getExcludedCategoryIds();
  const includedIds = state.categories.map((c) => c.id).filter((id) => !excluded.has(id));

  const { total, perCategory } = await data.getNetWorth(state.uid);
  const filteredTotal = includedIds.reduce((sum, id) => sum + (perCategory[id] || 0), 0);

  const netWorthEl = document.getElementById("stat-networth");
  netWorthEl.classList.remove("negative");
  netWorthEl.textContent = fmt(filteredTotal);
  if (filteredTotal < 0) netWorthEl.classList.add("negative");

  const days = RANGE_DAYS[state.range];
  const sinceDate = days ? isoDaysAgo(days) : null;
  const snapshots = await data.getSnapshots(state.uid, sinceDate);

  // For each historical snapshot, total up only the included categories.
  // Snapshots recorded before the per-category breakdown existed fall back
  // to their overall total (best effort) rather than showing as zero.
  const allIncluded = excluded.size === 0;
  const filteredSnapshots = snapshots.map((s) => ({
    date: s.date,
    total: allIncluded ? s.total : s.perCategory ? includedIds.reduce((sum, id) => sum + (s.perCategory[id] || 0), 0) : s.total,
  }));

  const perfEl = document.getElementById("stat-performance");
  perfEl.classList.remove("positive", "negative", "empty-note");
  if (filteredSnapshots.length >= 2) {
    const change = filteredSnapshots[filteredSnapshots.length - 1].total - filteredSnapshots[0].total;
    perfEl.textContent = fmt(change);
    perfEl.classList.add(change >= 0 ? "positive" : "negative");
  } else {
    perfEl.textContent = "Not enough data yet";
    perfEl.classList.add("empty-note");
  }

  const chartWrap = document.querySelector(".chart-wrap");
  const chartNote = document.getElementById("chart-note");
  chartNote.textContent = "";
  const displaySnapshots = filteredSnapshots.map((s) => ({
    date: s.date,
    total: currency.convertFromBase(s.total, state.currency, state.rates),
  }));
  if (displaySnapshots.length === 0) {
    chartWrap.innerHTML = `<p class="empty-note">No history yet — edit an item to start tracking your net worth over time.</p>`;
  } else {
    if (!document.getElementById("networth-chart")) {
      chartWrap.innerHTML = `<canvas id="networth-chart"></canvas>`;
    }
    renderNetWorthChart(document.getElementById("networth-chart"), displaySnapshots, state.currency);
    if (displaySnapshots.length === 1) {
      chartNote.textContent = "Only one day of history so far — the line fills in as you keep updating values on different days.";
    }
  }

  renderHistoryTable(displaySnapshots);
  await refreshAllocationChart();
}

// Draws the allocation donut. In "__all__" scope it shows each included
// category's share of net worth; when scoped to a specific category it
// drills into that category's individual items instead.
async function refreshAllocationChart() {
  const canvas = document.getElementById("allocation-chart");
  const legendEl = document.getElementById("donut-legend");
  if (!canvas || !legendEl) return;

  let entries = []; // [{ label, value }]

  if (dashboardDonutScope === "__all__") {
    const excluded = getExcludedCategoryIds();
    const included = state.categories.filter((c) => !excluded.has(c.id));
    const { perCategory } = await data.getNetWorth(state.uid);
    entries = included.map((c) => ({ label: `${c.icon} ${c.name}`, value: perCategory[c.id] || 0 }));
  } else {
    const cat = state.categories.find((c) => c.id === dashboardDonutScope);
    if (!cat) {
      dashboardDonutScope = "__all__";
      const sel = document.getElementById("donut-scope-select");
      if (sel) sel.value = "__all__";
      return refreshAllocationChart();
    }
    const items = await data.getCategoryItemsFlat(state.uid, cat.id);
    const multipleSections = new Set(items.map((it) => it.sectionName)).size > 1;
    entries = items.map((it) => ({
      label: multipleSections ? `${it.name} (${it.sectionName})` : it.name,
      value: it.value,
    }));
  }

  entries = entries.filter((e) => e.value !== 0);

  if (entries.length === 0) {
    if (canvas._chartInstance) {
      canvas._chartInstance.destroy();
      canvas._chartInstance = null;
    }
    legendEl.innerHTML = `<p class="empty-note">Nothing to show yet.</p>`;
    return;
  }

  const magnitudeSum = entries.reduce((sum, e) => sum + Math.abs(e.value), 0);
  renderAllocationChart(
    document.getElementById("allocation-chart"),
    entries.map((e) => e.label),
    entries.map((e) => e.value)
  );

  legendEl.innerHTML = entries
    .map((e, i) => {
      const pct = magnitudeSum ? (Math.abs(e.value) / magnitudeSum) * 100 : 0;
      const sign = e.value < 0 ? "-" : "";
      return `
      <div class="donut-legend-row">
        <span class="swatch" style="background:${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]}"></span>
        <span class="legend-label">${escapeHtml(e.label)}</span>
        <span class="legend-pct ${e.value < 0 ? "negative" : ""}">${sign}${pct.toFixed(1)}%</span>
      </div>`;
    })
    .join("");
}

function renderHistoryTable(displaySnapshots) {
  const wrap = document.getElementById("history-table-wrap");
  if (!wrap) return;

  if (displaySnapshots.length === 0) {
    wrap.innerHTML = `<p class="empty-note">No history yet.</p>`;
    return;
  }

  const rows = [...displaySnapshots].reverse(); // most recent first
  wrap.innerHTML =
    `<div class="history-row history-header"><span>Date</span><span>Net worth</span></div>` +
    rows
      .map(
        (s) => `
      <div class="history-row">
        <span>${formatDateLabel(s.date)}</span>
        <span class="figure ${s.total < 0 ? "negative" : ""}">${formatCurrency(s.total, state.currency)}</span>
      </div>`
      )
      .join("");
}

function formatDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------- category view --------------------------------- */
async function renderCategoryView(catId) {
  const cat = state.categories.find((c) => c.id === catId);
  if (!cat) {
    location.hash = "#/dashboard";
    return;
  }

  mainContent.innerHTML = `
    <div class="category-head">
      <h1 class="category-title"><span>${cat.icon}</span>${escapeHtml(cat.name)}</h1>
    </div>
    <div class="section-tabs" id="section-tabs"></div>
    <div class="section-total" id="section-total"></div>
    <div class="item-list" id="item-list"></div>
    <button class="add-item-btn hidden" id="btn-add-item" title="Add item" aria-label="Add item">＋</button>
  `;

  let sections = await data.getSections(state.uid, catId);
  let activeSectionId = sections[0]?.id || null;

  async function renderTabs() {
    const tabsEl = document.getElementById("section-tabs");
    tabsEl.innerHTML =
      sections
        .map(
          (s) => `
        <div class="section-tab ${s.id === activeSectionId ? "active" : ""}" data-section="${s.id}">
          <span>${escapeHtml(s.name)}</span>
          <button class="tab-delete" data-delete-section="${s.id}" title="Delete section" aria-label="Delete ${escapeHtml(s.name)}">×</button>
        </div>`
        )
        .join("") + `<button class="add-tab-btn" id="btn-add-section" title="Add section" aria-label="Add section">＋</button>`;

    tabsEl.querySelectorAll(".section-tab").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-delete-section]")) return;
        activeSectionId = el.dataset.section;
        renderTabs();
        renderItems();
      });
    });
    tabsEl.querySelectorAll("[data-delete-section]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const secId = btn.dataset.deleteSection;
        const sec = sections.find((s) => s.id === secId);
        if (!confirm(`Delete section "${sec?.name}" and its items?`)) return;
        await data.deleteSectionDeep(state.uid, catId, secId);
        sections = await data.getSections(state.uid, catId);
        if (activeSectionId === secId) activeSectionId = sections[0]?.id || null;
        await renderTabs();
        await renderItems();
        showToast(`Deleted "${sec?.name}".`);
      });
    });

    document.getElementById("btn-add-section")?.addEventListener("click", () => {
      openAddSectionModal(async (name) => {
        await data.addSection(state.uid, catId, name);
        sections = await data.getSections(state.uid, catId);
        activeSectionId = sections[sections.length - 1].id;
        await renderTabs();
        await renderItems();
      });
    });
  }

  async function renderItems() {
    const listEl = document.getElementById("item-list");
    const totalEl = document.getElementById("section-total");
    const addBtn = document.getElementById("btn-add-item");

    if (!activeSectionId) {
      listEl.innerHTML = `<p class="empty-note">No sections yet — add one above to start entering values.</p>`;
      totalEl.textContent = "";
      addBtn.classList.add("hidden");
      return;
    }
    addBtn.classList.remove("hidden");

    const items = await data.getItems(state.uid, catId, activeSectionId);
    const total = items.reduce((sum, it) => sum + (Number(it.value) || 0), 0);
    totalEl.innerHTML = `Total <span class="figure ${total < 0 ? "negative" : ""}">${fmt(total)}</span>`;

    listEl.innerHTML = items.length
      ? items
          .map(
            (it) => `
        <div class="ledger-plate item-row" data-item="${it.id}">
          <span class="item-name">${escapeHtml(it.name)}</span>
          <div class="item-value-wrap">
            <span class="figure item-value">${fmt(it.value)}</span>
            <button class="icon-btn" data-edit="${it.id}" title="Edit" aria-label="Edit ${escapeHtml(it.name)}">✎</button>
            <button class="item-delete" data-delete-item="${it.id}" title="Delete" aria-label="Delete ${escapeHtml(it.name)}">🗑</button>
          </div>
        </div>`
          )
          .join("")
      : `<p class="empty-note">No items yet — add one below.</p>`;

    listEl.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => beginEditItem(btn.dataset.edit, items));
    });
    listEl.querySelectorAll("[data-delete-item]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const it = items.find((i) => i.id === btn.dataset.deleteItem);
        if (!confirm(`Delete "${it?.name}"?`)) return;
        await data.deleteItem(state.uid, catId, activeSectionId, btn.dataset.deleteItem);
        await afterMutation();
        showToast(`Deleted "${it?.name}".`);
      });
    });
  }

  function beginEditItem(itemId, items) {
    const it = items.find((i) => i.id === itemId);
    const row = document.querySelector(`[data-item="${itemId}"]`);
    const wrap = row.querySelector(".item-value-wrap");
    const displayValue = currency.convertFromBase(it.value, state.currency, state.rates);
    wrap.innerHTML = `
      <input type="number" step="0.01" class="item-value-input" id="edit-input-${itemId}" value="${displayValue.toFixed(2)}" />
      <button class="icon-btn" data-save="${itemId}" title="Save" aria-label="Save">✓</button>
    `;
    const input = wrap.querySelector("input");
    input.focus();
    input.select();

    const save = async () => {
      const displayVal = parseFloat(input.value);
      if (Number.isNaN(displayVal)) return;
      const baseVal = currency.convertToBase(displayVal, state.currency, state.rates);
      await data.updateItemValue(state.uid, catId, activeSectionId, itemId, baseVal);
      await afterMutation();
    };

    wrap.querySelector("[data-save]").addEventListener("click", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
      if (e.key === "Escape") renderItems();
    });
  }

  async function afterMutation() {
    await renderItems();
    const { total, perCategory } = await data.getNetWorth(state.uid);
    await data.recordSnapshot(state.uid, total, perCategory);
  }

  document.getElementById("btn-add-item").addEventListener("click", () => {
    if (!activeSectionId) return;
    openAddItemModal(async (name, value) => {
      await data.addItem(state.uid, catId, activeSectionId, { name, value });
      await afterMutation();
    });
  });

  await renderTabs();
  await renderItems();
}

function openAddSectionModal(onSubmit) {
  const { root, close } = openModal({
    title: "Add section",
    bodyHtml: `
      <form id="sec-form">
        <div class="field">
          <label for="sec-name">Name</label>
          <input id="sec-name" type="text" maxlength="30" required placeholder="e.g. IBKR" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary" style="width:auto">Add section</button>
        </div>
      </form>
    `,
  });
  root.querySelector("#sec-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = root.querySelector("#sec-name").value.trim();
    if (!name) return;
    close();
    await onSubmit(name);
  });
}

function openAddItemModal(onSubmit) {
  const { root, close } = openModal({
    title: "Add item",
    bodyHtml: `
      <form id="item-form">
        <div class="field">
          <label for="item-name">Name</label>
          <input id="item-name" type="text" maxlength="40" required placeholder="e.g. VWRA" />
        </div>
        <div class="field">
          <label for="item-value">Value in ${state.currency} (negative for liabilities)</label>
          <input id="item-value" type="number" step="0.01" required placeholder="e.g. -10000.12" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
          <button type="submit" class="btn btn-primary" style="width:auto">Add item</button>
        </div>
      </form>
    `,
  });
  root.querySelector("#item-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = root.querySelector("#item-name").value.trim();
    const displayValue = parseFloat(root.querySelector("#item-value").value);
    if (!name || Number.isNaN(displayValue)) return;
    const baseValue = currency.convertToBase(displayValue, state.currency, state.rates);
    close();
    await onSubmit(name, baseValue);
  });
}

/* -------------------------------- utils ----------------------------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
