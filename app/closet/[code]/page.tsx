import Image from "next/image";
import {notFound} from "next/navigation";
import {createClient} from "@supabase/supabase-js";

const categories=[
  {key:"top",label:"上装"},
  {key:"bottom",label:"下装"},
  {key:"shoes",label:"鞋履"},
  {key:"bag",label:"包袋"},
] as const;
const colorLabels:Record<string,string>={black:"黑色",white:"白色",navy:"藏青色",red:"红色",blue:"蓝色",gray:"灰色",grey:"灰色",beige:"米色",brown:"棕色",green:"绿色",yellow:"黄色",pink:"粉色",purple:"紫色",orange:"橙色"};
type Category=(typeof categories)[number]["key"];
type WardrobeItem={id:string;name:string;category:Category;primary_color:string};

export default async function Closet({params}:{params:Promise<{code:string}>}){
  const {code:viewId}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(viewId))notFound();
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  const {data,error}=await supabase.rpc("view_list_wardrobe_items",{p_view_id:viewId,p_limit:50});
  if(error)notFound();
  const items:WardrobeItem[]=data?.items??[];
  const groups=categories.map((category)=>({...category,items:items.filter((item)=>item.category===category.key)}));

  return <main className="visual-closet">
    <header><span>AHA WARDROBE</span><h1>我的图片衣橱</h1><p>{items.length} 件单品 · 只读专属链接</p></header>
    <nav className="closet-categories" aria-label="衣橱分类">
      {groups.map((group)=><a key={group.key} href={`#${group.key}`}><strong>{group.label}</strong><span>{group.items.length}</span></a>)}
    </nav>
    <div className="closet-sections">
      {groups.map((group)=><section className="closet-section" id={group.key} key={group.key}>
        <div className="closet-section-title"><h2>{group.label}</h2><span>{group.items.length} 件</span></div>
        {group.items.length?<div className="visual-grid">{group.items.map((item)=><article key={item.id}>
          <div className="visual-photo"><Image unoptimized width={640} height={800} src={`/api/agent-media/${item.id}?view=${encodeURIComponent(viewId)}`} alt={item.name}/></div>
          <h3>{item.name}</h3><p>{group.label} · {colorLabels[item.primary_color]??item.primary_color}</p>
        </article>)}</div>:<p className="closet-empty">暂时没有{group.label}</p>}
      </section>)}
    </div>
  </main>;
}
