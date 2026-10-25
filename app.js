var KEY = "yds-kelime-v1";
var GAPS = [1, 3, 7, 14, 30];
var POS = { v: "fiil", n: "isim", adj: "sıfat", adv: "zarf", conj: "bağlaç", prep: "ilgeç", phr: "kalıp", pv: "phrasal verb" };
var POS_ORDER = ["v", "n", "adj", "adv", "conj", "prep", "phr"];
var sprintTimer = null;

var BY_ID = {};
YDS_WORDS.forEach(function (word) { BY_ID[word.id] = word; });
var SPRINT_BY = {};
SPRINT_WORDS.forEach(function (item) { SPRINT_BY[item.id] = item; });
SPRINT_PHRASALS.forEach(function (item) { SPRINT_BY[item.id] = item; });

var state = load();
var ui = { view: initialView(), query: "", pos: "all", bucket: "all", openId: "", note: "", day: 0 };

function blankState() {
  return { cards: {}, log: [], streak: 0, lastDate: "", settings: { fresh: 15, session: 20 }, session: null, quiz: null, sprint: { started: "", log: {}, done: {} }, sprintSession: null };
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch (e) {
    return blankState();
  }
}

function normalize(raw) {
  var next = Object.assign(blankState(), raw || {});
  next.cards = next.cards && typeof next.cards === "object" ? next.cards : {};
  next.log = Array.isArray(next.log) ? next.log : [];
  next.settings = Object.assign({ fresh: 15, session: 20 }, next.settings || {});
  next.settings.fresh = Number(next.settings.fresh) || 15;
  next.settings.session = Number(next.settings.session) || 20;
  if (!next.session || !Array.isArray(next.session.ids)) next.session = null;
  if (!next.quiz || !Array.isArray(next.quiz.items)) next.quiz = null;
  next.sprint = next.sprint && typeof next.sprint === "object" ? next.sprint : { started: "", log: {}, done: {} };
  if (!next.sprint.log) next.sprint.log = {};
  if (!next.sprint.done) next.sprint.done = {};
  if (!next.sprintSession || !Array.isArray(next.sprintSession.queue)) next.sprintSession = null;
  return next;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

function initialView() {
  if (state.sprintSession && state.sprintSession.index < state.sprintSession.queue.length) return "sprint";
  if (state.quiz && !state.quiz.done) return "quiz";
  if (state.session && state.session.index < state.session.ids.length) return "study";
  return "home";
}

function todayKey() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function pad(n) { return String(n).padStart(2, "0"); }

function fmtLeft(ms) {
  var total = Math.floor(Math.max(0, ms) / 1000);
  return Math.floor(total / 60) + ":" + pad(total % 60);
}

function addDays(key, n) {
  var parts = key.split("-").map(Number);
  var dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + n);
  return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
}

