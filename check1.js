

const DATA_KEY='legalOfficeFull_v2';
const SESSION_KEY='legalOfficeSession_v2';
const DB_NAME='LegalOfficeFilesV2';
const STORE='documents';
let state=loadState();
let currentUser=null;
let currentView='dashboard';

// ===== Supabase cloud integration =====
const SUPABASE_URL='https://okuvsfxsxohjlunxnurr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_Lqs6y4KOoCbA1JUN-Ye7NA_qn1g3QQf';
const PUSH_PUBLIC_KEY='BAOBHo_rly9ieR9gagYQMgB1cRhmzcU8Bj91g4Q1LT_EGRBOmHo3dbwk-bK8C7BxtTKrlx52WwAKRD-i4uuluOQ';
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,experimental:{passkey:true}}
});
let cloudProfile=null;
let cloudProfiles=[];
let cloudOnline=true;
const LOGIN_ALIASES={
 'siavash.yousefi1352':'siavash.yousefi1352@gmail.com',
 'hania.almasi':'hania.almasi@gmail.com'
};
function cloudRoleName(r){return ({admin:'مدیر',internal_manager:'مدیر داخلی',lawyer:'وکیل',accountant:'حسابدار',secretary:'منشی'})[r]||r||'-'}
function avatarUrl(path){if(!path)return 'icon-192.png';return sb.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl}
function instituteAssetUrl(path){if(!path)return '';return sb.storage.from('institute-assets').getPublicUrl(path).data.publicUrl}
async function getCloudProfile(){
  const {data:{user}}=await sb.auth.getUser(); if(!user)return null;
  const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(error)throw error;
  return {...data,email:data.email||user.email,fullName:data.full_name||user.email,username:(user.email||'').split('@')[0],active:data.active?'1':'0'};
}
async function syncCloudIdentity(){
  try{
    cloudProfile=await getCloudProfile();
    if(!cloudProfile)return false;
    currentUser={id:cloudProfile.id,fullName:cloudProfile.fullName,username:cloudProfile.username,role:cloudProfile.role,active:cloudProfile.active,lawyerId:''};
    cloudOnline=true; return true;
  }catch(e){console.error(e);cloudOnline=false;return false}
}
async function cloudLogin(username,password){
  if(!sb)return false;
  let email=String(username||'').trim();
  if(!email.includes('@'))email=LOGIN_ALIASES[email.toLowerCase()]||email;
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){console.error(error);return false}
  return await syncCloudIdentity();
}
async function loadInstituteSettings(){
  try{
    const {data,error}=await sb.from('app_settings').select('*').eq('id',1).single();if(error)throw error;
    if(data){state.settings={...state.settings,instituteName:data.institute_name||state.settings.instituteName,phone:data.phone||'',address:data.address||'',managerName:data.manager_name||'',registrationNo:data.registration_no||'',warningDays:data.warning_days||5};persist()}
  }catch(e){console.warn('settings cloud',e)}
}
async function loadCloudProfiles(){
  const {data,error}=await sb.from('profiles').select('id,full_name,role,active,email,phone,notify_email,notify_sms,notify_push,avatar_path,alert_timezone').order('created_at');
  if(error){console.warn(error);cloudProfiles=cloudProfile?[cloudProfile]:[]} else cloudProfiles=data||[];
  return cloudProfiles;
}
async function refreshProfileUI(){
  if(!cloudProfile)return;
  const src=avatarUrl(cloudProfile.avatar_path);
  for(const id of ['headerAvatar','settingsAvatar']){let e=document.getElementById(id);if(e)e.src=src}
  let pn=document.getElementById('profileName');if(pn)pn.textContent=cloudProfile.full_name||cloudProfile.fullName||'-';
  let pr=document.getElementById('profileRole');if(pr)pr.textContent=cloudRoleName(cloudProfile.role)+' — '+(cloudProfile.email||'');
  let cs=document.getElementById('cloudStatus');if(cs){cs.textContent=cloudOnline?'متصل به ابر':'آفلاین';cs.classList.toggle('off',!cloudOnline)}
  const ph=document.getElementById('myNotifyPhone');if(ph)ph.value=cloudProfile.phone||'';
  const ne=document.getElementById('myNotifyEmail');if(ne)ne.checked=cloudProfile.notify_email!==false;
  const ns=document.getElementById('myNotifySms');if(ns)ns.checked=cloudProfile.notify_sms===true;
  const np=document.getElementById('myNotifyPush');if(np)np.checked=cloudProfile.notify_push!==false;
  checkPushDeviceStatus().catch(()=>{});
  const af=document.getElementById('adminFaceBox');if(af)af.classList.toggle('hidden',cloudProfile?.role!=='admin');
}
async function uploadMyAvatar(file,targetUserId){
  if(!file)return; if(file.size>5*1024*1024){toast('حجم عکس حداکثر ۵ مگابایت باشد');return}
  try{
    const uidTarget=targetUserId||cloudProfile.id;
    const ext=(file.name.split('.').pop()||'jpg').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
    const path=`${uidTarget}/avatar-${Date.now()}.${ext}`;
    const {error:upErr}=await sb.storage.from('profile-avatars').upload(path,file,{upsert:true,contentType:file.type||'image/jpeg'});if(upErr)throw upErr;
    if(uidTarget===cloudProfile.id){const {error}=await sb.rpc('set_my_avatar',{p_avatar_path:path});if(error)throw error;cloudProfile.avatar_path=path}
    else {const {error}=await sb.from('profiles').update({avatar_path:path}).eq('id',uidTarget);if(error)throw error}
    await refreshProfileUI();await renderUsers();toast('عکس پروفایل ذخیره شد');
  }catch(e){console.error(e);toast('ذخیره عکس انجام نشد')}
}
async function removeMyAvatar(){
  try{const {error}=await sb.rpc('set_my_avatar',{p_avatar_path:null});if(error)throw error;cloudProfile.avatar_path=null;await refreshProfileUI();toast('عکس حذف شد')}catch(e){console.error(e);toast('حذف عکس انجام نشد')}
}
async function registerPasskey(){
  try{
    if(!sb?.auth?.registerPasskey){toast('نسخه مرورگر/کتابخانه Passkey را پشتیبانی نمی‌کند');return}
    const {error}=await sb.auth.registerPasskey(); if(error)throw error; toast('ورود با اثر انگشت/Passkey فعال شد');await listPasskeys();
  }catch(e){console.error(e);toast((e?.message||'فعال‌سازی Passkey انجام نشد').slice(0,120))}
}
async function signInWithPasskey(){
  try{
    if(!sb?.auth?.signInWithPasskey){toast('Passkey در این مرورگر در دسترس نیست');return}
    const {error}=await sb.auth.signInWithPasskey();if(error)throw error;
    if(await syncCloudIdentity())startApp();
  }catch(e){console.error(e);toast((e?.message||'ورود با Passkey انجام نشد').slice(0,120))}
}
async function listPasskeys(){
  let el=document.getElementById('passkeyList');if(!el)return;
  try{const {data,error}=await sb.auth.passkey.list();if(error)throw error;el.innerHTML=(data||[]).map(x=>`🔑 ${esc(x.friendly_name||'Passkey')} — ${new Date(x.created_at).toLocaleDateString('fa-IR')}`).join('<br>')||'هنوز Passkey ثبت نشده است.'}catch(e){el.textContent='برای استفاده، Passkey باید در تنظیمات Auth پروژه فعال باشد.'}
}
function soundPattern(key){return ({
 legal_chime_1:[660,880],legal_chime_2:[520,660,880],legal_chime_3:[880,660,880,990],
 gentle:[440,554],strong:[880,880,1040],court_bell:[392,523,659,784],crystal:[784,988,1175],
 reminder:[523,659,784,659],urgent:[1040,1040,880,1040,1175],pulse:[440,660,440,660],
 soft_chime:[349,440,523],triple_bell:[659,784,988,659],classic:[523,659,784],deep:[330,440,523]
})[key]||[660,880]}
function playAlertSound(key='legal_chime_1'){
  try{const ctx=new (window.AudioContext||window.webkitAudioContext)();let t=ctx.currentTime;for(const f of soundPattern(key)){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f;o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.18,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.22);o.start(t);o.stop(t+.24);t+=.28}setTimeout(()=>ctx.close(),1800)}catch(e){toast('پخش صدا در این دستگاه ممکن نیست')}
}
async function requestNotifications(){if('Notification'in window&&Notification.permission==='default')await Notification.requestPermission()}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function saveMyNotificationPrefs(){
 try{
  const phone=(document.getElementById('myNotifyPhone')?.value||'').trim();
  const patch={phone:phone||null,notify_email:!!document.getElementById('myNotifyEmail')?.checked,notify_sms:!!document.getElementById('myNotifySms')?.checked,notify_push:!!document.getElementById('myNotifyPush')?.checked};
  const {error}=await sb.rpc('set_my_notification_prefs',{p_phone:patch.phone||'',p_notify_email:patch.notify_email,p_notify_sms:patch.notify_sms,p_notify_push:patch.notify_push,p_alert_timezone:cloudProfile.alert_timezone||'Asia/Tehran'});if(error)throw error;Object.assign(cloudProfile,patch);toast('تنظیمات اعلان ذخیره شد');
 }catch(e){console.error(e);toast('ذخیره تنظیمات اعلان انجام نشد')}
}
async function getReadyServiceWorker(){
 if(!('serviceWorker'in navigator))throw new Error('Service Worker در این مرورگر پشتیبانی نمی‌شود');
 let reg=await navigator.serviceWorker.getRegistration();
 if(!reg)reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
 try{await reg.update()}catch{}
 return navigator.serviceWorker.ready
}
function notificationPermissionFa(){
 if(!('Notification'in window))return 'پشتیبانی نمی‌شود';
 return Notification.permission==='granted'?'مجاز':Notification.permission==='denied'?'مسدود':'هنوز پرسیده نشده';
}
async function enablePushOnThisDevice(){
 try{
  if(!('PushManager'in window)||!('Notification'in window))throw new Error('اعلان Push در این مرورگر پشتیبانی نمی‌شود');
  let perm=Notification.permission;
  if(perm==='denied')throw new Error('مجوز اعلان در مرورگر/سیستم مسدود است. در تنظیمات برنامه یا Site settings، Notifications را روی Allow بگذارید و دوباره تلاش کنید.');
  if(perm!=='granted')perm=await Notification.requestPermission();
  if(perm!=='granted')throw new Error('مجوز اعلان صادر نشد. لطفاً Notifications را برای app.haghmadaran.com روی Allow قرار دهید.');
  const reg=await getReadyServiceWorker();let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(PUSH_PUBLIC_KEY)});
  const j=sub.toJSON(),keys=j.keys||{};
  const {error}=await sb.from('push_subscriptions').upsert({user_id:cloudProfile.id,endpoint:j.endpoint,p256dh:keys.p256dh,auth:keys.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()},{onConflict:'user_id,endpoint'});if(error)throw error;
  if(cloudProfile.notify_push===false){const {error:e2}=await sb.rpc('set_my_notification_prefs',{p_phone:cloudProfile.phone||'',p_notify_email:cloudProfile.notify_email!==false,p_notify_sms:cloudProfile.notify_sms===true,p_notify_push:true,p_alert_timezone:cloudProfile.alert_timezone||'Asia/Tehran'});if(!e2)cloudProfile.notify_push=true}
  let np=document.getElementById('myNotifyPush');if(np)np.checked=true;await checkPushDeviceStatus();toast('✅ اعلان این دستگاه فعال شد');
 }catch(e){console.error(e);toast((e?.message||'فعال‌سازی اعلان انجام نشد').slice(0,220))}
}
async function testLocalNotification(){
 try{
  if(!('Notification'in window))throw new Error('اعلان در این مرورگر پشتیبانی نمی‌شود');
  if(Notification.permission!=='granted')throw new Error('ابتدا مجوز اعلان را فعال کنید');
  const reg=await getReadyServiceWorker();
  await reg.showNotification('⚖️ تست اعلان سامانه',{body:'اعلان سامانه حق مداران روی این دستگاه فعال است.',icon:'./icon-192.png',badge:'./icon-192.png',tag:'legaloffice-test',vibrate:[180,80,180]});
  playAlertSound('legal_chime_1');toast('اعلان آزمایشی ارسال شد');
 }catch(e){console.error(e);toast((e?.message||'تست اعلان انجام نشد').slice(0,180))}
}
async function disablePushOnThisDevice(){
 try{const reg=await getReadyServiceWorker(),sub=await reg.pushManager.getSubscription();if(sub){const ep=sub.endpoint;await sub.unsubscribe();await sb.from('push_subscriptions').delete().eq('user_id',cloudProfile.id).eq('endpoint',ep)}await checkPushDeviceStatus();toast('اعلان این دستگاه خاموش شد')}catch(e){console.error(e);toast('خاموش کردن اعلان انجام نشد')}
}
async function checkPushDeviceStatus(){
 const el=document.getElementById('pushDeviceStatus');if(!el)return;
 try{
  if(!('serviceWorker'in navigator)||!('PushManager'in window)){el.textContent='این دستگاه اعلان Push را پشتیبانی نمی‌کند.';return}
  const perm=notificationPermissionFa();const reg=await navigator.serviceWorker.getRegistration();const sub=reg?await reg.pushManager.getSubscription():null;
  el.textContent=sub?`✅ اعلان این دستگاه فعال است. مجوز مرورگر: ${perm}`:`اعلان این دستگاه هنوز فعال نشده است. مجوز مرورگر: ${perm}`;
 }catch{el.textContent='وضعیت اعلان قابل بررسی نیست.'}
}


