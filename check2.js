
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try{const reg=await navigator.serviceWorker.register('./sw.js');await reg.update();}catch{}
  });
  navigator.serviceWorker.addEventListener('message',e=>{const d=e.data||{};if(d.type==='hearing-alert'){if(d.play_alarm)playAlertSound(d.sound_key||'legal_chime_1');toast(d.body||'یادآوری جلسه رسیدگی')}});
}




// ===== v4.8 Adliran / Sana shared profiles =====
let adliranProfiles=[];
async function loadAdliranProfiles(){
 if(!sb||!cloudProfile)return;
 try{const {data,error}=await sb.from('adliran_profiles').select('*, adliran_profile_fields(*)').order('updated_at',{ascending:false});if(error)throw error;adliranProfiles=data||[];renderAdliranProfiles()}catch(e){console.error(e);toast('خواندن اطلاعات عدل ایران انجام نشد')}
}
function adliranCanEdit(){return ['admin','internal_manager'].includes(cloudProfile?.role)}
function renderAdliranProfiles(){
 const box=document.getElementById('adliranList');if(!box)return;const q=(document.getElementById('adliranSearch')?.value||'').trim().toLowerCase();
 const rows=(adliranProfiles||[]).filter(p=>!q||[p.person_label,p.national_id,p.mobile,p.sana_username,p.notes,...(p.adliran_profile_fields||[]).map(f=>`${f.field_label} ${f.field_value}`)].join(' ').toLowerCase().includes(q));
 box.innerHTML=rows.map(p=>{const fs=[...(p.adliran_profile_fields||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));return `<div class="adliran-profile" data-profile="${p.id}"><div class="row"><div><div class="title">${esc(p.person_label||'بدون نام')}</div><div class="meta">کد ملی: ${esc(p.national_id||'-')} | موبایل: ${esc(p.mobile||'-')}</div></div><span class="badge">عدل ایران</span></div><div class="adliran-fields">${fs.map(f=>renderAdliranField(f)).join('')||'<div class="empty">فیلد اضافه‌ای ثبت نشده است</div>'}</div><div class="actions" style="margin-top:10px"><button class="secondary" onclick="editAdliranProfile('${p.id}')">ویرایش مشخصات</button><button class="secondary" onclick="addAdliranField('${p.id}')">+ افزودن گزینه</button><button class="secondary" onclick="printAdliranProfile('${p.id}')">🖨 چاپ مشخصات</button><button class="secondary" onclick="shareAdliranProfile('${p.id}')">↗ ارسال مشخصات</button><button class="secondary" onclick="uploadAdliranDocument('${p.id}')">📎 ثبت مدرک</button><button class="secondary" onclick="window.open('https://adliran.ir/','_blank','noopener')">باز کردن عدل ایران</button>${adliranCanEdit()?`<button class="danger" onclick="deleteAdliranProfile('${p.id}')">حذف شخص</button>`:''}</div><div class="meta">آخرین ویرایش: ${p.updated_at?new Date(p.updated_at).toLocaleString('fa-IR'):'-'}</div></div>`}).join('')||'<div class="panel empty">هنوز شخصی ثبت نشده است.</div>';
}
function renderAdliranField(f){const secret=f.is_secret||f.field_type==='password';const val=secret?'••••••••':esc(f.field_value||'');return `<div class="adliran-field" data-field="${f.id}"><div><b>${esc(f.field_label||f.field_key)}</b><div class="meta">${secret?'محرمانه':'قابل مشاهده'}</div></div><div class="${secret?'secret-value':''}" id="afv-${f.id}">${val||'—'}</div><div class="field-toolbar">${secret?`<button class="secondary" onclick="toggleAdliranSecret('${f.id}')">👁 نمایش</button>`:''}<button class="secondary" onclick="editAdliranField('${f.id}')">ویرایش</button><button class="danger" onclick="deleteAdliranField('${f.id}')">حذف</button></div></div>`}
function getAdliranProfile(id){return adliranProfiles.find(x=>x.id===id)}
function getAdliranField(id){for(const p of adliranProfiles){const f=(p.adliran_profile_fields||[]).find(x=>x.id===id);if(f)return f}return null}
async function newAdliranProfile(){if(!adliranCanEdit()){toast('دسترسی ویرایش ندارید');return}const name=prompt('نام و نام خانوادگی شخص:');if(!name)return;const national_id=prompt('کد ملی (اختیاری):')||'';const mobile=prompt('شماره موبایل (اختیاری):')||'';try{const {data,error}=await sb.from('adliran_profiles').insert({owner_user_id:cloudProfile.id,person_label:name,national_id,mobile,updated_by:cloudProfile.id}).select().single();if(error)throw error;await Promise.all([
 sb.from('adliran_profile_fields').insert({profile_id:data.id,field_key:'sana_password',field_label:'رمز ثنا',field_type:'password',is_secret:true,sort_order:10,updated_by:cloudProfile.id}),
 sb.from('adliran_profile_fields').insert({profile_id:data.id,field_key:'temporary_password',field_label:'رمز موقت',field_type:'password',is_secret:true,sort_order:20,updated_by:cloudProfile.id}),
 sb.from('adliran_profile_fields').insert({profile_id:data.id,field_key:'temporary_password_expiry',field_label:'تاریخ انقضای رمز موقت',field_type:'date',is_secret:false,sort_order:30,updated_by:cloudProfile.id})
 ]);await loadAdliranProfiles();toast('شخص و گزینه‌های پایه اضافه شد')}catch(e){console.error(e);toast('افزودن شخص انجام نشد')}}
