(function () {
  const langButtons = document.querySelectorAll("[data-lang]");
  const seriesRoot = document.querySelector("#series");
  const exhibitionsRoot = document.querySelector("#exhibitions");
  const shopRoot = document.querySelector("#shop");
  const viewer = document.querySelector("#viewer");
  const viewerBody = document.querySelector("#viewer-body");
  const heroImage = document.querySelector("#hero-image");

  const openSeries = new Set();
  const slideAt = Object.create(null);
  const request = window.VKCart.items;
  let lang = readPreference("vk-lang") || "en";
  let units = readPreference("vk-units") === "in" ? "in" : "cm";
  let shopAt = 0;
  let shopSize = readPreference("vk-shop-size") || "standard";
  let touchStart = null, suppressClickUntil=0;
  let openWorkId = null;
  let viewerOrigin = null;

  if (!["en", "ru", "es"].includes(lang)) lang = "en";

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);

  document.addEventListener("touchstart", function (event) {
    if(event.target.closest('#viewer img') && event.touches.length===1){touchStart={id:'viewer',x:event.touches[0].clientX,y:event.touches[0].clientY};return;}
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
      suppressClickUntil=Date.now()+400;
      if(touchStart.id==='viewer')stepViewer(dx<0?1:-1);else stepSlide(touchStart.id, dx < 0 ? 1 : -1, null, false);
    }
    touchStart = null;
  }, { passive: true });
  document.addEventListener("touchcancel", function () { touchStart = null; }, { passive: true });
  viewer.addEventListener("click", onBackdrop);
  viewer.addEventListener("close", function () {
    openWorkId = null;
    const origin = viewerOrigin && document.querySelector(viewerOrigin);
    if (origin) origin.focus({ preventScroll: true });
  });


  let cataloguePending = false, catalogueRevision = '',catalogueFailed=false;
  render();
  async function refreshCatalogue() {
    if (cataloguePending) return;
    cataloguePending = true;renderStatus();
    try {
      const response = await fetch(window.STUDIO_URL+'/api/catalogue', {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error('Catalogue unavailable');
      const data = await response.json();
      if (!data.publishedAt || !Array.isArray(data.works) || !Array.isArray(data.series) || !Array.isArray(data.exhibitions)) throw new Error('Invalid catalogue');
      const revision = JSON.stringify(data);
      catalogueFailed=false;
      if (catalogueRevision === revision){renderStatus();return;}
      const normalized = normalizeCatalogue(data);
      Object.assign(SITE, normalized); catalogueRevision = revision;
      SITE.series.forEach(s => openSeries.add(s.id));
      if (openWorkId && !findWork(openWorkId)) viewer.close();
      const selectedWork=readPreference('vk-shop-work');shopAt=Math.max(0,shopEntries().findIndex(entry=>entry.item.id===selectedWork));shopSize=readPreference('vk-shop-size') || '';render();
    } catch (error) {catalogueFailed=true;renderStatus();console.warn('Catalogue refresh failed; will retry.',error.message);}
    finally { cataloguePending=false;renderStatus(); }
  }
  refreshCatalogue();
  window.addEventListener('focus', refreshCatalogue);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCatalogue(); });
  setInterval(() => { if (!document.hidden) refreshCatalogue(); }, 30000);

  function onClick(event) {
    if(event.target.closest('[data-retry-catalogue]')){refreshCatalogue();return;}
    if(Date.now()<suppressClickUntil && event.target.closest('.work,#viewer img')){event.preventDefault();return;}
    const unitButton = event.target.closest('[data-unit]');
    if (unitButton) {
      const withinViewer=Boolean(unitButton.closest('#viewer'));units=unitButton.dataset.unit;writePreference('vk-units',units);render();(withinViewer?viewerBody:shopRoot).querySelector(`[data-unit="${units}"]`)?.focus({preventScroll:true});return;
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
      shopSize = sizeButton.dataset.shopSize;writePreference('vk-shop-size',shopSize);
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

    const viewerStep=event.target.closest('[data-viewer-step]');if(viewerStep){stepViewer(Number(viewerStep.dataset.viewerStep));return;}
    const addButton = event.target.closest("[data-add]");
    if (addButton) {
      addItem(addButton.dataset.add, addButton.dataset.variant);
      return;
    }

    if (event.target.closest("[data-close-viewer]")) viewer.close();


  }

  window.addEventListener('cartchange',()=>{renderShop();if(viewer.open && openWorkId)openViewer(openWorkId);});
  function onKeydown(event) {
    if(viewer.open && ['ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();stepViewer(event.key==='ArrowRight'?1:-1);return;}
    const slideshow = event.target.closest("[data-slideshow]");
    if (!slideshow) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    stepSlide(slideshow.dataset.slideshow, event.key === "ArrowRight" ? 1 : -1);
  }

  function onBackdrop(event) {
    if (event.target === viewer) viewer.close();
  }

  function render() {
    document.documentElement.lang = lang;
    window.applyAuthor(SITE.about,lang);renderStatus();
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
      heroImage.closest("figure").querySelector("figcaption").innerHTML="<span>"+escapeHtml(heroWork.series.standalone ? "" : seriesTitle(heroWork.series))+"</span><span>"+escapeHtml([heroWork.work.title[lang],heroWork.work.year].filter(Boolean).join(" · "))+"</span>";
      lede.textContent=heroWork.work.description[lang] || (heroWork.series.standalone ? "" : heroWork.series.statement[lang][0]);
    } else lede.textContent="";
    document.querySelectorAll('[data-unit]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.unit===units)));
    window.VKCart.update(SITE.works,lang,units,Boolean(catalogueRevision));
    updateTheme();
    renderSeries();
    renderExhibitions();
    renderShop();
    updateCount();
    if (viewer.open && openWorkId) openViewer(openWorkId);

  }

  function renderStatus(){
    const node=document.querySelector('#catalogue-status');document.querySelector('#catalogue-content').hidden=!catalogueRevision;
    node.hidden=Boolean(catalogueRevision) && !catalogueFailed;
    if(node.hidden)return;
    const message=catalogueFailed?t(catalogueRevision?'catalogue.stale':'catalogue.error'):t('catalogue.loading');
    node.innerHTML='<p>'+escapeHtml(message)+'</p>'+(catalogueFailed?'<button type="button" class="ghost" data-retry-catalogue '+(cataloguePending?'disabled':'')+'>'+escapeHtml(t('catalogue.retry'))+'</button>':'');
  }
  function renderSeries() {
    seriesRoot.innerHTML = '<p class="section-label">' + escapeHtml(t("series.label")) + "</p>"
      + (SITE.series.length?SITE.series.map(renderOneSeries).join(""):(catalogueRevision?'<p>'+escapeHtml(t("catalogue.empty"))+"</p>":""));
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

  function place(item) { return window.exhibitionPlace(item,lang); }
  function exhibitionPlaces(work) { return SITE.exhibitions.filter(e => e.workIds.includes(work.id)).map(place).filter(Boolean).join(" · "); }
  function renderExhibitions() {
    const labels={more:t('exhibition.more'),link:t('exhibition.link')};
    exhibitionsRoot.innerHTML='<p class="section-label">'+escapeHtml(t('exhibitions.label'))+'</p>'+SITE.exhibitions.map(function(item) {
      const found=item.workIds.map(findWork).find(Boolean);
      const cover=found ? found.work.image : item.media?.[0]?.image;
      const href='exhibition.html?id='+encodeURIComponent(item.id);
      const url=exhibitionLink(item.url);
      return '<article class="exhibition '+(cover?'with-cover':'')+'">'+(cover?'<a class="exhibition-cover" href="'+href+'" aria-label="'+escapeHtml(item.title[lang])+'"><img src="'+escapeHtml(cover)+'" alt="'+escapeHtml(found?found.work.title[lang]:item.title[lang])+'" loading="lazy"></a>':'')
        +'<div><h3><a href="'+href+'">'+escapeHtml(item.title[lang])+'</a></h3><p class="exhibition-meta">'+escapeHtml(window.exhibitionMeta(item,lang))+'</p><p class="exhibition-summary">'+escapeHtml(item.description[lang])+'</p><div class="exhibition-links"><a class="text-link" href="'+href+'">'+labels.more+' '+arrowUpRight+'</a>'+(url?'<a class="text-link" href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+labels.link+' '+arrowUpRight+'</a>':'')+'</div></div></article>';
    }).join('');
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
    shopSize = selectedOffer.id;if(catalogueRevision){writePreference('vk-shop-work',entry.item.id);writePreference('vk-shop-size',shopSize);}
    shopRoot.innerHTML = '<p class="section-label">' + escapeHtml(t("shop.label")) + "</p>"
      + '<div class="shop-heading"><h2>' + escapeHtml(t("shop.heading")) + '</h2><p class="shop-intro">' + escapeHtml(t("shop.intro")) + '</p></div>'
      + '<div class="shop-layout">' + renderGallery("shop", items.map(function (value) { return value.item; }), shopAt)
      + '<article class="shop-copy"><p class="eyebrow">' + escapeHtml([entry.series.standalone ? '' : seriesTitle(entry.series),entry.item.year].filter(Boolean).join(' / ')) + '</p>'
      + '<h3>' + escapeHtml(entry.item.title[lang]) + '</h3>'
      + '<p class="work-description">'+escapeHtml(entry.item.description[lang])+'</p><p class="exhibition-places">'+escapeHtml(exhibitionPlaces(entry.item))+'</p>'
      + '<div class="size-tools"><span>'+escapeHtml(t('shop.size'))+'</span>'+unitControls()+'</div>'
      + '<div class="size-picker" role="group" aria-label="' + escapeHtml(t("shop.size")) + '">'
      + entry.item.offers.map(function (offer) {
        return '<button type="button" data-shop-size="' + escapeHtml(offer.id) + '" aria-pressed="' + (offer.id === shopSize) + '">' + escapeHtml(sizeText(offer.size)) + '</button>';
      }).join('') + '</div>'
      + '<div class="shop-selection" aria-live="polite">' + renderOffer(entry.item, selectedOffer) + '</div>'
      + '<p class="shop-note">' + escapeHtml(t("shop.note")) + '</p>'
      + '<a class="text-link shop-request" href="#shop" id="review-request">' + escapeHtml(t("request.review")) + '' + arrowIcon(false) + '</a>'
      + '</article></div>';
    shopRoot.querySelector(".slide-thumbnails").scrollLeft = stripScroll;
    updateCount();
    const focusTarget = focusSelector && shopRoot.querySelector(focusSelector);
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    shopRoot.querySelector("#review-request").addEventListener("click", function (event) {
      event.preventDefault();
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

  function stepViewer(delta){const found=findWork(openWorkId);if(!found)return;const list=viewerOrigin?.includes('shop')?shopEntries().map(entry=>entry.item):found.series.works;const at=list.findIndex(w=>w.id===openWorkId);if(list.length)openViewer(list[(at+delta+list.length)%list.length].id);}
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
    viewerBody.innerHTML = '<div class="viewer-gallery-controls"><button type="button" class="slide-arrow" data-viewer-step="-1" aria-label="'+escapeHtml(t('slide.prev'))+'">'+arrowIcon(true)+'</button><button type="button" class="slide-arrow" data-viewer-step="1" aria-label="'+escapeHtml(t('slide.next'))+'">'+arrowIcon(false)+'</button></div><div class="viewer-layout"><img src="' + escapeHtml(found.work.image) + '" alt="'
      + escapeHtml(altText(found.work, found.series)) + '"><div class="viewer-copy"><div class="viewer-tools"><p class="eyebrow">'
      + escapeHtml(t("viewer.acquire")) + '</p><button type="button" class="icon-button" data-close-viewer>'
      + escapeHtml(t("close")) + "</button></div><h3>" + escapeHtml(found.work.title[lang]) + "</h3><p class=\"viewer-year\">"
      + escapeHtml([found.series.standalone ? "" : seriesTitle(found.series),found.series.with,found.work.year].filter(Boolean).join(" · "))
      + '</p><p>'+escapeHtml(found.work.description[lang])+'</p><p>'+escapeHtml(exhibitionPlaces(found.work))+'</p>'+(found.work.offers.length?'<div class="size-tools"><span>'+escapeHtml(t('shop.size'))+'</span>'+unitControls()+'</div>':'')+'<div class="offers">' + found.work.offers.map(function (itemOffer) {
        return renderOffer(found.work, itemOffer);
      }).join("") + "</div></div></div>";
    if (!viewer.open) viewer.showModal();
  }

  function openRequest(){window.VKCart.open();}
  function addItem(workId,variantId){window.VKCart.add(workId,variantId);renderShop();if(viewer.open)openViewer(workId);}
  function updateCount(){window.VKCart.render();}
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

  function unitControls() {
    const label=t('units.label');
    return '<div class="measurement-units" role="group" aria-label="'+label+'"><button type="button" data-unit="cm" aria-pressed="'+(units==='cm')+'">cm</button><span aria-hidden="true">|</span><button type="button" data-unit="in" aria-pressed="'+(units==='in')+'">in</button></div>';
  }

  function sizeText(size) {
    const values = size.match(/[\d.]+/g);
    if (!values || values.length < 2) return size;
    const divisor = units === 'in' ? 2.54 : 1;
    const label = units;
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
    return window.I18N.t(key,lang);
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
