var sonos = exports; exports.constructor = function sonos(){};

var _ = require('lodash');
var async = require('async');
var LastfmAPI = require('lastfmapi');
var SonosDiscovery = require('sonos-discovery');

// Optional lastfm integration for album art
if (process.env.LASTFM_API_KEY && process.env.LASTFM_SECRET) {
  console.log('LastFM integration enabled');
  var lfm = new LastfmAPI({
    'api_key': process.env.LASTFM_API_KEY,
    'secret': process.env.LASTFM_SECRET
  });
}

// Default timeout to wait before re-acquiring zone or player state
var STATE_TRANSITION_TIMEOUT = 500;

function Sonos(opts) {
  opts = _.isPlainObject(opts)? opts : {};
  this.discovery = new SonosDiscovery(_.pick(opts, 'discovery'));

  var defaultTimeout = STATE_TRANSITION_TIMEOUT;
  this.stateTransitionTimeout = opts.stateTransitionTimeout || defaultTimeout;
}

/**
 * Return all zone objects
 *
 * @public
 * @param {function} cb - Callback function
 */
Sonos.prototype.zones = function(cb) {
  var self = this;
  self._zones(function(err, zones) {
    if (err) {
      return cb(err);
    }

    var filtered = [];
    async.each(zones, function(zone, next) {
      var filteredState = self._zoneState(zone);
      self.extendTrackData(filteredState, function(err, state) {
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
 * Return all unfiltered zone objects
 *
 * @private
 * @param {function} cb - Callback function
 */
Sonos.prototype._zones = function(cb) {
  var zones = this.discovery.getZones();
  process.nextTick(function() {
    cb(null, zones);
  });
};

/**
 * Return zone object by uuid
 *
 * @public
 * @param {string} uuid - UUID of the zone to find
 * @param {function} cb - Callback function
 */
Sonos.prototype.zone = function(uuid, cb) {
  var self = this;
  self._zone(uuid, function(err, zone) {
    if (err) {
      return cb(err);
    }

    var state = self._zoneState(zone);
    self.extendTrackData(state, cb);
  });
};

/**
 * Return filtered player state by name
 *
 * @public
 * @param {string} name - Name of the player
 * @param {function} cb - Callback function
 */
Sonos.prototype.player = function(name, cb) {
  var self = this;
  self._player(name, function(err, player) {
    if (err) {
      return cb(err);
    }

    var state = self._playerState(player);
    self.extendTrackData(state, function(err, state) {
      if (err) {
        return cb(err);
      }

      cb(null, state);
    });
  });
};

/**
 * Return filtered player states for all zones
 *
 * @public
 * @param {function} cb - Callback function
 */
Sonos.prototype.players = function(cb) {
  var self = this;
  self.zones(function(err, zones) {
    if (err) {
      return cb(err);
    }

    var members = [];
    zones.forEach(function(zone) {
      members = members.concat(zone.members);
    });

    var players = [];
    var playerNames = _.pluck(members, 'roomName');

    async.forEach(playerNames, function(name, next) {
      self.player(name, function(err, state) {
        if (err) {
          return next(err);
        }

        players.push(state);
        next();
      });
    }, function(err) {
      if (err) {
        return cb(err);
      }

      cb(null, players);
    });
  });
};

/**
 * Return player object by name
 *
 * @public
 * @param {string} name - Name of the player
 * @param {function} cb - Callback function
 */
Sonos.prototype._player = function(name, cb) {
  var player = this.discovery.getPlayer(name);

  if (!player) {
    var err = new Error('The requested player could not be found');
    err.type = 'not found';
    return cb(err);
  }

  cb(null, player);
};

/**
 * Filter player object state for consumption
 *
 * @private
 * @param {object} player - Sonos discovery player object
 */
Sonos.prototype._playerState = function(player) {
  if (!_.isObject(player)) {
    throw new Error('Cannot clean non-object player');
  }

  return {
    roomName: player.roomName,
    state: player.state.currentState,
    volume: player.state.volume,
    mute: player.state.mute,
    shuffle: player.currentPlayMode.shuffle,
    repeat: player.currentPlayMode.repeat,
    crossfade: player.currentPlayMode.crossfade,
    currentTrack: player.state.currentTrack,
    nextTrack: player.state.nextTrack
  };
};

/**
 * Return unaltered zone object by uuid
 *
 * @private
 * @param {string} uuid - UUID of the zone to find
 */
Sonos.prototype._zone = function(uuid, cb) {
  this._zones(function(err, zones) {
    if (err) {
      return cb(err);
    }

    var zone = _.filter(zones, function(z) {
      return z.uuid === uuid;
    })[0];

    cb(null, zone);
  });
};

/**
 * Return playlists for particular player
 *
 * @public
 * @param {object} player - Player object
 * @param {object} opts - options (optional)
 * @param {function} cb - Callback function
 */
Sonos.prototype.playlists = function(player, opts, cb) {
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  if (!_.isPlainObject(opts)) {
    opts = {};
  }
  if (!_.isObject(player)) {
    throw new Error('Player object required');
  }
  if (!_.isFunction(cb)) {
    throw new Error('Callback function required');
  }

  player.getPlaylists(function(success, playlists) {
    if (!success) {
      var err = new Error('An error occurred while retrieving playlists');
      err.type = 'failed';
      return cb(err);
    }

    var titles = _.pluck(playlists, 'title');

    cb(null, titles);
  });
};

/**
 * Return all playlists for particular zone
 *
 * @public
 * @param {string} uuid - Zone uuid
 * @param {object} opts - options (optional)
 * @param {function} cb - Callback function
 */
Sonos.prototype.zonePlaylists = function(uuid, opts, cb) {
  var player = this.discovery.getPlayerByUUID(uuid);
  this.playlists(player, opts, cb);
};

/**
 * Perform action against a player object
 *
 * @public
 * @param {object} playerName - Player name
 * @param {string} action - Name of the action
 * @param {object} opts - Action options (optional)
 * @param {function} cb - Callback function
 */
Sonos.prototype.action = function(playerName, action, opts, cb) {
  var self = this;
  self._player(playerName, function(err, player) {
    if (err) {
      return cb(err);
    }

    self._action(player, action, opts, function(err) {
      if (err) {
        return cb(err);
      }

      setTimeout(function() {
        self.player(playerName, cb);
      }, self.stateTransitionTimeout);
    });
  });
};

/**
 * Perform action against a player object
 *
 * @private
 * @param {object} player - Player object
 * @param {string} action - Name of the action
 * @param {object} opts - Action options (optional)
 * @param {function} cb - Callback function
 */
Sonos.prototype._action = function(player, action, opts, cb) {
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  if (!_.isObject(player)) {
    throw new Error('Player object required');
  }
  if (!_.isString(action)) {
    throw new Error('Action name required');
  }
  if (!_.isFunction(cb)) {
    throw new Error('Callback function required');
  }

  var ACTIONS_MAP = {
    'play': 'play',
    'pause': 'pause',
    'next': 'nextTrack',
    'previous': 'previousTrack',
    'prev': 'previousTrack'
  };

  // Dynamically call action function if no parameters are needed
  var playerAction = ACTIONS_MAP[action];
  var fn = player && (player[playerAction] || player.coordinator[playerAction]);
  if (_.isFunction(fn)) {
    return fn.call(player, callback);
  }

  // Player functions which require additional parameters
  switch (action) {
    case 'crossfade':
      _handlePlayMode(action, opts.state, callback);
    break;
    case 'repeat':
      _handlePlayMode(action, opts.state, callback);
    break;
    case 'shuffle':
      _handlePlayMode(action, opts.state, callback);
    break;
    case 'mute':
      player.mute(true, callback);
    break;
    case 'unmute':
      player.mute(false, callback);
    break;
    case 'playpause':
      if (player.coordinator.state.currentState === 'PLAYING') {
        return player.pause(callback);
      }

      player.play(callback);
    break;
    case 'playlist':
      this.playlists(player, function(err, playlists) {
        if (err) {
          return cb(err);
        }
        if (!_.contains(playlists, opts.title)) {
          err = new Error('The requested playlist does not exist');
          err.type = 'not found';
          return cb(err);
        }

        player.replaceQueueWithPlaylist(opts.title, function(success) {
          if (!success) {
            var err = new Error('Failed to replace queue with playlist');
            err.type = 'failed';
            return cb(err);
          }

          cb();
        });
      });
    break;
    default:
      var err = new Error('The action requested was not found');
      err.type = 'not found';
      return cb(err);
  }

  /**
   * Abstracted code for boolean success argument
   *
   * @param {boolean} success - Whether the function succeeded
   */
  function callback(success) {
    if (!success) {
      return cb(new Error('Failed to complete action'));
    }

    cb();
  }

  /**
   * Abstracted code for setting play mode state
   *
   * @param {string} playMode - The play mode to update
   * @param {mixed} state - Boolean or on/off state to use
   * @param {function} cb - Callback function
   */
  function _handlePlayMode(playMode, state, cb) {
    // Turn on specified play more
    if (state === 'true' || state === 'on') {
      state = true;

    // Turn off specified play mode
    } else if (state === 'false' || state === 'off') {
      state = false;

    // Toggle if no state
    } else {
      var current = player.coordinator.currentPlayMode[playMode];
      state = !current;
    }

    player.coordinator[playMode](state);
    callback(true);
  }
};

/**
 * Take an action on a zone by UUID
 *
 * @public
 * @param {string} uuid - UUID of a particular zone
 * @param {string} action - String in enum of actions
 * @param {object} opts - Action options (optional)
 * @param {function} fn - Callback function
 */
Sonos.prototype.zoneAction = function(uuid, action, opts, cb) {
  var self = this;
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  self.zone(uuid, function(err) {
    if (err) {
      return cb(err);
    }

    var player = self.discovery.getPlayerByUUID(uuid);
    self._action(player, action, opts, function(err) {
      if (err) {
        return cb(err);
      }

      setTimeout(function() {
        self.zone(uuid, cb);
      }, self.stateTransitionTimeout);
    });
  });
};

/**
 * Filter the state object to a more friendly, non-redundant format
 *
 * @private
 * @param {object} state - Sonos discovery zone state object
 */
Sonos.prototype._zoneState = function(state) {
  if (!_.isPlainObject(state)) {
    throw new Error('Cannot clean non-object state');
  }

  var members = state.members;
  var zone = state.coordinator;
  var players = [];

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
 * Apply album art to a state object
 *
 * @private
 * @param {object} state - Filtered state object
 * @param {function} cb - Callback function
 */
Sonos.prototype.extendTrackData = function(state, cb) {
  if (_.isUndefined(lfm)) {
    return cb(null, state);
  }

  var self= this;
  self._findAlbumArt(state.currentTrack, function(err, track) {
    if (err) {
      return cb(err);
    }

    state.currentTrack = track;

    self._findAlbumArt(state.currentTrack, function(err, track) {
      if (err) {
        return cb(err);
      }

      state.nextTrack = track;

      cb(null, state);
    });
  });
};

/**
 * Obtain album art from LastFM for a given track
 *
 * @param {object} track - Track info as provided by Sonos player
 * @param {function} cb - Callback function
 */
Sonos.prototype._findAlbumArt = function(track, cb) {
  if (!track) {
    delete track.albumArtURI;
    return cb(null, track);
  }

  // Get track from LastFM api
  lfm.track.getInfo({
    artist: track.artist,
    track: track.title
  }, function(err, trackData) {

    // Ignore lastfm error, proceed without albumart
    if (err) {
      console.error('Could not find albumart', err);
      delete track.albumArtURI;

    // Only apply album art if extralarge is found
    } else {
      var art = trackData.album.image;
      var extralarge = _.where(art, { size: 'extralarge' })[0];
      if (!extralarge) {
        delete track.albumArtURI;
      } else {
        track.albumArtURI = extralarge['#text'];
      }
    }

    cb(null, track);
  });
};

/**
 * Initialize the sonos client and attach to exported scope
 *
 * @public
 * @param {object} opts - Optional arguments for sonos initialization
 */
sonos.initialize = function(opts) {
  sonos.client = new Sonos(opts);
};

sonos.Sonos = Sonos;
