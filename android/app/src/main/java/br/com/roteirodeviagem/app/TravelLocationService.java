package br.com.roteirodeviagem.app;

import android.Manifest;
import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.IBinder;
import android.os.Build;
import android.os.Bundle;
import android.content.pm.PackageManager;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import java.net.URL;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started, visible location service. No boot receiver or automatic background start. */
public class TravelLocationService extends Service implements LocationListener {
  public static volatile boolean running=false;
  public static volatile JSObject lastPosition=null;
  public static volatile String activeConvoyId="";
  private volatile String tripId="",convoyId="",locationToken="",origin="",cookie="";
  private double distanceKm=0;
  private Location previous;
  private long lastSend=0;
  private LocationManager manager;
  private SharedPreferences pref;
  private final ExecutorService io=Executors.newSingleThreadExecutor();
  @Override public IBinder onBind(Intent intent) { return null; }
  @Override public void onCreate() {
    super.onCreate(); pref=getSharedPreferences("travel-gps",0); manager=(LocationManager)getSystemService(LOCATION_SERVICE);
    if(Build.VERSION.SDK_INT>=26) ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel("travel-gps","Viagem em andamento",NotificationManager.IMPORTANCE_LOW));
  }
  @Override public int onStartCommand(Intent intent,int flags,int startId) {
    if(intent==null) { stopSelf(); return START_NOT_STICKY; }
    String action=intent.getAction();
    if("STOP_ALL".equals(action)) { pref.edit().putString("stoppedLocationToken",locationToken).apply(); revoke(); tripId=""; convoyId=""; activeConvoyId=""; stopSelf(); return START_NOT_STICKY; }
    if("STOP_TRIP".equals(action)) { tripId=""; previous=null; }
    if("STOP_CONVOY".equals(action)) { pref.edit().putString("stoppedLocationToken",locationToken).apply(); revoke(); convoyId=""; activeConvoyId=""; }
    if("TRIP".equals(action)) {
      String next=intent.getStringExtra("tripId"); if(next==null || next.length()>300) { stopSelf(); return START_NOT_STICKY; }
      if(!next.equals(tripId)) {
        tripId=next; previous=null;
        distanceKm=Math.max(intent.getDoubleExtra("distanceKm",0), next.equals(pref.getString("tripId","")) ? Double.longBitsToDouble(pref.getLong("distance",Double.doubleToLongBits(0))) : 0);
        persist();
      }
    }
    if("CONVOY".equals(action)) {
      String next=intent.getStringExtra("convoyId"), nextToken=intent.getStringExtra("locationToken");
      if(!java.util.Objects.equals(next,convoyId) || !java.util.Objects.equals(nextToken,locationToken)) { revoke(); lastSend=0; }
      convoyId=next; locationToken=nextToken==null?"":nextToken; activeConvoyId=next==null?"":next; origin=intent.getStringExtra("origin"); cookie=intent.getStringExtra("cookie");
    }
    if(tripId.isEmpty() && (convoyId==null || convoyId.isEmpty())) { stopSelf(); return START_NOT_STICKY; }
    if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED) { stopSelf(); return START_NOT_STICKY; }
    Intent stop=new Intent(this,TravelLocationService.class).setAction("STOP_ALL");
    Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    Notification notification=new NotificationCompat.Builder(this,"travel-gps").setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Roteiro de Viagem").setContentText("GPS ativo durante a viagem. Toque para abrir.").setOngoing(true)
      .setContentIntent(PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT))
      .addAction(0,"Parar GPS",PendingIntent.getService(this,1,stop,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build();
    startForeground(41,notification); running=true;
    try { manager.removeUpdates(this); manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,2000,0,this); }
    catch(SecurityException|IllegalArgumentException error) { stopSelf(); }
    return START_NOT_STICKY;
  }
  private void persist() { if(!tripId.isEmpty()) pref.edit().putString("tripId",tripId).putLong("distance",Double.doubleToLongBits(distanceKm)).apply(); }
  @Override public void onLocationChanged(Location location) {
    long age=System.currentTimeMillis()-location.getTime();
    if(age>60000 || age< -5000 || !location.hasAccuracy() || location.getAccuracy()>50) { previous=null; return; }
    JSObject pos=new JSObject(); JSArray coords=new JSArray(); coords.put((Object)location.getLatitude()); coords.put((Object)location.getLongitude());
    pos.put("coords",coords); pos.put("accuracyMeters",location.getAccuracy()); pos.put("timestamp",location.getTime()); pos.put("speedMetersPerSecond",location.hasSpeed()?location.getSpeed():org.json.JSONObject.NULL); lastPosition=pos;
    if(!tripId.isEmpty() && previous!=null) {
      double seconds=(location.getTime()-previous.getTime())/1000.0, meters=previous.distanceTo(location);
      if(seconds>0 && seconds<=30 && meters/seconds*3.6<=200 && meters>=Math.max(3,(previous.getAccuracy()+location.getAccuracy())/2)) { distanceKm+=meters/1000; previous=location; persist(); }
      else if(seconds>30 || meters/Math.max(seconds,0.001)*3.6>200) previous=location;
    } else previous=location;
    if(convoyId!=null && !convoyId.isEmpty() && System.currentTimeMillis()-lastSend>=5000) {
      lastSend=System.currentTimeMillis(); String group=convoyId, token=locationToken, targetOrigin=origin, targetCookie=cookie;
      JSObject data=new JSObject(); data.put("enabled",true); data.put("locationToken",token); data.put("coords",coords); data.put("accuracyMeters",location.getAccuracy()); java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US); format.setTimeZone(java.util.TimeZone.getTimeZone("UTC")); data.put("timestamp",format.format(new java.util.Date(location.getTime())));
      io.execute(() -> { int status=send(group,data.toString(),targetOrigin,targetCookie); if((status==401 || status==403 || status==404 || status==409) && group.equals(convoyId) && token.equals(locationToken)) { convoyId=""; activeConvoyId=""; if(tripId.isEmpty()) stopSelf(); } });
    }
  }
  private int send(String group,String data,String targetOrigin,String targetCookie) {
    HttpURLConnection conn=null;
    try {
      URL url=new URL(targetOrigin+"/api/convoys/"+group+"/location"); if(!url.getProtocol().equals("https")) return 400;
      conn=(HttpURLConnection)url.openConnection(); conn.setInstanceFollowRedirects(false); conn.setConnectTimeout(10000); conn.setReadTimeout(10000); conn.setRequestMethod("PUT"); conn.setDoOutput(true);
      if(targetCookie!=null) conn.setRequestProperty("Cookie",targetCookie); conn.setRequestProperty("Content-Type","application/json"); conn.getOutputStream().write(data.getBytes(StandardCharsets.UTF_8)); return conn.getResponseCode();
    } catch(Exception error) { return 0; } finally { if(conn!=null) conn.disconnect(); }
  }
  private void revoke() { if(convoyId!=null && !convoyId.isEmpty()) { String group=convoyId,targetOrigin=origin,targetCookie=cookie; JSObject data=new JSObject();data.put("enabled",false);data.put("locationToken",locationToken);String body=data.toString();io.execute(() -> send(group,body,targetOrigin,targetCookie)); } }
  @Override public void onProviderDisabled(String provider) { previous=null; lastPosition=null; }
  @Override public void onProviderEnabled(String provider) {}
  @Override public void onStatusChanged(String provider,int status,Bundle extras) {}
  @Override public void onDestroy() { running=false; activeConvoyId=""; lastPosition=null; if(manager!=null) manager.removeUpdates(this); persist(); revoke(); io.shutdown(); super.onDestroy(); }
}
