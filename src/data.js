// ─── STEPS ──────────────────────────────────────────────────────
// Chapters turn a flat "step 4 of 9" into a story with acts - each step
// carries which act it belongs to, and the progress bar (built below)
// renders as named, segmented chapters instead of one anonymous sliver.
export const CHAPTERS=['THE BASICS','THE ENGINE','COMFORT','FINAL TOUCHES'];
export const STEPS=[
  {id:'location',    q:"Where's your indoor unit?", chapter:0,
    hint:'Sets the layout of your whole system.',        optional:false},
  {id:'indoor_type', q:'What Type of Indoor Unit?', chapter:0,
    hint:'Furnace or air handler?\nFurnace = Gas Heat.\nAir Handler = All-Electric.', optional:false},
  {id:'insulation',  q:'Fiberglass or spray foam?', chapter:0,
    hint:'Determines your furnace efficiency.', optional:false,
    showIf:a=>a.indoor_type==='furnace'},
  {id:'plenum',      q:'New supply plenum needed?', chapter:1,
    hint:'Feeds conditioned air to your ductwork.', optional:false},
  {id:'cond_tier',   q:'Pick your efficiency tier.', chapter:1,
    hint:'Higher efficiency, lower monthly bills.', optional:false},
  {id:'system_for',  q:'Heat pump or straight cool?', chapter:1,
    hint:'Heat pump does more; AC only cools.', optional:false,
    // Mid efficiency only comes as dual fuel - nothing to actually choose,
    // so skip the step entirely instead of showing a single-card question.
    showIf:a=>a.indoor_type==='furnace'&&a.cond_tier!=='mid_ge15'},
  {id:'thermostat',  q:'Which thermostat?', chapter:2,
    hint:'Wi-Fi models save 10–15% on your bill.',            optional:false},
  {id:'purif',       q:'Any add-ons?', chapter:2,
    hint:'Filtration ships standard; add more here.',optional:true, multi:true},
  {id:'dehu',        q:'Add a dehumidifier?', chapter:2,
    hint:"Runs on its own; no buckets to empty.", optional:false},
  {id:'extras',      q:'Any final add-ons?', chapter:3,
    hint:'Condensate pump or ERV fresh-air system.', optional:true, multi:true},
];

// Auto-derive furnace_eff from insulation - never ask separately
export function deriveFurnaceEff(insulation){
  return insulation==='spray'?'e90':'e80';
}

