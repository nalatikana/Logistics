const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const TZ = "Asia/Bangkok";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STORAGE_DIR = path.join(ROOT, "storage");
const INVOICE_DIR = path.join(STORAGE_DIR, "invoices");
const DB_FILE = path.join(DATA_DIR, "db.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function ensureRuntimeFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.mkdirSync(INVOICE_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const now = new Date().toISOString();
    const seed = {
      users: [
        { id: "u_driver_01", role: "Driver", name: "คนขับ A", status: "Active" },
        { id: "u_wh_01", role: "WH_Staff", name: "พนักงาน WH3", status: "Active" },
        { id: "u_terminal_01", role: "Terminal", name: "Terminal Lead", status: "Active" },
        { id: "u_billing_01", role: "Billing", name: "บัญชี", status: "Active" },
        { id: "u_admin_01", role: "Admin", name: "แอดมิน", status: "Active" },
        { id: "u_exec_01", role: "Executive", name: "ผู้บริหาร", status: "Active" }
      ],
      customers: [
        {
          id: "c_wd",
          name: "WD Export Co., Ltd.",
          taxId: "0105559000001",
          billingEmail: "billing@example.com",
          creditTerm: 30
        },
        {
          id: "c_general",
          name: "General Air Cargo",
          taxId: "0105559000002",
          billingEmail: "finance@example.com",
          creditTerm: 15
        }
      ],
      locations: [
        { id: "A-01", status: "Available", currentHouseId: "" },
        { id: "A-02", status: "Available", currentHouseId: "" },
        { id: "B-01", status: "Occupied", currentHouseId: "H-1002" }
      ],
      jobs: [
        {
          id: "JOB-1001",
          houseNumber: "H-1001",
          customerId: "c_wd",
          customerName: "WD Export Co., Ltd.",
          flightNo: "TG640",
          flightTime: addHoursIso(7),
          status: "Pending",
          driverId: "u_driver_01",
          routeType: "WH3",
          productType: "Lithium",
          requiresLithiumDocs: true,
          xrayStatus: "Pending",
          loadingDetailUploaded: false,
          readyForBilling: false,
          amount: 12500,
          createdAt: now,
          updatedAt: now
        },
        {
          id: "JOB-1002",
          houseNumber: "H-1002",
          customerId: "c_general",
          customerName: "General Air Cargo",
          flightNo: "BFS210",
          flightTime: addHoursIso(3),
          status: "Inbound",
          driverId: "u_driver_01",
          routeType: "CrossDock",
          productType: "General",
          requiresLithiumDocs: false,
          xrayStatus: "Passed",
          loadingDetailUploaded: false,
          readyForBilling: false,
          amount: 8300,
          createdAt: now,
          updatedAt: now
        }
      ],
      activityLogs: [],
      attachments: [],
      alerts: [],
      billing: []
    };
    writeDb(seed);
  }
}

function addHoursIso(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 20 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function formatBangkok(iso) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(iso));
}

function normalizeJob(job) {
  const flightMs = new Date(job.flightTime).getTime();
  const remainingMs = flightMs - Date.now();
  const hoursToFlight = Math.round((remainingMs / 36e5) * 10) / 10;
  const loadingDone = Boolean(job.loadingDetailUploaded);
  return {
    ...job,
    flightTimeLabel: formatBangkok(job.flightTime),
    hoursToFlight,
    redFlag: hoursToFlight < 4 && !loadingDone,
    canUploadLoadingDetail: false
  };
}

function buildDashboard(db) {
  const jobs = db.jobs.map(job => normalizeJob(job));
  const byFlight = new Map();
  for (const job of jobs) {
    if (!byFlight.has(job.flightNo)) byFlight.set(job.flightNo, []);
    byFlight.get(job.flightNo).push(job);
  }
  for (const group of byFlight.values()) {
    const canUpload = group.every(job => job.xrayStatus === "Passed");
    for (const job of group) job.canUploadLoadingDetail = canUpload;
  }
  const openJobs = jobs.filter(job => job.status !== "Billed").length;
  const readyForBilling = jobs.filter(job => job.readyForBilling).length;
  const billedAmount = db.billing.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const pendingAmount = jobs
    .filter(job => job.readyForBilling)
    .reduce((sum, job) => sum + Number(job.amount || 0), 0);
  const averageDurationMinutes = averageCompletedDuration(db.activityLogs);
  return {
    jobs,
    locations: db.locations,
    billing: db.billing.slice(-20).reverse(),
    attachments: db.attachments.slice(-30).reverse(),
    importChanges: (db.importChanges || []).slice(-50).reverse(),
    alerts: db.alerts.slice(-20).reverse(),
    metrics: {
      openJobs,
      readyForBilling,
      billedAmount,
      pendingAmount,
      averageDurationMinutes
    }
  };
}

