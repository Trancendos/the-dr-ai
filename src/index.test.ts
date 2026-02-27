import { describe, it, expect, vi } from 'vitest';
import TheDrAiService from './index';

describe('TheDrAiService', () => {
  it('starts without throwing', async () => {
    const service = new TheDrAiService();
    await expect(service.start()).resolves.toBeUndefined();
  });

  it('stops without throwing', async () => {
    const service = new TheDrAiService();
    await expect(service.stop()).resolves.toBeUndefined();
  });

  it('getStatus returns active status with name', () => {
    const service = new TheDrAiService();
    const status = service.getStatus();
    expect(status).toEqual({ name: 'the-dr-ai', status: 'active' });
  });

  it('logs on start', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new TheDrAiService();
    await service.start();
    expect(consoleSpy).toHaveBeenCalledWith('[the-dr-ai] Starting...');
    consoleSpy.mockRestore();
  });

  it('logs on stop', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new TheDrAiService();
    await service.stop();
    expect(consoleSpy).toHaveBeenCalledWith('[the-dr-ai] Stopping...');
    consoleSpy.mockRestore();
  });
});
