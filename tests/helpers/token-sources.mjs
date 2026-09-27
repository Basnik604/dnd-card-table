export const TOKEN_PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
export const tokenSourceIds={character:'11111111-1111-4111-8111-111111111111',zombie:'22222222-2222-4222-8222-222222222222',wolf:'33333333-3333-4333-8333-333333333333'};
export async function seedTokenSources(f) {
  const {character,zombie,wolf}=tokenSourceIds;
  await f.sql`INSERT INTO characters(id,name,class_name,level,portrait_bytes,portrait_mime) VALUES(${character},'Мира','Wizard',5,${Buffer.from(TOKEN_PNG.split(',')[1],'base64')},'image/png')`;
  for(const [id,name,size,type] of [[zombie,'Zombie','Medium','Undead'],[wolf,'Dire Wolf','Large','Beast']]) {
    await f.sql`INSERT INTO content_entities VALUES(${id},${name},'creature','dnd5e-2024')`;
    await f.sql`INSERT INTO creatures VALUES(${id},${size},${type})`;
  }
}
