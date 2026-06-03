const RECORDS_STORAGE_KEY = "employee-attendance-v1";
const EMPLOYEES_STORAGE_KEY = "employees";
const LEGACY_EMPLOYEES_STORAGE_KEY = "employee-directory-v1";
const FIRESTORE_SYNC_STORAGE_KEY = "yang-firestore-sync-v1";
const defaultDepartments = ["行政部", "倉儲部", "包裝部", "業務部", "主管", "其他"];
const defaultWorkSites = ["南崁", "平鎮", "支援外點", "郵船泛泰"];
const actionLabels = {
  clock_in: "上班",
  clock_out: "下班"
};
const allowedStatuses = ["正常", "遲到", "早退", "缺卡", "補打卡", "異常"];
const workSiteRules = {
  南崁: { start: "08:00", end: "17:00" },
  平鎮: { start: "09:00", end: "18:00" },
  郵船泛泰: { start: "08:30", end: "17:30" }
};
const reportWorkSites = ["南崁", "平鎮", "郵船泛泰"];

const clockForm = document.querySelector("#clockForm");
const formMessage = document.querySelector("#formMessage");
const currentTime = document.querySelector("#currentTime");
const currentDate = document.querySelector("#currentDate");
const adminLogin = document.querySelector("#adminLogin");
const adminPanel = document.querySelector("#adminPanel");
const adminAccount = document.querySelector("#adminAccount");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const attendanceTable = document.querySelector("#attendanceTable");
const employeeTable = document.querySelector("#employeeTable");
const employeeForm = document.querySelector("#employeeForm");
const employeeMessage = document.querySelector("#employeeMessage");
const editingEmployeeId = document.querySelector("#editingEmployeeId");
const employeeManageId = document.querySelector("#employeeManageId");
const employeeManageName = document.querySelector("#employeeManageName");
const employeeManageDepartment = document.querySelector("#employeeManageDepartment");
const employeeManageTitle = document.querySelector("#employeeManageTitle");
const employeeManagePhone = document.querySelector("#employeeManagePhone");
const employeeManagePassword = document.querySelector("#employeeManagePassword");
const employeeManageWorkSite = document.querySelector("#employeeManageWorkSite");
const employeeManageStartDate = document.querySelector("#employeeManageStartDate");
const employeeManageStatus = document.querySelector("#employeeManageStatus");
const employeeManageNote = document.querySelector("#employeeManageNote");
const saveEmployeeButton = document.querySelector("#saveEmployeeButton");
const cancelEmployeeButton = document.querySelector("#cancelEmployeeButton");
const employeeImportFile = document.querySelector("#employeeImportFile");
const importEmployeesButton = document.querySelector("#importEmployeesButton");
const importMessage = document.querySelector("#importMessage");
const checkLocalEmployeesButton = document.querySelector("#checkLocalEmployeesButton");
const importLocalEmployeesButton = document.querySelector("#importLocalEmployeesButton");
const clearLocalCacheButton = document.querySelector("#clearLocalCacheButton");
const deleteTestEmployeesButton = document.querySelector("#deleteTestEmployeesButton");
const localImportMessage = document.querySelector("#localImportMessage");
const employeeIdInput = document.querySelector("#employeeIdInput");
const clockPasswordInput = document.querySelector("#clockPasswordInput");
const employeeNameInput = document.querySelector("#employeeNameInput");
const departmentSelect = document.querySelector("#departmentSelect");
const workSiteSelect = document.querySelector("#workSiteSelect");
const stats = document.querySelector("#stats");
const siteStats = document.querySelector("#siteStats");
const employeeMonthlyStats = document.querySelector("#employeeMonthlyStats");
const todayStats = document.querySelector("#todayStats");
const recentList = document.querySelector("#recentList");
const dataMode = document.querySelector("#dataMode");
const dateFilter = document.querySelector("#dateFilter");
const employeeNameFilter = document.querySelector("#employeeNameFilter");
const employeeIdFilter = document.querySelector("#employeeIdFilter");
const departmentFilter = document.querySelector("#departmentFilter");
const actionFilter = document.querySelector("#actionFilter");
const monthlyReportMonth = document.querySelector("#monthlyReportMonth");
const toast = document.querySelector("#toast");
const installPrompt = document.querySelector("#installPrompt");
const installAppButton = document.querySelector("#installAppButton");
const dismissInstallButton = document.querySelector("#dismissInstallButton");

let cachedRecords = [];
let cachedEmployees = [];
let submitterAction = "clock_in";
let isAdminLoggedIn = false;
let deferredInstallPrompt = null;
let firebaseDb = null;
let firestoreReady = false;
let firestoreSyncing = false;
let cachedDepartments = defaultDepartments.map((name, index) => ({ id: name, name, order: index + 1, active: true }));
let unsubscribeEmployees = null;
let unsubscribeRecords = null;
let unsubscribeDepartments = null;

function loadJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.employees)) return value.employees;
    return [];
  } catch {
    return [];
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getFirebaseConfig() {
  return window.YANG_FIREBASE_CONFIG || {};
}

function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return Boolean(config.apiKey && config.projectId && !String(config.apiKey).startsWith("YOUR_") && !String(config.projectId).startsWith("YOUR_"));
}

function getFirestoreStatusText() {
  if (firestoreReady) return "Firebase Firestore";
  return isFirebaseConfigured() ? "本機資料庫 / Firebase 連線中" : "本機資料庫";
}

function firestoreCollection(name) {
  if (!firebaseDb) return null;
  return firebaseDb.collection(name);
}

