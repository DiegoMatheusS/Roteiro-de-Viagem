import type {ConvoySession} from '../types';

/** Keep an already-open convoy visible during offline cache misses.
 * Only an authoritative, successful server refresh may confirm that a
 * participant is no longer a member. Never rejoin or enable GPS here. */
export function viewedConvoyAfterRefresh(
  viewedId:string|null,
  convoys:ReadonlyArray<Pick<ConvoySession,'id'|'status'>>,
  authoritative:boolean
):string|null{
  if(!viewedId)return null;
  const current=convoys.find(entry=>entry.id===viewedId);
  if(current)return current.status==='active'?viewedId:null;
  return authoritative?null:viewedId;
}
