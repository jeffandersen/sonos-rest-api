var playersController = exports; exports.constructor = function playersController(){};

var _ = require('lodash');

var players = require('../sonos/players');

playersController.list = function(req, res, next) {
  players.client.find(function(err, players) {
    if (err) {
      return next(err);
    }

    res.send(players);
  });
};

playersController.get = function(req, res, next) {
  players.client.find(req.params.name, function(err, players) {
    if (err) {
      return next(err);
    }
    if (!players || players.length < 1) {
      err = new Error('The requested player could not be found');
      err.type = 'not found';
      return next(err);
    }

    // only return the one item
    res.send(players[0]);
  });
};

playersController.queue = function(req, res, next) {
  players.client.queue(req.params.name, req.query, function(err, queue) {
    if (err) {
      return next(err);
    }

    res.send({
      roomName: req.params.name,
      currentIndex: queue.currentIndex,
      limit: queue.limit,
      offset: queue.offset,
      tracks: queue.tracks
    });
  });
};

playersController.clearQueue = function(req, res, next) {
  players.client.clearQueue(req.params.name, function(err, queue) {
    if (err) {
      return next(err);
    }

    res.send({
      roomName: req.params.name,
      currentIndex: queue.currentIndex,
      limit: queue.limit,
      offset: queue.offset,
      tracks: queue.tracks
    });
  });
};

playersController.playlists = function(req, res, next) {
  players.client.playlists(req.params.name, function(err, playlists) {
    if (err) {
      return next(err);
    }

    res.send({
      roomName: req.params.name,
      playlists: playlists
    });
  });
};

playersController.action = function(req, res, next) {
  var action = req.params.action;
  var playerName = req.params.name;
  var opts = _.extend({}, req.body, req.query);

  players.client.action(playerName, action, opts, function(err, state) {
    if (err) {
      return next(err);
    }

    res.send(state);
  });
};
