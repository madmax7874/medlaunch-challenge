import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import healthRouter from './routes/health';
import reportsRouter from './routes/reports';
import authRouter from './routes/auth';

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'Welcome to medlaunch-challenge API' });
});

app.use('/health', healthRouter);
app.use('/reports', reportsRouter);
app.use('/auth', authRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default app;