async function editAdliranProfile(id){const p=getAdliranProfile(id);if(!p||!adliranCanEdit())return;const person_label=prompt('نام شخص:',p.person_label||'');if(person_label===null)return;const national_id=prompt('کد ملی:',p.national_id||'');if(national_id===null)return;const mobile=prompt('موبایل:',p.mobile||'');if(mobile===null)return;const sana_username=prompt('نام کاربری/شناسه ثنا:',p.sana_username||'');if(sana_username===null)return;const notes=prompt('توضیحات:',p.notes||'');if(notes===null)return;try{const {error}=await sb.from('adliran_profiles').update({person_label,national_id,mobile,sana_username,notes,updated_by:cloudProfile.id}).eq('id',id);if(error)throw error;await loadAdliranProfiles();toast('مشخصات ویرایش شد')}catch(e){console.error(e);toast('ویرایش انجام نشد')}}
async function deleteAdliranProfile(id){if(!adliranCanEdit()||!confirm('این شخص و تمام گزینه‌های او حذف شود؟'))return;try{const {error}=await sb.from('adliran_profiles').delete().eq('id',id);if(error)throw error;await loadAdliranProfiles();toast('حذف شد')}catch(e){console.error(e);toast('حذف انجام نشد')}}
async function addAdliranField(profileId){if(!adliranCanEdit())return;const label=prompt('نام گزینه جدید (مثلاً شماره پرونده ثنا):');if(!label)return;const typ=(prompt('نوع گزینه: text / password / date / number / note','text')||'text').trim();const safeType=['text','password','date','number','note'].includes(typ)?typ:'text';const key='custom_'+Date.now();try{const {error}=await sb.from('adliran_profile_fields').insert({profile_id:profileId,field_key:key,field_label:label,field_type:safeType,is_secret:safeType==='password',sort_order:99,updated_by:cloudProfile.id});if(error)throw error;await loadAdliranProfiles();toast('گزینه جدید اضافه شد')}catch(e){console.error(e);toast('افزودن گزینه انجام نشد')}}
async function editAdliranField(id){const f=getAdliranField(id);if(!f||!adliranCanEdit())return;const label=prompt('عنوان گزینه:',f.field_label||'');if(label===null)return;const value=prompt('مقدار جدید:',f.field_value||'');if(value===null)return;try{const {error}=await sb.from('adliran_profile_fields').update({field_label:label,field_value:value,updated_by:cloudProfile.id}).eq('id',id);if(error)throw error;await loadAdliranProfiles();toast('گزینه ویرایش شد')}catch(e){console.error(e);toast('ویرایش گزینه انجام نشد')}}
async function deleteAdliranField(id){if(!adliranCanEdit()||!confirm('این گزینه حذف شود؟'))return;try{const {error}=await sb.from('adliran_profile_fields').delete().eq('id',id);if(error)throw error;await loadAdliranProfiles();toast('گزینه حذف شد')}catch(e){console.error(e);toast('حذف گزینه انجام نشد')}}
function toggleAdliranSecret(id){const f=getAdliranField(id),el=document.getElementById('afv-'+id);if(!f||!el)return;el.textContent=el.dataset.shown==='1'?'••••••••':(f.field_value||'—');el.dataset.shown=el.dataset.shown==='1'?'0':'1'}


// ===== v4.9 Office workflow / print / share / music =====
let officeSettingsCache=null, contractDrafts=[], letterDrafts=[], handovers=[], adliranDocs=[];

function mediaDockPrefs(){
  try{
    return JSON.parse(localStorage.getItem('legalOfficeMediaDockPrefs')||'{}')
  }catch{return{}}
}
function saveMediaDockPrefs(){
  const p={
    showMusic:document.getElementById('prefShowMusic')?.checked!==false,
    showVideo:document.getElementById('prefShowVideo')?.checked!==false,
    showLabels:!!document.getElementById('prefShowMediaLabels')?.checked,
    side:document.getElementById('prefMediaSide')?.value||'left',
    style:document.getElementById('prefMediaStyle')?.value||'premium',
    size:document.getElementById('prefMediaSize')?.value||'normal'
  };
  localStorage.setItem('legalOfficeMediaDockPrefs',JSON.stringify(p));
  applyMediaDockPrefs();
}
function loadMediaDockPrefs(){
  const p=mediaDockPrefs();
  const def={showMusic:true,showVideo:true,showLabels:false,side:'left',style:'premium',size:'normal'};
  const v={...def,...p};
  const set=(id,val)=>{const e=document.getElementById(id);if(!e)return;if(e.type==='checkbox')e.checked=!!val;else e.value=val};
  set('prefShowMusic',v.showMusic);set('prefShowVideo',v.showVideo);set('prefShowMediaLabels',v.showLabels);
  set('prefMediaSide',v.side);set('prefMediaStyle',v.style);set('prefMediaSize',v.size);
  applyMediaDockPrefs();
}
function applyMediaDockPrefs(){
  const p={showMusic:true,showVideo:true,showLabels:false,side:'left',style:'premium',size:'normal',...mediaDockPrefs()};
  const m=document.getElementById('musicFloatBtn'),v=document.getElementById('videoFloatBtn');
  if(!m||!v)return;

  m.classList.toggle('hidden-by-pref',!p.showMusic);
  v.classList.toggle('hidden-by-pref',!p.showVideo);
  for(const el of [m,v]){
    el.classList.remove('show-label','glass','round','pill');
    if(p.showLabels)el.classList.add('show-label');
    if(['glass','round','pill'].includes(p.style))el.classList.add(p.style);
    el.style.width='';el.style.height='';el.style.fontSize='';
    if(p.size==='small'){el.style.height='46px';el.style.minWidth='46px';el.style.fontSize='20px'}
    if(p.size==='large'){el.style.height='66px';el.style.minWidth='66px';el.style.fontSize='28px'}
  }
  if(p.side==='right'){
    m.style.left='auto';v.style.left='auto';m.style.right='14px';v.style.right=p.showLabels?'118px':'76px';
  }else{
    m.style.right='auto';v.style.right='auto';m.style.left='14px';v.style.left=p.showLabels?'118px':'76px';
  }
  const mini=document.getElementById('musicMiniPlayer');
  if(mini && !mini.style.top){
    mini.classList.remove('left','right');
    mini.classList.add(p.side==='right'?'right':'left');
  }
  const prev=document.querySelector('.media-preview-btn');
  if(prev){
    prev.style.borderRadius=p.style==='round'?'999px':p.style==='pill'?'999px':'18px';
    prev.style.opacity=p.showMusic?'1':'.35';
    prev.innerHTML=p.showLabels?'🎵 <span>موسیقی</span>':'🎵';
  }
}
function resetMediaDockPrefs(){
  localStorage.removeItem('legalOfficeMediaDockPrefs');
  loadMediaDockPrefs();
  toast('تنظیمات آیکون‌های رسانه به حالت پیش‌فرض برگشت');
}


