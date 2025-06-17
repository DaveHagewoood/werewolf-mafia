import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import compression from 'compression';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, 'dist');

// Verify dist directory exists
if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory not found. Make sure the build completed successfully.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3001;

// Enable gzip compression
app.use(compression());

// Basic request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Internal Server Error');
});

// Serve static files from the dist directory
app.use(express.static(distDir));

// Handle client-side routing by serving index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

// Start server with proper host binding
app.listen(port, '0.0.0.0', (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`Player app server running on port ${port}`);
}); 