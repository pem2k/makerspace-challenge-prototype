const pet = document.querySelector("#pet");
let resetTimer;

document.querySelector("#settings").addEventListener("click", () => window.remy.openSettings());
window.remy.onPetWave(() => {
  clearTimeout(resetTimer);
  pet.src = "../../assets/remy-wave.png";
  resetTimer = setTimeout(() => { pet.src = "../../assets/remy-idle.png"; }, 4500);
});
