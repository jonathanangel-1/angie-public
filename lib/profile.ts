import type { AnswerMap } from '@/data/questions';

const labels: Record<string, string> = {
  refined: 'more refined and put-together', expressive: 'more expressive and surprising',
  effortless: 'more effortless and comfortable', bold: 'bolder and more fashion-forward',
  straight: 'clean straight legs', flare: 'flare silhouettes', wide: 'flowing wide legs', barrel: 'modern barrel shapes',
  natural: 'natural fibers', soft: 'soft fluid fabrics', structured: 'structured fabrics', easy: 'easy-care fabrics',
  neutral: 'a mostly neutral palette', controlled: 'controlled color', open: 'color when the piece earns it', push: 'deliberate palette expansion',
};

const value = (answers: AnswerMap, id: string, fallback: string) => labels[answers[id]?.answer] ?? fallback;

export function buildProfile(answers: AnswerMap) {
  const coupe = answers.coupe_calibration?.answer;
  const navy = answers.navy_linen_calibration?.answer;
  const failure = answers.trouser_failure?.answer;
  const detail = answers.failure_detail?.answer;

  const current = coupe === 'both' && navy === 'yes'
    ? 'Your strongest repeat is clean, polished tailoring with an easy, natural-feeling side.'
    : coupe === 'neither' || navy === 'past'
      ? 'Your archive contains useful clues, but at least one old “success” no longer represents you.'
      : 'You lean polished and usable, but the exact cut matters more than the store name.';

  const fit = failure === 'length'
    ? `Length is the first gate. “Correct” currently means ${detail === 'depends' ? 'silhouette-specific length' : labels[detail] ?? detail ?? 'an intentional hem'}.`
    : failure === 'tight'
      ? `Fit needs safety margin around the ${detail ?? 'body'}, not just a familiar size label.`
      : failure === 'loose' || failure === 'volume'
        ? `Intentional drape must be separated from unwanted volume around the ${detail ?? 'hips and legs'}.`
        : 'Taste can reject a technically correct fit, so I should never collapse fit and style into one score.';

  return {
    current,
    becoming: `You want to become ${value(answers, 'becoming', 'more intentional')}, with ${value(answers, 'color_risk', 'selective color')}.`,
    taste: `Your first instinct is ${value(answers, 'silhouette_instinct', 'a clean silhouette')} in ${value(answers, 'material_tradeoff', 'a fabric that feels good')}.`,
    fit,
    counsel: answers.recommendation_tradeoff?.answer === 'strict'
      ? 'I should filter aggressively and say no early.'
      : answers.recommendation_tradeoff?.answer === 'balanced'
        ? 'I should pair a safe choice with one evidence-labeled stretch choice.'
        : 'I may explore, but I must expose the exact risk instead of pretending confidence.',
    mission: answers.shopping_mission?.answer ?? 'everyday_trouser',
  };
}
