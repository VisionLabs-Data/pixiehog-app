export type BroadcastConfig = {
  dataLayerEnabled: boolean;
};

type LocalStorage = {
  setItem(key: string, value: any): Promise<void>;
};

export function createBroadcaster(config: BroadcastConfig, localStorage: LocalStorage) {
  const anyEnabled = Object.values(config).some(Boolean);
  let counter = 0;

  return async function broadcast(eventName: string, properties: Record<string, any>) {
    if (!anyEnabled) return;
    const idx = counter++;
    await localStorage.setItem(`pxhog_bcast_${idx}`, JSON.stringify({
      event: eventName,
      properties,
      destinations: {
        dataLayer: config.dataLayerEnabled,
      },
    }));
    await localStorage.setItem('pxhog_bcast_ptr', String(idx));
  };
}
