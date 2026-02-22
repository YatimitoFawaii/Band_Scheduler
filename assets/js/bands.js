function durationOptions(selected) {
  let out = "";
  for (let min = 60; min <= 600; min += 15) {
    const hours = min / 60;
    const label = Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours.toFixed(2)} hours`;
    out += `<option value="${min}" ${selected === min ? "selected" : ""}>${label}</option>`;
  }
  return out;
}

function renderMemberAvatar(member) {
  if (member.photoDataUrl) {
    return `<img class="avatar-sm" src="${member.photoDataUrl}" alt="${member.username}" />`;
  }
  const initial = (member.username || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="avatar-sm avatar-fallback">${initial}</div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("bands.html");

  const msg = document.getElementById("msg");
  const bandsList = document.getElementById("bandsList");

  function setMsg(text) {
    msg.textContent = text || "";
  }

  async function handleCreateBand() {
    const name = document.getElementById("newBandName").value.trim();
    if (!name) {
      setMsg("Enter a band name.");
      return;
    }
    await createBand(name, user.id);
    document.getElementById("newBandName").value = "";
    setMsg("Band created.");
    render();
  }

  async function handleJoinBand() {
    const code = document.getElementById("joinCode").value.trim();
    if (!code) {
      setMsg("Enter a join code.");
      return;
    }
    const res = await joinBandByCode(user.id, code);
    setMsg(res.ok ? "Joined band." : res.message);
    if (res.ok) {
      document.getElementById("joinCode").value = "";
      render();
    }
  }

  function render() {
    const db = loadDB();
    const myBands = getUserBands(user.id);
    myBands.forEach((b) => consumeNextRehearsalOverrideIfNeeded(b.id));

    bandsList.innerHTML = "";
    if (!myBands.length) {
      bandsList.innerHTML = `<div class="item">No bands yet.</div>`;
      return;
    }

    for (const band of myBands) {
      const isLeader = band.leaderId === user.id;
      const members = getBandMembers(band.id);
      const epk = normalizeBandEPK(band.epk, band.name);
      const pendingLeaderRequest = db.leadershipRequests.find(
        (r) =>
          r.scopeType === "band" &&
          r.scopeId === band.id &&
          r.requesterUserId === user.id &&
          r.status === "pending"
      );

      const card = document.createElement("div");
      card.className = "item";
      card.innerHTML = `
        <h3>${band.name}</h3>
        <div class="inline" style="justify-content:space-between;flex-wrap:wrap;">
          <a href="band_profile.html?id=${encodeURIComponent(band.id)}" target="_blank" rel="noopener">Open Public Band Page</a>
          <span class="muted">Band ID: ${band.id}</span>
        </div>
        <div class="list" id="members_${band.id}"></div>
        <p><strong>Join Code:</strong> <code>${band.joinCode}</code></p>
        <div class="inline" style="margin:10px 0;flex-wrap:wrap;">
          <button type="button" class="danger" data-quit-band="${band.id}">Quit This Band</button>
          ${
            isLeader
              ? ""
              : `<button type="button" class="secondary" data-request-leader="${band.id}" ${pendingLeaderRequest ? "disabled" : ""}>
                   ${pendingLeaderRequest ? "Leader Request Pending" : "Request Band Leader"}
                 </button>`
          }
        </div>
        ${isLeader ? `
          <div class="row">
            <div>
              <label>Regular Rehearsal Duration</label>
              <select data-regular="${band.id}">${durationOptions(band.regularDurationMin || 120)}</select>
            </div>
            <div>
              <label>Next Rehearsal</label>
              <select data-next="${band.id}">${durationOptions(band.nextRehearsalDurationMin || 120)}</select>
              <label><input type="checkbox" data-next-enabled="${band.id}" ${band.nextRehearsalOverrideEnabled ? "checked" : ""} /> Set one-time rehearsal duration</label>
            </div>
          </div>
        ` : ""}
        ${isLeader ? `
          <form class="list" data-epk-form="${band.id}">
            <h4 style="margin-bottom:4px;">Public Band Page (EPK) Settings</h4>
            <div class="row">
              <div>
                <label>Public Title</label>
                <input data-epk-title="${band.id}" value="${epk.customTitle || band.name}" />
              </div>
              <div>
                <label>Logo</label>
                <input data-epk-logo="${band.id}" type="file" accept="image/*" />
                <label><input data-epk-logo-remove="${band.id}" type="checkbox" /> Remove current logo</label>
              </div>
            </div>
            ${epk.logoDataUrl ? `<img class="band-logo-preview" src="${epk.logoDataUrl}" alt="${band.name} logo" />` : ""}
            <label><input data-epk-use-logo="${band.id}" type="checkbox" ${epk.useLogoTitle ? "checked" : ""} /> Use logo instead of text title</label>
            <div class="row">
              <div>
                <label>Booking Name</label>
                <input data-epk-booking-name="${band.id}" value="${epk.bookingName}" />
              </div>
              <div>
                <label>Booking Email</label>
                <input data-epk-booking-email="${band.id}" type="email" value="${epk.bookingEmail}" />
              </div>
              <div>
                <label>Booking Phone</label>
                <input data-epk-booking-phone="${band.id}" value="${epk.bookingPhone}" />
              </div>
            </div>
            <div class="row">
              <div>
                <label>Background Color</label>
                <input data-epk-bg-color="${band.id}" type="color" value="${epk.bgColor}" />
              </div>
              <div>
                <label>Font Color</label>
                <input data-epk-font-color="${band.id}" type="color" value="${epk.fontColor}" />
              </div>
              <div>
                <label>Accent Color</label>
                <input data-epk-accent-color="${band.id}" type="color" value="${epk.accentColor}" />
              </div>
            </div>
            <div>
              <label>Sample Videos (one URL per line)</label>
              <textarea data-epk-videos="${band.id}" rows="4">${epk.videos.join("\n")}</textarea>
            </div>
            <div>
              <label>Audio Links (one URL per line)</label>
              <textarea data-epk-audio="${band.id}" rows="4">${epk.audioLinks.join("\n")}</textarea>
            </div>
            <button type="submit">Save EPK Settings</button>
          </form>
        ` : ""}
      `;

      const membersWrap = card.querySelector(`#members_${band.id}`);
      for (const member of members) {
        const memberRow = document.createElement("div");
        memberRow.className = "inline";
        memberRow.style.justifyContent = "space-between";
        memberRow.innerHTML = `
          <span class="inline" style="gap:10px;">
            ${renderMemberAvatar(member)}
            <span>
              ${member.id === band.leaderId ? "👑 " : ""}<a href="user_profile.html?id=${encodeURIComponent(member.id)}" target="_blank" rel="noopener">${member.username}</a> (${member.email})
              <div class="muted">Role: ${member.role || "Not set"}</div>
            </span>
          </span>
          <span class="inline" id="memberActions_${band.id}_${member.id}"></span>
        `;
        const actions = memberRow.querySelector(`#memberActions_${band.id}_${member.id}`);

        if (isLeader || member.id === user.id) {
          const roleInput = document.createElement("input");
          roleInput.placeholder = "Role (instrument, vocals, etc.)";
          roleInput.value = member.role || "";
          roleInput.style.width = "220px";
          actions.appendChild(roleInput);

          const roleBtn = document.createElement("button");
          roleBtn.type = "button";
          roleBtn.className = "secondary";
          roleBtn.textContent = "Save Role";
          roleBtn.addEventListener("click", () => {
            const res = setMembershipRole(user.id, band.id, member.id, roleInput.value);
            setMsg(res.ok ? "Member role updated." : res.message || "Could not update role.");
            if (res.ok) render();
          });
          actions.appendChild(roleBtn);
        }

        if (isLeader && member.id !== user.id) {
          const transfer = document.createElement("button");
          transfer.type = "button";
          transfer.className = "secondary";
          transfer.textContent = "Transfer Leadership";
          transfer.addEventListener("click", () => {
            transferLeadership(user.id, member.id, band.id);
            setMsg("Leadership transferred.");
            render();
          });
          actions.appendChild(transfer);

          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "danger";
          remove.textContent = "Remove Member";
          remove.addEventListener("click", () => {
            removeMemberFromBand(user.id, member.id, band.id);
            setMsg("Member removed.");
            render();
          });
          actions.appendChild(remove);
        }
        membersWrap.appendChild(memberRow);
      }

      bandsList.appendChild(card);
    }

    bandsList.querySelectorAll("[data-quit-band]").forEach((btn) => {
      btn.addEventListener("click", () => {
        quitBand(user.id, btn.dataset.quitBand);
        setMsg("You left the band.");
        render();
      });
    });

    bandsList.querySelectorAll("[data-request-leader]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = requestLeadershipRole(user.id, "band", btn.dataset.requestLeader);
        setMsg(res.ok ? "Band leader request sent." : res.message || "Could not send request.");
        if (res.ok) render();
      });
    });

    bandsList.querySelectorAll("select[data-regular]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const bandId = sel.dataset.regular;
        const regular = Number(sel.value);
        const next = Number(bandsList.querySelector(`select[data-next='${bandId}']`).value);
        const enabled = bandsList.querySelector(`input[data-next-enabled='${bandId}']`).checked;
        setBandDurations(user.id, bandId, regular, next, enabled);
        setMsg("Band rehearsal durations updated.");
      });
    });

    bandsList.querySelectorAll("select[data-next], input[data-next-enabled]").forEach((el) => {
      el.addEventListener("change", () => {
        const bandId = el.dataset.next || el.dataset.nextEnabled;
        const regular = Number(bandsList.querySelector(`select[data-regular='${bandId}']`).value);
        const next = Number(bandsList.querySelector(`select[data-next='${bandId}']`).value);
        const enabled = bandsList.querySelector(`input[data-next-enabled='${bandId}']`).checked;
        setBandDurations(user.id, bandId, regular, next, enabled);
        setMsg("Band rehearsal durations updated.");
      });
    });

    bandsList.querySelectorAll("form[data-epk-form]").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const bandId = form.dataset.epkForm;
        const db2 = loadDB();
        const band = db2.bands.find((b) => b.id === bandId);
        if (!band) {
          setMsg("Band not found.");
          return;
        }

        let logoDataUrl = normalizeBandEPK(band.epk, band.name).logoDataUrl || null;
        const removeLogo = form.querySelector(`[data-epk-logo-remove='${bandId}']`).checked;
        const logoFile = form.querySelector(`[data-epk-logo='${bandId}']`).files?.[0];

        if (removeLogo) logoDataUrl = null;
        if (logoFile) {
          try {
            logoDataUrl = await readImageFileAsDataUrl(logoFile, 1000);
          } catch (err) {
            setMsg(err.message || "Failed to process logo image.");
            return;
          }
        }

        const res = updateBandEPK(user.id, bandId, {
          customTitle: form.querySelector(`[data-epk-title='${bandId}']`).value.trim(),
          useLogoTitle: form.querySelector(`[data-epk-use-logo='${bandId}']`).checked,
          logoDataUrl,
          bookingName: form.querySelector(`[data-epk-booking-name='${bandId}']`).value.trim(),
          bookingEmail: form.querySelector(`[data-epk-booking-email='${bandId}']`).value.trim(),
          bookingPhone: form.querySelector(`[data-epk-booking-phone='${bandId}']`).value.trim(),
          bgColor: form.querySelector(`[data-epk-bg-color='${bandId}']`).value,
          fontColor: form.querySelector(`[data-epk-font-color='${bandId}']`).value,
          accentColor: form.querySelector(`[data-epk-accent-color='${bandId}']`).value,
          videos: parseMultilineUrls(form.querySelector(`[data-epk-videos='${bandId}']`).value, 12),
          audioLinks: parseMultilineUrls(form.querySelector(`[data-epk-audio='${bandId}']`).value, 20)
        });
        setMsg(res.ok ? "EPK settings updated." : res.message || "Could not update EPK settings.");
        if (res.ok) render();
      });
    });
  }

  document.getElementById("createBandBtn").addEventListener("click", handleCreateBand);
  document.getElementById("joinBandBtn").addEventListener("click", handleJoinBand);

  render();
});
