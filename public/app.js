/* ============================================================
   SIO Chat Bot Solution — proof of concept
   Single-file demo. Data persists via window.storage.
   ============================================================ */

const K_KB='sio_kb_v2', K_LOGS='sio_logs_v2', K_STATE='sio_state_v2';
const LANGS={en:'English',ar:'Arabic',hi:'Hindi',ur:'Urdu',ml:'Malayalam',ta:'Tamil',bn:'Bengali',tl:'Tagalog'};
const SPEECH={en:'en-US',ar:'ar-BH',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN',ta:'ta-IN',bn:'bn-IN',tl:'fil-PH'};
const RTL=['ar','ur'];
const INTENTS={registration:'Registration',contributions:'Contributions',old_age_pension:'Old-age pension',
  pension_estimate:'Benefit estimate',unemployment:'Unemployment insurance',work_injury:'Work injury',
  survivors:'Survivor benefits',account_update:'Account update',certificates:'Certificates',other:'Other'};

const REQS=[
 {id:'conv', t:'Conversational AI',            h:'Answers on services, laws and procedures'},
 {id:'calc', t:'Indicative benefit estimate',  h:'Rule-based calculation with disclaimer'},
 {id:'voice',t:'Voice interaction',            h:'Speech-to-text and text-to-speech'},
 {id:'lang', t:'Multilingual support + RTL',   h:'Arabic, English and expatriate languages'},
 {id:'omni', t:'Omnichannel deployment',       h:'Website widget, extendable to WhatsApp'},
 {id:'kb',   t:'Knowledge base management',    h:'SIO staff edit answers without a vendor'},
 {id:'esc',  t:'Escalation mechanism',         h:'Handoff to agent with ticket reference'},
 {id:'log',  t:'Logging + dashboard',          h:'Audit trail, analytics and export'}
];

const SEED_KB=[
 {id:'kb-01',title:'Registering an employee for social insurance',body:'Employers register each new employee through the SIO employer portal at the start of employment, using the employee\'s CPR, job title, start date and contractual wage. Registration must be completed before the first contribution period closes. Employees can confirm their registration status in the SIO self-service portal.'},
 {id:'kb-02',title:'Monthly contribution rates and payment',body:'Contributions are calculated on the insured monthly wage and shared between employer and employee at the rates held in the demo rule set. The employer deducts the employee share, adds its own share and pays the total through the employer portal each month. Late payment attracts a surcharge.'},
 {id:'kb-03',title:'Old-age pension eligibility',body:'An old-age pension requires reaching the qualifying retirement age and completing the minimum insured service period held in the rule set. Contributory service with more than one employer is combined. Applications are submitted through the SIO portal or at a service centre with the CPR and service records.'},
 {id:'kb-04',title:'How the pension amount is calculated',body:'The pension is based on the average insured wage over the averaging period, multiplied by an accrual rate for each completed year of insured service, capped at a maximum share of that average wage. Amounts produced by the assistant are indicative only; the binding figure is issued by SIO after verification of records.'},
 {id:'kb-05',title:'Unemployment insurance',body:'An insured worker who loses employment through no fault of their own may claim unemployment benefit if the minimum contribution history is met, the claim is registered within the notification window, and the claimant registers as a jobseeker and remains available for work. Benefit is paid for a limited number of months.'},
 {id:'kb-06',title:'Work injury and occupational disease',body:'Injuries arising from or during work are reported by the employer to SIO promptly. Cover includes treatment costs, a daily allowance during temporary incapacity, and a pension or lump sum where permanent disability is assessed by the medical board.'},
 {id:'kb-07',title:'Survivor benefits',body:'On the death of an insured person or pensioner, eligible dependants may claim a share of the pension entitlement. Claims require the death certificate, proof of relationship and the claimant\'s bank details. Shares are distributed according to the applicable regulations.'},
 {id:'kb-08',title:'Updating personal and bank details',body:'Insured persons and pensioners update mobile number, address and bank IBAN through the SIO self-service portal or at a service centre with the CPR. Bank changes take effect from the next payment cycle if submitted before the cut-off date.'},
 {id:'kb-09',title:'Contribution statements and service certificates',body:'A statement of contributions and a certificate of insured service can be generated on demand from the self-service portal and are issued electronically. Employers can download establishment-level statements from the employer portal.'},
 {id:'kb-10',title:'Service centres and contact channels',body:'SIO serves the public through its service centres during published working hours, the call centre on 17000707, the self-service portal and this assistant. Complaints and case-specific enquiries are handled by agents, not by the assistant.'}
];

const SEED_RULES={accrual:2,cap:80,minService:20,retireAge:60,avgYears:2,empShare:8,erShare:15,currency:'BHD'};

let KB={articles:[],rules:{...SEED_RULES}};
let LOGS=[];
let STATE={cov:{},channel:'web',speak:true,seeded:false};
let history=[];     // model conversation history
let busy=false, recog=null, recording=false;
let lastLang='en';  // language of the last reply; the mic listens in it when set to auto-detect

/* ---------- storage ---------- */
async function sGet(k){ try{const v=localStorage.getItem(k); return v?JSON.parse(v):null;}catch(e){return null;} }
async function sSet(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.warn('save failed',k);} }
const saveKB=()=>sSet(K_KB,KB), saveLogs=()=>sSet(K_LOGS,LOGS.slice(-300)), saveState=()=>sSet(K_STATE,STATE);

