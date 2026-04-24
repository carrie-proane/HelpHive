const severityColors = {
  critical: "#e07a6a",
  urgent: "#e6a96a",
  stable: "#6aa89e"
};

const roleLabels = {
  volunteer: "Volunteer",
  ngo_worker: "NGO Worker",
  admin: "Admin",
  csr_partner: "CSR Partner"
};

const roleHomes = {
  volunteer: "./intelligence.html",
  ngo_worker: "./report.html",
  admin: "./admin.html",
  csr_partner: "./impact.html"
};

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
        : currentUser.role === "ngo_worker"
          ? "Report Needs"
          : currentUser.role === "csr_partner"
            ? "CSR Dashboard"
            : "My Tasks";
    const href =
      currentUser.role === "admin"
        ? "./admin.html"
        : currentUser.role === "ngo_worker"
          ? "./report.html"
          : currentUser.role === "csr_partner"
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
    currentUser.role === "ngo_worker" ||
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

  return `
    <article class="task-card">
      <span class="severity-badge ${task.severity}">${capitalize(task.severity)}</span>
      <h3>${task.title}</h3>
      <p class="muted">${task.notes || "Live task routed from the need intake lane."}</p>
      <ul class="task-tags">
        ${(task.requiredSkills || []).map((skill) => `<li>${skill}</li>`).join("")}
      </ul>
      <div class="task-meta-row">
        <span>${task.locationName}</span>
        <strong>${task.distanceKm ? `${task.distanceKm} km away` : capitalize(task.status)}</strong>
      </div>
      ${
        assignedNames
          ? `<p class="helper-copy">Assigned: ${assignedNames}</p>`
          : `<p class="helper-copy">No volunteers assigned yet.</p>`
      }
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
    markerLayer.clearLayers();
    heatLayer.clearLayers();

    const visibleIssues = filteredIssues();

    visibleIssues.forEach((issue) => {
      const color = severityColors[issue.severity] || severityColors.stable;
      const intensity = Math.max(issue.currentIntensity || 0.3, 0.18);
      const outerRadius = 700 + intensity * 1500;
      const innerRadius = 280 + intensity * 760;

      createMarker(issue).addTo(markerLayer);

      L.circle([issue.lat, issue.lng], {
        radius: outerRadius,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: Math.min(0.08 + intensity * 0.24, 0.3)
      }).addTo(heatLayer);

      L.circle([issue.lat, issue.lng], {
        radius: innerRadius,
        color,
        weight: 0,
        fillColor: color,
        fillOpacity: Math.min(0.12 + intensity * 0.28, 0.36)
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
      const data = await apiFetch("/api/issues", { auth: false });
      issues = data.issues || [];
      alerts = data.alerts || [];
      drawLayers();
    } catch (error) {
      showGlobalBanner(error.message || "Could not load map data.", "error");
    }
  }

  ["typeFilter", "severityFilter", "ngoFilter"].forEach((fieldId) => {
    const field = getField(fieldId);
    if (field) {
      field.addEventListener("change", drawLayers);
    }
  });

  await refreshData();
  window.setInterval(refreshData, 90 * 1000);
  return { refreshData };
}

async function initHomePage() {
  const overviewTargets = document.querySelectorAll("[data-overview-key]");
  if (!overviewTargets.length) {
    return;
  }

  try {
    const data = await apiFetch("/api/overview", { auth: false });
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
        apiFetch("/api/tasks", { auth: false }),
        apiFetch("/api/alerts", { auth: false }),
        apiFetch("/api/overview", { auth: false })
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
        const volunteerTasks = tasks.filter((task) => task.assignedUsers?.length);
        volunteerSummary.innerHTML = volunteerTasks.length
          ? volunteerTasks
              .slice(0, 3)
              .map(
                (task) => `
                  <li>
                    <span>${task.title}</span>
                    <strong>${task.assignedUsers.map((user) => user.name).join(", ") || "Pending"}</strong>
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
  const chart = document.getElementById("csrImpactChart");
  const receiptList = document.getElementById("csrReceiptList");
  const receiptButton = document.getElementById("downloadReceiptButton");
  const authPrompt = document.getElementById("csrAuthPrompt");

  if (!metricCards && !chart && !receiptList) {
    return;
  }

  if (!currentUser || !["csr_partner", "admin"].includes(currentUser.role)) {
    if (authPrompt) {
      authPrompt.classList.remove("hidden");
    }
    return;
  }

  try {
    const report = await apiFetch("/api/csr-report");
    const totals = report.totals || {};

    if (metricCards) {
      metricCards.innerHTML = `
        <article class="metric-card">
          <span class="panel-kicker">Tasks funded</span>
          <strong>${totals.tasksFunded || 0}</strong>
          <p class="muted">Completed tasks attached to ${report.company.name}.</p>
          <div class="spark"></div>
        </article>
        <article class="metric-card">
          <span class="panel-kicker">Communities helped</span>
          <strong>${totals.communitiesHelped || 0}</strong>
          <p class="muted">Estimated neighborhood touchpoints across funded work.</p>
          <div class="spark"></div>
        </article>
        <article class="metric-card">
          <span class="panel-kicker">Volunteers engaged</span>
          <strong>${totals.volunteersEngaged || 0}</strong>
          <p class="muted">Distinct volunteers pulled into funded task lanes.</p>
          <div class="spark"></div>
        </article>
        <article class="metric-card">
          <span class="panel-kicker">Resources moved</span>
          <strong>${totals.resourcesMoved || 0}</strong>
          <p class="muted">Supplies, deliveries, and linked support actions.</p>
          <div class="spark"></div>
        </article>
      `;
    }

    if (narrative) {
      narrative.textContent = report.narrative;
    }

    if (chart) {
      const entries = Object.entries(report.categories || {});
      chart.innerHTML = entries.length
        ? entries
            .map(
              ([category, value]) =>
                `<span style="--bar-height:${Math.max(24, value * 22)}%;" title="${capitalize(category)}: ${value}"></span>`
            )
            .join("")
        : `<span style="--bar-height:28%;"></span>`;
    }

    if (receiptList) {
      receiptList.innerHTML = (report.receiptLines || []).length
        ? report.receiptLines
            .map(
              (line) => `
                <li>
                  <span>${line.title}</span>
                  <strong>${line.locationName} · ${line.volunteers} volunteers</strong>
                </li>
              `
            )
            .join("")
        : `<li><span>No receipt lines yet</span><strong>Waiting on completed tasks</strong></li>`;
    }

    if (receiptButton) {
      receiptButton.classList.remove("hidden");
      receiptButton.addEventListener("click", () => {
        window.open(`/api/csr-report/${report.company.id}/receipt`, "_blank");
      });
    }
  } catch (error) {
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
                      <p>${match.volunteers.length ? match.volunteers.map((user) => user.name).join(" + ") : "No strong match yet"}</p>
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
  const ocrResult = document.getElementById("ocrResult");
  const audioResult = document.getElementById("audioResult");
  const manualResult = document.getElementById("manualResult");

  if (!ocrForm && !audioForm && !manualForm) {
    return;
  }

  if (ocrForm) {
    ocrForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(ocrForm);

      try {
        const result = await apiFetch("/api/ocr-upload", {
          method: "POST",
          body: formData
        });
        if (ocrResult) {
          ocrResult.innerHTML = `
            <strong>OCR extracted text</strong>
            <p class="helper-copy">Average confidence: ${result.ocr.averageConfidence}</p>
            <pre>${result.ocr.text}</pre>
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

  if (audioForm) {
    audioForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(audioForm);

      try {
        const result = await apiFetch("/api/audio-upload", {
          method: "POST",
          body: formData
        });
        if (audioResult) {
          audioResult.innerHTML = `
            <strong>Voice transcription</strong>
            <p class="helper-copy">Provider: ${result.transcript.provider} · Model: ${result.transcript.model}</p>
            <pre>${result.transcript.text}</pre>
            <p class="helper-copy">Classified as ${capitalize(result.need.type)} with ${capitalize(result.need.severity)} severity.</p>
          `;
        }
        showGlobalBanner("Audio report transcribed and routed.", "success");
        audioForm.reset();
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
  const availabilityField = document.getElementById("profileAvailability");
  const locationField = document.getElementById("profileLocation");

  if (!form || !currentUser) {
    return;
  }

  nameField.value = currentUser.name || "";
  skillsField.value = (currentUser.skills || []).join(", ");
  languagesField.value = (currentUser.languages || []).join(", ");
  availabilityField.value = currentUser.availability || "";
  locationField.value = currentUser.baseLocation || "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      const payload = Object.fromEntries(formData.entries());
      payload.skills = payload.skills || "";
      payload.languages = payload.languages || "";
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
