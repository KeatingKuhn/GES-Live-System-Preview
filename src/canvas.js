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

// Eases a numeric target toward its new value over `duration`ms instead of
// snapping - used for the condenser fan's RPM (CondenserFan below) so a
// mode toggle's speed change reads as spooling up/down rather than an
// instant jump-cut. Kept generic (any number, not just fan speed) and
// self-contained: continuing mid-transition when the target changes again
// starts from wherever the eased value currently sits, not from the old
// target, so a quick double-toggle never stutters back to a stale start
// point. Deliberately NOT used for colors (those already ease for free via
// the .phase-color CSS transition on the `fill`/`stroke` attribute itself,
// no rAF/re-render needed) - this hook is only for values, like animation-
// duration, that CSS can't interpolate on its own.
function useLerpedNumber(target,duration=2500){
  const [display,setDisplay]=useState(target);
  const displayRef=useRef(target);
  const rafRef=useRef(null);
  React.useEffect(()=>{
    if(target===displayRef.current)return;
    const from=displayRef.current;
    const start=performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick=(now)=>{
      const t=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-t,3);
      const next=from+(target-from)*eased;
      displayRef.current=next;
      setDisplay(next);
      if(t<1)rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[target,duration]);
  return display;
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
  heatMode, isMildHp, refReversed, isSurge, condC, line1C, line2C, G, W, condenserEl, tierKey, eaveY,
  lang, vw, vh, linesetRingPath}){
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
    {/* ── GROUND ──
         QA FIX - same fix as the CONCRETE PAD block below: this purely
         decorative rect/ticks/label had no pointer-events style, and its
         footprint runs the full width of the outside zone at ground
         level - directly under where the condenser's own EditZone needs
         to catch clicks along its bottom edge. Confirmed via
         elementFromPoint that this text element (GROUND LEVEL's own
         label) was winning the hit-test at one of the dead-click points
         found in QA. pointerEvents:none lets clicks fall through to the
         EditZone underneath. */}
    <g style={{pointerEvents:'none'}}>
      <rect x={wallX} y={groundY} width={zoneW} height={zoneH-groundY} fill="#0c0b08" stroke="none"/>
      {Array.from({length:10},(_,i)=>(
        <line key={i} x1={wallX+i*(zoneW/10)} y1={groundY} x2={wallX+i*(zoneW/10)+10} y2={groundY+8}
          stroke="rgba(90,80,45,.2)" strokeWidth="0.7"/>
      ))}
      <text x={wallX+zoneW/2} y={groundY+18} textAnchor="middle"
        fill="rgba(110,95,55,.45)" fontSize="12.5" fontFamily="monospace">{CT('GROUND LEVEL',lang)}</text>
    </g>

    {/* ── SNOW - furnace/aux-heat cold-snap mode only. Fades in/out
         instead of popping, so switching modes reads as a season
         passing rather than an instant background swap. An uneven
         drifted blanket (snow piles unevenly, and gathers deeper
         against the condenser pad) plus three depth layers of flakes
         that actually fall the full height of the zone with a gentle
         side-to-side sway, instead of a flat grid barely jittering in
         place. ── */}
    <g style={{opacity:(heatMode&&!isMildHp)?1:0,transition:'opacity 2.5s ease'}}>
      {/* Snowflake icon, same slot/anchor point as the sun (cool mode)
          and cloud (mild-HP mode) just below - 6 spokes with a small
          V-branch near each tip, the classic snowflake silhouette,
          reads unambiguously as "cold" at a glance the way the sun
          reads as "hot" - a plain cloud shape here didn't distinguish
          cold-snap from the mild-HP overcast state below it. */}
      {(()=>{
        const sx=wallX+zoneW*0.25, sy=zoneH*0.075+18;
        return <g stroke="#cfe0f5" strokeWidth="1.6" strokeLinecap="round" fill="none">
          {Array.from({length:6},(_,i)=>{
            const ang=i*Math.PI/3;
            const ux=Math.cos(ang), uy=Math.sin(ang);
            const px=-uy, py=ux;
            const bx=sx+ux*9, by=sy+uy*9;
            return <g key={i}>
              <line x1={sx+ux*3} y1={sy+uy*3} x2={sx+ux*13} y2={sy+uy*13}/>
              <line x1={bx} y1={by} x2={bx+ux*3+px*3} y2={by+uy*3+py*3}/>
              <line x1={bx} y1={by} x2={bx+ux*3-px*3} y2={by+uy*3-py*3}/>
            </g>;
          })}
          <circle cx={sx} cy={sy} r="1.6" fill="#cfe0f5" stroke="none"/>
        </g>;
      })()}
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
    <g style={{opacity:!heatMode?1:0,transition:'opacity 2.5s ease'}}>
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


    {/* ── CLOUD + RAIN - any system's mild 60° heat-pump preview (dual-fuel
         HEAT PUMP, or a heat-pump-only system's own HEAT PUMP mode before
         it drops to 32° AUX HEAT) - overcast rather than sunny or snowed in,
         same slot and reasoning as the sun above. Three depth layers of
         streaks (same treatment as the snow above) fall the full height
         of the zone along one consistent wind angle, so it reads as a
         wind-driven sheet of rain rather than a static grid of identical
         ticks. A faint wet sheen and a few splash flashes along the
         ground sell "it's actually landing down here" too. ── */}
    <g style={{opacity:(heatMode&&isMildHp)?1:0,transition:'opacity 2.5s ease'}}>
      <ellipse cx={wallX+zoneW*0.25-9} cy={zoneH*0.075+20} rx="10" ry="7" fill="#8a94a3"/>
      <ellipse cx={wallX+zoneW*0.25+4} cy={zoneH*0.075+15} rx="12" ry="8.5" fill="#9aa3b0"/>
      <ellipse cx={wallX+zoneW*0.25+17} cy={zoneH*0.075+20} rx="9" ry="6.5" fill="#8a94a3"/>
      <rect x={wallX} y={groundY-4} width={zoneW} height={4} fill="rgba(122,184,224,.14)"/>
      {rainField}
    </g>

    {/* ── CONCRETE PAD - under condenser ──
         QA FIX - this purely decorative rect (plus its expansion-joint
         lines and label) had no pointer-events style at all, and its own
         footprint (condX-10..condX+condW+10) sits directly under the
         condenser, right where the cond_tier EditZone's own clickable box
         also needs to catch clicks - confirmed via elementFromPoint that
         this rect, not the EditZone, was winning the hit-test along the
         condenser's bottom edge, making clicks there silently dead
         instead of jumping to the efficiency-tier quick-edit. Same
         "decorative layer sits on top of an interactive zone" bug this
         file already fixes elsewhere - pointerEvents:none lets clicks
         fall through to the EditZone underneath. */}
    <g style={{pointerEvents:'none'}}>
      <rect x={condX-10} y={padY} width={condW+20} height={14} rx="2"
        fill="rgba(165,160,148,.22)" stroke="rgba(190,185,168,.28)" strokeWidth="1"/>
      {Array.from({length:5},(_,i)=>(
        <line key={i} x1={condX+i*(condW+20)/5-10} y1={padY+2}
          x2={condX+i*(condW+20)/5-10} y2={padY+12}
          stroke="rgba(190,185,168,.1)" strokeWidth="0.5"/>
      ))}
      <text x={condX+condW/2} y={padY+10} textAnchor="middle"
        fill="rgba(170,160,140,.4)" fontSize="12.5" fontFamily="monospace">{CT('CONCRETE PAD',lang)}</text>
    </g>

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
      // Right above the pad, so the entry reads as low on the cabinet.
      const exitY1=condY+condH*0.78;
      const exitY2=condY+condH*0.86;
      // Diagonal tick marks along a polyline - the wrapped-tape look of a
      // real lineset's insulation jacket (a spiral of vinyl tape over the
      // foam sleeve), at a 45°-ish lean rather than perpendicular rings
      // (DuctRibbing's own convention, reserved for flex-duct's actual
      // wire-corrugation look) so the two materials read distinctly.
      const wrapTicks=(pts,width,opacity)=>{
        const out=[];
        for(let s=0;s<pts.length-1;s++){
          const [x1,y1]=pts[s], [x2,y2]=pts[s+1];
          const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
          const ux=dx/len, uy=dy/len, px=-uy, py=ux;
          const n=Math.max(1,Math.floor(len/7));
          for(let i=0;i<n;i++){
            const t=(i+0.5)*7;
            const cx=x1+ux*t, cy=y1+uy*t, skew=width*0.4;
            out.push(<line key={s+'_'+i} x1={cx-px*width/2-ux*skew} y1={cy-py*width/2-uy*skew}
              x2={cx+px*width/2+ux*skew} y2={cy+py*width/2+uy*skew}
              stroke={`rgba(0,0,0,${opacity})`} strokeWidth="0.9"/>);
          }
        }
        return out;
      };
      // Flanged wall bushing - the raised trim collar every real lineset
      // wall penetration actually has around the sealed hole, not just a
      // flat tinted rectangle standing in for "there's a hole here".
      const bushing=(by1,by2,key)=>(
        <g key={key}>
          <rect x={sidingX+1} y={by1-6} width={wallThick-2} height={by2-by1+12} rx="2"
            fill="rgba(120,85,30,.25)" stroke="rgba(150,110,40,.35)" strokeWidth="0.8"/>
          <rect x={sidingX-1.5} y={by1-8} width={wallThick+3} height={by2-by1+16} rx="2.5"
            fill="none" stroke="rgba(180,150,80,.4)" strokeWidth="1"/>
          <circle cx={sidingX+2.5} cy={by1-6.5} r="1" fill="rgba(190,160,90,.55)"/>
          <circle cx={sidingX+wallThick-2.5} cy={by2+7.5} r="1" fill="rgba(190,160,90,.55)"/>
        </g>
      );
      return <>
        {bushing(lineY1,lineY2,'busTop')}
        {bushing(exitY1,exitY2,'busBot')}
        <text x={sidingX+wallThick/2} y={exitY2+16} textAnchor="middle"
          fill="rgba(150,110,40,.5)" fontSize="11.5" fontFamily="monospace">{CT('LINESET',lang)}</text>
        {/* Foam sleeve on pipes - down inside the wall, then into the condenser */}
        <path d={`M${px1} ${lineY1} L${px1} ${exitY1} L${condX} ${exitY1}`}
          fill="none" stroke="rgba(30,30,50,.65)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={`M${px2} ${lineY2} L${px2} ${exitY2} L${condX} ${exitY2}`}
          fill="none" stroke="rgba(30,30,50,.55)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Spiral-wrap tape ticks over both foam sleeves */}
        <g>{wrapTicks([[px1,lineY1],[px1,exitY1],[condX,exitY1]],8,0.28)}</g>
        <g>{wrapTicks([[px2,lineY2],[px2,exitY2],[condX,exitY2]],8,0.24)}</g>
        {/* Liquid line - full bold red/blue */}
        <path d={`M${px1} ${lineY1} L${px1} ${exitY1} L${condX} ${exitY1}`}
          fill="none" stroke={line1C} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="line-pulse"/>
        {/* Suction line - full bold, offset */}
        <path d={`M${px2} ${lineY2} L${px2} ${exitY2} L${condX} ${exitY2}`}
          fill="none" stroke={line2C} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="line-pulse" style={{animationDelay:'.15s'}}/>
        {/* Mounting straps - clip the paired lines to the wall along the
            horizontal exterior run, the way a real installer straps a
            lineset flat against the siding instead of leaving it to hang
            in open air. */}
        {[0.3,0.68].map((t,i)=>{
          const sx=px1+(condX-px1)*t;
          return <rect key={i} x={sx-1.4} y={exitY1-6} width={2.8} height={exitY2-exitY1+12} rx="1"
            fill="rgba(60,62,70,.6)" stroke="rgba(20,20,24,.5)" strokeWidth="0.4"/>;
        })}
        {/* Animated flow dots -- both pipes */}
        {active&&Array.from({length:6},(_,i)=>{
          const isLine1=i<3;
          const pColor=isLine1?line1C:line2C;
          const wx=isLine1?px1:px2;
          const topY=isLine1?lineY1:lineY2;
          const botY=isLine1?exitY1:exitY2;
          {/* line1 tracks the CONDENSER's own current color/role (see
              line1C's "physically correct" comment above Canvas) - the
              real liquid line in cool mode (condenser pushes liquid OUT
              to the indoor coil, i.e. AWAY from the condenser), which the
              reversing valve then runs the opposite way in heat mode
              (liquid returns FROM the now-condensing indoor coil TO the
              now-evaporating outdoor coil, i.e. TOWARD the condenser).
              line2 mirrors the indoor coil instead and simply runs the
              other way in both modes. This was previously inverted (both
              lines drawn flowing backwards, in both modes) - fixed here. */}
          const toCondenser=isLine1?refReversed:!refReversed;
          const p=toCondenser
            ?`M${wx} ${topY} L${wx} ${botY} L${condX} ${botY}`
            :`M${condX} ${botY} L${wx} ${botY} L${wx} ${topY}`;
          return <circle key={i} r="3" fill={pColor} opacity="0.82" filter="url(#glow-sm)">
            <animateMotion dur={(2.2+(i%3)*0.5)+'s'} repeatCount="indefinite" begin={(i*0.7)+'s'} path={p}/>
          </circle>;
        })}
        {/* No EditZone ever covers this run (cond_tier's own EditZone is
            just the condenser cabinet itself, see the module note near
            HoverInfo) - free-standing hover, no onClick. Two narrow boxes
            tracing the actual pipe run (the vertical drop inside the
            wall, then the horizontal exit into the condenser) rather than
            one full bounding rect spanning the whole wall face - that
            used to swallow the disconnect/surge boxes sitting in the
            same span. Both (and the indoor segments in Canvas's own
            attic/closet branches) share the caller's linesetRingPath so
            the ring traces the WHOLE run as one continuous line
            regardless of which narrow segment triggered it, instead of
            each drawing its own little rect - see HoverPanel's own
            `ring()` comment. */}
        <HoverInfo x={Math.min(px1,px2)-6} y={Math.min(lineY1,lineY2)-4}
          w={Math.abs(px2-px1)+12} h={exitY1-Math.min(lineY1,lineY2)+4}
          rx={3} vw={vw} vh={vh} title={partInfo('lineset',lang).title} text={partInfo('lineset',lang).text}
          ringPath={linesetRingPath} ringStrokeWidth={16}/>
        <HoverInfo x={Math.min(px1,px2)-6} y={Math.min(exitY1,exitY2)-6}
          w={condX-Math.min(px1,px2)+6} h={Math.abs(exitY2-exitY1)+12}
          rx={3} vw={vw} vh={vh} title={partInfo('lineset',lang).title} text={partInfo('lineset',lang).text}
          ringPath={linesetRingPath} ringStrokeWidth={16}/>
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
          fill={G+'.82)'} fontSize="12" fontFamily="monospace" fontWeight="700">{CT('DISC.',lang)}</text>
        {/* Corner mounting screws - a real disconnect is through-bolted to
            the wall at its four corners, not just floating in front of
            it. */}
        {[[DX+4,DY+4],[DX+DW-4,DY+4],[DX+4,DY+DH-4],[DX+DW-4,DY+DH-4]].map(([sx,sy],i)=>(
          <g key={i}>
            <circle cx={sx} cy={sy} r="1.5" fill="rgba(28,30,36,.9)" stroke={G+'.4)'} strokeWidth="0.5"/>
            <line x1={sx-0.85} y1={sy-0.2} x2={sx+0.85} y2={sy+0.2} stroke={G+'.55)'} strokeWidth="0.4"/>
          </g>
        ))}
        {/* Switch housing */}
        <rect x={DX+5} y={DY+22} width={DW-10} height={32} rx="3"
          fill={active?"rgba(239,68,68,.18)":"rgba(35,38,62,.75)"}
          stroke={active?condC:(G+'.32)')} strokeWidth="1.1"/>
        {/* Weatherproof rain hood - a real outdoor disconnect's switch
            opening sits under a small stamped awning that sheds water off
            the mechanism, not a flat panel exposed straight to the sky
            (matched against a reference photo of a real NEMA 3R outdoor
            disconnect). Drawn as a shallow trapezoid lip proud of the
            housing's top edge, with a thin dark underside so it reads as
            standing off the surface rather than a painted stripe. */}
        <path d={`M${DX+4} ${DY+21} L${DX+DW-4} ${DY+21} L${DX+DW-2} ${DY+24.5} L${DX+2} ${DY+24.5} Z`}
          fill="rgba(170,174,182,.4)" stroke="rgba(20,20,24,.5)" strokeWidth="0.5"/>
        <line x1={DX+2.5} y1={DY+24.3} x2={DX+DW-2.5} y2={DY+24.3} stroke="rgba(0,0,0,.35)" strokeWidth="0.6"/>
        {/* Handle lever */}
        <rect x={DX+11} y={DY+26} width={DW-22} height={20} rx="2.5"
          fill={active?"rgba(239,68,68,.55)":"rgba(55,58,90,.7)"}
          stroke={active?condC:(G+'.24)')} strokeWidth="1"/>
        {/* Handle center line */}
        <line x1={DX+DW/2} y1={DY+28} x2={DX+DW/2} y2={DY+44}
          stroke={active?condC:(G+'.18)')} strokeWidth="1" strokeDasharray="2 2"/>
        {/* Padlock hasp - a real disconnect can be locked open/closed for
            service; a small loop tab off the housing edge sells that
            without needing an actual padlock drawn on it. Sits low on
            the housing, clear of the conduit stub's own fixed mid-height
            (DY+DH/2) exiting the same right edge just above it. */}
        <path d={`M${DX+DW-5} ${DY+46} h4 a2 2 0 0 1 2 2 v2.5 a2 2 0 0 1 -2 2 h-4`}
          fill="none" stroke="rgba(190,194,204,.55)" strokeWidth="1.1"/>
        {/* Status dot - nudged up/shrunk slightly from its original 57/5
            to leave clear room below it for the rating placard. */}
        <circle cx={DX+DW/2} cy={DY+55.5} r="4.5"
          fill={active?"rgba(34,197,94,.6)":"rgba(50,50,80,.6)"}
          stroke={active?"#22c55e":(G+'.2)')} strokeWidth="1"/>
        {active&&<circle cx={DX+DW/2} cy={DY+55.5} r="2.2"
          fill="#22c55e" className="glow-pulse"/>}
        {/* Generic electrical rating placard - the kind of spec stamp
            every real disconnect carries (amperage/voltage/enclosure
            rating), without inventing a brand name for it. */}
        <text x={DX+DW/2} y={DY+DH-2.5} textAnchor="middle"
          fill={G+'.34)'} fontSize="6" fontFamily="monospace">60A·NEMA3R</text>
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
        {/* Surge protector - below disconnect, same width (DW) so the two
            read as one stacked mounted pair flush against the wall instead
            of the wider box below overhanging the narrower one above it.
            "PROTECTOR" doesn't fit a 44-wide box at a normal caption size
            (measures ~60 units at fontSize 11), so it's set small (7)
            here instead of widening the box to fit it - "SURGE" plus the
            bolt icon above already carry the meaning on their own, this
            caption is just backup. */}
        {isSurge&&<g className="fadein">
          <rect x={DX} y={DY+DH+6} width={DW} height={52} rx="4"
            fill="#160700" stroke="#f97316" strokeWidth="1.8"/>
          <rect x={DX+2} y={DY+DH+8} width={DW-4} height={44} rx="3"
            fill="none" stroke="rgba(249,115,22,.15)" strokeWidth="0.7"/>
          {/* Label */}
          <rect x={DX+3} y={DY+DH+10} width={DW-6} height={15} rx="2"
            fill="rgba(249,115,22,.12)" stroke="#f97316" strokeWidth="0.7"/>
          <text x={DX+DW/2} y={DY+DH+21.5} textAnchor="middle"
            fill="#f97316" fontSize="12" fontFamily="monospace" fontWeight="700">{CT('SURGE',lang)}</text>
          {/* Lightning bolt */}
          <text x={DX+DW/2} y={DY+DH+40} textAnchor="middle"
            fill="#f97316" fontSize="22">⚡</text>
          <text x={DX+DW/2} y={DY+DH+54} textAnchor="middle"
            fill="rgba(249,115,22,.6)" fontSize="7" fontFamily="monospace">{CT('PROTECTOR',lang)}</text>
          {/* No EditZone covers this - free-standing hover, no onClick. */}
          <HoverInfo x={DX} y={DY+DH+6} w={DW} h={52} rx={4} vw={vw} vh={vh}
            title={partInfo('surge_protector',lang).title} text={partInfo('surge_protector',lang).text}/>
        </g>}
        {/* Disconnect box hover - painted after (on top of) the surge
            protector's own so the two don't fight over the shared
            conduit gap between them; covers the box + its outside-wall
            conduit run to the condenser. No EditZone covers this either -
            free-standing, no onClick. */}
        <HoverInfo x={DX} y={DY} w={DW} h={DH} rx={4} vw={vw} vh={vh}
          title={partInfo('disconnect',lang).title} text={partInfo('disconnect',lang).text}/>
      </>;
    })()}

    {/* ── CONDENSER UNIT ── */}
    {condenserEl}
    {/* Snow drift along the condenser's top edge, same cold-snap mode and
        uneven-pile language as the ground blanket, so a real dusting on
        the outdoor unit itself sells the season along with the ground. */}
    <g style={{opacity:(heatMode&&!isMildHp)?1:0,transition:'opacity 2.5s ease'}}>
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
    {/* Both status lines are pinned a fixed distance ABOVE the cabinet's
        own top edge (condY), never inside it - condY is ground-anchored
        and COND_H varies a lot by tier (mid_ge15's front-discharge
        cabinet is barely half high_ge18's height), so a short cabinet's
        top edge sits much lower on screen than a tall one's. The old
        -9/+6 pair put this second line 6px BELOW condY (i.e. deliberately
        inside the box, against its dark cap) - fine for the tall fedmin/
        high-eff cabinets with a deep dark cap to sit against, but on the
        much shorter mid-tier cabinet that "inside" position landed right
        across the box's own top border/corner, the text glyphs reading
        as crossed out by the cabinet edge instead of labeling it. Both
        lines now sit above condY by construction, so this holds for
        every tier's cabinet height instead of just the taller ones. */}
    <text className="phase-color" x={wallX+zoneW-30} y={condY-24} textAnchor="end"
      fill={active?condC:(G+'.55)')} fontSize="13" fontFamily="monospace">
      {active?CT('CONDENSER · ACTIVE',lang):CT('CONDENSER · STANDBY',lang)}
    </text>
    {/* Mirrors the indoor coil's own ABSORBING/REJECTING HEAT status
        line - the outdoor coil is always doing the opposite of whatever
        the indoor coil is doing: normal cooling, indoor absorbs heat
        from the house and this releases it outside; reversed (heat pump
        heating), indoor rejects heat into the house and this is the one
        absorbing it from the outside air instead. */}
    {active&&<text className="phase-color" x={wallX+zoneW-30} y={condY-9} textAnchor="end"
      fill={refReversed?'rgba(35,137,224,.5)':'rgba(239,68,68,.5)'} fontSize="12" fontFamily="monospace">
      {refReversed?CT('ABSORBING HEAT',lang):CT('RELEASING HEAT',lang)}
    </text>}

    {/* OUTSIDE label */}
    <text x={wallX+zoneW/2} y={12} textAnchor="middle"
      fill={W+'.2)'} fontSize="11.5" fontFamily="monospace" letterSpacing="1.2">{CT('OUTSIDE',lang)}</text>
  </g>;
}

// Not a real thermostat control - lets a homeowner see the diagram react
// (refrigerant flow direction, which equipment lights up as active) without
// waiting for actual weather. Callout label + title attr both explain that,
// since a first-time visitor has no other reason to guess it's clickable.
//
// Defined at module scope (unlike Canvas's other sub-components, which stay
// nested inside it) for the same reason as OutsideZone above: a component
// declared *inside* Canvas's own function body is a brand-new function
// reference every render, so React tears down and remounts its whole DOM
// subtree instead of updating it in place. Here that meant every single
// click on a mode-preview button - heatMode/heatSubMode both live in
// Canvas's own state, so clicking one re-renders Canvas and, with ToggleUI
// declared inline, redefined ToggleUI right along with it - destroyed and
// recreated the very button that had just been clicked. A mouse click
// doesn't care (the new node still highlights correctly), but activating
// one via keyboard does: the focused button is gone by the time the browser
// would otherwise keep focus on it, and a focused element's own removal
// drops focus to <body> with no visible ring anywhere, silently - the same
// "control you can't see is still live" shape already fixed for
// splash-screen/attic-layout/closet-layout/done-screen in app.js, just for
// a genuine unmount here instead of a merely-hidden one. Takes every
// Canvas-scoped value it used to close over as an explicit prop instead.
function ToggleUI({style,compactToggle,isDualFuel,hasFurnace,heatMode,heatSubMode,setHeatMode,setHeatSubMode,monthName,lang}){
    if(compactToggle){
      const modes=isDualFuel?[
        {key:'cool',temp:'95°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'hp',temp:'60°',active:heatMode&&heatSubMode==='hp',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
        {key:'furnace',temp:'32°',active:heatMode&&heatSubMode==='furnace',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('furnace');}},
      ]:!hasFurnace?[
        {key:'cool',temp:'95°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'hp',temp:'60°',active:heatMode&&heatSubMode==='hp',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
        {key:'aux',temp:'32°',active:heatMode&&heatSubMode==='aux',color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>{setHeatMode(true);setHeatSubMode('aux');}},
      ]:[
        {key:'cool',temp:'95°',active:!heatMode,color:'#5ba8f5',bg:'rgba(35,137,224,.18)',onClick:()=>setHeatMode(false)},
        {key:'heat',temp:'32°',active:heatMode,color:'#f97316',bg:'rgba(249,115,22,.18)',onClick:()=>setHeatMode(true)},
      ];
      return <div className="no-print" title={CT("Not a control - tap to see how this system behaves in each mode",lang)} style={{display:'flex',background:'#0c0c0c',border:'1px solid rgba(215,183,64,.22)',borderRadius:3,overflow:'hidden',...style}}>
        {modes.map((m,i)=>
          <button key={m.key} onClick={m.onClick} style={{
            padding:'6px 9px',border:'none',borderLeft:i>0?'1px solid rgba(215,183,64,.18)':'none',cursor:'pointer',
            fontFamily:'monospace',fontSize:'12px',fontWeight:700,letterSpacing:'.02em',
            background:m.active?m.bg:'transparent',color:m.active?m.color:'rgba(255,255,255,.55)',
            transition:'all .2s',display:'flex',alignItems:'center',whiteSpace:'nowrap'}}>
            <span>{m.temp}</span>
          </button>
        )}
      </div>;
    }
    return (
    <div className="fadein no-print" title={CT("Not a control - click to see how this system behaves in each mode",lang)} style={{display:'flex',flexDirection:'column',background:'#0c0c0c',border:'1px solid rgba(215,183,64,.22)',overflow:'hidden',...style}}>
      {/* Used to float above the box with no backing of its own, so its
          contrast rode on whatever part of the diagram happened to be
          behind it - fine over the near-black sky, illegible over
          anything brighter. Folded into the same box the mode buttons
          already have (own #0c0c0c background, same border) so it always
          reads clearly regardless of the diagram underneath. */}
      <div style={{padding:'4px 10px',fontFamily:'monospace',fontSize:'var(--fs-toggle-eyebrow)',letterSpacing:'.06em',color:'rgba(215,183,64,.75)',textAlign:'right',borderBottom:'1px solid rgba(215,183,64,.18)'}}>
        {/* The actual current month isn't meaningful here (this is a
            what-if preview across modes, not a live status) - dropped per
            direct feedback. The per-button (JUN)/(OCT)/(FEB) labels below
            are a different thing (which month is REPRESENTATIVE of that
            mode's outside temp) and stay. */}
        ▸ {CT("preview how your system runs",lang)}
      </div>
      <button onClick={()=>setHeatMode(false)} style={{
        padding:'8px 14px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
        background:!heatMode?'rgba(35,137,224,.18)':'transparent',
        color:!heatMode?'#5ba8f5':'rgba(255,255,255,.58)',transition:'all .2s',
        display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5}}>
        {/* Representative month for this mode's outside temp - see the
            per-button mapping this file uses (95°→JUN peak summer,
            60°→OCT mild shoulder season, 32°→FEB deep winter). Snowflake/
            flame icons dropped per direct feedback - the temp + mode label
            already say what this is without them. */}
        <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:!heatMode?.75:0.5}}>(JUN)</span>
        <span>{CT("COOL MODE",lang)}</span>
        <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:!heatMode?1:0.55}}>95°</span>
        <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:!heatMode?.75:0.5}}>{CT('OUTSIDE TEMP',lang)}</span>
      </button>
      <div style={{height:'1px',background:'rgba(215,183,64,.22)'}}/>
      {isDualFuel
        ?<>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('hp');}} style={{
            padding:'8px 12px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='hp'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='hp'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5,borderBottom:'1px solid rgba(215,183,64,.12)'}}>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='hp'?.75:0.5}}>(OCT)</span>
            <span>{CT("HEAT PUMP",lang)}</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='hp'?1:0.55}}>60°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='hp'?.75:0.5}}>{CT('OUTSIDE TEMP',lang)}</span>
          </button>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('furnace');}} style={{
            padding:'8px 12px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='furnace'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='furnace'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5}}>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='furnace'?.75:0.5}}>(FEB)</span>
            <span>{CT("FURNACE",lang)}</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='furnace'?1:0.55}}>32°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='furnace'?.75:0.5}}>{CT('OUTSIDE TEMP',lang)}</span>
          </button>
        </>
        :!hasFurnace
        ?<>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('hp');}} style={{
            padding:'8px 12px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='hp'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='hp'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5,borderBottom:'1px solid rgba(215,183,64,.12)'}}>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='hp'?.75:0.5}}>(OCT)</span>
            <span>{CT("HEAT PUMP",lang)}</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='hp'?1:0.55}}>60°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='hp'?.75:0.5}}>{CT('OUTSIDE TEMP',lang)}</span>
          </button>
          <button onClick={()=>{setHeatMode(true);setHeatSubMode('aux');}} style={{
            padding:'8px 12px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
            background:heatMode&&heatSubMode==='aux'?'rgba(249,115,22,.18)':'transparent',
            color:heatMode&&heatSubMode==='aux'?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
            display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5}}>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='aux'?.75:0.5}}>(FEB)</span>
            <span>{CT("AUX HEAT",lang)}</span>
            <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode&&heatSubMode==='aux'?1:0.55}}>32°</span>
            <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode&&heatSubMode==='aux'?.75:0.5}}>{CT('OUTSIDE TEMP',lang)}</span>
          </button>
        </>
        :<button onClick={()=>setHeatMode(true)} style={{
          padding:'8px 14px',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:'var(--fs-toggle-label)',letterSpacing:'.08em',
          background:heatMode?'rgba(249,115,22,.18)':'transparent',
          color:heatMode?'#f97316':'rgba(255,255,255,.58)',transition:'all .2s',
          display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5}}>
          <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode?.75:0.5}}>(FEB)</span>
          <span>{CT("HEAT MODE",lang)}</span>
          <span style={{fontSize:'var(--fs-toggle-temp)',fontWeight:700,opacity:heatMode?1:0.55}}>32°</span>
          <span style={{fontSize:'var(--fs-toggle-caption)',letterSpacing:'.04em',opacity:heatMode?.75:0.5}}>{CT('OUTSIDE TEMP',lang)}</span>
        </button>}
    </div>
    );
}

// Wall-mounted dehumidistat - the humidity-side counterpart to the
// thermostat, a real second control a whole-home dehumidifier actually
// wires to (not the DehuErvBoxes equipment box elsewhere, which is the
// dehumidifier unit itself hanging off the ductwork). Same green/droplet
// language DehuErvBoxes already uses for "dehu" throughout this file, kept
// deliberately smaller/simpler than the thermostat (a real dehumidistat is
// a single-purpose humidity dial, not a multi-tier smart control) so the
// two don't read as the same device. x/y is its own top-left, always at a
// fixed real-world size (not run through THERM_SCALE) since it doesn't
// share the thermostat's margin-width-driven sizing problem.
function DehumidistatWall({x,y,pct=45,lang,vw,vh,scale=1}){
  // QA FIX - was a near-square 44x40 with the droplet stacked ABOVE the
  // percentage, both tiny enough at typical zoom to be genuinely hard to
  // read ("can barely read either of them"). Widened into an actual
  // rectangle with the droplet and percentage side by side in one row
  // instead, freeing up real width for a bigger percentage readout than
  // the old stacked layout had room for.
  const W=60,H=30;
  // Positioning transform lives on its own inner <g>, separate from the
  // "snap" entrance animation on the outer one - a CSS animation's own
  // transform (even just at its rest/"to" keyframe) overrides an SVG
  // transform ATTRIBUTE on the same element outright rather than composing
  // with it, so combining them on one <g> silently drops the translate
  // and leaves this rendering at the SVG's local origin instead of x/y.
  // Same two-<g> split the thermostat's own outer g.snap/inner positioned-g
  // already uses just above, for the same reason. scale (default 1) lives
  // on this same inner transform, right after the translate - only the
  // closet layout's call site passes a non-1 value (that copy was too
  // small to read; the attic layout's copy stayed default size, see its
  // own call site's comment).
  const info=partInfo('dehumidistat',lang);
  return <g className="snap" style={{animationDelay:'.32s'}}>
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x={0} y={0} width={W} height={H} rx="4" fill="#05120a" stroke="#22c55e" strokeWidth="1.4"/>
      <rect x={0} y={0} width={W} height={6} rx="4" fill="rgba(34,197,94,.3)"/>
      <text x={W*0.32} y={H/2+5} textAnchor="middle" fill="#22c55e" fontSize="15">💧</text>
      <text className="phase-color" x={W*0.68} y={H/2+5} textAnchor="middle" fill="#22c55e" fontSize="13" fontFamily="monospace" fontWeight="700">{pct}%</text>
      <text x={W/2} y={H+9} textAnchor="middle" fill="rgba(34,197,94,.6)" fontSize="6.2" fontFamily="monospace">{CT('DEHUMIDISTAT',lang)}</text>
    </g>
    {/* No EditZone ever covers this control (search confirms no
        stepId="dehu" EditZone exists) so this hover never has an
        existing click to preserve - no onClick needed.
        Lives OUTSIDE the translated <g> above, with x/y offset by this
        component's own absolute x/y instead of the local 0,0 the shapes
        above use - HoverPanel (ring + tooltip) reads this box in outer
        canvas space, not through this component's own transform, so
        local-only coordinates put its ring in the SVG's actual top-left
        corner instead of over this component (the bug that shipped with
        `highlight` defaulting on - previously invisible since nothing
        rendered a ring off the tooltip's own equally-mispositioned
        anchor). Scaled the same as the shapes above so the ring still
        wraps the box at any scale. */}
    <HoverInfo x={x-2} y={y-2} w={W*scale+4} h={(H+18)*scale} rx={4} vw={vw} vh={vh}
      title={info.title} text={info.text}/>
  </g>;
}

// ─── HOVER-INFO TOOLTIP ─────────────────────────────────────────
// An invisible pointer-events:all hit-rect that reveals a small floating
// panel on hover, so ANY component on the diagram - during the wizard as
// it's being built, and on the finished done screen - can offer a "what is
// this" tooltip.
//
// The panel itself is tracked as ONE piece of shared state (HoverCtx,
// provided by Canvas - see its own setHoverPart) and rendered ONCE, as
// the very last element in the whole <svg> (after even StepFocusRing),
// rather than as a sibling of whichever hit-rect triggered it. SVG has no
// z-index - paint order is purely document order - so a panel rendered
// inline next to its own trigger is only ever "on top of" content that
// happens to come EARLIER in the document; content painted LATER
// elsewhere in the diagram (a neighboring component defined further down
// in this file, which can sit anywhere on screen, including right where
// this panel wants to float) would still paint over it. A single
// instance, always LAST in the whole tree, is unconditionally topmost
// everywhere on the canvas regardless of which component triggered it.
//
// Deliberately module-scope, not a Canvas-scoped closure like EditZone/
// StepFocusRing just below, because several components that want their
// own hover info (BlowerWheel, Condenser, ACoilH/ACoilV, DehuErvBoxes) are
// themselves nested inside Canvas and reused verbatim by both the attic
// and closet layout branches - and one component here (OutsideZone) lives
// at module scope already, outside Canvas entirely, with no access to its
// closures at all. HoverCtx (a plain React context carrying Canvas's own
// setHoverPart) reaches every one of them regardless of nesting depth
// without threading a prop through each intermediate component; vw/vh
// (the on-canvas clamp) and lang still come in as explicit props, same
// idea as EditZone's own SVG_VW/SVG_VH.
//
// onClick, when passed, is never a NEW click behavior - it only exists so
// that a hover hit-rect painted on top of an existing EditZone's own hit-
// rect (necessary for the hover to register at all, since :hover/
// mouseenter hit-testing picks exactly one topmost target) keeps producing
// the IDENTICAL outcome a click there already produced before this feature
// existed: every caller that passes onClick sets it to the same
// onEditStep(stepId) call the coincident
// EditZone already makes for that same box (or, for a sub-part hover
// nested inside EditZone's own children - see EditZone's comment below -
// the same call EditZone's own click already makes for the whole box).
// Call sites with no existing EditZone underneath (most of them -
// filtration cabinet, dehu/erv, registers, lineset, disconnect,
// condensate, insulation...) pass no onClick at all, so clicking there
// keeps doing nothing, exactly as today.
const HoverCtx=React.createContext(null);
// Lets a HoverInfo opt into a `group` (e.g. "supply_duct") so hovering ANY
// one member rings every other member too, not just the one under the
// cursor - "these are all the same kind of thing" (multiple duct runs,
// multiple registers, etc.) rather than "this one exact pixel". Each
// HoverInfo instance registers its own box under its group id via an
// effect (see HoverInfo below) into Canvas's own groupBoxes state;
// HoverPanel reads that map back out to draw the sibling rings alongside
// its usual single `highlight` ring for the actual hovered box.
const GroupCtx=React.createContext(null);
function hiWrapText(text,maxChars){
  const words=(text||'').split(' ');
  const lines=[]; let cur='';
  for(const w of words){
    const next=cur?cur+' '+w:w;
    if(next.length>maxChars&&cur){lines.push(cur);cur=w;}
    else cur=next;
  }
  if(cur)lines.push(cur);
  return lines;
}
// Panel-only render - no hit-rect, no hover-tracking of its own. Canvas
// renders exactly one of these (see hoverPart state) at the end of each
// layout branch's <svg>; it takes the trigger's own x/y/w/h (to anchor
// against) plus vw/vh/title/text bundled together as `part`.
function HoverPanel({part,groupBoxes}){
  const {x,y,w,h,rx,vw,vh,title,text,highlight,group}=part;
  // Sibling boxes sharing this part's `group` (e.g. every other supply-duct
  // run) - excludes the exact box already covered by the `highlight` ring
  // below so the actively-hovered one isn't double-outlined.
  // QA FIX - a single physical run (e.g. an angled supply duct's elbow leg
  // + straight drop) can register as TWO separate HoverInfo hit-zones
  // sharing the exact same group AND the exact same ringPath (so either
  // zone's ring traces the whole pipe). The bounding-box equality check
  // alone only excludes the literal hovered zone, so the OTHER zone on
  // that same duct - a different x/y/w/h, but the identical ringPath -
  // still passed through as a "sibling" and got its own dim ring drawn
  // right on top of the already-bright one, stacking two translucent gold
  // washes over the same pixels. That's exactly why the angled left/right
  // ducts read brighter than the single-hit-zone straight middle one on
  // hover, confirmed via a hover sweep. Deduping on ringPath too (when
  // present) collapses that double-paint back to one ring per pipe.
  const siblings=(group&&groupBoxes&&groupBoxes[group])
    ?Object.values(groupBoxes[group]).filter(b=>
        part.ringPath&&b.ringPath===part.ringPath?false:!(b.x===x&&b.y===y&&b.w===w&&b.h===h))
    :[];
  // A ring normally just traces its box's own x/y/w/h as a rect, which
  // looks right for anything actually rectangular - but a hit-box that's
  // really a loose bounding box around a DIAGONAL/bent pipe (the 45° duct
  // elbow, say) doesn't have a rectangular shape to trace, and a rect ring
  // around its bounding box reads as a big awkward box floating next to
  // the actual pipe instead of hugging it. A box can opt out of the rect
  // ring and supply its own `ringPath` (the same kind of SVG path `d`
  // string already used to draw the pipe itself) + `ringStrokeWidth`
  // instead, stroked in gold in place of the rect.
  //
  // `ringBox` is the other override: several separate HoverInfo hit-boxes
  // (e.g. the lineset's 4 narrow segments - indoor riser, indoor roof run,
  // outdoor wall drop, outdoor condenser entry - kept narrow/separate on
  // purpose so none of them swallows a neighboring component) can all pass
  // the SAME shared `ringBox` spanning the whole run, so whichever segment
  // is actually under the cursor, the ring drawn is the one consistent
  // "this whole pipe" outline instead of 4 different small disconnected
  // boxes depending on exactly where you're hovering.
  const ring=(box,bright)=>{
    if(box.ringPath){
      // Mirrors the rect ring's own fill+border duality (a soft translucent
      // wash plus a crisp thin border) rather than one fat opaque stroke -
      // a single wide stroke at near-full opacity painted the pipe solid
      // gold instead of reading as a highlight. The wide pass is the
      // "fill" (soft, translucent, `ringStrokeWidth` wide - a halo the
      // pipe still shows clearly through), the thin pass is the "border"
      // (same 2/2.5px weight the rect ring already uses) tracing the
      // route crisply on top.
      return <>
        <path d={box.ringPath} fill="none" stroke={bright?"rgba(215,183,64,.16)":"rgba(215,183,64,.10)"}
          strokeWidth={box.ringStrokeWidth||10} strokeLinecap="round" strokeLinejoin="round"
          filter="url(#glow-sm)" style={{pointerEvents:'none'}}/>
        <path d={box.ringPath} fill="none" stroke={bright?"rgba(215,183,64,.95)":"rgba(215,183,64,.7)"}
          strokeWidth={bright?2.5:2} strokeLinecap="round" strokeLinejoin="round"
          style={{pointerEvents:'none'}}/>
      </>;
    }
    const rb=box.ringBox||box;
    return <rect x={rb.x-3} y={rb.y-3} width={rb.w+6} height={rb.h+6} rx={(rb.rx||3)+3}
      fill={bright?"rgba(215,183,64,.06)":"rgba(215,183,64,.04)"}
      stroke={bright?"rgba(215,183,64,.95)":"rgba(215,183,64,.7)"} strokeWidth={bright?2.5:2}
      filter="url(#glow-sm)" style={{pointerEvents:'none'}}/>;
  };
  // QA FIX - PANEL_W used to be a flat 172 regardless of content, so a
  // short title/text (e.g. "GAS LINE") still got the same wide box a much
  // longer one needed - direct feedback: "the box should only be as big
  // as the amount of text." Wrapping still happens at MAX_PANEL_W (so long
  // copy wraps exactly as before), but the box itself then shrinks to hug
  // whichever line - title or the longest wrapped body line - actually
  // turned out widest, down to MIN_PANEL_W as a floor so very short copy
  // ("IONIZER") still gets a readable minimum. Char-width factors here are
  // the same rough per-font heuristic hiWrapText's own maxChars already
  // used (0.56 for the sans-serif body; monospace runs a touch wider, so
  // the title gets its own 0.62).
  const FONT=9.3, LINE_H=12, PAD=8, TITLE_H=19;
  const MAX_PANEL_W=172, MIN_PANEL_W=64;
  const maxChars=Math.max(10,Math.floor((MAX_PANEL_W-PAD*2)/(FONT*0.56)));
  const lines=hiWrapText(text,maxChars);
  const titleW=(title||'').length*10.5*0.62;
  const bodyW=lines.reduce((m,ln)=>Math.max(m,ln.length*FONT*0.56),0);
  const PANEL_W=Math.min(MAX_PANEL_W,Math.max(MIN_PANEL_W,Math.ceil(Math.max(titleW,bodyW))+PAD*2));
  const panelH=TITLE_H+lines.length*LINE_H+7;
  // Anchors centered above the component by default (flips below when too
  // close to the canvas top), then clamps sideways/vertically to stay
  // fully on-canvas - same "grow/shift, never spill past the edge" idea as
  // EditZone's own MIN_EDIT_PX clamp above, applied to this floating panel
  // instead of a hit-box.
  let px=x+w/2-PANEL_W/2;
  let py=y-panelH-9;
  if(vh&&py<4)py=y+h+9;
  if(vh&&py+panelH>vh-4)py=Math.max(4,vh-4-panelH);
  if(vw){
    if(px<4)px=4;
    if(px+PANEL_W>vw-4)px=Math.max(4,vw-4-PANEL_W);
  }
  return <>
    {/* Traces the hovered part's own hit-rect (same x/y/w/h/rx the
        invisible HoverInfo rect already uses) rather than a generic box.
        On by default (every hoverable part gets its own ring) - a caller
        opts OUT with highlight={false} rather than opting in. */}
    {highlight&&ring(part,true)}
    {/* Same ring, dimmer/thinner, traced around every OTHER box sharing
        this part's group - "you're learning about the same kind of thing"
        (e.g. hovering one supply duct run lights up every other run too). */}
    {siblings.map((b,i)=><React.Fragment key={i}>{ring(b,false)}</React.Fragment>)}
    <g className="hover-info-panel" transform={`translate(${px} ${py})`}
      style={{pointerEvents:'none'}}>
      <rect x={0} y={0} width={PANEL_W} height={panelH} rx="5"
        fill="#14110a" stroke="rgba(215,183,64,.55)" strokeWidth="1" filter="url(#shadow)"/>
      <text x={PANEL_W/2} y={13} textAnchor="middle" fill="#d7b740" fontSize="10.5" fontFamily="monospace" fontWeight="700">{title}</text>
      <line x1={PAD} y1={TITLE_H-2} x2={PANEL_W-PAD} y2={TITLE_H-2} stroke="rgba(215,183,64,.25)" strokeWidth="0.6"/>
      {lines.map((ln,i)=>(
        <text key={i} x={PANEL_W/2} y={TITLE_H+9+i*LINE_H} textAnchor="middle" fill="rgba(240,242,248,.86)" fontSize={FONT} fontFamily="sans-serif">{ln}</text>
      ))}
    </g>
  </>;
}
// Self-contained hover target: an invisible hit-rect (sized to the
// component's own real footprint, per the "never full-bleed" guidance -
// every call site below passes that component's own x/y/w/h, the same
// numbers already used to draw it) that reports itself to HoverCtx's
// setHoverPart on enter/leave, instead of a CSS-revealed sibling panel -
// see the module comment above for why a single always-last panel needs
// to replace that. className kept on the wrapping <g> for identifiability
// (tests, devtools) even though nothing keys off it visually anymore.
//
// highlight (optional, defaults ON) - every hoverable part traces its own
// gold ring on hover (HoverPanel draws it off this part's own x/y/w/h/rx),
// not just a shared box around whatever bigger EditZone it happens to sit
// inside - hovering the furnace only rings the furnace, hovering the coil
// right next to it only rings the coil, instead of one combined box around
// both (EditZone's own former box-level ring was removed for exactly this
// reason - see EditZone's own comment). Pass highlight={false} to opt a
// specific call site OUT (nothing currently does).
//
// group (optional) - opts into the linked-sibling ring behavior on
// HoverPanel (see GroupCtx's own module comment above): every other
// HoverInfo sharing the same group string lights up its own dimmer ring
// too whenever any one member is hovered, e.g. group="supply_duct" so all
// the supply-duct runs read as "the same kind of thing" together.
//
// ringPath/ringStrokeWidth/ringBox (all optional) - override what
// HoverPanel draws for THIS box's own ring, instead of tracing its literal
// x/y/w/h hit-rect (see HoverPanel's own `ring()` comment for when/why).
function HoverInfo({x,y,w,h,rx,vw,vh,title,text,onClick,highlight=true,group,ringPath,ringStrokeWidth,ringBox}){
  const setHover=React.useContext(HoverCtx);
  const groupApi=React.useContext(GroupCtx);
  const idRef=React.useRef(null);
  if(idRef.current===null)idRef.current=Math.random().toString(36).slice(2);
  React.useEffect(()=>{
    if(!group||!groupApi)return;
    groupApi.register(group,idRef.current,{x,y,w,h,rx,ringPath,ringStrokeWidth,ringBox});
    return ()=>groupApi.unregister(group,idRef.current);
  },[group,groupApi,x,y,w,h,rx,ringPath,ringStrokeWidth,ringBox]);
  if(!title)return null;
  const part={x,y,w,h,rx,vw,vh,title,text,highlight,group,ringPath,ringStrokeWidth,ringBox};
  return <g className="hover-info-zone">
    <rect x={x} y={y} width={w} height={h} rx={rx||3} fill="transparent"
      style={{pointerEvents:'all',cursor:onClick?'pointer':'default'}} onClick={onClick}
      onMouseEnter={()=>setHover&&setHover(part)}
      onMouseLeave={()=>setHover&&setHover(null)}/>
  </g>;
}

// Homeowner-facing "what is this" copy for every individually hoverable
// diagram part - short (1-2 sentence) explanations, not a spec sheet. Draws
// on the wizard's own INFO_TEXT language (app.js) for parts that already
// have an equivalent step-level explanation, kept consistent in tone for
// the many finer sub-parts (blower, heat exchanger, individual registers,
// disconnect, condensate...) that don't have their own wizard step and so
// needed new copy written for them here. Spanish mirrors INFO_TEXT_ES's own
// overlay pattern - a full translation per key, not a fallback flag.
const PART_INFO={
  furnace_cabinet:{en:{title:'FURNACE',text:"Burns gas to heat your home, then hands that warmed air to the blower to push through your ductwork."},
    es:{title:'HORNO',text:"Quema gas para calentar su hogar, y entrega ese aire caliente al motor para que lo distribuya por sus ductos."}},
  blower:{en:{title:'BLOWER',text:"The squirrel-cage wheel that actually moves air through your whole system, whether it's heating or cooling."},
    es:{title:'MOTOR SOPLADOR',text:"La rueda tipo jaula de ardilla que realmente mueve el aire por todo su sistema, tanto en calefacción como en enfriamiento."}},
  heat_exchanger:{en:{title:'HEAT EXCHANGER',text:"Where the flame actually heats the air, while keeping combustion gases completely sealed away from the air you breathe."},
    es:{title:'INTERCAMBIADOR DE CALOR',text:"Donde la llama realmente calienta el aire, manteniendo los gases de combustión completamente sellados del aire que usted respira."}},
  afue_badge:{en:{title:'AFUE RATING',text:"The share of every dollar of gas that becomes usable heat. 90% AFUE wastes less fuel than an 80% unit, using a sealed PVC flue instead of metal."},
    es:{title:'CLASIFICACIÓN AFUE',text:"La parte de cada dólar de gas que se convierte en calor útil. 90% AFUE desperdicia menos combustible que una unidad de 80%, usando una chimenea de PVC sellada en vez de metal."}},
  acoil:{en:{title:'A-COIL',text:"Refrigerant flows through it to pull heat and humidity out of the air your blower pushes across it, cooling your home."},
    es:{title:'SERPENTÍN EN A',text:"El refrigerante fluye a través de él para extraer calor y humedad del aire que el motor empuja sobre él, enfriando su hogar."}},
  // Heat-pump-heating variant - refrigerant flow through this same coil
  // literally reverses (see refReversed, which also drives the diagram's
  // own ABSORBING/REJECTING HEAT label), so it's now releasing heat into
  // the air instead of pulling it out - the opposite of the default
  // cooling-mode copy above, not just a reworded restatement of it.
  acoil_heat_reject:{en:{title:'A-COIL',text:"In heat pump mode the refrigerant reverses through it, releasing heat into the air your blower pushes across it to warm your home instead of cooling it."},
    es:{title:'SERPENTÍN EN A',text:"En modo bomba de calor, el refrigerante se invierte a través de él, liberando calor al aire que el motor empuja sobre él para calentar su hogar en vez de enfriarlo."}},
  // Furnace-heating variant - the compressor's off and refrigerant isn't
  // moving at all here (this coil only does anything in cool mode or
  // while a heat pump is actively heating), so neither the default nor
  // the heat-pump-heating copy above describes what it's doing right now.
  acoil_heat_idle:{en:{title:'A-COIL',text:"Only active when you're cooling or when a heat pump is doing the heating - with the furnace running instead, this coil sits idle while air just passes through it."},
    es:{title:'SERPENTÍN EN A',text:"Solo está activo cuando está enfriando o cuando una bomba de calor está calentando - con el horno funcionando en su lugar, este serpentín queda inactivo mientras el aire simplemente pasa a través de él."}},
  // Standard-efficiency heat-pump-only (air handler) variant, once the
  // compressor has locked out on a very cold day (hpLockedOut, aux
  // sub-mode) - refReversed stays true in that state (see its own
  // comment: it only checks !hasFurnace/heatMode, not lockout), so
  // without this branch acoilInfoKey kept pointing at
  // acoil_heat_reject's "refrigerant reverses through it" copy right
  // over a coil the diagram itself is drawing dim/idle with an "AUX
  // HEAT ONLY" label - the compressor's actually off here, not reversed.
  acoil_aux_lockout:{en:{title:'A-COIL',text:"The compressor's locked out at this outdoor temperature, so this coil sits idle - aux/emergency electric heat strips are carrying the entire heating load instead."},
    es:{title:'SERPENTÍN EN A',text:"El compresor está bloqueado a esta temperatura exterior, así que este serpentín permanece inactivo - las resistencias eléctricas de calefacción auxiliar/de emergencia se encargan de toda la carga de calefacción en su lugar."}},
  air_handler_cabinet:{en:{title:'AIR HANDLER',text:"The indoor half of a heat-pump-only system - no gas furnace here, just a blower and coil moving air for both heating and cooling."},
    es:{title:'MANEJADOR DE AIRE',text:"La mitad interior de un sistema de solo bomba de calor - sin horno de gas aquí, solo un motor y un serpentín moviendo aire para calefacción y enfriamiento."}},
  condenser_cabinet:{en:{title:'CONDENSER',text:"Your outdoor unit. It releases heat outside to cool your home, or, with a heat pump, pulls heat from the outside air to warm it."},
    es:{title:'CONDENSADOR',text:"Su unidad exterior. Libera calor afuera para enfriar su hogar, o, con una bomba de calor, extrae calor del aire exterior para calentarlo."}},
  condenser_fan:{en:{title:'CONDENSER FAN',text:"Pulls outside air across the coil so it can release or collect heat, depending on the mode."},
    es:{title:'VENTILADOR DEL CONDENSADOR',text:"Jala aire exterior a través del serpentín para que pueda liberar o captar calor, según el modo."}},
  compressor:{en:{title:'COMPRESSOR',text:"Pressurizes the refrigerant - the part that does the actual work of moving heat in or out of your home."},
    es:{title:'COMPRESOR',text:"Presuriza el refrigerante - la parte que realiza el trabajo real de mover el calor dentro o fuera de su hogar."}},
  disconnect:{en:{title:'DISCONNECT BOX',text:"Lets a technician cut power to the condenser right at the unit before servicing it - a safety requirement on every install."},
    es:{title:'CAJA DE DESCONEXIÓN',text:"Permite a un técnico cortar la energía al condensador justo en la unidad antes de darle servicio - un requisito de seguridad en toda instalación."}},
  surge_protector:{en:{title:'SURGE PROTECTOR',text:"Helps protect the condenser's electronics from nearby lightning and power spikes - a single nearby strike can destroy a compressor."},
    es:{title:'PROTECTOR DE SOBREVOLTAJE',text:"Ayuda a proteger la electrónica del condensador de rayos cercanos y picos de energía - un solo rayo cercano puede destruir un compresor."}},
  supply_plenum:{en:{title:'SUPPLY PLENUM',text:"Where conditioned air leaves your indoor unit and splits off into the ductwork that feeds every room."},
    es:{title:'PLENUM DE SUMINISTRO',text:"Donde el aire acondicionado sale de su unidad interior y se distribuye hacia los ductos que alimentan cada habitación."}},
  supply_register:{en:{title:'SUPPLY REGISTER',text:"Where conditioned air enters the room. Behind it, hidden in the drywall, sits the supply boot - the actual duct-to-register connection, and one of the most important seals in the whole system. A poorly sealed boot leaks conditioned air and can pull attic air straight in."},
    es:{title:'REJILLA DE SUMINISTRO',text:"Donde el aire acondicionado entra a la habitación. Detrás, oculta en la pared, está la bota de suministro - la conexión real entre el ducto y la rejilla, y uno de los sellos más importantes de todo el sistema. Una bota mal sellada deja escapar aire acondicionado y puede dejar entrar aire del ático."}},
  supply_duct:{en:{title:'SUPPLY DUCT',text:"Insulated flex duct carrying conditioned air from the supply plenum down to this room's register."},
    es:{title:'DUCTO DE SUMINISTRO',text:"Ducto flexible aislado que lleva el aire acondicionado desde el plenum de suministro hasta la rejilla de esta habitación."}},
  return_plenum:{en:{title:'RETURN PLENUM',text:"Pulls room air back into the system so it can be filtered and reconditioned again."},
    es:{title:'PLENUM DE RETORNO',text:"Jala el aire de la habitación de vuelta al sistema para que pueda ser filtrado y acondicionado de nuevo."}},
  return_grille:{en:{title:'RETURN GRILLE',text:"Where room air is pulled back into the ductwork, on its way to the filter and the indoor unit."},
    es:{title:'REJILLA DE RETORNO',text:"Donde el aire de la habitación es jalado de vuelta hacia los ductos, camino al filtro y a la unidad interior."}},
  // Closet layout's return path is a framed stud/joist cavity, not a
  // separate metal duct with its own grille - a distinct thing from
  // return_grille above, which is a real grille (used only by the attic
  // layout's own return duct trunk).
  return_chase:{en:{title:'RETURN AIR CHASE',text:"A framed 2x4 stud/joist cavity used as the return-air path back to the unit, instead of a separate metal return duct - common in closet installs where space is tight."},
    es:{title:'CONDUCTO DE RETORNO 2×4',text:"Una cavidad enmarcada entre postes/vigas de 2x4 que sirve como camino de aire de retorno hacia la unidad, en lugar de un ducto metálico independiente - común en instalaciones de clóset donde el espacio es reducido."}},
  return_duct:{en:{title:'RETURN DUCT',text:"Carries room air from the return grille back up to the return plenum and filter, on its way to be reconditioned."},
    es:{title:'DUCTO DE RETORNO',text:"Lleva el aire de la habitación desde la rejilla de retorno hasta el plenum de retorno y el filtro, para ser acondicionado de nuevo."}},
  filtration_cabinet:{en:{title:'FILTRATION CABINET',text:"Standard on every install - traps far more dust, pollen, and allergens than a typical 1 inch filter."},
    es:{title:'GABINETE DE FILTRACIÓN',text:"Incluido de fábrica en toda instalación - atrapa mucho más polvo, polen y alérgenos que un filtro típico de 1 pulgada."}},
  thermostat_general:{en:{title:'THERMOSTAT',text:"The control for your whole system - set a temperature here and every part of this diagram responds to what it takes to hold it."},
    es:{title:'TERMOSTATO',text:"El control de todo su sistema - configure una temperatura aquí y cada parte de este diagrama responde a lo que se necesita para mantenerla."}},
  dehumidistat:{en:{title:'DEHUMIDISTAT',text:"A wall control that lets your whole-home dehumidifier hold a target humidity automatically, separate from your thermostat."},
    es:{title:'DESHUMIDISTATO',text:"Un control de pared que permite que su deshumidificador de toda la casa mantenga una humedad objetivo automáticamente, separado de su termostato."}},
  dehu_box:{en:{title:'DEHUMIDIFIER',text:"Ties into your ductwork and pulls extra moisture out of the air system-wide - runs automatically, just an occasional filter check, no buckets to empty."},
    es:{title:'DESHUMIDIFICADOR',text:"Se conecta a sus ductos y extrae el exceso de humedad del aire en toda la casa - funciona automáticamente, solo requiere revisar el filtro ocasionalmente, sin cubetas que vaciar."}},
  erv_box:{en:{title:'ERV',text:"Energy recovery ventilator - brings in fresh outdoor air while venting stale air out, recovering most of the energy either way."},
    es:{title:'ERV',text:"Ventilador de recuperación de energía - introduce aire fresco del exterior mientras expulsa el aire viciado, recuperando la mayor parte de la energía en el intercambio."}},
  dehu_return_duct:{en:{title:'DEHUMIDIFIER RETURN DUCT',text:"Its own dedicated tap into the return plenum, pulling house air through the dehumidifier before it ever reaches the coil."},
    es:{title:'DUCTO DE RETORNO DEL DESHUMIDIFICADOR',text:"Su propia toma dedicada en el plenum de retorno, que jala el aire de la casa a través del deshumidificador antes de que llegue al serpentín."}},
  dehu_supply_duct:{en:{title:'DEHUMIDIFIER SUPPLY DUCT',text:"Feeds the dehumidified air into the supply plenum, where it blends in and reaches every room through the same ductwork."},
    es:{title:'DUCTO DE SUMINISTRO DEL DESHUMIDIFICADOR',text:"Envía el aire deshumidificado al plenum de suministro, donde se mezcla y llega a cada habitación por el mismo sistema de ductos."}},
  backdraft_damper:{en:{title:'BACKDRAFT DAMPER',text:"A one-way flap on the dehumidifier's supply duct that keeps the blower's much stronger airflow from pushing air backward through the dehumidifier when it isn't running."},
    es:{title:'COMPUERTA DE CONTRATIRO',text:"Una válvula de un solo sentido en el ducto de suministro del deshumidificador, que evita que el flujo de aire, mucho más fuerte, del soplador empuje el aire hacia atrás a través del deshumidificador cuando no está funcionando."}},
  // Closet layout's dehu ducts are a different, independent design from
  // the attic's own dehu_return_duct/dehu_supply_duct (which tap the
  // SAME return/supply plenum the rest of the system uses, hence that
  // one's backdraft damper) - this stack's return and supply plenums sit
  // at opposite ends of a tall vertical column with nothing nearby at
  // both, so this dehu gets its own fully separate return grille and
  // supply register, stubbed straight into the drywall nearby rather
  // than tied into the main trunk at all. No damper needed here - there's
  // no shared blower airflow to guard against on an independent run.
  dehu_dedicated_return:{en:{title:'DEDICATED RETURN',text:"This dehumidifier pulls from its own return grille, built into the drywall nearby - a separate air path from the rest of the system, not shared with the main return."},
    es:{title:'RETORNO DEDICADO',text:"Este deshumidificador jala aire de su propia rejilla de retorno, integrada en el tablaroca cercano - un camino de aire separado del resto del sistema, no compartido con el retorno principal."}},
  dehu_dedicated_supply:{en:{title:'DEDICATED SUPPLY',text:"Feeds dehumidified air straight into its own register in the drywall nearby, instead of tying into the main supply trunk."},
    es:{title:'SUMINISTRO DEDICADO',text:"Envía el aire deshumidificado directamente a su propia rejilla en el tablaroca cercano, en lugar de conectarse al tronco de suministro principal."}},
  lineset:{en:{title:'LINE SET',text:"The two copper lines carrying refrigerant between the indoor coil and the outdoor condenser - the larger one wrapped in insulation to stop it from sweating."},
    es:{title:'LÍNEAS DE REFRIGERANTE',text:"Las dos líneas de cobre que transportan refrigerante entre el serpentín interior y el condensador exterior - la más grande está aislada para evitar la condensación."}},
  condensate_drain:{en:{title:'CONDENSATE DRAIN',text:"Carries the water that condenses off the coil safely out of the house - into a P-trap under a sink, near your outdoor condenser, or another suitable drain point."},
    es:{title:'DRENAJE DE CONDENSADO',text:"Lleva el agua que se condensa en el serpentín de forma segura fuera de la casa - a un sifón bajo un lavabo, cerca de su condensador exterior, u otro punto de drenaje adecuado."}},
  insulation:{en:{title:'ATTIC INSULATION',text:"Keeps conditioned air at the right temperature instead of leaking it away through the attic above your ductwork."},
    es:{title:'AISLAMIENTO DEL ÁTICO',text:"Mantiene el aire acondicionado a la temperatura correcta en lugar de perderlo a través del ático sobre sus ductos."}},
  flue_pipe:{en:{title:'FLUE PIPE',text:"Vents the furnace's combustion gases safely outside, away from the air you breathe."},
    es:{title:'TUBO DE ESCAPE',text:"Ventila los gases de combustión del horno de forma segura hacia el exterior, lejos del aire que usted respira."}},
  gas_line:{en:{title:'GAS LINE',text:"Feeds natural gas to the furnace, with a shutoff valve and a drip leg to catch sediment before it reaches the gas valve."},
    es:{title:'LÍNEA DE GAS',text:"Alimenta gas natural al horno, con una válvula de cierre y un colector de sedimentos antes de llegar a la válvula de gas."}},
  service_switch:{en:{title:'SERVICE SWITCH',text:"Lets a technician cut power to the blower and control board before servicing the indoor unit, separate from the condenser's outdoor disconnect."},
    es:{title:'INTERRUPTOR DE SERVICIO',text:"Permite a un técnico cortar la energía al motor soplador y la tarjeta de control antes de dar servicio a la unidad interior, aparte de la desconexión exterior del condensador."}},
  ionizer:{en:{title:'IONIZER',text:"Releases charged ions into the airstream that attach to dust, allergens, and odors so they clump and get caught by your filter."},
    es:{title:'IONIZADOR',text:"Libera iones cargados en la corriente de aire que se adhieren al polvo, alérgenos y olores para que se agrupen y sean atrapados por su filtro."}},
  uv_light:{en:{title:'UV LIGHT',text:"A germicidal bulb mounted at the coil that kills mold and bacteria growing on it, keeping the coil clean and your airflow odor-free."},
    es:{title:'LUZ UV',text:"Una lámpara germicida montada en el serpentín que elimina el moho y las bacterias que crecen en él, manteniendo el serpentín limpio y el flujo de aire libre de olores."}},
  // Universal to ANY coil in the airstream (furnace+A-coil combo or a
  // standalone air handler) - the blower's static pressure would
  // otherwise pull air backward through the drain line or blow water out
  // of it, so every coil install gets one, not just air-handler builds.
  p_trap:{en:{title:'P-TRAP',text:"A U-shaped bend in the condensate line that seals against the blower's air pressure - without it, that pressure can pull air backward through the drain or blow water out instead of letting it flow. Standard on every coil's drain, furnace or air handler alike."},
    es:{title:'SIFÓN EN P',text:"Una curva en forma de U en la línea de condensado que sella contra la presión de aire del motor soplador - sin ella, esa presión puede jalar aire hacia atrás por el drenaje o expulsar el agua en vez de dejarla fluir. Estándar en el drenaje de todo serpentín, ya sea horno o manejador de aire."}},
  // Also universal (any coil), sized differently by indoor_type at each
  // call site - see the pan's own comment where it's drawn for why.
  secondary_drain_pan:{en:{title:'SECONDARY FLOAT SWITCH',text:"Wired into the coil's own secondary drain port, right next to the primary line - if the primary ever clogs and water backs up, this switch cuts power to the unit before it can overflow into the ceiling below."},
    es:{title:'INTERRUPTOR DE FLOTADOR SECUNDARIO',text:"Conectado al puerto de drenaje secundario del serpentín, justo al lado de la línea principal - si el drenaje principal se llega a tapar y el agua retrocede, este interruptor corta la energía a la unidad antes de que se desborde hacia el techo de abajo."}},
  // Deliberately no on-canvas glyph of its own (see this key's call
  // sites, right on the existing DuctClamp collars) - low-profile by
  // design, per direct feedback: discoverable on hover, not announced.
  balancing_damper:{en:{title:'BALANCING DAMPER',text:"Lets a tech fine-tune airflow to this branch so every room gets its fair share, instead of the room nearest the unit hogging all the air."},
    es:{title:'COMPUERTA DE BALANCEO',text:"Permite a un técnico ajustar el flujo de aire hacia esta rama para que cada habitación reciba su parte justa, en lugar de que la habitación más cercana a la unidad acapare todo el aire."}},
};
// lang defaults to English whenever a call site hasn't been threaded a
// lang prop (per the task's "don't crash if undefined" guidance) - falls
// back key-by-key to English too, so a future key added to only one
// language never renders blank.
function partInfo(key,lang){
  const e=PART_INFO[key];
  if(!e)return{title:'',text:''};
  return(lang==='es'&&e.es)?e.es:e.en;
}

// QA FIX - the diagram's own permanent on-canvas labels (BLOWER, A-COIL,
// CONDENSER · ACTIVE, the mode-preview panel, etc.) used to stay hardcoded
// English even under the Spanish toggle, unlike every hover tooltip
// (partInfo above) which already had full EN/ES pairs - a Spanish-speaking
// homeowner only discovered the Spanish part names one hover/tap at a
// time. Same overlay-lookup idea as partInfo, just keyed by the literal
// English string already used as each label's own on-canvas text (most of
// these functions already receive `lang` as a prop for their own partInfo
// calls, so this reuses that same value rather than adding a new one).
// Kept short/abbreviated on purpose to fit the same fixed-width label
// slots the English versions were tuned for - a literal word-for-word
// translation would overflow several of these (e.g. "FIBERGLASS
// INSULATION" already runs close to its own box edge in English).
const CANVAS_ES={
  'BLOWER':'SOPLADOR','A-COIL':'SERPENTÍN','HEAT EXCH.':'INTERCAMB.',
  'FURNACE':'HORNO','AIR HANDLER':'MANEJADOR','FILTRATION':'FILTRACIÓN',
  'FILTRATION CABINET':'GABINETE DE FILTRO','RETURN':'RETORNO',
  'RETURN PLENUM':'PLENUM DE RETORNO','SUPPLY':'SUMINISTRO',
  'DUCTBOARD PLENUM':'PLENUM DUCTBOARD','METAL PLENUM':'PLENUM METÁLICO',
  'EXISTING PLENUM':'PLENUM EXISTENTE',
  'DISC.':'DESC.','COMP.':'COMP.','SERVICE':'SERVICIO','SWITCH':'INTERRUPTOR',
  'GAS':'GAS','DRIP LEG':'PIERNA DE GOTEO','IONIZER':'IONIZADOR',
  'DEHU':'DESHUM','DEHUMIDISTAT':'DESHUMIDISTATO','ERV':'ERV',
  'DRAIN':'DRENAJE','LINESET':'LÍNEAS','GROUND LEVEL':'NIVEL DEL SUELO',
  'CONCRETE PAD':'BASE DE CONCRETO','LIVING SPACE':'ESPACIO HABITABLE',
  'ATTIC':'ÁTICO','UTILITY CLOSET':'CLÓSET DE SERVICIO','OUTSIDE':'EXTERIOR',
  'FIBERGLASS INSULATION':'AISLAMIENTO DE FIBRA','SPRAY FOAM INSULATION':'AISLAMIENTO DE ESPUMA',
  'SPRAY FOAM':'ESPUMA AISLANTE','COMMUNICATING':'COMUNICANTE',
  'LIVE SYSTEM PREVIEW':'VISTA PREVIA DEL SISTEMA',
  'Choose your location to begin building':'Elija su ubicación para comenzar',
  'Components assemble here in real time →':'Los componentes se arman aquí en tiempo real →',
  'IN':'ENT','OUT':'SAL','AUX HEAT KIT':'KIT DE CALOR AUX',
  'ACTIVE':'ACTIVO','STANDBY':'EN ESPERA','RELEASING HEAT':'LIBERANDO CALOR',
  'ABSORBING HEAT':'ABSORBIENDO CALOR','REJECTING HEAT':'EXPULSANDO CALOR',
  'AUX HEAT ONLY':'SOLO CALOR AUX','GAS HEATING ACTIVE':'CALEFACCIÓN A GAS ACTIVA',
  'PVC':'PVC','B-VENT':'VENTEO-B','ECM MOTOR':'MOTOR ECM',
  'VARIABLE SPEED':'VELOCIDAD VARIABLE','MOD. VAR. SPEED':'VEL. VAR. MOD.',
  'preview how your system runs':'vista previa de cómo funciona su sistema',
  'COOL MODE':'MODO FRÍO','HEAT PUMP':'BOMBA DE CALOR','AUX HEAT':'CALOR AUX',
  'OUTSIDE TEMP':'TEMP. EXTERIOR','COOL':'FRÍO','HEAT':'CALOR',
  'HP':'BC','AUX':'AUX','FURN':'HRN',
  'SURGE':'SOBREVOLT.','PROTECTOR':'PROTECTOR',
  'CONDENSER · ACTIVE':'CONDENSADOR · ACTIVO','CONDENSER · STANDBY':'CONDENSADOR · EN ESPERA',
  'HEAT MODE':'MODO CALOR',
  'Not a control - tap to see how this system behaves in each mode':'No es un control - toque para ver cómo se comporta este sistema en cada modo',
  'Not a control - click to see how this system behaves in each mode':'No es un control - haga clic para ver cómo se comporta este sistema en cada modo',
  '2×4 RETURN AIR CHASE':'2×4 DUCTO DE RETORNO',
};
function CT(en,lang){ return lang==='es'&&CANVAS_ES[en]?CANVAS_ES[en]:en; }

// Clickable overlay on a finished diagram piece - only wired up on the done
// screen (onEditStep is undefined during the wizard itself, where jumping
// mid-flow doesn't make sense). Used to also draw its own gold ring around
// this WHOLE box on hover (.edit-zone:hover .edit-zone-ring in styles.css)
// - removed once every individual sub-part got its own HoverInfo ring
// (highlight defaults on there now - see its own module comment): with
// both showing at once, hovering just the furnace also lit up a ring
// around the furnace+coil pair together, which read as "these are one
// thing" when they're not. The per-part rings nested as this box's own
// children (or, for indoor_type/cond_tier, painted by the FurnaceH/
// ACoilH/Condenser/etc. components themselves) already cover the whole
// box between them, so nothing is lost - cursor:pointer plus the tooltip
// panel are enough affordance that this box is clickable on its own.
//
// Module-scope, not a Canvas-scoped closure like it used to be - Canvas
// redefined it as a brand-new function on every single render, and since
// React treats a JSX tag's underlying function reference as its component
// identity, every <EditZone> on the page was unmounting and remounting on
// every render, not just the one whose SVG_SCALE/vw/vh actually changed.
// Once the hover-info feature added a `hoverPart` state that changes on
// nearly every mouse movement over the diagram, this went from a rare
// (wizard step change, window resize) event to a constant one - visible
// as the furnace/condenser box's glow ring and everything painted after it
// flickering or "jumping" on almost every hover, the bug reported after
// hover-info shipped. onEditStep/svgScale/vw/vh - all read from Canvas's
// own closures before - now come in as explicit props instead, same as
// HoverInfo's own vw/vh above, so this function's identity stays stable
// across renders that don't actually change any of them.
//
// Some real-world components (the thermostat, mainly) are small enough in
// their own right that a narrow mobile frame's scale-down (the whole
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
// children (optional, purely additive - every existing call site passes
// none) render LAST inside this same <g onClick=...>, i.e. on TOP of
// EditZone's own two rects. That's what lets a HoverInfo passed as a
// child of a box's own EditZone actually win hover here on the done
// screen: EditZone's own hit-rect otherwise has to stay topmost (it's
// deliberately painted after the equipment it covers, elsewhere in this
// file, so a click anywhere in the box - not just a thin gap between
// opaque shapes - reaches it) which means anything painted BEFORE this
// point (e.g. a HoverInfo nested inside BlowerWheel/Condenser/etc., which
// only ever runs during the wizard where onEditStep is undefined and
// EditZone doesn't exist at all) never gets a chance to be hovered once
// EditZone exists too. Nesting the done-screen version of those same
// sub-part hovers HERE instead keeps them working in both modes without
// moving EditZone itself (which would break its own click coverage - see
// the call sites that pass children for the full reasoning). Clicking a
// child still does nothing but forward to this SAME onEditStep(stepId) -
// see HoverInfo's own module comment.
function EditZone({x,y,w,h,stepId,rx,children,onEditStep,svgScale,vw,vh}){
  if(!onEditStep)return null;
  const minUnits=svgScale>0?MIN_EDIT_PX/svgScale:0;
  let ex=x, ey=y, ew=w, eh=h;
  if(ew<minUnits){ex-=(minUnits-ew)/2; ew=minUnits;}
  if(eh<minUnits){ey-=(minUnits-eh)/2; eh=minUnits;}
  if(vw){if(ex<0)ex=0; if(ex+ew>vw)ex=Math.max(0,vw-ew);}
  if(vh){if(ey<0)ey=0; if(ey+eh>vh)ey=Math.max(0,vh-eh);}
  // QA FIX - this rect's own hit-testing used to rely on the assumption
  // that being painted after whatever it covers is enough ("elsewhere in
  // this file... deliberately painted after the equipment it covers" -
  // see this component's own module comment above) - true against the
  // equipment graphics themselves, but a QA pass found real dead clicks
  // along the condenser's bottom edge in both layouts where a handful of
  // OutsideZone's own decorative rects (ground fill, concrete pad) still
  // sat on top despite that ordering, because fill="transparent" isn't
  // actually hit-tested the same as a real paint under this browser's
  // default pointer-events:visiblePainted - confirmed via
  // elementFromPoint(). Every other interactive hit-box in this file
  // (HoverInfo) already forces this explicitly; EditZone's own rect
  // hadn't needed to until something happened to occlude it. Making it
  // explicit here fixes the root cause once instead of chasing every
  // decorative layer that could ever end up drawn on top of an EditZone.
  return <g className="edit-zone" onClick={()=>onEditStep(stepId)}>
    <rect x={ex} y={ey} width={ew} height={eh} rx={rx||4} fill="transparent" stroke="none"
      style={{pointerEvents:'all'}}/>
    {children}
  </g>;
}

const MIN_FOCUS_PX=28;
// Dashed marching-ants ring drawn around the spot where the wizard's
// CURRENT step's part is about to appear (or already has) - the "here's
// what we're building next" cue described in EditZone's own comment
// above, distinct from EditZone's solid on-hover ring. Module-scope for
// the same remount reason as EditZone itself: this used to be a Canvas-
// local const closing over onEditStep/curStepId/SVG_SCALE/SVG_VW/SVG_VH,
// which meant a fresh component identity - and a restarted marching-ants
// animation (.step-focus-ring in styles.css reuses the ductwork's own
// .airflow keyframe) - on every single hoverPart change during the
// wizard's live preview, i.e. constantly, since that's exactly when this
// ring is on screen. onEditStep/curStepId/svgScale/vw/vh now come in as
// explicit props, same convention as EditZone just above.
function StepFocusRing({x,y,w,h,stepId,rx,onEditStep,curStepId,svgScale,vw,vh}){
  if(onEditStep||curStepId!==stepId)return null;
  const minUnits=svgScale>0?MIN_FOCUS_PX/svgScale:0;
  let fx=x, fy=y, fw=w, fh=h;
  if(fw<minUnits){fx-=(minUnits-fw)/2; fw=minUnits;}
  if(fh<minUnits){fy-=(minUnits-fh)/2; fh=minUnits;}
  if(vw){if(fx<0)fx=0; if(fx+fw>vw)fx=Math.max(0,vw-fw);}
  if(vh){if(fy<0)fy=0; if(fy+fh>vh)fy=Math.max(0,vh-fh);}
  return <rect className="step-focus-ring" x={fx-4} y={fy-4} width={fw+8} height={fh+8}
    rx={(rx||4)+4} fill="none" filter="url(#glow-sm)"/>;
}

// Equipment-diagram color palette - gold/blue/white/orange/silver rgba
// prefixes shared by every cabinet sub-component below (FurnaceH,
// BlowerWheel, ACoilH/V, Condenser, CondenserFan, CapFan, and the small
// cabinet/coil detail kits they call). Genuinely constant strings (never
// derived from wizard state), so - unlike evapC/condC/etc. below, which
// really do vary per Canvas render and stay Canvas-local - these live at
// module scope instead of being redeclared as a fresh `const` on every
// single Canvas call. That's what lets the diagram sub-components that
// only need color, not wizard state, move to module scope too (see the
// module comment on OutsideZone above for why component identity has to
// be stable across Canvas re-renders): a module-scope function can't
// close over a Canvas-local `const`, so as long as these were Canvas-
// local, EVERY diagram sub-component that used them was pinned to also
// being Canvas-local, and hence to re-mounting on every hoverPart change
// - not just the couple that genuinely need wizard-derived state.
const G='rgba(215,183,64,';
const B='rgba(35,137,224,';
const W='rgba(255,255,255,';
const O='rgba(249,115,22,';
// Slate matte silver - the furnace/air-handler cabinet exterior and the
// blower's own static motor housing. Real equipment cabinets are
// galvanized sheet metal, not gold. Gold (G) stays reserved for the
// plenum, spec/tier badges, and the blower WHEEL itself (the moving
// assembly - kept gold on purpose, it reads well while spinning).
const S='rgba(148,158,172,';

// ── CABINET EXTERIOR DETAIL KIT ─────────────────────────────
// Small shared bits reused by all four furnace/air-handler cabinet
// shells (FurnaceH + AirHandlerH, plus the closet layout's own inline
// furnace/A-coil-AH boxes) so the "genuine sheet-metal cabinet" read -
// rivets, a seam-mounted latch, a brand-agnostic data plate - looks
// identical everywhere instead of each shell re-deriving its own
// version. Each call site still picks its own x/y placement (the
// internals differ enough between shells that a single auto-layout
// would collide with something in at least one of them), but the
// artwork itself is one definition.
//
// Module-scope, not nested inside Canvas like the shells that call them
// used to be: these only ever needed the palette constants just above
// (now also module-scope) plus their own explicit params, so hoisting
// them costs nothing and lets FurnaceH/AirHandlerH be hoisted too - see
// the module comment on OutsideZone above for why identity stability
// matters here.
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

// ── COIL TUBE DETAIL KIT ─────────────────────────────────────
// Shared by ACoilH/ACoilV below. Module-scope for the same reason as the
// cabinet kit just above - zero closure dependencies beyond the palette
// constants (which are module-scope too now), so there's no reason to
// have these be redefined on every Canvas render.

// A single copper tube end, face-on - the visible cross-section where
// one pass of the serpentine coil tube pokes through the fin pack. A
// flat stroked ellipse (the old version) reads as a painted ring, not
// a rounded piece of metal - adding a bright rim highlight along the
// upper edge (the same "catch the light from above" trick used on the
// condenser's hail-guard flange and cabinet edges elsewhere) is what
// actually sells it as a small round tube instead of a flat icon.
function CoilTube({cx,cy,rx,ry,rotate,fill,stroke,glow,active,delay}){
  rx=rx||4; ry=ry||2;
  return <g transform={`rotate(${rotate||0},${cx},${cy})`}>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth="0.9"/>
    <path d={`M${(cx-rx*0.55).toFixed(1)} ${(cy-ry*0.55).toFixed(1)} Q${cx.toFixed(1)} ${(cy-ry*1.25).toFixed(1)} ${(cx+rx*0.55).toFixed(1)} ${(cy-ry*0.55).toFixed(1)}`}
      fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="0.5" strokeLinecap="round"/>
    {active&&glow&&<circle cx={cx} cy={cy} r={Math.min(rx,ry)*0.85} fill={glow} opacity="0.7" className="glow-pulse" style={{animationDelay:(delay||0)+'s'}}/>}
  </g>;
}
// A bead of condensate clinging to the fin pack - real evaporator coils
// sweat heavily in cooling mode (the fin surface runs below the room's
// dew point), which is one of the most immediately recognizable "this
// coil is actually running" cues on a real unit. Only ever drawn when
// active (cooling) - a dry coil in heating/standby has no condensate.
function CoilSweat({cx,cy,r,delay}){
  r=r||1.7;
  return <g style={{animationDelay:(delay||0)+'s'}} className="glow-pulse">
    <circle cx={cx} cy={cy} r={r} fill="rgba(200,230,252,.85)" stroke="rgba(235,246,255,.9)" strokeWidth="0.5"/>
    <circle cx={cx-r*0.35} cy={cy-r*0.35} r={r*0.32} fill="rgba(255,255,255,.9)"/>
  </g>;
}

// UV rod - thin horizontal rod ~45px (9" at scale), UV purple glow.
// Module-scope, zero closure dependencies (pure geometry from its own
// params) - used by ACoilH/ACoilV below.
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

// Indoor blower - a real furnace/AH blower is a forward-curved
// centrifugal ("squirrel cage") wheel: many short, shallow blades
// mounted between two thin end rings at the RIM, all swept the same
// rotational direction, with the wheel's flat front/back disc (and its
// spider of structural spokes down to the hub) showing through the gaps
// between blades - nothing like a bicycle-wheel spoke pattern radiating
// from the hub itself. Many small rim-mounted scoops, same curved-path-
// blade technique CondenserFan below uses with few large hub-mounted
// ones instead.
//
// Module-scope, not nested inside Canvas like it used to be - the exact
// same "brand-new function reference every Canvas render" bug EditZone's
// own module comment (above OutsideZone) describes, just without a CSS
// entrance animation on this component's OWN outer <g> to make the churn
// read as a "jump." It still remounts the whole wheel - discarding and
// recreating every blade/spoke/hub <path>/<circle> - on every hoverPart
// change once hover-info's HoverCtx makes that happen on nearly every
// mouse movement over the diagram, which resets this wheel's own CSS
// `.spin` animation (see styles.css) to its start angle every single
// time: a real, confirmed (via getAnimations().currentTime dropping back
// toward 0 on each hover, checked directly against the DOM node identity
// via a ref-attached fingerprint) spinning-blower stutter, not just
// wasted DOM churn. onEditStep/lang/vw/vh come in as explicit props
// instead of Canvas closures for the same reason EditZone's own do.
function BlowerWheel({cx,cy,r,spd,active,onEditStep,lang,vw,vh}){
  r=r||28; spd=spd||1; active=active!==false;
  const n=22;
  const innerR=r*0.56, outerR=r*0.92;
  const bladeFill=active?(G+'.62)'):(G+'.13)');
  const bladeStroke=active?(G+'.82)'):(G+'.24)');
  const blades=Array.from({length:n},(_,i)=>{
    const ang=i*(Math.PI*2/n);
    // Each blade is a thin curved scoop between innerR and outerR - a
    // filled sliver (not a stroked line) so it keeps a shallow "cup"
    // cross-section instead of reading as a wire spoke. The trailing
    // edge sits at +sweep so every blade curls the same way, the way a
    // forward-curved wheel's blades all lean into the direction of
    // rotation.
    const sweep=0.30, backSweep=0.09;
    const ax=cx+innerR*Math.cos(ang-backSweep), ay=cy+innerR*Math.sin(ang-backSweep);
    const bx=cx+innerR*Math.cos(ang+backSweep), by=cy+innerR*Math.sin(ang+backSweep);
    const tipAng=ang+sweep;
    const cAng=ang+sweep*0.55, cR=(innerR+outerR)/2*1.04;
    const cxm=cx+cR*Math.cos(cAng), cym=cy+cR*Math.sin(cAng);
    const tx=cx+outerR*Math.cos(tipAng), ty=cy+outerR*Math.sin(tipAng);
    const d=`M${ax.toFixed(1)} ${ay.toFixed(1)} Q${cxm.toFixed(1)} ${cym.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} `+
      `L${(tx-1.2*Math.cos(tipAng-1.2)).toFixed(1)} ${(ty-1.2*Math.sin(tipAng-1.2)).toFixed(1)} `+
      `Q${(cx+cR*0.82*Math.cos(cAng)).toFixed(1)} ${(cy+cR*0.82*Math.sin(cAng)).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)} Z`;
    return <path key={i} d={d} fill={bladeFill} stroke={bladeStroke} strokeWidth="0.5"/>;
  });
  return <g>
    {/* Outer ring is the static motor housing (never moves) - slate
        silver, matching the rest of the cabinet exterior. The wheel
        itself (rim, blades, hub below) stays gold - it's the moving
        assembly and reads well spinning against the silver housing. */}
    <circle cx={cx} cy={cy} r={r+4} fill="rgba(0,0,0,.5)" stroke={S+'.4)'} strokeWidth="0.8"/>
    <circle cx={cx} cy={cy} r={r} fill="#050505" stroke={G+'.3)'} strokeWidth="0.9"/>
    {/* Rim band the blade tips mount to - a hair inside the housing
        bore, so the wheel reads as a specific, slightly-smaller part
        sitting inside the scroll housing rather than filling it. */}
    <circle cx={cx} cy={cy} r={outerR+1} fill="none" stroke={active?(G+'.4)'):(G+'.12)')} strokeWidth="1"/>
    {active
      ?<g className="spin" style={{transformBox:'fill-box',transformOrigin:'center',animationDuration:(1.0/spd)+'s'}}>{blades}</g>
      :<g>{blades}</g>}
    {/* Front-disc structural spokes - the flat plate a real squirrel-
        cage wheel's blades are riveted to, showing through as thin ribs
        from the hub out to the inner blade ring. Spins with the wheel
        (same group as the blades) since it's one rigid stamped part. */}
    {active
      ?<g className="spin" style={{transformBox:'fill-box',transformOrigin:'center',animationDuration:(1.0/spd)+'s'}}>
        {Array.from({length:4},(_,i)=>{
          const ang=i*(Math.PI/2);
          return <line key={i} x1={cx+r*0.13*Math.cos(ang)} y1={cy+r*0.13*Math.sin(ang)}
            x2={cx+innerR*Math.cos(ang)} y2={cy+innerR*Math.sin(ang)}
            stroke={G+'.2)'} strokeWidth="1.1"/>;
        })}
      </g>
      :Array.from({length:4},(_,i)=>{
        const ang=i*(Math.PI/2);
        return <line key={i} x1={cx+r*0.13*Math.cos(ang)} y1={cy+r*0.13*Math.sin(ang)}
          x2={cx+innerR*Math.cos(ang)} y2={cy+innerR*Math.sin(ang)}
          stroke={G+'.08)'} strokeWidth="1.1"/>;
      })}
    <circle cx={cx} cy={cy} r={r*0.27} fill="#090909" stroke={G+'.34)'} strokeWidth="0.9"/>
    <circle cx={cx} cy={cy} r={r*0.1} fill="#111" stroke={G+'.42)'} strokeWidth="0.6"/>
    {/* Every BlowerWheel call site sits inside the furnace/air-handler
        cabinet's own indoor_type EditZone box, so a hover hit-rect here
        - necessarily painted on top of it for the hover to register at
        all - needs the same onClick forwarding HoverInfo's own module
        comment describes, to keep the done screen's existing "click the
        furnace/AH to quick-edit indoor_type" behavior exactly as it was. */}
    <HoverInfo x={cx-r-5} y={cy-r-5} w={(r+5)*2} h={(r+5)*2} rx={r+5}
      vw={vw} vh={vh} title={partInfo('blower',lang).title} text={partInfo('blower',lang).text}
      onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
  </g>;
}

// Outdoor axial condenser fan, viewed head-on - real condenser fans have
// a small number (typically 3) of large, wide blades, nothing like an
// indoor squirrel-cage blower's many thin radial vanes (BlowerWheel
// above). Kept as its own component specifically so the mid-tier
// condenser's front fan never gets confused with an indoor blower again.
//
// Module-scope for the same "stop remounting the whole thing on every
// hoverPart change" reason as BlowerWheel just above - this fan spins
// via the same CSS `.spin` class, so it had the exact same confirmed
// rotation-reset stutter every time the diagram's hover state changed.
function CondenserFan({cx,cy,r,active,speedMode,onEditStep,lang,vw,vh}){
  // Real axial blades are a filled, tapered scimitar shape - wide at the
  // hub, sweeping out to a near-point tip - not a uniform-width stroked
  // line. A thick round-capped stroke (the old approach) has no taper
  // and reads as a flailing stick-figure limb instead of a blade. Each
  // blade here is a closed path: a wide edge at the hub, two curves
  // sweeping out to a narrow tip, filled solid with a glowing accent
  // rim when spinning for a cleaner, more high-tech look.
  const bladeFill=active?'#ccd3e0':'#565c68';
  const rim=active?'#7fb8ff':'rgba(70,76,90,.6)';
  // RPM (expressed as seconds-per-revolution, so lower = faster) eases
  // between the cool/hp/off targets over the same ~2.5s mode-toggle
  // window as everything else, instead of the motor instantly jump-
  // cutting speed - see useLerpedNumber's own comment for why this can't
  // just be a CSS transition on animation-duration the way colors are.
  // Per direct feedback that cool and heat-pump mode looked identical
  // (both used to share one "fast" duration, reading as maybe 60% speed
  // in both) - cool mode is now genuinely full speed and heat pump a
  // visibly slower ~60% of that RPM, matching how a real modulating
  // condenser fan actually runs harder on a hot cooling day than on a
  // mild heat-pump heating one.
  const spinDuration=useLerpedNumber(speedMode==='cool'?0.3:speedMode==='hp'?0.5:0.8);
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
    <g className={active?"spin":undefined} style={active?{transformBox:'view-box',transformOrigin:cx+'px '+cy+'px',animationDuration:spinDuration+'s'}:{}}>
      {/* Broad sickle blades - widened per a reference photo of a real
          3-blade condenser fan, where the blades themselves (not gaps)
          cover most of the disc, maybe ~60% blade / ~40% visible gap,
          not a thin airplane-propeller silhouette. Wider hub base, a
          bigger sweep angle, and control points pushed further out
          (both edges, not just the leading one) keep the blade fuller
          for more of its length instead of tapering to a point early. */}
      {Array.from({length:3},(_,i)=>{
        const ang=i*(Math.PI*2/3);
        const sweep=1.4;
        const hubR=r*0.14, tipR=r*0.94;
        const ux=Math.cos(ang), uy=Math.sin(ang);
        const px=-Math.sin(ang), py=Math.cos(ang);
        const hubW=r*0.38;
        const hAx=cx+ux*hubR+px*hubW, hAy=cy+uy*hubR+py*hubW;
        const hBx=cx+ux*hubR-px*hubW, hBy=cy+uy*hubR-py*hubW;
        const tipAng=ang+sweep;
        const tX=cx+Math.cos(tipAng)*tipR, tY=cy+Math.sin(tipAng)*tipR;
        const c1Ang=ang+sweep*0.42, c1R=r*0.78;
        const c1X=cx+Math.cos(c1Ang)*c1R+px*hubW*0.78, c1Y=cy+Math.sin(c1Ang)*c1R+py*hubW*0.78;
        const c2Ang=ang+sweep*0.78, c2R=r*0.68;
        const c2X=cx+Math.cos(c2Ang)*c2R-px*hubW*0.6, c2Y=cy+Math.sin(c2Ang)*c2R-py*hubW*0.6;
        const d=`M${hAx.toFixed(1)} ${hAy.toFixed(1)} Q${c1X.toFixed(1)} ${c1Y.toFixed(1)} ${tX.toFixed(1)} ${tY.toFixed(1)} Q${c2X.toFixed(1)} ${c2Y.toFixed(1)} ${hBx.toFixed(1)} ${hBy.toFixed(1)} Z`;
        return <path key={i} d={d} fill={bladeFill} stroke={active?rim:'rgba(20,22,26,.7)'} strokeWidth="0.7" opacity={active?0.95:0.8}/>;
      })}
    </g>
    <circle cx={cx} cy={cy} r={r*0.18} fill="#16181c" stroke={active?rim:"rgba(90,95,110,.6)"} strokeWidth="1"/>
    <circle cx={cx} cy={cy} r={r*0.07} fill={active?rim:"#3a3d44"}/>
    {/* Only reached from Condenser's own mid-tier (front-discharge)
        layout below - CapFan (the top-cap fan the other two tiers use)
        gets its own separate hover, since it's a different component.
        Sits inside the cond_tier EditZone box, same onClick-forwarding
        reasoning as BlowerWheel's own hover above. */}
    <HoverInfo x={cx-r-4} y={cy-r-4} w={(r+4)*2} h={(r+4)*2} rx={r+4}
      vw={vw} vh={vh} title={partInfo('condenser_fan',lang).title} text={partInfo('condenser_fan',lang).text}
      onClick={onEditStep?()=>onEditStep('cond_tier'):undefined}/>
  </g>;
}

// A-coil > (peak RIGHT) - horizontal attic.
//
// Module-scope, same "stop remounting on every hoverPart change" reason
// as BlowerWheel/CondenserFan above - the coil's own CoilSweat condensate
// beads and CoilTube glow dots use the `.glow-pulse` animation class, so
// this had the same confirmed reset-on-remount stutter. evapC/evapC2
// (the refrigerant colors, which really do change with heat-pump mode)
// and hasUV/infoKey (which UV-rod/hover copy to show) come in as explicit
// props instead of Canvas closures, same as everywhere else in this file
// that made this move; infoKey replaces a `acoilInfoKey()` call since
// that helper's own inputs (heatMode/refReversed) are themselves Canvas
// state - callers compute the key once and pass the resulting string.
function ACoilH({x,y,w,h,active,evapC,evapC2,hasUV,infoKey,onEditStep,lang,vw,vh}){
  const peakX=x+w, peakY=y+h/2; const n=8;
  const tc=active?evapC:'rgba(48,48,78,.8)';
  const distX=peakX-5, distY=peakY+4;
  return <g>
    <polygon points={`${x},${y} ${peakX},${peakY} ${peakX},${peakY+8} ${x},${y+12}`}
      fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"}
      stroke={active?(evapC+'88'):(G+'.22)')} strokeWidth="0.9"/>
    <polygon points={`${x},${y+h} ${peakX},${peakY} ${peakX},${peakY+8} ${x},${y+h-12}`}
      fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"}
      stroke={active?(evapC2+'80'):(G+'.18)')} strokeWidth="0.9"/>
    {/* Aluminum fin pack - denser and a touch brighter than before (14
        hairlines at .04 opacity read as almost nothing at diagram
        scale) plus every 4th line nudged brighter, the way a real fin
        pack's stamped ridges catch uneven light instead of a flat
        hatch. */}
    {Array.from({length:20},(_,i)=>(
      <line key={i} x1={x+4} y1={y+h*(i+0.5)/20} x2={x+w-8} y2={y+h*(i+0.5)/20}
        stroke={i%4===0?W+'.08)':W+'.035)'} strokeWidth="0.4"/>
    ))}
    {Array.from({length:n},(_,i)=>{
      const t=(i+0.5)/n, tx=x+(peakX-x)*t+3, ty=y+(peakY-y)*t+3;
      return <g key={i}>
        <CoilTube cx={tx} cy={ty} rotate={-22} fill={active?(evapC+'22'):'rgba(14,14,34,.8)'} stroke={tc} glow={evapC} active={active} delay={i*0.1}/>
        {/* Capillary feeder - thin line from the peak distributor out
            to this circuit's first tube, showing where its refrigerant
            actually comes from instead of leaving the distributor
            floating unconnected to the coil rows it feeds. Only drawn
            for every other circuit so it stays a light suggestion
            instead of a dense knot of lines converging on one point. */}
        {i%2===0&&<path d={`M${distX.toFixed(1)} ${distY.toFixed(1)} Q${(distX-(distX-tx)*0.5).toFixed(1)} ${(distY-6).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`}
          fill="none" stroke={active?(evapC+'55'):'rgba(110,110,140,.22)'} strokeWidth="0.7"/>}
        {active&&i%3===1&&<CoilSweat cx={tx+1.5} cy={ty+3} delay={i*0.35}/>}
      </g>;
    })}
    {Array.from({length:n},(_,i)=>{
      const t=(i+0.5)/n, tx=x+(peakX-x)*t+3, ty=(y+h)+(peakY-(y+h))*t-3;
      return <g key={i}>
        <CoilTube cx={tx} cy={ty} rotate={22} fill={active?(evapC2+'22'):'rgba(14,14,34,.8)'} stroke={active?evapC2:tc} glow={evapC2} active={active} delay={(i+n)*0.1}/>
        {active&&i%3===2&&<CoilSweat cx={tx-1.5} cy={ty+3} delay={(i+n)*0.3}/>}
      </g>;
    })}
    <circle cx={distX} cy={distY} r={5.5} fill="#06061c" stroke={active?evapC:(G+'.3)')} strokeWidth="1.3"/>
    {active&&<circle cx={distX} cy={distY} r={2.5} fill={evapC} opacity="0.85" className="glow-pulse"/>}
    <rect x={x} y={y+h} width={w} height={6} rx="1" fill="#08121e" stroke={B+'.2)'} strokeWidth="0.7"/>
    {/* UV rod - centered exactly in the > coil:
        horizontal midline = y+h/2, depth center = x + w*0.45
        rod runs horizontal, length ~9" at scale (46px) */}
    {hasUV&&<UVRod x={x+w*0.48-Math.min(w*0.70,w-12)/2} y={y+h/2} len={Math.min(w*0.70,w-12)}/>}
    {/* Sits inside the indoor_type EditZone box, same onClick-forwarding
        reasoning as BlowerWheel's own hover above. */}
    <HoverInfo x={x} y={y} w={w} h={h} rx={3} vw={vw} vh={vh}
      title={partInfo(infoKey,lang).title} text={partInfo(infoKey,lang).text}
      onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
    {/* UV-specific hover, painted AFTER (so it wins hover priority over)
        the whole-coil hover just above, matching the ringPath/priority
        convention used elsewhere in this file - otherwise hovering
        directly over the rod just showed the generic A-coil copy. */}
    {hasUV&&(()=>{
      const rodLen=Math.min(w*0.70,w-12), rodCX=x+w*0.48, rodCY=y+h/2;
      return <HoverInfo x={rodCX-rodLen/2-4} y={rodCY-6} w={rodLen+8} h={16} rx={3}
        vw={vw} vh={vh} title={partInfo('uv_light',lang).title} text={partInfo('uv_light',lang).text}/>;
    })()}
  </g>;
}

// A-coil ^ (peak UP) - upflow. Module-scope for the same reason as ACoilH
// just above.
function ACoilV({x,y,w,h,active,evapC,evapC2,hasUV,infoKey,onEditStep,lang,vw,vh}){
  const peakX=x+w/2, peakY=y; const n=7;
  const tc=active?evapC:'rgba(48,48,78,.8)';
  const distX=peakX+4, distY=peakY+6;
  const angL=Math.atan2(peakY-(y+h),peakX-x)*180/Math.PI;
  const angR=Math.atan2(peakY-(y+h),peakX-(x+w))*180/Math.PI;
  return <g>
    <polygon points={`${x},${y+h} ${peakX},${peakY} ${peakX+8},${peakY} ${x+12},${y+h}`}
      fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"} stroke={active?(evapC+'88'):(G+'.22)')} strokeWidth="0.9"/>
    <polygon points={`${x+w},${y+h} ${peakX},${peakY} ${peakX+8},${peakY} ${x+w-12},${y+h}`}
      fill={active?"rgba(4,10,28,.9)":"rgba(7,7,20,.9)"} stroke={active?(evapC2+'80'):(G+'.18)')} strokeWidth="0.9"/>
    {/* Aluminum fin pack - see ACoilH's own comment on the same density/
        brightness bump, mirrored here for the vertical A-frame. */}
    {Array.from({length:18},(_,i)=>(
      <line key={i} x1={x+w*(i+0.5)/18} y1={y+4} x2={x+w*(i+0.5)/18} y2={y+h-4}
        stroke={i%4===0?W+'.08)':W+'.035)'} strokeWidth="0.4"/>
    ))}
    {Array.from({length:n},(_,i)=>{
      const t=(i+0.5)/n, tx=x+(peakX-x)*t+3, ty=(y+h)+(peakY-(y+h))*t+3;
      return <g key={i}>
        <CoilTube cx={tx} cy={ty} rotate={angL} fill={active?(evapC+'22'):'rgba(14,14,34,.8)'} stroke={tc} glow={evapC} active={active} delay={i*0.11}/>
        {/* Capillary feeder from the peak distributor - see ACoilH's
            own comment on this same detail. */}
        {i%2===0&&<path d={`M${distX.toFixed(1)} ${distY.toFixed(1)} Q${(distX-(distX-tx)*0.5).toFixed(1)} ${(distY+ (ty-distY)*0.4).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`}
          fill="none" stroke={active?(evapC+'55'):'rgba(110,110,140,.22)'} strokeWidth="0.7"/>}
        {active&&i%3===1&&<CoilSweat cx={tx+1.5} cy={ty+3} delay={i*0.35}/>}
      </g>;
    })}
    {Array.from({length:n},(_,i)=>{
      const t=(i+0.5)/n, tx=(x+w)+(peakX-(x+w))*t-3, ty=(y+h)+(peakY-(y+h))*t+3;
      return <g key={i}>
        <CoilTube cx={tx} cy={ty} rotate={angR} fill={active?(evapC2+'22'):'rgba(14,14,34,.8)'} stroke={active?evapC2:tc} glow={evapC2} active={active} delay={(i+n)*0.11}/>
        {active&&i%3===2&&<CoilSweat cx={tx-1.5} cy={ty+3} delay={(i+n)*0.3}/>}
      </g>;
    })}
    <circle cx={distX} cy={distY} r={5.5} fill="#06061c" stroke={active?evapC:(G+'.3)')} strokeWidth="1.3"/>
    {active&&<circle cx={distX} cy={distY} r={2.5} fill={evapC} opacity="0.85" className="glow-pulse"/>}
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
    <rect className="phase-color" x={x+w-6} y={y+h*0.80-3} width={16} height={6} rx="1.5" fill={active?(evapC+'2a'):'rgba(22,22,44,.7)'} stroke={evapC} strokeWidth="0.9"/>
    <rect className="phase-color" x={x+w-6} y={y+h*0.88-3} width={16} height={6} rx="1.5" fill={active?(evapC2+'2a'):'rgba(22,22,44,.7)'} stroke={evapC2} strokeWidth="0.9"/>
    {/* Sits inside the indoor_type EditZone box, same onClick-forwarding
        reasoning as BlowerWheel's own hover above. */}
    <HoverInfo x={x} y={y} w={w} h={h} rx={3} vw={vw} vh={vh}
      title={partInfo(infoKey,lang).title} text={partInfo(infoKey,lang).text}
      onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
    {/* UV-specific hover, painted AFTER the whole-coil hover just above
        so it wins - see ACoilH's own comment on this same pattern. */}
    {hasUV&&(()=>{
      const rodCX=x+w*0.5, rodLen2=Math.min(h*0.75,h-12), rodCY=y+h/2;
      return <HoverInfo x={rodCX-8} y={rodCY-rodLen2/2-4} w={16} h={rodLen2+8} rx={3}
        vw={vw} vh={vh} title={partInfo('uv_light',lang).title} text={partInfo('uv_light',lang).text}/>;
    })()}
  </g>;
}

// Furnace horizontal - blower LEFT | HX RIGHT.
//
// Module-scope - this is the component whose remount was originally
// flagged as a candidate for the same bug that hit EditZone (see its own
// module comment above OutsideZone): defined fresh inside Canvas on
// every render, so every hoverPart change (nearly every mouse movement
// once hover-info shipped) unmounted and remounted this whole cabinet -
// BlowerWheel included - discarding every path/rect/circle inside it.
// Confirmed via a DOM-identity fingerprint (a random id stamped onto the
// root <g> via a ref callback, checked with document.contains() across a
// hover) that this really was a fresh DOM node each time, and via
// getAnimations().currentTime that the flame glow-pulse ellipses and
// BlowerWheel's own `.spin` rotation were resetting because of it - a
// real, visible stutter, not just wasted DOM churn (EditZone's own
// remount was worse only because .edit-zone-ring's `.snap` entrance
// animation replays a bounce-in on every remount; FurnaceH has no such
// entrance animation on its own outer <g>, so the churn here never read
// as a "jump" the way EditZone's did, but it's the same underlying bug).
// onEditStep/lang/vw/vh and the wizard-derived blowerActive/is90/isComm/
// BLOWER_MOTOR come in as explicit props instead of Canvas closures, same
// convention as BlowerWheel/ACoilH/ACoilV above.
function FurnaceH({x,y,w,h,active,roofY,onEditStep,lang,vw,vh,blowerActive,is90,isComm,blowerMotorLabel}){
  const mid=x+w/2;
  return <g>
    {/* General cabinet hover - painted first/bottommost so the more
        specific heat-exchanger/AFUE hovers added further down (painted
        later, i.e. on top) win their own smaller areas; BlowerWheel adds
        its own hover internally. Sits inside the indoor_type EditZone
        box, same onClick-forwarding reasoning as everywhere else in
        this file. */}
    <HoverInfo x={x} y={y} w={w} h={h} rx={4} vw={vw} vh={vh}
      title={partInfo('furnace_cabinet',lang).title} text={partInfo('furnace_cabinet',lang).text}
      onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
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
    {/* Faint active-state tint over the whole cabinet - purely a color
        wash (stroke="none", fill isn't literally "none" though, so SVG's
        default pointer-events:visiblePainted still hit-tests it) painted
        AFTER the general cabinet hover above it. Found swallowing that
        hover across the ENTIRE box whenever active (i.e. whenever the
        system is actually running - found via a wizard-step hover sweep,
        the done-screen sweep never exercises "hover the plain cabinet
        while a more specific sub-part isn't also covering that pixel"
        for every combination). Same fix as the flue-pipe swallowed-hover
        bug above: pointer-events:none, since this tint has no
        interactivity of its own to lose. */}
    {active&&<rect x={x} y={y} width={w} height={h} rx="4" fill={O+'.04)'} stroke="none" style={{pointerEvents:'none'}}/>}
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
      spd={blowerActive?1.6:0.5} active={blowerActive}
      onEditStep={onEditStep} lang={lang} vw={vw} vh={vh}/>
    <text x={x+w*0.25} y={y+h-13} textAnchor="middle" fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">{CT('BLOWER',lang)}</text>
    <text x={x+w*0.25} y={y+h-4} textAnchor="middle" fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{blowerMotorLabel}</text>
    {/* Clamshell HX tubes - each is a stamped-steel cell, not a flat
        orange squiggle: a thin highlight riding the curve's upper edge
        (same "catch light from above" convention as CoilTube/the hail-
        guard flange elsewhere in this file) plus a small crimped end
        cap where the clamshell halves are seamed shut sell the actual
        3D tube shape instead of a painted line. */}
    {Array.from({length:6},(_,i)=>{
      const gy=y+10+i*(h-18)/6;
      const d=`M${mid+6} ${gy+6} Q${mid+w*0.17} ${gy-2} ${mid+w*0.31} ${gy+7} Q${mid+w*0.41} ${gy+14} ${mid+w*0.31} ${gy+18}`;
      return <g key={i}>
        <path d={d} fill="none" stroke={active?'rgba(249,115,22,.6)':'rgba(108,44,8,.22)'} strokeWidth="2.8" strokeLinecap="round"/>
        <path d={d} fill="none" stroke={active?'rgba(255,205,150,.45)':'rgba(180,140,90,.14)'} strokeWidth="0.8" strokeLinecap="round" transform="translate(0,-0.9)"/>
        <circle cx={mid+6} cy={gy+6} r="1.7" fill={active?'rgba(249,115,22,.55)':'rgba(80,40,10,.4)'} stroke={active?'rgba(255,205,150,.4)':'rgba(150,100,60,.25)'} strokeWidth="0.4"/>
        <circle cx={mid+w*0.31} cy={gy+18} r="1.7" fill={active?'rgba(249,115,22,.55)':'rgba(80,40,10,.4)'} stroke={active?'rgba(255,205,150,.4)':'rgba(150,100,60,.25)'} strokeWidth="0.4"/>
      </g>;
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
    <text x={mid+w*0.25} y={y+h-4} textAnchor="middle" fill={active?'rgba(249,115,22,.75)':(S+'.6)')} fontSize="13" fontFamily="monospace">{CT('HEAT EXCH.',lang)}</text>
    <HoverInfo x={mid} y={y} w={w/2} h={h} vw={vw} vh={vh}
      title={partInfo('heat_exchanger',lang).title} text={partInfo('heat_exchanger',lang).text}
      onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
    {(()=>{
      const pW=is90?5:7;
      const pC=is90?"#bfdbfe":"#c0c0c0";
      const pS=is90?"#93c5fd":"#999";
      const fX=mid+Math.round(w*0.2); // flue exit X - right half of furnace
      const pipeTop=roofY-12; // pokes ~12px above the actual roof surface, not up into the sky
      // Purely decorative (no hover/click of its own) - wrapped in
      // pointer-events:none so its opaque pipe/cap rects never swallow a
      // hover zone that happens to sit underneath (the same "wide
      // decorative shape painted on top of a HoverInfo zone silently
      // blocks it" bug already fixed for the airflow/pulse animation
      // classes in styles.css, found again here during a QA pass -
      // fixed defensively even though this specific vertical run, unlike
      // the closet layout's routed flue below, doesn't currently cross
      // any other hover zone).
      const flueD=`M${fX} ${y} L${fX} ${pipeTop}`;
      return <>
        <g style={{pointerEvents:'none'}}>
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
            fill={is90?"rgba(147,197,253,.5)":"rgba(148,148,148,.44)"} fontSize="11.5" fontFamily="monospace">{is90?CT('PVC',lang):CT('B-VENT',lang)}</text>
        </g>
        {/* Flue hover - this run doesn't cross any other hover zone (see
            this block's own comment above), so it's safe to hit-test the
            whole pipe, unlike the closet layout's routed equivalent. */}
        <HoverInfo x={fX-pW/2-4} y={pipeTop-2} w={pW+8} h={Math.max(0,y-pipeTop)+4} rx={2}
          vw={vw} vh={vh} title={partInfo('flue_pipe',lang).title} text={partInfo('flue_pipe',lang).text}
          ringPath={flueD} ringStrokeWidth={pW+6}/>
      </>;
    })()}
    {isComm&&<><rect x={x+4} y={y+10} width={82} height="11" rx="2" fill="url(#blue)"/><text x={x+7} y={y+18.5} fill="#fff" fontSize="9.5" fontFamily="monospace">{CT('COMMUNICATING',lang)}</text></>}
    <rect x={mid+4} y={y+11} width={36} height="8" rx="2" fill={is90?"rgba(35,137,224,.13)":(G+'.07)')} stroke={is90?(B+'.24)'):(G+'.16)')} strokeWidth="0.5"/>
    <text x={mid+22} y={y+18} textAnchor="middle" fill={is90?"#5ba8f5":(G+'.6)')} fontSize="11" fontFamily="monospace">{is90?'90%':'80%'} AFUE</text>
    <HoverInfo x={mid+2} y={y+9} w={40} h={12} rx={2} vw={vw} vh={vh}
      title={partInfo('afue_badge',lang).title} text={partInfo('afue_badge',lang).text}
      onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
  </g>;
}

// CapFan -- side-perspective view into condenser top cap.
// Fan blades contained by keeping radii tight -- no clipPath needed.
//
// Module-scope for the same reason as BlowerWheel/CondenserFan above -
// this fan spins via the same CSS `.spin` class (fed-min/high-eff
// condensers' own top-cap fan), so it had the same confirmed rotation-
// reset stutter on every hoverPart change while it was still a Canvas-
// local closure.
function CapFan({x,y,w,h,active,bladeColor,slatFill,slatCount,ringColor,onEditStep,lang,vw,vh}){
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
    {/* Fed-min/high-eff condenser's own top-cap fan - CondenserFan's own
        hover above covers the mid-tier's front-discharge fan instead.
        Sits inside the cond_tier EditZone box, same onClick-forwarding
        reasoning as BlowerWheel's own hover. */}
    <HoverInfo x={x} y={y} w={w} h={h} rx={4} vw={vw} vh={vh}
      title={partInfo('condenser_fan',lang).title} text={partInfo('condenser_fan',lang).text}
      onClick={onEditStep?()=>onEditStep('cond_tier'):undefined}/>
  </>;
}

// Condenser -- three distinct tiers.
//
// Module-scope for the same reason as CapFan/CondenserFan above - the
// service-panel VS indicator dot uses `.glow-pulse` and, via CapFan/
// CondenserFan, the fan itself spins via `.spin`, so this had the same
// confirmed animation-reset stutter every hoverPart change. condC/
// refReversed/line1C/line2C (all wizard-derived) and fanFast (the
// mid-tier fan's speed, precomputed by the caller from heatMode/
// isMildHp - both Canvas-only state) come in as explicit props instead
// of Canvas closures, same convention as everywhere else in this file
// that made this move.
function Condenser({x,y,w,h,active,tierKey,condC,refReversed,line1C,line2C,fanSpeedMode,onEditStep,lang,vw,vh}){
  const isMini=tierKey==='mid_ge15';
  const isBig=tierKey==='high_ge18';
  const isFed=tierKey==='fedmin';
  const cc=active?condC:(refReversed?'rgba(18,18,55,.5)':'rgba(55,18,18,.5)');

  return <g>
    {/* General "what is this" cabinet hover - painted FIRST/bottommost
        in this <g> on purpose, so the more specific fan/compressor/SEER
        hovers added below (each painted later, i.e. on top) win hover
        priority over their own smaller areas, leaving this one covering
        just the rest of the box. Same onClick-forwarding reasoning as
        every other hover nested inside an existing EditZone box - this
        is the exact box cond_tier's own EditZone already covers. */}
    <HoverInfo x={x} y={y} w={w} h={h} rx={9} vw={vw} vh={vh}
      title={partInfo('condenser_cabinet',lang).title} text={partInfo('condenser_cabinet',lang).text}
      onClick={onEditStep?()=>onEditStep('cond_tier'):undefined}/>
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
            slatCount={Math.max(3,Math.floor((capH-2)*0.7/6.5))}
            onEditStep={onEditStep} lang={lang} vw={vw} vh={vh}/>
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
          {/* y+h-22 instead of cY+cH+domeH+10, which always lands domeH
              px below the cabinet's own bottom edge (cY+cH already
              equals y+h-10) - that pushed this label out of the housing
              entirely, where it overlapped the outside-zone's "CONCRETE
              PAD"/"GROUND LEVEL" text underneath it. */}
          <text x={cX+cW/2} y={y+h-22} textAnchor="middle"
            fill={active?'rgba(180,80,80,.6)':"rgba(80,85,95,.45)"} fontSize="11" fontFamily="monospace">{CT('COMP.',lang)}</text>
          <HoverInfo x={cX-6} y={cY-6} w={cW+12} h={cH+domeH+12} rx={3}
            vw={vw} vh={vh} title={partInfo('compressor',lang).title} text={partInfo('compressor',lang).text}
            onClick={onEditStep?()=>onEditStep('cond_tier'):undefined} highlight/>
        </g>;
      })()}
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
      <rect className="phase-color" x={x} y={y} width={w} height={h} rx={6}
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
        // Sized to read as close as possible to the fed-min cap's fan
        // circle (CapFan's fanRx), which the user specifically liked -
        // maxed out against this cabinet's available front-face height
        // (the tight dimension here), the largest this can go without
        // the outer glow rim clipping the fan-area box edges.
        const fR=Math.round(Math.min(fanAreaW,fanAreaH)*0.41);
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
          {/* Real condenser fans ramp up with load - full speed at 95°
              (cool, full compressor load against the biggest indoor/
              outdoor delta this diagram shows), a noticeably slower
              modulated speed at 60° (mild heat-pump load - the compressor
              is running, just not hard), and stopped at 32° (either the
              compressor is standby in dual-fuel furnace mode, or running
              its slower low-ambient stage with the fan not shown spinning
              here). Per direct feedback that cool and heat-pump mode read
              as the same speed - they used to share one "fast" duration -
              fanSpeedMode now picks a genuinely different RPM for each. */}
          <CondenserFan cx={fCX} cy={fCY} r={fR} active={active} speedMode={fanSpeedMode}
            onEditStep={onEditStep} lang={lang} vw={vw} vh={vh}/>
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
        // Same badge formula fed-min/high-eff use (a fraction of the
        // whole cabinet's shorter side), not a fraction of this narrow
        // side panel - the old panelW*0.34 badge read noticeably
        // bigger/more prominent than the other two tiers' medallion.
        const br=Math.round(Math.min(w,h)*0.09);
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
      {/* Compressor hover - this tier's front-discharge cabinet is
          sealed (no visible compressor dome the way fed-min/high-eff's
          top-discharge unibody exposes one), but a real one still sits
          inside, behind the service-access panel just rendered above -
          recomputing that same panelX/panelW/panelY/panelH here rather
          than threading it out of that IIFE, same convention used
          throughout this file. */}
      {(()=>{
        const panelX=x+Math.round(w*0.7);
        const panelW=w-Math.round(w*0.7)-2;
        const panelY=y+Math.round(h*0.1)+4;
        const panelH=h-Math.round(h*0.1)-8;
        return <HoverInfo x={panelX-4} y={panelY-4} w={panelW+8} h={panelH+8} rx={4}
          vw={vw} vh={vh} title={partInfo('compressor',lang).title} text={partInfo('compressor',lang).text}
          onClick={onEditStep?()=>onEditStep('cond_tier'):undefined} highlight/>;
      })()}
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
      <rect className="phase-color" x={x} y={y} width={w} height={h} rx={10}
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
            slatCount={Math.max(9,Math.floor((capH-4)*0.72/2.6))}
            onEditStep={onEditStep} lang={lang} vw={vw} vh={vh}/>
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
      {/* Faint active-state tint - see FurnaceH's own comment on the
          identical pattern for why this needs pointer-events:none (found
          swallowing the general condenser_cabinet hover across this
          whole tier's box whenever active, via a wizard-step sweep). */}
      {active&&<rect className="phase-color" x={x} y={y} width={w} height={h} rx={10}
        fill={refReversed?"rgba(35,137,224,.04)":"rgba(239,68,68,.03)"} stroke="none" style={{pointerEvents:'none'}}/>}
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
          {/* y+h-22 -- see the fed-min compressor label's own note on
              why the unclamped cY+cH+domeH+10 offset always falls domeH
              px below the cabinet's own bottom edge. */}
          <text x={cX+cW/2} y={y+h-22} textAnchor="middle"
            fill={active?cc:"rgba(80,85,95,.45)"} fontSize="11" fontFamily="monospace">{CT('COMP.',lang)}</text>
          <HoverInfo x={cX-6} y={cY-6} w={cW+12} h={cH+domeH+12} rx={3}
            vw={vw} vh={vh} title={partInfo('compressor',lang).title} text={partInfo('compressor',lang).text}
            onClick={onEditStep?()=>onEditStep('cond_tier'):undefined} highlight/>
        </g>;
      })()}
    </>}
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
//
// Module-scope, not nested inside Canvas like AirHandlerH (which calls
// it) used to be - see that component's own module comment for why.
// This one has zero closure dependencies beyond its own params (S is
// already module-scope), so it was always trivially hoistable; it only
// stayed nested because its one caller did.
function AuxHeatKit({x,y,w,h,auxHeat,segCount,lang}){
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
      fill={auxHeat?"rgba(249,115,22,.78)":(S+'.6)')} fontSize={Math.min(12,h*0.22)} fontFamily="monospace">{CT('AUX HEAT KIT',lang)}</text>
  </g>;
}

// Air handler horizontal - blower LEFT | A-coil RIGHT.
//
// Module-scope - this had the exact same remount bug FurnaceH/BlowerWheel/
// ACoilH/ACoilV/Condenser/CondenserFan were already fixed for (see
// FurnaceH's own module comment above for the full diagnosis), just missed
// in that pass because it's only used on air-handler builds (no furnace) -
// defined fresh inside Canvas on every render, so every hoverPart change
// unmounted and remounted this whole cabinet, resetting BlowerWheel's
// `.spin`, the A-coil's evap glow-pulse/CoilSweat animations, and (when
// auxHeat is on) AuxHeatKit's own glow-pulse - the identical stutter, just
// on the air-handler cabinet instead of the furnace one. evapC/evapC2/
// hasUV/blowerActive/blowerMotorLabel/refReversed and the resolved A-coil
// info-key come in as explicit props instead of Canvas closures, same
// convention as FurnaceH.
function AirHandlerH({x,y,w,h,active,auxHeat,evapC,evapC2,hasUV,acoilInfoKey,blowerActive,blowerMotorLabel,refReversed,onEditStep,lang,vw,vh}){
  const coilW=w*0.50, blowerW=w*0.35, auxW=w*0.15;
  const c1=x+coilW, c2=x+coilW+blowerW;
  return <g>
    {/* General cabinet hover - painted first/bottommost, same reasoning
        as FurnaceH's own. ACoilH/BlowerWheel each add their own more
        specific hover internally, which (painted later, on top of this)
        wins their own smaller sub-areas. */}
    <HoverInfo x={x} y={y} w={w} h={h} rx={4} vw={vw} vh={vh}
      title={partInfo('air_handler_cabinet',lang).title} text={partInfo('air_handler_cabinet',lang).text}
      onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
    {/* Exterior housing stays silver in both states - see the comment on
        FurnaceH's own border/strip above. The internal coil tubes
        (ACoilH, embedded below) still color by evapC exactly as
        before - only the housing exterior stopped switching color. */}
    <rect x={x} y={y} width={w} height={h} rx="4"
      fill={active?"#050c1a":"#090909"}
      stroke="url(#cabinet-edge)" strokeOpacity="0.8" strokeWidth="1.5"/>
    {/* Faint active-state tint - see FurnaceH's own comment on the
        identical pattern for why this needs pointer-events:none (found
        swallowing the general air_handler_cabinet hover across this
        whole box whenever active, via a wizard-step sweep). */}
    {active&&<rect className="phase-color" x={x} y={y} width={w} height={h} rx="4" fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none" style={{pointerEvents:'none'}}/>}
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
    <ACoilH x={x+9} y={y+12} w={coilW-19} h={h-22} active={active}
      evapC={evapC} evapC2={evapC2} hasUV={hasUV} infoKey={acoilInfoKey}
      onEditStep={onEditStep} lang={lang} vw={vw} vh={vh}/>
    <text x={x+coilW/2} y={y+h-4} textAnchor="middle" fill={active?evapC:(S+'.6)')} fontSize="13" fontFamily="monospace">{CT('A-COIL',lang)}</text>
    <BlowerWheel cx={c1+blowerW/2} cy={y+h*0.42} r={Math.min(blowerW*0.32,h*0.29)}
      spd={blowerActive?1.5:0.45} active={blowerActive}
      onEditStep={onEditStep} lang={lang} vw={vw} vh={vh}/>
    <text x={c1+blowerW/2} y={y+h-13} textAnchor="middle" fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">{CT('BLOWER',lang)}</text>
    <text x={c1+blowerW/2} y={y+h-4} textAnchor="middle" fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{blowerMotorLabel}</text>
    {/* Literally the same AuxHeatKit artwork the closet layout uses
        below (just called with this column's own width/height, since
        the strip is proportional, not fixed-size) - wrapped in a
        90-degree rotation instead of a hand-rebuilt layout, so this
        column shows the exact same bordered-strip-of-elements design
        the closet does, just turned to fit a column that's tall
        instead of wide. See the AuxHeatKit comment for the rotation
        math this translate+rotate pair relies on. */}
    <g transform={`translate(${c2+3} ${y+8+(h-14)}) rotate(-90)`}>
      <AuxHeatKit x={0} y={0} w={h-14} h={auxW-6} auxHeat={auxHeat} lang={lang}/>
    </g>
    <rect x={x} y={y+h} width={w} height={6} rx="1" fill="#08121e" stroke={B+'.18)'} strokeWidth="0.7"/>
  </g>;
}

// Ionizer - bulb sits OUTSIDE on top of plenum, rod penetrates DOWN into
// airstream. bulbX/bulbY = center of the bulb (outside, above plenum top);
// rodLen = how far the rod extends down inside the plenum.
//
// Module-scope, not nested inside Canvas like it used to be: this remount
// bug was worse than most of the others fixed above (see FurnaceH's own
// module comment) because the outer <g> carries className="fadein" - a
// one-shot .3s entrance pop (see .fadein in styles.css) that's supposed to
// play once when the ionizer add-on first appears, not replay on every
// hoverPart change elsewhere in the diagram. Nested, it was doing exactly
// that: a fresh component identity every Canvas render meant a fresh DOM
// node, so the ionizer visibly flickered (opacity dropping then rising
// again) on nearly every mouse movement over the diagram whenever the
// ionizer add-on was selected - the same "jump" bug EditZone's own .snap
// entrance was flagged for, just on a different add-on. Zero closure
// dependencies beyond its own params, so this was always trivially
// hoistable; it only stayed nested because nothing had audited it yet.
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
      fill="rgba(253,224,71,.48)" fontSize="11" fontFamily="monospace">{CT('IONIZER',lang)}</text>
  </g>;
}

// ── DUCTWORK DETAIL KIT ─────────────────────────────────────
// Shared by both the attic-horizontal layout's supply-duct drops and the
// closet-upflow layout's own (visually near-identical, but independently-
// coded) supply drops further down, so both read as the same real
// material instead of two different flat gray boxes that happen to be
// labeled the same. Module-scope, zero closure dependencies beyond their
// own params (same reasoning as the cabinet/coil detail kits above) - only
// stayed nested because nothing had audited them yet; none of these carry
// their own animation, so the remount bug cost perf here, not a visible
// glitch, but there's no reason to leave them unstable either.

// Corrugated flex-duct jacket - the register drops off a rigid supply
// plenum are field-run in insulated flex duct almost universally (a
// helically-wound wire core under a silver vinyl vapor jacket), which
// reads as an alternating light/dark ring pattern down the run - not
// the flat solid-fill rectangle this used to be, indistinguishable
// from a rigid metal duct. Works for either a vertical run (rings
// horizontal) or a horizontal run (rings vertical) off the same x/y/w/h
// box a plain <rect> duct segment already used.
function DuctRibbing({x,y,w,h,vertical}){
  vertical=vertical!==false;
  const span=vertical?h:w;
  const spacing=5.5;
  const n=Math.max(1,Math.floor(span/spacing));
  return <g opacity="0.6">
    {Array.from({length:n},(_,i)=>{
      const pos=(i+0.5)*spacing;
      return vertical
        ?<line key={i} x1={x+0.5} y1={y+pos} x2={x+w-0.5} y2={y+pos}
          stroke={i%2===0?"rgba(225,230,238,.28)":"rgba(0,0,0,.32)"} strokeWidth="1"/>
        :<line key={i} x1={x+pos} y1={y+0.5} x2={x+pos} y2={y+h-0.5}
          stroke={i%2===0?"rgba(225,230,238,.28)":"rgba(0,0,0,.32)"} strokeWidth="1"/>;
    })}
    {/* Long highlight seam down one side - the jacket's own sheen
        catching light along its length, breaking up the ring pattern
        so it still reads as one continuous tube rather than a stack of
        washers. */}
    {vertical
      ?<line x1={x+w*0.22} y1={y+1} x2={x+w*0.22} y2={y+h-1} stroke="rgba(255,255,255,.14)" strokeWidth="1"/>
      :<line x1={x+1} y1={y+h*0.22} x2={x+w-1} y2={y+h*0.22} stroke="rgba(255,255,255,.14)" strokeWidth="1"/>}
  </g>;
}

// Same ring texture as DuctRibbing, but for a duct segment that isn't
// axis-aligned (the 45°-elbow drop's diagonal leg) - ticks are laid
// out along the segment's own direction instead of assuming
// horizontal/vertical.
function DuctRibbingPath({x1,y1,x2,y2,width}){
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
  const ux=dx/len, uy=dy/len, px=-uy, py=ux;
  const spacing=5.5;
  const n=Math.max(1,Math.floor(len/spacing));
  return <g opacity="0.6">
    {Array.from({length:n},(_,i)=>{
      const t=(i+0.5)*spacing;
      const cx=x1+ux*t, cy=y1+uy*t;
      return <line key={i} x1={cx-px*width/2} y1={cy-py*width/2} x2={cx+px*width/2} y2={cy+py*width/2}
        stroke={i%2===0?"rgba(225,230,238,.26)":"rgba(0,0,0,.3)"} strokeWidth="1"/>;
    })}
  </g>;
}

// Clamp collar - a metal draw-band cinching the flex jacket onto a
// sheet-metal starter collar/boot, the connection detail every flex-
// duct run actually has at both ends instead of the jacket just
// stopping in mid-air.
function DuctClamp({x,y,w,h,vertical}){
  vertical=vertical!==false;
  return vertical
    ?<rect x={x-1} y={y} width={w+2} height="3.5" rx="1" fill="rgba(180,184,192,.55)" stroke="rgba(20,20,24,.5)" strokeWidth="0.5"/>
    :<rect x={x} y={y-1} width="3.5" height={h+2} rx="1" fill="rgba(180,184,192,.55)" stroke="rgba(20,20,24,.5)" strokeWidth="0.5"/>;
}

// Supply-plenum interior surface treatment, shared by both layouts' own
// (separately-coded, but meant to be visually identical) supply plenum
// boxes - reads as the two materials' actual real finishes: brushed
// galvanized sheet with folded corner flanges for metal, or a foil-
// faced (FSK) board with taped panel seams for ductboard - instead of
// two boxes distinguished only by a caption and a handful of near-
// invisible hairlines.
function PlenumMaterial({x,y,w,h,isMetal}){
  return isMetal
    ?<g>
      {Array.from({length:Math.floor(h/8)},(_,i)=>(
        <line key={i} x1={x+2} y1={y+4+i*8} x2={x+w-2} y2={y+4+i*8} stroke={W+'.05)'} strokeWidth="0.3"/>
      ))}
      {/* Diagonal sheen - a galvanized sheet's mill finish catching
          light unevenly across the panel instead of a flat fill. */}
      <path d={`M${x} ${y+h*0.12} L${x+w} ${y+h*0.5}`} stroke="rgba(255,255,255,.045)" strokeWidth={Math.max(4,h*0.16)} strokeLinecap="round"/>
      {/* Folded S-cleat corner flanges - the real sheet-metal joint
          every rigid plenum-to-duct transition uses, plus the rivets
          that hold it. */}
      {[[x+7,y+5],[x+w-7,y+5],[x+7,y+h-5],[x+w-7,y+h-5]].map(([px,py],i)=>(
        <path key={i} d={`M${px-5} ${py} L${px+5} ${py} L${px+5} ${py+(i<2?3:-3)}`}
          fill="none" stroke="rgba(210,214,222,.28)" strokeWidth="1"/>
      ))}
    </g>
    :<g>
      {/* Faint fiber striations (very low-density board weave). */}
      {Array.from({length:Math.floor(h/10)},(_,i)=>(
        <line key={i} x1={x+3} y1={y+5+i*10} x2={x+w-3} y2={y+5+i*10} stroke={G+'.07)'} strokeWidth="0.6"/>
      ))}
      {/* Foil-faced (FSK) sheen - the metallized facing's soft gloss,
          as two broad diagonal highlight bands. */}
      <path d={`M${x} ${y+h*0.08} L${x+w*0.55} ${y+h*0.68}`} stroke="rgba(224,228,238,.05)" strokeWidth={Math.max(5,h*0.24)} strokeLinecap="round"/>
      <path d={`M${x+w*0.42} ${y+h*0.02} L${x+w} ${y+h*0.46}`} stroke="rgba(224,228,238,.04)" strokeWidth={Math.max(4,h*0.16)} strokeLinecap="round"/>
      {/* Taped panel seams - foil tape strips over each board-to-board
          joint, the way real ductboard sections are actually sealed. */}
      {[x+w*0.32,x+w*0.68].map((sx,i)=>(
        <g key={i}>
          <rect x={sx-4.5} y={y+2} width={9} height={h-4} fill="rgba(210,214,222,.045)" stroke="rgba(210,214,222,.09)" strokeWidth="0.4"/>
          <line x1={sx} y1={y+2} x2={sx} y2={y+h-2} stroke="rgba(190,194,204,.15)" strokeWidth="0.5" strokeDasharray="1.6 1.6"/>
        </g>
      ))}
    </g>;
}

// Ceiling/wall register - a beveled frame with corner screws and
// angled diffuser blades, the way a real stamped-steel supply register
// actually looks up close instead of a flat black slot with a few
// straight slits. Module-scope; lang/vw/vh come in as explicit props
// instead of Canvas closures, same convention as everything else here.
function RegisterGrille({cx,y,w,dc,ds,label,lang,vw,vh}){
  const h=9;
  return <g>
    <rect x={cx-w/2} y={y} width={w} height={h} rx="1.5" fill="rgba(0,0,0,.78)" stroke={dc} strokeWidth="1.2"/>
    {/* Bevel highlight along the top edge - a stamped-steel frame catches
        light along its raised lip. */}
    <line x1={cx-w/2+2} y1={y+1} x2={cx+w/2-2} y2={y+1} stroke="rgba(255,255,255,.16)" strokeWidth="0.6"/>
    {/* Angled diffuser blades instead of plain straight slits - real
        supply registers use fixed slanted louvers to throw air sideways
        rather than a flat grate. */}
    {Array.from({length:5},(_,j)=>{
      const lx=cx-w/2+3+j*(w-6)/4;
      return <line key={j} x1={lx-1.4} y1={y+1.5} x2={lx+1.4} y2={y+h-1.5} stroke={dc} strokeWidth="0.9"/>;
    })}
    {/* Corner screws */}
    <circle cx={cx-w/2+2.2} cy={y+2} r="0.8" fill="rgba(40,42,48,.9)" stroke={ds} strokeWidth="0.35"/>
    <circle cx={cx+w/2-2.2} cy={y+2} r="0.8" fill="rgba(40,42,48,.9)" stroke={ds} strokeWidth="0.35"/>
    {label&&<text x={cx} y={y+h+9} textAnchor="middle" fill={dc} fontSize="11" fontFamily="monospace">{label}</text>}
    {/* No EditZone ever covers duct/register geometry (only the plenum
        box itself does) so this hover never has an existing click to
        preserve - no onClick needed. Only ever used for supply
        registers in this file (attic/closet both), so the copy is
        keyed accordingly regardless of the label prop's exact text.
        group="supply_register" so every register in the build glows
        together on hover, same as group="supply_duct" already does for
        the duct runs feeding them - "these are all the same kind of
        thing" applies here too. */}
    <HoverInfo x={cx-w/2-2} y={y-2} w={w+4} h={h+13} rx={2} vw={vw} vh={vh}
      title={partInfo('supply_register',lang).title} text={partInfo('supply_register',lang).text} group="supply_register"/>
  </g>;
}

// Dehu + ERV roof boxes - shared between attic and closet layouts. Each
// caller computes its own dehuBX/ervBX/BY/roofY (the two layouts anchor
// them off completely different geometry), but the box/pipe/vent
// rendering itself was previously duplicated near-verbatim between the
// two - this is that rendering, parameterized on just the anchor points.
//
// Module-scope, not nested inside Canvas like it used to be: same
// entrance-replay bug as Ionizer above, just via the
// `.snap` bounce-in (see the `snap` prop below) instead of `.fadein` -
// whenever a dehu/ERV box had just been added (snap=true), every
// unrelated hoverPart change elsewhere in the diagram replayed its
// bounce-in pop, the same "jump" EditZone's own `.snap` remount was
// originally flagged for. lang/vw/vh come in as explicit props instead
// of Canvas closures.
function DehuErvBoxes({dehuBX,ervBX,BY,roofY,ervRoofY,ervW,dehuW,hasDehu,hasERV,snap,lang,vw,vh}){
  if(!hasDehu&&!hasERV) return null;
  const BW=80,BH=48;
  const boxes=[];
  if(hasERV) boxes.push('erv');
  if(hasDehu) boxes.push('dehu');
  // Hanging kit -- a rafter bracket up top (small angled flange + two
  // screws standing in for a real joist-hanger bracket, replacing the
  // old flat pin-like rect) with a perforated strap run down to the
  // box, the strap itself shown wrapping over the box's own top lip
  // (a small U) instead of just terminating in mid-air above it. Same
  // hardware for both units, only the color changes. Takes its own
  // roof-attachment height (ry) since the ERV can now sit at a
  // different roofY than the dehu (see ervRoofY below).
  const hangKit=(x,ry,stroke)=>(
    <>
      <path d={`M${x-4.5} ${ry-1} L${x-4.5} ${ry-5.5} L${x+4.5} ${ry-5.5} L${x+4.5} ${ry-1}`}
        fill="none" stroke={stroke} strokeWidth="1.1" strokeLinejoin="round"/>
      <circle cx={x-3.2} cy={ry-5.5} r="0.8" fill={stroke}/>
      <circle cx={x+3.2} cy={ry-5.5} r="0.8" fill={stroke}/>
      <line x1={x} y1={ry-1} x2={x} y2={BY+2} stroke={stroke} strokeWidth="1.3" strokeDasharray="1.2 2.2"/>
      <path d={`M${x-3} ${BY+2} Q${x} ${BY-2} ${x+3} ${BY+2}`} fill="none" stroke={stroke} strokeWidth="1.2"/>
    </>
  );
  return <g>{boxes.map((type,i)=>{
    const BX=type==='dehu'?dehuBX:ervBX;
    const isDehu=type==='dehu';
    // Either box can be narrower than the flat 80 (see ervW's own comment
    // at the attic ERV's call site) when the slot it hangs in is too
    // tight for the full-size box - every position below that used to be a
    // flat BW is now this box's own boxW instead, so a narrowed box still
    // centers its label/arrows/pipes correctly instead of them drifting
    // toward one edge.
    const boxW=isDehu?(dehuW||BW):(ervW||BW);
    const pipe1X=BX+Math.round(boxW*0.28), pipe2X=BX+Math.round(boxW*0.68);
    // Hang-kit anchor X's - straight down the box centerline (0.28/0.72)
    // for the dehu, which has nothing else up there to dodge. The ERV
    // can't reuse that same pair: its own IN/OUT roof stubs already run
    // through very nearly that exact X (pipe1X/pipe2X above, computed off
    // the same 0.28/0.68 split), so hanging the bracket+strap there landed
    // it stacked right on top of the pipe cap/arrowhead and "IN"/"OUT"
    // labels - a strap that's supposed to read as separate mounting
    // hardware instead read as noise fused into the ductwork art. Flanking
    // the box's outer thirds (0.08/0.92) keeps both brackets clear of
    // both pipes with room to spare, while still landing on the box's own
    // top lip like the dehu's pair does. Off boxW (not a flat BW) so this
    // still holds when the ERV has been narrowed to fit a tight wall slot.
    const r1X=isDehu?BX+boxW*0.28:BX+boxW*0.08, r2X=isDehu?BX+boxW*0.72:BX+boxW*0.92;
    // ERV defaults to the same shared roofY as the dehu (closet call
    // site never passes ervRoofY, and there the two boxes are far
    // enough apart that a shared flat roofline reads fine) - the attic
    // call site passes a real per-X roofY(ervCenterX) instead, since
    // the ERV now hangs right where the rerouted refrigerant lineset's
    // own roofline run passes overhead and needs its own clearance
    // below it.
    const ry=isDehu?roofY:(ervRoofY!=null?ervRoofY:roofY);
    return <g key={type} className={snap?"snap":undefined} style={snap?{animationDelay:(0.32+i*0.05)+'s'}:undefined}>
      {isDehu
        ?<>
          {hangKit(r1X,ry,"#22c55e")}
          {hangKit(r2X,ry,"#22c55e")}
        </>
        :<>
          {/* ERV -- blue IN + orange OUT through roof. Pipes stop right
              at the roofline (ry), not the literal top of the canvas. */}
          <rect x={pipe1X-2} y={ry} width={5} height={Math.max(0,BY-ry)} rx="1" fill={B+'.3)'} stroke={B+'.5)'} strokeWidth="0.8"/>
          <rect x={pipe1X-5} y={ry-4} width="11" height={5} rx="1" fill={B+'.35)'} stroke={B+'.55)'} strokeWidth="0.8"/>
          <text x={pipe1X} y={ry-6} textAnchor="middle" fill={B+'.6)'} fontSize="12" fontFamily="monospace">{CT('IN',lang)}</text>
          <rect x={pipe2X-2} y={ry} width={5} height={Math.max(0,BY-ry)} rx="1" fill="rgba(249,115,22,.3)" stroke="rgba(249,115,22,.5)" strokeWidth="0.8"/>
          <path d={'M'+(pipe2X-4)+' '+(ry-2)+' L'+pipe2X+' '+(ry-9)+' L'+(pipe2X+4)+' '+(ry-2)} fill="rgba(249,115,22,.4)"/>
          <text x={pipe2X} y={ry-11} textAnchor="middle" fill="rgba(249,115,22,.6)" fontSize="12" fontFamily="monospace">{CT('OUT',lang)}</text>
          {hangKit(r1X,ry,G+'.55)')}
          {hangKit(r2X,ry,G+'.55)')}
        </>
      }
      <rect x={BX} y={BY} width={boxW} height={BH} rx="4"
        fill={isDehu?"#05120a":"#0a0a06"}
        stroke={isDehu?"#22c55e":(G+'.55)')} strokeWidth="1.4"/>
      <rect x={BX} y={BY} width={boxW} height={7} rx="4"
        fill={isDehu?"rgba(34,197,94,.3)":(G+'.25)')} stroke="none"/>
      {isDehu
        // QA FIX - droplet moved from stacked ABOVE "DEHU" to sitting to
        // its RIGHT, one row, per direct feedback (matches the
        // DehumidistatWall's own droplet-and-reading layout change above).
        ?<>
          <text x={BX+boxW/2-13} y={BY+BH/2+5} textAnchor="middle" fill="#22c55e" fontSize="14" fontFamily="monospace">{CT('DEHU',lang)}</text>
          <text x={BX+boxW/2+17} y={BY+BH/2+6} textAnchor="middle" fill="#22c55e" fontSize="15.5">💧</text>
        </>
        :<>
          <path d={'M'+(BX+8)+' '+(BY+BH*0.44)+' L'+(BX+boxW*0.52)+' '+(BY+BH*0.44)} fill="none" stroke={B+'.65)'} strokeWidth="1.6" markerEnd="url(#arr)"/>
          <path d={'M'+(BX+boxW-8)+' '+(BY+BH*0.64)+' L'+(BX+boxW*0.48)+' '+(BY+BH*0.64)} fill="none" stroke="rgba(249,115,22,.65)" strokeWidth="1.6" markerEnd="url(#arr)"/>
          <text x={BX+boxW/2} y={BY+BH*0.3} textAnchor="middle" fill={G+'.78)'} fontSize={boxW<70?"12.5":"14.5"} fontFamily="monospace">{CT('ERV',lang)}</text>
        </>
      }
      {/* No EditZone ever covers dehu/erv (StepFocusRing during the
          wizard is the only existing overlay here) - free-standing
          hover, no onClick. */}
      <HoverInfo x={BX} y={BY} w={boxW} h={BH} rx={4} vw={vw} vh={vh}
        title={partInfo(isDehu?'dehu_box':'erv_box',lang).title} text={partInfo(isDehu?'dehu_box':'erv_box',lang).text}/>
    </g>;
  })}</g>;
}

// Static gradient/filter/marker defs - zero closure dependencies (never
// derived from wizard state), so - like the color-palette consts above -
// there was never a reason for this to be redeclared, and its whole
// <defs> subtree rebuilt, on every single Canvas render. Module-scope.
// QA FIX - used to be rendered fresh inside EACH mounted <svg> (once per
// Canvas instance - the wizard's own preview canvas stays mounted,
// display:none, even after reaching the done screen, so up to 3 copies of
// this same <defs> block, all reusing the exact same hardcoded ids like
// "cabinet-edge"/"gold"/"silver", could exist in the document at once).
// SVG's own url(#id) lookup is document-wide, not scoped to the local
// <svg>, so that was harmless on screen - but under print, Chromium
// resolves url(#cabinet-edge) to whichever copy of that id happens to sit
// first in the DOM, and a gradient defined inside a display:none subtree
// isn't available to paint with - which is exactly why the furnace/A-coil
// cabinet (the one thing here using a gradient stroke, not a flat fill)
// printed as an empty gap while everything else with a plain solid fill
// printed fine. Now exported and rendered exactly ONCE, from a small
// always-mounted (never display:none) SVG at the app root - every other
// <svg> in the app still resolves url(#gold) etc. against that one shared
// copy, the same way a browser's own icon-sprite <symbol> defs work.
export const Defs=()=><defs>
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

// Builds the thermostat's own mode-button row to match however many modes
// the "preview how your system runs" panel (ToggleUI) offers THIS system -
// 3 for anything with its own separate heat-pump/backup-heat sub-mode
// (dual fuel's HEAT PUMP+FURNACE, or a heat-pump-only air handler's HEAT
// PUMP+AUX HEAT), 2 for a plain straight-cool furnace (COOL/HEAT only).
// Mirrors ToggleUI's own isDualFuel/!hasFurnace branching exactly so the
// two never fall out of sync again. Labels stay short (HP/AUX, not the
// panel's full "HEAT PUMP"/"AUX HEAT") since these paint at a fraction of
// the panel's size.
function thermModes(isDualFuel,hasFurnace,heatMode,heatSubMode,setHeatMode,setHeatSubMode){
  const cool={key:'cool',label:'COOL',active:!heatMode,color:'#5ba8f5',onClick:()=>setHeatMode(false)};
  if(isDualFuel)return[cool,
    {key:'hp',label:'HP',active:heatMode&&heatSubMode==='hp',color:'#f97316',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
    {key:'furnace',label:'FURN',active:heatMode&&heatSubMode==='furnace',color:'#f97316',onClick:()=>{setHeatMode(true);setHeatSubMode('furnace');}}];
  if(!hasFurnace)return[cool,
    {key:'hp',label:'HP',active:heatMode&&heatSubMode==='hp',color:'#f97316',onClick:()=>{setHeatMode(true);setHeatSubMode('hp');}},
    {key:'aux',label:'AUX',active:heatMode&&heatSubMode==='aux',color:'#f97316',onClick:()=>{setHeatMode(true);setHeatSubMode('aux');}}];
  return[cool,{key:'heat',label:'HEAT',active:heatMode,color:'#f97316',onClick:()=>setHeatMode(true)}];
}

// COOL/HEAT(/HP/AUX) switch painted directly on the thermostat face in
// both layouts, wired to the exact same heatMode/heatSubMode state as
// ToggleUI - same colors/behavior, just reachable right at the thermostat
// too so flipping it and watching the rest of the diagram react doesn't
// require hunting for the panel. Module-scope, not nested inside Canvas
// like it used to be (same remount-churn reasoning as everything else
// here). `modes` is thermModes()'s own output; the row is centered on cx
// and spans totalW total (individual button width = (totalW-gap*(n-1))/n)
// so callers can grow the row for a 3rd button without touching the
// thermostat face's own hardcoded coordinates.
function ThermModeButtons({modes,cx,y,totalW,gap,h,fontSize,lang}){
  const n=modes.length;
  const bw=(totalW-gap*(n-1))/n;
  const startX=cx-totalW/2;
  return <g className="therm-mode-btns">
    {modes.map((m,i)=>{
      const bx=startX+i*(bw+gap);
      return <React.Fragment key={m.key}>
        <rect className={`therm-btn therm-btn-${m.key}${m.active?' active':''} phase-color`}
          x={bx} y={y} width={bw} height={h} rx={h/2}
          fill={m.active?(m.key==='cool'?'rgba(35,137,224,.22)':'rgba(249,115,22,.22)'):'rgba(255,255,255,.05)'}
          stroke={m.active?m.color:'rgba(255,255,255,.2)'} strokeWidth="1"
          style={{cursor:'pointer'}} onClick={m.onClick}/>
        <text className="phase-color" x={bx+bw/2} y={y+h/2} textAnchor="middle" dominantBaseline="central"
          fontFamily="monospace" fontWeight="700" fontSize={fontSize}
          fill={m.active?m.color:'rgba(255,255,255,.45)'} style={{pointerEvents:'none'}}>{CT(m.label,lang)}</text>
      </React.Fragment>;
    })}
  </g>;
}

// Shared thermostat face - the SAME local geometry (76-wide face, same
// dial/screen sizing) painted by BOTH layouts, instead of two hand-kept-
// in-sync copies (which had drifted: attic's was a smaller, independently
// -scaled 64-wide design). The attic call site wraps this in its own
// translate+scale <g> for its narrow-margin fallback; the closet call
// site passes its real, always-unscaled TX/TY straight through. Sharing
// one function is what makes "both thermostats the same size, same
// button size, same text size" (direct feedback) actually hold instead
// of being two numbers a future edit can nudge out of sync again.
// Caption text is NOT drawn here - see THERM_CAP_Y/THERM_BTN_Y below for
// why that moved out to its own call-site-painted line under the
// COOL/HEAT row.
function ThermostatFace({TX,TY,isProprietary,isWifi,thermostatTemp,showRange,heatMode,G,B}){
  const tempDisplay=showRange?<>{thermostatTemp-2}°-{thermostatTemp+2}°</>:<>{thermostatTemp}°</>;
  const modeColor=heatMode?"#f97316":"#2389e0";
  return isProprietary
    // PROPRIETARY COMMUNICATING -- edge-to-edge glass touchscreen
    // (Ecobee-style rectangle), deliberately not the round dial used for
    // the Wi-Fi tier below, so it reads as a distinct, more premium
    // control rather than the same thermostat with a different label.
    ?<>
      <rect x={TX} y={TY} width={76} height={68} rx="10" fill="#0a0a0d" stroke={G+'.62)'} strokeWidth="1.6"/>
      <rect x={TX+3} y={TY+3} width={70} height={52} rx="7" fill="#050810" stroke={B+'.3)'} strokeWidth="0.8"/>
      <text x={TX+38} y={TY+35} textAnchor="middle" fill={B+'.95)'} fontSize={showRange?"14.5":"23.5"}
        fontFamily="monospace" filter="url(#glow)">{tempDisplay}</text>
      <text x={TX+38} y={TY+48} textAnchor="middle" fill={B+'.55)'} fontSize="9"
        fontFamily="monospace">{heatMode?'HEAT':'COOL'} · AUTO</text>
      <circle cx={TX+67} cy={TY+11} r={1.9} fill={B+'.55)'}/>
      <rect x={TX+6} y={TY+59} width={64} height="3.5" rx="1.75" fill={modeColor} opacity="0.8"/>
    </>
    :isWifi
    ?<>
      <circle cx={TX+38} cy={TY+38} r={36} fill="#0d0d0d" stroke={G+'.62)'} strokeWidth="1.8"/>
      <circle cx={TX+38} cy={TY+38} r={28} fill="#060e1c" stroke={B+'.42)'} strokeWidth="1.1"/>
      <text x={TX+38} y={TY+43} textAnchor="middle" fill={B+'.92)'} fontSize={showRange?"13":"21"}
        fontFamily="monospace" filter="url(#glow)">{tempDisplay}</text>
      <path d={`M${TX+12} ${TY+38} A26 26 0 0 1 ${TX+64} ${TY+38}`}
        fill="none" stroke={modeColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
      <path d={`M${TX+24} ${TY+62} Q${TX+38} ${TY+53} ${TX+52} ${TY+62}`}
        fill="none" stroke={B+'.5)'} strokeWidth="1.8" strokeLinecap="round"/>
      <path d={`M${TX+28} ${TY+67} Q${TX+38} ${TY+61} ${TX+48} ${TY+67}`}
        fill="none" stroke={B+'.7)'} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx={TX+38} cy={TY+71} r={2.5} fill={B+'.8)'}/>
    </>
    :<>
      <rect x={TX} y={TY} width={76} height={62} rx="3" fill="#0d0d0d" stroke={G+'.55)'} strokeWidth="1.6"/>
      <rect x={TX+5} y={TY+6} width={66} height={34} rx="2" fill="#050d18" stroke={B+'.36)'} strokeWidth="0.9"/>
      <text x={TX+38} y={TY+28} textAnchor="middle" fill={B+'.9)'} fontSize="21"
        fontFamily="monospace" filter="url(#glow)">{thermostatTemp}°</text>
      {[10,24,38,52,66].map((bx,i)=>(
        <rect key={i} x={TX+bx-4} y={TY+46} width="9" height="5" rx="1.5"
          fill={G+'.22)'} stroke={G+'.12)'} strokeWidth="0.4"/>
      ))}
    </>;
}
// Button-row top-y and caption-y, keyed by variant, local to TX=0/TY=0 -
// shared by both layouts so the "caption moved below the COOL/HEAT row"
// fix (direct feedback: the wifi caption used to sit sandwiched between
// the dial and the buttons, the basic caption crammed onto the face
// itself) is one set of numbers, not two. Buttons sit right under each
// variant's own face (whose heights differ - 68/72/62), then the
// caption sits under the buttons (h=17) with a small gap, using the
// spare room the hover/edit box already has below the button row.
const THERM_BTN_Y={proprietary:76,wifi:82,basic:70};
const THERM_CAP_Y={proprietary:107,wifi:113,basic:101};
// Shortened per direct feedback ("rename the thermostats... basic wifi
// and comm for simplicity") - same three variant keys, just terser
// captions. Applies to both layouts since this map is shared.
const THERM_CAP_TEXT={proprietary:'COMM',wifi:'WIFI',basic:'BASIC'};
const THERM_CAP_FILL_A={proprietary:'.45)',wifi:'.45)',basic:'.38)'};
const THERM_CAP_SIZE={proprietary:'11.5',wifi:'11.5',basic:'11'};
function thermVariant(isProprietary,isWifi){return isProprietary?'proprietary':isWifi?'wifi':'basic';}
// Both layouts render their thermostat at this exact same scale. Was
// 0.58 - measured to just fit the attic layout's own left-margin column
// (a Furnace build's own column is ~74 local units wide regardless of
// plenum/tier/heat-type choice, Air Handler's ~80) without touching the
// return plenum beside it. Bumped 50% (0.58->0.87), then another 25% on
// top of that (0.87->1.09) across two rounds of direct feedback -
// legibility wins over that old fit constraint, so this now DOES run
// well past the column's old edge into the return plenum's own open
// left margin; see THERM_SCALE's/THERM_TX's own comments (attic) for
// how that's handled.
const THERM_TARGET_SCALE=1.09;

// ─── CANVAS ─────────────────────────────────────────────────────
export function Canvas({a, stepIdx, activeSteps, onEditStep, lang}){
  // Shorthand for the hover-tooltip copy above, resolved to this render's
  // language once instead of every call site repeating partInfo(key,lang).
  const T=(key)=>partInfo(key,lang);
  // SVG_SCALE/SVG_VW/SVG_VH are set below once each layout branch knows its
  // own VW/VH and the frame's actual measured box (see frameBox) - same
  // "assigned later, read by a closure that only actually runs after this
  // function returns" pattern already used for G/B/W/O just below. Only one
  // of the two layout branches ever runs per call, so by the time anything
  // downstream (HoverInfo's vw/vh, EditZone's svgScale/vw/vh, both module-
  // scope and passed these explicitly) actually reads them, they hold that
  // branch's real numbers. EditZone itself moved to module scope (see its
  // own comment there for why) - this file's own EditZone now refers to
  // that one, not a Canvas-local closure.
  let SVG_SCALE=1, SVG_VW=0, SVG_VH=0;
  // ── DONE-SCREEN SUB-PART HOVERS ─────────────────────────────
  // Passed as EditZone's own `children` (see its comment above for why) at
  // the indoor_type/cond_tier call sites in both layout branches, so the
  // furnace/blower/heat-exchanger/AFUE/A-coil and condenser fan/compressor/
  // SEER hovers still work once the done screen's own EditZone exists on
  // top of them - the same boxes BlowerWheel/Condenser/FurnaceH/ACoilH/
  // ACoilV already give their own hover to (which stays the ONLY hover for
  // those sub-parts during the wizard, since EditZone doesn't exist yet
  // there), recomputed here from the same x/y/w/h fractions since those
  // components only expose their geometry as local variables, not a
  // return value a caller here could reuse directly. Every one of these
  // forwards its click to the identical onEditStep('indoor_type'/
  // 'cond_tier') call the enclosing EditZone itself already makes.
  // UV-specific hover, shared by both branches below - reused as-is once
  // the done screen's own EditZone/indoorSubHoversH exists (see this
  // function's own call site comment): that EditZone's A-COIL sub-hover
  // is painted AFTER ACoilH's own internal hovers (this whole function
  // is EditZone's `children`, rendered later in the JSX tree than the
  // A-coil/AirHandlerH block above it), so on the done screen it silently
  // wins back over ACoilH's own UV-specific hover underneath - confirmed
  // via a hover sweep (hovering the UV rod there showed "A-COIL", not
  // "UV LIGHT"). Needs its own entry here, in the same coordinate space
  // ACoilH's caller actually renders it in (x+8/y+12/w-16/h-20 for the
  // furnace branch, x+9/y+12/w-19/h-22 for AirHandlerH's own embedded
  // call - see each one's own call site for those exact offsets).
  const uvHoverH=(cx,cy,cw,ch)=>{
    if(!hasUV)return null;
    const rodLen=Math.min(cw*0.70,cw-12), rodCX=cx+cw*0.48, rodCY=cy+ch/2;
    return <HoverInfo x={rodCX-rodLen/2-4} y={rodCY-6} w={rodLen+8} h={16} rx={3} vw={SVG_VW} vh={SVG_VH}
      title={T('uv_light').title} text={T('uv_light').text}/>;
  };
  const indoorSubHoversH=(hasFurnaceLocal,FURN_X,FURN_W,ACOIL_X,ACOIL_W,AH_X,AH_W,UNIT_Y,UNIT_H)=>{
    const go=()=>onEditStep('indoor_type');
    if(hasFurnaceLocal){
      const mid=FURN_X+FURN_W/2;
      return <>
        <HoverInfo x={FURN_X} y={UNIT_Y} w={FURN_W} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
          title={T('furnace_cabinet').title} text={T('furnace_cabinet').text} onClick={go}/>
        <HoverInfo x={FURN_X} y={UNIT_Y} w={FURN_W*0.44} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
          title={T('blower').title} text={T('blower').text} onClick={go}/>
        <HoverInfo x={mid} y={UNIT_Y} w={FURN_W/2} h={UNIT_H} vw={SVG_VW} vh={SVG_VH}
          title={T('heat_exchanger').title} text={T('heat_exchanger').text} onClick={go}/>
        <HoverInfo x={mid+2} y={UNIT_Y+9} w={40} h={12} rx={2} vw={SVG_VW} vh={SVG_VH}
          title={T('afue_badge').title} text={T('afue_badge').text} onClick={go}/>
        <HoverInfo x={ACOIL_X} y={UNIT_Y} w={ACOIL_W} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
          title={T(acoilInfoKey()).title} text={T(acoilInfoKey()).text} onClick={go}/>
        {uvHoverH(ACOIL_X+8,UNIT_Y+12,ACOIL_W-16,UNIT_H-20)}
      </>;
    }
    return <>
      <HoverInfo x={AH_X} y={UNIT_Y} w={AH_W} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
        title={T('air_handler_cabinet').title} text={T('air_handler_cabinet').text} onClick={go}/>
      <HoverInfo x={AH_X} y={UNIT_Y} w={AH_W*0.5} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
        title={T(acoilInfoKey()).title} text={T(acoilInfoKey()).text} onClick={go}/>
      <HoverInfo x={AH_X+AH_W*0.5} y={UNIT_Y} w={AH_W*0.5} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
        title={T('blower').title} text={T('blower').text} onClick={go}/>
      {uvHoverH(AH_X+9,UNIT_Y+12,AH_W*0.5-19,UNIT_H-22)}
    </>;
  };
  // Closet/vertical equivalent - furnace sits BELOW the A-coil (HX on top
  // half, blower bottom half - see the closet furnace's own inline HX/
  // blower call sites), and a standalone air handler stacks blower/aux on
  // top with the A-coil at the bottom (closest to the return, per that
  // block's own comment) - reversed order from the attic air handler's
  // left-right split, so this can't just reuse indoorSubHoversH.
  // Vertical counterpart of uvHoverH above - same "done screen's own
  // EditZone sub-hover otherwise wins back over ACoilV's own UV hover"
  // reasoning, using ACoilV's own rodCX/rodCY/rodLen formula (vertical
  // rod) instead of ACoilH's horizontal one.
  const uvHoverV=(cx,cy,cw,ch)=>{
    if(!hasUV)return null;
    const rodCX=cx+cw*0.5, rodLen2=Math.min(ch*0.75,ch-12), rodCY=cy+ch/2;
    return <HoverInfo x={rodCX-8} y={rodCY-rodLen2/2-4} w={16} h={rodLen2+8} rx={3} vw={SVG_VW} vh={SVG_VH}
      title={T('uv_light').title} text={T('uv_light').text}/>;
  };
  const indoorSubHoversV=(hasFurnaceLocal,UNIT_X,UNIT_W,ACOIL_Y,ACOIL_H,FURN_Y,FURN_H)=>{
    const go=()=>onEditStep('indoor_type');
    // Mirrors COIL_BOX_Y/COIL_BOX_H's own formula (see that block's own
    // comment) - ACoilV's real position/size differs by hasFurnaceLocal.
    const coilBoxY=hasFurnaceLocal?ACOIL_Y+14:ACOIL_Y+ACOIL_H*0.58;
    const coilBoxH=hasFurnaceLocal?ACOIL_H-28:ACOIL_H*0.38;
    if(hasFurnaceLocal){
      return <>
        <HoverInfo x={UNIT_X} y={ACOIL_Y} w={UNIT_W} h={ACOIL_H} rx={5} vw={SVG_VW} vh={SVG_VH}
          title={T(acoilInfoKey()).title} text={T(acoilInfoKey()).text} onClick={go}/>
        <HoverInfo x={UNIT_X} y={FURN_Y} w={UNIT_W} h={FURN_H} rx={5} vw={SVG_VW} vh={SVG_VH}
          title={T('furnace_cabinet').title} text={T('furnace_cabinet').text} onClick={go}/>
        <HoverInfo x={UNIT_X} y={FURN_Y} w={UNIT_W} h={FURN_H/2} vw={SVG_VW} vh={SVG_VH}
          title={T('heat_exchanger').title} text={T('heat_exchanger').text} onClick={go}/>
        <HoverInfo x={UNIT_X+UNIT_W-48} y={FURN_Y+9} w={44} h={13} rx={2} vw={SVG_VW} vh={SVG_VH}
          title={T('afue_badge').title} text={T('afue_badge').text} onClick={go}/>
        <HoverInfo x={UNIT_X} y={FURN_Y+FURN_H/2} w={UNIT_W} h={FURN_H/2} rx={5} vw={SVG_VW} vh={SVG_VH}
          title={T('blower').title} text={T('blower').text} onClick={go}/>
        {uvHoverV(UNIT_X+8,coilBoxY,UNIT_W-16,coilBoxH)}
      </>;
    }
    return <>
      <HoverInfo x={UNIT_X} y={ACOIL_Y} w={UNIT_W} h={ACOIL_H} rx={5} vw={SVG_VW} vh={SVG_VH}
        title={T('air_handler_cabinet').title} text={T('air_handler_cabinet').text} onClick={go}/>
      <HoverInfo x={UNIT_X} y={ACOIL_Y} w={UNIT_W} h={ACOIL_H*0.5} rx={5} vw={SVG_VW} vh={SVG_VH}
        title={T('blower').title} text={T('blower').text} onClick={go}/>
      <HoverInfo x={UNIT_X} y={ACOIL_Y+ACOIL_H*0.5} w={UNIT_W} h={ACOIL_H*0.5} rx={5} vw={SVG_VW} vh={SVG_VH}
        title={T(acoilInfoKey()).title} text={T(acoilInfoKey()).text} onClick={go}/>
      {uvHoverV(UNIT_X+8,coilBoxY,UNIT_W-16,coilBoxH)}
    </>;
  };
  // Condenser's own fan/compressor/SEER sub-hovers, shared by both layout
  // branches (Condenser itself already is) - mirrors the exact geometry
  // Condenser/CapFan/CondenserFan compute internally for their own
  // (wizard-only-effective, once EditZone exists) hover.
  const condenserSubHovers=(x,y,w,h,tierKey)=>{
    const go=()=>onEditStep('cond_tier');
    const isBig=tierKey==='high_ge18', isMini=tierKey==='mid_ge15';
    const capH=Math.round(h*(isBig?0.24:0.20));
    return <>
      <HoverInfo x={x} y={y} w={w} h={h} rx={9} vw={SVG_VW} vh={SVG_VH}
        title={T('condenser_cabinet').title} text={T('condenser_cabinet').text} onClick={go}/>
      {isMini
        ?(()=>{
          const fanAreaW=Math.round(w*0.68), fanAreaH=h-Math.round(h*0.1)-4, fanAreaY=y+Math.round(h*0.1)+2;
          // Compressor hover - see the mid-tier's own comment inside
          // Condenser itself for why this cabinet has no visible dome to
          // trace: it's behind the service-access panel on the right
          // (~30% of the cabinet width) instead.
          const panelX=x+Math.round(w*0.7), panelW=w-Math.round(w*0.7)-2;
          const panelY=y+Math.round(h*0.1)+4, panelH=h-Math.round(h*0.1)-8;
          return <>
            <HoverInfo x={x} y={fanAreaY} w={fanAreaW} h={fanAreaH} rx={4} vw={SVG_VW} vh={SVG_VH}
              title={T('condenser_fan').title} text={T('condenser_fan').text} onClick={go}/>
            <HoverInfo x={panelX-4} y={panelY-4} w={panelW+8} h={panelH+8} rx={4} vw={SVG_VW} vh={SVG_VH}
              title={T('compressor').title} text={T('compressor').text} onClick={go} highlight/>
          </>;
        })()
        :<>
          <HoverInfo x={x} y={y} w={w} h={capH} rx={4} vw={SVG_VW} vh={SVG_VH}
            title={T('condenser_fan').title} text={T('condenser_fan').text} onClick={go}/>
          {(()=>{
            const cW=Math.round(w*(isBig?0.28:0.3)), cH=Math.round((h-capH)*(isBig?0.45:0.42));
            const cX=x+w-cW-(isBig?8:6), cY=y+capH+(h-capH)-cH-10, domeH=Math.round(cH*0.22);
            return <HoverInfo x={cX-6} y={cY-6} w={cW+12} h={cH+domeH+12} rx={3} vw={SVG_VW} vh={SVG_VH}
              title={T('compressor').title} text={T('compressor').text} onClick={go} highlight/>;
          })()}
        </>}
    </>;
  };
  // Which step the homeowner is looking at RIGHT NOW, regardless of whether
  // it's been answered yet - drives StepFocusRing just below. null once the
  // wizard runs out of steps (stepIdx briefly past the end mid-transition)
  // or before activeSteps exists at all, both defensively.
  const curStepId=activeSteps&&activeSteps[stepIdx]?activeSteps[stepIdx].id:null;
  // "You are here" spotlight - a pulsing ring on whichever real component
  // the CURRENT question is actually about, so the diagram visibly responds
  // to what's being ASKED, not just what's already been answered. Distinct
  // from EditZone above on purpose: EditZone is a done-screen, hover-to-
  // reveal affordance for jumping back into an already-answered step;
  // this is a wizard-only, always-on cue for the step in progress, so the
  // two are never rendered by the same Canvas instance (onEditStep is only
  // ever passed to the done-screen's Canvas - see app.js - so this bails
  // immediately there, same guard style as the "only wizard" comment on
  // Canvas's own props above).
  // Most call sites below reuse the EXACT x/y/w/h a component's own EditZone
  // uses once it exists - the position was already fixed by an earlier
  // answer (which unit slot, which side of the deck line, ...), so there's
  // an honest "here's where it's about to appear" spot to point at even
  // pre-answer. The two steps left uncovered (cond_tier on a first pass,
  // system_for entirely) are the ones where that isn't true: the condenser's
  // whole outside-zone/house split only exists once cond_tier itself is
  // answered (see HOUSE_W's hasCond branch below), so there's no honest
  // "future" position for it until then - a quick-edit REVISIT of cond_tier
  // (the diagram's already built, hasCond already true) still gets a ring,
  // pointing at the real condenser. system_for has no diagram real estate
  // of its own (it only changes how the already-drawn furnace/condenser
  // pair behaves), so it's skipped rather than forcing a ring onto
  // something else's box.
  // StepFocusRing itself now lives at module scope, above Canvas (see its
  // own module comment for why) - every call site below just adds
  // onEditStep/curStepId/svgScale/vw/vh explicitly, same as EditZone.
  // ThermModeButtons now lives at module scope, above Canvas - every call
  // site below just adds heatMode/setHeatMode explicitly.
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
  // mild enough that a heat pump alone (60°F outside) handles it, but
  // Dec/Jan/Feb are genuinely cold (32°F outside) where aux/furnace heat
  // actually kicks in for real, not just as a demo toggle.
  const isDeepWinter=CURRENT_MONTH<=1||CURRENT_MONTH===11; // Dec-Feb
  const [heatMode,setHeatMode]=React.useState(isHeatingSeason);
  // Which hover-info tooltip (if any) is currently showing - see the
  // module comment on HoverCtx/HoverInfo above for why this lives as one
  // piece of shared state instead of each hover zone revealing its own
  // inline panel. null when nothing's hovered.
  const [hoverPart,setHoverPart]=React.useState(null);
  // Registry of every currently-mounted HoverInfo box, keyed by group then
  // by that instance's own id - see GroupCtx's own module comment. Stable
  // register/unregister functions (useCallback, no deps) so each
  // HoverInfo's registration effect only re-runs when ITS OWN box
  // actually changes, not on every Canvas render.
  const [groupBoxes,setGroupBoxes]=React.useState({});
  const registerGroupBox=React.useCallback((group,id,box)=>{
    setGroupBoxes(g=>({...g,[group]:{...(g[group]||{}),[id]:box}}));
  },[]);
  const unregisterGroupBox=React.useCallback((group,id)=>{
    setGroupBoxes(g=>{
      if(!g[group])return g;
      const rest={...g[group]}; delete rest[id];
      return {...g,[group]:rest};
    });
  },[]);
  const groupApi=React.useMemo(()=>({register:registerGroupBox,unregister:unregisterGroupBox}),[registerGroupBox,unregisterGroupBox]);
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
  // G/B/O/W/S (gold/blue/orange/white/silver) now live at module scope,
  // just above - see the comment there for why.

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
  // dehu is the merged "Want to enhance your IAQ?" step now (dehumidifier
  // + ERV, condensate pump dropped entirely) - an array answer, same
  // shape as a.purif, not the old Yes/No string or the old separate
  // a.extras array ERV used to live in.
  const hasDehu=Array.isArray(a.dehu)&&a.dehu.includes('dehu');
  const hasERV=Array.isArray(a.dehu)&&a.dehu.includes('erv');
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
  // A-coil hover copy: which of the four PART_INFO acoil* keys actually
  // describes what this coil is doing right now - see those keys' own
  // comments for why cooling/heat-pump-heating/furnace-heating/aux-
  // lockout each need their own text rather than one description that
  // covers all four. Checked before refReversed's own branch since
  // refReversed only tests !hasFurnace/heatMode - it stays true through
  // a standard heat pump's aux lockout too (the refrigerant loop just
  // isn't running at all right then), which used to leave acoilInfoKey
  // pointing at acoil_heat_reject's "refrigerant reverses through it"
  // copy over a coil the diagram itself draws dim/idle with an "AUX HEAT
  // ONLY" label right next to it.
  const acoilInfoKey=()=>!heatMode?'acoil':hpLockedOut?'acoil_aux_lockout':(refReversed?'acoil_heat_reject':'acoil_heat_idle');
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
  // heat pump performance at 60°F outdoor, straining (aux heat/furnace
  // takeover) at 32°F. Same split for a heat-pump-only air handler as for
  // dual fuel; a straight-cool system (furnace-only heating, no heat pump
  // at all) has no "efficient" state to show, so it always reads 67°.
  const thermostatTemp=!heatMode?(hasDehu?76:74):(((isDualFuel||!hasFurnace)&&heatSubMode==='hp')?68:67);
  // Return-air temp reads as whatever the room currently is (the same
  // thermostatTemp reading above) - supply air runs a real design split
  // off of that, colder in cool mode, warmer in any heat mode. Each split
  // is a genuine industry "normal" figure for that mode, not one number
  // stretched across all three, so this never reads as "wrong" next to
  // an actual post-install reading:
  //  - Cooling: 20F is the textbook AC "20-degree rule" split (healthy
  //    systems commonly run 15-20F; 20 is the standard target/example).
  //  - Heat pump: ~25F is the commonly-cited average heating-mode rise
  //    (lower-grade compressor heat than combustion, per manufacturer/
  //    field data - typical supply air lands in the 85-95F range off a
  //    ~70F return, vs. a furnace's much hotter output below).
  //  - Furnace/aux: gas furnace nameplates commonly spec a 30-70F rise
  //    range, most in the 40-50F band with the "sweet spot" toward the
  //    middle of whatever range a given unit lists - 45F sits solidly
  //    in that normal band, clearly hotter than heat pump output the
  //    way a real system's would be.
  const returnTemp=thermostatTemp;
  const supplySplit=!heatMode?20:(refReversed?25:45);
  const supplyTemp=!heatMode?thermostatTemp-supplySplit:thermostatTemp+supplySplit;

  // Refrigerant colors - physically correct
  const evapC  = refReversed ? '#ef4444' : '#2389e0'; // evap: red=HP heat, blue=cool
  const evapC2 = refReversed ? '#fca5a5' : '#7dd3fc';
  const condC  = (heatMode&&(!hasFurnace||(isDualFuel&&heatSubMode==='hp'))) ? '#2389e0' : '#ef4444';
  const line1C = refReversed ? '#2389e0' : '#ef4444';
  const line2C = refReversed ? '#ef4444' : '#2389e0';

  // Real motor type at the indoor blower differs by tier - this is new
  // information the diagram didn't previously show at all. Federal Minimum
  // pairs with a single/multi-tap ECM (electronically commutated motor,
  // fixed set of speed taps); Mid Efficiency steps up to a true variable-
  // speed motor (ramps continuously to match load/humidity demand); High
  // Efficiency pairs with a modulating variable-speed motor that
  // communicates with the modulating gas valve / inverter compressor for
  // fine-grained staging. Shown as a small subtext line under "BLOWER",
  // the same convention already used for the furnace's AFUE badge.
  const BLOWER_MOTOR=CT({fedmin:'ECM MOTOR',mid_ge15:'VARIABLE SPEED',high_ge18:'MOD. VAR. SPEED'}[a.cond_tier]||'',lang);

  // ── SUB-COMPONENTS ──────────────────────────────────────────
  // BlowerWheel now lives at module scope, above Canvas - see its own
  // comment there for why.

  // CondenserFan now lives at module scope, above Canvas.

  // UVRod now lives at module scope, above Canvas - see the comment there.

  // Ionizer/DuctRibbing/DuctRibbingPath/DuctClamp/PlenumMaterial/
  // RegisterGrille/DehuErvBoxes/Defs all now live at
  // module scope, above Canvas - see Ionizer's own module comment for
  // why (the same remount bug as everything else moved up there, worse
  // for Ionizer/DehuErvBoxes since each carries a one-shot
  // entrance animation that used to replay on every unrelated hover).

  // frameBox-derived breakpoint for ToggleUI's compact-vs-full layout - see
  // the big comment on ToggleUI (module scope, above Canvas) for why the
  // component itself moved out of here; this one stays local since it's
  // just a number derived from Canvas's own frameBox state.
  //
  // On a narrow frame ToggleUI's full stack (eyebrow + 2-3 full-height
  // buttons, ~150px tall) doesn't fit inside the SVG's own top letterbox
  // gutter - the closet layout in particular has very little of that
  // gutter to begin with (its diagram fills most of the frame), so the
  // panel used to sit directly on top of real equipment (the air
  // handler/return plenum) instead of the empty space above it, hiding it
  // entirely rather than just looking oversized. Below this width it swaps
  // for a single compact icon+temp pill row instead - same click
  // targets/state, just a small fraction of the vertical footprint. This
  // was previously a flat 900, which meant closet - whose frame is always
  // ~320px narrower than attic's at the same viewport width, thanks to the
  // fixed-width sidebar sitting beside it - fell into the compact variant
  // across most of the ordinary desktop window-width range, even though it
  // reads noticeably better full-size and attic almost never needed it.
  // Re-measured the actual overlap boundary directly (screenshotting the
  // full-size stack forced on in closet mode at a sweep of widths): clean
  // with real margin at a 650px frame, still overlapping the equipment at
  // 600px. 700 keeps that margin while giving closet the full-size stack
  // across realistic desktop widths, same as attic; phone/portrait-tablet
  // frames (375-390, 768 was already clean) still fall well under it into
  // the safe compact range.
  const compactToggle=frameBox&&frameBox.w>0&&frameBox.w<700;

  // ══════════════════════════════════════════════════════════
  // ATTIC HORIZONTAL
  // Before condenser: system fills full canvas, large + centered.
  // After condenser: house = 2/3, outside wall + condenser = 1/3.
  // Condenser: true side-wall view, lineset exits wall at condenser bottom.
  // ══════════════════════════════════════════════════════════
  if(isAttic){
    // The living-space band below the deck line holds just the return
    // grille - shrunk again, from 95 down to 40. The lowest content in the
    // band (the RETURN plenum caption, 21px below DECK_Y) only ever used
    // about a fifth of the old 95, so the rest was dead black space below
    // the labels and above the LIVING SPACE watermark. BASE_VH drops by
    // the exact same 55 this trims off LIVING_SPACE, so DECK_Y (and
    // everything above it - roof, equipment, outside zone) lands at the
    // identical SVG-unit position as before; only the viewBox itself gets
    // shorter. A shorter viewBox at the same frame height raises
    // SVG_SCALE, so that unchanged-in-SVG-units content renders bigger on
    // screen - the freed band becomes zoom on the rest of the diagram
    // instead of just less wasted space at the bottom.
    const LIVING_SPACE=40;
    const ZOOM=hasCond?1:0.7;
    const BASE_VH=Math.round(455*ZOOM);
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
    // Roof deck's own surface height at any given X - the same piecewise-
    // linear shape the roof polygon below is drawn with (down-slope from
    // the ridge to either eave). Shared by the flue's own roof-
    // penetration point (which used to re-derive this same formula
    // inline) and the refrigerant lineset's roofline-hugging route
    // further down, so both actually track the SAME roof surface.
    const roofY=(x)=>x<=RIDGE_X
      ?EAVE_Y-(x/RIDGE_X)*(EAVE_Y-RIDGE_Y)
      :RIDGE_Y+((x-RIDGE_X)/(HOUSE_W-RIDGE_X))*(EAVE_Y-RIDGE_Y);

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
    // Widened from 256 per direct feedback - the old width left a big gap
    // of genuinely empty attic between the plenum's own right edge and the
    // outside wall/lineset drop, worse now that the ERV (which used to sit
    // in that gap) has moved to the far-left corner instead. Centering
    // (below) uses the ORIGINAL 256 as its reference width, not this
    // widened one - see that comment for why. Capped well short of a full
    // "fill the whole gap" width - the refrigerant lineset's own vertical
    // drop to the condenser runs right along the outside wall (EXT_WALL_X
    // +9, see OutsideZone's own wallMidX), so a first pass at 330 actually
    // overshot the wall itself (measured right edge past EXT_WALL_X) and
    // ran directly into the lineset pipe. 300 leaves real clearance to
    // both while still cutting the old gap by nearly half.
    let SUP_PLEN_W=hasPlenum&&a.plenum!=='none'?300:a.plenum==='none'?140:0;
    const SUP_PLEN_H=UNIT_H;

    // Center the equipment run in the house zone - used to pin it to a
    // fixed 30px margin whenever a condenser was selected, leaving all the
    // leftover width as one gap between the plenum and the outside wall.
    // Centering (same formula already used with no condenser) splits that
    // gap evenly on both sides instead.
    //
    // Uses a fixed 256 reference for the plenum here, NOT the actual
    // (possibly wider) SUP_PLEN_W above - MARGIN_L/RET_X anchor the left
    // side of the whole run (return plenum, thermostat column, and now the
    // ERV's own far-left corner spot too), so growing the plenum's real
    // rendered width was shrinking this margin on BOTH sides symmetrically,
    // crowding the thermostat/ERV on the left for no reason while also
    // pushing the plenum's own right edge further right than intended on
    // the right. Keeping the reference fixed means the extra plenum width
    // only eats into the gap it was meant to fill (between the plenum and
    // the wall) without disturbing anything upstream of it.
    const totalW=RET_PLEN_W+(APR_W?APR_W+2:0)+FURN_W+(hasFurnace?ACOIL_W+4:AH_W)+(hasPlenum&&a.plenum!=='none'?256:a.plenum==='none'?140:0);
    const MARGIN_L=Math.max(20,Math.round((HOUSE_W-totalW)/2));
    const RET_X=MARGIN_L;
    // Thermostat's own dedicated column, in the margin the equipment run
    // is centered within (see totalW/MARGIN_L above) - that gap already
    // runs the house's full height on both sides of the equipment and
    // sits genuinely empty today (a little roofline/insulation texture,
    // nothing structural), the same way the closet layout already has
    // real breathing room on both sides of ITS unit stack for a full-size
    // thermostat. Below ~70px of margin (THERM_IN_MARGIN false) there
    // just isn't a legible column to work with, so the thermostat falls
    // back to its old spot wedged under the return duct instead.
    const THERM_IN_MARGIN=MARGIN_L>=70;
    // ThermostatFace (shared with the closet layout - see its own
    // comment) draws a 76-wide face, same real size as the closet's own,
    // so "same size, same text size" between the two layouts holds
    // structurally rather than needing two hand-tuned copies. The widest
    // real content at these local (TX=0,TY=0) coordinates isn't the face
    // itself though - it's the 3-button COOL/HP/FURN row (cx=38,
    // totalW=96, so it spans -10..86) and the "COMMUNICATING" caption
    // (13 chars @ fontSize 11.5, spans roughly -7..83) - both wider than
    // the 76-wide face they're centered under/above. CONTENT_W/CONTENT_L
    // are that real left-to-right extent (with a couple px of safety
    // pad), so every size/position calc after this is based on what
    // actually needs to fit, not just the face's own nominal width.
    const THERM_CONTENT_W=100, THERM_CONTENT_L=-12;
    // 120 is the real top-to-bottom extent of the tallest variant now
    // that the caption sits below the COOL/HEAT row (moved there per
    // direct feedback - see THERM_CAP_Y) instead of on the face itself.
    // No UNIT_H-based height cap here (there used to be one, pegging the
    // thermostat to roughly the equipment cabinet's own real-world
    // height) - the open margin column has comfortably more vertical
    // room than this needs. Targets THERM_TARGET_SCALE directly now (was
    // capped at min(TARGET_SCALE,(MARGIN_L-16)/CONTENT_W) - a genuine
    // margin-fit calculation back when the target was small enough to
    // fit inside it) - per direct feedback the size itself matters more
    // than staying inside that old column, so this now legitimately runs
    // past MARGIN_L into the return plenum's own open left margin rather
    // than shrinking back down to fit. The closet layout scales to this
    // SAME target (see its own call site) so the two stay identical.
    const THERM_SCALE=THERM_IN_MARGIN?THERM_TARGET_SCALE:0.5;
    // A heat-pump-only or dual-fuel system needs a 3rd thermostat button
    // (COOL/HP/FURN or COOL/HP/AUX, matching ToggleUI's own preview) -
    // same 96/76 row widths the closet layout's own thermostat uses, so
    // the button row is genuinely identical in both places, not just
    // similar. Only the button ROW widens - the face itself (rects/
    // circles, from ThermostatFace) keeps its own 76-wide coordinates
    // untouched.
    const THERM_BTN_N=(isDualFuel||!hasFurnace)?3:2;
    const THERM_ROW_W=THERM_BTN_N===3?96:76;
    const THERM_W=THERM_ROW_W*THERM_SCALE, THERM_H=120*THERM_SCALE;
    // TX/TY here are the <g transform="translate(...)"> origin, not a
    // bounding-box corner - the thermostat markup below still draws at
    // local 0-based coordinates (TX=0,TY=0 there) exactly as it always
    // has, so this places local x=THERM_CONTENT_L (the caption's real
    // left edge) at a small, constant safety pad from the house wall.
    // Vertically centered on UNIT_Y/UNIT_H - the same row the equipment
    // itself sits on - rather than anywhere in DECK_Y/LIVING_SPACE below,
    // so the thermostat reads as sitting beside the system, not under it,
    // and never has any bearing on how tall the living-space band needs
    // to be.
    // Re-centered per direct feedback ("still more room to move down...
    // and slightly to the right closer to the return duct... center it
    // in that void down and to the right") - this used to be centered on
    // the equipment ROW itself (UNIT_Y/UNIT_H). At this enlarged size the
    // full content (THERM_H) is genuinely taller than the open strip
    // below the equipment (measured: UNIT_Y+UNIT_H to DECK_Y is only
    // ~110 units, THERM_H is ~130 at THERM_TARGET_SCALE=1.09) - pinning
    // the BOTTOM a fixed clearance above DECK_Y (where the floor band's
    // RETURN/GAS labels live) instead of centering in that too-small gap
    // is what actually matters: it guarantees no overlap with THOSE (the
    // real "closer to the return duct" register down there), even though
    // the top of the thermostat still reaches a little back up past
    // UNIT_Y+UNIT_H into the same open-above-the-return-plenum's-own-
    // content space the equipment row's left margin already had. +26
    // (not a flat 8) nudges it right, off the house wall.
    const THERM_TX=THERM_IN_MARGIN
      ?Math.round(26-THERM_CONTENT_L*THERM_SCALE)
      :RET_X+RET_PLEN_W+8;
    const THERM_TY=THERM_IN_MARGIN
      ?Math.round(DECK_Y-14-THERM_H)
      :DECK_Y+12;
    // Hover/focus-ring boxes below (hoverPart, EditZone, StepFocusRing) key
    // off THERM_TX/THERM_W, which describe the FACE's own origin+width
    // (unchanged at nominal 76, centered on local x=38) - the button row,
    // when widened to 96 for a 3rd button, is centered under the face
    // (local x=-10..86) rather than flush with its left edge, so those
    // boxes need this same leftward nudge to still fully surround the row
    // instead of clipping its left side. Zero for the unwidened 2-button
    // case (38-76/2=0).
    const THERM_ROW_X=THERM_TX+(38-THERM_ROW_W/2)*THERM_SCALE;
    // Return plenum stays directly against the filter rack/furnace - the
    // thermostat lives off to the left in its own margin column instead,
    // so it never gets inserted into this chain and pushes this adjacency
    // apart.
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
    // Real installers run the lineset up along the underside of the roof
    // deck (stapled to the trusses) rather than straight across open
    // attic space - also why roofers occasionally catch one with a nail.
    // RL_ROOF_GAP is how far below the deck the pipe hangs (matches the
    // old fixed EAVE_Y+14 offset, at the eave itself); RL_RISER_Y/
    // RL_WALL_Y are the roof surface's own height (via roofY, above)
    // right where the riser meets it and where the run reaches the wall,
    // so the horizontal run actually traces the roofline - rising toward
    // the ridge, then back down - instead of one flat line cutting
    // across the attic at a fixed height regardless of the ridge.
    const RL_ROOF_GAP=14;
    const RL_WALL_X=HOUSE_W-14; // mirrors EXT_WALL_X-14, defined below as an alias for HOUSE_W
    const RL_RISER_Y=roofY(RL_START_X)+RL_ROOF_GAP;
    const RL_WALL_Y=roofY(RL_WALL_X)+RL_ROOF_GAP;
    // Builds this run's own route as a flat list of [x,y] waypoints -
    // riser bottom (caller's own y), up to the roofline, over the ridge
    // if the riser sits left of it, across to the wall. `yOffset` shifts
    // every roofline-derived point uniformly (not the riser start, which
    // already carries its own real y) so the two parallel physical lines
    // (0 and +9) and the ring's own centerline (+4.5) all trace the same
    // shape, offset from each other exactly like the old flat run was.
    const linesetWaypoints=(startX,startY,yOffset)=>{
      const pts=[[startX,startY],[startX,roofY(startX)+RL_ROOF_GAP+yOffset]];
      if(startX<RIDGE_X)pts.push([RIDGE_X,roofY(RIDGE_X)+RL_ROOF_GAP+yOffset]);
      pts.push([RL_WALL_X,RL_WALL_Y+yOffset]);
      return pts;
    };
    const linesetPathD=(startX,startY,yOffset)=>
      linesetWaypoints(startX,startY,yOffset||0).map(([x,y],i)=>`${i===0?'M':'L'}${x} ${y}`).join(' ');

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
    // One shared ring PATH tracing the WHOLE lineset run's own centerline -
    // indoor riser, indoor roofline run, OutsideZone's own wall drop, and
    // its condenser entry - even though the run itself stays split into 4
    // narrow hit-boxes (see each one's own comment) so none of them
    // swallows a neighboring component. Passed as `ringPath` to all 4, so
    // the ring drawn is always this same single traced line no matter
    // which narrow segment the cursor is actually over, instead of a
    // bounding rect around the whole run (tried first - way too big, read
    // as "half the page" rather than tracing the pipe). Reuses
    // linesetWaypoints for the indoor roofline portion (+4.5 centers it
    // between the two physical lines' own 0/+9 offsets), then swaps the
    // last (indoor) wall point for the outdoor wall-crossing point
    // (EXT_WALL_X+9, matching OutsideZone's own wallMidX) and continues
    // down to the condenser - exitY's 0.82 splits the difference between
    // OutsideZone's own exitY1/exitY2 (0.78/0.86 of condH, computed
    // inside its own closure) - keep these in sync if either ever changes.
    const linesetRingPath=(()=>{
      const pts=linesetWaypoints(RL_START_X+2.5,UNIT_Y+UNIT_H*0.45,4.5);
      pts[pts.length-1]=[EXT_WALL_X+9,roofY(EXT_WALL_X+9)+RL_ROOF_GAP+4.5];
      pts.push([EXT_WALL_X+9,COND_Y+COND_H*0.82],[COND_X,COND_Y+COND_H*0.82]);
      return pts.map(([x,y],i)=>`${i===0?'M':'L'}${x} ${y}`).join(' ');
    })();

    // Condensate drain route - hoisted here (shared by this branch's own
    // two render blocks below, one indoor and one outdoor - see each
    // one's own comment for why they're split in two) so both halves stay
    // in sync off one set of numbers instead of two copies that could
    // drift apart. Shaped like a real drain would actually run: low,
    // crossing BEHIND the supply ducts near the attic floor (not up at
    // the roofline the lineset itself travels - a drain has no reason to
    // climb that high), over to the exterior wall, then down alongside
    // the lineset's own wall-drop, along the ground past the condenser
    // pad, and on into the yard - per direct feedback ("cross behind the
    // supply ducts and run with the line-sets down the wall").
    const drainCoilCX=hasFurnace?ACOIL_X+ACOIL_W*0.12:AH_X+Math.round(AH_W*0.22);
    const drainTopY=UNIT_Y+UNIT_H+4;
    // Within the supply ducts' own hang band (pBot..DECK_Y, see the
    // ductwork block's own pBot/DW/DECK_Y) rather than at their exact
    // grille height, so the crossing reads as "behind the pipes" without
    // touching the grilles/registers right at the floor line.
    const drainCrossY=DECK_Y-25;
    // QA FIX - the crossing run used to be dead-level (same Y at both
    // ends), which read as a flat, unrealistic line for a gravity-fed
    // drain and drew direct feedback ("needs to slope to outside"). A
    // real condensate line pitches down away from the coil, so the wall
    // end sits a little lower than the coil end - same idea as the
    // closet layout's own sloped first leg, just applied to this one's
    // horizontal-reading crossing run instead of a short diagonal jog.
    const drainCrossY2=drainCrossY+22;
    // Inner-right edge of the wall band, clear of the lineset's own
    // px1/px2 (wallMidX∓3 inside OutsideZone) which cross a few px to its
    // left - same offset convention as the closet layout's own drain.
    const drainWallX=EXT_WALL_X+WALL_THICK-3;
    // Ground level - mirrors OutsideZone's own groundY=zoneH-28 (zoneH
    // is VH here), offset just above it so this run stays on the visible
    // sky/yard fill instead of the ground rect's own opaque fill, which
    // starts exactly at groundY (same fix, same reasoning, as the closet
    // layout's own drain hit this first).
    const drainGroundY=VH-28-2;
    // Past the pad and on toward the property line - see the closet
    // layout's own PAST_PAD comment for why this is a stylized "clearly
    // past it" distance rather than a literal 3ft-in-scale run (which
    // would push the pipe off the edge of the canvas at this zoom).
    const drainPastPad=46;
    const drainEndX=Math.min(VW-16,COND_X+COND_W+10+drainPastPad);
    // QA FIX - the indoor and outdoor halves used to each build their OWN
    // separate ringPath string (one M...L...L stopping at the wall, the
    // other starting fresh from the wall) even though the actual drawn
    // line connects seamlessly - direct feedback: hovering looked like
    // two disconnected pipes instead of one continuous run, since the
    // gold ring only ever traced whichever half you were over. Same
    // shared-path convention the lineset's own linesetRingPath already
    // uses above: ONE path spanning coil to yard, passed as ringPath to
    // every hit-zone on either half, so hovering ANYWHERE on the drain
    // highlights its whole connected route, not just the half under the
    // cursor. The two halves still render as separate <line> elements
    // (still split for the z-order reasons each block's own comment
    // explains), only the hover ring itself is unified.
    const drainFullPath=`M${drainCoilCX} ${drainTopY} L${drainCoilCX} ${drainCrossY} `+
      `L${drainWallX} ${drainCrossY2} L${drainWallX} ${drainGroundY} L${drainEndX} ${drainGroundY}`;

    return(
      <HoverCtx.Provider value={setHoverPart}>
      <GroupCtx.Provider value={groupApi}>
      <div ref={wrapRef} style={{position:'absolute',inset:0}}>
        {hasCoil&&<ToggleUI style={{position:'absolute',top:8,right:8,zIndex:10}} compactToggle={compactToggle} isDualFuel={isDualFuel} hasFurnace={hasFurnace} heatMode={heatMode} heatSubMode={heatSubMode} setHeatMode={setHeatMode} setHeatSubMode={setHeatSubMode} monthName={CURRENT_MONTH_NAME} lang={lang}/>}
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="canvas-svg" aria-hidden="true">

          {/* Full canvas background */}
          <rect x="0" y="0" width={VW} height={VH} fill="#0b0d14"/>

          {/* Outside zone (right of wall) - brightest on a sunny (cool
               mode) day, dimmer for the overcast 60° heat-pump day, darkest
               for the 32° cold snap - reads as daylight outside instead of
               a fixed dark panel regardless of weather. Fades like the
               sun/cloud/snow rendered inside OutsideZone itself. See
               OUTSIDE_* constants above for the palette reasoning. */}
          {hasCond&&<rect x={EXT_WALL_X} y="0" width={OUTSIDE_W} height={VH}
            style={{fill:outsideFill,transition:'fill 2.5s ease'}}/>}

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
            style={{fill:outsideFill,transition:'fill 2.5s ease'}}/>}

          {/* Attic interior (above deck, inside house) - subtly tinted by
              the same mode metaphor as the outside zone, see intFill above. */}
          <rect x="0" y={EAVE_Y} width={HOUSE_W} height={DECK_Y-EAVE_Y}
            style={{fill:intFill('attic'),transition:'fill 2.5s ease'}}/>

          {/* Living space below deck */}
          <rect x="0" y={DECK_Y} width={HOUSE_W} height={VH-DECK_Y}
            style={{fill:intFill('living'),transition:'fill 2.5s ease'}}/>

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
          {/* Label itself (SPRAY FOAM - SEALED ATTIC / FIBERGLASS INSULATION)
              is drawn much later, near the LIVE SYSTEM PREVIEW label below,
              not here alongside the bubbles/batting texture - see that spot
              for why. */}
          {/* Purely decorative texture (spray-foam bubbles along the roof
              slopes / fiberglass batting dots along the deck) - wrapped in
              pointer-events:none since the fiberglass branch's full-width
              band (DECK_Y-22 to DECK_Y+2) was found, via a hover sweep, to
              overlap the return grille's own hover zone (DECK_Y-3 to
              DECK_Y+27) in the few pixels where they meet, silently
              swallowing that corner of the grille's hover - the same
              "decorative fill with no pointer-events:none painted where a
              HoverInfo zone also reaches" bug fixed elsewhere in this
              file. */}
          {a.insulation&&(isSpray
            ?<g style={{pointerEvents:'none'}}>
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
            </g>
            :<g style={{pointerEvents:'none'}}>
              <rect x="0" y={DECK_Y-22} width={HOUSE_W} height={24} fill="rgba(255,130,170,.18)" stroke="rgba(255,140,180,.08)" strokeWidth="0.5"/>
              {Array.from({length:Math.floor(HOUSE_W/17)},(_,i)=>(
                <ellipse key={i} cx={8+i*17} cy={DECK_Y-7} rx={11} ry={8}
                  fill="rgba(255,182,193,.17)" stroke="rgba(255,182,193,.2)" strokeWidth=".45"/>
              ))}
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
          {/* Moved down near the floor (was DECK_Y+18) - faint/decorative
              (9% opacity) background label, sits clear of the return
              grille/caption above it regardless of LIVING_SPACE's size. */}
          <text x="22" y={VH-10} fill={W+'.09)'} fontSize="12" fontFamily="monospace" letterSpacing="0.8">{CT('LIVING SPACE',lang)}</text>

          {/* Return grille - duct trunk connects it down to the return plenum
              above instead of floating on its own ── */}
          {hasCoil&&<g>
            <rect x={RET_X+RET_PLEN_W/2-27} y={UNIT_Y+UNIT_H} width={54} height={Math.max(0,DECK_Y-(UNIT_Y+UNIT_H))}
              fill="rgba(255,182,193,.18)" stroke="rgba(255,182,193,.5)" strokeWidth="1.6"/>
            {/* Duct trunk's own hover, painted first/bottommost so the more
                specific return_grille hover just below (painted later, on
                top) wins the small strip where the two boxes overlap near
                the deck line - no EditZone covers this, so no onClick. */}
            <HoverInfo x={RET_X+RET_PLEN_W/2-27} y={UNIT_Y+UNIT_H} w={54} h={Math.max(0,DECK_Y-3-(UNIT_Y+UNIT_H))} rx={3}
              vw={SVG_VW} vh={SVG_VH} title={T('return_duct').title} text={T('return_duct').text}/>
            <rect x={RET_X+2} y={DECK_Y-1} width={RET_PLEN_W-4} height={11} rx="1"
              fill="rgba(0,0,0,.65)" stroke="rgba(255,182,193,.45)" strokeWidth="1.2"/>
            {Array.from({length:7},(_,i)=>(
              <line key={i} x1={RET_X+8+i*((RET_PLEN_W-16)/7)} y1={DECK_Y}
                x2={RET_X+8+i*((RET_PLEN_W-16)/7)} y2={DECK_Y+9}
                stroke="rgba(255,182,193,.4)" strokeWidth="0.9"/>
            ))}
            <text x={RET_X+RET_PLEN_W/2} y={DECK_Y+21} textAnchor="middle"
              fill="rgba(255,182,193,.6)" fontSize="12.5" fontFamily="monospace">{CT('RETURN',lang)}</text>
            {/* No EditZone covers this - free-standing hover, no onClick. */}
            <HoverInfo x={RET_X} y={DECK_Y-3} w={RET_PLEN_W} h={30} rx={3} vw={SVG_VW} vh={SVG_VH}
              title={T('return_grille').title} text={T('return_grille').text}/>
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
              transform={`rotate(-45,${RET_X+RET_PLEN_W/2},${UNIT_Y+UNIT_H/2})`}>{CT('RETURN PLENUM',lang)}</text>
            {/* Return-air temp - room-temp reading, opposite heat/cool
                coloring from the supply-side temp on purpose, same
                reasoning as this plenum's own airflow arrow below (this
                air hasn't been conditioned yet). Sits at the box's own
                top edge, clear of the diagonal RETURN PLENUM label which
                only crosses through the box's center. */}
            <text className="phase-color" x={RET_X+RET_PLEN_W/2} y={UNIT_Y+18} textAnchor="middle"
              fill={heatMode?'#2389e0':'#f97316'} fontSize="14" fontWeight="700" fontFamily="monospace">
              {returnTemp}°
            </text>
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
            {/* pointerEvents:none on the wrapper - the glow duplicate below
                has no class of its own to hang a CSS rule on the way
                .airflow's own pointer-events:none covers its animated
                sibling, and at 7px wide it's a real hit target that was
                swallowing hover from the return-duct trunk underneath it
                (found by hovering directly over this arrow). */}
            {DECK_Y-(UNIT_Y+UNIT_H)>16&&<g style={{pointerEvents:'none'}}>
              <path d={`M${RET_X+RET_PLEN_W/2} ${DECK_Y-4} L${RET_X+RET_PLEN_W/2} ${UNIT_Y+UNIT_H*0.5} L${RET_X+RET_PLEN_W-16} ${UNIT_Y+UNIT_H*0.5}`}
                fill="none" stroke={(heatMode?B:O)+'.3)'} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
              <path d={`M${RET_X+RET_PLEN_W/2} ${DECK_Y-4} L${RET_X+RET_PLEN_W/2} ${UNIT_Y+UNIT_H*0.5} L${RET_X+RET_PLEN_W-16} ${UNIT_Y+UNIT_H*0.5}`}
                fill="none" stroke={(heatMode?B:O)+'.8)'} strokeWidth="1.4" strokeLinejoin="round"
                strokeDasharray="6 4" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
            </g>}
            {/* No EditZone covers this - free-standing hover, no onClick.
                Painted last/topmost in this group (after the airflow
                arrow above) so that thin animated path never shadows the
                hover across the rest of the box. */}
            <HoverInfo x={RET_X} y={UNIT_Y} w={RET_PLEN_W} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
              title={T('return_plenum').title} text={T('return_plenum').text}/>
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
              transform={`rotate(-90,${APR_X+APR_W/2},${UNIT_Y+UNIT_H/2})`}>{CT('FILTRATION',lang)}</text>
            {/* No EditZone covers this - free-standing hover, no onClick. */}
            <HoverInfo x={APR_X} y={UNIT_Y} w={APR_W} h={UNIT_H} rx={2} vw={SVG_VW} vh={SVG_VH}
              title={T('filtration_cabinet').title} text={T('filtration_cabinet').text}/>
          </g>}

          {/* Furnace */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'fu'+a.stage+a.furnace_eff} filter="url(#shadow)">
            {(()=>{
              // Roof surface height at the flue's actual X (mid+w*0.2 inside
              // FurnaceH) via the shared roofY(x) helper above - EAVE_Y
              // alone only holds at the eave itself, and the flue usually
              // sits well in toward the ridge, where the sloped roof is
              // much higher up (smaller y) than that.
              const flueX=FURN_X+FURN_W*0.7;
              // No +14 pad here - FurnaceH's own pipeTop=roofY-12 already
              // pokes the cap 12px above whatever roofY value it's given,
              // so this needs to be the TRUE roof surface, not a value
              // already offset below it (that left the cap ending 2px
              // BELOW the real roofline - reading as terminating inside
              // the attic instead of poking through above it).
              const flueRoofY=roofY(flueX);
              return <FurnaceH x={FURN_X} y={UNIT_Y} w={FURN_W} h={UNIT_H} active={furnaceActive} roofY={flueRoofY}
                onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}
                blowerActive={blowerActive} is90={is90} isComm={isComm} blowerMotorLabel={BLOWER_MOTOR}/>;
            })()}
            <text x={FURN_X+FURN_W/2} y={UNIT_Y+UNIT_H+13} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.78)':(S+'.65)')} fontSize="13.5" fontFamily="monospace">{CT('FURNACE',lang)}</text>
            <text x={FURN_X+FURN_W/2} y={UNIT_Y+UNIT_H+24} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.44)':'rgba(255,255,255,.15)'} fontSize="12" fontFamily="monospace">
              {furnaceActive?CT('GAS HEATING ACTIVE',lang):CT('STANDBY',lang)}
            </text>
          </g>}

          {/* Gas supply line + drip leg - real code requirement (IFGC/NFPA
              54) on every gas appliance connection: a tee with a short
              capped nipple hanging straight down catches sediment/
              condensate by gravity before it reaches the furnace's own gas
              valve. Riser sits at 0.85*FURN_W, under the heat exchanger
              (right half of the cabinet) and well right of the centered
              FURNACE/STANDBY label below the cabinet - mirrored from its
              old 0.15*FURN_W spot (now the service switch's, just below)
              per direct feedback. Runs down to DECK_Y, the same attic-
              floor line the thermostat's own margin column and the
              condensate drain both reference, since that's where the
              home's actual gas piping would come up from. */}
          {hasCoil&&hasFurnace&&(()=>{
            const gasX=FURN_X+FURN_W*0.85;
            const gasTopY=UNIT_Y+UNIT_H;
            const teeY=gasTopY+38, valveY=gasTopY+65;
            const gasD=`M${gasX} ${gasTopY} L${gasX} ${DECK_Y}`;
            return <g className="snap" style={{animationDelay:'.14s'}}>
              <line x1={gasX} y1={DECK_Y} x2={gasX} y2={gasTopY} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round"/>
              <line x1={gasX} y1={DECK_Y} x2={gasX} y2={gasTopY} stroke="#5a5a5a" strokeWidth="1" strokeLinecap="round"/>
              {/* Shutoff valve - ball-valve handle, closed-looking (perpendicular to the pipe) reads clearly at this scale */}
              <circle cx={gasX} cy={valveY} r="4.2" fill="#242424" stroke="#5a5a5a" strokeWidth="0.8"/>
              <line x1={gasX-6} y1={valveY} x2={gasX+6} y2={valveY} stroke="#c0392b" strokeWidth="2.4" strokeLinecap="round"/>
              {/* Tee + drip leg */}
              <line x1={gasX-5} y1={teeY} x2={gasX+5} y2={teeY} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round"/>
              <line x1={gasX} y1={teeY} x2={gasX} y2={teeY+11} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round"/>
              <rect x={gasX-3.5} y={teeY+11} width="7" height="3.5" rx="1" fill="#242424" stroke="#5a5a5a" strokeWidth="0.5"/>
              {/* QA FIX - this run is only as long as gasTopY..DECK_Y, which
                  shrinks a lot on the earlier wizard steps (before a
                  condenser's picked, the attic has far less vertical room
                  than it will once the diagram's own layout settles) - short
                  enough there that this label (anchored to the tee, near the
                  TOP of the run) and the GAS label below (anchored to
                  DECK_Y, the BOTTOM) end up landing on the same baseline,
                  reading as one glued "GASDRIP LEG" word. Only draws once
                  there's enough of the run left to actually separate the
                  two - the hover tooltip (below) still covers this part
                  either way, so nothing is lost when it's hidden. */}
              {teeY+15<=DECK_Y+14-14&&<text x={gasX+10} y={teeY+15} textAnchor="start" fill="rgba(180,180,180,.5)" fontSize="8" fontFamily="monospace">{CT('DRIP LEG',lang)}</text>}
              <text x={gasX} y={DECK_Y+14} textAnchor="middle" fill="rgba(180,180,180,.55)" fontSize="11" fontFamily="monospace">{CT('GAS',lang)}</text>
              <HoverInfo x={gasX-11} y={gasTopY-2} w={22} h={DECK_Y-gasTopY+18} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('gas_line').title} text={T('gas_line').text}
                ringPath={gasD} ringStrokeWidth={9}/>
            </g>;
          })()}

          {/* Furnace service disconnect - a 120V single-pole switch (often
              just a household light switch) that lets a tech kill power to
              the blower/control board before servicing, separate from the
              240V condenser DISC. box outside. Takes the gas line's old
              spot (0.15*FURN_W, below the blower, clear of both the blower
              graphic and the centered FURNACE/STANDBY label) - see the gas
              line's own comment above for why they swapped sides. Mirrors
              the closet layout's own service-switch plate design. */}
          {hasCoil&&hasFurnace&&(()=>{
            const swX=FURN_X+FURN_W*0.15;
            const swTopY=UNIT_Y+UNIT_H;
            const plateW=16, plateH=26, plateY=swTopY+38+plateH/2;
            return <g className="snap" style={{animationDelay:'.16s'}}>
              <line x1={swX} y1={swTopY} x2={swX} y2={plateY-plateH/2} stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
              <rect x={swX-plateW/2} y={plateY-plateH/2} width={plateW} height={plateH} rx="2"
                fill="#e8e4da" stroke="#8a8578" strokeWidth="0.8"/>
              <rect x={swX-2.6} y={plateY-8} width="5.2" height="11" rx="1.4"
                fill="#2a2a2a" stroke="#555" strokeWidth="0.5"/>
              <text x={swX} y={plateY+plateH/2+11} textAnchor="middle" fill="rgba(180,180,180,.55)" fontSize="6.5" fontFamily="monospace">{CT('SERVICE',lang)}</text>
              <text x={swX} y={plateY+plateH/2+19} textAnchor="middle" fill="rgba(180,180,180,.5)" fontSize="6.5" fontFamily="monospace">{CT('SWITCH',lang)}</text>
              <HoverInfo x={swX-plateW/2-3} y={plateY-plateH/2-3} w={plateW+6} h={plateH+22} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('service_switch').title} text={T('service_switch').text}/>
            </g>;
          })()}

          {/* A-coil (horizontal, right of furnace) */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'ac'+a.cond_tier} style={{animationDelay:'.08s'}} filter="url(#shadow)">
            {(()=>{
              const active=evapActive;
              return <>
                {/* General cabinet hover - painted first/bottommost;
                    ACoilH (embedded below) adds its own more specific
                    hover on top of this for the coil itself. */}
                <HoverInfo x={ACOIL_X} y={UNIT_Y} w={ACOIL_W} h={UNIT_H} rx={4} vw={SVG_VW} vh={SVG_VH}
                  title={T(acoilInfoKey()).title} text={T(acoilInfoKey()).text}
                  onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
                {/* Exterior housing stays silver in both states - see the
                    comment on FurnaceH's border/strip above. */}
                <rect x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={UNIT_H} rx="4"
                  fill={active?"#050c1c":"#090909"}
                  stroke="url(#cabinet-edge)" strokeOpacity="0.8" strokeWidth="1.5"/>
                {/* Faint active-state tint - see FurnaceH's own comment
                    on the identical pattern for why this needs
                    pointer-events:none. */}
                {active&&<rect className="phase-color" x={ACOIL_X} y={UNIT_Y} width={ACOIL_W} height={UNIT_H} rx="4"
                  fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none" style={{pointerEvents:'none'}}/>}
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
                <ACoilH x={ACOIL_X+8} y={UNIT_Y+12} w={ACOIL_W-16} h={UNIT_H-20} active={active}
                  evapC={evapC} evapC2={evapC2} hasUV={hasUV} infoKey={acoilInfoKey()}
                  onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>
                <rect x={ACOIL_X} y={UNIT_Y+UNIT_H-2} width={ACOIL_W} height={6} rx="1" fill="#08121e" stroke={B+'.18)'} strokeWidth="0.6"/>
                {/* Label moved above the coil - the space below is now clear
                    for the supply ducts to drop straight down with nothing
                    in their way */}
                <text x={ACOIL_X+ACOIL_W/2} y={UNIT_Y-16} textAnchor="middle"
                  fill={active?evapC:(S+'.6)')} fontSize="13.5" fontFamily="monospace">{CT('A-COIL',lang)}</text>
                {/* Kept at the original 10px, unlike its sibling status
                    lines elsewhere in the diagram (font-size legibility
                    pass). This label is centered over a narrow coil box
                    (ACOIL_W, much tighter than the standalone air
                    handler's AH_W), and the refrigerant line's riser
                    (RL_START_X=ACOIL_X+8, see its own comment above) sits
                    almost exactly under where the text's left edge would
                    otherwise land - a pre-existing, very marginal overlap
                    that the "AB" of "ABSORBING HEAT"/"RE" of "REJECTING
                    HEAT" sometimes lost to the pipe's foam-sleeve stroke
                    (measured: the sleeve's right edge sits ~2px right of
                    where this text's left edge lands at dead center).
                    Nudging the label 6px right of true center clears the
                    sleeve with margin to spare while staying well short of
                    the coil box's own right edge (the supply plenum starts
                    just past it) - cheaper than restructuring the box
                    widths, and doesn't touch the "A-COIL" title above,
                    which is short enough to already clear the pipe at
                    dead center. */}
                <text className="phase-color" x={ACOIL_X+ACOIL_W/2+6} y={UNIT_Y-5} textAnchor="middle"
                  fill={active?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):'rgba(255,255,255,.14)'} fontSize="10" fontFamily="monospace">
                  {active?(refReversed?CT('REJECTING HEAT',lang):CT('ABSORBING HEAT',lang)):CT('STANDBY',lang)}
                </text>
              </>;
            })()}
          </g>}

          {/* Air handler */}
          {hasCoil&&!hasFurnace&&<g className="snap" key={'ah'+a.cond_tier} filter="url(#shadow)">
            <AirHandlerH x={AH_X} y={UNIT_Y} w={AH_W} h={UNIT_H} active={evapActive} auxHeat={auxHeatActive}
              evapC={evapC} evapC2={evapC2} hasUV={hasUV} acoilInfoKey={acoilInfoKey()}
              blowerActive={blowerActive} blowerMotorLabel={BLOWER_MOTOR} refReversed={refReversed}
              onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>
            {/* Label above the unit, same as A-COIL - keeps the space below
                clear for the condensate drain/pump instead of crowding it */}
            <text className="phase-color" x={AH_X+AH_W/2} y={UNIT_Y-16} textAnchor="middle"
              fill={evapActive?evapC:(S+'.65)')} fontSize="13.5" fontFamily="monospace">{CT('AIR HANDLER',lang)}</text>
            <text className="phase-color" x={AH_X+AH_W/2} y={UNIT_Y-5} textAnchor="middle"
              fill={evapActive?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):(auxHeatActive?'rgba(249,115,22,.65)':'rgba(255,255,255,.14)')} fontSize="12" fontFamily="monospace">
              {evapActive?(refReversed?CT('REJECTING HEAT',lang):CT('ABSORBING HEAT',lang)):(auxHeatActive?CT('AUX HEAT ONLY',lang):CT('STANDBY',lang))}
            </text>
          </g>}
          {hasCoil&&<EditZone stepId="indoor_type" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
            x={(hasFurnace?FURN_X:AH_X)-4} y={UNIT_Y-2} rx={6}
            w={(hasFurnace?ACOIL_X+ACOIL_W-FURN_X:AH_W)+8} h={UNIT_H+4}>
            {indoorSubHoversH(hasFurnace,FURN_X,FURN_W,ACOIL_X,ACOIL_W,AH_X,AH_W,UNIT_Y,UNIT_H)}
          </EditZone>}

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
                {!isExisting&&<PlenumMaterial x={SUP_X} y={SUP_PLEN_Y} w={SUP_PLEN_W} h={SUP_PLEN_H} isMetal={isMetal}/>}
                <text x={SUP_X+SUP_PLEN_W/2} y={SUP_PLEN_Y+SUP_PLEN_H/2+3} textAnchor="middle"
                  fill={isExisting?(G+'.55)'):(G+'.52)')} fontSize="12.5" fontFamily="monospace">
                  {isExisting?CT('EXISTING PLENUM',lang):isMetal?CT('METAL PLENUM',lang):CT('DUCTBOARD PLENUM',lang)}
                </text>
                {!isExisting&&<text x={SUP_X+SUP_PLEN_W/2} y={SUP_PLEN_Y+SUP_PLEN_H/2+16} textAnchor="middle"
                  fill={G+'.32)'} fontSize="11.5" fontFamily="monospace">4–8 FT SUPPLY</text>}
                {/* Supply-air temp reading - sits in the otherwise-empty gap
                    between the top flow arrow (28% down) and the plenum-type
                    label (center), so it never competes with either. See
                    supplyTemp/supplySplit's own comment above for how the
                    mode-dependent split is derived. */}
                <text className="phase-color" x={SUP_X+SUP_PLEN_W/2} y={SUP_PLEN_Y+SUP_PLEN_H/2-16} textAnchor="middle"
                  fill={heatMode?'#f97316':'#2389e0'} fontSize="14" fontWeight="700" fontFamily="monospace">
                  {supplyTemp}°
                </text>
                {[SUP_PLEN_Y+Math.round(SUP_PLEN_H*0.28), SUP_PLEN_Y+Math.round(SUP_PLEN_H*0.72)].map((ay,i)=>(
                  // pointerEvents:none on the wrapper - see the return
                  // plenum's own airflow-arrow comment above for why the
                  // 7px glow duplicate needs this too, not just .airflow's
                  // own pointer-events:none on its animated sibling.
                  <g key={"af"+i} style={{pointerEvents:'none'}}>
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
                    <text x={ionX+14} y={ionBulbY+4} textAnchor="start" fill="rgba(253,224,71,.45)" fontSize="11" fontFamily="monospace">{CT('IONIZER',lang)}</text>
                  </g>;
                })()}
              </>;
            })()}
          </g>}
          {hasPlenum&&hasCoil&&<EditZone stepId="plenum" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
            x={SUP_X-2} y={SUP_PLEN_Y-2} w={SUP_PLEN_W+4} h={SUP_PLEN_H+4} rx={5}/>}
          {/* This box's own HoverInfo moved below, after the lineset's -
              see that HoverInfo's own comment for why. */}

          {/* Condensate drain - indoor half. Exits the coil, drops to the
              supply ducts' own hang height, then crosses the attic to the
              exterior wall at that same low height - painted BEFORE the
              ductwork block right below so its 3 duct stems (opaque,
              painted after) occlude this crossing where they overlap,
              reading as "runs behind the ducts" per direct feedback,
              instead of floating in front of them. The outdoor half
              (wall-drop, along the pad, past it) is a separate block
              after OutsideZone lower down - see that block's own comment
              for why it's split off instead of continuing here. Route
              itself (drainCoilCX/drainTopY/drainCrossY/drainWallX) is
              hoisted above, alongside the lineset's own linesetRingPath,
              so both halves share the exact same numbers. */}
          {hasCoil&&hasCond&&<g key="attic-drain-indoor">
            <line x1={drainCoilCX} y1={drainTopY} x2={drainCoilCX} y2={drainCrossY}
              stroke={B+'.42)'} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round"/>
            <line x1={drainCoilCX} y1={drainCrossY} x2={drainWallX} y2={drainCrossY2}
              stroke={B+'.42)'} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round"/>
            {/* P-trap loop itself (the visible U-bend) is drawn here so it
                reads as part of this pipe, but its own HoverInfo is
                pulled OUT to a separate g painted after this whole block
                (see "attic-p-trap-hover" below) - it needs to win over
                this block's own big loose-bounding-box drain HoverInfo
                (right below) at the one small spot they overlap, and a
                HoverInfo painted earlier in the SAME <g> as a
                later-painted sibling still loses to it. */}
            {(()=>{
              const tR=5.5, tSpan=tR*1.8;
              const tX=drainCoilCX-tSpan, tY=drainTopY+22;
              const tD=`M${tX} ${tY} q0 ${tSpan} ${tSpan} ${tSpan} q${tSpan} 0 ${tSpan} -${tSpan}`;
              return <path d={tD} fill="none" stroke={B+'.42)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>;
            })()}
            <text x={drainCoilCX+7} y={drainTopY+14} textAnchor="start"
              fill={B+'.4)'} fontSize="12" fontFamily="monospace">{CT('DRAIN',lang)}</text>
            {/* No EditZone covers this line run - free-standing hover, no
                onClick. Loose bounding rect for the hit-test, ringPath
                traces the real bent route for the visible ring, same
                convention as every other bent-pipe hover in this file. */}
            <HoverInfo x={Math.min(drainCoilCX,drainWallX)-6} y={drainTopY-4}
              w={Math.abs(drainWallX-drainCoilCX)+12} h={Math.max(drainCrossY,drainCrossY2)-drainTopY+8} rx={3}
              vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
              ringPath={drainFullPath}
              ringStrokeWidth={7}/>
          </g>}

          {/* Secondary float switch - QA FIX, replaces the old free-standing
              "secondary drain pan" rectangle (direct feedback: too
              complicated, didn't read well against the already-busy DRAIN/
              DRIP LEG strip). A real A-coil's drain pan has two threaded
              ports molded in - primary (the DRAIN line above already
              exits from there) and a secondary, a few inches over on the
              same pan, normally capped or fitted with exactly this kind of
              float switch as a safety backup. So: no pan shape, just a
              short capped stub plumbed into that secondary port with the
              switch clipped to it, sitting right beside the primary
              connection instead of floating in its own box below. */}
          {hasCoil&&hasCond&&(()=>{
            const portX=drainCoilCX+16, portY=drainTopY;
            const swX=portX, swY=portY+9;
            return <g key="attic-secondary-port">
              <line x1={portX} y1={portY} x2={portX} y2={portY+5}
                stroke={B+'.42)'} strokeWidth="1.5" strokeLinecap="round"/>
              <rect x={swX-4} y={swY} width="8" height="7" rx="1.4" fill="rgba(226,232,240,.6)" stroke="rgba(15,23,42,.6)" strokeWidth="0.6"/>
              <line x1={swX} y1={swY+7} x2={swX} y2={swY+13} stroke="rgba(226,232,240,.55)" strokeWidth="1"/>
              <circle cx={swX} cy={swY+13} r="2.2" fill="rgba(239,68,68,.55)" stroke="rgba(255,255,255,.5)" strokeWidth="0.5"/>
              <HoverInfo x={portX-8} y={portY-4} w={16} h={26} rx={3}
                vw={SVG_VW} vh={SVG_VH} title={T('secondary_drain_pan').title} text={T('secondary_drain_pan').text}/>
            </g>;
          })()}

          {/* P-trap hover zone - see the drain block's own comment above
              for why this is split out and painted last. Universal to any
              coil (furnace+A-coil combo or standalone air handler) - the
              trap seals the line against the blower's static pressure,
              which would otherwise pull air backward through the drain
              or blow water out of it - so this sits on the single shared
              drain origin point (drainCoilCX/drainTopY, already
              hasFurnace-ternary'd upstream) rather than needing its own
              per-indoor-type branch. */}
          {hasCoil&&hasCond&&(()=>{
            const tR=5.5, tSpan=tR*1.8;
            const tX=drainCoilCX-tSpan, tY=drainTopY+22;
            return <HoverInfo x={tX-3} y={tY-3} w={tSpan*2+6} h={tSpan+7} rx={3}
              vw={SVG_VW} vh={SVG_VH} title={T('p_trap').title} text={T('p_trap').text}/>;
          })()}

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
              const grille=cx=><RegisterGrille cx={cx} y={DECK_Y} w={GW} dc={DC} ds={DS} label={CT('SUPPLY',lang)} lang={lang} vw={SVG_VW} vh={SVG_VH}/>;
              // Airflow arrow down the center of a duct stem - same idea as
              // the supply plenum's own internal arrows just above, so flow
              // reads continuously from plenum through the duct to the
              // grille instead of stopping at the plenum. Kept to a single
              // thin dashed line (no glow underlay) since these stems are
              // only 14px wide - the bold treatment used elsewhere would
              // overwhelm a duct this narrow.
              // pathLength normalizes stroke-dasharray to a 0-100 scale
              // regardless of the path's real pixel length - without it,
              // the fixed-pixel "10 6" dash pattern from .airflow's own
              // CSS tiles a different number of times across a short
              // straight drop vs a longer angled run, so a shorter duct
              // visibly shows fewer dash segments (reads as "dimmer") even
              // though all of them share identical color/opacity/speed.
              // The inline strokeDasharray here (in the same normalized
              // 0-100 space pathLength sets up) overrides .airflow's own
              // pixel-based dasharray - inline style wins over a
              // stylesheet class for any property the class doesn't
              // itself animate - while .airflow's animated dashoffset
              // keyframe still drives the actual motion.
              // QA FIX - strokeLinejoin defaulted to "miter", which on the
              // angled ducts' own bent path (a real corner, unlike the
              // straight duct's single unbroken segment) can spike a thin
              // 1.6px dashed stroke into a disproportionately bright flare
              // right at the joint whenever a dash happens to straddle it -
              // reading as the angled ducts having a much stronger glow
              // than the straight one, even though the dash pattern itself
              // (pathLength-normalized, see the comment above) is
              // genuinely identical across all three. "round" caps the
              // join at the stroke's own width instead of amplifying it.
              const ductArrow=(d,key)=>(
                <path key={key} d={d} pathLength="100" fill="none" stroke={(heatMode?O:B)+'.85)'} strokeWidth="1.6"
                  strokeLinejoin="round" className="airflow" style={{strokeDashoffset:0,strokeDasharray:'16 10'}} markerEnd="url(#arr)"/>
              );
              const straight=(cx,key)=>(
                <g key={key}>
                  <rect x={cx-DW/2} y={pBot} width={DW} height={Math.max(0,DECK_Y-pBot)} fill={DC} stroke={DS} strokeWidth="1"/>
                  <DuctRibbing x={cx-DW/2} y={pBot} w={DW} h={Math.max(0,DECK_Y-pBot)} vertical/>
                  <DuctClamp x={cx-DW/2} y={pBot+2} w={DW} vertical/>
                  <DuctClamp x={cx-DW/2} y={DECK_Y-5} w={DW} vertical/>
                  {DECK_Y-pBot>10&&ductArrow(`M${cx},${pBot+3} L${cx},${DECK_Y-4}`,'arrow')}
                  {/* No EditZone covers duct geometry - free-standing hover,
                      no onClick. Painted before the grille below so its own
                      more specific hover (RegisterGrille's built-in one)
                      wins the small strip where the two overlap near the
                      deck line. ringPath (this run's own straight
                      centerline) instead of the default rect ring, same
                      reasoning as the angled/left/right duct runs' own -
                      otherwise this one straight run looked visually
                      different (a boxed rect ring) next to the others'
                      traced glow-line rings. */}
                  <HoverInfo x={cx-DW/2-2} y={pBot} w={DW+4} h={Math.max(0,DECK_Y-pBot)} rx={2}
                    vw={SVG_VW} vh={SVG_VH} title={T('supply_duct').title} text={T('supply_duct').text} group="supply_duct"
                    ringPath={`M${cx} ${pBot} L${cx} ${DECK_Y}`} ringStrokeWidth={DW+8}/>
                  {/* Balancing damper - deliberately NOT a new visible
                      glyph (per direct feedback: "low profile, only
                      noticeable when hovering, even if accidentally") -
                      just a small hover zone right on top of the existing
                      clamp collar right at the plenum end, painted after
                      (so it wins) the general duct hover just above for
                      this small overlapping strip only. */}
                  <HoverInfo x={cx-DW/2-2} y={pBot} w={DW+4} h={10} rx={2}
                    vw={SVG_VW} vh={SVG_VH} title={T('balancing_damper').title} text={T('balancing_damper').text}/>
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
                    {/* Flex-duct corrugation along both legs of the elbow -
                        a real drop like this is one continuous flex run
                        that just bends, not two different materials. */}
                    <DuctRibbingPath x1={topX} y1={pBot+2} x2={botX} y2={bendY} width={DW-1}/>
                    <DuctRibbingPath x1={botX} y1={bendY} x2={botX} y2={DECK_Y-4} width={DW-1}/>
                    <DuctClamp x={topX-DW/2} y={pBot+2} w={DW} vertical/>
                    <DuctClamp x={botX-DW/2} y={DECK_Y-5} w={DW} vertical/>
                    {ductArrow(`M${topX},${pBot+3} L${botX},${bendY} L${botX},${DECK_Y-4}`,'arrow')}
                    {/* Two boxes tracing the actual bent run (elbow leg,
                        then straight drop) rather than one bounding rect,
                        same reasoning as the lineset's own L-shaped hover
                        elsewhere in this file - a single rect spanning the
                        full diagonal would swallow whatever sits beside it.
                        Both still share the SAME ringPath (this run's own
                        `d`, the diagonal elbow + straight drop as one
                        path) so whichever leg is actually under the
                        cursor, the ring shown hugs the real bent pipe
                        instead of a blocky rect bounding-box around the
                        diagonal leg. */}
                    <HoverInfo x={Math.min(topX,botX)-DW/2-2} y={pBot-2} w={Math.abs(botX-topX)+DW+4} h={bendY-pBot+4} rx={2}
                      vw={SVG_VW} vh={SVG_VH} title={T('supply_duct').title} text={T('supply_duct').text} group="supply_duct"
                      ringPath={d} ringStrokeWidth={DW+8}/>
                    <HoverInfo x={botX-DW/2-2} y={bendY} w={DW+4} h={Math.max(0,DECK_Y-bendY)} rx={2}
                      vw={SVG_VW} vh={SVG_VH} title={T('supply_duct').title} text={T('supply_duct').text} group="supply_duct"
                      ringPath={d} ringStrokeWidth={DW+8}/>
                    {/* Balancing damper - same low-profile, hover-only
                        easter egg as the straight duct's own (see that
                        one's comment) - right on the clamp at the
                        plenum end of this branch. */}
                    <HoverInfo x={topX-DW/2-2} y={pBot} w={DW+4} h={10} rx={2}
                      vw={SVG_VW} vh={SVG_VH} title={T('balancing_damper').title} text={T('balancing_damper').text}/>
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

          {/* ── REFRIGERANT LINES - up the riser, then following the
               ROOFLINE (not a flat line) across to the wall - matches
               how installers actually run a lineset in an attic, stapled
               along the underside of the roof deck rather than crossing
               open space (also why a roofer occasionally punches a nail
               through one). Frees up the flat band this used to cut
               across the middle of the attic for other equipment (ERV
               moved into it - see its own comment below). ── */}
          {hasCoil&&hasCond&&<g key="rl">
            {(()=>{
              const active=evapActive;
              const ry1=UNIT_Y+UNIT_H*0.35, ry2=UNIT_Y+UNIT_H*0.55;
              const d1=linesetPathD(RL_START_X,ry1,0);
              const d2=linesetPathD(RL_START_X+5,ry2,9);
              // Reversed-direction copies of the same two paths, for the
              // "away from wall" flow-dot case below - animateMotion has
              // no built-in reverse, so this walks the same waypoints
              // starting from the wall end instead of the riser end.
              const d1r=linesetWaypoints(RL_START_X,ry1,0).slice().reverse().map(([x,y],i)=>`${i===0?'M':'L'}${x} ${y}`).join(' ');
              const d2r=linesetWaypoints(RL_START_X+5,ry2,9).slice().reverse().map(([x,y],i)=>`${i===0?'M':'L'}${x} ${y}`).join(' ');
              return <>
                {/* Foam sleeve */}
                <path d={d1} fill="none" stroke="rgba(20,20,36,.75)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                <path d={d2} fill="none" stroke="rgba(20,20,36,.6)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Line 1 -- always bold red/blue */}
                <path d={d1} fill="none" stroke={line1C} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="line-pulse"/>
                {/* Line 2 -- always bold, opposite color */}
                <path d={d2} fill="none" stroke={line2C} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="line-pulse" style={{animationDelay:'.15s'}}/>
                {/* Flow dots -- both pipes */}
                {active&&Array.from({length:6},(_,i)=>{
                  const isLine1=i<3;
                  const pColor=isLine1?line1C:line2C;
                  {/* Same fix, same reasoning, as OutsideZone's own
                      toCondenser above - was inverted, now correct. */}
                  const toWall=isLine1?refReversed:!refReversed;
                  const p=toWall?(isLine1?d1:d2):(isLine1?d1r:d2r);
                  return <circle key={i} r="3" fill={pColor} opacity="0.82" filter="url(#glow-sm)">
                    <animateMotion dur={(2.2+(i%3)*0.5)+'s'} repeatCount="indefinite" begin={(i*0.7)+'s'} path={p}/>
                  </circle>;
                })}
                {/* No EditZone covers this indoor run - free-standing
                    hover, no onClick. OutsideZone's own lineset hover
                    covers the outside portion of this same run
                    separately. Used to be ONE bounding box spanning the
                    riser's full ry1/ry2-to-roof height across the run's
                    ENTIRE width (coil to wall) - correct for the narrow
                    riser itself, but for the rest of that width the pipe
                    actually stays up near the roofline the whole way, so
                    that box's lower two-thirds was empty open attic space
                    (right where the supply plenum/thermostat column sits)
                    that still read as "hovering the lineset" - direct
                    feedback confirmed this, twice (a first, more modest
                    tightening still left the box's bottom edge open-attic
                    deep enough to cover the space above the plenum, since
                    a single rect can't hug a diagonal without spanning
                    its full rise somewhere). Split into three tight boxes
                    instead, same idea as the angled supply duct's own
                    split hover elsewhere in this file: the narrow riser
                    itself (full height, tight width - doesn't reach the
                    plenum's own X range, which starts well right of the
                    coil), then the roofline run split AGAIN at the ridge
                    into its own left/right diagonal halves, each boxed
                    tightly to just its own rise (a smaller X-span means a
                    smaller forced Y-span) instead of one box stretched
                    across the whole coil-to-wall width. All three still
                    share the same ringPath (the run's own real
                    centerline) so the visible ring always traces the
                    true route regardless of which box the cursor is
                    actually in. */}
                <HoverInfo x={RL_START_X-7} y={Math.min(roofY(RL_START_X)+RL_ROOF_GAP,ry1)-6}
                  w={20} h={Math.max(ry1,ry2)-Math.min(roofY(RL_START_X)+RL_ROOF_GAP,ry1)+12} rx={3}
                  vw={SVG_VW} vh={SVG_VH} title={T('lineset').title} text={T('lineset').text}
                  ringPath={linesetRingPath} ringStrokeWidth={16}/>
                {/* Roofline run, RL_START_X to RL_WALL_X - a SINGLE box per
                    side of the ridge still forced a real ~88-unit rise
                    over that whole span (the ridge-to-wall slope's actual
                    rise, unavoidable for one rect spanning that much
                    width), which - once rendered at this canvas's actual
                    on-screen scale - was still a tall enough strip to
                    reach the open attic space above the plenum (even a
                    first 4-way split per side still left one thin sliver
                    reaching that space). Chopped into 8 narrower sub-
                    segments per side instead: an eighth of the X-span
                    forces only an eighth of the rise, so each one stays
                    genuinely tight against the line no matter how
                    shallow or steep the overall pitch is. */}
                {[...Array.from({length:8},(_,i)=>[RL_START_X+(RIDGE_X-RL_START_X)*i/8,RL_START_X+(RIDGE_X-RL_START_X)*(i+1)/8]),
                  ...Array.from({length:8},(_,i)=>[RIDGE_X+(RL_WALL_X-RIDGE_X)*i/8,RIDGE_X+(RL_WALL_X-RIDGE_X)*(i+1)/8])
                ].map(([x0,x1],i)=>{
                  const y0=roofY(x0)+RL_ROOF_GAP, y1=roofY(x1)+RL_ROOF_GAP;
                  const top=Math.min(y0,y1)-6, bot=Math.max(y0,y1)+10;
                  return <HoverInfo key={'rl-seg'+i} x={x0-4} y={top} w={x1-x0+8} h={bot-top} rx={3}
                    vw={SVG_VW} vh={SVG_VH} title={T('lineset').title} text={T('lineset').text}
                    ringPath={linesetRingPath} ringStrokeWidth={16}/>;
                })}
              </>;
            })()}
          </g>}
          {/* Supply plenum's own hover, moved down here (after the
              lineset's generous bounding box just above, which - per its
              own comment - is deliberately loose since the roofline run's
              real shape doesn't reduce to a tight rect) so it wins hover
              priority in the strip where the two boxes actually overlap,
              instead of the lineset's box swallowing hovers over the
              plenum below it. Same box/copy/onClick this always had -
              only its paint-order position changed. */}
          {hasPlenum&&hasCoil&&<HoverInfo x={SUP_X-2} y={SUP_PLEN_Y-2} w={SUP_PLEN_W+4} h={SUP_PLEN_H+4} rx={5}
            vw={SVG_VW} vh={SVG_VH} title={T('supply_plenum').title} text={T('supply_plenum').text}
            onClick={onEditStep?()=>onEditStep('plenum'):undefined}/>}

          {/* QA FIX - ionizer's own hover used to live right where it's
              drawn (bulb+rod, above/inside the plenum), which left its
              "IONIZER" text label - painted further right, starting past
              the box's own right edge - entirely outside the hoverable
              area, and left the rod's own lower stretch (which dips down
              INSIDE the plenum box) losing out to the plenum's hover since
              that box paints later/on top. Moved here (after the plenum's
              own hover, same "wins the overlap strip" fix already applied
              to the lineset/plenum pair above) and widened to also cover
              the label reliably beats the plenum in their shared area
              while still reading "SUPPLY PLENUM" everywhere else on it. */}
          {hasIonizer&&(()=>{
            const ionX=SUP_X+Math.round(SUP_PLEN_W*0.18);
            const ionBulbY=SUP_PLEN_Y-14;
            const ionRodLen=Math.round(SUP_PLEN_H*0.55);
            return <HoverInfo x={ionX-14} y={ionBulbY-14} w={14+58} h={SUP_PLEN_Y+ionRodLen-(ionBulbY-14)+6} rx={3}
              vw={SVG_VW} vh={SVG_VH} title={T('ionizer').title} text={T('ionizer').text}/>;
          })()}

          {/* ── OUTSIDE ZONE - exterior wall + condenser ── */}
          {hasCond&&<OutsideZone
            wallX={EXT_WALL_X} zoneW={OUTSIDE_W} zoneH={VH}
            condX={COND_X} condY={COND_Y} condW={COND_W} condH={COND_H}
            lineY1={RL_WALL_Y} lineY2={RL_WALL_Y+9}
            active={condenserActive} tierKey={a.cond_tier} eaveY={EAVE_Y}
            heatMode={heatMode} isMildHp={isMildHp}
            refReversed={refReversed} isSurge={isSurge} condC={condC}
            line1C={line1C} line2C={line2C} G={G} W={W} lang={lang} vw={SVG_VW} vh={SVG_VH}
            linesetRingPath={linesetRingPath}
            condenserEl={<Condenser x={COND_X} y={COND_Y} w={COND_W} h={COND_H}
              active={condenserActive} tierKey={a.cond_tier}
              condC={condC} refReversed={refReversed} line1C={line1C} line2C={line2C}
              fanSpeedMode={!heatMode?'cool':(isMildHp?'hp':'off')} onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>}/>}
          {hasCond&&<EditZone stepId="cond_tier" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
            x={COND_X-2} y={COND_Y-2} w={COND_W+4} h={COND_H+4} rx={5}>
            {condenserSubHovers(COND_X,COND_Y,COND_W,COND_H,a.cond_tier)}
          </EditZone>}

          {/* Condensate drain - outdoor half (down the wall, along the
              ground past the condenser pad, out into the yard). Painted
              AFTER OutsideZone (ground/pad/condenser, just above) so this
              run draws on top of them instead of underneath the ground
              rect's own opaque fill - the closet layout's identical drain
              hit this same z-order issue first; see its own comment.
              Picks up right where the indoor half (before the ductwork
              block, up near SUP_X) left off, at drainWallX/drainCrossY2. */}
          {hasCoil&&hasCond&&(()=>{
            return <g key="attic-drain-outdoor">
              {/* Down the wall to ground level - crosses from the dim
                  attic interior into the brighter outdoor sky fill
                  partway down, so this segment (and the ground-level one
                  below it) step UP in opacity rather than down, same
                  contrast fix the closet layout's own drain needed. */}
              <line x1={drainWallX} y1={drainCrossY2} x2={drainWallX} y2={drainGroundY}
                stroke={B+'.6)'} strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round"/>
              {/* Along the pad and past it */}
              <line x1={drainWallX} y1={drainGroundY} x2={drainEndX} y2={drainGroundY}
                stroke={B+'.85)'} strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round"/>
              {/* QA FIX - this used to be one big bounding box spanning
                  the whole outdoor run (wall drop through the far end
                  past the pad), which swallowed hover AND click for
                  everything under it - DISC, the condenser, COMP - the
                  same oversized-hit-box bug already found and fixed on
                  the closet layout's identical drain. Split into the same
                  two narrow per-segment zones that fix used, both sharing
                  this one ringPath so the visible ring still traces the
                  whole bent route regardless of which segment's hovered. */}
              <HoverInfo x={drainWallX-4} y={Math.min(drainCrossY2,drainGroundY)-4}
                w={8} h={Math.abs(drainGroundY-drainCrossY2)+8} rx={3}
                vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
                ringPath={drainFullPath} ringStrokeWidth={9}/>
              {/* QA FIX - the ground-level run physically passes right
                  behind the condenser (drainWallX..drainEndX crosses
                  COND_X..COND_X+COND_W along the pad), so a single hover
                  box for the whole span still overlapped the condenser's
                  own EditZone at their shared ground-level edge - painted
                  after it, the drain won that strip and swallowed clicks
                  meant for the condenser (confirmed by a QA pass: clicks
                  along the very bottom edge of the condenser cabinet were
                  dead). Gapped into two pieces that stop short of the
                  condenser's own footprint on each side instead of one
                  continuous box, so that strip falls through to the
                  EditZone beneath it again. The visible dashed line and
                  its ring are untouched - only the hit-testing has the gap. */}
              {Math.min(drainWallX,drainEndX)<COND_X-6&&<HoverInfo x={Math.min(drainWallX,drainEndX)-4} y={drainGroundY-4}
                w={Math.max(0,COND_X-6-Math.min(drainWallX,drainEndX))+4} h={8} rx={3}
                vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
                ringPath={drainFullPath} ringStrokeWidth={9}/>}
              {Math.max(drainWallX,drainEndX)>COND_X+COND_W+6&&<HoverInfo x={COND_X+COND_W+6} y={drainGroundY-4}
                w={Math.max(0,Math.max(drainWallX,drainEndX)-(COND_X+COND_W+6))+4} h={8} rx={3}
                vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
                ringPath={drainFullPath} ringStrokeWidth={9}/>}
              {/* Open terminus - a short downward drip stub + a dark
                  discharge point, same "this is where it lets out" cue
                  the old indoor terminus used, relocated to the actual
                  outdoor end of the run. */}
              <line x1={drainEndX} y1={drainGroundY} x2={drainEndX} y2={drainGroundY+5}
                stroke={B+'.85)'} strokeWidth="2" strokeLinecap="round"/>
              <circle cx={drainEndX} cy={drainGroundY+5} r={3} fill={B+'.7)'} stroke={B+'.95)'} strokeWidth="0.8"/>
            </g>;
          })()}

          {/* ── THERMOSTAT - its own dedicated column in the left margin
               (mounted on the interior wall, same real-world spot a
               thermostat actually goes), not wedged into the equipment
               run's living-space band below it - see THERM_* above for
               why/how that column's size is derived. Position+scale live
               on this one wrapping <g>; every shape inside still uses
               plain 0-based local coordinates exactly as it did when TX/TY
               were the absolute position directly, so the three thermostat
               designs below are untouched other than that. Falls back to
               the old spot under the return duct (THERM_IN_MARGIN false)
               when the margin's too narrow for a legible column. ── */}
          {hasTstat&&(()=>{
            const isProprietary=a.thermostat==='proprietary';
            const isWifi=a.thermostat==='wifi'&&!isProprietary;
            const variant=thermVariant(isProprietary,isWifi);
            // Shoulder-season swing readout - see isMildHp's own definition
            // far below (reused as-is, not redefined here, so this always
            // agrees with thermostatTemp's own 70-vs-67 split just above
            // it) for exactly which config/mode this represents. isMildHp
            // alone doesn't imply heatMode (it only looks at heatSubMode,
            // so it can be true while still in cool mode) - every other
            // consumer of it in this file gates it with heatMode&& first
            // (see outsideFill/intFill/CondenserFan just below), so this
            // does too.
            const showRange=heatMode&&isMildHp;
            return <g className="snap therm-hover-zone" key="tstat" style={{animationDelay:'.26s'}}
              onMouseEnter={()=>setHoverPart({x:THERM_ROW_X,y:THERM_TY,w:THERM_W,h:THERM_H,
                vw:SVG_VW,vh:SVG_VH,title:T('thermostat_general').title,text:T('thermostat_general').text,highlight:true})}
              onMouseLeave={()=>setHoverPart(null)}>
            {/* Invisible hover target, sized in outer canvas space like
                EditZone's own hit-rect just below (same THERM_ROW_X/TY/W/H
                origin). pointer-events:all so a fully transparent fill
                still registers the hover. The general-info mouseenter/
                mouseleave pair live on the OUTER g instead of this rect -
                EditZone/the COOL/HEAT buttons are painted after this rect
                (deliberately, so THEIR clicks still land correctly - see
                their own comments below) and would otherwise be the actual
                hover target for most of this box, so a handler on this
                rect alone would miss most hovers; React's enter/leave
                events bubble to this ancestor. */}
            <rect x={THERM_ROW_X-2} y={THERM_TY-2} width={THERM_W+4}
              height={THERM_H+4}
              fill="transparent" style={{pointerEvents:'all'}}/>
            {/* General "what is this" thermostat tooltip - purely additive:
                no new hit-rect (the invisible rect just above already
                reports its own hover to setHoverPart, same mechanism
                HoverInfo itself uses - see the module comment on
                HoverCtx), so it never fights the COOL/HEAT buttons/EditZone
                painted after it for clicks. Face markup itself now lives in
                the shared ThermostatFace (see its own comment) - both
                layouts paint the exact same 76-wide design, only the
                wrapping transform (scale here for the narrow-margin
                fallback, none in the closet layout) differs. */}
            <g transform={`translate(${THERM_TX} ${THERM_TY}) scale(${THERM_SCALE})`}>
              <ThermostatFace TX={0} TY={0} isProprietary={isProprietary} isWifi={isWifi}
                thermostatTemp={thermostatTemp} showRange={showRange} heatMode={heatMode} G={G} B={B}/>
            </g>
            <EditZone stepId="thermostat" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
              x={THERM_ROW_X-2} y={THERM_TY-2} w={THERM_W+4} h={THERM_H+4}/>
            {/* Painted after EditZone (topmost in paint order) so a click
                lands on the button, not the done-screen's edit-zone overlay
                underneath it - see EditZone's own onClick above. */}
            <g transform={`translate(${THERM_TX} ${THERM_TY}) scale(${THERM_SCALE})`}>
              <ThermModeButtons modes={thermModes(isDualFuel,hasFurnace,heatMode,heatSubMode,setHeatMode,setHeatSubMode)}
                cx={38} y={THERM_BTN_Y[variant]} totalW={THERM_ROW_W} gap={4} h={17} fontSize={THERM_BTN_N===3?8.5:9.5} lang={lang}/>
              {/* Caption moved below the COOL/HEAT row per direct feedback
                  ("wifi smart is in between the thermostat and the
                  buttons... that could go below too", "'Basic' wording can
                  go underneath the thermostat buttons, since theres room")
                  - uses the spare room the hover/edit box already reserves
                  below the button row instead of crowding the face itself. */}
              <text x={38} y={THERM_CAP_Y[variant]} textAnchor="middle" fill={G+THERM_CAP_FILL_A[variant]}
                fontSize={THERM_CAP_SIZE[variant]} fontFamily="monospace">{THERM_CAP_TEXT[variant]}</text>
            </g>
          </g>;
          })()}

          {/* Dehumidistat - moved adjacent to the DEHU equipment box itself
              (slightly up and to its left) per direct feedback, instead of
              stacked under the thermostat - both are green-outlined, so
              sitting next to each other reads as "these two are related"
              at a glance, and it frees up the thermostat's own vertical
              footprint to grow into (see THERM_TY/THERM_TARGET_SCALE
              above). Same dehuBX/BY the DEHU+ERV block below computes -
              hoisted up here since this paints earlier in the tree; kept
              as literal re-derivations (not shared variables) since
              they're each still genuinely conditional on hasFurnace alone,
              same pattern already used elsewhere in this file for
              positions needed by more than one block. Stays default scale
              (1) here - only the closet layout's copy sizes up (see its
              own comment) since this position was never the cramped one. */}
          {hasDehu&&hasTstat&&(()=>{
            const sysX2=hasFurnace?FURN_X:AH_X;
            const dehuBX2=hasFurnace?sysX2+30:sysX2+AH_W-80-8;
            const dehuBY2=UNIT_Y-48-14;
            // -28 (not just -8) clears the dehu's own dedicated return
            // duct, which crosses this exact stretch of open attic air at
            // a fixed midY=UNIT_Y-35 (see that duct block's own comment) -
            // -8 sat the caption text right on top of that pink duct line.
            return <DehumidistatWall x={dehuBX2-70} y={dehuBY2-28}
              pct={!heatMode?45:(isMildHp?55:50)} lang={lang} vw={SVG_VW} vh={SVG_VH}/>;
          })()}

                    {/* Dehu + ERV -- small compact boxes side by side, hanging from roofline.
              ERV now hangs near the right outside wall - the space the
              refrigerant lineset used to cut straight across before it
              was rerouted to hug the roofline instead (see
              linesetWaypoints above), freeing up this corner. Keeping the
              dehu where it already was, centered over the equipment, lets
              its own dedicated return/supply ducts (drawn just below)
              reach both plenums without crossing the whole attic. */}
          {(hasDehu||hasERV)&&(()=>{
            const sysX=hasFurnace?FURN_X:AH_X;
            const BW=80;
            // Dehu: left of furnace center (clear of flue which is on right
            // side) - furnace's own "FURNACE" title sits BELOW the unit, not
            // above it, so there's nothing up here to dodge but the flue.
            // Air handler is the opposite: no flue, but "AIR HANDLER"/its
            // status line ARE centered above the cabinet - the same
            // furnace-tuned offset landed this box under the left half of
            // that title (measured: ~20px of real overlap with a hasCond
            // AH_W). Anchoring off the cabinet's own right portion instead
            // clears the (narrower, centered) title with room to spare on
            // every tier/condenser state, and stays clear of the supply
            // plenum starting just past the cabinet's right edge.
            // QA FIX - was sysX+44, crowding the flue (which pokes up
            // through the roof at FURN_X+FURN_W*0.7) with only ~13px of
            // real clearance. Shifted further left (+30) for real breathing
            // room between the two.
            const dehuBX=hasFurnace?sysX+30:sysX+AH_W-BW-8;
            // ERV: far-left corner of the attic, above the return plenum/
            // thermostat column - genuinely on its own there, clear of
            // everything else in the equipment run. Used to hang near the
            // right outside wall instead, tucked into the slot between the
            // supply plenum and the wall - but that's exactly where the
            // rerouted refrigerant lineset's own roofline run drops down
            // to cross to the condenser, so the two kept crowding each
            // other (red/blue lineset running right past the ERV's own
            // IN/OUT stubs) however tightly the slot was measured. This
            // spot was already the wizard's own ghost preview position for
            // this step (see the stepId="dehu" StepFocusRing below,
            // x={Math.max(8,RET_X)}) - the real box just never matched it.
            // Full 80-wide box now, no shrinking needed - there's no tight
            // slot to fit into over here. Bumped a bit past the standard
            // BW (96 vs 80) per direct feedback that it read as cramped
            // sitting alone in the corner - nothing else occupies this
            // far-left strip up near the eave, so there's room to spare.
            const ervW=96;
            // Scooted flush against the left wall (was Math.max(8,RET_X),
            // which - since RET_X/MARGIN_L is always >=20 - actually never
            // hit the 8 floor and left the box sitting further right than
            // intended) per direct feedback that there was still room to
            // push it further left.
            const ervBX=8;
            // Uses the real per-X roof surface (not a flat approximation
            // like the dehu hang-kit's own roofY below, which only needs a
            // reasonable strap-mounting height, not an actual penetration
            // point) so the roof cap genuinely pokes through the correct
            // spot on the pitched roof above this now-far-left position,
            // same pattern as the flue's and closet ERV's own roof stubs
            // elsewhere in this file.
            // Evaluated at the LEFT hang-bracket's own X (DehuErvBoxes'
            // r1X=BX+boxW*0.08), not the box center - this box now sits
            // hard against the eave (ervBX=8) where the roof drops fast,
            // and both brackets share this single ry. A center-based Y
            // was too high (too close to the ridge) for the true roof
            // height at the left bracket's own, further-left position,
            // so that bracket's strap poked up above the actual roofline.
            // Anchoring to the left bracket's real X fixes that; the
            // right bracket (closer to the ridge, where the roof is
            // genuinely higher) ends up anchored a bit lower than it
            // could reach - a safe under-reach, never a roofline-poking
            // over-reach.
            const ervRoofY=roofY(ervBX+ervW*0.08);
            return <DehuErvBoxes dehuBX={dehuBX} ervBX={ervBX} ervW={ervW} BY={UNIT_Y-48-14} roofY={EAVE_Y+14} ervRoofY={ervRoofY}
              hasDehu={hasDehu} hasERV={hasERV} snap
              lang={lang} vw={SVG_VW} vh={SVG_VH}/>;
          })()}

          {/* Dehu's own dedicated return + supply ducts, tapping the same
              two plenums every room's ductwork uses - a dedicated return
              pulls house air in ahead of the coil, a dedicated supply
              (through a backdraft damper, so the blower's much stronger
              airflow can't push air backward through an idle dehu) feeds
              the dehumidified air back in. Matches how these are actually
              installed in the field - the dehu box previously had no
              ductwork of its own drawn at all. */}
          {hasDehu&&hasCoil&&hasPlenum&&(()=>{
            const sysX=hasFurnace?FURN_X:AH_X;
            const BW=80,BH=48;
            // Matches the dehu box's own call site above - see its comment
            // for why this moved from +44 to +30.
            const dehuBX=hasFurnace?sysX+30:sysX+AH_W-BW-8;
            // Routed through the open attic air between the equipment tops
            // and the dehu/ERV box row (BY..BY+BH, i.e. UNIT_Y-62..UNIT_Y-14)
            // rather than the ~14px gap right above the cabinets - that
            // narrow band is already spoken for by the "ABSORBING HEAT"/
            // "B-VENT" status text and the flue, so a duct run through it
            // just came out as an opaque bar smeared across that text.
            // Tapping off the box's own left/right SIDE at mid-height (not
            // its bottom, which is where the hanging straps already run)
            // keeps this clear of both.
            const midY=UNIT_Y-35;
            // Pipe body thickness, matched to the backdraft damper's own
            // 12px housing height per direct feedback ("as thick as the
            // backdraft damper") - these used to be thin 1.4px dashed
            // lines with only a soft glow standing in for real duct width,
            // reading as a wire, not a duct. DW2 (the old glow-only width)
            // is gone; pipeW is the actual solid pipe body now, with a
            // thin dashed centerline on top as the flow-direction accent
            // (same "line drawn again, thinner, dashed, on top" technique
            // the main refrigerant linesets elsewhere in this file use).
            const pipeW=11;
            const RC='rgba(255,182,193,';
            // Return: plenum's own CENTER, not its right edge, per direct
            // feedback. (The return-air register's own arrow/"RETURN
            // PLENUM" label/temp readout already converge on this same
            // centerline from below - this duct enters from above it, at
            // UNIT_Y, clear of all of that, which sits lower in the box.)
            const retTgtX=RET_X+RET_PLEN_W/2;
            // Supply: well right-of-center on the supply plenum, clear of
            // the ionizer's own UV rod (enters at ~0.18 of plenum width,
            // see hasIonizer block above) and the plenum's centered label.
            const supTgtX=SUP_X+Math.round(SUP_PLEN_W*0.75);
            // The plenum's own center (retTgtX) now sits almost directly
            // under the ERV, which moved to this same far-left corner (see
            // that box's own call site comment) - a straight horizontal run
            // at midY would pass right through the ERV's box/hanging-kit
            // footprint (BY..BY+BH spans the same band midY sits in) instead
            // of past it. When ERV is on the build, the return duct instead
            // runs past the ERV's right edge first, THEN drops below the
            // whole dehu/ERV box row before jogging back to the plenum's
            // true center - same "route around, not through, a box in the
            // way" idea as the closet return-chase's own pump detour.
            // QA FIX - a prior pass added a multi-bend detour here on the
            // assumption that the ERV (now in the far-left corner) sat in
            // this duct's way, but retTgtX (the plenum's own center,
            // ~RET_X+54) is already comfortably clear of the ERV's own
            // footprint (8 to 8+BW=88) by a wide margin - the duct's
            // horizontal run never actually needs to cross anywhere near
            // x<88 to reach it. The detour was solving a collision that
            // never existed, just adding unnecessary zigzag. Back to the
            // plain 3-point path.
            const retD=`M${dehuBX} ${midY} L${retTgtX} ${midY} L${retTgtX} ${UNIT_Y}`;
            const supD=`M${dehuBX+BW} ${midY} L${supTgtX} ${midY} L${supTgtX} ${SUP_PLEN_Y}`;
            // Hit-testing pad, half the pipe's own outer glow width plus a
            // couple px of slop - deliberately NOT one rect spanning "the
            // whole bounding box of the bent path" (what this used to be):
            // an L-shaped run's bounding box is a full RECTANGLE spanning
            // corner-to-corner, so for a run that jogs sideways then drops
            // down through the equipment row, that rectangle swallowed the
            // top slice of every cabinet the run passed over (RETURN
            // PLENUM/FILTRATION/HEAT EXCHANGER/BLOWER/A-COIL/SUPPLY PLENUM
            // all had their own top edge shadowed by this one duct's
            // hit-box) - exactly the "hover zone too loose, swallows a
            // neighbor" bug this file has been bitten by before (the angled
            // main supply-duct runs above already learned this lesson - see
            // their own "two boxes tracing the actual bent run" comment).
            // Two thin rects, one per straight segment, hug the actual
            // drawn stroke instead.
            const dpad=pipeW/2+4;
            // Biased toward the plenum end of the run rather than sitting
            // at its midpoint - the midpoint landed close enough to the
            // dehu box's own end of the run to read as crowding the
            // ionizer's UV rod (which sits further left on the plenum,
            // near SUP_X) even though the duct itself clears it with room
            // to spare.
            const dampX=Math.max(dehuBX+BW+15,supTgtX-30);
            // Scoop (bellmouth) fitting where the supply duct's vertical
            // leg meets the plenum's top edge, per direct feedback - a
            // real HVAC fitting that flares the duct opening wider right
            // at the plenum tie-in to smooth the airflow transition and
            // cut static pressure loss, instead of the duct just butting
            // square into the plenum wall. A simple flared trapezoid,
            // same solid-fill-plus-stroke treatment as the duct pipes
            // themselves.
            const scoopW=pipeW*1.9, scoopH=11;
            const scoopD=`M${supTgtX-pipeW/2} ${SUP_PLEN_Y-scoopH} L${supTgtX-scoopW/2} ${SUP_PLEN_Y} L${supTgtX+scoopW/2} ${SUP_PLEN_Y} L${supTgtX+pipeW/2} ${SUP_PLEN_Y-scoopH} Z`;
            return <g className="snap" style={{animationDelay:'0.4s'}}>
              <path d={retD} fill="none" stroke={RC+'.16)'} strokeWidth={pipeW+6} strokeLinejoin="round" strokeLinecap="round"/>
              <path d={retD} fill="none" stroke={RC+'.4)'} strokeWidth={pipeW} strokeLinejoin="round" strokeLinecap="round"/>
              <path d={retD} fill="none" stroke={RC+'.8)'} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="3.5 2.2"/>
              {/* Two segment-hugging hit-rects (horizontal run, then the
                  vertical drop into the plenum) instead of one rect
                  spanning the whole bent path's bounding box - see dpad's
                  own comment above for why. Both still show the same
                  title/ring. */}
              <HoverInfo x={Math.min(dehuBX,retTgtX)-2} y={midY-dpad} w={Math.abs(retTgtX-dehuBX)+4} h={dpad*2} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('dehu_return_duct').title} text={T('dehu_return_duct').text}
                ringPath={retD} ringStrokeWidth={pipeW+8}/>
              <HoverInfo x={retTgtX-dpad} y={Math.min(midY,UNIT_Y)-2} w={dpad*2} h={Math.abs(UNIT_Y-midY)+4} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('dehu_return_duct').title} text={T('dehu_return_duct').text}
                ringPath={retD} ringStrokeWidth={pipeW+8}/>

              <path d={supD} fill="none" stroke={G+'.16)'} strokeWidth={pipeW+6} strokeLinejoin="round" strokeLinecap="round"/>
              <path d={supD} fill="none" stroke={G+'.3)'} strokeWidth={pipeW} strokeLinejoin="round" strokeLinecap="round"/>
              <path d={supD} fill="none" stroke={G+'.7)'} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="3.5 2.2"/>
              <path d={scoopD} fill={G+'.18)'} stroke={G+'.55)'} strokeWidth="1"/>
              {/* Backdraft damper -- a small valve body with a hinged flap,
                  sitting mid-run on the supply leg, so the blower's much
                  stronger airflow can't push air backward through the dehu
                  when it isn't running. */}
              <g transform={`translate(${dampX} ${midY})`}>
                <rect x={-8} y={-6} width={16} height={12} rx="2" fill="#151515" stroke={G+'.6)'} strokeWidth="1"/>
                <line x1={-5} y1={-4} x2={4} y2={4} stroke={G+'.8)'} strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx={-5} cy={-4} r="1" fill={G+'.85)'}/>
              </g>
              <HoverInfo x={Math.min(dehuBX+BW,supTgtX)-2} y={midY-dpad} w={Math.abs(supTgtX-dehuBX-BW)+4} h={dpad*2} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('dehu_supply_duct').title} text={T('dehu_supply_duct').text}
                ringPath={supD} ringStrokeWidth={pipeW+8}/>
              <HoverInfo x={supTgtX-dpad} y={Math.min(midY,SUP_PLEN_Y)-2} w={dpad*2} h={Math.abs(SUP_PLEN_Y-midY)+4} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('dehu_supply_duct').title} text={T('dehu_supply_duct').text}
                ringPath={supD} ringStrokeWidth={pipeW+8}/>
              <HoverInfo x={dampX-8} y={midY-6} w={16} h={12} rx={2} vw={SVG_VW} vh={SVG_VH}
                title={T('backdraft_damper').title} text={T('backdraft_damper').text}/>
            </g>;
          })()}


          {/* Air-handler (no-furnace) service disconnect - the furnace
              branch gets its own service switch below the blower (see the
              gas-line block's own comment on that swap); this is the same
              part for the no-furnace air-handler cabinet, positioned below
              ITS blower (coilW..coilW+blowerW band in AirHandlerH, i.e.
              AH_W*0.50 to AH_W*0.85 - center at 0.675). */}
          {hasCoil&&!hasFurnace&&(()=>{
            const swX=AH_X+AH_W*0.675;
            const swTopY=UNIT_Y+UNIT_H;
            // QA FIX - raised from +38 to +28 (10px up) per direct
            // feedback - the condensate drain's own crossing run (see
            // drainCrossY/drainCrossY2 above) now dips slightly lower as
            // it slopes toward the wall, and at the old offset this
            // plate's own label text sat close enough underneath it to
            // read as touching.
            const plateW=16, plateH=26, plateY=swTopY+28+plateH/2;
            return <g className="snap" style={{animationDelay:'.16s'}}>
              <line x1={swX} y1={swTopY} x2={swX} y2={plateY-plateH/2} stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
              <rect x={swX-plateW/2} y={plateY-plateH/2} width={plateW} height={plateH} rx="2"
                fill="#e8e4da" stroke="#8a8578" strokeWidth="0.8"/>
              <rect x={swX-2.6} y={plateY-8} width="5.2" height="11" rx="1.4"
                fill="#2a2a2a" stroke="#555" strokeWidth="0.5"/>
              <text x={swX} y={plateY+plateH/2+11} textAnchor="middle" fill="rgba(180,180,180,.55)" fontSize="6.5" fontFamily="monospace">{CT('SERVICE',lang)}</text>
              <text x={swX} y={plateY+plateH/2+19} textAnchor="middle" fill="rgba(180,180,180,.5)" fontSize="6.5" fontFamily="monospace">{CT('SWITCH',lang)}</text>
              <HoverInfo x={swX-plateW/2-3} y={plateY-plateH/2-3} w={plateW+6} h={plateH+22} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('service_switch').title} text={T('service_switch').text}/>
            </g>;
          })()}

          {/* Insulation label (SPRAY FOAM - SEALED ATTIC / FIBERGLASS
              INSULATION) - moved off the ridge (RIDGE_X/RIDGE_Y+24 used to
              sit right in the densest part of the insulation bubble/
              batting texture that traces the roofline itself, reading as
              barely legible against it). The two variants get different
              spots per direct feedback, matching how each is physically
              installed: spray foam seals the ROOF underside, so it sits
              above the equipment run's right side (open attic space,
              still clear of the roofline); fiberglass instead blankets
              the ATTIC FLOOR above the living space, so it sits on the
              same baseline as the LIVING SPACE watermark below, centered
              rather than left-aligned like that label. Still painted this
              late (after furnace/coil/condenser) so nothing else paints
              over it here either.

              Spray foam used to sit above the supply plenum, in the open
              triangle of attic air below the ridge - readable, but still
              "in the room" rather than genuinely out of the way. Per
              direct feedback it now runs right along the roofline itself,
              tucked under the rerouted refrigerant lineset's own diagonal
              run down to the wall (the two used to also collide back when
              this label sat above the return plenum, before the ERV moved
              into that spot - see the ERV's own call site comment), tilted
              to match the roof's own pitch so it reads as painted along
              the underside of the deck rather than floating at an angle
              against it. */}
          {a.insulation&&(()=>{
            // QA FIX - dead-centered at HOUSE_W/2, this sat directly under
            // the no-furnace air-handler's own SERVICE SWITCH column
            // (AH_W*0.675, itself roughly centered once a plenum's picked
            // and the equipment run re-centers) whenever no condenser's
            // been selected yet - HOUSE_W is still the full VW-12 width
            // then, so its own center lines up with the switch. Once a
            // tier's picked HOUSE_W shrinks to 2/3 width and the two drift
            // apart on their own, which is why this only ever showed up on
            // the pre-tier steps. The furnace branch's own switch sits at
            // FURN_W*0.15 (left side, nowhere near center) so it never had
            // this problem - only the no-furnace case needs the nudge.
            const fibX=(!hasFurnace&&!hasCond)?HOUSE_W*0.32:HOUSE_W/2;
            if(!isSpray)return <g>
              <text x={fibX} y={VH-10} textAnchor="middle" style={{pointerEvents:'none'}}
                fill="rgba(255,182,193,.6)" fontSize="12" fontFamily="monospace">{CT('FIBERGLASS INSULATION',lang)}</text>
              <HoverInfo x={fibX-70} y={VH-10-12} w={140} h={18} rx={3}
                vw={SVG_VW} vh={SVG_VH} title={T('insulation').title} text={T('insulation').text}/>
            </g>;
            // Right-descending half of the roof (ridge to the outside
            // wall) - same slope roofY's own right branch computes, used
            // here to tilt the label to match it exactly rather than
            // guessing a fixed angle.
            const roofAngleDeg=Math.atan2(EAVE_Y-RIDGE_Y,HOUSE_W-RIDGE_X)*180/Math.PI;
            // 0.6 of the way from ridge to wall - past the dehu/ERV
            // cluster on the left, short of the condenser hookup on the
            // right, above the open middle of the coil/plenum run.
            const sfX=RIDGE_X+(RL_WALL_X-RIDGE_X)*0.6;
            // QA FIX - +18 measured to the text's own BASELINE, but SVG
            // text glyphs extend upward from that baseline (this font's
            // ascender is roughly 0.8x the 12px font size, ~10px) - so the
            // glyphs' own TOP edge was only clearing the lineset's ~12px
            // foam-sleeve width by a couple px, reading as sitting right
            // on top of the pipe rather than underneath it. +34 gives the
            // glyph top real breathing room below the sleeve.
            const sfY=roofY(sfX)+RL_ROOF_GAP+34;
            // QA FIX - the invisible hit-rect below sits inside this same
            // rotated <g>, so mouse hit-testing already correctly follows
            // the tilted label. But HoverPanel (the component that draws
            // the visible gold ring on hover) renders separately, at the
            // top level of the SVG, using this box's raw x/y/w/h as a
            // plain axis-aligned rect in the OUTER, un-rotated coordinate
            // space - it never sees this <g>'s own rotate transform. That
            // drew a straight ring under a tilted label. Precomputing the
            // rectangle's own 4 corners AFTER rotation (same trig the
            // roofline/lineset paths elsewhere in this file already use)
            // and passing them as ringPath instead makes HoverPanel trace
            // the actually-tilted shape.
            const sfAngleRad=roofAngleDeg*Math.PI/180;
            const sfCos=Math.cos(sfAngleRad), sfSin=Math.sin(sfAngleRad);
            const sfHW=75, sfHH=9;
            const sfCorners=[[-sfHW,-sfHH],[sfHW,-sfHH],[sfHW,sfHH],[-sfHW,sfHH]]
              .map(([dx,dy])=>[sfX+dx*sfCos-dy*sfSin, sfY+dx*sfSin+dy*sfCos]);
            const sfRingPath=`M${sfCorners[0][0]} ${sfCorners[0][1]} L${sfCorners[1][0]} ${sfCorners[1][1]} L${sfCorners[2][0]} ${sfCorners[2][1]} L${sfCorners[3][0]} ${sfCorners[3][1]} Z`;
            return <g transform={`rotate(${roofAngleDeg} ${sfX} ${sfY})`}>
              {/* pointerEvents:none - a plain <text> is still hit-tested
                  by its own painted glyph area by default (same "wide
                  decorative shape silently swallows a hover zone
                  underneath" bug already fixed for the flue pipe/active-
                  cabinet tint elsewhere in this file - see their own
                  comments). */}
              <text x={sfX} y={sfY} textAnchor="middle" style={{pointerEvents:'none'}}
                fill="rgba(232,236,246,.6)" fontSize="12" fontFamily="monospace">{CT('SPRAY FOAM INSULATION',lang)}</text>
              {/* No EditZone covers this - free-standing hover, no onClick.
                  ringPath (see sfRingPath's own comment above) makes the
                  visible ring match the tilted label; the hit-rect itself
                  still rotates correctly via this parent <g>. */}
              <HoverInfo x={sfX-75} y={sfY-12} w={150} h={18} rx={3}
                vw={SVG_VW} vh={SVG_VH} title={T('insulation').title} text={T('insulation').text}
                ringPath={sfRingPath} ringStrokeWidth={4}/>
            </g>;
          })()}

          {/* LIVE SYSTEM PREVIEW label - moved off the eave line itself
              (used to sit at EAVE_Y-4, right where the dark roof wedge's
              own left vertex touches down, reading as faint/washed-out
              against it even before accounting for its own low 22%
              opacity) up into the clear sky band above the roof entirely,
              and bolded so it reads as an actual heading instead of a
              barely-there watermark. */}
          {loc&&<text x={12} y={20} fill={G+'.85)'} fontSize="12" fontWeight="700" fontFamily="monospace" letterSpacing=".18em">{CT('LIVE SYSTEM PREVIEW',lang)}</text>}

          {/* Empty state */}
          {!loc&&<g>
            <text x={HOUSE_W/2} y={VH/2-10} textAnchor="middle" fill={G+'.12)'} fontSize="15.5" fontFamily="monospace">{CT('Choose your location to begin building',lang)}</text>
            <text x={HOUSE_W/2} y={VH/2+8} textAnchor="middle" fill={G+'.06)'} fontSize="13" fontFamily="monospace">{CT('Components assemble here in real time →',lang)}</text>
          </g>}

          {/* ── CURRENT-STEP SPOTLIGHT - see StepFocusRing's own comment
               above for what this is and why only these steps get one. ── */}
          <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="indoor_type"
            x={(hasFurnace?FURN_X:AH_X)-4} y={UNIT_Y-2} rx={6}
            w={(hasFurnace?ACOIL_X+ACOIL_W-FURN_X:AH_W)+8} h={UNIT_H+4}/>
          <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="insulation"
            x={(hasFurnace?FURN_X:AH_X)-4} y={UNIT_Y-2} rx={6}
            w={(hasFurnace?ACOIL_X+ACOIL_W-FURN_X:AH_W)+8} h={UNIT_H+4}/>
          {/* SUP_PLEN_W is 0 before plenum is answered (see its own
              definition above) - a nominal 180 stand-in width just for
              this ghost ring, never touching the real plenum box's own
              width once it actually renders. */}
          <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="plenum"
            x={SUP_X-2} y={SUP_PLEN_Y-2} w={(SUP_PLEN_W||180)+4} h={SUP_PLEN_H+4} rx={5}/>
          {hasCond&&<StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="cond_tier"
            x={COND_X-2} y={COND_Y-2} w={COND_W+4} h={COND_H+4} rx={5}/>}
          <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="thermostat"
            x={THERM_ROW_X-2} y={THERM_TY-2} w={THERM_W+4} h={THERM_H+4}/>
          {/* APR_W is 0 only if the (effectively always-on, see hasAprilaire's
              own default) filtration cabinet is somehow off - 32 stand-in
              width matches its real one exactly, so this never looks
              different from the real cabinet's own footprint. */}
          <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="purif"
            x={APR_X-2} y={UNIT_Y-2} w={(APR_W||32)+4} h={UNIT_H+4} rx={4}/>
          {/* x mirrors DehuErvBoxes' own dehuBX formula below exactly (a
              furnace-tuned +44 offset doesn't clear the AIR HANDLER title,
              which sits centered above the cabinet unlike FURNACE's own
              title below it - see that call site's comment) so this ghost
              preview lands in the same spot the real box will. Both boxes
              target stepId="dehu" now - dehu and ERV are one merged
              multi-select step ("Want to enhance your IAQ?"), not two
              separate wizard steps. */}
          <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="dehu"
            x={hasFurnace?FURN_X+30:AH_X+AH_W-80-8} y={UNIT_Y-48-14} w={80} h={48} rx={4}/>
          <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="dehu"
            x={8} y={UNIT_Y-48-14} w={96} h={48} rx={4}/>
          {/* Single always-topmost hover tooltip - see the module comment
              on HoverCtx/HoverInfo for why this has to be the very last
              thing painted in the whole <svg> rather than living next to
              whichever hit-rect triggered it. */}
          {hoverPart&&<HoverPanel part={hoverPart} groupBoxes={groupBoxes}/>}
        </svg>
      </div>
      </GroupCtx.Provider>
      </HoverCtx.Provider>
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
    // Flue's own exit point (top of the furnace HX section, left half of
    // furnace) - hoisted out here, not just declared inside the routed
    // flue's own IIFE further down, so the FURNACE label rendered right
    // after it can also reference this same X and keep clear of the
    // elbow that turns right there (see that label's own QA FIX comment).
    const flueExitX=UNIT_X+UNIT_W*0.38;
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
    // Same shared ring PATH idea as the attic layout's own linesetRingPath -
    // see its comment there.
    const linesetRingPath=
      `M${UNIT_X+UNIT_W} ${(LS_Y1+LS_Y2)/2} L${EXT_WALL_X+9} ${(LS_Y1+LS_Y2)/2} `+
      `L${EXT_WALL_X+9} ${COND_Y+COND_H*0.82} L${COND_X} ${COND_Y+COND_H*0.82}`;

    // Dehu/ERV roofline row - hoisted once so the row itself, the dehu's
    // own dedicated duct stubs, and the StepFocusRing highlight all agree
    // on the same box geometry, instead of three independent inline
    // copies of the same formula (a QA pass found exactly that drift risk
    // here). Also where dehuX/ervX/ervW clear the main supply ducts' own
    // drop columns (leftDropX/rightDropX, mirrored from the upflow-ducts
    // block below) - at typical frame widths the old flat 24px/34px wall
    // margins landed the dehu box's left edge touching (sometimes
    // overlapping) the right supply duct's register grille, and the ERV
    // box - boxed in between the canvas edge and the left supply duct,
    // with nowhere to shift to - overlapped it by a real, visible amount.
    // Same "narrow the box to fit whatever room is actually left" fix
    // already used by the attic layout's own ERV (see its ervW comment).
    const DEHU_ERV_RW=hasCond?HOUSE_W:VW-8;
    const DEHU_ERV_RRISE=Math.round(Math.min(DEHU_ERV_RW/2*(3/12),60));
    const DEHU_ERV_REAVE=DEHU_ERV_RRISE+12;
    const DEHU_ERV_BY=DEHU_ERV_REAVE+42;
    // -12 pokes the ERV's roof stub 12px above the roofline, matching the
    // flue's own convention (see its comment) - the old +4 put it 4px
    // below/inside instead. No lineset-avoidance conflict here (unlike
    // the attic layout's ERV) since the closet's refrigerant line stubs
    // run at a fixed height tied to ACOIL_Y, nowhere near this roofline.
    const DEHU_ERV_ROOFY=DEHU_ERV_REAVE-12;
    const DEHU_ERV_BH=48;
    const DEHU_ERV_BW=80;
    // Main supply ducts' own drop columns + register-grille half-width
    // (mirrors leftDropX/rightDropX/DW/GW in the upflow-ducts block
    // below - duplicated as plain numbers rather than hoisting THAT
    // block's own consts, since they're simple, fixed offsets off
    // UNIT_X/PLEN_W already available up here).
    const MD_DW=13, MD_GRILLE_HALF=(13+10)/2;
    const MD_LEFT_X=UNIT_X-120, MD_RIGHT_X=UNIT_X+PLEN_W+120;
    const DEHU_ERV_CLEAR=12; // real breathing room past the duct/grille edge, not just "not literally touching"
    const ervSafeRight=MD_LEFT_X+MD_DW/2-MD_GRILLE_HALF-DEHU_ERV_CLEAR;
    const dehuSafeLeft=MD_RIGHT_X+MD_DW/2+MD_GRILLE_HALF+DEHU_ERV_CLEAR;
    const ervX=24; // ERV slightly right of the canvas edge
    // 30 is a last-resort sanity floor (keeps the box from collapsing to
    // zero/negative width on a pathologically narrow frame), not a design
    // target - unlike the attic ERV's 52px floor, honoring a bigger floor
    // here would just force the box back into the duct it's trying to
    // clear.
    const ervW=Math.max(30,Math.min(DEHU_ERV_BW,ervSafeRight-ervX));
    const dehuRightMax=DEHU_ERV_RW-10; // stay clear of the exterior wall
    const dehuW=Math.max(30,Math.min(DEHU_ERV_BW,dehuRightMax-dehuSafeLeft));
    const dehuX=Math.max(dehuSafeLeft,dehuRightMax-dehuW);

    return(
      <HoverCtx.Provider value={setHoverPart}>
      <GroupCtx.Provider value={groupApi}>
      <div ref={wrapRef} style={{position:'absolute',inset:0}}>
        {hasCoil&&<ToggleUI style={{position:'absolute',top:8,right:8,zIndex:10}} compactToggle={compactToggle} isDualFuel={isDualFuel} hasFurnace={hasFurnace} heatMode={heatMode} heatSubMode={heatSubMode} setHeatMode={setHeatMode} setHeatSubMode={setHeatSubMode} monthName={CURRENT_MONTH_NAME} lang={lang}/>}
        <svg viewBox={`0 0 ${VW} ${VH}`} className="canvas-svg" aria-hidden="true">
          <rect x="0" y="0" width={VW} height={VH} fill="#0b0d14"/>
          {/* Outside zone - brightest sunny, dimmer overcast, darkest cold,
              same as the attic layout's outside zone (OUTSIDE_* above). */}
          {hasCond&&<rect x={HOUSE_W} y="0" width={VW-HOUSE_W} height={VH}
            style={{fill:outsideFill,transition:'fill 2.5s ease'}}/>}
          {/* Full attic space above deck - subtly tinted by mode, see intFill above. */}
          <rect x="0" y="0" width={hasCond?HOUSE_W:VW} height={DECK_Y}
            style={{fill:intFill('attic'),transition:'fill 2.5s ease'}}/>
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
            style={{fill:outsideFill,transition:'fill 2.5s ease'}}/>}
          {/* Closet below deck */}
          <rect x={UNIT_X-28} y={DECK_Y} width={UNIT_W+56} height={VH-DECK_Y}
            style={{fill:intFill('closet'),transition:'fill 2.5s ease'}} stroke={W+'.05)'} strokeWidth="1.4"/>
          <rect x={UNIT_X-28} y={DECK_Y} width="4" height={VH-DECK_Y} fill="#0d0d0d"/>
          <rect x={UNIT_X+UNIT_W+28} y={DECK_Y} width="4" height={VH-DECK_Y} fill="#0d0d0d"/>
          <text x={UNIT_X+UNIT_W/2} y={DECK_Y+14} textAnchor="middle"
            fill={W+'.1)'} fontSize="12" fontFamily="monospace" letterSpacing="1.5">{CT('UTILITY CLOSET',lang)}</text>

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

          {/* Insulation - spray on ROOF UNDERSIDE, fiberglass on ATTIC FLOOR,
              only when selected. Purely decorative texture, wrapped in
              pointer-events:none - the attic layout's own equivalent
              fiberglass texture was found (via a hover sweep) silently
              swallowing part of the return grille's hover zone where its
              band overlapped it; fixed defensively here too since this is
              the same texture painted near the same deck-line hover zones. */}
          {a.insulation&&(isSpray
            ?<g style={{pointerEvents:'none'}}>
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
                  <text x="22" y={DECK_Y-24} fill="rgba(232,236,246,.3)" fontSize="12" fontFamily="monospace">{CT('SPRAY FOAM',lang)}</text>
                </>;
              })()}
            </g>
            :<g style={{pointerEvents:'none'}}>
              {Array.from({length:Math.floor((hasCond?HOUSE_W:VW-8)/17)},(_,i)=>(
                <ellipse key={i} cx={8+i*17} cy={DECK_Y-8} rx={11} ry={7}
                  fill="rgba(255,182,193,.15)" stroke="rgba(255,182,193,.19)" strokeWidth=".4"/>
              ))}
              <text x="22" y={DECK_Y-22} fill="rgba(255,182,193,.3)" fontSize="12" fontFamily="monospace">{CT('FIBERGLASS INSULATION',lang)}</text>
            </g>
          )}
          {/* No EditZone covers this - free-standing hover, no onClick.
              One shared box covers either label, whichever is showing. */}
          {a.insulation&&<HoverInfo x={16} y={DECK_Y-40} w={150} h={22} rx={3}
            vw={SVG_VW} vh={SVG_VH} title={T('insulation').title} text={T('insulation').text}/>}

          {/* Attic deck line */}
          <rect x="0" y={DECK_Y} width={hasCond?HOUSE_W:VW-8} height="5"
            fill="#141416" stroke="rgba(186,182,166,.08)" strokeWidth="0.4"/>
          {/* Ceiling joists */}
          {Array.from({length:Math.floor((hasCond?HOUSE_W:VW-8)/68)},(_,i)=>(
            <rect key={i} x={38+i*68} y={DECK_Y-2} width="10" height="7" rx="1"
              fill="rgba(90,68,32,.2)" stroke="rgba(108,82,36,.12)" strokeWidth="0.4"/>
          ))}
          <text x="22" y="16" fill={W+'.14)'} fontSize="12" fontFamily="monospace" letterSpacing="0.8">{CT('ATTIC',lang)}</text>



          {/* ── SUPPLY PLENUM - crosses deck, extends into attic ── */}
          {hasPlenum&&hasCoil&&<g className="snap" key="spl">
            {(()=>{
              const isExisting=a.plenum==='none';
              const isMetal=a.plenum==='metal';
              // isExisting's fill used to be genuinely translucent (a .6-alpha
              // color, THEN a .7 opacity on top of that - the two compound to
              // ~.42 effective alpha) to read as "lighter/older material" next
              // to the solid ductboard/metal boxes. But this box sits directly
              // over the closet's own "UTILITY CLOSET" title text (painted
              // earlier, up at the deck line) - opaque enough on the other two
              // materials to fully hide it, that ~.42 alpha let it ghost
              // through right behind the plenum's own "EXISTING PLENUM"/
              // "SUPPLY" labels, two unrelated pieces of text visually
              // colliding in the same box. Solid-but-still-visually-distinct
              // (dashed border + its own lighter-navy tone, no material
              // texture) reads as "existing" just as well without the actual
              // see-through.
              const pFill=isExisting?"rgba(30,30,44,.97)":isMetal?"#1a1c24":"#141108";
              const pStroke=isExisting?(G+'.22)'):(G+(isMetal?'.74)':'.5)'));
              return <>
                <rect x={UNIT_X} y={PLEN_TOP} width={PLEN_W} height={PLEN_TOTAL} rx="3"
                  fill={pFill} stroke={pStroke} strokeWidth={isExisting?1:isMetal?1.7:1.4}
                  strokeDasharray={isExisting?"6 3":undefined}/>
                {/* Warm/cold air pulse - same idea as the refrigerant line pulse, orange for heat, blue for cool.
                    Thick + glowing so it reads clearly against the plenum's own static material border underneath. */}
                <rect x={UNIT_X-2} y={PLEN_TOP-2} width={PLEN_W+4} height={PLEN_TOTAL+4} rx="4"
                  fill="none" stroke={heatMode?"#f97316":"#2389e0"} strokeWidth="4" filter="url(#glow-sm)" className="line-pulse"/>
                {/* Same material treatment (folded metal flanges / taped
                    foil-faced board seams) as the attic layout's supply
                    plenum - previously ductboard got no interior texture
                    at all here, only the metal branch did. */}
                {!isExisting&&<PlenumMaterial x={UNIT_X} y={PLEN_TOP} w={PLEN_W} h={PLEN_TOTAL} isMetal={isMetal}/>}
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
                  {isExisting?CT('EXISTING PLENUM',lang):isMetal?CT('METAL PLENUM',lang):CT('DUCTBOARD PLENUM',lang)}
                </text>
                {/* Supply-air temp - same mode-dependent reading as the
                    attic layout's own supply plenum. Shares this label's
                    own x-center (50% width) but the two flow arrows below
                    sit at 28%/68% width, so there's no collision. */}
                <text className="phase-color" x={UNIT_X+PLEN_W/2} y={PLEN_TOP+PLEN_TOTAL*0.38+18} textAnchor="middle"
                  fill={heatMode?'#f97316':'#2389e0'} fontSize="13" fontWeight="700" fontFamily="monospace">
                  {supplyTemp}°
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
                      fill={G+'.3)'} fontSize={lang==='es'?"9":"12"} fontFamily="monospace">{CT('SUPPLY',lang)}</text>
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
                    <text x={bulbX+18} y={rodY+4} textAnchor="start" fill="rgba(253,224,71,.45)" fontSize="11" fontFamily="monospace">{CT('IONIZER',lang)}</text>
                  </g>;
                })()}
              </>;
            })()}
          </g>}

          {hasPlenum&&hasCoil&&<EditZone stepId="plenum" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
            x={UNIT_X-2} y={PLEN_TOP-2} w={PLEN_W+4} h={PLEN_TOTAL+4} rx={5}/>}
          {/* Same box as the EditZone just above - see the attic layout's
              own supply-plenum hover call site for why the onClick here
              forwards to onEditStep('plenum') instead of doing nothing. */}
          {hasPlenum&&hasCoil&&<HoverInfo x={UNIT_X-2} y={PLEN_TOP-2} w={PLEN_W+4} h={PLEN_TOTAL+4} rx={5}
            vw={SVG_VW} vh={SVG_VH} title={T('supply_plenum').title} text={T('supply_plenum').text}
            onClick={onEditStep?()=>onEditStep('plenum'):undefined}/>}

          {/* QA FIX - the ionizer's rod runs almost the full width of the
              plenum at 88% of its height (rodY), so its whole hit-box used
              to sit entirely INSIDE the plenum's own box above - painted
              after it, the plenum won every hover there, leaving only a
              sliver of the ionizer genuinely hoverable (and its "IONIZER"
              label, starting 2px past the old box's own right edge, wasn't
              covered at all). Moved here (after the plenum's hover, same
              fix as the attic layout's equivalent block) and widened to
              the label's real width so it reliably reads IONIZER along its
              whole rod + bulb + label, not just a thin strip of it. */}
          {hasIonizer&&(()=>{
            const rodLen=Math.round(PLEN_W*0.62);
            const bulbX=UNIT_X+PLEN_W+12;
            const rodY=PLEN_TOP+PLEN_TOTAL*0.88;
            const rodTip=UNIT_X+PLEN_W-rodLen;
            return <HoverInfo x={rodTip-4} y={rodY-16} w={bulbX+58-rodTip} h={32} rx={3}
              vw={SVG_VW} vh={SVG_VH} title={T('ionizer').title} text={T('ionizer').text}/>;
          })()}

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
              // pathLength normalizes stroke-dasharray to a 0-100 scale
              // regardless of the path's real pixel length - without it,
              // the fixed-pixel "10 6" dash pattern from .airflow's own
              // CSS tiles a different number of times across a short
              // straight drop vs a longer angled run, so a shorter duct
              // visibly shows fewer dash segments (reads as "dimmer") even
              // though all of them share identical color/opacity/speed.
              // The inline strokeDasharray here (in the same normalized
              // 0-100 space pathLength sets up) overrides .airflow's own
              // pixel-based dasharray - inline style wins over a
              // stylesheet class for any property the class doesn't
              // itself animate - while .airflow's animated dashoffset
              // keyframe still drives the actual motion.
              // Same strokeLinejoin="round" fix as the attic layout's own
              // ductArrow - see its comment for why an angled duct's real
              // bend needs this and a straight one doesn't.
              const ductArrow=(d,key)=>(
                <path key={key} d={d} pathLength="100" fill="none" stroke={(heatMode?O:B)+'.85)'} strokeWidth="1.6"
                  strokeLinejoin="round" className="airflow" style={{strokeDashoffset:0,strokeDasharray:'16 10'}} markerEnd="url(#arr)"/>
              );
              // Vertical drop goes from exitY down to DECK_Y. Flex-duct
              // corrugation (DuctRibbing/DuctClamp - see the attic
              // layout's own supply drops for the full reasoning) applied
              // to both the horizontal and vertical legs of each run, so
              // this layout's ductwork reads as the identical real
              // material instead of the two layouts drifting apart.
              return <>
                {/* ── LEFT DUCT ── */}
                {/* Horizontal run from plenum left face outward */}
                <rect x={leftDropX} y={exitY} width={UNIT_X-leftDropX} height={DW} fill={DC} stroke={DS} strokeWidth="1"/>
                <DuctRibbing x={leftDropX} y={exitY} w={UNIT_X-leftDropX} h={DW} vertical={false}/>
                {/* Vertical drop from horizontal run down to deck */}
                <rect x={leftDropX} y={exitY} width={DW} height={DECK_Y-exitY} fill={DC} stroke={DS} strokeWidth="1"/>
                <DuctRibbing x={leftDropX} y={exitY} w={DW} h={DECK_Y-exitY} vertical/>
                <DuctClamp x={UNIT_X-DW-3} y={exitY} h={DW} vertical={false}/>
                <DuctClamp x={leftDropX} y={DECK_Y-5} w={DW} vertical/>
                {ductArrow(`M${UNIT_X-3},${exitY+DW/2} L${leftDropX+DW/2},${exitY+DW/2} L${leftDropX+DW/2},${DECK_Y-4}`,'la')}
                {/* No EditZone covers duct geometry - free-standing hover,
                    no onClick. Two boxes tracing the actual bent run
                    (horizontal leg off the plenum, then the vertical drop)
                    same as the attic layout's own angled duct hover, rather
                    than one rect spanning the whole L that would swallow
                    the plenum/unit sitting beside it. Painted before the
                    grille below so its own more specific hover wins the
                    small overlap near the deck line. Both share the same
                    ringPath (this run's own centerline, same `d` the
                    ductArrow above already traces) so the ring reads as
                    one traced line the same way the attic layout's angled
                    duct/lineset rings do, instead of a plain rect box -
                    keeps every supply duct in both layouts visually
                    consistent with each other. */}
                <HoverInfo x={leftDropX-2} y={exitY-2} w={UNIT_X-leftDropX+2} h={DW+4} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('supply_duct').title} text={T('supply_duct').text} group="supply_duct"
                  ringPath={`M${UNIT_X-3} ${exitY+DW/2} L${leftDropX+DW/2} ${exitY+DW/2} L${leftDropX+DW/2} ${DECK_Y-4}`} ringStrokeWidth={DW+8}/>
                <HoverInfo x={leftDropX-2} y={exitY} w={DW+4} h={DECK_Y-exitY} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('supply_duct').title} text={T('supply_duct').text} group="supply_duct"
                  ringPath={`M${UNIT_X-3} ${exitY+DW/2} L${leftDropX+DW/2} ${exitY+DW/2} L${leftDropX+DW/2} ${DECK_Y-4}`} ringStrokeWidth={DW+8}/>
                {/* Balancing damper - low-profile, hover-only easter egg
                    (see the attic layout's own straight-duct comment for
                    the full reasoning) - right on the existing clamp
                    collar at the plenum face, painted after both general
                    duct hovers above so it wins this small strip. */}
                <HoverInfo x={UNIT_X-DW-3-2} y={exitY-3} w={10} h={DW+6} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('balancing_damper').title} text={T('balancing_damper').text}/>
                <RegisterGrille cx={leftDropX+DW/2} y={DECK_Y} w={GW} dc={DC} ds={DS} label={CT('SUPPLY',lang)} lang={lang} vw={SVG_VW} vh={SVG_VH}/>

                {/* ── RIGHT DUCT ── */}
                {/* Horizontal run from plenum right face outward */}
                <rect x={UNIT_X+PLEN_W} y={exitY} width={rightDropX-(UNIT_X+PLEN_W)+DW} height={DW} fill={DC} stroke={DS} strokeWidth="1"/>
                <DuctRibbing x={UNIT_X+PLEN_W} y={exitY} w={rightDropX-(UNIT_X+PLEN_W)+DW} h={DW} vertical={false}/>
                {/* Vertical drop down to deck */}
                <rect x={rightDropX} y={exitY} width={DW} height={DECK_Y-exitY} fill={DC} stroke={DS} strokeWidth="1"/>
                <DuctRibbing x={rightDropX} y={exitY} w={DW} h={DECK_Y-exitY} vertical/>
                <DuctClamp x={UNIT_X+PLEN_W+3} y={exitY} h={DW} vertical={false}/>
                <DuctClamp x={rightDropX} y={DECK_Y-5} w={DW} vertical/>
                {ductArrow(`M${UNIT_X+PLEN_W+3},${exitY+DW/2} L${rightDropX+DW/2},${exitY+DW/2} L${rightDropX+DW/2},${DECK_Y-4}`,'ra')}
                <HoverInfo x={UNIT_X+PLEN_W} y={exitY-2} w={rightDropX-(UNIT_X+PLEN_W)+DW+2} h={DW+4} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('supply_duct').title} text={T('supply_duct').text} group="supply_duct"
                  ringPath={`M${UNIT_X+PLEN_W+3} ${exitY+DW/2} L${rightDropX+DW/2} ${exitY+DW/2} L${rightDropX+DW/2} ${DECK_Y-4}`} ringStrokeWidth={DW+8}/>
                <HoverInfo x={rightDropX-2} y={exitY} w={DW+4} h={DECK_Y-exitY} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('supply_duct').title} text={T('supply_duct').text} group="supply_duct"
                  ringPath={`M${UNIT_X+PLEN_W+3} ${exitY+DW/2} L${rightDropX+DW/2} ${exitY+DW/2} L${rightDropX+DW/2} ${DECK_Y-4}`} ringStrokeWidth={DW+8}/>
                {/* Balancing damper - same low-profile, hover-only easter
                    egg as the left duct's own (see that one's comment). */}
                <HoverInfo x={UNIT_X+PLEN_W+3-2} y={exitY-3} w={10} h={DW+6} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('balancing_damper').title} text={T('balancing_damper').text}/>
                <RegisterGrille cx={rightDropX+DW/2} y={DECK_Y} w={GW} dc={DC} ds={DS} label={CT('SUPPLY',lang)} lang={lang} vw={SVG_VW} vh={SVG_VH}/>
              </>;
            })()}
          </g>}

          {/* A-coil / AH */}
          {hasCoil&&<g className="snap" key={'ac-c'+a.cond_tier} style={{animationDelay:'.07s'}}>
            {(()=>{
              const active=evapActive;
              return <>
                {/* General cabinet hover - painted first/bottommost, same
                    "specific ones painted after win their own smaller
                    area" reasoning used throughout this file. ACoilV
                    (furnace-paired) and BlowerWheel (standalone AH) each
                    add their own more specific hover internally. */}
                <HoverInfo x={UNIT_X} y={ACOIL_Y} w={UNIT_W} h={ACOIL_H} rx={5} vw={SVG_VW} vh={SVG_VH}
                  title={T(hasFurnace?acoilInfoKey():'air_handler_cabinet').title}
                  text={T(hasFurnace?acoilInfoKey():'air_handler_cabinet').text}
                  onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
                {/* Exterior housing stays silver in both states - see the
                    comment on FurnaceH's border/strip above. */}
                <rect x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={ACOIL_H} rx="5"
                  fill={active?"#050c1c":"#090909"}
                  stroke="url(#cabinet-edge)" strokeOpacity="0.8" strokeWidth="1.5"/>
                {/* Faint active-state tint - see FurnaceH's own comment
                    on the identical pattern for why this needs
                    pointer-events:none. */}
                {active&&<rect className="phase-color" x={UNIT_X} y={ACOIL_Y} width={UNIT_W} height={ACOIL_H} rx="5"
                  fill={refReversed?O+'.03)':'rgba(35,137,224,.03)'} stroke="none" style={{pointerEvents:'none'}}/>}
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
                  ?<ACoilV x={UNIT_X+8} y={COIL_BOX_Y} w={UNIT_W-16} h={COIL_BOX_H} active={active}
                      evapC={evapC} evapC2={evapC2} hasUV={hasUV} infoKey={acoilInfoKey()}
                      onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>
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
                    <AuxHeatKit x={UNIT_X+14} y={ACOIL_Y+ACOIL_H*0.09} w={UNIT_W-28} h={ACOIL_H*0.14} auxHeat={auxHeatActive} lang={lang}/>
                    <BlowerWheel cx={UNIT_X+UNIT_W/2} cy={ACOIL_Y+ACOIL_H*0.33}
                      r={Math.min(UNIT_W*0.24,ACOIL_H*0.105)}
                      spd={blowerActive?1.4:0.4} active={blowerActive}
                      onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>
                    <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y+ACOIL_H*0.465} textAnchor="middle"
                      fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">{CT('BLOWER',lang)}</text>
                    <text x={UNIT_X+UNIT_W/2} y={ACOIL_Y+ACOIL_H*0.50} textAnchor="middle"
                      fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
                    <ACoilV x={UNIT_X+8} y={COIL_BOX_Y} w={UNIT_W-16} h={COIL_BOX_H} active={active}
                      evapC={evapC} evapC2={evapC2} hasUV={hasUV} infoKey={acoilInfoKey()}
                      onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>
                  </>
                }
                {hasCond&&!hasFurnace&&<>
                  <path className="draw phase-color" d={`M${UNIT_X+UNIT_W} ${LS_Y1} L${UNIT_X+UNIT_W+28} ${LS_Y1}`}
                    fill="none" stroke={active?evapC:'rgba(32,32,52,.5)'} strokeWidth="2.8" strokeLinecap="round"/>
                  <path className="draw phase-color" d={`M${UNIT_X+UNIT_W} ${LS_Y2} L${UNIT_X+UNIT_W+28} ${LS_Y2}`}
                    fill="none" stroke={active?evapC2:'rgba(32,32,52,.4)'} strokeWidth="2.8" strokeLinecap="round" style={{animationDelay:'.08s'}}/>
                  {active&&<text className="phase-color" x={UNIT_X+UNIT_W+14} y={LS_Y1-8}
                    textAnchor="middle" fill={evapC} fontSize="13" fontFamily="monospace">
                    {refReversed?'←':'→'}
                  </text>}
                </>}
                <text className="phase-color" x={UNIT_X+UNIT_W/2} y={ACOIL_Y-6} textAnchor="middle"
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
                <text className="phase-color" x={UNIT_X+UNIT_W/2} y={hasFurnace?(ACOIL_Y+ACOIL_H+APR_H+27):(ACOIL_Y+20)} textAnchor="middle"
                  fill={active?(refReversed?'rgba(239,68,68,.5)':'rgba(35,137,224,.46)'):(auxHeatActive?'rgba(249,115,22,.65)':'rgba(255,255,255,.14)')} fontSize="12" fontFamily="monospace">
                  {active?(refReversed?CT('REJECTING HEAT',lang):CT('ABSORBING HEAT',lang)):(auxHeatActive?CT('AUX HEAT ONLY',lang):CT('STANDBY',lang))}
                </text>
              </>;
            })()}
          </g>}

          {/* Furnace - HX top | blower bottom */}
          {hasCoil&&hasFurnace&&<g className="snap" key={'fu-c'+a.stage}>
            {/* General cabinet hover - painted first/bottommost, same
                "specific ones painted after win their own smaller area"
                reasoning as the attic layout's FurnaceH. BlowerWheel adds
                its own hover internally for the bottom half. */}
            <HoverInfo x={UNIT_X} y={FURN_Y} w={UNIT_W} h={FURN_H} rx={5} vw={SVG_VW} vh={SVG_VH}
              title={T('furnace_cabinet').title} text={T('furnace_cabinet').text}
              onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
            {/* Exterior housing stays silver in both states - see the
                comment on FurnaceH's border/strip above. */}
            <rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={FURN_H} rx="5"
              fill={furnaceActive?"#0e0606":"#090909"}
              stroke="url(#cabinet-edge)" strokeOpacity="0.85" strokeWidth="1.7"/>
            {/* Faint active-state tint - see FurnaceH's own comment on
                the identical pattern for why this needs
                pointer-events:none. */}
            {furnaceActive&&<rect x={UNIT_X} y={FURN_Y} width={UNIT_W} height={FURN_H} rx="5"
              fill={O+'.04)'} stroke="none" style={{pointerEvents:'none'}}/>}
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
              <text x={UNIT_X+9} y={FURN_Y+19.5} fill="#fff" fontSize="9" fontFamily="monospace">{CT('COMMUNICATING',lang)}</text></>}
            <rect x={UNIT_X+UNIT_W-46} y={FURN_Y+11} width={40} height="9" rx="2"
              fill={is90?"rgba(35,137,224,.13)":(G+'.07)')} stroke={is90?(B+'.24)'):(G+'.16)')} strokeWidth="0.5"/>
            <text x={UNIT_X+UNIT_W-26} y={FURN_Y+18} textAnchor="middle" fill={is90?"#5ba8f5":(G+'.6)')} fontSize="9.5" fontFamily="monospace">{is90?'90%':'80%'} AFUE</text>
            <HoverInfo x={UNIT_X+UNIT_W-48} y={FURN_Y+9} w={44} h={13} rx={2} vw={SVG_VW} vh={SVG_VH}
              title={T('afue_badge').title} text={T('afue_badge').text}
              onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
            <line x1={UNIT_X} y1={FURN_Y+FURN_H/2} x2={UNIT_X+UNIT_W} y2={FURN_Y+FURN_H/2}
              stroke={S+'.28)'} strokeWidth="0.9" strokeDasharray="4 3"/>
            <HoverInfo x={UNIT_X} y={FURN_Y} w={UNIT_W} h={FURN_H/2} vw={SVG_VW} vh={SVG_VH}
              title={T('heat_exchanger').title} text={T('heat_exchanger').text}
              onClick={onEditStep?()=>onEditStep('indoor_type'):undefined}/>
            {/* TOP: HX - same clamshell-tube highlight/end-cap treatment
                as the attic FurnaceH's own HX cells, so both layouts'
                furnaces read as the identical hardware. */}
            {Array.from({length:5},(_,i)=>{
              const gy=FURN_Y+12+i*((FURN_H/2-20)/5), gyTop=FURN_Y+6+i*((FURN_H/2-20)/5);
              const d=`M${UNIT_X+8} ${gy} Q${UNIT_X+UNIT_W/2} ${gyTop} ${UNIT_X+UNIT_W-8} ${gy}`;
              return <g key={i}>
                <path d={d} fill="none" stroke={furnaceActive?'rgba(249,115,22,.56)':'rgba(108,44,8,.18)'} strokeWidth="2.6" strokeLinecap="round"/>
                <path d={d} fill="none" stroke={furnaceActive?'rgba(255,205,150,.42)':'rgba(180,140,90,.12)'} strokeWidth="0.75" strokeLinecap="round" transform="translate(0,-0.85)"/>
                <circle cx={UNIT_X+8} cy={gy} r="1.6" fill={furnaceActive?'rgba(249,115,22,.5)':'rgba(80,40,10,.35)'} stroke={furnaceActive?'rgba(255,205,150,.35)':'rgba(150,100,60,.22)'} strokeWidth="0.4"/>
                <circle cx={UNIT_X+UNIT_W-8} cy={gy} r="1.6" fill={furnaceActive?'rgba(249,115,22,.5)':'rgba(80,40,10,.35)'} stroke={furnaceActive?'rgba(255,205,150,.35)':'rgba(150,100,60,.22)'} strokeWidth="0.4"/>
              </g>;
            })}
            <rect x={UNIT_X+6} y={FURN_Y+FURN_H/2-13} width={UNIT_W-12} height={10} rx="2"
              fill={furnaceActive?O+'.07)':'rgba(5,5,13,.8)'}
              stroke={furnaceActive?'rgba(249,115,22,.42)':(S+'.2)')} strokeWidth="0.6"/>
            {furnaceActive&&Array.from({length:4},(_,i)=>(
              <ellipse key={i} cx={UNIT_X+14+i*((UNIT_W-14)/4)} cy={FURN_Y+FURN_H/2-13}
                rx={(UNIT_W-14)/10} ry={5}
                fill={O+'.55)'} className="glow-pulse" style={{animationDelay:i*0.12+'s'}}/>
            ))}
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H/4+6} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.75)':(S+'.6)')} fontSize="12.5" fontFamily="monospace">{CT('HEAT EXCH.',lang)}</text>
            {/* GAS HEATING ACTIVE / STANDBY status line - the attic
                layout's FurnaceH has always shown this under its FURNACE
                label; this closet furnace never did, so a straight-cool or
                dual-fuel-furnace-submode customer here got a "FURNACE"
                title that turns orange but no actual text confirming gas
                heat is on, unlike the attic diagram for the identical
                system. There's clear room for it in the gap between this
                HX label and the gas-manifold glow box below (FURN_H is
                ~257px at this SCALE, plenty for both), so it lands here
                instead of by the "FURNACE" title above the cabinet, which
                the label's own comment already flags as too tight to
                widen. */}
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H/4+20} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.44)':'rgba(255,255,255,.15)'} fontSize="9.5" fontFamily="monospace">
              {furnaceActive?CT('GAS HEATING ACTIVE',lang):CT('STANDBY',lang)}
            </text>
            {/* BOTTOM: blower */}
            <BlowerWheel cx={UNIT_X+UNIT_W/2} cy={FURN_Y+FURN_H*0.70}
              r={Math.min(UNIT_W*0.32,FURN_H*0.155)}
              spd={blowerActive?1.55:0.5} active={blowerActive}
              onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H-15} textAnchor="middle"
              fill={S+'.65)'} fontSize="12.5" fontFamily="monospace">{CT('BLOWER',lang)}</text>
            <text x={UNIT_X+UNIT_W/2} y={FURN_Y+FURN_H-6} textAnchor="middle"
              fill={S+'.5)'} fontSize="9.5" fontFamily="monospace">{BLOWER_MOTOR}</text>
            {/* Flue - 45° elbow routing:
                exits top of furnace → 45° elbow left → horizontal run → 45° elbow up → vertical through roof */}
            {(()=>{
              const PIPE_W=is90?5:7;
              const PIPE_C=is90?"#bfdbfe":"#c0c0c0";
              const PIPE_S=is90?"#93c5fd":"#999";
              // Exit point: top of furnace HX section (left half of furnace)
              const EXIT_X=flueExitX;
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
                // -12 pokes the pipe's top 12px ABOVE the true roof
                // surface (matching the attic layout's own flue) - the
                // old +14 put it 14px BELOW the roofline instead, reading
                // as if the vent terminated inside the attic rather than
                // poking through the roof at all.
                return roofYAtX-12;
              })();
              const ELBOW_R=8; // elbow radius
              // Purely decorative (no hover/click of its own), and unlike
              // the attic layout's straight-up flue, this one is ROUTED
              // sideways past the unit before turning up - the horizontal
              // run crosses directly over the LEFT supply duct's own
              // horizontal-leg HoverInfo box (both sit in the same x/y
              // band to the left of the unit). Confirmed via
              // elementsFromPoint that this pipe's opaque rect was the
              // topmost element at that duct hover's own center point,
              // silently swallowing it - the same "decorative shape
              // painted on top of a HoverInfo zone" bug already fixed for
              // the airflow/pulse animation classes in styles.css, found
              // again here during a QA pass since this routed flue has no
              // CSS class of its own to hang that fix on. Wrapping the
              // whole routed run in pointer-events:none (matching the
              // established fix for the three raw glow-duplicate <path>
              // pairs elsewhere in this file) lets the duct hover
              // underneath it work everywhere in its own box again.
              const stubD=`M${EXIT_X} ${EXIT_Y} L${EXIT_X} ${ELB1_Y+ELBOW_R}`;
              const riserD=`M${HORIZ_X} ${TOP_Y} L${HORIZ_X} ${ELB2_Y-ELBOW_R-PIPE_W}`;
              return <>
                <g style={{pointerEvents:'none'}}>
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
                    {is90?CT('PVC',lang):CT('B-VENT',lang)}
                  </text>
                </g>
                {/* Flue hover - only the two vertical segments (stub near
                    the furnace, riser through the roof). The horizontal
                    run in between stays pointer-events:none since it
                    crosses directly over the left supply duct's own hover
                    zone (see this block's own comment above). */}
                <HoverInfo x={EXIT_X-PIPE_W/2-4} y={ELB1_Y+ELBOW_R-2} w={PIPE_W+8} h={EXIT_Y-ELB1_Y-ELBOW_R+4} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('flue_pipe').title} text={T('flue_pipe').text}
                  ringPath={stubD} ringStrokeWidth={PIPE_W+6}/>
                <HoverInfo x={HORIZ_X-PIPE_W/2-4} y={TOP_Y-2} w={PIPE_W+8} h={ELB2_Y-ELBOW_R-PIPE_W-TOP_Y+4} rx={2}
                  vw={SVG_VW} vh={SVG_VH} title={T('flue_pipe').title} text={T('flue_pipe').text}
                  ringPath={riserD} ringStrokeWidth={PIPE_W+6}/>
              </>;
            })()}
            {isComm&&<><rect x={UNIT_X+4} y={FURN_Y+10} width={82} height="11" rx="2" fill="url(#blue)"/><text x={UNIT_X+7} y={FURN_Y+18.5} fill="#fff" fontSize="9.5" fontFamily="monospace">{CT('COMMUNICATING',lang)}</text></>}
            {/* Kept at the original 9.5px, unlike its sibling "FURNACE"
                label in the attic layout - enlarging it widens the overlap
                below.
                QA FIX - this label used to sit dead-centered regardless,
                which put its left edge almost exactly under the flue's
                elbow (flueExitX, ~8px radius) whenever the unit was narrow
                enough for the two to collide, and the pipe's stroke won
                the pixel - the "F" of "FURNACE" reading as clipped/missing.
                Since this label (unlike the flue's own exit, anchored to
                the furnace's real HX geometry) has no fixed anchor of its
                own, it's the one free to move: clamped to never sit closer
                than the elbow's own radius + a small gap to flueExitX,
                sliding right off dead-center only on the narrow layouts
                where the two would actually collide. */}
            <text x={Math.max(UNIT_X+UNIT_W/2,flueExitX+8+6+20)} y={FURN_Y-13} textAnchor="middle"
              fill={furnaceActive?'rgba(249,115,22,.78)':(S+'.65)')} fontSize="9.5" fontFamily="monospace">{CT('FURNACE',lang)}</text>
          </g>}

          {/* Secondary float switch - QA FIX, replaces the old free-standing
              "secondary drain pan" (direct feedback: too complicated,
              didn't read well against this tight seam's existing FURNACE/
              90% AFUE fixtures). Same idea as the attic layout's own
              replacement: a real A-coil's drain pan has two threaded
              ports - primary (already piped to the DRAIN line's own exit
              point below, exitX/exitY, recomputed here since that's
              scoped inside a different block) and a secondary, normally
              capped or fitted with exactly this kind of float switch.
              Placed right beside the primary connection instead of a
              separate box lower down. */}
          {hasCoil&&hasCond&&(()=>{
            const exitX=UNIT_X+UNIT_W, exitY=Math.max(LS_Y2+14,ACOIL_Y+Math.round(ACOIL_H*0.85));
            const portX=exitX+3, portY=exitY-14;
            const swX=portX, swY=portY+5;
            return <g key="closet-secondary-port">
              <line x1={portX} y1={portY} x2={portX} y2={portY+5}
                stroke={B+'.45)'} strokeWidth="1.5" strokeLinecap="round"/>
              <rect x={swX-4} y={swY} width="8" height="7" rx="1.4" fill="rgba(226,232,240,.6)" stroke="rgba(15,23,42,.6)" strokeWidth="0.6"/>
              <line x1={swX} y1={swY+7} x2={swX} y2={swY+13} stroke="rgba(226,232,240,.55)" strokeWidth="1"/>
              <circle cx={swX} cy={swY+13} r="2.2" fill="rgba(239,68,68,.55)" stroke="rgba(255,255,255,.5)" strokeWidth="0.5"/>
              <HoverInfo x={portX-8} y={portY-4} w={16} h={26} rx={3}
                vw={SVG_VW} vh={SVG_VH} title={T('secondary_drain_pan').title} text={T('secondary_drain_pan').text}/>
            </g>;
          })()}

          {/* Gas line + drip leg - closet version enters from the wall on
              the furnace's right face instead of from below (the attic
              layout's approach), since the space below the furnace here
              is the enclosed 2x4 return chase, not open deck. Sits at
              FURN_Y+50, in the ~90px gap between the furnace's top
              (badges end around FURN_Y+20) and the thermostat's own
              hover box, which starts at TY=midY-38 - see the thermostat
              block above. The condensate drain's own vertical run (S-curve
              into the chase, drawn below) crosses this same height at
              furnace-face+20, so the tee/valve assembly is pushed out
              past that (+34/+48) rather than sitting on top of it - the
              connecting pipe still crosses the drain's dashed line, but
              as a plain line crossing, not an icon overlapping it. */}
          {hasCoil&&hasFurnace&&(()=>{
            const gasY=FURN_Y+50;
            const gasX1=UNIT_X+UNIT_W, gasX2=gasX1+62;
            const teeX=gasX1+34, valveX=gasX1+48;
            return <g className="snap" style={{animationDelay:'.14s'}}>
              <line x1={gasX1} y1={gasY} x2={gasX2} y2={gasY} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round"/>
              <line x1={gasX1} y1={gasY} x2={gasX2} y2={gasY} stroke="#5a5a5a" strokeWidth="1" strokeLinecap="round"/>
              {/* Tee + drip leg, closest to the furnace connection that's clear of the drain crossing */}
              <line x1={teeX} y1={gasY-5} x2={teeX} y2={gasY+5} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round"/>
              <line x1={teeX} y1={gasY} x2={teeX} y2={gasY+11} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round"/>
              <rect x={teeX-3.5} y={gasY+11} width="7" height="3.5" rx="1" fill="#242424" stroke="#5a5a5a" strokeWidth="0.5"/>
              {/* Shutoff valve, toward the wall/supply side */}
              <circle cx={valveX} cy={gasY} r="4.2" fill="#242424" stroke="#5a5a5a" strokeWidth="0.8"/>
              <line x1={valveX} y1={gasY-6} x2={valveX} y2={gasY+6} stroke="#c0392b" strokeWidth="2.4" strokeLinecap="round"/>
              <text x={gasX1+18} y={gasY-9} textAnchor="middle" fill="rgba(180,180,180,.55)" fontSize="8.5" fontFamily="monospace">{CT('GAS',lang)}</text>
              <text x={teeX} y={gasY+24} textAnchor="middle" fill="rgba(180,180,180,.5)" fontSize="6.5" fontFamily="monospace">{CT('DRIP LEG',lang)}</text>
              <HoverInfo x={gasX1-2} y={gasY-12} w={gasX2-gasX1+4} h={38} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('gas_line').title} text={T('gas_line').text}/>
            </g>;
          })()}

          {/* Furnace service disconnect - a 120V single-pole switch (often
              just a household light switch) that lets a tech kill power to
              the blower/control board before servicing, separate from the
              240V condenser DISC. box outside. Mirrors the gas line's
              placement on the opposite (left) face, at the same height, so
              it clears the dehumidistat below it (which starts around
              midY-20, well under FURN_Y+50) the same way the gas line
              clears the thermostat. */}
          {hasFurnace&&(()=>{
            const swY=FURN_Y+50;
            const swX2=UNIT_X, swX1=swX2-30;
            const plateX=swX1-16, plateW=16, plateH=26;
            return <g className="snap" style={{animationDelay:'.16s'}}>
              <line x1={swX1} y1={swY} x2={swX2} y2={swY} stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
              <rect x={plateX} y={swY-plateH/2} width={plateW} height={plateH} rx="2"
                fill="#e8e4da" stroke="#8a8578" strokeWidth="0.8"/>
              <rect x={plateX+plateW/2-2.6} y={swY-8} width="5.2" height="11" rx="1.4"
                fill="#2a2a2a" stroke="#555" strokeWidth="0.5"/>
              <text x={plateX+plateW/2} y={swY+plateH/2+11} textAnchor="middle" fill="rgba(180,180,180,.55)" fontSize="6.5" fontFamily="monospace">{CT('SERVICE',lang)}</text>
              <text x={plateX+plateW/2} y={swY+plateH/2+19} textAnchor="middle" fill="rgba(180,180,180,.5)" fontSize="6.5" fontFamily="monospace">{CT('SWITCH',lang)}</text>
              <HoverInfo x={plateX-3} y={swY-plateH/2-3} w={plateW+6} h={plateH+22} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('service_switch').title} text={T('service_switch').text}/>
            </g>;
          })()}

          {/* QA FIX - the closet layout only ever got this furnace-branch
              service switch; the no-furnace air-handler cabinet had none
              at all (not a hover bug - the icon itself was never drawn),
              unlike the attic layout, which has both branches. Mirrors the
              furnace switch above (same left-face plate, same convention),
              at the air-handler cabinet's own vertical midpoint - clear of
              the "AIR HANDLER" title above and the blower/filtration
              labels below, same spirit as the furnace switch sitting in
              the gap between the furnace's own badges and the thermostat. */}
          {hasCoil&&!hasFurnace&&(()=>{
            const swY=ACOIL_Y+ACOIL_H*0.5;
            const swX2=UNIT_X, swX1=swX2-30;
            const plateX=swX1-16, plateW=16, plateH=26;
            return <g className="snap" style={{animationDelay:'.16s'}}>
              <line x1={swX1} y1={swY} x2={swX2} y2={swY} stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>
              <rect x={plateX} y={swY-plateH/2} width={plateW} height={plateH} rx="2"
                fill="#e8e4da" stroke="#8a8578" strokeWidth="0.8"/>
              <rect x={plateX+plateW/2-2.6} y={swY-8} width="5.2" height="11" rx="1.4"
                fill="#2a2a2a" stroke="#555" strokeWidth="0.5"/>
              <text x={plateX+plateW/2} y={swY+plateH/2+11} textAnchor="middle" fill="rgba(180,180,180,.55)" fontSize="6.5" fontFamily="monospace">{CT('SERVICE',lang)}</text>
              <text x={plateX+plateW/2} y={swY+plateH/2+19} textAnchor="middle" fill="rgba(180,180,180,.5)" fontSize="6.5" fontFamily="monospace">{CT('SWITCH',lang)}</text>
              <HoverInfo x={plateX-3} y={swY-plateH/2-3} w={plateW+6} h={plateH+22} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('service_switch').title} text={T('service_switch').text}/>
            </g>;
          })()}

          {hasCoil&&<EditZone stepId="indoor_type" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
            x={UNIT_X-4} y={ACOIL_Y-2} rx={6}
            w={UNIT_W+8} h={(hasFurnace?FURN_Y+FURN_H-ACOIL_Y:ACOIL_H)+4}>
            {indoorSubHoversV(hasFurnace,UNIT_X,UNIT_W,ACOIL_Y,ACOIL_H,FURN_Y,FURN_H)}
          </EditZone>}

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
              fill="#22c55e" fontSize="12" fontWeight="700" fontFamily="monospace">{CT('FILTRATION CABINET',lang)}</text>
            {/* No EditZone covers this - free-standing hover, no onClick. */}
            <HoverInfo x={UNIT_X} y={APR_Y} w={UNIT_W} h={APR_H} rx={2} vw={SVG_VW} vh={SVG_VH}
              title={T('filtration_cabinet').title} text={T('filtration_cabinet').text}/>
          </g>}

          {/* 2×4 return chase */}
          {hasCoil&&(()=>{
            // QA FIX - the condensate pump no longer lives inside this
            // chase at all (see the drain block's own comment below for
            // where it went and why), so the return-airflow arrow no
            // longer needs to dodge anything - back to the plain straight
            // run up the chase's centerline.
            const cx=UNIT_X+UNIT_W/2;
            const arrowD=`M${cx} ${VH-20} L${cx} ${CHASE_Y+10}`;
            return <g className="snap" key="chase">
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
                air already IS. pointerEvents:none on the wrapper - see the
                attic return plenum's own airflow-arrow comment for why the
                7px glow duplicate needs this too. Detours around the
                condensate pump box when present - see arrowD above. */}
            <g style={{pointerEvents:'none'}}>
              <path d={arrowD}
                fill="none" stroke={(heatMode?B:O)+'.3)'} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
              <path d={arrowD}
                fill="none" stroke={(heatMode?B:O)+'.8)'} strokeWidth="1.4" strokeLinejoin="round"
                strokeDasharray="6 4" className="airflow" style={{strokeDashoffset:0}} markerEnd="url(#arr)"/>
            </g>
            {/* Return-air temp - room-temp reading, opposite heat/cool
                coloring from supply on purpose, same reasoning as this
                chase's own airflow arrow just above. Pinned to the
                chase box's own top-left corner - off to the side of the
                arrow's centered column so the arrowhead never paints
                through it, and out of the way regardless of how tall
                the chase ends up (CHASE_Y varies with the unit stack). */}
            <text className="phase-color" x={UNIT_X-28+10} y={CHASE_Y+18} textAnchor="start"
              fill={heatMode?'#2389e0':'#f97316'} fontSize="14" fontWeight="700" fontFamily="monospace">
              {returnTemp}°
            </text>
            <text x={UNIT_X+UNIT_W/2} y={VH-8} textAnchor="middle"
              fill="rgba(138,98,42,.62)" fontSize="11.5" fontFamily="monospace">{CT('2×4 RETURN AIR CHASE',lang)}</text>
            {/* No EditZone covers this - free-standing hover, no onClick.
                Sized to the chase's own full visual box (CHASE_Y to VH,
                matching the outer rect drawn above) rather than just a
                strip near the label at the bottom - it used to only cover
                the bottom ~30px, leaving the whole upper portion of the
                chase dead to hover. Uses its own return_chase copy
                instead of return_grille's - this box is the framed 2x4
                cavity itself, not an actual grille (the attic layout's
                return_grille, used above, draws a real grille with
                slats; this one doesn't). */}
            <HoverInfo x={UNIT_X-28} y={CHASE_Y} w={UNIT_W+56} h={VH-CHASE_Y} rx={3}
              vw={SVG_VW} vh={SVG_VH} title={T('return_chase').title} text={T('return_chase').text}/>
            </g>;
          })()}

          {/* ── REFRIGERANT LINE STUBS - exit right face of A-coil, run to wall ──
              Painted BEFORE (so the condensate drain below wins hover
              priority over) the drain - both pipes exit the unit at nearly
              the same corner (the drain's own run starts right at
              UNIT_X+UNIT_W too, a few px below this lineset's LS_Y1/LS_Y2),
              so their hit-boxes unavoidably overlap in that shared corner
              even though each is already sized tight to its own real
              shape. This block used to sit AFTER the drain, so its own box
              (painted later, thus on top) won that sliver - hovering the
              drain's own real first diagonal segment there read back as
              "LINE SET" instead (confirmed via a grid-sweep hover audit
              sampling points directly on each part's own drawn line, same
              technique already used to find the original lineset-vs-
              supply-plenum overlap). Same fix, same reasoning as that one:
              only this block's paint-order position changed, not its
              geometry. */}
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
              {/* Same fix, same reasoning, as OutsideZone's own
                  toCondenser above - was inverted, now correct. */}
              const toWall=isLine1?refReversed:!refReversed;
              const p=toWall
                ?`M${UNIT_X+UNIT_W} ${lY} L${EXT_WALL_X} ${lY}`
                :`M${EXT_WALL_X} ${lY} L${UNIT_X+UNIT_W} ${lY}`;
              return <circle key={i} r="3" fill={pColor} opacity="0.82" filter="url(#glow-sm)">
                <animateMotion dur={(1.8+(i%3)*0.4)+'s'} repeatCount="indefinite" begin={(i*0.55)+'s'} path={p}/>
              </circle>;
            })}
            {/* No EditZone covers this indoor stub run - free-standing
                hover, no onClick. OutsideZone's own lineset hover covers
                the outside portion of this same run separately. */}
            <HoverInfo x={UNIT_X+UNIT_W} y={Math.min(LS_Y1,LS_Y2)-6} w={EXT_WALL_X-(UNIT_X+UNIT_W)} h={Math.abs(LS_Y2-LS_Y1)+12}
              rx={3} vw={SVG_VW} vh={SVG_VH} title={T('lineset').title} text={T('lineset').text}
              ringPath={linesetRingPath} ringStrokeWidth={16}/>
          </g>}

          {/* ── OUTSIDE ZONE - wall + condenser, condenser aligned with unit height ── */}
          {hasCond&&<OutsideZone
            wallX={EXT_WALL_X} zoneW={OUTSIDE_ZONE_W} zoneH={VH}
            condX={COND_X} condY={COND_Y} condW={COND_W} condH={COND_H}
            lineY1={LS_Y1} lineY2={LS_Y2}
            active={condenserActive} tierKey={a.cond_tier} eaveY={ROOF_EAVE_Y}
            heatMode={heatMode} isMildHp={isMildHp}
            refReversed={refReversed} isSurge={isSurge} condC={condC}
            line1C={line1C} line2C={line2C} G={G} W={W} lang={lang} vw={SVG_VW} vh={SVG_VH}
            linesetRingPath={linesetRingPath}
            condenserEl={<Condenser x={COND_X} y={COND_Y} w={COND_W} h={COND_H}
              active={condenserActive} tierKey={a.cond_tier}
              condC={condC} refReversed={refReversed} line1C={line1C} line2C={line2C}
              fanSpeedMode={!heatMode?'cool':(isMildHp?'hp':'off')} onEditStep={onEditStep} lang={lang} vw={SVG_VW} vh={SVG_VH}/>}/>}
          {hasCond&&<EditZone stepId="cond_tier" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
            x={COND_X-2} y={COND_Y-2} w={COND_W+4} h={COND_H+4} rx={5}>
            {condenserSubHovers(COND_X,COND_Y,COND_W,COND_H,a.cond_tier)}
          </EditZone>}

          {/* Condensate drain - exits right face of AH, slopes over to the
              exterior wall alongside the lineset's own route (same "down
              and out through the wall" shape, offset below the lineset's
              own LS_Y1/LS_Y2 pair so the two never visually merge), then
              runs down the wall to ground level and along the condenser
              pad, continuing past it into the yard - a real condensate
              line terminates well clear of the foundation, not coiled up
              in an indoor chase. Replaces the old S-curve-into-a-2x4-chase
              routing per direct feedback. Gated on hasCond (not just
              hasCoil) since there's nowhere outside to route to - and
              nothing at COND_X/COND_Y to route toward - until the
              condenser itself exists in the build. Painted AFTER
              OutsideZone (ground/pad/condenser) so its own outdoor leg
              draws on top of them instead of underneath the ground rect's
              opaque fill - confirmed via screenshot that painting this
              block in its old spot (before OutsideZone) hid the entire
              outdoor run behind it. */}
          {hasCoil&&hasCond&&(()=>{
            // Exit point: right face of AH/coil, lower portion - dropped
            // below LS_Y2 (the lower of the lineset's own two lines) so
            // this run starts in its own clear band instead of overlapping
            // the refrigerant lines it's about to run alongside.
            const exitX=UNIT_X+UNIT_W;
            const exitY=Math.max(LS_Y2+14,ACOIL_Y+Math.round(ACOIL_H*0.85));
            // Wall crossing - inner edge of the wall band, clear of the
            // lineset's own px1/px2 (wallMidX∓3, i.e. EXT_WALL_X+6/+12 -
            // see OutsideZone's own wallMidX comment) which cross a few px
            // to its left.
            const wallX2=EXT_WALL_X+WALL_THICK-3;
            const slopeY=exitY+16; // gentle downward slope crossing the wall, unlike the lineset's flat run - real drain lines need fall
            // Ground level - mirrors OutsideZone's own groundY=zoneH-28
            // (zoneH===VH here, see its call site above). Sits just ABOVE
            // that line (not below) so the run stays on the visible yard
            // background instead of the ground rect's own opaque fill,
            // which starts exactly at groundY.
            const groundY2=VH-28-2;
            // Past the pad (condX-10..condX+condW+10, see OutsideZone's own
            // CONCRETE PAD rect) and on toward the property line - real
            // code wants a condensate line terminating a few feet clear of
            // the foundation, not coiled up at the equipment. This diagram
            // compresses real-world distances everywhere (DISC_ZONE, pad
            // margins, etc. are all stylized, not to literal scale), so
            // PAST_PAD reads as "clearly past it, into open yard" rather
            // than a literal 3ft-in-scale run, which would push the pipe
            // off the edge of the canvas at this zoom.
            const PAST_PAD=46;
            const drainEndX=Math.min(VW-16,COND_X+COND_W+10+PAST_PAD);
            const drainD=`M${exitX} ${exitY} L${wallX2} ${slopeY} L${wallX2} ${groundY2} L${drainEndX} ${groundY2}`;
            return <>
              {/* Sloped run from the unit to the wall - indoors, so the
                  same dim opacity every other indoor drain segment in this
                  file uses reads fine against the dark house interior. */}
              <line x1={exitX} y1={exitY} x2={wallX2} y2={slopeY}
                stroke={B+'.45)'} strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round"/>
              {/* P-trap loop itself (the visible U-bend) - same idea/shape
                  as the attic layout's own trap loop (see that block's
                  comment), placed right at this run's origin (exitX/
                  exitY) rather than the coil's exact center - this
                  segment starts out nearly horizontal, not vertical, but
                  a trap still hangs straight down off the pipe regardless
                  of which way the run slopes afterward. Universal to any
                  coil (furnace+A-coil combo or standalone AH) - see
                  PART_INFO's own p_trap comment. Its own HoverInfo is
                  pulled out to right before this fragment's own closing
                  `</>` (see that comment) - it needs to win over this
                  same block's own 4 CONDENSATE DRAIN HoverInfos at the
                  one small spot they overlap (this segment's own start),
                  and a HoverInfo painted earlier still loses to a
                  later-painted sibling even inside the same fragment. */}
              {(()=>{
                const tR=6, tSpan=tR*1.8;
                const tX=exitX+3, tY=exitY;
                const tD=`M${tX} ${tY} q0 ${tSpan} ${tSpan} ${tSpan} q${tSpan} 0 ${tSpan} -${tSpan}`;
                return <path d={tD} fill="none" stroke={B+'.45)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>;
              })()}
              {/* Down the wall to ground level - crosses from the dark
                  interior into the lighter outdoor sky fill partway down,
                  so this segment steps up in opacity rather than down. */}
              <line x1={wallX2} y1={slopeY} x2={wallX2} y2={groundY2}
                stroke={B+'.6)'} strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round"/>
              {/* Along the pad and past it - fully outdoors against the
                  sky/yard fill (OUTSIDE_SUNNY/OVERCAST/COLD, all
                  medium-blue-ish), where the same low opacity the indoor
                  segments use nearly disappeared (confirmed via
                  screenshot - a blue-on-blue-ish contrast problem, not the
                  z-order bug this block's own comment already fixed).
                  Bumped well up so the outdoor run actually reads. */}
              <line x1={wallX2} y1={groundY2} x2={drainEndX} y2={groundY2}
                stroke={B+'.85)'} strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round"/>
              {/* QA FIX - this used to be ONE HoverInfo whose loose
                  bounding rect ran corner-to-corner from the unit's exit
                  point all the way to the outdoor terminus, which in
                  practice meant a box covering nearly the entire outside
                  zone - confirmed via QA sweep to be silently swallowing
                  hover AND click for the disconnect box, surge protector,
                  compressor, condenser, gas line, drip leg, ionizer and
                  flue pipe, and blocking the condenser's own EditZone
                  clicks. No EditZone covers this drain - free-standing
                  hover, no onClick - but "loose bounding rect, fine since
                  it's just hit-testing" (the convention every other
                  bent-pipe hover in this file uses) only holds when that
                  box stays small/local, same as the lineset's own 4
                  separate narrow segments (see its comment) instead of
                  one box spanning its whole run. Split into 3 narrow
                  per-segment zones, same convention, each hugging just
                  its own leg. */}
              <HoverInfo x={Math.min(exitX,wallX2)-4} y={Math.min(exitY,slopeY)-4}
                w={Math.abs(wallX2-exitX)+8} h={Math.abs(slopeY-exitY)+8}
                rx={3} vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
                ringPath={drainD} ringStrokeWidth={9}/>
              <HoverInfo x={wallX2-4} y={Math.min(slopeY,groundY2)-4}
                w={8} h={Math.abs(groundY2-slopeY)+8}
                rx={3} vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
                ringPath={drainD} ringStrokeWidth={9}/>
              {/* QA FIX - same gap this ground-level segment needed on the
                  attic layout's identical drain: it physically passes
                  right behind the condenser along the pad, so one
                  continuous box here still overlapped the condenser's own
                  EditZone at their shared ground-level edge and, painted
                  after it, won that strip - a QA pass confirmed clicks
                  along the very bottom of the condenser cabinet were dead
                  because of this. Gapped into two pieces stopping short of
                  the condenser's own footprint on each side, so that
                  strip falls through to the EditZone again. */}
              {Math.min(wallX2,drainEndX)<COND_X-6&&<HoverInfo x={Math.min(wallX2,drainEndX)-4} y={groundY2-4}
                w={Math.max(0,COND_X-6-Math.min(wallX2,drainEndX))+4} h={8}
                rx={3} vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
                ringPath={drainD} ringStrokeWidth={9}/>}
              {Math.max(wallX2,drainEndX)>COND_X+COND_W+6&&<HoverInfo x={COND_X+COND_W+6} y={groundY2-4}
                w={Math.max(0,Math.max(wallX2,drainEndX)-(COND_X+COND_W+6))+4} h={8}
                rx={3} vw={SVG_VW} vh={SVG_VH} title={T('condensate_drain').title} text={T('condensate_drain').text}
                ringPath={drainD} ringStrokeWidth={9}/>}
              <text x={wallX2+6} y={slopeY-6} textAnchor="start"
                fill={B+'.4)'} fontSize="11.5" fontFamily="monospace">{CT('DRAIN',lang)}</text>
              {/* Open terminus - a short downward drip stub + a dark
                  discharge point, same "this is where it lets out" cue the
                  old indoor terminus used, relocated to the actual outdoor
                  end of the run. */}
              <line x1={drainEndX} y1={groundY2} x2={drainEndX} y2={groundY2+5}
                stroke={B+'.85)'} strokeWidth="2" strokeLinecap="round"/>
              <circle cx={drainEndX} cy={groundY2+5} r={3} fill={B+'.7)'} stroke={B+'.95)'} strokeWidth="0.8"/>
              {/* P-trap hover zone - see the loop's own comment above for
                  why this is split out and painted last in this
                  fragment. */}
              {(()=>{
                const tR=6, tSpan=tR*1.8;
                const tX=exitX+3, tY=exitY;
                return <HoverInfo x={tX-3} y={tY-3} w={tSpan*2+6} h={tSpan+7} rx={3}
                  vw={SVG_VW} vh={SVG_VH} title={T('p_trap').title} text={T('p_trap').text}/>;
              })()}
            </>;
          })()}

          {/* Thermostat - mounted on the interior wall, between the unit
              and the exterior wall it's built into - a real indoor spot,
              unlike stacking it outside above the condenser. Vertically
              level with the furnace/coil it's wired to. ── */}
          {hasTstat&&(()=>{
            const gapLeft=UNIT_X+UNIT_W+16, gapRight=EXT_WALL_X-16;
            const midY=hasFurnace?FURN_Y+FURN_H/2:ACOIL_Y+ACOIL_H/2;
            const isProprietaryC=a.thermostat==='proprietary';
            const isWifiC=a.thermostat==='wifi'&&!isProprietaryC;
            const variantC=thermVariant(isProprietaryC,isWifiC);
            // isMildHp alone doesn't imply heatMode - see the attic
            // thermostat's own showRange comment above.
            const showRangeC=heatMode&&isMildHp;
            // Same 2-vs-3-button widening as the attic thermostat - see
            // THERM_BTN_N/THERM_ROW_W/THERM_ROW_X's own comments there.
            const THERM_BTN_N_C=(isDualFuel||!hasFurnace)?3:2;
            const THERM_ROW_W_C=THERM_BTN_N_C===3?96:76;
            // Total local content height - same 120 the attic layout's
            // own THERM_H is built from (see its comment): face + button
            // row + the caption now sitting below it, with a little pad.
            const THERM_CONTENT_H_C=120;
            // Scaled to THERM_TARGET_SCALE - see its own comment. This
            // layout never had a real space constraint of its own (the
            // open floor space on both sides of the unit stack was
            // always "genuine breathing room"), so it just always
            // targets that shared scale rather than computing its own
            // margin-fit fallback the way the attic layout's THERM_SCALE
            // has to. TX/TY are the <g transform="translate(...)"> origin
            // (local x=0/y=0), chosen so the SCALED content still centers
            // on the same column/row the unscaled version used to.
            const TX=gapLeft+(gapRight-gapLeft)/2-38*THERM_TARGET_SCALE;
            const TY=midY-(THERM_CONTENT_H_C/2)*THERM_TARGET_SCALE;
            const THERM_W_C=THERM_ROW_W_C*THERM_TARGET_SCALE, THERM_H_C=THERM_CONTENT_H_C*THERM_TARGET_SCALE;
            // Row is centered on the face's own local center (local
            // x=38); mirrors THERM_ROW_X's own formula (attic).
            const THERM_ROW_X_C=TX+38*THERM_TARGET_SCALE-THERM_W_C/2;
            return <g className="snap therm-hover-zone" key="tstat-c" style={{animationDelay:'.26s'}}
              onMouseEnter={()=>setHoverPart({x:THERM_ROW_X_C,y:TY,w:THERM_W_C,h:THERM_H_C,
                vw:SVG_VW,vh:SVG_VH,title:T('thermostat_general').title,text:T('thermostat_general').text,highlight:true})}
              onMouseLeave={()=>setHoverPart(null)}>
            {/* General "what is this" thermostat tooltip - same purely-
                additive reasoning as the attic layout's own call site
                (see its comment): no new hit-rect, and the enter/leave
                pair lives on the outer g (not this rect) for the same
                "EditZone/buttons paint after this and would otherwise be
                the actual hover target" reason as there. Face markup
                itself now lives in the shared ThermostatFace (see its own
                comment) - both layouts paint the exact same 76-wide
                design at the exact same THERM_TARGET_SCALE. */}
            <rect x={THERM_ROW_X_C-2} y={TY-2} width={THERM_W_C+4} height={THERM_H_C+4}
              fill="transparent" style={{pointerEvents:'all'}}/>
            <g transform={`translate(${TX} ${TY}) scale(${THERM_TARGET_SCALE})`}>
              <ThermostatFace TX={0} TY={0} isProprietary={isProprietaryC} isWifi={isWifiC}
                thermostatTemp={thermostatTemp} showRange={showRangeC} heatMode={heatMode} G={G} B={B}/>
            </g>
            <EditZone stepId="thermostat" onEditStep={onEditStep} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH}
              x={THERM_ROW_X_C-2} y={TY-2} w={THERM_W_C+4} h={THERM_H_C+4}/>
            {/* Painted after EditZone (topmost in paint order) so a click
                lands on the button, not the done-screen's edit-zone overlay
                underneath it - see EditZone's own onClick above. */}
            <g transform={`translate(${TX} ${TY}) scale(${THERM_TARGET_SCALE})`}>
              <ThermModeButtons modes={thermModes(isDualFuel,hasFurnace,heatMode,heatSubMode,setHeatMode,setHeatSubMode)}
                cx={38} y={THERM_BTN_Y[variantC]} totalW={THERM_ROW_W_C} gap={4} h={17} fontSize={THERM_BTN_N_C===3?8.5:9.5} lang={lang}/>
              {/* Caption moved below the COOL/HEAT row - see the attic
                  thermostat's own identical comment above; same shared
                  THERM_CAP_Y/THERM_CAP_TEXT keeps this in lockstep with it. */}
              <text x={38} y={THERM_CAP_Y[variantC]} textAnchor="middle" fill={G+THERM_CAP_FILL_A[variantC]}
                fontSize={THERM_CAP_SIZE[variantC]} fontFamily="monospace">{THERM_CAP_TEXT[variantC]}</text>
            </g>
          </g>;
          })()}

          {/* Dehumidistat - left side of the unit, mirroring the
              thermostat's own real breathing room on the right (see the
              thermostat block's own comment) - the same open floor space
              exists on both sides of the unit stack here. Sized up 50%
              (DEHUMIDISTAT_SCALE_C) per direct feedback - this layout's
              copy was hard to read at its old default size, unlike the
              attic layout's own copy (which stayed default size - see its
              own comment). */}
          {hasDehu&&hasTstat&&(()=>{
            const midY=hasFurnace?FURN_Y+FURN_H/2:ACOIL_Y+ACOIL_H/2;
            const DEHUMIDISTAT_SCALE_C=1.5;
            const W=60*DEHUMIDISTAT_SCALE_C,H=30*DEHUMIDISTAT_SCALE_C;
            return <DehumidistatWall x={UNIT_X/2-W/2} y={midY-H/2} scale={DEHUMIDISTAT_SCALE_C}
              pct={!heatMode?45:(isMildHp?55:50)} lang={lang} vw={SVG_VW} vh={SVG_VH}/>;
          })()}

          {/* Dehu + ERV - hang from roofline in attic zone. Geometry
              (dehuX/ervX/ervW/BY/roofY) is hoisted above, shared with this
              row's own dedicated duct stubs and StepFocusRing below. */}
          {(hasDehu||hasERV)&&
            <DehuErvBoxes dehuBX={dehuX} ervBX={ervX} ervW={ervW} dehuW={dehuW} BY={DEHU_ERV_BY} roofY={DEHU_ERV_ROOFY}
              hasDehu={hasDehu} hasERV={hasERV} snap
              lang={lang} vw={SVG_VW} vh={SVG_VH}/>}

          {/* Dehu's own dedicated return + supply - closet layout. A
              different design from the attic layout's own dehu ducts
              (which tap the SAME return/supply plenum the rest of the
              system uses): this stack's return chase sits down near the
              floor and its supply plenum up near the roofline, with
              nothing genuinely close to both - rather than one duct
              making a long haul down the equipment's own margin, this one
              is fully independent, stubbed straight into the drywall
              nearby on its own dedicated grilles instead of tying into
              the main trunk at all. Short, simple, and honestly how a lot
              of these actually get installed. No backdraft damper here -
              there's no shared blower airflow on an independent run to
              guard against. */}
          {hasDehu&&hasCoil&&(()=>{
            const RC='rgba(255,182,193,';
            const stubY=DECK_Y-8; // just above the ceiling line - reads as punching through into the drywall below
            const retX=dehuX+14, supX=dehuX+dehuW-14;
            const retD=`M${retX} ${DEHU_ERV_BY+DEHU_ERV_BH} L${retX} ${stubY}`;
            const supD=`M${supX} ${DEHU_ERV_BY+DEHU_ERV_BH} L${supX} ${stubY}`;
            // Thickened per direct feedback - matches the attic layout's
            // own dehu duct treatment (a solid pipe body, not just a thin
            // dashed line with a soft glow standing in for real duct
            // width).
            const pipeW=11;
            // Small flanged collar where each stub disappears into the
            // ceiling drywall - same "duct terminates into the structure"
            // language as the ERV's own roof-penetration collars above.
            const cap=(x,color)=>(
              <>
                <rect x={x-6} y={stubY-3} width="12" height="6" rx="1.5" fill={color+'.3)'} stroke={color+'.6)'} strokeWidth="0.8"/>
                <line x1={x-9} y1={stubY+3} x2={x+9} y2={stubY+3} stroke={color+'.4)'} strokeWidth="1" strokeDasharray="1.5 1.5"/>
              </>
            );
            return <g className="snap" style={{animationDelay:'0.4s'}}>
              <path d={retD} fill="none" stroke={RC+'.16)'} strokeWidth={pipeW+6} strokeLinecap="round"/>
              <path d={retD} fill="none" stroke={RC+'.4)'} strokeWidth={pipeW} strokeLinecap="round"/>
              <path d={retD} fill="none" stroke={RC+'.8)'} strokeWidth="1.4" strokeDasharray="3.5 2.2"/>
              {cap(retX,RC)}
              <path d={supD} fill="none" stroke={G+'.16)'} strokeWidth={pipeW+6} strokeLinecap="round"/>
              <path d={supD} fill="none" stroke={G+'.3)'} strokeWidth={pipeW} strokeLinecap="round"/>
              <path d={supD} fill="none" stroke={G+'.7)'} strokeWidth="1.4" strokeDasharray="3.5 2.2"/>
              {cap(supX,G)}
              <HoverInfo x={retX-9} y={DEHU_ERV_BY+DEHU_ERV_BH-4} w={18} h={stubY-(DEHU_ERV_BY+DEHU_ERV_BH)+13} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('dehu_dedicated_return').title} text={T('dehu_dedicated_return').text}
                ringPath={retD} ringStrokeWidth={pipeW+8}/>
              <HoverInfo x={supX-9} y={DEHU_ERV_BY+DEHU_ERV_BH-4} w={18} h={stubY-(DEHU_ERV_BY+DEHU_ERV_BH)+13} rx={2}
                vw={SVG_VW} vh={SVG_VH} title={T('dehu_dedicated_supply').title} text={T('dehu_dedicated_supply').text}
                ringPath={supD} ringStrokeWidth={pipeW+8}/>
            </g>;
          })()}

          {/* ── CURRENT-STEP SPOTLIGHT - see StepFocusRing's own comment
               near the top of this component for what this is and why only
               these steps get one; geometry here mirrors this layout's own
               EditZone calls above at each matching spot. ── */}
          {(()=>{
            // PLEN_ABOVE/BELOW are both 0 before plenum is answered (see
            // their own definitions above) - nominal ductboard-sized
            // stand-ins just for this ghost ring, same reasoning as the
            // attic layout's SUP_PLEN_W fallback just above.
            const focusPlenAbove=PLEN_ABOVE||130, focusPlenBelow=PLEN_BELOW||57;
            const focusPlenTop=DECK_Y-focusPlenAbove, focusPlenTotal=focusPlenAbove+focusPlenBelow;
            return <>
              <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="indoor_type" x={UNIT_X-4} y={ACOIL_Y-2} rx={6}
                w={UNIT_W+8} h={(hasFurnace?FURN_Y+FURN_H-ACOIL_Y:ACOIL_H)+4}/>
              <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="insulation" x={UNIT_X-4} y={ACOIL_Y-2} rx={6}
                w={UNIT_W+8} h={(hasFurnace?FURN_Y+FURN_H-ACOIL_Y:ACOIL_H)+4}/>
              <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="plenum"
                x={UNIT_X-2} y={focusPlenTop-2} w={PLEN_W+4} h={focusPlenTotal+4} rx={5}/>
              {hasCond&&<StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="cond_tier"
                x={COND_X-2} y={COND_Y-2} w={COND_W+4} h={COND_H+4} rx={5}/>}
              {/* Mirrors the real thermostat's own THERM_ROW_X_C/TY/
                  THERM_W_C/THERM_H_C formulas (see that call site's
                  comments) at THERM_TARGET_SCALE, so this ghost preview
                  lands exactly where the real box will once it renders. */}
              <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="thermostat"
                x={UNIT_X+UNIT_W+16+(EXT_WALL_X-16-(UNIT_X+UNIT_W+16))/2-((isDualFuel||!hasFurnace)?96:76)*THERM_TARGET_SCALE/2-2}
                y={(hasFurnace?FURN_Y+FURN_H/2:ACOIL_Y+ACOIL_H/2)-60*THERM_TARGET_SCALE-2}
                w={((isDualFuel||!hasFurnace)?96:76)*THERM_TARGET_SCALE+4} h={120*THERM_TARGET_SCALE+4}/>
              {/* APR_H is 0 only if the (effectively always-on) filtration
                  cabinet is somehow off - 28 stand-in matches its real
                  height exactly, see the attic layout's own APR_W comment. */}
              <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="purif"
                x={UNIT_X-2} y={APR_Y-2} w={UNIT_W+4} h={(APR_H||28)+4} rx={4}/>
              <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="dehu" x={dehuX} y={DEHU_ERV_BY} w={dehuW} h={DEHU_ERV_BH} rx={4}/>
              <StepFocusRing onEditStep={onEditStep} curStepId={curStepId} svgScale={SVG_SCALE} vw={SVG_VW} vh={SVG_VH} stepId="dehu" x={ervX} y={DEHU_ERV_BY} w={ervW} h={DEHU_ERV_BH} rx={4}/>
            </>;
          })()}
          {/* Single always-topmost hover tooltip - see the module comment
              on HoverCtx/HoverInfo for why this has to be the very last
              thing painted in the whole <svg> rather than living next to
              whichever hit-rect triggered it. */}
          {hoverPart&&<HoverPanel part={hoverPart} groupBoxes={groupBoxes}/>}

        </svg>
      </div>
      </GroupCtx.Provider>
      </HoverCtx.Provider>
    );
  }

  // Fallback
  return null;
}
