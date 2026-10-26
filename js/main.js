(function () {
  const langButtons = document.querySelectorAll("[data-lang]");
  const seriesRoot = document.querySelector("#series");
  const exhibitionsRoot = document.querySelector("#exhibitions");
  const shopRoot = document.querySelector("#shop");
  const viewer = document.querySelector("#viewer");
  const viewerBody = document.querySelector("#viewer-body");
  const requestDialog = document.querySelector("#request-dialog");
  const requestBody = document.querySelector("#request-body");
  const countNode = document.querySelector("#request-count");
  const heroImage = document.querySelector("#hero-image");

  const openSeries = new Set(["insecterra", "with-yudochkina"]);
  const request = [];
  let lang = localStorage.getItem("vk-lang") || "en";
  let openWorkId = null;
  let requestSent = false;

  if (!["en", "ru", "es"].includes(lang)) lang = "en";

  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  viewer.addEventListener("click", onBackdrop);
  requestDialog.addEventListener("click", onBackdrop);
  viewer.addEventListener("close", function () { openWorkId = null; });

  render();

  function onClick(event) {
    const langButton = event.target.closest("[data-lang]");
    if (langButton) {
      lang = langButton.dataset.lang;
      localStorage.setItem("vk-lang", lang);
      render();
      return;
    }

    const seriesButton = event.target.closest("[data-series-toggle]");
    if (seriesButton) {
      const id = seriesButton.dataset.seriesToggle;
      if (openSeries.has(id)) openSeries.delete(id);
      else openSeries.add(id);
      renderSeries();
      return;
    }

    const workButton = event.target.closest("[data-open-work]");
    if (workButton) {
      openViewer(workButton.dataset.openWork);
      return;
    }

    const addButton = event.target.closest("[data-add]");
    if (addButton) {
      addItem(addButton.dataset.add, addButton.dataset.kind);
      return;
    }

    if (event.target.closest("#open-request")) {
      requestSent = false;
      openRequest();
      return;
    }

    if (event.target.closest("[data-close-viewer]")) viewer.close();
    if (event.target.closest("[data-close-request]")) requestDialog.close();

    const qtyButton = event.target.closest("[data-qty]");
    if (qtyButton) {
      changeQty(qtyButton.dataset.id, qtyButton.dataset.kind, Number(qtyButton.dataset.qty));
      return;
    }

    if (event.target.closest("[data-remove]")) {
      removeItem(event.target.closest("[data-remove]").dataset.remove, event.target.closest("[data-remove]").dataset.kind);
    }
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
      const offer = found.work.offers.find(function (entry) { return entry.kind === item.kind; });
      return [
        found.work.title[lang],
        t("kind." + item.kind),
        offer.size,
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
    request.length = 0;
    requestSent = true;
    updateCount();
    renderRequest();
    window.location.href = href;
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
    const heroWork = findWork("snail");
    heroImage.alt = altText(heroWork.work, heroWork.series);
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
      ? '<div class="series-body" id="body-' + series.id + '">'
        + '<div class="statement">' + series.statement[lang].map(function (paragraph) {
          return "<p>" + escapeHtml(paragraph) + "</p>";
        }).join("") + "</div>"
        + '<div class="works">' + series.works.map(function (item, index) {
          return renderWorkButton(item, series, index);
        }).join("") + "</div></div>"
      : '<div class="series-body" id="body-' + series.id + '" hidden></div>';
    return '<article class="series">'
      + '<h2 class="visually-hidden">' + escapeHtml(title) + "</h2>"
      + '<button type="button" class="series-toggle" data-series-toggle="' + series.id + '" aria-expanded="' + open + '" aria-controls="body-' + series.id + '">'
      + '<span class="series-index">' + series.index + "</span>"
      + '<span class="series-title">' + escapeHtml(title) + "</span>"
      + '<span class="series-count">' + escapeHtml(tf("series.count", { n: series.works.length })) + "</span>"
      + "</button>"
      + withLine
      + body
      + "</article>";
  }

  function renderWorkButton(item, series, index) {
    return '<button type="button" class="work" data-open-work="' + item.id + '">'
      + '<img src="' + item.image + '" width="' + item.width + '" height="' + item.height + '" alt="' + escapeHtml(altText(item, series)) + '">'
      + '<span class="work-meta"><span class="work-index">' + pad(index + 1) + '</span><span class="work-name">' + escapeHtml(item.title[lang]) + "</span></span>"
      + "</button>";
  }

  function renderExhibitions() {
    exhibitionsRoot.innerHTML = '<p class="section-label">' + escapeHtml(t("exhibitions.label")) + "</p>"
      + SITE.exhibitions.map(function (item) {
        return '<article class="exhibition"><p>' + item.year + "</p><div><h3>"
          + escapeHtml(item.title[lang]) + "</h3><p>"
          + escapeHtml(item.venue[lang] + ", " + item.city[lang]) + "</p></div></article>";
      }).join("");
  }

  function renderShop() {
    const items = SITE.series.flatMap(function (series) {
      return series.works.map(function (item) { return { item: item, series: series }; });
    });
    shopRoot.innerHTML = '<p class="section-label">' + escapeHtml(t("shop.label")) + "</p>"
      + '<p class="shop-intro">' + escapeHtml(t("shop.intro")) + "</p>"
      + items.map(function (entry) {
        return '<article class="shop-item">'
          + '<button type="button" class="shop-thumb" data-open-work="' + entry.item.id + '">'
          + '<img src="' + entry.item.image + '" alt="' + escapeHtml(altText(entry.item, entry.series)) + '">'
          + "</button><div class=\"shop-copy\"><h3>" + escapeHtml(entry.item.title[lang]) + "</h3>"
          + '<p class="shop-series">' + escapeHtml(seriesTitle(entry.series)) + "</p>"
          + '<div class="offers">' + entry.item.offers.map(function (itemOffer) {
            return renderOffer(entry.item, itemOffer);
          }).join("") + "</div></div></article>";
      }).join("");
  }

  function renderOffer(item, itemOffer) {
    const sold = itemOffer.status === "sold";
    const inRequest = request.some(function (entry) {
      return entry.workId === item.id && entry.kind === itemOffer.kind;
    });
    const label = sold ? t("status.sold") : inRequest ? t("added") : t("add");
    return '<div class="offer"><span class="offer-kind">' + escapeHtml(t("kind." + itemOffer.kind)) + "</span>"
      + "<span>" + escapeHtml(itemOffer.size) + "</span>"
      + "<span>" + escapeHtml(itemOffer.edition === 1 ? t("unique") : tf("edition", { n: itemOffer.edition })) + "</span>"
      + "<span>" + money(itemOffer.price) + "</span>"
      + '<button type="button" class="' + (sold ? "ghost" : "solid") + '" data-add="' + item.id + '" data-kind="' + itemOffer.kind + '"'
      + (sold ? " disabled" : "") + ">" + escapeHtml(label) + "</button></div>";
  }

  function openViewer(workId) {
    const found = findWork(workId);
    if (!found) return;
    openWorkId = workId;
    viewerBody.innerHTML = '<div class="viewer-layout"><img src="' + found.work.image + '" alt="'
      + escapeHtml(altText(found.work, found.series)) + '"><div class="viewer-copy"><div class="viewer-tools"><p class="eyebrow">'
      + escapeHtml(t("viewer.acquire")) + '</p><button type="button" class="icon-button" data-close-viewer>'
      + escapeHtml(t("close")) + "</button></div><h3>" + escapeHtml(found.work.title[lang]) + "</h3><p class=\"viewer-year\">"
      + escapeHtml(seriesTitle(found.series) + (found.series.with ? " · " + found.series.with : "") + " · " + found.work.year)
      + '</p><div class="offers">' + found.work.offers.map(function (itemOffer) {
        return renderOffer(found.work, itemOffer);
      }).join("") + "</div></div></div>";
    if (!viewer.open) viewer.showModal();
  }

  function openRequest() {
    renderRequest();
    if (!requestDialog.open) requestDialog.showModal();
  }

  function renderRequest() {
    const items = request.map(function (entry) {
      const found = findWork(entry.workId);
      const itemOffer = found.work.offers.find(function (offer) { return offer.kind === entry.kind; });
      const painting = entry.kind === "painting";
      return "<li><div><strong>" + escapeHtml(found.work.title[lang]) + "</strong><div>"
        + escapeHtml(t("kind." + entry.kind) + " · " + itemOffer.size) + "</div></div><div>"
        + (painting ? "" : '<span class="qty"><button type="button" data-qty="-1" data-id="' + entry.workId + '" data-kind="' + entry.kind + '">−</button><span>'
          + entry.qty + '</span><button type="button" data-qty="1" data-id="' + entry.workId + '" data-kind="' + entry.kind + '">+</button></span> ')
        + money(itemOffer.price * entry.qty)
        + ' <button type="button" class="icon-button" data-remove="' + entry.workId + '" data-kind="' + entry.kind + '">'
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
    return "<label>" + escapeHtml(label)
      + '<input name="' + name + '" type="' + type + '"' + (required ? " required" : "") + "></label>";
  }

  function addItem(workId, kind) {
    const found = findWork(workId);
    const itemOffer = found.work.offers.find(function (entry) { return entry.kind === kind; });
    if (!itemOffer || itemOffer.status === "sold") return;
    const existing = request.find(function (entry) { return entry.workId === workId && entry.kind === kind; });
    if (existing) {
      if (kind === "print") existing.qty += 1;
    } else {
      request.push({ workId: workId, kind: kind, qty: 1 });
    }
    requestSent = false;
    updateCount();
    renderShop();
    if (viewer.open) openViewer(workId);
    if (requestDialog.open) renderRequest();
  }

  function changeQty(workId, kind, delta) {
    const existing = request.find(function (entry) { return entry.workId === workId && entry.kind === kind; });
    if (!existing || kind === "painting") return;
    existing.qty += delta;
    if (existing.qty < 1) removeItem(workId, kind);
    else renderRequest();
    updateCount();
    renderShop();
  }

  function removeItem(workId, kind) {
    const index = request.findIndex(function (entry) { return entry.workId === workId && entry.kind === kind; });
    if (index >= 0) request.splice(index, 1);
    updateCount();
    renderShop();
    if (viewer.open && openWorkId) openViewer(openWorkId);
    if (requestDialog.open) renderRequest();
  }

  function updateCount() {
    const count = request.reduce(function (sum, entry) { return sum + entry.qty; }, 0);
    countNode.textContent = String(count);
    countNode.hidden = count === 0;
  }

  function total() {
    return request.reduce(function (sum, entry) {
      const found = findWork(entry.workId);
      const itemOffer = found.work.offers.find(function (offer) { return offer.kind === entry.kind; });
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

  function money(amount) {
    const locale = lang === "ru" ? "ru-RU" : lang === "es" ? "es-ES" : "en-GB";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: SITE.currency,
      maximumFractionDigits: 0
    }).format(amount);
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
