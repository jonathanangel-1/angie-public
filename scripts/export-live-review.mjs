import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '../outputs/live-image-suite/release-candidate');
const results = fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))).filter(row => row.image);
const returned = results.filter(row => row.status === 'returned');
const complete = returned.filter(row => row.edits?.[0]?.items.length && !row.edits[0].missingSlots?.length);
const lines = ['# Angie — actual pipeline results', '',
  `Tested ${results.length}/23 inspirations. ${returned.length} returned recommendations; ${complete.length} filled every detected clothing slot; ${results.length - returned.length} returned no result.`, '',
  '**These are pipeline outputs for review, not approved outfits.** Filling slots does not prove resemblance or physical fit. Sizes remain tentative. “Official link” means live availability was not confirmed. Bags and jewellery are not covered by the current pipeline.', '',
  'No recommendations were hand-selected or substituted. No test reactions were added to Angie’s learning history.', '',
  'Read [independent verification](../VERIFICATION.md) before treating any output as approved.', ''];
for (const [index, row] of results.entries()) {
  const original = `/workspace/demo/Downloads/${row.image}`;
  lines.push(`## ${index + 1}. [Inspiration](<${original}>)`, '', row.image, '', `Time: ${Math.round(row.elapsedMs / 1000)} seconds.`, '');
  if (row.status !== 'returned') { lines.push(`**No result:** ${row.error}`, ''); continue; }
  for (const [option, edit] of row.edits.entries()) {
    lines.push(`### Option ${option + 1}${edit.missingSlots?.length ? ' — partial' : ''}`, '', '| Piece | Product | Suggested size | Link evidence |', '|---|---|---|---|');
    for (const item of edit.items) lines.push(`| ${item.slot} | [${item.brand}: ${item.name.replaceAll('|', '—')}](${item.officialUrl}) | ${item.recommendedSize} (${item.sizeConfidence.toLowerCase()} confidence) | ${item.sourceStatus === 'page-verified' ? 'Product page checked' : 'Availability unconfirmed'} |`);
    if (edit.missingSlots?.length) lines.push('', `**Missing:** ${edit.missingSlots.join(', ')}.`);
    lines.push('');
  }
}
fs.writeFileSync(path.join(dir, 'REVIEW.md'), lines.join('\n'));
console.log(JSON.stringify({ tested: results.length, returned: returned.length, completeSlots: complete.length, noResult: results.length - returned.length, report: path.join(dir, 'REVIEW.md') }));
