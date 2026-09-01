/* ==========================================================================
   Field notes ledger: page behaviour

   No dependencies. The page is fully readable with JavaScript disabled and
   prints identically either way; everything here is additive.

     1. Missing photo handling, gated by PREVIEW
     2. Sequence viewer: click through the frames of a part, looping
     3. Comparison slider
     4. Lightbox
     5. Section nav
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     PREVIEW

       true   a photo that fails to load leaves its labelled placeholder
              well in place, so the page can be laid out before a shoot.

       false  a photo that fails to load is removed along with its figure,
              so an unused slot never reaches the printed PDF.

     All the photographs exist now, so this stays false. Set it to true, or
     load the page with ?preview=1, if you ever add empty slots for a shoot
     that has not happened yet.
     ------------------------------------------------------------------------ */
  var PREVIEW = false;

  var override = new URLSearchParams(window.location.search).get('preview');
  if (override !== null) {
    PREVIEW = override !== '0' && override !== 'false';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function text(el) { return el ? el.textContent.trim() : ''; }

  /* Run a callback once an image has either loaded or failed, including
     images that finished before this script ran. */
  function settle(img, onLoad, onError) {
    if (img.complete) {
      if (img.naturalWidth > 0) { onLoad(); } else { onError(); }
      return;
    }
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
  }

  /* 1. Photo wells ------------------------------------------------------- */

  function initPlates() {
    var wells = document.querySelectorAll('.plate__well img');

    Array.prototype.forEach.call(wells, function (img) {
      var well = img.closest('.plate__well');
      var plate = img.closest('.plate');
      /* Frames inside a sequence are thumbnails: clicking one changes the
         stage rather than opening the lightbox. */
      var inSequence = !!plate.closest('[data-sequence]');

      settle(img, function () {
        /* Remove the placeholder rather than covering it. A transparent
           image, an object-fit gap, or a screen reader would otherwise
           still expose the label. */
        var ph = well.querySelector('.plate__ph');
        if (ph) { ph.remove(); }

        if (inSequence) { return; }

        plate.classList.add('is-zoomable');
        well.setAttribute('role', 'button');
        well.setAttribute('tabindex', '0');
        well.setAttribute('aria-label', 'Enlarge: ' + (img.alt || 'photograph'));
      }, function () {
        img.hidden = true;
        if (!PREVIEW) {
          /* Filmstrip frames are wrapped in list items. */
          var host = plate.closest('li') || plate;
          /* A standalone figure owns the ruled label above it, so take
             that with it rather than leaving a heading over nothing. */
          if (host === plate) {
            var above = plate.previousElementSibling;
            if (above && above.classList.contains('fig-label')) { above.remove(); }
          }
          host.remove();
          console.warn('Dropped a figure, image did not load: ' + img.getAttribute('src'));
        }
      });
    });

    /* A filmstrip that lost every frame should not leave an empty grid. */
    window.addEventListener('load', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.filmstrip'), function (strip) {
        if (!strip.querySelector('.plate')) { strip.hidden = true; }
      });
    });
  }

  /* 2. Sequence viewer --------------------------------------------------- */

  /* Builds a large stage above the contact sheet and turns the sheet into a
     thumbnail rail. Prev and next wrap around, so the sequence loops in
     both directions. The markup ships as a plain grid of every frame, which
     is what a no-script browser and the printer get. */
  function initSequence(root) {
    var frames = Array.prototype.slice.call(root.querySelectorAll('.filmstrip .plate'));
    var pending = frames.length;
    var loaded = [];

    if (!pending) { return; }

    frames.forEach(function (plate) {
      var img = plate.querySelector('img');
      settle(img, function () { loaded.push(plate); resolve(); }, resolve);
    });

    function resolve() {
      pending -= 1;
      if (pending === 0) { build(); }
    }

    function build() {
      /* Keep document order, and drop anything PREVIEW mode removed. */
      var live = frames.filter(function (plate) {
        return loaded.indexOf(plate) !== -1 && plate.isConnected;
      });
      if (!live.length) { return; }

      var stage = document.createElement('div');
      stage.className = 'stage';
      stage.innerHTML =
        '<div class="stage__well"><img alt="" decoding="async"></div>' +
        '<div class="stage__bar">' +
          '<button type="button" class="stage__nav" data-step="-1">Prev</button>' +
          '<p class="stage__meta">' +
            '<span class="stage__label"></span>' +
            '<span class="stage__count" role="status" aria-live="polite"></span>' +
          '</p>' +
          '<button type="button" class="stage__nav" data-step="1">Next</button>' +
        '</div>';

      var full = stage.querySelector('.stage__well img');
      var label = stage.querySelector('.stage__label');
      var count = stage.querySelector('.stage__count');
      var index = 0;

      function show(next) {
        /* Wrapping in both directions is what makes it loop. */
        index = ((next % live.length) + live.length) % live.length;

        var plate = live[index];
        var source = plate.querySelector('img');
        var name = text(plate.querySelector('.plate__label'));
        var spec = text(plate.querySelector('.spec'));

        full.src = source.currentSrc || source.src;
        full.alt = source.alt;

        /* A purely numeric frame label would just repeat the counter. */
        label.textContent = [/^\d+$/.test(name) ? '' : name, spec]
          .filter(Boolean).join('  ·  ');
        count.textContent = pad(index + 1) + ' / ' + pad(live.length);

        live.forEach(function (p) { p.classList.remove('is-current'); });
        plate.classList.add('is-current');
      }

      Array.prototype.forEach.call(stage.querySelectorAll('.stage__nav'), function (button) {
        var step = Number(button.getAttribute('data-step'));
        button.setAttribute('aria-label', step < 0 ? 'Previous frame' : 'Next frame');
        button.addEventListener('click', function () { show(index + step); });
      });

      live.forEach(function (plate, i) {
        var well = plate.querySelector('.plate__well');
        well.setAttribute('role', 'button');
        well.setAttribute('tabindex', '0');
        well.setAttribute('aria-label', 'Show frame ' + pad(i + 1));
        well.addEventListener('click', function () { show(i); });
        well.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            show(i);
          }
        });
      });

      root.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
      });

      root.insertBefore(stage, root.firstChild);
      root.classList.add('has-stage');
      show(0);
    }
  }

  /* 3. Comparison slider ------------------------------------------------- */

  function initCompare(root) {
    var imgs = root.querySelectorAll('img');
    var pending = imgs.length;
    var failed = false;

    if (!pending) { root.remove(); return; }

    Array.prototype.forEach.call(imgs, function (img) {
      settle(img, resolve, function () { failed = true; resolve(); });
    });

    function resolve() {
      pending -= 1;
      if (pending > 0) { return; }
      /* A half loaded wipe is worse than no wipe. The contact sheet above
         already carries the comparison. */
      if (failed) { root.remove(); return; }
      wire();
    }

    function wire() {
      var viewport = root.querySelector('.compare__viewport');
      var handle = root.querySelector('.compare__handle');
      var dragging = false;

      function set(value) {
        var pos = Math.max(0, Math.min(100, value));
        viewport.style.setProperty('--pos', pos + '%');
        handle.setAttribute('aria-valuenow', String(Math.round(pos)));
      }

      function fromPointer(event) {
        var box = viewport.getBoundingClientRect();
        set(((event.clientX - box.left) / box.width) * 100);
      }

      function current() {
        return Number(handle.getAttribute('aria-valuenow')) || 50;
      }

      viewport.addEventListener('pointerdown', function (event) {
        dragging = true;
        viewport.setPointerCapture(event.pointerId);
        fromPointer(event);
        event.preventDefault();
      });

      viewport.addEventListener('pointermove', function (event) {
        if (dragging) { fromPointer(event); }
      });

      viewport.addEventListener('pointerup', function () { dragging = false; });
      viewport.addEventListener('pointercancel', function () { dragging = false; });

      handle.addEventListener('keydown', function (event) {
        var step = event.shiftKey ? 10 : 2;
        var handled = true;

        switch (event.key) {
          case 'ArrowLeft':  set(current() - step); break;
          case 'ArrowRight': set(current() + step); break;
          case 'Home':       set(0); break;
          case 'End':        set(100); break;
          default:           handled = false;
        }

        if (handled) { event.preventDefault(); }
      });

      set(50);
      root.hidden = false;
    }
  }

  /* 4. Lightbox ---------------------------------------------------------- */

  var ZOOM_SELECTOR = '.is-zoomable .plate__well, .stage__well';

  function initLightbox() {
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Enlarged photograph');
    box.innerHTML =
      '<button type="button" class="lightbox__close">Close (esc)</button>' +
      '<img alt="">' +
      '<p class="lightbox__cap"></p>';
    document.body.appendChild(box);

    var full = box.querySelector('img');
    var caption = box.querySelector('.lightbox__cap');
    var close = box.querySelector('.lightbox__close');
    var lastFocus = null;

    function open(host) {
      var source = host.querySelector('img');
      if (!source || !source.getAttribute('src')) { return; }

      var plate = host.closest('.plate');
      var stage = host.closest('.stage');
      var cap = plate ? plate.querySelector('.plate__label')
              : stage ? stage.querySelector('.stage__label')
              : null;

      full.src = source.currentSrc || source.src;
      full.alt = source.alt;
      caption.textContent = text(cap);

      lastFocus = document.activeElement;
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      close.focus();
    }

    function hide() {
      box.hidden = true;
      full.removeAttribute('src');
      document.body.style.overflow = '';
      if (lastFocus) { lastFocus.focus(); }
    }

    document.addEventListener('click', function (event) {
      var host = event.target.closest && event.target.closest(ZOOM_SELECTOR);
      if (host) { open(host); }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') { return; }
      var host = event.target.closest && event.target.closest('.is-zoomable .plate__well');
      if (host) {
        event.preventDefault();
        open(host);
      }
    });

    close.addEventListener('click', hide);

    box.addEventListener('click', function (event) {
      if (event.target === box) { hide(); }
    });

    document.addEventListener('keydown', function (event) {
      if (box.hidden) { return; }
      if (event.key === 'Escape') { hide(); }
      /* Only the close button is focusable inside, so trapping is a matter
         of sending Tab back to it. */
      if (event.key === 'Tab') {
        event.preventDefault();
        close.focus();
      }
    });
  }

  /* 5. Section nav ------------------------------------------------------- */

  function initNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.tocnav a'));
    if (!links.length || !('IntersectionObserver' in window)) { return; }

    var byId = {};
    var sections = [];

    links.forEach(function (link) {
      var target = document.querySelector(link.getAttribute('href'));
      if (target) {
        byId[target.id] = link;
        sections.push(target);
      }
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        links.forEach(function (link) { link.setAttribute('aria-current', 'false'); });
        byId[entry.target.id].setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (section) { observer.observe(section); });
  }

  /* Boot ----------------------------------------------------------------- */

  initPlates();
  Array.prototype.forEach.call(document.querySelectorAll('[data-sequence]'), initSequence);
  Array.prototype.forEach.call(document.querySelectorAll('[data-compare]'), initCompare);
  initLightbox();
  initNav();
}());