// ─── OPTION DEFS ────────────────────────────────────────────────
export function getOpts(stepId, answers){
  switch(stepId){
    case 'location':return[
      {v:'attic', label:'Attic',          desc:'Horizontal install, the most common setup in Austin attics.'},
      {v:'closet',label:'Closet',desc:'Upflow unit in a hallway or utility closet.'},
    ];
    case 'indoor_type':return[
      {v:'furnace',label:'Furnace - Gas Heat',      desc:'Most common in Austin'},
      {v:'ah',     label:'Air Handler - All Electric', desc:'Auxiliary heat installed'},
    ];
    case 'insulation':return[
      {v:'fiberglass',label:'Fiberglass batts / blown',desc:'Vented attic - pairs with an 80% AFUE furnace. Most Austin homes have this.'},
      {v:'spray',     label:'Spray foam',               desc:'Sealed attic - needs a 90% AFUE furnace with a PVC flue. Cooler, more efficient.'},
    ];
    case 'plenum':return[
      {v:'ductboard',label:'Ductboard plenum',  desc:'Standard choice, good insulation. Typical lifespan 10–15 years.'},
      {v:'metal',    label:'Sheet metal plenum',desc:'More durable, lasts 25+ years, better for indoor air quality.'},
      {v:'none',     label:'Keep existing plenum', desc:'Good condition already - we connect directly, saving on labor.'},
    ];
    case 'thermostat':
      if(answers.cond_tier==='high_ge18')return[
        {v:'proprietary',label:'Communicating Thermostat', desc:'Required at this tier for precise staging and full diagnostics.'},
      ];
      return[
      {v:'basic',label:'Basic Programmable', desc:'Reliable, no app or subscription. Set your schedule and it runs.'},
      {v:'wifi', label:'Wi-Fi Smart',   desc:'Control from your phone, learns your habits. Saves 10–15% on bills.',badge:true},
    ];
    case 'purif':return[
      // Enhanced Filtration Cabinet isn't listed - it's automatic on every
      // system (see defaultAnswers), not a real choice to present.
      {v:'uv',       label:'UV Light System',    desc:'Keeps the evaporator coil clean for lasting efficiency.'},
      {v:'ionizer',  label:'Ionizer / Plasma',   desc:'Neutralizes airborne particles, odors, and VOCs in your ducts.'},
      {v:'surge',    label:'Surge Protector',    desc:'Shields the compressor from voltage spikes and lightning.'},
    ];
    case 'system_for':
      if(answers.cond_tier==='mid_ge15')return[
        {v:'hp', label:'Dual Fuel (Heat pump + furnace)', desc:'Mid efficiency is dual fuel only - heat pump to ~35°F, then the furnace takes over.'},
      ];
      return[
      {v:'hp', label:'Dual Fuel (Heat pump + furnace)', desc:'Heat pump handles most of the year, down to ~35°F. Furnace covers the rest.'},
      {v:'sc', label:'Straight Cool',        desc:'AC cools only - furnace handles all heating. Simpler, lower upfront cost.'},
    ];
    case 'cond_tier':{
      return[
        {v:'fedmin',   label:'Federal Minimum - 14 SEER2', desc:'Meets 2023 federal energy code. 12-yr manufacturer warranty.'},
        {v:'mid_ge15', label:'Mid Efficiency - 18 SEER2',  desc:'Variable-speed, better humidity control. 12-yr manufacturer warranty.'},
        {v:'high_ge18',label:'High Efficiency - 21 SEER2', desc:'Inverter-driven top tier. 10-yr manufacturer warranty.'},
      ];
    }
    case 'dehu':return[
      {v:'yes',label:'Yes - add it',  desc:'Sized to your square footage, runs automatically. No maintenance.'},
      {v:'no', label:'No thanks',     desc:'Skip for now - easy to add later if humidity becomes an issue.'},
    ];
    case 'extras':return[
      {v:'condensate',label:'Condensate Pump',        desc:'Needed with no gravity drain nearby. Common in closet installs.'},
      {v:'erv',       label:'ERV (Energy Recovery)',  desc:'Fresh filtered air in, stale air out, recovering most of the energy.'},
    ];
    default:return[];
  }
}

