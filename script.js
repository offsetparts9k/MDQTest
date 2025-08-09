/* script.js
   Shared by index.html and admin.html
   - Uses Aladhan API to fetch prayer times (timingsByCity or timings by lat/lon)
   - Stores Iqamah times and last adhan in localStorage
   - Admin page allows editing Iqamah & settings
*/

const DEFAULTS = {
  city: "",
  country: "",
  method: 2, // calculation method (2 = University of Islamic Sciences, Karachi)
  iqamah: {
    Fajr: "05:30",
    Dhuhr: "13:30",
    Asr: "17:15",
    Maghrib: "20:25",
    Isha: "21:50"
  }
};

const PRAYERS = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];

function save(key, value){
  localStorage.setItem("mdq_"+key, JSON.stringify(value));
}
function load(key, fallback){
  try{
    const v = localStorage.getItem("mdq_"+key);
    return v ? JSON.parse(v) : fallback;
  }catch(e){ return fallback; }
}

/* ----- API fetch ----- */
async function fetchAdhan(settings){
  // settings: {city, country, method, lat, lon}
  try{
    let url;
    if (settings.lat && settings.lon){
      url = `https://api.aladhan.com/v1/timings/${Math.floor(Date.now()/1000)}?latitude=${settings.lat}&longitude=${settings.lon}&method=${settings.method}`;
    } else if (settings.city && settings.country){
      url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(settings.city)}&country=${encodeURIComponent(settings.country)}&method=${settings.method}`;
    } else {
      // fallback to city if provided in defaults
      url = `https://api.aladhan.com/v1/timingsByCity?city=&country=&method=${settings.method}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response not ok");
    const data = await res.json();
    if (data && data.data && data.data.timings){
      // Save raw for offline fallback
      save("lastAdhanResponse", data);
      return {data, url};
    } else {
      throw new Error("Invalid API response");
    }
  }catch(err){
    console.warn("Adhan fetch failed:", err);
    // fallback to last saved
    const cached = load("lastAdhanResponse", null);
    if (cached) return {data: cached, url: null, cached:true};
    throw err;
  }
}

