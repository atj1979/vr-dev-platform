let current = null;

export function setAppContext(next) {
  current = next;
}

export function getAppContext() {
  if (!current) throw new Error('The app is not ready yet');
  return current;
}
