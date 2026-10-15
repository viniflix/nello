import { settleResources } from './failure';

// Publish each result as it settles; a slow sibling must not hold a healthy section.
export async function observeResources(loaders, onSettled) {
  const results = await Promise.all(Object.entries(loaders).map(async ([key, load]) => {
    const result = (await settleResources({ [key]: load }))[key];
    onSettled(key, result);
    return [key, result];
  }));
  return Object.fromEntries(results);
}
