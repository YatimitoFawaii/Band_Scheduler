function parseYouTubeEmbedUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") {
      videoId = url.pathname.slice(1);
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      videoId = url.searchParams.get("v") || "";
      if (!videoId && url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/")[2] || "";
      }
      if (!videoId && url.pathname.startsWith("/shorts/")) {
        videoId = url.pathname.split("/")[2] || "";
      }
    }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
  } catch {
    return null;
  }
}

function renderMemberAvatar(member) {
  if (member.photoDataUrl) {
    return `<img class="avatar-md" src="${member.photoDataUrl}" alt="${member.username}" />`;
  }
  const initial = (member.username || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="avatar-md avatar-fallback">${initial}</div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = document.getElementById("bandProfileShell");
  const msg = document.getElementById("msg");
  const card = document.getElementById("bandProfileCard");
  const bandId = new URLSearchParams(window.location.search).get("id");

  if (!bandId) {
    msg.textContent = "Missing band id.";
    return;
  }

  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band) {
    msg.textContent = "Band not found.";
    return;
  }

  const epk = normalizeBandEPK(band.epk, band.name);
  const members = getBandMembers(band.id, db);
  const upcomingGigs = getBandUpcomingGigs(band.id, new Date(), 20, db);

  card.style.background = epk.bgColor || "#102a43";
  card.style.color = epk.fontColor || "#ffffff";
  card.style.setProperty("--band-accent", epk.accentColor || "#f08b2d");

  const title = epk.customTitle || band.name;
  const heroTitle = epk.useLogoTitle && epk.logoDataUrl
    ? `<img class="band-logo" src="${epk.logoDataUrl}" alt="${title}" />`
    : `<h1 class="band-public-title">${title}</h1>`;

  const bookingItems = [epk.bookingName, epk.bookingEmail, epk.bookingPhone].filter(Boolean);
  const bookingMarkup = bookingItems.length
    ? bookingItems.map((item) => `<div>${item}</div>`).join("")
    : `<span class="muted">No booking contact listed.</span>`;

  const videosMarkup = epk.videos.length
    ? epk.videos
        .map((url) => {
          const embed = parseYouTubeEmbedUrl(url);
          if (embed) {
            return `
              <div class="video-card">
                <iframe src="${embed}" title="Band video" loading="lazy" allowfullscreen></iframe>
              </div>
            `;
          }
          return `<div><a href="${url}" target="_blank" rel="noopener">${url}</a></div>`;
        })
        .join("")
    : `<span class="muted">No videos listed.</span>`;

  const audioMarkup = epk.audioLinks.length
    ? `<ul class="clean-list">${epk.audioLinks
        .map((url) => `<li><a href="${url}" target="_blank" rel="noopener">${url}</a></li>`)
        .join("")}</ul>`
    : `<span class="muted">No audio links listed.</span>`;

  const upcomingMarkup = upcomingGigs.length
    ? upcomingGigs
        .map((gig) => `
          <div class="item" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.25);">
            <strong>${new Date(gig.startISO).toLocaleString()} - ${new Date(gig.endISO).toLocaleString()}</strong><br>
            ${gig.title}<br>
            ${gig.venue ? `Venue: ${gig.venue}<br>` : ""}
            ${gig.address ? `Address: ${gig.address}` : ""}
          </div>
        `)
        .join("")
    : `<span class="muted">No upcoming gigs listed.</span>`;

  const membersMarkup = members.length
    ? members
        .map(
          (member) => `
            <div class="member-card-public">
              ${renderMemberAvatar(member)}
              <div>
                <div>
                  <a href="user_profile.html?id=${encodeURIComponent(member.id)}" target="_blank" rel="noopener">
                    ${member.username}
                  </a>
                </div>
                <div class="muted">${member.role || "Role not set"}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<span class="muted">No members found.</span>`;

  shell.innerHTML = `
    <div class="band-hero">
      ${heroTitle}
    </div>
    <div class="row">
      <div class="item band-public-section" style="border-color:rgba(255,255,255,0.25);">
        <h3 style="margin-top:0;">Booking Contact</h3>
        ${bookingMarkup}
      </div>
      <div class="item band-public-section" style="border-color:rgba(255,255,255,0.25);">
        <h3 style="margin-top:0;">Audio</h3>
        ${audioMarkup}
      </div>
    </div>
    <div class="item band-public-section" style="border-color:rgba(255,255,255,0.25);">
      <h3 style="margin-top:0;">Sample Videos</h3>
      <div class="video-grid">${videosMarkup}</div>
    </div>
    <div class="item band-public-section" style="border-color:rgba(255,255,255,0.25);">
      <h3 style="margin-top:0;">Members</h3>
      <div class="member-grid">${membersMarkup}</div>
    </div>
    <div class="item band-public-section" style="border-color:rgba(255,255,255,0.25);">
      <h3 style="margin-top:0;">Upcoming Gigs</h3>
      <div class="list">${upcomingMarkup}</div>
    </div>
  `;
});
