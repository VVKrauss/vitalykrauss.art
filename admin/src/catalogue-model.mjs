import {defaultAbout} from './about.mjs';
import {socialIcon} from './social-icons.mjs';

export const LAYOUT_IDS = ['works', 'exhibitions', 'about', 'contact', 'shop'];
export const defaultLayout = () => LAYOUT_IDS.map(id => ({ id, enabled: true }));
export const defaultContact = () => ({ email: '', links: [] });
export const defaultHero = () => ({ intro: { en: '', ru: '', es: '' } });
export class ContentError extends Error {
  constructor(message, status = 400, code) { super(message); this.status = status;if(code)this.code=code; }
}

const fail = message => { throw new ContentError(message); };
const array = (value, limit = 2000) => Array.isArray(value) && value.length <= limit ? value : fail('Некорректный список или слишком много записей.');
const string = (value, limit = 12000) => typeof value === 'string' && value.length <= limit ? value.trim() : fail('Некорректный текст.');
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : fail('Некорректный идентификатор.');
const archived = value => value === true;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value >= .01 && value <= 10000 ? value : fail('Размер должен быть числом от 0,01 до 10000 см.');
const rounded = value => Math.round(value * 1000) / 1000;
function translated(value, required = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Нужен текст для языка.');
  const result = Object.fromEntries(['en', 'ru', 'es'].map(lang => [lang, string(value[lang] ?? '')]));
  if (required && !Object.values(result).some(Boolean)) fail('Укажите название хотя бы на одном языке.');
  return result;
}
function externalURL(value, { required = false } = {}) {
  const raw=string(value ?? '',2048);
  if(!raw){ if(required) fail('Укажите ссылку, начинающуюся с https:// или http://.'); return ''; }
  try { const url=new URL(raw);if(!['https:','http:'].includes(url.protocol) || url.username || url.password)fail('Ссылка должна начинаться с https:// или http://.');return url.href; }
  catch {fail('Укажите корректную ссылку, начинающуюся с https:// или http://.');}
}
const exhibitionURL = value => externalURL(value);
function unique(entries) {
  const ids = entries.map(entry => entry.id);
  if (new Set(ids).size !== ids.length) fail('Идентификаторы записей не должны повторяться.');
}
function date(value, required = false) {
  value = string(value, 10);
  if (!value && !required) return '';
  if (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 2200) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Укажите корректную дату выставки.');
  return value;
}

