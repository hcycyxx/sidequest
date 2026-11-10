(()=>{
  const root=document.getElementById('sq-settings-preview'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
  const section=q('#sqp-workbuddy'),status=q('#sqp-wb-status'),accounts=q('#sqp-wb-accounts'),qr=q('#sqp-wb-qr');
  let busy=false,login=null,pollTimer=0,epoch=0;
  function note(message,error=false){status.textContent=message;status.dataset.error=String(error);status.setAttribute('role',error?'alert':'status');}
  async function rpc(action,payload){const api=window.pywebview?.api;if(!api)throw Error('设置尚未连接');const result=await api.wb_action(action,payload||{});if(!result?.ok)throw Error(result?.error||'操作未完成');return result;}
  function setBusy(value){busy=value;qa('[data-wb]').forEach(button=>button.disabled=value);section.dataset.busy=String(value);}
  function renderAccounts(data){accounts.replaceChildren();for(const item of data.accounts||[]){const option=document.createElement('option');option.value=item.id;option.textContent=(item.region==='global'?'国际版 · ':'国内版 · ')+(item.label||item.nickname||'WorkBuddy 账号');accounts.append(option);}if(!accounts.children.length){const option=document.createElement('option');option.value='';option.textContent='请先扫码登录';accounts.append(option);}else accounts.value=data.activeId||accounts.options[0].value;}
  async function refresh(){setBusy(true);note('正在连接本机 WorkBuddy 桥接…');try{renderAccounts(await rpc('accounts'));note(accounts.value?'桥接已就绪，选择账号后点击“使用此账号”。':'桥接已启动，请选择账号区域并扫码登录。');}catch(error){note(error.message,true);}finally{setBusy(false);}}
  async function cancel(){epoch++;clearTimeout(pollTimer);const old=login;login=null;qr.hidden=true;section.dataset.waiting='false';if(old)try{await rpc('cancel',{loginId:old.loginId});}catch(error){} }
  async function poll(version){
    if(version!==epoch||!login)return;
    if(Date.now()>login.expiresAt){await cancel();note('二维码已过期，请重新扫码。',true);return;}
    try{const result=await rpc('poll',{loginId:login.loginId});if(version!==epoch)return;
      if(result.done){login=null;qr.hidden=true;section.dataset.waiting='false';renderAccounts(await rpc('accounts'));if(result.account?.id)accounts.value=result.account.id;note('登录成功，请点击“使用此账号”，再保存设置。');return;}
      note('等待扫码与授权…');
    }catch(error){if(version===epoch)note('授权查询暂时失败，正在重试；也可以取消后重新登录。',true);}
    if(version===epoch&&login)pollTimer=setTimeout(()=>poll(version),2500);
  }
  q('#sqp-provider').addEventListener('change',async()=>{section.hidden=q('#sqp-provider').value!=='workbuddy';if(section.hidden){await cancel();return;}refresh();});
  root.addEventListener('sidequest:settings-loaded',()=>{section.hidden=q('#sqp-provider').value!=='workbuddy';if(!section.hidden)refresh();});
  section.addEventListener('click',async event=>{
    const button=event.target.closest('[data-wb]');if(!button||busy)return;const action=button.dataset.wb;
    try{
      if(action==='cancel'){await cancel();note('已取消登录。');return;}
      if(action==='refresh'){await refresh();return;}
      if(action==='open'){if(login)await rpc('open',{loginId:login.loginId});return;}
      setBusy(true);
      if(action==='login'){await cancel();const version=epoch;note('正在生成登录二维码…');const result=await rpc('login',{region:q('#sqp-wb-region').value});if(version!==epoch||q('#sqp-provider').value!=='workbuddy'){try{await rpc('cancel',{loginId:result.loginId});}catch(error){}return;}login=result;qr.querySelector('img').src=result.qr;qr.hidden=false;section.dataset.waiting='true';note('请用手机扫描二维码，在官方页面确认授权。');pollTimer=setTimeout(()=>poll(version),2500);}
      if(action==='import'){note('正在读取这台电脑已登录的账号…');await rpc('import',{region:q('#sqp-wb-region').value});renderAccounts(await rpc('accounts'));note('账号已读取，请选用并保存设置。');}
      if(action==='select'){note('正在选用账号…');const result=await rpc('select',{accountId:accounts.value});q('#sqp-url').value=result.connection.base_url;q('#sqp-key').value=result.connection.api_key;note('账号已选用，连接地址与密钥已填入。可获取模型列表，最后保存设置。');}
    }catch(error){note(error.message,true);}finally{setBusy(false);}
  });
  window.addEventListener('pagehide',()=>{epoch++;clearTimeout(pollTimer);},{once:true});
})();
