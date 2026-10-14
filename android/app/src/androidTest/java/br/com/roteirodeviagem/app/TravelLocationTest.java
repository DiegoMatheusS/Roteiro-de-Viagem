package br.com.roteirodeviagem.app;
import static org.junit.Assert.*;
import android.Manifest;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.app.NotificationManager;
import android.app.Notification;
import android.location.Location;
import android.location.LocationManager;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;
import androidx.test.uiautomator.UiDevice;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.RecordedRequest;
import okhttp3.tls.HeldCertificate;
import okhttp3.tls.HandshakeCertificates;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocketFactory;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
@RunWith(AndroidJUnit4.class)
public class TravelLocationTest {
 @Rule public GrantPermissionRule permissions=GrantPermissionRule.grant(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.POST_NOTIFICATIONS);
 private Context context;private LocationManager manager;private ActivityScenario<MainActivity> activity;private UiDevice device;
 interface Check {boolean ok() throws Exception;}
 private void await(Check check) throws Exception {long until=SystemClock.elapsedRealtime()+15000;while(SystemClock.elapsedRealtime()<until){if(check.ok())return;SystemClock.sleep(200);}assertTrue("O estado esperado não chegou em 15 segundos",check.ok());}
 @Before public void prepare() throws Exception {
  context=InstrumentationRegistry.getInstrumentation().getTargetContext();device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
  device.wakeUp();device.executeShellCommand("wm dismiss-keyguard");device.executeShellCommand("appops set "+context.getPackageName()+" android:mock_location allow");
  context.getSharedPreferences("travel-gps",0).edit().clear().commit();
  manager=(LocationManager)context.getSystemService(Context.LOCATION_SERVICE);
  manager.addTestProvider(LocationManager.GPS_PROVIDER,false,false,false,false,true,true,true,1,1);manager.setTestProviderEnabled(LocationManager.GPS_PROVIDER,true);
  activity=ActivityScenario.launch(MainActivity.class);
  await(()->Boolean.parseBoolean(js("!!window.Capacitor && document.body.innerText.includes('Entrar / Criar conta')")));
 }
 private String js(String expression) throws Exception {AtomicReference<String> value=new AtomicReference<>();activity.onActivity(a->a.getBridge().getWebView().evaluateJavascript(expression,value::set));await(()->value.get()!=null);return value.get();}
 private void start(String action,String tripId,String origin,String token){activity.onActivity(a->{Intent intent=new Intent(a,TravelLocationService.class).setAction(action).putExtra("tripId",tripId).putExtra("distanceKm",5.0).putExtra("convoyId","native-fixture").putExtra("origin",origin).putExtra("cookie","rdv_session=instrumentation-fixture").putExtra("locationToken",token);ContextCompat.startForegroundService(a,intent);});}
 private void position(double lat,double lng) {Location point=new Location(LocationManager.GPS_PROVIDER);point.setLatitude(lat);point.setLongitude(lng);point.setAccuracy(3);point.setTime(System.currentTimeMillis());point.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());manager.setTestProviderLocation(LocationManager.GPS_PROVIDER,point);}
 @After public void finish() throws Exception {device.wakeUp();device.executeShellCommand("wm dismiss-keyguard");context.stopService(new Intent(context,TravelLocationService.class));await(()->!TravelLocationService.running);if(activity!=null)activity.close();try{manager.removeTestProvider(LocationManager.GPS_PROVIDER);}catch(Exception ignored){}}
 @Test public void gpsAndConvoyContinueWithScreenOffAndNotificationStopsBoth() throws Exception {
  // The HTTPS server, certificate and session below exist only inside this instrumentation test.
  HeldCertificate cert=new HeldCertificate.Builder().commonName("127.0.0.1").addSubjectAlternativeName("127.0.0.1").build();
  HandshakeCertificates serverTls=new HandshakeCertificates.Builder().heldCertificate(cert).build(),clientTls=new HandshakeCertificates.Builder().addTrustedCertificate(cert.certificate()).build();
  SSLSocketFactory previous=HttpsURLConnection.getDefaultSSLSocketFactory();MockWebServer server=new MockWebServer();server.useHttps(serverTls.sslSocketFactory(),false);
  server.setDispatcher(new Dispatcher(){@Override public MockResponse dispatch(RecordedRequest request){return new MockResponse().setResponseCode(200).setBody("{}");}});
  server.start();HttpsURLConnection.setDefaultSSLSocketFactory(clientTls.sslSocketFactory());
  String trip="fixture-account:screen-off-trip",token="native-fixture-token";
  try {
   start("TRIP",trip,"",token);await(()->TravelLocationService.running&&trip.equals(TravelLocationService.activeTripId));
   start("CONVOY",trip,server.url("/").toString().replaceAll("/+$",""),token);await(()->"native-fixture".equals(TravelLocationService.activeConvoyId));
   position(-23.55,-46.63);await(()->TravelLocationService.lastPosition!=null);
   RecordedRequest first=server.takeRequest(15,TimeUnit.SECONDS);assertNotNull("O primeiro envio HTTPS do Comboio deve chegar",first);assertEquals("instrumentation-fixture",first.getHeader("Cookie").split("=")[1]);assertEquals(token,new JSONObject(first.getBody().readUtf8()).getString("locationToken"));
   device.pressHome();device.sleep();assertFalse("A tela do emulador deve estar apagada",device.isScreenOn());SystemClock.sleep(5500);
   position(-23.5496,-46.63);RecordedRequest second=server.takeRequest(15,TimeUnit.SECONDS);assertNotNull("O GPS deve continuar enviando com a tela apagada",second);
   JSONObject secondBody=new JSONObject(second.getBody().readUtf8());assertTrue(secondBody.getBoolean("enabled"));assertEquals(-23.5496,secondBody.getJSONArray("coords").getDouble(0),0.000001);
   double distance=Double.longBitsToDouble(context.getSharedPreferences("travel-gps",0).getLong("distance",0));assertTrue("A distância observada deve ser preservada",distance>5.02);
   NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);Notification gps=null;for(android.service.notification.StatusBarNotification item:notifications.getActiveNotifications())if(item.getId()==41)gps=item.getNotification();assertNotNull("A notificação do GPS deve estar disponível",gps);assertTrue("A notificação deve oferecer Parar GPS",gps.actions.length>0);
   gps.actions[0].actionIntent.send();await(()->!TravelLocationService.running);assertEquals(trip,context.getSharedPreferences("travel-gps",0).getString("stoppedTripId",""));assertEquals(token,context.getSharedPreferences("travel-gps",0).getString("stoppedLocationToken",""));
   RecordedRequest revoke=server.takeRequest(15,TimeUnit.SECONDS);assertNotNull("A revogação do compartilhamento deve chegar ao servidor",revoke);JSONObject revoked=new JSONObject(revoke.getBody().readUtf8());assertFalse(revoked.getBoolean("enabled"));assertEquals(token,revoked.getString("locationToken"));
   device.wakeUp();device.executeShellCommand("wm dismiss-keyguard");device.executeShellCommand("am start -n "+context.getPackageName()+"/br.com.roteirodeviagem.app.MainActivity");activity.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
   js("window.__gpsResult='';window.Capacitor.Plugins.TravelNative.startTracking({tripId:'"+trip+"',distanceKm:5}).then(()=>window.__gpsResult='started').catch(e=>window.__gpsResult=e.message);true");
   await(()->js("window.__gpsResult").contains("interrompido"));assertFalse(TravelLocationService.running);
   js("window.Capacitor.Plugins.TravelNative.startTracking({tripId:'"+trip+"',distanceKm:5,resume:true});true");await(()->TravelLocationService.running&&trip.equals(TravelLocationService.activeTripId));
  }finally{context.stopService(new Intent(context,TravelLocationService.class));await(()->!TravelLocationService.running);server.shutdown();HttpsURLConnection.setDefaultSSLSocketFactory(previous);}
 }
 @Test public void approximatePermissionDoesNotAuthorizePreciseTracking(){Context approximate=new ContextWrapper(context){@Override public int checkSelfPermission(String permission){return Manifest.permission.ACCESS_FINE_LOCATION.equals(permission)?PackageManager.PERMISSION_DENIED:PackageManager.PERMISSION_GRANTED;}};assertFalse(TravelNativePlugin.preciseLocationGranted(approximate));assertTrue(TravelNativePlugin.preciseLocationGranted(context));}
 @Test public void sosUsesDialAndComposeWithoutCallingOrSending(){assertEquals(Intent.ACTION_DIAL,ExternalActions.intentFor("tel:190").getAction());assertEquals("tel:+5511999999999",ExternalActions.intentFor("tel:+5511999999999").getDataString());assertEquals(Intent.ACTION_VIEW,ExternalActions.intentFor("https://api.whatsapp.com/send?phone=5511999999999&text=fixture").getAction());for(String invalid:new String[]{"javascript:alert(1)","file:///private","https://api.whatsapp.com.evil.example/send","tel:190;123"}){try{ExternalActions.intentFor(invalid);fail("Link não autorizado");}catch(IllegalArgumentException expected){}}}
}
