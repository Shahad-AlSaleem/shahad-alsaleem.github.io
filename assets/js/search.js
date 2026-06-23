/* ============================================================
   Site behaviour: mobile nav, search, writeup filtering,
   code copy buttons, TOC scrollspy.
   ============================================================ */
(function () {
  "use strict";
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---- Mobile off-canvas nav ---- */
  var burger = $("#navBurger"), scrim = $("#scrim");
  function setNav(open) {
    document.body.classList.toggle("nav-open", open);
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (burger) burger.addEventListener("click", function () { setNav(!document.body.classList.contains("nav-open")); });
  if (scrim)  scrim.addEventListener("click", function () { setNav(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setNav(false); });

  /* ---- Collapsible nav groups ---- */
  $$(".nav-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var group = btn.closest(".nav-group");
      var open = group.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  /* ---- Client-side search ---- */
  var input = $("#search-input"), box = $("#search-results");
  if (input && box) {
    var data = null, active = -1;
    function load() {
      if (data) return Promise.resolve(data);
      return fetch(input.getAttribute("data-index"))
        .then(function (r) { return r.json(); })
        .then(function (j) { data = j; return j; })
        .catch(function () { data = []; return data; });
    }
    function render(items, q) {
      box.innerHTML = "";
      active = -1;
      if (!items.length) {
        box.innerHTML = '<div class="sr-none">No matches for “' + esc(q) + '”</div>';
        box.hidden = false; return;
      }
      items.slice(0, 12).forEach(function (it) {
        var a = document.createElement("a");
        a.href = it.url;
        a.innerHTML = '<span class="sr-sec">' + esc(it.platform || it.section) + '</span>' + esc(it.title);
        box.appendChild(a);
      });
      box.hidden = false;
    }
    function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
    function search(q) {
      q = q.trim().toLowerCase();
      if (!q) { box.hidden = true; return; }
      load().then(function (all) {
        var hits = all.filter(function (it) {
          var hay = (it.title + " " + (it.tags || []).join(" ") + " " + (it.summary || "") + " " + it.platform).toLowerCase();
          return hay.indexOf(q) !== -1;
        });
        render(hits, q);
      });
    }
    input.addEventListener("input", function () { search(input.value); });
    input.addEventListener("focus", function () { if (input.value) search(input.value); });
    input.addEventListener("keydown", function (e) {
      var links = $$("a", box);
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, links.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); }
      else if (e.key === "Enter" && active >= 0 && links[active]) { window.location = links[active].href; return; }
      else return;
      links.forEach(function (l, i) { l.classList.toggle("is-active", i === active); });
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".search")) box.hidden = true; });
  }

  /* ---- Writeup hub filtering ---- */
  var filterbar = $("[data-writeup-filter]");
  if (filterbar) {
    var grid = $("#writeup-grid"), empty = $("#writeup-empty");
    var items = $$(".grid-item", grid);
    var qInput = $(".grid-search", filterbar);
    var state = { q: "", platform: "all", tags: [] };
    function apply() {
      var shown = 0;
      items.forEach(function (el) {
        var okP = state.platform === "all" || el.getAttribute("data-platform") === state.platform;
        var title = el.getAttribute("data-title") || "";
        var okQ = !state.q || title.indexOf(state.q) !== -1;
        var elTags = (el.getAttribute("data-tags") || "").split(" ");
        var okT = !state.tags.length || state.tags.every(function (t) { return elTags.indexOf(t) !== -1; });
        var show = okP && okQ && okT;
        el.hidden = !show;
        if (show) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
    }
    if (qInput) qInput.addEventListener("input", function () { state.q = qInput.value.trim().toLowerCase(); apply(); });
    $$(".filter-chip[data-platform]", filterbar).forEach(function (btn) {
      btn.addEventListener("click", function () {
        $$(".filter-chip[data-platform]", filterbar).forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        state.platform = btn.getAttribute("data-platform");
        apply();
      });
    });
    $$(".filter-chip[data-tag]", filterbar).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var t = btn.getAttribute("data-tag");
        var i = state.tags.indexOf(t);
        if (i === -1) { state.tags.push(t); btn.classList.add("is-active"); }
        else { state.tags.splice(i, 1); btn.classList.remove("is-active"); }
        apply();
      });
    });
  }

  /* ---- Simple grid search on plain list pages ---- */
  var simpleBar = $("[data-platform-filter]");
  if (simpleBar) {
    var sInput = $(".grid-search", simpleBar);
    var sItems = $$(".card-grid .grid-item");
    if (sInput) sInput.addEventListener("input", function () {
      var q = sInput.value.trim().toLowerCase();
      sItems.forEach(function (el) {
        var t = el.getAttribute("data-title") || "";
        el.hidden = q && t.indexOf(q) === -1;
      });
    });
  }

  /* ---- Code copy buttons ---- */
  $$(".doc-body .highlight").forEach(function (block) {
    var pre = $("pre", block);
    if (!pre) return;
    var btn = document.createElement("button");
    btn.className = "copy-btn"; btn.type = "button"; btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      var code = pre.innerText;
      navigator.clipboard.writeText(code).then(function () {
        btn.textContent = "Copied"; btn.classList.add("copied");
        setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1600);
      });
    });
    block.appendChild(btn);
  });

  /* ---- TOC scrollspy ---- */
  var tocLinks = $$(".toc nav a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var map = {};
    var heads = tocLinks.map(function (a) {
      var id = decodeURIComponent((a.getAttribute("href") || "").replace(/^#/, ""));
      var el = id && document.getElementById(id);
      if (el) map[id] = a;
      return el;
    }).filter(Boolean);
    var current = null;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          if (current) current.classList.remove("toc-active");
          var a = map[en.target.id];
          if (a) { a.classList.add("toc-active"); current = a; }
        }
      });
    }, { rootMargin: "0px 0px -75% 0px", threshold: 0 });
    heads.forEach(function (h) { obs.observe(h); });
  }
})();
