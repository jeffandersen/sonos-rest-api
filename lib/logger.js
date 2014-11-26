var logger = exports; exports.constructor = function logger(){};

var path = require('path');
var winston = require('winston');

var LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'info' : 'error';
var SONOS_LOG_LEVEL = process.env.SONOS_LOG_LEVEL || LOG_LEVEL;
var BASE_PATH = path.resolve(__dirname, '../') + '/';

/**
 * Obtain a logger for a given filename
 *
 * @param {string} filename - the filename you will be logging for
 */
logger.get = function(filename) {
  var ext = path.extname(filename);
  var name = filename.replace(BASE_PATH, '');

  if (winston.loggers.has(name)) {
    return winston.loggers.get(name);
  }

  var logOpts = {
    level: SONOS_LOG_LEVEL,
    colorize: true,
    timestamp: true,
    label: name
  };

  var transports = [
    new winston.transports.Console(logOpts)
  ];

  /**
   * If LOGFILE env is supplied, send logs to disk as well
   */
  if (process.env.LOGFILE) {
    var logfile = path.normalize(process.env.LOGFILE);
    var logDir = path.dirname(logfile);

    // Verify the log directory exists
    try {
      fs.mkdirSync(logDir);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }

    // Logging options
    var logFileOpts = {
      filename: logfile,
      json: false,
      colorize: false
    };

    transports.push(new winston.transports.File(logFileOpts));
  }

  var client = winston.loggers.get(name, {
    transports: transports
  });

  client.addRewriter(errorStack);

  return client;

  function errorStack(level, msg, meta) {
    if (!meta) {
      return meta;
    }

    if (meta.err) {
      var err = meta.err;
      var error = {
        name: err.name,
        message: err.message
      };

      meta.err = error;

      if (err instanceof Error) {
        meta.stacktrace = err.stack;
      } else {
        meta.stacktrace = new Error().stack;
      }
    }

    return meta;
  }
};
