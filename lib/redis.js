var redis = exports; exports.constructor = function redis(){};

var redisLib = require('redis');

var log = require('./logger').get(__filename);

/**
 * Initialize redis client
 *
 * @public
 * @param {function} cb - Callback function
 */
redis.initialize = function(cb) {
  redis.client = redisLib.createClient();
  redis.client.on('ready', cb);
  redis.client.on('error', function(err) {
    log.error('redis client error', { err: err });
  });
};
