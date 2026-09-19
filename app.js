
const {useState,useMemo,useRef,useCallback}=React;

// ─── STEPS ──────────────────────────────────────────────────────
// Chapters turn a flat "step 4 of 9" into a story with acts - each step
// carries which act it belongs to, and the progress bar (built below)
// renders as named, segmented chapters instead of one anonymous sliver.
const CHAPTERS=['THE BASICS','THE ENGINE','COMFORT','FINAL TOUCHES'];
const STEPS=[
  {id:'location',    q:'Where is your indoor unit?', chapter:0,
    hint:'This sets the layout of your system visualization.',        optional:false},
  {id:'indoor_type', q:'Furnace or air handler?', chapter:0,
    hint:'Furnace = gas heat. Air handler = all-electric heat pump.', optional:false},
  {id:'insulation',  q:'What type of attic insulation do you have?', chapter:0,
    hint:'Fiberglass = 80% furnace. Spray foam = 90% furnace with PVC flue.', optional:false,
    showIf:a=>a.indoor_type==='furnace'},
  {id:'plenum',      q:'Need new ductwork at the unit?', chapter:1,
    hint:'This is the plenum - the box that distributes conditioned air from your unit into all your ducts.', optional:false},
  {id:'cond_tier',   q:"Pick your new system's efficiency tier.", chapter:1,
    hint:'Higher efficiency = lower monthly bills and better humidity control.', optional:false},
  {id:'system_for',  q:'Heat pump or straight cool?', chapter:1,
    hint:'Heat pump both heats and cools. Straight cool = AC only, furnace does all heating.', optional:false,
    // Mid efficiency only comes as dual fuel - nothing to actually choose,
    // so skip the step entirely instead of showing a single-card question.
    showIf:a=>a.indoor_type==='furnace'&&a.cond_tier!=='mid_ge15'},
  {id:'thermostat',  q:'Which thermostat?', chapter:2,
    hint:'Smart thermostats save 10–15% on energy bills.',            optional:false},
  {id:'purif',       q:'Any add-ons?', chapter:2,
    hint:'The enhanced filtration cabinet ships standard on every install already. Add any of these on top of that.',optional:true, multi:true},
  {id:'dehu',        q:'Add a whole-home dehumidifier?', chapter:2,
    hint:"Austin's humidity makes your home feel 7°F warmer. Runs automatically with your system.", optional:false},
  {id:'extras',      q:'Any final add-ons?', chapter:3,
    hint:'Condensate pump or ERV fresh-air system.', optional:true, multi:true},
];

// Auto-derive furnace_eff from insulation - never ask separately
function deriveFurnaceEff(insulation){
  return insulation==='spray'?'e90':'e80';
}

// ─── OPTION DEFS ────────────────────────────────────────────────
function getOpts(stepId, answers){
  switch(stepId){
    case 'location':return[
      {v:'attic', label:'Attic',          desc:'Horizontal install - most common in Austin'},
      {v:'closet',label:'Closet',desc:'Upflow unit - hallway or utility closet'},
    ];
    case 'indoor_type':return[
      {v:'furnace',label:'Furnace',     desc:'Gas heat + AC. Most popular in Austin - lowest operating cost when gas rates are low.'},
      {v:'ah',     label:'Air handler', desc:'All-electric heat pump. No gas line needed - efficient in Austin winters, costs more in extreme cold.'},
    ];
    case 'insulation':return[
      {v:'fiberglass',label:'Fiberglass batts / blown',desc:'Standard vented attic - pairs with an 80% AFUE furnace. Most homes in Austin have this.'},
      {v:'spray',     label:'Spray foam',               desc:'Sealed attic - requires a 90% AFUE furnace with a PVC flue. Higher efficiency, cooler attic.'},
    ];
    case 'plenum':return[
      {v:'ductboard',label:'Ductboard plenum',  desc:'Standard choice, good insulation value. Typical lifespan 10–15 years.'},
      {v:'metal',    label:'Sheet metal plenum',desc:'More durable, lasts 25+ years, better for indoor air quality.'},
      {v:'none',     label:'Keep existing',     desc:'Good condition already - we connect directly, saving on material and labor.'},
    ];
    case 'thermostat':
      if(answers.cond_tier==='high_ge18')return[
        {v:'proprietary',label:'Proprietary Communicating Thermostat', desc:'Required at this tier - talks directly to the system for the most precise comfort, staging, and diagnostics.'},
      ];
      return[
      {v:'basic',label:'Basic Programmable', desc:'Reliable, no app or subscription required. Set your schedule and it runs.'},
      {v:'wifi', label:'Wi-Fi Smart',   desc:'Control from your phone, learns your habits. Saves 10–15% on energy bills on average.',badge:true},
    ];
    case 'purif':return[
      // Enhanced Filtration Cabinet isn't listed - it's automatic on every
      // system (see defaultAnswers), not a real choice to present.
      {v:'uv',       label:'UV Light System',    desc:'Keeps the evaporator coil clean for longevity and efficiency. Eliminates musty odors at the source.'},
      {v:'ionizer',  label:'Ionizer / Plasma',   desc:'Neutralizes airborne particles, odors, VOCs, and smoke throughout your ducts.'},
      {v:'surge',    label:'Surge Protector',    desc:'Protects the compressor from voltage spikes and lightning. One strike can destroy a $2,000+ compressor.'},
    ];
    case 'system_for':
      if(answers.cond_tier==='mid_ge15')return[
        {v:'hp', label:'Dual Fuel (Heat pump + furnace)', desc:'Mid-efficiency is dual fuel only: heat pump cools and heats down to ~35°F, gas furnace takes over below that.'},
      ];
      return[
      {v:'hp', label:'Dual Fuel (Heat pump + furnace)', desc:'Heat pump handles most of the year, down to ~35°F. Furnace takes over below that. Lowest combined energy bill.'},
      {v:'sc', label:'Straight Cool',        desc:'AC cools only - furnace handles all heating year-round. Simpler system, lower upfront cost.'},
    ];
    case 'cond_tier':{
      return[
        {v:'fedmin',   label:'Federal Minimum - 14 SEER2', desc:'Meets 2023 federal energy code. Lowest upfront cost - good for rentals or budget installs.'},
        {v:'mid_ge15', label:'Mid Efficiency - 18 SEER2',  desc:'Variable-speed. Noticeably lower electric bills, better humidity control, quieter. Best overall value.'},
        {v:'high_ge18',label:'High Efficiency - 21 SEER2', desc:'Inverter-driven top tier, eligible for local rebates. Best humidity control, whisper-quiet.'},
      ];
    }
    case 'dehu':return[
      {v:'yes',label:'Yes - add it',  desc:'Sized to your square footage, runs automatically - no buckets, no maintenance. Feels 5–7°F cooler at the same setting.'},
      {v:'no', label:'No thanks',     desc:'Skip for now - can always be added later if humidity becomes an issue.'},
    ];
    case 'extras':return[
      {v:'condensate',label:'Condensate Pump',        desc:"Needed when there's no gravity drain nearby. Required in many closet installs."},
      {v:'erv',       label:'ERV (Energy Recovery)',  desc:'Brings in fresh filtered outdoor air while exhausting stale air, recovering ~70% of the heating/cooling energy.'},
    ];
    default:return[];
  }
}

// ─── PRICING DATA ───────────────────────────────────────────────
// Not wired into any UI yet - pure data, captured as it's confirmed so the
// schema only gets designed once. Whole dollars, complete installed bundle.
const PRICING={
  equipment:{
    // fedmin: 14 SEER2 - half-ton granularity, all three system types available
    fedmin:{
      straight_cool:{1.5:12465, 2:12767, 2.5:13300, 3:14051, 3.5:14975, 4:15695, 5:16504},
      dual_fuel:    {1.5:12894, 2:13047, 2.5:13973, 3:14337, 3.5:14978, 4:15410, 5:16286},
      heat_pump_ah: {1.5:11923, 2:12082, 2.5:13088, 3:13729, 3.5:13916, 4:14171, 5:15513},
    },
    // mid_ge15: 18 SEER2 - full tons only, no straight-cool at this tier
    mid_ge15:{
      dual_fuel:    {2:16348, 3:17521, 4:21577, 5:21577},
      heat_pump_ah: {2:13960, 3:15702, 4:17769, 5:18544},
    },
    // high_ge18: 21 SEER2 - full tons only, includes communicating system
    high_ge18:{
      straight_cool:{2:24564, 3:26259, 4:27822, 5:29834},
      dual_fuel:    {2:29052, 3:30480, 4:31395, 5:35634},
      heat_pump_ah: {2:23433, 3:26158, 4:29561, 5:31430},
    },
  },
  // Whole-home dehumidifiers, ductwork tie-in included. Capacity picked by
  // home/system sq ft - confirmed cutoffs, rounded from Honeywell/Aprilaire specs.
  dehu:{p65:6482, p90:7966, p120:8362},
  dehuSqftBreakpoints:{p65Max:2000, p90Max:3500}, // above p90Max => p120
  // Supply plenum upgrade. plenum:'none' (keep existing) has no charge.
  plenum:{ductboard:1920, metal:3121},
  // All furnace equipment pricing above assumes an 80% AFUE furnace. Spray-foam
  // attics require 90% AFUE (furnace_eff:'e90', auto-derived from insulation) -
  // that's a flat upgrade on top of the base price, furnace systems only (not
  // heat_pump_ah, which has no furnace/AFUE at all).
  furnace90Upgrade:1488,
  // Air purification add-ons. The enhanced filtration cabinet (purif:'aprilaire')
  // is bundled into every system at no charge, so it has no price here.
  purif:{uv:489, ionizer:1428},
  // Final add-ons. Thermostat (any tier/type) is always included with the system
  // - no separate charge, so there's no thermostat entry here either.
  // Note: new roof penetrations for the ERV need a roofer involved.
  extras:{surge:860, condensate:882, erv:{cfm130:5222, cfm150:5877}},
  // ERV size picked by home/system sq ft. Approximate - real ASHRAE 62.2 sizing
  // also factors bedroom count, which this tool doesn't ask, so this assumes a
  // typical 3-4BR home (~130 CFM covers most homes up to ~3,000 sq ft under that
  // formula; larger homes or higher bedroom counts exceed it sooner).
  ervSqftBreakpoints:{cfm130Max:3000}, // above cfm130Max => cfm150
  // Duct services - separate from the equipment bundles above.
  duct:{
    replacementPerStem:920,
    // Cleaning is flat-rate by system tonnage. Only the 1.5T ($959) and 5T
    // ($1,776) endpoints were given ("increments as you see fit") - these are
    // linearly interpolated at a constant $116.71/half-ton step in between.
    cleaning:{1.5:959, 2:1076, 2.5:1192, 3:1309, 3.5:1426, 4:1543, 5:1776},
    // Brand-new supply run (not a swap of an existing one) - new duct, boot,
    // and grille together. In a 2-story house this needs sheetrock removal.
    newSupplyRun:1188,
    // Return side - a separate box/run from the supply plenum question above.
    // Austin homes very commonly have undersized returns. Not a wizard
    // question anymore - referenced in the "Additional Considerations"
    // education block on the done screen instead (see additionalConsiderations).
    returnPlenum:{ductboard:1420, metal:2148},
    newReturnDuct:1034,
  },
  // Zoning: custom pricing only - always routes to "schedule an in-home visit",
  // never a calculated number. Proprietary zone board + zone sensors +
  // proprietary dampers, cost varies too much per home to estimate here.
  zoning:'custom_visit_required',
};

// ─── PRICING CALCULATION ────────────────────────────────────────
// Tonnage is picked directly by the homeowner/rep rather than inferred
// silently from a sq ft range - a hard sq ft cutoff was pushing borderline
// homes (e.g. ~1,000 sq ft) down to a smaller tonnage than Texas heat load
// really wants. Each option still shows its reference sq ft (~600 sq ft/ton)
// so the pick is guided, not a guess. sqftMid also drives dehu/ERV sizing.
const TONNAGE_OPTIONS=[
  {v:'t15', label:'1.5 Tons', sqftLabel:'~900 sq ft',           tons:1.5, sqftMid:900},
  {v:'t2',  label:'2 Tons',   sqftLabel:'~1,200 sq ft',         tons:2,   sqftMid:1200},
  {v:'t25', label:'2.5 Tons', sqftLabel:'~1,500 sq ft',         tons:2.5, sqftMid:1500},
  {v:'t3',  label:'3 Tons',   sqftLabel:'~1,800 sq ft',         tons:3,   sqftMid:1800},
  {v:'t35', label:'3.5 Tons', sqftLabel:'~2,100 sq ft',         tons:3.5, sqftMid:2100},
  {v:'t4',  label:'4 Tons',   sqftLabel:'~2,400 sq ft',         tons:4,   sqftMid:2400},
  {v:'t5',  label:'5 Tons',   sqftLabel:'3,000+ sq ft',         tons:5,   sqftMid:3600},
];
// Optional light-touch nudge: typing a sq ft doesn't lock anything in, it just
// suggests the closest tonnage option so the pick steers toward accuracy
// instead of a guess - still fully overridable by clicking any card.
function nearestTonnageOption(sqft){
  if(!sqft||sqft<=0)return null;
  return TONNAGE_OPTIONS.reduce((best,o)=>Math.abs(o.sqftMid-sqft)<Math.abs(best.sqftMid-sqft)?o:best);
}
// Picks the closest tonnage this tier/system-type actually offers (fedmin has
// half-tons, mid/high don't) - ties round up toward the larger, safer size.
function nearestTonnage(tierSystemPrices, targetTon){
  const keys=Object.keys(tierSystemPrices).map(Number);
  let best=keys[0], bestDiff=Infinity;
  for(const k of keys){
    const diff=Math.abs(k-targetTon);
    if(diff<bestDiff||(diff===bestDiff&&k>best)){best=k; bestDiff=diff;}
  }
  return best;
}
function dehuCapacity(sqft){
  if(sqft<=PRICING.dehuSqftBreakpoints.p65Max)return'p65';
  if(sqft<=PRICING.dehuSqftBreakpoints.p90Max)return'p90';
  return'p120';
}
function ervCfmKey(sqft){
  return sqft<=PRICING.ervSqftBreakpoints.cfm130Max?'cfm130':'cfm150';
}
// Rounded to the nearest $25 and shown with a "~" prefix (one number, not a
// range) so nothing reads as an exact locked-in figure. Source PRICING
// values stay exact - only this display layer rounds.
const roundTo25=price=>Math.round(price/25)*25;
function systemTypeKey(answers){
  if(answers.indoor_type==='ah')return'heat_pump_ah';
  // Mid efficiency has no straight_cool pricing at all - furnace + mid_ge15
  // is always dual fuel (the wizard hides the question and forces this),
  // so honor that directly here too rather than trusting system_for to
  // always have been kept in sync through every path that can reach this
  // combination - the one time it wasn't (indoor_type edited from air
  // handler to furnace after mid_ge15 was already picked) silently broke
  // the estimate instead of showing a wrong-but-plausible number.
  if(answers.cond_tier==='mid_ge15')return'dual_fuel';
  return answers.system_for==='hp'?'dual_fuel':'straight_cool';
}
// Fires a "build completed" conversion event through whatever site-wide GA4 /
// Meta Pixel install already exists on the host page - this file never loads
// its own gtag.js or fbq snippet (embedded on the WordPress site, those are
// already running once for the whole page, and installing a second copy here
// would double-count pageviews and require hardcoding IDs into this file).
function trackBuildCompleted(answers){
  try{
    if(typeof window.gtag==='function'){
      window.gtag('event','build_completed',{
        event_category:'System Builder',
        indoor_type:answers.indoor_type||'',
        efficiency_tier:answers.cond_tier||'',
      });
    }
    if(typeof window.fbq==='function'){
      window.fbq('trackCustom','BuildCompleted');
    }
  }catch(e){/* analytics must never break the build flow */}
}
const TIER_LABEL={fedmin:'Federal Minimum - 14 SEER2',mid_ge15:'Mid Efficiency - 18 SEER2',high_ge18:'High Efficiency - 21 SEER2'};
// Returns null if this tier/system-type combo has no pricing (shouldn't happen
// given the wizard's own filtering, but guards against stale/edge-case answers).
function calcEstimate(answers,pricingAnswers){
  const tier=answers.cond_tier;
  const sysKey=systemTypeKey(answers);
  const tierPrices=PRICING.equipment[tier]&&PRICING.equipment[tier][sysKey];
  if(!tierPrices)return null;
  const picked=TONNAGE_OPTIONS.find(o=>o.v===pricingAnswers.tonnageChoice)||TONNAGE_OPTIONS[3];
  const tonnage=nearestTonnage(tierPrices,picked.tons);
  const lines=[{label:`${tonnage}-ton system - ${TIER_LABEL[tier]||''}`,price:tierPrices[tonnage]}];

  if(answers.indoor_type==='furnace'&&answers.furnace_eff==='e90'){
    lines.push({label:'90% AFUE furnace upgrade',price:PRICING.furnace90Upgrade});
  }
  if(answers.plenum&&answers.plenum!=='none'){
    lines.push({label:answers.plenum==='metal'?'Sheet metal plenum':'Ductboard plenum',price:PRICING.plenum[answers.plenum]});
  }
  const purifList=Array.isArray(answers.purif)?answers.purif:[];
  if(purifList.includes('uv'))lines.push({label:'UV Light System',price:PRICING.purif.uv});
  if(purifList.includes('ionizer'))lines.push({label:'Ionizer / Plasma',price:PRICING.purif.ionizer});
  if(purifList.includes('surge'))lines.push({label:'Surge Protector',price:PRICING.extras.surge});

  if(answers.dehu==='yes'){
    const cap=dehuCapacity(picked.sqftMid);
    lines.push({label:`Whole-home dehumidifier (${cap.replace('p','')}pt)`,price:PRICING.dehu[cap]});
  }

  const extrasList=Array.isArray(answers.extras)?answers.extras:[];
  if(extrasList.includes('condensate'))lines.push({label:'Condensate Pump',price:PRICING.extras.condensate});
  if(extrasList.includes('erv')){
    const cfmKey=ervCfmKey(picked.sqftMid);
    lines.push({label:`ERV (${cfmKey==='cfm130'?'130':'150'} CFM)`,price:PRICING.extras.erv[cfmKey]});
  }
  // Return-side work (plenum, new duct, duct cleaning) stays education-only
  // (see additionalConsiderations below) with final scope confirmed at the
  // in-home visit - unlike condensate/ERV, these don't have a self-contained
  // on-diagram build-out for the customer to see update live.

  if(pricingAnswers.wantDucts&&pricingAnswers.ventCount>0){
    lines.push({label:`Duct replacement (${pricingAnswers.ventCount} vents)`,price:pricingAnswers.ventCount*PRICING.duct.replacementPerStem});
  }

  const subtotal=lines.reduce((s,l)=>s+l.price,0);
  const linesRounded=lines.map(l=>({...l,display:roundTo25(l.price)}));
  // Sum the already-rounded line items rather than independently rounding
  // the raw subtotal - roundTo25 isn't linear, so the two can land on
  // different multiples of 25 and a customer adding up the itemized rows
  // would get a total that doesn't match the headline price.
  const display=linesRounded.reduce((s,l)=>s+l.display,0);
  return{lines:linesRounded,subtotal,display,tonnage};
}

// The price is the payoff of the entire build - having it just appear
// instantly reads as a lookup, not a calculation. Counting up from 0 (ease-
// out, ~900ms) makes it feel computed specifically for what was just built.
function CountUp({value,duration=900,format}){
  const [display,setDisplay]=useState(0);
  React.useEffect(()=>{
    let raf,start;
    const animate=ts=>{
      if(!start)start=ts;
      const t=Math.min(1,(ts-start)/duration);
      const eased=1-Math.pow(1-t,3);
      setDisplay(Math.round(value*eased));
      if(t<1)raf=requestAnimationFrame(animate);
    };
    raf=requestAnimationFrame(animate);
    return ()=>cancelAnimationFrame(raf);
  },[value,duration]);
  return format?format(display):display;
}

// Deterministic pseudo-random in [0,1) - same seed always gives the same
// value, so the rain/snow layout in OutsideZone below is stable across
// re-renders instead of reshuffling every time React re-renders the canvas.
function rnd(seed){
  const x=Math.sin(seed*12.9898)*43758.5453;
  return x-Math.floor(x);
}

