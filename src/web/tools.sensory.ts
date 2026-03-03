/**
 * Sensory tools — Vision (camera/file), Context (geo/activity), Bluetooth.
 * Browser-native APIs for perceiving the user's environment.
 */
import { ToolHandler, FunctionTool } from '../tools/function-tool';
import { ToolDefinition } from '../tools/definition';

// ═══════════════════════════════════════════════════════════
// VISION — Camera capture + File upload
// ═══════════════════════════════════════════════════════════

export const captureImageTool = new FunctionTool(
  'capture_image',
  'Capture an image from the camera or request a file upload. Returns base64 image data. Dispatches strands:capture_image event for the UI to handle.',
  JSON.stringify({
    type: 'object',
    properties: {
      source: { type: 'string', enum: ['camera', 'file', 'clipboard'], description: 'Image source (default: file)' },
      max_width: { type: 'number', description: 'Max width to resize to (default: 1024)' },
    },
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { source, max_width } = JSON.parse(inputJson || '{}');
      // Dispatch event for the host page to handle camera/file UI
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('strands:capture_image', {
          detail: { source: source ?? 'file', maxWidth: max_width ?? 1024 },
        }));
      }
      return JSON.stringify({ requested: true, source: source ?? 'file', note: 'Image capture requested. Host page should handle strands:capture_image event and provide the image data.' });
    }
  },
);

export const readFileTool = new FunctionTool(
  'read_file',
  'Read a file from the user (triggers file picker). Dispatches strands:read_file event for the UI to handle.',
  JSON.stringify({
    type: 'object',
    properties: {
      accept: { type: 'string', description: 'Accepted file types (e.g., "image/*", ".pdf,.txt", "*/*")' },
      as: { type: 'string', enum: ['text', 'base64', 'arraybuffer'], description: 'How to read the file (default: text)' },
    },
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { accept, as } = JSON.parse(inputJson || '{}');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('strands:read_file', { detail: { accept: accept ?? '*/*', as: as ?? 'text' } }));
      }
      return JSON.stringify({ requested: true, accept: accept ?? '*/*', readAs: as ?? 'text' });
    }
  },
);

// ═══════════════════════════════════════════════════════════
// CONTEXT — Geolocation, Activity tracking, Device info
// ═══════════════════════════════════════════════════════════

/** Dynamic context store — injected into system prompt each turn. */
const _contextStore = new Map<string, string>();
let _geoWatchId: number | null = null;
let _lastPosition: { lat: number; lng: number; accuracy: number } | null = null;
let _activityState: { state: string; lastActivity: number; idleMs: number } = { state: 'active', lastActivity: Date.now(), idleMs: 0 };

export const getUserContextTool = new FunctionTool(
  'get_user_context',
  'Get current user context: location, activity state, device info, custom context, and screen dimensions.',
  JSON.stringify({
    type: 'object',
    properties: {
      include_location: { type: 'boolean', description: 'Include geolocation (requires permission)' },
      include_activity: { type: 'boolean', description: 'Include activity tracking data' },
      include_device: { type: 'boolean', description: 'Include device info' },
    },
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { include_location, include_activity, include_device } = JSON.parse(inputJson || '{}');
      const ctx: Record<string, unknown> = {};

      // Custom context
      const custom: Record<string, string> = {};
      for (const [k, v] of _contextStore) custom[k] = v;
      if (Object.keys(custom).length) ctx.custom = custom;

      // Activity
      if (include_activity !== false) {
        _activityState.idleMs = Date.now() - _activityState.lastActivity;
        ctx.activity = { ..._activityState };
      }

      // Location
      if (include_location && _lastPosition) {
        ctx.location = _lastPosition;
      }

      // Device
      if (include_device !== false && typeof navigator !== 'undefined') {
        ctx.device = {
          userAgent: navigator.userAgent.slice(0, 100),
          language: navigator.language,
          languages: navigator.languages?.slice(0, 5),
          online: navigator.onLine,
          cookieEnabled: navigator.cookieEnabled,
          maxTouchPoints: navigator.maxTouchPoints,
          hardwareConcurrency: navigator.hardwareConcurrency,
        };
        if (typeof screen !== 'undefined') {
          ctx.screen = { width: screen.width, height: screen.height, colorDepth: screen.colorDepth, pixelRatio: (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) };
        }
      }

      ctx.timestamp = new Date().toISOString();
      ctx.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return JSON.stringify(ctx);
    }
  },
);

