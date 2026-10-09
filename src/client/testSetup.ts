// jsdom does not implement scrolling; the stub keeps the test output free of "Not implemented" noise.
window.scrollTo = () => undefined;
