const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function assertSyntheticRecoveryIdentities(accounts, personas) {
  const registered = Object.values(personas || {});
  if (registered.length !== 9 || !Array.isArray(accounts) || accounts.length < 9 || accounts.length > 1000
    || new Set(accounts.map(account => account.id)).size !== accounts.length) throw Error('Invalid synthetic recovery identity inventory');
  for (const persona of registered) {
    if (!uuid.test(persona.id) || !persona.email?.endsWith('@example.invalid')
      || !accounts.some(account => account.id === persona.id && account.email === persona.email)) throw Error('Registered recovery persona missing');
  }
  for (const account of accounts) {
    if (!uuid.test(account.id) || !registered.some(persona => persona.id === account.id && persona.email === account.email)
      && account.email !== `${account.id}@example.invalid`) throw Error('Unregistered or non-synthetic recovery account');
  }
  return accounts.length;
}
