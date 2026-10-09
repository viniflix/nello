import React from 'react';
import { render } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import ProductScreenshot from './ProductScreenshot';
it.each(['diary','chat','progress','plan','context','patient','dashboard'])('advertises only existing capture files for %s without caller orientation hints', screen => {
 const {container}=render(<ProductScreenshot screen={screen} />);
 for(const element of container.querySelectorAll('[srcset]')) {
  for(const candidate of element.getAttribute('srcset').split(',')) expect(existsSync(`public${candidate.trim().split(' ')[0]}`)).toBe(true);
 }
 if(['diary','chat','progress'].includes(screen)) {
  expect(container.querySelector('source')).toBeNull();
  expect(container.querySelector('img')).toHaveAttribute('width','345');
 }
});
