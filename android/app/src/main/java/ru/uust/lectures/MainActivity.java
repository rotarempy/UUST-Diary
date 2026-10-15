package ru.uust.lectures;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LanSyncPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
