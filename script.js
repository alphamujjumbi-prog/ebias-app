// ============================================
// AUTOMATIC CRT / PDH-PDL Bias Mode
// Previous Day High / Low sweep logic
// ============================================

const PAIR_CONFIG = [
  { name: "EURUSD", symbol: "EURUSD", type: "fx" },
  { name: "USDJPY", symbol: "USDJPY", type: "fx" },
  { name: "USDCAD", symbol: "USDCAD", type: "fx" },
  { name: "XAUUSD", symbol: "XAUUSD", type: "fx" },
  { name: "ETHUSD", symbol: "ETHUSDT", type: "crypto" }
];

async function fetchDailyCandles(symbol, type) {
  if (type === "fx") {
    // Free CORS-enabled daily OHLC
    const url = `https://forexapix.lovable.app/api/public/v1/candles/${symbol}?interval=1d&range=5d`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("FX data failed");
    const data = await res.json();
    // candles come newest last or mixed – sort by time
    const candles = (data.candles || []).map(c => ({
      time: new Date(c.t).getTime(),
      open: +c.o,
      high: +c.h,
      low: +c.l,
      close: +c.c
    })).sort((a, b) => a.time - b.time);
    return candles;
  }

  // ETH via Binance (works in many browsers)
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Crypto data failed");
  const raw = await res.json();
  return raw.map(k => ({
    time: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4]
  }));
}

/**
 * Classic CRT / PDH-PDL bias
 * Bullish : swept PDL and closed back above PDL, holding upper half of range
 * Bearish : swept PDH and closed back below PDH, holding lower half of range
 */
function computeCRTBias(prev, curr) {
  if (!prev || !curr) {
    return { trend: "Neutral", strength: 50, action: "WAIT", reason: "Insufficient data" };
  }

  const pdh = prev.high;
  const pdl = prev.low;
  const mid = (pdh + pdl) / 2;
  const range = pdh - pdl;

  const sweptHigh = curr.high > pdh;
  const sweptLow  = curr.low  < pdl;
  const closedAbovePdl = curr.close > pdl;
  const closedBelowPdh = curr.close < pdh;
  const inUpperHalf = curr.close >= mid;
  const inLowerHalf = curr.close <= mid;

  // Strength based on how far into the range + size of sweep
  let strength = 55;
  let trend = "Neutral";
  let action = "WAIT";
  let reason = "No confirmed PDH/PDL sweep";

  if (sweptLow && closedAbovePdl && inUpperHalf) {
    trend = "Bullish";
    // How deep was the sweep + how strong the reclaim
    const reclaimStrength = Math.min(100, 55 + ((curr.close - pdl) / range) * 40 + (sweptLow ? 10 : 0));
    strength = Math.round(reclaimStrength);
    action = strength >= 72 ? "BUY" : "WAIT";
    reason = "Swept PDL & closed in upper half";
  } else if (sweptHigh && closedBelowPdh && inLowerHalf) {
    trend = "Bearish";
    const reclaimStrength = Math.min(100, 55 + ((pdh - curr.close) / range) * 40 + (sweptHigh ? 10 : 0));
    strength = Math.round(reclaimStrength);
    action = strength >= 72 ? "SELL" : "WAIT";
    reason = "Swept PDH & closed in lower half";
  } else if (sweptLow && closedAbovePdl) {
    trend = "Bullish";
    strength = 62;
    action = "WAIT";
    reason = "Swept PDL (not yet upper half)";
  } else if (sweptHigh && closedBelowPdh) {
    trend = "Bearish";
    strength = 62;
    action = "WAIT";
    reason = "Swept PDH (not yet lower half)";
  }

  return { trend, strength, action, reason };
}

async function analysePair(config) {
  try {
    const candles = await fetchDailyCandles(config.symbol, config.type);
    if (candles.length < 2) {
      return {
        name: config.name,
        trend: "Neutral",
        strength: 50,
        confirmation: "CRT (PDH/PDL)",
        action: "WAIT",
        news: "NO",
        reason: "Not enough candles"
      };
    }

    // Previous completed day vs current (or last completed)
    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];

    const bias = computeCRTBias(prev, curr);

    return {
      name: config.name,
      trend: bias.trend,
      strength: bias.strength,
      confirmation: "CRT (PDH/PDL)",
      action: bias.action,
      news: "NO",
      reason: bias.reason
    };
  } catch (err) {
    console.warn(config.name, err.message);
    return {
      name: config.name,
      trend: "Neutral",
      strength: 50,
      confirmation: "CRT (PDH/PDL)",
      action: "WAIT",
      news: "NO",
      reason: "Data unavailable"
    };
  }
}

async function loadAll() {
  const container = document.getElementById("pairs");
  container.innerHTML = "<p style='text-align:center;color:#8b949e'>Loading CRT bias…</p>";

  const results = await Promise.all(PAIR_CONFIG.map(analysePair));

  container.innerHTML = "";
  results.forEach(pair => {
    const card = document.createElement("div");
    card.className = "pair-card " + pair.trend.toLowerCase();

    card.innerHTML = `
      <h2>${pair.name}</h2>
      <div class="row"><span class="label">Trend</span> <span>${pair.trend}</span></div>
      <div class="row"><span class="label">Strength</span> <span>${pair.strength}%</span></div>
      <div class="row"><span class="label">Confirmation</span> <span>${pair.confirmation}</span></div>
      <div class="row"><span class="label">Action</span> <span class="${pair.action.toLowerCase()}">${pair.action}</span></div>
      <div class="row"><span class="label">News risk</span> <span class="news-${pair.news.toLowerCase()}">${pair.news}</span></div>
      <div class="reason">${pair.reason || ""}</div>
    `;
    container.appendChild(card);
  });

  document.getElementById("lastUpdated").textContent =
    "Updated " + new Date().toLocaleTimeString();
}

document.getElementById("refreshBtn").addEventListener("click", loadAll);
loadAll();
