import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import compression from 'compression';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, 'dist');

console.log('Starting server...');
console.log('Current directory:', process.cwd());
console.log('__dirname:', __dirname);
console.log('dist directory:', distDir);

// Verify dist directory exists
if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory not found. Make sure the build completed successfully.');
  console.error('Directory contents:', fs.readdirSync(__dirname));
  process.exit(1);
}

console.log('dist directory contents:', fs.readdirSync(distDir));

const app = express();
const port = process.env.PORT || 3000;

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
  console.error('Stack:', err.stack);
  res.status(500).send('Internal Server Error');
});

// Serve static files from the dist directory
app.use(express.static(distDir));

// Handle client-side routing by serving index.html for all routes
app.get('*', (req, res) => {
  const indexPath = join(distDir, 'index.html');
  console.log('Serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

// Start server with proper host binding
app.listen(port, '0.0.0.0', (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
  console.log(`Host app server running on port ${port}`);
  console.log('Environment variables:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    VITE_SERVER_URL: process.env.VITE_SERVER_URL
  });
}); 