function appearanceHeaderColor(theme,choice,custom){
 const auto={navy:'#172433',green:'#164c36',burgundy:'#5f1f31',purple:'#3d2b62',gold:'#5d4719',slate:'#33485a',ocean:'#075f6c',teal:'#115e59',rose:'#7f1d3d',indigo:'#312e81',orange:'#7c2d12',black:'#050709'};
 const fixed={navy:'#172433',blue:'#0e4d83',teal:'#115e59',green:'#164c36',burgundy:'#5f1f31',purple:'#3d2b62',gold:'#6b4f00',slate:'#33485a',black:'#050709'};
 if(choice==='custom')return custom||'#172433'; if(choice==='auto')return auto[theme]||'#172433'; return fixed[choice]||'#172433';
}
function applyAppearanceSettings(){
 const theme=document.getElementById('themeSelect')?.value||localStorage.getItem('legaloffice-theme')||'navy';
 const bg=document.getElementById('backgroundSelect')?.value||localStorage.getItem('legaloffice-bg')||'default';
 let mode=document.getElementById('displayModeSelect')?.value||localStorage.getItem('legaloffice-mode')||'light';
 const headerChoice=document.getElementById('headerThemeSelect')?.value||localStorage.getItem('legaloffice-header-theme')||'auto';
 const headerCustom=document.getElementById('headerCustomColor')?.value||localStorage.getItem('legaloffice-header-custom')||'#172433';
 const bgCustom=document.getElementById('backgroundCustomColor')?.value||localStorage.getItem('legaloffice-bg-custom')||'#f4f6f8';
 document.body.classList.remove('theme-navy','theme-green','theme-burgundy','theme-purple','theme-gold','theme-slate','theme-ocean','theme-teal','theme-rose','theme-indigo','theme-orange','theme-black','bg-cream','bg-blue','bg-gray','bg-white','bg-mint','bg-rose','bg-lavender','bg-sand','bg-gradient-blue','bg-gradient-warm','bg-gradient-mint','dark-mode');
 document.body.style.background=''; document.body.style.removeProperty('--bg');
 document.body.classList.add('theme-'+theme);
 if(bg==='custom'){document.body.style.setProperty('--bg',bgCustom)}else if(bg!=='default')document.body.classList.add('bg-'+bg);
 if(mode==='auto')mode=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';if(mode==='dark')document.body.classList.add('dark-mode');
 const hc=appearanceHeaderColor(theme,headerChoice,headerCustom);document.documentElement.style.setProperty('--header-bg',hc);document.documentElement.style.setProperty('--nav-bg',hc);
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',hc);
}
function saveAppearanceSettings(){
 const theme=document.getElementById('themeSelect')?.value||'navy',bg=document.getElementById('backgroundSelect')?.value||'default',mode=document.getElementById('displayModeSelect')?.value||'light';
 const ht=document.getElementById('headerThemeSelect')?.value||'auto',hc=document.getElementById('headerCustomColor')?.value||'#172433',bc=document.getElementById('backgroundCustomColor')?.value||'#f4f6f8';
 localStorage.setItem('legaloffice-theme',theme);localStorage.setItem('legaloffice-bg',bg);localStorage.setItem('legaloffice-mode',mode);localStorage.setItem('legaloffice-header-theme',ht);localStorage.setItem('legaloffice-header-custom',hc);localStorage.setItem('legaloffice-bg-custom',bc);applyAppearanceSettings();toast('ظاهر سامانه ذخیره شد');
}
function loadAppearanceSettings(){
 const vals={theme:localStorage.getItem('legaloffice-theme')||'navy',bg:localStorage.getItem('legaloffice-bg')||'default',mode:localStorage.getItem('legaloffice-mode')||'light',ht:localStorage.getItem('legaloffice-header-theme')||'auto',hc:localStorage.getItem('legaloffice-header-custom')||'#172433',bc:localStorage.getItem('legaloffice-bg-custom')||'#f4f6f8'};
 const ids=[['themeSelect',vals.theme],['backgroundSelect',vals.bg],['displayModeSelect',vals.mode],['headerThemeSelect',vals.ht],['headerCustomColor',vals.hc],['backgroundCustomColor',vals.bc]];for(const [id,v] of ids){const e=document.getElementById(id);if(e)e.value=v}applyAppearanceSettings();
}
function resetAppearanceSettings(){['legaloffice-theme','legaloffice-bg','legaloffice-mode','legaloffice-header-theme','legaloffice-header-custom','legaloffice-bg-custom'].forEach(k=>localStorage.removeItem(k));loadAppearanceSettings();toast('ظاهر پیش‌فرض اعمال شد')}

async function populateAlertUserSelect(){
  await loadCloudProfiles();let sel=document.getElementById('alertUserSelect');if(!sel)return;
  let allowed=cloudProfile?.role==='admin'?cloudProfiles:cloudProfiles.filter(x=>x.id===cloudProfile.id);
  sel.innerHTML=allowed.map(x=>`<option value="${x.id}">${esc(x.full_name||x.email||x.id)}</option>`).join('');
  if(!sel.value&&cloudProfile)sel.value=cloudProfile.id;
}
async function loadAlertRules(){
  let box=document.getElementById('alertRulesList');if(!box)return;
  let userId=document.getElementById('alertUserSelect')?.value||cloudProfile?.id;if(!userId)return;
  const {data,error}=await sb.from('hearing_alert_rules').select('*').eq('user_id',userId).order('sort_order');
  if(error){box.innerHTML=`<div class="empty">خطا در دریافت تنظیمات هشدار</div>`;return}
  box.innerHTML=(data||[]).map(r=>alertRuleHtml(r)).join('')||'<div class="empty">هشداری تعریف نشده است.</div>';
}
function alertRuleHtml(r){
 const sounds=[['legal_chime_1','زنگ اداری ۱'],['legal_chime_2','زنگ اداری ۲'],['legal_chime_3','زنگ اداری ۳'],['court_bell','زنگ دادگاه'],['crystal','کریستالی'],['reminder','یادآوری'],['soft_chime','ملایم آرام'],['triple_bell','سه‌زنگ'],['classic','کلاسیک'],['deep','بم و رسمی'],['pulse','ضربانی'],['gentle','ملایم'],['strong','قوی'],['urgent','فوری/قوی']];
 return `<div class="alert-rule" data-id="${r.id}"><div class="form-grid">
 <label>عنوان<input data-f="label" value="${esc(r.label||'هشدار')}"></label>
 <label>چند روز قبل<input data-f="days_before" type="number" min="0" max="30" value="${r.days_before}"></label>
 <label>ساعت<input data-f="send_time" type="time" value="${String(r.send_time||'09:00').slice(0,5)}"></label>
 <label>صدا<select data-f="sound_key">${sounds.map(([k,n])=>`<option value="${k}" ${r.sound_key===k?'selected':''}>${n}</option>`).join('')}</select></label>
 <div class="wide switches">
 ${[['enabled','فعال'],['email_enabled','ایمیل'],['sms_enabled','SMS'],['push_enabled','اعلان'],['alarm_enabled','زنگ']].map(([k,n])=>`<label class="switch"><input data-f="${k}" type="checkbox" ${r[k]?'checked':''}>${n}</label>`).join('')}
 </div>
 <div class="wide actions"><button type="button" class="primary" onclick="saveAlertRule('${r.id}')">ذخیره</button><button type="button" class="secondary sound-preview" onclick="previewRuleSound('${r.id}')">🔊 تست صدا</button><button type="button" class="danger" onclick="deleteAlertRule('${r.id}')">حذف</button></div>
 </div></div>`
}
async function addAlertRule(){
 let userId=document.getElementById('alertUserSelect')?.value||cloudProfile?.id;if(!userId)return;
 const {error}=await sb.from('hearing_alert_rules').insert({user_id:userId,label:'هشدار جدید',days_before:1,send_time:'09:00',enabled:true,email_enabled:true,sms_enabled:false,push_enabled:true,alarm_enabled:true,sound_key:'legal_chime_1',sort_order:99});
 if(error){toast('افزودن هشدار انجام نشد');console.error(error)}else{await loadAlertRules();toast('هشدار اضافه شد')}
}
async function saveAlertRule(id){
 let el=document.querySelector(`.alert-rule[data-id="${id}"]`);if(!el)return;let obj={};
 el.querySelectorAll('[data-f]').forEach(x=>{obj[x.dataset.f]=x.type==='checkbox'?x.checked:(x.dataset.f==='days_before'?Number(x.value):x.value)});
 const {error}=await sb.from('hearing_alert_rules').update(obj).eq('id',id);if(error){console.error(error);toast('ذخیره هشدار انجام نشد')}else toast('هشدار ذخیره شد')
}
async function deleteAlertRule(id){if(!confirm('این هشدار حذف شود؟'))return;const {error}=await sb.from('hearing_alert_rules').delete().eq('id',id);if(error)toast('حذف انجام نشد');else{await loadAlertRules();toast('حذف شد')}}
function previewRuleSound(id){let el=document.querySelector(`.alert-rule[data-id="${id}"]`);playAlertSound(el?.querySelector('[data-f="sound_key"]')?.value||'legal_chime_1')}
async function checkInAppAlarms(){
 if(!cloudProfile||document.hidden)return;
 try{
  const {data:rules}=await sb.from('hearing_alert_rules').select('*').eq('user_id',cloudProfile.id).eq('enabled',true).eq('alarm_enabled',true);
  if(!rules?.length)return;
  const {data:deadlines}=await sb.from('deadlines').select('id,title,due_date,due_time,status').eq('status','باز');
  const now=new Date();const hh=String(now.getHours()).padStart(2,'0'),mm=String(Math.floor(now.getMinutes()/10)*10).padStart(2,'0'),slot=`${hh}:${mm}`;
  for(const r of rules){if(String(r.send_time||'').slice(0,5)!==slot)continue;for(const d of deadlines||[]){let diff=daysUntilJalali(d.due_date);if(diff!==r.days_before)continue;let k=`alarm:${cloudProfile.id}:${d.id}:${r.id}:${now.toISOString().slice(0,10)}:${slot}`;if(localStorage.getItem(k))continue;localStorage.setItem(k,'1');playAlertSound(r.sound_key);if('Notification'in window&&Notification.permission==='granted')new Notification('⚖️ یادآوری جلسه',{body:`${d.title} — ${d.due_date} ${d.due_time||''}`,icon:'icon-192.png'});toast(`هشدار: ${d.title}`)}}
 }catch(e){console.warn('alarm check',e)}
}
setInterval(checkInAppAlarms,60000);



