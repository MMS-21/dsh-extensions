import React from 'react';
import { openuiLibrary } from '@openuidev/react-ui/genui-lib';
import {Recommendation, RecommendationCards} from './recommendation-cards.jsx';
import {AnalyticsDashboard,StatusBars} from './analytics-components.jsx';

export const library = openuiLibrary.extend({
  components: {add: [Recommendation, {component: RecommendationCards, slots: ['Card.children']}, AnalyticsDashboard, StatusBars]},
});
export const dshOpenuiLibrary = library;
export default library;
