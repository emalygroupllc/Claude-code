// FlechaCard — profile create/edit + card viewer
// Two modes:
//  - Backend mode (Supabase configured in js/config.js): cards live in the
//    database behind short permanent links (?c=slug); a secret edit key
//    (?k=...) lets the owner update the card without changing the link.
//  - Link mode (no backend): the profile is a small JSON object encoded
//    base64url into the URL hash, so cards work on any static host with
//    no accounts and no database. Old hash links always keep working.
(function () {
  "use strict";

  /* ---------- backend (optional) ---------- */
  var CFG = window.FLECHA_CONFIG || {};
  var API = null;
  if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
    var apiBase = CFG.supabaseUrl.replace(/\/+$/, "");
    // Publishable keys (sb_publishable_...) are not JWTs: sending them as a
    // Bearer token makes the gateway reject the request while parsing it.
    // Only legacy anon keys (eyJ...) belong in the Authorization header.
    var apiHeaders = {
      "apikey": CFG.supabaseAnonKey,
      "Content-Type": "application/json"
    };
    if (/^eyJ/.test(CFG.supabaseAnonKey)) {
      apiHeaders.Authorization = "Bearer " + CFG.supabaseAnonKey;
    }
    API = {
      rpc: function (name, args) {
        return fetch(apiBase + "/rest/v1/rpc/" + name, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify(args)
        }).then(function (r) {
          if (!r.ok) throw new Error("api_" + r.status);
          return r.json();
        });
      },
      getCard: function (slug) {
        return fetch(apiBase + "/rest/v1/cards?slug=eq." + encodeURIComponent(slug) + "&select=data", {
          headers: apiHeaders
        }).then(function (r) {
          if (!r.ok) throw new Error("api_" + r.status);
          return r.json();
        }).then(function (rows) {
          return rows && rows[0] ? rows[0].data : null;
        });
      }
    };
  }

  /* ---------- link-mode encoding ---------- */
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

  // A link-mode card is "#<profile>[.<photo>]": the photo (already base64
  // JPEG) rides as its own base64url segment so it isn't encoded twice.
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

  function pageBase() {
    return location.href.split(/[?#]/)[0];
  }

  // Public card links look like <site>/<name>. The 404 page turns that
  // path back into a card, so no query string is needed.
  function siteRoot() {
    var root = CFG.siteBase || pageBase().replace(/[^\/]*$/, "");
    return root.slice(-1) === "/" ? root : root + "/";
  }

  function publicCardUrl(slug) {
    return siteRoot() + encodeURIComponent(slug);
  }

  // Names are lowercase, digits and hyphens only. The "live" variant keeps
  // a trailing hyphen so that typing a space mid-name does not swallow the
  // separator; the strict variant trims it when the name is submitted.
  function cleanSlugLive(v) {
    return (v || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-/, "")
      .slice(0, 40);
  }

  function cleanSlug(v) {
    return cleanSlugLive(v).replace(/-$/, "");
  }

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
    var resultHint = document.getElementById("result-hint");
    var linkInput = document.getElementById("result-link");
    var copyBtn = document.getElementById("copy-btn");
    var openCard = document.getElementById("open-card");
    var editLink = document.getElementById("edit-link");
    var qrBox = document.getElementById("qr-box");
    var qrEl = document.getElementById("qr");
    var submitBtn = form.querySelector('button[type="submit"]');
    var slugInput = document.getElementById("f-slug");
    var slugHint = document.getElementById("slug-hint");
    var slugBase = document.getElementById("slug-base");

    var params = new URLSearchParams(location.search);
    var editSlug = params.get("c");
    var editKey = params.get("k");

    /* ---------- chosen link name ---------- */
    if (slugBase) {
      slugBase.textContent = siteRoot().replace(/^https?:\/\//, "");
    }
    if (slugInput) {
      slugInput.addEventListener("input", function () {
        var pos = slugInput.selectionStart;
        var cleaned = cleanSlugLive(slugInput.value);
        if (cleaned !== slugInput.value) {
          slugInput.value = cleaned;
          try { slugInput.setSelectionRange(pos, pos); } catch (ignore) {}
        }
        slugHint.className = "slug-hint";
        slugHint.textContent = cleaned
          ? "O seu cartão vai ficar em " + siteRoot().replace(/^https?:\/\//, "") + cleaned
          : "Deixe vazio para receber um código automático. Só letras minúsculas, números e hífens.";
      });
      // suggest a name from the person's name, until they type their own
      var slugTouched = false;
      slugInput.addEventListener("focus", function () { slugTouched = true; });
      var nameField = document.getElementById("f-name");
      if (nameField) {
        nameField.addEventListener("input", function () {
          if (!slugTouched && !slugInput.value) {
            slugInput.placeholder = cleanSlug(nameField.value) || "ana-macuacua";
          }
        });
      }
    }

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

    // Center-crop to a square and compress. In link mode the photo must
    // stay small enough for a shareable URL; with a backend the link is
    // short regardless, so the photo can be bigger and sharper.
    function compressPhoto(source) {
      var sizes = API ? [240, 192, 160, 128] : [112, 96, 80, 64];
      var budget = API ? 9000 : 2400;
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
          if (b64.length <= budget) return b64;
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

    /* ---------- prefill when editing ---------- */
    function prefill(existing) {
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
      if (slugInput && editSlug) {
        slugInput.value = editSlug;
        slugInput.readOnly = true;
        slugInput.setAttribute("aria-readonly", "true");
        slugHint.textContent = "O link mantém-se igual — é isso que faz com que " +
          "quem já o guardou continue a ver os seus dados atualizados.";
      }
    }

    if (API && editSlug && editKey) {
      API.getCard(editSlug).then(function (data) {
        if (data) prefill(data);
      }).catch(function () { /* form stays blank; saving will surface errors */ });
    } else {
      var existing = decodeCard(location.hash.slice(1));
      if (existing) prefill(existing);
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

    function showError(msg) {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
      }
    }

    function renderQr(url) {
      if (typeof qrcode !== "function" || !qrEl) {
        if (qrBox) qrBox.hidden = true;
        return;
      }
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
    }

    function showResult(cardLink, editHref, hint) {
      linkInput.value = cardLink;
      openCard.href = cardLink;
      editLink.href = editHref;
      if (resultHint && hint) resultHint.textContent = hint;
      renderQr(cardLink);
      result.hidden = false;
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var obj = readProfile();
      if (!obj.n) {
        showError("Adicione pelo menos o seu nome para criar o cartão.");
        var nameInput = document.getElementById("f-name");
        if (nameInput) nameInput.focus();
        return;
      }
      if (errorEl) errorEl.hidden = true;

      var base = pageBase();
      var cardBase = base.replace(/create\.html$/, "card.html");

      if (API) {
        submitBtn.disabled = true;
        var wanted = slugInput ? cleanSlug(slugInput.value) : "";
        var call = (editSlug && editKey)
          ? API.rpc("update_card", { card_slug: editSlug, key: editKey, card_data: obj })
              .then(function (ok) {
                if (ok !== true) throw new Error("bad_key");
                return { slug: editSlug, edit_key: editKey };
              })
          : API.rpc("create_card", { card_data: obj, desired_slug: wanted || null });
        call.then(function (res) {
          submitBtn.disabled = false;
          // remember the edit credentials so a page refresh keeps them
          editSlug = res.slug;
          editKey = res.edit_key;
          var editHref = base + "?c=" + encodeURIComponent(res.slug) + "&k=" + encodeURIComponent(res.edit_key);
          try { history.replaceState(null, "", editHref); } catch (ignore) {}
          showResult(
            publicCardUrl(res.slug),
            editHref,
            "Este é o link permanente do seu cartão — mantém-se igual sempre que editar. Guarde também o link de edição abaixo: é a sua chave para atualizar o cartão."
          );
        }).catch(function (err) {
          submitBtn.disabled = false;
          var code = err && err.message ? err.message : "";
          if (code === "bad_key") {
            showError("Este link de edição já não é válido. Crie um cartão novo a partir da página inicial.");
          } else if (code === "api_409") {
            showError("O nome “" + wanted + "” já está a ser usado. Escolha outro — por exemplo " +
                      wanted + "-" + Math.floor(Math.random() * 90 + 10) + ".");
            if (slugInput) slugInput.focus();
          } else if (code === "api_400") {
            showError("Esse nome de link não é válido. Use letras minúsculas, números e hífens, com pelo menos 3 caracteres.");
            if (slugInput) slugInput.focus();
          } else if (code === "api_404") {
            showError("A base de dados ainda não está preparada (erro 404). Falta correr o script de configuração no Supabase.");
          } else if (code === "api_401" || code === "api_403") {
            showError("A chave de acesso foi recusada (erro " + code.slice(4) + "). Verifique a chave publicável nas definições do Supabase.");
          } else if (code.indexOf("api_") === 0) {
            showError("O servidor respondeu com um erro " + code.slice(4) + ". Tente novamente dentro de instantes.");
          } else {
            showError("Não foi possível contactar o servidor. Verifique a sua ligação à internet e tente novamente.");
          }
        });
      } else {
        var hash = encodeCard(obj);
        location.hash = hash; // so refresh keeps the draft
        showResult(
          cardBase + "#" + hash,
          base + "#" + hash,
          "Este link é o seu cartão. Partilhe-o, aponte para ele o seu cartão NFC ou código QR e guarde-o bem — para editar mais tarde, use o link de edição abaixo e gere um novo."
        );
      }
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
    var cardParams = new URLSearchParams(location.search);
    var cardSlug = cardParams.get("c");
    if (!cardSlug) {
      // clean links: <site>/<name> lands on the 404 page, which renders here
      var seg = decodeURIComponent(location.pathname.replace(/\/+$/, "").split("/").pop() || "");
      if (seg && !/\.[a-z0-9]+$/i.test(seg)) cardSlug = cleanSlug(seg);
    }

    var render = function (data) {
      if (!data) {
        emptyEl.hidden = false;
        return;
      }
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

      // owners reach the edit form via their saved edit link; from a public
      // card the edit page opens blank unless it's a legacy hash link
      document.getElementById("p-edit").href = "create.html" + (cardSlug ? "" : location.hash);

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
    };

    if (API && cardSlug) {
      API.getCard(cardSlug).then(render).catch(function () { render(null); });
    } else {
      render(decodeCard(location.hash.slice(1)));
    }
  }
})();
