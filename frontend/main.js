const fallbackSeverityColors = {
  critical: "#e07a6a",
  urgent: "#e6a96a",
  stable: "#6aa89e"
};

const BRAND_NAME = "HelpHive";

const roleLabels = {
  ngo_admin: "NGO Admin",
  ngo_worker: "NGO Worker",
  volunteer: "Volunteer",
  csr: "CSR"
};

const roleHomes = {
  ngo_admin: "./admin.html",
  ngo_worker: "./report.html",
  volunteer: "./intelligence.html",
  csr: "./csr-dashboard.html"
};

const visibleTabsByRole = {
  ngo_admin: ["home", "intelligence", "admin_dashboard"],
  ngo_worker: ["home", "intelligence", "field_desk"],
  volunteer: ["home", "intelligence", "my_tasks"],
  csr: ["home"]
};

const allowedPageNavKeysByRole = {
  ngo_admin: ["home", "intelligence", "admin_dashboard"],
  ngo_worker: ["home", "intelligence", "field_desk"],
  volunteer: ["home", "intelligence", "my_tasks"],
  csr: ["home", "csr_dashboard"]
};

const roleNavigationTabs = {
  ngo_admin: {
    key: "admin_dashboard",
    label: "Admin Dashboard",
    href: "./admin.html"
  },
  ngo_worker: {
    key: "field_desk",
    label: "Field Desk",
    href: "./report.html"
  },
  volunteer: {
    key: "my_tasks",
    label: "My Tasks",
    href: "./intelligence.html"
  },
  csr: {
    key: "csr_dashboard",
    label: "CSR Dashboard",
    href: "./impact.html"
  }
};

const pageNavKeys = {
  "": "home",
  "/": "home",
  "/index.html": "home",
  "/intelligence.html": "intelligence",
  "/community.html": "community",
  "/impact.html": "impact",
  "/join.html": "join",
  "/admin-dashboard.html": "admin_dashboard",
  "/field-desk.html": "field_desk",
  "/my-tasks.html": "my_tasks",
  "/csr-dashboard.html": "csr_dashboard",
  "/admin.html": "admin_dashboard",
  "/report.html": "field_desk"
};

const API_URL = "";
const DEMO_LOCATION_STORAGE_KEY = "helpHiveDemoLocation";
const LEGACY_LOCATION_STORAGE_KEY = "location";
const DEFAULT_DEMO_LOCATION = {
  country: "India",
  state: "Maharashtra",
  city: "Pune"
};
const demoLocationsByCity = {
  Pune: DEFAULT_DEMO_LOCATION,
  Mumbai: {
    country: "India",
    state: "Maharashtra",
    city: "Mumbai"
  },
  Delhi: {
    country: "India",
    state: "Delhi",
    city: "Delhi"
  },
  Bangalore: {
    country: "India",
    state: "Karnataka",
    city: "Bangalore"
  }
};
let currentLocation = { ...DEFAULT_DEMO_LOCATION };
const cityContent = {
  Pune: {
    cityName: "Pune",
    wardLabel: "Pune wards",
    metaDescription:
      "HelpHive is a community support layer for ward insights, NGO coordination, volunteer matching, and real-time action across Pune wards.",
    examples: {
      water: "Shivajinagar water lane",
      sanitation: "Pimpri sanitation sweep",
      kitchen: "Kothrud volunteer kitchens"
    },
    homeWaterCluster: "Shivajinagar + Kasba",
    homeSanitationStatus: "Pimpri line sweep delayed",
    intelligenceDrilldownTitle: "Shivajinagar ward card",
    communityCtaCopy:
      "See how the civic network turns into real coverage, resolution, and reporting across Pune wards.",
    baseLocationPlaceholder: "Kothrud, Shivajinagar, Pimpri...",
    faqCityQuestion: "Can HelpHive work beyond Pune?",
    faqCityAnswer:
      "Yes. Pune is shown as the selected demo city, but HelpHive is designed for ward-level operations across Indian cities.",
    impactHeroAlt: "Community support scene in Pune",
    impactWaterDescription:
      "Refill gaps were surfaced earlier across Pune ward clusters, tanker routing stabilized, and household follow-ups stopped slipping past noon.",
    impactSanitationDescription:
      "Overflow reports lined up with route coverage across Pune, giving partner teams one clear cleanup picture instead of conflicting notes.",
    impactKitchenDescription:
      "Matching tightened around availability and prep training in Pune, which improved evening support consistency."
  },
  Mumbai: {
    cityName: "Mumbai",
    wardLabel: "Mumbai wards",
    metaDescription:
      "HelpHive is a community support layer for ward insights, NGO coordination, volunteer matching, and real-time action across Mumbai wards.",
    examples: {
      water: "Dharavi water access lane",
      sanitation: "Andheri sanitation sweep",
      kitchen: "Dadar volunteer kitchens"
    },
    homeWaterCluster: "Dharavi + Mahim",
    homeSanitationStatus: "Andheri line sweep delayed",
    intelligenceDrilldownTitle: "Dharavi ward card",
    communityCtaCopy:
      "See how the civic network turns into real coverage, resolution, and reporting across Mumbai wards.",
    baseLocationPlaceholder: "Dharavi, Andheri, Dadar...",
    faqCityQuestion: "Can HelpHive work beyond Mumbai?",
    faqCityAnswer:
      "Yes. Mumbai is shown as the selected demo city, but HelpHive is designed for ward-level operations across Indian cities.",
    impactHeroAlt: "Community support scene in Mumbai",
    impactWaterDescription:
      "Refill gaps were surfaced earlier across Mumbai ward clusters, and follow-ups became easier to coordinate.",
    impactSanitationDescription:
      "Overflow reports lined up with route coverage across Mumbai, giving partner teams one clear cleanup picture instead of conflicting notes.",
    impactKitchenDescription:
      "Matching tightened around availability and prep training in Mumbai, which improved evening support consistency."
  },
  Delhi: {
    cityName: "Delhi",
    wardLabel: "Delhi wards",
    metaDescription:
      "HelpHive is a community support layer for ward insights, NGO coordination, volunteer matching, and real-time action across Delhi wards.",
    examples: {
      water: "Okhla water access lane",
      sanitation: "Karol Bagh sanitation sweep",
      kitchen: "Lajpat Nagar volunteer kitchens"
    },
    homeWaterCluster: "Okhla + Kalkaji",
    homeSanitationStatus: "Karol Bagh line sweep delayed",
    intelligenceDrilldownTitle: "Okhla ward card",
    communityCtaCopy:
      "See how the civic network turns into real coverage, resolution, and reporting across Delhi wards.",
    baseLocationPlaceholder: "Okhla, Karol Bagh, Lajpat Nagar...",
    faqCityQuestion: "Can HelpHive work beyond Delhi?",
    faqCityAnswer:
      "Yes. Delhi is shown as the selected demo city, but HelpHive is designed for ward-level operations across Indian cities.",
    impactHeroAlt: "Community support scene in Delhi",
    impactWaterDescription:
      "Refill gaps were surfaced earlier across Delhi ward clusters, and household follow-ups became easier to coordinate.",
    impactSanitationDescription:
      "Overflow reports lined up with route coverage across Delhi, giving partner teams one clear cleanup picture instead of conflicting notes.",
    impactKitchenDescription:
      "Matching tightened around availability and prep training in Delhi, which improved evening support consistency."
  },
  Bangalore: {
    cityName: "Bengaluru",
    wardLabel: "Bengaluru wards",
    metaDescription:
      "HelpHive is a community support layer for ward insights, NGO coordination, volunteer matching, and real-time action across Bengaluru wards.",
    examples: {
      water: "Indiranagar water access lane",
      sanitation: "Koramangala sanitation sweep",
      kitchen: "Jayanagar volunteer kitchens"
    },
    homeWaterCluster: "Indiranagar + Ulsoor",
    homeSanitationStatus: "Koramangala line sweep delayed",
    intelligenceDrilldownTitle: "Indiranagar ward card",
    communityCtaCopy:
      "See how the civic network turns into real coverage, resolution, and reporting across Bengaluru wards.",
    baseLocationPlaceholder: "Indiranagar, Koramangala, Jayanagar...",
    faqCityQuestion: "Can HelpHive work beyond Bengaluru?",
    faqCityAnswer:
      "Yes. Bengaluru is shown as the selected demo city, but HelpHive is designed for ward-level operations across Indian cities.",
    impactHeroAlt: "Community support scene in Bengaluru",
    impactWaterDescription:
      "Refill gaps were surfaced earlier across Bengaluru ward clusters, and household follow-ups became easier to coordinate.",
    impactSanitationDescription:
      "Overflow reports lined up with route coverage across Bengaluru, giving partner teams one clear cleanup picture instead of conflicting notes.",
    impactKitchenDescription:
      "Matching tightened around availability and prep training in Bengaluru, which improved evening support consistency."
  }
};

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function getThemeColor(variableName, fallback) {
  const styles = getComputedStyle(document.body || document.documentElement);
  const value = styles.getPropertyValue(variableName).trim();
  return value || fallback;
}

function getSeverityColors() {
  return {
    critical: getThemeColor("--severity-critical", fallbackSeverityColors.critical),
    urgent: getThemeColor("--severity-urgent", fallbackSeverityColors.urgent),
    stable: getThemeColor("--severity-stable", fallbackSeverityColors.stable)
  };
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function prettyLabel(value = "") {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDemoLocationForCity(city) {
  return demoLocationsByCity[city] || DEFAULT_DEMO_LOCATION;
}

function getCityContent(city) {
  const selected = cityContent[city];
  if (selected) {
    return {
      ...selected,
      impactWaterTitle: selected.examples.water,
      impactSanitationTitle: selected.examples.sanitation,
      impactKitchenTitle: selected.examples.kitchen
    };
  }

  const fallbackCity = String(city || DEFAULT_DEMO_LOCATION.city).trim() || DEFAULT_DEMO_LOCATION.city;
  const readableCity = prettyLabel(fallbackCity);
  return {
    cityName: readableCity,
    wardLabel: `${readableCity} wards`,
    metaDescription:
      `HelpHive is a community support layer for ward insights, NGO coordination, volunteer matching, and real-time action across ${readableCity} wards.`,
    examples: {
      water: `${readableCity} water access lane`,
      sanitation: `${readableCity} sanitation sweep`,
      kitchen: `${readableCity} volunteer kitchens`
    },
    homeWaterCluster: `${readableCity} ward cluster`,
    homeSanitationStatus: `${readableCity} line sweep delayed`,
    intelligenceDrilldownTitle: `${readableCity} ward card`,
    communityCtaCopy:
      `See how the civic network turns into real coverage, resolution, and reporting across ${readableCity} wards.`,
    baseLocationPlaceholder: `${readableCity} ward, neighborhood, locality...`,
    faqCityQuestion: `Can HelpHive work beyond ${readableCity}?`,
    faqCityAnswer:
      `Yes. ${readableCity} is shown as the selected demo city, but HelpHive is designed for ward-level operations across Indian cities.`,
    impactHeroAlt: `Community support scene in ${readableCity}`,
    impactWaterTitle: `${readableCity} water access lane`,
    impactWaterDescription:
      `Refill gaps were surfaced earlier across ${readableCity} ward clusters, and follow-ups became easier to coordinate.`,
    impactSanitationTitle: `${readableCity} sanitation sweep`,
    impactSanitationDescription:
      `Overflow reports lined up with route coverage across ${readableCity}, giving partner teams one clear cleanup picture instead of conflicting notes.`,
    impactKitchenTitle: `${readableCity} volunteer kitchens`,
    impactKitchenDescription:
      `Matching tightened around availability and prep training in ${readableCity}, which improved evening support consistency.`
  };
}

function loadCurrentLocation() {
  try {
    const legacyLocation = localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
    if (legacyLocation) {
      const parsed = JSON.parse(legacyLocation);
      if (parsed?.city) {
        return { ...getDemoLocationForCity(parsed.city) };
      }
    }

    const storedCity = localStorage.getItem(DEMO_LOCATION_STORAGE_KEY);
    return { ...getDemoLocationForCity(storedCity) };
  } catch (error) {
    return { ...DEFAULT_DEMO_LOCATION };
  }
}

function persistCurrentLocation() {
  try {
    localStorage.setItem(DEMO_LOCATION_STORAGE_KEY, currentLocation.city);
    localStorage.setItem(LEGACY_LOCATION_STORAGE_KEY, JSON.stringify(currentLocation));
  } catch (error) {
    // Ignore storage failures and keep the in-memory default.
  }
}

function renderCityContext() {
  const selectedCityContent = getCityContent(currentLocation.city);

  document.querySelectorAll("[data-city-name]").forEach((node) => {
    node.textContent = selectedCityContent.cityName;
  });

  document.querySelectorAll("[data-city-context-label]").forEach((node) => {
    node.textContent = `Viewing ${selectedCityContent.cityName} demo`;
  });

  document.querySelectorAll("[data-city-selector]").forEach((selector) => {
    if (selector instanceof HTMLSelectElement) {
      selector.value = currentLocation.city;
    }
  });

  document.querySelectorAll("[data-city-text]").forEach((node) => {
    const key = node.dataset.cityText;
    const value = key ? selectedCityContent[key] : "";
    if (typeof value === "string" && value) {
      node.textContent = value;
    }
  });

  document.querySelectorAll("[data-city-placeholder]").forEach((node) => {
    if (!(node instanceof HTMLInputElement) && !(node instanceof HTMLTextAreaElement)) {
      return;
    }

    const key = node.dataset.cityPlaceholder;
    const value = key ? selectedCityContent[key] : "";
    if (typeof value === "string" && value) {
      node.placeholder = value;
    }
  });

  document.querySelectorAll("[data-city-alt]").forEach((node) => {
    if (!(node instanceof HTMLImageElement)) {
      return;
    }

    const key = node.dataset.cityAlt;
    const value = key ? selectedCityContent[key] : "";
    if (typeof value === "string" && value) {
      node.alt = value;
    }
  });

  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag && selectedCityContent.metaDescription) {
    descriptionTag.setAttribute("content", selectedCityContent.metaDescription);
  }
}

function setCurrentLocation(city) {
  currentLocation = { ...getDemoLocationForCity(city) };
  persistCurrentLocation();
  renderCityContext();
}

function initCityContext() {
  if (
    !document.querySelector("[data-city-selector]") &&
    !document.querySelector("[data-city-name]") &&
    !document.querySelector("[data-city-context-label]") &&
    !document.querySelector("[data-city-text]") &&
    !document.querySelector("[data-city-placeholder]") &&
    !document.querySelector("[data-city-alt]")
  ) {
    return;
  }

  currentLocation = loadCurrentLocation();
  renderCityContext();

  document.querySelectorAll("[data-city-selector]").forEach((selector) => {
    if (!(selector instanceof HTMLSelectElement) || selector.dataset.bound === "true") {
      return;
    }

    selector.addEventListener("change", (event) => {
      setCurrentLocation(event.target.value);
    });
    selector.dataset.bound = "true";
  });
}

function normalizeRole(role) {
  const normalized = String(role || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (["admin", "ngo_admin"].includes(normalized)) {
    return "ngo_admin";
  }

  if (["ngo", "ngo_worker"].includes(normalized)) {
    return "ngo_worker";
  }

  if (["corporate", "csr", "csr_partner"].includes(normalized)) {
    return "csr";
  }

  return normalized;
}

function getRoleKey(currentUser) {
  return normalizeRole(currentUser?.role);
}

function getNavKeyForPath(pathname = "/") {
  try {
    const resolved = new URL(String(pathname || "/"), window.location.origin).pathname;
    const normalizedPath = resolved.endsWith("/") && resolved !== "/" ? resolved.slice(0, -1) : resolved;
    return pageNavKeys[normalizedPath] || "";
  } catch (error) {
    const fallback = String(pathname || "/");
    return pageNavKeys[fallback] || "";
  }
}

function getCurrentPageNavKey() {
  return getNavKeyForPath(window.location.pathname || "/");
}

function getAllowedTarget(target, currentUser) {
  const roleKey = getRoleKey(currentUser);
  const visibleTabs = visibleTabsByRole[roleKey];
  const navKey = getNavKeyForPath(target);

  if (target && (!visibleTabs || visibleTabs.includes(navKey) || !navKey)) {
    return target;
  }

  return roleHomes[roleKey] || "./intelligence.html";
}

function applyRoleBasedNavigation(role) {
  const normalizedRole = normalizeRole(role);
  const visibleTabs = visibleTabsByRole[normalizedRole];

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (!(link instanceof HTMLElement)) {
      return;
    }

    const navKey = link.dataset.nav;
    const ownerRole = normalizeRole(link.dataset.roleTab || "");

    if (!visibleTabs) {
      link.hidden = Boolean(ownerRole);
      return;
    }

    if (ownerRole && ownerRole !== normalizedRole) {
      link.hidden = true;
      return;
    }

    link.hidden = !visibleTabs.includes(navKey);
  });
}

