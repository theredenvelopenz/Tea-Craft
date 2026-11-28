(function(){
'use strict';
const CFG=window.TC_CONFIG||{};
const h=(t,a={},...c)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v===true)e.setAttribute(k,'');else if(v!==false&&v!=null)e.setAttribute(k,v)}c.flat(2).filter(x=>x!==false&&x!=null).forEach(x=>e.append(x.nodeType?x:document.createTextNode(String(x))));return e};
const $=(q,r=document)=>r.querySelector(q);const app=$('#app');
const money=n=>'$'+Number(n).toFixed(2);
const say=(m,err)=>{const t=$('#toast');t.textContent=m;t.className=err?'err':'';t.hidden=false;clearTimeout(say.t);say.t=setTimeout(()=>t.hidden=true,3200)};
const safeUrl=u=>/^(https:\/\/|assets\/|\/)/.test(u||'')?u:'';
const toEmail=async u=>{const{data,error}=await sb.rpc('admin_login_email',{p_username:u});if(error)throw error;return data};
const CATS={milk:'Milk tea',fruit:'Fruity',matcha:'Matcha',dessert:'Dessert'};
let sb,user,tab='menu',orderFilter='active',poll,lastNew=null;const recovering=/type=recovery/.test(location.hash);

if(!CFG.SUPABASE_URL||!CFG.SUPABASE_ANON_KEY||!window.supabase){
  app.append(h('div',{class:'login'},h('div',{class:'box'},h('h1',{},'Almost ready'),h('p',{},'The admin page needs to be connected to your Supabase project first.'),
    h('ol',{class:'steps'},h('li',{},'Open ',h('code',{},'assets/config.js')),h('li',{},'Paste your Supabase Project URL and anon key'),h('li',{},'Upload the site again'),),h('p',{},'Full step-by-step instructions are in SETUP.md.'))));
  return;
}
sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
const run=async p=>{const r=await p;if(r.error){say(r.error.message,true);throw r.error}return r.data};

sb.auth.onAuthStateChange((ev,sess)=>{if(ev==='PASSWORD_RECOVERY')recoveryView();});
(async()=>{const{data}=await sb.auth.getSession();if(recovering)return;if(data.session)await enter(data.session.user);else loginView()})();

