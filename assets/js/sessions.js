document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("sessions.html");

  const campaignSelect = document.getElementById("campaignSelect");
  const sessionLocationMode = document.getElementById("sessionLocationMode");
  const sessionAddress = document.getElementById("sessionAddress");
  const sessionRoll20Url = document.getElementById("sessionRoll20Url");
  const sessionRecurring = document.getElementById("sessionRecurring");
  const sessionRecurringCount = document.getElementById("sessionRecurringCount");
  const weekShell = document.getElementById("weekShell");
  const weekLabel = document.getElementById("weekLabel");
  const commonSlots = document.getElementById("commonSlots");
  const sessionActions = document.getElementById("sessionActions");
  const msg = document.getElementById("msg");

  const initialCampaignId = new URLSearchParams(window.location.search).get("campaignId");
  let campaigns = getUserCampaigns(user.id);
  let weekStart = startOfWeek(new Date());
  let selectedSessionId = null;

  function setMsg(text) {
    msg.textContent = text || "";
  }

  function weekRangeLabel() {
    const end = dateAddDays(weekStart, 6);
    return `${weekStart.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  function populateCampaigns() {
    campaigns = getUserCampaigns(user.id);
    if (!campaigns.length) {
      campaignSelect.innerHTML = `<option value="">No campaigns joined</option>`;
      campaignSelect.disabled = true;
      return;
    }
    campaignSelect.disabled = false;
    campaignSelect.innerHTML = campaigns.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    if (initialCampaignId && campaigns.some((c) => c.id === initialCampaignId)) {
      campaignSelect.value = initialCampaignId;
    }
  }

  function getSelectedCampaign() {
    const db = loadDB();
    return db.campaigns.find((c) => c.id === campaignSelect.value) || null;
  }

  function syncRecurringControls() {
    sessionRecurringCount.disabled = !sessionRecurring.checked;
  }

  function syncLocationControls() {
    const mode = sessionLocationMode.value;
    if (mode === "in_person") {
      sessionAddress.disabled = false;
      sessionRoll20Url.disabled = true;
      return;
    }
    if (mode === "roll20_online") {
      sessionAddress.disabled = true;
      sessionRoll20Url.disabled = false;
      return;
    }
    sessionAddress.disabled = false;
    sessionRoll20Url.disabled = false;
  }

  function getRecurringCount() {
    if (!sessionRecurring.checked) return 1;
    const n = Number(sessionRecurringCount.value);
    if (!Number.isFinite(n) || n < 2) return 2;
    return Math.floor(n);
  }

  function formatLocationLine(session) {
    const modeLabel =
      session.locationMode === "roll20_online"
        ? "Roll20 Online"
        : session.locationMode === "roll20_hybrid"
          ? "Roll20 In Person"
          : "In Person";
    const parts = [modeLabel];
    if (session.locationAddress) parts.push(session.locationAddress);
    if (session.roll20Url) parts.push("Roll20 link");
    return parts.join(" • ");
  }

  function disableNextSessionOverrideIfEnabled(campaignId) {
    const db = loadDB();
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign || !campaign.nextSessionOverrideEnabled) return;
    campaign.nextSessionOverrideEnabled = false;
    saveDB(db);
  }

  function validateLocationInputs() {
    const mode = sessionLocationMode.value;
    const address = sessionAddress.value.trim();
    const roll20 = sessionRoll20Url.value.trim();
    if (mode === "roll20_online" && !roll20) {
      return { ok: false, message: "Roll20 link is required for online sessions." };
    }
    if (mode === "roll20_hybrid" && (!address || !roll20)) {
      return { ok: false, message: "Hybrid sessions require both address and Roll20 link." };
    }
    return { ok: true, mode, address, roll20 };
  }

  function proposeSession(campaign, startISO, endISO, messageText = "Proposed session added to calendar.") {
    const locationCheck = validateLocationInputs();
    if (!locationCheck.ok) {
      setMsg(locationCheck.message);
      return;
    }

    const repeatCount = getRecurringCount();
    let firstSession = null;
    for (let i = 0; i < repeatCount; i++) {
      const start = dateAddDays(new Date(startISO), i * 7);
      const end = dateAddDays(new Date(endISO), i * 7);
      const session = createSessionForCampaign({
        campaignId: campaign.id,
        creatorId: user.id,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        title: "Proposed session",
        locationMode: locationCheck.mode,
        locationAddress: locationCheck.address || null,
        roll20Url: locationCheck.roll20 || null
      });
      if (!firstSession) firstSession = session;
    }

    if (campaign.nextSessionOverrideEnabled) {
      disableNextSessionOverrideIfEnabled(campaign.id);
    }

    selectedSessionId = firstSession?.id || null;
    setMsg(repeatCount > 1 ? `Recurring session series added (${repeatCount} weeks).` : messageText);
    render();
  }

  function canEditSessionTiming(session) {
    return session?.creatorId === user.id;
  }

  function moveOrResizeSession(sessionId, updater) {
    const db = loadDB();
    const session = db.campaignSessions.find((s) => s.id === sessionId && !s.removed);
    if (!session || !canEditSessionTiming(session)) return false;

    const curStart = new Date(session.startISO);
    const curEnd = new Date(session.endISO);
    const day = startOfDay(curStart);
    const { nextStart, nextEnd } = updater(curStart, curEnd);

    let startMin = clampToWindow(snapMinutes(minutesFromDayStart(nextStart, day)));
    let endMin = clampToWindow(snapMinutes(minutesFromDayStart(nextEnd, day)));

    if (endMin <= startMin) endMin = startMin + STEP_MIN;
    if (endMin > END_MIN) endMin = END_MIN;
    if (endMin <= startMin) startMin = Math.max(START_MIN, endMin - STEP_MIN);

    session.startISO = makeDateAt(day, startMin).toISOString();
    session.endISO = makeDateAt(day, endMin).toISOString();
    saveDB(db);
    return true;
  }

  function attachSessionDragBehavior(el, session) {
    const rangeMin = END_MIN - START_MIN;

    el.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("resize-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      selectedSessionId = session.id;

      const startY = e.clientY;
      const sessionStart = new Date(session.startISO);
      const startStartMin = minutesFromDayStart(sessionStart, sessionStart);
      const startEndMin = minutesFromDayStart(new Date(session.endISO), sessionStart);
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
        moveOrResizeSession(session.id, (curS, curE) => {
          const day = startOfDay(curS);
          const durationMin = minutesFromDayStart(curE, day) - minutesFromDayStart(curS, day);
          let nextStartMin = minutesFromDayStart(curS, day) + delta;
          let nextEndMin = nextStartMin + durationMin;
          if (nextStartMin < START_MIN) {
            nextStartMin = START_MIN;
            nextEndMin = nextStartMin + durationMin;
          }
          if (nextEndMin > END_MIN) {
            nextEndMin = END_MIN;
            nextStartMin = nextEndMin - durationMin;
          }
          return {
            nextStart: makeDateAt(day, nextStartMin),
            nextEnd: makeDateAt(day, nextEndMin)
          };
        });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setMsg("Session time updated.");
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
      selectedSessionId = session.id;

      const startY = e.clientY;
      const sessionStart = new Date(session.startISO);
      const startStartMin = minutesFromDayStart(sessionStart, sessionStart);
      const startEndMin = minutesFromDayStart(new Date(session.endISO), sessionStart);
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
        moveOrResizeSession(session.id, (curS, curE) => {
          const day = startOfDay(curS);
          const sMin = minutesFromDayStart(curS, day);
          let eMin = clampToWindow(minutesFromDayStart(curE, day) + delta);
          if (eMin <= sMin) eMin = sMin + STEP_MIN;
          return { nextStart: makeDateAt(day, sMin), nextEnd: makeDateAt(day, eMin) };
        });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setMsg("Session duration updated.");
        render();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function renderSessionActions() {
    sessionActions.innerHTML = "";
    if (!selectedSessionId) return;
    const db = loadDB();
    const session = db.campaignSessions.find((s) => s.id === selectedSessionId && !s.removed);
    if (!session) return;
    const campaign = db.campaigns.find((c) => c.id === session.campaignId);

    const myStatus = session.statusByUser?.[user.id] || "pending";
    const card = document.createElement("div");
    card.className = "item";
    card.innerHTML = `
      <h3>Session: ${session.title}</h3>
      <p><strong>Campaign:</strong> ${campaign?.name || "Unknown"}</p>
      <p><strong>Time:</strong> ${new Date(session.startISO).toLocaleString()} - ${new Date(session.endISO).toLocaleString()}</p>
      <p><strong>Location:</strong> ${formatLocationLine(session)}</p>
      ${
        session.roll20Url
          ? `<p><strong>Roll20:</strong> <a href="${session.roll20Url}" target="_blank" rel="noopener">${session.roll20Url}</a></p>`
          : ""
      }
      <p><strong>Your Status:</strong> ${myStatus}</p>
      <div class="inline" id="sessionButtons"></div>
    `;

    const buttons = card.querySelector("#sessionButtons");
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "success";
    confirmBtn.textContent = "Confirm";
    confirmBtn.addEventListener("click", () => {
      setCampaignSessionStatus(session.id, user.id, "confirmed");
      setMsg("Session confirmed.");
      render();
    });
    buttons.appendChild(confirmBtn);

    const unavailableBtn = document.createElement("button");
    unavailableBtn.type = "button";
    unavailableBtn.className = "secondary";
    unavailableBtn.textContent = "Mark Unavailable";
    unavailableBtn.addEventListener("click", () => {
      setCampaignSessionStatus(session.id, user.id, "unavailable");
      setMsg("Marked unavailable.");
      render();
    });
    buttons.appendChild(unavailableBtn);

    if (session.creatorId === user.id) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "danger";
      removeBtn.textContent = "Remove Session";
      removeBtn.addEventListener("click", () => {
        removeCampaignSession(session.id, user.id);
        selectedSessionId = null;
        setMsg("Session removed.");
        render();
      });
      buttons.appendChild(removeBtn);
    }

    sessionActions.appendChild(card);
  }

  function renderCommonSlots() {
    commonSlots.innerHTML = "";
    const campaign = getSelectedCampaign();
    if (!campaign) {
      commonSlots.innerHTML = `<div class="item">Select a campaign to propose sessions.</div>`;
      return;
    }
    const slots = computeNextCampaignCommonSlots(campaign.id, new Date(), 45);
    if (!slots.length) {
      commonSlots.innerHTML = `<div class="item">No upcoming common slots found.</div>`;
      return;
    }

    slots.forEach((slot) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="inline" style="justify-content:space-between;">
          <span>${new Date(slot.startISO).toLocaleString()} - ${new Date(slot.endISO).toLocaleString()}</span>
          <button type="button" class="success">Propose Session</button>
        </div>
      `;
      row.querySelector("button").addEventListener("click", () => {
        proposeSession(campaign, slot.startISO, slot.endISO, "Proposed session added to calendar.");
      });
      commonSlots.appendChild(row);
    });
  }

  function render() {
    weekLabel.textContent = weekRangeLabel();
    const weekEnd = dateAddDays(weekStart, 7);
    const view = createWeekView(weekShell, weekStart, {
      interactive: true,
      onEmptyClick(dayDate, minute) {
        const campaign = getSelectedCampaign();
        if (!campaign) {
          setMsg("Select a campaign first.");
          return;
        }
        const duration = Math.min(getCampaignRegularDuration(campaign), END_MIN - START_MIN);
        const startMin = Math.min(minute, END_MIN - duration);
        const start = makeDateAt(dayDate, startMin);
        const end = makeDateAt(dayDate, startMin + duration);
        proposeSession(campaign, start.toISOString(), end.toISOString(), "Custom session proposal added.");
      }
    });

    const db = loadDB();
    const allSessions = getCampaignSessionsForUserInRange(user.id, weekStart, weekEnd).sort(
      (a, b) => new Date(a.startISO) - new Date(b.startISO)
    );

    allSessions.forEach((session) => {
      const start = new Date(session.startISO);
      const end = new Date(session.endISO);
      const dayIndex = start.getDay();
      const col = view.dayCols[dayIndex];
      if (!col) return;

      const top = view.minutesToTopPct(minutesFromDayStart(start, start));
      const bottom = view.minutesToTopPct(minutesFromDayStart(end, start));
      const height = Math.max(2, bottom - top);
      const status = session.statusByUser?.[user.id] || "pending";
      const campaignName = db.campaigns.find((c) => c.id === session.campaignId)?.name || "Unknown campaign";
      const editableTiming = canEditSessionTiming(session);

      const div = document.createElement("div");
      div.className = "slot event-session";
      if (selectedSessionId === session.id) div.classList.add("selected");
      div.style.top = `${top}%`;
      div.style.height = `${height}%`;
      div.innerHTML = `
        <strong>Session</strong><br>
        ${session.title}<br>
        Campaign: ${campaignName}<br>
        ${formatTime(start)} - ${formatTime(end)}<br>
        ${formatLocationLine(session)}<br>
        Status: ${status}
        ${editableTiming ? '<div class="resize-handle"></div>' : ""}
      `;
      div.addEventListener("click", () => {
        selectedSessionId = session.id;
        render();
      });
      if (editableTiming) attachSessionDragBehavior(div, session);
      col.appendChild(div);
    });

    renderCommonSlots();
    renderSessionActions();
  }

  document.getElementById("prevWeek").addEventListener("click", () => {
    weekStart = dateAddDays(weekStart, -7);
    render();
  });

  document.getElementById("nextWeek").addEventListener("click", () => {
    weekStart = dateAddDays(weekStart, 7);
    render();
  });

  campaignSelect.addEventListener("change", () => render());
  sessionLocationMode.addEventListener("change", () => syncLocationControls());
  sessionRecurring.addEventListener("change", () => syncRecurringControls());

  syncRecurringControls();
  syncLocationControls();
  populateCampaigns();
  render();
});
