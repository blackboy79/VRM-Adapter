(function () {
  const socket = io();
  const instance = "victron-vrm-dashboard.0";

  const ids = {
    activeImageUrl: `${instance}.dashboard.activeImageUrl`,
    temperature: `${instance}.dashboard.temperature`,
    lux: `${instance}.dashboard.lux`,
    dateTime: `${instance}.dashboard.dateTime`,

    pvTotal: `${instance}.dashboard.pv_total`,
    pvToday: `${instance}.dashboard.pv_today`,
    pvStringsJson: `${instance}.dashboard.pvStringsJson`,

    housePower: `${instance}.dashboard.house_power`,
    houseToday: `${instance}.dashboard.house_today`,

    gridImport: `${instance}.dashboard.grid_import_power`,
    gridExport: `${instance}.dashboard.grid_export_power`,
    gridNet: `${instance}.dashboard.grid_net_power`,

    batterySoc: `${instance}.dashboard.battery_soc`,
    batteryPower: `${instance}.dashboard.battery_power`,
    batteryVoltage: `${instance}.dashboard.battery_voltage`,
    batteryCurrent: `${instance}.dashboard.battery_current`,
    batteryTemperature: `${instance}.dashboard.battery_temperature`,
    batteryTimeRemaining: `${instance}.dashboard.battery_time_remaining`,

    consumersJson: `${instance}.dashboard.consumersJson`,
    cardsJson: `${instance}.dashboard.cardsJson`,
  };

  const el = (id) => document.getElementById(id);

  const fmtW = (v) =>
    `${Math.round(Number(v || 0)).toLocaleString("de-DE")} W`;

  const fmtK = (v) =>
    `${Number(v || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} kWh`;

  const fmtV = (v) =>
    `${Number(v || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} V`;

  const fmtA = (v) =>
    `${Number(v || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} A`;

  const fmtC = (v) =>
    `${Number(v || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} °C`;

  function iconEmoji(n) {
    switch ((n || "").toLowerCase()) {
      case "house":
        return "🏠";
      case "heatpump":
        return "♨️";
      case "car":
        return "🚗";
      case "ev":
        return "🔌";
      case "water":
        return "💧";
      case "pool":
        return "🏊";
      case "boiler":
        return "🔥";
      default:
        return "🔌";
    }
  }

  function setText(id, v) {
    const n = el(id);
    if (n) n.textContent = v;
  }

  function ring(soc) {
    const c = el("batteryRing");
    if (!c) return;

    const r = 50;
    const circ = 2 * Math.PI * r;
    const x = Math.max(0, Math.min(100, Number(soc || 0)));

    c.style.strokeDasharray = String(circ);
    c.style.strokeDashoffset = String(circ - (x / 100) * circ);
  }

  function renderPvStrings(json) {
    const root = el("pvStringsGrid");
    if (!root) return;

    root.innerHTML = "";

    let list = [];
    try {
      list = JSON.parse(json || "[]");
    } catch (e) {
      list = [];
    }

    const active = Array.isArray(list)
      ? list.filter((x) => x && x.enabled)
      : [];

    if (active.length === 0) {
      root.innerHTML = "";
      return;
    }

    active.forEach((s) => {
      const item = document.createElement("div");
      item.className = "pvStringItem";
      item.innerHTML = `
        <span class="pvStringName">${s.name || "PV String"}</span>
        <span class="pvStringValue">${fmtW(s.power)}</span>
      `;
      root.appendChild(item);
    });
  }

  function renderConsumers(list) {
    const root = el("consumersGrid");
    if (!root) return [];

    root.innerHTML = "";

    const active = Array.isArray(list)
      ? list.filter((x) => x && x.enabled)
      : [];

    setText("consumerCount", `${active.length} aktiv`);

    active.forEach((c) => {
      const d = document.createElement("div");
      d.className = "consumer";
      d.style.borderColor = c.color || "rgba(255,255,255,.08)";
      d.innerHTML = `
        <div class="icon">${iconEmoji(c.icon)}</div>
        <div class="name">${c.name || "Verbraucher"}</div>
        <div class="power">${fmtW(c.power)}</div>
        <div class="today">Verbrauch heute ${fmtK(c.today)}</div>
        <div class="yesterday">Verbrauch gestern ${fmtK(c.yesterday)}</div>
      `;
      root.appendChild(d);
    });

    return active;
  }

  function updateGridDirection(gridNet) {
    const node = el("gridDirection");
    if (!node) return;

    const n = Number(gridNet || 0);
    node.classList.remove("red", "green");

    if (n > 0) {
      node.textContent = `${fmtW(n)} Bezug`;
      node.classList.add("red");
    } else if (n < 0) {
      node.textContent = `${fmtW(Math.abs(n))} Einspeisung`;
      node.classList.add("green");
    } else {
      node.textContent = "0 W";
    }
  }

  function updateHouseConsumers(activeConsumers) {
    const node = el("houseConsumers");
    if (!node) return;

    if (!Array.isArray(activeConsumers) || activeConsumers.length === 0) {
      node.innerHTML = "Keine Verbraucher aktiv";
      return;
    }

    const lines = activeConsumers
      .slice(0, 4)
      .map((c) => `${c.name || "Verbraucher"} ${fmtW(c.power)}`)
      .join("<br>");

    node.innerHTML = lines;
  }

  function flow(gridNet, pvPower) {
    const left = el("lineGrid");
    const right = el("lineHouse");
    const top = el("pvFlowTop");

    if (left) {
      left.classList.remove("import", "export");
      left.style.display = "block";

      const n = Number(gridNet || 0);
      if (n > 1) {
        left.classList.add("import");
      } else if (n < -1) {
        left.classList.add("export");
      } else {
        left.style.background = "rgba(255,255,255,0.12)";
      }
    }

    if (right) {
      right.classList.add("activeHouse");
    }

    if (top) {
      if (Number(pvPower || 0) > 1) {
        top.classList.add("active");
      } else {
        top.classList.remove("active");
      }
    }
  }

  function formatByUnit(value, unit) {
    const u = String(unit || "").toLowerCase();

    if (u === "w") return fmtW(value);
    if (u === "kwh") return fmtK(value);
    if (u === "v") return fmtV(value);
    if (u === "a") return fmtA(value);
    if (u === "°c" || u === "c") return fmtC(value);
    if (u === "%") return `${Math.round(Number(value || 0))}%`;
    if (u === "" || u === "text") return `${value ?? ""}`;

    return `${value ?? ""} ${unit}`;
  }

  function renderCards(json) {
    const root = el("dynamicCards");
    if (!root) return;

    root.innerHTML = "";

    let cards = [];
    try {
      cards = JSON.parse(json || "[]");
    } catch (e) {
      cards = [];
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      root.innerHTML = "";
      return;
    }

    cards.forEach((card) => {
      const div = document.createElement("div");
      div.className = "card glass";

      const rows = Array.isArray(card.rows)
        ? card.rows
            .filter((r) => r && r.label)
            .map((r) => `<div class="cardSub">${r.label} ${formatByUnit(r.value, r.unit)}</div>`)
            .join("")
        : "";

      div.innerHTML = `
        <div class="cardTitle">${card.title || "Karte"}</div>
        <div class="cardValue">${formatByUnit(card.mainValue, card.mainUnit)}</div>
        ${rows}
      `;

      root.appendChild(div);
    });
  }

  function update(states) {
    const g = (k) => (states[ids[k]] ? states[ids[k]].val : null);

    setText("dateTime", g("dateTime") || "-");
    setText("temperature", fmtC(g("temperature")));
    setText(
      "lux",
      `${Math.round(Number(g("lux") || 0)).toLocaleString("de-DE")} Lux`
    );

    setText("pvTodayTop", `PV heute ${fmtK(g("pvToday"))}`);
    setText("pvTotal", fmtW(g("pvTotal")));

    renderPvStrings(g("pvStringsJson"));

    setText("gridNet", fmtW(g("gridNet")));
    updateGridDirection(g("gridNet"));

    setText("housePower", fmtW(g("housePower")));

    setText("batterySoc", `${Math.round(Number(g("batterySoc") || 0))}%`);
    setText("batteryPower", fmtW(g("batteryPower")));
    setText("batteryVoltage", fmtV(g("batteryVoltage")));
    setText("batteryCurrent", fmtA(g("batteryCurrent")));
    setText("batteryTemperature", fmtC(g("batteryTemperature")));
    setText("batteryTimeRemaining", g("batteryTimeRemaining") || "-");

    ring(g("batterySoc"));
    flow(Number(g("gridNet") || 0), Number(g("pvTotal") || 0));

    const img = g("activeImageUrl") || "";
    if (img && el("houseImage")) {
      el("houseImage").style.backgroundImage =
        `linear-gradient(rgba(2,10,22,.25), rgba(2,10,22,.55)), url("${img}")`;
    }

    renderCards(g("cardsJson"));

    try {
      const active = renderConsumers(JSON.parse(g("consumersJson") || "[]"));
      updateHouseConsumers(active);
    } catch (e) {
      renderConsumers([]);
      updateHouseConsumers([]);
    }
  }

  socket.emit("getStates", "*", (err, res) => {
    if (err || !res) return;

    update(res);
    socket.emit("subscribeStates", `${instance}.dashboard.*`);

    socket.on("stateChange", (id, state) => {
      if (!id.startsWith(`${instance}.dashboard.`)) return;
      res[id] = state;
      update(res);
    });
  });
})();