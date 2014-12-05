var zones = exports; exports.constructor = function zones(){};

var _ = require('lodash');
var async = require('async');

var players = require('./players');

function Zones(sonos) {
  if (_.isUndefined(sonos)) {
    throw new Error('Sonos object required for zones');
  }

  this.sonos = sonos;
  this.discovery = this.sonos.discovery;
}

/**
 * Lookup zone objects
 *
 * @public
 * @param {string} uuid - Zone's uuid (optional)
 * @param {function} cb - Callback function
 */
Zones.prototype.find = function(uuid, cb) {
  var self = this;

  if (_.isFunction(uuid)) {
    cb = uuid;
    uuid = null;
  } else if (_.isUndefined(uuid)) {
    uuid = null;
  }

  // Lookup zone by its uuid, find all if no id passed
  self._find(uuid, function(err, zones) {
    if (err) {
      return cb(err);
    }

    var filtered = [];

    // JSON returned to the user must be filtered
    async.each(zones, function(zone, next) {
      var filteredState = self._filterState(zone);

      // Introduce album art if lastfm integration is enabled
      self.sonos.extendTrackData(filteredState, function(err, state) {
        if (err) {
          return next(err);
        }
      
        filtered.push(state);
        next();
      });
    }, function(err) {
      if (err) {
        return cb(err);
      }
    
      cb(null, filtered);
    });
  });
};

/**
 * Return unfiltered zone objects
 *
 * @private
 * @param {function} cb - Callback function
 */
Zones.prototype._find = function(uuid, cb) {
  if (_.isFunction(uuid)) {
    cb = uuid;
    uuid = null;
  }

  // pull zones from network
  var zones = this.discovery.getZones();

  // return all if no id passed
  if (!uuid) {
    return process.nextTick(function() {
      cb(null, zones);
    });
  }

  // find zone by its uuid
  var zone = _.where(zones, { uuid: uuid });

  if (!zone) {
    var err = new Error('Zone was not found in network');
    err.type = 'not found';
    return cb(err);
  }

  return cb(null, zone);
};

/**
 * Perform action against an entire zone
 *
 * @public
 * @param {string} uuid - Uuid of zone to take action on
 * @param {string} action - Name of the action
 * @param {object} opts - Action options (optional)
 * @param {function} cb - Callback function
 */
Zones.prototype.action = function(uuid, action, opts, cb) {
  var self = this;
  self._action(uuid, action, opts, function(err) {
    if (err) {
      return cb(err);
    }

    // Sonos discovery does not supply a callback for when an action is done
    // we have to introduce a timeout in order to obtain the correct state
    setTimeout(function() {
      self.find(uuid, cb);
    }, self.sonos.stateTransitionTimeout);
  });
};

/**
 * Perform action against an entire zone
 *
 * @private
 * @param {string} uuid - Uuid of zone to take action on
 * @param {string} action - Name of the action
 * @param {object} opts - Action options (optional)
 * @param {function} cb - Callback function
 */
Zones.prototype._action = function(uuid, action, opts, cb) {
  var self = this;
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  // Find the coordinating playing and take action on it
  players.client._find({
    uuid: uuid
  }, function(err, player) {
    if (err) {
      return cb(err);
    }
    if (!player) {
      err = new Error('Zone was not found in network');
      err.type = 'not found';
      return cb(err);
    }

    self.sonos._action(player, action, opts, cb);
  });
};

/**
 * Remove queued tracks for particular zone
 *
 * @public
 * @param {string} uuid - Zone uuid
 * @param {function} cb - Callback function
 */
Zones.prototype.clearQueue = function(uuid, cb) {
  var self = this;
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  self._find(uuid, function(err, zones) {
    if (err) {
      return cb(err);
    }

    var zone = zones[0];
    players.client.clearQueue({
      roomName: zone.coordinator.roomName,
      opts: opts
    }, cb);
  });
};

/**
 * Return queued tracks for particular zone
 *
 * @public
 * @param {string} uuid - Zone uuid
 * @param {object} opts - Query parameters
 * @param {function} cb - Callback function
 */
Zones.prototype.queue = function(uuid, opts, cb) {
  var self = this;
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  self._find(uuid, function(err, zones) {
    if (err) {
      return cb(err);
    }

    var zone = zones[0];
    players.client.queue({
      roomName: zone.coordinator.roomName,
      opts: opts
    }, cb);
  });
};

/**
 * Return all playlists for particular zone
 *
 * @public
 * @param {string} uuid - Zone uuid
 * @param {function} cb - Callback function
 */
Zones.prototype.playlists = function(uuid, cb) {
  var self = this;
  self._find(uuid, function(err, zones) {
    if (err) {
      return cb(err);
    }

    var zone = zones[0];
    players.client.playlists({
      roomName: zone.coordinator.roomName
    }, cb);
  });
};

/**
 * Filter the state object to a more friendly, non-redundant format
 *
 * @private
 * @param {object} state - Sonos discovery zone state object
 */
Zones.prototype._filterState = function(state) {
  if (!_.isPlainObject(state)) {
    throw new Error('Cannot clean non-object state');
  }

  var players = [];
  var members = state.members;
  var zone = state.coordinator;

  // Filter player data for zone purpose
  members.forEach(function(member) {
    players.push({
      roomName: member.roomName,
      volume: member.state.volume,
      mute: member.state.mute
    });
  });

  return {
    uuid: zone.uuid,
    state: zone.state.zoneState,
    volume: zone.groupState.volume,
    mute: zone.groupState.mute,
    shuffle: zone.state.zonePlayMode.shuffle,
    repeat: zone.state.zonePlayMode.repeat,
    crossfade: zone.state.zonePlayMode.crossfade,
    currentTrack: zone.state.currentTrack,
    nextTrack: zone.state.nextTrack,
    members: players
  };
};

/**
 * Initialize the zones object
 *
 * @public
 * @param {object} sonos - Sonos client object
 */
zones.initialize = function(sonos) {
  zones.client = new Zones(sonos);
};

zones.Zones = Zones;
