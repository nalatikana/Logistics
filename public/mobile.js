const state = {
  dashboard: null,
  pickupStartTime: null,
  offlineQueue: JSON.parse(localStorage.getItem("offlineQueue") || "[]")
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
      state.offlineQueue.push({ path, payload, createdAt: new Date().toISOString() });
      localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
      toast("เก็บไว้รอ Sync / Saved offline");
      return { ok: true, queued: true };
    }
    throw error;
  }
}

async function refresh() {
  const res = await fetch(apiUrl("/api/bootstrap"));
  const data = await res.json();
  state.dashboard = data.dashboard;
  render();
}

function render() {
  $("#mobileOpenJobs").textContent = state.dashboard.metrics.openJobs;
  $("#mobileBillingJobs").textContent = state.dashboard.metrics.readyForBilling;
  renderDriverJobSelect();
  $("#mobileJobList").innerHTML = state.dashboard.jobs.map(job => `
    <article class="job">
      <div>
        <strong>${job.houseNumber} · ${job.flightNo}</strong><br>
        <small>${job.customerName} · ${job.flightTimeLabel}</small>
      </div>
      <span class="badge">${job.status}</span>
    </article>
  `).join("");
  $("#locationList").innerHTML = state.dashboard.locations.map(location => `
    <article class="location">
      <strong>${location.id}</strong><br>
      <small>${location.status}${location.currentHouseId ? ` · ${location.currentHouseId}` : ""}</small>
    </article>
  `).join("");
  updateTerminalRequirements();
}

function renderDriverJobSelect() {
  const select = $("#driverJobSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = [
    `<option value="">กรอกเอง / Manual form</option>`,
    ...state.dashboard.jobs.map(job => `<option value="${job.houseNumber}">${job.houseNumber} · ${job.customerName}</option>`)
  ].join("");
  select.value = current && state.dashboard.jobs.some(job => job.houseNumber === current) ? current : "";
  applyDriverJob(select.value);
}

function findJob(houseNumber) {
  return state.dashboard?.jobs.find(job => job.houseNumber === houseNumber || job.id === houseNumber);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 3000);
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
  $("#driverCustomerName").readOnly = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
  $("#driverStartPlace").readOnly = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
  $("#driverVehiclePlate").readOnly = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
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

function showTab(tab) {
  $$(".action-card").forEach(button => button.classList.toggle("active", button.dataset.mobileTab === tab));
  $$(".mobile-panel[id^='tab-']").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tab}`));
}

function getGps() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ gpsLat: pos.coords.latitude, gpsLong: pos.coords.longitude }),
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
    results.push(await fileToCompressedBase64({ files: [file] }));
  }
  return results;
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
    ctx.strokeStyle = "#152033";
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

function updateTerminalRequirements() {
  const job = findJob($("#terminalHouse").value.trim());
  $("#lithiumDocLabel").textContent = job?.requiresLithiumDocs
    ? "เอกสารลิเธียม / Permit (Required)"
    : "เอกสารเพิ่มเติม / Optional document";
}

function bindEvents() {
  $$(".action-card").forEach(button => button.addEventListener("click", () => showTab(button.dataset.mobileTab)));
  $("#addDriverPickupItem").addEventListener("click", () => addPickupItemRow());
  $("#driverJobSelect").addEventListener("change", event => applyDriverJob(event.target.value));
  $("#terminalHouse").addEventListener("input", updateTerminalRequirements);

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
    toast("จบงานแล้ว / Completed");
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
      throw new Error("ต้องแนบเอกสารลิเธียม / Lithium document required");
    }
    const doc = await fileToCompressedBase64($("#lithiumDoc"));
    await api("/api/outbound/validate", {
      houseNumber: $("#terminalHouse").value.trim(),
      lithiumDocBase64: doc.base64,
      mimeType: doc.mimeType
    });
    toast("ตรวจเอกสารสำเร็จ / Validated");
  }));

  $("#xrayPassedBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/xray", {
      houseNumber: $("#terminalHouse").value.trim(),
      userId: "u_terminal_01",
      passed: true,
      requiresRescan: false
    });
    toast("X-Ray ผ่าน / Passed");
  }));

  $("#rescanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/xray", {
      houseNumber: $("#terminalHouse").value.trim(),
      userId: "u_terminal_01",
      passed: false,
      requiresRescan: true
    });
    toast("ส่ง Alert แล้ว / Alert sent");
  }));

  $("#loadingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const image = await fileToCompressedBase64($("#loadingImage"));
    await api("/api/outbound/loading-detail", {
      houseNumber: $("#terminalHouse").value.trim(),
      imageBase64: image.base64,
      mimeType: image.mimeType
    });
    toast("อัปโหลดแล้ว / Uploaded");
  }));

  $("#generateBillBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/generate", { houseNumber: $("#billingHouse").value.trim() });
    $("#invoiceId").value = data.bill.id;
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br><a href="${assetUrl(data.bill.pdfUrl)}" target="_blank">เปิดเอกสาร / Open</a>`;
    toast("สร้างบิลแล้ว / Invoice created");
  }));

  $("#sendInvoiceBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/send-email", { invoiceId: $("#invoiceId").value.trim() });
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>${data.bill.status} · ${data.bill.billingEmail}`;
    toast("ส่งอีเมลแล้ว / Sent");
  }));
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

setupSignaturePad();
bindEvents();
$("#driverPickupDate").value = new Date().toISOString().slice(0, 10);
addPickupItemRow({ houseNumber: "4840779189", destination: "TGINT", carton: "1M" });
refresh();