const CLOUD_TABLES={clients:'clients',lawyers:'lawyers',cases:'cases',contracts:'contracts',payments:'payments',checks:'checks',expenses:'expenses',deadlines:'deadlines',tasks:'tasks',timeline:'case_timeline'};
function cloudToLocal(kind,r){
 const m={
  clients:{id:r.id,name:r.full_name,nationalId:r.national_id,phone:r.phone,phone2:r.phone2,email:r.email,birthDate:r.birth_date,address:r.address,notes:r.notes,createdAt:r.created_at},
  lawyers:{id:r.id,name:r.full_name,license:r.license_no,bar:r.bar,phone:r.phone,email:r.email,share:r.share_percent,notes:r.notes,createdAt:r.created_at},
  cases:{id:r.id,title:r.title,clientId:r.client_id,lawyerId:r.lawyer_id,caseNo:r.case_no,archiveNo:r.archive_no,judgmentNo:r.judgment_no,branch:r.branch,court:r.court,type:r.case_type,clientRole:r.client_role,opponent:r.opposing_party,opponentLawyer:r.opposing_lawyer,filingDate:r.filing_date,status:r.status,stage:r.stage,nextAction:r.next_action,notes:r.notes,createdAt:r.created_at},
  contracts:{id:r.id,clientId:r.client_id,caseId:r.case_id,lawyerId:r.lawyer_id,type:r.contract_type,number:r.contract_no,amount:r.amount,successPercent:r.success_percent,successBase:r.success_base,lawyerShare:r.lawyer_share,startDate:r.start_date,endDate:r.end_date,status:r.status,notes:r.notes,createdAt:r.created_at},
  payments:{id:r.id,contractId:r.contract_id,amount:r.amount,date:r.payment_date,method:r.method,reference:r.reference_no,receiver:r.receiver,notes:r.notes,createdAt:r.created_at},
  checks:{id:r.id,clientId:r.client_id,contractId:r.contract_id,bank:r.bank,checkNo:r.check_no,sayad:r.sayad_id,issuer:r.issuer,amount:r.amount,dueDate:r.due_date,status:r.status,notes:r.notes,createdAt:r.created_at},
  expenses:{id:r.id,caseId:r.case_id,clientId:r.client_id,type:r.expense_type,amount:r.amount,date:r.expense_date,payer:r.payer,notes:r.notes,createdAt:r.created_at},
  deadlines:{id:r.id,caseId:r.case_id,lawyerId:r.lawyer_id,title:r.title,dueDate:r.due_date,time:r.due_time,type:r.deadline_type,status:r.status,notes:r.notes,createdAt:r.created_at},
  tasks:{id:r.id,caseId:r.case_id,lawyerId:r.lawyer_id,title:r.title,dueDate:r.due_date,priority:r.priority,status:r.status,notes:r.notes,createdAt:r.created_at},
  timeline:{id:r.id,caseId:r.case_id,date:r.event_date,type:r.event_type,description:r.description,createdAt:r.created_at}
 };
 return m[kind]||r;
}
function localToCloud(kind,o){
 const base={created_by:cloudProfile?.id};
 const m={
  clients:{full_name:o.name,national_id:o.nationalId||null,phone:o.phone||null,phone2:o.phone2||null,email:o.email||null,birth_date:o.birthDate||null,address:o.address||null,notes:o.notes||null},
  lawyers:{full_name:o.name,license_no:o.license||null,bar:o.bar||null,phone:o.phone||null,email:o.email||null,share_percent:Number(o.share||0),notes:o.notes||null},
  cases:{title:o.title,client_id:o.clientId||null,lawyer_id:o.lawyerId||null,case_no:o.caseNo||null,archive_no:o.archiveNo||null,judgment_no:o.judgmentNo||null,branch:o.branch||null,court:o.court||null,case_type:o.type||null,client_role:o.clientRole||null,opposing_party:o.opponent||null,opposing_lawyer:o.opponentLawyer||null,filing_date:o.filingDate||null,status:o.status||'فعال',stage:o.stage||null,next_action:o.nextAction||null,notes:o.notes||null},
  contracts:{client_id:o.clientId||null,case_id:o.caseId||null,lawyer_id:o.lawyerId||null,contract_type:o.type||null,contract_no:o.number||null,amount:Number(o.amount||0),success_percent:Number(o.successPercent||0),success_base:o.successBase||null,lawyer_share:Number(o.lawyerShare||0),start_date:o.startDate||null,end_date:o.endDate||null,status:o.status||'فعال',notes:o.notes||null},
  payments:{contract_id:o.contractId||null,amount:Number(o.amount||0),payment_date:o.date||null,method:o.method||null,reference_no:o.reference||null,receiver:o.receiver||null,notes:o.notes||null},
  checks:{client_id:o.clientId||null,contract_id:o.contractId||null,bank:o.bank||null,check_no:o.checkNo||null,sayad_id:o.sayad||null,issuer:o.issuer||null,amount:Number(o.amount||0),due_date:o.dueDate||null,status:o.status||'در انتظار',notes:o.notes||null},
  expenses:{case_id:o.caseId||null,client_id:o.clientId||null,expense_type:o.type||null,amount:Number(o.amount||0),expense_date:o.date||null,payer:o.payer||null,notes:o.notes||null},
  deadlines:{case_id:o.caseId||null,lawyer_id:o.lawyerId||null,title:o.title,due_date:o.dueDate||null,due_time:o.time||null,deadline_type:o.type||null,status:o.status||'باز',notes:o.notes||null},
  tasks:{case_id:o.caseId||null,lawyer_id:o.lawyerId||null,title:o.title,due_date:o.dueDate||null,priority:o.priority||'عادی',status:o.status||'باز',notes:o.notes||null},
  timeline:{case_id:o.caseId||null,event_date:o.date||null,event_type:o.type||null,description:o.description}
 };
 return {...m[kind],...base};
}
async function syncCoreFromCloud(){
 if(!sb||!cloudProfile)return false;
 try{
  const kinds=Object.keys(CLOUD_TABLES);
  const results=await Promise.all(kinds.map(k=>sb.from(CLOUD_TABLES[k]).select('*')));
  for(let i=0;i<kinds.length;i++){
    const k=kinds[i],res=results[i]; if(res.error)throw res.error;
    state[k]=(res.data||[]).map(r=>cloudToLocal(k,r));
  }
  persist(); cloudOnline=true; return true;
 }catch(e){console.warn('sync core cloud',e);cloudOnline=false;return false}
}
async function saveCloudRecord(kind,obj,editId){
 const table=CLOUD_TABLES[kind];if(!table)return null;
 const payload=localToCloud(kind,obj);
 if(editId){delete payload.created_by;const {data,error}=await sb.from(table).update(payload).eq('id',editId).select().single();if(error)throw error;return data}
 const {data,error}=await sb.from(table).insert(payload).select().single();if(error)throw error;return data;
}
async function deleteCloudRecord(kind,id){const table=CLOUD_TABLES[kind];if(!table)return;const {error}=await sb.from(table).delete().eq('id',id);if(error)throw error}

