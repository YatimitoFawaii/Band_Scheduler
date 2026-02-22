document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("calendar.html");

  const bandSelect = document.getElementById("bandSelect");
  const rehearsalLocation = document.getElementById("rehearsalLocation");
  const rehearsalRecurring = document.getElementById("rehearsalRecurring");
  const rehearsalRecurringCount = document.getElementById("rehearsalRecurringCount");
  const exportWeekIcs = document.getElementById("exportWeekIcs");
  const exportUpcomingIcs = document.getElementById("exportUpcomingIcs");
  const exportSelectedGoogle = document.getElementById("exportSelectedGoogle");
  const weekShell = document.getElementById("weekShell");
  const weekLabel = document.getElementById("weekLabel");
  const commonSlots = document.getElementById("commonSlots");
  const eventActions = document.getElementById("eventActions");
  const msg = document.getElementById("msg");

  let bands = getUserBands(user.id);
  let weekStart = startOfWeek(new Date());
  let selectedEventId = null;
  const selectedLocationByBand = {};

  function setMsg(text) {
    msg.textContent = text || "";
  }

  function populateBands() {
    bands = getUserBands(user.id);
    if (!bands.length) {
      bandSelect.innerHTML = `<option value="">No bands joined</option>`;
      bandSelect.disabled = true;
      return;
    }
    bandSelect.disabled = false;
    bandSelect.innerHTML = bands.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  }

  function weekRangeLabel() {
    const end = dateAddDays(weekStart, 6);
    return `${weekStart.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  function getSelectedBand() {
    const db = loadDB();
    return db.bands.find((b) => b.id === bandSelect.value) || null;
  }

  function getRehearsalSpacesForBand(bandId) {
    const db = loadDB();
    return db.rehearsalSpaces
      .filter((space) => space.bandId === bandId)
      .sort((a, b) => {
        const ao = a.orderByUser?.[user.id] ?? Number.MAX_SAFE_INTEGER;
        const bo = b.orderByUser?.[user.id] ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
  }

  function populateRehearsalLocations() {
    const band = getSelectedBand();
    if (!band) {
      rehearsalLocation.disabled = true;
      rehearsalLocation.innerHTML = `<option value="">No band selected</option>`;
      return;
    }

    const spaces = getRehearsalSpacesForBand(band.id);
    if (!spaces.length) {
      rehearsalLocation.disabled = true;
      rehearsalLocation.innerHTML = `<option value="">No saved locations</option>`;
      selectedLocationByBand[band.id] = "";
      return;
    }

    rehearsalLocation.disabled = false;
    rehearsalLocation.innerHTML = `
      <option value="">No location</option>
      ${spaces.map((space) => `<option value="${space.id}">${space.address}</option>`).join("")}
    `;

    const remembered = selectedLocationByBand[band.id] || "";
    rehearsalLocation.value = spaces.some((s) => s.id === remembered) ? remembered : "";
    selectedLocationByBand[band.id] = rehearsalLocation.value;
  }

  function getSelectedRehearsalSpace() {
    const band = getSelectedBand();
    if (!band) return null;
    const selectedId = selectedLocationByBand[band.id] || "";
    if (!selectedId) return null;
    return getRehearsalSpacesForBand(band.id).find((space) => space.id === selectedId) || null;
  }

  function eventLocationLabel(event) {
    if (event.venue && event.address) return `${event.venue} - ${event.address}`;
    return event.address || event.venue || "";
  }

  function getRecurringRehearsalCount() {
    if (!rehearsalRecurring.checked) return 1;
    const count = Number(rehearsalRecurringCount.value);
    if (!Number.isFinite(count) || count < 2) return 2;
    return Math.floor(count);
  }

  function syncRecurringControls() {
    rehearsalRecurringCount.disabled = !rehearsalRecurring.checked;
  }

  function toICSDate(date) {
    return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function escapeICSText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function listEventsForRange(rangeStart, rangeEnd) {
    return getEventsForUserInRange(user.id, rangeStart, rangeEnd).sort(
      (a, b) => new Date(a.startISO) - new Date(b.startISO)
    );
  }

  function buildICS(events, calendarName) {
    const db = loadDB();
    const stamp = toICSDate(new Date());
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Band Scheduler//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeICSText(calendarName)}`
    ];

    events.forEach((e) => {
      const bandName = db.bands.find((b) => b.id === e.bandId)?.name || "Unknown band";
      const location = eventLocationLabel(e);
      const details = [
        `Band: ${bandName}`,
        `Type: ${e.type === "gig" ? "Gig" : "Rehearsal"}`
      ];
      if (e.compensation) details.push(`Compensation: ${e.compensation}`);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${escapeICSText(`${e.id}@band-scheduler.local`)}`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART:${toICSDate(e.startISO)}`);
      lines.push(`DTEND:${toICSDate(e.endISO)}`);
      lines.push(`SUMMARY:${escapeICSText(`${e.type === "gig" ? "Gig" : "Rehearsal"}: ${e.title}`)}`);
      lines.push(`DESCRIPTION:${escapeICSText(details.join("\n"))}`);
      if (location) lines.push(`LOCATION:${escapeICSText(location)}`);
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return `${lines.join("\r\n")}\r\n`;
  }

  function downloadICS(events, filename, calendarName) {
    if (!events.length) {
      setMsg("No events available for export.");
      return;
    }
    const ics = buildICS(events, calendarName);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg(`Exported ${events.length} event${events.length === 1 ? "" : "s"} to ${filename}.`);
  }

  function toGoogleDate(date) {
    return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function fileDate(date) {
    return new Date(date).toISOString().slice(0, 10);
  }

  function openSelectedEventInGoogleCalendar() {
    if (!selectedEventId) {
      setMsg("Select an event first.");
      return;
    }
    const db = loadDB();
    const event = db.events.find((e) => e.id === selectedEventId && !e.removed);
    if (!event) {
      setMsg("Selected event was not found.");
      return;
    }
    const bandName = db.bands.find((b) => b.id === event.bandId)?.name || "Unknown band";
    const location = eventLocationLabel(event);
    const details = [
      `Band: ${bandName}`,
      `Type: ${event.type === "gig" ? "Gig" : "Rehearsal"}`
    ];
    if (event.compensation) details.push(`Compensation: ${event.compensation}`);

    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.set("action", "TEMPLATE");
    url.searchParams.set("text", `${event.type === "gig" ? "Gig" : "Rehearsal"}: ${event.title}`);
    url.searchParams.set("dates", `${toGoogleDate(event.startISO)}/${toGoogleDate(event.endISO)}`);
    url.searchParams.set("details", details.join("\n"));
    if (location) url.searchParams.set("location", location);
    window.open(url.toString(), "_blank", "noopener");
  }

  function disableNextRehearsalOverrideIfEnabled(bandId) {
    const db = loadDB();
    const band = db.bands.find((b) => b.id === bandId);
    if (!band || !band.nextRehearsalOverrideEnabled) return;
    band.nextRehearsalOverrideEnabled = false;
    saveDB(db);
  }

  function proposeRehearsal(band, startISO, endISO, messageText = "Proposed rehearsal added to calendar.") {
    const selectedSpace = getSelectedRehearsalSpace();
    const repeatCount = getRecurringRehearsalCount();
    let firstEvent = null;

    for (let i = 0; i < repeatCount; i++) {
      const start = dateAddDays(new Date(startISO), i * 7);
      const end = dateAddDays(new Date(endISO), i * 7);
      const event = createEventForBand({
        bandId: band.id,
        type: "rehearsal",
        creatorId: user.id,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        title: "Proposed rehearsal",
        address: selectedSpace?.address || null,
        lat: selectedSpace?.lat ?? null,
        lon: selectedSpace?.lon ?? null
      });
      if (!firstEvent) firstEvent = event;
    }

    if (band.nextRehearsalOverrideEnabled) {
      disableNextRehearsalOverrideIfEnabled(band.id);
    }

    selectedEventId = firstEvent?.id || null;
    if (repeatCount > 1) {
      setMsg(`Recurring rehearsal series added (${repeatCount} weeks).`);
    } else {
      setMsg(messageText);
    }
    render();
  }

  function canEditEventTiming(event) {
    return event?.type === "rehearsal" && event.creatorId === user.id;
  }

  function moveOrResizeEvent(eventId, updater) {
    const db = loadDB();
    const event = db.events.find((e) => e.id === eventId && !e.removed);
    if (!event || !canEditEventTiming(event)) return false;

    const curStart = new Date(event.startISO);
    const curEnd = new Date(event.endISO);
    const day = startOfDay(curStart);
    const { nextStart, nextEnd } = updater(curStart, curEnd);

    let startMin = clampToWindow(snapMinutes(minutesSinceMidnight(nextStart)));
    let endMin = clampToWindow(snapMinutes(minutesSinceMidnight(nextEnd)));

    if (endMin <= startMin) endMin = startMin + STEP_MIN;
    if (endMin > END_MIN) endMin = END_MIN;
    if (endMin <= startMin) startMin = Math.max(START_MIN, endMin - STEP_MIN);

    event.startISO = makeDateAt(day, startMin).toISOString();
    event.endISO = makeDateAt(day, endMin).toISOString();
    saveDB(db);
    return true;
  }

  function attachEventDragBehavior(el, event) {
    const rangeMin = END_MIN - START_MIN;

    el.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("resize-handle")) return;
      e.preventDefault();
      e.stopPropagation();

      selectedEventId = event.id;

      const startY = e.clientY;
      const startStartMin = minutesSinceMidnight(new Date(event.startISO));
      const startEndMin = minutesSinceMidnight(new Date(event.endISO));
      const duration = startEndMin - startStartMin;
      const col = e.currentTarget.parentElement;
      const pxToMin = rangeMin / col.getBoundingClientRect().height;

      function onMove(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        let nextStart = startStartMin + delta;
        let nextEnd = nextStart + duration;

        if (nextStart < START_MIN) {
          nextStart = START_MIN;
          nextEnd = nextStart + duration;
        }
        if (nextEnd > END_MIN) {
          nextEnd = END_MIN;
          nextStart = nextEnd - duration;
        }

        el.style.top = `${((nextStart - START_MIN) / rangeMin) * 100}%`;
        el.style.height = `${((nextEnd - nextStart) / rangeMin) * 100}%`;
      }

      function onUp(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        moveOrResizeEvent(event.id, (curS, curE) => {
          const durationMin = minutesSinceMidnight(curE) - minutesSinceMidnight(curS);
          let nextStartMin = minutesSinceMidnight(curS) + delta;
          let nextEndMin = nextStartMin + durationMin;

          if (nextStartMin < START_MIN) {
            nextStartMin = START_MIN;
            nextEndMin = nextStartMin + durationMin;
          }
          if (nextEndMin > END_MIN) {
            nextEndMin = END_MIN;
            nextStartMin = nextEndMin - durationMin;
          }

          const day = startOfDay(curS);
          return {
            nextStart: makeDateAt(day, nextStartMin),
            nextEnd: makeDateAt(day, nextEndMin)
          };
        });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setMsg("Rehearsal time updated.");
        render();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    const handle = el.querySelector(".resize-handle");
    if (!handle) return;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      selectedEventId = event.id;

      const startY = e.clientY;
      const startEndMin = minutesSinceMidnight(new Date(event.endISO));
      const startStartMin = minutesSinceMidnight(new Date(event.startISO));
      const col = e.currentTarget.parentElement.parentElement;
      const pxToMin = rangeMin / col.getBoundingClientRect().height;

      function onMove(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        let nextEnd = clampToWindow(startEndMin + delta);
        if (nextEnd <= startStartMin) nextEnd = startStartMin + STEP_MIN;
        el.style.height = `${((nextEnd - startStartMin) / rangeMin) * 100}%`;
      }

      function onUp(ev) {
        const delta = snapMinutes((ev.clientY - startY) * pxToMin);
        moveOrResizeEvent(event.id, (curS, curE) => {
          const sMin = minutesSinceMidnight(curS);
          let eMin = clampToWindow(minutesSinceMidnight(curE) + delta);
          if (eMin <= sMin) eMin = sMin + STEP_MIN;
          const day = startOfDay(curS);
          return {
            nextStart: makeDateAt(day, sMin),
            nextEnd: makeDateAt(day, eMin)
          };
        });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setMsg("Rehearsal duration updated.");
        render();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function renderEventActions() {
    eventActions.innerHTML = "";
    if (!selectedEventId) return;
    const db = loadDB();
    const event = db.events.find((e) => e.id === selectedEventId && !e.removed);
    if (!event) return;
    const band = db.bands.find((b) => b.id === event.bandId);

    const card = document.createElement("div");
    card.className = "item";

    const myStatus = event.statusByUser?.[user.id] || "pending";
    const location = eventLocationLabel(event);
    const unavailableUsers = Object.entries(event.statusByUser || {})
      .filter(([, status]) => status === "unavailable")
      .map(([uid]) => db.users.find((u) => u.id === uid)?.username)
      .filter(Boolean);

    card.innerHTML = `
      <h3>${event.type === "gig" ? "Gig" : "Rehearsal"}: ${event.title}</h3>
      <p><strong>Band:</strong> ${band?.name || "Unknown"}</p>
      <p><strong>Time:</strong> ${new Date(event.startISO).toLocaleString()} - ${new Date(event.endISO).toLocaleString()}</p>
      ${location ? `<p><strong>Location:</strong> ${location}</p>` : ""}
      <p><strong>Your Status:</strong> ${myStatus}</p>
      ${event.type === "gig" ? `<p><strong>Unavailable Members:</strong> ${unavailableUsers.join(", ") || "None"}</p>` : ""}
      <div class="inline" id="eventButtons"></div>
    `;

    const buttons = card.querySelector("#eventButtons");

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "success";
    confirmBtn.textContent = "Confirm";
    confirmBtn.addEventListener("click", () => {
      setEventStatus(event.id, user.id, "confirmed");
      setMsg("Event confirmed.");
      render();
    });
    buttons.appendChild(confirmBtn);

    const unavailableBtn = document.createElement("button");
    unavailableBtn.type = "button";
    unavailableBtn.className = "secondary";
    unavailableBtn.textContent = "Mark Unavailable";
    unavailableBtn.addEventListener("click", () => {
      setEventStatus(event.id, user.id, "unavailable");
      setMsg("Marked unavailable.");
      render();
    });
    buttons.appendChild(unavailableBtn);

    if (event.creatorId === user.id) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "danger";
      removeBtn.textContent = "Remove Event";
      removeBtn.addEventListener("click", () => {
        removeEvent(event.id, user.id);
        selectedEventId = null;
        setMsg("Event removed.");
        render();
      });
      buttons.appendChild(removeBtn);
    }

    eventActions.appendChild(card);
  }

  function renderCommonSlots() {
    commonSlots.innerHTML = "";
    const band = getSelectedBand();
    if (!band) {
      commonSlots.innerHTML = `<div class="item">Select a band to propose rehearsals.</div>`;
      return;
    }
    const slots = computeNextCommonSlots(band.id, new Date(), 45);
    if (!slots.length) {
      commonSlots.innerHTML = `<div class="item">No upcoming common slots found.</div>`;
      return;
    }

    for (const slot of slots) {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="inline" style="justify-content:space-between;">
          <span>${new Date(slot.startISO).toLocaleString()} - ${new Date(slot.endISO).toLocaleString()}</span>
          <button type="button" class="success">Propose Rehearsal</button>
        </div>
      `;
      row.querySelector("button").addEventListener("click", () => {
        proposeRehearsal(band, slot.startISO, slot.endISO, "Proposed rehearsal added to calendar.");
      });
      commonSlots.appendChild(row);
    }
  }

  function render() {
    populateRehearsalLocations();
    weekLabel.textContent = weekRangeLabel();
    const weekEnd = dateAddDays(weekStart, 7);
    const view = createWeekView(weekShell, weekStart, {
      interactive: true,
      onEmptyClick(dayDate, minute) {
        const band = getSelectedBand();
        if (!band) {
          setMsg("Select a band first.");
          return;
        }

        const duration = Math.min(getBandRegularDuration(band), END_MIN - START_MIN);
        const startMin = Math.min(minute, END_MIN - duration);
        const start = makeDateAt(dayDate, startMin);
        const end = makeDateAt(dayDate, startMin + duration);

        proposeRehearsal(
          band,
          start.toISOString(),
          end.toISOString(),
          "Custom rehearsal proposal added to calendar."
        );
      }
    });
    const db = loadDB();
    const allEvents = listEventsForRange(weekStart, weekEnd);

    for (const e of allEvents) {
      const start = new Date(e.startISO);
      const end = new Date(e.endISO);
      const dayIndex = start.getDay();
      const col = view.dayCols[dayIndex];
      if (!col) continue;

      const top = view.minutesToTopPct(minutesSinceMidnight(start));
      const bottom = view.minutesToTopPct(minutesSinceMidnight(end));
      const height = Math.max(2, bottom - top);

      let extra = "";
      if (e.type === "gig") {
        const my = getCurrentUser();
        if (my?.location?.lat != null && e.lat != null) {
          const miles = haversineMiles(my.location.lat, my.location.lon, e.lat, e.lon);
          extra = ` • ${formatMiles(miles)}`;
        }
      }

      const status = e.statusByUser?.[user.id] || "pending";
      const location = eventLocationLabel(e);
      const bandName = db.bands.find((b) => b.id === e.bandId)?.name || "Unknown band";
      const editableTiming = canEditEventTiming(e);
      const div = document.createElement("div");
      div.className = `slot ${e.type === "gig" ? "event-gig" : "event-rehearsal"}`;
      if (selectedEventId === e.id) div.classList.add("selected");
      div.style.top = `${top}%`;
      div.style.height = `${height}%`;
      div.innerHTML = `
        <strong>${e.type === "gig" ? "Gig" : "Rehearsal"}</strong><br>
        ${e.title}<br>
        Band: ${bandName}<br>
        ${formatTime(start)} - ${formatTime(end)}<br>
        ${location ? `Location: ${location}<br>` : ""}
        Status: ${status}${extra}
        ${editableTiming ? '<div class="resize-handle"></div>' : ""}
      `;
      div.addEventListener("click", () => {
        selectedEventId = e.id;
        render();
      });
      if (editableTiming) attachEventDragBehavior(div, e);
      col.appendChild(div);
    }

    renderCommonSlots();
    renderEventActions();
    exportSelectedGoogle.disabled = !selectedEventId;
  }

  document.getElementById("prevWeek").addEventListener("click", () => {
    weekStart = dateAddDays(weekStart, -7);
    render();
  });

  document.getElementById("nextWeek").addEventListener("click", () => {
    weekStart = dateAddDays(weekStart, 7);
    render();
  });

  bandSelect.addEventListener("change", () => {
    render();
  });

  rehearsalLocation.addEventListener("change", () => {
    const band = getSelectedBand();
    if (!band) return;
    selectedLocationByBand[band.id] = rehearsalLocation.value || "";
  });

  rehearsalRecurring.addEventListener("change", () => {
    syncRecurringControls();
  });

  exportWeekIcs.addEventListener("click", () => {
    const weekEnd = dateAddDays(weekStart, 7);
    const events = listEventsForRange(weekStart, weekEnd);
    downloadICS(events, `band-scheduler-week-${fileDate(weekStart)}.ics`, `Band Scheduler Week ${weekLabel.textContent}`);
  });

  exportUpcomingIcs.addEventListener("click", () => {
    const start = new Date();
    const end = dateAddDays(start, 90);
    const events = listEventsForRange(start, end);
    downloadICS(events, `band-scheduler-upcoming-${fileDate(start)}.ics`, "Band Scheduler Upcoming Events");
  });

  exportSelectedGoogle.addEventListener("click", () => {
    openSelectedEventInGoogleCalendar();
  });

  syncRecurringControls();
  populateBands();
  render();
});
