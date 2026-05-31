# 員工上下班打卡系統

楊家將包裝設計有限公司的員工智慧打卡系統。此版本以瀏覽器 LocalStorage 儲存資料，適合先做單機展示、流程測試與內部需求確認。

## 專案資訊

- 專案名稱：員工上下班打卡系統
- Repository 名稱：`yangjiajiang-attendance-system`
- 公司名稱：楊家將包裝設計有限公司
- 系統名稱：員工智慧打卡系統

## 目前功能

- 企業儀表板首頁
- 即時時間顯示
- 今日出勤統計
- 已上班人數與未打卡人數
- 上班打卡
- 下班打卡
- 最近打卡紀錄
- 管理後台登入，預設管理碼 `1234`
- 員工資料管理：新增、修改、刪除
- 員工欄位：員工編號、姓名、部門、到職日、狀態
- 打卡紀錄查詢：日期、員工、部門、動作
- 打卡狀態修改與紀錄刪除
- 匯出 Excel `.xls`

## 本機資料儲存

目前所有資料儲存在瀏覽器 LocalStorage：

- 員工資料：`employees`
- 打卡紀錄：`employee-attendance-v1`

系統會自動建立一筆測試員工：

- 員工編號：`E001`
- 姓名：王小明
- 部門：行政部
- 狀態：在職

## 本機開啟

可以直接開啟 `index.html` 測試畫面與 LocalStorage 功能。

若要用本機伺服器預覽：

```bash
python3 -m http.server 4173
```

然後開啟：

```text
http://localhost:4173/
```

## 檢查指令

```bash
npm run check
node --check app.js
```

## GitHub Repository

建議建立的新 Repository：

```text
yangjiajiang-attendance-system
```

## Vercel 部署

此版本可直接部署為靜態網站。部署後資料仍會存在使用者瀏覽器 LocalStorage，不會跨裝置同步。

正式多人共用版本下一步需改為資料庫版本，建議：

- 建立 `employees` 資料表
- 建立 `attendance_records` 資料表
- 新增員工 CRUD API
- 打卡時由 API 驗證員工狀態
- 後台查詢與 Excel 匯出改由資料庫資料產生