function defaultState(){
 return {
   version:2,
   settings:{instituteName:'سامانه جامع مدیریت موسسه حقوقی',phone:'',address:'',managerName:'',registrationNo:'',warningDays:5},
   users:[],
   clients:[],lawyers:[],cases:[],contracts:[],payments:[],checks:[],expenses:[],deadlines:[],tasks:[],timeline:[]
 };
}
function loadState(){try{let x=JSON.parse(localStorage.getItem(DATA_KEY));return x&&x.version?x:defaultState()}catch(e){return defaultState()}}
function persist(){localStorage.setItem(DATA_KEY,JSON.stringify(state))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(n){return Number(n||0).toLocaleString('fa-IR')}
function toast(msg){let e=document.getElementById('toast');e.textContent=msg;e.style.display='block';clearTimeout(window._toast);window._toast=setTimeout(()=>e.style.display='none',2200)}
function find(arr,id){return arr.find(x=>x.id===id)}
function clientName(id){return find(state.clients,id)?.name||'-'}
function lawyerName(id){return find(state.lawyers,id)?.name||'-'}
function caseName(id){return find(state.cases,id)?.title||'-'}
function contractName(id){let x=find(state.contracts,id);return x?(x.number||x.type||'قرارداد'):'-'}
function roleName(r){return ({admin:'مدیر',internal_manager:'مدیر داخلی',lawyer:'وکیل',accountant:'حسابدار',secretary:'منشی'})[r]||r}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
function resetForm(id){let f=document.getElementById(id);if(f){f.reset();let e=f.querySelector('[name=editId]');if(e)e.value=''}}
async function sha256(text){let b=new TextEncoder().encode(text);let h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function ensureAdmin(){
 if(!state.users.length){
   state.users.push({id:uid(),fullName:'مدیر سیستم',username:'admin',passwordHash:await sha256('admin123'),role:'admin',active:'1',lawyerId:''});
   persist();
 }
}
function can(view){
 if(!currentUser)return false;
 if(currentUser.role==='admin')return true;
 const p={
  internal_manager:['dashboard','clients','lawyers','cases','contracts','payments','checks','expenses','deadlines','tasks','timeline','documents','adliran','contractstudio','letters','handovers','reports','users','search','settings','backup'],
  lawyer:['dashboard','clients','lawyers','cases','deadlines','tasks','timeline','documents','handovers','search','settings','backup'],
  accountant:['dashboard','clients','contracts','payments','checks','expenses','reports','search','settings','backup'],
  secretary:['dashboard','clients','lawyers','cases','deadlines','tasks','timeline','documents','handovers','search','settings','backup']
 };
 return (p[currentUser.role]||[]).includes(view);
}


const KPI_META={
  clients:['موکلین','#2563eb'],
  cases:['پرونده‌های فعال','#0f766e'],
  lawyers:['وکلا','#8b5cf6'],
  contracts:['قراردادها','#f59e0b'],
  contractValue:['ارزش قراردادها','#a16207'],
  paid:['وصول‌شده','#16a34a'],
  receivable:['مانده قراردادها','#4f46e5'],
  checks:['چک‌های باز','#0284c7'],
  expenses:['هزینه‌ها','#e11d48'],
  urgent:['مهلت‌های نزدیک/گذشته','#dc2626']
};
function kpiPrefs(){
  try{return JSON.parse(localStorage.getItem('legalOfficeKpiColors')||'{}')}catch{return{}}
}
function applyKpiColors(){
  const prefs=kpiPrefs();
  document.querySelectorAll('[data-kpi-key]').forEach(el=>{
    const k=el.dataset.kpiKey;
    el.style.setProperty('--kpi-color',prefs[k]||KPI_META[k]?.[1]||'#2563eb');
  });
  renderKpiColorSettings();
}
function renderKpiColorSettings(){
  const box=document.getElementById('kpiColorSettings');if(!box)return;
  const prefs=kpiPrefs();
  box.innerHTML=Object.entries(KPI_META).map(([k,[label,def]])=>`
    <label class="kpi-color-row">
      <span>${label}</span>
      <input type="color" value="${prefs[k]||def}" oninput="setKpiColor('${k}',this.value)">
    </label>`).join('');
}
function setKpiColor(key,color){
  const p=kpiPrefs();p[key]=color;localStorage.setItem('legalOfficeKpiColors',JSON.stringify(p));
  document.querySelectorAll(`[data-kpi-key="${key}"]`).forEach(el=>el.style.setProperty('--kpi-color',color));
}
function resetKpiColors(){
  localStorage.removeItem('legalOfficeKpiColors');applyKpiColors();toast('رنگ کارت‌های اصلی به حالت پیش‌فرض برگشت');
}

const LAUNCHER_META={
  dashboard:['خانه','#0f172a'],search:['جستجو','#0ea5e9'],settings:['تنظیمات','#475569'],
  clients:['موکلین','#2563eb'],lawyers:['وکلا','#8b5cf6'],cases:['پرونده‌ها','#0f766e'],
  contracts:['قراردادها','#f59e0b'],payments:['دریافت‌ها','#16a34a'],checks:['چک‌ها','#0284c7'],
  expenses:['هزینه‌ها','#e11d48'],deadlines:['مهلت‌ها','#dc2626'],tasks:['کارها','#4f46e5'],
  timeline:['گردش پرونده','#0891b2'],documents:['اسناد','#1d4ed8'],adliran:['عدل ایران','#7c3aed'],
  contractstudio:['قراردادساز','#a855f7'],letters:['نامه‌نگاری','#f97316'],handovers:['تحویل مدارک','#64748b'],
  reports:['گزارش‌ها','#14b8a6'],users:['کاربران','#334155'],backup:['پشتیبان','#6b7280'],
  music:['موسیقی','#7c3aed'],tv:['تلویزیون','#ea580c']
};
function launcherPrefs(){
  try{return JSON.parse(localStorage.getItem('legalOfficeLauncherColors')||'{}')}catch{return{}}
}
function applyLauncherColors(){
  const prefs=launcherPrefs();
  document.querySelectorAll('[data-color-key]').forEach(el=>{
    const k=el.dataset.colorKey;
    const c=prefs[k]||LAUNCHER_META[k]?.[1]||'#2563eb';
    el.style.setProperty('--tile-color',c);
  });
  renderLauncherColorSettings();
}
function renderLauncherColorSettings(){
  const box=document.getElementById('launcherColorSettings');if(!box)return;
  const prefs=launcherPrefs();
  box.innerHTML=Object.entries(LAUNCHER_META).map(([k,[label,def]])=>`
    <label class="launcher-color-row">
      <span>${label}</span>
      <input type="color" value="${prefs[k]||def}" oninput="setLauncherColor('${k}',this.value)">
    </label>`).join('');
}
function setLauncherColor(key,color){
  const p=launcherPrefs();p[key]=color;localStorage.setItem('legalOfficeLauncherColors',JSON.stringify(p));
  document.querySelectorAll(`[data-color-key="${key}"]`).forEach(el=>el.style.setProperty('--tile-color',color));
}
function resetLauncherColors(){
  localStorage.removeItem('legalOfficeLauncherColors');applyLauncherColors();toast('رنگ مربع‌ها به حالت پیش‌فرض برگشت');
}
function openLauncherView(v){
  try{showView(v)}catch(e){console.error(e);toast('باز کردن این بخش انجام نشد')}
}
function openLauncherMusic(){
  const p=document.getElementById('musicPanel');
  if(!p){toast('مرکز موسیقی پیدا نشد');return}
  p.classList.remove('hidden');
  try{switchUnifiedMediaTab('music')}catch(e){console.warn(e)}
  try{renderMusicFavorites()}catch{}
  const a=getOfficeAudio();
  if(a?.src) setTimeout(updateMusicControlUI,30);
}
function openLauncherTv(){
  try{openUnifiedTv()}catch(e){
    const p=document.getElementById('musicPanel');if(p)p.classList.remove('hidden');
    try{switchUnifiedMediaTab('tv')}catch{}
  }
}

function applyPermissions(){
 document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('nav-hidden',!can(b.dataset.view)));
 document.querySelectorAll('[data-launcher-view]').forEach(b=>b.classList.toggle('launcher-hidden',!can(b.dataset.launcherView)));
 applyLauncherColors();
}
async function loginUser(username,password){
 let u=state.users.find(x=>x.username.trim()===username.trim()&&x.active!=='0');
 if(!u)return false;
 let hash=await sha256(password);
 if(hash!==u.passwordHash)return false;
 currentUser=u;sessionStorage.setItem(SESSION_KEY,u.id);return true;
}
async function logout(){try{await sb.auth.signOut()}catch(e){} currentUser=null;cloudProfile=null;document.getElementById('app').classList.add('hidden');document.getElementById('loginScreen').classList.remove('hidden')}

document.getElementById('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();let f=formData(e.target);
 if(await cloudLogin(f.username,f.password)){e.target.reset();await loadInstituteSettings();startApp()}else toast('نام کاربری/ایمیل یا رمز عبور صحیح نیست');
});

async function startApp(){
 document.getElementById('loginScreen').classList.add('hidden');document.getElementById('app').classList.remove('hidden');
 document.getElementById('brandTitle').textContent='⚖️ '+(state.settings.instituteName||'سامانه جامع مدیریت موسسه حقوقی');
 document.getElementById('currentUserLabel').textContent=`${currentUser.fullName} — ${roleName(currentUser.role)}`;
 applyPermissions();
 await syncCoreFromCloud();
 buildViews();renderAll();refreshProfileUI();checkPushDeviceStatus();applyPermissions();applyLauncherColors();applyKpiColors();showView(can('dashboard')?'dashboard':'search');
}
function showView(v){
 if(!can(v)){toast('دسترسی این بخش برای شما فعال نیست');return}
 currentView=v;document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.getElementById(v).classList.add('active');
 document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
 document.querySelectorAll('[data-launcher-view]').forEach(x=>x.setAttribute('aria-current',x.dataset.launcherView===v?'page':'false'));
 if(v==='reports')renderReports();if(v==='documents')renderDocuments();if(v==='adliran'){loadAdliranProfiles();loadAdliranDocuments();}if(v==='contractstudio'){prepareOfficeWorkflowSelects();loadContractDrafts();}if(v==='letters'){prepareOfficeWorkflowSelects();loadLetterDrafts();}if(v==='handovers'){prepareOfficeWorkflowSelects();loadHandovers();}if(v==='users')renderUsers();if(v==='settings'){renderSettings();loadAppearanceSettings();applyKpiColors();applyLauncherColors();checkPushDeviceStatus();populateAlertUserSelect().then(loadAlertRules);listPasskeys();}
 window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));

function selectOptions(arr,label,includeBlank=true){return (includeBlank?'<option value="">— انتخاب —</option>':'')+arr.map(x=>`<option value="${x.id}">${esc(label(x))}</option>`).join('')}
function statusBadge(s){
 let c=(['برگشتی','گذشته','لغو شد'].includes(s)?'danger':(['فعال','وصول شده','انجام شد','تسویه'].includes(s)?'ok':''));
 return `<span class="badge ${c}">${esc(s||'-')}</span>`;
}
function itemCard(title,meta,kind,id,status='',extraClass=''){
 let edit = canEditKind(kind)?`<button class="secondary" onclick="editRecord('${kind}','${id}')">ویرایش</button>`:'';
 let del = canDeleteKind(kind)?`<button class="danger" onclick="deleteRecord('${kind}','${id}')">حذف</button>`:'';
 return `<div class="item ${extraClass}"><div class="row"><div class="title">${esc(title)}</div>${status?statusBadge(status):''}</div><div class="meta">${meta}</div><div class="actions">${edit}${del}</div></div>`
}
function canEditKind(kind){
 if(currentUser.role==='admin')return true;
 if(currentUser.role==='accountant')return ['clients','contracts','payments','checks','expenses'].includes(kind);
 if(currentUser.role==='lawyer')return ['clients','cases','deadlines','tasks','timeline'].includes(kind);
 if(currentUser.role==='secretary')return ['clients','lawyers','cases','deadlines','tasks','timeline'].includes(kind);
 return false;
}
function canDeleteKind(kind){return currentUser.role==='admin'}

