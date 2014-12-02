var express = require('express');
var router = express.Router();

var zones = require('./controllers/zones');
var players = require('./controllers/players');

function allowPostPatch(req, res, next) {
  var method = req.method.toLowerCase();
  if (method === 'post' || method === 'patch') {
    return next();
  }

  var err = new Error('HTTP method used is not supported by this endpoint');
  err.type = 'not allowed';
  err.status = 405;
  return next(err);
}

router.get('/players', players.list);
router.get('/players/:name/queue', players.queue);
router.post('/players/:name/queue/clear', players.clearQueue);
router.get('/players/:name/playlists', players.playlists);
router.get('/players/:name', players.get);
router.all('/players/:name/:action', allowPostPatch, players.action);
router.get('/zones', zones.list);
router.get('/zones/:uuid/queue', zones.queue);
router.post('/zones/:uuid/queue/clear', zones.clearQueue);
router.get('/zones/:uuid/playlists', zones.playlists);
router.get('/zones/:uuid', zones.get);
router.all('/zones/:uuid/:action', allowPostPatch, zones.action);

module.exports = router;