function averageCompletedDuration(logs) {
  const durations = logs
    .filter(log => log.startTime && log.endTime)
    .map(log => (new Date(log.endTime) - new Date(log.startTime)) / 60000)
    .filter(value => Number.isFinite(value) && value >= 0);
  if (!durations.length) return 0;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function findJob(db, houseNumber) {
  return db.jobs.find(job => job.houseNumber === houseNumber || job.id === houseNumber);
}

function upsertJob(db, payload) {
  const houseNumber = String(payload.houseNumber || "").trim();
  if (!houseNumber) throw new Error("House number is required");
  const customer = payload.customerName
    ? getOrCreateCustomer(db, payload.customerName, payload)
    : db.customers.find(item => item.id === payload.customerId) || db.customers[0];
  const now = nowIso();
  let job = findJob(db, houseNumber);
  if (!job) {
    job = {
      id: payload.jobId || `JOB-${Date.now()}`,
      houseNumber,
      createdAt: now
    };
    db.jobs.push(job);
  }
  Object.assign(job, {
    customerId: customer.id,
    customerName: customer.name,
    flightNo: payload.flightNo || job.flightNo || "TBC",
    flightTime: payload.flightTime || job.flightTime || addHoursIso(8),
    status: payload.status || job.status || "Pending",
    driverId: payload.driverId || job.driverId || "u_driver_01",
    routeType: payload.routeType || job.routeType || "WH3",
    productType: payload.productType || job.productType || "General",
    requiresLithiumDocs: Boolean(payload.requiresLithiumDocs || payload.productType === "Lithium"),
    xrayStatus: job.xrayStatus || "Pending",
    loadingDetailUploaded: Boolean(job.loadingDetailUploaded),
    readyForBilling: Boolean(job.readyForBilling),
    amount: Number(payload.amount || job.amount || 0),
    pickupCase: payload.pickupCase || job.pickupCase || "GeneralManual",
    cargoFormMode: payload.cargoFormMode || job.cargoFormMode || "DriverWrites",
    pickupDate: payload.pickupDate || job.pickupDate || "",
    pickupLocation: payload.pickupLocation || job.pickupLocation || "",
    driverName: payload.driverName || job.driverName || "",
    vehiclePlate: payload.vehiclePlate || job.vehiclePlate || "",
    pieceCount: payload.pieceCount || job.pieceCount || "",
    pickupItems: normalizePickupItems(payload.pickupItems || job.pickupItems || ""),
    packageType: payload.packageType || job.packageType || "",
    inspectorName: payload.inspectorName || job.inspectorName || "",
    receiverName: payload.receiverName || job.receiverName || "",
    startPlace: payload.startPlace || job.startPlace || "",
    endPlace: payload.endPlace || job.endPlace || "",
    destination: payload.destination || job.destination || payload.routeType || job.destination || "WH3",
    stickerColor: payload.stickerColor || job.stickerColor || "",
    onhand: payload.onhand || job.onhand || "",
    destAirport: payload.destAirport || job.destAirport || "",
    pickupPhone: payload.pickupPhone || job.pickupPhone || "",
    contactPerson: payload.contactPerson || job.contactPerson || "",
    owner: payload.owner || job.owner || "",
    carrier: payload.carrier || job.carrier || "",
    readyTime: payload.readyTime || job.readyTime || "",
    closeTime: payload.closeTime || job.closeTime || "",
    weight: payload.weight || job.weight || "",
    refs: payload.refs || job.refs || "",
    cargoIssuedAt: payload.cargoIssuedAt || job.cargoIssuedAt || "",
    adminPrepared: Boolean(payload.adminPrepared || job.adminPrepared),
    updatedAt: now
  });
  return job;
}

function getOrCreateCustomer(db, name, payload = {}) {
  const cleanName = String(name || "").trim() || "Unknown Customer";
  const found = db.customers.find(customer => customer.name.toLowerCase() === cleanName.toLowerCase());
  if (found) return found;
  const idBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28) || "customer";
  let id = `c_${idBase}`;
  let counter = 2;
  while (db.customers.some(customer => customer.id === id)) {
    id = `c_${idBase}_${counter++}`;
  }
  const customer = {
    id,
    name: cleanName,
    taxId: "",
    billingEmail: "",
    creditTerm: 0,
    phone: payload.pickupPhone || "",
    contactPerson: payload.contactPerson || "",
    address: payload.pickupLocation || ""
  };
  db.customers.push(customer);
  return customer;
}

