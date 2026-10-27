package br.com.roteirodeviagem.app;

import android.Manifest;
import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.provider.Settings;
import android.net.Uri;
import android.location.LocationManager;
import android.os.Build;
import android.webkit.CookieManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.ActivityCallback;
import androidx.activity.result.ActivityResult;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.api.ApiException;
import java.net.URL;
import java.net.HttpURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name="TravelNative", permissions={
  @Permission(alias="location", strings={Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
  @Permission(alias="notifications", strings={Manifest.permission.POST_NOTIFICATIONS})
})
public class TravelNativePlugin extends Plugin {
  private final java.util.concurrent.ExecutorService io=Executors.newFixedThreadPool(3);
  @Override protected void handleOnDestroy() { io.shutdown(); }
  private String origin() throws Exception {
    String origin = getConfig().getString("apiOrigin", "");
    URL url = new URL(origin);
    if (!url.getProtocol().equals("https") || !url.getPath().isEmpty() && !url.getPath().equals("/") || url.getUserInfo()!=null || url.getQuery()!=null || url.getRef()!=null) throw new Exception("Configure RDV_API_URL com a origem HTTPS do servidor e gere o app novamente.");
    return origin.replaceAll("/+$", "");
  }
  @PluginMethod public void request(PluginCall call) {
    io.execute(() -> {
      HttpURLConnection connection = null;
      try {
        String base = origin(), path = call.getString("path", ""), method = call.getString("method", "GET");
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("..") || !method.matches("GET|POST|PUT|PATCH|DELETE")) throw new Exception("Solicitação inválida.");
        URL url = new URL(base + "/api" + path); connection = (HttpURLConnection)url.openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setRequestMethod(method);
        String cookie = CookieManager.getInstance().getCookie(url.toString()); if (cookie != null) connection.setRequestProperty("Cookie", cookie);
        JSArray form = call.getArray("form"); String body = call.getString("body");
        if (form != null && form.length()>0) {
          String boundary="rdv"+java.util.UUID.randomUUID().toString(); ByteArrayOutputStream out = new ByteArrayOutputStream();
          for (int i=0;i<form.length();i++) {
            JSONObject part=form.getJSONObject(i); String name=part.getString("name"); if (!name.matches("[a-zA-Z0-9_]+")) throw new Exception("Campo inválido.");
            String header="--"+boundary+"\r\nContent-Disposition: form-data; name=\""+name+"\"";
            if (part.has("data")) { header += "; filename=\"photo.jpg\"\r\nContent-Type: "+part.optString("mime", "image/jpeg").replaceAll("[^a-zA-Z0-9/.-]", ""); }
            out.write((header+"\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(part.has("data") ? android.util.Base64.decode(part.getString("data"), android.util.Base64.DEFAULT) : part.optString("value", "").getBytes(StandardCharsets.UTF_8)); out.write("\r\n".getBytes(StandardCharsets.UTF_8));
          }
          out.write(("--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
          connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "multipart/form-data; boundary="+boundary); connection.getOutputStream().write(out.toByteArray());
        } else if (body!=null) { connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json"); connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8)); }
        int status=connection.getResponseCode();
        for (java.util.Map.Entry<String,java.util.List<String>> entry : connection.getHeaderFields().entrySet()) if ("Set-Cookie".equalsIgnoreCase(entry.getKey())) for (String value:entry.getValue()) {
          java.util.concurrent.CountDownLatch saved=new java.util.concurrent.CountDownLatch(1);
          getActivity().runOnUiThread(() -> CookieManager.getInstance().setCookie(base+"/api",value,accepted -> saved.countDown()));
          if(!saved.await(5,java.util.concurrent.TimeUnit.SECONDS)) throw new Exception("Não foi possível salvar a sessão do aplicativo.");
        }
        CookieManager.getInstance().flush();
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(); InputStream stream=status>=400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream!=null) { byte[] buffer=new byte[8192]; int read; while((read=stream.read(buffer))!=-1) { bytes.write(buffer,0,read); if(bytes.size()>4000000) throw new Exception("Resposta muito grande."); } stream.close(); }
        JSObject result=new JSObject(); result.put("status",status); result.put("body",Boolean.TRUE.equals(call.getBoolean("binary",false)) ? android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP) : bytes.toString("UTF-8")); call.resolve(result);
      } catch(Exception error) { call.reject(error.getMessage()); }
      finally { if(connection!=null) connection.disconnect(); }
    });
  }
  static boolean preciseLocationGranted(Context context) { return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED; }
  private boolean permissions(PluginCall call) {
    if (getPermissionState("location")!=PermissionState.GRANTED) { requestPermissionForAlias("location",call,"locationResult"); return false; }
    if (Build.VERSION.SDK_INT>=33 && getPermissionState("notifications")!=PermissionState.GRANTED) { requestPermissionForAlias("notifications",call,"notificationResult"); return false; }
    return true;
  }
  @PermissionCallback private void locationResult(PluginCall call) {
    if(!preciseLocationGranted(getContext())) { call.reject("Permita localização precisa para acompanhar a viagem."); return; }
    if (call.getMethodName().equals("setConvoy")) setConvoy(call); else startTracking(call);
  }
  @PermissionCallback private void notificationResult(PluginCall call) { begin(call); }
  private void begin(PluginCall call) {
    try {
      if(!preciseLocationGranted(getContext())) { call.reject("Ative a localização precisa nas permissões do aplicativo."); return; }
      LocationManager manager=(LocationManager)getContext().getSystemService(Context.LOCATION_SERVICE);
      if(!manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) { call.reject("Ative o GPS do celular para acompanhar a viagem."); return; }
      Intent intent=new Intent(getContext(),TravelLocationService.class);
      if(call.getMethodName().equals("setConvoy")) {
        intent.setAction("CONVOY"); intent.putExtra("convoyId",call.getString("convoyId", "")); intent.putExtra("locationToken",call.getString("locationToken", "")); intent.putExtra("origin",origin()); intent.putExtra("cookie",CookieManager.getInstance().getCookie(origin()+"/api"));
      } else { intent.setAction("TRIP"); intent.putExtra("tripId",call.getString("tripId", "")); intent.putExtra("distanceKm",call.getDouble("distanceKm",0.0)); }
      ContextCompat.startForegroundService(getContext(),intent); call.resolve();
    } catch(Exception error) { call.reject(error.getMessage()); }
  }
  @PluginMethod public void startTracking(PluginCall call) {
    String id=call.getString("tripId","");
    if(id.isEmpty() || id.length()>300) {call.reject("Viagem inválida.");return;}
    String stopped=getContext().getSharedPreferences("travel-gps",0).getString("stoppedTripId","");
    if(id.equals(stopped) && !Boolean.TRUE.equals(call.getBoolean("resume",false))) {call.reject("GPS interrompido pela notificação. Toque em tentar novamente para retomá-lo.");return;}
    if(permissions(call)) begin(call);
  }
  @PluginMethod public void stopTracking(PluginCall call) {
    if(TravelLocationService.running) { Intent intent=new Intent(getContext(),TravelLocationService.class).setAction("STOP_TRIP"); getContext().startService(intent); } call.resolve();
  }
  @PluginMethod public void setConvoy(PluginCall call) {
    if(!Boolean.TRUE.equals(call.getBoolean("enabled",false))) {
      if(TravelLocationService.running) getContext().startService(new Intent(getContext(),TravelLocationService.class).setAction("STOP_CONVOY")); call.resolve(); return;
    }
    if(permissions(call)) begin(call);
  }
  @PluginMethod public void diagnostics(PluginCall call) {
    JSObject result=new JSObject();LocationManager manager=(LocationManager)getContext().getSystemService(Context.LOCATION_SERVICE);
    result.put("preciseLocation",preciseLocationGranted(getContext()));result.put("approximateLocation",getContext().checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED);
    result.put("gpsEnabled",manager.isProviderEnabled(LocationManager.GPS_PROVIDER));result.put("notificationsEnabled",androidx.core.app.NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
    result.put("tracking",TravelLocationService.running);result.put("androidVersion",Build.VERSION.RELEASE);
    try { result.put("appVersion",getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0).versionName); }catch(Exception ignored) {result.put("appVersion","");}
    try {origin();result.put("apiConfigured",true);}catch(Exception ignored){result.put("apiConfigured",false);}call.resolve(result);
  }
  @PluginMethod public void openDeviceSettings(PluginCall call) {
    String section=call.getString("section","app");Intent intent;
    if("location".equals(section))intent=new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
    else if("notifications".equals(section)&&Build.VERSION.SDK_INT>=26)intent=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName());
    else intent=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));
    try { getActivity().startActivity(intent);call.resolve(); }catch(Exception error){call.reject("Não foi possível abrir as configurações do celular.");}
  }
  @PluginMethod public void openExternal(PluginCall call) {
    try {getActivity().startActivity(ExternalActions.intentFor(call.getString("url","")));call.resolve();}catch(Exception error){call.reject("Não foi possível abrir o contato. Confira os aplicativos instalados.");}
  }
  /** Package + public signing certificate fingerprint are the exact identifiers
   * required by Google Cloud's Android OAuth client. No private signing key is read. */
  private String googleOAuthSigningInfo() {
    try {
      String packageName=getContext().getPackageName();
      android.content.pm.PackageInfo info;
      android.content.pm.Signature cert;
      if(Build.VERSION.SDK_INT>=28) {
        info=getContext().getPackageManager().getPackageInfo(packageName,PackageManager.GET_SIGNING_CERTIFICATES);
        cert=info.signingInfo.getApkContentsSigners()[0];
      } else {
        info=getContext().getPackageManager().getPackageInfo(packageName,PackageManager.GET_SIGNATURES);
        cert=info.signatures[0];
      }
      byte[] hash=java.security.MessageDigest.getInstance("SHA-1").digest(cert.toByteArray());
      StringBuilder sha=new StringBuilder();
      for(byte value:hash){
        if(sha.length()>0)sha.append(':');
        String hex=Integer.toHexString(value&0xff).toUpperCase(java.util.Locale.US);
        if(hex.length()<2)sha.append('0');
        sha.append(hex);
      }
      return " Pacote: "+packageName+". SHA-1: "+sha+".";
    }catch(Exception ignored){return "";}
  }
  @PluginMethod public void signInGoogle(PluginCall call) {
    String clientId=call.getString("clientId","");
    if(clientId==null || clientId.length()>250 || !clientId.endsWith(".apps.googleusercontent.com") || !clientId.matches("[A-Za-z0-9_.-]+")) {
      call.reject("O Google Login ainda não está configurado para este aplicativo.");return;
    }
    try {
      GoogleSignInOptions options=new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
        .requestEmail().requestIdToken(clientId).build();
      startActivityForResult(call,GoogleSignIn.getClient(getContext(),options).getSignInIntent(),"googleSignInResult");
    } catch(Exception error){call.reject("Não foi possível iniciar o login Google: "+error.getMessage());}
  }
  @ActivityCallback public void googleSignInResult(PluginCall call,ActivityResult result) {
    if(call==null)return;
    try {
      GoogleSignInAccount account=GoogleSignIn.getSignedInAccountFromIntent(result.getData()).getResult(ApiException.class);
      if(account==null || account.getIdToken()==null){call.reject("O Google não devolveu uma credencial.");return;}
      JSObject value=new JSObject();value.put("credential",account.getIdToken());call.resolve(value);
    } catch(ApiException error) {
      if(error.getStatusCode()==12501 || error.getStatusCode()==16)call.reject("Login Google cancelado.");
      else if(error.getStatusCode()==10)
        call.reject("Login Google não autorizado (código 10). Cadastre no Google Cloud o OAuth Android deste pacote e certificado."+googleOAuthSigningInfo()+" Para todos os APKs de teste, configure assinatura persistente no GitHub Actions.");
      else call.reject("Falha ao entrar com Google (código "+error.getStatusCode()+"). Confira a configuração OAuth e o SHA-1 da assinatura.");
    } catch(Exception error){call.reject("Não foi possível autenticar com Google.");}
  }
  @PluginMethod public void exitApp(PluginCall call) {
    getActivity().runOnUiThread(()->{call.resolve();getActivity().finish();});
  }
  @PluginMethod public void copyText(PluginCall call) {
    String value=call.getString("text","");if(value.length()>10000){call.reject("Mensagem muito grande.");return;}
    getActivity().runOnUiThread(()->{((ClipboardManager)getContext().getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Localização SOS",value));call.resolve();});
  }
  @PluginMethod public void state(PluginCall call) {
    JSObject result=new JSObject(); android.content.SharedPreferences pref=getContext().getSharedPreferences("travel-gps",0);
    result.put("tripId",TravelLocationService.activeTripId); result.put("lastTripId",pref.getString("tripId","")); result.put("stoppedTripId",pref.getString("stoppedTripId","")); result.put("distanceKm",Double.longBitsToDouble(pref.getLong("distance",Double.doubleToLongBits(0)))); result.put("running",TravelLocationService.running); result.put("convoyId",TravelLocationService.activeConvoyId); result.put("stoppedLocationToken",pref.getString("stoppedLocationToken",""));
    if(TravelLocationService.lastPosition!=null) result.put("position",TravelLocationService.lastPosition); call.resolve(result);
  }
}