function buildViews(){
 document.getElementById('clients').innerHTML=`
 <div class="section-head"><h2>موکلین</h2></div>
 <div class="panel"><form id="clientsForm" class="form-grid"><input type="hidden" name="editId">
 <label>نام و نام خانوادگی<input name="name" required></label><label>کد ملی<input name="nationalId"></label><label>تلفن<input name="phone"></label>
 <label>تلفن دوم<input name="phone2"></label><label>ایمیل<input name="email"></label><label>تاریخ تولد<input name="birthDate" placeholder="مثلاً 1352/05/09"></label>
 <label class="wide">نشانی<textarea name="address"></textarea></label><label class="wide">یادداشت محرمانه<textarea name="notes"></textarea></label>
 <div class="wide actions"><button class="primary">ذخیره موکل</button><button type="button" class="secondary" onclick="resetForm('clientsForm')">انصراف</button></div></form></div>
 <div class="panel"><div class="filterbar"><input id="clientsQ" placeholder="جست‌وجوی موکل..." oninput="renderClients()"></div><div id="clientsList" class="list"></div></div>`;

 document.getElementById('lawyers').innerHTML=`
 <div class="section-head"><h2>وکلا</h2></div>
 <div class="panel"><form id="lawyersForm" class="form-grid"><input type="hidden" name="editId">
 <label>نام وکیل<input name="name" required></label><label>شماره پروانه<input name="license"></label><label>مرجع صدور پروانه<input name="bar"></label>
 <label>تلفن<input name="phone"></label><label>ایمیل<input name="email"></label><label>درصد سهم پیش‌فرض<input name="share" type="number" step="0.01"></label>
 <label class="wide">یادداشت<textarea name="notes"></textarea></label><div class="wide actions"><button class="primary">ذخیره وکیل</button><button type="button" class="secondary" onclick="resetForm('lawyersForm')">انصراف</button></div></form></div>
 <div class="panel"><div id="lawyersList" class="list"></div></div>`;

 document.getElementById('cases').innerHTML=`
 <div class="section-head"><h2>پرونده‌ها</h2></div>
 <div class="panel"><form id="casesForm" class="form-grid"><input type="hidden" name="editId">
 <label>عنوان پرونده<input name="title" required></label><label>موکل<select name="clientId" id="caseClient"></select></label><label>وکیل مسئول<select name="lawyerId" id="caseLawyer"></select></label>
 <label>شماره پرونده<input name="caseNo"></label><label>شماره بایگانی<input name="archiveNo"></label><label>شماره دادنامه<input name="judgmentNo"></label>
 <label>شعبه<input name="branch"></label><label>مجتمع/مرجع<input name="court"></label><label>نوع پرونده<select name="type"><option>حقوقی</option><option>کیفری</option><option>خانواده</option><option>اجرای احکام</option><option>ثبتی</option><option>داوری</option><option>دیوان</option><option>سایر</option></select></label>
 <label>سمت موکل<input name="clientRole" placeholder="خواهان، خوانده، شاکی..."></label><label>طرف مقابل<input name="opponent"></label><label>وکیل طرف مقابل<input name="opponentLawyer"></label>
 <label>تاریخ تشکیل<input name="filingDate" placeholder="1405/06/20"></label><label>وضعیت<select name="status"><option>فعال</option><option>در انتظار</option><option>کارشناسی</option><option>تجدیدنظر</option><option>اجرای حکم</option><option>مختومه</option></select></label><label>مرحله<input name="stage" placeholder="بدوی، تجدیدنظر..."></label>
 <label class="wide">اقدام بعدی<input name="nextAction"></label><label class="wide">شرح/یادداشت<textarea name="notes"></textarea></label>
 <div class="wide actions"><button class="primary">ذخیره پرونده</button><button type="button" class="secondary" onclick="resetForm('casesForm')">انصراف</button></div></form></div>
 <div class="panel"><div class="filterbar"><input id="casesQ" placeholder="جست‌وجو..." oninput="renderCases()"><select id="caseStatusFilter" onchange="renderCases()"><option value="">همه وضعیت‌ها</option><option>فعال</option><option>در انتظار</option><option>کارشناسی</option><option>تجدیدنظر</option><option>اجرای حکم</option><option>مختومه</option></select></div><div id="casesList" class="list"></div></div>`;

 document.getElementById('contracts').innerHTML=`
 <div class="section-head"><h2>قراردادها</h2></div>
 <div class="panel"><form id="contractsForm" class="form-grid"><input type="hidden" name="editId">
 <label>موکل<select name="clientId" id="contractClient"></select></label><label>پرونده<select name="caseId" id="contractCase"></select></label><label>نوع قرارداد<input name="type" placeholder="وکالت، جعاله، مشاوره..."></label>
 <label>شماره قرارداد<input name="number"></label><label>مبلغ ثابت (تومان)<input name="amount" type="number"></label><label>درصد موفقیت<input name="successPercent" type="number" step="0.01"></label>
 <label>مبنای درصد موفقیت<input name="successBase" placeholder="مثلاً مبلغ وصولی"></label><label>تاریخ شروع<input name="startDate"></label><label>تاریخ پایان<input name="endDate"></label>
 <label>وکیل مرتبط<select name="lawyerId" id="contractLawyer"></select></label><label>سهم وکیل %<input name="lawyerShare" type="number" step="0.01"></label><label>وضعیت<select name="status"><option>فعال</option><option>تسویه</option><option>فسخ</option><option>تعلیق</option></select></label>
 <label class="wide">شرایط پرداخت/یادداشت<textarea name="notes"></textarea></label><div class="wide actions"><button class="primary">ذخیره قرارداد</button><button type="button" class="secondary" onclick="resetForm('contractsForm')">انصراف</button></div></form></div>
 <div class="panel"><div id="contractsList" class="list"></div></div>`;

 document.getElementById('payments').innerHTML=`
 <div class="section-head"><h2>دریافت‌ها و اقساط</h2></div>
 <div class="panel"><form id="paymentsForm" class="form-grid"><input type="hidden" name="editId">
 <label>قرارداد<select name="contractId" id="paymentContract"></select></label><label>مبلغ (تومان)<input name="amount" type="number" required></label><label>تاریخ دریافت<input name="date"></label>
 <label>روش<select name="method"><option>نقدی</option><option>کارت/انتقال</option><option>چک</option><option>ساتنا/پایا</option><option>سایر</option></select></label><label>شماره پیگیری<input name="reference"></label><label>دریافت‌کننده<input name="receiver"></label>
 <label class="wide">توضیحات<textarea name="notes"></textarea></label><div class="wide actions"><button class="primary">ثبت دریافت</button><button type="button" class="secondary" onclick="resetForm('paymentsForm')">انصراف</button></div></form></div>
 <div class="panel"><div id="paymentsList" class="list"></div></div>`;

 document.getElementById('checks').innerHTML=`
 <div class="section-head"><h2>مدیریت چک‌ها</h2></div>
 <div class="panel"><form id="checksForm" class="form-grid"><input type="hidden" name="editId">
 <label>موکل<select name="clientId" id="checkClient"></select></label><label>قرارداد<select name="contractId" id="checkContract"></select></label><label>بانک<input name="bank"></label>
 <label>شماره چک<input name="checkNo"></label><label>شناسه صیادی<input name="sayad"></label><label>صادرکننده<input name="issuer"></label>
 <label>مبلغ (تومان)<input name="amount" type="number"></label><label>سررسید<input name="dueDate"></label><label>وضعیت<select name="status"><option>در انتظار</option><option>وصول شده</option><option>برگشتی</option><option>مسترد شده</option><option>تعویض شده</option></select></label>
 <label class="wide">توضیحات<textarea name="notes"></textarea></label><div class="wide actions"><button class="primary">ذخیره چک</button><button type="button" class="secondary" onclick="resetForm('checksForm')">انصراف</button></div></form></div>
 <div class="panel"><div id="checksList" class="list"></div></div>`;

 document.getElementById('expenses').innerHTML=`
 <div class="section-head"><h2>هزینه‌ها</h2></div>
 <div class="panel"><form id="expensesForm" class="form-grid"><input type="hidden" name="editId">
 <label>پرونده<select name="caseId" id="expenseCase"></select></label><label>موکل<select name="clientId" id="expenseClient"></select></label><label>نوع هزینه<select name="type"><option>هزینه دادرسی</option><option>کارشناسی</option><option>تمبر وکالت</option><option>ابلاغ/پست</option><option>ایاب و ذهاب</option><option>حق‌الزحمه</option><option>سایر</option></select></label>
 <label>مبلغ (تومان)<input name="amount" type="number"></label><label>تاریخ<input name="date"></label><label>پرداخت‌کننده<input name="payer"></label>
 <label class="wide">توضیحات<textarea name="notes"></textarea></label><div class="wide actions"><button class="primary">ثبت هزینه</button><button type="button" class="secondary" onclick="resetForm('expensesForm')">انصراف</button></div></form></div>
 <div class="panel"><div id="expensesList" class="list"></div></div>`;

 document.getElementById('deadlines').innerHTML=`
 <div class="section-head"><h2>جلسات و مهلت‌های قضایی</h2></div>
 <div class="panel"><form id="deadlinesForm" class="form-grid"><input type="hidden" name="editId">
 <label>پرونده<select name="caseId" id="deadlineCase"></select></label><label>عنوان<input name="title" required placeholder="جلسه رسیدگی، پایان مهلت تجدیدنظر..."></label><label>نوع<select name="type"><option>جلسه رسیدگی</option><option>تجدیدنظر</option><option>واخواهی</option><option>فرجام</option><option>کارشناسی</option><option>رفع نقص</option><option>اجرای احکام</option><option>سررسید</option><option>سایر</option></select></label>
 <label>تاریخ شمسی<input name="dueDate" placeholder="1405/06/30"></label><label>ساعت<input name="time" placeholder="10:30"></label><label>وضعیت<select name="status"><option>باز</option><option>انجام شد</option><option>لغو شد</option></select></label>
 <label>مسئول<select name="lawyerId" id="deadlineLawyer"></select></label><label class="wide">توضیحات<textarea name="notes"></textarea></label>
 <div class="wide actions"><button class="primary">ثبت مهلت</button><button type="button" class="secondary" onclick="resetForm('deadlinesForm')">انصراف</button></div></form></div>
 <div class="panel"><div id="deadlinesList" class="list"></div></div>`;

 document.getElementById('tasks').innerHTML=`
 <div class="section-head"><h2>کارهای داخلی و ارجاع</h2></div>
 <div class="panel"><form id="tasksForm" class="form-grid"><input type="hidden" name="editId">
 <label>عنوان کار<input name="title" required></label><label>پرونده<select name="caseId" id="taskCase"></select></label><label>مسئول<select name="lawyerId" id="taskLawyer"></select></label>
 <label>مهلت<input name="dueDate"></label><label>اولویت<select name="priority"><option>عادی</option><option>مهم</option><option>فوری</option></select></label><label>وضعیت<select name="status"><option>باز</option><option>در حال انجام</option><option>انجام شد</option></select></label>
 <label class="wide">توضیحات<textarea name="notes"></textarea></label><div class="wide actions"><button class="primary">ثبت کار</button><button type="button" class="secondary" onclick="resetForm('tasksForm')">انصراف</button></div></form></div>
 <div class="panel"><div id="tasksList" class="list"></div></div>`;

 document.getElementById('timeline').innerHTML=`
 <div class="section-head"><h2>گردش و خط زمانی پرونده</h2></div>
 <div class="panel"><form id="timelineForm" class="form-grid"><input type="hidden" name="editId">
 <label>پرونده<select name="caseId" id="timelineCase"></select></label><label>تاریخ<input name="date"></label><label>نوع رویداد<select name="type"><option>ثبت دادخواست</option><option>ابلاغ</option><option>جلسه</option><option>قرار</option><option>کارشناسی</option><option>دادنامه</option><option>تجدیدنظر</option><option>اجرای حکم</option><option>مکاتبه</option><option>پرداخت</option><option>سایر</option></select></label>
 <label class="wide">شرح رویداد<textarea name="description" required></textarea></label><div class="wide actions"><button class="primary">ثبت رویداد</button><button type="button" class="secondary" onclick="resetForm('timelineForm')">انصراف</button></div></form></div>
 <div class="panel"><div class="filterbar"><select id="timelineFilter" onchange="renderTimeline()"></select></div><div id="timelineList" class="list"></div></div>`;

 bindCrud('clientsForm','clients');bindCrud('lawyersForm','lawyers');bindCrud('casesForm','cases');bindCrud('contractsForm','contracts');
 bindCrud('paymentsForm','payments');bindCrud('checksForm','checks');bindCrud('expensesForm','expenses');bindCrud('deadlinesForm','deadlines');bindCrud('tasksForm','tasks');bindCrud('timelineForm','timeline');
 document.getElementById('docForm').onsubmit=saveDocument;
 let uf=document.getElementById('userForm');if(uf)uf.onsubmit=saveUser;
 let sf=document.getElementById('settingsForm');if(sf)sf.onsubmit=saveSettings;
 let pf=document.getElementById('passwordForm');if(pf)pf.onsubmit=changeMyPassword;
 document.getElementById('restoreInput').onchange=restoreBackup;
}

