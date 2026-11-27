import test from 'node:test';
import assert from 'node:assert/strict';
import {registerChatGptCommand} from '../chatgpt-command.mjs';
test('native sign-in starts and reports progress without waiting for a completed login',async()=>{
 let command,finish;
 const ctx={commands:{register(value){command=value;return()=>{};}},credentials:{async readRecord(){return null;}},authorization:{describe(){return {methods:[{id:'oauth'}]};},begin({key,interaction}){assert.equal(key,'native-key');interaction.notify({message:'Open sign-in',url:'https://auth.openai.com/authorize?state=example'});return new Promise(resolve=>{finish=resolve;});},cancel(){}}};
 registerChatGptCommand(ctx,'native-key');
 const result=await command.handler({rawInput:'login'});
 assert.match(result.text,/auth.openai.com/);
 finish({status:'authorized'});await Promise.resolve();await Promise.resolve();
 const status=await command.handler({rawInput:'status'});assert.match(status.text,/completed/);
});

test('uses native OAuth option ids and reaches authorization URL',async()=>{
 let command,selected;
 const ctx={commands:{register(value){command=value;return()=>{};}},authorization:{describe(){return {methods:[{id:'oauth'}]};},async begin({interaction}){
 selected=await interaction.prompt({kind:'select',options:[{id:'browser',label:'Browser login (default)'},{id:'device',label:'Device code'}]});
 if(selected!=='browser')throw Error('Unsupported login method');
 interaction.notify({message:'Continue',url:'https://auth.openai.com/authorize'});
 return {status:'authorized'};
 }}};
 registerChatGptCommand(ctx,'native');const result=await command.handler({rawInput:'login'});
 assert.equal(selected,'browser');assert.equal(result.kind,'success');assert.doesNotMatch(result.text,/failed/);
});
