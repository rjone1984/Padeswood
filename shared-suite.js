(function(global){
  'use strict';

  function resolveUserId(userOrId){
    if(!userOrId) return '';
    if(typeof userOrId === 'string' || typeof userOrId === 'number') return String(userOrId);
    if(typeof userOrId === 'object' && userOrId.id) return String(userOrId.id);
    return '';
  }

  function ensureSupabase(){
    if(!global.supabase || typeof global.supabase.createClient !== 'function'){
      throw new Error('Supabase client is not available.');
    }
  }

  function normalizeTheme(theme){
    return theme === 'light' ? 'light' : 'dark';
  }

  var storage = {
    getThemePref: function(){
      try {
        return global.localStorage.getItem('pw_theme') ||
          global.localStorage.getItem('kbl_theme') ||
          (global.localStorage.getItem('dark') === '1' ? 'dark' : null);
      } catch (e) {
        return null;
      }
    },
    setThemePref: function(theme){
      var next = normalizeTheme(theme);
      try {
        global.localStorage.setItem('pw_theme', next);
        global.localStorage.setItem('kbl_theme', next);
        global.localStorage.setItem('dark', next === 'dark' ? '1' : '0');
      } catch (e) {}
      return next;
    }
  };

  var PALETTE_STORAGE_KEY = 'pw_palette_scheme';
  var PALETTE_ORDER = ['default','ocean','sky','violet','amber','basic','slate'];
  var PALETTE_META = {
    default: {
      label: 'Default Green',
      description: 'The original Padeswood green scheme.',
      accent: '#1a7a35',
      accent2: '#2ecc5c',
      accent3: '#5ee27b'
    },
    ocean: {
      label: 'Ocean',
      description: 'Cool teal tones with a calmer feel.',
      accent: '#0f766e',
      accent2: '#14b8a6',
      accent3: '#2dd4bf'
    },
    sky: {
      label: 'Sky',
      description: 'Brighter blue accents for a sharper read.',
      accent: '#2563eb',
      accent2: '#3b82f6',
      accent3: '#60a5fa'
    },
    violet: {
      label: 'Violet',
      description: 'A more premium purple accent without layout changes.',
      accent: '#6d28d9',
      accent2: '#8b5cf6',
      accent3: '#a78bfa'
    },
    amber: {
      label: 'Amber',
      description: 'Warm industrial tones with a bit more glow.',
      accent: '#b45309',
      accent2: '#d97706',
      accent3: '#f59e0b'
    },
    basic: {
      label: 'Basic',
      description: 'A flat grayscale mode with glass and motion stripped back.',
      accent: '#4b5563',
      accent2: '#6b7280',
      accent3: '#9ca3af'
    },
    slate: {
      label: 'Graphite',
      description: 'A darker neutral scheme if you want less colour.',
      accent: '#334155',
      accent2: '#475569',
      accent3: '#64748b'
    }
  };
  var DEFAULT_PALETTE_VARS = ['--ac','--ac2','--ac3','--acd1','--acd2','--acd3','--palette-card-bg-1','--palette-card-bg-2','--palette-card-border','--palette-card-glow-1','--palette-card-glow-2','--eac'];

  function paletteHexToRgb(hex){
    var raw = String(hex || '').trim().replace(/^#/, '');
    if(raw.length === 3){
      return {
        r: parseInt(raw[0] + raw[0], 16),
        g: parseInt(raw[1] + raw[1], 16),
        b: parseInt(raw[2] + raw[2], 16)
      };
    }
    if(raw.length === 6){
      return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16)
      };
    }
    return null;
  }

  function paletteRgbaFromHex(hex, alpha){
    var rgb = paletteHexToRgb(hex);
    if(!rgb) return '';
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  function normalizePalettePresetKey(key){
    var normalized = String(key || '').trim().toLowerCase();
    if(!normalized || normalized === 'plain') normalized = 'basic';
    if(normalized !== 'default' && !PALETTE_META[normalized]) return 'default';
    return normalized;
  }

  function getPalettePresetMap(){
    var map = { default: null };
    PALETTE_ORDER.forEach(function(key){
      if(key === 'default') return;
      var meta = PALETTE_META[key];
      if(!meta) return;
      map[key] = {
        label: meta.label,
        description: meta.description,
        accent: meta.accent,
        accent2: meta.accent2,
        accent3: meta.accent3
      };
    });
    return map;
  }

  function getPalettePresetVarsMap(options){
    var opts = options || {};
    var includeDescriptions = opts.includeDescriptions !== false;
    var map = {};
    PALETTE_ORDER.forEach(function(key){
      var meta = PALETTE_META[key];
      if(!meta) return;
      var ac = meta.accent;
      var ac2 = meta.accent2 || ac;
      var ac3 = meta.accent3 || ac2 || ac;
      var entry = {
        label: meta.label,
        vars: {
          '--ac': ac,
          '--ac2': ac2,
          '--ac3': ac3,
          '--acd1': paletteRgbaFromHex(ac, .08),
          '--acd2': paletteRgbaFromHex(ac, .14),
          '--acd3': paletteRgbaFromHex(ac, .22),
          '--palette-card-bg-1': paletteRgbaFromHex(ac2, .18),
          '--palette-card-bg-2': paletteRgbaFromHex(ac, .08),
          '--palette-card-border': paletteRgbaFromHex(ac3, .18),
          '--palette-card-glow-1': paletteRgbaFromHex(ac3, .12),
          '--palette-card-glow-2': paletteRgbaFromHex(ac3, .06),
          '--eac': '0 4px 22px ' + paletteRgbaFromHex(ac, .25)
        }
      };
      if(includeDescriptions) entry.description = meta.description;
      map[key] = entry;
    });
    return map;
  }

  function getStoredPalettePreset(allowedValues){
    var key;
    try {
      key = global.localStorage.getItem(PALETTE_STORAGE_KEY);
    } catch (e) {
      key = null;
    }
    if(!key) return 'default';
    key = normalizePalettePresetKey(key);
    if(Array.isArray(allowedValues) && allowedValues.length && allowedValues.indexOf(key) === -1){
      return 'default';
    }
    return key;
  }

  var supabaseApi = {
    createClient: function(url, key, options){
      ensureSupabase();
      var merged = Object.assign({}, options || {});
      merged.auth = Object.assign({
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }, (options && options.auth) || {});
      return global.supabase.createClient(url, key, merged);
    }
  };

  async function getConfigRow(sb, key){
    if(!sb || !key) return null;
    var result = await sb.from('kiln_config').select('value').eq('key', key).maybeSingle();
    if(result.error) throw result.error;
    return result.data || null;
  }

  async function setConfigValue(sb, key, value){
    if(!sb || !key) return false;
    var result = await sb.from('kiln_config').upsert({
      key: key,
      value: value
    });
    if(result.error) throw result.error;
    return true;
  }

  var config = {
    getString: async function(sb, key){
      var row = await getConfigRow(sb, key);
      if(!row || row.value == null) return null;
      return typeof row.value === 'string' ? row.value : String(row.value);
    },
    setString: function(sb, key, value){
      return setConfigValue(sb, key, value == null ? '' : String(value));
    },
    getJson: async function(sb, key){
      var raw = await this.getString(sb, key);
      if(!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    setJson: function(sb, key, value){
      return setConfigValue(sb, key, JSON.stringify(value == null ? null : value));
    }
  };

  var preferences = {
    saveTheme: function(sb, userOrId, isLight){
      var uid = resolveUserId(userOrId);
      if(!uid) return Promise.resolve(false);
      return config.setString(sb, 'theme_uid_' + uid, isLight ? 'light' : 'dark');
    },
    loadTheme: async function(sb, userOrId){
      var uid = resolveUserId(userOrId);
      if(!uid) return null;
      var value = await config.getString(sb, 'theme_uid_' + uid);
      if(value === 'light' || value === 'dark') return value;
      return null;
    },
    savePalette: function(sb, userOrId, key){
      var uid = resolveUserId(userOrId);
      if(!uid) return Promise.resolve(false);
      var value = key === 'default' ? 'default' : String(key || 'default');
      return config.setString(sb, 'palette_uid_' + uid, value);
    },
    loadPalette: async function(sb, userOrId, allowedValues){
      var uid = resolveUserId(userOrId);
      if(!uid) return null;
      var value = await config.getString(sb, 'palette_uid_' + uid);
      if(!value) return null;
      if(value === 'plain') value = 'basic';
      if(Array.isArray(allowedValues) && allowedValues.length && allowedValues.indexOf(value) === -1){
        return null;
      }
      return value;
    }
  };

  var palette = {
    STORAGE_KEY: PALETTE_STORAGE_KEY,
    DEFAULT_VARS: DEFAULT_PALETTE_VARS.slice(),
    normalizePresetKey: normalizePalettePresetKey,
    getPresetMap: getPalettePresetMap,
    getPresetVarsMap: getPalettePresetVarsMap,
    getStoredPreset: getStoredPalettePreset,
    rgbaFromHex: paletteRgbaFromHex
  };

  var access = {
    loadPwAppAccessState: async function(sb, user, options){
      var opts = options || {};
      var userId = resolveUserId(user);
      var profileSelect = opts.profileSelect || 'id,full_name,email,approved,disabled,role';
      var kilnSelect = opts.kilnSelect || 'auth_user_id,locked_name,email,username';
      var accessField = opts.accessField || '';
      var requiresProfile = opts.requiresProfile !== false;
      var profileRes;
      var kilnRes;

      var results = await Promise.all([
        sb.from('pw_profiles').select(profileSelect).eq('id', userId).maybeSingle(),
        sb.from('kiln_users').select(kilnSelect).eq('auth_user_id', userId).maybeSingle()
      ]);
      profileRes = results[0];
      kilnRes = results[1];

      if(profileRes.error) throw profileRes.error;
      if(kilnRes.error && kilnRes.error.code !== 'PGRST116') throw kilnRes.error;

      var profile = profileRes.data || null;
      var kilnUser = kilnRes.data || null;
      var reason = '';
      var allowed = true;

      if(!profile && requiresProfile){
        allowed = false;
        reason = 'missing-profile';
      } else if(profile){
        if(profile.approved === false){
          allowed = false;
          reason = 'unapproved';
        } else if(profile.disabled === true){
          allowed = false;
          reason = 'disabled';
        } else if(profile.role === 'none'){
          allowed = false;
          reason = 'no-role';
        } else if(accessField && profile[accessField] === false){
          allowed = false;
          reason = 'no-access';
        }
      }

      return {
        allowed: allowed,
        reason: reason,
        profile: profile,
        kilnUser: kilnUser
      };
    }
  };

  var licence = {
    check: async function(options){
      var opts = options || {};
      try {
        var response = await global.fetch(
          opts.url + '/rest/v1/kiln_licences?licence_key=eq.' + encodeURIComponent(opts.licenceKey) + '&select=paid,expires_at,customer,site',
          {
            method: 'GET',
            mode: 'cors',
            headers: {
              'apikey': opts.apiKey,
              'Authorization': 'Bearer ' + opts.apiKey,
              'Content-Type': 'application/json'
            }
          }
        );
        if(!response.ok) throw new Error('Unable to confirm licence.');

        var rows = await response.json();
        var lic = rows && rows[0];
        if(!lic || !lic.paid){
          if(typeof opts.onInactive === 'function') await opts.onInactive(lic, 'Licence not active.');
          return false;
        }

        if(new Date(lic.expires_at) < new Date()){
          var exp = new Date(lic.expires_at).toLocaleDateString('en-GB');
          if(typeof opts.onInactive === 'function') await opts.onInactive(lic, 'Licence expired on ' + exp + '.');
          return false;
        }

        if(typeof opts.onActive === 'function') await opts.onActive(lic);
        return true;
      } catch (error) {
        if(typeof opts.onError === 'function') await opts.onError(error);
        return !!opts.failOpen;
      }
    }
  };

  function getStatusDotTarget(target){
    if(!target) return null;
    if(typeof target === 'string'){
      return global.document ? global.document.querySelector(target) || global.document.getElementById(target.replace(/^#/, '')) : null;
    }
    return target;
  }

  function ensureStatusDotStyles(){
    if(!global.document || global.document.getElementById('padeswood-status-dot-styles')) return;
    var style = global.document.createElement('style');
    style.id = 'padeswood-status-dot-styles';
    style.textContent = '' +
      '@keyframes padeswoodStatusDotPulse{' +
        '0%,100%{transform:scale(1);box-shadow:0 0 0 1px rgba(255,255,255,.05),0 0 0 var(--status-dot-ring-size,4px) var(--status-dot-ring-color,rgba(245,158,11,.12)),0 0 var(--status-dot-glow-size,12px) var(--status-dot-glow-color,rgba(245,158,11,.22));}' +
        '50%{transform:scale(1.24);box-shadow:0 0 0 1px rgba(255,255,255,.08),0 0 0 var(--status-dot-ring-size-grow,7px) var(--status-dot-ring-color-grow,rgba(245,158,11,.18)),0 0 var(--status-dot-glow-size-grow,20px) var(--status-dot-glow-color-grow,rgba(245,158,11,.34));}' +
      '}' ;
    (global.document.head || global.document.documentElement).appendChild(style);
  }

  function isBasicPaletteMode(){
    if(!global.document) return false;
    return !!((global.document.body && global.document.body.classList && global.document.body.classList.contains('basic-mode')) || (global.document.documentElement && global.document.documentElement.classList && global.document.documentElement.classList.contains('basic-mode')));
  }

  function normalizeStatusDotState(state){
    var raw = String(state || '').trim().toLowerCase();
    if(!raw) return 'ok';
    if(raw === 'ok' || raw === 'synced' || raw === 'connected' || raw === 'database connected') return 'ok';
    if(raw.indexOf('error') !== -1 || raw.indexOf('failed') !== -1 || raw.indexOf('fault') !== -1 || raw.indexOf('warn') !== -1) return 'warn';
    if(raw.indexOf('saving') !== -1 || raw.indexOf('loading') !== -1 || raw.indexOf('sync') !== -1 || raw.indexOf('offline') !== -1 || raw.indexOf('reconnect') !== -1) return 'syncing';
    if(raw.indexOf('local') !== -1 || raw.indexOf('cache') !== -1) return 'local';
    return 'ok';
  }

  function applyStatusDot(target, state){
    var dot = getStatusDotTarget(target);
    if(!dot) return null;
    ensureStatusDotStyles();
    var next = normalizeStatusDotState(state);
    var cfg = {
      ok: { title: 'Database connected', label: 'Database connected', bg: 'var(--grn)', shadow: '0 0 0 4px var(--grnd)', anim: 'none' },
      local: {
        title: 'Database unavailable (local cache)',
        label: 'Database unavailable (local cache)',
        bg: 'var(--amb)',
        shadow: '0 0 0 4px rgba(245,158,11,.10)',
        anim: 'padeswoodStatusDotPulse 1.8s ease-in-out infinite',
        ring: 'rgba(245,158,11,.14)',
        ringGrow: 'rgba(245,158,11,.20)',
        glow: 'rgba(245,158,11,.22)',
        glowGrow: 'rgba(245,158,11,.38)'
      },
      warn: {
        title: 'Database fault',
        label: 'Database fault',
        bg: 'var(--red)',
        shadow: '0 0 0 4px rgba(239,68,68,.12)',
        anim: 'padeswoodStatusDotPulse 1.4s ease-in-out infinite',
        ring: 'rgba(239,68,68,.16)',
        ringGrow: 'rgba(239,68,68,.24)',
        glow: 'rgba(239,68,68,.28)',
        glowGrow: 'rgba(239,68,68,.48)'
      },
      syncing: {
        title: 'Database reconnecting',
        label: 'Database reconnecting',
        bg: 'var(--amb)',
        shadow: '0 0 0 4px rgba(245,158,11,.12)',
        anim: 'padeswoodStatusDotPulse 1.8s ease-in-out infinite',
        ring: 'rgba(245,158,11,.12)',
        ringGrow: 'rgba(245,158,11,.18)',
        glow: 'rgba(245,158,11,.20)',
        glowGrow: 'rgba(245,158,11,.34)'
      }
    }[next];
    dot.classList.remove('local', 'warn', 'syncing', 'ok');
    dot.classList.add(next);
    dot.textContent = '';
    dot.style.display = 'inline-block';
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.borderRadius = '999px';
    dot.style.flexShrink = '0';
    dot.style.background = cfg.bg;
    dot.style.boxShadow = cfg.shadow;
    dot.style.transform = 'scale(1)';
    dot.style.willChange = cfg.anim && !isBasicPaletteMode() ? 'transform, box-shadow' : 'auto';
    if(cfg.anim && !isBasicPaletteMode()){
      dot.style.setProperty('--status-dot-ring-size', '4px');
      dot.style.setProperty('--status-dot-ring-size-grow', '7px');
      dot.style.setProperty('--status-dot-glow-size', '12px');
      dot.style.setProperty('--status-dot-glow-size-grow', '20px');
      dot.style.setProperty('--status-dot-ring-color', cfg.ring);
      dot.style.setProperty('--status-dot-ring-color-grow', cfg.ringGrow);
      dot.style.setProperty('--status-dot-glow-color', cfg.glow);
      dot.style.setProperty('--status-dot-glow-color-grow', cfg.glowGrow);
      dot.style.animation = cfg.anim;
    } else {
      dot.style.animation = 'none';
      dot.style.removeProperty('--status-dot-ring-size');
      dot.style.removeProperty('--status-dot-ring-size-grow');
      dot.style.removeProperty('--status-dot-glow-size');
      dot.style.removeProperty('--status-dot-glow-size-grow');
      dot.style.removeProperty('--status-dot-ring-color');
      dot.style.removeProperty('--status-dot-ring-color-grow');
      dot.style.removeProperty('--status-dot-glow-color');
      dot.style.removeProperty('--status-dot-glow-color-grow');
    }
    dot.setAttribute('aria-hidden', 'true');
    dot.title = cfg.title;
    dot.setAttribute('aria-label', cfg.label);
    return dot;
  }

  global.PadeswoodSuite = {
    storage: storage,
    supabase: supabaseApi,
    config: config,
    preferences: preferences,
    palette: palette,
    access: access,
    licence: licence,
    ui: {
      normalizeStatusDotState: normalizeStatusDotState,
      applyStatusDot: applyStatusDot
    }
  };
})(window);
