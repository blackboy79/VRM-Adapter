"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");

class VictronVrmDashboard extends utils.Adapter {
  constructor(options) {
    super({ ...(options || {}), name: "victron-vrm-dashboard" });
    this.on("ready", this.onReady.bind(this));
    this.pollTimer = null;
  }

  async onReady() {
    await this.ensureStates();
    await this.updateAll();
    await this.pollVRM();
    this.restartTimer();
  }

  restartTimer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    const sec = Math.max(10, Number(this.config.pollIntervalSeconds || 30));
    this.pollTimer = setInterval(() => this.pollVRM(), sec * 1000);
  }

  async ensureStates() {
    const defs = [
      ["info.connection", "boolean", false, false, "VRM connected"],
      ["info.lastPoll", "string", "", false, "Last poll"],
      ["info.lastError", "string", "", false, "Last error"],
      ["raw.liveFeedJson", "string", "{}", false, "Raw live"],
      ["raw.venusJson", "string", "{}", false, "Raw venus"],
      ["raw.dayStatsJson", "string", "{}", false, "Raw day stats"],
      ["raw.yearStatsJson", "string", "{}", false, "Raw year stats"],
      ["raw.forecastJson", "string", "{}", false, "Raw forecast"],

      ["dashboard.title", "string", this.config.dashboardTitle || "Energieübersicht", false, "Title"],
      ["dashboard.subtitle", "string", this.config.dashboardSubtitle || "Victron GUI v2 Style · Live", false, "Subtitle"],
      ["dashboard.activeImageUrl", "string", "", false, "Image"],
      ["dashboard.temperature", "number", 0, false, "Temperature", "°C"],
      ["dashboard.lux", "number", 0, false, "Lux", "lx"],
      ["dashboard.dateTime", "string", "", false, "Date/time"],

      ["dashboard.pv_roof", "number", 0, false, "PV roof", "W"],
      ["dashboard.pv_facade", "number", 0, false, "PV facade", "W"],
      ["dashboard.pv_garden", "number", 0, false, "PV garden", "W"],
      ["dashboard.pv_roof_east", "number", 0, false, "PV roof east", "W"],
      ["dashboard.pv_roof_south", "number", 0, false, "PV roof south", "W"],
      ["dashboard.pv_roof_west", "number", 0, false, "PV roof west", "W"],
      ["dashboard.pv_total", "number", 0, false, "PV total", "W"],
      ["dashboard.pv_today", "number", 0, false, "PV today", "kWh"],
      ["dashboard.pvStringsJson", "string", "[]", false, "PV Strings JSON"],

      ["dashboard.house_power", "number", 0, false, "House power", "W"],
      ["dashboard.house_today", "number", 0, false, "House today", "kWh"],

      ["dashboard.grid_import_power", "number", 0, false, "Grid import", "W"],
      ["dashboard.grid_export_power", "number", 0, false, "Grid export", "W"],
      ["dashboard.grid_net_power", "number", 0, false, "Grid net", "W"],

      ["dashboard.battery_soc", "number", 0, false, "Battery SOC", "%"],
      ["dashboard.battery_power", "number", 0, false, "Battery power", "W"],
      ["dashboard.battery_voltage", "number", 0, false, "Battery voltage", "V"],
      ["dashboard.battery_current", "number", 0, false, "Battery current", "A"],
      ["dashboard.battery_temperature", "number", 0, false, "Battery temperature", "°C"],
      ["dashboard.battery_time_remaining", "string", "", false, "Battery time remaining"],

      ["dashboard.heatpump_power", "number", 0, false, "Heatpump power", "W"],
      ["dashboard.heatpump_today", "number", 0, false, "Heatpump today", "kWh"],

      ["dashboard.consumersJson", "string", "[]", false, "Consumers JSON"],
      ["dashboard.cardsJson", "string", "[]", false, "Cards JSON"],

      ["vrm.auto.pv_total", "number", 0, false, "Auto pv total", "W"],
      ["vrm.auto.grid_import_power", "number", 0, false, "Auto grid import", "W"],
      ["vrm.auto.grid_export_power", "number", 0, false, "Auto grid export", "W"],
      ["vrm.auto.grid_net_power", "number", 0, false, "Auto grid net", "W"],
      ["vrm.auto.battery_soc", "number", 0, false, "Auto battery soc", "%"],
      ["vrm.auto.battery_power", "number", 0, false, "Auto battery power", "W"],
      ["vrm.auto.battery_voltage", "number", 0, false, "Auto battery voltage", "V"],
      ["vrm.auto.battery_current", "number", 0, false, "Auto battery current", "A"],
      ["vrm.auto.house_power", "number", 0, false, "Auto house power", "W"],
      ["vrm.auto.pv_today", "number", 0, false, "Auto pv today", "kWh"],

      ["vrm.clean.pv_today", "number", 0, false, "PV today", "kWh"],
      ["vrm.clean.pv_yesterday", "number", 0, false, "PV yesterday", "kWh"],
      ["vrm.clean.pv_year", "number", 0, false, "PV year", "kWh"],

      ["vrm.clean.grid_import_today", "number", 0, false, "Grid import today", "kWh"],
      ["vrm.clean.grid_import_yesterday", "number", 0, false, "Grid import yesterday", "kWh"],

      ["vrm.clean.consumption_today", "number", 0, false, "Consumption today", "kWh"],
      ["vrm.clean.consumption_yesterday", "number", 0, false, "Consumption yesterday", "kWh"],

      ["vrm.clean.forecast_today", "number", 0, false, "Forecast today", "kWh"],
      ["vrm.clean.forecast_tomorrow", "number", 0, false, "Forecast tomorrow", "kWh"],
      ["vrm.clean.forecast_day_after_tomorrow", "number", 0, false, "Forecast day after tomorrow", "kWh"]
    ];

    for (const [id, type, def, write, name, unit] of defs) {
      const common = {
        name,
        type,
        role:
          type === "number"
            ? "value"
            : type === "boolean"
              ? "indicator.connected"
              : "text",
        read: true,
        write,
        def
      };

      if (unit) {
        common.unit = unit;
      }

      await this.setObjectNotExistsAsync(id, {
        type: "state",
        common,
        native: {}
      });

      const st = await this.getStateAsync(id);
      if (st === null || st === undefined) {
        await this.setStateAsync(id, { val: def, ack: true });
      }
    }
  }

  async getForeignNum(id, fallback = 0) {
    if (!id) {
      return fallback;
    }
    try {
      const st = await this.getForeignStateAsync(id);
      if (!st || st.val === null || st.val === undefined || st.val === "") {
        return fallback;
      }
      const n = Number(String(st.val).replace(",", "."));
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }

  async getForeignStr(id, fallback = "") {
    if (!id) {
      return fallback;
    }
    try {
      const st = await this.getForeignStateAsync(id);
      return st && st.val !== null && st.val !== undefined ? String(st.val) : fallback;
    } catch {
      return fallback;
    }
  }

  sanitize(s) {
    return String(s)
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase()
      .slice(0, 180);
  }

  flatten(obj, prefix = "", out = {}) {
    if (obj === null || obj === undefined) {
      return out;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => this.flatten(v, `${prefix}_${i}`, out));
      return out;
    }
    if (typeof obj === "object") {
      Object.entries(obj).forEach(([k, v]) => this.flatten(v, prefix ? `${prefix}_${k}` : k, out));
      return out;
    }
    out[this.sanitize(prefix)] = obj;
    return out;
  }

  pick(flat, keys, fallback = 0) {
    for (const key of keys) {
      const found = Object.keys(flat).find((k) => k.includes(key));
      if (found) {
        const n = Number(String(flat[found]).replace(",", "."));
        if (Number.isFinite(n)) {
          return n;
        }
      }
    }
    return fallback;
  }

  round1(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
  }

  async publishAuto(flat) {
    const auto = {
      pv_total: this.pick(flat, ["pv_power", "solar_power", "pv_total", "yield_power"]),
      grid_import_power: this.pick(flat, ["grid_import", "grid_power_import"]),
      grid_export_power: this.pick(flat, ["grid_export", "feed_in", "grid_power_export"]),
      battery_soc: this.pick(flat, ["battery_soc", "soc"]),
      battery_power: this.pick(flat, ["battery_power", "dc_power"]),
      battery_voltage: this.pick(flat, ["battery_voltage", "dc_voltage"]),
      battery_current: this.pick(flat, ["battery_current", "dc_current"]),
      house_power: this.pick(flat, ["consumption", "ac_load", "house_power"]),
      pv_today: this.pick(flat, ["pv_yield_today", "solar_yield_today", "yield_today"])
    };

    auto.grid_net_power = auto.grid_import_power - auto.grid_export_power;

    for (const [k, v] of Object.entries(auto)) {
      await this.setStateAsync(`vrm.auto.${k}`, { val: v, ack: true });
    }
  }

  getRecordValue(records, idx, pos, fallback = 0) {
    try {
      if (!Array.isArray(records)) {
        return fallback;
      }
      const row = records[idx];
      if (!Array.isArray(row)) {
        return fallback;
      }
      const val = row[pos];
      const n = Number(val);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }

  findNumericField(flat, candidates, fallback = 0) {
    for (const cand of candidates) {
      const key = Object.keys(flat).find((k) => k === cand || k.endsWith(`_${cand}`) || k.includes(cand));
      if (key) {
        const n = Number(String(flat[key]).replace(",", "."));
        if (Number.isFinite(n)) {
          return n;
        }
      }
    }
    return fallback;
  }

  async publishCleanStates(dayData, yearData, forecastData) {
    let pvToday = 0;
    let pvYesterday = 0;
    let pvYear = 0;
    let gridImportToday = 0;
    let gridImportYesterday = 0;
    let consumptionToday = 0;
    let consumptionYesterday = 0;
    let forecastToday = 0;
    let forecastTomorrow = 0;
    let forecastDayAfterTomorrow = 0;

    const dayFlat = this.flatten(dayData || {}, "");
    const yearFlat = this.flatten(yearData || {}, "");
    const forecastFlat = this.flatten(forecastData || {}, "");

    pvToday = this.findNumericField(dayFlat, [
      "solar_yield",
      "pv_yield",
      "yield",
      "pv_today",
      "solar_yield_today",
      "yield_today"
    ], 0);

    pvYesterday = this.findNumericField(dayFlat, [
      "solar_yield_yesterday",
      "pv_yield_yesterday",
      "yield_yesterday",
      "yesterday"
    ], 0);

    gridImportToday = this.findNumericField(dayFlat, [
      "consumption_from_grid",
      "grid_to_ac_loads",
      "from_grid",
      "grid_import_today",
      "grid_import"
    ], 0);

    gridImportYesterday = this.findNumericField(dayFlat, [
      "consumption_from_grid_yesterday",
      "from_grid_yesterday",
      "grid_import_yesterday"
    ], 0);

    consumptionToday = this.findNumericField(dayFlat, [
      "consumption",
      "consumption_today",
      "ac_consumption",
      "loads"
    ], 0);

    consumptionYesterday = this.findNumericField(dayFlat, [
      "consumption_yesterday",
      "ac_consumption_yesterday",
      "loads_yesterday"
    ], 0);

    pvYear = this.findNumericField(yearFlat, [
      "solar_yield",
      "pv_yield",
      "yield",
      "year",
      "pv_year"
    ], 0);

    forecastToday = this.findNumericField(forecastFlat, [
      "today",
      "forecast_today",
      "solar_yield_forecast_today",
      "pv_forecast_today"
    ], 0);

    forecastTomorrow = this.findNumericField(forecastFlat, [
      "tomorrow",
      "forecast_tomorrow",
      "solar_yield_forecast_tomorrow",
      "pv_forecast_tomorrow"
    ], 0);

    forecastDayAfterTomorrow = this.findNumericField(forecastFlat, [
      "day_after_tomorrow",
      "forecast_day_after_tomorrow",
      "solar_yield_forecast_day_after_tomorrow",
      "pv_forecast_day_after_tomorrow"
    ], 0);

    if (!pvToday && Array.isArray(dayData?.records)) {
      pvToday = this.getRecordValue(dayData.records, dayData.records.length - 1, 1, 0);
    }
    if (!pvYesterday && Array.isArray(dayData?.records) && dayData.records.length >= 2) {
      pvYesterday = this.getRecordValue(dayData.records, dayData.records.length - 2, 1, 0);
    }
    if (!pvYear && Array.isArray(yearData?.records)) {
      pvYear = this.getRecordValue(yearData.records, yearData.records.length - 1, 1, 0);
    }

    await this.setStateAsync("vrm.clean.pv_today", { val: this.round1(pvToday), ack: true });
    await this.setStateAsync("vrm.clean.pv_yesterday", { val: this.round1(pvYesterday), ack: true });
    await this.setStateAsync("vrm.clean.pv_year", { val: this.round1(pvYear), ack: true });

    await this.setStateAsync("vrm.clean.grid_import_today", { val: this.round1(gridImportToday), ack: true });
    await this.setStateAsync("vrm.clean.grid_import_yesterday", { val: this.round1(gridImportYesterday), ack: true });

    await this.setStateAsync("vrm.clean.consumption_today", { val: this.round1(consumptionToday), ack: true });
    await this.setStateAsync("vrm.clean.consumption_yesterday", { val: this.round1(consumptionYesterday), ack: true });

    await this.setStateAsync("vrm.clean.forecast_today", { val: this.round1(forecastToday), ack: true });
    await this.setStateAsync("vrm.clean.forecast_tomorrow", { val: this.round1(forecastTomorrow), ack: true });
    await this.setStateAsync("vrm.clean.forecast_day_after_tomorrow", { val: this.round1(forecastDayAfterTomorrow), ack: true });
  }

  async pollVRM() {
    try {
      if (!this.config.accessToken || !this.config.siteId) {
        await this.setStateAsync("info.connection", { val: false, ack: true });
        await this.setStateAsync("info.lastError", {
          val: "VRM Token oder Site ID fehlt",
          ack: true
        });
        await this.updateAll();
        return;
      }

      const headers = { "X-Authorization": `Token ${this.config.accessToken}` };
      const base = "https://vrmapi.victronenergy.com/v2";

      const urls = {
        live: `${base}/installations/${this.config.siteId}/stats?type=live_feed`,
        venus: `${base}/installations/${this.config.siteId}/stats?type=venus`,
        day: `${base}/installations/${this.config.siteId}/stats?type=day`,
        year: `${base}/installations/${this.config.siteId}/stats?type=year`,
        forecast: `${base}/installations/${this.config.siteId}/forecast`
      };

      const [liveRes, venusRes, dayRes, yearRes, forecastRes] = await Promise.allSettled([
        axios.get(urls.live, { headers, timeout: 20000 }),
        axios.get(urls.venus, { headers, timeout: 20000 }),
        axios.get(urls.day, { headers, timeout: 20000 }),
        axios.get(urls.year, { headers, timeout: 20000 }),
        axios.get(urls.forecast, { headers, timeout: 20000 })
      ]);

      let merged = {};
      let dayData = {};
      let yearData = {};
      let forecastData = {};

      if (liveRes.status === "fulfilled") {
        const data = liveRes.value.data || {};
        await this.setStateAsync("raw.liveFeedJson", {
          val: JSON.stringify(data),
          ack: true
        });
        merged = { ...merged, ...this.flatten(data, "live") };
      }

      if (venusRes.status === "fulfilled") {
        const data = venusRes.value.data || {};
        await this.setStateAsync("raw.venusJson", {
          val: JSON.stringify(data),
          ack: true
        });
        merged = { ...merged, ...this.flatten(data, "venus") };
      }

      if (dayRes.status === "fulfilled") {
        dayData = dayRes.value.data || {};
        await this.setStateAsync("raw.dayStatsJson", {
          val: JSON.stringify(dayData),
          ack: true
        });
      }

      if (yearRes.status === "fulfilled") {
        yearData = yearRes.value.data || {};
        await this.setStateAsync("raw.yearStatsJson", {
          val: JSON.stringify(yearData),
          ack: true
        });
      }

      if (forecastRes.status === "fulfilled") {
        forecastData = forecastRes.value.data || {};
        await this.setStateAsync("raw.forecastJson", {
          val: JSON.stringify(forecastData),
          ack: true
        });
      }

      await this.publishAuto(merged);
      await this.publishCleanStates(dayData, yearData, forecastData);

      await this.setStateAsync("info.connection", { val: true, ack: true });
      await this.setStateAsync("info.lastPoll", {
        val: new Date().toISOString(),
        ack: true
      });
      await this.setStateAsync("info.lastError", { val: "", ack: true });
    } catch (e) {
      await this.setStateAsync("info.connection", { val: false, ack: true });
      await this.setStateAsync("info.lastError", {
        val: String(e.message || e),
        ack: true
      });
      this.log.warn(`VRM polling failed: ${e.message || e}`);
    }

    await this.updateAll();
  }

  async autoNum(id, fallback = 0) {
    const st = await this.getStateAsync(id);
    return Number(st?.val || fallback);
  }

  async choose(manualKey, autoId, fallback = 0, asString = false) {
    const manual = this.config[manualKey];
    if (manual) {
      return asString
        ? this.getForeignStr(manual, "")
        : this.getForeignNum(manual, fallback);
    }

    return asString
      ? this.getStateAsync(autoId).then((s) => (s?.val ? String(s.val) : ""))
      : this.autoNum(autoId, fallback);
  }

  currentImage() {
    const mode = this.config.imageMode || "auto";
    if (mode === "day") {
      return this.config.dayImageUrl || "";
    }
    if (mode === "night") {
      return this.config.nightImageUrl || "";
    }
    const h = new Date().getHours();
    return h >= 7 && h < 19
      ? this.config.dayImageUrl || this.config.nightImageUrl || ""
      : this.config.nightImageUrl || this.config.dayImageUrl || "";
  }

  async getCardFieldValue(dp, fallbackValue, unit) {
    if (!dp) {
      return fallbackValue;
    }

    if (unit === "" || String(unit).toLowerCase() === "text") {
      return this.getForeignStr(dp, String(fallbackValue ?? ""));
    }

    return this.getForeignNum(dp, Number(fallbackValue || 0));
  }

  async updateAll() {
    const manualPvRoof = await this.choose("manual_pvRoof", "vrm.auto.pv_total", 0);
    const manualPvFacade = await this.choose("manual_pvFacade", "vrm.auto.pv_total", 0);
    const manualPvGarden = await this.choose("manual_pvGarden", "vrm.auto.pv_total", 0);
    const manualPvToday = await this.choose("manual_pvToday", "vrm.auto.pv_today", 0);

    const housePower = await this.choose("manual_housePower", "vrm.auto.house_power", 0);
    const houseToday = this.config.manual_houseToday
      ? await this.getForeignNum(this.config.manual_houseToday, 0)
      : 0;

    const gridImport = await this.choose("manual_gridImportPower", "vrm.auto.grid_import_power", 0);
    const gridExport = await this.choose("manual_gridExportPower", "vrm.auto.grid_export_power", 0);
    const gridNet = this.config.manual_gridNetPower
      ? await this.getForeignNum(this.config.manual_gridNetPower, 0)
      : Number(gridImport) - Number(gridExport);

    const batterySoc = await this.choose("manual_batterySoc", "vrm.auto.battery_soc", 0);
    const batteryPower = await this.choose("manual_batteryPower", "vrm.auto.battery_power", 0);
    const batteryVoltage = await this.choose("manual_batteryVoltage", "vrm.auto.battery_voltage", 0);
    const batteryCurrent = await this.choose("manual_batteryCurrent", "vrm.auto.battery_current", 0);
    const batteryTemperature = this.config.manual_batteryTemperature
      ? await this.getForeignNum(this.config.manual_batteryTemperature, 0)
      : 0;
    const batteryTimeRemaining = this.config.manual_batteryTimeRemaining
      ? await this.getForeignStr(this.config.manual_batteryTimeRemaining, "")
      : "";

    const heatpumpPower = this.config.manual_heatpumpPower
      ? await this.getForeignNum(this.config.manual_heatpumpPower, 0)
      : 0;
    const heatpumpToday = this.config.manual_heatpumpToday
      ? await this.getForeignNum(this.config.manual_heatpumpToday, 0)
      : 0;

    const temperature = this.config.manual_temperatureOutdoor
      ? await this.getForeignNum(this.config.manual_temperatureOutdoor, 0)
      : 0;
    const lux = this.config.manual_lux
      ? await this.getForeignNum(this.config.manual_lux, 0)
      : 0;
    const dateTime = this.config.manual_dateTime
      ? await this.getForeignStr(this.config.manual_dateTime, "")
      : new Date().toLocaleString("de-DE");

    const pvStrings = [];
    for (let i = 1; i <= 10; i++) {
      if (!this.config[`pvString${i}Enabled`]) {
        continue;
      }

      const name = this.config[`pvString${i}Name`] || `PV String ${i}`;
      const power = this.config[`pvString${i}Power`]
        ? await this.getForeignNum(this.config[`pvString${i}Power`], 0)
        : 0;
      const today = this.config[`pvString${i}Today`]
        ? await this.getForeignNum(this.config[`pvString${i}Today`], 0)
        : 0;

      pvStrings.push({
        enabled: true,
        name,
        power,
        today
      });
    }

    const pvByName = {};
    for (const s of pvStrings) {
      pvByName[String(s.name || "").trim().toLowerCase()] = s;
    }

    const pvFacade = pvByName["fassade"]?.power ?? manualPvFacade;
    const pvGarden = pvByName["gartenhaus"]?.power ?? manualPvGarden;
    const pvRoofEast = pvByName["dach ost"]?.power ?? pvByName["ost"]?.power ?? 0;
    const pvRoofSouth =
      pvByName["dach süd"]?.power ??
      pvByName["dach sued"]?.power ??
      pvByName["süd"]?.power ??
      pvByName["sued"]?.power ??
      0;
    const pvRoofWest = pvByName["dach west"]?.power ?? pvByName["west"]?.power ?? 0;

    const pvStringsTotal = pvStrings.reduce((sum, s) => sum + Number(s.power || 0), 0);
    const pvStringsToday = pvStrings.reduce((sum, s) => sum + Number(s.today || 0), 0);

    const pvTotal = this.config.manual_pvNow
      ? await this.getForeignNum(this.config.manual_pvNow, pvStringsTotal)
      : (pvStrings.length
          ? pvStringsTotal
          : await this.choose(
              "manual_pvNow",
              "vrm.auto.pv_total",
              Number(manualPvRoof) + Number(manualPvFacade) + Number(manualPvGarden)
            ));

    const pvToday = this.config.manual_pvToday
      ? await this.getForeignNum(this.config.manual_pvToday, pvStringsToday)
      : (pvStrings.length ? pvStringsToday : manualPvToday);

    const consumers = [];
    for (let i = 1; i <= 10; i++) {
      if (!this.config[`consumer${i}Enabled`]) {
        continue;
      }

      consumers.push({
        enabled: true,
        name: this.config[`consumer${i}Name`] || `Verbraucher ${i}`,
        icon: this.config[`consumer${i}Icon`] || "plug",
        color: this.config[`consumer${i}Color`] || "#5aa6ff",
        power: this.config[`consumer${i}Power`]
          ? await this.getForeignNum(this.config[`consumer${i}Power`], 0)
          : 0,
        today: this.config[`consumer${i}Today`]
          ? await this.getForeignNum(this.config[`consumer${i}Today`], 0)
          : 0,
        yesterday: this.config[`consumer${i}Yesterday`]
          ? await this.getForeignNum(this.config[`consumer${i}Yesterday`], 0)
          : 0
      });
    }

    const defaultCards = [
      {
        title: "PV heute",
        mainLabel: "",
        mainValue: pvToday,
        mainUnit: "kWh",
        rows: [{ label: "Dach", value: manualPvRoof, unit: "W" }]
      },
      {
        title: "Haus / Bezug",
        mainLabel: "",
        mainValue: housePower,
        mainUnit: "W",
        rows: [{ label: "Tagesverbrauch", value: houseToday, unit: "kWh" }]
      },
      {
        title: "Batterie",
        mainLabel: "",
        mainValue: batterySoc,
        mainUnit: "%",
        rows: [
          { label: "Leistung", value: batteryPower, unit: "W" },
          { label: "Spannung", value: batteryVoltage, unit: "V" }
        ]
      },
      {
        title: "Wärmepumpe",
        mainLabel: "",
        mainValue: heatpumpPower,
        mainUnit: "W",
        rows: [{ label: "Heute", value: heatpumpToday, unit: "kWh" }]
      }
    ];

    const cards = [];
    for (let c = 1; c <= 4; c++) {
      const def = defaultCards[c - 1];

      const title = this.config[`card${c}Title`] || def.title;
      const mainLabel = this.config[`card${c}MainLabel`] || def.mainLabel || "";
      const mainUnit = this.config[`card${c}MainUnit`] || def.mainUnit || "";
      const mainDp = this.config[`card${c}MainDp`] || "";
      const mainValue = await this.getCardFieldValue(mainDp, def.mainValue, mainUnit);

      const rows = [];
      for (let r = 1; r <= 4; r++) {
        const confLabel = this.config[`card${c}Row${r}Label`] || "";
        const confDp = this.config[`card${c}Row${r}Dp`] || "";
        const confUnit = this.config[`card${c}Row${r}Unit`] || "";

        if (confLabel || confDp) {
          const val = await this.getCardFieldValue(confDp, "", confUnit);
          rows.push({
            label: confLabel || `Zeile ${r}`,
            value: val,
            unit: confUnit || ""
          });
        } else if (def.rows[r - 1]) {
          rows.push(def.rows[r - 1]);
        }
      }

      cards.push({
        title,
        mainLabel,
        mainValue,
        mainUnit,
        rows
      });
    }

    const w = (id, val) => this.setStateAsync(id, { val, ack: true });

    await w("dashboard.title", this.config.dashboardTitle || "Energieübersicht");
    await w("dashboard.subtitle", this.config.dashboardSubtitle || "Victron GUI v2 Style · Live");
    await w("dashboard.activeImageUrl", this.currentImage());
    await w("dashboard.temperature", Number(temperature) || 0);
    await w("dashboard.lux", Number(lux) || 0);
    await w("dashboard.dateTime", dateTime);

    await w("dashboard.pv_roof", Number(manualPvRoof) || 0);
    await w("dashboard.pv_facade", Number(pvFacade) || 0);
    await w("dashboard.pv_garden", Number(pvGarden) || 0);
    await w("dashboard.pv_roof_east", Number(pvRoofEast) || 0);
    await w("dashboard.pv_roof_south", Number(pvRoofSouth) || 0);
    await w("dashboard.pv_roof_west", Number(pvRoofWest) || 0);
    await w("dashboard.pv_total", Number(pvTotal) || 0);
    await w("dashboard.pv_today", Number(pvToday) || 0);
    await w("dashboard.pvStringsJson", JSON.stringify(pvStrings));

    await w("dashboard.house_power", Number(housePower) || 0);
    await w("dashboard.house_today", Number(houseToday) || 0);

    await w("dashboard.grid_import_power", Number(gridImport) || 0);
    await w("dashboard.grid_export_power", Number(gridExport) || 0);
    await w("dashboard.grid_net_power", Number(gridNet) || 0);

    await w("dashboard.battery_soc", Number(batterySoc) || 0);
    await w("dashboard.battery_power", Number(batteryPower) || 0);
    await w("dashboard.battery_voltage", Number(batteryVoltage) || 0);
    await w("dashboard.battery_current", Number(batteryCurrent) || 0);
    await w("dashboard.battery_temperature", Number(batteryTemperature) || 0);
    await w("dashboard.battery_time_remaining", batteryTimeRemaining);

    await w("dashboard.heatpump_power", Number(heatpumpPower) || 0);
    await w("dashboard.heatpump_today", Number(heatpumpToday) || 0);

    await w("dashboard.consumersJson", JSON.stringify(consumers));
    await w("dashboard.cardsJson", JSON.stringify(cards));
  }
}

if (require.main !== module) {
  module.exports = (options) => new VictronVrmDashboard(options);
} else {
  new VictronVrmDashboard();
}