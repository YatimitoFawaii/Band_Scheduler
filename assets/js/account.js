document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("account.html");

  const form = document.getElementById("accountForm");
  const msg = document.getElementById("msg");
  const photoUpload = document.getElementById("photoUpload");
  const photoPreview = document.getElementById("photoPreview");
  const removePhotoBtn = document.getElementById("removePhotoBtn");
  const openPublicProfileBtn = document.getElementById("openPublicProfileBtn");
  const myBands = document.getElementById("myBands");

  let pendingPhotoDataUrl = null;
  let removePhoto = false;

  function setMsg(text) {
    msg.textContent = text || "";
  }

  function getMeFromDB() {
    const db = loadDB();
    return { db, me: db.users.find((u) => u.id === user.id) };
  }

  function renderBands() {
    const db = loadDB();
    const bands = getUserBands(user.id);
    const memberships = db.memberships.filter((m) => m.userId === user.id);
    if (!bands.length) {
      myBands.innerHTML = `<div class="item">You are not in any bands yet.</div>`;
      return;
    }
    myBands.innerHTML = bands
      .map((band) => {
        const membership = memberships.find((m) => m.bandId === band.id);
        return `
          <div class="item inline" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <span class="inline" style="gap:10px;flex-wrap:wrap;">
              <strong>${band.name}</strong>
              <label><input type="checkbox" data-hide-band="${band.id}" ${membership?.hideFromProfile ? "checked" : ""} /> Hide from profile</label>
            </span>
            <a href="band_profile.html?id=${encodeURIComponent(band.id)}" target="_blank" rel="noopener">Public Band Page</a>
          </div>
        `;
      })
      .join("");
  }

  function updatePhotoPreview(currentPhoto) {
    const src = removePhoto ? null : pendingPhotoDataUrl || currentPhoto || null;
    if (!src) {
      photoPreview.removeAttribute("src");
      photoPreview.classList.add("empty");
      photoPreview.alt = "No profile photo";
      return;
    }
    photoPreview.src = src;
    photoPreview.classList.remove("empty");
    photoPreview.alt = "Profile photo preview";
  }

  function hydrateForm() {
    const { me } = getMeFromDB();
    if (!me) return;
    document.getElementById("username").value = me.username;
    document.getElementById("email").value = me.email;
    document.getElementById("homeAddress").value = me.homeAddress || me.location?.address || "";
    document.getElementById("mobilePhone").value = me.mobilePhone || "";
    updatePhotoPreview(me.photoDataUrl);
    renderBands();
  }

  hydrateForm();

  photoUpload.addEventListener("change", async () => {
    const file = photoUpload.files?.[0];
    if (!file) return;
    try {
      const photoData = await readImageFileAsDataUrl(file, 700);
      pendingPhotoDataUrl = photoData;
      removePhoto = false;
      updatePhotoPreview(getMeFromDB().me?.photoDataUrl);
      setMsg("Photo ready. Save account changes to apply.");
    } catch (err) {
      setMsg(err.message || "Failed to process image.");
    }
  });

  removePhotoBtn.addEventListener("click", () => {
    pendingPhotoDataUrl = null;
    removePhoto = true;
    photoUpload.value = "";
    updatePhotoPreview(null);
    setMsg("Photo removal scheduled. Save account changes to apply.");
  });

  openPublicProfileBtn.addEventListener("click", () => {
    window.open(`user_profile.html?id=${encodeURIComponent(user.id)}`, "_blank", "noopener");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");

    const { db, me } = getMeFromDB();
    if (!me) {
      setMsg("Account not found.");
      return;
    }

    const username = document.getElementById("username").value.trim();
    const email = normalizeEmail(document.getElementById("email").value);
    const homeAddress = document.getElementById("homeAddress").value.trim();
    const mobilePhone = normalizePhone(document.getElementById("mobilePhone").value);
    const newPassword = document.getElementById("newPassword").value;
    const currentPassword = document.getElementById("currentPassword").value;

    const currentHash = await hashString(currentPassword || "");
    if (currentHash !== me.passwordHash) {
      setMsg("Current password is incorrect.");
      return;
    }

    if (!username || !email) {
      setMsg("Username and email are required.");
      return;
    }

    const conflict = db.users.find(
      (u) =>
        u.id !== me.id &&
        (u.username.toLowerCase() === username.toLowerCase() || u.email === email)
    );
    if (conflict) {
      setMsg("Username or email already in use.");
      return;
    }

    me.username = username;
    me.email = email;
    me.mobilePhone = mobilePhone;

    if (homeAddress) {
      const existingAddress = me.homeAddress || me.location?.address || "";
      if (homeAddress === existingAddress && me.homeLat != null && me.homeLon != null) {
        me.homeAddress = homeAddress;
        me.location = { address: homeAddress, lat: me.homeLat, lon: me.homeLon };
      } else {
        setMsg("Verifying address...");
        const verified = await verifyAddress(homeAddress);
        if (!verified.ok) {
          setMsg(verified.message);
          return;
        }
        me.homeAddress = homeAddress;
        me.homeLat = verified.lat;
        me.homeLon = verified.lon;
        me.location = { address: homeAddress, lat: verified.lat, lon: verified.lon };
      }
    } else {
      me.homeAddress = "";
      me.homeLat = null;
      me.homeLon = null;
      me.location = null;
    }

    if (removePhoto) {
      me.photoDataUrl = null;
    } else if (pendingPhotoDataUrl) {
      me.photoDataUrl = pendingPhotoDataUrl;
    }

    if (newPassword) {
      me.passwordHash = await hashString(newPassword);
    }

    const hideByBand = {};
    myBands.querySelectorAll("input[data-hide-band]").forEach((input) => {
      hideByBand[input.dataset.hideBand] = input.checked;
    });
    db.memberships
      .filter((m) => m.userId === user.id)
      .forEach((m) => {
        if (Object.prototype.hasOwnProperty.call(hideByBand, m.bandId)) {
          m.hideFromProfile = !!hideByBand[m.bandId];
        }
      });

    saveDB(db);
    setMsg("Account updated.");
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    photoUpload.value = "";
    pendingPhotoDataUrl = null;
    removePhoto = false;
    updatePhotoPreview(me.photoDataUrl);

    const navUserLabel = document.querySelector(".nav .nav-inner span:not(.spacer)");
    if (navUserLabel) navUserLabel.textContent = me.username;
    renderBands();
  });
});