function ensureMobileNavigationScaffold() {
  const header = document.querySelector(".site-header");
  if (!header) {
    return {};
  }

  let toggle = header.querySelector(".mobile-menu-toggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "mobile-menu-toggle";
    toggle.innerHTML = '<span aria-hidden="true">☰</span>';
    toggle.setAttribute("aria-label", "Open menu");
    toggle.setAttribute("aria-expanded", "false");
    const anchor = header.querySelector(".header-actions");
    header.insertBefore(toggle, anchor || null);
  }

  let mobileNav = document.querySelector(".mobile-nav");
  if (!mobileNav) {
    mobileNav = document.createElement("nav");
    mobileNav.className = "mobile-nav hidden";
    mobileNav.id = "mobileNav";
    mobileNav.setAttribute("aria-label", "Mobile navigation");
    header.insertAdjacentElement("afterend", mobileNav);
  }

  toggle.setAttribute("aria-controls", mobileNav.id);

  if (!toggle.dataset.bound) {
    toggle.addEventListener("click", () => {
      setMobileMenuState(mobileNav.classList.contains("hidden"));
    });
    toggle.dataset.bound = "true";
  }

  if (!mobileNav.dataset.bound) {
    mobileNav.addEventListener("click", (event) => {
      const target = event.target.closest("a, button");
      if (target) {
        closeMobileNavigation();
      }
    });
    mobileNav.dataset.bound = "true";
  }

  if (!document.body.dataset.mobileNavBound) {
    document.addEventListener("click", (event) => {
      if (mobileNav.classList.contains("hidden")) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Node &&
        !header.contains(target) &&
        !mobileNav.contains(target)
      ) {
        closeMobileNavigation();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMobileNavigation();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        closeMobileNavigation();
      }
    });

    document.body.dataset.mobileNavBound = "true";
  }

  return { header, toggle, mobileNav };
}

function setMobileMenuState(isOpen) {
  const { header, toggle, mobileNav } = ensureMobileNavigationScaffold();
  if (!header || !toggle || !mobileNav) {
    return;
  }

  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  toggle.innerHTML = `<span aria-hidden="true">${isOpen ? "×" : "☰"}</span>`;
  header.classList.toggle("mobile-menu-open", isOpen);
  mobileNav.classList.toggle("hidden", !isOpen);
}

function closeMobileNavigation() {
  setMobileMenuState(false);
}

function getVisibleNavigationLinks() {
  return Array.from(document.querySelectorAll(".site-nav a[data-nav]"))
    .filter((link) => link instanceof HTMLAnchorElement && !link.hidden)
    .map((link) => ({
      href: link.getAttribute("href") || "#",
      label: link.textContent.trim(),
      active: link.classList.contains("is-active")
    }));
}

