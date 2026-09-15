export type AnswerMap = Record<string, { answer: string; note?: string | null }>;

export type QuestionOption = {
  value: string;
  label: string;
  detail?: string;
};

export type Question = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  options: QuestionOption[];
  notePrompt?: string;
};

const question = (value: Question) => value;

const keptBehavior = question({
  id: 'kept_behavior',
  kicker: 'Signal check',
  title: 'A kept item is not always a successful item.',
  body: 'When something survives the return window, what happens most often?',
  options: [
    { value: 'rotation', label: 'I actually wear it', detail: 'Kept usually means success' },
    { value: 'sometimes', label: 'I wear it once in a while', detail: 'Useful, but not a favorite' },
    { value: 'ghost', label: 'It becomes a closet ghost', detail: 'Kept, rarely or never worn' },
    { value: 'varies', label: 'It really varies', detail: 'There is no default' },
  ],
});

const keptSuccessReason = question({
  id: 'kept_success_reason',
  kicker: 'Why it survives',
  title: 'What turns “kept” into “I reach for it” most reliably?',
  body: 'Choose the strongest force. We can learn the nuance later.',
  options: [
    { value: 'fit', label: 'It fits without negotiating' },
    { value: 'identity', label: 'It immediately feels like me' },
    { value: 'easy', label: 'It is easy to style' },
    { value: 'material', label: 'The fabric feels genuinely good' },
  ],
});

const ghostReason = question({
  id: 'kept_ghost_reason',
  kicker: 'The missing return',
  title: 'What usually creates the closet ghost?',
  body: 'This is the signal email will never give us on its own.',
  options: [
    { value: 'fit', label: 'The fit feels slightly wrong' },
    { value: 'identity', label: 'It does not feel like me' },
    { value: 'styling', label: 'I cannot make an outfit with it' },
    { value: 'quality', label: 'The fabric or quality disappoints' },
    { value: 'forgot', label: 'I simply forget it exists' },
  ],
  notePrompt: 'Optional: name one closet ghost you remember',
});

const coupeCalibration = question({
  id: 'coupe_calibration',
  kicker: 'Controlled repeat',
  title: 'Imagine keeping the same trousers in two colors.',
  body: 'In this fictional example, would you wear both?',
  options: [
    { value: 'both', label: 'I still reach for both' },
    { value: 'one', label: 'One works much better than the other' },
    { value: 'neither', label: 'I do not really wear either now' },
    { value: 'unknown', label: 'I do not remember them clearly' },
  ],
  notePrompt: 'If one wins, which color—and why?',
});

const navyLinenCalibration = question({
  id: 'navy_linen_calibration',
  kicker: 'Old favorite or old news?',
  title: 'Imagine keeping a pair of cropped linen trousers.',
  body: 'Would you still be happy to wear that shape and fabric now?',
  options: [
    { value: 'yes', label: 'Yes—still very me' },
    { value: 'shape', label: 'The shape, but not the fabric' },
    { value: 'fabric', label: 'The fabric, but not the shape' },
    { value: 'past', label: 'No—that was a past version of me' },
  ],
});

const silhouette = question({
  id: 'silhouette_instinct',
  kicker: 'Instinct, not theory',
  title: 'Which trouser shape makes you want to try it first?',
  body: 'Assume all four fit perfectly. Pick the shape—not the safe answer.',
  options: [
    { value: 'straight', label: 'Clean straight leg', detail: 'Quiet, tailored, sharp' },
    { value: 'flare', label: 'Long or cropped flare', detail: 'Fitted, then opens' },
    { value: 'wide', label: 'Flowing wide leg', detail: 'Long, relaxed movement' },
    { value: 'barrel', label: 'Modern barrel leg', detail: 'Sculpted, fashion-forward volume' },
  ],
});

const failure = question({
  id: 'trouser_failure',
  kicker: 'Blunt truth',
  title: 'A trouser looks promising online. What kills it in the mirror?',
  body: 'Choose the failure you would most like me to prevent.',
  options: [
    { value: 'length', label: 'The length is wrong' },
    { value: 'tight', label: 'It pulls or feels too tight' },
    { value: 'loose', label: 'It hangs loose in the wrong place' },
    { value: 'volume', label: 'The shape overwhelms me' },
    { value: 'vibe', label: 'It fits, but the whole vibe is wrong' },
  ],
});

