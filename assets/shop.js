/* Tea Craft storefront: live menu, ordering, mock Stripe payment, bookings, newsletter.
   Data comes from Supabase (see supabase/schema.sql). Without config it falls back to the built-in menu. */
(function () {
  'use strict';
  const $ = (q, r = document) => r.querySelector(q), $$ = (q, r = document) => [...r.querySelectorAll(q)];
  const money = n => '$' + Number(n).toFixed(2);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^(https:\/\/|assets\/|\/)/.test(u || '') ? u : '';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const CFG = window.TC_CONFIG || {};
  const sb = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  let backend = false;
  let site = { email: 'teacraftnz@gmail.com', payments_mode: 'mock', ordering_enabled: true, open_hour: 10, close_hour: 19, hours_text: 'Every day · 10am–7pm' };
  let addons = { sizes: [{ name: 'Large', price: 1 }], toppings: [{ name: 'Boba pearls', price: .8 }, { name: 'Cheese foam', price: 1.2 }, { name: 'Popcorn', price: 1 }] };

  /* ---------- sheets: scroll lock + focus trap ---------- */
  const scrim = $('#scrim'), opt = $('#opt'), cartEl = $('#cart'), payEl = $('#payModal');
  let last = null, activeSheet = null;
  function openSheet(el) {
    last = document.activeElement; activeSheet = el;
    scrim.classList.add('on'); el.classList.add('on'); document.documentElement.classList.add('lock');
    setTimeout(() => ($('input:not([type=hidden]),select,button:not(.close)', el) || el).focus(), 60);
  }
  function closeAll() {
    [opt, cartEl, payEl].forEach(e => e.classList.remove('on'));
    scrim.classList.remove('on'); document.documentElement.classList.remove('lock'); activeSheet = null;
    if (last && document.contains(last)) last.focus();
  }
  scrim.onclick = closeAll; $$('[data-close]').forEach(b => b.onclick = closeAll);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeSheet) closeAll();
    if (e.key === 'Tab' && activeSheet) {
      const f = $$('a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea', activeSheet).filter(x => x.offsetParent !== null);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      else if (!activeSheet.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    }
  });

  /* ---------- load data ---------- */
  const CAT = {
    milk: { bg: 'linear-gradient(135deg,#d9c9ee,#f0e5f4)', cup: 'linear-gradient(90deg,#9b7ab7,#c4a9d6,#8f6ca9)', e: '💜' },
    fruit: { bg: 'linear-gradient(135deg,#f7d08e,#f8e8b8)', cup: 'linear-gradient(90deg,#e9a03c,#f7cf70,#df8e2d)', e: '🥭' },
    matcha: { bg: 'linear-gradient(135deg,#c5dfb8,#eaf0c9)', cup: 'linear-gradient(90deg,#718c51,#b6c88b,#69864b)', e: '🍵' },
    dessert: { bg: 'linear-gradient(135deg,#f2d2c0,#f8e6dc)', cup: 'linear-gradient(90deg,#8c5a43,#c08a6a,#7a4a36)', e: '🍫' }
  };
  function cardHTML(m) {
    const img = safeUrl(m.image_url), c = CAT[m.category] || CAT.milk, sold = m.is_available === false;
    const visual = img
      ? `<div class="drink-visual photo">${m.badge ? `<span class="tag">${esc(m.badge)}</span>` : ''}<img src="${esc(img)}" alt="${esc(m.name)}" loading="lazy" width="400" height="400"></div>`
      : `<div class="drink-visual" style="background:${c.bg}">${m.badge ? `<span class="tag">${esc(m.badge)}</span>` : ''}<div class="straw-mini"></div><div class="cup-mini" style="background:${c.cup}"></div><span class="boba-mini">${c.e}</span></div>`;
    const btn = sold ? `<span class="tag" style="position:static;background:#e2f1f8">Sold out</span>`
      : `<button class="add" data-item="${esc(m.name)}" data-id="${esc(m.id)}" data-price="${m.price}" aria-label="Customise and add ${esc(m.name)}">＋</button>`;
    return `<div class="drink-card${sold ? ' soldout' : ''}" data-cat="${esc(m.category)}">${visual}<div class="drink-info"><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p><div class="drink-bottom"><span class="price">From ${money(m.price)}</span>${btn}</div></div></div>`;
  }
  function applySite() {
    const addr = String(site.address || '').split('\n').map(esc).join('<br>');
    const box = $('#siteContact');
    if (box) box.innerHTML = [addr, '<br>' + esc(site.hours_text || ''), site.phone ? `<a href="tel:${esc(String(site.phone).replace(/[^+\d]/g, ''))}">${esc(site.phone)}</a>` : '', `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`].filter(Boolean).join('<br>');
    const soc = $('#siteSocials');
    if (soc) {
      const defs = [['instagram_url', '◎', 'Instagram'], ['tiktok_url', '♪', 'TikTok'], ['facebook_url', 'f', 'Facebook']];
      soc.innerHTML = defs.filter(d => /^https:\/\//.test(site[d[0]] || '')).map(d => `<a href="${esc(site[d[0]])}" target="_blank" rel="noopener" aria-label="${d[2]}">${d[1]}</a>`).join('');
      soc.hidden = !soc.innerHTML;
    }
    const an = $('#announce');
    if (an) { an.textContent = site.announcement_enabled ? site.announcement_text : ''; an.hidden = !(site.announcement_enabled && site.announcement_text); }
    buildSlots(); renderCart();
  }
  async function load() {
    if (!sb) { document.documentElement.dataset.shop = 'basic'; return; }
    try {
      const [si, mi, ad] = await Promise.all([
        sb.from('site_info').select('*').eq('id', 1).single(),
        sb.from('menu_items').select('*').eq('is_active', true).order('sort_order').order('created_at'),
        sb.from('addons').select('*').eq('is_active', true).order('sort_order')]);
      if (si.error || mi.error || ad.error) throw (si.error || mi.error || ad.error);
      site = Object.assign(site, si.data);
      addons = { sizes: ad.data.filter(a => a.kind === 'size'), toppings: ad.data.filter(a => a.kind === 'topping') };
      $('#drinkGrid').innerHTML = mi.data.map(cardHTML).join('');
      backend = true;
      reconcileCart(mi.data);
    } catch (err) { console.warn('Tea Craft: could not reach the database, showing the built-in menu.', err); }
    renderOpts(); applySite(); document.documentElement.dataset.shop = backend ? 'live' : 'basic';
  }

  // Carts saved earlier (or started before the live menu arrived) are matched to current menu items and prices.
  function reconcileCart(menu) {
    const sizeP = n => (addons.sizes.find(x => x.name === n) || { price: 0 }).price;
    cart = cart.filter(l => {
      const m = menu.find(x => (l.id ? x.id === l.id : x.name === l.name));
      if (!m || m.is_available === false) return false;
      l.id = m.id; l.unit = Number(m.price) + (l.size !== 'Regular' ? sizeP(l.size) : 0) + l.tops.reduce((a, t) => a + ((addons.toppings.find(x => x.name === t) || { price: 0 }).price), 0);
      return true;
    });
    pending = null; saveCart(); renderCart();
  }

  /* ---------- filters ---------- */
  $$('.chip').forEach(c => c.onclick = () => {
    $$('.chip').forEach(x => x.setAttribute('aria-pressed', x === c));
    $$('#drinkGrid .drink-card').forEach(d => d.hidden = c.dataset.f !== 'all' && d.dataset.cat !== c.dataset.f);
  });

  /* ---------- options modal ---------- */
  let cur = null, qty = 1;
  function renderOpts() {
    $('#sizeOpts').innerHTML = '<label class="opt"><input type="radio" name="size" value="Regular" data-p="0" checked><span>Regular</span></label>' +
      addons.sizes.map(s => `<label class="opt"><input type="radio" name="size" value="${esc(s.name)}" data-p="${s.price}"><span>${esc(s.name)} +${money(s.price)}</span></label>`).join('');
    $('#sizeSet').hidden = !addons.sizes.length;
    $('#topOpts').innerHTML = addons.toppings.map(t => `<label class="opt"><input type="checkbox" name="top" value="${esc(t.name)}" data-p="${t.price}"><span>${esc(t.name)} +${money(t.price)}</span></label>`).join('');
    $('#topSet').hidden = !addons.toppings.length;
  }
  const unit = () => cur.price + $$('[name=size]:checked,[name=top]:checked', opt).reduce((a, i) => a + Number(i.dataset.p || 0), 0);
  const refresh = () => { $('#qv').textContent = qty; $('#optAdd').textContent = 'Add to order · ' + money(unit() * qty); };
  $('#drinkGrid').addEventListener('click', e => {
    const b = e.target.closest('.add'); if (!b) return;
    cur = { id: b.dataset.id || null, name: b.dataset.item, price: Number(b.dataset.price) }; qty = 1;
    $('#optTitle').textContent = cur.name;
    $$('#opt input').forEach(i => i.checked = i.defaultChecked); refresh(); openSheet(opt);
  });
  opt.addEventListener('change', refresh);
  $('#qm').onclick = () => { qty = Math.max(1, qty - 1); refresh(); };
  $('#qp').onclick = () => { qty = Math.min(20, qty + 1); refresh(); };
  $('#optAdd').onclick = () => {
    const tops = $$('[name=top]:checked', opt).map(t => t.value), size = $('[name=size]:checked', opt).value, sweet = $('[name=sweet]:checked', opt).value;
    const key = [cur.id || cur.name, size, sweet, tops.join()].join('|'), ex = cart.find(i => i.key === key);
    ex ? ex.qty = Math.min(20, ex.qty + qty) : cart.push({ key, id: cur.id, name: cur.name, size, sweet, tops, unit: unit(), qty });
    pending = null; saveCart(); renderCart(); closeAll(); notify(cur.name + ' added to your order ♡');
    const cb = $('#cartBtn'); cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump');
  };

  /* ---------- cart ---------- */
  let cart = [], pending = null;
  try { cart = JSON.parse(localStorage.getItem('tc_cart2') || '[]'); } catch (e) { }
  const saveCart = () => { try { localStorage.setItem('tc_cart2', JSON.stringify(cart)); } catch (e) { } };
  const cartTotal = () => cart.reduce((a, i) => a + i.qty * i.unit, 0);
  function renderCart() {
    $('#cartCount').textContent = cart.reduce((a, i) => a + i.qty, 0); $('#cartTotal').textContent = money(cartTotal());
    $('#cartList').innerHTML = cart.length ? cart.map((i, x) => `<div class="ci"><strong>${esc(i.name)}</strong><span class="p">${money(i.qty * i.unit)}</span><small>${esc(i.size)}, ${esc(i.sweet)} sweet${i.tops.length ? ', ' + esc(i.tops.join(', ')) : ''}</small>
      <span class="qty sm" style="grid-column:1"><button type="button" data-q="${x}" data-d="-1" aria-label="Fewer ${esc(i.name)}">−</button><span>${i.qty}</span><button type="button" data-q="${x}" data-d="1" aria-label="More ${esc(i.name)}">+</button></span><button class="rm" type="button" data-rm="${x}">Remove</button></div>`).join('')
      : '<div class="empty">Your order is empty. Pick a drink from the menu to start.</div>';
    $('#orderForm').style.display = cart.length ? '' : 'none';
    const online = backend && site.payments_mode !== 'in_store';
    $('#payChoice').hidden = !backend; $('#payCardRow').hidden = !online;
    if (!online && backend) $('#pmCounter').checked = true;
    const paused = backend && site.ordering_enabled === false;
    $('#orderPaused').hidden = !paused; $('#orderSubmit').disabled = paused;
    $('#orderNote').textContent = backend ? (site.payments_mode === 'mock' ? 'Payments are in test mode right now, so no money is taken.' : 'Pick up from the counter.') : 'Sends your order to the shop by email. Pay at the counter.';
  }
  $('#cartList').addEventListener('click', e => {
    const q = e.target.closest('[data-q]'), r = e.target.closest('[data-rm]');
    if (q) { const l = cart[+q.dataset.q]; l.qty = Math.min(20, Math.max(1, l.qty + +q.dataset.d)); }
    else if (r) cart.splice(+r.dataset.rm, 1); else return;
    pending = null; saveCart(); renderCart();
  });
  $('#cartBtn').onclick = () => { $('#cartBody').hidden = false; $('#orderDone').hidden = true; renderCart(); openSheet(cartEl); };
  const setErr = (id, m) => { const e = $('.err[data-for=' + id + ']'); if (e) e.textContent = m; return !m; };
  const EMAIL = /^\S+@\S+\.\S+$/;

  $('#orderForm').onsubmit = async e => {
    e.preventDefault();
    const nm = $('#oName').value.trim(), em = $('#oEmail').value.trim();
    if (!(setErr('oName', nm ? '' : 'Add a name so we can call it out.') & setErr('oEmail', EMAIL.test(em) ? '' : 'Add an email for your receipt.'))) return;
    if (!backend) return mailtoOrder(nm);
    const method = $('[name=pm]:checked').value, btn = $('#orderSubmit'), err = $('#orderErr');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Placing order…';
    try {
      const sig = JSON.stringify(cart.map(i => [i.key, i.qty])) + method + nm + em;
      if (!pending || pending.sig !== sig) {
        const { data, error } = await sb.rpc('create_order', {
          p_name: nm, p_email: em, p_phone: $('#oPhone').value.trim(), p_pickup: $('#oWhen').value, p_notes: '',
          p_items: cart.map(i => ({ item_id: i.id, size: i.size, sweet: i.sweet, toppings: i.tops, qty: i.qty })), p_pay_method: method
        });
        if (error) throw error; pending = Object.assign({ sig, name: nm, email: em, pickup: $('#oWhen').value }, data);
      }
      method === 'card' ? openPay(pending) : finish(pending, null);
    } catch (ex) { err.textContent = ex.message || 'Something went wrong. Please try again.'; }
    finally { btn.disabled = false; btn.textContent = 'Place order'; }
  };
  function mailtoOrder(nm) {
    const lines = cart.map(i => `${i.qty} x ${i.name} (${i.size}, ${i.sweet} sweet${i.tops.length ? ', ' + i.tops.join(' + ') : ''}) ${money(i.qty * i.unit)}`).join('\n');
    location.href = 'mailto:' + site.email + '?subject=' + encodeURIComponent('Pickup order for ' + nm) + '&body=' + encodeURIComponent(lines + '\n\nTotal: ' + money(cartTotal()) + '\nPick up: ' + $('#oWhen').value + '\nName: ' + nm + '\nEmail: ' + $('#oEmail').value);
    $('#cartBody').hidden = true; $('#orderDone').hidden = false;
    $('#orderDone').innerHTML = '<div style="font-size:42px">🧋</div><b>Almost there</b><p class="sub">Your email app should have opened with the order. Send it to finish, or copy it below.</p><textarea class="field" readonly rows="6" id="orderCopy"></textarea>';
    $('#orderCopy').value = lines + '\n\nTotal: ' + money(cartTotal()) + '\nPick up: ' + $('#oWhen').value + '\nName: ' + nm;
  }
  function finish(order, paid) {
    cart = []; pending = null; saveCart(); renderCart(); closeAll(); last = null;
    openSheet(cartEl); $('#cartBody').hidden = true; const d = $('#orderDone'); d.hidden = false;
    d.innerHTML = `<div style="font-size:42px">${paid ? '🎉' : '🧋'}</div><b>Thank you, ${esc(order.name)}!</b>
      <p class="sub">Order <strong>${esc(order.order_number)}</strong> · ${money(order.total)}<br>${paid ? 'Paid by card ending ' + esc(paid.last4) + (paid.test ? ' (test payment, no money taken)' : '') : 'Please pay at the counter when you pick up.'}</p>
      <p class="note">Pick up: ${esc(order.pickup)}. Show your order number at the counter.</p><button class="btn btn-dark" type="button" id="orderNew">Back to the menu</button>`;
    $('#orderNew').onclick = closeAll;
  }

  /* ---------- payments ----------
     Payments.pay() is the only place that knows which provider is used. Today it runs a TEST-MODE "Stripe-style" flow
     (nothing is charged, only the last 4 digits are stored). To go live, switch Site info > Payments to "stripe", deploy the two
     functions in supabase/functions and replace stripePay() with Stripe Elements (see SETUP.md). */
  const Payments = {
    async pay(order, card) {
      if (site.payments_mode === 'mock') return mockPay(order, card);
      if (site.payments_mode === 'stripe') return stripePay(order, card);
      throw new Error('Online payment is not available.');
    }
  };
  const DECLINES = { '4000000000000002': 'Your card was declined.', '4000000000009995': 'Your card has insufficient funds.', '4000000000000069': 'Your card has expired.', '4000000000000127': 'Your card’s security code is incorrect.' };
  async function mockPay(order, card) {
    await wait(1100);
    const n = card.number.replace(/\s/g, '');
    if (DECLINES[n]) throw new Error(DECLINES[n]);
    const { error } = await sb.rpc('mock_pay_order', { p_order_id: order.id, p_card_last4: n.slice(-4) });
    if (error) throw error;
    return { last4: n.slice(-4), test: true };
  }
  async function stripePay() {
    // Real Stripe goes here: call the create-payment-intent function, then stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement } }).
    throw new Error('Card payments are not switched on yet. Please choose "Pay at the counter".');
  }
  const luhn = n => { let s = 0, d = false; for (let i = n.length - 1; i >= 0; i--) { let x = +n[i]; if (d) { x *= 2; if (x > 9) x -= 9; } s += x; d = !d; } return s % 10 === 0; };
  function openPay(order) {
    $('#payAmount').textContent = money(order.total); $('#payErr').textContent = '';
    $('#payGo').textContent = 'Pay ' + money(order.total); $('#payForm').reset(); $('#payTest').hidden = site.payments_mode !== 'mock';
    closeAllKeep(); openSheet(payEl);
  }
  function closeAllKeep() { [opt, cartEl, payEl].forEach(e => e.classList.remove('on')); }
  $('#cNum').addEventListener('input', e => { const v = e.target.value.replace(/\D/g, '').slice(0, 16); e.target.value = v.replace(/(.{4})/g, '$1 ').trim(); });
  $('#cExp').addEventListener('input', e => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + ' / ' + v.slice(2); e.target.value = v; });
  $('#fillTest').onclick = () => { $('#cNum').value = '4242 4242 4242 4242'; $('#cExp').value = '12 / 34'; $('#cCvc').value = '123'; $('#cName').value = pending ? pending.name : 'Test Customer'; };
  $('#payBack').onclick = () => { closeAllKeep(); openSheet(cartEl); };
  $('#payForm').onsubmit = async e => {
    e.preventDefault();
    const num = $('#cNum').value.replace(/\s/g, ''), [mm, yy] = $('#cExp').value.replace(/\s/g, '').split('/'), cvc = $('#cCvc').value, err = $('#payErr'), btn = $('#payGo');
    const exp = new Date(2000 + (+yy || 0), +mm || 0, 1);
    if (num.length < 13 || !luhn(num)) return err.textContent = 'Your card number is invalid.';
    if (!(+mm >= 1 && +mm <= 12) || !yy || exp <= new Date()) return err.textContent = 'Your card’s expiry date is invalid or has passed.';
    if (!/^\d{3,4}$/.test(cvc)) return err.textContent = 'Your card’s security code is incomplete.';
    err.textContent = ''; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Processing…';
    try { const paid = await Payments.pay(pending, { number: num, exp: $('#cExp').value, cvc, name: $('#cName').value }); finish(pending, paid); }
    catch (ex) { err.textContent = ex.message || 'The payment did not go through.'; }
    finally { btn.disabled = false; btn.textContent = 'Pay ' + money(pending ? pending.total : 0); }
  };

  /* ---------- booking ---------- */
  const bd = $('#bDate'), bt = $('#bTime'), bg = $('#bGuests');
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const fmtH = h => (h % 12 || 12) + ':00 ' + (h < 12 ? 'am' : 'pm');
  bd.min = iso(new Date()); bd.value = iso(new Date(Date.now() + 864e5));
  bg.innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1} ${i ? 'guests' : 'guest'}</option>`).join('') + '<option value="11+">11 or more</option>';
  function buildSlots() { const keep = bt.value; bt.innerHTML = ''; for (let h = site.open_hour; h < site.close_hour; h++) bt.add(new Option(fmtH(h), fmtH(h))); if (keep) bt.value = keep; }
  buildSlots();
  $$('.event a').forEach(a => a.addEventListener('click', () => { const t = $('h3', a.parentElement).textContent;[...$('#bAct').options].forEach(o => { if (o.text === t) o.selected = true; }); }));
  $('#bookForm').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    if (![setErr('bDate', bd.value && bd.value >= bd.min ? '' : 'Choose today or a later date.'), setErr('bName', $('#bName').value.trim() ? '' : 'Tell us who to look out for.'), setErr('bEmail', EMAIL.test($('#bEmail').value) ? '' : 'Enter an email we can reply to.')].every(Boolean)) return;
    if (f.elements['bot-field'].value) return;
    const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Sending…'; let sent = false, msg = '';
    if (backend) {
      const { error } = await sb.rpc('create_booking', { p_name: $('#bName').value.trim(), p_email: $('#bEmail').value.trim(), p_phone: '', p_activity: $('#bAct').value, p_date: bd.value, p_time: bt.value, p_guests: bg.value, p_notes: $('#bNote').value });
      sent = !error; msg = error ? error.message : '';
    }
    const sum = `${$('#bAct').value}, ${new Date(bd.value + 'T12:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })} at ${bt.value}, ${bg.value} ${bg.value === '1' ? 'guest' : 'guests'}`;
    if (!sent && !msg) location.href = 'mailto:' + site.email + '?subject=' + encodeURIComponent('Tea Craft booking request') + '&body=' + encodeURIComponent(sum + '\nName: ' + $('#bName').value + '\nEmail: ' + $('#bEmail').value + '\nNotes: ' + $('#bNote').value);
    if (msg) { btn.disabled = false; btn.textContent = 'Request this booking'; return setErr('bEmail', msg); }
    f.style.display = 'none'; const dn = $('#bookDone'); dn.hidden = false; dn.style.display = 'block';
    dn.innerHTML = `<div style="font-size:42px">🌸</div><b>${sent ? 'Request received' : 'Almost there'}</b><p class="sub">${esc(sum)}.<br>${sent ? 'We’ll confirm by email within a day.' : 'Your email app should have opened. Send it to finish the request.'}</p><button class="btn btn-light" type="button" id="ics">Add to my calendar</button> <button class="btn btn-outline" type="button" id="again">Make another</button>`;
    $('#ics').onclick = () => {
      const [y, m, d] = bd.value.split('-').map(Number), h = parseInt(bt.value), pm = bt.value.includes('pm'), hh = pm && h !== 12 ? h + 12 : (!pm && h === 12 ? 0 : h), p = n => String(n).padStart(2, '0');
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `DTSTART:${y}${p(m)}${p(d)}T${p(hh)}0000`, `DTEND:${y}${p(m)}${p(d)}T${p(hh + 2)}0000`, 'SUMMARY:Tea Craft: ' + $('#bAct').value, 'LOCATION:Tea Craft', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'tea-craft-booking.ics'; a.click();
    };
    $('#again').onclick = () => { dn.style.display = 'none'; f.style.display = ''; btn.disabled = false; btn.textContent = 'Request this booking'; };
  };

  /* ---------- newsletter ---------- */
  const nl = $('#newsletter');
  if (nl) nl.onsubmit = async e => {
    e.preventDefault(); const em = $('#newsletter-email').value.trim(); if (nl.elements['bot-field'].value) return;
    if (!EMAIL.test(em)) return notify('Enter a valid email address to join.');
    if (backend) { const { error } = await sb.rpc('subscribe', { p_email: em }); if (!error) { nl.reset(); return notify('You’re in! Welcome to the Kawaii club ✿'); } }
    location.href = 'mailto:' + site.email + '?subject=' + encodeURIComponent('Join the Kawaii club') + '&body=' + encodeURIComponent('Please add me to the Kawaii club: ' + em);
    notify('Send the email that just opened to finish joining ✿');
  };

  renderOpts(); renderCart(); load();
})();