export function normalizeCatalogue(input, mediaRecords, { draft = false } = {}) {
  if (!input || typeof input !== 'object') fail('Каталог не передан.');
  const media = new Map(mediaRecords.map(item => [item.id, item]));
  const series = array(input.series).map(item => ({
    id: identifier(item.id), title: translated(item.title, !draft && !item.archived), description: translated(item.description),
    collaborator: string(item.collaborator ?? '', 200), archived: archived(item.archived),
  }));
  unique(series);
  if (series.some(item => ['shop', '__standalone'].includes(item.id))) fail('Этот идентификатор серии зарезервирован.');
  const seriesIds = new Set(series.map(item => item.id));
  const works = array(input.works).map(item => {
    const image = media.get(identifier(item.mediaId));
    if (!image) fail('Изображение работы не найдено. Загрузите файл.');
    const seriesId = item.seriesId || null;
    if (seriesId && !seriesIds.has(seriesId)) fail('Выбранная серия не найдена.');
    const ratio = image.width / image.height;
    const printDpi=item.printDpi ?? 300;
    if(typeof printDpi!=='number' || !Number.isFinite(printDpi) || printDpi<1 || printDpi>2400)fail('DPI должен быть числом от 1 до 2400.');
    const maxWidthCm = item.maxWidthCm == null || item.maxWidthCm === '' ? null : positive(item.maxWidthCm);
    const maxHeightCm = maxWidthCm ? rounded(maxWidthCm / ratio) : null;
    const sizes = array(item.sizes ?? [], 50).map(size => {
      const widthCm = positive(size.widthCm);
      const heightCm = positive(size.heightCm);
      if (!maxWidthCm) fail('Сначала укажите максимальный размер работы.');
      if (Math.abs(widthCm / heightCm / ratio - 1) > .005) fail('Размер должен сохранять пропорции изображения.');
      if (widthCm > maxWidthCm + .001 || heightCm > maxHeightCm + .01) fail('Размер не может превышать максимальный.');
      const price = size.price == null || size.price === '' ? null : size.price;
      if (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1000000 || Math.abs(price * 100 - Math.round(price * 100)) > .00001)) fail('Цена должна быть положительным числом с точностью до цента.');
      return { id: identifier(size.id), widthCm: rounded(widthCm), heightCm: rounded(widthCm / ratio), price };
    });
    unique(sizes);
    if (new Set(sizes.map(size => size.widthCm.toFixed(3))).size !== sizes.length) fail('Одинаковый размер не должен повторяться.');
    if (maxWidthCm && !sizes.some(size => Math.abs(size.widthCm - maxWidthCm) < .001)) {
      if (sizes.length >= 50) fail('Разрешено не более 50 размеров, включая максимальный.');
      let id = 'maximum';
      while (sizes.some(size => size.id === id)) id += '-1';
      sizes.push({ id, widthCm: rounded(maxWidthCm), heightCm: maxHeightCm, price: null });
    }
    sizes.sort((a, b) => b.widthCm - a.widthCm);
    return {
      id: identifier(item.id), title: translated(item.title, !draft && !item.archived), description: translated(item.description),
      year: string(item.year ?? '', 20), seriesId, mediaId: image.id,
      maxWidthCm, maxHeightCm, printDpi, sizes, archived: archived(item.archived),
    };
  });
  unique(works);
  const workIds = new Set(works.map(item => item.id));
  const exhibitions = array(input.exhibitions).map(item => {
    const selected = array(item.workIds, 2000).map(identifier);
    if (selected.some(id => !workIds.has(id))) fail('В выставке выбрана неизвестная работа.');
    if (new Set(selected).size !== selected.length) fail('Работа не должна повторяться в одной выставке.');
    const mediaIds=array(item.mediaIds ?? [],100).map(identifier);
    if(new Set(mediaIds).size!==mediaIds.length || mediaIds.some(id=>!media.has(id)))fail('Медиаматериал выставки не найден или добавлен повторно.');
    const startDate = date(item.startDate, !draft && !item.archived); const endDate = date(item.endDate ?? '');
    if (endDate && endDate < startDate) fail('Дата окончания не может быть раньше начала.');
    return {
      id: identifier(item.id), title: translated(item.title, !draft && !item.archived), description: translated(item.description),
      startDate, endDate, venue: translated(item.venue), city: translated(item.city), country:translated(item.country ?? {}), workIds: selected, mediaIds, url:exhibitionURL(item.url), archived: archived(item.archived),
    };
  });
  unique(exhibitions);
  for(const group of series){
    const linked=works.filter(w=>w.seriesId===group.id).map(w=>w.id);
    const ordered=array(input.series.find(s=>s.id===group.id).workIds ?? []).map(identifier);
    if(new Set(ordered).size!==ordered.length)fail('Работа не должна повторяться в серии.');
    group.workIds=[...ordered.filter(id=>linked.includes(id)),...linked.filter(id=>!ordered.includes(id))];
  }
  const source=input.about ?? defaultAbout();
  const avatarMediaId=source.avatarMediaId || null;
  if(avatarMediaId && !media.has(identifier(avatarMediaId)))fail('Аватар не найден. Загрузите изображение.');
  const about={name:translated(source.name),role:translated(source.role),intro:translated(source.intro),description:translated(source.description),avatarMediaId};
  const heroWorkId = input.heroWorkId || null;
  if (heroWorkId && !works.some(item => item.id === heroWorkId && !item.archived)) fail('Заглавная работа должна быть активной. Сначала выберите другую или выключите тумблер.');

  const heroSource = input.hero ?? defaultHero();
  if (typeof heroSource !== 'object' || Array.isArray(heroSource)) fail('Некорректные данные хедера.');
  const hero = { intro: translated(heroSource.intro) };

  const contactSource = input.contact ?? { ...defaultContact(), email: (input.about && typeof input.about.email === 'string') ? input.about.email : '' };
  if (typeof contactSource !== 'object' || Array.isArray(contactSource)) fail('Некорректные данные контактов.');
  const contactEmail = string(contactSource.email ?? '', 254);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) fail('Укажите корректную почту для связи.');
  const links = array(contactSource.links ?? [], 50).map(link => {
    const url = externalURL(link.url, { required: true });
    return { id: identifier(link.id), label: translated(link.label, true), url, icon: socialIcon(url) };
  });
  unique(links);
  const contact = { email: contactEmail, links };

  const layoutSource = input.layout == null ? defaultLayout() : array(input.layout, LAYOUT_IDS.length);
  const layout = layoutSource.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Некорректный раздел макета.');
    if (!LAYOUT_IDS.includes(entry.id)) fail('Неизвестный раздел макета.');
    if (typeof entry.enabled !== 'boolean') fail('Видимость раздела макета должна быть булевой.');
    return { id: entry.id, enabled: entry.enabled };
  });
  if (layout.length !== LAYOUT_IDS.length || new Set(layout.map(entry => entry.id)).size !== LAYOUT_IDS.length) {
    fail('Список разделов макета должен содержать каждый раздел ровно один раз.');
  }

  const activeSeriesIds = new Set(series.filter(item => !item.archived).map(item => item.id));
  const standaloneWorkIds = new Set(works.filter(item => !item.seriesId && !item.archived).map(item => item.id));
  const isValidOrderEntry = entry => entry.type === 'series' ? activeSeriesIds.has(entry.id) : standaloneWorkIds.has(entry.id);
  const submittedOrder = array(input.worksOrder ?? [], 4000).map(entry => {
    if (!entry || typeof entry !== 'object' || !['series', 'work'].includes(entry.type)) fail('Некорректный элемент порядка работ.');
    return { type: entry.type, id: identifier(entry.id) };
  });
  const seenOrderKeys = new Set();
  for (const entry of submittedOrder) {
    const key = `${entry.type}:${entry.id}`;
    if (seenOrderKeys.has(key)) fail('Элемент порядка работ не должен повторяться.');
    seenOrderKeys.add(key);
  }
  const keptOrder = submittedOrder.filter(isValidOrderEntry);
  const keptOrderKeys = new Set(keptOrder.map(entry => `${entry.type}:${entry.id}`));
  const missingSeries = series.filter(item => !item.archived && !keptOrderKeys.has(`series:${item.id}`)).map(item => ({ type: 'series', id: item.id }));
  const missingWorks = works.filter(item => !item.seriesId && !item.archived && !keptOrderKeys.has(`work:${item.id}`)).map(item => ({ type: 'work', id: item.id }));
  const worksOrder = [...keptOrder, ...missingSeries, ...missingWorks];

  return { heroWorkId, works, series, exhibitions, about, hero, contact, layout, worksOrder };
}

