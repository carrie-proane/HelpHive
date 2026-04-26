const fallbackSeverityColors = {
  critical: "#e07a6a",
  urgent: "#e6a96a",
  stable: "#6aa89e"
};

const roleLabels = {
  volunteer: "Volunteer",
  ngo: "NGO Worker",
  admin: "Admin",
  corporate: "Corporate"
};

const roleHomes = {
  volunteer: "./intelligence.html",
  ngo: "./report.html",
  admin: "./admin.html",
  corporate: "./impact.html"
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
}

function clearSession() {
  localStorage.removeItem("kindredToken");
  localStorage.removeItem("kindredUser");
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

  if (token && options.auth !== false) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!isFormData && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
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
        }
      });
    },
    { threshold: 0.18 }
  );

  elements.forEach((element) => {
    observer.observe(element);
  });
}

function createMarker(issue) {
  const severityColors = getSeverityColors();
  const color = severityColors[issue.severity] || severityColors.stable;
  const icon = L.divIcon({
    className: "",
    html:
      '<div class="issue-marker" style="color:' +
      color +
      "; box-shadow: 0 0 0 14px " +
      hexToRgba(color, 0.18) +
      ';"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const popup = `
    <div class="popup-card">
      <h4>${issue.label}</h4>
      <div class="popup-line"><span>Severity</span><strong>${capitalize(issue.severity)}</strong></div>
      <div class="popup-line"><span>Last updated</span><strong>${issue.updated}</strong></div>
      <div class="popup-line"><span>Assigned NGO</span><strong>${issue.ngo}</strong></div>
      <div class="popup-line"><span>Intensity</span><strong>${issue.currentIntensity}</strong></div>
    </div>
  `;

  return L.marker([issue.lat, issue.lng], { icon }).bindPopup(popup, {
    className: "custom-popup"
  });
}

async function resolveCurrentUser() {
  const token = getToken();
  if (!token) {
    return null;
  }

  try {
    const data = await apiFetch("/api/me");
    localStorage.setItem("kindredUser", JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    clearSession();
    return null;
  }
}

function renderHeaderActions(currentUser) {
  const headerActions = document.querySelectorAll(".header-actions");
  const navs = document.querySelectorAll(".site-nav");

  headerActions.forEach((slot) => {
    if (!slot.dataset.baseLabel) {
      const currentPill = slot.querySelector(".pill-tag");
      slot.dataset.baseLabel = currentPill ? currentPill.textContent.trim() : "KindredPune";
    }

    const pill = `<span class="pill-tag">${slot.dataset.baseLabel}</span>`;

    if (!currentUser) {
      slot.innerHTML = `
        ${pill}
        <div class="header-link-row">
          <a class="ghost-button" href="./login.html">Log in</a>
          <a class="cta-button" href="./signup.html">Sign up</a>
        </div>
      `;
      return;
    }

    slot.innerHTML = `
      ${pill}
      <div class="header-link-row">
        <a class="ghost-button" href="${roleHomes[currentUser.role] || "./intelligence.html"}">Dashboard</a>
        <a class="ghost-button" href="./profile.html">Profile</a>
        <div class="user-badge">
          <strong>${currentUser.name}</strong>
          <span>${roleLabels[currentUser.role] || currentUser.role}</span>
        </div>
        <button class="soft-button" type="button" data-logout>Logout</button>
      </div>
    `;
  });

  navs.forEach((nav) => {
    nav.querySelectorAll("[data-role-nav]").forEach((node) => node.remove());

    if (!currentUser) {
      return;
    }

    const label =
      currentUser.role === "admin"
        ? "Admin"
        : currentUser.role === "ngo"
          ? "Report Needs"
          : currentUser.role === "corporate"
            ? "CSR Dashboard"
            : "My Tasks";
    const href =
      currentUser.role === "admin"
        ? "./admin.html"
        : currentUser.role === "ngo"
          ? "./report.html"
          : currentUser.role === "corporate"
            ? "./impact.html"
            : "./intelligence.html";
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    link.dataset.roleNav = "true";
    nav.appendChild(link);
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      clearSession();
      setFlash("You’ve been logged out.", "info");
      window.location.href = "./login.html";
    });
  });
}

function enforcePageGuard(currentUser) {
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
    .map((value) => value.trim())
    .filter(Boolean);

  if (roles.length && !roles.includes(currentUser.role)) {
    setFlash("Your account does not have access to that page.", "error");
    window.location.href = roleHomes[currentUser.role] || "./index.html";
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

function taskActionButtons(task, currentUser) {
  if (!currentUser) {
    return `<a class="ghost-button" href="./login.html">Log in to help</a>`;
  }

  const isAssigned = task.assignedUsers?.some((user) => user.id === currentUser.id);
  const canVolunteer = currentUser.role === "volunteer" || currentUser.role === "admin";
  const canComplete =
    currentUser.role === "admin" ||
    currentUser.role === "ngo" ||
    isAssigned;

  const actions = [];

  if (canVolunteer && !isAssigned && task.status !== "completed") {
    actions.push(
      `<button class="cta-button" type="button" data-task-action="volunteer" data-task-id="${task.id}">Volunteer</button>`
    );
  }

  if (canComplete && task.status !== "completed") {
    actions.push(
      `<button class="ghost-button" type="button" data-task-action="complete" data-task-id="${task.id}">Mark complete</button>`
    );
  }

  if (!actions.length) {
    actions.push(`<span class="pill-tag">No action needed</span>`);
  }

  return `<div class="inline-actions">${actions.join("")}</div>`;
}

function renderTaskCard(task, currentUser) {
  const assignedNames = (task.assignedUsers || []).map((user) => user.name).join(", ");
  const buddyNames = (task.buddySuggestions || []).map((user) => user.name).join(", ");
  const safetyLine = task.requiresBuddy
    ? `Buddy required · target team size ${task.recommendedTeamSize || 2}`
    : "Solo-safe assignment allowed";
  const languageLine = (task.preferredLanguages || []).length
    ? `Preferred languages: ${(task.preferredLanguages || []).join(", ")}`
    : "";
  const complementaryLine = (task.complementarySkills || []).length
    ? `Complementary skills: ${(task.complementarySkills || []).map(prettyLabel).join(", ")}`
    : "";
  const contextLine = (task.contextTags || []).length
    ? `Context: ${(task.contextTags || []).slice(0, 3).map(prettyLabel).join(", ")}`
    : "";
  const communicationLine = (task.preferredCommunicationStyles || []).length
    ? `Field style: ${(task.preferredCommunicationStyles || []).map(prettyLabel).join(", ")}`
    : "";
  const trainingLine =
    task.minimumMedicalTraining && task.minimumMedicalTraining !== "none"
      ? `Medical threshold: ${prettyLabel(task.minimumMedicalTraining)}`
      : "";
  const matchLine =
    currentUser?.role === "volunteer" && task.currentUserMatch?.reasons?.length
      ? `Why this fits you: ${task.currentUserMatch.reasons.slice(0, 3).join(" · ")}`
      : "";

  return `
    <article class="task-card">
      <span class="severity-badge ${task.severity}">${capitalize(task.severity)}</span>
      <h3>${task.title}</h3>
      <p class="muted">${task.notes || "Live task routed from the need intake lane."}</p>
      <ul class="task-tags">
        ${(task.requiredSkills || []).map((skill) => `<li>${prettyLabel(skill)}</li>`).join("")}
      </ul>
      <div class="task-meta-row">
        <span>${task.locationName} · ${prettyLabel(task.category || task.type)}</span>
        <strong>${task.distanceKm ? `${task.distanceKm} km away` : capitalize(task.status)}</strong>
      </div>
      ${
        assignedNames
          ? `<p class="helper-copy">Assigned: ${assignedNames}</p>`
          : `<p class="helper-copy">No volunteers assigned yet.</p>`
      }
      <p class="helper-copy">${safetyLine}</p>
      ${languageLine ? `<p class="helper-copy">${languageLine}</p>` : ""}
      ${trainingLine ? `<p class="helper-copy">${trainingLine}</p>` : ""}
      ${complementaryLine ? `<p class="helper-copy">${complementaryLine}</p>` : ""}
      ${communicationLine ? `<p class="helper-copy">${communicationLine}</p>` : ""}
      ${contextLine ? `<p class="helper-copy">${contextLine}</p>` : ""}
      ${matchLine ? `<p class="helper-copy">${matchLine}</p>` : ""}
      ${
        buddyNames
          ? `<p class="helper-copy">Buddy suggestion: ${buddyNames}</p>`
          : ""
      }
      ${taskActionButtons(task, currentUser)}
    </article>
  `;
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
    return { refreshData: async () => {} };
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
    markerLayer.clearLayers();
    heatLayer.clearLayers();

    const visibleIssues = filteredIssues();

    visibleIssues.forEach((issue) => {
      const ageHours = formatAgeHours(issue.updated_at);
      const decay = issue.heatWeight || Math.exp(-0.12 * ageHours);
      const color = severityColors[issue.severity] || severityColors.stable;
      const severityRadius =
        issue.severity === "critical" ? 2200 : issue.severity === "urgent" ? 1600 : 1100;
      const intensity = Math.max(decay, 0.15);
      const outerRadius = severityRadius + intensity * 900;
      const innerRadius = severityRadius * 0.45 + intensity * 420;
      issue.currentIntensity = Number(intensity.toFixed(2));

      createMarker(issue).addTo(markerLayer);

      L.circle([issue.lat, issue.lng], {
        radius: outerRadius,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: Math.min(0.06 + intensity * 0.28, 0.34)
      }).addTo(heatLayer);

      L.circle([issue.lat, issue.lng], {
        radius: innerRadius,
        color,
        weight: 0,
        fillColor: color,
        fillOpacity: Math.min(0.14 + intensity * 0.3, 0.42)
      }).addTo(heatLayer);
    });

    alerts.forEach((alert) => {
      L.circle([alert.latitude, alert.longitude], {
        radius: 2200,
        color: severityColors[alert.severity] || severityColors.urgent,
        weight: 2,
        dashArray: "8 6",
        fillOpacity: 0.02
      }).addTo(heatLayer);
    });

    const highest = [...visibleIssues].sort(
      (a, b) => (b.currentIntensity || 0) - (a.currentIntensity || 0)
    )[0];

    if (highest) {
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
      field.addEventListener("change", drawLayers);
    }
  });

  await refreshData();
  window.setInterval(refreshData, 60 * 1000);
  return { refreshData };
}

async function initHomePage() {
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
  const taskList = document.getElementById("intelTaskList");
  const alertList = document.getElementById("intelAlertList");
  const summaryList = document.getElementById("intelDeskSummary");
  const volunteerSummary = document.getElementById("intelVolunteerSummary");
  const taskContainer = document.getElementById("intelTaskSection");

  if (!taskList && !alertList && !summaryList) {
    return;
  }

  async function refreshTasks() {
    try {
      const [taskData, alertData, overview] = await Promise.all([
        apiFetch("/api/tasks"),
        apiFetch("/api/alerts"),
        apiFetch("/api/overview")
      ]);

      const tasks = taskData.tasks || [];
      const alerts = alertData.alerts || [];

      if (taskList) {
        taskList.innerHTML = tasks.length
          ? tasks.map((task) => renderTaskCard(task, currentUser)).join("")
          : renderEmptyState("No live tasks are open right now.");
      }

      if (alertList) {
        alertList.innerHTML = alerts.length
          ? alerts
              .map(
                (alert) => `
                  <article class="dashboard-shell coral">
                    <span class="severity-badge ${alert.severity}">${capitalize(alert.severity)}</span>
                    <h3>${alert.title}</h3>
                    <p class="muted">${alert.explanation}</p>
                    <p class="helper-copy">${alert.locationName} · ${alert.evidenceCount} linked reports</p>
                    ${
                      alert.evidence?.length
                        ? `<p class="helper-copy">${alert.evidence[1] || alert.evidence[0]}</p>`
                        : ""
                    }
                  </article>
                `
              )
              .join("")
          : renderEmptyState("No silent-need alerts are active.");
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
                    <strong>${
                      currentUser?.role === "volunteer"
                        ? `${Math.round(task.currentUserMatch?.score || 0)} fit score`
                        : task.assignedUsers.map((user) => user.name).join(", ") || "Pending"
                    }</strong>
                  </li>
                `
              )
              .join("")
          : `<li><span>Matching lane</span><strong>Waiting for the next run</strong></li>`;
      }

      if (taskContainer && currentUser?.role === "volunteer") {
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

  await refreshTasks();
}

async function initImpactPage(currentUser) {
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

  if (!currentUser || !["corporate", "admin"].includes(currentUser.role)) {
    if (authPrompt) {
      authPrompt.classList.remove("hidden");
    }
    return;
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
        (company) => `<option value="${company.id}" ${
          company.id === currentUser.companyId ? "selected" : ""
        }>${company.name}</option>`
      )
      .join("");
  }

  function hydrateCompanyFieldFromSession() {
    if (!companyField || currentUser.role !== "corporate") {
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

  function renderImpactChart(report) {
    if (!chartPanel) {
      return;
    }

    const series = report.monthlyHours || [];
    if (!series.length) {
      chartPanel.innerHTML = `
        <div class="chart-placeholder">
          No monthly volunteer-hour data is available for the selected range yet.
        </div>
      `;
      return;
    }

    chartPanel.innerHTML = `
      <div class="csr-chart-grid">
        ${series
          .map(
            (entry) => `
              <div class="csr-chart-bar">
                <div class="csr-chart-track">
                  <div class="csr-chart-fill" style="height: ${Math.max(entry.height || 0, 18)}%;"></div>
                </div>
                <div class="csr-chart-label">${entry.month}</div>
                <div class="csr-chart-value">${entry.hours} hrs</div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  async function loadReport() {
    const selectedCompanyId = companyField?.value || currentUser.companyId || "";
    if (!selectedCompanyId && currentUser.role === "admin") {
      throw new Error("Choose a company to load the CSR dashboard.");
    }

    const filters = {
      startDate: startDateField?.value || "",
      endDate: endDateField?.value || ""
    };
    const queryString = buildQueryString(filters);
    const report =
      selectedCompanyId && currentUser.role === "admin"
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
    if (currentUser.role === "admin") {
      await loadCompanies();
    } else {
      void loadCompanies().catch(() => {});
    }
    await loadReport();
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
                    ${
                      alert.evidence?.length
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
                  <article class="task-card">
                    <span class="severity-badge ${item.severity}">${capitalize(item.severity)}</span>
                    <h3>${item.title}</h3>
                    <p class="helper-copy">Source: ${item.source} · Confidence: ${item.confidence}</p>
                    <form class="stack-form queue-editor" data-review-form data-need-id="${item.id}">
                      <label>
                        Title
                        <input name="title" value="${item.title}" />
                      </label>
                      <label>
                        Description
                        <textarea name="description">${item.description}</textarea>
                      </label>
                      <label>
                        Corrected text
                        <textarea name="correctedText">${item.correctedText || item.rawText || item.description}</textarea>
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
                        <input name="locationName" value="${item.locationName}" />
                      </label>
                      ${
                        item.flaggedWords?.length
                          ? `<p class="helper-copy">Flagged terms: ${item.flaggedWords.join(", ")}</p>`
                          : ""
                      }
                      ${
                        item.evidence?.length
                          ? `<p class="helper-copy">Evidence: ${item.evidence.join(" · ")}</p>`
                          : ""
                      }
                      <button class="cta-button" type="submit">Approve and update</button>
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
                      ${
                        match.complementarySkills?.length
                          ? `<p class="helper-copy">Complementary: ${match.complementarySkills.map(prettyLabel).join(", ")}</p>`
                          : ""
                      }
                      <p>${match.volunteers.length ? match.volunteers.map((user) => user.name).join(" + ") : "No strong match yet"}</p>
                      <p class="helper-copy">${match.safetyMode === "buddy_required" ? "Buddy team required" : "Solo-safe assignment"}</p>
                      ${
                        match.volunteers.length
                          ? `<p class="helper-copy">${match.volunteers
                              .map((user) => `${user.name}: ${(user.reasons || []).join(", ")}`)
                              .join(" · ")}</p>`
                          : ""
                      }
                      ${
                        match.warnings?.length
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

  await refreshAdmin();
}

async function initReportPage() {
  const ocrForm = document.getElementById("ocrUploadForm");
  const audioForm = document.getElementById("audioUploadForm");
  const manualForm = document.getElementById("manualNeedForm");
  const recorderButton = document.getElementById("voiceRecorderButton");
  const voicePreview = document.getElementById("voicePreview");
  const ocrResult = document.getElementById("ocrResult");
  const audioResult = document.getElementById("audioResult");
  const manualResult = document.getElementById("manualResult");
  let mediaRecorder = null;
  let recordedAudioBlob = null;
  let recordedChunks = [];

  if (!ocrForm && !audioForm && !manualForm) {
    return;
  }

  if (ocrForm) {
    ocrForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(ocrForm);

      try {
        const result = await apiFetch("/api/surveys", {
          method: "POST",
          body: formData
        });
        if (ocrResult) {
          ocrResult.innerHTML = `
            <strong>OCR extracted text</strong>
            <p class="helper-copy">Provider: ${result.ocr.provider} · Confidence: ${result.ocr.averageConfidence}</p>
            <p class="helper-copy">Languages: ${(result.ocr.languagesDetected || []).join(", ") || "Unspecified"}</p>
            <pre>${result.ocr.text}</pre>
            ${
              result.ocr.lowConfidenceWords?.length
                ? `<p class="helper-copy">Flagged words for review: ${result.ocr.lowConfidenceWords.join(", ")}</p>`
                : ""
            }
            <p class="helper-copy">${result.need.needsReview ? "Flagged for review because confidence fell below the threshold." : "Captured cleanly and routed into the live need queue."}</p>
          `;
        }
        showGlobalBanner("Survey image processed.", "success");
        ocrForm.reset();
      } catch (error) {
        showGlobalBanner(error.message || "OCR upload failed.", "error");
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
            ${
              result.transcript.keyPhrases?.length
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

  if (!form || !currentUser) {
    return;
  }

  nameField.value = currentUser.name || "";
  skillsField.value = (currentUser.skills || []).join(", ");
  languagesField.value = (currentUser.languages || []).join(", ");
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
  availabilityField.value = currentUser.availability || "";
  locationField.value = currentUser.baseLocation || "";

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

function getRedirectTarget(currentUser) {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("redirect") || roleHomes[currentUser.role] || "./index.html";
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
      window.location.href = result.redirectTo || getRedirectTarget(result.user);
    } catch (error) {
      showGlobalBanner(error.message || "Could not create your account.", "error");
    }
  });
}

async function bootstrap() {
  initFadeIn();
  attachFlash();

  const currentUser = await resolveCurrentUser();
  renderHeaderActions(currentUser);

  if (!enforcePageGuard(currentUser)) {
    return;
  }

  await Promise.all([setupMap("pune-map"), setupMap("intelligence-map", "intel-")]);
  await initHomePage();
  await initLoginPage(currentUser);
  await initSignupPage(currentUser);
  await initIntelligencePage(currentUser);
  await initImpactPage(currentUser);
  await initAdminPage();
  await initReportPage();
  await initProfilePage(currentUser);
}

document.addEventListener("DOMContentLoaded", bootstrap);