/* ---------- auth ---------- */
function loginView(msg){
  app.replaceChildren(h('div',{class:'login'},h('form',{class:'box',id:'lf',onsubmit:async e=>{e.preventDefault();const b=$('#lb');b.disabled=true;
    let email;try{email=await toEmail($('#le').value.trim())}catch(ex){b.disabled=false;return($('#lerr').textContent=/Too many/.test(ex.message||'')?ex.message:'Could not sign in right now. Please try again.')}
    const{data,error}=await sb.auth.signInWithPassword({email,password:$('#lp').value});b.disabled=false;
    if(error)return($('#lerr').textContent='That username and password don’t match. Please try again.');await enter(data.user)}},
    h('h1',{},'Tea Craft admin'),h('p',{},msg||'Sign in to update the menu, prices and photos.'),
    h('div',{class:'fld'},h('label',{class:'l',for:'le'},'Username'),h('input',{class:'field',id:'le',type:'text',autocomplete:'username',autocapitalize:'none',spellcheck:'false',required:true})),
    h('div',{class:'fld'},h('label',{class:'l',for:'lp'},'Password'),h('input',{class:'field',id:'lp',type:'password',autocomplete:'current-password',required:true})),
    h('p',{id:'lerr',role:'alert',style:'color:#b3402e;margin:0 0 10px'}),
    h('button',{class:'btn',id:'lb',style:'width:100%'},'Sign in'),
    h('p',{style:'text-align:center;margin:14px 0 0'},h('a',{href:'#',onclick:async e=>{e.preventDefault();const un=$('#le').value.trim();if(!un)return say('Type your username first',true);let em;try{em=await toEmail(un)}catch(ex){return say(ex.message,true)}
      const{error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+'/admin'});say(error?error.message:'If that account exists, a reset link is on its way to the shop email.',!!error)}},'Forgot your password?')))));
}
function recoveryView(){
  app.replaceChildren(h('div',{class:'login',id:'rec'},h('form',{class:'box',onsubmit:async e=>{e.preventDefault();const p=$('#np').value;if(p.length<10)return($('#nerr').textContent='Use at least 10 characters.');
    const{error}=await sb.auth.updateUser({password:p});if(error)return($('#nerr').textContent=error.message);say('Password updated');location.hash='';const{data}=await sb.auth.getUser();await enter(data.user)}},
    h('h1',{},'Choose a new password'),h('p',{},'At least 10 characters.'),h('div',{class:'fld'},h('input',{class:'field',id:'np',type:'password',autocomplete:'new-password',required:true,'aria-label':'New password'})),
    h('p',{id:'nerr',role:'alert',style:'color:#b3402e'}),h('button',{class:'btn',style:'width:100%'},'Save password'))));
}
async function enter(u){
  user=u;
  try{const{data:aal}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();if(aal&&aal.nextLevel==='aal2'&&aal.currentLevel!=='aal2')return mfaChallengeView()}catch(_){}
  const{data}=await sb.from('admins').select('user_id,must_change_password').eq('user_id',u.id).maybeSingle();
  if(!data){await sb.auth.signOut();return loginView('This account isn’t set up as an admin yet.')}
  if(data.must_change_password)return forcePwView();
  shell();show(tab);
}
function mfaChallengeView(){
  app.replaceChildren(h('div',{class:'login'},h('form',{class:'box',onsubmit:async e=>{e.preventDefault();const er=$('#merr'),b=$('#mb');er.textContent='';b.disabled=true;
    const{data:f}=await sb.auth.mfa.listFactors();const fac=((f&&f.totp)||[]).find(x=>x.status==='verified');
    if(!fac){b.disabled=false;return(er.textContent='No authenticator is set up on this account.')}
    const{error}=await sb.auth.mfa.challengeAndVerify({factorId:fac.id,code:$('#mc').value.replace(/\s/g,'')});b.disabled=false;
    if(error)return(er.textContent='That code didn’t work. Check the 6 digits in your authenticator app and try again.');
    const{data}=await sb.auth.getUser();await enter(data.user)}},
    h('h1',{},'Two-step check'),h('p',{},'Open your authenticator app and type the 6-digit code for Tea Craft.'),
    h('div',{class:'fld'},h('label',{class:'l',for:'mc'},'6-digit code'),h('input',{class:'field',id:'mc',inputmode:'numeric',autocomplete:'one-time-code',maxlength:'7',required:true})),
    h('p',{id:'merr',role:'alert',style:'color:#b3402e;margin:0 0 10px'}),h('button',{class:'btn',id:'mb',style:'width:100%'},'Verify'),
    h('p',{style:'text-align:center;margin:14px 0 0'},h('a',{href:'#',onclick:e=>{e.preventDefault();signOut()}},'Sign out')))));
}
async function mfaSettings(){
  const d=$('#dlg');const{data:f}=await sb.auth.mfa.listFactors();const all=(f&&f.all)||[],ver=all.find(x=>x.factor_type==='totp'&&x.status==='verified');
  const close=h('button',{type:'button',class:'btn ghost',onclick:()=>d.close()},'Close');
  if(ver){d.replaceChildren(h('h3',{style:'margin:0 0 10px;font-size:1.3rem'},'Two-step login is ON'),h('p',{},'Signing in needs your password and a code from your authenticator app. This keeps the admin safe even if the password leaks.'),
    h('div',{class:'row',style:'justify-content:flex-end'},close,h('button',{type:'button',class:'btn danger',onclick:async()=>{if(!confirm('Turn off two-step login? The admin will be less safe.'))return;const{error}=await sb.auth.mfa.unenroll({factorId:ver.id});say(error?error.message:'Two-step login is off',!!error);d.close()}},'Turn off')))}
  else{
    for(const x of all.filter(x=>x.status!=='verified'))await sb.auth.mfa.unenroll({factorId:x.id});
    const{data,error}=await sb.auth.mfa.enroll({factorType:'totp',friendlyName:'Tea Craft admin '+Date.now()});
    if(error){say(error.message,true);return}
    d.replaceChildren(h('h3',{style:'margin:0 0 10px;font-size:1.3rem'},'Turn on two-step login'),
      h('ol',{class:'steps'},h('li',{},'Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy) on your phone.'),h('li',{},'Scan this picture with the app.'),h('li',{},'Type the 6-digit code the app shows.')),
      h('div',{style:'text-align:center;margin:0 0 10px'},h('img',{src:data.totp.qr_code,alt:'QR code for your authenticator app',width:'180',height:'180',style:'background:#fff;border-radius:12px;padding:8px'})),
      h('p',{class:'help'},'Can’t scan? Type this key into the app instead: ',h('code',{},data.totp.secret)),
      h('div',{class:'fld'},h('label',{class:'l',for:'mfc'},'6-digit code'),h('input',{class:'field',id:'mfc',inputmode:'numeric',autocomplete:'one-time-code',maxlength:'7'})),
      h('p',{class:'help'},'Keep your phone safe. If you lose it, the website builder can reset this from the Supabase dashboard.'),
      h('div',{class:'row',style:'justify-content:flex-end'},close,h('button',{type:'button',class:'btn',onclick:async()=>{const{error:e2}=await sb.auth.mfa.challengeAndVerify({factorId:data.id,code:$('#mfc').value.replace(/\s/g,'')});if(e2)return say('That code didn’t work. Try again.',true);say('Two-step login is now ON');d.close()}},'Turn on')))
  }
  d.showModal();
}
function forcePwView(){
  app.replaceChildren(h('div',{class:'login',id:'rec'},h('form',{class:'box',onsubmit:async e=>{e.preventDefault();const p=$('#fp1').value,q=$('#fp2').value,er=$('#ferr'),b=$('#fb');
    if(p.length<10)return(er.textContent='Use at least 10 characters.');if(p!==q)return(er.textContent='The two passwords don’t match.');
    b.disabled=true;er.textContent='';
    const{error}=await sb.auth.updateUser({password:p});if(error){b.disabled=false;return(er.textContent=error.message)}
    const r=await sb.rpc('complete_first_login');if(r.error){b.disabled=false;return(er.textContent=r.error.message)}
    say('Password saved. Welcome!');const{data}=await sb.auth.getUser();await enter(data.user)}},
    h('h1',{},'Choose your own password'),h('p',{},'This account is using a starter password, so nothing can be changed yet. Pick a private password (at least 10 characters) to continue.'),
    h('div',{class:'fld'},h('label',{class:'l',for:'fp1'},'New password'),h('input',{class:'field',id:'fp1',type:'password',autocomplete:'new-password',required:true})),
    h('div',{class:'fld'},h('label',{class:'l',for:'fp2'},'Type it again'),h('input',{class:'field',id:'fp2',type:'password',autocomplete:'new-password',required:true})),
    h('p',{id:'ferr',role:'alert',style:'color:#b3402e;margin:0 0 10px'}),h('button',{class:'btn',id:'fb',style:'width:100%'},'Save and continue'),
    h('p',{style:'text-align:center;margin:14px 0 0'},h('a',{href:'#',onclick:e=>{e.preventDefault();signOut()}},'Sign out')))));
}
async function signOut(){await sb.auth.signOut();clearInterval(poll);loginView('You’re signed out.')}

