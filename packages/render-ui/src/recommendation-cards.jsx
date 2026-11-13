import React, {createContext, useContext} from 'react';
import {defineComponent} from '@openuidev/react-lang';
import {z} from 'zod';

export const RecommendationFollowup = createContext(null);

function webUrl(value) {
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url.href;
  } catch {}
}

export const Recommendation = defineComponent({
  name: 'Recommendation',
  description: 'One clickable option with its name, area or timing, and why to choose it. Use a direct sourced image URL, meaningful alt text, and a source page. Clicking the card drafts a follow-up about its alternative, or the option itself if there is no alternative.',
  props: z.object({
    title: z.string().min(1).max(120),
    context: z.string().max(160),
    reason: z.string().min(1).max(280),
    imageUrl: z.string().max(2048).optional(),
    imageAlt: z.string().max(180).optional(),
    photoSource: z.string().max(2048).optional(),
    alternative: z.string().max(120).optional(),
    alternativeReason: z.string().max(280).optional(),
  }),
  component: ({props}) => {
    const {title, context, reason, imageAlt, alternative, alternativeReason} = props;
    const followup = useContext(RecommendationFollowup);
    const photo = webUrl(props.imageUrl);
    const source = webUrl(props.photoSource);
    const image = photo && <img className="dsh-recommendation-image" src={photo} alt={imageAlt || title}
      loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />;
    const sourceLink = photo && source && <a className="dsh-recommendation-meta dsh-recommendation-source"
      href={source} target="_blank" rel="noopener noreferrer">Photo source for {title}</a>;
    const target = alternative || title;
    const prompt = alternative ? `Tell me more about ${alternative} as an alternative to ${title}.` : `Tell me more about ${title}.`;
    return <article className="dsh-recommendation">
      {followup ? <button type="button" className="dsh-recommendation-pick"
        aria-label={`${title}. Ask about ${target}`} onClick={() => followup(prompt)}>
        {image}
        <span className="dsh-recommendation-body">
          <strong className="dsh-recommendation-title">{title}</strong>
          {context && <span className="dsh-recommendation-meta">{context}</span>}
          <span>{reason}</span>
          {alternativeReason && alternative && <span className="dsh-recommendation-meta">{alternative} · {alternativeReason}</span>}
          <span className="dsh-recommendation-cue">Ask about {target} <span aria-hidden="true">↗</span></span>
        </span>
      </button> : <>{image}<div className="dsh-recommendation-body">
        <h3>{title}</h3>
        {context && <p className="dsh-recommendation-meta">{context}</p>}
        <p>{reason}</p>
        {alternative && <details>
          <summary>Try instead</summary>
          <p><strong>{alternative}</strong>{alternativeReason && <> · {alternativeReason}</>}</p>
        </details>}
      </div></>}
      {sourceLink}
    </article>;
  },
});

export const RecommendationCards = defineComponent({
  name: 'RecommendationCards',
  description: 'A responsive shortlist of one to five named photo cards. Use for place or product recommendations when photos help comparison. Keep each option, its image, and its alternative together.',
  props: z.object({items: z.array(Recommendation.ref).min(1).max(5)}),
  component: ({props, renderNode}) => <div className="dsh-recommendations">{renderNode(props.items)}</div>,
});
