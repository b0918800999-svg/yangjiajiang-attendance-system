# 員工上下班打卡系統

楊家將包裝設計有限公司的員工智慧打卡系統。現行版本已加入 Firebase Firestore 同步層，保留 localStorage 作為離線與設定未完成時的備援。

## 專案資訊

- 專案名稱：員工上下班打卡系統
- Repository 名稱：`yangjiajiang-attendance-system`
- 公司名稱：楊家將包裝設計有限公司
- 系統名稱：楊家將員工智慧打卡系統

## 目前功能

- 員工下拉選單打卡
- 員工打卡密碼
- 工作據點：南崁、平鎮、支援外點
- 南崁 08:00-17:00、平鎮 09:00-18:00 考勤規則
- 自動判定正常、遲到、早退、缺卡
- 管理後台帳號密碼登入
- 員工資料新增、修改、刪除
- 打卡紀錄查詢與狀態維護
- 今日統計、據點統計、員工月統計
- Excel / CSV 匯出
- PWA 與 LINE / Facebook 分享設定

## 資料儲存

主要資料來源可升級為 Firebase Firestore，並保留 localStorage 備援。

localStorage key：

- 員工資料：`employees`
- 打卡紀錄：`employee-attendance-v1`
- 舊員工資料相容：`employee-directory-v1`

Firestore collections：

- `employees`：員工資料
- `attendanceRecords`：打卡紀錄
- `departments`：部門資料
- `workSites`：工作據點
- `monthlyReports`：出勤月報表

## Firebase 設定

1. 建立 Firebase 專案。
2. 在 Firebase Console 啟用 Firestore Database。
3. 新增 Web App，取得 Firebase config。
4. 修改 `firebase-config.js`：

```js
window.YANG_FIREBASE_CONFIG = {
  apiKey: "你的 apiKey",
  authDomain: "你的專案.firebaseapp.com",
  projectId: "你的 projectId",
  storageBucket: "你的專案.appspot.com",
  messagingSenderId: "你的 messagingSenderId",
  appId: "你的 appId"
};
```

5. 部署 Firestore rules：

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

目前 `firestore.rules` 是可讓系統先正常同步的啟用規則。正式儲存敏感個資前，建議下一步加入 Firebase Auth 與管理員 custom claims，再收緊寫入權限。

## 本機開啟

可以直接開啟 `index.html` 測試畫面。Firebase config 未填入時，系統會使用 localStorage。

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

## GitHub 與 Vercel 部署

```bash
git push origin main
vercel --prod
```
