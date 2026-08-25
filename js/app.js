// FlechaCard — profile create/edit + card viewer
// A profile is a small JSON object encoded base64url into the URL hash,
// so cards work on any static host with no accounts and no database.
(function () {
  "use strict";

  /* ---------- encoding ---------- */
  function encodeProfile(obj) {
    var json = JSON.stringify(obj);
    var bytes = new TextEncoder().encode(json);
    var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeProfile(hash) {
    try {
      var b64 = hash.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var obj = JSON.parse(new TextDecoder().decode(bytes));
      return obj && typeof obj === "object" && obj.n ? obj : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------- small helpers ---------- */
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join("");
  }

  function normalizeUrl(v) {
    if (!v) return "";
    return /^https?:\/\//i.test(v) ? v : "https://" + v;
  }

  function digits(v) { return (v || "").replace(/[^\d+]/g, ""); }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ============================================================
     CREATE PAGE
     ============================================================ */
  var form = document.getElementById("card-form");
  if (form) {
    var fields = ["n", "t", "c", "l", "b", "p", "e", "wa", "w", "li", "ig"];
    var errorEl = document.getElementById("form-error");
    var result = document.getElementById("result");
    var linkInput = document.getElementById("result-link");
    var copyBtn = document.getElementById("copy-btn");
    var openCard = document.getElementById("open-card");
    var editLink = document.getElementById("edit-link");
    var qrBox = document.getElementById("qr-box");
    var qrEl = document.getElementById("qr");

    // editing an existing card: prefill from the hash
    var existing = decodeProfile(location.hash);
    if (existing) {
      fields.forEach(function (k) {
        var input = form.querySelector('[name="' + k + '"]');
        if (input && existing[k]) input.value = existing[k];
      });
      var title = document.getElementById("page-title");
      if (title) title.textContent = "Edit your card";
    }

    function readProfile() {
      var obj = {};
      fields.forEach(function (k) {
        var input = form.querySelector('[name="' + k + '"]');
        var v = input ? input.value.trim() : "";
        if (v) obj[k] = v;
      });
      return obj;
    }

    function cardUrl(obj) {
      var base = location.href.split(/[?#]/)[0].replace(/create\.html$/, "card.html");
      return base + "#" + encodeProfile(obj);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var obj = readProfile();
      if (!obj.n) {
        if (errorEl) errorEl.hidden = false;
        var nameInput = document.getElementById("f-name");
        if (nameInput) nameInput.focus();
        return;
      }
      if (errorEl) errorEl.hidden = true;

      var url = cardUrl(obj);
      linkInput.value = url;
      openCard.href = url;
      editLink.href = location.href.split(/[?#]/)[0] + "#" + encodeProfile(obj);
      location.hash = encodeProfile(obj); // so refresh keeps the draft

      // QR (library loads from CDN; hide the block if it didn't)
      if (typeof qrcode === "function" && qrEl) {
        try {
          var qr = qrcode(0, "M");
          qr.addData(url);
          qr.make();
          qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
          qrBox.hidden = false;
        } catch (err) {
          qrBox.hidden = true;
        }
      } else if (qrBox) {
        qrBox.hidden = true;
      }

      result.hidden = false;
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        linkInput.select();
        var done = function () {
          copyBtn.textContent = "Copied!";
          setTimeout(function () { copyBtn.textContent = "Copy link"; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(linkInput.value).then(done, function () {
            document.execCommand("copy"); done();
          });
        } else {
          document.execCommand("copy"); done();
        }
      });
    }
  }

  /* ============================================================
     CARD PAGE
     ============================================================ */
  var profileEl = document.getElementById("profile");
  if (profileEl) {
    var emptyEl = document.getElementById("empty");
    var data = decodeProfile(location.hash);

    if (!data) {
      emptyEl.hidden = false;
    } else {
      document.title = data.n + " — FlechaCard";
      document.getElementById("p-avatar").textContent = initials(data.n);
      document.getElementById("p-name").textContent = data.n;

      var roleBits = [data.t, data.c].filter(Boolean).join(" · ");
      if (data.l) roleBits += (roleBits ? " · " : "") + data.l;
      var roleEl = document.getElementById("p-role");
      roleEl.textContent = roleBits;
      roleEl.hidden = !roleBits;

      var bioEl = document.getElementById("p-bio");
      bioEl.textContent = data.b || "";
      bioEl.hidden = !data.b;

      var links = document.getElementById("p-links");
      function addLink(label, href) {
        if (!href) return;
        var a = document.createElement("a");
        a.className = "profile__pill";
        a.textContent = label;
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener";
        links.appendChild(a);
      }
      if (data.p) addLink("Call", "tel:" + digits(data.p));
      if (data.e) addLink("Email", "mailto:" + data.e);
      if (data.wa) addLink("WhatsApp", "https://wa.me/" + digits(data.wa).replace(/^\+/, ""));
      if (data.w) addLink("Website", normalizeUrl(data.w));
      if (data.li) addLink("LinkedIn", normalizeUrl(data.li.indexOf("/") === -1 ? "linkedin.com/in/" + data.li : data.li));
      if (data.ig) addLink("Instagram", "https://instagram.com/" + data.ig.replace(/^@/, "").replace(/^.*instagram\.com\//i, "").replace(/\/$/, ""));

      document.getElementById("p-edit").href = "create.html" + location.hash;

      // vCard download
      document.getElementById("save-contact").addEventListener("click", function () {
        function esc(v) { return String(v).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
        var lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + esc(data.n)];
        var parts = data.n.trim().split(/\s+/);
        lines.push("N:" + esc(parts.slice(1).join(" ")) + ";" + esc(parts[0]) + ";;;");
        if (data.t) lines.push("TITLE:" + esc(data.t));
        if (data.c) lines.push("ORG:" + esc(data.c));
        if (data.p) lines.push("TEL;TYPE=CELL:" + esc(data.p));
        if (data.e) lines.push("EMAIL;TYPE=INTERNET:" + esc(data.e));
        if (data.w) lines.push("URL:" + esc(normalizeUrl(data.w)));
        if (data.l) lines.push("ADR;TYPE=WORK:;;;" + esc(data.l) + ";;;");
        if (data.b) lines.push("NOTE:" + esc(data.b));
        lines.push("END:VCARD");

        var blob = new Blob([lines.join("\r\n")], { type: "text/vcard;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = data.n.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".vcf";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      });

      profileEl.hidden = false;
    }
  }
})();
