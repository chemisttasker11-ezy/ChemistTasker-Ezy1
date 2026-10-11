import React from 'react';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';

/** Distinctive four-by-three Webster / DAA tablet blister with optional clinical check. */
export function DoseBlisterIcon({checked=false}:{checked?:boolean}) {
  return <Svg width={24} height={24} viewBox="0 0 26 26">
    <Rect x={2} y={2} width={22} height={22} rx={3} fill="none" stroke="#2463A6" strokeWidth={1.6}/>
    {[0,1,2,3].map(row=>[0,1,2].map(col=>
      <Ellipse key={row+'-'+col} cx={6+col*7} cy={5.5+row*5} rx={1.8} ry={1.65} stroke="#2463A6" strokeWidth={1} fill="none"/>))}
    {checked ? <Path d="M14 20l3 3 6-7" fill="none" stroke="#139568" strokeWidth={2.3} strokeLinecap="round"/> : null}
  </Svg>;
}
