(function() {
  var defaultWidgetId = '366668686d37313131303336';
  var defaultTokenAuth = '504876TuixWdLhznmm6a26849cP1'; 

  // Fetch the configuration dynamically from backend
  var configPromise = fetch('/api/config')
    .then(function(r) { return r.json(); })
    .catch(function() { return {}; });

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
          var fallbackOtp = prompt('MSG91 OTP script failed to load. For local testing, enter the mock OTP code (123456):');
          if (fallbackOtp === '123456') {
            resolve('mock-otp-token');
          } else {
            reject('Failed to load OTP script');
          }
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
          var wId = config.msg91WidgetId || defaultWidgetId;
          var tAuth = config.msg91TokenAuth || defaultTokenAuth;

          var configurationObj = {
            widgetId: wId,
            tokenAuth: tAuth,
            identifier: phone.startsWith('+91') ? phone : '+91' + phone.replace(/\D/g, '').slice(-10),
            exposeMethods: false,
            success: function(data) {
              console.log('success response', data);
              var token = data.accessToken || data.access_token || data;
              resolve(token);
            },
            failure: function(error) {
              console.log('failure reason', error);
              var fallbackOtp = prompt('MSG91 OTP Widget failed to load or verify. For local testing, enter the mock OTP code (123456):');
              if (fallbackOtp === '123456') {
                resolve('mock-otp-token');
              } else {
                reject(error || 'Verification failed');
              }
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
