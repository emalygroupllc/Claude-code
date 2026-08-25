// FlechaCard — interactions
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- hero demo: tilt + tap ---------- */
  var card = document.getElementById("demo-card");
  var phone = document.getElementById("demo-phone");
  var caption = document.getElementById("demo-caption");
  var stage = card ? card.closest(".demo__stage") : null;

  if (card && stage && !reducedMotion) {
    stage.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var rect = stage.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform =
        "rotateY(" + (x * 16).toFixed(2) + "deg) rotateX(" + (-y * 14).toFixed(2) + "deg)";
    });
    stage.addEventListener("pointerleave", function () {
      card.style.transform = "";
    });
  }

  if (card && phone) {
    card.addEventListener("click", function () {
      var shown = !phone.hidden;
      if (shown) {
        phone.hidden = true;
        if (caption) caption.textContent = "This is a live demo — tap (or click) the card.";
      } else {
        card.classList.remove("is-tapped");
        void card.offsetWidth; // restart the ripple animation
        card.classList.add("is-tapped");
        phone.hidden = false;
        if (caption) caption.textContent = "Profile shared. Tap again to reset.";
      }
    });
  }

  /* ---------- mobile menu ---------- */
  var burger = document.querySelector(".nav__burger");
  var mobileMenu = document.getElementById("mobile-menu");

  if (burger && mobileMenu) {
    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      burger.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      mobileMenu.hidden = open;
    });
    mobileMenu.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        burger.setAttribute("aria-expanded", "false");
        burger.setAttribute("aria-label", "Open menu");
        mobileMenu.hidden = true;
      }
    });
  }

  /* ---------- scroll reveal ---------- */
  var revealed = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
