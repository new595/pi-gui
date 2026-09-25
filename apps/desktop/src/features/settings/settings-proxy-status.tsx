import { useCallback, useEffect, useState } from "react";
import type { DesktopProxyStatus } from "../../../contracts/proxy-status";
import { SettingsGroup, SettingsRow } from "./settings-utils";

export function SettingsProxyStatus() {
  const [status, setStatus] = useState<DesktopProxyStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [openError, setOpenError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await window.piApp?.getProxyStatus();
      if (!next) throw new Error("Pi settings status is unavailable.");
      setStatus(next);
    } catch {
      setError("Could not read the proxy status. Restart Pi GUI and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      setError("Could not read the proxy status. Restart Pi GUI and try again.");
      setLoading(false);
    });
  }, [refresh]);

  const openSettings = async () => {
    setOpenError(undefined);
    try {
      const failure = await window.piApp?.openProxySettings();
      if (failure) setOpenError(failure);
    } catch {
      setOpenError("Could not open Pi settings. Check that settings.json is available.");
    }
  };

  return (
    <SettingsGroup
      title="Pi and proxy"
      description="This shows the proxy configuration used at startup. NO_PROXY can send matching requests directly. Proxy changes take effect after you fully quit and restart Pi GUI."
    >
      {loading && !status ? <p role="status">Loading Pi and proxy status…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {status ? (
        <>
          <SettingsRow title="Personal version" description={`Build ${status.buildLabel}`}>
            <span>{status.version}</span>
          </SettingsRow>
          <SettingsRow title="Proxy source">
            <span>{sourceLabel(status.source)}</span>
          </SettingsRow>
          <SettingsRow title="HTTP proxy">
            <span>{redactProxyAddress(status.httpProxy)}</span>
          </SettingsRow>
          <SettingsRow title="HTTPS proxy">
            <span>{redactProxyAddress(status.httpsProxy)}</span>
          </SettingsRow>
          <SettingsRow title="NO_PROXY">
            <span>{status.noProxy || "Not set"}</span>
          </SettingsRow>
        </>
      ) : null}
      <div className="settings-row">
        <div className="settings-row__actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={loading}
            onClick={() => {
              void refresh().catch(() =>
                setError("Could not read the proxy status. Restart Pi GUI and try again."),
              );
            }}
          >
            Refresh status
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              void openSettings().catch(() =>
                setOpenError("Could not open Pi settings. Check that settings.json is available."),
              );
            }}
          >
            Open Pi settings
          </button>
        </div>
      </div>
      {openError ? <p role="alert">{openError}</p> : null}
    </SettingsGroup>
  );
}

function sourceLabel(source: DesktopProxyStatus["source"]): string {
  switch (source) {
    case "pi-settings":
      return "Pi settings";
    case "environment":
      return "Environment variables";
    case "direct":
      return "Direct connection";
  }
}

function redactProxyAddress(value: string | null): string {
  if (!value) return "Direct connection";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "Configured proxy";
  }
}
