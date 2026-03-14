// File: mobile/ws-shim.js
// Shim for the `ws` package — redirects to React Native's native WebSocket global.
// Place this file at the root of the mobile/ folder (same level as package.json).

const W = global.WebSocket;

W.prototype.on = function (event, cb) {
  if (event === 'message') {
    this.addEventListener('message', function (e) { cb(e.data); });
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
  var self = this;
  function wrapper() {
    cb.apply(this, arguments);
    self.removeEventListener(event, wrapper);
  }
  this.addEventListener(event, wrapper);
  return this;
};

W.prototype.off = function (event, cb) {
  this.removeEventListener(event, cb);
  return this;
};

module.exports = W;
module.exports.WebSocket = W;
module.exports.default = W;
