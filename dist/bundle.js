"use strict";
(() => {
  // src/app.ts
  var screens = ["home", "lobby", "game", "result", "shop", "profile"];
  function showScreen(id) {
    screens.forEach((s) => {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.classList.toggle("active", s === id);
    });
  }
  function init() {
    showScreen("home");
    console.log("RaceTrack v1 initialized");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
