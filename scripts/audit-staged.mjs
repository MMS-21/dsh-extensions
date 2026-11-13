import {execFileSync} from 'node:child_process';
const names=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/(^|\/)(node_modules|\.dsh|\.env(?:\..*)?|\.credentials[^/]*|sessions|chat-history|plugin-data|storages|test-artifacts|analytics-artifacts|[^/]*backup[^/]*)(\/|$)|\.(?:exe|dll|db|sqlite\w*|zip|png|jpe?g|webp|log|bak)$/i;
const secrets=[/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,/\b(?:sk-proj-|sk-ant-|ghp_|github_pat_)[A-Za-z0-9_-]{24,}/,/\bAKIA[A-Z0-9]{16}\b/];
const failures=[];let total=0;
for(const name of names){
  if(forbidden.test(name)&&name!=='.env.example')failures.push(`${name}: private or generated path is not allowed`);
  const blob=execFileSync('git',['show',`:${name}`],{maxBuffer:8*1024*1024});total+=blob.length;
  if(blob.length>2*1024*1024)failures.push(`${name}: exceeds source file size budget`);
  if(secrets.some(pattern=>pattern.test(blob.toString('utf8'))))failures.push(`${name}: possible credential or private key (value withheld)`);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`Staged audit passed: ${names.length} files, ${total} bytes; no forbidden paths or high-confidence secrets found.`);

