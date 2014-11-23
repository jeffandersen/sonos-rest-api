var zone = exports; exports.constructor = function zone(){};

var _ = require('lodash');
var sonos = require('./sonos');

function Zone(opts) {
  this.sonos = opts.sonos;
  this.discovery = this.sonos.discovery;

  if (!this.sonos) {
    throw new Error('Sonos object required for zone');
  }

  return this;
}

Zone.prototype.lookup = function(uuid) {
  this.zones = this.discovery.getZones();

  if (_.isUndefined(uuid)) {
    return this.zones;
  }

  var zone = _.filter(this.zones, function(zone) {
    return zone.uuid === uuid;
  })[0];

  if (!zone) {
    return null;
  }

  this.zone = zone;

  return zone;
};

Zone.prototype.state = function() {
  return this.zone.coordinator.state;
};

Zone.prototype.action = function(action) {
  var player = this.discovery.getPlayerByUUID(this.zone.uuid);
  var fn = player && player[action];
  if (_.isFunction(fn)) {
    return fn();
  }

  throw new Error('No action named `' + action + '` availble');
};

/**
 * Middleware to list all zones
 */
zone.all = function(req, res, next) {
  var client = new Zone({
    sonos: sonos.client
  });

  req.zones = client.lookup() || [];

  next();
};

/**
 * Middleware to look up zone by uuid
 */
zone.lookup = function(req, res, next) {
  req.zone = new Zone({
    sonos: sonos.client
  });

  // Zone of that uuid was not found on the network
  if (!req.zone.lookup(req.params.uuid)) {
    return next(new Error('Zone not found'));
  }

  next();
};

zone.Zone = Zone;
