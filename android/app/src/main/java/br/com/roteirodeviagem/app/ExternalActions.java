package br.com.roteirodeviagem.app;
import android.content.Intent;
import android.net.Uri;
/** User-initiated compose/dial actions. This class never sends a message or places a call. */
final class ExternalActions {
  static Intent intentFor(String value) {
    Uri uri=Uri.parse(value==null?"":value);
    if("tel".equals(uri.getScheme()) && uri.getSchemeSpecificPart().matches("\\+?[0-9]{3,15}")) return new Intent(Intent.ACTION_DIAL,uri);
    if("https".equals(uri.getScheme()) && uri.getUserInfo()==null && (uri.getPort()==-1 || uri.getPort()==443) &&
      ("api.whatsapp.com".equals(uri.getHost()) && "/send".equals(uri.getPath()) || "maps.google.com".equals(uri.getHost()))) return new Intent(Intent.ACTION_VIEW,uri);
    throw new IllegalArgumentException("Link de contato inválido.");
  }
}
