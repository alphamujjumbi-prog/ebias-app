const pairs = [
  {
    name: "EURUSD",
    trend: "Bearish",
    strength: 70,
    confirmation: "Not confirmed",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "USDJPY",
    trend: "Bullish",
    strength: 75,
    confirmation: "Not confirmed",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "USDCAD",
    trend: "Neutral",
    strength: 50,
    confirmation: "Not confirmed",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "XAUUSD",
    trend: "Bearish",
    strength: 65,
    confirmation: "Not confirmed",
    action: "WAIT",
    news: "NO"
  },
  {
    name: "ETHUSD",
    trend: "Bullish",
    strength: 60,
    confirmation: "Not confirmed",
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
      <p>Trend: ${pair.trend}</p>
      <p>Current strength: ${pair.strength}%</p>
      <p>Confirmation: ${pair.confirmation}</p>
      <p>Action: <span class="${pair.action.toLowerCase()}">${pair.action}</span></p>
      <p>News risk: <span class="news-${pair.news.toLowerCase()}">${pair.news}</span></p>
    `;

    container.appendChild(card);
  });
}

showPairs();