function bindCrud(formId,key){
 let f=document.getElementById(formId); if(!f)return;
 f.onsubmit=async e=>{e.preventDefault();if(!canEditKind(key)){toast('دسترسی ثبت/ویرایش ندارید');return}
  let o=formData(f),edit=o.editId;delete o.editId;
  if(cloudOnline&&CLOUD_TABLES[key]){
    try{await saveCloudRecord(key,o,edit||null);await syncCoreFromCloud();resetForm(formId);renderAll();toast('ذخیره ابری شد');return}catch(err){console.error(err);toast('ذخیره ابری انجام نشد');return}
  }
  if(edit){let i=state[key].findIndex(x=>x.id===edit);if(i>=0)state[key][i]={...state[key][i],...o}}
  else {o.id=uid();o.createdAt=new Date().toISOString();state[key].unshift(o)}
  persist();resetForm(formId);renderAll();toast('ذخیره محلی شد');
 };
}
async function deleteRecord(kind,id){
 if(!canDeleteKind(kind)){toast('فقط مدیر می‌تواند حذف کند');return}
 if(!confirm('این مورد حذف شود؟'))return;
 if(cloudOnline&&CLOUD_TABLES[kind]){try{await deleteCloudRecord(kind,id);await syncCoreFromCloud();renderAll();toast('حذف شد');return}catch(e){console.error(e);toast('حذف ابری انجام نشد');return}}
 state[kind]=state[kind].filter(x=>x.id!==id);persist();renderAll();toast('حذف شد');
}
function editRecord(kind,id){
 let map={clients:'clientsForm',lawyers:'lawyersForm',cases:'casesForm',contracts:'contractsForm',payments:'paymentsForm',checks:'checksForm',expenses:'expensesForm',deadlines:'deadlinesForm',tasks:'tasksForm',timeline:'timelineForm'};
 let f=document.getElementById(map[kind]),x=find(state[kind],id);if(!f||!x)return;
 Object.entries(x).forEach(([k,v])=>{let el=f.elements[k];if(el)el.value=v??''});if(f.elements.editId)f.elements.editId.value=id;
 showView(kind==='timeline'?'timeline':kind);window.scrollTo({top:0,behavior:'smooth'});
}

function fillSelects(){
 const clients=selectOptions(state.clients,x=>x.name), lawyers=selectOptions(state.lawyers,x=>x.name), cases=selectOptions(state.cases,x=>x.title),
 contracts=selectOptions(state.contracts,x=>(x.number||x.type||'قرارداد')+' — '+clientName(x.clientId));
 [['caseClient',clients],['contractClient',clients],['checkClient',clients],['expenseClient',clients],['docClient',clients],
  ['caseLawyer',lawyers],['contractLawyer',lawyers],['deadlineLawyer',lawyers],['taskLawyer',lawyers],['userLawyer',lawyers],
  ['contractCase',cases],['expenseCase',cases],['deadlineCase',cases],['taskCase',cases],['timelineCase',cases],['docCase',cases],
  ['paymentContract',contracts],['checkContract',contracts]].forEach(([id,html])=>{let e=document.getElementById(id);if(e)e.innerHTML=html});
 let tf=document.getElementById('timelineFilter');if(tf)tf.innerHTML='<option value="">همه پرونده‌ها</option>'+state.cases.map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join('');
 let df=document.getElementById('docCaseFilter');if(df)df.innerHTML='<option value="">همه پرونده‌ها</option>'+state.cases.map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join('');
}

function renderClients(){
 let q=(document.getElementById('clientsQ')?.value||'').toLowerCase();
 let a=state.clients.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
 document.getElementById('clientsList').innerHTML=a.map(x=>itemCard(x.name,`کد ملی: ${esc(x.nationalId||'-')} | تلفن: ${esc(x.phone||'-')}<br>${esc(x.address||'')}`,'clients',x.id)).join('')||empty();
}
function renderLawyers(){
 document.getElementById('lawyersList').innerHTML=state.lawyers.map(x=>itemCard(x.name,`پروانه: ${esc(x.license||'-')} | ${esc(x.bar||'-')}<br>تلفن: ${esc(x.phone||'-')} | سهم پیش‌فرض: ${esc(x.share||0)}٪`,'lawyers',x.id)).join('')||empty();
}
function renderCases(){
 let q=(document.getElementById('casesQ')?.value||'').toLowerCase(),st=document.getElementById('caseStatusFilter')?.value||'';
 let a=state.cases.filter(x=>(!st||x.status===st)&&((JSON.stringify(x)+' '+clientName(x.clientId)+' '+lawyerName(x.lawyerId)).toLowerCase().includes(q)));
 document.getElementById('casesList').innerHTML=a.map(x=>itemCard(x.title,`موکل: ${esc(clientName(x.clientId))} | وکیل: ${esc(lawyerName(x.lawyerId))}<br>شماره پرونده: ${esc(x.caseNo||'-')} | شعبه: ${esc(x.branch||'-')} | مرجع: ${esc(x.court||'-')}<br>طرف مقابل: ${esc(x.opponent||'-')} | اقدام بعدی: ${esc(x.nextAction||'-')}`,'cases',x.id,x.status)).join('')||empty();
}
function paidForContract(id){return state.payments.filter(x=>x.contractId===id).reduce((a,x)=>a+Number(x.amount||0),0)}
function renderContracts(){
 document.getElementById('contractsList').innerHTML=state.contracts.map(x=>{let paid=paidForContract(x.id),bal=Number(x.amount||0)-paid;return itemCard(x.number||x.type||'قرارداد',`موکل: ${esc(clientName(x.clientId))} | پرونده: ${esc(caseName(x.caseId))}<br>مبلغ: ${money(x.amount)} تومان | وصول: ${money(paid)} | مانده: ${money(bal)} | درصد موفقیت: ${esc(x.successPercent||0)}٪`,'contracts',x.id,x.status)}).join('')||empty();
}
function renderPayments(){
 document.getElementById('paymentsList').innerHTML=state.payments.map(x=>{let c=find(state.contracts,x.contractId);return itemCard(`${money(x.amount)} تومان`,`موکل: ${esc(clientName(c?.clientId))} | قرارداد: ${esc(contractName(x.contractId))}<br>تاریخ: ${esc(x.date||'-')} | روش: ${esc(x.method||'-')} | پیگیری: ${esc(x.reference||'-')}`,'payments',x.id)}).join('')||empty();
}
function renderChecks(){
 document.getElementById('checksList').innerHTML=state.checks.map(x=>itemCard(x.checkNo||x.sayad||'چک',`موکل: ${esc(clientName(x.clientId))} | بانک: ${esc(x.bank||'-')}<br>شناسه صیادی: ${esc(x.sayad||'-')} | صادرکننده: ${esc(x.issuer||'-')}<br>مبلغ: ${money(x.amount)} تومان | سررسید: ${esc(x.dueDate||'-')}`,'checks',x.id,x.status)).join('')||empty();
}
function renderExpenses(){
 document.getElementById('expensesList').innerHTML=state.expenses.map(x=>itemCard(`${x.type||'هزینه'} — ${money(x.amount)} تومان`,`موکل: ${esc(clientName(x.clientId))} | پرونده: ${esc(caseName(x.caseId))}<br>تاریخ: ${esc(x.date||'-')} | پرداخت‌کننده: ${esc(x.payer||'-')}`,'expenses',x.id)).join('')||empty();
}
function deadlineState(x){
 if(x.status!=='باز'||!x.dueDate)return {class:'',text:''};
 let d=daysUntilJalali(x.dueDate);if(d===null)return {class:'',text:''};
 if(d<0)return {class:'overdue',text:`${Math.abs(d)} روز گذشته`};if(d<=Number(state.settings.warningDays||5))return {class:'urgent',text:d===0?'امروز':`${d} روز مانده`};return {class:'',text:`${d} روز مانده`};
}
function renderDeadlines(){
 let a=state.deadlines.slice().sort((x,y)=>(x.dueDate||'').localeCompare(y.dueDate||''));
 document.getElementById('deadlinesList').innerHTML=a.map(x=>{let d=deadlineState(x);return itemCard(x.title,`پرونده: ${esc(caseName(x.caseId))} | مسئول: ${esc(lawyerName(x.lawyerId))}<br>تاریخ: ${esc(x.dueDate||'-')} ${esc(x.time||'')} | نوع: ${esc(x.type||'-')} ${d.text?`| <b>${esc(d.text)}</b>`:''}`,'deadlines',x.id,x.status,d.class)}).join('')||empty();
}
function renderTasks(){
 document.getElementById('tasksList').innerHTML=state.tasks.map(x=>itemCard(x.title,`پرونده: ${esc(caseName(x.caseId))} | مسئول: ${esc(lawyerName(x.lawyerId))}<br>مهلت: ${esc(x.dueDate||'-')} | اولویت: ${esc(x.priority||'-')}`,'tasks',x.id,x.status,x.priority==='فوری'?'urgent':'')).join('')||empty();
}
function renderTimeline(){
 let f=document.getElementById('timelineFilter')?.value||'';
 let a=state.timeline.filter(x=>!f||x.caseId===f).slice().sort((x,y)=>(y.date||'').localeCompare(x.date||''));
 document.getElementById('timelineList').innerHTML=a.map(x=>itemCard(`${x.date||'-'} — ${x.type||'رویداد'}`,`پرونده: ${esc(caseName(x.caseId))}<br>${esc(x.description||'')}`,'timeline',x.id)).join('')||empty();
}
function empty(){return '<div class="empty">موردی ثبت نشده است.</div>'}

function renderDashboard(){
 document.getElementById('sClients').textContent=state.clients.length;document.getElementById('sCases').textContent=state.cases.filter(x=>x.status!=='مختومه').length;
 document.getElementById('sLawyers').textContent=state.lawyers.length;document.getElementById('sContracts').textContent=state.contracts.length;
 let contractTotal=state.contracts.reduce((a,x)=>a+Number(x.amount||0),0),paid=state.payments.reduce((a,x)=>a+Number(x.amount||0),0),exp=state.expenses.reduce((a,x)=>a+Number(x.amount||0),0),
 checks=state.checks.filter(x=>!['وصول شده','مسترد شده'].includes(x.status)).reduce((a,x)=>a+Number(x.amount||0),0);
 document.getElementById('sContractValue').textContent=money(contractTotal);document.getElementById('sPaid').textContent=money(paid);document.getElementById('sReceivable').textContent=money(Math.max(0,contractTotal-paid));
 document.getElementById('sChecks').textContent=money(checks);document.getElementById('sExpenses').textContent=money(exp);
 let urgent=state.deadlines.filter(x=>{let d=deadlineState(x);return x.status==='باز'&&(d.class==='urgent'||d.class==='overdue')});document.getElementById('sUrgent').textContent=urgent.length;
 document.getElementById('dashDeadlines').innerHTML=urgent.slice(0,8).map(x=>{let d=deadlineState(x);return `<div class="item ${d.class}"><div class="row"><div class="title">${esc(x.title)}</div>${statusBadge(x.status)}</div><div class="meta">${esc(caseName(x.caseId))} — ${esc(x.dueDate||'-')} — <b>${esc(d.text)}</b></div></div>`}).join('')||empty();
 document.getElementById('dashTasks').innerHTML=state.tasks.filter(x=>x.status!=='انجام شد').slice(0,8).map(x=>`<div class="item"><div class="row"><div class="title">${esc(x.title)}</div>${statusBadge(x.status)}</div><div class="meta">${esc(caseName(x.caseId))} — ${esc(lawyerName(x.lawyerId))} — ${esc(x.dueDate||'-')}</div></div>`).join('')||empty();
 document.getElementById('dashCases').innerHTML=state.cases.slice(0,8).map(x=>`<div class="item"><div class="row"><div class="title">${esc(x.title)}</div>${statusBadge(x.status)}</div><div class="meta">موکل: ${esc(clientName(x.clientId))} | وکیل: ${esc(lawyerName(x.lawyerId))} | ${esc(x.caseNo||'-')}</div></div>`).join('')||empty();
}
function renderAll(){
 fillSelects();renderDashboard();renderClients();renderLawyers();renderCases();renderContracts();renderPayments();renderChecks();renderExpenses();renderDeadlines();renderTasks();renderTimeline();renderUsers();
}

