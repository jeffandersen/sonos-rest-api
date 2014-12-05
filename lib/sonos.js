var sonos = exports; exports.constructor = function sonos(){};

var _ = require('lodash');
var async = require('async');
var LastfmAPI = require('lastfmapi');
var SonosDiscovery = require('sonos-discovery');

var log = require('./logger').get(__filename);

var redis = require('./redis');
var zones = require('./zones');
var players = require('./players');

// Optional lastfm integration for album art
if (process.env.LASTFM_API_KEY && process.env.LASTFM_SECRET) {
  log.info('lastfm integration enabled');
  var lfm = new LastfmAPI({
    'api_key': process.env.LASTFM_API_KEY,
    'secret': process.env.LASTFM_SECRET
  });
}

// Album art cache key in redis (prefix)
var ALBUM_ART_CACHE = 'albumart/';

// Default timeout to wait before re-acquiring zone or player state
var STATE_TRANSITION_TIMEOUT = 500;

function Sonos(opts) {
  opts = _.isPlainObject(opts)? opts : {};
  this.discovery = new SonosDiscovery(_.pick(opts, 'discovery'));

  var defaultTimeout = STATE_TRANSITION_TIMEOUT;
  this.stateTransitionTimeout = opts.stateTransitionTimeout || defaultTimeout;
}

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
    case 'volume':
      player.setVolume(opts.state, callback);
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
    case 'seek':
      var index = parseInt(opts.index, 10);
      if (isNaN(index)) {
        err = new Error('The requested index does not exist');
        err.type = 'not found';
        return cb(err);
      }

      player.seek(index + 1, callback);
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
  self._findAlbumArt(state.currentTrack, function(err, currentTrack) {
    if (err) {
      return cb(err);
    }

    state.currentTrack = currentTrack;

    self._findAlbumArt(state.nextTrack, function(err, nextTrack) {
      if (err) {
        return cb(err);
      }

      state.nextTrack = nextTrack;

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
    return cb(null, null);
  }
  if (!track.artist || !track.title) {
    delete track.albumArtURI;
    return cb(null, track);
  }

  var slug = track.artist + '-' + track.album;

  function _key(subkey) {
    return ALBUM_ART_CACHE + subkey;
  }

  // Try to find album art in cache
  redis.client.get(_key(slug), function(err, uri) {
    if (!err && uri) {
      track.albumArtURI = uri;
      return cb(null, track);
    }

    // Get track from LastFM api
    lfm.track.getInfo({
      artist: track.artist,
      track: track.title
    }, function(err, trackData) {

      // Ignore lastfm error, proceed without albumart
      if (err || !trackData || !trackData.album || !trackData.album.image) {
        log.error('Could not find albumart', { err: err });
        delete track.albumArtURI;
        return cb(null, track);
      }

      // Only apply album art if extralarge is found
      var art = trackData.album.image;
      var extralarge = _.where(art, { size: 'extralarge' })[0];
      if (!extralarge) {
        delete track.albumArtURI;
        return cb(null, track);
      }

      var uri = extralarge['#text'];

      // Store the uri in the cache
      redis.client.set(_key(slug), uri, function(err) {
        if (err) {
          return cb(err);
        }

        track.albumArtURI = uri;

        cb(null, track);
      });
    });
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
  zones.initialize(sonos.client);
  sonos.client.zones = zones.client;
  players.initialize(sonos.client);
};

sonos.Sonos = Sonos;
