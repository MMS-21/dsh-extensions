/** Model-visible schemas matching the coordinator's bounded proposal/review API. */
const text = {type:'string', minLength:1, maxLength:2000};
const texts = {type:'array', maxItems:100, items:text};
export const designBriefSchema = {
  type:'object', additionalProperties:false, required:['audience','questions','pages'],
  properties:{
    audience:{...text,description:'Audience and decision context; mark unconfirmed assumptions.'},
    questions:{...texts,minItems:1}, metrics:texts, assumptions:texts,
    pages:{type:'array',minItems:1,maxItems:20,items:{
      type:'object',additionalProperties:false,required:['title','visuals'],properties:{
        title:text, visuals:{type:'array',minItems:1,maxItems:30,items:{
          type:'object',additionalProperties:false,required:['question','measure','dimension','acceptance'],
          properties:{question:text,
            measure:{...text,description:'Measure definition with units and aggregation; label suggested/unbound fields.'},
            dimension:{...text,description:'Entity/year grain, scope, filters and proposed binding; do not add a separate binding key.'},
            acceptance:{...text,description:'Observable check, baseline, aggregation constraints and verification status.'}}
        }}
      }
    }}
  }
};
export const reviewFindingSchema = {
  type:'object',additionalProperties:false,
  required:['planId','source','expected','observed','evidence','severity','nextAction'],
  properties:{planId:{type:'string',pattern:'^[a-f0-9]{32}$'},
    source:{type:'string',enum:['user-feedback','agent-finding']},
    expected:text,observed:text,evidence:texts,
    severity:{type:'string',enum:['info','improvement','blocker']},nextAction:text}
};
