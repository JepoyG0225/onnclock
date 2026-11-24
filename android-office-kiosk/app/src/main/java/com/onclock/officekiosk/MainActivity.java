package com.onclock.officekiosk;
import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.*;
import android.view.WindowManager;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.Button;
import android.widget.TextView;

public class MainActivity extends Activity {
 private WebView web;
 private static final String URL = "https://onclockph.com/office-kiosk";
 private boolean trusted(Uri uri) { return "https".equals(uri.getScheme()) && "onclockph.com".equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443); }
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_SECURE);
  web = new WebView(this);
  web.setFitsSystemWindows(true);
  if (android.os.Build.VERSION.SDK_INT >= 30) web.setOnApplyWindowInsetsListener((v, insets) -> { android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime()); v.setPadding(bars.left,bars.top,bars.right,bars.bottom); return insets; });
  setContentView(web);
  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setMediaPlaybackRequiresUserGesture(false);
  settings.setGeolocationEnabled(true);
  settings.setUserAgentString(settings.getUserAgentString() + " OnClockOfficeKiosk/1.0.0");
  WebView.setWebContentsDebuggingEnabled(false);
  CookieManager.getInstance().setAcceptCookie(true);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
  web.setWebViewClient(new WebViewClient() {
   @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !trusted(r.getUrl()) || !"/office-kiosk".equals(r.getUrl().getPath()); }
   @Override public void onPageFinished(WebView v, String url) { CookieManager.getInstance().flush(); }
   @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) { if (r.isForMainFrame()) showOffline(); }
  });
  web.setWebChromeClient(new WebChromeClient() {
   @Override public void onPermissionRequest(PermissionRequest request) {
    runOnUiThread(() -> {
     if (trusted(request.getOrigin()) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      for (String resource : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) { request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); return; }
     }
     request.deny();
    });
   }
   @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
    callback.invoke(origin, trusted(Uri.parse(origin)) && (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED), false);
   }
  });
  if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.CAMERA, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, 10);
  else web.loadUrl(URL);
 }
 @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) { super.onRequestPermissionsResult(code,permissions,results); if(code==10) web.loadUrl(URL); }
 private void showOffline() {
  LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(32,80,32,32); panel.setGravity(android.view.Gravity.CENTER);
  TextView text = new TextView(this); text.setText("OnClock Office Kiosk\nUnable to connect. Check your internet connection. Attendance has not been confirmed."); text.setTextSize(20); panel.addView(text);
  Button retry = new Button(this); retry.setText("Retry connection"); retry.setOnClickListener(v -> {setContentView(web); web.loadUrl(URL);}); panel.addView(retry); setContentView(panel);
 }
 @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); web.onPause(); }
 @Override protected void onResume() { super.onResume(); if(web!=null) web.onResume(); }
 @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
 @Override public void onBackPressed() { /* Shared attendance terminal stays on its only screen. */ }
}
