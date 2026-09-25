export interface ProxyStatusSnapshot {
  source: "pi-settings" | "environment" | "direct";
  httpProxy: string | null;
  httpsProxy: string | null;
  noProxy: string;
  settingsPath: string;
}

export interface DesktopProxyStatus extends ProxyStatusSnapshot {
  version: string;
  buildLabel: string;
}