async function readFirestoreCollection(name) {
  const collection = firestoreCollection(name);
  if (!collection) return [];
  const snapshot = await collection.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function replaceFirestoreCollection(name, items, idKey) {
  const collection = firestoreCollection(name);
  if (!collection || firestoreSyncing) return;
  const snapshot = await collection.get();
  const batch = firebaseDb.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  items.forEach((item, index) => {
    const id = String(item[idKey] || item.id || item.name || index);
    batch.set(collection.doc(id), { ...item, syncedAt: new Date().toISOString() });
  });
  await batch.commit();
}

async function upsertFirestoreCollection(name, items, idKey) {
  const collection = firestoreCollection(name);
  if (!collection) return;
  const batch = firebaseDb.batch();
  items.forEach((item, index) => {
    const id = String(item[idKey] || item.id || item.name || index);
    batch.set(collection.doc(id), { ...item, syncedAt: new Date().toISOString() }, { merge: true });
  });
  await batch.commit();
}

async function deleteFirestoreDocuments(name, ids) {
  const collection = firestoreCollection(name);
  if (!collection || !ids.length) return;
  const batch = firebaseDb.batch();
  ids.forEach((id) => batch.delete(collection.doc(String(id))));
  await batch.commit();
}

function sortEmployees(employees) {
  return [...employees].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

function sortRecords(records) {
  return [...records].sort((a, b) => `${b.workDate}${b.workTime}`.localeCompare(`${a.workDate}${a.workTime}`));
}

function normalizeDepartments(departments) {
  const seen = new Set();
  const normalized = departments
    .map((department, index) => ({
      id: String(department.id || department.name || "").trim(),
      name: String(department.name || department.id || "").trim(),
      order: Number(department.order || index + 1),
      active: department.active !== false
    }))
    .filter((department) => department.id && department.name)
    .filter((department) => {
      if (seen.has(department.id)) return false;
      seen.add(department.id);
      return true;
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return normalized.length ? normalized : defaultDepartments.map((name, index) => ({ id: name, name, order: index + 1, active: true }));
}

function refreshAfterRemoteSync() {
  renderDepartmentOptions();
  renderClockEmployeeSelect();
  renderAdmin();
  renderSummary();
}

function handleFirestoreEmployeesSnapshot(snapshot) {
  const remoteEmployees = normalizeEmployees(snapshot.docs.map((doc) => ({ employeeId: doc.id, ...doc.data() })));
  cachedEmployees = sortEmployees(remoteEmployees);
  saveJson(EMPLOYEES_STORAGE_KEY, cachedEmployees);
  refreshAfterRemoteSync();
}

function handleFirestoreRecordsSnapshot(snapshot) {
  const remoteRecords = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  cachedRecords = recalculateRecordStatuses(sortRecords(remoteRecords));
  saveJson(RECORDS_STORAGE_KEY, cachedRecords);
  refreshAfterRemoteSync();
}

function handleFirestoreDepartmentsSnapshot(snapshot) {
  const remoteDepartments = normalizeDepartments(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  cachedDepartments = remoteDepartments;
  refreshAfterRemoteSync();
}

function startFirestoreRealtimeSync() {
  unsubscribeEmployees?.();
  unsubscribeRecords?.();
  unsubscribeDepartments?.();

  unsubscribeEmployees = firebaseDb.collection("employees").onSnapshot(handleFirestoreEmployeesSnapshot, (error) =>
    console.warn("Firestore employees listener failed", error)
  );
  unsubscribeRecords = firebaseDb.collection("attendanceRecords").onSnapshot(handleFirestoreRecordsSnapshot, (error) =>
    console.warn("Firestore records listener failed", error)
  );
  unsubscribeDepartments = firebaseDb.collection("departments").onSnapshot(handleFirestoreDepartmentsSnapshot, (error) =>
    console.warn("Firestore departments listener failed", error)
  );
}

function syncEmployeesToFirestore() {
  if (!firestoreReady) return Promise.resolve();
  return upsertFirestoreCollection("employees", getEmployees(), "employeeId").catch((error) => console.warn("Firestore employees sync failed", error));
}

function syncRecordsToFirestore() {
  if (!firestoreReady) return Promise.resolve();
  return replaceFirestoreCollection("attendanceRecords", getRecords(), "id").catch((error) => console.warn("Firestore records sync failed", error));
}

function syncDirectoryToFirestore() {
  if (!firestoreReady) return Promise.resolve();
  return Promise.all([
    replaceFirestoreCollection(
      "departments",
      cachedDepartments,
      "id"
    ).catch((error) => console.warn("Firestore departments sync failed", error)),
    replaceFirestoreCollection(
      "workSites",
      defaultWorkSites.map((name, index) => ({ id: name, name, order: index + 1, active: true })),
      "id"
    ).catch((error) => console.warn("Firestore workSites sync failed", error))
  ]);
}

function mergeById(localItems, remoteItems, idKey) {
  const merged = new Map();
  localItems.forEach((item) => merged.set(item[idKey], item));
  remoteItems.forEach((item) => merged.set(item[idKey], { ...merged.get(item[idKey]), ...item }));
  return [...merged.values()].filter((item) => item[idKey]);
}

async function saveMonthlyReportToFirestore(monthValue) {
  if (!firestoreReady) return;
  const rows = getMonthlyEmployeeReportRows(monthValue);
  await firebaseDb.collection("monthlyReports").doc(monthValue).set({
    month: monthValue,
    generatedAt: new Date().toISOString(),
    rows
  });
}

async function initFirestoreSync() {
  if (!isFirebaseConfigured() || !window.firebase?.initializeApp) {
    renderSummary();
    return;
  }

  try {
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(getFirebaseConfig());
    }
    firebaseDb = window.firebase.firestore();
    firestoreReady = true;
    firestoreSyncing = true;

    const [remoteEmployees, remoteRecords, remoteDepartments] = await Promise.all([
      readFirestoreCollection("employees"),
      readFirestoreCollection("attendanceRecords"),
      readFirestoreCollection("departments")
    ]);
    const mergedEmployees = normalizeEmployees(remoteEmployees);
    const mergedRecords = recalculateRecordStatuses(remoteRecords);
    const mergedDepartments = normalizeDepartments(mergeById(cachedDepartments, remoteDepartments, "id"));

    cachedEmployees = mergedEmployees;
    cachedRecords = mergedRecords;
    cachedDepartments = mergedDepartments;
    saveJson(EMPLOYEES_STORAGE_KEY, cachedEmployees);
    saveJson(RECORDS_STORAGE_KEY, cachedRecords);
    localStorage.setItem(FIRESTORE_SYNC_STORAGE_KEY, new Date().toISOString());
    firestoreSyncing = false;

    await syncDirectoryToFirestore();
    startFirestoreRealtimeSync();
    refreshAfterRemoteSync();
    showToast("Firebase 同步完成");
  } catch (error) {
    firestoreReady = false;
    firestoreSyncing = false;
    console.warn("Firebase Firestore sync failed", error);
    showToast("Firebase 尚未連線，暫用本機資料");
    renderSummary();
  }
}

function getRecords() {
  return cachedRecords;
}

function getEmployees() {
  return cachedEmployees;
}

function getDepartments() {
  return cachedDepartments.filter((department) => department.active !== false);
}

function renderDepartmentOptions() {
  const departments = getDepartments();
  const departmentOptions = departments.map((department) => `<option value="${escapeHtml(department.name)}">${escapeHtml(department.name)}</option>`).join("");
  const employeeValue = employeeManageDepartment?.value || "行政部";
  const clockValue = departmentSelect?.value || "行政部";
  const filterValue = departmentFilter?.value || "";

  if (employeeManageDepartment) {
    employeeManageDepartment.innerHTML = departmentOptions;
    employeeManageDepartment.value = departments.some((department) => department.name === employeeValue) ? employeeValue : departments[0]?.name || "行政部";
  }

  if (departmentSelect) {
    departmentSelect.innerHTML = departmentOptions;
    departmentSelect.value = departments.some((department) => department.name === clockValue) ? clockValue : departments[0]?.name || "行政部";
  }

  if (departmentFilter) {
    departmentFilter.innerHTML = `<option value="">全部部門</option>${departmentOptions}`;
    departmentFilter.value = departments.some((department) => department.name === filterValue) ? filterValue : "";
  }
}

function saveRecords(records) {
  cachedRecords = recalculateRecordStatuses(records);
  saveJson(RECORDS_STORAGE_KEY, cachedRecords);
  syncRecordsToFirestore();
}

function normalizeEmployee(employee) {
  return {
    employeeId: normalizeEmployeeId(employee.employeeId || employee.id || employee.code),
    name: String(employee.name || employee.employeeName || "").trim(),
    department: String(employee.department || "其他").trim(),
    title: String(employee.title || employee.position || "").trim(),
    phone: String(employee.phone || employee.mobile || "").trim(),
    clockPassword: String(employee.clockPassword || employee.password || "1234").trim(),
    workSite: defaultWorkSites.includes(employee.workSite) ? employee.workSite : "南崁",
    startDate: employee.startDate || formatDateValue(new Date()),
    status: employee.status === "離職" ? "離職" : "在職",
    note: String(employee.note || "").trim(),
    createdAt: employee.createdAt || new Date().toISOString(),
    updatedAt: employee.updatedAt || new Date().toISOString()
  };
}

function normalizeEmployees(employees) {
  const seen = new Set();
  return employees
    .map(normalizeEmployee)
    .filter((employee) => employee.employeeId && employee.name)
    .filter((employee) => {
      if (seen.has(employee.employeeId)) return false;
      seen.add(employee.employeeId);
      return true;
    });
}

function saveEmployees(employees) {
  const normalizedEmployees = normalizeEmployees(employees);
  cachedEmployees = normalizedEmployees;
  saveJson(EMPLOYEES_STORAGE_KEY, normalizedEmployees);
  const syncTask = syncEmployeesToFirestore();
  syncDirectoryToFirestore();
  renderClockEmployeeSelect();
  return syncTask;
}

function loadEmployees() {
  const employees = normalizeEmployees(loadJson(EMPLOYEES_STORAGE_KEY));
  if (employees.length) {
    saveEmployees(employees);
    return employees;
  }
  const legacyEmployees = normalizeEmployees(loadJson(LEGACY_EMPLOYEES_STORAGE_KEY));
  if (legacyEmployees.length) {
    saveEmployees(legacyEmployees);
  }
  return legacyEmployees;
}

function formatDateValue(date) {
  return date.toISOString().split("T")[0];
}

function formatTimeValue(date) {
  return date.toTimeString().slice(0, 8);
}

function timeToMinutes(value) {
  const [hours = 0, minutes = 0] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function getEmployeeById(employeeId, employees = getEmployees()) {
  const normalizedId = normalizeEmployeeId(employeeId);
  return employees.find((employee) => employee.employeeId === normalizedId);
}

function getRecordWorkSite(record, employees = getEmployees()) {
  return record.workSite || getEmployeeById(record.employeeId, employees)?.workSite || "南崁";
}

function getAttendanceFlags(row) {
  const rule = workSiteRules[row.workSite];
  const missing = !row.clockIn || !row.clockOut;
  const late = Boolean(row.clockIn && rule && timeToMinutes(row.clockIn) > timeToMinutes(rule.start));
  const early = Boolean(row.clockOut && rule && timeToMinutes(row.clockOut) < timeToMinutes(rule.end));
  const status = missing ? "缺卡" : late ? "遲到" : early ? "早退" : "正常";
  return { missing, late, early, status };
}

function getRecordAutoStatus(record, row) {
  if (record.action === "clock_in" && row?.late) return "遲到";
  if (record.action === "clock_out" && row?.early) return "早退";
  if (row?.missing) return "缺卡";
  return "正常";
}

function getAttendanceSuccessMessage(record) {
  if (record.action === "clock_in") {
    return record.status === "遲到" ? "遲到上班" : "正常上班";
  }
  return record.status === "早退" ? "早退下班" : "正常下班";
}

function calculateWorkHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return "";
  const minutes = timeToMinutes(clockOut) - timeToMinutes(clockIn);
  if (minutes <= 0) return "";
  return (minutes / 60).toFixed(2);
}

function buildDailyAttendanceRows(records = getRecords(), employees = getEmployees(), options = {}) {
  const grouped = new Map();
  const { monthValue = "", dateValue = "" } = options;

  records
    .filter((record) => !monthValue || record.workDate.startsWith(monthValue))
    .filter((record) => !dateValue || record.workDate === dateValue)
    .forEach((record) => {
      const employee = getEmployeeById(record.employeeId, employees);
      const key = `${record.workDate}-${record.employeeId}`;
      const current = grouped.get(key) || {
        date: record.workDate,
        employeeId: record.employeeId,
        employeeName: record.employeeName || employee?.name || "",
        department: record.department || employee?.department || "",
        workSite: getRecordWorkSite(record, employees),
        clockIn: "",
        clockOut: "",
        notes: []
      };

      if (!current.workSite && record.workSite) {
        current.workSite = record.workSite;
      }
      if (record.action === "clock_in" && (!current.clockIn || record.workTime < current.clockIn)) {
        current.clockIn = record.workTime;
      }
      if (record.action === "clock_out" && (!current.clockOut || record.workTime > current.clockOut)) {
        current.clockOut = record.workTime;
      }
      if (record.note) {
        current.notes.push(record.note);
      }
      grouped.set(key, current);
    });

  return [...grouped.values()]
    .map((row) => {
      const flags = getAttendanceFlags(row);
      return {
        ...row,
        workHours: calculateWorkHours(row.clockIn, row.clockOut),
        status: flags.status,
        late: flags.late,
        early: flags.early,
        missing: flags.missing
      };
    })
    .sort((a, b) => `${a.date}${a.employeeId}`.localeCompare(`${b.date}${b.employeeId}`));
}

function recalculateRecordStatuses(records) {
  const employees = cachedEmployees;
  const dailyRows = buildDailyAttendanceRows(records, employees);
  const rowMap = new Map(dailyRows.map((row) => [`${row.date}-${row.employeeId}`, row]));

  return records.map((record) => {
    if (record.statusOverride) {
      return { ...record, workSite: getRecordWorkSite(record, employees), status: record.statusOverride };
    }
    const row = rowMap.get(`${record.workDate}-${record.employeeId}`);
    return { ...record, workSite: getRecordWorkSite(record, employees), status: getRecordAutoStatus(record, row) };
  });
}

function renderEmployeeMonthlyStats() {
  const monthValue = monthlyReportMonth.value || formatDateValue(new Date()).slice(0, 7);
  const statsRows = getMonthlyEmployeeReportRows(monthValue);
  if (!statsRows.length) {
    employeeMonthlyStats.innerHTML = `<tr><td class="empty-state" colspan="7">目前沒有員工月統計資料。</td></tr>`;
    return;
  }

  employeeMonthlyStats.innerHTML = statsRows
    .map(
      (row) => `
        <tr>
          <td><strong>${escapeHtml(row.employeeId)}</strong></td>
          <td>${escapeHtml(row.employeeName)}</td>
          <td>${escapeHtml(row.workSite)}</td>
          <td>${row.attendanceDays}</td>
          <td>${row.lateCount}</td>
          <td>${row.earlyCount}</td>
          <td>${row.missingCount}</td>
        </tr>
      `
    )
    .join("");
}

function getMonthlyEmployeeReportRows(monthValue = monthlyReportMonth.value || formatDateValue(new Date()).slice(0, 7)) {
  const dailyRows = buildDailyAttendanceRows(getRecords(), getEmployees(), { monthValue });
  const grouped = new Map();

  getEmployees()
    .forEach((employee) => {
      grouped.set(employee.employeeId, {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        department: employee.department,
        workSite: employee.workSite,
        attendanceDays: 0,
        lateCount: 0,
        earlyCount: 0,
        missingCount: 0,
        clockInRecords: [],
        clockOutRecords: [],
        notes: []
      });
    });

  dailyRows.forEach((row) => {
    const current =
      grouped.get(row.employeeId) ||
      {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        workSite: row.workSite,
        attendanceDays: 0,
        lateCount: 0,
        earlyCount: 0,
        missingCount: 0,
        clockInRecords: [],
        clockOutRecords: [],
        notes: []
      };
    current.attendanceDays += row.clockIn || row.clockOut ? 1 : 0;
    current.lateCount += row.late ? 1 : 0;
    current.earlyCount += row.early ? 1 : 0;
    current.missingCount += row.missing ? 1 : 0;
    current.clockInRecords.push(`${row.date} ${row.clockIn || "未打卡"}`);
    current.clockOutRecords.push(`${row.date} ${row.clockOut || "未打卡"}`);
    if (row.notes.length) {
      current.notes.push(...row.notes);
    }
    grouped.set(row.employeeId, current);
  });

  return [...grouped.values()].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  }).format(date);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function shouldShowInstallPrompt() {
  return !localStorage.getItem("yang-install-prompt-seen") && !window.matchMedia("(display-mode: standalone)").matches;
}

function showInstallPrompt() {
  if (shouldShowInstallPrompt()) {
    installPrompt.classList.remove("hidden");
  }
}

function closeInstallPrompt() {
  localStorage.setItem("yang-install-prompt-seen", "1");
  installPrompt.classList.add("hidden");
}

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  } else {
    showToast("請使用瀏覽器選單加入主畫面");
  }
  closeInstallPrompt();
}

function requireAdmin() {
  if (isAdminLoggedIn) return true;
  adminLogin.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  adminLoginMessage.textContent = "請先登入管理後台。";
  showToast("請先登入管理後台");
  return false;
}

function loginAdmin() {
  const account = adminAccount.value.trim();
  const password = adminPassword.value;
  if (account !== "admin" || password !== "yang9999") {
    adminLoginMessage.textContent = "帳號或密碼錯誤";
    showToast("帳號或密碼錯誤");
    return;
  }
  isAdminLoggedIn = true;
  adminLoginMessage.textContent = "";
  adminPassword.value = "";
  adminLogin.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  renderAdmin();
  showToast("管理後台登入成功");
}

function logoutAdmin() {
  isAdminLoggedIn = false;
  adminAccount.value = "";
  adminPassword.value = "";
  adminLogin.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  adminAccount.focus();
  showToast("已登出管理後台");
}

function normalizeEmployeeId(value) {
  return String(value || "").trim().toUpperCase();
}

function findEmployee(employeeId) {
  const normalizedId = normalizeEmployeeId(employeeId);
  return cachedEmployees.find((employee) => employee.employeeId === normalizedId);
}

function renderClockEmployeeSelect() {
  if (!employeeIdInput) return;
  const selectedEmployeeId = employeeIdInput.value;
  const activeEmployees = getEmployees()
    .filter((employee) => employee.status === "在職")
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  const options = activeEmployees
    .map(
      (employee) =>
        `<option value="${escapeHtml(employee.employeeId)}">${escapeHtml(employee.employeeId)} - ${escapeHtml(employee.name)}</option>`
    )
    .join("");

  employeeIdInput.innerHTML = `<option value="">請選擇員工</option>${options}`;
  if (activeEmployees.some((employee) => employee.employeeId === selectedEmployeeId)) {
    employeeIdInput.value = selectedEmployeeId;
  }
  autofillEmployee(employeeIdInput.value);
}

function renderClock() {
  const now = new Date();
  currentTime.textContent = formatTimeValue(now);
  currentDate.textContent = formatDisplayDate(now);
}

function renderSummary() {
  const today = formatDateValue(new Date());
  const todayRecords = getRecords().filter((record) => record.workDate === today);
  const activeEmployees = getEmployees().filter((employee) => employee.status === "在職");
  const clockedInEmployeeIds = new Set(todayRecords.filter((record) => record.action === "clock_in").map((record) => record.employeeId));
  const clockInCount = clockedInEmployeeIds.size;
  const notClockedInCount = Math.max(activeEmployees.length - clockInCount, 0);

  if (dataMode) {
    dataMode.textContent = getFirestoreStatusText();
  }
  todayStats.innerHTML = `
    <div class="status-card">
      <span>今日出勤統計</span>
      <strong>${clockInCount}/${activeEmployees.length}</strong>
    </div>
    <div class="status-card">
      <span>已上班人數</span>
      <strong>${clockInCount}</strong>
    </div>
    <div class="status-card">
      <span>未打卡人數</span>
      <strong>${notClockedInCount}</strong>
    </div>
  `;

  const recentRecords = [...getRecords()]
    .sort((a, b) => `${b.workDate}${b.workTime}`.localeCompare(`${a.workDate}${a.workTime}`))
    .slice(0, 5);

  if (!recentRecords.length) {
    if (recentList) {
      recentList.innerHTML = `<li class="empty-note">尚無打卡紀錄。</li>`;
    }
    return;
  }

  if (recentList) {
    recentList.innerHTML = recentRecords
      .map(
        (record) => `
          <li>
            <span>${escapeHtml(record.employeeName)} ${actionLabels[record.action]}</span>
            <strong>${record.workDate} ${record.workTime.slice(0, 5)}</strong>
          </li>
        `
      )
      .join("");
  }
}

function getFilteredRecords() {
  const selectedDate = dateFilter.value;
  const nameKeyword = employeeNameFilter.value.trim().toLowerCase();
  const idKeyword = normalizeEmployeeId(employeeIdFilter.value);
  const department = departmentFilter.value;
  const action = actionFilter.value;

  return getRecords()
    .filter((record) => !selectedDate || record.workDate === selectedDate)
    .filter((record) => !nameKeyword || record.employeeName.toLowerCase().includes(nameKeyword))
    .filter((record) => !idKeyword || record.employeeId.includes(idKeyword))
    .filter((record) => !department || record.department === department)
    .filter((record) => !action || record.action === action)
    .sort((a, b) => `${b.workDate}${b.workTime}`.localeCompare(`${a.workDate}${a.workTime}`));
}

function renderEmployeeTable() {
  const employees = [...getEmployees()].sort((a, b) => a.employeeId.localeCompare(b.employeeId));

  if (!employees.length) {
    employeeTable.innerHTML = `<tr><td class="empty-state" colspan="10">目前尚未建立員工資料。</td></tr>`;
    return;
  }

  employeeTable.innerHTML = employees
    .map(
      (employee) => `
        <tr>
          <td><strong>${escapeHtml(employee.employeeId)}</strong></td>
          <td>${escapeHtml(employee.name)}</td>
          <td>${escapeHtml(employee.department)}</td>
          <td>${escapeHtml(employee.title)}</td>
          <td>${escapeHtml(employee.phone)}</td>
          <td>${escapeHtml(employee.workSite)}</td>
          <td>${escapeHtml(employee.startDate)}</td>
          <td><span class="badge ${employee.status === "在職" ? "in" : "out"}">${escapeHtml(employee.status)}</span></td>
          <td>${escapeHtml(employee.note)}</td>
          <td>
            <button class="small-button" type="button" data-edit-employee="${escapeHtml(employee.employeeId)}">修改</button>
            <button class="small-button" type="button" data-delete-employee="${escapeHtml(employee.employeeId)}">刪除</button>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderAdmin() {
  const records = getFilteredRecords();
  const allRecords = getRecords();
  const employees = getEmployees();
  const activeEmployees = employees.filter((employee) => employee.status === "在職");
  const today = formatDateValue(new Date());
  const todayRows = buildDailyAttendanceRows(allRecords, employees, { dateValue: today });
  const todayAttendanceCount = todayRows.filter((row) => row.clockIn || row.clockOut).length;
  const lateCount = todayRows.filter((row) => row.late).length;
  const earlyCount = todayRows.filter((row) => row.early).length;
  const missingCount = todayRows.filter((row) => row.missing).length;
  const siteCards = reportWorkSites
    .map((site) => {
      const siteEmployees = activeEmployees.filter((employee) => employee.workSite === site);
      const siteAttendanceIds = new Set(
        todayRows
          .filter((row) => row.workSite === site && (row.clockIn || row.clockOut))
          .map((row) => row.employeeId)
      );
      return `
        <div class="status-card">
          <span>${site}</span>
          <strong>${siteAttendanceIds.size}/${siteEmployees.length}</strong>
          <small>員工數 ${siteEmployees.length} / 今日出勤 ${siteAttendanceIds.size} / 未打卡 ${Math.max(siteEmployees.length - siteAttendanceIds.size, 0)}</small>
        </div>
      `;
    })
    .join("");

  stats.innerHTML = `
    <div class="status-card"><span>總員工</span><strong>${employees.length}</strong></div>
    <div class="status-card"><span>今日出勤</span><strong>${todayAttendanceCount}</strong></div>
    <div class="status-card"><span>遲到人數</span><strong>${lateCount}</strong></div>
    <div class="status-card"><span>早退人數</span><strong>${earlyCount}</strong></div>
    <div class="status-card"><span>缺卡人數</span><strong>${missingCount}</strong></div>
  `;
  siteStats.innerHTML = siteCards;
  renderEmployeeMonthlyStats();

  if (!records.length) {
    attendanceTable.innerHTML = `<tr><td class="empty-state" colspan="9">目前沒有符合條件的打卡紀錄。</td></tr>`;
    renderEmployeeTable();
    renderSummary();
    return;
  }

  attendanceTable.innerHTML = records
    .map(
      (record) => `
        <tr>
          <td>${record.workDate}</td>
          <td>${record.workTime}</td>
          <td><strong>${escapeHtml(record.employeeName)}</strong><br><small>${escapeHtml(record.employeeId)}</small></td>
          <td>${escapeHtml(record.department)}</td>
          <td>${escapeHtml(record.workSite || "")}</td>
          <td><span class="badge ${record.action === "clock_in" ? "in" : "out"}">${actionLabels[record.action]}</span></td>
          <td>
            <select class="status-select" data-status-id="${record.id}">
              ${allowedStatuses.map((status) => `<option ${status === record.status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
          </td>
          <td>${escapeHtml(record.note || "")}</td>
          <td><button class="small-button" type="button" data-delete-id="${record.id}">刪除</button></td>
        </tr>
      `
    )
    .join("");
  renderEmployeeTable();
  renderSummary();
}

function exportExcel() {
  const rows = buildDailyAttendanceRows(getFilteredRecords(), getEmployees());
  const escapeCell = (value) => escapeHtml(value);
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeCell(row.employeeId)}</td>
          <td>${escapeCell(row.employeeName)}</td>
          <td>${escapeCell(row.workSite)}</td>
          <td>${escapeCell(row.date)}</td>
          <td>${escapeCell(row.clockIn)}</td>
          <td>${escapeCell(row.clockOut)}</td>
          <td>${escapeCell(row.workHours)}</td>
          <td>${escapeCell(row.status)}</td>
        </tr>
      `
    )
    .join("");
  const workbook = `
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <table border="1">
          <thead>
            <tr>
              <th>員工編號</th>
              <th>姓名</th>
              <th>據點</th>
              <th>日期</th>
              <th>上班時間</th>
              <th>下班時間</th>
              <th>工作時數</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dateFilter.value ? `attendance-${dateFilter.value}.xls` : "attendance-records.xls";
  link.click();
  URL.revokeObjectURL(url);
}

function getMonthlyReportRows(monthValue = monthlyReportMonth.value || formatDateValue(new Date()).slice(0, 7)) {
  return buildDailyAttendanceRows(getRecords(), getEmployees(), { monthValue });
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function exportMonthlyReport() {
  const monthValue = monthlyReportMonth.value || formatDateValue(new Date()).slice(0, 7);
  const headers = ["員工編號", "姓名", "部門", "據點", "出勤天數", "遲到次數", "早退次數", "缺卡次數", "上班紀錄", "下班紀錄", "備註"];
  const rows = getMonthlyEmployeeReportRows(monthValue);
  const csvRows = [
    headers,
    ...rows.map((row) => [
      row.employeeId,
      row.employeeName,
      row.department,
      row.workSite,
      row.attendanceDays,
      row.lateCount,
      row.earlyCount,
      row.missingCount,
      row.clockInRecords.join("；"),
      row.clockOutRecords.join("；"),
      [...new Set(row.notes)].join("；")
    ])
  ];
  const csv = `\uFEFF${csvRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `楊家將_${monthValue}_出勤月報表.csv`;
  link.click();
  URL.revokeObjectURL(url);
  saveMonthlyReportToFirestore(monthValue).catch((error) => console.warn("Firestore monthly report sync failed", error));
}

function splitImportLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\t")) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseEmployeeImport(text) {
  const normalizedText = text.replace(/<[^>]+>/g, "\t").replace(/\r/g, "");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = lines.map(splitImportLine);
  const headerKeywords = ["員工編號", "姓名", "部門"];
  const startIndex = rows[0] && headerKeywords.some((keyword) => rows[0].includes(keyword)) ? 1 : 0;

  return rows.slice(startIndex).map((row) =>
    normalizeEmployee({
      employeeId: row[0],
      name: row[1],
      department: row[2],
      title: row[3],
      phone: row[4],
      startDate: row[5],
      status: row[6],
      note: row[7]
    })
  );
}

function loadLocalStorageEmployees() {
  return normalizeEmployees(loadJson(EMPLOYEES_STORAGE_KEY));
}

function getTestEmployeeIds(employees = getEmployees()) {
  const testPairs = new Set(["E001:王小明", "E002:周菱薇", "N001:鄭志宏", "P001:楊立名", "POO1:楊立名"]);
  return employees
    .filter((employee) => testPairs.has(`${employee.employeeId}:${employee.name}`))
    .map((employee) => employee.employeeId);
}

function showLocalEmployeesStatus() {
  const localEmployees = loadLocalStorageEmployees();
  const testIds = getTestEmployeeIds(localEmployees);
  const names = localEmployees.map((employee) => `${employee.employeeId} ${employee.name}`).join("、");
  localImportMessage.textContent = localEmployees.length
    ? `本機找到 ${localEmployees.length} 筆員工資料：${names}${testIds.length ? `。其中 ${testIds.length} 筆看起來是測試資料。` : ""}`
    : "目前這個瀏覽器沒有找到本機 employees 員工資料。請在行政小姐原本輸入員工的那台裝置執行。";
  return localEmployees;
}

async function importLocalEmployeesToFirestore() {
  if (!requireAdmin()) return;
  const localEmployees = showLocalEmployeesStatus();
  if (!localEmployees.length) return;
  if (!firestoreReady) {
    localImportMessage.textContent = "Firebase 尚未連線，請重新整理後確認資料模式顯示 Firebase Firestore。";
    showToast("Firebase 尚未連線");
    return;
  }

  const message = `本機找到 ${localEmployees.length} 筆員工資料。確定匯入 Firebase？\n\n匯入會新增或更新同員工編號資料，不會刪除其他雲端員工。`;
  if (!confirm(message)) return;

  const merged = [...getEmployees()];
  localEmployees.forEach((employee) => {
    const index = merged.findIndex((item) => item.employeeId === employee.employeeId);
    const nextEmployee = {
      ...employee,
      migratedFrom: "localStorage",
      migratedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (index >= 0) {
      merged[index] = { ...merged[index], ...nextEmployee };
    } else {
      merged.push({ ...nextEmployee, createdAt: employee.createdAt || new Date().toISOString() });
    }
  });

  cachedEmployees = normalizeEmployees(merged);
  saveJson(EMPLOYEES_STORAGE_KEY, cachedEmployees);
  await upsertFirestoreCollection("employees", localEmployees, "employeeId");
  syncDirectoryToFirestore();
  refreshAfterRemoteSync();
  localImportMessage.textContent = `已匯入 ${localEmployees.length} 筆本機員工資料到 Firebase。手機與電腦重新整理後會同步顯示。`;
  showToast("本機員工已匯入 Firebase");
}

function importEmployeesFromFile() {
  if (isFirebaseConfigured() && !firestoreReady) {
    importMessage.textContent = "Firebase 尚未連線，請重新整理後確認資料模式顯示 Firebase Firestore。";
    showToast("Firebase 尚未連線");
    return;
  }
  const file = employeeImportFile.files && employeeImportFile.files[0];
  if (!file) {
    importMessage.textContent = "請先選擇匯入檔案。";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    const importedEmployees = parseEmployeeImport(String(reader.result || ""));
    const validEmployees = importedEmployees.filter((employee) => employee.employeeId && employee.name);
    if (!validEmployees.length) {
      importMessage.textContent = "找不到可匯入的員工資料。";
      return;
    }

    const merged = [...getEmployees()];
    validEmployees.forEach((employee) => {
      const index = merged.findIndex((item) => item.employeeId === employee.employeeId);
      if (index >= 0) {
        merged[index] = { ...merged[index], ...employee, updatedAt: new Date().toISOString() };
      } else {
        merged.push({ ...employee, createdAt: new Date().toISOString() });
      }
    });
    await saveEmployees(merged);
    renderAdmin();
    importMessage.textContent = `已匯入 ${validEmployees.length} 筆員工資料。`;
    showToast("員工匯入完成");
  });
  reader.readAsText(file, "utf-8");
}

async function deleteTestEmployees() {
  if (!requireAdmin()) return;
  if (isFirebaseConfigured() && !firestoreReady) {
    localImportMessage.textContent = "Firebase 尚未連線，請重新整理後確認資料模式顯示 Firebase Firestore。";
    showToast("Firebase 尚未連線");
    return;
  }
  const testIds = getTestEmployeeIds();
  if (!testIds.length) {
    localImportMessage.textContent = "目前員工列表沒有找到已知測試員工資料。";
    showToast("沒有測試員工");
    return;
  }
  if (!confirm(`將刪除測試員工：${testIds.join("、")}。\n既有打卡紀錄不會刪除。確定刪除？`)) return;
  cachedEmployees = getEmployees().filter((employee) => !testIds.includes(employee.employeeId));
  saveJson(EMPLOYEES_STORAGE_KEY, cachedEmployees);
  await deleteFirestoreDocuments("employees", testIds);
  refreshAfterRemoteSync();
  localImportMessage.textContent = `已刪除 ${testIds.length} 筆測試員工資料：${testIds.join("、")}。`;
  showToast("測試員工已刪除");
}

function clearLocalCache() {
  if (!requireAdmin()) return;
  if (!confirm("確定清除這台裝置的本機暫存員工與打卡資料？Firebase 雲端資料不會刪除。")) return;
  localStorage.removeItem(EMPLOYEES_STORAGE_KEY);
  localStorage.removeItem(LEGACY_EMPLOYEES_STORAGE_KEY);
  localStorage.removeItem(RECORDS_STORAGE_KEY);
  localStorage.removeItem(FIRESTORE_SYNC_STORAGE_KEY);
  cachedEmployees = [];
  cachedRecords = [];
  renderClockEmployeeSelect();
  renderAdmin();
  renderSummary();
  localImportMessage.textContent = "本機暫存資料已清除。請重新整理，系統會只從 Firebase Firestore 讀取員工。";
  showToast("本機暫存已清除");
}

function autofillEmployee(employeeId) {
  const employee = findEmployee(employeeId);
  if (!employee) {
    employeeNameInput.value = "";
    departmentSelect.value = "行政部";
    workSiteSelect.value = "南崁";
    return;
  }
  employeeNameInput.value = employee.name;
  departmentSelect.value = employee.department;
  workSiteSelect.value = employee.workSite;
}

function resetEmployeeForm() {
  employeeForm.reset();
  editingEmployeeId.value = "";
  employeeManageId.disabled = false;
  saveEmployeeButton.textContent = "新增員工";
  employeeMessage.textContent = "";
}

async function submitEmployee(event) {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (isFirebaseConfigured() && !firestoreReady) {
    employeeMessage.textContent = "Firebase 尚未連線，請重新整理後確認資料模式顯示 Firebase Firestore。";
    showToast("Firebase 尚未連線");
    return;
  }
  const data = new FormData(employeeForm);
  const editingId = editingEmployeeId.value;
  const employeeId = editingId || normalizeEmployeeId(data.get("employeeId"));
  const employee = {
    employeeId,
    name: data.get("name").trim(),
    department: data.get("department"),
    title: data.get("title").trim(),
    phone: data.get("phone").trim(),
    clockPassword: data.get("clockPassword").trim(),
    workSite: data.get("workSite"),
    startDate: data.get("startDate"),
    status: data.get("status"),
    note: data.get("note").trim(),
    updatedAt: new Date().toISOString()
  };

  if (!employee.employeeId || !employee.name || !employee.clockPassword || !employee.startDate) {
    employeeMessage.textContent = "請完整填寫員工資料。";
    return;
  }

  const exists = findEmployee(employee.employeeId);
  if (!editingId && exists) {
    employeeMessage.textContent = "此員工編號已存在。";
    return;
  }

  if (editingId) {
    await saveEmployees(getEmployees().map((item) => (item.employeeId === editingId ? { ...item, ...employee } : item)));
    saveRecords(
      getRecords().map((record) =>
        record.employeeId === editingId
          ? {
              ...record,
              employeeName: employee.name,
              department: employee.department,
              workSite: employee.workSite
            }
          : record
      )
    );
    employeeMessage.textContent = "員工資料已更新。";
    showToast("員工已更新");
  } else {
    await saveEmployees([{ ...employee, createdAt: new Date().toISOString() }, ...getEmployees()]);
    employeeMessage.textContent = "員工資料已新增。";
    showToast("員工已新增");
  }

  resetEmployeeForm();
  renderAdmin();
}

function editEmployee(employeeId) {
  const employee = findEmployee(employeeId);
  if (!employee) {
    showToast("找不到員工資料");
    return;
  }
  editingEmployeeId.value = employee.employeeId;
  employeeManageId.value = employee.employeeId;
  employeeManageId.disabled = true;
  employeeManageName.value = employee.name;
  employeeManageDepartment.value = employee.department;
  employeeManageTitle.value = employee.title;
  employeeManagePhone.value = employee.phone;
  employeeManagePassword.value = employee.clockPassword;
  employeeManageWorkSite.value = employee.workSite;
  employeeManageStartDate.value = employee.startDate;
  employeeManageStatus.value = employee.status;
  employeeManageNote.value = employee.note;
  saveEmployeeButton.textContent = "儲存修改";
  employeeMessage.textContent = `正在修改 ${employee.name}`;
}

async function deleteEmployee(employeeId) {
  if (!requireAdmin()) return;
  const employee = findEmployee(employeeId);
  if (!employee) {
    showToast("找不到員工資料");
    return;
  }
  const hasRecords = getRecords().some((record) => record.employeeId === employeeId);
  const message = hasRecords
    ? "此員工已有打卡紀錄。刪除員工資料不會刪除既有打卡紀錄，確定刪除？"
    : "確定刪除此員工資料？";
  if (!confirm(message)) return;
  cachedEmployees = getEmployees().filter((item) => item.employeeId !== employeeId);
  saveJson(EMPLOYEES_STORAGE_KEY, cachedEmployees);
  await deleteFirestoreDocuments("employees", [employeeId]);
  renderAdmin();
  showToast("員工已刪除");
}

function submitAttendance(event) {
  event.preventDefault();
  const data = new FormData(clockForm);
  const employeeId = normalizeEmployeeId(data.get("employeeId"));
  const clockPassword = String(data.get("clockPassword") || "").trim();
  const workSite = data.get("workSite");
  const employee = findEmployee(employeeId);

  if (!employee) {
    formMessage.textContent = "找不到此員工編號，請先由管理員新增員工。";
    showToast("員工不存在");
    return;
  }
  if (employee.status !== "在職") {
    formMessage.textContent = "此員工狀態不是在職，無法打卡。";
    showToast("員工非在職");
    return;
  }
  if (employee.clockPassword !== clockPassword) {
    formMessage.textContent = "打卡密碼不正確，請重新輸入。";
    showToast("密碼錯誤");
    return;
  }

  const now = new Date();
  const record = {
    id: crypto.randomUUID(),
    employeeId: employee.employeeId,
    employeeName: employee.name,
    department: employee.department,
    workSite,
    action: submitterAction,
    workDate: formatDateValue(now),
    workTime: formatTimeValue(now),
    status: "正常",
    note: data.get("note").trim(),
    createdAt: now.toISOString()
  };

  saveRecords([record, ...getRecords()]);
  const savedRecord = getRecords().find((item) => item.id === record.id) || record;
  clockForm.reset();
  formMessage.textContent = `${savedRecord.employeeName} ${getAttendanceSuccessMessage(savedRecord)}。`;
  showToast(getAttendanceSuccessMessage(savedRecord));
  renderAdmin();
}

function deleteRecord(id) {
  if (!requireAdmin()) return;
  saveRecords(getRecords().filter((record) => record.id !== id));
  renderAdmin();
  showToast("紀錄已刪除");
}

function updateRecordStatus(id, status) {
  if (!requireAdmin()) return;
  saveRecords(getRecords().map((record) => (record.id === id ? { ...record, status, statusOverride: status } : record)));
  renderAdmin();
  showToast("狀態已更新");
}

document.addEventListener("click", (event) => {
  const scrollTarget = event.target.closest("[data-scroll]");
  if (scrollTarget) {
    document.querySelector(scrollTarget.dataset.scroll).scrollIntoView({ behavior: "smooth" });
  }

  if (event.target.closest("[data-open-admin]")) {
    document.querySelector("#records").scrollIntoView({ behavior: "smooth" });
    adminAccount.focus();
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    if (!requireAdmin()) return;
    deleteRecord(deleteButton.dataset.deleteId);
  }

  const editEmployeeButton = event.target.closest("[data-edit-employee]");
  if (editEmployeeButton) {
    if (!requireAdmin()) return;
    editEmployee(editEmployeeButton.dataset.editEmployee);
  }

  const deleteEmployeeButton = event.target.closest("[data-delete-employee]");
  if (deleteEmployeeButton) {
    if (!requireAdmin()) return;
    deleteEmployee(deleteEmployeeButton.dataset.deleteEmployee);
  }

});

document.addEventListener("change", (event) => {
  if ([dateFilter, departmentFilter, actionFilter, monthlyReportMonth].includes(event.target)) {
    if (!requireAdmin()) return;
    renderAdmin();
  }

  if (event.target.matches("[data-status-id]")) {
    if (!requireAdmin()) return;
    updateRecordStatus(event.target.dataset.statusId, event.target.value);
  }
});

employeeNameFilter.addEventListener("input", () => {
  if (requireAdmin()) renderAdmin();
});
employeeIdFilter.addEventListener("input", () => {
  if (requireAdmin()) renderAdmin();
});
employeeIdInput.addEventListener("blur", () => autofillEmployee(employeeIdInput.value));
employeeIdInput.addEventListener("change", () => autofillEmployee(employeeIdInput.value));
clockForm.addEventListener("submit", submitAttendance);
clockForm.addEventListener("click", (event) => {
  const button = event.target.closest("button[type='submit']");
  if (button) {
    submitterAction = button.value;
  }
});

employeeForm.addEventListener("submit", submitEmployee);
cancelEmployeeButton.addEventListener("click", resetEmployeeForm);

document.querySelector("#adminLoginButton").addEventListener("click", loginAdmin);
adminPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginAdmin();
  }
});
adminAccount.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginAdmin();
  }
});
document.querySelector("#adminLogoutButton").addEventListener("click", logoutAdmin);

document.querySelector("#exportButton").addEventListener("click", () => {
  if (requireAdmin()) exportExcel();
});
document.querySelector("#exportMonthlyButton").addEventListener("click", () => {
  if (requireAdmin()) exportMonthlyReport();
});
importEmployeesButton.addEventListener("click", () => {
  if (requireAdmin()) importEmployeesFromFile();
});
checkLocalEmployeesButton.addEventListener("click", () => {
  if (requireAdmin()) showLocalEmployeesStatus();
});
importLocalEmployeesButton.addEventListener("click", importLocalEmployeesToFirestore);
clearLocalCacheButton.addEventListener("click", clearLocalCache);
deleteTestEmployeesButton.addEventListener("click", deleteTestEmployees);
document.querySelector("#clearFilterButton").addEventListener("click", () => {
  if (!requireAdmin()) return;
  dateFilter.value = "";
  employeeNameFilter.value = "";
  employeeIdFilter.value = "";
  departmentFilter.value = "";
  actionFilter.value = "";
  renderAdmin();
});
document.querySelector("#clearButton").addEventListener("click", () => {
  if (!requireAdmin()) return;
  if (!confirm("確定要清空目前瀏覽器裡的打卡測試資料？員工資料會保留。")) return;
  saveRecords([]);
  renderAdmin();
  showToast("打卡紀錄已清空");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});
installAppButton.addEventListener("click", installApp);
dismissInstallButton.addEventListener("click", closeInstallPrompt);

function init() {
  cachedEmployees = isFirebaseConfigured() ? [] : loadEmployees();
  cachedRecords = isFirebaseConfigured() ? [] : recalculateRecordStatuses(loadJson(RECORDS_STORAGE_KEY));
  if (!isFirebaseConfigured()) {
    saveJson(RECORDS_STORAGE_KEY, cachedRecords);
  }
  renderDepartmentOptions();
  renderClock();
  window.setInterval(renderClock, 1000);
  renderAdmin();
  showInstallPrompt();
  initFirestoreSync();
}

init();
