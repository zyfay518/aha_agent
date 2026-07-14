import sharp from "sharp";

type OutfitBoardItem = {
  name: string;
  category: "top"|"bottom"|"shoes"|"bag";
  image: Buffer;
};

const categoryLabels={top:"TOP",bottom:"BOTTOM",shoes:"SHOES",bag:"BAG"} as const;

export async function buildOutfitBoard(items:OutfitBoardItem[]){
  const columns=items.length===1?1:2;
  const rows=Math.ceil(items.length/columns);
  const width=1200;
  const cellWidth=500;
  const cellHeight=500;
  const gap=40;
  const top=170;
  const height=top+rows*cellHeight+90;
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
      input:Buffer.from(`<svg width="${cellWidth}" height="450"><rect width="${cellWidth}" height="450" rx="26" fill="#ffffff" stroke="#dedbd1" stroke-width="2"/></svg>`),
      left:x,
      top:y,
    });
    composites.push({input:image,left:x+40,top:y+24});
    composites.push({
      input:Buffer.from(`<svg width="${cellWidth}" height="48"><text x="${cellWidth/2}" y="31" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="3" fill="#63735b">${categoryLabels[items[index].category]}</text></svg>`),
      left:x,
      top:y+393,
    });
  }

  composites.unshift({
    input:Buffer.from(`<svg width="${width}" height="150"><text x="600" y="55" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="5" fill="#63735b">AHA OUTFIT</text><text x="600" y="116" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" letter-spacing="4" fill="#252521">TODAY'S LOOK</text></svg>`),
    left:0,
    top:20,
  });

  return sharp({create:{width,height,channels:3,background:"#f8f5ea"}})
    .composite(composites)
    .jpeg({quality:90,chromaSubsampling:"4:4:4"})
    .toBuffer();
}