function renderMobileNavigation(currentUser) {
  const { mobileNav } = ensureMobileNavigationScaffold();
  if (!mobileNav) {
    return;
  }

  const visibleLinks = getVisibleNavigationLinks();
  const roleKey = getRoleKey(currentUser);
  const navLinksMarkup = visibleLinks
    .map(
      (link) => `
        <a class="mobile-nav-link ${link.active ? "is-active" : ""}" href="${link.href}">
          ${escapeHtml(link.label)}
        </a>
      `
    )
    .join("");

  let utilityMarkup = "";

  if (currentUser) {
    const accountName =
      roleKey === "csr"
        ? currentUser.companyName || currentUser.name || BRAND_NAME
        : currentUser.name || BRAND_NAME;
    const accountSubtext =
      roleKey === "csr"
        ? currentUser.name || "Contact person"
        : roleLabels[roleKey] || prettyLabel(currentUser.role);

    utilityMarkup = `
      <div class="mobile-nav-user">
        <div class="user-badge ${roleKey === "csr" ? "account-stack" : ""}">
          <strong>${escapeHtml(accountName)}</strong>
          <span>${escapeHtml(accountSubtext)}</span>
        </div>
      </div>
      <div class="mobile-nav-actions">
        <a class="ghost-button" href="./profile.html">Profile</a>
        <button class="soft-button" type="button" data-logout>Logout</button>
      </div>
    `;
  } else {
    utilityMarkup = `
      <div class="mobile-nav-actions">
        <a class="ghost-button" href="./login.html">Log in</a>
        <a class="cta-button" href="./signup.html">Sign up</a>
      </div>
    `;
  }

  mobileNav.innerHTML = `
    <div class="mobile-nav-shell">
      <div class="mobile-nav-links">
        ${navLinksMarkup}
      </div>
      ${utilityMarkup}
    </div>
  `;

  closeMobileNavigation();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function withFallback(value, fallback = "Not specified") {
  if (Array.isArray(value)) {
    return value.length ? value : fallback;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = typeof value === "string" ? value.trim() : value;
  return normalized === "" ? fallback : normalized;
}

function formatDateTime(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Not specified";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

function formatRelativeAge(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Not specified";
  }

  const hours = formatAgeHours(value);
  if (hours < 1) {
    return "Less than 1 hour ago";
  }

  if (hours < 24) {
    return `${Math.round(hours)}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function joinReadableList(values = [], fallback = "Not specified") {
  const list = (values || []).map((value) => String(value || "").trim()).filter(Boolean);
  return list.length ? list.join(", ") : fallback;
}

function formatConfidence(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "N/A";
}

function createFileSelectionKey(file) {
  return [file?.name || "", file?.size || 0, file?.lastModified || 0].join(":");
}

function buildReviewImageGalleryMarkup(item = {}) {
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls.filter(Boolean) : [];
  const normalizedUrls = [...new Set([item.imageUrl, ...imageUrls].filter(Boolean))];

  if (!normalizedUrls.length) {
    return "";
  }

  return `
    <div class="review-image-gallery" aria-label="Survey image gallery">
      ${normalizedUrls
      .map(
        (url, index) => `
            <figure class="review-image-frame">
              <img
                src="${escapeHtml(url)}"
                alt="${escapeHtml(`${item.title || "Survey"} image ${index + 1}`)}"
                loading="lazy"
              />
              <figcaption>${escapeHtml(
          normalizedUrls.length > 1 ? `Survey image ${index + 1}` : "Survey image"
        )}</figcaption>
            </figure>
          `
      )
      .join("")}
    </div>
  `;
}

function buildOcrBatchSummaryMarkup(summary = {}) {
  const submittedCount = Number(summary.submittedCount || 0);
  const processedCount = Number(summary.processedCount || 0);
  const flaggedCount = Number(summary.flaggedCount || 0);

  return `
    <div class="ocr-summary-grid">
      <article class="ocr-summary-card">
        <span>Submitted</span>
        <strong>${escapeHtml(submittedCount)}</strong>
      </article>
      <article class="ocr-summary-card">
        <span>Processed</span>
        <strong>${escapeHtml(processedCount)}</strong>
      </article>
      <article class="ocr-summary-card">
        <span>Flagged</span>
        <strong>${escapeHtml(flaggedCount)}</strong>
      </article>
    </div>
  `;
}

function isLikelyTableLine(line = "") {
  return (String(line).match(/\|/g) || []).length >= 2;
}

function splitTableCells(line = "") {
  return String(line)
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell, index, cells) => cell || (index > 0 && index < cells.length - 1));
}

function renderTextBlockMarkup(lines = [], useParagraphs = false) {
  const text = lines.join("\n").trim();
  if (!text) {
    return "";
  }

  if (!useParagraphs) {
    return `<pre>${escapeHtml(text)}</pre>`;
  }

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function renderOcrTableMarkup(lines = []) {
  const rows = lines
    .map(splitTableCells)
    .filter(
      (cells) =>
        cells.length >= 2 && !cells.every((cell) => /^:?-{3,}:?$/.test(String(cell).trim()))
    );
  if (!rows.length) {
    return renderTextBlockMarkup(lines);
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] || "")
  );
  const [headerRow, ...bodyRows] = normalizedRows;

  return `
    <div class="ocr-table-wrap">
      <table class="ocr-table">
        <thead>
          <tr>
            ${headerRow.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${bodyRows
      .map(
        (row) => `
                <tr>
                  ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
                </tr>
              `
      )
      .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOcrTextMarkup(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  const hasTable = lines.some((line) => isLikelyTableLine(line));
  if (!hasTable) {
    return `<div class="ocr-rendered-text">${renderTextBlockMarkup(lines)}</div>`;
  }

  const blocks = [];
  let currentTextLines = [];
  let currentTableLines = [];

  function flushText() {
    if (currentTextLines.length) {
      blocks.push(renderTextBlockMarkup(currentTextLines, true));
      currentTextLines = [];
    }
  }

  function flushTable() {
    if (currentTableLines.length) {
      blocks.push(renderOcrTableMarkup(currentTableLines));
      currentTableLines = [];
    }
  }

  for (const line of lines) {
    if (isLikelyTableLine(line)) {
      flushText();
      currentTableLines.push(line);
    } else {
      flushTable();
      currentTextLines.push(line);
    }
  }

  flushText();
  flushTable();

  return `<div class="ocr-rendered-text">${blocks.filter(Boolean).join("")}</div>`;
}

function buildOcrBatchSummaryCopyMarkup(payload = {}) {
  const summary = payload.summary || {};
  const processedCount = Number(summary.processedCount || 0);
  const passedCount = Number(summary.passedCount || 0);
  const failedCount = Number(summary.failedCount || 0);
  const taskCount = payload.task ? 1 : 0;

  if (!taskCount) {
    return `
      <div class="ocr-summary-copy">
        <strong>No task was created from this batch.</strong>
        <p class="helper-copy">Please try clearer survey photos and rerun the OCR intake.</p>
      </div>
    `;
  }

  return `
    <div class="ocr-summary-copy">
      <strong>${escapeHtml(`${taskCount} task created from ${processedCount} image${processedCount === 1 ? "" : "s"}`)}</strong>
      <p class="helper-copy">${escapeHtml(`${passedCount} of ${processedCount} processed image${processedCount === 1 ? "" : "s"} cleared the confidence threshold.`)}</p>
      ${failedCount
      ? `<p class="helper-copy">${escapeHtml(`${failedCount} image${failedCount === 1 ? "" : "s"} could not be processed in this batch.`)}</p>`
      : ""}
    </div>
  `;
}

function buildOcrBatchResultMarkup(payload = {}) {
  const results = Array.isArray(payload.results) ? payload.results : [];

  if (!results.length) {
    return `
      <strong>OCR summary</strong>
      ${buildOcrBatchSummaryMarkup(payload.summary)}
      <p class="helper-copy">No survey images could be processed from this upload.</p>
    `;
  }

  return `
    <strong>OCR batch summary</strong>
    ${buildOcrBatchSummaryMarkup(payload.summary)}
    ${buildOcrBatchSummaryCopyMarkup(payload)}
    <div class="ocr-summary-actions">
      <button class="cta-button ocr-result-launch" id="ocrViewResultButton" type="button">
        View Extracted Result →
      </button>
    </div>
  `;
}

function buildOcrCarouselCardMarkup(entry = {}, index = 0, activeIndex = 0, interactive = false) {
  const confidence = entry.ocr?.averageConfidence;
  const statusLabel = entry.error
    ? "Processing failed"
    : entry.capturedClearly
      ? "Captured clearly"
      : "Captured unclearly";
  const statusClass = entry.error || !entry.capturedClearly ? "is-unclear" : "is-clear";
  const actionAttributes = interactive
    ? `type="button" data-ocr-image-select="${escapeHtml(String(index))}"`
    : `type="button" disabled`;
  const activeClass = interactive && index === activeIndex ? "is-active" : "";
  const staticClass = interactive ? "" : "is-static";

  return `
    <button class="ocr-carousel-card ${activeClass} ${staticClass}" ${actionAttributes}>
      ${entry.imageUrl
      ? `<img src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(entry.filename || `Survey image ${index + 1}`)}" loading="lazy" />`
      : ""}
      <strong>${escapeHtml(entry.filename || `Survey image ${index + 1}`)}</strong>
      <p class="helper-copy">Confidence: ${escapeHtml(entry.error ? "Not available" : formatConfidence(confidence))}</p>
      <span class="ocr-carousel-status ${statusClass}">${escapeHtml(statusLabel)}</span>
    </button>
  `;
}

function buildOcrExpandedPreviewMarkup(entry = {}) {
  if (!entry?.imageUrl) {
    return "";
  }

  return `
    <div class="ocr-expanded-preview">
      <strong>${escapeHtml(entry.filename || "Survey image")}</strong>
      <p class="helper-copy">
        Confidence: ${escapeHtml(entry.error ? "Not available" : formatConfidence(entry.ocr?.averageConfidence))}
        · ${escapeHtml(entry.capturedClearly ? "Captured clearly" : entry.error ? "Processing failed" : "Captured unclearly")}
      </p>
      <img src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(entry.filename || "Expanded survey image")}" loading="lazy" />
    </div>
  `;
}

function getMergedOcrContent(payload = {}) {
  const merged = payload.merged && typeof payload.merged === "object" ? payload.merged : {};
  const candidateValues = [
    merged.formattedContent,
    merged.cleanedContent,
    merged.text,
    merged.rawText,
    payload.mergedContent,
    payload.extractedText,
    payload.content
  ];
  const resolvedValue = candidateValues.find((value) => String(value || "").trim());
  if (resolvedValue) {
    return String(resolvedValue).trim();
  }

  const resultFallback = (Array.isArray(payload.results) ? payload.results : [])
    .map((entry) =>
      String(
        entry?.ocr?.formattedContent ||
        entry?.ocr?.cleanedContent ||
        entry?.ocr?.text ||
        entry?.ocr?.rawText ||
        ""
      ).trim()
    )
    .filter(Boolean)
    .join("\n\n");

  return resultFallback;
}

function buildOcrBatchModalMarkup(payload = {}, activeIndex = 0) {
  const results = Array.isArray(payload.results) ? payload.results.filter((entry) => entry.imageUrl) : [];
  const merged = payload.merged || {};
  const selectedEntry = results[activeIndex] || results[0] || {};
  const hasMultipleImages = results.length > 1;
  const taskTitle = payload.task?.title || "Extracted survey result";
  const statusLabel = payload.task?.needsReview ? "Flagged for admin review" : "Ready for the volunteer feed";
  const extractedText = getMergedOcrContent(payload);

  return `
    <div class="ocr-result-modal__header">
      <h3 id="ocrResultModalTitle">${escapeHtml(taskTitle)}</h3>
      <div class="ocr-result-modal__meta">
        <span class="pill-tag">${escapeHtml(statusLabel)}</span>
        <span class="pill-tag">Average confidence: ${escapeHtml(formatConfidence(merged.averageConfidence))}</span>
        <span class="pill-tag">${escapeHtml(`${results.length} image${results.length === 1 ? "" : "s"}`)}</span>
      </div>
    </div>
    <section class="ocr-carousel">
      <div class="ocr-carousel__row">
        ${results
      .map((entry, index) => buildOcrCarouselCardMarkup(entry, index, activeIndex, hasMultipleImages))
      .join("")}
      </div>
      ${hasMultipleImages ? buildOcrExpandedPreviewMarkup(selectedEntry) : ""}
    </section>
    <section class="ocr-merged-panel">
      <div class="ocr-merged-panel__header">
        <h4>Merged extracted content</h4>
        <p class="helper-copy">This structured summary was created from the processed survey images in this batch.</p>
      </div>
      ${extractedText
      ? renderOcrTextMarkup(extractedText)
      : '<p class="helper-copy">No merged content was returned for this OCR batch.</p>'}
    </section>
  `;
}

function joinPrettyList(values = [], fallback = "Not specified") {
  const list = (values || []).map((value) => prettyLabel(value)).filter(Boolean);
  return list.length ? list.join(", ") : fallback;
}

function joinNameList(users = [], fallback = "Not assigned") {
  const names = (users || []).map((user) => user?.name).filter(Boolean);
  return names.length ? names.join(", ") : fallback;
}

function debounce(callback, wait = 140) {
  let timeoutId = 0;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, wait);
  };
}

function buildQueryString(values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatAgeHours(updatedAt) {
  const timestamp = new Date(updatedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return 0;
  }

  return Math.max((Date.now() - timestamp.getTime()) / (1000 * 60 * 60), 0);
}

function getToken() {
  return localStorage.getItem("kindredToken");
}

function setSession(token, user) {
  localStorage.setItem("kindredToken", token);
  localStorage.setItem("kindredUser", JSON.stringify(user));
  localStorage.setItem("userRole", normalizeRole(user?.role));
}

function clearSession() {
  localStorage.removeItem("kindredToken");
  localStorage.removeItem("kindredUser");
  localStorage.removeItem("userRole");
}

function getStoredUser() {
  const raw = localStorage.getItem("kindredUser");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function setFlash(message, tone = "info") {
  sessionStorage.setItem(
    "kindredFlash",
    JSON.stringify({
      message,
      tone
    })
  );
}

function consumeFlash() {
  const raw = sessionStorage.getItem("kindredFlash");
  if (!raw) {
    return null;
  }

  sessionStorage.removeItem("kindredFlash");
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  const requestUrl =
    typeof url === "string" && /^https?:\/\//i.test(url) ? url : `${API_URL}${url}`;

  if (token && options.auth !== false) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!isFormData && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(requestUrl, {
    method: options.method || "GET",
    headers,
    body: isFormData
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(
      typeof payload === "string" ? payload : payload.error || "Request failed"
    );
    error.payload = payload;
    throw error;
  }

  return payload;
}

function showGlobalBanner(message, tone = "info") {
  const existing = document.querySelector(".status-banner[data-global='true']");
  if (existing) {
    existing.remove();
  }

  const header = document.querySelector(".site-header");
  if (!header) {
    return;
  }

  const banner = document.createElement("div");
  banner.className = `status-banner ${tone}`;
  banner.dataset.global = "true";
  banner.innerHTML = `<strong>${tone === "error" ? "Something needs attention" : tone === "success" ? "Saved" : "Update"}</strong><span>${message}</span>`;
  header.insertAdjacentElement("afterend", banner);
}

function renderEmptyState(message) {
  return `<div class="empty-state"><p>${message}</p></div>`;
}

function initFadeIn() {
  const elements = document.querySelectorAll(".fade-in");
  if (!elements.length) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      // Tall sections like the intelligence task lane may never hit a high
      // intersection ratio on shorter screens, leaving a blank gap behind.
      threshold: 0.01,
      rootMargin: "0px 0px -6% 0px"
    }
  );

  elements.forEach((element) => {
    observer.observe(element);
  });
}

const MOBILE_MAP_BREAKPOINT = 768;
const MOBILE_MAP_MARKER_LIMIT = 10;
const MOBILE_MAP_ALERT_LIMIT = 4;

function isMobileMapViewport() {
  return window.innerWidth < MOBILE_MAP_BREAKPOINT;
}

function closeMapBottomSheet() {
  const sheet = document.getElementById("map-bottom-sheet");
  const backdrop = document.getElementById("map-sheet-backdrop");

  if (sheet) {
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
  }

  if (backdrop) {
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
  }
}

function openMapBottomSheet(markup) {
  const sheet = document.getElementById("map-bottom-sheet");
  const backdrop = document.getElementById("map-sheet-backdrop");

  if (!sheet) {
    return;
  }

  const content = sheet.querySelector(".sheet-content");
  if (content) {
    content.innerHTML = markup;
  }

  sheet.scrollTop = 0;
  sheet.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");

  if (backdrop) {
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
  }
}

function renderMapSheetRows(rows = []) {
  return rows
    .filter((row) => row && row.value)
    .map(
      (row) => `
        <div class="sheet-meta-row">
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderMapSheetNote(label, value) {
  if (!value) {
    return "";
  }

  return `<p class="sheet-note"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

function renderIssueSheet(issue) {
  const severityLabel = capitalize(withFallback(issue.severity, "stable"));
  const locationLabel = withFallback(issue.locationName, "Selected ward");
  const ngoLabel = withFallback(issue.ngo, "NGO Desk");
  const intensityLabel =
    typeof issue.currentIntensity === "number" ? issue.currentIntensity.toFixed(2) : "0.00";
  const signals = joinReadableList((issue.evidenceKeywords || []).map((value) => prettyLabel(value)), "");
  const peopleMentionLabel =
    issue.peopleMention && Number(issue.peopleMention) > 0
      ? `${issue.peopleMention} people or households referenced`
      : "";

  return `
    <div class="sheet-intro">
      <span class="sheet-eyebrow">${escapeHtml(prettyLabel(withFallback(issue.type, "need")))}</span>
      <h3>${escapeHtml(withFallback(issue.label, "Open need"))}</h3>
      <p>${escapeHtml(`${locationLabel} is showing ${severityLabel} pressure with ${ngoLabel} assigned right now.`)}</p>
    </div>
    <div class="sheet-meta-list">
      ${renderMapSheetRows([
    { label: "Area", value: locationLabel },
    { label: "Severity", value: severityLabel },
    { label: "Status", value: "Open need" },
    { label: "Last updated", value: withFallback(issue.updated, "Not specified") },
    { label: "NGO desk", value: ngoLabel },
    { label: "Heat intensity", value: intensityLabel }
  ])}
    </div>
    ${renderMapSheetNote("Signals", signals)}
    ${renderMapSheetNote("Mentions", peopleMentionLabel)}
  `;
}

function renderAlertSheet(alert) {
  const severityLabel = capitalize(withFallback(alert.severity, "urgent"));
  const locationLabel = withFallback(alert.locationName, "Selected ward");
  const evidenceItems = (alert.evidence || [])
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
    <div class="sheet-intro">
      <span class="sheet-eyebrow">Cluster alert</span>
      <h3>${escapeHtml(withFallback(alert.title, "Escalation cluster"))}</h3>
      <p>${escapeHtml(withFallback(alert.explanation, `${locationLabel} has repeated reports that need attention.`))}</p>
    </div>
    <div class="sheet-meta-list">
      ${renderMapSheetRows([
    { label: "Area", value: locationLabel },
    { label: "Severity", value: severityLabel },
    { label: "Status", value: "Active cluster" },
    { label: "Reports in cluster", value: String(withFallback(alert.evidenceCount, "0")) },
    {
      label: "Cluster strength",
      value: typeof alert.weightedCount === "number" ? alert.weightedCount.toFixed(1) : "0.0"
    }
  ])}
    </div>
    ${evidenceItems ? `<ul class="sheet-bullet-list">${evidenceItems}</ul>` : ""}
  `;
}

function focusMapPoint(map, latitude, longitude, preferredZoom = 13) {
  if (!map || !isMobileMapViewport()) {
    return;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  map.flyTo([latitude, longitude], Math.max(map.getZoom(), preferredZoom), {
    animate: true,
    duration: 0.35
  });
}

function onMapPointClick(point) {
  if (!isMobileMapViewport()) {
    return;
  }

  if (!point) {
    return;
  }

  openMapBottomSheet(point.kind === "alert" ? renderAlertSheet(point) : renderIssueSheet(point));
}

function createMarker(issue, map) {
  const severityColors = getSeverityColors();
  const color = severityColors[issue.severity] || severityColors.stable;
  const isMobile = isMobileMapViewport();
  const markerSize = isMobile ? 36 : 24;
  const markerAnchor = markerSize / 2;
  const haloSize = isMobile ? 18 : 14;
  const icon = L.divIcon({
    className: "",
    html:
      '<div class="issue-marker" style="color:' +
      color +
      "; box-shadow: 0 0 0 " +
      haloSize +
      "px " +
      hexToRgba(color, 0.18) +
      ';"></div>',
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerAnchor, markerAnchor]
  });

  const popup = `
    <div class="popup-card">
      <h4>${escapeHtml(withFallback(issue.label, "Open need"))}</h4>
      <div class="popup-line"><span>Severity</span><strong>${escapeHtml(capitalize(withFallback(issue.severity, "stable")))}</strong></div>
      <div class="popup-line"><span>Last updated</span><strong>${escapeHtml(withFallback(issue.updated, "Not specified"))}</strong></div>
      <div class="popup-line"><span>Assigned NGO</span><strong>${escapeHtml(withFallback(issue.ngo, "NGO Desk"))}</strong></div>
      <div class="popup-line"><span>Intensity</span><strong>${escapeHtml(String(issue.currentIntensity ?? "0.00"))}</strong></div>
    </div>
  `;

  const marker = L.marker([issue.lat, issue.lng], { icon });

  marker.on("click", (event) => {
    if (event?.originalEvent) {
      L.DomEvent.stop(event.originalEvent);
    }

    if (!isMobileMapViewport()) {
      return;
    }

    focusMapPoint(map, issue.lat, issue.lng);
    onMapPointClick({ ...issue, kind: "issue" });
  });

  if (isMobile) {
    return marker;
  }

  return marker.bindPopup(popup, {
    className: "custom-popup"
  });
}

function createAlertClusterMarker(alert, map) {
  const severityColors = getSeverityColors();
  const color = severityColors[alert.severity] || severityColors.urgent;
  const markerSize = isMobileMapViewport() ? 36 : 30;
  const markerAnchor = markerSize / 2;
  const count = alert.evidenceCount > 9 ? "9+" : String(alert.evidenceCount || 1);
  const icon = L.divIcon({
    className: "",
    html: `<div class="cluster-marker" style="--cluster-color: ${color};"><span>${escapeHtml(count)}</span></div>`,
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerAnchor, markerAnchor]
  });

  const marker = L.marker([alert.latitude, alert.longitude], {
    icon,
    zIndexOffset: 420
  });

  marker.on("click", (event) => {
    if (event?.originalEvent) {
      L.DomEvent.stop(event.originalEvent);
    }

    focusMapPoint(map, alert.latitude, alert.longitude);
    onMapPointClick({ ...alert, kind: "alert" });
  });

  return marker;
}

async function resolveCurrentUser() {
  const token = getToken();
  if (!token) {
    return null;
  }

  try {
    const data = await apiFetch("/api/me");
    localStorage.setItem("kindredUser", JSON.stringify(data.user));
    localStorage.setItem("userRole", normalizeRole(data.user?.role));
    return data.user;
  } catch (error) {
    clearSession();
    return null;
  }
}

function renderHeaderActions(currentUser) {
  const headerActions = document.querySelectorAll(".header-actions");
  const roleKey = getRoleKey(currentUser);

  headerActions.forEach((slot) => {
    if (!currentUser) {
      slot.innerHTML = `
        <div class="header-link-row">
          <a class="ghost-button" href="./login.html">Log in</a>
          <a class="cta-button" href="./signup.html">Sign up</a>
        </div>
      `;
      return;
    }

    const partnersBtn = roleKey === "csr"
      ? `<a class="ghost-button" href="./csr-dashboard.html?tab=partners">Partners</a>`
      : "";
    const accountName =
      roleKey === "csr"
        ? currentUser.companyName || currentUser.name || BRAND_NAME
        : currentUser.name || BRAND_NAME;
    const accountSubtext =
      roleKey === "csr"
        ? currentUser.name || "Contact person"
        : roleLabels[roleKey] || prettyLabel(currentUser.role);

    slot.innerHTML = `
      <div class="header-link-row">
        ${partnersBtn}
        <a class="ghost-button" href="${roleHomes[roleKey] || "./intelligence.html"}">Dashboard</a>
        <a class="ghost-button" href="./profile.html">Profile</a>
        <div class="user-badge ${roleKey === "csr" ? "account-stack" : ""}">
          <strong>${escapeHtml(accountName)}</strong>
          <span>${escapeHtml(accountSubtext)}</span>
        </div>
        <button class="soft-button" type="button" data-logout>Logout</button>
      </div>
    `;
  });

  applyRoleBasedNavigation(roleKey);
  renderMobileNavigation(currentUser);

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      clearSession();
      setFlash("You’ve been logged out.", "info");
      window.location.href = "./login.html";
    });
  });
}

function enforcePageGuard(currentUser) {
  const roleKey = getRoleKey(currentUser);
  const currentPageNavKey = getCurrentPageNavKey();
  const allowedPageNavKeys = allowedPageNavKeysByRole[roleKey];

  if (currentUser && allowedPageNavKeys && currentPageNavKey && !allowedPageNavKeys.includes(currentPageNavKey)) {
    setFlash("That page is not available for your current role.", "info");
    window.location.href = roleHomes[roleKey] || "./intelligence.html";
    return false;
  }

  const guard = document.body.dataset.guard;
  if (!guard) {
    return true;
  }

  if (!currentUser) {
    setFlash("Please log in to continue.", "info");
    const redirect = encodeURIComponent(window.location.pathname);
    window.location.href = `./login.html?redirect=${redirect}`;
    return false;
  }

  const roles = (document.body.dataset.roles || "")
    .split(",")
    .map((value) => normalizeRole(value))
    .filter(Boolean);

  if (roles.length && !roles.includes(roleKey)) {
    setFlash("Your account does not have access to that page.", "error");
    window.location.href = roleHomes[roleKey] || "./intelligence.html";
    return false;
  }

  return true;
}

function attachFlash() {
  const flash = consumeFlash();
  if (flash) {
    showGlobalBanner(flash.message, flash.tone);
  }
}

function taskActionButtons(task, currentUser, options = {}) {
  const { className = "inline-actions", mode = "all" } = options;
  if (!currentUser) {
    return `<div class="${className}"><a class="ghost-button" href="./login.html">Log in to help</a></div>`;
  }

  const roleKey = getRoleKey(currentUser);
  const isAssigned = task.assignedUsers?.some((user) => user.id === currentUser.id);
  const canVolunteer = roleKey === "volunteer" || roleKey === "ngo_admin";
  const canComplete =
    roleKey === "ngo_admin" ||
    roleKey === "ngo_worker" ||
    isAssigned;

  const actions = [];

  if (canVolunteer && !isAssigned && task.status !== "completed") {
    actions.push(
      `<button class="cta-button" type="button" data-task-action="volunteer" data-task-id="${escapeHtml(task.id)}">Volunteer</button>`
    );
  }

  if (canComplete && task.status !== "completed") {
    actions.push(
      `<button class="ghost-button" type="button" data-task-action="complete" data-task-id="${escapeHtml(task.id)}">Mark complete</button>`
    );
  }

  const visibleActions = mode === "primary" ? actions.slice(0, 1) : actions;

  if (!visibleActions.length) {
    visibleActions.push(`<span class="pill-tag">No action needed</span>`);
  }

  return `<div class="${className}">${visibleActions.join("")}</div>`;
}

const taskSeverityOrder = {
  urgent: 0,
  critical: 1,
  stable: 2
};

