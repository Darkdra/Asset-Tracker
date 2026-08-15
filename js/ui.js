export const CATEGORY_ICONS = ["🏦", "📈", "💰", "🏠", "💳", "🚗", "💎", "🪙", "🏢", "✈️", "📊", "💼"];

export function formatCurrency(value, currencyCode = "SGD") {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(n);
  } catch {
    // Unknown/unsupported currency code — fall back to a plain number.
    return `${currencyCode} ${n.toFixed(2)}`;
  }
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

export const ALLOCATION_COLORS = [
  "#ff1744", "#ffb700", "#17ff9e", "#00e5ff", "#c77dff",
  "#ff6ec7", "#fdd835", "#40c4ff", "#ff8a65", "#b2ff59",
];

export function renderAllocationChart(canvas, labels, values) {
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
  }
  const styles = getComputedStyle(document.documentElement);
  const bg = styles.getPropertyValue("--surface").trim();

  // Doughnut slices must be non-negative sizes; magnitude (not sign) drives
  // slice size, so a liability category still shows as a visible slice —
  // its sign is instead conveyed in the legend text next to it.
  const magnitudes = values.map((v) => Math.abs(v));

  canvas._chartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: magnitudes,
          backgroundColor: labels.map((_, i) => ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]),
          borderColor: bg,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { display: false } },
    },
  });
}

export function renderNetWorthChart(canvas, snapshots, currencyCode = "SGD") {
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

  // Gives the line a neon-sign glow by applying a canvas shadow while the
  // dataset is drawn, then clearing it so it doesn't bleed into the axes.
  const neonGlowPlugin = {
    id: "neonGlow",
    beforeDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 14;
    },
    afterDatasetsDraw(chart) {
      chart.ctx.restore();
    },
  };

  canvas._chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: accent,
          backgroundColor: accent,
          pointRadius: values.length > 1 ? 0 : 4,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.25,
          fill: false,
        },
      ],
    },
    plugins: [neonGlowPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, font: { family: "IBM Plex Mono", size: 11 } } },
        y: {
          grid: { color: border },
          ticks: { color: text, font: { family: "IBM Plex Mono", size: 11 }, callback: (v) => v },
          title: { display: true, text: `${currencyCode} in K`, color: text, font: { family: "IBM Plex Mono", size: 11 } },
        },
      },
    },
  });
}
