/**
 * test-harness/app.js — a tiny, no-React client to watch Convex reactivity live.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * The real frontend (React + convex/react's useQuery) doesn't exist yet. This
 * file proves the ONE THING that matters for Phase 1 without waiting on it:
 * that `ConvexClient.onUpdate(api.sessions.get, ...)` fires a callback, with no
 * polling and no manual refresh, the instant another browser tab writes to the
 * same session.
 *
 * `ConvexClient` (from "convex/browser") is the same underlying client
 * `convex/react`'s `useQuery` wraps — this file calls `.onUpdate()` directly
 * instead of going through a React hook. Same websocket, same subscription
 * machinery, zero framework.
 *
 * This is bundled with esbuild (see package.json "test-harness:build") because
 * a bare `import { ConvexClient } from "convex/browser"` doesn't resolve in a
 * plain <script type="module"> — browsers don't do Node-style package
 * resolution. Bundling inlines convex's own code into one file a <script> tag
 * can load directly, no dev server framework required.
 */

import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// The URL this tab's tiny HTML shell injected as `window.__CONVEX_URL__`
// (defaults to the standard `npx convex dev` anonymous local address).
const client = new ConvexClient(window.__CONVEX_URL__ ?? "http://127.0.0.1:3210");

// --- per-tab identity -------------------------------------------------------
// sessionStorage is scoped to ONE BROWSER TAB (unlike localStorage, which is
// shared across every tab on the origin). That's exactly what we want here:
// open this page in two tabs and each tab naturally keeps its OWN
// participant identity across a refresh, with no manual "switch user" step.
const KEY = "neurovision.testharness.membership";

function loadMembership() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveMembership(m) {
  sessionStorage.setItem(KEY, JSON.stringify(m));
}

function clearMembership() {
  sessionStorage.removeItem(KEY);
}

// --- DOM references ---------------------------------------------------------
const el = {
  setupPanel: document.getElementById("setup-panel"),
  roomPanel: document.getElementById("room-panel"),
  scanPicker: document.getElementById("scan-picker"),
  nameInput: document.getElementById("name-input"),
  createBtn: document.getElementById("create-btn"),
  inviteInput: document.getElementById("invite-input"),
  joinBtn: document.getElementById("join-btn"),
  setupError: document.getElementById("setup-error"),

  leaveBtn: document.getElementById("leave-btn"),
  meLabel: document.getElementById("me-label"),
  inviteBox: document.getElementById("invite-box"),
  inviteCodeText: document.getElementById("invite-code-text"),

  plane: document.getElementById("plane-value"),
  sliceIndex: document.getElementById("slice-index-value"),
  sliceCount: document.getElementById("slice-count-value"),
  tumorVisible: document.getElementById("tumor-visible-value"),
  viewVersion: document.getElementById("view-version-value"),
  roster: document.getElementById("roster-list"),
  actionError: document.getElementById("action-error"),
  rawState: document.getElementById("raw-state"),

  presenterControls: document.getElementById("presenter-controls"),
  viewerNotice: document.getElementById("viewer-notice"),
  viewerTryMoveBtn: document.getElementById("viewer-try-move-btn"),
  planeButtons: document.getElementById("plane-buttons"),
  stepBackBtn: document.getElementById("step-back-btn"),
  stepFwdBtn: document.getElementById("step-fwd-btn"),
  sliceJumpInput: document.getElementById("slice-jump-input"),
  sliceJumpBtn: document.getElementById("slice-jump-btn"),
  tumorToggleBtn: document.getElementById("tumor-toggle-btn"),
  resetBtn: document.getElementById("reset-btn"),
  getInviteBtn: document.getElementById("get-invite-btn"),

  chatList: document.getElementById("chat-list"),
  chatInput: document.getElementById("chat-input"),
  chatSendBtn: document.getElementById("chat-send-btn"),
  chatError: document.getElementById("chat-error"),

  annotationList: document.getElementById("annotation-list"),
  annotationText: document.getElementById("annotation-text"),
  annotationX: document.getElementById("annotation-x"),
  annotationY: document.getElementById("annotation-y"),
  annotationZ: document.getElementById("annotation-z"),
  annotationAddBtn: document.getElementById("annotation-add-btn"),
  annotationError: document.getElementById("annotation-error"),
};

// One unsubscribe function per live query (session state, chat, annotations).
let unsubscribers = [];

// The harness shows only the newest page of chat; the React app would use
// usePaginatedQuery to load older pages on scroll.
const CHAT_PAGE = { numItems: 50, cursor: null };

// --- Convex error formatting -------------------------------------------------
// Convex throws a plain Error wrapping a ConvexError for most client-side call
// paths; the structured `{code, message}` payload we throw server-side
// (convex/lib/errors.ts) comes back as `error.data`. Fall back to the raw
// message for anything else (e.g. a validator rejection) so nothing throws an
// unhandled error in this harness.
function describeError(err) {
  const data = err && typeof err === "object" ? err.data : undefined;
  if (data && typeof data === "object" && "code" in data) {
    return `[${data.code}] ${data.message}`;
  }
  return String(err && err.message ? err.message : err);
}

