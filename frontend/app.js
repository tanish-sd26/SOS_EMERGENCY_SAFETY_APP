// frontend/app.js — Fixed: overlay non-blocking, imSafe/StopAlarm responsive, EmailJS dynamic loader on-demand

// ---- CONFIG ----
const EMAILJS_USER_ID = 'Ss8SLxGczWuKD90v7kyUt';
const EMAILJS_SERVICE_ID = 'service_vrzcyjh';
const EMAILJS_TEMPLATE_ID = 'template_8x3sslp';
const SERVER_URL = 'https://sos-emergency-safety-app-b0yt.onrender.com';
const DEFAULT_CC = '91'; // if not India, change to your country code (without +)

// ---- small utility: load script dynamically ----
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = (e) => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

// ---- EmailJS on-demand loader/initializer ----
let _emailJsReady = false;
async function ensureEmailJsReady() {
  if (_emailJsReady) return true;
  try {
    if (typeof emailjs === 'undefined') {
      await loadScript('https://cdn.emailjs.com/sdk/3.2/email.min.js');
      console.log('EmailJS script dynamically loaded');
    }
    if (typeof emailjs !== 'undefined' && EMAILJS_USER_ID) {
      try { emailjs.init(EMAILJS_USER_ID); _emailJsReady = true; console.log('EmailJS initialized'); return true; }
      catch(e){ console.warn('EmailJS init failed', e); return false; }
    } else {
      console.warn('EmailJS present but USER ID missing or emailjs undefined');
      return false;
    }
  } catch(e) {
    console.warn('Could not load/initialize EmailJS', e);
    return false;
  }
}

// ---- Wait for Firebase libs ----
const waitForFirebase = () => new Promise(resolve => {
  const check = () => {
    if (window.firebase && firebase.auth && firebase.firestore) resolve();
    else setTimeout(check, 50);
  }; check();
});