/* ---------- boot ---------- */
(async function boot(){
  const [kb,logs,st]=await Promise.all([sGet(K_KB),sGet(K_LOGS),sGet(K_STATE)]);
  KB = kb && kb.articles && kb.articles.length ? kb : {articles:SEED_KB.map(a=>({...a})),rules:{...SEED_RULES}};
  STATE = st || STATE;
  LOGS = logs || [];
  if(!LOGS.length){ LOGS=seedLogs(); STATE.seeded=true; saveLogs(); }
  if(!kb) saveKB();
  renderReqs(); renderKB(); renderRules(); renderLogs(); renderDash(); setChannel(STATE.channel,true);
  document.getElementById('btnSpeak').classList.toggle('on',!!STATE.speak);
  greet();
})();

function greet(){
  addMsg('bot',"Welcome to the Social Insurance Organization. I can help with registration, contributions, pensions, unemployment insurance and work injury claims. Ask me in Arabic, English, Hindi, Urdu, Malayalam, Tamil, Bengali or Tagalog.",{lang:'en',noLog:true});
  setSugs(['What are the contribution rates?','ما هي شروط التقاعد؟','Estimate my pension','How do I update my bank details?']);
}

/* ---------- sample history ---------- */
function seedLogs(){
  const qs=[['contributions','What percentage is deducted from my salary?','en'],['old_age_pension','متى يحق لي التقاعد؟','ar'],
   ['pension_estimate','Estimate my monthly pension','en'],['unemployment','बेरोज़गारी लाभ कैसे मिलेगा?','hi'],
   ['registration','How do I register a new worker?','en'],['work_injury','I was injured at work last week','en'],
   ['account_update','How to change my IBAN?','ml'],['certificates','I need a contribution statement','en'],
   ['survivors','معاش الورثة كيف يحسب؟','ar'],['contributions','Employer has not paid my contributions','ur'],
   ['old_age_pension','Retirement age for women','en'],['other','Complaint about service centre queue','tl'],
   ['pension_estimate','நான் எவ்வளவு ஓய்வூதியம் பெறுவேன்?','ta'],['registration','নতুন কর্মী নিবন্ধন','bn']];
  const out=[]; const now=Date.now();
  for(let d=13;d>=0;d--){
    const n=6+Math.floor(Math.random()*9);
    for(let i=0;i<n;i++){
      const q=qs[Math.floor(Math.random()*qs.length)];
      const esc=Math.random()<0.14;
      out.push({id:'s'+d+'-'+i, ts:now-d*864e5+i*24e5, q:q[1], lang:q[2], intent:q[0],
        conf:esc?0.3+Math.random()*0.2:0.72+Math.random()*0.26,
        channel:Math.random()<0.22?'whatsapp':'web', outcome:esc?'escalated':'resolved',
        ticket:esc?'SIO-'+(4100+out.length):null, sample:true, ms:600+Math.floor(Math.random()*1400)});
    }
  }
  return out;
}

/* ---------- coverage rail ---------- */
function renderReqs(){
  document.getElementById('reqs').innerHTML=REQS.map(r=>
    `<div class="req ${STATE.cov[r.id]?'done':''}" id="req-${r.id}">
       <span class="tick">✓</span><span class="t">${r.t}<span class="h">${r.h}</span></span></div>`).join('');
  const done=REQS.filter(r=>STATE.cov[r.id]).length;
  document.getElementById('covBar').style.width=(done/REQS.length*100)+'%';
}
function mark(id){ if(STATE.cov[id])return; STATE.cov[id]=true; saveState(); renderReqs();
  const el=document.getElementById('req-'+id); if(el) el.scrollIntoView({block:'nearest'}); }