function trDate() {
  return new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

function seeded(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  var copy = list.slice();
  var random = rng || Math.random;
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(random() * (i + 1));
    var tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function daySeed() {
  return Number(todayKey().replace(/-/g, ""));
}

function mix(correct, pool, seed) {
  var rng = seeded(seed);
  var seen = {};
  seen[String(correct).trim().toLowerCase()] = true;
  var copy = shuffle(pool.filter(function (item) {
    return !seen[String(item).trim().toLowerCase()];
  }), rng);
  var unique = [];
  copy.forEach(function (item) {
    var key = String(item).trim().toLowerCase();
    if (seen[key] || unique.length >= 4) return;
    seen[key] = true;
    unique.push(item);
  });
  if (unique.length < 4) return null;
  var all = shuffle(unique.concat([correct]), rng);
  return { options: all, a: all.indexOf(correct) };
}

function cardOf(id) {
  return state.cards[id] || null;
}

function ensure(id) {
  if (!state.cards[id]) {
    state.cards[id] = { box: 0, due: todayKey(), seen: 0, ok: 0, bad: 0, star: false, quizOk: 0, quizBad: 0, introduced: "" };
  }
  var card = state.cards[id];
  card.quizOk = card.quizOk || 0;
  card.quizBad = card.quizBad || 0;
  return card;
}

function logResult(ok) {
  state.log.push({ ok: ok ? 1 : 0, d: todayKey() });
  if (state.log.length > 800) state.log = state.log.slice(-800);
  var today = todayKey();
  if (state.lastDate !== today) {
    state.streak = state.lastDate === addDays(today, -1) ? state.streak + 1 : 1;
    state.lastDate = today;
  }
}

function grade(id, rating, fromQuiz) {
  var card = ensure(id);
  var today = todayKey();
  if (!fromQuiz && !card.introduced) card.introduced = today;
  card.seen += 1;
  if (rating === "again") {
    card.bad += 1;
    card.box = 0;
    card.due = today;
    card.lastWrong = Date.now();
    logResult(false);
  } else if (rating === "hard") {
    card.ok += 1;
    card.box = Math.max(card.box, 1);
    card.due = addDays(today, 1);
    logResult(true);
  } else if (rating === "good") {
    card.ok += 1;
    card.box = Math.min(5, card.box + 1);
    card.due = addDays(today, GAPS[card.box - 1]);
    logResult(true);
  } else {
    card.ok += 1;
    card.box = Math.min(5, card.box + 2);
    card.due = addDays(today, GAPS[card.box - 1]);
    logResult(true);
  }
}

function applyQuiz(id, ok) {
  var card = ensure(id);
  var seenBefore = card.seen > 0;
  if (ok) card.quizOk += 1;
  else card.quizBad += 1;
  if (!ok) {
    grade(id, "again", true);
    return;
  }
  if (seenBefore) grade(id, "good", true);
  else logResult(true);
}

function studiedToday() {
  var today = todayKey();
  return state.log.filter(function (row) { return row.d === today; }).length;
}

function accuracy() {
  var rows = state.log.slice(-200);
  if (!rows.length) return null;
  var hit = rows.filter(function (row) { return row.ok; }).length;
  return Math.round((100 * hit) / rows.length);
}

function masteredCount() {
  return Object.keys(state.cards).filter(function (id) { return state.cards[id].box >= 4; }).length;
}

function dueIds() {
  var today = todayKey();
  var ids = [];
  YDS_WORDS.forEach(function (word) {
    var card = cardOf(word.id);
    if (card && card.seen && card.due <= today) ids.push(word.id);
  });
  ids.sort(function (a, b) {
    return cardOf(a).box - cardOf(b).box || cardOf(b).bad - cardOf(a).bad;
  });
  return ids;
}

function freshIds() {
  var ids = [];
  YDS_WORDS.forEach(function (word) {
    var card = cardOf(word.id);
    if (!card || !card.seen) ids.push(word.id);
  });
  return shuffle(ids, seeded(daySeed()));
}

function introducedToday() {
  var today = todayKey();
  var n = 0;
  Object.keys(state.cards).forEach(function (id) {
    if (state.cards[id].introduced === today) n += 1;
  });
  return n;
}

function freshRoom() {
  return Math.max(0, state.settings.fresh - introducedToday());
}

function buildToday() {
  var room = freshRoom();
  return dueIds().concat(freshIds().slice(0, room)).slice(0, state.settings.session);
}

function buildFresh() {
  return freshIds().slice(0, Math.min(state.settings.session, freshRoom()));
}

function buildPos(pos) {
  var today = todayKey();
  var due = [];
  var fresh = [];
  var later = [];
  YDS_WORDS.forEach(function (word) {
    if (word.pos !== pos) return;
    var card = cardOf(word.id);
    if (card && card.seen && card.due <= today) due.push(word.id);
    else if (!card || !card.seen) fresh.push(word.id);
    else later.push(word.id);
  });
  return due.concat(shuffle(fresh, seeded(daySeed() + pos.length))).concat(later).slice(0, state.settings.session);
}

function buildStar() {
  var today = todayKey();
  var due = [];
  var rest = [];
  YDS_WORDS.forEach(function (word) {
    var card = cardOf(word.id);
    if (!card || !card.star) return;
    if (card.seen && card.due <= today) due.push(word.id);
    else rest.push(word.id);
  });
  return due.concat(shuffle(rest)).slice(0, state.settings.session);
}

function buildWrong() {
  var ids = [];
  YDS_WORDS.forEach(function (word) {
    var card = cardOf(word.id);
    if (card && ((card.bad || 0) > 0 || (card.quizBad || 0) > 0)) ids.push(word.id);
  });
  ids.sort(function (a, b) {
    var ca = cardOf(a);
    var cb = cardOf(b);
    return (cb.bad + cb.quizBad) - (ca.bad + ca.quizBad);
  });
  return ids.slice(0, state.settings.session);
}

function startStudy(mode, pos) {
  if (state.session && state.session.index < state.session.ids.length) {
    ui.note = "Açık bir tur var. Önce onu bitir ya da kapat.";
    ui.view = "home";
    render();
    return;
  }
  var ids = [];
  var title = "Bugünkü tur";
  if (mode === "today") { ids = buildToday(); title = "Bugünkü tur"; }
  else if (mode === "fresh") { ids = buildFresh(); title = "Yeni kelimeler"; }
  else if (mode === "pos") { ids = buildPos(pos); title = POS[pos] || "Tür"; }
  else if (mode === "star") { ids = buildStar(); title = "Yıldızlılar"; }
  else if (mode === "wrong") { ids = buildWrong(); title = "Yanlışlar"; }
  if (!ids.length) {
    state.session = null;
    ui.note = emptyReason(mode);
    ui.view = mode === "pos" ? "home" : "study";
    save();
    render();
    return;
  }
  ui.note = "";
  state.session = {
    ids: ids,
    index: 0,
    shown: false,
    title: title,
    cap: ids.length + 25,
    counts: { again: 0, hard: 0, good: 0, easy: 0 }
  };
  ui.view = "study";
  save();
  render();
}

function emptyReason(mode) {
  if (mode === "fresh" || mode === "today") {
    if (!freshRoom() && !dueIds().length) return "Bugünlük yeni kelime hakkın doldu, bekleyen tekrar da yok.";
    if (!freshRoom()) return "Bugünlük yeni kelime hakkın doldu.";
  }
  if (mode === "star") return "Henüz yıldızlı kelime yok. Sözlükten yıldız ekleyebilirsin.";
  if (mode === "wrong") return "Yanlış kutusun boş.";
  return "Bu tur için kelime kalmadı.";
}

function rateCurrent(rating) {
  var session = state.session;
  if (!session || session.index >= session.ids.length) return;
  if (!session.shown && rating !== "again") return;
  var id = session.ids[session.index];
  grade(id, rating);
  if (!session.counts) session.counts = { again: 0, hard: 0, good: 0, easy: 0 };
  session.counts[rating] += 1;
  var ahead = session.ids.indexOf(id, session.index + 1);
  if (rating === "again" && ahead < 0 && session.ids.length < session.cap) {
    session.ids.splice(Math.min(session.index + 4, session.ids.length), 0, id);
  }
  session.index += 1;
  session.shown = false;
  save();
  render();
}

function poolFor(source) {
  if (source === "due") return dueIds().map(function (id) { return BY_ID[id]; });
  if (source === "wrong") {
    return YDS_WORDS.filter(function (word) {
      var card = cardOf(word.id);
      return card && ((card.bad || 0) > 0 || (card.quizBad || 0) > 0);
    });
  }
  return YDS_WORDS.slice();
}

function makeQuestion(word, seed) {
  var wantCloze = seed % 2 === 0;
  if (wantCloze) {
    var same = YDS_WORDS.filter(function (item) { return item.pos === word.pos; }).map(function (item) { return item.w; });
    var cloze = mix(word.w, same, seed);
    if (cloze) {
      return {
        type: "cloze",
        id: word.id,
        prompt: word.cl,
        options: cloze.options,
        a: cloze.a,
        why: word.cl.replace("____", word.w),
        tr: word.tr,
        picked: null
      };
    }
  }
  var mean = mix(word.tr, YDS_WORDS.map(function (item) { return item.tr; }), seed + 3);
  if (!mean) return null;
  return {
    type: "mean",
    id: word.id,
    prompt: word.w,
    pos: word.pos,
    options: mean.options,
    a: mean.a,
    why: word.ex,
    tr: word.tr,
    picked: null
  };
}

function startQuiz(count, source) {
  var pool = shuffle(poolFor(source));
  if (!pool.length) {
    ui.note = source === "due" ? "Bugün bekleyen tekrar yok." : "Bu kaynaktan soru çıkmıyor.";
    ui.view = "quiz";
    render();
    return;
  }
  var chosen = pool.slice(0, Math.min(count, pool.length));
  var salt = Date.now() % 100000;
  var items = [];
  chosen.forEach(function (word, index) {
    var item = makeQuestion(word, salt + index * 97);
    if (item) items.push(item);
  });
  if (items.length < 4) {
    ui.note = "Soru hazırlanamadı.";
    render();
    return;
  }
  ui.note = "";
  state.quiz = { items: items, index: 0, score: 0, done: false, source: source };
  ui.view = "quiz";
  save();
  render();
}

function answerQuiz(index) {
  var quiz = state.quiz;
  if (!quiz || quiz.done) return;
  var item = quiz.items[quiz.index];
  if (item.picked != null) return;
  item.picked = index;
  var ok = index === item.a;
  if (ok) quiz.score += 1;
  if (quiz.source === "day") gradeDayTest(item.id, ok);
  else applyQuiz(item.id, ok);
  save();
  render();
}

function nextQuiz() {
  var quiz = state.quiz;
  if (!quiz) return;
  quiz.index += 1;
  if (quiz.index >= quiz.items.length) {
    quiz.done = true;
    if (quiz.source === "day") {
      state.sprint.done[quiz.day + "-test"] = { score: quiz.score, total: quiz.items.length, at: todayKey() };
    }
  }
  save();
  render();
}

function speak(text) {
  if (!window.speechSynthesis) return;
  var utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function speakId(id, kind) {
  var word = BY_ID[id] || SPRINT_BY[id];
  if (!word) return;
  if (kind === "ex") speak(word.ex);
  else if (kind === "cl" && word.cl) speak(word.cl.replace("____", word.w));
  else speak(word.w);
}

function dots(id) {
  var box = cardOf(id) ? cardOf(id).box : 0;
  var html = "";
  for (var i = 1; i <= 5; i++) html += "<i" + (i <= box ? " class='on'" : "") + "></i>";
  return "<span class='dots' aria-hidden='true'>" + html + "</span>";
}

function gap(text) {
  return esc(text).replace(/____/g, "<span class='gap'>____</span>");
}

function optionList(values, current) {
  return values.map(function (n) {
    return "<option value='" + n + "'" + (Number(current) === n ? " selected" : "") + ">" + n + "</option>";
  }).join("");
}

function render() {
  var view = document.getElementById("view");
  var screen = screens[ui.view] || screens.home;
  view.innerHTML = screen();
  document.querySelectorAll(".rail [data-view]").forEach(function (button) {
    var on = button.dataset.view === ui.view;
    button.classList.toggle("on", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  var learned = document.getElementById("side-learned");
  var due = document.getElementById("side-due");
  var today = document.getElementById("side-today");
  if (learned) learned.textContent = sprintKnown() + " / 700";
  if (due) due.textContent = "Gün " + planDay() + " / 7";
  if (today) today.textContent = sprintPhrasalKnown() + " / 350 fiil";
  window.scrollTo(0, 0);
  armSprintClock();
  var blank = document.getElementById("blank");
  var next = document.getElementById("sprint-next");
  if (blank) {
    blank.focus();
    blank.scrollIntoView({ block: "center", inline: "nearest" });
  } else if (next) next.focus();
}

function pageHead(kicker, title) {
  return "<p class='kicker'>" + esc(kicker) + "</p>" + (title ? "<h2>" + esc(title) + "</h2>" : "");
}

function daysBetween(a, b) {
  var pa = a.split("-").map(Number);
  var pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

function planDay() {
  if (!state.sprint.started) return 1;
  var n = daysBetween(state.sprint.started, todayKey()) + 1;
  if (n < 1) return 1;
  if (n > 7) return 7;
  return n;
}

function chosenDay() {
  return ui.day || planDay();
}

function wordsOn(day) {
  return SPRINT_WORDS.filter(function (item) { return item.day === day; });
}

function phrasalsOn(day) {
  return SPRINT_PHRASALS.filter(function (item) { return item.day === day; });
}

function dayItems(day) {
  return wordsOn(day).concat(phrasalsOn(day));
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blankExample(item) {
  if (!item.ex || !item.w) return "";
  var re = new RegExp("\\b" + escapeRe(item.w) + "\\b", "i");
  if (!re.test(item.ex)) return "";
  return item.ex.replace(re, "____");
}

function dayKind(word, bank, kind, salt) {
  var same = bank.filter(function (item) { return item.pos === word.pos && item.id !== word.id; });
  var pool = same.length >= 8 ? same : bank.filter(function (item) { return item.id !== word.id; });
  if (kind === "mean") {
    var mean = mix(word.tr, pool.map(function (item) { return item.tr; }), salt);
    if (!mean) return null;
    return { type: "mean", id: word.id, prompt: word.w, pos: word.pos, options: mean.options, a: mean.a, why: word.ex, tr: word.tr, picked: null };
  }
  if (kind === "reverse") {
    var heads = mix(word.w, pool.map(function (item) { return item.w; }), salt);
    if (!heads) return null;
    return { type: "reverse", id: word.id, prompt: word.tr, pos: word.pos, options: heads.options, a: heads.a, why: word.ex, tr: word.tr, picked: null };
  }
  if (kind === "cloze") {
    var prompt = blankExample(word);
    if (!prompt) return null;
    var choices = pool.filter(function (item) {
      return !new RegExp("\\b" + escapeRe(item.w) + "\\b", "i").test(word.ex);
    }).map(function (item) { return item.w; });
    var cloze = mix(word.w, choices, salt);
    if (!cloze) return null;
    return { type: "cloze", id: word.id, prompt: prompt, pos: word.pos, options: cloze.options, a: cloze.a, why: word.ex, tr: word.tr, picked: null };
  }
  if (typeof NEAR === "undefined" || !NEAR[word.id]) return null;
  var nearHeads = mix(word.w, pool.map(function (item) { return item.w; }), salt);
  if (!nearHeads) return null;
  return { type: "near", id: word.id, prompt: NEAR[word.id], pos: word.pos, options: nearHeads.options, a: nearHeads.a, why: word.ex, tr: word.tr, picked: null };
}

function ydsSentence(item) {
  var near = (typeof NEAR !== "undefined" && item && NEAR[item.id]) ? NEAR[item.id] : "";
  var ex = item && item.ex ? item.ex : "";
  if (!ex) return near ? nearLine(item.id) : "";
  var re = new RegExp("\\b" + escapeRe(item.w) + "\\b", "i");
  if (near && re.test(ex)) {
    var marked = esc(ex).replace(re, function (found) {
      return "<span class='hit'>" + found + "<span class='hit-near'>" + esc(near) + "</span></span>";
    });
    return "<p class='example yds' lang='en'>" + marked + "</p>";
  }
  return "<p class='example' lang='en'>" + esc(ex) + "</p>" + (near ? nearLine(item.id) : "");
}

function nearLine(id) {
  if (typeof NEAR === "undefined" || !NEAR[id]) return "";
  return "<p class='near' lang='en'><span>Yakın anlam</span>" + esc(NEAR[id]) + "</p>";
}

function gradeDayTest(id, ok) {
  var rec = state.sprint.log[id] || { last: "", m: "", e: "" };
  rec.test = ok ? "good" : "again";
  rec.last = ok ? "good" : "again";
  state.sprint.log[id] = rec;
  logResult(ok);
}

function verbOf(text) {
  var cut = String(text).indexOf(" ");
  return cut < 0 ? text : text.slice(0, cut);
}

function restOf(text) {
  var cut = String(text).indexOf(" ");
  return cut < 0 ? "" : text.slice(cut + 1);
}

var VERB_PAST = {
  break: "broke", bring: "brought", build: "built", catch: "caught", come: "came", do: "did",
  draw: "drew", eat: "ate", fall: "fell", find: "found", foresee: "foresaw", get: "got", give: "gave",
  go: "went", grow: "grew", hang: "hung", hold: "held", cling: "clung", lay: "laid", let: "let",
  make: "made", meet: "met", pay: "paid", put: "put", cut: "cut", set: "set", shut: "shut", run: "ran", see: "saw", sell: "sold", sink: "sank",
  sit: "sat", speak: "spoke", stand: "stood", take: "took", tell: "told", think: "thought",
  uphold: "upheld", wear: "wore", win: "won", withhold: "withheld", write: "wrote", blow: "blew",
  cost: "cost", hit: "hit", read: "read", spread: "spread", quit: "quit",
  cast: "cast", offset: "offset", forecast: "forecast", broadcast: "broadcast",
  keep: "kept", leave: "left", feel: "felt", mean: "meant", sleep: "slept", lead: "led",
  feed: "fed", lose: "lost", send: "sent", spend: "spent", know: "knew", fight: "fought",
  buy: "bought", teach: "taught", seek: "sought", light: "lit"
};
var VERB_DOUBLE = { compel: 1, occur: 1, prefer: 1, refer: 1, omit: 1, stop: 1, plan: 1, drop: 1, shop: 1, expel: 1, propel: 1, shrug: 1, rip: 1, nod: 1 };

function pastOf(verb) {
  var low = verb.toLowerCase();
  if (VERB_PAST[low]) return VERB_PAST[low];
  if (/[^aeiou]y$/i.test(verb)) return verb.slice(0, -1) + "ied";
  if (/e$/i.test(verb)) return verb + "d";
  if (VERB_DOUBLE[low]) return verb + verb.slice(-1) + "ed";
  return verb + "ed";
}

function thirdOf(verb) {
  var low = verb.toLowerCase();
  if (low === "go") return "goes";
  if (low === "do") return "does";
  if (low === "have") return "has";
  if (/[^aeiou]y$/i.test(verb)) return verb.slice(0, -1) + "ies";
  if (/(s|sh|ch|x|z)$/i.test(verb)) return verb + "es";
  return verb + "s";
}

function ingOf(verb) {
  if (/ie$/i.test(verb)) return verb.slice(0, -2) + "ying";
  if (/e$/i.test(verb) && !/ee$/i.test(verb)) return verb.slice(0, -1) + "ing";
  if (VERB_DOUBLE[verb.toLowerCase()]) return verb + verb.slice(-1) + "ing";
  return verb + "ing";
}

function applyKind(base, kind) {
  var verb = verbOf(base);
  var rest = restOf(base);
  var form = verb;
  if (kind === "past") form = pastOf(verb);
  else if (kind === "s") form = thirdOf(verb);
  else if (kind === "ing") form = ingOf(verb);
  return rest ? form + " " + rest : form;
}

function kindOf(base, surface) {
  if (surface.toLowerCase() === applyKind(base, "base").toLowerCase()) return "base";
  if (surface.toLowerCase() === applyKind(base, "past").toLowerCase()) return "past";
  if (surface.toLowerCase() === applyKind(base, "s").toLowerCase()) return "s";
  if (surface.toLowerCase() === applyKind(base, "ing").toLowerCase()) return "ing";
  return "base";
}

function locateForm(item) {
  var ex = item.ex || "";
  var kinds = ["ing", "past", "s", "base"];
  var forms = kinds.map(function (kind) { return { kind: kind, text: applyKind(item.w, kind), whole: true }; });
  forms.sort(function (a, b) { return b.text.length - a.text.length; });
  for (var i = 0; i < forms.length; i++) {
    var re = new RegExp("\\b" + escapeRe(forms[i].text) + "\\b", "ig");
    if (!re.test(ex)) continue;
    re.lastIndex = 0;
    return {
      prompt: ex.replace(re, "----"),
      answer: forms[i].text.toLowerCase(),
      kind: forms[i].kind,
      whole: true
    };
  }
  if (item.w.indexOf(" ") < 0) return null;
  var particle = item.w.split(" ").pop();
  if (!new RegExp("\\b" + escapeRe(particle) + "\\b", "i").test(ex)) return null;
  var verb = verbOf(item.w);
  var verbForms = kinds.map(function (kind) { return { kind: kind, text: applyKind(verb, kind) }; });
  verbForms.sort(function (a, b) { return b.text.length - a.text.length; });
  for (var j = 0; j < verbForms.length; j++) {
    var reVerb = new RegExp("\\b" + escapeRe(verbForms[j].text) + "\\b", "ig");
    if (!reVerb.test(ex)) continue;
    reVerb.lastIndex = 0;
    return {
      prompt: ex.replace(reVerb, "----"),
      answer: verbForms[j].text.toLowerCase(),
      kind: verbForms[j].kind,
      whole: false
    };
  }
  return null;
}

function makeCloze(word, bank, salt) {
  var found = locateForm(word);
  var prompt = found ? found.prompt : "";
  var answer = found ? found.answer : word.w;
  var kind = found ? found.kind : "base";
  var whole = found ? found.whole : word.pos === "pv";
  if (!found) {
    if (word.pos === "n") prompt = "The paper turns on a single ---- .";
    else if (word.pos === "adj") prompt = "The outcome looked ---- to the reviewers.";
    else if (word.pos === "pv") prompt = "The committee was ready to ---- .";
    else if (word.pos === "v") prompt = "The authors needed to ---- the result.";
    else prompt = "The figures changed ---- .";
    answer = word.w;
    kind = "base";
    whole = word.pos === "pv";
  }
  var seen = {};
  var choices = [];
  function pushBase(base) {
    if (choices.length >= 12) return;
    var form = applyKind(base, kind);
    var key = form.toLowerCase();
    if (!key || seen[key] || key === answer.toLowerCase()) return;
    if (new RegExp("\\b" + escapeRe(form) + "\\b", "i").test(prompt)) return;
    seen[key] = true;
    choices.push(form);
  }
  var ordered = shuffle(bank.filter(function (item) { return item.id !== word.id; }), seeded(salt));
  ordered.forEach(function (item) {
    if (whole && item.pos !== word.pos) return;
    if (!whole && item.pos !== "v" && item.pos !== "pv") return;
    pushBase(whole ? item.w : verbOf(item.w));
  });
  if (choices.length < 4) {
    ordered.forEach(function (item) { pushBase(item.w); });
  }
  var cloze = mix(answer, choices, salt);
  if (!cloze) return null;
  return {
    type: "cloze",
    id: word.id,
    prompt: prompt,
    pos: word.pos,
    options: cloze.options,
    a: cloze.a,
    why: word.ex,
    tr: word.tr,
    picked: null
  };
}
function startDayTest(day) {
  if (state.sprintSession && state.sprintSession.index < state.sprintSession.queue.length) {
    ui.note = "Açık bir tur var. Önce onu bitir ya da kapat.";
    ui.view = "home";
    render();
    return;
  }
  var pool = shuffle(dayItems(day));
  if (!pool.length) {
    ui.note = "Bu gün için kart yok.";
    ui.view = "home";
    render();
    return;
  }
  var bank = SPRINT_WORDS.concat(SPRINT_PHRASALS);
  var salt = Date.now() % 100000;
  var items = [];
  pool.forEach(function (word, index) {
    var made = makeCloze(word, bank, salt + index * 97);
    if (made) items.push(made);
  });
  if (items.length < pool.length) {
    ui.note = "Bazı cümleler soru olmadı.";
  } else {
    ui.note = "";
  }
  if (!items.length) {
    ui.note = "Soru hazırlanamadı.";
    render();
    return;
  }
  state.quiz = { items: items, index: 0, score: 0, done: false, source: "day", day: day };
  ui.view = "quiz";
  save();
  render();
}

function isKnown(id) {
  var rec = state.sprint.log[id];
  return !!(rec && rec.last === "good");
}

function sprintKnown() {
  return SPRINT_WORDS.filter(function (item) { return isKnown(item.id); }).length;
}

function sprintPhrasalKnown() {
  return SPRINT_PHRASALS.filter(function (item) { return isKnown(item.id); }).length;
}

function pushItems(queue, items, review, pass) {
  items.forEach(function (item) { queue.push({ id: item.id, review: !!review, pass: pass || 0 }); });
}

function morningQueue(day) {
  var words = wordsOn(day);
  var queue = [];
  pushItems(queue, words, false, 1);
  pushItems(queue, words, false, 2);
  return queue;
}

function missedItems(items) {
  return items.filter(function (item) {
    var rec = state.sprint.log[item.id];
    return rec && rec.last !== "good";
  });
}

function eveningQueue(day) {
  var queue = [];
  if (day > 1) {
    pushItems(queue, missedItems(wordsOn(day - 1)), true, 0);
    pushItems(queue, missedItems(phrasalsOn(day - 1)), true, 0);
  }
  var verbs = phrasalsOn(day);
  pushItems(queue, verbs, false, 1);
  pushItems(queue, verbs, false, 2);
  return queue;
}

function reviewQueue() {
  var weakW = SPRINT_WORDS.filter(function (item) { return !isKnown(item.id); });
  var weakP = SPRINT_PHRASALS.filter(function (item) { return !isKnown(item.id); });
  var queue = [];
  pushItems(queue, shuffle(weakW.length ? weakW : SPRINT_WORDS).slice(0, 30), true);
  pushItems(queue, shuffle(weakP.length ? weakP : SPRINT_PHRASALS).slice(0, 15), true);
  return queue;
}

function startSprint(slot, day) {
  if (state.sprintSession && state.sprintSession.index < state.sprintSession.queue.length) {
    ui.note = "Açık bir tur var. Önce onu bitir ya da kapat.";
    ui.view = "home";
    render();
    return;
  }
  if (!state.sprint.started) state.sprint.started = todayKey();
  var queue = slot === "morning" ? morningQueue(day) : slot === "evening" ? eveningQueue(day) : reviewQueue();
  if (!queue.length) {
    ui.note = "Bu tur için kart yok.";
    render();
    return;
  }
  state.sprintSession = {
    slot: slot,
    day: day,
    queue: queue,
    index: 0,
    shown: false,
    deadline: Date.now() + (slot === "morning" ? 40 : slot === "evening" ? 50 : 10) * 60 * 1000,
    cap: queue.length,
    counts: { good: 0, again: 0 }
  };
  ui.view = "sprint";
  ui.note = "";
  save();
  render();
}

function foldAnswer(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[’']/g, "")
    .replace(/[^a-zçğıöşü\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemAnswer(text) {
  return foldAnswer(text).split(" ").filter(Boolean).map(function (word) {
    if (word.length > 4 && /(mek|mak)$/.test(word)) return word.slice(0, -3);
    return word;
  }).join(" ");
}

function meansMatch(input, tr) {
  var given = stemAnswer(input);
  if (given.length < 2) return false;
  var parts = String(tr || "").split(/[,;/]|\s+ve\s+/).map(stemAnswer).filter(Boolean);
  return parts.some(function (part) {
    if (given === part) return true;
    if (part.indexOf(given) === 0 && given.length >= Math.min(4, part.length)) return true;
    var head = part.split(" ")[0];
    if (head.length >= 4 && given === head) return true;
    if (part.length >= 4 && given.indexOf(part) >= 0) return true;
    var tokens = part.split(" ").filter(function (word) { return word.length >= 6; });
    return tokens.some(function (word) { return given.indexOf(word) >= 0; });
  });
}

function checkSprint(forceAgain) {
  var session = state.sprintSession;
  if (!session || session.verdict || session.index >= session.queue.length) return;
  var card = session.queue[session.index];
  var item = SPRINT_BY[card.id];
  var input = document.getElementById("blank");
  var typed = input ? input.value : (session.typed || "");
  session.typed = typed;
  session.verdict = !forceAgain && meansMatch(typed, item.tr) ? "good" : "again";
  session.shown = true;
  save();
  render();
}

function acceptSprint() {
  var session = state.sprintSession;
  if (!session || !session.verdict) return;
  var rating = session.verdict;
  session.verdict = "";
  session.typed = "";
  rateSprint(rating);
}

function rateSprint(rating) {
  var session = state.sprintSession;
  if (!session || session.index >= session.queue.length) return;
  if (!session.shown && rating !== "again") return;
  var card = session.queue[session.index];
  var rec = state.sprint.log[card.id] || { last: "", m: "", e: "" };
  rec.last = rating;
  if (card.review) rec.review = rating;
  else if (session.slot === "morning") rec.m = rating;
  else rec.e = rating;
  state.sprint.log[card.id] = rec;
  session.counts[rating] += 1;
  session.index += 1;
  session.shown = false;
  session.verdict = "";
  session.typed = "";
  if (session.index >= session.queue.length) {
    state.sprint.done[session.day + "-" + session.slot] = { good: session.counts.good, again: session.counts.again, at: todayKey() };
  }
  logResult(rating === "good");
  save();
  render();
}

function armSprintClock() {
  clearInterval(sprintTimer);
  if (ui.view !== "sprint" || !state.sprintSession || state.sprintSession.index >= state.sprintSession.queue.length) return;
  sprintTimer = setInterval(function () {
    var el = document.getElementById("clock");
    if (!el || !state.sprintSession) return;
    var left = state.sprintSession.deadline - Date.now();
    el.textContent = left > 0 ? fmtLeft(left) : "süre doldu";
  }, 500);
}

function sprintHome() {
  var day = chosenDay();
  var cal = planDay();
  var weekOver = state.sprint.started && daysBetween(state.sprint.started, todayKey()) >= 7;
  var morningDone = state.sprint.done[day + "-morning"];
  var eveningDone = state.sprint.done[day + "-evening"];
  var dayKnown = wordsOn(day).filter(function (item) { return isKnown(item.id); }).length;
  var dayPv = phrasalsOn(day).filter(function (item) { return isKnown(item.id); }).length;
  var active = state.sprintSession && state.sprintSession.index < state.sprintSession.queue.length;
  var grid = [1, 2, 3, 4, 5, 6, 7].map(function (n) {
    var known = wordsOn(n).filter(function (item) { return isKnown(item.id); }).length;
    var cls = "daychip" + (n === day ? " now" : "") + (state.sprint.done[n + "-evening"] ? " done" : "");
    return "<button type='button' class='" + cls + "' data-act='pick-day' data-day='" + n + "'><b>Gün " + n + "</b><small>" + known + "/100</small></button>";
  }).join("");
  var banner = "";
  if (active) {
    var left = state.sprintSession.queue.length - state.sprintSession.index;
    banner = "<div class='panel'><h3>Tur açık</h3><p>" + left + " kart kaldı.</p><p class='actions'><button class='btn' data-act='go' data-view='sprint'>Devam et</button> <button class='btn ghost' data-act='drop-sprint'>Turu kapat</button></p></div>";
  }
  var title = weekOver ? "Hafta doldu" : "Gün " + day;
  var lead = weekOver
    ? "Yedi gün bitti. Son cevabı Bildim olan kelime, o an için geçmiş sayılır. Bu kalıcı ezber değildir. Günde 10 dakika karışık tur, silinmeyi yavaşlatır."
    : "Günde 90 dakika. Sabah 40 dakikada 100 kelime iki tur. Akşam 50 dakikada 50 phrasal verb iki tur, artı dünün kaçanları.";
  return pageHead(trDate() + " · takvim günü " + cal, title) +
    "<p class='lead'>" + lead + "</p>" +
    "<div class='stats'>" +
      stat(sprintKnown() + "/700", "son cevap Bildim") +
      stat(sprintPhrasalKnown() + "/350", "phrasal verb") +
      stat(dayKnown + "/100", "bugünkü kelime") +
      stat(dayPv + "/50", "bugünkü fiil") +
    "</div>" +
    "<p class='muted'>Her kelime ve her fiil aynı gün iki kez sorulur. Geçen kart, son cevabı Bildim olandır. Dünün kaçanı ertesi akşam başa gelir.</p>" +
    "<div class='daygrid'>" + grid + "</div>" +
    (ui.note ? "<p class='note'>" + esc(ui.note) + "</p>" : "") +
    banner +
    "<div class='panel'><h3>Sabah · 40 dk</h3><p>100 kelime, art arda iki tur. 200 kart." + (morningDone ? " Tur bitti: " + morningDone.good + " bildim, " + morningDone.again + " tekrar." : "") + "</p><button class='btn' data-act='start-sprint' data-slot='morning' data-day='" + day + "'>Sabah turunu aç</button></div>" +
    "<div class='panel'><h3>Akşam · 50 dk</h3><p>" + (day > 1 ? "Önce dünün kaçanları, sonra " : "") + "50 phrasal verb, iki tur." + (eveningDone ? " Tur bitti: " + eveningDone.good + " bildim, " + eveningDone.again + " tekrar." : "") + "</p><button class='btn' data-act='start-sprint' data-slot='evening' data-day='" + day + "'>Akşam turunu aç</button></div>" +
    "<div class='panel'><h3>Gün sonu testi</h3><p>Günün " + dayItems(day).length + " kelime ve fiili. Her soru bir cümle: boşluğa uygun kelime veya ifade, beş şık. Doğru olan geçmiş sayılır. Yanlış olan ertesi akşam döner." + (state.sprint.done[day + "-test"] ? " Son test: " + state.sprint.done[day + "-test"].score + "/" + state.sprint.done[day + "-test"].total + "." : "") + "</p><button class='btn' data-act='start-day-test' data-day='" + day + "'>Testi aç · " + dayItems(day).length + " soru</button></div>" +
    (weekOver ? "<div class='panel'><h3>Kalıcı tutmak</h3><p>10 dakika. Bilmediğin 30 kelime ve 15 phrasal verb.</p><button class='btn ghost' data-act='start-sprint' data-slot='review' data-day='" + day + "'>Karışık tur</button></div>" : "");
}

function sprintHtml() {
  var session = state.sprintSession;
  if (!session) return sprintHome();
  var slotName = session.slot === "morning" ? "Sabah" : session.slot === "evening" ? "Akşam" : "Karışık";
  if (session.index >= session.queue.length) {
    var testTotal = dayItems(session.day).length;
    var testBtn = session.slot !== "review"
      ? "<button class='btn' data-act='start-day-test' data-day='" + session.day + "'>Gün sonu testi · " + testTotal + " soru</button> "
      : "";
    return pageHead(slotName + " · gün " + session.day, "Tur bitti") +
      "<div class='stats'>" +
        stat(session.counts.good, "bildim") +
        stat(session.counts.again, "tekrar") +
      "</div>" +
      "<p class='muted'>" + (session.slot === "morning" ? "Akşam turu 50 dakika: 50 phrasal verb, iki kez. Gün sonu testi, cümledeki boşluğa uygun kelimeyi sorar." : "Bugünün kaçanları yarın akşam başa gelir. Gün sonu testi, cümledeki boşluğa uygun kelimeyi sorar.") + "</p>" +
      "<p class='actions'>" + testBtn + "<button class='btn ghost' data-act='drop-sprint'>Masaya dön</button></p>";
  }
  var card = session.queue[session.index];
  var item = SPRINT_BY[card.id];
  var left = session.deadline - Date.now();
  var clock = left > 0 ? fmtLeft(left) : "süre doldu";
  var kind = item.pos === "pv" ? "phrasal verb" : (POS[item.pos] || item.pos);
  var pill = card.review ? "dünden · " + kind : (card.pass === 2 ? "2. tur" : "1. tur") + " · " + kind;
  var body = "<p class='kicker'>" + esc(slotName) + " · " + (session.index + 1) + " / " + session.queue.length + "</p>" +
    "<p class='clock' id='clock'>" + clock + "</p>" +
    "<article class='sheet'><p class='pos-pill'>" + esc(pill) + "</p>" +
    "<h2 class='word' lang='en'>" + esc(item.w) + "</h2>" +
    "<p class='actions'><button class='btn ghost' data-act='speak' data-id='" + item.id + "' data-kind='w'>Dinle</button></p><div class='answer'>" +
    ydsSentence(item);
  if (!session.verdict) {
    body += "<p class='cloze-line'><span class='gap'>____</span> <input id='blank' class='gap-input' lang='tr' autocomplete='off' autocapitalize='off' spellcheck='false' enterkeyhint='done' placeholder='Türkçe anlam' value='" + esc(session.typed || "") + "'></p>" +
      "<p class='actions'><button class='btn' data-act='check-sprint'>Kontrol et</button> <button class='btn ghost' data-act='miss-sprint'>Bilmiyorum</button></p>" +
      "<p class='muted'>Anlamı boşluğa yaz. Enter kontrol eder.</p>";
  } else {
    var ok = session.verdict === "good";
    body += "<p class='verdict " + (ok ? "ok" : "bad") + "'>" + (ok ? "Doğru. Bildim sayıldı." : "Yanlış. Tekrar sayıldı.") + "</p>" +
      "<p class='tr'>" + esc(item.tr) + "</p>" +
      (session.typed ? "<p class='muted'>Yazdığın: " + esc(session.typed) + "</p>" : "") +
      "<p class='actions'><button class='btn' id='sprint-next' data-act='next-sprint'>Devam</button></p>";
  }
  body += "</div></article>";
  return body;
}

var screens = {
  home: function () { return sprintHome(); },
  sprint: function () { return sprintHtml(); },
  study: function () {
    if (!state.session) {
      return pageHead("Kartlar", "Nasıl çalışalım") +
        "<p class='muted'>Anlamı açmadan puan vermek yok. Bilmiyorsan kartı geri bırak.</p>" +
        (ui.note ? "<p class='note'>" + esc(ui.note) + "</p>" : "") +
        planHtml(false);
    }
    return studyHtml();
  },
  quiz: function () {
    if (!state.quiz) {
      return pageHead("Test", "Beş şık") +
        "<p class='lead'>Soruların yarısı Türkçe anlam, yarısı cümlede boşluk. Seçenekler A'dan E'ye. Yanlış yaptığın kelime tekrar kuyruğuna girer.</p>" +
        (ui.note ? "<p class='note'>" + esc(ui.note) + "</p>" : "") +
        "<div class='actions'>" +
          "<button class='btn' data-act='start-quiz' data-n='10' data-source='mix'>10 soru, karışık</button>" +
          "<button class='btn' data-act='start-quiz' data-n='20' data-source='mix'>20 soru, karışık</button>" +
          "<button class='btn ghost' data-act='start-quiz' data-n='10' data-source='due'>Tekrarlardan</button>" +
          "<button class='btn ghost' data-act='start-quiz' data-n='10' data-source='wrong'>Yanlışlardan</button>" +
        "</div>";
    }
    return quizHtml();
  },
  list: function () { return listHtml(); },
  backup: function () {
    return pageHead("Kayıt", "Bu tarayıcıda durur") +
      "<p>Dışa aktarırsan seriyi, kutuları ve yıldızları dosyaya alırsın. İçe aktarmak bu tarayıcıdaki kaydın üstüne yazar.</p>" +
      "<p class='actions'><button class='btn' data-act='export'>Dışa aktar</button> <label class='btn ghost'>İçe aktar<input id='import-file' type='file' accept='application/json' hidden></label></p>" +
      "<p><button class='btn ghost' data-act='reset'>Kaydı sil</button></p>";
  }
};

function stat(value, label) {
  return "<div class='stat'><b>" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
}

function planHtml(active) {
  if (active) {
    var left = state.session.ids.length - state.session.index;
    return "<div class='panel'><h3>" + esc(state.session.title) + " açık</h3><p>" + left + " kart kaldı.</p><p class='actions'><button class='btn' data-act='go' data-view='study'>Tura devam et</button> <button class='btn ghost' data-act='drop-session'>Turu kapat</button></p></div>";
  }
  var due = dueIds().length;
  var room = freshRoom();
  return "<div class='panel'><h3>Tur</h3><p>" + due + " tekrar ve bugün en fazla " + room + " yeni kelime.</p>" +
    "<div class='actions'>" +
      "<button class='btn' data-act='start' data-mode='today'>Çalışmaya başla</button>" +
      "<button class='btn ghost' data-act='start' data-mode='fresh'>Sadece yeni</button>" +
      "<button class='btn ghost' data-act='start' data-mode='star'>Yıldızlılar</button>" +
      "<button class='btn ghost' data-act='start' data-mode='wrong'>Yanlışlar</button>" +
    "</div>" +
    "<div class='fields'>" +
      "<label>Günlük yeni kelime<select id='set-fresh'>" + optionList([10, 15, 20, 30], state.settings.fresh) + "</select></label>" +
      "<label>Tur uzunluğu<select id='set-session'>" + optionList([10, 20, 40], state.settings.session) + "</select></label>" +
    "</div></div>";
}

function posCards() {
  return POS_ORDER.map(function (pos) {
    var rows = YDS_WORDS.filter(function (word) { return word.pos === pos; });
    var known = rows.filter(function (word) {
      var card = cardOf(word.id);
      return card && card.box >= 4;
    }).length;
    return "<button class='pos-card' data-act='start' data-mode='pos' data-pos='" + pos + "'><b>" + POS[pos] + "</b><span class='muted'>" + known + " / " + rows.length + " oturmuş</span></button>";
  }).join("");
}

function studyHtml() {
  var session = state.session;
  if (session.index >= session.ids.length) {
    var counts = session.counts || { again: 0, hard: 0, good: 0, easy: 0 };
    return pageHead(session.title, "Tur bitti") +
      "<div class='stats'>" +
        stat(counts.easy, "kolay") +
        stat(counts.good, "bildim") +
        stat(counts.hard, "zor") +
        stat(counts.again, "bilmiyorum") +
      "</div>" +
      "<p class='actions'><button class='btn' data-act='start' data-mode='today'>Bir tur daha</button> <button class='btn ghost' data-act='drop-session'>Masaya dön</button></p>";
  }
  var word = BY_ID[session.ids[session.index]];
  var step = session.index + 1;
  var body = pageHead(session.title + " · " + step + " / " + session.ids.length, "") +
    "<article class='sheet'><p class='pos-pill'>" + esc(POS[word.pos] || word.pos) + "</p>" +
    "<h2 class='word' lang='en'>" + esc(word.w) + "</h2>" +
    "<p class='actions'><button class='btn ghost' data-act='speak' data-id='" + word.id + "' data-kind='w'>Dinle</button></p>" +
    "<div class='answer'>" + ydsSentence(word);
  if (!session.shown) {
    body += "<button class='btn' data-act='reveal'>Anlamı göster</button><p class='muted'>Önce kendin söyle.</p>";
  } else {
    body += "<p class='tr'>" + esc(word.tr) + "</p>" +
      "<p class='example muted' lang='en'>" + esc(word.cl.replace("____", word.w)) + "</p>" +
      "<p class='actions'><button class='btn ghost' data-act='speak' data-id='" + word.id + "' data-kind='ex'>Cümleyi dinle</button></p>";
  }
  body += "</div></article>";
  if (!session.shown) {
    body += "<p class='actions'><button class='btn ghost' data-act='rate' data-rate='again'>Bilmiyorum</button></p>";
  } else {
    body += "<div class='rates'>" +
      rateBtn("again", "Bilmiyorum", "bugün") +
      rateBtn("hard", "Zor", "yarın") +
      rateBtn("good", "Bildim", "aralık uzar") +
      rateBtn("easy", "Kolay", "daha seyrek") +
      "</div><p class='muted'>Tuşlar: 1 bilmiyorum, 2 zor, 3 bildim, 4 kolay. Boşluk anlamı açar.</p>";
  }
  return body;
}

function rateBtn(rating, label, hint) {
  return "<button class='rate-" + rating + "' data-act='rate' data-rate='" + rating + "'>" + label + "<small>" + hint + "</small></button>";
}

function quizHtml() {
  var quiz = state.quiz;
  if (quiz.done) {
    var misses = quiz.items.filter(function (item) { return item.picked !== item.a; });
    var pct = Math.round((100 * quiz.score) / quiz.items.length);
    var missHtml = misses.length ? misses.map(function (item) {
      var word = BY_ID[item.id] || SPRINT_BY[item.id];
      return "<li><b lang='en'>" + esc(word.w) + "</b> — " + esc(word.tr) + "</li>";
    }).join("") : "<li>Bu turda yanlış yok.</li>";
    var again = quiz.source === "day"
      ? "<button class='btn' data-act='start-day-test' data-day='" + quiz.day + "'>Testi yeniden aç</button> "
      : "<button class='btn' data-act='start-quiz' data-n='" + quiz.items.length + "' data-source='" + esc(quiz.source || "mix") + "'>Aynı kaynak</button> ";
    return pageHead("Test", quiz.score + " / " + quiz.items.length) +
      "<p class='lead'>" + (quiz.source === "day" ? "Doğrular geçmiş sayılır. Yanlışlar öğrenilmiş sayılmaz ve yarın akşam başa gelir." : "%" + pct + ". 90 puan temposu, soruların yaklaşık %90'ıdır.") + "</p>" +
      "<h3>Yanlışlar</h3><ul>" + missHtml + "</ul>" +
      "<p class='actions'>" + again + "<button class='btn ghost' data-act='drop-quiz'>Kapat</button></p>";
  }
  var item = quiz.items[quiz.index];
  var locked = item.picked != null;
  var step = (quiz.index + 1) + " / " + quiz.items.length;
  var clozeName = quiz.source === "day" ? "Boşluğa uygun kelime veya ifade" : "Cümlede boşluk";
  var head = item.type === "cloze"
    ? "<p class='kicker'>" + clozeName + " · " + step + "</p><p class='passage' lang='en'>" + gap(item.prompt) + "</p>"
    : item.type === "reverse"
      ? "<p class='kicker'>Türkçeden kelime · " + step + "</p><h2 class='word' lang='tr'>" + esc(item.prompt) + "</h2>"
      : item.type === "near"
        ? "<p class='kicker'>Yakın anlam · " + step + "</p><h2 class='word' lang='en'>" + esc(item.prompt) + "</h2>"
        : "<p class='kicker'>Anlam · " + step + "</p><p class='pos-pill'>" + esc(POS[item.pos] || "") + "</p><h2 class='word' lang='en'>" + esc(item.prompt) + "</h2>";
  var options = item.options.map(function (option, index) {
    var cls = "opt";
    if (locked && index === item.a) cls += " right";
    if (locked && index === item.picked && index !== item.a) cls += " wrong";
    return "<button class='" + cls + "' data-act='quiz-pick' data-i='" + index + "'" + (locked ? " disabled" : "") + ">" + "ABCDE"[index] + ") " + esc(option) + "</button>";
  }).join("");
  var why = "";
  if (locked) {
    var ok = item.picked === item.a;
    var src = BY_ID[item.id] || SPRINT_BY[item.id];
    why = "<div class='why'><b>" + (ok ? "Doğru." : "Yanlış.") + "</b><p>" + esc(item.tr) + "</p>" + (src ? ydsSentence(src) : "<p lang='en'>" + esc(item.why) + "</p>") + "</div>" +
      "<p class='actions'><button class='btn' data-act='quiz-next'>" + (quiz.index + 1 === quiz.items.length ? "Sonucu gör" : "Devam") + "</button></p>";
  }
  return head + options + why + (locked ? "" : "<p class='muted'>Tuşlar 1–5.</p>");
}

function filtered() {
  var q = ui.query.trim().toLowerCase();
  var today = todayKey();
  return YDS_WORDS.filter(function (word) {
    if (ui.pos !== "all" && word.pos !== ui.pos) return false;
    var card = cardOf(word.id);
    if (ui.bucket === "star" && !(card && card.star)) return false;
    if (ui.bucket === "due" && !(card && card.seen && card.due <= today)) return false;
    if (ui.bucket === "new" && card && card.seen) return false;
    if (ui.bucket === "learned" && !(card && card.box >= 4)) return false;
    if (!q) return true;
    return word.w.toLowerCase().indexOf(q) >= 0 || word.tr.toLowerCase().indexOf(q) >= 0 || word.ex.toLowerCase().indexOf(q) >= 0;
  });
}

function listHtml() {
  var posOptions = "<option value='all'>Tüm türler</option>" + POS_ORDER.map(function (pos) {
    return "<option value='" + pos + "'" + (ui.pos === pos ? " selected" : "") + ">" + POS[pos] + "</option>";
  }).join("");
  var buckets = [["all", "Hepsi"], ["new", "Yeni"], ["due", "Tekrar"], ["learned", "Oturmuş"], ["star", "Yıldız"]];
  var bucketOptions = buckets.map(function (pair) {
    return "<option value='" + pair[0] + "'" + (ui.bucket === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>";
  }).join("");
  return "<div class='list-head'>" + pageHead("Sözlük", YDS_WORDS.length + " kelime") + "</div>" +
    "<div class='tools'>" +
      "<input id='q' type='search' placeholder='Kelime, anlam veya cümle' value='" + esc(ui.query) + "' autocomplete='off'>" +
      "<select id='set-pos'>" + posOptions + "</select>" +
      "<select id='set-bucket'>" + bucketOptions + "</select>" +
    "</div>" +
    "<p class='muted' id='hit-count'>" + filtered().length + " kelime</p>" +
    "<div id='rows'>" + wordRows() + "</div>";
}

function wordRows() {
  var rows = filtered();
  if (!rows.length) return "<p class='empty'>Bu süzgeçte kelime yok.</p>";
  return rows.map(function (word) {
    var card = cardOf(word.id);
    var open = ui.openId === word.id;
    return "<article class='entry'>" +
      "<button class='entry-main' data-act='open' data-id='" + word.id + "'>" +
        "<span class='entry-word' lang='en'>" + esc(word.w) + "</span>" +
        "<span class='entry-tr'>" + esc(word.tr) + "</span>" +
        "<span class='entry-pos'>" + esc(POS[word.pos] || word.pos) + "</span>" +
        dots(word.id) +
      "</button>" +
      "<button class='star' data-act='star' data-id='" + word.id + "' aria-label='Yıldızla'>" + (card && card.star ? "★" : "☆") + "</button>" +
      (open ? "<div class='entry-more'>" + ydsSentence(word) + "<p class='muted' lang='en'>" + esc(word.cl.replace("____", word.w)) + "</p><button class='btn ghost' data-act='speak' data-id='" + word.id + "' data-kind='w'>Dinle</button></div>" : "") +
      "</article>";
  }).join("");
}

function paintRows() {
  var rows = document.getElementById("rows");
  var count = document.getElementById("hit-count");
  if (rows) rows.innerHTML = wordRows();
  if (count) count.textContent = filtered().length + " kelime";
}

document.addEventListener("click", function (event) {
  var node = event.target.closest("[data-act]");
  if (!node) return;
  var act = node.dataset.act;
  if (act === "go") {
    ui.view = node.dataset.view;
    ui.note = "";
    render();
    return;
  }
  if (act === "pick-day") {
    ui.day = Number(node.dataset.day);
    ui.note = "";
    render();
    return;
  }
  if (act === "start-sprint") {
    startSprint(node.dataset.slot, Number(node.dataset.day) || chosenDay());
    return;
  }
  if (act === "start-day-test") {
    startDayTest(Number(node.dataset.day) || chosenDay());
    return;
  }
  if (act === "check-sprint") { checkSprint(false); return; }
  if (act === "miss-sprint") { checkSprint(true); return; }
  if (act === "next-sprint") { acceptSprint(); return; }
  if (act === "drop-sprint") {
    if (state.sprintSession && state.sprintSession.index < state.sprintSession.queue.length && !confirm("Tur kapatılsın mı? Verdiğin cevaplar durur.")) return;
    state.sprintSession = null;
    ui.view = "home";
    ui.note = "";
    save();
    render();
    return;
  }
  if (act === "start") { startStudy(node.dataset.mode, node.dataset.pos || ""); return; }
  if (act === "reveal") {
    if (state.session) state.session.shown = true;
    save();
    render();
    return;
  }
  if (act === "rate") { rateCurrent(node.dataset.rate); return; }
  if (act === "speak") { speakId(node.dataset.id, node.dataset.kind); return; }
  if (act === "drop-session") {
    if (!confirm("Bu tur kapatılsın mı? Puanladığın kartlar durur.")) return;
    state.session = null;
    ui.view = "home";
    ui.note = "";
    save();
    render();
    return;
  }
  if (act === "start-quiz") { startQuiz(Number(node.dataset.n) || 10, node.dataset.source || "mix"); return; }
  if (act === "quiz-pick") { answerQuiz(Number(node.dataset.i)); return; }
  if (act === "quiz-next") { nextQuiz(); return; }
  if (act === "drop-quiz") {
    state.quiz = null;
    ui.view = "home";
    save();
    render();
    return;
  }
  if (act === "open") {
    ui.openId = ui.openId === node.dataset.id ? "" : node.dataset.id;
    paintRows();
    return;
  }
  if (act === "star") {
    var card = ensure(node.dataset.id);
    card.star = !card.star;
    save();
    if (ui.view === "list") paintRows();
    else render();
    return;
  }
  if (act === "export") exportState();
  if (act === "reset") resetState();
});

document.addEventListener("input", function (event) {
  if (event.target.id !== "q") return;
  ui.query = event.target.value;
  paintRows();
});

document.addEventListener("change", function (event) {
  var id = event.target.id;
  if (id === "set-fresh") {
    state.settings.fresh = Number(event.target.value);
    save();
    render();
    return;
  }
  if (id === "set-session") {
    state.settings.session = Number(event.target.value);
    save();
    render();
    return;
  }
  if (id === "set-pos") {
    ui.pos = event.target.value;
    ui.openId = "";
    paintRows();
    return;
  }
  if (id === "set-bucket") {
    ui.bucket = event.target.value;
    ui.openId = "";
    paintRows();
    return;
  }
  if (id !== "import-file") return;
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var next = JSON.parse(reader.result);
      if (!next || !next.cards) throw new Error("bad");
      state = normalize(next);
      ui.view = "home";
      ui.note = "";
      save();
      render();
    } catch (e) {
      alert("Bu dosya yedek değil.");
    }
  };
  reader.readAsText(file);
});

document.addEventListener("keydown", function (event) {
  var tag = document.activeElement && document.activeElement.tagName;
  var sprint = ui.view === "sprint" && state.sprintSession && state.sprintSession.index < state.sprintSession.queue.length;
  if (sprint && event.key === "Enter") {
    event.preventDefault();
    if (state.sprintSession.verdict) acceptSprint();
    else checkSprint(false);
    return;
  }
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (sprint) {
    if (state.sprintSession.verdict && event.code === "Space") {
      event.preventDefault();
      acceptSprint();
      return;
    }
    if (!state.sprintSession.verdict && event.key === "1") checkSprint(true);
    return;
  }
  if (ui.view === "study" && state.session && state.session.index < state.session.ids.length) {
    if (event.code === "Space") {
      event.preventDefault();
      if (!state.session.shown) {
        state.session.shown = true;
        save();
        render();
      }
      return;
    }
    if (event.key === "1") rateCurrent("again");
    if (state.session.shown && event.key === "2") rateCurrent("hard");
    if (state.session.shown && event.key === "3") rateCurrent("good");
    if (state.session.shown && event.key === "4") rateCurrent("easy");
    return;
  }
  if (ui.view === "quiz" && state.quiz && !state.quiz.done) {
    if (!"12345".includes(event.key)) return;
    var item = state.quiz.items[state.quiz.index];
    if (item.picked != null) return;
    answerQuiz(Number(event.key) - 1);
  }
});

function exportState() {
  var blob = new Blob([JSON.stringify(state)], { type: "application/json" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "kelime-calismasi-yedek.json";
  link.click();
}

function resetState() {
  if (!confirm("Kelime kaydı silinsin mi?")) return;
  localStorage.removeItem(KEY);
  state = blankState();
  ui.view = "home";
  ui.note = "";
  render();
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}

render();
