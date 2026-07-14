import sharp from "sharp";

type OutfitBoardItem = {
  name: string;
  image: Buffer;
};

export async function buildOutfitBoard(items:OutfitBoardItem[]){
  const columns=items.length===1?1:2;
  const rows=Math.ceil(items.length/columns);
  const width=1200;
  const cellWidth=500;
  const cellHeight=430;
  const gap=40;
  const top=100;
  const height=top+rows*cellHeight+70;
  const totalWidth=columns*cellWidth+(columns-1)*gap;
  const left=(width-totalWidth)/2;

  const composites:sharp.OverlayOptions[]=[];
  for(let index=0;index<items.length;index+=1){
    const column=index%columns;
    const row=Math.floor(index/columns);
    const x=Math.round(left+column*(cellWidth+gap));
    const y=top+row*cellHeight;
    const image=await sharp(items[index].image)
      .flatten({background:"#ffffff"})
      .resize(420,370,{fit:"contain",background:"#ffffff"})
      .jpeg({quality:92})
      .toBuffer();
    composites.push({
      input:Buffer.from(`<svg width="${cellWidth}" height="410"><rect width="${cellWidth}" height="410" rx="26" fill="#ffffff" stroke="#dedbd1" stroke-width="2"/></svg>`),
      left:x,
      top:y,
    });
    composites.push({input:image,left:x+40,top:y+24});
  }

  composites.unshift({
    input:Buffer.from(`<svg width="${width}" height="80"><circle cx="566" cy="40" r="7" fill="#63735b"/><rect x="584" y="34" width="50" height="12" rx="6" fill="#63735b"/><circle cx="652" cy="40" r="7" fill="#63735b"/></svg>`),
    left:0,
    top:10,
  });

  return sharp({create:{width,height,channels:3,background:"#f8f5ea"}})
    .composite(composites)
    .jpeg({quality:90,chromaSubsampling:"4:4:4"})
    .toBuffer();
}
