// © Gold Eagle Services, Austin, TX. All rights reserved. Proprietary
// software - see the notice at the top of src/index.template.html and
// the copyright block in index.html's own source for the full terms.
// GES-HVAC-CONFIGURATOR-PROVENANCE-ID: ges-live-system-2026-austin-tx

// ─── STEPS ──────────────────────────────────────────────────────
// Chapters turn a flat "step 4 of 9" into a story with acts - each step
// carries which act it belongs to, and the progress bar (built below)
// renders as named, segmented chapters instead of one anonymous sliver.
// "FINAL TOUCHES" (a 4th chapter) used to exist here for the standalone
// "extras" step (condensate pump/ERV) - dropped along with condensate
// pump itself (direct feedback: "getting rid of it... cleans up a few
// things"), since ERV folded into the "dehu" step below (now "Want to
// enhance your IAQ?") leaves nothing left to put in a 4th chapter.
export const CHAPTERS=['THE BASICS','THE ENGINE','COMFORT'];
export const STEPS=[
  {id:'location',    q:"Where's your indoor unit?", chapter:0,
    hint:'Sets the layout of your whole system.',        optional:false},
  {id:'indoor_type', q:'What Type of Indoor Unit?', chapter:0,
    hint:'Furnace or air handler?\nFurnace = Gas Heat.\nAir Handler = All-Electric.', optional:false},
  {id:'insulation',  q:'Fiberglass or spray foam?', chapter:0,
    hint:"Determines your attic's construction - and furnace efficiency, if you have one.", optional:false},
  {id:'plenum',      q:'New supply plenum needed?', chapter:1,
    hint:'Feeds conditioned air to your ductwork.', optional:false},
  {id:'cond_tier',   q:'Pick your efficiency tier.', chapter:1,
    hint:'Higher efficiency, lower monthly bills.', optional:false},
  {id:'system_for',  q:'Dual fuel heat pump, or straight cool?', chapter:1,
    hint:'Heat pump does more; AC only cools.', optional:false,
    // Mid efficiency only comes as dual fuel - nothing to actually choose,
    // so skip the step entirely instead of showing a single-card question.
    showIf:a=>a.indoor_type==='furnace'&&a.cond_tier!=='mid_ge15'},
  {id:'thermostat',  q:'Which thermostat?', chapter:2,
    hint:'Wi-Fi models can help save 10–15% on your bill.',   optional:false},
  // QA FIX - a fresh-eyes UX pass caught this step and the very next one
  // ("dehu", "Want to enhance your indoor air quality?") reading as the
  // same question asked twice in a row, both under the same COMFORT
  // chapter header, both multi-select checkboxes. Renamed to name what
  // this one is actually about (UV/Ionizer = purification, Surge
  // Protector = electrical protection) - distinct from the next step's
  // humidity/fresh-air framing (dehumidifier/ERV) - rather than merging
  // the two steps, which would touch calcEstimate/the review grid/
  // Spanish translations/step-count numbering all at once for a copy-
  // level confusion.
  {id:'purif',       q:'Any purification or protection add-ons?', chapter:2,
    hint:'Filtration ships standard; add more here.',optional:true, multi:true},
  // Merged with the old standalone "extras" step (condensate pump/ERV) -
  // condensate pump was dropped entirely (direct feedback: "getting rid
  // of it... cleans up a few things"), which left ERV as the only thing
  // in that step. Folding it in here instead of keeping a step with one
  // lonely option: same multi-select pattern as purif above.
  {id:'dehu',        q:'Want to enhance your indoor air quality?', chapter:2,
    hint:'Whole-home dehumidifier, ERV fresh-air system, or both.', optional:true, multi:true},
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
      {v:'ah',     label:'Air Handler - All Electric', desc:'Includes electric auxiliary heat'},
    ];
    case 'insulation':{
      // Insulation is asked regardless of indoor_type - it's a property of
      // the attic itself, not the furnace (the diagram's roofline/texture
      // reads off it either way, see a.insulation in canvas.js) - but the
      // AFUE/flue detail below is only true for furnace systems, so it
      // drops out entirely for an air handler instead of describing
      // equipment that build doesn't have.
      const isFurnace=answers.indoor_type==='furnace';
      return[
        {v:'fiberglass',label:'Fiberglass batts / blown',
          desc:isFurnace?'Vented attic - pairs with an 80% AFUE furnace. Most Austin homes have this.':'Vented attic - most Austin homes have this.'},
        {v:'spray',     label:'Spray foam',
          desc:isFurnace?'Sealed attic - needs a 90% AFUE furnace with a PVC flue. Cooler, more efficient.':'Sealed attic - cooler, more efficient.'},
      ];
    }
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
      {v:'wifi', label:'Wi-Fi Smart',   desc:'Control from your phone, learns your habits. Can help save 10–15% on bills.',badge:true},
    ];
    case 'purif':return[
      // Enhanced Filtration Cabinet isn't listed - it's automatic on every
      // system (see defaultAnswers), not a real choice to present.
      {v:'uv',       label:'UV Light System',    desc:'Keeps the evaporator coil clean for lasting efficiency.'},
      // QA FIX - used to say "neutralizes... VOCs," a chemical-destruction
      // claim that contradicted the diagram's own ionizer tooltip (which
      // correctly describes charged-particle filtration, not neutralization)
      // and overstated what bipolar/needlepoint ionization is actually
      // established to do - aligned on the filtration mechanism everywhere.
      {v:'ionizer',  label:'Ionizer / Plasma',   desc:'Charges airborne particles and odors so your filter catches more of them.'},
      {v:'surge',    label:'Surge Protector',    desc:'Helps protect the compressor from voltage spikes and nearby lightning strikes.'},
    ];
    // No mid_ge15 branch here - the system_for STEP itself is hidden for
    // mid_ge15 (see its showIf above, which forces 'hp' directly instead),
    // so getOpts is never actually called for this id while cond_tier is
    // mid_ge15. A conditional single-option branch used to sit here anyway
    // and was pure dead code.
    case 'system_for':return[
      {v:'hp', label:'Dual Fuel (Heat pump + furnace)', desc:'Heat pump handles most of the year, down to ~35°F. Furnace covers the rest.'},
      {v:'sc', label:'Straight Cool',        desc:'AC cools only - furnace handles all heating. Simpler, lower upfront cost.'},
    ];
    case 'cond_tier':{
      // QA FIX - "14 SEER2" was off: the 2023 DOE South-region minimum this
      // tier is actually built to is 14.3 SEER2 for most residential sizes
      // (13.8 for 4.5+ ton systems) - relabeled to the number that actually
      // applies, since this tier's whole pitch is "meets code."
      // Humidity-control claim used to only appear on Mid's card, while the
      // step's own info panel separately claimed High has "the best"
      // humidity control - a homeowner skimming just the cards would've
      // concluded the opposite of what the info panel said. Both cards now
      // carry it, worded so they don't compete for the same claim, and
      // High's copy explains inverter-driven as the more precise form of
      // variable-speed rather than an unrelated feature.
      return[
        {v:'fedmin',   label:'Federal Minimum - 14.3 SEER2', desc:'Meets 2023 federal energy code.'},
        {v:'mid_ge15', label:'Mid Efficiency - 18 SEER2',  desc:'Variable-speed - better humidity control than Federal Minimum. Uses roughly 20% less energy to cool the same home.'},
        {v:'high_ge18',label:'High Efficiency - 21 SEER2', desc:'Inverter-driven (full modulation) - our best humidity control. Uses roughly 30% less energy than Federal Minimum.'},
      ];
    }
    case 'dehu':return[
      {v:'dehu',label:'Whole-Home Dehumidifier', desc:'Sized to your square footage, runs automatically - just an occasional filter check, no buckets to empty.'},
      {v:'erv', label:'ERV (Energy Recovery)',   desc:'Fresh filtered air in, stale air out, recovering most of the energy.'},
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
export const CHAPTERS_ES=['LO BÁSICO','EL MOTOR','CONFORT'];
export const STEPS_ES={
  location:   {q:'¿Dónde está su unidad interior?',      hint:'Define el diseño de todo su sistema.'},
  indoor_type:{q:'¿Qué tipo de unidad interior?',          hint:'¿Horno o manejador de aire?\nHorno = Calefacción a gas.\nManejador de aire = Todo eléctrico.'},
  insulation: {q:'¿Fibra de vidrio o espuma aislante?',    hint:'Determina la construcción de su ático - y la eficiencia de su horno, si tiene uno.'},
  plenum:     {q:'¿Necesita un plenum de suministro nuevo?', hint:'Envía aire acondicionado a sus ductos.'},
  cond_tier:  {q:'Elija su nivel de eficiencia.',          hint:'Mayor eficiencia, facturas mensuales más bajas.'},
  system_for: {q:'¿Bomba de calor de combustible dual, o solo enfriamiento?', hint:'La bomba de calor hace más; el A/C solo enfría.'},
  thermostat: {q:'¿Qué termostato?',                       hint:'Los modelos Wi-Fi pueden ahorrar 10–15% en su factura.'},
  purif:      {q:'¿Algún complemento de purificación o protección?', hint:'La filtración viene incluida; agregue más aquí.'},
  dehu:       {q:'¿Quiere mejorar la calidad del aire interior?', hint:'Deshumidificador para toda la casa, sistema ERV de aire fresco, o ambos.'},
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
  // insulation's own desc varies by indoor_type (see getOpts' matching
  // English case) - a function here instead of the plain {label,desc}
  // shape every other step uses, resolved against the live answers by
  // the opts useMemo in app.js right where it merges this override in.
  insulation:{
    fiberglass:a=>({label:'Fibra de vidrio',
      desc:a.indoor_type==='furnace'?'Ático ventilado - se combina con un horno de 80% AFUE. La mayoría de las casas en Austin lo tienen.':'Ático ventilado - la mayoría de las casas en Austin lo tienen.'}),
    spray:a=>({label:'Espuma aislante',
      desc:a.indoor_type==='furnace'?'Ático sellado - requiere un horno de 90% AFUE con chimenea de PVC. Más fresco y eficiente.':'Ático sellado - más fresco y eficiente.'}),
  },
  plenum:{
    ductboard:{label:'Plenum de ductboard',        desc:'Opción estándar, buen aislamiento. Vida útil típica de 10–15 años.'},
    metal:    {label:'Plenum de lámina metálica',  desc:'Más duradero, dura 25+ años, mejor para la calidad del aire interior.'},
    none:     {label:'Conservar el plenum actual', desc:'Ya está en buen estado - conectamos directamente, ahorrando en mano de obra.'},
  },
  thermostat:{
    proprietary:{label:'Termostato Comunicante',  desc:'Requerido en este nivel para un control por etapas preciso y diagnósticos completos.'},
    basic:      {label:'Programable Básico',      desc:'Confiable, sin app ni suscripción. Configure su horario y listo.'},
    wifi:       {label:'Inteligente Wi-Fi',       desc:'Contrólelo desde su teléfono, aprende sus hábitos. Puede ahorrar 10–15% en su factura.'},
  },
  purif:{
    uv:     {label:'Sistema de Luz UV',          desc:'Mantiene limpio el serpentín evaporador para una eficiencia duradera.'},
    ionizer:{label:'Ionizador / Plasma',         desc:'Carga las partículas y olores en el aire para que su filtro atrape más.'},
    surge:  {label:'Protector de Sobrevoltaje',  desc:'Ayuda a proteger el compresor de picos de voltaje y rayos cercanos.'},
  },
  system_for:{
    hp:{label:'Combustible Dual (Bomba de calor + horno)', desc:'La bomba de calor cubre la mayor parte del año, hasta ~35°F. El horno se encarga del resto.'},
    sc:{label:'Solo Enfriamiento',                          desc:'El A/C solo enfría - el horno se encarga de toda la calefacción. Más simple, menor costo inicial.'},
  },
  cond_tier:{
    fedmin:   {label:'Mínimo Federal - 14.3 SEER2',  desc:'Cumple con el código energético federal de 2023.'},
    mid_ge15: {label:'Eficiencia Media - 18 SEER2', desc:'Velocidad variable - mejor control de humedad que el Mínimo Federal. Usa aproximadamente 20% menos energía para enfriar la misma casa.'},
    high_ge18:{label:'Alta Eficiencia - 21 SEER2',  desc:'Tecnología Inverter (modulación total) - nuestro mejor control de humedad. Usa aproximadamente 30% menos energía que el Mínimo Federal.'},
  },
  dehu:{
    dehu:{label:'Deshumidificador para Toda la Casa', desc:'Calculado según el tamaño de su casa, funciona automáticamente - solo requiere revisar el filtro ocasionalmente, sin cubetas que vaciar.'},
    erv: {label:'ERV (Recuperación de Energía)',       desc:'Aire fresco filtrado entra, aire viciado sale, recuperando la mayor parte de la energía.'},
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
  // Condensate pump dropped entirely per direct feedback ("getting rid of
  // it") - was `condensate:882` here.
  extras:{surge:860, erv:{cfm130:5222, cfm150:5877}},
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
  // Every system already ships with a 10-year manufacturer warranty,
  // flat across all tiers. This is the optional EXTENDED labor warranty,
  // offered as a flat add-on at the end of pricing rather than its own
  // wizard question.
  laborWarranty10yr:1750,
  // $177 covers one system; each additional system on the same visit adds
  // a flat $100 rather than a second full $177 (shared truck roll/tech
  // time). Direct feedback - most customers only have one, but multi-unit
  // homes shouldn't pay full price twice.
  maintenancePlanAnnual:177,
  maintenancePlanAdditionalSystem:100,
};

// ─── PRICING CALCULATION ────────────────────────────────────────
// Tonnage is picked directly by the homeowner/rep rather than inferred
// silently from a sq ft range - a hard sq ft cutoff was pushing borderline
// homes (e.g. ~1,000 sq ft) down to a smaller tonnage than Texas heat load
// really wants. Each option still shows its reference sq ft (~600 sq ft/ton)
// so the pick is guided, not a guess. sqftMid also drives dehu/ERV sizing.
// labelEs/sqftLabelEs are the Spanish counterparts to label/sqftLabel - a QA
// pass caught the tonnage picker (app.js's sizing sub-step) rendering both
// of these raw/English-only even under the Spanish toggle, since this array
// (unlike STEPS/getOpts) had no *_ES override table at all.
export const TONNAGE_OPTIONS=[
  {v:'t15', label:'1.5 Tons', labelEs:'1.5 Toneladas', sqftLabel:'~900 sq ft',   sqftLabelEs:'~900 pies²',   tons:1.5, sqftMid:900},
  {v:'t2',  label:'2 Tons',   labelEs:'2 Toneladas',   sqftLabel:'~1,200 sq ft', sqftLabelEs:'~1,200 pies²', tons:2,   sqftMid:1200},
  {v:'t25', label:'2.5 Tons', labelEs:'2.5 Toneladas', sqftLabel:'~1,500 sq ft', sqftLabelEs:'~1,500 pies²', tons:2.5, sqftMid:1500},
  {v:'t3',  label:'3 Tons',   labelEs:'3 Toneladas',   sqftLabel:'~1,800 sq ft', sqftLabelEs:'~1,800 pies²', tons:3,   sqftMid:1800},
  {v:'t35', label:'3.5 Tons', labelEs:'3.5 Toneladas', sqftLabel:'~2,100 sq ft', sqftLabelEs:'~2,100 pies²', tons:3.5, sqftMid:2100},
  {v:'t4',  label:'4 Tons',   labelEs:'4 Toneladas',   sqftLabel:'~2,400 sq ft', sqftLabelEs:'~2,400 pies²', tons:4,   sqftMid:2400},
  {v:'t5',  label:'5 Tons',   labelEs:'5 Toneladas',   sqftLabel:'3,000+ sq ft', sqftLabelEs:'3,000+ pies²', tons:5,   sqftMid:3600},
];
// Optional light-touch nudge: typing a sq ft doesn't lock anything in, it just
// suggests the closest tonnage option so the pick steers toward accuracy
// instead of a guess - still fully overridable by clicking any card. Takes
// an optional narrowed list (the sizing screen passes only the half-ton-free
// set for Mid/High Efficiency, which don't stock those sizes - see its own
// tonnageOptions comment) so the suggestion never points at a size that
// wouldn't even be offered as a card.
export function nearestTonnageOption(sqft,options=TONNAGE_OPTIONS){
  if(!sqft||sqft<=0)return null;
  return options.reduce((best,o)=>Math.abs(o.sqftMid-sqft)<Math.abs(best.sqftMid-sqft)?o:best);
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
// Shown as one button per entry with a real url - an entry with no url
// simply doesn't render a button (no placeholder/broken link goes live).
// Add an entry with its url and it appears automatically, no other code
// change needed.
// label is what the compact quick-actions button shows - "Financing"
// instead of the lender's own brand name, since most visitors don't
// recognize "Wisetack" on sight and a generic label reads clearer in a
// small button (the fuller "prequalify online with Wisetack" sentence
// elsewhere in the price reveal still names the actual partner, where
// there's room to explain it).
export const FINANCING_OPTIONS=[
  {key:'wisetack',label:'Financing',labelEs:'Financiamiento',url:'https://wisetack.us/#/hyhu11w/prequalify'},
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
// (Proprietary to Gold Eagle Services - GES-HVAC-CONFIGURATOR-PROVENANCE-ID: ges-live-system-2026-austin-tx)
export const GATE_CONFIG={
  gravityFormId:9,
  // QA FIX - direct feedback after real customers got stuck behind this
  // gate: the form used to live somewhere ELSE on the WordPress page
  // (below this widget's own embed), which meant a homeowner had to
  // notice it, scroll to find it, and submitting it depended on that
  // page's own Gravity Forms AJAX/confirmation settings staying correct
  // - a customer hit a real dead end when the confirmation wasn't in
  // AJAX mode. embedFormUrl points at a WordPress page containing ONLY
  // this Gravity Form, embedded directly in an <iframe> right here, so
  // the form is literally part of this widget - no separate page
  // element to find, no dependency on the outer WordPress page's own
  // AJAX/confirmation settings.
  //
  // Briefly turned this off after live feedback sounded like a broken
  // frame ("goes to a separate gravity form url... then it just goes
  // blank"), suspecting a clickjacking-protection script forcing the tab
  // out of the frame - direct follow-up feedback corrected that reading:
  // the form filled out and submitted fine (the office inbox got the
  // email), it just never advanced past the gate. The real cause: Form
  // 9's own Confirmation is set to "Redirect to a URL" (not a plain Text
  // confirmation), so submitting it navigates THIS iframe to a real new
  // page rather than swapping in Gravity Forms' own confirmation markup
  // - and the leadIframeRef detection effect in src/app.js only checked
  // for that markup appearing, never for the iframe's own location
  // changing. Fixed there (now also checks the iframe's own
  // ?ges_lead=1), so the embed is back on.
  //
  // DEPLOY CHECK - the redirect-confirmation detection above (the one
  // Form 9 actually relies on) needs same-origin access from wherever
  // THIS WIDGET itself is hosted into this embedFormUrl's iframe - that's
  // an exact origin match: scheme, host AND the "www." label all have to
  // agree (https://goldeagleservices.com and https://www.goldeagleservices.com,
  // or an http vs https copy of the same host, are different origins to
  // the browser even though they're "the same site" to a person). If
  // whatever URL this widget ends up embedded at doesn't exactly match
  // this origin, that access throws (caught - never crashes) and the
  // customer is stuck at the gate with no other way through: paths 1/2/3
  // above can't see this specific redirect (it lands inside THIS iframe,
  // not the top page or its parent - see the leadIframeRef comment
  // above), and there's no manual "I already submitted" fallback button
  // in the gate UI. Update this URL's scheme/host to match exactly if the
  // live WordPress domain differs (e.g. it canonicalizes to www or to
  // http), and spot-check the real embed once live: submit Form 9 for
  // real and confirm the gate actually advances.
  embedFormUrl:'https://goldeagleservices.com/build-your-system-submission-form/',
};
// The office inbox the "Send to Our Office" quick-action (result screen,
// src/app.js buildEmailHref) mailto:'s to, alongside the existing "Email
// a Copy to Yourself" button (blank recipient, same build content) - per
// direct feedback, the end of the build should let someone send it to
// GES AND keep a copy for themselves, not just one or the other. Same
// "ships hidden until configured" convention as GATE_CONFIG/
// FINANCING_OPTIONS above: blank means that button simply doesn't render.
export const OFFICE_EMAIL='sales@goldeagleservices.com';
const TIER_LABEL={fedmin:'Federal Minimum - 14.3 SEER2',mid_ge15:'Mid Efficiency - 18 SEER2',high_ge18:'High Efficiency - 21 SEER2'};
// Multi-vent discount for duct replacement (PRICING.duct.replacementPerStem)
// - direct feedback: "make it to where theres a discount the more you buy...
// once you hit 10 you get 1 free type of deal." Tiered per-vent discount
// (not compounding - the rate for the tier the total quantity lands in
// applies to every vent in the order), with a smaller discount kicking in
// earlier so bundling even a couple of vents into one visit is worth it
// before hitting 10. Originally written for the now-removed "new supply
// duct run" add-on (kept its own quantity cap of 10 for that reason) - per
// direct feedback duct replacement (which can run up to 20 vents) now
// reuses this exact same tier table instead of a second, driftable copy.
// Ordered highest-quantity-tier first so .find() below returns the first
// (highest) tier the count actually qualifies for.
const DUCT_VOLUME_DISCOUNT=[
  {min:10,rate:.10},
  {min:5, rate:.08},
  {min:2, rate:.05},
  {min:1, rate:0},
];
export function ductVolumeDiscountRate(count){
  const tier=DUCT_VOLUME_DISCOUNT.find(t=>count>=t.min);
  return tier?tier.rate:0;
}
// Returns null if this tier/system-type combo has no pricing (shouldn't happen
// given the wizard's own filtering, but guards against stale/edge-case answers).
// (Proprietary pricing logic - Gold Eagle Services, GES-HVAC-CONFIGURATOR-PROVENANCE-ID: ges-live-system-2026-austin-tx)
export function calcEstimate(answers,pricingAnswers){
  const tier=answers.cond_tier;
  const sysKey=systemTypeKey(answers);
  const tierPrices=PRICING.equipment[tier]&&PRICING.equipment[tier][sysKey];
  if(!tierPrices)return null;
  const picked=TONNAGE_OPTIONS.find(o=>o.v===pricingAnswers.tonnageChoice)||TONNAGE_OPTIONS[3];
  const tonnage=nearestTonnage(tierPrices,picked.tons);
  // Every line carries a `key` (+ whatever params its label is built from)
  // alongside the English `label` - the QA pass found these labels were
  // rendered raw and never translated under the Spanish toggle, since
  // they're generated here in data.js rather than written as literal JSX
  // text in app.js (where the tr() overlay lives). app.js's LINE_LABEL_ES
  // looks a line up by `key` and rebuilds the Spanish string from these
  // same params, rather than this file needing to know about languages at
  // all.
  const lines=[{key:'tonnage',tier,tonnage,label:`${tonnage}-ton system - ${TIER_LABEL[tier]||''}`,price:tierPrices[tonnage]}];

  if(answers.indoor_type==='furnace'&&answers.furnace_eff==='e90'){
    lines.push({key:'furnace90',label:'90% AFUE furnace upgrade',price:PRICING.furnace90Upgrade});
  }
  if(answers.plenum&&answers.plenum!=='none'){
    lines.push({key:'plenum',plenumType:answers.plenum,label:answers.plenum==='metal'?'Sheet metal plenum':'Ductboard plenum',price:PRICING.plenum[answers.plenum]});
  }
  const purifList=Array.isArray(answers.purif)?answers.purif:[];
  if(purifList.includes('uv'))lines.push({key:'uv',label:'UV Light System',price:PRICING.purif.uv});
  if(purifList.includes('ionizer'))lines.push({key:'ionizer',label:'Ionizer / Plasma',price:PRICING.purif.ionizer});
  if(purifList.includes('surge'))lines.push({key:'surge',label:'Surge Protector',price:PRICING.extras.surge});

  // dehu is the merged "Want to enhance your IAQ?" step now (dehumidifier
  // + ERV, condensate pump dropped entirely) - an array answer, same
  // shape as purifList above, not the old Yes/No string.
  const iaqList=Array.isArray(answers.dehu)?answers.dehu:[];
  if(iaqList.includes('dehu')){
    const cap=dehuCapacity(picked.sqftMid);
    lines.push({key:'dehu',dehuCap:cap.replace('p',''),label:`Whole-home dehumidifier (${cap.replace('p','')}pt)`,price:PRICING.dehu[cap]});
  }
  if(iaqList.includes('erv')){
    const cfmKey=ervCfmKey(picked.sqftMid);
    const cfmNum=cfmKey==='cfm130'?'130':'150';
    lines.push({key:'erv',ervCfm:cfmNum,label:`ERV (${cfmNum} CFM)`,price:PRICING.extras.erv[cfmKey]});
  }
  // QA FIX - the price-reveal panel's own vent-count input (app.js) clamps
  // to 1-20 on every keystroke, but that clamp lives ONLY there -
  // calcEstimate itself trusted pricingAnswers.ventCount
  // as-is. A build autosaved before that clamp existed (or any future
  // caller that sets pricingAnswers directly, e.g. a localStorage
  // restore) could still carry an unclamped value straight into the
  // headline total with no warning - the exact "typo'd vent count
  // silently producing a 6-figure estimate" failure mode the input-level
  // fix was written for, just reachable one layer lower. Re-clamping here
  // too means the estimate itself can never show more than a 20-vent
  // duct-replacement line, regardless of where ventCount came from. 20 is
  // the ceiling because that's about the most vents a single residential
  // system realistically serves - direct feedback after the pricing-math
  // sweep found a 40-vent max let a build combine a 1.5-ton system with a
  // $36,800 duct-replacement line, which doesn't reflect a real home.
  // QA FIX - per direct feedback, the separate "new supply duct run"
  // add-on (with its own quantity field/multi-run discount) was removed -
  // duct replacement now covers that same "get my ducts sorted" need on
  // its own, so it picked up the exact same volume-discount treatment
  // (ductVolumeDiscountRate, same tier table) that add-on used to have,
  // scaled by vent count instead of run count.
  const ventCount=Math.min(20,Math.max(0,pricingAnswers.ventCount||0));
  if(pricingAnswers.wantDucts&&ventCount>0){
    const ductDiscountRate=ductVolumeDiscountRate(ventCount);
    const ductPrice=ventCount*PRICING.duct.replacementPerStem*(1-ductDiscountRate);
    lines.push({key:'ductReplacement',ventCount,discountRate:ductDiscountRate,label:`Duct replacement (${ventCount} vent${ventCount===1?'':'s'})${ductDiscountRate>0?` - ${Math.round(ductDiscountRate*100)}% volume discount`:''}`,price:ductPrice});
  }
  // Extended labor warranty - a checkbox on the result screen, not a
  // wizard question (see the comment on PRICING.laborWarranty10yr above).
  if(pricingAnswers.wantLaborWarranty){
    lines.push({key:'laborWarranty',label:'10-year labor warranty',price:PRICING.laborWarranty10yr});
  }
  // Duct cleaning - same checkbox add-on treatment as the two above.
  // Previously just educational text in the "Additional Considerations"
  // block even though PRICING.duct.cleaning already had real prices for
  // it; per direct feedback that a-la-carte pattern (see labor warranty/
  // maintenance plan) is exactly what customers want here too. Priced by
  // this build's own tonnage, same lookup calcEstimate already does for
  // the base system price above.
  if(pricingAnswers.wantDuctCleaning){
    lines.push({key:'ductCleaning',label:'Duct cleaning',price:PRICING.duct.cleaning[tonnage]});
  }
  // Return duct run - per direct feedback, a home usually only needs one
  // of these, so no quantity field.
  if(pricingAnswers.wantNewReturnDuct){
    lines.push({key:'newReturnDuct',label:'New return duct run',price:PRICING.duct.newReturnDuct});
  }
  // Return plenum - also usually just one (same feedback as the return
  // duct run above), but still needs the ductboard-vs-metal material
  // choice PRICING.duct.returnPlenum prices separately - defaults to
  // ductboard (the standard choice) same as the wizard's own supply-
  // plenum question above.
  if(pricingAnswers.wantReturnPlenum){
    const plenumType=pricingAnswers.returnPlenumType==='metal'?'metal':'ductboard';
    lines.push({key:'ductReturnPlenum',plenumType,label:plenumType==='metal'?'Return plenum (sheet metal)':'Return plenum (ductboard)',price:PRICING.duct.returnPlenum[plenumType]});
  }
  // Annual maintenance plan - same add-on treatment as the checkboxes
  // above, not a wizard question. Pushed LAST per direct feedback (both
  // this line and its own checkbox on the price card should be the final
  // entry, not mixed in with the duct add-ons). $177 covers one system;
  // each additional system (the "how many systems do you have" stepper
  // next to this checkbox) adds a flat $100 instead of a second full
  // $177 - see PRICING.maintenancePlanAdditionalSystem's own comment.
  if(pricingAnswers.wantMaintenancePlan){
    const systemCount=Math.min(6,Math.max(1,pricingAnswers.maintenanceSystemCount||1));
    const extraSystems=systemCount-1;
    const price=PRICING.maintenancePlanAnnual+extraSystems*PRICING.maintenancePlanAdditionalSystem;
    lines.push({key:'maintenancePlan',systemCount,label:`Annual maintenance plan (1st year${systemCount>1?`, ${systemCount} systems`:''})`,price});
  }

  const subtotal=lines.reduce((s,l)=>s+l.price,0);
  // Per direct feedback, every line rounds to the nearest $25 EXCEPT the
  // maintenance plan - that one's a real, exact recurring price
  // ($177 + $100/additional system, not a rough install estimate like
  // everything else here), so it's the one line left un-rounded.
  const linesRounded=lines.map(l=>({...l,display:l.key==='maintenancePlan'?l.price:roundTo25(l.price)}));
  // Sum the already-rounded line items rather than independently rounding
  // the raw subtotal - roundTo25 isn't linear, so the two can land on
  // different multiples of 25 and a customer adding up the itemized rows
  // would get a total that doesn't match the headline price.
  const display=linesRounded.reduce((s,l)=>s+l.display,0);
  return{lines:linesRounded,subtotal,display,tonnage};
}
