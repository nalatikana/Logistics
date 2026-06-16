const state = {
  dashboard: null,
  customers: [],
  currentView: "dashboard",
  selectedHouse: "H-1001",
  previewClosedHouse: "",
  pickupStartTime: null,
  lastGps: null,
  offlineQueue: JSON.parse(localStorage.getItem("offlineQueue") || "[]"),
  staff: [
    { code: "EMP001", name: "Somchai Prasert", section: "Inbound", line: "Connected", kpi: 98 },
    { code: "EMP002", name: "Nattapong Sukhum", section: "Customs", line: "Connected", kpi: 92 },
    { code: "EMP003", name: "Anucha Wongsuwan", section: "Completed", line: "Connected", kpi: 95 },
    { code: "EMP004", name: "Kitti Sakorn", section: "Inbound", line: "Disconnected", kpi: 88 },
    { code: "EMP005", name: "Preecha Chan", section: "Customs", line: "Connected", kpi: 94 }
  ]
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const configuredApiBase = window.SMART_LOGISTICS_API_BASE || "";
const API_BASE = configuredApiBase || (location.port === "3000" ? "" : "http://localhost:3000");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function assetUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

const pageCopy = {
  dashboard: { breadcrumb: "ภาพรวม / Executive", title: "Executive Dashboard" },
  orders: { breadcrumb: "Logistics / Shipment Tracking", title: "Order Tracking & Timeline" },
  staff: { breadcrumb: "System / Staff Management", title: "Staff & System Admin" },
  mobile: { breadcrumb: "Operations / Mobile Staff Preview", title: "LINE Bot Operations" },
  admin: { breadcrumb: "System / Admin Control", title: "Admin Control Center" }
};

async function api(path, payload) {
  try {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (error) {
    if (!navigator.onLine) {
      queueOffline(path, payload);
      return { ok: true, queued: true };
    }
    throw error;
  }
}

function queueOffline(path, payload) {
  state.offlineQueue.push({ id: Date.now(), path, payload, createdAt: new Date().toISOString() });
  localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
  toast(`เก็บงานไว้ชั่วคราว / Queued ${state.offlineQueue.length}`);
}

async function syncOfflineQueue() {
  if (!navigator.onLine || !state.offlineQueue.length) return;
  const remaining = [];
  for (const item of state.offlineQueue) {
    try {
      const res = await fetch(apiUrl(item.path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload)
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  state.offlineQueue = remaining;
  localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
  if (!remaining.length) {
    toast("Sync งาน offline สำเร็จ / Offline sync complete");
    refresh();
  }
}

async function refresh() {
  const res = await fetch(apiUrl("/api/bootstrap"));
  const data = await res.json();
  state.dashboard = data.dashboard;
  state.customers = data.customers || [];
  renderAll();
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 3200);
}

function setView(view) {
  state.currentView = view;
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  $$(".page").forEach(page => page.classList.toggle("active", page.dataset.page === view));
  $("#breadcrumb").textContent = pageCopy[view].breadcrumb;
  $("#pageTitle").textContent = pageCopy[view].title;
}

function findJob(houseNumber = state.selectedHouse) {
  return state.dashboard?.jobs.find(job => job.houseNumber === houseNumber || job.id === houseNumber) || state.dashboard?.jobs[0];
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function addPickupItemRow(values = {}) {
  const list = $("#driverPickupItemRows");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "pickup-item-row";
  row.innerHTML = `
    <input class="pickup-house" placeholder="House Number" value="${values.houseNumber || ""}">
    <select class="pickup-destination">
      <option value="WH3">WH3</option>
      <option value="TG">TG</option>
      <option value="TGINT">TGINT</option>
      <option value="BFS">BFS</option>
    </select>
    <input class="pickup-carton" placeholder="Carton/ชิ้น" value="${values.carton || ""}">
    <button class="remove-row" type="button" aria-label="Remove row">×</button>
  `;
  list.appendChild(row);
  row.querySelector(".pickup-destination").value = values.destination || "WH3";
  row.querySelector(".remove-row").addEventListener("click", () => {
    row.remove();
    syncPickupItemsText();
  });
  row.querySelectorAll("input, select").forEach(input => input.addEventListener("input", syncPickupItemsText));
  syncPickupItemsText();
}

function syncPickupItemsText() {
  const target = $("#driverPickupItems");
  if (!target) return "";
  const rows = $$("#driverPickupItemRows .pickup-item-row")
    .map(row => {
      const house = row.querySelector(".pickup-house").value.trim();
      const destination = row.querySelector(".pickup-destination").value;
      const carton = row.querySelector(".pickup-carton").value.trim();
      return house ? `${house},${destination},${carton}` : "";
    })
    .filter(Boolean);
  target.value = rows.join("\n");
  return target.value;
}

function clearPickupItemRows() {
  $("#driverPickupItemRows").innerHTML = "";
  syncPickupItemsText();
}

function renderDriverJobSelect() {
  const select = $("#driverJobSelect");
  if (!select || !state.dashboard) return;
  const current = select.value;
  select.innerHTML = [
    `<option value="">กรอกเอง / Manual form</option>`,
    ...state.dashboard.jobs.map(job => `<option value="${job.houseNumber}">${job.houseNumber} · ${job.customerName}</option>`)
  ].join("");
  select.value = current && state.dashboard.jobs.some(job => job.houseNumber === current) ? current : "";
  applyDriverJob(select.value);
}

function applyDriverJob(houseNumber) {
  const today = new Date().toISOString().slice(0, 10);
  $("#driverPickupDate").value ||= today;
  if (!houseNumber) {
    $("#driverHouse").value = "";
    $("#driverCustomerName").readOnly = false;
    $("#driverStartPlace").readOnly = false;
    $("#driverVehiclePlate").readOnly = false;
    return;
  }
  const job = findJob(houseNumber);
  if (!job) return;
  $("#driverHouse").value = job.houseNumber;
  $("#driverPickupDate").value = job.pickupDate || today;
  $("#driverCustomerName").value = job.customerName || "";
  $("#driverVehiclePlate").value = job.vehiclePlate || "";
  $("#driverStartPlace").value = job.pickupLocation || job.startPlace || "";
  $("#driverPieceCount").value = job.pieceCount || "";
  $("#driverPackageType").value = job.packageType || "Carton";
  $("#driverDestination").value = job.destination || job.routeType || "WH3";
  $("#driverEndPlace").value = job.destination || job.routeType || "WH3";
  const locked = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
  $("#driverCustomerName").readOnly = locked;
  $("#driverStartPlace").readOnly = locked;
  $("#driverVehiclePlate").readOnly = locked;
  clearPickupItemRows();
  const rows = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? job.pickupItems
    : [{ houseNumber: job.houseNumber, destination: job.destination || job.routeType || "WH3", carton: job.pieceCount || "" }];
  rows.forEach(row => addPickupItemRow(row));
}

function primaryHouseNumber() {
  const selected = $("#driverJobSelect").value;
  if (selected) return selected;
  syncPickupItemsText();
  const firstRow = $("#driverPickupItems").value.split(/\r?\n/).find(Boolean);
  return firstRow ? firstRow.split(",")[0].trim() : "";
}

function parsePickupLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [house, destination, carton] = line.split(",").map(cell => cell.trim());
      return { house, destination, carton };
    });
}

function adminPickupRows() {
  return parsePickupLines($("#adminPickupItems").value);
}

function cargoSheetHtml(data) {
  const previewRows = data.rows?.length
    ? data.rows
    : [{ house: data.houseNumber, destination: data.destination, carton: data.pieceCount }];
  return `
    <div class="cargo-sheet">
      <header class="cargo-sheet-head">
        <div>
          <strong>Expeditors (Thailand) Ltd.</strong>
          <small>Warehouse Office / Air Export Department</small>
        </div>
        <h3>CARGO PICKUP FORM</h3>
      </header>
      <div class="cargo-grid">
        <div><span>Pickup Date</span><b>${data.pickupDate || "-"}</b></div>
        <div><span>Pickup Time</span><b>${data.pickupTime || "Auto"}</b></div>
        <div><span>Shipper</span><b>${data.customer || "-"}</b></div>
        <div><span>Place Loading</span><b>${data.pickupLocation || "-"}</b></div>
        <div><span>Driver's Name</span><b>${data.driverName || "-"}</b></div>
        <div><span>Truck License</span><b>${data.vehiclePlate || "-"}</b></div>
        <div><span>Package Type</span><b>${data.packageType || "-"}</b></div>
        <div><span>Sticker Color</span><b>${data.stickerColor || "-"}</b></div>
      </div>
      <table class="cargo-table">
        <thead>
          <tr>
            <th>HAWB / House</th>
            <th>Destination</th>
            <th>Total Carton</th>
            <th>Route</th>
          </tr>
        </thead>
        <tbody>
          ${previewRows.map(row => `
            <tr>
              <td>${row.house || row.houseNumber || "-"}</td>
              <td>${row.destination || data.destination || "-"}</td>
              <td>${row.carton || data.pieceCount || "-"}</td>
              <td>${row.destination || data.destination || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="cargo-checks">
        <span>□ Carton</span>
        <span>□ Bundle</span>
        <span>□ Pallet</span>
        <span>□ Shipping Document YES</span>
        <span>□ Airport Checked By</span>
      </div>
      <div class="cargo-sign">
        <div>Released Shipment & Seal by</div>
        <div>Received by</div>
        <div>Date / Time</div>
      </div>
      <footer>Preview generated from SmartLogistics Admin Form</footer>
    </div>
  `;
}

function adminCargoData() {
  return {
    houseNumber: $("#adminHouse").value.trim(),
    customer: $("#adminCustomer").selectedOptions[0]?.textContent || "-",
    rows: adminPickupRows(),
    pickupDate: $("#adminPickupDate").value,
    pickupLocation: $("#adminPickupLocation").value,
    driverName: $("#adminDriverName").value,
    vehiclePlate: $("#adminVehiclePlate").value,
    pieceCount: $("#adminPieceCount").value,
    packageType: $("#adminPackageType").value,
    destination: $("#adminDestination").value,
    stickerColor: $("#adminStickerColor").value
  };
}

function jobCargoData(job) {
  const rows = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? job.pickupItems
    : [{ houseNumber: job.houseNumber, destination: job.destination || job.routeType || job.destAirport || "WH3", carton: job.pieceCount || "" }];
  return {
    houseNumber: job.houseNumber,
    customer: job.customerName,
    rows,
    pickupDate: job.pickupDate || toDateInput(job.flightTime),
    pickupTime: job.readyTime ? new Date(job.readyTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "",
    pickupLocation: job.pickupLocation,
    driverName: job.driverName,
    vehiclePlate: job.vehiclePlate,
    pieceCount: job.pieceCount,
    packageType: job.packageType || "Carton",
    destination: job.destination || job.routeType || job.destAirport || "WH3",
    stickerColor: job.stickerColor
  };
}

function renderCargoPreview() {
  $("#cargoPreview").innerHTML = cargoSheetHtml(adminCargoData());
}

function pickupItemsToText(job) {
  const rows = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? job.pickupItems
    : [{ houseNumber: job.houseNumber, destination: job.destination || job.routeType || job.destAirport || "WH3", carton: job.pieceCount || "" }];
  return rows
    .map(row => `${row.houseNumber || row.house || job.houseNumber},${row.destination || job.destination || "WH3"},${row.carton || job.pieceCount || ""}`)
    .join("\n");
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fillAdminFormFromJob(job) {
  if (!job) return;
  if (state.customers?.length) renderAdminCustomerOptions();
  $("#adminHouse").value = job.houseNumber || "";
  $("#adminCustomer").value = job.customerId || "";
  $("#adminPickupCase").value = job.pickupCase || "SpecialMD";
  $("#adminPickupDate").value = job.pickupDate || toDateInput(job.flightTime) || new Date().toISOString().slice(0, 10);
  $("#adminPickupLocation").value = job.pickupLocation || "";
  $("#adminDriverName").value = job.driverName || "";
  $("#adminVehiclePlate").value = job.vehiclePlate || "";
  $("#adminPieceCount").value = job.pieceCount || "";
  $("#adminPickupItems").value = pickupItemsToText(job);
  $("#adminPackageType").value = job.packageType || "Carton";
  $("#adminDestination").value = job.destination || job.routeType || "WH3";
  $("#adminStickerColor").value = job.stickerColor || "";
  $("#adminFlightNo").value = job.flightNo || "";
  $("#adminFlightTime").value = toDateTimeInput(job.flightTime);
  $("#adminProductType").value = job.productType || "General";
  $("#adminRouteType").value = job.routeType || "WH3";
  $("#adminAmount").value = job.amount || 0;
  renderCargoPreview();
}

function statusClass(status) {
  if (status === "Billed" || status === "ReadyForBilling" || status === "XRayPassed") return "completed";
  if (status === "Inbound" || status === "Delivered") return "inbound";
  if (status === "ReXRayRequired") return "overdue";
  return "pending";
}

function renderAll() {
  if (!state.dashboard) return;
  renderAdminCustomerOptions();
  renderDriverJobSelect();
  renderMetrics();
  renderRecentOrders();
  renderOrderCards();
  renderTimeline();
  renderStaff();
  renderLocations();
  renderInvoices();
  renderAlerts();
  renderImportChanges();
  updateTerminalRequirements();
}

function renderAdminCustomerOptions() {
  const select = $("#adminCustomer");
  if (!select || !state.customers?.length) return;
  const current = select.value;
  select.innerHTML = state.customers
    .map(customer => `<option value="${customer.id}">${customer.name}</option>`)
    .join("");
  if (state.customers.some(customer => customer.id === current)) {
    select.value = current;
  }
}

function renderMetrics() {
  const jobs = state.dashboard.jobs;
  $("#metricInbound").textContent = jobs.filter(job => ["Inbound", "Delivered", "PickupStarted"].includes(job.status)).length;
  $("#metricOutbound").textContent = jobs.filter(job => ["XRayPassed", "ReadyForBilling", "Billed"].includes(job.status)).length;
  $("#metricPendingJobs").textContent = jobs.filter(job => ["Pending", "PickupStarted"].includes(job.status)).length;
  $("#metricOverdue").textContent = jobs.filter(job => job.redFlag).length;
}

function renderRecentOrders() {
  $("#recentOrdersTable").innerHTML = state.dashboard.jobs.slice(0, 8).map(job => `
    <tr>
      <td><strong>${job.houseNumber}</strong><small>Job ID: ${job.id}</small></td>
      <td><span class="pill ${statusClass(job.status)}">${job.status}</span></td>
      <td>${job.customerName}</td>
      <td>${job.flightNo}<small>${job.destination || job.routeType || "WH3"} · ${job.flightTimeLabel}</small></td>
      <td><div class="lead-bar"><span style="width:${Math.max(8, Math.min(100, 100 - job.hoursToFlight * 8))}%"></span></div>${job.hoursToFlight} hrs</td>
    </tr>
  `).join("");
}

function renderOrderCards() {
  const query = ($("#orderSearch")?.value || $("#globalSearch")?.value || "").toLowerCase();
  const jobs = state.dashboard.jobs.filter(job => {
    const haystack = `${job.houseNumber} ${job.customerName} ${job.flightNo}`.toLowerCase();
    return haystack.includes(query);
  });
  if (!jobs.some(job => job.houseNumber === state.selectedHouse) && jobs[0]) {
    state.selectedHouse = jobs[0].houseNumber;
  }
  $("#orderCards").innerHTML = jobs.map(job => `
    <button class="order-card ${job.houseNumber === state.selectedHouse ? "active" : ""}" type="button" data-house="${job.houseNumber}">
      <span class="cube">□</span>
      <strong>${job.houseNumber}</strong>
      <small>${job.customerName || "-"} / ${job.flightTimeLabel || "-"}</small>
      <span class="cargo-state ${job.cargoIssuedAt ? "issued" : "not-issued"}">${job.cargoIssuedAt ? "Cargo issued" : "ยังไม่ออกใบ Cargo"}</span>
      <span class="pill ${statusClass(job.status)}">${job.status}</span>
    </button>
  `).join("");

  $$(".order-card").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedHouse = card.dataset.house;
      state.previewClosedHouse = "";
      renderOrderCards();
      renderTimeline();
    });
  });
}

function renderTimelineLegacyUnused() {
  const job = findJob();
  if (!job) {
    $("#selectedOrderTitle").textContent = "ยังไม่มีงาน / No order";
    $("#selectedOrderSubtitle").textContent = "Import file or create a job first";
    $("#timelineList").innerHTML = `<div class="empty-state">เลือกงานด้านซ้าย หรือ import CSV เพื่อดูรายละเอียด / Select an order or import CSV.</div>`;
    return;
  }
  $("#selectedOrderTitle").textContent = job.houseNumber;
  $("#selectedOrderSubtitle").textContent = `${job.customerName} · ID: ${job.id}`;
  $("#hazardInfo").textContent = job.requiresLithiumDocs ? "Yes / Lithium" : "No";
  $("#pickupCaseInfo").textContent = job.pickupCase || "-";
  $("#destinationInfo").textContent = job.destination || job.routeType || "-";
  $("#driverInfo").textContent = [job.driverName, job.vehiclePlate].filter(Boolean).join(" / ") || "-";
  $("#piecesInfo").textContent = job.pieceCount || "-";
  $("#pickupItemsInfo").textContent = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? `${job.pickupItems.length} rows`
    : "-";
  $("#packageInfo").textContent = job.packageType || "-";
  $("#stickerInfo").textContent = job.stickerColor || "-";

  const steps = [
    ["Pickup", "รับสินค้าจากลูกค้า / Cargo picked up", ["PickupStarted", "Delivered", "Inbound", "XRayPassed", "ReadyForBilling", "Billed"].includes(job.status)],
    ["Inbound Receive", "รับเข้าคลัง WH3 และจัดตำแหน่ง / Received at WH3", ["Inbound", "XRayPassed", "ReadyForBilling", "Billed"].includes(job.status)],
    ["Document Check", "ตรวจเอกสาร Permit / Cargo Transfer / Lithium", Boolean(job.documentValidated)],
    ["X-Ray", "ตรวจ X-Ray ก่อนเข้าถาดโหลด / Terminal security scan", ["Passed"].includes(job.xrayStatus)],
    ["Loading Detail", "รวม flight และอัปโหลด Loading Detail", Boolean(job.loadingDetailUploaded)],
    ["Billing", "สร้างเอกสารวางบิล / Invoice generated", job.status === "Billed"]
  ];

  $("#timelineList").innerHTML = steps.map((step, index) => `
    <div class="timeline-item ${step[2] ? "done" : index === 0 ? "active" : ""}">
      <span>${step[2] ? "✓" : index + 1}</span>
      <div>
        <strong>${step[0]}</strong>
        <p>${step[1]}</p>
        <small>${step[2] ? "Completed" : "Pending"}</small>
      </div>
    </div>
  `).join("");
}

function renderStaff() {
  $("#staffTotal").textContent = state.staff.length;
  $("#staffTable").innerHTML = state.staff.map(staff => `
    <tr>
      <td><strong>${staff.code}</strong></td>
      <td><span class="mini-avatar">${staff.name[0]}</span>${staff.name}</td>
      <td><span class="pill ${staff.section === "Customs" ? "pending" : "inbound"}">${staff.section}</span></td>
      <td><span class="line-status ${staff.line === "Connected" ? "on" : ""}"></span>${staff.line}</td>
      <td><div class="lead-bar"><span style="width:${staff.kpi}%"></span></div>${staff.kpi}</td>
      <td>→</td>
    </tr>
  `).join("");
}

function renderLocations() {
  $("#locationList").innerHTML = state.dashboard.locations.map(location => `
    <article class="location">
      <strong>${location.id}</strong>
      <small>${location.status}${location.currentHouseId ? ` · ${location.currentHouseId}` : ""}</small>
    </article>
  `).join("");
}

function renderInvoices() {
  const html = state.dashboard.billing.length
    ? state.dashboard.billing.map(bill => `
      <article class="invoice">
        <strong>${bill.id}</strong>
        <small>${bill.customerName} · ${money(bill.amount)} บาท · ${bill.status}</small>
        ${bill.pdfUrl ? `<a href="${assetUrl(bill.pdfUrl)}" target="_blank" rel="noreferrer">เปิดเอกสาร / Open document</a>` : ""}
      </article>
    `).join("")
    : `<article class="invoice">ยังไม่มี Invoice / No invoices</article>`;
  $$("#invoiceList").forEach(el => el.innerHTML = html);
}

function renderAlerts() {
  const html = state.dashboard.alerts.length
    ? state.dashboard.alerts.map(alert => `<article class="alert ${alert.severity}">${alert.message}<br><small>${new Date(alert.createdAt).toLocaleString("th-TH")}</small></article>`).join("")
    : `<article class="alert">ยังไม่มี Alert / No alerts</article>`;
  $$("#alertList").forEach(el => el.innerHTML = html);
}

function renderImportChanges() {
  const changes = state.dashboard.importChanges || [];
  const html = changes.length
    ? changes.map(change => `
      <article class="change-item ${change.changes?.length ? "changed" : "not-issued"}">
        <strong>${change.message}</strong>
        <small>${change.customerName || "-"} · ${new Date(change.createdAt).toLocaleString("th-TH")}</small>
        <div>
          ${(change.changes || []).map(item => `<span>${item}</span>`).join("")}
          ${change.notIssued ? `<span>NOT_ISSUED</span>` : ""}
        </div>
      </article>
    `).join("")
    : `<article class="change-item">ยังไม่มีรายการเปลี่ยนแปลง / No flight updates yet</article>`;
  $$("#importChangeList, #adminImportChangeList").forEach(el => el.innerHTML = html);
}

function updateTerminalRequirements() {
  const input = $("#lithiumDoc");
  if (!input) return;
  const house = $("#terminalHouse").value.trim();
  const job = findJob(house);
  const label = $("#lithiumDocLabel");
  if (job?.requiresLithiumDocs) {
    input.required = true;
    label.textContent = "เอกสารลิเธียม / Permit (บังคับ / Required)";
  } else {
    input.required = false;
    label.textContent = "เอกสารเพิ่มเติม / Optional document";
  }
}

function renderCargoIssueState(job) {
  const banner = $("#cargoIssueBanner");
  const button = $("#issueCargoBtn");
  if (!banner || !button) return;
  if (!job) {
    banner.classList.remove("issued");
    banner.querySelector("strong").textContent = "ยังไม่มีงานให้เลือก";
    banner.querySelector("span").textContent = "เลือกงานด้านซ้ายก่อนออกใบ Cargo / Select an order first.";
    button.disabled = true;
    button.textContent = "ออกใบ Cargo";
    return;
  }
  const issued = Boolean(job.cargoIssuedAt);
  banner.classList.toggle("issued", issued);
  banner.querySelector("strong").textContent = issued ? "ออกใบ Cargo แล้ว" : "ยังไม่ออกใบ Cargo";
  banner.querySelector("span").textContent = issued
    ? `ออกเมื่อ ${new Date(job.cargoIssuedAt).toLocaleString("th-TH")} / Ready to print or reprint.`
    : "งานนี้มาจากไฟล์แล้ว ต้องออกใบก่อนส่งให้คนขับ / Issue Cargo form before dispatch.";
  button.disabled = false;
  button.textContent = issued ? "ดู/พิมพ์ใบ Cargo" : "ออกใบ Cargo";
}

function renderTimeline() {
  const job = findJob();
  if (!job) {
    $("#selectedOrderTitle").textContent = "No order selected";
    $("#selectedOrderSubtitle").textContent = "Import CSV or create a job first";
    $("#routeOrigin").textContent = "-";
    $("#routeDest").textContent = "-";
    $("#routeWeight").textContent = "-";
    $("#hazardInfo").textContent = "-";
    $("#pickupCaseInfo").textContent = "-";
    $("#cargoIssuedInfo").textContent = "-";
    $("#destinationInfo").textContent = "-";
    $("#driverInfo").textContent = "-";
    $("#piecesInfo").textContent = "-";
    $("#pickupItemsInfo").textContent = "-";
    $("#packageInfo").textContent = "-";
    $("#stickerInfo").textContent = "-";
    $("#timelineList").innerHTML = `<div class="empty-state">ยังไม่มีงานให้แสดง / No job available yet</div>`;
    renderCargoIssueState(null);
    return;
  }

  renderCargoIssueState(job);
  $("#selectedOrderTitle").textContent = job.houseNumber || "-";
  $("#selectedOrderSubtitle").textContent = `${job.customerName || "-"} / ID: ${job.id || "-"}`;
  $("#routeOrigin").textContent = job.pickupLocation || job.originAirport || "WH3";
  $("#routeDest").textContent = job.destination || job.routeType || job.destAirport || "-";
  $("#routeWeight").textContent = job.weightKg ? `${job.weightKg}kg` : (job.weight ? `${job.weight}kg` : (job.pieceCount || "-"));
  $("#hazardInfo").textContent = job.requiresLithiumDocs ? "Yes / Lithium" : "No";
  $("#pickupCaseInfo").textContent = job.pickupCase || "-";
  $("#cargoIssuedInfo").textContent = job.cargoIssuedAt ? `Issued ${new Date(job.cargoIssuedAt).toLocaleString("th-TH")}` : "Not issued / ยังไม่ออกใบ";
  $("#destinationInfo").textContent = job.destination || job.routeType || job.destAirport || "-";
  $("#driverInfo").textContent = [job.driverName, job.vehiclePlate].filter(Boolean).join(" / ") || "-";
  $("#piecesInfo").textContent = job.pieceCount || "-";
  $("#pickupItemsInfo").textContent = Array.isArray(job.pickupItems) && job.pickupItems.length ? `${job.pickupItems.length} rows` : "-";
  $("#packageInfo").textContent = job.packageType || "-";
  $("#stickerInfo").textContent = job.stickerColor || "-";

  const steps = [
    ["Pickup", "รับสินค้าจากลูกค้า / Cargo picked up", ["PickupStarted", "Delivered", "Inbound", "XRayPassed", "ReadyForBilling", "Billed"].includes(job.status)],
    ["Inbound Receive", "รับเข้าคลัง WH3 และจัดตำแหน่ง / Received at WH3", ["Inbound", "XRayPassed", "ReadyForBilling", "Billed"].includes(job.status)],
    ["Document Check", "ตรวจเอกสาร Permit / Cargo Transfer / Lithium", Boolean(job.documentValidated)],
    ["X-Ray", "ตรวจ X-Ray ก่อนโหลด / Terminal security scan", job.xrayStatus === "Passed"],
    ["Loading Detail", "รวม Flight และอัปโหลด Loading Detail", Boolean(job.loadingDetailUploaded)],
    ["Billing", "สร้างเอกสารวางบิล / Invoice generated", job.status === "Billed"]
  ];

  $("#timelineList").innerHTML = steps.map((step, index) => `
    <div class="timeline-item ${step[2] ? "done" : index === 0 ? "active" : ""}">
      <span>${step[2] ? "✓" : index + 1}</span>
      <div>
        <strong>${step[0]}</strong>
        <p>${step[1]}</p>
        <small>${step[2] ? "Completed" : "Pending"}</small>
      </div>
    </div>
  `).join("");
}

function getGps() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      pos => {
        const gps = { gpsLat: pos.coords.latitude, gpsLong: pos.coords.longitude };
        state.lastGps = gps;
        resolve(gps);
      },
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function fileToCompressedBase64(input, maxWidth = 1280, quality = 0.72) {
  const file = input.files?.[0];
  if (!file) return Promise.resolve({ base64: "", mimeType: "" });
  if (file.type === "application/pdf") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ base64: reader.result, mimeType: file.type });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ base64: canvas.toDataURL("image/jpeg", quality), mimeType: "image/jpeg" });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function filesToCompressedBase64(input) {
  const files = Array.from(input.files || []);
  const results = [];
  for (const file of files) {
    const tempInput = { files: [file] };
    results.push(await fileToCompressedBase64(tempInput));
  }
  return results;
}

function readTextFile(input) {
  const file = input.files?.[0];
  if (!file) return Promise.reject(new Error("กรุณาเลือกไฟล์ CSV / Please choose a CSV file"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function setupSignaturePad() {
  const canvas = $("#signaturePad");
  const ctx = canvas.getContext("2d");
  let drawing = false;

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0] || event;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function start(event) {
    drawing = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    event.preventDefault();
  }

  function move(event) {
    if (!drawing) return;
    const p = point(event);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#17201d";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    event.preventDefault();
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", () => drawing = false);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", () => drawing = false);
  $("#clearSignature").addEventListener("click", () => ctx.clearRect(0, 0, canvas.width, canvas.height));
}

async function runAction(button, task) {
  button.disabled = true;
  try {
    await task();
    await refresh();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function datetimeLocalToIso(value) {
  return value ? new Date(value).toISOString() : "";
}

function bindEvents() {
  $$(".nav-item, [data-view-jump]").forEach(button => {
    button.addEventListener("click", () => setView(button.dataset.view || button.dataset.viewJump));
  });
  $("#orderSearch").addEventListener("input", renderOrderCards);
  $("#globalSearch").addEventListener("input", () => {
    renderRecentOrders();
    renderOrderCards();
  });
  $("#languageToggle").addEventListener("click", () => toast("หน้านี้แสดงสองภาษาแล้ว / This page is bilingual"));
  $("#addDriverPickupItem").addEventListener("click", () => addPickupItemRow());
  $("#driverJobSelect").addEventListener("change", event => applyDriverJob(event.target.value));
  $("#previewCargoBtn").addEventListener("click", renderCargoPreview);
  $("#printCargoPreviewBtn").addEventListener("click", () => window.print());
  $("#issueCargoBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    let job = findJob();
    if (!job) throw new Error("กรุณาเลือกงานก่อน / Please select an order first");
    const wasIssued = Boolean(job.cargoIssuedAt);
    if (!job.cargoIssuedAt) {
      const data = await api("/api/admin/issue-cargo", { houseNumber: job.houseNumber });
      state.dashboard = data.dashboard;
      job = findJob(job.houseNumber);
    }
    fillAdminFormFromJob(job);
    setView("admin");
    toast(wasIssued ? "เปิด Preview ใบ Cargo ที่หน้า Admin แล้ว / Cargo preview opened in Admin" : "ออกใบ Cargo แล้ว และเปิด Preview ที่หน้า Admin / Cargo issued and preview opened");
  }));
  ["adminPickupDate", "adminCustomer", "adminPickupLocation", "adminDriverName", "adminVehiclePlate", "adminPieceCount", "adminPickupItems", "adminPackageType", "adminDestination", "adminStickerColor"].forEach(id => {
    $(`#${id}`).addEventListener("input", renderCargoPreview);
  });
  $("#terminalHouse").addEventListener("input", updateTerminalRequirements);
  window.addEventListener("online", syncOfflineQueue);

  $("#checkInBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const gps = await getGps();
    state.pickupStartTime = new Date().toISOString();
    await api("/api/pickup/checkin", {
      houseNumber: primaryHouseNumber(),
      userId: "u_driver_01",
      startTime: state.pickupStartTime,
      startPlace: $("#driverStartPlace").value.trim(),
      ...gps
    });
    toast("เช็คอินสำเร็จ / Check-in complete");
  }));

  $("#completePickupBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const gps = await getGps();
    const productImages = await filesToCompressedBase64($("#productImages"));
    const cargoImages = await filesToCompressedBase64($("#cargoImages"));
    await api("/api/pickup/complete", {
      houseNumber: primaryHouseNumber(),
      userId: "u_driver_01",
      startTime: state.pickupStartTime,
      ...gps,
      productImages,
      cargoImages,
      signatureBase64: $("#signaturePad").toDataURL("image/png"),
      pieceCount: $("#driverPieceCount").value,
      pickupItems: syncPickupItemsText(),
      packageType: $("#driverPackageType").value,
      destination: $("#driverDestination").value,
      inspectorName: $("#driverInspectorName").value.trim(),
      receiverName: $("#driverReceiverName").value.trim(),
      endPlace: $("#driverEndPlace").value.trim()
    });
    toast("จบงาน Pickup แล้ว / Pickup completed");
  }));

  $("#twinScanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/inbound/twin-scan", {
      houseNumber: $("#scanHouse").value.trim(),
      locationId: $("#scanLocation").value.trim(),
      userId: "u_wh_01"
    });
    toast("ล็อกตำแหน่งสำเร็จ / Location locked");
  }));

  $("#validateDocBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const job = findJob($("#terminalHouse").value.trim());
    if (job?.requiresLithiumDocs && !$("#lithiumDoc").files.length) {
      throw new Error("งานลิเธียมต้องแนบเอกสารก่อน / Lithium document is required");
    }
    const doc = await fileToCompressedBase64($("#lithiumDoc"));
    await api("/api/outbound/validate", {
      houseNumber: $("#terminalHouse").value.trim(),
      lithiumDocBase64: doc.base64,
      mimeType: doc.mimeType
    });
    toast("ตรวจเอกสารสำเร็จ / Documents validated");
  }));

  $("#xrayPassedBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/xray", {
      houseNumber: $("#terminalHouse").value.trim(),
      userId: "u_terminal_01",
      passed: true,
      requiresRescan: false
    });
    toast("บันทึก X-Ray ผ่าน / X-Ray passed");
  }));

  $("#rescanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/xray", {
      houseNumber: $("#terminalHouse").value.trim(),
      userId: "u_terminal_01",
      passed: false,
      requiresRescan: true
    });
    toast("ส่ง Alert Re-X-Ray แล้ว / Alert sent");
  }));

  $("#loadingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const image = await fileToCompressedBase64($("#loadingImage"));
    await api("/api/outbound/loading-detail", {
      houseNumber: $("#terminalHouse").value.trim(),
      imageBase64: image.base64,
      mimeType: image.mimeType
    });
    toast("อัปโหลด Loading Detail แล้ว / Loading detail uploaded");
  }));

  $("#generateBillBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/generate", { houseNumber: $("#billingHouse").value.trim() });
    $("#invoiceId").value = data.bill.id;
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>ยอด ${money(data.bill.amount)} บาท · <a href="${assetUrl(data.bill.pdfUrl)}" target="_blank" rel="noreferrer">เปิดเอกสาร / Open document</a>`;
    toast("สร้างใบแจ้งหนี้ Draft แล้ว / Invoice draft created");
  }));

  $("#sendInvoiceBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/send-email", { invoiceId: $("#invoiceId").value.trim() });
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>${data.bill.status} · ${data.bill.billingEmail}`;
    toast("บันทึกสถานะส่งอีเมลแล้ว / Email status saved");
  }));

  $("#createJobBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/admin/job", {
      houseNumber: $("#adminHouse").value.trim(),
      customerId: $("#adminCustomer").value,
      pickupCase: $("#adminPickupCase").value,
      cargoFormMode: $("#adminPickupCase").value === "SpecialMD" ? "AdminPrepared" : "DriverWrites",
      adminPrepared: $("#adminPickupCase").value === "SpecialMD",
      pickupDate: $("#adminPickupDate").value,
      pickupLocation: $("#adminPickupLocation").value.trim(),
      driverName: $("#adminDriverName").value.trim(),
      vehiclePlate: $("#adminVehiclePlate").value.trim(),
      pieceCount: $("#adminPieceCount").value,
      pickupItems: $("#adminPickupItems").value,
      packageType: $("#adminPackageType").value,
      destination: $("#adminDestination").value,
      stickerColor: $("#adminStickerColor").value.trim(),
      flightNo: $("#adminFlightNo").value.trim(),
      flightTime: datetimeLocalToIso($("#adminFlightTime").value),
      productType: $("#adminProductType").value,
      routeType: $("#adminRouteType").value,
      amount: $("#adminAmount").value
    });
    toast("เปิดใบงานใหม่แล้ว / Job created");
  }));

  $("#importFlightBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/admin/import-flight", { csvText: $("#flightCsv").value });
    toast(`Import สำเร็จ ${data.imported} งาน / Imported ${data.imported} jobs`);
  }));

  $("#importScdBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const csvText = await readTextFile($("#scdCsvFile"));
    const data = await api("/api/admin/import-scd", { csvText });
    toast(`SCD: ${data.imported} งาน · เปลี่ยน ${data.changed} · ยังไม่ออกใบ ${data.notIssued}`);
  }));
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

setupSignaturePad();
bindEvents();
$("#driverPickupDate").value = new Date().toISOString().slice(0, 10);
$("#adminPickupDate").value ||= new Date().toISOString().slice(0, 10);
addPickupItemRow({ houseNumber: "4840779189", destination: "TGINT", carton: "1M" });
renderCargoPreview();
setView("dashboard");
syncOfflineQueue();
refresh();
