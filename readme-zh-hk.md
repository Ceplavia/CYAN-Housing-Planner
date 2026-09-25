# CYAN-Housing-Planner

[English](README.md)

**可自行架設嘅 2D/3D 平面圖編輯器** — 喺 2D 畫圖，用 3D 預覽同漫遊，所有專案都儲喺你自己嘅伺服器。

源自 MIT 授權嘅 [openplan3d](https://github.com/laanlabs/openPlan3D)，改造成多人使用、可自行架設嘅版本：帳戶系統、按用户儲存嘅專案庫、配額同管理後台，冇任何雲端依賴。

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
- **伺服器端圖紙庫** — 專案、縮圖、版本記錄同恢復資料都儲喺 `DATA_DIR` 嘅 SQLite 檔案，瀏覽器唔會留資料
- **註冊／登入** 使用 cookie session；用户只可以睇到自己嘅圖紙
- **按用户嘅圖紙配額** — plan 基本上限 + 管理員額外批出嘅 bonus 數量
- **分享鏈接** — 每個專案一條公開鏈接，可設密碼同 1/7/30 日有效期；隨時喺專案菜單重新生成或者取消
- **管理後台**（`/admin`）— 激活／停用帳戶（停用原因會喺登入時顯示）、改 plan、批 bonus 配額、搜索同分頁瀏覽用户

### 繪圖工具
- 牆身支援貼齊同角度限制；多種款式嘅門窗；直／L／U 型樓梯
- 由牆身自動識別房間，連標籤同顏色
- 分類傢俬目錄，支援拖放、旋轉、縮放（完整 3D 模型）

### 3D 檢視
- 實時 3D 預覽（`Tab`）同第一人稱漫遊
- 材質編輯（木、瓷磚、雲石、地氈、混凝土、磚等）同可調燈光

### 進階工具
- 網格貼齊、智慧參考線、多選＋對齊／分佈、圖層、註解、房間預設
- 復原／重做支援組合操作，版本記錄快照可以還原

### 匯入／匯出
- **匯出**：SVG、DXF、PDF（連圖框）、PNG、可編輯 JSON、專案 package ZIP
- **匯入**：JSON 專案、Apple RoomPlan 掃描檔、專案 package ZIP、剪貼簿圖片
- 帳戶頁可對成個圖紙庫做備份同恢復

### 多語言
- English、Português、繁體中文（香港）— 右上角地球圖標隨時切換
- 喺 [`src/lib/i18n/languages/`](src/lib/i18n/languages/) 加個 `<locale>.json` 就可以新增語言 — 詳見 [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Docker 自行架設

App 係 Node 24 伺服器加 SQLite — 一個 container 搞掂，冇外部服務：

```bash
docker build -t cyan-housing-planner .
docker run -d -p 3000:3000 -v cyan-data:/data \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='change-me' \
  --name cyan-planner cyan-housing-planner
```

開 http://localhost:3000，用環境變數設定嘅管理員帳號登入（首次啟動時自動建立），就可以開始畫圖。`-v cyan-data:/data` 呢個掛載確保重裝之後帳戶同圖紙都仲喺度。

### 環境變數

| 變數 | 預設值 | 用途 |
|---|---|---|
| `PORT` | `3000` | Container 內嘅監聽埠 |
| `DATA_DIR` | `/data`（Docker 以外用 `data/`） | SQLite 資料庫目錄 |
| `ADMIN_USERNAME` | — | 配合 `ADMIN_PASSWORD`，當冇管理員時喺啟動時授予管理員權限（帳號不存在就建立） |
| `ADMIN_PASSWORD` | — | 上述管理員帳號嘅密碼 |
| `MAX_PROJECTS_PER_USER` | `50` | `free` plan 嘅基本圖紙配額 |
| `REGISTRATION_OPEN` | `true` | `false` 會關閉公開註冊 |
| `AUTH_RATE_LIMIT` | 每 IP 每分鐘 `20` 次 | 登入／註冊次數上限；`0` 停用 |
| `BODY_SIZE_LIMIT` | `64M` | 請求 body 上限 — 大型圖紙同圖紙庫恢復需要 |
| `ORIGIN` | 請求嘅 origin | 反向代理後嘅公開網址（例如 `https://plans.example.com`） |

唔用 Docker：`npm run build` 之後 `DATA_DIR=data PORT=3000 node build/index.js`。

---

## 開發

需要 Node.js 24（見 `.nvmrc`）— 伺服器用 `node:sqlite`。

```bash
git clone https://github.com/Ceplavia/CYAN-Housing-Planner.git
cd CYAN-Housing-Planner
npm ci
npm run dev
```

提交前嘅檢查：

```bash
npm test                      # vitest 單元測試
npm run check                 # svelte-check
npm run build                 # production build
npx playwright install chromium
npm run test:browser          # 瀏覽器測試（用獨立臨時 DB）
```

瀏覽器測試會用 production build 同一個拋棄式 `DATA_DIR` 同預設嘅 `e2e_admin` 帳號 — 唔會掂到你真實嘅 `data/` 目錄。

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

- [SvelteKit](https://svelte.dev) + adapter-node — 應用框架同伺服器
- [Three.js](https://threejs.org) — 3D 渲染
- [Tailwind CSS](https://tailwindcss.com) + TypeScript
- [`node:sqlite`](https://nodejs.org/api/sqlite.html) — 帳戶、session 同專案儲存
- jsPDF、dxf-writer、jszip — 匯出功能

## 授權

[MIT](LICENSE)
