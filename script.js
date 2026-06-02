function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState,
  useRef,
  useEffect
} = React;
const SUGGESTIONS = ["Gaming PC", "Logitech MX Master 3S", "AirPods Pro 2", "Nintendo Switch OLED"];
const FREE_ASKS = 3; // keep in sync with FREE_ASKS in api/search.js
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
async function api(body) {
  const r = await fetch("/api/search", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const d = await r.json();
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
  const [gate, setGate] = useState(null); // null | "paywall" | "capped"
  const [drawer, setDrawer] = useState(false); // history drawer open?
  const asksRef = useRef(LS.get("sift.asks", 0)); // price searches used (mirror of server per-IP count)
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
  function outOfFreeAsks() {
    return asksRef.current >= FREE_ASKS;
  }
  function bumpAsks() {
    asksRef.current += 1;
    LS.set("sift.asks", asksRef.current);
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
    if (outOfFreeAsks()) {
      setGate("paywall");
      return;
    }
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
    bumpAsks();
    try {
      const data = await api({
        mode: "price",
        item: displayItem
      });
      updateTurns(t => t.map((x, j) => j === idx ? {
        ...x,
        status: "done",
        data
      } : x));
    } catch (e) {
      if (e.paywall) {
        setGate("paywall");
        updateTurns(t => t.filter((_, j) => j !== idx));
      } else if (e.capped) {
        setGate("capped");
        updateTurns(t => t.filter((_, j) => j !== idx));
      } else updateTurns(t => t.map((x, j) => j === idx ? {
        ...x,
        status: "error",
        error: e.message
      } : x));
    } finally {
      setBusy(false);
    }
  }
  async function submit(raw) {
    const item = (raw || "").trim();
    if (!item || busy) return;
    if (outOfFreeAsks()) {
      setGate("paywall");
      setInput("");
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
    try {
      const c = await api({
        mode: "clarify",
        item
      });
      if (c && c.clarify && Array.isArray(c.questions) && c.questions.length) {
        updateTurns(t => t.map((x, j) => j === idx ? {
          type: "clarify",
          item,
          intro: c.intro || "A few quick questions to find the right match:",
          questions: c.questions,
          answers: {}
        } : x));
        setBusy(false);
      } else {
        updateTurns(t => t.map((x, j) => j === idx ? {
          type: "search",
          item,
          status: "loading"
        } : x));
        bumpAsks();
        const data = await api({
          mode: "price",
          item
        });
        updateTurns(t => t.map((x, j) => j === idx ? {
          type: "search",
          item,
          status: "done",
          data
        } : x));
        setBusy(false);
      }
    } catch (e) {
      if (e.paywall) {
        setGate("paywall");
        updateTurns(t => t.filter((_, j) => j !== idx));
      } else if (e.capped) {
        setGate("capped");
        updateTurns(t => t.filter((_, j) => j !== idx));
      } else updateTurns(t => t.map((x, j) => j === idx ? {
        type: "search",
        item,
        status: "error",
        error: e.message
      } : x));
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
    setGate(null);
    if (active && active.turns.length === 0) return; // already on an empty chat
    const c = blankChat();
    setChats(cs => [c, ...cs]);
    setActiveId(c.id);
  }
  function openChat(id) {
    setDrawer(false);
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
  }, ".")))), /*#__PURE__*/React.createElement("button", {
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
  })), /*#__PURE__*/React.createElement("span", null, "New"))), /*#__PURE__*/React.createElement("div", {
    className: "rule"
  }), turns.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("h1", null, "Name a thing. I'll find where it's ", /*#__PURE__*/React.createElement("em", null, "cheapest"), "."), /*#__PURE__*/React.createElement("p", null, "Tell me a product \u2014 a gadget, a model number, anything \u2014 and I'll search live prices across retailers and rank them, lowest first. For big things like a PC, I'll ask a couple of quick questions first. Add your country for local results."), /*#__PURE__*/React.createElement("div", {
    className: "chips"
  }, SUGGESTIONS.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: "chip",
    onClick: () => submit(s)
  }, s)))), /*#__PURE__*/React.createElement("div", {
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
  }, /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null)), "Understanding your request\u2026")), turn.type === "search" && turn.status === "loading" && /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dots"
  }, /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null)), "Searching retailers for live prices\u2026")), turn.type === "search" && turn.status === "error" && /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "err"
  }, turn.error)), turn.type === "search" && turn.status === "done" && /*#__PURE__*/React.createElement(Result, {
    data: turn.data
  }), turn.type === "clarify" && /*#__PURE__*/React.createElement("div", {
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
  }, "Skip \u2014 just search \"", turn.item, "\"")))))), gate === "paywall" && /*#__PURE__*/React.createElement("div", {
    className: "turn"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card paywall"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pw-badge"
  }, "Free limit reached"), /*#__PURE__*/React.createElement("h2", {
    className: "pw-title"
  }, "You've used your ", FREE_ASKS, " free searches"), /*#__PURE__*/React.createElement("p", {
    className: "pw-sub"
  }, "Upgrade to ", /*#__PURE__*/React.createElement("b", null, "Sift\xA0Pro"), " for unlimited price hunts, local-currency results, and faster searches."), /*#__PURE__*/React.createElement("div", {
    className: "pw-plan"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pw-plan-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pw-plan-name"
  }, "Sift Pro"), /*#__PURE__*/React.createElement("span", {
    className: "pw-plan-price"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cur"
  }, "$"), "5", /*#__PURE__*/React.createElement("span", {
    className: "per"
  }, "/mo"))), /*#__PURE__*/React.createElement("ul", {
    className: "pw-feats"
  }, /*#__PURE__*/React.createElement("li", null, "Unlimited searches"), /*#__PURE__*/React.createElement("li", null, "Local currency & regional retailers"), /*#__PURE__*/React.createElement("li", null, "Priority, faster results")), /*#__PURE__*/React.createElement("a", {
    className: "pw-cta",
    href: "./plans.html"
  }, "See payment options \u2192")))), gate === "capped" && /*#__PURE__*/React.createElement("div", {
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
    placeholder: gate === "paywall" ? "Upgrade to keep searching…" : "What are you looking to buy?",
    disabled: busy || gate === "paywall"
  }), /*#__PURE__*/React.createElement("button", {
    className: "send",
    onClick: () => submit(input),
    disabled: busy || !input.trim() || gate === "paywall",
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
  }))));
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
  }, data.summary && /*#__PURE__*/React.createElement("div", {
    className: "summary",
    dangerouslySetInnerHTML: {
      __html: emphasize(data.summary)
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "rows"
  }, retailers.map((r, i) => {
    const best = !!r.cheapest || i === 0 && !retailers.some(x => x.cheapest);
    const Tag = r.url ? "a" : "div";
    const props = r.url ? {
      href: r.url,
      target: "_blank",
      rel: "noopener noreferrer"
    } : {};
    return /*#__PURE__*/React.createElement(Tag, _extends({
      className: "row" + (best ? " best" : ""),
      key: i,
      style: {
        animationDelay: i * 60 + "ms"
      }
    }, props), /*#__PURE__*/React.createElement("div", {
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
    }, cur, " "), r.price), /*#__PURE__*/React.createElement("svg", {
      className: "go",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.4",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 17L17 7M9 7h8v8"
    })));
  })), Array.isArray(data.tips) && data.tips.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "tips"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, "Save even more"), /*#__PURE__*/React.createElement("ul", null, data.tips.map((t, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, t)))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));