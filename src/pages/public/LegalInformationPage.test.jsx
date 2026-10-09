import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { it, expect, afterEach } from 'vitest';
import LegalInformationPage from './LegalInformationPage';
import { legalContent } from '@/features/privacy/legalContent';
afterEach(cleanup);
it.each(['/termos','/privacidade'])('preserves every legal sentence when presenting lists: %s', pathname => {
 const {container} = render(<MemoryRouter><LegalInformationPage pathname={pathname} /></MemoryRouter>);
 for (const [index, [,paragraphs]] of legalContent[pathname].sections.entries()) {
  const section=container.querySelector(`[data-section-index="${index}"]`);
  const text=[...section.querySelectorAll('p,li')].map(node=>node.textContent).join(' ');
  expect(text).toBe(paragraphs.join(' '));
 }
 expect(container.querySelectorAll('.site-document-list').length).toBeGreaterThan(0);
});
