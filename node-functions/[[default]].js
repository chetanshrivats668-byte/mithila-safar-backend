import express from 'express';

const app = express();

app.use((_req, res) => {
  res.status(410).json({
    success: false,
    message: 'This legacy endpoint has been disabled. Use the primary API server routes instead.'
  });
});

export default app;
