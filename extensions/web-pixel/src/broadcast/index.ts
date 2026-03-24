export type BroadcastConfig = {
  dataLayerEnabled: boolean;
};

type LocalStorage = {
  setItem(key: string, value: any): Promise<void>;
};

const BROADCAST_QUEUE_KEY = 'pxhog_broadcast_queue';

export function createBroadcaster(config: BroadcastConfig, localStorage: LocalStorage) {
  const anyEnabled = Object.values(config).some(Boolean);

  return async function broadcast(eventName: string, properties: Record<string, any>) {
    if (!anyEnabled) return;
    await localStorage.setItem(BROADCAST_QUEUE_KEY, JSON.stringify({
      event: eventName,
      properties,
      destinations: {
        dataLayer: config.dataLayerEnabled,
      },
      _ts: Date.now(),
    }));
  };
}