function setError(target, message) {
  target.textContent = message ?? "";
  target.hidden = !message;
}

// --- setup screen -------------------------------------------------------------

async function populateScanPicker() {
  try {
    const scans = await client.query(api.scans.list, {});
    el.scanPicker.innerHTML = "";
    if (scans.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "No scans — run: npx convex run seed:seedSampleScan";
      opt.disabled = true;
      el.scanPicker.appendChild(opt);
      el.createBtn.disabled = true;
      return;
    }
    for (const scan of scans) {
      const opt = document.createElement("option");
      opt.value = scan.scanId;
      opt.textContent = `${scan.displayName}${scan.isFixture ? " (fixture)" : ""}`;
      el.scanPicker.appendChild(opt);
    }
  } catch (err) {
    setError(el.setupError, describeError(err));
  }
}

el.createBtn.addEventListener("click", async () => {
  setError(el.setupError, "");
  const scanId = el.scanPicker.value;
  const hostDisplayName = el.nameInput.value.trim() || "Presenter";
  if (!scanId) {
    setError(el.setupError, "Pick a case first.");
    return;
  }
  try {
    const result = await client.mutation(api.sessions.create, { scanId, hostDisplayName });
    saveMembership({
      sessionId: result.sessionId,
      participantToken: result.participantToken,
      inviteCode: result.inviteCode, // kept client-side only; the server never re-sends this
      role: result.role,
    });
    enterRoom();
  } catch (err) {
    setError(el.setupError, describeError(err));
  }
});

el.joinBtn.addEventListener("click", async () => {
  setError(el.setupError, "");
  const inviteCode = el.inviteInput.value.trim();
  const displayName = el.nameInput.value.trim() || "Viewer";
  if (!inviteCode) {
    setError(el.setupError, "Paste an invite code first.");
    return;
  }
  try {
    const result = await client.mutation(api.sessions.join, { inviteCode, displayName });
    saveMembership({
      sessionId: result.sessionId,
      participantToken: result.participantToken,
      inviteCode: null,
      role: result.role,
    });
    enterRoom();
  } catch (err) {
    setError(el.setupError, describeError(err));
  }
});

// --- room screen --------------------------------------------------------------

function enterRoom() {
  const membership = loadMembership();
  if (!membership) return;

  el.setupPanel.hidden = true;
  el.roomPanel.hidden = false;
  el.meLabel.textContent = `${membership.role === "host" ? "Presenter" : "Viewer"} · session ${membership.sessionId}`;

  if (membership.inviteCode) {
    el.inviteBox.hidden = false;
    el.inviteCodeText.textContent = membership.inviteCode;
  } else {
    el.inviteBox.hidden = true;
  }

  // THIS is the line this whole harness exists to demonstrate: register a
  // callback that Convex re-invokes, with no polling, every time anything this
  // query reads (the session row, the scan row, or any participant row)
  // changes — in this tab or in any other tab/device talking to the same
  // deployment.
  const auth = { sessionId: membership.sessionId, participantToken: membership.participantToken };
  unsubscribers = [
    client.onUpdate(
      api.sessions.get,
      auth,
      (state) => render(state, membership),
      (err) => setError(el.actionError, describeError(err)),
    ),
    // Phase 2: same mechanism, two more subscriptions. A message or note
    // written in the other tab re-runs these and the lists redraw themselves.
    client.onUpdate(
      api.messages.list,
      { ...auth, paginationOpts: CHAT_PAGE },
      (result) => renderChat(result.page),
      (err) => setError(el.chatError, describeError(err)),
    ),
    client.onUpdate(
      api.annotations.list,
      auth,
      (notes) => renderAnnotations(notes, auth),
      (err) => setError(el.annotationError, describeError(err)),
    ),
  ];

  wireActions(membership);
  wireCollaboration(auth);
}

function renderChat(page) {
  setError(el.chatError, "");
  el.chatList.innerHTML = "";
  // The server returns newest first; show oldest at the top like a chat.
  for (const m of [...page].reverse()) {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${m.authorName}${m.author === "agent" ? " (agent)" : ""}: `;
    li.append(who, document.createTextNode(m.text));
    el.chatList.appendChild(li);
  }
  el.chatList.scrollTop = el.chatList.scrollHeight;
}

function renderAnnotations(notes, auth) {
  setError(el.annotationError, "");
  el.annotationList.innerHTML = "";
  for (const n of notes) {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${n.authorName}${n.status === "suggested" ? " (suggested)" : ""}: `;
    const where = document.createElement("code");
    where.textContent = ` @ ${describeAnchor(n.anchor)} `;
    li.append(who, document.createTextNode(n.text), where);
    // canRemove comes from the server, but the server re-checks on remove:
    // hiding the button is a courtesy, not the security boundary.
    if (n.canRemove) {
      const btn = document.createElement("button");
      btn.textContent = "Remove";
      btn.onclick = async () => {
        setError(el.annotationError, "");
        try {
          await client.mutation(api.annotations.remove, { ...auth, annotationId: n.annotationId });
        } catch (err) {
          setError(el.annotationError, describeError(err));
        }
      };
      li.appendChild(btn);
    }
    el.annotationList.appendChild(li);
  }
}

