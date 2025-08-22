const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const crypto=require("node:crypto");
const zlib=require("node:zlib");
function rndAlpha(n){const a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";let s="";for(let i=0;i<n;i++)s+=a[Math.floor(Math.random()*a.length)];return s}
function rndTag(){const a=["O","X","U","L","M","K","Q","Z","A","R","T","V","Y","N","H","C","D","E","F","G","P","S","B","J","W","I"];return a[Math.floor(Math.random()*a.length)]+a[Math.floor(Math.random()*a.length)]+"_"+rndAlpha(8)}
function b64(x){return Buffer.from(String(x),"utf8").toString("base64")}
function ub64(x){try{return Buffer.from(String(x),"base64").toString("utf8")}catch(e){return""}}
function uid(){return crypto.randomBytes(16).toString("hex")}
function now(){return Date.now()}
function iso(){const d=new Date();const z=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+"T"+z(d.getHours())+":"+z(d.getMinutes())+":"+z(d.getSeconds())+"."+String(d.getMilliseconds()).padStart(3,"0")}
function pickBase(){const win=process.platform==="win32";const c=[];if(win){if(process.env.LOCALAPPDATA)c.push(process.env.LOCALAPPDATA);if(process.env.APPDATA)c.push(process.env.APPDATA);if(process.env.PROGRAMDATA)c.push(process.env.PROGRAMDATA)}c.push(os.homedir());for(const p of c){try{fs.accessSync(p,fs.constants.W_OK);return p}catch(e){}}return process.cwd()}
function ensure(p){fs.mkdirSync(p,{recursive:true});return p}
function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function writeAtomic(p,data){const d=path.dirname(p);const t=path.join(d,"."+uid()+".tmp");fs.writeFileSync(t,data);fs.renameSync(t,p)}
function readJSON(p){try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){return null}}
function writeJSON(p,o){writeAtomic(p,JSON.stringify(o))}
function gz(b){return zlib.gzipSync(b)}
function gunz(b){return zlib.gunzipSync(b)}
class Box{constructor(secret){this.secret=secret||crypto.randomBytes(48).toString("hex")}
key(){return crypto.createHash("sha256").update(this.secret).digest()}
enc(str){const iv=crypto.randomBytes(12);const key=this.key();const c=crypto.createCipheriv("aes-256-gcm",key,iv);const raw=Buffer.isBuffer(str)?str:Buffer.from(String(str),"utf8");const comp=gz(raw);const ct=Buffer.concat([c.update(comp),c.final()]);const tag=c.getAuthTag();return Buffer.concat([Buffer.from("01","hex"),iv,tag,ct]).toString("base64")}
dec(b64s){try{const raw=Buffer.from(b64s,"base64");if(raw.length<1+12+16)return"";const ver=raw.subarray(0,1).toString("hex");if(ver!=="01")return"";const iv=raw.subarray(1,13);const tag=raw.subarray(13,29);const ct=raw.subarray(29);const d=crypto.createDecipheriv("aes-256-gcm",this.key(),iv);d.setAuthTag(tag);const comp=Buffer.concat([d.update(ct),d.final()]);return gunz(comp).toString("utf8")}catch(e){return""}}
rotate(newSecret){const old=this.secret;this.secret=newSecret||crypto.randomBytes(48).toString("hex");return old}}
class Journal{constructor(root){this.dir=ensure(path.join(root,"dev","logs"));this.base64=true;this.stream=null;this.file=null;this.open()}
open(){if(this.stream)this.stream.end();const name=rndAlpha(6)+"_"+iso().replace(/[:.]/g,"").replace("T","_")+".log";this.file=path.join(this.dir,name);this.stream=fs.createWriteStream(this.file,{flags:"a"})}
line(s){try{const x=this.base64?b64(s):s;this.stream.write(x+"\n")}catch(e){}}
purge(n){try{const files=fs.readdirSync(this.dir).filter(f=>f.endsWith(".log")).map(f=>({f:path.join(this.dir,f),t:fs.statSync(path.join(this.dir,f)).mtimeMs})).sort((a,b)=>a.t-b.t);while(files.length>n){const x=files.shift();try{fs.unlinkSync(x.f)}catch(e){}}}catch(e){}}}
class Lock{constructor(dir,name){this.p=path.join(dir,name+".lock")}
acq(to){const t0=now();while(true){try{fs.writeFileSync(this.p,process.pid+":"+iso(),{flag:"wx"});return true}catch(e){}if(to!=null&&now()-t0>to)return false;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10)}}
rel(){try{fs.unlinkSync(this.p)}catch(e){}}}
class Index{constructor(dir,box){this.dir=dir;this.box=box;this.file=null;this.map={};this.rev={};this.loaded=false}
load(){if(this.loaded)return;const files=fs.readdirSync(this.dir).filter(f=>f.endsWith(".idx"));this.file=path.join(this.dir,files[0]||("."+rndAlpha(4)+rndAlpha(6)+".idx"));const data=readJSON(this.file)||{};this.map=data.map||{};this.rev=data.rev||{};this.loaded=true}
save(){writeJSON(this.file,{map:this.map,rev:this.rev})}
encKey(k){return this.box.enc(k)}
decKey(e){return this.box.dec(e)}
fileForCreate(k){this.load();const kk=String(k);const e=this.encKey(kk);if(!this.map[e]){const fname=rndTag()+"."+rndAlpha(3);this.map[e]=fname;this.rev[fname]=e;this.save()}return path.join(this.dir,this.map[e])}
fileIfExists(k){this.load();const e=this.encKey(String(k));if(!this.map[e])return null;return path.join(this.dir,this.map[e])}
hasKey(k){this.load();const e=this.encKey(String(k));return !!this.map[e]}
all(){this.load();const out=[];for(const e in this.map){const k=this.decKey(e);if(k)out.push({key:k,file:path.join(this.dir,this.map[e])})}return out}}
class Vault{constructor(root,ns){this.root=root;this.ns=ns||"default";this.dir=ensure(path.join(root,this.ns));this.data=ensure(path.join(this.dir,rndTag()));this.tmp=ensure(path.join(this.dir,"tmp"));this.cache=ensure(path.join(this.dir,"cache"));this.dev=ensure(path.join(this.dir,"dev"))}}
class Store{constructor({base,namespace,secret,maxValueBytes}={}){this.base=base||pickBase();this.root=ensure(path.join(this.base,rndTag()));this.vault=new Vault(this.root,namespace);this.box=new Box(secret);this.journal=new Journal(this.vault.dir);this.lock=new Lock(this.vault.dir,"keychain");this.index=new Index(this.vault.data,this.box);this.limits={maxValueBytes:maxValueBytes||8*1024*1024};this.metaFile=path.join(this.vault.dir,".meta.json");this.meta=readJSON(this.metaFile)||{exp:{},createdAt:iso(),namespace:this.vault.ns};this._gcTimer=null;this._scheduleGC()}
_scheduleGC(){const t=randInt(60000,120000);clearTimeout(this._gcTimer);this._gcTimer=setTimeout(()=>{this.gc();this._scheduleGC()},t)}
_gcExpiredNow(){const ex=this.meta.exp||{};let changed=false;for(const k in ex){if(now()>ex[k]){const f=this.index.fileIfExists(k);if(f){try{fs.unlinkSync(f)}catch(e){}}delete ex[k];changed=true;this.journal.line("EXP:"+k)}}if(changed)this._saveMeta()}
_saveMeta(){writeJSON(this.metaFile,this.meta)}
ensureSize(buf){if(Buffer.byteLength(buf)>this.limits.maxValueBytes)throw new Error("ValueTooLarge")}
put(k,v,opt={}){if(!this.lock.acq(5000))throw new Error("LockTimeout");try{let val;if(typeof v==="string"){val=v}else{try{val=JSON.stringify(v)}catch(e){val=String(v)}}const payload=JSON.stringify({v:val,exp:opt.ttlMs?now()+opt.ttlMs:null,ts:iso()});this.ensureSize(payload);const enc=this.box.enc(payload);const file=this.index.fileForCreate(k);writeAtomic(file,enc);if(opt.ttlMs){this.meta.exp[k]=now()+opt.ttlMs;this._saveMeta()}else{delete this.meta.exp[k];this._saveMeta()}this.journal.line("PUT:"+k);return true}finally{this.lock.rel()}}
get(k){if(!this.lock.acq(5000))throw new Error("LockTimeout");try{if(this.meta.exp[k]&&now()>this.meta.exp[k]){const f=this.index.fileIfExists(k);if(f){try{fs.unlinkSync(f)}catch(e){}}delete this.meta.exp[k];this._saveMeta();this.journal.line("MISS_EXP:"+k);return null}const f=this.index.fileIfExists(k);if(!f){this.journal.line("MISS:"+k);return null}let enc;try{enc=fs.readFileSync(f,"utf8")}catch(e){this.journal.line("MISS_IO:"+k);return null}const dec=this.box.dec(enc);if(!dec){this.journal.line("DECERR:"+k);return null}try{const obj=JSON.parse(dec);return obj.v}catch(e){return dec}}finally{this.lock.rel()}}
has(k){return this.index.hasKey(k)&&(()=>{const f=this.index.fileIfExists(k);return f?fs.existsSync(f):false})()}
delete(k){if(!this.lock.acq(5000))throw new Error("LockTimeout");try{const f=this.index.fileIfExists(k);if(f){try{fs.unlinkSync(f)}catch(e){}}delete this.meta.exp[k];this._saveMeta();this.journal.line("DEL:"+k);return true}finally{this.lock.rel()}}
keys(){return this.index.all().map(x=>x.key)}
list(){return this.keys()}
stats(){const files=this.index.all();let size=0;for(const it of files){try{size+=fs.statSync(it.file).size}catch(e){}}return{keys:files.length,bytes:size,namespace:this.vault.ns,root:this.root}}
rotateSecret(newSecret){if(!this.lock.acq(10000))throw new Error("LockTimeout");try{const items=this.index.all();const old=this.box.rotate(newSecret);for(const it of items){let enc;try{enc=fs.readFileSync(it.file,"utf8")}catch(e){continue}const dec=this.box.dec(enc);if(!dec)continue;let val=null;try{const obj=JSON.parse(dec);val=obj.v;const ttl=this.meta.exp[it.key]?Math.max(0,this.meta.exp[it.key]-now()):null;const payload=JSON.stringify({v:val,exp:ttl?now()+ttl:null,ts:iso()});const fresh=this.box.enc(payload);writeAtomic(it.file,fresh)}catch(e){}}this.journal.line("ROTATE:"+iso());return old}finally{this.lock.rel()}}
export(){const out={v:[],m:this.meta,ns:this.vault.ns,ts:iso(),alg:"aes-256-gcm"};for(const it of this.index.all()){try{const enc=fs.readFileSync(it.file,"utf8");out.v.push({k:it.key,e:enc})}catch(e){}}return out}
import(data,{merge}={merge:true}){if(!data||!Array.isArray(data.v))return false;if(!this.lock.acq(10000))throw new Error("LockTimeout");try{if(!merge){for(const it of this.index.all()){try{fs.unlinkSync(it.file)}catch(e){}}this.meta.exp={}}for(const row of data.v){const file=this.index.fileForCreate(row.k);writeAtomic(file,row.e)}this.meta=data.m||this.meta;this._saveMeta();this.journal.line("IMPORT:"+iso());return true}finally{this.lock.rel()}}
gc(){this._gcExpiredNow();this.journal.purge(randInt(5,10))}}
class API{constructor(cfg){this.store=new Store(cfg||{})}
new(k,v,opt){return this.store.put(k,v,opt)}
get(k){return this.store.get(k)}
delete(k){return this.store.delete(k)}
has(k){return this.store.has(k)}
list(){return this.store.list()}
keys(){return this.store.keys()}
stats(){return this.store.stats()}
rotateSecret(s){return this.store.rotateSecret(s)}
export(){return this.store.export()}
import(d,o){return this.store.import(d,o)}
put(k,v,opt){return this.store.put(k,v,opt)}}
const api=new API({});
module.exports=api;
module.exports.API=API
