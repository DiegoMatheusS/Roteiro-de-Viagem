import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationIdleFollow,NAVIGATION_IDLE_FOLLOW_MS,type IdleFollowClock} from '../src/services/navigationIdleFollow';

function harness(){
  let now=0;
  let next=0;
  const pending=new Map<number,{due:number;callback:()=>void}>();
  const clock:IdleFollowClock={
    set:(callback,delay)=>{const id=++next;pending.set(id,{due:now+delay,callback});return id;},
    clear:handle=>{pending.delete(handle as number);}
  };
  const advance=(delta:number)=>{
    const end=now+delta;
    for(;;){
      const item=[...pending].sort((a,b)=>a[1].due-b[1].due)[0];
      if(!item || item[1].due>end)break;
      now=item[1].due;pending.delete(item[0]);item[1].callback();
    }
    now=end;
  };
  let navigating=true,resumes=0,gps=true;
  const idle=createNavigationIdleFollow({clock,active:()=>navigating,resume:()=>{resumes++;return gps;}});
  return {idle,advance,pending,get resumes(){return resumes;},
    setNavigating:(x:boolean)=>{navigating=x;},
    setGps:(x:boolean)=>{gps=x;}};
}
test('resume only seven seconds after the last interaction, not during long drags',()=>{
  const s=harness();
  assert.equal(NAVIGATION_IDLE_FOLLOW_MS,7000);
  s.idle.hold();s.idle.activity();s.advance(12000);
  assert.equal(s.resumes,0,'a driver may hold the map longer than seven seconds');
  s.idle.release();s.advance(6999);assert.equal(s.resumes,0);
  s.idle.activity();s.advance(6999);assert.equal(s.resumes,0);
  s.advance(1);assert.equal(s.resumes,1);
  s.advance(15000);assert.equal(s.resumes,1,'only one automatic recenter');
  s.idle.dispose();
});
test('finger pressed again cancels auto-follow; GPS button reset cancels pending return',()=>{
  const s=harness();s.idle.activity();
  s.advance(4500);s.idle.hold();
  s.advance(10000);assert.equal(s.resumes,0);
  s.idle.release();s.advance(3000);s.idle.reset();
  s.advance(9000);assert.equal(s.resumes,0);
  s.idle.dispose();
});
test('no auto-follow outside navigation, after disposal, or without a valid GPS fix',()=>{
  const s=harness();s.setNavigating(false);s.idle.activity();
  s.advance(15000);assert.equal(s.resumes,0);
  s.setNavigating(true);s.setGps(false);s.idle.activity();
  s.advance(7000);assert.equal(s.resumes,1);
  s.setGps(true);s.advance(7000);assert.equal(s.resumes,2);
  s.idle.activity();s.idle.dispose();s.advance(7000);
  assert.equal(s.resumes,2);
  assert.equal(s.pending.size,0);
});
