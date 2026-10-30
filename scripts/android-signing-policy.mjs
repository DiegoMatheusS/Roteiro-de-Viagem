// Public certificate extracted from PR165 and the repaired PR166 v683 APK.
// This fingerprint contains no private key or password.
export const ROLE_SIGNING_SHA256='A6:C3:D6:50:33:06:E4:AA:F9:A3:F0:99:47:48:AE:D3:03:7D:D3:5F:B4:43:15:10:C0:57:22:B4:FA:47:09:0C';
export function verifyRoleSigningCertificate(actual,persistent){
  const normalized=String(actual).replace(/:/g,'').toUpperCase();
  if(!/^[0-9A-F]{64}$/.test(normalized))throw new Error('Certificado SHA-256 inválido.');
  if(persistent&&normalized!==ROLE_SIGNING_SHA256.replace(/:/g,''))
    throw new Error('APK recusado: o certificado difere da chave usada nas instalações existentes. Restaure a chave permanente do proprietário; não gere outra.');
}
