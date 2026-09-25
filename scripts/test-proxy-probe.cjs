// Disposable nginx integration-test upstream. Never used by the application.
const express = require('express');
const app = express();
app.set('trust proxy', 1);
app.get('*', (req, res) => res.json({ ip: req.ip, forwarded: req.headers['x-forwarded-for'] }));
app.listen(3000, '0.0.0.0');
