(function() {

  // Fetch the configuration dynamically from backend
  var configPromise = fetch('/api/config')
    .then(function(r) { return r.json(); })
    .catch(function() { return {}; });

  function findTokenInPayload(payload, visited) {
    if (!payload) return null;

    if (!visited) {
      visited = typeof WeakSet === 'function' ? new WeakSet() : [];
    }

    if (typeof payload === 'string') {
      var trimmed = payload.trim();
      if (!trimmed) return null;

      if (/^[A-Za-z0-9._-]{16,}$/.test(trimmed) && !/^\d{4,8}$/.test(trimmed)) {
        return trimmed;
      }

      if ((trimmed[0] === '{' && trimmed[trimmed.length - 1] === '}') || (trimmed[0] === '[' && trimmed[trimmed.length - 1] === ']')) {
        try {
          return findTokenInPayload(JSON.parse(trimmed), visited);
        } catch (_) {
          return null;
        }
      }

      return null;
    }

    if (typeof payload !== 'object') {
      return null;
    }

    if (typeof WeakSet === 'function') {
      if (visited.has(payload)) return null;
      visited.add(payload);
    } else {
      if (visited.indexOf(payload) !== -1) return null;
      visited.push(payload);
    }

    if (Array.isArray(payload)) {
      for (var i = 0; i < payload.length; i++) {
        var arrayToken = findTokenInPayload(payload[i], visited);
        if (arrayToken) return arrayToken;
      }
      return null;
    }

    var preferredKeys = [
      'access-token',
      'accessToken',
      'access_token',
      'authToken',
      'token',
      'verificationToken',
      'request_id'
    ];

    for (var j = 0; j < preferredKeys.length; j++) {
      var key = preferredKeys[j];
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        var directToken = findTokenInPayload(payload[key], visited);
        if (directToken) return directToken;
      }
    }

    var nestedKeys = ['data', 'message', 'response', 'result', 'payload'];
    for (var k = 0; k < nestedKeys.length; k++) {
      var nestedKey = nestedKeys[k];
      if (Object.prototype.hasOwnProperty.call(payload, nestedKey)) {
        var nestedToken = findTokenInPayload(payload[nestedKey], visited);
        if (nestedToken) return nestedToken;
      }
    }

    var keys = Object.keys(payload);
    for (var m = 0; m < keys.length; m++) {
      var deepToken = findTokenInPayload(payload[keys[m]], visited);
      if (deepToken) return deepToken;
    }

    return null;
  }

  function loadOtpScript(urls, configuration, resolve, reject) {
    var i = 0;
    function attempt() {
      var s = document.createElement('script');
      s.src = urls[i];
      s.async = true;
      s.onload = function() {
        if (typeof window.initSendOTP === 'function') {
          window.initSendOTP(configuration);
        }
      };
      s.onerror = function() {
        i++;
        if (i < urls.length) {
          attempt();
        } else {
          reject('Failed to load MSG91 OTP script from all available CDNs.');
        }
      };
      document.head.appendChild(s);
    }
    attempt();
  }

  window.msg91OTP = {
    verify: function(phone) {
      return new Promise(function(resolve, reject) {
        configPromise.then(function(config) {
          var wId = config.msg91WidgetId;
          var tAuth = config.msg91TokenAuth;

          if (!wId || !tAuth) {
            reject('MSG91 widget is not configured. Please contact support.');
            return;
          }

          var configurationObj = {
            widgetId: wId,
            tokenAuth: tAuth,
            identifier: phone.startsWith('+91') ? phone : '+91' + phone.replace(/\D/g, '').slice(-10),
            exposeMethods: false,
            success: function(data) {
              console.log('MSG91 success response', data);
              var token = findTokenInPayload(data);
              if (token) {
                console.log('MSG91 extracted verification token', token);
                resolve(token);
              } else {
                console.error('MSG91: could not extract token from', data);
                reject('Verification succeeded but token was missing. Please try again.');
              }
            },
            failure: function(error) {
              console.log('MSG91 failure reason', error);
              reject(error || 'Verification failed');
            }
          };

          loadOtpScript([
            'https://verify.msg91.com/otp-provider.js',
            'https://verify.phone91.com/otp-provider.js'
          ], configurationObj, resolve, reject);
        });
      });
    }
  };
})();
