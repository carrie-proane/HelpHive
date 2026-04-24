const issues = [
  {
    lat: 18.5204,
    lng: 73.8567,
    type: "water",
    severity: "critical",
    label: "Water shortage - Shivajinagar",
    updated: "09:12 AM",
    ngo: "Jeevan Dhara"
  },
  {
    lat: 18.5679,
    lng: 73.9143,
    type: "sanitation",
    severity: "urgent",
    label: "Waste overflow - Pimpri",
    updated: "08:41 AM",
    ngo: "Seva Setu"
  },
  {
    lat: 18.5074,
    lng: 73.8077,
    type: "volunteer",
    severity: "stable",
    label: "Volunteers needed - Kothrud",
    updated: "10:05 AM",
    ngo: "Nagrik Mitra"
  },
  {
    lat: 18.5314,
    lng: 73.8446,
    type: "water",
    severity: "urgent",
    label: "Low tank refill confidence - Kasba Peth",
    updated: "11:20 AM",
    ngo: "Jeevan Dhara"
  },
  {
    lat: 18.5538,
    lng: 73.8893,
    type: "sanitation",
    severity: "critical",
    label: "Drain choke spillover - Yerawada",
    updated: "07:58 AM",
    ngo: "Seva Setu"
  }
];

const severityColors = {
  critical: "#e07a6a",
  urgent: "#e6a96a",
  stable: "#6aa89e"
};

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    </div>
  `;

  return L.marker([issue.lat, issue.lng], { icon }).bindPopup(popup, {
    className: "custom-popup"
  });
}

function setupMap(mapElementId, filterPrefix = "") {
  const mapElement = document.getElementById(mapElementId);
  if (!mapElement || typeof L === "undefined") {
    return;
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

  function getField(id) {
    return document.getElementById(`${filterPrefix}${id}`);
  }

  function drawLayers() {
    const typeFilter = getField("typeFilter");
    const severityFilter = getField("severityFilter");
    const ngoFilter = getField("ngoFilter");

    const typeValue = typeFilter ? typeFilter.value : "all";
    const severityValue = severityFilter ? severityFilter.value : "all";
    const ngoValue = ngoFilter ? ngoFilter.value : "all";

    markerLayer.clearLayers();
    heatLayer.clearLayers();

    issues
      .filter((issue) => typeValue === "all" || issue.type === typeValue)
      .filter((issue) => severityValue === "all" || issue.severity === severityValue)
      .filter((issue) => ngoValue === "all" || issue.ngo === ngoValue)
      .forEach((issue) => {
        createMarker(issue).addTo(markerLayer);

        const color = severityColors[issue.severity] || severityColors.stable;
        L.circle([issue.lat, issue.lng], {
          radius: issue.severity === "critical" ? 1400 : issue.severity === "urgent" ? 1100 : 900,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: issue.severity === "critical" ? 0.16 : 0.11
        }).addTo(heatLayer);

        L.circle([issue.lat, issue.lng], {
          radius: issue.severity === "critical" ? 700 : 520,
          color,
          weight: 0,
          fillColor: color,
          fillOpacity: 0.16
        }).addTo(heatLayer);
      });

    L.marker([18.5385, 73.8931], {
      icon: L.divIcon({
        className: "heat-label",
        html: "Active cluster",
        iconSize: [90, 28],
        iconAnchor: [45, 14]
      })
    }).addTo(heatLayer);
  }

  ["typeFilter", "severityFilter", "ngoFilter"].forEach((fieldId) => {
    const field = getField(fieldId);
    if (field) {
      field.addEventListener("change", drawLayers);
    }
  });

  drawLayers();
}

document.addEventListener("DOMContentLoaded", () => {
  initFadeIn();
  setupMap("pune-map");
  setupMap("intelligence-map", "intel-");
});
