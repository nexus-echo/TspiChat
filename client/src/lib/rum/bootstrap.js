import { getClientBuildId } from './build';

const RUM_QUEUE_KEY = 'tspi-rum-queue';
const MAX_RUM_QUEUE = 20;

function safeNow(targetWindow) {
  return Math.round(targetWindow.performance?.now?.() ?? 0);
}

function safeAttributes(attributes) {
  const output = {};

  Object.keys(attributes || {}).forEach((key) => {
    const value = attributes[key];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return;
    }
    output[key] = value;
  });

  return output;
}

export function installRumBootstrap(targetWindow) {
  const targetDocument = targetWindow.document;
  const clientBuildId = getClientBuildId(targetDocument);
  const targetNavigator = targetWindow.navigator;
  let targetSessionStorage;
  try {
    targetSessionStorage = targetWindow.sessionStorage;
  } catch {
    targetSessionStorage = undefined;
  }

  targetWindow.__tspiRumQueue = Array.isArray(targetWindow.__tspiRumQueue)
    ? targetWindow.__tspiRumQueue
    : [];

  function enqueueRumEvent(event, shouldPersist) {
    if (targetWindow.__tspiRumQueue.length >= MAX_RUM_QUEUE) {
      const replaceIndex = targetWindow.__tspiRumQueue.findIndex(
        (queuedEvent) => queuedEvent && queuedEvent.type === 'visibility-change',
      );
      targetWindow.__tspiRumQueue.splice(replaceIndex === -1 ? 0 : replaceIndex, 1);
    }
    targetWindow.__tspiRumQueue.push(event);
    if (shouldPersist !== false) {
      persistRumQueue();
    }
  }

  function recordRumQueueStorageError(operation) {
    try {
      enqueueRumEvent(
        {
          type: 'rum-queue-storage-error',
          at: safeNow(targetWindow),
          visibilityState: targetDocument.visibilityState,
          attributes: { operation },
        },
        false,
      );
    } catch {
      /* Diagnostics should never affect application startup. */
    }
  }

  function persistRumQueue() {
    try {
      if (!targetSessionStorage) {
        throw new Error('sessionStorage unavailable');
      }
      targetSessionStorage.setItem(RUM_QUEUE_KEY, JSON.stringify(targetWindow.__tspiRumQueue));
    } catch {
      recordRumQueueStorageError('persist');
    }
  }

  targetWindow.__tspiRumPush = function (type, attributes) {
    try {
      enqueueRumEvent({
        type,
        at: safeNow(targetWindow),
        visibilityState: targetDocument.visibilityState,
        attributes: { ...safeAttributes(attributes), clientBuildId },
      });
    } catch {
      /* Diagnostics should never affect application startup. */
    }
  };

  targetWindow.__tspiRumPush('inline-start', {
    prerendering: targetDocument.prerendering === true,
    currentPath: targetWindow.location.pathname,
  });

  targetDocument.addEventListener(
    'visibilitychange',
    () => {
      targetWindow.__tspiRumPush('visibility-change', { state: targetDocument.visibilityState });
    },
    true,
  );
  targetWindow.addEventListener(
    'pageshow',
    (event) => {
      targetWindow.__tspiRumPush('pageshow', { persisted: event.persisted === true });
    },
    true,
  );

  if (targetNavigator.serviceWorker) {
    const controller = targetNavigator.serviceWorker.controller;
    targetWindow.__tspiRumPush('sw-controller', {
      controlled: !!controller,
      state: controller && controller.state,
      scriptUrl: controller && controller.scriptURL,
    });
    targetNavigator.serviceWorker.getRegistrations().then(
      (registrations) => {
        targetWindow.__tspiRumPush('sw-registrations', {
          count: registrations.length,
          firstScopeUrl: registrations[0] && registrations[0].scope,
        });
      },
      () => {
        targetWindow.__tspiRumPush('sw-registrations-error');
      },
    );
    targetNavigator.serviceWorker.addEventListener('controllerchange', () => {
      const nextController = targetNavigator.serviceWorker.controller;
      targetWindow.__tspiRumPush('sw-controller-change', {
        state: nextController && nextController.state,
        scriptUrl: nextController && nextController.scriptURL,
      });
    });
    targetNavigator.serviceWorker.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'TSPI_SW_PING') {
        return;
      }
      targetWindow.__tspiRumPush('sw-ping');
      targetWindow.__tspiRumPush('sw-pong');
    });
  }
}
