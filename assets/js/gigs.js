function formatSetDuration(mins) {
  const h = mins / 60;
  if (Number.isInteger(h)) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h.toFixed(2)} hours`;
}

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("gigs.html");

  const bandSelect = document.getElementById("bandId");
  const msg = document.getElementById("msg");

  const bands = getUserBands(user.id);
  bandSelect.innerHTML = bands.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");

  document.getElementById("gigForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    if (!bands.length) {
      msg.textContent = "Join or create a band first.";
      return;
    }

    const bandId = bandSelect.value;
    const venue = document.getElementById("venue").value.trim();
    const address = document.getElementById("address").value.trim();
    const callTime = document.getElementById("callTime").value;
    const setDurationMin = Number(document.getElementById("setDuration").value || 0);
    const endTime = document.getElementById("endTime").value;
    const compensation = document.getElementById("compensation").value.trim();

    if (!bandId || !venue || !address || !callTime || !endTime || !compensation) {
      msg.textContent = "Complete all fields.";
      return;
    }

    const start = new Date(callTime);
    const end = new Date(endTime);
    if (!(start < end)) {
      msg.textContent = "End time must be after call time.";
      return;
    }

    msg.textContent = "Verifying address...";
    const verified = await verifyAddress(address);
    if (!verified.ok) {
      msg.textContent = verified.message;
      return;
    }

    const label = `${formatSetDuration(setDurationMin)} set at ${venue} for ${compensation}`;
    createEventForBand({
      bandId,
      type: "gig",
      creatorId: user.id,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      title: label,
      venue,
      address: verified.normalizedAddress,
      lat: verified.lat,
      lon: verified.lon,
      compensation,
      setDurationMin
    });

    msg.textContent = "Gig submitted as proposed event to your band calendar.";
    e.target.reset();
  });
});
