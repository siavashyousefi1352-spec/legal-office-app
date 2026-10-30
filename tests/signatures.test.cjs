const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const path=owner+'/signature-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png';
const reference='profile-signatures/'+path;
function setup(options={}){
 const calls=[],messages=[];
 const ctx={crypto:{randomUUID:()=> 'cccccccc-cccc-cccc-cccc-cccccccccccc'},clearTimeout(){},setTimeout(){},document:{getElementById:()=>null},toast:m=>messages.push(m),cloudProfile:{id:owner,signature_path:reference},refreshProfileUI:async()=>{calls.push(['refresh'])},sb:{
 auth:{getUser:async()=>({data:{user:{id:options.user||owner}}})},
 storage:{from:bucket=>({
 createSignedUrl:async(p,ttl)=>{calls.push(['sign',bucket,p,ttl]);return options.signError?{error:{}}:{data:{signedUrl:'https://synthetic.invalid/signed'}}},
 upload:async(p,file,o)=>{calls.push(['upload',bucket,p,o]);return {error:options.uploadError}},
 remove:async paths=>{calls.push(['remove',bucket,paths]);return {data:options.emptyDelete?[]:[{name:paths[0]}],error:options.deleteError}}
 })},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {error:options.rpcError}}
 }};
 vm.createContext(ctx);
 const helpers=html.slice(html.indexOf("const SIGNATURE_BUCKET="),html.indexOf('async function getCloudProfile'));
 const operations=html.slice(html.indexOf('async function uploadMySignature(file)'),html.indexOf('async function imageFileToAvatarDataUrl'));
 vm.runInContext(helpers+'\n'+operations,ctx);
 return {ctx,calls,messages};
}
test('sign only the owner private reference with a 60 second TTL',async()=>{
 const {ctx,calls}=setup();await ctx.personalAssetUrl(reference,owner);
 assert.deepEqual(calls,[['sign','profile-signatures',path,60]]);
});
test('reject public, foreign, traversal and external references before Storage',async()=>{
 const {ctx,calls}=setup();
 for(const p of [path,'https://example.invalid/image','profile-signatures/other/signature-a.png',reference+'/../other'])await assert.rejects(ctx.personalAssetUrl(p,owner));
 assert.equal(calls.length,0);
});
test('failed signing never falls back to public access',async()=>{
 const {ctx,calls}=setup({signError:true});await assert.rejects(ctx.personalAssetUrl(reference,owner));assert.equal(calls.length,1);
});
test('new upload is immutable and stored in the private bucket',async()=>{
 const {ctx,calls}=setup();await ctx.uploadMySignature({name:'ignored.svg',type:'image/png',size:10});
 const upload=calls.find(x=>x[0]==='upload');assert.equal(upload[1],'profile-signatures');assert.equal(upload[3].upsert,false);
 assert.equal(calls.find(x=>x[0]==='rpc')[2].p_signature_path,'profile-signatures/'+upload[2]);
});
test('reject SVG and oversized files without requests',async()=>{
 const {ctx,calls}=setup();await ctx.uploadMySignature({type:'image/svg+xml',size:10});await ctx.uploadMySignature({type:'image/png',size:5242881});assert.equal(calls.length,0);
});
test('session identity mismatch does not mutate files or profiles',async()=>{
 const {ctx,calls}=setup({user:'other'});await ctx.uploadMySignature({type:'image/png',size:10});await ctx.removeMySignature();assert.equal(calls.length,0);
});
test('unlink expected reference before deleting only that private object',async()=>{
 const {ctx,calls,messages}=setup();await ctx.removeMySignature();
 assert.equal(calls[0][1],'clear_my_signature');assert.equal(calls[0][2].p_expected_path,reference);
 assert.equal(calls[1][0],'remove');assert.equal(calls[1][1],'profile-signatures');assert.equal(calls[1][2][0],path);
 assert.equal(ctx.cloudProfile.signature_path,null);assert.equal(messages[0],'امضا و فایل آن حذف شد');
});
test('stale/failed unlink preserves the existing file and reference',async()=>{
 const {ctx,calls}=setup({rpcError:{}});await ctx.removeMySignature();assert.equal(calls.length,1);assert.equal(ctx.cloudProfile.signature_path,reference);
});
test('failed or empty delete reports incomplete cleanup',async()=>{
 for(const options of [{deleteError:{}},{emptyDelete:true}]){const {ctx,messages}=setup(options);await ctx.removeMySignature();assert.match(messages[0],/پاک‌سازی فایل تأیید نشد/);}
});
test('ambiguous upload commit never deletes potentially committed data',async()=>{
 const {ctx,calls,messages}=setup({rpcError:{}});await ctx.uploadMySignature({type:'image/png',size:10});assert.equal(calls.filter(x=>x[0]==='remove').length,0);assert.match(messages[0],/تأیید نشد/);
});
