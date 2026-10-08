/* DOSTER — script.js : 사이트의 "움직임". 사진을 바꿀 때는 수정할 필요 없습니다. */
(function () {
  'use strict';
  window.dosterReady = true;

  var doc = document, root = doc.documentElement, body = doc.body;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var desktopMQ = window.matchMedia('(min-width: 900px)');
  var reduceMotion = reduceMQ.matches;
  // CSS가 스크롤 연동(첫 화면·큰 사진 확대)을 직접 처리하는 브라우저에서는 JS가 하지 않음
  var cssScroll = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));
  var viewList = null;                           // 사진 뷰어 목록 캐시

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* 1. 사진 파일이 없으면 그 자리에 파일 이름 상자 표시 */
  function showMissing(img) {
    if (!img || !img.parentNode || img.getAttribute('data-missing')) return;
    if (!img.getAttribute('src') || img.closest('#viewer') || img.classList.contains('img-guard')) return;   // 뷰어의 빈 이미지는 '사진 없음'이 아님
    if (img.hasAttribute('data-optional')) { img.remove(); viewList = null; return; }   // 네거티브(-nt)가 없으면 상자 없이 생략
    img.setAttribute('data-missing', '1');
    var file = img.getAttribute('src') || '(no file)';
    var box = doc.createElement('div');
    box.className = 'img-missing';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', img.getAttribute('alt') || file);
    var w = img.getAttribute('width'), h = img.getAttribute('height');
    if (w && h) box.style.aspectRatio = w + ' / ' + h;
    var name = doc.createElement('span'); name.textContent = file;
    var note = doc.createElement('small'); note.textContent = '사진 파일을 찾을 수 없습니다 — images 폴더와 파일 이름을 확인하세요';
    box.appendChild(name); box.appendChild(note);
    var frame = img.closest('.reveal-img');
    if (frame) frame.classList.add('is-in');
    img.replaceWith(box);
    viewList = null;
  }
  window.dosterShowMissing = showMissing;
  (window.__dosterMissing || []).forEach(showMissing);
  window.__dosterMissing = [];

  /* 2. 스크롤하면 나타나기 */
  var revealEls = doc.querySelectorAll('.reveal, .reveal-img');
  function revealAll() { revealEls.forEach(function (el) { el.classList.add('is-in'); }); }
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealAll();
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealObserver.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

  /* 3. 밝은/어두운 전시실 전환 + 전시실 이름 */
  var wayfinder = doc.getElementById('wayfinder');
  if ('IntersectionObserver' in window) {
    var themeObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        body.setAttribute('data-theme', en.target.getAttribute('data-theme'));
        if (!wayfinder) return;
        var room = en.target.getAttribute('data-room');
        if (room) { wayfinder.textContent = 'Room ' + room; wayfinder.classList.add('is-visible'); }
        else wayfinder.classList.remove('is-visible');
      });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    doc.querySelectorAll('main > section[data-theme]').forEach(function (s) { themeObserver.observe(s); });
  }

  /* 4. 상단 메뉴 · 모바일 메뉴 */
  var header = doc.getElementById('site-header');
  var hero = doc.querySelector('.hero');
  var menu = doc.getElementById('menu');
  var menuToggle = doc.querySelector('.menu-toggle');
  var menuOpen = false, lastY = window.scrollY;
  var metrics = { heroH: 0, headerH: 64 };       // 매 프레임 읽지 않고 필요할 때만 측정
  function measure() {
    metrics.heroH = hero ? hero.offsetHeight : 0;
    metrics.headerH = header ? header.offsetHeight : 64;
  }

  function updateHeader(y) {
    if (!header) return;
    var heroEnd = metrics.heroH - metrics.headerH;
    header.classList.toggle('is-top', y < heroEnd);
    if (menuOpen) { header.classList.remove('is-hidden'); lastY = y; return; }
    var d = y - lastY;
    if (d > 6 && y > 240) header.classList.add('is-hidden');
    else if (d < -6) header.classList.remove('is-hidden');
    lastY = y;
  }
  if (header) header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });

  function setMenu(open) {
    if (!menu || !menuToggle) return;
    menuOpen = open;
    menuToggle.setAttribute('aria-expanded', String(open));
    body.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(function () { menu.classList.add('is-open'); });
      var first = menu.querySelector('a'); if (first) first.focus();
    } else {
      menu.classList.remove('is-open');
      menu.hidden = true;
    }
  }
  if (menu && menuToggle) {
    menuToggle.addEventListener('click', function () { setMenu(!menuOpen); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); menuToggle.focus(); }
    });
  }

  /* 5. 스크롤에 맞춘 효과 */
  var heroImg = doc.querySelector('.hero-img');
  var heroContent = doc.getElementById('hero-content');
  var zoomFrames = Array.prototype.slice.call(doc.querySelectorAll('.zoom-on-scroll'));
  var hscrolls = Array.prototype.slice.call(doc.querySelectorAll('[data-hscroll]')).map(function (el) {
    return { el: el, track: el.querySelector('.hscroll-track'), dist: 0 };
  });
  var expands = Array.prototype.slice.call(doc.querySelectorAll('[data-expand]')).map(function (el) {
    var fig = el.closest('figure');
    return { el: el, frame: el.querySelector('.expand-frame'), sticky: el.querySelector('.expand-sticky'), label: fig && fig.querySelector('figcaption') };
  });
  var negFrames = Array.prototype.slice.call(doc.querySelectorAll('.negative-fade')).map(function (el) {
    return { el: el, img: el.querySelector('img[data-negative]'), zoom: el.querySelector('.pano-zoom') };
  });
  var pinned = false;

  function heroFx(y, vh) {                       // 첫 화면: 사진은 천천히, 글자는 서서히 사라짐 (CSS 미지원 브라우저용)
    if (cssScroll || !heroImg || !hero) return;
    var h = metrics.heroH || vh;
    if (y > h) return;
    var p = y / h;
    heroImg.style.transform = 'translate3d(0,' + (y * 0.28).toFixed(1) + 'px,0) scale(' + (1 + p * 0.05).toFixed(4) + ')';
    if (heroContent) {
      heroContent.style.opacity = clamp(1 - p * 1.6, 0, 1).toFixed(3);
      heroContent.style.transform = 'translate3d(0,' + (y * -0.08).toFixed(1) + 'px,0)';
    }
  }
  function zoomFx(frame, vh) {                   // 화면 가득 사진: 지나가며 아주 살짝 확대 (CSS 미지원 브라우저용)
    var r = frame.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh + 50) return;
    var img = frame.querySelector('img'); if (!img) return;
    var p = clamp((vh - r.top) / (vh + r.height), 0, 1);
    img.style.transform = 'scale(' + (1 + p * 0.1).toFixed(4) + ')';
  }
  function negFx(o, vh) {                        // 파노라마: 고정된 동안 네거티브 → 현상본 + 천천히 확대 (CSS 미지원 브라우저용, CSS와 같은 구간)
    var r = o.el.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh + 50) return;
    var total = r.height - vh;
    var p = total > 0 ? clamp(-r.top / total, 0, 1) : 1;                  // 고정 구간 진행도
    var cp = clamp((vh - r.top) / (vh + r.height), 0, 1);                  // 지나가는 전체 진행도
    if (o.img) o.img.style.opacity = (1 - clamp((p - 0.10) / 0.55, 0, 1)).toFixed(3);
    if (o.zoom) o.zoom.style.transform = 'scale(' + (1 + cp * 0.1).toFixed(4) + ')';
  }
  function measureE(o) {                         // 휴대폰: 작은 사진 아래 빈 공간만큼 캡션을 끌어올려 사진에 붙임
    if (!o.label || !o.sticky || !o.frame) return;
    if (desktopMQ.matches || reduceMotion) { o.label.style.marginTop = ''; return; }
    var gap = (o.sticky.offsetHeight - o.frame.offsetHeight) / 2;
    o.label.style.marginTop = gap > 18 ? (18 - gap).toFixed(0) + 'px' : '';
  }
  function measureH(o) {                         // 가로 시퀀스 길이 계산
    if (!o.track) return;
    if (!pinned) {                               // 휴대폰: 바뀐 게 있을 때만 되돌림 (주소창 resize마다 레이아웃 안 건드림)
      if (o.measured) { o.el.style.height = ''; o.track.style.transform = ''; o.measured = false; }
      return;
    }
    o.dist = Math.max(0, o.track.offsetWidth - window.innerWidth);
    o.el.style.height = (o.dist + window.innerHeight) + 'px';
    o.measured = true;
  }
  function hFx(o, vh) {                          // 세로 스크롤 → 가로 이동
    if (!pinned || !o.visible || !o.track || o.dist <= 0) return;
    var r = o.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    var p = clamp(-r.top / o.dist, 0, 1);
    o.track.style.transform = 'translate3d(' + (-p * o.dist).toFixed(1) + 'px,0,0)';
  }
  function expandFx(o, vh) {                     // 작은 액자 → 화면 전체
    if (!o.visible || !o.frame || !o.el.classList.contains('is-active')) return;
    var r = o.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    var total = r.height - vh;
    var p = total > 0 ? clamp(-r.top / (total * 0.8), 0, 1) : 1;
    var start = desktopMQ.matches ? 0.42 : 0.62;
    o.frame.style.transform = 'scale(' + (start + (1 - start) * easeInOut(p)).toFixed(4) + ')';
  }

  var ticking = false;
  function update() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    updateHeader(y);
    if (reduceMotion) return;
    heroFx(y, vh);
    if (!cssScroll) { zoomFrames.forEach(function (f) { zoomFx(f, vh); }); negFrames.forEach(function (o) { negFx(o, vh); }); }
    hscrolls.forEach(function (o) { hFx(o, vh); });
    expands.forEach(function (o) { expandFx(o, vh); });
  }
  function requestUpdate() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  // 화면 근처에 있는 가로 시퀀스 · 확대 액자만 계산
  var fxItems = hscrolls.concat(expands);
  fxItems.forEach(function (o) { o.visible = !('IntersectionObserver' in window); });
  if ('IntersectionObserver' in window) {
    var fxObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.__fx.visible = en.isIntersecting; });
      requestUpdate();
    });
    fxItems.forEach(function (o) { o.el.__fx = o; fxObserver.observe(o.el); });
  }

  function applyMode() {
    measure();
    pinned = !reduceMotion && desktopMQ.matches;
    hscrolls.forEach(function (o) { o.el.classList.toggle('is-pinned', pinned); measureH(o); });
    expands.forEach(function (o) {
      o.el.classList.toggle('is-active', !reduceMotion);
      if (reduceMotion && o.frame) o.frame.style.transform = '';
    });
    if (reduceMotion) {
      if (heroImg) heroImg.style.transform = '';
      if (heroContent) { heroContent.style.opacity = ''; heroContent.style.transform = ''; }
      zoomFrames.forEach(function (f) { var i = f.querySelector('img'); if (i) i.style.transform = ''; });
      negFrames.forEach(function (o) { if (o.img) o.img.style.opacity = ''; if (o.zoom) o.zoom.style.transform = ''; });
      revealAll();
    }
    expands.forEach(measureE);
    if (menuOpen && desktopMQ.matches) setMenu(false);
    requestUpdate();
  }

  // 가로 시퀀스 사진은 가까워지면 미리 불러오기
  if ('IntersectionObserver' in window) {
    var preload = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.querySelectorAll('img[loading="lazy"]').forEach(function (img) { img.loading = 'eager'; });
        preload.unobserve(en.target);
      });
    }, { rootMargin: '150% 0px' });
    hscrolls.forEach(function (o) { preload.observe(o.el); });
  }
  hscrolls.forEach(function (o) {
    if (!o.track) return;
    o.track.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('load', function () { measureH(o); requestUpdate(); });
    });
  });

  expands.forEach(function (o) {
    var img = o.frame && o.frame.querySelector('img');
    if (img) img.addEventListener('load', function () { measureE(o); });
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { measure(); hscrolls.forEach(measureH); expands.forEach(measureE); requestUpdate(); }, 120);
  });
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('load', function () { measure(); hscrolls.forEach(measureH); expands.forEach(measureE); requestUpdate(); });
  function onMQChange() { reduceMotion = reduceMQ.matches; applyMode(); }
  if (reduceMQ.addEventListener) {
    reduceMQ.addEventListener('change', onMQChange);
    desktopMQ.addEventListener('change', onMQChange);
  }
  applyMode();

  /* 6. 사진 크게 보기 (Enter 열기 · ← → 이동 · Esc 닫기 · 휴대폰은 좌우로 밀기) */
  /* 사진 보호: 사진 위에 보이지 않는 막(워터마크가 들어간 저해상도 사본)을 덮음.
     우클릭 저장·복사·드래그를 하면 원본 대신 이 사본이 저장됨. 사본은 images/guard/ 에 같은 이름으로 있음 */
  function guardSrc(img) {
    var s = (img.getAttribute('src') || '').split('?')[0];
    return s.indexOf('images/') === 0 && s.indexOf('images/guard/') !== 0 ? 'images/guard/' + s.slice(7) : null;
  }
  function makeGuard(src) {
    var g = doc.createElement('img');
    g.className = 'img-guard'; g.alt = ''; g.setAttribute('aria-hidden', 'true');
    g.decoding = 'async';
    if (src) { g.loading = 'lazy'; g.src = src; }
    return g;
  }
  function guardAll() {
    Array.prototype.forEach.call(doc.querySelectorAll('main img'), function (img) {
      if (img.hasAttribute('data-negative') || img.classList.contains('img-guard')) return;
      var src = guardSrc(img), pa = img.parentNode;
      if (!src || !pa || pa.querySelector(':scope > .img-guard')) return;
      img.setAttribute('draggable', 'false');
      var g = makeGuard(src); g.__img = img;
      if (img.hasAttribute('data-viewable')) g.style.cursor = 'zoom-in';
      if (getComputedStyle(pa).position === 'static') pa.style.position = 'relative';
      pa.appendChild(g);
    });
  }

  var viewer = doc.getElementById('viewer');
  if (viewer && typeof viewer.showModal === 'function') {
    var vImg = viewer.querySelector('.viewer-img');
    var vCap = viewer.querySelector('.viewer-caption');
    var vCount = viewer.querySelector('.viewer-count');
    var current = 0, opener = null, savedY = 0;
    var vGuard = makeGuard();                      // 뷰어의 큰 사진 위 보호막 (사진 크기·위치에 맞춤)
    vImg.parentNode.appendChild(vGuard);
    function placeVGuard() {
      var st = vGuard.style;
      st.left = vImg.offsetLeft + 'px'; st.top = vImg.offsetTop + 'px';
      st.setProperty('width', vImg.offsetWidth + 'px', 'important');
      st.setProperty('height', vImg.offsetHeight + 'px', 'important');
    }
    vImg.addEventListener('load', placeVGuard);
    window.addEventListener('resize', function () { if (viewer.open) placeVGuard(); });

    function viewables() {                       // 매번 DOM을 뒤지지 않고 캐시 (사진이 없어 교체되면 다시 만듦)
      if (!viewList) viewList = Array.prototype.slice.call(doc.querySelectorAll('.room img'))
        .filter(function (img) { return !img.closest('a') && !img.hasAttribute('data-negative'); });
      return viewList;
    }
    function captionFor(img) {
      var fig = img.closest('figure'), cap = fig && fig.querySelector('figcaption');
      if (!cap) return '';
      return Array.prototype.map.call(cap.children, function (c) { return c.textContent.trim(); }).filter(Boolean).join('  ·  ');
    }
    function show(i) {
      var list = viewables(); if (!list.length) return;
      current = (i + list.length) % list.length;
      var img = list[current];
      vImg.src = img.currentSrc || img.src;
      vImg.alt = img.alt || '';
      var gs = guardSrc(img);
      if (gs) vGuard.src = gs; else vGuard.removeAttribute('src');
      vCap.textContent = captionFor(img);
      vCount.textContent = String(current + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0');
    }
    function open(img) {
      var i = viewables().indexOf(img); if (i < 0) return;
      opener = img; show(i);
      savedY = window.scrollY;                     // 닫을 때 이 위치로 돌아옴 (iOS가 포커스 복원하며 화면을 옮기는 문제 방지)
      root.classList.add('viewer-open');
      if (doc.activeElement && doc.activeElement !== body && doc.activeElement.blur) doc.activeElement.blur();   // 닫을 때 브라우저가 터치한 사진으로 '스크롤 이동'하지 않게
      viewer.showModal();
      viewer.querySelector('.viewer-close').focus();
    }
    function close() { if (viewer.open) viewer.close(); }

    viewer.addEventListener('close', function () {
      root.classList.remove('viewer-open');
      vImg.removeAttribute('src');
      vGuard.removeAttribute('src');
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      restoreScroll();
      requestAnimationFrame(restoreScroll);
      setTimeout(restoreScroll, 80);
      setTimeout(restoreScroll, 350);
    });
    function restoreScroll() {                     // 부드러운 스크롤 없이 원래 자리로 즉시 복귀 → 확대 사진도 그대로
      if (Math.abs(window.scrollY - savedY) < 2) return;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, savedY);
      root.style.scrollBehavior = '';
      requestUpdate();
    }
    viewables().forEach(function (img) {
      img.setAttribute('data-viewable', '');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'View larger: ' + (img.alt || 'photograph'));
    });
    doc.addEventListener('click', function (e) {
      var t = e.target && e.target.__img ? e.target.__img : e.target;   // 보호막을 눌렀으면 그 아래 사진
      var img = t.closest && t.closest('img[data-viewable]');
      if (img) open(img);
    });
    doc.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && t.matches && t.matches('img[data-viewable]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(t); }
    });
    viewer.querySelector('.viewer-close').addEventListener('click', close);
    viewer.querySelector('.viewer-prev').addEventListener('click', function () { show(current - 1); });
    viewer.querySelector('.viewer-next').addEventListener('click', function () { show(current + 1); });
    viewer.addEventListener('click', function (e) {
      if (e.target === viewer || e.target.classList.contains('viewer-figure')) close();
    });
    viewer.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    });
    var touchX = null;
    viewer.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    viewer.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
      touchX = null;
    }, { passive: true });
  }

  guardAll();                                    // 페이지의 모든 사진에 보호막

  /* 7. 첫 화면 SCROLL 안내: 15초 동안 아무 움직임이 없으면 서서히 나타남 */
  var cue = doc.querySelector('.scroll-cue');
  if (cue) {
    var CUE_DELAY = 15000, lastMove = Date.now(), cueTimer = null;
    var cueEvents = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'scroll'];
    var cueActive = function () { lastMove = Date.now(); };
    var cueCheck = function () {
      var idle = Date.now() - lastMove;
      if (idle < CUE_DELAY || window.scrollY > 40) { cueTimer = setTimeout(cueCheck, Math.max(1000, CUE_DELAY - idle)); return; }
      cue.classList.add('is-visible');
      cueEvents.forEach(function (ev) { window.removeEventListener(ev, cueActive); });
    };
    cueEvents.forEach(function (ev) { window.addEventListener(ev, cueActive, { passive: true }); });
    cueTimer = setTimeout(cueCheck, CUE_DELAY);
  }

  /* 8. 푸터 연도 자동 */
  var year = doc.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

})();
