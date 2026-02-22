function parseMoney(value) {
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function sortSpacesForUser(spaces, userId) {
  return [...spaces].sort((a, b) => {
    const ao = a.orderByUser?.[userId] ?? Number.MAX_SAFE_INTEGER;
    const bo = b.orderByUser?.[userId] ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function renumberUserOrder(spaces, userId) {
  spaces.forEach((s, idx) => {
    s.orderByUser = s.orderByUser || {};
    s.orderByUser[userId] = idx + 1;
  });
}

function chooseMostCentralSpace(spaces, members) {
  const m = members.filter((u) => u.location?.lat != null && u.location?.lon != null);
  if (!m.length || !spaces.length) return null;

  let best = null;
  let bestScore = Infinity;
  for (const s of spaces) {
    if (s.lat == null || s.lon == null) continue;
    let score = 0;
    for (const member of m) {
      score += haversineMiles(member.location.lat, member.location.lon, s.lat, s.lon);
    }
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best?.id || null;
}

function setAddressFeedback(formEl, text, tone = "") {
  const feedback = formEl.querySelector("[data-address-feedback]");
  if (!feedback) return;
  feedback.textContent = text || "";
  feedback.classList.remove("error", "success");
  if (tone) feedback.classList.add(tone);
}

function clearAddressSuggestions(datalistEl, suggestionMap) {
  datalistEl.innerHTML = "";
  suggestionMap.clear();
}

function setAddressSuggestions(datalistEl, suggestions, suggestionMap) {
  clearAddressSuggestions(datalistEl, suggestionMap);
  suggestions.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.address;
    datalistEl.appendChild(option);
    suggestionMap.set(item.address, item);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("rehearsal_spaces.html");

  const spacesList = document.getElementById("spacesList");
  const msg = document.getElementById("msg");

  function setMsg(text) {
    msg.textContent = text || "";
  }

  function render() {
    const db = loadDB();
    const bands = getUserBands(user.id);
    spacesList.innerHTML = "";

    if (!bands.length) {
      spacesList.innerHTML = `<div class="item">No bands found.</div>`;
      return;
    }

    for (const band of bands) {
      const members = getBandMembers(band.id, db);
      const spaces = db.rehearsalSpaces.filter((s) => s.bandId === band.id);
      const sorted = sortSpacesForUser(spaces, user.id);
      const centralId = chooseMostCentralSpace(sorted, members);

      const card = document.createElement("div");
      card.className = "item";
      card.innerHTML = `
        <h3>${band.name}</h3>
        <div class="list" id="spaces_${band.id}"></div>
        <form id="form_${band.id}" class="list" style="margin-top:10px;">
          <div>
            <label>New Location Address (Verified)</label>
            <input name="address" list="addressSuggestions_${band.id}" autocomplete="off" required />
            <datalist id="addressSuggestions_${band.id}"></datalist>
            <div class="field-feedback" data-address-feedback></div>
          </div>
          <div class="row">
            <div>
              <label>Total Cost</label>
              <input name="totalCost" placeholder="0" required />
            </div>
            <div>
              <label>Duration (hours)</label>
              <input name="durationHours" type="number" min="0.25" step="0.25" value="2" required />
            </div>
          </div>
          <label><input type="checkbox" name="allBands" /> Add location to all bands I am in</label>
          <div class="inline" style="justify-content:flex-start;">
            <button type="submit">Add Location</button>
            <button type="button" class="secondary" data-add-as-written hidden>Add location as written</button>
          </div>
        </form>
      `;

      const list = card.querySelector(`#spaces_${band.id}`);
      if (!sorted.length) {
        list.innerHTML = `<div class="item">No locations added yet.</div>`;
      }

      sorted.forEach((space, idx) => {
        const mine = space.creatorId === user.id;
        const distance = user.location?.lat != null && space.lat != null
          ? formatMiles(haversineMiles(user.location.lat, user.location.lon, space.lat, space.lon))
          : "N/A";

        const costLabel = Number(space.totalCost) === 0
          ? "Free"
          : `$${Number(space.totalCost).toFixed(2)} per ${space.durationHours}h`;

        const row = document.createElement("div");
        row.className = "inline";
        row.style.justifyContent = "space-between";
        row.innerHTML = `
          <span>
            ${idx + 1}. ${space.address}
            <span class="badge">${costLabel}</span>
            <span class="badge">${distance}</span>
            ${space.id === centralId ? '<span class="badge">most central</span>' : ""}
          </span>
          <span class="inline" id="actions_${space.id}"></span>
        `;

        const actions = row.querySelector(`#actions_${space.id}`);

        const up = document.createElement("button");
        up.type = "button";
        up.className = "secondary";
        up.textContent = "↑";
        up.disabled = idx === 0;
        up.addEventListener("click", () => {
          const db2 = loadDB();
          const list2 = sortSpacesForUser(db2.rehearsalSpaces.filter((s) => s.bandId === band.id), user.id);
          [list2[idx - 1], list2[idx]] = [list2[idx], list2[idx - 1]];
          renumberUserOrder(list2, user.id);
          saveDB(db2);
          render();
        });
        actions.appendChild(up);

        const down = document.createElement("button");
        down.type = "button";
        down.className = "secondary";
        down.textContent = "↓";
        down.disabled = idx === sorted.length - 1;
        down.addEventListener("click", () => {
          const db2 = loadDB();
          const list2 = sortSpacesForUser(db2.rehearsalSpaces.filter((s) => s.bandId === band.id), user.id);
          [list2[idx + 1], list2[idx]] = [list2[idx], list2[idx + 1]];
          renumberUserOrder(list2, user.id);
          saveDB(db2);
          render();
        });
        actions.appendChild(down);

        if (mine) {
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "danger";
          rm.textContent = "Remove";
          rm.addEventListener("click", () => {
            const db2 = loadDB();
            db2.rehearsalSpaces = db2.rehearsalSpaces.filter((s) => !(s.id === space.id && s.bandId === band.id));
            saveDB(db2);
            render();
          });
          actions.appendChild(rm);

          const rmAll = document.createElement("button");
          rmAll.type = "button";
          rmAll.className = "danger";
          rmAll.textContent = "Remove For All";
          rmAll.addEventListener("click", () => {
            const db2 = loadDB();
            const myBandIds = getUserBands(user.id).map((b) => b.id);
            db2.rehearsalSpaces = db2.rehearsalSpaces.filter(
              (s) => !(s.groupKey === space.groupKey && myBandIds.includes(s.bandId))
            );
            saveDB(db2);
            render();
          });
          actions.appendChild(rmAll);
        }

        list.appendChild(row);
      });

      const form = card.querySelector(`#form_${band.id}`);
      const addressInput = form.address;
      const addressSuggestions = card.querySelector(`#addressSuggestions_${band.id}`);
      const addAsWrittenBtn = form.querySelector("[data-add-as-written]");
      const suggestionMap = new Map();
      let lookupTimer = null;
      let lookupToken = 0;

      function hideAddAsWritten() {
        addAsWrittenBtn.hidden = true;
        addAsWrittenBtn.disabled = true;
      }

      function showAddAsWritten() {
        addAsWrittenBtn.hidden = false;
        addAsWrittenBtn.disabled = false;
      }

      function persistLocationEntry(addressText, lat, lon, allBands) {
        const db2 = loadDB();
        const targetBands = allBands ? getUserBands(user.id).map((b) => b.id) : [band.id];
        const key = uid("spacegroup");
        const finalAddress = addressText.trim();

        targetBands.forEach((bandId) => {
          db2.rehearsalSpaces.push({
            id: uid("space"),
            groupKey: key,
            bandId,
            creatorId: user.id,
            address: finalAddress,
            lat: lat ?? null,
            lon: lon ?? null,
            totalCost: parseMoney(form.totalCost.value),
            durationHours: Number(form.durationHours.value),
            orderByUser: { [user.id]: 9999 },
            createdAt: nowISO()
          });
        });

        saveDB(db2);
      }

      hideAddAsWritten();

      addressInput.addEventListener("input", () => {
        const query = addressInput.value.trim();
        if (lookupTimer) clearTimeout(lookupTimer);
        hideAddAsWritten();

        if (query.length < 4) {
          clearAddressSuggestions(addressSuggestions, suggestionMap);
          setAddressFeedback(form, "");
          return;
        }

        const token = ++lookupToken;
        lookupTimer = setTimeout(async () => {
          setAddressFeedback(form, "Searching verified addresses...");
          const res = await searchAddressSuggestions(query, 6);
          if (token !== lookupToken) return;

          if (!res.ok) {
            clearAddressSuggestions(addressSuggestions, suggestionMap);
            setAddressFeedback(form, res.message, "error");
            return;
          }

          setAddressSuggestions(addressSuggestions, res.results, suggestionMap);
          setAddressFeedback(form, "Select a suggestion to use a verified address.", "success");
        }, 250);
      });

      addressInput.addEventListener("change", () => {
        const match = suggestionMap.get(addressInput.value.trim());
        if (match) {
          setAddressFeedback(form, "Verified address selected.", "success");
          hideAddAsWritten();
        }
      });

      addAsWrittenBtn.addEventListener("click", () => {
        const address = form.address.value.trim();
        const totalCost = parseMoney(form.totalCost.value);
        const durationHours = Number(form.durationHours.value);
        const allBands = form.allBands.checked;

        if (!address || Number.isNaN(totalCost) || !durationHours) {
          setMsg("Enter valid location, cost, and duration.");
          return;
        }

        persistLocationEntry(address, null, null, allBands);
        setMsg("Location added as written (not verified).");
        setAddressFeedback(form, "");
        clearAddressSuggestions(addressSuggestions, suggestionMap);
        hideAddAsWritten();
        form.reset();
        render();
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formEl = e.target;
        const address = form.address.value.trim();
        const totalCost = parseMoney(form.totalCost.value);
        const durationHours = Number(form.durationHours.value);
        const allBands = form.allBands.checked;

        if (!address || Number.isNaN(totalCost) || !durationHours) {
          setMsg("Enter valid location, cost, and duration.");
          setAddressFeedback(formEl, "");
          hideAddAsWritten();
          return;
        }

        let verified = null;
        const pickedSuggestion = suggestionMap.get(address);
        if (pickedSuggestion) {
          verified = {
            ok: true,
            normalizedAddress: pickedSuggestion.address,
            lat: pickedSuggestion.lat,
            lon: pickedSuggestion.lon
          };
          setAddressFeedback(formEl, "Using selected verified address.", "success");
        } else {
          setAddressFeedback(formEl, "Verifying address...");
          verified = await verifyAddress(address);
        }

        if (!verified.ok) {
          setAddressFeedback(formEl, `${verified.message} Use "Add location as written" to continue.`, "error");
          showAddAsWritten();
          return;
        }

        persistLocationEntry(address, verified.lat, verified.lon, allBands);
        setMsg("Location added.");
        setAddressFeedback(formEl, "");
        clearAddressSuggestions(addressSuggestions, suggestionMap);
        hideAddAsWritten();
        form.reset();
        render();
      });

      spacesList.appendChild(card);
    }
  }

  render();
});
