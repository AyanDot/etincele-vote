import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, deleteField,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCg1Knc4Bm8xbq73aQWxpd-E1Cxx8daQZg",
  authDomain: "etincle.firebaseapp.com",
  projectId: "etincle",
  storageBucket: "etincle.firebasestorage.app",
  messagingSenderId: "1046506841133",
  appId: "1:1046506841133:web:3a6e16bf55f290f9f584a4",
};

const PEOPLE = ["Ali", "Jibran", "Ayan"];
const SHORT = { Ali: "Al", Jibran: "Ji", Ayan: "Ay" };
const COUNT = 104;
const IDS = Array.from({ length: COUNT }, (_, i) => "P" + String(i + 1).padStart(3, "0"));
const imgSrc = (id) => `images/${id}.jpg`;

const db = getFirestore(initializeApp(firebaseConfig));

// votes[pid] = { Ali: "yes", Jibran: "no", ... }
const votes = {};
let me = load("me");
let idx = 0;
let loaded = false;
let positioned = false;
let filter = "waiting";
let onlyMine = false;

const $ = (s) => document.querySelector(s);

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch {} }

function tally(id) {
  const v = votes[id] || {};
  let yes = 0, no = 0;
  for (const p of PEOPLE) {
    if (v[p] === "yes") yes++;
    else if (v[p] === "no") no++;
  }
  const status = yes >= 2 ? "keep" : no >= 2 ? "drop" : "waiting";
  return { yes, no, status };
}

const myVote = (id) => votes[id]?.[me];

function nextUnvoted(from) {
  for (let k = 1; k <= COUNT; k++) {
    const j = (from + k) % COUNT;
    if (!myVote(IDS[j])) return j;
  }
  return null;
}

function positionAtFirstUnvoted() {
  if (positioned || !loaded || !me) return;
  positioned = true;
  const j = nextUnvoted(COUNT - 1);
  if (j !== null) idx = j;
}

/* ---------- screens ---------- */

function showWho() {
  $("#who").hidden = false;
  $("#main").hidden = true;
}

function setMe(name) {
  me = name;
  save("me", name);
  positioned = false;
  positionAtFirstUnvoted();
  $("#who").hidden = true;
  $("#main").hidden = false;
  $("#me").textContent = name;
  render();
}

function setTab(tab) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  $("#view-vote").hidden = tab !== "vote";
  $("#view-results").hidden = tab !== "results";
  window.scrollTo(0, 0);
  render();
}

/* ---------- rendering ---------- */

const LABEL = { keep: "Keep", drop: "Drop", waiting: "Undecided" };

function render() {
  if (!me) return;
  renderVote();
  renderResults();
}

function renderVote() {
  const id = IDS[idx];
  const v = votes[id] || {};
  const { status } = tally(id);

  const photo = $("#photo");
  if (photo.dataset.id !== id) {
    photo.dataset.id = id;
    photo.classList.add("loading");
    photo.src = imgSrc(id);
    // warm up neighbours so swiping feels instant
    [idx + 1, idx - 1].forEach((j) => { if (j >= 0 && j < COUNT) new Image().src = imgSrc(IDS[j]); });
  }

  $("#pid").textContent = id;
  $("#pos").textContent = `${idx + 1} of ${COUNT}`;
  $("#status").innerHTML = loaded ? `<span class="pill ${status}">${LABEL[status]}</span>` : "";

  $("#chips").innerHTML = PEOPLE.map((p) => {
    const val = v[p];
    const mark = val === "yes" ? "✓" : val === "no" ? "✕" : "–";
    return `<span class="chip ${val || ""} ${p === me ? "self" : ""}">${p} ${mark}</span>`;
  }).join("");

  $("#btnYes").classList.toggle("picked", v[me] === "yes");
  $("#btnNo").classList.toggle("picked", v[me] === "no");

  const done = IDS.filter(myVote).length;
  $("#bar").style.width = `${(done / COUNT) * 100}%`;
  $("#progressText").textContent = `You: ${done}/${COUNT}`;
}

function renderResults() {
  const counts = { keep: 0, drop: 0, waiting: 0 };
  IDS.forEach((id) => counts[tally(id).status]++);

  $("#summary").innerHTML = [
    ["keep", "Keep", counts.keep],
    ["drop", "Drop", counts.drop],
    ["waiting", "Undecided", counts.waiting],
    ["all", "All", COUNT],
  ].map(([key, label, n]) =>
    `<button data-filter="${key}" class="${key} ${filter === key ? "on" : ""}"><b>${n}</b><small>${label}</small></button>`
  ).join("");

  const list = currentList();
  $("#empty").hidden = list.length > 0;
  $("#grid").innerHTML = list.map((id) => {
    const v = votes[id] || {};
    const dots = PEOPLE.map((p) => `<i class="${v[p] || ""}" title="${p}">${SHORT[p]}</i>`).join("");
    return `<button class="tile" data-id="${id}">
      <img loading="lazy" src="${imgSrc(id)}" alt="${id}">
      <span class="tmeta"><span class="tid">${id}</span><span class="dots">${dots}</span></span>
    </button>`;
  }).join("");
}

