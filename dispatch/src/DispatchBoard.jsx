import { useState, useRef, useEffect } from "react";

/* ════════════════════════════════════════════════════
   MOCK DATA
════════════════════════════════════════════════════ */

const ME = { id: "u1", name: "Alex Rivera", role: "Operations Manager" };

const USERS = [
  { id: "u1", name: "Alex Rivera",  role: "Operations Manager" },
  { id: "u2", name: "Jordan Kim",   role: "Dispatcher" },
  { id: "u3", name: "Sam Patel",    role: "Supervisor" },
];

const GUARDS = [
  { id: "g1", name: "Marcus Cole",  badge: "G-104" },
  { id: "g2", name: "Daria Walsh",  badge: "G-207" },
  { id: "g3", name: "Tomás Rivera", badge: "G-315" },
  { id: "g4", name: "Priya Nair",   badge: "G-422" },
];

const SITES = [
  { id: "s1", name: "Westfield Mall" },
  { id: "s2", name: "Harbor Tower" },
  { id: "s3", name: "TechPark Campus" },
];

// Shifts now carry explicit start/end times.
// Guards can clock in/out within this window.
const SHIFTS = [
  { id: "sh1", siteId: "s1", guardId: "g1", startTime: "06:00", endTime: "14:00", label: "Day shift" },
  { id: "sh2", siteId: "s1", guardId: "g2", startTime: "14:00", endTime: "22:00", label: "Evening shift" },
  { id: "sh3", siteId: "s2", guardId: "g3", startTime: "00:00", endTime: "08:00", label: "Night shift" },
  { id: "sh4", siteId: "s3", guardId: "g4", startTime: "08:00", endTime: "16:00", label: "Day shift" },
];

// Clock-in/out state per guard (would come from backend in production)
const CLOCK_STATUS = {
  g1: { clockedIn: true,  at: "06:23" },
  g2: { clockedIn: false, at: null },
  g3: { clockedIn: true,  at: "23:58" },
  g4: { clockedIn: true,  at: "08:07" },
};

/* ════════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════════ */

const uid = () => Math.random().toString(36).slice(2, 9);

const fmtTs = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

