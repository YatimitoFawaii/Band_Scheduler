document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("availability.html");

  const weekShell = document.getElementById("weekShell");
  const weekLabel = document.getElementById("weekLabel");
  const msg = document.getElementById("msg");
  const slotType = document.getElementById("slotType");
  const slotRecurring = document.getElementById("slotRecurring");
  const deleteBtn = document.getElementById("deleteSlot");
  const endRecurringBtn = document.getElementById("endRecurring");

  const currentWeekStart = startOfWeek(new Date());
  const maxWeekStart = startOfWeek(dateAddDays(new Date(), 365));
  let weekStart = new Date(currentWeekStart);
  let selected = null;

  function selectedBaseSlot() {
    if (!selected) return null;
    const db = loadDB();
    return db.availabilities.find((a) => a.id === selected.slotId && a.userId === user.id) || null;
  }

  function setMessage(text) {
    msg.textContent = text || "";
  }

  function syncControlsFromSelected() {
    const slot = selectedBaseSlot();
    if (!slot) return;
    slotType.value = slot.type;
    slotRecurring.checked = !!slot.recurring;
  }

  function weekRangeLabel() {
    const end = dateAddDays(weekStart, 6);
    return `${weekStart.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  function saveNewSlot(dayDate, startMin) {
    const type = slotType.value;
    const recurring = slotRecurring.checked;
    const start = makeDateAt(dayDate, startMin);
    const end = makeDateAt(dayDate, Math.min(startMin + 120, END_MIN));

    const base = {
      id: uid("av"),
      userId: user.id,
      type,
      recurring,
      createdAt: nowISO()
    };

    if (recurring) {
      base.startISO = start.toISOString();
      base.endISO = end.toISOString();
      base.dayOfWeek = start.getDay();
      base.startMin = minutesFromDayStart(start, start);
      base.endMin = minutesFromDayStart(end, start);
      base.recurrenceStartISO = startOfDay(start).toISOString();
      base.recurrenceEndISO = null;
    } else {
      base.startISO = start.toISOString();
      base.endISO = end.toISOString();
    }

    saveAvailabilitySlot(base);
    selected = {
      slotId: base.id,
      instanceStartISO: base.startISO,
      instanceEndISO: base.endISO
    };
  }

  function updateSelectedMeta() {
    const slot = selectedBaseSlot();
    if (!slot) return;
    slot.type = slotType.value;

    if (slotRecurring.checked && !slot.recurring) {
      slot.recurring = true;
      const instStart = new Date(selected.instanceStartISO);
      const instEnd = new Date(selected.instanceEndISO);
      slot.dayOfWeek = instStart.getDay();
      slot.startMin = minutesFromDayStart(instStart, instStart);
      slot.endMin = minutesFromDayStart(instEnd, instStart);
      slot.recurrenceStartISO = startOfDay(instStart).toISOString();
      slot.recurrenceEndISO = null;
    } else if (!slotRecurring.checked && slot.recurring) {
      slot.recurring = false;
      slot.startISO = selected.instanceStartISO;
      slot.endISO = selected.instanceEndISO;
      delete slot.dayOfWeek;
      delete slot.startMin;
      delete slot.endMin;
      delete slot.recurrenceStartISO;
      delete slot.recurrenceEndISO;
    }

    saveAvailabilitySlot(slot);
    render();
  }

  function moveOrResizeSlot(slotId, instanceStartISO, updater) {
    const db = loadDB();
    const slot = db.availabilities.find((a) => a.id === slotId && a.userId === user.id);
    if (!slot) return;

    if (slot.recurring) {
      const day = new Date(instanceStartISO);
      const currentStart = makeDateAt(day, slot.startMin);
      const currentEnd = makeDateAt(day, slot.endMin);
      const { nextStart, nextEnd } = updater(currentStart, currentEnd);
      slot.startMin = clampToWindow(snapMinutes(minutesFromDayStart(nextStart, day)));
      slot.endMin = clampToWindow(snapMinutes(minutesFromDayStart(nextEnd, day)));
      if (slot.endMin <= slot.startMin) slot.endMin = slot.startMin + STEP_MIN;
      slot.endMin = Math.min(slot.endMin, END_MIN);
      slot.dayOfWeek = day.getDay();
      saveDB(db);
      selected = {
        slotId,
        instanceStartISO: makeDateAt(day, slot.startMin).toISOString(),
        instanceEndISO: makeDateAt(day, slot.endMin).toISOString()
      };
    } else {
      const currentStart = new Date(slot.startISO);
      const currentEnd = new Date(slot.endISO);
      const { nextStart, nextEnd } = updater(currentStart, currentEnd);
      slot.startISO = nextStart.toISOString();
      slot.endISO = nextEnd.toISOString();
      saveDB(db);
      selected = { slotId, instanceStartISO: slot.startISO, instanceEndISO: slot.endISO };
    }
  }

  function attachDragBehavior(el, colDate, slotInstance) {
    const rangeMin = END_MIN - START_MIN;

    el.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("resize-handle")) return;
      e.preventDefault();
      selected = slotInstance;
      syncControlsFromSelected();

      const startY = e.clientY;
      const instanceStart = new Date(slotInstance.instanceStartISO);
      const startStartMin = minutesFromDayStart(instanceStart, instanceStart);
      const startEndMin = minutesFromDayStart(new Date(slotInstance.instanceEndISO), instanceStart);
      const duration = startEndMin - startStartMin;
      const col = e.currentTarget.parentElement;
      const pxToMin = rangeMin / col.getBoundingClientRect().height;

      function onMove(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        let nextStart = clampToWindow(startStartMin + delta);
        let nextEnd = nextStart + duration;
        if (nextEnd > END_MIN) {
          nextEnd = END_MIN;
          nextStart = nextEnd - duration;
        }
        el.style.top = `${((nextStart - START_MIN) / rangeMin) * 100}%`;
        el.style.height = `${((nextEnd - nextStart) / rangeMin) * 100}%`;
      }

      function onUp(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        moveOrResizeSlot(slotInstance.slotId, slotInstance.instanceStartISO, (curS, curE) => {
          const nextS = new Date(curS.getTime() + delta * 60000);
          const nextE = new Date(curE.getTime() + delta * 60000);
          const day = startOfDay(curS);
          let s = makeDateAt(day, clampToWindow(minutesFromDayStart(nextS, day)));
          let e = makeDateAt(day, clampToWindow(minutesFromDayStart(nextE, day)));
          if (e <= s) e = makeDateAt(day, minutesFromDayStart(s, day) + STEP_MIN);
          if (minutesFromDayStart(e, day) > END_MIN) e = makeDateAt(day, END_MIN);
          return { nextStart: s, nextEnd: e };
        });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        render();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    const handle = el.querySelector(".resize-handle");
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      selected = slotInstance;
      syncControlsFromSelected();

      const startY = e.clientY;
      const instanceStart = new Date(slotInstance.instanceStartISO);
      const startStartMin = minutesFromDayStart(instanceStart, instanceStart);
      const startEndMin = minutesFromDayStart(new Date(slotInstance.instanceEndISO), instanceStart);
      const col = e.currentTarget.parentElement.parentElement;
      const pxToMin = (END_MIN - START_MIN) / col.getBoundingClientRect().height;

      function onMove(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        let nextEnd = clampToWindow(startEndMin + delta);
        if (nextEnd <= startStartMin) nextEnd = startStartMin + STEP_MIN;
        el.style.height = `${((nextEnd - startStartMin) / (END_MIN - START_MIN)) * 100}%`;
      }

      function onUp(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        moveOrResizeSlot(slotInstance.slotId, slotInstance.instanceStartISO, (curS, curE) => {
          const day = startOfDay(curS);
          const sMin = minutesFromDayStart(curS, day);
          let eMin = clampToWindow(minutesFromDayStart(curE, day) + delta);
          if (eMin <= sMin) eMin = sMin + STEP_MIN;
          return {
            nextStart: makeDateAt(day, sMin),
            nextEnd: makeDateAt(day, eMin)
          };
        });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        render();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function render() {
    weekLabel.textContent = weekRangeLabel();
    const weekEnd = dateAddDays(weekStart, 7);
    const view = createWeekView(weekShell, weekStart, {
      interactive: true,
      onEmptyClick(dayDate, minute) {
        const startMin = Math.min(minute, END_MIN - 120);
        saveNewSlot(dayDate, startMin);
        render();
      }
    });

    const slots = getAvailabilitiesForUser(user.id, weekStart, weekEnd);
    for (const inst of slots) {
      const start = new Date(inst.instanceStartISO);
      const end = new Date(inst.instanceEndISO);
      const dayIndex = start.getDay();
      const col = view.dayCols[dayIndex];
      if (!col) continue;

      const top = view.minutesToTopPct(minutesFromDayStart(start, start));
      const height = view.minutesToTopPct(minutesFromDayStart(end, start)) - top;

      const div = document.createElement("div");
      div.className = `slot ${inst.type || "possible"}`;
      if (selected && selected.slotId === inst.id && selected.instanceStartISO === inst.instanceStartISO) {
        div.classList.add("selected");
      }
      div.style.top = `${top}%`;
      div.style.height = `${Math.max(1.8, height)}%`;
      div.innerHTML = `
        <strong>${inst.type === "preferred" ? "Preferred" : "Possible"}</strong><br>
        ${formatTime(start)} - ${formatTime(end)} ${inst.recurring ? "(recurring)" : ""}
        <div class="resize-handle"></div>
      `;

      const slotInstance = {
        slotId: inst.id,
        instanceStartISO: inst.instanceStartISO,
        instanceEndISO: inst.instanceEndISO
      };

      div.addEventListener("click", (e) => {
        e.stopPropagation();
        selected = slotInstance;
        syncControlsFromSelected();
        render();
      });

      attachDragBehavior(div, new Date(col.dataset.dateISO), slotInstance);
      col.appendChild(div);
    }
  }

  document.getElementById("prevWeek").addEventListener("click", () => {
    const prev = dateAddDays(weekStart, -7);
    if (prev < currentWeekStart) return;
    weekStart = prev;
    render();
  });

  document.getElementById("nextWeek").addEventListener("click", () => {
    const next = dateAddDays(weekStart, 7);
    if (next > maxWeekStart) return;
    weekStart = next;
    render();
  });

  slotType.addEventListener("change", updateSelectedMeta);
  slotRecurring.addEventListener("change", updateSelectedMeta);

  deleteBtn.addEventListener("click", () => {
    if (!selected) {
      setMessage("Select a slot to delete.");
      return;
    }
    deleteAvailabilitySlot(selected.slotId, user.id);
    selected = null;
    render();
  });

  endRecurringBtn.addEventListener("click", () => {
    if (!selected) {
      setMessage("Select a recurring slot first.");
      return;
    }
    const slot = selectedBaseSlot();
    if (!slot?.recurring) {
      setMessage("Selected slot is not recurring.");
      return;
    }
    endRecurringFromInstance(selected.slotId, user.id, selected.instanceStartISO);
    setMessage("Recurring availability ended after this instance.");
    render();
  });

  render();
});