/* ---------- shell ---------- */
const TABS=[['menu','Menu'],['site','Shop info'],['news','Newsletter']];
function shell(){
  app.replaceChildren(
    h('header',{class:'top'},h('div',{class:'in'},h('div',{class:'brand'},'Tea Craft',h('small',{},'admin')),h('a',{href:'/',target:'_blank',rel:'noopener'},'View website ↗'),
      h('button',{class:'btn ghost sm',onclick:mfaSettings},'Two-step login'),h('button',{class:'btn ghost sm',onclick:changePw},'Change password'),h('button',{class:'btn ghost sm',onclick:signOut},'Sign out')),
      h('nav',{class:'tabs',role:'tablist'},TABS.map(([k,n])=>h('button',{role:'tab',id:'t-'+k,'aria-selected':String(k===tab),onclick:()=>show(k)},n,k==='orders'&&h('span',{class:'badge',id:'ob',hidden:true}))))),
    h('main',{id:'main'}));
}
function show(k){tab=k;document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.id==='t-'+k)));
  ({orders:ordersView,menu:menuView,addons:addonsView,bookings:bookingsView,site:siteView,news:newsView})[k]().catch(()=>{})}
async function changePw(){const p=prompt('Type a new password (at least 10 characters):');if(!p)return;if(p.length<10)return say('Use at least 10 characters',true);
  const{error}=await sb.auth.updateUser({password:p});say(error?error.message:'Password updated',!!error)}