// Exterior outside zone - side view of wall + condenser on pad
// wallX = x position of the wall face
// condenserEl = the already-built <Condenser/> element (Condenser itself
// stays defined inside Canvas since it draws HVAC-specific visuals)
// Shows: wall cross-section, line-set penetration, disconnect, surge, pad, condenser
//
// Defined at module scope (unlike the other diagram sub-components, which
// stay nested inside Canvas) specifically so its identity is stable across
// Canvas re-renders. A component declared *inside* another component's
// function body is a brand-new function reference every time the outer
// component renders, which makes React tear down and remount its entire
// subtree - discarding all hook state, including any useMemo cache - on
// every single Canvas render instead of just updating props. That defeats
// memoization before it can do anything, so the rain/snow layout below
// (many elements, each with several rnd()-derived numbers and inline
// styles) would still be recomputed from scratch every render even with
// useMemo. Hoisting OutsideZone out here keeps its component identity
// stable, so React updates it in place and the useMemo below actually
// skips recomputation when only unrelated wizard state changed.
function OutsideZone({wallX, zoneW, zoneH, condX, condY, condW, condH, lineY1, lineY2, active,
  heatMode, isMildHp, refReversed, isSurge, condC, line1C, line2C, G, W, condenserEl, tierKey, eaveY}){
  const groundY=zoneH-28;
  const padY=groundY-10;
  const wallThick=18;   // visible wall cross-section width
  const sidingX=wallX;  // outside face of wall

  // ── SNOW FIELD ── drift blanket + sparkles + three depth layers of
  // falling flakes. Depends only on the zone's actual geometry (never on
  // heatMode/isMildHp - those only drive this wrapper <g>'s opacity below,
  // for a smooth season-change fade), so switching weather modes, or any
  // other wizard-answer change that leaves this zone's size and
  // condenser-pad position alone, skips regenerating every flake's
  // rnd()-derived position, size, opacity, duration, sway and delay.
  const snowField=useMemo(()=>{
    const fallTop=zoneH*0.12;
    const fallBottom=groundY-4;
    const fallSpan=fallBottom-fallTop;
    const fallLeft=wallX+zoneW*0.05;
    const fallWidth=zoneW*0.9;
    // The closet-upflow zone is ~800px tall vs. the attic zone's ~460px -
    // the same flake count spread over the taller fall span reads
    // noticeably thinner, so scale counts up with how much taller than
    // baseline this zone actually is (never down, so the attic layout is
    // unaffected).
    const density=Math.max(1,fallSpan/460);
    // Three depth layers - size, opacity and speed all step up together
    // from far (small/faint/slow-ish) to near (big/bold/fast), which is
    // what actually reads as depth/parallax instead of a flat field of
    // identical marks. Counts are the baseline (attic zone) density.
    const SNOW_LAYERS=[
      {key:'sf', count:Math.round(20*density), r:[1.1,1.7],  op:[.42,.58], dur:[6,8.4],   sway:[3,7]},
      {key:'sm', count:Math.round(16*density), r:[1.9,2.7],  op:[.6,.78],  dur:[4,5.6],   sway:[7,13]},
      {key:'sn', count:Math.round(8*density),  r:[3.4,4.8],  op:[.88,1],   dur:[2.2,3.2], sway:[14,22]},
    ];
    const driftPath=(()=>{
      const segs=9;
      let d=`M${wallX} ${groundY}`;
      for(let i=0;i<=segs;i++){
        const x=wallX+(zoneW*i)/segs;
        const nearPad=x>condX-14&&x<condX+condW+14;
        const bump=(nearPad?7:3)+rnd(i*3.1)*(nearPad?6:5);
        d+=` L${x.toFixed(1)} ${(groundY-bump).toFixed(1)}`;
      }
      d+=` L${wallX+zoneW} ${groundY} Z`;
      return <path d={d} fill="rgba(240,246,255,.4)" stroke="rgba(255,255,255,.18)" strokeWidth="0.6"/>;
    })();
    const sparkles=Array.from({length:22},(_,i)=>(
      <circle key={'sparkle'+i} cx={wallX+rnd(i*7.7)*zoneW} cy={groundY-2-rnd(i*4.3)*6}
        r={rnd(i*9.1)*0.9+0.4} fill="rgba(255,255,255,.55)"/>
    ));
    const flakes=SNOW_LAYERS.map(layer=>Array.from({length:layer.count},(_,i)=>{
      const seed=layer.key.charCodeAt(1)*211+i;
      const colW=fallWidth/layer.count;
      const cx=fallLeft+colW*(i+0.5)+(rnd(seed+1)-0.5)*colW*0.7;
      const cy=fallTop+rnd(seed+2)*fallSpan*0.18;
      const r=layer.r[0]+rnd(seed+3)*(layer.r[1]-layer.r[0]);
      const op=layer.op[0]+rnd(seed+4)*(layer.op[1]-layer.op[0]);
      const dur=layer.dur[0]+rnd(seed+5)*(layer.dur[1]-layer.dur[0]);
      const sway=(layer.sway[0]+rnd(seed+6)*(layer.sway[1]-layer.sway[0]))*(rnd(seed+7)<0.5?-1:1);
      const fy=fallBottom-cy+(rnd(seed+8)-0.5)*24;
      const delay=-(rnd(seed+9)*dur);
      // A plain dot reads as a fixed star, not something falling - a
      // slight vertical elongation gives even a single frozen frame an
      // implied direction of travel, the same trick that makes the
      // rain streaks below read instantly as rain instead of ticks.
      return <ellipse key={layer.key+i} className="snow-flake"
        cx={cx} cy={cy} rx={r*0.72} ry={r*1.4} fill="rgba(255,255,255,.95)"
        filter={layer.key==='sf'?undefined:'url(#glow-sm)'}
        style={{'--fy':fy+'px','--sway':sway+'px','--op':op,
          animationDuration:dur+'s',animationDelay:delay+'s'}}/>;
    }));
    return <>{driftPath}{sparkles}{flakes}</>;
  },[wallX,zoneW,zoneH,condX,condW,groundY]);

  // ── RAIN FIELD ── wet sheen + three depth layers of wind-leaned streaks
  // + splash flashes. Same reasoning as snowField above: geometry-only
  // deps, independent of heatMode/isMildHp.
  const rainField=useMemo(()=>{
    const fallTop=zoneH*0.12;
    const fallBottom=groundY-4;
    const fallSpan=fallBottom-fallTop;
    const fallLeft=wallX+zoneW*0.05;
    const fallWidth=zoneW*0.9;
    // Consistent wind lean (~12° off vertical) applied to every rain
    // streak and to its own fall path, so the whole field reads as one
    // wind-driven sheet of rain rather than drops each going their own way.
    // Positive so the lean is toward increasing x - away from the house
    // wall at wallX and out into the yard/condenser side. The original
    // negative value blew streaks toward decreasing x, i.e. into the wall.
    const WIND_UX=0.22, WIND_UY=0.976, WIND_RATIO=WIND_UX/WIND_UY;
    const density=Math.max(1,fallSpan/460);
    const RAIN_LAYERS=[
      {key:'rf', count:Math.round(20*density), len:[7,10],   sw:1,   op:[.24,.42], dur:[.6,.85]},
      {key:'rm', count:Math.round(18*density), len:[11,15],  sw:1.4, op:[.48,.66], dur:[.45,.62]},
      {key:'rn', count:Math.round(11*density), len:[17,22],  sw:1.9, op:[.72,.92], dur:[.32,.46]},
    ];
    const sheen=Array.from({length:5},(_,i)=>{
      const sx=wallX+rnd(i*5.2+900)*zoneW*0.85;
      return <line key={'sheen'+i} x1={sx} y1={groundY-1} x2={sx+zoneW*0.09} y2={groundY-1}
        stroke="rgba(180,215,240,.22)" strokeWidth="1"/>;
    });
    const drops=RAIN_LAYERS.map(layer=>Array.from({length:layer.count},(_,i)=>{
      const seed=layer.key.charCodeAt(1)*181+i+500;
      const colW=fallWidth/layer.count;
      const x=fallLeft+colW*(i+0.5)+(rnd(seed+1)-0.5)*colW*0.8;
      const y=fallTop+rnd(seed+2)*fallSpan*0.12;
      const len=layer.len[0]+rnd(seed+3)*(layer.len[1]-layer.len[0]);
      const op=layer.op[0]+rnd(seed+4)*(layer.op[1]-layer.op[0]);
      const dur=layer.dur[0]+rnd(seed+5)*(layer.dur[1]-layer.dur[0]);
      const dx2=len*WIND_UX, dy2=len*WIND_UY;
      const travel=fallBottom-y;
      const fy=travel, fx=travel*WIND_RATIO;
      const delay=-(rnd(seed+6)*dur);
      return <line key={layer.key+i} className="rain-drop"
        x1={x} y1={y} x2={x+dx2} y2={y+dy2}
        stroke="#7ab8e0" strokeWidth={layer.sw} strokeLinecap="round"
        style={{'--fy':fy+'px','--fx':fx+'px','--op':op,
          animationDuration:dur+'s',animationDelay:delay+'s'}}/>;
    }));
    const splashes=Array.from({length:9},(_,i)=>{
      const sx=fallLeft+rnd(i*13.3+700)*fallWidth;
      const dur=0.45+rnd(i*7.1+700)*0.35;
      const delay=-(rnd(i*3.3+700)*dur);
      const op=0.35+rnd(i*11.7+700)*0.35;
      return <g key={'splash'+i} className="rain-splash"
        style={{'--op':op,animationDuration:dur+'s',animationDelay:delay+'s',
          transformBox:'fill-box',transformOrigin:'center'}}>
        <path d={`M${sx-3.5} ${groundY-1} Q${sx-3.5} ${groundY-5} ${sx-1.5} ${groundY-6.5}`}
          fill="none" stroke="#bfe0f5" strokeWidth="1" strokeLinecap="round"/>
        <path d={`M${sx+3.5} ${groundY-1} Q${sx+3.5} ${groundY-5} ${sx+1.5} ${groundY-6.5}`}
          fill="none" stroke="#bfe0f5" strokeWidth="1" strokeLinecap="round"/>
      </g>;
    });
    return <>{sheen}{drops}{splashes}</>;
  },[wallX,zoneW,zoneH,groundY]);

  return <g>
    {/* ── GROUND ── */}
    <rect x={wallX} y={groundY} width={zoneW} height={zoneH-groundY} fill="#0c0b08" stroke="none"/>
    {Array.from({length:10},(_,i)=>(
      <line key={i} x1={wallX+i*(zoneW/10)} y1={groundY} x2={wallX+i*(zoneW/10)+10} y2={groundY+8}
        stroke="rgba(90,80,45,.2)" strokeWidth="0.7"/>
    ))}
    <text x={wallX+zoneW/2} y={groundY+18} textAnchor="middle"
      fill="rgba(110,95,55,.45)" fontSize="10" fontFamily="monospace">GROUND LEVEL</text>

    {/* ── SNOW - furnace/aux-heat cold-snap mode only. Fades in/out
         instead of popping, so switching modes reads as a season
         passing rather than an instant background swap. An uneven
         drifted blanket (snow piles unevenly, and gathers deeper
         against the condenser pad) plus three depth layers of flakes
         that actually fall the full height of the zone with a gentle
         side-to-side sway, instead of a flat grid barely jittering in
         place. ── */}
    <g style={{opacity:(heatMode&&!isMildHp)?1:0,transition:'opacity .8s ease'}}>
      {/* Snow cloud, same slot/shape family as the rain cloud below -
           without it the falling flakes had no visible source and read
           as a starfield instead of weather. Paler/flatter than the
           rain cloud so the two precipitation states stay distinct at
           a glance. */}
      <ellipse cx={wallX+zoneW*0.25-9} cy={zoneH*0.075+20} rx="10" ry="7" fill="#aab4c2"/>
      <ellipse cx={wallX+zoneW*0.25+4} cy={zoneH*0.075+15} rx="12" ry="8.5" fill="#bcc5d1"/>
      <ellipse cx={wallX+zoneW*0.25+17} cy={zoneH*0.075+20} rx="9" ry="6.5" fill="#aab4c2"/>
      {snowField}
    </g>

    {/* ── SUN - cool mode. Sits over the condenser (the actual "outside"
         reference point) rather than the attic roof, since that's the
         piece of equipment that's genuinely outdoors. Anchored to the
         zone's own left edge rather than the condenser's position (which
         can sit close to the zone's right edge in the closet layout,
         behind the fixed top-right mode-preview toggle) and its own
         height rather than a fixed pixel value, so it clears the
         "OUTSIDE" label above it in both layouts. Fades in/out instead
         of popping, same as the snow above. ── */}
    <g style={{opacity:!heatMode?1:0,transition:'opacity .8s ease'}}>
      <circle cx={wallX+zoneW*0.25} cy={zoneH*0.075+18} r="9" fill="#ffd76b"/>
      {Array.from({length:8},(_,i)=>{
        const ang=i*Math.PI/4;
        const sx=wallX+zoneW*0.25, sy=zoneH*0.075+18;
        return <line key={'ray'+i}
          x1={sx+Math.cos(ang)*12} y1={sy+Math.sin(ang)*12}
          x2={sx+Math.cos(ang)*17} y2={sy+Math.sin(ang)*17}
          stroke="#ffd76b" strokeWidth="2" strokeLinecap="round"/>;
      })}
    </g>


    {/* ── CLOUD + RAIN - any system's mild 52° heat-pump preview (dual-fuel
         HEAT PUMP, or a heat-pump-only system's own HEAT PUMP mode before
         it drops to 28° AUX HEAT) - overcast rather than sunny or snowed in,
         same slot and reasoning as the sun above. Three depth layers of
         streaks (same treatment as the snow above) fall the full height
         of the zone along one consistent wind angle, so it reads as a
         wind-driven sheet of rain rather than a static grid of identical
         ticks. A faint wet sheen and a few splash flashes along the
         ground sell "it's actually landing down here" too. ── */}
    <g style={{opacity:(heatMode&&isMildHp)?1:0,transition:'opacity .8s ease'}}>
      <ellipse cx={wallX+zoneW*0.25-9} cy={zoneH*0.075+20} rx="10" ry="7" fill="#8a94a3"/>
      <ellipse cx={wallX+zoneW*0.25+4} cy={zoneH*0.075+15} rx="12" ry="8.5" fill="#9aa3b0"/>
      <ellipse cx={wallX+zoneW*0.25+17} cy={zoneH*0.075+20} rx="9" ry="6.5" fill="#8a94a3"/>
      <rect x={wallX} y={groundY-4} width={zoneW} height={4} fill="rgba(122,184,224,.14)"/>
      {rainField}
    </g>

    {/* ── CONCRETE PAD - under condenser ── */}
    <rect x={condX-10} y={padY} width={condW+20} height={14} rx="2"
      fill="rgba(165,160,148,.22)" stroke="rgba(190,185,168,.28)" strokeWidth="1"/>
    {Array.from({length:5},(_,i)=>(
      <line key={i} x1={condX+i*(condW+20)/5-10} y1={padY+2}
        x2={condX+i*(condW+20)/5-10} y2={padY+12}
        stroke="rgba(190,185,168,.1)" strokeWidth="0.5"/>
    ))}
    <text x={condX+condW/2} y={padY+10} textAnchor="middle"
      fill="rgba(170,160,140,.4)" fontSize="10" fontFamily="monospace">CONCRETE PAD</text>

    {/* ── WALL CROSS-SECTION ── proper side view of exterior wall.
         Starts at the roofline (eaveY), not the top of the canvas - this
         used to run from y=0 regardless, so it stuck up above the actual
         roof/attic like a parapet, reading as a hard vertical line
         splitting the house side from the outside zone all the way to
         the top of the screen instead of stopping at the real building
         envelope. eaveY falls back to 0 (old behavior) if a caller ever
         omits it. */}
    {/* Wall body */}
    <rect x={sidingX} y={eaveY||0} width={wallThick} height={groundY-(eaveY||0)}
      fill="#1a1d26" stroke="rgba(120,118,140,.35)" strokeWidth="1"/>
    {/* Siding horizontal courses */}
    {Array.from({length:Math.floor((groundY-(eaveY||0))/10)},(_,i)=>(
      <rect key={i} x={sidingX} y={(eaveY||0)+i*10} width={wallThick} height={9}
        fill={i%2===0?"rgba(22,22,28,.8)":"rgba(18,18,24,.8)"}
        stroke="rgba(80,80,100,.12)" strokeWidth="0.3"/>
    ))}
    {/* Wall face highlight */}
    <line x1={sidingX+wallThick} y1={eaveY||0} x2={sidingX+wallThick} y2={groundY}
      stroke="rgba(200,195,175,.22)" strokeWidth="1.5"/>
    {/* Inside wall face */}
    <line x1={sidingX} y1={eaveY||0} x2={sidingX} y2={groundY}
      stroke="rgba(180,175,160,.08)" strokeWidth="0.5"/>

    {/* ── LINE-SET - runs down inside the wall cavity from where it enters
         near the indoor unit, then exits right above the concrete pad
         into the condenser's side. A real lineset is hidden in the wall
         for that whole drop and only shows up low, next to the unit it's
         feeding - not crossing the roofline and dropping down the
         outside face into the top. ── */}
    {(()=>{
      const wallMidX=sidingX+wallThick/2;
      const px1=wallMidX-3, px2=wallMidX+3;
      // Right above the pad - just clearing the SEER badge that spans the
      // condenser's full width near its base, so the entry reads as low
      // on the cabinet without cutting through that label.
      const exitY1=condY+condH*0.78;
      const exitY2=condY+condH*0.86;
      return <>
        {/* Wall penetration - top, where the indoor-side pipe enters the cavity */}
        <rect x={sidingX+1} y={lineY1-6} width={wallThick-2} height={lineY2-lineY1+12} rx="2"
          fill="rgba(120,85,30,.25)" stroke="rgba(150,110,40,.35)" strokeWidth="0.8"/>
        {/* Wall penetration - low, where it exits toward the condenser */}
        <rect x={sidingX+1} y={exitY1-6} width={wallThick-2} height={exitY2-exitY1+12} rx="2"
          fill="rgba(120,85,30,.25)" stroke="rgba(150,110,40,.35)" strokeWidth="0.8"/>
        <text x={sidingX+wallThick/2} y={exitY2+16} textAnchor="middle"
          fill="rgba(150,110,40,.5)" fontSize="9.5" fontFamily="monospace">LINESET</text>
        {/* Foam sleeve on pipes - down inside the wall, then into the condenser */}
        <path d={`M${px1} ${lineY1} L${px1} ${exitY1} L${condX} ${exitY1}`}
          fill="none" stroke="rgba(30,30,50,.65)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={`M${px2} ${lineY2} L${px2} ${exitY2} L${condX} ${exitY2}`}
          fill="none" stroke="rgba(30,30,50,.55)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Liquid line - full bold red/blue */}
        <path d={`M${px1} ${lineY1} L${px1} ${exitY1} L${condX} ${exitY1}`}
          fill="none" stroke={line1C} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="line-pulse"/>
        {/* Suction line - full bold, offset */}
        <path d={`M${px2} ${lineY2} L${px2} ${exitY2} L${condX} ${exitY2}`}
          fill="none" stroke={line2C} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="line-pulse" style={{animationDelay:'.15s'}}/>
        {/* Animated flow dots -- both pipes */}
        {active&&Array.from({length:6},(_,i)=>{
          const isLine1=i<3;
          const pColor=isLine1?line1C:line2C;
          const wx=isLine1?px1:px2;
          const topY=isLine1?lineY1:lineY2;
          const botY=isLine1?exitY1:exitY2;
          const toCondenser=isLine1?!refReversed:refReversed;
          const p=toCondenser
            ?`M${wx} ${topY} L${wx} ${botY} L${condX} ${botY}`
            :`M${condX} ${botY} L${wx} ${botY} L${wx} ${topY}`;
          return <circle key={i} r="3" fill={pColor} opacity="0.82" filter="url(#glow-sm)">
            <animateMotion dur={(2.2+(i%3)*0.5)+'s'} repeatCount="indefinite" begin={(i*0.7)+'s'} path={p}/>
          </circle>;
        })}
      </>;
    })()}

    {/* ── DISCONNECT BOX - prominent, on outside wall face ── */}
    {(()=>{
      const DX=sidingX+wallThick+4;
      const DY=Math.round(groundY*0.62)-34; // slightly lower than center
      const DW=44, DH=68;
      return <>
        {/* Box body */}
        <rect x={DX} y={DY} width={DW} height={DH} rx="4"
          fill="#0c0d10" stroke={G+'.65)'} strokeWidth="2"/>
        {/* Inner inset shadow */}
        <rect x={DX+2} y={DY+2} width={DW-4} height={DH-4} rx="3"
          fill="none" stroke="rgba(0,0,0,.6)" strokeWidth="1"/>
        {/* Label plate */}
        <rect x={DX+3} y={DY+4} width={DW-6} height={14} rx="2"
          fill={G+'.14)'} stroke={G+'.32)'} strokeWidth="0.8"/>
        <text x={DX+DW/2} y={DY+14} textAnchor="middle"
          fill={G+'.82)'} fontSize="10.5" fontFamily="monospace" fontWeight="700">DISC.</text>
        {/* Switch housing */}
        <rect x={DX+5} y={DY+22} width={DW-10} height={32} rx="3"
          fill={active?"rgba(239,68,68,.18)":"rgba(35,38,62,.75)"}
          stroke={active?condC:(G+'.32)')} strokeWidth="1.1"/>
        {/* Handle lever */}
        <rect x={DX+11} y={DY+26} width={DW-22} height={20} rx="2.5"
          fill={active?"rgba(239,68,68,.55)":"rgba(55,58,90,.7)"}
          stroke={active?condC:(G+'.24)')} strokeWidth="1"/>
        {/* Handle center line */}
        <line x1={DX+DW/2} y1={DY+28} x2={DX+DW/2} y2={DY+44}
          stroke={active?condC:(G+'.18)')} strokeWidth="1" strokeDasharray="2 2"/>
        {/* Status dot */}
        <circle cx={DX+DW/2} cy={DY+57} r="5"
          fill={active?"rgba(34,197,94,.6)":"rgba(50,50,80,.6)"}
          stroke={active?"#22c55e":(G+'.2)')} strokeWidth="1"/>
        {active&&<circle cx={DX+DW/2} cy={DY+57} r="2.5"
          fill="#22c55e" className="glow-pulse"/>}
        {/* Conduit to unit - drawn at the disconnect box's own fixed mid-
            height, which only actually lands on the condenser cabinet for
            the taller fedmin/high-efficiency units. Condensers are bottom-
            anchored (COND_Y=groundLevel-condH), so the mid-efficiency
            tier's shorter cabinet has its top edge sitting well below this
            fixed height - the conduit line reached condX but terminated
            in empty air above the actual box, never visibly connecting to
            it. Simplest correct fix: skip it for that tier. */}
        {tierKey!=='mid_ge15'&&<>
          <line x1={DX+DW} y1={DY+DH/2} x2={condX} y2={DY+DH/2}
            stroke="rgba(22,22,42,.7)" strokeWidth="8" strokeLinecap="round"/>
          <line x1={DX+DW} y1={DY+DH/2} x2={condX} y2={DY+DH/2}
            stroke={G+'.48)'} strokeWidth="4" strokeLinecap="round"/>
        </>}
        {/* Surge protector - bigger, below disconnect */}
        {isSurge&&<g className="fadein">
          <rect x={DX} y={DY+DH+6} width={DW} height={52} rx="4"
            fill="#160700" stroke="#f97316" strokeWidth="1.8"/>
          <rect x={DX+2} y={DY+DH+8} width={DW-4} height={DH-4} rx="3"
            fill="none" stroke="rgba(249,115,22,.15)" strokeWidth="0.7"/>
          {/* Label */}
          <rect x={DX+4} y={DY+DH+10} width={DW-8} height={13} rx="2"
            fill="rgba(249,115,22,.12)" stroke="#f97316" strokeWidth="0.7"/>
          <text x={DX+DW/2} y={DY+DH+20} textAnchor="middle"
            fill="#f97316" fontSize="10.5" fontFamily="monospace" fontWeight="700">SURGE</text>
          {/* Lightning bolt */}
          <text x={DX+DW/2} y={DY+DH+40} textAnchor="middle"
            fill="#f97316" fontSize="20.5">⚡</text>
          <text x={DX+DW/2} y={DY+DH+54} textAnchor="middle"
            fill="rgba(249,115,22,.6)" fontSize="10" fontFamily="monospace">PROTECTOR</text>
        </g>}
      </>;
    })()}

    {/* ── CONDENSER UNIT ── */}
    {condenserEl}
    {/* Snow drift along the condenser's top edge, same cold-snap mode and
        uneven-pile language as the ground blanket, so a real dusting on
        the outdoor unit itself sells the season along with the ground. */}
    <g style={{opacity:(heatMode&&!isMildHp)?1:0,transition:'opacity .8s ease'}}>
      {(()=>{
        const segs=6;
        let d=`M${condX} ${condY}`;
        for(let i=0;i<=segs;i++){
          const sx=condX+(condW*i)/segs;
          const bump=3+rnd(i*4.7+300)*4;
          d+=` L${sx.toFixed(1)} ${(condY-bump).toFixed(1)}`;
        }
        d+=` L${condX+condW} ${condY+4} L${condX} ${condY+4} Z`;
        return <path d={d} fill="rgba(240,246,255,.85)" stroke="rgba(255,255,255,.25)" strokeWidth="0.6"/>;
      })()}
    </g>
    <text x={wallX+zoneW-8} y={condY-9} textAnchor="end"
      fill={active?condC:(G+'.55)')} fontSize="10.5" fontFamily="monospace">
      {active?"CONDENSER · ACTIVE":"CONDENSER · STANDBY"}
    </text>

    {/* OUTSIDE label */}
    <text x={wallX+zoneW/2} y={12} textAnchor="middle"
      fill={W+'.2)'} fontSize="9.5" fontFamily="monospace" letterSpacing="1.2">OUTSIDE</text>
  </g>;
}

