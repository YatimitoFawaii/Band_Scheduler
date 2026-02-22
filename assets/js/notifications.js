document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("notifications.html");

  const incomingRequests = document.getElementById("incomingRequests");
  const myRequests = document.getElementById("myRequests");
  const msg = document.getElementById("msg");

  function setMsg(text) {
    msg.textContent = text || "";
  }

  function scopeLabel(request, db) {
    if (request.scopeType === "band") {
      const band = db.bands.find((b) => b.id === request.scopeId);
      return `Band: ${band?.name || "Unknown"}`;
    }
    const campaign = db.campaigns.find((c) => c.id === request.scopeId);
    return `Campaign: ${campaign?.name || "Unknown"}`;
  }

  function render() {
    const db = loadDB();
    const incoming = getPendingLeadershipRequestsForOwner(user.id, db).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const mine = getLeadershipRequestsForUser(user.id, db)
      .filter((r) => r.requesterUserId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    incomingRequests.innerHTML = "";
    if (!incoming.length) {
      incomingRequests.innerHTML = `<div class="item">No pending requests.</div>`;
    } else {
      incoming.forEach((request) => {
        const requester = db.users.find((u) => u.id === request.requesterUserId);
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <p><strong>${request.scopeType === "band" ? "Band Leader" : "Dungeon Master"} request</strong></p>
          <p><strong>From:</strong> ${requester?.username || "Unknown user"}</p>
          <p><strong>Scope:</strong> ${scopeLabel(request, db)}</p>
          <p><strong>Requested:</strong> ${new Date(request.createdAt).toLocaleString()}</p>
          <div class="inline">
            <button type="button" class="success" data-approve="${request.id}">Approve</button>
            <button type="button" class="danger" data-reject="${request.id}">Reject</button>
          </div>
        `;
        incomingRequests.appendChild(row);
      });
    }

    myRequests.innerHTML = "";
    if (!mine.length) {
      myRequests.innerHTML = `<div class="item">You have not submitted leadership requests.</div>`;
    } else {
      mine.forEach((request) => {
        const statusClass =
          request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "secondary";
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <p><strong>${request.scopeType === "band" ? "Band Leader" : "Dungeon Master"} request</strong></p>
          <p><strong>Scope:</strong> ${scopeLabel(request, db)}</p>
          <p><strong>Status:</strong> <span class="badge ${statusClass}">${request.status}</span></p>
          <p><strong>Submitted:</strong> ${new Date(request.createdAt).toLocaleString()}</p>
          ${request.resolvedAt ? `<p><strong>Resolved:</strong> ${new Date(request.resolvedAt).toLocaleString()}</p>` : ""}
        `;
        myRequests.appendChild(row);
      });
    }

    incomingRequests.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = resolveLeadershipRequest(btn.dataset.approve, user.id, "approved");
        setMsg(res.ok ? "Request approved." : res.message || "Could not approve request.");
        render();
      });
    });
    incomingRequests.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = resolveLeadershipRequest(btn.dataset.reject, user.id, "rejected");
        setMsg(res.ok ? "Request rejected." : res.message || "Could not reject request.");
        render();
      });
    });
  }

  render();
});
