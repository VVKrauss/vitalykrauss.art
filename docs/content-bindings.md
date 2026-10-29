# Published content bindings

Audited 29 October 2026. Artist content comes from the published About record; the draft remains private until Publish. EN/RU/ES use the existing translation fallback when a language is empty. If the field is empty in all languages, no old content is substituted.

| Studio field | Public destination |
| --- | --- |
| About / name | Hero name, About heading, page title, exhibition title suffix, logo accessible name, avatar alt |
| About / role | Hero eyebrow, About eyebrow, main meta description |
| About / introduction | Hero introductory paragraph and About introduction; main meta description |
| About / biography | About body; main meta description when introduction is absent |
| About / email | About contact label and mailto destination |
| About / avatar | Circular About portrait; supplied portrait remains the initial default until replacement |
| Work / hero toggle | Hero image; does not control whether the author's introduction is shown |
| Work / title, year, series | Hero image caption; work details and gallery/shop captions |
| Work / description | Work/gallery/shop/viewer descriptions; never substitutes for the artist introduction |
| Series / description | Series statement only |
| Exhibition / description, dates, venue, city, country, URL, works, photos | Exhibition list and detail, related shop places; request snapshots preserve the received details |

Public interface labels, shop headings/instructions, navigation, notifications and footer credit live in `js/i18n.js`; they are separate from the artist biography. Studio's interface is Russian. Private authentication account labels and passkey configuration are separate from published artist content.

Fix: removed the hero work/series paragraph fallback. Both author-introduction nodes are updated by the shared About renderer, including empty values and pages without a selected hero work. Verified through real Studio edits/publication in a temporary browser fixture, EN/RU/ES, distinct work descriptions, empty intro, no hero image, metadata, contact, biography and responsive widths. All four public tests pass. Production catalogue was not edited.
