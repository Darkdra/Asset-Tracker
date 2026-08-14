const THEME_KEY = "assetTracker.theme";
const SIDEBAR_KEY = "assetTracker.sidebarCollapsed";

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
}

export function initSidebar(sidebarEl) {
  const collapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
  sidebarEl.classList.toggle("collapsed", collapsed);
}

export function toggleSidebar(sidebarEl) {
  const collapsed = sidebarEl.classList.toggle("collapsed");
  localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
}
