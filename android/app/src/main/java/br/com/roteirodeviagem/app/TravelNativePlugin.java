package br.com.roteirodeviagem.app;

import android.Manifest;
import android.content.Intent;
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
    if (!url.getProtocol().equals("https") || !url.getPath().isEmpty() && !url.getPath().equals("/") || url.getUserInfo()!=null || url.getQuery()!=null) throw new Exception("Configure RDV_API_URL com a origem HTTPS do servidor e gere o app novamente.");
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
        String cookie = CookieManager.getInstance().getCookie(base); if (cookie != null) connection.setRequestProperty("Cookie", cookie);
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
        for (java.util.Map.Entry<String,java.util.List<String>> entry : connection.getHeaderFields().entrySet()) if ("Set-Cookie".equalsIgnoreCase(entry.getKey())) for (String value:entry.getValue()) CookieManager.getInstance().setCookie(base,value);
        CookieManager.getInstance().flush();
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(); InputStream stream=status>=400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream!=null) { byte[] buffer=new byte[8192]; int read; while((read=stream.read(buffer))!=-1) { bytes.write(buffer,0,read); if(bytes.size()>4000000) throw new Exception("Resposta muito grande."); } stream.close(); }
        JSObject result=new JSObject(); result.put("status",status); result.put("body",Boolean.TRUE.equals(call.getBoolean("binary",false)) ? android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP) : bytes.toString("UTF-8")); call.resolve(result);
      } catch(Exception error) { call.reject(error.getMessage()); }
      finally { if(connection!=null) connection.disconnect(); }
    });
  }
  private boolean permissions(PluginCall call) {
    if (getPermissionState("location")!=PermissionState.GRANTED) { requestPermissionForAlias("location",call,"locationResult"); return false; }
    if (Build.VERSION.SDK_INT>=33 && getPermissionState("notifications")!=PermissionState.GRANTED) { requestPermissionForAlias("notifications",call,"notificationResult"); return false; }
    return true;
  }
  @PermissionCallback private void locationResult(PluginCall call) {
    if(getPermissionState("location")!=PermissionState.GRANTED) { call.reject("Permita localização precisa para acompanhar a viagem."); return; }
    if (call.getMethodName().equals("setConvoy")) setConvoy(call); else startTracking(call);
  }
  @PermissionCallback private void notificationResult(PluginCall call) { begin(call); }
  private void begin(PluginCall call) {
    try {
      Intent intent=new Intent(getContext(),TravelLocationService.class);
      if(call.getMethodName().equals("setConvoy")) {
        intent.setAction("CONVOY"); intent.putExtra("convoyId",call.getString("convoyId", "")); intent.putExtra("origin",origin()); intent.putExtra("cookie",CookieManager.getInstance().getCookie(origin()));
      } else { intent.setAction("TRIP"); intent.putExtra("tripId",call.getString("tripId", "")); intent.putExtra("distanceKm",call.getDouble("distanceKm",0.0)); }
      ContextCompat.startForegroundService(getContext(),intent); call.resolve();
    } catch(Exception error) { call.reject(error.getMessage()); }
  }
  @PluginMethod public void startTracking(PluginCall call) { if(permissions(call)) begin(call); }
  @PluginMethod public void stopTracking(PluginCall call) {
    if(TravelLocationService.running) { Intent intent=new Intent(getContext(),TravelLocationService.class).setAction("STOP_TRIP"); getContext().startService(intent); } call.resolve();
  }
  @PluginMethod public void setConvoy(PluginCall call) {
    if(!Boolean.TRUE.equals(call.getBoolean("enabled",false))) {
      if(TravelLocationService.running) getContext().startService(new Intent(getContext(),TravelLocationService.class).setAction("STOP_CONVOY")); call.resolve(); return;
    }
    if(permissions(call)) begin(call);
  }
  @PluginMethod public void state(PluginCall call) {
    JSObject result=new JSObject(); android.content.SharedPreferences pref=getContext().getSharedPreferences("travel-gps",0);
    result.put("tripId",pref.getString("tripId","")); result.put("distanceKm",Double.longBitsToDouble(pref.getLong("distance",Double.doubleToLongBits(0)))); result.put("running",TravelLocationService.running);
    if(TravelLocationService.lastPosition!=null) result.put("position",TravelLocationService.lastPosition); call.resolve(result);
  }
}
