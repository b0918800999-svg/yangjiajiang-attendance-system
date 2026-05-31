import { neon } from "@neondatabase/serverless";

const allowedActions = new Set(["clock_in", "clock_out"]);
const allowedStatuses = new Set(["正常", "遲到", "早退", "補打卡", "異常"]);

let sqlClient;
let schemaReady = false;

function getSql() {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      department TEXT NOT NULL,
      action TEXT NOT NULL,
      work_date DATE NOT NULL,
      work_time TIME NOT NULL,
      status TEXT NOT NULL DEFAULT '正常',
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  schemaReady = true;
}

function isAdmin(req) {
  const expectedPin = process.env.ADMIN_PIN || "1234";
  return req.headers["x-admin-pin"] === expectedPin;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizeRecord(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    action: row.action,
    workDate: row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : String(row.work_date).slice(0, 10),
    workTime: String(row.work_time).slice(0, 8),
    status: row.status,
    note: row.note || "",
    createdAt: row.created_at
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function validateRecord(input) {
  const required = ["id", "employeeId", "employeeName", "department", "action", "workDate", "workTime"];
  const missing = required.filter((key) => !String(input[key] || "").trim());
  if (missing.length) {
    return `缺少必要欄位：${missing.join(", ")}`;
  }
  if (!allowedActions.has(input.action)) {
    return "打卡動作不正確";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
    return "日期格式不正確";
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input.workTime)) {
    return "時間格式不正確";
  }
  return "";
}

export default async function handler(req, res) {
  const sql = getSql();
  if (!sql) {
    sendJson(res, 503, {
      error: "尚未連接雲端資料庫，請在 Vercel 專案綁定 Neon Postgres 並設定 DATABASE_URL。"
    });
    return;
  }

  try {
    await ensureSchema(sql);

    if (req.method === "GET") {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: "管理碼不正確" });
        return;
      }
      const rows = await sql`
        SELECT *
        FROM attendance_records
        ORDER BY work_date DESC, work_time DESC, created_at DESC
      `;
      sendJson(res, 200, { records: rows.map(normalizeRecord) });
      return;
    }

    if (req.method === "POST") {
      const input = await readBody(req);
      const error = validateRecord(input);
      if (error) {
        sendJson(res, 400, { error });
        return;
      }

      const rows = await sql`
        INSERT INTO attendance_records (
          id,
          employee_id,
          employee_name,
          department,
          action,
          work_date,
          work_time,
          status,
          note
        )
        VALUES (
          ${input.id},
          ${input.employeeId},
          ${input.employeeName},
          ${input.department},
          ${input.action},
          ${input.workDate},
          ${input.workTime},
          '正常',
          ${input.note || ""}
        )
        RETURNING *
      `;
      sendJson(res, 201, { record: normalizeRecord(rows[0]) });
      return;
    }

    if (req.method === "PATCH") {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: "管理碼不正確" });
        return;
      }
      const input = await readBody(req);
      if (!input.id || !allowedStatuses.has(input.status)) {
        sendJson(res, 400, { error: "狀態資料不正確" });
        return;
      }
      const rows = await sql`
        UPDATE attendance_records
        SET status = ${input.status}
        WHERE id = ${input.id}
        RETURNING *
      `;
      if (!rows.length) {
        sendJson(res, 404, { error: "找不到打卡紀錄" });
        return;
      }
      sendJson(res, 200, { record: normalizeRecord(rows[0]) });
      return;
    }

    if (req.method === "DELETE") {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: "管理碼不正確" });
        return;
      }
      const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
      const id = url.searchParams.get("id");
      if (!id) {
        sendJson(res, 400, { error: "缺少紀錄 ID" });
        return;
      }
      await sql`DELETE FROM attendance_records WHERE id = ${id}`;
      sendJson(res, 200, { ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    sendJson(res, 405, { error: "不支援的操作" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "伺服器發生錯誤" });
  }
}
