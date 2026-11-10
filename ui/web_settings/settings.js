(()=>{
  'use strict';
  const root=document.getElementById('sq-settings-preview'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
  let api=null,tab='model',loaded=false,busy=false,models=[],initial=null;
  const form=q('form'),list=q('#sqp-model-options'),prompt=q('#sqp-prompt'),connection=q('[data-connection]'),feedback=q('[data-feedback]');
  const fields={base_url:'#sqp-url',api_key:'#sqp-key',model:'#sqp-model-name',interval_seconds:'#sqp-interval',
    ocr_engine:'#sqp-ocr',font_size:'#sqp-font',summary_hour:'#sqp-hour',panel_opacity:'#sqp-opacity',system_prompt:'#sqp-prompt'};
  function icons(){globalThis.lucide?.createIcons({attrs:{width:16,height:16,'stroke-width':1.7}});}
  function notice(message,error=false){feedback.textContent=message;feedback.dataset.error=String(error);feedback.setAttribute('role',error?'alert':'status');}
  function controls(disabled){qa('form button,form input,form select,form textarea').forEach(node=>node.disabled=disabled);}
  function selectTab(name){tab=name;qa('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===name)));qa('[role=tabpanel]').forEach(panel=>panel.hidden=panel.id!=='sqp-'+name);closeModels();}
  function showPrompt(open){q('.sq-prompt-fold').dataset.open=String(open);q('[data-action=prompt]').setAttribute('aria-expanded',String(open));q('#sqp-prompt-body').inert=!open;}
  function closeModels(){list.hidden=true;q('#sqp-model-name').setAttribute('aria-expanded','false');}
  function openModels(){
    if(!models.length){connection.textContent='请先获取模型列表，也可以直接填写模型名称。';return;}
    list.replaceChildren();const current=q('#sqp-model-name').value;
    for(const name of models){const button=document.createElement('button');button.type='button';button.className='sq-model-option cursor-interaction';button.setAttribute('role','option');button.setAttribute('aria-selected',String(name===current));button.textContent=name;button.addEventListener('click',()=>{q('#sqp-model-name').value=name;closeModels();q('#sqp-model-name').focus();});list.append(button);}
    const box=q('.sq-combo').getBoundingClientRect(),room=innerHeight-box.bottom-12,height=Math.min(220,models.length*40+12);
    list.style.left=box.left+'px';list.style.width=box.width+'px';list.style.top=(room>=height?box.bottom+6:Math.max(8,box.top-height-6))+'px';list.style.maxHeight=Math.min(220,Math.max(60,room>=height?room:box.top-12))+'px';
    list.hidden=false;q('#sqp-model-name').setAttribute('aria-expanded','true');
  }
  function opacity(){const amount=Number(q('#sqp-opacity').value);q('#sqp-opacity-value').value=amount+'%';q('.sq-mini').style.setProperty('--sq-panel-opacity',String(amount/100));}
  function font(){q('#sqp-font-value').value=q('#sqp-font').value;q('[data-type-sample]').style.fontSize=(Number(q('#sqp-font').value)+4)+'px';}
  function count(){q('[data-prompt-count]').value=Array.from(prompt.value).length+' 字';}
  function collect(){const data={};for(const [key,selector] of Object.entries(fields))data[key]=q(selector).value;data.content_capture=q('#sqp-capture').checked;data.doc_read=q('#sqp-doc').checked;data.content_level=q('[name=sqp-level]:checked').value;return data;}
  async function invoke(name,...args){if(!api)throw Error('设置尚未连接，请稍后再试。');const result=await api[name](...args);if(!result?.ok)throw Error(result?.error||'操作未完成，请稍后再试。');return result;}
  async function connectionAction(mode){
    if(busy||!loaded)return;busy=true;qa('[data-action=fetch],[data-action=check]').forEach(button=>button.disabled=true);q('.sq-connection').dataset.state='loading';connection.textContent=mode==='fetch'?'正在获取模型…':'正在检测接口连通性…';
    try{const result=await invoke('models',{base_url:q('#sqp-url').value,api_key:q('#sqp-key').value});models=result.models;
      q('.sq-connection').dataset.state='success';connection.textContent=mode==='fetch'?'已获取 '+models.length+' 个模型。':'连接成功，模型列表接口已响应。未调用模型推理。';
      if(mode==='fetch')openModels();
    }catch(error){q('.sq-connection').dataset.state='error';connection.textContent=error.message;}
    finally{busy=false;qa('[data-action=fetch],[data-action=check]').forEach(button=>button.disabled=false);}
  }
  root.addEventListener('click',async event=>{
    const tabButton=event.target.closest('[data-tab]');if(tabButton){selectTab(tabButton.dataset.tab);return;}
    const button=event.target.closest('[data-action]');if(!button){if(!event.target.closest('.sq-combo'))closeModels();return;}
    const action=button.dataset.action;
    try{
      if(action==='close'||action==='minimize'){await invoke('window_action',action);return;}
      if(!loaded)return;
      if(action==='prompt'){showPrompt(button.getAttribute('aria-expanded')!=='true');return;}
      if(action==='models'){if(list.hidden)openModels();else closeModels();return;}
      if(action==='key'){const input=q('#sqp-key'),shown=input.type==='password';input.type=shown?'text':'password';button.setAttribute('aria-label',shown?'隐藏密钥':'显示密钥');button.setAttribute('aria-pressed',String(shown));button.innerHTML='<i data-lucide="'+(shown?'eye-off':'eye')+'" aria-hidden="true"></i>';icons();return;}
      if(action==='fetch'||action==='check'){await connectionAction(action);return;}
      if(action==='import'){if(busy)return;busy=true;try{const result=await invoke('import_config');if(!result.cancelled){for(const [key,value] of Object.entries(result.config))if(fields[key])q(fields[key]).value=value;notice('已填入旧接口配置，请检查后保存。');}}finally{busy=false;}return;}
      if(action==='start'){button.disabled=true;try{const result=await invoke('start');notice(result.message);q('.sq-start-banner').hidden=true;}finally{button.disabled=false;}}
    }catch(error){notice(error.message,true);}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!loaded||busy)return;
    if(!prompt.value.trim()){selectTab('monitor');showPrompt(true);notice('任务识别提示词不能为空。',true);setTimeout(()=>prompt.focus(),550);return;}
    busy=true;controls(true);notice('正在保存…');
    try{const result=await invoke('save',collect());initial=collect();notice(result.message);q('.sq-start-banner').hidden=!result.needsStart;}
    catch(error){notice(error.message,true);}finally{busy=false;controls(false);}
  });
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(!list.hidden){closeModels();q('#sqp-model-name').focus();}else invoke('window_action','close').catch(error=>notice(error.message,true));}
    if(event.target.matches('[data-tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=qa('[data-tab]'),index=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;selectTab(tabs[next].dataset.tab);tabs[next].focus();}
    if(event.target===q('#sqp-model-name')&&event.key==='ArrowDown'){event.preventDefault();openModels();list.querySelector('button')?.focus();}
    if(event.target.matches('.sq-model-option')&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const items=[...list.children],index=items.indexOf(event.target);items[(index+(event.key==='ArrowDown'?1:items.length-1))%items.length].focus();}
  });
  q('#sqp-opacity').addEventListener('input',opacity);q('#sqp-font').addEventListener('input',font);prompt.addEventListener('input',count);
  q('.sq-window-tools').addEventListener('mousedown',event=>event.stopPropagation());
  qa('[role=tabpanel]').forEach(panel=>panel.addEventListener('scroll',closeModels,{passive:true}));window.addEventListener('resize',closeModels);
  controls(true);selectTab('model');showPrompt(false);
  async function ready(){
    if(api)return;api=window.pywebview?.api;if(!api)return;
    try{const data=await invoke('load');for(const [key,selector] of Object.entries(fields)){const value=(key in data.config)?data.config[key]:data.ui[key];if(value!==undefined&&value!==null)q(selector).value=value;}
      q('#sqp-capture').checked=data.config.content_capture!==false;q('#sqp-doc').checked=data.config.doc_read!==false;
      qa('[name=sqp-level]').forEach(input=>input.checked=input.value===data.config.content_level);
      const palettes={glass:['#14171f','#232a38','#f1f5fc','#a8b7cc','#ffd166','#92cbb1','#38465c'],transparent:['#182330','#2b3c4e','#ffffff','#cfdaea','#ffe1a0','#9dcfb8','#506479'],journal:['#f4efe3','#eae1ce','#342e29','#6b6054','#96623b','#3c7052','#c6b9a2'],night:['#101b25','#1c2e3c','#edf8ff','#abc4d6','#8ae8ff','#68edb8','#3e566a']};
      const colors=palettes[data.skin]||palettes.glass;['bg','hi','fg','muted','gold','green','stroke'].forEach((name,index)=>root.style.setProperty('--sq-'+name,colors[index]));root.style.setProperty('--sq-quiet',colors[6]+'77');root.style.colorScheme=data.skin==='journal'?'light':'dark';document.body.style.backgroundColor=colors[0];
      opacity();font();count();icons();loaded=true;controls(false);initial=collect();notice('修改后点击保存设置。');
    }catch(error){notice('设置读取失败：'+error.message+' 请关闭后重新打开。',true);}
  }
  window.addEventListener('pywebviewready',ready);if(window.pywebview?.api)ready();
})();
