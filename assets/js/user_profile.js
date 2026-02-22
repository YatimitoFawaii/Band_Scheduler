function renderAvatar(photoDataUrl, username) {
  if (photoDataUrl) {
    return `<img class="avatar-lg" src="${photoDataUrl}" alt="${username}" />`;
  }
  const initial = (username || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="avatar-lg avatar-fallback">${initial}</div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = document.getElementById("profileShell");
  const msg = document.getElementById("msg");
  const targetUserId = new URLSearchParams(window.location.search).get("id");

  if (!targetUserId) {
    msg.textContent = "Missing user profile id.";
    return;
  }

  const db = loadDB();
  const viewer = getCurrentUser();
  const profile = getUserPublicView(targetUserId, viewer?.id || null, db);
  if (!profile) {
    msg.textContent = "User profile not found.";
    return;
  }

  const bandsList = profile.bands.length
    ? profile.bands
        .map(
          (band) => `
            <li>
              <a href="band_profile.html?id=${encodeURIComponent(band.id)}" target="_blank" rel="noopener">
                ${band.name}
              </a>
            </li>
          `
        )
        .join("")
    : "<li>No bands listed.</li>";

  shell.innerHTML = `
    <div class="item profile-hero">
      <div>${renderAvatar(profile.photoDataUrl, profile.username)}</div>
      <div>
        <h2 style="margin:0;">${profile.username}</h2>
        <p class="muted" style="margin-top:6px;">
          ${profile.canViewPrivate
            ? "You share at least one band, so private contact details are visible."
            : "Public view: contact details are visible only to shared band members."}
        </p>
      </div>
    </div>
    <div class="item">
      <h3>Contact</h3>
      <p><strong>Home Address:</strong> ${profile.canViewPrivate ? (profile.homeAddress || "Not provided") : "Private"}</p>
      <p><strong>Mobile Phone:</strong> ${profile.canViewPrivate ? (profile.mobilePhone || "Not provided") : "Private"}</p>
    </div>
    <div class="item">
      <h3>Bands</h3>
      <ul class="clean-list">${bandsList}</ul>
    </div>
  `;
});
