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

  global.PadeswoodSuite = {
    storage: storage,
    supabase: supabaseApi,
    config: config,
    preferences: preferences,
    access: access,
    licence: licence
  };
})(window);
