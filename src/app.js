const {useState,useMemo,useRef,useCallback}=React;
import {CHAPTERS,STEPS,deriveFurnaceEff,getOpts,PRICING,TONNAGE_OPTIONS,calcEstimate,nearestTonnageOption,trackBuildCompleted,trackEvent,trackLead,GATE_CONFIG,FINANCING_OPTIONS} from './data.js';
import {Canvas,CountUp} from './canvas.js';

// ─── APP ────────────────────────────────────────────────────────
// ─── AUTOSAVE ───────────────────────────────────────────────────
const SAVE_KEY='gesBuild_v1';
const SAVE_MAX_AGE_MS=14*24*60*60*1000; // ignore builds older than 14 days
function loadSavedBuild(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return null;
    const s=JSON.parse(raw);
    if(!s||!s.answers||!s.answers.location)return null;
    if(!s.ts||Date.now()-s.ts>SAVE_MAX_AGE_MS)return null;
    return s;
  }catch(e){return null;}
}
function saveBuild(state){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({...state,ts:Date.now()}));}catch(e){}
}
function clearSavedBuild(){
  try{localStorage.removeItem(SAVE_KEY);}catch(e){}
}

// ─── CONTACT-FORM GATE (lead capture right at "Get Pricing") ───
// Once a homeowner submits the Gravity Forms form, remember it locally
// so they're not asked again on this device if they come back to adjust
// their build - matches the same "don't nag twice" spirit as autosave.
const LEAD_KEY='gesLead_v1';
function hasSubmittedLead(){
  try{return !!JSON.parse(localStorage.getItem(LEAD_KEY)||'null')?.submitted;}catch(e){return false;}
}
function markLeadSubmitted(){
  try{localStorage.setItem(LEAD_KEY,JSON.stringify({submitted:true,ts:Date.now()}));}catch(e){}
}
// A tap on a touchscreen fires a synthetic mouseenter -> click -> mouseleave
// sequence right after touchend (standard mobile Safari/Chrome behavior, not
// a Playwright-only quirk). The info button relies on real mouseenter/
// mouseleave to show/hide its panel on hover - on touch, that trailing
// synthetic mouseleave fired after every single tap and force-closed the
// panel again immediately, no matter what the tap itself had just set, so
// the panel was completely unreachable by tap. Gating the hover handlers on
// an actual hover-capable pointer (a real mouse/trackpad) turns them into
// no-ops on touch, so they can't undo what a tap just did - the info-btn's
// own onTouchEnd (with preventDefault, so the touch's own synthetic click
// never fires either) is what drives the open/close toggle there instead.
// Desktop keeps the exact no-click hover behavior it had before; keyboard
// focus/blur is untouched either way.
function hoverCapable(){
  try{return window.matchMedia('(hover: hover)').matches;}catch(e){return true;}
}