// ─── SPANISH TRANSLATIONS (wizard content only) ────────────────
// Scoped deliberately: covers the splash screen, every step's question/
// hint/options, info panels, nav/CTA copy, the done-screen review grid,
// and the pricing flow - everything a homeowner reads while going
// through the build. NOT translated: the live SVG diagram's own
// technical zone labels (canvas.js - hundreds of fixed-width schematic
// labels like "RETURN PLENUM"/"A-COIL", built for a fixed layout, not
// meant to carry translated text; a Spanish speaker cares about the
// questions and the price, not the wiring-diagram labels) and the
// long-form ductwork "considerations" education block on the result
// screen (supplementary, not part of the core flow). Same kind of
// scoping call as leaving the diagram out of print output.
// Overlaid onto the English STEPS/getOpts output at render time (see
// the `lang` handling in app.js) rather than a parallel English dict,
// so there's exactly one source of truth for English and no risk of the
// two drifting apart - only the Spanish override needs to exist here.
export const CHAPTERS_ES=['LO BÁSICO','EL MOTOR','CONFORT','TOQUES FINALES'];
export const STEPS_ES={
  location:   {q:'¿Dónde está su unidad interior?',      hint:'Define el diseño de todo su sistema.'},
  indoor_type:{q:'¿Qué tipo de unidad interior?',          hint:'¿Horno o manejador de aire?\nHorno = Calefacción a gas.\nManejador de aire = Todo eléctrico.'},
  insulation: {q:'¿Fibra de vidrio o espuma aislante?',    hint:'Determina la eficiencia de su horno.'},
  plenum:     {q:'¿Necesita un plenum de suministro nuevo?', hint:'Alimenta aire acondicionado a sus ductos.'},
  cond_tier:  {q:'Elija su nivel de eficiencia.',          hint:'Mayor eficiencia, facturas mensuales más bajas.'},
  system_for: {q:'¿Bomba de calor o solo enfriamiento?',   hint:'La bomba de calor hace más; el A/C solo enfría.'},
  thermostat: {q:'¿Qué termostato?',                       hint:'Los modelos Wi-Fi ahorran 10–15% en su factura.'},
  purif:      {q:'¿Algún complemento?',                    hint:'La filtración viene incluida; agregue más aquí.'},
  dehu:       {q:'¿Agregar un deshumidificador?',          hint:'Funciona solo; sin cubetas que vaciar.'},
  extras:     {q:'¿Complementos finales?',                 hint:'Bomba de condensado o sistema de aire fresco ERV.'},
};
export const OPTS_ES={
  location:{
    attic: {label:'Ático',  desc:'Instalación horizontal, la más común en los áticos de Austin.'},
    closet:{label:'Clóset', desc:'Unidad de flujo ascendente en un pasillo o clóset de servicio.'},
  },
  indoor_type:{
    furnace:{label:'Horno - Calefacción a gas',           desc:'Lo más común en Austin'},
    ah:     {label:'Manejador de Aire - Todo eléctrico',  desc:'Con calefacción auxiliar instalada'},
  },
  insulation:{
    fiberglass:{label:'Fibra de vidrio',   desc:'Ático ventilado - se combina con un horno de 80% AFUE. La mayoría de las casas en Austin lo tienen.'},
    spray:     {label:'Espuma aislante',   desc:'Ático sellado - requiere un horno de 90% AFUE con chimenea de PVC. Más fresco y eficiente.'},
  },
  plenum:{
    ductboard:{label:'Plenum de ductboard',        desc:'Opción estándar, buen aislamiento. Vida útil típica de 10–15 años.'},
    metal:    {label:'Plenum de lámina metálica',  desc:'Más duradero, dura 25+ años, mejor para la calidad del aire interior.'},
    none:     {label:'Conservar el plenum actual', desc:'Ya está en buen estado - conectamos directamente, ahorrando en mano de obra.'},
  },
  thermostat:{
    proprietary:{label:'Termostato Comunicante',  desc:'Requerido en este nivel para una gradación precisa y diagnósticos completos.'},
    basic:      {label:'Programable Básico',      desc:'Confiable, sin app ni suscripción. Configure su horario y listo.'},
    wifi:       {label:'Inteligente Wi-Fi',       desc:'Contrólelo desde su teléfono, aprende sus hábitos. Ahorra 10–15% en su factura.'},
  },
  purif:{
    uv:     {label:'Sistema de Luz UV',          desc:'Mantiene limpio el serpentín evaporador para una eficiencia duradera.'},
    ionizer:{label:'Ionizador / Plasma',         desc:'Neutraliza partículas, olores y COV en el aire de sus ductos.'},
    surge:  {label:'Protector de Sobrevoltaje',  desc:'Protege el compresor de picos de voltaje y rayos.'},
  },
  system_for:{
    hp:{label:'Combustible Dual (Bomba de calor + horno)', desc:'La bomba de calor cubre la mayor parte del año, hasta ~35°F. El horno se encarga del resto.'},
    sc:{label:'Solo Enfriamiento',                          desc:'El A/C solo enfría - el horno se encarga de toda la calefacción. Más simple, menor costo inicial.'},
  },
  cond_tier:{
    fedmin:   {label:'Mínimo Federal - 14 SEER2',  desc:'Cumple con el código energético federal de 2023. Garantía de fábrica de 12 años.'},
    mid_ge15: {label:'Eficiencia Media - 18 SEER2', desc:'Velocidad variable, mejor control de humedad. Garantía de fábrica de 12 años.'},
    high_ge18:{label:'Alta Eficiencia - 21 SEER2',  desc:'Nivel superior con tecnología Inverter. Garantía de fábrica de 10 años.'},
  },
  dehu:{
    yes:{label:'Sí, agregarlo', desc:'Dimensionado a sus pies cuadrados, funciona automáticamente. Sin mantenimiento.'},
    no: {label:'No, gracias',   desc:'Omitir por ahora - fácil de agregar después si la humedad se vuelve un problema.'},
  },
  extras:{
    condensate:{label:'Bomba de Condensado',            desc:'Necesaria cuando no hay un drenaje por gravedad cerca. Común en instalaciones de clóset.'},
    erv:       {label:'ERV (Recuperación de Energía)',  desc:'Aire fresco filtrado entra, aire viciado sale, recuperando la mayor parte de la energía.'},
  },
};

