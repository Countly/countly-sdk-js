import { defineConfig } from "cypress";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const codeCoverageTask = require('@cypress/code-coverage/task');
      codeCoverageTask(on, config);

      // Specs pull the SDK sources in directly, so instrumenting the spec bundle with istanbul
      // is what produces the coverage the task above collects. CYPRESS_COVERAGE=false skips it.
      if (config.env.coverage !== false) {
        const webpackPreprocessor = require('@cypress/webpack-preprocessor');
        on('file:preprocessor', webpackPreprocessor({
          webpackOptions: {
            mode: 'development',
            devtool: false,
            resolve: { extensions: ['.js'] },
            module: {
              rules: [{
                test: /\.js$/,
                exclude: /node_modules/,
                // the package is "type": "module", so plain .js would need fully specified imports
                type: 'javascript/auto',
                resolve: { fullySpecified: false },
                use: {
                  loader: 'babel-loader',
                  options: { presets: ['@babel/preset-env'], plugins: ['istanbul'] }
                }
              }]
            }
          },
          watchOptions: {}
        }));
      }

      // Include any other plugin code...
      const http = require('http');
      let server = null;
      let responseDelay = 0;
      let requests = [];

      on('task', {
        startServer() {
          return new Promise((resolve) => {
            requests = [];
            server = http.createServer((req, res) => {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

              if (req.method === 'OPTIONS') {
                res.writeHead(204);
                return res.end();
              }

              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                requests.push({ method: req.method, url: req.url, headers: req.headers, body });

                let payload = { result: 'Success' };

                if (req.url && req.url.indexOf('/o/sdk/content') !== -1) {
                  payload = {
                    html: 'http://test/_external/content?id=111&uid=tester&app_id=222',
                    geo: {
                      l: {
                        x: 282,
                        y: 56,
                        w: 303,
                        h: 300
                      },
                      p: {
                        x: 62,
                        y: 325.5,
                        w: 288,
                        h: 216
                      }
                    }
                  };
                }

                setTimeout(() => {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(payload));
                }, responseDelay);
              });
            });
            server.listen(9000, () => {
              console.log('Test server running on http://localhost:9000');
              resolve(null);
            });
          });
        },
        stopServer() {
          return new Promise((resolve) => {
            if (server) {
              server.close(() => {
                requests = [];
                console.log('Test server stopped');
                resolve(null);
              });
            } else {
              resolve(null);
            }
          });
        },
        setResponseDelay(ms) {
          responseDelay = ms;
          return null;
        },
        getRequests() {
          return requests;
        },
        clearRequests() {
          requests = [];
          return null;
        },
      });

      // IMPORTANT: Return the config object with any changed environment variables
      return config;
    },
  },
  userAgent: "abcd",
});