/* ---------- navigation ---------- */
document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.navbtn').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  const v=b.dataset.view;
  document.querySelectorAll('.view').forEach(s=>s.classList.remove('on'));
  document.getElementById('v-'+v).classList.add('on');
  if(v==='logs'||v==='dash'){ mark('log'); renderLogs(); renderDash(); }
}));
document.getElementById('coverToggle').addEventListener('click',()=>document.getElementById('cover').classList.toggle('open'));
if(window.innerWidth<1180) document.getElementById('coverToggle').style.display='grid';

/* ---------- chat rendering ---------- */
function addMsg(role,text,opt={}){
  const s=document.getElementById('stream');
  const wrap=document.createElement('div');
  wrap.className='msg '+(role==='me'?'me':'bot');
  const dir=RTL.includes(opt.lang)?'rtl':'ltr';
  wrap.innerHTML=`<div class="av">${role==='me'?'You':'●'}</div><div style="min-width:0"><div class="bub" dir="${dir}"></div></div>`;
  wrap.querySelector('.bub').textContent=text;
  s.appendChild(wrap); s.scrollTop=s.scrollHeight;
  return wrap.querySelector('div[style]');
}
function metaLine(host,parts,speakText,lang){
  const m=document.createElement('div'); m.className='meta';
  m.innerHTML=parts.map(p=>`<span>${p}</span>`).join('');
  if(speakText){
    const b=document.createElement('button'); b.textContent='play audio';
    b.onclick=()=>speak(speakText,lang); m.appendChild(b);
  }
  host.appendChild(m);
}
function setSugs(list){
  const el=document.getElementById('sugs'); el.innerHTML='';
  (list||[]).slice(0,4).forEach(t=>{
    const b=document.createElement('button'); b.className='sug'; b.textContent=t;
    b.onclick=()=>{ document.getElementById('input').value=t; send(); };
    el.appendChild(b);
  });
}

/* ---------- channel + voice ---------- */
function setChannel(c,quiet){
  STATE.channel=c; if(!quiet) saveState();
  document.getElementById('device').classList.toggle('wa',c==='whatsapp');
  document.getElementById('btnChannelWeb').classList.toggle('on',c==='web');
  document.getElementById('btnChannelWa').classList.toggle('on',c==='whatsapp');
  document.getElementById('chanHint').textContent='Channel: '+(c==='whatsapp'?'WhatsApp Business':'website widget');
  if(c==='whatsapp'&&!quiet) mark('omni');
}
document.getElementById('btnChannelWeb').onclick=()=>setChannel('web');
document.getElementById('btnChannelWa').onclick=()=>{setChannel('whatsapp');saveState();};
document.getElementById('btnSpeak').onclick=e=>{ STATE.speak=!STATE.speak; saveState();
  e.currentTarget.classList.toggle('on',STATE.speak); toast(STATE.speak?'Replies will be read aloud':'Audio replies off'); };

// Voices load asynchronously in Chrome/Edge; keep a cached list that refreshes when they arrive.
let VOICES=[];
function loadVoices(){ VOICES='speechSynthesis' in window?speechSynthesis.getVoices():[]; }
if('speechSynthesis' in window){ loadVoices(); speechSynthesis.addEventListener('voiceschanged',loadVoices); }

// Exact locale first (ar-BH), then any regional variant of the language (ar-SA, ar-EG…),
// preferring higher-quality online/natural voices.
function pickVoice(lang){
  if(!VOICES.length) loadVoices();
  const want=(SPEECH[lang]||'en-US').toLowerCase(), base=want.split('-')[0];
  const norm=v=>v.lang.replace('_','-').toLowerCase();
  const rank=v=>/natural|online|google/i.test(v.name)?0:1;
  const exact=VOICES.filter(v=>norm(v)===want).sort((a,b)=>rank(a)-rank(b));
  if(exact.length) return exact[0];
  const pref=base==='ar'?['ar-bh','ar-sa','ar-ae','ar-kw','ar-qa','ar-eg']:[];
  const same=VOICES.filter(v=>norm(v).split('-')[0]===base)
    .sort((a,b)=>{ const pa=pref.indexOf(norm(a)), pb=pref.indexOf(norm(b));
      return ((pa<0?99:pa)-(pb<0?99:pb))||(rank(a)-rank(b)); });
  return same[0]||null;
}

// Read-aloud: the browser's own voice when it has one for the language (Edge has natural
// Arabic voices), otherwise free audio from the local server (/api/tts) so every browser speaks.
let player=null;

function stopAudio(){
  if(player){ player.pause(); player=null; }
  if('speechSynthesis' in window) speechSynthesis.cancel();
}

