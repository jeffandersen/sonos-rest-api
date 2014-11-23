var errors = exports; exports.constructor = function errors(){};

var util = require('util');

errors.notfound = function(app) {
  // Routes not found are errors
  app.use(function(req, res, next) {
      var err = new Error('The resource you requested could not be found');
      err.type = 'not found';
      err.status = 404;
      next(err);
  });
};

errors.handlers = function(app) {
  app.use(function(err, req, res, next) {
    if (!err.status && err.type === 'not found') {
      err.status = 404;
    }

    res.status(err.status || 500);
    res.send({
      error: err.type || 'unknown',
      message: err.message
    });
  });
};
