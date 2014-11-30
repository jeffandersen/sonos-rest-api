var players = exports; exports.constructor = function players(){};

var _ = require('lodash');
var async = require('async');

function Players(sonos) {
  if (_.isUndefined(sonos)) {
    throw new Error('Sonos object required for players');
  }

  this.sonos = sonos;
  this.discovery = this.sonos.discovery;
}

Players.prototype.find = function(opts, cb) {
  var self = this;

  var where = {};
  if (_.isFunction(opts)) {
    cb = opts;
    opts = null;
  }

  // Lookup criteria supplied
  if (_.isPlainObject(opts)) {

    // Lookup player by its zone uuid
    if (_.isString(opts.uuid)) {
      where.uuid = opts.uuid;

    // Lookup player by its room name
    } else if (_.isString(opts.name)) {
      where.roomName = opts.name;

    // At least one parameter is required when opts is supplied
    } else {
      throw new Error('Name or uuid required for player lookup');
    }

  // String parameter defaults to room name lookup
  } else if (_.isString(opts)) {
    where.roomName = opts;
  }

  // We need to find the rooms by pulling all available zones
  self.sonos.zones.find(where.uuid, function(err, zones) {
    if (err) {
      return cb(err);
    }

    var members = [];
    var players = [];

    // Concat each zones' members to a single array
    zones.forEach(function(zone) {
      members = members.concat(zone.members);
    });

    // Reduce to single room if requested
    if (where.roomName) {
      members = _.where(members, where);
    }

    // Loop rooms and extend player information
    async.forEach(members, function(name, next) {
      self._find(name, function(err, player) {
        if (err) {
          return next(err);
        }

        // Add album art if lastfm integration enabled
        var filteredPlayer = self._filterState(player);
        self.sonos.extendTrackData(filteredPlayer, function(err, state) {
          if (err) {
            return next(err);
          }

          // Append extended and filtered player state
          players.push(state);
          next();
        });
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
 * Find players with the specified criteria
 *
 * @param {object} where - Name or uuid property to look for
 * @param {function} cb - Callback function
 */
Players.prototype._find = function(where, cb) {
  var player;

  if (where.uuid) {
    player = this.discovery.getPlayerByUUID(where.uuid);
  } else if (where.roomName) {
    player = this.discovery.getPlayer(where.roomName);
  } else if (_.isString(where)) {
    player = this.discovery.getPlayer(where);
  }

  if (!player) {
    var err = new Error('The requested player could not be found');
    err.type = 'not found';
    return cb(err);
  }

  cb(null, player);
};

/**
 * Perform action against a player object
 *
 * @public
 * @param {object} where - Name or uuid property of player to find
 * @param {string} action - Name of the action
 * @param {object} opts - Action options (optional)
 * @param {function} cb - Callback function
 */
Players.prototype.action = function(where, action, opts, cb) {
  var self = this;
  self._action(where, action, opts, function(err) {
    if (err) {
      return cb(err);
    }

    // Sonos discovery does not supply a callback for when an action is done
    // we have to introduce a timeout in order to obtain the correct state
    setTimeout(function() {
      self.find(where, cb);
    }, self.sonos.stateTransitionTimeout);
  });
};

/**
 * Perform action against a player object
 *
 * @private
 * @param {object} where - Name or uuid property of player to find
 * @param {string} action - Name of the action
 * @param {object} opts - Action options (optional)
 * @param {function} cb - Callback function
 */
Players.prototype._action = function(where, action, opts, cb) {
  var self = this;
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  self._find(where, function(err, player) {
    if (err) {
      return cb(err);
    }
    if (!player) {
      err = new Error('The requested player could not be found');
      err.type = 'not found';
      return cb(err);
    }

    self.sonos._action(player, action, opts, cb);
  });
};

/**
 * Return queued tracks for particular player
 *
 * @public
 * @param {object} where - Name or uuid property to look for
 * @param {object} opts - Query parameters
 * @param {function} cb - Callback function
 */
Players.prototype.queue = function(where, opts, cb) {
  var self = this;
  if (_.isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  self._find(where, function(err, player) {
    if (err) {
      return cb(err);
    }

    var offset = opts.offset || 0;
    var limit = opts.limit || 25;
    player.getQueue(offset, limit, function(success, queueData) {
      if (!success) {
        var err = new Error('An error occurred while retrieving song data');
        err.type = 'failed';
        return cb(err);
      }

      var queue = {
        offset: queueData.startIndex,
        limit: queueData.numberReturned,
        total: queueData.totalMatches,
        tracks: []
      };

      var i = offset;
      async.each(queueData.items, function(track, next) {
        self.sonos._findAlbumArt(track, function(err, updatedTrack) {
          if (err) {
            return next(err);
          }

          updatedTrack.index = i;
          queue.tracks.push(updatedTrack);

          i++;
          next();
        });
      }, function(err) {
        if (err) {
          return cb(err);
        }

        cb(null, queue);
      });
    });
  });
};

/**
 * Return playlists for particular player
 *
 * @public
 * @param {object} where - Name or uuid property to look for
 * @param {function} cb - Callback function
 */
Players.prototype.playlists = function(where, cb) {
  var self = this;

  self._find(where, function(err, player) {
    if (err) {
      return cb(err);
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
  });
};

/**
 * Filter player object state for consumption
 *
 * @private
 * @param {object} player - Sonos discovery player object
 */
Players.prototype._filterState = function(player) {
  if (!_.isObject(player)) {
    throw new Error('Cannot clean non-object player');
  }

  var hasCurrentTrack = player.state.currentTrack.duration > 0;
  var currentTrack = hasCurrentTrack? player.state.currentTrack : null;
  var hasNextTrack = player.state.nextTrack.duration > 0;
  var nextTrack = hasNextTrack? player.state.nextTrack : null;

  return {
    roomName: player.roomName,
    uuid: player.uuid,
    state: player.state.currentState,
    volume: player.state.volume,
    mute: player.state.mute,
    shuffle: player.currentPlayMode.shuffle,
    repeat: player.currentPlayMode.repeat,
    crossfade: player.currentPlayMode.crossfade,
    currentTrack: currentTrack,
    nextTrack: nextTrack
  };
};

/**
 * Initialize the players object
 *
 * @public
 * @param {object} sonos - Sonos client object
 */
players.initialize = function(sonos) {
  players.client = new Players(sonos);
};

players.Players = Players;
