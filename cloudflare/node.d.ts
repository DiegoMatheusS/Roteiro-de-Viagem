/** cloudflare:node's fetch bridge consumes the standard Node/Fetch interfaces.
 * Keep its types local so Worker globals do not replace the browser DOM types. */
declare module 'cloudflare:node'{
  export function httpServerHandler(server:import('node:http').Server):{
    fetch(request:Request,env:unknown,ctx:{waitUntil(task:Promise<unknown>):void}):Promise<Response>;
  };
}