async function speak(text,lang){
  stopAudio();
  const v=pickVoice(lang);
  if(v) return speakBrowser(text,v);
  try{
    const res=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text,lang})});
    if(!res.ok) throw new Error((await res.json().catch(()=>({}))).error||res.status);
    const url=URL.createObjectURL(await res.blob());
    const a=new Audio(url); player=a;
    a.onended=()=>URL.revokeObjectURL(url);
    await a.play(); mark('voice');
  }catch(e){
    if(e&&e.name==='NotAllowedError') return toast('The browser blocked autoplay — press play audio');
    toast(`Could not play ${LANGS[lang]||lang} audio — ${e.message||'check the network'}`);
  }
}

function speakBrowser(text,v){
  try{
    const u=new SpeechSynthesisUtterance(text);
    u.voice=v; u.lang=v.lang; u.rate=.98;
    speechSynthesis.speak(u); mark('voice');
  }catch(e){ toast('Audio playback unavailable here'); }
}

// Speech input: the browser's built-in recognition (Chrome, Edge, Safari) when it exists,
// otherwise Whisper running inside the page (Firefox, or browsers where built-in fails).
const micLang=()=>{ const sel=document.getElementById('lang').value; return sel==='auto'?lastLang:sel; };
const setRec=on=>{ recording=on; document.getElementById('mic').classList.toggle('rec',on); };
let srBroken=false;

document.getElementById('mic').onclick=()=>{
  if(recording){ recog&&recog.stop(); return; }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR||srBroken) return recordWhisper();
  recog=new SR(); recog.lang=SPEECH[micLang()]; recog.interimResults=true; recog.continuous=false;
  recog.onstart=()=>{setRec(true);mark('voice');};
  recog.onend=()=>setRec(false);
  recog.onerror=e=>{
    if(e.error==='network'||e.error==='service-not-allowed'||e.error==='language-not-supported'){
      srBroken=true; toast('Built-in speech input is unavailable here — press the mic again to use on-device recognition');
    }else toast('Could not hear anything — check microphone access');
  };
  recog.onresult=e=>{ let t=''; for(const r of e.results) t+=r[0].transcript;
    inputEl.value=t; if(e.results[e.results.length-1].isFinal) setTimeout(send,250); };
  recog.start();
};

const WHISPER_LANG={en:'english',ar:'arabic',hi:'hindi',ur:'urdu',ml:'malayalam',ta:'tamil',bn:'bengali',tl:'tagalog'};
let whisper=null;
function loadWhisper(){
  if(!whisper){
    toast('Loading the speech model — first time only, about 75 MB');
    whisper=import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js')
      .then(m=>m.pipeline('automatic-speech-recognition','Xenova/whisper-base'))
      .catch(e=>{ whisper=null; throw e; });
  }
  return whisper;
}

// Record raw PCM with Web Audio, stop after a pause in speech, resample to 16 kHz for Whisper.
async function recordWhisper(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    toast('This browser cannot record audio — typing works everywhere'); return; }
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ toast('Microphone access was blocked — allow it in the address bar and try again'); return; }
  stopAudio(); loadWhisper().catch(()=>{});
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const src=ctx.createMediaStreamSource(stream);
  const node=ctx.createScriptProcessor(4096,1,1);
  const chunks=[]; const t0=Date.now(); let lastVoice=Date.now(), heard=false, done=false;
  const sel=document.getElementById('lang').value;

  const finish=async()=>{
    if(done) return; done=true;
    node.disconnect(); src.disconnect(); stream.getTracks().forEach(t=>t.stop());
    const rate=ctx.sampleRate; ctx.close(); setRec(false); recog=null;
    if(!heard){ toast('Could not hear anything — check microphone access'); return; }
    const ph=inputEl.placeholder; inputEl.placeholder='Transcribing…';
    try{
      const asr=await loadWhisper();
      // Auto-detect lets Whisper identify the spoken language itself.
      const out=await asr(resample(chunks,rate),
        sel==='auto'?{task:'transcribe'}:{language:WHISPER_LANG[sel],task:'transcribe'});
      const text=(out&&out.text||'').trim();
      if(!text) toast('Could not make out the words — try again or type the question');
      else{ inputEl.value=text; setTimeout(send,250); }
    }catch(e){ console.warn(e); toast('Could not load the speech model — check the network, or type the question'); }
    inputEl.placeholder=ph;
  };

  node.onaudioprocess=e=>{
    const d=e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d));
    let s=0; for(let i=0;i<d.length;i++) s+=d[i]*d[i];
    if(Math.sqrt(s/d.length)>0.02){ heard=true; lastVoice=Date.now(); }
    const now=Date.now();
    if((heard&&now-lastVoice>1500)||(!heard&&now-t0>6000)||now-t0>30000) finish();
  };
  src.connect(node); node.connect(ctx.destination);
  recog={stop:finish}; setRec(true); mark('voice');
}