function describeAnchor(anchor) {
  if (anchor.kind === "point") return `RAS (${anchor.ras_mm.join(", ")}) mm`;
  if (anchor.kind === "structure") return `structure ${anchor.id}`;
  return "tumor";
}

function wireCollaboration(auth) {
  el.chatSendBtn.onclick = async () => {
    setError(el.chatError, "");
    try {
      await client.mutation(api.messages.send, { ...auth, text: el.chatInput.value });
      el.chatInput.value = "";
      // No manual append: the messages.list subscription redraws on its own.
    } catch (err) {
      setError(el.chatError, describeError(err));
    }
  };
  el.chatInput.onkeydown = (e) => {
    if (e.key === "Enter") el.chatSendBtn.click();
  };

  el.annotationAddBtn.onclick = async () => {
    setError(el.annotationError, "");
    const ras_mm = [el.annotationX, el.annotationY, el.annotationZ].map((input) => Number(input.value));
    try {
      await client.mutation(api.annotations.create, {
        ...auth,
        text: el.annotationText.value,
        anchor: { kind: "point", ras_mm },
      });
      el.annotationText.value = "";
    } catch (err) {
      setError(el.annotationError, describeError(err));
    }
  };
}

function render(state, membership) {
  setError(el.actionError, "");
  el.plane.textContent = state.view.plane;
  el.sliceIndex.textContent = String(state.view.sliceIndex);
  el.sliceCount.textContent = String(state.view.sliceCount);
  el.tumorVisible.textContent = state.view.tumorVisible ? "visible" : "hidden";
  el.viewVersion.textContent = String(state.view.viewVersion);

  el.roster.innerHTML = "";
  for (const p of state.participants) {
    const li = document.createElement("li");
    li.textContent = `${p.displayName} — ${p.role}${p.participantId === state.me.participantId ? " (you)" : ""}`;
    el.roster.appendChild(li);
  }

  el.presenterControls.hidden = !state.isPresenter;
  el.viewerNotice.hidden = state.isPresenter;

  // Full payload, for comparing side-by-side with the other tab and for
  // confirming no secret (inviteCode, any token) ever appears in it.
  el.rawState.textContent = JSON.stringify(state, null, 2);
}

function wireActions(membership) {
  const run = (command) => async () => {
    setError(el.actionError, "");
    try {
      await client.mutation(api.sessions.updateView, {
        sessionId: membership.sessionId,
        participantToken: membership.participantToken,
        command,
      });
      // No manual re-render here on purpose: the onUpdate callback above will
      // fire on its own once the write commits. If the UI updates anyway, the
      // reactivity is doing its job, not this line.
    } catch (err) {
      setError(el.actionError, describeError(err));
    }
  };

  el.planeButtons.querySelectorAll("button[data-plane]").forEach((btn) => {
    btn.onclick = run({ type: "setPlane", plane: btn.dataset.plane });
  });
  el.stepBackBtn.onclick = run({ type: "stepSlice", delta: -1 });
  el.stepFwdBtn.onclick = run({ type: "stepSlice", delta: 1 });
  el.sliceJumpBtn.onclick = () => {
    const index = Number(el.sliceJumpInput.value);
    run({ type: "setSlice", index })();
  };
  el.tumorToggleBtn.onclick = async () => {
    setError(el.actionError, "");
    try {
      const current = await client.query(api.sessions.get, {
        sessionId: membership.sessionId,
        participantToken: membership.participantToken,
      });
      await run({ type: "setTumorVisible", visible: !current.view.tumorVisible })();
    } catch (err) {
      setError(el.actionError, describeError(err));
    }
  };
  el.resetBtn.onclick = run({ type: "resetView" });

  // These two are only ever reachable from the "you are a viewer" notice, and
  // they deliberately attempt a presenter-only action. Clicking one should
  // produce a NOT_PRESENTER error above, not a change — that's the whole
  // point: the rejection happens on the SERVER, not because the button was
  // hidden from a viewer (sage_context/BACKEND_CONTEXT.md guardrail 5/6).
  el.viewerTryMoveBtn.onclick = run({ type: "stepSlice", delta: 1 });

  el.getInviteBtn.onclick = async () => {
    setError(el.actionError, "");
    try {
      const result = await client.query(api.sessions.getInviteCode, {
        sessionId: membership.sessionId,
        participantToken: membership.participantToken,
      });
      el.inviteBox.hidden = false;
      el.inviteCodeText.textContent = result.inviteCode;
    } catch (err) {
      setError(el.actionError, describeError(err));
    }
  };
}

el.leaveBtn.addEventListener("click", () => {
  for (const stop of unsubscribers) stop();
  unsubscribers = [];
  clearMembership();
  el.roomPanel.hidden = true;
  el.setupPanel.hidden = false;
  populateScanPicker();
});

// --- boot ----------------------------------------------------------------------

const existing = loadMembership();
if (existing) {
  enterRoom();
} else {
  populateScanPicker();
}