let musicMiniManuallyHidden=false;
function getOfficeAudio(){return document.getElementById('officeAudio')}
function setMusicVolume(v){
  const a=getOfficeAudio();if(!a)return;
  a.volume=Number(v);
  const r=document.getElementById('musicVolume');if(r)r.value=String(v);
  const mr=document.getElementById('miniVolume');if(mr)mr.value=String(v);
  saveMusicVolume(v);
}
function updateMusicControlUI(){
  const a=getOfficeAudio(),fb=document.getElementById('musicFloatBtn'),
        ficon=fb?.querySelector('.music-action'),
        mb=document.getElementById('miniPlayBtn');
  const playing=!!a && !a.paused && !!a.src;
  if(ficon)ficon.textContent=playing?'⏸':'▶';
  if(mb)mb.textContent=playing?'⏸':'▶';
  fb?.classList.toggle('playing',playing);
  fb?.classList.remove('disabled-control');
  if(a?.src && !musicMiniManuallyHidden)showMusicMini();
  syncMusicTimeline();
}
function musicShortcutAction(e){
  if(e)e.preventDefault();
  const a=getOfficeAudio();
  if(a?.src){
    toggleOfficeAudio();
  }else{
    toggleMusicPanel();
  }
}
function showMusicMini(){
  const m=document.getElementById('musicMiniPlayer');if(!m)return;
  const prefs=mediaDockPrefs();
  m.classList.remove('hidden','left','right');
  m.classList.add((prefs.side||'left')==='right'?'right':'left');
}
function hideMusicMini(){
  musicMiniManuallyHidden=true;
  document.getElementById('musicMiniPlayer')?.classList.add('hidden');
}
function setMiniTrack(title,source){
  const t=document.getElementById('miniSongTitle'),s=document.getElementById('miniSongSource');
  if(t)t.textContent=title||'موسیقی';
  if(s)s.textContent=source||'پلیر داخلی سامانه';
  musicMiniManuallyHidden=false;
  showMusicMini();
}
function initMiniPlayerDrag(){
  const panel=document.getElementById('musicMiniPlayer'),handle=document.getElementById('musicMiniDrag');
  if(!panel||!handle)return;
  let active=false,sx=0,sy=0,sl=0,st=0;
  handle.addEventListener('pointerdown',e=>{
    if(window.innerWidth<620)return;
    active=true;sx=e.clientX;sy=e.clientY;
    const r=panel.getBoundingClientRect();sl=r.left;st=r.top;
    panel.style.left=r.left+'px';panel.style.top=r.top+'px';panel.style.right='auto';panel.style.bottom='auto';
    handle.setPointerCapture?.(e.pointerId)
  });
  handle.addEventListener('pointermove',e=>{
    if(!active)return;
    const mx=Math.max(0,window.innerWidth-panel.offsetWidth),my=Math.max(0,window.innerHeight-panel.offsetHeight);
    panel.style.left=Math.min(mx,Math.max(0,sl+e.clientX-sx))+'px';
    panel.style.top=Math.min(my,Math.max(0,st+e.clientY-sy))+'px';
  });
  const end=()=>active=false;handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
}

function toggleMusicPanel(){
  document.getElementById('musicPanel')?.classList.toggle('hidden');
  renderMusicFavorites();
}
const MUSIC_SERVICE_URLS={
  spotify:'https://open.spotify.com/',
  youtube:'https://music.youtube.com/',
  apple:'https://music.apple.com/',
  deezer:'https://www.deezer.com/',
  soundcloud:'https://soundcloud.com/',
  radio:'https://radio.garden/'
};
function openMusicService(key){
  const u=MUSIC_SERVICE_URLS[key];
  if(!u)return;
  window.open(u,'_blank','noopener');
}

function quickMusic(query){
  const q=String(query||'').trim();if(!q)return;
  const input=document.getElementById('musicSearchQuery');if(input)input.value=q;
  searchMusic();
}
function musicToday(){
  const y=new Date().getFullYear();
  quickMusic(`top hits ${y}`);
}
function searchMusic(){
  const q=(document.getElementById('musicSearchQuery')?.value||'').trim();
  if(!q){toast('نام آهنگ یا خواننده را وارد کنید');return}
  const s=document.getElementById('musicSearchService')?.value||'spotify';
  let u='';
  if(s==='spotify')u='https://open.spotify.com/search/'+encodeURIComponent(q);
  if(s==='youtube')u='https://music.youtube.com/search?q='+encodeURIComponent(q);
  if(s==='apple')u='https://music.apple.com/us/search?term='+encodeURIComponent(q);
  if(s==='deezer')u='https://www.deezer.com/search/'+encodeURIComponent(q);
  if(s==='soundcloud')u='https://soundcloud.com/search?q='+encodeURIComponent(q);
  if(u)window.open(u,'_blank','noopener');
}

function toggleOfficeAudio(){
  const a=getOfficeAudio();
  if(!a)return;
  if(!a.src){
    openLauncherMusic();
    toast('برای پخش، یک فایل صوتی یا لینک مستقیم انتخاب کنید');
    return;
  }
  if(a.paused){
    a.play().then(()=>setTimeout(syncMusicTimeline,80)).catch(()=>toast('پخش موسیقی ممکن نشد'));
  }else{
    a.pause();
  }
  setTimeout(updateMusicControlUI,40);
}
function seekAudio(sec){
  const a=getOfficeAudio();if(!a||!Number.isFinite(a.duration))return;
  a.currentTime=Math.max(0,Math.min(a.duration,a.currentTime+sec));
  syncMusicTimeline();
}

function switchUnifiedMediaTab(tab){
  const music=tab==='music';
  document.getElementById('musicPane')?.classList.toggle('hidden',!music);
  document.getElementById('tvPane')?.classList.toggle('hidden',music);
  document.getElementById('tabMusicBtn')?.classList.toggle('active',music);
  document.getElementById('tabTvBtn')?.classList.toggle('active',!music);
}
function openUnifiedTv(){
  const p=document.getElementById('musicPanel');
  if(p?.classList.contains('hidden'))p.classList.remove('hidden');
  switchUnifiedMediaTab('tv');
}
function openUnifiedMusic(){
  const p=document.getElementById('musicPanel');
  if(p?.classList.contains('hidden'))p.classList.remove('hidden');
  switchUnifiedMediaTab('music');
}
function openUnifiedVideoService(key){
  if(key==='youtube'){
    document.getElementById('unifiedVideoUrl').value='https://www.youtube.com/';
    toast('برای پخش داخل برنامه، لینک خود ویدیو YouTube را وارد کنید');
    return;
  }
  if(key==='aparat'){
    window.open('https://www.aparat.com/','_blank','noopener');
    return;
  }
  if(key==='telewebion'){
    window.open('https://telewebion.com/','_blank','noopener');
    return;
  }
}
function searchUnifiedVideo(){
  const q=(document.getElementById('unifiedVideoSearch')?.value||'').trim();
  if(!q){toast('نام برنامه یا موضوع را وارد کنید');return}
  const s=document.getElementById('unifiedVideoSearchService')?.value||'youtube';
  const u=s==='aparat'
    ? 'https://www.aparat.com/result/'+encodeURIComponent(q)
    : 'https://www.youtube.com/results?search_query='+encodeURIComponent(q);
  window.open(u,'_blank','noopener');
}
function clearUnifiedVideoEmbed(){
  const w=document.getElementById('unifiedMediaEmbedWrap');if(w)w.innerHTML='';
}
function loadUnifiedLocalVideo(file){
  if(!file)return;
  switchUnifiedMediaTab('tv');
  clearUnifiedVideoEmbed();
  const v=document.getElementById('unifiedMediaPlayer');
  if(v.dataset.obj)URL.revokeObjectURL(v.dataset.obj);
  const u=URL.createObjectURL(file);v.dataset.obj=u;v.src=u;v.style.display='block';v.play().catch(()=>{});
}
function loadUnifiedVideoUrl(){
  const u=(document.getElementById('unifiedVideoUrl')?.value||'').trim();if(!u)return;
  switchUnifiedMediaTab('tv');
  const yt=youtubeEmbedUrl(u);
  const v=document.getElementById('unifiedMediaPlayer');
  if(yt){
    v.pause();v.removeAttribute('src');v.load();v.style.display='none';
    document.getElementById('unifiedMediaEmbedWrap').innerHTML=`<iframe id="unifiedMediaFrame" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen src="${yt}"></iframe>`;
    return;
  }
  clearUnifiedVideoEmbed();v.style.display='block';v.src=u;v.play().catch(()=>toast('این لینک قابل پخش مستقیم نیست'));
}
async function toggleUnifiedPiP(){
  const v=document.getElementById('unifiedMediaPlayer');
  try{
    if(document.pictureInPictureElement)await document.exitPictureInPicture();
    else if(document.pictureInPictureEnabled&&v&&v.readyState>=2)await v.requestPictureInPicture();
    else toast('Picture-in-Picture برای این ویدیو در دسترس نیست');
  }catch{toast('فعال‌سازی پنجره شناور ممکن نشد')}
}

