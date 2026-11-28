(function(){
  var C=window.TC_CONFIG||{},f=document.getElementById('unsubForm'),m=document.getElementById('umsg'),E='teacraftnz@gmail.com';
  var sb=(C.SUPABASE_URL&&C.SUPABASE_ANON_KEY&&window.supabase)?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:false}}):null;
  var q=new URLSearchParams(location.search).get('email');if(q)document.getElementById('ue').value=q;
  f.addEventListener('submit',async function(e){e.preventDefault();var v=document.getElementById('ue').value.trim(),b=f.querySelector('button');
    if(!/^\S+@\S+\.\S+$/.test(v)){m.textContent='Please enter a valid email address.';return}
    if(!sb){m.innerHTML='Please email <a href="mailto:'+E+'?subject=Unsubscribe&body='+encodeURIComponent('Please unsubscribe '+v)+'">'+E+'</a> and we will remove you.';return}
    b.disabled=true;m.textContent='Working…';var r=await sb.rpc('unsubscribe',{p_email:v});b.disabled=false;
    m.textContent=r.error?(r.error.message||'Something went wrong. Please email '+E+'.'):'Done. If that address was on our list it has been removed. Sorry to see you go!'});
})();
