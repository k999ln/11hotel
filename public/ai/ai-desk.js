(() => {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const apiBase = (root.dataset.apiBase || "/api").replace(/\/+$/, "");
  const remoteMode = root.dataset.remote === "true";
  const deskModeRaw = String(root.dataset.deskMode || "").trim().toLowerCase();
  const deskMode = ["ops", "admin", "full"].includes(deskModeRaw)
    ? deskModeRaw
    : (remoteMode ? "ops" : "full");
  const LIVE_CONFIRM = "I_UNDERSTAND_LIVE_TRADING";
  const ADMIN_PATH = "/admin/quant";
  const DESK_PATH = "/ai";

  function isShadowRunner(trading) {
    if (!trading) return false;
    return trading.mode === "shadow" || trading.shadow === true;
  }

  function runnerModeLabel(trading) {
    if (!trading || !trading.running) return null;
    if (isShadowRunner(trading)) return "SHADOW";
    if (trading.dry_run) return "DRY RUN";
    return "LIVE";
  }

  function progressText(command) {
    const progress = command && command.result && command.result.progress;
    if (!progress) return "";
    const elapsed = progress.elapsed_sec == null ? "" : `${progress.elapsed_sec}s`;
    const phase = progress.phase ? String(progress.phase) : "";
    return [elapsed, phase].filter(Boolean).join(" · ");
  }

  function defaultView() {
    if (deskMode === "admin") return "overview";
    return "trade";
  }

  function allowedView(viewId) {
    const target = viewId || defaultView();
    if (deskMode === "ops") return "trade";
    if (deskMode === "admin" && target === "trade") return "overview";
    return target;
  }

  function showView(viewId) {
    const target = allowedView(viewId);
    document.querySelectorAll(".view").forEach((node) => {
      const active = node.dataset.view === target;
      node.hidden = !active;
      node.classList.toggle("active", active);
    });
    document.querySelectorAll(".tab-nav .tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === target);
    });
    document.body.classList.toggle("research-open", target !== "trade");
    if (location.hash.replace("#", "") !== target) {
      history.replaceState(null, "", `#${target}`);
    }
    if (target === "trade") {
      requestAnimationFrame(() => refreshChart(latestSnap));
    }
  }

  function applyDeskMode() {
    document.body.classList.toggle("desk-ops", deskMode === "ops");
    document.body.classList.toggle("desk-admin", deskMode === "admin");
    document.body.classList.toggle("desk-full", deskMode === "full");

    const linkAdmin = $("link-admin");
    const linkDesk = $("link-desk");
    const linkOpenAdmin = $("link-open-admin");
    const btnCmd = $("btn-cmd");
    const btnMore = $("btn-open-more");
    const nav = document.querySelector(".tab-nav");
    const brandH1 = document.querySelector(".brand h1");

    if (linkAdmin) {
      linkAdmin.hidden = deskMode !== "ops";
      linkAdmin.href = ADMIN_PATH;
    }
    if (linkDesk) {
      linkDesk.hidden = deskMode !== "admin";
      linkDesk.href = DESK_PATH;
    }
    if (linkOpenAdmin) {
      linkOpenAdmin.hidden = deskMode !== "ops";
      linkOpenAdmin.href = ADMIN_PATH;
    }
    if (btnMore) btnMore.hidden = deskMode === "ops";
    if (btnCmd) btnCmd.hidden = deskMode === "ops";

    if (brandH1) {
      brandH1.textContent = deskMode === "admin" ? "Admin" : "Desk";
    }

    if (nav) {
      // ops: 非表示 / admin: 研究タブ表示 / full: 従来どおりコマンドパレット優先で隠す
      nav.hidden = deskMode !== "admin";
      nav.querySelectorAll("[data-tab-scope]").forEach((tab) => {
        const scope = tab.dataset.tabScope;
        if (deskMode === "admin") {
          tab.hidden = scope !== "admin";
          return;
        }
        tab.hidden = false;
      });
    }

    document.querySelectorAll("#cmd-list li").forEach((li) => {
      li.hidden = !cmdAllowed(li);
    });

    if (deskMode === "ops") {
      ["overview", "operations", "learning-section", "architecture"].forEach((id) => {
        const el = $(id);
        if (el) el.setAttribute("data-ops-hidden", "1");
      });
      const drawer = $("more-drawer");
      if (drawer) drawer.setAttribute("data-ops-hidden", "1");
      closeMoreDrawer();
    }

    if (deskMode === "admin") {
      const trade = $("trade");
      if (trade) trade.setAttribute("data-admin-hidden", "1");
      const morePanel = $("more-panel");
      const ops = $("operations");
      if (morePanel && ops && !document.getElementById("admin-more-host")) {
        const host = document.createElement("section");
        host.id = "admin-more-host";
        host.className = "panel admin-more-host";
        host.innerHTML = "<div class=\"panel-head\"><h3>接続・台帳・学習操作</h3></div>";
        const body = document.createElement("div");
        body.className = "admin-more-body";
        while (morePanel.firstChild) body.appendChild(morePanel.firstChild);
        host.appendChild(body);
        ops.appendChild(host);
      }
      closeMoreDrawer();
    }
  }

  function openMoreDrawer() {
    const drawer = $("more-drawer");
    if (drawer) drawer.hidden = false;
  }

  function closeMoreDrawer() {
    const drawer = $("more-drawer");
    if (drawer) drawer.hidden = true;
  }

  function openCmdPalette() {
    const dlg = $("cmd-palette");
    if (!dlg || typeof dlg.showModal !== "function") return;
    const input = $("cmd-input");
    if (input) input.value = "";
    filterCmdList("");
    dlg.showModal();
    if (input) input.focus();
  }

  function closeCmdPalette() {
    const dlg = $("cmd-palette");
    if (dlg && dlg.open) dlg.close();
  }

  function cmdAllowed(li) {
    const scope = li.dataset.cmdScope;
    const cmd = String(li.dataset.cmd || "");
    if (!scope) return true;
    if (deskMode === "full") return !cmd.startsWith("nav:");
    if (deskMode === "ops") return scope === "ops";
    return scope === "admin" || cmd === "nav:desk";
  }

  function filterCmdList(query) {
    const q = String(query || "").trim().toLowerCase();
    document.querySelectorAll("#cmd-list li").forEach((li) => {
      if (!cmdAllowed(li)) {
        li.hidden = true;
        return;
      }
      const text = li.textContent.toLowerCase();
      li.hidden = Boolean(q) && !text.includes(q);
    });
  }

  function runCmd(cmd) {
    closeCmdPalette();
    if (!cmd) return;
    if (cmd === "nav:admin") {
      location.assign(ADMIN_PATH);
      return;
    }
    if (cmd === "nav:desk") {
      location.assign(DESK_PATH);
      return;
    }
    if (cmd === "drawer:more") {
      if (deskMode === "ops") {
        location.assign(ADMIN_PATH);
        return;
      }
      if (deskMode === "admin") {
        showView("operations");
        return;
      }
      showView("trade");
      openMoreDrawer();
      return;
    }
    if (cmd.startsWith("view:")) {
      showView(cmd.slice(5));
    }
  }

  function isLiveArmed() {
    const confirm = ($("trade-confirm") && $("trade-confirm").value.trim()) || "";
    const approval = ($("trade-approval") && $("trade-approval").value.trim()) || "";
    return confirm === LIVE_CONFIRM && approval.length >= 16;
  }

  function syncLiveArmed() {
    const armed = isLiveArmed();
    const modeLive = $("mode-live");
    const buyStatus = $("buy-status");
    const liveBtn = $("btn-trade-live");
    const hint = $("live-arm-hint");
    if (modeLive) modeLive.classList.toggle("live-armed", armed);
    if (buyStatus) buyStatus.classList.toggle("live-armed", armed);
    if (liveBtn && $("trade-mode").value === "live" && !tradeRunning) {
      liveBtn.disabled = !armed;
    }
    if (hint) {
      hint.textContent = armed
        ? "LIVE開始の準備ができています（実発注）"
        : "確認文と承認トークンが入ると LIVE 開始が有効になります";
      hint.classList.toggle("armed", armed);
    }
  }

  function syncBuyCta() {
    const mode = ($("trade-mode") && $("trade-mode").value) || "dry_run";
    const dryBtn = $("btn-trade-dry");
    const shadowBtn = $("btn-trade-shadow");
    const liveBtn = $("btn-trade-live");
    const cta = document.querySelector(".buy-cta");
    if (dryBtn) {
      dryBtn.hidden = mode !== "dry_run";
      dryBtn.textContent = tradeRunning ? "DRY 稼働中" : "ドライラン開始";
    }
    if (shadowBtn) {
      shadowBtn.hidden = mode !== "shadow";
      shadowBtn.textContent = tradeRunning ? "SHADOW 稼働中" : "Shadow開始";
    }
    if (liveBtn) {
      liveBtn.hidden = mode !== "live";
      liveBtn.textContent = tradeRunning ? "LIVE 稼働中" : "LIVE開始";
    }
    const stopBtn = $("btn-trade-stop");
    if (stopBtn) stopBtn.textContent = tradeRunning ? "停止（kill / flatten）" : "停止";
    if (cta) cta.classList.toggle("running", Boolean(tradeRunning));
    syncLiveArmed();
  }

  function setTradeMode(mode) {
    const next = mode === "live" ? "live" : (mode === "shadow" ? "shadow" : "dry_run");
    $("trade-mode").value = next;
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === next);
    });
    const gates = $("live-gates");
    if (gates) gates.hidden = next !== "live";
    syncBuyCta();
  }

  function flattenStatusParts(trading) {
    const status = trading.flatten_status
      || (trading.flatten_pending ? "pending"
        : trading.flatten_done ? "confirmed" : "n/a");
    const when = trading.flatten_confirmed_at
      ? String(trading.flatten_confirmed_at).replace("T", " ").replace("Z", "")
      : "";
    const hint = {
      confirmed: "建玉0確認",
      unknown: "未確認（接続不可）",
      failed: "失敗/残建玉",
      pending: "処理中",
      "n/a": "対象なし",
    }[status] || status;
    const tone = {
      confirmed: "ok",
      unknown: "warn",
      failed: "on",
      pending: "warn",
      "n/a": "muted",
    }[status] || "muted";
    return {
      status,
      label: when ? `${status} · ${hint}\n${when}` : `${status} · ${hint}`,
      tone,
    };
  }

  function flattenStatusLabel(trading) {
    const parts = flattenStatusParts(trading);
    return parts.label.replace("\n", " · ");
  }

  function renderStopStrip(trading, killOn) {
    const strip = $("stop-strip");
    const killEl = $("kill-ack-label");
    const flatEl = $("flatten-label");
    if (!killEl || !flatEl) return;
    const show = Boolean(killOn);
    if (strip) strip.hidden = !show;
    if (!show) return;
    const ackAt = trading && trading.kill_acked_at
      ? String(trading.kill_acked_at).replace("T", " ").replace("Z", "")
      : "";
    killEl.textContent = ackAt ? `ON · ${ackAt}` : "ON";
    killEl.className = "stop-v on";
    const flat = flattenStatusParts(trading || {});
    flatEl.textContent = flat.label.replace("\n", " · ");
    flatEl.className = `stop-v ${flat.tone}`;
  }

  function renderEssentialStatus(snap) {
    const trading = snap.trading || {};
    const live = snap.live || {};
    const remote = snap.remote || {};
    const kai = snap.kai || {};
    const shadowCounts = (snap.shadow && snap.shadow.counts) || {};
    const bridgeOk = !remoteMode || Boolean(remote.bridge_online);
    const hb = live.heartbeat_ago || (trading.running ? "稼働中" : "—");
    const pulse = $("pulse-line");
    if (pulse) {
      pulse.textContent = remoteMode
        ? `接続 ${bridgeOk ? "online" : "offline"} · 心拍 ${hb}`
        : `接続 local · 心拍 ${hb}`;
      pulse.className = `pulse-line ${bridgeOk ? "ok" : "bad"}`;
    }
    const learn = $("learn-one-liner");
    if (learn) {
      const champ = kai.champion ? "championあり" : "championなし";
      const cand = kai.latest_candidate
        ? `candidateあり`
        : ((snap.last_retrain && snap.last_retrain.dataset_manifest_id) ? "再学習履歴あり" : "candidateなし");
      learn.textContent = `学習 ${champ} · ${cand}`;
    }
    const essential = $("essential-metrics");
    if (essential) {
      const fills = (live.counts && live.counts.fills) || 0;
      essential.textContent = `Shadow ${shadowCounts.decisions || 0} · 約定 ${fills}`;
      essential.className = "status-metrics";
    }
  }

  function clearSecretInputs() {
    ["trade-approval", "trade-confirm", "market-approval"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    syncLiveArmed();
  }

  function setDock(dockId) {
    if (dockId === "more") openMoreDrawer();
    else closeMoreDrawer();
  }

  const systemPill = $("system-pill");
  const actionMsg = $("action-msg");
  const tradeMsg = $("trading-action-msg");
  const actionIds = [
    "btn-refresh",
    "btn-retrain",
    "btn-diagnose",
    "btn-learn",
    "btn-kai-train",
    "btn-kai-promote",
    "btn-kai-predict",
    "btn-market-promote",
    "btn-trade-dry",
    "btn-trade-shadow",
    "btn-trade-live",
    "btn-trade-stop",
    "btn-trade-clear",
    "btn-trade-inspect",
  ];
  let currentKai = {};
  let lastChart = null;
  let chartCache = {};
  let chartTimer = null;
  let statusTimer = null;
  let latestSnap = null;
  let tradeRunning = false;

  document.body.classList.add("desk-shell");
  applyDeskMode();

  document.querySelectorAll(".tab-nav .tab").forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTradeMode(btn.dataset.mode));
  });
  document.querySelectorAll(".dock-tab, .rail-btn").forEach((btn) => {
    btn.addEventListener("click", () => setDock(btn.dataset.dock));
  });
  if ($("btn-cmd")) $("btn-cmd").addEventListener("click", openCmdPalette);
  if ($("btn-open-more")) {
    $("btn-open-more").addEventListener("click", () => {
      if (deskMode === "ops") {
        location.assign(ADMIN_PATH);
        return;
      }
      openMoreDrawer();
    });
  }
  if ($("btn-close-more")) $("btn-close-more").addEventListener("click", closeMoreDrawer);
  if ($("cmd-input")) {
    $("cmd-input").addEventListener("input", (event) => filterCmdList(event.target.value));
    $("cmd-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const first = document.querySelector("#cmd-list li:not([hidden])");
        if (first) runCmd(first.dataset.cmd);
      }
    });
  }
  document.querySelectorAll("#cmd-list li").forEach((li) => {
    li.addEventListener("click", () => runCmd(li.dataset.cmd));
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === "k") {
      if (deskMode === "ops") return;
      event.preventDefault();
      openCmdPalette();
    }
  });
  document.querySelectorAll(".tf-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tf = btn.dataset.tf;
      const select = $("chart-timeframe");
      if (select) select.value = tf;
      document.querySelectorAll(".tf-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.tf === tf);
      });
      refreshChart(latestSnap);
    });
  });
  const tradePreset = $("trade-preset");
  if (tradePreset && tradePreset.tagName === "SELECT") {
    tradePreset.addEventListener("change", () => {
      $("trade-symbols").value = tradePreset.value === "fx"
        ? "EURUSDm,GBPUSDm"
        : "BTCUSDm";
      refreshChart(latestSnap);
    });
  }
  ["trade-confirm", "trade-approval"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", syncLiveArmed);
  });
  window.addEventListener("hashchange", () => {
    showView(location.hash.replace("#", "") || defaultView());
  });
  const PUBLIC_PAIRS = {
    BTCUSDm: "BTCUSDT",
    ETHUSDm: "ETHUSDT",
    EURUSDm: "EURUSDT",
    GBPUSDm: "GBPUSDT",
  };

  showView(location.hash.replace("#", "") || defaultView());
  setTradeMode("shadow");
  closeMoreDrawer();

  if (deskMode !== "admin") {
    selectSymbol("BTCUSDm");
    document.querySelectorAll(".chart-pane").forEach((pane) => {
      pane.addEventListener("click", () => selectSymbol(pane.dataset.symbol));
    });
    if ($("desk-symbol-search")) {
      $("desk-symbol-search").addEventListener("change", () => {
        selectSymbol($("desk-symbol-search").value.trim());
        refreshChart(latestSnap);
      });
    }
    if ($("chart-timeframe")) {
      $("chart-timeframe").addEventListener("change", () => {
        const tf = $("chart-timeframe").value;
        document.querySelectorAll(".tf-pill").forEach((pill) => {
          pill.classList.toggle("active", pill.dataset.tf === tf);
        });
        refreshChart(latestSnap);
      });
    }
  }
  const footerMode = $("footer-mode");
  if (footerMode) {
    if (!remoteMode) footerMode.textContent = "localhost only";
    else if (deskMode === "admin") footerMode.textContent = "11hotel.vip/admin/quant · secure bridge";
    else footerMode.textContent = "11hotel.vip/ai · secure bridge";
  }

  const esc = (value) =>
    String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function fmtNum(value, digits = 4) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Number(value).toFixed(digits);
  }

  function fmtPct(value, digits = 1) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return `${(Number(value) * 100).toFixed(digits)}%`;
  }

  function fmtMoney(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  }

  function fmtTs(value) {
    if (!value) return "—";
    return String(value).replace("T", " ").replace("Z", " UTC");
  }

  function setBusy(busy, label = "") {
    actionIds.forEach((id) => {
      const button = $(id);
      if (button) button.disabled = busy;
    });
    if (!busy) {
      syncKaiButtons();
      const dryBtn = $("btn-trade-dry");
      const shadowBtn = $("btn-trade-shadow");
      const liveBtn = $("btn-trade-live");
      if (dryBtn) dryBtn.disabled = tradeRunning;
      if (shadowBtn) shadowBtn.disabled = tradeRunning;
      if (liveBtn) liveBtn.disabled = tradeRunning || ($("trade-mode").value === "live" && !isLiveArmed());
    }
    if (actionMsg) actionMsg.textContent = label;
    if (tradeMsg && label) tradeMsg.textContent = label;
  }

  function syncKaiButtons() {
    const counts = currentKai.counts || {};
    const train = $("btn-kai-train");
    const promote = $("btn-kai-promote");
    const predict = $("btn-kai-predict");
    if (train) train.disabled = !currentKai.ok || Number(counts.compute_runs || 0) < 12;
    if (promote) promote.disabled = !currentKai.ok || !currentKai.latest_candidate;
    if (predict) predict.disabled = !currentKai.ok || !currentKai.champion;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { Accept: "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (remoteMode && res.status === 401) {
      location.assign(`/admin/login?return_to=${encodeURIComponent(location.pathname)}`);
      throw new Error("ログインが必要です");
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function endpoint(path) {
    return `${apiBase}${path}`;
  }

  function statusLabel(status) {
    return ({
      active: "ACTIVE",
      ready: "READY",
      standby: "STANDBY",
      blocked: "BLOCKED",
      degraded: "DEGRADED",
      stale: "STALE",
      error: "ERROR",
    })[status] || String(status || "UNKNOWN").toUpperCase();
  }

  function connectionTile(key, value, opts = {}) {
    const classes = ["connection-tile"];
    if (opts.emphasis) classes.push("emphasis");
    if (opts.warn) classes.push("warn");
    if (opts.bad) classes.push("bad");
    const valueClass = opts.small ? "v small" : "v";
    return `<div class="${classes.join(" ")}"><span class="k">${esc(key)}</span><span class="${valueClass}">${esc(value)}</span></div>`;
  }

  function renderBroker(snap) {
    const broker = snap.broker || {};
    const trading = snap.trading || {};
    const badge = $("broker-badge");
    const summary = $("broker-summary");
    const grid = $("broker-grid");
    const note = $("broker-note");
    if (!badge || !summary || !grid) return;

    const status = broker.status || "missing";
    badge.textContent = broker.status_label || statusLabel(status);
    badge.className = `mini-badge ${
      status === "connected" ? "active"
        : status === "configured" ? "ready"
          : status === "missing" || status === "error" ? "blocked"
            : "standby"
    }`;

    summary.textContent = broker.summary
      || `${broker.broker_company || "—"} · ${broker.server || "—"} · ${broker.login_display || "—"}`;
    const header = $("header-broker");
    if (header) header.textContent = summary.textContent;
    const inline = $("header-broker-inline");
    if (inline) inline.textContent = summary.textContent;

    const modeLabel = runnerModeLabel(trading);
    const runnerMode = modeLabel
      ? `${modeLabel} 稼働中`
      : "ランナー停止中";
    const balance = broker.balance == null
      ? "—"
      : `${fmtMoney(broker.balance)}${broker.currency ? ` ${broker.currency}` : ""}`;
    const equity = broker.equity == null
      ? "—"
      : `${fmtMoney(broker.equity)}${broker.currency ? ` ${broker.currency}` : ""}`;

    grid.innerHTML = [
      connectionTile("取引会社", broker.broker_company || "未設定", { emphasis: true }),
      connectionTile("サーバー", broker.server || "未設定", { small: true }),
      connectionTile("口座番号", broker.login_display || "未設定", { emphasis: true }),
      connectionTile("口座種別", broker.account_kind_label || "不明", {
        warn: broker.account_kind === "real",
        bad: broker.account_kind === "unknown",
      }),
      connectionTile("口座名", broker.account_name || "—"),
      connectionTile("残高", balance),
      connectionTile("有効証拠金", equity),
      connectionTile("レバレッジ", broker.leverage ? `1:${broker.leverage}` : "—"),
      connectionTile("取引許可", broker.trade_allowed == null ? "—" : (broker.trade_allowed ? "許可" : "不可"), {
        bad: broker.trade_allowed === false,
      }),
      connectionTile("自動売買", broker.trade_expert == null ? "—" : (broker.trade_expert ? "ON" : "OFF"), {
        warn: broker.trade_expert === false,
      }),
      connectionTile("設定銘柄", broker.symbols || "—", { small: true }),
      connectionTile("ランナー", runnerMode, {
        emphasis: Boolean(trading.running && !trading.dry_run),
        warn: Boolean(trading.running && trading.dry_run),
      }),
      connectionTile("カタログ", broker.in_catalog ? "対応ブローカー一致" : "未一致 / 汎用MT5", {
        warn: !broker.in_catalog,
      }),
      connectionTile("対応社数", String((broker.catalog && broker.catalog.count) || "—")),
    ].join("");

    const probe = broker.probe || {};
    const bits = [];
    bits.push(`平台: ${broker.platform || "MT5"}`);
    if (broker.terminal_company) bits.push(`端末会社: ${broker.terminal_company}`);
    if (probe.probed && !probe.connected && probe.reason) {
      bits.push(`接続確認失敗: ${probe.reason}`);
    } else if (!probe.probed) {
      bits.push("接続確認はキャッシュ待ち、または未実施");
    } else {
      bits.push("端末側MT5へ接続確認済（パスワードは表示しません）");
    }
    if (broker.env_dry_run) bits.push("環境変数 DRY_RUN=1");
    if (note) note.textContent = bits.join(" · ");

    const catalog = broker.catalog || {};
    const countEl = $("broker-catalog-count");
    const noteEl = $("broker-catalog-note");
    const chipGrid = $("broker-chip-grid");
    if (countEl) countEl.textContent = `${catalog.count || 0}社`;
    if (noteEl && catalog.note) noteEl.textContent = catalog.note;
    if (chipGrid) {
      const names = catalog.names || (catalog.brokers || []).map((b) => b.name);
      const active = broker.broker_company || "";
      chipGrid.innerHTML = names.map((name) => {
        const on = name === active ? " active" : "";
        return `<span class="broker-chip${on}">${esc(name)}</span>`;
      }).join("");
    }
  }

  function emptyRows(columns, message) {
    return `<tr class="empty-row"><td colspan="${columns}">${esc(message)}</td></tr>`;
  }

  function selectedChartSymbol() {
    const active = document.querySelector(".chart-pane.active");
    if (active && active.dataset.symbol) return active.dataset.symbol;
    const raw = ($("trade-symbols") && $("trade-symbols").value || "BTCUSDm").trim();
    return raw.split(",")[0].trim() || "BTCUSDm";
  }

  function selectedChartTimeframe() {
    return ($("chart-timeframe") && $("chart-timeframe").value) || "15m";
  }

  function paneSymbols() {
    return Array.from(document.querySelectorAll(".chart-pane"))
      .map((pane) => pane.dataset.symbol)
      .filter(Boolean);
  }

  function selectSymbol(symbol) {
    if (!symbol || !PUBLIC_PAIRS[symbol]) return;
    document.querySelectorAll(".chart-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.dataset.symbol === symbol);
    });
    document.querySelectorAll("#watchlist-body tr").forEach((row) => {
      row.classList.toggle("active", row.dataset.symbol === symbol);
    });
    const current = ($("trade-symbols").value || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!current.includes(symbol)) {
      $("trade-symbols").value = [symbol, ...current.filter((s) => s !== symbol)].join(",");
    } else {
      $("trade-symbols").value = [symbol, ...current.filter((s) => s !== symbol)].join(",");
    }
    if ($("desk-symbol-search")) $("desk-symbol-search").value = symbol;
    const detailName = $("watch-detail-name");
    const detailMeta = $("watch-detail-meta");
    if (detailName) detailName.textContent = `${symbol} · ${PUBLIC_PAIRS[symbol]}`;
    if (detailMeta) detailMeta.textContent = "参照=Binance公開 · 執行=MT5別";
    const cached = chartCache[symbol];
    if (cached) {
      applyPanePayload(symbol, cached, latestSnap || {});
    }
  }

  function drawCandlesOn(canvas, bars, markers) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 420;
    const cssHeight = Math.max(160, canvas.clientHeight || 220);
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // AdminLayout tones: bg / border / muted / green / red / accent
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    if (!bars || !bars.length) return;

    const pad = { top: 10, right: 52, bottom: 18, left: 8 };
    const plotW = cssWidth - pad.left - pad.right;
    const plotH = cssHeight - pad.top - pad.bottom;
    const highs = bars.map((b) => Number(b.h));
    const lows = bars.map((b) => Number(b.l));
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    if (!(max > min)) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    min -= span * 0.04;
    max += span * 0.04;
    const yAt = (price) => pad.top + ((max - price) / (max - min)) * plotH;
    const slot = plotW / bars.length;

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const y = pad.top + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(cssWidth - pad.right, y);
      ctx.stroke();
      const price = max - ((max - min) * i) / 3;
      ctx.fillStyle = "#888888";
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(price.toFixed(price >= 100 ? 2 : 5), cssWidth - pad.right + 6, y + 3);
    }

    bars.forEach((bar, index) => {
      const x = pad.left + slot * index + slot / 2;
      const open = Number(bar.o);
      const close = Number(bar.c);
      const high = Number(bar.h);
      const low = Number(bar.l);
      const up = close >= open;
      const color = up ? "#4ade80" : "#f87171";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, yAt(high));
      ctx.lineTo(x, yAt(low));
      ctx.stroke();
      const bodyTop = yAt(Math.max(open, close));
      const bodyBot = yAt(Math.min(open, close));
      const bodyH = Math.max(1, bodyBot - bodyTop);
      const bodyW = Math.max(2, slot * 0.62);
      ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
    });

    (markers || []).forEach((marker) => {
      if (marker.t == null || marker.price == null) return;
      let nearest = 0;
      let best = Infinity;
      bars.forEach((bar, index) => {
        const delta = Math.abs(Number(bar.t) - Number(marker.t));
        if (delta < best) {
          best = delta;
          nearest = index;
        }
      });
      const x = pad.left + slot * nearest + slot / 2;
      const y = yAt(Number(marker.price));
      ctx.fillStyle = marker.side === "SELL" ? "#f87171" : "#60a5fa";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCandles(bars, markers) {
    const symbol = selectedChartSymbol();
    const canvas = document.querySelector(`.pane-canvas[data-symbol="${symbol}"]`) || $("trade-chart");
    drawCandlesOn(canvas, bars, markers);
  }

  function chartMarkersFromSnap(snap) {
    const fills = (((snap || {}).live || {}).recent || {}).fills || [];
    return fills.slice(0, 40).map((fill) => {
      const ts = Date.parse(String(fill.ts || "").replace(" ", "T"));
      return {
        t: Number.isFinite(ts) ? ts : null,
        price: fill.price,
        side: fill.side,
        symbol: fill.symbol,
      };
    }).filter((row) => row.t != null && row.price != null);
  }

  function renderWatchlist() {
    const body = $("watchlist-body");
    if (!body) return;
    const active = selectedChartSymbol();
    body.innerHTML = Object.keys(PUBLIC_PAIRS).map((symbol) => {
      const payload = chartCache[symbol];
      const last = payload && payload.last;
      const bars = (payload && payload.bars) || [];
      const prev = bars.length > 1 ? bars[bars.length - 2] : null;
      const chg = last && prev && Number(prev.c)
        ? ((Number(last.c) / Number(prev.c)) - 1) * 100
        : null;
      const chgClass = chg == null ? "" : (chg >= 0 ? "up" : "down");
      const priceText = last && last.c != null
        ? Number(last.c).toLocaleString("en-US", { maximumFractionDigits: 4 })
        : "—";
      const chgText = chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`;
      return `<tr data-symbol="${esc(symbol)}" class="${symbol === active ? "active" : ""}">
        <td>${esc(symbol)}</td>
        <td class="${chgClass}">${esc(priceText)}</td>
        <td class="${chgClass}">${esc(chgText)}</td>
      </tr>`;
    }).join("");
    body.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => selectSymbol(row.dataset.symbol));
    });
  }

  function applyPanePayload(symbol, payload, snap) {
    chartCache[symbol] = payload;
    const pane = document.querySelector(`.chart-pane[data-symbol="${symbol}"]`);
    if (pane) {
      const priceEl = pane.querySelector('[data-role="price"]');
      const last = payload && payload.last;
      if (priceEl) {
        priceEl.textContent = last && last.c != null
          ? Number(last.c).toLocaleString("en-US", { maximumFractionDigits: 5 })
          : "—";
        if (last && payload.bars && payload.bars.length > 1) {
          const prev = payload.bars[payload.bars.length - 2];
          const up = Number(last.c) >= Number(prev.c);
          priceEl.style.color = up ? "var(--ok)" : "var(--bad)";
        }
      }
      const canvas = pane.querySelector(".pane-canvas");
      const markers = chartMarkersFromSnap(snap).filter((m) => !m.symbol || m.symbol === symbol);
      drawCandlesOn(canvas, (payload && payload.bars) || [], markers);
    }
    if (symbol === selectedChartSymbol()) {
      applyChartPayload(payload, snap);
    }
  }

  function applyChartPayload(payload, snap) {
    lastChart = payload;
    const badge = $("chart-badge");
    const title = $("chart-title");
    const subtitle = $("chart-subtitle");
    const source = $("chart-source");
    const lastPrice = $("chart-last-price");
    const detailPrice = $("watch-detail-price");
    const symbol = (payload && payload.symbol) || selectedChartSymbol();
    const pair = (payload && payload.pair) || PUBLIC_PAIRS[symbol] || "—";
    const tf = (payload && payload.timeframe) || selectedChartTimeframe();
    if (title) title.textContent = `${symbol} · ${tf}`;
    if (subtitle) {
      subtitle.textContent = payload && payload.ok
        ? `公開参照 ${pair} · ${payload.note || "数秒ごとに更新"}`
        : ((payload && payload.error) || "チャート未取得");
    }
    if (source) {
      source.textContent = payload && payload.ok
        ? `source ${payload.source || "—"} · ${symbol} · ${tf} · bars ${(payload.bars || []).length}`
        : `source error · ${(payload && payload.error) || "—"}`;
    }
    const last = payload && payload.last;
    const priceText = last && last.c != null
      ? Number(last.c).toLocaleString("en-US", { maximumFractionDigits: 5 })
      : "—";
    if (lastPrice) lastPrice.textContent = priceText;
    if (detailPrice) detailPrice.textContent = priceText;
    if (badge) {
      badge.textContent = payload && payload.ok ? "LIVE" : "OFF";
      badge.className = `mini-badge ${payload && payload.ok ? "active" : "standby"}`;
    }
    renderWatchlist();
  }

  async function fetchPublicChart(symbol, timeframe) {
    const pair = PUBLIC_PAIRS[symbol];
    if (!pair) {
      return {
        ok: false,
        symbol,
        timeframe,
        pair: null,
        bars: [],
        error: `公開チャート未対応: ${symbol}`,
      };
    }
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(timeframe)}&limit=120`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`chart HTTP ${res.status}`);
    const rows = await res.json();
    const bars = rows.map((row) => ({
      t: Number(row[0]),
      ts: new Date(Number(row[0])).toISOString().replace(".000", ""),
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
      v: Number(row[5]),
    }));
    return {
      ok: true,
      symbol,
      timeframe,
      source: "binance_public_browser",
      pair,
      note: "ブラウザ直接 · ブローカー価格とはスプレッド差あり",
      bars,
      last: bars[bars.length - 1] || null,
      ts: new Date().toISOString().replace(".000", ""),
    };
  }

  async function refreshChart(snap) {
    const timeframe = selectedChartTimeframe();
    const base = snap || latestSnap || {};
    const symbols = paneSymbols();
    const empty = $("chart-empty");
    let anyOk = false;
    await Promise.all(symbols.map(async (symbol) => {
      try {
        const live = await fetchPublicChart(symbol, timeframe);
        if (live.ok) anyOk = true;
        applyPanePayload(symbol, live, base);
      } catch (error) {
        if (symbol === selectedChartSymbol() && base.chart) {
          applyPanePayload(symbol, base.chart, base);
          anyOk = true;
          return;
        }
        applyPanePayload(symbol, {
          ok: false,
          symbol,
          timeframe,
          bars: [],
          error: error.message,
        }, base);
      }
    }));
    if (empty) empty.hidden = anyOk;
    renderWatchlist();
  }

  function renderSummary(snap) {
    const system = snap.system || {};
    const live = snap.live || {};
    const risk = live.risk || {};
    const bridgeOnline = !remoteMode || Boolean(snap.remote && snap.remote.bridge_online);
    const overall = bridgeOnline ? (system.overall || "degraded") : "degraded";

    $("sum-system").textContent = statusLabel(overall);
    $("sum-system").className = `stat ${overall === "active" || overall === "ready" ? "good" : overall === "blocked" || overall === "degraded" ? "bad" : "warn"}`;

    $("sum-live").textContent = live.ok ? "ACTIVE" : statusLabel(live.mode || "standby");
    $("sum-live").className = `stat ${live.ok ? "good" : live.kill_switch ? "bad" : "muted"}`;

    $("sum-ai").textContent = snap.ai_alive ? "ALIVE" : "UNAVAILABLE";
    $("sum-ai").className = `stat ${snap.ai_alive ? "good" : "bad"}`;

    const riskBlocked = Boolean(live.kill_switch || risk.account_blocked);
    $("sum-risk").textContent = riskBlocked ? "BLOCKED" : "CLEAR";
    $("sum-risk").className = `stat ${riskBlocked ? "bad" : "good"}`;

    const learnText = snap.runtime_learning_applied
      ? "APPLIED"
      : snap.learning_feedback_ready ? "MODEL ONLY" : "STANDBY";
    $("sum-learn").textContent = learnText;
    $("sum-learn").className = `stat ${snap.runtime_learning_applied ? "good" : "warn"}`;

    systemPill.textContent = `SYSTEM ${statusLabel(overall)}`;
    systemPill.className = `pill ${overall}`;
    $("clock").textContent = remoteMode && snap.remote
      ? `${snap.ts || "—"} · bridge ${snap.remote.age_sec == null ? "—" : `${snap.remote.age_sec}s`}`
      : (snap.ts || "—");
    $("footer-ts").textContent = snap.ts || "—";

    if (remoteMode && !bridgeOnline) {
      actionMsg.textContent = "トレード端末とのブリッジが停止または古くなっています";
    } else if (remoteMode && snap.remote && Array.isArray(snap.remote.commands)) {
      const active = snap.remote.commands.find((command) =>
        command.status === "pending" || command.status === "running");
      if (active) {
        actionMsg.textContent = `${active.action} · ${active.status}`;
      }
    }
  }

  function renderPipeline(snap) {
    const layers = (snap.system && snap.system.layers) || [];
    $("pipeline").innerHTML = layers.map((stage, index) => `
      <article class="stage">
        <span class="stage-status ${esc(stage.status)}">${esc(statusLabel(stage.status))}</span>
        <h4>${String(index + 1).padStart(2, "0")} · ${esc(stage.name)}</h4>
        <p>${esc(stage.purpose)}</p>
        <code>${esc(stage.source)}</code>
      </article>
    `).join("");
  }

  function renderOperations(snap) {
    const live = snap.live || {};
    const hb = live.heartbeat || {};
    const risk = live.risk || {};
    const counts = live.counts || {};
    const recent = live.recent || {};

    $("live-badge").textContent = statusLabel(live.mode || "standby");
    $("live-badge").className = `mini-badge ${live.mode || "standby"}`;
    $("live-metrics").innerHTML = [
      metricTile("heartbeat", fmtTs(live.heartbeat_ts)),
      metricTile("age", live.heartbeat_age_sec == null ? "—" : `${live.heartbeat_age_sec}s`),
      metricTile("symbol", hb.symbol || "—"),
      metricTile("runner status", hb.status || live.reason || "—"),
      metricTile("last bar", hb.last_bar_ts || "—"),
      metricTile("mode", hb.shadow === true ? "SHADOW" : hb.dry_run === true ? "DRY RUN" : hb.dry_run === false ? "LIVE" : "—"),
    ].join("");

    const blocked = Boolean(live.kill_switch || risk.account_blocked);
    $("risk-badge").textContent = blocked ? "BLOCKED" : "CLEAR";
    $("risk-badge").className = `mini-badge ${blocked ? "blocked" : "active"}`;
    $("risk-metrics").innerHTML = [
      metricTile("kill switch", live.kill_switch ? "ON" : "off", live.kill_switch ? "bad" : "good"),
      metricTile("account gate", risk.account_blocked ? "BLOCKED" : "clear", risk.account_blocked ? "bad" : "good"),
      metricTile("daily P/L", fmtPct(risk.daily_loss), Number(risk.daily_loss) < 0 ? "bad" : ""),
      metricTile("drawdown", fmtPct(risk.drawdown), Number(risk.drawdown) < 0 ? "bad" : ""),
      metricTile("equity", fmtMoney(risk.equity)),
      metricTile("balance", fmtMoney(risk.balance)),
    ].join("");

    $("ledger-counts").innerHTML = [
      ["decisions", counts.decisions],
      ["orders", counts.orders],
      ["fills", counts.fills],
      ["risk events", counts.risk_events],
      ["states", counts.states],
    ].map(([key, value]) => `
      <div class="count-tile"><span class="k">${esc(key)}</span><span class="v">${esc(value == null ? 0 : value)}</span></div>
    `).join("");

    $("presets").innerHTML = (snap.presets || []).map((preset) => `
      <article class="preset">
        <h4>${esc(preset.name)} · ${esc(preset.strategy)}</h4>
        <p>${esc(preset.symbols.join(", "))} / ${esc(preset.timeframe)} / ${esc(preset.broker)}</p>
        <p>max lots ${esc(preset.max_lots)} · daily ${esc(fmtPct(preset.max_daily_loss))} · MDD ${esc(fmtPct(preset.max_drawdown))}</p>
      </article>
    `).join("");

    const decisions = recent.decisions || [];
    $("decisions-table").querySelector("tbody").innerHTML = decisions.length
      ? decisions.map((row) => {
        const p = row.payload || {};
        return `<tr>
          <td>${esc(fmtTs(row.ts))}</td>
          <td>${esc(row.symbol)}</td>
          <td>${esc(fmtPct(row.target_fraction))}</td>
          <td>${esc(p.blocked ? "blocked" : p.abstain ? "abstain" : "trade")}</td>
        </tr>`;
      }).join("")
      : emptyRows(4, "ライブ判断はまだ記録されていません");

    const orders = recent.orders || [];
    $("orders-table").querySelector("tbody").innerHTML = orders.length
      ? orders.map((row) => `<tr>
          <td>${esc(fmtTs(row.ts))}</td>
          <td>${esc(row.symbol)}</td>
          <td>${esc(row.action)}</td>
          <td>${esc(row.status)}</td>
        </tr>`).join("")
      : emptyRows(4, "注文はまだ記録されていません");

    const fills = recent.fills || [];
    $("fills-table").querySelector("tbody").innerHTML = fills.length
      ? fills.map((row) => `<tr>
          <td>${esc(fmtTs(row.ts))}</td>
          <td>${esc(row.symbol)}</td>
          <td>${esc(row.side)}</td>
          <td>${esc(fmtNum(row.price, 5))}</td>
        </tr>`).join("")
      : emptyRows(4, "約定はまだ記録されていません");

    const events = recent.risk_events || [];
    $("risk-events").innerHTML = events.length
      ? events.map((event) => `
        <div class="event-item">
          <span>${esc(fmtTs(event.ts))}</span>
          <strong>${esc(event.event_type)}</strong>
          <span>${esc(JSON.stringify(event.payload || {}))}</span>
        </div>`).join("")
      : `<p class="empty">リスクイベントはありません</p>`;
  }

  function renderKai(snap) {
    const badge = $("kai-badge");
    const metrics = $("kai-metrics");
    const modelView = $("kai-model");
    if (!badge || !metrics || !modelView) return;

    const kai = snap.kai || {};
    currentKai = kai;
    syncKaiButtons();
    if (!kai.ok) {
      badge.textContent = statusLabel(kai.mode || "standby");
      badge.className = `mini-badge ${kai.mode === "error" ? "error" : "standby"}`;
      metrics.innerHTML = [
        metricTile("control", kai.control_url || "127.0.0.1:8790"),
        metricTile("status", kai.mode || "not configured"),
      ].join("");
      modelView.textContent = kai.message || kai.error || "kai.control は未起動です";
      return;
    }

    const counts = kai.counts || {};
    const champion = kai.champion;
    const candidate = kai.latest_candidate;
    badge.textContent = champion ? "ACTIVE" : (counts.compute_runs ? "COLLECTING" : "STANDBY");
    badge.className = `mini-badge ${champion ? "active" : counts.compute_runs ? "ready" : "standby"}`;
    metrics.innerHTML = [
      metricTile("active consents", counts.active_consents || 0),
      metricTile("compute runs", counts.compute_runs || 0),
      metricTile("learning packs", counts.learning_packs || 0),
      metricTile("model versions", counts.model_versions || 0),
      metricTile("predictions", counts.predictions || 0),
    ].join("");
    const latest = kai.latest_prediction || {};
    const rows = [
      champion
        ? `champion ${champion.version} · dataset ${champion.dataset_manifest_id}`
        : "champion —",
      candidate
        ? `candidate ${candidate.version} · AUC ${fmtNum(candidate.metrics && candidate.metrics.roc_auc, 4)}`
        : "candidate —",
      `latest OOM=${latest.oom_probability == null ? "—" : fmtPct(latest.oom_probability)} · ${latest.recommendation || "—"}`,
    ];
    modelView.textContent = rows.join("\n");
    const promote = $("btn-kai-promote");
    if (promote) promote.dataset.modelId = candidate ? candidate.id : "";

    const message = $("kai-action-msg");
    const commands = (snap.remote && snap.remote.commands) || [];
    const latestKaiCommand = commands.find((command) =>
      String(command.action || "").startsWith("kai_"));
    if (message && latestKaiCommand) {
      message.textContent = latestKaiCommand.error
        ? `${latestKaiCommand.action}: ${latestKaiCommand.error}`
        : `${latestKaiCommand.action} · ${latestKaiCommand.status}`;
    }
  }

  function renderTrading(snap) {
    const badge = $("trading-badge");
    const metrics = $("trading-metrics");
    const detail = $("trading-detail");
    const statusLabelEl = $("trade-status-label");
    const statusSub = $("trade-status-sub");
    const buyStatus = $("buy-status");
    if (!badge || !statusLabelEl) return;
    const trading = snap.trading || {};
    const live = snap.live || {};
    const kill = Boolean(trading.kill_switch || live.kill_switch);
    let label = "STOPPED";
    let klass = "stopped";
    let sub = "未起動";
    let modeClass = "mode-stopped";
    if (kill) {
      label = "KILL";
      klass = "kill";
      sub = "停止中 · 解除後に再開";
      modeClass = "mode-kill";
    } else if (trading.running) {
      if (isShadowRunner(trading)) {
        label = "SHADOW";
        klass = "shadow";
        modeClass = "mode-shadow";
      } else if (trading.dry_run) {
        label = "DRY RUN";
        klass = "dry";
        modeClass = "mode-dry";
      } else {
        label = "LIVE";
        klass = "live";
        modeClass = "mode-live";
      }
      sub = `${(trading.symbols || []).join(",") || "—"}`;
    }
    statusLabelEl.textContent = label;
    statusLabelEl.className = `trade-status compact ${klass}`;
    if (statusSub) statusSub.textContent = sub;
    if (buyStatus) {
      buyStatus.className = `buy-status ${modeClass}`;
      buyStatus.classList.toggle("live-armed", $("trade-mode").value === "live" && isLiveArmed());
    }
    badge.textContent = label;
    badge.className = `mini-badge mode-${klass === "stopped" ? "stopped" : klass === "kill" ? "kill" : klass === "shadow" ? "shadow" : klass === "dry" ? "dry" : "live"}`;
    const runChip = $("run-chip");
    if (runChip) {
      const chipClass = klass === "dry" || klass === "shadow" || klass === "live" || klass === "kill"
        ? klass
        : "stopped";
      runChip.textContent = label;
      runChip.className = `run-chip ${chipClass}`;
    }

    renderEssentialStatus(snap);
    renderStopStrip(trading, kill);

    if (metrics) {
      metrics.textContent = "";
    }
    if (detail) {
      detail.textContent = [
        `symbols=${(trading.symbols || []).join(",") || "—"} · tf=${trading.timeframe || "—"}`,
        `started=${trading.started_at || "—"} · last=${trading.last_action || "—"}`,
        `kill_ack=${trading.kill_acked_at || "—"} · flatten=${flattenStatusLabel(trading)}`,
      ].join("\n");
    }

    const message = $("trading-action-msg");
    const commands = (snap.remote && snap.remote.commands) || [];
    const latestTrade = commands.find((command) =>
      String(command.action || "").startsWith("trade_"));
    if (message && latestTrade) {
      const prog = progressText(latestTrade);
      message.textContent = latestTrade.error
        ? `${latestTrade.action}: ${latestTrade.error}`
        : `${latestTrade.action} · ${latestTrade.status}${prog ? ` · ${prog}` : ""}`;
    }

    tradeRunning = Boolean(trading.running);
    syncBuyCta();
    const dryBtn = $("btn-trade-dry");
    const shadowBtn = $("btn-trade-shadow");
    if (dryBtn) dryBtn.disabled = tradeRunning;
    if (shadowBtn) shadowBtn.disabled = tradeRunning;
    const liveBtn = $("btn-trade-live");
    if (liveBtn) liveBtn.disabled = tradeRunning || !isLiveArmed();
  }

  function renderModels(snap) {
    const models = (snap.models && snap.models.models) || [];
    $("models").innerHTML = models.map((model) => `
      <div class="model-card ${model.exists ? "on" : "off"}">
        <div class="name">${esc(model.name)}</div>
        <div class="mono">${model.exists ? "READY" : "MISSING"}</div>
        <div class="meta">${esc(model.path)} · ${esc(model.bytes)} B · ${esc(model.age || "—")}</div>
      </div>
    `).join("");

    const probe = snap.probe || {};
    if (probe.error) {
      $("probe").textContent = `probe error: ${probe.error}`;
      return;
    }
    if (probe.skipped) {
      $("probe").textContent = "probe skipped";
      return;
    }
    const latest = probe.latest || {};
    $("probe").textContent = [
      `lightgbm ${probe.lightgbm_version || "?"} · probe ${probe.ok ? "OK" : "FAIL"}`,
      `P(up)=${fmtPct(latest.lgbm_probability)} · E[r]=${fmtPct(latest.lgbm_expected_return, 4)}`,
      `direction=${latest.lgbm_ready} · return=${latest.lgbm_return_ready}`,
    ].join("\n");
  }

  function renderRetrain(snap) {
    const last = snap.last_retrain;
    if (!last) {
      $("retrain").innerHTML = `<p class="empty">再学習評価はまだありません</p>`;
      return;
    }
    const direction = (last.metrics && last.metrics.direction) || {};
    const returns = (last.metrics && last.metrics.returns) || {};
    const rows = [
      ["timestamp", last.ts],
      ["dataset", `${last.source} · ${last.n_bars} bars · horizon ${last.horizon}`],
      ["direction", `${direction.status || "—"} · AUC ${fmtNum(direction.val_auc, 4)} · logloss ${fmtNum(direction.val_logloss, 4)}`],
      ["magnitude", `${returns.status || "—"} · MAE ${fmtNum(returns.val_mae, 6)}`],
      ["split", `${direction.n_train || "—"} train / ${direction.n_val || "—"} validation`],
      ["elapsed", `${last.elapsed_sec}s`],
    ];
    $("retrain").innerHTML = rows.map(([key, value]) => `
      <div class="metric-row"><div class="k">${esc(key)}</div><div class="v">${esc(value)}</div></div>
    `).join("");
  }

  function renderLearning(snap) {
    const learning = snap.learning || {};
    const badge = $("learn-badge");
    if (!learning.available) {
      badge.textContent = "NO LEDGER";
      badge.className = "mini-badge standby";
      $("learning").innerHTML = `<p class="empty">${esc(learning.message || learning.error || learning.reason || "学習台帳なし")}</p>`;
      return;
    }

    badge.textContent = learning.has_applied_state ? "APPLIED" : "CANDIDATE";
    badge.className = `mini-badge ${learning.has_applied_state ? "active" : "ready"}`;
    const report = learning.report || {};
    const lessons = report.lessons || [];
    const candidate = learning.candidate_params || {};
    const applied = learning.learned_params || {};
    const pending = learning.pending_changes || {};
    const params = Object.entries(candidate).map(([key, value]) => {
      const changed = Object.hasOwn(pending, key);
      const appliedValue = Object.hasOwn(applied, key) ? applied[key] : "未反映";
      return `<div class="param ${changed ? "changed" : ""}">
        <span class="k">${esc(key)}</span>
        <span class="v">${esc(value)}</span>
        <span class="delta">${changed ? `applied: ${esc(appliedValue)}` : "反映済み"}</span>
      </div>`;
    }).join("");

    $("learning").innerHTML = `
      <div class="learning-layout">
        <div>
          <p class="mono muted">decisions=${esc(report.n_decisions || 0)} · orders=${esc(report.n_orders || 0)} · fills=${esc(report.n_fills || 0)} · noop=${esc(fmtPct(report.noop_rate))} · churn=${esc(fmtNum(report.churn_score, 2))}</p>
          <ul class="lessons">${lessons.map((lesson) => `<li>${esc(lesson)}</li>`).join("")}</ul>
        </div>
        <div class="params">${params}</div>
      </div>`;
  }

  function renderDiagnose(snap) {
    const diag = snap.last_diagnose;
    $("explain").textContent = diag && diag.explain ? diag.explain : "診断未実行";
    const rows = diag && Array.isArray(diag.rows) ? diag.rows : [];
    $("diag-table").querySelector("tbody").innerHTML = rows.length
      ? rows.map((row) => `<tr>
          <td>${esc(row.ts)}</td>
          <td>${esc(fmtPct(row.ai_probability))}</td>
          <td>${esc(fmtPct(row.ai_expected_return, 4))}</td>
          <td>${esc(fmtNum(row.score, 3))}</td>
          <td>${esc(row.entry ? "YES" : "no")}</td>
          <td>${esc(row.regime)}</td>
        </tr>`).join("")
      : emptyRows(6, "診断サンプルはまだありません");
  }

  function renderHistory(snap) {
    const rows = snap.retrain_history || [];
    $("history").innerHTML = rows.length
      ? rows.map((row) => {
        const direction = (row.metrics && row.metrics.direction) || {};
        const returns = (row.metrics && row.metrics.returns) || {};
        return `<div class="hist-item">
          ${esc(fmtTs(row.ts))}<br>
          ${esc(row.source)} · ${esc(row.n_bars)} bars · AUC ${esc(fmtNum(direction.val_auc, 4))} · MAE ${esc(fmtNum(returns.val_mae, 6))}
        </div>`;
      }).join("")
      : `<p class="empty">再学習履歴はありません</p>`;
  }

  function renderArchitecture(snap) {
    const system = snap.system || {};
    const truth = system.source_of_truth || [];
    $("truth-table").querySelector("tbody").innerHTML = truth.map((row) => `<tr>
      <td>${esc(row.domain)}</td><td>${esc(row.store)}</td><td>${esc(row.owner)}</td>
    </tr>`).join("");
    $("limits").innerHTML = (system.limits || []).map((limit) => `<li>${esc(limit)}</li>`).join("");
  }

  function render(snap) {
    latestSnap = snap;
    renderSummary(snap);
    renderPipeline(snap);
    renderOperations(snap);
    renderBroker(snap);
    renderTrading(snap);
    renderKai(snap);
    renderModels(snap);
    renderRetrain(snap);
    renderLearning(snap);
    renderDiagnose(snap);
    renderHistory(snap);
    renderArchitecture(snap);
    refreshChart(snap);
    extendBurstIfActive(snap);
  }

  async function refresh({ silent = false } = {}) {
    if (!silent) setBusy(true, "更新中…");
    try {
      render(await api(endpoint("/status")));
      if (!silent) setBusy(false, "更新完了");
    } catch (error) {
      if (!silent) setBusy(false, `エラー: ${error.message}`);
      systemPill.textContent = "SYSTEM ERROR";
      systemPill.className = "pill degraded";
    }
  }

  $("btn-refresh").onclick = () => refresh();

  async function runAction({ action, localPath, payload = {} }) {
    const result = remoteMode
      ? await api(endpoint("/command"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, payload }),
        })
      : await api(endpoint(localPath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    if (result.queued) {
      setBusy(false, `${action} を端末の実行キューへ登録しました · 反映監視中`);
      startBurstPoll(60);
      return false;
    }
    return true;
  }

  let burstTimer = null;
  let burstUntil = 0;

  function startBurstPoll(seconds) {
    burstUntil = Date.now() + Math.max(5, Number(seconds) || 45) * 1000;
    if (burstTimer) return;
    burstTimer = setInterval(() => {
      if (Date.now() > burstUntil) {
        clearInterval(burstTimer);
        burstTimer = null;
        return;
      }
      refresh({ silent: true });
    }, 1500);
  }

  function extendBurstIfActive(snap) {
    if (!remoteMode || !snap || !snap.remote || !Array.isArray(snap.remote.commands)) {
      return;
    }
    const active = snap.remote.commands.some(
      (command) => command.status === "pending" || command.status === "running",
    );
    if (active) startBurstPoll(30);
  }

  $("btn-kai-train").onclick = async () => {
    const message = $("kai-action-msg");
    setBusy(true, "kai[解] 候補学習を開始…");
    try {
      const completed = await runAction({
        action: "kai_train",
        localPath: "/kai/train",
      });
      if (!completed) {
        message.textContent = "候補学習を端末キューへ登録しました";
        return;
      }
      render(await api(endpoint("/status")));
      setBusy(false, "kai[解] candidateを作成しました");
      message.textContent = "candidate作成完了。評価後に人間昇格してください";
    } catch (error) {
      setBusy(false, `kai学習失敗: ${error.message}`);
      message.textContent = error.message;
    }
  };

  $("btn-kai-promote").onclick = async () => {
    const message = $("kai-action-msg");
    const modelId = $("btn-kai-promote").dataset.modelId;
    const approvedBy = $("kai-approved-by").value.trim();
    if (!modelId || !approvedBy) {
      message.textContent = "昇格対象candidateと承認者が必要です";
      return;
    }
    setBusy(true, "kai[解] candidateを昇格中…");
    try {
      const completed = await runAction({
        action: "kai_promote",
        localPath: "/kai/promote",
        payload: { model_id: modelId, approved_by: approvedBy },
      });
      if (!completed) {
        message.textContent = "人間昇格を端末キューへ登録しました";
        return;
      }
      render(await api(endpoint("/status")));
      setBusy(false, "kai[解] championを更新しました");
      message.textContent = "champion昇格完了";
    } catch (error) {
      setBusy(false, `kai昇格失敗: ${error.message}`);
      message.textContent = error.message;
    }
  };

  $("kai-predict-form").onsubmit = async (event) => {
    event.preventDefault();
    const message = $("kai-action-msg");
    const payload = {
      gpu_memory_mb: Number($("kai-gpu-memory").value),
      requested_memory_mb: Number($("kai-requested-memory").value),
      batch_size: Number($("kai-batch-size").value),
      sequence_length: Number($("kai-sequence-length").value),
      model_parameters_billion: Number($("kai-parameters").value),
      gpu_count: Number($("kai-gpu-count").value),
      precision: $("kai-precision").value,
    };
    setBusy(true, "kai[解] OOMリスクを予測中…");
    try {
      const completed = await runAction({
        action: "kai_predict",
        localPath: "/kai/predict",
        payload,
      });
      if (!completed) {
        message.textContent = "OOM予測を端末キューへ登録しました";
        return;
      }
      render(await api(endpoint("/status")));
      setBusy(false, "kai[解] OOM予測を記録しました");
      message.textContent = "予測完了";
    } catch (error) {
      setBusy(false, `kai予測失敗: ${error.message}`);
      message.textContent = error.message;
    }
  };

  $("btn-retrain").onclick = async () => {
    setBusy(true, "再学習中…");
    try {
      const completed = await runAction({
        action: "retrain",
        localPath: "/retrain",
        payload: { source: "synthetic", n_bars: 800 },
      });
      if (!completed) return;
      render(await api(endpoint("/status")));
      setBusy(false, "再学習完了。評価指標とモデル鮮度を更新しました");
    } catch (error) {
      setBusy(false, `再学習失敗: ${error.message}`);
    }
  };

  $("btn-diagnose").onclick = async () => {
    setBusy(true, "診断実行中…");
    try {
      const completed = await runAction({
        action: "diagnose",
        localPath: "/diagnose",
        payload: { n_bars: 500 },
      });
      if (!completed) return;
      render(await api(endpoint("/status")));
      setBusy(false, "診断完了。AIブレンド結果を反映しました");
    } catch (error) {
      setBusy(false, `診断失敗: ${error.message}`);
    }
  };

  $("btn-learn").onclick = async () => {
    setBusy(true, "台帳学習を反映中…");
    try {
      if (remoteMode) {
        const completed = await runAction({
          action: "apply_learning",
          localPath: "/learning/apply",
        });
        if (!completed) return;
      }
      const result = remoteMode
        ? { result: { available: true } }
        : await api(endpoint("/learning/apply"), { method: "POST" });
      if (!result.result || !result.result.available) {
        throw new Error((result.result && result.result.message) || "ライブ台帳がありません");
      }
      render(await api(endpoint("/status")));
      setBusy(false, "候補パラメータをkv_stateへ反映しました（ライブ適用は次回起動時）");
    } catch (error) {
      setBusy(false, `学習反映失敗: ${error.message}`);
    }
  };

  function tradePayload(extra = {}) {
    const mode = $("trade-mode").value || "dry_run";
    const payload = {
      mode,
      preset: $("trade-preset").value,
      symbols: $("trade-symbols").value.trim(),
      max_lots: Number($("trade-max-lots").value),
      ...extra,
    };
    if (mode === "live") {
      payload.confirm = $("trade-confirm").value.trim();
      const approvalEl = $("trade-approval");
      if (approvalEl) payload.approval_token = approvalEl.value.trim();
    }
    return payload;
  }

  async function startTrade(mode) {
    const message = $("trading-action-msg");
    setTradeMode(mode);
    const payload = tradePayload({ mode });
    if (mode === "live") {
      const confirm = $("trade-confirm").value.trim();
      if (confirm !== LIVE_CONFIRM) {
        message.textContent = `LIVE開始には確認文 ${LIVE_CONFIRM} を入力してください`;
        showView("trade");
        $("trade-confirm").focus();
        return;
      }
      payload.confirm = confirm;
      const approval = ($("trade-approval") && $("trade-approval").value.trim()) || "";
      if (approval.length < 16) {
        message.textContent = "LIVE開始には approval_token（16文字以上）が必要です";
        showView("trade");
        if ($("trade-approval")) $("trade-approval").focus();
        return;
      }
      payload.approval_token = approval;
    }
    setBusy(
      true,
      mode === "live" ? "LIVE取引を開始…"
        : mode === "shadow" ? "Shadow（発注なし）を開始…"
          : "ドライランを開始…"
    );
    try {
      const completed = await runAction({
        action: "trade_start",
        localPath: "/trade/start",
        payload,
      });
      if (!completed) {
        message.textContent = "取引開始を端末キューへ登録しました";
        return;
      }
      if (mode === "live") clearSecretInputs();
      render(await api(endpoint("/status")));
      const startedMsg = mode === "live"
        ? "LIVE取引を開始しました"
        : mode === "shadow"
          ? "Shadow（発注なし）を開始しました"
          : "ドライランを開始しました";
      setBusy(false, startedMsg);
      message.textContent = mode === "shadow" ? "Shadow開始OK" : "開始OK";
      showView("trade");
    } catch (error) {
      setBusy(false, `取引開始失敗: ${error.message}`);
      message.textContent = error.message;
    }
  }

  $("btn-trade-dry").onclick = () => startTrade("dry_run");
  $("btn-trade-shadow").onclick = () => startTrade("shadow");
  $("btn-trade-live").onclick = () => startTrade("live");

  if ($("btn-market-promote")) {
    $("btn-market-promote").onclick = async () => {
      const message = $("trading-action-msg") || $("action-msg");
      if (!remoteMode) {
        if (message) message.textContent = "昇格は公開デスク（bridge）経由で実行してください";
        return;
      }
      const candidateId = ($("market-candidate-id") && $("market-candidate-id").value.trim()) || "";
      const approvedBy = ($("market-approved-by") && $("market-approved-by").value.trim()) || "";
      const approval = ($("market-approval") && $("market-approval").value.trim()) || "";
      if (!candidateId || !approvedBy) {
        if (message) message.textContent = "候補IDと承認者が必要です";
        return;
      }
      if (approval.length < 16) {
        if (message) message.textContent = "昇格には承認トークン（16文字以上）が必要です";
        if ($("market-approval")) $("market-approval").focus();
        return;
      }
      setBusy(true, "取引モデルを昇格中…");
      try {
        const completed = await runAction({
          action: "market_promote",
          localPath: "/kai/promote",
          payload: {
            candidate_id: candidateId,
            approved_by: approvedBy,
            approval_token: approval,
          },
        });
        if ($("market-approval")) $("market-approval").value = "";
        if (!completed) {
          if (message) message.textContent = "昇格を端末キューへ登録しました";
          return;
        }
        render(await api(endpoint("/status")));
        setBusy(false, "昇格完了");
        if (message) message.textContent = "取引モデル昇格OK";
      } catch (error) {
        if ($("market-approval")) $("market-approval").value = "";
        setBusy(false, `昇格失敗: ${error.message}`);
        if (message) message.textContent = error.message;
      }
    };
  }

  $("btn-trade-stop").onclick = async () => {
    const message = $("trading-action-msg");
    setBusy(true, "緊急停止中…");
    try {
      const completed = await runAction({
        action: "trade_stop",
        localPath: "/trade/stop",
        payload: { reason: "remote_ui_stop" },
      });
      if (!completed) {
        message.textContent = "緊急停止を端末キューへ登録しました";
        return;
      }
      render(await api(endpoint("/status")));
      setBusy(false, "KILL_SWITCHを立てました（停止要求済・建玉0確認は別）");
      message.textContent = "停止要求済 (kill ack) · flattenはpending→confirmedはMT5建玉0のみ";
      showView("trade");
    } catch (error) {
      setBusy(false, `停止失敗: ${error.message}`);
      message.textContent = error.message;
    }
  };

  $("btn-trade-clear").onclick = async () => {
    const message = $("trading-action-msg");
    setBusy(true, "Kill switch解除中…");
    try {
      const completed = await runAction({
        action: "trade_clear_kill",
        localPath: "/trade/clear-kill",
      });
      if (!completed) {
        message.textContent = "Kill解除を端末キューへ登録しました";
        return;
      }
      render(await api(endpoint("/status")));
      setBusy(false, "Kill switchを解除しました");
      message.textContent = "kill cleared";
    } catch (error) {
      setBusy(false, `Kill解除失敗: ${error.message}`);
      message.textContent = error.message;
    }
  };

  $("btn-trade-inspect").onclick = async () => {
    const message = $("trading-action-msg");
    setBusy(true, "口座・銘柄を検査中…");
    try {
      const completed = await runAction({
        action: "trade_inspect",
        localPath: "/trade/inspect",
        payload: {
          dry_run: $("trade-mode").value !== "live",
          symbols: $("trade-symbols").value.trim(),
          max_lots: Number($("trade-max-lots").value),
        },
      });
      if (!completed) {
        message.textContent = "Inspectを端末キューへ登録しました";
        return;
      }
      render(await api(endpoint("/status")));
      setBusy(false, "Inspect完了");
      message.textContent = "inspect ok";
    } catch (error) {
      setBusy(false, `Inspect失敗: ${error.message}`);
      message.textContent = error.message;
    }
  };

  if ($("chart-timeframe")) {
    $("chart-timeframe").addEventListener("change", () => refreshChart(latestSnap));
  }
  if ($("trade-symbols")) {
    $("trade-symbols").addEventListener("change", () => refreshChart(latestSnap));
  }
  window.addEventListener("resize", () => {
    if (lastChart) applyChartPayload(lastChart, latestSnap || {});
  });

  function schedulePolling() {
    if (statusTimer) clearInterval(statusTimer);
    if (chartTimer) clearInterval(chartTimer);
    statusTimer = setInterval(() => refresh({ silent: true }), 10000);
    chartTimer = setInterval(() => refreshChart(latestSnap), 5000);
  }

  refresh();
  schedulePolling();
})();