function toggleVideoPanel(){document.getElementById('videoPanel')?.classList.toggle('hidden')}
function toggleMediaMin(id){document.getElementById(id)?.classList.toggle('minimized')}
function toggleVideoMini(){document.getElementById('videoPanel')?.classList.toggle('mini-video')}

const VIDEO_SERVICE_URLS={
  youtube:'https://www.youtube.com/',
  aparat:'https://www.aparat.com/',
  telewebion:'https://telewebion.com/',
  tv:'https://www.google.com/search?q='+encodeURIComponent('live TV online')
};
function openVideoService(key){
  const u=VIDEO_SERVICE_URLS[key];if(u)window.open(u,'_blank','noopener');
}
function searchVideo(){
  const q=(document.getElementById('videoSearchQuery')?.value||'').trim();
  if(!q){toast('موضوع یا نام برنامه را وارد کنید');return}
  const s=document.getElementById('videoSearchService')?.value||'youtube';
  let u=s==='aparat'?'https://www.aparat.com/result/'+encodeURIComponent(q):
    'https://www.youtube.com/results?search_query='+encodeURIComponent(q);
  window.open(u,'_blank','noopener');
}
function loadLocalVideo(file){
  if(!file)return;
  clearVideoEmbed();
  const v=document.getElementById('officeVideo');
  if(v.dataset.obj)URL.revokeObjectURL(v.dataset.obj);
  const u=URL.createObjectURL(file);v.dataset.obj=u;v.src=u;v.style.display='block';v.play().catch(()=>{});
}
function youtubeEmbedUrl(u){
  try{
    const x=new URL(u);let id='';
    if(x.hostname.includes('youtu.be'))id=x.pathname.split('/').filter(Boolean)[0]||'';
    else if(x.hostname.includes('youtube.com')){
      id=x.searchParams.get('v')||'';
      if(!id&&x.pathname.startsWith('/shorts/'))id=x.pathname.split('/')[2]||'';
    }
    return id?'https://www.youtube.com/embed/'+encodeURIComponent(id)+'?rel=0':'';
  }catch{return''}
}
function clearVideoEmbed(){
  const w=document.getElementById('videoEmbedWrap');if(w)w.innerHTML='';
}
function loadVideoUrl(){
  const u=(document.getElementById('videoUrl')?.value||'').trim();if(!u)return;
  const yt=youtubeEmbedUrl(u);
  const v=document.getElementById('officeVideo');
  if(yt){
    v.pause();v.removeAttribute('src');v.load();v.style.display='none';
    document.getElementById('videoEmbedWrap').innerHTML=`<iframe class="video-frame" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen src="${yt}"></iframe>`;
    return;
  }
  clearVideoEmbed();v.style.display='block';v.src=u;v.play().catch(()=>toast('این لینک قابل پخش مستقیم نیست'));
}
async function videoPictureInPicture(){
  const v=document.getElementById('officeVideo');
  try{
    if(document.pictureInPictureElement)await document.exitPictureInPicture();
    else if(document.pictureInPictureEnabled&&v&&v.readyState>=2)await v.requestPictureInPicture();
    else toast('Picture-in-Picture برای این ویدیو/مرورگر در دسترس نیست');
  }catch(e){toast('فعال‌سازی پنجره شناور ویدیو ممکن نشد')}
}
function makeDraggable(panelId){
  const panel=document.getElementById(panelId);if(!panel)return;
  const handle=panel.querySelector('[data-drag-handle]');if(!handle)return;
  let active=false,sx=0,sy=0,sl=0,st=0;
  const start=(x,y)=>{
    if(window.innerWidth<620)return;
    active=true;sx=x;sy=y;
    const r=panel.getBoundingClientRect();sl=r.left;st=r.top;
    panel.style.left=r.left+'px';panel.style.top=r.top+'px';panel.style.right='auto';panel.style.bottom='auto';
  };
  handle.addEventListener('pointerdown',e=>{if(e.target.tagName==='BUTTON')return;start(e.clientX,e.clientY);handle.setPointerCapture?.(e.pointerId)});
  handle.addEventListener('pointermove',e=>{
    if(!active)return;
    const maxX=Math.max(0,window.innerWidth-panel.offsetWidth),maxY=Math.max(0,window.innerHeight-panel.offsetHeight);
    panel.style.left=Math.min(maxX,Math.max(0,sl+e.clientX-sx))+'px';
    panel.style.top=Math.min(maxY,Math.max(0,st+e.clientY-sy))+'px';
  });
  const end=()=>active=false;handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
}
function registerAdminBiometric(){
  if(cloudProfile?.role!=='admin'){toast('این گزینه فقط برای مدیر سامانه فعال است');return}
  registerPasskey();
}


function fmtMediaTime(sec){
  if(!Number.isFinite(sec)||sec<0)return '0:00';
  const m=Math.floor(sec/60),s=Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}
