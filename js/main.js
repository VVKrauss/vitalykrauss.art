(function () {
  const langButtons = document.querySelectorAll("[data-lang]");
  const seriesRoot = document.querySelector("#series");
  const exhibitionsRoot = document.querySelector("#exhibitions");
  const shopRoot = document.querySelector("#shop");
  const viewer = document.querySelector("#viewer");
  const viewerBody = document.querySelector("#viewer-body");
  const requestDialog = document.querySelector("#request-dialog");
  const requestBody = document.querySelector("#request-body");
  const heroImage = document.querySelector("#hero-image");

  const openSeries = new Set(["insecterra", "with-yudochkina"]);
  const slideAt = Object.create(null);
  const request = [];
  let lang = readPreference("vk-lang") || "en";
  let units = readPreference("vk-units") === "in" ? "in" : "cm";
  let shopAt = 0;
  let shopSize = "standard";
  let touchStart = null;
  let openWorkId = null;
  let viewerOrigin = null;
  let requestOrigin = "review-request";
  let requestSent = false;

  if (!["en", "ru", "es"].includes(lang)) lang = "en";

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("touchstart", function (event) {
    const gallery = event.target.closest(".slide-frame[data-slideshow]");
    touchStart = gallery && event.touches.length === 1
      ? { id: gallery.dataset.slideshow, x: event.touches[0].clientX, y: event.touches[0].clientY }
      : null;
  }, { passive: true });
  document.addEventListener("touchend", function (event) {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      stepSlide(touchStart.id, dx < 0 ? 1 : -1, null, false);
    }
    touchStart = null;
  }, { passive: true });
  document.addEventListener("touchcancel", function () { touchStart = null; }, { passive: true });
  viewer.addEventListener("click", onBackdrop);
  requestDialog.addEventListener("click", onBackdrop);
  viewer.addEventListener("close", function () {
    openWorkId = null;
    const origin = viewerOrigin && document.querySelector(viewerOrigin);
    if (origin) origin.focus({ preventScroll: true });
  });
  requestDialog.addEventListener("close", function () {
    const origin = document.getElementById(requestOrigin);
    if (origin) origin.focus({ preventScroll: true });
  });

  Object.assign(SITE, normalizeCatalogue(SITE, true));
  render();
  let cataloguePending = false, catalogueRevision = '';
  async function refreshCatalogue() {
    if (cataloguePending) return;
    cataloguePending = true;
    try {
      const response = await fetch('https://studio.vitalykrauss.art/api/catalogue', {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error('Catalogue unavailable');
      const data = await response.json();
      if (!data.publishedAt || !Array.isArray(data.works) || !Array.isArray(data.series) || !Array.isArray(data.exhibitions)) throw new Error('Invalid catalogue');
      const revision = JSON.stringify(data);
      if (catalogueRevision === revision) return;
      const normalized = normalizeCatalogue(data, false);
      Object.assign(SITE, normalized); catalogueRevision = revision;
      SITE.series.forEach(s => openSeries.add(s.id));
      for (let i=request.length-1;i>=0;i--) {
        const found=findWork(request[i].workId);
        if (!found || !found.work.offers.some(o => o.id===request[i].variantId)) request.splice(i,1);
      }
      if (openWorkId && !findWork(openWorkId)) viewer.close();
      shopAt=0; shopSize=''; render();
    } catch (error) { console.warn('Catalogue refresh failed; will retry.',error.message); }
    finally { cataloguePending=false; }
  }
  refreshCatalogue();
  window.addEventListener('focus', refreshCatalogue);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCatalogue(); });
  setInterval(() => { if (!document.hidden) refreshCatalogue(); }, 30000);

  function onClick(event) {
    const unitButton = event.target.closest('[data-unit]');
    if (unitButton) {
      units=unitButton.dataset.unit; writePreference('vk-units',units); render(); return;
    }
    if (event.target.closest("#theme-toggle")) {
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{transition:none !important}";
      document.head.append(style);
      const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      writePreference("vk-theme", theme);
      updateTheme();
      void document.body.offsetHeight;
      requestAnimationFrame(function () { requestAnimationFrame(function () { style.remove(); }); });
      return;
    }
    const sizeButton = event.target.closest("[data-shop-size]");
    if (sizeButton) {
      shopSize = sizeButton.dataset.shopSize;
      renderShop();
      shopRoot.querySelector('[data-shop-size="' + shopSize + '"]').focus({ preventScroll: true });
      return;
    }
    const langButton = event.target.closest("[data-lang]");
    if (langButton) {
      lang = langButton.dataset.lang;
      writePreference("vk-lang", lang);
      render();
      return;
    }

    const stepButton = event.target.closest("[data-step]");
    if (stepButton) {
      stepSlide(stepButton.dataset.slideshow, Number(stepButton.dataset.step));
      return;
    }

    const thumbnailButton = event.target.closest("[data-go]");
    if (thumbnailButton) {
      stepSlide(thumbnailButton.dataset.slideshow, 0, Number(thumbnailButton.dataset.go));
      return;
    }

    const seriesButton = event.target.closest("[data-series-toggle]");
    if (seriesButton) {
      const id = seriesButton.dataset.seriesToggle;
      if (openSeries.has(id)) openSeries.delete(id);
      else openSeries.add(id);
      renderSeries();
      seriesRoot.querySelector('[data-series-toggle="' + escapeHtml(id) + '"]').focus({ preventScroll: true });
      return;
    }

    const workButton = event.target.closest("[data-open-work]");
    if (workButton) {
      openViewer(workButton.dataset.openWork);
      return;
    }

    const addButton = event.target.closest("[data-add]");
    if (addButton) {
      addItem(addButton.dataset.add, addButton.dataset.variant);
      return;
    }

    if (event.target.closest("[data-close-viewer]")) viewer.close();
    if (event.target.closest("[data-close-request]")) requestDialog.close();

    const qtyButton = event.target.closest("[data-qty]");
    if (qtyButton) {
      changeQty(qtyButton.dataset.id, qtyButton.dataset.variant, Number(qtyButton.dataset.qty));
      return;
    }

    if (event.target.closest("[data-remove]")) {
      removeItem(event.target.closest("[data-remove]").dataset.remove, event.target.closest("[data-remove]").dataset.variant);
    }
  }

  function onKeydown(event) {
    const slideshow = event.target.closest("[data-slideshow]");
    if (!slideshow) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    stepSlide(slideshow.dataset.slideshow, event.key === "ArrowRight" ? 1 : -1);
  }

  function onSubmit(event) {
    if (event.target.id !== "request-form") return;
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const note = String(data.get("note") || "").trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name || !validEmail || request.length === 0) {
      const error = event.target.querySelector(".form-error");
      if (error) error.hidden = false;
      return;
    }
    const lines = request.map(function (item) {
      const found = findWork(item.workId);
      const offer = found.work.offers.find(function (entry) { return entry.id === item.variantId; });
      return [
        found.work.title[lang],
        t("kind.print"),
        sizeText(offer.size),
        money(offer.price),
        "× " + item.qty
      ].join(" — ");
    });
    const body = [
      "Name: " + name,
      "Email: " + email,
      note ? "Note: " + note : "",
      "",
      lines.join("\n"),
      "",
      t("request.total") + ": " + money(total())
    ].filter(function (line) { return line !== ""; }).join("\n");
    const href = "mailto:" + SITE.email
      + "?subject=" + encodeURIComponent("Vitaly Krauss — " + t("request.title"))
      + "&body=" + encodeURIComponent(body);
    requestSent = true;
    updateCount();
    renderRequest();
    const mail = document.createElement("a");
    mail.href = href;
    mail.click();
  }

  function onBackdrop(event) {
    if (event.target === viewer) viewer.close();
    if (event.target === requestDialog) requestDialog.close();
  }

  function render() {
    document.documentElement.lang = lang;
    document.title = t("meta.title");
    document.querySelector('meta[name="description"]').setAttribute("content", t("meta.description"));
    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (node) {
      node.setAttribute("aria-label", t(node.dataset.i18nAria));
    });
    langButtons.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
    });
    const heroWork = findWork(SITE.heroWorkId);
    heroImage.closest("figure").hidden = !heroWork;
    const lede=document.querySelector(".hero-copy .lede");
    if (heroWork) {
      heroImage.src=heroWork.work.image; heroImage.width=heroWork.work.width; heroImage.height=heroWork.work.height;
      heroImage.alt=altText(heroWork.work,heroWork.series);
      heroImage.closest("figure").querySelector("figcaption").innerHTML="<span>"+escapeHtml(heroWork.series.standalone ? "" : seriesTitle(heroWork.series))+"</span><span>"+escapeHtml(heroWork.work.title[lang]+" · "+heroWork.work.year)+"</span>";
      lede.textContent=heroWork.work.description[lang] || (heroWork.series.standalone ? "" : heroWork.series.statement[lang][0]);
    } else lede.textContent="";
    document.querySelectorAll('[data-unit]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.unit===units)));
    document.querySelector('.units').setAttribute('aria-label', {ru:'Единицы измерения',en:'Measurement units',es:'Unidades de medida'}[lang]);
    updateTheme();
    renderSeries();
    renderExhibitions();
    renderShop();
    updateCount();
    if (viewer.open && openWorkId) openViewer(openWorkId);
    if (requestDialog.open) renderRequest();
  }

  function renderSeries() {
    seriesRoot.innerHTML = '<p class="section-label">' + escapeHtml(t("series.label")) + "</p>"
      + SITE.series.map(renderOneSeries).join("");
  }

  function renderOneSeries(series) {
    const open = openSeries.has(series.id);
    const title = seriesTitle(series);
    const withLine = series.with
      ? '<p class="series-with">' + escapeHtml(tf("series.with", { name: series.with })) + "</p>"
      : "";
    const body = open
      ? '<div class="series-body" id="body-' + escapeHtml(series.id) + '">'
        + '<div class="statement"><p>' + escapeHtml(series.statement[lang][0]) + '</p>'
        + (series.statement[lang].length > 1 ? '<details><summary>' + escapeHtml(t("series.about")) + '</summary>'
        + series.statement[lang].slice(1).map(function (paragraph) {
          return "<p>" + escapeHtml(paragraph) + "</p>";
        }).join("") + '</details>' : '') + "</div>"
        + renderSlideshow(series) + "</div>"
      : '<div class="series-body" id="body-' + escapeHtml(series.id) + '" hidden></div>';
    return '<article class="series">'
      + '<h2 class="visually-hidden">' + escapeHtml(title) + "</h2>"
      + '<button type="button" class="series-toggle" data-series-toggle="' + escapeHtml(series.id) + '" aria-expanded="' + open + '" aria-controls="body-' + escapeHtml(series.id) + '">'
      + '<span class="series-index">' + escapeHtml(series.index) + "</span>"
      + '<span class="series-title">' + escapeHtml(title) + "</span>"
      + '<span class="series-count">' + escapeHtml(tf("series.count", { n: series.works.length })) + '<span class="series-indicator" aria-hidden="true">' + (open ? '−' : '+') + '</span></span>'
      + "</button>"
      + withLine
      + body
      + "</article>";
  }

  function renderSlideshow(series) {
    const count = series.works.length;
    if (!count) return "";
    const index = ((slideAt[series.id] || 0) % count + count) % count;
    return renderGallery(series.id, series.works, index, series);
  }

  function arrowIcon(previous) {
    return '<svg class="icon' + (previous ? ' icon-prev' : '') + '" aria-hidden="true"><use href="#icon-arrow"/></svg>';
  }

  function renderGallery(id, works, index, series) {
    if (!works.length) return "";
    const item = works[index];
    const title = item.title[lang];
    const thumbnails = works.map(function (work, thumbIndex) {
      return '<button type="button" class="slide-thumb" data-go="' + thumbIndex + '" data-slideshow="' + escapeHtml(id) + '" aria-label="' + escapeHtml(work.title[lang]) + '" aria-current="' + (thumbIndex === index) + '">'
        + '<img src="' + escapeHtml(work.thumbnail || work.image) + '" alt="" loading="lazy" width="' + work.width + '" height="' + work.height + '"></button>';
    }).join("");
    return '<div class="slideshow" data-slideshow="' + escapeHtml(id) + '" role="region" aria-roledescription="' + escapeHtml(t("slide.gallery")) + '" aria-label="' + escapeHtml(series ? seriesTitle(series) : t("shop.label")) + '" tabindex="0">'
      + '<div class="slide-frame" data-slideshow="' + escapeHtml(id) + '"><button type="button" class="work" data-open-work="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(t("slide.enlarge") + ': ' + title) + '">'
      + '<img src="' + escapeHtml(item.image) + '" width="' + item.width + '" height="' + item.height + '" alt="' + escapeHtml(title) + '" loading="lazy">'
      + "</button></div>"
      + '<div class="slide-bar"><p class="slide-caption" aria-live="polite" aria-atomic="true"><span class="work-name">' + escapeHtml(title) + '</span><span class="slide-position">' + pad(index + 1) + ' / ' + pad(works.length) + '</span></p>'
      + '<div class="slide-controls"><button type="button" class="slide-arrow" data-step="-1" data-slideshow="' + escapeHtml(id) + '" aria-label="' + escapeHtml(t("slide.prev")) + '">' + arrowIcon(true) + '</button>'
      + '<button type="button" class="slide-arrow" data-step="1" data-slideshow="' + escapeHtml(id) + '" aria-label="' + escapeHtml(t("slide.next")) + '">' + arrowIcon(false) + '</button></div></div>'
      + '<p class="work-description">'+escapeHtml(item.description[lang])+'</p>'
      + '<div class="slide-thumbnails" aria-label="' + escapeHtml(t("slide.thumbnails")) + '">' + thumbnails + '</div></div>';
  }

  function stepSlide(seriesId, delta, absoluteIndex, restoreFocus) {
    if (seriesId === "shop") {
      const count = shopEntries().length;
      if (!count) return;
      shopAt = absoluteIndex == null ? (shopAt + delta + count) % count : ((absoluteIndex % count) + count) % count;
      renderShop();
      if (restoreFocus !== false) focusGallery(shopRoot, seriesId, delta, absoluteIndex, shopAt);
      else revealThumbnail(shopRoot, seriesId);
      return;
    }
    const series = SITE.series.find(function (entry) { return entry.id === seriesId; });
    if (!series) return;
    const count = series.works.length;
    if (!count) return;
    const current = slideAt[seriesId] || 0;
    slideAt[seriesId] = absoluteIndex == null
      ? (current + delta + count) % count
      : ((absoluteIndex % count) + count) % count;
    const gallery = seriesRoot.querySelector('.slideshow[data-slideshow="' + seriesId + '"]');
    if (gallery) gallery.outerHTML = renderSlideshow(series);
    if (restoreFocus !== false) focusGallery(seriesRoot, seriesId, delta, absoluteIndex, slideAt[seriesId]);
    else revealThumbnail(seriesRoot, seriesId);
  }

  function focusGallery(root, seriesId, delta, absoluteIndex, index) {
    const focusSelector = absoluteIndex == null
      ? '[data-slideshow="' + seriesId + '"] [data-step="' + delta + '"]'
      : '[data-slideshow="' + seriesId + '"] [data-go="' + index + '"]';
    const focusTarget = root.querySelector(focusSelector);
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    revealThumbnail(root, seriesId);
  }

  function revealThumbnail(root, seriesId) {
    const active = root.querySelector('.slideshow[data-slideshow="' + seriesId + '"] [aria-current="true"]');
    if (active) {
      const strip = active.parentElement;
      strip.scrollLeft = Math.max(0, active.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2);
    }
  }

  function place(item) { return [item.venue[lang],item.city[lang]].filter(Boolean).join(", "); }
  function exhibitionPlaces(work) { return SITE.exhibitions.filter(e => e.workIds.includes(work.id)).map(place).filter(Boolean).join(" · "); }
  function renderExhibitions() {
    exhibitionsRoot.innerHTML='<p class="section-label">'+escapeHtml(t("exhibitions.label"))+"</p>"+SITE.exhibitions.map(function(item) {
      return '<article class="exhibition"><p>'+escapeHtml(item.startDate+(item.endDate && item.endDate!==item.startDate ? " — "+item.endDate : ""))+"</p><div><h3>"+escapeHtml(item.title[lang])+"</h3><p>"+escapeHtml(place(item))+"</p><p>"+escapeHtml(item.description[lang])+"</p>"+'<div class="exhibition-works">'+item.workIds.map(function(id) {const found=findWork(id);return found ? '<button type="button" class="text-link" data-open-work="'+escapeHtml(id)+'">'+escapeHtml(found.work.title[lang])+"</button>" : "";}).join("")+"</div></div></article>";
    }).join("");
  }

  function shopEntries() {
    return SITE.series.flatMap(function (series) {
      return series.works.filter(item => item.offers.length).map(function (item) { return { item: item, series: series }; });
    });
  }

  function renderShop() {
    const active = shopRoot.contains(document.activeElement) ? document.activeElement : null;
    const focusSelector = active && active.hasAttribute("data-add")
      ? '[data-add="' + active.dataset.add + '"][data-variant="' + active.dataset.variant + '"]'
      : active && active.hasAttribute("data-shop-size")
        ? '[data-shop-size="' + active.dataset.shopSize + '"]'
        : null;
    const previousStrip = shopRoot.querySelector(".slide-thumbnails");
    const stripScroll = previousStrip ? previousStrip.scrollLeft : 0;
    const items = shopEntries();
    if (!items.length) {
      shopRoot.innerHTML='<p class="section-label">'+escapeHtml(t("shop.label"))+'</p><p>'+escapeHtml(t("shop.note"))+'</p>';
      return;
    }
    shopAt=shopAt % items.length;
    const entry = items[shopAt];
    const selectedOffer = entry.item.offers.find(function (offer) { return offer.id === shopSize; }) || entry.item.offers[0];
    shopSize = selectedOffer.id;
    shopRoot.innerHTML = '<p class="section-label">' + escapeHtml(t("shop.label")) + "</p>"
      + '<div class="shop-heading"><h2>' + escapeHtml(t("shop.heading")) + '</h2><p class="shop-intro">' + escapeHtml(t("shop.intro")) + '</p></div>'
      + '<div class="shop-layout">' + renderGallery("shop", items.map(function (value) { return value.item; }), shopAt)
      + '<article class="shop-copy"><p class="eyebrow">' + escapeHtml([entry.series.standalone ? '' : seriesTitle(entry.series),entry.item.year].filter(Boolean).join(' / ')) + '</p>'
      + '<h3>' + escapeHtml(entry.item.title[lang]) + '</h3>'
      + '<p class="work-description">'+escapeHtml(entry.item.description[lang])+'</p><p class="exhibition-places">'+escapeHtml(exhibitionPlaces(entry.item))+'</p>'
      + '<div class="size-picker" role="group" aria-label="' + escapeHtml(t("shop.size")) + '">'
      + entry.item.offers.map(function (offer) {
        return '<button type="button" data-shop-size="' + escapeHtml(offer.id) + '" aria-pressed="' + (offer.id === shopSize) + '">' + escapeHtml(sizeText(offer.size)) + '</button>';
      }).join('') + '</div>'
      + '<div class="shop-selection" aria-live="polite">' + renderOffer(entry.item, selectedOffer) + '</div>'
      + '<p class="shop-note">' + escapeHtml(t("shop.note")) + '</p>'
      + '<a class="text-link shop-request" href="#shop" id="review-request">' + escapeHtml(t("request.review")) + '<span id="request-count" hidden>0</span>' + arrowIcon(false) + '</a>'
      + '</article></div>';
    shopRoot.querySelector(".slide-thumbnails").scrollLeft = stripScroll;
    updateCount();
    const focusTarget = focusSelector && shopRoot.querySelector(focusSelector);
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    shopRoot.querySelector("#review-request").addEventListener("click", function (event) {
      event.preventDefault();
      requestSent = false;
      openRequest();
    });
  }

  function renderOffer(item, itemOffer) {
    const inRequest = request.some(function (entry) {
      return entry.workId === item.id && entry.variantId === itemOffer.id;
    });
    const label = inRequest ? t("added") : t("add");
    return '<div class="offer"><div><span class="offer-size">' + escapeHtml(sizeText(itemOffer.size)) + "</span>"
      + '<span class="offer-price">' + escapeHtml(money(itemOffer.price)) + '</span></div>'
      + '<button type="button" class="solid" data-add="' + escapeHtml(item.id) + '" data-variant="' + escapeHtml(itemOffer.id) + '"'
      + ">" + escapeHtml(label) + "</button></div>";
  }

  function openViewer(workId) {
    const found = findWork(workId);
    if (!found) return;
    if (!viewer.open) {
      const originGallery = document.activeElement.closest(".slideshow");
      viewerOrigin = originGallery
        ? '.slideshow[data-slideshow="' + originGallery.dataset.slideshow + '"] [data-open-work="' + workId + '"]'
        : null;
    }
    openWorkId = workId;
    viewerBody.innerHTML = '<div class="viewer-layout"><img src="' + escapeHtml(found.work.image) + '" alt="'
      + escapeHtml(altText(found.work, found.series)) + '"><div class="viewer-copy"><div class="viewer-tools"><p class="eyebrow">'
      + escapeHtml(t("viewer.acquire")) + '</p><button type="button" class="icon-button" data-close-viewer>'
      + escapeHtml(t("close")) + "</button></div><h3>" + escapeHtml(found.work.title[lang]) + "</h3><p class=\"viewer-year\">"
      + escapeHtml([found.series.standalone ? "" : seriesTitle(found.series),found.series.with,found.work.year].filter(Boolean).join(" · "))
      + '</p><p>'+escapeHtml(found.work.description[lang])+'</p><p>'+escapeHtml(exhibitionPlaces(found.work))+'</p><div class="offers">' + found.work.offers.map(function (itemOffer) {
        return renderOffer(found.work, itemOffer);
      }).join("") + "</div></div></div>";
    if (!viewer.open) viewer.showModal();
  }

  function openRequest() {
    if (!requestDialog.open) requestOrigin = document.activeElement.id || "review-request";
    renderRequest();
    if (!requestDialog.open) requestDialog.showModal();
  }

  function renderRequest() {
    const items = request.map(function (entry) {
      const found = findWork(entry.workId);
      const itemOffer = found.work.offers.find(function (offer) { return offer.id === entry.variantId; });
      return "<li><div><strong>" + escapeHtml(found.work.title[lang]) + "</strong><div>"
        + escapeHtml(t("kind.print") + " · " + sizeText(itemOffer.size)) + "</div></div><div class=\"request-side\">"
        + ('<span class="qty"><button type="button" data-qty="-1" data-id="' + escapeHtml(entry.workId) + '" data-variant="' + escapeHtml(entry.variantId) + '">−</button><span>'
          + entry.qty + '</span><button type="button" data-qty="1" data-id="' + escapeHtml(entry.workId) + '" data-variant="' + escapeHtml(entry.variantId) + '">+</button></span>')
        + "<span>" + money(itemOffer.price * entry.qty) + "</span>"
        + '<button type="button" class="icon-button" data-remove="' + escapeHtml(entry.workId) + '" data-variant="' + escapeHtml(entry.variantId) + '">'
        + escapeHtml(t("remove")) + "</button></div></li>";
    }).join("");
    const form = requestSent
      ? '<p class="thanks">' + escapeHtml(tf("request.thanks", { email: SITE.email })) + "</p>"
      : request.length === 0
        ? '<p class="thanks">' + escapeHtml(t("request.empty")) + "</p>"
        : '<p class="request-total">' + escapeHtml(t("request.total")) + " " + money(total()) + "</p>"
          + '<form id="request-form" class="request-form">'
          + field("name", t("request.name"), "text", true)
          + field("email", t("request.email"), "email", true)
          + '<label>' + escapeHtml(t("request.note")) + '<textarea name="note"></textarea></label>'
          + '<p class="form-error" hidden>' + escapeHtml(t("request.invalid")) + "</p>"
          + '<button class="solid" type="submit">' + escapeHtml(t("request.send")) + "</button></form>";
    requestBody.innerHTML = '<div class="request-panel"><div class="request-head"><h2>'
      + escapeHtml(t("request.title")) + '</h2><button type="button" class="icon-button" data-close-request>'
      + escapeHtml(t("close")) + "</button></div><ul class=\"request-list\">" + items + "</ul>" + form + "</div>";
  }

  function field(name, label, type, required) {
    const inputType = type === "email" ? "text" : type;
    const extra = type === "email" ? ' inputmode="email" autocomplete="email"' : "";
    return "<label>" + escapeHtml(label)
      + '<input name="' + name + '" type="' + inputType + '"' + extra + (required ? " required" : "") + "></label>";
  }

  function addItem(workId, variantId) {
    const found = findWork(workId);
    if (!found) return;
    const itemOffer = found.work.offers.find(function (entry) { return entry.id === variantId; });
    if (!itemOffer) return;
    const existing = request.find(function (entry) { return entry.workId === workId && entry.variantId === variantId; });
    if (existing) {
      existing.qty += 1;
    } else {
      request.push({ workId: workId, variantId: variantId, qty: 1 });
    }
    requestSent = false;
    updateCount();
    renderShop();
    if (viewer.open) openViewer(workId);
    if (requestDialog.open) renderRequest();
  }

  function changeQty(workId, variantId, delta) {
    const existing = request.find(function (entry) { return entry.workId === workId && entry.variantId === variantId; });
    if (!existing) return;
    existing.qty += delta;
    if (existing.qty < 1) removeItem(workId, variantId);
    else renderRequest();
    updateCount();
    renderShop();
  }

  function removeItem(workId, variantId) {
    const index = request.findIndex(function (entry) { return entry.workId === workId && entry.variantId === variantId; });
    if (index >= 0) request.splice(index, 1);
    updateCount();
    renderShop();
    if (viewer.open && openWorkId) openViewer(openWorkId);
    if (requestDialog.open) renderRequest();
  }

  function updateCount() {
    const count = request.reduce(function (sum, entry) { return sum + entry.qty; }, 0);
    const countNode = shopRoot.querySelector("#request-count");
    if (countNode) {
      countNode.textContent = String(count);
      countNode.hidden = count === 0;
    }
  }

  function total() {
    return request.reduce(function (sum, entry) {
      const found = findWork(entry.workId);
      const itemOffer = found.work.offers.find(function (offer) { return offer.id === entry.variantId; });
      return sum + itemOffer.price * entry.qty;
    }, 0);
  }

  function findWork(id) {
    for (let i = 0; i < SITE.series.length; i += 1) {
      const series = SITE.series[i];
      const item = series.works.find(function (work) { return work.id === id; });
      if (item) return { work: item, series: series };
    }
    return null;
  }

  function seriesTitle(series) {
    return typeof series.title === "string" ? series.title : series.title[lang];
  }

  function altText(item, series) {
    return item.title[lang] + ", " + seriesTitle(series);
  }

  function sizeText(size) {
    const values = size.match(/[\d.]+/g);
    if (!values || values.length < 2) return size;
    const divisor = units === 'in' ? 2.54 : 1;
    const label = units === 'in' ? (lang === 'ru' ? 'дюйм' : 'in') : t('unit.cm');
    return Math.round(Number(values[0])/divisor)+' × '+Math.round(Number(values[1])/divisor)+' '+label;
  }

  function money(amount) {
    const locale = lang === "ru" ? "ru-RU" : lang === "es" ? "es-ES" : "en-GB";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: SITE.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function readPreference(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function writePreference(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function updateTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    document.querySelector("#theme-toggle").setAttribute("aria-label", t(dark ? "theme.light" : "theme.dark"));
    document.querySelector('meta[name="theme-color"]').content = dark ? "#191a18" : "#f5f2eb";
  }

  function t(key) {
    return SITE.strings[lang][key] || SITE.strings.en[key] || key;
  }

  function tf(key, vars) {
    return t(key).replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] == null ? "" : String(vars[name]);
    });
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}());
