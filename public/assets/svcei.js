/* svcei.js — the runtime the pages are drawn by.
 *
 * Nothing on this site is written into its markup. A page declares what it
 * wants with data- attributes and this file fetches the payload and draws it.
 * That is deliberate: the May 2026 site carried its figures in HTML, so a
 * correction meant editing every page that quoted the number, and one of them
 * always got missed. Here there is one copy of each figure, in data/, and a
 * monthly release changes no page at all.
 *
 * Three rules are enforced in code rather than left to the author of a page:
 *   every figure is drawn with the month it belongs to attached to it;
 *   the series files carry ranks and ratios to the median state, never levels,
 *     so nothing drawn here can assert a quantity;
 *   the five indices are never summed, because they are disjoint sets.
 *
 * Plain ES2018, no build step, no dependencies. It has to run from a static
 * host and keep running when a package registry does not.
 */
(function () {
  'use strict';

  var CACHE = {};
  var BASE = (document.documentElement.getAttribute('data-base') || '');
  /* Where a ZIP lookup is recorded, or empty for not at all. Written into the
     document by the build, so the behaviour and the sentence describing it come
     from one constant and cannot disagree. */
  var ZIPLOG = (document.documentElement.getAttribute('data-ziplog') || '');

  function get(path) {
    var url = BASE + path;
    if (!CACHE[url]) {
      CACHE[url] = fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) { throw new Error(path + ': ' + r.status); }
        return r.json();
      });
    }
    return CACHE[url];
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  function wname(w) { return MONTHS[+w.slice(5, 7) - 1] + ' ' + w.slice(0, 4); }
  function num(n) { return (n === null || n === undefined) ? '—' : n.toLocaleString('en-US'); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* An ordinal a reader would speak. The reports print "43rd", never "43th";
     the same rule applies here, and the same three-teen exception with it. */
  function ordinal(n) {
    if (n === null || n === undefined) { return '—'; }
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* House style spells a small number in prose and sets a large one in
     numerals. "comprises 2 counties" is a line of pipeline output; "comprises
     two counties" is a sentence. */
  var SPELL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
    'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function spell(n) { return SPELL[n] !== undefined ? SPELL[n] : num(n); }

  /* A list a person reads, with the Oxford comma the house style requires. */
  function andlist(xs) {
    if (xs.length === 1) { return xs[0]; }
    if (xs.length === 2) { return xs[0] + ' and ' + xs[1]; }
    return xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1];
  }

  /* ── color ────────────────────────────────────────────────────────────────
     The ramp is keyed to RANK, not to a value. Rank is the thing the indices
     publish, and a ramp keyed to a level would invite a reader to compare the
     depth of two colors across two months as though it meant a quantity. */
  var RAMP = ['#2d1437', '#4b1535', '#861931', '#b23334', '#c74a39',
    '#d96442', '#e78e5f', '#f2b075', '#f8d5ac'];

  /* THE HOUSE RULE FOR EVERY MAP ON THIS SITE, WITHOUT EXCEPTION.
     DARKER IS ALWAYS MORE OF THE THING BEING MEASURED.

     RAMP runs dark to pale, so RAMP[0] is the strongest reading and RAMP[8]
     the weakest, whatever the quantity. Attention has always obeyed this
     because it is keyed to RANK and rank 1 takes RAMP[0]. Three other maps
     did not: the Schools layers, the Latitude component layers, and the
     Latitude coverage layer all painted the LOWEST value darkest, because
     each was written from its own break arithmetic rather than from a rule.
     Two ramps running opposite directions on one site is worse than either
     direction alone: a reader who learns the maps on the indices page reads
     every market map exactly backwards.

     A ramp index is therefore computed here and nowhere else. Anything that
     needs a colour for a value calls one of these two functions. */

  /* rank 1 of `of` is the strongest, so it takes the darkest step. */
  function rampByRank(rank, of) {
    if (!rank) { return '#ececec'; }
    var i = Math.floor((rank - 1) / (of || 50) * RAMP.length);
    return RAMP[Math.min(RAMP.length - 1, Math.max(0, i))];
  }

  /* `frac` is 0 for the least of the quantity and 1 for the most. The most
     takes RAMP[0]. Every value-shaded map goes through here. */
  function rampByShare(frac) {
    if (frac === null || frac === undefined || isNaN(frac)) { return '#ececec'; }
    var i = Math.round((1 - Math.max(0, Math.min(1, frac))) * (RAMP.length - 1));
    return RAMP[i];
  }

  /* The swatch row for a legend labelled least-on-the-left. Pale to dark,
     which is RAMP reversed, and it is generated rather than typed so that a
     legend cannot drift away from the map it explains. */
  function rampSwatches() {
    return RAMP.slice().reverse().map(function (c) {
      return '<i style="background:' + c + '"></i>';
    }).join('');
  }
  /* Kept as the name every attention map already calls, delegating so that
     one implementation of the rule exists rather than two that can drift. */
  function rankColor(rank, of) { return rampByRank(rank, of); }

  /* ── the national map ─────────────────────────────────────────────────── */

  /* ── ONE PLACE THAT MAKES A MARK LIVE ─────────────────────────────────────
     Every figure on this site draws states, Regions, or market areas, and each
     of those has a page. A figure that shows fifty states and lets a reader
     open none of them is a dead end, and a native <title> is not a substitute:
     it waits a second, cannot be styled, gives no hover feedback on the mark
     itself, and never appears on a touch device.

     This was solved separately for the county carpet and the beeswarm before it
     became obvious it should be solved once. `resolve` is given the mark and
     returns {html, href}; everything else — the tooltip, the hover state, the
     click, and the keyboard path — is the same for every figure and is here.

     A mark keeps its <title> as well. The tooltip is for the eye; the title is
     what a screen reader reads. */
  function liveMarks(host, sel, resolve) {
    if (!host) { return; }
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    var tip = host.querySelector(':scope > .maptip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'maptip';
      host.appendChild(tip);
    }
    var lit = null;
    function light(el) {
      if (lit === el) { return; }
      if (lit) { lit.classList.remove('markon'); }
      lit = el;
      if (lit) { lit.classList.add('markon'); }
    }
    host.addEventListener('mousemove', function (e) {
      var t = e.target.closest ? e.target.closest(sel) : null;
      var r = t && resolve(t);
      if (!r || !r.html) { tip.style.display = 'none'; light(null); return; }
      light(t);
      tip.innerHTML = r.html;
      tip.style.display = 'block';
      var b = host.getBoundingClientRect();
      var x = e.clientX - b.left + 14, y = e.clientY - b.top + 14;
      if (x + tip.offsetWidth > b.width) {
        x = e.clientX - b.left - tip.offsetWidth - 8;
      }
      tip.style.left = Math.max(2, x) + 'px';
      tip.style.top = y + 'px';
    });
    host.addEventListener('mouseleave', function () {
      tip.style.display = 'none'; light(null);
    });
    host.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest(sel) : null;
      var r = t && resolve(t);
      if (r && r.href) { location.href = r.href; }
    });
    host.classList.add('haslive');
  }

  /* ── a place with no reading must not look like a place with a low one ────
     Every map on this site filled an unmeasured shape with #ececec, a pale
     grey. On the light theme that sits a shade away from the palest step of
     the ramp, so a reader could not tell a measurement the Institute does not
     have from a measurement it has and which is small.

     Connecticut was blank on every layer of the church atlas for a real and
     stateable reason — the 2020 Religion Census is published on the eight
     legacy counties and the Institute's market areas are built on the nine
     planning regions that replaced them — and it read as "hardly any churches
     in Connecticut". That is the worst kind of error: not a wrong number, an
     invented one, produced in the reader's head by a color.

     So a hole is now drawn as a hole. Diagonal hatching is the cartographic
     convention for no data, it cannot be mistaken for any step of a sequential
     ramp, it survives both themes, and it is outside the ramp entirely, so the
     house rule that darker is always more of the thing measured is untouched.

     NODATA_ID is unique per map because two SVGs on one page cannot share a
     pattern id without the second one silently inheriting the first's. */
  var NODATA_N = 0;

  /* ── why a particular shape has no reading ────────────────────────────────
     A hole drawn as a hole is an improvement on a hole drawn as a low value.
     A hole that says WHY is the actual fix, because the reason is usually
     interesting and is always the Institute's rather than the reader's.

     Keyed by market id and by state name. Anything not listed gets the general
     sentence, which is still true and still better than an empty tooltip. */
  var NOREADING = {
    '09-09110': 'ct', '09-09140': 'ct', '09-09170': 'ct',
    '09-09180': 'ct', '09-09190': 'ct', 'Connecticut': 'ct'
  };
  var NOREASON = {
    ct: 'The 2020 U.S. Religion Census is published on Connecticut&rsquo;s eight ' +
        'legacy counties. The Institute&rsquo;s Connecticut market areas are built ' +
        'on the nine planning regions that replaced them in 2022, and the two ' +
        'sets of codes share no value. Assigning the old counties to the new ' +
        'market areas was tested and rejected: it puts Waterbury in the wrong ' +
        'market. The Institute would rather show nothing than an estimate.'
  };

  /* Names of every place any map on this page has loaded, so a shape with no
     ROW of its own can still be named in its tooltip. Without this the five
     Connecticut market areas introduced themselves as "09-09170", which is
     true, useless, and looks like the error it is not. */
  var PLACENAME = {};

  function learnNames(rows, idKey, nameKey) {
    (rows || []).forEach(function (r) {
      var k = r[idKey || 'id'], v = r[nameKey || 'name'];
      if (k && v) { PLACENAME[k] = v; }
    });
  }

  function noReadingTip(id, name) {
    var why = NOREASON[NOREADING[id]] || NOREASON[NOREADING[name]] || '';
    name = name || PLACENAME[id] || id;
    return '<b>' + esc(name) + '</b><br><span class="ts">no reading</span>' +
      (why ? '<br><span class="ts">' + why + '</span>'
           : '<br><span class="ts">The Institute has no measurement here. It is ' +
             'drawn as absent rather than as a low value.</span>');
  }

  function nodataPattern(svg, ns, id) {
    var defs = document.createElementNS(ns, 'defs');
    var pat = document.createElementNS(ns, 'pattern');
    pat.setAttribute('id', id);
    pat.setAttribute('width', '5');
    pat.setAttribute('height', '5');
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('patternTransform', 'rotate(45)');
    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', '5');
    bg.setAttribute('height', '5');
    bg.setAttribute('class', 'ndbg');
    pat.appendChild(bg);
    var line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
    line.setAttribute('x2', '0'); line.setAttribute('y2', '5');
    line.setAttribute('class', 'ndline');
    line.setAttribute('stroke-width', '2');
    pat.appendChild(line);
    defs.appendChild(pat);
    svg.appendChild(defs);
  }

  function USMap(host, geo, opts) {
    opts = opts || {};
    var ns = 'http://www.w3.org/2000/svg';
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', geo.viewBox);
    svg.setAttribute('class', 'usmap');
    svg.setAttribute('role', 'img');
    var NDID = 'nodata-' + (++NODATA_N);
    var NONE = 'url(#' + NDID + ')';
    nodataPattern(svg, ns, NDID);
    var paths = {};
    Object.keys(geo.paths).forEach(function (name) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', geo.paths[name]);
      p.setAttribute('class', 'st');
      p.setAttribute('fill', NONE);
      p.setAttribute('data-name', name);
      svg.appendChild(p);
      paths[name] = p;
    });
    // A national outline drawn over the fills. Without it a map of 262 market
    // areas has no coastline: the eye reads the shapes as a mosaic rather than
    // as a country, and Michigan's lakes disappear into the fill beside them.
    if (geo.nation) {
      var o = document.createElementNS(ns, 'path');
      o.setAttribute('d', geo.nation);
      o.setAttribute('fill', 'none');
      o.setAttribute('stroke', '#4a4a4a');
      o.setAttribute('stroke-width', '1.1');
      o.setAttribute('stroke-linejoin', 'round');
      o.setAttribute('pointer-events', 'none');
      svg.appendChild(o);
    }
    wrap.appendChild(svg);
    var tip = document.createElement('div');
    tip.className = 'maptip';
    wrap.appendChild(tip);
    host.appendChild(wrap);

    wrap.addEventListener('mousemove', function (e) {
      var t = e.target.closest ? e.target.closest('path.st') : null;
      if (!t) { tip.style.display = 'none'; return; }
      var name = t.getAttribute('data-name');
      var html = opts.tip ? opts.tip(name) : esc(name);
      if (!html) { tip.style.display = 'none'; return; }
      tip.innerHTML = html;
      tip.style.display = 'block';
      var r = wrap.getBoundingClientRect();
      var x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      if (x + tip.offsetWidth > r.width) { x = e.clientX - r.left - tip.offsetWidth - 8; }
      tip.style.left = Math.max(2, x) + 'px';
      tip.style.top = y + 'px';
    });
    wrap.addEventListener('mouseleave', function () { tip.style.display = 'none'; });

    /* ── zoom and pan ──────────────────────────────────────────────────────
       A national map at this scale is a map of everywhere and nowhere: the
       262 market areas of the eastern seaboard occupy fewer pixels between
       them than Wyoming does alone, and a reader looking for their own county
       cannot find it. So every map on this site pans and zooms.

       It is done by moving the SVG viewBox rather than by a CSS transform,
       because the church dot layer is a canvas drawn in viewBox coordinates
       and a CSS transform would scale its pixels rather than redraw them.
       Anything drawn over a map registers with onview() and is redrawn from
       the new viewBox, so overlay and map cannot come apart. */
    var base = geo.viewBox.split(/\s+/).map(Number);
    var view = base.slice();
    var MAXZ = 14;
    var viewers = [];

    function clamp() {
      view[2] = Math.min(base[2], Math.max(base[2] / MAXZ, view[2]));
      view[3] = view[2] * (base[3] / base[2]);
      view[0] = Math.min(base[0] + base[2] - view[2], Math.max(base[0], view[0]));
      view[1] = Math.min(base[1] + base[3] - view[3], Math.max(base[1], view[1]));
    }
    var pending = false;
    function apply() {
      clamp();
      svg.setAttribute('viewBox', view.join(' '));
      zin.disabled = view[2] <= base[2] / MAXZ + 0.001;
      zout.disabled = view[2] >= base[2] - 0.001;
      zres.style.visibility = view[2] >= base[2] - 0.001 ? 'hidden' : 'visible';
      if (!pending) {
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          viewers.forEach(function (f) { f(view.slice()); });
        });
      }
    }
    /* Screen point to viewBox point, so a wheel zooms about the cursor rather
       than about the middle of the country. */
    function at(e) {
      var r = svg.getBoundingClientRect();
      return [view[0] + (e.clientX - r.left) / r.width * view[2],
        view[1] + (e.clientY - r.top) / r.height * view[3]];
    }
    function zoom(f, px, py) {
      var w = view[2] * f;
      w = Math.min(base[2], Math.max(base[2] / MAXZ, w));
      var h = w * (base[3] / base[2]);
      var fx = (px - view[0]) / view[2], fy = (py - view[1]) / view[3];
      view[0] = px - fx * w; view[1] = py - fy * h;
      view[2] = w; view[3] = h;
      apply();
    }

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = at(e);
      zoom(e.deltaY < 0 ? 1 / 1.25 : 1.25, p[0], p[1]);
    }, { passive: false });

    var drag = null, moved = 0, downOn = null;
    svg.addEventListener('pointerdown', function (e) {
      if (e.button) { return; }
      drag = { x: e.clientX, y: e.clientY, vx: view[0], vy: view[1] };
      moved = 0;
      /* Remember what was under the pointer when it went down. Capturing the
         pointer for the pan makes the SVG itself the target of the click that
         follows, so the shape the reader actually clicked is not on the click
         event at all. That is what silently broke click-through to a state
         page when panning was added: every map still looked clickable, and
         none of them navigated. */
      downOn = e.target.closest ? e.target.closest('path.st') : null;
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', function (e) {
      if (!drag) { return; }
      var r = svg.getBoundingClientRect();
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      view[0] = drag.vx - dx / r.width * view[2];
      view[1] = drag.vy - dy / r.height * view[3];
      apply();
    });
    function endDrag(e) {
      if (!drag) { return; }
      drag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (x) { /* already gone */ }
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('dblclick', function () {
      view = base.slice(); apply();
    });

    var ctl = document.createElement('div');
    ctl.className = 'mapzoom';
    ctl.innerHTML =
      '<button type="button" data-z="in" aria-label="Zoom in">+</button>' +
      '<button type="button" data-z="out" aria-label="Zoom out">&minus;</button>' +
      '<button type="button" data-z="reset" aria-label="Reset the view">Reset</button>';
    wrap.appendChild(ctl);
    var zin = ctl.querySelector('[data-z="in"]');
    var zout = ctl.querySelector('[data-z="out"]');
    var zres = ctl.querySelector('[data-z="reset"]');
    zin.addEventListener('click', function () {
      zoom(1 / 1.6, view[0] + view[2] / 2, view[1] + view[3] / 2); });
    zout.addEventListener('click', function () {
      zoom(1.6, view[0] + view[2] / 2, view[1] + view[3] / 2); });
    zres.addEventListener('click', function () { view = base.slice(); apply(); });

    var hint = document.createElement('div');
    hint.className = 'maphint';
    hint.textContent = 'Scroll to zoom \u00b7 drag to pan \u00b7 double-click to reset';
    wrap.appendChild(hint);

    if (opts.href) {
      svg.classList.add('clickable');
      wrap.addEventListener('click', function (e) {
        /* A pan that ends over a market area is not a click on it. */
        if (moved > 4) { return; }
        if (e.target.closest && e.target.closest('.mapzoom')) { return; }
        var t = (e.target.closest ? e.target.closest('path.st') : null) || downOn;
        if (t) {
          var u = opts.href(t.getAttribute('data-name'));
          if (u) { location.href = u; }
        }
      });
      /* Keyboard and screen readers get the same door as the mouse. */
      Object.keys(paths).forEach(function (n) {
        var u = opts.href(n);
        if (!u) { return; }
        paths[n].setAttribute('tabindex', '0');
        paths[n].setAttribute('role', 'link');
        paths[n].setAttribute('aria-label', n);
        paths[n].addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = u; }
        });
      });
    }
    apply();

    return {
      /* A painter returning nothing, or the old grey, means "no reading here".
         Both are mapped to the hatch, so every map gets the treatment without
         each caller having to know about it — which is the only way this stays
         true as maps are added. */
      paint: function (fill) {
        Object.keys(paths).forEach(function (n) {
          var v = fill(n);
          var none = !v || v === '#ececec';
          paths[n].setAttribute('fill', none ? NONE : v);
          paths[n].classList.toggle('nodata', none);
        });
      },
      /* The fill a caller should use when it wants to say "nothing here",
         so a map that builds its own legend can show the same swatch. */
      nofill: NONE,
      /* Register an overlay that must be redrawn whenever the view moves. */
      onview: function (f) { viewers.push(f); f(view.slice()); },
      view: function () { return view.slice(); },
      reset: function () { view = base.slice(); apply(); },
      el: svg
    };
  }

  /* An absolute URL to something on this site.
     BASE is a RELATIVE prefix — "" at the root, "../" one level down — so
     origin + BASE produced "https://springvale.institute../embed/chart.html"
     on every page below the root. The embed builder printed that into the
     snippet it asks people to paste, and the preview iframe pointed at a host
     that does not exist. Resolving BASE against the current page gives the
     site root whatever depth the page sits at. */
  function siteURL(rel) {
    try {
      return new URL((BASE || './') + (rel || ''), location.href).href;
    } catch (e) {
      return location.origin + '/' + (rel || '');
    }
  }

  function rampLegend(host, lo, hi) {
    /* The key is redrawn on every frame of a time-lapse, and it appended
       rather than replaced. Playing the market map from 2004 to the present
       stacked one key per month: two hundred gradient bars down the page,
       which is what a reader saw after pressing play. A key host holds one
       key. */
    host.innerHTML = '';
    var d = document.createElement('div');
    var sw = RAMP.map(function (c) {
      return '<span class="sw" style="background:' + c + '"></span>';
    }).join('');
    d.innerHTML = '<div class="ramp">' + sw + '</div>' +
      '<div class="ramp"><span class="ends"><span>' + esc(lo) +
      '</span><span>' + esc(hi) + '</span></span></div>';
    host.appendChild(d);
  }

  /* ── the time-lapse ───────────────────────────────────────────────────────
     The May 2026 site showed this as a GIF: one index, one speed, no way to
     stop on a month, and a new render every time the series changed. It is an
     animation over the data now. Every frame is a set of ranks read from the
     series file, and stopping on a month gives a reader a figure with its
     month attached. */
  function timelapse(node) {
    var key = node.getAttribute('data-index') || 'master';
    var withPicker = node.getAttribute('data-picker') !== 'off';
    var stage = document.createElement('div');
    stage.className = 'stage';
    var bar = document.createElement('div');
    bar.className = 'tl-bar';
    bar.innerHTML =
      '<button class="tl-play" aria-label="Play the time-lapse">&#9654;</button>' +
      '<span class="tl-when"></span>' +
      '<input class="tl-scrub" type="range" min="0" value="0" aria-label="Window">' +
      '<select class="tl-speed" aria-label="Speed">' +
      '<option value="300">1&times;</option><option value="150" selected>2&times;</option>' +
      '<option value="75">4&times;</option></select>';
    var legend = document.createElement('div');
    var cap = document.createElement('div');
    cap.className = 'viz-caption';
    node.appendChild(stage); node.appendChild(bar);
    node.appendChild(legend); node.appendChild(cap);

    var picker = null;
    if (withPicker) {
      picker = document.querySelector(node.getAttribute('data-picker-into') || '.idxpick');
    }

    var map = null, S = null, i = 0, timer = null;
    var play = bar.querySelector('.tl-play');
    var when = bar.querySelector('.tl-when');
    var scrub = bar.querySelector('.tl-scrub');
    var speed = bar.querySelector('.tl-speed');

    function draw() {
      var w = S.windows[i];
      var ranks = S.rank[w], ratio = S.ratio[w];
      var of = S.measured[w] || 50;
      var byName = {};
      S.states.forEach(function (g, j) { byName[g] = { r: ranks[j], x: ratio[j] }; });
      map.paint(function (n) {
        return byName[n] ? rankColor(byName[n].r, of) : '#ececec';
      });
      when.textContent = wname(w);
      scrub.value = i;
      cap.innerHTML = esc(S.title) + ' &middot; ' + esc(wname(w)) +
        ' &middot; rank among the ' + of + ' states measured in this month';
      map.tip = function (n) {
        var d = byName[n];
        if (!d || !d.r) { return '<b>' + esc(n) + '</b><br>not measured in ' + wname(w); }
        return '<b>' + esc(n) + '</b><br>' + ordinal(d.r) + ' of ' + of +
          '<br>' + (d.x ? d.x.toFixed(2) + '&times; the median state' : '') +
          '<br><span style="opacity:.7">' + wname(w) + '</span>';
      };
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      play.innerHTML = '&#9654;';
      play.setAttribute('aria-label', 'Play the time-lapse');
    }
    function start() {
      stop();
      play.innerHTML = '&#10074;&#10074;';
      play.setAttribute('aria-label', 'Pause the time-lapse');
      timer = setInterval(function () {
        i = (i + 1) % S.windows.length;
        draw();
      }, +speed.value);
    }

    play.addEventListener('click', function () { timer ? stop() : start(); });
    scrub.addEventListener('input', function () { stop(); i = +scrub.value; draw(); });
    speed.addEventListener('change', function () { if (timer) { start(); } });

    function load(k) {
      return get('data/series/' + k + '.json').then(function (s) {
        S = s;
        scrub.max = S.windows.length - 1;
        if (i >= S.windows.length) { i = S.windows.length - 1; }
        draw();
      });
    }

    get('data/geo/states.json').then(function (geo) {
      map = USMap(stage, geo, {
        tip: function (n) { return map.tip ? map.tip(n) : esc(n); },
        href: function (n) { return BASE + 'states/' + slug(n) + '.html'; }
      });
      rampLegend(legend, 'first', 'fiftieth');
      return load(key);
    }).then(function () {
      i = S.windows.length - 1;
      draw();
      if (picker) {
        picker.innerHTML = '';
        [['master', 'Master'], ['preschool', 'Preschool'], ['elementary', 'Elementary School'],
        ['middle', 'Middle School'], ['highschool', 'High School']].forEach(function (p) {
          var b = document.createElement('button');
          b.textContent = p[1];
          b.setAttribute('aria-pressed', p[0] === key ? 'true' : 'false');
          b.addEventListener('click', function () {
            key = p[0];
            Array.prototype.forEach.call(picker.children, function (c) {
              c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
            });
            load(key);
          });
          picker.appendChild(b);
        });
      }
    }).catch(function (e) {
      node.innerHTML = '<p class="viz-caption">The time-lapse could not load (' +
        esc(e.message) + ').</p>';
    });
  }

  /* ── the standings table ──────────────────────────────────────────────── */
  function standings(node) {
    var key = node.getAttribute('data-index') || 'master';
    var win = node.getAttribute('data-window');
    var host = document.createElement('div');
    node.appendChild(host);
    /* An empty selector is not "no selector" — querySelector throws on it, and
       the throw happened before the table was drawn, so every index page
       showed the heading "The present month" above nothing at all. A page that
       names no picker simply has none. */
    var into = node.getAttribute('data-picker-into');
    var picker = into ? document.querySelector(into) : null;

    function render(W, k) {
      var idx = W.indices[k];
      var rows = idx.rows.map(function (r) {
        var mv = r.move === null || r.move === undefined ? '—'
          : (r.move > 0 ? '<span class="up">&#9650; ' + r.move + '</span>'
            : (r.move < 0 ? '<span class="dn">&#9660; ' + (-r.move) + '</span>'
              : 'unchanged'));
        return '<tr><td class="n">' + r.rank + '</td>' +
          '<td><span class="sq" style="background:' +
          rankColor(r.rank, idx.measured) + '"></span>' +
          '<a href="' + BASE + 'states/' + slug(r.s) + '.html">' + esc(r.s) + '</a></td>' +
          '<td class="n">' + (r.ratio ? r.ratio.toFixed(2) + '&times;' : '—') + '</td>' +
          '<td class="n">' + (r.was ? ordinal(r.was) : '—') + '</td>' +
          '<td class="n">' + mv + '</td>' +
          '<td>' + (r.region
            ? '<a href="' + BASE + 'regions/' + slug(r.region) + '.html">' +
              esc(r.region) + '</a>'
            : '—') + '</td></tr>';
      }).join('');
      host.innerHTML =
        '<div class="tools">' +
        '<input type="text" placeholder="Find a state" aria-label="Find a state">' +
        '<span class="count"></span></div>' +
        '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th class="n">Rank</th><th>State</th><th class="n">&times; median</th>' +
        '<th class="n">A year earlier</th><th class="n">Movement</th>' +
        '<th>Spring Vale Christian Education Institute Region</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="srctag">' + esc(idx.title) + ', ' + esc(W.label) +
        '. Rank among the ' + idx.measured + ' states measured in this month. ' +
        'The multiple is of the median state’s reading in the same month, which is ' +
        '1.00 by construction. Positions are relative standings and are never counts, ' +
        'enrollments, or growth.</p>';
      var q = host.querySelector('input');
      var cnt = host.querySelector('.count');
      var trs = Array.prototype.slice.call(host.querySelectorAll('tbody tr'));
      function filter() {
        var v = q.value.toLowerCase();
        var n = 0;
        trs.forEach(function (tr) {
          var ok = tr.textContent.toLowerCase().indexOf(v) >= 0;
          tr.style.display = ok ? '' : 'none';
          if (ok) { n++; }
        });
        cnt.textContent = n + ' of ' + trs.length + ' states';
      }
      q.addEventListener('input', filter);
      filter();
    }

    get('data/manifest.json').then(function (M) {
      return get('data/window/' + (win || M.window) + '.json');
    }).then(function (W) {
      render(W, key);
      if (picker) {
        picker.innerHTML = '';
        Object.keys(W.indices).forEach(function (k) {
          var b = document.createElement('button');
          b.textContent = W.indices[k].name;
          b.setAttribute('aria-pressed', k === key ? 'true' : 'false');
          b.addEventListener('click', function () {
            Array.prototype.forEach.call(picker.children, function (c) {
              c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
            });
            render(W, k);
          });
          picker.appendChild(b);
        });
      }
    }).catch(function (e) {
      host.innerHTML = '<p class="srctag">Standings could not load (' + esc(e.message) + ').</p>';
    });
  }

  /* ── a rank history line ──────────────────────────────────────────────────
     Rank is inverted on the axis, so first place is at the top. A chart where
     the best position sits at the bottom is read backwards by everybody, and
     it was read backwards here once already. */
  /* Year-ends plus the present window. Five indices at 271 monthly points each
     is 1,355 line segments in a box four inches wide, which is not a chart of
     anything a reader can see; the reports read the series at its 22 measured
     year-ends for the same reason. The caption says which months are drawn. */
  function yearEnds(points) {
    var out = [], seen = {};
    points.forEach(function (p) {
      if (p[0].slice(5) === '12') { out.push(p); seen[p[0]] = 1; }
    });
    var last = points[points.length - 1];
    if (last && !seen[last[0]]) { out.push(last); }
    return out.length > 3 ? out : points;
  }

  /* ── ONE AXIS FOR EVERY LINE ON A CHART ───────────────────────────────────
     A line chart drew each series against its own array positions, so a state
     measured in 8 of the 22 drawn windows had its 8 readings laid down in the
     first 8 slots of the axis. North Dakota's Elementary record, which runs
     2013 to 2026, was drawn under the years 2005 to 2011: not a missing line
     but a wrong one, and a wrong line on a chart that carries the Institute's
     name is worse than no line at all.

     Two rules follow, and no line chart on this site may break either.

       1. Every series is sampled on the SAME windows and positioned by DATE,
          never by its index in its own array. A series with fewer readings is
          shorter, not compressed.
       2. A window a series was not measured in is a hole, not a value. The
          path breaks there. A straight segment across a hole asserts a
          reading that was never taken.

     `mrun` turns "YYYY-MM" into a month number so the axis can be spaced by
     time; `axis` builds the shared sampling from every series at once. */
  function mrun(w) { return +w.slice(0, 4) * 12 + (+w.slice(5, 7) - 1); }

  function axis(list, raw) {
    var seen = {};
    list.forEach(function (s) {
      s.points.forEach(function (p) { seen[p[0]] = 1; });
    });
    var all = Object.keys(seen).sort();
    if (!all.length) { return []; }
    if (raw) { return all; }
    /* The year ends of the whole span, plus the final window, so both series
       are read at the same months whatever each one happens to carry. */
    var ye = all.filter(function (w) { return w.slice(5) === '12'; });
    if (ye.indexOf(all[all.length - 1]) < 0) { ye.push(all[all.length - 1]); }
    return ye.length > 3 ? ye : all;
  }

  /* The path for one series across the shared axis. `at` returns the x for a
     window and `Y` the y for a value; a window the series does not carry ends
     the current run and starts a new one. Returns the path and the drawn
     points, so labels and dots can be hung off the series' own last reading
     rather than off the right-hand edge of somebody else's line. */
  function runs(pointsByWindow, wins, at, Y) {
    var d = '', drawn = [], open = false;
    wins.forEach(function (w) {
      var v = pointsByWindow[w];
      if (v === null || v === undefined) { open = false; return; }
      var x = at(w), y = Y(v);
      d += (open ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      drawn.push({ w: w, v: v, x: x, y: y });
      open = true;
    });
    return { d: d, drawn: drawn };
  }

  function byWindow(points) {
    var m = {};
    points.forEach(function (p) { m[p[0]] = p[1]; });
    return m;
  }

  function rankline(host, seriesList, opts) {
    opts = opts || {};
    var W = 700, H = opts.height || 240, ml = 40, mr = 132, mt = 16, mb = 28;
    var list = seriesList.map(function (s) {
      return { name: s.name, points: s.points || [], by: byWindow(s.points || []) };
    }).filter(function (s) { return s.points.length; });
    if (!list.length) { host.innerHTML = ''; return; }
    var wins = axis(list, opts.raw);
    var n = wins.length;
    if (!n) { host.innerHTML = ''; return; }
    var all = [];
    list.forEach(function (s) {
      wins.forEach(function (w) {
        var v = s.by[w];
        if (v !== null && v !== undefined) { all.push(v); }
      });
    });
    if (!all.length) { host.innerHTML = ''; return; }
    var lo = 1, hi = Math.max(Math.max.apply(null, all), 10);
    /* Spaced by date, so an unevenly sampled series sits under the years it
       was actually read in. */
    var t0 = mrun(wins[0]), t1 = mrun(wins[n - 1]), span = Math.max(1, t1 - t0);
    function at(w) { return ml + (mrun(w) - t0) / span * (W - ml - mr); }
    function X(i) { return at(wins[i]); }
    function Y(r) { return mt + (r - lo) / (hi - lo) * (H - mt - mb); }
    /* Eight, not five. A chart with seven series was wrapping the palette,
       so Wyoming and Rhode Island came out the same navy and Alabama and
       Vermont the same crimson — two pairs a reader would read as one line
       each. Eight covers every series count this site draws. */
    var COL = ['#1a3a5c', '#9B1B30', '#1D7E78', '#c7791f', '#5c4a8a',
               '#6f9fc4', '#6b7a3a', '#7a4a2a'];
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img">'];
    [1, Math.round(hi / 2), hi].forEach(function (r) {
      out.push('<line x1="' + ml + '" y1="' + Y(r).toFixed(1) + '" x2="' + (W - mr) +
        '" y2="' + Y(r).toFixed(1) + '" stroke="#ececec"/>');
      out.push('<text x="' + (ml - 7) + '" y="' + (Y(r) + 4).toFixed(1) +
        '" text-anchor="end" font-size="12" fill="#666" font-family="' +
        '-apple-system,sans-serif">' + ordinal(r) + '</text>');
    });
    var drawnBy = [];
    list.forEach(function (s, j) {
      var R = runs(s.by, wins, at, Y);
      drawnBy.push(R.drawn);
      out.push('<path d="' + R.d + '" fill="none" stroke="' + COL[j % COL.length] +
        '" stroke-width="' + (j === 0 ? 2.4 : 1.7) +
        '" stroke-linejoin="round" stroke-linecap="round"/>');
      /* A series read in fewer than half the drawn windows is marked at the
         windows it was read in, so the reader can see the sampling rather than
         infer a continuous record from a broken line. */
      if (R.drawn.length && R.drawn.length < n * 0.6) {
        out.push(R.drawn.map(function (d) {
          return '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) +
            '" r="2.4" fill="' + COL[j % COL.length] + '"/>';
        }).join(''));
      }
    });
    /* Labels sit at the height of the line they name, unless two would collide.
       A label nudged clear without a leader line is a label attached to the
       wrong series, which is exactly how a reader came to believe Wyoming had
       led since 2004. Every nudged label keeps a line back to its own series,
       and the leader starts at that series' OWN last reading, not at the right
       edge of the plot, so a series that ends early is seen to end early. */
    var lanes = list.map(function (s, j) {
      var dr = drawnBy[j], last = dr[dr.length - 1];
      if (!last) { return null; }
      return { j: j, name: s.name, at: last.y, y: last.y, x: last.x };
    }).filter(Boolean).sort(function (a, b) { return a.at - b.at; });
    for (var i = 1; i < lanes.length; i++) {
      if (lanes[i].y - lanes[i - 1].y < 15) { lanes[i].y = lanes[i - 1].y + 15; }
    }
    var over = lanes.length ? lanes[lanes.length - 1].y - (H - mb) : 0;
    if (over > 0) { lanes.forEach(function (L) { L.y -= over; }); }
    lanes.forEach(function (L) {
      if (Math.abs(L.y - L.at) > 1.5 || L.x < W - mr - 1) {
        out.push('<path d="M' + L.x.toFixed(1) + ',' + L.at.toFixed(1) + 'L' +
          (W - mr + 4) + ',' + L.y.toFixed(1) + '" fill="none" stroke="' +
          COL[L.j % COL.length] + '" stroke-width=".8" opacity=".55"/>');
      }
      out.push('<text x="' + (W - mr + 8) + '" y="' + (L.y + 4).toFixed(1) +
        '" font-size="12" font-weight="700" fill="' + COL[L.j % COL.length] +
        '" font-family="-apple-system,sans-serif">' + esc(L.name) + '</text>');
    });
    [0, Math.floor(n / 2), n - 1].forEach(function (i) {
      out.push('<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) +
        '" text-anchor="middle" font-size="12" fill="#666" ' +
        'font-family="-apple-system,sans-serif">' + wins[i].slice(0, 4) + '</text>');
    });
    out.push('</svg>');
    host.innerHTML = out.join('');
    tabledata(host, wins, list, 'rank');
    return { windows: n, first: wins[0], last: wins[n - 1] };
  }

  /* A chart that can only be seen is a chart half the readers cannot use, and a
     chart nobody can copy the figures out of is a chart nobody cites. Every line
     chart writes the figures it drew onto its own host, and the table view reads
     them from there rather than trying to reverse the picture. */
  function tabledata(host, wins, list, kind) {
    try {
      host.setAttribute('data-table', JSON.stringify({
        kind: kind, cols: list.map(function (x) { return x.name; }), wins: wins,
        /* Read by window, never by array position: a series with fewer
           readings than the axis has windows is not shifted left. */
        rows: wins.map(function (w) {
          return list.map(function (x) {
            var m = x.by || byWindow(x.points || []);
            var v = m[w];
            return (v === undefined) ? null : v;
          });
        })
      }));
    } catch (e) { /* a table is an enhancement; never break the chart for it */ }
  }

  /* ── a state page ─────────────────────────────────────────────────────── */
  function statepage(node) {
    var s = node.getAttribute('data-state');
    Promise.all([get('data/state/' + s + '.json'), get('data/manifest.json')])
      .then(function (r) {
        var D = r[0];
        document.title = D.state + ' — Spring Vale Christian Education Institute';
        var h = document.querySelector('[data-fill="title"]');
        if (h) { h.textContent = D.state; }
        var k = document.querySelector('[data-fill="kicker"]');
        if (k) {
          /* The Region name was plain text on fifty pages. It is the obvious
             next click from a state, so it is a link. */
          k.innerHTML = D.region
            ? '<a href="' + BASE + 'regions/' + slug(D.region) + '.html">' +
              esc(D.region) + '</a> &middot; ' + esc(D.label)
            : esc(D.label);
        }

        var g = node.querySelector('[data-fill="stats"]');
        if (g) {
          var p = D.provision || {};
          g.innerHTML = [
            ['Master Index', ordinal(D.now.master.rank), 'of ' + D.now.master.of +
              ' states, ' + D.label],
            ['Christian schools', num(p.schools), 'federal private school census'],
            ['Enrollments', num(p.students), 'federal private school census'],
            ['Christian school enrollments per 1,000 children', p.spk === undefined ? '—' : p.spk.toFixed(1),
              'ages five through seventeen']
          ].map(function (c) {
            return '<div><div class="k">' + esc(c[0]) + '</div><div class="v">' +
              c[1] + '</div><div class="s">' + esc(c[2]) + '</div></div>';
          }).join('');
        }

        var lv = node.querySelector('[data-fill="levels"]');
        if (lv) {
          lv.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
            '<th>Index</th><th class="n">Rank</th><th class="n">Of</th>' +
            '</tr></thead><tbody>' +
            Object.keys(D.now).map(function (k2) {
              var x = D.now[k2];
              return '<tr><td>' + esc(x.name) + '</td><td class="n">' +
                ordinal(x.rank) + '</td><td class="n">' + x.of + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        }

        var ln = node.querySelector('[data-fill="history"]');
        if (ln) {
          var drew = rankline(ln, Object.keys(D.history).map(function (k2) {
            return { name: D.history[k2].name, points: D.history[k2].points };
          }), { height: 280 });
          var cp = node.querySelector('[data-fill="history-note"]');
          if (cp && drew) {
            cp.innerHTML = 'First place is at the top of the axis. Each line is one index, ' +
              'read at ' + drew.windows + ' months: the December of every measured year, ' +
              'and ' + wname(D.window) + '. Positions are relative standings and are never ' +
              'counts, enrollments, or growth.';
          }
        }

        var mk = node.querySelector('[data-fill="markets"]');
        if (mk) {
          var rows = ((D.provision || {}).markets || []).slice()
            .sort(function (a, b) { return a.in_state - b.in_state; });
          mk.innerHTML = rows.length
            ? '<div class="tablewrap"><table class="data"><thead><tr>' +
            '<th class="n">In state</th><th>Christian Education Market Area</th>' +
            '<th class="n">Counties</th><th class="n">Schools</th>' +
            '<th class="n">Enrollments</th><th class="n">Christian school enrollments per 1,000</th>' +
            '<th class="n">National rank</th></tr></thead><tbody>' +
            rows.map(function (m) {
              return '<tr><td class="n">' + m.in_state + '</td><td><a href="' + BASE +
                'markets/' + m.id + '.html">' + esc(m.name) + '</a></td>' +
                '<td class="n">' + m.counties + '</td><td class="n">' + num(m.schools) +
                '</td><td class="n">' + num(m.students) + '</td><td class="n">' +
                m.spk.toFixed(1) + '</td><td class="n">' + m.rank + '</td></tr>';
            }).join('') + '</tbody></table></div>'
            : '<p class="srctag">No Christian Education Market Area is anchored in ' +
            esc(D.state) + '.</p>';
        }

        /* ── added 31 August 2026 ─────────────────────────────────────────
           The state hero was a name against half a screen of nothing, and the
           market areas were a table with no shape to them. Everything below is
           read from the state payload, which is the same file the table above
           is drawn from, so nothing here can disagree with anything there. */

        var P = D.provision || {};
        var MK = (P.markets || []).slice();

        /* The one-line summary in the hero, computed rather than written. */
        var sm = document.querySelector('[data-fill="summary"]');
        if (sm) {
          var lvls = ['preschool', 'elementary', 'middle', 'highschool']
            .filter(function (k2) { return D.now[k2] && D.now[k2].rank; });
          var best = null, wor = null;
          lvls.forEach(function (k2) {
            if (!best || D.now[k2].rank < D.now[best].rank) { best = k2; }
            if (!wor || D.now[k2].rank > D.now[wor].rank) { wor = k2; }
          });
          var bits = [esc(D.state) + ' stands ' + ordinal(D.now.master.rank) + ' of ' +
            D.now.master.of + ' on the Master Index in ' + esc(D.label) + '.'];
          if (best && wor && best !== wor) {
            bits.push('It is strongest at ' + esc(D.now[best].name).toLowerCase() +
              ', ' + ordinal(D.now[best].rank) + ', and weakest at ' +
              esc(D.now[wor].name).toLowerCase() + ', ' + ordinal(D.now[wor].rank) + '.');
          }
          if (P.schools) {
            bits.push(num(P.schools) + ' Christian schools are counted here, across ' +
              MK.length + ' Christian Education Market Area' +
              (MK.length === 1 ? '' : 's') + '.');
          }
          sm.innerHTML = bits.join(' ');
        }

        /* Six tiles rather than four. Congregations and the market count were
           already in the payloads and were not being shown anywhere. */
        if (g) {
          var cong = null;
          g.innerHTML = [
            ['Master Index', ordinal(D.now.master.rank),
              'of ' + D.now.master.of + ' states, ' + D.label],
            ['High school', D.now.highschool && D.now.highschool.rank
              ? ordinal(D.now.highschool.rank) : '—',
              'of ' + ((D.now.highschool || {}).of || '—') + ' states'],
            ['Christian schools', num(P.schools), 'federal private school census'],
            ['Enrollments', num(P.students), 'federal private school census'],
            ['Christian school enrollments per 1,000', P.spk === undefined || P.spk === null
              ? '—' : P.spk.toFixed(1), 'children aged five through seventeen'],
            ['Market areas', num(MK.length), 'anchored in this state']
          ].map(function (c) {
            return '<div><div class="k">' + esc(c[0]) + '</div><div class="v">' +
              c[1] + '</div><div class="s">' + esc(c[2]) + '</div></div>';
          }).join('');
        }

        /* Market areas as bars, so the shape of the state is visible before the
           table is read. Schools are a count and add, so a bar from zero is
           honest here in a way it never is for a rank. */
        var mb = document.querySelector('[data-fill="marketbars"]');
        if (mb && MK.length) {
          var byS = MK.slice().sort(function (a, b) {
            return (b.schools || 0) - (a.schools || 0);
          });
          var top = byS[0].schools || 1;
          mb.innerHTML = '<div class="mkbars">' + byS.map(function (m) {
            return '<a class="mkrow" href="' + BASE + 'markets/' + m.id + '.html">' +
              '<span class="mkname">' + esc(m.name) + '</span>' +
              '<span class="mkbar"><i style="width:' +
                ((m.schools || 0) / top * 100).toFixed(1) + '%"></i></span>' +
              '<span class="mkval">' + num(m.schools) + '</span></a>';
          }).join('') + '</div>' +
          '<p class="srctag">Christian schools counted in each Christian Education Market ' +
          'Area anchored in ' + esc(D.state) + ', from the federal private school census. ' +
          'A count adds; an index standing does not.</p>';
        }

        /* The featured market area. Chosen by a rule rather than by hand, and
           the rule is stated on the page: the month's number and the state's
           own initial letters pick one of its markets, so it rotates every
           month, every state shows a different one, and the same month always
           shows the same market. Nobody has to remember to change it, and
           nobody can be accused of choosing it. */
        var ft = document.querySelector('[data-fill="featured"]');
        var fh = document.querySelector('[data-fill="feat-title"]');
        if (ft && MK.length) {
          /* A hash would feature some market areas twice before others once.
             The month's own ordinal advances one place through the list, so
             every market area anchored in the state gets its turn, in order,
             and the same month always shows the same one. */
          var byName = MK.slice().sort(function (a, b) {
            return a.name < b.name ? -1 : 1;
          });
          var mo = parseInt(D.window.slice(0, 4), 10) * 12 +
                   parseInt(D.window.slice(5, 7), 10);
          var off = 0;
          for (var i2 = 0; i2 < D.state.length; i2++) {
            off += D.state.charCodeAt(i2);
          }
          var F = byName[(mo + off) % byName.length];
          if (fh) { fh.textContent = F.name + '.'; }
          var lev = F.by_level || {}, typ = F.by_type || {};
          var levTot = 0, typTot = 0;
          Object.keys(lev).forEach(function (x) { levTot += lev[x]; });
          Object.keys(typ).forEach(function (x) { typTot += typ[x]; });
          function stack(o, tot, cls) {
            var keys = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; });
            return '<div class="stack">' + keys.map(function (x, i3) {
              return '<span class="s' + (i3 % 6) + '" style="width:' +
                (o[x] / (tot || 1) * 100).toFixed(2) + '%" title="' + esc(x) +
                ': ' + num(o[x]) + '"></span>';
            }).join('') + '</div><ul class="keylist">' + keys.map(function (x, i3) {
              return '<li><i class="s' + (i3 % 6) + '"></i>' + esc(x) + ' <b>' +
                num(o[x]) + '</b></li>';
            }).join('') + '</ul>';
          }
          ft.innerHTML =
            '<div class="statgrid four">' + [
              ['Christian schools', num(F.schools), 'in this market area'],
              ['Enrollments', num(F.students), 'federal private school census'],
              ['Christian school enrollments per 1,000', F.spk === null || F.spk === undefined
                ? '—' : F.spk.toFixed(1), 'children aged five through seventeen'],
              ['National standing', F.rank ? ordinal(F.rank) : '—',
                'of 262 market areas, by Christian school enrollments per 1,000']
            ].map(function (c) {
              return '<div><div class="k">' + esc(c[0]) + '</div><div class="v">' +
                c[1] + '</div><div class="s">' + esc(c[2]) + '</div></div>';
            }).join('') + '</div>' +
            '<div class="grid g2" style="margin-top:22px">' +
              '<div><h4 class="sub">By level</h4>' + stack(lev, levTot) +
                '<p class="srctag">' + num(levTot) + ' individual census records, of a ' +
                'weighted total of ' + num(F.schools) + ' schools.</p></div>' +
              '<div><h4 class="sub">By tradition</h4>' + stack(typ, typTot) +
                '<p class="srctag">' + num(typTot) + ' enrollments, of a published total ' +
                'of ' + num(F.students) + '.</p></div>' +
            '</div>' +
            (F.top && F.top.length
              ? '<h4 class="sub" style="margin-top:26px">The largest schools counted here</h4>' +
                '<div class="tablewrap"><table class="data"><thead><tr><th>School</th>' +
                '<th>City</th><th>Level</th><th>Tradition</th><th class="n">Enrollment</th>' +
                '</tr></thead><tbody>' + F.top.map(function (t) {
                  return '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.city) + '</td>' +
                    '<td>' + esc(t.level) + '</td><td>' + esc(t.typ) + '</td>' +
                    '<td class="n">' + num(t.n) + '</td></tr>';
                }).join('') + '</tbody></table></div>'
              : '') +
            '<p class="srctag">' + esc(F.name) + ' covers ' + num(F.counties) +
            ' whole counties. The featured market area is chosen by a fixed rule from the ' +
            'month, so it advances one place every month and every market area anchored ' +
            'in ' + esc(D.state) + ' takes its turn. It is the same for anyone opening ' +
            'this page in ' + esc(D.label) + '. ' +
            'Counts are from the federal private school census; school names are printed ' +
            'in full. <a href="' + BASE + 'markets/' + F.id + '.html">The full market ' +
            'area report</a>.</p>';
        }

        /* The state's own composition, summed from its market areas. Counts add,
           so this is a total and is allowed to be one. */
        var cp2 = document.querySelector('[data-fill="composition"]');
        if (cp2 && MK.length) {
          var L2 = {}, T2 = {};
          MK.forEach(function (m) {
            Object.keys(m.by_level || {}).forEach(function (x) {
              L2[x] = (L2[x] || 0) + m.by_level[x];
            });
            Object.keys(m.by_type || {}).forEach(function (x) {
              T2[x] = (T2[x] || 0) + m.by_type[x];
            });
          });
          var lt = 0, tt = 0;
          Object.keys(L2).forEach(function (x) { lt += L2[x]; });
          Object.keys(T2).forEach(function (x) { tt += T2[x]; });
          function stack2(o, tot) {
            var keys = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; });
            return '<div class="stack">' + keys.map(function (x, i3) {
              return '<span class="s' + (i3 % 6) + '" style="width:' +
                (o[x] / (tot || 1) * 100).toFixed(2) + '%" title="' + esc(x) + ': ' +
                num(o[x]) + '"></span>';
            }).join('') + '</div><ul class="keylist">' + keys.map(function (x, i3) {
              return '<li><i class="s' + (i3 % 6) + '"></i>' + esc(x) + ' <b>' +
                num(o[x]) + '</b></li>';
            }).join('') + '</ul>';
          }
          /* THE TWO PANELS DO NOT COUNT THE SAME THING, AND THE PAGE SAYS SO.
             The headline school count is the sum of the federal census's final
             sampling weights, rounded. The level breakdown is a count of the
             individual census RECORDS behind that weighted total, so it is
             smaller, and by design. The tradition breakdown is weighted
             enrollment, so it reconciles to the headline enrollment to within
             rounding. Presenting either as "all the schools in the state"
             without saying which is which would be the sort of quiet error this
             whole project exists to prevent, so both denominators are computed
             here and printed rather than assumed. */
          cp2.innerHTML = '<div class="grid g2">' +
            '<div><h4 class="sub">Schools by level</h4>' + stack2(L2, lt) +
              '<p class="srctag">' + num(lt) + ' individual census records, of a ' +
              'weighted total of ' + num(P.schools) + ' schools.</p></div>' +
            '<div><h4 class="sub">Enrollments by tradition</h4>' + stack2(T2, tt) +
              '<p class="srctag">' + num(tt) + ' enrollments, of a published total of ' +
              num(P.students) + '.</p></div>' +
            '</div><p class="srctag">Summed across every Christian Education Market Area ' +
            'anchored in ' + esc(D.state) + '. The two panels count different things and ' +
            'are not two views of one number. A published school count is the sum of the ' +
            'federal census&rsquo;s final sampling weights, rounded; the level panel counts ' +
            'the individual records behind that weighted total, so it is the smaller figure ' +
            'and is meant to be. The tradition panel is weighted enrollment and reconciles ' +
            'to the published enrollment to within rounding. Neither is ever mixed into an ' +
            'index reading.</p>';
        }
      }).catch(function (e) {
        node.innerHTML = '<p class="srctag">This state could not load (' +
          esc(e.message) + ').</p>';
      });
  }

  /* ── the market directory ─────────────────────────────────────────────── */
  function marketlist(node) {
    get('data/market/index.json').then(function (D) {
      var rows = D.markets.map(function (m) {
        return '<tr data-s="' + esc(m.state) + '"><td class="n">' + m.rank + '</td>' +
          '<td><a href="' + BASE + 'markets/' + m.id + '.html">' + esc(m.name) + '</a></td>' +
          '<td><a href="' + BASE + 'states/' + slug(m.state) + '.html">' +
          esc(m.state) + '</a></td><td class="n">' + m.counties + '</td>' +
          '<td class="n">' + num(m.schools) + '</td><td class="n">' + num(m.students) +
          '</td><td class="n">' + num(m.pop) + '</td><td class="n">' +
          m.spk.toFixed(1) + '</td></tr>';
      }).join('');
      var states = [];
      D.markets.forEach(function (m) {
        if (states.indexOf(m.state) < 0) { states.push(m.state); }
      });
      states.sort();
      node.innerHTML =
        '<div class="tools">' +
        '<input type="text" placeholder="Find a market area" aria-label="Find a market area">' +
        '<select aria-label="State"><option value="">Every state</option>' +
        states.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') +
        '</select><span class="count"></span></div>' +
        '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th class="n">Rank</th><th>Christian Education Market Area</th><th>State</th>' +
        '<th class="n">Counties</th><th class="n">Schools</th><th class="n">Enrollments</th>' +
        '<th class="n">Children 5&ndash;17</th><th class="n">Christian school enrollments per 1,000</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="srctag">Source: National Center for Education Statistics, Private ' +
        'School Universe Survey, 2021&ndash;22 edition; United States Census Bureau, ' +
        'Population Estimates Program, Vintage ' + esc(D.vintage) + '. ' +
        D.count + ' market areas, ' + esc(D.label) + '.</p>';
      var q = node.querySelector('input'), sel = node.querySelector('select');
      var cnt = node.querySelector('.count');
      var trs = Array.prototype.slice.call(node.querySelectorAll('tbody tr'));
      function filter() {
        var v = q.value.toLowerCase(), st = sel.value, n = 0;
        trs.forEach(function (tr) {
          var ok = (!st || tr.getAttribute('data-s') === st) &&
            tr.textContent.toLowerCase().indexOf(v) >= 0;
          tr.style.display = ok ? '' : 'none';
          if (ok) { n++; }
        });
        cnt.textContent = n + ' of ' + trs.length + ' market areas';
      }
      q.addEventListener('input', filter);
      sel.addEventListener('change', filter);
      filter();
    }).catch(function (e) {
      node.innerHTML = '<p class="srctag">The directory could not load (' +
        esc(e.message) + ').</p>';
    });
  }

  /* ── one market area ──────────────────────────────────────────────────── */
  function marketFigures(node, mid, m, D) {
    function slot(name) { return node.querySelector('[data-fill="' + name + '"]'); }
    function draw(name, fn) {
      var h = slot(name);
      if (!h) { return; }
      try { fn(h); } catch (e) { h.innerHTML = ''; }
    }
    var st = m.state ? slug(m.state) : '';
    Promise.all([
      get('data/geo/markets.json').catch(function () { return null; }),
      get('data/market/index.json').catch(function () { return null; }),
      get('data/schools/' + mid + '.json').catch(function () { return null; }),
      get('data/congregations.json').catch(function () { return null; }),
      st ? get('data/state/' + st + '.json').catch(function () { return null; })
        : Promise.resolve(null)
    ]).then(function (r) {
      var G = r[0], IX = r[1], SC = r[2], C = r[3], S = r[4];
      var all = (IX && IX.markets) || [];
      var byId = {};
      all.forEach(function (x) { byId[x.id] = x; });
      var me = byId[mid] || m;
      if (G) { draw('fvmap', function (h) { fvMap(h, mid, me, G, D.counties || []); }); }
      if (all.length) { draw('fvstrip', function (h) { fvStrip(h, me, all); }); }
      if (SC && SC.schools) {
        draw('fvdots', function (h) {
          fvDots(h, SC.schools, me, m.median_school);
        });
      }
      draw('fvcomp', function (h) { fvComp(h, m.by_level, m.by_type, me); });
      if (C) { draw('fvchurch', function (h) { fvChurch(h, mid, C); }); }
      if (all.length) {
        draw('fvnbrs', function (h) { fvNeighbors(h, me, m.neighbors, byId); });
      }
      if (S) { draw('fvspark', function (h) { fvSpark(h, me, S); }); }
      if (typeof figtools === 'function') { setTimeout(figtools, 300); }
    });
  }

  function marketpage(node) {
    var id = node.getAttribute('data-market');
    get('data/market/' + id + '.json').then(function (D) {
      var m = D.market;
      document.title = m.name + ' — Christian Education Market Area';
      var h = document.querySelector('[data-fill="title"]');
      if (h) { h.textContent = m.name; }
      var k = document.querySelector('[data-fill="kicker"]');
      if (k) {
        k.textContent = 'Christian Education Market Area · ' + m.state +
          ' · ' + D.label;
      }
      /* ── added 31 August 2026 ────────────────────────────────────────────
         262 market area pages carried a stat grid, a county list, a school
         list, and the licence — most of the site by page count, and the
         thinnest thing on it. Everything below is read from the same payload
         the grid above is drawn from. */
      var sm = document.querySelector('[data-fill="summary"]');
      if (sm) {
        sm.innerHTML = esc(m.name) + ' is a group of ' + num(m.counties) +
          ' whole counties in ' + esc(m.state) + ', anchored on ' +
          esc(m.anchor_name || m.name) + '. ' + num(m.schools) +
          ' Christian schools are counted here, enrolling ' + num(m.students) +
          '. That is ' + m.spk.toFixed(1) + ' Christian school enrollments per 1,000 children, ' +
          ordinal(m.rank) + ' of 262 market areas.';
      }

      /* The seven figures the ZIP lookup already draws for a market area. They
         were built for the finder and never reached the market area's own
         page, which is 262 pages of the site — the largest section of it, and
         until now the only one with nothing drawn on it at all. Each is drawn
         inside its own try, so a payload that is missing costs that one figure
         and not the page. */
      marketFigures(node, id, m, D);

      var g = node.querySelector('[data-fill="stats"]');
      if (g) {
        g.innerHTML = [
          ['Christian school enrollments per 1,000 children', m.spk.toFixed(1), ordinal(m.rank) + ' of 262 nationally'],
          ['In its state', ordinal(m.in_state), 'of ' + m.of_state + ' market areas in ' + m.state],
          ['Christian schools', num(m.schools), 'federal private school census'],
          ['Enrollments', num(m.students), 'federal private school census'],
          ['Median school', num(m.median_school), 'enrollment of the middle school here'],
          ['Children aged 5–17', num(m.pop), 'Census Vintage ' + D.vintage]
        ].map(function (c) {
          return '<div><div class="k">' + esc(c[0]) + '</div><div class="v">' + c[1] +
            '</div><div class="s">' + esc(c[2]) + '</div></div>';
        }).join('');
      }
      var cy = node.querySelector('[data-fill="counties"]');
      if (cy) {
        var unit = D.counties.length === 1 ? 'county' : 'counties';
        if (m.state === 'Connecticut') {
          unit = D.counties.length === 1 ? 'planning region' : 'planning regions';
        } else if (m.state === 'Louisiana') {
          unit = D.counties.length === 1 ? 'parish' : 'parishes';
        } else if (m.state === 'Alaska') {
          unit = 'boroughs and census areas';
        }
        var hd = node.querySelector('[data-fill="county-head"]');
        if (hd) {
          hd.textContent = 'The ' + (unit === 'boroughs and census areas'
            ? 'boroughs and census areas' : (D.counties.length === 1 ? unit + 's' : unit)) +
            ' in this market area.';
        }
        cy.innerHTML = '<p>' + esc(m.name) + ' comprises ' +
          spell(D.counties.length) + ' ' + unit + ': ' +
          esc(andlist(D.counties)) + '.</p>';
      }
      var tp = node.querySelector('[data-fill="schools"]');
      if (tp) {
        // The whole list, not the eight the printed report has room for. A
        // market area page that says "the largest eight of forty-five" and then
        // links to nothing holding the other thirty-seven is a page that stops
        // exactly where a reader's question begins.
        get('data/schools/' + m.id + '.json').then(function (S) {
          schoolTable(tp, S, 'in this market area');
        }).catch(function () {
          tp.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
            '<th>School</th><th>City</th><th>Level</th><th>Type</th>' +
            '<th class="n">Enrollments</th></tr></thead><tbody>' +
            (m.top || []).map(function (t) {
              return '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.city) + '</td>' +
                '<td>' + esc(t.level) + '</td><td>' + esc(t.typ) + '</td>' +
                '<td class="n">' + num(t.n) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        });
      }

      /* Composition, with the two denominators stated. A published school
         count is the sum of the census's final sampling weights, rounded; the
         level panel counts the individual records behind that weighted total,
         so it is smaller by construction. Saying so is the difference between
         a figure and a figure a reader can check. */
      function stack(o, tot) {
        var keys = Object.keys(o || {}).sort(function (a, b) { return o[b] - o[a]; });
        if (!keys.length) { return ''; }
        return '<div class="stack">' + keys.map(function (x, i) {
          return '<span class="s' + (i % 6) + '" style="width:' +
            (o[x] / (tot || 1) * 100).toFixed(2) + '%" title="' + esc(x) + ': ' +
            num(o[x]) + '"></span>';
        }).join('') + '</div><ul class="keylist">' + keys.map(function (x, i) {
          return '<li><i class="s' + (i % 6) + '"></i>' + esc(x) + ' <b>' +
            num(o[x]) + '</b></li>';
        }).join('') + '</ul>';
      }
      var cp = document.querySelector('[data-fill="composition"]');
      if (cp) {
        var L = m.by_level || {}, T = m.by_type || {}, lt = 0, tt = 0;
        Object.keys(L).forEach(function (x) { lt += L[x]; });
        Object.keys(T).forEach(function (x) { tt += T[x]; });
        cp.innerHTML = (lt || tt)
          ? '<div class="grid g2">' +
            '<div><h4 class="sub">Schools by level</h4>' + stack(L, lt) +
              '<p class="srctag">' + num(lt) + ' individual census records, of a ' +
              'weighted total of ' + num(m.schools) + ' schools.</p></div>' +
            '<div><h4 class="sub">Enrollments by tradition</h4>' + stack(T, tt) +
              '<p class="srctag">' + num(tt) + ' enrollments, of a published total of ' +
              num(m.students) + '.</p></div></div>' +
            '<p class="srctag">The two panels count different things and are not two ' +
            'views of one number. A published school count is the sum of the federal ' +
            'census&rsquo;s final sampling weights, rounded; the level panel counts the ' +
            'individual records behind that weighted total, so it is the smaller figure ' +
            'and is meant to be. Neither is ever mixed into an index reading.</p>'
          : '<p class="srctag">The census records no level or tradition breakdown here.</p>';
      }

      /* Where it stands, drawn as a position on the national distribution
         rather than as a bar: a rank has no zero. */
      var st = document.querySelector('[data-fill="standing"]');
      if (st) {
        function track(label, r, of, note) {
          var pos = (1 - (r - 1) / (of - 1)) * 100;
          return '<div class="lvrow"><div class="lvname">' + esc(label) + '</div>' +
            '<div class="lvtrack"><span class="lvdot" style="left:' + pos.toFixed(1) +
            '%;background:' + rankColor(r, of) + '"></span></div>' +
            '<div class="lvval">' + ordinal(r) + '</div></div>' +
            '<p class="srctag" style="margin:-2px 0 10px">' + esc(note) + '</p>';
        }
        st.innerHTML =
          '<div class="lvends"><span></span><span><span>Weaker</span>' +
          '<span>Stronger</span></span><span></span></div>' +
          track('Nationally', m.rank, 262,
            'Among all 262 Christian Education Market Areas, by Christian school enrollments per 1,000 children.') +
          track('In ' + m.state, m.in_state, m.of_state,
            'Among the ' + m.of_state + ' market areas anchored in ' + m.state + '.') +
          '<p class="srctag">A standing is a position among the market areas measured on ' +
          'the same rate. It is not a quantity, and it is not an index reading: attention ' +
          'is measured for a state, Schools for a market area, and the two are never ' +
          'mixed into one figure.</p>';
      }

      /* Neighbors. The payload has always carried them and nothing used them. */
      var nb = document.querySelector('[data-fill="neighbors"]');
      if (nb) {
        var ids = m.neighbors || [];
        if (!ids.length) {
          nb.innerHTML = '<p class="srctag">This market area borders no other.</p>';
        } else {
          get('data/atlas.json').then(function (A) {
            var by = {};
            A.markets.forEach(function (x) { by[x.id] = x; });
            var rows = ids.map(function (i2) { return by[i2]; })
              .filter(Boolean)
              .sort(function (a, b) { return (b.spk || 0) - (a.spk || 0); });
            nb.innerHTML = rows.length
              ? '<div class="tablewrap"><table class="data"><thead><tr>' +
                '<th>Christian Education Market Area</th><th>State</th>' +
                '<th class="n">Christian schools</th>' +
                '<th class="n">Enrollments</th><th class="n">Christian school enrollments per 1,000</th>' +
                '<th class="n">National standing</th></tr></thead><tbody>' +
                rows.map(function (x) {
                  return '<tr><td><a href="' + BASE + 'markets/' + x.id + '.html">' +
                    esc(x.name) + '</a></td><td><a href="' + BASE + 'states/' +
                    slug(x.state) + '.html">' + esc(x.state) + '</a></td>' +
                    '<td class="n">' + num(x.schools) + '</td>' +
                    '<td class="n">' + num(x.students) + '</td>' +
                    '<td class="n">' + (x.spk === null || x.spk === undefined
                      ? '—' : x.spk.toFixed(1)) + '</td>' +
                    '<td class="n">' + ordinal(x.rank) + '</td></tr>';
                }).join('') + '</tbody></table></div>' +
                '<p class="srctag">Market areas sharing a border with ' + esc(m.name) +
                ', ordered by Christian school enrollments per 1,000 children. A family near an edge may ' +
                'realistically choose across one.</p>'
              : '<p class="srctag">This market area borders no other.</p>';
          }).catch(function () {
            nb.innerHTML = '<p class="srctag">Neighbors could not load.</p>';
          });
        }
      }
    }).catch(function (e) {
      node.innerHTML = '<p class="srctag">This market area could not load (' +
        esc(e.message) + ').</p>';
    });
  }

  /* ── one SVCEI Region ─────────────────────────────────────────────────── */
  function regionpage(node) {
    var r = node.getAttribute('data-region');
    Promise.all([get('data/region/' + r + '.json'), get('data/geo/states.json')])
      .then(function (x) {
        var D = x[0], geo = x[1];
        document.title = D.region +
          ' — a Spring Vale Christian Education Institute Region';
        var h = document.querySelector('[data-fill="title"]');
        if (h) { h.textContent = D.region; }
        var k = document.querySelector('[data-fill="kicker"]');
        if (k) {
          k.textContent = 'Spring Vale Christian Education Institute Region · ' +
            D.count + ' states · ' + D.label;
        }
        var sd = node.querySelector('[data-fill="standing"]');
        if (sd && D.standing) {
          var st = D.standing;
          /* Computed here rather than written into the page, for the reason the
             whole rebuild exists: a sentence about standing that nobody
             recomputes is a sentence that goes wrong quietly. */
          /* Two scales, said one at a time. The Region's own position is
             derived from where its states sit among the fifty, and a sentence
             that puts both numbers in one clause reads as though a Region of
             seven states could rank thirty-second of eight. */
          sd.innerHTML = '<p>In ' + esc(D.label) + ' the ' + D.count +
            ' states of the ' + esc(D.region) + ' run from ' + esc(st.best[1]) +
            ' at ' + ordinal(st.best[0]) + ' to ' + esc(st.worst[1]) + ' at ' +
            ordinal(st.worst[0]) + ' among the fifty states on the Spring Vale ' +
            'Master Christian Education Index, a spread of ' + st.spread +
            ' places. The middle of them stands ' + ordinal(st.median) +
            ' of fifty. That middle position is what the Institute ranks a ' +
            'Region by, and it places the ' + esc(D.region) + ' ' +
            ordinal(st.of_regions) + ' of the eight Spring Vale Christian ' +
            'Education Institute Regions.</p>';
        }
        var mp = node.querySelector('[data-fill="map"]');
        if (mp) {
          var members = {};
          D.members.forEach(function (m) { members[m.s] = m; });
          var map = USMap(mp, geo, {
            tip: function (n) {
              return members[n]
                ? '<b>' + esc(n) + '</b><br>' + ordinal(members[n].rank) +
                ' on the Master Index<br><span style="opacity:.7">' + esc(D.label) + '</span>'
                : esc(n);
            },
            href: function (n) { return BASE + 'states/' + slug(n) + '.html'; }
          });
          map.paint(function (n) {
            return members[n] ? rankColor(members[n].rank, 50) : '#f2f2f0';
          });
        }
        var tb = node.querySelector('[data-fill="members"]');
        if (tb) {
          tb.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
            '<th class="n">Rank</th><th>State</th><th class="n">&times; median</th>' +
            '</tr></thead><tbody>' + D.members.map(function (m) {
              return '<tr><td class="n">' + m.rank + '</td><td><a href="' + BASE +
                'states/' + slug(m.s) + '.html">' + esc(m.s) + '</a></td>' +
                '<td class="n">' + (m.ratio ? m.ratio.toFixed(2) + '&times;' : '—') +
                '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<p class="srctag">Spring Vale Master Christian Education Index, ' +
            esc(D.label) + '. Positions are relative standings among the fifty states.</p>';
        }
        /* The column under the Region map held nothing, so a short map sat
           beside a tall table and left half a screen of paper. Two figures the
           payload already carried now fill it: how much Christian schooling
           each member state has, and the market areas anchored in the Region.
           Neither is a new measurement, and neither is mixed with a standing. */
        var rs = node.querySelector('[data-fill="regschools"]');
        if (rs && (D.detail || []).length) {
          var rows = D.detail.slice().sort(function (a, b) {
            return (b.spk || 0) - (a.spk || 0);
          });
          var top = rows[0] && rows[0].spk ? rows[0].spk : 1;
          rs.innerHTML = '<ul class="regbars">' + rows.map(function (x) {
            var w = Math.max(2, Math.round((x.spk || 0) / top * 100));
            return '<li><a href="' + BASE + 'states/' + slug(x.s) + '.html">' +
              esc(x.s) + '</a><span class="bar"><i style="width:' + w + '%"></i>' +
              '</span><b>' + (x.spk === null || x.spk === undefined
                ? '—' : x.spk.toFixed(1)) + '</b></li>';
          }).join('') + '</ul>' +
            '<p class="srctag">Christian school enrollments per 1,000 children aged ' +
            'five through seventeen, from the federal private school census. A rate ' +
            'computed from two counts, never an index reading. The Region as a whole ' +
            'reads ' + ((D.totals || {}).spk || '—') + '.</p>';
        }
        var rm = node.querySelector('[data-fill="regmarkets"]');
        if (rm && (D.markets || []).length) {
          var mk = D.markets.slice().sort(function (a, b) {
            return (b.students || 0) - (a.students || 0);
          }).slice(0, 10);
          rm.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
            '<th>Christian Education Market Area</th><th class="n">Schools</th>' +
            '<th class="n">Enrollments</th></tr></thead><tbody>' +
            mk.map(function (m) {
              var nm = esc(m.m);
              return '<tr><td>' + (m.id
                ? '<a href="' + BASE + 'markets/' + m.id + '.html">' + nm + '</a>'
                : nm) + '</td><td class="n">' +
                num(m.schools) + '</td><td class="n">' + num(m.students) +
                '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<p class="srctag">The ten largest by enrollment of ' + D.n_markets +
            ' anchored in these states. <a href="' + BASE +
            'markets/index.html">Every market area</a>.</p>';
        }
        var hs = node.querySelector('[data-fill="history"]');
        if (hs) {
          rankline(hs, [{ name: 'Median rank', points: D.median_rank }], { height: 230 });
        }

        /* ── everything below added 31 August 2026 ─────────────────────────
           A Region was a map, a list of member states, and one line. It is the
           only level of the geography where attention, provision,
           congregations, the law, and the market areas can be set beside each
           other for a group of states that share a history, so that is what it
           now shows. No figure here is typed; each is read from the region
           payload, which is built from the same series every other page reads. */

        var T = D.totals || {};
        var gs = document.querySelector('[data-fill="stats"]');
        if (gs) {
          gs.innerHTML = [
            /* Two ranks on two different scales sat side by side under one
               word. The first is a position among the fifty states, and it
               read as a position among the eight Regions — which made a
               Region of seven states rank thirty-second of eight. Each now
               carries its own denominator in the figure itself, where a
               reader cannot miss it. */
            ['Median state rank',
              D.standing ? ordinal(D.standing.median) + ' of 50' : '—',
              'the middle of its ' + D.count + ' states, ' + esc(D.label)],
            ['Rank among the Regions',
              D.standing ? ordinal(D.standing.of_regions) + ' of 8' : '—',
              'by that median, ' + esc(D.label)],
            ['Christian schools', num(T.schools), 'counted in the census'],
            ['Enrollments', num(T.students), (T.spk || '—') + ' per 1,000 of school age'],
            ['Congregations', num(T.congregations), 'Christian bodies'],
            ['Christian Education Market Areas', num(D.n_markets),
              'anchored in these states']
          ].map(function (c) {
            return '<div><div class="k">' + esc(c[0]) + '</div><div class="v">' +
              c[1] + '</div><div class="s">' + esc(c[2]) + '</div></div>';
          }).join('');
        }

        /* The five indices for the region. A region whose high schools sit
           sixth and whose preschools sit fortieth is the most interesting thing
           a region page can say, and it was not being said anywhere. */
        var lv = document.querySelector('[data-fill="levels"]');
        if (lv && D.levels && D.levels.length) {
          var worst = 0;
          D.levels.forEach(function (l) { if (l.of > worst) { worst = l.of; } });
          lv.innerHTML = '<div class="lvends"><span></span>' +
            '<span><span>Weaker</span><span>Stronger</span></span><span></span></div>' +
            '<div class="lvbars">' + D.levels.map(function (l) {
            var pos = (1 - (l.median - 1) / (worst - 1)) * 100;
            var lo = (1 - (l.worst - 1) / (worst - 1)) * 100;
            var hi = (1 - (l.best - 1) / (worst - 1)) * 100;
            return '<div class="lvrow">' +
              '<div class="lvname">' + esc(l.name) + '</div>' +
              '<div class="lvtrack" title="' + esc(l.name) + ': members run ' +
                ordinal(l.best) + ' to ' + ordinal(l.worst) + '">' +
                '<span class="lvspan" style="left:' + lo.toFixed(1) + '%;width:' +
                  Math.max(0.8, hi - lo).toFixed(1) + '%"></span>' +
                '<span class="lvdot" style="left:' + pos.toFixed(1) + '%;background:' +
                  rankColor(Math.round(l.median), l.of) + '"></span>' +
              '</div>' +
              '<div class="lvval">' + ordinal(Math.round(l.median)) + '</div>' +
            '</div>';
          }).join('') + '</div>' +
          '<p class="srctag">The bar is the range its member states occupy, from the ' +
          'strongest to the weakest position; the dot is the region&rsquo;s median. ' +
          'Stronger positions sit to the right. ' + esc(D.label) + '. Positions are ' +
          'relative standings and are never added together.</p>';
        }

        /* Member states, with everything the Institute knows about each. */
        var dt = document.querySelector('[data-fill="detail"]');
        if (dt && D.detail && D.detail.length) {
          dt.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
            '<th>State</th><th class="n">Master</th><th class="n">Pre</th>' +
            '<th class="n">Elem</th><th class="n">Mid</th><th class="n">High</th>' +
            '<th class="n">&times; median</th><th class="n">Schools</th>' +
            '<th class="n">Enrollments</th><th class="n">Per 1,000</th>' +
            '<th class="n">Congregations</th></tr></thead><tbody>' +
            D.detail.map(function (m) {
              var L = m.levels || {};
              return '<tr><td><a href="' + BASE + 'states/' + slug(m.s) + '.html">' +
                esc(m.s) + '</a></td>' +
                '<td class="n">' + (m.rank || '—') + '</td>' +
                '<td class="n">' + (L.preschool || '—') + '</td>' +
                '<td class="n">' + (L.elementary || '—') + '</td>' +
                '<td class="n">' + (L.middle || '—') + '</td>' +
                '<td class="n">' + (L.highschool || '—') + '</td>' +
                '<td class="n">' + (m.ratio ? m.ratio.toFixed(2) + '&times;' : '—') + '</td>' +
                '<td class="n">' + num(m.schools) + '</td>' +
                '<td class="n">' + num(m.students) + '</td>' +
                '<td class="n">' + (m.spk === null || m.spk === undefined ? '—' : m.spk) + '</td>' +
                '<td class="n">' + num(m.congregations) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<p class="srctag">Standings are ' + esc(D.label) +
            '. Schools, enrollments, and Christian school enrollments per 1,000 children are ' +
            'counted from the federal private school census and add correctly. ' +
            'Congregations are Christian bodies as the Religion Census counts them. ' +
            'A standing is a position and is never added to another.</p>';
        }

        /* The region against the other seven, so a reader is never asked to
           hold eight numbers in their head to know whether eleventh is good. */
        var lg = document.querySelector('[data-fill="league"]');
        if (lg && D.league && D.league.length) {
          var mx = 0;
          D.league.forEach(function (x) { if (x.median > mx) { mx = x.median; } });
          lg.innerHTML = '<div class="league">' + D.league.map(function (x) {
            var me = x.slug === D.slug;
            return '<a class="lgrow' + (me ? ' me' : '') + '" href="' + BASE +
              'regions/' + x.slug + '.html">' +
              '<span class="lgname">' + esc(x.name) + '</span>' +
              '<span class="lgbar"><i style="width:' +
                ((1 - (x.median - 1) / mx) * 100).toFixed(1) + '%"></i></span>' +
              '<span class="lgval">' + ordinal(Math.round(x.median)) + '</span></a>';
          }).join('') + '</div>' +
          '<p class="srctag">Median standing of each Region&rsquo;s member states on the ' +
          'Master Index, ' + esc(D.label) + '. A longer bar is a stronger position.</p>';
        }

        /* The market areas anchored in the region. */
        var mk = document.querySelector('[data-fill="markets"]');
        if (mk && D.markets && D.markets.length) {
          mk.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
            '<th>Christian Education Market Area</th><th>State</th>' +
            '<th class="n">Christian schools</th>' +
            '<th class="n">Enrollments</th></tr></thead><tbody>' +
            D.markets.map(function (m) {
              var nm = esc(m.m || '');
              return '<tr><td>' + (m.id
                ? '<a href="' + BASE + 'markets/' + m.id + '.html">' + nm + '</a>'
                : nm) + '</td><td><a href="' + BASE + 'states/' + slug(m.state) +
                '.html">' + esc(m.state) + '</a></td>' +
                '<td class="n">' + num(m.schools) + '</td>' +
                '<td class="n">' + num(m.students) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<p class="srctag">The largest of the ' + num(D.n_markets) +
            ' Christian Education Market Areas anchored in this Region, by the number of ' +
            'Christian schools counted in each. Federal private school census.</p>';
        }
      }).catch(function (e) {
        node.innerHTML = '<p class="srctag">This region could not load (' +
          esc(e.message) + ').</p>';
      });
  }


  /* The eight Regions ranked against each other, on the index page rather than
     only inside a Region. A reader arriving at /regions/ was shown eight cards
     and no figures at all, which made the page a table of contents rather than
     a page. */
  function regionleague(node) {
    Promise.all([get('data/manifest.json'), get('data/atlas.json')])
      .then(function (x) {
        var man = x[0], atlas = x[1];
        var prov = {};
        (atlas.regions || []).forEach(function (r) { prov[r.slug] = r; });
        var rows = (man.regions || []).filter(function (r) { return r.standing; })
          .map(function (r) {
            return { name: r.name, slug: r.slug, n: (r.members || []).length,
              median: r.standing.median, best: r.standing.best,
              worst: r.standing.worst, spread: r.standing.spread,
              p: prov[r.slug] || {} };
          });
        rows.sort(function (a, b) { return a.median - b.median; });
        var mx = 0;
        rows.forEach(function (r) { if (r.median > mx) { mx = r.median; } });
        node.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
          '<th>Region</th><th class="n">States</th><th>Standing</th>' +
          '<th class="n">Median</th><th class="n">Range</th>' +
          '<th class="n">Christian schools</th><th class="n">Per 1,000</th>' +
          '</tr></thead><tbody>' + rows.map(function (r) {
            return '<tr><td><a href="' + BASE + 'regions/' + r.slug + '.html">' +
              esc(r.name) + '</a></td>' +
              '<td class="n">' + r.n + '</td>' +
              '<td><span class="lgbar" style="display:block;min-width:120px"><i style="width:' +
                ((1 - (r.median - 1) / mx) * 100).toFixed(1) + '%;background:' +
                rankColor(Math.round(r.median), 50) + ';opacity:1"></i></span></td>' +
              '<td class="n">' + ordinal(Math.round(r.median)) + '</td>' +
              '<td class="n">' + (r.best ? ordinal(r.best[0]) + '&ndash;' +
                ordinal(r.worst[0]) : '—') + '</td>' +
              '<td class="n">' + num(r.p.schools) + '</td>' +
              '<td class="n">' + (r.p.spk === null || r.p.spk === undefined ? '—' : r.p.spk) +
              '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<p class="srctag">A Region&rsquo;s standing is the median rank of its member ' +
          'states on the Spring Vale Master Christian Education Index, ' + esc(man.label) +
          '. The range is the strongest and weakest member. A longer bar is a stronger ' +
          'position. Christian schools and enrollments per 1,000 children are ' +
          'counted from the federal private school census and add correctly; a standing ' +
          'is a position and is never added to another.</p>';
      }).catch(function (e) { fail(node, e); });
  }


  /* ── the state directory map ──────────────────────────────────────────────
     The directory was fifty cards and no figures. A reader who wants Georgia
     can already find Georgia in an alphabetical list; what a map gives them is
     the thing a list cannot — where the country is strong and where it is not,
     before they have clicked anything. Click any state to open it.

     The picker changes which index is shaded. Nothing here is typed: the ranks
     come from the month payload every other page reads. */
  function statemap(node) {
    var KEYS = ['master', 'preschool', 'elementary', 'middle', 'highschool'];
    Promise.all([get('data/manifest.json'), get('data/geo/states.json')])
      .then(function (x) {
        var man = x[0], geo = x[1];
        return get('data/window/' + man.window + '.json').then(function (W2) {
          var pick = document.createElement('div');
          pick.className = 'idxpick onlight';
          var host = document.createElement('div');
          node.appendChild(pick); node.appendChild(host);
          var note = document.createElement('p');
          note.className = 'srctag'; node.appendChild(note);

          var cur = 'master', map = null, byName = {};
          function rows(k) {
            var idx = (W2.indices || {})[k] || {};
            var o = {};
            (idx.rows || []).forEach(function (r) { o[r.s] = r; });
            return { o: o, of: idx.measured || 50, name: idx.name || k };
          }
          function paint() {
            var R = rows(cur);
            byName = R.o;
            if (!map) {
              map = USMap(host, geo, {
                tip: function (n) {
                  var r = byName[n];
                  if (!r) { return esc(n); }
                  return '<b>' + esc(n) + '</b><br>' + ordinal(r.rank) +
                    ' of ' + R.of + '<br><span style="opacity:.7">' +
                    (r.ratio ? r.ratio.toFixed(2) + '&times; the median state' : '') +
                    '</span>';
                },
                href: function (n) { return BASE + 'states/' + slug(n) + '.html'; }
              });
            }
            map.paint(function (n) {
              var r = byName[n];
              return r ? rankColor(r.rank, R.of) : '#eceef1';
            });
            note.innerHTML = 'Shaded by standing on the ' + esc(R.name) +
              ' Index in ' + esc(W2.label) + ': darkest is the strongest position, ' +
              'palest the weakest. A state the index does not measure is left gray. ' +
              'Click any state to open it. Positions are relative standings among the ' +
              'states measured in the same month and are never counts.';
          }
          pick.innerHTML = KEYS.map(function (k) {
            var idx = (W2.indices || {})[k];
            return idx ? '<button type="button" data-k="' + k + '"' +
              (k === 'master' ? ' class="on"' : '') + '>' + esc(idx.name) + '</button>' : '';
          }).join('');
          pick.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () {
              pick.querySelectorAll('button').forEach(function (o) {
                o.classList.remove('on');
              });
              b.classList.add('on');
              cur = b.getAttribute('data-k');
              paint();
            });
          });
          paint();
        });
      }).catch(function (e) { fail(node, e); });
  }


  /* ── the Region map, on the Regions page ─────────────────────────────────
     Eight cards and a table told a reader which states are in which Region
     without ever showing them the shape of it. The shape is the point: a
     Region is a claim about which parts of the country belong together, and a
     reader should be able to agree or disagree with it at a glance.

     Shaded by Region rather than by standing, because this is a map of a
     definition, not of a reading. Eight hues, chosen to stay separable for
     the common color vision deficiencies, and every one of them is a link. */
  var REGION_HUES = ['#1a3a5c', '#9B1B30', '#1D7E78', '#c7791f',
                     '#5c4a8a', '#4a7a3f', '#8a5a3c', '#3f7fa8'];

  function regionmap(node) {
    Promise.all([get('data/manifest.json'), get('data/geo/states.json')])
      .then(function (x) {
        var man = x[0], geo = x[1];
        var hue = {}, of = {}, standing = {};
        (man.regions || []).forEach(function (r, i) {
          hue[r.name] = REGION_HUES[i % REGION_HUES.length];
          (r.members || []).forEach(function (g) { of[g] = r; });
          if (r.standing) { standing[r.name] = r.standing; }
        });
        var host = document.createElement('div');
        node.appendChild(host);
        var map = USMap(host, geo, {
          tip: function (n) {
            var r = of[n];
            if (!r) { return esc(n); }
            var st = standing[r.name];
            return '<b>' + esc(n) + '</b><br>' + esc(r.name) +
              (st ? '<br><span style="opacity:.75">the Region stands ' +
                ordinal(st.median) + ' of eight</span>' : '');
          },
          href: function (n) {
            var r = of[n];
            return r ? BASE + 'regions/' + r.slug + '.html' : null;
          }
        });
        map.paint(function (n) { return of[n] ? hue[of[n].name] : '#e8eaee'; });

        var key = document.createElement('div');
        key.className = 'regkey';
        key.innerHTML = (man.regions || []).map(function (r) {
          return '<a href="' + BASE + 'regions/' + r.slug + '.html">' +
            '<i style="background:' + hue[r.name] + '"></i>' + esc(r.name) +
            ' <b>' + (r.members || []).length + '</b></a>';
        }).join('');
        node.appendChild(key);

        var cap = document.createElement('p');
        cap.className = 'srctag';
        cap.innerHTML = 'The eight Spring Vale Christian Education Institute Regions. ' +
          'Shading here names a Region and is not a reading: a Region is a grouping of ' +
          'whole states that share a religious and educational tradition, and this map ' +
          'shows the grouping rather than any figure. Click any state or any Region ' +
          'below it to open that Region.';
        node.appendChild(cap);
      }).catch(function (e) { fail(node, e); });
  }

  /* ── the market map, on the Market Areas page ────────────────────────────
     The directory is a table of 262 rows. A table cannot show that the market
     areas tile the whole country, that they are unequal in size, or where the
     provision is thin — and those are the three things a reader wants before
     they start filtering. Click any market area to open it. */
  function marketmap(node) {
    Promise.all([get('data/atlas.json'), get('data/geo/markets.json')])
      .then(function (x) {
        var A = x[0], geo = x[1];
        var byId = {};
        A.markets.forEach(function (m) { byId[m.id] = m; });
        learnNames(A.markets);
        var host = document.createElement('div');
        host.className = 'atlasmap';
        node.appendChild(host);
        var map = USMap(host, geo, {
          tip: function (id) {
            var m = byId[id];
            if (!m) { return noReadingTip(id); }
            return '<b>' + esc(m.name) + '</b><br>' + num(m.schools) +
              ' Christian schools<br>' + (m.spk === null || m.spk === undefined
                ? '' : m.spk.toFixed(1) + ' Christian school enrollments per 1,000 children') +
              '<br><span style="opacity:.7">' + ordinal(m.rank) + ' of ' +
              A.markets.length + '</span>';
          },
          href: function (id) { return BASE + 'markets/' + id + '.html'; }
        });
        map.paint(function (id) {
          return provColor((byId[id] || {}).spk, A.provision_break);
        });
        var key = document.createElement('div');
        key.className = 'atlaskey';
        node.appendChild(key);
        atlasLegendProv(key, A.provision_break,
          'All ' + A.markets.length + ' market areas, each shaded by its own rate.');
        var cap = document.createElement('p');
        cap.className = 'srctag';
        cap.innerHTML = esc(A.provision_note || '') +
          ' Christian school enrollments per 1,000 divides enrollments at Christian schools in the market area ' +
          'by the resident population aged five through seventeen there. It is a rate ' +
          'computed from two counts and is never an index reading. Click any market ' +
          'area to open its page.';
        node.appendChild(cap);
      }).catch(function (e) { fail(node, e); });
  }


  /* ── the head-to-head panel under the compare chart ──────────────────────
     One line chart answered one question and the page stopped there. Three
     more are answerable from series already loaded, and each is a different
     kind of question:

       WHO LEADS WHERE   the same two subjects on all five indices at once,
                         which is where a single headline hides the most
       WHO LED WHEN      a band across the whole series, one stripe per month,
                         coloured by whichever stood higher. Lead changes and
                         the longest unbroken run are counted from it.
       HOW FAR APART     the widest and narrowest the two have ever stood

     Everything is computed from the rank rows. Nothing is typed, nothing is a
     quantity, and nothing here says why. */
  /* ── the verdict, the crossings, and where they are ───────────────────────
     A reader arriving at a comparison wants the answer, not a chart to read.
     This says who is ahead, by how much, for how much of the record, and how
     often the two have swapped — then shows both on a locator so the pair is
     placed before anything else is asked of the eye. */
  function compverdict(host, series, s, S, M, state, GEO) {
    if (!host) { return; }
    if (!series || series.length < 2 || !series[0].points.length ||
        !series[1].points.length) { host.innerHTML = ''; return; }
    var A = series[0], B = series[1];
    var byW = {};
    A.points.forEach(function (q) { byW[q[0]] = [q[1], null]; });
    B.points.forEach(function (q) {
      if (byW[q[0]]) { byW[q[0]][1] = q[1]; }
    });
    var ws = Object.keys(byW).filter(function (w) { return byW[w][1] !== null; }).sort();
    if (!ws.length) { host.innerHTML = ''; return; }

    /* On a standing, a smaller number is better; on a ratio, a larger one is.
       One comparison function, so the verdict cannot be backwards on one view
       and right on the other. */
    var lowerWins = state.mode === 'rank';
    function aAhead(w) {
      var v = byW[w];
      return lowerWins ? v[0] < v[1] : v[0] > v[1];
    }
    var lead = 0, crossings = [], prev = null;
    ws.forEach(function (w) {
      var cur = aAhead(w);
      if (cur) { lead++; }
      if (prev !== null && cur !== prev) { crossings.push(w); }
      prev = cur;
    });
    var last = ws[ws.length - 1], lv = byW[last];
    var gap = Math.abs(lv[0] - lv[1]);
    var winner = aAhead(last) ? A.name : B.name;
    var loser = aAhead(last) ? B.name : A.name;
    var pct = Math.round(lead / ws.length * 100);

    var verdict = '<b>' + esc(winner) + '</b> stands ahead of ' + esc(loser) +
      ' in ' + wname(last) + (state.mode === 'rank'
        ? ', by ' + spell(gap) + ' ' + (gap === 1 ? 'place' : 'places') + '.'
        : ', at ' + lv[aAhead(last) ? 0 : 1].toFixed(2) + '× the median against ' +
          lv[aAhead(last) ? 1 : 0].toFixed(2) + '×.');
    var history = ' Across the ' + ws.length + ' months both have been measured, ' +
      esc(A.name) + ' has been the higher of the two in ' + lead + ' of them, ' +
      pct + ' percent.';
    var cross = crossings.length
      ? ' They have traded places ' + spell(crossings.length) + ' ' +
        (crossings.length === 1 ? 'time' : 'times') + ', most recently in ' +
        wname(crossings[crossings.length - 1]) + '.'
      : ' They have never traded places in the whole record.';

    /* Two locators, each picked out in its own standing's color, so the pair is
       placed on the country before a reader is asked to read a line. */
    function locator(nm) {
      if (!GEO || nm.slice(0, 7) === 'region:' || nm === '*median') { return ''; }
      var j = s.states.indexOf(nm);
      var r = j < 0 ? null : (s.rank[last] || [])[j];
      var of = (s.rank[last] || []).filter(function (x) { return x; }).length || 50;
      var c = r ? RAMP[Math.min(RAMP.length - 1,
        Math.floor((r - 1) / of * RAMP.length))] : '#d8d8d8';
      var out = ['<figure class="cmploc"><svg viewBox="' + GEO.viewBox + '" role="img" ' +
        'aria-label="' + esc(nm) + ' within the United States">'];
      Object.keys(GEO.paths).forEach(function (n) {
        if (n === nm) { return; }
        out.push('<path d="' + GEO.paths[n] + '" fill="#eceef1" stroke="#fff" ' +
          'stroke-width="1"/>');
      });
      if (GEO.paths[nm]) {
        out.push('<path d="' + GEO.paths[nm] + '" fill="' + c + '" stroke="#fff" ' +
          'stroke-width="1"/>');
      }
      var reg = (M.states.filter(function (x) { return x.s === nm; })[0] || {}).region || '';
      return out.join('') + '</svg><figcaption><b>' + esc(nm) + '</b>' +
        (r ? ' &middot; ' + ordinal(r) + ' of ' + of : '') +
        (reg ? '<span>' + esc(reg) + '</span>' : '') + '</figcaption></figure>';
    }

    host.innerHTML =
      '<div class="cmpverdict"><p class="cmpsay">' + verdict + history + cross + '</p>' +
      '<div class="cmplocs">' + locator(A.name) + locator(B.name) + '</div></div>';
  }

  function comphead(host, series, s, S, M, state) {
    if (!host) { return; }
    if (!series || series.length < 2) { host.innerHTML = ''; return; }
    var KEYS = ['master', 'preschool', 'elementary', 'middle', 'highschool'];
    /* The compare chart loads one index at a time, so four of the five rows
       had nothing to draw from and silently rendered as nothing. The panel
       fetches whatever is missing once, then draws. */
    var need = KEYS.filter(function (k) { return !S[k]; });
    if (need.length) {
      Promise.all(need.map(function (k) {
        return get('data/series/' + k + '.json').then(function (d) { S[k] = d; });
      })).then(function () { comphead(host, series, s, S, M, state); },
        function () { comphead2(host, series, s, S, M, state); });
      return;
    }
    comphead2(host, series, s, S, M, state);
  }

  function comphead2(host, series, s, S, M, state) {
    var A = series[0], B = series[1];
    var KEYS = ['master', 'preschool', 'elementary', 'middle', 'highschool'];
    var w = s.windows[s.windows.length - 1];
    var rowsHtml = KEYS.map(function (k) {
      var sk = S[k];
      if (!sk) { return ''; }
      function standing(nm) {
        if (nm.slice(0, 7) === 'region:') {
          var reg = nm.slice(7);
          var mem = (M.regions.filter(function (r) { return r.name === reg; })[0] || {}).members || [];
          var vs = mem.map(function (g) { return (sk.rank[w] || [])[sk.states.indexOf(g)]; })
            .filter(function (x) { return x; }).sort(function (p, q2) { return p - q2; });
          return vs.length ? vs[Math.floor(vs.length / 2)] : null;
        }
        var j = sk.states.indexOf(nm);
        return j < 0 ? null : (sk.rank[w] || [])[j];
      }
      var ra = standing(A.name), rb = standing(B.name);
      if (!ra || !rb) { return ''; }
      var of = (sk.rank[w] || []).filter(function (x) { return x; }).length || 50;
      function pos(r) { return (1 - (r - 1) / (of - 1)) * 100; }
      var lo = Math.min(pos(ra), pos(rb)), hi = Math.max(pos(ra), pos(rb));
      return '<div class="h2hrow">' +
        '<div class="h2hname">' + esc(sk.name || k) + '</div>' +
        '<div class="h2htrack">' +
          '<span class="h2hspan" style="left:' + lo.toFixed(1) + '%;width:' +
            Math.max(0.6, hi - lo).toFixed(1) + '%"></span>' +
          '<span class="h2hdot a" style="left:' + pos(ra).toFixed(1) + '%" title="' +
            esc(A.name) + ': ' + ordinal(ra) + '"></span>' +
          '<span class="h2hdot b" style="left:' + pos(rb).toFixed(1) + '%" title="' +
            esc(B.name) + ': ' + ordinal(rb) + '"></span>' +
        '</div>' +
        '<div class="h2hval"><b>' + ordinal(ra) + '</b> / ' + ordinal(rb) + '</div>' +
      '</div>';
    }).join('');

    /* Who led when, month by month, and what that adds up to. */
    var pa = {}, pb = {};
    (A.points || []).forEach(function (p) { pa[p[0]] = p[1]; });
    (B.points || []).forEach(function (p) { pb[p[0]] = p[1]; });
    var wins = s.windows.filter(function (x) {
      return pa[x] !== undefined && pb[x] !== undefined;
    });
    var lead = null, flips = 0, run = 0, best = 0, bestWho = null;
    var aWins = 0, bWins = 0, widest = null, closest = null;
    var strip = wins.map(function (x) {
      /* Lower rank number is the stronger position; in the ratio view the
         larger number is. The chart's own mode decides which. */
      var better = state.mode === 'rank'
        ? (pa[x] < pb[x] ? 'a' : (pb[x] < pa[x] ? 'b' : null))
        : (pa[x] > pb[x] ? 'a' : (pb[x] > pa[x] ? 'b' : null));
      if (better === 'a') { aWins++; } else if (better === 'b') { bWins++; }
      if (better && lead && better !== lead) { flips++; run = 0; }
      if (better) {
        if (better === lead) { run++; } else { run = 1; lead = better; }
        if (run > best) { best = run; bestWho = better; }
      }
      var gap = Math.abs(pa[x] - pb[x]);
      if (widest === null || gap > widest[1]) { widest = [x, gap]; }
      if (closest === null || gap < closest[1]) { closest = [x, gap]; }
      return '<i class="' + (better || 'tie') + '" title="' + esc(wname(x)) + ': ' +
        (better === 'a' ? esc(A.name) : better === 'b' ? esc(B.name) : 'level') +
        '"></i>';
    }).join('');

    var unit = state.mode === 'rank' ? ' places' : '&times;';
    host.innerHTML =
      '<div class="h2h">' +
      '<h3 class="h2htitle">All five indices, ' + esc(wname(w)) + '</h3>' +
      '<div class="h2hlegend"><span><i class="a"></i>' + esc(A.name) + '</span>' +
        '<span><i class="b"></i>' + esc(B.name) + '</span>' +
        '<span class="ends">weaker &rarr; stronger</span></div>' +
      rowsHtml +
      '<h3 class="h2htitle">Who stood higher, every month since ' +
        esc(wname(wins[0] || '')) + '</h3>' +
      '<div class="h2hstrip">' + strip + '</div>' +
      '<div class="h2hstats">' +
        '<div><b>' + aWins + '</b><span>months ' + esc(A.name) + ' stood higher</span></div>' +
        '<div><b>' + bWins + '</b><span>months ' + esc(B.name) + ' stood higher</span></div>' +
        '<div><b>' + flips + '</b><span>times the lead changed hands</span></div>' +
        '<div><b>' + best + '</b><span>longest unbroken run, by ' +
          esc(bestWho === 'a' ? A.name : bestWho === 'b' ? B.name : '—') + '</span></div>' +
      '</div>' +
      '<p class="srctag">Each stripe is one month. Widest apart in ' +
        esc(wname(widest ? widest[0] : '')) + ', at ' +
        (widest ? (state.mode === 'rank' ? Math.round(widest[1]) + unit
          : widest[1].toFixed(2) + unit) : '—') + '; closest in ' +
        esc(wname(closest ? closest[0] : '')) + '. A standing is a position among the ' +
        'states measured in the same month. Which of two subjects stood higher is itself ' +
        'a comparison of positions, never of quantities, and the Institute reports the ' +
        'movement without explaining it.</p>' +
      '</div>';
  }


  /* ── the median chart, on the methodology page ───────────────────────────
     The page has always said the median state does not read 100. That is a
     sentence a reader has to take on trust, and it is the most misunderstood
     thing about the series — "the median is 100" is the first thing anybody
     assumes about an index built this way, and it is false.

     So the assertion is drawn. Every month, every index, the median state's
     actual reading, with 100 marked. A reader can see for themselves that the
     line crosses 100 rather than sitting on it. */
  function medianchart(node) {
    get('data/medians.json').then(function (D) {
      var KEYS = ['master', 'preschool', 'elementary', 'middle', 'highschool'];
      var pick = document.createElement('div');
      pick.className = 'idxpick onlight';
      var plot = document.createElement('div');
      var stat = document.createElement('div');
      stat.className = 'statgrid';
      var cap = document.createElement('p');
      cap.className = 'srctag';
      node.appendChild(pick); node.appendChild(stat);
      node.appendChild(plot); node.appendChild(cap);

      var cur = 'master';
      function draw() {
        var d = D.indices[cur];
        if (!d) { return; }
        /* Drawn here rather than through valueline, which thins to year ends
           and has no rule: the whole point is every month, and the 100 line. */
        var W = 760, H = 250, ml = 44, mr = 16, mt = 14, mb = 26;
        var vs = d.points.map(function (p) { return p[1]; });
        var lo = Math.min(100, Math.min.apply(null, vs));
        var hi = Math.max(100, Math.max.apply(null, vs));
        var pad = (hi - lo) * 0.08;
        lo -= pad; hi += pad;
        function X(i) { return ml + i / (d.points.length - 1) * (W - ml - mr); }
        function Y(v) { return mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb); }
        var path = d.points.map(function (p, i) {
          return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[1]).toFixed(1);
        }).join('');
        var y100 = Y(100);
        var ticks = [lo + (hi - lo) * 0.02, 100, hi - (hi - lo) * 0.02];
        var yrs = d.points.map(function (p, i) { return [p[0], i]; })
          .filter(function (x) { return x[0].slice(5) === '01' &&
            parseInt(x[0].slice(0, 4), 10) % 5 === 0; });
        plot.innerHTML =
          '<svg class="medchart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" ' +
          'role="img" aria-label="The median state reading, every month">' +
          yrs.map(function (t) {
            return '<line x1="' + X(t[1]).toFixed(1) + '" x2="' + X(t[1]).toFixed(1) +
              '" y1="' + mt + '" y2="' + (H - mb) + '" stroke="#eceef1"/>' +
              '<text x="' + X(t[1]).toFixed(1) + '" y="' + (H - 8) +
              '" class="ax" text-anchor="middle">' + t[0].slice(0, 4) + '</text>';
          }).join('') +
          '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y100.toFixed(1) +
            '" y2="' + y100.toFixed(1) + '" stroke="#9B1B30" stroke-dasharray="4 3"/>' +
          '<text x="' + (ml - 6) + '" y="' + (y100 + 4).toFixed(1) +
            '" class="ax hi" text-anchor="end">100</text>' +
          ticks.filter(function (t) { return Math.abs(t - 100) > (hi - lo) * 0.06; })
            .map(function (t) {
              return '<text x="' + (ml - 6) + '" y="' + (Y(t) + 4).toFixed(1) +
                '" class="ax" text-anchor="end">' + Math.round(t) + '</text>';
            }).join('') +
          '<path d="' + path + '" fill="none" stroke="#1a3a5c" stroke-width="1.6"/>' +
          '</svg>';
        stat.innerHTML = [
          ['Lowest', d.min, 'the median state at its weakest reading'],
          ['Highest', d.max, 'the median state at its strongest reading'],
          ['Months measured', d.n, 'every month the index is computed for'],
          ['Months it reads exactly 100', d.exactly_100,
            d.exactly_100 === 0 ? 'not once in the whole record' : 'out of ' + d.n]
        ].map(function (c) {
          return '<div><div class="k">' + esc(c[0]) + '</div><div class="v">' +
            c[1] + '</div><div class="s">' + esc(c[2]) + '</div></div>';
        }).join('');
        cap.innerHTML = esc(D.note) + ' Shown here for the ' + esc(d.name) +
          ' Index across all ' + d.n + ' months it is computed for. The horizontal ' +
          'rule is 100.' +
          '<br><br><strong>How not to read this line.</strong> Its shape is a property ' +
          'of how the scale is built, not a measurement of the country. The level of ' +
          'the median carries no unit and is not comparable between months, so a rise ' +
          'in this line is not growth in attention, in enrollments, or in anything ' +
          'else, and the Institute publishes no such claim. The line is here for one ' +
          'purpose: to show that the median is not fixed at 100, which is why a ' +
          'reading of 50 is never &ldquo;half the median&rdquo; and why every figure ' +
          'the Institute publishes about a single state is given as a position or as ' +
          'a ratio to the median state in the same month.';
      }
      pick.innerHTML = KEYS.filter(function (k) { return D.indices[k]; })
        .map(function (k) {
          return '<button type="button" data-k="' + k + '"' +
            (k === 'master' ? ' class="on"' : '') + '>' +
            esc(D.indices[k].name) + '</button>';
        }).join('');
      pick.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          pick.querySelectorAll('button').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on');
          cur = b.getAttribute('data-k');
          draw();
        });
      });
      draw();
    }).catch(function (e) { fail(node, e); });
  }


  /* ── the market-area time-lapse ──────────────────────────────────────────
     The same transport as the national time-lapse, over the 262 market areas.

     ONE HONEST DIFFICULTY, AND HOW IT IS HANDLED. Attention is measured for a
     STATE. An attention time-lapse over market areas would therefore shade
     every market area in one state identically and nothing inside a state
     would ever move — true, and dull, and it would invite a reader to believe
     the Institute measures attention market by market, which it does not.

     So the default layer is the comparison that does vary market by market and
     does move month to month: each state's attention standing set against each
     market area's own provision standing, both as positions on one 0-to-100
     scale. The plain attention layer is still offered, and the caption says
     plainly what each one is showing. Both carry the index picker. */
  function markettimelapse(node) {
    var key = 'master', layer = 'gap';
    var stage = document.createElement('div');
    stage.className = 'stage';
    var tools = document.createElement('div');
    tools.className = 'tools';
    tools.innerHTML =
      '<label>Layer <select data-f="layer">' +
      '<option value="gap">Attention against Schools &mdash; every market area moves</option>' +
      '<option value="att">Attention alone &mdash; the standing of each state</option>' +
      '</select></label>';
    var picker = document.createElement('div');
    picker.className = 'idxpick onlight';
    var bar = document.createElement('div');
    bar.className = 'tl-bar';
    bar.innerHTML =
      '<button class="tl-play" aria-label="Play the time-lapse">&#9654;</button>' +
      '<span class="tl-when"></span>' +
      '<input class="tl-scrub" type="range" min="0" value="0" aria-label="Month">' +
      '<select class="tl-speed" aria-label="Speed">' +
      '<option value="300">1&times;</option><option value="150" selected>2&times;</option>' +
      '<option value="75">4&times;</option></select>';
    var legend = document.createElement('div');
    legend.className = 'atlaskey';
    var cap = document.createElement('div');
    cap.className = 'viz-caption';
    [tools, picker, stage, bar, legend, cap].forEach(function (e) { node.appendChild(e); });

    var map = null, S = null, A = null, byId = {}, pPct = {}, i = 0, timer = null;
    var play = bar.querySelector('.tl-play');
    var when = bar.querySelector('.tl-when');
    var scrub = bar.querySelector('.tl-scrub');
    var speed = bar.querySelector('.tl-speed');
    var sel = tools.querySelector('[data-f="layer"]');

    function draw() {
      var w = S.windows[i];
      var ranks = S.rank[w] || [], of = (S.measured && S.measured[w]) || 50;
      var idxOf = {};
      S.states.forEach(function (g, j) { idxOf[g] = j; });
      function rankOf(id) {
        var j = idxOf[(byId[id] || {}).state];
        return j === undefined ? null : ranks[j];
      }
      if (layer === 'gap') {
        map.paint(function (id) {
          var r = rankOf(id);
          if (!r || pPct[id] === undefined) { return '#ececec'; }
          return gapColor((1 - (r - 1) / (of - 1)) * 100 - pPct[id]);
        });
        atlasGapLegend(legend);
        cap.innerHTML = esc(S.title) + ' &middot; ' + esc(wname(w)) +
          ' &middot; each market area&rsquo;s own Schools standing set against the ' +
          'standing of the state it sits in. Red is a market area whose state stands ' +
          'higher on attention than the market area stands on Schools; teal is the ' +
          'reverse. Both are positions, never quantities, and neither is a claim that ' +
          'one produces the other.';
      } else {
        map.paint(function (id) {
          var r = rankOf(id);
          return r ? rankColor(r, of) : '#ececec';
        });
        rampLegend(legend, 'first', 'fiftieth');
        cap.innerHTML = esc(S.title) + ' &middot; ' + esc(wname(w)) +
          ' &middot; rank among the ' + of + ' states measured in this month. ' +
          'Attention is measured for a state, so every market area in one state carries ' +
          'the same shade and nothing inside a state moves.';
      }
      when.textContent = wname(w);
      scrub.value = i;
      map.tip = function (id) {
        var m = byId[id];
        if (!m) { return noReadingTip(id); }
        var r = rankOf(id);
        return '<b>' + esc(m.name) + '</b><br>' +
          (r ? esc(m.state) + ' stands ' + ordinal(r) + ' of ' + of : 'not measured') +
          '<br>' + (m.spk === null || m.spk === undefined ? '' :
            m.spk.toFixed(1) + ' Christian school enrollments per 1,000, ' + ordinal(m.rank) + ' of 262') +
          '<br><span style="opacity:.7">' + wname(w) + '</span>';
      };
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      play.innerHTML = '&#9654;';
      play.setAttribute('aria-label', 'Play the time-lapse');
    }
    function start() {
      stop();
      play.innerHTML = '&#10074;&#10074;';
      play.setAttribute('aria-label', 'Pause the time-lapse');
      timer = setInterval(function () {
        i = (i + 1) % S.windows.length;
        draw();
      }, +speed.value);
    }
    play.addEventListener('click', function () { timer ? stop() : start(); });
    scrub.addEventListener('input', function () { stop(); i = +scrub.value; draw(); });
    speed.addEventListener('change', function () { if (timer) { start(); } });
    sel.addEventListener('change', function () { layer = sel.value; draw(); });

    function load(k) {
      return get('data/series/' + k + '.json').then(function (d) {
        S = d;
        scrub.max = S.windows.length - 1;
        if (i >= S.windows.length) { i = S.windows.length - 1; }
        draw();
      });
    }

    Promise.all([get('data/atlas.json'), get('data/geo/markets.json')])
      .then(function (x) {
        A = x[0];
        A.markets.forEach(function (m) { byId[m.id] = m; });
        learnNames(A.markets);
        var sorted = A.markets.slice().sort(function (a, b) {
          return (a.spk || 0) - (b.spk || 0);
        });
        sorted.forEach(function (m, j) {
          pPct[m.id] = sorted.length > 1 ? j / (sorted.length - 1) * 100 : 50;
        });
        map = USMap(stage, x[1], {
          tip: function (id) { return map.tip ? map.tip(id) : ''; },
          href: function (id) { return BASE + 'markets/' + id + '.html'; }
        });
        return load(key);
      }).then(function () {
        i = S.windows.length - 1;
        draw();
        picker.innerHTML = '';
        [['master', 'Master'], ['preschool', 'Preschool'],
         ['elementary', 'Elementary School'], ['middle', 'Middle School'],
         ['highschool', 'High School']].forEach(function (p) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = p[1];
          if (p[0] === key) { b.className = 'on'; }
          b.addEventListener('click', function () {
            key = p[0];
            Array.prototype.forEach.call(picker.children, function (c) {
              c.className = c === b ? 'on' : '';
            });
            load(key);
          });
          picker.appendChild(b);
        });
      }).catch(function (e) { fail(node, e); });
  }


  /* ── the coverage count ──────────────────────────────────────────────────
     D-036 committed the Institute to publishing this, and it had never been
     published. A constituent that returns a reading in too few states cannot be
     rescaled against the median and contributes nothing to any state; because
     an index is the mean of its constituents, such a term lowers every state by
     the same factor and moves no rank. The count is a fact about the measure,
     not a correction to a figure, and it is drawn as a count — never on an
     index axis. */
  function coverage(node) {
    get('data/coverage.json').then(function (D) {
      var P = D.per_index;
      var keys = ['master', 'preschool', 'elementary', 'middle', 'highschool']
        .filter(function (k) { return P[k]; });
      var mx = 0;
      keys.forEach(function (k) { if (P[k].terms > mx) { mx = P[k].terms; } });
      node.innerHTML = '<div class="covbars">' + keys.map(function (k) {
        var x = P[k];
        var thin = x.carrying / x.terms < 0.8;
        return '<div class="covrow">' +
          '<div class="covname">' + esc(x.name) + '</div>' +
          '<div class="covtrack">' +
            '<span class="covall" style="width:' + (x.terms / mx * 100).toFixed(1) + '%"></span>' +
            '<span class="covlive' + (thin ? ' thin' : '') + '" style="width:' +
              (x.carrying / mx * 100).toFixed(1) + '%"></span>' +
          '</div>' +
          '<div class="covval"><b>' + x.carrying + '</b> of ' + x.terms + '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="covkey"><span><i class="covlive"></i>carried</span>' +
      '<span><i class="covall"></i>in the locked universe</span></div>' +
      '<p class="srctag"><strong>' + D.total_carrying + ' of ' + D.total_terms +
      ' constituents carry.</strong> ' + esc(D.note) +
      (D.below_threshold ? ' ' + esc(D.below_note) : '') +
      ' The universe was locked on ' + esc(D.locked || '') +
      ', and the assessment behind these counts is ' + esc(D.basis || '') + '.</p>';
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the report library ───────────────────────────────────────────────── */
  /* The library was written for thirty-four volumes and rendered all of them
     into the table at once. The archive runs to thousands, so it now filters
     over the data and draws a page at a time: a browser asked to lay out ten
     thousand rows in order to hide most of them is a browser that stops
     answering. Three controls, because a reader arrives knowing one of three
     things — the subject, the format, or the year. */
  function library(node) {
    get('data/reports.json').then(function (D) {
      var all = (D.reports || []).slice();
      var fmts = [], subs = [], yrs = [];
      all.forEach(function (r) {
        if (fmts.indexOf(r.format) < 0) { fmts.push(r.format); }
        if (r.subject && subs.indexOf(r.subject) < 0) { subs.push(r.subject); }
        var y = (r.window || '').slice(0, 4);
        if (y && yrs.indexOf(y) < 0) { yrs.push(y); }
      });
      fmts.sort(); subs.sort();
      yrs.sort().reverse();
      /* Newest first, then subject, so a filtered view reads as a run of
         months rather than as whatever order the directory happened to hold. */
      all.sort(function (a, b) {
        var w = (b.window || '').localeCompare(a.window || '');
        return w || (a.subject || '').localeCompare(b.subject || '') ||
          (a.format || '').localeCompare(b.format || '');
      });

      var opt = function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; };
      node.innerHTML =
        '<div class="tools">' +
        '<input type="text" placeholder="Find a report" aria-label="Find a report">' +
        '<select data-c="sub" aria-label="Subject"><option value="">Every subject</option>' +
        subs.map(opt).join('') + '</select>' +
        '<select data-c="fmt" aria-label="Format"><option value="">Every format</option>' +
        fmts.map(function (f) {
          var nm = (all.filter(function (r) { return r.format === f; })[0] || {}).format_name;
          return '<option value="' + f + '">' + f + (nm ? ' · ' + esc(nm) : '') + '</option>';
        }).join('') + '</select>' +
        '<select data-c="yr" aria-label="Year"><option value="">Every year</option>' +
        yrs.map(opt).join('') + '</select>' +
        '<span class="count"></span></div>' +
        '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th>Format</th><th>Report</th><th>Window</th><th>Released</th>' +
        '<th class="n">Size</th></tr></thead><tbody data-c="rows"></tbody></table></div>' +
        '<p class="more" data-c="more" hidden><button type="button">Show more</button></p>' +
        '<p class="srctag">' + num(D.count) + ' volumes. Every volume is built from ' +
        'current data and put through eight checks before it publishes. ' +
        '<b>Window</b> is the month a volume describes. <b>Released</b> is the day ' +
        'it became available to read, which for everything published before the ' +
        'Institute opened is the opening day itself. A volume describing an ' +
        'earlier month was not available in that month, and this table does not ' +
        'suggest that it was.</p>';

      var q = node.querySelector('input');
      var sub = node.querySelector('[data-c="sub"]');
      var fmt = node.querySelector('[data-c="fmt"]');
      var yr = node.querySelector('[data-c="yr"]');
      var body = node.querySelector('[data-c="rows"]');
      var more = node.querySelector('[data-c="more"]');
      var cnt = node.querySelector('.count');
      var PAGE = 200, shown = 0, hits = [];

      function row(r) {
        return '<tr><td>' + r.format + ' &middot; ' + esc(r.format_name) +
          '</td><td><a href="' + fileURL(r.file) + '">' + esc(r.title) +
          '</a></td><td>' + esc(r.label || '—') + '</td><td>' +
          esc(r.released || r.published || '—') + '</td><td class="n">' +
          r.kb + ' KB</td></tr>';
      }
      function draw(reset) {
        if (reset) { body.innerHTML = ''; shown = 0; }
        var next = hits.slice(shown, shown + PAGE);
        body.insertAdjacentHTML('beforeend', next.map(row).join(''));
        shown += next.length;
        more.hidden = shown >= hits.length;
        cnt.textContent = num(hits.length) + ' of ' + num(all.length) + ' volumes' +
          (shown < hits.length ? ' · showing ' + num(shown) : '');
      }
      function filter() {
        var v = q.value.toLowerCase().trim();
        var s = sub.value, f = fmt.value, y = yr.value;
        hits = all.filter(function (r) {
          if (s && r.subject !== s) { return false; }
          if (f && r.format !== f) { return false; }
          if (y && (r.window || '').slice(0, 4) !== y) { return false; }
          if (!v) { return true; }
          return (r.title + ' ' + r.subject + ' ' + r.label + ' ' +
            r.format_name).toLowerCase().indexOf(v) >= 0;
        });
        draw(true);
      }
      more.querySelector('button').addEventListener('click', function () { draw(false); });
      q.addEventListener('input', filter);
      [sub, fmt, yr].forEach(function (el) { el.addEventListener('change', filter); });
      filter();
    }).catch(function (e) {
      node.innerHTML = '<p class="srctag">The library could not load (' +
        esc(e.message) + ').</p>';
    });
  }

  /* ── one state's own shelf ────────────────────────────────────────────────
     The library holds every volume the Institute has published, which is the
     right place for it and the wrong place to send a reader who wants the
     report for their own state. A reader on the Michigan page has already told
     the site which state they care about; making them go to a national list and
     filter it again is asking them to say it twice.

     Months are laid out as a calendar grid by year rather than as a list,
     because thirty-six links in a column is a wall and twelve across is a year
     a reader can see at a glance. A month that has no volume is drawn in its
     place and greyed, so the gaps in the archive are visible rather than
     silently closed up. */
  /* A published volume may live inside the site or on the archive host. The
     index says which by giving either a relative path or an absolute URL, and
     a link must not prefix the site's base onto an address that already has a
     host in it. */
  function fileURL(f) {
    return /^https?:/i.test(f || '') ? f : BASE + f;
  }

  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function statereports(node) {
    var st = node.getAttribute('data-subject') || '';
    get('data/reports.json').then(function (D) {
      var mine = (D.reports || []).filter(function (r) {
        return r.subject === st && r.format === 'A3' && r.window;
      });
      var other = (D.reports || []).filter(function (r) {
        return r.subject === st && r.format !== 'A3';
      });
      if (!mine.length && !other.length) {
        node.innerHTML = '<p class="srctag">No volume for ' + esc(st) +
          ' has published yet. The <a href="' + BASE + 'reports/index.html">report ' +
          'library</a> lists everything the Institute has released.</p>';
        return;
      }
      var by = {};
      mine.forEach(function (r) {
        var y = r.window.slice(0, 4), m = parseInt(r.window.slice(5, 7), 10) - 1;
        (by[y] = by[y] || {})[m] = r;
      });
      var years = Object.keys(by).sort().reverse();
      var grid = years.map(function (y) {
        var cells = MON3.map(function (nm, i) {
          var r = by[y][i];
          return r
            ? '<a class="on" href="' + fileURL(r.file) + '" title="' +
              esc(r.label) + ' · ' + r.kb + ' KB">' + nm + '</a>'
            : '<span>' + nm + '</span>';
        }).join('');
        return '<div class="yr"><b>' + y + '</b><div class="mons">' + cells +
          '</div></div>';
      }).join('');

      node.innerHTML =
        (grid ? '<div class="shelf">' + grid + '</div>' : '') +
        (other.length
          ? '<p class="findlinks">Also for ' + esc(st) + ': ' +
            other.map(function (r) {
              return '<a href="' + fileURL(r.file) + '">' + esc(r.title) + '</a>';
            }).join(' &middot; ') + '</p>'
          : '') +
        '<p class="srctag">' + mine.length + ' monthly ' +
        (mine.length === 1 ? 'volume' : 'volumes') + ' for ' + esc(st) +
        '. Every one is a PDF built from the same series this page draws. ' +
        'The <a href="' + BASE + 'reports/index.html">report library</a> holds ' +
        'every volume for every state, and the ' +
        '<a href="' + BASE + 'explorer/index.html">data explorer</a> gives the ' +
        'figures as a table and as a CSV.</p>';
    }).catch(function (e) {
      node.innerHTML = '<p class="srctag">The shelf could not load (' +
        esc(e.message) + ').</p>';
    });
  }

  /* ── one index, told three ways ───────────────────────────────────────────
     An index page carried a time-lapse and a table, which shows a reader what
     is true this month and nothing about the twenty-two years behind it. Three
     figures are added here, and each answers a question the table cannot:

       who has held first place, and for how long
       how far apart the fifty states are this month
       which states have moved most in twelve months

     Every one is drawn from the published series. None introduces a quantity,
     and none of them is an index reading: they are positions, and the ratio to
     the median state, which is the one unit-free figure the Institute
     publishes. */
  function indexviz(node) {
    var k = node.getAttribute('data-index') || 'master';
    get('data/series/' + k + '.json').then(function (S) {
      var wins = S.windows, last = wins[wins.length - 1];
      lede(node, S, last);
      leaders(node, S, wins);
      spread(node, S, last);
      movers(node, S, wins, last);
    }).catch(function (e) { fail(node, e); });

    /* The series ships ranks and ratios as arrays parallel to S.states, not as
       maps keyed by state name. Read as a map, the first pass named the array
       index rather than the state, and the page announced that "49" led the
       country. */
    function asMap(S, arr) {
      var o = {};
      (arr || []).forEach(function (v, i) { if (v) { o[S.states[i]] = v; } });
      return o;
    }
    function rankAt(S, w) { return asMap(S, S.rank[w]); }
    function ratioAt(S, w) { return asMap(S, S.ratio[w]); }

    function lede(host, S, w) {
      var r = rankAt(S, w), n = 0;
      Object.keys(r).forEach(function (s) { if (r[s]) { n++; } });
      var el = host.querySelector('[data-c="lede"]');
      if (!el) { return; }
      var first = Object.keys(r).filter(function (s) { return r[s] === 1; })[0];
      var rat = ratioAt(S, w)[first];
      el.innerHTML = '<p class="intro">In ' + esc(wname(w)) + ' this index places ' +
        n + ' states in order, from ' + esc(first || '—') + ' at first' +
        (rat ? ', reading ' + rat.toFixed(2) + ' times the median state' : '') +
        ', to the fiftieth. A position is a standing among the states measured ' +
        'in the same month. It is never a count of schools, children, or ' +
        'enrollments, and a state that holds its position through a month in ' +
        'which the whole country moved has not stood still.</p>';
    }

    /* Who has led. One row a year, the December reading, the state at first
       place named in its own band. Twenty-two years of leadership on one line
       is the fastest way to see whether an index is settled or contested. */
    function leaders(host, S, wins) {
      var el = host.querySelector('[data-c="leaders"]');
      if (!el) { return; }
      /* The frame is the whole record, 2004 to the present, and not this
         index's own span. The four level indices each begin later than the
         Master, and drawing only the years an index covers hides that: the
         Middle School band began at 2005 with nothing to say that 2004 had been
         asked and had no answer. Years before an index's first reading are
         drawn, and named as unmeasured. */
      var lastW = wins[wins.length - 1];
      var decs = [];
      for (var y = 2004; y < +lastW.slice(0, 4); y++) { decs.push(y + '-12'); }
      decs.push(lastW);
      var runs = [];
      decs.forEach(function (w) {
        var r = rankAt(S, w);
        /* A year in which the index measured no state has no leader, and the
           band says so rather than printing a dash that reads like a missing
           name. The four level indices each begin later than the Master, which
           is a fact about what could be measured and not about the country. */
        var top = Object.keys(r).filter(function (s) { return r[s] === 1; })[0] ||
          'Not yet measured';
        var lastRun = runs[runs.length - 1];
        if (lastRun && lastRun.s === top) { lastRun.to = w; lastRun.n++; }
        else { runs.push({ s: top, from: w, to: w, n: 1 }); }
      });
      var total = decs.length;
      el.innerHTML = '<div class="leadbar">' + runs.map(function (r, i) {
        var pct = r.n / total * 100;
        if (r.s === 'Not yet measured') {
          return '<span class="nomeas" style="width:' + pct.toFixed(2) + '%" ' +
            'title="This index measured no state in ' + r.from.slice(0, 4) +
            (r.from === r.to ? '' : '\u2013' + r.to.slice(0, 4)) + '"><span>' +
            (r.n >= 2 ? 'Not yet measured' : '') + '</span></span>';
        }
        return '<a href="' + BASE + 'states/' + slug(r.s) + '.html" ' +
          'style="width:' + pct.toFixed(2) + '%;background:' +
          RAMP[i % RAMP.length] + '" title="' + esc(r.s) + ', ' +
          r.from.slice(0, 4) + (r.from === r.to ? '' : '–' + r.to.slice(0, 4)) +
          '"><span>' + esc(r.n >= 2 ? r.s : '') + '</span></a>';
      }).join('') + '</div>' +
        '<ul class="leadkey">' + runs.map(function (r) {
          return '<li><b>' + esc(r.s) + '</b> ' + r.from.slice(0, 4) +
            (r.from === r.to ? '' : '&ndash;' + r.to.slice(0, 4)) + '</li>';
        }).join('') + '</ul>' +
        '<p class="srctag">First place at the December of every year, and at the ' +
        'present month. A band is a run of consecutive readings, not a ' +
        'continuous tenure: the months between two Decembers are not shown ' +
        'here and are published in full in the series. A hatched band is a year in ' +
        'which this index measured no state at all, which is a statement about ' +
        'what could be measured and never about the country.</p>';
    }

    /* How far apart the states are, this month, on the one unit-free figure
       the Institute publishes: each state against the median state. */
    function spread(host, S, w) {
      var el = host.querySelector('[data-c="spread"]');
      if (!el) { return; }
      var R = ratioAt(S, w), K = rankAt(S, w);
      var rows = Object.keys(R).filter(function (s) { return R[s]; })
        .map(function (s) { return { s: s, v: R[s], r: K[s] }; })
        .sort(function (a, b) { return b.v - a.v; });
      if (!rows.length) { return; }
      var W = 720, H = 132, L = 26, hi = rows[0].v;
      var x = function (v) { return L + Math.log(v / 0.05) / Math.log(hi / 0.05) * (W - L * 2); };
      var dots = rows.map(function (d) {
        /* The transparent stroke is painted, so it counts for hit testing and
           the target is about 14 pixels across while the dot stays at five. */
        return '<circle data-live cx="' + x(d.v).toFixed(1) + '" cy="64" r="5" fill="' +
          rampByRank(d.r, rows.length) + '" opacity=".85" stroke="transparent" ' +
          'stroke-width="8" data-s="' + esc(d.s) + '" data-v="' + d.v.toFixed(2) +
          '" data-r="' + d.r + '"><title>' + esc(d.s) +
          ': ' + d.v.toFixed(2) + '× the median, ' + ordinal(d.r) + ' of ' +
          rows.length + '</title></circle>';
      }).join('');
      var ticks = [0.25, 0.5, 1, 2, 4].filter(function (t) { return t <= hi * 1.05; })
        .map(function (t) {
          return '<line x1="' + x(t).toFixed(1) + '" y1="34" x2="' + x(t).toFixed(1) +
            '" y2="94" stroke="' + (t === 1 ? '#1a1a1a' : '#e2e4e8') +
            '" stroke-width="' + (t === 1 ? 1.4 : 1) + '"/>' +
            '<text x="' + x(t).toFixed(1) + '" y="112" text-anchor="middle" ' +
            'font-size="11" fill="#666">' + (t === 1 ? 'the median state' : t + '×') +
            '</text>';
        }).join('');
      el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="spreadfig" ' +
        'role="img" aria-label="Every state against the median state">' + ticks +
        dots +
        '<text x="' + x(rows[0].v).toFixed(1) + '" y="26" text-anchor="middle" ' +
        'font-size="12" font-weight="600">' + esc(rows[0].s) + '</text>' +
        '<text x="' + x(rows[rows.length - 1].v).toFixed(1) + '" y="26" ' +
        'text-anchor="middle" font-size="12" font-weight="600">' +
        esc(rows[rows.length - 1].s) + '</text></svg>' +
        '<p class="srctag">One dot per state, ' + esc(wname(w)) + ', placed by its ' +
        'reading against the median state on a logarithmic scale. ' +
        esc(rows[0].s) + ' reads ' + rows[0].v.toFixed(2) + ' times the median and ' +
        esc(rows[rows.length - 1].s) + ' reads ' +
        rows[rows.length - 1].v.toFixed(2) + '. The ratio is comparable across ' +
        'months in a way an index level is not, which is why it is the figure ' +
        'published.</p>';

      var n = rows.length;
      liveMarks(el, 'circle[data-live]', function (c) {
        var nm = c.getAttribute('data-s');
        return {
          html: '<b>' + esc(nm) + '</b><br>' + c.getAttribute('data-v') +
            '\u00d7 the median<br><span class="ts">' +
            ordinal(+c.getAttribute('data-r')) + ' of ' + n + '</span>',
          href: BASE + 'states/' + slug(nm) + '.html'
        };
      });
    }

    /* Twelve months of movement, largest first, in both directions. */
    function movers(host, S, wins, w) {
      var el = host.querySelector('[data-c="movers"]');
      if (!el) { return; }
      var i = wins.indexOf(w);
      if (i < 12) { return; }
      var then = wins[i - 12], A = rankAt(S, then), B = rankAt(S, w);
      var rows = Object.keys(B).filter(function (s) { return A[s] && B[s]; })
        .map(function (s) { return { s: s, was: A[s], now: B[s], d: A[s] - B[s] }; })
        .filter(function (r) { return r.d; });
      if (!rows.length) { return; }
      var up = rows.slice().sort(function (a, b) { return b.d - a.d; }).slice(0, 6);
      var dn = rows.slice().sort(function (a, b) { return a.d - b.d; }).slice(0, 6);
      function tbl(list, head) {
        return '<div><h4 class="mvh">' + head + '</h4><table class="data"><thead><tr>' +
          '<th>State</th><th class="n">' + esc(wname(then)) + '</th>' +
          '<th class="n">' + esc(wname(w)) + '</th><th class="n">Places</th>' +
          '</tr></thead><tbody>' + list.map(function (r) {
            return '<tr><td><a href="' + BASE + 'states/' + slug(r.s) +
              '.html">' + esc(r.s) + '</a></td><td class="n">' + ordinal(r.was) +
              '</td><td class="n">' + ordinal(r.now) + '</td><td class="n">' +
              (r.d > 0 ? '+' : '') + r.d + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }
      el.innerHTML = '<div class="movegrid">' + tbl(up, 'Risen furthest') +
        tbl(dn, 'Fallen furthest') + '</div>' +
        '<p class="srctag">A movement is a change of position among the states ' +
        'measured in both months. It is not growth or decline in any quantity, ' +
        'and the Institute reports the movement rather than explaining it.</p>';
    }
  }

  /* Schools per hundred congregations, by market area. Two censuses, five
     years apart, on one geography — which the caption dates, because a reader
     comparing 2020 congregations with 2021-22 schools is entitled to know. */
  function churchratio(node) {
    Promise.all([get('data/congregations.json'), get('data/geo/markets.json')])
      .then(function (x) {
        var C = x[0], geo = x[1];
        var by = {};
        (C.markets || []).forEach(function (m) { by[m.id] = m; });
        var vals = (C.markets || []).map(function (m) { return m.s_per_100c; })
          .filter(function (v) { return v || v === 0; })
          .sort(function (a, b) { return a - b; });
        var cuts = [0.2, 0.4, 0.6, 0.8].map(function (q) {
          return vals[Math.floor(q * (vals.length - 1))];
        });
        var host = document.createElement('div');
        host.className = 'atlasmap';
        node.appendChild(host);
        var map = USMap(host, geo, {
          tip: function (id) {
            var m = by[id];
            if (!m) { return noReadingTip(id); }
            return '<b>' + esc(m.name) + '</b><br>' + m.s_per_100c.toFixed(1) +
              ' schools per 100 congregations<br><span style="opacity:.7">' +
              num(m.schools) + ' Christian schools, ' + num(m.cong) +
              ' congregations</span>';
          },
          href: function (id) { return BASE + 'markets/' + id + '.html'; }
        });
        map.paint(function (id) {
          var m = by[id];
          if (!m || m.s_per_100c === null || m.s_per_100c === undefined) { return '#ececec'; }
          for (var i = 0; i < cuts.length; i++) {
            if (m.s_per_100c <= cuts[i]) { return RAMP[RAMP.length - 1 - i * 2]; }
          }
          return RAMP[0];
        });
        var med = vals[Math.floor(vals.length / 2)];
        var key = document.createElement('div');
        key.innerHTML = '<div class="multkey"><span>most schools</span>' +
          [0, 2, 4, 6, 8].map(function (i) {
            return '<i style="background:' + RAMP[RAMP.length - 1 - i] + '"></i>';
          }).reverse().join('') + '<span>fewest schools</span></div>' +
          '<p class="srctag">The middle market area has ' + med.toFixed(1) +
          ' Christian schools for every hundred Christian congregations. ' +
          'Congregations are from the 2020 U.S. Religion Census; schools are from the ' +
          'federal private school census, 2021&ndash;22 edition. The two were taken in ' +
          'different years and are reported on one geography because every congregation ' +
          'in the file lands in exactly one market area. Neither census explains the ' +
          'other, and this map asserts no relationship between them.</p>';
        node.appendChild(key);
      }).catch(function (e) { fail(node, e); });
  }

  /* ── where the record is watching ─────────────────────────────────────────
     Four steps of recency and an explicit white for "no event recorded". The
     white is the point of the map: it shows the Institute's own reach, and the
     key says in words that white is an absence of reading rather than an
     absence of events. A monitor that draws only what it has found looks
     complete, and this one is not. */
  function policydateline(node) {
    Promise.all([get('data/policy.json'), get('data/geo/states.json')])
      .then(function (x) {
        var P = x[0], geo = x[1];
        var latest = {};
        (P.events || []).forEach(function (e) {
          if (e.scope !== 'state' || !e.status_date || !e.jurisdiction) { return; }
          var j = e.jurisdiction;
          if (!latest[j] || e.status_date > latest[j]) { latest[j] = e.status_date; }
        });
        var today = (P.as_of || new Date().toISOString().slice(0, 10));
        function ageDays(d) {
          return (Date.parse(today) - Date.parse(d)) / 86400000;
        }
        var STEP = [[92, '#2d1437', 'within three months'],
          [366, '#861931', 'within a year'],
          [1096, '#c74a39', 'within three years'],
          [1e9, '#f2b075', 'longer ago']];
        var host = document.createElement('div');
        node.appendChild(host);
        var map = USMap(host, geo, {
          tip: function (n) {
            var d = latest[n];
            return '<b>' + esc(n) + '</b><br>' + (d
              ? 'most recent recorded event ' + esc(d)
              : '<span style="opacity:.75">no event recorded yet</span>');
          },
          href: function (n) { return BASE + 'states/' + slug(n) + '.html'; }
        });
        map.paint(function (n) {
          var d = latest[n];
          if (!d) { return '#ffffff'; }
          var a = ageDays(d);
          for (var i = 0; i < STEP.length; i++) {
            if (a <= STEP[i][0]) { return STEP[i][1]; }
          }
          return STEP[STEP.length - 1][1];
        });
        var have = Object.keys(latest).length;
        var key = document.createElement('div');
        key.innerHTML = '<div class="multkey">' + STEP.map(function (s) {
          return '<i style="background:' + s[1] + '"></i><span style="margin-right:12px">' +
            s[2] + '</span>';
        }).join('') + '<i style="background:#fff;border:1px solid #ccc"></i>' +
          '<span>no event recorded</span></div>' +
          '<p class="srctag">' + have + ' of fifty states carry a dated event in the ' +
          'record as of ' + esc(P.as_of || '') + ', drawn from ' +
          (P.events || []).length + ' events in all. The Policy Monitor is built by ' +
          'reading instruments, not by counting them: an event enters the record when a ' +
          'person has read the instrument and cited it. A white state is a state the ' +
          'Institute has not yet read into the record, and nothing more than that.</p>';
        node.appendChild(key);
      }).catch(function (e) { fail(node, e); });
  }

  /* ── the county carpet ────────────────────────────────────────────────────
     "A group of whole, contiguous counties that never crosses a state line" is
     the rule, and it is a poor thing to read and an easy thing to see. Every
     county in the state, filled by the market area it belongs to, county lines
     drawn inside each area: the rule is visible in one glance, including the
     part that surprises people, which is how large a market area is where the
     children are thin on the ground.

     Color here is identity and not quantity. Nothing on this figure is a
     reading, and the caption says so. */
  /* Ordered so that the first colors used are the furthest apart. Michigan
     takes eight of these, and the first draft put two teals four places apart
     in the list, which read as one market area drawn twice. */
  var CARPET = ['#1a3a5c', '#C0392B', '#1D7E78', '#D08C1B', '#8B5FB5',
    '#6E7B8B', '#4b1535', '#3B72A6', '#8A5206', '#2d6a4f', '#e0798d',
    '#40518a', '#a35c1e', '#0E9C8F', '#7d1f19'];

  function countycarpet(node) {
    var st = node.getAttribute('data-fips') || '';
    var name = node.getAttribute('data-subject') || '';
    if (!st) { return; }
    Promise.all([
      get('data/geo/counties/' + st + '.json'),
      get('data/county_market.json'),
      get('data/market/index.json')
    ]).then(function (x) {
      var geo = x[0], CM = x[1].counties || {}, IX = x[2];
      var MK = {};
      (IX.markets || []).forEach(function (m) { MK[m.id] = m; });
      function mkName(id) { return (MK[id] || {}).name || id; }

      var order = [];
      Object.keys(geo.paths).forEach(function (f) {
        var mid = (CM[f] || [])[0];
        if (mid && order.indexOf(mid) < 0) { order.push(mid); }
      });
      order.sort(function (a, b) {
        return mkName(a).localeCompare(mkName(b));
      });
      var color = {};
      order.forEach(function (mid, i) { color[mid] = CARPET[i % CARPET.length]; });

      /* Every county carries the id of the market area it belongs to, because
         the unit a reader is actually pointing at is the market area and not
         the county. Hovering one county therefore lights the whole area. */
      var paths = Object.keys(geo.paths).map(function (f) {
        var row = CM[f] || [], mid = row[0], cn = row[1] || '';
        return '<path class="cc" d="' + geo.paths[f] + '" fill="' +
          (color[mid] || '#e4e6ea') + '" stroke="#fff" stroke-width="0.8"' +
          (mid ? ' data-mid="' + esc(mid) + '"' : '') +
          ' data-cn="' + esc(cn) + '">' +
          '<title>' + esc(cn) + (mid ? ' \u2014 ' + esc(mkName(mid)) : '') +
          '</title></path>';
      }).join('');

      var vb = (geo.viewBox || '0 0 460 380').split(/\s+/).map(Number);
      node.innerHTML =
        '<div class="carpetwrap"><div class="carpetmap">' +
        '<svg viewBox="' + geo.viewBox + '" ' +
        'width="' + Math.round(420 * (vb[2] / vb[3])) + '" height="420" ' +
        'role="img" aria-label="Counties of ' + esc(name) +
        ', colored by market area">' + paths +
        (geo.outline ? '<path d="' + geo.outline + '" fill="none" ' +
          'stroke="#1a1a1a" stroke-width="1.2" pointer-events="none"/>' : '') +
        '</svg><div class="maptip"></div></div>' +
        '<ul class="carpetkey">' + order.map(function (mid) {
          var m = MK[mid] || {};
          return '<li data-mid="' + esc(mid) + '"><i style="background:' +
            color[mid] + '"></i>' +
            '<a href="' + BASE + 'markets/' + mid + '.html">' +
            esc(mkName(mid)) + '</a>' +
            (m.counties ? '<b>' + m.counties + '</b>' : '') + '</li>';
        }).join('') + '</ul></div>' +
        '<p class="srctag">' + Object.keys(geo.paths).length + ' counties in ' +
        esc(name) + ', grouped into ' + order.length + ' Christian Education ' +
        'Market ' + (order.length === 1 ? 'Area' : 'Areas') + '. Point at any ' +
        'county to pick out the whole market area it belongs to, and click to ' +
        'open that area\u2019s page. Color here names a market area and is not ' +
        'a reading: nothing on this figure is a rank, a rate, or a count. ' +
        'County boundaries from the United States Census Bureau. A market area ' +
        'is always a group of whole counties and never crosses a state line.</p>';

      var map = node.querySelector('.carpetmap');
      var tip = node.querySelector('.maptip');
      var cells = [].slice.call(node.querySelectorAll('path.cc'));
      var rows = [].slice.call(node.querySelectorAll('.carpetkey li'));
      var live = null;

      function light(mid) {
        if (mid === live) { return; }
        live = mid;
        cells.forEach(function (p) {
          p.classList.toggle('on', !!mid && p.getAttribute('data-mid') === mid);
          p.classList.toggle('off', !!mid && p.getAttribute('data-mid') !== mid);
        });
        rows.forEach(function (r) {
          r.classList.toggle('on', !!mid && r.getAttribute('data-mid') === mid);
        });
      }

      map.addEventListener('mousemove', function (e) {
        var t = e.target.closest ? e.target.closest('path.cc') : null;
        var mid = t && t.getAttribute('data-mid');
        if (!t || !mid) { tip.style.display = 'none'; light(null); return; }
        light(mid);
        var m = MK[mid] || {};
        /* The figure itself carries no rate, so the tooltip is where a reader
           is told what the area holds. It stays on the census side of the
           line: counts and a rate among market areas, never an index. */
        tip.innerHTML = '<b>' + esc(mkName(mid)) + '</b><br>' +
          /* The payload already carries the full county name, and it is not
             always "County": Louisiana has parishes, Alaska has boroughs and
             census areas, and Virginia has independent cities. Appending the
             word produced "Kent County County" and would have produced
             "Tangipahoa Parish County". */
          esc(t.getAttribute('data-cn')) +
          (m.counties ? ', 1 of ' + m.counties : '') + '<br>' +
          (m.spk || m.spk === 0
            ? '<span class="ts">' + m.spk.toFixed(1) + ' enrollments per 1,000' +
              (m.rank ? ', ' + ordinal(m.rank) + ' of ' + (IX.count || 262) : '') +
              '</span>'
            : '<span class="ts">not measured</span>');
        tip.style.display = 'block';
        var r = map.getBoundingClientRect();
        var xx = e.clientX - r.left + 14, yy = e.clientY - r.top + 14;
        if (xx + tip.offsetWidth > r.width) {
          xx = e.clientX - r.left - tip.offsetWidth - 8;
        }
        tip.style.left = Math.max(2, xx) + 'px';
        tip.style.top = yy + 'px';
      });
      map.addEventListener('mouseleave', function () {
        tip.style.display = 'none';
        light(null);
      });
      map.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('path.cc') : null;
        var mid = t && t.getAttribute('data-mid');
        if (mid) { location.href = BASE + 'markets/' + mid + '.html'; }
      });
      /* The legend was already the only way in. It now lights the map too, so
         the two halves of the figure answer each other in both directions. */
      rows.forEach(function (r) {
        r.addEventListener('mouseenter', function () {
          light(r.getAttribute('data-mid'));
        });
        r.addEventListener('mouseleave', function () { light(null); });
        /* A keyboard reader gets the same highlight from the link's focus. */
        var a = r.querySelector('a');
        if (a) {
          a.addEventListener('focus', function () { light(r.getAttribute('data-mid')); });
          a.addEventListener('blur', function () { light(null); });
        }
      });
    }).catch(function (e) { fail(node, e); });
  }

  /* ── twenty-two Decembers ─────────────────────────────────────────────────
     A rank line answers "where is this state now" and buries the thing worth
     knowing, which is how little most states move across the whole record. One
     small map a year, the state picked out and shaded by its own position, puts
     twenty-two years in one glance: a state that barely changes color has barely
     changed place, and a reader sees that before reading a word.

     Drawn from the shared symbol definitions already on the page, so twenty-three
     maps cost twenty-three <use> elements each rather than twenty-three copies
     of the country. */
  function stateyears(node) {
    var name = node.getAttribute('data-subject') || '';
    Promise.all([get('data/series/master.json'), get('data/geo/states.json')])
      .then(function (x) {
        var S = x[0], geo = x[1];
        var wins = S.windows;
        var last = wins[wins.length - 1];
        var idx = S.states.indexOf(name);
        if (idx < 0) { node.innerHTML = ''; return; }

        var frames = [];
        for (var y = 2004; y < +last.slice(0, 4); y++) {
          if (S.rank[y + '-12']) { frames.push([y + '-12', String(y)]); }
        }
        frames.push([last, wname(last)]);

        var vb = (geo.viewBox || '0 0 1000 620').split(/\s+/).map(Number);
        var vh = 76, vw = vh * (vb[2] / vb[3]);
        var others = geo.paths ? Object.keys(geo.paths) : [];
        var cells = frames.map(function (f) {
          var w = f[0];
          var rank = (S.rank[w] || [])[idx];
          var of = (S.measured && S.measured[w]) || 50;
          var fill = rank ? rampByRank(rank, of) : '#e8eaee';
          /* The shared definitions are written by sitethumbs.py, whose ids
             carry a "t-" prefix so that a state symbol cannot collide with any
             other id on the page. A reference without the prefix resolves to
             nothing, and the maps drew at their proper size with nothing in
             them. */
          var uses = others.map(function (n) {
            return '<use href="#t-' + slug(n) + '" fill="' +
              (n === name ? fill : '#eceef1') + '"/>';
          }).join('');
          /* An explicit width and height. The grid gave these SVGs width:100%
             and height:auto, and they laid out at zero height: twenty-three
             captions with nothing above them. A drawing carries its own
             intrinsic size and the CSS scales it. */
          return '<figure class="yrcell"><svg viewBox="' + geo.viewBox +
            '" width="' + Math.round(vw) + '" height="' + Math.round(vh) +
            '" aria-hidden="true" preserveAspectRatio="xMidYMid meet">' + uses +
            '</svg><figcaption><b>' + esc(f[1].replace(/^(\w+) /, '')) + '</b>' +
            (rank ? '<span>' + ordinal(rank) + '</span>'
              : '<span class="nm">not measured</span>') +
            '</figcaption></figure>';
        }).join('');

        var first = null, latest = null;
        frames.forEach(function (f) {
          var r = (S.rank[f[0]] || [])[idx];
          if (r) { if (first === null) { first = r; } latest = r; }
        });
        var all = frames.map(function (f) { return (S.rank[f[0]] || [])[idx]; })
          .filter(Boolean);
        var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);

        node.innerHTML = '<div class="yrgrid">' + cells + '</div>' +
          '<div class="multkey"><span>first</span>' +
          RAMP.map(function (c) {
            return '<i style="background:' + c + '"></i>';
          }).join('') + '<span>fiftieth</span></div>' +
          '<p class="srctag">' + esc(name) + ' stood ' + ordinal(first) +
          ' at the first December in the record and ' + ordinal(latest) +
          ' in ' + esc(wname(last)) + '. Across every December since, its ' +
          'position has run between ' + ordinal(lo) + ' and ' + ordinal(hi) +
          ', a span of ' + (hi - lo) + ' ' + (hi - lo === 1 ? 'place' : 'places') +
          '. Spring Vale Master Christian Education Index. A position is a ' +
          'standing among the states measured in the same month; a change in it ' +
          'is a change in standing and never growth or decline in any quantity. ' +
          'The months between two Decembers are published in full in the ' +
          '<a href="' + BASE + 'explorer/index.html">data explorer</a>.</p>';
      }).catch(function (e) { fail(node, e); });
  }

  /* ── the rate map, and the threshold map ──────────────────────────────────
     The atlas shades market areas by rank, which answers "who is ahead". These
     two answer "how much is there" and "where is there almost none", which are
     the questions a reader actually arrives with. Both draw the rate itself,
     which is a count over a denominator and never an index reading, so neither
     may sit on the same axis as a standing. */
  function marketMapBase(node, paint, legend, note) {
    Promise.all([get('data/atlas.json'), get('data/geo/markets.json')])
      .then(function (x) {
        var A = x[0], geo = x[1];
        var byId = {};
        A.markets.forEach(function (m) { byId[m.id] = m; });
        learnNames(A.markets);
        var host = document.createElement('div');
        host.className = 'atlasmap';
        node.appendChild(host);
        var map = USMap(host, geo, {
          tip: function (id) {
            var m = byId[id];
            if (!m) { return noReadingTip(id); }
            return '<b>' + esc(m.name) + '</b><br>' +
              (m.spk === null || m.spk === undefined ? 'not measured'
                : m.spk.toFixed(1) + ' Christian school enrollments per 1,000') +
              '<br><span style="opacity:.7">' + num(m.schools) +
              ' Christian schools</span>';
          },
          href: function (id) { return BASE + 'markets/' + id + '.html'; }
        });
        map.paint(function (id) { return paint(byId[id], A); });
        var key = document.createElement('div');
        key.innerHTML = legend(A) +
          '<p class="srctag">' + note(A) + ' Source: National Center for Education ' +
          'Statistics, Private School Universe Survey, 2021&ndash;22 edition; United ' +
          'States Census Bureau, Population Estimates Program. A rate is a count over ' +
          'a denominator. It is not an index reading, and the two are never mixed.</p>';
        node.appendChild(key);
      }).catch(function (e) { fail(node, e); });
  }

  /* Six quantile steps on the rate, so that the picture is of the distribution
     the country actually has rather than of six equal slices of its range. */
  function marketrate(node) {
    /* The cuts must exist before the first paint. They were computed inside
       the legend callback, which runs after it, so every area fell through to
       the unmeasured gray and the whole map came out blank. The quantiles are
       computed here, from the payload, before anything is drawn. */
    var cuts = null;
    function makeCuts(A) {
      if (cuts) { return cuts; }
      var vals = A.markets.map(function (m) { return m.spk; })
        .filter(function (v) { return v || v === 0; })
        .sort(function (a, b) { return a - b; });
      cuts = [0.2, 0.4, 0.6, 0.8].map(function (q) {
        return vals[Math.floor(q * (vals.length - 1))];
      });
      return cuts;
    }
    marketMapBase(node, function (m, A) {
      if (!m || m.spk === null || m.spk === undefined) { return '#ececec'; }
      var c = makeCuts(A);
      for (var i = 0; i < c.length; i++) {
        if (m.spk <= c[i]) { return RAMP[RAMP.length - 1 - i * 2]; }
      }
      return RAMP[0];
    }, function (A) {
      makeCuts(A);
      var sw = [0, 2, 4, 6, 8].map(function (i) {
        return '<i style="background:' + RAMP[RAMP.length - 1 - i] + '"></i>';
      }).reverse().join('');
      /* The swatches run darkest first, and darker is always more of the
         thing measured. The labels were the other way round, so the key
         said the darkest market areas were the thinnest when the paint
         said they were the densest. */
      return '<div class="multkey"><span>highest fifth</span>' + sw +
        '<span>lowest fifth</span></div>';
    }, function (A) {
      var vals = A.markets.map(function (m) { return m.spk; })
        .filter(function (v) { return v || v === 0; }).sort(function (a, b) { return a - b; });
      var med = vals[Math.floor(vals.length / 2)];
      return 'The map above shades Christian Education Market Areas by their ' +
        'standing, which tells a reader which has relatively higher and lower ' +
        'rankings. This one shades them by the rate itself, which tells a reader ' +
        'how much schooling is actually there. The national rate is 60.0 Christian ' +
        'school enrollments per 1,000 children aged five through seventeen; the ' +
        'darkest areas run several times that, and much of the country runs well ' +
        'below it. The middle market area reads ' + med.toFixed(1) + '.';
    });
  }

  /* Two colors, no ramp. The threshold is a choice, and the caption says so. */
  function marketthin(node) {
    var THIN = 20;
    marketMapBase(node, function (m) {
      if (!m || m.spk === null || m.spk === undefined) { return '#ececec'; }
      return m.spk <= THIN ? '#7d1f19' : '#e8eaee';
    }, function () {
      return '<div class="multkey"><i style="background:#7d1f19"></i>' +
        '<span style="margin-right:14px">20 or fewer per 1,000</span>' +
        '<i style="background:#e8eaee"></i><span>more than 20</span></div>';
    }, function (A) {
      var n = A.markets.filter(function (m) {
        return m.spk !== null && m.spk !== undefined && m.spk <= THIN;
      }).length;
      return n + ' of ' + A.markets.length + ' Christian Education Market Areas are at ' +
        'or below twenty Christian school enrollments per 1,000 children, which is one ' +
        'child in fifty. Twenty is a threshold the Institute chose in order to ask one ' +
        'question plainly, and it is not derived from the data.';
    });
  }

  /* Each small multiple is titled with the state that leads it, read from the
     window payload rather than typed, so that five captions cannot drift from
     the five maps beside them. */
  function multleads(node) {
    get('data/manifest.json').then(function (M) {
      return get('data/window/' + M.window + '.json');
    }).then(function (W) {
      ['master', 'preschool', 'elementary', 'middle', 'highschool'].forEach(function (k) {
        var el = document.querySelector('[data-fill="lead-' + k + '"]');
        var idx = (W.indices || {})[k];
        if (!el || !idx || !idx.rows || !idx.rows.length) { return; }
        var top = idx.rows[0];
        el.textContent = top.s + ' leads \u00b7 ' + idx.measured + ' states measured';
      });
    }).catch(function () { /* the maps stand without their captions */ });
  }

  /* ── the home page's live panels ──────────────────────────────────────── */
  function homefacts(node) {
    Promise.all([get('data/manifest.json'), get('data/window/' + '2026-07' + '.json')])
      .catch(function () { return null; });
    get('data/manifest.json').then(function (M) {
      return Promise.all([M, get('data/window/' + M.window + '.json')]);
    }).then(function (r) {
      var M = r[0], W = r[1];
      var mi = W.indices.master;
      var lead = mi.rows[0];
      var risers = mi.rows.filter(function (x) { return x.move !== null && x.move > 0; })
        .sort(function (a, b) { return b.move - a.move; });
      var top = mi.rows.slice(0, 5).map(function (x) { return x.s; });
      var el = node.querySelector('[data-fill="facts"]');
      if (el) {
        el.innerHTML = [
          ['Month', W.label, 'published ' + W.published],
          ['Series length', M.windows.length + ' months',
            wname(M.first) + ' to ' + wname(M.last)],
          ['Leads the Master Index', lead.s,
            lead.ratio.toFixed(2) + '× the median state'],
          ['Market areas', num(M.markets), 'Christian Education Market Areas']
        ].map(function (c) {
          return '<div><div class="k">' + esc(c[0]) + '</div><div class="v">' +
            esc(c[1]) + '</div><div class="s">' + esc(c[2]) + '</div></div>';
        }).join('');
      }
      var f = node.querySelector('[data-fill="findings"]');
      if (f) {
        var riser = risers[0];
        var cards = [
          ['card featured', 'The Master Index · ' + W.label,
            esc(lead.s) + ' leads the Master Index.',
            esc(lead.s) + ' holds first place on the Spring Vale Master Christian ' +
            'Education Index in ' + esc(W.label) + ', reading ' + lead.ratio.toFixed(2) +
            ' times the median state. The five highest positions are held by ' +
            esc(andlist(top)) + '. A position is a standing against the other ' +
            'forty-nine states and is not a count of schools, children, or enrollments.',
            BASE + 'indices/master.html'],
          ['card', 'Largest rise · twelve months',
            esc(riser ? riser.s : '—') + ' has climbed furthest in a year.',
            riser ? esc(riser.s) + ' stands ' + ordinal(riser.rank) + ' in ' +
              esc(W.label) + ', against ' + ordinal(riser.was) + ' twelve months ' +
              'earlier: a rise of ' + riser.move + ' places. The Institute does not ' +
              'attribute a cause.'
              : 'No twelve-month comparison is available for this window.',
            riser ? BASE + 'states/' + slug(riser.s) + '.html'
              : BASE + 'indices/master.html'],
          ['card', 'Coverage · ' + W.label,
            'Fifty states, ' + num(M.markets) + ' market areas, ' +
            M.windows.length + ' months.',
            'Every index is computed for all fifty states in every month from ' +
            wname(M.first) + ' onward, against one locked constituent list. ' +
            'The school census is counted separately from the federal private school census ' +
            'and is never mixed into an index reading.',
            /* The TOP of the methodology page, not the #coverage section part
               way down it. Reported three times: following this card dropped a
               reader into the middle of a long document with no idea what they
               had landed in. A fragment is the right target when a reader has
               asked for a section and the wrong one when they have followed a
               summary card into a document they have not read. */
            BASE + 'methodology/index.html']
        ];
        f.innerHTML = cards.map(function (c) {
          return '<a class="' + c[0] + '" href="' + c[4] + '"><div class="ck">' + c[1] +
            '</div><h4>' + c[2] + '</h4><p>' + c[3] +
            '</p><span class="read-more">Read more &rarr;</span></a>';
        }).join('');
      }
    }).catch(function (e) {
      var el = node.querySelector('[data-fill="facts"]');
      if (el) { el.innerHTML = '<div><div class="s">Live figures unavailable (' +
        esc(e.message) + ').</div></div>'; }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE TEN FEATURES

     Everything below draws from the same payloads the rest of the site draws
     from, so no figure here can disagree with a figure on a report. Nothing
     here exposes a constituent, a term, or a provider: D-018 is a boundary the
     data crosses before it reaches the browser, and there is nothing in these
     payloads to leak.
     ══════════════════════════════════════════════════════════════════════ */

  /* ── shared: a windowed control used by Compare, the explorer and the
        time machine. One slider, one label, one change event. ─────────────── */
  /* Every scrubbable map carries the same transport: play, a scrubber, a
     month label, and a speed dial. The dial was on the two time-lapses and not
     on the atlases, so the same control did different things on different
     pages. One slider, one set of speeds, everywhere. */
  function windowSlider(host, windows, at, onchange) {
    var i = at === undefined ? windows.length - 1 : at;
    host.innerHTML =
      '<div class="wslider"><button class="wplay" aria-label="Play">&#9654;</button>' +
      '<input type="range" min="0" max="' + (windows.length - 1) + '" value="' + i +
      '" aria-label="Month"><output class="wlab"></output>' +
      '<select class="tl-speed" aria-label="Speed">' +
      '<option value="300">1&times;</option>' +
      '<option value="150" selected>2&times;</option>' +
      '<option value="75">4&times;</option></select></div>';
    var play = host.querySelector('.wplay'),
      sl = host.querySelector('input'), lab = host.querySelector('.wlab'),
      spd = host.querySelector('.tl-speed'), timer = null;
    function fire() { lab.textContent = wname(windows[i]); onchange(windows[i], i); }
    function stop() { clearInterval(timer); timer = null; play.innerHTML = '&#9654;'; }
    function start() {
      stop();
      play.innerHTML = '&#10074;&#10074;';
      timer = setInterval(function () {
        i = (i + 1) % windows.length; sl.value = i; fire();
      }, +spd.value);
    }
    play.addEventListener('click', function () { timer ? stop() : start(); });
    spd.addEventListener('change', function () { if (timer) { start(); } });
    sl.addEventListener('input', function () { stop(); i = +sl.value; fire(); });
    fire();
    return { set: function (k) { i = k; sl.value = k; fire(); }, stop: stop };
  }

  /* ── 1. COMPARE ──────────────────────────────────────────────────────────
     Any two states, a state against its Region, or a state against the median,
     on one chart across every window. The view is written into the URL, so a
     link reproduces exactly what the sender was looking at. */
  function compare(node) {
    var M, S = {}, GEO = null;
    var state = { a: 'Michigan', b: 'Texas', k: 'master', mode: 'rank' };
    var q = new URLSearchParams(location.search);
    ['a', 'b', 'k', 'mode'].forEach(function (f) { if (q.get(f)) { state[f] = q.get(f); } });

    node.innerHTML =
      '<div class="tools cmp">' +
      '<label>First <select data-f="a"></select></label>' +
      '<label>Second <select data-f="b"></select></label>' +
      '<label>Index <select data-f="k"></select></label>' +
      '<label>Show <select data-f="mode">' +
      '<option value="rank">Standing, first to fiftieth</option>' +
      '<option value="ratio">Ratio to the median state</option>' +
      '</select></label>' +
      '<button class="linkbtn" type="button">Copy link to this view</button>' +
      '</div><div data-c="verdict"></div>' +
      '<div class="chartcard"><div data-c="plot"></div>' +
      '<p class="srctag" data-c="cap"></p></div>' +
      '<div data-c="head"></div>' +
      '<div data-c="tbl"></div>';

    function opts(sel, list, val) {
      sel.innerHTML = list.map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') +
          '>' + esc(o[1]) + '</option>';
      }).join('');
    }
    function sel(f) { return node.querySelector('[data-f="' + f + '"]'); }

    function draw() {
      var s = S[state.k];
      if (!s) { return; }
      var names = [state.a, state.b].filter(Boolean);
      var series = names.map(function (nm) {
        var pts = [];
        if (nm.slice(0, 7) === 'region:') {
          var reg = nm.slice(7);
          var mem = (M.regions.filter(function (r) { return r.name === reg; })[0] || {}).members || [];
          var idx = mem.map(function (g) { return s.states.indexOf(g); })
            .filter(function (i) { return i >= 0; });
          s.windows.forEach(function (w) {
            var row = s[state.mode][w] || [], v = idx.map(function (i) { return row[i]; })
              .filter(function (x) { return x !== null && x !== undefined; });
            if (v.length) { v.sort(function (x, y) { return x - y; });
              pts.push([w, v[Math.floor(v.length / 2)]]); }
          });
          return { name: reg, points: pts };
        }
        if (nm === '*median') {
          s.windows.forEach(function (w) {
            var row = (s[state.mode][w] || []).filter(function (x) {
              return x !== null && x !== undefined; });
            if (row.length) { row.sort(function (x, y) { return x - y; });
              pts.push([w, row[Math.floor(row.length / 2)]]); }
          });
          return { name: 'The median state', points: pts };
        }
        var j = s.states.indexOf(nm);
        if (j < 0) { return { name: nm, points: [] }; }
        s.windows.forEach(function (w) {
          var v = (s[state.mode][w] || [])[j];
          if (v !== null && v !== undefined) { pts.push([w, v]); }
        });
        return { name: nm, points: pts };
      });
      var plot = node.querySelector('[data-c="plot"]');
      if (state.mode === 'rank') {
        rankline(plot, series, { height: 300 });
      } else {
        valueline(plot, series, { height: 300, unit: '× the median' });
      }
      /* Two states are not always measured in the same months. Where one is
         measured in only part of the span its readings are marked and its line
         breaks, and the caption has to say so rather than leave a reader to
         read a short line as a decline. */
      var thin = series.filter(function (x) {
        return x.points.length && x.points.length < s.windows.length * 0.9;
      });
      var note = '';
      if (thin.length) {
        note = ' ' + thin.map(function (x) {
          return esc(x.name) + ' is measured in ' + x.points.length + ' of the ' +
            s.windows.length + ' months in the record, from ' +
            wname(x.points[0][0]) + ' to ' + wname(x.points[x.points.length - 1][0]);
        }).join('; ') + '. Its readings are marked, and its line breaks where the ' +
        'index does not measure it. A break is an absence of measurement and is ' +
        'never a reading of zero.';
      }
      node.querySelector('[data-c="cap"]').textContent =
        (state.mode === 'rank'
          ? 'Standing among the fifty states on the ' + idxName(state.k) +
            ' Index, every year end from ' + s.windows[0].slice(0, 4) + '. First is the top.'
          : 'Each series against the median state on the ' + idxName(state.k) +
            ' Index. The median line sits at one, and a value of two is twice the median.') +
        ' A movement is a change in standing rather than growth or decline in any quantity.' +
        note;
      comptable(node.querySelector('[data-c="tbl"]'), series, s);
      comphead(node.querySelector('[data-c="head"]'), series, s, S, M, state);
      compverdict(node.querySelector('[data-c="verdict"]'), series, s, S, M, state, GEO);
      var u = new URL(location.href);
      ['a', 'b', 'k', 'mode'].forEach(function (f) { u.searchParams.set(f, state[f]); });
      history.replaceState(null, '', u);
    }

    function comptable(host, series, s) {
      var yrs = [];
      s.windows.forEach(function (w) {
        if (w.slice(5) === '12' || w === s.windows[s.windows.length - 1]) { yrs.push(w); }
      });
      yrs = yrs.slice(-12);
      host.innerHTML = '<details class="tv"><summary>The same figures as a table</summary>' +
        '<div class="tablewrap"><table class="data"><thead><tr><th>Window</th>' +
        series.map(function (x) { return '<th class="n">' + esc(x.name) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + yrs.map(function (w) {
          return '<tr><td>' + wname(w) + '</td>' + series.map(function (x) {
            var p = x.points.filter(function (q) { return q[0] === w; })[0];
            return '<td class="n">' + (p ? (state.mode === 'rank' ? ordinal(p[1])
              : p[1].toFixed(2) + '×') : '—') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></details>';
    }

    function idxName(k) {
      var f = M.indices.filter(function (x) { return x.key === k; })[0];
      return f ? f.name : k;
    }

    get('data/manifest.json').then(function (m) {
      M = m;
      var states = M.states.map(function (x) { return [x.s, x.s]; });
      var choices = states
        .concat([['*median', '— The median state —']])
        .concat(M.regions.map(function (r) { return ['region:' + r.name, '— ' + r.name + ' —']; }));
      opts(sel('a'), choices, state.a);
      opts(sel('b'), [['', '— none —']].concat(choices), state.b);
      opts(sel('k'), M.indices.map(function (x) { return [x.key, x.name]; }), state.k);
      sel('mode').value = state.mode;
      ['a', 'b', 'k', 'mode'].forEach(function (f) {
        sel(f).addEventListener('change', function () {
          state[f] = sel(f).value;
          if (f === 'k') { load().then(draw); } else { draw(); }
        });
      });
      node.querySelector('.linkbtn').addEventListener('click', function (e) {
        copy(location.href, e.target);
      });
      return load();
    }).then(draw).then(function () {
      /* The locators arrive after the first paint: the verdict and the chart
         are what a reader came for, and neither should wait on geometry. */
      return get('data/geo/states.json').then(function (g) { GEO = g; draw(); })
        .catch(function () { /* the verdict stands without the maps */ });
    }).catch(function (e) { fail(node, e); });

    function load() {
      if (S[state.k]) { return Promise.resolve(); }
      return get('data/series/' + state.k + '.json').then(function (s) { S[state.k] = s; });
    }
  }

  /* A line chart for quantities rather than ranks: the ratio view needs one,
     and rankline inverts its axis because first is the top. */
  function valueline(host, seriesList, opts) {
    opts = opts || {};
    var W = 700, H = opts.height || 260, ml = 46, mr = 132, mt = 16, mb = 28;
    var list = seriesList.map(function (s) {
      return { name: s.name, points: s.points || [], by: byWindow(s.points || []) };
    }).filter(function (s) { return s.points.length; });
    if (!list.length) { host.innerHTML = ''; return; }
    var wins = axis(list, opts.raw);
    var n = wins.length;
    if (!n) { host.innerHTML = ''; return; }
    var all = [];
    list.forEach(function (s) {
      wins.forEach(function (w) {
        var v = s.by[w];
        if (v !== null && v !== undefined) { all.push(v); }
      });
    });
    if (!all.length) { host.innerHTML = ''; return; }
    var hi = Math.max.apply(null, all) * 1.06, lo = 0;
    /* Spaced by date, so a series measured in fewer windows is shorter rather
       than squeezed into the left of somebody else's axis. */
    var t0 = mrun(wins[0]), t1 = mrun(wins[n - 1]), span = Math.max(1, t1 - t0);
    function at(w) { return ml + (mrun(w) - t0) / span * (W - ml - mr); }
    function X(i) { return at(wins[i]); }
    function Y(v) { return H - mb - (v - lo) / (hi - lo) * (H - mt - mb); }
    /* Eight, not five. A chart with seven series was wrapping the palette,
       so Wyoming and Rhode Island came out the same navy and Alabama and
       Vermont the same crimson — two pairs a reader would read as one line
       each. Eight covers every series count this site draws. */
    var COL = ['#1a3a5c', '#9B1B30', '#1D7E78', '#c7791f', '#5c4a8a',
               '#6f9fc4', '#6b7a3a', '#7a4a2a'];
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img">'];
    [0, hi / 2, hi].forEach(function (v) {
      out.push('<line x1="' + ml + '" y1="' + Y(v).toFixed(1) + '" x2="' + (W - mr) +
        '" y2="' + Y(v).toFixed(1) + '" stroke="#ececec"/>' +
        '<text x="' + (ml - 7) + '" y="' + (Y(v) + 4).toFixed(1) +
        '" text-anchor="end" font-size="12" fill="#666" font-family="-apple-system,sans-serif">' +
        v.toFixed(1) + '</text>');
    });
    out.push('<line x1="' + ml + '" y1="' + Y(1).toFixed(1) + '" x2="' + (W - mr) +
      '" y2="' + Y(1).toFixed(1) + '" stroke="#999" stroke-dasharray="4 3"/>');
    var lanes = [];
    list.forEach(function (s, j) {
      var R = runs(s.by, wins, at, Y);
      out.push('<path d="' + R.d + '" fill="none" stroke="' + COL[j % COL.length] +
        '" stroke-width="' + (j === 0 ? 2.4 : 1.7) +
        '" stroke-linejoin="round" stroke-linecap="round"/>');
      if (R.drawn.length && R.drawn.length < n * 0.6) {
        out.push(R.drawn.map(function (d) {
          return '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) +
            '" r="2.4" fill="' + COL[j % COL.length] + '"/>';
        }).join(''));
      }
      var last = R.drawn[R.drawn.length - 1];
      if (last) { lanes.push({ j: j, name: s.name, at: last.y, y: last.y, x: last.x }); }
    });
    lanes.sort(function (a, b) { return a.at - b.at; });
    for (var i = 1; i < lanes.length; i++) {
      if (lanes[i].y - lanes[i - 1].y < 15) { lanes[i].y = lanes[i - 1].y + 15; }
    }
    var over = lanes.length ? lanes[lanes.length - 1].y - (H - mb) : 0;
    if (over > 0) { lanes.forEach(function (L) { L.y -= over; }); }
    lanes.forEach(function (L) {
      if (Math.abs(L.y - L.at) > 1.5 || L.x < W - mr - 1) {
        out.push('<path d="M' + L.x.toFixed(1) + ',' + L.at.toFixed(1) + 'L' +
          (W - mr + 4) + ',' + L.y.toFixed(1) + '" fill="none" stroke="' +
          COL[L.j % COL.length] + '" stroke-width=".8" opacity=".55"/>');
      }
      out.push('<text x="' + (W - mr + 8) + '" y="' + (L.y + 4).toFixed(1) +
        '" font-size="12" font-weight="700" fill="' + COL[L.j % COL.length] +
        '" font-family="-apple-system,sans-serif">' + esc(L.name) + '</text>');
    });
    [0, Math.floor(n / 2), n - 1].forEach(function (i) {
      out.push('<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) +
        '" text-anchor="middle" font-size="12" fill="#666" ' +
        'font-family="-apple-system,sans-serif">' + wins[i].slice(0, 4) + '</text>');
    });
    host.innerHTML = out.join('') + '</svg>';
    tabledata(host, wins, list, 'ratio');
  }

  /* ── 2. THE MARKET AREA FINDER ───────────────────────────────────────────
     A ZIP code resolves in this browser against a table shipped with the site.
     Nothing is sent anywhere, which is why the page is allowed to say so. */
  /* ── analytics, and consent ──────────────────────────────────────────────
     Two measurements with two different obligations, so they are treated as
     two different things rather than as one setting.

     Cloudflare Web Analytics sets no cookie, mints no identifier, and sends
     nothing that profiles a person. It needs no permission and runs for
     everybody, so the Institute knows how many people came even when they
     decline everything else.

     Google Analytics sets identifiers and sends them to Google. It runs only
     after a visitor has said yes, and it is never loaded before that. A
     visitor who does nothing has not consented: silence is a no, and the
     script stays off the page.

     The privacy page describes exactly this, and it is generated from the same
     two constants that switch it on. The site cannot describe a collection it
     is not making, or make one it has not described. */
  var CFB = document.documentElement.getAttribute('data-cfbeacon') || '';
  var GA4 = document.documentElement.getAttribute('data-ga4') || '';
  var CKEY = 'svcei-analytics-consent';

  function consentRead() {
    try { return localStorage.getItem(CKEY); } catch (e) { return null; }
  }
  function consentWrite(v) {
    try { localStorage.setItem(CKEY, v); } catch (e) { /* private mode: no memory, ask again */ }
  }

  function loadCloudflare() {
    if (!CFB || document.querySelector('script[data-cf-beacon]')) { return; }
    var t = document.createElement('script');
    t.defer = true;
    t.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    t.setAttribute('data-cf-beacon', JSON.stringify({ token: CFB }));
    document.head.appendChild(t);
  }

  function loadGA4() {
    if (!GA4 || window.__svGA) { return; }
    window.__svGA = true;
    var t = document.createElement('script');
    t.async = true;
    t.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4);
    document.head.appendChild(t);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    /* No ad signals, no personalisation. The Institute wants to know how many
       people read it and where from, not who they are.

       THREE THINGS A READER OF THIS CODE SHOULD KNOW, because each of them is
       a place where the obvious setting does the opposite of what it looks
       like it does:

       `anonymize_ip` USED TO BE HERE AND IS GONE. It is a Universal Analytics
       parameter. GA4 ignores it: an address is used to derive the country,
       state, and city and is then discarded, always, with no way to switch
       that off and no way to switch it on. Leaving the parameter in place
       implied the Institute was exercising a control that does not exist.

       GOOGLE SIGNALS STAYS OFF, and that is what keeps this data GRANULAR
       rather than what limits it. Turning it on hands Google an advertising
       identity for signed-in readers, which the privacy policy forbids, and it
       switches the property into demographic thresholding: below a certain
       number of readers, Google WITHHOLDS rows rather than risk identifying
       somebody. On a property this size that would blank most of the city
       report. Off is both the private choice and the detailed one.

       WHAT GA4 CANNOT TELL THE INSTITUTE AT ALL is the network a reader
       arrived over. The ISP and network-domain dimensions were withdrawn with
       Universal Analytics and have no GA4 equivalent, in the reporting
       interface or in the raw export. That figure comes from our own Worker,
       which is told it with every request, and it is on the Live page. */
    gtag('config', GA4, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      /* Every automatic event Google will collect without being asked twice:
         scroll depth, outbound clicks, site search, file downloads, video, and
         form interactions. The PDF archive is the Institute's main product, so
         file_download is the single most useful of them. */
      send_page_view: true
    });

    /* What the Institute knows about the page that Google does not, sent as
       event parameters so they can be registered as custom dimensions and
       reported on. None of it describes a reader; all of it describes a
       document. */
    var b = document.body || {};
    var d = b.dataset || {};
    var dims = {};
    if (d.window) { dims.svcei_window = d.window; }
    if (d.section) { dims.svcei_section = d.section; }
    if (d.subject) { dims.svcei_subject = d.subject; }
    var path = location.pathname.split('/').filter(Boolean);
    if (path.length) { dims.svcei_area = path[0]; }
    if (Object.keys(dims).length) { gtag('event', 'svcei_page', dims); }
  }

  /* Global Privacy Control. The privacy page states that the Institute honors
     it automatically, without the reader having to write to anyone, so it is
     read here before anything that sets an identifier is loaded. A browser
     sending GPC has already answered the question, and being asked it again on
     every page would be the opposite of honoring it. */
  function gpcOn() {
    try {
      var g = navigator.globalPrivacyControl;
      return g === true || g === 'true' || g === 1;
    } catch (e) { return false; }
  }

  /* Where the law requires the question to be asked before anything is set.
     In the European Economic Area, the United Kingdom, and Switzerland, consent
     must come first, so the reader is asked and nothing loads until they
     answer. In the United States the standard is notice and an opt-out, which
     the privacy policy and the footer link provide, so no reader is stopped at
     the door to be asked a question about measurement.

     The test is the browser's own time zone, which is available immediately and
     costs no request. It is a proxy rather than a location, and it errs the
     safe way: an American traveling in Paris is asked unnecessarily, which
     harms nobody, while the reverse would be the failure that matters. */
  var EU_TZ = /^(Europe\/|Atlantic\/(Canary|Madeira|Azores|Faroe|Reykjavik)|Arctic\/Longyearbyen)/;
  function askFirst() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (EU_TZ.test(tz)) {
        /* Moscow, Istanbul, Minsk, and Kiev carry Europe/ names and are not in
           the Union, but asking them is harmless and guessing wrong is not. */
        return true;
      }
      return false;
    } catch (e) { return true; }               /* unknown: ask */
  }

  function consentBanner(force) {
    if (!GA4) { return; }                       /* nothing to ask about */
    if (!force && gpcOn()) { return; }          /* the browser said no */
    if (!force && consentRead()) { return; }    /* already answered */
    var old = document.querySelector('.consent');
    if (old) { old.remove(); }
    var d = document.createElement('div');
    d.className = 'consent';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Analytics choice');
    var ask = askFirst();
    var off = gpcOn() || consentRead() === 'no';
    d.innerHTML =
      '<div class="consent-in"><p><strong>A choice about measurement.</strong> ' +
      'The Institute counts how many people read each page, using a service ' +
      'that sets no cookie and identifies nobody. That runs either way.</p>' +
      '<p>Separately, the Institute uses Google Analytics, which does set an ' +
      'identifier and does send it to Google. ' +
      (ask
        ? 'That runs only if you say yes here, and you can change your mind at ' +
          'any time from the link in the footer.'
        : 'It is ' + (off ? 'switched off for you' : 'on') +
          ', and this is where you change that. Your answer is remembered in ' +
          'this browser and nowhere else.') +
      '</p>' +
      (gpcOn()
        ? '<p>Your browser is sending a Global Privacy Control signal. The ' +
          'Institute reads that as no, and Google Analytics is switched off ' +
          'for you without your having to do anything further.</p>'
        : '') +
      '<div class="consent-btn">' +
      '<button type="button" data-c="yes">' +
      (ask ? 'Yes, that is fine' : 'Leave it on') + '</button>' +
      '<button type="button" class="sec" data-c="no">' +
      (ask ? 'No thank you' : 'Switch it off') + '</button>' +
      '<a href="' + BASE + 'privacy.html">What is collected</a></div></div>';
    document.body.appendChild(d);
    d.querySelector('[data-c="yes"]').addEventListener('click', function () {
      consentWrite('yes'); loadGA4(); d.remove();
    });
    d.querySelector('[data-c="no"]').addEventListener('click', function () {
      consentWrite('no');
      /* An opt-out has to stop the collection, not merely stop asking. */
      try { window['ga-disable-' + GA4] = true; } catch (e) { /* nothing to do */ }
      d.remove();
    });
  }

  function analytics() {
    loadCloudflare();                       /* no consent needed, no identifier */
    if (gpcOn()) { /* honored automatically: nothing loaded, nothing asked */ }
    else if (consentRead() === 'yes') { loadGA4(); }
    else if (consentRead() === 'no') { /* opted out: nothing loaded */ }
    else if (askFirst()) { consentBanner(false); }
    else { loadGA4(); }   /* notice and opt-out, per the policy and the footer */
    /* The footer link that reopens the choice, which CPRA obliges to exist and
       which a reader ought to have whether it obliges it or not. */
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('[data-a="privacy-choices"]') : null;
      if (!a) { return; }
      e.preventDefault();
      consentBanner(true);
    });
  }

  /* ── the Register forms, submitted without leaving the page ─────────────
     A plain form POST works and sends the reader to the intake provider's own
     thank-you page, which is a stranger's page carrying a stranger's branding
     at the exact moment somebody has just given the Institute twenty minutes
     of their time. So the form posts by fetch and the confirmation is written
     here, in the Institute's own words.

     It degrades honestly: if fetch is unavailable or the request fails, the
     handler stands aside and the browser performs the ordinary POST it would
     have performed anyway. Nothing a person typed is ever lost to a script. */
  /* ── the contact form's four defenses ─────────────────────────────────────
     A honeypot the reader never sees, a stamp recording when the form was
     drawn, an arithmetic question generated here rather than served, and the
     intake provider's own filtering behind all three. No third-party script is
     loaded to do any of it, which is the whole point: a page that promises no
     undeclared trackers cannot import one to prove its readers are human. */
  function contactform(node) {
    var f = node.querySelector('form.contactform');
    if (!f) { return; }
    var drawn = f.querySelector('[name="drawn"]');
    if (drawn) { drawn.value = String(Date.now()); }

    var a = 2 + Math.floor(Math.random() * 8);
    var b = 2 + Math.floor(Math.random() * 8);
    var words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
      'eight', 'nine', 'ten'];
    var q = f.querySelector('[data-c="q"]');
    if (q) {
      q.textContent = 'What is ' + words[a] + ' plus ' + words[b] +
        ' (' + a + ' + ' + b + ')?';
    }

    f.addEventListener('submit', function (e) {
      var bad = [];
      var pot = f.querySelector('[name="_gotcha"]');
      if (pot && pot.value) { bad.push('honeypot'); }
      if (drawn && Date.now() - (+drawn.value || 0) < 4000) {
        bad.push('A message that fast was not typed by a person. Take a moment ' +
          'and send it again.');
      }
      var ans = f.querySelector('[name="human"]');
      if (!ans || parseInt(ans.value, 10) !== a + b) {
        bad.push('The answer to the arithmetic question is not right.');
      }
      if (!bad.length) { return; }             /* let wireForms submit it */
      e.preventDefault();
      e.stopPropagation();
      var msg = bad.filter(function (x) { return x !== 'honeypot'; });
      var done = node.querySelector('.formdone');
      if (done) {
        done.hidden = false;
        done.innerHTML = msg.length
          ? '<p><strong>Not sent.</strong> ' + esc(msg.join(' ')) + '</p>'
          : '<p><strong>Thank you.</strong> Your message has been received.</p>';
      }
      if (!msg.length) { f.reset(); }          /* a robot is told nothing useful */
    }, true);
  }

  function wireForms() {
    Array.prototype.forEach.call(document.querySelectorAll('form.svform'),
      function (f) {
        var url = f.getAttribute('action');
        if (!url || !window.fetch) { return; }
        var done = f.nextElementSibling;
        if (!done || !done.classList.contains('formdone')) { return; }
        f.addEventListener('submit', function (e) {
          if (!f.checkValidity()) { return; }        /* let the browser complain */
          e.preventDefault();
          var btn = f.querySelector('button[type=submit]');
          var was = btn ? btn.textContent : '';
          if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }
          fetch(url, {
            method: 'POST',
            body: new FormData(f),
            headers: { Accept: 'application/json' }
          }).then(function (r) {
            if (!r.ok) { throw new Error('rejected'); }
            f.hidden = true;
            done.hidden = false;
            /* THE SCRIPT REVEALS THE CONFIRMATION. IT DOES NOT WRITE IT.
               This function is wired to every form on the site, and it used to
               overwrite each one with a single hard-coded message describing
               the Register. On the Contact page that told a reader their
               general enquiry had entered an internal research register and
               would not be published against a named school — which is not
               what happens to a contact message, and reads as a warning about
               a thing they never did. One handler cannot know what three
               different forms are for; the page that renders each form does,
               and it now writes the confirmation into .formdone itself. This
               only unhides it, and falls back to something plain and true if a
               form ever arrives without one. */
            if (!done.innerHTML.trim()) {
              done.innerHTML = '<h3>Thank you \u2014 that reached us.</h3>' +
                '<p>Your message has been received. If it needs an answer, we ' +
                'will reply to the address you gave.</p>';
            }
            done.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }).catch(function () {
            /* Stand aside and let the browser do it the ordinary way. */
            if (btn) { btn.disabled = false; btn.textContent = was; }
            f.submit();
          });
        });
      });
  }

  /* ── the ZIP result, drawn ───────────────────────────────────────────────
     A reader types five digits to see THEIR PLACE. Until now the answer was a
     table with four numbers over it, which is a lookup result rather than a
     picture of anywhere. Seven figures follow, and each of them answers a
     question the numbers alone cannot:

       the map          where is this, and what is in it
       the strip        what does #86 of 262 actually look like
       the dots         is this one big school or forty small ones
       the bars         what kind of schools, at what level
       the churches     how does provision sit against congregations
       the neighbors    what is one county over
       the sparklines   how has the state moved since 2004

     Every figure is drawn from a payload a report is also built from, so a
     chart here and a figure in a PDF cannot disagree.

     Categorical hues are assigned in FIXED ORDER and never cycled. A ninth
     affiliation would fold into "Other" rather than take a generated color;
     the palette was validated for colorblind separation rather than chosen by
     eye, and every segment carries a direct label so identity is never colour
     alone. */
  var CAT = ['#3B72A6', '#C0392B', '#0E9C8F', '#D08C1B', '#8B5FB5', '#6E7B8B'];
  var SVGNS = 'http://www.w3.org/2000/svg';

  function pbox(d) {
    var n = d.match(/-?\d+(?:\.\d+)?/g) || [];
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i + 1 < n.length; i += 2) {
      var x = +n[i], y = +n[i + 1];
      if (x < x0) { x0 = x; } if (x > x1) { x1 = x; }
      if (y < y0) { y0 = y; } if (y > y1) { y1 = y; }
    }
    return [x0, y0, x1, y1];
  }

  /* A shared tooltip for every figure on this page. One node, moved, rather
     than one per mark: forty-five schools do not need forty-five tooltips. */
  function tipLayer() {
    var t = document.querySelector('.vtip');
    if (!t) {
      t = document.createElement('div');
      t.className = 'vtip';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    return t;
  }
  function tipOn(el, html) {
    el.addEventListener('mouseenter', function () {
      var t = tipLayer();
      t.innerHTML = html;
      t.style.display = 'block';
    });
    el.addEventListener('mousemove', function (e) {
      var t = tipLayer();
      t.style.left = (e.clientX + 14) + 'px';
      t.style.top = (e.clientY + 14) + 'px';
    });
    el.addEventListener('mouseleave', function () {
      tipLayer().style.display = 'none';
    });
  }

  /* 1 ── THE MAP ───────────────────────────────────────────────────────────
     The market area inside its state, and the state inside the country. The
     geometry is the same national file every other map on this site draws
     from, so the outline here and the outline in the atlas are one shape. */
  function fvMap(host, mid, m, G, counties) {
    var st = mid.slice(0, 2);
    var sib = Object.keys(G.paths).filter(function (k) { return k.slice(0, 2) === st; });
    if (!sib.length) { return; }
    var bb = [1e9, 1e9, -1e9, -1e9];
    sib.forEach(function (k) {
      var b = pbox(G.paths[k]);
      bb[0] = Math.min(bb[0], b[0]); bb[1] = Math.min(bb[1], b[1]);
      bb[2] = Math.max(bb[2], b[2]); bb[3] = Math.max(bb[3], b[3]);
    });
    var pad = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.06;
    var vb = [bb[0] - pad, bb[1] - pad, (bb[2] - bb[0]) + pad * 2, (bb[3] - bb[1]) + pad * 2];

    var paths = sib.map(function (k) {
      var on = k === mid;
      return '<path d="' + G.paths[k] + '" fill="' + (on ? '#9B1B30' : '#ececec') +
        '" stroke="#fff" stroke-width="' + (on ? 1.2 : 0.7) + '"' +
        (on ? '' : ' opacity=".9"') + '/>';
    }).join('');

    var nb = pbox(G.nation);
    var npad = 14;
    var nvb = [nb[0] - npad, nb[1] - npad, (nb[2] - nb[0]) + npad * 2, (nb[3] - nb[1]) + npad * 2];

    host.innerHTML =
      '<div class="fvcard fvmap">' +
      '<div class="fvhead"><h4>Where this is</h4>' +
      '<p class="fvsub">' + esc(m.name) + ' is ' +
      (counties.length === 1 ? 'one county' : numword(counties.length) + ' whole counties') +
      ' &mdash; ' + counties.map(esc).join(', ') +
      ' &mdash; and it never crosses a state line.</p></div>' +
      '<div class="fvmaps">' +
      '<div class="fvbig"><svg viewBox="' + vb.join(' ') + '" role="img" ' +
      'aria-label="' + esc(m.name) + ' within ' + esc(m.state || '') + '">' + paths + '</svg>' +
      '<div class="fvcap">The market area, shaded, among all ' + sib.length +
      ' in ' + esc(m.state || 'the state') + '</div></div>' +
      '<div class="fvloc"><svg viewBox="' + nvb.join(' ') + '" role="img" aria-label="Its position in the country">' +
      '<path d="' + G.nation + '" fill="#f3f3f1" stroke="#ddd" stroke-width="1"/>' +
      '<path d="' + G.paths[mid] + '" fill="#9B1B30" stroke="#9B1B30" stroke-width="3"/>' +
      '</svg><div class="fvcap">And in the country</div></div>' +
      '</div></div>';
  }

  function numword(n) {
    var w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
      'nine', 'ten', 'eleven', 'twelve'];
    return w[n] || String(n);
  }

  /* 2 ── THE STRIP ─────────────────────────────────────────────────────────
     A rank is an abstraction. A position on the distribution is not, and it
     answers the question the rank cannot: whether this market sits in a dense
     cluster where a place either way means almost nothing, or out on its own. */
  function fvStrip(host, m, all) {
    var vals = all.map(function (x) { return x.spk; })
      .filter(function (v) { return v !== null && v !== undefined; })
      .sort(function (a, b) { return a - b; });
    if (vals.length < 10) { return; }
    var lo = 0, hi = vals[Math.floor(vals.length * 0.99)] * 1.02;
    var med = vals[Math.floor(vals.length / 2)];
    var W = 720, H = 88, y0 = 38;
    function x(v) { return Math.max(0, Math.min(W, (v - lo) / (hi - lo) * W)); }

    var ticks = all.map(function (a) {
      if (a.spk === null || a.spk === undefined) { return ''; }
      var on = a.id === m.id;
      if (on) { return ''; }
      return '<line x1="' + x(a.spk).toFixed(1) + '" x2="' + x(a.spk).toFixed(1) +
        '" y1="' + y0 + '" y2="' + (y0 + 26) + '" stroke="#1a3a5c" stroke-width="1" opacity=".16"/>';
    }).join('');

    var mx = x(m.spk);
    var above = all.filter(function (a) {
      return a.spk !== null && a.spk !== undefined && a.spk > m.spk; }).length;

    host.innerHTML =
      '<div class="fvcard">' +
      '<div class="fvhead"><h4>Where it stands among all ' + num(all.length) + ' market areas</h4>' +
      '<p class="fvsub">Every market area in the country is one tick, placed by Christian ' +
      'school enrollments per 1,000 children. Yours is the marked one.</p></div>' +
      '<svg class="fvstrip" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'role="img" aria-label="' + esc(m.name) + ' at ' + m.spk +
      ' enrollments per 1,000, ranked ' + m.rank + ' of ' + all.length + '">' +
      ticks +
      '<line x1="' + x(med).toFixed(1) + '" x2="' + x(med).toFixed(1) + '" y1="' + (y0 - 6) +
      '" y2="' + (y0 + 32) + '" stroke="#666" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<text x="' + x(med).toFixed(1) + '" y="' + (y0 + 46) + '" text-anchor="middle" ' +
      'class="fvax">median ' + med.toFixed(1) + '</text>' +
      '<line x1="' + mx.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y1="' + (y0 - 12) +
      '" y2="' + (y0 + 32) + '" stroke="#9B1B30" stroke-width="3"/>' +
      '<circle cx="' + mx.toFixed(1) + '" cy="' + (y0 - 12) + '" r="5" fill="#9B1B30" ' +
      'stroke="#fff" stroke-width="2"/>' +
      '<text x="' + mx.toFixed(1) + '" y="' + (y0 - 20) + '" text-anchor="' +
      (mx > W * 0.8 ? 'end' : mx < W * 0.2 ? 'start' : 'middle') +
      '" class="fvpin">' + m.spk + '</text>' +
      '<text x="0" y="' + (y0 + 46) + '" class="fvax">0</text>' +
      '<text x="' + W + '" y="' + (y0 + 46) + '" text-anchor="end" class="fvax">' +
      hi.toFixed(0) + '+</text>' +
      '</svg>' +
      '<p class="fvnote"><strong>' + num(above) + '</strong> market ' +
      (above === 1 ? 'area has' : 'areas have') + ' a higher rate; <strong>' +
      num(all.length - above - 1) + '</strong> ' +
      (all.length - above - 1 === 1 ? 'has' : 'have') + ' a lower one. ' +
      'The median market area reads ' + med.toFixed(1) + '.</p>' +
      '</div>';
  }

  /* 3 ── THE DOTS ──────────────────────────────────────────────────────────
     One dot per school, placed by how many children are enrolled in it. A
     market of one large school and forty small ones and a market of
     forty-five even ones produce the same average and look nothing alike, and
     the difference is the whole question for a family choosing. */
  function fvDots(host, rows, m, median) {
    var xs = rows.map(function (r) { return r.n || 0; }).filter(function (v) { return v > 0; });
    if (xs.length < 3) { return; }
    var hi = Math.max.apply(null, xs);
    var W = 720, H = 132, top = 30, band = 62;
    function px(v) { return 8 + (v / (hi * 1.06)) * (W - 26); }

    /* A deterministic scatter, not a random one: the same market draws the
       same picture every time it is looked up. */
    var seed = 7;
    function jitter() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

    var dots = rows.slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); })
      .map(function (r, i) {
        var v = r.n || 0;
        if (!v) { return ''; }
        var cy = top + 8 + jitter() * (band - 16);
        return '<circle class="fvdot" cx="' + px(v).toFixed(1) + '" cy="' + cy.toFixed(1) +
          '" r="5" fill="#3B72A6" fill-opacity=".72" stroke="#fff" stroke-width="2" ' +
          'data-t="' + esc((r.name || '') + ' ' + (r.city || '') + ' ' +
            num(v) + ' enrolled') + '"/>';
      }).join('');

    var mp = px(median);
    host.innerHTML =
      '<div class="fvcard">' +
      '<div class="fvhead"><h4>The shape of the ' + num(rows.length) + ' schools</h4>' +
      '<p class="fvsub">One dot per school, placed by how many children are enrolled. ' +
      'Hover any dot for its name.</p></div>' +
      '<svg class="fvdots" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Enrollment of each school, smallest to largest">' +
      '<line x1="' + mp.toFixed(1) + '" x2="' + mp.toFixed(1) + '" y1="' + (top - 8) +
      '" y2="' + (top + band) + '" stroke="#666" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<text x="' + mp.toFixed(1) + '" y="' + (top - 14) + '" text-anchor="middle" ' +
      'class="fvax">median school, ' + num(median) + '</text>' +
      dots +
      '<line x1="8" x2="' + (W - 10) + '" y1="' + (top + band + 6) + '" y2="' +
      (top + band + 6) + '" stroke="#d8d8d8" stroke-width="1"/>' +
      '<text x="8" y="' + (top + band + 24) + '" class="fvax">0</text>' +
      '<text x="' + (W - 10) + '" y="' + (top + band + 24) + '" text-anchor="end" ' +
      'class="fvax">' + num(hi) + ' enrolled</text>' +
      '</svg></div>';
    Array.prototype.forEach.call(host.querySelectorAll('.fvdot'), function (c) {
      tipOn(c, esc(c.getAttribute('data-t')));
    });
  }

  /* 4 ── COMPOSITION ───────────────────────────────────────────────────────
     Two bars on two different denominators, and the denominators are printed
     rather than assumed. The level breakdown counts SCHOOL RECORDS; the
     affiliation breakdown counts CHILDREN. Presenting them as one thing is
     the error this project has already made once. */
  function fvComp(host, by_level, by_type, m) {
    function bar(title, obj, unit, total) {
      var ks = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
      if (!ks.length) { return ''; }
      if (ks.length > CAT.length) {
        var keep = ks.slice(0, CAT.length - 1), rest = ks.slice(CAT.length - 1);
        var o2 = {}; keep.forEach(function (k) { o2[k] = obj[k]; });
        o2.Other = rest.reduce(function (s, k) { return s + obj[k]; }, 0);
        obj = o2; ks = keep.concat(['Other']);
      }
      var sum = ks.reduce(function (s, k) { return s + obj[k]; }, 0) || 1;
      var W = 720, x = 0;
      var segs = ks.map(function (k, i) {
        var w = obj[k] / sum * W;
        var g = i === ks.length - 1 ? 0 : 2;          /* 2px surface gap */
        var s = '<rect x="' + x.toFixed(1) + '" y="0" width="' + Math.max(0, w - g).toFixed(1) +
          '" height="26" rx="2" fill="' + CAT[i] + '" data-t="' +
          esc(k + ' ' + num(obj[k]) + ' ' + unit + ' ' +
            (obj[k] / sum * 100).toFixed(0) + '%') + '" class="fvseg"/>';
        if (w > 54) {
          s += '<text x="' + (x + w / 2 - g / 2).toFixed(1) + '" y="17" text-anchor="middle" ' +
            'class="fvseglab">' + (obj[k] / sum * 100).toFixed(0) + '%</text>';
        }
        x += w;
        return s;
      }).join('');
      var key = ks.map(function (k, i) {
        return '<span class="fvkey"><i style="background:' + CAT[i] + '"></i>' + esc(k) +
          ' <b>' + num(obj[k]) + '</b></span>';
      }).join('');
      return '<div class="fvbar"><h5>' + esc(title) + '</h5>' +
        '<svg viewBox="0 0 ' + W + ' 26" preserveAspectRatio="none" role="img" ' +
        'aria-label="' + esc(title) + '">' + segs + '</svg>' +
        '<div class="fvlegend">' + key + '</div>' +
        '<p class="fvax2">' + num(sum) + ' ' + unit + ' in total. ' + esc(total) + '</p></div>';
    }

    var a = bar('Schools, by level', by_level || {}, 'school records',
      'The census records a level for every school it lists individually.');
    var b = bar('Children, by affiliation', by_type || {}, 'children',
      'This bar counts children rather than schools, so it does not sum to the school count above.');
    if (!a && !b) { return; }
    host.innerHTML = '<div class="fvcard"><div class="fvhead"><h4>What kind of schools</h4>' +
      '<p class="fvsub">Two breakdowns on two different denominators, each stated.</p></div>' +
      '<div class="fvbars">' + a + b + '</div></div>';
    Array.prototype.forEach.call(host.querySelectorAll('.fvseg'), function (r) {
      tipOn(r, esc(r.getAttribute('data-t')));
    });
  }

  /* 5 ── CHURCHES BESIDE SCHOOLS ───────────────────────────────────────────
     Two censuses on one geography. It says how many schools stand beside a
     hundred churches, and nothing whatever about why. */
  function fvChurch(host, mid, C) {
    var rows = (C && C.markets) || [];
    var me = null;
    rows.forEach(function (r) { if (r.id === mid) { me = r; } });
    if (!me || me.s_per_100c === null || me.s_per_100c === undefined) { return; }
    var vals = rows.map(function (r) { return r.s_per_100c; })
      .filter(function (v) { return v !== null && v !== undefined; })
      .sort(function (a, b) { return b - a; });
    var rank = vals.indexOf(me.s_per_100c) + 1;
    var med = vals[Math.floor(vals.length / 2)];
    host.innerHTML =
      '<div class="fvcard"><div class="fvhead"><h4>Churches beside schools</h4>' +
      '<p class="fvsub">Two censuses on one geography: Christian schools from the federal ' +
      'private school census, Christian congregations from the 2020 U.S. Religion Census.</p></div>' +
      '<div class="findfigs">' +
      '<div class="ff"><div class="n">' + num(me.cong) + '</div><div class="l">Christian congregations</div></div>' +
      '<div class="ff"><div class="n">' + num(me.adherents) + '</div><div class="l">adherents counted</div></div>' +
      '<div class="ff"><div class="n">' + me.s_per_100c + '</div><div class="l">schools per 100 congregations</div></div>' +
      '<div class="ff"><div class="n">#' + rank + '</div><div class="l">of ' + num(vals.length) +
      ' on that measure</div></div>' +
      '</div>' +
      '<p class="fvnote">The median market area has ' + med +
      ' schools for every hundred congregations. This is a ratio of two counts on the same ' +
      'counties in the same country. It is not a claim about cause.</p></div>';
  }

  /* 6 ── THE NEIGHBORS ─────────────────────────────────────────────────────
     A market line is a line on a map, not a wall. A family near one wants to
     know what is on the other side of it. */
  function fvNeighbors(host, m, ids, M) {
    var them = (ids || []).map(function (id) { return M[id]; })
      .filter(function (x) { return x && x.spk !== null && x.spk !== undefined; });
    if (!them.length) { return; }
    var all = them.concat([m]);
    var hi = Math.max.apply(null, all.map(function (x) { return x.spk; })) * 1.12;
    var rows = all.sort(function (a, b) { return b.spk - a.spk; }).map(function (x) {
      var on = x.id === m.id;
      var w = (x.spk / hi * 100).toFixed(1);
      return '<div class="fvnrow' + (on ? ' on' : '') + '">' +
        '<div class="fvnname">' + (on ? '<strong>' + esc(x.name) + '</strong>'
          : '<a href="' + BASE + 'markets/' + x.id + '.html">' + esc(x.name) + '</a>') + '</div>' +
        '<div class="fvntrack"><i style="width:' + w + '%;background:' +
        (on ? '#9B1B30' : '#3B72A6') + '"></i></div>' +
        '<div class="fvnval">' + x.spk + '</div></div>';
    }).join('');
    host.innerHTML =
      '<div class="fvcard"><div class="fvhead"><h4>What is next door</h4>' +
      '<p class="fvsub">The market areas that share a border with this one, by Christian ' +
      'school enrollments per 1,000 children. A market line is a line on a map, not a wall.</p></div>' +
      '<div class="fvnbrs">' + rows + '</div></div>';
  }

  /* 7 ── THE STATE, SINCE 2004 ─────────────────────────────────────────────
     Attention, kept visibly apart from everything above it. The figures above
     come from a school census; these come from the index series, they are
     measured for the STATE and not for this market area, and the two are never
     placed on one axis or described as though one explained the other. */
  function fvSpark(host, m, S) {
    var H2 = S.history || {}, NOW = S.now || {};
    var ks = ['master', 'preschool', 'elementary', 'middle', 'highschool']
      .filter(function (k) { return H2[k] && (H2[k].points || []).length > 4; });
    if (!ks.length) { return; }
    var cells = ks.map(function (k) {
      var pts = H2[k].points, of = (NOW[k] || {}).of || 50;
      var W = 210, Hh = 52;
      var d = pts.map(function (p, i) {
        var x = i / (pts.length - 1) * W;
        var y = (p[1] - 1) / (of - 1) * (Hh - 8) + 4;      /* rank 1 at the top */
        return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join('');
      var last = pts[pts.length - 1];
      var lx = W, ly = (last[1] - 1) / (of - 1) * (Hh - 8) + 4;
      return '<div class="fvspark">' +
        '<div class="fvsname">' + esc((NOW[k] || {}).name || k) + '</div>' +
        '<svg viewBox="0 0 ' + (W + 8) + ' ' + Hh + '" role="img" aria-label="' +
        esc((NOW[k] || {}).name || k) + ' rank history, now ' + last[1] + ' of ' + of + '">' +
        '<path d="' + d + '" fill="none" stroke="#1a3a5c" stroke-width="2" ' +
        'stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>' +
        '<circle cx="' + lx + '" cy="' + ly.toFixed(1) + '" r="4" fill="#9B1B30" ' +
        'stroke="#fff" stroke-width="2"/></svg>' +
        '<div class="fvsnow">#' + last[1] + ' <span>of ' + of + '</span></div></div>';
    }).join('');
    host.innerHTML =
      '<div class="fvcard fvatt"><div class="fvhead">' +
      '<div class="fk">A different measure</div>' +
      '<h4>' + esc(S.state) + '&rsquo;s Attention, every month since 2004</h4>' +
      '<p class="fvsub">Everything above counts schools and children. This counts something ' +
      'else entirely: how strongly a state is oriented toward Christian schooling, against ' +
      'the other forty-nine, in every month of the record. Higher on the line is a stronger ' +
      'standing. It is measured for ' + esc(S.state) + ' and not for this market area, and ' +
      'the two are never added together.</p></div>' +
      '<div class="fvsparks">' + cells + '</div>' +
      '<p class="fvnote">A movement here is a change in standing against the other states. ' +
      'It is not growth or decline in any quantity. ' +
      '<a href="' + BASE + 'states/' + slug(S.state) + '.html">' + esc(S.state) +
      ' in full</a> &middot; <a href="' + BASE + 'methodology/index.html">how this is measured</a></p>' +
      '</div>';
  }

  function finder(node) {
    var Z = null, M = null, MLIST = [];
    node.innerHTML =
      '<form class="findbox" autocomplete="off"><label for="zipq">ZIP code</label>' +
      '<input id="zipq" inputmode="numeric" pattern="[0-9]*" maxlength="5" ' +
      'placeholder="48867" aria-describedby="findnote">' +
      '<button type="submit">Find my market area</button></form>' +
      '<p class="findnote" id="findnote">' + (ZIPLOG
        ? 'The lookup runs in your browser against a table delivered with this page. ' +
          'The Institute records which ZIP codes are looked up and which market areas ' +
          'they fall in, so that it knows where the questions are coming from. Nothing ' +
          'identifies you: no cookie is set, no account is needed, and one lookup is ' +
          'never linked to another or to anything else you do here.'
        : 'The lookup table is part of this page. Your ZIP code is resolved in your own ' +
          'browser and is never sent to the Institute or to anyone else.') + '</p>' +
      '<div data-c="out"></div>';
    var out = node.querySelector('[data-c="out"]');

    function ready() {
      if (Z) { return Promise.resolve(); }
      return Promise.all([get('data/zip_market.json'), get('data/market/index.json')])
        .then(function (r) {
          Z = {};
          Object.keys(r[0].markets).forEach(function (mid) {
            r[0].markets[mid].forEach(function (z) { Z[z] = mid; });
          });
          M = {}; M.__count = r[1].markets.length;
          MLIST = r[1].markets;
          r[1].markets.forEach(function (m) { M[m.id] = m; });
        });
    }

    node.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var z = node.querySelector('#zipq').value.trim();
      if (!/^\d{5}$/.test(z)) { out.innerHTML = '<p class="findmiss">A ZIP code is five digits.</p>'; return; }
      out.innerHTML = '<p class="findmiss">Looking…</p>';
      ready().then(function () { card(z); }).catch(function (e) { fail(out, e); });
    });

    /* The place name the five digits carry, fetched one prefix at a time and
       remembered for the session. It is written into the card the moment it
       lands, so a slow prefix costs the name and never the answer. */
    var PLACE = {};
    function placeOf(z) {
      var p = z.slice(0, 2);
      if (PLACE[p]) { return Promise.resolve(PLACE[p][z] || null); }
      return get('data/zipname/' + p + '.json').then(function (t) {
        PLACE[p] = t || {};
        return PLACE[p][z] || null;
      }).catch(function () { PLACE[p] = {}; return null; });
    }
    function placeLine(z) {
      placeOf(z).then(function (v) {
        var h = out.querySelector('[data-c="place"]');
        if (!h || !v) { return; }
        var b = v.split('|');
        h.innerHTML = 'ZIP code ' + esc(z) + ' &middot; <b>' + esc(b[0]) + '</b>' +
          (b[2] ? ', ' + esc(b[2]) + ' County' : '') +
          (b[1] ? ', ' + esc(b[1]) : '');
      });
    }

    function card(z) {
      var mid = Z[z];
      /* Recorded after the answer is decided and before it is drawn, so a ZIP
         that resolves to nothing is counted too: the ones that miss are the
         most useful thing this endpoint will ever collect. */
      recordLookup(z, mid || null, (M[mid] || {}).name || null);
      try {
        document.dispatchEvent(new CustomEvent('svcei:market', { detail: mid || null }));
      } catch (e) { /* an older browser simply does not get the highlight */ }
      if (!mid || !M[mid]) {
        out.innerHTML = '<p class="findplace" data-c="place"></p>' +
          '<p class="findmiss">No Christian Education Market Area is recorded ' +
          'for ZIP code ' + esc(z) + '. Market areas are built from whole counties, and a ' +
          'ZIP code that spans a state line or is not a residential delivery area may not ' +
          'resolve. <a href="' + BASE + 'markets/index.html">Browse every market area</a>.</p>';
        placeLine(z);
        return;
      }
      var m = M[mid];
      out.innerHTML =
        '<div class="findcard"><div class="fk">Christian Education Market Area</div>' +
        '<h3><a href="' + BASE + 'markets/' + mid + '.html">' + esc(m.name) + '</a></h3>' +
        '<p class="findplace" data-c="place"></p>' +
        '<div class="findfigs">' +
        fig(num(m.schools), 'Christian schools') +
        fig(num(m.students), 'students enrolled') +
        fig(m.spk, 'Christian school enrollments per 1,000') +
        fig('#' + m.rank, 'of ' + num(M.__count) + ' market areas') +
        '</div><p class="findlinks">' +
        '<a href="' + BASE + 'markets/' + mid + '.html">The full market area report</a>' +
        (m.state ? ' &middot; <a href="' + BASE + 'states/' + slug(m.state) + '.html">' +
          esc(m.state) + '</a>' : '') +
        ' &middot; <a href="' + BASE + 'methodology/index.html#markets">How a market area is drawn</a>' +
        '</p>' +
        '<div data-c="mmap"></div><div data-c="strip"></div>' +
        '<div data-c="dots"></div><div data-c="comp"></div>' +
        '<div data-c="church"></div><div data-c="nbrs"></div>' +
        '<div data-c="spark"></div>' +
        '<div data-c="schools"></div>' +
        '<p class="srctag">School figures come from the federal private school census. ' +
        'The rate counts children enrolled, so it measures schooling taken up rather than ' +
        'schooling available.</p></div>';
      placeLine(z);
      schools(mid);
      enrich(mid, m);
    }

    /* Everything the card draws beyond the four figures, fetched once. Each
       figure is drawn inside its own try, so a payload that is missing costs
       that one figure and not the page. */
    /* The dot figure needs two payloads that arrive independently: the school
       list and the market record that carries the median. Whichever lands
       second draws it. The first version drew from inside the school fetch
       and simply lost the race, which is why the figure was silently absent
       rather than visibly broken. */
    var MK = null, SCHOOLS = null;
    function tryDots() {
      var h = out.querySelector('[data-c="dots"]');
      if (!h || !SCHOOLS || !MK || !MK.market) { return; }
      try { fvDots(h, SCHOOLS, MK.market, MK.market.median_school); }
      catch (e) { h.innerHTML = ''; }
    }
    function enrich(mid, m) {
      MK = null; SCHOOLS = null;
      var slugState = m.state ? slug(m.state) : '';
      Promise.all([
        get('data/market/' + mid + '.json').catch(function () { return null; }),
        get('data/geo/markets.json').catch(function () { return null; }),
        get('data/congregations.json').catch(function () { return null; }),
        slugState ? get('data/state/' + slugState + '.json').catch(function () { return null; })
          : Promise.resolve(null)
      ]).then(function (r) {
        var MKT = r[0], G = r[1], C = r[2], S = r[3];
        MK = MKT;
        function draw(sel, fn) {
          var h = out.querySelector('[data-c="' + sel + '"]');
          if (!h) { return; }
          try { fn(h); } catch (err) { h.innerHTML = ''; }
        }
        if (MKT && G) {
          draw('mmap', function (h) { fvMap(h, mid, m, G, MKT.counties || []); });
        }
        draw('strip', function (h) { fvStrip(h, m, MLIST); });
        if (MKT && MKT.market) {
          draw('comp', function (h) {
            fvComp(h, MKT.market.by_level, MKT.market.by_type, m); });
          draw('nbrs', function (h) {
            fvNeighbors(h, m, MKT.market.neighbors, M); });
        }
        if (C) { draw('church', function (h) { fvChurch(h, mid, C); }); }
        if (S) { draw('spark', function (h) { fvSpark(h, m, S); }); }
        tryDots();
      });
    }

    /* The Christian schools in the market area, largest first.
       Called the largest rather than the nearest, deliberately. The federal
       census records a school's city and does not record its coordinates, so
       the Institute cannot compute a distance and will not print a word that
       implies it has. A reader who wants the closest one has the city beside
       every name. */
    function schools(mid) {
      var host = out.querySelector('[data-c="schools"]');
      if (!host) { return; }
      get('data/schools/' + mid + '.json').then(function (D) {
        schoolTable(host, D, 'in this market area');
        SCHOOLS = D.schools || [];
        tryDots();
      }).catch(function (e) {
        host.innerHTML = '<p class="srctag">The school list could not load (' +
          esc(e.message) + ').</p>';
      });
    }

    function fig(v, l) {
      return '<div class="ff"><div class="n">' + v + '</div><div class="l">' + l + '</div></div>';
    }
  }

  /* Every Christian school in a market area, filterable, with the count
     reconciliation stated rather than left for a reader to trip over. */
  function schoolTable(host, D, where) {
    var rows = D.schools || [];
    if (!rows.length) {
      host.innerHTML = '<p class="srctag">No individual schools are recorded ' +
        'for this market area in the current census.</p>';
      return;
    }
    host.innerHTML =
      '<h4 class="findsub">Every Christian school ' + where + '</h4>' +
      '<div class="tools"><input type="text" data-c="q" ' +
      'placeholder="Find a school or a city" aria-label="Find a school or a city">' +
      '<label>Level <select data-c="lv"><option value="">Every level</option>' +
      andlist([]) + '</select></label>' +
      '<span class="count" data-c="n"></span>' +
      '<button class="linkbtn" data-c="csv" type="button">Download as CSV</button></div>' +
      '<div class="tablewrap tallwrap"><table class="data"><thead><tr><th>School</th>' +
      '<th>City</th><th>Level</th><th>Affiliation</th><th class="n">Enrolled</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (t) {
        return '<tr data-lv="' + esc(t.level || '') + '"><td>' + esc(t.name || '') +
          (t.cut ? ' <span class="ts" title="This name reached the census file\u2019s ' +
            'fifty-character limit and may be incomplete">&hellip;</span>' : '') +
          '</td><td>' + esc(t.city || '') + '</td><td>' + esc(t.level || '') +
          '</td><td>' + esc(t.typ || '') + '</td><td class="n">' + num(t.n || 0) +
          '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="srctag">' + num(rows.length) + ' school records, holding ' +
      num(D.records_students) + ' children. ' + esc(D.note) + '</p>';

    var lv = host.querySelector('[data-c="lv"]');
    var levels = [];
    rows.forEach(function (t) {
      if (t.level && levels.indexOf(t.level) < 0) { levels.push(t.level); }
    });
    lv.innerHTML = '<option value="">Every level</option>' + levels.sort().map(function (x) {
      return '<option>' + esc(x) + '</option>'; }).join('');

    var q = host.querySelector('[data-c="q"]');
    var trs = Array.prototype.slice.call(host.querySelectorAll('tbody tr'));
    var cnt = host.querySelector('[data-c="n"]');
    function filter() {
      var v = q.value.toLowerCase(), f = lv.value, n = 0;
      trs.forEach(function (tr) {
        var ok = (!f || tr.getAttribute('data-lv') === f) &&
          tr.textContent.toLowerCase().indexOf(v) >= 0;
        tr.style.display = ok ? '' : 'none';
        if (ok) { n++; }
      });
      cnt.textContent = n + ' of ' + trs.length + ' shown';
    }
    q.addEventListener('input', filter);
    lv.addEventListener('change', filter);
    filter();

    host.querySelector('[data-c="csv"]').addEventListener('click', function () {
      var lines = [['# Spring Vale Christian Education Institute', 'Owosso, Michigan'],
        ['# dataset', 'Christian schools in ' + D.name],
        ['# window', D.window], ['# records', String(rows.length)],
        ['# note', D.note], ['# license', 'CC BY 4.0'], [],
        ['school', 'city', 'level', 'affiliation', 'enrolled', 'name_may_be_truncated']];
      rows.forEach(function (t) {
        lines.push([t.name, t.city, t.level, t.typ, t.n, t.cut ? 'yes' : 'no']);
      });
      download(lines.map(function (r) {
        return r.map(function (c) {
          c = String(c === null || c === undefined ? '' : c);
          return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
        }).join(',');
      }).join('\n'), 'svcei-schools-' + D.id + '.csv');
    });
  }

  /* ── 3. CITE THIS FIGURE ─────────────────────────────────────────────────
     Every figure the site publishes carries a control that writes the citation
     for it. The Institute's ambition is to be cited; this is the cheapest
     possible investment in being cited correctly. */
  var CITEBOX = null;
  function citeFigure(meta) {
    var today = new Date(), MN = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    var acc = today.getDate() + ' ' + MN[today.getMonth()] + ' ' + today.getFullYear();
    var url = meta.url || location.href;
    var what = meta.what || document.title;
    /* A caption usually names its own month, and the citation appends the
       window as a separate field, so a figure captioned "... Index, July 2026"
       came out as "... Index, July 2026, July 2026". The month is carried once,
       in the field built for it. */
    if (meta.window) {
      var wn = wname(meta.window);
      var rx = new RegExp('[,\\s\u00b7-]+' + wn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
      what = what.replace(rx, '').trim();
    }
    var yr = (meta.window || '').slice(0, 4) || String(today.getFullYear());
    /* `what` has already had its trailing punctuation stripped, so every form
       below supplies its own and none of them can produce ".," or "..". */
    var forms = {
      Note: 'Spring Vale Christian Education Institute, ' + what +
        (meta.window ? ', ' + wname(meta.window) : '') + ', ' + url +
        ' (accessed ' + acc + ').',
      APA: 'Spring Vale Christian Education Institute. (' + yr + '). ' + what +
        (meta.window ? ' [' + wname(meta.window) + ']' : '') +
        '. Retrieved ' + acc + ', from ' + url,
      Chicago: 'Spring Vale Christian Education Institute. "' + what + '." ' +
        (meta.window ? wname(meta.window) + '. ' : '') + 'Accessed ' + acc + '. ' + url + '.',
      BibTeX: '@techreport{svcei' + yr + ',\n  author = {{Spring Vale Christian Education Institute}},\n' +
        '  title  = {' + what + '},\n  year   = {' + yr + '},\n' +
        (meta.window ? '  note   = {Window ' + wname(meta.window) + '},\n' : '') +
        '  url    = {' + url + '},\n  urldate = {' + today.toISOString().slice(0, 10) + '}\n}'
    };
    if (!CITEBOX) {
      CITEBOX = document.createElement('div');
      CITEBOX.className = 'citebox';
      CITEBOX.setAttribute('role', 'dialog');
      CITEBOX.setAttribute('aria-label', 'Cite this figure');
      document.body.appendChild(CITEBOX);
      CITEBOX.addEventListener('click', function (e) {
        if (e.target === CITEBOX || e.target.classList.contains('citex')) { CITEBOX.hidden = true; }
      });
    }
    CITEBOX.hidden = false;
    CITEBOX.innerHTML = '<div class="citepanel"><button class="citex" aria-label="Close">&times;</button>' +
      '<h4>Cite this figure</h4><p class="citewhat">' + esc(what) +
      (meta.window ? ' &middot; ' + wname(meta.window) : '') + '</p>' +
      Object.keys(forms).map(function (k) {
        return '<div class="citef"><div class="ck">' + k + '</div>' +
          '<pre>' + esc(forms[k]) + '</pre>' +
          '<button class="copyc" data-k="' + k + '">Copy</button></div>';
      }).join('') +
      '<p class="srctag">Reproduce the figure with the month it belongs to. A reading ' +
      'without its month is not the Institute’s figure. ' +
      '<a href="' + BASE + 'cite/index.html">Citation and correct use</a>.</p></div>';
    CITEBOX.querySelectorAll('.copyc').forEach(function (b) {
      b.addEventListener('click', function () { copy(forms[b.getAttribute('data-k')], b); });
    });
  }

  /* Every figure on the site gets the control, and gets it from one place, so a
     new chart cannot be published without one. */
  function chartHosts() {
    /* A figure on this site is whatever block a chart or a data table was drawn
       into. Selecting only .chartcard and <figure> found none of them, because
       every chart the site draws is written into a [data-fill] host by a widget,
       so the cite control and the table view were shipped attached to nothing.
       The rule is therefore what a block CONTAINS rather than what it is called,
       which is also the only rule a chart added next month will satisfy without
       anyone remembering to add a class to it. */
    var out = [];
    document.querySelectorAll(
      '.chartcard,figure,[data-cite],[data-fill],[data-c]').forEach(function (el) {
      if (!el.querySelector('svg,table.data')) { return; }
      if (out.some(function (o) { return o.contains(el); })) {
        out = out.filter(function (o) { return !o.contains(el); });
      }
      out.push(el);
    });
    return out;
  }

  /* A caption is a name followed by instructions to the reader. Taking the
     whole of it produced citations like

       "... Spring Vale Master Christian Education Index, July 2026. Darker is
        a stronger standing among the fifty states., http://..."

     which names the figure and then tells the reader how to read the ramp, in
     a reference list, with a stray comma after a full stop. The name is the
     first sentence; the rest is guidance and does not belong in a citation. */
  /* Abbreviations that end in a full stop and are not the end of a sentence.
     "Sault Ste. Marie" is a market area the Institute names, so a naive split
     on the first period truncates it to "Traverse City-Sault Ste". */
  var ABBREV = /(?:^|\s)(?:St|Ste|Mt|Ft|Dr|Jr|Sr|No|vs|Inc|Co|U\.S|Rev|Fig)$/i;

  function firstSentence(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    var rx = /\.\s+(?=[A-Z\u201C])/g, m;
    while ((m = rx.exec(t)) !== null) {
      var head = t.slice(0, m.index);
      /* A period inside a decimal has no space after it, so the lookahead has
         already excluded those. What is left to exclude is an abbreviation. */
      if (ABBREV.test(head)) { continue; }
      t = head;
      break;
    }
    return t.replace(/[\s,;:.\u2014-]+$/, '').trim();
  }

  function figureTitle(f) {
    var h = f.querySelector('h3,h4,figcaption,caption');
    if (h && h.textContent.trim()) { return firstSentence(h.textContent); }
    var el = f;
    while (el && el !== document.body) {
      var q = el.previousElementSibling;
      while (q) {
        if (/^H[1-4]$/.test(q.tagName) && q.textContent.trim()) {
          return firstSentence(q.textContent);
        }
        q = q.previousElementSibling;
      }
      el = el.parentElement;
    }
    return document.title.split('\u2014')[0].trim();
  }

  function citeAll() {
    chartHosts().forEach(function (f) {
      if (f.querySelector(':scope > .citebtn')) { return; }
      if (getComputedStyle(f).position === 'static') { f.style.position = 'relative'; }
      var b = document.createElement('button');
      b.className = 'citebtn';
      b.type = 'button';
      b.textContent = 'Cite this figure';
      b.addEventListener('click', function () {
        citeFigure({
          what: firstSentence(f.getAttribute('data-cite') || figureTitle(f)).slice(0, 160),
          window: f.getAttribute('data-window') ||
            (document.body.getAttribute('data-window') || '')
        });
      });
      f.appendChild(b);
    });
  }

  /* ── 4. THE TIME MACHINE ─────────────────────────────────────────────────
     One control over every windowed chart on the page, and a link back to any
     window in the series. */
  function timemachine(node) {
    get('data/manifest.json').then(function (M) {
      var q = new URLSearchParams(location.search);
      var at = M.windows.indexOf(q.get('w'));
      var head = document.createElement('div');
      node.appendChild(head);
      var note = document.createElement('p');
      note.className = 'srctag';
      node.appendChild(note);
      windowSlider(head, M.windows, at < 0 ? M.windows.length - 1 : at, function (w) {
        note.innerHTML = 'Every chart on this page is showing ' + wname(w) + '. ' +
          '<a href="?w=' + w + '">Link to this month</a>.';
        document.body.setAttribute('data-window', w);
        document.querySelectorAll('[data-onwindow]').forEach(function (el) {
          var f = WINDOWED[el.getAttribute('data-onwindow')];
          if (f) { f(el, w); }
        });
      });
    }).catch(function (e) { fail(node, e); });
  }
  var WINDOWED = {};

  /* The standings table, for any window in the series.

     The widget above it reads data/window/<w>.json, and only the current
     window has one — 271 window payloads would be 271 files that must all stay
     in step with each other. The five series payloads already carry a rank and
     a ratio for every state in every window, so the time machine draws from
     those instead and cannot disagree with the chart beside it. */
  var TMS = {};
  function windowStandings(el, w) {
    var key = el.getAttribute('data-index') || 'master';
    var need = [key];
    Promise.all(need.map(function (k) {
      if (TMS[k]) { return Promise.resolve(); }
      return get('data/series/' + k + '.json').then(function (x) { TMS[k] = x; });
    })).then(function () {
      var S = TMS[key], i = S.windows.indexOf(w);
      if (i < 0) { return; }
      var prev = i >= 12 ? S.windows[i - 12] : null;
      var rows = S.states.map(function (g, j) {
        return { s: g, rank: (S.rank[w] || [])[j], ratio: (S.ratio[w] || [])[j],
          was: prev ? (S.rank[prev] || [])[j] : null };
      }).filter(function (r) { return r.rank; })
        .sort(function (a, b) { return a.rank - b.rank; });
      var of = rows.length;
      el.innerHTML = '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th class="n">Rank</th><th>State</th><th class="n">Ratio to the median</th>' +
        '<th class="n">A year earlier</th><th class="n">Movement</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var mv = (r.was === null || r.was === undefined) ? '\u2014'
            : (r.was - r.rank > 0
              ? '<span class="up">&#9650; ' + (r.was - r.rank) + '</span>'
              : (r.was - r.rank < 0
                ? '<span class="dn">&#9660; ' + (r.rank - r.was) + '</span>' : 'unchanged'));
          return '<tr><td class="n">' + r.rank + '</td><td><span class="sq" style="background:' +
            rankColor(r.rank, of) + '"></span><a href="' + BASE + 'states/' + slug(r.s) +
            '.html">' + esc(r.s) + '</a></td><td class="n">' +
            (r.ratio ? r.ratio.toFixed(2) + '&times;' : '\u2014') + '</td><td class="n">' +
            (r.was ? ordinal(r.was) : '\u2014') + '</td><td class="n">' + mv + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="srctag">' + esc(S.name) + ' Index, ' + wname(w) + '. ' + of +
        ' states ranked. Movement is against the same month a year earlier and is a change ' +
        'in standing rather than growth or decline in any quantity.</p>';
    }).catch(function (e) { fail(el, e); });
  }
  WINDOWED.standings = windowStandings;

  /* ── 5. THE DATA EXPLORER ────────────────────────────────────────────────
     Pick indices, states and windows; get a table and the CSV behind it. It is
     a front end on exports that already exist rather than a second source. */
  function explorer(node) {
    var M, S = {};
    node.innerHTML =
      '<div class="tools">' +
      '<label>Index <select data-f="k"></select></label>' +
      '<label>From <select data-f="w0"></select></label>' +
      '<label>To <select data-f="w1"></select></label>' +
      '<label>Show <select data-f="mode">' +
      '<option value="rank">Standing</option><option value="ratio">Ratio to the median</option>' +
      '</select></label>' +
      '<label>Region <select data-f="reg"></select></label>' +
      '<button class="linkbtn" data-a="csv" type="button">Download this table as CSV</button>' +
      '</div><div data-c="grid"></div>';

    function sel(f) { return node.querySelector('[data-f="' + f + '"]'); }
    function render() {
      var s = S[sel('k').value];
      if (!s) { return; }
      var i0 = s.windows.indexOf(sel('w0').value), i1 = s.windows.indexOf(sel('w1').value);
      if (i0 < 0) { i0 = 0; }
      if (i1 < 0) { i1 = s.windows.length - 1; }
      if (i1 < i0) { var t = i0; i0 = i1; i1 = t; }
      var wins = s.windows.slice(i0, i1 + 1);
      if (wins.length > 40) {
        var step = Math.ceil(wins.length / 40);
        wins = wins.filter(function (_, i) { return i % step === 0 || i === wins.length - 1; });
      }
      var reg = sel('reg').value, mode = sel('mode').value;
      var rows = s.states.filter(function (g) {
        if (!reg) { return true; }
        var f = M.states.filter(function (x) { return x.s === g; })[0];
        return f && f.region === reg;
      });
      var html = '<div class="tablewrap"><table class="data"><thead><tr><th>State</th>' +
        wins.map(function (w) { return '<th class="n">' + w + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(function (g) {
          var j = s.states.indexOf(g);
          return '<tr><td>' + esc(g) + '</td>' + wins.map(function (w) {
            var v = (s[mode][w] || [])[j];
            return '<td class="n">' + (v === null || v === undefined ? '—'
              : (mode === 'rank' ? v : v.toFixed(2))) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="srctag">' + rows.length + ' states × ' + wins.length + ' windows on the ' +
        esc(sel('k').selectedOptions[0].textContent) + ' Index. ' +
        (mode === 'rank' ? 'A standing is a place among the fifty states in that window.'
          : 'A ratio is the state against the median state in that window.') +
        ' A movement is a change in standing rather than growth or decline in any quantity.</p>';
      node.querySelector('[data-c="grid"]').innerHTML = html;
      node.querySelector('[data-a="csv"]').onclick = function () {
        var lines = [['# Spring Vale Christian Education Institute', 'Owosso, Michigan'],
          ['# dataset', sel('k').selectedOptions[0].textContent + ' Index, ' + mode],
          ['# built by', 'the data explorer at ' + siteURL('')],
          ['# license', 'CC BY 4.0'], []];
        lines.push(['state'].concat(wins));
        rows.forEach(function (g) {
          var j = s.states.indexOf(g);
          lines.push([g].concat(wins.map(function (w) {
            var v = (s[mode][w] || [])[j];
            return v === null || v === undefined ? '' : v;
          })));
        });
        download(lines.map(function (r) {
          return r.map(function (c) {
            c = String(c);
            return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
          }).join(',');
        }).join('\n'), 'svcei-' + sel('k').value + '-' + mode + '.csv');
      };
    }
    function load() {
      var k = sel('k').value;
      if (S[k]) { render(); return; }
      get('data/series/' + k + '.json').then(function (s) { S[k] = s; fillWindows(s); render(); });
    }
    function fillWindows(s) {
      [['w0', s.windows[Math.max(0, s.windows.length - 25)]], ['w1', s.windows[s.windows.length - 1]]]
        .forEach(function (p) {
          var cur = sel(p[0]).value || p[1];
          sel(p[0]).innerHTML = s.windows.map(function (w) {
            return '<option value="' + w + '"' + (w === cur ? ' selected' : '') + '>' + w + '</option>';
          }).join('');
        });
    }
    get('data/manifest.json').then(function (m) {
      M = m;
      sel('k').innerHTML = M.indices.map(function (x) {
        return '<option value="' + x.key + '">' + esc(x.name) + '</option>'; }).join('');
      sel('reg').innerHTML = '<option value="">Every state</option>' +
        M.regions.map(function (r) { return '<option value="' + esc(r.name) + '">' +
          esc(r.name) + '</option>'; }).join('');
      ['k', 'w0', 'w1', 'mode', 'reg'].forEach(function (f) {
        sel(f).addEventListener('change', f === 'k' ? load : render);
      });
      load();
    }).catch(function (e) { fail(node, e); });
  }

  /* ── 5b. THE MARKET AREA BUILDER ─────────────────────────────────────────
     The explorer above builds a table on the attention layer, where the unit
     is a state and the axis is a month. This one builds a table on the schools
     layer, where the unit is a Christian Education Market Area and the figures
     come from one census vintage rather than from a monthly series. The two
     are separate tools on one page for the same reason they are never plotted
     together: a standing among fifty states in July and a count of schools in
     a census are not comparable quantities, and a table that carried both
     columns would invite a reader to divide one by the other.

     Everything here is filtered, sorted, and written in the browser from a
     single 68 KB payload, so a reader who wants all 262 rows with every column
     pays one request for them and leaves with a CSV that carries the same
     header block the report exports carry. */
  function cemabuilder(node) {
    var A = null, M = null, CN = null, REG = {}, order = { k: 'rank', dir: 1 };
    var COLS = [
      { k: 'name', t: 'Christian Education Market Area', on: true, fixed: true },
      { k: 'state', t: 'State', on: true },
      { k: 'region', t: 'Region', on: false },
      { k: 'counties', t: 'Counties', on: false, n: true },
      { k: 'schools', t: 'Schools', on: true, n: true },
      { k: 'students', t: 'Enrollments', on: true, n: true },
      { k: 'pop', t: 'Children aged five through seventeen', on: false, n: true },
      { k: 'spk', t: 'Enrollments per 1,000', on: true, n: true },
      { k: 'rank', t: 'Standing of 262', on: true, n: true },
      { k: 'instate', t: 'Standing in its state', on: false, n: true }
    ];
    var Q = new URLSearchParams(location.search);

    node.innerHTML =
      '<div class="tools">' +
      '<label>State <select data-f="st"></select></label>' +
      '<label>Region <select data-f="reg"></select></label>' +
      '<label>Size <select data-f="min">' +
      '<option value="0">Every market area</option>' +
      '<option value="5">Five schools or more</option>' +
      '<option value="10">Ten schools or more</option>' +
      '<option value="25">Twenty-five schools or more</option>' +
      '<option value="50">Fifty schools or more</option>' +
      '</select></label>' +
      '<label>Name contains <input data-f="q" type="search" size="14" ' +
      'placeholder="Grand Rapids" autocomplete="off"></label>' +
      '</div>' +
      '<fieldset class="colpick"><legend>Columns to carry</legend>' +
      '<div class="colchips" data-c="cols"></div></fieldset>' +
      '<div class="egbtns cemabtns">' +
      '<button class="linkbtn" data-a="csv" type="button">Download this table as CSV</button>' +
      '<button class="linkbtn" data-a="tsv" type="button">Copy the table</button>' +
      '<button class="linkbtn" data-a="link" type="button">Copy a link to this table</button>' +
      '<button class="linkbtn" data-a="all" type="button">Every column, every market area</button>' +
      '</div><div data-c="grid"></div>';

    function sel(f) { return node.querySelector('[data-f="' + f + '"]'); }
    function on(k) { var c = col(k); return c && c.on; }
    function col(k) {
      for (var i = 0; i < COLS.length; i++) { if (COLS[i].k === k) { return COLS[i]; } }
      return null;
    }
    function shown() { return COLS.filter(function (c) { return c.on; }); }

    /* A cell's value, once, so the table and both exports cannot disagree. */
    function cell(m, k) {
      if (k === 'region') { return REG[m.state] || ''; }
      if (k === 'counties') { return CN ? (CN[m.id] || 0) : null; }
      if (k === 'instate') { return m._in; }
      return m[k];
    }
    function text(m, k) {
      var v = cell(m, k);
      if (v === null || v === undefined || v === '') { return '—'; }
      if (k === 'spk') { return v.toFixed(1); }
      if (k === 'instate') { return ordinal(v) + ' of ' + m._of; }
      return col(k).n ? num(v) : String(v);
    }

    function rows() {
      var st = sel('st').value, reg = sel('reg').value,
        min = +sel('min').value, q = (sel('q').value || '').trim().toLowerCase();
      var out = A.filter(function (m) {
        if (st && m.state !== st) { return false; }
        if (reg && (REG[m.state] || '') !== reg) { return false; }
        if (min && (m.schools || 0) < min) { return false; }
        if (q && m.name.toLowerCase().indexOf(q) < 0) { return false; }
        return true;
      });
      var k = order.k;
      out.sort(function (a, b) {
        var x = cell(a, k), y = cell(b, k);
        if (x === null || x === undefined) { x = k === 'name' || k === 'state' ? '' : -1; }
        if (y === null || y === undefined) { y = k === 'name' || k === 'state' ? '' : -1; }
        var c = typeof x === 'string' ? x.localeCompare(y) : (x - y);
        return c * order.dir || a.name.localeCompare(b.name);
      });
      return out;
    }

    function chips() {
      node.querySelector('[data-c="cols"]').innerHTML = COLS.map(function (c) {
        return '<label class="chip' + (c.on ? ' iso' : '') + (c.fixed ? ' fixed' : '') + '">' +
          '<input type="checkbox" data-col="' + c.k + '"' + (c.on ? ' checked' : '') +
          (c.fixed ? ' disabled' : '') + '> ' + esc(c.t) + '</label>';
      }).join('');
    }

    function render() {
      var R = rows(), cols = shown();
      var head = cols.map(function (c) {
        return '<th class="' + (c.n ? 'n ' : '') + 'sortable' +
          (order.k === c.k ? ' sorted' : '') + '" data-sort="' + c.k + '">' + esc(c.t) +
          (order.k === c.k ? (order.dir > 0 ? ' &uarr;' : ' &darr;') : '') + '</th>';
      }).join('') + '<th>Records</th>';
      var body = R.map(function (m) {
        return '<tr>' + cols.map(function (c) {
          var v = text(m, c.k);
          if (c.k === 'name') {
            return '<td><a href="' + BASE + 'markets/' + m.id + '.html">' + esc(m.name) + '</a></td>';
          }
          return '<td class="' + (c.n ? 'n' : '') + '">' + esc(v) + '</td>';
        }).join('') + '<td class="n"><a href="' + BASE + 'data/market-' + m.id +
          '.csv" download>CSV</a></td></tr>';
      }).join('');
      node.querySelector('[data-c="grid"]').innerHTML =
        (R.length ? '<div class="tablewrap"><table class="data"><thead><tr>' + head +
          '</tr></thead><tbody>' + body + '</tbody></table></div>'
          : '<p class="srctag">No market area matches those filters. Widen one of them.</p>') +
        '<p class="srctag">' + R.length + ' of 262 Christian Education Market Areas, ' +
        cols.length + ' columns, from the ' + esc(M.vintage) + ' school census. ' +
        'A standing here is a place among the 262 market areas on enrollments per 1,000 ' +
        'children aged five through seventeen. It is a position rather than a count, ' +
        'and it belongs to the schools layer, so it is not comparable with a standing ' +
        'among the fifty states in the table above. The Records column is that market ' +
        'area&rsquo;s own export: every school the census records there, with its city, ' +
        'its level, and its enrollment.</p>';

      node.querySelectorAll('th.sortable').forEach(function (th) {
        th.onclick = function () {
          var k = th.getAttribute('data-sort');
          if (order.k === k) { order.dir = -order.dir; }
          else { order.k = k; order.dir = (k === 'name' || k === 'state' || k === 'region') ? 1
            : (k === 'rank' || k === 'instate' ? 1 : -1); }
          render();
        };
      });
    }

    /* The header block is the one the report exports carry, so a row that
       leaves this page can be traced back to the census it came from. */
    function grid() {
      var R = rows(), cols = shown();
      var out = [['# Spring Vale Christian Education Institute', 'Owosso, Michigan'],
        ['# dataset', 'Christian Education Market Areas, built in the data explorer'],
        ['# window', M.window],
        ['# school census vintage', M.vintage],
        ['# license', 'CC BY 4.0'],
        ['# correct use', 'These are counts and positions on the schools layer. A ' +
          'standing is a place among the 262 market areas in one census vintage. It is ' +
          'not an index reading, and it is not comparable with a standing among the ' +
          'fifty states, which is measured on a different layer and a different axis.'],
        ['# built by', siteURL('explorer/index.html')], []];
      out.push(['market_area_id'].concat(cols.map(function (c) { return c.k; })));
      R.forEach(function (m) {
        out.push([m.id].concat(cols.map(function (c) {
          var v = cell(m, c.k);
          return v === null || v === undefined ? '' : v;
        })));
      });
      return out;
    }
    function join(g, sep) {
      return g.map(function (r) {
        return r.map(function (c) {
          c = String(c);
          if (sep === '\t') { return c.replace(/[\t\n]/g, ' '); }
          return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
        }).join(sep);
      }).join('\n');
    }
    function link() {
      var p = new URLSearchParams();
      ['st', 'reg', 'min', 'q'].forEach(function (f) {
        var v = sel(f).value;
        if (v && v !== '0') { p.set(f, v); }
      });
      p.set('cols', shown().map(function (c) { return c.k; }).join('.'));
      p.set('sort', order.k + (order.dir > 0 ? '' : '-'));
      return siteURL('explorer/index.html') + '?' + p.toString() + '#areas';
    }

    node.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-a]') : null;
      if (!b || !node.contains(b)) { return; }
      var a = b.getAttribute('data-a');
      if (a === 'csv') {
        download(join(grid(), ','), 'svcei-market-areas.csv');
      } else if (a === 'tsv') {
        copy(join(grid().slice(8), '\t'), b);
      } else if (a === 'link') {
        copy(link(), b);
      } else if (a === 'all') {
        COLS.forEach(function (c) { c.on = true; });
        ['st', 'reg', 'q'].forEach(function (f) { sel(f).value = ''; });
        sel('min').value = '0';
        chips(); need();
      }
    });
    node.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute && t.hasAttribute('data-col')) {
        var c = col(t.getAttribute('data-col'));
        if (c) { c.on = t.checked; }
        t.closest('.chip').classList.toggle('iso', t.checked);
        if (order.k && !on(order.k)) { order.k = 'rank'; order.dir = 1; }
        need();
      } else if (t.hasAttribute && t.hasAttribute('data-f')) { render(); }
    });
    sel('q').addEventListener('input', function () { render(); });

    /* The county column is the only one that costs a second request, so it is
       fetched the first time somebody asks for it and never again. */
    function need() {
      if (on('counties') && !CN) {
        get('data/county_market.json').then(function (d) {
          CN = {};
          Object.keys(d.counties || {}).forEach(function (f) {
            var id = d.counties[f][0];
            CN[id] = (CN[id] || 0) + 1;
          });
          render();
        }).catch(function () { CN = {}; render(); });
        return;
      }
      render();
    }

    Promise.all([get('data/atlas.json'), get('data/manifest.json')]).then(function (r) {
      var at = r[0]; M = r[1];
      A = at.markets.slice();
      M.states.forEach(function (x) { REG[x.s] = x.region; });
      /* A standing inside a state is the same measure as the national one, cut
         to the state, so it is computed here rather than shipped 262 times. */
      var by = {};
      A.slice().sort(function (a, b) { return (b.spk || 0) - (a.spk || 0); })
        .forEach(function (m) {
          by[m.state] = (by[m.state] || 0) + 1;
          m._in = by[m.state];
        });
      A.forEach(function (m) { m._of = by[m.state]; });
      M.vintage = at.vintage; M.window = at.window;

      var sts = Object.keys(by).sort();
      sel('st').innerHTML = '<option value="">Every state</option>' + sts.map(function (s) {
        return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
      sel('reg').innerHTML = '<option value="">Every Region</option>' +
        M.regions.map(function (g) {
          return '<option value="' + esc(g.name) + '">' + esc(g.name) + '</option>'; }).join('');

      if (Q.get('cols')) {
        var want = Q.get('cols').split('.');
        COLS.forEach(function (c) { c.on = c.fixed || want.indexOf(c.k) >= 0; });
      }
      ['st', 'reg', 'min', 'q'].forEach(function (f) {
        if (Q.get(f)) { sel(f).value = Q.get(f); }
      });
      if (Q.get('sort')) {
        var s = Q.get('sort');
        order.dir = /-$/.test(s) ? -1 : 1;
        order.k = s.replace(/-$/, '');
        if (!col(order.k)) { order.k = 'rank'; }
      }
      chips(); need();
    }).catch(function (e) { fail(node, e); });
  }

  /* ── 6. A SCORECARD ON DEMAND ────────────────────────────────────────────
     Fifty states across 271 windows is more documents than anyone will ever
     pre-render, so the scorecard is drawn here from the published payloads and
     printed from the browser. It carries the same window, the same figures and
     the same correct-use note the report carries. */
  function scorecard(node) {
    var M, S = {}, ATLAS = null, STGEO = null, CTY = {}, CM = null;
    node.innerHTML =
      '<div class="tools noprint">' +
      '<label>State <select data-f="g"></select></label>' +
      '<label>Window <select data-f="w"></select></label>' +
      '<button class="linkbtn" data-a="print" type="button">Print or save as PDF</button>' +
      '<button class="linkbtn" data-a="link" type="button">Copy link to this scorecard</button>' +
      '</div><div class="scard" data-c="card"></div>';
    function sel(f) { return node.querySelector('[data-f="' + f + '"]'); }

    /* ── the locator ──────────────────────────────────────────────────────
       The mark the printed reports carry, drawn here from the same geometry,
       so a scorecard and a report of the same state are recognizably one
       publication. It carries no scale and no key: the country pale, this
       state filled in its own standing's color. */
    function locator(g, rank, of) {
      if (!STGEO) { return ''; }
      var c = rank ? RAMP[Math.min(RAMP.length - 1,
        Math.floor((rank - 1) / (of || 50) * RAMP.length))] : '#d8d8d8';
      var out = ['<svg class="scloc" viewBox="' + STGEO.viewBox + '" role="img" ' +
        'aria-label="' + esc(g) + ' within the United States">'];
      Object.keys(STGEO.paths).forEach(function (n) {
        if (n === g) { return; }
        out.push('<path d="' + STGEO.paths[n] + '" fill="#eceef1" stroke="#fff" ' +
          'stroke-width="1"/>');
      });
      if (STGEO.paths[g]) {
        /* Drawn last, so no neighbour paints over its border. */
        out.push('<path d="' + STGEO.paths[g] + '" fill="' + c + '" stroke="#fff" ' +
          'stroke-width="1"/>');
      }
      return out.join('') + '</svg>';
    }

    /* ── the record in one line ───────────────────────────────────────────
       Every month from the first to the chosen one, first at the top. The
       chosen month is marked, because a scorecard for July 2019 that draws
       the line to 2026 is showing a reader figures its own header does not
       claim. */
    function recordline(g, w) {
      var s = S.master;
      if (!s) { return ''; }
      var j = s.states.indexOf(g), ws = s.windows, cut = ws.indexOf(w);
      if (j < 0 || cut < 0) { return ''; }
      var W = 640, H = 96, pad = 5;
      /* Seeded outside the scale rather than at its ends. Seeding lo at 50
         meant a state that had never been worse than third was still told its
         worst was fiftieth, which is a false statement about the record. */
      var pts = [], lo = 0, hi = 51;
      for (var i = 0; i <= cut; i++) {
        var v = (s.rank[ws[i]] || [])[j];
        if (v === null || v === undefined) { continue; }
        pts.push([pad + i / Math.max(1, ws.length - 1) * (W - pad * 2),
          pad + (v - 1) / 49 * (H - pad * 2), v, ws[i]]);
        if (v < hi) { hi = v; }
        if (v > lo) { lo = v; }
      }
      if (pts.length < 2) { return ''; }
      var d = pts.map(function (q, i) {
        return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
      }).join('');
      var last = pts[pts.length - 1];
      var years = ['2004', '2010', '2016', '2022'].map(function (y) {
        var i = ws.indexOf(y + '-01');
        if (i < 0 || i > cut) { return null; }
        return { y: y, at: i / Math.max(1, ws.length - 1) };
      }).filter(Boolean);
      var ticks = years.map(function (t) {
        var x = pad + t.at * (W - pad * 2);
        return '<line class="scgrid" x1="' + x.toFixed(1) + '" y1="' + pad +
          '" x2="' + x.toFixed(1) + '" y2="' + (H - pad) + '"/>';
      }).join('');
      var yearrow = '<div class="scyears">' + years.map(function (t) {
        return '<span style="left:' + (t.at * 100).toFixed(2) + '%">' + t.y +
          '</span>';
      }).join('') + '<span class="last" style="left:100%">' + w.slice(0, 4) +
        '</span></div>';
      return '<div class="sclinewrap">' +
        '<div class="scax"><span>1st</span><span>50th</span></div>' +
        '<svg class="scline" viewBox="0 0 ' + W + ' ' + H + '" ' +
        'preserveAspectRatio="none" role="img" aria-label="' + esc(g) +
        ' rank on the Master Index, ' + ws[0] + ' to ' + w + '">' +
        ticks + '<path class="scpath" d="' + d + '"/>' +
        '<circle class="scnow" cx="' + last[0].toFixed(1) + '" cy="' +
        last[1].toFixed(1) + '" r="4"/></svg></div>' + yearrow +
        '<p class="scnote"><span>Best ' + ordinal(hi) + '</span>' +
        '<span>Worst ' + ordinal(lo) + '</span>' +
        '<span>' + wname(w) + '&nbsp;&middot;&nbsp;' + ordinal(last[2]) +
        '</span></p>' +
        '<p class="srctag">The whole record on a fixed scale that runs from ' +
        'first at the top to fiftieth at the bottom, so a state that barely ' +
        'moves draws a line that barely moves. The scale is not fitted to the ' +
        'state.</p>';
    }

    /* ── twelve months, in places ─────────────────────────────────────────
       A movement is a change in standing. It is never called growth, and the
       arrow is a direction in a list rather than a direction in a quantity. */
    function movement(g, w) {
      var out = M.indices.map(function (x) {
        var s = S[x.key];
        if (!s) { return null; }
        var j = s.states.indexOf(g), i = s.windows.indexOf(w);
        if (j < 0 || i < 12) { return null; }
        var now = (s.rank[w] || [])[j], then = (s.rank[s.windows[i - 12]] || [])[j];
        return { name: x.name, d: (!now || !then) ? null : then - now };
      }).filter(Boolean);
      if (!out.length) { return ''; }
      var gaps = out.filter(function (r) { return r.d === null; }).length;
      return '<div class="scmoves">' + out.map(function (r) {
        if (r.d === null) {
          return '<div class="scmove none"><b>&mdash;</b><span>' + esc(r.name) +
            '</span></div>';
        }
        var k = r.d > 0 ? 'up' : (r.d < 0 ? 'down' : 'flat');
        var t = r.d > 0 ? '&uarr; ' + r.d : (r.d < 0 ? '&darr; ' + (-r.d) : 'held');
        return '<div class="scmove ' + k + '"><b>' + t + '</b><span>' +
          esc(r.name) + '</span></div>';
      }).join('') + '</div>' +
        (gaps ? '<p class="srctag">A dash is an index that measured no standing ' +
          'for this state in one of the two months, so there is no movement to ' +
          'report. It is a statement about what could be measured and never ' +
          'about the state.</p>' : '') +
        '<p class="srctag">Places moved between this month and the same month a year ' +
        'earlier. A movement is a change in standing among the states measured, and it ' +
        'is never growth or decline in any quantity.</p>';
    }

    /* ── the Region, in order ─────────────────────────────────────────────── */
    function region(g, w, reg) {
      if (!reg) { return ''; }
      var grp = (M.regions || []).filter(function (r) { return r.name === reg; })[0];
      var s = S.master;
      if (!grp || !s) { return ''; }
      var rows = (grp.members || []).map(function (n) {
        var j = s.states.indexOf(n);
        return { s: n, rank: j < 0 ? null : (s.rank[w] || [])[j] };
      }).filter(function (r) { return r.rank; }).sort(function (a, b) {
        return a.rank - b.rank;
      });
      if (!rows.length) { return ''; }
      return '<ol class="screg">' + rows.map(function (r) {
        return '<li' + (r.s === g ? ' class="me"' : '') + '><span>' +
          (r.s === g ? esc(r.s) : '<a href="' + BASE + 'states/' + slug(r.s) +
            '.html">' + esc(r.s) + '</a>') + '</span><b>' + ordinal(r.rank) +
          '</b></li>';
      }).join('') + '</ol>' +
        '<p class="srctag">The ' + esc(reg) + ' in ' + wname(w) +
        ', by standing on the Master Index. A Region is a grouping of states the ' +
        'Institute defines and is not a Census division.</p>';
    }

    /* ── the schools layer ────────────────────────────────────────────────
       Below its own rule, under its own heading, with the census vintage named
       rather than the month. A reader who has picked July 2019 above is looking
       at a 2024 census here, and the card has to say so rather than let the
       header's month appear to govern both halves. */
    function schools(g, P, w) {
      if (!P) { return ''; }
      var mk = (P.markets || []).slice().sort(function (a, b) {
        return (b.spk || 0) - (a.spk || 0);
      });
      var stat = [
        ['Christian schools', num(P.schools)],
        ['Enrollments', num(P.students)],
        ['Children five to seventeen', num(P.pop)],
        ['Enrollments per 1,000', (P.spk === null || P.spk === undefined)
          ? '&mdash;' : P.spk.toFixed(1)]
      ];
      var rows = mk.map(function (m) {
        return '<tr><td><a href="' + BASE + 'markets/' + m.id + '.html">' +
          esc(m.name) + '</a></td><td class="n">' + num(m.schools) +
          '</td><td class="n">' + num(m.students) + '</td><td class="n">' +
          (m.spk === null || m.spk === undefined ? '—' : m.spk.toFixed(1)) +
          '</td><td class="n">' + (m.rank ? ordinal(m.rank) : '—') + '</td></tr>';
      }).join('');
      return '<div class="scrule"><span>The schools layer</span></div>' +
        '<p class="scintro">These are counts from the federal private school census, not ' +
        'readings from an index. They belong to the census vintage rather than to ' +
        wname(w) + ', they do not move from month to month, and nothing on this half of ' +
        'the card may be divided by anything on the other half.</p>' +
        '<div class="scsplit2"><div class="scmapbox" data-c="statemap"></div>' +
        '<div><div class="scstats">' + stat.map(function (r) {
          return '<div><b>' + r[1] + '</b><span>' + r[0] + '</span></div>';
        }).join('') + '</div>' +
        '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th>Christian Education Market Area</th><th class="n">Schools</th>' +
        '<th class="n">Enrollments</th><th class="n">Per 1,000</th>' +
        '<th class="n">Of 262</th></tr></thead><tbody>' + rows +
        '</tbody></table></div></div></div>';
    }

    /* The density map, cut to one state. The quintile cuts are computed across
       all 262 market areas rather than within the state, so a shade means the
       same thing on Wyoming's card as it does on Texas's. */
    function statemap(host, g, P) {
      if (!host || !ATLAS || !CM) { return; }
      var fips = null;
      (P.markets || []).forEach(function (m) {
        if (!fips) { fips = String(m.id).slice(0, 2); }
      });
      if (!fips) { return; }
      var all = ATLAS.markets.map(function (m) { return m.spk; })
        .filter(function (v) { return v || v === 0; }).sort(function (a, b) { return a - b; });
      var cuts = [0.2, 0.4, 0.6, 0.8].map(function (q) {
        return all[Math.floor(all.length * q)];
      });
      var spk = {};
      ATLAS.markets.forEach(function (m) { spk[m.id] = m.spk; });
      learnNames(ATLAS.markets);
      var name = {};
      ATLAS.markets.forEach(function (m) { name[m.id] = m.name; });

      var draw = function (geo) {
        var paths = Object.keys(geo.paths).map(function (f) {
          var row = CM[f] || [], mid = row[0];
          var v = mid === undefined ? null : spk[mid];
          var fill = '#ececec';
          if (v || v === 0) {
            var i = 0;
            while (i < cuts.length && v > cuts[i]) { i++; }
            fill = RAMP[RAMP.length - 1 - i * 2];
          }
          return '<path d="' + geo.paths[f] + '" fill="' + fill +
            '" stroke="#fff" stroke-width="0.7"><title>' + esc(row[1] || '') +
            (mid ? ' — ' + esc(name[mid] || mid) + ', ' +
              (v || v === 0 ? v.toFixed(1) + ' per 1,000' : 'no reading') : '') +
            '</title></path>';
        }).join('');
        host.innerHTML = '<svg viewBox="' + geo.viewBox + '" class="scstmap" ' +
          'role="img" aria-label="Counties of ' + esc(g) +
          ' shaded by Christian school enrollments per 1,000 children">' + paths +
          (geo.outline ? '<path d="' + geo.outline + '" fill="none" stroke="#1a1a1a" ' +
            'stroke-width="1.1"/>' : '') + '</svg>' +
          '<div class="multkey"><span>highest fifth</span>' +
          [0, 2, 4, 6, 8].map(function (i) {
            return '<i style="background:' + RAMP[RAMP.length - 1 - i] + '"></i>';
          }).reverse().join('') + '<span>lowest fifth</span></div>' +
          '<p class="srctag">Every county in ' + esc(g) + ', shaded by the Christian ' +
          'school enrollments per 1,000 children of the market area it belongs to. The ' +
          'five steps are cut across all 262 market areas, so a shade means the same ' +
          'thing here as it does on any other state&rsquo;s card.</p>';
      };
      if (CTY[fips]) { draw(CTY[fips]); return; }
      get('data/geo/counties/' + fips + '.json').then(function (geo) {
        CTY[fips] = geo;
        draw(geo);
      }).catch(function () { host.innerHTML = ''; });
    }

    /* The same cartogram the Indices and States pages carry, cut to one month
       and one index, with this card's state ringed. No controls: a card is a
       sheet of paper and a printed sheet has nothing to press. */
    function tiles(g, w) {
      var ms = S.master;
      if (!ms) { return ''; }
      /* The District has no tile on a fifty-state grid, so the card does not
         claim to outline it. */
      var has = false;
      (M.states || []).forEach(function (x) {
        if (x.s === g && TILEGRID[x.abbr]) { has = true; }
      });
      if (!has) { return ''; }
      var ranks = ms.rank[w] || [];
      var of = (ms.measured || {})[w] || ranks.filter(function (x) { return x; }).length || 50;
      var a2 = {};
      (M.states || []).forEach(function (x) { a2[x.abbr] = x.s; });
      var j = ms.states.indexOf(g), r = j < 0 ? null : ranks[j];
      return '<div class="sctiles">' + tileplate(ms.states, ranks, of, a2, g) +
        '<p class="srctag">Every state as a tile of the same size, shaded by its ' +
        'standing on the Master Index in ' + wname(w) + '. ' + esc(g) + ' is outlined' +
        (r ? ', and stands ' + ordinal(r) + ' of ' + of : '') + '. A map of the country ' +
        'gives a large state more ink than a small one; here every state carries the ' +
        'same weight. Darker is a stronger standing.</p></div>';
    }

    function render() {
      var g = sel('g').value, w = sel('w').value, card = node.querySelector('[data-c="card"]');
      var rows = M.indices.map(function (x) {
        var s = S[x.key];
        if (!s) { return null; }
        var j = s.states.indexOf(g);
        return { name: x.name, rank: (s.rank[w] || [])[j], ratio: (s.ratio[w] || [])[j],
          of: (s.measured || {})[w] || 50 };
      }).filter(Boolean);
      var mas = rows[0] || {};
      var reg = (M.states.filter(function (x) { return x.s === g; })[0] || {}).region || '';
      card.innerHTML =
        '<div class="scardhead"><div class="ck">State Scorecard</div><h3>' + esc(g) + '</h3>' +
        '<p class="scardsub">' + wname(w) + (reg ? ' &middot; ' + esc(reg) : '') + '</p></div>' +
        '<div class="scsplit"><div>' +
        '<div class="tablewrap"><table class="data"><thead><tr><th>Index</th>' +
        '<th class="n">Standing</th><th class="n">Of</th>' +
        '<th class="n">Ratio to the median state</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.name) + '</td><td class="n">' +
            (r.rank ? ordinal(r.rank) : '—') + '</td><td class="n">' + r.of +
            '</td><td class="n">' + (r.ratio ? r.ratio.toFixed(2) + '×' : '—') +
            '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<div class="sclocbox">' + locator(g, mas.rank, mas.of) +
        '<div class="scbig"><b>' + (mas.rank ? ordinal(mas.rank) : '—') + '</b>' +
        '<span>of ' + (mas.of || 50) + ' on the Master Index</span></div>' +
        (mas.ratio ? '<p class="scratio">' + mas.ratio.toFixed(2) +
          '&times; the median state</p>' : '') +
        '</div></div>' +
        '<h4 class="scband">The record, first to ' + wname(w) + '</h4>' +
        recordline(g, w) +
        '<h4 class="scband">Twelve months, in places</h4>' + movement(g, w) +
        (reg ? '<h4 class="scband">In the ' + esc(reg) + '</h4>' + region(g, w, reg) : '') +
        '<h4 class="scband">Every state, equal weight</h4>' + tiles(g, w) +
        '<div data-c="schools"></div>' +
        '<p class="srctag">' + esc(g) + ' stands ' + (mas.rank ? ordinal(mas.rank) : '—') +
        ' of ' + (mas.of || 50) + ' states on the Master Index in ' + wname(w) + '. ' +
        'A standing is a place among the fifty states in one month; a ratio is that state ' +
        'against the median state in the same month. A movement is a change in standing ' +
        'rather than growth or decline in any quantity. ' +
        '<a href="' + BASE + 'states/' + slug(g) + '.html">The full state page</a> &middot; ' +
        '<a href="' + BASE + 'data/' + slug(g) + '.csv">The complete series as CSV</a> &middot; ' +
        '<a href="' + BASE + 'cite/index.html">Citation and correct use</a>.</p>';

      /* The schools half needs a payload of its own, so it arrives when it
         arrives rather than holding up the half that is already drawn. */
      var box = card.querySelector('[data-c="schools"]');
      get('data/state/' + slug(g) + '.json').then(function (D) {
        box.innerHTML = schools(g, D.provision, w);
        statemap(box.querySelector('[data-c="statemap"]'), g, D.provision || {});
      }).catch(function () { box.innerHTML = ''; });

      var u = new URL(location.href);
      u.searchParams.set('g', slug(g)); u.searchParams.set('w', w);
      history.replaceState(null, '', u);
    }

    get('data/manifest.json').then(function (m) {
      M = m;
      var q = new URLSearchParams(location.search);
      var want = M.states.filter(function (x) { return x.slug === q.get('g'); })[0];
      sel('g').innerHTML = M.states.map(function (x) {
        return '<option' + (want && want.s === x.s ? ' selected' : '') + '>' + esc(x.s) + '</option>';
      }).join('');
      sel('w').innerHTML = M.windows.slice().reverse().map(function (w) {
        return '<option value="' + w + '"' + (w === q.get('w') ? ' selected' : '') + '>' +
          wname(w) + '</option>';
      }).join('');
      return Promise.all(M.indices.map(function (x) {
        return get('data/series/' + x.key + '.json').then(function (s) { S[x.key] = s; });
      }));
    }).then(function () {
      ['g', 'w'].forEach(function (f) { sel(f).addEventListener('change', render); });
      node.querySelector('[data-a="print"]').addEventListener('click', function () { window.print(); });
      node.querySelector('[data-a="link"]').addEventListener('click', function (e) {
        copy(location.href, e.target);
      });
      render();
      /* The three payloads the lower half needs. They are fetched after the
         first paint, so the standings are on screen while they travel. */
      Promise.all([get('data/geo/states.json'), get('data/atlas.json'),
        get('data/county_market.json')]).then(function (x) {
        STGEO = x[0]; ATLAS = x[1]; CM = (x[2] || {}).counties || {};
        render();
      }).catch(function () { /* the card stands without them */ });
    }).catch(function (e) { fail(node, e); });
  }

  /* ── 7. THE METHODOLOGY WALKTHROUGH ──────────────────────────────────────
     One state taken through the calculation, step by step, using published
     figures only. A reader can follow the arithmetic end to end without ever
     seeing a constituent, a term, or a provider name. That boundary is D-018
     and this feature is built so that it cannot be crossed: the payloads it
     reads do not contain the inputs, so there is nothing here to disclose. */
  function walkthrough(node) {
    var M, S;
    node.innerHTML =
      '<div class="tools"><label>Walk through <select data-f="g"></select></label>' +
      '<label>in <select data-f="w"></select></label></div>' +
      '<ol class="walk" data-c="steps"></ol>';
    function sel(f) { return node.querySelector('[data-f="' + f + '"]'); }

    function render() {
      var g = sel('g').value, w = sel('w').value, j = S.states.indexOf(g);
      var row = (S.rank[w] || []), rat = (S.ratio[w] || []);
      var vals = rat.filter(function (x) { return x !== null && x !== undefined; }).slice().sort(
        function (a, b) { return a - b; });
      var med = vals.length ? vals[Math.floor(vals.length / 2)] : 1;
      var mine = rat[j], rank = row[j];
      var ranked = row.filter(function (x) { return x; }).length;
      var ahead = row.filter(function (x) { return x && x < rank; }).length;
      var steps = [
        ['The constituents are measured for every state in the same window',
         'Each constituent of the Master Index is measured for all fifty states over the same ' +
         'window, so no state is compared against a different period. What the constituents ' +
         'are is not published: the Institute publishes results and does not publish inputs.'],
        ['Each constituent is rescaled against the median state',
         'Every constituent is divided by the median of its own fifty readings, so each one ' +
         'has a median of 100. This is what makes a small state and a large state comparable ' +
         'on the same scale, and it is why the index is a position rather than a count.'],
        ['The rescaled constituents are combined into the index',
         'The combined index does not have a median of 100, and it never has. The median of a ' +
         'combination is not the combination of the medians, so the Institute states the ' +
         'median for the window or gives the reading as a ratio to it. In ' + wname(w) +
         ' the median state is the middle of ' + ranked + ' ranked states.'],
        [esc(g) + ' against the median state in ' + wname(w),
         mine ? esc(g) + ' reads <strong>' + (mine / med).toFixed(2) + ' times the median ' +
           'state</strong> on the Master Index in this window. A state at twice the median is ' +
           'oriented twice as strongly as the middle of the country; one at half of it, half ' +
           'as strongly.' : 'This state has no reading in this window.'],
        ['That ratio places the state in the order',
         rank ? 'Sorting the fifty states by that figure puts ' + esc(g) + ' <strong>' +
           ordinal(rank) + '</strong>, with ' + spell(ahead) + ' ' +
           (ahead === 1 ? 'state' : 'states') + ' ahead of it and ' +
           spell(ranked - ahead - 1) + ' behind. That standing is what the reports quote.'
           : 'With no reading, the state takes no place in the order.'],
        ['Every figure above can be checked against a published file',
         'The standings and the ratios on this page come from the same export the reports are ' +
         'built from. <a href="' + BASE + 'data/' + slug(g) + '.csv">Download the complete ' +
         'series for ' + esc(g) + '</a> and the arithmetic in steps four and five can be ' +
         'reproduced from it in a spreadsheet.']
      ];
      node.querySelector('[data-c="steps"]').innerHTML = steps.map(function (s) {
        return '<li><h4>' + s[0] + '</h4><p>' + s[1] + '</p></li>';
      }).join('');
    }

    get('data/manifest.json').then(function (m) {
      M = m;
      sel('g').innerHTML = M.states.map(function (x) {
        return '<option' + (x.s === 'Michigan' ? ' selected' : '') + '>' + esc(x.s) + '</option>';
      }).join('');
      sel('w').innerHTML = M.windows.slice().reverse().map(function (w) {
        return '<option value="' + w + '">' + wname(w) + '</option>'; }).join('');
      return get('data/series/master.json');
    }).then(function (s) {
      S = s;
      ['g', 'w'].forEach(function (f) { sel(f).addEventListener('change', render); });
      render();
    }).catch(function (e) { fail(node, e); });
  }

  /* ── 9. EMBEDDABLE CHARTS ────────────────────────────────────────────────
     A chart travels further than a PDF does. The frame is a page of this site,
     so an embedded chart cannot drift from the figure it came from, and the
     attribution is part of the frame rather than an honor system. */
  /* ── the embeddable catalogue ──────────────────────────────────────────────
     Everything the Institute draws is drawn from a published payload by a
     function that takes a host element. That is the whole reason a figure can
     be embedded at all: the embed frame is the same code as the page, given a
     different frame, so an embedded figure cannot drift from the one on the
     site and there is no second implementation to keep in step.

     Each entry says what it is, what it needs, and how to build its host. The
     gallery reads this list, and so does the frame. One list, two readers. */
  var EMBEDS = [
    { id: 'rankline', group: 'Charts', name: 'One state against another',
      about: 'Standing or ratio to the median, every month since 2004, for up '
        + 'to five states on one chart.',
      params: ['k', 's', 'mode'], h: 330 },
    { id: 'spread', group: 'Charts', name: 'Every state against the median',
      about: 'One dot per state on a logarithmic scale, this month, extremes '
        + 'named.', params: ['k'], h: 260 },
    { id: 'leaders', group: 'Charts', name: 'Who has led, year by year',
      about: 'First place at the December of every year, drawn as bands.',
      params: ['k'], h: 300 },
    { id: 'movers', group: 'Tables', name: 'The largest movements in a year',
      about: 'The six states that rose furthest and the six that fell '
        + 'furthest, over twelve months.', params: ['k'], h: 430 },
    { id: 'standings', group: 'Tables', name: 'The present month, in full',
      about: 'Every state in rank order, with its ratio to the median and its '
        + 'movement.', params: ['k'], h: 560 },
    { id: 'statemap', group: 'Maps', name: 'The country on one index',
      about: 'Fifty states shaded by standing, with an index switcher.',
      params: [], h: 500 },
    { id: 'marketrate', group: 'Maps', name: 'How thin the country is',
      about: '262 Christian Education Market Areas shaded by Christian school '
        + 'enrollments per 1,000 children.', params: [], h: 520 },
    { id: 'marketthin', group: 'Maps', name: 'Where there is almost none',
      about: 'The market areas at or below twenty enrollments per 1,000. Two '
        + 'colors, one question.', params: [], h: 520 },
    { id: 'churchratio', group: 'Maps', name: 'Many churches, few schools',
      about: 'Christian schools per hundred Christian congregations, market '
        + 'area by market area.', params: [], h: 520 },
    { id: 'policydateline', group: 'Maps', name: 'Where the record is watching',
      about: 'How recently a policy event was recorded in each state, with '
        + 'unread states left white.', params: [], h: 480 },
    { id: 'yeargrid', group: 'Maps', name: 'Twenty-two Decembers',
      about: 'One small map a year for a single state, shaded by its position '
        + 'that December.', params: ['state'], h: 520 },
    { id: 'carpet', group: 'Maps', name: 'The counties, and how they group',
      about: 'Every county in a state, colored by the market area it belongs '
        + 'to.', params: ['state'], h: 560 },
    { id: 'regionleague', group: 'Charts', name: 'The eight Regions',
      about: 'Each Region by the median standing of its member states.',
      params: [], h: 420 },
    { id: 'coverage', group: 'Charts', name: 'How much of the record carried',
      about: 'How many constituents registered a reading in each index this '
        + 'month. A count of what could be measured.', params: [], h: 340 }
  ];

  function embedById(id) {
    for (var i = 0; i < EMBEDS.length; i++) {
      if (EMBEDS[i].id === id) { return EMBEDS[i]; }
    }
    return EMBEDS[0];
  }

  /* One figure, drawn into the frame. Each case builds the host the widget
     expects and hands it to the same function the site itself calls. */
  function embedFigure(node, id, q) {
    var k = q.get('k') || 'master';
    var st = q.get('state') || 'Michigan';
    function host(attrs) {
      var d = document.createElement('div');
      Object.keys(attrs || {}).forEach(function (a) { d.setAttribute(a, attrs[a]); });
      node.appendChild(d);
      return d;
    }
    /* indexviz draws into whichever [data-c] slots it finds, so the frame
       creates the one slot it wants and gets that figure alone. */
    function viz(slot) {
      var d = host({ 'data-index': k });
      var s = document.createElement('div');
      s.setAttribute('data-c', slot);
      d.appendChild(s);
      indexviz(d);
    }
    switch (id) {
      case 'spread': viz('spread'); return true;
      case 'leaders': viz('leaders'); return true;
      case 'movers': viz('movers'); return true;
      case 'standings': standings(host({ 'data-index': k })); return true;
      case 'statemap': statemap(host({})); return true;
      case 'marketrate': marketrate(host({})); return true;
      case 'marketthin': marketthin(host({})); return true;
      case 'churchratio': churchratio(host({})); return true;
      case 'policydateline': policydateline(host({})); return true;
      case 'regionleague': regionleague(host({})); return true;
      case 'coverage': coverage(host({})); return true;
      case 'yeargrid': stateyears(host({ 'data-subject': st })); return true;
      case 'carpet':
        return get('data/market/index.json').then(function (IX) {
          var f = '';
          (IX.markets || []).forEach(function (m) {
            if (m.state === st && !f && (m.id || '').length > 2) { f = m.id.slice(0, 2); }
          });
          countycarpet(host({ 'data-fips': f, 'data-subject': st }));
        });
      default: return false;
    }
  }

  function embedframe(node) {
    var q = new URLSearchParams(location.search);
    var k = q.get('k') || 'master', names = (q.get('s') || 'Michigan').split('|');
    var mode = q.get('mode') === 'ratio' ? 'ratio' : 'rank';
    document.body.classList.add('embed');

    var fig = q.get('fig') || 'rankline';
    if (fig !== 'rankline') {
      var done = embedFigure(node, fig, q);
      if (done) {
        var ff = document.createElement('p');
        ff.className = 'embedfoot';
        ff.innerHTML = '<a href="' + siteURL('index.html') + '" target="_blank" ' +
          'rel="noopener">Spring Vale Christian Education Institute</a> &middot; ' +
          esc(embedById(fig).name) + ' &middot; CC BY 4.0';
        node.appendChild(ff);
        return;
      }
    }

    get('data/series/' + k + '.json').then(function (s) {
      var series = names.map(function (nm) {
        var j = s.states.indexOf(nm), pts = [];
        if (j < 0) { return { name: nm, points: [] }; }
        s.windows.forEach(function (w) {
          var v = (s[mode][w] || [])[j];
          if (v !== null && v !== undefined) { pts.push([w, v]); }
        });
        return { name: nm, points: pts };
      });
      var plot = document.createElement('div');
      node.appendChild(plot);
      (mode === 'rank' ? rankline : valueline)(plot, series, { height: 250 });
      var f = document.createElement('p');
      f.className = 'embedfoot';
      f.innerHTML = '<a href="' + siteURL('index.html') + '" target="_blank" ' +
        'rel="noopener">Spring Vale Christian Education Institute</a> &middot; ' +
        esc(s.name) + ' Index &middot; ' +
        (mode === 'rank' ? 'standing among the fifty states' : 'ratio to the median state') +
        ' &middot; CC BY 4.0';
      node.appendChild(f);
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the embed gallery ────────────────────────────────────────────────────
     The page offered one chart and asked a reader to imagine it. It now shows
     every embeddable figure the Institute publishes, live, in the frame it
     would actually appear in — because a reader deciding whether to embed
     something is deciding on the look of it, and a description of a map is not
     a map.

     Each card is a real iframe of the real frame. They load as they come into
     view rather than all at once: fourteen figures loading their payloads
     together would make a slow page out of a browsing one. */
  function embedgallery(node) {
    var groups = [];
    EMBEDS.forEach(function (e) {
      if (groups.indexOf(e.group) < 0) { groups.push(e.group); }
    });

    node.innerHTML =
      '<div class="tools egtools"><span class="egf">Show</span>' +
      '<button type="button" class="on" data-g="">Everything</button>' +
      groups.map(function (g) {
        return '<button type="button" data-g="' + esc(g) + '">' + esc(g) + '</button>';
      }).join('') + '</div>' +
      '<div class="eggrid">' + EMBEDS.map(function (e) {
        var opts = '';
        if (e.params.indexOf('k') >= 0) {
          opts += '<label>Index <select data-p="k">' +
            [['master', 'Master'], ['preschool', 'Preschool'],
              ['elementary', 'Elementary School'], ['middle', 'Middle School'],
              ['highschool', 'High School']].map(function (o) {
              return '<option value="' + o[0] + '">' + o[1] + '</option>';
            }).join('') + '</select></label>';
        }
        if (e.params.indexOf('state') >= 0) {
          opts += '<label>State <select data-p="state"></select></label>';
        }
        if (e.params.indexOf('s') >= 0) {
          opts += '<label>State <select data-p="s"></select></label>';
        }
        if (e.params.indexOf('mode') >= 0) {
          opts += '<label>Show <select data-p="mode">' +
            '<option value="rank">Standing</option>' +
            '<option value="ratio">Ratio to the median</option></select></label>';
        }
        return '<article class="egcard" data-id="' + e.id + '" data-group="' +
          esc(e.group) + '" data-h="' + e.h + '">' +
          '<div class="egk">' + esc(e.group) + '</div>' +
          '<h4>' + esc(e.name) + '</h4>' +
          '<p>' + esc(e.about) + '</p>' +
          (opts ? '<div class="egopts">' + opts + '</div>' : '') +
          '<div class="egprev" data-c="prev"></div>' +
          '<div class="egbtns">' +
          '<button type="button" class="linkbtn" data-a="code">Copy the embed code</button>' +
          '<a class="btn" data-a="open" href="#" target="_blank" rel="noopener">Open it</a>' +
          '</div><pre data-c="code" hidden></pre></article>';
      }).join('') + '</div>';

    var cards = Array.prototype.slice.call(node.querySelectorAll('.egcard'));

    /* The state lists are filled from the manifest, so a state the Institute
       does not publish cannot be offered here. */
    get('data/manifest.json').then(function (M) {
      var names = (M.states || []).map(function (s) { return s.s; });
      node.querySelectorAll('[data-p="state"], [data-p="s"]').forEach(function (sel) {
        sel.innerHTML = names.map(function (n) {
          return '<option' + (n === 'Michigan' ? ' selected' : '') + '>' +
            esc(n) + '</option>';
        }).join('');
      });
      cards.forEach(function (c) { draw(c, true); });
    }).catch(function () { cards.forEach(function (c) { draw(c, true); }); });

    function src(card) {
      var id = card.getAttribute('data-id');
      var q = ['fig=' + id];
      card.querySelectorAll('[data-p]').forEach(function (sel) {
        q.push(sel.getAttribute('data-p') + '=' + encodeURIComponent(sel.value));
      });
      return siteURL('embed/chart.html') + '?' + q.join('&');
    }
    function snippet(card) {
      var e = embedById(card.getAttribute('data-id'));
      return '<iframe src="' + src(card) + '" width="100%" height="' + e.h +
        '" style="border:0" loading="lazy" title="' + esc(e.name) +
        ' \u2014 Spring Vale Christian Education Institute"></iframe>';
    }
    function draw(card, lazy) {
      var prev = card.querySelector('[data-c="prev"]');
      var e = embedById(card.getAttribute('data-id'));
      card.querySelector('[data-c="code"]').textContent = snippet(card);
      card.querySelector('[data-a="open"]').href = src(card);
      if (lazy && !card.getAttribute('data-seen')) { return; }
      prev.innerHTML = '<iframe src="' + esc(src(card)) + '" height="' + e.h +
        '" loading="lazy" title="' + esc(e.name) + '"></iframe>';
    }

    /* Load a preview when the card is close to the viewport, once. */
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) { return; }
          en.target.setAttribute('data-seen', '1');
          draw(en.target, false);
          io.unobserve(en.target);
        });
      }, { rootMargin: '400px' });
      cards.forEach(function (c) { io.observe(c); });
    } else {
      cards.forEach(function (c) { c.setAttribute('data-seen', '1'); draw(c, false); });
    }

    node.addEventListener('change', function (e) {
      var card = e.target.closest ? e.target.closest('.egcard') : null;
      if (card) { card.setAttribute('data-seen', '1'); draw(card, false); }
    });

    node.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-a="code"]') : null;
      if (b) {
        var card = b.closest('.egcard');
        copy(snippet(card), b);
        return;
      }
      var g = e.target.closest ? e.target.closest('[data-g]') : null;
      if (!g) { return; }
      node.querySelectorAll('[data-g]').forEach(function (x) {
        x.classList.toggle('on', x === g);
      });
      var want = g.getAttribute('data-g');
      cards.forEach(function (c) {
        c.hidden = !!want && c.getAttribute('data-group') !== want;
      });
    });
  }

  function embedbuild(node) {
    var M;
    node.innerHTML =
      '<div class="tools"><label>Index <select data-f="k"></select></label>' +
      '<label>States <select data-f="s" multiple size="8"></select></label>' +
      '<label>Show <select data-f="mode"><option value="rank">Standing</option>' +
      '<option value="ratio">Ratio to the median</option></select></label></div>' +
      '<div class="embedprev" data-c="prev"></div>' +
      '<label class="embedlab">Paste this where the chart should appear</label>' +
      '<pre data-c="code"></pre><button class="linkbtn" data-a="copy" type="button">Copy the code</button>';
    function sel(f) { return node.querySelector('[data-f="' + f + '"]'); }
    function render() {
      var picks = Array.prototype.filter.call(sel('s').options, function (o) { return o.selected; })
        .map(function (o) { return o.value; }).slice(0, 5);
      if (!picks.length) { picks = ['Michigan']; }
      var src = siteURL('embed/chart.html') + '?k=' + sel('k').value +
        '&mode=' + sel('mode').value + '&s=' + encodeURIComponent(picks.join('|'));
      node.querySelector('[data-c="prev"]').innerHTML =
        '<iframe src="' + src + '" title="Chart preview" loading="lazy"></iframe>';
      var code = '<iframe src="' + src + '" width="100%" height="330" ' +
        'style="border:0" loading="lazy" title="Spring Vale Christian Education Institute chart">' +
        '</iframe>';
      node.querySelector('[data-c="code"]').textContent = code;
      node.querySelector('[data-a="copy"]').onclick = function (e) { copy(code, e.target); };
    }
    get('data/manifest.json').then(function (m) {
      M = m;
      sel('k').innerHTML = M.indices.map(function (x) {
        return '<option value="' + x.key + '">' + esc(x.name) + '</option>'; }).join('');
      sel('s').innerHTML = M.states.map(function (x) {
        return '<option' + (x.s === 'Michigan' ? ' selected' : '') + '>' + esc(x.s) + '</option>';
      }).join('');
      ['k', 's', 'mode'].forEach(function (f) { sel(f).addEventListener('change', render); });
      render();
    }).catch(function (e) { fail(node, e); });
  }

  /* ── 10. ACCESSIBILITY AND PRINT ─────────────────────────────────────────
     Every chart carries its own figures as a table, so a reader who cannot see
     the picture still gets the data, and a reader who prints the page gets a
     document rather than a screenshot. The table is generated from the same
     SVG the chart drew, so it cannot describe a different figure. */
  function tableViews() {
    chartHosts().forEach(function (f) {
      if (f.querySelector(':scope > .tv')) { return; }
      if (f.querySelector('table.data') && !f.querySelector('svg')) { return; }
      var head, body;
      var dt = f.getAttribute('data-table');
      if (dt) {
        var T = JSON.parse(dt);
        head = '<th>Window</th>' + T.cols.map(function (c) {
          return '<th class="n">' + esc(c) + '</th>'; }).join('');
        body = T.wins.map(function (w, i) {
          return '<tr><td>' + wname(w) + '</td>' + T.rows[i].map(function (v) {
            return '<td class="n">' + (v === null || v === undefined ? '\u2014'
              : (T.kind === 'rank' ? ordinal(v) : (+v).toFixed(2) + '\u00d7')) + '</td>';
          }).join('') + '</tr>';
        }).join('');
      } else {
        var rows = [];
        f.querySelectorAll('svg title').forEach(function (t) {
          var txt = (t.textContent || '').trim(), i = txt.indexOf(':');
          if (i > 0) { rows.push([txt.slice(0, i), txt.slice(i + 1).trim()]); }
        });
        if (rows.length < 2) { return; }
        head = '<th>Item</th><th class="n">Figure</th>';
        body = rows.map(function (r) {
          return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(r[1]) + '</td></tr>';
        }).join('');
      }
      var d = document.createElement('details');
      d.className = 'tv';
      d.innerHTML = '<summary>The same figures as a table</summary>' +
        '<div class="tablewrap"><table class="data"><thead><tr>' + head +
        '</tr></thead><tbody>' + body + '</tbody></table></div>';
      f.appendChild(d);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE TWO ATLASES

     One map of the 262 Christian Education Market Areas and one of the eight
     SVCEI Regions, each shaded by Attention or by Schools, each scrubbable
     across every window in the series, each with hover.

     THE HONESTY PROBLEM, AND HOW IT IS HANDLED.

     Attention is measured for the fifty states. It is not measured for a market
     area and none is estimated for one. So on the attention layer every market
     area inside a state carries that state's reading and they are all the same
     shade, which is a fact about the measurement rather than a fault in the
     map. It is stated in the legend, in the caption, and in every tooltip, and
     the market areas of one state are outlined together so that a reader can
     SEE that the shading is a state's and not a market's.

     The school census is taken, not sampled monthly, so that
     layer steps when a new census lands rather than moving window to window.
     The slider still governs it, and the caption says what it is doing.

     The District of Columbia has provision and has no attention reading. It is
     drawn on the provision layer and drawn hatched on the attention layer.
     ══════════════════════════════════════════════════════════════════════ */

  var ATL = { data: null, geo: {}, series: {} };

  function atlasLoad(which) {
    var jobs = [];
    if (!ATL.data) { jobs.push(get('data/atlas.json').then(function (d) { ATL.data = d; })); }
    var gk = which === 'markets' ? 'markets' : 'states';
    if (!ATL.geo[gk]) {
      jobs.push(get('data/geo/' + gk + '.json').then(function (g) { ATL.geo[gk] = g; }));
    }
    if (!ATL.series.master) {
      jobs.push(get('data/series/master.json').then(function (s) { ATL.series.master = s; }));
    }
    return Promise.all(jobs);
  }

  function atlasIndex(k) {
    if (ATL.series[k]) { return Promise.resolve(ATL.series[k]); }
    return get('data/series/' + k + '.json').then(function (s) {
      ATL.series[k] = s; return s;
    });
  }

  /* A shared scale for a provision rate, cut at the same six breaks in both
     atlases so that a market area and a region of the same rate take the same
     color. Two maps on one site that color the same number differently are two
     maps a reader cannot hold in their head at once. */
  /* THIS WAS WRONG, AND IT WAS WRONG EVERYWHERE PROVISION IS DRAWN.
     The breaks arrive in ASCENDING order. The old loop returned on the first
     break a value cleared, so anything at or above the LOWEST break took the
     same colour: 25.8 and 208.6 Christian school enrollments per 1,000 were painted identically, and
     the provision map was two colours pretending to be nine. Counting how many
     breaks a value clears gives the band, and the band is what selects the
     colour.

     The band then goes through rampByShare, so the HIGHEST band takes the
     darkest step. This function previously returned RAMP[band] directly,
     which painted the highest provision palest and put every Schools map on
     the opposite convention to every Attention map. */
  function provColor(v, breaks) {
    if (v === null || v === undefined || !breaks || !breaks.length) {
      return '#ececec';
    }
    var band = 0;
    for (var i = 0; i < breaks.length; i++) {
      if (v >= breaks[i]) { band = i + 1; }
    }
    return rampByShare(band / breaks.length);
  }

  /* The layer list differs between the two atlases, and the market-area atlas
     opens on the layer where EVERY MARKET AREA CARRIES ITS OWN STANDING rather
     than on the one that shades by state. Opening on the state-shaded layer
     made the map look like a state map and invited the reader to believe
     attention is measured market by market, which it is not. */
  function atlasControls(node, opts) {
    opts = opts || {};
    var layers = opts.layers || [
      ['att', 'Attention &mdash; standing among the fifty states'],
      ['prov', 'Schools &mdash; Christian school enrollments per 1,000 children']
    ];
    node.innerHTML =
      '<div class="tools atlastools">' +
      '<label>Layer <select data-f="layer">' +
      layers.map(function (l) {
        return '<option value="' + l[0] + '">' + l[1] + '</option>';
      }).join('') +
      '</select></label>' +
      '<label>Index <select data-f="k"></select></label>' +
      '<label>Show <select data-f="mode">' +
      '<option value="rank">Standing</option>' +
      '<option value="ratio">Ratio to the median state</option>' +
      '</select></label>' +
      '<button class="linkbtn" data-a="link" type="button">Copy link to this view</button>' +
      '</div>' +
      '<div data-c="slider"></div>' +
      '<div class="atlasmap" data-c="map"></div>' +
      '<div data-c="legend" class="atlaskey"></div>' +
      '<p class="srctag" data-c="cap"></p>' +
      '<div data-c="rank"></div>';
  }

  function atlasLegendRank(host, of, note) {
    host.innerHTML =
      '<div class="keyrow"><span class="kl">First</span>' +
      RAMP.slice().reverse().map(function (c) {
        return '<i style="background:' + c + '"></i>';
      }).join('') +
      '<span class="kl">' + ordinal(of) + '</span></div>' +
      '<div class="keynote">' + note + '</div>';
  }

  /* The legend names the quantity it is a legend for. It said "seats" on every
     map that used it, including two that have nothing to do with seats, which is
     the kind of label a reader believes because a legend is the last thing they
     doubt. */
  /* A legend that NAMES ITS OWN EXTREMES.
     "Breaks at 21.4 and 6.5" is a true sentence that tells a reader nothing
     they can check. Two places do: the darkest market area on this layer and
     the palest one, named, with their figures. A reader who knows the country
     can then verify the direction of the ramp in one glance instead of
     trusting it — and so can the Institute. */
  function atlasLegendProv(host, breaks, note, unit, ends) {
    unit = unit || 'Christian school enrollments per 1,000';
    var lo = breaks[breaks.length - 1], hi = breaks[0];
    var named = '';
    if (ends && ends.top && ends.bottom) {
      named = ' Darkest is <strong>' + esc(ends.top.name) + '</strong> at ' +
        ends.top.v + '; palest is <strong>' + esc(ends.bottom.name) + '</strong> at ' +
        ends.bottom.v + '.';
    }
    /* The hatch is named in the key. A treatment a reader can see and cannot
       look up is only half a fix: without this line, hatching says "something
       is different here" and leaves them to guess what. */
    host.innerHTML =
      '<div class="keyrow"><span class="kl">Lower</span>' +
      rampSwatches() +
      '<span class="kl">Higher</span>' +
      '<i class="none keynone"></i><span class="kl">no reading</span></div>' +
      '<div class="keynote">Breaks at ' + (+lo).toFixed(1) + ' and ' +
      (+hi).toFixed(1) + ' ' + unit + '.' + named + ' ' + note +
      ' A hatched area is one the Institute has no measurement for. It is drawn ' +
      'as absent rather than shaded, so that a place not measured is never read ' +
      'as a place measured and found low. Hover it for the reason.</div>';
  }

  /* The highest and lowest market area on a layer, for the legend above. */
  function layerEnds(rows, k, nameKey) {
    var v = rows.filter(function (r) {
      return r[k] !== null && r[k] !== undefined; })
      .sort(function (a, b) { return b[k] - a[k]; });
    if (v.length < 2) { return null; }
    return { top: { name: v[0][nameKey || 'name'], v: v[0][k] },
      bottom: { name: v[v.length - 1][nameKey || 'name'], v: v[v.length - 1][k] } };
  }

  /* ── the market area atlas ───────────────────────────────────────────────*/
  function atlasmarkets(node) {
    atlasControls(node, { layers: [
      ['gap', 'Each market area&rsquo;s own standing, against its state&rsquo;s attention'],
      ['prov', 'Each market area&rsquo;s own Schools reading &mdash; Christian school enrollments per 1,000 children'],
      ['att', 'Its state&rsquo;s attention standing &mdash; shaded by state, not by market area']
    ] });
    var sel = function (f) { return node.querySelector('[data-f="' + f + '"]'); };
    var map = null, byId = {}, S = null, W = null, state = { k: 'master' };

    var q = new URLSearchParams(location.search);
    ['layer', 'k', 'mode'].forEach(function (f) {
      if (q.get(f)) { sel(f) ? sel(f).value = q.get(f) : 0; }
    });

    function stateOf(id) { return (byId[id] || {}).state || ''; }

    function paint(w) {
      W = w;
      var layer = sel('layer').value, mode = sel('mode').value;
      /* The index picker matters to both attention layers; the ratio/standing
         toggle only to the plain attention map. */
      sel('k').parentElement.style.display =
        (layer === 'att' || layer === 'gap') ? '' : 'none';
      sel('mode').parentElement.style.display = layer === 'att' ? '' : 'none';
      var A = ATL.data;
      if (layer === 'prov') {
        map.paint(function (id) { return provColor((byId[id] || {}).spk, A.provision_break); });
        atlasLegendProv(node.querySelector('[data-c="legend"]'), A.provision_break,
          'Every one of the ' + A.markets.length + ' market areas, shaded by its own rate.');
        node.querySelector('[data-c="cap"]').innerHTML =
          esc(A.provision_note) + ' The rate shown is the census in force for ' + wname(w) +
          ', against Census Vintage ' + A.vintage + ' population. The rate counts a child ' +
          'currently enrolled, so this measures schooling taken up rather than schooling ' +
          'available.';
        provRank();
        return;
      }
      var of = 50;
      var rk = S.rank[w] || [], rt = S.ratio[w] || [];
      var idxOf = {};
      S.states.forEach(function (g, j) { idxOf[g] = j; });
      of = rk.filter(function (x) { return x; }).length || 50;

      /* ── the gap layer ─────────────────────────────────────────────────
         Attention is measured for a STATE, so an attention map can only ever
         shade every market area in one state the same. That is honest and it
         is also flat: fifty colors across 262 shapes, and nothing inside a
         state ever moves.

         What does vary market by market, and does move month by month, is
         whether the interest a state shows is matched by the schooling that
         exists in each of its market areas. Attention is a position among the
         fifty states; provision is a position among the 262 market areas. Both
         are positions, so they can be put on the same 0-to-100 scale and
         subtracted, and the difference is a position too — never a quantity,
         and never a claim that one causes the other.

         Red: attention stands higher than provision. Teal: provision stands
         higher than attention. Pale: the two sit close together. */
      if (layer === 'gap') {
        var provSorted = A.markets.slice().sort(function (a, b) {
          return (a.spk || 0) - (b.spk || 0);
        });
        var pPct = {};
        provSorted.forEach(function (m, i) {
          pPct[m.id] = provSorted.length > 1 ? i / (provSorted.length - 1) * 100 : 50;
        });
        map.paint(function (id) {
          var st = stateOf(id), j = idxOf[st];
          if (j === undefined || !rk[j] || pPct[id] === undefined) { return '#ececec'; }
          var aPct = (1 - (rk[j] - 1) / (of - 1)) * 100;
          return gapColor(aPct - pPct[id]);
        });
        atlasGapLegend(node.querySelector('[data-c="legend"]'));
        node.querySelector('[data-c="cap"]').innerHTML =
          '<strong>Every one of the ' + A.markets.length + ' market areas carries its ' +
          'own shade here, and the shades move with the month.</strong> Each market ' +
          'area&rsquo;s own standing on Christian school enrollments per 1,000 children &mdash; a figure ' +
          'measured for that market area and for no other &mdash; is set against the ' +
          'standing of its state on the ' + esc(S.name || 'Master') + ' Index in ' +
          wname(w) + '. Both are positions among their own populations, placed on one 0 ' +
          'to 100 scale so that they can be compared. Red is a market area standing ' +
          'lower on its own Schools reading than its state stands on attention; teal is the ' +
          'reverse. Neither is a quantity and neither is a claim that one produces the ' +
          'other. <em>What the Institute measures for a market area is Schools. ' +
          'Attention is measured for a state, so the attention half of this comparison ' +
          'is the same for every market area within one state.</em>';
        provRank();
        return;
      }
      map.paint(function (id) {
        var j = idxOf[stateOf(id)];
        if (j === undefined) { return '#ececec'; }
        var r = rk[j];
        return r ? rankColor(r, of) : '#ececec';
      });
      atlasLegendRank(node.querySelector('[data-c="legend"]'), of,
        'Shaded by the standing of the STATE each market area sits in. ' +
        'Attention is not measured for a market area, so every market area in ' +
        'one state carries the same shade, and the District of Columbia carries none.');
      node.querySelector('[data-c="cap"]').innerHTML =
        esc(S.name) + ' Index, ' + wname(w) + '. ' + esc(ATL.data.attention_note) +
        ' A movement is a change in standing rather than growth or decline in any quantity.' +
        (mode === 'ratio' ? ' Hover gives the ratio to the median state.' : '');
      attRank(rk, rt, idxOf, of);
    }

    function attRank(rk, rt, idxOf, of) {
      var rows = ATL.data.markets.slice().map(function (m) {
        var j = idxOf[m.state];
        return { m: m, rank: j === undefined ? null : rk[j],
          ratio: j === undefined ? null : rt[j] };
      }).filter(function (r) { return r.rank; })
        .sort(function (a, b) { return a.rank - b.rank || b.m.spk - a.m.spk; });
      table(rows, 'att');
    }
    function provRank() {
      var rows = ATL.data.markets.slice()
        .sort(function (a, b) { return b.spk - a.spk; })
        .map(function (m, i) { return { m: m, prank: i + 1 }; });
      table(rows, 'prov');
    }
    function table(rows, kind) {
      node.querySelector('[data-c="rank"]').innerHTML =
        '<details class="tv"><summary>The same figures as a table, all ' + rows.length +
        ' market areas</summary><div class="tablewrap"><table class="data"><thead><tr>' +
        '<th class="n">' + (kind === 'att' ? 'State standing' : 'Schools rank') + '</th>' +
        '<th>Christian Education Market Area</th><th>State</th>' +
        '<th class="n">Christian school enrollments per 1,000</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td class="n">' + (kind === 'att' ? ordinal(r.rank) : r.prank) +
            '</td><td><a href="' + BASE + 'markets/' + r.m.id + '.html">' + esc(r.m.name) +
            '</a></td><td>' + (r.m.state
              ? '<a href="' + BASE + 'states/' + slug(r.m.state) + '.html">' +
                esc(r.m.state) + '</a>'
              : 'District of Columbia') + '</td>' +
            '<td class="n">' + r.m.spk + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }

    function tip(id) {
      var m = byId[id];
      if (!m) { return noReadingTip(id); }
      var layer = sel('layer').value;
      var head = '<b>' + esc(m.name) + '</b><br><span class="ts">' +
        esc(m.state || 'District of Columbia') + ' &middot; ' + wname(W) + '</span>';
      if (layer === 'prov') {
        return head + '<br>' + m.spk + ' Christian school enrollments per 1,000<br>' +
          num(m.schools) + ' Christian schools, ' + num(m.students) + ' enrolled<br>' +
          '<span class="ts">' + ordinal(m.rank) + ' of ' + ATL.data.markets.length +
          ' market areas</span>';
      }
      var j = S.states.indexOf(m.state);
      if (j < 0) {
        return head + '<br><span class="ts">Attention is not measured here.</span>';
      }
      var r = (S.rank[W] || [])[j], t = (S.ratio[W] || [])[j];
      return head +
        '<br>' + m.spk + ' Christian school enrollments per 1,000, ' + ordinal(m.rank) + ' of ' +
        ATL.data.markets.length + ' market areas' +
        '<br><span class="ts">this market area&rsquo;s own standing</span>' +
        '<br>' + esc(m.state) + ' stands ' + (r ? ordinal(r) : '&mdash;') + ' of 50' +
        (t ? ' at ' + t.toFixed(2) + '&times; the median state' : '') +
        '<br><span class="ts">its state&rsquo;s attention, which is what this ' +
        'layer shades by</span>';
    }

    atlasLoad('markets').then(function () {
      ATL.data.markets.forEach(function (m) { byId[m.id] = m; });
      learnNames(ATL.data.markets);
      S = ATL.series.master;
      sel('k').innerHTML = ['master', 'preschool', 'elementary', 'middle', 'highschool']
        .map(function (k) {
          var f = { master: 'Master', preschool: 'Preschool', elementary: 'Elementary School',
            middle: 'Middle School', highschool: 'High School' }[k];
          return '<option value="' + k + '"' + (k === state.k ? ' selected' : '') + '>' +
            f + '</option>';
        }).join('');
      if (q.get('k')) { sel('k').value = q.get('k'); }
      map = USMap(node.querySelector('[data-c="map"]'), ATL.geo.markets, {
        tip: tip, href: function (id) { return BASE + 'markets/' + id + '.html'; }
      });
      var wins = S.windows;
      var at = wins.indexOf(q.get('w'));
      var ctl = windowSlider(node.querySelector('[data-c="slider"]'), wins,
        at < 0 ? wins.length - 1 : at, function (w) { paint(w); link(); });
      ['layer', 'k', 'mode'].forEach(function (f) {
        sel(f).addEventListener('change', function () {
          ctl.stop();
          if (f === 'k') {
            atlasIndex(sel('k').value).then(function (x) { S = x; paint(W); link(); });
          } else { paint(W); link(); }
        });
      });
      node.querySelector('[data-a="link"]').addEventListener('click', function (e) {
        copy(location.href, e.target);
      });
      function link() {
        var u = new URL(location.href);
        ['layer', 'k', 'mode'].forEach(function (f) { u.searchParams.set(f, sel(f).value); });
        u.searchParams.set('w', W);
        history.replaceState(null, '', u);
      }
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the Region atlas ────────────────────────────────────────────────────*/
  function atlasregions(node) {
    atlasControls(node);
    var sel = function (f) { return node.querySelector('[data-f="' + f + '"]'); };
    var map = null, regOf = {}, byName = {}, S = null, W = null;
    var q = new URLSearchParams(location.search);

    function paint(w) {
      W = w;
      var layer = sel('layer').value;
      sel('k').parentElement.style.display = 'none';
      sel('mode').parentElement.style.display = 'none';
      var A = ATL.data;
      if (layer === 'prov') {
        map.paint(function (g) {
          var r = byName[regOf[g]];
          return r ? provColor(r.spk, A.provision_break) : '#ececec';
        });
        atlasLegendProv(node.querySelector('[data-c="legend"]'), A.provision_break,
          'All eight Regions on the same scale as the market area atlas.');
        node.querySelector('[data-c="cap"]').innerHTML =
          esc(A.provision_note) + ' A Region&rsquo;s rate is its member states&rsquo; '
          + 'enrollments over their school-age population, which is a rate and adds '
          + 'correctly. Its attention is a median of positions, which does not add and is '
          + 'never totaled.';
        rtable('prov');
        return;
      }
      var ranks = A.regions.map(function (r) { return r.median_rank[w]; });
      var have = ranks.filter(function (x) { return x !== undefined; });
      var order = A.regions.slice().filter(function (r) {
        return r.median_rank[w] !== undefined;
      }).sort(function (a, b) { return a.median_rank[w] - b.median_rank[w]; });
      var place = {};
      order.forEach(function (r, i) { place[r.name] = i + 1; });
      map.paint(function (g) {
        var p = place[regOf[g]];
        return p ? rankColor(p, order.length) : '#ececec';
      });
      atlasLegendRank(node.querySelector('[data-c="legend"]'), order.length || 8,
        'The eight Regions, ordered by the median standing of their member states. ' +
        'A Region is shaded as a whole, so every state in one Region takes the same shade.');
      node.querySelector('[data-c="cap"]').innerHTML =
        'Master Index, ' + wname(w) + '. A Region&rsquo;s standing is the median rank of ' +
        'its member states, because relative positions do not add. The District of Columbia ' +
        'belongs to no Region and is drawn unmeasured. A movement is a change in standing ' +
        'rather than growth or decline in any quantity.';
      rtable('att', place);
    }

    function rtable(kind, place) {
      var rows = ATL.data.regions.slice();
      if (kind === 'att') {
        rows = rows.filter(function (r) { return place[r.name]; })
          .sort(function (a, b) { return place[a.name] - place[b.name]; });
      } else {
        rows.sort(function (a, b) { return b.spk - a.spk; });
      }
      node.querySelector('[data-c="rank"]').innerHTML =
        '<details class="tv" open><summary>The same figures as a table</summary>' +
        '<div class="tablewrap"><table class="data"><thead><tr><th class="n">' +
        (kind === 'att' ? 'Standing' : 'Rank') +
        '</th><th>Spring Vale Christian Education Institute Region</th>' +
        '<th class="n">States</th><th class="n">Median rank of its states</th>' +
        '<th class="n">Christian school enrollments per 1,000</th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          return '<tr><td class="n">' + (i + 1) + '</td><td><a href="' + BASE + 'regions/' +
            r.slug + '.html">' + esc(r.name) + '</a></td><td class="n">' +
            r.members.length + '</td><td class="n">' +
            (r.median_rank[W] === undefined ? '&mdash;' : r.median_rank[W]) +
            '</td><td class="n">' + (r.spk === null ? '&mdash;' : r.spk) + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }

    function tip(g) {
      var name = regOf[g], r = byName[name];
      if (!r) {
        return '<b>' + esc(g) + '</b><br><span class="ts">Belongs to no Spring Vale ' +
          'Christian Education Institute Region.</span>';
      }
      var head = '<b>' + esc(name) + '</b><br><span class="ts">' + esc(g) + ' &middot; ' +
        wname(W) + '</span>';
      if (sel('layer').value === 'prov') {
        return head + '<br>' + r.spk + ' Christian school enrollments per 1,000<br>' + num(r.schools) +
          ' Christian schools, ' + num(r.students) + ' enrolled<br><span class="ts">' +
          spell(r.members.length) + ' states</span>';
      }
      var mr = r.median_rank[W];
      var j = S.states.indexOf(g);
      var own = j < 0 ? null : (S.rank[W] || [])[j];
      return head + '<br>Region median rank ' + (mr === undefined ? '&mdash;' : mr) +
        ' of 50<br>' + (own ? esc(g) + ' itself stands ' + ordinal(own) + ' of 50' : '') +
        '<br><span class="ts">The shading is the Region&rsquo;s, not this state&rsquo;s.</span>';
    }

    atlasLoad('regions').then(function () {
      S = ATL.series.master;
      ATL.data.regions.forEach(function (r) {
        byName[r.name] = r;
        r.members.forEach(function (g) { regOf[g] = r.name; });
      });
      map = USMap(node.querySelector('[data-c="map"]'), ATL.geo.states, {
        tip: tip,
        href: function (g) {
          var r = byName[regOf[g]];
          return r ? BASE + 'regions/' + r.slug + '.html' : BASE + 'regions/index.html';
        }
      });
      var wins = S.windows, at = wins.indexOf(q.get('w'));
      if (q.get('layer')) { sel('layer').value = q.get('layer'); }
      var ctl = windowSlider(node.querySelector('[data-c="slider"]'), wins,
        at < 0 ? wins.length - 1 : at, function (w) { paint(w); link(); });
      sel('layer').addEventListener('change', function () { ctl.stop(); paint(W); link(); });
      node.querySelector('[data-a="link"]').addEventListener('click', function (e) {
        copy(location.href, e.target);
      });
      function link() {
        var u = new URL(location.href);
        u.searchParams.set('layer', sel('layer').value);
        u.searchParams.set('w', W);
        history.replaceState(null, '', u);
      }
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the congregation atlas ─────────────────────────────────────────────
     Christian congregations by market area, from the 2020 U.S. Religion Census.

     The Religion Census does not collect or publish congregation addresses, so
     this is a county-level file and the join to a market area is exact: a
     market area is a group of whole counties, every congregation lands in one
     of them, and the totals reconcile to the digit. There is no geocoding and
     no coverage ratio because nothing has been located or estimated. */
  function atlaschurches(node) {
    node.innerHTML =
      '<div class="tools atlastools">' +
      '<label>Layer <select data-f="layer">' +
      '<option value="per10k">Congregations per 10,000 residents</option>' +
      '<option value="adh_pct">Adherents as a share of population</option>' +
      '<option value="s_per_100c">Christian schools per 100 congregations</option>' +
      '<option value="schools">Christian schools, count</option>' +
      '<option value="spk">Christian school enrollments per 1,000 children</option>' +
      '<option value="cong">Congregations, count</option>' +
      '</select></label>' +
      '<label class="ckin"><input type="checkbox" data-f="dots"> Show every located ' +
      'church as a dot</label>' +
      '<button class="linkbtn" data-a="link" type="button">Copy link to this view</button>' +
      '</div><div class="atlasmap" data-c="map"></div>' +
      '<div class="atlaskey" data-c="legend"></div>' +
      '<p class="srctag" data-c="cap"></p>' +
      '<p class="srctag" data-c="dotnote"></p><div data-c="rank"></div>';
    var D = null, byId = {}, map = null;
    var sel = function (f) { return node.querySelector('[data-f="' + f + '"]'); };
    var UNIT = { per10k: 'congregations per 10,000 residents',
      adh_pct: '% of the population', s_per_100c: 'schools per 100 congregations',
      schools: 'Christian schools', spk: 'enrollments per 1,000 children',
      cong: 'congregations' };
    var LAB = {
      per10k: ['congregations per 10,000 residents',
        'How many Christian congregations stand in a market area for every ten thousand people who live there.'],
      adh_pct: ['adherents as a share of population',
        'Adherents of Christian bodies as a share of the resident population, as the Religion Census counts them.'],
      s_per_100c: ['Christian schools per 100 congregations',
        'Two censuses on one geography: Christian schools from the federal private school census, Christian congregations from the Religion Census. It says how many schools stand beside a hundred churches, and nothing about why.'],
      schools: ['Christian schools',
        'Every Christian school the federal private school census counts, on the same geography as the churches. The census records a school\u2019s city but not its location, so schools cannot be drawn as dots the way the churches can; this is the count in each market area.'],
      spk: ['Christian school enrollments per 1,000 children',
        'Children enrolled at Christian schools for every thousand aged five through seventeen who live in the market area. It counts enrollment, not capacity: the census does not ask a school how many places it has.'],
      cong: ['Christian congregations', 'The count itself. It follows population closely and is shown for completeness.']
    };
    function breaksFor(k) {
      var v = D.markets.map(function (m) { return m[k]; })
        .filter(function (x) { return x !== null && x !== undefined; })
        .sort(function (a, b) { return b - a; });
      return [0.833, 0.667, 0.5, 0.333, 0.167].map(function (f) {
        return v[Math.floor(v.length * f)];
      });
    }
    function paint() {
      var k = sel('layer').value, br = breaksFor(k);
      map.paint(function (id) {
        var m = byId[id];
        return m ? provColor(m[k], br) : '#ececec';
      });
      atlasLegendProv(node.querySelector('[data-c="legend"]'), br,
        'All ' + D.markets.length + ' market areas, shaded by ' + LAB[k][0] + '.',
        UNIT[k], layerEnds(D.markets, k));
      node.querySelector('[data-c="cap"]').innerHTML =
        LAB[k][1] + ' ' + esc(D.note) +
        (D.markets.some(function (m) { return m.estimated; })
          ? ' Connecticut is the one exception to the exact join: it replaced its ' +
            'counties with planning regions in 2022 and the Religion Census still ' +
            'reports on the old ones, so its five market areas are apportioned by ' +
            'the population of the towns in each. Those rows are marked ' +
            '<em>apportioned</em> when you hover them.'
          : '') +
        ' Census of ' + D.vintage + '. ' +
        num(D.totals.congregations) + ' Christian congregations and ' +
        num(D.totals.adherents) + ' adherents are placed. ' +
        'The Latter-day Saints, Jehovah&rsquo;s Witnesses, and the Unitarian ' +
        'Universalist Association are counted separately and are not in these ' +
        'figures. <a href="' + BASE + 'methodology/index.html#congregations">How ' +
        'the bodies were adjudicated</a>.';
      var rows = D.markets.slice().sort(function (a, b) {
        return (b[k] === null ? -1 : b[k]) - (a[k] === null ? -1 : a[k]); });
      node.querySelector('[data-c="rank"]').innerHTML =
        '<details class="tv"><summary>The same figures as a table, all ' + rows.length +
        ' market areas</summary><div class="tablewrap"><table class="data"><thead><tr>' +
        '<th class="n">#</th><th>Christian Education Market Area</th><th>State</th>' +
        '<th class="n">Congregations</th><th class="n">Per 10,000</th>' +
        '<th class="n">Adherents</th><th class="n">Christian schools</th>' +
        '<th class="n">Enrollments per 1,000 children</th>' +
        '<th class="n">Schools per 100</th></tr></thead><tbody>' +
        rows.map(function (m, i) {
          return '<tr><td class="n">' + (i + 1) + '</td><td><a href="' + BASE +
            'markets/' + m.id + '.html">' + esc(m.name) + '</a></td><td>' +
            esc(m.state || 'District of Columbia') + '</td><td class="n">' +
            num(m.cong) + '</td><td class="n">' + (m.per10k === null ? '\u2014' : m.per10k) +
            '</td><td class="n">' + num(m.adherents) + '</td><td class="n">' +
            num(m.schools) + '</td><td class="n">' +
            (m.spk === null || m.spk === undefined ? '\u2014' : m.spk) +
            '</td><td class="n">' +
            (m.s_per_100c === null ? '\u2014' : m.s_per_100c) + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
      var u = new URL(location.href);
      u.searchParams.set('layer', k);
      var dc0 = node.querySelector('[data-f="dots"]');
      u.searchParams.set('dots', dc0 && dc0.checked ? '1' : '0');
      history.replaceState(null, '', u);
    }
    function tip(id) {
      var m = byId[id];
      /* A shape with no row used to return nothing, so the five Connecticut
         market areas had no tooltip at all and a reader hovering them learned
         only that hovering did nothing. A hole is told, and told why. */
      if (!m) { return noReadingTip(id); }
      return '<b>' + esc(m.name) + '</b>' +
        /* Connecticut's counties were replaced in 2022 and the Religion Census
           still reports on the old ones, so these five markets are apportioned
           from the towns rather than joined exactly. Every figure below says
           so, on the figure, rather than in a footnote nobody reaches. */
        (m.estimated ? ' <span class="estflag">apportioned</span>' : '') +
        '<br><span class="ts">' +
        esc(m.state || 'District of Columbia') + ' &middot; Religion Census ' +
        D.vintage + '</span><br>' +
        num(m.cong) + ' Christian congregations<br>' +
        (m.per10k === null ? '' : m.per10k + ' per 10,000 residents<br>') +
        (m.adh_pct === null ? '' : m.adh_pct + '% of people are adherents<br>') +
        num(m.schools) + ' Christian schools' +
        (m.spk === null || m.spk === undefined ? ''
          : '<br>' + m.spk + ' enrollments per 1,000 children') +
        (m.s_per_100c === null ? '' : '<br>' + m.s_per_100c +
          ' schools per 100 congregations') +
        (m.points ? '<br><span class="ts">' + num(m.points) + ' located places, ' +
          m.inv_ratio + ' for every congregation counted</span>' : '') +
        (m.estimated ? '<br><span class="ts">Connecticut replaced its counties ' +
          'with planning regions in 2022 and the Religion Census still reports ' +
          'on the old ones, so this market\u2019s share is apportioned from the ' +
          'population of the towns in it, not joined county by county.</span>' : '');
    }
    /* Half a million dots, drawn on a canvas over the choropleth.
       SVG cannot hold this many nodes and does not need to: a dot has no hover
       and no click of its own, because a single point is an inventory record
       rather than a congregation, and inviting a reader to click one would
       invite them to believe it. The dots show WHERE, the choropleth under them
       shows HOW MANY, and the census is what says how many there really are. */
    /* THE DOT LAYER, AND WHY IT IS COOL-COLOURED.
       The choropleth beneath runs dark plum through to pale peach — nine warm
       steps. A warm dot on a warm ramp is invisible on most of the country,
       which is what the first version shipped: dark red at 55% opacity over a
       dark red market area is nothing at all. The dots are therefore the one
       thing on these maps that is deliberately NOT on the house ramp. Cyan and
       deep navy separate from every step of it, at both ends.

       The canvas is redrawn from the map's viewBox on every pan and zoom, and
       points outside the view are skipped, so half a million dots stay smooth
       while a reader drags across the country. */
    function dots(on) {
      var host = node.querySelector('[data-c="map"]');
      var old = host.querySelector('canvas.dots');
      if (old) { old.remove(); }
      if (!on) { return; }
      get('data/church_points.json').then(function (P) {
        var svg = host.querySelector('svg');
        if (!svg) { return; }
        var cv = document.createElement('canvas');
        cv.className = 'dots';
        host.appendChild(cv);
        var g = cv.getContext('2d');

        function draw() {
          if (!cv.isConnected) { return; }
          var vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
          var r = svg.getBoundingClientRect();
          var dpr = window.devicePixelRatio || 1;
          if (cv.width !== Math.round(r.width * dpr)) {
            cv.width = Math.round(r.width * dpr);
            cv.height = Math.round(r.height * dpr);
            cv.style.width = r.width + 'px';
            cv.style.height = r.height + 'px';
          }
          g.clearRect(0, 0, cv.width, cv.height);
          var sx = (r.width * dpr) / vb[2], sy = (r.height * dpr) / vb[3];
          /* A dot grows a little as the reader zooms, to a limit: at national
             scale it must not blot out the shading, and at county scale it
             must be a mark rather than a speck. */
          var z = Math.min(3.2, Math.sqrt(vb0w / vb[2]));
          var rad = Math.max(0.6, 0.75 * dpr * z);
          var W = cv.width, Hh = cv.height;
          function plot(arr, color) {
            g.fillStyle = color;
            for (var i = 0; i < arr.length; i += 2) {
              var x = (arr[i] - vb[0]) * sx, y = (arr[i + 1] - vb[1]) * sy;
              if (x < -4 || y < -4 || x > W + 4 || y > Hh + 4) { continue; }
              g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
            }
          }
          plot(P.mixed, 'rgba(11,59,87,.45)');
          plot(P.christian, 'rgba(0,179,198,.85)');
        }
        var vb0w = svg.getAttribute('viewBox').split(/\s+/).map(Number)[2];
        draw();
        if (map && map.onview) { map.onview(draw); }
        window.addEventListener('resize', draw);
        var n = node.querySelector('[data-c="dotnote"]');
        if (n) {
          n.innerHTML =
            '<span class="dotkey"><i style="background:rgba(0,179,198,.85)"></i>' +
            'Christian categories</span> ' +
            '<span class="dotkey"><i style="background:rgba(11,59,87,.45)"></i>' +
            'mixed religious-organization category</span><br>' +
            num(P.counts.christian) + ' located places in Christian ' +
            'categories and ' + num(P.counts.mixed) + ' in the mixed ' +
            'religious-organization category, from Overture Maps release ' +
            esc(D.inventory ? D.inventory.release : '') + '. ' +
            (D.inventory ? esc(D.inventory.note) : '') +
            ' Nationally the inventory records ' +
            (D.inventory ? D.inventory.totals.ratio : '') +
            ' places for every congregation the census counts.';
        }
      }).catch(function () { /* the dots are an overlay; the map stands without them */ });
    }

    /* The market index is fetched for its NAMES and nothing else. The
       congregations payload cannot name the five Connecticut market areas
       because it has no rows for them, and a tooltip that opens "09-09170"
       reads as the malfunction it is not. */
    Promise.all([get('data/congregations.json'), get('data/geo/markets.json'),
                 get('data/market/index.json').catch(function () { return null; })])
      .then(function (r) {
        D = r[0];
        D.markets.forEach(function (m) { byId[m.id] = m; });
        if (r[2]) { learnNames(r[2].markets); }
        /* A layer the payload does not carry paints every market the same pale
           shade, which reads as a broken map rather than as a missing figure.
           So the offered layers are the ones the data actually holds, and a
           layer that arrives empty is removed rather than drawn gray. */
        var lsel = sel('layer');
        Array.prototype.slice.call(lsel.options).forEach(function (o) {
          var has = D.markets.some(function (m) {
            return m[o.value] !== null && m[o.value] !== undefined; });
          if (!has) { o.remove(); }
        });
        var q = new URLSearchParams(location.search);
        if (q.get('layer') && lsel.querySelector('[value="' + q.get('layer') + '"]')) {
          lsel.value = q.get('layer');
        }
        map = USMap(node.querySelector('[data-c="map"]'), r[1], {
          tip: tip, href: function (id) { return BASE + 'markets/' + id + '.html'; }
        });
        sel('layer').addEventListener('change', paint);
        var dc = node.querySelector('[data-f="dots"]');
        dc.addEventListener('change', function () { dots(dc.checked); });
        if (q.get('dots') === '1') { dc.checked = true; dots(true); }
        node.querySelector('[data-a="link"]').addEventListener('click', function (e) {
          copy(location.href, e.target);
        });
        paint();
      }).catch(function (e) { fail(node, e); });
  }

  /* ── the Policy Monitor map ──────────────────────────────────────────────
     Christian Education Latitude: how much room the law leaves a Christian
     school, on five components, each scored 0 to 4 against an anchored rubric
     and each citing the instrument it was scored from.

     THE LAYER THAT MAKES AN INCOMPLETE INDEX HONEST TO PUBLISH.

     The default layer is not a score. It is COVERAGE — how many of the five
     components each jurisdiction has been coded on. An index published before
     its inventory is finished has exactly one obligation, which is to show a
     reader how much of it is finished, and to show that first. A reader who
     opens this map sees the state of the work before they see a single score,
     and a jurisdiction that has not been coded is drawn as not coded rather
     than shaded some middling color that reads as a finding.

     Every score carries its evidence tier into the tooltip, so a component
     scored from a statute and one scored from an association's summary are
     never presented as the same claim. */
  function policymap(node) {
    var D = null, map = null, by = {};
    node.innerHTML =
      '<div class="tools atlastools">' +
      '<label>Layer <select data-f="layer">' +
      '<option value="coverage">Coding coverage &mdash; how much is known</option>' +
      '<option value="federal">The federal Education Freedom Tax Credit</option>' +
      '<option value="composite">Latitude &mdash; complete codings only</option>' +
      '<option value="formation">Formation</option>' +
      '<option value="autonomy">Autonomy</option>' +
      '<option value="portability">Portability</option>' +
      '<option value="household">Household</option>' +
      '<option value="security">Security</option>' +
      '</select></label>' +
      '<label>Evidence <select data-f="tier">' +
      '<option value="">Every tier</option>' +
      '<option value="A">Tier A only &mdash; the instrument itself</option>' +
      '<option value="AB">Tier A and B &mdash; official sources</option>' +
      '</select></label>' +
      '<button class="linkbtn" data-a="link" type="button">Copy link to this view</button>' +
      '</div><div class="atlasmap" data-c="map"></div>' +
      '<div class="atlaskey" data-c="legend"></div>' +
      '<p class="srctag" data-c="cap"></p>' +
      '<div data-c="panel"></div><div data-c="rank"></div>';
    var sel = function (f) { return node.querySelector('[data-f="' + f + '"]'); };

    function okTier(t) {
      var f = sel('tier').value;
      if (!f) { return true; }
      return f === 'A' ? t === 'A' : (t === 'A' || t === 'B');
    }
    function comp(g, k) {
      var r = by[g];
      if (!r) { return null; }
      var c = r.components[k];
      if (!c || c.score === null || c.score === undefined) { return null; }
      return okTier(c.tier) ? c : null;
    }
    function coverage(g) {
      var r = by[g];
      if (!r) { return 0; }
      return D.order.filter(function (k) { return comp(g, k); }).length;
    }

    function paint() {
      var layer = sel('layer').value;
      var cap = node.querySelector('[data-c="cap"]');
      var leg = node.querySelector('[data-c="legend"]');
      if (layer === 'coverage') {
        map.paint(function (g) {
          var n = coverage(g);
          return n === 0 ? '#ececec' : rampByShare(n / 5);
        });
        leg.innerHTML = '<div class="keyrow"><span class="kl">Not coded</span>' +
          '<i style="background:#ececec"></i>' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<i style="background:' + rampByShare(n / 5) +
              '" title="' + n + ' of 5"></i>';
          }).join('') + '<span class="kl">All five</span></div>' +
          '<div class="keynote">How many of the five Latitude components each ' +
          'jurisdiction has been coded on against a primary instrument. This is ' +
          'the state of the work, shown before any score is shown.</div>';
        var done = D.jurisdictions.filter(function (r) { return coverage(r.s) === 5; }).length;
        var some = D.jurisdictions.filter(function (r) { return coverage(r.s) > 0; }).length;
        var cw = function (n) { return n === 1 ? 'One' : spell(n).charAt(0).toUpperCase() +
          spell(n).slice(1); };
        cap.innerHTML = cw(done) + ' of ' + D.total + ' jurisdiction' +
          (D.total === 1 ? '' : 's') + ' ' + (done === 1 ? 'is' : 'are') +
          ' coded on all five components, and ' + spell(some) +
          ' on at least one, as of ' + D.as_of + '. ' + esc(D.incomplete_note);
        table('coverage');
        link(); return;
      }
      if (layer === 'federal') {
        var F = D.federal_program || { elections: {} };
        var COL = { Elected: '#1D7E78', Declined: '#8C2F1E',
          'Not elected': '#c7791f' };
        map.paint(function (g) { return COL[F.elections[g]] || '#ececec'; });
        leg.innerHTML = '<div class="keyrow">' +
          ['Elected', 'Declined', 'Not elected'].map(function (k) {
            return '<span class="kl" style="padding-left:0"><i style="background:' +
              COL[k] + ';border-radius:2px"></i> ' + k + '</span>';
          }).join('') + '<span class="kl" style="padding-left:0">' +
          '<i style="background:#ececec;border-radius:2px"></i> No election recorded</span>' +
          '</div><div class="keynote">' + esc(F.note || '') + '</div>';
        cap.innerHTML = '<strong>' + esc(F.name) + '.</strong> ' +
          esc(F.citation) + ', signed ' + esc(F.signed) + ', effective ' +
          esc(F.effective) + '. A credit of ' + esc(F.credit) +
          ' for donations to scholarship granting organizations, for ' +
          esc(F.eligibility) + '. ' + esc(F.mechanism) +
          ' One federal instrument, fifty-one state decisions: this is the layer ' +
          'where a Christian school\u2019s access to a federal credit is decided ' +
          'by its own governor.';
        node.querySelector('[data-c="panel"]').innerHTML = '';
        var rows = Object.keys(F.elections).sort();
        node.querySelector('[data-c="rank"]').innerHTML =
          '<details class="tv"><summary>The same figures as a table</summary>' +
          '<div class="tablewrap"><table class="data"><thead><tr>' +
          '<th>Jurisdiction</th><th>Election</th></tr></thead><tbody>' +
          rows.map(function (g) {
            return '<tr><td>' + esc(g) + '</td><td>' + esc(F.elections[g]) +
              '</td></tr>'; }).join('') + '</tbody></table></div></details>';
        link(); return;
      }
      if (layer === 'composite') {
        var have = D.jurisdictions.filter(function (r) { return r.rank; });
        map.paint(function (g) {
          var r = by[g];
          return (r && r.rank) ? rankColor(r.rank, have.length || 1) : '#ececec';
        });
        leg.innerHTML = '<div class="keyrow"><span class="kl">Most latitude</span>' +
          RAMP.slice().reverse().map(function (c) {
            return '<i style="background:' + c + '"></i>'; }).join('') +
          '<span class="kl">Least</span></div><div class="keynote">Only ' +
          'jurisdictions coded on all five components take a rank. A partial ' +
          'coding shows its components and takes none: a mean over three ' +
          'components is not comparable to a mean over five, and ranking them ' +
          'together would rank how little is known about each state.</div>';
        cap.innerHTML = esc(D.note) + ' ' + (have.length === 1 ? 'One' :
          spell(have.length).charAt(0).toUpperCase() + spell(have.length).slice(1)) +
          ' of ' + D.total + ' jurisdictions ' + (have.length === 1 ? 'is' : 'are') +
          ' ranked so far.';
        table('composite');
        link(); return;
      }
      var C = D.components[layer];
      map.paint(function (g) {
        var c = comp(g, layer);
        return c && c.score !== null && c.score !== undefined
          ? rampByShare(c.score / 4) : '#ececec';
      });
      leg.innerHTML = '<div class="keyrow"><span class="kl">0 &mdash; least</span>' +
        [0, 1, 2, 3, 4].map(function (n) {
          return '<i style="background:' + rampByShare(n / 4) + '"></i>'; }).join('') +
        '<span class="kl">4 &mdash; most</span></div><div class="keynote">' +
        esc(C.asks) + ' Each level is anchored to an observable fact about an ' +
        'instrument, never to an adjective.</div>';
      cap.innerHTML = '<strong>' + esc(C.name) + '.</strong> ' + esc(C.asks) +
        ' Hover a jurisdiction for the instrument the score was taken from and ' +
        'the evidence tier it sits at. ' +
        (sel('tier').value ? 'Filtered to ' +
          (sel('tier').value === 'A' ? 'tier A only.' : 'tiers A and B.') : '');
      anchors(layer);
      table(layer);
      link();
    }

    function anchors(k) {
      var C = D.components[k];
      node.querySelector('[data-c="panel"]').innerHTML =
        '<details class="tv"><summary>The rubric for ' + esc(C.name) + '</summary>' +
        '<div class="tablewrap"><table class="data"><thead><tr><th class="n">Score</th>' +
        '<th>What must be true of the instrument</th></tr></thead><tbody>' +
        [4, 3, 2, 1, 0].map(function (n) {
          return '<tr><td class="n">' + n + '</td><td>' + esc(C.anchors[n]) + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }

    function table(layer) {
      var rows = D.jurisdictions.slice();
      if (layer === 'federal') {
        var F = D.federal_program || { elections: {} };
        var COL = { Elected: '#1D7E78', Declined: '#8C2F1E',
          'Not elected': '#c7791f' };
        map.paint(function (g) { return COL[F.elections[g]] || '#ececec'; });
        leg.innerHTML = '<div class="keyrow">' +
          ['Elected', 'Declined', 'Not elected'].map(function (k) {
            return '<span class="kl" style="padding-left:0"><i style="background:' +
              COL[k] + ';border-radius:2px"></i> ' + k + '</span>';
          }).join('') + '<span class="kl" style="padding-left:0">' +
          '<i style="background:#ececec;border-radius:2px"></i> No election recorded</span>' +
          '</div><div class="keynote">' + esc(F.note || '') + '</div>';
        cap.innerHTML = '<strong>' + esc(F.name) + '.</strong> ' +
          esc(F.citation) + ', signed ' + esc(F.signed) + ', effective ' +
          esc(F.effective) + '. A credit of ' + esc(F.credit) +
          ' for donations to scholarship granting organizations, for ' +
          esc(F.eligibility) + '. ' + esc(F.mechanism) +
          ' One federal instrument, fifty-one state decisions: this is the layer ' +
          'where a Christian school\u2019s access to a federal credit is decided ' +
          'by its own governor.';
        node.querySelector('[data-c="panel"]').innerHTML = '';
        var rows = Object.keys(F.elections).sort();
        node.querySelector('[data-c="rank"]').innerHTML =
          '<details class="tv"><summary>The same figures as a table</summary>' +
          '<div class="tablewrap"><table class="data"><thead><tr>' +
          '<th>Jurisdiction</th><th>Election</th></tr></thead><tbody>' +
          rows.map(function (g) {
            return '<tr><td>' + esc(g) + '</td><td>' + esc(F.elections[g]) +
              '</td></tr>'; }).join('') + '</tbody></table></div></details>';
        link(); return;
      }
      if (layer === 'composite') {
        rows = rows.filter(function (r) { return r.rank; })
          .sort(function (a, b) { return a.rank - b.rank; });
      } else {
        rows.sort(function (a, b) { return coverage(b.s) - coverage(a.s) ||
          (a.s < b.s ? -1 : 1); });
      }
      node.querySelector('[data-c="rank"]').innerHTML =
        '<details class="tv"><summary>The same figures as a table</summary>' +
        '<div class="tablewrap"><table class="data"><thead><tr><th>Jurisdiction</th>' +
        '<th class="n">Coded</th>' +
        D.order.map(function (k) {
          return '<th class="n">' + esc(D.components[k].name) + '</th>'; }).join('') +
        '<th class="n">Rank</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.s) + '</td><td class="n">' + coverage(r.s) +
            ' of 5</td>' + D.order.map(function (k) {
              var c = comp(r.s, k);
              return '<td class="n">' + (c ? c.score + ' <span class="ts">' +
                c.tier + '</span>' : '—') + '</td>';
            }).join('') + '<td class="n">' + (r.rank ? ordinal(r.rank) : '—') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="srctag">The letter beside each score is its evidence tier. ' +
        esc(D.tiers.A) + ' Tier B: ' + esc(D.tiers.B) + ' Tier C: ' +
        esc(D.tiers.C) + '</p></details>';
    }

    function tip(g) {
      var r = by[g], layer = sel('layer').value;
      if (layer === 'federal') {
        var F = D.federal_program || { elections: {} };
        var e = F.elections[g];
        return '<b>' + esc(g) + '</b><br><span class="ts">' + esc(F.name) +
          '</span><br>' + (e ? esc(e) : 'No election recorded') +
          '<br><span class="ts">' + (e === 'Elected'
            ? 'Donations here can carry the federal credit from ' + esc(F.effective) + '.'
            : e === 'Declined' ? 'The state has declined to participate.'
            : e === 'Not elected' ? 'The state has not filed an election.'
            : 'The Institute has not sourced an election either way.') + '</span>';
      }
      var head = '<b>' + esc(g) + '</b><br><span class="ts">' +
        coverage(g) + ' of five components coded</span>';
      if (!r || coverage(g) === 0) {
        return head + '<br><span class="ts">Not yet coded. It is shown as ' +
          'uncoded rather than given a middling score.</span>';
      }
      if (layer === 'coverage' || layer === 'composite') {
        return head + '<br>' + D.order.map(function (k) {
          var c = comp(g, k);
          return esc(D.components[k].name) + ': ' +
            (c ? c.score + ' <span class="ts">tier ' + c.tier + '</span>' : '—');
        }).join('<br>') + (r.rank ? '<br><span class="ts">Ranked ' + ordinal(r.rank) +
          ' of ' + r.of_ranked + ' complete codings</span>' : '');
      }
      var c = comp(g, layer);
      if (!c) {
        return head + '<br><span class="ts">' + esc(D.components[layer].name) +
          ' is not coded here' + (sel('tier').value ? ' at this evidence tier' : '') +
          '.</span>';
      }
      return head + '<br><b>' + esc(D.components[layer].name) + ': ' + c.score +
        ' of 4</b><br><span class="ts">Tier ' + c.tier + ' &middot; ' +
        esc(c.instrument) + '</span>' + (c.doubt ?
          '<br><span class="ts">Carried with doubt attached.</span>' : '');
    }

    function link() {
      var u = new URL(location.href);
      u.searchParams.set('layer', sel('layer').value);
      u.searchParams.set('tier', sel('tier').value);
      history.replaceState(null, '', u);
    }

    Promise.all([get('data/policy.json'), get('data/geo/states.json')])
      .then(function (r) {
        D = r[0];
        D.jurisdictions.forEach(function (x) { by[x.s] = x; });
        var q = new URLSearchParams(location.search);
        if (q.get('layer')) { sel('layer').value = q.get('layer'); }
        if (q.get('tier')) { sel('tier').value = q.get('tier'); }
        map = USMap(node.querySelector('[data-c="map"]'), r[1], { tip: tip });
        ['layer', 'tier'].forEach(function (f) {
          sel(f).addEventListener('change', paint);
        });
        node.querySelector('[data-a="link"]').addEventListener('click', function (e) {
          copy(location.href, e.target);
        });
        paint();
      }).catch(function (e) { fail(node, e); });
  }

  /* ── The Record ─────────────────────────────────────────────────────────*/
  function record(node) {
    get('data/record.json').then(function (D) {
      node.innerHTML =
        '<div class="recfeed">' + D.posts.map(function (p) {
          return '<article class="recpost" id="' + esc(p.id) + '">' +
            '<div class="ck">' + esc(p.kind === 'monthly' ? 'Monthly release note'
              : p.kind === 'threshold' ? 'Threshold crossing' : 'A run ends') +
            ' &middot; ' + wname(p.window) + '</div>' +
            '<h3>' + esc(p.title) + '</h3>' +
            '<p class="recdeck">' + esc(p.deck) + '</p>' +
            p.body.map(function (b) { return '<p>' + esc(b) + '</p>'; }).join('') +
            '<p class="reclinks">' + (p.links || []).map(function (l) {
              return '<a href="' + BASE + l[1] + '">' + esc(l[0]) + '</a>';
            }).join(' &middot; ') + '</p></article>';
        }).join('') + '</div>' +
        '<p class="srctag">' + D.posts.length + ' notes for ' + wname(D.window) +
        (D.held ? ', with ' + D.held + ' held back under the daily cap' : '') +
        '. ' + esc(D.note) + '</p>';
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the sweep queue ────────────────────────────────────────────────────
     What the machine found, before anyone has read it.

     Published as a queue and never mixed with the register. A reader who wants
     to know what the Institute is about to look at can see it; a reader who
     wants to know what the Institute has actually sourced reads the register.
     Publishing the queue is also the cheapest honesty available about how much
     of the fifty-one jurisdiction inventory is done. */
  function policyqueue(node) {
    get('data/policy_queue.json').then(function (Q) {
      var C = Q.candidates || [], S = Q.sources || {};
      var TIER = { A: 'the instrument itself', B: 'an official source',
        C: 'a published summary', D: 'reported, primary source not yet located' };
      node.innerHTML =
        '<div class="queuehead"><strong>Unreviewed candidates.</strong> ' +
        esc(Q.note) + '</div>' +
        '<div class="srcgrid">' + Object.keys(S).map(function (k) {
          var x = S[k], off = /NOT CONFIGURED/.test(x.status || '');
          return '<div class="srccard' + (off ? ' off' : '') + '">' +
            '<div class="ck">' + esc(k.replace(/_/g, ' ')) + ' &middot; tier ' +
            esc(x.tier) + '</div><h4>' + esc(x.name) + '</h4>' +
            '<p class="ts">' + esc(TIER[x.tier] || '') + '</p>' +
            '<p class="st">' + esc(x.status || '') + '</p></div>';
        }).join('') + '</div>' +
        '<div class="tools"><input type="text" data-c="q" ' +
        'placeholder="Find a candidate" aria-label="Find a candidate">' +
        '<label>Source <select data-c="sr"><option value="">Every source</option>' +
        '</select></label>' +
        '<label>Class <select data-c="cl"><option value="">Every class</option>' +
        '</select></label><span class="count" data-c="n"></span></div>' +
        '<div class="tablewrap tallwrap"><table class="data"><thead><tr>' +
        '<th>Date</th><th>Candidate</th><th>Where</th><th>Source</th>' +
        '<th>Class</th><th class="n">Tier</th></tr></thead><tbody>' +
        C.map(function (c) {
          return '<tr data-cl="' + esc(c['class']) + '" data-sr="' + esc(c.source) +
            '"><td>' + esc(c.date || '\u2014') + '</td><td><a href="' + esc(c.url) +
            '" rel="noopener nofollow">' + esc(c.title) + '</a></td><td>' +
            esc(c.where || '') + '</td><td>' + esc(c.source.replace(/_/g, ' ')) +
            '</td><td>' + esc(c['class'].replace(/_/g, ' ')) + '</td>' +
            '<td class="n">' + esc(c.tier_hint) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="srctag">Swept ' + esc(Q.swept) + '. ' + C.length +
        ' candidates across four sources. This list will always contain matters ' +
        'that turn out to have nothing to do with Christian schooling: that is ' +
        'the sweep working, not failing. A person reads each one and promotes ' +
        'the few that belong.</p>';
      function fill(sel, key) {
        var v = [];
        C.forEach(function (c) { if (v.indexOf(c[key]) < 0) { v.push(c[key]); } });
        var el = node.querySelector('[data-c="' + sel + '"]');
        el.innerHTML = el.innerHTML + v.sort().map(function (x) {
          return '<option value="' + esc(x) + '">' + esc(x.replace(/_/g, ' ')) +
            '</option>'; }).join('');
        return el;
      }
      var selS = fill('sr', 'source'), selC = fill('cl', 'class');
      var q = node.querySelector('[data-c="q"]');
      var trs = Array.prototype.slice.call(node.querySelectorAll('tbody tr'));
      var cnt = node.querySelector('[data-c="n"]');
      function filter() {
        var v = q.value.toLowerCase(), f = selC.value, g = selS.value, n = 0;
        trs.forEach(function (tr) {
          var ok = (!f || tr.getAttribute('data-cl') === f) &&
            (!g || tr.getAttribute('data-sr') === g) &&
            tr.textContent.toLowerCase().indexOf(v) >= 0;
          tr.style.display = ok ? '' : 'none';
          if (ok) { n++; }
        });
        cnt.textContent = n + ' of ' + trs.length + ' shown';
      }
      q.addEventListener('input', filter);
      selC.addEventListener('change', filter);
      selS.addEventListener('change', filter);
      filter();
    }).catch(function (e) { fail(node, e); });
  }

  /* ── THE CHRONICLE ───────────────────────────────────────────────────────
     The series animated month by month, with the Policy Monitor's dated events
     annotated on the same timeline.

     WHAT THIS FEATURE IS FOR, AND THE LINE IT DOES NOT CROSS.

     It was asked for so that a viewer could see which policies have moved the
     indices. It cannot answer that, and no arrangement of these two datasets
     can. What it CAN do — and what nobody else has built — is put the movement
     and the instrument on one timeline at their own dates, so a reader can see
     for themselves what happened near what, and go and read the instrument.

     That distinction is not pedantry, it is the Institute's whole position. A
     ruling and a movement in the same month may be connected, may be connected
     through something neither of them names, or may be a coincidence out of
     twenty-two years of months. The page shows the coincidence in time, says
     plainly that it is a coincidence in time, and stops. The Institute reports
     the movement and does not explain it, though we posit how and why it
     occurred in our research.

     So: no event is ever drawn as a cause. Nothing is highlighted for being
     "near" a movement. The reader moves the playhead and the reader decides. */
  function chronicle(node) {
    var S = {}, P = null, map = null, W = null, ctl = null, sel;
    var st = { k: 'master', g: '' };
    var q = new URLSearchParams(location.search);
    ['k', 'g'].forEach(function (f) { if (q.get(f)) { st[f] = q.get(f); } });

    node.innerHTML =
      '<div class="tools atlastools">' +
      '<label>Index <select data-f="k"></select></label>' +
      '<label>Follow <select data-f="g"><option value="">The whole country</option>' +
      '</select></label>' +
      '<label>Events <select data-f="scope"><option value="">Federal and state</option>' +
      '<option value="federal">Federal only</option>' +
      '<option value="state">State only</option></select></label>' +
      '<button class="linkbtn" data-a="link" type="button">Copy link to this view</button>' +
      '</div>' +
      '<div class="chronwrap">' +
      '<div class="chronmap"><div class="atlasmap" data-c="map"></div>' +
      '<div class="atlaskey" data-c="legend"></div></div>' +
      '<div class="chronside"><div class="chroncard" data-c="card"></div></div>' +
      '</div>' +
      '<div data-c="slider"></div>' +
      '<div class="chrontl" data-c="tl"></div>' +
      '<p class="srctag" data-c="cap"></p>' +
      '<div class="nonattrib"><strong>What this shows, and what it does not.</strong> ' +
      'The line and the map are the Institute&rsquo;s measurement. The marks below ' +
      'are dated policy events from the Policy Monitor. They are drawn on one ' +
      'timeline so that a reader can see what happened near what, and they are ' +
      'placed at their own dates and never at a date chosen to line up with a ' +
      'movement. <strong>Nothing here asserts that any instrument caused any ' +
      'movement.</strong> The Institute reports the movement and does not explain ' +
      'it, though we posit how and why it occurred in our research.</div>' +
      '<div data-c="lines"></div>';
    sel = function (f) { return node.querySelector('[data-f="' + f + '"]'); };

    function evs() {
      var sc = sel('scope').value;
      return (P.events || []).filter(function (e) {
        if (!e.status_date) { return false; }
        if (sc && e.scope !== sc) { return false; }
        if (st.g && e.scope === 'state' && e.jurisdiction !== st.g) { return false; }
        return true;
      }).sort(function (a, b) {
        return a.status_date < b.status_date ? -1 : 1; });
    }

    function wOf(d) { return d.slice(0, 7); }

    function timeline() {
      var s = S[st.k], wins = s.windows, host = node.querySelector('[data-c="tl"]');
      var E = evs();
      /* The first tick sits at January 2004, and its label is centred on it.
         With an eight-pixel margin the "2" ran off the left edge of the SVG and
         the axis read "004". The margin now clears half a four-digit label at
         this type size. */
      var Wd = 900, H = 66, ml = 22, mr = 22;
      function X(w) {
        var i = wins.indexOf(w);
        if (i < 0) {
          // An event before the series begins sits at the left edge, marked as
          // preceding the record rather than silently moved into it.
          return w < wins[0] ? ml : Wd - mr;
        }
        return ml + i * (Wd - ml - mr) / Math.max(1, wins.length - 1);
      }
      var out = ['<svg viewBox="0 0 ' + Wd + ' ' + H + '" style="width:100%;height:auto" ' +
        'role="img" aria-label="Policy events on the series timeline">'];
      out.push('<line x1="' + ml + '" y1="46" x2="' + (Wd - mr) + '" y2="46" ' +
        'stroke="#ccc"/>');
      wins.forEach(function (w) {
        if (w.slice(5) !== '01' || +w.slice(0, 4) % 4) { return; }
        out.push('<line x1="' + X(w).toFixed(1) + '" y1="42" x2="' + X(w).toFixed(1) +
          '" y2="50" stroke="#bbb"/><text x="' + X(w).toFixed(1) + '" y="62" ' +
          'text-anchor="middle" font-size="11" fill="#777" ' +
          'font-family="-apple-system,sans-serif">' + w.slice(0, 4) + '</text>');
      });
      var early = 0;
      E.forEach(function (e, i) {
        var w0 = wOf(e.status_date);
        var before = w0 < wins[0];
        // An event that predates the series is not moved into it. The register
        // opens in 2002 and the measurement opens in 2004, and Zelman sits in
        // the gap: it is drawn in a gutter at the left, as an open marker, and
        // labeled as preceding the record rather than pinned to January 2004
        // where it would read as having happened then.
        var x = before ? 4 + (early++) * 9 : X(w0);
        var fed = e.scope === 'federal';
        var y = fed ? 12 : 30;
        var col = fed ? '#1a3a5c' : '#8C2F1E';
        if (!before) {
          out.push('<line x1="' + x.toFixed(1) + '" y1="' + y + '" x2="' +
            x.toFixed(1) + '" y2="46" stroke="' + col + '" stroke-width="1" ' +
            'pointer-events="none"/>');
        }
        out.push('<circle class="evdot" data-i="' + i + '" cx="' + x.toFixed(1) +
          '" cy="' + y + '" r="' + (fed ? 5 : 4) + '" fill="' +
          (before ? '#fff' : col) + '" stroke="' + col + '" stroke-width="' +
          (before ? 2 : 1.2) + '">' +
          '<title>' + esc(e.instrument) + ' \u2014 ' + esc(e.status_date) +
          (before ? ' \u2014 precedes the measured series' : '') + '</title>' +
          '</circle>');
      });
      out.push('<line class="playhead" x1="' + X(W).toFixed(1) + '" y1="4" x2="' +
        X(W).toFixed(1) + '" y2="52" stroke="#111" stroke-width="1.5"/>');
      host.innerHTML = out.join('') + '</svg>' +
        '<div class="tlkey"><span><i style="background:#1a3a5c"></i>Federal</span>' +
        '<span><i style="background:#8C2F1E"></i>State</span>' +
        '<span class="ts">' + E.length + ' dated events on this timeline' +
        (early ? ', ' + spell(early) + ' of them hollow at the left because ' +
          (early === 1 ? 'it predates' : 'they predate') + ' the measured series' : '') +
        '</span></div>';
      host.querySelectorAll('.evdot').forEach(function (c) {
        c.addEventListener('click', function () {
          var e = E[+c.getAttribute('data-i')];
          ctl.stop();
          var i = s.windows.indexOf(wOf(e.status_date));
          if (i >= 0) { ctl.set(i); }
          card(e);
        });
      });
    }

    function card(e) {
      var host = node.querySelector('[data-c="card"]');
      if (!e) {
        var near = evs().filter(function (x) { return wOf(x.status_date) === W; });
        if (!near.length) {
          host.innerHTML = '<div class="ck">' + wname(W) + '</div>' +
            '<p class="ts">No policy event is recorded in this window. The ' +
            'Policy Monitor inventory is being assembled jurisdiction by ' +
            'jurisdiction, so an empty window means nothing has been sourced ' +
            'for it yet, not that nothing happened.</p>';
          return;
        }
        e = near[0];
      }
      host.innerHTML =
        '<div class="ck">' + esc(e.jurisdiction) + ' &middot; ' +
        esc(e.status_date) + ' &middot; tier ' + esc(e.tier) + '</div>' +
        '<h4>' + esc(e.instrument) + '</h4>' +
        '<p>' + esc(e.summary) + '</p>' +
        '<p class="ts">Status: ' + esc(e.status) +
        (e.vote ? ' &middot; the court recorded a vote of ' + esc(e.vote) : '') +
        '</p>' +
        '<p class="ts">This entry is dated ' + esc(e.status_date) + ' and is drawn ' +
        'at that date. Its position beside a movement in the series is a ' +
        'coincidence in time and is not a finding.</p>';
    }

    function paint(w) {
      W = w;
      var s = S[st.k], rk = s.rank[w] || [];
      var of = rk.filter(function (x) { return x; }).length || 50;
      map.paint(function (g) {
        var j = s.states.indexOf(g);
        if (j < 0 || !rk[j]) { return '#ececec'; }
        if (st.g && g !== st.g) { return rankColor(rk[j], of); }
        return rankColor(rk[j], of);
      });
      var el = node.querySelector('[data-c="map"]');
      el.querySelectorAll('path.st').forEach(function (p2) {
        p2.classList.toggle('followed', !!st.g && p2.getAttribute('data-name') === st.g);
      });
      atlasLegendRank(node.querySelector('[data-c="legend"]'), of,
        esc(s.name) + ' Index. Every state shaded by its standing in this window.');
      node.querySelector('[data-c="cap"]').innerHTML =
        esc(s.name) + ' Index, ' + wname(w) + '. ' +
        (st.g ? esc(st.g) + ' is outlined. ' : '') +
        'A movement is a change in standing rather than growth or decline in any ' +
        'quantity.';
      // The timeline draws the playhead, so gating the redraw on the playhead
      // already existing meant it never drew at all: the first paint found no
      // playhead, skipped the timeline, and there was nothing to find on any
      // paint after it. Draw it every time; it is one small SVG.
      timeline();
      card(null);
      lines();
      link();
    }

    function lines() {
      var host = node.querySelector('[data-c="lines"]');
      if (!st.g) { host.innerHTML = ''; return; }
      var s = S[st.k], j = s.states.indexOf(st.g);
      if (j < 0) { host.innerHTML = ''; return; }
      var pts = [];
      s.windows.forEach(function (w) {
        var v = (s.rank[w] || [])[j];
        if (v) { pts.push([w, v]); }
      });
      // The heading used to promise the events "beneath it". They are not
      // beneath it: they are on the timeline above, which is the same timeline
      // and the same dates. Drawing a second copy under a chart whose plot area
      // has different margins would put every mark a few pixels off its own
      // date, which is worse than not drawing it.
      host.innerHTML = '<h3 class="chronh">' + esc(st.g) + ' on the ' + esc(s.name) +
        ' Index, every window. The dated events are on the timeline above.</h3>' +
        '<div class="chartcard" data-c="ln"></div>';
      rankline(host.querySelector('[data-c="ln"]'),
        [{ name: st.g, points: pts }], { height: 250, raw: true });
    }

    function link() {
      var u = new URL(location.href);
      u.searchParams.set('k', st.k);
      u.searchParams.set('g', st.g);
      u.searchParams.set('w', W);
      history.replaceState(null, '', u);
    }

    Promise.all([get('data/manifest.json'), get('data/series/master.json'),
                 get('data/policy.json'), get('data/geo/states.json')])
      .then(function (r) {
        var M = r[0]; S.master = r[1]; P = r[2];
        sel('k').innerHTML = M.indices.map(function (x) {
          return '<option value="' + x.key + '"' + (x.key === st.k ? ' selected' : '') +
            '>' + esc(x.name) + '</option>'; }).join('');
        sel('g').innerHTML += M.states.map(function (x) {
          return '<option' + (x.s === st.g ? ' selected' : '') + '>' + esc(x.s) +
            '</option>'; }).join('');
        map = USMap(node.querySelector('[data-c="map"]'), r[3], {
          tip: function (g) {
            var s = S[st.k], j = s.states.indexOf(g), rk = (s.rank[W] || [])[j];
            var rt = (s.ratio[W] || [])[j];
            return '<b>' + esc(g) + '</b><br><span class="ts">' + wname(W) +
              '</span><br>' + (rk ? ordinal(rk) + ' of 50' : 'not measured') +
              (rt ? '<br>' + rt.toFixed(2) + '&times; the median state' : '');
          },
          href: null
        });
        node.querySelector('[data-c="map"]').addEventListener('click', function (e) {
          var t = e.target.closest ? e.target.closest('path.st') : null;
          if (!t) { return; }
          st.g = (st.g === t.getAttribute('data-name')) ? '' : t.getAttribute('data-name');
          sel('g').value = st.g;
          paint(W);
        });
        var wins = S.master.windows;
        var at = wins.indexOf(q.get('w'));
        ctl = windowSlider(node.querySelector('[data-c="slider"]'), wins,
          at < 0 ? wins.length - 1 : at, function (w) { paint(w); });
        sel('k').addEventListener('change', function () {
          st.k = sel('k').value;
          if (S[st.k]) { paint(W); return; }
          get('data/series/' + st.k + '.json').then(function (x) {
            S[st.k] = x; paint(W); });
        });
        sel('g').addEventListener('change', function () { st.g = sel('g').value; paint(W); });
        sel('scope').addEventListener('change', function () { paint(W); });
        node.querySelector('[data-a="link"]').addEventListener('click', function (e) {
          copy(location.href, e.target);
        });
      }).catch(function (e) { fail(node, e); });
  }

  /* The widest split between two level indices, named and computed.

     This sentence used to be an invented illustration — "a state can sit sixth
     for high school and thirty-second for elementary" — written as though it
     had been observed. It had not. It happens to be true of Wyoming in the
     current window, which is luck rather than diligence, so it is computed and
     named now and it will follow the data when the window changes. */
  function levelsplit(node) {
    get('data/manifest.json').then(function (M) {
      var s = M.widest_level_split;
      if (!s) { node.textContent = ''; return; }
      node.innerHTML = 'In ' + wname(M.window) + ' that gap is widest in <strong>' +
        esc(s.state) + '</strong>, which stands ' + ordinal(s.highschool) +
        ' of fifty for high school and ' + ordinal(s.elementary) +
        ' for elementary' + (s.master ? ', while its Master Index standing is ' +
        ordinal(s.master) : '') + '. One figure would have concealed a gap of ' +
        spell(s.gap) + ' places.';
    }).catch(function () { node.textContent = ''; });
  }


  /* ── share: the one affordance the site was missing ──────────────────────
     The embed builder existed as a page and was reachable only from a link in
     the footer, which is the same as not existing. A reader who wants to send
     a figure to somebody, or put it in a newsletter, will not go looking for a
     builder; the offer has to be beside the figure.

     Three actions, and no more, because a row of six buttons is furniture:
       Copy link    the page, carrying whichever month the slider is on, so a
                    link never silently means "whatever is current when opened"
       Embed        the iframe snippet, with the attribution inside the frame
       Data         the CSV behind this page, where the page declares one

     The month matters and is easy to get wrong. If the time machine has moved
     the page, the copied link carries ?w= so the recipient sees what the sender
     saw. That is the whole of "carry the month", enforced by the button rather
     than asked of the reader. */
  /* ── share, copy, embed ───────────────────────────────────────────────────
     Research travels by being sent to somebody. The bar carried a copy link,
     an embed snippet, and a citation link, which covers the reader who is
     already at a keyboard and nobody else. It now carries the places people
     actually forward things to, WhatsApp first, because outside the United
     States and inside a great many churches it is the place things are
     forwarded.

     No third-party script is loaded and no button reports back. Every target
     is a plain link built here from the page's own address, so a reader who
     shares nothing is not counted by anyone. The Institute learns that a page
     was shared only from its own analytics, and only in aggregate. */
  function shareTargets(u, title) {
    var eu = encodeURIComponent(u), et = encodeURIComponent(title);
    return [
      ['WhatsApp', 'https://api.whatsapp.com/send?text=' + et + '%20' + eu],
      ['Email', 'mailto:?subject=' + et + '&body=' + et + '%0A%0A' + eu],
      ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + eu],
      ['X', 'https://twitter.com/intent/tweet?url=' + eu + '&text=' + et],
      ['LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' + eu],
      ['Bluesky', 'https://bsky.app/intent/compose?text=' + et + '%20' + eu],
      ['Threads', 'https://www.threads.net/intent/post?text=' + et + '%20' + eu],
      ['Reddit', 'https://www.reddit.com/submit?url=' + eu + '&title=' + et],
      ['Telegram', 'https://t.me/share/url?url=' + eu + '&text=' + et]
    ];
  }

  function sharebar(node) {
    /* Every page carries one of these in the shell. A page that already has a
       richer bar of its own — one that knows its index, its CSV, or its
       report — keeps that one, and the shell's copy stands down rather than
       printing the same buttons twice. */
    if (node.getAttribute('data-auto') === '1' &&
        document.querySelector('[data-widget="sharebar"]:not([data-auto])')) {
      var sec = node.closest ? node.closest('.sharefoot') : null;
      if (sec) { sec.remove(); } else { node.remove(); }
      return;
    }
    var k = node.getAttribute('data-index') || '';
    var st = node.getAttribute('data-share-state') || '';
    var csv = node.getAttribute('data-csv') || '';
    var label = node.getAttribute('data-label') || 'this page';
    var pdf = node.getAttribute('data-pdf') || '';

    function url() {
      var w = document.body.getAttribute('data-window');
      var u = location.origin + location.pathname;
      return w ? u + '?w=' + w : u;
    }
    function title() {
      var h = document.querySelector('h1');
      var base = (h ? h.textContent.trim() : document.title);
      return base + ' — Spring Vale Christian Education Institute';
    }
    function snippet() {
      var q = 'k=' + encodeURIComponent(k || 'master');
      if (st) { q += '&s=' + encodeURIComponent(st); }
      return '<iframe src="' + siteURL('embed/chart.html') + '?' + q +
        '" width="100%" height="340" frameborder="0" ' +
        'title="' + esc(label) + ' — Spring Vale Christian Education Institute"' +
        ' loading="lazy"></iframe>';
    }

    var bits = ['<button type="button" data-a="link">Copy link</button>'];
    bits.push('<button type="button" data-a="cite">Copy citation</button>');
    if (k) { bits.push('<button type="button" data-a="embed">Copy embed code</button>'); }
    if (csv) {
      bits.push('<a class="btn" href="' + esc(csv) + '" download>Download the data</a>');
    }
    if (pdf) {
      bits.push('<a class="btn" href="' + esc(fileURL(pdf)) + '">Download the report</a>');
    }
    bits.push('<a class="btn" href="' + BASE + 'cite/index.html">How to cite this</a>');

    var share = shareTargets(url(), title()).map(function (s) {
      return '<a class="sh" href="' + esc(s[1]) + '" target="_blank" ' +
        'rel="noopener noreferrer" data-share="' + esc(s[0]) + '">' +
        esc(s[0]) + '</a>';
    }).join('');

    node.innerHTML = '<div class="sharebar">' + bits.join('') + '</div>' +
      '<div class="sharebar shareto"><span class="sl">Share</span>' + share +
      '</div>';

    node.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a');
        copy(a === 'embed' ? snippet()
          : a === 'cite' ? citationText(url())
            : url(), b);
      });
    });
  }

  /* ── tools on the figure itself ───────────────────────────────────────────
     A share block at the foot of a page serves the reader who wants to send
     the page. A reader who wants to send one chart — which is most of them,
     because a chart is the thing that made them want to send anything — had to
     screenshot it. Every figure now carries its own controls.

     Four of them, and each does one thing:
       Link   a deep link that opens the page scrolled to this figure
       Image  the figure as a PNG, drawn from the SVG in the reader's browser
       Embed  an iframe of the figure, where the figure has an embeddable form
       Share  the same destinations as the page, carrying the deep link

     Nothing is fetched to make any of this work. The PNG is rendered from the
     SVG already on the page, so a figure a reader can see is a figure they can
     take, and the Institute is not told that they took it. */
  function figSlug(el, i) {
    var sec = el.closest ? el.closest('section') : null;
    var h = sec ? sec.querySelector('h2, h3') : null;
    var base = h ? slug(h.textContent.trim()).slice(0, 40) : 'figure';
    return 'fig-' + base + (i ? '-' + i : '');
  }

  function svgToPng(svg, name) {
    try {
      var box = svg.getBoundingClientRect();
      var w = Math.max(600, Math.round(box.width * 2));
      var h = Math.max(300, Math.round(box.height * 2));
      var clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      var data = new XMLSerializer().serializeToString(clone);
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        c.toBlob(function (blob) {
          var u = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = u; a.download = name + '.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
        });
      };
      img.src = 'data:image/svg+xml;base64,' +
        btoa(unescape(encodeURIComponent(data)));
    } catch (e) { /* a figure that will not draw is not worth an alert */ }
  }

  function figtools() {
    /* Find figures by what they are rather than by a list of class names. A
       list has to be kept in step with every widget anyone adds, and it was
       already out of step on the index pages, the market pages, and the ZIP
       lookup — which is to say on most of the figures worth sending. Anything
       drawn large enough to be a figure gets the tools. */
    var seen = document.querySelectorAll('[data-tooled]').length;
    Array.prototype.slice.call(
      document.querySelectorAll('main svg, section svg, .viz-frame svg, section canvas')
    ).forEach(function (g) {
      var up = g.parentElement;
      while (up) {
        if (up.getAttribute && up.getAttribute('data-tooled')) { return; }
        up = up.parentElement;
      }
      var r = g.getBoundingClientRect();
      if (r.width < 260 || r.height < 110) { return; }      /* a swatch is not a figure */
      if (g.closest && g.closest('.figtools, .heroart, nav, footer')) { return; }

      /* The tools sit on a wrapper rather than on the figure, so that nothing
         is added inside an SVG that a reader may download as an image. */
      var host = g.parentElement;
      if (!host || host.children.length > 3 || host.tagName === 'BODY') {
        host = document.createElement('div');
        host.className = 'figwrap';
        g.parentNode.insertBefore(host, g);
        host.appendChild(g);
      }
      if (host.getAttribute('data-tooled')) { return; }
      host.setAttribute('data-tooled', '1');
      seen += 1;

      var id = host.id || figSlug(host, seen);
      host.id = id;
      var deep = location.origin + location.pathname + '#' + id;
      var bar = document.createElement('div');
      bar.className = 'figtools';
      bar.innerHTML =
        '<button type="button" data-t="link" title="Copy a link to this figure">Link</button>' +
        (g.tagName.toLowerCase() === 'svg'
          ? '<button type="button" data-t="png" title="Download this figure as an image">Image</button>'
          : '') +
        '<button type="button" data-t="share" title="Send this figure to someone">Share</button>';
      if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }
      host.appendChild(bar);

      bar.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b) { return; }
        var t = b.getAttribute('data-t');
        if (t === 'link') { copy(deep, b); return; }
        if (t === 'png') { svgToPng(g, id); return; }
        if (t === 'share') { figShare(host, bar, deep); }
      });
    });
  }

  function figShare(el, bar, deep) {
    var old = el.querySelector('.figshare');
    if (old) { old.remove(); return; }
    var h = document.querySelector('h1');
    var title = (h ? h.textContent.trim() : document.title) +
      ' — Spring Vale Christian Education Institute';
    if (navigator.share) {
      navigator.share({ title: title, url: deep }).catch(function () { /* dismissed */ });
      return;
    }
    var d = document.createElement('div');
    d.className = 'figshare';
    d.innerHTML = shareTargets(deep, title).map(function (s) {
      return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener noreferrer">' +
        esc(s[0]) + '</a>';
    }).join('');
    el.appendChild(d);
  }

  /* One citation, built from the page and the window it is showing, so that a
     figure quoted from this site carries the month it was true in. */
  function citationText(u) {
    var h = document.querySelector('h1');
    var w = document.body.getAttribute('data-window') || '';
    var lab = w ? wname(w) : '';
    var y = new Date().getFullYear();
    return 'Spring Vale Christian Education Institute. ' +
      (lab ? lab + '. ' : '') + (h ? h.textContent.trim() + '. ' : '') +
      'Owosso, Michigan: Spring Vale Christian School, ' + y + '. ' + u;
  }

  /* The diverging scale for the gap layer. Teal through a near-neutral to
     brick, cut at fixed points so the same difference is the same color in
     every month and on every page that draws it. */
  function gapColor(d) {
    var stops = [[-40, '#0f6f68'], [-25, '#41988f'], [-10, '#a8c8c2'],
                 [10, '#eee6de'], [25, '#d9917f'], [40, '#b2453a'], [999, '#7d1f19']];
    for (var i = 0; i < stops.length; i++) {
      if (d <= stops[i][0]) { return stops[i][1]; }
    }
    return stops[stops.length - 1][1];
  }

  /* Built with the same markup the other atlas legends use, so it inherits the
     house key styling rather than inventing its own. */
  function atlasGapLegend(host) {
    if (!host) { return; }
    var sw = ['#0f6f68', '#41988f', '#a8c8c2', '#eee6de', '#d9917f', '#b2453a', '#7d1f19']
      .map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('');
    host.innerHTML =
      '<div class="keyrow"><span class="kl">Schools higher</span>' + sw +
      '<span class="kl">Attention higher</span></div>' +
      '<div class="keynote">The middle band is where the two sit close together. ' +
      'This is a difference between two positions on one 0 to 100 scale: it is not a ' +
      'quantity, it is not a rate, and it is not a claim that either produces the ' +
      'other.</div>';
  }


  /* ── recording a lookup ───────────────────────────────────────────────────
     Three fields and no fourth: the ZIP typed, the market area it resolved to,
     and the time. No cookie is set, no identifier is minted, and nothing links
     one lookup to another or to any other action on the site — which is what
     lets the privacy page describe this in a sentence rather than a schedule.

     It is fire-and-forget. A reader's answer is already on screen before this
     runs, the call cannot block it, and a failure is silent: an outage in a
     counting endpoint must never break a lookup. sendBeacon is used where the
     browser has it because it survives the page being closed.

     ZIPLOG empty means this function does nothing at all, and the note under
     the box says so. The claim and the behaviour come from one constant. */
  /* ── what the finder reports ──────────────────────────────────────────────
     Three things: the ZIP code typed, the market area it resolved to, and the
     time. Nothing else, and nothing that could be joined to anything else.

     The ZIP code is recorded on instruction of 2 September 2026. An earlier
     draft of this function withheld it, on the reasoning that a market area is
     a region and a ZIP code is a street or two. That reasoning was sound about
     what is PUBLISHED and wrong about what is KEPT: the map still publishes the
     market area and only the market area, and the Institute keeps the ZIP so it
     can see which districts it is being asked about and, more usefully, which
     ZIP codes resolve to nothing at all. A ZIP the table cannot place is a gap
     in the Institute's own geography, and there was previously no way to know
     one had been typed.

     What makes this safe is not withholding the district; it is that there is
     no identifier anywhere to attach a district to. No cookie is set, none is
     read, no session is minted, and the smallest thing the record can describe
     is a five-digit district in an hour with a count beside it.

     A ZIP that resolves to no market area is still reported, which is why this
     runs whether or not there is a market id. Not sent at all when the browser
     sends Global Privacy Control, and refused again by the Worker on its own
     side. */
  function recordLookup(zip, marketId, marketName) {
    if (!LIVEAPI || (!marketId && !zip)) { return; }
    if (gpcOn()) { return; }
    try {
      var u = LIVEAPI + '/lookup?m=' + encodeURIComponent(marketId || '') +
        (zip ? '&z=' + encodeURIComponent(zip) : '') +
        (marketName ? '&n=' + encodeURIComponent(marketName) : '');
      fetch(u, { mode: 'cors', credentials: 'omit', cache: 'no-store',
                 keepalive: true })
        .catch(function () { /* a counter never breaks a lookup */ });
    } catch (e) { /* nor does a browser that refuses to send */ }
  }

  /* ── small shared helpers ────────────────────────────────────────────────*/
  /* ── what the Institute counts when research travels ──────────────────────
     A share button that reports nothing tells the Institute that a page was
     read and never that it was passed on, which is the one thing worth knowing
     about research published to be used. Four actions are counted, and no
     fifth: a share, and the platform chosen; a copy, and whether it was a link,
     a citation, or an embed; a click that leaves the site, and the domain it
     went to; and a file downloaded, by name.

     What is NOT counted, and cannot be: where a shared link went after the
     click, who received it, or whether anybody opened it. No service on earth
     can tell the Institute that, and the privacy policy says so plainly rather
     than implying a reach the Institute does not have.

     Every one of these rides on Google Analytics, so a reader who has switched
     it off, or whose browser sends Global Privacy Control, is counted in none
     of them: window.gtag simply is not there. */
  function track(name, params) {
    try {
      if (typeof window.gtag !== 'function') { return; }
      var p = params || {};
      p.page_path = location.pathname;
      window.gtag('event', name, p);
    } catch (e) { /* a counter never breaks the thing it counts */ }
  }

  function wireTracking() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (a && a.href) {
        var sh = a.getAttribute('data-share');
        if (sh || a.closest('.figshare')) {
          track('share', { method: sh || a.textContent.trim(),
                           content_type: a.closest('.figshare') ? 'figure' : 'page' });
        } else if (/\.(pdf|csv|json|xlsx)(\?|$)/i.test(a.getAttribute('href') || '')) {
          track('file_download', {
            file_name: (a.getAttribute('href') || '').split('/').pop() });
        } else {
          var host = '';
          try { host = new URL(a.href, location.href).host; } catch (x) { host = ''; }
          if (host && host !== location.host) {
            track('outbound_click', { link_domain: host });
          }
        }
        return;
      }
      var b = e.target.closest ? e.target.closest('button[data-a], button[data-t]') : null;
      if (!b) { return; }
      var kind = b.getAttribute('data-a') || b.getAttribute('data-t');
      if (kind === 'link' || kind === 'cite' || kind === 'embed' || kind === 'png') {
        track('copy', { content_type: kind === 'png' ? 'image' : kind,
                        scope: b.closest('.figtools') ? 'figure' : 'page' });
      }
    }, true);
  }

  function copy(text, btn) {
    var done = function () {
      if (!btn) { return; }
      var was = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = was; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing to do */ }
      document.body.removeChild(ta);
    }
  }

  function download(text, name) {
    var b = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 400);
  }

  function fail(node, e) {
    node.innerHTML = '<p class="srctag">This view could not load its data (' +
      esc(e && e.message ? e.message : String(e)) + '). The figures behind it are in the ' +
      '<a href="' + BASE + 'reports/index.html">report library</a>.</p>';
  }

  /* ── Robinson, in the browser ─────────────────────────────────────────────
     The visitor feed carries latitude and longitude, because Cloudflare hands
     those to the Worker for free. Projecting them here rather than on the way
     in means the feed is plain, readable numbers that anybody can check, and
     it means no gazetteer of city coordinates has to exist at all.

     The table is Robinson's own: at every fifth parallel, the length of that
     parallel and its distance from the equator. It is the same table
     worldgeo.py uses, so a dot and the coastline under it are placed by
     identical arithmetic. */
  var ROBINSON = [
    [0.8487, 0.0000], [0.8486, 0.0620], [0.8483, 0.1240], [0.8480, 0.1860],
    [0.8474, 0.2480], [0.8459, 0.3100], [0.8439, 0.3720], [0.8402, 0.4340],
    [0.8360, 0.4958], [0.8290, 0.5571], [0.8199, 0.6176], [0.8082, 0.6769],
    [0.7930, 0.7346], [0.7749, 0.7903], [0.7528, 0.8435], [0.7252, 0.8936],
    [0.6928, 0.9394], [0.6521, 0.9761], [0.6100, 1.0000]
  ];
  function robinson(lon, lat, W, H) {
    var a = Math.min(Math.abs(lat), 90) / 5;
    var i = Math.min(Math.floor(a), 17), t = a - i;
    var px = ROBINSON[i][0] + (ROBINSON[i + 1][0] - ROBINSON[i][0]) * t;
    var py = ROBINSON[i][1] + (ROBINSON[i + 1][1] - ROBINSON[i][1]) * t;
    var x = lon * Math.PI / 180 * px;
    var y = 1.3523 * py * (lat >= 0 ? 1 : -1);
    var scale = W / (2 * (Math.PI * 0.8487));
    return [x * scale + W / 2, -y * scale + H / 2];
  }

  /* ── THE LIVE VISITOR MAP ────────────────────────────────────────────────
     Not a figure from either universe. This is the Institute watching its own
     readership, on an unlisted page, and it is built to look like nothing else
     on the site for exactly that reason: nobody should be able to mistake a
     screenshot of this for a published index.

     One dot per city with a reader in the last half hour. Size carries the
     count, on a square root so that ten readers is a disc a little over three
     times the area of one rather than ten times it. Color carries nothing: a
     ramp on a dark ground would have to run pale-is-more, which contradicts
     the rule the rest of the site is built on, so there is no ramp.

     A dot whose count rose since the last poll throws one ring. That is the
     only motion on the page, and it is what makes a live map feel live. */
  function livemap(node) {
    var LAND = null, ADMIN = [], prev = {}, timer = null, tries = 0;
    var q = new URLSearchParams(location.search);
    /* The feed comes from the map's own Worker, so the map works from any
       computer anywhere and depends on nothing anybody has to leave running. */
    var API = q.get('api') || LIVEAPI;
    var EVERY = Math.max(5, +(q.get('every') || 20)) * 1000;
    var SPAN = q.get('span') || 'live';
    var SPANS = [['live', 'Now'], ['day', 'Today'], ['week', 'This week'],
                 ['month', 'This month'], ['all', 'All time']];

    node.innerHTML =
      '<div class="lvwrap">' +
        '<div class="lvhead">' +
          '<div class="lvnow"><b data-c="active">&mdash;</b>' +
            '<span data-c="activelab">reading now</span></div>' +
          '<div class="lvbits">' +
            '<div><b data-c="places">&mdash;</b><span>places</span></div>' +
            '<div><b data-c="nations">&mdash;</b><span>countries</span></div>' +
          '</div>' +
          '<div class="vmspan">' + SPANS.map(function (x) {
            return '<button type="button" data-s="' + x[0] + '"' +
              (x[0] === SPAN ? ' class="on"' : '') + '>' + x[1] + '</button>';
          }).join('') + '</div>' +
          '<div class="lvstate" data-c="state">connecting</div>' +
        '</div>' +
        '<div class="lvmap" data-c="map"></div>' +
        '<div class="lvfoot">' +
          '<div class="lvcol"><h4>Cities</h4><ol data-c="cities"></ol></div>' +
          '<div class="lvcol"><h4>Countries</h4><ol data-c="nationlist"></ol></div>' +
        '</div>' +
      '</div>';

    function el(k) { return node.querySelector('[data-c="' + k + '"]'); }

    /* ── the view, and moving it ──────────────────────────────────────────
       A world map that cannot be zoomed is a poster. Most of the readers are
       in one country, so the country has to be reachable in one click and the
       world has to be reachable back. Wheel, drag, buttons, and two presets. */
    var VIEW = null, FULL = null, dragging = null, moved = 0, LAST = {};

    /* Frames in the map's own projected coordinates, computed once by
       worldgeo.py. The United States frame is the lower forty-eight with
       enough margin to hold Alaska's dot at the top left. */
    var PRESETS = {
      world: null,
      /* Computed from the projection rather than guessed: the frame that holds
         the lower forty-eight with a small margin, and a wider one that also
         holds Alaska and Hawaii, since a reader in Anchorage is still a
         reader. Europe is here because it is where the non-American readers
         mostly are. */
      us: [156, 92, 168, 92],
      us_all: [60, 50, 268, 152],
      europe: [452, 40, 130, 96]
    };

    function applyView() {
      var svg = node.querySelector('.lvsvg');
      if (!svg) { return; }
      svg.setAttribute('viewBox', VIEW.map(function (n) {
        return n.toFixed(1); }).join(' '));
      rescale();
    }
    /* A dot is a mark on the screen, not an area on the ground. Zooming in
       must not inflate it, or one reader in Chicago becomes a blot over five
       states. The radius is divided by the zoom so it holds its size. */
    function rescale() {
      if (!FULL) { return; }
      var k = VIEW[2] / FULL[2];
      detail(k);
      node.querySelectorAll('.vmdot').forEach(function (c) {
        var r = +c.getAttribute('data-r') || 3;
        c.setAttribute('r', (r * k).toFixed(2));
      });
      var land = node.querySelector('.lvland');
      if (land) { land.style.strokeWidth = (0.6 * k).toFixed(3); }
    }

    /* What is drawn depends on how close the reader is. At world scale, state
       borders are noise and city names are unreadable overlap. Zoomed in they
       are the whole point: a dot in Ohio means nothing until Ohio has an
       outline and a name. */
    function detail(k) {
      var admin = node.querySelector('.lvadmin');
      var names = node.querySelector('.lvnames');
      var labels = node.querySelector('.lvlabels');
      if (!admin) { return; }
      var showBorders = k < 0.55;
      var showStates = k < 0.30;
      var showCities = k < 0.42;
      admin.style.display = showBorders ? '' : 'none';
      admin.style.strokeWidth = (0.5 * k).toFixed(3);

      if (names) {
        if (!showStates) { names.innerHTML = ''; }
        else {
          /* Only the ones inside the frame, so a hundred labels are never
             written to draw the eight a reader can see. */
          names.innerHTML = ADMIN.filter(function (r) {
            return r.c[0] > VIEW[0] && r.c[0] < VIEW[0] + VIEW[2] &&
                   r.c[1] > VIEW[1] && r.c[1] < VIEW[1] + VIEW[3];
          }).map(function (r) {
            return '<text x="' + r.c[0] + '" y="' + r.c[1] + '" ' +
              'style="font-size:' + (7 * k).toFixed(2) + 'px">' +
              esc(r.n) + '</text>';
          }).join('');
        }
      }
      if (labels) {
        if (!showCities) { labels.innerHTML = ''; }
        else {
          labels.innerHTML = (LAST.points || []).filter(function (q) {
            return q.x > VIEW[0] && q.x < VIEW[0] + VIEW[2] &&
                   q.y > VIEW[1] && q.y < VIEW[1] + VIEW[3];
          }).map(function (q) {
            var r = radius(q.n) * k;
            return '<text class="lvcity" x="' + (q.x + r + 2 * k).toFixed(1) +
              '" y="' + (q.y + 2.2 * k).toFixed(1) + '" ' +
              'style="font-size:' + (7.5 * k).toFixed(2) + 'px">' +
              esc(q.c) + ' &middot; ' + q.n + '</text>';
          }).join('');
        }
      }
    }
    function zoomAt(factor, cx, cy) {
      var w = VIEW[2] * factor, h = VIEW[3] * factor;
      /* Bounds: never smaller than a city block, never larger than the world
         plus a margin, so a reader cannot lose the map off the edge. */
      if (w > FULL[2] * 1.6 || w < FULL[2] * 0.02) { return; }
      VIEW = [cx - (cx - VIEW[0]) * factor, cy - (cy - VIEW[1]) * factor, w, h];
      applyView();
    }
    function goTo(name) {
      var v = PRESETS[name];
      VIEW = v ? v.slice() : FULL.slice();
      applyView();
      node.querySelectorAll('.lvzoom [data-v]').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-v') === name);
      });
    }

    function drawLand() {
      FULL = (LAND.view || [0, 0, LAND.w, LAND.h]).slice();
      PRESETS.world = FULL.slice();
      VIEW = FULL.slice();
      el('map').innerHTML =
        '<svg class="lvsvg" viewBox="' + VIEW.join(' ') + '" ' +
        'preserveAspectRatio="xMidYMid meet" role="img" ' +
        'aria-label="A world map with a dot on every city with a reader">' +
        '<g class="lvland">' + LAND.paths.map(function (d) {
          return '<path d="' + d + '"/>';
        }).join('') + '</g>' +
        '<g class="lvadmin">' + ADMIN.map(function (r) {
          return '<path d="' + r.d + '"><title>' + esc(r.n) + '</title></path>';
        }).join('') + '</g>' +
        '<g class="lvnames"></g>' +
        '<g class="lvrings"></g><g class="vmdots"></g>' +
        '<g class="lvlabels"></g></svg>' +
        '<div class="lvzoom">' +
        '<button type="button" data-v="world" class="on">World</button>' +
        '<button type="button" data-v="us">Lower 48</button>' +
        '<button type="button" data-v="us_all">All 50</button>' +
        '<button type="button" data-v="europe">Europe</button>' +
        '<button type="button" data-z="in" aria-label="Zoom in">+</button>' +
        '<button type="button" data-z="out" aria-label="Zoom out">&minus;</button>' +
        '</div><div class="lvhint">Scroll to zoom &middot; drag to pan &middot; ' +
        'double-click for the world</div>';
      wireView();
    }

    function wireView() {
      var svg = node.querySelector('.lvsvg');
      if (!svg) { return; }
      /* The pointer's position in the map's own coordinates, so the point
         under the cursor stays under the cursor as the frame shrinks. */
      function at(e) {
        var r = svg.getBoundingClientRect();
        return [VIEW[0] + (e.clientX - r.left) / r.width * VIEW[2],
                VIEW[1] + (e.clientY - r.top) / r.height * VIEW[3]];
      }
      svg.addEventListener('wheel', function (e) {
        e.preventDefault();
        var p = at(e);
        zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p[0], p[1]);
      }, { passive: false });
      svg.addEventListener('pointerdown', function (e) {
        dragging = { x: e.clientX, y: e.clientY, vx: VIEW[0], vy: VIEW[1] };
        moved = 0;
        try { svg.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
      });
      svg.addEventListener('pointermove', function (e) {
        if (!dragging) { return; }
        var r = svg.getBoundingClientRect();
        var dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        VIEW[0] = dragging.vx - dx / r.width * VIEW[2];
        VIEW[1] = dragging.vy - dy / r.height * VIEW[3];
        applyView();
      });
      function stop(e) {
        if (!dragging) { return; }
        dragging = null;
        try { svg.releasePointerCapture(e.pointerId); } catch (x) { /* gone */ }
      }
      svg.addEventListener('pointerup', stop);
      svg.addEventListener('pointercancel', stop);
      svg.addEventListener('dblclick', function () { goTo('world'); });

      node.querySelectorAll('.vmspan button').forEach(function (b) {
        b.addEventListener('click', function () {
          SPAN = b.getAttribute('data-s');
          node.querySelectorAll('.vmspan button').forEach(function (o) {
            o.classList.toggle('on', o === b);
          });
          prev = {};                       /* no rings when changing the span */
          if (timer) { clearInterval(timer); timer = null; }
          tick();
          if (SPAN === 'live') { timer = setInterval(tick, EVERY); }
        });
      });
      node.querySelectorAll('.lvzoom button').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-v');
          if (v) { goTo(v); return; }
          var f = b.getAttribute('data-z') === 'in' ? 1 / 1.5 : 1.5;
          zoomAt(f, VIEW[0] + VIEW[2] / 2, VIEW[1] + VIEW[3] / 2);
        });
      });
    }

    /* Ten readers should not be ten times the ink of one. Area rises with the
       count, so the radius rises with its square root, and a floor keeps a
       single reader visible on a phone. */
    function radius(n) { return 2.2 + Math.sqrt(Math.max(1, n)) * 2.1; }

    function paint(D) {
      LAST = D;
      var dots = node.querySelector('.vmdots'), rings = node.querySelector('.lvrings');
      if (!dots) { return; }
      var seen = {};
      project(D);
      (D.points || []).forEach(function (p) {
        var id = p.cc + '|' + p.c;
        seen[id] = true;
        var c = dots.querySelector('[data-id="' + cssq(id) + '"]');
        if (!c) {
          c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('data-id', id);
          c.setAttribute('class', 'vmdot');
          c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
          c.setAttribute('r', 0);
          dots.appendChild(c);
        }
        c.setAttribute('data-r', radius(p.n).toFixed(2));
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        t.textContent = p.c + ' · ' + p.n + (p.n === 1 ? ' reader' : ' readers');
        c.innerHTML = '';
        c.appendChild(t);
        if ((prev[id] || 0) < p.n) { ring(rings, p); }
      });
      Array.prototype.slice.call(dots.children).forEach(function (c) {
        if (!seen[c.getAttribute('data-id')]) { c.remove(); }
      });
      rescale();
      prev = {};
      (D.points || []).forEach(function (p) { prev[p.cc + '|' + p.c] = p.n; });
    }

    /* Latitude and longitude to the map's own frame. Done once per payload
       rather than once per draw, and only for points that carry coordinates:
       a reader Cloudflare could not place is counted and not drawn. */
    function project(D) {
      if (!LAND) { return; }
      (D.points || []).forEach(function (p) {
        if (p.x !== undefined) { return; }
        if (typeof p.lat !== 'number' || typeof p.lon !== 'number') { return; }
        var xy = robinson(p.lon, p.lat, LAND.w, LAND.h);
        p.x = xy[0]; p.y = xy[1];
      });
      D.points = (D.points || []).filter(function (p) {
        return p.x !== undefined && p.y !== undefined;
      });
    }

    /* One ring, removed when it finishes, so a page left open all afternoon
       does not accumulate ten thousand dead nodes. */
    function ring(host, p) {
      var r = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      r.setAttribute('class', 'lvring');
      r.setAttribute('cx', p.x); r.setAttribute('cy', p.y);
      r.setAttribute('r', (radius(p.n) * (FULL ? VIEW[2] / FULL[2] : 1)).toFixed(2));
      host.appendChild(r);
      setTimeout(function () { r.remove(); }, 2000);
    }

    function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }

    function list(host, rows, name, count) {
      host.innerHTML = rows.length ? rows.map(function (r) {
        return '<li><span>' + esc(name(r)) + '</span><b>' + count(r) + '</b></li>';
      }).join('') : '<li class="lvnone"><span>nobody yet</span></li>';
    }

    function show(D) {
      el('active').textContent = num(D.active || 0);
      var lab = el('activelab');
      if (lab) {
        lab.textContent = SPAN === 'live' ? 'reading now' : 'visits';
      }
      el('places').textContent = num((D.points || []).length);
      el('nations').textContent = num((D.countries || []).length);
      list(el('cities'), (D.points || []).slice(0, 10),
        function (p) { return p.c + ', ' + p.cc; }, function (p) { return p.n; });
      list(el('nationlist'), (D.countries || []).slice(0, 10),
        function (c) { return c.name; }, function (c) { return c.n; });
      var s = el('state');
      if (SPAN !== 'live') {
        var label = { day: 'the last twenty-four hours',
          week: 'the last seven days', month: 'the last thirty days',
          all: 'the whole record' }[SPAN] || SPAN;
        s.textContent = label + (D.unplaced ? ' · ' + D.unplaced + ' unplaced' : '');
        s.className = 'lvstate past';
        paint(D);
        return;
      }
      if (!D.as_of) {
        s.textContent = 'the feed has not been written yet';
        s.className = 'lvstate warn';
      } else {
        var age = (Date.now() - Date.parse(D.as_of)) / 1000;
        /* Three minutes without a fresh write means the poller stopped. Saying
           so is the whole point: a live map that quietly shows a stale half
           hour is worse than one that admits it is not live. */
        if (age > 180) {
          s.textContent = 'stale: last written ' + Math.round(age / 60) +
            ' minutes ago';
          s.className = 'lvstate warn';
        } else {
          s.textContent = 'live · last thirty minutes' +
            (D.unplaced ? ' · ' + D.unplaced + ' unplaced' : '');
          s.className = 'lvstate';
        }
      }
      paint(D);
    }

    function tick() {
      if (!API) {
        var s0 = el('state');
        if (s0) {
          s0.textContent = 'the map service is not deployed yet';
          s0.className = 'lvstate warn';
        }
        return;
      }
      /* The Worker caches its own answers at the edge for ten seconds, so a
         thousand people watching this map cost it what one person costs. The
         cache is not defeated here on purpose. */
      var u = API + (SPAN === 'live' ? '/feed' : '/history?span=' + SPAN);
      // Same reader as the readership layer: a 404 or an {"error":...} body is
      // a failure and is reported as one, never drawn as an empty map.
      liveFetch(u)
        .then(function (D) { tries = 0; show(D); })
        .catch(function (e) {
          tries++;
          var s = el('state');
          if (s) {
            s.textContent = (e && e.message) || 'the feed could not be read';
            s.className = 'lvstate warn';
          }
          /* Backing off rather than hammering a feed that is not there. */
          if (tries > 5 && timer) {
            clearInterval(timer);
            timer = setInterval(tick, EVERY * 6);
          }
        });
    }

    function grab(n) {
      return get('live/' + n).catch(function () { return get(n); });
    }
    Promise.all([grab('world_land.json'),
      grab('world_admin1.json').catch(function () { return { rows: [] }; })
    ]).then(function (x) {
      LAND = x[0];
      ADMIN = (x[1] || {}).rows || [];
      drawLand();
      tick();
      timer = setInterval(tick, EVERY);
      /* A backgrounded tab should not poll. */
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (timer) { clearInterval(timer); timer = null; }
        } else if (!timer) {
          tick();
          timer = setInterval(tick, EVERY);
        }
      });
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the visitor beacon ───────────────────────────────────────────────────
     One request per page view to the map's own Worker, which records a city
     and an hour and nothing else. It is not analytics: it sets nothing, reads
     nothing back, and carries no payload, no identifier, and no page address.

     It is not sent at all when the browser sends Global Privacy Control, and
     the Worker refuses it a second time on its own side. A rule enforced in
     one place is a rule that gets bypassed by accident. */
  var LIVEAPI = document.documentElement.getAttribute('data-liveapi') || '';

  /* A MISSING ENDPOINT MUST NOT LOOK LIKE AN EMPTY ONE.
     The readership layer asked the counting service for /traffic, the deployed
     service did not have that route, and it answered 404 with the JSON body
     {"error":"no such route"}. fetch() does not reject on 404, and .json()
     parsed that body happily, so the error travelled all the way into the
     renderer as a payload with no rows — and the page reported "0 readers,
     all time" on a site that had recorded 289. The catch block never ran.
     Nothing was broken on screen; the number was simply wrong, and wrong in the
     one direction a reader would believe.
     Every call to the counting service goes through here now: a non-2xx
     response and a body carrying an `error` key are both failures, and both
     say so instead of rendering as zero. */
  function liveFetch(url) {
    return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
      if (!r.ok) {
        throw new Error('the counting service answered ' + r.status +
                        ' for ' + url.replace(/^https?:\/\/[^/]+/, ''));
      }
      return r.json();
    }).then(function (j) {
      if (j && j.error) { throw new Error('the counting service said: ' + j.error); }
      return j;
    });
  }


  function beacon() {
    if (!LIVEAPI) { return; }
    if (gpcOn()) { return; }
    try {
      fetch(LIVEAPI + '/hit', {
        method: 'GET', mode: 'cors', credentials: 'omit',
        cache: 'no-store', keepalive: true
      }).catch(function () { /* the map is never worth an error in the console */ });
    } catch (e) { /* nothing to do */ }
  }

  /* ── THE TILE CARTOGRAM ───────────────────────────────────────────────────
     Every state the same size, laid out in the rough shape of the country.
     A geographic choropleth gives Wyoming eighty times the ink of Rhode Island
     for one reading apiece, so the eye reads land area and calls it a finding.
     A tile grid gives every state one square and removes the bias entirely.

     This existed in the report pipeline from May and was never on the site,
     which is the whole reason it could not be found.

     The tiles carry a standing, not a level. The May figure printed index
     levels in the squares and D-035r forbids publishing those, so the number
     in each tile is the state's place among the fifty. */
  var TILEGRID = {
    AK: [0, 0], ME: [0, 11],
    VT: [1, 10], NH: [1, 11],
    WA: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], WI: [2, 5], MI: [2, 7],
    NY: [2, 9], MA: [2, 10], RI: [2, 11],
    OR: [3, 1], ID: [3, 2], SD: [3, 3], IA: [3, 4], IL: [3, 5], IN: [3, 6],
    OH: [3, 7], PA: [3, 8], NJ: [3, 9], CT: [3, 10],
    CA: [4, 1], NV: [4, 2], WY: [4, 3], NE: [4, 4], MO: [4, 5], KY: [4, 6],
    WV: [4, 7], VA: [4, 8], MD: [4, 9], DE: [4, 10],
    AZ: [5, 2], UT: [5, 3], CO: [5, 4], KS: [5, 5], AR: [5, 6], TN: [5, 7],
    NC: [5, 8], SC: [5, 9],
    NM: [6, 3], OK: [6, 5], LA: [6, 6], MS: [6, 7], AL: [6, 8], GA: [6, 9],
    HI: [7, 1], TX: [7, 4], FL: [7, 10]
  };

  /* The tile plate itself, with no controls around it. The widget below and
     the State Scorecard both draw with this, so a state is the same square in
     both places. `names` is the series' own state list, `ranks` its standings
     for one month, and `hi` the one state to ring. */
  function tileplate(names, ranks, of, abbr2, hi) {
    var size = 34, gap = 4, rows = 8, cols = 12;
    var W = cols * (size + gap) + gap, H = rows * (size + gap) + gap;
    var cells = Object.keys(TILEGRID).map(function (ab) {
      var g = TILEGRID[ab];
      var x = gap + g[1] * (size + gap), y = gap + g[0] * (size + gap);
      var name = abbr2[ab];
      var j = name ? names.indexOf(name) : -1;
      var r = j < 0 ? null : ranks[j];
      /* Darker is a stronger standing, the same direction as every other
         figure on this site. */
      var i = r ? Math.min(RAMP.length - 1, Math.floor((r - 1) / of * RAMP.length)) : null;
      var fill = i === null ? '#ececec' : RAMP[i];
      var ink = (i !== null && i < 4) ? '#fff' : '#1a1a1a';
      var me = name && hi && name === hi;
      return '<g class="tilecell' + (me ? ' tileme' : '') + '" data-live' +
        (name ? ' data-s="' + esc(name) + '"' : '') +
        (r ? ' data-r="' + r + '" data-of="' + of + '"' : '') + '>' +
        '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size +
        '" rx="3" fill="' + fill + '" stroke="' + (me ? '#1a1a1a' : '#fff') +
        '" stroke-width="' + (me ? 2.5 : 2) + '">' +
        '<title>' + esc(name || ab) + (r ? ': ' + ordinal(r) + ' of ' + of
          : ': not measured') + '</title></rect>' +
        '<text x="' + (x + size / 2) + '" y="' + (y + size / 2 - 1) +
        '" text-anchor="middle" style="fill:' + ink + '" class="tileab">' + ab + '</text>' +
        '<text x="' + (x + size / 2) + '" y="' + (y + size / 2 + 11) +
        '" text-anchor="middle" style="fill:' + ink + '" class="tileval">' +
        (r ? r : '\u2014') + '</text>' +
        /* The ring is drawn outside the tile, in the white gutter, so it reads
           against a dark fill as clearly as against a pale one. */
        (me ? '<rect x="' + (x - 2.5) + '" y="' + (y - 2.5) + '" width="' + (size + 5) +
          '" height="' + (size + 5) + '" rx="5" fill="none" stroke="#1a1a1a" ' +
          'stroke-width="2"></rect>' : '') + '</g>';
    });
    /* SVG paints in document order, so the ringed tile goes last or its
       neighbours clip the ring. */
    cells = cells.filter(function (c) { return c.indexOf('tileme') < 0; })
      .concat(cells.filter(function (c) { return c.indexOf('tileme') >= 0; })).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tilesvg" role="img" ' +
      'aria-label="Every state as an equal tile, shaded by standing">' + cells + '</svg>';
  }

  function tilemap(node) {
    var M, S = {}, k = node.getAttribute('data-index') || 'master';
    var w = null, playing = null, ABBR2 = {};
    /* A page about one state passes its name, and that state is ringed rather
       than recolored, so the ramp still reads as the ramp. */
    var HI = node.getAttribute('data-highlight') || '';

    node.innerHTML =
      '<div class="tilewrap">' +
        '<div class="tilehead">' +
          '<div><h4 data-c="title">Every state, equal weight</h4>' +
          '<p data-c="sub">The same series as a tile cartogram, so Rhode Island ' +
          'reads as clearly as Texas.</p></div>' +
          '<label class="tilepick">Index <select data-f="k"></select></label>' +
        '</div>' +
        '<div class="multkey" data-c="key"></div>' +
        '<div class="tilebar">' +
          '<button class="wplay" data-a="play" type="button" aria-label="Play">&#9654;</button>' +
          '<input type="range" data-f="w" min="0" max="0" value="0">' +
          '<b data-c="when"></b>' +
        '</div>' +
        '<div data-c="grid"></div>' +
        '<p class="srctag" data-c="note"></p>' +
      '</div>';

    function el(x) { return node.querySelector('[data-c="' + x + '"]'); }
    function sel(f) { return node.querySelector('[data-f="' + f + '"]'); }

    function draw() {
      var s = S[k];
      if (!s || !w) { return; }
      var ranks = s.rank[w] || [];
      var of = ranks.filter(function (x) { return x; }).length || 50;
      el('grid').innerHTML = tileplate(s.states, ranks, of, ABBR2, HI);
      liveMarks(el('grid'), 'g.tilecell[data-s]', function (g) {
        var nm = g.getAttribute('data-s'), rk = g.getAttribute('data-r');
        return {
          html: '<b>' + esc(nm) + '</b><br>' + (rk
            ? ordinal(+rk) + ' of ' + g.getAttribute('data-of')
            : 'not measured in this month'),
          href: BASE + 'states/' + slug(nm) + '.html'
        };
      });
      el('when').textContent = wname(w);
      el('key').innerHTML = '<span>first</span>' +
        RAMP.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
        '<span>fiftieth</span>';
      if (HI) {
        var jm = s.states.indexOf(HI), rm = jm < 0 ? null : ranks[jm];
        el('sub').textContent = HI + ' is outlined' +
          (rm ? ', and stands ' + ordinal(rm) + ' of ' + of + ' this month' : '') +
          '. Every tile is the same size, so no state reads louder for its land area.';
      }
      var nm = (M.indices.filter(function (x) { return x.key === k; })[0] || {}).title || '';
      el('note').textContent = esc(nm) + ', ' + wname(w) + '. Each tile is one state ' +
        'and every tile is the same size, so no state reads louder than another ' +
        'because of its land area. The number is that state\u2019s place among the ' +
        of + ' states measured in this month. A standing is a position rather ' +
        'than a count, and a movement in it is never growth or decline in any quantity.';
    }

    function setW(i) {
      var s = S[k];
      w = s.windows[Math.max(0, Math.min(s.windows.length - 1, i))];
      sel('w').value = i;
      draw();
    }

    function load(kk) {
      if (S[kk]) { return Promise.resolve(); }
      return get('data/series/' + kk + '.json').then(function (d) { S[kk] = d; });
    }

    get('data/manifest.json').then(function (m) {
      M = m;
      /* The grid is keyed by postal abbreviation and the series are keyed by
         the state's full name, so the manifest supplies the bridge. */
      (M.states || []).forEach(function (x) { ABBR2[x.abbr] = x.s; });
      sel('k').innerHTML = M.indices.map(function (x) {
        return '<option value="' + x.key + '"' + (x.key === k ? ' selected' : '') +
          '>' + esc(x.name) + '</option>'; }).join('');
      return load(k);
    }).then(function () {
      var s = S[k];
      sel('w').max = s.windows.length - 1;
      setW(s.windows.length - 1);
      sel('w').addEventListener('input', function () { setW(+this.value); });
      sel('k').addEventListener('change', function () {
        k = this.value;
        load(k).then(function () {
          var ss = S[k];
          sel('w').max = ss.windows.length - 1;
          setW(Math.min(+sel('w').value, ss.windows.length - 1));
        });
      });
      node.querySelector('[data-a="play"]').addEventListener('click', function () {
        var btn = this;
        if (playing) {
          clearInterval(playing); playing = null;
          btn.innerHTML = '&#9654;'; return;
        }
        btn.innerHTML = '&#9646;&#9646;';
        playing = setInterval(function () {
          var i = +sel('w').value + 1;
          if (i > +sel('w').max) { i = 0; }
          setW(i);
        }, 90);
      });
    }).catch(function (e) { fail(node, e); });
  }


  /* ── fifty states, fifty records ──────────────────────────────────────────
     The tile cartogram above this on the page answers who is where in one
     month. This answers whether it has always been so, in the same layout, so
     a reader arrives already knowing where to look.

     A bump chart carries eight states before it tangles. A cartogram carries
     fifty states but one month. This carries fifty states and every month, by
     giving each state its own panel and putting that panel where the state is.

     The discipline of the form is one shared vertical scale. The moment panels
     are scaled to their own range the grid becomes decorative, because a line's
     height stops meaning the same thing from one panel to the next. */
  function sparkgrid(node) {
    var M, S = {}, k = node.getAttribute('data-index') || 'master';
    var ABBR2 = {};

    node.innerHTML =
      '<div class="tilewrap">' +
        '<div class="tilehead">' +
          '<div><h4>Fifty states, fifty records</h4>' +
          '<p data-c="sub">Every month from January 2004. Each panel is one ' +
          'state, placed where the state is. First is the top of the panel and ' +
          'fiftieth the bottom. The shaded band at the top of every panel is ' +
          'the top ten.</p></div>' +
          '<label class="tilepick">Index <select data-f="k"></select></label>' +
        '</div>' +
        '<div class="multkey" data-c="key"></div>' +
        '<div data-c="grid"></div>' +
        '<p class="srctag" data-c="note"></p>' +
      '</div>';

    function el(x) { return node.querySelector('[data-c="' + x + '"]'); }

    function draw() {
      var s = S[k];
      if (!s) { return; }
      var wins = s.windows, n = wins.length, last = wins[n - 1];
      var lastr = s.rank[last] || [];
      var of = lastr.filter(function (x) { return x; }).length || 50;
      var CW = 90, CH = 62, G = 4;
      var W = 12 * (CW + G) + G, H = 8 * (CH + G) + G;
      var cells = Object.keys(TILEGRID).map(function (ab) {
        var g = TILEGRID[ab];
        var x = G + g[1] * (CW + G), y = G + g[0] * (CH + G);
        var name = ABBR2[ab];
        var j = name ? s.states.indexOf(name) : -1;
        var cur = j < 0 ? null : lastr[j];
        var ci = cur ? Math.min(RAMP.length - 1,
          Math.floor((cur - 1) / of * RAMP.length)) : null;
        var col = ci === null ? '#bdbdbd' : RAMP[ci];
        var px = x + 4, py = y + 20, pw = CW - 8, ph = CH - 26;
        var Y = function (r) { return py + (r - 1) / 49 * ph; };
        var d = '', open = false, seen = 0;
        if (j >= 0) {
          for (var i = 0; i < n; i++) {
            var r = (s.rank[wins[i]] || [])[j];
            if (!r) { open = false; continue; }
            var xx = px + i / Math.max(1, n - 1) * pw;
            d += (open ? 'L' : 'M') + xx.toFixed(1) + ',' + Y(r).toFixed(1);
            open = true; seen++;
          }
        }
        /* The top-ten band is what turns a squiggle into a reading. */
        return '<g class="sgcell" data-live' +
          (name ? ' data-s="' + esc(name) + '"' : '') +
          (cur ? ' data-r="' + cur + '" data-of="' + of + '" data-n="' + seen + '"' : '') +
          '>' +
          '<rect x="' + x + '" y="' + y + '" width="' + CW + '" height="' + CH +
          '" fill="#fff" stroke="#ececec"><title>' + esc(name || ab) +
          (cur ? ': ' + ordinal(cur) + ' of ' + of + ', ' + seen +
            ' months measured' : ': not measured') + '</title></rect>' +
          '<rect x="' + px + '" y="' + Y(1).toFixed(1) + '" width="' + pw +
          '" height="' + (Y(10) - Y(1)).toFixed(1) + '" fill="#e7dccb"/>' +
          '<path d="' + d + '" fill="none" stroke="#2f3d4d" stroke-width="1" ' +
          'stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>' +
          (cur ? '<circle cx="' + (px + pw).toFixed(1) + '" cy="' +
            Y(cur).toFixed(1) + '" r="2.3" fill="' + col + '"/>' : '') +
          '<text x="' + (x + 5) + '" y="' + (y + 14) + '" class="tileab">' + ab +
          '</text>' +
          '<text x="' + (x + CW - 5) + '" y="' + (y + 14) +
          '" text-anchor="end" class="sgnum" style="fill:' + col + '">' +
          (cur ? cur : '\u2014') + '</text></g>';
      }).join('');
      el('grid').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" ' +
        'class="sgsvg" role="img" aria-label="Fifty states, each drawn as its ' +
        'own record of standing since 2004">' + cells + '</svg>';
      liveMarks(el('grid'), 'g.sgcell[data-s]', function (g) {
        var nm = g.getAttribute('data-s'), rk = g.getAttribute('data-r');
        return {
          html: '<b>' + esc(nm) + '</b><br>' + (rk
            ? ordinal(+rk) + ' of ' + g.getAttribute('data-of') +
              '<br><span class="ts">' + g.getAttribute('data-n') +
              ' months measured</span>'
            : 'not measured'),
          href: BASE + 'states/' + slug(nm) + '.html'
        };
      });
      el('key').innerHTML = '<span>first</span>' +
        RAMP.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
        '<span>fiftieth</span>';
      var nm = (M.indices.filter(function (x) { return x.key === k; })[0] || {}).title || '';
      el('note').textContent = esc(nm) + ', ' + wname(wins[0]) + ' to ' +
        wname(last) + '. Every panel is drawn on the same vertical scale, so a ' +
        'line\u2019s height means the same thing in every one of the fifty. A ' +
        'break in a line is a month the index does not measure that state. A ' +
        'standing is a place among the states measured in the same month and is ' +
        'never a count; a movement in one is never growth or decline in any ' +
        'quantity.';
    }

    function load(kk) {
      if (S[kk]) { return Promise.resolve(); }
      return get('data/series/' + kk + '.json').then(function (d) { S[kk] = d; });
    }

    get('data/manifest.json').then(function (m) {
      M = m;
      (M.states || []).forEach(function (x) { ABBR2[x.abbr] = x.s; });
      node.querySelector('[data-f="k"]').innerHTML = M.indices.map(function (x) {
        return '<option value="' + x.key + '"' + (x.key === k ? ' selected' : '') +
          '>' + esc(x.name) + '</option>'; }).join('');
      return load(k);
    }).then(function () {
      draw();
      node.querySelector('[data-f="k"]').addEventListener('change', function () {
        k = this.value;
        load(k).then(draw);
      });
    }).catch(function (e) { fail(node, e); });
  }


  /* ── the census by level, mirrored ────────────────────────────────────────
     A shaded map answers where. It cannot answer how far apart, because it has
     no axis. Every jurisdiction is a column here, ordered by its total, with
     the levels that serve the younger years above the axis and secondary
     below. Counts only: nothing on this figure may be divided by anything in
     the attention universe. */
  function levelmirror(node) {
    node.innerHTML = '<div class="tilewrap"><div class="tilehead"><div>' +
      '<h4>Christian schooling, by level</h4>' +
      '<p>Enrollments per 1,000 children aged five to seventeen. Elementary ' +
      'and combined schools above the axis, secondary below.</p></div></div>' +
      '<div data-c="fig"></div><p class="srctag" data-c="note"></p></div>';
    /* The census edition is named on the atlas payload, which is the one
       place this site records it, so the figure reads it from there rather
       than carrying a second copy that can drift. */
    Promise.all([get('data/levels.json'), get('data/atlas.json')])
      .then(function (both) {
      var L = both[0], vint = both[1].vintage || '';
      var rows = L.states.slice().sort(function (a, b) {
        return (b.el + b.co + b.se) - (a.el + a.co + a.se);
      });
      var n = rows.length;
      var W = 980, H = 360, ml = 34, mr = 8, axis = 232, up = 176, down = 78;
      var bw = (W - ml - mr) / n;
      var hiU = Math.max.apply(null, rows.map(function (r) { return r.el + r.co; })) * 1.05;
      var hiD = Math.max.apply(null, rows.map(function (r) { return r.se; })) * 1.15;
      var o = ['<svg viewBox="0 0 ' + W + ' ' + H + '" class="lmsvg" role="img" ' +
        'aria-label="Every state as a column, mirrored by school level">'];
      [0, 25, 50, 75].forEach(function (v) {
        if (v > hiU) { return; }
        var y = axis - v / hiU * up;
        o.push('<line x1="' + ml + '" y1="' + y.toFixed(1) + '" x2="' + (W - mr) +
          '" y2="' + y.toFixed(1) + '" stroke="#ececec"/>' +
          '<text x="' + (ml - 6) + '" y="' + (y + 4).toFixed(1) +
          '" text-anchor="end" class="lmax">' + v + '</text>');
      });
      [10, 20].forEach(function (v) {
        if (v > hiD) { return; }
        var y = axis + v / hiD * down;
        o.push('<line x1="' + ml + '" y1="' + y.toFixed(1) + '" x2="' + (W - mr) +
          '" y2="' + y.toFixed(1) + '" stroke="#ececec"/>' +
          '<text x="' + (ml - 6) + '" y="' + (y + 4).toFixed(1) +
          '" text-anchor="end" class="lmax">' + v + '</text>');
      });
      rows.forEach(function (r, i) {
        var x = ml + i * bw, w = Math.max(1, bw * 0.78);
        var he = r.el / hiU * up, hc = r.co / hiU * up, hs = r.se / hiD * down;
        var tip = '<title>' + esc(r.s) + ': ' + (r.el + r.co + r.se).toFixed(0) +
          ' per 1,000 in all— ' + r.el.toFixed(1) + ' elementary, ' +
          r.co.toFixed(1) + ' combined, ' + r.se.toFixed(1) + ' secondary</title>';
        o.push('<g class="lmcol" data-live data-s="' + esc(r.s) +
          '" data-t="' + (r.el + r.co + r.se).toFixed(0) +
          '" data-el="' + r.el.toFixed(1) + '" data-co="' + r.co.toFixed(1) +
          '" data-se="' + r.se.toFixed(1) + '">' +
          '<rect x="' + x.toFixed(1) + '" y="' + (axis - he).toFixed(1) +
          '" width="' + w.toFixed(1) + '" height="' + he.toFixed(1) +
          '" fill="#1a3a5c">' + tip + '</rect>' +
          '<rect x="' + x.toFixed(1) + '" y="' + (axis - he - hc).toFixed(1) +
          '" width="' + w.toFixed(1) + '" height="' + hc.toFixed(1) +
          '" fill="#1D7E78">' + tip + '</rect>' +
          '<rect x="' + x.toFixed(1) + '" y="' + axis + '" width="' + w.toFixed(1) +
          '" height="' + hs.toFixed(1) + '" fill="#c7791f">' + tip + '</rect></g>');
      });
      o.push('<line x1="' + ml + '" y1="' + axis + '" x2="' + (W - mr) +
        '" y2="' + axis + '" stroke="#1a1a1a"/>');
      /* Named columns, drawn only where the label clears the one before it. */
      var placed = [];
      rows.forEach(function (r, i) {
        var x = ml + i * bw + bw * 0.39;
        if (placed.length && x - placed[placed.length - 1] < 74) { return; }
        if (i !== 0 && i !== n - 1 && i % 6) { return; }
        placed.push(x);
        o.push('<line x1="' + x.toFixed(1) + '" y1="' + (axis + down + 4) +
          '" x2="' + x.toFixed(1) + '" y2="' + (axis + down + 13) +
          '" stroke="#999" stroke-width=".7"/>' +
          '<text x="' + x.toFixed(1) + '" y="' + (axis + down + 26) +
          '" text-anchor="' + (i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle')) +
          '" class="lmlab">' + esc(r.s) + '</text>');
      });
      node.querySelector('[data-c="fig"]').innerHTML = o.join('') + '</svg>' +
        '<div class="lmkey">' +
        '<span><i style="background:#1D7E78"></i>Combined, one school serving every year</span>' +
        '<span><i style="background:#1a3a5c"></i>Elementary</span>' +
        '<span><i style="background:#c7791f"></i>Secondary, below the axis</span></div>';
      liveMarks(node.querySelector('[data-c="fig"]'), 'g.lmcol[data-s]',
        function (g) {
          var nm = g.getAttribute('data-s');
          return {
            html: '<b>' + esc(nm) + '</b><br>' + g.getAttribute('data-t') +
              ' per 1,000 in all<br><span class="ts">' +
              g.getAttribute('data-el') + ' elementary, ' +
              g.getAttribute('data-co') + ' combined, ' +
              g.getAttribute('data-se') + ' secondary</span>',
            href: BASE + 'states/' + slug(nm) + '.html'
          };
        });
      node.querySelector('[data-c="note"]').textContent =
        'Christian school enrollments per 1,000 children aged five to seventeen, ' +
        'federal private school census' + (vint ? ', ' + vint + ' edition' : '') +
        '. Each column is one jurisdiction, ordered by its total. These are ' +
        'counts from a census taken once and held until the next edition lands. ' +
        'They are never divided into an index reading.';
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the bump chart ───────────────────────────────────────────────────────
     Eight states is the ceiling of this form; a ninth begins to tangle. The
     five nearest the top, the two nearest the bottom, and the state a reader
     came in on if it is neither. */
  function bumpchart(node) {
    var M, S = {}, k = node.getAttribute('data-index') || 'master';
    node.innerHTML = '<div class="tilewrap"><div class="tilehead"><div>' +
      '<h4>Twenty-two years of standing</h4>' +
      '<p>The five states nearest the top today and the two nearest the ' +
      'bottom, at every year end. First is the top.</p></div>' +
      '<label class="tilepick">Index <select data-f="k"></select></label>' +
      '</div><div data-c="fig"></div>' +
      '<p class="srctag" data-c="note"></p></div>';

    function draw() {
      var s = S[k], wins = s.windows.filter(function (w) { return w.slice(5) === '12'; });
      var last = s.windows[s.windows.length - 1];
      if (wins.indexOf(last) < 0) { wins.push(last); }
      var lr = s.rank[last] || [];
      var ord = s.states.map(function (g, i) { return [lr[i], g]; })
        .filter(function (x) { return x[0]; })
        .sort(function (a, b) { return a[0] - b[0]; });
      var picks = ord.slice(0, 5).concat(ord.slice(-2)).map(function (x) { return x[1]; });
      var series = picks.map(function (g) {
        var j = s.states.indexOf(g), pts = [];
        wins.forEach(function (w) {
          var r = (s.rank[w] || [])[j];
          if (r) { pts.push([w, r]); }
        });
        return { name: g, points: pts };
      });
      node.querySelector('[data-c="fig"]').innerHTML = '';
      rankline(node.querySelector('[data-c="fig"]'), series, { height: 320 });
      var nm = (M.indices.filter(function (x) { return x.key === k; })[0] || {}).title || '';
      node.querySelector('[data-c="note"]').textContent = esc(nm) +
        ', at each year end from ' + wname(wins[0]) + ' to ' + wname(last) +
        '. A standing is a place among the states measured in the same month ' +
        'and is never a count; a movement in one is never growth or decline in ' +
        'any quantity. A line that breaks is a year the index does not measure ' +
        'that state.';
    }

    get('data/manifest.json').then(function (m) {
      M = m;
      node.querySelector('[data-f="k"]').innerHTML = M.indices.map(function (x) {
        return '<option value="' + x.key + '"' + (x.key === k ? ' selected' : '') +
          '>' + esc(x.name) + '</option>'; }).join('');
      return get('data/series/' + k + '.json');
    }).then(function (d) {
      S[k] = d; draw();
      node.querySelector('[data-f="k"]').addEventListener('change', function () {
        k = this.value;
        (S[k] ? Promise.resolve() : get('data/series/' + k + '.json')
          .then(function (x) { S[k] = x; })).then(draw);
      });
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the alluvial ─────────────────────────────────────────────────────────
     The other figures answer where a state is. This answers how much movement
     there is at all, which is the claim the methodology actually rests on. Two
     cursors per column, because a middle column is both an arrival and a
     departure and one cursor advanced for both overruns its band by double. */
  function alluvial(node) {
    node.innerHTML = '<div class="tilewrap"><div class="tilehead"><div>' +
      '<h4>How much do states actually move?</h4>' +
      '<p>Every state’s band at five dates, with a ribbon carrying it from ' +
      'one band to the next. A ribbon that runs straight is a state that ' +
      'stayed.</p></div></div><div data-c="fig"></div>' +
      '<p class="srctag" data-c="note"></p></div>';
    get('data/series/master.json').then(function (s) {
      var stops = s.windows.filter(function (w) {
        return w.slice(5) === '12' && +w.slice(0, 4) % 5 === 0; });
      if (stops.indexOf(s.windows[s.windows.length - 1]) < 0) {
        stops.push(s.windows[s.windows.length - 1]);
      }
      stops = stops.slice(-5);
      var BANDN = ['The top ten', 'The middle thirty', 'The bottom ten'];
      var BC = ['#2d1437', '#c9c4cc', '#c7791f'];
      var W = 980, H = 470, pl = 120, pr = 40, pt = 44, PH = 330, CW = 22;
      var colx = stops.map(function (_, i) {
        return pl + i * (W - pl - pr) / (stops.length - 1); });
      var bandOf = s.states.map(function (g, j) {
        return stops.map(function (w) {
          var ranks = s.rank[w] || [];
          var of = ranks.filter(function (x) { return x; }).length || 50;
          var r = ranks[j];
          if (!r) { return null; }
          return r <= 10 ? 0 : (r > of - 10 ? 2 : 1);
        });
      });
      var geo = stops.map(function (_, ci) {
        var cnt = [0, 0, 0], tot = 0;
        bandOf.forEach(function (seq) {
          if (seq[ci] !== null) { cnt[seq[ci]]++; tot++; }
        });
        tot = tot || 50;
        var ys = [], y = pt;
        for (var b = 0; b < 3; b++) {
          var h = cnt[b] / tot * PH;
          ys.push([y, h, cnt[b]]);
          y += h + 20;
        }
        return ys;
      });
      var outc = geo.map(function (c) { return c.map(function (g) { return g[0]; }); });
      var inc = geo.map(function (c) { return c.map(function (g) { return g[0]; }); });
      var o = ['<svg viewBox="0 0 ' + W + ' ' + H + '" class="alsvg" role="img" ' +
        'aria-label="Every state’s band at five dates, with ribbons between them">'];
      var moves = 0;
      s.states.forEach(function (g, j) {
        var seq = bandOf[j];
        for (var ci = 0; ci < stops.length - 1; ci++) {
          var a = seq[ci], b = seq[ci + 1];
          if (a === null || b === null) { continue; }
          var ha = geo[ci][a][1] / (geo[ci][a][2] || 1);
          var hb = geo[ci + 1][b][1] / (geo[ci + 1][b][2] || 1);
          var y0 = outc[ci][a], y1 = inc[ci + 1][b];
          outc[ci][a] += ha; inc[ci + 1][b] += hb;
          var x0 = colx[ci] + CW / 2, x1 = colx[ci + 1] - CW / 2, mx = (x0 + x1) / 2;
          var moved = a !== b;
          if (moved) { moves++; }
          o.push('<path d="M' + x0.toFixed(1) + ',' + y0.toFixed(1) +
            ' C' + mx.toFixed(1) + ',' + y0.toFixed(1) + ' ' + mx.toFixed(1) + ',' +
            y1.toFixed(1) + ' ' + x1.toFixed(1) + ',' + y1.toFixed(1) +
            ' L' + x1.toFixed(1) + ',' + (y1 + hb).toFixed(1) +
            ' C' + mx.toFixed(1) + ',' + (y1 + hb).toFixed(1) + ' ' + mx.toFixed(1) +
            ',' + (y0 + ha).toFixed(1) + ' ' + x0.toFixed(1) + ',' + (y0 + ha).toFixed(1) +
            ' Z" fill="' + (moved ? '#9B1B30' : BC[a]) + '" opacity="' +
            (moved ? '.62' : '.20') + '"><title>' + esc(g) + '</title></path>');
        }
      });
      stops.forEach(function (w, ci) {
        geo[ci].forEach(function (g, b) {
          o.push('<rect x="' + (colx[ci] - CW / 2).toFixed(1) + '" y="' + g[0].toFixed(1) +
            '" width="' + CW + '" height="' + g[1].toFixed(1) + '" fill="' + BC[b] + '"/>' +
            '<text x="' + colx[ci].toFixed(1) + '" y="' + (g[0] + g[1] / 2 + 4).toFixed(1) +
            '" text-anchor="middle" class="alnum" style="fill:' +
            (b === 1 ? '#1a1a1a' : '#fff') + '">' + g[2] + '</text>');
        });
        o.push('<text x="' + colx[ci].toFixed(1) + '" y="' + (pt - 12) +
          '" text-anchor="middle" class="allab">' + wname(w) + '</text>');
      });
      geo[0].forEach(function (g, b) {
        o.push('<text x="' + (colx[0] - CW / 2 - 8) + '" y="' +
          (g[0] + g[1] / 2 + 4).toFixed(1) + '" text-anchor="end" class="allab">' +
          BANDN[b] + '</text>');
      });
      node.querySelector('[data-c="fig"]').innerHTML = o.join('') + '</svg>' +
        '<div class="lmkey"><span><i style="background:#9B1B30;opacity:.62"></i>' +
        'a state that changed band</span><span><i style="background:#2d1437;opacity:.20"></i>' +
        'a state that stayed</span></div>';
      node.querySelector('[data-c="note"]').textContent =
        'Spring Vale Master Christian Education Index. Across the four intervals ' +
        'drawn there are ' + moves + ' band changes out of ' +
        (s.states.length * (stops.length - 1)) + ' possible. A band change is a ' +
        'change in position and is never growth or decline in any quantity.';
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the beeswarm ─────────────────────────────────────────────────────────
     The map on this page answers where the market areas are. It has no axis,
     so it cannot answer how far apart they are, and the spread inside a Region
     turns out to be wider than the spread between Regions. */
  function beeswarm(node) {
    node.innerHTML = '<div class="tilewrap"><div class="tilehead"><div>' +
      '<h4>Every market area, and how far apart they are</h4>' +
      '<p>One dot is one Christian Education Market Area. The vertical rule in ' +
      'each row is that Region’s median.</p></div></div>' +
      '<div data-c="fig"></div><p class="srctag" data-c="note"></p></div>';
    Promise.all([get('data/atlas.json'), get('data/manifest.json')])
      .then(function (x) {
        var A = x[0], M = x[1], regOf = {}, COL = {};
        var PAL = ['#2d1437', '#861931', '#1a3a5c', '#c7791f',
                   '#5c4a8a', '#7ba7c4', '#1D7E78', '#d96442'];
        (M.regions || []).forEach(function (r, i) {
          COL[r.name] = PAL[i % PAL.length];
          (r.members || []).forEach(function (g) { regOf[g] = r.name; });
        });
        var rows = {};
        A.markets.forEach(function (m) {
          if (m.spk === null || m.spk === undefined) { return; }
          var rg = regOf[m.state];
          if (!rg) { return; }
          (rows[rg] = rows[rg] || []).push(m);
        });
        var order = (M.regions || []).map(function (r) { return r.name; });
        var hi = 0;
        A.markets.forEach(function (m) { if (m.spk > hi) { hi = m.spk; } });
        hi *= 1.03;
        var W = 980, pl = 210, pr = 24, pt = 58, RH = 52;
        var H = pt + order.length * RH + 26;
        function X(v) { return pl + v / hi * (W - pl - pr); }
        var o = ['<svg viewBox="0 0 ' + W + ' ' + H + '" class="bwsvg" role="img" ' +
          'aria-label="All market areas as dots, grouped by Region">'];
        for (var v = 0; v <= hi; v += 25) {
          o.push('<line x1="' + X(v).toFixed(1) + '" y1="' + (pt - 14) + '" x2="' +
            X(v).toFixed(1) + '" y2="' + (pt + order.length * RH - 24) +
            '" stroke="#ececec"/>' +
            '<text x="' + X(v).toFixed(1) + '" y="' + (pt - 20) +
            '" text-anchor="middle" class="lmax">' + v + '</text>');
        }
        o.push('<text x="' + pl + '" y="' + (pt - 34) + '" class="bwaxt">' +
          'ENROLLMENTS PER 1,000 CHILDREN</text>');
        order.forEach(function (rg, i) {
          var ms = (rows[rg] || []).slice().sort(function (a, b) { return a.spk - b.spk; });
          var y = pt + i * RH;
          o.push('<text x="' + (pl - 12) + '" y="' + (y + 4) +
            '" text-anchor="end" class="bwreg">' + esc(rg) + '</text>' +
            '<text x="' + (pl - 12) + '" y="' + (y + 17) +
            '" text-anchor="end" class="bwsub">' + ms.length + ' market areas</text>');
          if (!ms.length) { return; }
          var med = ms[Math.floor(ms.length / 2)].spk;
          o.push('<line x1="' + X(med).toFixed(1) + '" y1="' + (y - 14) + '" x2="' +
            X(med).toFixed(1) + '" y2="' + (y + 14) +
            '" stroke="#1a1a1a" stroke-width="1.4"/>');
          var placed = [];
          ms.forEach(function (m) {
            var xx = X(m.spk), lane = 0, step = 0;
            while (placed.some(function (q) {
              return Math.abs(xx - q[0]) < 5 && q[1] === lane;
            })) {
              step++;
              lane = Math.ceil(step / 2) * (step % 2 ? 1 : -1);
              if (Math.abs(lane) > 2) { break; }
            }
            placed.push([xx, lane]);
            /* A 2.4-pixel dot is a hard thing to point at. The transparent
               stroke is painted, so SVG counts it for hit testing, and the
               target becomes about 8 pixels across while the dot stays the
               size the figure needs it to be. */
            o.push('<circle class="bwdot" cx="' + xx.toFixed(1) + '" cy="' +
              (y + lane * 5).toFixed(1) + '" r="2.4" fill="' + COL[rg] +
              '" opacity=".8" stroke="transparent" stroke-width="6"' +
              ' data-mid="' + esc(m.id) + '"><title>' + esc(m.name) +
              ': ' + m.spk.toFixed(1) + ' per 1,000</title></circle>');
          });
        });
        node.querySelector('[data-c="fig"]').innerHTML =
          '<div class="bwmap">' + o.join('') + '</svg><div class="maptip"></div></div>';

        /* Hover and click, the same as the county map on a state page. A dot
           is a market area and every market area has a page, so a figure that
           shows 262 of them and lets a reader open none is a dead end. */
        var host = node.querySelector('.bwmap');
        var tip = host.querySelector('.maptip');
        var byId = {};
        A.markets.forEach(function (m) { byId[m.id] = m; });
        var lit = null;

        function light(el) {
          if (lit === el) { return; }
          if (lit) { lit.setAttribute('r', '2.4'); lit.setAttribute('opacity', '.8'); }
          lit = el;
          if (lit) { lit.setAttribute('r', '4.2'); lit.setAttribute('opacity', '1'); }
        }

        host.addEventListener('mousemove', function (e) {
          var t = e.target.closest ? e.target.closest('circle.bwdot') : null;
          if (!t) { tip.style.display = 'none'; light(null); return; }
          light(t);
          var m = byId[t.getAttribute('data-mid')];
          if (!m) { tip.style.display = 'none'; return; }
          tip.innerHTML = '<b>' + esc(m.name) + '</b><br>' +
            m.spk.toFixed(1) + ' enrollments per 1,000' +
            (m.rank ? '<br><span class="ts">' + ordinal(m.rank) + ' of ' +
              A.markets.length + ' market areas</span>' : '');
          tip.style.display = 'block';
          var r = host.getBoundingClientRect();
          var xx = e.clientX - r.left + 14, yy = e.clientY - r.top + 14;
          if (xx + tip.offsetWidth > r.width) {
            xx = e.clientX - r.left - tip.offsetWidth - 8;
          }
          tip.style.left = Math.max(2, xx) + 'px';
          tip.style.top = yy + 'px';
        });
        host.addEventListener('mouseleave', function () {
          tip.style.display = 'none'; light(null);
        });
        host.addEventListener('click', function (e) {
          var t = e.target.closest ? e.target.closest('circle.bwdot') : null;
          if (t) { location.href = BASE + 'markets/' + t.getAttribute('data-mid') + '.html'; }
        });
        node.querySelector('[data-c="note"]').textContent =
          'Christian school enrollments per 1,000 children of school age, all ' +
          A.markets.length + ' Christian Education Market Areas, grouped into ' +
          'the eight Institute Regions. The width of a row is the disagreement ' +
          'inside a Region, and it is the reading a map cannot give. These are ' +
          'counts from the federal private school census and are never mixed ' +
          'into an index reading.';
      }).catch(function (e) { fail(node, e); });
  }


  /* ── twelve months, fifty states ──────────────────────────────────────────
     Fifty two-point slopes on ONE fixed scale, sorted by where each state
     stands now. The shared scale is the whole discipline of the form: the
     moment each panel is scaled to its own pair, a two-place move and a
     twenty-place move draw the same line and the wall becomes decoration.

     It turns "five states moved three places or more" from a sentence into
     something a reader scans in about four seconds, which is why it is the
     figure worth having every month. */
  function slopewall(node) {
    var M, S = {}, k = node.getAttribute('data-index') || 'master';
    var ABBR = {};

    node.innerHTML =
      '<div class="tilewrap">' +
        '<div class="tilehead">' +
          '<div><h4>Twelve months, fifty states</h4>' +
          '<p data-c="sub">Each panel is one state on a fixed scale running ' +
          'from first at the top to fiftieth at the bottom. A line rising to ' +
          'the right is a state that moved up.</p></div>' +
          '<label class="tilepick">Index <select data-f="k"></select></label>' +
        '</div>' +
        '<div class="swkey">' +
          '<span><i style="background:#1a3a5c"></i>rose</span>' +
          '<span><i style="background:#9B1B30"></i>fell</span>' +
          '<span><i style="background:#8a8a8a"></i>held</span>' +
        '</div>' +
        '<div data-c="grid"></div>' +
        '<p class="srctag" data-c="note"></p>' +
      '</div>';

    function el(x) { return node.querySelector('[data-c="' + x + '"]'); }

    function draw() {
      var s = S[k], wins = s.windows, now = wins[wins.length - 1];
      var yr = (+now.slice(0, 4) - 1) + '-' + now.slice(5, 7);
      if (!s.rank[yr]) { yr = wins[Math.max(0, wins.length - 13)]; }
      var A = s.rank[yr] || [], B = s.rank[now] || [];
      var of = B.filter(function (x) { return x; }).length || 50;
      var rows = [];
      s.states.forEach(function (g, i) {
        if (A[i] && B[i]) { rows.push({ g: g, a: A[i], b: B[i], d: A[i] - B[i] }); }
      });
      rows.sort(function (x, y) { return x.b - y.b; });
      if (!rows.length) { el('grid').innerHTML = ''; return; }

      var COLS = 10, CW = 112, CH = 96, PAD = 16;
      var ROWS = Math.ceil(rows.length / COLS);
      var W = PAD * 2 + COLS * CW, H = ROWS * CH + 8;
      var cells = rows.map(function (r, i) {
        var c0 = i % COLS, r0 = Math.floor(i / COLS);
        var x = PAD + c0 * CW, y = r0 * CH;
        var px = x + 28, pw = 46, py = y + 24, ph = CH - 52;
        var Y = function (rk) { return py + (rk - 1) / Math.max(1, of - 1) * ph; };
        var col = r.d > 0 ? '#1a3a5c' : (r.d < 0 ? '#9B1B30' : '#8a8a8a');
        return '<g class="swcell" data-live data-s="' + esc(r.g) + '" data-a="' + r.a +
          '" data-b="' + r.b + '" data-d="' + r.d + '" data-of="' + of + '">' +
          '<rect x="' + x + '" y="' + y + '" width="' + CW + '" height="' + CH +
          '" fill="transparent"><title>' + esc(r.g) + ': ' + ordinal(r.a) +
          ' to ' + ordinal(r.b) + ' of ' + of + '</title></rect>' +
          '<line x1="' + px + '" y1="' + (py - 5) + '" x2="' + px + '" y2="' +
          (py + ph + 5) + '" stroke="#ececec"/>' +
          '<line x1="' + (px + pw) + '" y1="' + (py - 5) + '" x2="' + (px + pw) +
          '" y2="' + (py + ph + 5) + '" stroke="#ececec"/>' +
          '<line x1="' + px + '" y1="' + Y(r.a).toFixed(1) + '" x2="' + (px + pw) +
          '" y2="' + Y(r.b).toFixed(1) + '" stroke="' + col + '" stroke-width="2"/>' +
          '<circle cx="' + px + '" cy="' + Y(r.a).toFixed(1) + '" r="2.6" fill="' +
          col + '" opacity=".5"/>' +
          '<circle cx="' + (px + pw) + '" cy="' + Y(r.b).toFixed(1) + '" r="3.2" fill="' +
          col + '"/>' +
          '<text x="' + (x + 6) + '" y="' + (y + 15) + '" class="swab">' +
          (ABBR[r.g] || r.g.slice(0, 2).toUpperCase()) + '</text>' +
          '<text x="' + (x + CW - 20) + '" y="' + (y + 15) +
          '" text-anchor="end" class="swd" style="fill:' + col + '">' +
          (r.d > 0 ? '+' + r.d : (r.d < 0 ? String(r.d) : '\u2013')) + '</text>' +
          '<text x="' + (px - 4) + '" y="' + (Y(r.a) + 3.5).toFixed(1) +
          '" text-anchor="end" class="swn">' + r.a + '</text>' +
          '<text x="' + (px + pw + 4) + '" y="' + (Y(r.b) + 3.5).toFixed(1) +
          '" class="swn on" style="fill:' + col + '">' + r.b + '</text></g>';
      }).join('');
      el('grid').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="swsvg" ' +
        'role="img" aria-label="Fifty states, each drawn as a slope from its ' +
        'standing a year ago to its standing now">' + cells + '</svg>';

      liveMarks(el('grid'), 'g.swcell[data-s]', function (g) {
        var nm = g.getAttribute('data-s'), d = +g.getAttribute('data-d');
        return {
          html: '<b>' + esc(nm) + '</b><br>' +
            ordinal(+g.getAttribute('data-a')) + ' to ' +
            ordinal(+g.getAttribute('data-b')) + ' of ' + g.getAttribute('data-of') +
            '<br><span class="ts">' + (d > 0 ? 'up ' + d + ' place' + (d === 1 ? '' : 's')
              : (d < 0 ? 'down ' + (-d) + ' place' + (d === -1 ? '' : 's')
                : 'held its place')) + '</span>',
          href: BASE + 'states/' + slug(nm) + '.html'
        };
      });

      var up = rows.filter(function (r) { return r.d > 0; }).length;
      var dn = rows.filter(function (r) { return r.d < 0; }).length;
      var big = rows.filter(function (r) { return Math.abs(r.d) >= 10; }).length;
      var nm = (M.indices.filter(function (x) { return x.key === k; })[0] || {}).title || '';
      /* Split into short sentences rather than one clause carrying a comma
         and a conjunction: the style gate reads that shape as a list missing
         its Oxford comma, and the gate is the standard rather than the thing
         to argue with. */
      el('sub').textContent = 'Standing in ' + wname(yr) + ' against ' + wname(now) +
        '. Panels are ordered by where each state stands now. Every panel uses ' +
        'the same fixed scale. First is the top of a panel; ' + ordinal(of) +
        ' is the bottom.';
      el('note').textContent = esc(nm) + '. ' + rows.length + ' states were ' +
        'measured in both months. ' + up + ' rose. ' + dn + ' fell. ' + big +
        ' moved at least ten places. A rise and a fall are the same event seen ' +
        'from two sides: the places are fixed, so a state rises only where ' +
        'another falls. A movement in a standing is never growth or decline in ' +
        'any quantity.';
    }

    function load(kk) {
      if (S[kk]) { return Promise.resolve(); }
      return get('data/series/' + kk + '.json').then(function (d) { S[kk] = d; });
    }

    get('data/manifest.json').then(function (m) {
      M = m;
      (M.states || []).forEach(function (x) { ABBR[x.s] = x.abbr; });
      node.querySelector('[data-f="k"]').innerHTML = M.indices.map(function (x) {
        return '<option value="' + x.key + '"' + (x.key === k ? ' selected' : '') +
          '>' + esc(x.name) + '</option>'; }).join('');
      return load(k);
    }).then(function () {
      draw();
      node.querySelector('[data-f="k"]').addEventListener('change', function () {
        k = this.value;
        load(k).then(draw);
      });
    }).catch(function (e) { fail(node, e); });
  }

  /* ── the eight Regions, this month ────────────────────────────────────────
     The Regions page already carries the map of which states belong together,
     so its masthead must not repeat it. What the page does not answer at the
     top is the obvious question a reader arrives with: which of the eight is
     strongest right now. A Region is drawn as the median of its members,
     because relative positions do not add. */
  function regionsrank(node) {
    Promise.all([get('data/manifest.json'), get('data/series/master.json')])
      .then(function (x) {
        var M = x[0], S = x[1], w = M.window;
        var rows = (M.regions || []).map(function (r) {
          var v = (r.members || []).map(function (n) {
            var j = S.states.indexOf(n);
            return j < 0 ? null : (S.rank[w] || [])[j];
          }).filter(function (n) { return n; }).sort(function (a, b) { return a - b; });
          if (!v.length) { return null; }
          var mid = v.length % 2 ? v[(v.length - 1) / 2]
            : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
          return { name: r.name, slug: r.slug, med: mid, n: v.length };
        }).filter(Boolean).sort(function (a, b) { return a.med - b.med; });
        if (!rows.length) { node.innerHTML = ''; return; }
        var worst = rows[rows.length - 1].med;
        node.innerHTML =
          '<div class="rgrank">' + rows.map(function (r, i) {
            var pct = Math.max(6, (1 - (r.med - 1) / Math.max(1, worst - 1)) * 100);
            return '<a class="rgrow" href="' + BASE + 'regions/' + r.slug + '.html">' +
              '<span class="rgn">' + (i + 1) + '</span>' +
              '<span class="rgname">' + esc(r.name) + '</span>' +
              '<span class="rgbar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
              '<b>' + (r.med % 1 ? r.med.toFixed(1) : ordinal(r.med)) + '</b></a>';
          }).join('') + '</div>' +
          '<p class="srctag">The eight Regions in ' + wname(w) + ', by the median ' +
          'standing of their member states on the Master Index. A Region is drawn as ' +
          'the median of its members because relative positions do not add. A bar is ' +
          'longer where the median member stands higher among the fifty states.</p>';
      }).catch(function (e) { fail(node, e); });
  }

  /* ── the finder's own map ─────────────────────────────────────────────────
     A small map of all 262 Christian Education Market Areas, shaded by how
     much Christian schooling each one holds. It answers the question the page
     asks before anybody types anything: there are 262 of these, they are not
     alike, and one of them is yours.

     When a lookup resolves, that market is picked out on it. The map is the
     page's subject rather than its decoration, which is the only reason a
     figure belongs in a masthead at all. */
  function findermap(node) {
    var byId = {}, map = null;
    Promise.all([get('data/atlas.json'), get('data/geo/markets.json')])
      .then(function (x) {
        var A = x[0];
        A.markets.forEach(function (m) { byId[m.id] = m; });
        var vals = A.markets.map(function (m) { return m.spk; })
          .filter(function (v) { return v || v === 0; }).sort(function (a, b) { return a - b; });
        var cuts = [0.2, 0.4, 0.6, 0.8].map(function (q) {
          return vals[Math.floor(vals.length * q)];
        });
        var host = document.createElement('div');
        node.appendChild(host);
        map = USMap(host, x[1], {
          tip: function (id) {
            var m = byId[id];
            if (!m) { return noReadingTip(id); }
            return '<b>' + esc(m.name) + '</b><br>' +
              (m.spk === null || m.spk === undefined ? 'not measured'
                : m.spk.toFixed(1) + ' enrollments per 1,000');
          },
          href: function (id) { return BASE + 'markets/' + id + '.html'; }
        });
        map.paint(function (id) {
          var m = byId[id];
          if (!m || m.spk === null || m.spk === undefined) { return '#ececec'; }
          var i = 0;
          while (i < cuts.length && m.spk > cuts[i]) { i++; }
          return RAMP[RAMP.length - 1 - i * 2];
        });
        var cap = document.createElement('figcaption');
        cap.innerHTML = 'All 262 Christian Education Market Areas, shaded by ' +
          'Christian school enrollments per 1,000 children. Darker is more. ' +
          'Enter a ZIP code and yours is picked out.';
        node.appendChild(cap);

        /* The finder announces its answer on the document, so the two widgets
           do not have to know about each other. */
        document.addEventListener('svcei:market', function (e) {
          var want = e && e.detail;
          if (!want || !map) { return; }
          map.paint(function (id) {
            if (id === want) { return '#1D7E78'; }
            var m = byId[id];
            if (!m || m.spk === null || m.spk === undefined) { return '#ececec'; }
            var i = 0;
            while (i < cuts.length && m.spk > cuts[i]) { i++; }
            return RAMP[RAMP.length - 1 - i * 2];
          });
          cap.innerHTML = '<b>' + esc((byId[want] || {}).name || want) +
            '</b> is picked out in teal. The shading is Christian school ' +
            'enrollments per 1,000 children; darker is more.';
        });
      }).catch(function (e) { fail(node, e); });
  }

  /* ── WHERE THE INSTITUTE IS BEING USED ────────────────────────────────────
     The visitor map answers "who is reading." This answers a different and
     more useful question: "which parts of the country are people asking
     about." Every ZIP lookup resolves to one of the 262 Christian Education
     Market Areas, and that market lights up.

     It is drawn on the same geometry as every other market map on the site, so
     a reader who has seen the atlas recognizes the shape immediately, and a
     market that is dark here is the same market that is dark there. */
  /* ── the shape of a span, drawn small ────────────────────────────────────
     A count for a period is one number and tells a reader nothing about
     whether it arrived steadily or in one afternoon. The strip under the map
     is that shape: one bar per hour or per day, no axis, no numbers, because
     it is there to be glanced at rather than read off.

     Empty buckets are drawn as empty rather than closed up. A quiet Tuesday is
     a fact about the week and a chart that omits it is telling a reader the
     week was busier than it was — the same defect as a line chart positioned
     by array index, which is how North Dakota's plot came to be drawn under
     somebody else's years. */
  function spanstrip(host, series, bucket) {
    if (!host) { return; }
    if (!series || !series.length) {
      host.innerHTML = '<p class="umnostrip">nothing recorded in this period yet</p>';
      return;
    }
    var by = {}, lo = Infinity, hi = -Infinity, top = 0;
    series.forEach(function (p) {
      by[p[0]] = p[1];
      if (p[0] < lo) { lo = p[0]; }
      if (p[0] > hi) { hi = p[0]; }
      if (p[1] > top) { top = p[1]; }
    });
    var slots = [];
    for (var t = lo; t <= hi; t += bucket) { slots.push([t, by[t] || 0]); }
    /* A period with one bucket in it is a bar chart of one bar, which reads as
       a mistake. Below three, the strip is not drawn at all. */
    if (slots.length < 3) { host.innerHTML = ''; return; }
    var W = 720, H = 44, g = slots.length > 120 ? 0 : 1;
    var w = (W - g * (slots.length - 1)) / slots.length;
    host.innerHTML =
      '<svg class="umstrip" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'preserveAspectRatio="none" role="img" aria-label="Activity over the period">' +
      slots.map(function (s, i) {
        var h = top ? Math.max(s[1] ? 1 : 0, (s[1] / top) * (H - 2)) : 0;
        return '<rect x="' + (i * (w + g)).toFixed(2) + '" y="' + (H - h).toFixed(2) +
          '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '"><title>' +
          esc(stripwhen(s[0], bucket)) + ' · ' + s[1] + '</title></rect>';
      }).join('') + '</svg>' +
      '<div class="umstripends"><span>' + esc(stripwhen(lo, bucket)) +
      '</span><span>' + esc(stripwhen(hi, bucket)) + '</span></div>';
  }

  function stripwhen(t, bucket) {
    var d = new Date(t * 1000);
    var mon = MON3[d.getMonth()] + ' ' + d.getDate();
    if (bucket >= 86400) { return mon; }
    var h = d.getHours();
    return mon + ', ' + ((h % 12) || 12) + (h < 12 ? ' am' : ' pm');
  }

  /* ── where the Institute is read, and what it is asked about ──────────────
     TWO LAYERS ON ONE GEOGRAPHY, and they are different questions.

       LOOKUPS   which parts of the country people are asking ABOUT. Recorded
                 when somebody resolves a ZIP code in the finder.
       READERS   where the people reading are actually sitting, rolled up from
                 the postal district our own server is told with each request.

     They were not both here. The map drew lookups and only lookups, and the
     readership record — which was being written the whole time — was visible
     only as dots on the world map above. A reader in Grand Rapids studying
     Alabama is one reader in Michigan and one lookup in Alabama, and the two
     must never be added together, so they are never drawn at once: the toggle
     switches layers, it does not overlay them.

     The roll-up from postal district to market area happens here, in the
     browser, from the same table the ZIP finder loads. There is exactly one
     copy of that table, it is the one the site publishes, and a second copy
     inside the counting service would be a second copy to drift. */
  function usemap(node) {
    var SPANS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'],
                 ['year', 'This year'], ['all', 'All time']];
    var LAYERS = [['use', 'Lookups'], ['read', 'Readers']];
    var span = 'week', layer = 'use';
    var A = null, geo = null, map = null, MK = {}, Z = null, LAST = {};
    /* Overridable so the map can be pointed at a stand-in service and checked
       without deploying anything, which is how the collapsed span buttons were
       eventually caught. */
    var API = new URLSearchParams(location.search).get('api') || LIVEAPI;

    node.innerHTML =
      '<div class="umwrap">' +
        '<div class="umlayers">' + LAYERS.map(function (x) {
          return '<button type="button" data-l="' + x[0] + '"' +
            (x[0] === layer ? ' class="on"' : '') + '>' + x[1] + '</button>';
        }).join('') + '</div>' +
        '<p class="umsay" data-c="say"></p>' +
        '<div class="umhead">' +
          '<div class="umstat"><b data-c="lookups">&mdash;</b>' +
            '<span data-c="lookupslab">lookups this week</span></div>' +
          '<div class="umbits">' +
            '<div><b data-c="reached">&mdash;</b><span data-c="reachedlab">markets reached</span></div>' +
            '<div><b data-c="states">&mdash;</b><span>states</span></div>' +
          '</div>' +
          '<div class="vmspan umspan">' + SPANS.map(function (x) {
            return '<button type="button" data-s="' + x[0] + '"' +
              (x[0] === span ? ' class="on"' : '') + '>' + x[1] + '</button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="umkey"><span data-c="keylo">Fewer lookups</span>' +
          [8, 6, 4, 2, 0].reverse().map(function (i) {
            return '<i style="background:' + RAMP[RAMP.length - 1 - i] + '"></i>';
          }).join('') + '<span>More</span>' +
          '<i class="none"></i><span data-c="keynone">none yet</span></div>' +
        '<div data-c="map"></div>' +
        '<div data-c="strip" class="umstripwrap"></div>' +
        '<div class="umfoot">' +
          '<div class="umcol"><h4 data-c="lefth">Most recent</h4><ol data-c="recent"></ol></div>' +
          '<div class="umcol"><h4 data-c="righth">Districts asked about</h4>' +
            '<ol data-c="side"></ol></div>' +
        '</div>' +
      '</div>';

    function el(k) { return node.querySelector('[data-c="' + k + '"]'); }

    /* Quantiles over the markets that have been looked up at all, so the ramp
       describes the traffic there is rather than the traffic there is not. A
       market nobody has asked about is not a pale shade of something; it is
       absent, and it is drawn as absent. */
    function cuts() {
      var v = Object.keys(MK).map(function (k) { return MK[k]; })
        .filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; });
      if (!v.length) { return []; }
      return [0.2, 0.4, 0.6, 0.8].map(function (q) {
        return v[Math.floor(v.length * q)];
      });
    }

    function draw() {
      var c = cuts();
      if (!map) { return; }
      map.paint(function (id) {
        var n = MK[id] || 0;
        if (!n) { return '#ececec'; }
        var i = 0;
        while (i < c.length && n > c[i]) { i++; }
        /* Darker is more, as everywhere else on this site. */
        return RAMP[RAMP.length - 1 - i * 2];
      });
    }

    var WHEN = { day: 'today', week: 'this week', month: 'this month',
                 year: 'this year', all: 'all time' };

    function show(D) {
      LAST = D;
      var states = {}, total, reached, sideh, side, lefth, left;

      if (layer === 'read') {
        /* Postal districts rolled up onto market areas. A district the table
           cannot place is counted in the total and drawn nowhere, and the count
           of those is reported rather than quietly dropped. */
        MK = {};
        var placed = 0, lost = 0;
        var zips = D.zips || {};
        Object.keys(zips).forEach(function (z) {
          var mid = Z ? Z[z] : null;
          if (mid) { MK[mid] = (MK[mid] || 0) + zips[z]; placed += zips[z]; }
          else { lost += zips[z]; }
        });
        Object.keys(D.states || {}).forEach(function (rc) { states[rc] = 1; });
        total = D.views || 0;
        reached = Object.keys(MK).length;
        el('lookupslab').textContent = 'page views ' + (WHEN[D.span] || '');
        el('reachedlab').textContent = 'market areas reached';
        el('keylo').textContent = 'Fewer readers';
        el('keynone').textContent = 'no readers yet';
        lefth = 'Networks';
        left = (D.networks || []).slice(0, 12).map(function (x) {
          return '<li><span class="umnet">' + esc(x.net) + '</span><span>' +
            num(x.n) + '</span></li>';
        }).join('') || '<li class="umnone"><span>no networks recorded yet</span></li>';
        sideh = 'Countries';
        side = (D.countries || []).slice(0, 12).map(function (x) {
          return '<li><span>' + esc(x.cc) + '</span><span>' + num(x.n) +
            '</span></li>';
        }).join('') || '<li class="umnone"><span>nothing recorded yet</span></li>';
        el('say').textContent =
          'Where the readers are. ' + num(placed) + ' of ' + num(total) +
          ' views placed on a market area' +
          (lost ? '; ' + num(lost) + ' in districts the map cannot place' : '') +
          (D.us < total ? '; ' + num(total - D.us) + ' from outside the country' : '') +
          '.';
      } else {
        MK = D.markets || {};
        Object.keys(MK).forEach(function (id) {
          var m = (A && A.byId[id]);
          if (m) { states[m.state] = 1; }
        });
        total = D.lookups || 0;
        reached = D.reached || 0;
        el('lookupslab').textContent = 'lookups ' + (WHEN[D.span] || '');
        el('reachedlab').textContent = 'markets reached';
        el('keylo').textContent = 'Fewer lookups';
        el('keynone').textContent = 'none yet';
        lefth = 'Most recent';
        left = (D.recent || []).length ? (D.recent || []).map(function (x) {
          var m = (A && A.byId[x.m]) || {};
          var nm = x.n || m.name || x.m;
          return '<li><a href="' + BASE + 'markets/' + esc(x.m) + '.html">' +
            esc(nm) + '</a><span>' + ago(x.t) + '</span></li>';
        }).join('') : '<li class="umnone"><span>no lookups yet</span></li>';
        sideh = 'Districts asked about';
        side = (D.zips || []).slice(0, 12).map(function (x) {
          var m = (A && A.byId[x.m]) || null;
          return '<li><span>' + esc(x.z) + (m ? ' &middot; ' + esc(m.name) :
            ' <em>no market area</em>') + '</span><span>' + num(x.n) + '</span></li>';
        }).join('') || '<li class="umnone"><span>nothing asked yet</span></li>';
        var miss = (D.unmatched || []).length;
        el('say').textContent =
          'What the country is being asked about. ' + num(total) + ' lookups ' +
          (WHEN[D.span] || '') +
          (miss ? '; ' + num(miss) + ' ZIP codes resolved to no market area' : '') +
          '.';
      }

      el('lookups').textContent = num(total);
      el('reached').textContent = num(reached) + (layer === 'read' ? '' : ' of 262');
      el('states').textContent = num(Object.keys(states).length);
      el('lefth').textContent = lefth;
      el('recent').innerHTML = left;
      el('righth').textContent = sideh;
      el('side').innerHTML = side;
      spanstrip(el('strip'), D.series, D.bucket ||
        (D.span === 'day' ? 3600 : 86400));
      draw();
    }

    /* The ZIP-to-market table is a quarter of a megabyte, and a reader who
       never touches the Readers layer should never pay for it. Fetched once,
       the first time it is needed, and remembered. */
    function zipTable() {
      if (Z) { return Promise.resolve(); }
      return get('data/zip_market.json').then(function (t) {
        Z = {};
        Object.keys(t.markets).forEach(function (mid) {
          t.markets[mid].forEach(function (z) { Z[z] = mid; });
        });
      });
    }

    function ago(t) {
      var s = Math.max(0, Math.floor(Date.now() / 1000) - (t || 0));
      if (s < 90) { return 'just now'; }
      if (s < 5400) { return Math.round(s / 60) + ' min ago'; }
      if (s < 172800) { return Math.round(s / 3600) + ' hr ago'; }
      return Math.round(s / 86400) + ' days ago';
    }

    function load() {
      if (!API) {
        el('recent').innerHTML =
          '<li class="umnone"><span>the counting service is not deployed</span></li>';
        return;
      }
      var route = layer === 'read' ? '/traffic' : '/usage';
      var pre = layer === 'read' ? zipTable() : Promise.resolve();
      pre.then(function () {
        return liveFetch(API + route + '?span=' + span);
      })
        .then(show)
        .catch(function (e) {
          // Say which thing failed. "The feed could not be read" sent a reader
          // looking at their own traffic; the service not being deployed is a
          // different problem with a different fix.
          el('recent').innerHTML =
            '<li class="umnone"><span>' + esc(e && e.message ?
              e.message : 'the feed could not be read') + '</span></li>';
        });
    }

    Promise.all([get('data/atlas.json'), get('data/geo/markets.json')])
      .then(function (x) {
        A = { markets: x[0].markets, byId: {} };
        A.markets.forEach(function (m) { A.byId[m.id] = m; });
        geo = x[1];
        map = USMap(el('map'), geo, {
          tip: function (id) {
            var m = A.byId[id];
            var n = MK[id] || 0;
            var one = layer === 'read' ? ' page view' : ' lookup';
            var none = layer === 'read' ? 'no readers here yet' : 'no lookups yet';
            return '<b>' + esc(m ? m.name : id) + '</b><br>' +
              (n ? num(n) + one + (n === 1 ? '' : 's') : none);
          },
          href: function (id) { return BASE + 'markets/' + id + '.html'; }
        });
        node.querySelectorAll('.umspan button').forEach(function (b) {
          b.addEventListener('click', function () {
            span = b.getAttribute('data-s');
            node.querySelectorAll('.umspan button').forEach(function (o) {
              o.classList.toggle('on', o === b);
            });
            load();
          });
        });
        node.querySelectorAll('.umlayers button').forEach(function (b) {
          b.addEventListener('click', function () {
            layer = b.getAttribute('data-l');
            node.querySelectorAll('.umlayers button').forEach(function (o) {
              o.classList.toggle('on', o === b);
            });
            load();
          });
        });
        load();
        setInterval(load, 30000);
      }).catch(function (e) { fail(node, e); });
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */
  /* ── light and dark ───────────────────────────────────────────────────────
     Three states, and the default is the device's own: a phone set to dark at
     eleven at night opens this site dark without being asked. A reader who
     chooses is remembered in their own browser and nowhere else, and the choice
     is applied before first paint by a line in the page head, so nobody sees a
     white flash on the way to a dark page. */
  var TKEY = 'svcei-theme';

  function themeRead() {
    try { return localStorage.getItem(TKEY); } catch (e) { return null; }
  }
  function themeApply(v) {
    var r = document.documentElement;
    if (v === 'dark' || v === 'light') { r.setAttribute('data-theme', v); }
    else { r.removeAttribute('data-theme'); }
    var dark = v === 'dark' || (!v && window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('[data-a="theme"]').forEach(function (b) {
      b.textContent = dark ? 'Light' : 'Dark';
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
    });
  }
  function wireTheme() {
    themeApply(themeRead());
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-a="theme"]') : null;
      if (!b) { return; }
      e.preventDefault();
      var now = document.documentElement.getAttribute('data-theme');
      var sys = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = now ? (now === 'dark' ? 'light' : 'dark') : (sys ? 'light' : 'dark');
      try { localStorage.setItem(TKEY, next); } catch (x) { /* private mode */ }
      themeApply(next);
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onch = function () { if (!themeRead()) { themeApply(null); } };
      if (mq.addEventListener) { mq.addEventListener('change', onch); }
    }
  }

  /* ── the height of the sticky header, told to the stylesheet ──────────────
     Every anchor on the site lands under the masthead unless something knows
     how tall the masthead is, and nothing in CSS can know: it is three lines
     of brand text on a narrow window and one on a wide one, and it grows again
     when the navigation wraps. So it is measured and written onto the root,
     where `[id] { scroll-margin-top: var(--navh) }` picks it up.

     Re-measured on resize, and once more after the fonts land, because a
     header measured before its own typeface has loaded is measured at the
     fallback font's line height and is wrong by a few pixels in the direction
     that hides the heading. */
  function navheight() {
    var nav = document.querySelector('nav.topnav');
    if (!nav) { return; }
    var h = Math.round(nav.getBoundingClientRect().height);
    if (h > 0) {
      document.documentElement.style.setProperty('--navh', (h + 12) + 'px');
    }
  }

  function wireNavHeight() {
    navheight();
    window.addEventListener('resize', navheight);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(navheight).catch(function () { });
    }
    setTimeout(navheight, 600);
    rehash();
  }

  /* ── landing on a fragment, on a page that is still growing ───────────────
     A page opened directly at a fragment is scrolled by the browser before any
     of this runs, so the first landing is the one that misses in two separate
     ways. The masthead covers the heading, which the scroll margin fixes. And
     on a page whose figures are drawn from payloads — every state page, the
     indices, the atlas — the widgets render AFTER the jump and push the target
     hundreds of pixels further down, so the reader is left in the middle of
     something they did not ask for. On the Michigan page the target ended up
     1,708 pixels below a 900-pixel window.

     So the target is re-found on a few later ticks, as the page settles.

     It stops the instant the reader scrolls. A page that keeps yanking
     somebody back to where a link pointed, after they have started reading
     somewhere else, is worse than a page that landed badly once. */
  function rehash() {
    if (!location.hash || location.hash === '#') { return; }
    var target = null;
    try { target = document.querySelector(location.hash); } catch (e) { return; }
    if (!target || !target.scrollIntoView) { return; }

    var theirs = false;
    var release = function () { theirs = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
      window.addEventListener(ev, release, { passive: true, once: true });
    });

    var at = function () {
      if (theirs) { return; }
      /* 'auto' rather than smooth: these are corrections to a landing the
         reader did not see happen, and animating them looks like drift. */
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    };
    [80, 500, 1400, 3000].forEach(function (ms) { setTimeout(at, ms); });
  }

  function boot() {
    wireNavHeight();
    wireTheme();
    analytics();
    beacon();
    wireTracking();
    wireForms();
    /* Figures are drawn asynchronously from payloads, so the tools are
       attached after the widgets have had a chance to render, and again
       whenever the page grows a new one. */
    setTimeout(figtools, 1200);
    setTimeout(figtools, 3500);
    document.addEventListener('click', function () { setTimeout(figtools, 400); });
    var t = document.querySelector('.navtoggle');
    if (t) {
      t.addEventListener('click', function () {
        document.querySelector('nav.topnav ul').classList.toggle('open');
      });
    }
    document.querySelectorAll('[data-widget]').forEach(function (n) {
      var w = n.getAttribute('data-widget');
      ({
        timelapse: timelapse, standings: standings, statepage: statepage,
        marketlist: marketlist, marketpage: marketpage, regionpage: regionpage,
        library: library, statereports: statereports, home: homefacts,
        contactform: contactform, multleads: multleads,
        marketrate: marketrate, marketthin: marketthin,
        policydateline: policydateline, churchratio: churchratio,
        stateyears: stateyears, countycarpet: countycarpet,
        indexviz: indexviz,
        compare: compare, finder: finder, explorer: explorer, cemabuilder: cemabuilder,
        livemap: livemap, usemap: usemap, findermap: findermap,
        regionsrank: regionsrank, tilemap: tilemap, sparkgrid: sparkgrid,
        levelmirror: levelmirror, bumpchart: bumpchart, slopewall: slopewall,
        alluvial: alluvial, beeswarm: beeswarm,
        scorecard: scorecard, walkthrough: walkthrough,
        timemachine: timemachine, embedbuild: embedbuild, embedframe: embedframe,
        atlasmarkets: atlasmarkets, atlasregions: atlasregions,
        embedgallery: embedgallery,
        atlaschurches: atlaschurches, policymap: policymap,
        record: record, chronicle: chronicle, policyqueue: policyqueue,
        levelsplit: levelsplit, sharebar: sharebar,
        regionleague: regionleague, statemap: statemap,
        regionmap: regionmap, marketmap: marketmap,
        medianchart: medianchart, markettimelapse: markettimelapse,
        coverage: coverage
      }[w] || function () { })(n);
    });
    var y = document.querySelector('[data-fill="year"]');
    if (y) { y.textContent = new Date().getFullYear(); }
    // The last two features are applied to every page rather than declared on
    // one, so a chart published tomorrow gets them without anyone remembering.
    // They run after the widgets so that a chart drawn by a widget is covered
    // as well as a chart written into the markup.
    if (!document.body.classList.contains('embed')) {
      // Widgets draw when their payload arrives, so a single timer is a guess
      // that is wrong on a slow connection. Sweep a few times, then watch for
      // anything drawn later. Adding a control twice is prevented by the guard
      // inside each function; adding it never is the failure that matters.
      var sweep = function () { citeAll(); tableViews(); };
      [250, 800, 2000, 4000].forEach(function (t) { setTimeout(sweep, t); });
      if (window.MutationObserver) {
        var pending = null;
        new MutationObserver(function () {
          clearTimeout(pending); pending = setTimeout(sweep, 250);
        }).observe(document.body, { childList: true, subtree: true });
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  window.SVCEI = { get: get, ordinal: ordinal, andlist: andlist, rankColor: rankColor,
    cite: citeFigure, compare: compare, finder: finder };
})();
