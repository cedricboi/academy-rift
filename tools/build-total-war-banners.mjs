// Original Academy Rift portraits mounted in code-native, exportable heraldic frames.
// This does not redraw, recolour, or regenerate any character artwork.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {BANNERS,PORTRAITS} from '../public/total-war/banners.js';
const base=new URL('../public/',import.meta.url),out=new URL('total-war/banners/',base);
await mkdir(out,{recursive:true});
const sigils={
  Fire:'M0 -12C-11 -2 -12 8 0 12C12 8 11 0 5 -3C5 3 0 4 0 -12Z',
  Ice:'M0 -13V13M-11 -6L11 6M-11 6L11 -6M-4 -9L0 -5L4 -9M-4 9L0 5L4 9',
  Electric:'M3 -13L-8 2H0L-3 13L9 -3H1Z',
  Wind:'M-12 -5H5Q14 -5 10 -11M-12 1H9M-9 7H3Q11 7 7 12',
  Light:'M0 -13L3 -3L13 0L3 3L0 13L-3 3L-13 0L-3 -3Z',
  Shadow:'M4 -12C-13 -11 -13 11 4 12C-4 6 -4 -6 4 -12ZM8 -3L11 0L8 3L5 0Z',
  Earth:'M-13 10L-3 -11L3 0L7 -7L14 10ZM-4 10L3 0',
  Mind:'M-14 0Q0 -17 14 0Q0 17 -14 0ZM0 -5A5 5 0 1 0 0 5A5 5 0 1 0 0 -5',
  Water:'M0 -13C-16 4 -9 12 0 12C9 12 16 4 0 -13ZM-5 4Q-5 8 0 8',
  Metal:'M-10 -10H10V3L0 13L-10 3ZM-6 -5H6V1L0 7L-6 1Z'
};
for(const b of BANNERS){
  const photo=(await readFile(new URL(`total-war/portraits/${PORTRAITS[b.id]}.webp`,base))).toString('base64');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540" viewBox="0 0 180 270" role="img" aria-label="${b.fullName}, ${b.element} standard"><title>${b.fullName} — ${b.element} standard</title><defs><linearGradient id="cloth" x2="1" y2="1"><stop stop-color="${b.color}"/><stop offset=".35" stop-color="#172336"/><stop offset="1" stop-color="#080e1d"/></linearGradient><linearGradient id="gold"><stop stop-color="#7e633c"/><stop offset=".3" stop-color="#f4df9b"/><stop offset=".6" stop-color="#b48b4f"/><stop offset="1" stop-color="#f0d499"/></linearGradient><linearGradient id="shade" x2="0" y2="1"><stop offset="0" stop-color="#081324" stop-opacity="0"/><stop offset=".6" stop-color="#081324" stop-opacity="0"/><stop offset="1" stop-color="#081324"/></linearGradient><clipPath id="flag"><path d="M18 31H162V223L90 258L18 223Z"/></clipPath></defs><path d="M90 3V269" stroke="#6e5737" stroke-width="4"/><path d="M91 3V269" stroke="#d8bc7e" stroke-width="1"/><path d="M18 31H162V223L90 258L18 223Z" fill="url(#cloth)" stroke="url(#gold)" stroke-width="2"/><g clip-path="url(#flag)"><image href="data:image/webp;base64,${photo}" x="23" y="39" width="134" height="161" preserveAspectRatio="xMidYMin slice"/><path d="M23 39H157V216H23Z" fill="url(#shade)"/><path d="M18 32V224L90 258L162 224V32" fill="none" stroke="${b.color}" stroke-width="8"/><path d="M26 35V219L90 249L154 219V35" fill="none" stroke="#d8bc7e" stroke-width=".8"/><path d="M30 195H150V230L90 248L30 230Z" fill="#0a1425" fill-opacity=".88"/><text x="90" y="214" text-anchor="middle" fill="#f7e7bd" font-family="Georgia,serif" font-size="16" font-weight="bold" letter-spacing="1">${b.name.toUpperCase()}</text><text x="90" y="231" text-anchor="middle" fill="${b.color}" font-family="Georgia,serif" font-size="8" letter-spacing="2">${b.element.toUpperCase()}</text><path d="M32 189L46 191M148 189L134 191M80 242L90 246L100 242" stroke="#bca776" fill="none"/></g><path d="M8 27H172" stroke="#182131" stroke-width="7"/><path d="M8 25H172" stroke="url(#gold)" stroke-width="3"/><path d="M9 19L15 25L9 31L3 25ZM171 19L177 25L171 31L165 25Z" fill="${b.color}" stroke="#e5c88b"/><path d="M90 4L111 24L90 45L69 24Z" fill="#102032" stroke="url(#gold)" stroke-width="1.4"/><g transform="translate(90 24) scale(.7)"><path d="${sigils[b.element]}" stroke="${b.color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" fill="none"/></g><path d="M18 38L30 38M18 38L18 50M162 38H150M162 38V50" stroke="#fff0b3" stroke-width="2"/></svg>`;
  await writeFile(new URL(`${b.id}.svg`,out),svg);
}
console.log(`Created ${BANNERS.length} original-art standards in ${fileURLToPath(out)}`);
