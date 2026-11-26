// ============================================
// HYBRID MODE - RS System / SMC Bias
// These values are updated manually after proper
// multi-timeframe SMC + price action analysis.
// ============================================

const pairs = [
  {
    name: "EURUSD",
    trend: "Bearish",
    strength: 68,
    confirmation: "RS System (SMC)",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "USDJPY",
    trend: "Bullish",
    strength: 72,
    confirmation: "RS System (SMC)",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "USDCAD",
    trend: "Bullish",
    strength: 61,
    confirmation: "RS System (SMC)",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "XAUUSD",
    trend: "Bearish",
    strength: 74,
    confirmation: "RS System (SMC)",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "ETHUSD",
    trend: "Neutral",
    strength: 52,
    confirmation: "RS System (SMC)",
    action: "WAIT",
    news: "NO"
  }
];

function showPairs() {
  const container = document.getElementById("pairs");
  container.innerHTML = "";

  pairs.forEach(pair => {
    const card = document.createElement("div");
    card.className = "pair-card " + pair.trend.toLowerCase();

    card.innerHTML = `
      <h2>${pair.name}</h2>
      <div class="row"><span class="label">Trend</span> <span>${pair.trend}</span></div>
      <div class="row"><span class="label">Strength</span> <span>${pair.strength}%</span></div>
      <div class="row"><span class="label">Confirmation</span> <span>${pair.confirmation}</span></div>
      <div class="row"><span class="label">Action</span> <span class="${pair.action.toLowerCase()}">${pair.action}</span></div>
      <div class="row"><span class="label">News risk</span> <span class="news-${pair.news.toLowerCase()}">${pair.news}</span></div>
    `;

    container.appendChild(card);
  });

  const now = new Date();
  document.getElementById("lastUpdated").textContent = "Updated " + now.toLocaleTimeString();
}

document.getElementById("refreshBtn").addEventListener("click", showPairs);
showPairs();
