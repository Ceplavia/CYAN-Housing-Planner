# CYAN-Housing-Planner

[English](README.md)

**可自行架設的 2D/3D 平面圖編輯器** — 以 2D 繪製平面圖，以 3D 預覽及漫遊，所有專案均儲存在你自己的伺服器上。

源自 MIT 授權的 [openplan3d](https://github.com/laanlabs/openPlan3D)，改造成多人使用、可自行架設的版本：帳戶系統、按用户儲存的專案庫、配額及管理後台，沒有任何雲端依賴。

<p align="center">
  <img src="plan1_2d.jpg" alt="2D 平面圖檢視" width="48%">
  <img src="plan1_3d.jpg" alt="3D 平面圖檢視" width="48%">
</p>
<p align="center">
  <img src="plan4_2d.jpg" alt="詳細 2D 平面圖" width="48%">
  <img src="plan4_3d.jpg" alt="詳細 3D 檢視" width="48%">
</p>

---

## 功能

### 帳戶與儲存
- **伺服器端圖紙庫** — 專案、縮圖、版本記錄及恢復資料均儲存在 `DATA_DIR` 的 SQLite 檔案中，瀏覽器不會保留資料
- **註冊／登入** 採用 cookie session；用户只能檢視自己的圖紙
- **按用户的圖紙配額** — plan 基本上限加管理員額外批出的 bonus 數量
- **分享鏈接** — 每個專案一條公開鏈接，可設定密碼及 1/7/30 日有效期；可隨時於專案菜單重新生成或取消
- **管理後台**（`/admin`）— 激活／停用帳戶（停用原因會於登入時顯示）、更改 plan、批出 bonus 配額，支援搜索及分頁瀏覽用户

### 繪圖工具
- 牆身支援貼齊及角度限制；多種款式的門窗；直／L／U 型樓梯
- 由牆身自動識別房間，附標籤及顏色
- 分類傢俬目錄，支援拖放、旋轉、縮放（完整 3D 模型）

### 3D 檢視
- 實時 3D 預覽（`Tab`）及第一人稱漫遊
- 材質編輯（木、瓷磚、雲石、地氈、混凝土、磚等）及可調燈光

### 進階工具
- 網格貼齊、智慧參考線、多選＋對齊／分佈、圖層、註解、房間預設
- 復原／重做支援組合操作，版本記錄快照可還原

### 匯入／匯出
- **匯出**：SVG、DXF、PDF（連圖框）、PNG、可編輯 JSON、專案 package ZIP
- **匯入**：JSON 專案、Apple RoomPlan 掃描檔、專案 package ZIP、剪貼簿圖片
- 帳戶頁可為整個圖紙庫進行備份及恢復

### 多語言
- English、Português、繁體中文（香港）— 可隨時透過右上角地球圖標切換
- 在 [`src/lib/i18n/languages/`](src/lib/i18n/languages/) 新增 `<locale>.json` 即可加入語言 — 詳見 [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Docker 自行架設

本應用為 Node 24 伺服器加 SQLite — 一個 container 即可運作，無需外部服務：

```bash
docker build -t cyan-housing-planner .
docker run -d -p 3000:3000 -v cyan-data:/data \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='change-me' \
  --name cyan-planner cyan-housing-planner
```

開啟 http://localhost:3000，以環境變數設定的管理員帳號登入（首次啟動時自動建立），即可開始繪製。`-v cyan-data:/data` 掛載確保重建後帳戶及圖紙仍然保留。

### 環境變數

| 變數 | 預設值 | 用途 |
|---|---|---|
| `PORT` | `3000` | Container 內的監聽埠 |
| `DATA_DIR` | `/data`（Docker 以外使用 `data/`） | SQLite 資料庫目錄 |
| `ADMIN_USERNAME` | — | 配合 `ADMIN_PASSWORD`，當沒有管理員時於啟動時授予管理員權限（帳號不存在則自動建立） |
| `ADMIN_PASSWORD` | — | 上述管理員帳號的密碼 |
| `MAX_PROJECTS_PER_USER` | `50` | `free` plan 的基本圖紙配額 |
| `REGISTRATION_OPEN` | `true` | `false` 會關閉公開註冊 |
| `AUTH_RATE_LIMIT` | 每 IP 每分鐘 `20` 次 | 登入／註冊次數上限；`0` 停用 |
| `BODY_SIZE_LIMIT` | `64M` | 請求 body 上限 — 大型圖紙及圖紙庫恢復所需 |
| `ORIGIN` | 請求的 origin | 反向代理後的公開網址（例如 `https://plans.example.com`） |

不使用 Docker：執行 `npm run build` 後以 `DATA_DIR=data PORT=3000 node build/index.js` 啟動。

---

## 開發

需要 Node.js 24（見 `.nvmrc`）— 伺服器使用 `node:sqlite`。

```bash
git clone https://github.com/Ceplavia/CYAN-Housing-Planner.git
cd CYAN-Housing-Planner
npm ci
npm run dev
```

提交前的檢查：

```bash
npm test                      # vitest 單元測試
npm run check                 # svelte-check
npm run build                 # production build
npx playwright install chromium
npm run test:browser          # 瀏覽器測試（使用獨立臨時 DB）
```

瀏覽器測試會以 production build 及拋棄式 `DATA_DIR` 加上預設的 `e2e_admin` 帳號執行 — 不會觸及你真實的 `data/` 目錄。

---

## 鍵盤快捷鍵

| 快捷鍵 | 操作 |
|---|---|
| `V` / `W` / `D` / `T` / `H` | 選擇／牆身／門／註解／平移 |
| `R` | 旋轉已選傢俬 |
| `Tab` | 切換 2D / 3D 檢視 |
| `Delete` / `Backspace` | 刪除已選元素 |
| `Escape` | 取消選擇／取消 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 復原／重做 |
| `Ctrl+S` | 儲存專案 |

---

## 技術棧

- [SvelteKit](https://svelte.dev) + adapter-node — 應用框架及伺服器
- [Three.js](https://threejs.org) — 3D 渲染
- [Tailwind CSS](https://tailwindcss.com) + TypeScript
- [`node:sqlite`](https://nodejs.org/api/sqlite.html) — 帳戶、session 及專案儲存
- jsPDF、dxf-writer、jszip — 匯出功能

## 授權

[MIT](LICENSE)