function syncMusicTimeline(){
  const a=getOfficeAudio();if(!a)return;
  const cur=document.getElementById('musicCurrentTime'),
        dur=document.getElementById('musicDuration'),
        seek=document.getElementById('musicSeek'),
        play=document.getElementById('musicPlayMain'),
        note=document.getElementById('musicControlNote');
  if(cur)cur.textContent=fmtMediaTime(a.currentTime||0);
  if(dur)dur.textContent=fmtMediaTime(a.duration||0);
  if(seek){
    const ok=Number.isFinite(a.duration)&&a.duration>0;
    seek.disabled=!ok;
    seek.value=ok?String(Math.round((a.currentTime/a.duration)*1000)):'0';
  }
  if(play)play.textContent=(!a.paused&&a.src)?'⏸':'▶';
  if(note)note.style.display=a.src?'none':'block';
}
function previewMusicSeek(v){
  const a=getOfficeAudio(),cur=document.getElementById('musicCurrentTime');
  if(!a||!Number.isFinite(a.duration)||a.duration<=0)return;
  const t=(Number(v)/1000)*a.duration;
  if(cur)cur.textContent=fmtMediaTime(t);
}
function commitMusicSeek(v){
  const a=getOfficeAudio();if(!a||!Number.isFinite(a.duration)||a.duration<=0)return;
  a.currentTime=(Number(v)/1000)*a.duration;
  syncMusicTimeline();
}
function setMusicPanelPreset(size){
  const p=document.getElementById('musicPanel');if(!p)return;
  p.classList.remove('compact');
  p.style.height='';
  if(size==='small'){p.style.width='320px';p.style.maxHeight='420px'}
  if(size==='medium'){p.style.width='390px';p.style.maxHeight='640px'}
  if(size==='large'){p.style.width='520px';p.style.maxHeight='78vh'}
}
function resetMusicPanelSize(){
  const p=document.getElementById('musicPanel');if(!p)return;
  p.classList.remove('compact');
  p.style.width='';p.style.height='';p.style.maxHeight='';p.style.left='';p.style.right='';p.style.top='';p.style.bottom='';
}
function toggleMusicCompact(){
  const p=document.getElementById('musicPanel');if(!p)return;
  p.classList.toggle('compact');
}