function resample(chunks,rate){
  const len=chunks.reduce((n,c)=>n+c.length,0), all=new Float32Array(len);
  let o=0; for(const c of chunks){ all.set(c,o); o+=c.length; }
  const ratio=rate/16000, n=Math.floor(len/ratio), out=new Float32Array(n);
  for(let i=0;i<n;i++) out[i]=all[Math.floor(i*ratio)];
  return out;
}

/* ---------- send ---------- */
const inputEl=document.getElementById('input');
inputEl.addEventListener('input',()=>{inputEl.style.height='auto';inputEl.style.height=Math.min(inputEl.scrollHeight,110)+'px';});
inputEl.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });
document.getElementById('send').onclick=send;
document.querySelectorAll('.scenario').forEach(b=>b.onclick=()=>{ inputEl.value=b.dataset.say; send(); });

function systemPrompt(){
  const kb=KB.articles.map(a=>`[${a.id}] ${a.title}\n${a.body}`).join('\n\n');
  const r=KB.rules;
  return `You are the official AI assistant of the Social Insurance Organization (SIO), Kingdom of Bahrain. This is a vendor demonstration for tender 3/2026/SIO.

KNOWLEDGE BASE (your only source of substantive fact):
${kb}

RULE SET (indicative, configured by SIO staff):
accrual ${r.accrual}% of average wage per insured year; maximum ${r.cap}% of average wage; minimum insured service ${r.minService} years; qualifying age ${r.retireAge}; wage averaged over last ${r.avgYears} years; employee contribution ${r.empShare}%; employer contribution ${r.erShare}%; currency ${r.currency}.

RULES
1. Answer only from the knowledge base and rule set. If the question is not covered, is a complaint, concerns a specific person's file, or needs identity verification, set escalate=true and say an agent will take it.
2. Reply in the same language the user wrote in. Supported: Arabic, English, Hindi, Urdu, Malayalam, Tamil, Bengali, Tagalog. For anything else, reply in English and list the supported languages.
3. Maximum 80 words. Plain sentences. No markdown, no bullet characters, no emoji.
4. Never state a benefit amount yourself. If the user gives a wage and years of service and wants an estimate, set tool to {"name":"estimate_pension","args":{"wage":<number>,"years":<number>}} and write a short sentence introducing the estimate. If either value is missing, ask for it instead.
5. Any eligibility or amount answer ends with a short sentence that figures are indicative and confirmed by SIO on verification.
6. Never request or repeat CPR numbers, passwords or bank details. If the user sends them, tell them not to share such data in chat.
7. suggestions: two to three short follow-up questions, written in the user's language.

Return STRICT JSON only, no code fences:
{"reply":string,"lang":"en|ar|hi|ur|ml|ta|bn|tl","intent":"${Object.keys(INTENTS).join('|')}","confidence":0-1,"escalate":boolean,"handoff_reason":string,"tool":null|{"name":"estimate_pension","args":{"wage":number,"years":number}},"suggestions":[string]}`;
}

