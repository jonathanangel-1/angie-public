import { inspirationScope } from '@/lib/inspiration-scope';
import { database, ensureSchema } from '@/lib/persistence';
import { getInspirationMemory } from '@/lib/inspiration-learning';
import { refreshSavedEdits } from '@/lib/saved-looks';
import type { InspirationRecommendation } from '@/lib/inspiration-types';

export async function GET(request: Request) {
  const scope = inspirationScope(request);
  if (!scope) return Response.json({ error: 'Locked' }, { status: 401 });
  let before=0,beforeId='';
  try {const cursor=new URL(request.url).searchParams.get('cursor');if(cursor){const value=JSON.parse(atob(cursor));before=value.at;beforeId=value.id;if(!Number.isSafeInteger(before)||before<1||typeof beforeId!=='string'||beforeId.length>80)throw new Error();}}
  catch{return Response.json({error:'Invalid history cursor.'},{status:400});}
  await ensureSchema();
  const rows = await database().prepare(
    'SELECT id, storage_key, style_brief_json, edits_json, sources_json, model, search_mode, created_at FROM inspiration_recommendations WHERE session_id = ? AND (? = 0 OR created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC,id DESC LIMIT 21',
  ).bind(scope.sessionId,before,before,before,beforeId).all<{id:string;storage_key:string;style_brief_json:string;edits_json:string;sources_json:string;model:string;search_mode:string;created_at:number}>();
  const memory = await getInspirationMemory(scope.sessionId);
  const page=rows.results.slice(0,20), last=page.at(-1);
  const reactions=page.length?await database().prepare(`SELECT recommendation_id,edit_id,reaction,note,target_item_ids_json FROM inspiration_feedback WHERE session_id = ? AND recommendation_id IN (${page.map(()=>'?').join(',')})`).bind(scope.sessionId,...page.map(r=>r.id)).all<{recommendation_id:string;edit_id:string;reaction:string;note:string;target_item_ids_json:string}>():{results:[]};
  return Response.json({ nextCursor:rows.results.length>20&&last?btoa(JSON.stringify({at:last.created_at,id:last.id})):null, recommendations: page.map(row => ({
    id: row.id, imageUrl: row.storage_key ? `/api/inspiration/image?id=${encodeURIComponent(row.id)}` : '',
    brief: JSON.parse(row.style_brief_json), edits: refreshSavedEdits(JSON.parse(row.edits_json),memory), sources: JSON.parse(row.sources_json),
    confirmedFeedback:Object.fromEntries(reactions.results.filter(r=>r.recommendation_id===row.id).map(r=>[r.edit_id,{reaction:r.reaction,note:r.note||'',targetItemIds:JSON.parse(r.target_item_ids_json)}])) as InspirationRecommendation['confirmedFeedback'],
    model: row.model, searchMode: row.search_mode, createdAt: row.created_at, memory,
  })) }, {headers: {'Cache-Control':'private, no-store'}});
}
