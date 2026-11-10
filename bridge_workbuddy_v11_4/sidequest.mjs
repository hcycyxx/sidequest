// Adapt the existing web bridge without changing its upstream/account implementation.
import { Store } from './src/store.js';
import { Engine } from './src/engine.js';
import { makeServer } from './src/server.js';
import { readAuthFile } from './vendor/credentials.js';
import { createHmac,randomBytes } from 'node:crypto';
import { mkdir,open,readFile,unlink } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

const data=process.env.SIDEQUEST_BRIDGE_DATA,port=Number(process.env.SIDEQUEST_BRIDGE_PORT);
const adminToken=process.env.SIDEQUEST_BRIDGE_CONTROL;
delete process.env.SIDEQUEST_BRIDGE_CONTROL;
if(!data||!adminToken||!Number.isInteger(port)||port<1024||port>65535)throw Error('Bridge launch configuration is incomplete');
await mkdir(data,{recursive:true});process.env.DSH_HOME=join(data,'desktop-discovery');
const lockPath=join(data,'sidequest-bridge.lock');let lock;
try{lock=await open(lockPath,'wx');}
catch(error){
  if(error.code!=='EEXIST')throw error;
  const previous=Number(await readFile(lockPath,'utf8'));
  if(!Number.isSafeInteger(previous)||previous<=0)throw Error('Bridge lock needs inspection; existing data preserved');
  let running=true;
  try{process.kill(previous,0);}catch(error){if(error.code==='ESRCH')running=false;else throw error;}
  if(running)throw Error('An existing bridge already owns this account directory');
  await unlink(lockPath);lock=await open(lockPath,'wx');
}
await lock.writeFile(String(process.pid));
process.once('exit',()=>{try{unlinkSync(lockPath);}catch{}});
const store=await new Store(data).init();
if(!store.state.apiKey)await store.change(state=>{state.apiKey='sqwb_'+randomBytes(24).toString('hex');});
const engine=new Engine(store,{importDesktop:region=>readAuthFile(region==='cn'?'cn':'ai')});
const server=makeServer(engine,{apiKey:store.state.apiKey,adminToken,maxBodyBytes:4*1024*1024,version:'SideQuest-11.4'});
const handler=server.listeners('request')[0];server.removeAllListeners('request');
server.on('request',(req,res)=>{
  const expected='127.0.0.1:'+port;
  if(req.headers.host!==expected){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,'http://'+expected);
  if(url.pathname==='/api/session'||url.pathname==='/api/shutdown') {res.writeHead(404);res.end();return;}
  if(url.pathname==='/health'){
    const challenge=url.searchParams.get('challenge')||'';
    const proof=createHmac('sha256',adminToken).update(challenge).digest('hex');
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({service:'sidequest-workbuddy',version:'11.4',pid:process.pid,proof,ready:!!store.state.activeId}));return;
  }
  handler(req,res);
});
server.on('error',()=>{console.error('SideQuest bridge could not bind its port');process.exitCode=1;});
server.listen(port,'127.0.0.1');
