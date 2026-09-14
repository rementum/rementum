/** Visibility alone misses Alt+Tab when the browser window remains on screen. */
export function observePageActivity(onChange: (active: boolean) => void): () => void {
  const sync = () => onChange(!document.hidden && document.hasFocus());
  const blur = () => onChange(false);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("focus", sync);
  window.addEventListener("blur", blur);
  sync();
  return () => {
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("focus", sync);
    window.removeEventListener("blur", blur);
  };
}