const taskSeverityConfig = [
  { key: "urgent", label: "Urgent" },
  { key: "critical", label: "Critical" },
  { key: "stable", label: "Stable" }
];

function renderSeverityIcon(severity = "stable") {
  if (severity === "urgent") {
    return `
      <span class="severity-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5C4.6 6 6 4.8 8 4.8C10 4.8 11.4 6 12.5 8.5" />
          <path d="M8 2.8V5.1" />
          <path d="M5.2 9.8L8 7.2L10.8 9.8" />
          <path d="M8 7.2V13.2" />
        </svg>
      </span>
    `;
  }

  if (severity === "critical") {
    return `
      <span class="severity-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M8 2.4L13.2 12.8H2.8L8 2.4Z" />
          <path d="M8 6.1V9.2" />
          <path d="M8 11.4H8.01" />
        </svg>
      </span>
    `;
  }

  return `
    <span class="severity-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <path d="M3.2 8H12.8" />
        <path d="M5.3 5.6C6.1 6.7 7 7.3 8 7.3C9 7.3 9.9 6.7 10.7 5.6" />
        <path d="M5.3 10.4C6.1 9.3 7 8.7 8 8.7C9 8.7 9.9 9.3 10.7 10.4" />
      </svg>
    </span>
  `;
}

function renderTaskDetailItem(label, value, options = {}) {
  const { wide = false } = options;
  return `
    <div class="task-detail-item ${wide ? "is-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderTaskDetailModal(task, currentUser) {
  const roleKey = getRoleKey(currentUser);
  const assignedNames = joinNameList(task.assignedUsers, "Not assigned");
  const buddyNames = joinNameList(task.buddySuggestions, "Not assigned");
  const fieldStyle = joinPrettyList(task.preferredCommunicationStyles, "Not specified");
  const volunteerLogic =
    roleKey === "volunteer" && task.currentUserMatch?.reasons?.length
      ? task.currentUserMatch.reasons.join(" · ")
      : task.buddyReasons?.length
        ? task.buddyReasons.join(" · ")
        : "Matching uses skill fit, language, medical readiness, team complement, and geography.";
  const coordinates =
    typeof task.latitude === "number" && typeof task.longitude === "number"
      ? `${task.latitude.toFixed(4)}, ${task.longitude.toFixed(4)}`
      : "Not specified";
  const createdLine = task.createdAt
    ? `${formatDateTime(task.createdAt)} · ${formatRelativeAge(task.createdAt)}`
    : "Not specified";
  const dueLine = formatDateTime(task.dueDate);
  const notes = withFallback(task.notes, "No notes added");

  return `
    <div class="task-detail-header">
      <div class="task-card-header">
        <span class="severity-badge ${escapeHtml(task.severity || "stable")}">${escapeHtml(capitalize(task.severity || "stable"))}</span>
        <span class="pill-tag">${escapeHtml(prettyLabel(task.status || "open"))}</span>
      </div>
      <h2 id="taskDetailTitle">${escapeHtml(withFallback(task.title, "Untitled task"))}</h2>
      <p class="task-card-summary">${escapeHtml(notes)}</p>
    </div>

    <div class="task-detail-grid">
      ${renderTaskDetailItem("Severity", capitalize(withFallback(task.severity, "stable")))}
      ${renderTaskDetailItem("Status", prettyLabel(withFallback(task.status, "open")))}
      ${renderTaskDetailItem("Assigned person", assignedNames)}
      ${renderTaskDetailItem("Assigned NGO / team", withFallback(task.ngo, "Not assigned"))}
      ${renderTaskDetailItem("Area / ward / location", withFallback(task.locationName, "Not specified"))}
      ${renderTaskDetailItem("Task type", prettyLabel(withFallback(task.type, "Not specified")))}
      ${renderTaskDetailItem("Need category", prettyLabel(withFallback(task.category, "Not specified")))}
      ${renderTaskDetailItem("Field style", fieldStyle)}
      ${renderTaskDetailItem("Created / age", createdLine)}
      ${renderTaskDetailItem("Due date", dueLine)}
      ${renderTaskDetailItem("Skills required", joinPrettyList(task.requiredSkills, "Not specified"), { wide: true })}
      ${renderTaskDetailItem("Language required", joinReadableList(task.preferredLanguages, "Not specified"), { wide: true })}
      ${renderTaskDetailItem("Buddy suggestion", buddyNames, { wide: true })}
      ${renderTaskDetailItem("Volunteer recommendation logic", volunteerLogic, { wide: true })}
      ${renderTaskDetailItem("Coordinates / map reference", coordinates, { wide: true })}
      ${renderTaskDetailItem("Notes / description", notes, { wide: true })}
    </div>

    <div class="task-card-actions task-detail-footer">
      ${taskActionButtons(task, currentUser, {
    className: "inline-actions task-detail-actions",
    mode: "all"
  })}
    </div>
  `;
}

function renderTaskCard(task, currentUser) {
  const severity = task.severity || "stable";
  const assignedLabel = joinNameList(task.assignedUsers, withFallback(task.ngo, "Not assigned"));
  const summary = withFallback(task.notes, "No notes added");
  const severityLabel =
    taskSeverityConfig.find((item) => item.key === severity)?.label || capitalize(severity);

  return `
    <article
      class="task-card compact ${escapeHtml(severity)}"
    >
      <div class="task-card-header">
        <span class="severity-tag ${escapeHtml(severity)}">${renderSeverityIcon(severity)}<span>${escapeHtml(severityLabel)}</span></span>
        <span class="task-card-kicker">${escapeHtml(prettyLabel(withFallback(task.status, "open")))}</span>
      </div>
      <h3>${escapeHtml(withFallback(task.title, "Untitled task"))}</h3>
      <p class="task-card-summary">${escapeHtml(summary)}</p>
      <div class="task-card-meta-strip">
        <span class="task-card-meta-pill">${escapeHtml(withFallback(task.locationName, "Not specified"))}</span>
        <span class="task-card-meta-pill">${escapeHtml(assignedLabel)}</span>
        <span class="task-card-meta-pill">${escapeHtml(prettyLabel(withFallback(task.category || task.type, "Not specified")))}</span>
      </div>
      <div class="task-card-actions">
        ${taskActionButtons(task, currentUser, {
    className: "inline-actions task-primary-actions",
    mode: "primary"
  })}
        <button
          class="ghost-button"
          type="button"
          data-task-detail="${escapeHtml(task.id)}"
        >
          View details
        </button>
      </div>
    </article>
  `;
}

function renderOrderedTaskList(tasks, currentUser) {
  const orderedTasks = [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const severityDelta =
        (taskSeverityOrder[left.task.severity] ?? 99) - (taskSeverityOrder[right.task.severity] ?? 99);

      if (severityDelta !== 0) {
        return severityDelta;
      }

      return left.index - right.index;
    })
    .map(({ task }) => task);

  return orderedTasks.length
    ? orderedTasks.map((task) => renderTaskCard(task, currentUser)).join("")
    : renderEmptyState("No live tasks are open right now.");
}

function initSignalFilterPanel(mapElementId, map) {
  if (mapElementId !== "intelligence-map") {
    return;
  }

  const toggle = document.getElementById("signalFilterToggle");
  const panel = document.getElementById("signalFilterPanel");
  const closeButton = panel?.querySelector(".filter-panel-close");
  const toggleLabel = toggle?.querySelector(".map-filter-toggle-label");
  const toggleHint = toggle?.querySelector(".map-filter-toggle-hint");

  if (!toggle || !panel || !closeButton || !toggleLabel || !toggleHint || toggle.dataset.bound === "true") {
    return;
  }

  toggle.dataset.bound = "true";

  function syncFilterToggle(isOpen) {
    panel.classList.toggle("is-collapsed", !isOpen);
    toggle.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Hide signal filters" : "Open signal filters");
    toggleLabel.textContent = isOpen ? "Hide filters" : "Signal filters";
    toggleHint.textContent = isOpen ? "Collapse this panel" : "Tap to expand controls";

    window.requestAnimationFrame(() => {
      map.invalidateSize();
    });
  }

  function openSignalFilters() {
    syncFilterToggle(true);
  }

  function closeSignalFilters() {
    syncFilterToggle(false);
  }

  function toggleSignalFilters() {
    const isOpen = panel.classList.contains("is-collapsed");
    if (isOpen) {
      openSignalFilters();
      return;
    }

    closeSignalFilters();
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSignalFilters();
  });

  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closeSignalFilters();
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", (event) => {
    if (
      !panel.classList.contains("is-collapsed") &&
      !panel.contains(event.target) &&
      !toggle.contains(event.target)
    ) {
      closeSignalFilters();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.classList.contains("is-collapsed")) {
      closeSignalFilters();
    }
  });

  syncFilterToggle(false);
}

async function setupMap(mapElementId, filterPrefix = "") {
  const mapElement = document.getElementById(mapElementId);
  if (!mapElement || typeof L === "undefined") {
    return null;
  }

  const map = L.map(mapElementId, {
    zoomControl: false,
    scrollWheelZoom: false
  }).setView([18.5204, 73.8567], 12);

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const heatLayer = L.layerGroup().addTo(map);
  let issues = [];
  let alerts = [];
  const token = getToken();

  if (!token) {
    return { refreshData: async () => { } };
  }

  function getField(id) {
    return document.getElementById(`${filterPrefix}${id}`);
  }

  function filteredIssues() {
    const typeValue = getField("typeFilter")?.value || "all";
    const severityValue = getField("severityFilter")?.value || "all";
    const ngoValue = getField("ngoFilter")?.value || "all";

    return issues
      .filter((issue) => typeValue === "all" || issue.type === typeValue)
      .filter((issue) => severityValue === "all" || issue.severity === severityValue)
      .filter((issue) => ngoValue === "all" || issue.ngo === ngoValue);
  }

  function drawLayers() {
    const severityColors = getSeverityColors();
    const isMobile = isMobileMapViewport();
    markerLayer.clearLayers();
    heatLayer.clearLayers();

    const visibleIssues = filteredIssues();
    const prioritizedIssues = isMobile
      ? [...visibleIssues]
        .sort((left, right) => (right.heatWeight || 0) - (left.heatWeight || 0))
        .slice(0, MOBILE_MAP_MARKER_LIMIT)
      : visibleIssues;
    const visibleAlerts = isMobile
      ? [...alerts]
        .sort((left, right) => (right.weightedCount || 0) - (left.weightedCount || 0))
        .slice(0, MOBILE_MAP_ALERT_LIMIT)
      : alerts;

    prioritizedIssues.forEach((issue) => {
      const ageHours = formatAgeHours(issue.updated_at);
      const decay = issue.heatWeight || Math.exp(-0.12 * ageHours);
      const color = severityColors[issue.severity] || severityColors.stable;
      const radiusMultiplier = isMobile ? 0.82 : 1;
      const severityRadius =
        (issue.severity === "critical" ? 2200 : issue.severity === "urgent" ? 1600 : 1100) * radiusMultiplier;
      const intensity = Math.max(decay, isMobile ? 0.22 : 0.15);
      const outerRadius = severityRadius + intensity * (isMobile ? 520 : 900) * radiusMultiplier;
      const innerRadius = severityRadius * 0.45 + intensity * (isMobile ? 260 : 420) * radiusMultiplier;
      issue.currentIntensity = Number(intensity.toFixed(2));

      createMarker(issue, map).addTo(markerLayer);

      L.circle([issue.lat, issue.lng], {
        radius: outerRadius,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: Math.min((isMobile ? 0.04 : 0.06) + intensity * (isMobile ? 0.18 : 0.28), isMobile ? 0.22 : 0.34)
      }).addTo(heatLayer);

      L.circle([issue.lat, issue.lng], {
        radius: innerRadius,
        color,
        weight: 0,
        fillColor: color,
        fillOpacity: Math.min((isMobile ? 0.1 : 0.14) + intensity * (isMobile ? 0.2 : 0.3), isMobile ? 0.28 : 0.42)
      }).addTo(heatLayer);
    });

    visibleAlerts.forEach((alert) => {
      const alertCircle = L.circle([alert.latitude, alert.longitude], {
        radius: isMobile ? 1700 : 2200,
        color: severityColors[alert.severity] || severityColors.urgent,
        weight: 2,
        dashArray: "8 6",
        fillOpacity: isMobile ? 0.01 : 0.02
      }).addTo(heatLayer);

      if (isMobile) {
        alertCircle.on("click", (event) => {
          if (event?.originalEvent) {
            L.DomEvent.stop(event.originalEvent);
          }

          focusMapPoint(map, alert.latitude, alert.longitude);
          onMapPointClick({ ...alert, kind: "alert" });
        });

        createAlertClusterMarker(alert, map).addTo(markerLayer);
      }
    });

    const highest = [...prioritizedIssues].sort(
      (a, b) => (b.currentIntensity || 0) - (a.currentIntensity || 0)
    )[0];

    if (highest && !isMobile) {
      L.marker([highest.lat, highest.lng], {
        icon: L.divIcon({
          className: "heat-label",
          html: "Active cluster",
          iconSize: [96, 28],
          iconAnchor: [48, 14]
        })
      }).addTo(heatLayer);
    }
  }

  async function refreshData() {
    try {
      const data = await apiFetch("/api/issues");
      issues = data.issues || [];
      alerts = data.alerts || [];
      drawLayers();
    } catch (error) {
      if (error.message !== "Authentication required.") {
        showGlobalBanner(error.message || "Could not load map data.", "error");
      }
    }
  }

  ["typeFilter", "severityFilter", "ngoFilter"].forEach((fieldId) => {
    const field = getField(fieldId);
    if (field) {
      field.addEventListener("change", () => {
        if (fieldId === "typeFilter" && mapElementId === "intelligence-map") {
          document.querySelectorAll(".quick-filter-btn").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.quickFilter === field.value);
          });
        }

        closeMapBottomSheet();
        drawLayers();
      });
    }
  });

  if (mapElementId === "intelligence-map") {
    const quickFilterRow = document.getElementById("mapQuickFilters");
    if (quickFilterRow && quickFilterRow.dataset.bound !== "true") {
      quickFilterRow.dataset.bound = "true";
      const quickFilters = quickFilterRow.querySelectorAll(".quick-filter-btn");

      quickFilters.forEach((button) => {
        button.addEventListener("click", () => {
          quickFilters.forEach((item) => item.classList.remove("is-active"));
          button.classList.add("is-active");

          const filterValue = button.dataset.quickFilter || "all";
          const typeSelect = getField("typeFilter");
          if (typeSelect) {
            typeSelect.value = filterValue;
          }

          closeMapBottomSheet();
          drawLayers();
        });
      });
    }

    const sheet = document.getElementById("map-bottom-sheet");
    if (sheet && sheet.dataset.bound !== "true") {
      sheet.dataset.bound = "true";

      sheet.querySelector(".sheet-handle")?.addEventListener("click", closeMapBottomSheet);
      sheet.querySelector(".sheet-close")?.addEventListener("click", closeMapBottomSheet);
      document.getElementById("map-sheet-backdrop")?.addEventListener("click", closeMapBottomSheet);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeMapBottomSheet();
        }
      });
    }
  }

  if (mapElement.dataset.mobileMapBound !== "true") {
    mapElement.dataset.mobileMapBound = "true";

    map.on("click", () => {
      if (isMobileMapViewport()) {
        closeMapBottomSheet();
      }
    });

    const handleResponsiveMapRefresh = debounce(() => {
      closeMapBottomSheet();
      drawLayers();
      window.requestAnimationFrame(() => {
        map.invalidateSize();
      });
    }, 150);

    window.addEventListener("resize", handleResponsiveMapRefresh);
    window.addEventListener("orientationchange", handleResponsiveMapRefresh);
  }

  initSignalFilterPanel(mapElementId, map);
  await refreshData();
  window.requestAnimationFrame(() => {
    map.invalidateSize();
  });
  window.setInterval(refreshData, 60 * 1000);
  return { refreshData, map };
}

function syncHomePagePublicLinksVisibility(currentUser) {
  const publicPageLinksSection = document.getElementById("publicPageLinksSection");
  if (!publicPageLinksSection) {
    return;
  }

  if (currentUser) {
    publicPageLinksSection.classList.add("hidden");
    return;
  }

  publicPageLinksSection.classList.remove("hidden");
}

async function initHomePage(currentUser) {
  syncHomePagePublicLinksVisibility(currentUser);

  const overviewTargets = document.querySelectorAll("[data-overview-key]");
  if (!overviewTargets.length || !getToken()) {
    return;
  }

  try {
    const data = await apiFetch("/api/overview");
    overviewTargets.forEach((node) => {
      const key = node.dataset.overviewKey;
      if (data[key] !== undefined) {
        node.textContent = data[key];
      }
    });
  } catch (error) {
    console.error(error);
  }
}

async function initIntelligencePage(currentUser) {
  const roleKey = getRoleKey(currentUser);
  const taskList = document.getElementById("intelTaskList");
  const summaryList = document.getElementById("intelDeskSummary");
  const volunteerSummary = document.getElementById("intelVolunteerSummary");
  const taskContainer = document.getElementById("intelTaskSection");
  const taskDetailModal = document.getElementById("taskDetailModal");
  const taskDetailContent = document.getElementById("taskDetailContent");
  const taskRegistry = new Map();
  let activeTaskId = null;
  let lastFocusedElement = null;

  if (!taskList && !summaryList) {
    return;
  }

  function openTaskDetailModal(task, preserveFocus = false) {
    if (!taskDetailModal || !taskDetailContent || !task) {
      return;
    }

    activeTaskId = task.id;

    if (!preserveFocus && document.activeElement instanceof HTMLElement) {
      lastFocusedElement = document.activeElement;
    }

    taskDetailContent.innerHTML = renderTaskDetailModal(task, currentUser);
    taskDetailModal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    const closeButton = taskDetailModal.querySelector(".task-detail-close");
    if (closeButton instanceof HTMLButtonElement) {
      closeButton.focus();
    }
  }

  function closeTaskDetailModal() {
    if (!taskDetailModal || taskDetailModal.classList.contains("hidden")) {
      return;
    }

    taskDetailModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    activeTaskId = null;

    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
  }

  function syncTaskRegistry(tasks = []) {
    taskRegistry.clear();
    tasks.forEach((task) => {
      taskRegistry.set(task.id, task);
    });

    if (!activeTaskId || !taskDetailModal || taskDetailModal.classList.contains("hidden")) {
      return;
    }

    const nextTask = taskRegistry.get(activeTaskId);
    if (!nextTask) {
      closeTaskDetailModal();
      return;
    }

    openTaskDetailModal(nextTask, true);
  }

  async function refreshTasks() {
    try {
      const [taskData, overview] = await Promise.all([
        apiFetch("/api/tasks"),
        apiFetch("/api/overview")
      ]);

      const tasks = taskData.tasks || [];

      syncTaskRegistry(tasks);

      if (taskList) {
        taskList.innerHTML = renderOrderedTaskList(tasks, currentUser);
      }

      if (summaryList) {
        summaryList.innerHTML = `
          <li><span>Open needs</span><strong>${overview.openNeeds}</strong></li>
          <li><span>Critical clusters</span><strong>${overview.criticalClusters}</strong></li>
          <li><span>Volunteer readiness</span><strong>${overview.volunteerReadiness}</strong></li>
        `;
      }

      if (volunteerSummary) {
        const volunteerTasks = tasks.filter(
          (task) => (task.currentUserMatch?.score || 0) > 0 || task.assignedUsers?.length
        );
        volunteerSummary.innerHTML = volunteerTasks.length
          ? volunteerTasks
            .slice(0, 3)
            .map(
              (task) => `
                  <li>
                    <span>${task.title}</span>
                    <strong>${roleKey === "volunteer"
                  ? `${Math.round(task.currentUserMatch?.score || 0)} fit score`
                  : task.assignedUsers.map((user) => user.name).join(", ") || "Pending"
                }</strong>
                  </li>
                `
            )
            .join("")
          : `<li><span>Matching lane</span><strong>Waiting for the next run</strong></li>`;
      }

      if (taskContainer && roleKey === "volunteer") {
        const heading = taskContainer.querySelector("[data-role-copy]");
        if (heading) {
          heading.textContent = `${currentUser.name}, these are the live tasks that fit the shared response lane right now.`;
        }
      }
    } catch (error) {
      showGlobalBanner(error.message || "Could not load live task data.", "error");
    }
  }

  document.addEventListener("click", async (event) => {
    const detailTrigger = event.target.closest("[data-task-detail]");
    if (detailTrigger) {
      const taskId = detailTrigger.dataset.taskDetail;
      const task = taskRegistry.get(taskId);
      if (task) {
        openTaskDetailModal(task);
      }
      return;
    }

    const action = event.target.closest("[data-task-action]");
    if (!action) {
      return;
    }

    const taskId = action.dataset.taskId;
    const actionType = action.dataset.taskAction;

    try {
      if (actionType === "volunteer") {
        await apiFetch(`/api/tasks/${taskId}/volunteer`, {
          method: "POST"
        });
        showGlobalBanner("You’ve been added to the task.", "success");
      }

      if (actionType === "complete") {
        await apiFetch(`/api/tasks/${taskId}/complete`, {
          method: "POST"
        });
        showGlobalBanner("Task marked complete.", "success");
      }

      await refreshTasks();
    } catch (error) {
      if (!currentUser) {
        window.location.href = "./login.html";
        return;
      }
      showGlobalBanner(error.message || "Could not update the task.", "error");
    }
  });

  if (taskDetailModal) {
    taskDetailModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-task-modal]")) {
        closeTaskDetailModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !taskDetailModal.classList.contains("hidden")) {
        closeTaskDetailModal();
      }
    });
  }

  await refreshTasks();
}

async function initImpactPage(currentUser) {
  const roleKey = getRoleKey(currentUser);
  const metricCards = document.getElementById("csrMetricCards");
  const narrative = document.getElementById("csrNarrative");
  const chartPanel = document.getElementById("csrImpactChart");
  const receiptList = document.getElementById("csrReceiptList");
  const receiptButton = document.getElementById("downloadReceiptButton");
  const authPrompt = document.getElementById("csrAuthPrompt");
  const loadingState = document.getElementById("csrLoadingState");
  const filterForm = document.getElementById("csrFilterForm");
  const companyField = document.getElementById("csrCompanyFilter");
  const startDateField = document.getElementById("csrStartDate");
  const endDateField = document.getElementById("csrEndDate");

  if (!metricCards && !chartPanel && !receiptList) {
    return;
  }

  if (!currentUser || !["csr", "ngo_admin"].includes(roleKey)) {
    if (authPrompt) {
      authPrompt.classList.remove("hidden");
    }
    return;
  }

  let selectedNgoId = null;
  let selectedNgoName = null;

  const dashboardTabBtn = document.getElementById("btnDashboardTab");
  const partnersTabBtn = document.getElementById("btnPartnersTab");
  const dashboardContent = document.getElementById("tabDashboardContent");
  const partnersContent = document.getElementById("tabPartnersContent");
  const ngoListContainer = document.getElementById("ngoList");
  const registerNgoForm = document.getElementById("registerNgoForm");
  const ngoFilterBanner = document.getElementById("ngoFilterBanner");
  const ngoFilterName = document.getElementById("ngoFilterName");
  const clearNgoFilterBtn = document.getElementById("btnClearNgoFilter");

  function switchTab(tab) {
    if (!dashboardContent || !partnersContent) {
      return;
    }
    if (tab === "dashboard") {
      dashboardTabBtn?.classList.remove("ghost-button");
      dashboardTabBtn?.classList.add("cta-button");
      partnersTabBtn?.classList.remove("cta-button");
      partnersTabBtn?.classList.add("ghost-button");
      dashboardContent.classList.remove("hidden");
      partnersContent.classList.add("hidden");
    } else if (tab === "partners") {
      partnersTabBtn?.classList.remove("ghost-button");
      partnersTabBtn?.classList.add("cta-button");
      dashboardTabBtn?.classList.remove("cta-button");
      dashboardTabBtn?.classList.add("ghost-button");
      partnersContent.classList.remove("hidden");
      dashboardContent.classList.add("hidden");
      void loadNgoList();
    }
  }

  if (dashboardTabBtn) {
    dashboardTabBtn.addEventListener("click", () => switchTab("dashboard"));
  }
  if (partnersTabBtn) {
    partnersTabBtn.addEventListener("click", () => switchTab("partners"));
  }

  function updateFilterBanner() {
    if (!ngoFilterBanner || !ngoFilterName) return;
    if (selectedNgoId && selectedNgoName) {
      ngoFilterName.textContent = selectedNgoName;
      ngoFilterBanner.classList.remove("hidden");
    } else {
      ngoFilterBanner.classList.add("hidden");
    }
  }

  if (clearNgoFilterBtn) {
    clearNgoFilterBtn.addEventListener("click", async () => {
      selectedNgoId = null;
      selectedNgoName = null;
      updateFilterBanner();
      try {
        setLoadingState(true, "Clearing NGO filter...");
        await loadReport();
      } catch (error) {
        showGlobalBanner(error.message || "Could not reload the report.", "error");
      } finally {
        setLoadingState(false);
      }
    });
  }

  let cachedNgos = [];

  function getStatusBadge(ngo) {
    if (!ngo.latestActivity) {
      return { label: "New", tone: "new" };
    }
    const daysSince = Math.floor((Date.now() - new Date(ngo.latestActivity).getTime()) / 86400000);
    if (daysSince <= 30) {
      return { label: "Active", tone: "active" };
    } else if (daysSince <= 90) {
      return { label: "Moderate", tone: "moderate" };
    }
    return { label: "Inactive", tone: "inactive" };
  }

  function renderNgoCard(ngo) {
    const badge = getStatusBadge(ngo);
    const lastActive = ngo.latestActivity
      ? new Date(ngo.latestActivity).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "No activity yet";
    return `
      <article class="task-card compact stable ngo-partner-card">
        <div class="ngo-partner-card__top">
          <span class="ngo-partner-badge" data-status-tone="${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>
          <span class="ngo-partner-card__activity">Last active: ${escapeHtml(lastActive)}</span>
        </div>
        <h3 class="ngo-partner-card__name">${escapeHtml(ngo.name)}</h3>
        <p class="ngo-partner-card__email">${escapeHtml(ngo.email)}</p>
        <div class="ngo-partner-card__meta">
          <span class="ngo-partner-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml(ngo.baseLocation || "No location")}
          </span>
          <span class="ngo-partner-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            ${ngo.completedTasks}/${ngo.totalTasks} tasks done
          </span>
          <span class="ngo-partner-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${ngo.peopleServed.toLocaleString()} people served
          </span>
        </div>
        <div class="ngo-partner-card__actions">
          <button class="cta-button show-ngo-details-btn ngo-dashboard-button" type="button" data-id="${escapeHtml(ngo.id)}" data-name="${escapeHtml(ngo.name)}">View on Dashboard</button>
        </div>
      </article>
    `;
  }

  function renderFilteredNgos(searchTerm) {
    if (!ngoListContainer) return;
    const term = (searchTerm || "").toLowerCase().trim();
    const filtered = term
      ? cachedNgos.filter(
        (ngo) =>
          ngo.name.toLowerCase().includes(term) ||
          (ngo.baseLocation || "").toLowerCase().includes(term)
      )
      : cachedNgos;

    if (!filtered.length) {
      ngoListContainer.innerHTML = `<div class="empty-state"><p>${term ? "No partners match your search." : "No NGO partners registered yet."
        }</p></div>`;
      return;
    }

    ngoListContainer.innerHTML = filtered.map(renderNgoCard).join("");

    ngoListContainer.querySelectorAll(".show-ngo-details-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ngoId = btn.getAttribute("data-id");
        const ngoName = btn.getAttribute("data-name");
        selectedNgoId = ngoId;
        selectedNgoName = ngoName;

        updateFilterBanner();
        switchTab("dashboard");

        try {
          setLoadingState(true, `Filtering report for ${ngoName}...`);
          await loadReport();
        } catch (error) {
          showGlobalBanner(error.message || "Could not load filtered report.", "error");
        } finally {
          setLoadingState(false);
        }
      });
    });
  }

  const ngoSearchInput = document.getElementById("ngoSearchInput");
  if (ngoSearchInput) {
    let searchDebounce = null;
    ngoSearchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        renderFilteredNgos(ngoSearchInput.value);
      }, 200);
    });
  }

  async function loadNgoList() {
    if (!ngoListContainer) return;
    try {
      ngoListContainer.innerHTML = '<div class="empty-state"><p>Loading NGO partners...</p></div>';
      const result = await apiFetch("/api/ngos");
      cachedNgos = result.ngos || [];
      if (ngoSearchInput) ngoSearchInput.value = "";
      renderFilteredNgos("");
    } catch (error) {
      ngoListContainer.innerHTML = `<div class="empty-state error"><p>Error loading NGO partners: ${escapeHtml(error.message)}</p></div>`;
    }
  }

  if (registerNgoForm) {
    registerNgoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(registerNgoForm);
      const name = formData.get("name")?.trim();
      const email = formData.get("email")?.trim();
      const password = formData.get("password");
      const baseLocation = formData.get("baseLocation")?.trim();

      if (!name || !email || !password) {
        showGlobalBanner("Name, email, and password are required.", "error");
        return;
      }

      try {
        setLoadingState(true, "Registering new NGO partner...");
        await apiFetch("/api/ngos", {
          method: "POST",
          body: { name, email, password, baseLocation }
        });
        showGlobalBanner(`Successfully registered partner: ${name}`, "success");
        registerNgoForm.reset();
        await loadNgoList();
      } catch (error) {
        showGlobalBanner(error.message || "Failed to register NGO partner.", "error");
      } finally {
        setLoadingState(false);
      }
    });
  }

  function setLoadingState(isLoading, message = "") {
    if (loadingState) {
      loadingState.classList.toggle("hidden", !isLoading);
      if (message) {
        const detail = loadingState.querySelector("span");
        if (detail) {
          detail.textContent = message;
        }
      }
    }

    if (filterForm) {
      const controls = filterForm.querySelectorAll("button, select, input");
      controls.forEach((control) => {
        control.disabled = isLoading;
      });
    }

    if (receiptButton) {
      receiptButton.disabled = isLoading;
    }
  }

  async function loadCompanies() {
    if (!companyField) {
      return;
    }

    const result = await apiFetch("/api/companies");
    const companies = result.companies || [];
    if (!companies.length) {
      companyField.innerHTML = "";
      throw new Error("No company is linked to this CSR account yet.");
    }
    companyField.innerHTML = companies
      .map(
        (company) => `<option value="${company.id}" ${company.id === currentUser.companyId ? "selected" : ""
          }>${company.name}</option>`
      )
      .join("");
  }

  function hydrateCompanyFieldFromSession() {
    if (!companyField || roleKey !== "csr") {
      return;
    }

    const fallbackName = currentUser.companyName || "Linked company";
    companyField.innerHTML = `<option value="${currentUser.companyId || ""}">${fallbackName}</option>`;
  }

  function renderMetrics(report) {
    const totals = report.totals || {};

    if (metricCards) {
      metricCards.innerHTML = `
        <article class="metric-card">
          <span class="panel-kicker">Volunteer hours</span>
          <strong>${totals.volunteerHours || 0}</strong>
          <p class="muted">Logged through ${report.company.name} contributions and field work.</p>
          <div class="spark"></div>
        </article>
        <article class="metric-card">
          <span class="panel-kicker">Tasks funded</span>
          <strong>${totals.tasksFunded || 0}</strong>
          <p class="muted">Completed task flows linked to this partner.</p>
          <div class="spark"></div>
        </article>
        <article class="metric-card">
          <span class="panel-kicker">People served</span>
          <strong>${totals.peopleServed || 0}</strong>
          <p class="muted">Estimated direct reach across funded interventions.</p>
          <div class="spark"></div>
        </article>
        <article class="metric-card">
          <span class="panel-kicker">Funds tracked</span>
          <strong>₹${Number(totals.funds || 0).toLocaleString("en-IN")}</strong>
          <p class="muted">Contribution volume tied to operational reporting.</p>
          <div class="spark"></div>
        </article>
      `;
    }

    if (narrative) {
      narrative.textContent = report.narrative;
    }

    if (receiptList) {
      const combinedRows = [
        ...(report.receiptLines || []).map((line) => ({
          title: line.title,
          meta: `${line.locationName} · ${line.volunteers} volunteers · ${line.outputMetric || line.completedAt}`
        })),
        ...(report.recentReports || []).map((item) => ({
          title: "Previous export",
          meta: new Date(item.generatedAt).toLocaleString("en-IN")
        }))
      ];

      receiptList.innerHTML = combinedRows.length
        ? combinedRows
          .map(
            (line) => `
                <li>
                  <span>${line.title}</span>
                  <strong>${line.meta}</strong>
                </li>
              `
          )
          .join("")
        : `<li><span>No receipt lines yet</span><strong>Waiting on completed tasks</strong></li>`;
    }
  }

  let _csrAreaChart = null;
  let _csrDonutChart = null;

  function renderImpactChart(report) {
    if (!chartPanel) {
      return;
    }

    const series = report.monthlyHours || [];
    const totals = report.totals || {};
    const catSummary = report.categorySummary || [];

    if (!series.length && !catSummary.length) {
      if (_csrAreaChart) { _csrAreaChart.destroy(); _csrAreaChart = null; }
      if (_csrDonutChart) { _csrDonutChart.destroy(); _csrDonutChart = null; }
      chartPanel.innerHTML = `
        <div class="chart-placeholder">
          No volunteer-hour data is available for the selected range yet.
        </div>
      `;
      return;
    }

    if (_csrAreaChart) { _csrAreaChart.destroy(); _csrAreaChart = null; }
    if (_csrDonutChart) { _csrDonutChart.destroy(); _csrDonutChart = null; }

    /* ── Pad sparse monthly data with surrounding empty months for visual context ── */
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let paddedSeries = series;
    if (series.length > 0 && series.length < 4) {
      const firstMonthStr = series[0].month;
      let firstIdx = MONTH_NAMES.indexOf(firstMonthStr);
      if (firstIdx === -1) firstIdx = 0;
      const startIdx = Math.max(0, firstIdx - 2);
      const lastMonthStr = series[series.length - 1].month;
      let lastIdx = MONTH_NAMES.indexOf(lastMonthStr);
      if (lastIdx === -1) lastIdx = firstIdx;
      const endIdx = Math.min(11, lastIdx + 2);
      const lookup = {};
      series.forEach(function (e) { lookup[e.month] = e.hours; });
      paddedSeries = [];
      for (let i = startIdx; i <= endIdx; i++) {
        paddedSeries.push({ month: MONTH_NAMES[i], hours: lookup[MONTH_NAMES[i]] || 0 });
      }
    }

    /* ── Donut palette ── */
    const DONUT_COLORS = [
      "rgba(224, 122, 106, 0.88)",
      "rgba(106, 168, 158, 0.88)",
      "rgba(186, 148, 128, 0.88)",
      "rgba(142, 124, 195, 0.82)",
      "rgba(108, 172, 216, 0.82)",
      "rgba(218, 176, 98, 0.82)",
      "rgba(168, 132, 168, 0.78)"
    ];

    /* ── Build DOM skeleton ── */
    chartPanel.innerHTML = `
      <div class="impact-viz">
        <div class="impact-viz__stats">
          <div class="impact-viz__stat">
            <span class="impact-viz__stat-value" data-countup="${totals.volunteerHours || 0}">0</span>
            <span class="impact-viz__stat-label">Volunteer hrs</span>
          </div>
          <div class="impact-viz__stat-divider"></div>
          <div class="impact-viz__stat">
            <span class="impact-viz__stat-value" data-countup="${totals.tasksFunded || 0}">0</span>
            <span class="impact-viz__stat-label">Tasks funded</span>
          </div>
          <div class="impact-viz__stat-divider"></div>
          <div class="impact-viz__stat">
            <span class="impact-viz__stat-value" data-countup="${totals.peopleServed || 0}">0</span>
            <span class="impact-viz__stat-label">People served</span>
          </div>
          <div class="impact-viz__stat-divider"></div>
          <div class="impact-viz__stat">
            <span class="impact-viz__stat-value" data-countup="${totals.funds || 0}" data-prefix="₹">₹0</span>
            <span class="impact-viz__stat-label">Funds tracked</span>
          </div>
        </div>
        <div class="impact-viz__charts">
          <div class="impact-viz__area-wrap">
            <div class="impact-viz__area-header">
              <span class="impact-viz__area-title">Volunteer hours trend</span>
              <span class="impact-viz__area-badge">${paddedSeries.length} months</span>
            </div>
            <div class="impact-viz__area-canvas-wrap">
              <canvas id="csrImpactCanvas"></canvas>
            </div>
          </div>
          ${catSummary.length ? `
          <div class="impact-viz__donut-wrap">
            <div class="impact-viz__area-header">
              <span class="impact-viz__area-title">Task breakdown</span>
            </div>
            <div class="impact-viz__donut-canvas-wrap">
              <canvas id="csrDonutCanvas"></canvas>
            </div>
            <div class="impact-viz__donut-legend" id="csrDonutLegend"></div>
          </div>` : ""}
        </div>
      </div>
    `;

    /* ── Count-up animation ── */
    chartPanel.querySelectorAll("[data-countup]").forEach(function (el) {
      const target = Number(el.dataset.countup) || 0;
      const prefix = el.dataset.prefix || "";
      const duration = 1100;
      const start = performance.now();
      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(eased * target);
        el.textContent = prefix + current.toLocaleString("en-IN");
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    const fontFamily = "'Manrope', system-ui, -apple-system, sans-serif";

    /* ── Crosshair hover plugin ── */
    const crosshairPlugin = {
      id: "csrCrosshair",
      afterDraw: function (chart) {
        if (!chart.tooltip || !chart.tooltip.getActiveElements().length) return;
        const activePoint = chart.tooltip.getActiveElements()[0];
        const ctx2 = chart.ctx;
        const x = activePoint.element.x;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;
        ctx2.save();
        ctx2.beginPath();
        ctx2.moveTo(x, topY);
        ctx2.lineTo(x, bottomY);
        ctx2.lineWidth = 1;
        ctx2.strokeStyle = "rgba(224, 122, 106, 0.28)";
        ctx2.setLineDash([6, 4]);
        ctx2.stroke();
        ctx2.restore();

        /* Glow dot */
        const y = activePoint.element.y;
        ctx2.save();
        ctx2.beginPath();
        ctx2.arc(x, y, 12, 0, Math.PI * 2);
        ctx2.fillStyle = "rgba(224, 122, 106, 0.12)";
        ctx2.fill();
        ctx2.restore();
      }
    };

    /* ── Area chart ── */
    const areaCanvas = document.getElementById("csrImpactCanvas");
    if (areaCanvas && typeof Chart !== "undefined" && paddedSeries.length) {
      const aCtx = areaCanvas.getContext("2d");

      const gFill = aCtx.createLinearGradient(0, 0, 0, 220);
      gFill.addColorStop(0, "rgba(224, 122, 106, 0.36)");
      gFill.addColorStop(0.45, "rgba(196, 148, 128, 0.14)");
      gFill.addColorStop(1, "rgba(106, 168, 158, 0.01)");

      const gLine = aCtx.createLinearGradient(0, 0, areaCanvas.parentElement.clientWidth || 400, 0);
      gLine.addColorStop(0, "rgba(224, 122, 106, 0.95)");
      gLine.addColorStop(0.45, "rgba(196, 140, 116, 0.95)");
      gLine.addColorStop(1, "rgba(106, 168, 158, 0.95)");

      _csrAreaChart = new Chart(aCtx, {
        type: "line",
        plugins: [crosshairPlugin],
        data: {
          labels: paddedSeries.map(function (e) { return e.month; }),
          datasets: [{
            label: "Volunteer hours",
            data: paddedSeries.map(function (e) { return e.hours; }),
            fill: true,
            backgroundColor: gFill,
            borderColor: gLine,
            borderWidth: 3,
            tension: 0.45,
            pointBackgroundColor: function (ctx) {
              var val = ctx.parsed ? ctx.parsed.y : 0;
              return val > 0 ? "rgba(224, 122, 106, 1)" : "rgba(224, 122, 106, 0.3)";
            },
            pointBorderColor: "rgba(255,255,255,0.95)",
            pointBorderWidth: 2.5,
            pointRadius: function (ctx) {
              var val = ctx.parsed ? ctx.parsed.y : 0;
              return val > 0 ? 6 : 3;
            },
            pointHoverRadius: 10,
            pointHoverBackgroundColor: "rgba(224, 122, 106, 1)",
            pointHoverBorderColor: "#fff",
            pointHoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 1200,
            easing: "easeOutQuart",
            delay: function (ctx) { return ctx.dataIndex * 80; }
          },
          interaction: { mode: "index", intersect: false },
          layout: { padding: { top: 10, right: 16, bottom: 4, left: 4 } },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: {
                color: "rgba(43,43,43,0.52)",
                font: { family: fontFamily, size: 11.5, weight: "600" },
                padding: 10
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: "rgba(43,43,43,0.05)", drawTicks: false },
              border: { display: false, dash: [4, 4] },
              ticks: {
                color: "rgba(43,43,43,0.40)",
                font: { family: fontFamily, size: 11, weight: "500" },
                padding: 12,
                maxTicksLimit: 6,
                callback: function (v) { return v + " hrs"; }
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: "rgba(34,30,26,0.94)",
              titleColor: "#fff",
              bodyColor: "rgba(255,255,255,0.86)",
              titleFont: { family: fontFamily, size: 13, weight: "700" },
              bodyFont: { family: fontFamily, size: 12, weight: "500" },
              padding: { top: 12, right: 16, bottom: 12, left: 16 },
              cornerRadius: 16,
              displayColors: false,
              caretSize: 7,
              caretPadding: 10,
              callbacks: {
                title: function (items) { return items[0] ? items[0].label : ""; },
                label: function (item) { return item.parsed.y + " volunteer hours logged"; }
              }
            }
          }
        }
      });
    }

    /* ── Donut chart ── */
    var donutCanvas = document.getElementById("csrDonutCanvas");
    var donutLegend = document.getElementById("csrDonutLegend");
    if (donutCanvas && catSummary.length && typeof Chart !== "undefined") {
      var dCtx = donutCanvas.getContext("2d");
      var totalTasks = catSummary.reduce(function (s, c) { return s + c.value; }, 0);

      /* Center label plugin */
      var centerTextPlugin = {
        id: "csrCenterText",
        afterDraw: function (chart) {
          var width = chart.width;
          var height = chart.height;
          var c = chart.ctx;
          c.save();
          c.textAlign = "center";
          c.textBaseline = "middle";
          var centerX = width / 2;
          var centerY = height / 2;
          c.font = "800 " + Math.round(height * 0.16) + "px " + fontFamily;
          c.fillStyle = "rgba(43,43,43,0.88)";
          c.fillText(totalTasks, centerX, centerY - 6);
          c.font = "600 " + Math.round(height * 0.07) + "px " + fontFamily;
          c.fillStyle = "rgba(43,43,43,0.48)";
          c.fillText("tasks", centerX, centerY + Math.round(height * 0.1));
          c.restore();
        }
      };

      _csrDonutChart = new Chart(dCtx, {
        type: "doughnut",
        plugins: [centerTextPlugin],
        data: {
          labels: catSummary.map(function (c) { return c.label; }),
          datasets: [{
            data: catSummary.map(function (c) { return c.value; }),
            backgroundColor: catSummary.map(function (_, i) { return DONUT_COLORS[i % DONUT_COLORS.length]; }),
            borderColor: "rgba(255,255,255,0.9)",
            borderWidth: 3,
            borderRadius: 6,
            hoverBorderColor: "#fff",
            hoverBorderWidth: 4,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "66%",
          animation: {
            animateRotate: true,
            duration: 1000,
            easing: "easeOutQuart"
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(34,30,26,0.94)",
              titleColor: "#fff",
              bodyColor: "rgba(255,255,255,0.86)",
              titleFont: { family: fontFamily, size: 13, weight: "700" },
              bodyFont: { family: fontFamily, size: 12, weight: "500" },
              padding: { top: 10, right: 14, bottom: 10, left: 14 },
              cornerRadius: 14,
              displayColors: true,
              boxWidth: 10,
              boxHeight: 10,
              boxPadding: 6,
              callbacks: {
                label: function (item) {
                  var pct = totalTasks ? Math.round((item.parsed / totalTasks) * 100) : 0;
                  return " " + item.label + ": " + item.parsed + " (" + pct + "%)";
                }
              }
            }
          }
        }
      });

      /* Custom legend */
      if (donutLegend) {
        donutLegend.innerHTML = catSummary.map(function (c, i) {
          return '<div class="impact-viz__legend-item">' +
            '<span class="impact-viz__legend-dot" style="background:' + DONUT_COLORS[i % DONUT_COLORS.length] + '"></span>' +
            '<span class="impact-viz__legend-text">' + c.label + '</span>' +
            '<span class="impact-viz__legend-count">' + c.value + '</span>' +
            '</div>';
        }).join("");
      }
    }
  }

  async function loadReport() {
    const selectedCompanyId = companyField?.value || currentUser.companyId || "";
    if (!selectedCompanyId && roleKey === "ngo_admin") {
      throw new Error("Choose a company to load the CSR dashboard.");
    }

    const filters = {
      startDate: startDateField?.value || "",
      endDate: endDateField?.value || ""
    };
    if (selectedNgoId) {
      filters.ngoId = selectedNgoId;
    }
    const queryString = buildQueryString(filters);
    const report =
      selectedCompanyId && roleKey === "ngo_admin"
        ? await apiFetch(`/api/companies/${selectedCompanyId}/csr-stats${queryString}`)
        : await apiFetch(`/api/csr-report${queryString}`);
    renderMetrics(report);
    renderImpactChart(report);

    if (receiptButton) {
      receiptButton.classList.remove("hidden");
      receiptButton.onclick = async () => {
        try {
          setLoadingState(true, "Generating the branded PDF report.");
          const generated = await apiFetch(`/api/companies/${report.company.id}/report`, {
            method: "POST",
            body: filters
          });
          window.open(generated.downloadUrl, "_blank");
          showGlobalBanner("CSR report exported.", "success");
        } catch (error) {
          showGlobalBanner(error.message || "Could not export the CSR report.", "error");
        } finally {
          setLoadingState(false);
        }
      };
    }
  }

  try {
    setLoadingState(true);
    hydrateCompanyFieldFromSession();
    updateFilterBanner();
    if (roleKey === "ngo_admin") {
      await loadCompanies();
    } else {
      void loadCompanies().catch(() => { });
    }
    await loadReport();

    // Check if we should default to the partners tab
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get("tab") === "partners" ? "partners" : "dashboard";
    switchTab(initialTab);

    setLoadingState(false);

    if (filterForm) {
      filterForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          setLoadingState(true, "Refreshing the CSR metrics for the selected range.");
          await loadReport();
          showGlobalBanner("CSR metrics updated for the selected date range.", "success");
        } catch (error) {
          showGlobalBanner(error.message || "Could not load the CSR dashboard.", "error");
        } finally {
          setLoadingState(false);
        }
      });
    }
  } catch (error) {
    setLoadingState(false);
    if (chartPanel) {
      chartPanel.innerHTML = `
        <div class="chart-placeholder">
          CSR data could not be loaded yet. Try refreshing after confirming the linked company account.
        </div>
      `;
    }
    showGlobalBanner(error.message || "Could not load the CSR dashboard.", "error");
  }
}

async function initAdminPage() {
  const summary = document.getElementById("adminSummary");
  const reviewQueue = document.getElementById("reviewQueue");
  const alertStack = document.getElementById("adminAlerts");
  const matchButton = document.getElementById("runMatchingButton");
  const matchResults = document.getElementById("matchResults");

  if (!summary && !reviewQueue) {
    return;
  }

  async function refreshAdmin() {
    try {
      const [summaryData, reviewData] = await Promise.all([
        apiFetch("/api/admin-summary"),
        apiFetch("/api/review-queue")
      ]);

      if (summary) {
        summary.innerHTML = summaryData.metrics
          .map(
            (metric, index) => `
              <article class="dashboard-shell ${index % 4 === 0 ? "coral" : index % 4 === 1 ? "blue" : index % 4 === 2 ? "teal" : "lavender"}">
                <span class="panel-kicker">${metric.label}</span>
                <h3>${metric.value}</h3>
                <p class="muted">System-wide operational signal for the current shift.</p>
              </article>
            `
          )
          .join("");
      }

      if (alertStack) {
        alertStack.innerHTML = summaryData.alerts.length
          ? summaryData.alerts
            .map(
              (alert) => `
                  <article class="dashboard-shell coral">
                    <span class="severity-badge ${alert.severity}">${capitalize(alert.severity)}</span>
                    <h3>${alert.title}</h3>
                    <p class="muted">${alert.explanation}</p>
                    ${alert.evidence?.length
                  ? `<p class="helper-copy">${alert.evidence.join(" · ")}</p>`
                  : ""
                }
                  </article>
                `
            )
            .join("")
          : renderEmptyState("No live alerts need admin attention.");
      }

      if (reviewQueue) {
        reviewQueue.innerHTML = reviewData.items.length
          ? reviewData.items
            .map(
              (item) => `
                  <article class="task-card" data-review-card data-review-id="${escapeHtml(item.id)}">
                    <span class="severity-badge ${escapeHtml(item.severity || "stable")}">${escapeHtml(
                capitalize(item.severity || "stable")
              )}</span>
                    <h3>${escapeHtml(item.title || "Untitled need")}</h3>
                    <p class="helper-copy">Source: ${escapeHtml(item.source || "ocr")} · Confidence: ${escapeHtml(
                formatConfidence(item.confidence)
              )}</p>
                    ${buildReviewImageGalleryMarkup(item)}
                    <form class="stack-form queue-editor" data-review-form data-need-id="${escapeHtml(item.id)}">
                      <label>
                        Title
                        <input name="title" value="${escapeHtml(item.title || "")}" />
                      </label>
                      <label>
                        Description
                        <textarea name="description">${escapeHtml(item.description || "")}</textarea>
                      </label>
                      <label>
                        Corrected text
                        <textarea name="correctedText">${escapeHtml(
                item.correctedText || item.rawText || item.description || ""
              )}</textarea>
                      </label>
                      <label>
                        Severity
                        <select name="severity">
                          <option value="critical" ${item.severity === "critical" ? "selected" : ""}>Critical</option>
                          <option value="urgent" ${item.severity === "urgent" ? "selected" : ""}>Urgent</option>
                          <option value="stable" ${item.severity === "stable" ? "selected" : ""}>Stable</option>
                        </select>
                      </label>
                      <label>
                        Location
                        <input name="locationName" value="${escapeHtml(item.locationName || "")}" />
                      </label>
                      ${item.flaggedWords?.length
                  ? `<p class="helper-copy">Flagged terms: ${escapeHtml(item.flaggedWords.join(", "))}</p>`
                  : ""
                }
                      ${item.evidence?.length
                  ? `<p class="helper-copy">Evidence: ${escapeHtml(item.evidence.join(" · "))}</p>`
                  : ""
                }
                      <div class="review-card-actions">
                        <button class="cta-button" type="submit">Approve and update</button>
                        <button class="danger-button" type="button" data-review-reject-toggle>Reject</button>
                      </div>
                      <div class="review-reject-confirm hidden" data-reject-confirm>
                        <p class="helper-copy">Are you sure you want to reject this task?</p>
                        <div class="review-card-actions">
                          <button class="danger-button" type="button" data-review-reject-confirm>Confirm reject</button>
                          <button class="ghost-button" type="button" data-review-reject-cancel>Cancel</button>
                        </div>
                      </div>
                    </form>
                  </article>
                `
            )
            .join("")
          : renderEmptyState("The review queue is clear right now.");
      }
    } catch (error) {
      showGlobalBanner(error.message || "Could not load the admin dashboard.", "error");
    }
  }

  if (matchButton) {
    matchButton.addEventListener("click", async () => {
      try {
        const result = await apiFetch("/api/match", {
          method: "POST"
        });

        if (matchResults) {
          matchResults.innerHTML = result.matches.length
            ? result.matches
              .map(
                (match) => `
                    <article class="dashboard-shell teal">
                      <h3>${match.taskTitle}</h3>
                      <p class="muted">${match.locationName}</p>
                      <p class="helper-copy">
                        Required: ${(match.requiredSkills || []).map(prettyLabel).join(", ") || "General support"}
                      </p>
                      ${match.complementarySkills?.length
                    ? `<p class="helper-copy">Complementary: ${match.complementarySkills.map(prettyLabel).join(", ")}</p>`
                    : ""
                  }
                      <p>${match.volunteers.length ? match.volunteers.map((user) => user.name).join(" + ") : "No strong match yet"}</p>
                      <p class="helper-copy">${match.safetyMode === "buddy_required" ? "Buddy team required" : "Solo-safe assignment"}</p>
                      ${match.volunteers.length
                    ? `<p class="helper-copy">${match.volunteers
                      .map((user) => `${user.name}: ${(user.reasons || []).join(", ")}`)
                      .join(" · ")}</p>`
                    : ""
                  }
                      ${match.warnings?.length
                    ? `<p class="helper-copy">${match.warnings.join(" · ")}</p>`
                    : ""
                  }
                    </article>
                  `
              )
              .join("")
            : renderEmptyState("No pairings were created.");
        }

        showGlobalBanner("Volunteer matching has been refreshed.", "success");
        await refreshAdmin();
      } catch (error) {
        showGlobalBanner(error.message || "Could not run volunteer matching.", "error");
      }
    });
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-review-form]");
    if (!form) {
      return;
    }

    event.preventDefault();
    const needId = form.dataset.needId;
    const formData = new FormData(form);

    try {
      await apiFetch(`/api/needs/${needId}`, {
        method: "PUT",
        body: Object.fromEntries(formData.entries())
      });
      showGlobalBanner("Review item approved and saved.", "success");
      await refreshAdmin();
    } catch (error) {
      showGlobalBanner(error.message || "Could not update the review item.", "error");
    }
  });

  document.addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("[data-review-reject-toggle]");
    if (toggleButton) {
      const card = toggleButton.closest("[data-review-card]");
      const confirmPanel = card?.querySelector("[data-reject-confirm]");
      if (!card || !confirmPanel) {
        return;
      }

      reviewQueue?.querySelectorAll("[data-reject-confirm]").forEach((panel) => {
        if (panel !== confirmPanel) {
          panel.classList.add("hidden");
        }
      });
      confirmPanel.classList.toggle("hidden");
      return;
    }

    const cancelButton = event.target.closest("[data-review-reject-cancel]");
    if (cancelButton) {
      const confirmPanel = cancelButton.closest("[data-reject-confirm]");
      if (confirmPanel) {
        confirmPanel.classList.add("hidden");
      }
      return;
    }

    const confirmButton = event.target.closest("[data-review-reject-confirm]");
    if (!confirmButton) {
      return;
    }

    const card = confirmButton.closest("[data-review-card]");
    const reviewId = card?.dataset.reviewId;
    if (!card || !reviewId) {
      return;
    }

    const existingError = card.querySelector("[data-review-error]");
    if (existingError) {
      existingError.remove();
    }

    try {
      confirmButton.setAttribute("disabled", "true");
      await apiFetch(`/api/needs/${reviewId}/reject`, {
        method: "PUT"
      });
      card.remove();
      if (reviewQueue && !reviewQueue.querySelector("[data-review-card]")) {
        reviewQueue.innerHTML = renderEmptyState("No items pending review.");
      }
      showGlobalBanner("Review item rejected.", "info");
    } catch (error) {
      confirmButton.removeAttribute("disabled");
      const errorMessage = document.createElement("p");
      errorMessage.className = "helper-copy";
      errorMessage.dataset.reviewError = "true";
      errorMessage.textContent = error.message || "Could not reject the review item.";
      confirmButton.closest("[data-reject-confirm]")?.append(errorMessage);
    }
  });

  await refreshAdmin();
}

async function initReportPage() {
  const ocrForm = document.getElementById("ocrUploadForm");
  const audioForm = document.getElementById("audioUploadForm");
  const manualForm = document.getElementById("manualNeedForm");
  const ocrFileInput = ocrForm?.querySelector('input[name="image"]');
  const ocrSubmitButton = document.getElementById("ocrSubmitButton");
  const ocrImagePreview = document.getElementById("ocrImagePreview");
  const ocrProgressPanel = document.getElementById("ocrProgressPanel");
  const ocrUploadError = document.getElementById("ocrUploadError");
  const recorderButton = document.getElementById("voiceRecorderButton");
  const voicePreview = document.getElementById("voicePreview");
  const ocrResult = document.getElementById("ocrResult");
  const ocrResultModal = document.getElementById("ocrResultModal");
  const ocrResultModalContent = document.getElementById("ocrResultModalContent");
  const ocrResultModalClose = document.getElementById("ocrResultModalClose");
  const audioResult = document.getElementById("audioResult");
  const manualResult = document.getElementById("manualResult");
  let mediaRecorder = null;
  let recordedAudioBlob = null;
  let recordedChunks = [];
  let selectedSurveyFiles = [];
  let latestOcrPayload = null;
  let activeOcrModalIndex = 0;
  let isSubmittingOcr = false;
  let ocrProgressSteps = [];
  let ocrProgressTimerIds = [];
  let ocrProgressFadeTimerId = 0;
  let ocrSlowNoticeTimerId = 0;
  let showSlowOcrNotice = false;
  const surveyPreviewUrls = new Map();
  const ocrProgressLabels = [
    "Uploading image...",
    "Running OCR extraction...",
    "Analysing with Gemini...",
    "Structuring results..."
  ];

  if (!ocrForm && !audioForm && !manualForm) {
    return;
  }

  function syncSelectedSurveyFiles() {
    if (!ocrFileInput) {
      return;
    }

    if (typeof DataTransfer === "undefined") {
      return;
    }

    const transfer = new DataTransfer();
    selectedSurveyFiles.forEach((file) => transfer.items.add(file));
    ocrFileInput.files = transfer.files;
    ocrFileInput.required = selectedSurveyFiles.length === 0;
  }

  function releaseSurveyPreview(file) {
    const key = createFileSelectionKey(file);
    const previewUrl = surveyPreviewUrls.get(key);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      surveyPreviewUrls.delete(key);
    }
  }

  function resetSurveySelection() {
    selectedSurveyFiles.forEach((file) => releaseSurveyPreview(file));
    selectedSurveyFiles = [];
    if (ocrFileInput) {
      ocrFileInput.value = "";
    }
    syncSelectedSurveyFiles();
    renderSelectedSurveyFiles();
  }

  function setOcrSubmitState(loading = false) {
    isSubmittingOcr = loading;
    if (!ocrSubmitButton) {
      return;
    }

    ocrSubmitButton.disabled = loading || selectedSurveyFiles.length === 0;
    ocrSubmitButton.innerHTML = loading
      ? '<span class="ocr-submit-label"><span class="ocr-submit-spinner" aria-hidden="true"></span>Processing...</span>'
      : "Run OCR";
  }

  function setOcrUploadError(message = "") {
    if (!ocrUploadError) {
      return;
    }

    ocrUploadError.textContent = message;
    ocrUploadError.classList.toggle("hidden", !message);
  }

  function clearOcrProgressTimers() {
    ocrProgressTimerIds.forEach((timerId) => window.clearTimeout(timerId));
    ocrProgressTimerIds = [];
    if (ocrProgressFadeTimerId) {
      window.clearTimeout(ocrProgressFadeTimerId);
      ocrProgressFadeTimerId = 0;
    }
    if (ocrSlowNoticeTimerId) {
      window.clearTimeout(ocrSlowNoticeTimerId);
      ocrSlowNoticeTimerId = 0;
    }
  }

  function renderOcrProgressPanel() {
    if (!ocrProgressPanel) {
      return;
    }

    if (!ocrProgressSteps.length) {
      ocrProgressPanel.innerHTML = "";
      ocrProgressPanel.classList.add("hidden");
      return;
    }

    ocrProgressPanel.classList.remove("hidden");
    ocrProgressPanel.innerHTML = `
      ${ocrProgressSteps
        .map(
          (step) => `
            <div class="ocr-progress-step" data-state="${escapeHtml(step.state)}">
              <span class="ocr-progress-marker">${step.state === "complete" ? "✓" : ""}</span>
              <span>${escapeHtml(step.label)}</span>
            </div>
          `
        )
        .join("")}
      ${showSlowOcrNotice ? '<p class="ocr-progress-slow-note">This is taking longer than usual - please wait.</p>' : ""}
    `;
  }

  function setOcrProgressCurrentStep(index) {
    ocrProgressSteps = ocrProgressSteps.map((step, stepIndex) => {
      if (stepIndex < index) {
        return { ...step, state: "complete" };
      }
      if (stepIndex === index) {
        return { ...step, state: "current" };
      }
      return { ...step, state: "pending" };
    });
    renderOcrProgressPanel();
  }

  function startOcrProgress() {
    clearOcrProgressTimers();
    showSlowOcrNotice = false;
    ocrProgressSteps = ocrProgressLabels.map((label, index) => ({
      label,
      state: index === 0 ? "current" : "pending"
    }));
    renderOcrProgressPanel();

    ocrProgressTimerIds = [
      window.setTimeout(() => setOcrProgressCurrentStep(1), 900),
      window.setTimeout(() => setOcrProgressCurrentStep(2), 4900),
      window.setTimeout(() => setOcrProgressCurrentStep(3), 7900)
    ];
    ocrSlowNoticeTimerId = window.setTimeout(() => {
      showSlowOcrNotice = true;
      renderOcrProgressPanel();
    }, 30000);
  }

  function completeOcrProgress() {
    clearOcrProgressTimers();
    showSlowOcrNotice = false;
    ocrProgressSteps = ocrProgressLabels.map((label) => ({
      label,
      state: "complete"
    }));
    renderOcrProgressPanel();
    ocrProgressFadeTimerId = window.setTimeout(() => {
      ocrProgressSteps = [];
      renderOcrProgressPanel();
    }, 2000);
  }

  function failOcrProgress(message = "") {
    clearOcrProgressTimers();
    showSlowOcrNotice = false;
    ocrProgressSteps = [];
    renderOcrProgressPanel();
    setOcrUploadError(message);
  }

  function renderOcrSummary(payload = {}) {
    latestOcrPayload = payload;
    if (!ocrResult) {
      return;
    }

    ocrResult.innerHTML = buildOcrBatchResultMarkup(payload);
    const resultButton = document.getElementById("ocrViewResultButton");
    if (resultButton) {
      resultButton.addEventListener("click", () => {
        openOcrResultModal(0);
      });
    }
  }

  function renderOcrResultModal() {
    if (!ocrResultModalContent || !latestOcrPayload) {
      return;
    }

    ocrResultModalContent.innerHTML = buildOcrBatchModalMarkup(latestOcrPayload, activeOcrModalIndex);
  }

  function openOcrResultModal(index = 0) {
    if (!ocrResultModal || !latestOcrPayload) {
      return;
    }

    const imageCount = Array.isArray(latestOcrPayload.results)
      ? latestOcrPayload.results.filter((entry) => entry.imageUrl).length
      : 0;
    activeOcrModalIndex = Math.min(Math.max(index, 0), Math.max(imageCount - 1, 0));
    renderOcrResultModal();
    ocrResultModal.classList.remove("hidden");
    ocrResultModal.setAttribute("aria-hidden", "false");
  }

  function closeOcrResultModal() {
    if (!ocrResultModal) {
      return;
    }

    ocrResultModal.classList.add("hidden");
    ocrResultModal.setAttribute("aria-hidden", "true");
  }

  function highlightOcrResultButton() {
    const resultButton = document.getElementById("ocrViewResultButton");
    if (!resultButton) {
      return;
    }

    resultButton.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    resultButton.classList.add("is-highlighted");
    window.setTimeout(() => {
      resultButton.classList.remove("is-highlighted");
    }, 1500);
  }

  function renderSelectedSurveyFiles() {
    if (!ocrImagePreview) {
      return;
    }

    if (!selectedSurveyFiles.length) {
      ocrImagePreview.innerHTML = "";
      setOcrSubmitState(false);
      return;
    }

    ocrImagePreview.innerHTML = selectedSurveyFiles
      .map((file, index) => {
        const key = createFileSelectionKey(file);
        let previewUrl = surveyPreviewUrls.get(key);
        if (!previewUrl) {
          previewUrl = URL.createObjectURL(file);
          surveyPreviewUrls.set(key, previewUrl);
        }

        return `
          <article class="image-preview-card">
            <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(file.name || `Survey image ${index + 1}`)}" />
            <div class="image-preview-copy">
              <strong>${escapeHtml(file.name || `Survey image ${index + 1}`)}</strong>
              <button
                class="ghost-button image-preview-remove"
                type="button"
                data-remove-survey-image="${escapeHtml(String(index))}"
              >
                Remove
              </button>
            </div>
          </article>
        `;
      })
      .join("");
    setOcrSubmitState(false);
  }

  if (ocrForm) {
    setOcrSubmitState(false);

    if (ocrResultModalClose) {
      ocrResultModalClose.addEventListener("click", closeOcrResultModal);
    }

    if (ocrResultModal) {
      ocrResultModal.addEventListener("click", (event) => {
        if (event.target === ocrResultModal) {
          closeOcrResultModal();
        }
      });
    }

    if (ocrResultModalContent) {
      ocrResultModalContent.addEventListener("click", (event) => {
        const thumbnailButton = event.target.closest("[data-ocr-image-select]");
        if (!thumbnailButton) {
          return;
        }

        const nextIndex = Number(thumbnailButton.dataset.ocrImageSelect || 0);
        if (!Number.isInteger(nextIndex) || nextIndex < 0) {
          return;
        }

        activeOcrModalIndex = nextIndex;
        renderOcrResultModal();
      });
    }

    if (ocrFileInput) {
      ocrFileInput.addEventListener("change", () => {
        setOcrUploadError("");
        const incomingFiles = Array.from(ocrFileInput.files || []);
        const existingKeys = new Set(selectedSurveyFiles.map((file) => createFileSelectionKey(file)));

        incomingFiles.forEach((file) => {
          const key = createFileSelectionKey(file);
          if (!existingKeys.has(key)) {
            selectedSurveyFiles.push(file);
            existingKeys.add(key);
          }
        });

        syncSelectedSurveyFiles();
        renderSelectedSurveyFiles();
      });
    }

    if (ocrImagePreview) {
      ocrImagePreview.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-remove-survey-image]");
        if (!removeButton) {
          return;
        }

        const index = Number(removeButton.dataset.removeSurveyImage);
        if (!Number.isInteger(index) || index < 0 || index >= selectedSurveyFiles.length) {
          return;
        }

        const [removedFile] = selectedSurveyFiles.splice(index, 1);
        if (removedFile) {
          releaseSurveyPreview(removedFile);
        }
        syncSelectedSurveyFiles();
        setOcrUploadError("");
        renderSelectedSurveyFiles();
      });
    }

    ocrForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedSurveyFiles.length) {
        showGlobalBanner("Please select at least one survey image.", "error");
        return;
      }

      const formData = new FormData();
      selectedSurveyFiles.forEach((file) => formData.append("image", file));

      try {
        setOcrUploadError("");
        closeOcrResultModal();
        setOcrSubmitState(true);
        startOcrProgress();
        const result = await apiFetch("/api/surveys", {
          method: "POST",
          body: formData
        });
        console.log("OCR response:", result);
        completeOcrProgress();
        renderOcrSummary(result);
        const summary = result.summary || {};
        const processedCount = Number(summary.processedCount || 0);
        const failedCount = Number(summary.failedCount || 0);
        const bannerMessage = failedCount
          ? `Processed ${processedCount} image${processedCount === 1 ? "" : "s"} with ${failedCount} failure${failedCount === 1 ? "" : "s"}.`
          : `Processed ${processedCount} survey image${processedCount === 1 ? "" : "s"}.`;
        showGlobalBanner(bannerMessage, failedCount ? "info" : "success");
        ocrForm.reset();
        resetSurveySelection();
        highlightOcrResultButton();
      } catch (error) {
        failOcrProgress(error.message || "OCR upload failed.");
        showGlobalBanner(error.message || "OCR upload failed.", "error");
      } finally {
        setOcrSubmitState(false);
      }
    });
  }

  if (recorderButton && typeof MediaRecorder !== "undefined" && navigator.mediaDevices) {
    recorderButton.addEventListener("click", async () => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recorderButton.textContent = "Record voice note";
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        });
        mediaRecorder.addEventListener("stop", () => {
          recordedAudioBlob = new Blob(recordedChunks, { type: "audio/webm" });
          if (voicePreview) {
            voicePreview.src = URL.createObjectURL(recordedAudioBlob);
            voicePreview.classList.remove("hidden");
          }
          stream.getTracks().forEach((track) => track.stop());
        });
        mediaRecorder.start();
        recorderButton.textContent = "Stop recording";
      } catch (error) {
        showGlobalBanner("Microphone access was blocked.", "error");
      }
    });
  } else if (recorderButton) {
    recorderButton.classList.add("hidden");
  }

  if (audioForm) {
    audioForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(audioForm);

      if (!formData.get("audio")?.size && recordedAudioBlob) {
        formData.set("audio", recordedAudioBlob, "voice-note.webm");
      }

      if (!formData.get("audio")?.size) {
        showGlobalBanner("Please upload an audio file or record a voice note first.", "error");
        return;
      }

      try {
        const result = await apiFetch("/api/voice", {
          method: "POST",
          body: formData
        });
        if (audioResult) {
          audioResult.innerHTML = `
            <strong>Voice transcription</strong>
            <p class="helper-copy">Provider: ${result.transcript.provider} · Model: ${result.transcript.model}</p>
            <p class="helper-copy">Languages: ${(result.transcript.languagesDetected || []).join(", ") || "Unspecified"}</p>
            <pre>${result.transcript.text}</pre>
            <p class="helper-copy">Classified as ${capitalize(result.need.type)} with ${capitalize(result.need.severity)} severity.</p>
            ${result.transcript.keyPhrases?.length
              ? `<p class="helper-copy">Key phrases: ${result.transcript.keyPhrases.join(", ")}</p>`
              : ""
            }
          `;
        }
        showGlobalBanner("Audio report transcribed and routed.", "success");
        audioForm.reset();
        recordedAudioBlob = null;
        if (voicePreview) {
          voicePreview.src = "";
          voicePreview.classList.add("hidden");
        }
      } catch (error) {
        showGlobalBanner(error.message || "Audio upload failed.", "error");
      }
    });
  }

  if (manualForm) {
    manualForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(manualForm);

      try {
        const result = await apiFetch("/api/manual-need", {
          method: "POST",
          body: Object.fromEntries(formData.entries())
        });
        if (manualResult) {
          manualResult.innerHTML = `
            <strong>Need created</strong>
            <p class="helper-copy">${result.need.title}</p>
            <p>${result.need.description}</p>
          `;
        }
        showGlobalBanner("Manual report saved to the intake lane.", "success");
        manualForm.reset();
      } catch (error) {
        showGlobalBanner(error.message || "Could not save the manual report.", "error");
      }
    });
  }
}

async function initProfilePage(currentUser) {
  if (!currentUser) {
    return;
  }

  const roleKey = getRoleKey(currentUser);
  const volunteerSection = document.getElementById("volunteerProfileSection");
  const csrSection = document.getElementById("csrProfileSection");
  const volunteerHero = document.getElementById("volunteerProfileHero");
  const csrHero = document.getElementById("csrProfileHero");

  if (roleKey === "csr") {
    if (volunteerSection) volunteerSection.classList.add("hidden");
    if (csrSection) csrSection.classList.remove("hidden");
    if (volunteerHero) volunteerHero.classList.add("hidden");
    if (csrHero) csrHero.classList.remove("hidden");

    const csrForm = document.getElementById("csrProfileForm");
    if (csrForm) {
      const contactNameField = document.getElementById("csrContactName");
      const companyNameField = document.getElementById("csrCompanyName");
      const sectorField = document.getElementById("csrSector");
      const budgetField = document.getElementById("csrBudget");
      const headquartersField = document.getElementById("csrHeadquarters");
      const websiteField = document.getElementById("csrWebsite");
      const descriptionField = document.getElementById("csrDescription");

      if (contactNameField) contactNameField.value = currentUser.name || "";
      if (companyNameField) companyNameField.value = currentUser.companyName || "";

      const details = currentUser.companyDetails || {};
      if (sectorField) sectorField.value = details.sector || "";
      if (budgetField) budgetField.value = details.budgetRange || "";
      if (headquartersField) headquartersField.value = details.headquarters || "";
      if (websiteField) websiteField.value = details.website || "";
      if (descriptionField) descriptionField.value = details.description || "";

      csrForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(csrForm);

        try {
          const payload = Object.fromEntries(formData.entries());
          const result = await apiFetch("/api/profile", {
            method: "PUT",
            body: payload
          });
          localStorage.setItem("kindredUser", JSON.stringify(result.user));
          setFlash("Corporate profile updated.", "success");
          window.location.reload();
        } catch (error) {
          showGlobalBanner(error.message || "Could not save your corporate profile.", "error");
        }
      });
    }
  } else {
    if (volunteerSection) volunteerSection.classList.remove("hidden");
    if (csrSection) csrSection.classList.add("hidden");
    if (volunteerHero) volunteerHero.classList.remove("hidden");
    if (csrHero) csrHero.classList.add("hidden");

    const form = document.getElementById("profileForm");
    const nameField = document.getElementById("profileName");
    const skillsField = document.getElementById("profileSkills");
    const languagesField = document.getElementById("profileLanguages");
    const medicalTrainingField = document.getElementById("profileMedicalTraining");
    const technicalSkillsField = document.getElementById("profileTechnicalSkills");
    const communicationStyleField = document.getElementById("profileCommunicationStyle");
    const preferredCausesField = document.getElementById("profilePreferredCauses");
    const govIdField = document.getElementById("profileGovIdLast4");
    const emergencyNameField = document.getElementById("profileEmergencyName");
    const emergencyPhoneField = document.getElementById("profileEmergencyPhone");
    const vaccinationStatusField = document.getElementById("profileVaccinationStatus");
    const availabilityField = document.getElementById("profileAvailability");
    const locationField = document.getElementById("profileLocation");

    if (form) {
      if (nameField) nameField.value = currentUser.name || "";
      if (skillsField) skillsField.value = (currentUser.skills || []).join(", ");
      if (languagesField) languagesField.value = (currentUser.languages || []).join(", ");
      if (medicalTrainingField) {
        medicalTrainingField.value = currentUser.medicalTraining || "none";
      }
      if (technicalSkillsField) {
        technicalSkillsField.value = (currentUser.technicalSkills || []).join(", ");
      }
      if (communicationStyleField) {
        communicationStyleField.value = currentUser.communicationStyle || "community_bridge";
      }
      if (preferredCausesField) {
        preferredCausesField.value = (currentUser.preferredCauses || []).join(", ");
      }
      if (govIdField) {
        govIdField.value = currentUser.govIdLast4 || "";
      }
      if (emergencyNameField) {
        emergencyNameField.value = currentUser.emergencyContactName || "";
      }
      if (emergencyPhoneField) {
        emergencyPhoneField.value = currentUser.emergencyContactPhone || "";
      }
      if (vaccinationStatusField) {
        vaccinationStatusField.value = currentUser.vaccinationStatus || "unknown";
      }
      if (availabilityField) availabilityField.value = currentUser.availability || "";
      if (locationField) locationField.value = currentUser.baseLocation || "";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);

        try {
          const payload = Object.fromEntries(formData.entries());
          payload.skills = payload.skills || "";
          payload.technicalSkills = payload.technicalSkills || "";
          payload.languages = payload.languages || "";
          payload.preferredCauses = payload.preferredCauses || "";
          const result = await apiFetch("/api/profile", {
            method: "PUT",
            body: payload
          });
          localStorage.setItem("kindredUser", JSON.stringify(result.user));
          setFlash("Profile updated.", "success");
          window.location.reload();
        } catch (error) {
          showGlobalBanner(error.message || "Could not save your profile.", "error");
        }
      });
    }
  }
}

function getRedirectTarget(currentUser) {
  const searchParams = new URLSearchParams(window.location.search);
  return getAllowedTarget(searchParams.get("redirect"), currentUser);
}

async function initLoginPage(currentUser) {
  const form = document.getElementById("loginForm");
  if (!form) {
    return;
  }

  if (currentUser) {
    window.location.href = getRedirectTarget(currentUser);
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      const result = await apiFetch("/api/login", {
        method: "POST",
        body: Object.fromEntries(formData.entries()),
        auth: false
      });
      setSession(result.token, result.user);
      setFlash(`Welcome back, ${result.user.name}.`, "success");
      window.location.href = getRedirectTarget(result.user);
    } catch (error) {
      showGlobalBanner(error.message || "Could not log you in.", "error");
    }
  });
}

async function initSignupPage(currentUser) {
  const form = document.getElementById("signupForm");
  const joinForm = document.getElementById("joinSignupForm");
  const targetForm = form || joinForm;

  if (!targetForm) {
    return;
  }

  if (currentUser && form) {
    window.location.href = getRedirectTarget(currentUser);
    return;
  }

  targetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(targetForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const result = await apiFetch("/api/signup", {
        method: "POST",
        body: payload,
        auth: false
      });
      setSession(result.token, result.user);
      setFlash("Your account is ready.", "success");
      window.location.href = getAllowedTarget(result.redirectTo, result.user);
    } catch (error) {
      showGlobalBanner(error.message || "Could not create your account.", "error");
    }
  });
}

async function bootstrap() {
  initFadeIn();
  attachFlash();
  initCityContext();

  const cachedUser = getStoredUser();
  renderHeaderActions(cachedUser);
  syncHomePagePublicLinksVisibility(cachedUser);

  const currentUser = await resolveCurrentUser();
  renderHeaderActions(currentUser);

  if (!enforcePageGuard(currentUser)) {
    return;
  }

  await Promise.all([setupMap("pune-map"), setupMap("intelligence-map", "intel-")]);
  await initHomePage(currentUser);
  await initLoginPage(currentUser);
  await initSignupPage(currentUser);
  await initIntelligencePage(currentUser);
  await initImpactPage(currentUser);
  await initAdminPage();
  await initReportPage();
  await initProfilePage(currentUser);
}

document.addEventListener("DOMContentLoaded", bootstrap);
