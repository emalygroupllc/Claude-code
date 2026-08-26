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

  function decodeProfile(part) {
    try {
      var b64 = part.replace(/-/g, "+").replace(/_/g, "/");
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

  // A card link is "#<profile>[.<photo>]": the photo (already base64 JPEG)
  // rides as its own base64url segment so it isn't base64-encoded twice.
  function encodeCard(obj) {
    var photo = obj.f;
    var rest = {};
    for (var k in obj) if (k !== "f") rest[k] = obj[k];
    var s = encodeProfile(rest);
    if (photo) {
      s += "." + photo.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    return s;
  }

  function decodeCard(hash) {
    var parts = hash.replace(/^#/, "").split(".");
    var obj = decodeProfile(parts[0]);
    if (obj && parts[1]) {
      var f = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (f.length % 4) f += "=";
      obj.f = f;
    }
    return obj;
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

    /* ---------- profile photo ---------- */
    var photoData = null; // base64 JPEG, no data: prefix
    var photoInput = document.getElementById("f-photo");
    var photoPreview = document.getElementById("photo-preview");
    var photoRemove = document.getElementById("photo-remove");

    function showPhotoPreview(b64) {
      if (b64) {
        photoPreview.innerHTML = "";
        var img = document.createElement("img");
        img.alt = "";
        img.src = "data:image/jpeg;base64," + b64;
        photoPreview.appendChild(img);
        photoRemove.hidden = false;
      } else {
        photoPreview.innerHTML = "<span>➳</span>";
        photoRemove.hidden = true;
      }
    }

    function loadImageFile(file) {
      if (window.createImageBitmap) {
        // honors EXIF rotation from phone cameras
        return createImageBitmap(file, { imageOrientation: "from-image" })
          .catch(function () { return createImageBitmap(file); });
      }
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }

    // Center-crop to a square and compress until it fits inside a
    // shareable URL (small enough that the QR code still generates).
    function compressPhoto(source) {
      var sizes = [112, 96, 80, 64];
      var qualities = [0.7, 0.55, 0.4];
      var side = Math.min(source.width, source.height);
      var sx = (source.width - side) / 2;
      var sy = (source.height - side) / 2;
      var canvas = document.createElement("canvas");
      var best = null;
      for (var i = 0; i < sizes.length; i++) {
        canvas.width = canvas.height = sizes[i];
        var ctx = canvas.getContext("2d");
        ctx.drawImage(source, sx, sy, side, side, 0, 0, sizes[i], sizes[i]);
        for (var j = 0; j < qualities.length; j++) {
          var b64 = canvas.toDataURL("image/jpeg", qualities[j]).split(",")[1];
          if (!best || b64.length < best.length) best = b64;
          if (b64.length <= 2400) return b64;
        }
      }
      return best;
    }

    if (photoInput) {
      photoInput.addEventListener("change", function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file) return;
        loadImageFile(file).then(function (source) {
          photoData = compressPhoto(source);
          showPhotoPreview(photoData);
        }).catch(function () {
          photoData = null;
          showPhotoPreview(null);
        });
      });
      photoRemove.addEventListener("click", function () {
        photoData = null;
        photoInput.value = "";
        showPhotoPreview(null);
      });
    }

    // editing an existing card: prefill from the hash
    var existing = decodeCard(location.hash.slice(1));
    if (existing) {
      fields.forEach(function (k) {
        var input = form.querySelector('[name="' + k + '"]');
        if (input && existing[k]) input.value = existing[k];
      });
      if (existing.f) {
        photoData = existing.f;
        showPhotoPreview(photoData);
      }
      var title = document.getElementById("page-title");
      if (title) title.textContent = "Editar o seu cartão";
      document.title = "Editar o seu cartão — FlechaCard";
    }

    function readProfile() {
      var obj = {};
      fields.forEach(function (k) {
        var input = form.querySelector('[name="' + k + '"]');
        var v = input ? input.value.trim() : "";
        if (v) obj[k] = v;
      });
      if (photoData) obj.f = photoData;
      return obj;
    }

    function cardUrl(obj) {
      var base = location.href.split(/[?#]/)[0].replace(/create\.html$/, "card.html");
      return base + "#" + encodeCard(obj);
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
      editLink.href = location.href.split(/[?#]/)[0] + "#" + encodeCard(obj);
      location.hash = encodeCard(obj); // so refresh keeps the draft

      // QR (library loads from CDN; hide the block if it didn't).
      // A photo makes the link long — fall back to error level L, and if
      // it still doesn't fit in a QR code, say so instead of failing.
      if (typeof qrcode === "function" && qrEl) {
        var made = false;
        var levels = ["M", "L"];
        for (var li = 0; li < levels.length && !made; li++) {
          try {
            var qr = qrcode(0, levels[li]);
            qr.addData(url);
            qr.make();
            qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
            made = true;
          } catch (err) { /* try the next level */ }
        }
        if (made) {
          qrBox.hidden = false;
        } else {
          qrEl.innerHTML = "";
          qrBox.hidden = false;
          qrBox.querySelector("p").textContent =
            "O link com fotografia ficou demasiado longo para um código QR — partilhe o link diretamente, ou remova a foto para gerar o QR.";
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
          copyBtn.textContent = "Copiado!";
          setTimeout(function () { copyBtn.textContent = "Copiar link"; }, 1600);
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
    var data = decodeCard(location.hash.slice(1));

    if (!data) {
      emptyEl.hidden = false;
    } else {
      document.title = data.n + " — FlechaCard";
      var avatar = document.getElementById("p-avatar");
      if (data.f) {
        var avatarImg = document.createElement("img");
        avatarImg.alt = "";
        avatarImg.src = "data:image/jpeg;base64," + data.f;
        avatar.textContent = "";
        avatar.appendChild(avatarImg);
      } else {
        avatar.textContent = initials(data.n);
      }
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
      if (data.p) addLink("Ligar", "tel:" + digits(data.p));
      if (data.e) addLink("Email", "mailto:" + data.e);
      if (data.wa) addLink("WhatsApp", "https://wa.me/" + digits(data.wa).replace(/^\+/, ""));
      if (data.w) addLink("Site", normalizeUrl(data.w));
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
        if (data.f) {
          // vCard 3.0 wants long lines folded: continuation lines start
          // with a single space
          var photoLine = "PHOTO;ENCODING=b;TYPE=JPEG:" + data.f;
          var folded = [];
          for (var pi = 0; pi < photoLine.length; pi += 74) {
            folded.push((pi === 0 ? "" : " ") + photoLine.slice(pi, pi + 74));
          }
          lines.push(folded.join("\r\n"));
        }
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