const failureFollowups: Record<string, Question> = {
  length: question({
    id: 'failure_detail', kicker: 'Length law', title: 'What does “right length” mean to you?',
    body: 'The same inseam can be right or wrong depending on the intended shoe and silhouette.',
    options: [
      { value: 'ankle', label: 'Clearly intentional ankle length' },
      { value: 'shoe_top', label: 'Just meets the top of my shoe' },
      { value: 'floor', label: 'Long—almost skimming the floor' },
      { value: 'depends', label: 'It depends on the trouser shape' },
    ],
  }),
  tight: question({
    id: 'failure_detail', kicker: 'Fit geometry', title: 'Where does tightness show up first?',
    body: 'This tells us which garment measurements need the most safety margin.',
    options: [
      { value: 'waist', label: 'Waist' }, { value: 'hips', label: 'Hips or seat' },
      { value: 'thighs', label: 'Upper thighs' }, { value: 'rise', label: 'Rise or crotch' },
    ],
  }),
  loose: question({
    id: 'failure_detail', kicker: 'Fit geometry', title: 'Where does looseness bother you first?',
    body: 'This helps distinguish intentional drape from a trouser that simply does not fit.',
    options: [
      { value: 'waist', label: 'Gaping waist' }, { value: 'hips', label: 'Empty fabric at hips or seat' },
      { value: 'thighs', label: 'Too much leg volume' }, { value: 'all', label: 'The whole thing swallows me' },
    ],
  }),
  volume: question({
    id: 'failure_detail', kicker: 'Volume limit', title: 'Which volume is hardest to forgive?',
    body: 'We can be adventurous without letting the clothes wear you.',
    options: [
      { value: 'hips', label: 'Extra volume around hips' }, { value: 'leg', label: 'A very wide leg' },
      { value: 'crotch', label: 'Drop-crotch or low-slung shapes' }, { value: 'pleats', label: 'Bulky front pleats' },
    ],
  }),
  vibe: question({
    id: 'failure_detail', kicker: 'Taste boundary', title: 'Which “wrong vibe” is the fastest no?',
    body: 'Fit cannot rescue a piece that tells the wrong story.',
    options: [
      { value: 'corporate', label: 'Too corporate' }, { value: 'trendy', label: 'Too trend-chasing' },
      { value: 'plain', label: 'Too safe or plain' }, { value: 'fussy', label: 'Too detailed or fussy' },
    ],
  }),
};

const material = question({
  id: 'material_tradeoff',
  kicker: 'Touch test',
  title: 'Which fabric promise earns the most trust online?',
  body: 'Material is not decoration—it changes drape, comfort and whether a piece gets worn.',
  options: [
    { value: 'natural', label: 'Linen, cotton or wool—even with wrinkles' },
    { value: 'soft', label: 'Soft and fluid, whatever the blend' },
    { value: 'structured', label: 'Structured and shape-holding' },
    { value: 'easy', label: 'Low-maintenance and wrinkle-resistant' },
  ],
});

const becoming = question({
  id: 'becoming',
  kicker: 'Not just your archive',
  title: 'What are you trying to become more of when you get dressed?',
  body: 'I should learn your direction, not trap you inside old purchases.',
  options: [
    { value: 'refined', label: 'More refined and put-together' },
    { value: 'expressive', label: 'More expressive and surprising' },
    { value: 'effortless', label: 'More effortless and comfortable' },
    { value: 'bold', label: 'More bold and fashion-forward' },
  ],
  notePrompt: 'Optional: whose style or what look captures this?',
});

const colorRisk = question({
  id: 'color_risk',
  kicker: 'Risk budget',
  title: 'How should I use color when I recommend?',
  body: 'Your history contains neutrals and real color. I should not confuse “frequent” with “desired.”',
  options: [
    { value: 'neutral', label: 'Mostly black, navy, white and beige' },
    { value: 'controlled', label: 'One controlled color at a time' },
    { value: 'open', label: 'Bring me colors if the piece is right' },
    { value: 'push', label: 'Push me beyond my normal palette' },
  ],
});

const recommendationTradeoff = question({
  id: 'recommendation_tradeoff',
  kicker: 'Counsel setting',
  title: 'How should I behave when evidence is incomplete?',
  body: 'This controls whether I act like a safe filter or an adventurous stylist.',
  options: [
    { value: 'strict', label: 'Be strict—save me from likely returns' },
    { value: 'balanced', label: 'Give me one safe and one stretch option' },
    { value: 'explore', label: 'Let me explore, but explain the risk' },
    { value: 'surprise', label: 'Surprise me—I will decide in person' },
  ],
});

const mission = question({
  id: 'shopping_mission',
  kicker: 'Tomorrow’s brief',
  title: 'If I solved one shopping problem first, what should it be?',
  body: 'This becomes the job of the next experiment—not a permanent label.',
  options: [
    { value: 'everyday_trouser', label: 'A reliable everyday trouser' },
    { value: 'work', label: 'A polished work or meeting look' },
    { value: 'going_out', label: 'A going-out look that feels new' },
    { value: 'outfits', label: 'Making outfits from what I own' },
  ],
  notePrompt: 'Optional: any event, trip or real need coming up?',
});

export function buildQuestionSequence(answers: AnswerMap): Question[] {
  const keptFollowup = ['ghost', 'varies'].includes(answers.kept_behavior?.answer)
    ? ghostReason
    : keptSuccessReason;
  const failureFollowup = failureFollowups[answers.trouser_failure?.answer] ?? failureFollowups.vibe;

  return [
    keptBehavior,
    keptFollowup,
    coupeCalibration,
    navyLinenCalibration,
    silhouette,
    failure,
    failureFollowup,
    material,
    becoming,
    colorRisk,
    recommendationTradeoff,
    mission,
  ];
}

export const QUESTION_TARGET = 12;

export const questionLabel = (questionId: string, value: string, answers: AnswerMap = {}) => {
  const candidate = buildQuestionSequence(answers).find((item) => item.id === questionId);
  return candidate?.options.find((option) => option.value === value)?.label ?? value;
};
