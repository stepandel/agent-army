interface HealthStatus {
  status: 'ok';
  timestamp: number;
  version: string;
}

export function getHealthStatus(): HealthStatus {
  return {
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
  };
}
