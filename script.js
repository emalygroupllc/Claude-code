/* ============================================================
   EMALY GROUP · MISSION EDITION — script.js
   ============================================================ */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Optional endpoint for lead records. Leave empty to store locally only. */
  var LEAD_ENDPOINT = '';

  /* ============ STARFIELD ============ */
  function buildStars(el, count, size) {
    var shadows = [];
    for (var i = 0; i < count; i++) {
      var x = Math.round(Math.random() * 100);
      var y = Math.round(Math.random() * 200); // taller than viewport for parallax room
      shadows.push(x + 'vw ' + y + 'vh 0 rgba(219,226,236,' + (0.4 + Math.random() * 0.6).toFixed(2) + ')');
    }
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;top:0;left:0;width:' + size + 'px;height:' + size + 'px;border-radius:50%;box-shadow:' + shadows.join(',');
    el.appendChild(dot);
  }
  var layers = [
    { el: document.querySelector('.stars-1'), count: 120, size: 1, speed: 0.02 },
    { el: document.querySelector('.stars-2'), count: 60, size: 2, speed: 0.05 },
    { el: document.querySelector('.stars-3'), count: 24, size: 3, speed: 0.09 }
  ];
  layers.forEach(function (l) { if (l.el) buildStars(l.el, l.count, l.size); });

  /* Shooting star every ~15s */
  var shooter = document.querySelector('.shooting-star');
  if (shooter && !reducedMotion) {
    setInterval(function () {
      shooter.style.top = (5 + Math.random() * 40) + '%';
      shooter.classList.remove('fly');
      void shooter.offsetWidth; // restart animation
      shooter.classList.add('fly');
    }, 15000);
  }

  /* ============ SCROLL: rocket, parallax, planet glow, countdown, sticky CTA ============ */
  var rocket = document.getElementById('scrollRocket');
  var markers = Array.prototype.slice.call(document.querySelectorAll('.planet-marker'));
  var countdownProgress = document.getElementById('countdownProgress');
  var countdownEl = document.querySelector('.countdown');
  var stickyCta = document.getElementById('stickyCta');
  var hero = document.getElementById('launch');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var scrollY = window.scrollY;
      var vh = window.innerHeight;
      var docH = document.documentElement.scrollHeight - vh;
      var progress = docH > 0 ? Math.min(scrollY / docH, 1) : 0;

      // Parallax star layers
      if (!reducedMotion) {
        layers.forEach(function (l) {
          if (l.el) l.el.style.transform = 'translateY(' + (-scrollY * l.speed) + 'px)';
        });
      }

      // Traveling rocket: fixed on the line, rides 12% → 82% of viewport height
      if (rocket && !reducedMotion) {
        var heroH = hero ? hero.offsetHeight : vh;
        if (scrollY > heroH * 0.5) {
          rocket.classList.add('visible');
          var y = vh * (0.12 + progress * 0.7);
          rocket.style.transform = 'translateY(' + y + 'px)';
          // Planet glow when the rocket is near a marker (viewport space)
          var rocketY = y + 20;
          markers.forEach(function (m) {
            var r = m.getBoundingClientRect();
            var near = Math.abs(r.top + r.height / 2 - rocketY) < 140;
            m.classList.toggle('glow', near);
          });
        } else {
          rocket.classList.remove('visible');
        }
      }

      // Countdown progress line draws with scroll
      if (countdownProgress && countdownEl) {
        var r2 = countdownEl.getBoundingClientRect();
        var pct = (vh * 0.75 - r2.top) / r2.height;
        countdownProgress.style.height = Math.max(0, Math.min(1, pct)) * 100 + '%';
      }

      // Sticky mobile CTA after hero
      if (stickyCta && hero) {
        stickyCta.classList.toggle('show', scrollY > hero.offsetHeight * 0.85);
      }

      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ============ REVEAL + TRIGGERED ANIMATIONS ============ */
  var revealTargets = document.querySelectorAll(
    '.section .container > *:not(.launch-rocket), .cards-3 > *, .route-stop, .cd-card, .stat-card, .compare-card, .faq-item'
  );
  revealTargets.forEach(function (el, i) {
    el.classList.add('reveal');
    el.style.transitionDelay = (i % 6) * 80 + 'ms';
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in-view');

      // count-up stats inside the revealed element
      e.target.querySelectorAll('.stat-num[data-count]').forEach(countUp);
      if (e.target.matches('.stat-num[data-count]')) countUp(e.target);

      io.unobserve(e.target);
    });
  }, { threshold: 0.2 });
  revealTargets.forEach(function (el) { io.observe(el); });

  /* Orbit diagram: break orbit ~2s after entering view */
  var orbit = document.getElementById('orbitDiagram');
  if (orbit) {
    new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        setTimeout(function () { orbit.classList.add('escaped'); }, reducedMotion ? 0 : 2000);
        obs.disconnect();
      });
    }, { threshold: 0.4 }).observe(orbit);
  }

  /* Split bar fills on scroll */
  var splitBar = document.getElementById('splitBar');
  if (splitBar) {
    new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        splitBar.classList.add('animate');
        obs.disconnect();
      });
    }, { threshold: 0.5 }).observe(splitBar);
  }

  /* ============ COUNT-UP ============ */
  function countUp(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    var target = parseFloat(el.dataset.count);
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    if (reducedMotion || target === 0) {
      el.textContent = prefix + target.toFixed(decimals) + suffix;
      return;
    }
    var dur = 1200;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ============================================================
     PRE-FLIGHT CHECK · THE QUIZ
     ============================================================ */
  var screen = document.getElementById('quizScreen');
  var progressBar = document.getElementById('quizProgress');
  var panel = document.getElementById('quizPanel');
  var launchRocket = document.getElementById('launchRocket');

  var answers = {
    platforms: [],
    crewSize: null,
    niche: null,
    salesHistory: null,
    productInterest: null,
    weeklyTime: null
  };

  var TOTAL_STEPS = 8; // intro, q1..q6, capture — for the progress bar

  var questions = {
    q1: {
      key: 'platforms', multi: true, step: 1,
      q: 'Where does your audience follow you?',
      opts: ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Other']
    },
    q2: {
      key: 'crewSize', step: 2,
      q: 'How big is your crew?',
      opts: ['Under 50K', '50K–150K', '150K–500K', '500K–1M', '1M+']
    },
    q3: {
      key: 'niche', step: 3,
      q: 'What do you create?',
      opts: ['Lifestyle & family', 'Fitness & health', 'Business & money', 'Faith & motivation', 'Beauty & style', 'Education', 'Entertainment', 'Other']
    },
    q4: {
      key: 'salesHistory', step: 4,
      q: 'Ever sold your own product to your audience?',
      opts: ['Never — this would be my first launch', 'Once or twice', 'I sell regularly']
    },
    q5: {
      key: 'productInterest', step: 5,
      q: 'Which mission excites you most?',
      opts: ['📖 An ebook', '👥 A paid community', '🎥 Live classes / a course', '📱 My own app', '🤔 Not sure yet']
    },
    q6: {
      key: 'weeklyTime', step: 6,
      q: 'How much time can you give the mission per week?',
      opts: ['Under 2 hours', '2–5 hours', '5+ hours']
    }
  };

  var flow = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
  var history = [];

  function setProgress(step) {
    if (progressBar) progressBar.style.width = (step / TOTAL_STEPS) * 100 + '%';
  }

  function render(html) {
    screen.classList.remove('quiz-screen');
    void screen.offsetWidth;
    screen.classList.add('quiz-screen');
    screen.innerHTML = html;
  }

  function backButton() {
    return history.length ? '<button class="quiz-back" data-back>← Back</button>' : '';
  }

  function showIntro() {
    history = [];
    setProgress(0);
    render(
      '<div class="quiz-confirm">' +
      '<h2>Ready for liftoff? 60 seconds to see your mission plan.</h2>' +
      '<button class="btn btn-primary quiz-continue" data-goto="q1">Begin Pre-Flight →</button>' +
      '</div>'
    );
  }

  function showQuestion(id) {
    var q = questions[id];
    setProgress(q.step);
    var optsHtml = q.opts.map(function (o, i) {
      var sel = q.multi && answers[q.key].indexOf(o) !== -1 ? ' selected' : '';
      return '<button class="quiz-opt' + sel + '" data-opt="' + i + '">' + o + '</button>';
    }).join('');
    render(
      backButton() +
      '<p class="quiz-q">' + q.q + (q.multi ? ' <span style="font-size:13px;opacity:0.6;font-weight:400">(select all that apply)</span>' : '') + '</p>' +
      '<div class="quiz-options">' + optsHtml + '</div>' +
      (q.multi ? '<button class="btn btn-primary quiz-continue" data-multinext>Continue →</button>' : '')
    );
    screen.dataset.current = id;
  }

  function needsRecommendation() {
    return answers.productInterest === '🤔 Not sure yet' ||
      (answers.productInterest === '📱 My own app' && answers.crewSize === 'Under 50K');
  }

  function showRecommendation() {
    setProgress(5.5);
    render(
      backButton() +
      '<div class="quiz-reco">' +
      '<div class="planet planet-md planet-blue" aria-hidden="true"></div>' +
      '<span class="quiz-reco-tag">MISSION CONTROL RECOMMENDS: START WITH THE EBOOK</span>' +
      '<p>Fastest build (1–2 weeks), almost zero time from you, and it proves your audience buys — one partner sold 250+ copies to a 99.6K audience. Once it’s flying, we scale into community and live classes.</p>' +
      '<button class="btn btn-primary quiz-continue" data-goto="q6">Sounds good → continue</button>' +
      '</div>'
    );
    screen.dataset.current = 'reco';
  }

  function showReassurance() {
    setProgress(6.5);
    render(
      '<div class="quiz-confirm">' +
      '<p class="quiz-q">Perfect — the mission is designed so we do the heavy lifting.</p>' +
      '</div>'
    );
    setTimeout(showCapture, reducedMotion ? 400 : 1400);
  }

  function showCapture() {
    setProgress(7);
    render(
      backButton() +
      '<h2>Mission control needs your coordinates.</h2>' +
      '<div class="quiz-fields">' +
      '<input type="text" id="qf-name" placeholder="Name" autocomplete="name">' +
      '<input type="text" id="qf-handle" placeholder="@handle">' +
      '<input type="text" id="qf-country" placeholder="Country" autocomplete="country-name">' +
      '<input type="text" id="qf-contact" placeholder="Email or WhatsApp" autocomplete="email">' +
      '</div>' +
      '<p class="quiz-error" id="qf-error">Mission control needs at least your name and a way to reach you.</p>' +
      '<button class="btn btn-primary quiz-launch-btn" data-launch>🚀 LAUNCH</button>'
    );
    screen.dataset.current = 'capture';
  }

  function showConfirmation() {
    setProgress(8);
    render(
      '<div class="quiz-confirm">' +
      '<h2>🚀 Mission received.</h2>' +
      '<p>We review every application personally. If the fit is right, you’ll hear from us within 48 hours. Until then — keep creating. Your audience is the fuel.</p>' +
      '<p class="quiz-privacy">🔒 Applications reviewed privately. We never contact you publicly.</p>' +
      '</div>'
    );
  }

  function advanceFrom(id) {
    history.push(id);
    if (id === 'q5') {
      if (needsRecommendation()) { showRecommendation(); return; }
      showQuestion('q6');
      return;
    }
    if (id === 'reco') { showQuestion('q6'); return; }
    if (id === 'q6') { showReassurance(); return; }
    var idx = flow.indexOf(id);
    if (idx !== -1 && idx < flow.length - 1) showQuestion(flow[idx + 1]);
  }

  function goBack() {
    var prev = history.pop();
    if (!prev) { showIntro(); return; }
    if (prev === 'reco') { showRecommendation(); return; }
    showQuestion(prev);
  }

  function scatterParticles() {
    var rect = panel.getBoundingClientRect();
    for (var i = 0; i < 26; i++) {
      var p = document.createElement('div');
      p.className = 'star-particle';
      p.style.left = rect.width / 2 + 'px';
      p.style.top = rect.height / 2 + 'px';
      p.style.setProperty('--px', (Math.random() - 0.5) * 360 + 'px');
      p.style.setProperty('--py', (Math.random() - 0.5) * 360 + 'px');
      if (Math.random() > 0.6) p.style.background = '#39A9F6';
      panel.appendChild(p);
      setTimeout(function (el) { return function () { el.remove(); }; }(p), 1000);
    }
  }

  function fireLaunchSequence() {
    if (reducedMotion) {
      var flash = document.createElement('div');
      flash.className = 'amber-flash';
      document.body.appendChild(flash);
      setTimeout(function () { flash.remove(); }, 800);
      showConfirmation();
      return;
    }
    panel.classList.add('shake');
    setTimeout(function () { panel.classList.remove('shake'); }, 450);
    scatterParticles();
    if (launchRocket) launchRocket.classList.add('launching');
    setTimeout(function () {
      if (launchRocket) launchRocket.classList.remove('launching');
      showConfirmation();
    }, 1300);
  }

  function submitLead() {
    var name = document.getElementById('qf-name');
    var handle = document.getElementById('qf-handle');
    var country = document.getElementById('qf-country');
    var contact = document.getElementById('qf-contact');
    var err = document.getElementById('qf-error');

    [name, contact].forEach(function (f) { f.classList.remove('invalid'); });
    var valid = true;
    if (!name.value.trim()) { name.classList.add('invalid'); valid = false; }
    if (!contact.value.trim()) { contact.classList.add('invalid'); valid = false; }
    if (!valid) { err.classList.add('show'); return; }
    err.classList.remove('show');

    var lead = {
      submittedAt: new Date().toISOString(),
      name: name.value.trim(),
      handle: handle.value.trim(),
      country: country.value.trim(),
      contact: contact.value.trim(),
      platforms: answers.platforms,
      followerRange: answers.crewSize,
      niche: answers.niche,
      salesHistory: answers.salesHistory,
      productInterest: answers.productInterest,
      weeklyTime: answers.weeklyTime
    };

    try {
      var stored = JSON.parse(localStorage.getItem('emaly_leads') || '[]');
      stored.push(lead);
      localStorage.setItem('emaly_leads', JSON.stringify(stored));
    } catch (e) { /* storage unavailable — continue */ }

    if (LEAD_ENDPOINT) {
      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      }).catch(function () { /* lead is kept in localStorage */ });
    }

    fireLaunchSequence();
  }

  screen && screen.addEventListener('click', function (ev) {
    var t = ev.target.closest('button');
    if (!t) return;

    if (t.hasAttribute('data-back')) { goBack(); return; }
    if (t.hasAttribute('data-launch')) { submitLead(); return; }

    if (t.hasAttribute('data-goto')) {
      var dest = t.getAttribute('data-goto');
      if (screen.dataset.current === 'reco') { history.push('reco'); showQuestion(dest); }
      else showQuestion(dest);
      return;
    }

    if (t.hasAttribute('data-multinext')) {
      var cur = questions[screen.dataset.current];
      if (answers[cur.key].length === 0) return; // need at least one platform
      advanceFrom(screen.dataset.current);
      return;
    }

    if (t.hasAttribute('data-opt')) {
      var id = screen.dataset.current;
      var q = questions[id];
      var val = q.opts[parseInt(t.getAttribute('data-opt'), 10)];
      if (q.multi) {
        var arr = answers[q.key];
        var pos = arr.indexOf(val);
        if (pos === -1) arr.push(val); else arr.splice(pos, 1);
        t.classList.toggle('selected');
      } else {
        answers[q.key] = val;
        t.classList.add('selected');
        setTimeout(function () { advanceFrom(id); }, reducedMotion ? 0 : 220); // auto-advance on tap
      }
    }
  });

  if (screen) showIntro();
})();
