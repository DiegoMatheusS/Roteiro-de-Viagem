export type MapRouteCoords = readonly [number,number];

export interface MapRouteFitInputs {
  origin?:MapRouteCoords | null;
  destination?:MapRouteCoords | null;
  routePath:readonly MapRouteCoords[];
  alternatives:readonly {id:string;routePath:readonly MapRouteCoords[]}[];
}

/**
 * A route fit should depend on the journey, not on which alternative was tapped.
 *
 * Each alternative is part of the same itinerary. The map initially shows
 * all of them; switching the active ID must not reset a manually selected
 * camera position or zoom. A new set of verified paths or new endpoints *does*
 * require a new fit. Scenic stops, weather, and meeting updates do not.
 */
export function mapRouteFitKey(input:MapRouteFitInputs):string {
  const alternatives=input.alternatives.length
    ? input.alternatives.map(({id,routePath})=>[id,routePath] as const)
        .sort((a,b)=>a[0].localeCompare(b[0]))
    : null;
  return JSON.stringify([
    input.origin??null,input.destination??null,
    alternatives?['alternatives',alternatives]:['route',input.routePath]
  ]);
}

/** Do not consume the key until real coordinates exist to fit. */
export function shouldFitMapRoute(
  previous:string|null,current:string,hasBounds:boolean
):boolean {
  return hasBounds && previous!==current;
}

/** During an active trip, updated routes should change the line, not take the
 * camera away from the driver. Before any GPS fix, framing the initial route
 * remains useful unless the user has already explored the map manually. */
export function shouldAutoFitRouteCamera(navigationMode:boolean,hasGpsFix:boolean,exploring:boolean):boolean {
  return !navigationMode || (!hasGpsFix && !exploring);
}
