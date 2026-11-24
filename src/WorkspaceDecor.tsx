/** Scalable, noninteractive ornamentation, no extra raster assets. */
function PawShape({transform}:{transform?:string}){
  return <g transform={transform}>
    <ellipse cx="5.3" cy="9.5" rx="3.5" ry="4.7" transform="rotate(-27 5.3 9.5)"/>
    <ellipse cx="12.1" cy="5.7" rx="3.5" ry="4.7" transform="rotate(-10 12.1 5.7)"/>
    <ellipse cx="20" cy="5.7" rx="3.5" ry="4.7" transform="rotate(10 20 5.7)"/>
    <ellipse cx="26.7" cy="9.5" rx="3.5" ry="4.7" transform="rotate(27 26.7 9.5)"/>
    <path d="M7 25 Q4 21 9 17 L12 13 Q16 9 20 13 L23 17 Q28 21 25 25 Q23 28 16 25.7 Q9 28 7 25Z"/>
  </g>;
}
export function WorkspaceHeaderFlourish(){
  return <svg className="workspace-header-flourish" viewBox="0 0 600 64" aria-hidden="true" focusable="false">
    <path className="workspace-flourish-line" d="M14 56 C92 52 145 17 225 34 S312 56 362 27 S465 25 586 57" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    <g className="workspace-flourish-paws" fill="currentColor">
      <PawShape transform="translate(67 9) rotate(-20 16 16)"/>
      <PawShape transform="translate(289 1) rotate(14 16 16)"/>
      <PawShape transform="translate(502 12) rotate(-12 16 16)"/>
    </g>
    <g className="workspace-flourish-stars" fill="currentColor">
      <path d="M178 13 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2Z M418 9 l1.6 5 5 1.6 -5 1.6 -1.6 5 -1.6 -5 -5 -1.6 5 -1.6Z"/>
      <circle cx="249" cy="14" r="1.4"/><circle cx="467" cy="30" r="1.3"/>
    </g>
  </svg>;
}
export function WorkspacePeekCat(){
  return <svg className="workspace-peek-cat" viewBox="0 0 220 90" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M55 67 Q49 45 66 31 L68 9 Q69 6 73 9 L94 28 Q111 24 128 28 L150 9 Q154 6 155 12 L158 33 Q174 46 166 67Z" fill="#623222"/>
      <path d="M75 19 L78 35 L89 29 M147 19 L134 29 L149 35" fill="none" opacity=".62"/>
      <path d="M42 43 Q25 35 17 39 M42 51 Q23 48 11 54 M178 42 Q193 34 204 38 M179 51 Q195 48 209 54" fill="none"/>
      <ellipse cx="91" cy="49" rx="7" ry="4" fill="currentColor" stroke="none"/>
      <ellipse cx="132" cy="49" rx="7" ry="4" fill="currentColor" stroke="none"/>
      <path d="M107 55 Q111 52 115 55 L111 59Z" fill="currentColor" stroke="none"/>
      <path d="M111 59 Q106 64 102 60 M111 59 Q116 64 120 60" fill="none"/>
      <path d="M1 88 Q110 45 219 88" fill="#392421" strokeWidth="2"/>
      <path d="M62 69 Q61 58 70 58 Q80 56 84 64 L85 70 M137 70 L137 63 Q141 56 151 58 Q159 58 159 69" fill="#a85e37"/>
      <path d="M68 64 L68 68 M74 63 L75 69 M145 63 L145 69 M151 64 L151 68" fill="none" strokeWidth="1.2"/>
    </g>
    <path d="M31 17 l1.5 5 5 1.5 -5 1.5 -1.5 5 -1.5 -5 -5 -1.5 5 -1.5Z M185 7 l1.2 4 4 1.2 -4 1.2 -1.2 4 -1.2 -4 -4 -1.2 4 -1.2Z" fill="currentColor" opacity=".85"/>
  </svg>;
}
export function WorkspacePawSeal(){
  return <svg className="workspace-paw-seal" viewBox="0 0 32 30" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"><PawShape/></svg>;
}
export function WorkspaceAvatarRays(){
  return <svg className="workspace-avatar-rays" viewBox="0 0 26 20" aria-hidden="true" focusable="false"><path d="M5 15 L2 8 M13 11 L14 2 M21 15 L25 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function WorkspaceBrandEars(){
  return <svg className="workspace-brand-ears" viewBox="0 0 126 21" aria-hidden="true" focusable="false"><path d="M3 20 Q5 9 11 2 Q14 -1 18 2 L40 20 M86 20 L108 2 Q112 -1 115 2 Q121 9 123 20" fill="#824521" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 18 L15 9 L28 18 M98 18 L111 9 L114 18" fill="#ffb26d" opacity=".64"/></svg>;
}
