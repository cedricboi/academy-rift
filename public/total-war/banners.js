import {CHARACTERS,ELEMENT_COLORS} from '../data/characters.js';
export const PORTRAITS={jun:'J',saya:'S',raiden:'R',nao:'N',emi:'E',kuro:'K',taiga:'T',hina:'H',mina:'M',renji:'X'};
export const BANNERS=CHARACTERS.map(c=>({id:c.id,name:c.name.split(' ')[0],fullName:c.name,element:c.element,role:c.role,color:ELEMENT_COLORS[c.element],src:`banners/${c.id}.svg`,portrait:`../theatre/p/${PORTRAITS[c.id]}.webp`}));
export const bannerFor=id=>BANNERS.find(b=>b.id===id)||BANNERS.find(b=>b.id==='kuro');
