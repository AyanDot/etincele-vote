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
const CAT_NAMES = {
  rings: "Rings", bangles: "Bangles & cuffs", bracelets: "Bracelets", earrings: "Earrings",
  necklaces: "Necklaces", anklets: "Anklets", handchains: "Hand chains",
};

// The page says which vote it runs: <body data-votes="votes2" data-products="batch2.json">.
// Without data-products it's the original P001–P104 vote, one photo per product.
const { votes: VOTES = "votes", products: PRODUCTS_URL } = document.body.dataset;
const PRODUCTS = PRODUCTS_URL
  ? (await (await fetch(PRODUCTS_URL)).json()).products
  : Array.from({ length: 104 }, (_, i) => {
      const id = "P" + String(i + 1).padStart(3, "0");
      return { id, photos: [id] };
    });
const IDS = PRODUCTS.map((p) => p.id);
const BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const COUNT = IDS.length;
const imgSrc = (photo) => `${photo.startsWith("N") ? "images2" : "images"}/${photo}.jpg`;
const cover = (id) => imgSrc(BY_ID[id].photos[0]);

const db = getFirestore(initializeApp(firebaseConfig));

// votes[pid] = { Ali: "yes", Jibran: "no", ... }
const votes = {};
let me = load("me");
let idx = 0;
let photoIdx = 0;
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

// A link like …/#N176 opens that product directly (handy for sharing in chat).
function openFromHash() {
  const j = IDS.indexOf(decodeURIComponent(location.hash.slice(1)).toUpperCase());
  if (j < 0) return false;
  idx = j;
  photoIdx = 0;
  return true;
}
const openedFromLink = openFromHash();
window.addEventListener("hashchange", () => { if (openFromHash()) setTab("vote"); });

function positionAtFirstUnvoted() {
  if (positioned || !loaded || !me) return;
  positioned = true;
  if (openedFromLink) return;
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

  const product = BY_ID[id];
  const shown = product.photos[photoIdx];
  const photo = $("#photo");
  if (photo.dataset.photo !== shown) {
    photo.dataset.photo = shown;
    photo.classList.add("loading");
    photo.src = imgSrc(shown);
    // warm up neighbours so swiping feels instant
    [idx + 1, idx - 1].forEach((j) => { if (j >= 0 && j < COUNT) new Image().src = cover(IDS[j]); });
  }

  // Some products have several photos (angles, colours); show them as a thumbnail strip.
  const thumbs = $("#thumbs");
  thumbs.hidden = product.photos.length < 2;
  thumbs.innerHTML = product.photos.length < 2 ? "" : product.photos.map((ph, i) =>
    `<button data-photo="${i}" class="${i === photoIdx ? "on" : ""}" aria-label="Photo ${i + 1}"><img src="${imgSrc(ph)}" alt=""></button>`
  ).join("");

  $("#pid").textContent = id;
  if (product.cat) {
    const inCat = IDS.filter((x) => BY_ID[x].cat === product.cat);
    $("#pos").textContent = `${CAT_NAMES[product.cat]} · ${inCat.indexOf(id) + 1} of ${inCat.length}`;
  } else {
    $("#pos").textContent = `${idx + 1} of ${COUNT}`;
  }
  $("#note").textContent = product.note || "";
  $("#note").hidden = !product.note;
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
      <img loading="lazy" src="${cover(id)}" alt="${id}">
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
  const write = setDoc(doc(db, VOTES, id), { [me]: undo ? deleteField() : val }, { merge: true })
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
  photoIdx = 0;
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
  z.querySelector("img").src = imgSrc(BY_ID[IDS[idx]].photos[photoIdx]);
  z.hidden = false;
});
$("#zoom").addEventListener("click", () => ($("#zoom").hidden = true));
$("#thumbs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-photo]");
  if (!b) return;
  photoIdx = Number(b.dataset.photo);
  renderVote();
});

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
  photoIdx = 0;
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
  collection(db, VOTES),
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