async function refreshBadge(){
  const{count}=await sb.from('orders').select('id',{count:'exact',head:true}).eq('status','new');const n=count||0,b=$('#ob');
  if(b){b.textContent=n;b.hidden=!n}document.title=(n?'('+n+') ':'')+'Tea Craft admin';
  if(lastNew!==null&&n>lastNew){if(tab==='orders')ordersView(true);else say('New order received')}lastNew=n;
}
const main=()=>$('#main');const put=(...c)=>main().replaceChildren(...c.flat(3).filter(x=>x!==false&&x!=null));
const ago=t=>{const m=Math.round((Date.now()-new Date(t))/6e4);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':new Date(t).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})};

/* ---------- orders ---------- */
async function ordersView(quiet){
  const rows=await run(sb.from('orders').select('*').order('created_at',{ascending:false}).limit(150));
  const act=['new','preparing','ready'],list=rows.filter(o=>orderFilter==='all'||(orderFilter==='active'?act.includes(o.status):!act.includes(o.status)));
  const pay=o=>o.payment_status==='paid'?h('span',{class:'pill ok'},'Paid by card ••'+(o.card_last4||'')+(o.payment_provider==='mock'?' (test)':'')):o.payment_method==='counter'?h('span',{class:'pill warn'},'Pay at counter'):h('span',{class:'pill bad'},'Card not paid yet');
  const upd=async(o,patch)=>{await run(sb.from('orders').update(patch).eq('id',o.id));say('Updated');ordersView(true);refreshBadge()};
  put(h('div',{class:'head'},h('h2',{},'Orders'),h('button',{class:'btn ghost sm',onclick:()=>ordersView()},'Refresh')),
    h('div',{class:'chips'},[['active','Active'],['done','Finished'],['all','All']].map(([k,n])=>h('button',{'aria-pressed':String(orderFilter===k),onclick:()=>{orderFilter=k;ordersView()}},n))),
    list.length?list.map(o=>h('div',{class:'card order'},
      h('div',{class:'top2'},h('div',{},h('span',{class:'no'},o.order_number),' ',h('span',{class:'pill'},o.status),' ',pay(o)),h('span',{class:'help'},ago(o.created_at))),
      h('div',{},h('strong',{},o.customer_name),' · pickup: ',o.pickup_time,' · ',h('a',{href:'mailto:'+o.customer_email},o.customer_email),o.customer_phone&&[' · ',h('a',{href:'tel:'+o.customer_phone},o.customer_phone)]),
      h('div',{class:'items'},o.items.map(i=>h('div',{},i.qty+' × '+i.name+' ('+i.size+', '+i.sweet+' sweet'+(i.toppings.length?', '+i.toppings.join(' + '):'')+') ',h('strong',{},money(i.qty*i.unit_price))))),
      h('div',{class:'row'},h('strong',{style:'font-size:1.1rem;margin-right:auto'},'Total '+money(o.total)),
        o.status==='new'&&h('button',{class:'btn sm',onclick:()=>upd(o,{status:'preparing'})},'Start making'),
        o.status==='preparing'&&h('button',{class:'btn sm',onclick:()=>upd(o,{status:'ready'})},'Mark ready'),
        o.status==='ready'&&h('button',{class:'btn sm',onclick:()=>upd(o,{status:'completed'})},'Picked up'),
        o.payment_status!=='paid'&&o.status!=='cancelled'&&h('button',{class:'btn ghost sm',onclick:()=>upd(o,{payment_status:'paid'})},'Mark as paid'),
        ['new','preparing','ready'].includes(o.status)&&h('button',{class:'btn danger sm',onclick:()=>confirm('Cancel order '+o.order_number+'?')&&upd(o,{status:'cancelled'})},'Cancel')))):h('div',{class:'empty card'},'No orders here yet.'));
}

/* ---------- menu ---------- */
async function menuView(){
  const rows=await run(sb.from('menu_items').select('*').order('sort_order').order('created_at'));
  const si=await sb.from('site_info').select('show_prices').eq('id',1).maybeSingle();const pricesShown=!!(si.data&&si.data.show_prices);
  const upd=async(id,patch,msg)=>{await run(sb.from('menu_items').update(patch).eq('id',id));say(msg||'Saved');};
  const move=async(i,d)=>{const a=rows[i],b=rows[i+d];if(!b)return;await run(sb.from('menu_items').update({sort_order:b.sort_order}).eq('id',a.id));await run(sb.from('menu_items').update({sort_order:a.sort_order===b.sort_order?a.sort_order+d:a.sort_order}).eq('id',b.id));menuView()};
  put(h('div',{class:'head'},h('h2',{},'Menu'),h('button',{class:'btn',onclick:()=>itemForm(null,rows)},'+ Add a new tea')),
    h('p',{class:'help'},'Change a price and press Enter or click away to save. Use “Change photo” under a picture to replace it. “Sold out” keeps the drink visible but not orderable. Untick “Visible” to take it off the website without deleting it.'+(pricesShown?'':' Prices are saved but hidden on the website for now (switch them on in Shop info).')+''),
    rows.length?rows.map((m,i)=>h('div',{class:'card menu-row'},
      h('div',{style:'text-align:center'},safeUrl(m.image_url)?h('img',{src:safeUrl(m.image_url),alt:'Photo of '+m.name,loading:'lazy'}):h('div',{class:'thumb'},'🧋'),h('label',{class:'btn ghost sm',style:'margin-top:6px;display:inline-block;cursor:pointer'},'Change photo',h('input',{type:'file',accept:'image/*',hidden:true,'aria-label':'Choose a new photo for '+m.name,onchange:async e=>{const f=e.target.files[0];if(!f)return;try{say('Uploading photo…');const url=await uploadImage(f);await run(sb.from('menu_items').update({image_url:url}).eq('id',m.id));say('Photo updated');menuView()}catch(er){say(er.message||'Upload failed',true)}}}))),
      h('div',{},h('h3',{},m.name),h('div',{class:'meta'},CATS[m.category]+(m.badge?' · '+m.badge:'')+' · '+(m.description||'').slice(0,60))),
      h('div',{class:'ctrls'},
        h('label',{class:'switch'},'$',h('input',{class:'field price-in',type:'number',min:'0',step:'0.05',value:Number(m.price).toFixed(2),'aria-label':'Price for '+m.name,
          onchange:e=>{const v=parseFloat(e.target.value);if(!(v>=0&&v<1000))return say('Enter a price like 8.50',true);upd(m.id,{price:v},m.name+' is now '+money(v))}})),
        h('label',{class:'switch'},h('input',{type:'checkbox',checked:m.is_available,onchange:e=>upd(m.id,{is_available:e.target.checked},e.target.checked?'Back in stock':'Marked sold out')}),'In stock'),
        h('label',{class:'switch'},h('input',{type:'checkbox',checked:m.is_active,onchange:e=>upd(m.id,{is_active:e.target.checked},e.target.checked?'Shown on website':'Hidden from website')}),'Visible'),
        h('button',{class:'btn ghost sm','aria-label':'Move up',onclick:()=>move(i,-1),disabled:i===0},'↑'),h('button',{class:'btn ghost sm','aria-label':'Move down',onclick:()=>move(i,1),disabled:i===rows.length-1},'↓'),
        h('button',{class:'btn ghost sm',onclick:()=>itemForm(m,rows)},'Edit'),
        h('button',{class:'btn danger sm',onclick:async()=>{if(confirm('Delete “'+m.name+'”? This can’t be undone. (Hide it instead to keep it for later.)')){await run(sb.from('menu_items').delete().eq('id',m.id));say('Deleted');menuView()}}},'Delete')))):h('div',{class:'empty card'},'No drinks yet. Add your first one!'));
}
function itemForm(m,rows){
  const d=$('#dlg');let img=m?m.image_url:'';
  const prev=h('div',{class:'thumb',style:'width:96px;height:96px'},'🧋');const setPrev=()=>{prev.replaceChildren();if(safeUrl(img)){prev.append(h('img',{src:safeUrl(img),alt:'',style:'width:96px;height:96px;border-radius:14px;object-fit:cover'}))}else prev.textContent='🧋'};setPrev();
  const f=h('form',{method:'dialog',onsubmit:async e=>{e.preventDefault();const b=$('#sv');b.disabled=true;
    const row={name:$('#fn').value.trim(),description:$('#fd').value.trim(),category:$('#fc').value,price:parseFloat($('#fp').value),badge:$('#fb').value.trim(),image_url:img,is_available:$('#fa').checked,is_active:$('#fv').checked};
    if(!row.name||!(row.price>=0)){b.disabled=false;return say('Please add a name and a price',true)}
    try{if(m)await run(sb.from('menu_items').update(row).eq('id',m.id));else{row.sort_order=Math.max(0,...rows.map(r=>r.sort_order))+10;await run(sb.from('menu_items').insert(row))}
      d.close();say(m?'Saved':'Added to the menu');menuView()}catch(_){b.disabled=false}}},
    h('h3',{style:'margin:0 0 14px;font-size:1.3rem'},m?'Edit drink':'Add a new tea'),
    h('div',{class:'grid2'},h('div',{class:'fld'},h('label',{class:'l',for:'fn'},'Name'),h('input',{class:'field',id:'fn',maxlength:'80',required:true,value:m?m.name:''})),
      h('div',{class:'fld'},h('label',{class:'l',for:'fp'},'Price (NZD)'),h('input',{class:'field',id:'fp',type:'number',min:'0',step:'0.05',required:true,value:m?Number(m.price).toFixed(2):''}))),
    h('div',{class:'fld'},h('label',{class:'l',for:'fd'},'Description'),h('textarea',{class:'field',id:'fd',maxlength:'300'},m?m.description:'')),
    h('div',{class:'grid2'},h('div',{class:'fld'},h('label',{class:'l',for:'fc'},'Category'),h('select',{class:'field',id:'fc'},Object.entries(CATS).map(([k,n])=>h('option',{value:k,selected:m&&m.category===k},n)))),
      h('div',{class:'fld'},h('label',{class:'l',for:'fb'},'Label on the photo (optional)'),h('input',{class:'field',id:'fb',maxlength:'24',placeholder:'e.g. New or Cloud series',value:m?m.badge:''}))),
    h('div',{class:'fld'},h('label',{class:'l'},'Photo'),h('div',{class:'row'},prev,h('div',{},h('input',{type:'file',id:'ff',accept:'image/*',onchange:async e=>{const file=e.target.files[0];if(!file)return;try{say('Uploading photo…');img=await uploadImage(file);setPrev();say('Photo added')}catch(er){say(er.message||'Upload failed',true)}}}),
      h('div',{class:'help'},'Any photo works. It’s resized automatically. Square photos look best.'),img&&h('button',{type:'button',class:'btn ghost sm',onclick:()=>{img='';setPrev()}},'Remove photo')))),
    h('div',{class:'row',style:'margin:0 0 16px'},h('label',{class:'switch'},h('input',{type:'checkbox',id:'fa',checked:m?m.is_available:true}),'In stock'),h('label',{class:'switch'},h('input',{type:'checkbox',id:'fv',checked:m?m.is_active:true}),'Show on website')),
    h('div',{class:'row',style:'justify-content:flex-end'},h('button',{type:'button',class:'btn ghost',onclick:()=>d.close()},'Cancel'),h('button',{class:'btn',id:'sv'},m?'Save changes':'Add to menu')));
  d.replaceChildren(f);d.showModal();
}
async function uploadImage(file){
  const bmp=await createImageBitmap(file),max=900,sc=Math.min(1,max/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);
  c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  const blob=await new Promise(r=>c.toBlob(r,'image/webp',.85));if(!blob)throw new Error('Could not read that image');
  const path=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2))+'.webp';
  const{error}=await sb.storage.from('menu-images').upload(path,blob,{contentType:'image/webp',cacheControl:'31536000'});if(error)throw error;
  return sb.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}