function currentList() {
  return IDS.filter((id) =>
    (filter === "all" || tally(id).status === filter) && (!onlyMine || !myVote(id))
  );
}

/* ---------- actions ---------- */

async function cast(val) {
  const id = IDS[idx];
  const prev = myVote(id);
  const undo = prev === val;
  // Snapshot listener fires immediately with the local write, so the UI updates on its own.
  const write = setDoc(doc(db, "votes", id), { [me]: undo ? deleteField() : val }, { merge: true })
    .catch((e) => { banner(`Couldn't save your vote: ${e.message}`); return "failed"; });
  // don't block auto-advance on slow networks
  const result = await Promise.race([write, new Promise((r) => setTimeout(r, 400))]);
  if (result === "failed") return;
  if (undo || prev) return; // only auto-advance on a fresh vote
  setTimeout(() => {
    if (IDS[idx] !== id) return;
    const j = nextUnvoted(idx);
    if (j === null) toast("You've voted on everything 🎉");
    else go(j);
  }, 250);
}

function go(j) {
  idx = (j + COUNT) % COUNT;
  renderVote();
}

function banner(msg) {
  const b = $("#banner");
  b.textContent = msg;
  b.hidden = !msg;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2000);
}

async function copyList() {
  const list = currentList();
  const name = { keep: "Keep", drop: "Drop", waiting: "Undecided", all: "All" }[filter];
  const text = `${name} (${list.length}): ${list.join(", ") || "none"}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    prompt("Copy this:", text);
  }
}

/* ---------- events ---------- */

document.querySelectorAll("[data-name]").forEach((b) => b.addEventListener("click", () => setMe(b.dataset.name)));
$("#me").addEventListener("click", showWho);
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

$("#btnYes").addEventListener("click", () => cast("yes"));
$("#btnNo").addEventListener("click", () => cast("no"));
$("#prev").addEventListener("click", (e) => { e.stopPropagation(); go(idx - 1); });
$("#next").addEventListener("click", (e) => { e.stopPropagation(); go(idx + 1); });
$("#photo").addEventListener("load", (e) => e.target.classList.remove("loading"));

// swipe left/right on the photo, tap to zoom
let touch = null;
const stage = $("#stage");
stage.addEventListener("touchstart", (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
stage.addEventListener("touchend", (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    e.preventDefault();
    go(idx + (dx < 0 ? 1 : -1));
  }
});
stage.addEventListener("click", (e) => {
  if (e.target.closest(".nav")) return;
  const z = $("#zoom");
  z.querySelector("img").src = imgSrc(IDS[idx]);
  z.hidden = false;
});
$("#zoom").addEventListener("click", () => ($("#zoom").hidden = true));

$("#summary").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  filter = b.dataset.filter;
  renderResults();
});
$("#onlyMine").addEventListener("change", (e) => { onlyMine = e.target.checked; renderResults(); });
$("#copy").addEventListener("click", copyList);
$("#grid").addEventListener("click", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile) return;
  idx = IDS.indexOf(tile.dataset.id);
  setTab("vote");
});

document.addEventListener("keydown", (e) => {
  if (!me || $("#view-vote").hidden) return;
  if (e.key === "Escape") $("#zoom").hidden = true;
  else if (e.key === "ArrowRight") go(idx + 1);
  else if (e.key === "ArrowLeft") go(idx - 1);
  else if (e.key === "y") cast("yes");
  else if (e.key === "n") cast("no");
});

/* ---------- live data ---------- */

// Firestore quietly queues writes while it can't reach the server, so surface that state.
function setSync(state) {
  const el = $("#sync");
  el.className = `sync ${state}`;
  el.textContent = { ok: "Live", saving: "Saving…", offline: "Not connected" }[state];
  if (state === "ok") banner("");
}
setSync("offline");
const offlineWarning = setTimeout(() => {
  if (!loaded) banner("Can't reach the vote database, so votes aren't being saved. Check your connection and reload.");
}, 10000);

onSnapshot(
  collection(db, "votes"),
  { includeMetadataChanges: true },
  (snap) => {
    snap.docChanges().forEach((c) => {
      if (c.type === "removed") delete votes[c.doc.id];
      else votes[c.doc.id] = c.doc.data();
    });
    const { fromCache, hasPendingWrites } = snap.metadata;
    if (!fromCache && !loaded) {
      loaded = true;
      clearTimeout(offlineWarning);
      positionAtFirstUnvoted();
    }
    setSync(fromCache ? "offline" : hasPendingWrites ? "saving" : "ok");
    render();
  },
  (err) => {
    setSync("offline");
    banner(`Can't reach the vote database (${err.code}). ${err.message}`);
  }
);

if (PEOPLE.includes(me)) setMe(me);
else showWho();
