function sessionDurationOptions(selected) {
  let out = "";
  for (let min = 60; min <= 600; min += 15) {
    const hours = min / 60;
    const label = Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours.toFixed(2)} hours`;
    out += `<option value="${min}" ${selected === min ? "selected" : ""}>${label}</option>`;
  }
  return out;
}

function memberAvatar(member) {
  if (member.photoDataUrl) return `<img class="avatar-sm" src="${member.photoDataUrl}" alt="${member.username}" />`;
  const initial = (member.username || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="avatar-sm avatar-fallback">${initial}</div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("campaigns.html");

  const msg = document.getElementById("msg");
  const campaignsList = document.getElementById("campaignsList");

  function setMsg(text) {
    msg.textContent = text || "";
  }

  async function handleCreateCampaign() {
    const name = document.getElementById("newCampaignName").value.trim();
    if (!name) {
      setMsg("Enter a campaign name.");
      return;
    }
    await createCampaign(name, user.id);
    document.getElementById("newCampaignName").value = "";
    setMsg("Campaign created.");
    render();
  }

  async function handleJoinCampaign() {
    const code = document.getElementById("joinCampaignCode").value.trim();
    if (!code) {
      setMsg("Enter a join code.");
      return;
    }
    const res = await joinCampaignByCode(user.id, code);
    setMsg(res.ok ? "Joined campaign." : res.message);
    if (res.ok) {
      document.getElementById("joinCampaignCode").value = "";
      render();
    }
  }

  function render() {
    const db = loadDB();
    const myCampaigns = getUserCampaigns(user.id);
    myCampaigns.forEach((c) => consumeNextSessionOverrideIfNeeded(c.id));

    campaignsList.innerHTML = "";
    if (!myCampaigns.length) {
      campaignsList.innerHTML = `<div class="item">No campaigns yet.</div>`;
      return;
    }

    for (const campaign of myCampaigns) {
      const isDM = campaign.dmId === user.id;
      const members = getCampaignMembers(campaign.id);
      const pendingMine = db.leadershipRequests.find(
        (r) =>
          r.scopeType === "campaign" &&
          r.scopeId === campaign.id &&
          r.requesterUserId === user.id &&
          r.status === "pending"
      );

      const card = document.createElement("div");
      card.className = "item";
      card.innerHTML = `
        <h3>${campaign.name}</h3>
        <div class="inline" style="justify-content:space-between;flex-wrap:wrap;">
          <a href="sessions.html?campaignId=${encodeURIComponent(campaign.id)}">Open Sessions Planner</a>
          <span class="muted">Campaign ID: ${campaign.id}</span>
        </div>
        <div class="list" id="members_${campaign.id}"></div>
        <p><strong>Join Code:</strong> <code>${campaign.joinCode}</code></p>
        <div class="inline" style="margin:10px 0;flex-wrap:wrap;">
          <button type="button" class="danger" data-quit-campaign="${campaign.id}">Leave Campaign</button>
          ${
            isDM
              ? ""
              : `<button type="button" class="secondary" data-request-dm="${campaign.id}" ${pendingMine ? "disabled" : ""}>
                   ${pendingMine ? "DM Request Pending" : "Request Dungeon Master"}
                 </button>`
          }
        </div>
        ${
          isDM
            ? `
          <div class="row">
            <div>
              <label>Regular Session Duration</label>
              <select data-regular-session="${campaign.id}">${sessionDurationOptions(campaign.regularSessionDurationMin || 180)}</select>
            </div>
            <div>
              <label>Next Session</label>
              <select data-next-session="${campaign.id}">${sessionDurationOptions(campaign.nextSessionDurationMin || 180)}</select>
              <label><input type="checkbox" data-next-session-enabled="${campaign.id}" ${campaign.nextSessionOverrideEnabled ? "checked" : ""} /> Set one-time session duration</label>
            </div>
          </div>
        `
            : ""
        }
      `;

      const membersWrap = card.querySelector(`#members_${campaign.id}`);
      for (const member of members) {
        const memberSheet = getCharacterSheet(member.id, campaign.id);
        const memberRow = document.createElement("div");
        memberRow.className = "inline";
        memberRow.style.justifyContent = "space-between";
        memberRow.innerHTML = `
          <span class="inline" style="gap:10px;">
            ${memberAvatar(member)}
            <span>
              ${member.id === campaign.dmId ? "🎲 " : ""}${member.username}
              <div class="muted">Role: ${member.role || "Not set"}</div>
              <div class="muted">Character: ${memberSheet.characterName || "Not set"} ${memberSheet.classAndLevel ? `(${memberSheet.classAndLevel})` : ""}</div>
            </span>
          </span>
          <span class="inline" id="memberActions_${campaign.id}_${member.id}"></span>
        `;
        const actions = memberRow.querySelector(`#memberActions_${campaign.id}_${member.id}`);

        if (isDM || member.id === user.id) {
          const roleInput = document.createElement("input");
          roleInput.placeholder = "Role (cleric, fighter, etc.)";
          roleInput.value = member.role || "";
          roleInput.style.width = "220px";
          actions.appendChild(roleInput);

          const roleBtn = document.createElement("button");
          roleBtn.type = "button";
          roleBtn.className = "secondary";
          roleBtn.textContent = "Save Role";
          roleBtn.addEventListener("click", () => {
            const res = setCampaignMembershipRole(user.id, campaign.id, member.id, roleInput.value);
            setMsg(res.ok ? "Campaign role updated." : res.message || "Could not update role.");
            if (res.ok) render();
          });
          actions.appendChild(roleBtn);
        }

        if (isDM && member.id !== user.id) {
          const transfer = document.createElement("button");
          transfer.type = "button";
          transfer.className = "secondary";
          transfer.textContent = "Make Dungeon Master";
          transfer.addEventListener("click", () => {
            const res = transferDungeonMaster(user.id, member.id, campaign.id);
            setMsg(res.ok ? "Dungeon master transferred." : "Could not transfer dungeon master.");
            if (res.ok) render();
          });
          actions.appendChild(transfer);

          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "danger";
          remove.textContent = "Remove Player";
          remove.addEventListener("click", () => {
            const res = removeMemberFromCampaign(user.id, member.id, campaign.id);
            setMsg(res.ok ? "Player removed." : "Could not remove player.");
            if (res.ok) render();
          });
          actions.appendChild(remove);
        }

        membersWrap.appendChild(memberRow);
      }

      campaignsList.appendChild(card);
    }

    campaignsList.querySelectorAll("[data-quit-campaign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        quitCampaign(user.id, btn.dataset.quitCampaign);
        setMsg("You left the campaign.");
        render();
      });
    });

    campaignsList.querySelectorAll("[data-request-dm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = requestLeadershipRole(user.id, "campaign", btn.dataset.requestDm);
        setMsg(res.ok ? "Dungeon Master request sent." : res.message || "Could not send request.");
        if (res.ok) render();
      });
    });

    campaignsList.querySelectorAll("select[data-regular-session]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const campaignId = sel.dataset.regularSession;
        const regular = Number(sel.value);
        const next = Number(campaignsList.querySelector(`select[data-next-session='${campaignId}']`).value);
        const enabled = campaignsList.querySelector(`input[data-next-session-enabled='${campaignId}']`).checked;
        setCampaignDurations(user.id, campaignId, regular, next, enabled);
        setMsg("Campaign session durations updated.");
      });
    });

    campaignsList.querySelectorAll("select[data-next-session], input[data-next-session-enabled]").forEach((el) => {
      el.addEventListener("change", () => {
        const campaignId = el.dataset.nextSession || el.dataset.nextSessionEnabled;
        const regular = Number(campaignsList.querySelector(`select[data-regular-session='${campaignId}']`).value);
        const next = Number(campaignsList.querySelector(`select[data-next-session='${campaignId}']`).value);
        const enabled = campaignsList.querySelector(`input[data-next-session-enabled='${campaignId}']`).checked;
        setCampaignDurations(user.id, campaignId, regular, next, enabled);
        setMsg("Campaign session durations updated.");
      });
    });
  }

  document.getElementById("createCampaignBtn").addEventListener("click", handleCreateCampaign);
  document.getElementById("joinCampaignBtn").addEventListener("click", handleJoinCampaign);

  render();
});