async function send(){
  const text=inputEl.value.trim(); if(!text||busy) return;
  const forced=document.getElementById('lang').value;
  inputEl.value=''; inputEl.style.height='auto';
  addMsg('me',text,{lang:forced==='auto'?guessLang(text):forced});
  setSugs([]); busy=true; document.getElementById('send').disabled=true;
  const t0=Date.now();

  const host=addMsg('bot','',{});
  host.querySelector('.bub').innerHTML='<span class="typing"><i></i><i></i><i></i></span>';

  history.push({role:'user',content: forced==='auto'?text:`[Reply in ${LANGS[forced]}] ${text}`});
  if(history.length>12) history=history.slice(-12);

  let d=null,errText=null;
  try{
    const res=await fetch('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({system:systemPrompt(),messages:history})
    });
    const j=await res.json();
    if(j.error){ errText=j.error; }
    else{
      const raw=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
      d=parseJSON(raw);
      if(!d) errText='The assistant returned an unreadable response. Send the question again.';
    }
  }catch(e){ errText='Could not reach the local server. Start it with npm start, then send again.'; }

  const ms=Date.now()-t0;
  if(!d){
    host.querySelector('.bub').outerHTML=`<div class="err">${errText}</div>`;
    busy=false; document.getElementById('send').disabled=false; return;
  }

  const lang=d.lang&&LANGS[d.lang]?d.lang:'en';
  lastLang=lang;
  const bub=host.querySelector('.bub');
  bub.dir=RTL.includes(lang)?'rtl':'ltr'; bub.textContent=d.reply||'';
  history.push({role:'assistant',content:JSON.stringify({reply:d.reply,intent:d.intent})});

  mark('conv');
  if(lang!=='en') mark('lang');

  // rule-engine estimate
  let est=null;
  if(d.tool&&d.tool.name==='estimate_pension'&&d.tool.args&&d.tool.args.wage&&d.tool.args.years){
    est=estimate(+d.tool.args.wage,+d.tool.args.years);
    host.insertAdjacentHTML('beforeend',estCard(est,lang));
    history.push({role:'user',content:`[system note] Rule engine produced: ${JSON.stringify(est)}. Refer to these figures if asked.`});
    mark('calc');
  }
  // escalation
  let ticket=null;
  if(d.escalate||(typeof d.confidence==='number'&&d.confidence<0.5)){
    ticket='SIO-'+(5000+Math.floor(Math.random()*4000));
    host.insertAdjacentHTML('beforeend',
      `<div class="card-esc"><b>Handed to a service agent</b>
       Reference <span class="tid">${ticket}</span> — ${escapeHtml(d.handoff_reason||'Requires a human agent')}.
       A queued agent picks this up with the full transcript attached.</div>`);
    mark('esc');
  }
  metaLine(host,[LANGS[lang],INTENTS[d.intent]||'Other',
    'confidence '+Math.round((d.confidence??0.8)*100)+'%', ms+' ms'], d.reply, lang);

  if(STATE.speak&&d.reply) speak(d.reply,lang);
  setSugs(d.suggestions);

  LOGS.push({id:'l'+Date.now(),ts:Date.now(),q:text,lang,intent:d.intent||'other',
    conf:d.confidence??0.8,channel:STATE.channel,outcome:ticket?'escalated':'resolved',ticket,ms,
    reply:d.reply});
  saveLogs(); renderLogs(); renderDash();
  busy=false; document.getElementById('send').disabled=false;
  document.getElementById('stream').scrollTop=1e6;
}

function parseJSON(raw){
  if(!raw) return null;
  let t=raw.replace(/```json|```/g,'').trim();
  const a=t.indexOf('{'), b=t.lastIndexOf('}');
  if(a<0||b<0) return null;
  try{ return JSON.parse(t.slice(a,b+1)); }catch(e){ return null; }
}
function guessLang(t){
  if(/[\u0600-\u06FF]/.test(t)) return /[\u06A9\u06AF\u06BE\u06CC]/.test(t)?'ur':'ar';
  if(/[\u0900-\u097F]/.test(t)) return 'hi';
  if(/[\u0D00-\u0D7F]/.test(t)) return 'ml';
  if(/[\u0B80-\u0BFF]/.test(t)) return 'ta';
  if(/[\u0980-\u09FF]/.test(t)) return 'bn';
  return 'en';
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

/* ---------- rule engine ---------- */
function estimate(wage,years){
  const r=KB.rules;
  const rate=Math.min(years*r.accrual,r.cap);
  const pension=Math.round(wage*rate)/100;
  return {wage,years,accrual:r.accrual,rate,cap:r.cap,pension,
    eligible:years>=r.minService, minService:r.minService, cur:r.currency,
    capped:years*r.accrual>r.cap};
}
function estCard(e,lang){
  return `<div class="card-est"><header>Indicative estimate · calculated by the rule engine</header>
  <table>
   <tr><td>Average insured wage</td><td>${e.wage.toFixed(3)} ${e.cur}</td></tr>
   <tr><td>Insured service</td><td>${e.years} years</td></tr>
   <tr><td>Accrual applied</td><td>${e.accrual}% × ${e.years}${e.capped?' (capped)':''}</td></tr>
   <tr><td>Replacement rate</td><td>${e.rate}%</td></tr>
   <tr class="total"><td>Indicative monthly pension</td><td>${e.pension.toFixed(3)} ${e.cur}</td></tr>
  </table>
  <div class="disc">${e.eligible?'Service meets the minimum of '+e.minService+' years in the current rule set.':'Below the minimum of '+e.minService+' insured years — entitlement would differ.'} Indicative only, produced from configurable rule values; the binding amount is issued by SIO after verification of records.</div></div>`;
}

/* ---------- knowledge base ---------- */
function renderKB(filter){
  const q=(filter||'').toLowerCase();
  const list=KB.articles.filter(a=>!q||(a.title+a.body).toLowerCase().includes(q));
  document.getElementById('kbCount').textContent=KB.articles.length;
  document.getElementById('kbList').innerHTML = list.length? list.map(a=>`
    <div class="kb-item" data-id="${a.id}">
      <h4>${escapeHtml(a.title)}</h4>
      <p>${escapeHtml(a.body)}</p>
      <div class="row"><span class="tag">${a.id}</span>
        <button class="btn sm" data-act="edit">Edit</button>
        <button class="btn sm" data-act="del">Delete</button></div>
    </div>`).join('')
    : `<div class="panel"><p style="margin:0;color:var(--muted)">No articles match that search. Clear the box or add an article.</p></div>`;
}
document.getElementById('kbSearch').addEventListener('input',e=>renderKB(e.target.value));
document.getElementById('kbList').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-act]'); if(!btn) return;
  const id=e.target.closest('.kb-item').dataset.id;
  const art=KB.articles.find(a=>a.id===id);
  if(btn.dataset.act==='del'){
    KB.articles=KB.articles.filter(a=>a.id!==id); saveKB(); renderKB(); mark('kb'); toast('Article deleted');
  }else{ editArticle(art); }
});
document.getElementById('kbNew').onclick=()=>editArticle(null);

