function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState,
  useRef,
  useEffect
} = React;
const SUGGESTIONS = ["Gaming PC", "Logitech MX Master 3S", "AirPods Pro 2", "Nintendo Switch OLED"];
// Canned sample results for the free examples — these never call the API, so they cost nothing.
const DEMO = {
  "Gaming PC": {
    item: "Gaming PC (RTX 4060, 16GB)",
    found: true,
    currency: "USD",
    demo: true,
    summary: "Sample result — building your own from parts is cheapest here, around $749.",
    retailers: [{
      name: "Build your own (parts)",
      price: "749",
      note: "Cheapest — you assemble it",
      cheapest: true
    }, {
      name: "CompuZone",
      price: "899",
      note: "Prebuilt, in stock"
    }, {
      name: "TechBarn",
      price: "949",
      note: "Free shipping"
    }, {
      name: "MegaStore",
      price: "979",
      note: "2–3 day delivery"
    }],
    tips: ["Building it yourself usually saves the most.", "Watch for holiday GPU bundle deals."]
  },
  "Logitech MX Master 3S": {
    item: "Logitech MX Master 3S",
    found: true,
    currency: "USD",
    demo: true,
    summary: "Sample result — Peripheral Plus is cheapest in this example at $89.",
    retailers: [{
      name: "Peripheral Plus",
      price: "89",
      note: "In stock",
      cheapest: true
    }, {
      name: "OfficeHub",
      price: "94",
      note: "Free returns"
    }, {
      name: "MegaStore",
      price: "99",
      note: "Ships today"
    }],
    tips: ["Coupons often knock $10 off mice."]
  },
  "AirPods Pro 2": {
    item: "AirPods Pro 2",
    found: true,
    currency: "USD",
    demo: true,
    summary: "Sample result — SoundDeal leads this example at $199.",
    retailers: [{
      name: "SoundDeal",
      price: "199",
      note: "In stock",
      cheapest: true
    }, {
      name: "AudioMart",
      price: "219",
      note: "Free shipping"
    }, {
      name: "MegaStore",
      price: "229",
      note: "Gift wrap"
    }],
    tips: ["Refurbished units can save 15–20%."]
  },
  "Nintendo Switch OLED": {
    item: "Nintendo Switch OLED",
    found: true,
    currency: "USD",
    demo: true,
    summary: "Sample result — GameNest is cheapest here at $319.",
    retailers: [{
      name: "GameNest",
      price: "319",
      note: "In stock",
      cheapest: true
    }, {
      name: "PlayWorld",
      price: "334",
      note: "Bundle available"
    }, {
      name: "MegaStore",
      price: "349",
      note: "Ships today"
    }],
    tips: ["Bundles with a game can be better value."]
  }
};
const RANKS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
const SYM = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "",
  INR: "₹",
  CAD: "$",
  AUD: "$",
  JPY: "¥"
};
const sym = c => SYM[(c || "").toUpperCase()] ?? "";
function emphasize(t) {
  const e = (t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return e.replace(/([$€£¥₹]\s?\d[\d.,]*)/g, "<b>$1</b>");
}

// ── Local storage (wrapped so a blocked/unavailable store never breaks the app) ──
const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Credits live in memory (works even when browser storage is blocked, e.g. previews),
// and are mirrored to localStorage so they survive a reload when storage is available.
let CREDITS = LS.get("sift.credits", 0);
const COUNTRIES = ["United States", "United Arab Emirates", "United Kingdom", "Canada", "Australia", "Ireland", "New Zealand", "India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Jordan", "Lebanon", "Egypt", "Morocco", "Turkey", "Israel", "Germany", "France", "Italy", "Spain", "Portugal", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland", "Iceland", "Poland", "Czech Republic", "Hungary", "Romania", "Greece", "Russia", "Ukraine", "Japan", "China", "South Korea", "Taiwan", "Hong Kong", "Singapore", "Malaysia", "Indonesia", "Thailand", "Philippines", "Vietnam", "Brazil", "Mexico", "Argentina", "Chile", "Colombia", "Peru", "South Africa", "Nigeria", "Kenya", "Ghana"];
function blankChat() {
  return {
    id: uid(),
    title: "New search",
    turns: [],
    ts: Date.now()
  };
}
function loadChats() {
  const c = LS.get("sift.chats", null);
  return Array.isArray(c) && c.length ? c : [blankChat()];
}
function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 7) return d + "d ago";
  return new Date(ts).toLocaleDateString();
}
async function api(body, signal) {
  const r = await fetch("/api/search", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });
  const raw = await r.text();
  let d;
  try {
    d = raw ? JSON.parse(raw) : {};
  } catch (e) {
    throw new Error("Backend not reachable \u2014 the /api/search function isn't running here. Deploy it (Vercel) or run `vercel dev`. A plain static file server won't run it.");
  }
  if (!r.ok) {
    const err = new Error(d.error || "Request failed");
    if (d.paywall) err.paywall = true; // 402 — free searches used up
    if (d.capped) err.capped = true; // 503 — global daily ceiling hit
    throw err;
  }
  return d;
}
function App() {
  const initial = useRef(loadChats()).current;
  const [chats, setChats] = useState(initial);
  const [activeId, setActiveId] = useState(initial[0].id);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  function stopSearch() {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    updateTurns(t => t.filter(x => x.status !== "loading"));
    setBusy(false);
  }
  const [gate, setGate] = useState(null); // null | "capped"
  const [view, setView] = useState("app"); // "app" | "plans"
  const [drawer, setDrawer] = useState(false); // history drawer open?
  const [credits, setCredits] = useState(CREDITS); // reactive copy for display
  const [purchased, setPurchased] = useState(false); // show purchase-success popup
  const [country, setCountry] = useState(() => LS.get("sift.country", "United States"));
  function pickCountry(c) { setCountry(c); LS.set("sift.country", c); }
  // Tell the AI which country's stores/currency to use, without cluttering the
  // displayed product title. Used only for real price searches.
  const withCountry = it => it + " \u2014 find current prices from retailers in " + country + ", shown in " + country + "'s local currency";
  const feedRef = useRef(null);
  const active = chats.find(c => c.id === activeId) || chats[0];
  const turns = active ? active.turns : [];

  // Persist chats whenever they change.
  useEffect(() => {
    LS.set("sift.chats", chats);
  }, [chats]);
  // Auto-scroll to the newest result while searching / when a turn updates.
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [turns, busy, gate]);
  // When switching chats, jump back to the top so you can scroll down through it.
  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "auto"
    });
  }, [activeId]);

  // 0 free real searches. Real searches need a paid pass (credits). The free
  // examples (chips) are canned demos and don't count or call the API.
  function syncCredits() { LS.set("sift.credits", CREDITS); setCredits(CREDITS); }
  function hasPass() {
    return CREDITS > 0;
  }
  function spendCredit() {
    CREDITS = Math.max(0, CREDITS - 1);
    syncCredits();
  }
  function grantCredits(n) {
    CREDITS = CREDITS + n;
    syncCredits();
    setView("app");
    setPurchased(true);
  }

  // Show a canned sample result for a free example — no API call, no cost.
  function showDemo(name) {
    const data = DEMO[name];
    if (!data || busy) return;
    setView("app");
    const idx = turns.length;
    const extra = idx === 0 ? {
      title: name,
      ts: Date.now()
    } : null;
    updateTurns(t => [...t, {
      type: "search",
      item: name,
      status: "done",
      data
    }], extra);
  }

  // Update the active chat's turns (and optionally its title).
  function updateTurns(updater, extra) {
    setChats(cs => cs.map(c => c.id === activeId ? {
      ...c,
      ...(extra || {}),
      turns: updater(c.turns)
    } : c));
  }
  async function runSearch(displayItem) {
    const idx = turns.length;
    const extra = idx === 0 ? {
      title: displayItem,
      ts: Date.now()
    } : null;
    updateTurns(t => [...t, {
      type: "search",
      item: displayItem,
      status: "loading"
    }], extra);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const data = await api({
        mode: "price",
        item: withCountry(displayItem)
      }, ctrl.signal);
      spendCredit();
      updateTurns(t => t.map((x, j) => j === idx ? {
        ...x,
        status: "done",
        data
      } : x));
    } catch (e) {
      if (e.name === "AbortError") return; // user stopped it; stopSearch cleaned up
      if (e.capped) {
        setGate("capped");
        updateTurns(t => t.filter((_, j) => j !== idx));
      } else updateTurns(t => t.map((x, j) => j === idx ? {
        ...x,
        status: "error",
        error: e.message
      } : x));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }
  async function submit(raw) {
    const rawTrim = (raw || "").trim();
    if (!rawTrim || busy) return;
    const item = rawTrim;
    if (!hasPass()) {
      // No free searches for your own items — show the notice card.
      setInput("");
      const idx = turns.length;
      const extra = idx === 0 ? {
        title: item,
        ts: Date.now()
      } : null;
      updateTurns(t => [...t, {
        type: "locked",
        item
      }], extra);
      return;
    }
    setInput("");
    const idx = turns.length;
    const extra = idx === 0 ? {
      title: item,
      ts: Date.now()
    } : null;
    updateTurns(t => [...t, {
      type: "search",
      item,
      status: "thinking"
    }], extra);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const c = await api({
        mode: "clarify",
        item
      }, ctrl.signal);
      if (c && c.clarify && Array.isArray(c.questions) && c.questions.length) {
        updateTurns(t => t.map((x, j) => j === idx ? {
          type: "clarify",
          item,
          intro: c.intro || "A few quick questions to find the right match:",
          questions: c.questions,
          answers: {}
        } : x));
        abortRef.current = null;
        setBusy(false);
      } else {
        updateTurns(t => t.map((x, j) => j === idx ? {
          type: "search",
          item,
          status: "loading"
        } : x));
        const data = await api({
          mode: "price",
          item: withCountry(item)
        }, ctrl.signal);
        spendCredit();
        updateTurns(t => t.map((x, j) => j === idx ? {
          type: "search",
          item,
          status: "done",
          data
        } : x));
        abortRef.current = null;
        setBusy(false);
      }
    } catch (e) {
      if (e.name === "AbortError") return; // user stopped it; stopSearch cleaned up
      if (e.capped) {
        setGate("capped");
        updateTurns(t => t.filter((_, j) => j !== idx));
      } else updateTurns(t => t.map((x, j) => j === idx ? {
        type: "search",
        item,
        status: "error",
        error: e.message
      } : x));
      abortRef.current = null;
      setBusy(false);
    }
  }
  function pick(turnIdx, key, option) {
    updateTurns(t => t.map((x, j) => j === turnIdx ? {
      ...x,
      answers: {
        ...x.answers,
        [key]: option
      }
    } : x));
  }
  function finishClarify(turn) {
    const parts = turn.questions.map(q => turn.answers[q.key]).filter(v => v && !/^no preference$/i.test(v) && !/^any$/i.test(v));
    runSearch(parts.length ? `${turn.item} (${parts.join(", ")})` : turn.item);
  }

  // ── Chat / history management ─────────────────────────────────────────────
  function goHome() {
    setDrawer(false);
    setView("app");
    if (active && active.turns.length === 0) return; // already on an empty chat
    const c = blankChat();
    setChats(cs => [c, ...cs]);
    setActiveId(c.id);
  }
  function openChat(id) {
    setDrawer(false);
    setView("app");
    setActiveId(id);
  }
  function deleteChat(id, e) {
    e.stopPropagation();
    let next = chats.filter(c => c.id !== id);
    if (next.length === 0) next = [blankChat()];
    setChats(next);
    if (id === activeId) setActiveId(next[0].id);
  }
  const ordered = [...chats].sort((a, b) => b.ts - a.ts);
  if (view === "plans") return /*#__PURE__*/React.createElement(PlansView, {
    onBack: () => setView("app"),
    onBuy: grantCredits
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, /*#__PURE__*/React.createElement("button", {
    className: "iconbtn",
    onClick: () => setDrawer(true),
    "aria-label": "History",
    title: "History"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 12a9 9 0 1 0 3-6.7L3 8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 4v4h4M12 8v4l3 2"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "brandwrap",
    onClick: goHome,
    title: "Home \u2014 start a new search"
  }, /*#__PURE__*/React.createElement("div", {
    className: "logo"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18l-2 13H5L3 6z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 6l-1-3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "21",
    r: "0.6",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17",
    cy: "21",
    r: "0.6",
    fill: "#fff"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, "Sift", /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }, ".")))), /*#__PURE__*/React.createElement("div", {
    className: "head-actions"
  }, /*#__PURE__*/React.createElement("select", {
    className: "country-select",
    value: country,
    onChange: e => pickCountry(e.target.value),
    title: "Find prices for this country"
  }, COUNTRIES.map(c => /*#__PURE__*/React.createElement("option", {
    key: c,
    value: c
  }, c))), credits > 0 && /*#__PURE__*/React.createElement("span", {
    className: "credits-pill",
    title: "Searches left"
  }, credits, " left"), /*#__PURE__*/React.createElement("button", {
    className: "ghost",
    onClick: goHome,
    title: "New search"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  })), /*#__PURE__*/React.createElement("span", null, "New")))), /*#__PURE__*/React.createElement("div", {
    className: "rule"
  }), turns.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("h1", null, "Find it for ", /*#__PURE__*/React.createElement("em", null, "less"), "."), /*#__PURE__*/React.createElement("p", null, "Tap a free example below to see how Sift works. To search your own products live across retailers, grab a pass or credits."), /*#__PURE__*/React.createElement("div", {
    className: "chips"
  }, SUGGESTIONS.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: "chip",
    onClick: () => showDemo(s)
  }, s))), /*#__PURE__*/React.createElement("div", {
    className: "fineprint"
  }, "Prices are pulled from around the web and may not always be the lowest available \u2014 with enough searching you might find a better deal somewhere else.")), /*#__PURE__*/React.createElement("div", {
    className: "feed"
  }, turns.map((turn, idx) => /*#__PURE__*/React.createElement("div", {
    className: "turn",
    key: idx
  }, /*#__PURE__*/React.createElement("div", {
    className: "q"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, turn.type === "clarify" ? "Narrowing" : "Cheapest"), /*#__PURE__*/React.createElement("span", {
    className: "item"
  }, turn.item)), turn.type === "search" && turn.status === "thinking" && /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dots"
  }, /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null)), "Understanding your request\u2026")), turn.type === "search" && turn.status === "loading" && /*#__PURE__*/React.createElement(Searching, null), turn.type === "search" && turn.status === "error" && /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "err"
  }, turn.error)), turn.type === "search" && turn.status === "done" && /*#__PURE__*/React.createElement(Result, {
    data: turn.data
  }), turn.type === "locked" && /*#__PURE__*/React.createElement("div", {
    className: "card locked"
  }, /*#__PURE__*/React.createElement("div", {
    className: "locked-msg"
  }, "Searching your own items needs a pass. Try one of the free examples, or buy a pass or credits to unlock your own searches."), /*#__PURE__*/React.createElement("div", {
    className: "locked-chips"
  }, SUGGESTIONS.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: "chip",
    onClick: () => showDemo(s)
  }, s))), /*#__PURE__*/React.createElement("button", {
    className: "locked-cta",
    onClick: () => setView("plans")
  }, "Buy a pass or credits \u2192")), turn.type === "clarify" && /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "clar"
  }, /*#__PURE__*/React.createElement("p", {
    className: "intro"
  }, turn.intro), turn.questions.map(qq => /*#__PURE__*/React.createElement("div", {
    className: "qblock",
    key: qq.key
  }, /*#__PURE__*/React.createElement("div", {
    className: "qt"
  }, qq.q), /*#__PURE__*/React.createElement("div", {
    className: "opts"
  }, qq.options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o,
    className: "opt" + (turn.answers[qq.key] === o ? " sel" : ""),
    onClick: () => pick(idx, qq.key, o)
  }, o))))), /*#__PURE__*/React.createElement("div", {
    className: "clar-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "find",
    onClick: () => finishClarify(turn),
    disabled: busy
  }, "Find best prices"), /*#__PURE__*/React.createElement("button", {
    className: "skip",
    onClick: () => runSearch(turn.item),
    disabled: busy
  }, "Skip \u2014 just search \"", turn.item, "\"")))))), gate === "capped" && /*#__PURE__*/React.createElement("div", {
    className: "turn"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "err"
  }, "Sift has hit its limit for today \u2014 please check back tomorrow. Thanks for your patience."))), /*#__PURE__*/React.createElement("div", {
    ref: feedRef
  })), /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar"
  }, /*#__PURE__*/React.createElement("input", {
    value: input,
    onChange: e => setInput(e.target.value),
    onKeyDown: e => e.key === "Enter" && submit(input),
    placeholder: "What are you looking to buy?",
    disabled: busy
  }), busy ? /*#__PURE__*/React.createElement("button", {
    className: "send stop",
    onClick: stopSearch,
    "aria-label": "Stop search"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "7",
    y: "7",
    width: "10",
    height: "10",
    rx: "2"
  }))) : /*#__PURE__*/React.createElement("button", {
    className: "send",
    onClick: () => submit(input),
    disabled: !input.trim(),
    "aria-label": "Search"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "foot"
  }, "Prices are pulled live and can change \u2014 always confirm on the retailer's site before buying.")), /*#__PURE__*/React.createElement("div", {
    className: "drawer-overlay" + (drawer ? " open" : ""),
    onClick: () => setDrawer(false)
  }), /*#__PURE__*/React.createElement("aside", {
    className: "drawer" + (drawer ? " open" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "drawer-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "drawer-title"
  }, "Your searches"), /*#__PURE__*/React.createElement("button", {
    className: "iconbtn",
    onClick: () => setDrawer(false),
    "aria-label": "Close",
    title: "Close"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })))), /*#__PURE__*/React.createElement("button", {
    className: "newbtn",
    onClick: goHome
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  })), "New search"), /*#__PURE__*/React.createElement("div", {
    className: "chat-list"
  }, ordered.map(c => {
    const last = c.turns.length ? c.turns[c.turns.length - 1].item : null;
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      className: "chat-item" + (c.id === activeId ? " active" : ""),
      onClick: () => openChat(c.id)
    }, /*#__PURE__*/React.createElement("div", {
      className: "chat-main"
    }, /*#__PURE__*/React.createElement("div", {
      className: "chat-name"
    }, c.title || "New search"), /*#__PURE__*/React.createElement("div", {
      className: "chat-meta"
    }, c.turns.length ? `${c.turns.length} search${c.turns.length > 1 ? "es" : ""} · ` : "", relTime(c.ts))), /*#__PURE__*/React.createElement("span", {
      className: "chat-del",
      onClick: e => deleteChat(c.id, e),
      title: "Delete",
      role: "button"
    }, /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
    }))));
  })), /*#__PURE__*/React.createElement("button", {
    className: "memberbtn",
    onClick: () => {
      setDrawer(false);
      setView("plans");
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.1",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17l-5.8 3.3 1.6-6.6L2.6 8.8l6.8-.5z"
  })), "Buy a membership")), purchased && /*#__PURE__*/React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setPurchased(false)
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-check"
  }, "\u2713"), /*#__PURE__*/React.createElement("div", {
    className: "modal-title"
  }, "Purchase successful"), /*#__PURE__*/React.createElement("button", {
    className: "modal-btn",
    onClick: () => setPurchased(false)
  }, "Click here to use your credits"))));
}
function Searching() {
  const STAGES = ["Understanding your request", "Searching the web", "Scanning major retailers", "Reading product pages", "Comparing live prices", "Checking stock & shipping", "Ranking the cheapest first"];
  const THRESH = [2, 5, 9, 13, 17, 21, 26];
  const STORES = ["Amazon", "Walmart", "Best Buy", "Target", "eBay", "Newegg", "Costco", "B&H Photo", "AliExpress", "Noon", "Carrefour", "Argos"];
  const TIPS = ["Prices can change by the hour \u2014 this is live data, not a saved list.", "The cheapest sticker isn't always cheapest after shipping.", "Bigger pack sizes often cut the price per unit.", "Always confirm the price on the retailer's own page before buying.", "A model from last year is often a fraction of the newest one's price."];
  const est = 24;
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const done = THRESH.filter(x => sec >= x).length;
  const active = Math.min(done, STAGES.length - 1);
  const remain = Math.max(0, est - sec);
  const store = STORES[sec % STORES.length];
  const tip = TIPS[Math.floor(sec / 4) % TIPS.length];
  // Eases toward (but never reaches) 99% so the bar always looks like it's
  // moving until the real results arrive and replace this screen.
  const pct = Math.round(99 * (1 - Math.exp(-sec / 10)));
  const headline = active === 2 || active === 3 ? "Checking " + store + "\u2026" : STAGES[active] + "\u2026";
  return /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "searching"
  }, /*#__PURE__*/React.createElement("div", {
    className: "searching-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dots"
  }, /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null)), /*#__PURE__*/React.createElement("span", {
    className: "searching-msg"
  }, headline)), /*#__PURE__*/React.createElement("div", {
    className: "searching-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "searching-fill",
    style: {
      width: pct + "%"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "searching-steps"
  }, STAGES.map((s, i) => {
    const state = i < done ? "done" : i === active ? "active" : "todo";
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "sstep " + state
    }, /*#__PURE__*/React.createElement("span", {
      className: "sstep-dot"
    }, i < done ? "\u2713" : ""), /*#__PURE__*/React.createElement("span", null, s));
  })), /*#__PURE__*/React.createElement("div", {
    className: "searching-meta"
  }, /*#__PURE__*/React.createElement("span", null, remain > 0 ? "Estimated time ~" + remain + "s" : "Wrapping up\u2026"), /*#__PURE__*/React.createElement("span", {
    className: "searching-elapsed"
  }, sec, "s elapsed")), /*#__PURE__*/React.createElement("div", {
    className: "searching-note"
  }, "\uD83D\uDCA1 ", tip)));
}
function Result({
  data
}) {
  const cur = data.currency || "";
  const s = sym(cur);
  const retailers = Array.isArray(data.retailers) ? data.retailers : [];
  if (data.found === false || retailers.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "err"
    }, data.summary || "Couldn't find that item right now. Try a more specific name or model."));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, data.demo && /*#__PURE__*/React.createElement("div", {
    className: "demo-badge"
  }, "Sample example \u2014 buy a pass for real live prices"), data.summary && /*#__PURE__*/React.createElement("div", {
    className: "summary",
    dangerouslySetInnerHTML: {
      __html: emphasize(data.summary)
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "rows"
  }, retailers.map((r, i) => {
    const best = !!r.cheapest || i === 0 && !retailers.some(x => x.cheapest);
    const link = r.url || ("https://www.google.com/search?q=" + encodeURIComponent(data.item + " " + r.name));
    return /*#__PURE__*/React.createElement("div", {
      className: "row" + (best ? " best" : ""),
      key: i,
      style: {
        animationDelay: i * 150 + "ms"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "rank"
    }, RANKS[i] || i + 1 + "th"), /*#__PURE__*/React.createElement("div", {
      className: "info"
    }, /*#__PURE__*/React.createElement("div", {
      className: "store"
    }, /*#__PURE__*/React.createElement("span", {
      className: "name"
    }, r.name), best && /*#__PURE__*/React.createElement("span", {
      className: "badge"
    }, "Best price")), r.note && /*#__PURE__*/React.createElement("div", {
      className: "note"
    }, r.note)), /*#__PURE__*/React.createElement("div", {
      className: "price"
    }, s ? /*#__PURE__*/React.createElement("span", {
      className: "cur"
    }, s) : /*#__PURE__*/React.createElement("span", {
      className: "cur"
    }, cur, " "), r.price), /*#__PURE__*/React.createElement("a", {
      className: "visit",
      href: link,
      target: "_blank",
      rel: "noopener noreferrer"
    }, "Visit", /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.4",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 17L17 7M9 7h8v8"
    }))));
  })), Array.isArray(data.tips) && data.tips.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "tips"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, "Save even more"), /*#__PURE__*/React.createElement("ul", null, data.tips.map((t, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, t)))));
}
function PlansView({
  onBack,
  onBuy
}) {
  const tiers = [{
    name: "Starter",
    price: "20",
    searches: "100",
    each: "20¢ per search",
    featured: false,
    feats: ["100 price searches", "Live prices across retailers", "Local currency & regions", "Search history saved"]
  }, {
    name: "Plus",
    price: "50",
    searches: "300",
    each: "~17¢ per search",
    featured: true,
    feats: ["300 price searches", "Everything in Starter", "Cheaper per search", "Priority, faster results"]
  }, {
    name: "Pro",
    price: "90",
    searches: "600",
    each: "15¢ per search",
    featured: false,
    feats: ["600 price searches", "Everything in Plus", "Best price per search", "Priority support"]
  }];
  const methods = [["card", "••", "Card"]];
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mark"
  }, /*#__PURE__*/React.createElement("div", {
    className: "logo"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18l-2 13H5L3 6z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 6l-1-3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "21",
    r: "0.6",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17",
    cy: "21",
    r: "0.6",
    fill: "#fff"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, "Sift", /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }, "."))), /*#__PURE__*/React.createElement("button", {
    className: "ghost",
    onClick: onBack
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M19 12H5M11 18l-6-6 6-6"
  })), /*#__PURE__*/React.createElement("span", null, "Back to search"))), /*#__PURE__*/React.createElement("div", {
    className: "rule"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mp-test"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4M12 17h.01"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"
  })), "Test mode \u2014 this is a demo. No real payment is processed and the Pay buttons are disabled."), /*#__PURE__*/React.createElement("div", {
    className: "mp-hero"
  }, /*#__PURE__*/React.createElement("h1", null, "Pick a ", /*#__PURE__*/React.createElement("em", null, "membership")), /*#__PURE__*/React.createElement("p", null, "Each membership is a bundle of price searches. Buy more at once and the price per search drops.")), /*#__PURE__*/React.createElement("div", {
    className: "mp-trial"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mp-trial-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mp-trial-tag"
  }, "Starter pass \xB7 one per customer"), /*#__PURE__*/React.createElement("div", {
    className: "mp-trial-title"
  }, "Try 10 searches for $2"), /*#__PURE__*/React.createElement("div", {
    className: "mp-trial-sub"
  }, "A cheap way to test real searches. Limited to one purchase per email.")), /*#__PURE__*/React.createElement("button", {
    className: "mp-trial-buy",
    onClick: () => onBuy(10)
  }, "Buy 10 searches \u2014 $2")), /*#__PURE__*/React.createElement("div", {
    className: "mp-grid"
  }, tiers.map(t => /*#__PURE__*/React.createElement("div", {
    className: "mp-plan" + (t.featured ? " featured" : ""),
    key: t.name
  }, t.featured && /*#__PURE__*/React.createElement("div", {
    className: "mp-ribbon"
  }, "Best value"), /*#__PURE__*/React.createElement("div", {
    className: "mp-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mp-name"
  }, t.name), /*#__PURE__*/React.createElement("div", {
    className: "mp-price"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cur"
  }, "$"), t.price), /*#__PURE__*/React.createElement("div", {
    className: "mp-searches"
  }, /*#__PURE__*/React.createElement("b", null, t.searches), " searches"), /*#__PURE__*/React.createElement("span", {
    className: "mp-each"
  }, t.each)), /*#__PURE__*/React.createElement("ul", {
    className: "mp-feats"
  }, t.feats.map((f, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, f))), /*#__PURE__*/React.createElement("div", {
    className: "mp-paywrap"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mp-buy",
    onClick: () => onBuy(parseInt(t.searches, 10))
  }, "Buy ", t.name, " \u2014 $", t.price))))), /*#__PURE__*/React.createElement("div", {
    className: "mp-methods-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mp-mh"
  }, "Accepted payment methods"), /*#__PURE__*/React.createElement("div", {
    className: "mp-methods"
  }, methods.map(([c, ic, label]) => /*#__PURE__*/React.createElement("div", {
    className: "mp-method",
    key: c
  }, /*#__PURE__*/React.createElement("span", {
    className: "mp-ic " + c
  }, ic), " ", label))), /*#__PURE__*/React.createElement("div", {
    className: "mp-fine"
  }, "One-time purchase \u2014 searches don't expire. By buying you agree to the Terms & Privacy Policy.")), /*#__PURE__*/React.createElement("div", {
    className: "fineprint"
  }, "Prices are pulled from around the web and may not always be the lowest available \u2014 with enough searching you might find a better deal somewhere else."));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
