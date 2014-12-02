var zonesController = exports; exports.constructor = function zonesController(){};

var _ = require('lodash');

var zones = require('../zones');

zonesController.list = function(req, res, next) {
  zones.client.find(function(err, zones) {
    if (err) {
      return next(err);
    }

    res.send(zones);
  });
};

zonesController.get = function(req, res, next) {
  zones.client.find(req.params.uuid, function(err, zone) {
    if (err) {
      return next(err);
    }

    // only return the one item
    res.send(zone[0]);
  });
};

zonesController.clearQueue = function(req, res, next) {
  zones.client.clearQueue(req.params.uuid, function(err, queue) {
    if (err) {
      return next(err);
    }

    res.send({
      uuid: req.params.uuid,
      currentIndex: queue.currentIndex,
      limit: queue.limit,
      offset: queue.offset,
      tracks: queue.tracks
    });
  });
};

zonesController.queue = function(req, res, next) {
  zones.client.queue(req.params.uuid, req.query, function(err, queue) {
    if (err) {
      return next(err);
    }

    res.send({
      uuid: req.params.uuid,
      currentIndex: queue.currentIndex,
      limit: queue.limit,
      offset: queue.offset,
      tracks: queue.tracks
    });
  });
};

zonesController.playlists = function(req, res, next) {
  zones.client.playlists(req.params.uuid, function(err, playlists) {
    if (err) {
      return next(err);
    }

    return res.send({
      uuid: req.params.uuid,
      playlists: playlists
    });
  });
};

zonesController.action = function(req, res, next) {
  var uuid = req.params.uuid;
  var action = req.params.action;
  var opts = _.extend({}, req.body, req.query);

  zones.client.action(uuid, action, opts, function(err, state) {
    if (err) {
      return next(err);
    }

    return res.send(state);
  });
};
