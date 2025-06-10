require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const multer = require('multer');
const { DateTime } = require('luxon');

const app = express();
const PORT = 3000;
const upload = multer(); // memory storage

app.use(cors());

// Health check
app.get('/ping', (req, res) => res.send('pong'));

// AWS config
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'ap-southeast-1',
});

const s3 = new AWS.S3();
const BUCKET_NAME = 'metama-sg-cloud';
const FOLDER = 'uploads/';

// Upload endpoint (unchanged)
app.post('/upload', upload.single('file'), (req, res) => {
  const { originalname, mimetype, buffer } = req.file;
  if (!originalname || !mimetype || !buffer) {
    return res.status(400).json({ error: 'Missing file data.' });
  }

  const s3Params = {
    Bucket: BUCKET_NAME,
    Key: FOLDER + originalname,
    Body: buffer,
    ContentType: mimetype,
  };

  s3.upload(s3Params, (err, data) => {
    if (err) {
      console.error('❌ S3 upload error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    }
    console.log('✅ Uploaded to:', data.Location);
    res.json({ url: data.Location });
  });
});

// List uploaded video files (uploads/)
app.get('/list-files', async (req, res) => {
  try {
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: FOLDER,
    };

    const data = await s3.listObjectsV2(listParams).promise();

    const files = data.Contents
      .filter(obj => obj.Key.match(/\.(mp4|mov|webm)$/i))
      .map(obj => {
        const rawDate = obj.LastModified.toISOString();
        const formattedTime = DateTime.fromJSDate(obj.LastModified)
          .setZone('Asia/Manila')
          .toFormat('MMMM d, yyyy • hh:mm:ss a ZZZZ');

        return {
          key: obj.Key,
          url: `https://${BUCKET_NAME}.s3.ap-southeast-1.amazonaws.com/${obj.Key}`,
          lastModified: formattedTime,
          lastModifiedRaw: rawDate
        };
      });

    res.json({ files });
  } catch (err) {
    console.error('❌ Error listing files:', err);
    res.status(500).json({ error: 'Could not list files' });
  }
});

// ✅ NEW: List PNG files from players/ folder
app.get('/list-players', async (req, res) => {
  try {
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: 'players/',
    };

    const data = await s3.listObjectsV2(listParams).promise();

    const files = data.Contents
      .filter(obj => obj.Key.match(/^players\/g\d+\/\d{2}_\d{3}\.png$/i)) // Match players/gX/XX_AAA.png
      .map(obj => {
        const keyParts = obj.Key.split('/');
        const folder = keyParts[1]; // g0, g1, etc.
        const filename = keyParts[2]; // e.g. 01_123.png
        const [gameNumber, userCode] = filename.replace('.png', '').split('_');

        return {
          key: obj.Key,
          url: `https://${BUCKET_NAME}.s3.ap-southeast-1.amazonaws.com/${obj.Key}`,
          folder,
          gameNumber,
          userCode
        };
      });

    res.json({ files });
  } catch (err) {
    console.error('❌ Error listing PNGs:', err);
    res.status(500).json({ error: 'Could not list player PNGs' });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
