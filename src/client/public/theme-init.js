// Sets data-theme on <html> before the first paint. The same rule lives in data/theme.ts:
// an explicit choice in localStorage wins, otherwise the system mode, otherwise light.
(function () {
  var theme = 'light';
  try {
    var choice = localStorage.getItem('mp-theme');
    if (choice === 'light' || choice === 'dark') {
      theme = choice;
    } else if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      theme = 'dark';
    }
  } catch {
    theme = 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