function editArticle(art){
  const item=document.createElement('div'); item.className='kb-item';
  item.innerHTML=`
    <input type="text" class="k-title" placeholder="Article title" style="width:100%;margin-bottom:7px" value="${art?escapeHtml(art.title):''}">
    <textarea class="k k-body" rows="5" placeholder="Answer text the assistant will use" style="width:100%">${art?escapeHtml(art.body):''}</textarea>
    <div class="row"><button class="btn primary sm k-save">Save article</button><button class="btn sm k-cancel">Cancel</button></div>`;
  const list=document.getElementById('kbList');
  if(art){ const old=list.querySelector(`[data-id="${art.id}"]`); old.replaceWith(item); }
  else list.prepend(item);
  item.querySelector('.k-title').focus();
  item.querySelector('.k-cancel').onclick=()=>renderKB(document.getElementById('kbSearch').value);
  item.querySelector('.k-save').onclick=()=>{
    const t=item.querySelector('.k-title').value.trim(), b=item.querySelector('.k-body').value.trim();
    if(!t||!b){ toast('Add a title and an answer before saving'); return; }
    if(art){ art.title=t; art.body=b; }
    else KB.articles.unshift({id:'kb-'+String(KB.articles.length+11).padStart(2,'0'),title:t,body:b});
    saveKB(); renderKB(document.getElementById('kbSearch').value); mark('kb');
    toast('Saved — the assistant uses it from the next question');
  };
}

function renderRules(){
  const defs=[['accrual','Accrual per insured year (%)'],['cap','Maximum replacement rate (%)'],
    ['minService','Minimum insured service (years)'],['retireAge','Qualifying age'],
    ['avgYears','Wage averaging period (years)'],['empShare','Employee contribution (%)'],
    ['erShare','Employer contribution (%)']];
  document.getElementById('rules').innerHTML=defs.map(([k,l])=>
    `<div class="rule"><label for="r-${k}">${l}</label><input id="r-${k}" type="number" step="0.5" value="${KB.rules[k]}"></div>`).join('');
}
document.getElementById('saveRules').onclick=()=>{
  ['accrual','cap','minService','retireAge','avgYears','empShare','erShare'].forEach(k=>{
    const v=parseFloat(document.getElementById('r-'+k).value); if(!isNaN(v)) KB.rules[k]=v; });
  saveKB(); mark('kb'); toast('Rule set saved');
};

