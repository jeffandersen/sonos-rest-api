var express = require('express');
var router = express.Router();

var _ = require('lodash');

var sonos = require('./sonos');
var zones = require('./zones');
var players = require('./players');

router.get('/players', function(req, res, next) {
  players.client.find(function(err, players) {
    if (err) {
      return next(err);
    }

    res.send(players);
  });
});

router.get('/players/:name/playlists', function(req, res, next) {
  players.client.playlists(req.params.name, function(err, playlists) {
    if (err) {
      return next(err);
    }

    res.send({
      roomName: req.params.name,
      playlists: playlists
    });
  });
});

router.get('/players/:name', function(req, res, next) {
  players.client.find(req.params.name, function(err, player) {
    if (err) {
      return next(err);
    }

    // only return the one item
    res.send(player[0]);
  });
});

router.post('/players/:name/:action', function(req, res, next) {
  var action = req.params.action;
  var playerName = req.params.name;
  var opts = _.extend({}, req.body, req.query);

  players.client.action(playerName, action, opts, function(err, state) {
    if (err) {
      return next(err);
    }

    res.send(state);
  });
});

router.get('/zones', function(req, res, next) {
  zones.client.find(function(err, zones) {
    if (err) {
      return next(err);
    }

    res.send(zones);
  });
});

router.get('/zones/:uuid', function(req, res, next) {
  zones.client.find(req.params.uuid, function(err, zone) {
    if (err) {
      return next(err);
    }

    // only return the one item
    res.send(zone[0]);
  });
});

router.get('/zones/:uuid/playlists', function(req, res, next) {
  zones.client.playlists(req.params.uuid, function(err, playlists) {
    if (err) {
      return next(err);
    }

    return res.send({
      uuid: req.params.uuid,
      playlists: playlists
    });
  });
});

router.post('/zones/:uuid/:action', function(req, res, next) {
  var uuid = req.params.uuid;
  var action = req.params.action;
  var opts = _.extend({}, req.body, req.query);

  zones.client.action(uuid, action, opts, function(err, state) {
    if (err) {
      return next(err);
    }

    return res.send(state);
  });
});

module.exports = router;