async function saveUser(e){
 e.preventDefault();if(currentUser.role!=='admin'){toast('فقط مدیر دسترسی دارد');return}
 let f=formData(e.target),edit=f.editId;delete f.editId;
 if(state.users.some(x=>x.username===f.username&&x.id!==edit)){toast('این نام کاربری قبلاً ثبت شده');return}
 if(edit){
  let u=find(state.users,edit);if(!u)return;u.fullName=f.fullName;u.username=f.username;u.role=f.role;u.lawyerId=f.lawyerId;u.active=f.active;
  if(f.password)u.passwordHash=await sha256(f.password);
 } else {
  if(!f.password||f.password.length<6){toast('رمز حداقل ۶ کاراکتر باشد');return}
  f.id=uid();f.passwordHash=await sha256(f.password);delete f.password;state.users.push(f);
 }
 persist();resetForm('userForm');renderUsers();toast('کاربر ذخیره شد');
}
async function renderUsers(){
 let box=document.getElementById('userList');if(!box||!cloudProfile)return;
 try{
  await loadCloudProfiles();
  box.innerHTML=(cloudProfiles||[]).map(x=>`<div class="item"><div class="row"><div class="profile-strip"><img class="avatar" src="${avatarUrl(x.avatar_path)}"><div><div class="title">${esc(x.full_name||x.email||'-')}</div><div class="meta">${esc(x.email||'')} | ${esc(cloudRoleName(x.role))}</div></div></div>${statusBadge(x.active?'فعال':'غیرفعال')}</div><div class="actions">${cloudProfile.role==='admin'?`<button class="secondary" onclick="openUserAlertSettings('${x.id}')">هشدارهای این کاربر</button><label class="file-btn">تغییر عکس<input type="file" accept="image/*" onchange="uploadMyAvatar(this.files[0],'${x.id}')"></label>`:''}</div></div>`).join('')||empty();
 }catch(e){console.error(e);box.innerHTML='<div class="empty">دریافت کاربران انجام نشد.</div>'}
}
async function openUserAlertSettings(id){showView('settings');await populateAlertUserSelect();let s=document.getElementById('alertUserSelect');if(s){s.value=id;await loadAlertRules()}}
function editUser(){} function deleteUser(){}

function renderSettings(){
 let f=document.getElementById('settingsForm');if(!f)return;Object.entries(state.settings).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v??''});
 const admin=cloudProfile?.role==='admin';[...f.elements].forEach(x=>{if(x.tagName!=='BUTTON')x.disabled=!admin});let b=f.querySelector('button');if(b)b.disabled=!admin;refreshProfileUI();
}
async function saveSettings(e){
 e.preventDefault();if(cloudProfile?.role!=='admin'){toast('فقط مدیر می‌تواند مشخصات موسسه را تغییر دهد');return}
 let f=formData(e.target);let payload={institute_name:f.instituteName,phone:f.phone,address:f.address,manager_name:f.managerName,registration_no:f.registrationNo,warning_days:Number(f.warningDays||5),updated_at:new Date().toISOString()};
 const {error}=await sb.from('app_settings').update(payload).eq('id',1);if(error){console.error(error);toast('ذخیره تنظیمات انجام نشد');return}
 state.settings={...state.settings,...f};persist();document.getElementById('brandTitle').textContent='⚖️ '+state.settings.instituteName;document.getElementById('loginTitle').textContent=state.settings.instituteName;toast('تنظیمات موسسه ذخیره شد')
}
async function changeMyPassword(e){
 e.preventDefault();let f=formData(e.target);if(f.newpass.length<6){toast('رمز جدید حداقل ۶ کاراکتر باشد');return}if(f.newpass!==f.repeat){toast('تکرار رمز یکسان نیست');return}
 try{let email=cloudProfile?.email;if(f.current&&email){const {error:check}=await sb.auth.signInWithPassword({email,password:f.current});if(check){toast('رمز فعلی صحیح نیست');return}}const {error}=await sb.auth.updateUser({password:f.newpass});if(error)throw error;e.target.reset();toast('رمز تغییر کرد')}catch(err){console.error(err);toast('تغییر رمز انجام نشد')}
}

function renderReports(){
 let totalContracts=state.contracts.reduce((a,x)=>a+Number(x.amount||0),0),paid=state.payments.reduce((a,x)=>a+Number(x.amount||0),0),
 expenses=state.expenses.reduce((a,x)=>a+Number(x.amount||0),0),openChecks=state.checks.filter(x=>!['وصول شده','مسترد شده'].includes(x.status)).reduce((a,x)=>a+Number(x.amount||0),0);
 document.getElementById('reportCards').innerHTML=[
  ['کل قراردادها',totalContracts],['کل وصول',paid],['مطالبات قراردادی',Math.max(0,totalContracts-paid)],['چک‌های باز',openChecks],['هزینه‌ها',expenses],['خالص دریافت نقدی',paid-expenses]
 ].map(([t,v])=>`<div class="card"><small>${t}</small><b>${money(v)}</b><small>تومان</small></div>`).join('');
 let rows=state.clients.map(c=>{let contractIds=state.contracts.filter(x=>x.clientId===c.id).map(x=>x.id),ct=state.contracts.filter(x=>x.clientId===c.id).reduce((a,x)=>a+Number(x.amount||0),0),p=state.payments.filter(x=>contractIds.includes(x.contractId)).reduce((a,x)=>a+Number(x.amount||0),0);return [c.name,ct,p,ct-p]}).filter(x=>x[1]||x[2]);
 document.getElementById('clientBalances').innerHTML=table(['موکل','قرارداد','وصول','مانده'],rows.map(r=>[esc(r[0]),money(r[1]),money(r[2]),money(r[3])]));
 let lr=state.lawyers.map(l=>[l.name,state.cases.filter(x=>x.lawyerId===l.id&&x.status!=='مختومه').length,state.cases.filter(x=>x.lawyerId===l.id).length,state.tasks.filter(x=>x.lawyerId===l.id&&x.status!=='انجام شد').length]);
 document.getElementById('lawyerReport').innerHTML=table(['وکیل','پرونده فعال','کل پرونده','کار باز'],lr.map(r=>r.map(esc)));
}
function table(headers,rows){return `<table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">داده‌ای نیست</td></tr>`}</tbody></table>`}
function exportCSV(kind){
 let arr=state[kind]||[];if(!arr.length){toast('داده‌ای برای خروجی نیست');return}
 let keys=[...new Set(arr.flatMap(x=>Object.keys(x)))],csv='\uFEFF'+keys.join(',')+'\n'+arr.map(x=>keys.map(k=>`"${String(x[k]??'').replace(/"/g,'""')}"`).join(',')).join('\n');
 downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`${kind}-${new Date().toISOString().slice(0,10)}.csv`);
}

function doSearch(){
 let q=(document.getElementById('globalSearch').value||'').trim().toLowerCase();if(!q){toast('عبارت جست‌وجو را وارد کنید');return}
 let out=[];
 const push=(kind,title,meta)=>out.push(`<div class="item"><div class="title">${esc(kind)}: ${esc(title)}</div><div class="meta">${meta}</div></div>`);
 state.clients.forEach(x=>{if(JSON.stringify(x).toLowerCase().includes(q))push('موکل',x.name,`کد ملی: ${esc(x.nationalId||'-')} | تلفن: ${esc(x.phone||'-')}`)});
 state.lawyers.forEach(x=>{if(JSON.stringify(x).toLowerCase().includes(q))push('وکیل',x.name,`پروانه: ${esc(x.license||'-')}`)});
 state.cases.forEach(x=>{if((JSON.stringify(x)+' '+clientName(x.clientId)+' '+lawyerName(x.lawyerId)).toLowerCase().includes(q))push('پرونده',x.title,`موکل: ${esc(clientName(x.clientId))} | شماره: ${esc(x.caseNo||'-')} | طرف مقابل: ${esc(x.opponent||'-')}`)});
 state.contracts.forEach(x=>{if((JSON.stringify(x)+' '+clientName(x.clientId)).toLowerCase().includes(q))push('قرارداد',x.number||x.type||'-',`موکل: ${esc(clientName(x.clientId))} | مبلغ: ${money(x.amount)} تومان`)});
 state.checks.forEach(x=>{if((JSON.stringify(x)+' '+clientName(x.clientId)).toLowerCase().includes(q))push('چک',x.checkNo||x.sayad||'-',`موکل: ${esc(clientName(x.clientId))} | مبلغ: ${money(x.amount)} | ${esc(x.status||'-')}`)});
 state.timeline.forEach(x=>{if((JSON.stringify(x)+' '+caseName(x.caseId)).toLowerCase().includes(q))push('گردش پرونده',x.type||'-',`${esc(caseName(x.caseId))} | ${esc(x.description||'')}`)});
 document.getElementById('searchResults').innerHTML=out.join('')||empty();
}

