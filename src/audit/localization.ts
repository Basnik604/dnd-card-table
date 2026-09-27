import "dotenv/config";
import postgres from "postgres";
import {
  RU_GAME_EXACT,
  RU_GAME_GENERATED,
  gameTranslationStatus,
  translateGameEntity
} from "../web/assets/game-ru.mjs";

const DATABASE_URL=process.env.DATABASE_URL;
if(!DATABASE_URL)throw new Error("DATABASE_URL is missing");
const sql=postgres(DATABASE_URL,{max:1,idle_timeout:5});

function pct(done:number,total:number){return total?`${Math.round(done/total*100)}%`:"—";}

type Group={total:number,reference:number,generated:number,pending:string[]};

async function main(){
  const builder=await sql`
    SELECT ce.name_en,cc.content_kind,cc.category,cs.ruleset,cs.document_key AS source_key,cs.name AS source_name
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cs.enabled=true
    ORDER BY cc.content_kind,ce.name_en
  `;

  const content=await sql`
    SELECT ce.name_en,ce.entity_type::text AS entity_type,ce.ruleset,cs.document_key AS source_key,cs.name AS source_name
    FROM content_entities ce
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cs.enabled=true
      AND ce.entity_type::text IN ('creature','spell','equipment','item','magic_item','condition')
    ORDER BY ce.entity_type::text,ce.name_en
  `;

  const summarize=(rows:any[],kindKey:string)=>{
    const groups=new Map<string,Group>();
    for(const row of rows){
      const kind=String(row[kindKey]||"unknown");
      if(!groups.has(kind))groups.set(kind,{total:0,reference:0,generated:0,pending:[]});
      const g=groups.get(kind)!;g.total++;
      const context={ruleset:row.ruleset||null,kind:row.content_kind||row.entity_type||null};
      const status=gameTranslationStatus(row.name_en,context);
      if(status==="reference")g.reference++;
      else if(status==="generated")g.generated++;
      else g.pending.push(`${row.name_en} · ${row.source_name||row.source_key||row.ruleset}`);
    }
    return groups;
  };

  const printGroups=(groups:Map<string,Group>)=>{
    for(const [kind,g] of groups){
      const localized=g.reference+g.generated;
      console.log(`  ${kind}: ${localized}/${g.total} (${pct(localized,g.total)}) · reference ${g.reference} · generated ${g.generated}`);
      if(g.pending.length)console.log("    pending:",g.pending.slice(0,40).join(" | "),g.pending.length>40?`… +${g.pending.length-40}`:"");
    }
  };

  console.log("\nD&D Card Table — RU localization audit");
  console.log("Reference catalog entries:",Object.keys(RU_GAME_EXACT).length);
  console.log("Independent fallback entries:",Object.keys(RU_GAME_GENERATED).length);

  console.log("\nBuilder Data");
  printGroups(summarize(builder,"content_kind"));

  console.log("\nContent Library");
  printGroups(summarize(content,"entity_type"));

  const conflicts=builder.filter(row=>{
    const generic=translateGameEntity(row.name_en,{});
    const contextual=translateGameEntity(row.name_en,{ruleset:row.ruleset,kind:row.content_kind});
    return generic!==contextual;
  });
  if(conflicts.length){
    console.log("\nRuleset-aware terminology overrides");
    for(const row of conflicts.slice(0,50)){
      console.log(`  ${row.ruleset} · ${row.content_kind} · ${row.name_en} -> ${translateGameEntity(row.name_en,{ruleset:row.ruleset,kind:row.content_kind})}`);
    }
  }

  console.log("\nPolicy: DnD.su-aligned short names/terminology are used only for local entities. No site-only records or long third-party translations are imported.");
  await sql.end({timeout:1});
}

main().catch(async error=>{console.error(error);try{await sql.end({timeout:1});}catch{}process.exitCode=1;});
