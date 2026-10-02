import { replayIntegration } from '@sentry/react';

export const createPrivateReplay = () => replayIntegration({ maskAllText: true, blockAllMedia: true });