/* ---------- sizes & toppings ---------- */
async function addonsView(){
  const rows=await run(sb.from('addons').select('*').order('kind').order('sort_order'));
  const upd=async(id,p)=>{await run(sb.from('addons').update(p).eq('id',id));say('Saved')};
  const section=(kind,title,hint)=>h('div',{class:'card'},h('h3',{style:'margin:0 0 4px'},title),h('p',{class:'help',style:'margin:0 0 12px'},hint),
    rows.filter(r=>r.kind===kind).map(r=>h('div',{class:'row',style:'margin:0 0 8px'},h('strong',{style:'min-width:130px'},r.name),
      h('label',{class:'switch'},'+$',h('input',{class:'field price-in',type:'number',min:'0',step:'0.05',value:Number(r.price).toFixed(2),'aria-label':'Extra price for '+r.name,onchange:e=>{const v=parseFloat(e.target.value);if(!(v>=0))return say('Enter a price',true);upd(r.id,{price:v})}})),
      h('label',{class:'switch'},h('input',{type:'checkbox',checked:r.is_active,onchange:e=>upd(r.id,{is_active:e.target.checked})}),'Offered'),
      h('button',{class:'btn danger sm',onclick:async()=>{if(confirm('Delete '+r.name+'?')){await run(sb.from('addons').delete().eq('id',r.id));addonsView()}}},'Delete'))),
    h('form',{class:'row',style:'margin-top:12px',onsubmit:async e=>{e.preventDefault();const n=e.target.n.value.trim(),p=parseFloat(e.target.p.value||'0');if(!n)return;await run(sb.from('addons').insert({kind,name:n,price:p>=0?p:0,sort_order:200}));say('Added');addonsView()}},
      h('input',{class:'field',name:'n',placeholder:'New '+(kind==='size'?'size':'topping')+' name',style:'flex:1;min-width:150px','aria-label':'New name'}),h('input',{class:'field price-in',name:'p',type:'number',min:'0',step:'0.05',placeholder:'+$',value:'1.00','aria-label':'Extra price'}),h('button',{class:'btn sm'},'Add')));
  put(h('div',{class:'head'},h('h2',{},'Sizes & toppings')),section('size','Sizes','“Regular” is always available at the menu price. Anything listed here costs extra.'),section('topping','Toppings','Customers can choose up to 5 per drink.'));
}

