// © Gold Eagle Services, Austin, TX. All rights reserved. Proprietary
// software - see the notice at the top of src/index.template.html and
// the copyright block in index.html's own source for the full terms.
// GES-HVAC-CONFIGURATOR-PROVENANCE-ID: ges-live-system-2026-austin-tx
const {useState,useMemo,useRef,useCallback}=React;
import {CHAPTERS,STEPS,deriveFurnaceEff,getOpts,PRICING,TONNAGE_OPTIONS,calcEstimate,nearestTonnageOption,trackBuildCompleted,trackEvent,trackLead,GATE_CONFIG,FINANCING_OPTIONS,OFFICE_EMAIL,CHAPTERS_ES,STEPS_ES,OPTS_ES,ductVolumeDiscountRate,roundTo25} from './data.js';
import {Canvas,CashCount,Defs} from './canvas.js';

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

// QA FIX - direct feedback: "when you finish the system build, throw
// some easter eggs, fireworks, whatever... make it fun. were finally at
// the end." A one-shot confetti burst - absolutely positioned, pointer-
// events:none so it never blocks a click on whatever's underneath, and
// self-contained (the parent just mounts/unmounts it via a timeout, see
// celebrateBuild/celebratePrice in App). Piece count/colors are fixed,
// but each piece's fall path (left position, drift, spin, delay,
// duration) is randomized per mount - two bursts never look identical.
// QA FIX - unlike the app's short (<1s), low-amplitude one-shot mount
// transitions elsewhere (fadein/snap/splashRise), this is 46 pieces
// falling+drifting+spinning up to 720deg across the full screen for
// ~2.6s - squarely the kind of large-field motion prefers-reduced-motion
// exists for, not a borderline case. The confetti-piece className below
// is a pure CSS hook (styling stays exactly as before) so styles.css's
// prefers-reduced-motion block can hide the pieces outright, same
// treatment as rain/snow there and for the same reason (see that
// comment) - freezing 46 mid-fall/mid-spin pieces via animation:none
// alone would leave a scatter of static dots at random opacities/
// rotations, which reads as broken, not intentional.
// (Proprietary to Gold Eagle Services - GES-HVAC-CONFIGURATOR-PROVENANCE-ID: ges-live-system-2026-austin-tx)
function Confetti({count=46}){
  const pieces=useMemo(()=>{
    const colors=['var(--gl)','var(--gh)','#fff','#f0d64e','#d7b740'];
    return Array.from({length:count},(_,i)=>({
      id:i,
      left:Math.random()*100,
      delay:Math.random()*0.35,
      duration:1.6+Math.random()*0.9,
      size:5+Math.random()*5,
      drift:(Math.random()-0.5)*140,
      spin:(Math.random()>0.5?1:-1)*(360+Math.random()*360),
      color:colors[i%colors.length],
      round:i%2===0,
    }));
  },[count]);
  // QA FIX - print/PDF correctness: this had no `no-print` class (nor any
  // className at all), so hitting Save/Print during the ~2.6s celebration
  // window right after finishing a build or right after the price reveals
  // (both realistic - the confetti itself draws the eye to the screen at
  // the exact moment "Save/Print" is sitting right there in Quick Actions)
  // printed dozens of stray gold/white dots scattered across the diagram
  // page. Purely a one-shot on-screen flourish with no meaning on paper -
  // same category as the nav/button chrome .no-print already hides.
  return <div className="no-print" style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:50}} aria-hidden="true">
    {pieces.map(p=>(
      <span key={p.id} className="confetti-piece" style={{
        position:"absolute",top:-14,left:p.left+"%",
        width:p.size,height:p.size*(p.round?1:0.42),
        background:p.color,borderRadius:p.round?"50%":2,
        opacity:0,
        // QA FIX - direct feedback: "confetti that immediately drops to
        // the floor... kinda trash". The original curve here,
        // cubic-bezier(.24,.68,.3,1), is a steep ease-OUT: by just 24%
        // of the duration it's already 68% of the way through the fall,
        // so every piece rocketed to the bottom almost instantly and
        // then sat there motionless (still opacity:1) for the rest of
        // its ~2s before fading - exactly the "drops to the floor" look.
        // ease-in (slow start, accelerating) is the right direction for
        // something falling under gravity - pieces now visibly drift
        // down the WHOLE duration instead of snapping to rest.
        animation:`confettiFall ${p.duration}s cubic-bezier(.42,0,1,1) ${p.delay}s forwards`,
        "--confetti-drift":p.drift+"px","--confetti-spin":p.spin+"deg",
      }}/>
    ))}
  </div>;
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
  // QA FIX - direct feedback: "when you finish the system build, throw
  // some easter eggs, fireworks, whatever... make it fun. were finally at
  // the end." A one-shot confetti burst, fired once on genuinely
  // finishing a build and once on reaching the price reveal - refs (not
  // state) guard each so an EDIT chip round-trip back to either screen
  // never replays it; only a brand-new build (Start Over) resets these,
  // same as a fresh page load.
  const [celebrateBuild,setCelebrateBuild]=useState(false);
  const buildCelebratedRef=useRef(false);
  React.useEffect(()=>{
    if(!done||buildCelebratedRef.current)return;
    buildCelebratedRef.current=true;
    setCelebrateBuild(true);
    const t=setTimeout(()=>setCelebrateBuild(false),2600);
    return ()=>clearTimeout(t);
  },[done]);
  const [celebratePrice,setCelebratePrice]=useState(false);
  const priceCelebratedRef=useRef(false);
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
  // Analytics: build_completed fires exactly once per genuinely-new
  // completed build, from this single effect rather than inline at each
  // of goNext's two "reached done" call sites (quick-edit's own snap-back
  // finish, and the ordinary first-time-through finish). Two things that
  // call site approach got wrong, both worth spelling out:
  //  1) It read `answers` synchronously, in the same handler that could
  //     still have a just-queued setAnswers update pending (e.g. skip()
  //     sets the final step's value then immediately calls goNext() in
  //     the same tick) - React batches that update into the SAME render,
  //     but the handler's own local `answers` closure is still the
  //     pre-update value, so the very first completion of any build
  //     ending on a skipped step fired with that step's answer missing
  //     from the snapshot. An effect runs after the commit, so it always
  //     sees the fully-settled state.
  //  2) `done` can flip back to true with nothing actually changed - the
  //     done screen's own "Back" quick action (a plain nav button, not
  //     quick-edit) drops to the wizard's last step and clicking Finish
  //     there runs the exact same finish branch again. Firing on every
  //     true transition would double-count that as a second completed
  //     build. Guards on both an edge (only the false->true transition,
  //     not every render where done stays true - e.g. while pricingFlow
  //     changes underneath it) and a content signature (so a real
  //     quick-edit that changes the build still counts as its own
  //     completion, but poking Back then Finish with zero changes does
  //     not) - restart() resets the signature so a fresh build, even one
  //     that lands on identical picks, still fires.
  const lastTrackedBuildRef=useRef(null);
  const wasDoneRef=useRef(false);
  React.useEffect(()=>{
    if(done&&!wasDoneRef.current){
      const sig=JSON.stringify(answers);
      if(lastTrackedBuildRef.current!==sig){
        lastTrackedBuildRef.current=sig;
        trackBuildCompleted(answers);
      }
    }
    wasDoneRef.current=done;
  },[done,answers]);
  // Analytics: guards trackEvent calls that sit directly on a CTA whose own
  // click doesn't transition the app to a different screen/state (financing,
  // Save/Print, both email actions) - unlike Get Pricing/Get My Estimate/
  // Start Over/quick-edit, whose click unmounts or replaces the very button
  // just clicked (moving to the sizing flow, the result screen, the splash
  // screen, or the wizard) fast enough that a second real click of a genuine
  // double-click lands on nothing, these buttons/links stay exactly where
  // they were, doing nothing to the app's own state - so a second click
  // event landing within the same double-click gesture hits the identical
  // onClick handler again with nothing to stop it. Verified with Playwright:
  // a REAL .dblclick() (two separately-dispatched click events at native
  // double-click speed, not two same-tick synthetic clicks) reliably fired
  // financing_clicked/email_build_clicked/print_clicked
  // twice before this guard existed, double-counting one physical click as
  // two conversions/engagements - while pricing_started/price_revealed/
  // restart_clicked/quick_edit_used were already safe purely because their
  // own click moves the button out from under the second click in time.
  // Keyed by event name + params (not just name) so two DIFFERENT financing
  // options (were there more than one configured) clicked back to back each
  // still count - only a literal repeat of the exact same action within the
  // window is treated as one double-click, not two deliberate clicks.
  const lastCtaFireRef=useRef({});
  const trackCtaOnce=useCallback((name,params)=>{
    const key=name+'|'+JSON.stringify(params||{});
    const now=Date.now();
    if(now-(lastCtaFireRef.current[key]||0)<800)return;
    lastCtaFireRef.current[key]=now;
    trackEvent(name,params);
  },[]);
  // Snapshot of `answers` taken the instant a quick-edit begins (see
  // jumpToStep below) - restored by cancelQuickEdit if the homeowner backs
  // out via the banner's own "Cancel, back to build" link (or by backing
  // past the one step being edited, which the comment on that goBack
  // branch says is meant to behave identically). Every option pick applies
  // to `answers` immediately on click, everywhere in this app - there's no
  // separate "confirm" step - so without this, "Cancel" didn't actually
  // cancel anything: it silently kept whatever had just been clicked and
  // only backed out of quick-edit NAVIGATION, the same as Save & Return
  // would have, just without walking through any steps it invalidated. A
  // ref (not state) since it's write-once-per-edit/read-once-on-cancel and
  // never drives a render itself.
  const quickEditSnapshotRef=useRef(null);
  const cancelQuickEdit=useCallback(()=>{
    if(quickEditSnapshotRef.current)setAnswers(quickEditSnapshotRef.current);
    quickEditSnapshotRef.current=null;
    setQuickEdit(false);setDone(true);
  },[]);
  // Post-build pricing: null=not asked, 'sizing'=sub-questions,
  // 'leadgate'=waiting on the contact form, 'result'=estimate shown
  const [pricingFlow,setPricingFlow]=useState(null);
  const [pricingSubStep,setPricingSubStep]=useState(0);
  const [pricingAnswers,setPricingAnswers]=useState({});
  React.useEffect(()=>{
    if(pricingFlow!=='result'||priceCelebratedRef.current)return;
    priceCelebratedRef.current=true;
    setCelebratePrice(true);
    const t=setTimeout(()=>setCelebratePrice(false),2600);
    return ()=>clearTimeout(t);
  },[pricingFlow]);
  const topRef=useRef(null);
  // QA FIX - block:'start' forces topRef's top edge to align EXACTLY with
  // its scrolling ancestor's top on every call, even when it's already
  // fully in view - harmless when this app was the whole standalone page,
  // but now that it's always iframed, .app-root has nothing to scroll
  // WITHIN (the app's own layout is deliberately non-scrolling - see the
  // .attic-bar-body/.attic-info overflow:hidden comments), so the browser
  // escalates the request to the outer WordPress page instead, nudging
  // the ENTIRE PAGE on every Next click even when the iframe was already
  // fully visible - direct feedback: "when i push any button... it
  // slightly drops the screen down". block:'nearest' only scrolls when
  // something is actually out of view (e.g. the customer manually
  // scrolled the outer page away), a true no-op otherwise.
  const scrollTop=useCallback(()=>setTimeout(()=>topRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'}),50),[]);

  // Half-ton sizes (1.5/2.5/3.5) are a Federal Minimum-only catalog option -
  // Mid/High Efficiency only stock full tons (see the sizing sub-step's own
  // tonnageOptions, which mirrors this exactly - hoisted here so the guard
  // effect right below can share the identical rule instead of drifting
  // from a second copy of it).
  const tonnageOptionsForTier=useMemo(()=>
    answers.cond_tier==='fedmin'?TONNAGE_OPTIONS:TONNAGE_OPTIONS.filter(o=>Number.isInteger(o.tons))
  ,[answers.cond_tier]);
  // Quick-edit guard: a tonnage already picked at the OLD tier can be a
  // half-ton size Mid/High Efficiency doesn't stock. The sizing sub-step
  // itself already refuses to treat that as "answered" (canSubNext checks
  // against the CURRENT tonnageOptions), but that protection only fires if
  // the customer is actually standing on the sizing sub-step when the tier
  // changes. Reaching the tier question is also possible directly from the
  // PRICE REVEAL screen itself - clicking the condenser (or any other
  // edit-zone) in the live diagram calls jumpToStep, which (unlike
  // pickLocation/restart) never touches pricingFlow/pricingAnswers, since
  // most quick-edits have nothing to do with pricing and shouldn't discard
  // an already-confirmed sqft/ducts answer over an unrelated tweak (e.g.
  // swapping the thermostat or an add-on). Editing the tier is different:
  // calcEstimate's nearestTonnage() always finds SOME price to show even
  // when the picked size doesn't exist for the new tier - it silently
  // rounds to the closest one the tier actually stocks - so returning
  // straight to a 'result' screen after a tier quick-edit rendered a price
  // for a size the customer never actually confirmed, with nothing on
  // screen saying that substitution happened. This effect is the same
  // invariant as canSubNext, just re-checked the moment the tier itself
  // changes (from ANY path, not only the sizing sub-step): if the current
  // pick no longer has a matching card, send them back to sizing step 0 to
  // explicitly re-confirm a real size instead of quietly billing the
  // nearest one.
  React.useEffect(()=>{
    if(!pricingAnswers.tonnageChoice)return;
    if(tonnageOptionsForTier.some(o=>o.v===pricingAnswers.tonnageChoice))return;
    setPricingFlow(f=>f==='sizing'||f==='result'?'sizing':f);
    setPricingSubStep(0);
  },[tonnageOptionsForTier,pricingAnswers.tonnageChoice]);

  // QA FIX - the sizing sub-step's tonnage grid is `repeat(auto-fit,
  // minmax(...))` (both layouts - attic only switches to this below its
  // own 860px breakpoint), so its column count tracks container width
  // continuously, not a fixed number CSS can reason about at author time.
  // Federal Minimum's 7-option list (the only tier with half-tons, so the
  // only one that isn't a tidy 4) is prime - no column count from 2-6
  // divides it evenly - so at MOST widths the last "5 Tons" card lands
  // alone in its own final row with a dead gap beside it, the same
  // orphaned-grid-item look .done-review-grid's own last-child rule
  // already exists to fix elsewhere on this screen. That fix works there
  // because its column count is hardcoded (2 or 5); this grid's isn't, so
  // a blind nth-child parity rule would be right at some widths and wrong
  // at others (spot-checked 3/4/5/6-column results at 420-860px - only
  // 3 and 6 columns actually strand the last card alone, 4 and 5 don't).
  // Measuring the real rendered layout instead of guessing at it: group
  // every card into rows by its own top offset, and any row that ends up
  // with exactly one card in it gets grid-column:1/-1 to fill the row
  // instead of leaving a dead gap beside it. Re-measures on resize
  // (ResizeObserver) and whenever the option count/layout could change
  // the column math.
  // QA FIX - the original version of this only ever compared the LAST
  // two cards' offsetTop, so it could only fix an orphan on the grid's
  // final row. With exactly 4 tonnage options at a 2-column width this
  // grid lands as rows of [2,1] then [1] - the SECOND row's lone card
  // (not the last row) was left stranded with a dead gap beside it,
  // since only the true last card (a different row entirely) ever
  // qualified for the fix. Reproduced at 380-500px on both closet and
  // narrow-attic layouts by an automated QA pass. Switched from a single
  // boolean to a Set of every orphaned card's own index, built by
  // grouping ALL children into rows first rather than just checking the
  // last two.
  const sqftGridRef=useRef(null);
  const [sqftGridOrphans,setSqftGridOrphans]=useState(()=>new Set());
  React.useEffect(()=>{
    const el=sqftGridRef.current;
    if(!el||typeof ResizeObserver==='undefined')return;
    const measure=()=>{
      const kids=Array.from(el.children);
      if(kids.length<2){setSqftGridOrphans(new Set());return;}
      const rows=[];
      for(let i=0;i<kids.length;i++){
        const top=kids[i].offsetTop;
        const row=rows.find(r=>r.top===top);
        if(row)row.indices.push(i);
        else rows.push({top,indices:[i]});
      }
      const orphans=new Set();
      for(const row of rows)if(row.indices.length===1)orphans.add(row.indices[0]);
      setSqftGridOrphans(orphans);
    };
    measure();
    const ro=new ResizeObserver(measure);
    ro.observe(el);
    return ()=>ro.disconnect();
    // isAtticMode isn't in this list - it's declared further down in this
    // component (after `loc` is derived) and a location swap always
    // resizes/remounts the grid's own container anyway, which the
    // ResizeObserver already reacts to on its own.
    //
    // QA FIX - doneVisible IS needed here, though. It flips true in its
    // own effect one render AFTER `done` does (see the comment on
    // doneVisible above) rather than synchronously in the same commit -
    // so on a resumed build whose saved state already has pricingFlow
    // 'sizing' (resumeBuild sets done/pricingFlow/pricingSubStep all in
    // one batch), the very first commit where those three match their
    // resumed values still has doneVisible false and the done-screen
    // (this grid included) not yet mounted - sqftGridRef.current is null,
    // this effect bails out having never called ResizeObserver.observe(),
    // and doneVisible's own later flip to true - the render that actually
    // mounts the grid - doesn't re-run this effect because none of ITS
    // deps changed. Reproduced via a direct resumeBuild() into
    // pricingFlow:'sizing': the last card's grid-column style stayed
    // unset indefinitely (checked out past 3s) until doneVisible was
    // added here. A fresh completion doesn't hit this (doneVisible is
    // already stable true by the time "Get Pricing" sets pricingFlow),
    // but a resumed one reliably does.
  },[tonnageOptionsForTier,pricingSubStep,pricingFlow,doneVisible]);

  // ─── LANGUAGE TOGGLE (EN/ES) ────────────────────────────────
  // Scoped translation - see the big comment on CHAPTERS_ES/STEPS_ES/
  // OPTS_ES in data.js for exactly what is and isn't covered. tr(en,es)
  // is used inline everywhere a literal string appears in this file;
  // STEPS/getOpts content (data-driven, not literal JSX text) is
  // overlaid from the ES_* tables instead - see `t` and `opts` below.
  const [lang,setLang]=useState(()=>{
    try{return localStorage.getItem('gesLang_v1')==='es'?'es':'en';}catch(e){return 'en';}
  });
  const tr=(en,es)=>lang==='es'&&es!==undefined?es:en;
  // QA FIX - every price figure on this screen (hero /mo, hero total,
  // itemized line items, the two add-on checkboxes, and the emailed/
  // printed copies of all of these) called n.toLocaleString() with no
  // locale argument, which formats against the VISITOR'S BROWSER/OS
  // locale, not this app's own Spanish toggle - the one thing on this
  // screen that toggle doesn't actually control. Harmless for the
  // enormous majority of real visitors (es-MX/es-US format identically to
  // en-US: comma thousands, period decimal - confirmed via
  // Number.prototype.toLocaleString), but a visitor whose OS/browser is
  // set to Spain Spanish (es-ES, period thousands/comma decimal) or any
  // other differently-formatting locale would see numbers that don't
  // match the grouping the rest of the Spanish page uses, entirely
  // independent of which language THIS SITE is actually showing them in.
  // Pinning to the site's own toggle instead of the visitor's ambient OS
  // locale is what every other Spanish string on this screen already
  // does.
  const fmtPrice=n=>n.toLocaleString(lang==='es'?'es-MX':'en-US');
  React.useEffect(()=>{
    try{localStorage.setItem('gesLang_v1',lang);}catch(e){}
    try{document.documentElement.lang=lang;}catch(e){}
  },[lang]);

  // Contact-form gate: sits right at "Get Pricing" (before the sizing
  // questions even start), not at the price reveal itself - see where
  // leadUnlocked is checked in the Get Pricing button's onClick below.
  // Skipped entirely (leadUnlocked stays true) when
  // GATE_CONFIG.gravityFormId is unset - see the comment on GATE_CONFIG
  // in data.js. THREE independent detection paths listen for the
  // Gravity Forms submission:
  //  1) Same-origin direct access - if this widget is embedded via
  //     <iframe> on the same domain as the WordPress page, the browser
  //     allows reaching into window.parent directly, so this binds
  //     Gravity Forms' own gform_confirmation_loaded jQuery event
  //     straight off the parent document.
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
  //  3) QA FIX - a redirect query param, checked once on mount. Paths 1
  //     and 2 both depend on Gravity Forms submitting via AJAX, so its
  //     confirmation HTML swaps in without a real page navigation and
  //     that jQuery event actually fires. Direct feedback from a live
  //     deploy: "filled it out, the page refreshed, and still wont let
  //     me through" - confirmed the form was NOT in AJAX mode there, so
  //     gform_confirmation_loaded never fires at all, no matter how this
  //     widget is embedded, and the gate is stuck permanently (the
  //     unlock that persists it to localStorage never runs). This path
  //     needs no AJAX, no iframe, no same-origin access and no WordPress
  //     snippet - only a native Gravity Forms setting: set Form 9's
  //     Confirmation to "Redirect to a URL" -> the SAME page's URL with
  //     `?ges_lead=1` appended (e.g. https://yoursite.com/build/?ges_lead=1).
  //     On load, a real navigation to that URL is checked directly via
  //     window.location.search (covers this widget being pasted straight
  //     into the page, not just iframed) and, same-origin, via
  //     window.parent.location.search (covers the iframe case, where the
  //     redirect lands on the PARENT page carrying the iframe, which then
  //     reloads too since the whole parent document navigated). Also
  //     works as a graceful assist even WHEN AJAX is on on, so it's safe
  //     to always check, not just as a fallback.
  const [leadUnlocked,setLeadUnlocked]=useState(()=>!GATE_CONFIG.gravityFormId||hasSubmittedLead());
  // QA FIX - direct feedback: a SECOND ?ges_lead=1 arrival (the customer
  // re-submits the form from the sizing/result screen, or re-opens the
  // redirect URL/email link after already unlocking) used to hit the
  // effect below's own `||leadUnlocked` early return before the param was
  // even checked - leadUnlocked initializes true from hasSubmittedLead()
  // on this remount, so the check, the resume, and stripParam all got
  // skipped, leaving the stale param in the address bar and "Resume My
  // Build?" showing again instead of silently landing back on the build.
  // This ref makes the param check itself run exactly once per page load
  // regardless of unlock state - unlock()/trackLead below still only fire
  // when not already unlocked, so a repeat arrival never double-reports.
  const gesLeadCheckedRef=useRef(false);
  React.useEffect(()=>{
    if(!GATE_CONFIG.gravityFormId||gesLeadCheckedRef.current)return;
    gesLeadCheckedRef.current=true;
    const unlock=()=>{
      if(hasSubmittedLead())return;
      markLeadSubmitted();setLeadUnlocked(true);trackLead({form_id:GATE_CONFIG.gravityFormId});
    };
    // QA FIX - direct feedback from a live deploy: the ?ges_lead=1 path
    // (see path 3's own comment above) means a REAL full-page reload just
    // happened, which wipes React state - autosave had already captured
    // the in-progress build (including pricingFlow:'leadgate') right
    // before the Gravity Forms navigation away, so on remount that saved
    // build is sitting behind the "Resume My Build?" prompt (resumePending
    // starts true whenever a saved build exists - see its own useState
    // above). The customer never actually abandoned anything; they just
    // did exactly what the gate asked. Making them click ANOTHER button
    // to get back to where they were read, in practice, as "it's just
    // stuck" - resumeBuild() runs the exact same restore resumePending's
    // own button would, so this skips straight past that extra prompt
    // only for this specific "just returned from the lead form" case (the
    // jQuery/postMessage paths below never trigger a real reload, so
    // there's no stray prompt to skip for those).
    const unlockAndResume=()=>{
      unlock();
      if(resumePending)resumeBuild();
    };
    const stripParam=loc=>{
      try{
        const url=new URL(loc.href);
        if(!url.searchParams.has('ges_lead'))return;
        url.searchParams.delete('ges_lead');
        loc===window.location?
          window.history.replaceState(null,'',url.pathname+url.search+url.hash):
          window.parent.history.replaceState(null,'',url.pathname+url.search+url.hash);
      }catch(e){/* replaceState best-effort only - never block the unlock over it */}
    };
    if(new URLSearchParams(window.location.search).get('ges_lead')==='1'){
      unlockAndResume();stripParam(window.location);
    }else{
      try{
        if(window.parent&&window.parent!==window&&
          new URLSearchParams(window.parent.location.search).get('ges_lead')==='1'){
          unlockAndResume();stripParam(window.parent.location);
        }
      }catch(e){/* cross-origin - window.parent.location access throws */}
    }
  },[]);
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
  // QA FIX - the gate now embeds the Gravity Form directly in its own
  // <iframe> (GATE_CONFIG.embedFormUrl - see that constant's own comment
  // in data.js for why) rather than depending on the form living
  // somewhere else on the WordPress page. Detection here is same-origin
  // access straight into the iframe's own document/window, polled while
  // the gate is showing, watching for EITHER of the two shapes a
  // Gravity Forms submission can take inside it:
  // (Proprietary lead-gate logic - Gold Eagle Services, GES-HVAC-CONFIGURATOR-PROVENANCE-ID: ges-live-system-2026-austin-tx)
  //  - a plain Text confirmation swaps in inline, same document, no
  //    navigation - caught by the .gform_confirmation_wrapper check.
  //  - Confirmation Type "Redirect to a URL" (what Form 9 actually uses)
  //    navigates the IFRAME ITSELF to a real new page instead - direct
  //    feedback confirmed exactly this: "it filled out the form, it sent
  //    the form to my office email, it just didnt go to the next page" -
  //    the submission genuinely worked, but the resulting page (this
  //    same widget, reloaded inside its own grandchild iframe) has no
  //    .gform_confirmation_wrapper anywhere on it, so the check above
  //    alone never caught it. Since the redirect target already carries
  //    ?ges_lead=1 (the same param path 3 above uses for the
  //    non-embedded case), checking the iframe's OWN location for that
  //    param catches it too - this is the one place that can actually
  //    see it: it lands three frames deep (this iframe, not the outer
  //    widget or the WordPress page above it), invisible to the
  //    window.location/window.parent.location checks earlier, which
  //    only ever look at their own level and one level up.
  const leadIframeRef=useRef(null);
  // Direct feedback: the embedded form flashed bright white for about a
  // second before the dark styling below kicked in. It now stays invisible
  // (a quiet "Loading the form..." line shows instead) until the dark
  // styles are injected, then fades in - and the styling is applied as
  // soon as the form's markup exists, not only after every image and
  // script on that page finishes loading (the iframe's onLoad).
  const [leadFormShown,setLeadFormShown]=useState(false);
  const styleLeadForm=()=>{
    let ok=false;
    try{
      const doc=leadIframeRef.current&&leadIframeRef.current.contentDocument;
      // wait for the real form page (not the iframe's initial about:blank)
      // and for the form markup itself to exist before styling/revealing
      if(!doc||!doc.head||!doc.body||doc.location.href==='about:blank'||!doc.querySelector('.gform_wrapper,form'))return false;
      // Direct feedback: the form's bright white fields and
      // grey Submit were harsh after the dark tool. Same-origin,
      // so dim them to match - injected here so it applies
      // whichever WordPress page hosts the form, and re-applied
      // on every load (Gravity Forms' own validation reload too).
      if(doc&&doc.head&&!doc.getElementById('ges-dark-form')){
        const st=doc.createElement('style');st.id='ges-dark-form';
        st.textContent=`html,body{background:transparent!important}
.gform_wrapper input:not([type=submit]):not([type=button]):not([type=hidden]),.gform_wrapper select,.gform_wrapper textarea{background:#26282b!important;color:#e8e4d8!important;border:1px solid rgba(215,183,64,.28)!important;border-radius:4px!important;box-shadow:none!important}
.gform_wrapper input:focus,.gform_wrapper select:focus,.gform_wrapper textarea:focus{outline:none!important;border-color:rgba(215,183,64,.7)!important;background:#2c2e32!important}
.gform_wrapper input::placeholder,.gform_wrapper textarea::placeholder{color:#8b877c!important}
.gform_wrapper input:-webkit-autofill{-webkit-box-shadow:0 0 0 40px #26282b inset!important;-webkit-text-fill-color:#e8e4d8!important}
.gform_wrapper .gfield_label,.gform_wrapper .gform-field-label,.gform_wrapper label{color:#d9d4c7!important}
.gform_wrapper .gform_button,.gform_wrapper input[type=submit],.gform_wrapper button[type=submit]{background:#b8973a!important;color:#141414!important;border:1px solid #b8973a!important;font-weight:600!important;border-radius:4px!important}
.gform_wrapper .gform_button:hover,.gform_wrapper input[type=submit]:hover{background:#c9a646!important}`;
        doc.head.appendChild(st);
        // a validation reload (e.g. a missed required field) swaps in a new
        // unstyled page - hide it again until that one is styled too
        try{doc.defaultView.addEventListener('pagehide',()=>setLeadFormShown(false));}catch(e){}
      }
      const h=doc&&doc.body&&doc.body.scrollHeight;
      if(h&&leadIframeRef.current)leadIframeRef.current.style.height=Math.min(Math.max(h,180),900)+'px';
      ok=true;
    }catch(e){/* cross-origin - can't style it; just show it */ok=true;}
    if(ok)setLeadFormShown(true);
    return ok;
  };
  React.useEffect(()=>{
    if(pricingFlow!=='leadgate'||!GATE_CONFIG.embedFormUrl){setLeadFormShown(false);return;}
    setLeadFormShown(false);
    const t=setInterval(()=>{if(styleLeadForm())clearInterval(t);},60);
    // never leave the form invisible: reveal after 4s whatever happens
    const fb=setTimeout(()=>{clearInterval(t);setLeadFormShown(true);},4000);
    return()=>{clearInterval(t);clearTimeout(fb);};
  },[pricingFlow]);
  React.useEffect(()=>{
    if(!GATE_CONFIG.gravityFormId||!GATE_CONFIG.embedFormUrl||leadUnlocked||pricingFlow!=='leadgate')return;
    const check=()=>{
      try{
        const win=leadIframeRef.current&&leadIframeRef.current.contentWindow;
        const doc=win&&win.document;
        if(doc&&doc.querySelector('.gform_confirmation_wrapper,[id*="gform_confirmation_wrapper"]')){
          markLeadSubmitted();setLeadUnlocked(true);trackLead({form_id:GATE_CONFIG.gravityFormId});
          return;
        }
        if(win&&new URLSearchParams(win.location.search).get('ges_lead')==='1'){
          markLeadSubmitted();setLeadUnlocked(true);trackLead({form_id:GATE_CONFIG.gravityFormId});
        }
      }catch(e){/* cross-origin - shouldn't happen for a same-domain embed, never break the gate over it */}
    };
    const id=setInterval(check,600);
    check();
    return ()=>clearInterval(id);
  },[leadUnlocked,pricingFlow]);
  // Moves straight into the sizing questions the instant the gate
  // unlocks, whether that's one of the effects above detecting a real
  // submission mid-wait or the gate never having been shown at all this
  // session (returning with it already unlocked from a previous visit).
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
    let i=activeSteps.findIndex(s=>s.id===id);
    // Mid Efficiency hides the system_for step (dual fuel is forced, see
    // its showIf) but the review grid still shows the forced "Heat source"
    // row with an EDIT button - which silently did nothing, since the step
    // isn't in activeSteps. The tier pick is what actually decides it, so
    // send that EDIT there instead.
    if(i<0&&id==='system_for')i=activeSteps.findIndex(s=>s.id==='cond_tier');
    if(i>=0){trackEvent('quick_edit_used',{step_id:id});quickEditSnapshotRef.current=answers;setDone(false);setStepIdx(i);setQuickEdit(true);}
  },[activeSteps,answers]);
  // Splash-card pick - the real start of the funnel. Landing on the splash
  // screen doesn't itself mean engagement (a bounced visitor never fires
  // this), but committing to a location does.
  // Also resets the pricing flow (mirroring restart()'s own reset of the
  // same three pieces of state) - reaching the splash screen isn't only
  // possible via restart()'s "Start Over" button, it's also reachable by
  // walking the wizard's own Back button out past step 1 (goBack's
  // location-clearing branch above) after having gotten partway or all the
  // way through a PREVIOUS build's pricing flow. Without this, that old
  // pricingFlow/pricingSubStep/pricingAnswers state survived untouched
  // into the brand-new build that follows - its own done screen skipped
  // straight to the previous build's stale price/result panel (or a
  // mid-sizing sub-step) instead of the ordinary review grid with a
  // fresh "Get Pricing" button, the first time it was reached.
  // QA FIX - this used to only setA("location",loc), merging the new
  // location into whatever `answers` already held instead of starting a
  // clean build. That's invisible the very first time (answers is already
  // the bare defaultAnswers() then), but repro: start an Attic build, pick
  // Furnace, back out all the way to the splash screen (fully reachable
  // mid-build via the wizard's own Back button, not just Start Over), then
  // pick Closet Upflow instead. indoor_type has no per-location showIf, so
  // the brand-new Closet build's very first question landed with "Furnace"
  // already selected - a real leftover answer from the abandoned Attic
  // build, not a default. Resetting the whole answers object here (same
  // defaultAnswers() restart() already uses) means every pickLocation
  // always starts genuinely clean.
  const pickLocation=loc=>{trackEvent('wizard_started',{location:loc});setAnswers({...defaultAnswers(),location:loc});setStepIdx(1);setPricingFlow(null);setPricingSubStep(0);setPricingAnswers({});};
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
      // Air handlers have no furnace to pair with, so clear a leftover
      // system_for value instead of leaving a stale "Heat source" row in
      // the review grid. insulation/furnace_eff stay untouched either way
      // now - insulation is asked regardless of indoor_type (it's the
      // attic's own construction, not the furnace's), so switching indoor
      // types shouldn't clear an already-answered pick.
      else if(v==='ah') delete next.system_for;
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
      if(i>=activeSteps.length){quickEditSnapshotRef.current=null;setQuickEdit(false);setDone(true);scrollTop();}
      else{setStepIdx(i);scrollTop();}
      return;
    }
    // Funnel visibility per step, first-time-through only (quick-edit's own
    // branch above skips this - re-editing an already-answered step isn't
    // new progress through the wizard, and would double-count the same
    // step_id every time someone tweaks an earlier answer).
    if(cur)trackEvent('step_completed',{step_id:cur.id,step_number:stepIdx+1,total_steps:activeSteps.length});
    if(stepIdx<activeSteps.length-1){setStepIdx(s=>s+1);scrollTop();}else{setDone(true);scrollTop();}
  };
  const goBack=()=>{
    if(stepIdx>0){
      const next=stepIdx-1;
      // Stepping back past the first real question returns to the actual
      // splash screen (clearing location, which is what keeps it hidden)
      // instead of a bare duplicate of the location question rendered
      // inline in the wizard chrome.
      if(next===0){
        // Quick-edit should stay scoped to the one answer being edited
        // rather than unwind all the way back to the start of the whole
        // build - landing on stepIdx 0 still hit that same bare inline
        // location step (plus a stray "STEP 0 OF n" label, since location
        // is deliberately left out of every step count elsewhere - see
        // chapterCounts above), just one Back click later than the
        // non-quick-edit case. Cancels out of quick-edit back to the done
        // screen instead, exactly like the quickedit-banner's own
        // "Cancel, back to build" link.
        if(quickEdit){cancelQuickEdit();scrollTop();return;}
        // clearSavedBuild() alongside clearing location: the autosave
        // effect below only writes while answers.location is truthy (so a
        // fresh page load with no pick yet never persists "nothing"),
        // which means clearing location here silently stops autosave from
        // ever overwriting localStorage again - the LAST real save (still
        // holding the old location) is left behind. Without this, backing
        // all the way out to the splash screen and reloading resurrected a
        // "Resume My Build?" prompt for a build the user had just
        // explicitly abandoned by backing out of it.
        setA('location',null);clearSavedBuild();
      }
      setStepIdx(next);
      scrollTop();
    }
  };
  // Skipping a multi-select step means "none of the optional extras" - but
  // for purif specifically, the enhanced filtration cabinet ships standard
  // on every install regardless (see defaultAnswers/hasAprilaire), so
  // skipping it must not wipe that default out along with the real
  // optional picks (UV/ionizer/surge). Every other multi step (dehu) has
  // no such standard-included default, so [] is still correct there.
  const skip=()=>{if(cur.multi)setA(cur.id,cur.id==='purif'?['aprilaire']:[]);goNext();};
  const restart=()=>{
    trackEvent('restart_clicked');
    clearSavedBuild();setAnswers(defaultAnswers());setStepIdx(0);setDone(false);setQuickEdit(false);
    setPricingFlow(null);setPricingSubStep(0);setPricingAnswers({});
    // Clears the build_completed dedup guard too - a genuinely fresh build
    // (even one that happens to land on the exact same picks as the one
    // just abandoned) is its own real completion and must still fire.
    lastTrackedBuildRef.current=null;
    // Same for the confetti celebration guards - a fresh build deserves
    // its own celebration when it finishes, not silence because the
    // abandoned build already used up the one-time flag.
    buildCelebratedRef.current=false;
    priceCelebratedRef.current=false;
  };
  const resumeBuild=()=>{
    const savedAnswers=savedBuild.answers||{};
    setAnswers(savedAnswers);
    // Clamp to the range of steps that actually apply to the saved
    // answers (same showIf-filtered list the resume prompt's own preview
    // text above already computes as `savedSteps`) rather than trusting
    // savedBuild.stepIdx as-is - a stale/tampered/out-of-range value
    // (e.g. localStorage edited by hand, or left over from a build of
    // this app with a different step count) landed on activeSteps[idx]
    // being undefined: no crash, but `cur` stayed undefined forever, so
    // the step rendered fully blank (no question, no options) with only
    // a permanently-disabled Next button and no way out except clicking
    // Back hundreds of times back down into range.
    const savedSteps=STEPS.filter(s=>!s.showIf||s.showIf(savedAnswers));
    // QA FIX - automated pass found a hand-corrupted (non-numeric-string)
    // stepIdx sails past the `||0` fallback (a truthy string stays as-is)
    // and turns Math.max/min's result into NaN, which is worse than the
    // original bug this clamp exists to prevent: activeSteps[NaN] is
    // undefined same as any other out-of-range index, but stepIdx>0 is
    // also false for NaN, so the Back button doesn't even render - a
    // total dead end with no recovery at all. Number(...)||0 coerces any
    // non-finite-number input (a garbage string, null, undefined) to 0
    // before the existing clamp runs, same as the pre-existing fallback
    // already did for the falsy cases.
    const rawIdx=Number(savedBuild.stepIdx)||0;
    const clampedIdx=Math.min(Math.max(rawIdx,0),Math.max(savedSteps.length-1,0));
    setStepIdx(clampedIdx);
    setDone(!!savedBuild.done);
    setPricingFlow(savedBuild.pricingFlow||null);
    // QA FIX - same class of bug as clampedIdx just above, caught by an
    // automated QA pass: a build saved while pricingSubStep was 1 (the
    // old "want duct replacement priced too?" sub-step, removed in this
    // pass - see the sizing sub-flow's own subSteps=['sqft'] below) left
    // pricingSubStep stuck at a now out-of-range value on resume.
    // subSteps[1] is undefined, so that screen's question body rendered
    // fully blank with a permanently-disabled Next button and no way
    // forward except Back, which drops the whole pricing flow. The
    // sizing sub-flow is a single step now, so 0 is the only valid value
    // regardless of what was saved - trusting savedBuild.pricingSubStep
    // as-is here was exactly the "stale/tampered/out-of-range value"
    // mistake clampedIdx was already written to guard against for
    // stepIdx, just not extended to this sibling field.
    setPricingSubStep(0);
    setPricingAnswers(savedBuild.pricingAnswers||{});
    setResumePending(false);
    // Resuming straight into an already-completed saved build (the person
    // finished it in an earlier visit, then reloaded/came back) is not a
    // new completion - pre-arm both refs the build_completed effect above
    // reads so its done:false->true edge, when it runs after this render,
    // finds the build already accounted for instead of firing again for
    // work that happened last session.
    if(savedBuild.done){
      wasDoneRef.current=true;
      lastTrackedBuildRef.current=JSON.stringify(savedAnswers);
    }
  };
  const discardSavedBuild=()=>{clearSavedBuild();setResumePending(false);};

  React.useEffect(()=>{
    if(resumePending||!answers.location)return;
    saveBuild({answers,stepIdx,done,pricingFlow,pricingSubStep,pricingAnswers});
  },[answers,stepIdx,done,resumePending,pricingFlow,pricingSubStep,pricingAnswers]);

  const opts=useMemo(()=>{
    const base=cur?getOpts(cur.id,answers):[];
    if(lang!=='es')return base;
    const overrides=OPTS_ES[cur.id]||{};
    // insulation's override is a function of the live answers (its desc
    // varies by indoor_type - see its own comment in data.js), not the
    // plain {label,desc} object every other step's override is.
    return base.map(o=>{
      const ov=overrides[o.v];
      if(!ov)return o;
      return {...o,...(typeof ov==='function'?ov(answers):ov)};
    });
  },[cur,answers,lang]);
  // Translated question/hint for the current step, falling back to the
  // English STEPS content when no Spanish override exists for that id.
  const curQ=cur?(lang==='es'&&STEPS_ES[cur.id]?STEPS_ES[cur.id].q:cur.q):"";
  // insulation's own base hint mentions furnace efficiency ("if you have
  // one") - true and harmless for a furnace build, but an air-handler
  // build has no furnace at all, so it shouldn't come up even
  // conditionally worded. Same air-handler carve-out as infoTextId/
  // insulation_ah and REACTION.insulation above.
  const curHint=cur?(cur.id==='insulation'&&answers.indoor_type!=='furnace'
    ?tr("Determines your attic's construction and your system's efficiency.","Determina la construcción de su ático y la eficiencia de su sistema.")
    :(lang==='es'&&STEPS_ES[cur.id]?STEPS_ES[cur.id].hint:cur.hint)):"";
  // "location" is stepIdx 0 and deliberately left out of every step count
  // elsewhere (chapterCounts above, totalSteps itself) - normally that's
  // moot, since location only ever renders as the splash screen, which has
  // no step counter at all. Quick-editing it from the done screen's review
  // grid (jumpToStep('location')) is the one path that lands stepIdx on 0
  // for real, which used to print a bare, nonsensical "STEP 0 OF n" - the
  // same stray-counter problem goBack's own stepIdx-0 special case (above)
  // was written to avoid for the Back-button path, just missed here since
  // jumpToStep reaches stepIdx 0 directly instead of going through goBack.
  // Blank instead of a number that was never meant to be shown.
  const stepCountText=cur&&cur.id!=='location'?tr('STEP','PASO')+" "+stepIdx+(totalKnown?" "+tr('OF','DE')+" "+totalSteps:""):"";
  const chapterNames=lang==='es'?CHAPTERS_ES:CHAPTERS;

  // Screen-reader announcement of what changed - the wizard's question text
  // (and the diagram building alongside it) only ever changes visually
  // today; nothing tells a non-visual user a new step loaded after they hit
  // Next/Back, so they'd have to go hunting for the new question by touch.
  // Rendered into a persistent, visually-hidden aria-live region below
  // (kept OUTSIDE the per-step key={stepIdx} remounted nodes so the region
  // itself is never torn down - only its text content changes, which is
  // what actually triggers an announcement). Scoped to just the question
  // text, not the full option list, so it reads once per step instead of
  // rattling off every option's label on every render.
  const liveMessage=done
    ?tr('Your system is built. Review your selections below.','Su sistema está construido. Revise sus selecciones abajo.')
    :(cur&&cur.id!=='location'?(stepCountText?stepCountText+". ":"")+curQ:"");

  // Review-grid item list - what the done screen's review grid shows,
  // pulled out to component level (was inline inside the review-grid JSX
  // below) so the same list can also drive the "Email My Build" plain-
  // text summary without duplicating these ten branches a second time.
  const reviewItems=useMemo(()=>{
    const es=lang==='es';
    return[
      {step:"location",label:tr("Location","Ubicación"),val:answers.location==="attic"?tr("Attic horizontal","Ático horizontal"):answers.location==="closet"?tr("Upflow closet","Clóset ascendente"):null},
      {step:"indoor_type",label:tr("Indoor unit","Unidad interior"),val:answers.indoor_type==="furnace"?tr("Gas furnace","Horno a gas"):answers.indoor_type==="ah"?tr("Air handler","Manejador de aire"):null},
      // AFUE only means anything for a furnace - an air handler still
      // answers this step (attic construction shows in the diagram either
      // way), but the row drops the AFUE suffix since there's no furnace
      // for it to describe.
      answers.furnace_eff?{step:"insulation",label:tr("Insulation","Aislamiento"),val:answers.indoor_type==="furnace"
        ?(answers.furnace_eff==="e90"?tr("Spray foam - 90% AFUE","Espuma aislante - 90% AFUE"):tr("Fiberglass - 80% AFUE","Fibra de vidrio - 80% AFUE"))
        :(answers.furnace_eff==="e90"?tr("Spray foam","Espuma aislante"):tr("Fiberglass","Fibra de vidrio"))}:null,
      {step:"plenum",label:tr("Plenum","Plenum"),val:answers.plenum==="ductboard"?tr("New ductboard plenum","Nuevo plenum de ductboard"):answers.plenum==="metal"?tr("New sheet metal plenum","Nuevo plenum de lámina metálica"):answers.plenum==="none"?tr("Keep existing plenum","Conservar el plenum actual"):null},
      // QA FIX - a fresh-eyes copy/IA pass caught this grid's row order
      // not matching the wizard's own chapter order (THE BASICS -> THE
      // ENGINE -> COMFORT, CHAPTERS in data.js): cond_tier/system_for
      // (both "THE ENGINE," asked right after plenum) used to sit AFTER
      // thermostat/purif (both "COMFORT," asked later) - so the final
      // summary demoted efficiency tier and heat source, the two
      // biggest cost/decision drivers, below a thermostat pick and a
      // filter add-on, in an order matching neither how the customer
      // answered nor the app's own chapter grouping. Moved up to sit
      // right after plenum, same order as the wizard itself.
      {step:"cond_tier",label:tr("Efficiency","Eficiencia"),val:answers.cond_tier==="fedmin"?tr("Federal Minimum - 14.3 SEER2","Mínimo Federal - 14.3 SEER2"):answers.cond_tier==="mid_ge15"?tr("Mid Efficiency - 18 SEER2","Eficiencia Media - 18 SEER2"):answers.cond_tier==="high_ge18"?tr("High Efficiency - 21 SEER2","Alta Eficiencia - 21 SEER2"):null},
      answers.system_for?{step:"system_for",label:tr("Heat source","Fuente de calor"),
        val:answers.system_for==="hp"?tr("Dual Fuel - heat pump + furnace","Combustible Dual - bomba de calor + horno"):tr("Straight cool - furnace only","Solo enfriamiento - horno únicamente"),
        short:answers.system_for==="hp"?tr("Dual Fuel (HP + furnace)","Combustible Dual (BC + horno)"):tr("Straight Cool (furnace)","Solo Enfriamiento (horno)")}:null,
      {step:"thermostat",label:tr("Thermostat","Termostato"),
        val:answers.thermostat==="wifi"?tr("Wi-Fi smart thermostat","Termostato inteligente Wi-Fi"):answers.thermostat==="basic"?tr("Basic programmable","Programable básico"):answers.thermostat==="proprietary"?tr("Communicating Thermostat","Termostato comunicante"):null,
        short:answers.thermostat==="wifi"?tr("Wi-Fi smart","Wi-Fi inteligente"):answers.thermostat==="basic"?tr("Basic programmable","Programable básico"):answers.thermostat==="proprietary"?tr("Communicating","Comunicante"):null},
      Array.isArray(answers.purif)&&answers.purif.length>0?{step:"purif",label:tr("Add-ons","Complementos"),
        val:answers.purif.map(v=>v==="aprilaire"?tr("Enhanced Filtration Cabinet","Gabinete de filtración mejorada"):v==="uv"?tr("UV Light","Luz UV"):v==="ionizer"?tr("Ionizer","Ionizador"):v==="surge"?tr("Surge protector","Protector de sobrevoltaje"):v).join(" + "),
        // Aggressively shortened vs. val above - by the review grid, the
        // wizard's own step copy and the gold section header have already
        // explained what each of these is, so the grid itself just needs
        // to name it, not describe it (direct feedback: the long strings
        // were wrapping the review-grid boxes awkwardly).
        short:answers.purif.map(v=>v==="aprilaire"?tr('5" Filter','Filtro 5"'):v==="uv"?tr("UV","UV"):v==="ionizer"?tr("Ionizer","Ionizador"):v==="surge"?tr("Surge","Sobrevoltaje"):v).join(" + ")}:null,
      // Dehu/ERV now live on one merged step (id "dehu", "Want to enhance
      // your IAQ?") instead of a Yes/No dehumidifier question plus a
      // separate "final add-ons" step - condensate pump was dropped
      // entirely (direct feedback: "getting rid of it... cleans up a few
      // things"). One step, one answer array, one ordinary review-grid
      // row - the old `parts`-array/multi-EDIT-button machinery this used
      // to need (to keep two separate wizard steps both editable from one
      // merged box) is gone too, since there's only one step to jump back
      // to now. Matches the purif row's own pattern exactly.
      // QA FIX - a fresh-eyes UX pass caught "IAQ" as an unexplained
      // acronym nowhere spelled out in the UI (the wizard step's own
      // question already dropped it - see that field's own comment).
      // "Air quality" instead - notably SHORTER than "IAQ add-ons" in
      // English (11 vs 12 chars) and "Calidad del aire" shorter than
      // "Complementos de CAI" in Spanish too (16 vs 20 chars), so this
      // stays safely inside the tight width this row was already tuned
      // to in closet mode (see the "Shrink closet IAQ add-ons review
      // row" fix this same label used to need).
      Array.isArray(answers.dehu)&&answers.dehu.length>0?{step:"dehu",label:tr("Air quality","Calidad del aire"),
        val:answers.dehu.map(v=>v==="dehu"?tr("Whole-home dehumidifier","Deshumidificador para toda la casa"):v==="erv"?"ERV":v).join(" + "),
        short:answers.dehu.map(v=>v==="dehu"?tr("Dehu","Deshu"):v==="erv"?"ERV":v).join(" + ")}:null,
    ].filter(Boolean);
  },[answers,lang]);

  // Translates calcEstimate's itemized pricing-line labels (data.js) under
  // the Spanish toggle. These are built in data.js, not written as literal
  // JSX text here, so the inline tr() calls used everywhere else in this
  // file never touched them - a QA pass caught this leak. Reconstructs the
  // Spanish string from each line's `key` + the params calcEstimate now
  // attaches (see the comment on `lines=[...]` in data.js), reusing
  // OPTS_ES.cond_tier for the tier name so it can't drift from the wizard's
  // own translated tier labels.
  const trLineLabel=(line)=>{
    if(lang!=='es')return line.label;
    switch(line.key){
      case 'tonnage':{
        const tierEs=(OPTS_ES.cond_tier[line.tier]||{}).label;
        return `Sistema de ${line.tonnage} toneladas - ${tierEs||''}`;
      }
      case 'furnace90':        return 'Mejora a horno de 90% AFUE';
      case 'plenum':            return line.plenumType==='metal'?'Plenum de lámina metálica':'Plenum de ductboard';
      case 'uv':                return 'Sistema de Luz UV';
      case 'ionizer':           return 'Ionizador / Plasma';
      case 'surge':             return 'Protector de Sobrevoltaje';
      case 'dehu':              return `Deshumidificador para toda la casa (${line.dehuCap}pt)`;
      case 'erv':                return `ERV (${line.ervCfm} CFM)`;
      case 'ductReplacement':   return `Reemplazo de ductos (${line.ventCount} rejilla${line.ventCount===1?'':'s'})${line.discountRate>0?` - ${Math.round(line.discountRate*100)}% de descuento por volumen`:''}`;
      case 'laborWarranty':     return 'Garantía de mano de obra de 10 años';
      case 'maintenancePlan':   return `Plan de mantenimiento anual (1er año${line.systemCount>1?`, ${line.systemCount} sistemas`:''})`;
      case 'ductCleaning':      return 'Limpieza de ductos';
      case 'newReturnDuct':     return 'Línea de retorno nueva';
      case 'ductReturnPlenum':  return line.plenumType==='metal'?'Plenum de retorno (lámina metálica)':'Plenum de retorno (ductboard)';
      default:                  return line.label;
    }
  };

  // Q14 - "Email My Build": a plain mailto: link, no backend needed. Reuses
  // reviewItems (above) so the emailed summary always matches what the
  // review grid shows on screen, and adds the price too once one's been
  // calculated. Built fresh on every render (cheap - just string
  // concatenation) rather than memoized, since it only actually runs when
  // someone clicks the link.
  // QA FIX - per direct feedback, one button ("Email a Copy to Yourself")
  // instead of the old separate "Email a Copy to Yourself" + "Send to Our
  // Office" pair - opens the customer's own mail app with nothing
  // pre-addressed, and cc's GES's office (OFFICE_EMAIL) automatically so
  // the office always sees the build too. No longer takes a `to` param -
  // the removed office button was its only other caller.
  const buildEmailHref=()=>{
    const lines=[tr('Here is the system I built with Gold Eagle Services:','Este es el sistema que armé con Gold Eagle Services:'),''];
    reviewItems.forEach(item=>{if(item&&item.val)lines.push(`${item.label}: ${item.val}`);});
    if(pricingFlow==='result'){
      const est=calcEstimate(answers,pricingAnswers);
      if(est){
        lines.push('');
        lines.push(tr('Price breakdown:','Desglose de precio:'));
        est.lines.forEach(l=>lines.push(`  ${trLineLabel(l)}: ~$${fmtPrice(l.display)}`));
        lines.push('');
        lines.push(tr(`Estimated total: ~$${fmtPrice(est.display)}`,`Total estimado: ~$${fmtPrice(est.display)}`));
      }
    }
    lines.push('');
    lines.push(tr('Built with the Gold Eagle Services online system builder.','Creado con el configurador de sistemas en línea de Gold Eagle Services.'));
    const subject=encodeURIComponent(tr('My Gold Eagle Services HVAC Build','Mi Sistema HVAC de Gold Eagle Services'));
    const body=encodeURIComponent(lines.join('\n'));
    const cc=OFFICE_EMAIL?`&cc=${encodeURIComponent(OFFICE_EMAIL)}`:'';
    return `mailto:?subject=${subject}&body=${body}${cc}`;
  };

  const [showInfo,setShowInfo]=React.useState(false);
  // FAQ modal - see the FAQ button's own comment (price card, price-reveal
  // screen) for why this replaced the old always-showcased Zoning-only
  // sticky callout box. Per direct feedback ("add more to the FAQ besides
  // zoning"), it's now a short accordion instead of a single topic -
  // openFaqKey tracks which one question is expanded (only one at a time,
  // same "one thing to read" idea HoverPanel already uses elsewhere in
  // this app), reset to the first item every time the modal opens.
  const [showFaq,setShowFaq]=React.useState(false);
  // QA FIX - direct feedback reordered the FAQ so the most broadly relevant
  // question (why the price might change) leads and the niche zoning
  // question - only relevant to the rare homeowner who already knows what
  // zoning is - moved last. Default-open entry follows the new lead item.
  const [openFaqKey,setOpenFaqKey]=React.useState('price');
  // QA FIX - per direct feedback, the info panel used to auto-open on the
  // first question, pushing the option cards down right as they became
  // clickable ("too jumpy every time you ask a question"). The panel now
  // never opens on its own - every open is a direct response to the user
  // hovering/focusing/tapping the info button, and it always starts
  // closed on a fresh step so the selector is the first thing visible.
  // The info button itself carries a CSS glow (.info-btn, styles.css) to
  // draw attention to it without forcing the panel open.
  React.useEffect(()=>{
    setShowInfo(false);
  },[stepIdx]);
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
  // Same nested-scroll problem as .attic-bar-body above, but on the closet
  // wizard's own .sidebar - found during mobile QA on a landscape phone
  // (e.g. 844x390). A step whose options overflow the sidebar's available
  // height (routine once the canvas + sticky .step-hdr + .nav-row eat most
  // of a short viewport) needs scrolling to reach Next; advancing to the
  // next step never reset that scroll position, and since the DOM node
  // itself isn't remounted between steps (only its key'd children are),
  // the browser just clamps the stale scrollTop into the new step's
  // (often shorter) scroll range instead of resetting to 0. The new
  // step's own top options then render already scrolled out from under
  // the sticky header - on a step with a 3-card row, confirmed via
  // getBoundingClientRect the entire first card's box (not just a sliver)
  // landed inside the sticky header's own footprint, fully hidden behind
  // its opaque background - reachable only by scrolling back UP, the
  // opposite of the "scroll down to proceed" pattern every other step
  // trains for. Scoped to .closet-layout so this can't ever grab the
  // done-screen's own (same-classed, but unrelated) .sidebar instead -
  // matches the identical scoping this file already uses for that one
  // a few lines down.
  React.useEffect(()=>{
    document.querySelector('.closet-layout .sidebar')?.scrollTo(0,0);
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
    // Air-handler version - no furnace to fit, so this drops the AFUE/flue
    // detail and just covers the attic construction/comfort side instead.
    insulation_ah:"Attic insulation shows up in your diagram either way, even without a furnace to size. Fiberglass or blown-in means a vented attic, the most common setup in Austin. Spray foam means a sealed attic, which runs cooler and more efficiently.",
    plenum:"The supply plenum connects your indoor unit to your ductwork, so conditioned air can reach every room. If yours is damaged, leaking, or over 15 years old, replacing it improves both efficiency and airflow.",
    thermostat:"A basic programmable thermostat is reliable -- set your schedule and forget it. A Wi-Fi smart thermostat connects to your phone, learns your habits, and can help save 10-15% off your energy bill. Both work with any system we install.",
    // High Efficiency forces the communicating thermostat, so the generic
    // paragraph above (which describes basic/Wi-Fi as real choices and says
    // "any system we install") no longer matches what's actually on screen
    // at this tier - QA FIX, same insulation_ah pattern used just above.
    thermostat_high:"At this efficiency tier, only a communicating thermostat can drive the system's full variable-speed staging and diagnostics -- a basic or Wi-Fi model can't talk to it the same way, so it's the one option here.",
    purif:"The enhanced filtration cabinet ships standard on every install, already catching far more dust, pollen, and allergens than a typical 1 inch filter. A UV light keeps the coil clean. An ionizer charges particles and odors so your filter catches more of them. A surge protector helps guard the condenser -- a nearby lightning strike can destroy a compressor.",
    cond_tier:"The condenser is your outdoor unit. SEER2 measures cooling output per unit of electricity, so higher means lower bills. Federal Minimum meets current code at the lowest cost. Mid Efficiency is our best-value tier. High Efficiency is our top tier, with the best humidity control.",
    system_for:"With a gas furnace, you get two options. Dual fuel pairs a heat pump with the furnace -- the heat pump handles cooling and mild-weather heating, and the furnace only fires below about 35 degrees, the most efficient combo we offer. Straight cool means the AC only cools, and the furnace handles all heating.",
    dehu:"Austin humidity makes your home feel warmer than the thermostat reads. A whole-home dehumidifier ties into your ductwork and runs automatically -- just an occasional filter check, no buckets to empty. An ERV brings in fresh filtered outdoor air while venting stale air out, recovering most of the energy in the exchange. Add either, both, or neither.",
  };
  // Spanish overrides for the info-panel paragraphs - same scoped-
  // translation approach as STEPS_ES/OPTS_ES in data.js (overlay, not a
  // parallel English copy). Kept local to app.js since INFO_TEXT itself
  // is local to app.js too.
  const INFO_TEXT_ES={
    location:"La ubicación de su unidad interior define el diseño de todo el sistema. Ático es la instalación más común en Austin, con la unidad en posición horizontal sobre el espacio habitable. Clóset es de flujo ascendente, en posición vertical en un pasillo o clóset de servicio. Ambas funcionan bien; las instalaciones de clóset son un poco más fáciles de dar servicio.",
    indoor_type:"¿No está seguro de cuál tiene? Una estufa o calentador de agua a gas usualmente significa que también tiene un horno, que quema gas para calefacción y se combina con A/C para enfriar. Un hogar totalmente eléctrico probablemente tiene un manejador de aire, combinado con una bomba de calor para calefacción y enfriamiento.",
    insulation:"El aislamiento del ático determina qué horno le corresponde. Fibra de vidrio o soplada significa un ático ventilado, donde un horno estándar de 80% AFUE funciona bien con una chimenea metálica tipo B. Espuma aislante significa un ático sellado, que requiere un horno de condensación de 90% AFUE con chimenea de PVC hacia el techo.",
    insulation_ah:"El aislamiento del ático aparece en su diagrama de cualquier forma, aunque no haya un horno que dimensionar. Fibra de vidrio o soplada significa un ático ventilado, la instalación más común en Austin. Espuma aislante significa un ático sellado, que funciona más fresco y eficiente.",
    plenum:"El plenum de suministro conecta su unidad interior con sus ductos, para que el aire acondicionado llegue a cada habitación. Si el suyo está dañado, con fugas, o tiene más de 15 años, reemplazarlo mejora tanto la eficiencia como el flujo de aire.",
    thermostat:"Un termostato programable básico es confiable: configure su horario y olvídese de él. Un termostato inteligente Wi-Fi se conecta a su teléfono, aprende sus hábitos, y puede ayudar a reducir su factura de energía entre 10-15%. Ambos funcionan con cualquier sistema que instalemos.",
    thermostat_high:"En este nivel de eficiencia, solo un termostato comunicante puede controlar la modulación por etapas y los diagnósticos completos del sistema - un termostato básico o Wi-Fi no puede comunicarse con él de la misma forma, por lo que es la única opción aquí.",
    purif:"El gabinete de filtración mejorada viene incluido de fábrica en cada instalación, capturando ya mucho más polvo, polen y alérgenos que un filtro típico de 1 pulgada. Una luz UV mantiene limpio el serpentín. Un ionizador carga las partículas y olores para que su filtro atrape más. Un protector de sobrevoltaje ayuda a proteger el condensador: un rayo cercano puede destruir un compresor.",
    cond_tier:"El condensador es su unidad exterior. El SEER2 mide la salida de enfriamiento por unidad de electricidad, así que más alto significa facturas más bajas. Mínimo Federal cumple con el código actual al menor costo. Eficiencia Media es nuestro nivel de mejor valor. Alta Eficiencia es nuestro nivel superior, con el mejor control de humedad.",
    system_for:"Con un horno a gas, tiene dos opciones. Combustible Dual combina una bomba de calor con el horno: la bomba de calor se encarga del enfriamiento y la calefacción en clima templado, y el horno solo se enciende por debajo de aproximadamente 35 grados, la combinación más eficiente que ofrecemos. Solo Enfriamiento significa que el A/C solo enfría, y el horno se encarga de toda la calefacción.",
    dehu:"La humedad de Austin hace que su hogar se sienta más caliente de lo que marca el termostato. Un deshumidificador para toda la casa se conecta a sus ductos y funciona automáticamente - solo requiere revisar el filtro ocasionalmente, sin cubetas que vaciar. Un ERV introduce aire fresco filtrado del exterior mientras expulsa el aire viciado, recuperando la mayor parte de la energía en el intercambio. Agregue cualquiera, ambos, o ninguno.",
  };
  // insulation's info text has an air-handler variant (no furnace/AFUE to
  // describe); thermostat has a High-Efficiency variant (only the
  // communicating thermostat is actually offered at that tier - the
  // generic paragraph describing basic/Wi-Fi as real choices doesn't match
  // what's on screen there). Every other step's id maps straight to its
  // own entry.
  const infoTextId=cur&&cur.id==='insulation'&&answers.indoor_type!=='furnace'?'insulation_ah'
    :cur&&cur.id==='thermostat'&&answers.cond_tier==='high_ge18'?'thermostat_high'
    :cur&&cur.id;
  const infoText=infoTextId&&(lang==='es'?(INFO_TEXT_ES[infoTextId]||INFO_TEXT[infoTextId]):INFO_TEXT[infoTextId]);

  // A short, specific acknowledgment of what was just picked - replaces
  // the generic instructional hint once there's an actual answer to react
  // to, so the tool reads as a co-pilot responding to you instead of a
  // form reciting the same paragraph regardless of what you clicked.
  // Translated via tr() per entry (same overlay approach as INFO_TEXT/
  // INFO_TEXT_ES above) so this line never falls back to raw English under
  // the Spanish toggle - it used to, since this dict was plain English-only
  // strings with nothing routing them through tr() at all.
  // insulation's furnace/AFUE mention only makes sense for indoor_type
  // 'furnace' - same air-handler carve-out as infoTextId/insulation_ah
  // above; a furnace-flavored reaction line was showing up under an air
  // handler build, telling that homeowner about a furnace they don't have.
  const REACTION={
    // indoor_type has no entry here on purpose - its hint is forced to 3
    // lines (see STEPS above), already 2 lines taller than every other
    // step's. Adding a 4th reaction-line on top of that would overflow
    // .attic-info's fixed budget (confirmed empirically: -15px natural-
    // height overflow with a reaction line showing, 0 without) - and the
    // 3-line hint already spells out both choices, so the reaction line
    // wouldn't be telling the homeowner anything the hint didn't just say.
    insulation:answers.indoor_type==='furnace'
      ?{fiberglass:tr("Vented attic, 80% furnace fits.","Ático ventilado, horno de 80% ideal."),spray:tr("Sealed attic, stepping up to 90%.","Ático sellado, subiendo a 90%.")}
      :{fiberglass:tr("Vented attic, the most common setup.","Ático ventilado, la instalación más común."),spray:tr("Sealed attic, cooler and more efficient.","Ático sellado, más fresco y eficiente.")},
    plenum:{ductboard:tr("Ductboard, a solid standard choice.","Ductboard, una opción estándar sólida."),metal:tr("Steel plenum, outlasts the system.","Plenum de acero, dura más que el sistema."),none:tr("Keeping your plenum saves labor.","Conservar su plenum ahorra mano de obra.")},
    cond_tier:{fedmin:tr("Lowest upfront cost, locked in.","Menor costo inicial, asegurado."),mid_ge15:tr("Our best overall value.","Nuestro mejor valor general."),high_ge18:tr("Our quietest, most efficient tier.","Nuestro nivel más silencioso y eficiente.")},
    thermostat:{basic:tr("Reliable, no app required.","Confiable, sin necesidad de app."),wifi:tr("Control it from your phone.","Contrólelo desde su teléfono."),proprietary:tr("Built for the best diagnostics.","Diseñado para los mejores diagnósticos.")},
    system_for:{hp:tr("Efficient through Austin winters.","Eficiente durante los inviernos de Austin."),sc:tr("Furnace handles all the heating.","El horno se encarga de toda la calefacción.")},
    // dehu has no entry here - it's multi-select now (an array answer,
    // same as purif/extras before it), and those never got a reaction
    // line either (REACTION[cur.id][answers[cur.id]] only works for a
    // single-value answer).
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
  // QA FIX - direct feedback: focus recovery used to list .info-btn FIRST
  // in one combined selector, but document.querySelector on a combined
  // selector returns whichever match comes first in DOM ORDER, not
  // selector-list order - and in the closet layout's own DOM, .info-btn
  // (inside .step-hdr) sits BEFORE .opts, so it won this on nearly every
  // step forward. Landing keyboard focus there also fired its onFocus
  // handler, auto-opening the info panel right as the new step's options
  // became visible - "too jumpy every time you ask a question." Explicit
  // priority order instead: the answer options are the thing a user should
  // land on and see first, the info button is a last-resort fallback only
  // (a step with infoText but somehow no options/back button), never the
  // first choice.
  const focusFallbackTarget=(scope)=>
    document.querySelector(`${scope} .attic-opt, ${scope} .opt`)
    ||document.querySelector(`${scope} .btn-back`)
    ||document.querySelector(`${scope} .info-btn`);
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
      const target=focusFallbackTarget(scope);
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
      const target=focusFallbackTarget(scope);
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
        {/* opt.badge (the recommended-pick pill, e.g. on the Wi-Fi
            thermostat) used to only render in the full .opt card below -
            a QA pass caught the compact attic card silently dropping it,
            so the same option read as recommended in closet mode but not
            in attic mode. Reuses .opt-badge's own styling.
            QA FIX - used to just say "GES", which reads as the company's
            initials with no context for what it actually signals - matches
            the same SUGGESTED/SUGERIDO badge text the tonnage picker's own
            recommended-pick pill already uses elsewhere in this file. */}
        <span className="attic-opt-label">{opt.label}{opt.badge&&<span className="opt-badge">{tr('SUGGESTED','SUGERIDO')}</span>}</span>
        <span className="attic-opt-desc">{opt.desc||""}</span>
        <div className="attic-opt-foot">
          <div className={"attic-chk"+(isMulti?"":" radio")}>{isMulti&&isOn?"✓":""}{!isMulti&&isOn?<div style={{width:7,height:7,borderRadius:"50%",background:"var(--gh)"}}/>:""}</div>
        </div>
      </button>;
    }
    return <button key={opt.v} className={"opt"+(isOn?" sel":"")+(isDisabled?" disabled":"")} onClick={click}>
      <div className="opt-inner">
        <div className="opt-body">
          <span className="opt-label">{opt.label}{opt.badge&&<span className="opt-badge">{tr('SUGGESTED','SUGERIDO')}</span>}</span>
          {opt.desc&&<span className="opt-desc">{opt.desc}</span>}
        </div>
        <div className={isMulti?"opt-check":"opt-check radio"} style={isOn&&!isMulti?{borderColor:"var(--gl)",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}:{}}>
          {isMulti&&isOn?"✓":""}{!isMulti&&isOn?<div style={{width:8,height:8,borderRadius:"50%",background:"var(--gh)"}}/>:""}
        </div>
      </div>
    </button>;
  };

    return(<>
      {/* Reserved header-spacer bar simulating the real WordPress site
          header's height above the iframe - unrelated to the language
          toggle, which lives down on the splash screen now (see below). */}
      <div className="site-header-spacer no-print"/>
    <div ref={topRef} className="app-root">
      {/* Direct feedback: "make sure the gravity form loads before someone
          gets to that page". Same invisible warm-up as the one on the done
          screen (see its comment there), started as soon as a build begins
          so the form's page assets are already cached by the last step. */}
      {GATE_CONFIG.gravityFormId&&GATE_CONFIG.embedFormUrl&&!leadUnlocked&&answers.location&&!doneVisible&&
        <iframe src={GATE_CONFIG.embedFormUrl} aria-hidden="true" tabIndex="-1"
          style={{position:"absolute",left:-9999,top:0,width:1,height:1,overflow:"hidden",opacity:0,pointerEvents:"none",border:"none"}}/>}
      {/* QA FIX - automated pass: printing (Ctrl+P) from the splash
          screen or anywhere mid-wizard produced a completely blank
          page - the @media print block unconditionally hides
          .splash-screen/.attic-layout/.closet-layout (styles.css), and
          .done-screen isn't mounted at all until doneVisible is true,
          so there was nothing left in the DOM for the browser to print.
          This fallback only exists while !doneVisible (i.e. exactly the
          gap that print CSS doesn't otherwise cover), hidden on-screen
          and shown only in print media (see .print-only-fallback in
          styles.css) - a plain, no-dead-chrome message rather than a
          blank page, since there's no in-progress-answers UI to print
          yet at this point in the flow. */}
      {!doneVisible&&<div className="print-only-fallback">
        <div style={{fontFamily:"var(--ft)",fontSize:20,marginBottom:8}}>Gold Eagle Services</div>
        <div>{tr('Your estimate isn’t ready to print yet - finish building your system to see pricing and print your results.','Su estimado aún no está listo para imprimir - termine de armar su sistema para ver el precio e imprimir sus resultados.')}</div>
      </div>}
      {/* FAQ - replaced the old always-showcased Zoning-only sticky callout
          box on the price-reveal screen (see the FAQ button's own comment)
          - a plain opt-in overlay instead, top-level so it can sit above
          either layout regardless of which one triggered it. Per direct
          feedback ("add more to the FAQ besides zoning"), expanded from a
          single topic into a short accordion (openFaqKey - one entry open
          at a time, same "one thing to read" idea HoverPanel already uses
          elsewhere in this app). Every entry's copy is reused from
          wherever this app already establishes it elsewhere (the
          manufacturer-warranty line under the price, the Wells Fargo/
          Wisetack financing caption, the "final price confirmed at your
          free in-home visit" disclaimer) rather than inventing new claims
          about the business. */}
      {showFaq&&<div className="no-print" onClick={()=>setShowFaq(false)}
        style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#14110a",border:"1px solid rgba(215,183,64,.4)",borderRadius:6,padding:"16px 20px",maxWidth:460,width:"100%",maxHeight:"80vh",overflowY:"auto",boxSizing:"border-box",boxShadow:"0 10px 40px rgba(0,0,0,.5)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:4}}>
            <div style={{fontSize:16,fontWeight:600,color:"rgba(255,255,255,.92)",fontFamily:"var(--ft)"}}>{tr('Frequently Asked Questions','Preguntas Frecuentes')}</div>
            <button aria-label={tr('Close','Cerrar')} onClick={()=>setShowFaq(false)}
              style={{background:"none",border:"none",color:"rgba(255,255,255,.6)",fontSize:22,lineHeight:1,cursor:"pointer",padding:4}}>×</button>
          </div>
          {[
            {key:'price', q:tr('Why might my final price change?','¿Por qué podría cambiar mi precio final?'),
              a:tr("This is an estimate based on typical installs. Your final price is confirmed at your free in-home visit - we verify your existing equipment, take exact measurements, and make sure everything's accounted for.","Este es un estimado basado en instalaciones típicas. Su precio final se confirma en su visita gratuita a domicilio - verificamos su equipo actual, tomamos medidas exactas, y nos aseguramos de que todo esté contemplado.")},
            {key:'financing', q:tr('How does financing work?','¿Cómo funciona el financiamiento?'),
              a:tr("36 months at 0% APR through Wells Fargo, subject to approved credit. Or prequalify online with Wisetack for other flexible plans (a separate offer with its own terms).","36 meses al 0% de interés a través de Wells Fargo, sujeto a aprobación de crédito. O precalifique en línea con Wisetack para otros planes flexibles (una oferta separada con sus propios términos).")},
            {key:'warranty', q:tr('What warranty is included?','¿Qué garantía está incluida?'),
              a:tr("Every system includes a 10-year manufacturer parts warranty (registration required within 60 days of install) - that covers parts, not labor. The optional 10-year labor warranty on this page covers a technician's time for any warranty repair during that same period.","Cada sistema incluye una garantía de fábrica de 10 años en piezas (requiere registro dentro de los 60 días posteriores a la instalación) - eso cubre piezas, no mano de obra. La garantía opcional de mano de obra de 10 años en esta página cubre el tiempo de un técnico para cualquier reparación bajo garantía durante ese mismo período.")},
            {key:'maintenance', q:tr('What does the annual maintenance plan include?','¿Qué incluye el plan de mantenimiento anual?'),
              a:tr("2 seasonal tune-ups (AC + heating), priority scheduling, 10% off repairs, waived consultation fees, free coil cleaning & drain flush, and 1 free service call for friends and family. $177 for the first system, +$100 for each additional system on the same visit.","2 afinaciones estacionales (A/C y calefacción), programación prioritaria, 10% de descuento en reparaciones, consultas sin cargo, limpieza de serpentín y drenaje gratis, y 1 visita de servicio gratis para familiares. $177 por el primer sistema, +$100 por cada sistema adicional en la misma visita.")},
            {key:'zoning', q:tr('Can this system be zoned?','¿Se puede dividir este sistema en zonas?'),
              a:tr("Splitting this system into independently-controlled zones (upstairs/downstairs, or room-by-room). Cost varies too much by home layout for an online estimate - we'll walk your home and quote it exactly at your free visit.","Dividir este sistema en zonas controladas de forma independiente (arriba/abajo, o habitación por habitación). El costo varía demasiado según la distribución de la casa para un estimado en línea - visitaremos su hogar y le daremos una cotización exacta en su visita gratuita."),
              extra:tr("Checked any of the duct add-ons above? Those prices are already in your estimate. We'll still confirm the exact scope - and flag anything else your ductwork needs - at your free in-home visit.","¿Marcó alguno de los complementos de ductos arriba? Esos precios ya están en su estimado. Aun así confirmaremos el alcance exacto - y señalaremos cualquier otra necesidad de sus ductos - en su visita gratuita a domicilio.")},
          ].map(item=>(
            <div key={item.key} style={{borderTop:"1px solid rgba(215,183,64,.18)"}}>
              <button onClick={()=>setOpenFaqKey(openFaqKey===item.key?null:item.key)} aria-expanded={openFaqKey===item.key}
                style={{display:"flex",width:"100%",justifyContent:"space-between",alignItems:"center",gap:10,background:"none",border:"none",color:"rgba(255,255,255,.92)",fontFamily:"var(--ft)",fontSize:"var(--fs-pricing-line)",fontWeight:600,textAlign:"left",padding:"10px 0",cursor:"pointer"}}>
                <span>{item.q}</span>
                <span style={{color:"rgba(215,183,64,.85)",flexShrink:0,fontSize:16}}>{openFaqKey===item.key?'−':'+'}</span>
              </button>
              {openFaqKey===item.key&&<div style={{paddingBottom:14}}>
                <div style={{fontSize:"var(--fs-pricing-line)",color:"var(--dim)",lineHeight:1.7}}>{item.a}</div>
                {item.extra&&<div style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)",marginTop:10,fontStyle:"italic"}}>{item.extra}</div>}
              </div>}
            </div>
          ))}
        </div>
      </div>}
      {/* QA FIX - the diagram's shared gradients/filters (gold, silver,
          cabinet-edge, glow, etc.) used to be defined fresh inside EACH
          mounted <svg> (the wizard's own preview canvas stays mounted,
          display:none, even after reaching the done screen - so up to 3
          copies of the same ids could exist in the document at once).
          SVG's url(#id) lookup is document-wide, so this was harmless on
          screen, but under print Chromium could resolve a reference to a
          copy sitting inside a display:none subtree and simply not paint
          it - confirmed as the cause of the furnace/A-coil cabinet
          printing as an empty gap (the one thing using a gradient stroke,
          not a flat fill). Rendered exactly once here instead, in a
          zero-size (not display:none, so it survives print) SVG that's
          never conditionally hidden - every other <svg> in the app still
          resolves url(#gold) etc. against this one shared copy. */}
      <svg width="0" height="0" style={{position:"absolute"}} aria-hidden="true"><Defs/></svg>
      {/* Visually-hidden live region - see the liveMessage comment above.
          A stable, never-remounted node (no key, no conditional unmount)
          so screen readers treat every stepIdx/done change as a content
          mutation of the SAME region and announce it, rather than a fresh
          region appearing that some assistive tech would stay silent on. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{liveMessage}</div>
      {/* ── RESUME PROMPT - shown once on load if a saved build exists ── */}
      {resumePending&&<div className="fadein" style={{position:"absolute",inset:0,zIndex:40,background:"var(--bk)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:24,textAlign:"center"}}>
        <div className="splash-logo" style={{fontSize:"clamp(28px,6vw,44px)"}}>{tr('WELCOME BACK','BIENVENIDO DE NUEVO')}</div>
        <p style={{fontFamily:"var(--fb)",fontSize:15,color:"rgba(255,255,255,.6)",maxWidth:420,lineHeight:1.6}}>
          {(()=>{
            const savedSteps=STEPS.filter(s=>!s.showIf||s.showIf(savedBuild.answers));
            const savedCur=savedSteps[savedBuild.stepIdx];
            const savedQ=savedCur&&(lang==='es'&&STEPS_ES[savedCur.id]?STEPS_ES[savedCur.id].q:savedCur.q);
            return savedBuild.done
              ? tr('You already finished building a system. Pick up right where you left off?','Ya terminó de armar un sistema. ¿Continuamos donde lo dejó?')
              : savedCur
                ? tr(<>You were on <strong style={{color:"rgba(255,255,255,.85)"}}>"{savedQ}"</strong> - want to keep going?</>,
                     <>Estaba en <strong style={{color:"rgba(255,255,255,.85)"}}>"{savedQ}"</strong> - ¿desea continuar?</>)
                : tr('You have a build in progress. Want to keep going?','Tiene un sistema en progreso. ¿Desea continuar?');
          })()}
        </p>
        <button className="done-cta" style={{width:220}} onClick={resumeBuild}>{tr('Resume My Build','Continuar Mi Sistema')}</button>
        <button className="done-restart" onClick={discardSavedBuild}>{tr('Start Fresh Instead','Empezar de Nuevo')}</button>
      </div>}

      {/* ── PROGRESS BAR - segmented by chapter, not a bare percentage ──
          Only mounted once a location's been picked (loc||done matches the
          splash-screen's own "out" condition below) - there's no chapter
          progress to show yet on the splash/location-picker screen, and its
          zIndex:30 used to sit above the splash's z-index:20, letting it
          bleed through that opaque overlay onto a customer's very first,
          unfamiliar view of the tool. */}
      {(loc||done) && <div className="prog-chapters" style={{position:"absolute",top:0,left:0,right:0,zIndex:30}}>
        {chapterNames.map((name,i)=>{
          const segPct=done||i<curChapter?100:i>curChapter?0:
            chapterCounts[i]?Math.round((curChapterStepNum/chapterCounts[i])*100):0;
          return <div key={i} className={"prog-chapter"+(segPct>=100?" done":"")} title={name}>
            <div className="prog-chapter-fill" style={{width:segPct+"%"}}/>
          </div>;
        })}
      </div>}

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
        {/* Staged entrance (splash-rise, see its own comment in styles.css) -
            each direct block eases up into place a beat after the one
            before it, instead of the whole screen popping in fully-formed
            on frame one. Stagger lives here as a per-element animationDelay
            (same pattern as the ionizer/DehuErvBoxes per-item delays in
            canvas.js) rather than nth-child in the stylesheet, so it can't
            silently drift out of order if a block above is ever added or
            reordered. */}
        <div className="splash-logo splash-rise" style={{animationDelay:'0s'}}>{tr('BUILD YOUR OWN SYSTEM','ARME SU PROPIO SISTEMA')}</div>
        <p className="splash-rise splash-intro" style={{animationDelay:'.06s',fontFamily:"var(--fb)",fontSize:"19px",color:"rgba(255,255,255,.65)",textAlign:"center",maxWidth:600,lineHeight:1.7,margin:"8px 0 4px"}}>
          {tr(<>Tell us where your indoor unit lives and we will build a <strong style={{color:"rgba(255,255,255,.8)"}}>live, real-time diagram</strong> of your complete HVAC system - every component, every connection, sized and labeled.</>,
              <>Díganos dónde vive su unidad interior y construiremos un <strong style={{color:"rgba(255,255,255,.8)"}}>diagrama en vivo y en tiempo real</strong> de su sistema HVAC completo - cada componente, cada conexión, dimensionado y etiquetado.</>)}
        </p>
        {/* Q13 - differentiation copy: locally owned/operated (not private
            equity-owned, unlike a lot of HVAC roll-ups) and the "we care"
            angle, per the owner's own framing - only claims already true
            elsewhere in this app (Austin-based, upfront pricing) rather
            than anything unverifiable. */}
        <div className="splash-rise" style={{animationDelay:'.12s',display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"6px 18px",maxWidth:560,margin:"6px 0"}}>
          {[
            tr('Locally owned & operated - not private equity','Propiedad y operación local - no somos capital privado'),
            tr('We treat your home like our own','Tratamos su hogar como si fuera el nuestro'),
            tr('Transparent pricing, zero pressure','Precios transparentes, sin presión'),
          ].map((line,i)=>(
            <span key={i} style={{fontFamily:"var(--fb)",fontSize:12.5,color:"rgba(255,255,255,.55)",display:"flex",alignItems:"center",gap:5}}>
              <span style={{color:"var(--gl)"}}>✓</span>{line}
            </span>
          ))}
        </div>
        {/* .55 measured 3.66:1 against the splash screen's #121212
            background - under the 4.5:1 body-text minimum. .75 clears it
            at 5.82:1 while staying visibly dimmer than the solid --gl used
            on the two cards below it. */}
        <p className="splash-rise" style={{animationDelay:'.18s',fontFamily:"var(--fm)",fontSize:"14px",color:"rgba(215,183,64,.75)",textAlign:"center",letterSpacing:".1em",margin:"0 0 6px"}}>{tr('SELECT YOUR SYSTEM LOCATION TO BEGIN','SELECCIONE LA UBICACIÓN DE SU SISTEMA PARA COMENZAR')}</p>
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
        <div className="splash-cards splash-rise" style={{animationDelay:'.24s'}}>
          <div className="splash-card" role="button" tabIndex={0}
            aria-label={tr('Attic Horizontal - Unit lays on its side above the ceiling, most common in Austin. Air flows horizontally through ducts in the attic.','Ático Horizontal - La unidad se acuesta de lado sobre el techo, lo más común en Austin. El aire fluye horizontalmente a través de ductos en el ático.')}
            onClick={()=>pickLocation("attic")}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickLocation("attic");}}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:4}}>
              <div className="splash-card-title">{tr('Attic Horizontal','Ático Horizontal')}</div>
              <div className="splash-card-desc">{tr('Unit lays on its side above the ceiling - most common in Austin. Air flows horizontally through ducts in the attic.','La unidad se acuesta de lado sobre el techo - lo más común en Austin. El aire fluye horizontalmente a través de ductos en el ático.')}</div>
            </div>
          </div>
          <div className="splash-card" role="button" tabIndex={0}
            aria-label={tr('Closet Upflow - Unit stands upright in a utility closet or hallway alcove. Air flows vertically up through the coil.','Clóset de Flujo Ascendente - La unidad se instala en posición vertical en un clóset de servicio o pasillo. El aire fluye verticalmente a través del serpentín.')}
            onClick={()=>pickLocation("closet")}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickLocation("closet");}}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:4}}>
              <div className="splash-card-title">{tr('Closet Upflow','Clóset de Flujo Ascendente')}</div>
              <div className="splash-card-desc">{tr('Unit stands upright in a utility closet or hallway alcove. Air flows vertically up through the coil.','La unidad se instala en posición vertical en un clóset de servicio o pasillo. El aire fluye verticalmente a través del serpentín.')}</div>
            </div>
          </div>
        </div>
        {/* Language toggle + the "takes about 2 minutes" reassurance share
            one row under the cards (owner feedback: the start screen
            scrolled on laptops - this line used to sit on its own row
            below the toggle). */}
        <div className="splash-rise splash-foot" style={{animationDelay:'.3s'}}>
          <span className="splash-foot-note">
            {tr('Takes about 2 minutes. No personal info required. Your build saves automatically as you go.','Toma unos 2 minutos. No se requiere información personal. Su sistema se guarda automáticamente mientras avanza.')}
          </span>
          <button className="lang-toggle-btn" onClick={()=>setLang(l=>l==='es'?'en':'es')}
            aria-label={tr('Switch to Spanish','Cambiar a inglés')}
            style={{fontFamily:"var(--fm)",fontSize:11,letterSpacing:".05em",padding:"4px 9px",background:"rgba(11,13,20,.7)",color:"rgba(255,255,255,.75)",border:"1px solid rgba(215,183,64,.35)",borderRadius:3,cursor:"pointer",flex:"0 0 auto"}}>
            {lang==='es'?'EN':'ES'}
          </button>
        </div>
      </div>

      {/* ── ROTATE PROMPT - attic mode's diagram is wide/short (the unit
          lies on its side, ductwork runs sideways), the opposite shape of
          a portrait phone screen - genuinely too condensed to read well
          in portrait, unlike closet mode's tall/narrow diagram which
          already fits a phone naturally. Hidden by default; only ever
          shown by the .rotate-prompt media query in styles.css (portrait
          + phone-width), never by this condition alone - isAtticMode
          covers the wizard AND the done/review screen, since both have
          the same cramped-in-portrait problem. No dismiss/skip control:
          asked for directly ("force them to turn their phone"), and
          landscape is one physical rotation away, not a dead end. */}
      {isAtticMode&&<div className="rotate-prompt no-print" role="alert">
        <div className="rotate-prompt-icon">⟳</div>
        <div className="rotate-prompt-text">{tr('Rotate Your Phone','Gire Su Teléfono')}</div>
        <div className="rotate-prompt-sub">{tr('This system view is built for landscape - turn your phone sideways to see it clearly.','Esta vista del sistema está diseñada para modo horizontal - gire su teléfono de lado para verla con claridad.')}</div>
      </div>}

      {/* ── ATTIC LAYOUT - canvas full width, step bar on bottom ── */}
      {/* inert matches the "out" condition below - see the comment on
          .splash-screen above for why this is needed at all. */}
      <div ref={atticLayoutRef} className={"attic-layout"+(!isAtticMode||done?" out":"")}>
        <div className="attic-canvas-area canvas-frame">
          <div className="canvas-zoom">
            <Canvas a={answers} stepIdx={stepIdx} activeSteps={activeSteps} lang={lang}/>
          </div>
        </div>
        <div className="attic-bar">
          {quickEdit&&<div className="quickedit-banner fadein">
            <span>✎ {tr('Editing this answer only','Editando solo esta respuesta')}</span>
            <button onClick={cancelQuickEdit}>‹ {tr('Cancel, back to build','Cancelar, volver a la construcción')}</button>
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
              <div className="step-q" style={{marginBottom:2}}>{curQ}</div>
              {curHint&&<div className="step-hint">{curHint}</div>}
              {reactionText&&<div key={reactionText} className="reaction-line">✓ {reactionText}</div>}
            </div>
            <div key={"scroll-"+stepIdx} className="attic-scroll fadein">
              {opts.map(opt=>makeOpt(opt,true))}
            </div>
          </div>
          <div className="attic-bar-top">
            <span className="attic-step-label">
              {cur ? <>
                <span className="attic-step-label-fixed">{stepCountText}</span>
                <span className="attic-step-label-rest">{stepCountText&&" · "}<span className="chapter-tag">{chapterNames[curChapter]}</span>{" · "+curQ.toUpperCase()}</span>
              </> : ""}
            </span>
            {infoText&&<button className="info-btn" aria-label={showInfo?tr("Hide info","Ocultar información"):tr("More info","Más información")} aria-expanded={showInfo}
              onMouseEnter={()=>hoverCapable()&&setShowInfo(true)} onMouseLeave={()=>hoverCapable()&&setShowInfo(false)}
              onFocus={()=>setShowInfo(true)} onBlur={()=>setShowInfo(false)}
              onTouchEnd={e=>{e.preventDefault();setShowInfo(v=>!v);}}>i</button>}
            {stepIdx>0&&<button className="btn-back" onClick={goBack}>‹ {tr('Back','Atrás')}</button>}
            {cur&&(cur.optional||cur.multi)&&<button className="btn-skip" onClick={skip}>{tr('Skip','Omitir')}</button>}
            <button className="btn-next" onClick={goNext} disabled={!canNext}>
              {quickEdit?(quickEditWillFinish?tr("Save & Return →","Guardar y volver →"):tr("Next →","Siguiente →")):(stepIdx===activeSteps.length-1?tr("Finish →","Finalizar →"):tr("Next →","Siguiente →"))}
            </button>
          </div>
          {/* QA FIX - showInfo/infoText are shared state, but BOTH layouts'
              info-collapse render unconditionally (only their shared
              ancestor's opacity/pointer-events hide whichever one isn't
              active - see the .attic-layout/.closet-layout comment above).
              Gating "open" here on isAtticMode too (not just showInfo&&
              infoText) stops this hidden-but-still-classed "open" state
              from carrying over: without it, tapping/focusing the info
              button on one layout and then switching layouts at the same
              step (no stepIdx change, so the step-change reset just above
              never fires) landed on the OTHER layout already showing its
              info panel open - a real, if narrow, version of the exact
              "auto-open unprompted" bug already fixed once for the normal
              per-step case (see this file's showInfo state comment). */}
          <div className={"info-collapse attic-info-collapse"+(isAtticMode&&showInfo&&infoText?" open":"")}><div className="info-collapse-inner">
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
            <Canvas a={answers} stepIdx={stepIdx} activeSteps={activeSteps} lang={lang}/>
          </div>
        </div>
        <div className="sidebar">
          {quickEdit&&<div className="quickedit-banner fadein">
            <span>✎ {tr('Editing this answer only','Editando solo esta respuesta')}</span>
            <button onClick={cancelQuickEdit}>‹ {tr('Cancel, back to build','Cancelar, volver a la construcción')}</button>
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
              <span>{cur&&<span className="chapter-tag">{chapterNames[curChapter]}</span>}{stepCountText&&` ${stepCountText}`}</span>
              {infoText&&<button className="info-btn" aria-label={showInfo?tr("Hide info","Ocultar información"):tr("More info","Más información")} aria-expanded={showInfo}
                onMouseEnter={()=>hoverCapable()&&setShowInfo(true)} onMouseLeave={()=>hoverCapable()&&setShowInfo(false)}
                onFocus={()=>setShowInfo(true)} onBlur={()=>setShowInfo(false)}
                onTouchEnd={e=>{e.preventDefault();setShowInfo(v=>!v);}}>i</button>}
            </div>
            <div className="step-q">{curQ}</div>
            {curHint&&<div className="step-hint">{curHint}</div>}
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
          {/* QA FIX - see the attic layout's own .attic-info-collapse
              comment above: gated on isClosetMode too so this hidden
              layout's copy can't carry an "open" class over from the
              other layout when they're swapped at the same step. */}
          <div className={"info-collapse"+(isClosetMode&&showInfo&&infoText?" open":"")}><div className="info-collapse-inner">
            {infoText&&<div className="info-expand"><div className="info-body">{infoText}</div></div>}
          </div></div>
          <div key={"opts-"+stepIdx} className="opts fadein">{opts.map(opt=>makeOpt(opt,false))}</div>
          <div className="nav-row">
            {stepIdx>0&&<button className="btn-back" onClick={goBack}>‹ {tr('Back','Atrás')}</button>}
            {cur&&(cur.optional||cur.multi)&&<button className="btn-skip" onClick={skip}>{tr('Skip','Omitir')}</button>}
            <button className="btn-next" onClick={goNext} disabled={!canNext}>
              {quickEdit?(quickEditWillFinish?tr("Save & Return","Guardar y volver"):tr("Next","Siguiente")):(stepIdx===activeSteps.length-1?tr("See Full Build","Ver Sistema Completo"):tr("Next","Siguiente"))}
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
      {/* QA FIX - direct feedback: "on horizontal, the pricing doesnt take
          much of the page even though thats the final page, the page
          should probably shift down to the pricing away from the system
          builder at that point." pricing-engaged is the general "give the
          pricing panel more room" state - scoped to attic (closet's own
          diagram-top/sidebar-below split already reads fine at pricing
          time per that same feedback, so it's left alone) and to any
          pricingFlow value, not just leadgate's own embedded-form case
          (which keeps its bigger, dedicated .lead-form-open bump below -
          same modifier-class pattern, just sized for a ~370px form instead
          of a couple of short questions or the final estimate).
          pricing-engaged-result stacks a second, taller bump on top of the
          base one specifically for the price reveal itself - it's a
          genuinely longer panel (price hero, line items, the two add-on
          checkboxes, the "other things we commonly find" column) than a
          one-question sizing sub-step, and measuring it uncapped showed a
          plain flat height tuned for sizing/leadgate left it scrolling
          noticeably more than it needed to. All three classes can be
          present at once (leadgate + embedFormUrl); source order in
          styles.css lets the more specific bump win each time. */}
      {doneVisible&&<div ref={doneScreenRef} className={"done-screen"+(isAtticMode?" attic-mode":" closet-mode")+(isAtticMode&&pricingFlow!==null?" pricing-engaged":"")+(isAtticMode&&pricingFlow==='result'?" pricing-engaged-result":"")+(pricingFlow==='leadgate'&&GATE_CONFIG.embedFormUrl?" lead-form-open":"")+(!done?" done-leaving":"")} style={{position:"absolute",inset:0,overflow:"hidden",zIndex:10}}>
        {/* Confetti - see celebrateBuild/celebratePrice's own comments
            above (near the `done`/`pricingFlow` state) for when/why each
            fires. Both burst across the whole done screen rather than
            being scoped to just the diagram or just the price card - a
            reveal this size deserves the full width. */}
        {celebrateBuild&&<Confetti/>}
        {celebratePrice&&<Confetti/>}
        {/* QA FIX - direct feedback: "any way to speed up the gravity
            forms loading when you click 'get pricing'?" The real lead-
            gate iframe (below, in the pricingFlow==='leadgate' block)
            only ever started loading the instant pricingFlow flipped to
            'leadgate' - the literal next state after clicking Get
            Pricing for a not-yet-unlocked visitor - so a cold fetch of
            an entire separate WordPress page (its own theme, Gravity
            Forms plugin assets, etc.) landed squarely on the one click a
            homeowner is most impatient about. This is a second, purely
            invisible <iframe> pointed at the exact same URL, mounted as
            soon as the done screen itself appears - there's real dwell
            time here (reviewing the diagram, quick-editing an answer)
            before anyone gets around to clicking Get Pricing, which is
            exactly the time to spend warming this up in the background
            instead. It shares no ref/state with the real gate iframe and
            plays no role in lead detection - purely a browser-level
            head start, so by the time the real iframe mounts, the
            browser already has a warm connection to that origin and its
            shared static assets (CSS/JS/fonts) cached, even though the
            page's own dynamic HTML response still gets fetched fresh.
            Kept off-screen via position/size rather than display:none,
            which some browsers treat as "don't bother loading yet" and
            would defeat the whole point. aria-hidden + tabIndex=-1 keep
            it out of the accessibility tree and tab order - nothing
            about it is meant to ever be seen or reached by a real user.
            Stops mounting once leadUnlocked (nothing left to warm up for
            - the gate won't show at all) or once the real gate iframe
            has taken over (pricingFlow==='leadgate') - the connection's
            already warm by then, so a second concurrent load of the same
            page is just wasted bandwidth with no remaining benefit. */}
        {GATE_CONFIG.gravityFormId&&GATE_CONFIG.embedFormUrl&&!leadUnlocked&&pricingFlow!=='leadgate'&&
          <iframe src={GATE_CONFIG.embedFormUrl} aria-hidden="true" tabIndex="-1"
            style={{position:"absolute",left:-9999,top:0,width:1,height:1,overflow:"hidden",opacity:0,pointerEvents:"none",border:"none"}}/>}
        {/* flex itself lives in styles.css (.done-canvas-frame), not here -
            an inline style always wins over any stylesheet rule regardless
            of specificity, which silently defeated the mobile height cap
            .done-screen.attic-mode .done-canvas-frame needs (see its
            comment) when flex:1 was set right here instead. */}
        <div className="canvas-frame done-canvas-frame" style={{minWidth:0,minHeight:0,position:"relative",overflow:"hidden"}}>
          <div className="canvas-zoom">
            <Canvas a={answers} stepIdx={stepIdx} activeSteps={activeSteps} onEditStep={jumpToStep} lang={lang}/>
          </div>
          <div className="done-canvas-sweep"/>
        </div>
        {/* QA FIX - direct feedback: shrink the diagram, grow the pricing/
            review panel by 20%, on the final done screen only ("that's
            like the golden ticket ending"). .done-canvas-frame is flex:1
            (see its own comment above) - it fills whatever space this
            sidebar doesn't take, so growing the sidebar's own fixed
            dimension shrinks the diagram automatically, in both layouts,
            with one inline change each: attic's fixed height 200->240px
            (column stack - diagram on top, panel below), closet's fixed
            width 320->384px (side-by-side - diagram left, panel right;
            overriding the base .sidebar{width:320px} rule shared with
            the wizard's own per-step sidebar, which stays untouched).
            Closet's 384px lives in styles.css (.done-screen.closet-mode>
            .sidebar), NOT inline here: an inline width beats the
            max-width:1024px media query's .sidebar{width:100%}, which
            left the stacked tablet/phone layout stuck with a 384px-wide
            panel (half-width on a 768px tablet, clipped past the edge on
            a 375px phone). Attic's 240px height moved to styles.css
            (.done-screen.attic-mode>.sidebar) for the same reason: inline,
            it beat every media query, so a stacked tablet/phone kept a
            240px scroll box with dead black space below it (768x1024) or
            ran past the bottom of the screen (844x390 landscape). */}
        {/* QA FIX - direct feedback: on a 768x1024 tablet (and narrower),
            hitting Get Pricing on the attic layout left the ENTIRE quick-
            actions row (Financing/Save-Print/Email/Back/Start Over) - and
            usually the considerations panel and warranty checkboxes too -
            permanently unreachable, even for a bare-minimum build with no
            add-ons. Cause: this flexShrink:0 was inline, which - same "an
            inline style always beats a stylesheet rule" issue called out
            on every other property that got moved out of here into a
            class (closet's 384px width, attic's 240px height, both right
            above) - silently beat the max-width:1024px media query's own
            "flex:1 1 auto" (shrink:1) override (styles.css), the one the
            comment on THAT rule already says is "what lets it shrink and
            scroll when space is tight". With shrink permanently pinned to
            0 by this inline value no matter the viewport, the panel could
            still grow past its share of space but could never shrink back
            down to it - so instead of shrinking-then-scrolling inside
            .done-screen's own overflow:hidden boundary, it just got
            hard-clipped there with no scrollbar anywhere to reach the rest
            of it. flex-shrink:0 is exactly right at desktop width, where
            this panel is meant to stay a fixed 240px - that's still set,
            just non-inline now (.done-screen.attic-mode>.sidebar in
            styles.css), so the mobile media query can win back over it
            the same way it already does for height/width right next to
            it. */}
        <div className="sidebar" style={isAtticMode?{overflowY:"auto",width:"100%",borderLeft:"none",borderTop:"1px solid var(--border)"}:{overflowY:"auto"}}>
          {/* PRINT LETTERHEAD - invisible on-screen (.print-letterhead is
              display:none outside @media print, see styles.css), a sibling
              of .done-wrap rather than a child of it specifically so it
              escapes `.done-wrap *{color:#000!important}` below in the
              print stylesheet - that rule exists to flatten the on-screen
              gold/dark palette to plain black-on-white for the price/
              review content, but a letterhead is the one place on the
              printed page that SHOULD keep a little brand color. A printed
              estimate has no browser chrome, tab title, or URL to say
              whose estimate it is once it's off screen (often in a
              spouse's hands, not just the person who built it) - this
              gives it one. Date is generated fresh at print time, not
              stored - same "derived, not fabricated" rule as everything
              else this pass added. */}
          <div className="print-letterhead">
            <div className="print-letterhead-brand">GOLD EAGLE SERVICES</div>
            <div className="print-letterhead-sub">{tr('Austin, TX · HVAC System Estimate','Austin, TX · Estimado de Sistema HVAC')} · {new Date().toLocaleDateString(lang==='es'?'es':'en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
          </div>
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
            {(()=>{
              // Computed once regardless of pricingFlow, so the full grid
              // is always available to print (see reviewGridPrintOnly
              // below) even while pricing is engaged on-screen, where the
              // collapsed one-liner takes over to save room for the
              // sizing sub-steps' own Back/Next. Previously this whole
              // grid simply didn't exist in the DOM once pricingFlow was
              // truthy, so hitting Save/Print at exactly the moment
              // someone has a price in hand - the moment they're most
              // likely to want a printout - produced a page with no
              // system spec on it at all, just the collapsed line.
              // Takes an optional leading cell (see its own call site's
              // comment for why - attic's own "Your System is Built"
              // header) so that cell becomes a genuine grid item sized by
              // the SAME row-height logic as every review cell around it,
              // instead of a separate element outside the grid entirely
              // whose height has nothing to do with the grid's own rows.
              // Closet-only: how many cells will actually render (nulls from
              // skipped optional steps don't reach the DOM, so CSS's own
              // :last-child:nth-child(2n+1) full-width-span rule - see that
              // rule's own comment in styles.css - keys off THIS count, not
              // reviewItems.length). Mirrored here so the lone spanning cell
              // (an odd total leaves one item alone in the final row) can
              // render as a single compact line instead of the normal
              // stacked layout - QA FIX: that cell reads as "too wide" once
              // it spans both columns while still stacking label/value/EDIT
              // vertically like a half-width cell, wasting the extra width
              // it just gained instead of using it to shrink its own height.
              const closetVisibleCount=reviewItems.filter(it=>it&&it.val).length;
              let closetRenderedIdx=0;
              const reviewGrid=(leadCell)=>(
                <div className={"done-review-grid"+(isAtticMode?" attic-mode-grid":" closet-mode-grid")} style={{width:"100%",marginBottom:8,border:"1px solid rgba(215,183,64,.15)",display:"grid"}}>
                  {leadCell}
                  {reviewItems.map((item,i)=>{if(!(item&&item.val))return null;
                    closetRenderedIdx++;
                    const isLastSpanning=!isAtticMode&&closetRenderedIdx===closetVisibleCount&&closetVisibleCount%2===1;
                    return(
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
                    (isAtticMode?
                    <div key={i} style={{display:"flex",flexDirection:"column",gap:1,padding:"4px 34px 4px 10px",background:i%2===0?"rgba(255,255,255,.02)":"transparent",border:"1px solid rgba(215,183,64,.1)",position:"relative",minWidth:0}}>
                      <span style={{color:"rgba(215,183,64,.68)",fontFamily:"var(--fm)",fontSize:"var(--fs-review-label)",letterSpacing:".03em"}}>{item.label}</span>
                      {/* Spanish text runs noticeably longer than English
                          (a QA pass caught "Combustible Dual - bomba de
                          calor + h…" truncating mid-word under the
                          English-tuned nowrap+ellipsis below) - under the
                          Spanish toggle this cell wraps instead of
                          clipping, same as closet's cell already does.
                          Both languages now prefer the shorter `short`
                          wording where one exists (full detail is still one
                          hover/tap away via the native title tooltip below) -
                          English used to fall back to the full, un-
                          shortened `val` here even after the wording pass
                          added `short` fields, which meant this bar kept
                          showing e.g. "Enhanced Filtration Cabinet +
                          Ionizer + …" ellipsis-clipped in English even
                          though the exact same build's Spanish row already
                          showed the short "Filtro 5" + Ionizador + …" - the
                          two languages were silently out of sync. On screen
                          that's recoverable (the title="" tooltip below
                          still has the full text on hover) - on paper
                          there's no hover, so the .review-val print
                          override in styles.css forces this span to wrap
                          instead of clip once printed, regardless of
                          language. The className only matters for that
                          print rule; on-screen behavior (including
                          English's single-line clip) is unchanged. */}
                      <span className="review-val" style={lang==='es'
                        ?{color:"rgba(255,255,255,.9)",fontFamily:"var(--fb)",fontSize:"var(--fs-review-val)",lineHeight:1.2,overflow:"visible",whiteSpace:"normal"}
                        :{color:"rgba(255,255,255,.9)",fontFamily:"var(--fb)",fontSize:"var(--fs-review-val)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                        title={item.val}>{item.short||item.val}</span>
                      {/* MOBILE QA FIX - vertical padding bumped from 3px to
                          6px (measured ~19px tall before, under the 24px
                          WCAG 2.5.8 AA touch-target floor); lands at ~25px,
                          with margin to spare before overlapping the cell's
                          own content. */}
                      <button className="no-print review-edit-btn" onClick={()=>jumpToStep(item.step)} style={{position:"absolute",top:4,right:4,fontSize:"var(--fs-review-edit)",padding:"6px 6px"}}>{tr('EDIT','EDITAR')}</button>
                    </div>
                    :isLastSpanning?
                    // QA FIX - the lone odd-count cell spans both columns
                    // (see styles.css's own :last-child:nth-child(2n+1)
                    // rule this mirrors), which used to just hand the
                    // normal stacked closet cell below twice the width and
                    // let it sit there unused - "too wide" for content this
                    // short, per direct feedback. A single compact line
                    // (label + value + EDIT, all inline) actually spends
                    // that width instead, cutting this row from ~4 stacked
                    // lines down to 1 and buying back real vertical room for
                    // the Get Pricing button below on a short viewport.
                    // QA FIX - this row's label+value used to sit in a fixed-
                    // nowrap flex pair (`flexShrink:0` label, `nowrap`+
                    // `ellipsis` value), which read fine for short English
                    // copy but silently truncated real data once the value
                    // ran long (a longer non-IAQ `val` landing here as the
                    // odd one out) or the label itself ran long (Spanish
                    // labels routinely do) - same failure mode attic's own
                    // cell above already had to fix for Spanish. This row
                    // has the full grid width to spend and no fixed-height
                    // panel forcing a single line (unlike attic's 200px
                    // bar), so instead of clipping, the label+value pair
                    // gets `flex:1` (uses the space before the EDIT chip
                    // claims its own) and wraps normally - full text always
                    // reaches the screen, at the cost of an occasional
                    // second line instead of losing data.
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"6px 10px",background:i%2===0?"rgba(255,255,255,.02)":"transparent",border:"1px solid rgba(215,183,64,.1)",minWidth:0}}>
                      <div style={{display:"flex",flexWrap:"wrap",alignItems:"baseline",gap:8,flex:1,minWidth:0}}>
                        <span style={{color:"rgba(215,183,64,.68)",fontFamily:"var(--fm)",fontSize:"var(--fs-review-label-md)",letterSpacing:".03em"}}>{item.label}</span>
                        <span style={{color:"rgba(255,255,255,.9)",fontFamily:"var(--fb)",fontSize:"var(--fs-review-val-md)",overflowWrap:"break-word",whiteSpace:"normal"}}>{item.short||item.val}</span>
                      </div>
                      <button className="no-print review-edit-btn" onClick={()=>jumpToStep(item.step)} style={{fontSize:"var(--fs-review-edit-md)",padding:"6px 7px",flexShrink:0}}>{tr('EDIT','EDITAR')}</button>
                    </div>
                    :
                    // Closet's cell doesn't reserve a fixed right-hand gutter for
                    // an absolutely-positioned EDIT chip (that's what attic does
                    // above) - at 2-column width the chip's real rendered width
                    // didn't match a guessed gutter and ended up sitting on top
                    // of the label text. Putting EDIT in normal flow next to the
                    // value instead means it can never overlap anything: the
                    // value just wraps in whatever width is left beside it.
                    <div key={i} style={{display:"flex",flexDirection:"column",gap:1,padding:"5px 9px",background:i%2===0?"rgba(255,255,255,.02)":"transparent",border:"1px solid rgba(215,183,64,.1)",minWidth:0}}>
                      <span style={{color:"rgba(215,183,64,.68)",fontFamily:"var(--fm)",fontSize:"var(--fs-review-label-md)",letterSpacing:".03em"}}>{item.label}</span>
                      {/* Value gets the cell's full width to wrap in (previously
                          shared the row with the EDIT button, so a value long
                          enough to wrap - "Filtration Cabinet + UV Light",
                          "Yes - whole-home unit" - only got the button's
                          leftover ~2/3 width, wrapped to 3 short lines, and read
                          as if EDIT were sitting mid-sentence instead of
                          alongside it). EDIT sits on its own line bottom-right,
                          same as it already does for every other value short
                          enough to fit one line - and now `marginTop:"auto"`
                          pins it to the true bottom of the CELL, not just
                          below whatever the value wrapped to. CSS Grid
                          stretches every cell in a row to match its tallest
                          neighbor by default, so a short value paired next to
                          a long-wrapping one (e.g. "Wifi" beside "5" Filter +
                          Ionizer + UV + Surge") used to leave its EDIT button
                          sitting right under the short text with a dead gap
                          below it - the two buttons landed at different
                          heights and the row read as unbalanced. Pinning both
                          to the bottom means every EDIT button in a row lines
                          up on the same baseline regardless of how much either
                          value wrapped. */}
                      <span style={{color:"rgba(255,255,255,.9)",fontFamily:"var(--fb)",fontSize:"var(--fs-review-val-md)",lineHeight:1.25,overflow:"visible",whiteSpace:"normal"}} title={item.val}>{item.short||item.val}</span>
                      {/* MOBILE QA FIX - same 24px WCAG 2.5.8 touch-target
                          floor as attic's EDIT chip above; vertical padding
                          bumped from 4px to 6px. marginTop:"auto" already
                          pins it to the cell's bottom, so the extra height
                          just grows the cell slightly instead of risking
                          overlap with anything else in it. */}
                      <button className="no-print review-edit-btn" onClick={()=>jumpToStep(item.step)} style={{alignSelf:"flex-end",fontSize:"var(--fs-review-edit-md)",padding:"6px 7px",marginTop:"auto"}}>{tr('EDIT','EDITAR')}</button>
                    </div>));
                  })}
                </div>
              );
              return pricingFlow?
                <>
                  {/* Hidden while the embedded contact form is open - direct
                      feedback: this row, the leadgate heading/description and
                      the Back button below the form stacked up enough height
                      to push the form into a scroll. The leadgate block now
                      carries "system is built" + Edit selections in its own
                      single header row instead (see pricingFlow==='leadgate'). */}
                  {!(pricingFlow==='leadgate'&&GATE_CONFIG.embedFormUrl)&&<>
                  {/* QA FIX - direct feedback: trimmed this divider row's
                      own spacing (and the leadgate block's below) in attic
                      mode specifically - after shrinking the embedded
                      Gravity Form itself, this row + the leadgate heading/
                      description were the next-biggest remaining slice of
                      the "still a slight scroll" gap on a full page load.
                      Closet mode's narrow sidebar has its own scroll
                      already and wasn't part of that complaint, so left
                      unchanged there. */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",marginBottom:isAtticMode?6:10,paddingBottom:isAtticMode?6:10,borderBottom:"1px solid rgba(215,183,64,.15)"}}>
                    <span style={{fontSize:isAtticMode?"var(--fs-review-label)":"var(--fs-pricing-meta)",color:"rgba(255,255,255,.78)"}}>✓ {tr('Your system is built','Su sistema está construido')}</span>
                    <button className="no-print link-btn-gold" onClick={()=>setPricingFlow(null)} style={{fontSize:"var(--fs-review-edit)"}}>{tr('Edit selections','Editar selecciones')}</button>
                  </div>
                  </>}
                  {/* Hidden on-screen (see .print-only-grid in styles.css) -
                      exists purely so a printout taken while pricing is
                      engaged still has the full spec on it, not just the
                      one-line "system is built" header above. */}
                  <div className="print-only-grid">{reviewGrid(null)}</div>
                </>
              :
                <>
                  {/* QA FIX (attic only) - "Your System is Built" used to
                      sit in its own flex row ABOVE the grid, with no
                      relationship to the grid's own row-height logic. A
                      cell with a long combined value (e.g. the "IAQ
                      add-ons" row with both dehu and ERV picked) can grow
                      taller than a single-line cell, which is fine for the
                      GRID ROW it shares with its neighbors (CSS grid rows
                      already match their tallest cell), but read as broken
                      next to a fixed-height header that couldn't grow with
                      it. Passing this header in as reviewGrid's own leadCell
                      makes it a real grid cell in the first row/column
                      spot, sized by the exact same logic as every other
                      cell - it only needs a single compact line either
                      way, so there's nothing for it to overflow into
                      regardless of how tall neighboring cells get. Closet
                      keeps its own separate header (2-column grid, no
                      multi-part stacking issue to solve). */}
                  {isAtticMode?reviewGrid(
                    <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",background:"rgba(255,255,255,.02)",border:"1px solid rgba(215,183,64,.1)",minWidth:0}}>
                      <div className="done-icon-wrap"><div className="done-icon" style={{margin:0,width:20,height:20,fontSize:10,flexShrink:0}}>✓</div></div>
                      <div className="done-title" style={{fontSize:"var(--fs-review-val)",marginBottom:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tr('Your System is Built','Su Sistema Está Construido')}</div>
                    </div>
                  ):<>
                    {/* QA FIX - trimmed from marginBottom:12/42px icon/19px
                        title to buy back vertical room for the review grid
                        below on a short viewport (direct feedback: the gold
                        Get Pricing button needed scrolling to reach). */}
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,width:"100%"}}>
                      <div className="done-icon-wrap"><div className="done-icon" style={{margin:0,width:34,height:34,fontSize:16,flexShrink:0}}>✓</div></div>
                      <div>
                        {/* QA FIX - same English heading as the attic
                            compact header above was rendered as two
                            different Spanish strings ("Su Sistema
                            Construido" there vs "Su Sistema Está
                            Construido" here). A native-speaker
                            proofreading pass flagged the shorter version
                            (missing "está") as reading like a clipped
                            label rather than a complete sentence -
                            unified on this grammatically correct phrasing
                            instead (reversing an earlier, wrong-direction
                            fix that unified on the shorter one). */}
                        <div className="done-title" style={{fontSize:16,marginBottom:1}}>{tr('Your System is Built','Su Sistema Está Construido')}</div>
                        <div style={{fontSize:"var(--fs-review-label-lg)",color:"var(--mut)"}}>{tr('Review your selections below','Revise sus selecciones abajo')}</div>
                      </div>
                    </div>
                    {reviewGrid(null)}
                  </>}
                </>;
            })()}

            {/* ── PRICING GATE / SIZING / RESULT - only takes up room once
                 actually engaged; the entry point lives in the button grid
                 below instead of its own full-width row ── */}
            {pricingFlow!==null&&<div style={{width:"100%",marginBottom:12}}>
              {pricingFlow==='sizing'&&(()=>{
                // Just sqft now - the old "how many separate HVAC systems
                // does your home have?" sub-step never actually fed into
                // calcEstimate's math (systemsCount only ever changed
                // wording and added a disclaimer note), so dropping it lost
                // nothing but a click. The "want duct replacement priced
                // too?" sub-step is gone too as of this pass - direct
                // feedback: move it down to a checkbox (with the other
                // duct-related add-ons) instead of its own question, same
                // spirit as duct cleaning/new supply runs/etc already being
                // checkboxes rather than wizard steps. See wantDucts on the
                // price-reveal panel below - same pricingAnswers field,
                // same calcEstimate line item, just asked in a different
                // spot. That also fully retires the multi-state Next-button-
                // position problem a previous QA pass patched with
                // pricing-substep-content's min-height/centering (see
                // styles.css history) - with only one sub-step left, the
                // button has nowhere else to land, so that machinery came
                // out along with the ducts UI rather than being left behind
                // describing a problem that can't happen here anymore.
                const subSteps=['sqft'];
                const subId=subSteps[pricingSubStep];
                const goSubNext=()=>{
                  trackEvent('price_revealed');
                  setPricingFlow('result');
                };
                const goSubBack=()=>{
                  setPricingFlow(null);
                };
                // Half-ton sizes (1.5/2.5/3.5) are a Federal Minimum-only
                // catalog option - Mid/High Efficiency only stock full
                // tons. Cards for a size the tier doesn't offer used to
                // still be pickable and just silently billed at the
                // nearest whole ton instead, with nothing on screen
                // showing that substitution happened. Filtering the list
                // itself means there's no longer a card to silently
                // substitute - what you can pick is what gets billed.
                // (Hoisted to component level as tonnageOptionsForTier so
                // the quick-edit guard effect above shares this exact same
                // rule instead of a second copy of it.)
                const tonnageOptions=tonnageOptionsForTier;
                // Checked against the CURRENT tonnageOptions, not just "any
                // value is set" - a half-ton pick made before a quick-edit
                // bumped the tier to Mid/High no longer has a matching card
                // (none shows as selected), so it shouldn't silently count
                // as answered either.
                const canSubNext=tonnageOptions.some(o=>o.v===pricingAnswers.tonnageChoice);
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
                    {subId==='sqft'&&<>
                      <div style={{fontSize:isAtticMode?13:"var(--fs-pricing-q)",fontWeight:600,marginBottom:isAtticMode?2:4,lineHeight:isAtticMode?1.15:"normal",fontFamily:"var(--ft)"}}>{tr('What size system does this area need?','¿Qué tamaño de sistema necesita esta área?')}</div>
                      {/* QA FIX - direct feedback: drop the "enter your sq
                          ft" input - each tonnage card already shows its
                          own typical sq-ft range (see the option grid to
                          the right), so this description just points at
                          that instead of asking for a number nobody needs
                          to type.
                          QA FIX - the attic-mode copy used to say "your
                          home's sq ft," which is wrong for anyone with more
                          than one system (this card only sizes THIS one) -
                          closet mode already had the correct "the square
                          footage this system covers" phrasing, so unified
                          on that instead of carrying two different (and
                          contradictory) claims depending on layout. Added a
                          second line spelling out the multi-system case
                          explicitly, since "this system covers" alone is
                          easy to read past. */}
                      <div style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",marginBottom:isAtticMode?2:6,lineHeight:isAtticMode?1.15:1.5}}>
                        {tr("Pick the tonnage that best fits the square footage this system covers - each option shows its typical range.","Elija las toneladas que mejor se ajusten a los pies cuadrados que cubre este sistema - cada opción muestra su rango típico.")}
                      </div>
                      <div style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",marginBottom:isAtticMode?3:8,lineHeight:isAtticMode?1.15:1.5,fontStyle:"italic"}}>
                        {tr("Have more than one system? Base this on just the area that system covers, not your whole home.","¿Tiene más de un sistema? Base esto solo en el área que cubre ese sistema, no en toda su casa.")}
                      </div>
                    </>}
                  </div>
                );
                const right=(
                  <div style={{flex:1,minWidth:0}}>
                    {subId==='sqft'&&(()=>{
                      // sqftInput has no UI to set it anymore (the input
                      // field itself was removed - see the QA FIX on the
                      // description text above) - this only ever has a
                      // value now for someone resuming a build saved
                      // before that removal shipped. Left as a harmless
                      // no-op for new visitors rather than ripped out, so
                      // that narrow case still gets its SUGGESTED badge
                      // instead of silently losing it.
                      const sqftNum=parseInt(pricingAnswers.sqftInput)||0;
                      const recommended=nearestTonnageOption(sqftNum,tonnageOptions);
                      {/* QA FIX - direct feedback: this grid's "right"
                          column is flex:1 inside the attic bottom panel,
                          which can run 1500px+ wide on a large monitor -
                          with columns at a bare 1fr, 3-4 cards stretched to
                          fill all of it, leaving each one a huge mostly-
                          empty box around a couple lines of small
                          .opt-compact text. Everything above this step
                          (the diagram) fills its space with real content;
                          these cards had nothing to fill theirs with, so
                          they just looked unfinished by comparison.
                          minmax(140px,220px) caps how wide any one card can
                          grow - extra space is left blank instead of
                          stretching the cards - and dropping opt-compact in
                          favor of the same .opt sizing the rest of the
                          wizard's option cards use gives them the same
                          padding/font weight as everything else, instead of
                          the tight sidebar-tuned compact variant. */}
                      {/* QA FIX - repeat(N,minmax(140px,220px)) (a fixed
                          column count) forced ALL N tracks into whatever
                          width the container had, even when N*140px+gaps
                          didn't fit - confirmed at 1100px wide with the
                          fedmin tier's 7-card half-ton catalog, where the
                          grid overflowed its container and the last couple
                          cards bled off the visible panel instead of
                          wrapping. auto-fit lets the browser wrap extra
                          cards onto additional rows once they stop fitting,
                          same as it already did before this same-line QA
                          FIX capped the max width - the sqftGridOrphans
                          effect above already exists specifically to handle
                          a lone card stranded on its own wrapped row, so
                          multi-row wrapping here is a supported case, not a
                          new one. */}
                      return <div ref={sqftGridRef} className={isAtticMode?"pricing-opts-sqft":undefined} style={{display:"grid",gridTemplateColumns:isAtticMode?"repeat(auto-fit,minmax(140px,220px))":"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                        {tonnageOptions.map((o,i)=>(
                          <button key={o.v} className={"opt"+(pricingAnswers.tonnageChoice===o.v?" sel":"")}
                            // see the sqftGridOrphans QA FIX above this
                            // component's return - fills the dead gap
                            // beside ANY lone card left alone on its own
                            // row (not just the grid's final row) instead
                            // of leaving it stranded at its normal
                            // 1-column width.
                            style={sqftGridOrphans.has(i)?{gridColumn:"1 / -1"}:undefined}
                            onClick={()=>setPricingAnswers(p=>({...p,tonnageChoice:o.v}))}>
                            {/* QA FIX - direct feedback: even capped at
                                220px wide, the cards still left the fixed-
                                height attic sidebar mostly empty below the
                                Get My Estimate button (measured ~100px of
                                dead space at 1980px wide). Rather than pad
                                the box out with nothing in it, sized up the
                                one number that actually matters here - same
                                "make the real number bigger" language the
                                diagram's own temperature readouts and the
                                price card's hero figure already use - so
                                the extra room goes to bigger, easier-to-
                                read text instead of empty padding. Scoped
                                to attic mode only; the closet sidebar is a
                                normal-height scrolling column with no dead
                                space to fill, so its cards are unchanged. */}
                            <div className="opt-inner" style={isAtticMode?{padding:"20px 16px"}:undefined}><div className="opt-body">
                              <span className="opt-label" style={isAtticMode?{fontSize:24,lineHeight:1.2}:undefined}>{tr(o.label,o.labelEs)}{recommended&&recommended.v===o.v&&<span className="opt-badge">{tr('SUGGESTED','SUGERIDO')}</span>}</span>
                              <span className="opt-desc" style={isAtticMode?{fontSize:14,marginTop:4}:undefined}>{isAtticMode?tr(o.sqftLabel,o.sqftLabelEs):tr(`Typical for ${o.sqftLabel} homes`,`Típico para casas de ${o.sqftLabelEs}`)}</span>
                            </div></div>
                          </button>
                        ))}
                      </div>;
                    })()}
                  </div>
                );
                {/* key={pricingSubStep} forces a remount per sub-step so
                    the .fadein utility plays on each question/option swap,
                    same fix and rationale as the wizard's .attic-info /
                    .step-hdr above - this panel had the identical
                    instant-pop-in gap since none of its content changes
                    identity between sub-steps otherwise. */}
                // no-print: this is a live, mid-flow question (radio cards,
                // a sq-ft input, a vent-count field) - meaningless on paper,
                // and its own dark on-screen styling was never adapted for
                // print the way the sizing/result price card was (see the
                // print media block in styles.css), so it rendered as
                // stray unstyled buttons under the letterhead. Hitting
                // Save/Print while pricing is still on the sizing sub-steps
                // already gets the full review grid via .print-only-grid
                // above (see its own comment) - that's the printable
                // stand-in for whatever this in-progress panel is showing.
                return <div key={pricingSubStep} className="fadein no-print" style={{border:"1px solid rgba(215,183,64,.2)",padding:isAtticMode?"10px 14px":12}}>
                  {/* .5 measured 3.20:1 against the panel background this
                      sits on - under the 4.5:1 minimum for this 9-10.5px
                      label. .7 clears it at 5.06:1. QA FIX - this used to
                      show a "STEP X OF Y" counter plus a segmented progress
                      bar (subSteps.map(...)) back when this flow had 2
                      sub-steps (sqft + ducts). With ducts moved down to a
                      checkbox (see the a-la-carte add-ons on the result
                      panel below), there's only ever one sub-step left, so
                      a step counter showing "STEP 1 OF 1" would just look
                      broken instead of removed - dropped both along with
                      the ducts UI itself rather than left rendering a
                      counter for a sequence that no longer exists. */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:isAtticMode?5:9}}>
                    {/* QA FIX - contrast audit measured this at 4.36:1
                        against its card background, under the 4.5:1 AA
                        floor - same shortfall class as the other
                        rgba(215,183,64,...) eyebrow labels on this
                        screen (AS LOW AS/ESTIMATED PRICE below), all
                        bumped to .85 alpha for real margin (measures
                        5.9-7.2:1 depending on which of this app's dark
                        backgrounds it lands on) rather than just barely
                        clearing the threshold. */}
                    <div style={{fontSize:isAtticMode?9:10.5,color:"rgba(215,183,64,.85)",letterSpacing:".1em",fontFamily:"var(--fm)"}}>{tr('PRICING','PRECIO')}</div>
                  </div>

                  {/* alignItems:"flex-start" only makes sense in ROW mode
                      (attic, wide) where it top-aligns two columns of
                      differing height. In COLUMN mode - closet (always) and
                      attic once the <=860px media query below flips this
                      row to a column - flex-start is a cross-axis (now
                      HORIZONTAL) rule instead: it shrinks {left}/{right} to
                      their own content width instead of the container's
                      full width, since their flex:1 only governs the
                      vertical main axis once stacked. Short button grids
                      (systems' 1/2/3+) collapsed to a narrow single column
                      instead of using the real available width. */}
                  <div className={isAtticMode?"pricing-substep-row":undefined} style={{display:"flex",flexDirection:isAtticMode?"row":"column",gap:isAtticMode?20:8,alignItems:isAtticMode?"flex-start":"stretch"}}>
                    {left}
                    {right}
                  </div>

                  <div style={{display:"flex",gap:8,marginTop:isAtticMode?8:12}}>
                    <button className="btn-back" style={{flex:"0 0 auto",...(isAtticMode?{padding:"6px 16px",fontSize:14}:{})}} onClick={goSubBack}>‹ {tr('Back','Atrás')}</button>
                    {/* Small excitement idea: once this is the last sub-step
                        AND it's actually answered, the button that reveals
                        the price gets a gentle gold pulse - reuses
                        .info-btn's own always-on glow animation verbatim
                        (same color, same "there's something here" idea)
                        rather than a new one, and is gated on :not(:disabled)
                        in CSS so a still-greyed-out button never glows (that
                        would read as broken, not inviting). */}
                    <button className={"btn-next"+(pricingSubStep===subSteps.length-1&&canSubNext?" btn-cta-glow":"")} style={{flex:1,...(isAtticMode?{padding:"7px 16px",fontSize:15}:{})}} disabled={!canSubNext} onClick={goSubNext}>
                      {pricingSubStep===subSteps.length-1?tr("Get My Estimate","Obtener Mi Estimado"):tr("Next","Siguiente")}
                    </button>
                  </div>
                </div>;
              })()}

              {/* Contact-form gate - only reachable when GATE_CONFIG.gravityFormId
                  is set (see goSubNext above and data.js). Waits on the
                  leadUnlocked detection effects above; auto-advances to
                  'sizing' the moment that flips true, so a homeowner who
                  submits the form never has to click anything in here.
                  With GATE_CONFIG.embedFormUrl set, the form itself is
                  embedded right here via <iframe> - no separate form
                  elsewhere on the page to find. Falls back to the old
                  "scroll down to find it" copy if embedFormUrl is unset
                  (form still placed elsewhere on the WordPress page). */}
              {pricingFlow==='leadgate'&&<div key="leadgate" className="fadein no-print" style={{border:"1px solid rgba(215,183,64,.2)",padding:isAtticMode?"6px 12px":12}}>
                {GATE_CONFIG.embedFormUrl?<>
                  {/* Direct feedback: the "system is built" row, Edit
                      selections, this heading/description and a Back button
                      under the form stacked into a scroll. Collapsed into one
                      header row (Back and Edit selections did the same thing -
                      setPricingFlow(null) - so they're one link now) plus a
                      single short description line, so the form fits. */}
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:isAtticMode?2:4}}>
                    <div style={{fontSize:isAtticMode?13:"var(--fs-pricing-q)",fontWeight:600,fontFamily:"var(--ft)"}}>
                      <span style={{fontWeight:400,color:"rgba(255,255,255,.78)"}}>✓ {tr('Your system is built','Su sistema está construido')} · </span>
                      {tr('Almost there - just one quick step','Ya casi termina - solo un paso rápido')}
                    </div>
                    <button className="link-btn-gold" onClick={()=>setPricingFlow(null)} style={{fontSize:"max(12px, var(--fs-review-edit))",flex:"0 0 auto"}}>‹ {tr('Edit selections','Editar selecciones')}</button>
                  </div>
                  <div className="leadgate-desc" style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",lineHeight:1.4,marginBottom:isAtticMode?4:8}}>
                    {tr('Fill out this short form to unlock pricing - it continues here automatically.','Complete este formulario breve para ver los precios - continuará aquí automáticamente.')}
                  </div>
                  <div style={{position:"relative"}}>
                  <iframe ref={leadIframeRef} src={GATE_CONFIG.embedFormUrl} title={tr('Contact form','Formulario de contacto')}
                    onLoad={()=>{styleLeadForm();}}
                    style={{width:"100%",height:420,border:"none",display:"block",background:"transparent",borderRadius:4,opacity:leadFormShown?1:0,transition:"opacity .25s ease"}}/>
                  {!leadFormShown&&<div className="leadgate-loading" aria-hidden="true">{tr('Loading the form…','Cargando el formulario…')}</div>}
                  </div>
                </>:<>
                  <div style={{fontSize:isAtticMode?13:"var(--fs-pricing-q)",fontWeight:600,marginBottom:isAtticMode?4:6,fontFamily:"var(--ft)"}}>{tr('Almost there - just one quick step','Ya casi termina - solo un paso rápido')}</div>
                  <div style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",lineHeight:1.5,marginBottom:12}}>
                    {tr('Scroll down on this page to find the short form - fill it out to unlock pricing. It continues right here automatically, no need to click anything else.','Desplácese hacia abajo en esta página para encontrar el formulario breve - complételo para desbloquear los precios. Continuará aquí automáticamente, sin necesidad de hacer clic en nada más.')}
                  </div>
                  <button className="btn-back" style={{padding:isAtticMode?"6px 16px":"8px 16px",fontSize:isAtticMode?14:"var(--fs-pricing-fine)"}}
                    onClick={()=>setPricingFlow(null)}>‹ {tr('Back','Atrás')}</button>
                </>}
              </div>}

              {/* Wrapped in its own key'd+fadein div for the same reason as
                  the sizing sub-steps above - this result panel replaces
                  the sizing UI in place with no DOM identity change, so
                  without this it popped in instantly (the CashCount price
                  digits were the only thing that animated in). */}
              {pricingFlow==='result'&&<div key="result" className="fadein">{(()=>{
                const est=calcEstimate(answers,pricingAnswers);
                if(!est)return<div style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)"}}>{tr("Couldn't calculate an estimate for this combination yet - call us and we'll get you a number.","Aún no podemos calcular un estimado para esta combinación - llámenos y le daremos un número.")}</div>;
                // Attic's wide-short panel doesn't need this stacked
                // full-width - splitting the price card and the
                // considerations panel into side-by-side columns cuts the
                // scroll this page needs roughly in half. Closet's tall
                // narrow sidebar keeps the original single-column stack.
                // Base system vs. every add-on the homeowner opted into -
                // both real numbers calcEstimate already produced (nothing
                // invented or separately rounded here, basePct/addonsPct
                // are derived from the same already-rounded `l.display`
                // figures the itemized list below shows, so they can never
                // disagree with it). Only meaningful when there's actually
                // an add-on to compare against - a 100%-base bar is a
                // chart with nothing to say, so it's skipped entirely
                // rather than rendered empty/degenerate.
                // QA FIX - per direct feedback, "base" used to be ONLY
                // lines[0] (the tonnage/system line) - everything else,
                // including the ductboard/sheet-metal plenum a customer
                // was REQUIRED to choose in a mandatory, non-skippable
                // wizard step ("New supply plenum needed?", never a
                // checkbox), got lumped into "Add-ons" right alongside
                // genuinely optional comfort items like the dehumidifier
                // or ERV. A customer skimming "Add-ons · 52%" could
                // reasonably read that as "over half my price is optional
                // extras I could decline," when part of that was actually
                // required ductwork. REQUIRED_LINE_KEYS now folds every
                // line that comes from a mandatory wizard answer (tonnage,
                // the plenum choice, and the 90% AFUE furnace upgrade a
                // spray-foam-attic answer forces) into "Base system" -
                // "Add-ons" is left meaning only what a customer actually
                // opted into via an a-la-carte checkbox on this same card.
                const REQUIRED_LINE_KEYS=new Set(['tonnage','furnace90','plenum']);
                const addonLines=est.lines.filter(l=>!REQUIRED_LINE_KEYS.has(l.key));
                const baseTotal=est.lines.filter(l=>REQUIRED_LINE_KEYS.has(l.key)).reduce((s,l)=>s+l.display,0);
                const basePct=est.display>0?Math.round(baseTotal/est.display*100):100;
                const addonsPct=100-basePct;
                const wisetack=FINANCING_OPTIONS.find(f=>f.key==='wisetack'&&f.url);
                const priceCard=(
                  <div className="price-card" style={{border:"1px solid rgba(215,183,64,.3)",background:"rgba(215,183,64,.05)",padding:12}}>
                    {/* ── PRICE HERO — per direct feedback (a fresh-eyes UX
                        pass flagged the monthly figure as the FIRST number
                        a homeowner saw, ahead of the actual total, cutting
                        against this app's own "transparent pricing, zero
                        pressure" pitch), the real total now leads and gets
                        equal top billing: same bordered .price-hero card,
                        same 48px type, same one-shot gold reveal glow
                        (.price-hero::before, styles.css) as the monthly
                        figure right below it - neither one visually
                        outranks the other, and the number a homeowner
                        would actually total up their own spend against
                        is the first thing they read. The monthly figure
                        keeps its own full-size hero treatment right after
                        (still the number people actually budget against
                        day to day - that reasoning didn't change, it's
                        just no longer FIRST). Wisetack's prequalify link
                        lives in the monthly card, right under the number
                        it actually applies to. */}
                    <div className="price-hero">
                      {/* QA FIX - see the 'PRICING' eyebrow's own comment
                          above - same contrast shortfall, same fix. */}
                      <div style={{fontSize:"var(--fs-pricing-fine)",color:"rgba(215,183,64,.85)",letterSpacing:".1em",marginBottom:4,fontFamily:"var(--fm)"}}>{tr('ESTIMATED PRICE','PRECIO ESTIMADO')}</div>
                      {/* PRINT QA FIX - CashCount (canvas.js) re-animates
                          from $0 over 900ms on every `value` change (each
                          digit reels independently, but still lands from
                          scratch), including a
                          checkbox toggle re-triggering it, not just the
                          first reveal. window.print()/a PDF capture snapshots
                          whatever the DOM happens to show at that instant -
                          hit Save/Print while that 900ms animation is still
                          in flight (very plausible right after checking the
                          labor-warranty/maintenance-plan box, or right after
                          the reveal itself) and the printed hero number is
                          some partial mid-count value that doesn't match the
                          itemized total below it, which was never animated.
                          Confirmed by printing the same build state ~1s
                          apart: the earlier capture's hero number didn't
                          match its own line-item sum, the later one did.
                          .price-live/.price-static (styles.css, @media
                          print) swap to the plain final number for print
                          only - on-screen animation is untouched. */}
                      <div style={{fontFamily:"var(--fm)",fontSize:48,fontWeight:700,color:"var(--gl)",lineHeight:1}}>~$<span className="price-live"><CashCount value={est.display} format={fmtPrice}/></span><span className="price-static">{fmtPrice(est.display)}</span></div>
                    </div>
                    <div className="price-hero">
                      {/* QA FIX - see the 'PRICING' eyebrow's own comment
                          above - same contrast shortfall, same fix. */}
                      <div style={{fontSize:"var(--fs-pricing-fine)",color:"rgba(215,183,64,.85)",letterSpacing:".1em",marginBottom:4,fontFamily:"var(--fm)"}}>{tr('AS LOW AS','DESDE')}</div>
                      <div style={{fontFamily:"var(--fm)",fontSize:48,fontWeight:700,color:"var(--gl)",lineHeight:1}}>~$<span className="price-live"><CashCount value={Math.round(est.display/36)} format={fmtPrice}/></span><span className="price-static">{fmtPrice(Math.round(est.display/36))}</span><span style={{fontSize:18,color:"var(--dim)",fontWeight:400}}>{tr('/mo','/mes')}</span></div>
                      {/* This 36mo/0% figure is a real Wells Fargo program,
                          but not a self-serve one - GES has to send the
                          customer a direct application link personally, so
                          it can't just sit here captioned as if clicking
                          the Wisetack link right below gets you this same
                          offer (Wisetack's own terms are separate and not
                          guaranteed to match). Caption now names Wells
                          Fargo and points to asking GES directly; the
                          Wisetack link is worded as a distinct, separate
                          "or" option instead of implying it's the source
                          of the number above it. */}
                      {/* QA FIX - direct feedback: dropped "ask your comfort
                          advisor" - the Wisetack link right below already
                          gives a self-serve path, so the Wells Fargo line
                          doesn't need to send the reader elsewhere too. */}
                      <div style={{fontSize:"var(--fs-pricing-meta)",color:"var(--mut)",marginTop:6}}>{tr('Based on 36 months at 0% APR through Wells Fargo, subject to approved credit.','Basado en 36 meses al 0% de interés a través de Wells Fargo, sujeto a aprobación de crédito.')}</div>
                      {wisetack&&<a href={wisetack.url} target="_blank" rel="noopener" className="price-hero-financing-link no-print"
                        onClick={()=>trackCtaOnce('financing_clicked',{lender:'wisetack',source:'price_reveal'})}>
                        {tr('→ Or prequalify online with Wisetack','→ O precalifique en línea con Wisetack')}
                      </a>}
                    </div>
                    {addonLines.length>0&&<div className="price-breakdown">
                      <div className="price-breakdown-bar">
                        <div className="price-breakdown-seg base" style={{width:basePct+"%"}}/>
                        <div className="price-breakdown-seg addons" style={{width:addonsPct+"%"}}/>
                      </div>
                      <div className="price-breakdown-legend">
                        <span><span className="price-breakdown-dot base"/>{tr('Base system','Sistema base')} · {basePct}%</span>
                        <span><span className="price-breakdown-dot addons"/>{tr('Add-ons','Complementos')} · {addonsPct}%</span>
                      </div>
                    </div>}
                    <div style={{marginBottom:10}}>
                      {est.lines.map((l,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.05)",fontSize:"var(--fs-pricing-line)"}}>
                          {/* textAlign:left - the panel's centered text-align
                              otherwise inherits in here, so a label long
                              enough to wrap (e.g. "3-ton system - Mid
                              Efficiency - 18 SEER2" at closet's sidebar
                              width) centered its lines while every other
                              line item sat flush left. */}
                          <span style={{color:"var(--dim)",textAlign:"left"}}>{trLineLabel(l)}</span>
                          <span style={{color:"rgba(255,255,255,.85)",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>~${fmtPrice(l.display)}</span>
                        </div>
                      ))}
                    </div>
                    {/* Extended labor warranty - an add-on at the end of
                        pricing, not its own wizard question. Checking it
                        adds a real line item above via calcEstimate. */}
                    {/* QA FIX - automated pass measured this checkbox's
                        native glyph at 13x13px with the whole label row
                        only ~15-19px tall for single-line labels - under
                        this app's own established 24px WCAG 2.5.8 AA
                        touch-target floor (see the review-row Edit
                        button's own QA FIX comment, ~line 1920, which
                        applied the same fix pattern there). The label
                        already makes the WHOLE row clickable (not just
                        the tiny glyph), so the fix is vertical padding to
                        get the row itself to 24px+, not resizing the
                        checkbox glyph. */}
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--fs-pricing-line)",color:"var(--dim)",padding:"5px 0",cursor:"pointer"}}>
                      <input type="checkbox" checked={!!pricingAnswers.wantLaborWarranty}
                        onChange={e=>setPricingAnswers(p=>({...p,wantLaborWarranty:e.target.checked}))}/>
                      {tr(`Add a 10-year labor warranty (+$${fmtPrice(PRICING.laborWarranty10yr)})`,`Agregar garantía de mano de obra de 10 años (+$${fmtPrice(PRICING.laborWarranty10yr)})`)}
                    </label>
                    {/* QA FIX - a fresh-eyes copy pass caught this checkbox
                        sitting right under what used to be a "10-year
                        manufacturer parts warranty" disclaimer on the price
                        card, both using the identical "10-year warranty"
                        phrase with nothing distinguishing "already included,
                        free" from "optional, $1,750" - that parts-vs-labor
                        split only existed if a customer thought to open the
                        FAQ's own warranty entry. Short always-visible line
                        instead of requiring that detour.
                        QA FIX - direct feedback trimmed the price card's own
                        manufacturer-warranty sentence (this is the only
                        remaining on-page mention outside the FAQ), so this
                        no longer says "above" - the fact stands on its
                        own instead of pointing at text that isn't there
                        anymore. */}
                    <div style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)",margin:"0 0 10px 24px"}}>{tr('Covers technician time for a repair - a 10-year manufacturer parts warranty is already included at no charge.','Cubre el tiempo del técnico para una reparación - una garantía de piezas del fabricante de 10 años ya está incluida sin costo.')}</div>
                    {/* Duct replacement - used to be its own sizing sub-step
                        ("Want duct replacement priced too?") between the
                        tonnage question and the estimate reveal. Direct
                        feedback: move it down here as a checkbox instead,
                        same as duct cleaning/new supply runs/etc below -
                        "gets rid of a question" so the sizing flow is just
                        "what size is your home." Same pricingAnswers
                        fields (wantDucts/ventCount) and the exact same
                        calcEstimate line item as before - only where it's
                        asked changed, not the math. */}
                    {/* QA FIX - this label (and the two other checkboxes
                        below that also reveal a conditional "snap" panel
                        when checked: new supply duct runs, return plenum)
                        was missing the marginBottom:10 its siblings above/
                        below all carry, on the assumption the reveal
                        panel's own margin:"6px 0 10px 24px" would supply
                        the gap instead - true only while checked. Left
                        unchecked, nothing renders that bottom margin at
                        all, so the label sat flush (0px gap) against
                        whatever followed - most visible in print output
                        where "Add a return plenum" landed directly against
                        the closing disclaimer paragraph. Matching the
                        sibling pattern here costs a few extra px of gap
                        above the reveal panel once checked, which is fine. */}
                    {/* QA FIX - automated pass measured this checkbox's
                        native glyph at 13x13px with the whole label row
                        only ~15-19px tall for single-line labels - under
                        this app's own established 24px WCAG 2.5.8 AA
                        touch-target floor (see the review-row Edit
                        button's own QA FIX comment, ~line 1920, which
                        applied the same fix pattern there). The label
                        already makes the WHOLE row clickable (not just
                        the tiny glyph), so the fix is vertical padding to
                        get the row itself to 24px+, not resizing the
                        checkbox glyph. */}
                    {/* QA FIX - direct feedback: "spread it out from the
                        duct cleaning box" - this row's own marginBottom
                        (and the reveal panel's below) bumped from the
                        10px every other checkbox uses to give this one
                        extra breathing room before Duct Cleaning, checked
                        or not. */}
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--fs-pricing-line)",color:"var(--dim)",marginBottom:20,padding:"5px 0",cursor:"pointer"}}>
                      <input type="checkbox" checked={!!pricingAnswers.wantDucts}
                        onChange={e=>setPricingAnswers(p=>({...p,wantDucts:e.target.checked,...(e.target.checked&&!pricingAnswers.ventCount?{ventCount:1}:{})}))}/>
                      {tr(`Add duct replacement (+$${fmtPrice(roundTo25(PRICING.duct.replacementPerStem))}/vent)`,`Agregar reemplazo de ductos (+$${fmtPrice(roundTo25(PRICING.duct.replacementPerStem))}/rejilla)`)}
                    </label>
                    {pricingAnswers.wantDucts&&<div className="snap" style={{display:"flex",flexDirection:"column",gap:4,margin:"6px 0 20px 24px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)"}}>{tr('How many vents/registers?','¿Cuántas rejillas/registros?')}</span>
                      {/* Same 0-flash/"012"-artifact guard as the supply-run
                          stepper below (raw==='' checked before parseInt) -
                          see its comment for the full why. Min 1 (not 0)
                          here too, matching that stepper's cleaner floor
                          instead of the old sizing-step version's quirk of
                          letting the count reach 0 while still checked. 20
                          is the ceiling - the same real-incident rationale
                          as before (a 40-vent max once let a 1.5-ton system
                          carry a $36,800 duct-replacement line) - enforced
                          again in calcEstimate itself (data.js) regardless
                          of what reaches it from here. */}
                      <div className="vent-stepper">
                        <button type="button" className="vent-step-btn" aria-label={tr('Decrease','Disminuir')}
                          disabled={(pricingAnswers.ventCount||0)<=1}
                          onClick={()=>setPricingAnswers(p=>({...p,ventCount:Math.max(1,(p.ventCount||1)-1)}))}>−</button>
                        {/* QA FIX - caught by an automated QA pass: this
                            clamp still allowed 0 (Math.max(0,n)) while the
                            stepper buttons just above/below floor at 1
                            (p.ventCount||1) - typing "0" directly left the
                            checkbox checked with no price line (0 vents
                            charges nothing, with no warning it's not
                            actually included), and then clicking "+" from
                            that 0 jumped to 2, not 1, since 0 is falsy and
                            fell through to the ||1 default before adding.
                            Matches the new-supply-run stepper's own input
                            clamp (Math.max(1,n)) so typing and the buttons
                            agree on the same 1-20 floor everywhere. */}
                        <input id="pricing-vent-count-input" type="number" min="1" max="20" value={pricingAnswers.ventCount??''} onChange={e=>{
                          const raw=e.target.value;
                          if(raw===''){setPricingAnswers(p=>({...p,ventCount:undefined}));return;}
                          const n=parseInt(raw);
                          setPricingAnswers(p=>({...p,ventCount:Number.isNaN(n)?undefined:Math.min(20,Math.max(1,n))}));
                        }}
                        // QA FIX - automated pass: clearing this field to
                        // empty (select-all+delete, or a non-numeric paste
                        // that type=number rejects down to '') left
                        // ventCount:undefined with nothing to ever set it
                        // back - the checkbox stayed checked but
                        // calcEstimate's own ventCount||0 fallback (data.js)
                        // silently dropped the whole line, charging $0 with
                        // no visible warning. The undefined branch above has
                        // to stay (so you can clear-then-retype a new
                        // number while typing) - this restores a valid
                        // value only once you leave the field with nothing
                        // usable in it, same "fix it on blur, not on every
                        // keystroke" pattern as the stepper buttons already
                        // use for their own floor.
                        onBlur={()=>{if(!pricingAnswers.ventCount)setPricingAnswers(p=>({...p,ventCount:1}));}}
                        className="pricing-input vent-input"/>
                        <button type="button" className="vent-step-btn" aria-label={tr('Increase','Aumentar')}
                          disabled={(pricingAnswers.ventCount||0)>=20}
                          onClick={()=>setPricingAnswers(p=>({...p,ventCount:Math.min(20,(p.ventCount||1)+1)}))}>+</button>
                      </div>
                      </div>
                      {/* Live volume-discount hint - same tier lookup
                          (ductVolumeDiscountRate, data.js) the real
                          line-item price uses, so this can never drift
                          out of sync with what actually gets charged.
                          Ported over from the now-removed "new supply
                          duct run" add-on, which had this exact same
                          hint for its own quantity field.
                          QA FIX - a fresh-eyes UX pass flagged this
                          stepper defaulting to 1 vent as reading like a
                          misleadingly low "token" price for a job that's
                          rarely really just one vent. Not changing the
                          default itself (still an honest reflection of
                          "hasn't told us yet," and defaulting HIGHER
                          risks overpricing someone who genuinely only
                          needs 1-2) - added a nudge toward actually
                          counting instead. Deliberately no specific
                          number (e.g. "8-12 vents") - nothing in this
                          app's own established copy backs a number like
                          that, and this app avoids asserting unverified
                          business claims, so the fix is a general nudge
                          only shown while still at the default. */}
                      {(()=>{
                        const count=Math.min(20,Math.max(1,pricingAnswers.ventCount||1));
                        const rate=ductVolumeDiscountRate(count);
                        if(rate>0)return<span style={{fontSize:"var(--fs-pricing-fine)",color:"rgba(215,183,64,.85)"}}>{tr(`${Math.round(rate*100)}% volume discount applied`,`${Math.round(rate*100)}% de descuento por volumen aplicado`)}</span>;
                        return<span style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)"}}>
                          {count===1&&<>{tr('Most homes need more than one vent replaced - count yours for an accurate price. ','La mayoría de las casas necesita reemplazar más de una rejilla - cuente las suyas para un precio preciso. ')}</>}
                          {tr('Add 2+ for a discount, 10 for the biggest deal','Agregue 2+ para un descuento, 10 para la mejor oferta')}
                        </span>;
                      })()}
                    </div>}
                    {/* Duct cleaning - same a-la-carte checkbox pattern as
                        labor warranty/maintenance plan above. Used to be
                        purely educational text in the "Additional
                        Considerations" panel even though PRICING.duct.
                        cleaning already had real, tonnage-indexed prices for
                        it - per direct feedback ("I love the click to add a
                        price for different things") this is exactly the
                        kind of item that belongs up here as an actual
                        choice instead. */}
                    {/* QA FIX - automated pass measured this checkbox's
                        native glyph at 13x13px with the whole label row
                        only ~15-19px tall for single-line labels - under
                        this app's own established 24px WCAG 2.5.8 AA
                        touch-target floor (see the review-row Edit
                        button's own QA FIX comment, ~line 1920, which
                        applied the same fix pattern there). The label
                        already makes the WHOLE row clickable (not just
                        the tiny glyph), so the fix is vertical padding to
                        get the row itself to 24px+, not resizing the
                        checkbox glyph. */}
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--fs-pricing-line)",color:"var(--dim)",marginBottom:10,padding:"5px 0",cursor:"pointer"}}>
                      <input type="checkbox" checked={!!pricingAnswers.wantDuctCleaning}
                        onChange={e=>setPricingAnswers(p=>({...p,wantDuctCleaning:e.target.checked}))}/>
                      {tr(`Add duct cleaning (+$${fmtPrice(roundTo25(PRICING.duct.cleaning[est.tonnage]))})`,`Agregar limpieza de ductos (+$${fmtPrice(roundTo25(PRICING.duct.cleaning[est.tonnage]))})`)}
                    </label>
                    {/* New return duct / return plenum - same a-la-carte
                        checkbox pattern, using the real prices in
                        PRICING.duct that used to be plain educational text
                        in the "Additional Considerations" panel below (see
                        the QA FIX there). Direct feedback: "return plenum
                        and duct are usually just one" - unlike the now-
                        removed "new supply duct run" add-on, neither of
                        these two gets its own quantity field. */}
                    {/* QA FIX - automated pass measured this checkbox's
                        native glyph at 13x13px with the whole label row
                        only ~15-19px tall for single-line labels - under
                        this app's own established 24px WCAG 2.5.8 AA
                        touch-target floor (see the review-row Edit
                        button's own QA FIX comment, ~line 1920, which
                        applied the same fix pattern there). The label
                        already makes the WHOLE row clickable (not just
                        the tiny glyph), so the fix is vertical padding to
                        get the row itself to 24px+, not resizing the
                        checkbox glyph. */}
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--fs-pricing-line)",color:"var(--dim)",marginBottom:10,padding:"5px 0",cursor:"pointer"}}>
                      <input type="checkbox" checked={!!pricingAnswers.wantNewReturnDuct}
                        onChange={e=>setPricingAnswers(p=>({...p,wantNewReturnDuct:e.target.checked}))}/>
                      {tr(`Add a new return duct run (+$${fmtPrice(roundTo25(PRICING.duct.newReturnDuct))})`,`Agregar una línea de retorno nueva (+$${fmtPrice(roundTo25(PRICING.duct.newReturnDuct))})`)}
                    </label>
                    {/* QA FIX - automated pass measured this checkbox's
                        native glyph at 13x13px with the whole label row
                        only ~15-19px tall for single-line labels - under
                        this app's own established 24px WCAG 2.5.8 AA
                        touch-target floor (see the review-row Edit
                        button's own QA FIX comment, ~line 1920, which
                        applied the same fix pattern there). The label
                        already makes the WHOLE row clickable (not just
                        the tiny glyph), so the fix is vertical padding to
                        get the row itself to 24px+, not resizing the
                        checkbox glyph. */}
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--fs-pricing-line)",color:"var(--dim)",marginBottom:10,padding:"5px 0",cursor:"pointer"}}>
                      <input type="checkbox" checked={!!pricingAnswers.wantReturnPlenum}
                        onChange={e=>setPricingAnswers(p=>({...p,wantReturnPlenum:e.target.checked}))}/>
                      {tr(`Add a return plenum (+$${fmtPrice(roundTo25(PRICING.duct.returnPlenum[pricingAnswers.returnPlenumType==='metal'?'metal':'ductboard']))})`,`Agregar un plenum de retorno (+$${fmtPrice(roundTo25(PRICING.duct.returnPlenum[pricingAnswers.returnPlenumType==='metal'?'metal':'ductboard']))})`)}
                    </label>
                    {pricingAnswers.wantReturnPlenum&&<div className="snap" style={{display:"flex",alignItems:"center",gap:8,margin:"6px 0 10px 24px"}}>
                      <button type="button" className={"opt opt-compact"+(pricingAnswers.returnPlenumType!=='metal'?" sel":"")} style={{flex:"0 1 auto",padding:"5px 10px"}}
                        onClick={()=>setPricingAnswers(p=>({...p,returnPlenumType:'ductboard'}))}>
                        <div className="opt-inner"><div className="opt-body"><span className="opt-label">{tr('Ductboard','Ductboard')}</span></div></div>
                      </button>
                      <button type="button" className={"opt opt-compact"+(pricingAnswers.returnPlenumType==='metal'?" sel":"")} style={{flex:"0 1 auto",padding:"5px 10px"}}
                        onClick={()=>setPricingAnswers(p=>({...p,returnPlenumType:'metal'}))}>
                        <div className="opt-inner"><div className="opt-body"><span className="opt-label">{tr('Sheet metal','Lámina metálica')}</span></div></div>
                      </button>
                    </div>}
                    {/* Annual maintenance plan - per direct feedback, moved
                        to be the LAST a-la-carte add-on on this card (was
                        up top with labor warranty) - same reason its own
                        line item is now pushed last in calcEstimate
                        (data.js). "How many systems do you have?" stepper
                        mirrors the duct-replacement vent-count stepper
                        above; $100/additional system instead of a second
                        full $177 (see PRICING.maintenancePlanAdditionalSystem's
                        own comment). */}
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--fs-pricing-line)",color:"var(--dim)",marginBottom:10,padding:"5px 0",cursor:"pointer"}}>
                      <input type="checkbox" checked={!!pricingAnswers.wantMaintenancePlan}
                        onChange={e=>setPricingAnswers(p=>({...p,wantMaintenancePlan:e.target.checked,...(e.target.checked&&!pricingAnswers.maintenanceSystemCount?{maintenanceSystemCount:1}:{})}))}/>
                      {tr(`Add our annual maintenance plan (+$${fmtPrice(PRICING.maintenancePlanAnnual)}/yr)`,`Agregar nuestro plan de mantenimiento anual (+$${fmtPrice(PRICING.maintenancePlanAnnual)}/año)`)}
                    </label>
                    {pricingAnswers.wantMaintenancePlan&&<div className="snap" style={{display:"flex",alignItems:"center",gap:8,margin:"6px 0 10px 24px"}}>
                      <span style={{fontSize:"var(--fs-pricing-fine)",color:"var(--mut)"}}>{tr(`How many systems do you have? (+$${fmtPrice(PRICING.maintenancePlanAdditionalSystem)}/additional)`,`¿Cuántos sistemas tiene? (+$${fmtPrice(PRICING.maintenancePlanAdditionalSystem)}/adicional)`)}</span>
                      <div className="vent-stepper">
                        <button type="button" className="vent-step-btn" aria-label={tr('Decrease','Disminuir')}
                          disabled={(pricingAnswers.maintenanceSystemCount||0)<=1}
                          onClick={()=>setPricingAnswers(p=>({...p,maintenanceSystemCount:Math.max(1,(p.maintenanceSystemCount||1)-1)}))}>−</button>
                        <input type="number" min="1" max="6" value={pricingAnswers.maintenanceSystemCount??''} onChange={e=>{
                          const raw=e.target.value;
                          if(raw===''){setPricingAnswers(p=>({...p,maintenanceSystemCount:undefined}));return;}
                          const n=parseInt(raw);
                          setPricingAnswers(p=>({...p,maintenanceSystemCount:Number.isNaN(n)?undefined:Math.min(6,Math.max(1,n))}));
                        }}
                        // QA FIX - same checked-but-wrong-price desync guard
                        // as the duct-replacement vent-count input above
                        // (see its own comment): clearing this field to
                        // empty left maintenanceSystemCount:undefined with
                        // nothing to ever restore it.
                        onBlur={()=>{if(!pricingAnswers.maintenanceSystemCount)setPricingAnswers(p=>({...p,maintenanceSystemCount:1}));}}
                        className="pricing-input vent-input"/>
                        <button type="button" className="vent-step-btn" aria-label={tr('Increase','Aumentar')}
                          disabled={(pricingAnswers.maintenanceSystemCount||0)>=6}
                          onClick={()=>setPricingAnswers(p=>({...p,maintenanceSystemCount:Math.min(6,(p.maintenanceSystemCount||1)+1)}))}>+</button>
                      </div>
                    </div>}
                    {/* QA FIX - direct feedback: "doesn't look great" - this
                        used to be one dense, comma-heavy sentence crammed
                        under the checkbox at fine-print size, the only
                        thing in this list that read as a paragraph instead
                        of a scannable line - the labor warranty checkbox
                        right above has no description at all, so this one
                        stuck out. Same 6 perks, restructured into a tight
                        2-column checkmarked grid instead of a wall of text -
                        each fragment short enough to scan in one glance,
                        nothing dropped from the original list. */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"3px 10px",fontSize:"var(--fs-pricing-fine)",color:"var(--mut)",lineHeight:1.4,margin:"4px 0 10px 24px"}}>
                      {[
                        tr('2 seasonal tune-ups (AC + heating)','2 afinaciones estacionales (A/C y calefacción)'),
                        tr('Priority scheduling','Programación prioritaria'),
                        tr('10% off repairs','10% de descuento en reparaciones'),
                        tr('Waived consultation fees','Consultas sin cargo'),
                        tr('Free coil cleaning & drain flush','Limpieza de serpentín y drenaje gratis'),
                        tr('1 free service call for friends and family','1 visita de servicio gratis para familiares'),
                      ].map((perk,i)=>(
                        <div key={i} style={{display:"flex",gap:5,alignItems:"flex-start"}}>
                          <span style={{color:"rgba(215,183,64,.85)",flexShrink:0}}>✓</span><span>{perk}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:"var(--fs-pricing-meta)",color:"rgba(255,255,255,.68)",lineHeight:1.55,marginBottom:10}}>{tr("This is an estimate based on typical installs. Your final price is confirmed at your free in-home visit - we verify your existing equipment, take exact measurements, and make sure everything's accounted for.","Este es un estimado basado en instalaciones típicas. Su precio final se confirma en su visita gratuita a domicilio - verificamos su equipo actual, tomamos medidas exactas, y nos aseguramos de que todo esté contemplado.")}</div>
                    {/* Zoning used to be a permanently-showcased sticky
                        callout box next to the price card - per direct
                        feedback that was overkill for something only
                        relevant to the rare homeowner who already knows
                        what zoning is and is specifically curious (the
                        wizard itself never mentions zoning at all). Now a
                        plain FAQ button instead - opt-in, not showcased.
                        Resets openFaqKey to the first entry on every open,
                        so a previous visit's expanded question doesn't
                        carry over looking like the "featured" one.
                        QA FIX - a fresh-eyes UX pass caught this button and
                        "Adjust my answers" right after it rendering with
                        zero gap between them (two adjacent .done-restart
                        buttons, which has no margin of its own) - read as
                        one garbled "FAQ‹ Adjust my answers" string instead
                        of two separate clickable things. Wrapped both in
                        their own flex row with a visible gap so they read
                        as two distinct options.
                        QA FIX - direct feedback: both still used
                        .done-restart (a plain underlined text link, no
                        border/background/padding) while Edit System/Start
                        Over right below them in the Quick Actions row use
                        real bordered button classes - on the same screen,
                        two comparable actions read as an afterthought next
                        to two that read as buttons. Reuses .quick-print-btn
                        (same neutral chip already used for Save/Print) so
                        all the result-screen secondary actions share one
                        visual language.
                        QA FIX - direct feedback: this button's label used
                        to read "Adjust my answers," which sounds like it
                        reopens the whole wizard - it actually only redoes
                        the one sub-step left in the pricing sizing flow
                        (home sqft, which drives tonnage; see subSteps=
                        ['sqft'] above). Every other wizard answer already
                        has its own per-row EDIT button on the review grid
                        above, and "Edit System" in the Quick Actions row
                        below is the actual full-wizard reopen (which also
                        clears pricingAnswers, unlike this button). Renamed
                        to say exactly what it does instead.
                        QA FIX - direct feedback (again, after the first
                        pass): a tight flex row with an 8px gap still read
                        as one cluster rather than "two separate buttons" -
                        switched to the same grid pattern as the Quick
                        Actions row right below (repeat(auto-fit,minmax(
                        140px,1fr)), each button full-width within its own
                        cell) so these two are unmistakably as distinct and
                        as substantial as Financing/Save-Print/Edit System/
                        Start Over. */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
                      <button className="quick-print-btn" style={{width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",letterSpacing:".04em"}} onClick={()=>{setOpenFaqKey('price');setShowFaq(true);}}>{tr('FAQ','Preguntas Frecuentes')}</button>
                      <button className="quick-print-btn" style={{width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",letterSpacing:".04em",whiteSpace:"nowrap"}} onClick={()=>{setPricingFlow('sizing');setPricingSubStep(0);}}>‹ {tr('Adjust sq ft','Ajustar pies cuadrados')}</button>
                    </div>
                  </div>
                );
                return priceCard;
              })()}</div>}
            </div>}

            {/* ── QUICK ACTIONS - one compact button grid instead of five
                 stacked full-width rows, so this panel stays low and the
                 diagram keeps the room ── */}
            {/* QA FIX - direct feedback: FAQ was only reachable AFTER
                pricing (on the result screen), but a homeowner might have
                a zoning/warranty/financing question before ever clicking
                Get Pricing. Same FAQ button/modal, just also offered here -
                own full-width row so it doesn't compete with the gold CTA
                for tap-target size. */}
            {pricingFlow===null&&<div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",marginBottom:6}}>
              <button className="btn-next" style={{flex:"none",margin:0,width:"100%",padding:"9px",fontSize:14}} onClick={()=>{
                trackEvent('pricing_started');
                if(leadUnlocked){setPricingFlow('sizing');setPricingSubStep(0);}
                else{trackEvent('contact_form_shown');setPricingFlow('leadgate');}
              }}>💰 {tr('Get Pricing','Ver Precios')}</button>
              <button className="quick-print-btn" style={{width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",letterSpacing:".04em"}} onClick={()=>{setOpenFaqKey('price');setShowFaq(true);}}>{tr('FAQ','Preguntas Frecuentes')}</button>
            </div>}
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
            {/* QA FIX - a fresh-eyes UX pass caught this entire row
                (financing/print/email/back/start-over) rendering fully
                clickable regardless of pricingFlow - reachable before
                "Get Pricing" was ever clicked, and even while still
                mid-way through the sizing sub-steps. Financing linked
                straight out to Wisetack's real prequalify page, and
                Email sent a real mailto (cc'ing the office) with zero
                price context, before the customer had seen a single
                dollar figure - print already had a graceful pre-
                pricing fallback message (.print-only-fallback), which
                is exactly the "we already knew this state was
                reachable" signal that the fix just wasn't extended to
                the rest of the row. Gated the whole row behind the
                same pricingFlow==='result' condition that reveals the
                price card itself, so it only exists once there's an
                actual price to act on - the wizard's own per-step Back/
                Skip/Finish controls already cover navigation during
                sizing/leadgate. */}
            {pricingFlow==='result'&&<div className="no-print" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,width:"100%",marginBottom:8}}>
              {/* One button per configured financing option (see
                  FINANCING_OPTIONS in data.js) - an entry with no url
                  simply doesn't render here. */}
              {FINANCING_OPTIONS.filter(f=>f.url).map(f=>(
                <a key={f.key} href={f.url} target="_blank" rel="noopener" onClick={()=>trackCtaOnce('financing_clicked',{lender:f.key})} className="quick-financing-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",textDecoration:"none",textAlign:"center",boxSizing:"border-box"}}>💳 {tr(f.label,f.labelEs)}</a>
              ))}
              <button onClick={()=>{trackCtaOnce('print_clicked');window.print();}} className="quick-print-btn" style={{width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",letterSpacing:".08em"}}>⬇ {tr('Save / Print','Guardar / Imprimir')}</button>
              {/* QA FIX - per direct feedback, one button instead of the old
                  separate "Email a Copy to Yourself" + "Send to Our Office"
                  pair - blank-recipient mailto (opens the customer's own
                  mail app, nothing pre-addressed) that cc's GES's office
                  automatically (buildEmailHref's own comment), so the
                  label says so rather than leaving that cc silent. */}
              <a href={buildEmailHref()} onClick={()=>trackCtaOnce('email_build_clicked')} className="quick-print-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",fontFamily:"var(--fm)",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",letterSpacing:".08em",textDecoration:"none",boxSizing:"border-box",textAlign:"center"}}>✉ {tr('Email a Copy to Yourself (and Our Office)','Enviar Copia a Mi Correo (y a Nuestra Oficina)')}</a>
              {/* QA FIX - this drops back into the wizard's last step, same
                  as goBack's own "past step 1" branch and pickLocation/
                  restart/cancelQuickEdit all do - but unlike every one of
                  those, it never went through goBack() and never reset
                  pricingFlow/pricingSubStep/pricingAnswers. Repro: finish a
                  build, Get Pricing, pick a tonnage, Get My Estimate, then
                  click this Back button, change an earlier answer (e.g. the
                  efficiency tier, which can invalidate the tonnage already
                  picked), and walk forward to Finish again WITHOUT touching
                  pricing - it skipped the review grid entirely and dropped
                  straight back onto the old 'result' screen, silently
                  pricing whatever fallback tonnage calcEstimate defaults to
                  for a no-longer-valid tonnageChoice. Resetting here
                  (mirroring pickLocation's own reset of these same three
                  pieces of state) means re-finishing the build always lands
                  back on the plain review grid with a fresh Get Pricing
                  button.
                  QA FIX - a fresh-eyes UX pass caught that clearing
                  pricingAnswers here (the fix directly above) makes this
                  button meaningfully MORE destructive than "Adjust my
                  answers" on the price card right next to it (which only
                  re-opens the sizing screen, add-ons/quantities intact) -
                  yet both were labeled/styled identically, with nothing
                  signalling the difference, unlike "Start Over" which at
                  least names what it does. This button is for changing a
                  core system answer (tier, insulation, etc.), which is
                  exactly why the reset above has to stay - relabeled
                  instead of removing the fix, so the button is honest
                  about what happens rather than looking like a second,
                  interchangeable "go back" control. */}
              <button className="btn-back" style={{width:"100%",padding:"9px",fontSize:"var(--fs-restart)",justifyContent:"center"}} onClick={()=>{setDone(false);setStepIdx(activeSteps.length-1);setPricingFlow(null);setPricingSubStep(0);setPricingAnswers({});}}>‹ {tr('Edit System (clears pricing)','Editar Sistema (reinicia precios)')}</button>
              <button className="quick-restart-btn" style={{width:"100%",fontFamily:"var(--fb)",fontSize:"var(--fs-restart)",padding:"9px"}} onClick={restart}>{tr('Start Over','Empezar de Nuevo')}</button>
            </div>}
          </div>
        </div>
      </div>}
    </div>
  </>);
}


