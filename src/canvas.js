const {useState,useMemo,useRef,useCallback}=React;


// The price is the payoff of the entire build - having it just appear
// instantly reads as a lookup, not a calculation. Counting up from 0 (ease-
// out, ~900ms) makes it feel computed specifically for what was just built.
export function CountUp({value,duration=900,format}){
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
      fill="rgba(110,95,55,.45)" fontSize="12.5" fontFamily="monospace">GROUND LEVEL</text>

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
      fill="rgba(170,160,140,.4)" fontSize="12.5" fontFamily="monospace">CONCRETE PAD</text>

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
          fill="rgba(150,110,40,.5)" fontSize="11.5" fontFamily="monospace">LINESET</text>
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
        <rect x={DX+3} y={DY+4} width={DW-6} height={16} rx="2"
          fill={G+'.14)'} stroke={G+'.32)'} strokeWidth="0.8"/>
        <text x={DX+DW/2} y={DY+15.5} textAnchor="middle"
          fill={G+'.82)'} fontSize="12" fontFamily="monospace" fontWeight="700">DISC.</text>
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
          <rect x={DX+4} y={DY+DH+10} width={DW-8} height={15} rx="2"
            fill="rgba(249,115,22,.12)" stroke="#f97316" strokeWidth="0.7"/>
          <text x={DX+DW/2} y={DY+DH+21.5} textAnchor="middle"
            fill="#f97316" fontSize="12" fontFamily="monospace" fontWeight="700">SURGE</text>
          {/* Lightning bolt */}
          <text x={DX+DW/2} y={DY+DH+40} textAnchor="middle"
            fill="#f97316" fontSize="22">⚡</text>
          <text x={DX+DW/2} y={DY+DH+54} textAnchor="middle"
            fill="rgba(249,115,22,.6)" fontSize="11" fontFamily="monospace">PROTECTOR</text>
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
      fill={active?condC:(G+'.55)')} fontSize="13" fontFamily="monospace">
      {active?"CONDENSER · ACTIVE":"CONDENSER · STANDBY"}
    </text>

    {/* OUTSIDE label */}
    <text x={wallX+zoneW/2} y={12} textAnchor="middle"
      fill={W+'.2)'} fontSize="11.5" fontFamily="monospace" letterSpacing="1.2">OUTSIDE</text>
  </g>;
}

