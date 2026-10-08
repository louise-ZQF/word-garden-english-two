const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../docs/core.js');
const day='2026-10-08';
function fixture(queue=['recall']){
 const s=C.createState([{word:'recall',meaning:'回忆',primaryGroup:'custom'}]);
 s.session={day,queue:[...queue],index:0,finished:0,attempts:{},mode:'today',roundVersion:2,practice:{}};
 return s;
}
function answer(s,known,revealed=false){const w=s.words.recall;C.chooseAnswer(s.session,w,known,revealed);return C.commitAnswer(s,w);}
test('known reveals provisionally, correction commits an error and queues practice',()=>{
 const s=fixture(),w=s.words.recall;
 C.chooseAnswer(s.session,w,true);
 assert.equal(s.session.index,0);assert.equal(w.reviews,0);assert.equal(s.history.length,0);assert.equal(s.session.revealed,true);
 C.chooseAnswer(s.session,w,false,true);
 const result=C.commitAnswer(s,w);
 assert.equal(result.known,false);assert.equal(w.reviews,1);assert.equal(s.history.length,1);assert.deepEqual(s.session.queue,['recall','recall']);assert.equal(w.due,'2026-10-09');
});
test('errors repeat without a cap; two consecutive unseen correct recalls finish',()=>{
 const s=fixture();
 for(let i=0;i<6;i++){const r=answer(s,false);assert.equal(r.repeat,true);assert.equal(s.session.index,s.session.queue.length-1);}
 assert.equal(answer(s,true).correct,1);assert.equal(s.words.recall.status,'learning');
 assert.equal(answer(s,false).correct,0);
 assert.equal(answer(s,true).repeat,true);
 const result=answer(s,true);assert.equal(result.repeat,false);assert.equal(result.correct,2);assert.equal(s.session.index,s.session.queue.length);assert.equal(s.words.recall.status,'known');assert.equal(s.words.recall.due,'2026-10-09');assert.equal(s.words.recall.streak,1);
});
test('practice returns after other words when possible, without duplicate queued returns',()=>{
 const s=fixture(['recall','one','two','three','four']);answer(s,false);
 assert.deepEqual(s.session.queue,['recall','one','two','three','recall','four']);
 const t=fixture(['recall','one','recall']);answer(t,false);assert.equal(t.session.queue.filter(x=>x==='recall').length,2);
});
test('revealing or hiding a peeked definition does not award recall success',()=>{
 const s=fixture();s.session.peeked=true;
 assert.equal(answer(s,true,false).known,false);assert.equal(s.words.recall.status,'learning');
 const t=fixture();assert.equal(answer(t,true,true).known,false);
});
test('pending choice, correction, and practice survive serialization',()=>{
 let s=fixture();answer(s,false);answer(s,true);
 C.chooseAnswer(s.session,s.words.recall,true);
 s=JSON.parse(JSON.stringify(s));C.prepareSession(s);
 assert.equal(s.session.practice.recall.correct,1);assert.equal(s.session.pending.known,true);
 C.chooseAnswer(s.session,s.words.recall,false,true);assert.equal(C.commitAnswer(s,s.words.recall).correct,0);
});
test('ordinary spacing advances across days, same-day drills do not stretch it',()=>{
 const w={reviews:0,streak:0};C.grade(w,true,day);assert.equal(w.due,'2026-10-09');
 C.grade(w,true,day);assert.equal(w.streak,1);assert.equal(w.due,'2026-10-09');
 C.grade(w,true,'2026-10-09');assert.equal(w.due,'2026-10-12');
 C.grade(w,true,'2026-10-12');assert.equal(w.due,'2026-10-19');
});
test('unfinished mistakes remain available after replanning; mastered errors return tomorrow',()=>{
 const s=fixture();s.words.recall.starred=true;answer(s,false);answer(s,true);
 assert.deepEqual(C.plan(s,day),['recall']);assert.deepEqual(C.plan(s,day,'star'),['recall']);
 answer(s,true);assert.deepEqual(C.plan(s,day),[]);assert.deepEqual(C.plan(s,'2026-10-09'),['recall']);
 s.words.recall.removed=true;assert.deepEqual(C.plan(s,'2026-10-09'),[]);
});
test('legacy revealed error is not counted twice and keeps recurring',()=>{
 const s=fixture();delete s.session.roundVersion;delete s.session.practice;
 s.session.awaiting=true;s.session.revealed=true;s.session.attempts={recall:1};s.session.finished=1;
 C.grade(s.words.recall,false,day);s.history.push({day,word:'recall',known:false});
 C.prepareSession(s);assert.equal(s.session.pending.legacyCommitted,true);
 assert.equal(C.commitAnswer(s,s.words.recall).repeat,true);assert.equal(s.history.length,1);assert.equal(s.words.recall.reviews,1);
 assert.equal(answer(s,true).repeat,true);assert.equal(answer(s,true).repeat,false);
});
test('old completed sessions regain mistakes needing further consolidation',()=>{
 const s=fixture();delete s.session.roundVersion;s.session.index=1;
 C.grade(s.words.recall,false,day);s.history.push({day,word:'recall',known:false});
 C.prepareSession(s);assert.equal(s.session.queue[s.session.index],'recall');assert.equal(s.words.recall.lapseDay,day);
});
test('unfinished mistakes carried into another day still need two correct recalls',()=>{
 const s=fixture();answer(s,false);s.session={day:'2026-10-09',queue:['recall'],index:0,finished:0,attempts:{},mode:'today',roundVersion:2,practice:{}};
 assert.equal(answer(s,true).repeat,true);assert.equal(s.words.recall.status,'learning');assert.deepEqual(C.plan(s,'2026-10-09'),['recall']);
 assert.equal(answer(s,true).repeat,false);assert.equal(s.words.recall.due,'2026-10-10');
});
