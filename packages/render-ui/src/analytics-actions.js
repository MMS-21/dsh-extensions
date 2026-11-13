export async function askAboutPullRequest(bridge,answerTool,question,pr){
  if(typeof question!=='string'||!question.trim()||question.length>4000)throw Error('Enter a question of at most 4,000 characters.');
  if(!bridge || bridge.disabled)throw Error('Open the source chat to ask about this pull request.');
  if(answerTool){
    if(!bridge.tool)throw Error('Session tool execution is unavailable.');
    const result=await bridge.tool(answerTool,{question,pullRequest:{number:pr.number,repository:pr.repository,title:pr.title}});
    const answer=typeof result==='string'?result:result?.answer??result?.text;
    if(typeof answer!=='string'||!answer.trim())throw Error('The answer tool must return text or an answer field.');
    return answer.slice(0,12000);
  }
  if(!bridge.draft)throw Error('Open the source chat before asking a question.');
  await bridge.draft(`About ${pr.repository} PR #${pr.number}: ${question}`);
  return 'Question added to the source chat composer. Review it and press Send there; the answer will appear in that chat.';
}
