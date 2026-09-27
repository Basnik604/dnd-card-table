export function rollDiceFormula(formula, random=Math.random) {
  const src=String(formula || "").replace(/\s+/g,"");
  if(!src || src.length>80 || !/^[+-]?(?:\d+d\d+|\d+)(?:[+-](?:\d+d\d+|\d+))*$/i.test(src)) throw new Error("Unsupported dice formula");
  let total=0;
  const parts=[],dice=[];
  for(const token of src.match(/[+-]?[^+-]+/g) || []) {
    const sign=token.startsWith("-")?-1:1;
    const body=token.replace(/^[+-]/,"");
    const match=/^(\d{1,3})d(\d{1,4})$/i.exec(body);
    if(match) {
      const count=Number(match[1]),sides=Number(match[2]);
      if(count<1 || count>100 || sides<2 || sides>1000) throw new Error("Dice limits exceeded");
      const rolls=Array.from({length:count},()=>Math.floor(random()*sides)+1);
      const subtotal=rolls.reduce((sum,n)=>sum+n,0)*sign;
      total+=subtotal;
      dice.push(...rolls.map(value=>({sides,value,sign,kept:true})));
      parts.push(`${sign<0?"-":""}${count}d${sides} [${rolls.join(", ")}] = ${subtotal}`);
    } else if(/^\d+$/.test(body)) {
      const value=Number(body)*sign;
      if(!Number.isSafeInteger(value)) throw new Error("Modifier is too large");
      total+=value; parts.push(String(value));
    } else throw new Error("Unsupported dice token");
  }
  if(!Number.isSafeInteger(total)) throw new Error("Roll total is too large");
  return {formula:src,total,parts,dice};
}

export function rollWithMode(formula,mode="",random=Math.random) {
  if(mode!=="advantage" && mode!=="disadvantage") return rollDiceFormula(formula,random);
  const src=String(formula || "").replace(/\s+/g,"");
  const match=/^1d20([+-]\d+)?$/i.exec(src);
  if(!match) throw new Error("Advantage mode supports 1d20 checks and attacks");
  const mod=Number(match[1] || 0);
  if(!Number.isSafeInteger(mod)) throw new Error("Modifier is too large");
  const values=[Math.floor(random()*20)+1,Math.floor(random()*20)+1];
  const kept=mode==="advantage"?Math.max(...values):Math.min(...values);
  const keptIndex=values.indexOf(kept);
  return {
    formula:`${mode==="advantage"?"ADV":"DIS"} ${src}`,total:kept+mod,
    parts:[`d20 [${values.join(", ")}] keep ${kept}`,`modifier ${mod>=0?"+":""}${mod}`],
    dice:values.map((value,index)=>({sides:20,value,sign:1,kept:index===keptIndex}))
  };
}
