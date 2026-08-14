export const CATEGORY_ICONS = ["🏦", "📈", "💰", "🏠", "💳", "🚗", "💎", "🪙", "🏢", "✈️", "📊", "💼"];

export function formatCurrency(value, currency = "SGD") {
  const n = Number(value) || 0;
  const abs = Math.abs(n).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${n < 0 ? "-" : ""}$${abs}`;
}

let toastTimer;
export function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("ledger-plate", "show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/**
 * Renders a modal. `bodyHtml` is the inner HTML for the form/content area.
 * Returns the modal root element so callers can wire up their own listeners.
 * Closes on backdrop click, Escape, or any element with [data-close-modal].
 */
export function openModal({ title, bodyHtml }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="ledger-plate modal" role="dialog" aria-modal="true" aria-label="${title}">
        <h2>${title}</h2>
        ${bodyHtml}
      </div>
    </div>
  `;
  const backdrop = document.getElementById("modal-backdrop");

  const close = () => {
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-modal]")) close();
  });
  document.addEventListener("keydown", onKey);

  return { root, close };
}

export function renderNetWorthChart(canvas, snapshots) {
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
  }
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();
  const text = styles.getPropertyValue("--text-faint").trim();
  const border = styles.getPropertyValue("--border").trim();

  const labels = snapshots.map((s) => {
    const [, m, d] = s.date.split("-");
    return `${m}/${d}`;
  });
  const values = snapshots.map((s) => Math.round((s.total || 0) / 1000));

  canvas._chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: accent,
          backgroundColor: accent,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          tension: 0.25,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, font: { family: "IBM Plex Mono", size: 11 } } },
        y: {
          grid: { color: border },
          ticks: { color: text, font: { family: "IBM Plex Mono", size: 11 }, callback: (v) => v },
          title: { display: true, text: "SGD in K", color: text, font: { family: "IBM Plex Mono", size: 11 } },
        },
      },
    },
  });
}
