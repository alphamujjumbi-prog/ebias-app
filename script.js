// ============================================
// EBIAS — Multi-TF CRT + Confluence Mode
// Inspired by SMC-Liquidity-Hunter & trading-scanner
// ============================================

const PAIR_CONFIG = [
  { name: "EURUSD", symbol: "EURUSD", type: "fx" },
  { name: "USDJPY", symbol: "USDJPY", type: "fx" },
  { name: "USDCAD", symbol: "USDCAD", type: "fx" },
  { name: "XAUUSD", symbol: "XAUUSD", type: "fx" },
  { name: "ETHUSD", symbol: "ETHUSDT", type: "crypto" }
];

async function fetchCandles(symbol, type, interval = "1d", range = "5d") {
  if (type === "fx") {
    const url = `https://forexapix.lovable.app/api/public/v1/candles/${symbol}?interval=${interval}&range=${range}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("FX fetch failed");
    const data = await res.json();
    return (data.candles || []).map(c => ({
      time: new Date(c.t).getTime(),
      open: +c.o, high: +c.h, low: +c.l, close: +c.c
    })).sort((a, b) => a.time - b.time);
  }

  // ETH via Binance
  const map = { "1d": "1d", "4h": "4h", "1h": "1h" };
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${map[interval] || "1d"}&limit=30`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Crypto fetch failed");
  const raw = await res.json();
  return raw.map(k => ({
    time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4]
  }));
}

// Simple structure bias from recent candles
function structureBias(candles) {
  if (!candles || candles.length < 4) return { bias: "Neutral", strength: 50 };

  const recent = candles.slice(-8);
  const highs = recent.map(c => c.high);
  const lows  = recent.map(c => c.low);
  const closes = recent.map(c => c.close);

  const lastClose = closes[closes.length - 1];
  const rangeHigh = Math.max(...highs);
  const rangeLow  = Math.min(...lows);
  const mid = (rangeHigh + rangeLow) / 2;
  const pos = (lastClose - rangeLow) / (rangeHigh - rangeLow || 1);

  // Higher highs / higher lows vs lower highs / lower lows
  const hh = highs[highs.length-1] > highs[highs.length-3];
  const hl = lows[lows.length-1]   > lows[lows.length-3];
  const lh = highs[highs.length-1] < highs[highs.length-3];
  const ll = lows[lows.length-1]   < lows[lows.length-3];

  let bias = "Neutral";
  let strength = 55;

  if (hh && hl && pos > 0.55) {
    bias = "Bullish";
    strength = Math.round(55 + pos * 35);
  } else if (lh && ll && pos < 0.45) {
    bias = "Bearish";
    strength = Math.round(55 + (1 - pos) * 35);
  } else if (pos > 0.65) {
    bias = "Bullish";
    strength = 62;
  } else if (pos < 0.35) {
    bias = "Bearish";
    strength = 62;
  }

  return { bias, strength: Math.min(92, strength) };
}

// Classic CRT PDH/PDL
function crtBias(prev, curr) {
  if (!prev || !curr) return { bias: "Neutral", strength: 50, reason: "No data" };

  const pdh = prev.high;
  const pdl = prev.low;
  const mid = (pdh + pdl) / 2;
  const range = pdh - pdl || 1;

  const sweptHigh = curr.high > pdh;
  const sweptLow  = curr.low  < pdl;
  const closedAbovePdl = curr.close > pdl;
  const closedBelowPdh = curr.close < pdh;
  const inUpper = curr.close >= mid;
  const inLower = curr.close <= mid;

  if (sweptLow && closedAbovePdl && inUpper) {
    const str = Math.min(90, Math.round(60 + ((curr.close - pdl) / range) * 30));
    return { bias: "Bullish", strength: str, reason: "Swept PDL → closed upper half" };
  }
  if (sweptHigh && closedBelowPdh && inLower) {
    const str = Math.min(90, Math.round(60 + ((pdh - curr.close) / range) * 30));
    return { bias: "Bearish", strength: str, reason: "Swept PDH → closed lower half" };
  }
  if (sweptLow && closedAbovePdl) {
    return { bias: "Bullish", strength: 63, reason: "Swept PDL (reclaim)" };
  }
  if (sweptHigh && closedBelowPdh) {
    return { bias: "Bearish", strength: 63, reason: "Swept PDH (reclaim)" };
  }

  // No sweep — use position in range
  const pos = (curr.close - pdl) / range;
  if (pos > 0.7) return { bias: "Bullish", strength: 58, reason: "Holding upper range" };
  if (pos < 0.3) return { bias: "Bearish", strength: 58, reason: "Holding lower range" };

  return { bias: "Neutral", strength: 50, reason: "Inside range, no sweep" };
}

