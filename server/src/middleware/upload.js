const multer = require('multer');
const path = require('path');

// Use memory storage to avoid filesystem writes
const storage = multer.memoryStorage();

// File filter: only allow .kml and .kmz
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.kml' || ext === '.kmz') {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE: Only KML and KMZ files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

module.exports = upload;
