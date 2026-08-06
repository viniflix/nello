import { describe, expect, it } from 'vitest';
import { createPosthogOptions } from './posthog';

describe('createPosthogOptions', () => {
  it('captures minimized failures and navigation with replay disabled', () => {
    expect(createPosthogOptions({})).toMatchObject({
      autocapture: false,
      capture_pageview: 'history_change',
      capture_pageleave: true,
      capture_exceptions: true,
      capture_dead_clicks: true,
      disable_session_recording: true,
      enable_recording_console_log: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      session_recording: {
        blockSelector: 'img, video, audio, canvas, [data-posthog-block]',
        maskTextSelector: '*',
        maskAllInputs: true,
        recordHeaders: false,
        recordBody: false,
      },
    });
  });
});
