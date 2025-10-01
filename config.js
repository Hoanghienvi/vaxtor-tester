const path = require('path');

module.exports = {
  PORT: 3000,
  DB_FILE: path.join(__dirname, 'vaxtor_events.sqlite'),
  IMAGE_DIR: path.join(__dirname, 'plate_images')
};
