// FlechaCard — contas (Supabase Auth)
// Guarda a sessão no navegador e renova o token quando expira.
// Sem configuração de backend, tudo aqui fica inativo e o site continua
// a funcionar sem contas.
(function () {
  "use strict";

  var CFG = window.FLECHA_CONFIG || {};
  var STORE = "flechacard.session";

  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
    window.FlechaAuth = { enabled: false };
    return;
  }

  var base = CFG.supabaseUrl.replace(/\/+$/, "");

  function read() {
    try {
      var raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function write(session) {
    try {
      if (session) localStorage.setItem(STORE, JSON.stringify(session));
      else localStorage.removeItem(STORE);
    } catch (e) { /* modo privado: a sessão dura só esta página */ }
  }

  function store(json) {
    if (!json || !json.access_token) return null;
    var session = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + ((json.expires_in || 3600) - 60) * 1000,
      email: json.user && json.user.email ? json.user.email : (read() || {}).email
    };
    write(session);
    return session;
  }

  function post(path, body, extraHeaders) {
    var headers = {
      "apikey": CFG.supabaseAnonKey,
      "Content-Type": "application/json"
    };
    if (extraHeaders) {
      for (var k in extraHeaders) headers[k] = extraHeaders[k];
    }
    return fetch(base + "/auth/v1/" + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error_description || data.msg || data.message || ("auth_" + r.status));
          err.status = r.status;
          err.code = data.error_code || data.error || "";
          throw err;
        }
        return data;
      });
    });
  }

  // After confirming an email (or following a recovery link), Supabase
  // sends people back with the session in the URL fragment. Turn that into
  // a stored session and scrub the URL so the tokens do not linger in
  // history or get pasted into a chat.
  function fetchUserEmail() {
    var s = read();
    if (!s) return Promise.resolve(null);
    return fetch(base + "/auth/v1/user", {
      headers: { "apikey": CFG.supabaseAnonKey, "Authorization": "Bearer " + s.access_token }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) {
        if (u && u.email) {
          var cur = read();
          if (cur) { cur.email = u.email; write(cur); }
        }
        return u;
      }).catch(function () { return null; });
  }

  function consumeHash() {
    var raw = location.hash || "";
    if (raw.indexOf("access_token=") === -1 &&
        raw.indexOf("error_description=") === -1 &&
        raw.indexOf("error=") === -1) return null;

    var p = new URLSearchParams(raw.replace(/^#/, ""));
    var event = {
      type: p.get("type") || "",
      error: p.get("error_description") || p.get("error") || "",
      session: null
    };
    if (p.get("access_token")) {
      event.session = store({
        access_token: p.get("access_token"),
        refresh_token: p.get("refresh_token"),
        expires_in: parseInt(p.get("expires_in") || "3600", 10)
      });
      fetchUserEmail();
    }
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {
      location.hash = "";
    }
    return event;
  }

  var hashEvent = consumeHash();

  var refreshing = null;

  function session() {
    var s = read();
    if (!s) return Promise.resolve(null);
    if (Date.now() < s.expires_at) return Promise.resolve(s);
    if (!s.refresh_token) { write(null); return Promise.resolve(null); }
    if (!refreshing) {
      refreshing = post("token?grant_type=refresh_token", { refresh_token: s.refresh_token })
        .then(function (data) { refreshing = null; return store(data); })
        .catch(function () { refreshing = null; write(null); return null; });
    }
    return refreshing;
  }

  window.FlechaAuth = {
    enabled: true,

    // Set when this page load carried a confirmation or recovery result.
    hashEvent: hashEvent,

    refreshEmail: fetchUserEmail,

    updatePassword: function (password) {
      var s = read();
      if (!s) return Promise.reject(new Error("sem sessão"));
      return fetch(base + "/auth/v1/user", {
        method: "PUT",
        headers: {
          "apikey": CFG.supabaseAnonKey,
          "Authorization": "Bearer " + s.access_token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password: password })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw new Error(data.msg || data.message || ("auth_" + r.status));
          return data;
        });
      });
    },

    // Cabeçalhos para as chamadas à base de dados: com sessão, o pedido
    // vai assinado como este utilizador; sem sessão, como visitante.
    headers: function () {
      return session().then(function (s) {
        var h = { "apikey": CFG.supabaseAnonKey, "Content-Type": "application/json" };
        if (s) h.Authorization = "Bearer " + s.access_token;
        else if (/^eyJ/.test(CFG.supabaseAnonKey)) h.Authorization = "Bearer " + CFG.supabaseAnonKey;
        return h;
      });
    },

    session: session,

    email: function () {
      var s = read();
      return s ? s.email : null;
    },

    isLoggedIn: function () { return !!read(); },

    signUp: function (email, password) {
      return post("signup", { email: email, password: password }).then(function (data) {
        // Com confirmação de email ligada, ainda não há sessão.
        if (data.access_token) return { session: store(data), needsConfirmation: false };
        return { session: null, needsConfirmation: true };
      });
    },

    signIn: function (email, password) {
      return post("token?grant_type=password", { email: email, password: password })
        .then(function (data) { return store(data); });
    },

    resetPassword: function (email, redirectTo) {
      return post("recover", { email: email, gotrue_meta_security: {} },
                  redirectTo ? { "Redirect-To": redirectTo } : null);
    },

    signOut: function () {
      var s = read();
      write(null);
      if (!s) return Promise.resolve();
      return post("logout", {}, { Authorization: "Bearer " + s.access_token })
        .catch(function () { /* a sessão local já foi apagada */ });
    }
  };
})();