(async function main(){
  await waitForFirebase();
  console.log('Firebase ready');
  const auth = firebase.auth();
  const db = firebase.firestore();
  const app = document.getElementById('app');

  // ---- overlay (visual only) ----
  const overlay = document.createElement('div');
  overlay.id = 'danger-overlay';
  // style visually similar to previous design; but DO NOT block clicks
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(244,63,94,0.08)';
  overlay.style.pointerEvents = 'none'; // IMPORTANT: let clicks pass through
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.2s';
  overlay.classList.remove('active');
  document.body.appendChild(overlay);
  function overlayOn(){ overlay.style.opacity = '0.9'; overlay.classList.add('active'); }
  function overlayOff(){ overlay.style.opacity = '0'; overlay.classList.remove('active'); }

  // ---- alarm audio ----
  if (typeof window.alarmAudio === 'undefined') {
    try {
      window.alarmAudio = new Audio('assets/alarm.mp3');
      window.alarmAudio.loop = true;
    } catch(e){
      try { window.alarmAudio = new Audio('assets/alarm.mp3'); window.alarmAudio.loop = true; }
      catch(err){ console.warn('No alarm audio available', err); }
    }
  }
  function playAlarm(){ if(window.alarmAudio) window.alarmAudio.play().catch(e=>console.warn('alarm play blocked', e)); }
  function stopAlarm(){ if(window.alarmAudio){ window.alarmAudio.pause(); window.alarmAudio.currentTime = 0; } }

  // ---- helpers ----
  function el(tag, cls='', inner=''){ const e = document.createElement(tag); if(cls) e.className = cls; if(inner) e.innerHTML = inner; return e; }
  function msgToast(text){ const t = el('div','fixed right-4 bottom-4 bg-slate-900 text-white p-3 rounded shadow',''); t.textContent = text; document.body.appendChild(t); setTimeout(()=>t.remove(),3500); }
  function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function sanitizePhoneDigits(raw){ if(!raw) return ''; return raw.replace(/\D/g,''); }
  function toE164(raw){ if(!raw) return null; const d = raw.replace(/\D/g,''); if(d.length===10) return '+'+DEFAULT_CC+d; if(d.length>10) return (d[0]==='0')?('+'.concat(d.slice(1))):('+'+d); return '+'+DEFAULT_CC+d; }

  // --- RENDER: Login ---
  function renderLogin(){
    app.innerHTML = '';
    const card = el('div','bg-slate-800 p-6 rounded-lg shadow max-w-2xl mx-auto');
    card.appendChild(el('h1','text-2xl font-bold mb-4','SOS Emergency'));
    const email = el('input','w-full p-3 rounded mb-3 bg-slate-900'); email.placeholder = 'Email';
    const pass = el('input','w-full p-3 rounded mb-3 bg-slate-900'); pass.type='password'; pass.placeholder = 'Password';
    const row = el('div','flex gap-3');
    const btnLogin = el('button','flex-1 bg-indigo-500 p-3 rounded','Login');
    const btnSignup = el('button','flex-1 border border-indigo-500 p-3 rounded','Sign up');
    row.append(btnLogin, btnSignup);
    card.append(email, pass, row, el('p','text-sm text-slate-400 mt-3','Create an account and set emergency contacts.'));
    app.append(card);

    btnSignup.onclick = async ()=>{
      const e = email.value.trim(), p = pass.value;
      if(!e||!p) return alert('Enter email & password');
      try {
        const cred = await auth.createUserWithEmailAndPassword(e,p);
        await db.collection('users').doc(cred.user.uid).set({ email:e, displayName:'', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        msgToast('Account created — please login');
        email.value=''; pass.value='';
      } catch(err){ alert(err.message); }
    };
    btnLogin.onclick = async ()=>{
      const e = email.value.trim(), p = pass.value;
      if(!e||!p) return alert('Enter email & password');
      try{ await auth.signInWithEmailAndPassword(e,p); } catch(err){ alert(err.message); }
    };
  }

  // --- RENDER: Contacts (with Edit/Delete) ---
  function renderContacts(user){
    app.innerHTML = '';
    const header = el('div','flex items-center justify-between mb-4');
    header.appendChild(el('h2','text-xl font-semibold','Emergency Contacts'));
    const backBtn = el('button','text-sm text-slate-300','Back to Dashboard');
    header.appendChild(backBtn);
    app.append(header);

    const card = el('div','bg-slate-800 p-5 rounded-lg shadow max-w-2xl mx-auto');
    const form = el('form','flex gap-2 mb-4 flex-wrap');
    const inpName = el('input','flex-1 p-3 rounded bg-slate-900'); inpName.placeholder='Name';
    const inpPhone = el('input','w-48 p-3 rounded bg-slate-900'); inpPhone.placeholder='+919...';
    const inpEmail = el('input','w-56 p-3 rounded bg-slate-900'); inpEmail.placeholder='Email (optional)';
    const addBtn = el('button','bg-green-600 text-white p-3 rounded','Add'); addBtn.type='submit';
    form.append(inpName, inpPhone, inpEmail, addBtn);
    card.append(form);

    const list = el('div','space-y-2'); card.append(list);
    const footer = el('div','mt-4 flex justify-between items-center');
    const logoutBtn = el('button','text-sm text-slate-300','Logout');
    footer.append(logoutBtn);
    card.append(footer);
    app.append(card);

    logoutBtn.onclick = ()=> auth.signOut();

    const ref = db.collection('users').doc(user.uid).collection('contacts').orderBy('createdAt','desc');
    const unsub = ref.onSnapshot(snap=>{
      list.innerHTML = '';
      snap.forEach(doc=>{
        const d = doc.data();
        const row = el('div','flex justify-between items-center p-2 bg-slate-900 rounded');
        const left = el('div','');
        left.innerHTML = `<strong>${escapeHtml(d.name)}</strong><div class="text-slate-400 text-sm">${escapeHtml(d.email||'')} ${escapeHtml(d.phone||'')}</div>`;
        const actions = el('div','flex gap-2');
        const edit = el('button','text-sm text-slate-300','Edit');
        const del = el('button','text-sm text-red-400','Delete');
        edit.onclick = async ()=>{
          const nm = prompt('Name', d.name); const ph = prompt('Phone', d.phone||''); const em = prompt('Email', d.email||'');
          if(nm) await db.collection('users').doc(user.uid).collection('contacts').doc(doc.id).update({ name:nm, phone:ph, email:em });
        };
        del.onclick = async ()=> { if(confirm('Delete this contact?')) await db.collection('users').doc(user.uid).collection('contacts').doc(doc.id).delete(); };
        actions.append(edit, del);
        row.append(left, actions);
        list.append(row);
      });
      if(snap.empty) list.innerHTML = '<div class="text-slate-400">No contacts yet</div>';
    });

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const name = inpName.value.trim(), phone = inpPhone.value.trim(), email = inpEmail.value.trim();
      if(!name) return alert('Name required');
      await db.collection('users').doc(user.uid).collection('contacts').add({ name, phone, email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      inpName.value=inpPhone.value=inpEmail.value='';
      msgToast('Contact added');
    });

    backBtn.onclick = ()=> { unsub(); renderDashboard(user); };
  }

  // --- RENDER: User Profile editor ---
  async function renderUserProfile(user){
    app.innerHTML = '';
    const header = el('div','flex items-center justify-between mb-4');
    header.appendChild(el('h2','text-xl font-semibold','User Info'));
    const backBtn = el('button','text-sm text-slate-300','Back');
    header.appendChild(backBtn);
    app.append(header);

    const card = el('div','bg-slate-800 p-6 rounded-lg shadow max-w-2xl mx-auto');
    const doc = await db.collection('users').doc(user.uid).get();
    const data = doc.exists ? doc.data() : { displayName: '' };

    card.appendChild(el('div','mb-4',`Email: <strong>${escapeHtml(user.email)}</strong>`));
    const nameRow = el('div','mb-4'); nameRow.innerHTML = `<label class="block text-sm text-slate-300 mb-2">Display Name</label>`;
    const nameInput = el('input','w-full p-3 rounded bg-slate-900'); nameInput.value = data.displayName || '';
    nameRow.appendChild(nameInput);
    card.appendChild(nameRow);
    const saveBtn = el('button','bg-indigo-600 text-white px-4 py-2 rounded','Save');
    card.append(saveBtn, el('p','text-sm text-slate-400 mt-3','Display name saved to profile.'));
    app.append(card);

    saveBtn.onclick = async ()=>{
      try{ await db.collection('users').doc(user.uid).set({ displayName: nameInput.value }, { merge: true }); msgToast('Profile updated'); }
      catch(e){ console.error('profile update err', e); msgToast('Update failed'); }
    };

    backBtn.onclick = ()=> renderDashboard(user);
  }

  // --- RENDER: Dashboard with menu & controls ---
  async function renderDashboard(user){
    app.innerHTML = '';
    // header with menu
    const header = el('div','flex items-center justify-between mb-4');
    header.appendChild(el('h2','text-xl font-semibold','SOS Dashboard'));
    const menuWrap = el('div','relative');
    const menuBtn = el('button','p-2 rounded text-slate-300','⋮');
    const dropdown = el('div','absolute right-0 mt-2 w-48 bg-slate-800 rounded shadow z-50 hidden');
    dropdown.innerHTML = `<div class="p-2"><button id="menu-profile" class="w-full text-left p-2 rounded hover:bg-slate-700">User Info</button>
                          <button id="menu-contacts" class="w-full text-left p-2 rounded hover:bg-slate-700">Manage Contacts</button>
                          <button id="menu-logout" class="w-full text-left p-2 rounded hover:bg-slate-700">Logout</button></div>`;
    menuWrap.append(menuBtn, dropdown);
    header.append(menuWrap);
    app.append(header);

    const card = el('div','bg-slate-800 p-6 rounded-lg shadow flex flex-col items-center gap-4 max-w-2xl mx-auto');
    const big = el('button','sos-pulse bg-red-600 text-white rounded-full flex items-center justify-center','SOS');
    big.style.width='220px'; big.style.height='220px'; big.style.fontSize='38px'; big.id='sos-btn';
    const options = el('div','flex gap-3');
    options.innerHTML = `<label class="text-sm"><input type="checkbox" id="opt-email" checked/> Email</label>
                         <label class="text-sm"><input type="checkbox" id="opt-whatsapp" checked/> WhatsApp</label>
                         <label class="text-sm"><input type="checkbox" id="opt-sms" checked/> SMS</label>
                         <label class="text-sm"><input type="checkbox" id="opt-call" checked/> Call</label>`;

    const voiceRow = el('div','flex items-center gap-2');
    const voiceToggle = el('input',''); voiceToggle.type='checkbox'; voiceRow.append(voiceToggle, el('label','','Enable voice trigger (say "SOS" or "help")'));

    const controls = el('div','flex flex-col gap-3 items-center w-full');
    const imSafe = el('button','bg-green-600 text-white px-4 py-2 rounded',"I'm Safe");
    const stopAlarmBtn = el('button','bg-slate-700 text-white px-4 py-2 rounded hidden','Stop Alarm');
    const status = el('pre','text-sm text-slate-300 bg-slate-900 p-3 rounded w-full','No alerts yet - ready');

    controls.append(imSafe, stopAlarmBtn);
    card.append(big, options, voiceRow, controls, status);
    app.append(card);

    // menu actions
    menuBtn.onclick = ()=> dropdown.classList.toggle('hidden');
    dropdown.querySelector('#menu-profile').onclick = ()=> { dropdown.classList.add('hidden'); renderUserProfile(user); };
    dropdown.querySelector('#menu-contacts').onclick = ()=> { dropdown.classList.add('hidden'); renderContacts(user); };
    dropdown.querySelector('#menu-logout').onclick = ()=> { auth.signOut(); };

    // fetch current contacts
    const contactsSnap = await db.collection('users').doc(user.uid).collection('contacts').get();
    const contacts = contactsSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    // --- Channel functions ---

    async function sendEmails(userEmail, location){
      const ok = await ensureEmailJsReady();
      if(!ok){ console.warn('EmailJS unavailable'); return {sent:0, failed: contacts.length}; }
      let sent=0, failed=0;
      for(const c of contacts){
        if(!c.email){ failed++; continue; }
        const params = { to_name: c.name||'Friend', to_email: c.email, from_name: userEmail, message: `EMERGENCY ALERT: ${userEmail} needs help. Location: ${location.mapsUrl}`, location: location.mapsUrl };
        try{ await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params); sent++; console.log('Email sent to', c.email); } catch(e){ console.error('Email send failed', c.email, e); failed++; }
      }
      return {sent, failed};
    }

    function sendWhatsApps(userEmail, location){
      const msg = encodeURIComponent(`EMERGENCY ALERT\n${userEmail} needs help\nLocation: ${location.mapsUrl}`);
      let opened=0, skipped=0;
      contacts.forEach((c,i)=>{
        if(!c.phone){ skipped++; return; }
        let digits = sanitizePhoneDigits(c.phone);
        // if 10-digit local, prefix default country code (no plus for wa.me)
        if(digits.length === 10) digits = DEFAULT_CC + digits;
        if(digits.length < 8){ skipped++; console.warn('Skipping invalid phone for wa', c.phone); return; }
        setTimeout(()=>{ try{ window.open(`https://wa.me/${digits}?text=${msg}`, '_blank'); opened++; }catch(e){ console.warn('wa open failed', e); } }, i*300);
      });
      return {opened, skipped};
    }

    async function sendSms(userEmail, location){
      const contactsForServer = contacts.map(c => ({ ...c, phone: c.phone ? toE164(c.phone) : c.phone }));
      try{
        const res = await fetch(`${SERVER_URL}/send-sms`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ contacts: contactsForServer, userEmail, location }) });
        const j = await res.json(); console.log('sms resp', j); return j;
      } catch(e){ console.error('SMS request failed', e); throw e; }
    }

    async function makeCalls(userEmail, location){
      const contactsForServer = contacts.map(c => ({ ...c, phone: c.phone ? toE164(c.phone) : c.phone }));
      try{
        const res = await fetch(`${SERVER_URL}/make-call`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ contacts: contactsForServer, userEmail, location }) });
        const j = await res.json(); console.log('call resp', j); return j;
      } catch(e){ console.error('Call request failed', e); throw e; }
    }

    // compose & send
    async function composeAndSend(location){
      const userEmail = user.email;
      status.textContent = 'Sending alerts...';
      if(document.getElementById('opt-email').checked){
        const res = await sendEmails(userEmail, location);
        status.textContent += `\nEmails: ${res.sent} sent, ${res.failed} failed.`;
        if(res.sent === 0) msgToast('Emails not sent — check EmailJS config/template');
      }
      if(document.getElementById('opt-whatsapp').checked){
        const wa = sendWhatsApps(userEmail, location);
        status.textContent += `\nWhatsApp: attempted ${wa.opened}, skipped ${wa.skipped}.`;
        if(wa.opened===0) msgToast('WhatsApp: no valid numbers found');
      }
      if(document.getElementById('opt-sms').checked){
        try{ const smsRes = await sendSms(userEmail, location); if(smsRes && smsRes.ok===false) msgToast('SMS error: '+(smsRes.error||'failed')); } catch(e){ msgToast('SMS failed — check backend'); }
      }
      if(document.getElementById('opt-call').checked){
        try{ const callRes = await makeCalls(userEmail, location); if(callRes && callRes.ok===false) msgToast('Call error: '+(callRes.error||'failed')); } catch(e){ msgToast('Call failed — check backend'); }
      }
    }

    // getLocation helper
    function getLocation(){
      return new Promise((res, rej)=>{
        if(!navigator.geolocation) return rej(new Error('Geolocation not supported'));
        navigator.geolocation.getCurrentPosition(p=>res({ lat:p.coords.latitude, lng:p.coords.longitude, mapsUrl:`https://www.google.com/maps/search/?api=1&query=${p.coords.latitude},${p.coords.longitude}`, timestamp:p.timestamp }), err=>rej(err), { enableHighAccuracy:true, timeout:15000 });
      });
    }

    // SOS flow state
    let alertId = null;
    let trackingInterval = null;

    async function startSosFlow(){
      if(!contacts.length) return alert('Add at least one contact first');
      if(!confirm('Send SOS to your emergency contacts now?')) return;
      // disable main button visually but keep other controls clickable
      big.setAttribute('aria-disabled','true'); big.disabled = true;
      overlayOn();
      if(navigator.vibrate) navigator.vibrate([200,100,200]);
      try{
        const loc = await getLocation().catch(()=>({ lat:0, lng:0, mapsUrl:'Location unavailable', timestamp: Date.now() }));
        const doc = await db.collection('users').doc(user.uid).collection('alerts').add({ userEmail: user.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(), location: loc, status:'active' });
        alertId = doc.id;
        await composeAndSend(loc);
        playAlarm(); stopAlarmBtn.classList.remove('hidden');
        // start tracking positions
        trackingInterval = setInterval(async ()=>{
          try{
            const loc2 = await getLocation();
            await db.collection('users').doc(user.uid).collection('alerts').doc(alertId).collection('positions').add({ lat:loc2.lat, lng:loc2.lng, mapsUrl:loc2.mapsUrl, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            await db.collection('users').doc(user.uid).collection('alerts').doc(alertId).update({ lastLocation: loc2, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          } catch(e){ console.warn('track err', e); }
        }, 12000);
      } catch(e){
        console.error('sos flow err', e);
        alert('SOS failed: '+(e.message||e));
        big.removeAttribute('aria-disabled'); big.disabled = false;
        overlayOff();
      }
    }

    // attach SOS
    big.onclick = async ()=> { await startSosFlow(); };

    // stop alarm button (only stops sound) — should be clickable
    stopAlarmBtn.onclick = ()=> {
      stopAlarm();
      stopAlarmBtn.classList.add('hidden');
      big.removeAttribute('aria-disabled'); big.disabled = false;
      msgToast('Alarm stopped (alert still active)');
    };

    // I'm Safe — cancel alert and stop tracking and alarm
    imSafe.onclick = async ()=> {
      if(!alertId) return msgToast('No active alert');
      try{
        await db.collection('users').doc(user.uid).collection('alerts').doc(alertId).update({ status:'cancelled', cancelledAt: firebase.firestore.FieldValue.serverTimestamp() });
        if(trackingInterval){ clearInterval(trackingInterval); trackingInterval = null; }
        stopAlarm();
        overlayOff();
        stopAlarmBtn.classList.add('hidden');
        big.removeAttribute('aria-disabled'); big.disabled = false;
        msgToast('You marked SAFE');
        alertId = null;
      } catch(e){ console.error('imSafe err', e); msgToast('Failed to cancel alert'); }
    };

    // Voice recognition (start only if available and user agrees)
    if('SpeechRecognition' in window || 'webkitSpeechRecognition' in window){
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      try {
        const rec = new SR();
        rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US';
        rec.onresult = (ev) => {
          for(let i = ev.resultIndex; i < ev.results.length; i++){
            const t = ev.results[i][0].transcript.toLowerCase().trim();
            console.log('voice:', t);
            if(/\b(sos|help me|help|emergency)\b/.test(t)){
              msgToast('Voice command detected — triggering SOS');
              startSosFlow();
            }
          }
        };
        // Start recognition but it may prompt for mic permission
        try { rec.start(); console.log('Voice recognition started'); } catch(err){ console.warn('voice start err', err); }
      } catch(e){ console.warn('voice setup failed', e); }
    } else console.warn('SpeechRecognition unsupported in this browser');

  } // end renderDashboard

  // auth listener
  auth.onAuthStateChanged(user => { if(user) renderContacts(user); else renderLogin(); });

  // initial view
  renderLogin();
  console.log('Frontend initialized — fixed overlay & email loader');

})(); // end main