/* ----- Utilities for parsing times (returns Date) ----- */
function parsePrayerTimeToDate(timeStr, referenceDate = new Date()){
  // timeStr like "05:12" or "05:12 (EDT)"
  const t = timeStr.split(" ")[0];
  const [h, m] = t.split(":").map(s=>parseInt(s,10));
  const d = new Date(referenceDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function getNow(){
  return new Date();
}

/* ----- Public page (index.html) ----- */
function initPublicPage(){
  const refreshBtn = document.getElementById("refreshBtn");
  const openAdmin = document.getElementById("openAdmin");
  const locationLine = document.getElementById("locationLine");
  refreshBtn?.addEventListener("click", ()=> loadAndRender(true));
  openAdmin?.addEventListener("click", ()=> window.location.href = "admin.html");

  // initial load
  loadAndRender(false);

  // update countdown every 20s
  setInterval(updateCountdownAndHighlight, 20_000);
}

async function loadAndRender(force=false){
  const settings = load("settings", DEFAULTS);
  const iqamah = load("iqamah", DEFAULTS.iqamah);

  document.getElementById("lastUpdated").textContent = "";
  document.getElementById("apiWarning").textContent = "";

  // show location
  const locationLine = document.getElementById("locationLine");
  if (settings.city && settings.country){
    locationLine.textContent = `${settings.city}, ${settings.country}`;
  } else {
    locationLine.textContent = `Using calculation method ${settings.method}. (Open Admin to set city/country or enable location)`;
  }

  let response;
  try{
    response = await fetchAdhan(settings);
    if (response.cached){
      document.getElementById("apiWarning").textContent = "Using cached Adhan (API unavailable).";
    }
  }catch(e){
    document.getElementById("apiWarning").textContent = "Unable to fetch Adhan times and no cached data available.";
    console.error(e);
    return;
  }

  const timings = response.data.data.timings;
  const dateFor = response.data.data.date && response.data.data.date.readable ? response.data.data.date.readable : (new Date()).toLocaleDateString();
  document.getElementById("lastUpdated").textContent = `Date: ${dateFor} • Last fetched: ${new Date().toLocaleString()}`;

  // Build table
  const tbody = document.querySelector("#prayerTable tbody");
  tbody.innerHTML = "";

  PRAYERS.forEach(prayer => {
    const adhanStr = timings[prayer];
    const iq = iqamah[prayer] || "-";
    const tr = document.createElement("tr");
    tr.dataset.prayer = prayer;
    tr.innerHTML = `
      <td>${prayer}</td>
      <td class="adhan">${adhanStr ?? "-"}</td>
      <td class="iqamah">${iq}</td>
      <td class="status">-</td>
    `;
    tbody.appendChild(tr);
  });

  // Save last fetched (already saved in fetchAdhan) and render highlights
  updateCountdownAndHighlight();
}

/* ----- Countdown / highlighting ----- */
function updateCountdownAndHighlight(){
  const rows = document.querySelectorAll("#prayerTable tbody tr");
  if (!rows || rows.length===0) return;

  const now = getNow();
  // assemble prayer schedule with adhan Date
  let schedule = [];
  rows.forEach(r => {
    const prayer = r.dataset.prayer;
    const adhanCell = r.querySelector(".adhan");
    const adhanText = adhanCell?.textContent?.trim();
    if (!adhanText) return;
    let adhanDate = parsePrayerTimeToDate(adhanText, now);
    // if adhan already passed today and this time is earlier than now by more than 12h, maybe it's for next day - adjust
    if (adhanDate.getTime() < now.getTime() - (1000*60*60*12)){
      adhanDate.setDate(adhanDate.getDate() + 1);
    }
    schedule.push({prayer, adhanDate, row: r});
  });

  // Sort by time
  schedule.sort((a,b)=>a.adhanDate - b.adhanDate);

  // find next prayer
  let next = schedule.find(s => s.adhanDate.getTime() > now.getTime());
  let current = null;
  if (!next){
    // no upcoming today -> next is first tomorrow
    next = schedule[0];
  }

  // find current (just after adhan until iqamah maybe) - we'll mark prayer whose adhan was most recent but within last 90 minutes
  let mostRecent = schedule.slice().reverse().find(s => s.adhanDate.getTime() <= now.getTime());
  if (mostRecent){
    const deltaMin = (now - mostRecent.adhanDate) / 60000;
    if (deltaMin <= 90) current = mostRecent;
  }

  // Clear highlights
  schedule.forEach(s => {
    s.row.classList.remove("highlight");
    const statusCell = s.row.querySelector(".status");
    statusCell.textContent = "-";
  });

  if (current){
    current.row.classList.add("highlight");
    current.row.querySelector(".status").textContent = "Ongoing";
  }

  if (next){
    next.row.classList.add("highlight");
    next.row.querySelector(".status").textContent = "Next";
  }

  // Countdown to next
  const countdownEl = document.getElementById("countdown");
  const diffMs = next.adhanDate - now;
  if (diffMs <= 0){
    countdownEl.textContent = `Next: ${next.prayer} at ${next.adhanDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  } else {
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    countdownEl.textContent = `Next: ${next.prayer} — ${hours>0? hours+"h ":""}${mins}m (at ${next.adhanDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})`;
  }
}

/* ----- Admin page ----- */
function initAdminPage(){
  const settings = load("settings", DEFAULTS);
  const iqamah = load("iqamah", DEFAULTS.iqamah);

  // Fill forms
  const iqForm = document.getElementById("iqamahForm");
  PRAYERS.forEach(p => {
    const input = iqForm.querySelector(`[name="${p}"]`);
    if (input) input.value = iqamah[p] || DEFAULTS.iqamah[p];
  });

  const methodInput = document.getElementById("method");
  const cityInput = document.getElementById("city");
  const countryInput = document.getElementById("country");
  methodInput.value = settings.method ?? DEFAULTS.method;
  cityInput.value = settings.city ?? "";
  countryInput.value = settings.country ?? "";

  iqForm.addEventListener("submit", e=>{
    e.preventDefault();
    const formData = new FormData(iqForm);
    const newIq = {};
    PRAYERS.forEach(p => newIq[p] = formData.get(p));
    save("iqamah", newIq);
    alert("Iqamah times saved locally.");
  });

  document.getElementById("resetIqamah").addEventListener("click", ()=>{
    if (!confirm("Reset Iqamah to defaults?")) return;
    save("iqamah", DEFAULTS.iqamah);
    PRAYERS.forEach(p => {
      const input = iqForm.querySelector(`[name="${p}"]`);
      if (input) input.value = DEFAULTS.iqamah[p];
    });
    alert("Reset.");
  });

  document.getElementById("saveSettings").addEventListener("click", ()=>{
    const newSettings = {
      method: parseInt(methodInput.value,10) || DEFAULTS.method,
      city: cityInput.value.trim(),
      country: countryInput.value.trim()
    };
    save("settings", newSettings);
    alert("Settings saved locally.");
  });

  document.getElementById("tryGeo").addEventListener("click", async ()=>{
    if (!navigator.geolocation) return alert("Geolocation not supported in this browser.");
    navigator.geolocation.getCurrentPosition(async pos=>{
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      save("settings", {method: parseInt(methodInput.value,10)||DEFAULTS.method, lat, lon});
      alert("Saved location (lat/lon) to settings. Public page will use this.");
    }, err=>{
      alert("Geolocation failed: "+err.message);
    }, {timeout:15000});
  });

  document.getElementById("clearCache").addEventListener("click", ()=>{
    if (!confirm("Clear stored Adhan and Iqamah data from this browser?")) return;
    Object.keys(localStorage).forEach(k=>{
      if (k.startsWith("mdq_")) localStorage.removeItem(k);
    });
    alert("Cleared.");
  });
}

/* ----- Expose for pages ----- */
window.initPublicPage = initPublicPage;
window.initAdminPage = initAdminPage;
