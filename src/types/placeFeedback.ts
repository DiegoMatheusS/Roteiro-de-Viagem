export const PLACE_FEEDBACK_QUESTIONS = [
  {key:'notExists',label:'Estabelecimento não existe?'},
  {key:'incorrectName',label:'Nome incorreto?'},
  {key:'incorrectKind',label:'Tipo de estabelecimento incorreto?'}
] as const;
export type PlaceFeedbackAnswers = Record<typeof PLACE_FEEDBACK_QUESTIONS[number]['key'],boolean>;
export interface PlaceRatingSummary {average:number|null;count:number;myRating?:number|null}
export type PlaceFeedbackDraft = PlaceFeedbackAnswers & {rating?:number};