export function publicCatalogue(draft, mediaRecords, baseURL, publishedAt) {
  const media = new Map(mediaRecords.map(item => [item.id, item]));
  const series = draft.series.filter(item => !item.archived).map(({ archived, ...item }) => item);
  const seriesIds = new Set(series.map(item => item.id));
  const works = draft.works.filter(item => !item.archived).map(work => {
    const image = media.get(work.mediaId);
    return {
      id: work.id, title: work.title, description: work.description, year: work.year,
      seriesId: seriesIds.has(work.seriesId) ? work.seriesId : null,
      image: `${baseURL}/media/${image.id}/web.webp`, thumbnail: `${baseURL}/media/${image.id}/thumb.webp`,
      width: image.web_width, height: image.web_height,
      maxWidthCm: work.maxWidthCm, maxHeightCm: work.maxHeightCm, sizes: work.sizes,
    };
  });
  const ids = new Set(works.map(work => work.id));
  const exhibitions = draft.exhibitions.filter(item => !item.archived).map(({ archived, mediaIds, ...item }) => ({ ...item, url:item.url || '', workIds: item.workIds.filter(id => ids.has(id)), media:(mediaIds || []).map(id=>media.get(id)).filter(Boolean).map(image=>({image:`${baseURL}/media/${image.id}/web.webp`,thumbnail:`${baseURL}/media/${image.id}/thumb.webp`,width:image.web_width,height:image.web_height})) }));
  const about=draft.about ?? defaultAbout();
  const avatar=about.avatarMediaId && media.get(about.avatarMediaId);
  const publicAbout={name:about.name,role:about.role,intro:about.intro,description:about.description,avatar:avatar?`${baseURL}/media/${avatar.id}/web.webp`:null};
  series.forEach(group=>{group.workIds=(group.workIds || works.filter(w=>w.seriesId===group.id).map(w=>w.id)).filter(id=>ids.has(id));});
  const hero = draft.hero ?? defaultHero();
  const contact = draft.contact ?? defaultContact();
  const layout = draft.layout ?? defaultLayout();
  const worksOrder = (draft.worksOrder ?? []).filter(entry => entry.type === 'series' ? seriesIds.has(entry.id) : ids.has(entry.id));
  return {about:publicAbout, heroWorkId: ids.has(draft.heroWorkId) ? draft.heroWorkId : null, works, series, exhibitions, hero, contact, layout, worksOrder, publishedAt };
}