// ─── TOP-LEVEL ERROR BOUNDARY ───────────────────────────────────
// Last line of defense: this widget ships as a live lead-gen tool with no
// one actively watching it (see the provenance/ship-date context in this
// repo's own history) - an uncaught exception ANYWHERE in the tree below,
// with nothing catching it, unmounts the whole app to a blank white screen
// (React's default behavior since v18), and a homeowner staring at a blank
// iframe on the site just bails instead of retrying. This never repairs
// anything or hides a real bug (still throws to the console exactly as
// before, for anyone who does check later) - it only stands between "a bug
// somewhere" and "the entire page going blank with zero recovery path",
// swapping the blank screen for a plain apology + a refresh button.
// Deliberately minimal - a class component is the only way to implement
// getDerivedStateFromError/componentDidCatch, React has no Hooks
// equivalent - and deliberately narrow in scope: it does not attempt to
// recover in place (the state that got the app into a broken render could
// itself be the cause), just offers the one universally-safe way out.
class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={hasError:false};}
  static getDerivedStateFromError(){return{hasError:true};}
  componentDidCatch(error,info){
    // Still surfaces in the console/any error-monitoring tool exactly like
    // an uncaught exception normally would - this boundary only stops it
    // from taking the whole UI down with it, never silences it.
    console.error('GES System Builder - caught a render error:',error,info);
  }
  render(){
    if(this.state.hasError){
      return <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:24,textAlign:"center",background:"#121212",color:"rgba(255,255,255,.78)",fontFamily:"'Trebuchet MS',sans-serif"}}>
        <div style={{fontSize:18,fontWeight:700,color:"#f0d64e"}}>Something went wrong.</div>
        <div style={{fontSize:14,maxWidth:360}}>Please refresh the page to keep building your system - your progress up to your last step is saved automatically.</div>
        <button onClick={()=>window.location.reload()} style={{fontFamily:"'Trebuchet MS',sans-serif",fontSize:14,fontWeight:700,padding:"10px 24px",borderRadius:4,border:"none",background:"linear-gradient(90deg,#f0d64e,#d7b740,#ab8024)",color:"#121212",cursor:"pointer"}}>Refresh</button>
      </div>;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(<ErrorBoundary><App/></ErrorBoundary>);