// ─── PRICING DATA ───────────────────────────────────────────────
// Not wired into any UI yet - pure data, captured as it's confirmed so the
// schema only gets designed once. Whole dollars, complete installed bundle.
export const PRICING={
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
  // Every system already ships with its manufacturer warranty (12 years
  // on Federal Minimum/Mid Efficiency, 10 on High Efficiency - see the
  // tier descriptions in getOpts). This is the optional EXTENDED labor
  // warranty, offered as a flat add-on at the end of pricing rather than
  // its own wizard question.
  laborWarranty10yr:1750,
  // DRAFT PLACEHOLDER - price and plan structure are a starting draft, not
  // confirmed numbers. First-year price + what's included below both need
  // real figures before this ships live; swap them here, nothing else to
  // change. $199/yr and the two-tune-up structure are typical of the
  // industry, not anything GES-specific.
  maintenancePlanAnnual:199,
};

// ─── PRICING CALCULATION ────────────────────────────────────────
// Tonnage is picked directly by the homeowner/rep rather than inferred
// silently from a sq ft range - a hard sq ft cutoff was pushing borderline
// homes (e.g. ~1,000 sq ft) down to a smaller tonnage than Texas heat load
// really wants. Each option still shows its reference sq ft (~600 sq ft/ton)
// so the pick is guided, not a guess. sqftMid also drives dehu/ERV sizing.
export const TONNAGE_OPTIONS=[
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
export function nearestTonnageOption(sqft){
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
// ─── ANALYTICS ──────────────────────────────────────────────────
// Fires custom events through whatever site-wide GA4 (gtag.js) / Meta
// Pixel (fbq) install already exists - this file never loads its own
// gtag.js/fbq snippet, since a second copy would double-count pageviews
// and need its own hardcoded Measurement ID/Pixel ID baked into this
// file. This widget runs as an iframe embed (see GATE_CONFIG's comment
// below), so the real tracking snippets almost always live on the PARENT
// WordPress page's document, not this one - gtag/fbq is checked on
// window.parent FIRST (same-origin access, exactly like the lead-gate
// detection below), falling back to this document's own window only if
// that's unavailable (cross-origin, or a future non-iframe embed). A
// cross-origin embed gets neither and needs the same kind of small
// postMessage relay snippet as the lead gate - see the
// GES_ANALYTICS_RELAY comment further down for that one-time WordPress-
// side addition. Every call below is a silent no-op until a real gtag/fbq
// is actually reachable, so this is safe to ship now and starts working
// automatically once found - no code change needed at that point.
function reachTracker(name){
  try{
    if(window.parent&&window.parent!==window&&typeof window.parent[name]==='function')return window.parent[name];
  }catch(e){/* cross-origin - window.parent access throws */}
  if(typeof window[name]==='function')return window[name];
  return null;
}
// Cross-origin fallback: relays the same payload via postMessage so a
// WordPress-side snippet (added once, not part of this repo) can fire it
// against the parent page's own gtag/fbq. No-ops harmlessly if nothing on
// the other end is listening yet - safe to always send.
// GES_ANALYTICS_RELAY - add this once in a Script/Custom HTML block on the
// same WordPress page as this widget's iframe:
//   window.addEventListener('message', function(e){
//     if(!e.data || e.data.gesAnalytics === undefined) return;
//     var m = e.data.gesAnalytics;
//     if(m.kind === 'event' && typeof gtag === 'function') gtag('event', m.name, m.params);
//     if(m.kind === 'event' && typeof fbq === 'function') fbq('trackCustom', m.name, m.params);
//     if(m.kind === 'lead' && typeof gtag === 'function') gtag('event', 'generate_lead', m.params);
//     if(m.kind === 'lead' && typeof fbq === 'function') fbq('track', 'Lead', m.params);
//   });
function relayToParent(msg){
  try{
    if(window.parent&&window.parent!==window)window.parent.postMessage({gesAnalytics:msg},'*');
  }catch(e){/* analytics must never break the build flow */}
}
export function trackEvent(eventName,params={}){
  try{
    const gtag=reachTracker('gtag');
    if(gtag)gtag('event',eventName,{event_category:'System Builder',...params});
    const fbq=reachTracker('fbq');
    if(fbq)fbq('trackCustom',eventName,params);
    if(!gtag&&!fbq)relayToParent({kind:'event',name:eventName,params:{event_category:'System Builder',...params}});
  }catch(e){/* analytics must never break the build flow */}
}
// Contact-form submission fires as GA4's and Meta's own recommended/
// standard lead events (generate_lead / Lead) instead of a custom name -
// both platforms treat these specifically as conversion signals and can
// optimize ad delivery or build retargeting audiences around them, which
// a custom event name can't do.
export function trackLead(params={}){
  try{
    const gtag=reachTracker('gtag');
    if(gtag)gtag('event','generate_lead',{event_category:'System Builder',...params});
    const fbq=reachTracker('fbq');
    if(fbq)fbq('track','Lead',params);
    if(!gtag&&!fbq)relayToParent({kind:'lead',params:{event_category:'System Builder',...params}});
  }catch(e){/* analytics must never break the build flow */}
}
export function trackBuildCompleted(answers){
  trackEvent('build_completed',{
    indoor_type:answers.indoor_type||'',
    efficiency_tier:answers.cond_tier||'',
  });
}

// ─── FINANCING OPTIONS ──────────────────────────────────────────
// Shown as one button per entry with a real url - Wells Fargo is left
// blank until its actual application/enrollment link is provided, so it
// simply doesn't render a button yet (no placeholder/broken link goes
// live). Add the url and it appears automatically, no other code change
// needed.
export const FINANCING_OPTIONS=[
  {key:'wisetack',label:'Wisetack',url:'https://wisetack.us/#/hyhu11w/prequalify'},
  {key:'wellsfargo',label:'Wells Fargo',url:''},
];

// ─── CONTACT-FORM GATE ──────────────────────────────────────────
// Gates the "Get Pricing" button behind a Gravity Forms submission -
// right where the button is clicked, before the sizing sub-questions
// even start. gravityFormId at 0/falsy means the gate is fully disabled
// - "Get Pricing" works exactly as it does today, straight through to the
// estimate. Flip this on once the Gravity Forms form is live on the
// WordPress page and you have its numeric form ID (shown in its row
// under Forms in wp-admin). See the gate detection logic and the
// required WordPress-side snippet in src/app.js, right where this is
// imported and used.
export const GATE_CONFIG={
  gravityFormId:0,
};
const TIER_LABEL={fedmin:'Federal Minimum - 14 SEER2',mid_ge15:'Mid Efficiency - 18 SEER2',high_ge18:'High Efficiency - 21 SEER2'};
// Returns null if this tier/system-type combo has no pricing (shouldn't happen
// given the wizard's own filtering, but guards against stale/edge-case answers).
export function calcEstimate(answers,pricingAnswers){
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
  // Extended labor warranty - a checkbox on the result screen, not a
  // wizard question (see the comment on PRICING.laborWarranty10yr above).
  if(pricingAnswers.wantLaborWarranty){
    lines.push({label:'10-year labor warranty',price:PRICING.laborWarranty10yr});
  }
  // Annual maintenance plan - same treatment (see the DRAFT PLACEHOLDER
  // comment on PRICING.maintenancePlanAnnual above).
  if(pricingAnswers.wantMaintenancePlan){
    lines.push({label:'Annual maintenance plan (1st year)',price:PRICING.maintenancePlanAnnual});
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
