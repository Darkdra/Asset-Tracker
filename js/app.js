import { auth } from "./firebase-init.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import * as data from "./data.js";
import { CATEGORY_ICONS, formatCurrency, showToast, openModal, renderNetWorthChart } from "./ui.js";
import { initTheme, toggleTheme, initSidebar, toggleSidebar } from "./theme.js";

/* ------------------------------- state ---------------------------------- */
const state = {
  uid: null,
  email: null,
  categories: [],
  range: "1m", // '1m' | '3m' | 'all'
};

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

/* -------------------------------- boot ------------------------------------ */
initTheme();
initSidebar(sidebar);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.uid = user.uid;
    state.email = user.email;
    viewLogin.classList.add("hidden");
    viewApp.classList.remove("hidden");
    greeting.textContent = `Hi, ${nameFromEmail(user.email)}!`;
    await data.touchUserDoc(user.uid, user.email).catch(() => {});
    await data.ensureSeedData(user.uid);
    await refreshCategories();
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
});

document.getElementById("btn-sign-out").addEventListener("click", async () => {
  settingsPanel.classList.add("hidden");
  await signOut(auth);
  location.hash = "";
});

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
const RANGE_DAYS = { "1m": 30, "3m": 90, all: null };

async function renderDashboardView() {
  mainContent.innerHTML = `
    <div class="stat-row">
      <div class="ledger-plate stat-card">
        <span class="eyebrow">Your net worth</span>
        <span class="figure" id="stat-networth">…</span>
      </div>
      <div class="ledger-plate stat-card">
        <span class="eyebrow">Performance</span>
        <span class="figure small" id="stat-performance">…</span>
        <div class="range-toggle" id="range-toggle">
          <button data-range="1m" class="${state.range === "1m" ? "active" : ""}">1m</button>
          <button data-range="3m" class="${state.range === "3m" ? "active" : ""}">3m</button>
          <button data-range="all" class="${state.range === "all" ? "active" : ""}">All</button>
        </div>
      </div>
    </div>

    <div class="ledger-plate chart-card">
      <span class="eyebrow">SGD in K</span>
      <div class="chart-wrap"><canvas id="networth-chart"></canvas></div>
      <p class="empty-note" id="chart-note"></p>
    </div>
  `;

  document.getElementById("range-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    state.range = btn.dataset.range;
    renderDashboardView();
  });

  const { total } = await data.getNetWorth(state.uid);
  const netWorthEl = document.getElementById("stat-networth");
  netWorthEl.textContent = formatCurrency(total);
  if (total < 0) netWorthEl.classList.add("negative");

  const days = RANGE_DAYS[state.range];
  const sinceDate = days ? isoDaysAgo(days) : null;
  const snapshots = await data.getSnapshots(state.uid, sinceDate);

  const perfEl = document.getElementById("stat-performance");
  if (snapshots.length >= 2) {
    const change = snapshots[snapshots.length - 1].total - snapshots[0].total;
    perfEl.textContent = formatCurrency(change);
    perfEl.classList.add(change >= 0 ? "positive" : "negative");
  } else {
    perfEl.textContent = "Not enough data yet";
    perfEl.classList.add("empty-note");
  }

  const chartWrap = document.querySelector(".chart-wrap");
  const chartNote = document.getElementById("chart-note");
  if (snapshots.length === 0) {
    chartWrap.innerHTML = `<p class="empty-note">No history yet — edit an item to start tracking your net worth over time.</p>`;
  } else {
    renderNetWorthChart(document.getElementById("networth-chart"), snapshots);
    if (snapshots.length === 1) {
      chartNote.textContent = "Only one day of history so far — the line fills in as you keep updating values on different days.";
    }
  }
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
    totalEl.innerHTML = `Total <span class="figure ${total < 0 ? "negative" : ""}">${formatCurrency(total)}</span>`;

    listEl.innerHTML = items.length
      ? items
          .map(
            (it) => `
        <div class="ledger-plate item-row" data-item="${it.id}">
          <span class="item-name">${escapeHtml(it.name)}</span>
          <div class="item-value-wrap">
            <span class="figure item-value">${formatCurrency(it.value)}</span>
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
    wrap.innerHTML = `
      <input type="number" step="0.01" class="item-value-input" id="edit-input-${itemId}" value="${it.value}" />
      <button class="icon-btn" data-save="${itemId}" title="Save" aria-label="Save">✓</button>
    `;
    const input = wrap.querySelector("input");
    input.focus();
    input.select();

    const save = async () => {
      const val = parseFloat(input.value);
      if (Number.isNaN(val)) return;
      await data.updateItemValue(state.uid, catId, activeSectionId, itemId, val);
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
    const { total } = await data.getNetWorth(state.uid);
    await data.recordSnapshot(state.uid, total);
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
          <label for="item-value">Value (SGD — negative for liabilities)</label>
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
    const value = parseFloat(root.querySelector("#item-value").value);
    if (!name || Number.isNaN(value)) return;
    close();
    await onSubmit(name, value);
  });
}

/* -------------------------------- utils ----------------------------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
