const pairsConfig = [
  { name: "EURUSD", type: "forex", base: "USD", quote: "EUR", invert: true },
  { name: "USDJPY", type: "forex", base: "USD", quote: "JPY", invert: false },
  { name: "USDCAD", type: "forex", base: "USD", quote: "CAD", invert: false },
  { name: "XAUUSD", type: "forex", base: "USD", quote: "XAU", invert: true },
  { name: "ETHUSD", type: "crypto", id: "ethereum" }
];

function formatPrice(pairName, price) {
  if (pairName === "XAUUSD") return price.toFixed(2);
  if (pairName === "ETHUSD") return price.toFixed(2);
  if (pairName === "USDJPY") return price.toFixed(3);
  return price.toFixed(5);
}

function calculateBias(changePct) {
  let trend, strength, action;

  if (changePct > 0.35) {
    trend = "Bullish";
    strength = Math.min(90, Math.round(55 + changePct * 25));
    action = changePct > 0.8 ? "BUY" : "WAIT";
  } else if (changePct < -0.35) {
    trend = "Bearish";
    strength = Math.min(90, Math.round(55 + Math.abs(changePct) * 25));
    action = changePct < -0.8 ? "SELL" : "WAIT";
  } else {
    trend = "Neutral";
    strength = Math.round(40 + Math.abs(changePct) * 20);
    action = "WAIT";
  }

  // Cap strength reasonably
  strength = Math.max(40, Math.min(92, strength));

  return { trend, strength, action };
}

async function fetchFrankfurter(date = null) {
  let url = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,JPY,CAD,XAU";
  if (date) url += `&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Frankfurter failed");
  const data = await res.json();

  // Normalize to object { EUR: rate, JPY: rate, ... }
  const rates = {};
  if (Array.isArray(data)) {
    data.forEach(item => { rates[item.quote] = item.rate; });
  } else if (data.rates) {
    Object.assign(rates, data.rates);
  }
  return rates;
}

async function fetchETH() {
  // Coinbase public endpoint
  const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
  if (!res.ok) throw new Error("Coinbase failed");
  const data = await res.json();
  return parseFloat(data.data.amount);
}

async function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // Skip weekends roughly
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

async function loadData() {
  const container = document.getElementById("pairs");
  const lastUpdated = document.getElementById("lastUpdated");
  const btn = document.getElementById("refreshBtn");

  container.innerHTML = '<div class="loading">Fetching live data...</div>';
  btn.disabled = true;

  try {
    const yesterday = await getYesterdayDate();
    const [todayRates, yestRates, ethPrice] = await Promise.all([
      fetchFrankfurter(),
      fetchFrankfurter(yesterday),
      fetchETH()
    ]);

    const results = [];

    for (const cfg of pairsConfig) {
      let price, changePct;

      if (cfg.type === "crypto") {
        price = ethPrice;
        // For ETH we don't have easy free previous close without extra calls.
        // Use a neutral-ish bias or approximate with small random for demo (better: leave neutral-ish)
        // Simple approach: treat as Neutral unless we later add better history.
        changePct = 0; // will show as Neutral / WAIT
      } else {
        const todayRate = todayRates[cfg.quote];
        const yestRate = yestRates[cfg.quote];

        if (cfg.invert) {
          price = 1 / todayRate;
          const yestPrice = 1 / yestRate;
          changePct = ((price - yestPrice) / yestPrice) * 100;
        } else {
          price = todayRate;
          changePct = ((todayRate - yestRate) / yestRate) * 100;
        }
      }

      const bias = calculateBias(changePct);

      results.push({
        name: cfg.name,
        price: formatPrice(cfg.name, price),
        trend: bias.trend,
        strength: bias.strength,
        confirmation: "Price-based",
        action: bias.action,
        news: "NO",
        change: changePct
      });
    }

    // Special handling for ETH – try to make it a bit smarter later if needed
    // For now leave as Neutral

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
        <div class="row"><span class="label">News risk</span> <span class="news-${pair.news.toLowerCase()}">${pair.news}</span></div>
      `;
      container.appendChild(card);
    });

    const now = new Date();
    lastUpdated.textContent = "Updated " + now.toLocaleTimeString();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="loading">Failed to load data.<br>Check your internet and try again.<br><small>${err.message}</small></div>`;
    lastUpdated.textContent = "Error";
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("refreshBtn").addEventListener("click", loadData);

// Auto load on open
loadData();
