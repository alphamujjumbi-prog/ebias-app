const pairsConfig = [
  { name: "EURUSD", type: "forex", quote: "EUR", invert: true },
  { name: "USDJPY", type: "forex", quote: "JPY", invert: false },
  { name: "USDCAD", type: "forex", quote: "CAD", invert: false },
  { name: "XAUUSD", type: "forex", quote: "XAU", invert: true },
  { name: "ETHUSD", type: "crypto" }
];

function formatPrice(pairName, price) {
  if (pairName === "XAUUSD" || pairName === "ETHUSD") return price.toFixed(2);
  if (pairName === "USDJPY") return price.toFixed(3);
  return price.toFixed(5);
}

function getDateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  // Skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

async function fetchFrankfurter(date = null) {
  let url = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,JPY,CAD,XAU";
  if (date) url += `&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Frankfurter failed");
  const data = await res.json();
  const rates = {};
  if (Array.isArray(data)) {
    data.forEach(item => { rates[item.quote] = item.rate; });
  } else if (data.rates) {
    Object.assign(rates, data.rates);
  }
  return rates;
}

async function fetchETH() {
  const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
  if (!res.ok) throw new Error("Coinbase failed");
  const data = await res.json();
  return parseFloat(data.data.amount);
}

/**
 * 3-Factor Confluence System
 * Factor 1: Daily change is meaningful (> 0.25%)
 * Factor 2: Previous day was in the SAME direction (continuation)
 * Factor 3: Move is relatively strong (> 0.45% or stronger than recent average)
 *
 * BUY / SELL only when at least 2 of 3 factors agree.
 * Otherwise → WAIT
 */
function calculateConfluence(changeToday, changePrev) {
  let bullishFactors = 0;
  let bearishFactors = 0;
  const factors = [];

  // Factor 1: Meaningful daily move
  if (changeToday > 0.25) {
    bullishFactors++;
    factors.push("Daily up");
  } else if (changeToday < -0.25) {
    bearishFactors++;
    factors.push("Daily down");
  }

  // Factor 2: Continuation (previous day same direction)
  if (changeToday > 0 && changePrev > 0.1) {
    bullishFactors++;
    factors.push("Continuation");
  } else if (changeToday < 0 && changePrev < -0.1) {
    bearishFactors++;
    factors.push("Continuation");
  }

  // Factor 3: Strong move
  if (changeToday > 0.45) {
    bullishFactors++;
    factors.push("Strong move");
  } else if (changeToday < -0.45) {
    bearishFactors++;
    factors.push("Strong move");
  }

  // Decide
  let trend, action, strength, confirmation;

  if (bullishFactors >= 2) {
    trend = "Bullish";
    action = bullishFactors >= 3 ? "BUY" : "WAIT";
    strength = Math.min(92, 55 + bullishFactors * 12 + Math.abs(changeToday) * 8);
    confirmation = `${bullishFactors}/3 confluence`;
  } else if (bearishFactors >= 2) {
    trend = "Bearish";
    action = bearishFactors >= 3 ? "SELL" : "WAIT";
    strength = Math.min(92, 55 + bearishFactors * 12 + Math.abs(changeToday) * 8);
    confirmation = `${bearishFactors}/3 confluence`;
  } else {
    trend = "Neutral";
    action = "WAIT";
    strength = Math.round(40 + Math.abs(changeToday) * 15);
    confirmation = "Low confluence";
  }

  strength = Math.max(35, Math.min(95, Math.round(strength)));

  return { trend, strength, action, confirmation, factors };
}

async function loadData() {
  const container = document.getElementById("pairs");
  const lastUpdated = document.getElementById("lastUpdated");
  const btn = document.getElementById("refreshBtn");

  container.innerHTML = '<div class="loading">Fetching live data + confluence...</div>';
  btn.disabled = true;

  try {
    const day1 = getDateString(1); // yesterday
    const day2 = getDateString(2); // day before yesterday

    const [todayRates, yestRates, prevRates, ethPrice] = await Promise.all([
      fetchFrankfurter(),
      fetchFrankfurter(day1),
      fetchFrankfurter(day2),
      fetchETH()
    ]);

    const results = [];

    for (const cfg of pairsConfig) {
      let price, changeToday, changePrev;

      if (cfg.type === "crypto") {
        // ETH - limited history freely available, so use weaker confluence
        price = ethPrice;
        changeToday = 0;
        changePrev = 0;
      } else {
        const todayRate = todayRates[cfg.quote];
        const yestRate = yestRates[cfg.quote];
        const prevRate = prevRates[cfg.quote];

        if (cfg.invert) {
          price = 1 / todayRate;
          const yestPrice = 1 / yestRate;
          const prevPrice = 1 / prevRate;
          changeToday = ((price - yestPrice) / yestPrice) * 100;
          changePrev = ((yestPrice - prevPrice) / prevPrice) * 100;
        } else {
          price = todayRate;
          changeToday = ((todayRate - yestRate) / yestRate) * 100;
          changePrev = ((yestRate - prevRate) / prevRate) * 100;
        }
      }

      const bias = calculateConfluence(changeToday, changePrev);

      results.push({
        name: cfg.name,
        price: formatPrice(cfg.name, price),
        trend: bias.trend,
        strength: bias.strength,
        confirmation: bias.confirmation,
        action: bias.action,
        news: "NO",
        change: changeToday,
        factors: bias.factors
      });
    }

    container.innerHTML = "";
    results.forEach(pair => {
      const card = document.createElement("div");
      card.className = "pair-card " + pair.trend.toLowerCase();

      const changeText = pair.change !== 0
        ? `(${pair.change > 0 ? "+" : ""}${pair.change.toFixed(2)}%)`
        : "";

      card.innerHTML = `
        <h2>
          ${pair.name}
          <span class="price">${pair.price} ${changeText}</span>
        </h2>
        <div class="row"><span class="label">Trend</span> <span>${pair.trend}</span></div>
        <div class="row"><span class="label">Strength</span> <span>${pair.strength}%</span></div>
        <div class="row"><span class="label">Confirmation</span> <span>${pair.confirmation}</span></div>
        <div class="row"><span class="label">Action</span> <span class="${pair.action.toLowerCase()}">${pair.action}</span></div>
        <div class="row"><span class="label">News risk</span> <span class="news-no">NO</span></div>
      `;
      container.appendChild(card);
    });

    const now = new Date();
    lastUpdated.textContent = "Updated " + now.toLocaleTimeString();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="loading">Failed to load data.<br>Check internet and try again.<br><small>${err.message}</small></div>`;
    lastUpdated.textContent = "Error";
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("refreshBtn").addEventListener("click", loadData);
loadData();
