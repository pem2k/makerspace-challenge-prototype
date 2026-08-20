const form = document.querySelector("#settings-form");
const status = document.querySelector("#save-status");
let settings;

function nextDueLabel(intervalMinutes) {
  const interval = intervalMinutes * 60_000;
  const next = new Date((Math.floor(Date.now() / interval) + 1) * interval);
  return `Next nudge around ${next.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function render() {
  document.querySelector("#show-pet").checked = settings.showPet;
  for (const card of document.querySelectorAll("[data-preset]")) {
    const preset = settings.presets[card.dataset.preset];
    card.querySelector(".enabled").checked = preset.enabled;
    card.querySelector(".minutes").value = preset.intervalMinutes;
    card.querySelector(".next-due").textContent = preset.enabled
      ? nextDueLabel(preset.intervalMinutes)
      : "Paused";
    card.classList.toggle("disabled", !preset.enabled);
  }
}

for (const card of document.querySelectorAll("[data-preset]")) {
  card.querySelector(".enabled").addEventListener("change", () => {
    card.classList.toggle("disabled", !card.querySelector(".enabled").checked);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const presets = {};
  for (const card of document.querySelectorAll("[data-preset]")) {
    presets[card.dataset.preset] = {
      enabled: card.querySelector(".enabled").checked,
      intervalMinutes: Number(card.querySelector(".minutes").value),
    };
  }

  try {
    settings = await window.remy.saveSettings({
      presets,
      showPet: document.querySelector("#show-pet").checked,
    });
    status.textContent = "Saved locally";
    render();
    setTimeout(() => { status.textContent = ""; }, 2500);
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelector("#preview").addEventListener("click", () => window.remy.previewReminder());
document.querySelector("#show-pet").addEventListener("change", async (event) => {
  const requestedValue = event.currentTarget.checked;
  try {
    settings = await window.remy.saveSettings({ showPet: requestedValue });
    status.textContent = requestedValue ? "Floating Remy enabled" : "Floating Remy hidden";
    setTimeout(() => { status.textContent = ""; }, 2500);
  } catch (error) {
    event.currentTarget.checked = !requestedValue;
    status.textContent = error.message;
  }
});

window.remy.getSettings().then((loaded) => {
  settings = loaded;
  render();
});