// ─── CANVAS ─────────────────────────────────────────────────────
function Canvas({a, stepIdx, activeSteps, onEditStep}){
  // Clickable overlay on a finished diagram piece - only wired up on the
  // done screen (onEditStep is undefined during the wizard itself, where
  // jumping mid-flow doesn't make sense). Hover state is a stroke on a
  // sibling rect rather than a filter, so it can't collide with any of
  // this component's own SVG filter="" attributes elsewhere.
  // SVG_SCALE/SVG_VW/SVG_VH are set below once each layout branch knows its
  // own VW/VH and the frame's actual measured box (see frameBox) - same
  // "assigned later, read by a closure that only actually runs after this
  // function returns" pattern already used for G/B/W/O just below. Only one
  // of the two layout branches ever runs per call, so by the time React
  // actually invokes EditZone, these hold that branch's real numbers.
  let SVG_SCALE=1, SVG_VW=0, SVG_VH=0;
  // Some real-world components (the thermostat, mainly) are small enough
  // in their own right that a narrow mobile frame's scale-down (the whole
  // diagram routinely renders at under a third of its native size on a
  // 375-390px phone) shrinks their EDIT hit area well under any usable tap
  // target - the thermostat's alone measured ~19x19 on-screen px at 375px
  // wide before this. This grows any zone that would render smaller than
  // MIN_EDIT_PX (comfortably above the 24px WCAG 2.5.5 AA minimum) back up
  // to that floor, in SVG units scaled for the CURRENT render, centered on
  // its original box so it still sits over the right component - visual
  // component geometry itself (the rects/shapes drawn elsewhere) is
  // untouched, only this invisible/hover-ring overlay grows. Clamped to the
  // canvas bounds so it can never poke off the edge of the SVG.
  const MIN_EDIT_PX=28;
  const EditZone=({x,y,w,h,stepId,rx})=>{
    if(!onEditStep)return null;
    const minUnits=SVG_SCALE>0?MIN_EDIT_PX/SVG_SCALE:0;
    let ex=x, ey=y, ew=w, eh=h;
    if(ew<minUnits){ex-=(minUnits-ew)/2; ew=minUnits;}
    if(eh<minUnits){ey-=(minUnits-eh)/2; eh=minUnits;}
    if(SVG_VW){if(ex<0)ex=0; if(ex+ew>SVG_VW)ex=Math.max(0,SVG_VW-ew);}
    if(SVG_VH){if(ey<0)ey=0; if(ey+eh>SVG_VH)ey=Math.max(0,SVG_VH-eh);}
    return <g className="edit-zone" onClick={()=>onEditStep(stepId)}>
      <rect x={ex} y={ey} width={ew} height={eh} rx={rx||4} fill="transparent" stroke="none"/>
      <rect className="edit-zone-ring" x={ex-3} y={ey-3} width={ew+6} height={eh+6} rx={(rx||4)+3}
        fill={G+'.06)'} stroke={G+'.95)'} strokeWidth="2.5" filter="url(#glow-sm)"/>
    </g>;
  };
  const [heatMode,setHeatMode]=React.useState(false);
  const [heatSubMode,setHeatSubMode]=React.useState('hp'); // 'hp'/'furnace' for dual fuel, 'hp'/'aux' for a heat-pump-only air handler
  // The attic diagram's viewBox width adapts to the frame's actual aspect
  // ratio so it fills wide frames instead of "meet"-scaling to height and
  // leaving dead space on both sides. VH (and everything inches-scaled off
  // it) stays fixed - only the horizontal canvas grows, same as adding more
  // open attic/wall space either side of the same-sized equipment.
  const wrapRef=useRef(null);
  const [frameBox,setFrameBox]=useState(null);
  React.useEffect(()=>{
    const el=wrapRef.current;
    if(!el||typeof ResizeObserver==='undefined')return;
    const measure=()=>{
      const r=el.getBoundingClientRect();
      if(r.width>0&&r.height>0)setFrameBox({w:r.width,h:r.height});
    };
    measure();
    const ro=new ResizeObserver(measure);
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  const G='rgba(215,183,64,';
  const B='rgba(35,137,224,';
  const W='rgba(255,255,255,';
  const O='rgba(249,115,22,';

  // ── OUTSIDE / INSIDE PALETTE ───────────────────────────────
  // The outside zone's fill is a visual metaphor for the active heating/
  // cooling mode (never real time-of-day or weather - see OutsideZone).
  // All three states share one blue hue family (~220-225°) so they read
  // as one continuous "sky" story - clear day -> overcast -> dark snowy
  // dusk - rather than three unrelated colors. The coldest state used to
  // crush to near-black (#080a10, luminance ~0.003), which was actually
  // DARKER than the fixed interior panels (attic ~0.006) - the outside
  // zone all but vanished into the rest of the canvas exactly when a
  // customer is looking at the "it's 28F outside, warm inside" story.
  // #141c2e keeps that state reading as dark/cold while staying ~2x the
  // interior's luminance, so outside vs inside never collapses into each
  // other no matter which mode is active. Sunny/overcast keep their
  // original values - both already sit well above the interior range.
  const OUTSIDE_SUNNY='#465c8c';     // cool mode - bright daytime sky
  const OUTSIDE_OVERCAST='#212b45'; // dual-fuel HP mode (~52F) - overcast/rain
  const OUTSIDE_COLD='#141c2e';     // furnace/aux cold-snap mode (~28F) - dark, not pure-black
  // isMildHp/outsideFill/intFill are defined further down (right after
  // hasFurnace/isDualFuel, which they depend on) instead of here - see the
  // comment there for why. OUTSIDE_SUNNY/OVERCAST/COLD stay here since the
  // whole outside-zone palette reads as one block.

  // The interior panels get a deliberate tint keyed to the same mode
  // metaphor - the way a real room's light/warmth answers what's happening
  // outside. Furnace/cold-snap mode nudges red up and blue down for a
  // faint warm glow - "cozy inside vs. freezing outside" - and stays a
  // single-digit-per-channel mood nudge on purpose. Cool mode is the one
  // state the owner asked to push further: sunny-out should read as
  // daylight actually spilling into the room, not a barely-there hue
  // shift, so INT_COOL lifts every channel ~2.5x brighter than the base
  // (still the same navy hue family, just lit) while staying comfortably
  // under OUTSIDE_SUNNY so outside still reads brighter than in. Checked
  // against the gold (rgba(215,183,64,...)) and white component labels
  // that sit on these panels: contrast against them actually holds
  // roughly steady vs. the old near-black panel (very transparent
  // watermark labels like ATTIC/LIVING SPACE track the background as it
  // lightens; higher-opacity component labels sit on their own darker
  // sub-fills, not directly on this rect, so they're unaffected).
  const INT_BASE={attic:'#10121c',living:'#0d0f18',closet:'rgba(9,9,16,.9)'};
  const INT_COOL={attic:'#282e48',living:'#20263c',closet:'rgba(35,40,62,.9)'};
  const INT_WARM={attic:'#14121a',living:'#100e15',closet:'rgba(13,9,14,.9)'};

  const loc=a.location;
  const isAttic=!loc||loc==='attic';
  const isCloset=loc==='closet';
  const hasFurnace=a.indoor_type==='furnace';
  const hasCoil=!!a.indoor_type;
  // cond_tier is a required step ahead of purif in the wizard, so a.cond_tier
  // is normally already set by the time stepIdx passes purif - the
  // stepIdx>_purifIdx half is a defensive fallback for a future edit that
  // makes cond_tier skippable or reorders the steps, so the outside
  // zone/condenser doesn't just silently fail to ever appear in that case.
  const _purifIdx=activeSteps?activeSteps.findIndex(s=>s.id==='purif'):-1;
  const hasCond=!!a.cond_tier||(_purifIdx>=0&&stepIdx>_purifIdx);
  const hasPlenum=!!a.plenum;  // true for ductboard, metal, AND none (existing)
  const hasTstat=a.thermostat&&a.thermostat!=='none';
  const hasUV=Array.isArray(a.purif)&&a.purif.includes('uv');
  const hasIonizer=Array.isArray(a.purif)&&a.purif.includes('ionizer');
  const hasAprilaire=Array.isArray(a.purif)&&a.purif.includes('aprilaire');
  const hasDehu=a.dehu==='yes';
  const isSurge=Array.isArray(a.purif)&&a.purif.includes('surge');
  const is90=a.furnace_eff==='e90';
  const isSpray=a.insulation==='spray';
  const isComm=a.cond_tier==='high_ge18';
  const isDualFuel=hasFurnace&&(a.system_for==='hp');
  // "Mild 52F" mode isn't unique to dual-fuel systems - a heat-pump-only
  // system (!hasFurnace) also previews a 52F HEAT PUMP state before its
  // 28F AUX HEAT state, same two-temperature split as dual-fuel's HEAT
  // PUMP/FURNACE pair. Gating this on isDualFuel alone left heat-pump-only
  // systems showing the cold-snap look even at 52F - matches the
  // isDualFuel||!hasFurnace pattern already used below for evapActive/
  // condenserActive/refReversed/thermostatTemp.
  //
  // This block has to live HERE, after hasFurnace/isDualFuel are actually
  // assigned, not up near the OUTSIDE_* palette consts where it originally
  // sat (textually before hasFurnace/isDualFuel's own declarations further
  // down this function). In real TDZ-enforcing JS that ordering would throw
  // outright, but babel-standalone's default preset compiles const/let down
  // to plain var for broad-browser output, which hoists the declarations
  // and drops the TDZ check - so it silently ran instead, with hasFurnace
  // and isDualFuel both still undefined at that point. `(isDualFuel||
  // !hasFurnace)` then evaluated as `(undefined || !undefined)` = true
  // unconditionally, regardless of the system actually being built, so
  // isMildHp collapsed to just `heatSubMode==='hp'`. heatSubMode's own
  // default is 'hp' and nothing ever changes it away from that for a
  // straight-cool furnace (its single HEAT MODE button only calls
  // setHeatMode, never setHeatSubMode) - so straight-cool systems previewed
  // their 28F heating call with the mild-52F overcast/rain look (and the
  // brighter INT_BASE interior tint from intFill below, which reads the
  // same isMildHp) instead of the actual cold-snap look real 28F heating
  // should show, right up until the true isMildHp assignment here.
  const isMildHp=(isDualFuel||!hasFurnace)&&heatSubMode==='hp';
  const outsideFill=!heatMode?OUTSIDE_SUNNY:isMildHp?OUTSIDE_OVERCAST:OUTSIDE_COLD;
  const intFill=(k)=>!heatMode?INT_COOL[k]:isMildHp?INT_BASE[k]:INT_WARM[k];
  // Mid efficiency is sold as a low-ambient heat pump - it's built to keep
  // working normally well below freezing. A standard heat pump (fed min,
  // high efficiency) can't, and locks its compressor out at that point,
  // leaving aux/emergency electric heat to carry the full load alone.
  const isLowAmbientHP=a.cond_tier==='mid_ge15';
  const furnaceHeatActive=heatMode&&hasFurnace&&(!isDualFuel||heatSubMode==='furnace');
  const furnaceActive=furnaceHeatActive;
  // Air handlers (heat pump only, no gas backup) get the same HEAT
  // PUMP/AUX HEAT split dual fuel gets for HEAT PUMP/FURNACE - only
  // reached when the user actually clicks into the cold/aux sub-mode,
  // same as dual fuel's furnace sub-mode isn't the default either. A
  // standard heat pump (fed min, high efficiency) locks its compressor
  // out down there, leaving aux/emergency electric heat to carry the
  // full load alone; low-ambient (mid tier) doesn't lock out at all.
  const hpLockedOut=!hasFurnace&&heatMode&&!isLowAmbientHP&&heatSubMode==='aux';
  const evapActive=!heatMode||(isDualFuel?(heatSubMode==='hp'):(!hasFurnace&&!hpLockedOut));
  const condenserActive=hasCond&&(!heatMode||(isDualFuel?(heatSubMode==='hp'):(!hasFurnace&&!hpLockedOut)));
  const refReversed=heatMode&&(!hasFurnace||(isDualFuel&&heatSubMode==='hp'));
  const auxHeatActive=hpLockedOut;
  // The indoor blower moves air whenever ANY source is delivering
  // conditioned air - cooling, furnace heat, heat pump heat, or aux/
  // emergency heat alone once the compressor's locked out. It's easy to
  // miss the heat-pump-heating and aux-heat-only cases since neither
  // furnaceActive nor "not heatMode" covers them on their own.
  const blowerActive=!heatMode||furnaceActive||evapActive||auxHeatActive;
  // Thermostat preview reading - not a fixed setpoint, but what the system
  // is actually doing right now: a couple degrees higher in cool mode once
  // a dehumidifier is pulling the humidity down (drier air reads as
  // comfortable at a higher temp), and a lower indoor reading as the
  // outdoor temp drops and the system has to work harder to hold it - full
  // heat pump performance at 52°F outdoor, straining (aux heat/furnace
  // takeover) at 28°F. Same split for a heat-pump-only air handler as for
  // dual fuel; a straight-cool system (furnace-only heating, no heat pump
  // at all) has no "efficient" state to show, so it always reads 67°.
  const thermostatTemp=!heatMode?(hasDehu?76:74):(((isDualFuel||!hasFurnace)&&heatSubMode==='hp')?70:67);

  // Refrigerant colors - physically correct
  const evapC  = refReversed ? '#ef4444' : '#2389e0'; // evap: red=HP heat, blue=cool
  const evapC2 = refReversed ? '#fca5a5' : '#7dd3fc';
  const condC  = (heatMode&&(!hasFurnace||(isDualFuel&&heatSubMode==='hp'))) ? '#2389e0' : '#ef4444';
  const line1C = refReversed ? '#2389e0' : '#ef4444';
  const line2C = refReversed ? '#ef4444' : '#2389e0';

  const TL={fedmin:'14 SEER2',mid_ge15:'18 SEER2',high_ge18:'21 SEER2'}[a.cond_tier]||'';
  // Real motor type at the indoor blower differs by tier - this is new
  // information the diagram didn't previously show at all. Federal Minimum
  // pairs with a single/multi-tap ECM (electronically commutated motor,
  // fixed set of speed taps); Mid Efficiency steps up to a true variable-
  // speed motor (ramps continuously to match load/humidity demand); High
  // Efficiency pairs with a modulating variable-speed motor that
  // communicates with the modulating gas valve / inverter compressor for
  // fine-grained staging. Shown as a small subtext line under "BLOWER",
  // the same convention already used for the furnace's AFUE badge.
  const BLOWER_MOTOR={fedmin:'ECM MOTOR',mid_ge15:'VARIABLE SPEED',high_ge18:'MOD. VAR. SPEED'}[a.cond_tier]||'';

  // ── SUB-COMPONENTS ──────────────────────────────────────────

  function BlowerWheel({cx,cy,r,spd,active}){
    r=r||28; spd=spd||1; active=active!==false;
    const blades=Array.from({length:16},(_,i)=>{
      const ang=i*(360/16)*Math.PI/180;
      return <line key={i}
        x1={cx+r*0.36*Math.cos(ang)} y1={cy+r*0.36*Math.sin(ang)}
        x2={cx+r*0.88*Math.cos(ang+0.22)} y2={cy+r*0.88*Math.sin(ang+0.22)}
        stroke={active?(G+'.7)'):(G+'.2)')} strokeWidth="1.9" strokeLinecap="round"/>;
    });
    return <g>
      <circle cx={cx} cy={cy} r={r+4} fill="rgba(0,0,0,.5)" stroke={G+'.15)'} strokeWidth="0.8"/>
      <circle cx={cx} cy={cy} r={r} fill="#050505" stroke={G+'.3)'} strokeWidth="0.9"/>
      {active
        ?<g className="spin" style={{transformBox:'fill-box',transformOrigin:'center',animationDuration:(1.0/spd)+'s'}}>{blades}</g>
        :<g>{blades}</g>}
      <circle cx={cx} cy={cy} r={r*0.27} fill="#090909" stroke={G+'.34)'} strokeWidth="0.9"/>
      <circle cx={cx} cy={cy} r={r*0.1} fill="#111" stroke={G+'.42)'} strokeWidth="0.6"/>
    </g>;
  }

  // Outdoor axial condenser fan, viewed head-on - real condenser fans have
  // a small number (typically 3) of large, wide blades, nothing like an
  // indoor squirrel-cage blower's many thin radial vanes (BlowerWheel
  // above). Kept as its own component specifically so the mid-tier
  // condenser's front fan never gets confused with an indoor blower again.
  function CondenserFan({cx,cy,r,active,fast}){
    // Real axial blades are a filled, tapered scimitar shape - wide at the
    // hub, sweeping out to a near-point tip - not a uniform-width stroked
    // line. A thick round-capped stroke (the old approach) has no taper
    // and reads as a flailing stick-figure limb instead of a blade. Each
    // blade here is a closed path: a wide edge at the hub, two curves
    // sweeping out to a narrow tip, filled solid with a glowing accent
    // rim when spinning for a cleaner, more high-tech look.
    const bladeFill=active?'#ccd3e0':'#565c68';
    const rim=active?'#7fb8ff':'rgba(70,76,90,.6)';
    return <g>
      <circle cx={cx} cy={cy} r={r+3} fill="rgba(0,0,0,.55)" stroke="rgba(60,65,78,.7)" strokeWidth="1.2"/>
      {active&&<circle cx={cx} cy={cy} r={r+1} fill="none" stroke={rim} strokeWidth="1" opacity="0.55" filter="url(#glow-sm)"/>}
      {/* transformBox:'fill-box' + transformOrigin:'center' (used elsewhere
          in this file for BlowerWheel/CapFan) rotates around the BOUNDING
          BOX's center, not the hub - fine for those, since their blade
          layouts have even-fold symmetry (opposite blades cancel out and
          the bounding box ends up centered on the hub anyway). Three
          blades all swept the same rotational direction has no such
          cancellation, so the bounding box is off-center from (cx,cy) and
          the whole fan visibly orbits instead of spinning in place.
          transformBox:'view-box' + an explicit px origin rotates around
          the actual hub coordinate instead, regardless of the blades'
          bounding box. */}
      <g className={active?"spin":undefined} style={active?{transformBox:'view-box',transformOrigin:cx+'px '+cy+'px',animationDuration:(fast?'0.45s':'0.8s')}:{}}>
        {Array.from({length:3},(_,i)=>{
          const ang=i*(Math.PI*2/3);
          const sweep=0.95;
          const hubR=r*0.16, tipR=r*0.95;
          const ux=Math.cos(ang), uy=Math.sin(ang);
          const px=-Math.sin(ang), py=Math.cos(ang);
          const hubW=r*0.19;
          const hAx=cx+ux*hubR+px*hubW, hAy=cy+uy*hubR+py*hubW;
          const hBx=cx+ux*hubR-px*hubW, hBy=cy+uy*hubR-py*hubW;
          const tipAng=ang+sweep;
          const tX=cx+Math.cos(tipAng)*tipR, tY=cy+Math.sin(tipAng)*tipR;
          const c1Ang=ang+sweep*0.4, c1R=r*0.64;
          const c1X=cx+Math.cos(c1Ang)*c1R+px*hubW*0.5, c1Y=cy+Math.sin(c1Ang)*c1R+py*hubW*0.5;
          const c2Ang=ang+sweep*0.62, c2R=r*0.56;
          const c2X=cx+Math.cos(c2Ang)*c2R-px*hubW*0.32, c2Y=cy+Math.sin(c2Ang)*c2R-py*hubW*0.32;
          const d=`M${hAx.toFixed(1)} ${hAy.toFixed(1)} Q${c1X.toFixed(1)} ${c1Y.toFixed(1)} ${tX.toFixed(1)} ${tY.toFixed(1)} Q${c2X.toFixed(1)} ${c2Y.toFixed(1)} ${hBx.toFixed(1)} ${hBy.toFixed(1)} Z`;
          return <path key={i} d={d} fill={bladeFill} stroke={active?rim:'rgba(20,22,26,.7)'} strokeWidth="0.7" opacity={active?0.95:0.8}/>;
        })}
      </g>
      <circle cx={cx} cy={cy} r={r*0.18} fill="#16181c" stroke={active?rim:"rgba(90,95,110,.6)"} strokeWidth="1"/>
      <circle cx={cx} cy={cy} r={r*0.07} fill={active?rim:"#3a3d44"}/>
    </g>;
  }

  // UV rod - thin horizontal rod ~45px (9" at scale), UV purple glow
  function UVRod({x,y,len,vertical}){
    len=len||56;
    const x2=vertical?x:x+len, y2=vertical?y+len:y;
    return <g className="fadein">
      {/* Wide diffuse glow */}
      <line x1={x} y1={y} x2={x2} y2={y2}
        stroke="rgba(139,92,246,.55)" strokeWidth={vertical?22:22} strokeLinecap="round" filter="url(#glow-uv)" className="glow-pulse"/>
      {/* Mid glow */}
      <line x1={x} y1={y} x2={x2} y2={y2}
        stroke="rgba(167,139,250,.75)" strokeWidth={vertical?10:10} strokeLinecap="round" filter="url(#glow-uv)"/>
      {/* Rod body */}
      <line x1={x} y1={y} x2={x2} y2={y2}
        stroke="rgba(216,180,254,.95)" strokeWidth={vertical?3.5:3.5} strokeLinecap="round"/>
      {/* End caps */}
      <circle cx={x} cy={y} r="4" fill="rgba(167,139,250,.9)" stroke="rgba(216,180,254,.8)" strokeWidth="1"/>
      <circle cx={x2} cy={y2} r="4" fill="rgba(167,139,250,.9)" stroke="rgba(216,180,254,.8)" strokeWidth="1"/>
      {/* Pulse overlay */}
      <line x1={x} y1={y} x2={x2} y2={y2}
        stroke="rgba(233,213,255,.6)" strokeWidth={vertical?2:2} strokeLinecap="round" className="glow-pulse"/>
    </g>;
  }

  // Ionizer - bulb sits OUTSIDE on top of plenum, rod penetrates DOWN into airstream
  // bulbX/bulbY = center of the bulb (outside, above plenum top)
  // rodLen = how far the rod extends down inside the plenum
  function Ionizer({bulbX, bulbY, rodLen}){
    rodLen=rodLen||55;
    const rodBot=bulbY+rodLen;
    return <g className="fadein">
      {/* Outer glow halo around bulb */}
      <circle cx={bulbX} cy={bulbY} r={14}
        fill="rgba(253,224,71,.08)" stroke="rgba(253,224,71,.2)" strokeWidth="0.6"
        filter="url(#glow-uv)"/>
      {/* Bulb body - larger, amber glass shape */}
      <ellipse cx={bulbX} cy={bulbY} rx={9} ry={11}
        fill="rgba(251,191,36,.18)" stroke="rgba(253,224,71,.75)" strokeWidth="1.5"/>
      {/* Bulb inner glow */}
      <ellipse cx={bulbX} cy={bulbY} rx={5.5} ry={7}
        fill="rgba(253,224,71,.35)" stroke="none" className="glow-pulse"/>
      {/* Filament / element inside bulb */}
      <line x1={bulbX-3} y1={bulbY-4} x2={bulbX+3} y2={bulbY+4}
        stroke="rgba(253,224,71,.9)" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1={bulbX+3} y1={bulbY-4} x2={bulbX-3} y2={bulbY+4}
        stroke="rgba(253,224,71,.9)" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Mounting collar / base where rod enters plenum */}
      <rect x={bulbX-4} y={bulbY+9} width={8} height={5} rx="1"
        fill="rgba(180,130,20,.5)" stroke="rgba(253,224,71,.5)" strokeWidth="0.8"/>
      {/* Rod going down into plenum */}
      {/* Glow halo behind rod */}
      <line x1={bulbX} y1={bulbY+14} x2={bulbX} y2={rodBot}
        stroke="rgba(253,224,71,.2)" strokeWidth={7} strokeLinecap="round" filter="url(#glow-uv)"/>
      {/* Rod body */}
      <line x1={bulbX} y1={bulbY+14} x2={bulbX} y2={rodBot}
        stroke="rgba(253,224,71,.82)" strokeWidth={2.2} strokeLinecap="round"/>
      {/* Plasma tip at rod end */}
      <circle cx={bulbX} cy={rodBot} r={3} fill="rgba(253,224,71,.9)" className="glow-pulse"/>
      <text x={bulbX+14} y={bulbY} textAnchor="start"
        fill="rgba(253,224,71,.48)" fontSize="9.5" fontFamily="monospace">IONIZER</text>
    </g>;
  }

  // A-coil > (peak RIGHT) - horizontal attic
  function ACoilH({x,y,w,h,active}){
    const peakX=x+w, peakY=y+h/2; const n=8;
    const tc=active?evapC:'rgba(48,48,78,.8)';
    return <g>
      <polygon points={`${x},${y} ${peakX},${peakY} ${peakX},${peakY+8} ${x},${y+12}`}
        fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"}
        stroke={active?(evapC+'88'):(G+'.22)')} strokeWidth="0.9"/>
      <polygon points={`${x},${y+h} ${peakX},${peakY} ${peakX},${peakY+8} ${x},${y+h-12}`}
        fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"}
        stroke={active?(evapC2+'80'):(G+'.18)')} strokeWidth="0.9"/>
      {Array.from({length:14},(_,i)=>(
        <line key={i} x1={x+4} y1={y+h*(i+0.5)/14} x2={x+w-8} y2={y+h*(i+0.5)/14}
          stroke={W+'.04)'} strokeWidth="0.4"/>
      ))}
      {Array.from({length:n},(_,i)=>{
        const t=(i+0.5)/n, tx=x+(peakX-x)*t+3, ty=y+(peakY-y)*t+3;
        return <g key={i}>
          <ellipse cx={tx} cy={ty} rx={4} ry={2} fill={active?(evapC+'22'):'rgba(14,14,34,.8)'} stroke={tc} strokeWidth="0.9" transform={`rotate(-22,${tx},${ty})`}/>
          {active&&<circle cx={tx} cy={ty} r={1.6} fill={evapC} opacity="0.7" className="glow-pulse" style={{animationDelay:i*0.1+'s'}}/>}
        </g>;
      })}
      {Array.from({length:n},(_,i)=>{
        const t=(i+0.5)/n, tx=x+(peakX-x)*t+3, ty=(y+h)+(peakY-(y+h))*t-3;
        return <g key={i}>
          <ellipse cx={tx} cy={ty} rx={4} ry={2} fill={active?(evapC2+'22'):'rgba(14,14,34,.8)'} stroke={active?evapC2:tc} strokeWidth="0.9" transform={`rotate(22,${tx},${ty})`}/>
          {active&&<circle cx={tx} cy={ty} r={1.6} fill={evapC2} opacity="0.7" className="glow-pulse" style={{animationDelay:(i+n)*0.1+'s'}}/>}
        </g>;
      })}
      <circle cx={peakX-5} cy={peakY+4} r={5.5} fill="#06061c" stroke={active?evapC:(G+'.3)')} strokeWidth="1.3"/>
      {active&&<circle cx={peakX-5} cy={peakY+4} r={2.5} fill={evapC} opacity="0.85" className="glow-pulse"/>}
      <rect x={x} y={y+h} width={w} height={6} rx="1" fill="#08121e" stroke={B+'.2)'} strokeWidth="0.7"/>
      {/* UV rod - centered exactly in the > coil:
          horizontal midline = y+h/2, depth center = x + w*0.45
          rod runs horizontal, length ~9" at scale (46px) */}
      {hasUV&&(()=>{
        const rodLen=Math.min(w*0.70, w-12);
        const rodCX=x+w*0.48;
        const rodCY=y+h/2;
        return <UVRod x={rodCX-rodLen/2} y={rodCY} len={rodLen}/>;
      })()}
    </g>;
  }

  // A-coil ^ (peak UP) - upflow
  function ACoilV({x,y,w,h,active}){
    const peakX=x+w/2, peakY=y; const n=7;
    const tc=active?evapC:'rgba(48,48,78,.8)';
    return <g>
      <polygon points={`${x},${y+h} ${peakX},${peakY} ${peakX+8},${peakY} ${x+12},${y+h}`}
        fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"} stroke={active?(evapC+'88'):(G+'.22)')} strokeWidth="0.9"/>
      <polygon points={`${x+w},${y+h} ${peakX},${peakY} ${peakX+8},${peakY} ${x+w-12},${y+h}`}
        fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"} stroke={active?(evapC2+'80'):(G+'.18)')} strokeWidth="0.9"/>
      {Array.from({length:12},(_,i)=>(
        <line key={i} x1={x+w*(i+0.5)/12} y1={y+4} x2={x+w*(i+0.5)/12} y2={y+h-4} stroke={W+'.04)'} strokeWidth="0.4"/>
      ))}
      {Array.from({length:n},(_,i)=>{
        const t=(i+0.5)/n, tx=x+(peakX-x)*t+3, ty=(y+h)+(peakY-(y+h))*t+3;
        return <g key={i}>
          <ellipse cx={tx} cy={ty} rx={4} ry={2} fill={active?(evapC+'22'):'rgba(14,14,34,.8)'} stroke={tc} strokeWidth="0.9" transform={`rotate(${Math.atan2(peakY-(y+h),peakX-x)*180/Math.PI},${tx},${ty})`}/>
          {active&&<circle cx={tx} cy={ty} r={1.6} fill={evapC} opacity="0.7" className="glow-pulse" style={{animationDelay:i*0.11+'s'}}/>}
        </g>;
      })}
      {Array.from({length:n},(_,i)=>{
        const t=(i+0.5)/n, tx=(x+w)+(peakX-(x+w))*t-3, ty=(y+h)+(peakY-(y+h))*t+3;
        return <g key={i}>
          <ellipse cx={tx} cy={ty} rx={4} ry={2} fill={active?(evapC2+'22'):'rgba(14,14,34,.8)'} stroke={active?evapC2:tc} strokeWidth="0.9" transform={`rotate(${Math.atan2(peakY-(y+h),peakX-(x+w))*180/Math.PI},${tx},${ty})`}/>
          {active&&<circle cx={tx} cy={ty} r={1.6} fill={evapC2} opacity="0.7" className="glow-pulse" style={{animationDelay:(i+n)*0.11+'s'}}/>}
        </g>;
      })}
      <circle cx={peakX+4} cy={peakY+6} r={5.5} fill="#06061c" stroke={active?evapC:(G+'.3)')} strokeWidth="1.3"/>
      {active&&<circle cx={peakX+4} cy={peakY+6} r={2.5} fill={evapC} opacity="0.85" className="glow-pulse"/>}
      <rect x={x} y={y+h} width={w} height={6} rx="1" fill="#08121e" stroke={B+'.2)'} strokeWidth="0.7"/>
      {/* UV rod - centered in the ^ A-coil triangle:
          Triangle centroid is at (x+w/2, y + h*2/3) - that's the geometric center.
          Rod runs vertical through the centroid, ~9" at scale (46px) */}
      {hasUV&&(()=>{
        const rodCX=x+w*0.5;     // horizontal center of the A-frame
        const rodLen2=Math.min(h*0.75, h-12);
        const rodCY=y+h/2;
        return <UVRod x={rodCX} y={rodCY-rodLen2/2} len={rodLen2} vertical={true}/>;
      })()}
      {/* Liquid + suction stub-outs - the actual lineset connection, at
          the coil's base/header on the RIGHT side of its cabinet (not the
          peak, which is the internal distributor drawn above - real
          lineset never taps into that). Both tubes exit side by side from
          one point so they read as one connection, not two unrelated
          ones. Positioned in fractions of this box's own (y,h) so callers
          that compute the external lineset's Y from the same fractions
          always land exactly here, even if the coil's size/position
          changes. */}
      <rect x={x+w-6} y={y+h*0.80-3} width={16} height={6} rx="1.5" fill={active?(evapC+'2a'):'rgba(22,22,44,.7)'} stroke={evapC} strokeWidth="0.9"/>
      <rect x={x+w-6} y={y+h*0.88-3} width={16} height={6} rx="1.5" fill={active?(evapC2+'2a'):'rgba(22,22,44,.7)'} stroke={evapC2} strokeWidth="0.9"/>
    </g>;
  }

  // Furnace horizontal - blower LEFT | HX RIGHT
  function FurnaceH({x,y,w,h,active,roofY}){
    const mid=x+w/2;
    return <g>
      <rect x={x} y={y} width={w} height={h} rx="4"
        fill={active?"#0d0606":"#0a0a0a"}
        stroke={active?'rgba(249,115,22,.84)':(G+'.64)')} strokeWidth={active?2.2:1.8}/>
      {active&&<rect x={x} y={y} width={w} height={h} rx="4" fill={O+'.04)'} stroke="none"/>}
      <rect x={x} y={y} width={w} height={9} rx="4" fill={active?"url(#orange-g)":"url(#gold)"} opacity=".72"/>
      <line x1={mid} y1={y+9} x2={mid} y2={y+h} stroke={G+'.2)'} strokeWidth="1" strokeDasharray="4 3"/>
      {Array.from({length:7},(_,i)=>(
        <line key={i} x1={x+3} y1={y+12+i*(h-18)/7} x2={x+3} y2={y+18+i*(h-18)/7}
          stroke={G+'.36)'} strokeWidth="3" strokeLinecap="round"/>
      ))}
      <BlowerWheel cx={x+w*0.25} cy={y+h*0.42} r={Math.min(w*0.21,h*0.29)}
        spd={blowerActive?1.6:0.5} active={blowerActive}/>
      <text x={x+w*0.25} y={y+h-13} textAnchor="middle" fill={G+'.55)'} fontSize="10" fontFamily="monospace">BLOWER</text>
      <text x={x+w*0.25} y={y+h-4} textAnchor="middle" fill={G+'.4)'} fontSize="7.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
      {Array.from({length:6},(_,i)=>{
        const gy=y+10+i*(h-18)/6;
        return <path key={i}
          d={`M${mid+6} ${gy+6} Q${mid+w*0.17} ${gy-2} ${mid+w*0.31} ${gy+7} Q${mid+w*0.41} ${gy+14} ${mid+w*0.31} ${gy+18}`}
          fill="none" stroke={active?'rgba(249,115,22,.6)':'rgba(108,44,8,.22)'} strokeWidth="2.8" strokeLinecap="round"/>;
      })}
      <rect x={mid+4} y={y+h-17} width={w/2-8} height={10} rx="2"
        fill={active?O+'.07)':'rgba(5,5,13,.8)'} stroke={active?'rgba(249,115,22,.42)':(G+'.14)')} strokeWidth="0.6"/>
      {Array.from({length:4},(_,i)=>{
        const bx=mid+6+i*(w/2-12)/4, bw2=(w/2-14)/4;
        return <g key={i}>
          <rect x={bx} y={y+h-16} width={bw2} height={8} rx="1"
            fill={active?"#100505":"#09090f"} stroke={active?'rgba(249,115,22,.36)':'rgba(48,20,5,.2)'} strokeWidth="0.5"/>
          {active&&<>
            <ellipse cx={bx+bw2/2} cy={y+h-16} rx={bw2/2} ry={4.5} fill={O+'.56)'} className="glow-pulse" style={{animationDelay:i*0.12+'s'}}/>
            <ellipse cx={bx+bw2/2} cy={y+h-18} rx={bw2/3} ry={3.5} fill="rgba(253,224,71,.64)" className="glow-pulse" style={{animationDelay:i*0.12+0.07+'s'}}/>
          </>}
        </g>;
      })}
      <text x={mid+w*0.25} y={y+h-4} textAnchor="middle" fill={active?'rgba(249,115,22,.75)':(G+'.5)')} fontSize="10.5" fontFamily="monospace">HEAT EXCH.</text>
      {(()=>{
        const pW=is90?5:7;
        const pC=is90?"#bfdbfe":"#c0c0c0";
        const pS=is90?"#93c5fd":"#999";
        const fX=mid+Math.round(w*0.2); // flue exit X - right half of furnace
        const pipeTop=roofY-12; // pokes ~12px above the actual roof surface, not up into the sky
        return <>
          {/* Flue pipe - from top of furnace up through the roof, stopping
              just above the roofline instead of shooting up toward the
              top of the canvas. */}
          <rect x={fX-pW/2} y={pipeTop} width={pW} height={Math.max(0,y-pipeTop)} rx="1"
            fill={pC} stroke={pS} strokeWidth="0.7"/>
          {/* Cap at top (visible just above the roofline) */}
          {is90
            ?<rect x={fX-pW-1} y={pipeTop} width={pW*2+2} height={5} rx="1" fill={pC} stroke={pS} strokeWidth="0.7"/>
            :<path d={'M'+(fX-pW-2)+' '+(pipeTop+5)+' L'+fX+' '+(pipeTop-3)+' L'+(fX+pW+2)+' '+(pipeTop+5)} fill={pC} stroke={pS} strokeWidth="0.5"/>
          }
          <text x={fX+6} y={y-8} textAnchor="start"
            fill={is90?"rgba(147,197,253,.5)":"rgba(148,148,148,.44)"} fontSize="9.5" fontFamily="monospace">{is90?'PVC':'B-VENT'}</text>
        </>;
      })()}
      {isComm&&<><rect x={x+4} y={y+11} width={70} height="9" rx="2" fill="url(#blue)"/><text x={x+7} y={y+18} fill="#fff" fontSize="8.5" fontFamily="monospace">COMMUNICATING</text></>}
      <rect x={mid+4} y={y+11} width={36} height="8" rx="2" fill={is90?"rgba(35,137,224,.13)":(G+'.07)')} stroke={is90?(B+'.24)'):(G+'.16)')} strokeWidth="0.5"/>
      <text x={mid+22} y={y+18} textAnchor="middle" fill={is90?"#5ba8f5":(G+'.6)')} fontSize="10" fontFamily="monospace">{is90?'90%':'80%'} AFUE</text>
    </g>;
  }

  // Air handler horizontal - blower LEFT | A-coil RIGHT
  // Air handler splits into three labeled sections, sized by real
  // proportion (A-coil 50% / blower 35% / aux heat kit 15%) and ordered by
  // airflow: A-coil is always closest to the return plenum (the left edge
  // here, where return/filtration feed in), then blower, then the aux heat
  // kit downstream of the blower discharge - matching where a real heat
  // strip kit sits in the supply plenum. Present on every air-handler
  // build regardless of efficiency tier: the low-ambient mid tier is rated
  // to keep the compressor running well below where this kicks in for the
  // other two tiers, so the kit is still physically installed there as
  // backup, it just almost never glows. Glows alongside the compressor
  // whenever the heat pump alone can't hold the setpoint and aux/emergency
  // heat kicks in (auxHeat).
  function AirHandlerH({x,y,w,h,active,auxHeat}){
    const coilW=w*0.50, blowerW=w*0.35, auxW=w*0.15;
    const c1=x+coilW, c2=x+coilW+blowerW;
    return <g>
      <rect x={x} y={y} width={w} height={h} rx="4"
        fill={active?"#050c1a":"#090909"}
        stroke={active?(evapC+'90'):(G+'.48)')} strokeWidth={active?1.9:1.5}/>
      {active&&<rect x={x} y={y} width={w} height={h} rx="4" fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none"/>}
      <rect x={x} y={y} width={w} height={9} rx="4" fill={active?(refReversed?"url(#orange-g)":"url(#blue)"):"url(#gold)"} opacity=".68"/>
      <line x1={c1} y1={y+9} x2={c1} y2={y+h} stroke={G+'.18)'} strokeWidth="0.9" strokeDasharray="4 3"/>
      <line x1={c2} y1={y+9} x2={c2} y2={y+h} stroke={G+'.18)'} strokeWidth="0.9" strokeDasharray="4 3"/>
      {Array.from({length:7},(_,i)=>(
        <line key={i} x1={x+3} y1={y+12+i*(h-18)/7} x2={x+3} y2={y+18+i*(h-18)/7}
          stroke={G+'.32)'} strokeWidth="3" strokeLinecap="round"/>
      ))}
      <rect x={x+3} y={y+8} width={coilW-6} height={h-14} rx="2" fill={active?"rgba(4,8,22,.7)":"rgba(6,6,16,.7)"}/>
      <ACoilH x={x+9} y={y+12} w={coilW-19} h={h-22} active={active}/>
      <text x={x+coilW/2} y={y+h-4} textAnchor="middle" fill={active?evapC:(G+'.5)')} fontSize="10.5" fontFamily="monospace">A-COIL</text>
      <BlowerWheel cx={c1+blowerW/2} cy={y+h*0.42} r={Math.min(blowerW*0.32,h*0.29)}
        spd={blowerActive?1.5:0.45} active={blowerActive}/>
      <text x={c1+blowerW/2} y={y+h-13} textAnchor="middle" fill={G+'.55)'} fontSize="10" fontFamily="monospace">BLOWER</text>
      <text x={c1+blowerW/2} y={y+h-4} textAnchor="middle" fill={G+'.4)'} fontSize="7.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
      <rect x={c2+3} y={y+8} width={auxW-6} height={h-14} rx="2"
        fill={auxHeat?"rgba(120,20,10,.16)":"rgba(10,10,14,.5)"}
        stroke={auxHeat?"rgba(249,115,22,.6)":(G+'.14)')} strokeWidth="0.8"/>
      {Array.from({length:3},(_,i)=>{
        const segW=(auxW-16)/3;
        const bx=c2+7+i*(auxW-10)/3;
        return <g key={i}>
          <rect x={bx} y={y+h*0.3} width={Math.max(1,segW)} height={h*0.34} rx="1"
            fill={auxHeat?"#1a0805":"#0a0a0f"} stroke={auxHeat?"rgba(249,115,22,.4)":"rgba(48,20,5,.2)"} strokeWidth="0.5"/>
          {auxHeat&&<ellipse cx={bx+segW/2} cy={y+h*0.3} rx={segW/2} ry={3.5}
            fill="rgba(249,115,22,.6)" className="glow-pulse" style={{animationDelay:i*0.1+'s'}}/>}
        </g>;
      })}
      {/* At 15% of the unit's width this section is too narrow for the
          full "AUX HEAT KIT" label at a readable size (it used to wrap to
          two lines at 7.5-8px). "AUX" alone reads at the same 10.5px size
          as A-COIL/BLOWER - the full meaning is already spelled out right
          next to the diagram (the AUX HEAT mode toggle) and in the status
          line under the unit ("AUX HEAT ONLY"), so nothing is lost. */}
      <text x={c2+auxW/2} y={y+h-4} textAnchor="middle" fill={auxHeat?"rgba(249,115,22,.78)":(G+'.5)')} fontSize="10.5" fontFamily="monospace">AUX</text>
      <rect x={x} y={y+h} width={w} height={6} rx="1" fill="#08121e" stroke={B+'.18)'} strokeWidth="0.7"/>

    </g>;
  }

  // CapFan -- side-perspective view into condenser top cap
  // Fan blades contained by keeping radii tight -- no clipPath needed
  function CapFan({x,y,w,h,active,bladeColor,slatFill,slatCount}){
    slatCount=slatCount||Math.floor(h*0.7/4.5);
    const cx=x+w/2, cy=y+h/2;
    const fanRx=w*0.40;  // keep well inside width
    const fanRy=h*0.28;  // keep well inside height
    const spd=active?0.9:0;
    const spinStyle=active?{
      transformBox:'fill-box',
      transformOrigin:'center',
      animation:'spin '+(1/spd).toFixed(2)+'s linear infinite',
    }:{};
    const bC=bladeColor||(active?'rgba(80,85,95,.75)':'rgba(50,55,62,.5)');
    // Blades are laid out on a true circle (radius fanRx) and rotated as
    // one, THEN flattened into the cap's side-perspective ellipse with a
    // static scaleY - not the other way round. Rotating points that were
    // already squashed onto an ellipse (unequal x/y radii) with a plain
    // CSS rotate() doesn't preserve the ellipse - a blade tip near the
    // ellipse's long axis swings, at the same radius, to where the SHORT
    // axis is, poking far out past the shallow cap (reads as blades
    // flying out of the condenser). Rotating a genuine circle has no such
    // distortion; squashing it afterwards is a fixed, non-animating step.
    const squash=fanRy/fanRx;
    return <>
      <ellipse cx={cx} cy={cy} rx={fanRx} ry={fanRy}
        fill={active?"rgba(10,11,14,.95)":"rgba(8,9,12,.9)"}
        stroke="rgba(30,32,38,.6)" strokeWidth="0.7"/>
      <g transform={'translate('+cx+' '+cy+') scale(1,'+squash+')'}>
        <g style={spinStyle}>
          {Array.from({length:4},(_,i)=>{
            const ang=i*(Math.PI/2);
            const bx1=fanRx*0.15*Math.cos(ang);
            const by1=fanRx*0.15*Math.sin(ang);
            const bx2=fanRx*0.82*Math.cos(ang+0.55);
            const by2=fanRx*0.82*Math.sin(ang+0.55);
            const cpx=fanRx*0.65*Math.cos(ang+0.28);
            const cpy=fanRx*0.65*Math.sin(ang+0.28);
            return <path key={i} d={'M'+bx1+' '+by1+' Q'+cpx+' '+cpy+' '+bx2+' '+by2}
              fill="none" stroke={bC} strokeWidth="4" strokeLinecap="round" opacity="0.9"/>;
          })}
        </g>
      </g>
      <ellipse cx={cx} cy={cy} rx={fanRx*0.1} ry={fanRy*0.12}
        fill="#1a1c20" stroke="rgba(55,60,68,.6)" strokeWidth="0.8"/>
      {Array.from({length:slatCount},(_,i)=>{
        const sy=y+2+i*(h-4)/slatCount;
        return <rect key={i} x={x+2} y={sy} width={w-4} height={(h-4)/slatCount*0.55} rx="0.5"
          fill={slatFill||"rgba(36,39,46,.9)"} stroke="rgba(18,20,24,.5)" strokeWidth="0.3"/>;
      })}
    </>;
  }

  // Condenser -- three distinct tiers
  function Condenser({x,y,w,h,active,tierKey}){
    const isMini=tierKey==='mid_ge15';
    const isBig=tierKey==='high_ge18';
    const isFed=tierKey==='fedmin';
    const cc=active?condC:(refReversed?'rgba(18,18,55,.5)':'rgba(55,18,18,.5)');

    return <g>
      {isFed&&<>
        {/* FED MIN: light gray louvered box */}
        <rect x={x} y={y} width={w} height={h} rx={3}
          fill={active?"#b8bcc4":"#c2c6ce"}
          stroke={active?"rgba(150,155,165,.9)":"rgba(130,135,145,.8)"} strokeWidth="1.2"/>
        {/* Dark top cap with CapFan */}
        {(()=>{
          const capH=Math.round(h*0.16);
          return <>
            <rect x={x} y={y} width={w} height={capH} rx={3}
              fill={active?"#3a3d42":"#2e3035"} stroke="rgba(20,22,26,.8)" strokeWidth="1"/>
            <CapFan x={x+2} y={y+1} w={w-4} h={capH-2} active={active}
              bladeColor={active?(refReversed?"rgba(100,160,220,.8)":"rgba(220,90,90,.7)"):"rgba(45,48,55,.6)"}
              slatFill={active?"rgba(44,47,54,.88)":"rgba(36,39,46,.92)"}
              slatCount={Math.floor((capH-2)*0.7/4.5)}/>
            {[[x+5,y+4],[x+w-5,y+4],[x+5,y+capH-4],[x+w-5,y+capH-4]].map(([sx,sy],i)=>(
              <circle key={i} cx={sx} cy={sy} r={1.8}
                fill="rgba(50,55,62,.9)" stroke="rgba(80,85,95,.5)" strokeWidth="0.5"/>
            ))}
          </>;
        })()}
        {/* Horizontal louver slats on body */}
        {(()=>{
          const capH=Math.round(h*0.16);
          const slotY=y+capH+2, slotH=h-capH-4;
          const count=Math.floor(slotH/5.5), step=slotH/count;
          return Array.from({length:count},(_,i)=>(
            <g key={i}>
              <rect x={x+2} y={slotY+i*step} width={w-4} height={step-1.5} rx="0.5"
                fill={active?"rgba(145,150,158,.85)":"rgba(155,160,168,.8)"}/>
              <rect x={x+2} y={slotY+i*step} width={w-4} height={1.5}
                fill={active?"rgba(190,195,202,.6)":"rgba(200,204,210,.55)"}/>
              <rect x={x+2} y={slotY+i*step+step-2.5} width={w-4} height={1.2}
                fill="rgba(100,105,115,.4)"/>
            </g>
          ));
        })()}
        {/* Manufacturer data/rating plate, centered on the door panel -- a
            generic nameplate (rivets + printed spec lines), not a badge or
            monogram, so nothing here reads as a copied logo. */}
        {(()=>{
          const capH=Math.round(h*0.16);
          const by=y+capH+Math.round((h-capH)*0.36);
          const pw=Math.round(w*0.44), ph=Math.round(h*0.16);
          const px=x+w/2-pw/2;
          return <>
            <rect x={px} y={by} width={pw} height={ph} rx="1.5"
              fill="rgba(45,48,55,.55)" stroke="rgba(80,85,95,.55)" strokeWidth="0.8"/>
            {[0.28,0.5,0.72].map((ty,i)=>(
              <rect key={i} x={px+pw*0.14} y={by+ph*ty} width={pw*0.72*(1-i*0.16)} height={ph*0.09} rx="0.5"
                fill="rgba(150,155,165,.45)"/>
            ))}
            <circle cx={px+3} cy={by+3} r={1.1} fill="rgba(90,95,105,.7)"/>
            <circle cx={px+pw-3} cy={by+ph-3} r={1.1} fill="rgba(90,95,105,.7)"/>
          </>;
        })()}
        {[[x+4,y+h-4],[x+w-4,y+h-4]].map(([fx,fy],i)=>(
          <circle key={i} cx={fx} cy={fy} r={2.5}
            fill="rgba(90,95,105,.8)" stroke="rgba(60,65,75,.6)" strokeWidth="0.7"/>
        ))}
        {/* Compressor outline - visible inside housing */}
        {(()=>{
          const capH=Math.round(h*0.16);
          const bodyH=h-capH;
          const cW=Math.round(w*0.3), cH=Math.round(bodyH*0.42);
          const cX=x+w-cW-6, cY=y+capH+bodyH-cH-10;
          const domeH=Math.round(cH*0.22);
          return <g>
            <rect x={cX} y={cY+domeH} width={cW} height={cH-domeH} rx="3"
              fill="rgba(100,105,115,.18)" stroke={active?'rgba(180,80,80,.6)':"rgba(70,75,85,.4)"}
              strokeWidth={active?1.2:0.7} opacity={active?0.9:0.55}/>
            <ellipse cx={cX+cW/2} cy={cY+domeH} rx={cW/2} ry={domeH}
              fill="rgba(110,115,125,.2)" stroke={active?'rgba(180,80,80,.6)':"rgba(70,75,85,.4)"}
              strokeWidth={active?1.2:0.7} opacity={active?0.9:0.55}/>
            <rect x={cX+cW*0.6} y={cY-6} width={4} height={domeH+6} rx="1"
              fill={active?line1C:"rgba(60,65,75,.5)"} opacity={active?0.65:0.4}/>
            <rect x={cX-6} y={cY+domeH+Math.round(cH*0.25)} width={8} height={4} rx="1"
              fill={active?line2C:"rgba(60,65,75,.5)"} opacity={active?0.65:0.4}/>
            {/* Clamped to sit just above the SEER badge instead of
                cY+cH+domeH+10, which always lands domeH px below the
                cabinet's own bottom edge (cY+cH already equals y+h-10) --
                that pushed this label out of the housing entirely, where
                it overlapped the outside-zone's "CONCRETE PAD"/"GROUND
                LEVEL" text underneath it. */}
            <text x={cX+cW/2} y={y+h-19} textAnchor="middle"
              fill={active?'rgba(180,80,80,.6)':"rgba(80,85,95,.45)"} fontSize="9.5" fontFamily="monospace">COMP.</text>
          </g>;
        })()}
        {/* SEER badge */}
        <rect x={x+3} y={y+h-16} width={w-6} height={13} rx="2"
          fill="rgba(40,43,50,.82)" opacity="0.95"/>
        <text x={x+w/2} y={y+h-6} textAnchor="middle"
          fill="rgba(195,200,210,.9)" fontSize="11" fontFamily="monospace" fontWeight="700">{TL}</text>
      </>}

      {isMini&&<>
        {/* MID: real GE NS18H condensers are a front-discharge cabinet - a
            large round fan grille dominating most of the front face, a
            narrower service-panel column beside it - not a top-discharge
            square cabinet like the fed-min/high-eff units. Reverted back
            to this shape after an earlier pass mistakenly rebuilt it onto
            the top-discharge template; a real reference photo confirmed
            this round-front-fan silhouette is correct. */}
        <rect x={x} y={y} width={w} height={h} rx={6}
          fill={active?(refReversed?"#131828":"#1c1e22"):"#181a1e"}
          stroke={active?cc:"rgba(80,85,95,.7)"} strokeWidth={active?1.8:1.4}/>
        {/* Discharge grille top */}
        <rect x={x+4} y={y+2} width={w-8} height={Math.round(h*0.1)} rx="2"
          fill="rgba(0,0,0,.35)" stroke="rgba(70,75,85,.5)" strokeWidth="0.6"/>
        {Array.from({length:3},(_,i)=>(
          <rect key={i} x={x+6} y={y+4+i*4} width={w-12} height={2} rx="0.5"
            fill="rgba(35,38,45,.9)" stroke="rgba(60,65,75,.4)" strokeWidth="0.3"/>
        ))}
        {/* Left: large fan area ~68% */}
        {(()=>{
          const fanAreaW=Math.round(w*0.68);
          const fanAreaH=h-Math.round(h*0.1)-4;
          const fanAreaY=y+Math.round(h*0.1)+2;
          const fCX=x+fanAreaW/2, fCY=fanAreaY+fanAreaH/2;
          const fR=Math.round(Math.min(fanAreaW,fanAreaH)*0.43);
          return <>
            <rect x={x+2} y={fanAreaY} width={fanAreaW-2} height={fanAreaH} rx="3"
              fill="rgba(0,0,0,.4)" stroke="rgba(55,60,70,.5)" strokeWidth="0.7"/>
            {Array.from({length:Math.floor(fanAreaH/5)},(_,row)=>
              Array.from({length:Math.floor(fanAreaW/5)},(_,col)=>{
                const gx=x+4+col*5, gy=fanAreaY+2+row*5;
                const dx=gx-fCX, dy=gy-fCY;
                if(Math.sqrt(dx*dx+dy*dy)>fR+4) return null;
                return <rect key={row+'-'+col} x={gx} y={gy} width={1.5} height={1.5} rx="0.3"
                  fill="rgba(40,45,55,.9)"/>;
              })
            )}
            <circle cx={fCX} cy={fCY} r={fR+8} fill="none" stroke="rgba(60,65,78,.7)" strokeWidth="2.5"/>
            {/* Real condenser fans ramp up with load - faster at 96° (cool,
                full compressor load) and 52° (mild heat-pump load) than at
                28°, where either the compressor is standby (dual-fuel
                furnace mode) or running its slower low-ambient stage. */}
            <CondenserFan cx={fCX} cy={fCY} r={fR} active={active} fast={!heatMode||isMildHp}/>
          </>;
        })()}
        {/* Right: service panel ~30% */}
        {(()=>{
          const panelX=x+Math.round(w*0.7);
          const panelW=w-Math.round(w*0.7)-2;
          const panelY=y+Math.round(h*0.1)+4;
          const panelH=h-Math.round(h*0.1)-8;
          return <>
            <rect x={panelX} y={panelY} width={panelW} height={panelH} rx="4"
              fill={active?"rgba(28,32,40,.8)":"rgba(22,24,30,.7)"} stroke="rgba(55,60,72,.6)" strokeWidth="0.8"/>
            <rect x={panelX+3} y={panelY+6} width={panelW-6} height={Math.round(panelH*0.55)} rx="3"
              fill={active?"rgba(20,25,35,.9)":"rgba(16,18,24,.8)"} stroke="rgba(50,55,68,.5)" strokeWidth="0.7"/>
            <circle cx={panelX+panelW/2} cy={panelY+Math.round(panelH*0.7)} r={3.5}
              fill={active?(cc):"rgba(40,45,55,.6)"} stroke={active?cc:"rgba(55,60,70,.3)"} strokeWidth="0.8"/>
            {active&&<circle cx={panelX+panelW/2} cy={panelY+Math.round(panelH*0.7)} r={2}
              fill="#fff" className="glow-pulse"/>}
            {[0.18,0.88].map((ty,i)=>(
              <circle key={i} cx={panelX+panelW/2} cy={panelY+panelH*ty} r={1.8}
                fill="rgba(45,50,60,.9)" stroke="rgba(70,75,90,.5)" strokeWidth="0.5"/>
            ))}
            <circle cx={panelX+panelW/2} cy={panelY+Math.round(panelH*0.85)} r={5}
              fill="rgba(30,35,45,.8)" stroke={active?cc:"rgba(70,75,90,.5)"} strokeWidth="0.8"/>
            <text x={panelX+panelW/2} y={panelY+Math.round(panelH*0.87)} textAnchor="middle"
              fill={active?cc:"rgba(90,95,110,.7)"} fontSize="10" fontFamily="sans-serif" fontWeight="700">VS</text>
          </>;
        })()}
        {/* SEER badge */}
        <rect x={x+3} y={y+h-16} width={w-6} height={13} rx="2"
          fill={active?(refReversed?"url(#blue)":"url(#red-g)"):"url(#gold)"} opacity=".6"/>
        <text x={x+w/2} y={y+h-6} textAnchor="middle"
          fill="#fff" fontSize="11" fontFamily="monospace" fontWeight="700">{TL}</text>
      </>}

      {isBig&&<>
        {/* HIGH EFF: tall dark unit, vertical louvers, rounded top cap */}
        <rect x={x} y={y} width={w} height={h} rx={5}
          fill={active?(refReversed?"#1a1e2e":"#3a3d42"):"#343740"}
          stroke={active?cc:"rgba(55,60,68,.8)"} strokeWidth={active?1.8:1.4}/>
        {/* Chamfered corner strips */}
        <rect x={x} y={y+4} width={8} height={h-8} rx="2"
          fill={active?"#3e424a":"#383c44"} stroke="rgba(50,55,62,.7)" strokeWidth="0.8"/>
        <rect x={x+w-8} y={y+4} width={8} height={h-8} rx="2"
          fill={active?"#3e424a":"#383c44"} stroke="rgba(50,55,62,.7)" strokeWidth="0.8"/>
        {/* Dark rounded top cap with CapFan */}
        {(()=>{
          const capH=Math.round(h*0.2);
          return <>
            <rect x={x} y={y} width={w} height={capH} rx={5}
              fill="#1e2024" stroke="rgba(15,17,20,.9)" strokeWidth="1.2"/>
            <CapFan x={x+4} y={y+2} w={w-8} h={capH-4} active={active}
              bladeColor={active?(refReversed?"rgba(100,160,220,.7)":"rgba(220,90,90,.65)"):"rgba(40,44,52,.6)"}
              slatFill={active?"rgba(24,27,33,.88)":"rgba(18,21,27,.92)"}
              slatCount={Math.floor((capH-4)*0.72/5.5)}/>
            {[[x+6,y+6],[x+w-6,y+6],[x+6,y+capH-6],[x+w-6,y+capH-6]].map(([sx,sy],i)=>(
              <circle key={i} cx={sx} cy={sy} r={2}
                fill="rgba(35,38,44,.9)" stroke="rgba(55,60,68,.5)" strokeWidth="0.5"/>
            ))}
          </>;
        })()}
        {/* Top-tier accent trim -- wider than the mid-tier's thin band,
            reading as the flagship cabinet in the lineup */}
        <rect x={x} y={y+Math.round(h*0.2)+2} width={w} height={5}
          fill={active?cc:"rgba(120,128,145,.5)"} opacity={active?0.9:0.55}/>
        {/* Vertical louver panels */}
        {(()=>{
          const capH=Math.round(h*0.2);
          const bodyY=y+capH+2, bodyH=h-capH-4;
          const slotW=3.5, gap=2, step=slotW+gap;
          const leftW=Math.round(w*0.44);
          const rightX=x+w-leftW;
          return <>
            {Array.from({length:Math.floor(leftW/step)},(_,i)=>(
              <rect key={'l'+i} x={x+9+i*step} y={bodyY} width={slotW} height={bodyH} rx="0.5"
                fill={active?"rgba(48,52,60,.9)":"rgba(42,46,54,.85)"} stroke="rgba(30,33,40,.5)" strokeWidth="0.3"/>
            ))}
            {Array.from({length:Math.floor(bodyH/4)},(_,i)=>(
              <line key={'lf'+i} x1={x+9} y1={bodyY+2+i*4} x2={x+9+leftW-8} y2={bodyY+2+i*4}
                stroke="rgba(25,28,34,.6)" strokeWidth="0.5"/>
            ))}
            <rect x={x+leftW+4} y={bodyY} width={6} height={bodyH} rx="1"
              fill={active?"#3c4048":"#363a40"} stroke="rgba(45,50,58,.6)" strokeWidth="0.6"/>
            {Array.from({length:Math.floor(leftW/step)},(_,i)=>(
              <rect key={'r'+i} x={rightX-3+i*step} y={bodyY} width={slotW} height={bodyH} rx="0.5"
                fill={active?"rgba(48,52,60,.9)":"rgba(42,46,54,.85)"} stroke="rgba(30,33,40,.5)" strokeWidth="0.3"/>
            ))}
            {Array.from({length:Math.floor(bodyH/4)},(_,i)=>(
              <line key={'rf'+i} x1={rightX-3} y1={bodyY+2+i*4} x2={rightX+leftW-12} y2={bodyY+2+i*4}
                stroke="rgba(25,28,34,.6)" strokeWidth="0.5"/>
            ))}
          </>;
        })()}
        {active&&<rect x={x} y={y} width={w} height={h} rx={5}
          fill={refReversed?"rgba(35,137,224,.04)":"rgba(239,68,68,.03)"} stroke="none"/>}
        <rect x={x} y={y+h-6} width={w} height={6} rx={2}
          fill="#14151a" stroke="rgba(20,22,28,.8)" strokeWidth="0.7"/>
        {/* Compressor outline -- visible inside housing */}
        {(()=>{
          const capH=Math.round(h*0.2);
          const bodyH=h-capH;
          const cW=Math.round(w*0.28), cH=Math.round(bodyH*0.45);
          const cX=x+w-cW-8, cY=y+capH+bodyH-cH-10;
          const domeH=Math.round(cH*0.22);
          return <g>
            <rect x={cX} y={cY+domeH} width={cW} height={cH-domeH} rx="3"
              fill="rgba(20,22,28,.65)" stroke={active?cc:"rgba(70,75,85,.4)"} strokeWidth={active?1.2:0.7} opacity={active?0.9:0.55}/>
            <ellipse cx={cX+cW/2} cy={cY+domeH} rx={cW/2} ry={domeH}
              fill="rgba(25,28,35,.7)" stroke={active?cc:"rgba(70,75,85,.4)"} strokeWidth={active?1.2:0.7} opacity={active?0.9:0.55}/>
            <rect x={cX+cW*0.6} y={cY-6} width={4} height={domeH+6} rx="1"
              fill={active?line1C:"rgba(60,65,75,.5)"} opacity={active?0.7:0.4}/>
            <rect x={cX-6} y={cY+domeH+Math.round(cH*0.25)} width={8} height={4} rx="1"
              fill={active?line2C:"rgba(60,65,75,.5)"} opacity={active?0.7:0.4}/>
            {/* Clamped above the SEER badge -- see the fed-min compressor
                label's note on why the unclamped cY+cH+domeH+10 offset
                always falls domeH px below the cabinet's own bottom edge. */}
            <text x={cX+cW/2} y={y+h-19} textAnchor="middle"
              fill={active?cc:"rgba(80,85,95,.45)"} fontSize="9.5" fontFamily="monospace">COMP.</text>
          </g>;
        })()}
        {/* SEER badge */}
        <rect x={x+3} y={y+h-16} width={w-6} height={13} rx="2"
          fill={active?(refReversed?"url(#blue)":"url(#red-g)"):"url(#gold)"} opacity=".6"/>
        <text x={x+w/2} y={y+h-6} textAnchor="middle"
          fill="#fff" fontSize="11" fontFamily="monospace" fontWeight="700">{TL}</text>
      </>}
    </g>;
  }

  // rnd/OutsideZone now live at module scope, above Canvas - see the
  // comment there for why.


  // Condensate pump box - small labeled rect with a fixed 80x24 default,
  // shared by both the attic and closet layouts (each still routes its own
  // dashed connector line to it, since that routing differs per layout).
  function CondensatePump({x,y,w=80,h=24}){
    return <g className="fadein">
      <rect x={x} y={y} width={w} height={h} rx="3"
        fill="rgba(35,137,224,.14)" stroke={B+'.58)'} strokeWidth="1.2"/>
      <text x={x+w/2} y={y+11} textAnchor="middle"
        fill={B+'.82)'} fontSize="10" fontFamily="monospace">COND. PUMP</text>
      <text x={x+w/2} y={y+20} textAnchor="middle"
        fill={B+'.5)'} fontSize="9.5" fontFamily="monospace">condensate</text>
    </g>;
  }

  // Dehu + ERV roof boxes - shared between attic and closet layouts. Each
  // caller computes its own dehuBX/ervBX/BY/roofY (the two layouts anchor
  // them off completely different geometry), but the box/pipe/vent
  // rendering itself was previously duplicated near-verbatim between the
  // two - this is that rendering, parameterized on just the anchor points.
  function DehuErvBoxes({dehuBX,ervBX,BY,roofY,hasDehu,hasERV,snap}){
    if(!hasDehu&&!hasERV) return null;
    const BW=80,BH=48;
    const boxes=[];
    if(hasERV) boxes.push('erv');
    if(hasDehu) boxes.push('dehu');
    return <g>{boxes.map((type,i)=>{
      const BX=type==='dehu'?dehuBX:ervBX;
      const r1X=BX+BW*0.28, r2X=BX+BW*0.72;
      const isDehu=type==='dehu';
      const pipe1X=BX+Math.round(BW*0.28), pipe2X=BX+Math.round(BW*0.68);
      return <g key={type} className={snap?"snap":undefined} style={snap?{animationDelay:(0.32+i*0.05)+'s'}:undefined}>
        {isDehu
          ?<>
            <line x1={r1X} y1={roofY} x2={r1X} y2={BY} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 2" opacity="0.6"/>
            <line x1={r2X} y1={roofY} x2={r2X} y2={BY} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 2" opacity="0.6"/>
            <rect x={r1X-3} y={roofY-4} width="7" height="5" rx="1" fill="rgba(34,197,94,.3)" stroke="#22c55e" strokeWidth="0.7"/>
            <rect x={r2X-3} y={roofY-4} width="7" height="5" rx="1" fill="rgba(34,197,94,.3)" stroke="#22c55e" strokeWidth="0.7"/>
          </>
          :<>
            {/* ERV -- blue IN + orange OUT through roof. Pipes stop right
                at the roofline (roofY), not the literal top of the canvas. */}
            <rect x={pipe1X-2} y={roofY} width={5} height={Math.max(0,BY-roofY)} rx="1" fill={B+'.3)'} stroke={B+'.5)'} strokeWidth="0.8"/>
            <rect x={pipe1X-5} y={roofY-4} width="11" height={5} rx="1" fill={B+'.35)'} stroke={B+'.55)'} strokeWidth="0.8"/>
            <text x={pipe1X} y={roofY-6} textAnchor="middle" fill={B+'.6)'} fontSize="10" fontFamily="monospace">IN</text>
            <rect x={pipe2X-2} y={roofY} width={5} height={Math.max(0,BY-roofY)} rx="1" fill="rgba(249,115,22,.3)" stroke="rgba(249,115,22,.5)" strokeWidth="0.8"/>
            <path d={'M'+(pipe2X-4)+' '+(roofY-2)+' L'+pipe2X+' '+(roofY-9)+' L'+(pipe2X+4)+' '+(roofY-2)} fill="rgba(249,115,22,.4)"/>
            <text x={pipe2X} y={roofY-11} textAnchor="middle" fill="rgba(249,115,22,.6)" fontSize="10" fontFamily="monospace">OUT</text>
            <line x1={r1X} y1={roofY} x2={r1X} y2={BY} stroke={G+'.4)'} strokeWidth="1" strokeDasharray="4 2" opacity="0.5"/>
            <line x1={r2X} y1={roofY} x2={r2X} y2={BY} stroke={G+'.4)'} strokeWidth="1" strokeDasharray="4 2" opacity="0.5"/>
          </>
        }
        <rect x={BX} y={BY} width={BW} height={BH} rx="4"
          fill={isDehu?"#05120a":"#0a0a06"}
          stroke={isDehu?"#22c55e":(G+'.55)')} strokeWidth="1.4"/>
        <rect x={BX} y={BY} width={BW} height={7} rx="4"
          fill={isDehu?"rgba(34,197,94,.3)":(G+'.25)')} stroke="none"/>
        {isDehu
          ?<>
            <text x={BX+BW/2} y={BY+BH/2-1} textAnchor="middle" fill="#22c55e" fontSize="13.5">💧</text>
            <text x={BX+BW/2} y={BY+BH/2+12} textAnchor="middle" fill="#22c55e" fontSize="10.5" fontFamily="monospace">DEHU</text>
          </>
          :<>
            <path d={'M'+(BX+8)+' '+(BY+BH*0.44)+' L'+(BX+BW*0.52)+' '+(BY+BH*0.44)} fill="none" stroke={B+'.65)'} strokeWidth="1.6" markerEnd="url(#arr)"/>
            <path d={'M'+(BX+BW-8)+' '+(BY+BH*0.64)+' L'+(BX+BW*0.48)+' '+(BY+BH*0.64)} fill="none" stroke="rgba(249,115,22,.65)" strokeWidth="1.6" markerEnd="url(#arr)"/>
            <text x={BX+BW/2} y={BY+BH*0.3} textAnchor="middle" fill={G+'.78)'} fontSize="12.5" fontFamily="monospace">ERV</text>
          </>
        }
      </g>;
    })}</g>;
  }

  const Defs=()=><defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f0d64e"/><stop offset="100%" stopColor="#ab8024"/></linearGradient>
    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#1a6cb5"/><stop offset="100%" stopColor="#2389e0"/></linearGradient>
    <linearGradient id="red-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#b91c1c"/><stop offset="100%" stopColor="#ef4444"/></linearGradient>
    <linearGradient id="orange-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ea580c"/><stop offset="100%" stopColor="#f97316"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow-sm"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow-uv"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,.55)"/></filter>
    <marker id="arr" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M1 1L6 4L1 7" fill="none" stroke="context-stroke" strokeWidth="1.5"/>
    </marker>
  </defs>;

  // Not a real thermostat control - lets a homeowner see the diagram react
  // (refrigerant flow direction, which equipment lights up as active) without
  // waiting for actual weather. Callout label + title attr both explain that,
  // since a first-time visitor has no other reason to guess it's clickable.
  //
  // On a narrow frame this full stack (eyebrow + 2-3 full-height buttons,
  // ~150px tall) doesn't fit inside the SVG's own top letterbox gutter -
  // the closet layout in particular has very little of that gutter to
  // begin with (its diagram fills most of the frame), so the panel used to
  // sit directly on top of real equipment (the air handler, roofline/
  // "OUTSIDE" label) instead of the empty space above it, hiding them
  // entirely rather than just looking oversized. Below this width it swaps
  // for a single compact icon+temp pill row instead - same click targets/
  // state, just a small fraction of the vertical footprint. 900 is a frame-
  // width (not viewport-width) cutoff wide enough to cover phone and
  // portrait-tablet frames (measured overlap at 375/390/768) while leaving
  // real desktop widths (1440+, where the gutter is plenty tall) alone.
  const compactToggle=frameBox&&frameBox.w>0&&frameBox.w<900;
  const ToggleUI=({style})=>{
    if(compactToggle){
      const modes=isDualFuel?[
        {key:'cool',icon:'❄',temp:'96°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'hp',icon:'🔥',temp:'52°',active:heatMode&&heatSubMode==='hp',color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
        {key:'furnace',icon:'🔥',temp:'28°',active:heatMode&&heatSubMode==='furnace',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('furnace');}},
      ]:!hasFurnace?[
        {key:'cool',icon:'❄',temp:'96°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'hp',icon:'🔥',temp:'52°',active:heatMode&&heatSubMode==='hp',color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
        {key:'aux',icon:'🔥',temp:'28°',active:heatMode&&heatSubMode==='aux',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('aux');}},
      ]:[
        {key:'cool',icon:'❄',temp:'96°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'heat',icon:'🔥',temp:'28°',active:heatMode,color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>setHeatMode(true)},
      ];
      return <div title="Not a control - tap to see how this system behaves in each mode" style={{display:'flex',background:'#0c0c0c',border:'1px solid rgba(215,183,64,.22)',borderRadius:3,overflow:'hidden',...style}}>
        {modes.map((m,i)=>
          <button key={m.key} onClick={m.onClick} style={{
            padding:'5px 7px',border:'none',borderLeft:i>0?'1px solid rgba(215,183,64,.18)':'none',cursor:'pointer',
            fontFamily:'monospace',fontSize:'10px',fontWeight:700,letterSpacing:'.02em',
            background:m.active?m.bg:'transparent',color:m.active?m.color:'rgba(255,255,255,.55)',
            transition:'all .2s',display:'flex',alignItems:'center',gap:3,whiteSpace:'nowrap'}}>
            <span style={{fontSize:9}}>{m.icon}</span><span>{m.temp}</span>
          </button>
        )}
      </div>;
    }
    return (
    <div className="fadein" style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,...style}}>
      <span style={{fontFamily:'monospace',fontSize:'var(--fs-toggle-eyebrow)',letterSpacing:'.06em',color:'rgba(215,183,64,.6)'}}>
        ▸ preview how your system runs
      </span>
      <div title="Not a control - click to see how this system behaves in each mode" style={{display:'flex',flexDirection:'column',background:'#0c0c0c',border:'1px solid rgba(215,183,64,.22)',overflow:'hidden'}}>
      <button onClick={()=>setHeatMode(false)} style={{
        padding:'10px 18px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
        background:!heatMode?'rgba(35,137,224,.18)':'transparent',
        color:!heatMode?'#5ba8f5':'rgba(255,255,255,.58)',transition:'all .2s',
        display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
        <span>❄</span>
        <span>COOL MODE</span>
        <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:!heatMode?1:0.55}}>96°</span>
        <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:!heatMode?.75:0.5}}>OUTSIDE TEMP</span>
      </button>
      <div style={{height:'1px',background:'rgba(215,183,64,.22)'}}/>
      {isDualFuel
        ?<>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('hp');}} style={{
            padding:'10px 14px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='hp'?'rgba(35,137,224,.18)':'transparent',
            color:heatMode&&heatSubMode==='hp'?'#5ba8f5':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5,borderBottom:'1px solid rgba(215,183,64,.12)'}}>
            <span>🔥</span>
            <span>HEAT PUMP</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='hp'?1:0.55}}>52°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='hp'?.75:0.5}}>OUTSIDE TEMP</span>
          </button>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('furnace');}} style={{
            padding:'10px 14px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='furnace'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='furnace'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5}}>
            <span>🔥</span>
            <span>FURNACE</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='furnace'?1:0.55}}>28°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='furnace'?.75:0.5}}>OUTSIDE TEMP</span>
          </button>
        </>
        :!hasFurnace
        ?<>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('hp');}} style={{
            padding:'10px 14px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='hp'?'rgba(35,137,224,.18)':'transparent',
            color:heatMode&&heatSubMode==='hp'?'#5ba8f5':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5,borderBottom:'1px solid rgba(215,183,64,.12)'}}>
            <span>🔥</span>
            <span>HEAT PUMP</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='hp'?1:0.55}}>52°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='hp'?.75:0.5}}>OUTSIDE TEMP</span>
          </button>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('aux');}} style={{
            padding:'10px 14px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='aux'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='aux'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5}}>
            <span>🔥</span>
            <span>AUX HEAT</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='aux'?1:0.55}}>28°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='aux'?.75:0.5}}>OUTSIDE TEMP</span>
          </button>
        </>
        :<button onClick={()=>setHeatMode(true)} style={{
          padding:'10px 18px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
          background:heatMode?'rgba(249,115,22,.18)':'transparent',
          color:heatMode?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
          display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
          <span>🔥</span>
          <span>HEAT MODE</span>
          <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode?1:0.55}}>28°</span>
          <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode?.75:0.5}}>OUTSIDE TEMP</span>
        </button>}
      </div>
    </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  // ATTIC HORIZONTAL
  // Before condenser: system fills full canvas, large + centered.
  // After condenser: house = 2/3, outside wall + condenser = 1/3.
  // Condenser: true side-wall view, lineset exits wall at condenser bottom.
  // ══════════════════════════════════════════════════════════
  if(isAttic){
    // The living-space band below the deck line still has to fit the
    // thermostat (it sits in this band, to the right of the return duct)
    // plus the return grille - shrunk to 95 now that the thermostat
    // itself is a smaller footprint (down from 120 when it needed room
    // for the full-size version).
    const LIVING_SPACE=95;
    const ZOOM=hasCond?1:0.7;
    const BASE_VH=Math.round(510*ZOOM);
    const BASE_VW=Math.round(1280*ZOOM);
    const BASE_ASPECT=BASE_VW/BASE_VH;
    // Widening the frame used to only add empty canvas around the
    // same-size equipment - matching the viewBox to the frame's aspect
    // ratio kills the letterboxing gutters, but the on-screen scale of
    // everything is still governed by frameHeight/VH alone, which a wider
    // (not taller) window never changes. To make widening actually zoom
    // in a little, shrink VH itself as the frame's aspect grows past the
    // design's native ~2.2:1 - equipment stays the same fixed real-world
    // size, so it fills more of a smaller VH. The room this borrows from
    // is the generous headroom above the equipment in the attic band
    // (ATTIC_H is ~3x taller than the tallest unit needs) - DECK_Y stays
    // VH-LIVING_SPACE, so the living-space band keeps its full height.
    // Both the zoom and the width-matching are capped well short of a
    // full fill on a very wide screen now - taken further, the house
    // interior's fixed-size equipment ends up scattered across a mostly
    // empty middle instead of reading as a single grouped diagram. Past
    // the cap, xMidYMid below splits the leftover room evenly on both
    // sides instead of growing the gap between the equipment and the
    // outside wall any further - an off-center diagram reads as broken,
    // while a small even margin on each side doesn't.
    const frameAspect=frameBox&&frameBox.h>0?frameBox.w/frameBox.h:BASE_ASPECT;
    const ZOOM_T=Math.max(0,Math.min(1,(frameAspect-BASE_ASPECT)/(BASE_ASPECT*0.6)));
    const VH=Math.round(BASE_VH*(1-ZOOM_T*0.1));
    const FRAME_ASPECT_VW=frameBox&&frameBox.h>0?Math.round(VH*frameAspect):BASE_VW;
    const VW=Math.max(BASE_VW,Math.min(FRAME_ASPECT_VW,Math.round(BASE_VW*1.2)));
    // preserveAspectRatio="xMidYMid meet" below always scales by whichever
    // of width/height is the tighter fit - see EditZone's MIN_EDIT_PX comment.
    SVG_SCALE=frameBox&&frameBox.h>0?Math.min(frameBox.w/VW,frameBox.h/VH):1;
    SVG_VW=VW; SVG_VH=VH;

    // 2/3 house when condenser selected, full width otherwise
    const HOUSE_W=hasCond ? Math.round(VW*(2/3)) : VW-12;
    const OUTSIDE_W=hasCond ? VW-HOUSE_W : 0;

    // Shallow pitch
    const RIDGE_RISE=Math.round(Math.min(HOUSE_W/2*(3/12),68));
    const EAVE_Y=RIDGE_RISE+14;
    const RIDGE_Y=12;
    const RIDGE_X=HOUSE_W/2;

    const DECK_Y=VH-LIVING_SPACE;
    const ATTIC_H=DECK_Y-EAVE_Y;

    const SCALE_PX=6.2;
    const SCALE=hasCond?1:1.18;
    const UNIT_H=Math.round(15*SCALE_PX*1.13); // ~105px -- 15" unit at 6.2px/inch x1.13
    const UNIT_Y=EAVE_Y+Math.round((ATTIC_H-UNIT_H)/2)+4;

    const RET_PLEN_W=108;
    const APR_W=hasAprilaire?32:0;
    const FURN_W=hasFurnace?Math.round(196*SCALE):0;
    const ACOIL_W=hasFurnace?Math.round(108*SCALE):0;
    const AH_W=!hasFurnace?Math.round(296*SCALE):0;
    let SUP_PLEN_W=hasPlenum&&a.plenum!=='none'?240:a.plenum==='none'?130:0;
    const SUP_PLEN_H=UNIT_H;

    // Center the equipment run in the house zone - used to pin it to a
    // fixed 30px margin whenever a condenser was selected, leaving all the
    // leftover width as one gap between the plenum and the outside wall.
    // Centering (same formula already used with no condenser) splits that
    // gap evenly on both sides instead.
    const totalW=RET_PLEN_W+(APR_W?APR_W+2:0)+FURN_W+(hasFurnace?ACOIL_W+4:AH_W)+SUP_PLEN_W;
    const MARGIN_L=Math.max(20,Math.round((HOUSE_W-totalW)/2));
    const RET_X=MARGIN_L;
    // Return plenum stays directly against the filter rack/furnace - the
    // thermostat lives in the living-space band below instead, so it never
    // gets inserted into this chain and pushes this adjacency apart.
    const APR_X=RET_X+RET_PLEN_W+(APR_W?2:0);
    const UNIT_X=APR_X+APR_W+(APR_W?2:0);
    const FURN_X=UNIT_X;
    const ACOIL_X=FURN_X+FURN_W+(hasFurnace?4:0);
    const AH_X=UNIT_X;
    const unitRightEdge=hasFurnace?ACOIL_X+ACOIL_W:AH_X+AH_W;
    const SUP_X=unitRightEdge+4;
    // Plenum stays this fixed real-world size (~6ft run) regardless of how
    // wide the canvas gets - it used to stretch to close the gap to the
    // outside wall, but that meant widening the screen widened the plenum
    // itself. A wider canvas now just means more open attic space between
    // the plenum and the wall, same as more open yard on the condenser's side.
    const SUP_PLEN_Y=UNIT_Y;

    // Lineset riser lands on the A-coil's own header/base, not its peak -
    // the peak is the internal distributor, real lineset never taps into
    // that (same reasoning already applied to ACoilV's connector stubs).
    // For a furnace pairing the coil is drawn peak-right so its base is
    // the box's own LEFT edge; for a standalone air handler, ACoilH is
    // embedded in the LEFT 50% of the cabinet (the return-air side, per
    // the aux-heat-kit restructure - see AirHandlerH) with its own base at
    // x+9 there too. Landing near the peak instead (the old AH_W*0.5-15)
    // put the riser directly under the "AIR HANDLER" title/status text
    // centered above the unit, visually cutting through it as the pipe
    // rose past that label on its way to the roofline - the base sits far
    // enough left of that centered label to clear it entirely.
    const RL_START_X=hasFurnace?(ACOIL_X+8):(AH_X+9);
    const RL_ROOF_Y=EAVE_Y+14;

    // Real-world condenser sizes, fixed regardless of canvas width - these
    // used to be rescaled to fill 62% of the outside zone, which meant
    // widening the screen widened the condenser itself. Now a wider
    // canvas just shows more open yard around the same-sized unit. Uses
    // the same px/inch as the furnace/coil (SCALE_PX) so the condenser
    // reads at the same real-world scale as the rest of the equipment -
    // 3.2 made it noticeably smaller than everything else.
    const PX_C=SCALE_PX;
    const COND_SIZES={
      fedmin:   {w:Math.round(30*PX_C), h:Math.round(28*PX_C)},
      mid_ge15: {w:Math.round(36*PX_C), h:Math.round(22*PX_C)},
      high_ge18:{w:Math.round(40*PX_C), h:Math.round(40*PX_C)},
    };
    const CS=COND_SIZES[a.cond_tier]||COND_SIZES.fedmin;
    const COND_W=CS.w;
    const COND_H=CS.h;
    const EXT_WALL_X=HOUSE_W;
    const WALL_THICK=18;
    const DISC_ZONE=52;  // space for disconnect on wall face
    const COND_X=EXT_WALL_X+WALL_THICK+DISC_ZONE+8;
    // Condenser sits at ground level in the outside zone
    // OutsideZone groundY = VH-28 = 467. padY = 457. condY = 457-COND_H.
    const COND_Y=VH-28-10-COND_H;

    return(
      <div ref={wrapRef} style={{position:'absolute',inset:0}}>
        {hasCoil&&<ToggleUI style={{position:'absolute',top:8,right:8,zIndex:10}}/>}
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="canvas-svg" aria-hidden="true">
          <Defs/>

          {/* Full canvas background */}
          <rect x="0" y="0" width={VW} height={VH} fill="#0b0d14"/>

          {/* Outside zone (right of wall) - brightest on a sunny (cool
               mode) day, dimmer for the overcast 52° heat-pump day, darkest
               for the 28° cold snap - reads as daylight outside instead of
               a fixed dark panel regardless of weather. Fades like the
               sun/cloud/snow rendered inside OutsideZone itself. See
               OUTSIDE_* constants above for the palette reasoning. */}
          {hasCond&&<rect x={EXT_WALL_X} y="0" width={OUTSIDE_W} height={VH}
            style={{fill:outsideFill,transition:'fill .8s ease'}}/>}

          {/* Sky above the roofline, house side - the real sky doesn't stop
              at the house wall and pick back up over the condenser pad;
              it's one continuous backdrop above both. Without this, the
              area above the roof on the house side just showed the flat
              base canvas color instead of matching the outside zone next
              to it, reading as a "wall" running the full height of the
              canvas instead of stopping at the actual building envelope
              (the roof/eave line, below which the attic interior tint
              below takes over). Widened 2px past HOUSE_W so it overlaps
              into the outside-zone rect below instead of exactly abutting
              it - two adjacent same-fill SVG rects that only share an
              edge (no overlap) can still show a faint seam where their
              anti-aliased edges meet, which read as a thin "parapet" line
              splitting the two zones even though both sides use the
              identical outsideFill color. */}
          {hasCond&&<rect x="0" y="0" width={HOUSE_W+2} height={EAVE_Y}
            style={{fill:outsideFill,transition:'fill .8s ease'}}/>}

          {/* Attic interior (above deck, inside house) - subtly tinted by
              the same mode metaphor as the outside zone, see intFill above. */}
          <rect x="0" y={EAVE_Y} width={HOUSE_W} height={DECK_Y-EAVE_Y}
            style={{fill:intFill('attic'),transition:'fill .8s ease'}}/>

          {/* Living space below deck */}
          <rect x="0" y={DECK_Y} width={HOUSE_W} height={VH-DECK_Y}
            style={{fill:intFill('living'),transition:'fill .8s ease'}}/>

          {/* ── LOW-PITCH ROOF - shallow, full house width ── */}
          {/* Left slope: eave (left edge) → ridge */}
          <line x1="0" y1={EAVE_Y} x2={RIDGE_X} y2={RIDGE_Y}
            stroke="rgba(160,152,128,.55)" strokeWidth="3"/>
          {/* Right slope: ridge → eave (right edge of house) */}
          <line x1={RIDGE_X} y1={RIDGE_Y} x2={HOUSE_W} y2={EAVE_Y}
            stroke="rgba(160,152,128,.55)" strokeWidth="3"/>
          {/* Ridge cap */}
          <rect x={RIDGE_X-5} y={RIDGE_Y-2} width="10" height="7" rx="2" fill="rgba(160,155,135,.18)"/>
          {/* Roof deck fill (very subtle) */}
          <polygon points={`0,${EAVE_Y} ${RIDGE_X},${RIDGE_Y} ${HOUSE_W},${EAVE_Y}`}
            fill="rgba(10,10,16,.6)" stroke="none"/>

          {/* ── INSULATION - only shown after selection ── */}
          {a.insulation&&(isSpray
            ?<g>
              {Array.from({length:20},(_,i)=>{
                const t=i/19, sx=t*RIDGE_X, sy=EAVE_Y-(EAVE_Y-RIDGE_Y)*t;
                const ang=-Math.atan2(EAVE_Y-RIDGE_Y,RIDGE_X)*180/Math.PI;
                return <ellipse key={'ls'+i} cx={sx+8} cy={sy+8} rx={16} ry={8}
                  fill="rgba(234,238,246,.16)" stroke="rgba(234,238,246,.22)" strokeWidth=".5"
                  transform={`rotate(${ang},${sx+8},${sy+8})`}/>;
              })}
              {Array.from({length:20},(_,i)=>{
                const t=i/19, sx=RIDGE_X+t*(HOUSE_W-RIDGE_X), sy=RIDGE_Y+(EAVE_Y-RIDGE_Y)*t;
                const ang=Math.atan2(EAVE_Y-RIDGE_Y,HOUSE_W-RIDGE_X)*180/Math.PI;
                return <ellipse key={'rs'+i} cx={sx} cy={sy+7} rx={16} ry={8}
                  fill="rgba(234,238,246,.16)" stroke="rgba(234,238,246,.22)" strokeWidth=".5"
                  transform={`rotate(${ang},${sx},${sy+7})`}/>;
              })}
              <text x={RIDGE_X} y={RIDGE_Y+24} textAnchor="middle" fill="rgba(232,236,246,.5)" fontSize="10" fontFamily="monospace">SPRAY FOAM - SEALED ATTIC</text>
            </g>
            :<g>
              <rect x="0" y={DECK_Y-22} width={HOUSE_W} height={24} fill="rgba(255,130,170,.18)" stroke="rgba(255,140,180,.08)" strokeWidth="0.5"/>
              {Array.from({length:Math.floor(HOUSE_W/17)},(_,i)=>(
                <ellipse key={i} cx={8+i*17} cy={DECK_Y-7} rx={11} ry={8}
                  fill="rgba(255,182,193,.17)" stroke="rgba(255,182,193,.2)" strokeWidth=".45"/>
              ))}
              <text x={RIDGE_X} y={RIDGE_Y+24} textAnchor="middle" fill="rgba(255,182,193,.55)" fontSize="10" fontFamily="monospace">FIBERGLASS INSULATION</text>
            </g>
          )}

          {/* Attic deck - full house width */}
          <rect x="0" y={DECK_Y} width={HOUSE_W} height="5" fill="#1c1e28" stroke="rgba(200,196,172,.22)" strokeWidth="0.4"/>
          {Array.from({length:Math.floor(HOUSE_W/68)},(_,i)=>(
            <rect key={i} x={38+i*68} y={DECK_Y-2} width="10" height="7" rx="1"
              fill="rgba(90,68,32,.2)" stroke="rgba(108,82,36,.12)" strokeWidth="0.4"/>
          ))}
          {/* Interior rafters */}
          {[HOUSE_W*0.1,HOUSE_W*0.22,HOUSE_W*0.36].map((rx,i)=>(
            <line key={'lr'+i} x1={rx} y1={DECK_Y} x2={RIDGE_X} y2={RIDGE_Y}
              stroke="rgba(88,68,32,.09)" strokeWidth="1.5"/>
          ))}
          {[HOUSE_W*0.64,HOUSE_W*0.78,HOUSE_W*0.9].map((rx,i)=>(
            <line key={'rr'+i} x1={rx} y1={DECK_Y} x2={RIDGE_X} y2={RIDGE_Y}
              stroke="rgba(88,68,32,.09)" strokeWidth="1.5"/>
          ))}
          <text x="22" y={DECK_Y+18} fill={W+'.09)'} fontSize="10" fontFamily="monospace" letterSpacing="0.8">LIVING SPACE</text>

          {/* Return grille - duct trunk connects it down to the return plenum
              above instead of floating on its own ── */}
          {hasCoil&&<g>
            <rect x={RET_X+RET_PLEN_W/2-27} y={UNIT_Y+UNIT_H} width={54} height={Math.max(0,DECK_Y-(UNIT_Y+UNIT_H))}
              fill="rgba(255,182,193,.18)" stroke="rgba(255,182,193,.5)" strokeWidth="1.6"/>
            <rect x={RET_X+2} y={DECK_Y-1} width={RET_PLEN_W-4} height={11} rx="1"
              fill="rgba(0,0,0,.65)" stroke="rgba(255,182,193,.45)" strokeWidth="1.2"/>
            {Array.from({length:7},(_,i)=>(
              <line key={i} x1={RET_X+8+i*((RET_PLEN_W-16)/7)} y1={DECK_Y}
                x2={RET_X+8+i*((RET_PLEN_W-16)/7)} y2={DECK_Y+9}
                stroke="rgba(255,182,193,.4)" strokeWidth="0.9"/>
            ))}
            <text x={RET_X+RET_PLEN_W/2} y={DECK_Y+21} textAnchor="middle"
              fill="rgba(255,182,193,.6)" fontSize="10" fontFamily="monospace">RETURN</text>
          </g>}

          {/* Return plenum */}
          {hasCoil&&<g className="snap" key="retplen">
            <rect x={RET_X} y={UNIT_Y} width={RET_PLEN_W} height={UNIT_H} rx="4"
              fill="rgba(255,182,193,.06)" stroke="rgba(255,182,193,.42)" strokeWidth="1.5"/>
            {Array.from({length:20},(_,i)=>{
              const bx=RET_X+4+((i*13)%(RET_PLEN_W-12));
              const by=UNIT_Y+6+i*(UNIT_H-12)/20;
              return <ellipse key={i} cx={bx} cy={by} rx={6+(i%4)*2.5} ry={5+(i%3)*1.5} fill="rgba(255,182,193,.1)"/>;
            })}
            <text x={RET_X+RET_PLEN_W/2} y={UNIT_Y+UNIT_H/2+3} textAnchor="middle"
              fill="rgba(255,182,193,.52)" fontSize="11.5" fontFamily="monospace"
              transform={`rotate(-45,${RET_X+RET_PLEN_W/2},${UNIT_Y+UNIT_H/2})`}>RETURN PLENUM</text>
            {Array.from({length:8},(_,i)=>(
              <line key={i} x1={RET_X+2} y1={UNIT_Y+12+i*(UNIT_H-24)/8}
                x2={RET_X+2} y2={UNIT_Y+18+i*(UNIT_H-24)/8}
                stroke="rgba(255,182,193,.32)" strokeWidth="2.8" strokeLinecap="round"/>
            ))}
            <path d={`M${RET_X+RET_PLEN_W+2} ${UNIT_Y+UNIT_H/2} L${APR_X+APR_W+2} ${UNIT_Y+UNIT_H/2}`}
              fill="none" stroke={W+'.07)'} strokeWidth="1.1"
              strokeDasharray="5 3" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
          </g>}

          {/* Aprilaire */}
          {hasCoil&&hasAprilaire&&<g className="fadein" key="apr">
            <rect x={APR_X} y={UNIT_Y} width={APR_W} height={UNIT_H} rx="2"
              fill="rgba(34,197,94,.09)" stroke="#22c55e" strokeWidth="1.5"/>
            {Array.from({length:16},(_,i)=>(
              <line key={i} x1={APR_X+2} y1={UNIT_Y+8+i*(UNIT_H-16)/16}
                x2={APR_X+APR_W-2} y2={UNIT_Y+8+i*(UNIT_H-16)/16}
                stroke="#22c55e" strokeWidth="0.55" opacity="0.52"/>
            ))}
            <text x={APR_X+APR_W/2} y={UNIT_Y+UNIT_H/2+3} textAnchor="middle"
              fill="#22c55e" fontSize="11" fontFamily="monospace"
              transform={`rotate(-90,${APR_X+APR_W/2},${UNIT_Y+UNIT_H/2})`}>FILTRATION</text>
          </g>}

          {/* Furnace */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'fu'+a.stage+a.furnace_eff} filter="url(#shadow)">
            {(()=>{
              // Roof surface height at the flue's actual X (mid+w*0.2 inside
              // FurnaceH) - EAVE_Y alone only holds at the eave itself, and
              // the flue usually sits well in toward the ridge, where the
              // sloped roof is much higher up (smaller y) than that.
              const flueX=FURN_X+FURN_W*0.7;
              const flueRoofY=(flueX<=RIDGE_X
                ?EAVE_Y-(flueX/RIDGE_X)*(EAVE_Y-RIDGE_Y)
                :RIDGE_Y+((flueX-RIDGE_X)/(HOUSE_W-RIDGE_X))*(EAVE_Y-RIDGE_Y))+14;
              return <FurnaceH x={FURN_X} y={UNIT_Y} w={FURN_W} h={UNIT_H} active={furnaceActive} roofY={flueRoofY}/>;
            })()}
            <text x={FURN_X+FURN_W/2} y={UNIT_Y+UNIT_H+13} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.78)':(G+'.55)')} fontSize="11.5" fontFamily="monospace">FURNACE</text>
            <text x={FURN_X+FURN_W/2} y={UNIT_Y+UNIT_H+24} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.44)':'rgba(255,255,255,.15)'} fontSize="10" fontFamily="monospace">
              {furnaceActive?"GAS HEATING ACTIVE":"STANDBY"}
            </text>
          </g>}

          {/* A-coil (horizontal, right of furnace) */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'ac'+a.cond_tier} style={{animationDelay:'.08s'}} filter="url(#shadow)">
            {(()=>{
              const active=evapActive;
              return <>
                <rect x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={UNIT_H} rx="4"
                  fill={active?"#050c1c":"#090909"}
                  stroke={active?(evapC+'88'):(G+'.42)')} strokeWidth={active?1.8:1.5}/>
                {active&&<rect x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={UNIT_H} rx="4"
                  fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none"/>}
                <rect x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={9} rx="4"
                  fill={active?(refReversed?"url(#orange-g)":"url(#blue)"):"url(#gold)"} opacity=".65"/>
                <ACoilH x={ACOIL_X+8} y={UNIT_Y+12} w={ACOIL_W-16} h={UNIT_H-20} active={active}/>
                <rect x={ACOIL_X} y={UNIT_Y+UNIT_H-2} width={ACOIL_W} height={6} rx="1" fill="#08121e" stroke={B+'.18)'} strokeWidth="0.6"/>
                {/* Label moved above the coil - the space below is now clear
                    for the supply ducts to drop straight down with nothing
                    in their way */}
                <text x={ACOIL_X+ACOIL_W/2} y={UNIT_Y-16} textAnchor="middle"
                  fill={active?evapC:(G+'.55)')} fontSize="11.5" fontFamily="monospace">A-COIL</text>
                <text x={ACOIL_X+ACOIL_W/2} y={UNIT_Y-5} textAnchor="middle"
                  fill={active?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):'rgba(255,255,255,.14)'} fontSize="10" fontFamily="monospace">
                  {active?(refReversed?"REJECTING HEAT":"ABSORBING HEAT"):"STANDBY"}
                </text>
              </>;
            })()}
          </g>}

          {/* Air handler */}
          {hasCoil&&!hasFurnace&&<g className="snap" key={'ah'+a.cond_tier} filter="url(#shadow)">
            <AirHandlerH x={AH_X} y={UNIT_Y} w={AH_W} h={UNIT_H} active={evapActive} auxHeat={auxHeatActive}/>
            {/* Label above the unit, same as A-COIL - keeps the space below
                clear for the condensate drain/pump instead of crowding it */}
            <text x={AH_X+AH_W/2} y={UNIT_Y-16} textAnchor="middle"
              fill={evapActive?evapC:(G+'.55)')} fontSize="11.5" fontFamily="monospace">AIR HANDLER</text>
            <text x={AH_X+AH_W/2} y={UNIT_Y-5} textAnchor="middle"
              fill={evapActive?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):(auxHeatActive?'rgba(249,115,22,.65)':'rgba(255,255,255,.14)')} fontSize="10" fontFamily="monospace">
              {evapActive?(refReversed?"REJECTING HEAT":"ABSORBING HEAT"):(auxHeatActive?"AUX HEAT ONLY":"STANDBY")}
            </text>
          </g>}
          {hasCoil&&<EditZone stepId="indoor_type"
            x={(hasFurnace?FURN_X:AH_X)-4} y={UNIT_Y-2} rx={6}
            w={(hasFurnace?ACOIL_X+ACOIL_W-FURN_X:AH_W)+8} h={UNIT_H+4}/>}

          {/* Supply plenum - right of A-coil/AH, same height */}
          {hasPlenum&&hasCoil&&<g className="snap" key="spl" style={{animationDelay:'.12s'}}>
            {(()=>{
              const isExisting=a.plenum==='none';
              const isMetal=a.plenum==='metal';
              const pFill=isExisting?"rgba(40,40,55,.6)":isMetal?"#1a1c24":"#141108";
              const pStroke=isExisting?(G+'.22)'):(G+(isMetal?'.74)':'.5)'));
              const pSW=isExisting?1:isMetal?1.7:1.4;
              return <>
                <rect x={SUP_X} y={SUP_PLEN_Y} width={SUP_PLEN_W} height={SUP_PLEN_H} rx="3"
                  fill={pFill} stroke={pStroke} strokeWidth={pSW}
                  strokeDasharray={isExisting?"6 3":undefined} opacity={isExisting?0.65:1}/>
                {!isExisting&&(isMetal
                  ?Array.from({length:Math.floor(SUP_PLEN_H/8)},(_,i)=>(
                    <line key={i} x1={SUP_X+2} y1={SUP_PLEN_Y+4+i*8} x2={SUP_X+SUP_PLEN_W-2} y2={SUP_PLEN_Y+4+i*8}
                      stroke={W+'.04)'} strokeWidth="0.3"/>
                  ))
                  :Array.from({length:Math.floor(SUP_PLEN_H/10)},(_,i)=>(
                    <line key={i} x1={SUP_X+3} y1={SUP_PLEN_Y+5+i*10} x2={SUP_X+SUP_PLEN_W-3} y2={SUP_PLEN_Y+5+i*10}
                      stroke={G+'.07)'} strokeWidth="0.6"/>
                  ))
                )}
                <text x={SUP_X+SUP_PLEN_W/2} y={SUP_PLEN_Y+SUP_PLEN_H/2+3} textAnchor="middle"
                  fill={isExisting?(G+'.55)'):(G+'.52)')} fontSize="11.5" fontFamily="monospace">
                  {isExisting?'EXISTING PLENUM':isMetal?'METAL PLENUM':'DUCTBOARD PLENUM'}
                </text>
                {!isExisting&&<text x={SUP_X+SUP_PLEN_W/2} y={SUP_PLEN_Y+SUP_PLEN_H/2+16} textAnchor="middle"
                  fill={G+'.32)'} fontSize="10" fontFamily="monospace">4–6 FT SUPPLY</text>}
                {[SUP_PLEN_Y+Math.round(SUP_PLEN_H*0.28), SUP_PLEN_Y+Math.round(SUP_PLEN_H*0.72)].map((ay,i)=>(
                  <g key={"af"+i}>
                    <line x1={SUP_X+8} y1={ay} x2={SUP_X+SUP_PLEN_W-8} y2={ay}
                      fill="none" stroke={(heatMode?O:B)+'.3)'} strokeWidth="7" strokeLinecap="round" opacity="0.4"/>
                    <line x1={SUP_X+8} y1={ay} x2={SUP_X+SUP_PLEN_W-8} y2={ay}
                      fill="none" stroke={(heatMode?O:B)+'.8)'} strokeWidth="1.4"
                      strokeDasharray="8 5" className="airflow" style={{strokeDashoffset:0}}
                      markerEnd="url(#arr)"/>
                  </g>
                ))}
                {/* Ionizer -- enters from top of plenum, clear of the supply
                    ducts now dropping out the bottom */}
                {hasIonizer&&(()=>{
                  const ionX=SUP_X+Math.round(SUP_PLEN_W*0.18); // ~1/5 of plenum, left
                  const plenTop=SUP_PLEN_Y;
                  const ionBulbY=plenTop-14;
                  const ionRodLen=Math.round(SUP_PLEN_H*0.55);
                  return <g className="fadein">
                    <circle cx={ionX} cy={ionBulbY} r={12} fill="rgba(253,224,71,.07)" stroke="rgba(253,224,71,.18)" strokeWidth="0.5" filter="url(#glow-uv)"/>
                    <ellipse cx={ionX} cy={ionBulbY} rx={8} ry={10} fill="rgba(251,191,36,.18)" stroke="rgba(253,224,71,.75)" strokeWidth="1.4"/>
                    <ellipse cx={ionX} cy={ionBulbY} rx={5} ry={6.5} fill="rgba(253,224,71,.32)" stroke="none" className="glow-pulse"/>
                    <line x1={ionX-2} y1={ionBulbY-4} x2={ionX+2} y2={ionBulbY+4} stroke="rgba(253,224,71,.9)" strokeWidth="1.2" strokeLinecap="round"/>
                    <line x1={ionX+2} y1={ionBulbY-4} x2={ionX-2} y2={ionBulbY+4} stroke="rgba(253,224,71,.9)" strokeWidth="1.2" strokeLinecap="round"/>
                    {/* Entry collar at plenum top */}
                    <rect x={ionX-6} y={plenTop-6} width={12} height={8} rx="2" fill="rgba(180,130,20,.45)" stroke="rgba(253,224,71,.5)" strokeWidth="0.8"/>
                    {/* Rod goes DOWN into plenum */}
                    <line x1={ionX} y1={plenTop} x2={ionX} y2={plenTop+ionRodLen} stroke="rgba(253,224,71,.22)" strokeWidth={6} strokeLinecap="round" filter="url(#glow-uv)"/>
                    <line x1={ionX} y1={plenTop} x2={ionX} y2={plenTop+ionRodLen} stroke="rgba(253,224,71,.8)" strokeWidth={2} strokeLinecap="round"/>
                    <circle cx={ionX} cy={plenTop+ionRodLen} r={2.5} fill="rgba(253,224,71,.9)" className="glow-pulse"/>
                    <text x={ionX+14} y={ionBulbY+4} textAnchor="start" fill="rgba(253,224,71,.45)" fontSize="9.5" fontFamily="monospace">IONIZER</text>
                  </g>;
                })()}
              </>;
            })()}
          </g>}
          {hasPlenum&&hasCoil&&<EditZone stepId="plenum"
            x={SUP_X-2} y={SUP_PLEN_Y-2} w={SUP_PLEN_W+4} h={SUP_PLEN_H+4} rx={5}/>}

          {/* ── DUCTWORK - 3 supply stems off the plenum bottom, down through
               the attic floor into a drywall ceiling grille below - same
               idea as the upflow closet layout's supply ducts. The middle
               stem drops straight down; the outer two kick out with a 45°
               elbow first so all three grilles aren't bunched together. ── */}
          {hasPlenum&&hasCoil&&<g className="fadein" key="ducts" style={{animationDelay:'.18s'}}>
            {(()=>{
              const DW=14;
              const DC=G+'.32)';
              const DS=G+'.18)';
              const GW=DW+10;
              const pBot=SUP_PLEN_Y+SUP_PLEN_H;
              const FAN=36;
              const grille=cx=>(
                <>
                  <rect x={cx-GW/2} y={DECK_Y} width={GW} height={9} rx="1" fill="rgba(0,0,0,.75)" stroke={DC} strokeWidth="1.2"/>
                  {Array.from({length:5},(_,j)=>(
                    <line key={j} x1={cx-GW/2+3+j*(GW-6)/4} y1={DECK_Y+1}
                      x2={cx-GW/2+3+j*(GW-6)/4} y2={DECK_Y+8} stroke={DC} strokeWidth="0.8"/>
                  ))}
                  <text x={cx} y={DECK_Y+18} textAnchor="middle" fill={G+'.35)'} fontSize="9.5" fontFamily="monospace">SUPPLY</text>
                </>
              );
              const straight=(cx,key)=>(
                <g key={key}>
                  <rect x={cx-DW/2} y={pBot} width={DW} height={Math.max(0,DECK_Y-pBot)} fill={DC} stroke={DS} strokeWidth="1"/>
                  {grille(cx)}
                </g>
              );
              const angled=(topX,dir,key)=>{
                const bendY=Math.min(pBot+FAN,DECK_Y-6);
                const botX=topX+dir*(bendY-pBot);
                const d=`M${topX},${pBot} L${botX},${bendY} L${botX},${DECK_Y}`;
                return (
                  <g key={key}>
                    <path d={d} fill="none" stroke={DS} strokeWidth={DW+2} strokeLinejoin="round" strokeLinecap="square"/>
                    <path d={d} fill="none" stroke={DC} strokeWidth={DW} strokeLinejoin="round" strokeLinecap="square"/>
                    {grille(botX)}
                  </g>
                );
              };
              const leftX=SUP_X+SUP_PLEN_W*0.25, midX=SUP_X+SUP_PLEN_W*0.5, rightX=SUP_X+SUP_PLEN_W*0.75;
              return <>
                {angled(leftX,-1,'l')}
                {straight(midX,'m')}
                {angled(rightX,1,'r')}
              </>;
            })()}
          </g>}

          {/* ── REFRIGERANT LINES - up to roofline, across to wall ── */}
          {hasCoil&&hasCond&&<g key="rl">
            {(()=>{
              const active=evapActive;
              const ry1=UNIT_Y+UNIT_H*0.35, ry2=UNIT_Y+UNIT_H*0.55;
              const wallX=EXT_WALL_X-14;
              return <>
                {/* Foam sleeve */}
                <path d={`M${RL_START_X} ${ry1} L${RL_START_X} ${RL_ROOF_Y} L${wallX} ${RL_ROOF_Y}`}
                  fill="none" stroke="rgba(20,20,36,.75)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                <path d={`M${RL_START_X+5} ${ry2} L${RL_START_X+5} ${RL_ROOF_Y+9} L${wallX} ${RL_ROOF_Y+9}`}
                  fill="none" stroke="rgba(20,20,36,.6)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Line 1 -- always bold red/blue */}
                <path d={`M${RL_START_X} ${ry1} L${RL_START_X} ${RL_ROOF_Y} L${wallX} ${RL_ROOF_Y}`}
                  fill="none" stroke={line1C} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="line-pulse"/>
                {/* Line 2 -- always bold, opposite color */}
                <path d={`M${RL_START_X+5} ${ry2} L${RL_START_X+5} ${RL_ROOF_Y+9} L${wallX} ${RL_ROOF_Y+9}`}
                  fill="none" stroke={line2C} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="line-pulse" style={{animationDelay:'.15s'}}/>
                {/* Flow dots -- both pipes */}
                {active&&Array.from({length:6},(_,i)=>{
                  const isLine1=i<3;
                  const pColor=isLine1?line1C:line2C;
                  const sx=RL_START_X+(isLine1?0:5);
                  const sy=isLine1?ry1:ry2;
                  const rY=isLine1?RL_ROOF_Y:RL_ROOF_Y+9;
                  const toWall=isLine1?!refReversed:refReversed;
                  const p=toWall
                    ?`M${sx} ${sy} L${sx} ${rY} L${wallX} ${rY}`
                    :`M${wallX} ${rY} L${sx} ${rY} L${sx} ${sy}`;
                  return <circle key={i} r="3" fill={pColor} opacity="0.82" filter="url(#glow-sm)">
                    <animateMotion dur={(2.2+(i%3)*0.5)+'s'} repeatCount="indefinite" begin={(i*0.7)+'s'} path={p}/>
                  </circle>;
                })}
              </>;
            })()}
          </g>}

          {/* ── OUTSIDE ZONE - exterior wall + condenser ── */}
          {hasCond&&<OutsideZone
            wallX={EXT_WALL_X} zoneW={OUTSIDE_W} zoneH={VH}
            condX={COND_X} condY={COND_Y} condW={COND_W} condH={COND_H}
            lineY1={RL_ROOF_Y} lineY2={RL_ROOF_Y+9}
            active={condenserActive} tierKey={a.cond_tier} eaveY={EAVE_Y}
            heatMode={heatMode} isMildHp={isMildHp}
            refReversed={refReversed} isSurge={isSurge} condC={condC}
            line1C={line1C} line2C={line2C} G={G} W={W}
            condenserEl={<Condenser x={COND_X} y={COND_Y} w={COND_W} h={COND_H}
              active={condenserActive} tierKey={a.cond_tier}/>}/>}
          {hasCond&&<EditZone stepId="cond_tier"
            x={COND_X-2} y={COND_Y-2} w={COND_W+4} h={COND_H+4} rx={5}/>}

          {/* ── THERMOSTAT - down in the living space below the deck line
               (like a real wall thermostat would be), positioned under the
               return duct rather than centered under the furnace/coil -
               keeps it clear of the supply vents' drops without needing
               any extra width inserted into the return/filter/furnace run
               above, which has to stay contiguous. ── */}
          {hasTstat&&<g className="snap" key="tstat" style={{animationDelay:'.26s'}}>
            {(()=>{
              // Scaled down (~65%) from the original footprint - smaller
              // than a real thermostat would read, but it only lives here
              // to keep the living-space band (and the fixed VH it comes
              // out of) from needing extra height for it.
              const TX=RET_X+RET_PLEN_W+8, TY=DECK_Y+12;
              const isProprietary=a.thermostat==='proprietary';
              const isWifi=a.thermostat==='wifi'&&!isProprietary;
              const modeColor=heatMode?"#f97316":"#2389e0";
              return isProprietary
                // PROPRIETARY COMMUNICATING -- edge-to-edge glass touchscreen
                // (Ecobee-style rectangle), deliberately not the round dial
                // used for the Wi-Fi tier below, so it reads as a distinct,
                // more premium control rather than the same thermostat with
                // a different label.
                ?<>
                  <rect x={TX} y={TY} width={64} height={58} rx="9"
                    fill="#0a0a0d" stroke={G+'.6)'} strokeWidth="1.4"/>
                  <rect x={TX+2.5} y={TY+2.5} width={59} height={45} rx="6.5"
                    fill="#050810" stroke={B+'.3)'} strokeWidth="0.7"/>
                  <text x={TX+32} y={TY+30} textAnchor="middle" fill={B+'.95)'} fontSize="19"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <text x={TX+32} y={TY+41} textAnchor="middle" fill={B+'.55)'} fontSize="6.5"
                    fontFamily="monospace">{heatMode?'HEAT':'COOL'} · AUTO</text>
                  <circle cx={TX+56} cy={TY+9} r={1.6} fill={B+'.55)'}/>
                  <rect x={TX+5} y={TY+50} width={54} height="3" rx="1.5" fill={modeColor} opacity="0.8"/>
                  <text x={TX+32} y={TY+70} textAnchor="middle" fill={G+'.5)'} fontSize="9" fontFamily="monospace">COMMUNICATING</text>
                </>
                :isWifi
                ?<>
                  <circle cx={TX+32} cy={TY+30} r={28} fill="#0d0d0d" stroke={G+'.65)'} strokeWidth="1.6"/>
                  <circle cx={TX+32} cy={TY+30} r={22} fill="#060e1c" stroke={B+'.45)'} strokeWidth="1"/>
                  <text x={TX+32} y={TY+35} textAnchor="middle" fill={B+'.95)'} fontSize="16.5"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <path d={`M${TX+11} ${TY+30} A21 21 0 0 1 ${TX+53} ${TY+30}`}
                    fill="none" stroke={modeColor} strokeWidth="2.2" strokeLinecap="round" opacity="0.55"/>
                  <path d={`M${TX+21} ${TY+48} Q${TX+32} ${TY+41} ${TX+43} ${TY+48}`}
                    fill="none" stroke={B+'.5)'} strokeWidth="1.5" strokeLinecap="round"/>
                  <path d={`M${TX+24} ${TY+52} Q${TX+32} ${TY+47} ${TX+40} ${TY+52}`}
                    fill="none" stroke={B+'.7)'} strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx={TX+32} cy={TY+56} r={2.2} fill={B+'.8)'}/>
                  <text x={TX+32} y={TY+68} textAnchor="middle" fill={G+'.5)'} fontSize="9" fontFamily="monospace">WI-FI SMART</text>
                </>
                :<>
                  <rect x={TX} y={TY} width={64} height={54} rx="3"
                    fill="#0d0d0d" stroke={G+'.58)'} strokeWidth="1.4"/>
                  <rect x={TX+4} y={TY+5} width={56} height={28} rx="2"
                    fill="#050d18" stroke={B+'.38)'} strokeWidth="0.8"/>
                  <text x={TX+32} y={TY+24} textAnchor="middle" fill={B+'.92)'} fontSize="18.5"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  {[7,18,29,40,51].map((bx,i)=>(
                    <rect key={i} x={TX+bx} y={TY+38} width="7" height="4" rx="1"
                      fill={G+'.22)'} stroke={G+'.12)'} strokeWidth="0.4"/>
                  ))}
                  <text x={TX+32} y={TY+50} textAnchor="middle" fill={G+'.42)'} fontSize="8.5" fontFamily="monospace">BASIC PROGRAMMABLE</text>
                </>;
            })()}
            <EditZone stepId="thermostat"
              x={RET_X+RET_PLEN_W+6} y={DECK_Y+10} w={68} h={70}/>
          </g>}

                    {/* Dehu + ERV -- small compact boxes side by side, hanging from roofline */}
          {(hasDehu||Array.isArray(a.extras)&&a.extras.includes('erv'))&&(()=>{
            const sysX=hasFurnace?FURN_X:AH_X;
            const BW=80;
            // Dehu: left of furnace center (clear of flue which is on right side)
            const dehuBX=sysX+44;
            // ERV: far left of return plenum
            const ervBX=Math.max(8, RET_X-BW+80);
            return <DehuErvBoxes dehuBX={dehuBX} ervBX={ervBX} BY={UNIT_Y-48-14} roofY={EAVE_Y+14}
              hasDehu={hasDehu} hasERV={Array.isArray(a.extras)&&a.extras.includes('erv')}/>;
          })()}

          {/* Condensate drain - dashed blue line below coil, pump box if selected */}
          {hasCoil&&<g key="attic-drain">
            {(()=>{
              const hasPump=Array.isArray(a.extras)&&a.extras.includes('condensate');
              const coilCX=hasFurnace?ACOIL_X+ACOIL_W*0.12:AH_X+Math.round(AH_W*0.60);
              const drainTopY=UNIT_Y+UNIT_H+4;
              if(hasPump){
                const pW=80, pH=24;
                const pX=coilCX-pW/2, pY=drainTopY+28;
                return <>
                  <line x1={coilCX} y1={drainTopY} x2={coilCX} y2={pY}
                    stroke={B+'.4)'} strokeWidth="1.5" strokeDasharray="3 2"/>
                  <CondensatePump x={pX} y={pY} w={pW} h={pH}/>
                </>;
              } else {
                return <>
                  <line x1={coilCX} y1={drainTopY} x2={coilCX} y2={DECK_Y+20}
                    stroke={B+'.35)'} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round"/>
                  <text x={coilCX+7} y={DECK_Y+14} textAnchor="start"
                    fill={B+'.35)'} fontSize="10" fontFamily="monospace">DRAIN</text>
                </>;
              }
            })()}
          </g>}

          {/* LIVE SYSTEM PREVIEW label */}
          {loc&&<text x={12} y={EAVE_Y-4} fill={G+'.22)'} fontSize="9.5" fontFamily="monospace" letterSpacing=".18em">LIVE SYSTEM PREVIEW</text>}

          {/* Empty state */}
          {!loc&&<g>
            <text x={HOUSE_W/2} y={VH/2-10} textAnchor="middle" fill={G+'.12)'} fontSize="13.5" fontFamily="monospace">Choose your location to begin building</text>
            <text x={HOUSE_W/2} y={VH/2+8} textAnchor="middle" fill={G+'.06)'} fontSize="11.5" fontFamily="monospace">Components assemble here in real time →</text>
          </g>}
        </svg>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // UPFLOW CLOSET
  // Zoomed out to show full attic above deck. Plenum doubled in height.
  // Ionizer enters horizontally from side of plenum with external bulb.
  // ══════════════════════════════════════════════════════════
  if(isCloset){
    const BASE_VW=1000, VH=820;
    // VW used to be a flat 1000 regardless of the actual container shape -
    // on a wide screen (this whole layout is much taller/narrower than the
    // attic one, 1000:820 vs 1280:510) the default "meet" scaling then fits
    // by height and pillarboxes hard, wasting most of the width as empty
    // side gutters. Matching VW to the frame's aspect (same approach as the
    // attic canvas's FRAME_ASPECT_VW) kills the gutters. Capped at 1.4x so
    // an ultrawide screen doesn't run away with it.
    const BASE_ASPECT=BASE_VW/VH;
    const frameAspect=frameBox&&frameBox.h>0?frameBox.w/frameBox.h:BASE_ASPECT;
    const FRAME_ASPECT_VW=frameBox&&frameBox.h>0?Math.round(VH*frameAspect):BASE_VW;
    const VW=Math.max(BASE_VW,Math.min(FRAME_ASPECT_VW,Math.round(BASE_VW*1.4)));
    // preserveAspectRatio="xMidYMid meet" below always scales by whichever
    // of width/height is the tighter fit - see EditZone's MIN_EDIT_PX comment.
    SVG_SCALE=frameBox&&frameBox.h>0?Math.min(frameBox.w/VW,frameBox.h/VH):1;
    SVG_VW=VW; SVG_VH=VH;
    const SCALE=7.8;
    const UNIT_W=Math.round(20*SCALE);   // ~156px
    // Real dimensions: a 3-ton furnace runs ~33in, its A-coil adds ~24in on
    // top (57in combined) - only ~3in taller than a standalone air handler
    // at ~54in. Keep those proportions instead of an arbitrarily shrunk AH.
    const FURN_H=Math.round(33*SCALE);
    const COIL_H=Math.round(24*SCALE);
    const AH_H=Math.round(54*SCALE);

    // 3/5 house when condenser, full width otherwise - same 3:2 split as
    // before, but now taken as a share of the dynamic VW so both the house
    // (more attic/room around the same fixed-size equipment) and the
    // outside zone (more yard around the same fixed-size condenser) grow
    // together on a wider frame, instead of every reclaimed pixel going
    // to just one side.
    const HOUSE_W=hasCond?Math.round(VW*(3/5)):VW-12;
    const OUTSIDE_ZONE_W=hasCond?VW-HOUSE_W:0;

    // Center unit in house zone before condenser, shift left after
    const UNIT_X=hasCond?Math.round((HOUSE_W-UNIT_W)/2-20):Math.round((VW-UNIT_W)/2);

    const DECK_Y=220;

    // Roof geometry, hoisted so the background sky-cap rect (below) and
    // the actual roof line drawing can share one calculation instead of
    // two copies that could drift apart.
    const ROOF_W=hasCond?HOUSE_W:VW-8;
    const ROOF_RISE=Math.round(Math.min(ROOF_W/2*(3/12),60));
    const ROOF_EAVE_Y=ROOF_RISE+12;
    const ROOF_RIDGE_Y=8, ROOF_MID_X=ROOF_W/2;

    // Plenum
    const PLEN_W=UNIT_W;
    const PLEN_ABOVE=hasPlenum?130:0;
    const PLEN_BELOW=hasPlenum?57:0;
    const PLEN_TOTAL=PLEN_ABOVE+PLEN_BELOW;
    const PLEN_TOP=DECK_Y-PLEN_ABOVE;

    const UNIT_BOT_OFFSET=57; // matches PLEN_BELOW so plenum is flush with unit top
    const UNIT_TOP=DECK_Y+UNIT_BOT_OFFSET;
    const ACOIL_H=hasFurnace?COIL_H:AH_H;
    const ACOIL_Y=UNIT_TOP;
    const FURN_Y=ACOIL_Y+ACOIL_H+4;
    const APR_H=hasAprilaire?28:0;
    const APR_Y=hasFurnace?FURN_Y+FURN_H:ACOIL_Y+ACOIL_H;
    const CHASE_Y=APR_Y+APR_H+2;
    // Coil sub-box actually passed to ACoilV below: the full coil height
    // for a furnace-paired A-coil, or just the bottom 38% of the air
    // handler cabinet for a standalone coil (return-air side, per the
    // aux-heat-kit restructure that put the coil there). Hoisted so the
    // ACoilV call and the lineset's exit point below both derive from the
    // same box instead of two guesses that can drift apart.
    const COIL_BOX_Y=hasFurnace?ACOIL_Y+14:ACOIL_Y+ACOIL_H*0.58;
    const COIL_BOX_H=hasFurnace?ACOIL_H-28:ACOIL_H*0.38;
    // Lineset connects at the coil's base/header, 80%/88% down its own
    // box - exactly where ACoilV draws the liquid/suction stub-outs, on
    // the right side of the cabinet (see ACoilV) - not an independent
    // fraction of ACOIL_H, so this can't end up pointing at empty space
    // (or the furnace) again if the coil is resized or moved.
    const LS_Y1=Math.round(COIL_BOX_Y+COIL_BOX_H*0.80);
    const LS_Y2=Math.round(COIL_BOX_Y+COIL_BOX_H*0.88);

    // Condenser - real-world size, fixed regardless of canvas/zone width.
    // This used to rescale to fill 80% of the outside zone, which meant
    // widening the zone (see the OUTSIDE_ZONE_W fix above) widened the
    // condenser right along with it - the exact bug the attic canvas
    // already hit and fixed the same way (see its COND_SIZES). A wider
    // zone now just shows more open yard around the same-sized unit.
    // Same px/inch as the furnace/coil stack above (SCALE) so it reads at
    // the same real-world scale as the rest of the equipment.
    const PX_C=SCALE;
    const CU_SIZES={
      fedmin:   {w:Math.round(30*PX_C), h:Math.round(28*PX_C)},
      mid_ge15: {w:Math.round(36*PX_C), h:Math.round(22*PX_C)},
      high_ge18:{w:Math.round(40*PX_C), h:Math.round(40*PX_C)},
    };
    const CU=CU_SIZES[a.cond_tier]||CU_SIZES.fedmin;
    const COND_W=CU.w;
    const COND_H=CU.h;
    const EXT_WALL_X=HOUSE_W;
    const WALL_THICK=18;
    const DISC_ZONE=52;
    const COND_X=EXT_WALL_X+WALL_THICK+DISC_ZONE+8;
    // Condenser sits at ground level - bottom near bottom of canvas
    const GROUND_Y=VH-40;
    const COND_Y=GROUND_Y-COND_H;
    // Lineset exits the RIGHT face of the A-coil at its midpoint - NOT the plenum
    // ACOIL_Y is defined below, so we compute after unit stack constants
    // (will be: ACOIL_Y + ACOIL_H * 0.35 and 0.55)

    return(
      <div ref={wrapRef} style={{position:'absolute',inset:0}}>
        {hasCoil&&<ToggleUI style={{position:'absolute',top:8,right:8,zIndex:10}}/>}
        <svg viewBox={`0 0 ${VW} ${VH}`} className="canvas-svg" aria-hidden="true">
          <Defs/>
          <rect x="0" y="0" width={VW} height={VH} fill="#0b0d14"/>
          {/* Outside zone - brightest sunny, dimmer overcast, darkest cold,
              same as the attic layout's outside zone (OUTSIDE_* above). */}
          {hasCond&&<rect x={HOUSE_W} y="0" width={VW-HOUSE_W} height={VH}
            style={{fill:outsideFill,transition:'fill .8s ease'}}/>}
          {/* Full attic space above deck - subtly tinted by mode, see intFill above. */}
          <rect x="0" y="0" width={hasCond?HOUSE_W:VW} height={DECK_Y}
            style={{fill:intFill('attic'),transition:'fill .8s ease'}}/>
          {/* Sky above the roofline, house side - painted over the top
              sliver of the attic-interior rect above, so it matches the
              outside zone's sky instead of reading as an interior-tinted
              wall running the full canvas height. Real sky is continuous
              above both the roof and the condenser pad; only below the
              eave does the building envelope actually separate "inside"
              from "outside". Widened 2px past HOUSE_W to overlap into the
              outside-zone rect rather than exactly abut it - see the
              matching comment on the attic-horizontal layout's version of
              this rect for why (a faint anti-aliasing seam between two
              same-color adjacent rects otherwise reads as a parapet line). */}
          {hasCond&&<rect x="0" y="0" width={HOUSE_W+2} height={ROOF_EAVE_Y}
            style={{fill:outsideFill,transition:'fill .8s ease'}}/>}
          {/* Closet below deck */}
          <rect x={UNIT_X-28} y={DECK_Y} width={UNIT_W+56} height={VH-DECK_Y}
            style={{fill:intFill('closet'),transition:'fill .8s ease'}} stroke={W+'.05)'} strokeWidth="1.4"/>
          <rect x={UNIT_X-28} y={DECK_Y} width="4" height={VH-DECK_Y} fill="#0d0d0d"/>
          <rect x={UNIT_X+UNIT_W+28} y={DECK_Y} width="4" height={VH-DECK_Y} fill="#0d0d0d"/>
          <text x={UNIT_X+UNIT_W/2} y={DECK_Y+14} textAnchor="middle"
            fill={W+'.1)'} fontSize="10" fontFamily="monospace" letterSpacing="1.5">UTILITY CLOSET</text>

          {/* ── LOW-PITCH ROOF - spans attic width ── */}
          {(()=>{
            const rW=ROOF_W, rEave=ROOF_EAVE_Y, rRidge=ROOF_RIDGE_Y, rMid=ROOF_MID_X;
            return <>
              <line x1="0" y1={rEave} x2={rMid} y2={rRidge} stroke="rgba(160,152,128,.55)" strokeWidth="3"/>
              <line x1={rMid} y1={rRidge} x2={rW} y2={rEave} stroke="rgba(160,152,128,.55)" strokeWidth="3"/>
              <polygon points={`0,${rEave} ${rMid},${rRidge} ${rW},${rEave}`} fill="rgba(10,10,16,.55)"/>
              <rect x={rMid-5} y={rRidge-2} width="10" height="7" rx="2" fill="rgba(160,155,135,.17)"/>
              {/* Interior rafters */}
              {[rW*0.15,rW*0.32].map((rx,i)=>(
                <line key={'lr'+i} x1={rx} y1={DECK_Y} x2={rMid} y2={rRidge} stroke="rgba(88,68,32,.1)" strokeWidth="1.5"/>
              ))}
              {[rW*0.68,rW*0.85].map((rx,i)=>(
                <line key={'rr'+i} x1={rx} y1={DECK_Y} x2={rMid} y2={rRidge} stroke="rgba(88,68,32,.1)" strokeWidth="1.5"/>
              ))}
            </>;
          })()}

          {/* Insulation - spray on ROOF UNDERSIDE, fiberglass on ATTIC FLOOR, only when selected */}
          {a.insulation&&(isSpray
            ?<>
              {/* Spray foam follows roof pitch on underside */}
              {(()=>{
                const rW=hasCond?HOUSE_W:VW-8;
                const rRise=Math.round(Math.min(rW/2*(3/12),60));
                const rEave=rRise+12, rRidge=8, rMid=rW/2;
                return <>
                  {Array.from({length:14},(_,i)=>{
                    const t=i/13, sx=t*rMid, sy=rEave-(rEave-rRidge)*t;
                    const ang=-Math.atan2(rEave-rRidge,rMid)*180/Math.PI;
                    return <ellipse key={'sfl'+i} cx={sx+8} cy={sy+9} rx={18} ry={10}
                      fill="rgba(234,238,246,.14)" stroke="rgba(234,238,246,.2)" strokeWidth=".5"
                      transform={`rotate(${ang},${sx+8},${sy+9})`}/>;
                  })}
                  {Array.from({length:14},(_,i)=>{
                    const t=i/13, sx=rMid+t*(rW-rMid), sy=rRidge+(rEave-rRidge)*t;
                    const ang=Math.atan2(rEave-rRidge,rW-rMid)*180/Math.PI;
                    return <ellipse key={'sfr'+i} cx={sx} cy={sy+8} rx={18} ry={10}
                      fill="rgba(234,238,246,.14)" stroke="rgba(234,238,246,.2)" strokeWidth=".5"
                      transform={`rotate(${ang},${sx},${sy+8})`}/>;
                  })}
                  <text x="22" y={DECK_Y-24} fill="rgba(232,236,246,.3)" fontSize="10" fontFamily="monospace">SPRAY FOAM</text>
                </>;
              })()}
            </>
            :<>
              {Array.from({length:Math.floor((hasCond?HOUSE_W:VW-8)/17)},(_,i)=>(
                <ellipse key={i} cx={8+i*17} cy={DECK_Y-8} rx={11} ry={7}
                  fill="rgba(255,182,193,.15)" stroke="rgba(255,182,193,.19)" strokeWidth=".4"/>
              ))}
              <text x="22" y={DECK_Y-22} fill="rgba(255,182,193,.3)" fontSize="10" fontFamily="monospace">FIBERGLASS INSULATION</text>
            </>
          )}

          {/* Attic deck line */}
          <rect x="0" y={DECK_Y} width={hasCond?HOUSE_W:VW-8} height="5"
            fill="#141416" stroke="rgba(186,182,166,.08)" strokeWidth="0.4"/>
          {/* Ceiling joists */}
          {Array.from({length:Math.floor((hasCond?HOUSE_W:VW-8)/68)},(_,i)=>(
            <rect key={i} x={38+i*68} y={DECK_Y-2} width="10" height="7" rx="1"
              fill="rgba(90,68,32,.2)" stroke="rgba(108,82,36,.12)" strokeWidth="0.4"/>
          ))}
          <text x="22" y="16" fill={W+'.14)'} fontSize="10" fontFamily="monospace" letterSpacing="0.8">ATTIC</text>



          {/* ── SUPPLY PLENUM - crosses deck, extends into attic ── */}
          {hasPlenum&&hasCoil&&<g className="snap" key="spl">
            {(()=>{
              const isExisting=a.plenum==='none';
              const isMetal=a.plenum==='metal';
              const pFill=isExisting?"rgba(38,38,52,.6)":isMetal?"#1a1c24":"#141108";
              const pStroke=isExisting?(G+'.22)'):(G+(isMetal?'.74)':'.5)'));
              return <>
                <rect x={UNIT_X} y={PLEN_TOP} width={PLEN_W} height={PLEN_TOTAL} rx="3"
                  fill={pFill} stroke={pStroke} strokeWidth={isExisting?1:isMetal?1.7:1.4}
                  strokeDasharray={isExisting?"6 3":undefined} opacity={isExisting?0.7:1}/>
                {/* Warm/cold air pulse - same idea as the refrigerant line pulse, orange for heat, blue for cool.
                    Thick + glowing so it reads clearly against the plenum's own static material border underneath. */}
                <rect x={UNIT_X-2} y={PLEN_TOP-2} width={PLEN_W+4} height={PLEN_TOTAL+4} rx="4"
                  fill="none" stroke={heatMode?"#f97316":"#2389e0"} strokeWidth="4" filter="url(#glow-sm)" className="line-pulse"/>
                {!isExisting&&isMetal&&Array.from({length:Math.floor(PLEN_TOTAL/8)},(_,i)=>(
                  <line key={i} x1={UNIT_X+2} y1={PLEN_TOP+4+i*8} x2={UNIT_X+PLEN_W-2} y2={PLEN_TOP+4+i*8}
                    stroke={W+'.04)'} strokeWidth="0.3"/>
                ))}
                {/* Deck line crossing through plenum */}
                <line x1={UNIT_X-8} y1={DECK_Y} x2={UNIT_X+PLEN_W+8} y2={DECK_Y}
                  stroke={G+'.30)'} strokeWidth="1" strokeDasharray="4 3"/>
                {/* Plenum label */}
                <text x={UNIT_X+PLEN_W/2} y={PLEN_TOP+PLEN_TOTAL*0.58+3} textAnchor="middle"
                  fill={isExisting?(G+'.55)'):(G+'.5)')} fontSize="9.3" fontFamily="monospace">
                  {isExisting?'EXISTING PLENUM':isMetal?'METAL PLENUM':'DUCTBOARD PLENUM'}
                </text>
                {/* Supply airflow arrows INSIDE the plenum - two upward flow arrows */}
                {[UNIT_X+PLEN_W*0.28, UNIT_X+PLEN_W*0.68].map((ax,i)=>(
                  <g key={i}>
                    <path d={`M${ax} ${PLEN_TOP+PLEN_ABOVE*0.85} L${ax} ${PLEN_TOP+PLEN_ABOVE*0.18}`}
                      fill="none" stroke={(heatMode?O:B)+'.3)'} strokeWidth="8" strokeLinecap="round" opacity="0.3"/>
                    <path d={`M${ax} ${PLEN_TOP+PLEN_ABOVE*0.85} L${ax} ${PLEN_TOP+PLEN_ABOVE*0.18}`}
                      fill="none" stroke={(heatMode?O:B)+'.8)'} strokeWidth="1.4"
                      strokeDasharray="6 4" className="airflow" style={{strokeDashoffset:0}}
                      markerEnd="url(#arr)"/>
                    <text x={ax} y={PLEN_TOP+PLEN_ABOVE*0.92} textAnchor="middle"
                      fill={G+'.3)'} fontSize="10" fontFamily="monospace">SUPPLY</text>
                  </g>
                ))}
                {/* Ionizer - horizontal from right */}
                {hasIonizer&&!isExisting&&(()=>{
                  const rodLen=Math.round(PLEN_W*0.62);
                  const bulbX=UNIT_X+PLEN_W+12;
                  const rodY=PLEN_TOP+PLEN_TOTAL*0.88;
                  const rodTip=UNIT_X+PLEN_W-rodLen;
                  return <g className="fadein">
                    <circle cx={bulbX} cy={rodY} r={16} fill="rgba(253,224,71,.07)" stroke="rgba(253,224,71,.18)" strokeWidth="0.5" filter="url(#glow-uv)"/>
                    <ellipse cx={bulbX} cy={rodY} rx={10} ry={12} fill="rgba(251,191,36,.18)" stroke="rgba(253,224,71,.75)" strokeWidth="1.5"/>
                    <ellipse cx={bulbX} cy={rodY} rx={6} ry={7.5} fill="rgba(253,224,71,.32)" stroke="none" className="glow-pulse"/>
                    <line x1={bulbX-3} y1={rodY-5} x2={bulbX+3} y2={rodY+5} stroke="rgba(253,224,71,.9)" strokeWidth="1.2" strokeLinecap="round"/>
                    <line x1={bulbX+3} y1={rodY-5} x2={bulbX-3} y2={rodY+5} stroke="rgba(253,224,71,.9)" strokeWidth="1.2" strokeLinecap="round"/>
                    <rect x={UNIT_X+PLEN_W-2} y={rodY-5} width={16} height={10} rx="2" fill="rgba(180,130,20,.45)" stroke="rgba(253,224,71,.5)" strokeWidth="0.8"/>
                    <line x1={UNIT_X+PLEN_W} y1={rodY} x2={rodTip} y2={rodY} stroke="rgba(253,224,71,.22)" strokeWidth={8} strokeLinecap="round" filter="url(#glow-uv)"/>
                    <line x1={UNIT_X+PLEN_W} y1={rodY} x2={rodTip} y2={rodY} stroke="rgba(253,224,71,.8)" strokeWidth={2.2} strokeLinecap="round"/>
                    <circle cx={rodTip} cy={rodY} r={3} fill="rgba(253,224,71,.9)" className="glow-pulse"/>
                    <text x={bulbX+18} y={rodY+4} textAnchor="start" fill="rgba(253,224,71,.45)" fontSize="9.5" fontFamily="monospace">IONIZER</text>
                  </g>;
                })()}
              </>;
            })()}
          </g>}

          {hasPlenum&&hasCoil&&<EditZone stepId="plenum"
            x={UNIT_X-2} y={PLEN_TOP-2} w={PLEN_W+4} h={PLEN_TOTAL+4} rx={5}/>}

          {/* Upflow supply ducts - exit plenum sides, run long, drop to ceiling grille */}
          {hasPlenum&&hasCoil&&a.plenum!=='none'&&<g className="fadein" key="upflow-ducts" style={{animationDelay:'.2s'}}>
            {(()=>{
              const DW=13; // duct thickness
              const DC=G+'.30)';
              const DS=G+'.16)';
              const GW=DW+10; // grille width
              // Ducts exit at upper portion of plenum's attic section
              const exitY=PLEN_TOP+Math.round(PLEN_ABOVE*0.38);
              // How far out before dropping - well past unit edges
              const leftDropX=UNIT_X-120;
              const rightDropX=UNIT_X+PLEN_W+120;
              // Vertical drop goes from exitY down to DECK_Y
              return <>
                {/* ── LEFT DUCT ── */}
                {/* Horizontal run from plenum left face outward */}
                <rect x={leftDropX} y={exitY} width={UNIT_X-leftDropX} height={DW} fill={DC} stroke={DS} strokeWidth="1"/>
                {/* Vertical drop from horizontal run down to deck */}
                <rect x={leftDropX} y={exitY} width={DW} height={DECK_Y-exitY} fill={DC} stroke={DS} strokeWidth="1"/>
                {/* Ceiling grille at DECK_Y */}
                <rect x={leftDropX-GW/2+DW/2} y={DECK_Y} width={GW} height={9} rx="1"
                  fill="rgba(0,0,0,.75)" stroke={DC} strokeWidth="1.2"/>
                {Array.from({length:5},(_,i)=>(
                  <line key={i} x1={leftDropX-GW/2+DW/2+3+i*(GW-6)/4} y1={DECK_Y+1}
                    x2={leftDropX-GW/2+DW/2+3+i*(GW-6)/4} y2={DECK_Y+8}
                    stroke={DC} strokeWidth="0.8"/>
                ))}
                <text x={leftDropX+DW/2} y={DECK_Y+18} textAnchor="middle"
                  fill={G+'.35)'} fontSize="9.5" fontFamily="monospace">SUPPLY</text>

                {/* ── RIGHT DUCT ── */}
                {/* Horizontal run from plenum right face outward */}
                <rect x={UNIT_X+PLEN_W} y={exitY} width={rightDropX-(UNIT_X+PLEN_W)+DW} height={DW} fill={DC} stroke={DS} strokeWidth="1"/>
                {/* Vertical drop down to deck */}
                <rect x={rightDropX} y={exitY} width={DW} height={DECK_Y-exitY} fill={DC} stroke={DS} strokeWidth="1"/>
                {/* Ceiling grille at DECK_Y */}
                <rect x={rightDropX-GW/2+DW/2} y={DECK_Y} width={GW} height={9} rx="1"
                  fill="rgba(0,0,0,.75)" stroke={DC} strokeWidth="1.2"/>
                {Array.from({length:5},(_,i)=>(
                  <line key={i} x1={rightDropX-GW/2+DW/2+3+i*(GW-6)/4} y1={DECK_Y+1}
                    x2={rightDropX-GW/2+DW/2+3+i*(GW-6)/4} y2={DECK_Y+8}
                    stroke={DC} strokeWidth="0.8"/>
                ))}
                <text x={rightDropX+DW/2} y={DECK_Y+18} textAnchor="middle"
                  fill={G+'.35)'} fontSize="9.5" fontFamily="monospace">SUPPLY</text>
              </>;
            })()}
          </g>}

          {/* A-coil / AH */}
          {hasCoil&&<g className="snap" key={'ac-c'+a.cond_tier} style={{animationDelay:'.07s'}}>
            {(()=>{
              const active=evapActive;
              return <>
                <rect x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={ACOIL_H} rx="5"
                  fill={active?"#050c1c":"#090909"}
                  stroke={active?(evapC+'88'):(G+'.44)')} strokeWidth={active?1.8:1.5}/>
                {active&&<rect x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={ACOIL_H} rx="5"
                  fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none"/>}
                <rect x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={9} rx="5"
                  fill={active?(refReversed?"url(#orange-g)":"url(#blue)"):"url(#gold)"} opacity=".65"/>
                {hasFurnace
                  ?<ACoilV x={UNIT_X+8} y={COIL_BOX_Y} w={UNIT_W-16} h={COIL_BOX_H} active={active}/>
                  :<>
                    {/* Sized by real proportion (A-coil 50% / blower 35% /
                        aux heat kit 15%) and ordered by airflow: A-coil is
                        always closest to the return plenum - the bottom
                        here, where the filtration cabinet and return chase
                        feed in from below - then blower, then the aux heat
                        kit above the blower, matching where a real heat
                        strip kit sits in the supply plenum just before the
                        air exits upward to the ductwork. Present on every
                        air-handler build regardless of efficiency tier: the
                        low-ambient mid tier is rated to keep the compressor
                        running well below where this kicks in for the
                        other two tiers, so the kit is still physically
                        installed there as backup, it just almost never
                        glows. */}
                    <line x1={UNIT_X} y1={ACOIL_Y+ACOIL_H*0.215} x2={UNIT_X+UNIT_W} y2={ACOIL_Y+ACOIL_H*0.215}
                      stroke={G+'.18)'} strokeWidth="0.9" strokeDasharray="4 3"/>
                    <line x1={UNIT_X} y1={ACOIL_Y+ACOIL_H*0.53} x2={UNIT_X+UNIT_W} y2={ACOIL_Y+ACOIL_H*0.53}
                      stroke={G+'.18)'} strokeWidth="0.9" strokeDasharray="4 3"/>
                    <rect x={UNIT_X+14} y={ACOIL_Y+ACOIL_H*0.095} width={UNIT_W-28} height={ACOIL_H*0.075} rx="2"
                      fill={auxHeatActive?"rgba(120,20,10,.16)":"rgba(10,10,14,.5)"}
                      stroke={auxHeatActive?"rgba(249,115,22,.6)":(G+'.14)')} strokeWidth="0.8"/>
                    {Array.from({length:4},(_,i)=>{
                      const segW=(UNIT_W-52)/4;
                      const bx=UNIT_X+22+i*(UNIT_W-36)/4;
                      return <g key={i}>
                        <rect x={bx} y={ACOIL_Y+ACOIL_H*0.115} width={Math.max(1,segW)} height={ACOIL_H*0.045} rx="1"
                          fill={auxHeatActive?"#1a0805":"#0a0a0f"} stroke={auxHeatActive?"rgba(249,115,22,.4)":"rgba(48,20,5,.2)"} strokeWidth="0.5"/>
                        {auxHeatActive&&<ellipse cx={bx+segW/2} cy={ACOIL_Y+ACOIL_H*0.115} rx={segW/2} ry={3}
                          fill="rgba(249,115,22,.6)" className="glow-pulse" style={{animationDelay:i*0.1+'s'}}/>}
                      </g>;
                    })}
                    <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y+ACOIL_H*0.195} textAnchor="middle"
                      fill={auxHeatActive?"rgba(249,115,22,.78)":(G+'.5)')} fontSize="9.5" fontFamily="monospace">AUX HEAT KIT</text>
                    <BlowerWheel cx={UNIT_X+UNIT_W/2} cy={ACOIL_Y+ACOIL_H*0.33}
                      r={Math.min(UNIT_W*0.24,ACOIL_H*0.105)}
                      spd={blowerActive?1.4:0.4} active={blowerActive}/>
                    <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y+ACOIL_H*0.465} textAnchor="middle"
                      fill={G+'.55)'} fontSize="10" fontFamily="monospace">BLOWER</text>
                    <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y+ACOIL_H*0.50} textAnchor="middle"
                      fill={G+'.4)'} fontSize="7.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
                    <ACoilV x={UNIT_X+8} y={COIL_BOX_Y} w={UNIT_W-16} h={COIL_BOX_H} active={active}/>
                  </>
                }
                {hasCond&&!hasFurnace&&<>
                  <path d={`M${UNIT_X+UNIT_W} ${LS_Y1} L${UNIT_X+UNIT_W+28} ${LS_Y1}`}
                    fill="none" stroke={active?evapC:'rgba(32,32,52,.5)'} strokeWidth="2.8" strokeLinecap="round" className="draw"/>
                  <path d={`M${UNIT_X+UNIT_W} ${LS_Y2} L${UNIT_X+UNIT_W+28} ${LS_Y2}`}
                    fill="none" stroke={active?evapC2:'rgba(32,32,52,.4)'} strokeWidth="2.8" strokeLinecap="round" className="draw" style={{animationDelay:'.08s'}}/>
                  {active&&<text x={UNIT_X+UNIT_W+14} y={LS_Y1-8}
                    textAnchor="middle" fill={evapC} fontSize="10.5" fontFamily="monospace">
                    {refReversed?'←':'→'}
                  </text>}
                </>}
                <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y-6} textAnchor="middle"
                  fill={active?evapC:(G+'.35)')} fontSize="9.5" fontFamily="monospace">
                  {hasFurnace?"A-COIL":"AIR HANDLER"}
                </text>
                {/* ACOIL_H means two different things here: a small coil-only
                    height for furnace systems (this status line sits below
                    it, in the gap before the furnace box), or the entire
                    air handler's height when there's no furnace box at all.
                    Reusing the furnace offset for that case put this well
                    past the filtration cabinet below the unit, into
                    whatever happened to be drawn next (the return air
                    chase) - anchor to the AH box's own top instead, in the
                    empty space below its "AIR HANDLER" title and above the
                    blower graphic. */}
                <text x={UNIT_X+UNIT_W/2} y={hasFurnace?(ACOIL_Y+ACOIL_H+APR_H+27):(ACOIL_Y+20)} textAnchor="middle"
                  fill={active?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):(auxHeatActive?'rgba(249,115,22,.65)':'rgba(255,255,255,.14)')} fontSize="10" fontFamily="monospace">
                  {active?(refReversed?"REJECTING HEAT":"ABSORBING HEAT"):(auxHeatActive?"AUX HEAT ONLY":"STANDBY")}
                </text>
              </>;
            })()}
          </g>}

          {/* Furnace - HX top | blower bottom */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'fu-c'+a.stage}>
            <rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={FURN_H} rx="5"
              fill={furnaceActive?"#0e0606":"#090909"}
              stroke={furnaceActive?'rgba(249,115,22,.78)':(G+'.58)')} strokeWidth={furnaceActive?2.1:1.7}/>
            {furnaceActive&&<rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={FURN_H} rx="5"
              fill={O+'.04)'} stroke="none"/>}
            <rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={9} rx="5"
              fill={furnaceActive?"url(#orange-g)":"url(#gold)"} opacity=".72"/>
            <line x1={UNIT_X} y1={FURN_Y+FURN_H/2} x2={UNIT_X+UNIT_W} y2={FURN_Y+FURN_H/2}
              stroke={G+'.18)'} strokeWidth="0.9" strokeDasharray="4 3"/>
            {/* TOP: HX */}
            {Array.from({length:5},(_,i)=>(
              <path key={i}
                d={`M${UNIT_X+8} ${FURN_Y+12+i*((FURN_H/2-20)/5)} Q${UNIT_X+UNIT_W/2} ${FURN_Y+6+i*((FURN_H/2-20)/5)} ${UNIT_X+UNIT_W-8} ${FURN_Y+12+i*((FURN_H/2-20)/5)}`}
                fill="none" stroke={furnaceActive?'rgba(249,115,22,.56)':'rgba(108,44,8,.18)'}
                strokeWidth="2.6" strokeLinecap="round"/>
            ))}
            <rect x={UNIT_X+6} y={FURN_Y+FURN_H/2-13} width={UNIT_W-12} height={10} rx="2"
              fill={furnaceActive?O+'.07)':'rgba(5,5,13,.8)'}
              stroke={furnaceActive?'rgba(249,115,22,.42)':(G+'.14)')} strokeWidth="0.6"/>
            {furnaceActive&&Array.from({length:4},(_,i)=>(
              <ellipse key={i} cx={UNIT_X+14+i*((UNIT_W-14)/4)} cy={FURN_Y+FURN_H/2-13}
                rx={(UNIT_W-14)/10} ry={5}
                fill={O+'.55)'} className="glow-pulse" style={{animationDelay:i*0.12+'s'}}/>
            ))}
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H/4+6} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.75)':(G+'.5)')} fontSize="10" fontFamily="monospace">HEAT EXCH.</text>
            {/* BOTTOM: blower */}
            <BlowerWheel cx={UNIT_X+UNIT_W/2} cy={FURN_Y+FURN_H*0.70}
              r={Math.min(UNIT_W*0.32,FURN_H*0.155)}
              spd={blowerActive?1.55:0.5} active={blowerActive}/>
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H-15} textAnchor="middle"
              fill={G+'.55)'} fontSize="10" fontFamily="monospace">BLOWER</text>
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H-6} textAnchor="middle"
              fill={G+'.4)'} fontSize="8" fontFamily="monospace">{BLOWER_MOTOR}</text>
            {/* Flue - 45° elbow routing:
                exits top of furnace → 45° elbow left → horizontal run → 45° elbow up → vertical through roof */}
            {(()=>{
              const PIPE_W=is90?5:7;
              const PIPE_C=is90?"#bfdbfe":"#c0c0c0";
              const PIPE_S=is90?"#93c5fd":"#999";
              // Exit point: top of furnace HX section (left half of furnace)
              const EXIT_X=UNIT_X+UNIT_W*0.38;
              const EXIT_Y=FURN_Y;
              // Elbow 1: rise a bit then turn left
              const ELB1_Y=EXIT_Y-18;
              // Horizontal run: go left past unit and return plenum
              const HORIZ_X=UNIT_X-52;
              // Elbow 2: turn upward
              const ELB2_Y=ELB1_Y;
              // Vertical: up through roof, stopping at the roof surface
              // itself (not the top of the canvas) - same reasoning as the
              // attic layout's flueRoofY: EAVE_Y-equivalent alone only
              // holds at the eave, and the pitched roof is higher up
              // (smaller y) wherever the flue actually sits, so this
              // interpolates the roof's own height at HORIZ_X instead of
              // reusing a single fixed constant.
              const TOP_Y=(()=>{
                const rW=hasCond?HOUSE_W:VW-8;
                const rRise=Math.min(rW/2*(3/12),60);
                const rEave=rRise+12, rRidge=8, rMid=rW/2;
                const roofYAtX=HORIZ_X<=rMid
                  ?rEave-(HORIZ_X/rMid)*(rEave-rRidge)
                  :rRidge+((HORIZ_X-rMid)/(rW-rMid))*(rEave-rRidge);
                return roofYAtX+14;
              })();
              const ELBOW_R=8; // elbow radius
              return <>
                {/* Vertical stub from furnace up to elbow 1 */}
                <rect x={EXIT_X-PIPE_W/2} y={ELB1_Y+ELBOW_R} width={PIPE_W} height={EXIT_Y-ELB1_Y-ELBOW_R}
                  fill={PIPE_C} stroke={PIPE_S} strokeWidth="0.7"/>
                {/* 45° elbow 1: turn left - quarter circle arc */}
                <path d={`M${EXIT_X-PIPE_W/2} ${ELB1_Y+ELBOW_R} Q${EXIT_X-PIPE_W/2} ${ELB1_Y} ${EXIT_X-PIPE_W/2-ELBOW_R} ${ELB1_Y}`}
                  fill="none" stroke={PIPE_S} strokeWidth={PIPE_W} strokeLinecap="round"/>
                <path d={`M${EXIT_X+PIPE_W/2} ${ELB1_Y+ELBOW_R} Q${EXIT_X+PIPE_W/2} ${ELB1_Y-PIPE_W} ${EXIT_X+PIPE_W/2-ELBOW_R-PIPE_W} ${ELB1_Y-PIPE_W}`}
                  fill="none" stroke={PIPE_C} strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
                {/* Horizontal run left */}
                <rect x={HORIZ_X+ELBOW_R} y={ELB1_Y-PIPE_W} width={EXIT_X-PIPE_W/2-ELBOW_R-HORIZ_X-ELBOW_R} height={PIPE_W}
                  fill={PIPE_C} stroke={PIPE_S} strokeWidth="0.7"/>
                {/* 45° elbow 2: turn up */}
                <path d={`M${HORIZ_X+ELBOW_R} ${ELB1_Y-PIPE_W} Q${HORIZ_X} ${ELB1_Y-PIPE_W} ${HORIZ_X} ${ELB2_Y-ELBOW_R-PIPE_W}`}
                  fill="none" stroke={PIPE_S} strokeWidth={PIPE_W} strokeLinecap="round"/>
                {/* Vertical run up through roof */}
                <rect x={HORIZ_X-PIPE_W/2} y={TOP_Y} width={PIPE_W} height={ELB2_Y-ELBOW_R-PIPE_W-TOP_Y}
                  fill={PIPE_C} stroke={PIPE_S} strokeWidth="0.7"/>
                {/* Cap at top */}
                {!is90&&<path d={`M${HORIZ_X-PIPE_W-2} ${TOP_Y+4} L${HORIZ_X} ${TOP_Y-2} L${HORIZ_X+PIPE_W+2} ${TOP_Y+4}`} fill={PIPE_C}/>}
                <text x={HORIZ_X} y={TOP_Y-6} textAnchor="middle"
                  fill={is90?"rgba(147,197,253,.5)":"rgba(148,148,148,.44)"} fontSize="9.5" fontFamily="monospace">
                  {is90?'PVC':'B-VENT'}
                </text>
              </>;
            })()}
            {isComm&&<><rect x={UNIT_X+4} y={FURN_Y+11} width={70} height="9" rx="2" fill="url(#blue)"/><text x={UNIT_X+7} y={FURN_Y+18} fill="#fff" fontSize="8.5" fontFamily="monospace">COMMUNICATING</text></>}
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y-13} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.78)':(G+'.55)')} fontSize="9.5" fontFamily="monospace">FURNACE</text>
          </g>}

          {hasCoil&&<EditZone stepId="indoor_type"
            x={UNIT_X-4} y={ACOIL_Y-2} rx={6}
            w={UNIT_W+8} h={(hasFurnace?FURN_Y+FURN_H-ACOIL_Y:ACOIL_H)+4}/>}

          {/* Aprilaire - between bottom of unit and 2x4 chase */}
          {hasCoil&&hasAprilaire&&<g className="fadein" key="apr-c">
            <rect x={UNIT_X} y={APR_Y} width={UNIT_W} height={APR_H} rx="2"
              fill="rgba(34,197,94,.1)" stroke="#22c55e" strokeWidth="1.4"/>
            {Array.from({length:14},(_,i)=>(
              <line key={i} x1={UNIT_X+5+i*(UNIT_W-10)/14} y1={APR_Y+2}
                x2={UNIT_X+5+i*(UNIT_W-10)/14} y2={APR_Y+APR_H-2}
                stroke="#22c55e" strokeWidth="0.6" opacity="0.52"/>
            ))}
            <text x={UNIT_X+UNIT_W/2} y={APR_Y+APR_H/2+3} textAnchor="middle"
              fill="#22c55e" fontSize="9.5" fontWeight="700" fontFamily="monospace">FILTRATION CABINET</text>
          </g>}

          {/* 2×4 return chase */}
          {hasCoil&&<g className="snap" key="chase">
            <rect x={UNIT_X-28} y={CHASE_Y} width={UNIT_W+56} height={VH-CHASE_Y} rx="3"
              fill="rgba(100,75,34,.07)" stroke="rgba(138,98,42,.42)" strokeWidth="1.5"/>
            {[0,1,2,3,4].map(i=>(
              <rect key={i} x={UNIT_X-28+i*(UNIT_W+56)/5} y={CHASE_Y} width={9} height={VH-CHASE_Y}
                fill="rgba(118,82,32,.18)" stroke="rgba(148,104,40,.28)" strokeWidth="0.7"/>
            ))}
            <rect x={UNIT_X-24} y={CHASE_Y+4} width={UNIT_W+48} height={VH-CHASE_Y-8}
              fill="rgba(35,137,224,.03)" stroke={B+'.1)'} strokeWidth="0.5" strokeDasharray="4 3"/>
            <path d={`M${UNIT_X+UNIT_W/2} ${VH-20} L${UNIT_X+UNIT_W/2} ${CHASE_Y+10}`}
              fill="none" stroke={W+'.09)'} strokeWidth="1"
              strokeDasharray="5 3" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
            <text x={UNIT_X+UNIT_W/2} y={VH-8} textAnchor="middle"
              fill="rgba(138,98,42,.62)" fontSize="9.5" fontFamily="monospace">2×4 RETURN AIR CHASE</text>
          </g>}

          {/* Condensate drain - exits right face of AH, S-curves into 2x4 chase */}
          {hasCoil&&(()=>{
            const hasPump=Array.isArray(a.extras)&&a.extras.includes('condensate');
            // Exit point: right face of AH/coil, lower portion
            const exitX=UNIT_X+UNIT_W;
            const exitY=hasFurnace?ACOIL_Y+Math.round(ACOIL_H*0.85):ACOIL_Y+Math.round(ACOIL_H*0.85);
            // Step 1: 45° right-down from unit face to outside chase
            const offset=20; // how far right before turning down
            const pt1X=exitX+offset;
            const pt1Y=exitY+offset; // 45°
            // Step 2: straight down
            const chaseBottomY=VH-20;
            const pumpH=24;
            const pumpY=chaseBottomY-pumpH-6;
            const pumpX=UNIT_X-28+Math.round((UNIT_W+56)*0.5)-28;
            // Step 3: 45° left-down into chase
            const pt2Y=hasPump?pumpY-offset:chaseBottomY-offset;
            const pt2X=pt1X;
            const pt3X=pt2X-offset; // back left 45°
            const pt3Y=pt2Y+offset;
            return <>
              {/* 45° right-down from unit */}
              <line x1={exitX} y1={exitY} x2={pt1X} y2={pt1Y}
                stroke={B+'.45)'} strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round"/>
              {/* Straight down */}
              <line x1={pt1X} y1={pt1Y} x2={pt2X} y2={pt2Y}
                stroke={B+'.42)'} strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round"/>
              {/* 45° left into chase */}
              <line x1={pt2X} y1={pt2Y} x2={pt3X} y2={pt3Y}
                stroke={B+'.38)'} strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round"/>
              {!hasPump&&<>
                <text x={pt1X+5} y={pt1Y+12} textAnchor="start"
                  fill={B+'.4)'} fontSize="9.5" fontFamily="monospace">DRAIN</text>
                <circle cx={pt3X} cy={pt3Y} r={3} fill={B+'.4)'} stroke={B+'.6)'} strokeWidth="0.8"/>
              </>}
              {hasPump&&<>
                <CondensatePump x={pumpX} y={pumpY} w={80} h={pumpH}/>
                <line x1={pt3X} y1={pt3Y} x2={pumpX+80} y2={pumpY+pumpH/2}
                  stroke={B+'.4)'} strokeWidth="1.5" strokeDasharray="4 3"/>
              </>}
            </>;
          })()}

          {/* ── REFRIGERANT LINE STUBS - exit right face of A-coil, run to wall ── */}
          {hasCoil&&hasCond&&<g key="rl-c">
            {/* Foam sleeve background */}
            <path d={`M${UNIT_X+UNIT_W} ${LS_Y1} L${EXT_WALL_X} ${LS_Y1}`}
              fill="none" stroke="rgba(22,22,42,.55)" strokeWidth="11" strokeLinecap="round"/>
            <path d={`M${UNIT_X+UNIT_W} ${LS_Y2} L${EXT_WALL_X} ${LS_Y2}`}
              fill="none" stroke="rgba(22,22,42,.45)" strokeWidth="11" strokeLinecap="round"/>
            {/* Liquid line - always bold */}
            <path d={`M${UNIT_X+UNIT_W} ${LS_Y1} L${EXT_WALL_X} ${LS_Y1}`}
              fill="none" stroke={line1C} strokeWidth="4.5" strokeLinecap="round" className="line-pulse"/>
            {/* Suction line - always bold */}
            <path d={`M${UNIT_X+UNIT_W} ${LS_Y2} L${EXT_WALL_X} ${LS_Y2}`}
              fill="none" stroke={line2C} strokeWidth="4.5" strokeLinecap="round" className="line-pulse" style={{animationDelay:'.15s'}}/>
            {/* Flow dots -- both pipes */}
            {Array.from({length:6},(_,i)=>{
              const isLine1=i<3;
              const pColor=isLine1?line1C:line2C;
              const lY=isLine1?LS_Y1:LS_Y2;
              const toWall=isLine1?!refReversed:refReversed;
              const p=toWall
                ?`M${UNIT_X+UNIT_W} ${lY} L${EXT_WALL_X} ${lY}`
                :`M${EXT_WALL_X} ${lY} L${UNIT_X+UNIT_W} ${lY}`;
              return <circle key={i} r="3" fill={pColor} opacity="0.82" filter="url(#glow-sm)">
                <animateMotion dur={(1.8+(i%3)*0.4)+'s'} repeatCount="indefinite" begin={(i*0.55)+'s'} path={p}/>
              </circle>;
            })}
          </g>}

          {/* ── OUTSIDE ZONE - wall + condenser, condenser aligned with unit height ── */}
          {hasCond&&<OutsideZone
            wallX={EXT_WALL_X} zoneW={OUTSIDE_ZONE_W} zoneH={VH}
            condX={COND_X} condY={COND_Y} condW={COND_W} condH={COND_H}
            lineY1={LS_Y1} lineY2={LS_Y2}
            active={condenserActive} tierKey={a.cond_tier} eaveY={ROOF_EAVE_Y}
            heatMode={heatMode} isMildHp={isMildHp}
            refReversed={refReversed} isSurge={isSurge} condC={condC}
            line1C={line1C} line2C={line2C} G={G} W={W}
            condenserEl={<Condenser x={COND_X} y={COND_Y} w={COND_W} h={COND_H}
              active={condenserActive} tierKey={a.cond_tier}/>}/>}
          {hasCond&&<EditZone stepId="cond_tier"
            x={COND_X-2} y={COND_Y-2} w={COND_W+4} h={COND_H+4} rx={5}/>}

          {/* Thermostat - mounted on the interior wall, between the unit
              and the exterior wall it's built into - a real indoor spot,
              unlike stacking it outside above the condenser. Vertically
              level with the furnace/coil it's wired to. ── */}
          {hasTstat&&<g className="snap" key="tstat-c" style={{animationDelay:'.26s'}}>
            {(()=>{
              const gapLeft=UNIT_X+UNIT_W+16, gapRight=EXT_WALL_X-16;
              const midY=hasFurnace?FURN_Y+FURN_H/2:ACOIL_Y+ACOIL_H/2;
              const TX=gapLeft+(gapRight-gapLeft)/2-38, TY=midY-38;
              const isProprietaryC=a.thermostat==='proprietary';
              const isWifiC=a.thermostat==='wifi'&&!isProprietaryC;
              const modeColorC=heatMode?"#f97316":"#2389e0";
              return isProprietaryC
                // PROPRIETARY COMMUNICATING -- edge-to-edge glass touchscreen
                // (Ecobee-style rectangle), kept visually distinct from the
                // round Wi-Fi dial below so the matched-communicating tier
                // reads as a genuinely different, more premium control.
                ?<>
                  <rect x={TX} y={TY} width={76} height={68} rx="10"
                    fill="#0a0a0d" stroke={G+'.62)'} strokeWidth="1.6"/>
                  <rect x={TX+3} y={TY+3} width={70} height={52} rx="7"
                    fill="#050810" stroke={B+'.3)'} strokeWidth="0.8"/>
                  <text x={TX+38} y={TY+35} textAnchor="middle" fill={B+'.95)'} fontSize="22"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <text x={TX+38} y={TY+48} textAnchor="middle" fill={B+'.55)'} fontSize="7.5"
                    fontFamily="monospace">{heatMode?'HEAT':'COOL'} · AUTO</text>
                  <circle cx={TX+67} cy={TY+11} r={1.9} fill={B+'.55)'}/>
                  <rect x={TX+6} y={TY+59} width={64} height="3.5" rx="1.75" fill={modeColorC} opacity="0.8"/>
                  <text x={TX+38} y={TY+82} textAnchor="middle" fill={G+'.45)'} fontSize="10" fontFamily="monospace">COMMUNICATING</text>
                </>
                :isWifiC
                ?<>
                  <circle cx={TX+38} cy={TY+38} r={36} fill="#0d0d0d" stroke={G+'.62)'} strokeWidth="1.8"/>
                  <circle cx={TX+38} cy={TY+38} r={28} fill="#060e1c" stroke={B+'.42)'} strokeWidth="1.1"/>
                  <text x={TX+38} y={TY+43} textAnchor="middle" fill={B+'.92)'} fontSize="19.5"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <path d={`M${TX+12} ${TY+38} A26 26 0 0 1 ${TX+64} ${TY+38}`}
                    fill="none" stroke={modeColorC} strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
                  <path d={`M${TX+24} ${TY+62} Q${TX+38} ${TY+53} ${TX+52} ${TY+62}`}
                    fill="none" stroke={B+'.5)'} strokeWidth="1.8" strokeLinecap="round"/>
                  <path d={`M${TX+28} ${TY+67} Q${TX+38} ${TY+61} ${TX+48} ${TY+67}`}
                    fill="none" stroke={B+'.7)'} strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx={TX+38} cy={TY+71} r={2.5} fill={B+'.8)'}/>
                  <text x={TX+38} y={TY+85} textAnchor="middle" fill={G+'.45)'} fontSize="10" fontFamily="monospace">WI-FI SMART</text>
                </>
                :<>
                  <rect x={TX} y={TY} width={76} height={62} rx="3"
                    fill="#0d0d0d" stroke={G+'.55)'} strokeWidth="1.6"/>
                  <rect x={TX+5} y={TY+6} width={66} height={34} rx="2"
                    fill="#050d18" stroke={B+'.36)'} strokeWidth="0.9"/>
                  <text x={TX+38} y={TY+28} textAnchor="middle" fill={B+'.9)'} fontSize="19.5"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  {[10,24,38,52,66].map((bx,i)=>(
                    <rect key={i} x={TX+bx-4} y={TY+46} width="9" height="5" rx="1.5"
                      fill={G+'.22)'} stroke={G+'.12)'} strokeWidth="0.4"/>
                  ))}
                  <text x={TX+38} y={TY+58} textAnchor="middle" fill={G+'.38)'} fontSize="9.5" fontFamily="monospace">BASIC</text>
                </>;
            })()}
            <EditZone stepId="thermostat"
              x={UNIT_X+UNIT_W+16+(EXT_WALL_X-16-(UNIT_X+UNIT_W+16))/2-40}
              y={(hasFurnace?FURN_Y+FURN_H/2:ACOIL_Y+ACOIL_H/2)-40} w={82} h={90}/>
          </g>}

          {/* Dehu + ERV - hang from roofline in attic zone */}
          {(hasDehu||Array.isArray(a.extras)&&a.extras.includes('erv'))&&(()=>{
            const rW=hasCond?HOUSE_W:VW-8;
            const rRise=Math.round(Math.min(rW/2*(3/12),60));
            const rEave=rRise+12; // eave Y - bottom of roofline
            const BW=80;
            // Dehu anchored far RIGHT of attic, ERV anchored far LEFT - opposite sides
            const dehuX=rW-BW-34;
            const ervX=24; // ERV slightly right
            return <DehuErvBoxes dehuBX={dehuX} ervBX={ervX} BY={rEave+42} roofY={rEave+4}
              hasDehu={hasDehu} hasERV={Array.isArray(a.extras)&&a.extras.includes('erv')} snap/>;
          })()}

        </svg>
      </div>
    );
  }

  // Fallback
  return null;
}
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
  // Post-build pricing: null=not asked, 'sizing'=sub-questions, 'result'=estimate shown
  const [pricingFlow,setPricingFlow]=useState(null);
  const [pricingSubStep,setPricingSubStep]=useState(0);
  const [pricingAnswers,setPricingAnswers]=useState({});
  const topRef=useRef(null);
  const scrollTop=useCallback(()=>setTimeout(()=>topRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),50),[]);

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
    if(i>=0){setDone(false);setStepIdx(i);setQuickEdit(true);}
  },[activeSteps]);
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
  React.useEffect(()=>{
    if(stepIdx===1&&!autoInfoShown.current){
      autoInfoShown.current=true;
      setShowInfo(true);
    }else{
      setShowInfo(false);
    }
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
    location:"Your indoor unit location sets the whole system layout. Attic is the most common in Austin -- the unit sits horizontally above the living space. Closet is upflow -- the unit stands vertically in a hallway or utility closet. Both work great; closet installs are slightly easier to service.",
    indoor_type:"A furnace uses natural gas for heat and pairs with AC for cooling. An air handler is all-electric -- it works only with a heat pump for both heating and cooling. If you have a gas line, a furnace is usually the better value. No gas line? Air handler + heat pump is the way to go.",
    insulation:"Attic insulation type determines which furnace you can install. Fiberglass or blown insulation means your attic is vented -- a standard 80% AFUE furnace works fine (AFUE = Annual Fuel Utilization Efficiency, the % of gas that becomes heat instead of exhaust) with a metal B-vent flue. Spray foam means your attic is sealed -- this requires a 90% AFUE condensing furnace with a PVC pipe through the roof deck.",
    plenum:"The supply plenum is the box that connects your indoor unit to all your ductwork. Think of it as the distribution hub -- conditioned air flows from the unit into the plenum, then out through the ducts to every room. If your existing plenum is damaged, leaking, or over 15 years old, replacing it improves efficiency and airflow.",
    thermostat:"A basic programmable thermostat is reliable and accurate -- set your schedule and forget it. A Wi-Fi smart thermostat connects to your phone, learns your habits, and can cut 10-15% off your energy bill. Both work with any system we install.",
    purif:"The enhanced filtration cabinet ships standard on every install and already captures dust, pollen, and allergens far better than a standard 1 inch filter. A UV light keeps the evaporator coil clean for longevity and efficiency. An ionizer neutralizes airborne particles, odors, and VOCs throughout the home. A surge protector mounts on the disconnect box and shields your condenser from voltage spikes -- one lightning strike can destroy a compressor.",
    cond_tier:"The condenser is the outdoor unit. SEER2 (Seasonal Energy Efficiency Ratio) measures cooling output per unit of electricity used -- higher means lower electric bills for the same cooling. Federal Minimum meets current energy code -- solid and reliable, lowest upfront cost. Mid Efficiency is our best-value tier -- variable speed, noticeably lower monthly bills, better humidity control. High Efficiency is our top inverter-driven tier -- eligible for local energy rebates and the best humidity performance available.",
    system_for:"With a gas furnace you have two options. Dual fuel (heat pump + furnace) means the heat pump handles cooling in summer and heating in mild weather -- the gas furnace only fires when it gets genuinely cold below about 35 degrees. Most efficient combo. Straight cool means your AC only cools and the furnace handles all heating year-round.",
    dehu:"Austin humidity makes your home feel significantly warmer than the thermostat reads. A whole-home dehumidifier connects directly to your HVAC system and runs automatically -- no buckets, no maintenance. Recommended for any home that feels muggy even when the AC is running.",
    extras:"A condensate pump is needed when gravity drainage is not available -- it pumps condensate water up and out to a drain or exterior wall, and is required in many closet installs. An ERV brings fresh filtered outdoor air into the home while exhausting stale air, recovering most of the heating/cooling energy from the outgoing air in the process.",
  };
  const infoText=cur&&INFO_TEXT[cur.id];

  // A short, specific acknowledgment of what was just picked - replaces
  // the generic instructional hint once there's an actual answer to react
  // to, so the tool reads as a co-pilot responding to you instead of a
  // form reciting the same paragraph regardless of what you clicked.
  const REACTION={
    indoor_type:{furnace:"Gas heat locked in — the most common setup in Austin.",ah:"All-electric heat pump — no gas line needed."},
    insulation:{fiberglass:"Standard vented attic — an 80% AFUE furnace is the right fit.",spray:"Sealed attic — stepping up to a 90% condensing furnace."},
    plenum:{ductboard:"Ductboard plenum — solid, standard choice.",metal:"Sheet metal plenum — built to outlast the system twice over.",none:"Keeping your existing plenum — saves on material and labor."},
    cond_tier:{fedmin:"Federal Minimum locked in — lowest upfront cost.",mid_ge15:"Mid Efficiency — our best-value pick.",high_ge18:"High Efficiency — the quietest, most efficient tier we offer."},
    thermostat:{basic:"Basic Programmable — simple and reliable.",wifi:"Wi-Fi Smart — control it from your phone.",proprietary:"Communicating thermostat — required, and it's the best diagnostics we offer."},
    system_for:{hp:"Dual fuel — the most efficient combo for Austin winters.",sc:"Straight cool — your furnace handles all the heating."},
    dehu:{yes:"Whole-home dehumidifier added — noticeably drier air.",no:"Skipping it for now — easy to add later if humidity becomes an issue."},
  };
  const reactionText=cur&&REACTION[cur.id]&&REACTION[cur.id][answers[cur.id]];


  const loc = answers.location;
  const isAtticMode = loc === 'attic';
  const isClosetMode = loc === 'closet';

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
      <div className={"splash-screen"+(loc||done?" out":"")}>
        <div className="splash-logo">BUILD YOUR OWN SYSTEM</div>
        <p style={{fontFamily:"var(--fb)",fontSize:"19px",color:"rgba(255,255,255,.65)",textAlign:"center",maxWidth:600,lineHeight:1.7,margin:"8px 0 4px"}}>
          Tell us where your indoor unit lives and we will build a <strong style={{color:"rgba(255,255,255,.8)"}}>live, real-time diagram</strong> of your complete HVAC system - every component, every connection, sized and labeled.
        </p>
        <p style={{fontFamily:"var(--fm)",fontSize:"14px",color:"rgba(215,183,64,.55)",textAlign:"center",letterSpacing:".1em",margin:"0 0 6px"}}>SELECT YOUR SYSTEM LOCATION TO BEGIN</p>
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
            onClick={()=>{setA("location","attic");setStepIdx(1);}}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setA("location","attic");setStepIdx(1);}}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:4}}>
              <div className="splash-card-title">Attic Horizontal</div>
              <div className="splash-card-desc">Unit lays on its side above the ceiling - most common in Austin. Air flows horizontally through ducts in the attic.</div>
            </div>
          </div>
          <div className="splash-card" role="button" tabIndex={0}
            aria-label="Closet Upflow - Unit stands upright in a utility closet or hallway alcove. Air flows vertically up through the coil."
            onClick={()=>{setA("location","closet");setStepIdx(1);}}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setA("location","closet");setStepIdx(1);}}}>
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
      <div className={"attic-layout"+(!isAtticMode||done?" out":"")}>
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
          <div className={"info-collapse"+(showInfo&&infoText?" open":"")}><div className="info-collapse-inner">
            {infoText&&<div className="info-body" style={{padding:"4px 12px",borderBottom:"1px solid var(--border)"}}>{infoText}</div>}
          </div></div>
          <div className="attic-bar-body">
            <div className="attic-info">
              <div className="step-q" style={{marginBottom:2}}>{cur?cur.q:""}</div>
              {cur&&cur.hint&&<div className="step-hint">{cur.hint}</div>}
              {reactionText&&<div key={reactionText} className="reaction-line">✓ {reactionText}</div>}
            </div>
            <div className="attic-scroll">
              {opts.map(opt=>makeOpt(opt,true))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CLOSET LAYOUT - canvas left, sidebar right ── */}
      <div className={"closet-layout"+(!isClosetMode||done?" out":"")}>
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
          <div className="step-hdr">
            <div className="step-eyebrow">
              <span>{cur&&<span className="chapter-tag">{CHAPTERS[curChapter]}</span>} Step {stepIdx}{totalKnown?` of ${totalSteps}`:''}</span>
              {infoText&&<button className="info-btn" aria-label={showInfo?"Hide info":"More info"} aria-expanded={showInfo}
                onMouseEnter={()=>hoverCapable()&&setShowInfo(true)} onMouseLeave={()=>hoverCapable()&&setShowInfo(false)}
                onFocus={()=>setShowInfo(true)} onBlur={()=>setShowInfo(false)}
                onTouchEnd={e=>{e.preventDefault();setShowInfo(v=>!v);}}>i</button>}
            </div>
            <div className="step-q">{cur?cur.q:""}</div>
            {cur&&cur.hint&&<div className="step-hint">{cur.hint}</div>}
            {reactionText&&<div key={reactionText} className="reaction-line">✓ {reactionText}</div>}
          </div>
          <div className={"info-collapse"+(showInfo&&infoText?" open":"")}><div className="info-collapse-inner">
            {infoText&&<div className="info-expand"><div className="info-body">{infoText}</div></div>}
          </div></div>
          <div className="opts">{opts.map(opt=>makeOpt(opt,false))}</div>
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
      {doneVisible&&<div className={"done-screen"+(isAtticMode?" attic-mode":" closet-mode")+(!done?" done-leaving":"")} style={{position:"absolute",inset:0,overflow:"hidden",zIndex:10}}>
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
                  <span style={{color:"rgba(215,183,64,.68)",fontFamily:"monospace",fontSize:"var(--fs-review-label)",letterSpacing:".03em"}}>{item.label}</span>
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
                  <span style={{color:"rgba(215,183,64,.68)",fontFamily:"monospace",fontSize:"var(--fs-review-label-md)",letterSpacing:".03em"}}>{item.label}</span>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:6}}>
                    <span style={{color:"rgba(255,255,255,.9)",fontFamily:"var(--fb)",fontSize:"var(--fs-review-val-md)",lineHeight:1.25,overflow:"visible",whiteSpace:"normal",flex:"1 1 auto",minWidth:0}} title={item.val}>{item.short||item.val}</span>
                    <button className="no-print review-edit-btn" onClick={()=>jumpToStep(item.step)} style={{flex:"0 0 auto",fontSize:"var(--fs-review-edit-md)",padding:"4px 7px"}}>EDIT</button>
                  </div>
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
                  if(pricingSubStep<subSteps.length-1)setPricingSubStep(s=>s+1);
                  else setPricingFlow('result');
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
                      <div style={{fontSize:isAtticMode?13:14.5,fontWeight:600,marginBottom:4,fontFamily:"var(--ft)"}}>How many separate HVAC systems does your home have?</div>
                      <div style={{fontSize:isAtticMode?10.5:12,color:"var(--mut)",lineHeight:isAtticMode?1.3:1.5}}>This is typically the number of thermostats you have, or the number of outdoor condenser units.</div>
                    </>}
                    {subId==='sqft'&&<>
                      <div style={{fontSize:isAtticMode?13:14.5,fontWeight:600,marginBottom:isAtticMode?2:4,lineHeight:isAtticMode?1.15:"normal",fontFamily:"var(--ft)"}}>{pricingAnswers.systemsCount==='1'?'What size system does this home need?':'What size system is needed for this part of your home?'}</div>
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
                    {subId==='ducts'&&<div style={{fontSize:isAtticMode?13:14.5,fontWeight:600,fontFamily:"var(--ft)"}}>Want duct replacement priced too?</div>}
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
                return <div style={{border:"1px solid rgba(215,183,64,.2)",padding:isAtticMode?"8px 12px":12}}>
                  <div style={{fontSize:isAtticMode?9:10.5,color:"rgba(215,183,64,.5)",letterSpacing:".1em",marginBottom:isAtticMode?4:8,fontFamily:"var(--fm)"}}>PRICING · STEP {pricingSubStep+1} OF {subSteps.length}</div>

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

              {pricingFlow==='result'&&(()=>{
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
              })()}
            </div>}

            {/* ── QUICK ACTIONS - one compact button grid instead of five
                 stacked full-width rows, so this panel stays low and the
                 diagram keeps the room ── */}
            {pricingFlow===null&&<button className="btn-next" style={{flex:"none",margin:0,width:"100%",marginBottom:6,padding:"12px",fontSize:16}} onClick={()=>{setPricingFlow('sizing');setPricingSubStep(0);}}>💰 Get Pricing</button>}
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
              <a href="https://wisetack.us/#/hyhu11w/prequalify" target="_blank" rel="noopener" className="quick-financing-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",fontFamily:"monospace",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",textDecoration:"none",textAlign:"center",boxSizing:"border-box"}}>💳 Financing</a>
              <button onClick={()=>window.print()} className="quick-print-btn" style={{width:"100%",fontFamily:"monospace",fontSize:"var(--fs-restart)",padding:"9px 8px",cursor:"pointer",letterSpacing:".08em"}}>⬇ Save / Print</button>
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
