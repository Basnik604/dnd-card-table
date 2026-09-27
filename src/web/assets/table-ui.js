(() => {
  const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let tray,faces,total,label,formula,detail,outcome,busy=false,sequence=0;

  function ensureTray() {
    if(tray) return;
    tray=make('aside','dice-tray');tray.hidden=true;tray.setAttribute('aria-label','Dice result');
    const close=make('button','dice-close','×');close.type='button';close.setAttribute('aria-label','Close dice result');
    close.addEventListener('click',()=>{tray.hidden=true;});
    const kicker=make('p','dice-kicker','At the table · dice');
    label=make('h3','dice-label');faces=make('div','dice-faces');faces.setAttribute('aria-hidden','true');
    const row=make('div','dice-total-row');row.append(make('span','','Total'));total=make('strong','','—');row.append(total);
    formula=make('p','dice-formula');detail=make('p','dice-detail');outcome=make('p','dice-outcome');
    const live=make('div');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');live.append(row,formula,detail,outcome);
    tray.append(close,kicker,label,faces,live);document.body.append(tray);
  }

  function drawDice(dice,pending=false) {
    faces.replaceChildren();
    const shapes={
      4:'M26 3 49 47 3 47Z',6:'M7 7H45V45H7Z',8:'M26 2 49 26 26 50 3 26Z',
      10:'M26 2 48 21 38 45 14 45 4 21Z',12:'M26 2 49 20 40 47 12 47 3 20Z',
      20:'M26 2 47 14 47 38 26 50 5 38 5 14Z'
    };
    dice.slice(0,24).forEach((die,index)=>{
      const piece=make('div','dice-piece'+(die.kept===false?' discarded':''));piece.style.setProperty('--die-index',index);
      const icon=make('div','die-icon');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 52 52');
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',shapes[die.sides] || 'M26 2A24 24 0 1 0 26 50A24 24 0 1 0 26 2Z');svg.append(path);
      if([8,10,12,20].includes(Number(die.sides))) {
        const facet=document.createElementNS(svg.namespaceURI,'path');facet.setAttribute('d','M14 17 38 17 42 36 26 43 10 36Z');facet.setAttribute('fill','none');facet.setAttribute('opacity','.3');svg.append(facet);
      }
      icon.append(svg,make('strong','',pending?'?':die.value));piece.append(icon,make('small','',`d${die.sides}${die.kept===false?' · dropped':''}`));faces.append(piece);
    });
    if(dice.length>24) faces.append(make('small','dice-detail',`+ ${dice.length-24} dice · full breakdown below`));
  }

  function previewDice(value,mode) {
    if(mode==='advantage' || mode==='disadvantage') return [{sides:20},{sides:20}];
    const dice=[];
    for(const match of String(value || '').matchAll(/(\d+)d(\d+)/gi)) {
      const count=Math.min(Number(match[1]),24-dice.length);
      for(let i=0;i<count;i++) dice.push({sides:Number(match[2])});
    }
    return dice;
  }

  function beginRoll(name,dice) {
    ensureTray();const ticket=++sequence;
    tray.hidden=false;tray.classList.remove('is-error');tray.classList.add('is-rolling');
    label.textContent=name || 'Dice roll';total.textContent='…';formula.textContent='Rolling…';detail.textContent='';outcome.textContent='';drawDice(dice,true);
    return {ticket,started:performance.now()};
  }

  async function finishRoll(result,state) {
    const remaining=(reduced.matches?0:650)-(performance.now()-state.started);
    if(remaining>0) await new Promise(resolve=>setTimeout(resolve,remaining));
    if(state.ticket!==sequence) return;
    tray.classList.remove('is-rolling');drawDice(result.dice || []);
    total.textContent=String(result.total);formula.textContent=result.formula || '';
    detail.textContent=(result.parts || []).join('\n');outcome.textContent=result.outcome || '';
  }

  window.DndDice={show:async(result,name)=>{
    const state=beginRoll(name,result.dice || []);await finishRoll(result,state);
  }};

  function applyEffects(effects) {
    if(!effects) return;
    if(Array.isArray(effects.resources)) effects.resources.forEach(resource=>applyEffects({resource}));
    if(typeof effects.subclassControlsHtml==='string') document.querySelectorAll('[data-subclass-controls]').forEach(el=>{
      if(el.dataset.subclassControls===effects.characterId) el.innerHTML=effects.subclassControlsHtml;
    });
    if(typeof effects.flight==='boolean') document.querySelectorAll('[data-subclass-flight]').forEach(el=>el.hidden=!effects.flight);
    if(Number.isFinite(effects.tempHp)) {
      document.querySelectorAll('[data-temp-hp-value]').forEach(el=>el.textContent=String(effects.tempHp));
      document.querySelectorAll('[data-temp-hp-input]').forEach(el=>el.value=String(effects.tempHp));
    }
    if(effects.resource) document.querySelectorAll('[data-resource-empty]').forEach(el=>{
      if(el.dataset.resourceEmpty===effects.resource.key) el.hidden=effects.resource.current>0;
    });
    if(effects.hp) {
      document.querySelectorAll('[data-hp-value]').forEach(el=>el.textContent=`${effects.hp.current} / ${effects.hp.max}`);
      document.querySelectorAll('[data-hp-fill]').forEach(el=>el.style.width=`${Math.max(0,Math.min(100,100*effects.hp.current/Math.max(1,effects.hp.max)))}%`);
    }
    if(effects.resource) document.querySelectorAll('[data-resource-key]').forEach(el=>{
      if(el.dataset.resourceKey!==effects.resource.key) return;
      el.textContent=`${effects.resource.current} / ${effects.resource.max}`;
      el.closest('.resource-row')?.querySelectorAll('[data-live-roll] button').forEach(button=>{
        button.dataset.exhausted=String(effects.resource.current<=0);button.disabled=effects.resource.current<=0;
      });
    });
    if(effects.resource) document.querySelectorAll('[data-resource-consumer]').forEach(el=>{
      if(el.dataset.resourceConsumer!==effects.resource.key) return;
      el.querySelectorAll('[data-spend-resource]').forEach(button=>{
        button.dataset.exhausted=String(effects.resource.current<=0);button.disabled=effects.resource.current<=0;
      });
    });
    if(typeof effects.concentrationHtml==='string') {
      document.querySelectorAll('[data-concentration-area]').forEach(el=>{
        if(effects.characterId && el.dataset.concentrationCharacter!==effects.characterId) return;
        el.innerHTML=effects.concentrationHtml;
      });
      if(!effects.concentrationHtml) document.querySelectorAll('.concentration-chip').forEach(el=>el.remove());
    }
  }

  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement)) return;
    // A control named "action" shadows HTMLFormElement.action (class actions
    // have exactly that hidden input). Read the URL attribute, not the property.
    const url=new URL(form.getAttribute('action') || location.href,document.baseURI);
    const actionOnly=form.hasAttribute('data-live-action');
    if(url.origin!==location.origin || (url.pathname!=='/roll' && !form.hasAttribute('data-live-roll') && !actionOnly)) return;
    event.preventDefault();if(busy) return;
    busy=true;
    const button=event.submitter || form.querySelector('button[type="submit"],button:not([type])');
    const previousDisabled=button?.disabled || false;
    const body=new URLSearchParams(new FormData(form));
    const rollFormula=body.get('formula') || form.dataset.rollFormula || '1d20';
    const name=body.get('label') || form.dataset.rollLabel || button?.textContent || 'Dice roll';
    const state=actionOnly?null:beginRoll(name,previewDice(rollFormula,body.get('mode') || form.dataset.rollMode));
    if(button) button.disabled=true;
    form.setAttribute('aria-busy','true');
    try {
      // Keep the live-roll JSON signal inside the POST body instead of changing the URL.
      // This avoids local routing/proxy edge cases where a query-marked action URL can 404.
      body.set('_response','json');
      // Class-action live rolls use a dedicated JSON endpoint. This avoids sharing
      // the browser form route, whose normal contract is a 303 redirect to HTML.
      const requestUrl=new URL(url);
      if((form.hasAttribute('data-live-roll') || actionOnly) && /^\/character\/[^/]+\/class-action$/.test(requestUrl.pathname)) {
        requestUrl.pathname='/api'+requestUrl.pathname;
      }
      const response=await fetch(requestUrl,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body,redirect:'error'});
      const contentType=String(response.headers.get('content-type')||'').toLowerCase();
      if(!contentType.includes('application/json')) {
        const text=await response.text();
        const hint=text.trim().startsWith('<')
          ? 'Server returned an HTML page instead of roll data. Refresh the page before retrying; the action may already have been spent.'
          : 'Server returned a non-JSON response.';
        throw new Error(`${hint} HTTP ${response.status}.`);
      }
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || 'Could not complete the roll');
      applyEffects(result.effects);
      if(form.hasAttribute('data-subclass-action')) form.querySelectorAll('input[name="confirmed"]').forEach(el=>el.checked=false);
      if(state) await finishRoll(result,state);
      if(form.isConnected) {
        let output=form.querySelector('[data-roll-output]');
        if(!output) { output=make('output','inline-roll-value');output.dataset.rollOutput='';form.append(output); }
        output.textContent=actionOnly?result.outcome:`= ${result.total}`;output.title=(result.parts || []).join('; ');
      }
    } catch(error) {
      if(!state) {
        let output=form.querySelector('[data-action-error]');
        if(!output){output=make('p','small-note');output.dataset.actionError='';output.setAttribute('role','alert');form.append(output);}
        output.textContent=error.message || 'Could not reach the server. Check the connection and try again.';
      }else if(state.ticket===sequence) {
        tray.classList.remove('is-rolling');tray.classList.add('is-error');total.textContent='—';formula.textContent='Roll failed';
        detail.textContent=error.message || 'Could not reach the server. Check the connection and try again.';
      }
    } finally {
      busy=false;form.removeAttribute('aria-busy');
      if(button) button.disabled=previousDisabled || button.dataset.exhausted==='true';
    }
  });

  function updateAc(form) {
    const manual=form.querySelector('[name="ac_mode"]')?.value==='manual';
    const field=form.querySelector('[name="armor_class"]');if(field) field.disabled=!manual;
    const help=form.querySelector('[data-ac-auto-help]');if(help) help.hidden=manual;
  }
  document.querySelectorAll('.ac-settings-form').forEach(updateAc);
  document.addEventListener('change',event=>{
    const field=event.target;
    if(field.matches('.ac-settings-form [name="ac_mode"]')) updateAc(field.form);
    if(field.matches('.spell-cast-form [name="slot_level"]')) {
      const cost=field.closest('.spell-cast-row')?.querySelector('[data-slot-cost]');
      if(cost) cost.textContent=`1 spell slot · level ${field.value}`;
    }
  });
  document.addEventListener('pointerdown',event=>document.querySelectorAll('.ac-settings[open]').forEach(el=>{if(!el.contains(event.target))el.open=false;}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(tray)tray.hidden=true;document.querySelectorAll('.ac-settings[open]').forEach(el=>el.open=false);}});
})();
