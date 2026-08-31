// FlechaCard — página de encomenda.
//
// O que este ficheiro faz e o que não faz:
//   faz     — recolhe os dados, cria a encomenda, pede o pagamento e
//             espera pela confirmação;
//   não faz — decidir preços. Os preços que aparecem aqui vêm da base de
//             dados só para a pessoa os ver. Quem cobra é o servidor, com
//             o preço que tem guardado. Mexer nesta página não muda o
//             valor cobrado.
(function () {
  "use strict";

  var CFG = window.FLECHA_CONFIG || {};
  var form = document.getElementById("order-form");
  if (!form) return;

  var elProduct = document.getElementById("f-product");
  var elQty = document.getElementById("f-qty");
  var elTotal = document.getElementById("order-total");
  var elPayAmount = document.getElementById("pay-amount");
  var elError = document.getElementById("form-error");
  var elBtn = document.getElementById("pay-btn");
  var elWaiting = document.getElementById("waiting");
  var elWaitingRef = document.getElementById("waiting-ref");
  var elWaitingHint = document.getElementById("waiting-hint");
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var apiBase = String(CFG.supabaseUrl || "").replace(/\/+$/, "");
  var prices = {};   // code -> price_mt, preenchido a partir da base de dados

  function money(mt) {
    return String(mt).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " MT";
  }

  function showError(msg) {
    elError.textContent = msg;
    elError.hidden = false;
    elError.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function headers() {
    var h = { "Content-Type": "application/json" };
    if (CFG.supabaseAnonKey) {
      h.apikey = CFG.supabaseAnonKey;
      h.Authorization = "Bearer " + CFG.supabaseAnonKey;
    }
    return h;
  }

  function rpc(name, args) {
    return fetch(apiBase + "/rest/v1/rpc/" + name, {
      method: "POST", headers: headers(), body: JSON.stringify(args || {})
    }).then(function (r) {
      if (!r.ok) throw new Error("api_" + r.status);
      return r.json();
    });
  }

  // --- preços -----------------------------------------------------------
  // Lidos da tabela products para que os rótulos nunca fiquem a mentir
  // sobre o valor real. Se a leitura falhar, ficam os valores escritos no
  // HTML: a pessoa vê um número aproximado, mas o servidor cobra o certo.
  function loadPrices() {
    if (!apiBase) return Promise.resolve();
    return fetch(apiBase + "/rest/v1/products?select=code,name,price_mt&active=eq.true", {
      headers: headers()
    }).then(function (r) {
      if (!r.ok) throw new Error("api_" + r.status);
      return r.json();
    }).then(function (rows) {
      if (!rows || !rows.length) return;
      rows.forEach(function (p) { prices[p.code] = p.price_mt; });
      Array.prototype.forEach.call(elProduct.options, function (opt) {
        var p = rows.filter(function (r) { return r.code === opt.value; })[0];
        if (p) opt.textContent = p.name.replace(/^FlechaCard\s*/, "") + " — " + money(p.price_mt);
      });
    }).catch(function () { /* fica o que está no HTML */ });
  }

  function currentTotal() {
    var unit = prices[elProduct.value];
    if (!unit) {
      var m = (elProduct.selectedOptions[0] || {}).textContent || "";
      unit = parseInt(m.replace(/\D/g, ""), 10) || 0;
    }
    var qty = Math.max(1, Math.min(parseInt(elQty.value, 10) || 1, 500));
    return unit * qty;
  }

  function refreshTotal() {
    var t = money(currentTotal());
    elTotal.textContent = t;
    elPayAmount.textContent = t;
  }

  elProduct.addEventListener("change", refreshTotal);
  elQty.addEventListener("input", refreshTotal);

  // --- esperar pelo pagamento -------------------------------------------
  // O telemóvel da pessoa pede o PIN; o servidor da PaySuite avisa o nosso
  // webhook; nós vamos perguntando à base de dados se já mudou de estado.
  function waitForPayment(reference) {
    var tries = 0;
    var MAX = 60;   // 60 x 3s = 3 minutos

    (function poll() {
      tries++;
      rpc("order_status", { p_reference: reference }).then(function (s) {
        var status = s && s.status;

        if (status === "paid") {
          location.href = "obrigado.html?ref=" + encodeURIComponent(reference);
          return;
        }
        if (status === "failed" || status === "cancelled") {
          elWaiting.hidden = true;
          form.hidden = false;
          elBtn.disabled = false;
          showError("O pagamento não foi concluído. Verifique o saldo e o " +
                    "número e tente outra vez. Referência " + reference + ".");
          return;
        }
        if (tries >= MAX) {
          elWaitingHint.textContent =
            "Ainda não recebemos a confirmação. Se já pagou, o pagamento " +
            "vai entrar — guarde a referência " + reference + " e " +
            "contacte-nos se em 30 minutos nada acontecer.";
          return;
        }
        setTimeout(poll, 3000);
      }).catch(function () {
        if (tries < MAX) setTimeout(poll, 5000);
      });
    })();
  }

  // --- submeter ---------------------------------------------------------
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    elError.hidden = true;

    var name = document.getElementById("f-name").value.trim();
    var phone = document.getElementById("f-phone").value.trim();

    if (!name) return showError("Escreva o seu nome para continuarmos.");
    if (!/\d{9,}/.test(phone.replace(/\D/g, ""))) {
      return showError("Escreva um número de telefone válido — é para lá que " +
                       "vai o pedido de pagamento.");
    }
    if (!apiBase) {
      return showError("Os pagamentos ainda não estão configurados neste site.");
    }

    elBtn.disabled = true;
    elBtn.textContent = "A preparar o pagamento…";

    rpc("create_order", {
      p_product: elProduct.value,
      p_quantity: Math.max(1, Math.min(parseInt(elQty.value, 10) || 1, 500)),
      p_name: name,
      p_phone: phone,
      p_email: document.getElementById("f-email").value.trim() || null,
      p_notes: document.getElementById("f-notes").value.trim() || null,
      p_card_slug: document.getElementById("f-slug").value.trim().toLowerCase() || null
    }).then(function (order) {
      if (!order || !order.reference) throw new Error("sem_referencia");

      return fetch(apiBase + "/functions/v1/paysuite-checkout", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ reference: order.reference })
      }).then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body && body.error || "checkout_" + r.status);
          return body;
        });
      }).then(function (pay) {
        // Pagamento por página (cartão): sai daqui para a PaySuite.
        if (pay.redirectUrl) { location.href = pay.redirectUrl; return; }

        // M-Pesa / e-Mola: o pedido já foi para o telemóvel, esperamos aqui.
        form.hidden = true;
        elWaiting.hidden = false;
        elWaitingRef.textContent = order.reference;
        waitForPayment(order.reference);
      });
    }).catch(function (err) {
      elBtn.disabled = false;
      elBtn.innerHTML = 'Pagar <span id="pay-amount">' + money(currentTotal()) +
                        '</span> <span aria-hidden="true">→</span>';
      elPayAmount = document.getElementById("pay-amount");

      var code = err && err.message || "";
      if (code === "gateway_indisponivel") {
        showError("Não conseguimos falar com o sistema de pagamentos neste " +
                  "momento. Tente daqui a pouco.");
      } else if (code === "encomenda_fechada") {
        showError("Esta encomenda já foi processada.");
      } else {
        showError("Não foi possível iniciar o pagamento. Verifique a ligação " +
                  "e tente novamente.");
      }
    });
  });

  // --- arranque ---------------------------------------------------------
  var q = new URLSearchParams(location.search);
  var wanted = (q.get("produto") || "").toLowerCase();
  if (wanted && elProduct.querySelector('option[value="' + wanted + '"]')) {
    elProduct.value = wanted;
  }
  var slug = q.get("c");
  if (slug) document.getElementById("f-slug").value = slug;

  if (window.FlechaAuth && FlechaAuth.enabled && FlechaAuth.isLoggedIn()) {
    var nav = document.getElementById("nav-account");
    if (nav) { nav.textContent = "Os meus cartões"; nav.href = "painel.html"; }
    var email = FlechaAuth.email();
    if (email) document.getElementById("f-email").value = email;
  }

  loadPrices().then(refreshTotal);
  refreshTotal();
})();
