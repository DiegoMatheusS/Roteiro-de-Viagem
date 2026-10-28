package br.com.roteirodeviagem.app;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onDestroy() {
    if(isFinishing())TravelLocationService.stopForAppClose(this);
    super.onDestroy();
  }
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(TravelNativePlugin.class);super.onCreate(savedInstanceState);
    // O gesto e o botão Voltar seguem a navegação interna do Rolê, sem fechar a Activity.
    getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true) {
      @Override public void handleOnBackPressed() {
        if(getBridge()!=null && getBridge().getWebView()!=null)
          getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('rdv:android-back'))",null);
      }
    });
    WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
    // Android 15: o WebView ajusta o viewport para o teclado.
    // Nao aplique o IME como padding novamente: empurra toda a tela para cima.
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    View content=findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content,(view,insets)->{
      Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
      view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
    });ViewCompat.requestApplyInsets(content);
  }
}