function openDocsDB(){return new Promise((res,rej)=>{let r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbPut(obj){let d=await openDocsDB();return new Promise((res,rej)=>{let t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(obj);t.oncomplete=()=>{d.close();res()};t.onerror=()=>rej(t.error)})}
async function idbAll(){let d=await openDocsDB();return new Promise((res,rej)=>{let r=d.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>{d.close();res(r.result||[])};r.onerror=()=>rej(r.error)})}
async function idbGet(id){let d=await openDocsDB();return new Promise((res,rej)=>{let r=d.transaction(STORE).objectStore(STORE).get(id);r.onsuccess=()=>{d.close();res(r.result)};r.onerror=()=>rej(r.error)})}
async function idbDelete(id){let d=await openDocsDB();return new Promise((res,rej)=>{let t=d.transaction(STORE,'readwrite');t.objectStore(STORE).delete(id);t.oncomplete=()=>{d.close();res()};t.onerror=()=>rej(t.error)})}
async function idbClear(){let d=await openDocsDB();return new Promise((res,rej)=>{let t=d.transaction(STORE,'readwrite');t.objectStore(STORE).clear();t.oncomplete=()=>{d.close();res()};t.onerror=()=>rej(t.error)})}


let selectedDocumentFile=null;
function selectDocumentFile(input){
  const file=input?.files?.[0]||null;
  if(!file)return;
  selectedDocumentFile=file;
  // clear the other picker so there is only one active file
  for(const id of ['docFileDocs','docFileImages']){
    const el=document.getElementById(id);
    if(el && el!==input)el.value='';
  }
  const st=document.getElementById('docFileStatus');
  if(st){
    const kb=Math.max(1,Math.round(file.size/1024));
    st.classList.add('ok');
    st.textContent=`انتخاب شد: ${file.name} — ${kb.toLocaleString('fa-IR')} KB`;
  }
}
function resetDocumentFilePicker(){
  selectedDocumentFile=null;
  for(const id of ['docFileDocs','docFileImages']){
    const el=document.getElementById(id);if(el)el.value='';
  }
  const st=document.getElementById('docFileStatus');
  if(st){st.classList.remove('ok');st.textContent='هنوز فایلی انتخاب نشده است.'}
}

async function saveDocument(e){
 e.preventDefault();let file=selectedDocumentFile;if(!file){toast('لطفاً فایل PDF، Word یا تصویر را انتخاب کنید');return}
 const allowed=['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream'];
 const ext=(file.name||'').toLowerCase().split('.').pop();
 const allowedExt=['pdf','jpg','jpeg','png','doc','docx'];
 if((file.type && !allowed.includes(file.type)) || !allowedExt.includes(ext)){toast('فرمت مجاز: PDF، JPG، PNG، DOC، DOCX');return}
 if(file.size>50*1024*1024){toast('حجم فایل حداکثر ۵۰ مگابایت باشد');return}
 let f=formData(e.target);
 if(cloudOnline&&cloudProfile){
  try{
   const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');
   const path=`${cloudProfile.id}/${Date.now()}-${safe}`;
   const {error:upErr}=await sb.storage.from('legal-documents').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(upErr)throw upErr;
   const {error:dbErr}=await sb.from('documents').insert({client_id:f.clientId||null,case_id:f.caseId||null,title:f.title,category:f.category,file_path:path,file_name:file.name,mime_type:file.type||'application/octet-stream',file_size:file.size,notes:f.notes||null,created_by:cloudProfile.id});
   if(dbErr){await sb.storage.from('legal-documents').remove([path]);throw dbErr}
   e.target.reset();resetDocumentFilePicker();await renderDocuments();toast('سند در بایگانی ابری ذخیره شد');return;
  }catch(err){console.error(err);toast('بارگذاری ابری سند انجام نشد');return}
 }
 let obj={id:uid(),title:f.title,category:f.category,clientId:f.clientId,caseId:f.caseId,notes:f.notes,fileName:file.name,mime:file.type,size:file.size,createdAt:new Date().toISOString(),blob:file};
 try{await idbPut(obj);e.target.reset();resetDocumentFilePicker();renderDocuments();toast('سند محلی ذخیره شد')}catch(err){toast('ذخیره سند در این مرورگر ممکن نشد')}
}
async function renderDocuments(){
 let list=document.getElementById('docList');if(!list)return;
 if(cloudOnline&&cloudProfile){
  try{
   let {data:docs,error}=await sb.from('documents').select('*').order('created_at',{ascending:false});if(error)throw error;
   let q=(document.getElementById('docSearch')?.value||'').toLowerCase(),cf=document.getElementById('docCaseFilter')?.value||'';
   docs=(docs||[]).filter(x=>(!cf||x.case_id===cf)&&((JSON.stringify(x)+' '+clientName(x.client_id)+' '+caseName(x.case_id)).toLowerCase().includes(q)));
   list.innerHTML=docs.map(x=>`<div class="item"><div class="row"><div class="title">${esc(x.title)}</div><span class="badge">${esc(x.category)}</span></div><div class="meta">موکل: ${esc(clientName(x.client_id))} | پرونده: ${esc(caseName(x.case_id))}<br>فایل: ${esc(x.file_name||'-')} | ${((Number(x.file_size)||0)/1024).toFixed(0)} KB${x.mime_type==='application/pdf'?' | PDF':''}</div><div class="actions"><button class="secondary" onclick="openCloudDocument('${x.id}','${esc(x.file_path)}')">باز/نمایش</button><button class="secondary" onclick="downloadCloudDocument('${x.id}','${esc(x.file_path)}','${esc(x.file_name||'document') }')">دانلود</button><button class="secondary" onclick="printCloudDocument('${x.id}','${esc(x.file_path)}')">🖨 چاپ</button><button class="secondary" onclick="shareCloudDocument('${x.id}','${esc(x.file_path)}','${esc(x.file_name||'document')}','${esc(x.title)}')">↗ ارسال</button>${currentUser.role==='admin'?`<button class="danger" onclick="deleteDocument('${x.id}','${esc(x.file_path)}')">حذف</button>`:''}</div></div>`).join('')||empty();
   return;
  }catch(e){console.warn('cloud docs',e)}
 }
 try{
  let docs=await idbAll(),q=(document.getElementById('docSearch')?.value||'').toLowerCase(),cf=document.getElementById('docCaseFilter')?.value||'';
  docs=docs.filter(x=>(!cf||x.caseId===cf)&&((JSON.stringify({...x,blob:undefined})+' '+clientName(x.clientId)+' '+caseName(x.caseId)).toLowerCase().includes(q))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  list.innerHTML=docs.map(x=>`<div class="item"><div class="row"><div class="title">${esc(x.title)}</div><span class="badge">${esc(x.category)}</span></div><div class="meta">موکل: ${esc(clientName(x.clientId))} | پرونده: ${esc(caseName(x.caseId))}<br>فایل: ${esc(x.fileName)} | ${(x.size/1024).toFixed(0)} KB</div><div class="actions"><button class="secondary" onclick="downloadDocument('${x.id}')">باز/دریافت</button>${currentUser.role==='admin'?`<button class="danger" onclick="deleteDocument('${x.id}')">حذف</button>`:''}</div></div>`).join('')||empty();
 }catch(e){list.innerHTML='<div class="empty">دسترسی به بایگانی اسناد ممکن نشد.</div>'}
}
async function getSignedDocUrl(path,downloadName){
 const opt=downloadName?{download:downloadName}:{};
 const {data,error}=await sb.storage.from('legal-documents').createSignedUrl(path,600,opt);if(error)throw error;return data.signedUrl;
}
async function openCloudDocument(id,path){try{let u=await getSignedDocUrl(path);window.open(u,'_blank','noopener')}catch(e){console.error(e);toast('بازکردن سند انجام نشد')}}
async function downloadCloudDocument(id,path,name){try{let u=await getSignedDocUrl(path,name);window.open(u,'_blank','noopener')}catch(e){console.error(e);toast('دانلود سند انجام نشد')}}
async function downloadDocument(id){let x=await idbGet(id);if(!x)return;downloadBlob(x.blob,x.fileName)}
async function deleteDocument(id,path){
 if(currentUser.role!=='admin')return;if(!confirm('سند حذف شود؟'))return;
 if(cloudOnline&&path){try{await sb.storage.from('legal-documents').remove([path]);const {error}=await sb.from('documents').delete().eq('id',id);if(error)throw error;await renderDocuments();toast('سند حذف شد');return}catch(e){console.error(e);toast('حذف سند انجام نشد');return}}
 await idbDelete(id);renderDocuments();
}
function downloadBlob(blob,name){let u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}

async function exportBackup(includeDocs){
 let pkg={type:'legal-office-backup',version:2,createdAt:new Date().toISOString(),state};
 if(includeDocs){toast('در حال آماده‌سازی اسناد...');let docs=await idbAll();pkg.documents=[];for(let d of docs){let b64=await blobToBase64(d.blob);pkg.documents.push({...d,blobBase64:b64,blob:undefined})}}
 downloadBlob(new Blob([JSON.stringify(pkg)],{type:'application/json'}),`legal-office-${includeDocs?'full-':'data-'}backup-${new Date().toISOString().slice(0,10)}.json`);toast('فایل پشتیبان ساخته شد');
}
async function exportEncryptedBackup(){
 let pass=prompt('یک رمز قوی برای فایل پشتیبان وارد کنید:');if(!pass)return;if(pass.length<6){toast('رمز حداقل ۶ کاراکتر باشد');return}
 let docs=await idbAll(),pkg={type:'legal-office-backup',version:2,createdAt:new Date().toISOString(),state,documents:[]};
 for(let d of docs){pkg.documents.push({...d,blobBase64:await blobToBase64(d.blob),blob:undefined})}
 let enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 let keyMat=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
 let key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},keyMat,{name:'AES-GCM',length:256},false,['encrypt']);
 let ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(pkg)));
 let wrapper={type:'legal-office-encrypted',salt:bytesB64(salt),iv:bytesB64(iv),cipher:bytesB64(new Uint8Array(ct))};
 downloadBlob(new Blob([JSON.stringify(wrapper)],{type:'application/json'}),`legal-office-secure-${new Date().toISOString().slice(0,10)}.lgoffice`);toast('پشتیبان رمزدار ساخته شد');
}
async function restoreBackup(e){
 let f=e.target.files[0];if(!f)return;try{
  let text=await f.text(),obj=JSON.parse(text),pkg=obj;
  if(obj.type==='legal-office-encrypted'){
   let pass=prompt('رمز فایل پشتیبان را وارد کنید:');if(!pass)return;
   let enc=new TextEncoder(),keyMat=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
   let key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64Bytes(obj.salt),iterations:150000,hash:'SHA-256'},keyMat,{name:'AES-GCM',length:256},false,['decrypt']);
   let pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64Bytes(obj.iv)},key,b64Bytes(obj.cipher));pkg=JSON.parse(new TextDecoder().decode(pt));
  }
  if(pkg.type!=='legal-office-backup'||!pkg.state)throw new Error('invalid');
  if(!confirm('اطلاعات فعلی با پشتیبان جایگزین شود؟'))return;
  state=pkg.state;persist();await idbClear();
  if(pkg.documents){for(let d of pkg.documents){let blob=base64ToBlob(d.blobBase64,d.mime||'application/octet-stream');delete d.blobBase64;await idbPut({...d,blob})}}
  let sid=sessionStorage.getItem(SESSION_KEY);currentUser=find(state.users,sid)||state.users.find(x=>x.role==='admin');sessionStorage.setItem(SESSION_KEY,currentUser.id);
  startApp();toast('بازیابی انجام شد');
 }catch(err){console.error(err);toast('فایل پشتیبان معتبر نیست یا رمز اشتباه است')}finally{e.target.value=''}
}
async function clearAllData(){if(currentUser.role!=='admin'){toast('فقط مدیر');return}if(confirm('تمام اطلاعات و اسناد پاک شود؟')&&confirm('مطمئن هستید؟ این کار قابل بازگشت نیست.')){state=defaultState();localStorage.removeItem(DATA_KEY);await idbClear();await ensureAdmin();logout();toast('اطلاعات پاک شد')}}
function blobToBase64(blob){return new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob)})}
function base64ToBlob(dataUrl,mime){let b64=dataUrl.includes(',')?dataUrl.split(',')[1]:dataUrl,bin=atob(b64),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}
function bytesB64(arr){let s='';arr.forEach(b=>s+=String.fromCharCode(b));return btoa(s)}
function b64Bytes(s){let b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}

// --- Jalali date conversion (for deadline countdown) ---
function div(a,b){return ~~(a/b)} function mod(a,b){return a-~~(a/b)*b}
function jalCal(jy){let breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178],bl=breaks.length,gy=jy+621,leapJ=-14,jp=breaks[0],jm,jump,leap,n,i;if(jy<jp||jy>=breaks[bl-1])throw Error();for(i=1;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ=leapJ+div(jump,33)*8+div(mod(jump,33),4);jp=jm}n=jy-jp;leapJ=leapJ+div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ+=1;let leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;let march=20+leapJ-leapG;if(jump-n<6)n=n-jump+div(jump+4,33)*33;leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return {leap,gy,march}}
function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d}
function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;let i=div(mod(j,1461),4)*5+308;let gd=div(mod(i,153),5)+1,gm=mod(div(i,153),12)+1,gy=div(j,1461)-100100+div(8-gm,6);return {gy,gm,gd}}
function j2d(jy,jm,jd){let r=jalCal(jy);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1}
function jalaliToGregorian(s){try{let p=s.replace(/-/g,'/').split('/').map(Number);if(p.length<3||!p[0])return null;return d2g(j2d(p[0],p[1],p[2]))}catch(e){return null}}
function daysUntilJalali(s){let g=jalaliToGregorian(s);if(!g)return null;let target=new Date(g.gy,g.gm-1,g.gd),now=new Date();now.setHours(0,0,0,0);return Math.round((target-now)/86400000)}

async function boot(){
 try{
  if(!sb)throw new Error('Supabase client unavailable');
  const {data:{session}}=await sb.auth.getSession();
  loadAppearanceSettings();if(session&&await syncCloudIdentity()){await loadInstituteSettings();startApp()}else{document.getElementById('loginScreen').classList.remove('hidden');await loadInstituteSettings();document.getElementById('loginTitle').textContent=state.settings.instituteName||'سامانه جامع مدیریت موسسه حقوقی'}
 }catch(e){console.error(e);cloudOnline=false;document.getElementById('loginScreen').classList.remove('hidden');toast('اتصال ابری برقرار نشد')}
}
boot();




