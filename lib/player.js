var player = exports; exports.constructor = function player(){};

var _ = require('lodash');
var sonos = require('./sonos');

function Player(opts) {
  this.sonos = opts.sonos;
  this.discovery = this.sonos.discovery;

  if (!this.sonos) {
    throw new Error('Sonos object required for player');
  }

  return this;
}

Player.prototype.lookup = function(name) {
  var player = this.discovery.getPlayer(decodeURIComponent(name));

  if (!player) {
    return null;
  }

  this.player = player;
  this.coordinator = this.player.coordinator;

  return player;
};

Player.prototype.state = function() {
  return this.player.getState();
};

Player.prototype.action = function(action) {
  var fn = this.player && this.player[action];
  if (_.isFunction(fn)) {
    return fn();
  }

  throw new Error('No action named `' + action + '` avaialble');
};

/**
 * Middleware to look up player by room name
 */
player.lookup = function(req, res, next) {
  req.player = new Player({
    sonos: sonos.client
  });

  // Player of that name was not found on the network
  if (!req.player.lookup(req.params.name)) {
    return next(new Error('Player not found'));
  }

  next();
};

player.Player = Player;
