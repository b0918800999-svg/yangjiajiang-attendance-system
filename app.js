const RECORDS_STORAGE_KEY = "employee-attendance-v1";
const EMPLOYEES_STORAGE_KEY = "employees";
const LEGACY_EMPLOYEES_STORAGE_KEY = "employee-directory-v1";
const actionLabels = {
  clock_in: "上班",
  clock_out: "下班"
};
const allowedStatuses = ["正常", "遲到", "早退", "補打卡", "異常"];

const clockForm = document.querySelector("#clockForm");
const formMessage = document.querySelector("#formMessage");
const currentTime = document.querySelector("#currentTime");
const currentDate = document.querySelector("#currentDate");
const adminLogin = document.querySelector("#adminLogin");
const adminPanel = document.querySelector("#adminPanel");
const adminPin = document.querySelector("#adminPin");
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
const employeeManageStartDate = document.querySelector("#employeeManageStartDate");
const employeeManageStatus = document.querySelector("#employeeManageStatus");
const employeeManageNote = document.querySelector("#employeeManageNote");
const saveEmployeeButton = document.querySelector("#saveEmployeeButton");
const cancelEmployeeButton = document.querySelector("#cancelEmployeeButton");
const employeeImportFile = document.querySelector("#employeeImportFile");
const importEmployeesButton = document.querySelector("#importEmployeesButton");
const importMessage = document.querySelector("#importMessage");
const employeeIdInput = document.querySelector("#employeeIdInput");
const employeeNameInput = document.querySelector("#employeeNameInput");
const departmentSelect = document.querySelector("#departmentSelect");
const stats = document.querySelector("#stats");
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

let cachedRecords = [];
let cachedEmployees = [];
let submitterAction = "clock_in";

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

function getRecords() {
  return cachedRecords;
}

function getEmployees() {
  return cachedEmployees;
}

function saveRecords(records) {
  cachedRecords = records;
  saveJson(RECORDS_STORAGE_KEY, records);
}