const PRIORITY_META = {
  low:    { label: "Low",    cls: "bg-gray-100 text-gray-500" },
  medium: { label: "Medium", cls: "bg-blue-100 text-blue-600" },
  high:   { label: "High",   cls: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", cls: "bg-red-100 text-red-600 font-semibold" },
};

const guardLabel  = (id) => { const g = GUARDS.find(g => g.id === id); return g ? `${g.name} (${g.badge})` : ""; };
const userLabel   = (id) => { const u = USERS.find(u => u.id === id);  return u ? `${u.name} · ${u.role}` : ""; };
const siteLabel   = (id) => SITES.find(s => s.id === id)?.name ?? "";
// Returns the shift currently active at a site based on real wall-clock time.
// Handles overnight shifts (e.g. 22:00–06:00) by checking for wraparound.
function activeShiftAt(siteId) {
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  return SHIFTS.find(sh => {
    if (sh.siteId !== siteId) return false;
    const [startH, startM] = sh.startTime.split(":").map(Number);
    const [endH,   endM]   = sh.endTime.split(":").map(Number);
    const startMins = startH * 60 + startM;
    const endMins   = endH   * 60 + endM;

    // Overnight shift: wraps past midnight (e.g. 22:00–06:00)
    if (endMins <= startMins) {
      return currentMins >= startMins || currentMins < endMins;
    }
    return currentMins >= startMins && currentMins < endMins;
  }) ?? null;
}

/* ════════════════════════════════════════════════════
   TICKET FACTORY
════════════════════════════════════════════════════ */

const auditEntry = (action, detail = "", msAgo = 0) => ({
  id: uid(),
  ts: new Date(Date.now() - msAgo).toISOString(),
  actor: ME.name,
  action,
  detail,
});

const newTicket = (overrides = {}) => ({
  id: uid(),
  columnId: "c1",
  title: "",
  description: "",
  priority: "medium",
  assigneeType: null,   // 'user' | 'guard' | null
  assigneeId: null,
  siteId: null,
  shiftId: null,
  log: [auditEntry("created ticket")],
  ...overrides,
});

/* ════════════════════════════════════════════════════
   INITIAL STATE
════════════════════════════════════════════════════ */

const INIT_COLUMNS = [
  { id: "c1", label: "Unassigned" },
  { id: "c2", label: "Dispatched" },
  { id: "c3", label: "In Progress" },
  { id: "c4", label: "Complete" },
];

const INIT_TICKETS = [
  newTicket({
    id: "t1", columnId: "c2",
    title: "Perimeter patrol — north sector",
    priority: "high",
    assigneeType: "guard", assigneeId: "g1",
    siteId: "s1", shiftId: "sh1",
    description: "Complete north perimeter sweep before end of day shift.",
    log: [
      auditEntry("created ticket", "", 3_600_000),
      auditEntry("linked site", "Westfield Mall — Day shift 06:00–14:00", 3_500_000),
      auditEntry("assigned to guard", "Marcus Cole (G-104)", 3_400_000),
      auditEntry("notification sent", "Push notification delivered to Marcus Cole", 3_400_000),
      auditEntry("moved to column", "Unassigned → Dispatched", 3_300_000),
    ],
  }),
  newTicket({
    id: "t2", columnId: "c1",
    title: "Parking lot altercation — Lot B",
    priority: "urgent",
    description: "Two vehicles involved in altercation. Awaiting supervisor direction.",
    log: [auditEntry("created ticket", "", 600_000)],
  }),
  newTicket({
    id: "t3", columnId: "c3",
    title: "Badge reader fault at Gate 2",
    priority: "medium",
    assigneeType: "user", assigneeId: "u2",
    description: "Badge reader throwing intermittent errors. Vendor contacted.",
    log: [
      auditEntry("created ticket", "", 7_200_000),
      auditEntry("assigned to user", "Jordan Kim · Dispatcher", 7_100_000),
      auditEntry("moved to column", "Unassigned → In Progress", 7_000_000),
      auditEntry("added note", "Vendor says firmware update is needed", 5_000_000),
    ],
  }),
  newTicket({
    id: "t4", columnId: "c4",
    title: "End-of-shift report submitted",
    priority: "low",
    assigneeType: "guard", assigneeId: "g2",
    siteId: "s1", shiftId: "sh2",
    log: [
      auditEntry("created ticket", "", 86_400_000),
      auditEntry("assigned to guard", "Daria Walsh (G-207)", 86_000_000),
      auditEntry("notification sent", "Push notification delivered to Daria Walsh", 86_000_000),
      auditEntry("moved to column", "Dispatched → Complete", 3_000_000),
    ],
  }),
  newTicket({
    id: "t5", columnId: "c2",
    title: "Review access logs — Harbor Tower",
    priority: "high",
    assigneeType: "guard", assigneeId: "g3",
    siteId: "s2", shiftId: "sh3",
    log: [
      auditEntry("created ticket", "", 1_800_000),
      auditEntry("linked site", "Harbor Tower — Night shift 00:00–08:00", 1_700_000),
      auditEntry("assigned to guard", "Tomás Rivera (G-315)", 1_600_000),
      auditEntry("notification sent", "Push notification delivered to Tomás Rivera", 1_600_000),
      auditEntry("moved to column", "Unassigned → Dispatched", 1_500_000),
    ],
  }),
];

/* ════════════════════════════════════════════════════
   SHARED UI PRIMITIVES
════════════════════════════════════════════════════ */

function Avatar({ name }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-semibold flex-shrink-0">
      {initials}
    </div>
  );
}

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return <span className={`text-xs px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}

/* ── Toast notification ────────────────────────── */

function Toast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-pulse">
      <span>🔔 {message}</span>
      <button onClick={onDismiss} className="text-gray-400 hover:text-white ml-1">✕</button>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   TICKET CARD
════════════════════════════════════════════════════ */

function TicketCard({ ticket, onClick, onDragStart }) {
  const assignee =
    ticket.assigneeType === "guard" ? guardLabel(ticket.assigneeId)
    : ticket.assigneeType === "user" ? userLabel(ticket.assigneeId)
    : null;
  const firstName = assignee?.split(" (")[0]?.split(" ·")[0]?.split(" ")[0] ?? "";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-gray-900 leading-snug">
          {ticket.title || <span className="italic text-gray-400">Untitled</span>}
        </p>
        <PriorityBadge priority={ticket.priority} />
      </div>
      {ticket.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed">{ticket.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {ticket.shiftId && (() => {
          const sh = SHIFTS.find(s => s.id === ticket.shiftId);
          return sh ? (
            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
              📍 {siteLabel(ticket.siteId)} · {sh.startTime}–{sh.endTime}
            </span>
          ) : null;
        })()}
        {assignee && (
          <div className="flex items-center gap-1">
            <Avatar name={assignee} />
            <span className="text-xs text-gray-500">{firstName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   COLUMN
════════════════════════════════════════════════════ */

function Column({ col, tickets, onDrop, onDragOver, onTicketClick, onTicketDragStart, onRename, onAddTicket, onDeleteCol }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(col.label);

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== col.label) onRename(col.id, trimmed);
    else setDraft(col.label);
  }

  return (
    <div
      className="flex flex-col w-72 flex-shrink-0 bg-gray-50 rounded-xl border border-gray-200"
      onDragOver={e => { e.preventDefault(); onDragOver(col.id); }}
      onDrop={() => onDrop(col.id)}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
        {editing ? (
          <input
            autoFocus
            className="flex-1 text-sm font-semibold bg-white border border-indigo-400 rounded px-1.5 py-0.5 outline-none"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraft(col.label); setEditing(false); }
            }}
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-gray-800 cursor-pointer hover:text-indigo-600 truncate"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >{col.label}</span>
        )}
        <span className="text-xs text-gray-400 flex-shrink-0">{tickets.length}</span>
        <button onClick={onAddTicket} className="w-5 h-5 text-gray-400 hover:text-indigo-600 hover:bg-gray-200 rounded flex items-center justify-center text-base leading-none transition-colors" title="Add ticket">+</button>
        <button onClick={() => onDeleteCol(col.id)} className="w-5 h-5 text-gray-300 hover:text-red-400 hover:bg-gray-200 rounded flex items-center justify-center text-xs transition-colors" title="Delete column">✕</button>
      </div>
      <div className="flex flex-col gap-2 p-2 min-h-24 max-h-[calc(100vh-200px)] overflow-y-auto">
        {tickets.map(t => (
          <TicketCard key={t.id} ticket={t} onClick={() => onTicketClick(t)} onDragStart={() => onTicketDragStart(t.id)} />
        ))}
        {tickets.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-gray-300 border-2 border-dashed border-gray-200 rounded-lg">
            Drop tickets here
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   GUARD VIEW
   Guards only see tickets assigned to them.
   They do not see the board.
════════════════════════════════════════════════════ */

function GuardView({ tickets, columns, onTicketClick }) {
  const [selectedGuardId, setSelectedGuardId] = useState(GUARDS[0].id);

  const guard       = GUARDS.find(g => g.id === selectedGuardId);
  const clock       = CLOCK_STATUS[selectedGuardId];
  const guardShifts = SHIFTS.filter(sh => sh.siteId && sh.guardId === selectedGuardId);
  const myTickets   = tickets.filter(t => t.assigneeType === "guard" && t.assigneeId === selectedGuardId);

  return (
    <div className="flex flex-col flex-1 p-6 max-w-2xl mx-auto w-full">
      {/* Guard selector */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <select
            value={selectedGuardId}
            onChange={e => setSelectedGuardId(e.target.value)}
            className="text-sm font-semibold text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
          >
            {GUARDS.map(g => <option key={g.id} value={g.id}>{g.name} ({g.badge})</option>)}
          </select>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${clock?.clockedIn ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {clock?.clockedIn ? `🟢 Clocked in at ${clock.at}` : "⚪ Not clocked in"}
          </span>
        </div>

        {/* Active shifts for this guard */}
        {guardShifts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {guardShifts.map(sh => (
              <div key={sh.id} className="text-xs text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                📍 {siteLabel(sh.siteId)} · {sh.label} {sh.startTime}–{sh.endTime}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ticket list */}
      <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
        Assigned tickets ({myTickets.length})
      </p>

      {myTickets.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-12">No tickets assigned</div>
      ) : (
        <div className="flex flex-col gap-3">
          {myTickets.map(t => {
            const col = columns.find(c => c.id === t.columnId);
            const sh  = t.shiftId ? SHIFTS.find(s => s.id === t.shiftId) : null;
            return (
              <div
                key={t.id}
                onClick={() => onTicketClick(t)}
                className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-gray-900">{t.title || <span className="italic text-gray-400">Untitled</span>}</p>
                  <PriorityBadge priority={t.priority} />
                </div>
                {t.description && (
                  <p className="text-xs text-gray-500 mb-2 line-clamp-2">{t.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Stage badge */}
                  {col && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{col.label}</span>
                  )}
                  {/* Shift time window */}
                  {sh && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                      ⏱ {siteLabel(t.siteId)} · {sh.startTime}–{sh.endTime}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   TICKET MODAL
════════════════════════════════════════════════════ */

function TicketModal({ ticket, columns, onClose, onUpdate, onNotify }) {
  const [title,        setTitle]        = useState(ticket.title);
  const [desc,         setDesc]         = useState(ticket.description);
  const [priority,     setPriority]     = useState(ticket.priority);
  const [columnId,     setColumnId]     = useState(ticket.columnId);
  const [assigneeType, setAssigneeType] = useState(ticket.assigneeType ?? "");
  const [assigneeId,   setAssigneeId]   = useState(ticket.assigneeId   ?? "");
  const [siteId,       setSiteId]       = useState(ticket.siteId       ?? "");
  const [note,         setNote]         = useState("");

  const shift      = siteId ? activeShiftAt(siteId) : null;
  const shiftGuard = shift ? GUARDS.find(g => g.id === shift.guardId) : null;
  const clockIn    = assigneeId ? CLOCK_STATUS[assigneeId] : null;

  function autoAssignGuard() {
    if (!shift) return;
    setAssigneeType("guard");
    setAssigneeId(shift.guardId);
  }

  function save() {
    const log     = [...ticket.log];
    const updates = {};

    if (title.trim() !== ticket.title) {
      updates.title = title.trim();
      log.push(auditEntry("changed title", `→ "${title.trim()}"`));
    }
    if (desc !== ticket.description) {
      updates.description = desc;
      log.push(auditEntry("updated description"));
    }
    if (priority !== ticket.priority) {
      log.push(auditEntry("changed priority", `${ticket.priority} → ${priority}`));
      updates.priority = priority;
    }
    if (columnId !== ticket.columnId) {
      const from = columns.find(c => c.id === ticket.columnId)?.label ?? "?";
      const to   = columns.find(c => c.id === columnId)?.label ?? "?";
      log.push(auditEntry("moved to column", `${from} → ${to}`));
      updates.columnId = columnId;
    }

    const newType = assigneeType || null;
    const newId   = assigneeId   || null;
    if (newType !== ticket.assigneeType || newId !== ticket.assigneeId) {
      updates.assigneeType = newType;
      updates.assigneeId   = newId;
      if (newType === "guard") {
        const g = GUARDS.find(g => g.id === newId);
        log.push(auditEntry("assigned to guard", guardLabel(newId)));
        // Simulate push notification API call
        log.push(auditEntry("notification sent", `Push notification delivered to ${g?.name}`));
        onNotify(`Notification sent to ${g?.name} (${g?.badge})`);
      } else if (newType === "user") {
        log.push(auditEntry("assigned to user", userLabel(newId)));
      } else {
        log.push(auditEntry("removed assignment"));
      }
    }

    const newSite = siteId || null;
    if (newSite !== ticket.siteId) {
      updates.siteId = newSite;
      if (newSite && shift) {
        updates.shiftId = shift.id;
        log.push(auditEntry("linked site", `${siteLabel(newSite)} — ${shift.label} ${shift.startTime}–${shift.endTime}`));
      } else if (newSite) {
        updates.shiftId = null;
        log.push(auditEntry("linked site", `${siteLabel(newSite)} (no active shift)`));
      } else {
        updates.shiftId = null;
        log.push(auditEntry("unlinked site"));
      }
    }

    updates.log = log;
    onUpdate(ticket.id, updates);
    onClose();
  }

  function postNote() {
    if (!note.trim()) return;
    onUpdate(ticket.id, { log: [...ticket.log, auditEntry("added note", note.trim())] });
    setNote("");
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <span className="text-xs font-mono text-gray-400">#{ticket.id}</span>
          <div className="flex items-center gap-2">
            <select
              value={columnId}
              onChange={e => setColumnId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400"
            >
              {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Title */}
          <input
            className="w-full text-xl font-semibold text-gray-900 border-0 border-b-2 border-transparent hover:border-gray-200 focus:border-indigo-400 outline-none pb-1 transition-colors bg-transparent"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ticket title"
          />

          {/* Description */}
          <textarea
            className="w-full text-sm text-gray-600 border border-gray-200 rounded-xl p-3 resize-none outline-none focus:border-indigo-400 transition-colors leading-relaxed"
            rows={3}
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Add a description..."
          />

          {/* Priority + Site */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
              >
                {Object.entries(PRIORITY_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Site <span className="text-gray-300 font-normal">(optional)</span>
              </label>
              <select
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
              >
                <option value="">— No site —</option>
                {SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {/* Show shift time window when site is selected */}
              {siteId && shift && (
                <p className="text-xs mt-1 text-indigo-500">
                  🟢 {shift.label} {shift.startTime}–{shift.endTime} · {shiftGuard?.name}
                </p>
              )}
              {siteId && !shift && (
                <p className="text-xs mt-1 text-gray-400">⚪ No active shift</p>
              )}
            </div>
          </div>

          {/* Assignment */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assign to</label>
            <div className="flex gap-2 flex-wrap">
              <select
                value={assigneeType}
                onChange={e => { setAssigneeType(e.target.value); setAssigneeId(""); }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
              >
                <option value="">— Unassigned —</option>
                <option value="user">Org user</option>
                <option value="guard">Guard</option>
              </select>

              {assigneeType === "user" && (
                <select
                  value={assigneeId}
                  onChange={e => setAssigneeId(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
                >
                  <option value="">— Select user —</option>
                  {USERS.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
                </select>
              )}

              {assigneeType === "guard" && (
                <select
                  value={assigneeId}
                  onChange={e => setAssigneeId(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
                >
                  <option value="">— Select guard —</option>
                  {GUARDS.map(g => {
                    const cl = CLOCK_STATUS[g.id];
                    return (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.badge}) {cl?.clockedIn ? "· clocked in" : "· off shift"}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Clock-in status for selected guard */}
            {assigneeType === "guard" && assigneeId && clockIn && (
              <p className={`text-xs mt-1.5 ${clockIn.clockedIn ? "text-green-600" : "text-gray-400"}`}>
                {clockIn.clockedIn ? `🟢 Clocked in at ${clockIn.at}` : "⚪ Not currently clocked in"}
              </p>
            )}

            {/* Notification callout */}
            {assigneeType === "guard" && assigneeId && (
              <p className="text-xs mt-1 text-indigo-400">
                🔔 Saving will send a push notification to this guard
              </p>
            )}

            {/* Auto-assign from active shift */}
            {shift && shiftGuard && assigneeType !== "guard" && (
              <button
                className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:underline"
                onClick={autoAssignGuard}
              >
                ↑ Auto-assign {shiftGuard.name} from active shift
              </button>
            )}
          </div>

          {/* Save */}
          <div className="flex justify-end pt-1">
            <button
              onClick={save}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
            >
              Save changes
            </button>
          </div>

          {/* Notes */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Add note</p>
            <div className="flex gap-2">
              <input
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 transition-colors"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Write a note..."
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); postNote(); } }}
              />
              <button
                onClick={postNote}
                className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl transition-colors"
              >Post</button>
            </div>
          </div>

          {/* Audit log */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Audit history</p>
            <div className="space-y-2.5">
              {[...ticket.log].reverse().map(entry => (
                <div key={entry.id} className="flex gap-3 text-xs">
                  <span className="text-gray-300 font-mono flex-shrink-0 pt-px">{fmtTs(entry.ts)}</span>
                  <div className="text-gray-500 leading-relaxed">
                    <span className="font-medium text-gray-700">{entry.actor}</span>
                    {" "}{entry.action}
                    {entry.detail && <span className="text-gray-400"> — {entry.detail}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   ADD COLUMN MODAL
════════════════════════════════════════════════════ */

function AddColumnModal({ onAdd, onClose }) {
  const [label, setLabel] = useState("");
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
        <p className="text-base font-semibold text-gray-800 mb-3">New column</p>
        <input
          autoFocus
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 mb-4"
          placeholder="Column name"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && label.trim()) onAdd(label.trim());
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button
            onClick={() => label.trim() && onAdd(label.trim())}
            className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700"
          >Add</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   APP
════════════════════════════════════════════════════ */

export default function App() {
  const [columns,      setColumns]      = useState(INIT_COLUMNS);
  const [tickets,      setTickets]      = useState(INIT_TICKETS);
  const [activeTicket, setActiveTicket] = useState(null);
  const [showAddCol,   setShowAddCol]   = useState(false);
  const [viewMode,       setViewMode]       = useState("board"); // "board" | "guard"
  const [toast,          setToast]          = useState(null);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  const draggedId = useRef(null);

  /* ── Ticket operations ── */

  const updateTicket = (id, updates) =>
    setTickets(ts => ts.map(t => t.id === id ? { ...t, ...updates } : t));

  function addTicket(columnId) {
    const t = newTicket({ columnId, title: "New ticket" });
    setTickets(ts => [...ts, t]);
    setActiveTicket(t.id);
  }

  /* ── Column operations ── */

  function addColumn(label) {
    setColumns(cs => [...cs, { id: uid(), label }]);
    setShowAddCol(false);
  }

  function renameColumn(id, label) {
    setColumns(cs => cs.map(c => c.id === id ? { ...c, label } : c));
  }

  function deleteColumn(id) {
    if (tickets.some(t => t.columnId === id)) {
      alert("Move all tickets out of this column before deleting it.");
      return;
    }
    setColumns(cs => cs.filter(c => c.id !== id));
  }

  /* ── Drag & drop ── */

  function handleDrop(targetColId) {
    const id = draggedId.current;
    if (!id) return;
    const t = tickets.find(t => t.id === id);
    if (!t || t.columnId === targetColId) { draggedId.current = null; return; }
    const from = columns.find(c => c.id === t.columnId)?.label ?? "?";
    const to   = columns.find(c => c.id === targetColId)?.label ?? "?";
    updateTicket(id, {
      columnId: targetColId,
      log: [...t.log, auditEntry("moved to column", `${from} → ${to}`)],
    });
    draggedId.current = null;
  }

  const liveTicket = activeTicket ? tickets.find(t => t.id === activeTicket) ?? null : null;

  // Derived filtered ticket list for the board view
  const filteredTickets = tickets.filter(t => {
    const matchesSearch = !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = !filterPriority || t.priority === filterPriority;
    return matchesSearch && matchesPriority;
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">

      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <span className="text-base font-bold text-gray-900">🛡 Dispatch Board</span>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Operations</span>

        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 ml-2">
          <button
            onClick={() => setViewMode("board")}
            className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${viewMode === "board" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >Board</button>
          <button
            onClick={() => setViewMode("guard")}
            className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${viewMode === "guard" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >Guard view</button>
        </div>

        {/* Search + filter — only shown in board view */}
        {viewMode === "board" && (
          <div className="flex items-center gap-2 ml-3">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tickets..."
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400 w-48 transition-colors"
            />
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400 text-gray-600"
            >
              <option value="">All priorities</option>
              {Object.entries(PRIORITY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {(searchQuery || filterPriority) && (
              <button
                onClick={() => { setSearchQuery(""); setFilterPriority(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >Clear</button>
            )}
          </div>
        )}

        <div className="flex-1" />
        <div className="flex items-center gap-2 mr-3">
          <Avatar name={ME.name} />
          <span className="text-sm text-gray-600">{ME.name}</span>
          <span className="text-xs text-gray-400">· {ME.role}</span>
        </div>
        {viewMode === "board" && (
          <button
            onClick={() => setShowAddCol(true)}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl font-medium transition-colors"
          >+ Add column</button>
        )}
      </header>

      {/* Board or Guard view */}
      {viewMode === "board" ? (
        <div className="flex gap-4 p-6 overflow-x-auto items-start">
          {columns.map(col => (
            <Column
              key={col.id}
              col={col}
              tickets={filteredTickets.filter(t => t.columnId === col.id)}
              onDrop={handleDrop}
              onDragOver={() => {}}
              onTicketClick={t => setActiveTicket(t.id)}
              onTicketDragStart={id => { draggedId.current = id; }}
              onRename={renameColumn}
              onAddTicket={() => addTicket(col.id)}
              onDeleteCol={deleteColumn}
            />
          ))}
        </div>
      ) : (
        <GuardView
          tickets={tickets}
          columns={columns}
          onTicketClick={t => setActiveTicket(t.id)}
        />
      )}

      {/* Modals */}
      {showAddCol && (
        <AddColumnModal onAdd={addColumn} onClose={() => setShowAddCol(false)} />
      )}
      {liveTicket && (
        <TicketModal
          key={liveTicket.id}
          ticket={liveTicket}
          columns={columns}
          onClose={() => setActiveTicket(null)}
          onUpdate={updateTicket}
          onNotify={msg => setToast(msg)}
        />
      )}

      {/* Toast notification */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
