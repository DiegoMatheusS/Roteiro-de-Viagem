import type {MapVisiblePlace} from '../components/InteractiveMap';

/** Compare the visible map cards by their displayed data rather than ID alone.
 * A corrected name, address, category or position must reach the places list;
 * unchanged GPS/provider refreshes should not trigger extra React updates. */
export function visiblePlacesSignature(places:readonly MapVisiblePlace[]):string {
  return JSON.stringify(places.map(({id,name,kind,address,coords})=>
    [id,name,kind,address,coords[0],coords[1]]));
}