function normalizeEmployee(employee) {
  return {
    employeeId: normalizeEmployeeId(employee.employeeId || employee.id || employee.code),
    name: String(employee.name || employee.employeeName || "").trim(),
    department: String(employee.department || "其他").trim(),
    title: String(employee.title || employee.position || "").trim(),
    phone: String(employee.phone || employee.mobile || "").trim(),
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

function normalizeEmployeeId(value) {
  return String(value || "").trim().toUpperCase();
}

function findEmployee(employeeId) {
  const normalizedId = normalizeEmployeeId(employeeId);
  cachedEmployees = loadEmployees();
  return cachedEmployees.find((employee) => employee.employeeId === normalizedId);
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

  dataMode.textContent = "本機資料庫";
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
    recentList.innerHTML = `<li class="empty-note">尚無打卡紀錄。</li>`;
    return;
  }

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
    employeeTable.innerHTML = `<tr><td class="empty-state" colspan="9">目前尚未建立員工資料。</td></tr>`;
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
  const activeEmployees = employees.filter((employee) => employee.status === "在職").length;
  const today = formatDateValue(new Date());
  const todayCount = allRecords.filter((record) => record.workDate === today).length;
  const abnormalCount = allRecords.filter((record) => ["遲到", "早退", "異常"].includes(record.status)).length;

  stats.innerHTML = `
    <span class="stat">員工 ${employees.length}</span>
    <span class="stat">在職 ${activeEmployees}</span>
    <span class="stat">總紀錄 ${allRecords.length}</span>
    <span class="stat">今日 ${todayCount}</span>
    <span class="stat">需注意 ${abnormalCount}</span>
    <span class="stat">本機模式</span>
  `;

  if (!records.length) {
    attendanceTable.innerHTML = `<tr><td class="empty-state" colspan="8">目前沒有符合條件的打卡紀錄。</td></tr>`;
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
  const rows = getFilteredRecords();
  const escapeCell = (value) => escapeHtml(value);
  const bodyRows = rows
    .map(
      (record) => `
        <tr>
          <td>${escapeCell(record.workDate)}</td>
          <td>${escapeCell(record.workTime)}</td>
          <td>${escapeCell(record.employeeId)}</td>
          <td>${escapeCell(record.employeeName)}</td>
          <td>${escapeCell(record.department)}</td>
          <td>${escapeCell(actionLabels[record.action])}</td>
          <td>${escapeCell(record.status)}</td>
          <td>${escapeCell(record.note)}</td>
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
              <th>日期</th>
              <th>時間</th>
              <th>員工編號</th>
              <th>姓名</th>
              <th>部門</th>
              <th>動作</th>
              <th>狀態</th>
              <th>備註</th>
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
  const monthRecords = getRecords().filter((record) => record.workDate.startsWith(monthValue));
  const grouped = new Map();

  monthRecords.forEach((record) => {
    const key = `${record.workDate}-${record.employeeId}`;
    const current = grouped.get(key) || {
      date: record.workDate,
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      department: record.department,
      clockIn: "",
      clockOut: "",
      notes: []
    };
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

  return [...grouped.values()].sort((a, b) => `${a.date}${a.employeeId}`.localeCompare(`${b.date}${b.employeeId}`));
}

function exportMonthlyReport() {
  const monthValue = monthlyReportMonth.value || formatDateValue(new Date()).slice(0, 7);
  const rows = getMonthlyReportRows(monthValue);
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.employeeId)}</td>
          <td>${escapeHtml(row.employeeName)}</td>
          <td>${escapeHtml(row.department)}</td>
          <td>${escapeHtml(row.clockIn)}</td>
          <td>${escapeHtml(row.clockOut)}</td>
          <td>${escapeHtml([...new Set(row.notes)].join(" / "))}</td>
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
              <th>日期</th>
              <th>員工編號</th>
              <th>姓名</th>
              <th>部門</th>
              <th>上班時間</th>
              <th>下班時間</th>
              <th>備註</th>
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
  link.download = `attendance-monthly-${monthValue}.xls`;
  link.click();
  URL.revokeObjectURL(url);
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

function importEmployeesFromFile() {
  const file = employeeImportFile.files && employeeImportFile.files[0];
  if (!file) {
    importMessage.textContent = "請先選擇匯入檔案。";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
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
    saveEmployees(merged);
    renderAdmin();
    importMessage.textContent = `已匯入 ${validEmployees.length} 筆員工資料。`;
    showToast("員工匯入完成");
  });
  reader.readAsText(file, "utf-8");
}

function autofillEmployee(employeeId) {
  const employee = findEmployee(employeeId);
  if (!employee) return;
  employeeNameInput.value = employee.name;
  departmentSelect.value = employee.department;
}

function resetEmployeeForm() {
  employeeForm.reset();
  editingEmployeeId.value = "";
  employeeManageId.disabled = false;
  saveEmployeeButton.textContent = "新增員工";
  employeeMessage.textContent = "";
}

function submitEmployee(event) {
  event.preventDefault();
  const data = new FormData(employeeForm);
  const editingId = editingEmployeeId.value;
  const employeeId = editingId || normalizeEmployeeId(data.get("employeeId"));
  const employee = {
    employeeId,
    name: data.get("name").trim(),
    department: data.get("department"),
    title: data.get("title").trim(),
    phone: data.get("phone").trim(),
    startDate: data.get("startDate"),
    status: data.get("status"),
    note: data.get("note").trim(),
    updatedAt: new Date().toISOString()
  };

  if (!employee.employeeId || !employee.name || !employee.startDate) {
    employeeMessage.textContent = "請完整填寫員工資料。";
    return;
  }

  const exists = findEmployee(employee.employeeId);
  if (!editingId && exists) {
    employeeMessage.textContent = "此員工編號已存在。";
    return;
  }

  if (editingId) {
    saveEmployees(getEmployees().map((item) => (item.employeeId === editingId ? { ...item, ...employee } : item)));
    saveRecords(
      getRecords().map((record) =>
        record.employeeId === editingId
          ? {
              ...record,
              employeeName: employee.name,
              department: employee.department
            }
          : record
      )
    );
    employeeMessage.textContent = "員工資料已更新。";
    showToast("員工已更新");
  } else {
    saveEmployees([{ ...employee, createdAt: new Date().toISOString() }, ...getEmployees()]);
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
  employeeManageStartDate.value = employee.startDate;
  employeeManageStatus.value = employee.status;
  employeeManageNote.value = employee.note;
  saveEmployeeButton.textContent = "儲存修改";
  employeeMessage.textContent = `正在修改 ${employee.name}`;
}

function deleteEmployee(employeeId) {
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
  saveEmployees(getEmployees().filter((item) => item.employeeId !== employeeId));
  renderAdmin();
  showToast("員工已刪除");
}

function submitAttendance(event) {
  event.preventDefault();
  const data = new FormData(clockForm);
  const employeeId = normalizeEmployeeId(data.get("employeeId"));
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

  const now = new Date();
  const record = {
    id: crypto.randomUUID(),
    employeeId: employee.employeeId,
    employeeName: employee.name,
    department: employee.department,
    action: submitterAction,
    workDate: formatDateValue(now),
    workTime: formatTimeValue(now),
    status: "正常",
    note: data.get("note").trim(),
    createdAt: now.toISOString()
  };

  saveRecords([record, ...getRecords()]);
  clockForm.reset();
  formMessage.textContent = `${record.employeeName} ${actionLabels[record.action]}打卡成功。`;
  showToast("打卡成功");
  renderAdmin();
}

function deleteRecord(id) {
  saveRecords(getRecords().filter((record) => record.id !== id));
  renderAdmin();
  showToast("紀錄已刪除");
}

function updateRecordStatus(id, status) {
  saveRecords(getRecords().map((record) => (record.id === id ? { ...record, status } : record)));
  renderAdmin();
  showToast("狀態已更新");
}

function ensureDefaultEmployee() {
  const now = new Date().toISOString();
  const defaultEmployee = {
    employeeId: "E001",
    name: "王小明",
    department: "行政部",
    title: "",
    phone: "",
    startDate: formatDateValue(new Date()),
    status: "在職",
    note: "",
    createdAt: now,
    updatedAt: now
  };

  const employees = getEmployees();
  const existingEmployee = findEmployee("E001");
  if (existingEmployee) {
    saveEmployees(
      employees.map((employee) =>
        employee.employeeId === "E001"
          ? {
              ...employee,
              name: "王小明",
              department: "行政部",
              title: employee.title || "",
              phone: employee.phone || "",
              status: "在職",
              startDate: employee.startDate || defaultEmployee.startDate,
              note: employee.note || "",
              updatedAt: now
            }
          : employee
      )
    );
    return;
  }

  saveEmployees([
    {
      ...defaultEmployee
    },
    ...employees
  ]);
}

document.addEventListener("click", (event) => {
  const scrollTarget = event.target.closest("[data-scroll]");
  if (scrollTarget) {
    document.querySelector(scrollTarget.dataset.scroll).scrollIntoView({ behavior: "smooth" });
  }

  if (event.target.closest("[data-open-admin]")) {
    document.querySelector("#records").scrollIntoView({ behavior: "smooth" });
    adminPin.focus();
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    deleteRecord(deleteButton.dataset.deleteId);
  }

  const editEmployeeButton = event.target.closest("[data-edit-employee]");
  if (editEmployeeButton) {
    editEmployee(editEmployeeButton.dataset.editEmployee);
  }

  const deleteEmployeeButton = event.target.closest("[data-delete-employee]");
  if (deleteEmployeeButton) {
    deleteEmployee(deleteEmployeeButton.dataset.deleteEmployee);
  }

});

document.addEventListener("change", (event) => {
  if ([dateFilter, departmentFilter, actionFilter].includes(event.target)) {
    renderAdmin();
  }

  if (event.target.matches("[data-status-id]")) {
    updateRecordStatus(event.target.dataset.statusId, event.target.value);
  }
});

employeeNameFilter.addEventListener("input", renderAdmin);
employeeIdFilter.addEventListener("input", renderAdmin);
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

document.querySelector("#adminLoginButton").addEventListener("click", () => {
  const pin = adminPin.value.trim();
  if (!pin || pin !== "1234") {
    showToast("管理碼不正確");
    return;
  }
  adminLogin.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  renderAdmin();
});

document.querySelector("#exportButton").addEventListener("click", exportExcel);
document.querySelector("#exportMonthlyButton").addEventListener("click", exportMonthlyReport);
importEmployeesButton.addEventListener("click", importEmployeesFromFile);
document.querySelector("#clearFilterButton").addEventListener("click", () => {
  dateFilter.value = "";
  employeeNameFilter.value = "";
  employeeIdFilter.value = "";
  departmentFilter.value = "";
  actionFilter.value = "";
  renderAdmin();
});
document.querySelector("#clearButton").addEventListener("click", () => {
  if (!confirm("確定要清空目前瀏覽器裡的打卡測試資料？員工資料會保留。")) return;
  saveRecords([]);
  renderAdmin();
  showToast("打卡紀錄已清空");
});

function init() {
  cachedRecords = loadJson(RECORDS_STORAGE_KEY);
  cachedEmployees = loadEmployees();
  ensureDefaultEmployee();
  renderClock();
  window.setInterval(renderClock, 1000);
  renderAdmin();
}

init();
