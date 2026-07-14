import sharp from "sharp";

type OutfitBoardItem = {
  name: string;
  image: Buffer;
};

function escapeXml(value:string){
  return value.replace(/[<>&"']/g,(character)=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"})[character]!);
}

export async function buildOutfitBoard(items:OutfitBoardItem[],title:string){
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
      input:Buffer.from(`<svg width="${cellWidth}" height="48"><text x="${cellWidth/2}" y="31" text-anchor="middle" font-family="Arial, PingFang SC, sans-serif" font-size="23" fill="#252521">${escapeXml(items[index].name.slice(0,30))}</text></svg>`),
      left:x,
      top:y+393,
    });
  }

  composites.unshift({
    input:Buffer.from(`<svg width="${width}" height="150"><text x="600" y="48" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="5" fill="#63735b">AHA OUTFIT</text><text x="600" y="112" text-anchor="middle" font-family="Arial, PingFang SC, sans-serif" font-size="46" fill="#252521">${escapeXml(title.slice(0,40))}</text></svg>`),
    left:0,
    top:20,
  });

  return sharp({create:{width,height,channels:3,background:"#f8f5ea"}})
    .composite(composites)
    .jpeg({quality:90,chromaSubsampling:"4:4:4"})
    .toBuffer();
}