function normalizePickupItems(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [houseNumber, destination, carton] = line.split(",").map(cell => cell.trim());
      return { houseNumber, destination: destination || "", carton: carton || "" };
    });
}

function parseCsvRows(csvText) {
  return String(csvText || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(",").map(cell => cell.trim()));
}

function parseCsvTable(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const text = String(csvText || "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map(header => String(header || "").replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => record[header] = String(values[index] || "").trim());
    return record;
  });
}

function parseScdDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return "";
  const [, dd, mm, yy, hh = "00", min = "00"] = match;
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  return new Date(`${year}-${mm}-${dd}T${hh}:${min}:00+07:00`).toISOString();
}

function isScdWorkRow(row) {
  const onhand = String(row.ONHAND || "").trim();
  if (!onhand || /^\d{2}\.\d{2}\.\d{2}$/.test(onhand)) return false;
  return Boolean(row.PICKUP || row.HAWB || row.DEST);
}

function importScdRows(db, csvText) {
  const records = parseCsvTable(csvText).filter(isScdWorkRow);
  const imported = [];
  const changes = [];
  for (const row of records) {
    const hawb = String(row.HAWB || "").trim();
    const onhand = String(row.ONHAND || "").trim();
    const houseNumber = hawb && hawb.toUpperCase() !== "AIR" ? hawb : onhand;
    const dest = String(row.DEST || "").trim();
    const qty = String(row.QTY || "").trim();
    const readyTime = parseScdDate(row.READY);
    const closeTime = parseScdDate(row.CLOSE);
    const existing = findJob(db, houseNumber);
    const changeSet = [];
    if (!existing) {
      changeSet.push("NEW_JOB");
    } else {
      if ((existing.destAirport || "").trim() !== dest) changeSet.push("DEST_CHANGED");
      if ((existing.closeTime || existing.flightTime || "") !== (closeTime || readyTime || existing.flightTime || "")) changeSet.push("FLIGHT_TIME_CHANGED");
      if (String(existing.pieceCount || "") !== qty) changeSet.push("QTY_CHANGED");
      if ((existing.customerName || "").trim() !== String(row.PICKUP || "").trim()) changeSet.push("CUSTOMER_CHANGED");
    }
    const job = upsertJob(db, {
      jobId: onhand,
      houseNumber,
      onhand,
      customerName: row.PICKUP,
      destAirport: dest,
      pickupDate: readyTime ? readyTime.slice(0, 10) : "",
      pickupLocation: row.Address,
      pickupPhone: row.PHONE,
      contactPerson: row.CONTACT_PERSON,
      owner: row.OWNER,
      carrier: row.CARRIER,
      pieceCount: qty,
      pickupItems: `${houseNumber},${dest || "WH3"},${qty}`,
      packageType: "Carton",
      destination: "WH3",
      routeType: "WH3",
      flightNo: dest || "TBC",
      flightTime: closeTime || readyTime || addHoursIso(8),
      readyTime,
      closeTime,
      weight: row.WEIGHT,
      refs: row["REFS#"],
      status: "Pending",
      cargoFormMode: "AdminPrepared",
      adminPrepared: true
    });
    const notIssued = !job.cargoIssuedAt;
    if (changeSet.length || notIssued) {
      const change = {
        id: `CHG-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
        houseNumber: job.houseNumber,
        onhand,
        customerName: job.customerName,
        changes: changeSet,
        notIssued,
        message: buildImportChangeMessage(job, changeSet, notIssued),
        createdAt: nowIso()
      };
      changes.push(change);
    }
    imported.push(job);
  }
  db.importChanges = [...(db.importChanges || []), ...changes].slice(-300);
  return { imported, changes };
}

function buildImportChangeMessage(job, changes, notIssued) {
  const parts = [];
  if (changes.includes("NEW_JOB")) parts.push(`งานใหม่ ${job.houseNumber}`);
  if (changes.includes("FLIGHT_TIME_CHANGED")) parts.push(`เที่ยวบิน/เวลาปิดเปลี่ยน ${job.houseNumber}`);
  if (changes.includes("DEST_CHANGED")) parts.push(`ปลายทางเปลี่ยน ${job.houseNumber}`);
  if (changes.includes("QTY_CHANGED")) parts.push(`จำนวนเปลี่ยน ${job.houseNumber}`);
  if (changes.includes("CUSTOMER_CHANGED")) parts.push(`ลูกค้าเปลี่ยน ${job.houseNumber}`);
  if (notIssued) parts.push(`ยังไม่ออกใบงาน`);
  return parts.join(" · ") || `ยืนยันข้อมูล ${job.houseNumber}`;
}

function saveBase64File(db, { houseNumber, fileType, base64, mimeType }) {
  if (!base64) return null;
  const clean = String(base64).includes(",") ? String(base64).split(",").pop() : String(base64);
  const ext = mimeType && mimeType.includes("pdf") ? ".pdf" : ".jpg";
  const fileId = `FILE-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const folder = path.join(STORAGE_DIR, houseNumber || "unassigned");
  fs.mkdirSync(folder, { recursive: true });
  const filename = `${fileId}${ext}`;
  const filePath = path.join(folder, filename);
  fs.writeFileSync(filePath, Buffer.from(clean, "base64"));
  const url = `/storage/${encodeURIComponent(houseNumber || "unassigned")}/${filename}`;
  const attachment = {
    fileId,
    houseNumber,
    fileType,
    url,
    mimeType: mimeType || "image/jpeg",
    createdAt: nowIso()
  };
  db.attachments.push(attachment);
  return attachment;
}

function saveBase64Files(db, { houseNumber, fileType, files }) {
  if (!Array.isArray(files)) return [];
  return files
    .map(file => saveBase64File(db, {
      houseNumber,
      fileType,
      base64: file.base64,
      mimeType: file.mimeType
    }))
    .filter(Boolean);
}

function logActivity(db, payload) {
  const log = {
    logId: `LOG-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
    houseNumber: payload.houseNumber,
    activityType: payload.activityType,
    startTime: payload.startTime || nowIso(),
    endTime: payload.endTime || "",
    gpsLat: payload.gpsLat || null,
    gpsLong: payload.gpsLong || null,
    userId: payload.userId || "unknown",
    createdAt: nowIso()
  };
  db.activityLogs.push(log);
  return log;
}

async function createAlert(db, message, severity = "warning") {
  const alert = {
    id: `ALERT-${Date.now()}`,
    message,
    severity,
    createdAt: nowIso()
  };
  db.alerts.push(alert);

  if (process.env.LINE_WEBHOOK_URL) {
    try {
      await fetch(process.env.LINE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      alert.sent = true;
    } catch (error) {
      alert.sent = false;
      alert.error = error.message;
    }
  }
  return alert;
}

function generateInvoiceHtml(db, bill, job, customer) {
  const invoiceHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(bill.id)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #17201d; }
    h1 { color: #0f766e; margin-bottom: 4px; }
    .meta, table { width: 100%; margin-top: 24px; }
    .meta td { padding: 4px 0; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #dfe5df; padding: 10px; text-align: left; }
    th { background: #eef8f6; }
    .total { text-align: right; font-size: 20px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Invoice</h1>
  <strong>${escapeHtml(bill.id)}</strong>
  <table class="meta">
    <tr><td>Customer</td><td>${escapeHtml(customer?.name || job.customerName)}</td></tr>
    <tr><td>Tax ID</td><td>${escapeHtml(customer?.taxId || "-")}</td></tr>
    <tr><td>Billing Email</td><td>${escapeHtml(bill.billingEmail || "-")}</td></tr>
    <tr><td>House Number</td><td>${escapeHtml(job.houseNumber)}</td></tr>
    <tr><td>Flight</td><td>${escapeHtml(job.flightNo)} / ${escapeHtml(formatBangkok(job.flightTime))}</td></tr>
    <tr><td>Due Date</td><td>${escapeHtml(formatBangkok(bill.dueDate))}</td></tr>
  </table>
  <table>
    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>
      <tr><td>Air export logistics service - ${escapeHtml(job.houseNumber)}</td><td>${Number(bill.amount).toLocaleString("th-TH")} THB</td></tr>
    </tbody>
  </table>
  <p class="total">Total: ${Number(bill.amount).toLocaleString("th-TH")} THB</p>
</body>
</html>`;
  const filename = `${bill.id}.html`;
  const filePath = path.join(INVOICE_DIR, filename);
  fs.writeFileSync(filePath, invoiceHtml, "utf8");
  return `/storage/invoices/${filename}`;
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    return sendJson(res, 200, {
      users: db.users,
      customers: db.customers,
      dashboard: buildDashboard(db)
    });
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "smart-logistics-tracking",
      time: nowIso()
    });
  }

  if (req.method === "POST" && pathname === "/api/admin/job") {
    const payload = await parseBody(req);
    const job = upsertJob(db, payload);
    await createAlert(db, `New job opened: ${job.houseNumber} / ${job.flightNo}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/admin/issue-cargo") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    job.cargoIssuedAt = nowIso();
    job.adminPrepared = true;
    job.cargoFormMode = "AdminPrepared";
    job.updatedAt = nowIso();
    await createAlert(db, `Cargo form issued: ${job.houseNumber}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/admin/import-flight") {
    const payload = await parseBody(req);
    const rows = parseCsvRows(payload.csvText);
    const imported = [];
    for (const row of rows) {
      if (row[0]?.toLowerCase() === "house_number") continue;
      const [houseNumber, customerId, flightNo, flightTime, productType, routeType, amount] = row;
      if (!houseNumber) continue;
      imported.push(upsertJob(db, {
        houseNumber,
        customerId,
        flightNo,
        flightTime: flightTime ? new Date(flightTime).toISOString() : addHoursIso(8),
        productType,
        routeType,
        amount
      }));
    }
    await createAlert(db, `Imported ${imported.length} jobs from flight feed`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, imported: imported.length, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/admin/import-scd") {
    const payload = await parseBody(req);
    const result = importScdRows(db, payload.csvText);
    const criticalChanges = result.changes.filter(change => change.changes.length);
    if (criticalChanges.length) {
      await createAlert(db, `SCD update: มี ${criticalChanges.length} รายการเปลี่ยนแปลงเที่ยวบิน/งาน`, "danger");
    } else {
      await createAlert(db, `SCD update: ยืนยัน ${result.imported.length} งาน ไม่มี flight change`, "info");
    }
    writeDb(db);
    return sendJson(res, 200, {
      ok: true,
      imported: result.imported.length,
      changes: result.changes,
      changed: criticalChanges.length,
      notIssued: result.changes.filter(change => change.notIssued).length,
      dashboard: buildDashboard(db)
    });
  }

  if (req.method === "POST" && pathname === "/api/pickup/checkin") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const log = logActivity(db, { ...payload, activityType: "CheckIn" });
    job.status = "PickupStarted";
    job.startPlace = payload.startPlace || job.startPlace;
    job.checkInAt = nowIso();
    job.checkInGps = payload.gpsLat && payload.gpsLong ? `${payload.gpsLat},${payload.gpsLong}` : job.checkInGps;
    job.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), log });
  }

  if (req.method === "POST" && pathname === "/api/pickup/complete") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    saveBase64Files(db, {
      houseNumber: job.houseNumber,
      fileType: "ProductImage",
      files: payload.productImages
    });
    saveBase64Files(db, {
      houseNumber: job.houseNumber,
      fileType: "CargoForm",
      files: payload.cargoImages
    });
    const image = saveBase64File(db, {
      houseNumber: job.houseNumber,
      fileType: "SignedCargoForm",
      base64: payload.imageBase64,
      mimeType: payload.mimeType
    });
    saveBase64File(db, {
      houseNumber: job.houseNumber,
      fileType: "Signature",
      base64: payload.signatureBase64,
      mimeType: "image/png"
    });
    logActivity(db, {
      ...payload,
      activityType: "PickupComplete",
      startTime: payload.startTime || nowIso(),
      endTime: nowIso()
    });
    Object.assign(job, {
      pieceCount: payload.pieceCount || job.pieceCount,
      pickupItems: normalizePickupItems(payload.pickupItems || job.pickupItems || ""),
      packageType: payload.packageType || job.packageType,
      inspectorName: payload.inspectorName || job.inspectorName,
      receiverName: payload.receiverName || job.receiverName,
      endPlace: payload.endPlace || job.endPlace,
      destination: payload.destination || job.destination,
      completedAt: nowIso(),
      completeGps: payload.gpsLat && payload.gpsLong ? `${payload.gpsLat},${payload.gpsLong}` : job.completeGps
    });
    job.status = "Delivered";
    job.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), image });
  }

  if (req.method === "POST" && pathname === "/api/inbound/twin-scan") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    const location = db.locations.find(item => item.id === payload.locationId);
    if (!job) return sendJson(res, 404, { error: "House number not found" });
    if (!location) return sendJson(res, 404, { error: "Location not found" });
    if (location.status === "Occupied" && location.currentHouseId !== job.houseNumber) {
      return sendJson(res, 409, { error: `Location ${location.id} is already occupied` });
    }
    location.status = "Occupied";
    location.currentHouseId = job.houseNumber;
    job.status = "Inbound";
    job.locationId = location.id;
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "TwinScan" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), location });
  }

  if (req.method === "POST" && pathname === "/api/outbound/validate") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const missingLithiumDocs = job.requiresLithiumDocs && !payload.lithiumDocBase64;
    if (missingLithiumDocs) return sendJson(res, 422, { error: "Lithium document is required" });
    if (payload.lithiumDocBase64) {
      saveBase64File(db, {
        houseNumber: job.houseNumber,
        fileType: "LithiumDocument",
        base64: payload.lithiumDocBase64,
        mimeType: payload.mimeType || "image/jpeg"
      });
    }
    job.documentValidated = true;
    job.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/xray") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    job.xrayStatus = payload.passed ? "Passed" : "Failed";
    job.requiresRescan = Boolean(payload.requiresRescan);
    job.status = job.xrayStatus === "Passed" ? "XRayPassed" : "ReXRayRequired";
    job.updatedAt = nowIso();
    logActivity(db, {
      ...payload,
      activityType: "XRay",
      startTime: payload.startTime || nowIso(),
      endTime: nowIso()
    });
    if (job.requiresRescan) {
      await createAlert(db, `ต้อง Re-X-Ray: ${job.houseNumber} / Flight ${job.flightNo}`, "danger");
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/loading-detail") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const flightJobs = db.jobs.filter(item => item.flightNo === job.flightNo);
    if (!flightJobs.every(item => item.xrayStatus === "Passed")) {
      return sendJson(res, 409, { error: "Every house on this flight must pass X-Ray first" });
    }
    saveBase64File(db, {
      houseNumber: job.houseNumber,
      fileType: "LoadingDetail",
      base64: payload.imageBase64,
      mimeType: payload.mimeType || "image/jpeg"
    });
    for (const item of flightJobs) {
      item.loadingDetailUploaded = true;
      item.readyForBilling = true;
      item.status = "ReadyForBilling";
      item.updatedAt = nowIso();
    }
    await createAlert(db, `พร้อมวางบิล: Flight ${job.flightNo}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/billing/generate") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.readyForBilling) return sendJson(res, 409, { error: "Job is not ready for billing" });
    const customer = db.customers.find(item => item.id === job.customerId);
    const bill = {
      id: `INV-${new Date().getFullYear()}-${String(db.billing.length + 1).padStart(4, "0")}`,
      houseNumber: job.houseNumber,
      customerId: job.customerId,
      customerName: customer ? customer.name : job.customerName,
      billingEmail: customer ? customer.billingEmail : "",
      amount: Number(job.amount || 0),
      billedDate: nowIso(),
      dueDate: new Date(Date.now() + Number(customer?.creditTerm || 0) * 864e5).toISOString(),
      status: "Draft"
    };
    bill.pdfUrl = generateInvoiceHtml(db, bill, job, customer);
    db.billing.push(bill);
    job.status = "Billed";
    job.readyForBilling = false;
    job.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { ok: true, bill, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/billing/send-email") {
    const payload = await parseBody(req);
    const bill = db.billing.find(item => item.id === payload.invoiceId);
    if (!bill) return sendJson(res, 404, { error: "Invoice not found" });
    bill.status = "Sent";
    bill.sentAt = nowIso();
    await createAlert(db, `Invoice sent: ${bill.id} to ${bill.billingEmail}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, bill, dashboard: buildDashboard(db) });
  }

  return sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/storage/")) {
    const relative = decodeURIComponent(pathname.replace("/storage/", ""));
    const filePath = path.normalize(path.join(STORAGE_DIR, relative));
    if (!filePath.startsWith(STORAGE_DIR)) return sendJson(res, 403, { error: "Forbidden" });
    return streamFile(res, filePath);
  }

  const routeAliases = {
    "/": "/index.html",
    "/web": "/index.html",
    "/web/": "/index.html",
    "/mobile": "/mobile.html",
    "/mobile/": "/mobile.html"
  };
  const safePath = routeAliases[pathname] || pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Forbidden" });
  return streamFile(res, filePath);
}

function streamFile(res, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

ensureRuntimeFiles();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Smart Logistics Tracking is running at http://localhost:${PORT}`);
});
