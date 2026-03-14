// File: mobile/src/shims/ws.js
// Shim for the `ws` package — React Native has a native WebSocket global,
// so we just re-export it in the shape colyseus.js expects.

const W = global.WebSocket;

W.prototype.on = function (event, cb) {
  if (event === 'message') {
    this.addEventListener('message', (e) => cb(e.data));
  } else if (event === 'open') {
    this.addEventListener('open', cb);
  } else if (event === 'close') {
    this.addEventListener('close', cb);
  } else if (event === 'error') {
    this.addEventListener('error', cb);
  }
  return this;
};

W.prototype.once = function (event, cb) {
  const wrapper = (...args) => { cb(...args); this.removeEventListener(event, wrapper); };
  this.addEventListener(event, wrapper);
  return this;
};

W.prototype.off = function (event, cb) {
  this.removeEventListener(event, cb);
  return this;
};

module.exports = W;
module.exports.WebSocket = W;
module.exports.default   = W;