/* ---------- bookings ---------- */
async function bookingsView(){
  const rows=await run(sb.from('bookings').select('*').order('booking_date').order('created_at'));
  const upd=async(b,s)=>{await run(sb.from('bookings').update({status:s}).eq('id',b.id));say('Updated');bookingsView()};
  const today=new Date().toISOString().slice(0,10);
  const up=rows.filter(b=>b.booking_date>=today),past=rows.filter(b=>b.booking_date<today);
  const card=b=>h('div',{class:'card'},h('div',{class:'row'},h('strong',{style:'margin-right:auto'},b.activity),h('span',{class:'pill '+(b.status==='confirmed'?'ok':b.status==='declined'?'bad':'warn')},b.status)),
    h('div',{},new Date(b.booking_date+'T12:00').toLocaleDateString('en-NZ',{weekday:'long',day:'numeric',month:'long'})+' at '+b.booking_time+' · '+b.guests+' guest'+(b.guests==='1'?'':'s')),
    h('div',{},b.name+' · ',h('a',{href:'mailto:'+b.email+'?subject='+encodeURIComponent('Your Tea Craft booking')+'&body='+encodeURIComponent('Hi '+b.name+',\n\nYour booking for '+b.activity+' on '+b.booking_date+' at '+b.booking_time+' is confirmed. See you then!\n\nTea Craft')},b.email)),
    b.notes&&h('div',{class:'help'},'“'+b.notes+'”'),
    h('div',{class:'row',style:'margin-top:10px'},b.status!=='confirmed'&&h('button',{class:'btn sm',onclick:()=>upd(b,'confirmed')},'Confirm'),b.status!=='declined'&&h('button',{class:'btn ghost sm',onclick:()=>upd(b,'declined')},'Decline'),
      h('button',{class:'btn danger sm',onclick:async()=>{if(confirm('Delete this booking request?')){await run(sb.from('bookings').delete().eq('id',b.id));bookingsView()}}},'Delete')));
  put(h('div',{class:'head'},h('h2',{},'Bookings')),up.length?up.map(card):h('div',{class:'empty card'},'No upcoming booking requests.'),past.length&&h('h3',{style:'margin:22px 0 10px'},'Past'),past.slice(-20).reverse().map(card));
}