export const setContextTool = new FunctionTool(
  'set_context',
  'Set custom context data that persists across turns. Can be used to build up agent memory within a session.',
  JSON.stringify({
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Context key' },
      value: { type: 'string', description: 'Context value (empty to delete)' },
    },
    required: ['key'],
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { key, value } = JSON.parse(inputJson);
      if (value) _contextStore.set(key, value);
      else _contextStore.delete(key);
      return JSON.stringify({ set: true, key, contextSize: _contextStore.size });
    }
  },
);

export const enableContextTrackingTool = new FunctionTool(
  'enable_context_tracking',
  'Enable or disable context tracking features: geolocation, activity monitoring.',
  JSON.stringify({
    type: 'object',
    properties: {
      geolocation: { type: 'boolean', description: 'Enable GPS tracking' },
      activity: { type: 'boolean', description: 'Enable activity monitoring (idle detection)' },
    },
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { geolocation, activity } = JSON.parse(inputJson || '{}');
      const results: Record<string, unknown> = {};

      // Geolocation
      if (geolocation === true && typeof navigator !== 'undefined' && navigator.geolocation) {
        if (_geoWatchId === null) {
          _geoWatchId = navigator.geolocation.watchPosition(
            (pos) => { _lastPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }; },
            () => {}, { enableHighAccuracy: true, maximumAge: 30000 }
          );
          results.geolocation = 'enabled';
        } else {
          results.geolocation = 'already_enabled';
        }
      } else if (geolocation === false && _geoWatchId !== null) {
        navigator.geolocation.clearWatch(_geoWatchId);
        _geoWatchId = null;
        _lastPosition = null;
        results.geolocation = 'disabled';
      }

      // Activity tracking
      if (activity === true && typeof document !== 'undefined') {
        const updateActivity = () => { _activityState.lastActivity = Date.now(); _activityState.state = 'active'; };
        document.addEventListener('mousemove', updateActivity, { passive: true });
        document.addEventListener('keydown', updateActivity, { passive: true });
        document.addEventListener('touchstart', updateActivity, { passive: true });
        document.addEventListener('visibilitychange', () => {
          _activityState.state = document.hidden ? 'hidden' : 'active';
          if (!document.hidden) _activityState.lastActivity = Date.now();
        });
        results.activity = 'enabled';
      }

      return JSON.stringify(results);
    }
  },
);

/** Get the current dynamic context as a string for system prompt injection. */
export function getDynamicContext(): string {
  if (_contextStore.size === 0 && !_lastPosition) return '';
  const parts: string[] = ['[Dynamic Context]'];
  for (const [k, v] of _contextStore) parts.push(`${k}: ${v}`);
  if (_lastPosition) parts.push(`Location: ${_lastPosition.lat.toFixed(4)}, ${_lastPosition.lng.toFixed(4)} (±${_lastPosition.accuracy.toFixed(0)}m)`);
  _activityState.idleMs = Date.now() - _activityState.lastActivity;
  if (_activityState.idleMs > 5000) parts.push(`User idle: ${Math.round(_activityState.idleMs / 1000)}s`);
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════
// BLUETOOTH — Device discovery (Web Bluetooth API)
// ═══════════════════════════════════════════════════════════

export const scanBluetoothTool = new FunctionTool(
  'scan_bluetooth',
  'Scan for nearby Bluetooth devices. Requires user gesture and HTTPS. Dispatches strands:bluetooth_scan event.',
  JSON.stringify({
    type: 'object',
    properties: {
      timeout: { type: 'number', description: 'Scan timeout in ms (default: 10000)' },
    },
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
        return JSON.stringify({ error: 'Web Bluetooth not available (requires HTTPS + compatible browser)' });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('strands:bluetooth_scan', { detail: JSON.parse(inputJson || '{}') }));
      }
      return JSON.stringify({ requested: true, note: 'Bluetooth scan requires user gesture. Host page should handle strands:bluetooth_scan event.' });
    }
  },
);

/** Get all sensory tools. */
export function getAllSensoryTools(): ToolDefinition[] {
  return [captureImageTool, readFileTool, getUserContextTool, setContextTool, enableContextTrackingTool, scanBluetoothTool];
}
