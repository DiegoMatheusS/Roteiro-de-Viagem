export const ROUTE_AUTO_START_MS=10000;

export function routeAutoStartSeconds(deadlineMs:number,nowMs:number):number {
  return Math.max(0,Math.ceil((deadlineMs-nowMs)/1000));
}