/* ---------- logs ---------- */
function filteredLogs(){
  const l=document.getElementById('fLang').value, o=document.getElementById('fOut').value,
        t=document.getElementById('fText').value.toLowerCase();
  return LOGS.slice().reverse().filter(r=>(!l||r.lang===l)&&(!o||r.outcome===o)&&(!t||(r.q||'').toLowerCase().includes(t)));
}
function renderLogs(){
  const sel=document.getElementById('fLang');
  if(sel.options.length<=1) Object.entries(LANGS).forEach(([k,v])=>sel.add(new Option(v,k)));
  const rows=filteredLogs();
  document.getElementById('logRows').innerHTML=rows.slice(0,200).map(r=>`
    <tr><td style="white-space:nowrap;font-family:var(--mono);font-size:11px">${new Date(r.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
    <td style="max-width:320px">${escapeHtml((r.q||'').slice(0,110))}${r.sample?' <span class="tag">sample</span>':''}</td>
    <td>${LANGS[r.lang]||r.lang}</td><td>${INTENTS[r.intent]||r.intent}</td>
    <td style="font-family:var(--mono)">${Math.round(r.conf*100)}%</td>
    <td>${r.channel==='whatsapp'?'WhatsApp':'Web'}</td>
    <td>${r.outcome==='escalated'?`<span class="tag red">${r.ticket||'escalated'}</span>`:'<span class="tag sea">resolved</span>'}</td></tr>`).join('');
  document.getElementById('logCount').textContent=`${rows.length} interactions shown · ${LOGS.length} stored`;
}
['fLang','fOut','fText'].forEach(id=>document.getElementById(id).addEventListener('input',renderLogs));
document.getElementById('exportCsv').onclick=()=>{
  const rows=filteredLogs();
  const csv=['timestamp,language,intent,confidence,channel,outcome,ticket,question']
    .concat(rows.map(r=>[new Date(r.ts).toISOString(),r.lang,r.intent,r.conf.toFixed(2),r.channel,r.outcome,r.ticket||'',
      '"'+(r.q||'').replace(/"/g,'""')+'"'].join(','))).join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const a=document.createElement('a'); a.href=url; a.download='sio-conversation-log.csv'; a.click();
  URL.revokeObjectURL(url); mark('log'); toast('Log exported');
};

/* ---------- dashboard ---------- */
function renderDash(){
  const total=LOGS.length, esc=LOGS.filter(r=>r.outcome==='escalated').length;
  const defl=total?Math.round((1-esc/total)*100):0;
  const avg=total?Math.round(LOGS.reduce((s,r)=>s+(r.ms||900),0)/total):0;
  const langs=new Set(LOGS.map(r=>r.lang)).size;
  document.getElementById('stats').innerHTML=[
    ['Conversations',total,'stored in this demo'],
    ['Resolved without an agent',defl+'%',esc+' handed off'],
    ['Median reply time',avg+' ms',(langs)+' languages seen'],
    ['Knowledge articles',KB.articles.length,'editable by SIO staff']
  ].map(([l,v,d])=>`<div class="stat"><span class="eyebrow">${l}</span><b>${v}</b><div class="d">${d}</div></div>`).join('');

  bars('chLang',count('lang'),k=>LANGS[k]||k,false);
  bars('chIntent',count('intent'),k=>INTENTS[k]||k,true);

  // sparkline
  const days=[]; const now=new Date(); now.setHours(0,0,0,0);
  for(let i=13;i>=0;i--){ const d=new Date(now-i*864e5);
    days.push({d,n:LOGS.filter(r=>new Date(r.ts).toDateString()===d.toDateString()).length}); }
  const max=Math.max(1,...days.map(d=>d.n));
  document.getElementById('spark').innerHTML=
    `<div style="display:flex;gap:6px;align-items:flex-end;height:96px">`+
    days.map(d=>`<div style="flex:1;text-align:center">
      <div title="${d.n}" style="height:${Math.max(3,d.n/max*76)}px;background:${d.n?'var(--ink-3)':'var(--line-2)'};border-radius:4px 4px 0 0"></div>
      <div style="font-family:var(--mono);font-size:9px;color:var(--faint);margin-top:4px">${d.d.getDate()}</div></div>`).join('')+`</div>`;

  const tk=LOGS.filter(r=>r.outcome==='escalated').slice(-6).reverse();
  document.getElementById('tickets').innerHTML= tk.length? tk.map(r=>
    `<div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-top:1px solid var(--line-2)">
      <span class="tag red">${r.ticket||'—'}</span>
      <span style="flex:1;font-size:12.5px">${escapeHtml((r.q||'').slice(0,90))}</span>
      <span class="hint">${LANGS[r.lang]||r.lang}</span></div>`).join('')
    : '<p style="margin:0;color:var(--muted);font-size:12.5px">No handoffs yet. Ask the assistant something outside the knowledge base to create one.</p>';
}
function count(field){
  const m={}; LOGS.forEach(r=>{m[r[field]]=(m[r[field]]||0)+1;});
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,7);
}
function bars(el,data,label,red){
  const max=Math.max(1,...data.map(d=>d[1]));
  document.getElementById(el).innerHTML=data.map(([k,v])=>
    `<div class="bar"><span>${label(k)}</span><span class="t ${red?'r':''}"><i style="width:${v/max*100}%"></i></span><span class="n">${v}</span></div>`).join('')
    ||'<p class="hint" style="margin:0">No data yet.</p>';
}

/* ---------- misc ---------- */
function toast(msg){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2400);
}
document.getElementById('resetAll').onclick=async()=>{
  KB={articles:SEED_KB.map(a=>({...a})),rules:{...SEED_RULES}};
  LOGS=seedLogs(); STATE={cov:{},channel:'web',speak:true,seeded:true}; history=[];
  await Promise.all([saveKB(),saveLogs(),saveState()]);
  document.getElementById('stream').innerHTML='';
  renderReqs(); renderKB(); renderRules(); renderLogs(); renderDash(); setChannel('web',true); greet();
  toast('Demo reset to its starting state');
};
