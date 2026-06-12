// linkedin-people-grabber — readable source for the bookmarklet.
//
// Runs ONLY in your own browser, on a LinkedIn search-results page you are
// already viewing while logged in. It reads the people currently rendered on
// the page and copies them to your clipboard as a tab-separated table:
//
//     Name <TAB> Headline <TAB> Profile URL
//
// Paste that into a spreadsheet or data/referral-targets-people.md, pick who
// to message, and reach out manually. It does NOT page, loop, auto-scroll,
// message, connect, or call any API — it's a one-shot "copy what's on screen."
//
// To install: see linkedin-people-grabber.md for the one-line bookmarklet.
// To update the bookmarklet after editing this file: run
//     node make-bookmarklet.mjs
(() => {
  // LinkedIn ships several DOM variants; try each person-card container.
  const cards = [
    ...document.querySelectorAll(
      'li.reusable-search__result-container, div.entity-result, li.org-people-profile-card__profile-card-spacing, div.search-results__result-item'
    ),
  ];

  const seen = new Set();
  const rows = [];

  const pickText = (el, sels) => {
    for (const s of sels) {
      const n = el.querySelector(s);
      const t = n && n.innerText ? n.innerText.replace(/\s+/g, ' ').trim() : '';
      // LinkedIn repeats the name in an a11y span — drop "View X's profile" noise
      if (t && !/^View |’s profile$|connection$/i.test(t)) return t;
    }
    return '';
  };

  for (const card of cards) {
    const link = card.querySelector('a[href*="/in/"]');
    if (!link) continue;
    const url = link.href.split('?')[0];
    if (seen.has(url)) continue;
    seen.add(url);

    let name = pickText(card, [
      'span.entity-result__title-text a span[aria-hidden="true"]',
      '.entity-result__title-text a',
      '.org-people-profile-card__profile-title',
      'span[aria-hidden="true"]',
    ]);
    if (!name) name = link.innerText.replace(/\s+/g, ' ').trim();
    name = name.replace(/View .*?profile/i, '').trim();

    const headline = pickText(card, [
      '.entity-result__primary-subtitle',
      '.entity-result__summary',
      '.org-people-profile-card__profile-position',
      'div.t-14.t-black--light',
    ]);

    if (name) rows.push([name, headline, url]);
  }

  if (!rows.length) {
    alert(
      'linkedin-people-grabber: no people found on this page.\n\n' +
        'Open a LinkedIn People search (search → People tab), scroll so the ' +
        'results load, then click the bookmark again.'
    );
    return;
  }

  const tsv =
    'Name\tHeadline\tProfile URL\n' + rows.map((r) => r.join('\t')).join('\n');

  const done = () =>
    alert(`linkedin-people-grabber: copied ${rows.length} people to your clipboard.\n\nPaste into a spreadsheet or your tracker.`);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tsv).then(done, () => {
      console.log(tsv);
      alert('Clipboard blocked — the table was printed to the console (Cmd+Option+J) instead.');
    });
  } else {
    console.log(tsv);
    alert('Clipboard unavailable — table printed to the console (Cmd+Option+J).');
  }
})();
