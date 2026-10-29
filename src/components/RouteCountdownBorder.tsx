import React,{useLayoutEffect,useRef,useState} from 'react';

/** Pixel-sized SVG keeps the border weight and rounded corners uniform on
 * narrow phones and wide screens. No stretched square or rotating gradient. */
export function RouteCountdownBorder({durationMs}:{durationMs:number}) {
  const svg=useRef<SVGSVGElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  useLayoutEffect(()=>{
    const button=svg.current?.parentElement;
    if(!button)return;
    const measure=()=>setSize(previous=>{
      const width=button.clientWidth,height=button.clientHeight;
      return previous.width===width&&previous.height===height?previous:{width,height};
    });
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(button);
    return()=>observer.disconnect();
  },[]);
  const {width,height}=size;
  const inset=2.5,radius=Math.min(13.5,(width-inset*2)/2,(height-inset*2)/2);
  const right=width-inset,bottom=height-inset;
  const path=width>inset*2&&height>inset*2
    ?`M ${width/2} ${inset} H ${right-radius} A ${radius} ${radius} 0 0 1 ${right} ${inset+radius}
      V ${bottom-radius} A ${radius} ${radius} 0 0 1 ${right-radius} ${bottom}
      H ${inset+radius} A ${radius} ${radius} 0 0 1 ${inset} ${bottom-radius}
      V ${inset+radius} A ${radius} ${radius} 0 0 1 ${inset+radius} ${inset} H ${width/2}`:'';
  return <svg ref={svg} aria-hidden="true" className="rdv-route-countdown-frame"
    viewBox={`0 0 ${width||1} ${height||1}`}>
    {path&&<>
      <path d={path} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2.5"/>
      <path d={path} className="rdv-route-countdown-border" pathLength="100" fill="none"
        stroke="#eff6ff" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        style={{animationDuration:`${durationMs}ms`}}/>
    </>}
  </svg>;
}
