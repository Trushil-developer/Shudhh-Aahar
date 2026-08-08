// Mock: react-native-health
module.exports = new Proxy({}, {
  get: (_, key) => {
    if (key === '__esModule') return true;
    if (key === 'default') return {};
    return jest.fn(() => Promise.resolve({}));
  }
});