// Confluence scoring (inspired by trading-scanner grades)
function scoreConfluence(daily, h4) {
  let score = 0;
  const reasons = [];

  // Daily CRT is primary
  if (daily.bias === "Bullish") { score += 35; reasons.push("Daily CRT Bullish"); }
  else if (daily.bias === "Bearish") { score += 35; reasons.push("Daily CRT Bearish"); }
  else { score += 10; reasons.push("Daily Neutral"); }

  // 4H alignment
  if (h4.bias === daily.bias && daily.bias !== "Neutral") {
    score += 30;
    reasons.push("4H aligned");
  } else if (h4.bias !== "Neutral" && daily.bias === "Neutral") {
    score += 15;
    reasons.push("4H directional");
  } else if (h4.bias !== daily.bias && h4.bias !== "Neutral") {
    score += 5;
    reasons.push("4H conflict");
  } else {
    score += 10;
  }

  // Strength bonus
  const avgStr = (daily.strength + h4.strength) / 2;
  if (avgStr >= 75) { score += 20; reasons.push("High strength"); }
  else if (avgStr >= 65) { score += 12; reasons.push("Good strength"); }
  else { score += 5; }

  // Sweep quality
  if (daily.reason && daily.reason.includes("Swept")) {
    score += 15;
    reasons.push("Liquidity sweep");
  }

  score = Math.min(100, Math.max(0, score));

  let grade = "C";
  if (score >= 80) grade = "A+";
  else if (score >= 70) grade = "A";
  else if (score >= 55) grade = "B";

  // Final bias = Daily primary, 4H can only confirm or keep Neutral
  let finalBias = daily.bias;
  if (daily.bias === "Neutral" && h4.bias !== "Neutral" && score >= 50) {
    finalBias = h4.bias;
  }

  let action = "WAIT";
  if (score >= 72 && finalBias === "Bullish") action = "BUY";
  if (score >= 72 && finalBias === "Bearish") action = "SELL";

  return {
    bias: finalBias,
    score,
    grade,
    action,
    reasons: reasons.slice(0, 3),
    dailyBias: daily.bias,
    h4Bias: h4.bias,
    dailyReason: daily.reason
  };
}

async function analysePair(config) {
  try {
    const [dailyCandles, h4Candles] = await Promise.all([
      fetchCandles(config.symbol, config.type, "1d", "5d"),
      fetchCandles(config.symbol, config.type, "4h", "5d")
    ]);

    if (dailyCandles.length < 2) throw new Error("Not enough daily data");

    const prev = dailyCandles[dailyCandles.length - 2];
    const curr = dailyCandles[dailyCandles.length - 1];

    const daily = crtBias(prev, curr);
    const h4 = structureBias(h4Candles);

    const conf = scoreConfluence(daily, h4);

    return {
      name: config.name,
      trend: conf.bias,
      strength: conf.score,
      grade: conf.grade,
      confirmation: "Multi-TF CRT",
      action: conf.action,
      news: "NO",
      dailyBias: conf.dailyBias,
      h4Bias: conf.h4Bias,
      reasons: conf.reasons,
      dailyReason: conf.dailyReason
    };
  } catch (err) {
    console.warn(config.name, err.message);
    return {
      name: config.name,
      trend: "Neutral",
      strength: 50,
      grade: "C",
      confirmation: "Multi-TF CRT",
      action: "WAIT",
      news: "NO",
      dailyBias: "—",
      h4Bias: "—",
      reasons: ["Data unavailable"],
      dailyReason: err.message
    };
  }
}

async function loadAll() {
  const container = document.getElementById("pairs");
  container.innerHTML = "<p style='text-align:center;color:#8b949e'>Scanning multi-TF bias…</p>";

  const results = await Promise.all(PAIR_CONFIG.map(analysePair));

  container.innerHTML = "";
  results.forEach(pair => {
    const card = document.createElement("div");
    card.className = "pair-card " + pair.trend.toLowerCase();

    const reasonsHtml = (pair.reasons || []).map(r => `<span class="tag">${r}</span>`).join("");

    card.innerHTML = `
      <div class="card-header">
        <h2>${pair.name}</h2>
        <span class="grade grade-${pair.grade.replace('+','p')}">${pair.grade}</span>
      </div>
      <div class="row"><span class="label">Bias</span> <span class="trend-${pair.trend.toLowerCase()}">${pair.trend}</span></div>
      <div class="row"><span class="label">Confluence</span> <span>${pair.strength}%</span></div>
      <div class="row"><span class="label">Daily (HTF)</span> <span>${pair.dailyBias}</span></div>
      <div class="row"><span class="label">4H</span> <span>${pair.h4Bias}</span></div>
      <div class="row"><span class="label">Action</span> <span class="${pair.action.toLowerCase()}">${pair.action}</span></div>
      <div class="row"><span class="label">News risk</span> <span class="news-${pair.news.toLowerCase()}">${pair.news}</span></div>
      <div class="reasons">${reasonsHtml}</div>
      <div class="detail">${pair.dailyReason || ""}</div>
    `;
    container.appendChild(card);
  });

  document.getElementById("lastUpdated").textContent =
    "Updated " + new Date().toLocaleTimeString();
}

document.getElementById("refreshBtn").addEventListener("click", loadAll);
loadAll();
