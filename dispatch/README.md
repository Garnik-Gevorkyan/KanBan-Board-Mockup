# Dispatch Board — Decision Writeup

## Stack

React (single `.jsx` file) with Tailwind utility classes. No build step beyond what a standard Vite/CRA setup provides. No backend — all state lives in memory, seeded with mock data. This kept the focus on the product thinking rather than infrastructure.

---

## Key Decisions

### Assignment model

Tickets can be assigned to one of three things: an org user (manager, dispatcher, supervisor), a specific guard, or nobody. These are meaningfully different in the real workflow — an org user assignment means "this person owns resolving the ticket," while a guard assignment usually means "dispatch this person to act on it."

A site is a separate, optional field — not a type of assignee. When a site is linked, the system looks up whether there's an active shift at that site and surfaces the on-shift guard. The manager can then one-click auto-assign that guard, or ignore the suggestion and assign someone else. I made auto-assign opt-in rather than automatic because there are legitimate cases where a manager wants to assign someone other than the current shift guard (e.g. sending a floater, or escalating to a supervisor).

### Dynamic columns

Columns are stored as a plain ordered array in React state. There are no hardcoded stages — the initial set (Unassigned, Dispatched, In Progress, Complete) is just a sensible default. Double-clicking a column header enters rename mode inline. Deleting a column requires it to be empty first, to prevent accidentally orphaning tickets.

### Audit log

Every mutation to a ticket — assignment changes, column moves, priority changes, notes — appends an entry to an immutable log array on the ticket itself. This keeps the audit log co-located with the ticket and makes it trivially serializable to a backend later. Notes from guards are the same structure as system events, just with `action: "added note"` — no separate data model needed.

The log is displayed newest-first in the modal, which matches how people read activity feeds.

### Drag and drop

Used the browser's native HTML5 drag-and-drop API rather than a library. It's less polished than something like `dnd-kit`, but it avoids a dependency and works reliably for a prototype.

---

## What I'd Do Differently With More Time

**Real persistence.** Right now state resets on refresh. A minimal backend — even just a JSON file served by a small Express or FastAPI app — would make this usable for a real demo. But as noted, I am not going to add a backend and just focus on the frontend for now.

**WebSocket sync.** In a real ops room, multiple dispatchers might be viewing the board simultaneously. Without live sync, two people can make conflicting assignments without knowing. I'd add Socket.IO or SSE to push updates.

**Column reordering.** Currently columns can be added and renamed but not reordered. Drag-to-reorder on column headers is a common way to address this which I can do in a bit.

**Guard-side note submission.** The spec mentions guards leaving notes. In this prototype, notes are added from the manager view. The real design would have a separate mobile-facing interface (or API endpoint) where guards can post notes, which would appear in the same audit log.