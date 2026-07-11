import { describe, expect, it } from 'vitest';
import { createPosthogOptions } from './posthog';

describe('createPosthogOptions', () => {
  it('uses explicit analytics with session recording disabled', () => {
    expect(createPosthogOptions({})).toMatchObject({
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
    });
  });
});
