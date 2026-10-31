package br.com.roteirodeviagem.app;

import static org.junit.Assert.assertEquals;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class TravelNativeRequestTest {
  @Test public void pendingRequestAfterScreenDestructionRejectsWithoutCrashing() {
    TravelNativePlugin plugin=new TravelNativePlugin();
    AtomicReference<String> rejection=new AtomicReference<>();
    PluginCall pending=new PluginCall(null,"TravelNative","late-request","request",new JSObject()) {
      @Override public void reject(String message) { rejection.set(message); }
    };
    plugin.handleOnDestroy();
    plugin.request(pending);
    assertEquals("A tela foi encerrada. Tente novamente.",rejection.get());
  }
}
