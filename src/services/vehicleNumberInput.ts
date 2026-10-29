/** Convert only when submitting. The input itself keeps the original draft,
 * including empty text and a decimal separator still being typed. */
export function parseVehicleNumber(value:string):number|null {
  const normalized=value.trim().replace(',','.');
  if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized))return null;
  const number=Number(normalized);
  return Number.isFinite(number)?number:null;
}