/* ---------- shop info ---------- */
async function siteView(){
  const s=await run(sb.from('site_info').select('*').eq('id',1).single());
  const t=(id,l,k,o={})=>h('div',{class:'fld'},h('label',{class:'l',for:id},l),o.area?h('textarea',{class:'field',id,rows:o.rows||3},s[k]):h('input',{class:'field',id,type:o.type||'text',value:s[k],maxlength:o.max||200,placeholder:o.ph||''}),o.help&&h('div',{class:'help'},o.help));
  const f=h('form',{onsubmit:async e=>{e.preventDefault();const o=+$('#s_open').value,c=+$('#s_close').value;if(!(c>o))return say('Closing hour must be after opening hour',true);
    if($('#s_ann_on').checked&&!$('#s_ann').value.trim())return say('Type your announcement or switch it off',true);
    const url=v=>v&&!/^https:\/\//.test(v)?null:v;const ig=url($('#s_ig').value.trim()),tt=url($('#s_tt').value.trim()),fb=url($('#s_fb').value.trim());
    if(ig===null||tt===null||fb===null)return say('Social links must start with https://',true);
    await run(sb.from('site_info').update({business_name:$('#s_name').value.trim(),tagline:$('#s_tag').value.trim(),email:$('#s_email').value.trim(),phone:$('#s_phone').value.trim(),address:$('#s_addr').value.trim(),hours_text:$('#s_hours').value.trim(),
      open_hour:o,close_hour:c,announcement_enabled:$('#s_ann_on').checked,announcement_text:$('#s_ann').value.trim(),show_prices:$('#s_prices').checked,instagram_url:ig,tiktok_url:tt,facebook_url:fb}).eq('id',1));
    say('Saved. The website shows this straight away.')}},
    h('div',{class:'head'},h('h2',{},'Shop info')),
    h('div',{class:'card'},h('h3',{style:'margin:0 0 12px'},'Announcement banner'),h('label',{class:'switch',style:'margin-bottom:10px'},h('input',{type:'checkbox',id:'s_ann_on',checked:s.announcement_enabled}),'Show a banner at the top of the website'),
      t('s_ann','Banner message','announcement_text',{max:140,ph:'e.g. Closed on Monday for a team day. Back Tuesday!'})),
    h('div',{class:'card'},h('h3',{style:'margin:0 0 12px'},'Contact & opening hours'),
      h('div',{class:'grid2'},t('s_email','Email','email',{type:'email'}),t('s_phone','Phone','phone',{type:'tel'})),
      t('s_addr','Address (one line per row)','address',{area:true,rows:3}),
      t('s_hours','Opening hours shown on the website','hours_text',{area:true,rows:3,help:'Shown in the footer, e.g. Every day · 10am–7pm'}),
      h('div',{class:'grid2'},t('s_open','Opens at (24h, e.g. 10)','open_hour',{type:'number'}),t('s_close','Closes at (24h, e.g. 19)','close_hour',{type:'number'})),
      h('div',{class:'help'},'The opening and closing numbers decide which booking times customers can pick.')),
    h('div',{class:'card'},h('h3',{style:'margin:0 0 12px'},'Brand & social links'),h('div',{class:'grid2'},t('s_name','Business name','business_name'),t('s_tag','Tagline','tagline')),
      t('s_ig','Instagram link','instagram_url',{ph:'https://instagram.com/…',max:200}),t('s_tt','TikTok link','tiktok_url',{ph:'https://tiktok.com/@…',max:200}),t('s_fb','Facebook link','facebook_url',{ph:'https://facebook.com/…',max:200})),
    h('div',{class:'card'},h('h3',{style:'margin:0 0 12px'},'Menu prices'),h('label',{class:'switch'},h('input',{type:'checkbox',id:'s_prices',checked:s.show_prices}),'Show prices on the website menu'),h('div',{class:'help'},'Off for now. Prices you enter in the Menu tab are saved and appear when you switch this on.')),
    h('button',{class:'btn'},'Save changes'));
  put(f);
}

