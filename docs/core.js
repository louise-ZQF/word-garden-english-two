(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WordCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const normalize=w=>String(w||'').toLowerCase().trim().replace(/\s+/g,' ');
  function today(date=new Date()) {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
  function plusDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function eligible(state){return Object.values(state.words).filter(w=>!w.removed&&!state.excluded.includes(w.word));}
  function due(state,day=today()){return eligible(state).filter(w=>(w.lastDay!==day&&(w.starred||(w.reviews>0&&(!w.due||w.due<=day))))||(w.lastDay===day&&w.lapseDay===day&&w.status==='learning'));}
  function plan(state,day=today(),mode='today'){
    const active=eligible(state);let selection;
    if(mode==='star')selection=active.filter(w=>w.starred&&(w.lastDay!==day||(w.lapseDay===day&&w.status==='learning')));
    else if(mode==='all')selection=active;
    else selection=[...due(state,day),...active.filter(w=>!w.reviews&&!w.starred)];
    const buckets=new Map();for(const w of selection){const id=w.primaryGroup||'custom';if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(w.word);}
    const entries=shuffle([...buckets.entries()]);entries.sort((a,b)=>Number(b[1].some(k=>state.words[k].starred))-Number(a[1].some(k=>state.words[k].starred)));
    return entries.flatMap(([,items])=>shuffle(items));
  }
  function extendSession(state){
    const s=state.session;if(!s||s.mode!=='today'||s.group)return 0;
    const queued=new Set(s.queue),additions=plan(state,s.day).filter(word=>!queued.has(word));
    s.queue.push(...additions);return additions.length;
  }
  function grade(word,known,day=today()){
    const first=!word.reviews,sameSuccess=word.lastSuccessDay===day||(!word.lastSuccessDay&&word.lastDay===day&&word.status==='known');
    word.reviews=(word.reviews||0)+1;word.lastDay=day;if(first)word.firstDay=day;
    if(known){word.streak=sameSuccess?Math.max(1,word.streak||0):(word.streak||0)+1;word.lastSuccessDay=day;}
    else {word.streak=0;word.lapseDay=day;}
    word.status=known?'known':'learning';
    const intervals=[1,3,7,14,30];word.due=plusDays(day,word.starred||!known||word.lapseDay===day?1:intervals[Math.min(word.streak-1,4)]);return word;
  }
  function prepareSession(state){
    const s=state.session;if(!s)return;
    if(s.roundVersion!==2){
      s.practice={};
      for(const h of state.history.filter(h=>h.day===s.day&&!h.known)){
        s.practice[h.word]={correct:0};const w=state.words[h.word];
        if(w&&!w.removed&&!state.excluded.includes(w.word)){w.lapseDay=s.day;w.status='learning';w.due=plusDays(s.day,1);if(!s.queue.slice(s.index).includes(w.word))s.queue.push(w.word);}
      }
      if(s.awaiting){const word=s.queue[s.index];s.pending={word,known:false,recalled:false,legacyCommitted:true};if(word)s.practice[word]={correct:0};}
      s.roundVersion=2;
    }
    s.practice ||= {};s.attempts ||= {};
  }
  // Ratings remain provisional while the definition is visible.
  function chooseAnswer(session,word,known,revealed=false){
    const previous=session.pending;
    session.pending={word:word.word,known:!!known,recalled:previous?previous.recalled&&!previous.legacyCommitted:!revealed&&!session.peeked,legacyCommitted:!!previous?.legacyCommitted};
    session.revealed=true;session.awaiting=true;
    return session.pending;
  }
  function commitAnswer(state,word){
    const s=state.session,p=s?.pending;if(!p||p.word!==word.word)return null;
    prepareSession(state);
    const known=p.known&&p.recalled,wasLearning=word.status==='learning';
    if(!p.legacyCommitted){grade(word,known,s.day);state.history.push({day:s.day,word:word.word,known,mode:s.mode});s.finished=(s.finished||0)+1;s.attempts[word.word]=(s.attempts[word.word]||0)+1;}
    let practice=s.practice[word.word];
    if(!known&&!practice)practice=s.practice[word.word]={correct:0};
    if(known&&(word.lapseDay===s.day||wasLearning)&&!practice)practice=s.practice[word.word]={correct:0};
    let repeat=false;
    if(practice){practice.correct=known?practice.correct+1:0;repeat=practice.correct<2;word.status=repeat?'learning':'known';word.lapseDay=s.day;word.due=plusDays(s.day,1);}
    if(repeat&&!s.queue.slice(s.index+1).includes(word.word))s.queue.splice(Math.min(s.queue.length,s.index+4),0,word.word);
    s.index++;s.pending=null;s.revealed=false;s.awaiting=false;s.peeked=false;
    return {known,repeat,correct:practice?.correct||0};
  }
  function parseInput(text,dictionary={}){
    let chunks=String(text).replace(/\r/g,'').split(/[\n;；]+/);const out=new Map();
    for(let chunk of chunks){chunk=chunk.trim().replace(/^\s*(?:[-*•]|\d+[.)、])\s*/,'');if(!chunk)continue;
      for(const part of chunk.split(/[,，、]\s*(?=[a-zA-Z])/)){
        if(/[\u3400-\u9fff]/.test(part)){
          const m=part.match(/^\s*([a-zA-Z][a-zA-Z'’-]*(?:\s+[a-zA-Z][a-zA-Z'’-]*)*)\s*[:：\t\-–—,，|]*\s*([\s\S]*)$/);
          if(m){const word=normalize(m[1]);const meaning=m[2].trim();if(word.length<=90)out.set(word,{word,meaning:meaning||dictionary[word]||''});}
        }else{
          for(const token of part.match(/[a-zA-Z]+(?:['’-][a-zA-Z]+)*/g)||[]){let word=normalize(token);if(word.length<=60)out.set(word,{word,meaning:dictionary[word]||''});}
        }
      }
    }return [...out.values()];
  }
  function createState(catalog){return {version:1,words:Object.fromEntries(catalog.map(w=>[w.word,{...w,starred:false,removed:false,reviews:0,streak:0,status:'new',lastDay:null,due:null}])),excluded:[],history:[],settings:{mode:'keyboard',theme:'light'},session:null};}
  function validateBackup(obj){if(!obj||obj.version!==1||!obj.words||Array.isArray(obj.words)||!Array.isArray(obj.excluded)||!Array.isArray(obj.history)||!obj.settings)throw new Error('不是词间的有效备份文件');
    const words={};for(const [key,w] of Object.entries(obj.words)){if(!w||typeof w.word!=='string'||normalize(key)!==normalize(w.word)||typeof w.meaning!=='string')throw new Error('备份中有无效词条');let word=normalize(w.word);if(word==='__proto__'||word==='constructor'||!(/^[a-z][a-z'’ -]*$/i.test(word)))throw new Error('词条格式错误');words[word]={...w,word,groups:Array.isArray(w.groups)?w.groups.filter(x=>typeof x==='string'):[],reviews:Math.max(0,Number(w.reviews)||0),streak:Math.max(0,Number(w.streak)||0),starred:!!w.starred,removed:!!w.removed};}
    const settings={...obj.settings};delete settings.limit;
    return {...obj,words,excluded:[...new Set(obj.excluded.filter(x=>typeof x==='string').map(normalize))],settings,session:null};
  }
  return {normalize,today,plusDays,shuffle,eligible,due,plan,extendSession,grade,prepareSession,chooseAnswer,commitAnswer,parseInput,createState,validateBackup};
});
