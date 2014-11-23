var express = require('express');
var router = express.Router();

var _ = require('lodash');
var sonos = require('./sonos');

router.get('/players', function(req, res, next) {
  sonos.client.players(function(err, players) {
    if (err) {
      return next(err);
    }

    res.send(players);
  });
});

router.get('/players/:name', function(req, res, next) {
  sonos.client.player(req.params.name, function(err, player) {
    if (err) {
      return next(err);
    }

    res.send(player);
  });
});

router.post('/players/:name/:action', function(req, res, next) {
  var action = req.params.action;
  var playerName = req.params.name;
  var opts = _.extend({}, req.body, req.query);

  sonos.client.action(playerName, action, opts, function(err, state) {
    if (err) {
      return next(err);
    }

    res.send(state);
  });
});

router.get('/zones', function(req, res, next) {
  sonos.client.zones(function(err, zones) {
    if (err) {
      return next(err);
    }
  
    res.send(zones);
  });
});

router.get('/zones/:uuid', function(req, res, next) {
  sonos.client.zone(req.params.uuid, function(err, zone) {
    if (err) {
      return next(err);
    }
  
    res.send(zone);
  });
});

router.get('/zones/:uuid/playlists', function(req, res, next) {
  var uuid = req.params.uuid;
  var opts = _.extend({}, req.params, req.query);

  sonos.client.zonePlaylists(uuid, opts, function(err, playlists) {
    if (err) {
      return next(err);
    }
  
    return res.send({
      uuid: uuid,
      playlists: playlists
    });
  });
});

router.post('/zones/:uuid/:action', function(req, res, next) {
  var uuid = req.params.uuid;
  var action = req.params.action;
  var opts = _.extend({}, req.body, req.query);

  sonos.client.zoneAction(uuid, action, opts, function(err, state) {
    if (err) {
      return next(err);
    }
  
    return res.send(state);
  });
});

module.exports = router;