/* ---------- newsletter ---------- */
async function newsView(){
  const rows=await run(sb.from('subscribers').select('*').order('created_at',{ascending:false}));
  const csv=()=>{const b=new Blob(['email,joined\n'+rows.map(r=>r.email+','+r.created_at.slice(0,10)).join('\n')],{type:'text/csv'});const a=h('a',{href:URL.createObjectURL(b),download:'tea-craft-subscribers.csv'});a.click()};
  put(h('div',{class:'head'},h('h2',{},'Newsletter ('+rows.length+')'),h('div',{class:'row'},h('button',{class:'btn ghost sm',onclick:async()=>{await navigator.clipboard.writeText(rows.map(r=>r.email).join(', '));say('Copied all emails')},disabled:!rows.length},'Copy all emails'),h('button',{class:'btn sm',onclick:csv,disabled:!rows.length},'Download CSV'))),
    rows.length?h('div',{class:'card'},rows.map(r=>h('div',{class:'row',style:'justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)'},h('span',{},r.email),h('span',{class:'row'},h('span',{class:'help'},r.created_at.slice(0,10)),
      h('button',{class:'btn danger sm',onclick:async()=>{if(confirm('Remove '+r.email+'?')){await run(sb.from('subscribers').delete().eq('email',r.email));newsView()}}},'Remove'))))):h('div',{class:'empty card'},'No sign-ups yet.'));
}
})();