function App(){
  const [savedBuild]=useState(loadSavedBuild);
  const [resumePending,setResumePending]=useState(!!savedBuild);
  // The enhanced filtration cabinet ships standard on every install, so it
  // starts pre-selected (still toggle-able, just not opt-in by default).
  const defaultAnswers=()=>({purif:['aprilaire']});
  const [answers,setAnswers]=useState(defaultAnswers);
  const [stepIdx,setStepIdx]=useState(0);
  const [done,setDone]=useState(false);
  // Done-screen exit transition: its own entrance already gets a deliberate
  // "power on" flourish (canvasPowerOn/done-wrap's snap, below) - but an
  // EDIT chip flips `done` back to false to jump into the wizard, which
  // used to unmount the whole done-screen instantly (nothing for a CSS
  // transition to animate). doneVisible keeps it mounted for one extra
  // fade-out beat after `done` goes false (see the done-leaving class in
  // styles.css) so it settles away while the wizard layout fades in under
  // it, instead of a hard cut. It never delays the way IN - doneVisible
  // flips true in the same tick `done` does, so the entrance flourish
  // still fires exactly when it always has.
  const [doneVisible,setDoneVisible]=useState(false);
  React.useEffect(()=>{
    if(done){setDoneVisible(true);return;}
    if(!doneVisible)return;
    const t=setTimeout(()=>setDoneVisible(false),220);
    return ()=>clearTimeout(t);
  },[done]);
  // Quick-edit: jumping in from the finished build to change one answer
  // shouldn't mean re-clicking Next through every step after it too - once
  // set, goNext auto-skips any step that already has a valid answer and
  // snaps straight back to done, only pausing on a step the edit actually
  // invalidated (e.g. a thermostat pick that no longer fits the new tier).
  const [quickEdit,setQuickEdit]=useState(false);
  // Post-build pricing: null=not asked, 'sizing'=sub-questions,
  // 'leadgate'=waiting on the contact form, 'result'=estimate shown
  const [pricingFlow,setPricingFlow]=useState(null);
  const [pricingSubStep,setPricingSubStep]=useState(0);
  const [pricingAnswers,setPricingAnswers]=useState({});
  const topRef=useRef(null);
  const scrollTop=useCallback(()=>setTimeout(()=>topRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),50),[]);

  // Contact-form gate: sits right at "Get Pricing" (before the sizing
  // questions even start), not at the price reveal itself - see where
  // leadUnlocked is checked in the Get Pricing button's onClick below.
  // Skipped entirely (leadUnlocked stays true) when
  // GATE_CONFIG.gravityFormId is unset - see the comment on GATE_CONFIG
  // in data.js. Two independent detection paths listen for the Gravity
  // Forms submission, since this widget is an iframe embed and the form
  // itself lives on the PARENT WordPress page, not inside this document:
  //  1) Same-origin direct access - if the iframe and the WordPress page
  //     are on the same domain, the browser allows reaching into
  //     window.parent directly, so this binds Gravity Forms' own
  //     gform_confirmation_loaded jQuery event straight off the parent
  //     document.
  //  2) postMessage - works regardless of same/cross-origin, but needs a
  //     small snippet added to the WordPress page (NOT part of this
  //     repo) that relays that same gform_confirmation_loaded event into
  //     this iframe, e.g.:
  //       jQuery(document).on('gform_confirmation_loaded', function(e, formId){
  //         document.querySelectorAll('iframe').forEach(f=>{
  //           try{f.contentWindow.postMessage({gesLeadFormId:formId},'*');}catch(err){}
  //         });
  //       });
  //     Add that inside a Script tag/Custom HTML block on the same page
  //     as the Gravity Forms form and this widget's iframe.
  const [leadUnlocked,setLeadUnlocked]=useState(()=>!GATE_CONFIG.gravityFormId||hasSubmittedLead());
  React.useEffect(()=>{
    if(!GATE_CONFIG.gravityFormId||leadUnlocked)return;
    const unlock=()=>{markLeadSubmitted();setLeadUnlocked(true);trackLead({form_id:GATE_CONFIG.gravityFormId});};
    let parentJQ=null;
    try{
      if(window.parent&&window.parent!==window&&window.parent.jQuery) parentJQ=window.parent.jQuery;
    }catch(e){/* cross-origin - window.parent access throws, rely on postMessage below */}
    if(parentJQ){
      parentJQ(window.parent.document).on('gform_confirmation_loaded.gesGate',(e,formId)=>{
        if(String(formId)===String(GATE_CONFIG.gravityFormId))unlock();
      });
    }
    const onMessage=e=>{
      if(e.data&&e.data.gesLeadFormId!==undefined&&String(e.data.gesLeadFormId)===String(GATE_CONFIG.gravityFormId))unlock();
    };
    window.addEventListener('message',onMessage);
    return ()=>{
      window.removeEventListener('message',onMessage);
      try{parentJQ&&parentJQ(window.parent.document).off('.gesGate');}catch(e){}
    };
  },[leadUnlocked]);
  // Moves straight into the sizing questions the instant the gate
  // unlocks, whether that's the effect above detecting a real submission
  // mid-wait or the gate never having been shown at all this session
  // (returning with it already unlocked from a previous visit).
  React.useEffect(()=>{
    if(leadUnlocked&&pricingFlow==='leadgate'){
      setPricingFlow('sizing');
      setPricingSubStep(0);
    }
  },[leadUnlocked,pricingFlow]);

  const activeSteps=useMemo(()=>STEPS.filter(s=>!s.showIf||s.showIf(answers)),[answers]);
  const totalSteps=activeSteps.length-1;
  // insulation/system_for's showIf depends on indoor_type, so the total is
  // only a guess until that's answered - rather than show a number that's
  // about to change (7 -> 9 the instant Furnace is picked), just don't
  // claim one yet. It reappears, accurate, from the very next step on.
  const totalKnown=!!answers.indoor_type;
  const cur=activeSteps[stepIdx];
  const pct=Math.round(((stepIdx+1)/activeSteps.length)*100);

  // Chapter progress - how many active (non-location) steps live in each
  // chapter, and how far into the current chapter this step sits. Drives
  // the segmented top bar so progress reads as "acts," not a bare number.
  const chapterCounts=useMemo(()=>{
    const counts=CHAPTERS.map(()=>0);
    activeSteps.forEach(s=>{if(s.id!=='location')counts[s.chapter]++;});
    return counts;
  },[activeSteps]);
  const curChapter=cur?cur.chapter:0;
  const curChapterStepNum=useMemo(()=>{
    if(!cur)return 0;
    let n=0;
    for(let i=1;i<=stepIdx;i++){if(activeSteps[i]&&activeSteps[i].chapter===curChapter)n++;}
    return n;
  },[activeSteps,stepIdx,cur,curChapter]);

  // Jump back to edit a step directly from the finished diagram - the same
  // thing the review grid's EDIT buttons do, callable from the canvas too
  // so the built system reads as something you can still reach into, not
  // an inert picture that only ever changes through the grid below it.
  const jumpToStep=useCallback(id=>{
    const i=activeSteps.findIndex(s=>s.id===id);
    if(i>=0){trackEvent('quick_edit_used',{step_id:id});setDone(false);setStepIdx(i);setQuickEdit(true);}
  },[activeSteps]);
  // Splash-card pick - the real start of the funnel. Landing on the splash
  // screen doesn't itself mean engagement (a bounced visitor never fires
  // this), but committing to a location does.
  const pickLocation=loc=>{trackEvent('wizard_started',{location:loc});setA("location",loc);setStepIdx(1);};
  const sel=id=>answers[id];
  const msel=id=>Array.isArray(answers[id])?answers[id]:[];
  const setA=(k,v)=>setAnswers(p=>{
    const next={...p,[k]:v};
    // Auto-set furnace_eff when insulation is chosen
    if(k==='insulation') next.furnace_eff=deriveFurnaceEff(v);
    // Changing efficiency tier can invalidate an already-picked thermostat/system_for -
    // clear those so the (now differently-filtered) step forces a fresh explicit pick.
    if(k==='cond_tier'){
      const thermostatStillValid=v==='high_ge18'?p.thermostat==='proprietary':p.thermostat!=='proprietary';
      if(!thermostatStillValid) delete next.thermostat;
      // Mid efficiency forces dual fuel for furnace systems - it's the only
      // option, so set it directly instead of showing a single-card step.
      // Air handlers have no furnace to pair with, so the concept doesn't
      // apply there at all. Any other tier needs its own explicit pick -
      // clear a leftover value (forced or not) so the step shows fresh
      // instead of quietly keeping whatever the old tier left behind.
      if(v==='mid_ge15'&&p.indoor_type==='furnace') next.system_for='hp';
      else delete next.system_for;
    }
    // Same forced-dual-fuel rule as above, from the other direction: editing
    // indoor_type from air handler to furnace while cond_tier is already
    // mid_ge15 hits the same "only one option" case, but the system_for
    // step stays hidden either way (its showIf excludes mid_ge15
    // entirely) - so without this, system_for is left undefined and
    // calcEstimate has no mid_ge15.straight_cool pricing to fall back on,
    // silently breaking the estimate. Air handlers have no furnace to
    // pair with, so clear a leftover value there instead of leaving a
    // stale "Heat source" row in the review grid.
    if(k==='indoor_type'){
      if(v==='furnace'&&p.cond_tier==='mid_ge15') next.system_for='hp';
      else if(v==='ah'){
        delete next.system_for;
        // Air handlers have no furnace/attic-insulation step at all (its
        // showIf excludes them) - clear a leftover furnace_eff/insulation
        // pick too, so the review grid doesn't keep showing a stale
        // "Insulation" row for a system that no longer has a furnace.
        delete next.insulation;
        delete next.furnace_eff;
      }
    }
    return next;
  });
  const toggle=(k,v)=>setAnswers(p=>{const c=Array.isArray(p[k])?p[k]:[];return{...p,[k]:c.includes(v)?c.filter(x=>x!==v):[...c,v]};});

  const canNext=useMemo(()=>{
    if(!cur)return false;
    if(cur.optional||cur.multi)return true;
    return!!answers[cur.id];
  },[cur,answers]);

  // A step already counts as settled if it's optional/multi (skipping is a
  // valid answer) or already holds a real value - used only by quick-edit's
  // skip-ahead below, so an edit that invalidates a later step (say, a
  // thermostat pick that no longer fits the new tier - setA already clears
  // those) still stops there instead of silently skipping past it.
  const stepSatisfied=step=>step.optional||step.multi||(answers[step.id]!==undefined&&answers[step.id]!==null&&answers[step.id]!=='');
  // Whether clicking Next right now would snap straight back to the build
  // (every remaining step already has a valid answer) - drives the button
  // label so quick-editing one thing doesn't look like it kicked off the
  // whole wizard again.
  const quickEditWillFinish=useMemo(()=>{
    if(!quickEdit)return false;
    for(let i=stepIdx+1;i<activeSteps.length;i++){if(!stepSatisfied(activeSteps[i]))return false;}
    return true;
  },[quickEdit,stepIdx,activeSteps,answers]);
  const goNext=()=>{
    if(quickEdit){
      let i=stepIdx+1;
      while(i<activeSteps.length&&stepSatisfied(activeSteps[i]))i++;
      if(i>=activeSteps.length){setQuickEdit(false);setDone(true);scrollTop();trackBuildCompleted(answers);}
      else{setStepIdx(i);scrollTop();}
      return;
    }
    // Funnel visibility per step, first-time-through only (quick-edit's own
    // branch above skips this - re-editing an already-answered step isn't
    // new progress through the wizard, and would double-count the same
    // step_id every time someone tweaks an earlier answer).
    if(cur)trackEvent('step_completed',{step_id:cur.id,step_number:stepIdx+1,total_steps:activeSteps.length});
    if(stepIdx<activeSteps.length-1){setStepIdx(s=>s+1);scrollTop();}else{setDone(true);scrollTop();trackBuildCompleted(answers);}
  };
  const goBack=()=>{
    if(stepIdx>0){setStepIdx(s=>s-1);scrollTop();}
  };
  // Skipping a multi-select step means "none of the optional extras" - but
  // for purif specifically, the enhanced filtration cabinet ships standard
  // on every install regardless (see defaultAnswers/hasAprilaire), so
  // skipping it must not wipe that default out along with the real
  // optional picks (UV/ionizer/surge). Every other multi step (extras) has
  // no such standard-included default, so [] is still correct there.
  const skip=()=>{if(cur.multi)setA(cur.id,cur.id==='purif'?['aprilaire']:[]);goNext();};
  const restart=()=>{
    trackEvent('restart_clicked');
    clearSavedBuild();setAnswers(defaultAnswers());setStepIdx(0);setDone(false);setQuickEdit(false);
    setPricingFlow(null);setPricingSubStep(0);setPricingAnswers({});
  };
  const resumeBuild=()=>{
    setAnswers(savedBuild.answers||{});
    setStepIdx(savedBuild.stepIdx||0);
    setDone(!!savedBuild.done);
    setPricingFlow(savedBuild.pricingFlow||null);
    setPricingSubStep(savedBuild.pricingSubStep||0);
    setPricingAnswers(savedBuild.pricingAnswers||{});
    setResumePending(false);
  };
  const discardSavedBuild=()=>{clearSavedBuild();setResumePending(false);};

  React.useEffect(()=>{
    if(resumePending||!answers.location)return;
    saveBuild({answers,stepIdx,done,pricingFlow,pricingSubStep,pricingAnswers});
  },[answers,stepIdx,done,resumePending,pricingFlow,pricingSubStep,pricingAnswers]);

  const opts=useMemo(()=>cur?getOpts(cur.id,answers):[], [cur,answers]);

  const [showInfo,setShowInfo]=React.useState(false);
  // Auto-open the info panel the first time someone lands on step 1, so
  // the info button gets discovered instead of ignored - only once per
  // page load, so navigating back to step 1 later doesn't force it open
  // again over a user who's already closed it.
  const autoInfoShown=React.useRef(false);
  // This auto-open is the one time the panel opens WITHOUT the user asking
  // for it - every other open (hover/focus/tap on the info button) is a
  // direct response to something they just did, so an animated reveal
  // reads fine there. This one fires unprompted, right as the step's own
  // option cards first become clickable, and by default animates open over
  // .25s (.info-collapse's transition). In the closet layout, an open info
  // panel just pushes .opts down in normal flow with no reserved space
  // (unlike attic's pinned 52px, see the comment on .attic-info-collapse) -
  // measured, that .25s reveal drags the whole option list down as much as
  // ~90px underneath someone who has just been handed a mouse/finger and is
  // likely to tap the first thing they see. A fast tap aimed at where a
  // card visibly was lands in the gap between cards, or on nothing, for
  // most of that window instead of selecting anything - the same "clicked
  // right as something else moved" shape as the sticky-header/reaction-line
  // bug elsewhere in this file, just triggered by an unprompted auto-open
  // instead of the user's own click. Suppressing the transition for this
  // one auto-triggered open (a "no-anim" class on .info-collapse, cleared a
  // couple frames later) makes the panel appear already-open on the very
  // first frame the options are interactive, so there's never a stale
  // position to aim at. Every later toggle clears the flag first (it's
  // only ever set true here) and animates normally, since those are all
  // direct responses to something the user just did with their pointer,
  // not a surprise sprung on it.
  const autoInfoInstant=React.useRef(false);
  React.useEffect(()=>{
    if(stepIdx===1&&!autoInfoShown.current){
      autoInfoShown.current=true;
      autoInfoInstant.current=true;
      setShowInfo(true);
    }else{
      setShowInfo(false);
    }
  },[stepIdx]);
  React.useEffect(()=>{
    if(!autoInfoInstant.current)return;
    // Double rAF: the first frame is when the browser actually paints the
    // "open + no-anim" state (transition suppressed); only once that's
    // committed is it safe to drop the flag, so a real toggle a moment
    // later - which happens far later than two frames in practice - always
    // animates normally instead of racing this cleanup.
    let id2;
    const id1=requestAnimationFrame(()=>{id2=requestAnimationFrame(()=>{autoInfoInstant.current=false;});});
    return ()=>{cancelAnimationFrame(id1);if(id2)cancelAnimationFrame(id2);};
  },[showInfo]);
  // On the mobile attic layout, .attic-bar-body is its own scrollable
  // region below the fixed-height eyebrow row (.attic-bar-top, which
  // isn't part of that scroll area). A step with enough option text to
  // need scrolling there leaves it scrolled down; advancing to the next
  // step never reset that, so the new step rendered shifted up under the
  // eyebrow row and back button, overlapping both. scrollTop() above
  // only resets the outer page scroll, not this nested one.
  React.useEffect(()=>{
    document.querySelector('.attic-bar-body')?.scrollTo(0,0);
  },[stepIdx]);
  // Same nested-scroll problem as .attic-bar-body above, on the done
  // screen's own panel: .sidebar (attic mode's fixed 200px band) and
  // .done-wrap inside it (overflowY:auto in every layout) both scroll
  // independently of the outer page. Picking a lower option in a sizing
  // sub-step (e.g. a tonnage card below the fold on a short mobile panel)
  // leaves that scroll offset in place - advancing to the next sub-step,
  // or to the final result, never reset it, so shorter content that
  // follows renders scrolled down by that same leftover amount. Most
  // visibly this clipped the top of "AS LOW AS $X/mo", the estimate's own
  // headline number. Scoped to .done-screen so this can't ever grab
  // closet-layout's own (same-classed, but unrelated and possibly
  // still-mounted-but-hidden) .sidebar instead.
  React.useEffect(()=>{
    document.querySelector('.done-screen .sidebar')?.scrollTo(0,0);
    document.querySelector('.done-wrap')?.scrollTo(0,0);
  },[pricingFlow,pricingSubStep]);

  const INFO_TEXT={
    location:"Your indoor unit's location sets the whole system layout. Attic is the most common setup in Austin, with the unit sitting horizontally above the living space. Closet is upflow, standing vertically in a hallway or utility closet. Both work well; closet installs are a bit easier to service.",
    indoor_type:"Not sure which you have? A gas stove or gas water heater usually means a furnace too, burning gas for heat and pairing with AC for cooling. An all-electric home likely has an air handler instead, paired with a heat pump for both heating and cooling.",
    insulation:"Attic insulation determines which furnace fits. Fiberglass or blown-in means a vented attic, where a standard 80% AFUE furnace works fine with a metal B-vent flue. Spray foam means a sealed attic, which needs a 90% AFUE condensing furnace with a PVC flue through the roof.",
    plenum:"The supply plenum connects your indoor unit to your ductwork, so conditioned air can reach every room. If yours is damaged, leaking, or over 15 years old, replacing it improves both efficiency and airflow.",
    thermostat:"A basic programmable thermostat is reliable -- set your schedule and forget it. A Wi-Fi smart thermostat connects to your phone, learns your habits, and can cut 10-15% off your energy bill. Both work with any system we install.",
    purif:"The enhanced filtration cabinet ships standard on every install, already catching far more dust, pollen, and allergens than a typical 1 inch filter. A UV light keeps the coil clean. An ionizer clears particles, odors, and VOCs. A surge protector guards the condenser -- one lightning strike can destroy a compressor.",
    cond_tier:"The condenser is your outdoor unit. SEER2 measures cooling output per unit of electricity, so higher means lower bills. Federal Minimum meets current code at the lowest cost. Mid Efficiency is our best-value tier. High Efficiency is our top tier, with rebate eligibility and the best humidity control.",
    system_for:"With a gas furnace, you get two options. Dual fuel pairs a heat pump with the furnace -- the heat pump handles cooling and mild-weather heating, and the furnace only fires below about 35 degrees, the most efficient combo we offer. Straight cool means the AC only cools, and the furnace handles all heating.",
    dehu:"Austin humidity makes your home feel warmer than the thermostat reads. A dehumidifier ties into your ductwork and runs automatically, with no buckets and no upkeep from you.",
    extras:"A condensate pump handles drainage when there's no nearby gravity drain, which is common in closet installs. An ERV brings in fresh filtered outdoor air while venting stale air out, recovering most of the energy in the exchange.",
  };
  const infoText=cur&&INFO_TEXT[cur.id];

  // A short, specific acknowledgment of what was just picked - replaces
  // the generic instructional hint once there's an actual answer to react
  // to, so the tool reads as a co-pilot responding to you instead of a
  // form reciting the same paragraph regardless of what you clicked.
  const REACTION={
    // indoor_type has no entry here on purpose - its hint is forced to 3
    // lines (see STEPS above), already 2 lines taller than every other
    // step's. Adding a 4th reaction-line on top of that would overflow
    // .attic-info's fixed budget (confirmed empirically: -15px natural-
    // height overflow with a reaction line showing, 0 without) - and the
    // 3-line hint already spells out both choices, so the reaction line
    // wouldn't be telling the homeowner anything the hint didn't just say.
    insulation:{fiberglass:"Vented attic, 80% furnace fits.",spray:"Sealed attic, stepping up to 90%."},
    plenum:{ductboard:"Ductboard, a solid standard choice.",metal:"Steel plenum, outlasts the system.",none:"Keeping your plenum saves labor."},
    cond_tier:{fedmin:"Lowest upfront cost, locked in.",mid_ge15:"Our best overall value.",high_ge18:"Our quietest, most efficient tier."},
    thermostat:{basic:"Reliable, no app required.",wifi:"Control it from your phone.",proprietary:"Built for the best diagnostics."},
    system_for:{hp:"Efficient through Austin winters.",sc:"Furnace handles all the heating."},
    dehu:{yes:"Added, for noticeably drier air.",no:"Skipping it, easy to add later."},
  };
  const reactionText=cur&&REACTION[cur.id]&&REACTION[cur.id][answers[cur.id]];


  const loc = answers.location;
  const isAtticMode = loc === 'attic';
  const isClosetMode = loc === 'closet';

  // splash-screen/attic-layout/closet-layout/done-screen all stay mounted
  // the whole time - hidden via opacity+pointer-events (an "out"/
  // "done-leaving" class) rather than display:none, so whichever one IS
  // showing never has to wait out a remount. CSS pointer-events:none stops
  // the MOUSE from reaching a hidden one, but says nothing to the
  // KEYBOARD - its buttons stayed in Tab order the whole time, so the very
  // next Tab after, say, picking a splash card landed back on that now
  // -invisible, non-interactive screen (its other card, then the one just
  // picked) with no focus ring visible anywhere on screen, before Tab
  // finally escaped into the step that had actually replaced it - the same
  // "control you can't see is still live" shape as the sticky-header bug
  // elsewhere in this file, just for a keyboard user instead of a mouse
  // click. The native `inert` attribute is the direct fix (removes a
  // subtree from tab order and assistive tech in one property, exactly
  // mirroring what the CSS already does visually/for the mouse) - but the
  // React version pinned here (18.2, predating React's own `inert` prop
  // support added in 19) silently drops an `inert` JSX prop instead of
  // reflecting it, so it's set imperatively via a ref instead, one effect
  // per hidden-able panel, each mirroring that panel's own "out"/
  // "done-leaving" condition exactly.
  const splashRef=useRef(null),atticLayoutRef=useRef(null),closetLayoutRef=useRef(null),doneScreenRef=useRef(null);
  // Moves focus to the newly-active layout's first real control. Used
  // right below when a panel that currently holds focus is about to go
  // inert - waiting for the browser's own "focus dropped to <body>" fallout
  // and reacting to it (see the effect further down) works for a disabled
  // button, whose blur-to-<body> happens synchronously, but inert's own
  // version of that isn't synchronous with the effect that sets it (it
  // lands sometime before the next paint, racing - and beating - a rAF
  // callback that tries to react to it after the fact). Redirecting focus
  // ourselves, synchronously, in the same effect that flips inert on,
  // sidesteps that race outright instead of trying to win it.
  const focusActiveModeControl=()=>{
    const scope=isAtticMode?'.attic-layout':isClosetMode?'.closet-layout':null;
    if(!scope)return;
    // Deferred to a microtask: this can run before the effect (declared
    // later than this one, further down) that actually clears `inert` on
    // the layout we're focusing INTO - focusing into a still-inert subtree
    // is always a no-op, and effects for one commit don't wait on each
    // other's declaration order for anything except their own run order,
    // not for when the DOM side effects they perform become visible to
    // this kind of check. A microtask runs after every effect in this
    // commit has finished (still well before the next paint, so no visible
    // flash of the wrong thing being focused), so by the time this actually
    // calls .focus() the target layout's own inert has always already been
    // cleared, regardless of which effect happened to be declared first.
    queueMicrotask(()=>{
      const target=document.querySelector(`${scope} .info-btn, ${scope} .btn-back, ${scope} .attic-opt, ${scope} .opt`);
      target&&target.focus();
    });
  };
  const splashInert=!!(loc||done);
  React.useEffect(()=>{
    if(!splashRef.current)return;
    if(splashInert&&splashRef.current.contains(document.activeElement))focusActiveModeControl();
    splashRef.current.inert=splashInert;
  },[splashInert]);
  const atticInert=!!(!isAtticMode||done);
  React.useEffect(()=>{
    if(!atticLayoutRef.current)return;
    // Only redirects for the isClosetMode case (attic -> closet, e.g.
    // switching location mid quick-edit) - focusActiveModeControl finds
    // nothing for the `done` case (isAtticMode and isClosetMode both go
    // false together) and no-ops, which is fine: Finish is a deliberate,
    // conversation-ending action, and Tab from <body> still reaches the
    // done screen's real content correctly once it's mounted, just
    // without an explicit landing spot - a smaller gap than the one this
    // whole block exists to close.
    if(atticInert&&isClosetMode&&atticLayoutRef.current.contains(document.activeElement))focusActiveModeControl();
    atticLayoutRef.current.inert=atticInert;
  },[atticInert]);
  const closetInert=!!(!isClosetMode||done);
  React.useEffect(()=>{
    if(!closetLayoutRef.current)return;
    if(closetInert&&isAtticMode&&closetLayoutRef.current.contains(document.activeElement))focusActiveModeControl();
    closetLayoutRef.current.inert=closetInert;
  },[closetInert]);
  React.useEffect(()=>{if(doneScreenRef.current)doneScreenRef.current.inert=!done;},[done,doneVisible]);
  // Two different ways a step change drops keyboard focus to <body>, both
  // fixed the same way below:
  // 1) Picking a location (splash -> step 1) focuses one of the two splash
  //    cards onto an element that inert (above) immediately makes
  //    un-focusable, since it's what a keyboard user just activated - per
  //    spec, a focused element that becomes inert drops focus to <body>.
  // 2) Every ordinary Next/Back keeps focus on that same nav button (its
  //    DOM node persists across the step change, so focus doesn't move on
  //    its own) - but the new step is almost always unanswered, so Next
  //    immediately goes disabled again, and a browser always blurs a
  //    disabled control straight to <body> too. This one isn't specific to
  //    a single step; it happens on essentially every forward step of the
  //    whole wizard.
  // Either way <body> is a "safe" landing spot in the sense that Tab from
  // there reaches something real, but it's a silent one - nothing on
  // screen looks focused, so a keyboard/screen-reader user gets no
  // confirmation of where they landed and has to blind-Tab to find out.
  // Watching for focus actually having been dropped to <body> (rather than
  // firing on every step change unconditionally) means this only ever
  // steps in to recover from that specific failure - it never fights a
  // user who has focus somewhere else on purpose, and the guard below
  // skips the very first render so a fresh/resumed page load never grabs
  // focus nobody asked for.
  const stepFocusMounted=React.useRef(false);
  React.useEffect(()=>{
    if(!stepFocusMounted.current){stepFocusMounted.current=true;return;}
    if(!loc||done)return;
    // Checked only inside the rAF, not before scheduling it: setting
    // `inert` (the splash-screen case above) doesn't blur its now-inert
    // descendant to <body> synchronously within this same effect pass -
    // that happens on the browser's own schedule, sometime before the
    // next paint but after every effect for this commit has already run.
    // Bailing out early here on an activeElement check made at THIS exact
    // moment saw the splash card still (about to be, not yet) blurred and
    // skipped recovering focus entirely. Waiting for the same rAF that
    // already guards "something else claimed it" covers both this and the
    // disabled-Next-button case (a synchronous, immediate blur) equally
    // well, since both are settled well before a rAF callback runs.
    const id=requestAnimationFrame(()=>{
      if(document.activeElement!==document.body)return; // something else already claimed it
      const scope=isAtticMode?'.attic-layout':'.closet-layout';
      const target=document.querySelector(`${scope} .info-btn, ${scope} .btn-back, ${scope} .attic-opt, ${scope} .opt`);
      target&&target.focus();
    });
    return ()=>cancelAnimationFrame(id);
  },[stepIdx,loc,done]);

  // Render option button (attic small or sidebar full)
  const makeOpt = (opt, isSmall) => {
    if(!cur) return null;
    const isMulti = cur.multi;
    const isOn = isMulti ? msel(cur.id).includes(opt.v) : sel(cur.id) === opt.v;
    const isDisabled = !!opt.disabled;
    const click = isDisabled ? null : isMulti ? ()=>toggle(cur.id,opt.v) : ()=>setA(cur.id,opt.v);
    if(isSmall){
      return <button key={opt.v} className={"attic-opt"+(isOn?" sel":"")+(isDisabled?" disabled":"")} onClick={click}>
        <span className="attic-opt-label">{opt.label}</span>
        <span className="attic-opt-desc">{opt.desc||""}</span>
        <div className="attic-opt-foot">
          <div className={"attic-chk"+(isMulti?"":" radio")}>{isMulti&&isOn?"✓":""}{!isMulti&&isOn?<div style={{width:7,height:7,borderRadius:"50%",background:"var(--gh)"}}/>:""}</div>
        </div>
      </button>;
    }
    return <button key={opt.v} className={"opt"+(isOn?" sel":"")+(isDisabled?" disabled":"")} onClick={click}>
      <div className="opt-inner">
        <div className="opt-body">
          <span className="opt-label">{opt.label}{opt.badge&&<span className="opt-badge">GES</span>}</span>
          {opt.desc&&<span className="opt-desc">{opt.desc}</span>}
        </div>
        <div className={isMulti?"opt-check":"opt-check radio"} style={isOn&&!isMulti?{borderColor:"var(--gl)",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}:{}}>
          {isMulti&&isOn?"✓":""}{!isMulti&&isOn?<div style={{width:8,height:8,borderRadius:"50%",background:"var(--gh)"}}/>:""}
        </div>
      </div>
    </button>;
  };

    return(<>
      <div className="site-header-spacer no-print"/>
    <div ref={topRef} className="app-root">
      {/* ── RESUME PROMPT - shown once on load if a saved build exists ── */}
      {resumePending&&<div className="fadein" style={{position:"absolute",inset:0,zIndex:40,background:"var(--bk)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:24,textAlign:"center"}}>
        <div className="splash-logo" style={{fontSize:"clamp(28px,6vw,44px)"}}>WELCOME BACK</div>
        <p style={{fontFamily:"var(--fb)",fontSize:15,color:"rgba(255,255,255,.6)",maxWidth:420,lineHeight:1.6}}>
          {(()=>{
            const savedSteps=STEPS.filter(s=>!s.showIf||s.showIf(savedBuild.answers));
            const savedCur=savedSteps[savedBuild.stepIdx];
            return savedBuild.done
              ? "You already finished building a system. Pick up right where you left off?"
              : savedCur
                ? <>You were on <strong style={{color:"rgba(255,255,255,.85)"}}>"{savedCur.q}"</strong> - want to keep going?</>
                : "You have a build in progress. Want to keep going?";
          })()}
        </p>
        <button className="done-cta" style={{width:220}} onClick={resumeBuild}>Resume My Build</button>
        <button className="done-restart" onClick={discardSavedBuild}>Start Fresh Instead</button>
      </div>}

      {/* ── PROGRESS BAR - segmented by chapter, not a bare percentage ── */}
      <div className="prog-chapters" style={{position:"absolute",top:0,left:0,right:0,zIndex:30}}>
        {CHAPTERS.map((name,i)=>{
          const segPct=done||i<curChapter?100:i>curChapter?0:
            chapterCounts[i]?Math.round((curChapterStepNum/chapterCounts[i])*100):0;
          return <div key={i} className={"prog-chapter"+(segPct>=100?" done":"")} title={name}>
            <div className="prog-chapter-fill" style={{width:segPct+"%"}}/>
          </div>;
        })}
      </div>

      {/* ── SPLASH - step 1 location picker ── */}
      {/* inert mirrors the "out" class's opacity/pointer-events:none exactly
          (see the .splash-screen.out rule) - CSS opacity/pointer-events hide
          this from the mouse and from view, but say nothing to the KEYBOARD:
          its two cards stayed in Tab order the whole time, so the very next
          Tab after picking one (keyboard or switch-access, not just a mouse
          click) landed back on this now-invisible, non-interactive screen -
          on the OTHER card, then back on the one just picked - with no focus
          ring visible anywhere on screen, before Tab finally escaped into
          the real step 1 that had already replaced it. inert removes the
          whole subtree from tab order and assistive tech the same instant
          the mouse loses it, so focus moves straight into the step that's
          actually on screen. Same fix applied below to .attic-layout,
          .closet-layout and .done-screen - every one of them stays mounted
          (hidden via opacity, not display:none) so its buttons keep working
          for whichever mode IS visible without a remount, but that means
          all three needed this same guard against leaking into Tab order
          while hidden. */}
      <div ref={splashRef} className={"splash-screen"+(loc||done?" out":"")}>
        <div className="splash-logo">BUILD YOUR OWN SYSTEM</div>
        <p style={{fontFamily:"var(--fb)",fontSize:"19px",color:"rgba(255,255,255,.65)",textAlign:"center",maxWidth:600,lineHeight:1.7,margin:"8px 0 4px"}}>
          Tell us where your indoor unit lives and we will build a <strong style={{color:"rgba(255,255,255,.8)"}}>live, real-time diagram</strong> of your complete HVAC system - every component, every connection, sized and labeled.
        </p>
        {/* .55 measured 3.66:1 against the splash screen's #121212
            background - under the 4.5:1 body-text minimum. .75 clears it
            at 5.82:1 while staying visibly dimmer than the solid --gl used
            on the two cards below it. */}
        <p style={{fontFamily:"var(--fm)",fontSize:"14px",color:"rgba(215,183,64,.75)",textAlign:"center",letterSpacing:".1em",margin:"0 0 6px"}}>SELECT YOUR SYSTEM LOCATION TO BEGIN</p>
        {/* Both cards are plain divs (not <button>) for a free hand over
            layout, so keyboard reachability and semantics don't come for
            free the way they would on a real button - this is the very
            first interactive thing on the page, and without these it was
            entirely unreachable by keyboard (no tabIndex) and invisible to
            a screen reader as a control (no role/name), a hard dead end
            for anyone not using a mouse/touchscreen. role="button" +
            tabIndex=0 + a Enter/Space handler (native buttons activate on
            both; a bare div's default keydown does neither) bring it to
            parity with the real <button>s everywhere else in the wizard,
            picking up the same global :focus-visible ring for free. */}
        <div className="splash-cards">
          <div className="splash-card" role="button" tabIndex={0}
            aria-label="Attic Horizontal - Unit lays on its side above the ceiling, most common in Austin. Air flows horizontally through ducts in the attic."
            onClick={()=>pickLocation("attic")}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickLocation("attic");}}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:4}}>
              <div className="splash-card-title">Attic Horizontal</div>
              <div className="splash-card-desc">Unit lays on its side above the ceiling - most common in Austin. Air flows horizontally through ducts in the attic.</div>
            </div>
          </div>
          <div className="splash-card" role="button" tabIndex={0}
            aria-label="Closet Upflow - Unit stands upright in a utility closet or hallway alcove. Air flows vertically up through the coil."
            onClick={()=>pickLocation("closet")}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickLocation("closet");}}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:4}}>
              <div className="splash-card-title">Closet Upflow</div>
              <div className="splash-card-desc">Unit stands upright in a utility closet or hallway alcove. Air flows vertically up through the coil.</div>
            </div>
          </div>
        </div>
        <p style={{fontFamily:"var(--fb)",fontSize:"14px",color:"rgba(255,255,255,.55)",textAlign:"center",maxWidth:460,lineHeight:1.6,marginTop:8}}>
          Takes about 2 minutes. No personal info required. Your build saves automatically as you go.
        </p>
      </div>

      {/* ── ATTIC LAYOUT - canvas full width, step bar on bottom ── */}
      {/* inert matches the "out" condition below - see the comment on
          .splash-screen above for why this is needed at all. */}
      <div ref={atticLayoutRef} className={"attic-layout"+(!isAtticMode||done?" out":"")}>
        <div className="attic-canvas-area canvas-frame">
          <div className="canvas-zoom">
            <Canvas a={answers} stepIdx={stepIdx} activeSteps={activeSteps}/>
          </div>
        </div>
        <div className="attic-bar">
          {quickEdit&&<div className="quickedit-banner fadein">
            <span>✎ Editing this answer only</span>
            <button onClick={()=>{setQuickEdit(false);setDone(true);}}>‹ Cancel, back to build</button>
          </div>}
          {/* .attic-bar-top/.attic-info-collapse are rendered AFTER
              .attic-bar-body below (still visually on top - see the
              order:1/2/3 rules on all three in styles.css) so Tab order
              runs question -> options -> Back/Skip/Next instead of DOM
              order putting the nav row before the options it's supposed to
              act on. Forward-Tab from an option used to have nowhere to go
              but backward into the same options over and over - Next sat
              earlier in the DOM, so it was only ever reachable with
              Shift+Tab once you'd tabbed into the option list, a dead end
              for anyone tabbing forward only. Flexbox `order` changes paint
              order, never focus order, so fixing this needed the actual
              DOM sequence to change; mirrors the closet sidebar's own
              .opts-before-.nav-row structure a few hundred lines down,
              which never had this problem because it was already ordered
              this way. */}
          <div className="attic-bar-body">
            {/* A key derived from stepIdx forces a remount on every step
                change so the existing .fadein utility (already used for
                the quickedit banner and resume prompt elsewhere in this
                file) plays again - without it the question/hint/options
                just popped in instantly with the old content replaced in
                place, no transition to animate since nothing about the
                DOM nodes themselves changed identity. .attic-info and
                .attic-scroll are both plain <div>s at the same tree
                depth, so a bare key={stepIdx} on both would collide
                (two same-type siblings with an identical key confuses
                React's reconciliation and produced duplicated/stale
                nodes in testing) - prefixed per element instead. */}
            <div key={"info-"+stepIdx} className="attic-info fadein">
              <div className="step-q" style={{marginBottom:2}}>{cur?cur.q:""}</div>
              {cur&&cur.hint&&<div className="step-hint">{cur.hint}</div>}
              {reactionText&&<div key={reactionText} className="reaction-line">✓ {reactionText}</div>}
            </div>
            <div key={"scroll-"+stepIdx} className="attic-scroll fadein">
              {opts.map(opt=>makeOpt(opt,true))}
            </div>
          </div>
          <div className="attic-bar-top">
            <span className="attic-step-label">
              {cur ? <><span className="chapter-tag">{CHAPTERS[curChapter]}</span>{" · STEP "+stepIdx+(totalKnown?" OF "+totalSteps:"")+" · "+cur.q.toUpperCase()}</> : ""}
            </span>
            {infoText&&<button className="info-btn" aria-label={showInfo?"Hide info":"More info"} aria-expanded={showInfo}
              onMouseEnter={()=>hoverCapable()&&setShowInfo(true)} onMouseLeave={()=>hoverCapable()&&setShowInfo(false)}
              onFocus={()=>setShowInfo(true)} onBlur={()=>setShowInfo(false)}
              onTouchEnd={e=>{e.preventDefault();setShowInfo(v=>!v);}}>i</button>}
            {stepIdx>0&&<button className="btn-back" onClick={goBack}>‹ Back</button>}
            {cur&&(cur.optional||cur.multi)&&<button className="btn-skip" onClick={skip}>Skip</button>}
            <button className="btn-next" onClick={goNext} disabled={!canNext}>
              {quickEdit?(quickEditWillFinish?"Save & Return →":"Next →"):(stepIdx===activeSteps.length-1?"Finish →":"Next →")}
            </button>
          </div>
          <div className={"info-collapse attic-info-collapse"+(showInfo&&infoText?" open":"")+(autoInfoInstant.current?" no-anim":"")}><div className="info-collapse-inner">
            {infoText&&<div className="info-body" style={{padding:"4px 12px",borderBottom:"1px solid var(--border)"}}>{infoText}</div>}
          </div></div>
        </div>
      </div>

      {/* ── CLOSET LAYOUT - canvas left, sidebar right ── */}
      {/* inert matches the "out" condition below - see the comment on
          .splash-screen above for why this is needed at all. */}
      <div ref={closetLayoutRef} className={"closet-layout"+(!isClosetMode||done?" out":"")}>
        <div className="closet-canvas-area canvas-frame">
          <div className="canvas-zoom">
            <Canvas a={answers} stepIdx={stepIdx} activeSteps={activeSteps}/>
          </div>
        </div>
        <div className="sidebar">
          {quickEdit&&<div className="quickedit-banner fadein">
            <span>✎ Editing this answer only</span>
            <button onClick={()=>{setQuickEdit(false);setDone(true);}}>‹ Cancel, back to build</button>
          </div>}
          {/* A key derived from stepIdx forces a remount on every step
              change so the existing .fadein utility (already used for
              the quickedit banner above and the resume prompt elsewhere
              in this file) plays again - without it the eyebrow/
              question/hint just popped in instantly with the old content
              swapped in place, nothing for a transition to animate from.
              Mirrors the same fix applied to .attic-info/.attic-scroll in
              the attic layout above, including the "prefix the key" part
              - .step-hdr and .opts below are both plain <div>s at the
              same tree depth, so a bare key={stepIdx} on both collided
              (see the attic-info comment for what that broke). */}
          <div key={"hdr-"+stepIdx} className="step-hdr fadein">
            <div className="step-eyebrow">
              <span>{cur&&<span className="chapter-tag">{CHAPTERS[curChapter]}</span>} Step {stepIdx}{totalKnown?` of ${totalSteps}`:''}</span>
              {infoText&&<button className="info-btn" aria-label={showInfo?"Hide info":"More info"} aria-expanded={showInfo}
                onMouseEnter={()=>hoverCapable()&&setShowInfo(true)} onMouseLeave={()=>hoverCapable()&&setShowInfo(false)}
                onFocus={()=>setShowInfo(true)} onBlur={()=>setShowInfo(false)}
                onTouchEnd={e=>{e.preventDefault();setShowInfo(v=>!v);}}>i</button>}
            </div>
            <div className="step-q">{cur?cur.q:""}</div>
            {cur&&cur.hint&&<div className="step-hint">{cur.hint}</div>}
          </div>
          {/* Deliberately OUTSIDE .step-hdr (unlike the attic layout's
              equivalent, where reaction-line lives inside .attic-info with
              no such issue). .step-hdr is position:sticky with its own
              z-index:10 + solid background so it stays visible while a
              long option list scrolls underneath it - when reaction-line
              used to live inside it, picking an answer grew the sticky
              header by a line, which extended how much of the option list
              below it that solid sticky box covered, hiding the top
              options right after the exact moment a homeowner most wants
              to glance down at the rest of the choices. Sitting after
              .step-hdr instead, it only pushes .opts down slightly in
              normal flow - .opts already scrolls independently. */}
          {reactionText&&<div key={reactionText} className="reaction-line" style={{padding:"4px 18px 0"}}>✓ {reactionText}</div>}
          <div className={"info-collapse"+(showInfo&&infoText?" open":"")+(autoInfoInstant.current?" no-anim":"")}><div className="info-collapse-inner">
            {infoText&&<div className="info-expand"><div className="info-body">{infoText}</div></div>}
          </div></div>
          <div key={"opts-"+stepIdx} className="opts fadein">{opts.map(opt=>makeOpt(opt,false))}</div>
          <div className="nav-row">
            {stepIdx>0&&<button className="btn-back" onClick={goBack}>‹ Back</button>}
            {cur&&(cur.optional||cur.multi)&&<button className="btn-skip" onClick={skip}>Skip</button>}
            <button className="btn-next" onClick={goNext} disabled={!canNext}>
              {quickEdit?(quickEditWillFinish?"Save & Return":"Next"):(stepIdx===activeSteps.length-1?"See Full Build":"Next")}
            </button>
          </div>
        </div>
      </div>

      {/* ── DONE SCREEN — attic (wide/short diagram) keeps the review panel as
           a horizontal bar below so the canvas keeps full width; closet
           (tall/narrow diagram) keeps it as a side column so the canvas
           keeps full height. Mirrors the same tradeoff each layout already
           makes during the wizard steps (.attic-layout vs .closet-layout). ── */}
      {/* inert only during the done-leaving close (see .done-screen.done-leaving's
          own pointer-events:none) - the rest of the time this is unmounted
          entirely (doneVisible false), so there's no stray Tab stop to guard
          against outside that one closing beat. Same reasoning as the
          .splash-screen comment above. */}
      {doneVisible&&<div ref={doneScreenRef} className={"done-screen"+(isAtticMode?" attic-mode":" closet-mode")+(!done?" done-leaving":"")} style={{position:"absolute",inset:0,overflow:"hidden",zIndex:10}}>
        <div className="canvas-frame done-canvas-frame" style={{flex:1,minWidth:0,minHeight:0,position:"relative",overflow:"hidden"}}>
          <div className="canvas-zoom">
            <Canvas a={answers} stepIdx={stepIdx} activeSteps={activeSteps} onEditStep={jumpToStep}/>
          </div>
          <div className="done-canvas-sweep"/>
          {/* Attic layout's diagram never fills the full frame width (it
              keeps its own aspect ratio) - the dead space it leaves on the
              left is real screen room, so the "system is built" header
              lives here instead of costing the sidebar a row underneath. */}
          {isAtticMode&&(pricingFlow?
            <div className="done-header-desktop-only" style={{position:"absolute",top:8,left:8,zIndex:10,alignItems:"center",gap:8,background:"rgba(11,13,20,.7)",padding:"6px 10px"}}>
              <span style={{fontSize:"var(--fs-pricing-meta)",color:"rgba(255,255,255,.8)"}}>✓ Your system is built</span>
              <button className="no-print link-btn-gold" onClick={()=>setPricingFlow(null)} style={{fontSize:"var(--fs-pricing-fine)"}}>Edit selections</button>
            </div>
            :<div className="done-header-desktop-only" style={{position:"absolute",top:8,left:8,zIndex:10,alignItems:"center",gap:8,background:"rgba(11,13,20,.55)",padding:"6px 10px 6px 7px"}}>
              <div className="done-icon" style={{margin:0,width:28,height:28,fontSize:14,flexShrink:0}}>✓</div>
              <div>
                <div className="done-title" style={{fontSize:14.5,marginBottom:0}}>Your System is Built</div>
                <div style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)"}}>Review your selections below</div>
              </div>
            </div>
          )}
        </div>
        <div className="sidebar" style={isAtticMode?{overflowY:"auto",width:"100%",height:"200px",flexShrink:0,borderLeft:"none",borderTop:"1px solid var(--border)"}:{overflowY:"auto"}}>
          <div className={"done-wrap"+(isAtticMode?" done-wrap-attic":"")} style={{padding:"10px 14px 8px",overflowY:"auto"}}>
            {/* Collapsed to one line once pricing is engaged - the full
                header+grid below is what was pushing the sizing questions'
                own Back/Next off the bottom of this panel. The review is
                one click away again ("Edit selections"), and every pricing
                sub-step still shows the same "‹ Back" affordance. Attic mode
                shows this header over the canvas on desktop instead (see
                above) - on a mobile-width attic screen the canvas is a short
                strip with no dead space to hold it, so it falls back to
                showing here, same as closet mode always does. */}
            {pricingFlow?
              <div className={isAtticMode?"done-header-mobile-only":undefined} style={{display:isAtticMode?undefined:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",marginBottom:10,paddingBottom:10,borderBottom:"1px solid rgba(215,183,64,.15)"}}>
                <span style={{fontSize:isAtticMode?"var(--fs-review-label)":"var(--fs-pricing-meta)",color:"rgba(255,255,255,.78)"}}>✓ Your system is built</span>
                <button className="no-print link-btn-gold" onClick={()=>setPricingFlow(null)} style={{fontSize:"var(--fs-review-edit)"}}>Edit selections</button>
              </div>
            :<>
            <div className={isAtticMode?"done-header-mobile-only":undefined} style={{display:isAtticMode?undefined:"flex",alignItems:"center",gap:10,marginBottom:12,width:"100%"}}>
              <div className="done-icon" style={{margin:0,width:isAtticMode?38:42,height:isAtticMode?38:42,fontSize:isAtticMode?17:19,flexShrink:0}}>✓</div>
              <div>
                <div className="done-title" style={{fontSize:isAtticMode?17:19,marginBottom:1}}>Your System is Built</div>
                <div style={{fontSize:isAtticMode?"var(--fs-review-label)":"var(--fs-review-label-lg)",color:"var(--mut)"}}>Review your selections below</div>
              </div>
            </div>
            <div className={"done-review-grid"+(isAtticMode?" attic-mode-grid":" closet-mode-grid")} style={{width:"100%",marginBottom:8,border:"1px solid rgba(215,183,64,.15)",display:"grid"}}>
              {[
                {step:"location",label:"Location",val:answers.location==="attic"?"Attic horizontal":answers.location==="closet"?"Upflow closet":null},
                {step:"indoor_type",label:"Indoor unit",val:answers.indoor_type==="furnace"?"Gas furnace":answers.indoor_type==="ah"?"Air handler":null},
                answers.furnace_eff?{step:"insulation",label:"Insulation",val:answers.furnace_eff==="e90"?"Spray foam - 90% AFUE":"Fiberglass - 80% AFUE"}:null,
                {step:"plenum",label:"Plenum",val:answers.plenum==="ductboard"?"New ductboard plenum":answers.plenum==="metal"?"New sheet metal plenum":answers.plenum==="none"?"Keep existing plenum":null},
                {step:"thermostat",label:"Thermostat",
                  val:answers.thermostat==="wifi"?"Wi-Fi smart thermostat":answers.thermostat==="basic"?"Basic programmable":answers.thermostat==="proprietary"?"Proprietary communicating thermostat":null,
                  short:answers.thermostat==="wifi"?"Wi-Fi smart t-stat":answers.thermostat==="basic"?"Basic programmable":answers.thermostat==="proprietary"?"Proprietary t-stat":null},
                Array.isArray(answers.purif)&&answers.purif.length>0?{step:"purif",label:"Add-ons",
                  val:answers.purif.map(v=>v==="aprilaire"?"Enhanced Filtration Cabinet":v==="uv"?"UV Light":v==="ionizer"?"Ionizer":v==="surge"?"Surge protector":v).join(" + "),
                  short:answers.purif.map(v=>v==="aprilaire"?"Filtration Cabinet":v==="uv"?"UV Light":v==="ionizer"?"Ionizer":v==="surge"?"Surge Protector":v).join(" + ")}:null,
                {step:"cond_tier",label:"Efficiency",val:answers.cond_tier==="fedmin"?"Federal Minimum - 14 SEER2":answers.cond_tier==="mid_ge15"?"Mid Efficiency - 18 SEER2":answers.cond_tier==="high_ge18"?"High Efficiency - 21 SEER2":null},
                answers.system_for?{step:"system_for",label:"Heat source",
                  val:answers.system_for==="hp"?"Dual Fuel - heat pump + furnace":"Straight cool - furnace only",
                  short:answers.system_for==="hp"?"Dual Fuel (HP + furnace)":"Straight Cool (furnace)"}:null,
                {step:"dehu",label:"Dehumidifier",val:answers.dehu==="yes"?"Yes - whole-home unit":answers.dehu==="no"?"No":null},
                Array.isArray(answers.extras)&&answers.extras.length>0?{step:"extras",label:"Final add-ons",val:answers.extras.map(v=>v==="condensate"?"Condensate pump":v==="erv"?"ERV":v).join(" + ")}:null,
              ].filter(Boolean).map((item,i)=>item&&item.val?(
                // Attic's grid cells live in the fixed 200px-tall panel
                // (see .done-wrap-attic above), but unlike .opt-compact's
                // fixed-height/zero-slack panel, this one's own container
                // sets overflowY:"auto" (see the .sidebar style a few lines
                // up), so growing this type only ever adds scroll, never
                // clips - sized here off the --fs-review-* variables (a
                // smaller "compact" pair for attic's short bar, a mid pair
                // for closet's now-2-column grid, which still scrolls by
                // design but needs less of it) instead of the hardcoded
                // 9px/11px/8.5px this used to pin to, which read as
                // barely-legible fine print and made the EDIT button a
                // genuinely fiddly tap target. Closet shows a trimmed
                // "short" wording where one exists (full detail is still
                // one hover/tap away via the native title tooltip, same
                // place attic's ellipsis-clipped cells already send it).
                isAtticMode?
                <div key={i} style={{display:"flex",flexDirection:"column",gap:1,padding:"4px 34px 4px 10px",background:i%2===0?"rgba(255,255,255,.02)":"transparent",border:"1px solid rgba(255,255,255,.04)",position:"relative",minWidth:0}}>
                  <span style={{color:"rgba(215,183,64,.68)",fontFamily:"var(--fm)",fontSize:"var(--fs-review-label)",letterSpacing:".03em"}}>{item.label}</span>
                  <span style={{color:"rgba(255,255,255,.9)",fontFamily:"var(--fb)",fontSize:"var(--fs-review-val)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={item.val}>{item.val}</span>
                  <button className="no-print review-edit-btn" onClick={()=>jumpToStep(item.step)} style={{position:"absolute",top:4,right:4,fontSize:"var(--fs-review-edit)",padding:"3px 6px"}}>EDIT</button>
                </div>
                :
                // Closet's cell doesn't reserve a fixed right-hand gutter for
                // an absolutely-positioned EDIT chip (that's what attic does
                // above) - at 2-column width the chip's real rendered width
                // didn't match a guessed gutter and ended up sitting on top
                // of the label text. Putting EDIT in normal flow next to the
                // value instead means it can never overlap anything: the
                // value just wraps in whatever width is left beside it.
                <div key={i} style={{display:"flex",flexDirection:"column",gap:2,padding:"6px 10px",background:i%2===0?"rgba(255,255,255,.02)":"transparent",border:"1px solid rgba(255,255,255,.04)",minWidth:0}}>
                  <span style={{color:"rgba(215,183,64,.68)",fontFamily:"var(--fm)",fontSize:"var(--fs-review-label-md)",letterSpacing:".03em"}}>{item.label}</span>
                  {/* Value gets the cell's full width to wrap in (previously
                      shared the row with the EDIT button, so a value long
                      enough to wrap - "Filtration Cabinet + UV Light",
                      "Yes - whole-home unit" - only got the button's
                      leftover ~2/3 width, wrapped to 3 short lines, and read
                      as if EDIT were sitting mid-sentence instead of
                      alongside it). EDIT now sits on its own line
                      bottom-right, same as it already does for every other
                      value short enough to fit one line. */}
                  <span style={{color:"rgba(255,255,255,.9)",fontFamily:"var(--fb)",fontSize:"var(--fs-review-val-md)",lineHeight:1.25,overflow:"visible",whiteSpace:"normal"}} title={item.val}>{item.short||item.val}</span>
                  <button className="no-print review-edit-btn" onClick={()=>jumpToStep(item.step)} style={{alignSelf:"flex-end",fontSize:"var(--fs-review-edit-md)",padding:"4px 7px",marginTop:1}}>EDIT</button>
                </div>
              ):null)}
            </div>
            </>}

            {/* ── PRICING GATE / SIZING / RESULT - only takes up room once
                 actually engaged; the entry point lives in the button grid
                 below instead of its own full-width row ── */}
            {pricingFlow!==null&&<div style={{width:"100%",marginBottom:12}}>
              {pricingFlow==='sizing'&&(()=>{
                const subSteps=['systems','sqft','ducts'];
                const subId=subSteps[pricingSubStep];
                const goSubNext=()=>{
                  if(pricingSubStep<subSteps.length-1){setPricingSubStep(s=>s+1);return;}
                  trackEvent('price_revealed');
                  setPricingFlow('result');
                };
                const goSubBack=()=>{
                  if(pricingSubStep>0)setPricingSubStep(s=>s-1);
                  else setPricingFlow(null);
                };
                const canSubNext=
                  subId==='systems'?!!pricingAnswers.systemsCount:
                  subId==='sqft'?!!pricingAnswers.tonnageChoice:
                  subId==='ducts'?(pricingAnswers.wantDucts===false||(pricingAnswers.wantDucts===true&&pricingAnswers.ventCount>0)):
                  true;
                // Attic mode's panel is a short, very wide bar (not the tall
                // narrow sidebar this was designed for originally) - stacking
                // question, description, options and nav vertically no
                // longer fits its height without scrolling. Splitting into
                // a question/description column plus an options column
                // uses the width that's actually available instead, and
                // keeps every sizing step scroll-free; only the final
                // estimate (genuinely more content) still scrolls.
                const left=(
                  <div className={isAtticMode?"pricing-substep-left":undefined} style={{flex:isAtticMode?"0 0 420px":"1 1 auto"}}>
                    {subId==='systems'&&<>
                      <div style={{fontSize:isAtticMode?13:"var(--fs-pricing-q)",fontWeight:600,marginBottom:4,fontFamily:"var(--ft)"}}>How many separate HVAC systems does your home have?</div>
                      <div style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",lineHeight:isAtticMode?1.3:1.5}}>This is typically the number of thermostats you have, or the number of outdoor condenser units.</div>
                    </>}
                    {subId==='sqft'&&<>
                      <div style={{fontSize:isAtticMode?13:"var(--fs-pricing-q)",fontWeight:600,marginBottom:isAtticMode?2:4,lineHeight:isAtticMode?1.15:"normal",fontFamily:"var(--ft)"}}>{pricingAnswers.systemsCount==='1'?'What size system does this home need?':'What size system is needed for this part of your home?'}</div>
                      <div style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",marginBottom:isAtticMode?3:8,lineHeight:isAtticMode?1.15:1.5}}>
                        {isAtticMode
                          ?"Pick the tonnage for your home's sq ft, or enter it below for a suggestion."
                          :<>{pricingAnswers.systemsCount==='1'?'Pick the tonnage that best fits your home’s total square footage.':'Pick the tonnage for just the area this system covers - not the whole home.'} Not sure? Enter your sq ft for a suggested starting point.</>}
                      </div>
                      <input type="number" min="200" max="10000" placeholder="Sq ft (optional)"
                        value={pricingAnswers.sqftInput||''}
                        onChange={e=>{
                          const val=e.target.value;
                          const rec=nearestTonnageOption(parseInt(val)||0);
                          setPricingAnswers(p=>({...p, sqftInput:val, ...(rec?{tonnageChoice:rec.v}:{})}));
                        }}
                        className={"pricing-input"+(isAtticMode?" compact":"")}/>
                    </>}
                    {subId==='ducts'&&<div style={{fontSize:isAtticMode?13:"var(--fs-pricing-q)",fontWeight:600,fontFamily:"var(--ft)"}}>Want duct replacement priced too?</div>}
                  </div>
                );
                const right=(
                  <div style={{flex:1,minWidth:0}}>
                    {subId==='systems'&&
                      <div className={isAtticMode?"pricing-opts-systems":undefined} style={{display:"grid",gridTemplateColumns:isAtticMode?"repeat(3,1fr)":"repeat(auto-fit,minmax(150px,1fr))",gap:6}}>
                        {[{v:'1',label:'Just 1 - this one'},{v:'2',label:'2 systems'},{v:'3+',label:'3 or more'}].map(o=>(
                          <button key={o.v} className={"opt"+(isAtticMode?" opt-compact":"")+(pricingAnswers.systemsCount===o.v?" sel":"")} onClick={()=>setPricingAnswers(p=>({...p,systemsCount:o.v}))}>
                            <div className="opt-inner"><div className="opt-body"><span className="opt-label">{o.label}</span></div></div>
                          </button>
                        ))}
                      </div>
                    }
                    {subId==='sqft'&&(()=>{
                      const sqftNum=parseInt(pricingAnswers.sqftInput)||0;
                      const recommended=nearestTonnageOption(sqftNum);
                      return <div className={isAtticMode?"pricing-opts-sqft":undefined} style={{display:"grid",gridTemplateColumns:isAtticMode?"repeat(7,1fr)":"repeat(auto-fit,minmax(160px,1fr))",gap:6}}>
                        {TONNAGE_OPTIONS.map(o=>(
                          <button key={o.v} className={"opt"+(isAtticMode?" opt-compact":"")+(pricingAnswers.tonnageChoice===o.v?" sel":"")} onClick={()=>setPricingAnswers(p=>({...p,tonnageChoice:o.v}))}>
                            <div className="opt-inner"><div className="opt-body">
                              <span className="opt-label">{o.label}{recommended&&recommended.v===o.v&&<span className="opt-badge">SUGGESTED</span>}</span>
                              <span className="opt-desc">{isAtticMode?o.sqftLabel:`Typical for ${o.sqftLabel} homes`}</span>
                            </div></div>
                          </button>
                        ))}
                      </div>;
                    })()}
                    {subId==='ducts'&&<div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <button className={"opt"+(isAtticMode?" opt-compact":"")+(pricingAnswers.wantDucts===true?" sel":"")} style={{flex:1}} onClick={()=>setPricingAnswers(p=>({...p,wantDucts:true}))}>
                        <div className="opt-inner"><div className="opt-body"><span className="opt-label">Yes</span></div></div>
                      </button>
                      <button className={"opt"+(isAtticMode?" opt-compact":"")+(pricingAnswers.wantDucts===false?" sel":"")} style={{flex:1}} onClick={()=>setPricingAnswers(p=>({...p,wantDucts:false,ventCount:undefined}))}>
                        <div className="opt-inner"><div className="opt-body"><span className="opt-label">No / Skip</span></div></div>
                      </button>
                      {pricingAnswers.wantDucts&&<div style={{flex:1}}>
                        <div style={{fontSize:isAtticMode?9.5:11,color:"var(--mut)",marginBottom:4}}>How many vents/registers?</div>
                        <input type="number" min="1" max="40" value={pricingAnswers.ventCount||''} onChange={e=>setPricingAnswers(p=>({...p,ventCount:Math.max(0,parseInt(e.target.value)||0)}))}
                          className={"pricing-input"+(isAtticMode?" compact":"")}/>
                      </div>}
                    </div>}
                  </div>
                );
                {/* key={pricingSubStep} forces a remount per sub-step so
                    the .fadein utility plays on each question/option swap,
                    same fix and rationale as the wizard's .attic-info /
                    .step-hdr above - this panel had the identical
                    instant-pop-in gap since none of its content changes
                    identity between sub-steps otherwise. */}
                return <div key={pricingSubStep} className="fadein" style={{border:"1px solid rgba(215,183,64,.2)",padding:isAtticMode?"8px 12px":12}}>
                  {/* .5 measured 3.20:1 against the panel background this
                      sits on - under the 4.5:1 minimum for this 9-10.5px
                      label. .7 clears it at 5.06:1. */}
                  <div style={{fontSize:isAtticMode?9:10.5,color:"rgba(215,183,64,.7)",letterSpacing:".1em",marginBottom:isAtticMode?4:8,fontFamily:"var(--fm)"}}>PRICING · STEP {pricingSubStep+1} OF {subSteps.length}</div>

                  {/* alignItems:"flex-start" only makes sense in ROW mode
                      (attic, wide) where it top-aligns two columns of
                      differing height. In COLUMN mode - closet (always) and
                      attic once the <=860px media query below flips this
                      row to a column - flex-start is a cross-axis (now
                      HORIZONTAL) rule instead: it shrinks {left}/{right} to
                      their own content width instead of the container's
                      full width, since their flex:1 only governs the
                      vertical main axis once stacked. Short button grids
                      (systems' 1/2/3+, ducts' Yes/No/vent-count) collapsed
                      to a narrow single column instead of using the real
                      available width. */}
                  <div className={isAtticMode?"pricing-substep-row":undefined} style={{display:"flex",flexDirection:isAtticMode?"row":"column",gap:isAtticMode?20:8,alignItems:isAtticMode?"flex-start":"stretch"}}>
                    {left}
                    {right}
                  </div>

                  <div style={{display:"flex",gap:8,marginTop:isAtticMode?8:12}}>
                    <button className="btn-back" style={{flex:"0 0 auto",...(isAtticMode?{padding:"6px 16px",fontSize:14}:{})}} onClick={goSubBack}>‹ Back</button>
                    <button className="btn-next" style={{flex:1,...(isAtticMode?{padding:"7px 16px",fontSize:15}:{})}} disabled={!canSubNext} onClick={goSubNext}>
                      {pricingSubStep===subSteps.length-1?"Get My Estimate":"Next"}
                    </button>
                  </div>
                </div>;
              })()}

              {/* Contact-form gate - only reachable when GATE_CONFIG.gravityFormId
                  is set (see goSubNext above and data.js). Waits on the
                  leadUnlocked detection effect above; auto-advances to
                  'result' the moment that flips true, so a homeowner who
                  submits the form never has to click anything in here. */}
              {pricingFlow==='leadgate'&&<div key="leadgate" className="fadein" style={{border:"1px solid rgba(215,183,64,.2)",padding:isAtticMode?"8px 12px":12}}>
                <div style={{fontSize:isAtticMode?13:"var(--fs-pricing-q)",fontWeight:600,marginBottom:6,fontFamily:"var(--ft)"}}>Almost there - just one quick step</div>
                <div style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",lineHeight:1.5,marginBottom:12}}>
                  Fill out the short form on this page to unlock pricing - it continues right here automatically, no need to click anything else.
                </div>
                <button className="btn-back" style={{padding:isAtticMode?"6px 16px":"8px 16px",fontSize:isAtticMode?14:"var(--fs-pricing-fine)"}}
                  onClick={()=>setPricingFlow(null)}>‹ Back</button>
              </div>}

              {/* Wrapped in its own key'd+fadein div for the same reason as
                  the sizing sub-steps above - this result panel replaces
                  the sizing UI in place with no DOM identity change, so
                  without this it popped in instantly (the CountUp price
                  digits were the only thing that animated in). */}
              {pricingFlow==='result'&&<div key="result" className="fadein">{(()=>{
                const est=calcEstimate(answers,pricingAnswers);
                if(!est)return<div style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)"}}>Couldn't calculate an estimate for this combination yet - call us and we'll get you a number.</div>;
                // Attic's wide-short panel doesn't need this stacked
                // full-width - splitting the price card and the
                // considerations panel into side-by-side columns cuts the
                // scroll this page needs roughly in half. Closet's tall
                // narrow sidebar keeps the original single-column stack.
                const priceCard=(
                  <div style={{border:"1px solid rgba(215,183,64,.3)",background:"rgba(215,183,64,.05)",padding:12}}>
                    <div style={{fontSize:"var(--fs-pricing-fine)",color:"rgba(215,183,64,.7)",letterSpacing:".1em",marginBottom:4,fontFamily:"var(--fm)"}}>AS LOW AS</div>
                    <div style={{fontFamily:"var(--fm)",fontSize:44,fontWeight:700,color:"var(--gl)",lineHeight:1}}>~$<CountUp value={Math.round(est.display/36)} format={n=>n.toLocaleString()}/><span style={{fontSize:17,color:"var(--dim)",fontWeight:400}}>/mo</span></div>
                    <div style={{fontSize:"var(--fs-pricing-meta)",color:"var(--mut)",marginTop:6,marginBottom:10}}>Based on 36 months at 0% APR through Wells Fargo financing, on approved credit.</div>
                    <div style={{fontSize:"var(--fs-pricing-fine)",color:"rgba(215,183,64,.7)",letterSpacing:".1em",marginBottom:4,fontFamily:"var(--fm)"}}>ESTIMATED PRICE</div>
                    <div style={{fontFamily:"var(--fm)",fontSize:28,color:"var(--gl)",marginBottom:10}}>~$<CountUp value={est.display} format={n=>n.toLocaleString()}/></div>
                    {pricingAnswers.systemsCount&&pricingAnswers.systemsCount!=='1'&&<div style={{fontSize:"var(--fs-pricing-meta)",color:"rgba(215,183,64,.7)",marginBottom:10}}>Since your home has {pricingAnswers.systemsCount==='2'?'2 systems':'3+ systems'}, this estimate covers just the one you built here.</div>}
                    <div style={{marginBottom:10}}>
                      {est.lines.map((l,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.05)",fontSize:"var(--fs-pricing-line)"}}>
                          <span style={{color:"var(--dim)"}}>{l.label}</span>
                          <span style={{color:"rgba(255,255,255,.85)",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>~${l.display.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:"var(--fs-pricing-meta)",color:"rgba(255,255,255,.68)",lineHeight:1.55,marginBottom:10}}>This is an estimate based on typical installs. Your final price is confirmed at your free in-home visit - we verify your existing equipment, take exact measurements, and make sure everything's accounted for.</div>
                    <button className="done-restart" onClick={()=>{setPricingFlow('sizing');setPricingSubStep(0);}}>‹ Adjust my answers</button>
                  </div>
                );
                // ── ADDITIONAL CONSIDERATIONS — education, not "choose your own" ──
                const considerations=(
                  <div style={{width:"100%",padding:"10px 12px",background:"rgba(215,183,64,.05)",border:"1px solid rgba(215,183,64,.15)",...(isAtticMode?{}:{marginTop:12})}}>
                    <div style={{fontSize:"var(--fs-pricing-fine)",color:"rgba(215,183,64,.75)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:6,fontFamily:"var(--fm)"}}>A Few Other Things We Commonly Find</div>
                    <div style={{fontSize:"var(--fs-pricing-line)",color:"var(--dim)",lineHeight:1.7}}>
                      <div><strong style={{color:"rgba(255,255,255,.9)"}}>Return plenum/ductwork</strong> - Austin homes very commonly have return-side ductwork that's undersized for the system it's paired with. An undersized return shows up as weak airflow, rooms that never quite hit temperature, and a system that runs longer and louder than it should.</div>
                      <div><strong style={{color:"rgba(255,255,255,.9)"}}>New return duct run</strong> - for when the return plenum itself is fine but the duct feeding it needs to be replaced or extended.</div>
                      <div><strong style={{color:"rgba(255,255,255,.9)"}}>New supply duct runs</strong> - new duct, boot, and grille together for a single run. {pricingAnswers.ventCount>0?`You mentioned ${pricingAnswers.ventCount} vents - most homes only need a few of those runs redone, not all of them.`:"Ask us how many runs your home is likely to need."}</div>
                      <div><strong style={{color:"rgba(255,255,255,.9)"}}>Duct cleaning</strong> - clears years of dust and debris out of the ductwork, which improves airflow and indoor air quality - especially worth it if the ductwork's never been cleaned.</div>
                    </div>
                    <div style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)",marginTop:6,fontStyle:"italic"}}>These aren't part of the estimate above - we'll flag anything your ductwork actually needs, and give you exact pricing, at your free in-home visit.</div>
                  </div>
                );
                if(!isAtticMode)return<>{priceCard}{considerations}</>;
                return <div className="pricing-result-row" style={{display:"flex",gap:16,alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>{priceCard}</div>
                  <div style={{flex:1,minWidth:0}}>{considerations}</div>
                </div>;
              })()}</div>}
            </div>}

            {/* ── QUICK ACTIONS - one compact button grid instead of five
                 stacked full-width rows, so this panel stays low and the
                 diagram keeps the room ── */}
            {pricingFlow===null&&<button className="btn-next" style={{flex:"none",margin:0,width:"100%",marginBottom:6,padding:"12px",fontSize:16}} onClick={()=>{
              trackEvent('pricing_started');
              if(leadUnlocked){setPricingFlow('sizing');setPricingSubStep(0);}
              else{trackEvent('contact_form_shown');setPricingFlow('leadgate');}
            }}>💰 Get Pricing</button>}
            {/* No Schedule Visit / phone CTA in this panel or the header -
                both were dropped once this became an iframe embed on the
                real site, which already has its own header with that CTA. */}
            {/* Four equally-important actions (financing, save, back, restart)
                - all bumped to the same --fs-restart size (was a flat 13px)
                so each reads clearly, not just the Get Pricing CTA above
                them. Padding stays close to its original 8-10px - this row
                sits in the same fixed 200px attic panel as the review grid
                and the pricing sizing sub-steps below it, so height here is
                still budgeted carefully even though this exact row isn't
                the documented zero-slack one. Financing/Save-Print/Start
                Over's color+border+background now live in the
                .quick-financing-btn/.quick-print-btn/.quick-restart-btn
                classes (was inline, duplicated, and had no :hover at all
                unlike every other clickable thing on this screen) - text
                color for Start Over stays the same contrast-safe
                rgba(255,255,255,.68) the class encodes, it's just no
                longer re-typed inline every render. */}
            <div className="no-print" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,width:"100%",marginBottom:8}}>
              {/* One button per configured financing option (see
                  FINANCING_OPTIONS in data.js) - Wells Fargo simply
                  doesn't render here until its real link is filled in. */}
              {FINANCING_OPTIONS.filter(f=>f.url).map(f=>(
                <a key={f.key} href={f.url} target="_blank" rel="noopener" onClick={()=>trackEvent('financing_clicked',{lender:f.key})} className="quick-financing-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",textDecoration:"none",textAlign:"center",boxSizing:"border-box"}}>💳 {f.label}</a>
              ))}
              <button onClick={()=>{trackEvent('print_clicked');window.print();}} className="quick-print-btn" style={{width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",letterSpacing:".08em"}}>⬇ Save / Print</button>
              <button className="btn-back" style={{width:"100%",padding:"9px",fontSize:"var(--fs-restart)",justifyContent:"center"}} onClick={()=>{setDone(false);setStepIdx(activeSteps.length-1);}}>‹ Back</button>
              <button className="quick-restart-btn" style={{width:"100%",fontFamily:"var(--fb)",fontSize:"var(--fs-restart)",padding:"9px"}} onClick={restart}>Start Over</button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  </>);
}


ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
