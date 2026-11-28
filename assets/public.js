/* Tea Craft public site: live menu (photos, names, descriptions), shop details, announcement, newsletter.
   Data comes from Supabase (see docs). If it can't be reached, the built-in menu in the page is shown.
   Selling and booking are switched off for now; the original code is kept in the backend docs (removed-features). */
(function () {
  'use strict';
  const $ = (q, r = document) => r.querySelector(q), $$ = (q, r = document) => [...r.querySelectorAll(q)];
  const money = n => '$' + Number(n).toFixed(2);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^(https:\/\/|assets\/|\/)/.test(u || '') ? u : '';
  const CFG = window.TC_CONFIG || {};
  const sb = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  let site = { email: 'teacraftnz@gmail.com', show_prices: false };
  const CAT = {
    milk: { bg: 'linear-gradient(135deg,#d9c9ee,#f0e5f4)', cup: 'linear-gradient(90deg,#9b7ab7,#c4a9d6,#8f6ca9)', e: '💜' },
    fruit: { bg: 'linear-gradient(135deg,#f7d08e,#f8e8b8)', cup: 'linear-gradient(90deg,#e9a03c,#f7cf70,#df8e2d)', e: '🥭' },
    matcha: { bg: 'linear-gradient(135deg,#c5dfb8,#eaf0c9)', cup: 'linear-gradient(90deg,#718c51,#b6c88b,#69864b)', e: '🍵' },
    dessert: { bg: 'linear-gradient(135deg,#f2d2c0,#f8e6dc)', cup: 'linear-gradient(90deg,#8c5a43,#c08a6a,#7a4a36)', e: '🍫' }
  };
  function cardHTML(m) {
    const img = safeUrl(m.image_url), c = CAT[m.category] || CAT.milk, sold = m.is_available === false;
    const tag = m.badge ? `<span class="tag">${esc(m.badge)}</span>` : '';
    const visual = img
      ? `<div class="drink-visual photo">${tag}<img src="${esc(img)}" alt="${esc(m.name)}" loading="lazy" width="400" height="400"></div>`
      : `<div class="drink-visual" style="background:${c.bg}">${tag}<div class="straw-mini"></div><div class="cup-mini" style="background:${c.cup}"></div><span class="boba-mini">${c.e}</span></div>`;
    const bottom = (site.show_prices || sold) ? `<div class="drink-bottom">${site.show_prices ? `<span class="price">${money(m.price)}</span>` : '<span></span>'}${sold ? '<span class="tag" style="position:static;background:#e2f1f8">Sold out</span>' : ''}</div>` : '';
    return `<div class="drink-card${sold ? ' soldout' : ''}" data-cat="${esc(m.category)}">${visual}<div class="drink-info"><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p>${bottom}</div></div>`;
  }
  function applySite() {
    const addr = String(site.address || '').split('\n').map(esc).join('<br>'), box = $('#siteContact');
    if (box) box.innerHTML = [addr, '<br>' + esc(site.hours_text || ''), site.phone ? `<a href="tel:${esc(String(site.phone).replace(/[^+\d]/g, ''))}">${esc(site.phone)}</a>` : '', `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`].filter(Boolean).join('<br>');
    const soc = $('#siteSocials');
    if (soc) {
      const defs = [['instagram_url', '◎', 'Instagram'], ['tiktok_url', '♪', 'TikTok'], ['facebook_url', 'f', 'Facebook']];
      soc.innerHTML = defs.filter(d => /^https:\/\//.test(site[d[0]] || '')).map(d => `<a href="${esc(site[d[0]])}" target="_blank" rel="noopener" aria-label="${d[2]}">${d[1]}</a>`).join(''); soc.hidden = !soc.innerHTML;
    }
    const an = $('#announce');
    if (an) { an.textContent = site.announcement_enabled ? site.announcement_text : ''; an.hidden = !(site.announcement_enabled && site.announcement_text); }
  }
  async function load() {
    if (!sb) { document.documentElement.dataset.shop = 'basic'; return; }
    let live = false;
    try {
      const [si, mi] = await Promise.all([
        sb.from('site_info').select('*').eq('id', 1).single(),
        sb.from('menu_items').select('*').eq('is_active', true).order('sort_order').order('created_at')]);
      if (si.error || mi.error) throw (si.error || mi.error);
      site = Object.assign(site, si.data);
      if (mi.data.length) $('#drinkGrid').innerHTML = mi.data.map(cardHTML).join('');
      live = true;
    } catch (err) { console.warn('Tea Craft: could not reach the database, showing the built-in menu.', err); }
    applySite(); document.documentElement.dataset.shop = live ? 'live' : 'basic';
  }
  $$('.chip').forEach(c => c.onclick = () => {
    $$('.chip').forEach(x => x.setAttribute('aria-pressed', x === c));
    $$('#drinkGrid .drink-card').forEach(d => d.hidden = c.dataset.f !== 'all' && d.dataset.cat !== c.dataset.f);
  });
  const nl = $('#newsletter'), EMAIL = /^\S+@\S+\.\S+$/;
  if (nl) nl.onsubmit = async e => {
    e.preventDefault(); const em = $('#newsletter-email').value.trim(); if (nl.elements['bot-field'] && nl.elements['bot-field'].value) return;
    if (!EMAIL.test(em)) return notify('Enter a valid email address to join.');
    if (sb) { const { error } = await sb.rpc('subscribe', { p_email: em }); if (!error) { nl.reset(); return notify('You’re in! Welcome to the Kawaii club ✿'); } if (/Too many/.test(error.message)) return notify(error.message); }
    location.href = 'mailto:' + site.email + '?subject=' + encodeURIComponent('Join the Kawaii club') + '&body=' + encodeURIComponent('Please add me to the Kawaii club: ' + em);
    notify('Send the email that just opened to finish joining ✿');
  };
  applySite(); load();
})();