function musicPrefs(){
  try{return JSON.parse(localStorage.getItem('legalOfficeMusicPrefs')||'{}')}catch{return{}}
}
function saveMusicPrefs(v){localStorage.setItem('legalOfficeMusicPrefs',JSON.stringify(v))}
function loadLocalMusic(file){
  if(!file)return;
  const a=document.getElementById('officeAudio');
  if(a.dataset.obj)URL.revokeObjectURL(a.dataset.obj);
  const u=URL.createObjectURL(file);
  a.dataset.obj=u;a.src=u;
  const prefs=musicPrefs();a.volume=Number.isFinite(Number(prefs.volume))?Number(prefs.volume):.55;
  const now=document.getElementById('musicNow');if(now)now.textContent='از دستگاه';const nt=document.getElementById('musicNowTitle');if(nt)nt.textContent=file.name;setMiniTrack(file.name,'از دستگاه');
  if('mediaSession' in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:file.name,artist:'سامانه حقوقی'})}catch{}}
  a.play().catch(()=>{});
}
function loadMusicUrl(){
  const u=(document.getElementById('musicUrl')?.value||'').trim();
  if(!u)return;
  const a=document.getElementById('officeAudio');a.src=u;
  const prefs=musicPrefs();a.volume=Number.isFinite(Number(prefs.volume))?Number(prefs.volume):.55;
  const now=document.getElementById('musicNow');if(now)now.textContent='لینک مستقیم اینترنتی';const nt=document.getElementById('musicNowTitle');if(nt)nt.textContent='پخش آنلاین';setMiniTrack('پخش آنلاین','لینک مستقیم اینترنتی');
  a.play().then(()=>setTimeout(syncMusicTimeline,80)).catch(()=>toast('این لینک قابل پخش مستقیم نیست؛ لینک مستقیم فایل صوتی لازم است'));
}
function saveMusicVolume(v){const p=musicPrefs();p.volume=Number(v);saveMusicPrefs(p)}
function addMusicFavorite(){
  const title=(document.getElementById('musicFavTitle')?.value||'').trim();
  const url=(document.getElementById('musicFavUrl')?.value||'').trim();
  if(!title||!url){toast('عنوان و لینک را وارد کنید');return}
  try{new URL(url)}catch{toast('لینک معتبر نیست');return}
  const p=musicPrefs();p.favorites=Array.isArray(p.favorites)?p.favorites:[];
  p.favorites.unshift({id:Date.now(),title,url});p.favorites=p.favorites.slice(0,30);saveMusicPrefs(p);
  document.getElementById('musicFavTitle').value='';document.getElementById('musicFavUrl').value='';
  renderMusicFavorites();toast('لینک موسیقی ذخیره شد');
}
function deleteMusicFavorite(id){
  const p=musicPrefs();p.favorites=(p.favorites||[]).filter(x=>String(x.id)!==String(id));saveMusicPrefs(p);renderMusicFavorites();
}
function renderMusicFavorites(){
  const box=document.getElementById('musicFavorites');if(!box)return;
  const favs=musicPrefs().favorites||[];
  box.innerHTML=favs.length?favs.map(x=>`<div class="music-fav"><button class="secondary grow" onclick="window.open('${String(x.url).replace(/'/g,"\\'")}','_blank','noopener')">${esc(x.title)}</button><button class="danger" onclick="deleteMusicFavorite('${x.id}')">حذف</button></div>`).join(''):'<div class="mini">هنوز لینکی ذخیره نشده است.</div>';
}
async function prepareOfficeWorkflowSelects(){
 const clientOpts='<option value="">—</option>'+selectOptions(state.clients,x=>x.fullName||x.name||'موکل');
 const caseOpts='<option value="">—</option>'+selectOptions(state.cases,x=>x.title||x.caseNo||'پرونده');
 for(const id of ['csClient','handoverClient']){const e=document.getElementById(id);if(e)e.innerHTML=clientOpts}
 for(const id of ['csCase','handoverCase']){const e=document.getElementById(id);if(e)e.innerHTML=caseOpts}
 const s=document.getElementById('letterSigner');if(s&&sb){try{const {data}=await sb.from('profiles').select('id,full_name,role').eq('active',true);s.innerHTML='<option value="">—</option>'+(data||[]).map(x=>`<option value="${x.id}">${esc(x.full_name||x.role)}</option>`).join('')}catch{}}
}
async function loadOfficeSettings(){if(officeSettingsCache)return officeSettingsCache;try{const {data,error}=await sb.from('app_settings').select('*').eq('id',1).single();if(error)throw error;officeSettingsCache=data||{};return officeSettingsCache}catch{return {institute_name:state.settings.instituteName,address:state.settings.address,phone:state.settings.phone}}}
async function assetUrl(bucket,path){if(!path)return'';try{const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,900);if(error)throw error;return data.signedUrl}catch{return''}}
async function letterheadHtml(title,body,opts={}){const s=await loadOfficeSettings();const logo=await assetUrl('institute-assets',s.letterhead_logo_path||s.institute_logo_path);const stamp=opts.stamp?await assetUrl('institute-assets',s.letterhead_stamp_path):'';const signer=opts.signer||'';return `<div class="letterhead-preview" dir="rtl"><div class="lh-head">${logo?`<img class="lh-logo" src="${logo}">`:''}<div><div class="lh-title">${esc(s.letterhead_title||s.institute_name||state.settings.instituteName||'مؤسسه حقوقی')}</div><div class="lh-meta">${esc(s.letterhead_subtitle||'')} ${s.registration_no?`| شماره ثبت: ${esc(s.registration_no)}`:''}</div></div></div><h2 style="text-align:center">${esc(title||'')}</h2><div class="lh-body">${esc(body||'').replace(/\n/g,'<br>')}</div><div style="display:flex;justify-content:space-between;align-items:end;margin-top:30px"><div>${signer?`<b>امضاء:</b> ${esc(signer)}`:''}</div>${stamp?`<img class="stamp-img" src="${stamp}" alt="مهر موسسه">`:''}</div><div class="lh-footer">${esc(s.letterhead_footer||'')}<br>${esc(s.letterhead_address||s.address||'')} ${s.letterhead_phone||s.phone?` | تلفن: ${esc(s.letterhead_phone||s.phone||'')}`:''}</div></div>`}
function openPrintWindow(html,title='چاپ'){const w=window.open('','_blank');if(!w){toast('اجازه باز شدن پنجره چاپ داده نشده');return}w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Tahoma,Arial;margin:0;background:#fff}.letterhead-preview{max-width:794px;min-height:1123px;margin:auto;padding:18mm;box-sizing:border-box}.lh-head{border-bottom:2px solid #155fa0;padding-bottom:10px;margin-bottom:18px;display:flex;align-items:center;gap:12px}.lh-logo{width:74px;height:74px;object-fit:contain}.lh-title{font-size:22px;font-weight:800}.lh-meta,.lh-footer{font-size:12px;color:#555}.lh-body{line-height:2.1;text-align:justify}.stamp-img{width:110px;max-height:110px;object-fit:contain}@page{size:A4;margin:0}</style></head><body>${html}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);w.document.close()}
function downloadTextFile(name,content,mime='text/html'){const b=new Blob([content],{type:mime+';charset=utf-8'});downloadBlob(b,name)}
function buildBaseContractText(){const f=document.getElementById('contractStudioForm'),d=formData(f);const lines=[`این قرارداد فی‌مابین ${d.party1||'طرف اول'} و ${d.party2||'طرف دوم'} منعقد گردید.`,`موضوع قرارداد: ${d.subject||'—'}`,d.amount?`مبلغ/حق‌الزحمه: ${d.amount}`:'',`طرفین با علم و اطلاع کامل، مفاد قرارداد را پذیرفته و متعهد به اجرای آن می‌باشند.`,`سایر شرایط و تعهدات طرفین در ادامه درج می‌گردد.`].filter(Boolean);f.elements.body.value=lines.join('\n\n');toast('متن پایه ساخته شد؛ آن را تکمیل و ویرایش کنید')}
async function contractFormHtml(){const f=document.getElementById('contractStudioForm'),d=formData(f);const meta=[d.party1&&`طرف اول: ${d.party1}`,d.party2&&`طرف دوم: ${d.party2}`,d.subject&&`موضوع: ${d.subject}`,d.amount&&`مبلغ: ${d.amount}`].filter(Boolean).join('\n');return await letterheadHtml(d.title,(meta?meta+'\n\n':'')+(d.body||''),{stamp:true})}
async function previewContractFromForm(){document.getElementById('contractPreview').innerHTML=await contractFormHtml()}
async function printContractFromForm(){openPrintWindow(await contractFormHtml(),document.getElementById('contractStudioForm').elements.title.value||'قرارداد')}
async function exportContractHtml(){const h=await contractFormHtml();downloadTextFile('contract-'+Date.now()+'.html',`<html dir="rtl"><meta charset="utf-8"><body>${h}</body></html>`)}
async function exportContractDoc(){const h=await contractFormHtml();downloadTextFile('contract-'+Date.now()+'.doc',`<html dir="rtl"><meta charset="utf-8"><body>${h}</body></html>`,'application/msword')}
async function saveContractDraft(e){e.preventDefault();const d=formData(e.target);try{const {error}=await sb.from('contract_drafts').insert({title:d.title,contract_type:d.contractType||null,client_id:d.clientId||null,case_id:d.caseId||null,raw_input:JSON.stringify({party1:d.party1,party2:d.party2,amount:d.amount,subject:d.subject}),formatted_body:d.body||'',letterhead_enabled:true,created_by:cloudProfile.id,updated_by:cloudProfile.id});if(error)throw error;toast('پیش‌نویس قرارداد ذخیره شد');await loadContractDrafts()}catch(err){console.error(err);toast('ذخیره پیش‌نویس انجام نشد')}}
async function loadContractDrafts(){const el=document.getElementById('contractDraftList');if(!el)return;try{const {data,error}=await sb.from('contract_drafts').select('*').order('updated_at',{ascending:false});if(error)throw error;contractDrafts=data||[];el.innerHTML=contractDrafts.map(x=>`<div class="item"><div class="row"><b>${esc(x.title)}</b><span class="badge">${esc(x.contract_type||'قرارداد')}</span></div><div class="meta">${esc((x.formatted_body||'').slice(0,180))}</div><div class="actions"><button class="secondary" onclick="loadContractDraft('${x.id}')">ویرایش</button><button class="secondary" onclick="printSavedContract('${x.id}')">🖨 چاپ</button></div></div>`).join('')||empty()}catch(e){el.innerHTML=empty()}}
function loadContractDraft(id){const x=contractDrafts.find(a=>a.id===id);if(!x)return;const f=document.getElementById('contractStudioForm');f.elements.title.value=x.title||'';f.elements.contractType.value=x.contract_type||'';f.elements.clientId.value=x.client_id||'';f.elements.caseId.value=x.case_id||'';f.elements.body.value=x.formatted_body||'';try{const r=JSON.parse(x.raw_input||'{}');['party1','party2','amount','subject'].forEach(k=>{if(f.elements[k])f.elements[k].value=r[k]||''})}catch{};window.scrollTo({top:0,behavior:'smooth'})}
async function printSavedContract(id){const x=contractDrafts.find(a=>a.id===id);if(!x)return;openPrintWindow(await letterheadHtml(x.title,x.formatted_body||'',{stamp:true}),x.title)}
async function letterFormHtml(){const f=document.getElementById('letterForm'),d=formData(f);let signer='';if(d.signerProfileId){try{const {data}=await sb.from('profiles').select('full_name').eq('id',d.signerProfileId).single();signer=data?.full_name||''}catch{}}const head=[d.recipient&&`مخاطب: ${d.recipient}`,d.subject&&`موضوع: ${d.subject}`,d.referenceNo&&`شماره: ${d.referenceNo}`,d.referenceDate&&`تاریخ: ${d.referenceDate}`].filter(Boolean).join('\n');return await letterheadHtml(d.title,(head?head+'\n\n':'')+(d.body||''),{stamp:!!f.elements.stampEnabled.checked,signer})}
async function previewLetterFromForm(){document.getElementById('letterPreview').innerHTML=await letterFormHtml()}
async function printLetterFromForm(){openPrintWindow(await letterFormHtml(),document.getElementById('letterForm').elements.title.value||'نامه')}
async function exportLetterDoc(){downloadTextFile('letter-'+Date.now()+'.doc',`<html dir="rtl"><meta charset="utf-8"><body>${await letterFormHtml()}</body></html>`,'application/msword')}
async function saveLetterDraft(e){e.preventDefault();const d=formData(e.target);try{const {error}=await sb.from('letter_drafts').insert({title:d.title,subject:d.subject||null,recipient:d.recipient||null,reference_no:d.referenceNo||null,reference_date:d.referenceDate||null,body:d.body||'',stamp_enabled:!!e.target.elements.stampEnabled.checked,signer_profile_id:d.signerProfileId||null,created_by:cloudProfile.id,updated_by:cloudProfile.id});if(error)throw error;toast('نامه ذخیره شد');await loadLetterDrafts()}catch(err){console.error(err);toast('ذخیره نامه انجام نشد')}}
async function loadLetterDrafts(){const el=document.getElementById('letterDraftList');if(!el)return;try{const {data,error}=await sb.from('letter_drafts').select('*').order('updated_at',{ascending:false});if(error)throw error;letterDrafts=data||[];el.innerHTML=letterDrafts.map(x=>`<div class="item"><div class="row"><b>${esc(x.title)}</b><span class="badge">نامه</span></div><div class="meta">${esc(x.recipient||'')} | ${esc(x.subject||'')}</div><div class="actions"><button class="secondary" onclick="printSavedLetter('${x.id}')">🖨 چاپ</button><button class="secondary" onclick="shareTextItem('${esc(x.title)}','${esc((x.body||'').replace(/'/g,'’'))}')">↗ ارسال</button></div></div>`).join('')||empty()}catch{el.innerHTML=empty()}}
async function printSavedLetter(id){const x=letterDrafts.find(a=>a.id===id);if(!x)return;openPrintWindow(await letterheadHtml(x.title,`${x.recipient?'مخاطب: '+x.recipient+'\n':''}${x.subject?'موضوع: '+x.subject+'\n\n':''}${x.body||''}`,{stamp:x.stamp_enabled}),x.title)}
async function saveHandover(e){e.preventDefault();const d=formData(e.target);try{const {data,error}=await sb.from('handover_records').insert({handover_date:d.handoverDate,handover_time:d.handoverTime||null,recipient_type:d.recipientType,recipient_name:d.recipientName,recipient_mobile:d.recipientMobile||null,recipient_organization:d.recipientOrganization||null,client_id:d.clientId||null,case_id:d.caseId||null,purpose:d.purpose||null,due_return_date:d.dueReturnDate||null,return_required:!!e.target.elements.returnRequired.checked,return_status:e.target.elements.returnRequired.checked?'pending':'not_required',delivery_method:d.deliveryMethod||null,notes:d.notes||null,created_by:cloudProfile.id,updated_by:cloudProfile.id}).select().single();if(error)throw error;const lines=(d.items||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);if(lines.length){const items=lines.map(line=>{const [title,kind,qty]=line.split('|').map(x=>(x||'').trim());const map={'اصل':'original','کپی':'copy','رونوشت برابر':'certified_copy','دیجیتال':'digital'};return {handover_id:data.id,item_type:'other',item_title:title||line,quantity:Number(qty)||1,original_or_copy:map[kind]||'copy'}});await sb.from('handover_items').insert(items)}e.target.reset();toast('تحویل مدارک ثبت شد');await loadHandovers()}catch(err){console.error(err);toast('ثبت تحویل انجام نشد')}}
async function loadHandovers(){const el=document.getElementById('handoverList');if(!el)return;try{const {data,error}=await sb.from('handover_records').select('*, handover_items(*)').order('created_at',{ascending:false});if(error)throw error;handovers=data||[];renderHandovers()}catch(e){el.innerHTML=empty()}}
function renderHandovers(){const el=document.getElementById('handoverList');if(!el)return;const q=(document.getElementById('handoverSearch')?.value||'').toLowerCase(),st=document.getElementById('handoverStatus')?.value||'';const now=new Date();el.innerHTML=(handovers||[]).filter(x=>(!st||x.return_status===st)&&(!q||JSON.stringify(x).toLowerCase().includes(q))).map(x=>{let overdue=x.return_required&&x.return_status!=='returned'&&x.due_return_date&&daysUntilJalali(x.due_return_date)<0;return `<div class="item ${overdue?'status-overdue':x.return_status==='returned'?'status-returned':''}"><div class="row"><div><b>${esc(x.recipient_name)}</b><div class="meta">${esc(x.handover_date)} ${esc(x.handover_time||'')} | ${esc(x.recipient_mobile||'')}</div></div><span class="badge">${overdue?'معوق':esc(x.return_status)}</span></div><div class="meta">پرونده: ${esc(caseName(x.case_id))} | موکل: ${esc(clientName(x.client_id))}<br>${esc(x.purpose||'')}</div><div>${(x.handover_items||[]).map(i=>`<span class="pill">${esc(i.item_title)} × ${i.quantity}</span>`).join('')}</div><div class="actions"><button class="secondary" onclick="printHandover('${x.id}')">🖨 رسید تحویل</button><button class="secondary" onclick="shareHandover('${x.id}')">↗ ارسال</button>${x.return_status!=='returned'?`<button class="primary" onclick="markHandoverReturned('${x.id}')">✓ عودت کامل</button>`:''}</div></div>`}).join('')||empty()}
async function markHandoverReturned(id){try{await sb.from('handover_records').update({return_status:'returned',returned_at:new Date().toISOString(),updated_by:cloudProfile.id}).eq('id',id);await sb.from('handover_status_history').insert({handover_id:id,status:'returned',description:'عودت کامل',changed_by:cloudProfile.id});await loadHandovers();toast('عودت ثبت شد')}catch{toast('ثبت عودت انجام نشد')}}
async function handoverHtml(x){const items=(x.handover_items||[]).map((i,n)=>`${n+1}. ${i.item_title} — ${i.original_or_copy} — تعداد ${i.quantity}`).join('\n');const body=`تحویل‌گیرنده: ${x.recipient_name}\nموبایل: ${x.recipient_mobile||'—'}\nتاریخ تحویل: ${x.handover_date} ${x.handover_time||''}\nپرونده: ${caseName(x.case_id)}\nموکل: ${clientName(x.client_id)}\nعلت تحویل: ${x.purpose||'—'}\nموعد عودت: ${x.due_return_date||'—'}\n\nاقلام:\n${items}\n\nتوضیحات: ${x.notes||'—'}`;return letterheadHtml('رسید تحویل و امانت مدارک',body,{stamp:true})}
async function printHandover(id){const x=handovers.find(a=>a.id===id);if(x)openPrintWindow(await handoverHtml(x),'رسید تحویل مدارک')}
async function shareHandover(id){const x=handovers.find(a=>a.id===id);if(!x)return;const txt=`رسید تحویل مدارک\nگیرنده: ${x.recipient_name}\nتاریخ: ${x.handover_date}\nاقلام:\n${(x.handover_items||[]).map(i=>'- '+i.item_title).join('\n')}`;shareTextItem('رسید تحویل مدارک',txt)}
async function shareTextItem(title,text){try{if(navigator.share)await navigator.share({title,text});else{await navigator.clipboard.writeText(text);toast('متن برای ارسال کپی شد')}}catch{}}
async function printCloudDocument(id,path){try{const u=await getSignedDocUrl(path);const w=window.open(u,'_blank');if(!w)toast('اجازه باز شدن پنجره داده نشده')}catch{toast('چاپ سند ممکن نشد')}}
async function shareCloudDocument(id,path,name,title){try{const u=await getSignedDocUrl(path);const r=await fetch(u),b=await r.blob(),file=new File([b],name||'document',{type:b.type||'application/octet-stream'});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:title||name,files:[file]});else if(navigator.share)await navigator.share({title:title||name,url:u});else{await navigator.clipboard.writeText(u);toast('لینک سند کپی شد')}}catch(e){console.error(e);toast('ارسال سند انجام نشد')}}
function adliranPlainText(p,includeSecrets=false){const fs=(p.adliran_profile_fields||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).filter(f=>includeSecrets||!f.is_secret);return [`نام: ${p.person_label||''}`,`کد ملی: ${p.national_id||''}`,`موبایل: ${p.mobile||''}`,`شناسه ثنا: ${p.sana_username||''}`,...fs.map(f=>`${f.field_label}: ${f.field_value||''}`)].join('\n')}
async function printAdliranProfile(id){const p=getAdliranProfile(id);if(!p)return;const inc=confirm('رمزهای محرمانه هم در چاپ درج شوند؟');openPrintWindow(await letterheadHtml('اطلاعات عدل ایران / ثنا',adliranPlainText(p,inc),{stamp:false}),p.person_label)}
async function shareAdliranProfile(id){const p=getAdliranProfile(id);if(!p)return;const inc=confirm('رمزهای محرمانه هم ارسال شوند؟');shareTextItem('اطلاعات عدل ایران '+p.person_label,adliranPlainText(p,inc))}
async function uploadAdliranDocument(profileId){const inp=document.createElement('input');inp.type='file';inp.accept='.pdf,.jpg,.jpeg,.png,.doc,.docx';inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;const title=prompt('عنوان مدرک:',file.name)||file.name;try{const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_'),path=`adliran/${profileId}/${Date.now()}-${safe}`;const {error:up}=await sb.storage.from('legal-documents').upload(path,file,{contentType:file.type||'application/octet-stream'});if(up)throw up;const {error}=await sb.from('adliran_documents').insert({adliran_profile_id:profileId,title,file_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,created_by:cloudProfile.id});if(error)throw error;toast('مدرک عدل ایران ذخیره شد');loadAdliranDocuments()}catch(e){console.error(e);toast('ذخیره مدرک انجام نشد')}};inp.click()}
async function loadAdliranDocuments(){const el=document.getElementById('adliranDocsList');if(!el)return;try{const {data,error}=await sb.from('adliran_documents').select('*').order('created_at',{ascending:false});if(error)throw error;adliranDocs=data||[];el.innerHTML=adliranDocs.map(x=>`<div class="item"><div class="row"><b>${esc(x.title)}</b><span class="badge">${esc(x.document_type||'مدرک')}</span></div><div class="meta">${esc(x.file_name||'')} | ${((Number(x.file_size)||0)/1024).toFixed(0)} KB</div><div class="actions"><button class="secondary" onclick="openCloudDocument('${x.id}','${esc(x.file_path)}')">باز</button><button class="secondary" onclick="printCloudDocument('${x.id}','${esc(x.file_path)}')">🖨 چاپ</button><button class="secondary" onclick="shareCloudDocument('${x.id}','${esc(x.file_path)}','${esc(x.file_name||'document')}','${esc(x.title)}')">↗ ارسال</button></div></div>`).join('')||empty()}catch{el.innerHTML=empty()}}


document.addEventListener('DOMContentLoaded',()=>{
  try{
    const a=getOfficeAudio();
    const prefs=musicPrefs();
    if(a){
      const vol=Number(prefs.volume);
      a.volume=Number.isFinite(vol)?vol:.55;
      const vv=document.getElementById('musicVolume'); if(vv) vv.value=String(a.volume);
      const mv=document.getElementById('miniVolume'); if(mv) mv.value=String(a.volume);
      const sync=()=>{ try{updateMusicControlUI();syncMusicTimeline()}catch{} };
      ['play','pause','ended','loadedmetadata','durationchange','timeupdate','seeking','volumechange']
        .forEach(ev=>a.addEventListener(ev,sync));
    }
    try{initMiniPlayerDrag()}catch{}
    try{makeDraggable('musicPanel')}catch{}
    try{renderMusicFavorites()}catch{}
  }catch(e){console.warn('media init',e)}
});