// ─── CANVAS ─────────────────────────────────────────────────────
export function Canvas({a, stepIdx, activeSteps, onEditStep}){
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
  // Defaults the mode toggle to whichever side of the system is actually
  // relevant right now (Austin's cooling season runs roughly April-
  // October, heating season November-March) instead of always opening
  // on cool mode regardless of the date - the first frame someone sees
  // should match what their own system is probably doing today. Purely
  // a starting position; every mode stays one click away either way, and
  // this is never used as a sales pitch anywhere in the diagram.
  const CURRENT_MONTH=new Date().getMonth(); // 0=Jan..11=Dec
  const CURRENT_MONTH_NAME=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][CURRENT_MONTH];
  const isHeatingSeason=CURRENT_MONTH<=1||CURRENT_MONTH>=10; // Nov-Feb
  // Within heating season, defaults the SUBmode too - November is still
  // mild enough that a heat pump alone (52°F outside) handles it, but
  // Dec/Jan/Feb are genuinely cold (28°F outside) where aux/furnace heat
  // actually kicks in for real, not just as a demo toggle.
  const isDeepWinter=CURRENT_MONTH<=1||CURRENT_MONTH===11; // Dec-Feb
  const [heatMode,setHeatMode]=React.useState(isHeatingSeason);
  const [heatSubMode,setHeatSubMode]=React.useState(
    // 'hp'/'furnace' for dual fuel, 'hp'/'aux' for a heat-pump-only air
    // handler - irrelevant (never shown) for straight-cool furnace systems.
    isDeepWinter?(a.indoor_type==='furnace'&&a.system_for==='hp'?'furnace':'aux'):'hp'
  );
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
  // Slate matte silver - the furnace/air-handler cabinet exterior and
  // the blower's own static motor housing. Real equipment cabinets are
  // galvanized sheet metal, not gold. Gold (G) stays reserved for the
  // plenum, spec/tier badges, and the blower WHEEL itself (the moving
  // assembly - kept gold on purpose, it reads well while spinning).
  const S='rgba(148,158,172,';

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
  // For a standard heat pump (hpLockedOut), aux heat is the ONLY thing
  // running - the compressor's off. For a low-ambient heat pump (mid
  // efficiency), the compressor never locks out, but the heat strip still
  // stages on as supplemental heat at a genuinely cold 28F to help carry
  // the load alongside it - both run together, so this can't just be
  // hpLockedOut (which mid efficiency never satisfies).
  const auxHeatActive=!hasFurnace&&heatMode&&heatSubMode==='aux';
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
      {/* Outer ring is the static motor housing (never moves) - slate
          silver, matching the rest of the cabinet exterior. The wheel
          itself (rim, blades, hub below) stays gold - it's the moving
          assembly and reads well spinning against the silver housing. */}
      <circle cx={cx} cy={cy} r={r+4} fill="rgba(0,0,0,.5)" stroke={S+'.4)'} strokeWidth="0.8"/>
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
        fill="rgba(253,224,71,.48)" fontSize="11" fontFamily="monospace">IONIZER</text>
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

  // ── CABINET EXTERIOR DETAIL KIT ─────────────────────────────
  // Small shared bits reused by all four furnace/air-handler cabinet
  // shells below (FurnaceH + AirHandlerH here, plus the closet layout's
  // own inline furnace/A-coil-AH boxes further down) so the "genuine
  // sheet-metal cabinet" read - rivets, a seam-mounted latch, a brand-
  // agnostic data plate - looks identical everywhere instead of each
  // shell re-deriving its own version. Each call site still picks its
  // own x/y placement (the internals - blower position, badges, labels -
  // differ enough between shells that a single auto-layout would collide
  // with something in at least one of them), but the artwork itself is
  // one definition.
  function CabinetRivet({cx,cy}){
    // A single flat-head rivet/screw - dark socket, thin highlight,
    // slot line. Sized to read at a glance without competing with the
    // labels/gauges around it.
    return <g>
      <circle cx={cx} cy={cy} r="2.3" fill="rgba(35,38,44,.85)" stroke={S+'.55)'} strokeWidth="0.6"/>
      <line x1={cx-1.2} y1={cy-0.3} x2={cx+1.2} y2={cy+0.3} stroke={S+'.75)'} strokeWidth="0.55" strokeLinecap="round"/>
    </g>;
  }
  // Recessed door latch - the cabinet's access-panel hardware. A short
  // horizontal handle sunk into a shallow housing, the way a real
  // furnace/AH front panel's captive latch reads from a few feet away.
  function CabinetLatch({cx,cy,w}){
    w=w||15;
    return <g>
      <rect x={cx-w/2} y={cy-3.4} width={w} height={6.8} rx="1.6"
        fill="rgba(20,22,27,.85)" stroke={S+'.4)'} strokeWidth="0.6"/>
      <rect x={cx-w/2+2.2} y={cy-1.3} width={w-4.4} height={2.6} rx="1.1"
        fill="rgba(60,65,75,.9)" stroke={S+'.6)'} strokeWidth="0.5"/>
    </g>;
  }
  // Brand-agnostic data plate - a small riveted spec tag, the kind every
  // real furnace/AH cabinet carries (model/serial/electrical rating)
  // without inventing a fake brand. Two hairline rules stand in for
  // print too fine to read at diagram scale, same convention as a real
  // photo of one reading as "text" from across a room.
  function CabinetPlate({x,y,w,h}){
    h=h||9;
    return <g opacity="0.85">
      <rect x={x} y={y} width={w} height={h} rx="1"
        fill="rgba(18,20,25,.8)" stroke={S+'.42)'} strokeWidth="0.55"/>
      <line x1={x+2.5} y1={y+h*0.36} x2={x+w-2.5} y2={y+h*0.36} stroke={S+'.5)'} strokeWidth="0.6"/>
      <line x1={x+2.5} y1={y+h*0.66} x2={x+w-3.5-w*0.22} y2={y+h*0.66} stroke={S+'.35)'} strokeWidth="0.6"/>
    </g>;
  }
  // A few faint brushed-metal hairlines across the top accent strip -
  // reads as a rolled sheet-metal lip catching light unevenly rather
  // than a flat painted bar. Kept very low-opacity/thin so it never
  // fights the strip's own gradient or the AFUE/COMMUNICATING badges
  // that sit just below it.
  function CabinetStripBrushing({x,y,w}){
    const n=Math.max(4,Math.min(10,Math.round(w/26)));
    return <g opacity="0.3">
      {Array.from({length:n},(_,i)=>{
        const lx=x+w*(i+0.5)/n;
        return <line key={i} x1={lx} y1={y+1.2} x2={lx} y2={y+7.8} stroke="#fff" strokeWidth="0.5"/>;
      })}
    </g>;
  }

  // Furnace horizontal - blower LEFT | HX RIGHT
  function FurnaceH({x,y,w,h,active,roofY}){
    const mid=x+w/2;
    return <g>
      {/* Exterior housing stays silver whether the furnace is running or
          not - a real sheet-metal cabinet doesn't change color when it
          turns on, only what's happening inside it does (the flames/heat
          exchanger below, the evaporator coil's own tubes in ACoilH, the
          STANDBY/ACTIVE label). Border+top strip used to switch to a
          bright orange whenever active, which read as the cabinet itself
          changing material rather than just what's running inside it. */}
      <rect x={x} y={y} width={w} height={h} rx="4"
        fill={active?"#0d0606":"#0a0a0a"}
        stroke="url(#cabinet-edge)" strokeOpacity="0.85" strokeWidth="1.8"/>
      {active&&<rect x={x} y={y} width={w} height={h} rx="4" fill={O+'.04)'} stroke="none"/>}
      <rect x={x} y={y} width={w} height={7} rx="4" fill="url(#silver)" opacity=".72"/>
      <CabinetStripBrushing x={x} y={y} w={w}/>
      <CabinetRivet cx={x+8} cy={y+3.5}/>
      <CabinetRivet cx={x+w-8} cy={y+3.5}/>
      <CabinetPlate x={x+w-46} y={y+11} w={40}/>
      <CabinetLatch cx={mid} cy={y+3.5} w={14}/>
      <line x1={mid} y1={y+7} x2={mid} y2={y+h} stroke={S+'.28)'} strokeWidth="1" strokeDasharray="4 3"/>
      {Array.from({length:7},(_,i)=>(
        <line key={i} x1={x+3} y1={y+12+i*(h-18)/7} x2={x+3} y2={y+18+i*(h-18)/7}
          stroke={S+'.42)'} strokeWidth="3" strokeLinecap="round"/>
      ))}
      <BlowerWheel cx={x+w*0.25} cy={y+h*0.42} r={Math.min(w*0.21,h*0.29)}
        spd={blowerActive?1.6:0.5} active={blowerActive}/>
      <text x={x+w*0.25} y={y+h-13} textAnchor="middle" fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">BLOWER</text>
      <text x={x+w*0.25} y={y+h-4} textAnchor="middle" fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
      {Array.from({length:6},(_,i)=>{
        const gy=y+10+i*(h-18)/6;
        return <path key={i}
          d={`M${mid+6} ${gy+6} Q${mid+w*0.17} ${gy-2} ${mid+w*0.31} ${gy+7} Q${mid+w*0.41} ${gy+14} ${mid+w*0.31} ${gy+18}`}
          fill="none" stroke={active?'rgba(249,115,22,.6)':'rgba(108,44,8,.22)'} strokeWidth="2.8" strokeLinecap="round"/>;
      })}
      <rect x={mid+4} y={y+h-17} width={w/2-8} height={10} rx="2"
        fill={active?O+'.07)':'rgba(5,5,13,.8)'} stroke={active?'rgba(249,115,22,.42)':(S+'.2)')} strokeWidth="0.6"/>
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
      <text x={mid+w*0.25} y={y+h-4} textAnchor="middle" fill={active?'rgba(249,115,22,.75)':(S+'.6)')} fontSize="13" fontFamily="monospace">HEAT EXCH.</text>
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
            fill={is90?"rgba(147,197,253,.5)":"rgba(148,148,148,.44)"} fontSize="11.5" fontFamily="monospace">{is90?'PVC':'B-VENT'}</text>
        </>;
      })()}
      {isComm&&<><rect x={x+4} y={y+10} width={82} height="11" rx="2" fill="url(#blue)"/><text x={x+7} y={y+18.5} fill="#fff" fontSize="9.5" fontFamily="monospace">COMMUNICATING</text></>}
      <rect x={mid+4} y={y+11} width={36} height="8" rx="2" fill={is90?"rgba(35,137,224,.13)":(G+'.07)')} stroke={is90?(B+'.24)'):(G+'.16)')} strokeWidth="0.5"/>
      <text x={mid+22} y={y+18} textAnchor="middle" fill={is90?"#5ba8f5":(G+'.6)')} fontSize="11" fontFamily="monospace">{is90?'90%':'80%'} AFUE</text>
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
      {/* Exterior housing stays silver in both states - see the comment on
          FurnaceH's own border/strip above. The internal coil tubes
          (ACoilH, embedded below) still color by evapC exactly as
          before - only the housing exterior stopped switching color. */}
      <rect x={x} y={y} width={w} height={h} rx="4"
        fill={active?"#050c1a":"#090909"}
        stroke="url(#cabinet-edge)" strokeOpacity="0.8" strokeWidth="1.5"/>
      {active&&<rect x={x} y={y} width={w} height={h} rx="4" fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none"/>}
      <rect x={x} y={y} width={w} height={7} rx="4" fill="url(#silver)" opacity=".68"/>
      <CabinetStripBrushing x={x} y={y} w={w}/>
      {/* Left rivet nudged in - the standalone-AH lineset riser anchors at
          RL_START_X=AH_X+9 (same corner), same reasoning as the attic
          furnace's own A-coil box a few lines up. */}
      <CabinetRivet cx={x+19} cy={y+3.5}/>
      <CabinetRivet cx={x+w-8} cy={y+3.5}/>
      <CabinetLatch cx={c1} cy={y+3.5} w={13}/>
      <line x1={c1} y1={y+7} x2={c1} y2={y+h} stroke={S+'.26)'} strokeWidth="0.9" strokeDasharray="4 3"/>
      <line x1={c2} y1={y+7} x2={c2} y2={y+h} stroke={S+'.26)'} strokeWidth="0.9" strokeDasharray="4 3"/>
      {Array.from({length:7},(_,i)=>(
        <line key={i} x1={x+3} y1={y+12+i*(h-18)/7} x2={x+3} y2={y+18+i*(h-18)/7}
          stroke={S+'.38)'} strokeWidth="3" strokeLinecap="round"/>
      ))}
      <rect x={x+3} y={y+8} width={coilW-6} height={h-14} rx="2" fill={active?"rgba(4,8,22,.7)":"rgba(6,6,16,.7)"}/>
      <ACoilH x={x+9} y={y+12} w={coilW-19} h={h-22} active={active}/>
      <text x={x+coilW/2} y={y+h-4} textAnchor="middle" fill={active?evapC:(S+'.6)')} fontSize="13" fontFamily="monospace">A-COIL</text>
      <BlowerWheel cx={c1+blowerW/2} cy={y+h*0.42} r={Math.min(blowerW*0.32,h*0.29)}
        spd={blowerActive?1.5:0.45} active={blowerActive}/>
      <text x={c1+blowerW/2} y={y+h-13} textAnchor="middle" fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">BLOWER</text>
      <text x={c1+blowerW/2} y={y+h-4} textAnchor="middle" fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
      {/* Literally the same AuxHeatKit artwork the closet layout uses
          below (just called with this column's own width/height, since
          the strip is proportional, not fixed-size) - wrapped in a
          90-degree rotation instead of a hand-rebuilt layout, so this
          column shows the exact same bordered-strip-of-elements design
          the closet does, just turned to fit a column that's tall
          instead of wide. See the AuxHeatKit comment for the rotation
          math this translate+rotate pair relies on. */}
      <g transform={`translate(${c2+3} ${y+8+(h-14)}) rotate(-90)`}>
        <AuxHeatKit x={0} y={0} w={h-14} h={auxW-6} auxHeat={auxHeat}/>
      </g>
      <rect x={x} y={y+h} width={w} height={6} rx="1" fill="#08121e" stroke={B+'.18)'} strokeWidth="0.7"/>

    </g>;
  }

  // Aux heat kit - a bordered strip of heat-strip elements with a
  // caption label. Drawn once in its natural wide-short orientation
  // (matching how the closet/vertical air handler has room to show it -
  // the column there is wide), and reused as-is for the attic/horizontal
  // air handler by wrapping it in a 90-degree rotation instead of
  // re-deriving a different layout for that column - so both layouts
  // show literally the same artwork, just turned to fit whichever
  // column is actually the narrow one there.
  function AuxHeatKit({x,y,w,h,auxHeat,segCount}){
    segCount=segCount||4;
    const rectY=y, rectH=h*0.62;
    const rectX=x+w*0.03, rectW=w*0.94;
    const segGap=rectW*0.04;
    const segW=(rectW-segGap*(segCount+1))/segCount;
    const segH=rectH*0.6, segY=rectY+rectH*0.2;
    return <g>
      <rect x={rectX} y={rectY} width={rectW} height={rectH} rx="2"
        fill={auxHeat?"rgba(120,20,10,.16)":"rgba(10,10,14,.5)"}
        stroke={auxHeat?"rgba(249,115,22,.6)":(S+'.2)')} strokeWidth="0.8"/>
      {Array.from({length:segCount},(_,i)=>{
        const bx=rectX+segGap+i*(segW+segGap);
        return <g key={i}>
          <rect x={bx} y={segY} width={Math.max(1,segW)} height={Math.max(1,segH)} rx="1"
            fill={auxHeat?"#1a0805":"#0a0a0f"} stroke={auxHeat?"rgba(249,115,22,.4)":"rgba(48,20,5,.2)"} strokeWidth="0.5"/>
          {auxHeat&&<ellipse cx={bx+segW/2} cy={segY+segH/2} rx={segW/2} ry={Math.min(3,segH/2)}
            fill="rgba(249,115,22,.6)" className="glow-pulse" style={{animationDelay:i*0.1+'s'}}/>}
        </g>;
      })}
      <text x={x+w/2} y={y+h*0.92} textAnchor="middle"
        fill={auxHeat?"rgba(249,115,22,.78)":(S+'.6)')} fontSize={Math.min(12,h*0.22)} fontFamily="monospace">AUX HEAT KIT</text>
    </g>;
  }

  // CapFan -- side-perspective view into condenser top cap
  // Fan blades contained by keeping radii tight -- no clipPath needed
  function CapFan({x,y,w,h,active,bladeColor,slatFill,slatCount,ringColor}){
    // guardRings: how many concentric wire-guard rings cage the blades -
    // callers pass a density (higher slatCount = finer cage), fed-min
    // gets a coarser 2-ring cage, high-eff a finer 4-ring one, reading
    // as the plainer vs. nicer fan guard at a glance.
    const guardRings=Math.max(2,Math.min(5,Math.round((slatCount||6)/3)));
    const cx=x+w/2, cy=y+h/2;
    // Enlarged per a reference photo of a real condenser, where the fan/
    // guard fills almost the entire top cap edge-to-edge - the previous
    // 0.42/0.34 left a lot of visibly empty dark cap around a small oval.
    const fanRx=w*0.46;
    const fanRy=h*0.38;
    const spd=active?0.9:0;
    const spinStyle=active?{
      transformBox:'fill-box',
      transformOrigin:'center',
      animation:'spin '+(1/spd).toFixed(2)+'s linear infinite',
    }:{};
    const bC=bladeColor||(active?'rgba(80,85,95,.75)':'rgba(50,55,62,.5)');
    const gC=slatFill||ringColor||bC;
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
      {/* Wire guard cage -- concentric rings + crossing spokes, confined
          to the fan disc itself (not the old full-rect louver bars,
          which were nearly opaque and blotted the whole cap out,
          hiding the fan almost entirely). This is what actually reads
          as "a real fan behind a guard" instead of a flat dark smear,
          and the ring density is the fed-min/high-eff differentiator:
          a coarse 2-ring cage vs. a finer 4-ring one. */}
      {Array.from({length:guardRings},(_,i)=>{
        const t=(i+1)/(guardRings+0.3);
        return <ellipse key={i} cx={cx} cy={cy} rx={fanRx*t} ry={fanRy*t} fill="none"
          stroke={gC} strokeWidth={active?0.9:0.7} opacity={active?0.55:0.42}/>;
      })}
      <line x1={cx-fanRx} y1={cy} x2={cx+fanRx} y2={cy} stroke={gC} strokeWidth="0.8" opacity={active?0.45:0.34}/>
      <line x1={cx} y1={cy-fanRy} x2={cx} y2={cy+fanRy} stroke={gC} strokeWidth="0.8" opacity={active?0.45:0.34}/>
      {/* Two more spokes at +-45deg - six total, closer to a real woven-
          wire hail guard's diagonal ribs than the original plain cross. */}
      <line x1={cx-fanRx*0.7071} y1={cy-fanRy*0.7071} x2={cx+fanRx*0.7071} y2={cy+fanRy*0.7071}
        stroke={gC} strokeWidth="0.65" opacity={active?0.38:0.28}/>
      <line x1={cx-fanRx*0.7071} y1={cy+fanRy*0.7071} x2={cx+fanRx*0.7071} y2={cy-fanRy*0.7071}
        stroke={gC} strokeWidth="0.65" opacity={active?0.38:0.28}/>
      {/* Outer rim bezel -- the visible edge of the guard cage/fan
          housing, brighter than the inner rings so the whole assembly
          still reads as one fan at a glance. */}
      <ellipse cx={cx} cy={cy} rx={fanRx*0.98} ry={fanRy*0.98} fill="none"
        stroke={ringColor||bC} strokeWidth="1.2" opacity={active?0.6:0.45}/>
      {/* Hail guard flange -- a raised dome/lip sitting proud of the flat
          cap surface, the way a real hail guard bulges outward over the
          fan opening (emulating a reference photo of a real fed-min
          condenser). A flat single-color ring can't fake a bevel; split
          into a lighter top-half arc and a darker bottom-half arc so it
          reads as catching light from above instead of a flat painted
          circle. */}
      <path d={`M${cx-fanRx*1.07} ${cy} A${fanRx*1.07} ${fanRy*1.07} 0 0 1 ${cx+fanRx*1.07} ${cy}`}
        fill="none" stroke="rgba(165,170,180,.5)" strokeWidth="1" opacity={active?0.55:0.42}/>
      <path d={`M${cx-fanRx*1.07} ${cy} A${fanRx*1.07} ${fanRy*1.07} 0 0 0 ${cx+fanRx*1.07} ${cy}`}
        fill="none" stroke="rgba(8,9,11,.75)" strokeWidth="1" opacity={active?0.6:0.5}/>
      <ellipse cx={cx} cy={cy} rx={fanRx*0.12} ry={fanRy*0.14}
        fill="#1a1c20" stroke="rgba(55,60,68,.6)" strokeWidth="0.8"/>
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
        {/* FED MIN: matched closely against a reference photo of a real
            GE fed-min cabinet - genuinely rounded corners (not the
            square-ish rx=2 this used to be), a chevron-louvered body,
            and a domed black cap whose fan/guard fills nearly the whole
            top instead of sitting as a small oval in empty dark space. */}
        <rect x={x} y={y} width={w} height={h} rx={9}
          fill={active?"#b9bdc5":"#c4c8cf"}
          stroke={active?"rgba(150,155,165,.9)":"rgba(130,135,145,.8)"} strokeWidth="1.2"/>
        {/* Dark top cap with CapFan */}
        {(()=>{
          const capH=Math.round(h*0.20);
          return <>
            <rect x={x} y={y} width={w} height={capH} rx={9}
              fill={active?"#3a3d42":"#2e3035"} stroke="rgba(20,22,26,.8)" strokeWidth="1"/>
            {/* Domed-cap illusion - a flat rect can't actually curve in
                this front-on view, so a lighter highlight arc along the
                top edge + a darker shadow arc along the bottom edge fakes
                the cap bulging up toward the viewer the way it does in
                the reference photo. */}
            <path d={`M${x+9} ${y+2} Q${x+w/2} ${y-1.5} ${x+w-9} ${y+2}`}
              fill="none" stroke="rgba(150,155,165,.4)" strokeWidth="1.1" opacity="0.7"/>
            <path d={`M${x+6} ${y+capH-1.5} Q${x+w/2} ${y+capH+2} ${x+w-6} ${y+capH-1.5}`}
              fill="none" stroke="rgba(10,11,13,.6)" strokeWidth="1.3" opacity="0.6"/>
            <CapFan x={x+2} y={y+1} w={w-4} h={capH-2} active={active}
              bladeColor={active?(refReversed?"rgba(100,160,220,.8)":"rgba(220,90,90,.7)"):"rgba(45,48,55,.6)"}
              slatFill={active?"rgba(44,47,54,.88)":"rgba(36,39,46,.92)"}
              ringColor="rgba(120,125,135,.55)"
              slatCount={Math.max(3,Math.floor((capH-2)*0.7/6.5))}/>
            {/* Screw ring around the cap's outer edge (8, not the old 4
                corner-only rivets) - the reference photo shows these
                spaced all the way around the cap perimeter, not just at
                its corners. */}
            {Array.from({length:8},(_,i)=>{
              const ang=(i/8)*Math.PI*2;
              // Pushed out to the cap's own edge (not the fan/guard's) so
              // the screws sit clearly outside the guard assembly, same
              // as the reference photo's perimeter screw ring.
              const rx=(w/2-3), ry=(capH/2-2.5);
              return <circle key={i} cx={x+w/2+rx*Math.cos(ang)} cy={y+capH/2+ry*Math.sin(ang)} r={1.6}
                fill="rgba(50,55,62,.9)" stroke="rgba(80,85,95,.5)" strokeWidth="0.5"/>;
            })}
          </>;
        })()}
        {/* Flat panel body -- a continuous chevron-louver ribbon pattern
            (real 14 SEER2 builder-grade condensers - GE, Goodman, Amana -
            are almost always stamped this way top to bottom, not the flat
            sheet + sparse dot-perforation patch this used to be) matched
            against a reference photo of a real fed-min cabinet. Each row
            is a shallow repeating "V" tooth - a cheap approximation of the
            real die-stamped wave/louver slot, dense enough to read as
            "corrugated sheet metal" at diagram scale without the cost of
            an actually-perforated real vent (which would need a genuine
            hole through the cabinet). */}
        {(()=>{
          const capH=Math.round(h*0.20);
          const slotY=y+capH+3, slotH=h-capH-6;
          const rowH=5.5, toothW=8;
          const rows=Math.max(6,Math.floor(slotH/rowH));
          // Teeth start at x+4 (2px clear of the body rect's x+2 edge) and
          // stop at x+w-4 - never offset per-row, so every tooth stays
          // safely inside the panel with no per-row edge-overhang risk.
          const teeth=Math.floor((w-8)/toothW);
          return <>
            <rect x={x+2} y={slotY} width={w-4} height={slotH} rx="1"
              fill={active?"rgba(150,154,162,.4)":"rgba(160,164,172,.38)"}/>
            {Array.from({length:rows},(_,r)=>{
              const rowY=slotY+3+r*rowH;
              let d=`M${x+4} ${rowY}`;
              for(let t=0;t<teeth;t++){
                const tx=x+4+t*toothW;
                d+=` L${tx+toothW/2} ${rowY-1.7} L${tx+toothW} ${rowY}`;
              }
              // A single mid-tone line read as flat/subtle - a lighter
              // highlight pass just above + a darker shadow pass just
              // below the same path fakes each tooth catching light on
              // its raised edge, closer to the crisp embossed look in
              // the reference photo's die-stamped louvers.
              return <g key={r}>
                <path d={d} fill="none" stroke={active?"rgba(210,213,218,.55)":"rgba(220,223,228,.5)"} strokeWidth="0.5" transform="translate(0,-0.35)"/>
                <path d={d} fill="none" stroke={active?"rgba(90,95,105,.5)":"rgba(80,85,95,.48)"} strokeWidth="0.5" transform="translate(0,0.35)"/>
              </g>;
            })}
          </>;
        })()}
        {/* Round manufacturer badge, centered on the panel - the reference
            photo shows a round medallion (not a rectangular data plate)
            roughly a third of the way down the body. Kept deliberately
            blank/generic (a plain ringed medallion, no text or monogram)
            so nothing here reads as a copied brand mark - the round
            SHAPE alone isn't anyone's trademark, only a specific logo
            would be. */}
        {(()=>{
          const capH=Math.round(h*0.20);
          const bcx=x+w/2, bcy=y+capH+Math.round((h-capH)*0.38);
          const br=Math.round(Math.min(w,h)*0.09);
          return <>
            <ellipse cx={bcx} cy={bcy} rx={br} ry={br*0.82}
              fill="rgba(40,43,50,.6)" stroke="rgba(150,155,165,.55)" strokeWidth="1"/>
            <ellipse cx={bcx} cy={bcy} rx={br*0.72} ry={br*0.6}
              fill="none" stroke="rgba(150,155,165,.35)" strokeWidth="0.6"/>
          </>;
        })()}
        {[[x+4,y+h-4],[x+w-4,y+h-4]].map(([fx,fy],i)=>(
          <circle key={i} cx={fx} cy={fy} r={2.5}
            fill="rgba(90,95,105,.8)" stroke="rgba(60,65,75,.6)" strokeWidth="0.7"/>
        ))}
        {/* Compressor outline - visible inside housing */}
        {(()=>{
          const capH=Math.round(h*0.20);
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
            <text x={cX+cW/2} y={y+h-22} textAnchor="middle"
              fill={active?'rgba(180,80,80,.6)':"rgba(80,85,95,.45)"} fontSize="11" fontFamily="monospace">COMP.</text>
          </g>;
        })()}
        {/* SEER badge */}
        <rect x={x+3} y={y+h-18} width={w-6} height={15} rx="2"
          fill="rgba(40,43,50,.82)" opacity="0.95"/>
        <text x={x+w/2} y={y+h-6} textAnchor="middle"
          fill="rgba(195,200,210,.9)" fontSize="12.5" fontFamily="monospace" fontWeight="700">{TL}</text>
      </>}

      {isMini&&<>
        {/* MID: real GE NS18H condensers are a front-discharge cabinet - a
            large round fan grille dominating most of the front face, a
            narrower service-panel column beside it - not a top-discharge
            square cabinet like the fed-min/high-eff units. Lightened per
            a reference photo of a real front-discharge unit (same
            "should be light metal, not near-black" correction the fed-min/
            high-eff passes already got) - kept between the two on the
            gray scale: cooler/dimmer than fed-min's plainer light gray,
            lighter than high-eff's darker richer tone. */}
        <rect x={x} y={y} width={w} height={h} rx={6}
          fill={active?(refReversed?"#a5aab4":"#bec2c8"):"#b5b9bf"}
          stroke={active?cc:"rgba(120,124,132,.8)"} strokeWidth={active?1.8:1.4}/>
        {/* Discharge grille top - stays black/dark, a real grille slot,
            unlike the body around it */}
        <rect x={x+4} y={y+2} width={w-8} height={Math.round(h*0.1)} rx="2"
          fill="rgba(20,22,26,.55)" stroke="rgba(150,154,162,.4)" strokeWidth="0.6"/>
        {Array.from({length:3},(_,i)=>(
          <rect key={i} x={x+6} y={y+4+i*4} width={w-12} height={2} rx="0.5"
            fill="rgba(15,17,20,.85)" stroke="rgba(90,95,105,.4)" strokeWidth="0.3"/>
        ))}
        {/* Left: large fan area ~68% */}
        {(()=>{
          const fanAreaW=Math.round(w*0.68);
          const fanAreaH=h-Math.round(h*0.1)-4;
          const fanAreaY=y+Math.round(h*0.1)+2;
          const fCX=x+fanAreaW/2, fCY=fanAreaY+fanAreaH/2;
          const fR=Math.round(Math.min(fanAreaW,fanAreaH)*0.43);
          // Woven-wire crosshatch mesh (two crossing diagonal line sets,
          // clipped to the grille circle) instead of the old sparse dot
          // pattern - closer to how a real fan guard mesh actually reads,
          // matching the reference photo's visible diamond weave.
          const meshLines=[];
          const pitch=4.2;
          for(let i=-Math.ceil((fanAreaW+fanAreaH)/pitch);i<=Math.ceil((fanAreaW+fanAreaH)/pitch);i++){
            meshLines.push(i);
          }
          return <>
            <rect x={x+2} y={fanAreaY} width={fanAreaW-2} height={fanAreaH} rx="3"
              fill="rgba(10,11,14,.55)" stroke="rgba(150,154,162,.4)" strokeWidth="0.7"/>
            {[[x+7,fanAreaY+5],[x+fanAreaW-6,fanAreaY+5],[x+7,fanAreaY+fanAreaH-5],[x+fanAreaW-6,fanAreaY+fanAreaH-5]].map(([sx,sy],i)=>(
              <circle key={i} cx={sx} cy={sy} r={1.6} fill="rgba(35,38,44,.9)" stroke="rgba(150,154,162,.4)" strokeWidth="0.4"/>
            ))}
            <clipPath id={"midfan-clip-"+active}><circle cx={fCX} cy={fCY} r={fR+3}/></clipPath>
            <g clipPath={`url(#midfan-clip-${active})`} opacity="0.5">
              {meshLines.map(i=>(
                <line key={'a'+i} x1={fCX-fR-3+i*pitch} y1={fCY-fR-3} x2={fCX-fR-3+i*pitch+2*(fR+3)} y2={fCY+fR+3}
                  stroke="rgba(70,75,85,.7)" strokeWidth="0.4"/>
              ))}
              {meshLines.map(i=>(
                <line key={'b'+i} x1={fCX-fR-3+i*pitch} y1={fCY+fR+3} x2={fCX-fR-3+i*pitch+2*(fR+3)} y2={fCY-fR-3}
                  stroke="rgba(70,75,85,.7)" strokeWidth="0.4"/>
              ))}
            </g>
            <circle cx={fCX} cy={fCY} r={fR+8} fill="none" stroke="rgba(160,164,172,.5)" strokeWidth="2.5"/>
            {/* Real condenser fans ramp up with load - faster at 96° (cool,
                full compressor load) and 52° (mild heat-pump load) than at
                28°, where either the compressor is standby (dual-fuel
                furnace mode) or running its slower low-ambient stage. */}
            <CondenserFan cx={fCX} cy={fCY} r={fR} active={active} fast={!heatMode||isMildHp}/>
          </>;
        })()}
        {/* Right: service panel ~30% - light like the rest of the body
            (was a dark panel before this pass), with a round badge
            (matching fed-min/high-eff's generic medallion), a couple of
            thin access-panel seam lines, and the VS status indicator
            kept as a small dark accent window rather than a dominating
            dark panel. */}
        {(()=>{
          const panelX=x+Math.round(w*0.7);
          const panelW=w-Math.round(w*0.7)-2;
          const panelY=y+Math.round(h*0.1)+4;
          const panelH=h-Math.round(h*0.1)-8;
          const br=Math.round(panelW*0.34);
          return <>
            <rect x={panelX} y={panelY} width={panelW} height={panelH} rx="4"
              fill={active?"#b0b4ba":"#a8acb2"} stroke="rgba(90,94,102,.7)" strokeWidth="0.8"/>
            <ellipse cx={panelX+panelW/2} cy={panelY+panelH*0.28} rx={br} ry={br*0.8}
              fill="rgba(30,32,38,.6)" stroke="rgba(190,194,200,.5)" strokeWidth="0.9"/>
            <ellipse cx={panelX+panelW/2} cy={panelY+panelH*0.28} rx={br*0.7} ry={br*0.56}
              fill="none" stroke="rgba(190,194,200,.3)" strokeWidth="0.5"/>
            {[0.5,0.63].map((ty,i)=>(
              <line key={i} x1={panelX+2} y1={panelY+panelH*ty} x2={panelX+panelW-2} y2={panelY+panelH*ty}
                stroke="rgba(80,84,90,.4)" strokeWidth="0.6"/>
            ))}
            <rect x={panelX+3} y={panelY+panelH*0.7} width={panelW-6} height={panelH*0.2} rx="2"
              fill={active?"rgba(20,25,35,.85)":"rgba(16,18,24,.75)"} stroke="rgba(60,65,75,.5)" strokeWidth="0.6"/>
            <circle cx={panelX+panelW/2} cy={panelY+panelH*0.8} r={3}
              fill={active?(cc):"rgba(40,45,55,.6)"} stroke={active?cc:"rgba(90,95,105,.4)"} strokeWidth="0.7"/>
            {active&&<circle cx={panelX+panelW/2} cy={panelY+panelH*0.8} r={1.7}
              fill="#fff" className="glow-pulse"/>}
            <text x={panelX+panelW/2} y={panelY+panelH*0.87} textAnchor="middle"
              fill={active?cc:"rgba(200,204,210,.6)"} fontSize="8.5" fontFamily="sans-serif" fontWeight="700">VS</text>
          </>;
        })()}
        {/* SEER badge */}
        <rect x={x+3} y={y+h-18} width={w-6} height={15} rx="2"
          fill={active?(refReversed?"url(#blue)":"url(#red-g)"):"url(#gold)"} opacity=".6"/>
        <text x={x+w/2} y={y+h-6} textAnchor="middle"
          fill="#fff" fontSize="12.5" fontFamily="monospace" fontWeight="700">{TL}</text>
      </>}

      {isBig&&<>
        {/* HIGH EFF: darker medium-gray unibody cabinet - a second pass
            against the same American Standard reference photo, matching
            its noticeably darker/richer gray (not the lighter tone this
            used to be) so the two tiers read as clearly different grades:
            fed-min's plain light gray vs. this darker, denser metal.
            Rounded corners bumped to match fed-min's own rx (was a
            flatter rx=5) and the cap picked up the same domed-highlight +
            screw-ring treatment fed-min's reference pass added, for
            visual consistency between the two tiers' cap designs. */}
        <rect x={x} y={y} width={w} height={h} rx={10}
          fill={active?(refReversed?"#767c8e":"#8c9096"):"#82868c"}
          stroke={active?cc:"rgba(100,104,112,.85)"} strokeWidth={active?1.8:1.4}/>
        {/* Slim corner posts -- narrower than the old chamfer strips, a
            cleaner structural read instead of thick side blocks */}
        <rect x={x} y={y+4} width={5} height={h-8} rx="1.5"
          fill={active?"#6d7178":"#65686f"} stroke="rgba(50,54,60,.7)" strokeWidth="0.8"/>
        <rect x={x+w-5} y={y+4} width={5} height={h-8} rx="1.5"
          fill={active?"#6d7178":"#65686f"} stroke="rgba(50,54,60,.7)" strokeWidth="0.8"/>
        {/* Dark rounded top cap with CapFan - tightened padding (vs.
            fed-min's own x+2/w-4 inset) so the fan/hail-guard assembly
            dominates the cap the way it does in the reference photo,
            instead of sitting as a small oval within a mostly-empty
            black cap. Stroke lightened to a metallic tone for a rounded
            rim highlight where the cap meets the lighter body. */}
        {(()=>{
          const capH=Math.round(h*0.24);
          return <>
            <rect x={x} y={y} width={w} height={capH} rx={10}
              fill="#1e2024" stroke="rgba(150,154,162,.55)" strokeWidth="1.2"/>
            {/* Domed-cap illusion, same technique as fed-min's reference
                pass - a flat rect can't curve in this front-on view, so a
                light highlight arc on top + dark shadow arc on bottom
                fakes it bulging toward the viewer. */}
            <path d={`M${x+10} ${y+2} Q${x+w/2} ${y-1.5} ${x+w-10} ${y+2}`}
              fill="none" stroke="rgba(150,155,165,.4)" strokeWidth="1.1" opacity="0.7"/>
            <path d={`M${x+7} ${y+capH-1.5} Q${x+w/2} ${y+capH+2} ${x+w-7} ${y+capH-1.5}`}
              fill="none" stroke="rgba(10,11,13,.6)" strokeWidth="1.3" opacity="0.6"/>
            <CapFan x={x+2} y={y+1} w={w-4} h={capH-2} active={active}
              bladeColor={active?(refReversed?"rgba(100,160,220,.7)":"rgba(220,90,90,.65)"):"rgba(40,44,52,.6)"}
              slatFill={active?"rgba(24,27,33,.88)":"rgba(18,21,27,.92)"}
              ringColor={active?cc:"rgba(100,105,115,.55)"}
              slatCount={Math.max(9,Math.floor((capH-4)*0.72/2.6))}/>
            {/* Screw ring around the cap's outer edge (8, matching
                fed-min's reference pass) instead of the old 4 corner-only
                rivets. */}
            {Array.from({length:8},(_,i)=>{
              const ang=(i/8)*Math.PI*2;
              const rx=(w/2-3), ry=(capH/2-2.5);
              return <circle key={i} cx={x+w/2+rx*Math.cos(ang)} cy={y+capH/2+ry*Math.sin(ang)} r={1.8}
                fill="rgba(35,38,44,.9)" stroke="rgba(55,60,68,.5)" strokeWidth="0.5"/>;
            })}
          </>;
        })()}
        {/* Top-tier accent -- a slim pinstripe instead of the old thick
            block band, a subtler premium cue */}
        <rect x={x} y={y+Math.round(h*0.24)+2} width={w} height={2}
          fill={active?cc:"rgba(120,128,145,.5)"} opacity={active?0.9:0.55}/>
        {/* Vertical fin louvers -- tall, closely-pitched fins running
            the full body height, alternating light/dark for a fluted
            corrugated-metal read (replacing the old fine dot-mesh,
            which doesn't match how a real high-eff cabinet's panel is
            actually stamped) plus the same center reveal seam as
            before for a two-panel unibody look. */}
        {(()=>{
          const capH=Math.round(h*0.24);
          const bodyY=y+capH+5, bodyH=h-capH-11;
          const midX=x+w/2;
          const finW=2.2, finGap=0.9, step=finW+finGap;
          const cols=Math.max(6,Math.floor((w-14)/step));
          return <>
            <rect x={x+6} y={bodyY} width={w-12} height={bodyH} rx="1.5"
              fill={active?"rgba(120,124,130,.35)":"rgba(110,114,120,.32)"} stroke="rgba(80,84,90,.45)" strokeWidth="0.6"/>
            {Array.from({length:cols},(_,c)=>{
              const fx=x+7+c*step;
              return <rect key={c} x={fx} y={bodyY+2} width={finW} height={bodyH-4} rx="0.6"
                fill={c%2===0?"rgba(145,149,155,.55)":"rgba(70,74,80,.5)"}/>;
            })}
            <line x1={midX} y1={bodyY} x2={midX} y2={bodyY+bodyH}
              stroke="rgba(55,59,65,.6)" strokeWidth="1.4"/>
            <line x1={midX+1.2} y1={bodyY} x2={midX+1.2} y2={bodyY+bodyH}
              stroke="rgba(170,174,180,.3)" strokeWidth="0.6"/>
            {/* Round manufacturer badge, matching fed-min's reference
                pass - deliberately blank (no text/logo), just the
                generic medallion shape. */}
            {(()=>{
              const bcx=x+w/2, bcy=bodyY+bodyH*0.22;
              const br=Math.round(Math.min(w,h)*0.085);
              return <>
                <ellipse cx={bcx} cy={bcy} rx={br} ry={br*0.78}
                  fill="rgba(30,32,38,.6)" stroke="rgba(190,194,200,.5)" strokeWidth="1"/>
                <ellipse cx={bcx} cy={bcy} rx={br*0.72} ry={br*0.58}
                  fill="none" stroke="rgba(190,194,200,.32)" strokeWidth="0.6"/>
              </>;
            })()}
          </>;
        })()}
        {active&&<rect x={x} y={y} width={w} height={h} rx={10}
          fill={refReversed?"rgba(35,137,224,.04)":"rgba(239,68,68,.03)"} stroke="none"/>}
        <rect x={x} y={y+h-6} width={w} height={6} rx={2}
          fill="#14151a" stroke="rgba(20,22,28,.8)" strokeWidth="0.7"/>
        {/* Compressor outline -- visible inside housing */}
        {(()=>{
          const capH=Math.round(h*0.24);
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
            <text x={cX+cW/2} y={y+h-22} textAnchor="middle"
              fill={active?cc:"rgba(80,85,95,.45)"} fontSize="11" fontFamily="monospace">COMP.</text>
          </g>;
        })()}
        {/* SEER badge */}
        <rect x={x+3} y={y+h-18} width={w-6} height={15} rx="2"
          fill={active?(refReversed?"url(#blue)":"url(#red-g)"):"url(#gold)"} opacity=".6"/>
        <text x={x+w/2} y={y+h-6} textAnchor="middle"
          fill="#fff" fontSize="12.5" fontFamily="monospace" fontWeight="700">{TL}</text>
      </>}
    </g>;
  }

  // rnd/OutsideZone now live at module scope, above Canvas - see the
  // comment there for why.


  // Condensate pump box - small labeled rect with a fixed 80x24 default,
  // shared by both the attic and closet layouts (each still routes its own
  // dashed connector line to it, since that routing differs per layout).
  function CondensatePump({x,y,w=88,h=28}){
    return <g className="fadein">
      <rect x={x} y={y} width={w} height={h} rx="3"
        fill="rgba(35,137,224,.14)" stroke={B+'.58)'} strokeWidth="1.2"/>
      <text x={x+w/2} y={y+13} textAnchor="middle"
        fill={B+'.82)'} fontSize="12.5" fontFamily="monospace">COND. PUMP</text>
      <text x={x+w/2} y={y+24} textAnchor="middle"
        fill={B+'.5)'} fontSize="11" fontFamily="monospace">condensate</text>
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
            <text x={pipe1X} y={roofY-6} textAnchor="middle" fill={B+'.6)'} fontSize="12" fontFamily="monospace">IN</text>
            <rect x={pipe2X-2} y={roofY} width={5} height={Math.max(0,BY-roofY)} rx="1" fill="rgba(249,115,22,.3)" stroke="rgba(249,115,22,.5)" strokeWidth="0.8"/>
            <path d={'M'+(pipe2X-4)+' '+(roofY-2)+' L'+pipe2X+' '+(roofY-9)+' L'+(pipe2X+4)+' '+(roofY-2)} fill="rgba(249,115,22,.4)"/>
            <text x={pipe2X} y={roofY-11} textAnchor="middle" fill="rgba(249,115,22,.6)" fontSize="12" fontFamily="monospace">OUT</text>
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
            <text x={BX+BW/2} y={BY+BH/2-1} textAnchor="middle" fill="#22c55e" fontSize="15.5">💧</text>
            <text x={BX+BW/2} y={BY+BH/2+12} textAnchor="middle" fill="#22c55e" fontSize="13" fontFamily="monospace">DEHU</text>
          </>
          :<>
            <path d={'M'+(BX+8)+' '+(BY+BH*0.44)+' L'+(BX+BW*0.52)+' '+(BY+BH*0.44)} fill="none" stroke={B+'.65)'} strokeWidth="1.6" markerEnd="url(#arr)"/>
            <path d={'M'+(BX+BW-8)+' '+(BY+BH*0.64)+' L'+(BX+BW*0.48)+' '+(BY+BH*0.64)} fill="none" stroke="rgba(249,115,22,.65)" strokeWidth="1.6" markerEnd="url(#arr)"/>
            <text x={BX+BW/2} y={BY+BH*0.3} textAnchor="middle" fill={G+'.78)'} fontSize="14.5" fontFamily="monospace">ERV</text>
          </>
        }
      </g>;
    })}</g>;
  }

  const Defs=()=><defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f0d64e"/><stop offset="100%" stopColor="#ab8024"/></linearGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#e4e7ed"/><stop offset="100%" stopColor="#8b93a3"/></linearGradient>
    {/* Cabinet refresh pass - a diagonal light-to-dark sweep (same slate
        hue family as S, just lightened/darkened at the ends) used for
        the furnace/air-handler cabinet's own border stroke, so the
        exterior reads as a beveled sheet-metal edge instead of a flat
        gray line. A flat single color on a stroke has no way to fake a
        bevel; a diagonal gradient stroke does. Only the border - the
        cabinet's dark interior stays a plain cutaway view of the
        components, unchanged. */}
    <linearGradient id="cabinet-edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#ccd2dc"/><stop offset="45%" stopColor="#8b93a3"/><stop offset="100%" stopColor="#4d5361"/>
    </linearGradient>
    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#1a6cb5"/><stop offset="100%" stopColor="#2389e0"/></linearGradient>
    <linearGradient id="red-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#b91c1c"/><stop offset="100%" stopColor="#ef4444"/></linearGradient>
    <linearGradient id="orange-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ea580c"/><stop offset="100%" stopColor="#f97316"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow-sm"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow-uv"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    {/* x/y/width/height widened from the SVG-filter default (-10%/120%)
        -- that default clipped the component labels' own status-line text
        (e.g. "ABSORBING HEAT" under A-COIL/AIR HANDLER) once their
        font-size grew for legibility and the text started extending
        further past the box's own bounding edges than the default
        filter region allowed for. */}
    <filter id="shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,.55)"/></filter>
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
  // sit directly on top of real equipment (the air handler/return plenum)
  // instead of the empty space above it, hiding it entirely rather than
  // just looking oversized. Below this width it swaps for a single compact
  // icon+temp pill row instead - same click targets/state, just a small
  // fraction of the vertical footprint. This was previously a flat 900,
  // which meant closet - whose frame is always ~320px narrower than
  // attic's at the same viewport width, thanks to the fixed-width sidebar
  // sitting beside it - fell into the compact variant across most of the
  // ordinary desktop window-width range, even though it reads noticeably
  // better full-size and attic almost never needed it. Re-measured the
  // actual overlap boundary directly (screenshotting the full-size stack
  // forced on in closet mode at a sweep of widths): clean with real margin
  // at a 650px frame, still overlapping the equipment at 600px. 700 keeps
  // that margin while giving closet the full-size stack across realistic
  // desktop widths, same as attic; phone/portrait-tablet frames (375-390,
  // 768 was already clean) still fall well under it into the safe compact
  // range.
  const compactToggle=frameBox&&frameBox.w>0&&frameBox.w<700;
  const ToggleUI=({style})=>{
    if(compactToggle){
      const modes=isDualFuel?[
        {key:'cool',icon:'❄',temp:'96°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'hp',icon:'🔥',temp:'52°',active:heatMode&&heatSubMode==='hp',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
        {key:'furnace',icon:'🔥',temp:'28°',active:heatMode&&heatSubMode==='furnace',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('furnace');}},
      ]:!hasFurnace?[
        {key:'cool',icon:'❄',temp:'96°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'hp',icon:'🔥',temp:'52°',active:heatMode&&heatSubMode==='hp',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
        {key:'aux',icon:'🔥',temp:'28°',active:heatMode&&heatSubMode==='aux',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('aux');}},
      ]:[
        {key:'cool',icon:'❄',temp:'96°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'heat',icon:'🔥',temp:'28°',active:heatMode,color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>setHeatMode(true)},
      ];
      return <div title="Not a control - tap to see how this system behaves in each mode" style={{display:'flex',background:'#0c0c0c',border:'1px solid rgba(215,183,64,.22)',borderRadius:3,overflow:'hidden',...style}}>
        {modes.map((m,i)=>
          <button key={m.key} onClick={m.onClick} style={{
            padding:'7px 10px',border:'none',borderLeft:i>0?'1px solid rgba(215,183,64,.18)':'none',cursor:'pointer',
            fontFamily:'monospace',fontSize:'12px',fontWeight:700,letterSpacing:'.02em',
            background:m.active?m.bg:'transparent',color:m.active?m.color:'rgba(255,255,255,.55)',
            transition:'all .2s',display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}}>
            <span style={{fontSize:11}}>{m.icon}</span><span>{m.temp}</span>
          </button>
        )}
      </div>;
    }
    return (
    <div className="fadein" title="Not a control - click to see how this system behaves in each mode" style={{display:'flex',flexDirection:'column',background:'#0c0c0c',border:'1px solid rgba(215,183,64,.22)',overflow:'hidden',...style}}>
      {/* Used to float above the box with no backing of its own, so its
          contrast rode on whatever part of the diagram happened to be
          behind it - fine over the near-black sky, illegible over
          anything brighter. Folded into the same box the mode buttons
          already have (own #0c0c0c background, same border) so it always
          reads clearly regardless of the diagram underneath. */}
      <div style={{padding:'5px 10px',fontFamily:'monospace',fontSize:'var(--fs-toggle-eyebrow)',letterSpacing:'.06em',color:'rgba(215,183,64,.75)',textAlign:'right',borderBottom:'1px solid rgba(215,183,64,.18)'}}>
        {/* Purely informational (current month), not a sales pitch - see
            the comment on isHeatingSeason above for why this is here. */}
        ▸ preview how your system runs · {CURRENT_MONTH_NAME}
      </div>
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
            background:heatMode&&heatSubMode==='hp'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='hp'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
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
            background:heatMode&&heatSubMode==='hp'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='hp'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
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
              <text x={RIDGE_X} y={RIDGE_Y+24} textAnchor="middle" fill="rgba(232,236,246,.5)" fontSize="12" fontFamily="monospace">SPRAY FOAM - SEALED ATTIC</text>
            </g>
            :<g>
              <rect x="0" y={DECK_Y-22} width={HOUSE_W} height={24} fill="rgba(255,130,170,.18)" stroke="rgba(255,140,180,.08)" strokeWidth="0.5"/>
              {Array.from({length:Math.floor(HOUSE_W/17)},(_,i)=>(
                <ellipse key={i} cx={8+i*17} cy={DECK_Y-7} rx={11} ry={8}
                  fill="rgba(255,182,193,.17)" stroke="rgba(255,182,193,.2)" strokeWidth=".45"/>
              ))}
              <text x={RIDGE_X} y={RIDGE_Y+24} textAnchor="middle" fill="rgba(255,182,193,.55)" fontSize="12" fontFamily="monospace">FIBERGLASS INSULATION</text>
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
          <text x="22" y={DECK_Y+18} fill={W+'.09)'} fontSize="12" fontFamily="monospace" letterSpacing="0.8">LIVING SPACE</text>

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
              fill="rgba(255,182,193,.6)" fontSize="12.5" fontFamily="monospace">RETURN</text>
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
              fill="rgba(255,182,193,.52)" fontSize="13" fontFamily="monospace"
              transform={`rotate(-45,${RET_X+RET_PLEN_W/2},${UNIT_Y+UNIT_H/2})`}>RETURN PLENUM</text>
            {Array.from({length:8},(_,i)=>(
              <line key={i} x1={RET_X+2} y1={UNIT_Y+12+i*(UNIT_H-24)/8}
                x2={RET_X+2} y2={UNIT_Y+18+i*(UNIT_H-24)/8}
                stroke="rgba(255,182,193,.32)" strokeWidth="2.8" strokeLinecap="round"/>
            ))}
            {/* Return airflow arrow, up from the grille and into the
                plenum, then a quick 90-degree turn to show air continuing
                onward - same bold glow+dash+arrowhead treatment as the
                supply plenum's own flow arrows. Rendered here (after the
                return-plenum's own rect/texture above, inside this same
                group) so it paints on top of the plenum's fill instead of
                underneath it. Deliberately stops well short of the
                plenum's right edge instead of continuing across the gap
                into the filtration cabinet or furnace - a straight arrow
                spanning that whole gap used to visually cross directly
                over the green FILTRATION box, reading as if the airflow
                ran through the filter rack rather than the return plenum
                doing the work of directing it there. Opposite heat/cool
                coloring from supply on purpose - this air hasn't been
                conditioned yet, it's on its way TO the coil/furnace, so
                it's colored the temperature it's about to be corrected
                FROM, not the temperature supply air already IS. */}
            {DECK_Y-(UNIT_Y+UNIT_H)>16&&<>
              <path d={`M${RET_X+RET_PLEN_W/2} ${DECK_Y-4} L${RET_X+RET_PLEN_W/2} ${UNIT_Y+UNIT_H*0.5} L${RET_X+RET_PLEN_W-16} ${UNIT_Y+UNIT_H*0.5}`}
                fill="none" stroke={(heatMode?B:O)+'.3)'} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
              <path d={`M${RET_X+RET_PLEN_W/2} ${DECK_Y-4} L${RET_X+RET_PLEN_W/2} ${UNIT_Y+UNIT_H*0.5} L${RET_X+RET_PLEN_W-16} ${UNIT_Y+UNIT_H*0.5}`}
                fill="none" stroke={(heatMode?B:O)+'.8)'} strokeWidth="1.4" strokeLinejoin="round"
                strokeDasharray="6 4" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
            </>}
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
              fill="#22c55e" fontSize="13" fontFamily="monospace"
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
              fill={furnaceActive?'rgba(249,115,22,.78)':(S+'.65)')} fontSize="13.5" fontFamily="monospace">FURNACE</text>
            <text x={FURN_X+FURN_W/2} y={UNIT_Y+UNIT_H+24} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.44)':'rgba(255,255,255,.15)'} fontSize="12" fontFamily="monospace">
              {furnaceActive?"GAS HEATING ACTIVE":"STANDBY"}
            </text>
          </g>}

          {/* A-coil (horizontal, right of furnace) */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'ac'+a.cond_tier} style={{animationDelay:'.08s'}} filter="url(#shadow)">
            {(()=>{
              const active=evapActive;
              return <>
                {/* Exterior housing stays silver in both states - see the
                    comment on FurnaceH's border/strip above. */}
                <rect x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={UNIT_H} rx="4"
                  fill={active?"#050c1c":"#090909"}
                  stroke="url(#cabinet-edge)" strokeOpacity="0.8" strokeWidth="1.5"/>
                {active&&<rect x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={UNIT_H} rx="4"
                  fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none"/>}
                <rect x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={7} rx="4"
                  fill="url(#silver)" opacity=".65"/>
                <CabinetStripBrushing x={ACOIL_X} y={UNIT_Y} w={ACOIL_W}/>
                {/* Left rivet nudged in from the edge (vs. the usual +7/+8)
                    - the refrigerant lineset's riser anchors at exactly
                    RL_START_X=ACOIL_X+8 (see its own comment above) and
                    climbs up right past this corner, so a rivet sitting
                    right at the edge lands half-hidden behind the pipe. */}
                <CabinetRivet cx={ACOIL_X+18} cy={UNIT_Y+3.5}/>
                <CabinetRivet cx={ACOIL_X+ACOIL_W-7} cy={UNIT_Y+3.5}/>
                <CabinetLatch cx={ACOIL_X+ACOIL_W/2+5} cy={UNIT_Y+3.5} w={12}/>
                <ACoilH x={ACOIL_X+8} y={UNIT_Y+12} w={ACOIL_W-16} h={UNIT_H-20} active={active}/>
                <rect x={ACOIL_X} y={UNIT_Y+UNIT_H-2} width={ACOIL_W} height={6} rx="1" fill="#08121e" stroke={B+'.18)'} strokeWidth="0.6"/>
                {/* Label moved above the coil - the space below is now clear
                    for the supply ducts to drop straight down with nothing
                    in their way */}
                <text x={ACOIL_X+ACOIL_W/2} y={UNIT_Y-16} textAnchor="middle"
                  fill={active?evapC:(S+'.6)')} fontSize="13.5" fontFamily="monospace">A-COIL</text>
                {/* Kept at the original 10px, unlike its sibling status
                    lines elsewhere in the diagram (font-size legibility
                    pass). This label is centered over a narrow coil box
                    (ACOIL_W, much tighter than the standalone air
                    handler's AH_W), and the refrigerant line's riser
                    (RL_START_X=ACOIL_X+8, see its own comment above) sits
                    almost exactly under where the text's left edge
                    already lands even at this original size - a
                    pre-existing, very marginal overlap (confirmed against
                    the unmodified file, not introduced by this pass) that
                    the "AB" of "ABSORBING HEAT" sometimes loses to the
                    pipe's foam-sleeve stroke. Enlarging this text the same
                    amount as its siblings widens it enough to make that
                    overlap worse/consistent, and the box is too narrow
                    (with the supply plenum starting only a few px past
                    its right edge) to shift the text clear on both sides
                    at a larger size without restructuring the box widths
                    - out of scope for a font-size-only pass, so this one
                    is left at its original size rather than compounding
                    the existing issue. */}
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
              fill={evapActive?evapC:(S+'.65)')} fontSize="13.5" fontFamily="monospace">AIR HANDLER</text>
            <text x={AH_X+AH_W/2} y={UNIT_Y-5} textAnchor="middle"
              fill={evapActive?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):(auxHeatActive?'rgba(249,115,22,.65)':'rgba(255,255,255,.14)')} fontSize="12" fontFamily="monospace">
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
                  fill={isExisting?(G+'.55)'):(G+'.52)')} fontSize="12.5" fontFamily="monospace">
                  {isExisting?'EXISTING PLENUM':isMetal?'METAL PLENUM':'DUCTBOARD PLENUM'}
                </text>
                {!isExisting&&<text x={SUP_X+SUP_PLEN_W/2} y={SUP_PLEN_Y+SUP_PLEN_H/2+16} textAnchor="middle"
                  fill={G+'.32)'} fontSize="11.5" fontFamily="monospace">4–6 FT SUPPLY</text>}
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
                    <text x={ionX+14} y={ionBulbY+4} textAnchor="start" fill="rgba(253,224,71,.45)" fontSize="11" fontFamily="monospace">IONIZER</text>
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
                  <text x={cx} y={DECK_Y+18} textAnchor="middle" fill={G+'.35)'} fontSize="11" fontFamily="monospace">SUPPLY</text>
                </>
              );
              // Airflow arrow down the center of a duct stem - same idea as
              // the supply plenum's own internal arrows just above, so flow
              // reads continuously from plenum through the duct to the
              // grille instead of stopping at the plenum. Kept to a single
              // thin dashed line (no glow underlay) since these stems are
              // only 14px wide - the bold treatment used elsewhere would
              // overwhelm a duct this narrow.
              const ductArrow=(d,key)=>(
                <path key={key} d={d} fill="none" stroke={(heatMode?O:B)+'.85)'} strokeWidth="1.6"
                  strokeDasharray="5 4" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
              );
              const straight=(cx,key)=>(
                <g key={key}>
                  <rect x={cx-DW/2} y={pBot} width={DW} height={Math.max(0,DECK_Y-pBot)} fill={DC} stroke={DS} strokeWidth="1"/>
                  {DECK_Y-pBot>10&&ductArrow(`M${cx},${pBot+3} L${cx},${DECK_Y-4}`,'arrow')}
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
                    {ductArrow(`M${topX},${pBot+3} L${botX},${bendY} L${botX},${DECK_Y-4}`,'arrow')}
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
                  <text x={TX+32} y={TY+30} textAnchor="middle" fill={B+'.95)'} fontSize="20.5"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <text x={TX+32} y={TY+41} textAnchor="middle" fill={B+'.55)'} fontSize="8"
                    fontFamily="monospace">{heatMode?'HEAT':'COOL'} · AUTO</text>
                  <circle cx={TX+56} cy={TY+9} r={1.6} fill={B+'.55)'}/>
                  <rect x={TX+5} y={TY+50} width={54} height="3" rx="1.5" fill={modeColor} opacity="0.8"/>
                  <text x={TX+32} y={TY+70} textAnchor="middle" fill={G+'.5)'} fontSize="10.5" fontFamily="monospace">COMMUNICATING</text>
                </>
                :isWifi
                ?<>
                  <circle cx={TX+32} cy={TY+30} r={28} fill="#0d0d0d" stroke={G+'.65)'} strokeWidth="1.6"/>
                  <circle cx={TX+32} cy={TY+30} r={22} fill="#060e1c" stroke={B+'.45)'} strokeWidth="1"/>
                  <text x={TX+32} y={TY+35} textAnchor="middle" fill={B+'.95)'} fontSize="18"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <path d={`M${TX+11} ${TY+30} A21 21 0 0 1 ${TX+53} ${TY+30}`}
                    fill="none" stroke={modeColor} strokeWidth="2.2" strokeLinecap="round" opacity="0.55"/>
                  <path d={`M${TX+21} ${TY+48} Q${TX+32} ${TY+41} ${TX+43} ${TY+48}`}
                    fill="none" stroke={B+'.5)'} strokeWidth="1.5" strokeLinecap="round"/>
                  <path d={`M${TX+24} ${TY+52} Q${TX+32} ${TY+47} ${TX+40} ${TY+52}`}
                    fill="none" stroke={B+'.7)'} strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx={TX+32} cy={TY+56} r={2.2} fill={B+'.8)'}/>
                  <text x={TX+32} y={TY+68} textAnchor="middle" fill={G+'.5)'} fontSize="10.5" fontFamily="monospace">WI-FI SMART</text>
                </>
                :<>
                  <rect x={TX} y={TY} width={64} height={54} rx="3"
                    fill="#0d0d0d" stroke={G+'.58)'} strokeWidth="1.4"/>
                  <rect x={TX+4} y={TY+5} width={56} height={28} rx="2"
                    fill="#050d18" stroke={B+'.38)'} strokeWidth="0.8"/>
                  <text x={TX+32} y={TY+24} textAnchor="middle" fill={B+'.92)'} fontSize="20"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  {[7,18,29,40,51].map((bx,i)=>(
                    <rect key={i} x={TX+bx} y={TY+38} width="7" height="4" rx="1"
                      fill={G+'.22)'} stroke={G+'.12)'} strokeWidth="0.4"/>
                  ))}
                  <text x={TX+32} y={TY+50} textAnchor="middle" fill={G+'.42)'} fontSize="10" fontFamily="monospace">BASIC PROGRAMMABLE</text>
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
                const pW=88, pH=28;
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
                    fill={B+'.35)'} fontSize="12" fontFamily="monospace">DRAIN</text>
                </>;
              }
            })()}
          </g>}

          {/* LIVE SYSTEM PREVIEW label */}
          {loc&&<text x={12} y={EAVE_Y-4} fill={G+'.22)'} fontSize="11" fontFamily="monospace" letterSpacing=".18em">LIVE SYSTEM PREVIEW</text>}

          {/* Empty state */}
          {!loc&&<g>
            <text x={HOUSE_W/2} y={VH/2-10} textAnchor="middle" fill={G+'.12)'} fontSize="15.5" fontFamily="monospace">Choose your location to begin building</text>
            <text x={HOUSE_W/2} y={VH/2+8} textAnchor="middle" fill={G+'.06)'} fontSize="13" fontFamily="monospace">Components assemble here in real time →</text>
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
            fill={W+'.1)'} fontSize="12" fontFamily="monospace" letterSpacing="1.5">UTILITY CLOSET</text>

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
                  <text x="22" y={DECK_Y-24} fill="rgba(232,236,246,.3)" fontSize="12" fontFamily="monospace">SPRAY FOAM</text>
                </>;
              })()}
            </>
            :<>
              {Array.from({length:Math.floor((hasCond?HOUSE_W:VW-8)/17)},(_,i)=>(
                <ellipse key={i} cx={8+i*17} cy={DECK_Y-8} rx={11} ry={7}
                  fill="rgba(255,182,193,.15)" stroke="rgba(255,182,193,.19)" strokeWidth=".4"/>
              ))}
              <text x="22" y={DECK_Y-22} fill="rgba(255,182,193,.3)" fontSize="12" fontFamily="monospace">FIBERGLASS INSULATION</text>
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
          <text x="22" y="16" fill={W+'.14)'} fontSize="12" fontFamily="monospace" letterSpacing="0.8">ATTIC</text>



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
                {/* Plenum label - moved up from 0.58 to 0.38 of the box's
                    total height. At 0.58 it sat only ~8px above the supply
                    airflow arrows' own "SUPPLY" labels (PLEN_ABOVE*0.92) -
                    tight but clear at this text's original, smaller
                    font-size; enlarging both labels for legibility closed
                    that gap enough for them to visually overlap. Moving
                    this label further up into the plenum's own otherwise-
                    empty top area restores clearance without shrinking
                    either label back down. */}
                <text x={UNIT_X+PLEN_W/2} y={PLEN_TOP+PLEN_TOTAL*0.38+3} textAnchor="middle"
                  fill={isExisting?(G+'.55)'):(G+'.5)')} fontSize="11" fontFamily="monospace">
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
                      fill={G+'.3)'} fontSize="12" fontFamily="monospace">SUPPLY</text>
                  </g>
                ))}
                {/* Ionizer - horizontal from right. Shows regardless of
                    whether the plenum is new or existing - same as the
                    attic layout's equivalent ionizer block, which has never
                    had an isExisting gate. An ionizer mounts inside the
                    plenum itself, existing or not, so "keep existing
                    plenum" has no bearing on whether it can be added. */}
                {hasIonizer&&(()=>{
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
                    <text x={bulbX+18} y={rodY+4} textAnchor="start" fill="rgba(253,224,71,.45)" fontSize="11" fontFamily="monospace">IONIZER</text>
                  </g>;
                })()}
              </>;
            })()}
          </g>}

          {hasPlenum&&hasCoil&&<EditZone stepId="plenum"
            x={UNIT_X-2} y={PLEN_TOP-2} w={PLEN_W+4} h={PLEN_TOTAL+4} rx={5}/>}

          {/* Upflow supply ducts - exit plenum sides, run long, drop to ceiling grille.
              Ducts route off the plenum whether the plenum itself is new or
              existing ("Keep existing" only changes the plenum box's own
              styling above, not whether the home has downstream ductwork) -
              same as the attic layout's equivalent block just below, which
              never had this extra a.plenum!=='none' condition. */}
          {hasPlenum&&hasCoil&&<g className="fadein" key="upflow-ducts" style={{animationDelay:'.2s'}}>
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
              // Airflow arrow along a duct's own horizontal-then-vertical
              // path - same idea as the supply plenum's own internal
              // arrows, so flow reads continuously from plenum through the
              // duct to the grille. Thin/no-glow, matching the attic
              // layout's own duct stems (13-14px ducts are too narrow for
              // the bolder plenum-arrow treatment).
              const ductArrow=(d,key)=>(
                <path key={key} d={d} fill="none" stroke={(heatMode?O:B)+'.85)'} strokeWidth="1.6"
                  strokeDasharray="5 4" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
              );
              // Vertical drop goes from exitY down to DECK_Y
              return <>
                {/* ── LEFT DUCT ── */}
                {/* Horizontal run from plenum left face outward */}
                <rect x={leftDropX} y={exitY} width={UNIT_X-leftDropX} height={DW} fill={DC} stroke={DS} strokeWidth="1"/>
                {/* Vertical drop from horizontal run down to deck */}
                <rect x={leftDropX} y={exitY} width={DW} height={DECK_Y-exitY} fill={DC} stroke={DS} strokeWidth="1"/>
                {ductArrow(`M${UNIT_X-3},${exitY+DW/2} L${leftDropX+DW/2},${exitY+DW/2} L${leftDropX+DW/2},${DECK_Y-4}`,'la')}
                {/* Ceiling grille at DECK_Y */}
                <rect x={leftDropX-GW/2+DW/2} y={DECK_Y} width={GW} height={9} rx="1"
                  fill="rgba(0,0,0,.75)" stroke={DC} strokeWidth="1.2"/>
                {Array.from({length:5},(_,i)=>(
                  <line key={i} x1={leftDropX-GW/2+DW/2+3+i*(GW-6)/4} y1={DECK_Y+1}
                    x2={leftDropX-GW/2+DW/2+3+i*(GW-6)/4} y2={DECK_Y+8}
                    stroke={DC} strokeWidth="0.8"/>
                ))}
                <text x={leftDropX+DW/2} y={DECK_Y+18} textAnchor="middle"
                  fill={G+'.35)'} fontSize="11" fontFamily="monospace">SUPPLY</text>

                {/* ── RIGHT DUCT ── */}
                {/* Horizontal run from plenum right face outward */}
                <rect x={UNIT_X+PLEN_W} y={exitY} width={rightDropX-(UNIT_X+PLEN_W)+DW} height={DW} fill={DC} stroke={DS} strokeWidth="1"/>
                {/* Vertical drop down to deck */}
                <rect x={rightDropX} y={exitY} width={DW} height={DECK_Y-exitY} fill={DC} stroke={DS} strokeWidth="1"/>
                {ductArrow(`M${UNIT_X+PLEN_W+3},${exitY+DW/2} L${rightDropX+DW/2},${exitY+DW/2} L${rightDropX+DW/2},${DECK_Y-4}`,'ra')}
                {/* Ceiling grille at DECK_Y */}
                <rect x={rightDropX-GW/2+DW/2} y={DECK_Y} width={GW} height={9} rx="1"
                  fill="rgba(0,0,0,.75)" stroke={DC} strokeWidth="1.2"/>
                {Array.from({length:5},(_,i)=>(
                  <line key={i} x1={rightDropX-GW/2+DW/2+3+i*(GW-6)/4} y1={DECK_Y+1}
                    x2={rightDropX-GW/2+DW/2+3+i*(GW-6)/4} y2={DECK_Y+8}
                    stroke={DC} strokeWidth="0.8"/>
                ))}
                <text x={rightDropX+DW/2} y={DECK_Y+18} textAnchor="middle"
                  fill={G+'.35)'} fontSize="11" fontFamily="monospace">SUPPLY</text>
              </>;
            })()}
          </g>}

          {/* A-coil / AH */}
          {hasCoil&&<g className="snap" key={'ac-c'+a.cond_tier} style={{animationDelay:'.07s'}}>
            {(()=>{
              const active=evapActive;
              return <>
                {/* Exterior housing stays silver in both states - see the
                    comment on FurnaceH's border/strip above. */}
                <rect x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={ACOIL_H} rx="5"
                  fill={active?"#050c1c":"#090909"}
                  stroke="url(#cabinet-edge)" strokeOpacity="0.8" strokeWidth="1.5"/>
                {active&&<rect x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={ACOIL_H} rx="5"
                  fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none"/>}
                <rect x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={7} rx="5"
                  fill="url(#silver)" opacity=".65"/>
                <CabinetStripBrushing x={UNIT_X} y={ACOIL_Y} w={UNIT_W}/>
                <CabinetRivet cx={UNIT_X+8} cy={ACOIL_Y+3.5}/>
                <CabinetRivet cx={UNIT_X+UNIT_W-8} cy={ACOIL_Y+3.5}/>
                <CabinetLatch cx={UNIT_X+UNIT_W/2} cy={ACOIL_Y+3.5} w={13}/>
                {/* Only in the furnace-paired case - when this box is a
                    standalone air handler, the "ABSORBING HEAT"/"STANDBY"
                    status line sits inside the box right here (anchored to
                    ACOIL_Y+20, see that text's own comment below) and a
                    plate at this spot would sit on top of it. */}
                {hasFurnace&&<CabinetPlate x={UNIT_X+8} y={ACOIL_Y+11} w={36}/>}
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
                      stroke={S+'.26)'} strokeWidth="0.9" strokeDasharray="4 3"/>
                    <line x1={UNIT_X} y1={ACOIL_Y+ACOIL_H*0.53} x2={UNIT_X+UNIT_W} y2={ACOIL_Y+ACOIL_H*0.53}
                      stroke={S+'.26)'} strokeWidth="0.9" strokeDasharray="4 3"/>
                    <AuxHeatKit x={UNIT_X+14} y={ACOIL_Y+ACOIL_H*0.09} w={UNIT_W-28} h={ACOIL_H*0.14} auxHeat={auxHeatActive}/>
                    <BlowerWheel cx={UNIT_X+UNIT_W/2} cy={ACOIL_Y+ACOIL_H*0.33}
                      r={Math.min(UNIT_W*0.24,ACOIL_H*0.105)}
                      spd={blowerActive?1.4:0.4} active={blowerActive}/>
                    <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y+ACOIL_H*0.465} textAnchor="middle"
                      fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">BLOWER</text>
                    <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y+ACOIL_H*0.50} textAnchor="middle"
                      fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
                    <ACoilV x={UNIT_X+8} y={COIL_BOX_Y} w={UNIT_W-16} h={COIL_BOX_H} active={active}/>
                  </>
                }
                {hasCond&&!hasFurnace&&<>
                  <path d={`M${UNIT_X+UNIT_W} ${LS_Y1} L${UNIT_X+UNIT_W+28} ${LS_Y1}`}
                    fill="none" stroke={active?evapC:'rgba(32,32,52,.5)'} strokeWidth="2.8" strokeLinecap="round" className="draw"/>
                  <path d={`M${UNIT_X+UNIT_W} ${LS_Y2} L${UNIT_X+UNIT_W+28} ${LS_Y2}`}
                    fill="none" stroke={active?evapC2:'rgba(32,32,52,.4)'} strokeWidth="2.8" strokeLinecap="round" className="draw" style={{animationDelay:'.08s'}}/>
                  {active&&<text x={UNIT_X+UNIT_W+14} y={LS_Y1-8}
                    textAnchor="middle" fill={evapC} fontSize="13" fontFamily="monospace">
                    {refReversed?'←':'→'}
                  </text>}
                </>}
                <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y-6} textAnchor="middle"
                  fill={active?evapC:(S+'.45)')} fontSize="12" fontFamily="monospace">
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
                  fill={active?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):(auxHeatActive?'rgba(249,115,22,.65)':'rgba(255,255,255,.14)')} fontSize="12" fontFamily="monospace">
                  {active?(refReversed?"REJECTING HEAT":"ABSORBING HEAT"):(auxHeatActive?"AUX HEAT ONLY":"STANDBY")}
                </text>
              </>;
            })()}
          </g>}

          {/* Furnace - HX top | blower bottom */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'fu-c'+a.stage}>
            {/* Exterior housing stays silver in both states - see the
                comment on FurnaceH's border/strip above. */}
            <rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={FURN_H} rx="5"
              fill={furnaceActive?"#0e0606":"#090909"}
              stroke="url(#cabinet-edge)" strokeOpacity="0.85" strokeWidth="1.7"/>
            {furnaceActive&&<rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={FURN_H} rx="5"
              fill={O+'.04)'} stroke="none"/>}
            <rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={7} rx="5"
              fill="url(#silver)" opacity=".72"/>
            <CabinetStripBrushing x={UNIT_X} y={FURN_Y} w={UNIT_W}/>
            <CabinetRivet cx={UNIT_X+8} cy={FURN_Y+3.5}/>
            <CabinetRivet cx={UNIT_X+UNIT_W-8} cy={FURN_Y+3.5}/>
            <CabinetLatch cx={UNIT_X+UNIT_W/2} cy={FURN_Y+3.5} w={14}/>
            {/* AFUE/COMMUNICATING spec badges - the attic furnace (FurnaceH)
                has always shown these; the closet furnace never did, a
                drift between the two layouts' otherwise-shared "furnace
                cabinet" language found in this pass's audit. Placed on
                the right so the badge background simply sits in front of
                the HX curve pattern's right tail (same as the attic
                version's badge already overlaps its own HX curves) rather
                than fight it for space. */}
            {isComm&&<><rect x={UNIT_X+6} y={FURN_Y+11} width={78} height="11" rx="2" fill="url(#blue)"/>
              <text x={UNIT_X+9} y={FURN_Y+19.5} fill="#fff" fontSize="9" fontFamily="monospace">COMMUNICATING</text></>}
            <rect x={UNIT_X+UNIT_W-46} y={FURN_Y+11} width={40} height="9" rx="2"
              fill={is90?"rgba(35,137,224,.13)":(G+'.07)')} stroke={is90?(B+'.24)'):(G+'.16)')} strokeWidth="0.5"/>
            <text x={UNIT_X+UNIT_W-26} y={FURN_Y+18} textAnchor="middle" fill={is90?"#5ba8f5":(G+'.6)')} fontSize="9.5" fontFamily="monospace">{is90?'90%':'80%'} AFUE</text>
            <line x1={UNIT_X} y1={FURN_Y+FURN_H/2} x2={UNIT_X+UNIT_W} y2={FURN_Y+FURN_H/2}
              stroke={S+'.28)'} strokeWidth="0.9" strokeDasharray="4 3"/>
            {/* TOP: HX */}
            {Array.from({length:5},(_,i)=>(
              <path key={i}
                d={`M${UNIT_X+8} ${FURN_Y+12+i*((FURN_H/2-20)/5)} Q${UNIT_X+UNIT_W/2} ${FURN_Y+6+i*((FURN_H/2-20)/5)} ${UNIT_X+UNIT_W-8} ${FURN_Y+12+i*((FURN_H/2-20)/5)}`}
                fill="none" stroke={furnaceActive?'rgba(249,115,22,.56)':'rgba(108,44,8,.18)'}
                strokeWidth="2.6" strokeLinecap="round"/>
            ))}
            <rect x={UNIT_X+6} y={FURN_Y+FURN_H/2-13} width={UNIT_W-12} height={10} rx="2"
              fill={furnaceActive?O+'.07)':'rgba(5,5,13,.8)'}
              stroke={furnaceActive?'rgba(249,115,22,.42)':(S+'.2)')} strokeWidth="0.6"/>
            {furnaceActive&&Array.from({length:4},(_,i)=>(
              <ellipse key={i} cx={UNIT_X+14+i*((UNIT_W-14)/4)} cy={FURN_Y+FURN_H/2-13}
                rx={(UNIT_W-14)/10} ry={5}
                fill={O+'.55)'} className="glow-pulse" style={{animationDelay:i*0.12+'s'}}/>
            ))}
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H/4+6} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.75)':(S+'.6)')} fontSize="12.5" fontFamily="monospace">HEAT EXCH.</text>
            {/* BOTTOM: blower */}
            <BlowerWheel cx={UNIT_X+UNIT_W/2} cy={FURN_Y+FURN_H*0.70}
              r={Math.min(UNIT_W*0.32,FURN_H*0.155)}
              spd={blowerActive?1.55:0.5} active={blowerActive}/>
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H-15} textAnchor="middle"
              fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">BLOWER</text>
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H-6} textAnchor="middle"
              fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
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
                  fill={is90?"rgba(147,197,253,.5)":"rgba(148,148,148,.44)"} fontSize="11.5" fontFamily="monospace">
                  {is90?'PVC':'B-VENT'}
                </text>
              </>;
            })()}
            {isComm&&<><rect x={UNIT_X+4} y={FURN_Y+10} width={82} height="11" rx="2" fill="url(#blue)"/><text x={UNIT_X+7} y={FURN_Y+18.5} fill="#fff" fontSize="9.5" fontFamily="monospace">COMMUNICATING</text></>}
            {/* Kept at the original 9.5px, unlike its sibling "FURNACE"
                label in the attic layout. Confirmed against the unmodified
                file: the flue's exit stub (EXIT_X=UNIT_X+UNIT_W*0.38, in
                the routing block above) already sits almost exactly under
                this centered label's left edge even at the original size,
                a pre-existing near-miss (not introduced by this pass)
                where the pipe's stroke width wins the pixel and the "F" of
                "FURNACE" goes missing. Enlarging this text widens it
                enough to make that overlap worse, and there isn't a clean
                same-size fix without moving the flue's exit point (which
                is deliberately anchored to the furnace's own HX geometry,
                not this label) - out of scope for a font-size-only pass,
                so left at its original size. */}
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y-13} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.78)':(S+'.65)')} fontSize="9.5" fontFamily="monospace">FURNACE</text>
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
              fill="#22c55e" fontSize="12" fontWeight="700" fontFamily="monospace">FILTRATION CABINET</text>
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
            {/* Return airflow arrow, up the chase into the unit - same bold
                glow+dash+arrowhead treatment as the supply plenum's own
                flow arrows above, instead of the thin static line this
                used to be. Opposite heat/cool coloring from supply on
                purpose - this air hasn't been conditioned yet, it's on its
                way TO the coil/furnace, so it's colored the temperature
                it's about to be corrected FROM, not the temperature supply
                air already IS. */}
            <path d={`M${UNIT_X+UNIT_W/2} ${VH-20} L${UNIT_X+UNIT_W/2} ${CHASE_Y+10}`}
              fill="none" stroke={(heatMode?B:O)+'.3)'} strokeWidth="7" strokeLinecap="round" opacity="0.4"/>
            <path d={`M${UNIT_X+UNIT_W/2} ${VH-20} L${UNIT_X+UNIT_W/2} ${CHASE_Y+10}`}
              fill="none" stroke={(heatMode?B:O)+'.8)'} strokeWidth="1.4"
              strokeDasharray="6 4" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
            <text x={UNIT_X+UNIT_W/2} y={VH-8} textAnchor="middle"
              fill="rgba(138,98,42,.62)" fontSize="11.5" fontFamily="monospace">2×4 RETURN AIR CHASE</text>
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
            const pumpH=28;
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
                  fill={B+'.4)'} fontSize="11.5" fontFamily="monospace">DRAIN</text>
                <circle cx={pt3X} cy={pt3Y} r={3} fill={B+'.4)'} stroke={B+'.6)'} strokeWidth="0.8"/>
              </>}
              {hasPump&&<>
                <CondensatePump x={pumpX} y={pumpY} w={88} h={pumpH}/>
                <line x1={pt3X} y1={pt3Y} x2={pumpX+88} y2={pumpY+pumpH/2}
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
            {/* Flow dots -- both pipes. Gated on evapActive, same as the
                attic layout's equivalent block - refrigerant only actually
                moves through these lines while the compressor is active
                (e.g. NOT during dual-fuel's furnace sub-mode, where the
                heat pump/compressor is off and the furnace alone is
                heating). This lacked that gate here, so the dots kept
                animating flow even with the compressor in standby. */}
            {evapActive&&Array.from({length:6},(_,i)=>{
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
                  <text x={TX+38} y={TY+35} textAnchor="middle" fill={B+'.95)'} fontSize="23.5"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <text x={TX+38} y={TY+48} textAnchor="middle" fill={B+'.55)'} fontSize="9"
                    fontFamily="monospace">{heatMode?'HEAT':'COOL'} · AUTO</text>
                  <circle cx={TX+67} cy={TY+11} r={1.9} fill={B+'.55)'}/>
                  <rect x={TX+6} y={TY+59} width={64} height="3.5" rx="1.75" fill={modeColorC} opacity="0.8"/>
                  <text x={TX+38} y={TY+82} textAnchor="middle" fill={G+'.45)'} fontSize="11.5" fontFamily="monospace">COMMUNICATING</text>
                </>
                :isWifiC
                ?<>
                  <circle cx={TX+38} cy={TY+38} r={36} fill="#0d0d0d" stroke={G+'.62)'} strokeWidth="1.8"/>
                  <circle cx={TX+38} cy={TY+38} r={28} fill="#060e1c" stroke={B+'.42)'} strokeWidth="1.1"/>
                  <text x={TX+38} y={TY+43} textAnchor="middle" fill={B+'.92)'} fontSize="21"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  <path d={`M${TX+12} ${TY+38} A26 26 0 0 1 ${TX+64} ${TY+38}`}
                    fill="none" stroke={modeColorC} strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
                  <path d={`M${TX+24} ${TY+62} Q${TX+38} ${TY+53} ${TX+52} ${TY+62}`}
                    fill="none" stroke={B+'.5)'} strokeWidth="1.8" strokeLinecap="round"/>
                  <path d={`M${TX+28} ${TY+67} Q${TX+38} ${TY+61} ${TX+48} ${TY+67}`}
                    fill="none" stroke={B+'.7)'} strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx={TX+38} cy={TY+71} r={2.5} fill={B+'.8)'}/>
                  <text x={TX+38} y={TY+85} textAnchor="middle" fill={G+'.45)'} fontSize="11.5" fontFamily="monospace">WI-FI SMART</text>
                </>
                :<>
                  <rect x={TX} y={TY} width={76} height={62} rx="3"
                    fill="#0d0d0d" stroke={G+'.55)'} strokeWidth="1.6"/>
                  <rect x={TX+5} y={TY+6} width={66} height={34} rx="2"
                    fill="#050d18" stroke={B+'.36)'} strokeWidth="0.9"/>
                  <text x={TX+38} y={TY+28} textAnchor="middle" fill={B+'.9)'} fontSize="21"
                    fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
                  {[10,24,38,52,66].map((bx,i)=>(
                    <rect key={i} x={TX+bx-4} y={TY+46} width="9" height="5" rx="1.5"
                      fill={G+'.22)'} stroke={G+'.12)'} strokeWidth="0.4"/>
                  ))}
                  <text x={TX+38} y={TY+58} textAnchor="middle" fill={G+'.38)'} fontSize="11" fontFamily="monospace">BASIC</text>
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
